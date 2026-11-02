/* ================================================================== *
 * state — the app's single record, its persistence glue, the accessors
 * every view reads through, the slot budget, and the plan cache.
 *
 * Split out of `app.js` as the third seam. It is the layer under every
 * view: `state.js` imports the pure modules (engine, budget, storage,
 * dom) and nothing else, so the view seams still to come can each import
 * it without an import cycle back through `app.js`.
 *
 * What deliberately stayed behind in `app.js`: the undo toast and the
 * `render()` / `SECTIONS` dispatcher. Both name the view functions
 * directly, so they only become movable once those views are modules of
 * their own.
 * ================================================================== */
// #146 item 5: the engine's `ON_FLOOR`, read here as `LINEUP_FLOOR`: the one
// five this file counts to (the season-carryover section and the mid-game
// re-solve use it too -- there is no second constant).
import { generatePlan, lastPeriodStintIndex, fmtMinutes, evenMinutesSentence, lowEndPhrase, buildStints, isOvertimeStint, runEndingAt, plural, DEFAULT_TIER, ON_FLOOR as LINEUP_FLOOR } from './engine.js';
import { capacityOf, normalizeSlots, rebalance, carryoverTargets } from './budget.js';
import { loadState, saveState, seasonGame, addSeasonGames, seasonShare,
         sanitizeSettings, DEFAULT_SETTINGS, seasonDate, localDate,
         validTipoff, tipoffLabel, sortDay, OVERTIME_MAX, overtimeMinutes, overtimeEntry, PINS } from './storage.js';
import { el, clone, uid } from './dom.js';
import { callNames } from './roster.js';
import { emptyConstraints, removePlayer as removeFrom, setAvailable, removeTeam } from './team-ops.js';
import { stage, stintIndex, playedStints, handStints, writeOverrides, resetFrom, gameStarted, finishedGame,
  keepThrough, clearRest, replaceOverrides, snapshotFives, restoreFives, satIds, clearSat } from './live.js';

/* Perceptually even hues so ten kids stay distinguishable at a glance.
   Lightness and chroma are themed once in CSS; only the hue varies here. */
export const HUES = [26, 52, 92, 128, 158, 188, 214, 244, 274, 304, 334, 8];
export const colorOf = id => {
  const p = state.players.find(x => x.id === id);
  const slot = p && Number.isFinite(p.hue) ? p.hue : state.players.findIndex(x => x.id === id);
  return `oklch(var(--pc-l) var(--pc-c) ${HUES[(slot < 0 ? 0 : slot) % HUES.length]})`;
};

/* The lowest slot nobody is using, so a player added after a deletion reuses
   the freed color rather than pushing the next one into a collision. Falls
   back to the roster length once every slot is taken, which is the same
   wrap-around the old index-based scheme had. */
export const nextHue = (players = state.players) => hueSlots(1, players)[0];

/* `count` distinct free slots, in one pass. Calling nextHue() inside a map
   would hand every player in a pasted list the same color -- state has not
   been written yet, so each call sees the same "taken" set. */
export const hueSlots = (count, players = state.players) => {
  const taken = new Set(players.map(p => p.hue).filter(Number.isFinite));
  const out = [];
  let i = 0;
  while (out.length < count) {
    if (!taken.has(i)) { out.push(i); taken.add(i); }
    i += 1;
    if (i > 400) break;   // pathological roster; wrap-around handles the rest
  }
  while (out.length < count) out.push(out.length);
  return out;
};
export const initials = p => (p.number || (p.name || '?').trim().slice(0, 2)).toUpperCase();
// Spoken form of a minute count, for aria-valuetext and other labels.
export const minutesText = m => `${fmtMinutes(m)} minute${fmtMinutes(m) === '1' ? '' : 's'}`;

/* ================================================================== *
 * state
 *
 * (Players are keyed by generated id; see `emptyConstraints` in
 * `team-ops.js`.)
 * ================================================================== */

/* #28 defect 4: each line is one short sentence, in the prototype's voice --
   the Plan sheet's `#stratwhy` (`strategy.js`) and, since #32, step 3 of the
   add-a-game flow (`teams-view.js`) are its only readers (checked: `grep -rl
   STRATEGIES app test scripts` names state.js itself, strategy.js and
   teams-view.js, plus tests and scripts that read the same source text --
   none of them a second, separately-worded copy), so shortening here does
   not touch the Help sheet's own, separately-worded strategy copy in
   `index.html`, or `about.html` / `advanced.html` / `docs/architecture.md`,
   which never read this constant.
   The old, longer sentences wrapped to four lines at a 320px/32px root and
   two at 390px, past the group-footer "one line at most" guideline (W3);
   these fit the prototype's single short line at 390px. Closers does not
   reuse the prototype's exact wording ("last two stints") because the
   closing window's stint count is a setting a coach can change
   (`c.closing.stints`, default 2) -- it is not always two, so the line stays
   general instead of naming a number the engine does not guarantee. */
export const STRATEGIES = {
  balanced: 'As close to equal as the clock allows.',
  minutes:  'You set each player’s minutes by hand.',
  closers:  'Even minutes early, then your closing group finishes the game.',
  platoon:  'Fixed groups of five take turns, whole group for whole group.',
};

/* The substitution grid a coach can choose from. It lives here rather than in
   either of its two renderers because both first-run setup (onboarding.js) and
   the game setup fold (app.js) draw the same chips, and neither may import the
   other. */
export const GRAN_CHOICES = [
  { mode: 'everyN', value: 2, label: '2 min', phrase: 'every 2 min' },
  { mode: 'everyN', value: 3, label: '3 min', phrase: 'every 3 min' },
  { mode: 'everyN', value: 4, label: '4 min', phrase: 'every 4 min' },
  { mode: 'everyN', value: 5, label: '5 min', phrase: 'every 5 min' },
  { mode: 'everyN', value: 6, label: '6 min', phrase: 'every 6 min' },
  { mode: 'perPeriod', value: 2, label: '2× / period', phrase: '2× a period' },
  { mode: 'perPeriod', value: 3, label: '3× / period', phrase: '3× a period' },
  { mode: 'perPeriod', value: 4, label: '4× / period', phrase: '4× a period' },
  { mode: 'breaksOnly', value: 1, label: 'Breaks only', phrase: 'only at breaks' },
];

/* #367: a game's format, built once -- regulation and its overtime periods.
   Every caller that asks the engine for stints or a plan goes through here,
   so none can forget the overtime. The engine reads minutes only (#369): who
   plays an overtime is state.js's business, not the grid's. */
const gameFormat = g => ({ periods: g.periods, periodMinutes: g.periodMinutes, overtime: overtimeMinutes(g.overtime) });

export function newGame(n, from, settings) {
  const g = {
    id: uid('g'), label: '', tipoff: '',
    /* The team's game format (v6, slice 4). 4 and 8 are the literals this line
       has always carried, so absent settings mean exactly what they did. The
       clone below still overwrites both when there IS a game to copy: the
       format is already sticky inside a day and across "New day", and a team
       default that snapped game 2 back would break that. So this fires only
       where there is nothing to clone -- a brand new team, and the no-games
       fallback in `sanitizeTeam` -- which is precisely where the app used to
       guess 4x8 at a coach whose league is not. Granularity is deliberately
       not a setting; see the note in DEFAULT_SETTINGS. */
    periods: settings?.periods ?? 4,
    periodMinutes: settings?.periodMinutes ?? 8,
    overtime: [],
    granMode: 'everyN', granValue: 4,
    out: [], late: [], useCarryover: n > 0,
    /* Season carryover (B3). Off, and -- unlike format, availability and
       strategy below -- deliberately NOT copied from the game this one clones.
       `useCarryover` defaults on for game 2+, and that precedent was not
       followed: the day carryover rearranges one afternoon, this one moves a
       season, and one tap is a cheap price for never being surprised.

       The team's own default (v6, slice 4) is the one thing allowed to turn it
       on, because a coach who has already decided is not being surprised --
       they are being obeyed. Read here and nowhere else: it is not a solver
       input and it never touches a game that already exists. Absent settings
       (a fresh team, the no-games fallback in `sanitizeTeam`) mean off, which
       is inert anyway -- neither has a season yet. */
    useSeasonTargets: settings?.seasonDefault === true,
    constraints: emptyConstraints(),
    strategy: 'balanced', balance: 'even',
    live: { at: 0, overrides: {} },
    seed: (Math.random() * 2 ** 31) >>> 0,
  };
  // Format, who is at the gym and the constraints hold all day; only the
  // opponent, tip-off and seed are per-game. Deep-copied, so editing game 2
  // never reaches back into game 1 and corrupts the day's carryover.
  if (from) Object.assign(g, {
    periods: from.periods, periodMinutes: from.periodMinutes,
    granMode: from.granMode, granValue: from.granValue,
    out: [...from.out], late: [...(from.late || [])], constraints: clone(from.constraints),
    strategy: from.strategy,
  });
  return g;
}

/* A team owns a roster, a day of games, which game is open, and -- since v5 --
   the season behind it. Everything a plan is built from lives here; nothing
   else does. That split is what makes a second team cheap -- the solver, the
   slot budget and the parsers never learn a team exists, because they are
   handed a roster and a game, not the record. The season belongs to the team
   for the same reason the roster does: two teams do not share a history. */
export const newTeam = (name, players, settings, today = new Date()) => {
  /* Sanitized first, not inline below, because the first game has to see it:
     a new team's opening game is the one place with nothing to clone, so the
     team's format default is the only thing that can answer it. */
  const s = sanitizeSettings(settings);
  /* #205: a new team copies the league settings from the team it was made
     from, but not its color -- the color is how two teams are told apart,
     so copying it works against its own job. Covers "Add a team", the
     placeholder made when the last team is removed, and freshState. Reads
     DEFAULT_SETTINGS.color rather than typing 'hardwood' here. */
  s.color = DEFAULT_SETTINGS.color;
  return {
    id: uid('t'),
    name: name || '',
    // No seeded fake roster. An app that opens pre-filled with strangers reads
    // like a demo; first run should ask for the coach's actual team.
    players: players || [],
    days: [{ name: '', date: seasonDate(today), games: [newGame(0, null, s)] }],
    activeDay: 0,
    season: { games: [] },
    /* Copy on create, not a cascade (v6): two squads are usually in one league,
       and an inheritance link would be a second thing to explain and to get
       wrong when a team is removed. Independent from then on. `sanitizeSettings`
       fills in the rest, so `undefined` is simply the defaults. Color is the
       one exception -- see the #205 comment above. */
    settings: s,
    activeGame: 0,
  };
};

const freshState = (players) => ({
  version: 6,
  onboarded: !!(players && players.length),
  tourSeen: false,
  teams: [newTeam('', players)],
  activeTeam: 0,
  view: 'today',
  ui: { copies: 2, showMinutes: false, printScope: 'game', cardId: 'short', cardSize: 'pocket', gameView: 'timeline', theme: 'auto', tipDone: false, prints: 0 },
});

// v1/v2 identified players by line number. Migrate positionally so the ids
// stay p0..pN and any constraints stored against them keep pointing at the
// right kid.
export function migrateLegacy([v2, v1]) {
  const old = v2 || v1;
  if (!old) return null;
  const names = String(old.roster || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!names.length) return null;
  const players = names.map((name, i) => ({ id: `p${i}`, name, number: '', shortName: '', tier: 3 }));
  if (old.day) return { version: 3, players, day: old.day, activeGame: old.activeGame || 0, ui: old.ui || {} };
  const g = newGame(0);
  Object.assign(g, {
    label: old.opponent || '', tipoff: old.gameDate || '', periods: old.periods,
    periodMinutes: old.periodMinutes, granMode: old.granMode, granValue: old.granValue,
    out: old.out || [],
  });
  return { version: 3, players, day: { name: '', games: [g] }, activeGame: 0, ui: old.ui || {} };
}

const helpers = { emptyConstraints, newGame, migrateLegacy };
const loaded = loadState(helpers);
export const state = loaded ? loaded.state : freshState();

/* ================================================================== *
 * the active team
 *
 * A roster and a day used to live at the top of the record, and roughly
 * fifty call sites across the app still read them as `state.players` and
 * `state.day`. Not one of them cares *which* team is active -- they want
 * the one on screen. So the old names stay, as accessors onto it.
 *
 * Non-enumerable on purpose. `saveState` serializes with JSON.stringify,
 * which walks own *enumerable* properties: an enumerable getter here
 * would write a second copy of the active roster into every saved record
 * beside `teams`, and on the next load the two would disagree. It also
 * keeps `restoreState`'s `delete state[k]` sweep from removing the
 * accessors themselves, and keeps `clone(state)` snapshots clean.
 * ================================================================== */
export const team = () => state.teams[state.activeTeam] || state.teams[0];
for (const key of ['players', 'season', 'settings', 'activeGame', 'activeDay']) {
  Object.defineProperty(state, key, {
    get: () => team()[key],
    set: v => { team()[key] = v; },
    enumerable: false, configurable: true,
  });
}
/* `state.day` used to be the record; now it is the OPEN day, the one at
   `team().activeDay` in `team().days` (#101). Every existing reader --
   `state.day.games`, `state.day.name` -- keeps working unchanged, pointed
   at whichever day is open. */
Object.defineProperty(state, 'day', {
  get: () => team().days[team().activeDay],
  set: v => { team().days[team().activeDay] = v; },
  enumerable: false, configurable: true,
});
/* The league's floor -- 0 is off. Exported because it is the one team setting
   that changes what the RULES section is telling the truth about: it composes
   into the per-player minimums the solver reads (`computeAll`), so with it set
   the plan is not "just evening out the minutes". The count badge, the
   drawer's copy and the solver all read it here, so two screens cannot
   disagree about whether a rule exists (A24b). No settings block means the
   default, which is what an unsanitized record means.

   #447: it is an amount and a unit (`settings.minUnit`: minutes, percent of
   the game, or periods), so what it comes to is a question about a GAME, and
   this is the one place that answers it. `leagueMinFor(g)` is the minutes the
   league owes a kid who was there all game. `leagueMinFor(g, arrivedAt)` is
   what it owes a kid who walked in at the start of stint `arrivedAt`: the same
   share of the regulation minutes from there to the end. A share is rounded up
   to a whole stint when every regulation stint is the same length (the test
   the engine's MIN_OFF_STINT_BOUNDARY makes) and held to the minutes it is a
   share of. Minutes stay as typed for a kid who was there all game. Regulation
   only: overtime does not grow it. Stint lengths come from `buildStints`, as
   `runMinutes` reads them. */
const leagueSetting = () => ({
  amount: state.settings?.minMinutes ?? DEFAULT_SETTINGS.minMinutes,
  unit: state.settings?.minUnit ?? DEFAULT_SETTINGS.minUnit,
});
export function leagueMinFor(g, arrivedAt) {
  const { amount, unit } = leagueSetting();
  if (!(amount > 0)) return 0;
  const { lens, equal } = regulationLens(g);
  const game = lensSum(lens);
  const share = (x, within) => {
    const up = equal ? Math.ceil(x / lens[0] - 1e-9) * lens[0] : x;
    return Math.round(Math.min(up, within) * 100) / 100;
  };
  const owed = unit === 'min' ? amount : share(unit === 'pct' ? game * amount / 100 : amount * g.periodMinutes, game);
  if (!arrivedAt || arrivedAt <= 0) return owed;
  const left = lensSum(lens, arrivedAt);
  // never more than a kid who was there all game is owed
  return share(owed * left / game, Math.min(left, owed));
}

/* The game's regulation stint lengths, and whether they are all the same: the
   one reading `leagueMinFor` and `runMinutes` share. */
function regulationLens(g) {
  const lens = buildStints({ periods: g.periods, periodMinutes: g.periodMinutes }, { mode: g.granMode, value: g.granValue }).map(s => s.minutes);
  return { lens, equal: lens.every(x => Math.abs(x - lens[0]) < 1e-9) };
}

/* Minutes of the regulation stints `lens` from stint `from` on: the game's
   length, or what is left once a kid arrives. `leagueMinFor` and the By hand
   re-plan both scale by it. */
const lensSum = (lens, from = 0) => lens.slice(from).reduce((a, x) => a + x, 0);

/* One composition, for the full solve and for the rest of a game underway: the
   league floor first, a minimum the coach set on the player winning when it is
   higher, and their cap winning when it is lower -- a cap is a deliberate
   "hold this kid back", and raising past it would manufacture a MIN_ABOVE_CAP
   error they never asked for. */
function composedMinimum(g, id, league) {
  const want = Math.max(g.constraints.minMinutes?.[id] || 0, league);
  const cap = g.constraints.maxMinutes?.[id];
  return cap != null ? Math.min(cap, want) : want;
}

/* The rule's sentence, with what it comes to in this game: "half the game
   (16 min)", "2 periods (16 min)", or plain "16 min". */
function leagueRuleText(g) {
  const { amount, unit } = leagueSetting();
  const mins = `${fmtMinutes(leagueMinFor(g))} min`;
  if (unit === 'pct') return `${amount === 50 ? 'half the game' : `${amount}% of the game`} (${mins})`;
  if (unit === 'periods') return `${plural(amount, 'period')} (${mins})`;
  return mins;
}

