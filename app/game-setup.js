/* ================================================================== *
 * game-setup.js -- the current game's own inputs
 *
 * Two renderers that paint the settings a coach sets *before* a plan
 * exists: `renderSetup` (the day and game fields, and the card options)
 * and `renderSentence` (#27: the one-line description of how the game is
 * set up, and the three sheets its phrases open -- Who's here, Format,
 * Sub interval). They belong together because neither reads a plan --
 * everything here is an input to one.
 *
 * The phrase buttons and the sheet shells are static markup (index.html);
 * this file only ever rewrites their text and `aria-label`, or paints a
 * sheet's body once when it opens. A sheet body then updates itself in
 * place after that -- a row flips its own state, a stepper its own value --
 * the same "repaint what changed, not the container" rule `render.js`
 * documents for every other section.
 * ================================================================== */
import { riseIn } from './fx.js';
import { $, set, el } from './dom.js';
import { state, game, plans, teamName, noRoster, setAvailable,
         sentenceParts, planSay, stepFormat, GRAN_CHOICES } from './state.js';
import { openSheet, closeSheet, pushPane, popPane } from './trap.js';
import { colorName, seasonDate } from './storage.js';

let renderAll = () => {};
let soon = () => {};
let AFTER_EDIT = [];
let PLAN_ONLY = [];

export function initGameSetup(renderAllFn, soonFn, planOnly, afterEdit) {
  renderAll = renderAllFn;
  soon = soonFn;
  PLAN_ONLY = planOnly;
  AFTER_EDIT = afterEdit;
  wireSentence();
}

export function renderSetup() {
  const g = game();
  set('#dayName', 'value', state.day.name);
  set('#dayName', 'placeholder', teamName() || 'Name this day…');
  // #101 item 3: `moveGame` (app.js) is the one path that changes it; `min`
  // matches the flow's own Date field -- no dates before today either way.
  set('#gameDate', 'value', state.day.date);
  set('#gameDate', 'min', seasonDate());
  set('#label', 'value', g.label);
  set('#when', 'value', g.when);
  set('#copies', 'value', state.ui.copies);
  set('#cardId', 'value', state.ui.cardId);
  set('#cardSize', 'value', state.ui.cardSize);
  set('#printScope', 'value', state.ui.printScope);
  set('#showMinutes', 'checked', state.ui.showMinutes);
}


/* ================================================================== *
 * The sentence (#27)
 * ================================================================== */

// The static text a phrase button's accessible name is prefixed with
// (decision 8), keyed the same as `sentenceParts`' own return shape.
const PHRASE_NAME = {
  players: "Who's here",
  format: 'Format',
  interval: 'Sub interval',
  strategy: 'Plan',
  rules: 'Rules',
};

function setPhrase(sel, text, name) {
  const b = $(sel);
  if (!b) return;
  b.textContent = text;
  b.setAttribute('aria-label', `${name}, ${text}`);
}

/* The announcement inside each sheet (decision 10): once the scheduled
   re-plan has run, the line reads the new summary. Hooked into this section,
   which runs after every re-plan (AFTER_EDIT and PLAN_ONLY), rather than a
   section of its own. `planSay` is the one place this text is built.

   Written to all three by id rather than to whichever dialog happens to be
   open: `showModal()` makes a closed dialog's contents inert, not absent, so
   there is nothing wrong with a status line holding stale-but-inert text
   underneath a sheet nobody can see, and each id then has a real reader here
   instead of only ever being found through `.bsheet-status` on the open one. */
function refreshSheetStatus(g) {
  const text = planSay(g, plans[state.activeGame]);
  set('#sheetWhoStatus', 'textContent', text);
  set('#sheetFormatStatus', 'textContent', text);
  set('#sheetIntervalStatus', 'textContent', text);
  set('#sheetPlanStatus', 'textContent', text);
}

