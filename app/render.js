/* ================================================================== *
 * render.js -- the dispatcher, the two views, the theme
 *
 * The last thing out of app.js, and deliberately so: every view module
 * takes `render` / `renderAll` / `edit` / `setView` through its own
 * `init*` function rather than importing them, so this file can import
 * all fifteen renderers without closing the graph into a cycle. Nothing
 * here may be imported *by* a view -- if a module needs to repaint, it
 * gets the callback handed to it at boot.
 *
 * `SECTIONS` is the whole repaint vocabulary: a key per independently
 * repaintable region. #122: which of them an edit is allowed to touch, and
 * when, moved to `AFTER_EDIT`/`PLAN_ONLY` and the `EDITS` table in
 * `app/edit.js` -- this file no longer schedules a repaint itself, it only
 * hands `edit.js` the painter (`render`) and `retireUndo` to call, through
 * `initEdits` below.
 * ================================================================== */
import { $ } from './dom.js';
import { withFocus, closeSheets } from './trap.js';
import { renderCards } from './card.js';
import { renderTimeline, applyGameView } from './timeline.js';
import { renderBalance } from './balance.js';
import { renderConstraints, renderSeasonAdjust } from './rules.js';
import { renderStrategy, refreshBudgetActuals } from './strategy.js';
import { renderRoster, renderLevels, resetEditMode } from './roster-view.js';
import { renderSummary, renderIssues, renderPlanTable, renderDayTotals } from './plan-view.js';
import { renderSetup, renderSentence } from './game-setup.js';
import { renderTeams, renderTabs, renderSettings, renderResumeBar } from './teams-view.js';
import { renderSeason, seasonGames } from './season-view.js';
import { state, save, renderStorageWarning, computeAll, overridesDropped, saveJustFailed, activeColor, hasGames } from './state.js';
import { retireUndo, flash } from './toast.js';
import { initEdits } from './edit.js';
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
  // #34 decision 6/7: not in AFTER_EDIT or PLAN_ONLY -- nothing a coach can
  // edit changes which game is part-played. Painted by `applyView` on a real
  // transition into Today, and by boot's own `renderAll()` on first paint.
  resume:      () => renderResumeBar(),
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
  /* in-place only: the one meter on screen is the one in the open player
     sheet, and rebuilding the sheet to change it would take the control out
     from under the thumb that is dragging it. Same rule as `budget` above --
     do not rebuild a control the coach may still have hold of. The actions
     group below the roster is rebuilt, because the reset row appears there
     the moment somebody leaves the default level. */
  levels:      () => renderLevels(),
  constraints: () => renderConstraints(),
  /* in-place only, and the one thing in the rules section that depends on a
     SOLVE: what the season carryover did to each target, and what the plan
     really gives. `constraints` itself cannot join the lists below -- the rule
     editor holds a select and two number inputs a coach may be part-way
     through -- so the panel refreshes on its own. */
  seasonadj:   () => renderSeasonAdjust(),
  // #29 decision 6: replaces the stat tiles -- renamed, not just re-pointed,
  // so every caller (below, and `gamemode.js`) has to follow deliberately
  // rather than silently keep working under a name that no longer matches.
  summary:     () => renderSummary(),
  issues:      () => renderIssues(),
  plan:        () => renderPlanTable(),
  timeline:    () => renderTimeline(),
  totals:      () => renderDayTotals(),
  cards:       () => renderCards(),
  /* #29 decisions 5 and 7: which of `#timeline` / `#sheet` shows, and the
     `#viewSeg` sync -- after `cards` so a just-solved plan's blocked/ok state
     (which `cards` itself does not decide, but both read off the same fresh
     `plans[state.activeGame]` `computeAll` produced this render) is settled
     before this reads it. */
  gameview:    () => applyGameView(),
  /* The season ledger at the foot of the roster page. Not in AFTER_EDIT or
     PLAN_ONLY: nothing a coach edits about today changes what is already
     filed. It repaints on a full render, which is what "New day" and a
     deleted game both do. */
  season:      () => renderSeason(),
};
const ALL = Object.keys(SECTIONS);
/* #126: the game screen's own sections -- everything that reads a game or a
   day's plan. `hasGames()` is the one question that decides whether they run
   at all; a guard in each of these fourteen renderers would be fourteen
   places to keep the answer in step with `hasGames()` instead of one. */
