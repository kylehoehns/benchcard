/* ================================================================== *
 * lineup balance — the levels, and the shape they are used in
 *
 * Even minutes is the promise. This is the other half of the coaching
 * problem: five players picked only for fairness can be a coach's five
 * weakest all at once, and the usual fix for that is to stop giving even
 * minutes at all. Levels let the solver keep lineups from being lopsided
 * while the minutes stay where they were.
 *
 * Two rules govern everything here.
 *
 * A level is never a rating. It is a rotation judgement, it is called a
 * level and shown as a five-step control rather than a number out of ten,
 * and it lives on this screen and nowhere else. It is deliberately absent
 * from the printed card, from bench mode and from the shared image —
 * those are the artefacts that get held up in a gym, and a number beside
 * a child's name in front of their parent is a different object than a
 * substitution plan. `test/balance.test.js` and `test/leak.test.js` hold
 * that line.
 *
 * And the whole thing is opt-in by being inert. Every player starts on
 * the middle level, which makes every five worth the same, which makes
 * the solver's balance term identically zero. A coach who never opens
 * this fold gets exactly the plan they got before it existed.
 * ================================================================== */
import { $, on, el } from './dom.js';
import { state, save, colorOf, game } from './state.js';
import { DEFAULT_TIER } from './engine.js';
import { tick } from './fx.js';

/* Named, not numbered. "Level 4 of 5" is a position in a rotation; "4/5" is
   a grade. The solver only ever sees the index. */
export const LEVELS = [
  { v: 1, label: 'Developing', hint: 'building up: protect their minutes, not their matchups' },
  { v: 2, label: 'Learning', hint: 'coming along' },
  { v: 3, label: 'Rotation', hint: 'the middle of your bench, where everyone starts' },
  { v: 4, label: 'Reliable', hint: 'you are comfortable with them out there' },
  { v: 5, label: 'Go-to', hint: 'the five you would pick if you had to win one possession' },
];

const SHAPES = [
  { v: 'even', label: 'Even', blurb: 'Every stint about as strong as every other. Nobody gets stranded with a lineup that cannot compete.' },
  { v: 'start', label: 'Start strong', blurb: 'Your best five open the game. Under even minutes the closing stints are lighter. Those minutes have to go somewhere.' },
  { v: 'finish', label: 'Finish strong', blurb: 'Saves your best five for the end. The opening stints are lighter in exchange.' },
  { v: 'both', label: 'Both ends', blurb: 'Strong to open and strong to close, with a softer middle. Good for developing players when the game is likely decided in the last period.' },
];

const tierOf = p => {
  const n = Number(p.tier);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : DEFAULT_TIER;
};

/* Injected, like the other view seams: app.js owns the repaint scheduler and
   importing it back from here would close the graph into a cycle. */
let soon = () => {};
let AFTER_EDIT = [];

export function initBalance(soonFn, afterEdit) {
  soon = soonFn;
  AFTER_EDIT = afterEdit;
  on('#balanceFold', 'ontoggle', renderBalance);
}

/* ------------------------------------------------------------------ *
 * the shape — games screen
 *
 * Which end of the game your stronger lineups fall on is a call about
 * tonight's opponent, so it sits with the plan and is stored per game.
 * The levels it works from are season-long and live on the roster page.
 * ------------------------------------------------------------------ */
export function renderBalance() {
  const box = $('#balancebody');
  if (!box) return;
  box.textContent = '';

  const g = game();
  if (!g) return;

  const levelled = state.players.filter(p => tierOf(p) !== DEFAULT_TIER).length;
  const current = SHAPES.some(s => s.v === g.balance) ? g.balance : 'even';

  /* The summary line has to answer "is this doing anything?" without opening
     the fold, because until levels are set the honest answer is no. */
  const hint = $('#balancehint');
  if (hint) {
    hint.textContent = !state.players.length ? ''
      : levelled === 0 ? 'off · no levels set'
      : `${SHAPES.find(s => s.v === current).label.toLowerCase()} · ${levelled} set`;
  }

  const fold = $('#balanceFold');
  if (fold && !fold.open) return;
  if (!state.players.length) {
    box.append(el('p', 'note', 'Add your players first.'));
    return;
  }

  const intro = el('p', 'note bal-intro');
  intro.textContent = 'Minutes stay even. This only changes who is on the floor together, so a stint is never all your strongest or all your youngest.';
  box.append(intro);

  const seg = el('div', 'seg wide');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'How lineup strength is spread across the game');
  for (const s of SHAPES) {
    const b = el('button', 'press' + (s.v === current ? ' on' : ''), s.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(s.v === current));
    b.onclick = () => { g.balance = s.v; save(); soon('balance', ...AFTER_EDIT); };
    seg.append(b);
  }
  const wrap = el('div', 'bal-shape');
  wrap.append(seg);
  wrap.append(el('p', 'note bal-blurb', SHAPES.find(s => s.v === current).blurb));
  box.append(wrap);

  /* Nothing to shape until somebody has a level, and a control that silently
     does nothing is worse than one that says why. */
  if (!levelled) {
    // `.note` is the whole treatment; a `bal-empty` hook rode along here with
    // no rule and no reader, and went in the 2026-08-24 dead-class sweep.
    const p0 = el('p', 'note');
    /* It used to send coaches to a heading called "Player levels". There has
       been no such heading since the levels stopped being a fold and moved
       into the roster row itself, so this now points at what is actually on
       the screen: the row of steps under each name. The tab it names is the
       LABEL the bar shows ("Team" since A40 slice 1), not the view key. */
    p0.append('Every player is on the same level, so this has nothing to work with yet. Set a level under each name on the ');
    const a = el('b', '', 'Team');
    p0.append(a, ' page.');
    box.append(p0);
  }
}

