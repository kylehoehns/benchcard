// Persistence for a local-only app. There is no server to recover from, so a
// corrupt or half-written record must not cost the coach their roster.

export const KEY = 'benchcard.v6';
export const BACKUP_KEY = 'benchcard.v6.bak';
/* Older schemas are read, never written. A new key rather than a new shape
   under the old one, because the service worker can leave a coach running
   yesterday's code against today's data: v3's sanitize looks for `players` at
   the top level, so a v4 record in the v3 key would load as an empty roster
   and read as "my team is gone". With separate keys, stale code sees its own
   last-known-good record and self-heals when the worker updates.

   v4 is the same record without `teams[].season`, so nothing about reading it
   is special: `sanitize` is shape-driven, not version-driven, and a record
   with no season simply gets an empty one. Its own backup key is read too --
   a coach whose v5 record is corrupt on the first boot after the upgrade has
   two v4 copies sitting there, and refusing to look at the second one would
   be throwing away a roster we can see.

   v6 is the same again: a v5 record is a v6 one without `teams[].settings`,
   and an absent settings block means today's defaults, so it loads with the
   app behaving exactly as it did yesterday. Its backup key is read for the
   same reason v4's is. */
export const V5_KEY = 'benchcard.v5';
export const V5_BACKUP_KEY = 'benchcard.v5.bak';
export const V4_KEY = 'benchcard.v4';
export const V4_BACKUP_KEY = 'benchcard.v4.bak';
export const V3_KEY = 'benchcard.v3';
const LEGACY_KEYS = ['rotation-card.v2', 'rotation-card.v1'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, fallback, lo, hi) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
};
const strArr = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
const idMap = v => {
  if (!isObj(v)) return {};
  const out = {};
  for (const [k, n] of Object.entries(v)) if (Number.isFinite(Number(n))) out[k] = Number(n);
  return out;
};

/* ================================================================== *
 * the season -- v5's one addition
 *
 * `teams[].day` holds one day, and "New day" used to throw the previous
 * one away. A team now also carries `season: { games: [...] }`: every
 * game that finished, with the minutes each kid actually played. It is
 * what makes the app worth opening between Saturdays, and it is the
 * input the carryover work needs.
 *
 * Both halves of the shape live here -- the reader and the one writer --
 * so there is exactly one place that knows what a finished game looks
 * like. `seasonGame` is a constructor, not persistence, but splitting it
 * into a module of its own would be a second copy of this shape to
 * drift, which is the same argument backup.js makes for having no
 * second serialiser.
 *
 * The season is HISTORY, and that is why it is swept differently from
 * everything else in a team. A constraint naming a departed player is
 * dropped on load, because it is an instruction about a future game and
 * a stale one puts the wrong kid on the floor. A finished game's minutes
 * are a fact about a game that already happened: a kid who left the team
 * in November still played those minutes in October, so this map is
 * deliberately NOT filtered against the current roster. Rewriting
 * history to match today's list is the one loss this whole record exists
 * to prevent.
 *
 * No tier, no level, no name -- ids and minutes. Levels are banned from
 * the card, the bench and the shared image (test/leak.test.js) and they
 * are banned from here for the same reason.
 * ================================================================== */

// a long season with tournaments is ~60 games; 200 is far past any real one
// and still bounded, and the newest are the ones carryover cares about
const SEASON_MAX = 200;

const sanitizeSeason = raw => {
  const s = isObj(raw) ? raw : {};
  const seen = new Set();
  const games = (Array.isArray(s.games) ? s.games : [])
    .filter(isObj)
    .map(g => {
      const minutes = {};
      for (const [id, n] of Object.entries(isObj(g.minutes) ? g.minutes : {})) {
        /* Stricter than `idMap` elsewhere in this file, and deliberately:
           `Number(null)` and `Number('')` are both 0, so the loose test would
           turn a corrupt entry into a player who was at the game and played
           none of it. In a ledger a coach reads, that is a different claim
           from "this entry is junk". */
        const v = typeof n === 'number' || (typeof n === 'string' && n.trim() !== '') ? Number(n) : NaN;
        // to the cent of a minute, the same rounding effectiveMinutes uses --
        // stint lengths divide unevenly and floats accumulate visible noise
        if (id && Number.isFinite(v)) minutes[id] = Math.round(num(v, 0, 0, 999) * 100) / 100;
      }
      return {
        id: typeof g.id === 'string' && g.id ? g.id : 's' + Math.random().toString(36).slice(2, 8),
        // the coach's local day, not UTC: a Saturday game archived at 8pm
        // Pacific is not Sunday's game. Anything else reads as "unknown".
        date: typeof g.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.date) ? g.date : '',
        day: typeof g.day === 'string' ? g.day : '',
        opponent: typeof g.opponent === 'string' ? g.opponent : '',
        periods: num(g.periods, 4, 1, 8),
        periodMinutes: num(g.periodMinutes, 8, 1, 40),
        minutes,
      };
    })
    // two entries for one game id would double a kid's season total, which is
    // the number the whole feature is for. First wins, as with players.
    .filter(g => !seen.has(g.id) && seen.add(g.id))
    .slice(-SEASON_MAX);
  return { games };
};

