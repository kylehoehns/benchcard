/* The rules body (`#constraints`).
 *
 * Owns `openRule` -- which "add a rule" chip is expanded -- and the two
 * functions that draw the section: the active rules as removable chips, the
 * kind picker, the editor for whichever kind is open, and the two switches
 * that are not really rules (`hardPairs`, `useCarryover`).
 *
 * Like every other view seam, the one thing it cannot own is the repaint
 * scheduler: `soon` and `PLAN_ONLY` live with the `render()` dispatcher in
 * app.js, so they come in through `initRules` at boot rather than this
 * module importing back into app.js and making the graph circular.
 */
import { icon } from './icons.js';
import { el, $ } from './dom.js';
import { deriveShortNames, fmtMinutes } from './engine.js';
import { state, game, byId, plans, seasonAdjust, leagueMinutes } from './state.js';
import { pickFive } from './pills.js';
import { renderConsCount } from './game-setup.js';

let soon = () => {};
let PLAN_ONLY = [];

export function initRules(scheduler, planOnly) {
  soon = scheduler;
  PLAN_ONLY = planOnly;
}

/* ---------------- rules ----------------
 * Additive rather than tabular. A grid of ten empty min/cap boxes is mostly
 * waste -- a coach sets a limit on one or two players a game -- so nothing
 * shows until a rule exists, and each one reads back as a plain sentence.
 * -------------------------------------------------------------------- */
let openRule = null;

/* `keepOnFloor` is newer than the records already in a coach's browser, and
   only `sanitizeTeam` fills it in. Created lazily in one place so neither the
   chip list nor the editor has to think about the absent key. */
const keepOnList = c => (c.keepOnFloor || (c.keepOnFloor = []));

