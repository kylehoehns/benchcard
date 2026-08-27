/* The strategy body (`#stratbody`).
 *
 * `renderStrategy` paints the segmented control, its one-line note and
 * whichever editor the current strategy needs: the per-player minutes budget
 * (`minutesEditor` + the in-place `updateBudgetUI`), the closing window and
 * closers picker (`closersEditor`), or the platoon units (`platoonEditor`).
 * Balanced has no body at all, which is the point of it.
 *
 * Like every other view seam, the one thing it cannot own is the repaint
 * scheduler: `soon` and `PLAN_ONLY` live with the `render()` dispatcher in
 * app.js, so they come in through `initStrategy` at boot rather than this
 * module importing back into app.js and making the graph circular. The
 * `#stratseg` button wiring stays in app.js too -- picking a strategy is a
 * `renderAll()`, not a repaint of this section.
 */
import { fmtMinutes, deriveShortNames } from './engine.js';
import { icon } from './icons.js';
import { $, el } from './dom.js';
import { pickFive } from './pills.js';
import { state, game, byId, colorOf, minutesText, availIds, stintShape,
         normalizeTargets, rebalanceSlots, plans, STRATEGIES } from './state.js';

let soon = () => {};
let PLAN_ONLY = [];

export function initStrategy(scheduler, planOnly) {
  soon = scheduler;
  PLAN_ONLY = planOnly;
}

/* The summary hint, in the idiom every other fold on this page uses: a VALUE,
   not a sentence. Squad says "9 of 9", Game format says "2 x 20 min", so Plan
   says what the plan does in two or three words and the full sentence from
   `STRATEGIES` renders below the segment that chose it. Same four keys as
   `STRATEGIES` -- a strategy missing here shows an empty hint, which is what a
   missing sentence already did. */
const HINTS = {
  balanced: 'even minutes',
  minutes:  'minutes set by hand',
  closers:  'a group finishes',
  platoon:  'fixed fives',
};

