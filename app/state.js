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
import { generatePlan, fmtMinutes, buildStints, DEFAULT_TIER } from './engine.js';
import { capacityOf, normalizeSlots, rebalance, carryoverTargets } from './budget.js';
import { loadState, saveState, seasonGame, addSeasonGames, seasonShare,
         sanitizeSettings, DEFAULT_SETTINGS, seasonDate, localDate,
         validTipoff, tipoffLabel, sortDay } from './storage.js';
import { el, clone, uid } from './dom.js';
import { callNames } from './roster.js';

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
 * Players carry generated ids. Every constraint, every availability
 * flag and all carryover keys off that id, so renaming, reordering or
 * deleting a player can never silently reattach Kade's cap to Aaron.
 * ================================================================== */

export const emptyConstraints = () => ({
  // `keepOnFloor` is the third pair relation: never BOTH off. Absent is empty,
  // which is what every record written before it says -- so no version bump.
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], keepOnFloor: [],
  openingFive: [], lastPeriodFive: [], hardPairs: false,
  maxConsecutive: 0,
  targetSlots: {}, lockedTargets: [],
  closing: { stints: 2, players: [] },
  units: [],
});

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
  { mode: 'breaksOnly', value: 1, label: 'Breaks only', phrase: 'only at breaks' },
];

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
    granMode: 'everyN', granValue: 4,
    out: [], useCarryover: n > 0,
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
    out: [...from.out], constraints: clone(from.constraints),
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
  /* Sanitised first, not inline below, because the first game has to see it:
     a new team's opening game is the one place with nothing to clone, so the
     team's format default is the only thing that can answer it. */
  const s = sanitizeSettings(settings);
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
       fills in the rest, so `undefined` is simply the defaults. */
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
 * Non-enumerable on purpose. `saveState` serialises with JSON.stringify,
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
/* The league's floor, in minutes -- 0 is off. Exported because it is the one
   team setting that changes what the RULES section is telling the truth about:
   it composes into the per-player minimums the solver reads (`computeAll`), so
   with it set the plan is not "just evening out the minutes". The count badge,
   the drawer's copy and the solver all read it here, so two screens cannot
   disagree about whether a rule exists (A24b). No settings block means the
   default, which is what an unsanitized record means. */
export const leagueMinutes = () => state.settings?.minMinutes ?? DEFAULT_SETTINGS.minMinutes;

/* One rule, one count (#26 item 9). `passSummary` and `sentenceParts` below
   and each game's pass on Today both show this number, so it is computed once,
   exactly as `renderConstraints` (rules.js) lists rules: a starting five or a
   last-period five is 1 rule, not 5 (the badge used to add `.length`, which
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
    + (leagueMinutes() > 0 ? 1 : 0);
}

/* #28 decision 5: the Plan sheet's Rules section, as plain sentences, in the
 * table's own order -- league minimum, minimum, cap, together, apart, one of
 * two on, starting five, last-period five, rest limit. Reads exactly the
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

  const lmin = leagueMinutes();
  if (lmin > 0) items.push({ kind: 'leagueMinimum', text: `Everyone plays at least ${lmin} min`, removable: false });

  for (const [id, v] of Object.entries(c.minMinutes)) {
    if (!avail.has(id)) continue;
    items.push({ kind: 'minimum', text: `${nm(id)} plays at least ${v} min`, removable: true, id });
  }
  for (const [id, v] of Object.entries(c.maxMinutes)) {
    if (!avail.has(id)) continue;
    items.push({ kind: 'cap', text: `${nm(id)} plays at most ${v} min`, removable: true, id });
  }
  for (const pair of c.pairs) {
    items.push({ kind: 'together', text: `${joinNames(pair.map(nm))} play together`, removable: true, pair });
  }
  for (const pair of c.avoids) {
    items.push({ kind: 'apart', text: `${joinNames(pair.map(nm))} never play together`, removable: true, pair });
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
      text: `Nobody plays more than ${c.maxConsecutive} stint${c.maxConsecutive > 1 ? 's' : ''} in a row` });
  }

  return items;
}

/* `keepOnFloor` is newer than the records already in a coach's browser, and
   only `sanitizeTeam` fills it in. Created lazily in one place so no reader
   -- this file's own `ruleCount`/`removeRule` or rules.js's Add-a-rule page
   -- has to think about the absent key. */