const GAME_SECTIONS = new Set(['setup', 'sentence', 'strategy', 'budget', 'balance',
  'constraints', 'seasonadj', 'summary', 'issues', 'plan', 'timeline', 'totals',
  'cards', 'gameview']);

export function render(...keys) {
  if (!state.onboarded) return;
  const which = (keys.length ? keys : ALL).filter(k => hasGames() || !GAME_SECTIONS.has(k));
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
  /* #126: "Show me around again" -- the Benchcard zone, not per-team policy
     (test/settings.test.js reads every id `renderSettings` itself touches as
     exactly the per-team list, so this stays out of that function). The tour
     walks the game screen, unreachable with no games. */
  const tourBtn = $('#helpTourSettings');
  if (tourBtn) tourBtn.hidden = !hasGames();
  withFocus(() => { for (const k of which) SECTIONS[k](); });
  /* #33 decisions 3-5: last, because the bar title is a COPY of words this
     function has just written. `applyView` syncs it too, but it has to run
     before the paint below (it is what makes the view visible in the first
     place), so on a real transition into a game its copy is of the game the
     screen was showing a moment ago -- the opponent's name one game behind.
     It also keeps the copy honest when nothing navigated at all: the team's
     name changes as a coach types it into the roster.

     `syncBarTitle` is two `textContent` touches and an attribute, cheap
     enough to run every time. Re-measuring the overlay's box is not, so that
     goes through `measureBarSideIfHeaderChanged`, which pays for the rects
     only when the words actually moved -- see its own comment. */
  syncBarTitle(state.view);
  measureBarSideIfHeaderChanged(state.view);
}

export const renderAll = () => render();

/* #122: every edit's save/repaint/hooks path now runs through `edit(kind)`
   (`app/edit.js`), which replaces this module's own `soon()`. `render` is
   still the painter and `retireUndo` is still toast.js's own -- both are
   handed to `edit.js` once, here, the same `init*` shape every view module
   takes its own callbacks through. */
initEdits({ paint: render, retireUndo });

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
 * generalized to `#actionbar`, which had the identical bug. All the API ever
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

/* #126: the game screen needs a game -- both the real destination and the
   `popstate` echo of a stale `{ view: 'games' }` history entry fold through
   here, so there is one place, not two, that decides "games" means "today"
   when the team has none. */
const foldView = v => (v === 'games' && !hasGames()) ? 'today' : v;

export function setView(v, instant) {
  if (!state.onboarded) v = 'welcome';
  v = foldView(v);
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
  const v = foldView((e.state && e.state.view) || 'today');
  pushed = v !== 'today';
  shown = v;
  applyView(v, from);
  window.scrollTo(0, 0);
});

// every screen storage.js's own allow-list names, minus Today -- the one
// case with no back button and no title, because it is the one nothing goes
// back FROM (#23 review, item D: was a hand-typed second copy of VIEWS).
const BACK_VIEWS = VIEWS.filter(v => v !== 'today');

/* #33: the `<main>` each view owns, keyed the same as `v` everywhere else in
   this file. `welcome` is deliberately absent -- the bar is hidden there
   (below), so there is nothing for the bar title to mirror. */
const VIEW_MAIN_ID = { today: 'view-today', games: 'view-games', team: 'view-team', season: 'view-season', settings: 'view-settings' };

/* #33 decisions 3, 5 and 6: `#barTitle` is a copy of the view's own large
   title, read from the DOM at collapse time rather than hand-typed --
   hand-typing it made Team's bar say "Team" while its large title said the
   team's own name. Settings has no large title (`light-settings.png`), so
   its bar title is the static `data-bar-title` on its `<main>` and stays
   exposed to assistive tech; the four views with a `[data-large-title]` of
   their own hide the copy from the accessibility tree so exactly one `h1`
   per screen is announced, as before. */
