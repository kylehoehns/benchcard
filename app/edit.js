/* ================================================================== *
 * edit.js -- the one path every coach edit takes: save it, retire the
 * undo offer, and repaint whatever the change touched.
 *
 * Before #122 each handler picked its own save/repaint call and its own
 * repaint keys, and only `soon()` (render.js) ran the "an edit happened"
 * hooks -- so a handler that called `render()`/`renderAll()` directly, as
 * the strategy segment did, never retired a pending Undo. `EDITS` is the
 * one table naming, per kind of change, whether it is a record edit or a
 * preference, which `SECTIONS` keys (render.js) it repaints, and whether
 * it paints now or after the same 140ms debounce `soon()` used to own.
 *
 * No view import, and nothing here touches the DOM at import time or at
 * any other time: the painter and `retireUndo` are handed in once, at
 * boot, through `initEdits` -- the same `init*` shape every view module
 * already takes its own callbacks through, so this file can be imported
 * by render.js without closing the graph into a cycle (render.js already
 * imports fifteen view modules; nothing may import it back).
 * ================================================================== */
import { state, save, editHappened, takeFirstRunPending } from './state.js';
import { track, bucketRoster } from './analytics.js';

/* Moved from render.js, which no longer names them: the whole repaint
 * vocabulary an edit is allowed to touch. One definition each, kept beside
 * the table that is now the only thing that reads them. */
export const AFTER_EDIT = ['teams', 'tabs', 'sentence', 'strategy', 'budget', 'seasonadj', 'balance', 'summary', 'issues', 'plan', 'timeline', 'totals', 'cards', 'gameview'];
export const PLAN_ONLY = ['tabs', 'sentence', 'budget', 'seasonadj', 'summary', 'issues', 'plan', 'timeline', 'totals', 'cards', 'gameview'];

/* kind -> { pref?: true, keys: [...] | 'all', now?: true }
 *
 * `keys: 'all'` calls the painter with no arguments, which is what `render()`
 * (render.js) takes to mean "paint every section" -- never confused with
 * `keys: []`, which means save and run the hooks but paint nothing, and must
 * never reach the painter (an empty argument list IS `'all'` there). */
export const EDITS = {
  /* -------- Design table: named kinds, one row each -------------------- */
  strategy: { keys: 'all', now: true },
  regen: { keys: 'all', now: true },
  gameDate: { keys: 'all', now: true },
  opponent: { keys: ['tabs', 'totals', 'cards'] },
  tipoff: { keys: ['tabs', 'cards'] },
  teamName: { keys: ['cards'] },
  dayName: { keys: ['tabs'] },
  teamSetting: { keys: 'all', now: true },
  teamColor: { keys: [], now: true },
  theme: { pref: true, keys: [], now: true },
  gameView: { pref: true, keys: ['gameview'], now: true },
  cardOptions: { pref: true, keys: ['cards'], now: true },
  cardSize: { pref: true, keys: ['setup', 'cards', 'gameview'], now: true },

  /* -------- Derived from every soon(...) in the five view files --------
   * Named for what changes; a kind is reused across call sites only where
   * the row -- the keys, and nothing else, since none of these is a
   * preference or immediate -- is exactly the same (Design: "the developer
   * may merge kinds that are identical rows"). */

  // strategy.js
  budget: { keys: [...PLAN_ONLY] },                    // budget slider, "Even out the rest", "Reset to even"
  lockTarget: { keys: [...AFTER_EDIT] },                // lock/unlock a target
  closers: { keys: [...PLAN_ONLY] },                    // closing window, who closes
  units: { keys: [...PLAN_ONLY] },                      // who is in a platoon unit
  unitCount: { keys: [...AFTER_EDIT] },                 // add/remove a platoon unit

  // rules.js
  pairs: { keys: [...PLAN_ONLY] },                      // force-together pairs switch
  dayCarryover: { keys: [...PLAN_ONLY] },                // even out earlier games today
  seasonCarryover: { keys: ['constraints', ...PLAN_ONLY] }, // even out the season so far
  rule: { keys: [...PLAN_ONLY] },                       // add or remove a rule

  // roster-view.js
  reorder: { keys: ['constraints', ...AFTER_EDIT] },    // move a player (arrows or drag)
  player: { keys: [...AFTER_EDIT] },                    // jersey number, card name
  playerName: { keys: ['constraints', ...AFTER_EDIT] }, // a player's name
  rosterChange: { keys: ['constraints', ...AFTER_EDIT] }, // add, paste or remove players

  // balance.js
  lineupShape: { keys: ['balance', ...AFTER_EDIT] },    // Steady/Start strong/Finish strong/Both ends
  level: { keys: ['levels', 'balance', ...AFTER_EDIT] }, // a player's level, or resetting every level

  // game-setup.js
  availability: { keys: ['strategy', ...PLAN_ONLY] },   // Who's here
  format: { keys: ['strategy', ...AFTER_EDIT] },        // periods/minutes, sub interval
};

let paint = () => {};
let doRetireUndo = () => {};

export function initEdits({ paint: p, retireUndo }) {
  paint = p;
  doRetireUndo = retireUndo;
}

let timer = null;
let pending = new Set();

export function edit(kind) {
  const spec = EDITS[kind];
  if (!spec) throw new Error(`edit(): unknown edit kind '${kind}'`);

  /* Same signal, same three readers `soon()` used to serve: the recovery
     notice, a pending Undo, and the first-run counter -- a preference skips
     the last two (Undo still snapshots `state.ui`, so a preference change
     would otherwise be silently reverted by an undo taken afterward). */
  doRetireUndo();
  if (!spec.pref) {
    editHappened();
    if (takeFirstRunPending()) track('first_run_complete', { roster: bucketRoster(state.players.length) });
  }

  if (spec.keys === 'all') { paint(); return; }
  if (spec.keys.length === 0) { save(); return; }
  if (spec.now) { paint(...spec.keys); return; }

  /* Debounced kinds still save at once -- only the repaint waits for the
     140ms window. Before this, the record was written only when the
     painter finally ran, so a coach who typed and closed the tab within
     140ms of their last keystroke lost it (review finding on #122: this
     used to be true of every debounced kind, `dayName`/`teamName` included,
     which had their own synchronous save before this file existed). */
  save();
  for (const k of spec.keys) pending.add(k);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const keys = [...pending];
    pending = new Set();
    paint(...keys);
  }, 140);
}
