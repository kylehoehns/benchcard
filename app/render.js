/* ================================================================== *
 * render.js -- the dispatcher, the scheduler, the two views, the theme
 *
 * The last thing out of app.js, and deliberately so: every view module
 * takes `render` / `renderAll` / `soon` / `setView` through its own
 * `init*` function rather than importing them, so this file can import
 * all fifteen renderers without closing the graph into a cycle. Nothing
 * here may be imported *by* a view -- if a module needs to repaint, it
 * gets the callback handed to it at boot.
 *
 * `SECTIONS` is the whole repaint vocabulary: a key per independently
 * repaintable region, and the three lists below name the subsets an edit
 * is allowed to touch.
 * ================================================================== */
import { icon } from './icons.js';
import { $ } from './dom.js';
import { withFocus } from './trap.js';
import { renderCards } from './card.js';
import { renderTimeline } from './timeline.js';
import { renderBalance } from './balance.js';
import { renderConstraints, renderSeasonAdjust } from './rules.js';
import { renderStrategy, refreshBudgetActuals } from './strategy.js';
import { renderRoster, renderLevels } from './roster-view.js';
import { renderStats, renderIssues, renderPlanTable, renderDayTotals } from './plan-view.js';
import { renderSetup, renderAvail } from './game-setup.js';
import { renderTeams, renderTabs, renderSettings } from './teams-view.js';
import { renderSeason } from './season-view.js';
import { state, save, editHappened, renderStorageWarning, computeAll, overridesDropped, saveJustFailed, takeFirstRunPending } from './state.js';
import { track, bucketRoster } from './analytics.js';
import { retireUndo, flash } from './toast.js';

/* ------------------------------------------------------------------ *
 * rendering
 *
 * Sections repaint independently. A blanket repaint destroys whatever the
 * coach is currently typing into -- on a phone that dismisses the keyboard
 * mid-word -- so an edit never repaints its own container, and anything that
 * slips through is caught by the focus restore below.
 * ------------------------------------------------------------------ */
const SECTIONS = {
  roster:      () => renderRoster(),
  teams:       () => renderTeams(),
  tabs:        () => renderTabs(),
  setup:       () => renderSetup(),
  avail:       () => renderAvail(),
  strategy:    () => renderStrategy(),
  // in-place only: writes what the plan actually gives onto the budget rows
  // without rebuilding a slider the coach may have hold of
  budget:      () => refreshBudgetActuals(),
  balance:     () => renderBalance(),
  /* in-place only: the meters live inside the roster rows, and rebuilding
     those rows to change one meter replayed the list's entrance animation on
     every row. Same rule as `budget` above -- do not rebuild a control the
     coach may still have hold of. */
  levels:      () => renderLevels(),
  constraints: () => renderConstraints(),
  /* in-place only, and the one thing in the rules section that depends on a
     SOLVE: what the season carryover did to each target, and what the plan
     really gives. `constraints` itself cannot join the lists below -- the rule
     editor holds a select and two number inputs a coach may be part-way
     through -- so the panel refreshes on its own. */
  seasonadj:   () => renderSeasonAdjust(),
  stats:       () => renderStats(),
  issues:      () => renderIssues(),
  plan:        () => renderPlanTable(),
  timeline:    () => renderTimeline(),
  totals:      () => renderDayTotals(),
  cards:       () => renderCards(),
  /* The season ledger at the foot of the roster page. Not in AFTER_EDIT or
     PLAN_ONLY: nothing a coach edits about today changes what is already
     filed. It repaints on a full render, which is what "New day" and a
     deleted game both do. */
  season:      () => renderSeason(),
};
const ALL = Object.keys(SECTIONS);
// everything a plan change touches, minus the containers a coach types into
export const AFTER_EDIT = ['teams', 'tabs', 'strategy', 'budget', 'seasonadj', 'balance', 'stats', 'issues', 'plan', 'timeline', 'totals', 'cards'];
// as above but leaving the strategy body alone -- controls that repaint
// themselves in place (sliders, pickers) must not be rebuilt mid-interaction
export const PLAN_ONLY = ['tabs', 'budget', 'seasonadj', 'stats', 'issues', 'plan', 'timeline', 'totals', 'cards'];

