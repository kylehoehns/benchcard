/* ================================================================== *
 * game-setup.js -- the current game's own inputs
 *
 * Two renderers that paint the settings a coach sets *before* a plan
 * exists: `renderSetup` (the day and game fields, the period shape, the
 * granularity chips and the card options) and `renderAvail` (the squad
 * row of who turned up). They belong together because neither reads a
 * plan -- everything here is an input to one.
 *
 * Two injections, one each. The gran chips change the shape of the game,
 * so they need a full repaint (`renderAll`); toggling a pill is an edit,
 * so it goes through the debounced scheduler (`soon` / `PLAN_ONLY`). Both
 * still live with the dispatcher in app.js until render.js.
 *
 * `renderSetup` calls `renderCardFold` directly: the card options it
 * paints are inside that fold, so the two are always in step.
 * ================================================================== */
import { riseIn } from './fx.js';
import { $, set, style, el } from './dom.js';
import { renderCardFold } from './card.js';
import { fitPills } from './pills.js';
import { state, game, teamName, colorOf, initials, noRoster, setAvailable, leagueMinutes,
         GRAN_CHOICES } from './state.js';

let renderAll = () => {};
let soon = () => {};
let PLAN_ONLY = [];

export function initGameSetup(renderAllFn, soonFn, planOnly) {
  renderAll = renderAllFn;
  soon = soonFn;
  PLAN_ONLY = planOnly;
}

export function renderSetup() {
  const g = game();
  set('#dayName', 'value', state.day.name);
  set('#dayName', 'placeholder', teamName() || 'Name this day…');
  set('#label', 'value', g.label);
  set('#when', 'value', g.when);
  set('#periods', 'value', g.periods);
  set('#periodMinutes', 'value', g.periodMinutes);
  renderFmtHint();
  renderGran(g);
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
   first rule of the session changed the collapsed row not at all. Same
   precedent as `renderFmtHint` below.

   At zero it is not a badge at all. `display: none` used to leave the row
   reading `› RULES` and nothing else, which is the one feature `ROADMAP.md`
   calls unclaimed territory introducing itself with a blank (A21b). It names
   what it holds instead, and `.zero` unsets the accent-soft pill so the hint
   does not read as an alert about something the coach has not done. Empty
   roster is the exception: the drawer says "Nobody available." there, and
   advertising what it can do is the same noise `availCountText` already
   refuses when it declines to write "0 of 0". */
const CONS_HINT = 'minutes, pairs, starters';

export function renderConsCount() {
  const g = game();
  const c = g.constraints;
  /* The league floor counts. It is not stored on the game -- `computeAll`
     composes it in on the way to the solver -- so counting the per-game maps
     alone reported "no rules" while a rule rewrote every available player's
     minutes (A24b). See `renderConstraints` for the matching copy. */
  const n = Object.keys(c.minMinutes).length + Object.keys(c.maxMinutes).length +
            c.pairs.length + c.avoids.length + c.openingFive.length + c.lastPeriodFive.length +
            (c.maxConsecutive ? 1 : 0) + (leagueMinutes() > 0 ? 1 : 0);
  const hint = n ? '' : noRoster() ? '' : CONS_HINT;
  set('#conscount', 'textContent', n ? String(n) : hint);
  set('#conscount', 'className', n ? 'count' : 'count zero');
  style('#conscount', 'display', n || hint ? '' : 'none');
}


/* The Game format summary, in the words a coach uses: "2 × 20 min". Exported
   because the two spinners repaint themselves in place -- `setup` is not in
   AFTER_EDIT, and a coach typing into #periods would otherwise watch the
   summary above their finger go stale until the next full render. Same
   precedent as the team-name field writing #dayName's placeholder in app.js. */
export function renderFmtHint() {
  const g = game();
  set('#fmthint', 'textContent', `${g.periods} × ${g.periodMinutes} min`);
}

// Direct chips beat a <select> here: on a phone the native picker for eight
// long options fills the screen for what is a one-tap decision.
function renderGran(g) {
  const box = $('#gran'); box.textContent = '';
  for (const c of GRAN_CHOICES) {
    const on = g.granMode === c.mode && (c.mode === 'breaksOnly' || g.granValue === c.value);
    const b = el('button', 'chip' + (on ? ' sel' : ''), c.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.onclick = () => {
      Object.assign(game(), { granMode: c.mode, granValue: c.value });
      renderAll();
    };
    box.append(b);
  }
}

function availCountText(g) {
  if (noRoster()) return '';   // "0 of 0" beside an empty box says nothing
  const outCount = g.out.length;
  return outCount
    ? `${state.players.length - outCount} of ${state.players.length} · ${outCount} out`
    : `${state.players.length - outCount} of ${state.players.length}`;
}

export function renderAvail() {
  const g = game(), box = $('#avail');
  box.textContent = '';
  const out = new Set(g.out);

  // Name the pill explicitly: the initials bubble is content, so the computed
  // name was "MW Marcus Webb". The state rides on aria-pressed.
  const paint = (b, p, on) => {
    b.className = 'plr press ' + (on ? 'on' : 'off');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', p.name || 'Unnamed');
  };

  for (const p of state.players) {
    const b = el('button', 'plr press');
    b.type = 'button';
    b.style.setProperty('--c', colorOf(p.id));
    paint(b, p, !out.has(p.id));
    b.append(el('span', 'av', initials(p)), el('span', 'nm', p.name || 'Unnamed'));
    b.onclick = () => {
      // Repaint this pill rather than rebuilding the row. A full re-render
      // destroyed the button the coach had just activated, so focus fell to
      // <body> and the screen reader announced nothing at all.
      const nowOut = !g.out.includes(p.id);
      // setAvailable, not a bare g.out edit: a live override naming a player
      // who has just been sat out has to go with them, or bench mode and the
      // printed card both keep them on the floor.
      setAvailable(g, p.id, !nowOut);
      paint(b, p, !nowOut);
      set('#availcount', 'textContent', availCountText(g));
      soon('strategy', ...PLAN_ONLY);
    };
    box.append(b);
  }
  set('#availcount', 'textContent', availCountText(g));
  fitPills(box);
  riseIn(box.querySelectorAll('.plr'), { delay: 0.012, from: 5 });
}