export function renderSentence() {
  const g = game(), i = state.activeGame;
  const parts = sentenceParts(g, i);
  setPhrase('#phrasePlayers', parts.players, PHRASE_NAME.players);
  setPhrase('#phraseFormat', parts.format, PHRASE_NAME.format);
  setPhrase('#phraseInterval', parts.interval, PHRASE_NAME.interval);
  setPhrase('#phraseStrategy', parts.strategy, PHRASE_NAME.strategy);
  setPhrase('#phraseRules', parts.rules, PHRASE_NAME.rules);
  const line2 = $('#sentenceEvens');
  if (line2) line2.hidden = !parts.evens;
  if (parts.evens) setPhrase('#phraseEvens', parts.evens, 'Evening out the day');
  refreshSheetStatus(g);
}

/* ================================================================== *
 * The Plan sheet (#28)
 *
 * `openPlanSheet` is the one opener every phrase (and, per decision 15,
 * the timeline's two CTAs) calls. It always resets the dialog to level 1
 * first (decision 14/16's "each open starts at level 1"), then scrolls the
 * named section's group to the top of the scrolling body. The level-2 push
 * and pop themselves live in `rules.js` and `balance.js` -- the pages that
 * build a `#planSub` body -- through `pushPane`/`popPane` (`trap.js`);
 * `resetPlanChrome` is exported so those callers can pass it as `pushPane`'s
 * `onPop`, so the header (title, back button, right-slot control) resets on
 * every path back to level 1, including Escape and Android's back gesture,
 * not only a tap on the back button itself.
 * ================================================================== */

export function resetPlanChrome() {
  set('#sheetPlanTitle', 'textContent', 'Plan');
  const back = $('#planBack'); if (back) back.hidden = true;
  const close = $('#sheetPlanClose'); if (close) close.hidden = false;
  const add = $('#planAddRuleBtn'); if (add) { add.hidden = true; add.disabled = true; }
}

/* The shared half of pushing a level-2 page (decision 16): the header chrome
   (title, back button, which right-slot control shows) and the push itself,
   with `resetPlanChrome` wired as `pushPane`'s `onPop` so the chrome always
   resets, on the back button, Escape or Android's back gesture alike. The
   page's own body (a rule's detail, Add a rule, Lineup balance) is the
   caller's -- built into `#planSub` before this runs, since `pushPane` moves
   focus to its first focusable node. */
export function pushPlanPane(trigger, { title, showAddRule = false } = {}) {
  set('#sheetPlanTitle', 'textContent', title);
  const back = $('#planBack'); if (back) back.hidden = false;
  const close = $('#sheetPlanClose'); if (close) close.hidden = showAddRule;
  const add = $('#planAddRuleBtn'); if (add) add.hidden = !showAddRule;
  pushPane($('#sheetPlan'), trigger, resetPlanChrome);
}

const PLAN_SECTION_HEADER = {
  strategy: null,       // top of the sheet already -- nothing to scroll to
  rules: '#constraints',
  evens: '#planDay',
};

export function openPlanSheet(section, trigger) {
  const dialog = $('#sheetPlan');
  if (!dialog) return;
  // Always level 1: pop any open sub pane without its pop animation or undo
  // toast -- this is a fresh open, not a coach tapping back.
  const main = $('#planMain'), sub = $('#planSub');
  if (main) main.hidden = false;
  if (sub) { sub.hidden = true; sub.classList.remove('pane-in'); }
  resetPlanChrome();
  openSheet(dialog, trigger, { full: true });
  // The body scrolls, not `#planMain`. Y by hand: `scrollIntoView` moves X
  // too, which would shift the clipped pane slide. A lower header can only
  // reach the top with a body's height below it, so grow the pane just that.
  const body = $('#sheetPlanBody');
  const sel = PLAN_SECTION_HEADER[section];
  const target = sel && $(sel);
  if (!body || !main) return;
  main.style.minHeight = '';
  body.scrollTop = 0;
  if (!target) return;
  const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top;
  main.style.minHeight = `${top + body.clientHeight}px`;
  body.scrollTop = top;
}

/* Who's here's own opener, shared with the blocked panel's "Change who's
   here" button (#29 decision 7) so there is one implementation of opening
   this sheet rather than a second one drifting apart from the sentence's. */
export function openWhoSheet(trigger) {
  paintWhoBody();
  openSheet($('#sheetWho'), trigger);
}