export function renderStrategy() {
  const g = game();
  /* `aria-pressed` alongside the class, the way `balance.js` does it for the
     identical `.seg.wide` control three sections down: `.on` is a colour, and
     a screen reader cannot see a colour. Without it all four strategies read
     as plain buttons and the one the plan is actually using is announced no
     differently from the three it is not. */
  for (const b of document.querySelectorAll('#stratseg button')) {
    const on = b.dataset.strat === g.strategy;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  $('#stratnote').textContent = HINTS[g.strategy] || '';
  $('#stratwhy').textContent = STRATEGIES[g.strategy] || '';
  const box = $('#stratbody'); box.textContent = '';
  if (g.strategy === 'minutes') box.append(minutesEditor(g));
  else if (g.strategy === 'closers') box.append(closersEditor(g));
  else if (g.strategy === 'platoon') box.append(platoonEditor(g));
}

function minutesEditor(g) {
  normalizeTargets(g);
  const wrap = el('div');
  const ids = availIds(g);
  const shape = stintShape(g);
  const shorts = deriveShortNames(state.players);
  const c = g.constraints;
  const locked = new Set(c.lockedTargets);

  const budget = el('div', 'budget');
  budget.append(el('span', 'b-k', 'Budget'));
  const bv = el('span', 'b-v');
  bv.id = 'budgetVal';
  budget.append(bv);
  wrap.append(budget);

  const meter = el('div', 'meter');
  meter.id = 'budgetMeter';
  meter.append(el('i'), el('b'));
  wrap.append(meter);

  const msg = el('p', 'budget-msg');
  msg.id = 'budgetMsg';
  wrap.append(msg);

  for (const id of ids) {
    const row = el('div', 'srow' + (locked.has(id) ? ' locked' : ''));
    row.dataset.id = id;
    row.style.setProperty('--c', colorOf(id));
    const nm = el('div', 'nm');
    nm.append(el('span', 'dot'), el('span', null, shorts[id]));
    row.append(nm);

    const r = el('input');
    r.type = 'range'; r.min = '0'; r.max = String(shape.count); r.step = '1';
    r.value = String(c.targetSlots[id] || 0);
    r.disabled = locked.has(id);
    r.setAttribute('aria-label', `Target minutes for ${byId(id)?.name || id}`);
    // The slider counts stints; the coach thinks in minutes. Without this a
    // screen reader reads "4 of 8" — a number that appears nowhere on screen.
    r.setAttribute('aria-valuetext', minutesText(Number(r.value) * shape.avg));
    r.dataset.fk = `s:${id}`;
    // Mutate the other rows in place rather than re-rendering: rebuilding the
    // slider under the coach's finger loses pointer capture and kills the drag.
    // Only this player moves. Auto-redistribution meant fixing one slider
    // shoved another, and the coach ended up chasing values around the list.
    r.oninput = () => {
      c.targetSlots[id] = Number(r.value);
      updateBudgetUI(g);
      soon(...PLAN_ONLY);
    };
    row.append(r);

    const v = el('div', 'v');
    // `.act` stays empty until the plan disagrees with the number on this row.
    // Filled by refreshBudgetActuals, not here: during a drag the plan is a
    // repaint behind the thumb, so this is the one number that must wait.
    const act = el('span', 'act');
    act.hidden = true;
    v.append(el('span', 'mv', ''), el('small', null, 'm'), act);
    row.append(v);

    const lk = el('button', 'lockbtn');
    lk.setAttribute('aria-pressed', String(locked.has(id)));
    // The lock holds this number against "Even out the rest". It is not a
    // promise to the solver, and calling it a lock on the minutes made it
    // read like one.
    lk.title = locked.has(id) ? 'Stop holding this number' : 'Hold this number exactly';
    lk.append(icon(locked.has(id) ? 'lock' : 'lock-open', { size: '1.05em' }));
    lk.onclick = () => {
      c.lockedTargets = locked.has(id) ? c.lockedTargets.filter(x => x !== id) : [...c.lockedTargets, id];
      renderStrategy(); soon();
    };
    row.append(lk);
    wrap.append(row);
  }

  const acts = el('div', 'budget-acts');
  const spread = el('button', 'btn sm press', 'Even out the rest');
  spread.id = 'budgetSpread';
  spread.title = 'Share the unassigned minutes among the unlocked players';
  spread.onclick = () => {
    rebalanceSlots(g, null);
    renderStrategy(); soon(...PLAN_ONLY);
  };
  const reset = el('button', 'btn ghost sm press', 'Reset to even');
  reset.onclick = () => { c.targetSlots = {}; c.lockedTargets = []; renderStrategy(); soon(...PLAN_ONLY); };
  acts.append(spread, reset);
  wrap.append(acts);

  queueMicrotask(() => { updateBudgetUI(g); refreshBudgetActuals(); });
  return wrap;
}

// In-place refresh of the budget rows. Never rebuilds a node, so a drag keeps
// its pointer capture and the numbers track the thumb without a reflow.
function updateBudgetUI(g) {
  const c = g.constraints;
  const ids = availIds(g);
  const shape = stintShape(g);
  const capacity = shape.count * 5;
  const used = ids.reduce((a, id) => a + (c.targetSlots[id] || 0), 0);
  const deltaMin = (used - capacity) * shape.avg;
  const state2 = used > capacity ? 'over' : used < capacity ? 'under' : 'exact';

  const bv = $('#budgetVal');
  if (bv) {
    bv.textContent = `${fmtMinutes(used * shape.avg)} of ${fmtMinutes(shape.total * 5)} min`;
    bv.className = 'b-v ' + state2;
  }
  const meter = $('#budgetMeter');
  if (meter) {
    meter.className = 'meter ' + state2;
    meter.querySelector('i').style.width = `${Math.min(100, (used / capacity) * 100)}%`;
    // the overflow sits past the 100% mark so going over reads differently
    // from merely being full
    meter.querySelector('b').style.width = `${Math.max(0, Math.min(40, ((used - capacity) / capacity) * 100))}%`;
  }
  const msg = $('#budgetMsg');
  if (msg) {
    msg.className = 'budget-msg ' + state2;
    /* Say the rule, not just the arithmetic.
     *
     * The rule changed: spare minutes used to land on whichever row the solver
     * happened to pick, which in practice was the smallest ask -- dial someone
     * to 4 and they played 8. They are now shared out in proportion, so a small
     * ask stays small, and a locked row is left out of the sharing entirely.
     * `.act` below still shows what a row will really play when the two
     * disagree, which is the case a thin bench can still produce. */
    msg.textContent = state2 === 'exact'
      ? 'Adds up exactly, so the plan uses these numbers as they are.'
      : state2 === 'under'
        ? `${fmtMinutes(-deltaMin)} min still to give out, shared out in proportion, so every number drifts up a little. Lock a row to hold it exactly.`
        : `${fmtMinutes(deltaMin)} min more than the game has. Somebody falls short of their number.`;
  }
  const sp = $('#budgetSpread');
  if (sp) sp.disabled = state2 === 'exact';

  for (const id of ids) {
    const row = document.querySelector(`.srow[data-id="${CSS.escape(id)}"]`);
    if (!row) continue;
    const slots = c.targetSlots[id] || 0;
    const r = row.querySelector('input[type=range]');
    if (r && document.activeElement !== r) r.value = String(slots);
    if (r) {
      r.style.setProperty('--fill', `${shape.count ? (slots / shape.count) * 100 : 0}%`);
      // Updated even while focused — that is exactly when it gets spoken.
      r.setAttribute('aria-valuetext', minutesText(slots * shape.avg));
    }
    const mv = row.querySelector('.mv');
    if (mv) mv.textContent = fmtMinutes(slots * shape.avg);
  }
}

/* What the plan actually gives each player, said on the row that asked for
   something else.
 *
 * A minute target is honoured exactly only when the targets add up to the
 * whole floor budget; under or over that, the solver has to place the
 * difference somewhere and a hand-set number can come back four times bigger.
 * That was true before this function existed -- it just happened silently,
 * with the coach's 4 and the plan's 16 two hundred pixels apart on the same
 * screen and nothing joining them.
 *
 * Its own repaint section ('budget') rather than part of `updateBudgetUI`,
 * because that one runs under the coach's finger mid-drag when `plans` is
 * still the previous plan. This one only ever runs after a solve. */
export function refreshBudgetActuals() {
  const g = game();
  if (!g || g.strategy !== 'minutes') return;
  const p = plans[state.activeGame];
  const shape = stintShape(g);
  for (const id of availIds(g)) {
    const row = document.querySelector(`.srow[data-id="${CSS.escape(id)}"]`);
    const act = row?.querySelector('.act');
    if (!act) continue;
    const want = (g.constraints.targetSlots[id] || 0) * shape.avg;
    const got = p?.ok ? (p.minutes[id] || 0) : null;
    // half a minute of slack: uneven stint lengths make an exactly-met target
    // land a rounding hair away from the slider's own arithmetic
    const off = got != null && Math.abs(got - want) >= 0.5;
    /* A `.missed` class was toggled on the row here and no stylesheet ever
       carried a rule for it. The correction is already said out loud by `.act`
       below, in `--warn`, on the row it belongs to; a second tint would be the
       same sentence twice. Removed 2026-08-24 by the dead-class sweep. */
    act.hidden = !off;
    act.textContent = off ? `plays ${fmtMinutes(got)}` : '';
    const r = row.querySelector('input[type=range]');
    // spoken as one phrase: the target on its own is the number that is wrong
    if (r) r.setAttribute('aria-valuetext',
      minutesText(want) + (off ? `, plan gives ${minutesText(got)}` : ''));
  }
}

function closersEditor(g) {
  const c = g.constraints;
  const shape = stintShape(g);
  const wrap = el('div');

  const hd = el('div', 'pickhd');
  hd.append(el('span', 't', 'Closing window'));
  wrap.append(hd);

  const chips = el('div', 'chips');
  for (let n = 1; n <= Math.min(6, shape.count); n++) {
    const on = Math.min(c.closing.stints, shape.count) === n;
    const b = el('button', 'chip press' + (on ? ' sel' : ''), `last ${fmtMinutes(n * shape.avg)} min`);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.onclick = () => { c.closing.stints = n; renderStrategy(); soon(...PLAN_ONLY); };
    chips.append(b);
  }
  wrap.append(chips);

  wrap.append(pickFive(c.closing.players, (id, on) => {
    c.closing.players = on ? [...c.closing.players, id] : c.closing.players.filter(x => x !== id);
    renderStrategy(); soon(...PLAN_ONLY);
  }, { title: 'Who closes' }));
  // Said at the picker as well as in the issues list: this is the control that
  // is doing nothing, and the issues list is a scroll away on a phone. Not with
  // an empty roster though -- there is no plan of any kind to compare to, and
  // the timeline is already asking for players.
  if (!c.closing.players.length && availIds(g).length) {
    wrap.append(el('p', 'budget-msg', 'Until you pick someone, this plans exactly like Balanced.'));
  }
  return wrap;
}

function platoonEditor(g) {
  const c = g.constraints;
  const wrap = el('div');
  if (!c.units.length) c.units = [[]];

  c.units.forEach((unit, i) => {
    const card = el('div', 'unit');
    const hd = el('div', 'uhd');
    hd.append(el('span', 't', `Unit ${i + 1}`));
    hd.append(el('span', 'spacer'));
    if (c.units.length > 1) {
      /* The glyph is the whole visible label, so it is the whole ACCESSIBLE
         name too -- "times, button", repeated once per unit, with nothing to
         say which one it deletes. Smoke's accessible-name check passes it
         because `×` is not empty, which is that check working correctly.
         Named the way the roster's own ✕ is, and typed the way every other
         button this app builds is. */
      const rm = el('button', 'xbtn', '×');
      rm.type = 'button';
      rm.setAttribute('aria-label', `Remove unit ${i + 1}`);
      rm.onclick = () => { c.units.splice(i, 1); renderStrategy(); soon(); };
      hd.append(rm);
    }
    card.append(hd);
    const taken = new Set(c.units.filter((_, j) => j !== i).flat());
    card.append(pickFive(unit, (id, on) => {
      c.units[i] = on ? [...c.units[i], id] : c.units[i].filter(x => x !== id);
      renderStrategy(); soon(...PLAN_ONLY);
    }, { title: 'On the floor', taken }));
    wrap.append(card);
  });

  const add = el('button', 'btn sm', '+ Add unit');
  add.style.marginTop = '.7rem';
  add.onclick = () => { c.units.push([]); renderStrategy(); soon(); };
  wrap.append(add);
  return wrap;
}