/* One rule, one count (#26 item 9). `passSummary` and `sentenceParts` below
   and each game's pass on Today both show this number, so it is computed once,
   exactly as `renderConstraints` (rules.js) lists rules: a starting five or a
   Starts the last period rule is 1, not 5 (the badge used to add `.length`, which
   counted five), and an "always on" pair (`keepOnFloor`) counts, which the
   badge used to leave out entirely. A min or cap on a player who is not
   available does not count -- the rules list never shows it either. */
export function ruleCount(g) {
  const c = g.constraints;
  const avail = new Set(availIds(g));
  return Object.keys(c.minMinutes).filter(id => avail.has(id)).length
    + Object.keys(c.maxMinutes).filter(id => avail.has(id)).length
    + c.pairs.length
    + c.avoids.length
    + (c.keepOnFloor || []).length
    + (c.openingFive.length ? 1 : 0)
    + (c.lastPeriodFive.length ? 1 : 0)
    + (c.maxConsecutive ? 1 : 0)
    + (c.maxBench ? 1 : 0)
    + (leagueSetting().amount > 0 ? 1 : 0);
}

/* #441: the most minutes `n` stints in a row can hold in this game's own
 * stints (one answer for the rule's sentence and the picker's hint line), and
 * how it reads: "8 min" when every stint is the same length, "up to 9 min"
 * when they are not. */
function runMinutes(g, n) {
  const { lens, equal } = regulationLens(g);
  let best = 0;
  for (let i = 0; i < lens.length; i++) {
    best = Math.max(best, lens.slice(i, i + n).reduce((a, x) => a + x, 0));
  }
  return { minutes: best, equal };
}
function runMinutesText(g, n) {
  const { minutes, equal } = runMinutes(g, n);
  return `${equal ? '' : 'up to '}${fmtMinutes(minutes)} min`;
}

/* #441: the picker's lines under the stepper, from the same helpers as the
 * rule's sentence. The second is only said where it is true: with ten
 * players, "Sits at most 1" is two fives trading places, which is Platoon. */
export const runHint = (g, n) => `${plural(n, 'stint')} in a row is ${runMinutesText(g, n)}.`;
export const benchPlatoonHint = (g, n) => (n === 1 && availIds(g).length === 2 * LINEUP_FLOOR
  ? `With ${availIds(g).length} players, Sits at most 1 in a row is Platoon.` : '');

/* #28 decision 5: the Plan sheet's Rules section, as plain sentences, in the
 * table's own order -- league minimum, minimum, cap, together, apart, one of
 * two on, starting five, starts the last period, Plays at most N in a row,
 * Sits at most N in a row. Reads exactly the
 * fields `ruleCount` above counts, the same way, so `ruleItems(g).length ===
 * ruleCount(g)` always holds (a test pins it) -- this is not a second count,
 * it is the same one rule by rule. Names are the on-court call names from
 * `callNames(state.players)` (`roster.js`), never a first-name helper
 * re-derived here, joined with `joinNames`.
 *
 * Each item carries `{ kind, text, removable }` plus whatever `removeRule`
 * needs to delete exactly that rule and nothing else -- an id, a pair of ids,
 * or nothing at all for the three rules a game holds at most one of. */
export function ruleItems(g) {
  const c = g.constraints;
  const avail = new Set(availIds(g));
  const calls = callNames(state.players);
  const nm = id => calls[id] || byId(id)?.name || id;
  const items = [];

  if (leagueSetting().amount > 0) items.push({ kind: 'leagueMinimum', text: `Everyone plays at least ${leagueRuleText(g)}`, removable: false });

  for (const [id, v] of Object.entries(c.minMinutes)) {
    if (!avail.has(id)) continue;
    items.push({ kind: 'minimum', text: `${nm(id)} plays at least ${v} min`, removable: true, id });
  }
  for (const [id, v] of Object.entries(c.maxMinutes)) {
    if (!avail.has(id)) continue;
    items.push({ kind: 'cap', text: `${nm(id)} plays at most ${v} min`, removable: true, id });
  }
  for (const pair of c.pairs) {
    items.push({ kind: 'together', text: `${joinNames(pair.map(nm))} together`, removable: true, pair });
  }
  for (const pair of c.avoids) {
    items.push({ kind: 'apart', text: `${joinNames(pair.map(nm))} apart`, removable: true, pair });
  }
  for (const pair of (c.keepOnFloor || [])) {
    items.push({ kind: 'keepon', text: `${nm(pair[0])} or ${nm(pair[1])} is always on the floor`, removable: true, pair });
  }
  if (c.openingFive.length) {
    const names = c.openingFive.map(nm);
    items.push({ kind: 'starts', removable: true,
      text: `${joinNames(names)} ${names.length === 1 ? 'starts' : 'start'} the game` });
  }
  if (c.lastPeriodFive.length) {
    const names = c.lastPeriodFive.map(nm);
    items.push({ kind: 'lastq', removable: true,
      text: `${joinNames(names)} ${names.length === 1 ? 'starts' : 'start'} the last period` });
  }
  if (c.maxConsecutive) {
    items.push({ kind: 'rest', removable: true,
      text: `Each player plays at most ${plural(c.maxConsecutive, 'stint')} in a row (${runMinutesText(g, c.maxConsecutive)})` });
  }
  if (c.maxBench) {
    items.push({ kind: 'bench', removable: true,
      text: `Each player sits at most ${plural(c.maxBench, 'stint')} in a row (${runMinutesText(g, c.maxBench)})` });
  }

  return items;
}

/* `keepOnFloor` is newer than the records already in a coach's browser, and
   only `sanitizeTeam` fills it in. Created lazily in one place so no reader
   -- this file's own `ruleCount`/`removeRule` or rules.js's Add-a-rule page
   -- has to think about the absent key. */
export const keepOnList = c => (c.keepOnFloor || (c.keepOnFloor = []));

/* #148: the two kind-to-storage mappings `removeRule` and `replaceRule` both
 * need, so the two functions read one answer each rather than two copies
 * that could drift. `minutesBucket` also gives rules.js's picker (which
 * disables players who already have a minimum or cap) the same mapping
 * `replaceRule` uses. */
export const minutesBucket = (c, kind) => kind === 'minimum' ? c.minMinutes : c.maxMinutes;
const pairListFor = (c, kind) => kind === 'together' ? c.pairs : kind === 'apart' ? c.avoids : keepOnList(c);

// Whether `pr` names the same two ids as `pair`, in either order -- the
// duplicate check `removeRule` and `replaceRule` each make against a pair
// they already have the identity of.
const samePairAs = pair => pr => pr[0] === pair[0] && pr[1] === pair[1] || pr[0] === pair[1] && pr[1] === pair[0];

/* #28 decision 6/9: deletes exactly the rule an `item` from `ruleItems`
 * names, the same mutation the chip ✕ in rules.js already makes -- moved
 * here so Remove rule (which needs an undoable snapshot taken first) and the
 * chip removal are the same code, not two copies that could drift. The
 * league minimum is not removable (see `ruleItems`); called on it, this is a
 * deliberate no-op rather than a throw, since a detail page never shows a
 * Remove button for it. */
export function removeRule(c, item) {
  switch (item.kind) {
    case 'minimum': case 'cap': delete minutesBucket(c, item.kind)[item.id]; break;
    case 'together': case 'apart': case 'keepon': {
      const list = pairListFor(c, item.kind);
      const i = list.findIndex(samePairAs(item.pair));
      if (i >= 0) list.splice(i, 1);
      break;
    }
    case 'starts': c.openingFive = []; break;
    case 'lastq': c.lastPeriodFive = []; break;
    case 'rest': c.maxConsecutive = 0; break;
    case 'bench': c.maxBench = 0; break;
    default: break; // 'leagueMinimum', or anything unrecognized: not removable from here
  }
}

/* #148: whether `list` (`c.pairs`, `c.avoids` or `keepOnList(c)`) already
 * holds a pair of `a` and `b` in either order -- the exact duplicate check
 * `addPairOnce` (rules.js) already made for Add a rule, pulled out here so
 * `addPairOnce` itself now calls this instead of holding its own predicate.
 * `replaceRule` below makes the same check index-aware instead (it has to
 * exclude the very entry it is about to overwrite), reusing `samePairAs`
 * rather than this one -- allocating a filtered copy of `list` on every
 * stepper tap just to hand it to this. */
export const pairInList = (list, a, b) => list.some(pr => pr.includes(a) && pr.includes(b));

/* #148 decisions 1-5: applies a draft in Add a rule's own shape
 * (`{ kind, id, minutes, a, b, ids, n }`) to an existing rule in place, for
 * the live edit page. Takes the `item` `ruleItems` produced for the rule
 * being edited. Reuses `ruleComplete` for completeness (decision 3: a
 * half-done draft is a no-op) rather than checking a second way; a pair
 * that already matches another entry in the same list is also a no-op
 * (decision 4). Returns the new item's identity (kind plus whatever
 * `ruleItems` needs to find it again -- an id, a pair, or nothing for the
 * three single-instance kinds) so the caller re-reads the sentence from a
 * fresh `ruleItems(g)` call instead of building one here; returns false when
 * nothing changed. */
export function replaceRule(c, item, draft) {
  if (!ruleComplete(item.kind, draft)) return false;
  switch (item.kind) {
    case 'minimum': case 'cap': {
      const bucket = minutesBucket(c, item.kind);
      delete bucket[item.id];
      bucket[draft.id] = draft.minutes;
      return { kind: item.kind, id: draft.id };
    }
    case 'together': case 'apart': case 'keepon': {
      const list = pairListFor(c, item.kind);
      const i = list.findIndex(samePairAs(item.pair));
      if (i < 0) return false;
      if (list.some((pr, idx) => idx !== i && samePairAs([draft.a, draft.b])(pr))) return false;
      list[i] = [draft.a, draft.b];
      return { kind: item.kind, pair: list[i] };
    }
    case 'starts': c.openingFive = [...draft.ids]; return { kind: 'starts' };
    case 'lastq': c.lastPeriodFive = [...draft.ids]; return { kind: 'lastq' };
    case 'rest': c.maxConsecutive = draft.n; return { kind: 'rest' };
    case 'bench': c.maxBench = draft.n; return { kind: 'bench' };
    default: return false;
  }
}

/* #148 decision 6: the edit and remove toast copy, both built from the same
 * `item.text` `ruleItems` already worded -- never a second sentence. `item`
 * here is whichever `ruleItems(g)` entry names the rule that changed or was
 * removed. */
export const changedRuleToast = item => `Changed: ${item.text}`;
export const removedRuleToast = item => `Removed: ${item.text}`;

/* #28 decision 7: whether a draft is complete enough to enable `Add rule`,
 * for each of the nine kinds. `draft` is the one shape the Add-a-rule page
 * keeps as module state (`{ kind, id, minutes, a, b, ids, n }`) -- this reads
 * only the fields each kind uses and never assumes the others are absent. */
export function ruleComplete(kind, draft) {
  const d = draft || {};
  const wholeInRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  switch (kind) {
    case 'minimum': return !!d.id && wholeInRange(d.minutes, 1, 40);
    case 'cap': return !!d.id && wholeInRange(d.minutes, 0, 40);
    case 'together': case 'apart': case 'keepon':
      return !!d.a && !!d.b && d.a !== d.b;
    case 'starts': case 'lastq': {
      const n = (d.ids || []).length;
      return n >= 1 && n <= 5;
    }
    case 'rest': case 'bench': return Number.isInteger(d.n) && d.n >= 1 && d.n <= 4;
    default: return false;
  }
}

/* #25: the active team's color, read the same way `leagueMinFor` above
   reads its own settings key -- one place, so `applyTint` (render.js) and
   the Settings row/picker (teams-view.js) cannot compute it two different
   ways. `team()` is already sanitized (storage.js's `sanitize` runs
   `settings.color` through `COLORS.includes`), so no re-validation
   belongs here. */
export const activeColor = () => state.settings?.color ?? DEFAULT_SETTINGS.color;

// v3 spelled this `state.teamName`; on a team it is just `name`.
Object.defineProperty(state, 'teamName', {
  get: () => team().name,
  set: v => { team().name = v; },
  enumerable: false, configurable: true,
});

/* Swap the whole record for another one -- an undo restoring its snapshot, or
   a coach restoring a backup file. `state` is a `const` binding that every
   module closes over, so this refills it in place rather than reassigning; the
   accessors above are non-enumerable, so `Object.keys` does not see them and
   the sweep leaves them intact. Cloned, so a caller holding the source (the
   undo snapshot) does not end up sharing objects with the live record. */
export function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, clone(next));
}

/* All three paths end in the same recovery, but each is a different claim about
   the coach's data. `recoveredFrom: 'unreadable'` means there were bytes under
   the main key that would not become a record; 'missing' means the key was
   simply gone (evicted, wiped, cleared by the browser), and calling that
   "unreadable" invents a corruption that never happened; 'incomplete' means the
   key was there and readable and simply was not a whole record, where both of
   the other sentences would be false. */
const RECOVERY_COPY = {
  unreadable: 'Your last save was unreadable, so the previous good copy was restored. Check the roster.',
  missing: 'Your last save was missing, so the previous good copy was restored. Check the roster.',
  incomplete: 'Your last save was incomplete, so the previous good copy was restored. Check the roster.',
};
let storageWarning = loaded?.recovered
  ? (RECOVERY_COPY[loaded.recoveredFrom] || RECOVERY_COPY.missing)
  : '';
/* Two different warnings share one banner and they expire differently. "Check
   the roster" describes the record as it was *loaded*, so the first save that
   lands replaces that record and the notice is stale — it used to sit there
   through a full rebuild from first-run, still pointing at a roster the coach
   had just typed. "Changes are not being saved" is the opposite: it is about
   right now, and it must not be cleared by anything short of a save that
   works. */
let recoveryNotice = !!loaded?.recovered;

/* "a save that worked" is *not* the signal for retiring the recovery notice,
   however much it sounds like one: `render()` saves unconditionally, boot
   renders, and the `document.fonts.ready` re-fit renders again a moment
   later — so the notice would be wiped before it was ever read. `edit()`
   (`edit.js`) is the signal, because it is only ever reached from an edit
   handler. */
export const editHappened = () => {
  if (!recoveryNotice) return;
  recoveryNotice = false;
  storageWarning = '';
  renderStorageWarning();
};

/* Read-and-reset, exactly like `overridesDropped` below and for the same
   reason: the banner is the standing record, but the coach who just added a
   player is looking at the FOOT of the roster, measured 1277px below it. The
   toast answers "you are a long way from that notice right now"; the banner
   answers "this is still true", and neither replaces the other.

   It carries the banner's own sentence rather than a count so the two surfaces
   cannot drift apart into two different wordings of one failure. Empty when
   nothing has transitioned, so the caller reads it as a plain flag.

   `state.js` cannot call `flash` itself -- `toast.js` imports from here, and
   the import back would close the graph into a cycle. `render.js` is the
   module that can see both, which is exactly why the overrides message lives
   there too. */
let justFailed = '';
export const saveJustFailed = () => { const m = justFailed; justFailed = ''; return m; };

/* A sample team is not a first run, and the count that says so has to wait.
   `first_run_complete{roster}` is the only signal the app has about roster
   sizes, and the roster-size landing pages are built on that distribution
   -- so a sample firing it would make the data measure the app's OWN
   suggestion, and those pages would feed their own sizes back into the numbers
   that justify them. A35, DECISION 1.

   So `onboarding.js` sets this instead of counting, and the first EDIT counts:
   an edit is the coach saying "this is now my team", and by then the size is
   theirs and not ours. Read-and-reset, the same shape as `saveJustFailed`
   above and `overridesDropped` below, read by `render.js` for the same reason
   -- this module cannot import `analytics.js`'s caller graph and should not
   know what an event is.

   In memory only, deliberately: v6 is settled and a sample is just a team, so
   nothing new goes in the record. A coach who loads a sample, reloads, and
   only then edits is never counted. Under-counting a real team is the safe
   direction; counting our own suggestion is not. */
let firstRunPending = false;
export const markFirstRunPending = () => { firstRunPending = true; };
export const takeFirstRunPending = () => { const p = firstRunPending; firstRunPending = false; return p; };

export const save = () => {
  const problem = saveState(state);
  if (problem && (!storageWarning || recoveryNotice)) {
    // a live failure outranks the recovery notice and replaces it
    storageWarning = `Changes are not being saved: ${problem}.`;
    /* The TRANSITION into failure, not the state of it: the guard above is
       already "there is no live failure recorded yet", so this cannot fire
       twice for one failure however many times `render()` saves. */
    justFailed = storageWarning;
    recoveryNotice = false;
    renderStorageWarning();
  }
};

export function renderStorageWarning() {
  const box = document.querySelector('#storagewarn');
  if (!box) return;
  box.textContent = '';
  if (!storageWarning) return;
  const a = el('div', 'alert warn');
  a.append(el('span', 'ico', '!'), el('span', null, storageWarning));
  box.append(a);
}

