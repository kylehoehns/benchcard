/* The Rules group, and the switch groups beside it, inside the Plan sheet
 * (#28). `renderConstraints` paints level 1: the Rules rows (from the pure
 * `ruleItems(g)` in state.js), the "Add a rule" row, and the three switch
 * groups that are not really rules (`#planPairs`, `#planDay`, `#planSeason`).
 * It never repaints an open level-2 page.
 *
 * The two level-2 pages this file owns -- a rule's detail, and Add a rule --
 * are built into `#planSub` and pushed with `pushPlanPane` (game-setup.js),
 * which sets the header chrome and wires `resetPlanChrome` as the pop
 * callback so the chrome resets whichever way the coach goes back.
 *
 * Like every other view seam, the one thing it cannot own is the repaint
 * path: every edit here goes through `edit(kind)` (#122, `app/edit.js`),
 * handed in through `initRules` at boot rather than this module importing
 * back into app.js and making the graph circular.
 */
import { icon } from './icons.js';
import { el, $ } from './dom.js';
import { fmtMinutes } from './engine.js';
import { state, game, byId, plans, seasonAdjust, availIds,
         ruleItems, removeRule, ruleComplete, keepOnList, EVEN_OUT_DAY_LABEL } from './state.js';
import { pickFive } from './pills.js';
import { pushPlanPane, stepperRow } from './game-setup.js';
import { popPane } from './trap.js';
import { undoable } from './toast.js';

let edit = () => {};

export function initRules(editFn) {
  edit = editFn;
}

/* ---------------- level 1: the rules list and the switch groups -------- */

export function renderConstraints() {
  const g = game(), c = g.constraints;
  const avail = availIds(g);

  // The header and footer sit on the sheet background, outside the white
  // card (decision 3) -- `wrap` (`#constraints`) holds all three as
  // siblings; only `box` gets the `.pgrp` card look.
  const wrap = $('#constraints');
  wrap.className = '';
  wrap.textContent = '';
  wrap.append(el('div', 'pgrp-h', 'Rules'));

  const box = el('div', 'pgrp');
  const items = ruleItems(g);
  items.forEach((item, idx) => box.append(ruleRow(item, idx)));

  const addRow = el('button', 'prow add-rule');
  addRow.type = 'button';
  addRow.append(icon('plus', { size: '1rem', cls: 'prow-icon' }), el('span', 'prow-t', 'Add a rule'));
  addRow.disabled = !avail.length;
  addRow.onclick = () => renderAddRule(addRow);
  box.append(addRow);
  wrap.append(box);

  if (!avail.length) wrap.append(el('p', 'pgrp-f', 'Nobody available.'));
  else if (!items.length) wrap.append(el('p', 'pgrp-f', 'No rules yet. The plan just evens out the minutes.'));

  renderPairsGroup(c);
  renderDayGroup(g);
  renderSeasonGroup(g);
  renderSeasonAdjust();
}

function ruleRow(item, idx) {
  const b = el('button', 'prow');
  b.type = 'button';
  b.append(el('span', 'prow-t', item.text));
  b.append(icon('chevron_right', { size: '.8rem', cls: 'prow-chev' }));
  b.onclick = () => openRuleDetail(item, idx, b);
  return b;
}

/* Exported for #32 step 3, which shows the same "Even out earlier games"
   switch inside the Add-a-game flow. One switch builder, two callers. */