/* ================================================================== *
 * team settings -- v6's one addition
 *
 * How this team wants its plans made, as opposed to what happens in one
 * game. It belongs to the team because a league rule set for one squad
 * must never land on the other.
 *
 * **Absent means today's defaults**, which is what every record written
 * before this shipped says, so a v5 record and a v5 backup file both
 * load with the app behaving exactly as it did. No version branch here
 * or anywhere else in this file -- the shape is the migration, which is
 * what makes it idempotent and an old backup import for free.
 *
 * The block holds exactly the keys something reads: today `maxSubs`,
 * `tieBreak`, `minMinutes` and `seasonDefault`. The record is a file a coach
 * can open, and a key nothing
 * honours is a claim the app does not keep. Each later slice adds its
 * own, and every record written before it keeps loading.
 * ================================================================== */
export const DEFAULT_SETTINGS = Object.freeze({
  /* How many players may change at one break: engine.js's own default,
     lifted to where a coach can see it. A *preference*, not a hard cap --
     the search charges 40 per extra change rather than refusing one, so a
     plan can still go over, and `generatePlan` says so when it does
     (SUBS_EXCEEDED). 1-5: no change is not a rotation, 5 is the whole floor. */
  maxSubs: 3,
  /* Who lands on the high side when the clock will not divide evenly and
     somebody has to play a stint less. 'behind' is what the app has always
     done -- the tie goes to whoever is furthest behind their share of the
     season -- and 'levels' hands it to the coach's rotation levels instead.
     It is a tie-break and nothing else: caps, floors, locks and hand-set
     targets all outrank it, exactly as they did before. */
  tieBreak: 'behind',
  /* The league's floor, in minutes, applied to everyone who is available.
     0 is off, and 0 is what every record written before this key existed
     means. It composes into the per-player `minMinutes` map the engine has
     always read, so the solver is untouched; a coach's own per-player
     minimum wins when it is higher, and their cap wins when it is lower. */
  minMinutes: 0,
  /* Whether a NEW game opens with "Even out the season so far" already on.
     false is what the app has always done, and false is what every record
     written before this key existed means. It is read once, by `newGame`, at
     the moment a game is created; it never reaches the solver and it never
     changes a game that already exists. The per-game switch stays the
     override, which is why this is a default and not a mode. */
  seasonDefault: false,
  /* The shape of one of this team's games. 4 and 8 are the literals `newGame`
     has always hardcoded, so every record written before these keys existed
     means exactly what it did. Read by `newGame` ONLY when there is no game to
     clone from -- the clone still wins inside a day and across "New day", so
     no behaviour a coach relies on moves. It never reaches the solver, and it
     is not in the plan signature: the game's own `periods`/`periodMinutes`
     already are. The per-game override is the Rules fold, unchanged.
     Substitution granularity is deliberately NOT here -- it is a preference
     rather than a league rule, and it stays one tap where it is. */
  periods: 4,
  periodMinutes: 8,
});

const TIE_BREAKS = Object.freeze(['behind', 'levels']);

/* Stricter than `num` alone, and every number in the settings block goes
   through it: `Number(null)`, `Number('')` and `Number([])` are all 0, which
   `num` would then clamp into range -- a junk entry becoming a real
   instruction the coach never gave. NaN sends `num` to the default instead. */
const strictNum = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')
  ? Number(v) : NaN);