function wireSentence() {
  const players = $('#phrasePlayers');
  if (players) players.onclick = () => openWhoSheet(players);
  const format = $('#phraseFormat');
  if (format) format.onclick = () => { paintFormatBody(); openSheet($('#sheetFormat'), format); };
  const interval = $('#phraseInterval');
  if (interval) interval.onclick = () => { paintIntervalBody(); openSheet($('#sheetInterval'), interval); };
  const strategy = $('#phraseStrategy');
  if (strategy) strategy.onclick = () => openPlanSheet('strategy', strategy);
  const rules = $('#phraseRules');
  if (rules) rules.onclick = () => openPlanSheet('rules', rules);
  const evens = $('#phraseEvens');
  if (evens) evens.onclick = () => openPlanSheet('evens', evens);

  on('#sheetWhoClose', () => closeSheet($('#sheetWho')));
  on('#sheetFormatClose', () => closeSheet($('#sheetFormat')));
  on('#sheetIntervalClose', () => closeSheet($('#sheetInterval')));
  on('#sheetPlanClose', () => closeSheet($('#sheetPlan')));
  on('#planBack', () => popPane($('#sheetPlan')));
}

function on(sel, fn) { const n = $(sel); if (n) n.onclick = fn; }

/* ---------------------------- Who's here ---------------------------- */

function paintWhoRow(b, on_) {
  b.setAttribute('aria-pressed', String(on_));
  const state_ = b.querySelector('.sheetrow-state');
  if (state_) state_.textContent = on_ ? '✓' : 'Absent';
}

function whoRow(g, p, on_) {
  const b = el('button', 'sheetrow');
  b.type = 'button';
  // Named with the player's name alone (item 3): the visible "Absent" text
  // beside it is decorative confirmation of `aria-pressed`, not part of the
  // accessible name, the same split `renderAvail` used to draw between its
  // pill's className and its `aria-label`.
  b.setAttribute('aria-label', p.name || 'Unnamed');
  b.append(el('span', 'sheetrow-t', p.name || 'Unnamed'));
  const mark = el('span', 'sheetrow-state', '');
  mark.setAttribute('aria-hidden', 'true');
  b.append(mark);
  paintWhoRow(b, on_);
  b.onclick = () => {
    const nowOn = b.getAttribute('aria-pressed') !== 'true';
    // setAvailable, not a bare g.out edit: a live override naming a player
    // who has just been sat out has to go with them.
    setAvailable(g, p.id, nowOn);
    paintWhoRow(b, nowOn);
    // Who's here is an availability edit -- the re-plan it schedules leaves
    // the strategy body alone, same as the pill it replaces.
    soon('strategy', ...PLAN_ONLY);
  };
  return b;
}

function paintWhoBody() {
  const g = game(), box = $('#sheetWhoBody');
  if (!box) return;
  box.textContent = '';
  if (noRoster()) {
    box.append(el('p', 'sheetempty', 'No players on the roster yet.'));
    return;
  }
  const out = new Set(g.out);
  for (const p of state.players) box.append(whoRow(g, p, !out.has(p.id)));
  riseIn(box.querySelectorAll('.sheetrow'), { delay: 0.012, from: 5 });
}

/* ------------------------------ Format ------------------------------ */

// Decision 5: periods step within 1-4, minutes within 4-20, one at a time.
// Settings keeps its own wider 1-8 / 1-40 number fields (`#setPeriods`,
// `#setPerMins`) -- these are the sheet's own, separate range. Exported for
// #36's first-run flow, step 2: the same two steppers, the same range, on a
// draft instead of `game()` (Constraints/Reuse: no second range typed out).
export const PERIODS_LO = 1, PERIODS_HI = 4;
export const MINUTES_LO = 4, MINUTES_HI = 20;