function syncBarTitle(v) {
  const barTitleEl = $('#barTitle');
  if (!barTitleEl) return;
  const mainId = VIEW_MAIN_ID[v];
  const main = mainId && document.getElementById(mainId);
  const largeTitle = main && main.querySelector('[data-large-title]');
  if (largeTitle) {
    barTitleEl.textContent = largeTitle.textContent;
    barTitleEl.setAttribute('aria-hidden', 'true');
  } else {
    barTitleEl.textContent = (main && main.dataset.barTitle) || '';
    barTitleEl.setAttribute('aria-hidden', main ? 'false' : 'true');
  }
}

/* #33 decision 1: one `IntersectionObserver`, re-targeted on every view
   change rather than one per view -- `requests` is pinned at 39 (Survey), so
   this stays inside `render.js` instead of a module of its own. It watches
   whichever `[data-large-title]` element the CURRENT view owns and toggles
   `.bar.title-in` the moment that element leaves the viewport, which is what
   fades the bar title in (app.css). Settings owns no large title to watch --
   its bar title is static and shown at all times (decision 5), so it gets
   `.title-in` unconditionally instead of an observer with nothing to watch.

   `rootMargin` is the whole of "without disappearing" (L4, AC1, NN/g). The
   bar floats OVER the content now, so a plain `threshold: 0` observer does
   not fire until the large title has left the viewport entirely -- by which
   point it has spent a whole bar's height hidden BEHIND the bar with the
   small title not yet faded in, and the screen has no title at all for that
   stretch. Shrinking the observer's root by the bar's own height moves the
   hand-off to the moment the large title slides under the bar, so one title
   is always on screen. It has to be a pixel number, and the bar's height is
   not a constant (it wraps to two rows at 320px with a 32px root), so it is
   measured here and the observer is rebuilt by `initBarMeasurements`'s
   `ResizeObserver` whenever that height changes. */
let titleObserver = null;
let titleView = null;
let titleRootTop = null;
function watchLargeTitle(v) {
  if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
  titleView = v;
  titleRootTop = null;
  const bar = document.querySelector('.bar');
  if (!bar) return;
  if (v === 'settings') { bar.classList.add('title-in'); return; }
  bar.classList.remove('title-in');
  const mainId = VIEW_MAIN_ID[v];
  const main = mainId && document.getElementById(mainId);
  const target = main && main.querySelector('[data-large-title]');
  if (!target) return;
  titleRootTop = Math.round(bar.getBoundingClientRect().height);
  titleObserver = new IntersectionObserver((entries) => {
    for (const e of entries) bar.classList.toggle('title-in', !e.isIntersecting);
  }, { threshold: 0, rootMargin: `-${titleRootTop}px 0px 0px 0px` });
  titleObserver.observe(target);
}

/* #33 decision 4: the overlay's width is measured, not guessed -- a fixed
   percentage clips Team's right-hand pair (Edit + `+`, ~102px at 390px) on
   narrow phones. Reads whichever half of the bar is currently on screen
   (`#barToday` or `#barBack`) and writes the wider of its leading and
   trailing control clusters, split at `.spacer`, as `--bar-side` on `.bar`
   itself -- a custom property set there is inherited by `.bar-title`, its
   child, for free.

   What is measured is each cluster's DISTANCE FROM THE BAR'S OWN EDGE, not
   the sum of the buttons' widths. The overlay is absolutely positioned, so
   its `inset` is resolved against `.bar`'s PADDING box, while the buttons
   start one `clamp(.85rem, 2.6vw, 1.5rem)` of side padding inside that --
   and on Today the trailing cluster is two buttons with an `.8rem` flex gap
   between them, which a sum of widths does not see either. Both gaps were
   missing from the old formula, which put the overlay's box about 6px on top
   of the back button at 390px and about 13px on top of `New day`. An edge
   distance has no such arithmetic to get wrong: whatever padding, gap or
   margin sits between the bar's edge and the outermost control is inside the
   number by construction. */