export const sanitizeSettings = raw => {
  const s = isObj(raw) ? raw : {};
  return {
    maxSubs: Math.round(num(strictNum(s.maxSubs), DEFAULT_SETTINGS.maxSubs, 1, 5)),
    // an unknown string is a record from a future or a broken app: fall back to
    // the default rather than to a stance nothing implements
    tieBreak: TIE_BREAKS.includes(s.tieBreak) ? s.tieBreak : DEFAULT_SETTINGS.tieBreak,
    /* The league floor. Junk is off rather than a number the coach never gave,
       which is why `Number('')` is not allowed through here either. Capped at
       60: longer than any youth game, so a typo cannot turn every plan into
       MINS_UNSATISFIABLE forever. */
    minMinutes: Math.round(num(strictNum(s.minMinutes), DEFAULT_SETTINGS.minMinutes, 0, 60)),
    /* Strict `=== true`, not `!!`: every other truthy value in a hand-edited
       or future record is a claim we cannot read, and the safe reading of an
       unreadable claim is the behaviour the app has always had. */
    seasonDefault: s.seasonDefault === true,
    /* The team's game format. Strict for the reason the league minimum is:
       `Number(null)` and `Number('')` are both 0, and 0 periods is not a game
       -- clamping it to 1 would turn a junk entry into an instruction the
       coach never gave, so junk falls back to the default instead. The bounds
       are the Rules fold's own `min`/`max`, so a number that passes here can
       never be refused there. */
    periods: Math.round(num(strictNum(s.periods), DEFAULT_SETTINGS.periods, 1, 8)),
    periodMinutes: Math.round(num(
      strictNum(s.periodMinutes), DEFAULT_SETTINGS.periodMinutes, 1, 40)),
  };
};

/**
 * How far each player is off their share of the season so far (B3).
 *
 * "Their share" is attendance-weighted, one game at a time: a filed game's
 * share is that game's own mean minutes across the players who were in it, and
 * a player's expected total is the sum of the shares of the games they were
 * actually in. The alternative -- an equal split of the whole season across
 * everyone on the roster -- hands a kid who missed three games a claim on a
 * game and a half of floor time that the kids who turned up every week would
 * pay for. This measures the unfairness the app itself creates: the remainder
 * minutes that stint arithmetic has to drop on somebody, game after game.
 *
 * A `minutes` map is keyed by everyone who was AVAILABLE for that game (the
 * solver returns a total for each, a 0 included), so "has a key" is the
 * attendance record and no schema change was needed. An id that has since left
 * the roster still counts toward its game's mean -- that is what the game
 * actually handed out, and dropping it would inflate everyone else's share and
 * invent deficits out of a departure.
 *
 * Pure, and it never looks at a player: ids and minutes only, no roster, no
 * levels. Returns minutes, positive meaning owed.
 */
export function seasonShare(games) {
  const played = {}, expected = {}, appearances = {};
  for (const g of Array.isArray(games) ? games : []) {
    const m = isObj(g) && isObj(g.minutes) ? g.minutes : {};
    const ids = Object.keys(m);
    if (!ids.length) continue;
    let sum = 0;
    for (const id of ids) sum += Number(m[id]) || 0;
    const share = sum / ids.length;
    for (const id of ids) {
      played[id] = (played[id] || 0) + (Number(m[id]) || 0);
      expected[id] = (expected[id] || 0) + share;
      appearances[id] = (appearances[id] || 0) + 1;
    }
  }
  const r = v => Math.round(v * 100) / 100;
  const deficit = {};
  for (const id of Object.keys(expected)) {
    deficit[id] = r(expected[id] - played[id]);
    expected[id] = r(expected[id]);
    played[id] = r(played[id]);
  }
  return { played, expected, deficit, appearances };
}

/** Local `YYYY-MM-DD`, the coach's own day. Same rule as backupFilename. */
export const seasonDate = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * One finished game, from the game and the minutes actually played. The caller
 * supplies the minutes because only `state.js` can answer "who was really on
 * the floor" -- `effectiveMinutes`, never `plan.minutes`, so a coach's hand
 * swaps in bench mode are what gets counted.
 */
export const seasonGame = (g, minutes, { dayName = '', when = new Date() } = {}) => ({
  id: g.id,
  date: seasonDate(when),
  day: String(dayName || '').trim(),
  opponent: String(g.label || '').trim(),
  periods: g.periods,
  periodMinutes: g.periodMinutes,
  minutes: { ...minutes },
});

