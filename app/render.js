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
import { $ } from './dom.js';
import { withFocus, closeSheets } from './trap.js';
import { renderCards } from './card.js';
import { renderTimeline } from './timeline.js';
import { renderBalance } from './balance.js';
import { renderConstraints, renderSeasonAdjust } from './rules.js';
import { renderStrategy, refreshBudgetActuals } from './strategy.js';
import { renderRoster, renderLevels } from './roster-view.js';
import { renderStats, renderIssues, renderPlanTable, renderDayTotals } from './plan-view.js';
import { renderSetup, renderSentence } from './game-setup.js';
import { renderTeams, renderTabs, renderSettings } from './teams-view.js';
import { renderSeason } from './season-view.js';
import { state, save, editHappened, renderStorageWarning, computeAll, overridesDropped, saveJustFailed, takeFirstRunPending, game, gameLabel, activeColor } from './state.js';
import { track, bucketRoster } from './analytics.js';
import { retireUndo, flash } from './toast.js';
// storage.js is already in the boot graph (state.js imports it for
// `sanitizeSettings`/`DEFAULT_SETTINGS`), so this names no new request --
// it is the one allow-list `BACK_VIEWS` below is derived from (#23 review).
import { VIEWS } from './storage.js';

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
  /* #27: the sentence, and the announcement inside whichever sheet is open
     (`refreshSheetStatus`, game-setup.js) -- both read the just-solved plan,
     so both belong on the same key as `strategy`'s own re-plan below, in
     both AFTER_EDIT and PLAN_ONLY (decision 13). The buttons themselves are
     never rebuilt; only their text and `aria-label` are rewritten in place,
     which is what lets a sheet's own opener still take focus back on close. */
  sentence:    () => renderSentence(),
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
export const AFTER_EDIT = ['teams', 'tabs', 'sentence', 'strategy', 'budget', 'seasonadj', 'balance', 'stats', 'issues', 'plan', 'timeline', 'totals', 'cards'];
// as above but leaving the strategy body alone -- controls that repaint
// themselves in place (sliders, pickers) must not be rebuilt mid-interaction
export const PLAN_ONLY = ['tabs', 'sentence', 'budget', 'seasonadj', 'stats', 'issues', 'plan', 'timeline', 'totals', 'cards'];

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
  applyTint();
  renderStorageWarning();
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

/* ---------------- views + history + theme ---------------- */
/* Today is home (#23). `setView` is still the one way a screen changes, and
 * it is also the one place history is pushed, replaced and popped -- no
 * caller touches `history` directly.
 *
 * History is never deeper than one screen: `[Today]` or `[Today, X]`.
 * Opening a screen from Today pushes; opening one pushed screen from another
 * (P on Team, Add a team from the menu, the tour from Settings, the empty
 * roster's call to action) replaces the top entry instead of pushing, so
 * back always lands on Today. Going to Today from a pushed screen is a
 * `history.back()`, which is what makes the browser's own back button and
 * Android's gesture do the same thing this does: `popstate` paints whatever
 * screen its state names, Today when there is none. At boot -- and again
 * when onboarding finishes or a backup restores over the welcome screen,
 * which is the same "there was nothing to go back to" moment -- the current
 * entry is replaced with Today, and one entry is pushed on top of it if the
 * resolved screen is not Today, so back already works after the very first
 * reload. Welcome makes no entries at all: there is nothing to back out to
 * before there is a team.
 *
 * A reload resets this module's own `shown`/`pushed` to null/false, but not
 * the tab's session history -- boot has to read `history.state` to tell a
 * reload of a PUSHED screen apart from a genuinely fresh tab, or every reload
 * would repeat the "replace with Today, push the resolved screen" pair above
 * on top of the entry that pair already produced last time, stacking one
 * dead Today entry per reload (#23 review, unbounded `history.length`). When
 * the current entry already names a pushed (non-Today) screen, and the
 * screen boot resolves to is also not Today, that entry is relabelled in
 * place instead -- the entry beneath it is Today by construction, so there
 * is nothing left to establish. The one case that does NOT relabel is the
 * saved view and the live entry disagreeing about Today itself (e.g. another
 * tab wrote `state.view: 'today'` while this tab's own last entry was still
 * a pushed screen): trusting the entry there would leave `pushed` true with
 * Today on screen, and the next "go home" tap would fire a `history.back()`
 * with nothing real to go back from. That one case falls back to the plain
 * replace instead, same as a fresh tab.
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
 * Every screen is its own page, not one scrolling document, so a switch goes
 * back to the top. Without it a coach who was down at the timeline lands on a
 * shorter view already scrolled past the end of it. Instant, not smooth: a
 * smooth scroll racing the fade is a new thing to debug, and it is also the
 * honest behavior under reduced motion.
 *
 * `shown` starts null so the boot call scrolls nothing — there is no view
 * being left. `instant` no longer changes the animation (there is none to
 * suppress) but callers still pass it, and it still means "no scrolling
 * either": `printCard` uses it because `window.print()` fires in the same
 * tick. Returns undefined — `applyView` always paints synchronously, inside
 * this call, including going to Today from a pushed screen: that path
 * applies the repaint itself before it ever calls `history.back()` (#23
 * review, item A), rather than waiting for the `popstate` the `back()` call
 * raises a moment later, which only echoes bookkeeping that already
 * happened. */