// #73 item 5: the one stepper builder Format and Add a rule (rules.js) both
// use -- `.prow.pstep-row > .prow-t(label) + .pstep-val + .pstep(− +)`, a
// grid with a fixed-width value column so every row's − / value / + edges
// line up regardless of the label's own width. Lives here (not rules.js)
// because game-setup.js is the module both files already import from
// (rules.js already imports `pushPlanPane` from here), so no new module
// joins the boot graph. `get`/`set` (rather than a state key) is what lets
// rules.js's draft object share this with Format's `game()` fields; the
// clamp itself is still `stepFormat` (state.js), never re-derived.
export function stepperRow(label, get, set, lo, hi, noun, afterChange) {
  const row = el('div', 'prow pstep-row');
  row.append(el('span', 'prow-t', label));
  const val = el('span', 'pstep-val', '');
  const wrap = el('div', 'pstep');
  const minus = el('button', 'pstep-btn', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', `Fewer ${noun}`);
  const plus = el('button', 'pstep-btn', '+');
  plus.type = 'button';
  plus.setAttribute('aria-label', `More ${noun}`);
  const sync = () => {
    const v = get();
    val.textContent = String(v);
    minus.disabled = v <= lo;
    plus.disabled = v >= hi;
  };
  const step = d => {
    set(stepFormat(get(), d, lo, hi));
    sync();
    afterChange?.();
  };
  minus.onclick = () => step(-1);
  plus.onclick = () => step(1);
  sync();
  wrap.append(minus, plus);
  // #73 fix pass finding 5: the value and the +/- pair share one wrapper so
  // `.pstep-row` can wrap the label to its own line at a 320px/32px root
  // (where the label no longer fits beside them) while keeping the value and
  // buttons together, right-aligned, on the line under it -- see app.css's
  // `.pstep-tail` for the layout this markup enables.
  const tail = el('div', 'pstep-tail');
  tail.append(val, wrap);
  row.append(tail);
  return row;
}

function paintFormatBody() {
  const box = $('#sheetFormatBody');
  if (!box) return;
  box.textContent = '';
  const grp = el('div', 'pgrp');
  // a format edit, same as the number fields it replaces: the full
  // AFTER_EDIT set, not just the availability-only PLAN_ONLY subset.
  const afterChange = () => soon('strategy', ...AFTER_EDIT);
  grp.append(stepperRow('Periods', () => game().periods, v => { game().periods = v; },
    PERIODS_LO, PERIODS_HI, 'periods', afterChange));
  grp.append(stepperRow('Minutes each', () => game().periodMinutes, v => { game().periodMinutes = v; },
    MINUTES_LO, MINUTES_HI, 'minutes', afterChange));
  box.append(grp);
}

/* --------------------------- Sub interval ---------------------------- */

// "Every 4 min", "Only at breaks" (decision 6) -- the sheet row's own
// capitalization of the sentence's lowercase phrase, not a second phrase.
// `colorName` (storage.js) is the same one-liner under a color-specific name;
// aliased here rather than re-derived.
const capitalize = colorName;

/* #36 Constraints/Reuse: `GRAN_CHOICES` through this one builder, so the
   first-run flow's step 2 gets the same rows the sub-interval sheet does
   rather than a third hand-written list. `get`/`onPick` are what let a draft
   object (`fr`, onboarding.js) share this with the sheet's own `game()` --
   the write itself, and what happens after it, stay the caller's. */
export function paintGranRows(box, get, onPick) {
  if (!box) return;
  box.textContent = '';
  GRAN_CHOICES.forEach((c, idx) => {
    const g = get();
    const on_ = g.granMode === c.mode && (c.mode === 'breaksOnly' || g.granValue === c.value);
    const label = capitalize(c.phrase);
    const b = el('button', 'sheetrow' + (on_ ? ' sel' : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on_));
    b.setAttribute('aria-label', label);
    b.append(el('span', 'sheetrow-t', label));
    const mark = el('span', 'sheetrow-state', on_ ? '✓' : '');
    mark.setAttribute('aria-hidden', 'true');
    b.append(mark);
    b.onclick = () => {
      onPick(c);
      // The checkmark moves to a different row -- unlike a Who's here row or
      // a stepper, which update themselves, this repaints the whole list --
      // then puts focus back on the row that used to be at this position.
      paintGranRows(box, get, onPick);
      box.children[idx]?.focus({ preventScroll: true });
    };
    box.append(b);
  });
}

function paintIntervalBody() {
  paintGranRows($('#sheetIntervalBody'), game, c => {
    Object.assign(game(), { granMode: c.mode, granValue: c.value });
    soon('strategy', ...AFTER_EDIT);
  });
}