/**
 * Append finished games to a season, skipping any id it already holds, and
 * return how many were actually added. Idempotent on purpose: archiving twice
 * -- a double tap, an undo and a redo -- must not double anyone's minutes.
 */
export function addSeasonGames(season, games) {
  const have = new Set(season.games.map(g => g.id));
  const add = games.filter(g => !have.has(g.id) && have.add(g.id));
  season.games.push(...add);
  if (season.games.length > SEASON_MAX) season.games.splice(0, season.games.length - SEASON_MAX);
  return add.length;
}

/**
 * Coerce one team into a valid shape. A team owns its roster, its day of games
 * and which of those games is open -- everything the solver reads. The rest of
 * the record (onboarded, tourSeen, ui) belongs to the device, not the team.
 */
export function sanitizeTeam(raw, { emptyConstraints, newGame }) {
  if (!isObj(raw)) raw = {};

  const players = (Array.isArray(raw.players) ? raw.players : [])
    .filter(p => isObj(p) && typeof p.id === 'string' && p.id)
    .map((p, i) => ({
      id: p.id,
      name: typeof p.name === 'string' ? p.name : '',
      number: typeof p.number === 'string' ? p.number.replace(/[^0-9]/g, '').slice(0, 2) : '',
      shortName: typeof p.shortName === 'string' ? p.shortName.toUpperCase().slice(0, 5) : '',
      /* Where this player sits in the rotation, 1-5, middle by default. It
         exists so the solver can keep lineups from being lopsided while
         minutes stay even -- not as a rating, and deliberately never printed,
         never shown in bench mode and never in the shared image. An absent or
         junk value means 3, which makes the whole feature inert. */
      tier: num(p.tier, 3, 1, 5),
      /* The colour slot, fixed to the player rather than to their position in
         the list. It used to be the array index, which meant dragging one
         player up the roster recoloured everyone below them -- a coach who has
         learned "Leighton is the purple one" loses that for rearranging their
         list. Absent means "take my current index", so existing records keep
         exactly the colours they have today. */
      hue: p.hue == null ? i : num(p.hue, i, 0, 999),
    }));

  // duplicate ids would silently merge two kids into one
  const seen = new Set();
  const uniquePlayers = players.filter(p => !seen.has(p.id) && seen.add(p.id));
  const validId = new Set(uniquePlayers.map(p => p.id));
  const keep = ids => strArr(ids).filter(id => validId.has(id));
  const keepPairs = v => (Array.isArray(v) ? v : [])
    .filter(pr => Array.isArray(pr) && pr.length === 2 && pr.every(id => validId.has(id)));
  /* Same sweep for the id-keyed maps. `idMap` alone only checks that the value
     is a number, so a cap or a slot target naming a player who is not on this
     roster used to survive -- harmless-looking in v3, where the only way to get
     one was a hand-edited record, and squarely wrong now that the record holds
     more than one roster: team two's minute caps must not be able to name team
     one's players. `targetSlots` in particular feeds the budget's capacity
     arithmetic, so a stale entry there is a wrong total, not a no-op. */
  const keepMap = v => {
    const out = {};
    for (const [id, n] of Object.entries(idMap(v))) if (validId.has(id)) out[id] = n;
    return out;
  };

  const day = isObj(raw.day) ? raw.day : {};
  let games = (Array.isArray(day.games) ? day.games : [])
    .filter(isObj)
    .map(g => {
      const c = isObj(g.constraints) ? g.constraints : {};
      const closing = isObj(c.closing) ? c.closing : {};
      const out = keep(g.out);
      const sittingOut = new Set(out);
      return {
        id: typeof g.id === 'string' && g.id ? g.id : 'g' + Math.random().toString(36).slice(2, 8),
        label: typeof g.label === 'string' ? g.label : '',
        when: typeof g.when === 'string' ? g.when : '',
        periods: num(g.periods, 4, 1, 8),
        periodMinutes: num(g.periodMinutes, 8, 1, 40),
        granMode: ['everyN', 'perPeriod', 'breaksOnly'].includes(g.granMode) ? g.granMode : 'everyN',
        granValue: num(g.granValue, 4, 1, 40),
        out,
        useCarryover: !!g.useCarryover,
        // v5 gained a season; B3 gained the switch that reads it back. Absent
        // is off, which is what every record written before this shipped says,
        // and what a coach who has never opened the season should see.
        useSeasonTargets: !!g.useSeasonTargets,
        strategy: ['balanced', 'minutes', 'closers', 'platoon'].includes(g.strategy) ? g.strategy : 'balanced',
        // how lineup strength is shaped across the game; see BALANCE in engine.js
        balance: ['even', 'start', 'finish', 'both'].includes(g.balance) ? g.balance : 'even',
        live: (() => {
          const l = isObj(g.live) ? g.live : {};
          const ov = {};
          for (const [k, v] of Object.entries(isObj(l.overrides) ? l.overrides : {})) {
            const kept = keep(v).filter(id => !sittingOut.has(id));
            // a stale override that no longer names five real players who are
            // at the game is worse than none at all -- it puts an absent
            // player on the floor in bench mode and on the printed card
            if (Number.isFinite(Number(k)) && kept.length === 5) ov[Number(k)] = kept;
          }
          return { at: num(l.at, 0, 0, 200), overrides: ov };
        })(),
        seed: num(g.seed, 1, 0, 2 ** 32) >>> 0,
        constraints: {
          ...emptyConstraints(),
          minMinutes: keepMap(c.minMinutes), maxMinutes: keepMap(c.maxMinutes),
          targetSlots: keepMap(c.targetSlots),
          targetCapacity: c.targetCapacity == null || !Number.isFinite(Number(c.targetCapacity)) ? null : Number(c.targetCapacity),
          lockedTargets: keep(c.lockedTargets),
          pairs: keepPairs(c.pairs), avoids: keepPairs(c.avoids), keepOnFloor: keepPairs(c.keepOnFloor),
          openingFive: keep(c.openingFive).slice(0, 5),
          lastPeriodFive: keep(c.lastPeriodFive).slice(0, 5),
          hardPairs: !!c.hardPairs,
          maxConsecutive: num(c.maxConsecutive, 0, 0, 20),
          closing: { stints: num(closing.stints, 2, 1, 40), players: keep(closing.players).slice(0, 5) },
          units: (Array.isArray(c.units) ? c.units : []).map(keep),
        },
      };
    });
  /* Hoisted, because the no-games fallback below has to see it. A team whose
     record carries no game at all gets one built from the team's own format --
     the same answer `newTeam` gives, and the only sane one when there is
     nothing to clone from. */
  const settings = sanitizeSettings(raw.settings);
  if (!games.length) games = [newGame(0, null, settings)];

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : 't' + Math.random().toString(36).slice(2, 8),
    // `name` here, `teamName` in v3 -- read both so a migrated record keeps it
    name: typeof raw.name === 'string' ? raw.name
      : typeof raw.teamName === 'string' ? raw.teamName : '',
    players: uniquePlayers,
    day: { name: typeof day.name === 'string' ? day.name : '', games },
    // v4 has no season. An absent one is not a broken one -- it is a coach who
    // has not finished a game yet, which is also every brand new team.
    season: sanitizeSeason(raw.season),
    // v5 has no settings, and an absent block is not a broken one either -- it
    // is a coach who has never opened the page, so it means the defaults.
    settings,
    activeGame: num(raw.activeGame, 0, 0, games.length - 1),
  };
}