function measureBarSide() {
  const bar = document.querySelector('.bar');
  if (!bar) return;
  const today = $('#barToday'), back = $('#barBack');
  const half = today && !today.hidden ? today : (back && !back.hidden ? back : null);
  if (!half) return;
  const barRect = bar.getBoundingClientRect();
  let leading = 0, trailing = 0, afterSpacer = false;
  for (const child of half.children) {
    if (child.classList.contains('spacer')) { afterSpacer = true; continue; }
    const r = child.getBoundingClientRect();
    // A `popover` (`#teamMenu`) and every `hidden` action measure 0x0 while
    // closed; counting one would push the overlay off a cluster that is not
    // on screen.
    if (r.width === 0) continue;
    if (afterSpacer) trailing = Math.max(trailing, barRect.right - r.left);
    else leading = Math.max(leading, r.right - barRect.left);
  }
  bar.style.setProperty('--bar-side', `${Math.max(leading, trailing)}px`);
}

/* `measureBarSide` is a forced synchronous layout: a `getBoundingClientRect`
   on `.bar` and one per control in the half on screen, then a style write.
   That is fine where a screen change or a resize triggers it, but `render()`
   calls it too (see the comment at the bottom of `render`), and `render` is
   the hot path -- it runs off the 140ms edit queue and from about twenty call
   sites, most of them edits the header cannot see: a budget slider settling,
   a rule's number, a card regenerate.

   So the end-of-render call goes through here, which compares the words the
   bar is currently showing against the words it was showing the last time the
   side was measured, and only pays for the rects when they differ. Those
   reads are `textContent` -- no layout. Two strings, because two things move
   the boundary: the overlay's own text, and `#teamBtn`'s label, which IS
   Today's leading control (a coach renaming the team in the roster widens it).
   The view is in the key as well so that arriving on a screen whose title
   happens to match the last one still measures -- the controls either side of
   the overlay differ per screen even when the words do not.

   Only `render`'s call is gated. `applyView` and the `ResizeObserver` call
   `measureBarSide` directly, because a rotation or a text-size change moves
   the boundary without changing a single character. */
let barSideKey = null;
function measureBarSideIfHeaderChanged(v) {
  const barTitleEl = $('#barTitle'), teamBtn = $('#teamBtn');
  const key = `${v}\0${barTitleEl ? barTitleEl.textContent : ''}\0${teamBtn ? teamBtn.textContent : ''}`;
  if (key === barSideKey) return;
  barSideKey = key;
  measureBarSide();
}

/* #33 decision 14: `html`'s `scroll-padding-top`/`-bottom` need a NUMBER, not
   a guess -- the bar wraps to two rows at 320px with a 32px root, so its
   height is not a constant, and the action bar's own height depends on
   whether it is showing at all. Written onto `<html>`, not `.bar`, so a
   custom property set on one floating element reaches the scroll container
   that reads it -- a property set on `.bar` itself would not reach a
   sibling. The explicit `!ab.hidden` check below does not lean on a
   ResizeObserver firing at the exact moment `[hidden]` flips (untested
   here): `measureChromeHeights` also runs straight out of `applyView`,
   which sets `#actionbar.hidden` itself, so the value is right on the same
   task regardless of what the observer does with it after. */
/* #34 decision 11: `--ab-h` is "the bottom floating bar", not `#actionbar`
   specifically -- `#resumeBar` is the other one, and the two are never both
   showing (one is the game screen's, the other is Today's), so whichever of
   them is not hidden is the height the scroll padding above needs. */
function measureChromeHeights() {
  const root = document.documentElement;
  const bar = document.querySelector('.bar');
  root.style.setProperty('--bar-h', `${bar ? bar.getBoundingClientRect().height : 0}px`);
  const bottom = [document.querySelector('#actionbar'), document.querySelector('#resumeBar')]
    .find(el => el && !el.hidden);
  root.style.setProperty('--ab-h', `${bottom ? bottom.getBoundingClientRect().height : 0}px`);
}

/* Recomputed on view change (`applyView`, below) and from a `ResizeObserver`
   on `.bar` and `#actionbar` -- a rotation, a text-size change or the bar
   wrapping to a second row at 320px with a 32px root all change which
   cluster is widest, or how tall either bar is, without the view itself
   changing. One observer pair, module-scoped so a second boot (there is
   only one, but so was the module-scoped title observer above) does not
   double-observe. */