export function render(...keys) {
  if (!state.onboarded) return;
  const which = keys.length ? keys : ALL;
  computeAll();
  /* `computeAll` is where a rotation that no longer matches the coach's hand
     swaps drops them (see `syncOverrides`). It is silent by design -- pure
     bookkeeping over the day's games -- so the one place that can say so out
     loud is here, once, after all of them have been checked. */
  if (overridesDropped()) flash('Rotation changed. The swaps you made by hand were cleared.');
  save();
  /* Same shape as `overridesDropped()` one line above, for the same kind of
     event: a state change the coach has to be told about once. `save()` has
     just written the banner at the top of `.app`, and on the Team page the coach
     who added the player that filled the quota is focused on the row at the
     FOOT of the list -- 1277px below it, measured. The banner stays as the
     standing record ("this is still true"); the toast is the one that reaches
     where they are looking. It carries the banner's exact sentence, so the
     two surfaces cannot disagree about what went wrong. */
  const failed = saveJustFailed();
  if (failed) flash(failed);
  applyTheme();
  renderStorageWarning();
  $('#rcount').textContent = state.players.length ? `(${state.players.length})` : '';
  /* Here rather than in a section of its own: the settings page's team heading
     has to be right the moment the cog is tapped, and the edit that changes it
     -- typing in the roster's team name field -- repaints `cards` and nothing
     else. A single textContent write on every render is cheaper than a section
     that would have to be added to three lists to stay in step. */
  renderSettings();
  withFocus(() => { for (const k of which) SECTIONS[k](); });
}

export const renderAll = () => render();

let timer = null;
let pending = new Set();
export function soon(...keys) {
  /* Only edit handlers get here, so this is the one place that can tell "the
     coach changed something" from "the app repainted". The recovery notice
     says "check the roster"; once the coach has edited, they have, and it
     used to sit there through a whole rebuild from first-run pointing at a
     roster they had just typed. */
  editHappened();
  /* Same signal, second reader: a pending undo would restore a snapshot taken
     before this edit and take it back down with it. */
  retireUndo();
  /* Same signal, third reader, and the whole of A35's DECISION 1: a sample
     team loads without counting anything, and the first edit is what turns it
     into a roster worth counting -- the coach has just said it is theirs. The
     size is read HERE rather than at load, so a coach who trims the sample to
     eight is counted as eight. */
  if (takeFirstRunPending()) track('first_run_complete', { roster: bucketRoster(state.players.length) });
  for (const k of (keys.length ? keys : AFTER_EDIT)) pending.add(k);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const keys2 = [...pending];
    pending = new Set();
    render(...keys2);
  }, 140);
}

/* ---------------- views + theme ---------------- */
/* Games ⇄ Team is the one navigation in the app, and the swap is a plain
 * flip of two `hidden` flags. The incoming view's own `.view { animation:
 * viewIn }` — fade up, 7px — is the whole transition, and it is enough.
 *
 * This used to run through `document.startViewTransition`, and that cost four
 * rounds of debugging one bug reported from a phone: the top bar dissolving
 * mid-swap. Three mechanisms were found and correctly fixed and it still did
 * not look right; the fourth, proven, is that WebKit paints
 * `::view-transition-group(root)` on top of every named group, burying the
 * bar's own snapshot for the whole 260ms. That needed a clip-path workaround
 * fed by a layout measurement taken on every tap, and it could not be
 * generalised to `#actionbar`, which had the identical bug. All the API ever
 * bought was the *outgoing* view cross-fading out. That is a bad trade, so it
 * is gone, along with `--vt-bar`, `data-vt` and the `view-transition-name`s.
 * Do not bring it back, and do not reimplement the cross-fade by hand with two
 * stacked views — that is the same complexity by another route.
 *
 * Games and Team are two unrelated pages, not one scrolling document, so a
 * switch goes back to the top. Without it a coach who was down at the timeline
 * lands on a shorter view already scrolled past the end of it. Instant, not
 * smooth: a smooth scroll racing the fade is a new thing to debug, and it is
 * also the honest behaviour under reduced motion.
 *
 * `shown` starts null so the boot call scrolls nothing — there is no view
 * being left. `instant` no longer changes the animation (there is none to
 * suppress) but callers still pass it, and it still means "no scrolling
 * either": `printCard` uses it because `window.print()` fires in the same
 * tick. Returns undefined — `applyView` is synchronous, so the incoming view
 * is on screen and focusable by the time this returns. */
let shown = null;

export function setView(v, instant) {
  if (!state.onboarded) v = 'welcome';
  const from = shown;
  shown = v;
  applyView(v);
  if (!instant && from && from !== v) window.scrollTo(0, 0);
}