let shown = null;
let pushed = false;   // true while the current entry is [Today, shown], not just [Today]

/* How many `history.back()` calls setView has issued that have not yet been
   echoed by their own `popstate` -- see the "today from a pushed screen"
   branch below. Almost always 0 or 1: a second `setView('today')` call before
   the first echo lands sees `pushed` already false and takes no action of
   its own (nothing left to go back from). */
let pendingSelfBack = 0;

export function setView(v, instant) {
  if (!state.onboarded) v = 'welcome';
  const from = shown;
  /* A fresh boot, or the "there was nothing to back out to" moment right
     after onboarding finishes or a restore replaces the welcome screen --
     but NOT every arrival at welcome: removing the last team from a PUSHED
     screen leaves that entry live (the `v === 'welcome'` branch below never
     touches history, and does not reset `pushed`), so a later return to a
     real screen from THAT welcome has something to replace rather than a
     fresh pair to establish. `pushed` is what tells the two apart. */
  const bootstrapping = from === null || (from === 'welcome' && !pushed);

  if (v === 'welcome') {
    // no entries touched -- there is nothing to back out to before there is
    // a team, and `pushed` is left exactly as it was (see the comment above)
  } else if (bootstrapping) {
    // `history.state`, not `pushed` (already reset to false by the reload
    // that got here) -- see the comment above for why, and for the one case
    // that deliberately does NOT take this branch.
    const already = history.state && history.state.view;
    if (already && already !== 'today' && v !== 'today') {
      history.replaceState({ view: v }, '');
      pushed = true;
    } else {
      history.replaceState({ view: 'today' }, '');
      pushed = false;
      if (v !== 'today') { history.pushState({ view: v }, ''); pushed = true; }
    }
  } else if (v === 'today') {
    if (pushed) {
      /* Applied HERE, synchronously, not left for the `popstate` this
         `history.back()` is about to raise. The old shape returned before
         painting anything, so `state.view` stayed at the screen being left
         (e.g. 'games') and `#view-games` stayed visible until the async
         popstate finally caught up -- a real, saved, mid-transition state a
         coach's own eyes (and a reload) could catch (#23 review, item A).
         `pendingSelfBack` marks this popstate, when it arrives, as an echo
         of work already done rather than a fresh instruction to apply. */
      pushed = false;
      shown = v;
      applyView(v, from);
      pendingSelfBack++;
      history.back();
      if (!instant && from && from !== v) window.scrollTo(0, 0);
      return;
    }
    // already on Today with nothing pushed: no history to touch
  } else if (pushed) {
    history.replaceState({ view: v }, '');
  } else {
    history.pushState({ view: v }, '');
    pushed = true;
  }

  shown = v;
  applyView(v, from);
  if (!instant && from && from !== v) window.scrollTo(0, 0);
}