/* #126: "does this team have a game?" in one place. `team().days` never
   holds an empty day (removeGame drops one the moment its last game goes,
   sanitizeTeam never inserts one), so the day count and the game count agree
   -- this is the one question every other file asks THIS, rather than
   counting days or games itself. */
export const hasGames = () => team().days.length > 0;
export const game = () => state.day?.games[state.activeGame];
export const lastGame = () => state.day?.games[state.day.games.length - 1];
export const gameLabel = (g, i) => g.label || `Game ${i + 1}`;
/* Tournament labels share a long prefix and differ only at the end -- "Riverside
   Regional Tournament Semifinal vs Northgate" and "...Final vs Kingsway" both
   ended up as the tab "Riverside Regiona…", i.e. two different games wearing the
   same name. A tail ellipsis eats exactly the words that tell them apart, so the
   tab elides the middle instead: the head is enough to recognize the event, the
   tail keeps the round and the opponent. Character-based on purpose -- measuring
   text costs a layout per tab per render, and the max-width on .lb is still
   there as the backstop for a label made of unusually wide glyphs. */
const TAB_LABEL_MAX = 20;
export function elideMiddle(s, max = TAB_LABEL_MAX) {
  if (s.length <= max) return s;
  const tail = Math.ceil((max - 1) * 0.6);       // weight the end: that is where the game is named
  const head = max - 1 - tail;
  return s.slice(0, head).trimEnd() + '…' + s.slice(s.length - tail).trimStart();
}
/* Asked for once at onboarding, editable on the roster page. Stored raw so
   typing a space does not fight the caret; trimmed everywhere it is shown. */
export const teamName = () => (state.teamName || '').trim();
export const byId = id => state.players.find(p => p.id === id);
export const availIds = g => state.players.map(p => p.id).filter(id => !g.out.includes(id));

/* #412: who plays -- at the game and not sat for the rest. `also` is a fresh
   sit not yet recorded; `standing` is the recorded ones, which a short bench
   lets go of for one solve. Every re-plan asks here, so none re-derives it. */
const playingIds = (g, also = [], standing = satIds(g.live)) =>
  availIds(g).filter(id => !standing.includes(id) && !also.includes(id));

/* Who a game counts (#247 item G, #420): a player who is here, or who is
   marked out but has minutes in the rotation actually showing (`effectiveMinutes`,
   never `p.minutes`). The timeline's rows, the game screen's "N players" and
   Today's pass summary all read this one rule, so they agree after a player
   is marked out mid-game. With no ok plan, nobody has minutes yet, so it is
   `availIds`. `p` is the game's own plan -- `plans[i]` only for the open day. */
export function countedIds(g, p) {
  if (!p || !p.ok) return availIds(g);
  const mins = effectiveMinutes(g, p);
  return state.players.filter(pl => !g.out.includes(pl.id) || (mins[pl.id] ?? 0) > 0).map(pl => pl.id);
}

/* An empty roster is not a mistake, it is the first thing that happens. On a
 * fresh device the games view used to greet the coach with a red "Only 0
 * players available; you need at least 5 to field a lineup" over "No rotation
 * yet — resolve the errors above" — telling someone who has done nothing yet
 * that they did it wrong. `noRoster()` is true only at a literally empty
 * roster: a real squad that is 4-present genuinely is under strength, and
 * keeps the red error, because there the message is the right one. */
export const noRoster = () => !state.players.length;

/* ---- the record-changing operations live in team-ops.js (no DOM, no
   import-time side effects, so a test can run them); these bind them to the
   active team and re-export the rest under their old names ---- */
export { emptyConstraints, setAvailable };
export const removePlayer = id => removeFrom(team(), id);
export const removeActiveTeam = () => removeTeam(state, state.activeTeam, () => newTeam(''));

/* ================================================================== *
 * #101 -- a team's games sit on a list of days, not one. These five walk
 * `team().days` directly (the Constraint: "everything that must see every
 * day ... walks `days` explicitly"), rather than through `state.day`, which
 * stays the OPEN day only.
 * ================================================================== */

/**
 * The day dated `date`, inserting one in date order (`sanitizeTeam`'s own
 * sort) when none exists yet. Returns its index in `team().days`.
 */
export function dayFor(date) {
  const days = team().days;
  const i = days.findIndex(d => d.date === date);
  if (i >= 0) return i;
  const day = { name: '', date, games: [] };
  const j = days.findIndex(d => d.date > date);
  if (j < 0) { days.push(day); return days.length - 1; }
  days.splice(j, 0, day);
  return j;
}

/**
 * The one step `addGame`, `moveGame` and `setTipoff` all take after touching
 * a day's tip-off order (#102 item 3): sort `games` by tip-off and re-open
 * `g` at its new index in the day at `dayIndex`, so the open game follows
 * itself across the re-sort rather than staying at the index it had before.
 */
function reopenSorted(dayIndex, games, g) {
  sortDay(games);
  openGame(dayIndex, games.indexOf(g));
}

/**
 * Adds `g` to the day dated `date` (via `dayFor`), at the end of that day's
 * games, then sorts that day by tip-off and opens `g` at its sorted index
 * (`reopenSorted`, above) -- the shape "Add a game" commits (#32, #101 item
 * 2, #102 item 3).
 */
export function addGame(g, date) {
  const i = dayFor(date);
  const day = team().days[i];
  day.games.push(g);
  reopenSorted(i, day.games, g);
  return i;
}

/**
 * Moves the OPEN game to the day dated `date`, creating it in order if
 * needed, and drops the source day once it has no games left ("no empty
 * days"). A date before today or empty is ignored, same as the native date
 * input's own `min` (#101 item 3); "today" is injectable. The game screen
 * stays open on the moved game.
 */
export function moveGame(date, today = new Date()) {
  if (!date || date < seasonDate(today)) return;
  const t = team();
  const day = t.days[t.activeDay];
  const g = day.games[state.activeGame];
  if (!g || day.date === date) return;

  const dest = t.days[dayFor(date)];
  day.games.splice(day.games.indexOf(g), 1);
  dest.games.push(g);
  if (!day.games.length) t.days.splice(t.days.indexOf(day), 1);

  reopenSorted(t.days.indexOf(dest), dest.games, g);
}

/**
 * Writes `tipoff` on the OPEN game -- through `validTipoff`, the same gate
 * `sanitizeGames` writes a game's tip-off through, so a malformed value here
 * means exactly what it does on load: absent -- sorts its day and re-points
 * `activeGame` at the same game across the re-sort (#102 item 3). `#when`'s
 * input handler (app.js, game-setup.js) calls this rather than writing
 * `tipoff` on the game directly.
 */
export function setTipoff(v) {
  const d = team().activeDay;
  const day = team().days[d];
  const g = day.games[state.activeGame];
  if (!g) return;
  g.tipoff = validTipoff(v);
  reopenSorted(d, day.games, g);
}

/**
 * Removes the OPEN game and drops its day once it has no games left ("no
 * empty days"). Can empty the team down to zero days (#126) -- the caller
 * (`teams-view.js`'s "Remove this game") shows whenever the game screen is
 * showing, with no count to guard on.
 */
export function removeGame() {
  const t = team();
  const day = t.days[t.activeDay];
  day.games.splice(state.activeGame, 1);
  if (day.games.length) {
    state.activeGame = Math.min(state.activeGame, day.games.length - 1);
    return;
  }
  const idx = t.activeDay;
  t.days.splice(idx, 1);
  openGame(t.days.length ? Math.min(idx, t.days.length - 1) : 0, 0);
}

/** Opens game `i` of day `d` -- the Resume bar and Today's passes both land here. */
export function openGame(d, i) {
  team().activeDay = d;
  state.activeGame = i;
}

/* #369: the five a pinning choice settles on, from the game as it stands. Keep
   is the five on the floor now (hand swaps included); Strongest is the
   available players by Level, then fewest minutes so far, then roster order.
   Players who are out are never picked. Other choices pin nothing. */
function pinnedFive(g, who) {
  const p = plans[state.activeGame];
  if (!PINS.includes(who) || !p?.ok) return null;
  const avail = playingIds(g);
  if (who === 'keep') {
    return effectiveLineup(g, p, stintIndex(p, g.live)).filter(id => avail.includes(id));
  }
  return fillFive([], avail, 'strongest', minutesFrom(effectiveStints(g, p), avail));
}

/* Fill a five up to ON_FLOOR from `avail`: for Strongest the highest Level
   first, then the fewest minutes; for Keep the fewest minutes. Roster order
   settles the rest. `minutes` is what each has played. */
function fillFive(five, avail, who, minutes) {
  const order = new Map(state.players.map((pl, i) => [pl.id, i]));
  const level = new Map(state.players.map(pl => [pl.id, who === 'strongest' ? tierOfPlayer(pl) : 0]));
  const rest = avail.filter(id => !five.includes(id)).sort((a, b) =>
    level.get(b) - level.get(a) || (minutes[a] || 0) - (minutes[b] || 0) || order.get(a) - order.get(b));
  return [...five, ...rest].slice(0, LINEUP_FLOOR);
}

/* The overtime entry a stint belongs to, or undefined for regulation. */
const overtimeOf = (g, s) => (isOvertimeStint(s) ? overtimeEntry(g.overtime?.[s.period - g.periods - 1]) : undefined);
const isPinned = (g, s) => {
  const o = overtimeOf(g, s);
  return PINS.includes(o?.who) && !!o.five?.length;
};

/* The pinned fives for stints `k` up to `end`, by stint index: each pinned
   period's stored five without whoever is not available now, the empty seats
   refilled by the rule above. Minutes run on from what was played before `k`,
   period by period, so a refill sees the earlier overtime. `solved` is the
   fives the solve gave the other stints, by stint index (none when nothing was
   solved). A period that cannot make five is not pinned: the stint keeps what
   the plan has. */
function pinFives(g, p, k, avail, solved = {}, end = p.stints.length) {
  const fives = {};
  const minutes = minutesFrom(effectiveStints(g, p).slice(0, k), avail);
  let period = null, five = null;
  p.stints.slice(k, end).forEach((s, i) => {
    let onFloor = solved[k + i] || s.onFloor;
    if (isPinned(g, s)) {
      if (s.period !== period) {
        const entry = overtimeOf(g, s);
        period = s.period;
        const filled = fillFive(entry.five.filter(id => avail.includes(id)), avail, entry.who, minutes);
        five = filled.length === LINEUP_FLOOR ? filled : null;
      }
      if (five) onFloor = fives[k + i] = five.slice();
    }
    for (const id of onFloor) if (id in minutes) minutes[id] += s.minutes;
  });
  return fives;
}

/* Back to the printed plan (Reset), for a game with overtime the coach chose
   who plays: the pinned periods go back on their stored five and the Even-out
   periods are planned again as Even, each through the same pin and solve a
   re-plan uses -- not the printed plan, which was solved with the game's own
   strategy. Every other stint is left to the plan. Not by hand. */
export function resetRest(g) {
  const live = g.live;
  const from = resetFrom(live);
  clearRest(live);
  clearSat(live);
  const p = plans[state.activeGame];
  if (!p?.ok) return;
  const pins = pinFives(g, p, from, playingIds(g));
  if (Object.keys(pins).length) writeOverrides(live, pins, false);
  let period = null;
  p.stints.forEach((s, k) => {
    if (k < from || s.period === period || overtimeOf(g, s)?.who !== 'even') return;
    period = s.period;
    let end = k;
    while (p.stints[end]?.period === s.period) end++;
    const r = resolveRest(g, p, k, [], end);
    if (r.ok) writeOverrides(live, r.overrides, false);
  });
}

/* #368: a tied game goes on. The overtime joins the game's format and the
   length is remembered on the team for the next one; the plan is solved here
   so the caller can step onto the new stint. computeAll's #367 freeze plans
   only the new stints, around what was played. Returns false when nothing was
   added (four already, or a plan that will not solve), 'rewritten' when the
   freeze could not hold and #134 moved stints already played -- the caller says
   so -- and true otherwise. */
export function addOvertime(g, minutes, who = 'next') {
  // storage keeps four, so a fifth would be lost on reload
  if ((g.overtime?.length || 0) >= OVERTIME_MAX) return false;
  /* Bench mode steps through a game without re-solving, so a game played from
     tip-off on may never have had its rotation stamped: the first solve to see
     it underway only adopts the stamp, and the freeze would find nothing to
     compare. Solve once as the game stands, so the one below can freeze. */
  computeAll();
  const was = plans[state.activeGame]?.ok ? effectiveStints(g, plans[state.activeGame]).map(x => x.onFloor.join()) : [];
  const before = { overtime: g.overtime, remembered: state.settings.overtimeMinutes };
  /* #369: Keep and Strongest settle their five here, once, from the game as it
     stands -- a later Level edit, or the overtime's own minutes, must not move
     it. */
  const five = pinnedFive(g, who);
  // a plan that did not solve has no five to settle on: do not add an overtime
  // that would quietly play as Next rotation
  if (PINS.includes(who) && !five?.length) return false;
  g.overtime = [...(g.overtime || []), { minutes, who, ...(five ? { five } : {}) }];
  state.settings.overtimeMinutes = minutes;
  computeAll();
  if (plans[state.activeGame]?.ok) {
    const now = effectiveStints(g, plans[state.activeGame]).map(x => x.onFloor.join());
    return was.every((five, k) => five === now[k]) ? true : 'rewritten';
  }
  /* Nobody can play it (everyone is at a cap, say): a plan that does not solve
     has no stint to step onto, so the game stays as it was. */
  g.overtime = before.overtime;
  state.settings.overtimeMinutes = before.remembered;
  computeAll();
  return false;
}

/* The third sweep, and the one nothing else could catch: rerolling the seed.

   A swap in bench mode is a whole five chosen against *this* rotation -- "Ben
   on for Devon in the Q2 4:00 stint" -- stored in `live.overrides` under the
   stint index. Shuffle solves a different rotation from a new seed, and the
   overrides came through untouched, because every id in them still resolves
   to a player who is still in the gym: the two sweeps above had no reason to
   fire, and `sanitize` none either. The card then printed a new eight-stint
   rotation with two stints frozen at fives from a plan nobody can see any
   more, silently, while the stat row above it quoted the new plan.

   Same answer as the other two -- the five is no longer a lineup, so drop it
   and let the stint fall back to the plan. `live.at` stays: how far into the
   game the coach is does not depend on which rotation is printed. Returns
   whether anything was dropped, so the caller can say so. */
export function reseed(g) {
  g.seed = (Math.random() * 2 ** 31) >>> 0;
  const live = g.live;
  if (!live?.overrides) return false;
  /* #247 amendment 8: in a game underway a Shuffle is a same-grid change, so
     the stints up to and including the one on the floor keep their fives --
     the coach's own swaps among them, which the freeze could not rebuild from
     the old plan -- and only the ones after go. Before tip-off, as ever, all. */
  const keep = resetFrom(live);
  const had = handStints(live).some(k => k >= keep);
  keepThrough(live, keep);
  return had;
}

/* ================================================================== *
 * minute budget
 *
 * Allocation is modelled in STINT SLOTS, not minutes. A player's minutes
 * are necessarily a whole number of stints, so integer slots make every
 * value the coach can dial in exactly achievable -- no rounding, and the
 * budget always sums cleanly.
 * ================================================================== */
export function stintShape(g) {
  const stints = buildStints(
    gameFormat(g),
    { mode: g.granMode, value: g.granValue });
  const total = stints.reduce((a, x) => a + x.minutes, 0);
  // `max` is the longest stint: the season carryover clamps a single game's
  // correction to two of them, the same clamp the engine's day carryover uses.
  return { count: stints.length, avg: total / stints.length, total,
           max: stints.reduce((a, x) => Math.max(a, x.minutes), 0) };
}

/* #368: By hand's slots are measured against regulation. A game that went to
   overtime plans those stints as Even around what was played, so they are not
   slots the coach had to give out, and counting them would rescale the
   targets the coach saved. */
export const regulationShape = g => stintShape({ ...g, overtime: [] });

const slotsToMinutes = (g, slots) => +(slots * regulationShape(g).avg).toFixed(2);

// Keep the allocation valid whenever the roster, availability or format moves.
export function normalizeTargets(g) {
  const c = g.constraints;
  const ids = availIds(g);
  const { count } = regulationShape(g);
  const capacity = capacityOf(count);
  c.lockedTargets = (c.lockedTargets || []).filter(id => ids.includes(id));
  c.targetSlots = normalizeSlots({
    prev: c.targetSlots, ids, capacity, maxPerPlayer: count,
    locked: c.lockedTargets,
    // rescale only when the format actually changed; otherwise leave the
    // coach's numbers exactly where they put them
    prevCapacity: c.targetCapacity ?? null,
  });
  c.targetCapacity = capacity;
}

export function rebalanceSlots(g, pinned) {
  const c = g.constraints;
  const ids = availIds(g);
  const { count } = regulationShape(g);
  c.targetSlots = rebalance({
    slots: c.targetSlots, ids, capacity: capacityOf(count),
    maxPerPlayer: count, locked: c.lockedTargets || [], pinned,
  });
}