function applyView(v) {
  /* The pre-paint stamp has done its job the moment this runs: from here the
     `hidden` flags below are the truth, and a `data-boot="welcome"` left on
     <html> would go on hiding the games view with an !important rule the
     property cannot outrank -- which is what a coach sees the instant they
     finish onboarding. Removed here rather than in the boot call because this
     is the one place view visibility is decided (index.html, app.css). */
  document.documentElement.removeAttribute('data-boot');
  state.view = v === 'welcome' ? 'games' : v;
  save();
  $('#view-welcome').hidden = v !== 'welcome';
  $('#view-games').hidden = v !== 'games';
  $('#view-team').hidden = v !== 'team';
  $('#view-season').hidden = v !== 'season';
  $('#view-settings').hidden = v !== 'settings';
  // the chrome is meaningless before there is a team
  document.querySelector('.bar').style.display = v === 'welcome' ? 'none' : '';
  document.querySelector('.foot').style.display = v === 'welcome' ? 'none' : '';
  /* The team strip is chrome too now, and its visibility HAS to be decided
     here rather than in `renderTeams`: `render()` returns early when
     `onboarded` is false, and removing the last team is exactly the path that
     clears that flag. A renderer-owned flag never ran, so the strip sat above
     first-run still naming the team that had just been deleted. */
  const tt = $('#teamtabs');
  if (tt) tt.hidden = v === 'welcome';
  const ab = document.querySelector('#actionbar');
  if (ab) ab.hidden = v !== 'games' || !state.onboarded;
  /* NOTHING here touches `#print`, and that is the point. This function used to
     set `$('#print').hidden = v !== 'games'` -- Print belongs to the game
     screen, and standing over Settings or Team it read as "print THIS". But
     `hidden` takes the button out of the bar's flex flow, so the entire
     right-hand cluster reflowed and the cog jumped into the corner every time
     the coach opened Settings: a visible jolt on the most ordinary navigation
     in the app, and one only fixable in place by reserving dead space or
     anchoring the cog, both workarounds for a button that should not be in the
     bar at all. So `#print` moved into the games view itself, beside the card
     next to Share (see index.html). The bar is now IDENTICAL on all four views
     and has no view-dependent member left but `#viewnav`'s `on` class.
     `#print` still exists, so `card.js`'s `[data-needs-card]` sweep and
     `test/print-gate.test.js`'s handler discovery both still find it, and the
     `p` shortcut still clicks it from anywhere: `printCard` does
     `setView('games', true)` first, so the key goes to the card rather than
     dying on the three views the button is not rendered on. */
  /* The nav buttons carry `aria-current` too, and the comment below used to
     say why they did not. Its words were: "the nav buttons get theirs from
     `.on` inside a segmented control a screen reader reads as a group". That
     ground was checked in a browser and it does not hold. `#viewnav` is
     `<nav class="seg">` with **no `role` and no `aria-label`** -- the group
     that sentence leans on is `#stratseg`'s `role="group"`, a different
     element. So a screen reader met three sibling buttons, one of them
     coloured, and was told nothing at all about which view the coach was on;
     `.on` is a colour, and it is the only thing that changed.
     `aria-current="page"`, not `aria-pressed`: this is navigation, and it
     keeps the cog below and the team tabs in `teams-view.js` -- which have
     always done it -- speaking with one voice. */
  for (const b of document.querySelectorAll('#viewnav button')) {
    const on = b.dataset.view === v;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  /* Settings has no tab -- the bar's one remaining slot went to the Season tab
     -- so the cog carries the "you are here" state itself, in the same
     attribute the three tabs above now use. */
  const cog = $('#settingsBtn');
  if (cog) {
    cog.classList.toggle('on', v === 'settings');
    if (v === 'settings') cog.setAttribute('aria-current', 'page');
    else cog.removeAttribute('aria-current');
  }
}

/* `auto` has to be resolved to a real value here. Removing the attribute does
   not mean "follow the phone" -- there is no prefers-color-scheme rule in the
   sheet, the dark palette hangs off [data-theme="dark"] alone -- so it meant
   light, and every coach on a dark-mode phone got the light app until they
   found the theme button. The query is watched too: iOS flips it on a
   schedule, mid-game. */
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
darkQuery.addEventListener('change', () => { if (state.ui.theme === 'auto') applyTheme(); });

export function applyTheme() {
  const t = state.ui.theme;
  const resolved = t === 'auto' ? (darkQuery.matches ? 'dark' : 'light') : t;
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0B0A09' : '#F6F4F0');
  const tb = $('#theme');
  if (tb) {
    tb.textContent = '';
    tb.append(icon(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'contrast', { size: '1.05em' }));
    tb.title = `Theme: ${t}`;
  }
  /* The button used to sit in the top bar, where an icon that cycles is fine
     because it is right there to try. In a settings list it is not: a row that
     says "Theme" beside a glyph does not say what the theme currently IS. So
     the row carries the value in words and the button stays the cycler. */
  const now = $('#themeNow');
  if (now) now.textContent = t === 'auto' ? 'automatic' : t === 'dark' ? 'dark' : 'light';
}