/* The four views the app can be on, and the ONE place a superseded view key is
   translated into a current one.

   The allow-list is not a trust: a record written by a newer build, a hand-
   edited backup or a half-finished rename all arrive as a string `applyView`
   would happily hide every view for, so anything unrecognised lands on Games,
   which is the view the app is for.

   `VIEW_WAS` is the legacy half of the same question. The Roster tab became
   Team in A40, and the key followed in slice 2 -- but a coach's BACKUP FILE is
   a `.json` written before that day, `restoreBackup` feeds it to this same
   `sanitize`, and a broken key would drop them on Games the one day they
   actually need the file. Translating costs a line, so there is no case for
   breaking it. Note there is still NO version branch here: an old key is a
   shape question like every other in this file, which is what keeps it
   idempotent.

   Nothing else in the app may translate a view key. `applyView` compares
   against `'team'` and nothing else, and `test/storage.test.js` scans every
   served module for a second implementation -- that is the defect this repo
   keeps finding, not the rename itself. A Map rather than an object literal
   because `{}['constructor']` is truthy and a prototype hit here would be a
   very quiet bug. */
const VIEWS = ['games', 'team', 'season', 'settings'];
const VIEW_WAS = new Map([['roster', 'team']]);
const viewOf = raw => {
  const v = VIEW_WAS.get(raw) || raw;
  return VIEWS.includes(v) ? v : 'games';
};