addEventListener('popstate', (e) => {
  // captured before anything below reassigns `shown` -- `applyView` needs to
  // know what was on screen a moment ago, same as `setView`'s own `from`
  // (#23 review, third round: entering Games has to repaint it).
  const from = shown;
  if (pendingSelfBack > 0) {
    /* The echo of a `history.back()` `setView` already issued and already
       painted for, above. If nothing has navigated since, bookkeeping
       already matches this event and there is nothing left to do. If
       something HAS -- another `setView` call in the same tick, before this
       echo arrived -- that navigation is the one that should stand: a stale
       echo applying `e.state` on top of it would be the exact bug this
       counter exists to stop (a back-then-push racing its own popstate).
       Reasserting the current `shown` (through the ordinary push/replace
       path, since `instant` skips the scroll a genuine transition already
       had) repairs whatever position the browser actually landed the stale
       traversal on, rather than trusting what it reports. */
    pendingSelfBack--;
    if (shown === 'today' && !pushed) return;
    setView(shown, true);
    return;
  }
  /* A real, externally-triggered traversal: the physical back button, or
     Android's gesture. Runs through the same onboarding guard `setView`
     applies, or a stale pushed entry from BEFORE a coach removed their last
     team (still live in the session history -- see `bootstrapping` above)
     paints whatever screen it names instead of welcome (#23 review, item
     B). */
  if (!state.onboarded) {
    pushed = false;
    shown = 'welcome';
    applyView('welcome', from);
    return;
  }
  const v = (e.state && e.state.view) || 'today';
  pushed = v !== 'today';
  shown = v;
  applyView(v, from);
  window.scrollTo(0, 0);
});

/* The screen's own title, shown once, top-left of its header. `gameLabel` is
   the one game label (state.js) -- reused here exactly as Today reuses it for
   each of the day's games. The other three screens are just their name; an
   in-page heading that repeated it would say it twice. */
const SCREEN_TITLE = { team: 'Team', season: 'Season', settings: 'Settings' };
// every screen storage.js's own allow-list names, minus Today -- the one
// case with no back button and no title, because it is the one nothing goes
// back FROM (#23 review, item D: was a hand-typed second copy of VIEWS).
const BACK_VIEWS = VIEWS.filter(v => v !== 'today');
function screenTitle(v) {
  return v === 'games' ? gameLabel(game(), state.activeGame) : (SCREEN_TITLE[v] || '');
}