export const keepOnList = c => (c.keepOnFloor || (c.keepOnFloor = []));

/* #28 decision 6/9: deletes exactly the rule an `item` from `ruleItems`
 * names, the same mutation the chip ✕ in rules.js already makes -- moved
 * here so Remove rule (which needs an undoable snapshot taken first) and the
 * chip removal are the same code, not two copies that could drift. The
 * league minimum is not removable (see `ruleItems`); called on it, this is a
 * deliberate no-op rather than a throw, since a detail page never shows a
 * Remove button for it. */
export function removeRule(c, item) {
  const samePair = pr => pr[0] === item.pair[0] && pr[1] === item.pair[1]
    || pr[0] === item.pair[1] && pr[1] === item.pair[0];
  switch (item.kind) {
    case 'minimum': delete c.minMinutes[item.id]; break;
    case 'cap': delete c.maxMinutes[item.id]; break;
    case 'together': { const i = c.pairs.findIndex(samePair); if (i >= 0) c.pairs.splice(i, 1); break; }
    case 'apart': { const i = c.avoids.findIndex(samePair); if (i >= 0) c.avoids.splice(i, 1); break; }
    case 'keepon': { const list = keepOnList(c);
      const i = list.findIndex(samePair); if (i >= 0) list.splice(i, 1); break; }
    case 'starts': c.openingFive = []; break;
    case 'lastq': c.lastPeriodFive = []; break;
    case 'rest': c.maxConsecutive = 0; break;
    default: break; // 'leagueMinimum', or anything unrecognized: not removable from here
  }
}

/* #28 decision 7: whether a draft is complete enough to enable `Add rule`,
 * for each of the eight kinds. `draft` is the one shape the Add-a-rule page
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
    case 'rest': return Number.isInteger(d.n) && d.n >= 1 && d.n <= 4;
    default: return false;
  }
}

/* #25: the active team's color, read the same way `leagueMinutes` above
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
   later — so the notice would be wiped before it was ever read. `soon()` is
   the signal, because it is only ever reached from an edit handler. */
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
   sizes, and the six roster-size landing pages are built on that distribution
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

export const game = () => state.day.games[state.activeGame];
export const lastGame = () => state.day.games[state.day.games.length - 1];
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

/* An empty roster is not a mistake, it is the first thing that happens. On a
 * fresh device the games view used to greet the coach with a red "Only 0
 * players available; you need at least 5 to field a lineup" over "No rotation
 * yet — resolve the errors above" — telling someone who has done nothing yet
 * that they did it wrong. `noRoster()` is true only at a literally empty
 * roster: a real squad that is 4-present genuinely is under strength, and
 * keeps the red error, because there the message is the right one. */
export const noRoster = () => !state.players.length;

/* ---- removing a player has to sweep every reference to their id ---- */
/* Every reference to a player id, in one place, because a missed one does not
   fail loudly -- it renders. A live override left holding a removed id put five
   rows reading "undefined" with "?" avatars on the bench-mode screen, mid-game,
   which is the worst possible place for it. `sanitize` drops overrides whose
   ids no longer resolve, so a reload cleaned it up and it looked intermittent.
   Slots, locks, the closing group and platoon units were unswept too. */