/**
 * Coerce a whole record into a valid shape, keeping everything still usable.
 * Returns null only when there is nothing salvageable.
 *
 * Accepts every shape we have ever written. A v3 record has its roster at the
 * top level and no `teams` array; it becomes a one-team record, losing
 * nothing, and a coach who never adds a second team cannot tell the
 * difference. A v4 record is a v5 one without `teams[].season`, so it loads
 * with an empty season; a v5 record is a v6 one without `teams[].settings`, so
 * it loads with the defaults. There is no version branch anywhere in here, and
 * deliberately so: the shape is the migration, which is what makes it
 * idempotent and what makes an old backup file import for free.
 */
export function sanitize(raw, helpers) {
  if (!isObj(raw)) return null;

  const rawTeams = Array.isArray(raw.teams) && raw.teams.length ? raw.teams : [raw];
  // A cap, because every team is loaded and re-planned on boot. Twelve is far
  // past any real coach and still bounded.
  const teams = rawTeams.slice(0, 12).map(t => sanitizeTeam(t, helpers));
  const anyPlayers = teams.some(t => t.players.length);

  return {
    version: 6,
    onboarded: !!raw.onboarded || anyPlayers,
    // the first-run tour is once per device, so this has to survive a reload;
    // an unrecognised value means "not seen yet", which is the safe way round
    tourSeen: !!raw.tourSeen,
    teams,
    activeTeam: num(raw.activeTeam, 0, 0, teams.length - 1),
    // the allow-list and the one legacy translation, both above
    view: viewOf(raw.view),
    ui: {
      copies: num(raw.ui?.copies, 2, 1, 4),
      showMinutes: !!raw.ui?.showMinutes,
      printScope: raw.ui?.printScope === 'day' ? 'day' : 'game',
      cardId: raw.ui?.cardId === 'number' ? 'number' : 'short',
      cardSize: raw.ui?.cardSize === 'half' ? 'half' : 'pocket',
      // Card preview folded away by default -- it only applies below the
      // two-column breakpoint, where it was costing 41% of the page.
      cardOpen: !!raw.ui?.cardOpen,
      /* The tip jar, asked once and never again. `tipDone` is set by taking
         the link *or* by declining -- either way the coach has answered, and
         asking a second time is how a free tool starts feeling like shareware.
         `prints` only counts far enough to reach the threshold. */
      tipDone: !!raw.ui?.tipDone,
      /* Add to Home Screen, offered once and never again -- same contract as
         `tipDone`, and deliberately the same `prints` counter, because both
         are "the app has done something for this coach" moments. */
      installDone: !!raw.ui?.installDone,
      prints: num(raw.ui?.prints, 0, 0, 99),
      theme: ['auto', 'light', 'dark'].includes(raw.ui?.theme) ? raw.ui.theme : 'auto',
    },
  };
}

const parse = text => { try { return JSON.parse(text); } catch { return null; } };
const read = key => { try { return parse(localStorage.getItem(key)); } catch { return null; } };
/* "Is there a team worth keeping in here" -- asked of the whole record, not
   one team, so a coach whose second team is empty still counts as onboarded. */
const hasRoster = s => s.teams.some(t => t.players.length);
const present = key => { try { return localStorage.getItem(key) !== null; } catch { return false; } };
/* "Did WE write this, whole?" -- and it is a different question from "did it
   sanitize", which is the question that cost a coach their deletion.
   `sanitize` is deliberately total: it coerces any object into a valid-looking
   record, so `{}` comes back as one empty team and "it sanitized" is equally
   true of junk. Emptiness cannot separate the two either, because emptiness is
   what they share -- removing the last team writes one team, no players and
   `onboarded: false`, which is exactly the shape a broken record has.

   What separates them is that a record this app wrote carries its own vital
   signs whether or not anyone is on the roster: the version we stamp, a teams
   array with at least one team in it (we never write none), and `onboarded` as
   an actual boolean, since `JSON.stringify` writes `false` rather than dropping
   the key. Bytes that broke, a half-written record, a `{}` left by something
   else -- none of those carry all three. So a complete record is allowed to say
   "this coach has no team", and that claim is honoured instead of overruled by
   a backup. Only the v6 keys are asked: the older schemas are read and never
   written, so "a record we wrote and then emptied" is not a state they can be
   in. */