export function renderConstraints() {
  const g = game(), c = g.constraints;
  /* Before the empty-roster return below: the badge on the collapsed row is
     this section's own summary, and every rule edit in this file repaints the
     body by calling straight back in here rather than through a section the
     scheduler knows about. Without this the count only moved on a full render. */
  renderConsCount();
  const out = new Set(g.out);
  const avail = state.players.filter(p => !out.has(p.id));
  const box = $('#constraints'); box.textContent = '';
  if (!avail.length) { box.append(el('div', 'empty', 'Nobody available.')); return; }

  const shorts = deriveShortNames(state.players);
  const nm = id => shorts[id] || byId(id)?.name || id;

  /* ---- active rules, as removable chips ---- */
  const chips = el('div', 'rulechips');
  const chip = (text, onX, tone) => {
    const k = el('span', 'rchip' + (tone ? ' ' + tone : ''));
    k.append(el('span', null, text));
    const x = el('button', 'x press');
    x.type = 'button';
    x.append(icon('x', { size: '.9em', stroke: 2.4 }));
    x.setAttribute('aria-label', 'Remove rule');
    x.onclick = () => { onX(); renderConstraints(); soon(...PLAN_ONLY); };
    k.append(x);
    return k;
  };

  for (const [id, v] of Object.entries(c.minMinutes)) {
    if (!avail.some(p => p.id === id)) continue;
    chips.append(chip(`${nm(id)} plays at least ${v} min`, () => delete c.minMinutes[id]));
  }
  for (const [id, v] of Object.entries(c.maxMinutes)) {
    if (!avail.some(p => p.id === id)) continue;
    chips.append(chip(`${nm(id)} capped at ${v} min`, () => delete c.maxMinutes[id]));
  }
  c.pairs.forEach((pr, i) => chips.append(chip(`${nm(pr[0])} + ${nm(pr[1])} together`, () => c.pairs.splice(i, 1), 'ok')));
  c.avoids.forEach((pr, i) => chips.append(chip(`${nm(pr[0])} / ${nm(pr[1])} apart`, () => c.avoids.splice(i, 1), 'err')));
  /* Untoned on purpose: green and red are a matched pair here -- must share the
     floor, must not -- and a third green chip would blur what the colour says. */
  keepOnList(c).forEach((pr, i) => chips.append(chip(`${nm(pr[0])} or ${nm(pr[1])} always on`, () => c.keepOnFloor.splice(i, 1))));
  if (c.openingFive.length) chips.append(chip(`Starts: ${c.openingFive.map(nm).join(' ')}`, () => { c.openingFive = []; }));
  if (c.lastPeriodFive.length) chips.append(chip(`Last period: ${c.lastPeriodFive.map(nm).join(' ')}`, () => { c.lastPeriodFive = []; }));
  if (c.maxConsecutive) chips.append(chip(`Max ${c.maxConsecutive} stint${c.maxConsecutive > 1 ? 's' : ''} in a row`, () => { c.maxConsecutive = 0; }));

  /* The league floor is a rule, set on the Team tab rather than here: `computeAll`
     composes it into a CLONE of the constraints on the way to the solver, so it
     never appears in the maps above. Saying "no rules yet, the plan just evens
     out the minutes" while every available player carries a floor contradicts
     `#issues` four inches away, which names each of them (A24b). Not a chip --
     it is not removable from here, and an X that cannot undo it would be a
     worse lie than the sentence was. */
  const lmin = leagueMinutes();
  if (chips.children.length) box.append(chips);
  if (lmin > 0) {
    box.append(el('p', 'note',
      `Everyone available plays at least ${lmin} min. Your league minimum, set on the Team tab.`));
  } else if (!chips.children.length) {
    box.append(el('p', 'note', 'No rules yet. The plan just evens out the minutes.'));
  }

  /* ---- add a rule ---- */
  const addHd = el('div', 'pickhd');
  addHd.append(el('span', 't', 'Add a rule'));
  box.append(addHd);

  const KINDS = [
    ['limit', 'Minutes limit'], ['starts', 'Starting five'], ['lastq', 'Last period'],
    ['together', 'Play together'], ['apart', 'Keep apart'], ['keepon', 'Always one on'],
    ['rest', 'Rest limit'],
  ];
  const kinds = el('div', 'chips');
  for (const [k, t] of KINDS) {
    const b = el('button', 'chip press' + (openRule === k ? ' sel' : ''), t);
    b.type = 'button';
    // A real toggle -- clicking the open kind closes it again -- so `.sel`
    // has a matching state to announce, the way every other `.chip` in the
    // app already announces its own.
    b.setAttribute('aria-pressed', String(openRule === k));
    b.onclick = () => { openRule = openRule === k ? null : k; renderConstraints(); };
    kinds.append(b);
  }
  box.append(kinds);
  if (openRule) box.append(ruleEditor(openRule, avail, c));

  /* ---- switches that are not really rules ---- */
  const sw = el('div', 'rule-switches');
  const mk = (checked, label2, note, onch, opts = {}) => {
    const w = el('div');
    const l = el('label', 'switch');
    const i2 = el('input'); i2.type = 'checkbox'; i2.checked = checked;
    if (opts.fk) i2.dataset.fk = opts.fk;
    i2.onchange = () => {
      onch(i2.checked);
      /* A switch whose consequence is drawn from the solve has to wait for
         one, so it repaints itself through the scheduler instead -- and rides
         `data-fk` back to the checkbox afterwards. The others describe only
         what was just clicked, so they repaint immediately. */
      if (opts.afterSolve) soon('constraints', ...PLAN_ONLY);
      else { renderConstraints(); soon(...PLAN_ONLY); }
    };
    l.append(i2, el('span', null, label2));
    w.append(l);
    if (note) w.append(el('p', 'note', note));
    if (opts.body) w.append(opts.body);
    return w;
  };
  sw.append(mk(c.hardPairs, 'Force “together” pairs every stint',
    'Left off, the plan maximises their shared floor time and reports it.',
    v => { c.hardPairs = v; }));
  if (state.activeGame > 0) {
    sw.append(mk(g.useCarryover, 'Balance against minutes already played today',
      'Later games even out the whole day rather than each game on its own.',
      v => { g.useCarryover = v; }));
  }
  /* Season carryover (B3). The switch does not exist until the season does:
     a coach who has never finished a game sees nothing new here at all. */
  if ((state.season?.games || []).length) {
    const host = el('div', 'seasonadj');
    host.id = 'seasonadj';
    sw.append(mk(g.useSeasonTargets, 'Even out the season so far',
      'Opens each player’s minutes ahead or behind by how far they are off their share of the season. At most two stints either way, and never over a limit or a locked number.',
      v => { g.useSeasonTargets = v; },
      { fk: 'seasoncarry', afterSolve: true, body: host }));
  }
  box.append(sw);
  renderSeasonAdjust();
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
 * place is safe. */
export function renderSeasonAdjust() {
  const host = document.querySelector('#seasonadj');
  if (!host) return;
  host.textContent = '';
  const g = game();
  const a = seasonAdjust[g.id];
  if (!a || !a.on) return;
  const nm = id => byId(id)?.name || id;   // sentences about a child, so full names
  const say = t => host.append(el('p', 'note', t));

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

function ruleEditor(kind, avail, c) {
  const wrap = el('div', 'ruleedit');
  const sel = (ph) => {
    const s2 = el('select');
    s2.append(el('option', null, ph));
    for (const p of avail) { const o = el('option', null, p.name || p.id); o.value = p.id; s2.append(o); }
    return s2;
  };

  if (kind === 'limit') {
    const who = sel('Choose a player…');
    const min = el('input', 'mini'); min.type = 'number'; min.min = '0'; min.placeholder = 'min'; min.inputMode = 'numeric';
    const cap = el('input', 'mini'); cap.type = 'number'; cap.min = '0'; cap.placeholder = 'cap'; cap.inputMode = 'numeric';
    const add = el('button', 'btn sm press', 'Add');
    add.onclick = () => {
      if (!who.value) return;
      if (min.value !== '') c.minMinutes[who.value] = Number(min.value);
      if (cap.value !== '') c.maxMinutes[who.value] = Number(cap.value);
      openRule = null; renderConstraints(); soon(...PLAN_ONLY);
    };
    wrap.append(who, min, cap, add);
    wrap.append(el('p', 'note', 'Fill either box. A minimum guarantees floor time; a cap holds someone back.'));
    return wrap;
  }

  if (kind === 'together' || kind === 'apart' || kind === 'keepon') {
    const a = sel('Player…'), b = sel('Player…');
    const list = kind === 'together' ? c.pairs : kind === 'apart' ? c.avoids : keepOnList(c);
    const add = el('button', 'btn sm press', 'Add');
    add.onclick = () => {
      if (!a.value || !b.value || a.value === b.value) return;
      if (!list.some(x => x.includes(a.value) && x.includes(b.value))) list.push([a.value, b.value]);
      openRule = null; renderConstraints(); soon(...PLAN_ONLY);
    };
    wrap.append(a, b, add);
    // "apart" is about the floor and this is about the bench, so say which.
    if (kind === 'keepon') {
      wrap.append(el('p', 'note', 'One of these two is on the floor every stint: a ball handler, or a big. They are never both resting at once.'));
    }
    return wrap;
  }

  if (kind === 'rest') {
    const chips = el('div', 'chips');
    for (const n of [1, 2, 3, 4]) {
      const b = el('button', 'chip press' + (c.maxConsecutive === n ? ' sel' : ''), `${n} stint${n > 1 ? 's' : ''}`);
      b.type = 'button';
      // The picker's own editor, and the same `.sel` chip as the kinds above.
      b.setAttribute('aria-pressed', String(c.maxConsecutive === n));
      b.onclick = () => { c.maxConsecutive = c.maxConsecutive === n ? 0 : n; openRule = null; renderConstraints(); soon(...PLAN_ONLY); };
      chips.append(b);
    }
    wrap.classList.add('stack');
    wrap.append(chips, el('p', 'note', 'The most stints anyone plays back to back. Needs bench depth to apply.'));
    return wrap;
  }

  // starts / lastq -> the same five-picker used for closers
  const key = kind === 'starts' ? 'openingFive' : 'lastPeriodFive';
  wrap.classList.add('stack');
  wrap.append(pickFive(c[key], (id, on) => {
    c[key] = on ? [...c[key], id] : c[key].filter(x => x !== id);
    renderConstraints(); soon(...PLAN_ONLY);
  }, { title: kind === 'starts' ? 'On the floor at tip-off' : 'On the floor to start the last period' }));
  return wrap;
}