/* ------------------------------------------------------------------ *
 * the levels — roster screen
 *
 * Season-long, so they sit with the roster rather than with the plan.
 * They live on the player, which is why they have never reset per game;
 * having them in the same fold as the shape only made them look as if
 * they might.
 * ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ *
 * the meter — one player, built into their roster row
 *
 * This used to be a second list under the roster: twelve names, then the
 * same twelve names again with a meter each. It cost 3.5 screens on a
 * phone against 2.0 with it shut, and the duplication was most of that.
 * Worse, it read as a separate feature "hiding down below" rather than
 * something belonging to the player.
 *
 * So the meter goes in the row, behind a toggle. Off, a coach who never
 * uses levels pays nothing; on, the level sits with the name and no
 * child is listed twice.
 * ------------------------------------------------------------------ */

/* The key line, once above the list rather than a label on every row. The
   staircase says "more" on its own, but a control nobody has seen before
   should not need inferring. */
export function levelKey() {
  const key = el('div', 'bal-key');
  const ends = el('div', 'bal-key-ends');
  ends.append(el('span', '', LEVELS[0].label));
  ends.append(el('i', 'bal-key-arrow'));
  ends.append(el('span', '', LEVELS[LEVELS.length - 1].label));
  key.append(ends);
  key.setAttribute('aria-hidden', 'true');   // every step already says its own level
  return key;
}

/* The key half of the WAI-ARIA radiogroup contract, which the steps below
   wear the roles for. Space or Enter selects the step the user is ON — the
   most obvious keystroke on a radio, and it used to do nothing at all. The
   arrows step away from the FOCUSED level rather than from the stored one, so
   that focus and `aria-checked` cannot drift apart and leave a screen reader
   announcing one level over a meter showing another.

   Pure, and separate from the handler, so `test/level-keys.test.js` can
   exercise every key without a DOM. Returns null for a key this control does
   not own, which is the handler's signal to leave the event alone. */
export const levelFromKey = (key, focused) => {
  if (key === 'Enter' || key === ' ') return focused;
  const d = key === 'ArrowRight' || key === 'ArrowUp' ? 1
    : key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 0;
  return d ? Math.max(1, Math.min(LEVELS.length, focused + d)) : null;
};

/* Paint one meter's steps and its label from a value. Module level and driven
   off the two nodes rather than a closure, so the same code serves the drag
   (which paints as the finger crosses a detent) and `repaintLevels` below
   (which paints a change the meter did not make -- a reset, or an undo). */
function paintMeter(steps, label, v) {
  [...steps.children].forEach((b, i) => {
    const lv = i + 1;
    b.classList.toggle('on', lv === v);
    b.classList.toggle('fill', lv <= v);
    b.setAttribute('aria-checked', String(lv === v));
    // roving tabindex: a radiogroup is one tab stop, not five. Without this
    // an eleven-player roster puts 55 stops between the coach and the page.
    b.tabIndex = lv === v ? 0 : -1;
  });
  label.textContent = LEVELS.find(l => l.v === v).label;
}

/* Repaint every meter on the page from state, leaving the rows they live in
   alone. This is what the `levels` render key runs, and the reason it exists:
   that key used to be `renderRoster`, so changing one player's level tore down
   and rebuilt all eleven rows and replayed `riseIn`'s stagger down the whole
   list. Reported from a phone as the screen refreshing while dragging a level.
   Nothing else in a roster row depends on the tier, so nothing else has to be
   rebuilt to show a new one. */
export function repaintLevels() {
  for (const wrap of document.querySelectorAll('.bal-meter[data-pid]')) {
    const p = state.players.find(x => x.id === wrap.dataset.pid);
    const steps = wrap.querySelector('.bal-steps');
    const label = wrap.querySelector('.bal-lv');
    if (p && steps && label) paintMeter(steps, label, tierOf(p));
  }
}