export function switchRow(label, checked, disabled, onChange, fk) {
  const row = el('label', 'prow');
  const input = el('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.checked = checked;
  input.disabled = disabled;
  if (fk) input.dataset.fk = fk;
  input.onchange = () => onChange(input.checked);
  // The label sits on the left, the switch at the row's right end (the
  // prototype's layout) -- the row itself is still the whole target either
  // way, since `<label>` links both children to the input.
  row.append(el('span', 'prow-t', label), input);
  return row;
}

function renderPairsGroup(c) {
  const wrap = $('#planPairs');
  if (!wrap) return;
  wrap.textContent = '';
  if (!c.pairs.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const box = el('div', 'pgrp');
  box.append(switchRow('Force Together every stint', c.hardPairs, false, v => {
    c.hardPairs = v; renderConstraints(); edit('pairs');
  }));
  wrap.append(box);
  wrap.append(el('p', 'pgrp-f', 'Left off, the plan maximizes their shared floor time and reports it.'));
}

function renderDayGroup(g) {
  const wrap = $('#planDay');
  if (!wrap) return;
  wrap.textContent = '';
  wrap.append(el('div', 'pgrp-h', 'Across the day'));
  const box = el('div', 'pgrp');
  const first = state.activeGame === 0;
  box.append(switchRow(EVEN_OUT_DAY_LABEL, !first && g.useCarryover, first, v => {
    g.useCarryover = v; renderConstraints(); edit('dayCarryover');
  }));
  wrap.append(box);
  wrap.append(el('p', 'pgrp-f', first
    ? "This is the first game today, so there's nothing to even out."
    : 'Players who got fewer minutes earlier today get more here.'));
}

function renderSeasonGroup(g) {
  const wrap = $('#planSeason');
  if (!wrap) return;
  const hasSeason = (state.season?.games || []).length > 0;
  wrap.hidden = !hasSeason;
  wrap.textContent = '';
  if (!hasSeason) return;
  wrap.append(el('div', 'pgrp-h', 'Across the season'));
  const box = el('div', 'pgrp');
  box.append(switchRow('Even out the season so far', g.useSeasonTargets, false, v => {
    g.useSeasonTargets = v;
    // Its consequence comes from a solve, so it waits for one rather than
    // repainting immediately -- `data-fk` rides the checkbox's own identity
    // back through that repaint (`withFocus`, trap.js).
    edit('seasonCarryover');
  }, 'seasoncarry'));
  wrap.append(box);
  wrap.append(el('p', 'pgrp-f', 'Opens each player’s minutes ahead or behind by how far they are off their share '
    + 'of the season. At most two stints either way, and never over a limit or a locked number.'));
  const host = el('div', 'seasonadj');
  host.id = 'seasonadj';
  wrap.append(host);
}

/* What the adjustment did, and why, in the numbers the solver was handed.
 *
 * A target that moved with no sentence beside it is the thing that makes a
 * tool untrustworthy, so this is not decoration -- it is the other half of the
 * feature. `seasonAdjust` is filled by `computeAll`, so everything below is
 * read and never recomputed: the number on screen is the number the plan was
 * built from.
 *
 * Its own repaint section rather than part of `renderConstraints`, for the
 * same reason `refreshBudgetActuals` is: it is the only thing in this file
 * that depends on a SOLVE, so it has to refresh when a player is marked
 * absent or the format changes, and `constraints` cannot be in `AFTER_EDIT`
 * because the rule editor holds a select and two number inputs the coach may
 * be part-way through. It contains no focusable control, so rebuilding it in
 * place is safe. Only its host's DOM location moved (#28): it now sits inside
 * `#planSeason` rather than the old `.rule-switches` block. */
export function renderSeasonAdjust() {
  const host = document.querySelector('#seasonadj');
  if (!host) return;
  host.textContent = '';
  const g = game();
  const a = seasonAdjust[g.id];
  if (!a || !a.on) return;
  const nm = id => byId(id)?.name || id;   // sentences about a child, so full names
  const say = t => host.append(el('p', 'pgrp-f', t));

  if (a.reason === 'strategy') {
    return say(g.strategy === 'platoon'
      ? 'Not used with fixed units. The fives you set decide who plays.'
      : 'Not used with hand-set minutes. The sliders above are already your targets.');
  }
  if (a.reason === 'nobody') return say('Nobody is available for this game yet.');
  if (a.reason === 'locked') return say('Every player is locked to a number, so there is nothing to even out.');
  if (a.reason === 'impossible') {
    return say('The minute limits on this game leave no room to even the season out, so nothing moved.');
  }

  /* Listed by their own DEBT, not by how far their target moved. Centring the
     adjustments so they still add up shifts everyone who is level by the same
     fraction of a minute, and listing those rows filled the panel with
     "Eli Tran opens at 17.1 min — 0 up on the season", which is noise wearing
     the shape of a finding. They are named collectively below instead. */
  const moved = Object.entries(a.targets || {})
    .filter(([id]) => Math.abs(a.deficit[id] || 0) >= 0.5)
    .sort((x, y) => (a.deficit[y[0]] || 0) - (a.deficit[x[0]] || 0));
  if (a.reason === 'level' || !moved.length) {
    return say(`Everyone is within half a minute of their share, so all ${fmtMinutes(a.even)} min the same.`);
  }

  say(`Even share today is ${fmtMinutes(a.even)} min.`);
  const p = plans[state.activeGame];
  const ul = el('ul', 'adjlist');
  for (const [id, t] of moved) {
    const d = a.deficit[id] || 0;
    const li = el('li');
    li.append(el('b', null, `${nm(id)} opens at ${fmtMinutes(t)} min`));
    li.append(el('span', null, ` · ${fmtMinutes(Math.abs(d))} ${d > 0 ? 'down' : 'up'} on the season`));
    /* A target is an ask, and minutes come in whole stints: 10 minutes of
       4-minute stints is 8 or 12, never 10. Saying so on the row is the same
       promise the budget editor makes -- the coach's number and the plan's
       number must never sit on one screen without something joining them. */
    const got = p && p.ok ? p.minutes[id] : null;
    if (got != null && Math.abs(got - t) >= 0.5) li.append(el('i', 'act', ` · plays ${fmtMinutes(got)}`));
    ul.append(li);
  }
  host.append(ul);
  const rest = Object.keys(a.targets).length - moved.length;
  if (rest > 0) say(`The other ${rest} share the difference.`);
  if (a.locked?.length) {
    say(`${a.locked.map(nm).join(', ')} ${a.locked.length === 1 ? 'is locked and stays' : 'are locked and stay'} on the even share.`);
  }
}

/* ---------------- level 2: a rule's detail ------------------------------ */

function openRuleDetail(item, idx, trigger) {
  const sub = $('#planSub');
  sub.textContent = '';
  sub.append(el('p', 'plan-rule-sentence', item.text));
  if (item.removable) {
    const grp = el('div', 'pgrp');
    const rm = el('button', 'prow prow-center prow-danger', 'Remove rule');
    rm.type = 'button';
    rm.onclick = () => removeRuleFlow(item, idx);
    grp.append(rm);
    sub.append(grp);
  } else {
    sub.append(el('p', 'pgrp-f', 'Your league minimum. Change it in Settings.'));
  }
  pushPlanPane(trigger, { title: 'Rule' });
}

function removeRuleFlow(item, idx) {
  const g = game(), c = g.constraints;
  undoable('Rule removed.', () => removeRule(c, item), isUndo => {
    renderConstraints();
    edit('rule');
    // Only on the way OUT: an undo repaints level 1 in place and the sheet
    // was already there (item 4's "the sheet is still open").
    if (!isUndo) {
      popPane($('#sheetPlan'));
      focusRuleRowAfterRemove(idx);
    }
  });
}

function focusRuleRowAfterRemove(idx) {
  const rows = [...$('#constraints').querySelectorAll('.prow')].filter(b => !b.classList.contains('add-rule'));
  (rows[idx] || $('#constraints .add-rule'))?.focus({ preventScroll: true });
}

/* ---------------- level 2: Add a rule ----------------------------------- */

// Decision 9's order and the prototype's plainer labels. `scripts/feature-
// keys.mjs`'s `shipped().rule` reads this exact array by name and shape, so
// an eighth kind here is an eighth kind there rather than a silent gap (A19).
const KINDS = [
  ['minimum', 'Plays at least'],
  ['cap', 'Plays at most'],
  ['apart', 'Apart'],
  ['together', 'Together'],
  ['keepon', 'One of two on'],
  ['starts', 'Starting five'],
  ['lastq', 'Last-period five'],
  ['rest', 'Rest limit'],
];

// The draft is module state, reset on each push (Design > State).
let draft = { kind: 'minimum' };

function defaultMinutes(g) {
  const total = g.periods * g.periodMinutes;
  return Math.max(1, Math.min(12, total));
}

function renderAddRule(trigger) {
  const g = game();
  draft = { kind: 'minimum', minutes: defaultMinutes(g) };
  const sub = $('#planSub');
  sub.textContent = '';
  const kindsBox = el('div', 'chips plan-kinds');
  sub.append(kindsBox);
  const body = el('div');
  body.id = 'planKindBody';
  sub.append(body);
  paintKindChips(kindsBox);
  renderKindBody();
  pushPlanPane(trigger, { title: 'Add a rule', showAddRule: true });
}

function paintKindChips(box) {
  box.textContent = '';
  for (const [k, label] of KINDS) {
    const b = el('button', 'chip press' + (draft.kind === k ? ' sel' : ''), label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(draft.kind === k));
    b.onclick = () => {
      // Changing the kind keeps the minutes and clears the players.
      draft = { kind: k, minutes: draft.minutes, n: k === 'rest' ? 2 : undefined };
      paintKindChips(box);
      renderKindBody();
    };
    box.append(b);
  }
}

function renderKindBody() {
  const g = game(), c = g.constraints;
  const body = $('#planKindBody');
  if (!body) return;
  body.textContent = '';

  if (draft.kind === 'minimum' || draft.kind === 'cap') {
    body.append(pickFive(draft.id ? [draft.id] : [], (id, on) => {
      draft.id = on ? id : null;
      renderKindBody();
    }, { max: 1, replace: true, title: 'Pick a player' }));
    const grp = el('div', 'pgrp');
    const lo = draft.kind === 'cap' ? 0 : 1;
    grp.append(stepperRow('Minutes', () => draft.minutes, v => { draft.minutes = v; }, lo, 40, 'minutes', syncAddRuleBtn));
    body.append(grp);
  } else if (draft.kind === 'together' || draft.kind === 'apart' || draft.kind === 'keepon') {
    body.append(pickFive([draft.a, draft.b].filter(Boolean), (id, on) => {
      if (on) { if (!draft.a) draft.a = id; else if (!draft.b) draft.b = id; }
      else if (draft.a === id) { draft.a = draft.b; draft.b = null; }
      else if (draft.b === id) draft.b = null;
      renderKindBody();
    }, { max: 2, title: 'Pick two players' }));
  } else if (draft.kind === 'starts' || draft.kind === 'lastq') {
    body.append(pickFive(draft.ids || [], (id, on) => {
      draft.ids = on ? [...(draft.ids || []), id] : (draft.ids || []).filter(x => x !== id);
      renderKindBody();
    }, { max: 5, title: 'Pick up to five' }));
  } else if (draft.kind === 'rest') {
    const grp = el('div', 'pgrp');
    grp.append(stepperRow('Stints in a row', () => draft.n, v => { draft.n = v; }, 1, 4, 'stints', syncAddRuleBtn));
    body.append(grp);
  }

  const replaces = (draft.kind === 'starts' && c.openingFive.length)
    || (draft.kind === 'lastq' && c.lastPeriodFive.length)
    || (draft.kind === 'rest' && c.maxConsecutive);
  if (replaces) body.append(el('p', 'pgrp-f', 'Replaces the one you have.'));

  syncAddRuleBtn();
}

function syncAddRuleBtn() {
  const add = $('#planAddRuleBtn');
  if (!add) return;
  add.disabled = !ruleComplete(draft.kind, draft);
  add.onclick = commitAddRule;
}

// Adds [a, b] to a pair list unless some pair already names both -- the same
// "no duplicate rule" check for `together`, `apart` and `keepon` below.
const addPairOnce = (list, a, b) => {
  if (!list.some(pr => pr.includes(a) && pr.includes(b))) list.push([a, b]);
};

function commitAddRule() {
  const g = game(), c = g.constraints;
  if (!ruleComplete(draft.kind, draft)) return;
  switch (draft.kind) {
    case 'minimum': c.minMinutes[draft.id] = draft.minutes; break;
    case 'cap': c.maxMinutes[draft.id] = draft.minutes; break;
    case 'together': addPairOnce(c.pairs, draft.a, draft.b); break;
    case 'apart': addPairOnce(c.avoids, draft.a, draft.b); break;
    case 'keepon': addPairOnce(keepOnList(c), draft.a, draft.b); break;
    case 'starts': c.openingFive = [...draft.ids]; break;
    case 'lastq': c.lastPeriodFive = [...draft.ids]; break;
    case 'rest': c.maxConsecutive = draft.n; break;
    default: return;
  }
  renderConstraints();
  edit('rule');
  popPane($('#sheetPlan'));
  $('#constraints .add-rule')?.focus({ preventScroll: true });
}