function applyView(v, from) {
  /* #27 decision 11: a sheet pushes no history entry of its own, so any
     screen change -- including a `popstate`, which is how the browser's
     back button and Android's gesture both arrive here -- has to close one
     first. This is the one function every path that changes the screen
     already runs through, so it is the one place this belongs. */
  closeSheets();
  /* The pre-paint stamp has done its job the moment this runs: from here the
     `hidden` flags below are the truth, and a `data-boot="welcome"` left on
     <html> would go on hiding the games view with an !important rule the
     property cannot outrank -- which is what a coach sees the instant they
     finish onboarding. Removed here rather than in the boot call because this
     is the one place view visibility is decided (index.html, app.css). */
  document.documentElement.removeAttribute('data-boot');
  state.view = v === 'welcome' ? 'today' : v;
  save();
  $('#view-welcome').hidden = v !== 'welcome';
  $('#view-today').hidden = v !== 'today';
  $('#view-games').hidden = v !== 'games';
  $('#view-team').hidden = v !== 'team';
  $('#view-season').hidden = v !== 'season';
  $('#view-settings').hidden = v !== 'settings';
  // the chrome is meaningless before there is a team
  document.querySelector('.bar').style.display = v === 'welcome' ? 'none' : '';
  document.querySelector('.foot').style.display = v === 'welcome' ? 'none' : '';
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
     next to Share (see index.html). `#print` still exists, so `card.js`'s
     `[data-needs-card]` sweep and `test/print-gate.test.js`'s handler
     discovery both still find it, and the `p` shortcut still clicks it from
     anywhere: `printCard` does `setView('games', true)` first, so the key
     goes to the card rather than dying on the four screens the button is not
     rendered on. */
  /* One header per screen state (N4, N5, C1): Today's own -- the team button,
     the keys hint, the gear -- lives in `#barToday`; the other four share
     `#barBack`, an icon-only "Back to Today" and the title. Both are inside
     the same `.bar` shell so there is still exactly one header element, the
     same one every view has always shared. */
  const onBack = BACK_VIEWS.includes(v);
  const today = $('#barToday'), back = $('#barBack');
  if (today) today.hidden = v !== 'today';
  if (back) back.hidden = !onBack;
  /* #69 decision 5: the games view has its own in-page `h1` (`#gameTitle`),
     so `#barTitle` -- otherwise a second copy of the same text -- is hidden
     there outright with the `hidden` attribute rather than visually clipped:
     a clipped-but-present box still answers `checkVisibility()` true (that
     call only asks about `display: none` and detachment, not size), so a
     screen reader's rotor read "Panthers" twice even though nothing was
     visibly doubled on screen. It keeps its text and shows as before on the
     other back screens. */
  const barTitleEl = $('#barTitle');
  if (barTitleEl) {
    if (onBack) barTitleEl.textContent = screenTitle(v);
    barTitleEl.hidden = v === 'games';
  }
  /* #23 review, third round: entering Games has to show what `state` says,
     not whichever game the screen last painted. Everything above this line
     only ever toggled visibility and wrote the header title -- the opponent
     input, the card and the rest of the Games screen's own content are
     `render()`'s job, and nothing here called it. Today's game entries,
     `printCard`'s `setView('games', true)` off Today, `startTour`'s own copy
     of that same line, and `popstate` landing on games all go through this
     one function, so this is the one place that can own "the screen shows
     what state says" without a `renderAll()` sprinkled after each of those
     calls. Run last, not first: `render()` reads `state.view` (`renderTabs`'s
     own header-title branch among others) and it has to see 'games', which
     `state.view = v` above has by now already set.

     Gated on a REAL transition (`from !== 'games'`) so a same-screen
     `setView('games', ...)` -- `viewRefresh`'s default undo refresh calls
     `setView(state.view)` on every undoable edit, and most of those happen
     while already on Games -- does not repaint everything a second time; the
     efficiency review already flagged that shape of double work once. A
     caller with its own reason to always repaint regardless of which screen
     (`restoreBackup`'s `show()`, a wholesale state replace) keeps its own
     `renderAll()` call same as before; the callers that only needed one
     because entering Games needed it (`addGame`, both onboarding paths) had
     theirs removed, now that this covers them.

     ALSO excludes `from === null` -- the very first `setView` call of the
     session, boot's own (app.js). Boot's own explicit `renderAll()` runs a
     few lines after it regardless of which screen was resolved, because
     Today, Team, Season, Settings and Welcome never got a render out of
     `applyView` either; a coach who left the app on Games -- probably the
     most common single case there is -- would otherwise pay for two full
     renders on every reload rather than the one every other screen already
     paid. */
  if (v === 'games' && from !== 'games' && from !== null) render();
  /* #26 decision 6: `renderTabs` skips building Today's passes while another
     screen is on show, so a real transition INTO Today has to repaint them
     here or a coach who edited a game and tapped back would see whatever the
     passes looked like before the edit. `from !== null` excludes boot's own
     landing on Today the same way the games branch above does: boot's own
     `renderAll()` a few lines later covers it, by which point `state.view`
     is already 'today'. */
  if (v === 'today' && from !== 'today' && from !== null) render('tabs');
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
    ?.setAttribute('content', resolved === 'dark' ? '#0B0B0C' : '#F4F4F6');
  /* #22: the Appearance group replaces the icon cycler and its `#themeNow`
     read-back -- a three-way choice reads better as three named buttons than
     as a button you press to find out what it will do next. Marked the same
     way `#maxSubsSeg` marks its current option (`.on`, `aria-pressed`); this
     stays the one place `auto` is resolved and `data-theme` / `theme-color`
     are written, same as before. */
  const seg = $('#themeSeg');
  if (seg) {
    for (const b of seg.querySelectorAll('button[data-theme]')) {
      const on = b.dataset.theme === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
}

/* #25: the active team's color, painted the same way `applyTheme` paints
   `state.ui.theme` -- one place that reads the state and writes the
   attribute tokens.css keys its tint blocks off. `activeColor()` (state.js)
   is the one place that value is derived, shared with the Settings row and
   picker (teams-view.js), and it is already sanitized (storage.js's
   `sanitize` runs `settings.color` through `COLORS.includes`), so no
   re-validation belongs here. `graphite` removes the attribute rather than
   stamping it, matching the pre-paint script in index.html (item 8) and the
   spec's "removing it for graphite is fine". */
export function applyTint() {
  const color = activeColor();
  if (color === 'graphite') document.documentElement.removeAttribute('data-tint');
  else document.documentElement.setAttribute('data-tint', color);
}