/** The meter for one player, ready to drop into their row. */
export function levelMeter(p) {
  const wrap = el('div', 'bal-meter');
  wrap.style.setProperty('--c', colorOf(p.id));
  // how `repaintLevels` finds this meter's player again
  wrap.dataset.pid = p.id;

  const cur = tierOf(p);
  const steps = el('div', 'bal-steps');
  steps.setAttribute('role', 'radiogroup');
  steps.setAttribute('aria-label', `Rotation level for ${p.name || 'this player'}`);
  const label = el('div', 'bal-lv', LEVELS.find(l => l.v === cur).label);

  /* Paint in place rather than through `soon`. A level change re-solves the
     whole plan, and re-rendering the roster mid-drag would rebuild the button
     under the finger -- the same trap the minutes sliders hit. So: repaint
     synchronously while dragging, and only ask for a re-solve on release. */
  const paint = v => paintMeter(steps, label, v);

  for (const lv of LEVELS) {
    const b = el('button', 'bal-step press' + (lv.v === cur ? ' on' : '') + (lv.v <= cur ? ' fill' : ''));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(lv.v === cur));
    b.setAttribute('aria-label', `${lv.label}, ${lv.hint}`);
    b.title = lv.label;
    b.dataset.fk = `bal:${p.id}:${lv.v}`;
    b.tabIndex = lv.v === cur ? 0 : -1;
    /* Keyboard and assistive tech go through the buttons; pointers go through
       the drag handler below. There is still no `onclick`, and that is not an
       oversight: `pointerdown` calls `preventDefault()` and owns the pointer
       path, so a click handler would be a second commit route racing it. */
    b.onkeydown = e => {
      const v = levelFromKey(e.key, lv.v);
      if (v == null) return;
      e.preventDefault();
      commit(v);
      // selection and focus move together, or the two disagree from here on
      steps.children[v - 1]?.focus();
    };
    steps.append(b);
  }

  const commit = v => {
    if (v === tierOf(p)) return;
    p.tier = v;
    paint(v);
    save();
    /* Not 'roster'. This comment used to say that and it was not true of what
       the app did: `levels` WAS `renderRoster`, so the rows were rebuilt
       anyway and the distinction it drew existed only here. `levels` now
       repaints the meters in place (`repaintLevels`), so the claim holds. */
    soon('levels', 'balance', ...AFTER_EDIT);
  };

  /* Drag, because reaching for a five-step meter and sliding it is what anyone
     does first. The level is read from the strip's own geometry, so a finger
     can wander above or below it and still be understood. `touch-action:
     pan-y` in the CSS is what keeps a vertical drag scrolling the page. */
  let dragging = false, startX = 0, moved = false, live = cur;
  const levelAt = clientX => {
    const r = steps.getBoundingClientRect();
    if (r.width <= 0) return live;
    return Math.max(1, Math.min(5, Math.floor(((clientX - r.left) / r.width) * 5) + 1));
  };
  steps.addEventListener('pointerdown', e => {
    if (e.button != null && e.button !== 0) return;
    dragging = true; moved = false; startX = e.clientX; live = tierOf(p);
    steps.setPointerCapture?.(e.pointerId);
    const v = levelAt(e.clientX);
    if (v !== live) { live = v; paint(v); moved = true; }
    e.preventDefault();
  });
  steps.addEventListener('pointermove', e => {
    if (!dragging) return;
    if (Math.abs(e.clientX - startX) > 3) moved = true;
    const v = levelAt(e.clientX);
    // one tick per level crossed: the detent a physical slider would have, and
    // the only thing telling a thumb covering the meter that it moved
    if (v !== live) { live = v; paint(v); tick(); }
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    /* A tap that never moved and landed on the level already set clears back to
       the middle. Guarded on `moved` so a drag finishing where it started does
       not silently reset the player. */
    const v = !moved && live === tierOf(p) ? DEFAULT_TIER : live;
    if (v === tierOf(p)) { paint(v); return; }
    commit(v);
  };
  steps.addEventListener('pointerup', end);
  steps.addEventListener('pointercancel', () => {
    // the browser took the gesture as a scroll; put the meter back
    dragging = false; live = tierOf(p); paint(live);
  });

  wrap.append(steps, label);
  return wrap;
}

/** How many players are off the default, for the toggle's summary line. */
export function levelledCount() {
  return state.players.filter(p => tierOf(p) !== DEFAULT_TIER).length;
}

/** Put every player back to the middle. */
export function resetLevels() {
  for (const p of state.players) p.tier = DEFAULT_TIER;
  save();
  soon('levels', 'balance', ...AFTER_EDIT);
}