const complete = raw => isObj(raw)
  && raw.version === 6
  && Array.isArray(raw.teams) && raw.teams.length > 0
  && typeof raw.onboarded === 'boolean';

/** Load, falling back to the last known-good snapshot before giving up. */
export function loadState(helpers) {
  let primaryUsable = null;
  for (const key of [KEY, BACKUP_KEY]) {
    const raw = read(key);
    const s = sanitize(raw, helpers);
    if (key === KEY) primaryUsable = !!s;
    /* a coach who has deleted every player still has their games and settings;
       only a genuinely absent record should drop back to first-run -- and a
       coach who deleted their last TEAM has a complete record that says so,
       which is not the same thing as a record with nothing in it */
    if (s && (hasRoster(s) || s.onboarded || complete(raw))) {
      if (key === KEY) return { state: s, recovered: false };
      /* Why the primary failed decides what the coach is told, and the three
         cases are not the same event. Bytes that would not turn into a record
         are genuinely unreadable. No bytes at all -- an evicted key, a wiped
         origin -- is not: there was simply nothing to read, and telling that
         coach their save was "unreadable" is a claim about data that never
         existed. The third case is the one this used to lie about: the key is
         present, it parses, and it was rejected for not being a whole record.
         Calling that "missing" is a false statement about data sitting right
         there, so it says `incomplete` and means it. `recovered` stays a plain
         boolean; this is additive so nothing reading the old flag has to
         change. */
      const from = !present(KEY) ? 'missing' : !primaryUsable ? 'unreadable' : 'incomplete';
      return { state: s, recovered: true, recoveredFrom: from };
    }
  }
  /* Older schemas, newest first. `sanitize` already understands every one of
     these shapes, so migrating is just reading -- and they are read, never
     written, so a coach who downgrades (or whose service worker has not
     updated yet) still finds the record their old code expects, intact.

     Each schema's backup key is in the list because the first boot after an
     upgrade is exactly when a half-written new record is most likely, and at
     that moment there are two readable copies of the old one on the device.
     Not looking at the second would be dropping a roster we can see. */
  for (const [key, from] of [[V5_KEY, 5], [V5_BACKUP_KEY, 5], [V4_KEY, 4], [V4_BACKUP_KEY, 4], [V3_KEY, 3]]) {
    const old = sanitize(read(key), helpers);
    if (old && (hasRoster(old) || old.onboarded)) return { state: old, migrated: true, migratedFrom: from };
  }

  const legacy = helpers.migrateLegacy?.(LEGACY_KEYS.map(read));
  const s = sanitize(legacy, helpers);
  if (s && hasRoster(s)) return { state: s, migrated: true };
  return null;
}

/**
 * Write, promoting the previous good record to a backup first. Returns a
 * reason string on failure rather than swallowing it -- a full quota that
 * silently stops saving is the worst possible outcome here.
 */
export function saveState(state) {
  let payload;
  try { payload = JSON.stringify(state); }
  catch { return 'could not serialise'; }
  try {
    const prev = localStorage.getItem(KEY);
    /* Only a record we wrote WHOLE earns the backup slot, and `complete` is
       the same vital-signs test the loader uses to decide what it will accept.
       On the boot AFTER a recovery, `KEY` still holds the bytes `loadState`
       threw out -- so promoting whatever is there put `{not json` in the
       backup and left the coach with ONE good copy at the moment they most
       need two. Asking the bytes themselves rather than asking the loader
       keeps the two calls independent: junk under `KEY` is refused however it
       got there, including a write from another tab or a half-finished
       `setItem`. The cost when the test is wrong is a backup that is older
       than it could be, never a backup that is junk. */
    if (prev && prev !== payload && complete(parse(prev))) localStorage.setItem(BACKUP_KEY, prev);
    localStorage.setItem(KEY, payload);
    return null;
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) return 'storage is full';
    return 'storage is unavailable (private browsing?)';
  }
}
