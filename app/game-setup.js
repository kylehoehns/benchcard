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
import { $, set, style, el } from './dom.js';
import { renderCardFold } from './card.js';
import { state, game, plans, teamName, noRoster, setAvailable, ruleCount,
         sentenceParts, planSay, stepFormat, GRAN_CHOICES } from './state.js';
import { openSheet, closeSheet } from './trap.js';
import { colorName } from './storage.js';

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
  set('#label', 'value', g.label);
  set('#when', 'value', g.when);
  set('#copies', 'value', state.ui.copies);
  set('#cardId', 'value', state.ui.cardId);
  set('#cardSize', 'value', state.ui.cardSize);
  set('.s-cardhd .hint', 'textContent', state.ui.cardSize === 'half' ? '8 × 5.1 in' : '3.45 × 5 in');
  set('#printScope', 'value', state.ui.printScope);
  set('#showMinutes', 'checked', state.ui.showMinutes);
  renderCardFold();
  renderConsCount();
}


/* The badge on the collapsed Rules row. Exported and called by
   `renderConstraints` as well as from here, because `setup` is in neither
   AFTER_EDIT nor PLAN_ONLY: adding a rule repaints the rules body and nothing
   else, so the badge held the count as of the last FULL render and a coach's
   first rule of the session changed the collapsed row not at all.

   At zero it is not a badge at all. `display: none` used to leave the row
   reading `› RULES` and nothing else, which is the one feature `ROADMAP.md`
   calls unclaimed territory introducing itself with a blank (A21b). It names
   what it holds instead, and `.zero` unsets the accent-soft pill so the hint
   does not read as an alert about something the coach has not done. */
const CONS_HINT = 'minutes, pairs, starters';

export function renderConsCount() {
  const g = game();
  /* `ruleCount` (state.js) is the one place this number is computed: it
     counts each rule exactly as `renderConstraints` (rules.js) lists them --
     a starting five or a last-period five once, not by `.length` -- and
     includes the league floor, which is not stored on the game at all
     (`computeAll` composes it in on the way to the solver). Reading it here
     instead of re-deriving it is what keeps this badge, the Rules list and
     the sentence's rules phrase from disagreeing (#26 decision 3). */
  const n = ruleCount(g);
  const hint = n ? '' : noRoster() ? '' : CONS_HINT;
  set('#conscount', 'textContent', n ? String(n) : hint);
  set('#conscount', 'className', n ? 'count' : 'count zero');
  style('#conscount', 'display', n || hint ? '' : 'none');
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

/* Decision 4: until the Plan sheet exists (#28), the strategy and rules
   phrases open the existing folds rather than a sheet of their own, move
   focus to the control the ticket names, and scroll it into view. They
   never call `openSheet` -- opening a fold does not touch the one-sheet-open
   rule. */
function openFoldAt(foldSel, focusSel) {
  const fold = $(foldSel);
  if (!fold) return;
  fold.open = true;
  fold.scrollIntoView({ block: 'center' });
  const focusTarget = $(focusSel);
  focusTarget?.focus({ preventScroll: true });
}

function wireSentence() {
  const players = $('#phrasePlayers');
  if (players) players.onclick = () => { paintWhoBody(); openSheet($('#sheetWho'), players); };
  const format = $('#phraseFormat');
  if (format) format.onclick = () => { paintFormatBody(); openSheet($('#sheetFormat'), format); };
  const interval = $('#phraseInterval');
  if (interval) interval.onclick = () => { paintIntervalBody(); openSheet($('#sheetInterval'), interval); };
  const strategy = $('#phraseStrategy');
  if (strategy) strategy.onclick = () => openFoldAt('#planFold', '#stratseg button.on');
  const rules = $('#phraseRules');
  if (rules) rules.onclick = () => openFoldAt('#consdetails', '#consdetails summary');
  const evens = $('#phraseEvens');
  if (evens) evens.onclick = () => openFoldAt('#consdetails', '#consdetails summary');

  on('#sheetWhoClose', () => closeSheet($('#sheetWho')));
  on('#sheetFormatClose', () => closeSheet($('#sheetFormat')));
  on('#sheetIntervalClose', () => closeSheet($('#sheetInterval')));
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
// `#setPerMins`) -- these are the sheet's own, separate range.
const PERIODS_LO = 1, PERIODS_HI = 4;
const MINUTES_LO = 4, MINUTES_HI = 20;

function stepperRow(label, key, lo, hi, noun) {
  const row = el('div', 'sheetstep');
  row.append(el('span', 'sheetstep-label', label));
  const minus = el('button', 'sheetstep-btn', '−');
  minus.type = 'button';
  minus.setAttribute('aria-label', `Fewer ${noun}`);
  const val = el('span', 'sheetstep-value', '');
  const plus = el('button', 'sheetstep-btn', '+');
  plus.type = 'button';
  plus.setAttribute('aria-label', `More ${noun}`);
  const sync = () => {
    const v = game()[key];
    val.textContent = String(v);
    minus.disabled = v <= lo;
    plus.disabled = v >= hi;
  };
  const step = d => {
    const g = game();
    g[key] = stepFormat(g[key], d, lo, hi);
    sync();
    // a format edit, same as the number fields it replaces: the full
    // AFTER_EDIT set, not just the availability-only PLAN_ONLY subset.
    soon('strategy', ...AFTER_EDIT);
  };
  minus.onclick = () => step(-1);
  plus.onclick = () => step(1);
  sync();
  row.append(minus, val, plus);
  return row;
}

function paintFormatBody() {
  const box = $('#sheetFormatBody');
  if (!box) return;
  box.textContent = '';
  box.append(stepperRow('Periods', 'periods', PERIODS_LO, PERIODS_HI, 'periods'));
  box.append(stepperRow('Minutes each', 'periodMinutes', MINUTES_LO, MINUTES_HI, 'minutes'));
}

/* --------------------------- Sub interval ---------------------------- */

// "Every 4 min", "Only at breaks" (decision 6) -- the sheet row's own
// capitalization of the sentence's lowercase phrase, not a second phrase.
// `colorName` (storage.js) is the same one-liner under a color-specific name;
// aliased here rather than re-derived.
const capitalize = colorName;

function paintIntervalBody() {
  const box = $('#sheetIntervalBody');
  if (!box) return;
  box.textContent = '';
  GRAN_CHOICES.forEach((c, idx) => {
    const g = game();
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
      Object.assign(game(), { granMode: c.mode, granValue: c.value });
      // The checkmark moves to a different row -- unlike a Who's here row or
      // a stepper, which update themselves, this repaints the whole list --
      // then puts focus back on the row that used to be at this position.
      paintIntervalBody();
      box.children[idx]?.focus({ preventScroll: true });
      soon('strategy', ...AFTER_EDIT);
    };
    box.append(b);
  });
}