let barResizeObserver = null;
function initBarMeasurements() {
  if (barResizeObserver) return;
  const bar = document.querySelector('.bar');
  if (!bar) return;
  barResizeObserver = new ResizeObserver(() => {
    measureBarSide();
    measureChromeHeights();
    /* The collapse observer's `rootMargin` is the bar's height in pixels, so
       it goes stale the moment the bar wraps a row or the reader changes the
       text size. Rebuilt, not adjusted: `rootMargin` is read once when an
       `IntersectionObserver` is constructed and cannot be written after.
       Gated on the height actually having changed, or a bar that resizes for
       any other reason (the title fading in does not, but a `hidden` action
       bar flipping does) would tear down and re-observe on every frame. */
    if (titleObserver && Math.round(bar.getBoundingClientRect().height) !== titleRootTop) {
      watchLargeTitle(titleView);
    }
  });
  barResizeObserver.observe(bar);
  const ab = document.querySelector('#actionbar');
  if (ab) barResizeObserver.observe(ab);
  // #34 decision 11: the other bottom floating bar joins the same pair.
  const rb = document.querySelector('#resumeBar');
  if (rb) barResizeObserver.observe(rb);
}

/* ---------------- the wide layout (#35) ----------------
 *
 * #35 decision 8. 840 is written down once on each side of the line -- here,
 * and as the `min-width` of `@media screen and (min-width: 840px)` in
 * app.css -- and `test/wide-layout.test.js` is what holds the two together.
 * The query below is built FROM this constant rather than typed again, so
 * there is no third copy.
 *
 * Module-scoped, like `darkQuery` below: one `MediaQueryList`, asked for its
 * `.matches` at call time. Nothing caches the answer -- a laptop window is
 * dragged narrow and wide again, and a cached boolean would be one resize
 * behind the layout it describes. */
export const WIDE_MIN = 840;
const wideQuery = matchMedia(`(min-width: ${WIDE_MIN}px)`);
/* Crossing the breakpoint changes which panes are on screen without changing
   the view, so nothing else would repaint: dragging a window from 800px to
   900px reveals Today beside the game, and the passes in it were last built
   whenever Today was last the current screen. A full render, not `('tabs')`
   -- the game pane arriving on a narrow-to-wide crossing is in the same
   position. `renderAll` is declared above and is the same call `applyView`
   makes. */
wideQuery.addEventListener('change', () => {
  renderAll();
  /* `renderAll` repaints the sections; it does not decide which bottom bar is
     on screen. That decision is `wideQuery.matches` AND the view, and the
     only thing that changed here is the query -- so without these two lines
     a window dragged from 839px to 840px keeps the floating Start-game bar's
     `hidden` flag from the width it was last navigated at. The bar itself
     stops being drawn either way (the CSS gate is `@media (max-width:
     839px)`), but a stale flag is what `measureChromeHeights` reads: it takes
     `--ab-h` from the first bottom bar WITHOUT a `hidden` attribute, so a
     stale one measures a bar that is not drawn and strands the rail's last
     game entry under the Resume bar -- and dragging back the other way leaves
     `hidden` set on a bar the narrow layout means to show. `state.view` is
     the right argument: `welcome` is already folded into `today` there, and
     `syncActionBar`'s own `!state.onboarded` term covers that screen. */
  syncActionBar(state.view);
  measureChromeHeights();
});

/* `wide` is an argument with a default rather than a read inside the body, so
   each predicate is a pure function of `(view, wide)` that a test can ask
   about a width the machine running it does not have -- while a caller that
   just wants "now" writes `todayPaneShowing(state.view)` and gets the live
   query. The default is evaluated per call, so nothing is cached. */
export const todayPaneShowing = (view, wide = wideQuery.matches) => wide || view === 'today';
/* Not the mirror of `todayPaneShowing`: Today is the rail under every screen,
   but the game is only the RIGHT pane's resting state (decision 7) -- Team,
   Season and Settings cover it, so `wide` alone is not enough. */
export const gamePaneShowing = (view, wide = wideQuery.matches) =>
  view === 'games' || (wide && view === 'today');