export function removePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  for (const g of team().days.flatMap(d => d.games)) {
    g.out = g.out.filter(x => x !== id);
    const c = g.constraints;
    delete c.minMinutes[id]; delete c.maxMinutes[id];
    delete c.targetSlots?.[id];
    c.lockedTargets = (c.lockedTargets || []).filter(x => x !== id);
    c.pairs = c.pairs.filter(p => !p.includes(id));
    c.avoids = c.avoids.filter(p => !p.includes(id));
    c.openingFive = c.openingFive.filter(x => x !== id);
    c.lastPeriodFive = c.lastPeriodFive.filter(x => x !== id);
    if (c.closing) c.closing.players = (c.closing.players || []).filter(x => x !== id);
    c.units = (c.units || []).map(u => u.filter(x => x !== id));

    /* An override is a whole five the coach chose by hand. With one player
       gone it is no longer a lineup, and there is nothing honest to put in the
       gap -- so drop it and fall back to the planned stint, which is what the
       rest of the game is already using. */
    const ov = g.live?.overrides;
    if (ov) for (const k of Object.keys(ov)) if (ov[k].includes(id)) delete ov[k];
  }
}

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
 * games, and opens it (`openGame`, below) -- the shape "Add a game" commits
 * (#32, #101 item 2).
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
 * empty days"). Never removes the team's only game anywhere -- the caller
 * (`teams-view.js`'s "Remove this game") is the one that decides whether to
 * even offer it, on the same total.
 */
export function removeGame() {
  const t = team();
  if (t.days.reduce((n, d) => n + d.games.length, 0) < 2) return;
  const day = t.days[t.activeDay];
  day.games.splice(state.activeGame, 1);
  if (day.games.length) {
    state.activeGame = Math.min(state.activeGame, day.games.length - 1);
    return;
  }
  const idx = t.activeDay;
  t.days.splice(idx, 1);
  openGame(Math.min(idx, t.days.length - 1), 0);
}

/** Opens game `i` of day `d` -- the Resume bar and Today's passes both land here. */
export function openGame(d, i) {
  team().activeDay = d;
  state.activeGame = i;
}

/* Sitting a player out is the other half of the sweep above, and it was
   missed. A no-show or a foul-out does not remove anyone from the roster, so
   `removePlayer` never runs -- but an override naming them is just as wrong:
   it is a hand-picked five with someone in it who is not in the gym. It
   survived into bench mode (the absent player shown on the floor, the player
   who should be there shown on the bench) and, worse, onto the *printed
   card*, which is the artefact the coach coaches from. `sanitize` did not
   catch it either, because the ids all still resolve to real players.
   Same answer as removing: drop the five and fall back to the plan. */
export function setAvailable(g, id, available) {
  g.out = available ? g.out.filter(x => x !== id) : [...g.out, id];
  if (available) return;
  const ov = g.live?.overrides;
  if (ov) for (const k of Object.keys(ov)) if (ov[k].includes(id)) delete ov[k];
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
  const ov = g.live?.overrides;
  const had = !!(ov && Object.keys(ov).length);
  if (ov) g.live.overrides = {};
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
    { periods: g.periods, periodMinutes: g.periodMinutes },
    { mode: g.granMode, value: g.granValue });
  const total = stints.reduce((a, x) => a + x.minutes, 0);
  // `max` is the longest stint: the season carryover clamps a single game's
  // correction to two of them, the same clamp the engine's day carryover uses.
  return { count: stints.length, avg: total / stints.length, total,
           max: stints.reduce((a, x) => Math.max(a, x.minutes), 0) };
}

const slotsToMinutes = (g, slots) => +(slots * stintShape(g).avg).toFixed(2);

// Keep the allocation valid whenever the roster, availability or format moves.
export function normalizeTargets(g) {
  const c = g.constraints;
  const ids = availIds(g);
  const { count } = stintShape(g);
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
  const { count } = stintShape(g);
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
   `availIds`, `g.strategy`/`g.useCarryover` and `ruleCount` -- nothing here is
   re-derived. */
export function passSummary(g, i) {
  const n = availIds(g).length;
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
   Nothing here is re-derived: `availIds`, `ruleCount`, `STRATEGY_WORDS` and
   `GRAN_CHOICES` are the same single sources `passSummary` above reads. */
export function sentenceParts(g, i) {
  const n = availIds(g).length;
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
  const plural = earlier.length > 1;
  if (names.some(nm => !nm)) return `Evens out the earlier game${plural ? 's' : ''}.`;
  return `Evens out the ${joinNames(names)} game${plural ? 's' : ''}.`;
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
   re-derived here. */
export function sameAsLast() {
  const days = team().days;
  const games = days[days.length - 1].games;
  const i = games.length - 1;
  const g = games[i];
  if (!g || !availIds(g).length) return null;
  const { players, format, strategy } = sentenceParts(g, i);
  return {
    title: g.tipoff ? `Same as ${tipoffLabel(g.tipoff)}?` : 'Same as the last game?',
    summary: `${players}, ${format}, ${strategy}`,
  };
}

/* The status line inside an open sheet (decision 10, item 6): the minute
   range and the change count, read off `effectiveMinutes`/`effectiveStints`
   -- never `p.minutes`/`p.stints` -- so a hand swap the coach made before
   opening the sheet is what the line describes. A blocked plan names its
   first error, same wording as `renderIssues` (plan-view.js) already uses. */
export function planSay(g, p) {
  if (!p || !p.ok) {
    const err = (p?.issues || []).find(x => x.severity === 'error');
    return `Plan blocked: ${err ? err.message : ''}`;
  }
  const stints = effectiveStints(g, p);
  const mins = effectiveMinutes(g, p);
  const vals = Object.values(mins);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const subs = stints.slice(1).reduce((a, r) => a + r.in.length, 0);
  const minutesPart = lo === hi
    ? `${fmtMinutes(hi)} minutes each`
    : `${fmtMinutes(lo)} to ${fmtMinutes(hi)} minutes each`;
  return `${minutesPart}, ${subs} change${subs === 1 ? '' : 's'}`;
}

/* The Format sheet's stepper (decision 5): one step, clamped into range. A
   stored value already outside the range (say 30 minutes, `storage.js` allows
   up to 40) is shown as it is and its first tap lands on the nearest end
   rather than one step further out. */
export const stepFormat = (v, d, lo, hi) => Math.min(hi, Math.max(lo, v + d));

/* One entry per available player, in roster order (#26 item 6 / decision 10):
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
  return availIds(g).map(id => {
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
   `g.periodMinutes` is every period's length, so a block's `from`/`to`
   divide by it for a fraction of that period's track. Pure: reads nothing
   off `state`. */
export function rowGradient(blocks, g, color, trackColor) {
  const periods = g.periods, periodMinutes = g.periodMinutes;
  const track = (100 - (periods - 1) * ROW_GAP_PCT) / periods;
  const pct = n => `${Math.round(n * 10000) / 10000}%`;
  const stops = [];
  const push = (from, to, c) => stops.push(`${c} ${pct(from)}`, `${c} ${pct(to)}`);
  for (let pi = 0; pi < periods; pi++) {
    const start = pi * track + pi * ROW_GAP_PCT;
    const frac = m => start + (m / periodMinutes) * track;   // m minutes into this period, as a % of the row
    if (pi > 0) push(start - ROW_GAP_PCT, start, 'transparent');
    const periodBlocks = blocks.filter(b => b.period === pi + 1).sort((a, b) => a.from - b.from);
    let cursor = 0;
    for (const b of periodBlocks) {
      if (b.from > cursor) push(frac(cursor), frac(b.from), trackColor);
      push(frac(b.from), frac(b.to), color);
      cursor = b.to;
    }
    if (cursor < periodMinutes) push(frac(cursor), frac(periodMinutes), trackColor);
  }
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
export function blockedFix(issues) {
  const err = (issues || []).find(i => i.severity === 'error');
  if (!err) return null;
  if (err.code === 'NOT_ENOUGH_PLAYERS') return { message: err.message, label: "Change who's here", opener: 'who' };
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
const ON_FLOOR = 5;
export let seasonAdjust = {};

function seasonTargetsFor(g, avail, deficitOf) {
  const shape = stintShape(g);
  const floor = shape.total * ON_FLOOR;
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
    ? `: the lower rotation levels, which is how this team settles a tie.`
    : explained
      ? `: furthest ahead on ${(team().season?.games || []).length ? 'the season' : 'the day'} so far.`
      : `: nobody is ahead or behind yet, so it rotates. Shuffle, or set their minutes by hand.`);
  return p;
}

/* ---- one chokepoint for "these swaps no longer describe this rotation" ----

   `live.overrides` is a five the coach picked by hand against a *specific*
   rotation, filed under a stint index. Three sweeps grew one at a time --
   `removePlayer`, `setAvailable`, `reseed` -- and each one closed exactly one
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

function syncOverrides(g, p) {
  const live = g.live;
  if (!p || !p.ok || !live) return p;
  if (!Object.keys(live.overrides || {}).length) { live.stamp = ''; return p; }
  const stamp = rotationStamp(p);
  if (!live.stamp) { live.stamp = stamp; return p; }   // first sight: adopt it
  if (live.stamp === stamp) return p;
  live.overrides = {};
  live.stamp = '';
  dropped++;
  return p;
}

/* Same clamp `balance.js` applies to the meter: a level the record does not
   recognize is the middle one, which is the level that decides nothing. */
const tierOfPlayer = p => {
  const n = Number(p.tier);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : DEFAULT_TIER;
};

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

  /* The league's floor, read the same way and for the same reason. 0 is off,
     and 0 is what every record written before the key existed means, so a
     coach who never opens Settings gets byte-identical plans. */
  const leagueMin = leagueMinutes();

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
      // slots are the UI's currency; the engine works in minutes. Normalise here
      // rather than in the editor so the budget invariant holds even when the
      // roster or format changed from another view.
      if (g.strategy === 'minutes') normalizeTargets(g);
      const carry = (g.useCarryover && any) ? { ...cum } : null;
      /* Computed before the cache is consulted and folded into the signature:
         the whole chain -- a game deleted from the ledger, an earlier game in
         the day re-solving -- then invalidates on its own, exactly as the
         day carryover does. */
      const seasonT = seasonTargetsFor(g, ids.filter(id => !out.has(id)), deficitOf);
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
      const sig = JSON.stringify([
        // p.tier and g.balance belong here: both change the plan, and leaving
        // either out means a coach re-tiers a player and the card does not move
        ps.map(p => [p.id, p.name, p.shortName, p.tier]), g.out, g.periods, g.periodMinutes,
        g.granMode, g.granValue, g.constraints, g.strategy, g.balance, g.seed, carry, seasonT, prio,
        // team settings reach the solver too, so they belong in the signature
        // for the same reason: change the number and the card must move
        maxSubs, leagueMin,
      ]);
      const hit = planCache.get(g.id);
      if (hit && hit.sig === sig) {
        if (hit.plan.ok) {
          any = true;
          for (const [id, m] of Object.entries(hit.plan.minutes)) cum[id] += m;
          noteToday(hit.plan.minutes);
        }
        return syncOverrides(g, hit.plan);
      }
      const c = clone(g.constraints);
      /* The league floor, composed into the per-player map the engine has always
         read -- so `engine.js` is untouched and knows nothing about the setting.
         A minimum the coach set by hand wins when it is higher; their CAP wins
         when it is lower, because a cap is a deliberate "hold this kid back" and
         raising past it would manufacture a MIN_ABOVE_CAP error they never
         asked for. Everyone who is out is left alone: they are not available, so
         no rule about available players reaches them. */
      if (leagueMin > 0) {
        for (const id of ids) {
          if (out.has(id)) continue;
          const cap = c.maxMinutes[id];
          const want = Math.max(c.minMinutes[id] || 0, leagueMin);
          c.minMinutes[id] = cap != null ? Math.min(cap, want) : want;
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
        format: { periods: g.periods, periodMinutes: g.periodMinutes },
        granularity: { mode: g.granMode, value: g.granValue },
        constraints: c, strategy: g.strategy, balance: g.balance,
        carryover: carry,
        priority: prio,
        seed: g.seed,
        maxSubs,
      });
      if (seasonT) sayTheSeasonSetThem(p);
      sayWhyTheyAreShort(p, prio, tiers);
      planCache.set(g.id, { sig, plan: p });
      if (p.ok) {
        any = true;
        for (const [id, m] of Object.entries(p.minutes)) cum[id] += m;
        noteToday(p.minutes);
      }
      return syncOverrides(g, p);
    });
  };

  dayPlans = team().days.map(solveDay);
  plans = dayPlans[team().activeDay];

  for (const key of [...planCache.keys()]) if (!live.has(key)) planCache.delete(key);
  for (const key of Object.keys(seasonAdjust)) if (!live.has(key)) delete seasonAdjust[key];
  /* Two totals, deliberately. `cum` is the solver's input, accumulated in
     game order inside `solveDay` above. `dayTotals` is what the day chart
     shows a human, for the OPEN day -- so it counts the fives actually on the
     floor, and it can only be totalled here, after the map, because
     `syncOverrides` may have dropped stale swaps mid-loop. */
  const eff = Object.fromEntries(ids.map(id => [id, 0]));
  state.day.games.forEach((g, i) => {
    const p = plans[i];
    if (!p || !p.ok) return;
    const m = effectiveMinutes(g, p);
    for (const id of Object.keys(m)) if (id in eff) eff[id] += m[id];
  });
  for (const id of ids) eff[id] = Math.round(eff[id] * 100) / 100;
  dayTotals = eff;
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
 * `lastPeriodFive` still lands on the first remaining stint of the real
 * last period. `openingFive` is dropped (stint k is not the tip-off);
 * floors and caps are reduced by minutes already played; everything else
 * -- `closing`, `lastPeriodFive`, `pairs`, `avoids`, `keepOnFloor`,
 * `maxConsecutive`, `balance` -- is kept as the coach set it. A suffix of
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
export function resolveRest(g, p, from, sitIds = []) {
  if (!p || !p.ok) return { ok: false, reason: 'noplan' };
  /* The same two `seasonTargetsFor` refuses, for the same reasons: platoon's
     units are exact fives with nothing to optimise, and `minutes` is the
     hand-set-targets surface and its numbers are whole-game. */
  if (g.strategy === 'minutes' || g.strategy === 'platoon') return { ok: false, reason: 'strategy' };

  const k = Math.max(0, Math.min(Math.trunc(from) || 0, p.stints.length));
  const suffix = p.stints.slice(k);
  if (!suffix.length) return { ok: false, reason: 'nothing' };

  const sit = new Set(sitIds || []);
  const all = availIds(g);
  const avail = all.filter(id => !sit.has(id));
  if (avail.length < ON_FLOOR) return { ok: false, reason: 'nobody' };

  /* `effectiveStints`, not `p.stints`: a coach who already swapped somebody on
     by hand changed who played, and a re-solve that settles up against the
     plan's opinion instead of the game would owe the wrong kid. */
  const played = minutesFrom(effectiveStints(g, p).slice(0, k), all);

  const total = suffix.reduce((a, s) => a + s.minutes, 0);
  const longest = suffix.reduce((a, s) => Math.max(a, s.minutes), 0);
  const leagueMin = leagueMinutes();
  const maxSubs = state.settings?.maxSubs ?? DEFAULT_SETTINGS.maxSubs;

  const c = clone(g.constraints);
  c.openingFive = [];
  c.units = [];
  if (g.strategy !== 'closers') c.closing = null;
  c.minMinutes = {};
  c.maxMinutes = {};
  for (const id of avail) {
    const cap = g.constraints.maxMinutes?.[id];
    // league floor first, the coach's cap still winning over it -- the same
    // order `computeAll` uses, and for the same reason
    let lo = Math.max(g.constraints.minMinutes?.[id] || 0, leagueMin);
    if (cap != null) lo = Math.min(cap, lo);
    const left = Math.min(total, Math.max(0, lo - (played[id] || 0)));
    if (left > 0) c.minMinutes[id] = left;
    if (cap != null) c.maxMinutes[id] = Math.max(0, cap - (played[id] || 0));
  }

  /* Fairness, in the one currency the engine already takes. `deficit` is each
     player's even share of what has been played so far minus what they really
     played, so a target lands on (everyone's total + the rest) / n minus what
     they have -- which is "whole-game even among whoever is still playing". */
  const avg = avail.reduce((a, id) => a + (played[id] || 0), 0) / avail.length;
  const deficit = Object.fromEntries(avail.map(id => [id, avg - (played[id] || 0)]));
  const targets = carryoverTargets({
    ids: avail, deficit,
    budget: total * ON_FLOOR,
    cap: 2 * longest,
    min: c.minMinutes, max: c.maxMinutes,
    ceiling: total,
  });
  /* null means the targets could not be made to add up -- everyone pinned at a
     cap, most likely. Standing down leaves the solver to water-fill to the
     plain even share, which is still a re-solve and still better than dumping
     every remaining stint on one kid. Slice 2 says so on screen. */
  if (targets) c.targetMinutes = targets;

  const r = generatePlan({
    players: state.players,
    availableIds: avail,
    stints: suffix,
    format: { periods: g.periods, periodMinutes: g.periodMinutes },
    granularity: { mode: g.granMode, value: g.granValue },
    constraints: c, strategy: g.strategy, balance: g.balance,
    seed: g.seed,
    maxSubs,
  });
  if (!r.ok) return { ok: false, reason: 'infeasible', issues: r.issues };

  const overrides = {};
  r.stints.forEach((s, i) => { overrides[k + i] = s.onFloor.slice(); });
  return { ok: true, from: k, overrides, issues: r.issues, minutes: r.minutes };
}

/* ================================================================== *
 * the day ends -- its games become the season
 *
 * "New day" used to be the moment a coach's Saturday was thrown away:
 * `state.day` was replaced wholesale and the minutes every kid had just
 * played went with it. It is now the moment those games are kept.
 *
 * There is no "Finish game" button, and that is the decision, not an
 * omission. The bug is that a coach loses a day without ever being
 * asked; an answer that only works when they remember to press
 * something reproduces it for the coach who is busiest. So a game is
 * finished when it is in the day at the moment "New day" fires *and
 * its plan solved* -- `p.ok` is the one honest signal available with
 * no UI, because a game that never produced a rotation was never
 * played. Deleting a game before then is the coach saying it did not
 * happen, and deleting already takes it out of the day, so it never
 * reaches here.
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
  const finished = day.games
    .map((g, i) => [g, dp[i]])
    .filter(([, p]) => p && p.ok)
    .map(([g, p]) => seasonGame(g, effectiveMinutes(g, p),
      { dayName: day.name, date: day.date }));
  return addSeasonGames(t.season, finished);
}

/**
 * #100: whether a day is due to file -- dated strictly before today, the
 * phone's own day. A day dated today has not finished; a day dated tomorrow
 * (reachable only through a hand-edited backup) has not started either.
 * `YYYY-MM-DD` strings compare the same way their dates do, so no `Date` is
 * built from either side. "Today" is injectable so a pinned clock can stand
 * in for the phone's own day in a test.
 */
export const dayIsPast = (day, today = new Date()) => day.date < seasonDate(today);

/**
 * #100 review, finding 3: whether the current day is due to file -- past-
 * dated (`dayIsPast`) and bench mode not open. `fileIfPast` below and
 * `app.js`'s boot/foreground/bench-mode-close trigger each used to run their
 * own copy of the bench-mode check; this is their one shared home. Reads
 * `#gamemode` directly, the way `fileIfPast` always has -- importing
 * gamemode.js here would cycle back through toast.js. "Today" is injectable
 * so a pinned clock can stand in for the phone's own day in a test.
 */
export const dueToFile = (today = new Date()) => {
  const gm = document.querySelector('#gamemode');
  if (gm && gm.hidden === false) return false;
  return team().days.some(d => dayIsPast(d, today));
};

// "Sat, Sep 27" -- the coach's own locale, short weekday, short month, day.
const weekdayLabel = iso => {
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
  const iso = seasonDate(today);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const base = day.date === iso ? 'Today'
    : day.date === seasonDate(tomorrow) ? 'Tomorrow'
    : weekdayLabel(day.date);
  return day.name ? `${base} · ${day.name}` : base;
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
  for (const i of idxs) kept += archiveDay(i);

  const removed = new Set(idxs);
  t.days = t.days.filter((_, i) => !removed.has(i));

  // "No empty days" (Decisions): when filing leaves none, one day dated
  // today with one new game replaces them -- the fresh-day shape #100 built.
  let fellBack = false;
  if (!t.days.length) {
    fellBack = true;
    const g = newGame(0, lastFiled.games[lastFiled.games.length - 1], state.settings);
    g.out = [];
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
      ? `${weekdayLabel(filedDate)}: ${kept} game${kept === 1 ? '' : 's'} saved to the season.`
      : `${weekdayLabel(filedDate)} is over.`)
    : (kept
      ? `${n} past days: ${kept} game${kept === 1 ? '' : 's'} saved to the season.`
      : `${n} past days are over.`);
  return fellBack && kept === 0 ? `${msg} Started a new day.` : msg;
}