/* ================================================================== *
 * plans -- recomputed, never stored. Deterministic from inputs + seed.
 * ================================================================== */
/* `dayPlans[d]` is day `d`'s solved games, one entry per team().days -- each
   day solved on its own (#101 item 7), so a deficit game 1 of one day
   corrects never reaches another day's carryover. `plans` stays the open
   day's, `dayPlans[team().activeDay]`, so the ~50 existing readers of
   `plans` do not need to know days exist. */
export let plans = [], dayTotals = {}, dayPlans = [];

// Solving is 20-50ms per game on a laptop and several times that on a phone,
// and every game in the day gets re-solved on any change. Typing an opponent
// name should not pay for that, so results are keyed on the inputs that
// actually feed the solver -- carryover included, which makes the chain
// between games invalidate correctly on its own.
const planCache = new Map();

/* ---- the one place any surface asks "who is actually on the floor" ----

   Two answers to one question were living in two modules: `gamemode.js` had
   `effLineup` for the bench screen and `card.js` open-coded the same fallback
   inline while rebuilding its rows, which is why the printed card and the
   timeline two inches above it could disagree after a hand swap. Both now come
   through here. `effectiveLineup` is the single-stint answer; `effectiveStints`
   is the whole rotation with the coach's fives folded in and the in/out columns
   recomputed against them, and it returns `p.stints` untouched -- same array,
   no copy -- when nothing has been swapped, which is every card before tip-off.

   `effectiveMinutes` is the same answer counted up. Everything that quotes a
   minute total to the coach goes through it -- the card footer, the timeline's
   totals and detail panel, the stat tiles, the minute bars and the day chart --
   because the card is the artefact and the plan page has to agree with it. The
   identity shortcut matters: an unswapped plan hands back `p.minutes` verbatim,
   so the engine's own rounding is what prints, not a re-total of it. */
export const effectiveLineup = (g, p, i) => g.live?.overrides?.[i] || p.stints[i].onFloor;

export function effectiveStints(g, p) {
  const ov = g.live?.overrides || {};
  if (!Object.keys(ov).length) return p.stints;
  const avail = availIds(g);
  return p.stints
    .map((r, k) => (ov[k] ? { ...r, onFloor: ov[k], sitting: avail.filter(x => !ov[k].includes(x)) } : r))
    .map((r, k, arr) => (k === 0 ? { ...r, in: [], out: [] } : {
      ...r,
      in: r.onFloor.filter(x => !arr[k - 1].onFloor.includes(x)),
      out: arr[k - 1].onFloor.filter(x => !r.onFloor.includes(x)),
    }));
}

/* The two-or-three-word label for each strategy: `#stratnote` on the Plan
   screen (`renderStrategy`, strategy.js) and the pass's one-line summary
   (`passSummary` below, #26 decision 1) both read this one map, so the two
   screens cannot say something different about the same strategy -- a first
   draft of the pass gave three of the four strategies their own wording here.
   Distinct from the long sentences `STRATEGIES` above holds for the strategy
   picker, which describe what a strategy does rather than name it. */
export const STRATEGY_WORDS = {
  balanced: 'even minutes',
  minutes: 'minutes set by hand',
  // #27 decision 3: "a group finishes" didn't fit after "for" in the sentence
  // ("subbing every 4 min for a group finishes"). The pass summary and
  // #stratnote read this same map, so both moved with it.
  closers: 'a closing group',
  platoon: 'fixed fives',
};

/* The one switch label two callers build (rules.js's own carryover switch and
   #32 step 3 in the Add-a-game flow, both via `switchRow`) -- one string, so
   they cannot drift into naming the same setting two different ways. */
export const EVEN_OUT_DAY_LABEL = 'Even out earlier games';

/* The pass's one-line summary (#26 item 5, decision 2): "<N> player(s) ·
   <strategy words>", then "evens out the day" for a later game with carryover
   on, then "<N> rule(s)" when `ruleCount(g)` is above 0. Built only from
   `countedIds` (everyone the game played or has here, so a player marked out
   after playing still counts), `g.strategy`/`g.useCarryover` and `ruleCount`
   -- nothing here is re-derived. */