/* #35 decision 7: above 840px the floating Start-game bar is gone -- the game
   is the right pane and the inline `.gm-start` row carries Start game there.
   The CSS gate that stops drawing it is `@media (max-width: 839px)`; this
   flag is what makes it gone to `measureChromeHeights` too, which picks the
   first of the two bottom bars WITHOUT a `hidden` attribute and would
   otherwise measure a `display: none` #actionbar at 0px while #resumeBar --
   the one bar left at this width -- is on screen over the rail, stranding the
   last game entry underneath it.

   A function rather than a line inside `applyView` because two things change
   the answer and only one of them is a navigation: the view, and which side
   of 840px the window is on. Both callers are above/below -- `applyView` for
   the first, the `wideQuery` listener for the second -- so there is one
   decision with two triggers rather than two copies that can drift. */
function syncActionBar(v) {
  const ab = document.querySelector('#actionbar');
  if (ab) ab.hidden = v !== 'games' || !state.onboarded || wideQuery.matches;
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
  /* #35 decision 3: `data-view` is how CSS learns the current screen -- the
     wide layout's rules key off it, and `data-boot` cannot be that attribute
     (it is stamped for only four of the six views and is removed the line
     above, the first time this runs). Written beside the line that already
     sets `state.view`, from the same argument, so there is one decision and
     two readers rather than two decisions. It is a projection for the
     cascade, never read back as state: `v`, not `state.view`, because
     `welcome` is the one value the CSS has to be able to see and
     `state.view` folds it into `today`. */
  document.documentElement.dataset.view = v;
  /* #126: the wide layout's "Today plus the game pane" resting state
     (app.css) has to know a coach with no games is not just between games --
     there is no frame to hold open. One class beside `data-view`, not a
     second `hasGames()` check inside the CSS rule it drives. */
  document.documentElement.classList.toggle('no-games', !hasGames());
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
  // #35 decision 7, and the same call the `wideQuery` listener makes -- see
  // `syncActionBar` above for why the decision lives in one function.
  syncActionBar(v);
  // #34 decision 6: Today's own floating primary action, painted right
  // beside #actionbar's own hidden line for the same reason -- both are
  // decided by the view this call is switching TO, and `measureChromeHeights`
  // below has to see whichever one this leaves showing.
  renderResumeBar();
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
  /* One header per screen state (N4, N5, C1): Today's own -- the keys hint,
     the gear -- lives in `#barToday` (#101 moved the team button itself into
     Today's own `<h1>`, N3); the other four share `#barBack`, an icon-only
     "Back to <team>" (`renderTeams`, teams-view.js) and the title. Both are
     inside the same `.bar` shell so there is still exactly one header
     element, the same one every view has always shared. */
  const onBack = BACK_VIEWS.includes(v);
  const today = $('#barToday'), back = $('#barBack');
  if (today) today.hidden = v !== 'today';
  if (back) back.hidden = !onBack;
  /* #33 decisions 1, 3-6: `#barTitle` is now a centered overlay on `.bar`
     itself, shown on Today too (not just the four "back" screens), so it is
     synced and (re-)observed here rather than inside the `onBack` branches
     above. `syncBarTitle` writes today's words; `watchLargeTitle` re-targets
     the collapse observer at the view's own `[data-large-title]` element, or
     marks Settings' bar title always-in since it has none to watch.
     `measureBarSide`/`initBarMeasurements` (decision 4) keep `--bar-side`
     current so the overlay's `max-width` never clips a wide cluster.
     `measureChromeHeights` (decision 14) runs after `#actionbar.hidden` is
     set, below, so `--ab-h` reads the view this call is switching TO. */
  syncBarTitle(v);
  watchLargeTitle(v);
  initBarMeasurements();
  /* #29 decision 4: the one door into the card sheet, shown only on the game
     screen -- same shape as `#barTitle` swapping the other way, just above. */
  const shareBtnEl = $('#shareBtn');
  if (shareBtnEl) shareBtnEl.hidden = v !== 'games';
  /* #30 decision 1: the header carries the export, shown only on Season, and
     only once there is a file to save -- a header button that hands back a
     header row and no rows is a support email. `renderSeason` also hides it
     on the empty-season repaint; this covers arriving at Season directly. */
  const exportBtnEl = $('#seasonExport');
  if (exportBtnEl) exportBtnEl.hidden = v !== 'season' || !seasonGames().length;
  /* #31 decision 2: Team's two header actions (C1 allows two), shown only on
     Team -- same shape as `#shareBtn` above. `#teamEdit` carries a second
     condition (#31 A2): with nobody, or exactly one player, on the roster
     there is nothing Edit mode could reorder. */
  const teamAddEl = $('#teamAdd');
  if (teamAddEl) teamAddEl.hidden = v !== 'team';
  const teamEditEl = $('#teamEdit');
  if (teamEditEl) teamEditEl.hidden = v !== 'team' || state.players.length <= 1;
  /* #33 decision 4 and 14, and it has to be HERE -- below every `hidden` flag
     above, not beside `syncBarTitle`. Both numbers are read off the bar as it
     will actually be drawn, and the four actions that come and go with the
     screen (`#shareBtn`, `#seasonExport`, `#teamAdd`, `#teamEdit`) are only
     settled on this line. Measuring before them meant `--bar-side` described
     the screen being LEFT, and the `ResizeObserver` does not cover for it:
     hiding a button inside a fixed-height bar does not change the bar's own
     size, so nothing fires and the stale number stands until the next
     rotation. `--ab-h` is measured here for the same reason, after
     `#actionbar.hidden` is set above. */
  measureBarSide();
  measureChromeHeights();
  /* #31 A2: the real transition away from Team, same shape as the Games/Today
     branches below -- Edit mode is meant to be a property of the screen, not
     the data, so leaving (even mid-edit) resets it before the coach can find
     it still on next time they arrive. */
  if (v !== 'team' && from === 'team') resetEditMode();
  /* A REAL TRANSITION, which is what every repaint below is gated on -- so it
     is asked once here rather than restated in each of them.

     `from !== v` excludes a same-screen `setView`: `viewRefresh`'s default
     undo refresh calls `setView(state.view)` on every undoable edit, and most
     of those happen while already on Games, so without this each one would
     repaint everything a second time; the efficiency review already flagged
     that shape of double work once. A caller with its own reason to always
     repaint regardless of which screen (`restoreBackup`'s `show()`, a
     wholesale state replace) keeps its own `renderAll()` call same as before;
     the callers that only needed one because entering Games needed it
     (`commitFlow`, both onboarding paths) had theirs removed, now that this
     covers them.

     `from !== null` excludes the very first `setView` call of the session,
     boot's own (app.js). Boot's own explicit `renderAll()` runs a few lines
     after it regardless of which screen was resolved, because Today, Team,
     Season, Settings and Welcome never got a render out of `applyView`
     either; a coach who left the app on Games -- probably the most common
     single case there is -- would otherwise pay for two full renders on every
     reload rather than the one every other screen already paid. */
  if (from !== null && from !== v) {
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

       #35 decision 10 SUBSUMES this branch and the Today one below, which is
       why it shares the call -- narrowed by the efficiency review's own
       finding: `gamePaneShowing(v)` is exactly "games at every width, or
       today while wide" (decision 7), so it is games and the wide entry into
       today that need the game pane's own content fresh, not every wide
       navigation. Team, Season and Settings cover the game pane at this
       width (decision 7) and stay fresh through their own edits' `edit()`
       calls (#26 decision 6) -- painting them here was the exact wasted work
       that decision removed, back for a pane nobody can see. */
    if (gamePaneShowing(v)) render();
    /* #26 decision 6: `renderTabs` skips building Today's passes while another
       screen is on show, so a real transition INTO Today has to repaint them
       here or a coach who edited a game and tapped back would see whatever the
       passes looked like before the edit. Boot's own landing on Today is
       excluded by the gate above for the same reason the Games branch is:
       boot's `renderAll()` a few lines later covers it, by which point
       `state.view` is already 'today'.
       #34 decision 7: `resume` rides along -- a real transition into Today is
       exactly when which game is part-played may have changed underneath it. */
    else if (v === 'today') render('tabs', 'resume');
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