export function passSummary(g, i, p) {
  const n = countedIds(g, p).length;
  const parts = [`${n} player${n === 1 ? '' : 's'} · ${STRATEGY_WORDS[g.strategy] || g.strategy}`];
  if (i > 0 && g.useCarryover) parts.push('evens out the day');
  const rules = ruleCount(g);
  if (rules) parts.push(`${rules} rule${rules === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/* #27: the sentence at the top of the game screen -- one line built from five
   phrases, each of which opens its own sheet or fold. `intervalWords` is
   split out because the Sub interval sheet's rows read it too, and
   `evensOutLine` because it is the whole of the (conditional) second line.
   The players phrase counts `availIds` (who is here, as the Who's here sheet
   shows) until the game is finished, then `countedIds` (who played).
   Nothing else is re-derived: `ruleCount`, `STRATEGY_WORDS` and
   `GRAN_CHOICES` are the same single sources `passSummary` above reads. */
export function sentenceParts(g, i, p = plans[i]) {
  const n = (finishedGame(g.live) ? countedIds(g, p) : availIds(g)).length;
  const rules = ruleCount(g);
  return {
    players: `${n} player${n === 1 ? '' : 's'}`,
    format: `${g.periods} × ${g.periodMinutes}`,
    interval: intervalWords(g),
    strategy: STRATEGY_WORDS[g.strategy] || g.strategy,
    rules: rules ? `${rules} rule${rules === 1 ? '' : 's'}` : 'no rules',
    evens: evensOutLine(i),
  };
}

/* The Sub interval phrase (decision 6): the matching `GRAN_CHOICES` entry's
   `phrase`, exactly as the sheet row reads it (capitalized there, not here).
   A stored value the list does not have -- `storage.js` allows 1-40 -- still
   gets words, so a game seeded before a chip existed does not print
   "undefined min". */
export function intervalWords(g) {
  const hit = GRAN_CHOICES.find(c => c.mode === g.granMode
    && (c.mode === 'breaksOnly' || c.value === g.granValue));
  if (hit) return hit.phrase;
  return g.granMode === 'perPeriod' ? `${g.granValue}× a period` : `every ${g.granValue} min`;
}

/* "a", "a and b", "a, b and c" -- the one join a reader-facing list of names
   uses in this app. Exported so `evensOutLine` below and `roster-view.js`'s
   duplicate-jersey-number notice share it rather than each hand-rolling the
   same three lines a third time (`engine.js` has its own module-private
   `andList` for the same shape; it is left alone, per #27's constraint that
   the pure modules do not change). */
export function joinNames(names) {
  if (names.length < 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* The sentence's optional second line (decision 7), reading `state.day.games`
   -- never the game passed in, since it has to see the games BEFORE it. Empty
   for game 0 or with `useCarryover` off. Each earlier game is named by its
   tip-off, falling back to its opponent; if any earlier game has neither, the
   whole line names none of them ("the earlier game(s)") rather than guessing. */
export function evensOutLine(i) {
  const games = state.day.games;
  const g = games[i];
  if (!g || i === 0 || !g.useCarryover) return '';
  const earlier = games.slice(0, i);
  const names = earlier.map(e => tipoffLabel(e.tipoff) || e.label || null);
  const several = earlier.length > 1;
  if (names.some(nm => !nm)) return `Evens out the earlier game${several ? 's' : ''}.`;
  return `Evens out the ${joinNames(names)} game${several ? 's' : ''}.`;
}

/* #32 decision 10: the "Same as …?" card on step 1 of Add a game -- its two
   lines, or null when there is nothing worth offering to copy.

   Null in two cases, and the second is the one that matters (decision 6):
   the team's last game -- the last game of its last day (#101) -- is never
   actually missing: `newTeam`, `sanitizeTeam` and filing's fallback all seed
   one game on one day, so a card suppressed on the COUNT would be dead code.
   What a brand-new team really has is one unplanned Game 1 and an empty
   roster, and "Same as Game 1? 0 players, 4 × 8, even minutes" offers to
   copy nothing. So the test is whether the last game has anyone at it.

   #102: the title reads the last game's tip-off, formatted through the one
   time-label function, or `"the last game"` when it has none -- no opponent
   or "Game N" fallback. This REPLACES the old fallback to the opponent
   (`evensOutLine` above keeps its own opponent fallback; the two lines are
   no longer required to agree on what an untimed game is called). The
   summary is three of `sentenceParts`'s five phrases joined; none of them is
   re-derived here.

   #420: the card adds a game with the same players HERE, so it counts
   `availIds` (no plan passed), not a player marked out mid-game who still
   has minutes -- "Add game" would not bring them. */
export function sameAsLast() {
  const days = team().days;
  if (!days.length) return null;
  const games = days[days.length - 1].games;
  const i = games.length - 1;
  const g = games[i];
  if (!g || !availIds(g).length) return null;
  const { players, format, strategy } = sentenceParts(g, i, null);
  return {
    title: g.tipoff ? `Same as ${tipoffLabel(g.tipoff)}?` : 'Same as the last game?',
    summary: `${players}, ${format}, ${strategy}`,
  };
}

/* The status line inside an open sheet (decision 10, item 6; #149 item 1):
   the minute range and the change count, read off `effectiveMinutes`/
   `effectiveStints` -- never `p.minutes`/`p.stints` -- so a hand swap the
   coach made before opening the sheet is what the line describes. Built from
   `summaryLine` rather than re-deriving its wording. A blocked plan names its
   first error under `BLOCKED_TITLE`, same wording as `renderIssues`
   (plan-view.js) and the shared `blockedPanel` already use. */
export function planSay(g, p) {
  if (!p || !p.ok) {
    const err = (p?.issues || []).find(x => x.severity === 'error');
    return `${BLOCKED_TITLE}.${err ? ' ' + err.message : ''}`;
  }
  const stints = effectiveStints(g, p);
  const mins = effectiveMinutes(g, p);
  const subs = stints.slice(1).reduce((a, r) => a + r.in.length, 0);
  return summaryLine(mins, subs);
}

/* The Format sheet's stepper (decision 5): one step, clamped into range. A
   stored value already outside the range (say 30 minutes, `storage.js` allows
   up to 40) is shown as it is and its first tap lands on the nearest end
   rather than one step further out. */
export const stepFormat = (v, d, lo, hi) => Math.min(hi, Math.max(lo, v + d));

/* One entry per counted player (`countedIds`), in roster order (#26 item 6 / decision 10):
   `{ id, blocks }`, each block `{ period, from, to }` in minutes from that
   period's start. Built from `effectiveStints(g, p)` -- never `p.stints`
   directly -- so a bench-mode swap changes the mini rotation exactly the way
   it changes the card. Consecutive stints on the floor in the same period
   merge into one block; a period change always starts a new block, even if
   the player never left the floor. A blocked plan (`p.ok === false`) has no
   stints to draw (decision 4). */
export function passBlocks(g, p) {
  if (!p.ok) return [];
  const stints = effectiveStints(g, p);
  return countedIds(g, p).map(id => {
    const blocks = [];
    let offset = 0, curPeriod = null, open = null;
    for (const r of stints) {
      if (r.period !== curPeriod) { curPeriod = r.period; offset = 0; }
      const from = offset, to = offset + r.minutes;
      if (r.onFloor.includes(id)) {
        if (open && open.period === r.period && open.to === from) open.to = to;
        else { open = { period: r.period, from, to }; blocks.push(open); }
      } else open = null;
      offset = to;
    }
    return { id, blocks };
  });
}

/* The gap between two periods on a mini-rotation row, as a percent of the
   row's own width. 1% of a 390px row is 3.9px -- comfortably over the 2px
   decision 10 asks for -- and staying in one unit (percent) throughout keeps
   `rowGradient` a plain fraction of the row rather than a page-width-relative
   `calc()`. */
const ROW_GAP_PCT = 1;

/* One player's blocks (`passBlocks`) as a `linear-gradient(to right, …)`
   string with hard stops (#26 decision 10; #69 decision 13): the player's
   color exactly where a block says they are on the floor, `trackColor`
   everywhere else inside a period, and `transparent` across the gap between
   periods. The row is one equal-per-minute track per period --
   each period's track is as wide as its minutes (regulation periods are
   `g.periodMinutes` each, every overtime period (#370) its own), and a
   block's `from`/`to` divide by that period's length for a fraction of that
   track. Pure: reads nothing off `state`. */
export function rowGradient(blocks, g, color, trackColor) {
  const lengths = [...Array(g.periods).fill(g.periodMinutes), ...overtimeMinutes(g.overtime)];
  const total = lengths.reduce((a, m) => a + m, 0);
  const room = 100 - (lengths.length - 1) * ROW_GAP_PCT;   // the row less its gaps
  const pct = n => `${Math.round(n * 10000) / 10000}%`;
  const stops = [];
  const push = (from, to, c) => stops.push(`${c} ${pct(from)}`, `${c} ${pct(to)}`);
  let start = 0;
  lengths.forEach((len, pi) => {
    const track = room * len / total;
    const at = start;
    const frac = m => at + (m / len) * track;   // m minutes into this period, as a % of the row
    if (pi > 0) push(at - ROW_GAP_PCT, at, 'transparent');
    const periodBlocks = blocks.filter(b => b.period === pi + 1).sort((a, b) => a.from - b.from);
    let cursor = 0;
    for (const b of periodBlocks) {
      if (b.from > cursor) push(frac(cursor), frac(b.from), trackColor);
      push(frac(b.from), frac(b.to), color);
      cursor = b.to;
    }
    if (cursor < len) push(frac(cursor), frac(len), trackColor);
    start = at + track + ROW_GAP_PCT;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

/* Total the rows themselves. Rounded to the cent of a minute because stint
   lengths divide unevenly and floats accumulate visible noise over 16 of them
   (8.000000000000002 prints as 8.0 but compares as more than 8). */
export function minutesFrom(stints, ids) {
  const m = {};
  for (const id of ids) m[id] = 0;
  for (const r of stints) for (const id of r.onFloor) m[id] = (m[id] || 0) + r.minutes;
  for (const id of Object.keys(m)) m[id] = Math.round(m[id] * 100) / 100;
  return m;
}

export function effectiveMinutes(g, p) {
  const stints = effectiveStints(g, p);
  return stints === p.stints ? p.minutes : minutesFrom(stints, Object.keys(p.minutes));
}

/* Spread is max minus min, and it moves when a hand swap moves the minutes, so
   a readout showing effective minutes must not print the solver's `p.spread`
   next to them. Same rounding as the engine's. */
export const spreadOf = mins => {
  const v = Object.values(mins);
  return v.length ? Math.round((Math.max(...v) - Math.min(...v)) * 100) / 100 : 0;
};

/* #414: the minutes the timeline shows, when they are no longer the solver's:
   the game is finished, or a hand swap, a player leaving or overtime has made
   `effectiveMinutes` differ from the plan's (another set of players, or any
   one's minutes). Null while nothing has moved, so the engine's own notes
   stand; otherwise `{ eff, changed }`, `changed` being the ids whose minutes
   are not the plan's (a note that quotes their number is stale). */
export function movedMinutes(g, p) {
  const eff = effectiveMinutes(g, p);
  const ids = Object.keys(eff);
  const changed = ids.filter(id => eff[id] !== p.minutes[id]);
  const sameSet = ids.length === Object.keys(p.minutes).length;
  return finishedGame(g.live) || !sameSet || changed.length ? { eff, changed } : null;
}

/* #456: whether the lineups the timeline shows are no longer the solver's: the
   game is over, or any shown stint's five is not the plan's (a hand swap, a
   re-plan or a pinned overtime five writes its own). Minutes can stay put while
   a lineup moves, so this is asked of the fives themselves, not of
   `movedMinutes`. The engine's notes about the lineup (a pair kept together, a
   keep-on rule, changes at once, the half) describe the solver's five and are
   untrue once this is true. */
export function movedLineups(g, p) {
  if (finishedGame(g.live)) return true;
  const same = (a, b) => a.length === b.length && a.every(id => b.includes(id));
  return effectiveStints(g, p).some((s, k) => !same(s.onFloor, p.stints[k].onFloor));
}

/* #456: the engine's "plays N stints in a row against a limit of L" notes,
   rebuilt from the fives on screen (`effectiveStints`), one per player whose
   longest shown run is over the game's Plays at most N in a row, in the engine's
   own words. The engine's suppressions hold: nothing when its up-front notes
   (CONSEC_TOO_FEW, CONSEC_IMPOSSIBLE) say the rule is being ignored, and
   nothing for a player it said conflicts with their minimum (CONSEC_MIN_CONFLICT).
   `issues` are the plan's own notes, `nameOf` an id-to-name lookup. A run is
   counted from the first stint; the plan keeps no run from an earlier game. */
export function consecNotes(g, p, issues, nameOf) {
  const limit = g.constraints?.maxConsecutive;
  if (!limit || issues.some(i => i.code === 'CONSEC_TOO_FEW' || i.code === 'CONSEC_IMPOSSIBLE')) return [];
  const conflicted = new Set(issues.filter(i => i.code === 'CONSEC_MIN_CONFLICT').flatMap(i => i.playerIds));
  const fives = effectiveStints(g, p).map(s => s.onFloor);
  const out = [];
  for (const id of new Set([...availIds(g), ...fives.flat()])) {
    if (conflicted.has(id)) continue;
    let run = 0, longest = 0;
    for (const five of fives) { run = five.includes(id) ? run + 1 : 0; longest = Math.max(longest, run); }
    if (longest > limit) {
      out.push({
        severity: 'warn', code: 'CONSEC_EXCEEDED', playerIds: [id],
        message: `${nameOf(id)} plays ${longest} stints in a row against a limit of ${limit} — no legal lineup kept them under it.`,
      });
    }
  }
  return out;
}

/* #414: the note under the timeline when the minutes it shows are no longer
   the solver's. Takes the effective minutes (in roster order) and an
   id-to-name lookup; names the low end, six at most (past that, a count), the
   same cap and wording as the engine's SPREAD_FLOOR note. No reason and no
   action: both are about the solver's choice, which is not what is on screen. */
export function minutesNote(mins, nameOf) {
  const ids = Object.keys(mins);
  const vals = ids.map(id => mins[id]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const lows = ids.filter(id => mins[id] === lo);
  const highs = ids.filter(id => mins[id] === hi);
  const note = message => ({ severity: 'info', code: 'SPREAD_SHOWN', message, playerIds: lows });
  if (spreadOf(mins) === 0) return note(evenMinutesSentence(hi));
  const end = lowEndPhrase(lows, lo, highs, hi, ids.length, nameOf);
  if (end.covers) return note(end.named ? `${end.who}, everyone else ${fmtMinutes(hi)}.` : `${end.who}, ${end.other}.`);
  return note(`${end.who}, the fewest. The most is ${fmtMinutes(hi)}.`);
}

/* The summary line under the rotation (#29 decision 6): the minute range and
   the change count, read off `effectiveMinutes` / `effectiveStints` by the
   caller -- never `p.minutes` / `p.stints` -- so a hand swap the coach made
   is what the line describes. Pure: takes the numbers already computed
   rather than a plan, so it is testable without a game/plan fixture. */
export function summaryLine(mins, subs) {
  const vals = Object.values(mins);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const minutesPart = lo === hi ? `${fmtMinutes(hi)} min each` : `${fmtMinutes(lo)}–${fmtMinutes(hi)} min each`;
  return `${minutesPart} · ${subs} change${subs === 1 ? '' : 's'}`;
}

/* The blocked panel's title (#29 decisions 5/7): one string, read by both
   timeline.js's empty-rotation panel and card.js's card-sheet preview, so a
   wording change only has one place to land. */
export const BLOCKED_TITLE = "This plan can't be built";

/* The blocked panel's one code-to-fix mapping (#29 decision 7). Pure: takes
   the plan's own `issues` array and returns the first error's message plus
   the one button that fixes it, or null when there is no error to show.
   `opener` names which sheet the button opens -- 'who' (Who's here, the
   `#phrasePlayers` opener), 'strategy' or 'rules' (the Plan sheet's groups,
   `openPlanSheet`) -- left symbolic here because opening a sheet is not pure.
   Lives here, not in timeline.js, because card.js's card-sheet preview needs
   the same mapping's `message` for its own blocked state (decision 7) and
   timeline.js already imports card.js -- a reverse import would cycle. */
export function blockedFix(issues, rosterSize) {
  const err = (issues || []).find(i => i.severity === 'error');
  if (!err) return null;
  if (err.code === 'NOT_ENOUGH_PLAYERS') {
    // #146 item 5 / W4: below the floor, Who's here cannot fix this -- there
    // is no one left to mark available. `rosterSize` is optional so the
    // existing single-argument callers (card.js) are unaffected; `?? Infinity`
    // keeps them on 'who'. The floor is the engine's own `ON_FLOOR`
    // (imported as `LINEUP_FLOOR` here), not a second '5' living here.
    if ((rosterSize ?? Infinity) < LINEUP_FLOOR) return { message: err.message, label: 'Add players', opener: 'add' };
    return { message: err.message, label: "Change who's here", opener: 'who' };
  }
  if (err.code === 'UNITS_MISSING' || err.code === 'UNIT_WRONG_SIZE') return { message: err.message, label: 'Fill a unit', opener: 'strategy' };
  if (err.code === 'CLOSERS_TOO_MANY' || err.code === 'CLOSERS_AVOID') return { message: err.message, label: 'Change the rules', opener: 'strategy' };
  return { message: err.message, label: 'Change the rules', opener: 'rules' };
}

/* ================================================================== *
 * season carryover -- an INPUT, not new solver machinery (B3)
 *
 * The switch on a game opens each player's minute target adjusted by how
 * far off their share of the season they are. Everything it produces is
 * `constraints.targetMinutes`, which the engine has always taken; the
 * objective, the cost terms and the contract are untouched.
 *
 * Nothing here is ever written to the record. `game.useSeasonTargets` is
 * the one stored bit; the targets are re-derived on every computeAll, so
 * turning the switch off restores the previous plan exactly.
 *
 * A hand-set target and a lock are both untouchable BY CONSTRUCTION:
 *  - `minutes` strategy: nothing is written at all. That editor is the
 *    hand-set targets surface -- every available player already has a
 *    number the coach can see and drag, and moving one of those is the
 *    "number that silently moved" this feature must never be.
 *  - `platoon`: nothing either. The units are exact fives; there is no
 *    target for the solver to honour.
 *  - a locked row is left out of the pinned set and is NOT given a target,
 *    so `computeTargets` water-fills it to the plain even share. Handing
 *    it one would pin it at 1000/min: carryover is a suggestion, a lock is
 *    a promise, and a suggestion must not be promoted to a pin on its way
 *    past one.
 * ================================================================== */
export let seasonAdjust = {};

function seasonTargetsFor(g, avail, deficitOf) {
  const shape = stintShape(g);
  const floor = shape.total * LINEUP_FLOOR;
  const even = avail.length ? floor / avail.length : 0;
  const note = (reason, extra) => (seasonAdjust[g.id] = { on: true, reason, even, ...extra }, null);

  if (!g.useSeasonTargets) { delete seasonAdjust[g.id]; return null; }
  if (g.strategy === 'minutes' || g.strategy === 'platoon') return note('strategy');
  if (!avail.length) return note('nobody');

  const locked = (g.constraints.lockedTargets || []).filter(id => avail.includes(id));
  const open = avail.filter(id => !locked.includes(id));
  const deficit = Object.fromEntries(open.map(id => [id, deficitOf(id)]));
  if (!open.length) return note('locked', { locked });
  if (!open.some(id => Math.abs(deficit[id]) > 0.005)) return note('level', { locked, deficit });

  const targets = carryoverTargets({
    ids: open, deficit,
    // the open rows' share of the floor budget. The locked rows are left to
    // water-fill in the engine, which lands them on exactly `even`.
    budget: floor * (open.length / avail.length),
    cap: 2 * shape.max,
    min: g.constraints.minMinutes, max: g.constraints.maxMinutes,
    ceiling: shape.total,
  });
  if (!targets) return note('impossible', { locked, deficit });
  seasonAdjust[g.id] = { on: true, reason: 'ok', even, locked, deficit, targets };
  return targets;
}

/* The solver has one word for a pinned target and it is "by hand". Here they
   are the season's, not the coach's, so the one info line that says otherwise
   is restated at the call site that knows where they came from -- rather than
   in engine.js, whose contract this feature does not touch. */
function sayTheSeasonSetThem(p) {
  const i = p.issues && p.issues.find(x => x.code === 'TARGETS_ACTIVE');
  if (i) i.message = 'Minutes are evened out against the season so far, not set by hand.';
  return p;
}

/* #446: a By hand number raised to a minimum the league set is told in the
   league's words. The engine is only handed a composed per-player minimum and
   never learns where it came from, so it says "their 16-minute minimum"; this
   call site knows the coach's own minimum for the player is lower. Only when
   the number raised to IS the league minimum: a cap can have lowered the
   composed minimum below it, and then it is "their 12-minute minimum".
   `leagueFor(id)` is what the league owes that player (a late kid's is less). */
function sayTheLeagueMinimum(p, own, leagueFor) {
  for (const i of p.issues || []) {
    const leagueMin = leagueFor(i.playerIds[0]);
    if (i.code !== 'TARGET_UNDER_MIN' || (own[i.playerIds[0]] || 0) >= leagueMin) continue;
    // the engine prints through fmtMinutes, so the pattern does too
    const said = fmtMinutes(leagueMin).replace(/\./g, '\\.');
    i.message = i.message.replace(new RegExp(`to ${said} to meet their ${said}-minute minimum`), `to ${fmtMinutes(leagueMin)} to meet the league minimum`);
  }
}

/* The engine names who plays the odd stint less; it cannot say WHY, because it
   is handed the tie-break as a bare number and is deliberately never told what
   the number means. Only this module knows it is the season. Same shape as
   `sayTheSeasonSetThem` above and for the same reason: restated at the call
   site that has the context, not in `engine.js`.

   The claim is checked before it is made. "Furthest ahead" is only true if
   every short-end player really does sit at or below everyone else on the
   ledger -- a floor, a cap or a starting five can overrule the tie-break, and
   a line that explains a rotation the coach is not looking at is worse than no
   line. Where nothing separates anyone, the honest answer is that it rotates,
   plus the two controls that move it. */
function sayWhyTheyAreShort(p, prio, tiers) {
  const i = p.ok && p.issues.find(x => x.code === 'SPREAD_FLOOR');
  if (!i || !i.playerIds.length) return p;
  const of = id => prio[id] || 0;
  const short = i.playerIds;
  const rest = Object.keys(prio).filter(id => !short.includes(id));
  if (!rest.length) return p;
  const spread = Math.max(...Object.values(prio)) - Math.min(...Object.values(prio));
  const explained = spread >= 0.01
    && Math.max(...short.map(of)) <= Math.min(...rest.map(of)) + 1e-9;
  /* Which reason is true depends on which stance is on AND on what actually
     separated the two groups. Under `tieBreak: 'levels'` the levels only get
     the credit when they really did some of the separating: a roster all on
     one level is the season deciding inside the stance, and a level that got
     overruled by a floor did not decide anything either. Where they did, the
     claim made is only that nobody higher is on the short end -- true even
     when the day broke a tie between equals, which is the usual case. */
  const spreadOfTiers = tiers && new Set([...short, ...rest].map(id => tiers[id])).size > 1;
  const byLevel = spreadOfTiers && explained
    && Math.max(...short.map(id => tiers[id])) <= Math.min(...rest.map(id => tiers[id]));
  // the engine's own full stop comes off; the reason takes its place
  i.message = i.message.replace(/\.$/, '') + (byLevel
    ? `: the lower levels, which is how this team settles a tie.`
    : explained
      ? `: furthest ahead on ${(team().season?.games || []).length ? 'the season' : 'the day'} so far.`
      : `: nobody is ahead or behind yet, so it rotates. Shuffle, or set their minutes by hand.`);
  return p;
}

/* ---- one chokepoint for "these swaps no longer describe this rotation" ----

   `live.overrides` is a five the coach picked by hand against a *specific*
   rotation, filed under a stint index. Three sweeps grew one at a time --
   `removePlayer` and `setAvailable` (both now in `team-ops.js`) and
   `reseed` -- and each one closed exactly one
   door: the periods and min/period spinners, the sub-frequency chips and the
   strategy segment all still left zombie fives behind, spliced into stints at
   clock windows they were never chosen for. Those were never four more bugs.
   They are one bug with several doors, and adding a sweep per door is a race
   the app loses every time a new control lands.

   So the question the app asks is not "which control moved" -- no control has
   to know about overrides at all any more -- but "is the rotation these fives
   were chosen against still the rotation on screen?". Every mutating control
   already repaints through `render()`, `render()` calls `computeAll()`, and
   `computeAll()` is where the plan is known. The overrides carry a stamp of
   the plan they were made against; when the plan under them changes shape, the
   stamp stops matching and they go, exactly as `reseed` drops them.

   The stamp is a hash of the whole rotation -- every stint's period, clock
   window and five -- so it moves when and only when the rotation does. A
   rename, a repaint, an opponent name, a cache hit: identical rotation,
   identical stamp, swaps untouched. It is deliberately not persisted: on the
   first `computeAll` after a reload the overrides are stamped with the plan
   they load next to, which is the plan they were saved against, because
   anything that changed it would have dropped them before the save. Keeping
   it in `live` rather than a module map is what makes Undo work: the snapshot
   restores the old plan *and* its stamp together, so they still match. */
const rotationStamp = p => {
  let h = 5381;
  for (const s of p.stints) {
    const row = `${s.periodName}${s.startSec}-${s.endSec}:${s.onFloor.join(',')}|`;
    for (let i = 0; i < row.length; i++) h = (h * 33 ^ row.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
};

let dropped = 0;
/* Read-and-reset: the renderer says so once, no matter how many games in the
   day were holding stale fives. */
export const overridesDropped = () => { const n = dropped; dropped = 0; return n; };

/* #412: the sat kids a re-plan had to put back on the floor because five
   could not be made without them, by game id -- `computeAll` re-plans every
   game of every day, and only the game on screen is told about. Read-and-reset
   like `overridesDropped`: asking clears every game's, so a game that is not
   on screen does not save its notice for later. */
const satShort = new Map();
export const satShortBench = id => { const n = satShort.get(id) || []; satShort.clear(); return n; };

/* #437: the kids a re-plan stopped holding to a stint, by game id, in the two
   ways it can: `used` (Plays at most spent) and `cleared` (it still would not
   solve, so no kid was held). Same shape and read-and-reset as `satShort`. */
const pinsLet = new Map();
const pinsLetRead = id => { const n = pinsLet.get(id) || { used: [], cleared: [] }; pinsLet.clear(); return n; };
/* The one sentence for kids a solve stopped holding because their Plays at
   most is spent -- `names` are call names. Led by a space; '' for nobody. */
const pinsUsedSentence = names => (names.length ? ` Not enough minutes left to keep ${joinNames(names)} fixed to a stint.` : '');
/* The same sentence from `resolveRest`'s `pinsDropped` ids, for the callers
   (a sit, a one-stint swap) that re-plan without `replanRest`. */
export const pinsDroppedNotice = ids => pinsUsedSentence(ids.map(id => callNames(state.players)[id]));
/* The sentence(s) for the game on screen, led by a space so they append to
   another notice; '' when nothing was let go. Read-and-reset. */
export function pinsNotice(id) {
  const { used, cleared } = pinsLetRead(id);
  return pinsUsedSentence(used)
    + (cleared.length ? ` Could not keep ${joinNames(cleared)} fixed to a stint.` : '');
}

/* #412: plan the rest of a game from stint `from`, with its standing sit when
   five can be made without those kids, and without it when they cannot -- the
   arrival or attendance change has already happened, so a sit cannot refuse
   it. The sit stays recorded and applies again once five can be made. Every
   sat kid at the game is named (the retry seats all of them, not only as many
   as were needed). The one re-plan both `freezePlayedAndReplan` and the #134
   fallback in `syncOverrides` call. */
function replanRest(g, p, from) {
  const live = g.live;
  const here = new Set(availIds(g));
  const calls = callNames(state.players);
  let r = resolveRest(g, p, from);
  if (!r.ok && r.reason === 'nobody' && satIds(live).length) {
    const again = resolveRest(g, p, from, [], null, []);
    if (again.ok) {
      r = again;
      satShort.set(g.id, satIds(live).filter(id => here.has(id)).map(id => calls[id]));
    }
  }
  /* #490: the caps left cannot cover the floor -- relax them for the rest and
     say so, before letting go of any pin. */
  if (!r.ok && r.reason === 'infeasible' && r.issues?.some(i => i.code === 'CAPS_UNSATISFIABLE')) {
    const again = resolveRest(g, p, from, [], null, undefined, { relaxCaps: true });
    // the warning is not kept here: `capNotes` derives it from the minutes on every render
    if (again.ok) return again;
  }
  /* #437: still refused -- hold nobody to a stint, and say who was let go. */
  if (!r.ok && r.reason === 'infeasible') {
    /* Runs on any infeasible refusal with a fixed kid at the game, so the cause
       may not have been the pins; if clearing them does not help, nothing changes. */
    const who = Object.keys(pinnedRules(g, g.constraints, lastPeriodAhead(g, p, from))).filter(id => here.has(id));
    const again = who.length && resolveRest(g, p, from, [], null, undefined, { dropPins: who });
    if (again?.ok) {
      pinsLet.set(g.id, { used: [], cleared: who.map(id => calls[id]) });
      return again;
    }
  }
  if (r.ok && r.pinsDropped?.length) pinsLet.set(g.id, { used: r.pinsDropped.map(id => calls[id]), cleared: [] });
  return r;
}

/* #134: a game underway rewrites the minutes already played whenever its
   rotation changes shape, whether or not there were hand swaps to drop --
   so this is a second, companion signal to `dropped` above, not a
   replacement. `underway` is handed in by `computeAll` (via `stage()`,
   live.js's one rule for the question) rather than re-derived here, so this
   function stays the same pure stamp-keeper it always was and never reads
   `live.at`/`live.finished` itself. Read-and-reset, exactly like
   `overridesDropped`; the id list (not just a count) is what lets a test
   name which game moved without recomputing the stamp itself.

   Filled across every day of the active TEAM -- `computeAll` solves them
   all on every render (`dayPlans = team().days.map(solveDay)`), so an
   underway game two days away from the one on screen adds to this set too.
   `rotationMoved` reports only the ACTIVE day's games (`state.day`), the
   scope `dayUnderway`/the settled snapshot already use, so a team-wide edit
   can never offer -- or restore -- Undo over a day the coach is not
   looking at (quality review, #134). The set itself still clears in full:
   an off-screen day's stamp has already moved to match its new rotation,
   so there is nothing left to report for it next time either way. */
let moved = new Set();
export const rotationMoved = () => {
  const activeIds = new Set((state.day?.games || []).map(g => g.id));
  const ids = [...moved].filter(id => activeIds.has(id));
  moved.clear();
  return ids;
};

/* #134: "underway" is `stage()` returning `'part-played'` -- live.js's one
   rule, never re-derived from `live.at`/`live.finished` (live-guard.test.js
   enforces this). One name for the check `computeAll`'s two solve paths and
   `dayUnderway` below all need. */
const isUnderway = (p, live) => stage(p, live) === 'part-played';

/* #134: whether `render()` may afford a `clone(state)` for its settled
   snapshot. `plans` is index-aligned with `state.day.games`, set just above
   in `computeAll`. `state.day` can be `undefined` here -- `removeGame`
   (#126) drops a team to zero days the moment its last game goes, and
   `render()` still repaints after that -- so no day is never "underway"
   rather than a crash. */
export const dayUnderway = () =>
  !!state.day && state.day.games.some((g, i) => isUnderway(plans[i], g.live));

/* #134: one flag, not one per caller (the spec's own words), set around
   Undo's own restore and around an `undoable` action's mutate+refresh, both
   of which repaint synchronously. `render()` asks `rotationOfferSuppressed()`
   after `computeAll()` and skips offering its own Undo while either is live,
   so a second toast never steps on "out for the rest"'s or an Undo's own. */
let suppressed = false;
export function suppressRotationOffer(fn) {
  suppressed = true;
  try { return fn(); } finally { suppressed = false; }
}
export const rotationOfferSuppressed = () => suppressed;

/* #247: "the same grid" is the same stints, each with the same period name
   and clock window. #367 widens that to a grid that only grew or shrank at
   the end: one is a prefix of the other, and the stints the shorter lacks are
   unplayed (overtime added, or taken off before it was reached). A change to
   the format or the sub interval moves the grid, and keeps #134's
   rewrite-and-toast path. */
const sameGrid = (a, b, at = 0) => {
  const n = Math.min(a.stints.length, b.stints.length);
  // stints one grid has and the other lacks must be unplayed: the one on the
  // floor (`at`) and everything before it stay
  if (a.stints.length !== b.stints.length && n <= at) return false;
  // and what grew or shrank is overtime: more regulation periods is a format
  // change, whichever grid is the longer
  const longer = a.stints.length > b.stints.length ? a : b;
  if (!longer.stints.slice(n).every(isOvertimeStint)) return false;
  for (let i = 0; i < n; i++) {
    const x = a.stints[i], y = b.stints[i];
    if (x.periodName !== y.periodName || x.startSec !== y.startSec || x.endSec !== y.endSec) return false;
  }
  return true;
};

/* #247: an underway game whose rotation moved for a reason other than its
   grid (attendance, a rule, the strategy) freezes the stints already played
   and re-plans only the rest. The freeze is `live.overrides` -- the one place
   a lineup other than the plan's is recorded -- built from the OLD plan's
   effective lineups, because those are what the coach saw; the new plan's
   stints 0..at-1 are not what was played. `resolveRest` writes the rest.

   The stint on the floor stays too (amendment 7): it is being played now, so
   the re-plan starts after it -- unless its five names a kid who is out, which
   is the one five that cannot stand, and then it starts there. A freeze that
   would write a removed player's id (amendment 9) does not run.

   Returns false, having touched nothing, when it cannot (`resolveRest`
   refuses -- Platoon outside an all-overtime suffix, a sit under By hand
   or Platoon, nobody left to plan with, a plan that will not solve -- or
   a removed player is in the way), and the caller falls back to #134. */
/* #456: only the new fives are kept from `resolveRest`; the notes it returns
   (a CONSEC_EXCEEDED for a run it could not hold under the limit) are not.
   They are not needed here: `issuesList` (plan-view.js) rebuilds the
   stints-in-a-row note from the fives shown (`consecNotes`) once they differ
   from the plan's, so an over-limit run this re-plan wrote still says so. */
function freezePlayedAndReplan(g, p, prev) {
  const live = g.live;
  const n = p.stints.length;
  const at = Math.min(playedStints(live), n - 1);
  const before = live.overrides || {};
  const five = k => before[k] || prev.stints[k].onFloor;
  const out = new Set(g.out);
  const through = five(at).some(id => out.has(id)) ? at : at + 1;   // stints frozen
  const frozen = {};
  for (let k = 0; k < through; k++) frozen[k] = five(k);
  const known = new Set(state.players.map(pl => pl.id));
  if (Object.values(frozen).some(f => f.some(id => !known.has(id)))) return false;

  const overwritten = handStints(live).filter(k => k >= through);
  const hand = handStints(live).filter(k => k < through);
  const arrived = live.arrived;
  const untouched = snapshotFives(live);
  replaceOverrides(live, frozen, hand);
  let r = { ok: true, overrides: {} };
  if (through < n) {
    r = replanRest(g, p, through);
    if (!r.ok) { restoreFives(live, untouched); return false; }
  }
  writeOverrides(live, r.overrides, false);
  if (arrived) live.arrived = lateArrivals(g, p, through);
  if (!live.arrived || !Object.keys(live.arrived).length) delete live.arrived;
  if (overwritten.length) dropped++;
  live.stamp = rotationStamp(p);
  return true;
}

/* #369: the #134 rewrite below is of the regulation the coach played; the
   overtime they chose the five for is not the plan's to move. */
function overtimePins(g, p) {
  const first = p.stints.findIndex(isOvertimeStint);
  return first < 0 ? {} : pinFives(g, p, first, playingIds(g));
}

function repinOvertime(g, p) {
  const pins = overtimePins(g, p);
  if (Object.keys(pins).length) writeOverrides(g.live, pins, false);
}

/* #440: a pinned overtime five that breaks one of the coach's rules says so.
   The five is never changed (ADR 0001); the plan just gets a note. A stint
   counts when the five the choice puts there breaks the rule AND the five on
   the floor (hand swaps included) still does, so a swap of the coach's own is
   never blamed on the choice. One note per rule per choice label. The plan is
   cached, so earlier notes of this code are dropped before the current ones. */
const PIN_NOTE = 'PIN_BREAKS_RULE';
const PIN_LABEL = { keep: 'Keep this five', strongest: 'Strongest five' };
function pinNotes(g, p) {
  const pins = overtimePins(g, p);
  if (!Object.keys(pins).length) return [];
  const avail = playingIds(g);
  const floor = effectiveStints(g, p);
  const calls = callNames(state.players);
  const nm = id => calls[id] || id;
  const c = g.constraints;
  const mins = effectiveMinutes(g, p);
  const out = new Map();
  const add = (message, playerIds) => out.has(message) || out.set(message, { severity: 'warn', code: PIN_NOTE, playerIds, message });
  for (const [k, f] of Object.entries(pins)) {
    const e = floor[k].onFloor;
    const label = PIN_LABEL[overtimeOf(g, p.stints[k]).who];
    const both = (a, b, on) => on(f, a) && on(f, b) && on(e, a) && on(e, b);
    for (const [a, b] of c.avoids) {
      if (both(a, b, (x, id) => x.includes(id))) add(`${label} puts ${nm(a)} and ${nm(b)} on together; they are set Apart.`, [a, b]);
    }
    for (const [a, b] of (c.keepOnFloor || [])) {
      if (avail.includes(a) && avail.includes(b) && both(a, b, (x, id) => !x.includes(id))) {
        add(`${label} leaves ${nm(a)} and ${nm(b)} both off; they are set One of two on.`, [a, b]);
      }
    }
    for (const [id, cap] of Object.entries(c.maxMinutes)) {
      if (f.includes(id) && e.includes(id) && (mins[id] || 0) > cap + 1e-9) {
        add(`${label} gives ${nm(id)} ${minutesText(mins[id])}; Plays at most is ${cap}.`, [id]);
      }
    }
  }
  return [...out.values()];
}

function notePins(g, p) {
  p.issues = [...(p.issues || []).filter(i => i.code !== PIN_NOTE), ...pinNotes(g, p)];
}

/* #447: a game underway where a kid's minimum can no longer be met. The minimum
   is their own whole-game one or the league's (scaled for a late arrival),
   whichever is higher, held under their cap -- `composedMinimum`. The most they
   can still finish with is what they have played in the stints up to and
   including the one on the floor, plus every minute after it. Past that the
   re-solve can only clamp, and says nothing, so this says so. One note per kid,
   in the words of whichever minimum bound; earlier copies on the cached plan
   are dropped, as `notePins` does. */
const CLAMP_NOTE = 'MIN_CLAMPED';
function clampNotes(g, p) {
  if (!g.live || !isUnderway(p, g.live)) return [];
  const at = playedStints(g.live);
  const floor = effectiveStints(g, p).filter(s => !isOvertimeStint(s));
  const after = floor.slice(at + 1).reduce((a, s) => a + s.minutes, 0);
  const calls = callNames(state.players);
  const late = lateArrivals(g, p, at + 1);
  const out = [];
  for (const id of availIds(g)) {
    const league = leagueMinFor(g, late[id]);
    const want = composedMinimum(g, id, league);
    const most = floor.slice(0, at + 1).reduce((a, s) => a + (s.onFloor.includes(id) ? s.minutes : 0), after);
    if (want <= most + 1e-9) continue;
    const bound = want === league && league > (g.constraints.minMinutes?.[id] || 0)
      ? `the league minimum of ${fmtMinutes(want)}` : `their ${fmtMinutes(want)}-minute minimum`;
    out.push({ severity: 'warn', code: CLAMP_NOTE, playerIds: [id],
      message: `${calls[id] || id} can finish with at most ${fmtMinutes(most)} min, under ${bound}: that is all the time left.` });
  }
  return out;
}
function noteClamps(g, p) {
  p.issues = [...(p.issues || []).filter(i => i.code !== CLAMP_NOTE), ...clampNotes(g, p)];
}

/* #490: a game underway where a kid ends over their Plays at most, because a
   re-plan of the rest could not keep every cap and still field five. Read off
   the minutes on the floor, so it survives a reload and clears when the minutes
   no longer break the cap. One note for all of them, as `capRelaxedIssue` words
   it; earlier copies on the cached plan are dropped, as `notePins` does. */
const CAP_NOTE = 'CAP_RELAXED';
function capNotes(g, p) {
  if (!g.live || !isUnderway(p, g.live)) return [];
  const caps = g.constraints.maxMinutes || {};
  const mins = effectiveMinutes(g, p);
  const over = availIds(g).filter(id => caps[id] != null && (mins[id] || 0) > caps[id] + 1e-9)
    .map(id => ({ id, cap: caps[id] }));
  return over.length ? [capRelaxedIssue(over)] : [];
}
function noteCaps(g, p) {
  p.issues = [...(p.issues || []).filter(i => i.code !== CAP_NOTE), ...capNotes(g, p)];
}

function syncOverrides(g, p, underway = false, prev = null) {
  const live = g.live;
  if (!p || !p.ok || !live) return p;
  const hasOverrides = Object.keys(live.overrides || {}).length > 0;
  // no swaps and not underway: nothing to protect and nothing to notice
  if (!hasOverrides && !underway) { live.stamp = ''; return p; }

  const stamp = rotationStamp(p);
  if (!live.stamp) { live.stamp = stamp; return p; }   // first sight: adopt it
  if (live.stamp === stamp) return p;

  if (underway && prev && prev.ok && sameGrid(prev, p, playedStints(live)) && freezePlayedAndReplan(g, p, prev)) return p;

  // the rotation moved: swaps (if any) no longer match it and go, exactly
  // as `reseed` drops them; an underway game says so either way (#134),
  // since the played minutes were rewritten whether or not there were
  // swaps to protect
  live.stamp = hasOverrides ? '' : stamp;
  if (hasOverrides) {
    // only a swap the coach made by hand is one they are told was cleared
    if (handStints(live).length) dropped++;
    replaceOverrides(live, {}, []);
    if (underway) repinOvertime(g, p);
    /* #412: the stamp moved and the sit's stints went with it: plan them
       again through the one re-plan, the way a freeze would have. */
    if (satIds(live).length) {
      const r = replanRest(g, p, resetFrom(live));
      if (r.ok) writeOverrides(live, r.overrides, false);
    }
  }
  if (underway) moved.add(g.id);
  return p;
}

/* Same clamp `balance.js` applies to the meter: a level the record does not
   recognize is the middle one, which is the level that decides nothing. */
const tierOfPlayer = p => {
  const n = Number(p.tier);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : DEFAULT_TIER;
};

/* A short stable hash of a string: the key a saved `basis` is valid for. */
function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function computeAll() {
  const ps = state.players;
  const ids = ps.map(p => p.id);
  const live = new Set();

  /* How far off their share everyone is, before any of today's games. Read
     once for the whole team: the season a game's deficit is measured against
     does not change from one day to the next. Archived games are effective
     minutes (that is what `archiveDay` files); a day's own games are PLANNED
     minutes, folded in below as that day solves, for the same reason `cum`
     is planned -- a hand swap in game 1 must not silently re-solve game 2
     underneath the coach. */
  const base = seasonShare(team().season?.games);

  /* The team's own setting, read once for the whole team. A record that has not
     been through `sanitize` has no settings block, and the defaults are exactly
     what that means -- so this never throws and never plans to zero. */
  const maxSubs = state.settings?.maxSubs ?? DEFAULT_SETTINGS.maxSubs;

  /* The team's tie-break stance, read the same way and for the same reason.
     'levels' means the coach has asked for their rotation levels to settle the
     odd stint; 'behind' (the default, and every record written before the key
     existed) leaves it to the season, which is what the app has always done.

     `tiers` is built once for the team and is non-null ONLY under 'levels' --
     it is both the composition input below and the flag `sayWhyTheyAreShort`
     reads to know which reason it is allowed to give. */
  const stance = state.settings?.tieBreak ?? DEFAULT_SETTINGS.tieBreak;
  const tiers = stance === 'levels'
    ? Object.fromEntries(ps.map(p => [p.id, tierOfPlayer(p)])) : null;

  /* Each day solved on its own (#101 item 7): `cum` and the soFar-today
     ledger reset here, per day, so a deficit day 1's games already corrected
     never crosses into day 2's carryover or its priority order. */
  const solveDay = day => {
    const cum = Object.fromEntries(ids.map(id => [id, 0]));
    let any = false;
    const soFarPlayed = {}, soFarShare = {};
    const noteToday = mins => {
      const inGame = Object.keys(mins);
      if (!inGame.length) return;
      const share = inGame.reduce((a, id) => a + (mins[id] || 0), 0) / inGame.length;
      for (const id of inGame) {
        soFarPlayed[id] = (soFarPlayed[id] || 0) + (mins[id] || 0);
        soFarShare[id] = (soFarShare[id] || 0) + share;
      }
    };
    const deficitOf = id =>
      (base.deficit[id] || 0) + (soFarShare[id] || 0) - (soFarPlayed[id] || 0);
    /* What a solved game hands the games after it in the day: its planned
       minutes. #368: a game that went to overtime hands over what was played
       -- its regulation was frozen and its overtime planned around that, so
       the fresh solve's own totals are not the minutes anyone got. Read after
       `syncOverrides`, which is what writes those fives. */
    const addUp = (g, p) => {
      any = true;
      const mins = g.overtime?.length ? effectiveMinutes(g, p) : p.minutes;
      for (const [id, m] of Object.entries(mins)) cum[id] += m;
      noteToday(mins);
    };
    const tally = (g, p) => (p.ok && (notePins(g, p), noteClamps(g, p), noteCaps(g, p), addUp(g, p)), p);
    /* Composition, not replacement: `engine.js` reads the priority map for its
       ORDER alone (`tieBreakOrder` sorts on it and nothing else), so a level
       multiplied out past any credible deficit puts the levels first and leaves
       the season deciding inside each level. Two consequences worth having:
       nobody's level ever silently outranks a floor, a cap or a lock -- those are
       excluded from the ramp before the order is even consulted -- and a roster
       with no levels set is every tier equal, which is the deficit order again,
       byte for byte the plan 'behind' would have produced. */
    const priorityOf = id => (tiers ? tiers[id] * 1000 : 0) + deficitOf(id);

    return day.games.map(g => {
      live.add(g.id);
      const out = new Set(g.out);
      // slots are the UI's currency; the engine works in minutes. Normalize here
      // rather than in the editor so the budget invariant holds even when the
      // roster or format changed from another view.
      if (g.strategy === 'minutes') normalizeTargets(g);
      const carry = (g.useCarryover && any) ? { ...cum } : null;
      /* Computed before the cache is consulted and folded into the signature:
         the whole chain -- a game deleted from the ledger, an earlier game in
         the day re-solving -- then invalidates on its own, exactly as the
         day carryover does. */
      /* The league's floor for each kid here, from the one reader. 0 is off, and
         0 is what every record written before the key existed means, so a coach
         who never opens Settings gets byte-identical plans. */
      const leagueOn = leagueMinFor(g) > 0;
      const inPlay = ids.filter(id => !out.has(id));
      /* Who is late is `lateArrivals`' answer everywhere: a kid who played before
         the stint they "arrived" at is not, and the cached plan is where that
         is read. No cached plan, nobody has played, so the record stands. */
      const before = planCache.get(g.id)?.plan;
      const late = before && g.live ? lateArrivals(g, before, playedStints(g.live) + 1) : (g.live?.arrived || {});
      const leagueFor = Object.fromEntries(inPlay.map(id => [id, leagueMinFor(g, late[id])]));
      const seasonT = seasonTargetsFor(g, inPlay, deficitOf);
      /* The tie-break the engine uses when the clock does not divide evenly and
         somebody has to play a stint less. `deficitOf` is the whole chain in one
         number and always has been: it is the season deficit where a season
         exists, and the day's earlier games are already folded into it as they
         solve, so with no season at all it reduces to "who has played least so
         far today". All zeroes -- game one of a fresh season -- and the engine
         falls through to its own seeded rotation. Same value the carryover
         switch reads, so the two can never disagree about who is behind; unlike
         the switch this is always on, because there is no version of this where
         nobody gets the odd stint. `priorityOf` wraps it with the team's stance:
         under 'behind' it IS `deficitOf`, and under 'levels' the level leads and
         the deficit decides inside it. */
      const prio = Object.fromEntries(ids.filter(id => !out.has(id)).map(id => [id, priorityOf(id)]));
      /* p.tier and g.balance belong in the signature: both change the plan, and
         leaving either out means a coach re-tiers a player and the card does not
         move. Team settings reach the solver too, so they belong for the same
         reason: change the number and the card must move. The league floor is a
         question about this game (#447), and a kid who walked in late is owed
         less of it. `rest` is everything but the rules and the names (#449). */
      const rest = JSON.stringify([
        ps.map(p => [p.id, p.tier]), g.out, g.periods, g.periodMinutes, g.overtime,
        g.granMode, g.granValue, g.strategy, g.balance, g.seed, carry, seasonT, prio, maxSubs, leagueFor,
      ]);
      const sig = JSON.stringify([ps.map(p => [p.name, p.shortName]), g.constraints, rest]);
      const hit = planCache.get(g.id);
      if (hit && hit.sig === sig) {
        return tally(g, syncOverrides(g, hit.plan, isUnderway(hit.plan, g.live)));
      }
      const warmKey = hashOf(rest);
      /* #449: a rule edit starts from the plan the coach had. The previous
         plan's fives are kept on the game (`g.basis`), so a reload starts from
         the same place. Only when the cached plan solved from what `g.basis`
         still says: an Undo that restored an older record leaves it alone. */
      if (hit && hit.warmKey === warmKey && hit.plan.ok && hit.basis === JSON.stringify(g.basis ?? null)) {
        g.basis = { key: warmKey, lineups: hit.plan.stints.map(s => s.onFloor.slice()) };
      }
      const start = g.basis?.key === warmKey ? g.basis.lineups : undefined;
      const c = clone(g.constraints);
      /* The league floor, composed into the per-player map the engine has always
         read -- so `engine.js` is untouched and knows nothing about the setting.
         `composedMinimum` is the order (own minimum higher wins, cap lower wins).
         Everyone who is out is left alone: they are not available, so no rule
         about available players reaches them. */
      if (leagueOn) {
        for (const id of ids) {
          if (!out.has(id)) c.minMinutes[id] = composedMinimum(g, id, leagueFor[id]);
        }
      }
      if (g.strategy === 'minutes') {
        c.targetMinutes = {};
        for (const [id, slots] of Object.entries(g.constraints.targetSlots || {})) {
          if (!out.has(id)) c.targetMinutes[id] = slotsToMinutes(g, slots);
        }
      }
      // never merged with a hand-set map: `seasonTargetsFor` returns null for
      // the one strategy that has one, so these two can never both be set
      if (seasonT) c.targetMinutes = seasonT;
      if (g.strategy !== 'closers') c.closing = null;
      if (g.strategy !== 'platoon') c.units = [];
      const p = generatePlan({
        players: ps, availableIds: ids.filter(id => !out.has(id)),
        format: gameFormat(g),
        granularity: { mode: g.granMode, value: g.granValue },
        constraints: c, strategy: g.strategy, balance: g.balance,
        carryover: carry,
        priority: prio,
        seed: g.seed,
        maxSubs, start,
      });
      if (seasonT) sayTheSeasonSetThem(p);
      if (leagueOn) sayTheLeagueMinimum(p, g.constraints.minMinutes || {}, id => leagueFor[id] || 0);
      sayWhyTheyAreShort(p, prio, tiers);
      planCache.set(g.id, { sig, warmKey, basis: JSON.stringify(g.basis ?? null), plan: p });
      return tally(g, syncOverrides(g, p, isUnderway(p, g.live), hit?.plan));
    });
  };

  dayPlans = team().days.map(solveDay);
  plans = dayPlans[team().activeDay] ?? [];

  for (const key of [...planCache.keys()]) if (!live.has(key)) planCache.delete(key);
  for (const key of Object.keys(seasonAdjust)) if (!live.has(key)) delete seasonAdjust[key];
  /* Two totals, deliberately. `cum` is the solver's input, accumulated in
     game order inside `solveDay` above. `dayTotals` is what the day chart
     shows a human, for the OPEN day -- so it counts the fives actually on the
     floor, and it can only be totalled here, after the map, because
     `syncOverrides` may have dropped stale swaps mid-loop. With no day at all
     (#126), there is nothing to total. */
  const eff = Object.fromEntries(ids.map(id => [id, 0]));
  if (state.day) {
    state.day.games.forEach((g, i) => {
      const p = plans[i];
      if (!p || !p.ok) return;
      const m = effectiveMinutes(g, p);
      for (const id of Object.keys(m)) if (id in eff) eff[id] += m[id];
    });
  }
  for (const id of ids) eff[id] = Math.round(eff[id] * 100) / 100;
  dayTotals = eff;
}

/* #247 amendment 11: `live.arrived` is for a kid who was not there at the
   start. One who played in the stints up to and including the stint they
   "arrived" at -- played, went out, came back -- was not late, so the record
   of it is dropped and they keep a whole-game share. Judged on the first `k`
   stints, the ones the caller treats as played. */
function lateArrivals(g, p, k) {
  const arrived = g.live?.arrived;
  if (!arrived) return {};
  const eff = effectiveStints(g, p).slice(0, k);
  return Object.fromEntries(Object.entries(arrived).filter(([id, at]) =>
    !eff.slice(0, at + 1).some(s => s.onFloor.includes(id))));
}

/* ================================================================== *
 * mid-game re-solve (A10, slice 1)
 *
 * "Aiden has four fouls, sit him" -- re-solve the REST of the game
 * honouring the minutes everyone has already played.
 *
 * It lives here and not in `gamemode.js` because it is a composition of
 * solver inputs and every other one of those already lives in this file.
 * `gamemode.js` writes the answer into `live.overrides`; it never builds
 * a constraint.
 *
 * HANDED TO THE SOLVER: the SUFFIX as `stints`, which is the fifth
 * `engine.js` permission and its only reason for existing -- a suffix
 * frequently is not describable as any {periods, periodMinutes} pair, so
 * there is no other way to ask. `format` keeps the REAL period count, so
 * `lastPeriodFive` still lands on the last period's first stint while it
 * is ahead; once it is behind the cut (#444) the five has started the
 * period and the rule is cleared. `openingFive` is dropped (stint k is not the tip-off),
 * except a sit seeds it with the four who stay;
 * floors and caps are reduced by minutes already played; everything else
 * -- `closing`, `pairs`, `avoids`, `keepOnFloor`,
 * `maxConsecutive`, `balance` -- is kept as the coach set it
 * (`lastPeriodFive` too, while its stint is ahead). A suffix of
 * a suffix is still the end of the game, and every other rule is about
 * who is on the floor beside whom, which the clock does not change.
 *
 * NOT HANDED OVER, both deliberately:
 *  - `generatePlan`'s own `carryover` argument. It is clamped to twice
 *    the longest stint on purpose -- "one lopsided game cannot hand
 *    someone the whole next one" -- which is right BETWEEN games and
 *    wrong INSIDE one. Mid-game the app is not nudging, it is settling
 *    up. B3 chose targets over the nudge for the same reason.
 *  - `priority`. The engine reads it for ORDER alone and the targets
 *    below already carry the same fact as a number. Two expressions of
 *    one fact, one of which the solver may honour against the other, is
 *    how a plan ends up disagreeing with itself.
 *
 * The past is never touched: fives come back for stints k..n-1 only, so
 * `effectiveMinutes` cannot fork and the season keeps filing what was
 * actually played. Returns `{ ok: true, from, overrides, issues,
 * minutes }` or `{ ok: false, reason }`; `reason` is for slice 2's copy.
 * ================================================================== */
/* #444: the last period's first stint is at or after stint `k`, so the Last-period
   five has not yet started it. Once it is behind, that rule is done. */
const lastPeriodAhead = (g, p, k) => lastPeriodStintIndex(p.stints, gameFormat(g).periods) >= k;
/* The kids a coach fixed to a stint, as { id: [rule names] }: Starts the last
   period, and Closers when the game's strategy is closers. `c` is the
   constraints to read (the game's, or a solve's clone). */
function pinnedRules(g, c, lastPeriodStillAhead = true) {
  const out = {};
  for (const id of lastPeriodStillAhead ? c.lastPeriodFive || [] : []) (out[id] ||= []).push('Starts the last period');
  if (g.strategy === 'closers') for (const id of c.closing?.players || []) (out[id] ||= []).push('Closers');
  return out;
}
/* The one place a solve's constraints let go of fixed kids: `ids` come out of
   Starts the last period and Closers. Writes `c`, which is a clone. */
function dropPinned(c, ids) {
  if (!ids.length) return;
  c.lastPeriodFive = (c.lastPeriodFive || []).filter(id => !ids.includes(id));
  if (c.closing) {
    const players = c.closing.players.filter(id => !ids.includes(id));
    c.closing = players.length ? { ...c.closing, players } : null;
  }
}
/* The one warning for kids a game underway puts over their Plays at most.
   Usually a re-plan of the rest that could not field five otherwise (#490),
   but a hand swap gets there too, so it names the fact and not a cause.
   `over` is [{ id, cap }]. */
function capRelaxedIssue(over) {
  const calls = callNames(state.players);
  const same = over.every(x => x.cap === over[0].cap);
  const who = same
    ? `${joinNames(over.map(x => calls[x.id]))} over Plays at most ${fmtMinutes(over[0].cap)}`
    : joinNames(over.map(x => `${calls[x.id]} over Plays at most ${fmtMinutes(x.cap)}`));
  return {
    severity: 'warn', code: 'CAP_RELAXED', playerIds: over.map(x => x.id),
    message: `This game puts ${who}.`,
  };
}
export function resolveRest(g, p, from, sitIds = [], to = null, standing = satIds(g.live), { dropPins = [], relaxCaps = false } = {}) {
  if (!p || !p.ok) return { ok: false, reason: 'noplan' };
  const k = Math.max(0, Math.min(Math.trunc(from) || 0, p.stints.length));
  // `to` ends the suffix early: Reset plans one Even-out period at a time
  const end = Math.max(k, Math.min(Math.trunc(to) || p.stints.length, p.stints.length));
  const suffix = p.stints.slice(k, end);
  /* The same two `seasonTargetsFor` refuses, for the same reasons: platoon's
     units are exact fives with nothing to optimize, and `minutes` is the
     hand-set-targets surface and its numbers are whole-game. #368: a suffix
     that is all overtime is the exception. Its stints were never part of what
     the coach set -- By hand plans them as Even around the minutes played and
     leaves the saved targets alone, Platoon carries on with the next unit. */
  /* #369: the stints the coach chose the five for are not solved, so the
     choice is read over the others. If every one of those is Even out, they are
     planned as Even whatever the game's strategy, and neither refusal below
     applies to them. A mix of Even out and anything else stays on the game's
     strategy. */
  const pinnedAt = suffix.map(s => isPinned(g, s));
  const allPinned = suffix.length > 0 && pinnedAt.every(Boolean);
  const open = suffix.map((s, i) => k + i).filter((j, i) => !pinnedAt[i]);
  const evenOut = open.length > 0 && open.every(j => overtimeOf(g, p.stints[j])?.who === 'even');
  const strategy = evenOut ? 'balanced' : g.strategy;
  const handSet = strategy === 'minutes' || strategy === 'platoon';
  const overtimeOnly = suffix.length > 0 && suffix.every(isOvertimeStint);
  /* Platoon's units are exact fives that ignore who is available, so it still
     cannot sit anyone for the rest -- only carry on with the next unit. A
     suffix that is all pinned plans nothing, so it is not refused. */
  /* #489: By hand re-plans the rest when nobody is sat -- its hand numbers are
     turned into what is left of them below. Sitting a kid under By hand stays
     refused (its minutes are set by hand), though a sit already made, which
     `standing` carries, is honored: that kid was sat before the re-plan. */
  const byHand = strategy === 'minutes' && !overtimeOnly && !allPinned;
  if (handSet && !allPinned && (!overtimeOnly || (strategy === 'platoon' && sitIds?.length))
      && !(byHand && !sitIds?.length)) return { ok: false, reason: 'strategy' };
  if (!suffix.length) return { ok: false, reason: 'nothing' };

  const sit = new Set(sitIds || []);
  const all = availIds(g);
  const avail = playingIds(g, sitIds, standing);
  if (avail.length < LINEUP_FLOOR) return { ok: false, reason: 'nobody' };

  /* `effectiveStints`, not `p.stints`: a coach who already swapped somebody on
     by hand changed who played, and a re-solve that settles up against the
     plan's opinion instead of the game would owe the wrong kid. */
  const eff = effectiveStints(g, p);
  const before = eff.slice(0, k);
  const played = minutesFrom(before, all);
  /* #369: a pinned stint is not solved, so it is minutes already played as far
     as the solve goes: the fives it will have count toward caps, minimums and
     fairness, and the budget is the stints still open. */
  const pinsNow = pinFives(g, p, k, avail, {}, end);
  const pinnedPlayed = Object.keys(pinsNow).map(Number).map(j => ({ onFloor: pinsNow[j], minutes: p.stints[j].minutes, at: j }));
  for (const x of pinnedPlayed) for (const id of x.onFloor) if (id in played) played[id] = Math.round((played[id] + x.minutes) * 100) / 100;

  /* #442: Plays at most N in a row counts across the cut. Each player's run ending at
     the cut -- the stints played, then the pinned fives that sit before the
     first open stint -- is what the solver starts from. Whole runs are counted
     by the engine; this only says how long each one already is. */
  const lead = before.map(s => s.onFloor);
  for (let j = k; j < (open[0] ?? end); j++) lead.push(pinsNow[j] || eff[j].onFloor);
  const streakBefore = {};
  for (const id of avail) {
    const run = runEndingAt(lead, id, lead.length - 1);
    if (run) streakBefore[id] = run;
  }
  /* #441: the bench run at the cut, the same lead read the other way round, so
     the engine's one run counter does the counting. A kid who walked in late
     (`live.arrived`) was not benched before they got there, so only the
     stints after their arrival count -- the stints `fair` below shares out. */
  const arrived = lateArrivals(g, p, k);
  const sitBefore = {};
  if (g.constraints.maxBench) {
    for (const id of avail) {
      let run = runEndingAt(lead, id, lead.length - 1, 0, false);
      if (id in arrived) run = Math.min(run, Math.max(0, lead.length - 1 - arrived[id]));
      if (run) sitBefore[id] = run;
    }
  }

  const openStints = open.map(j => p.stints[j]);
  const total = openStints.reduce((a, s) => a + s.minutes, 0);
  const longest = openStints.reduce((a, s) => Math.max(a, s.minutes), 0);
  const maxSubs = state.settings?.maxSubs ?? DEFAULT_SETTINGS.maxSubs;

  const c = clone(g.constraints);
  c.openingFive = [];
  if (!lastPeriodAhead(g, p, k)) c.lastPeriodFive = [];
  if (strategy !== 'platoon') c.units = [];
  if (strategy !== 'closers') c.closing = null;
  /* #437: `replanRest`'s last resort -- hold nobody to a stint. */
  dropPinned(c, dropPins);
  /* A By hand lock holds a regulation number, not overtime's, so it is dropped
     for every other strategy: only By hand lets a coach set locks, and the
     engine reads them only to hold a locked row out of its proportional top-up
     -- there is nothing to hold when the targets are the fairness ones made
     below. Under By hand (#489) the targets are the coach's own numbers, so a
     locked one stays locked for the kids still here. `c` is a clone made for
     this one solve, so the saved locks are untouched. */
  c.lockedTargets = byHand ? (g.constraints.lockedTargets || []).filter(id => avail.includes(id)) : [];
  c.minMinutes = {};
  c.maxMinutes = {};
  for (const id of avail) {
    const cap = g.constraints.maxMinutes?.[id];
    // the same composition `computeAll` uses; a kid who walked in late is owed
    // the league's share of the time left (#447), not the whole game's
    const lo = composedMinimum(g, id, leagueMinFor(g, arrived[id]));
    const left = Math.min(total, Math.max(0, lo - (played[id] || 0)));
    if (left > 0) c.minMinutes[id] = left;
    if (cap != null) c.maxMinutes[id] = Math.max(0, cap - (played[id] || 0));
  }

  /* #490: `replanRest`'s retry when the caps left cannot cover the floor --
     each Plays at most minus what was played, with the uncapped kids at the
     whole of `total`, add up to less than five on the floor for every stint
     left. The shortfall is shared equally among the capped kids (none past
     `total`, which is all anyone can play), so the kids whose cap is not in
     the way keep it. Saying so is `capNotes`'s job, off the minutes. */
  if (relaxCaps) {
    const capped = avail.filter(id => id in c.maxMinutes);
    const room = avail.reduce((a, id) => a + (id in c.maxMinutes ? c.maxMinutes[id] : total), 0);
    let shortfall = total * LINEUP_FLOOR - room;
    let open = capped.filter(id => c.maxMinutes[id] < total);
    for (let pass = 0; pass < 20 && shortfall > 1e-9 && open.length; pass++) {
      const each = shortfall / open.length;
      for (const id of open) {
        const give = Math.min(each, total - c.maxMinutes[id]);
        // rounded up to the hundredth: the engine compares the sum to the floor exactly
        const to = Math.min(total, Math.ceil((c.maxMinutes[id] + give) * 100 - 1e-9) / 100);
        shortfall -= to - c.maxMinutes[id];
        c.maxMinutes[id] = to;
      }
      open = open.filter(id => c.maxMinutes[id] < total - 1e-9);
    }
  }

  /* Fairness, in the one currency the engine already takes. `deficit` is each
     player's even share of what has been played so far minus what they really
     played, so a target lands on (everyone's total + the rest) / n minus what
     they have -- which is "whole-game even among whoever is still playing". */
  /* #247: a kid who walked in late (`live.arrived[id]`, the stint they walked
     in during) is owed a share of only the stints after it. Each past stint's
     minutes are split among whoever was there for it; with nobody late that is
     the plain average of what was played. */
  const fair = Object.fromEntries(avail.map(id => [id, 0]));
  [...before.map((s, j) => [s, j]), ...pinnedPlayed.map(x => [x, x.at])].forEach(([s, j]) => {
    const here = avail.filter(id => !(id in arrived) || arrived[id] < j);
    if (!here.length) return;
    const pool = s.minutes * s.onFloor.filter(id => avail.includes(id)).length;
    for (const id of here) fair[id] += pool / here.length;
  });
  /* #489: under By hand what a kid is owed is their own number (a late
     arrival's scaled to the share of regulation from their arrival on, the
     reading `leagueMinFor` makes), with no band: it is the coach's word. */
  if (byHand) {
    const { lens } = regulationLens(g);
    const game = lensSum(lens);
    for (const id of avail) {
      const slots = g.constraints.targetSlots?.[id];
      if (slots == null) continue;
      const share = id in arrived ? lensSum(lens, arrived[id]) / game : 1;
      fair[id] = slotsToMinutes(g, slots) * share;
    }
  }
  const deficit = Object.fromEntries(avail.map(id => [id, fair[id] - (played[id] || 0)]));
  const targets = carryoverTargets({
    ids: avail, deficit,
    budget: total * LINEUP_FLOOR,
    cap: byHand ? total : 2 * longest,
    min: c.minMinutes, max: c.maxMinutes,
    ceiling: total,
  });
  /* null means the targets could not be made to add up -- everyone pinned at a
     cap, most likely. Standing down leaves the solver to water-fill to the
     plain even share, which is still a re-solve and still better than dumping
     every remaining stint on one kid. Slice 2 says so on screen. */
  if (targets) c.targetMinutes = targets;

  /* #369: only the open stints are solved; a suffix that is all pinned has
     nothing to solve, and a rule must not get to refuse the five. */
  let r = { issues: [], stints: [], minutes: null };
  if (open.length) {
    const solve = () => generatePlan({
      players: state.players,
      availableIds: avail,
      stints: openStints,
      format: gameFormat(g),
      granularity: { mode: g.granMode, value: g.granValue },
      constraints: c, strategy, balance: g.balance,
      seed: g.seed,
      maxSubs, streakBefore, sitBefore,
    });
    /* #376: a sit changes one seat. The four who stay are handed to the
       solver as the opening five of the suffix (stint `from`), the engine's
       own forced group. If that cannot be met -- a hand swap put two Apart
       players together, say -- the free solve below is today's behavior. */
    if (sit.size && open[0] === k) {
      c.openingFive = effectiveStints(g, p)[k].onFloor.filter(id => !sit.has(id) && avail.includes(id));
    }
    r = solve();
    if (!r.ok && c.openingFive.length) {
      c.openingFive = [];
      r = solve();
    }
    /* #437: a kid whose Plays at most is spent cannot be held to a stint the
       engine pins them onto -- the first remaining stint of the last period,
       or the closing window. The engine names who (`FORCED_OVER_CAP` /
       `PINS_OVER_CAP`); those kids, and only those, stop being held, and the
       rest is solved again. */
    if (!r.ok) {
      const capped = [...new Set(r.issues.filter(i => i.severity === 'error'
        && (i.code === 'FORCED_OVER_CAP' || i.code === 'PINS_OVER_CAP')).flatMap(i => i.playerIds))];
      if (capped.length) {
        const pinned = pinnedRules(g, c);
        const was = Object.fromEntries(capped.map(id => [id, pinned[id] || []]));
        dropPinned(c, capped);
        const again = solve();
        if (again.ok) {
          const calls = callNames(state.players);
          const held = capped.filter(id => was[id].length);
          again.issues = [...again.issues, ...held.map(id => ({
            severity: 'warn', code: 'PIN_CAP_USED', playerIds: [id],
            message: `${calls[id]}: Plays at most is used up, so ${was[id].join(' and ')} no longer holds them.`,
          }))];
          again.pinsDropped = held;
          r = again;
        }
      }
    }
    if (!r.ok) return { ok: false, reason: 'infeasible', issues: r.issues };
  }

  /* The pins go on after the solve (not into `buildForced`, whose players still
     pass caps and Apart rules): so every path that re-plans keeps them. */
  const overrides = {};
  const solved = {};
  r.stints.forEach((s, i) => { solved[open[i]] = overrides[open[i]] = s.onFloor.slice(); });
  Object.assign(overrides, pinFives(g, p, k, avail, solved, end));
  const minutes = Object.keys(pinsNow).length
    ? minutesFrom(suffix.map((s, i) => ({ onFloor: overrides[k + i] || s.onFloor, minutes: s.minutes })), avail)
    : r.minutes;
  return { ok: true, from: k, overrides, issues: r.issues, minutes, pinsDropped: r.pinsDropped || [] };
}

/* ================================================================== *
 * the day ends -- its games become the season
 *
 * "New day" used to be the moment a coach's Saturday was thrown away:
 * `state.day` was replaced wholesale and the minutes every kid had just
 * played went with it. It is now the moment those games are kept.
 *
 * There is no confirmation when a day rolls over, and that is the
 * decision, not an omission. The bug is that a coach loses a day
 * without ever being asked; an answer that only works when they remember
 * to press something reproduces it for the coach who is busiest. So a
 * game is kept when it is in the day at the moment "New day" fires *and*
 * it was actually started -- `stage(p, g.live)` (`live.js`) is the one
 * honest signal, read once and never re-derived: `'not-started'` means
 * nothing from the plan was ever played, and #133 leaves that game out
 * rather than filing its planned minutes. A plan that never solved
 * (`p.ok` false) was never playable either way and stays out silently, as
 * it always has. Deleting a game before then is the coach saying it did
 * not happen, and deleting already takes it out of the day, so it never
 * reaches here. (`carryUnplayedDay` reads the plan-free equivalent --
 * `gameStarted` -- because it runs before plans are solved.)
 *
 * The minutes are `effectiveMinutes`, never `plan.minutes`: a coach who
 * swapped Ben on for Devon in the third stint changed who played, and
 * the season has to say so or the whole record is the plan's opinion
 * rather than the game.
 *
 * Idempotent by game id, so a double tap cannot double anyone's total --
 * and the caller wraps this in `undoable`, which snapshots the whole
 * record, so Undo un-archives for free with no second code path.
 * ================================================================== */
export function archiveDay(d = state.activeDay) {
  const t = team();
  if (!t.season || !Array.isArray(t.season.games)) t.season = { games: [] };
  const day = t.days[d];
  const dp = dayPlans[d] || [];
  const filed = [];
  const skipped = [];
  day.games.forEach((g, i) => {
    const p = dp[i];
    const st = stage(p, g.live);
    if (st === 'part-played' || st === 'finished') {
      filed.push(seasonGame(g, effectiveMinutes(g, p), { dayName: day.name, date: day.date }));
    } else if (st === 'not-started') {
      skipped.push(gameLabel(g, i));
    }
  });
  return { kept: addSeasonGames(t.season, filed), skipped };
}

/* #123: whether bench mode is open, in one place. Every module that asked
 * this before read `#gamemode`'s `hidden` property itself -- `dueToFile`
 * here, four places in `toast.js`, one in `shortcuts.js` and three inside
 * `gamemode.js` -- which is the DOM-read twin of the `live.at` bug `live.js`
 * fixes: nine copies of one fact that could disagree. It is a module
 * variable, not part of `state`: `state` is saved and Undo-snapshotted, and
 * whether a screen is open is neither. `gamemode.js` calls `setBenchOpen` on
 * the same line it shows or hides `#gamemode`. */
let benchIsOpen = false;
export const benchOpen = () => benchIsOpen;
export const setBenchOpen = v => { benchIsOpen = !!v; };

/**
 * #100: whether a day is due to file -- dated strictly before today, the
 * phone's own day. A day dated today has not finished; a day dated tomorrow
 * (reachable only through a hand-edited backup) has not started either.
 * `YYYY-MM-DD` strings compare the same way their dates do, so no `Date` is
 * built from either side. "Today" is injectable so a pinned clock can stand
 * in for the phone's own day in a test.
 */
export const dayIsToday = (day, today = new Date()) => day.date === seasonDate(today);
export const dayIsPast = (day, today = new Date()) => day.date < seasonDate(today);

/**
 * #100 review, finding 3: whether the current day is due to file -- past-
 * dated (`dayIsPast`) and bench mode not open. `fileIfPast` below and
 * `app.js`'s boot/foreground/bench-mode-close trigger each used to run their
 * own copy of the bench-mode check; this is their one shared home. "Today" is
 * injectable so a pinned clock can stand in for the phone's own day in a test.
 */
export const dueToFile = (today = new Date()) => {
  if (benchOpen()) return false;
  // #252: no team yet, so nothing of the coach's to file
  if (state.onboarded === false) return false;
  return team().days.some(d => dayIsPast(d, today));
};

// "Sat, Sep 27" -- the coach's own locale, short weekday, short month, day.
// Exported (#112): the day-name hint under `#dayName` (game-setup.js's
// `renderSetup`) reuses this rather than a second formatter -- one answer,
// one place.
export const weekdayLabel = iso => {
  const d = localDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
};

/**
 * #101 item 4: the heading Today gives each day it stacks -- shared with the
 * game screen's own `#gameSub` lead-in, so the two never invent two names for
 * the same date. "Today" and "Tomorrow" read off the phone's own day
 * (injectable so a pinned clock can stand in, in a test); every other date
 * reuses `weekdayLabel` rather than a second formatter. A day with a name
 * appends " · <name>" to whichever label applies.
 */
export function dayHeading(day, today = new Date()) {
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const base = dayIsToday(day, today) ? 'Today'
    : day.date === seasonDate(tomorrow) ? 'Tomorrow'
    : weekdayLabel(day.date);
  return day.name ? `${base} · ${day.name}` : base;
}

/**
 * #379: a game set up the night before is still the coach's game the next
 * morning. When filing is due (`dueToFile`), today has no day, and the latest
 * past day has no started game (none part-played or finished -- `live.js`'s
 * own readers), that day is dated today instead of filed. Nothing else about
 * it changes, so there is nothing to announce or undo. Older past days stay
 * for `fileIfPast`. Returns whether a day moved. "Today" is injectable.
 */
export function carryUnplayedDay(today = new Date()) {
  if (!dueToFile(today)) return false;
  const iso = seasonDate(today);
  const days = team().days;
  if (days.some(d => d.date === iso)) return false;
  const past = days.filter(d => dayIsPast(d, today));
  // `past` is non-empty: dueToFile held, and reduce has no initial value
  const latest = past.reduce((a, b) => (b.date > a.date ? b : a));
  if (latest.games.some(g => gameStarted(g.live))) return false;
  latest.date = iso;
  return true;
}

/**
 * #100: the filing entry point. When `state.day` is due (`dueToFile`), files
 * its solved games into the season under its own date and replaces it with
 * one fresh game dated `today` -- exactly what "New day" used to build
 * (`newGame(0, lastGame(), settings)`, `out = []`, no name). A no-op while
 * bench mode is open: a stint in progress must not be filed out from under
 * the coach mid-game -- see `dueToFile`. Called after boot's first render,
 * on `visibilitychange` to visible, and when bench mode closes; "today" is
 * injectable so a pinned clock can stand in for the phone's own day in a
 * test.
 *
 * Returns the toast message it showed (one toast every time it actually
 * files, even when nothing solved -- a day vanishing silently reads as data
 * loss), or null when nothing was due or bench mode is open.
 */
export function fileIfPast(today = new Date()) {
  if (!dueToFile(today)) return null;
  const t = team();

  // Every past day, oldest first -- filing order, not storage order (`days`
  // is already sorted by `sanitizeTeam`, but this does not lean on that).
  const idxs = t.days.map((_, i) => i).filter(i => dayIsPast(t.days[i], today));
  idxs.sort((a, b) => (t.days[a].date < t.days[b].date ? -1 : t.days[a].date > t.days[b].date ? 1 : 0));

  const filedDate = t.days[idxs[0]].date;
  const lastFiled = t.days[idxs[idxs.length - 1]];
  const activeDayRef = t.days[t.activeDay];

  let kept = 0;
  const skipped = [];
  for (const i of idxs) {
    const r = archiveDay(i);
    kept += r.kept;
    skipped.push(...r.skipped);
  }

  const removed = new Set(idxs);
  t.days = t.days.filter((_, i) => !removed.has(i));

  // "No empty days" (Decisions): when filing leaves none, one day dated
  // today with one new game replaces them -- the fresh-day shape #100 built.
  let fellBack = false;
  if (!t.days.length) {
    fellBack = true;
    const g = newGame(0, lastFiled.games[lastFiled.games.length - 1], state.settings);
    g.out = []; g.late = [];
    t.days = [{ name: '', date: seasonDate(today), games: [g] }];
    t.activeDay = 0;
    state.activeGame = 0;
  } else {
    const newIdx = t.days.indexOf(activeDayRef);
    if (newIdx < 0) { t.activeDay = 0; state.activeGame = 0; } else { t.activeDay = newIdx; }
  }

  const n = idxs.length;
  const msg = n === 1
    ? (kept
      ? `${weekdayLabel(filedDate)}: ${kept} game${kept === 1 ? '' : 's'} filed to the season.`
      : `${weekdayLabel(filedDate)} is over.`)
    : (kept
      ? `${n} past days: ${kept} game${kept === 1 ? '' : 's'} filed to the season.`
      : `${n} past days are over.`);

  // #133: a game that was never started is left out of the count above and
  // named here instead -- one sentence, added only when the day(s) that
  // filed actually skipped one. Two or more are counted, not named: a
  // tournament day could skip five, and five names do not fit one toast.
  const skipMsg = skipped.length === 1 ? ` ${skipped[0]} was never started, so it was left out.`
    : skipped.length > 1 ? ` ${skipped.length} games were never started, so they were left out.`
    : '';
  const full = msg + skipMsg;
  return fellBack && kept === 0 ? `${full} A new game is ready for today.` : full;
}
