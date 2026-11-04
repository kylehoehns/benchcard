// Rotation planning core. No dependencies. Deterministic for a given seed.
// Pure functions only -- no DOM, no storage. The UI layer owns all of that.

export const ON_FLOOR = 5;
const DEFAULT_MAX_SUBS = 3;
const DEFAULT_MIN_SUBS = 1;

/* ------------------------------------------------------------------ *
 * deterministic RNG (xorshift32)
 * ------------------------------------------------------------------ */
function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function next() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 0x100000000;
  };
}

/* ------------------------------------------------------------------ *
 * stint construction
 * ------------------------------------------------------------------ */

// Stints per period under perPeriod: a whole number, at least 1.
function perPeriodCount(g) {
  return Math.max(1, Math.floor(g.value));
}

// A tail shorter than half the requested interval gets folded into the
// previous stint -- a 1-minute stint is not a real substitution point.
function periodLengths(periodMinutes, g) {
  if (g.mode === 'breaksOnly') return [periodMinutes];

  if (g.mode === 'perPeriod') {
    const n = perPeriodCount(g);
    return Array.from({ length: n }, () => periodMinutes / n);
  }

  if (g.mode === 'everyN') {
    const n = g.value;
    if (!(n > 0)) throw new Error('granularity.value must be > 0');
    const out = [];
    let left = periodMinutes;
    while (left > 1e-9) {
      const len = Math.min(n, left);
      out.push(len);
      left -= len;
    }
    if (out.length > 1 && out[out.length - 1] < n / 2) {
      const tail = out.pop();
      out[out.length - 1] += tail;
    }
    return out;
  }

  throw new Error(`unknown granularity mode: ${g.mode}`);
}

/* What a period is called depends on how many there are, and "Q" was hardcoded
   in five separate renderers -- the card, the timeline, the stint table and two
   places in bench mode -- so a coach running two eighteen-minute halves was told
   "Q1 18:00" on every one of them. Two periods are halves, four are quarters,
   anything else is just a period. Same width in every case, so the card is
   unaffected. */
export function periodLabel(period, total) {
  return `${periodWords(total).letter}${period}`;
}

/* What a period is called, by how many there are: the one ladder `periodLabel`
   and `periodNoun` read. */
const PERIOD_WORDS = { 2: { letter: 'H', one: 'half', many: 'halves' }, 4: { letter: 'Q', one: 'quarter', many: 'quarters' } };
const periodWords = total => PERIOD_WORDS[total] || { letter: 'P', one: 'period', many: 'periods' };

// Whole stints that finish before the midpoint of the clock; 0 when the game
// is one stint and there is no such thing as being late. See LATE_WEIGHT.
export function stintsBeforeHalftime(stints) {
  const total = stints.reduce((a, s) => a + s.minutes, 0);
  let acc = 0, n = 0;
  for (const s of stints) {
    acc += s.minutes;
    if (acc > total / 2 + 1e-9) break;
    n++;
  }
  return n < stints.length ? n : 0;
}

/* #450/#451: which half or period a stint is in, or null for overtime. `mode`
   is 'halves' or 'periods'. A half is split at the regulation midpoint by the
   stint's end on the clock (the reading `stintsBeforeHalftime` makes), worked
   out from `period`, `endSec` and `format.periodMinutes`, so a re-plan's suffix
   splits the same way. The one answer for the engine and state.js. */
// the engine is pure, so it keeps its own reading of the setting: `storage.js` owns the list, this normalizes what a caller hands in
const playsInMode = m => (m === 'halves' || m === 'periods' ? m : null);
export function playsInGroup(stint, format, mode) {
  if (stint.period > format.periods) return null;
  if (mode === 'periods') return stint.period;
  const end = (stint.period - 1) * format.periodMinutes + (format.periodMinutes - stint.endSec / 60);
  return end <= format.periods * format.periodMinutes / 2 + 1e-9 ? 1 : 2;
}

/* The stints grouped by the half or period `playsInGroup` files them in, as
   [{ key, idx }] (overtime has none): the one grouping feasibility and the
   search both read. */
function stintGroups(stints, format, mode) {
  const byKey = new Map();
  stints.forEach((s, i) => {
    const key = playsInGroup(s, format, mode);
    if (key != null) byKey.set(key, [...(byKey.get(key) || []), i]);
  });
  return [...byKey].map(([key, idx]) => ({ key, idx }));
}

/* #451: what a half or period is called in a sentence: "each half" under
   halves, else by the game's period count (a quarter, a half, a period). */
export const periodNoun = (periods, count = 1) => (count === 1 ? periodWords(periods).one : periodWords(periods).many);
// "2 whole quarters", "1 whole half": the league minimum's own words for a count of whole periods
const wholePeriods = (periods, k) => `${k} whole ${periodNoun(periods, k)}`;
export const playsInNoun = (mode, periods) => (mode === 'halves' ? periodWords(2).one : periodNoun(periods));

/* #450: the regulation periods a list of stints covers whole -- the periods a
   kid can play start to finish. A re-plan's suffix leaves out the period in
   progress, and a period with a hand-chosen stint taken out of the list. */
function eligiblePeriods(stints, format) {
  const sums = new Map();
  for (const s of stints) if (s.period <= format.periods) sums.set(s.period, (sums.get(s.period) || 0) + s.minutes);
  return [...sums].filter(([, m]) => Math.abs(m - format.periodMinutes) < 1e-6).map(([p]) => p);
}

/* #367: overtime periods follow regulation, numbered `periods + 1`, `+ 2`, ...
   so the last-period rule (`period === format.periods`) never reaches one.
   Their names are made here, next to `periodLabel`, and nowhere else. */
const overtimeLabel = n => (n === 1 ? 'OT' : `OT${n}`);
// whether a stint belongs to an overtime period, by the name overtimeLabel gave it
/* "3 stints", "1 change": one plural, shared with state.js. */
export const plural = (k, w) => `${k} ${w}${k === 1 ? '' : 's'}`;
export const isOvertimeStint = s => /^OT\d*$/.test(s.periodName);
/* #541: the stints Sits at most N in a row is counted over -- those before the
   first overtime stint (overtime is always last), all of them when there is
   none. Overtime is extra time the limit was never set for, so it neither
   counts nor resets a run. Every bench-run count reads this one answer. */
export const benchSpan = stints => {
  const k = stints.findIndex(isOvertimeStint);
  return k < 0 ? stints.length : k;
};

export function buildStints(format, granularity) {
  const { periods, periodMinutes } = format;
  const overtime = Array.isArray(format.overtime) ? format.overtime : [];
  const stints = [];
  const all = [
    ...Array.from({ length: periods }, (_, i) => ({
      period: i + 1, minutes: periodMinutes, name: periodLabel(i + 1, periods),
    })),
    ...overtime.map((minutes, i) => ({
      period: periods + i + 1, minutes, name: overtimeLabel(i + 1),
    })),
  ];
  // #404: under perPeriod an overtime period is cut by the everyN rule at the
  // regulation stint length, so a short one is one stint, not n slivers
  const otGranularity = granularity.mode === 'perPeriod'
    ? { mode: 'everyN', value: periodMinutes / perPeriodCount(granularity) }
    : granularity;
  for (const { period: p, minutes: pm, name } of all) {
    const lengths = periodLengths(pm, p > periods ? otGranularity : granularity);
    let left = pm;
    for (const len of lengths) {
      stints.push({
        index: stints.length,
        period: p,
        // carried on the row so no renderer has to know the period count, and
        // none of them can disagree with another about what to call it
        periodName: name,
        startSec: Math.round(left * 60),
        endSec: Math.round((left - len) * 60),
        minutes: len,
      });
      left -= len;
    }
  }
  return stints;
}

// Stint lengths are legitimately fractional (a 10-minute period split three
// ways is 3.33 min), so minutes must be formatted, never printed raw -- a card
// reading "23.333333333333332" is worse than useless in a gym.
export function fmtMinutes(m) {
  const r = Math.round(m * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// "Reese, Jonah, Eli and Kira" -- a list a coach reads, not one a machine wrote.
function andList(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/* The one wording for a minutes spread, read by the engine's SPREAD_EVEN and
   SPREAD_FLOOR notes and by `minutesNote` (state.js), which restates them for
   the minutes the timeline shows after the solver's plan has moved. The low end
   is named up to SPREAD_NAME_CAP players; past that, a count. */
const SPREAD_NAME_CAP = 6;
const evenMinutesSentence = minutes => `Minutes divide evenly: every player gets ${fmtMinutes(minutes)}.`;
/* `lows` / `highs`: ids at the lowest / highest value `lo` / `hi`; `total` is
   everybody. `who` is "A and B play 12" (or "7 players play 12"); `covers` is
   whether the two ends account for everybody (a floor or cap can put a third
   number in the middle); `other` is "the other 4 play 16". No full stops. */
function lowEndPhrase(lows, lo, highs, hi, total, label) {
  const named = lows.length <= SPREAD_NAME_CAP;
  return {
    named,
    covers: lows.length + highs.length === total,
    who: named
      ? `${andList(lows.map(label))} ${lows.length === 1 ? 'plays' : 'play'} ${fmtMinutes(lo)}`
      : `${lows.length} players play ${fmtMinutes(lo)}`,
    other: `the other ${highs.length} play ${fmtMinutes(hi)}`,
  };
}

/* The sentence for minutes as they fall, read by `minutesNote` (state.js) and
   by Rotation order's SPREAD_ORDER note: the low end named, then the rest. */
export function minutesSpreadSentence(lows, lo, highs, hi, total, label) {
  if (Math.round((hi - lo) * 100) === 0) return evenMinutesSentence(hi);
  const end = lowEndPhrase(lows, lo, highs, hi, total, label);
  if (end.covers) return end.named ? `${end.who}, everyone else ${fmtMinutes(hi)}.` : `${end.who}, ${end.other}.`;
  return `${end.who}, the fewest. The most is ${fmtMinutes(hi)}.`;
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * short names for the printed card
 * ------------------------------------------------------------------ */
export function deriveShortNames(players) {
  // An explicit override always wins -- two kids named Jack need the coach to
  // settle it, not an algorithm. Auto-derived names then have to dodge the
  // overrides as well as each other.
  const out = {};
  const auto = [];
  for (const p of players) {
    const o = (p.shortName || '').trim();
    if (o) out[p.id] = o.toUpperCase().slice(0, 5);
    else auto.push(p);
  }
  Object.assign(out, autoShortNames(auto, new Set(Object.values(out))));
  return out;
}

function autoShortNames(players, taken) {
  const forms = (p) => {
    const w = String(p.name || '').trim().split(/\s+/);
    const first = (w[0] || '?').toUpperCase();
    const lastInitial = (w[1] || '').toUpperCase().slice(0, 1);
    return {
      plain: first.slice(0, 4) || '?',
      withLast: ((first.slice(0, 3) + lastInitial) || first.slice(0, 4)).slice(0, 5),
    };
  };

  const used = new Set(taken);
  const groups = new Map();
  for (const p of players) {
    const k = forms(p).plain;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }

  const out = {};
  for (const [base, members] of groups) {
    // a shared first name pushes the whole group to the last-initial form, so
    // one kid is not left as JACK while his teammate becomes JACR
    const disambiguate = members.length > 1 || used.has(base);
    for (const p of members) {
      const f = forms(p);
      let pick = disambiguate ? f.withLast : f.plain;
      let n = 2;
      while (used.has(pick)) pick = (f.withLast || f.plain).slice(0, 4) + n++;
      used.add(pick);
      out[p.id] = pick;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * constraint normalization
 * ------------------------------------------------------------------ */
function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

/* #446: a minimum beats a locked By hand number. The one place that is
   decided -- `analyzeFeasibility` and `generatePlan` both read it through
   `normalize`. Mutates `targets` and returns `[{ id, from, to }]`. The extra
   minutes come back out of the unlocked numbers in proportion to them, never
   below a player's own minimum, and only when every available player has a
   number (otherwise the players without one absorb it, as they always have). */
function raiseLockedTargets(targets, locked, minMinutes, avail) {
  const raised = [];
  for (const id of locked) {
    const min = minMinutes[id] || 0;
    if (targets[id] != null && targets[id] < min) {
      raised.push({ id, from: targets[id], to: min });
      targets[id] = min;
    }
  }
  if (!raised.length || !avail.every(id => targets[id] != null)) return raised;
  let owed = raised.reduce((a, r) => a + r.to - r.from, 0);
  let pool = avail.filter(id => !locked.includes(id));
  while (owed > 1e-9 && pool.length) {
    const sum = pool.reduce((a, id) => a + targets[id], 0);
    if (sum <= 1e-9) break;
    const room = id => Math.max(0, targets[id] - (minMinutes[id] || 0));
    const clamped = pool.filter(id => owed * targets[id] / sum > room(id) + 1e-9);
    if (!clamped.length) {
      for (const id of pool) targets[id] -= owed * targets[id] / sum;
      owed = 0;
    } else {
      for (const id of clamped) { owed -= room(id); targets[id] -= room(id); }
      pool = pool.filter(id => !clamped.includes(id));
    }
  }
  return raised;
}

/* #568: a Together pair is `[a, b]`, or `[a, b, true]` when set Always. */
export const isAlways = pr => pr[2] === true;

/* Always-together pairs tie players into groups that play every stint as one:
   `Map` of id to the (shared) Set of everyone tied to it. */
function tiedGroups(ids, pairs) {
  const group = new Map(ids.map(id => [id, new Set([id])]));
  for (const [a, b] of pairs) {
    const merged = new Set([...group.get(a), ...group.get(b)]);
    for (const id of merged) group.set(id, merged);
  }
  return group;
}

function normalize(constraints, availSet) {
  const c = constraints || {};
  // A pair rule means nothing unless both players are at the game. Three lists
  // share that split now, hence the helper.
  const splitPairs = (list, withAlways = false) => {
    const keep = [], dropped = [];
    for (const pr of list || []) (availSet.has(pr[0]) && availSet.has(pr[1]) ? keep : dropped).push(withAlways && isAlways(pr) ? [pr[0], pr[1], true] : [pr[0], pr[1]]);
    return [keep, dropped];
  };
  const [keepPairs, droppedPairs] = splitPairs(c.pairs, true);
  const [keepAvoids, droppedAvoids] = splitPairs(c.avoids);
  const [keepOnFloor, droppedKeepOn] = splitPairs(c.keepOnFloor);
  const filterIds = (ids) => (ids || []).filter(id => availSet.has(id));
  const targetMinutes = {};
  for (const [id, v] of Object.entries(c.targetMinutes || {})) if (availSet.has(id)) targetMinutes[id] = v;
  const minMinutes = c.minMinutes || {};
  const fullPeriods = {}, fullPins = {}, fullFinish = {};
  for (const [id, v] of Object.entries(c.fullFinish || {})) if (availSet.has(id) && Number.isInteger(v)) fullFinish[id] = v;
  for (const [id, v] of Object.entries(c.fullPeriods || {})) if (availSet.has(id) && Number.isInteger(v) && v > 0) fullPeriods[id] = v;
  for (const [id, v] of Object.entries(c.fullPins || {})) if (availSet.has(id) && Array.isArray(v) && v.length) fullPins[id] = v;
  const lockedTargets = filterIds(c.lockedTargets);
  const raised = raiseLockedTargets(targetMinutes, lockedTargets, minMinutes, [...availSet]);
  const closing = c.closing && c.closing.stints > 0
    ? { stints: c.closing.stints, players: filterIds(c.closing.players) } : null;
  const units = (c.units || []).map(u => filterIds(u));
  return {
    minMinutes,
    fullPeriods, fullPins, fullFinish,
    maxMinutes: c.maxMinutes || {},
    /* `normalize` is a whitelist, and lockedTargets was never on it -- so a
       locked row had never reached the solver at all. That is why the lock only
       ever guarded the "Even out the rest" button: the UI was the only place
       the flag existed. */
    lockedTargets,
    targetMinutes, raised, closing, units,
    maxConsecutive: c.maxConsecutive > 0 ? c.maxConsecutive : 0,
    maxBench: c.maxBench > 0 ? c.maxBench : 0,
    pairs: keepPairs,
    avoids: keepAvoids,
    /* The third pair relation. `pairs` and `avoids` both constrain the FLOOR
       (both on / never both on); this one constrains the BENCH, and is the
       inverse of neither -- a coach who wants a ball handler out there at all
       times says nothing about whether the other one is also playing. */
    keepOnFloor,
    /* #568: the Together rules set Always, in stored order. Only these are held
       as a hard pair; the rest of `pairs` are the soft default. */
    alwaysPairs: keepPairs.filter(isAlways),
    openingFive: filterIds(c.openingFive),
    lastPeriodFive: filterIds(c.lastPeriodFive),
    droppedPairs,
    droppedAvoids,
    droppedKeepOn,
    droppedOpening: (c.openingFive || []).filter(id => !availSet.has(id)),
    droppedLastPeriod: (c.lastPeriodFive || []).filter(id => !availSet.has(id)),
  };
}

function avoidSetOf(avoids) {
  const s = new Set();
  for (const [a, b] of avoids) s.add(pairKey(a, b));
  return s;
}

function combinations(arr, k) {
  const out = [];
  const cur = [];
  (function rec(start) {
    if (cur.length === k) { out.push(cur.slice()); return; }
    for (let i = start; i < arr.length; i++) { cur.push(arr[i]); rec(i + 1); cur.pop(); }
  })(0);
  return out;
}

/* ------------------------------------------------------------------ *
 * feasibility -- pure arithmetic, runs before any search
 * ------------------------------------------------------------------ */
/* Where the last period's first stint sits: the one place buildForced pins
   the last-period rule and the one place analyzeFeasibility checks it, so the
   warning and the solver cannot disagree. -1 when no such stint remains (a
   suffix that is all overtime). `periods` absent: the highest regulation period
   among the stints, which is the same index for a full game and for a suffix. */
export function lastPeriodStintIndex(stints, periods) {
  // the fallback equals format.periods only for a suffix that reaches the last regulation period (direct callers that omit periods)
  const last = periods ?? Math.max(0, ...stints.filter(s => !isOvertimeStint(s)).map(s => s.period));
  return stints.findIndex(s => s.period === last);
}

export function analyzeFeasibility({ players, availableIds, constraints, stints, strategy, periods, maxSubs, periodMinutes, playsIn, coveredIn }) {
  const issues = [];
  const byId = new Map(players.map(p => [p.id, p]));
  const short = deriveShortNames(players);
  const label = id => byId.get(id)?.name || short[id] || id;

  const avail = availableIds.filter(id => byId.has(id));
  const availSet = new Set(avail);
  const c = normalize(constraints, availSet);

  const gameMinutes = stints.reduce((a, s) => a + s.minutes, 0);
  const floorMinutes = gameMinutes * ON_FLOOR;
  const stintLens = stints.map(s => s.minutes);
  const maxStint = Math.max(...stintLens, 0);
  const minStint = stintLens.length ? Math.min(...stintLens) : 0;
  const lastPeriodIdx = lastPeriodStintIndex(stints, periods);
  // a ratio within float error of a whole number is whole (10 / 3.333.. is 3)
  const wholeStints = mn => Math.abs(mn / maxStint - Math.round(mn / maxStint)) < 1e-9;

  const err = (code, message, playerIds = []) => issues.push({ severity: 'error', code, message, playerIds });
  const warn = (code, message, playerIds = []) => issues.push({ severity: 'warn', code, message, playerIds });

  if (avail.length < ON_FLOOR) {
    err('NOT_ENOUGH_PLAYERS',
      `Only ${avail.length} player${avail.length === 1 ? '' : 's'} available; you need at least ${ON_FLOOR} to field a lineup.`,
      avail);
    return issues;
  }
  /* Rotation order (#545): the coach's list is the plan, so no rule can make
     it infeasible. Rules warn after the fives are made (`finish`). */
  if (strategy === 'order') return issues;

  for (const id of avail) {
    const mn = c.minMinutes[id];
    const mx = c.maxMinutes[id];
    if (mn != null && mn > gameMinutes) {
      err('MIN_EXCEEDS_GAME',
        `${label(id)} has a ${mn}-minute minimum but the game is only ${fmtMinutes(gameMinutes)} minutes long.`, [id]);
    }
    if (mn != null && mx != null && mn > mx) {
      err('MIN_ABOVE_CAP', `${label(id)} has a ${mn}-minute minimum and a ${mx}-minute cap. Pick one.`, [id]);
    }
    if (mx != null && mx < minStint) {
      warn('CAP_BELOW_STINT',
        `${label(id)}'s ${mx}-minute cap is shorter than a ${fmtMinutes(minStint)}-minute stint, so they will play 0 minutes.`, [id]);
    }
    if (mn != null && !wholeStints(mn) && stintLens.every(l => l === maxStint)) {
      warn('MIN_OFF_STINT_BOUNDARY',
        `${label(id)}'s ${mn}-minute minimum rounds up to ${fmtMinutes(Math.ceil(mn / maxStint - 1e-9) * maxStint)} (stints are ${fmtMinutes(maxStint)} minutes).`, [id]);
    }
  }

  /* #450: the whole periods asked for must fit the seats the whole periods have.
     Said in periods; it replaces the same arithmetic in minutes below. */
  const fullAsked = avail.filter(id => c.fullPeriods[id]);
  let fullTooMany = false;
  /* Only a list that covers the whole regulation game is refused: a re-plan's
     suffix places what fits and `FULL_PERIODS_SHORT` names the rest. */
  const regulationMinutes = stints.reduce((a, s) => a + (s.period <= periods ? s.minutes : 0), 0);
  if (fullAsked.length && strategy !== 'platoon' && periodMinutes > 0 && Math.abs(regulationMinutes - periods * periodMinutes) < 1e-6) {
    const eligible = eligiblePeriods(stints, { periods, periodMinutes }).length;
    const total = fullAsked.reduce((a, id) => a + Math.min(c.fullPeriods[id], eligible), 0);
    if (total > eligible * ON_FLOOR) {
      fullTooMany = true;
      const same = fullAsked.every(id => c.fullPeriods[id] === c.fullPeriods[fullAsked[0]]);
      const asked = same ? `Everyone plays ${wholePeriods(periods, c.fullPeriods[fullAsked[0]])}` : `The whole ${periodNoun(periods, 2)} asked for`;
      err('FULL_PERIODS_TOO_MANY',
        `${asked} needs ${total} player-periods${same ? ` (${c.fullPeriods[fullAsked[0]]} x ${plural(fullAsked.length, 'player')})` : ''}, but ${plural(eligible, 'period')} have room for ${eligible * ON_FLOOR} (${eligible} x ${ON_FLOOR} on the floor). Lower the number, or count it in minutes.`,
        fullAsked);
    }
  }

  const minSum = avail.reduce((a, id) => a + (c.minMinutes[id] || 0), 0);
  if (minSum > floorMinutes && !fullTooMany) {
    const top = avail
      .filter(id => c.minMinutes[id])
      .sort((a, b) => c.minMinutes[b] - c.minMinutes[a])
      .slice(0, 3)
      .map(id => `${label(id)} (${c.minMinutes[id]})`)
      .join(', ');
    err('MINS_UNSATISFIABLE',
      `Required minimums total ${minSum} minutes but the game only totals ${fmtMinutes(floorMinutes)} minutes (${fmtMinutes(gameMinutes)} min × ${ON_FLOOR} players). Largest: ${top}.`,
      avail.filter(id => c.minMinutes[id]));
  }

  const capSum = avail.reduce((a, id) => a + (c.maxMinutes[id] != null ? c.maxMinutes[id] : gameMinutes), 0);
  if (capSum < floorMinutes) {
    err('CAPS_UNSATISFIABLE',
      `Maximums allow at most ${fmtMinutes(capSum)} total minutes but the game needs ${fmtMinutes(floorMinutes)} minutes to keep ${ON_FLOOR} on the floor. Raise a maximum or add a player.`,
      avail.filter(id => c.maxMinutes[id] != null));
  }

  const avoidSet = avoidSetOf(c.avoids);
  for (const [a, b] of c.pairs) {
    if (avoidSet.has(pairKey(a, b))) {
      err('PAIR_AVOID_CONFLICT', `${label(a)} and ${label(b)} are set both Together and Apart.`, [a, b]);
    }
  }

  /* #446: Always together makes a tied group play every stint as one, so two
     kids tied through a third and also set Apart can never both be satisfied.
     A direct pair is PAIR_AVOID_CONFLICT above and is not said twice. */
  if (c.alwaysPairs.length) {
    const group = tiedGroups(avail, c.alwaysPairs);
    const direct = new Set(c.pairs.map(([a, b]) => pairKey(a, b)));
    for (const [a, b] of c.avoids) {
      if (direct.has(pairKey(a, b)) || group.get(a) !== group.get(b)) continue;
      const via = [...group.get(a)].filter(id => id !== a && id !== b);
      err('PAIR_CHAIN_APART',
        `${label(a)} and ${label(b)} are set Apart, but Always together rules tie both to ${andList(via.map(label))}, so they would always be on together. Drop one of the rules.`,
        [a, b]);
    }
  }

  /* A side covers the smaller of its cap and its locked By hand number (after
     the raise); a number the coach has not locked is only a preference. */
  const lockOf = id => (c.lockedTargets.includes(id) && c.targetMinutes[id] != null ? c.targetMinutes[id] : Infinity);
  for (const [a, b] of c.keepOnFloor) {
    const capOf = id => (c.maxMinutes[id] != null ? c.maxMinutes[id] : gameMinutes);
    const side = id => Math.min(capOf(id), lockOf(id));
    const cover = side(a) + side(b);
    if (cover < gameMinutes) {
      const byHand = [a, b].filter(id => lockOf(id) < capOf(id));
      const byCap = [a, b].filter(id => capOf(id) < gameMinutes && capOf(id) <= lockOf(id));
      const nums = byHand.length ? ` (${andList(byHand.map(id => `${label(id)} ${fmtMinutes(lockOf(id))}`))})` : '';
      const what = byHand.length && byCap.length ? `caps and By hand numbers${nums}` : byHand.length ? `By hand numbers${nums}` : 'caps';
      const fix = byHand.length && byCap.length ? 'Raise a cap, unlock a number' : byHand.length ? 'Unlock a number' : 'Raise a cap';
      err('KEEPON_UNSATISFIABLE',
        `${label(a)} or ${label(b)} has to be on the floor at all times, but their ${what} only cover ${fmtMinutes(cover)} of the game's ${fmtMinutes(gameMinutes)} minutes. ${fix} or drop the rule.`,
        [a, b]);
    }
  }

  for (const [a, b] of c.droppedPairs) warn('PAIR_DROPPED', `The Together rule for ${label(a)} and ${label(b)} is ignored: one of them is not available.`, [a, b]);
  for (const [a, b] of c.droppedAvoids) warn('AVOID_DROPPED', `The Apart rule for ${label(a)} and ${label(b)} is ignored: one of them is not available.`, [a, b]);
  /* Dropped rather than collapsed into "the other one plays every minute",
     which is a much bigger instruction than the coach gave. */
  for (const [a, b] of c.droppedKeepOn) warn('KEEPON_DROPPED', `The One of two on rule for ${label(a)} and ${label(b)} is ignored: one of them is not available.`, [a, b]);
  for (const id of c.droppedOpening) warn('OPENING_DROPPED', `${label(id)} is set to start but is not available.`, [id]);
  for (const id of c.droppedLastPeriod) warn('LAST_PERIOD_DROPPED', `${label(id)} is set to start the last period but is not available.`, [id]);

  for (const [name, group, pinned] of [
    ['opening stint', c.openingFive, stints[0]],
    ['last period', c.lastPeriodFive, stints[lastPeriodIdx]],
  ]) {
    if (group.length > ON_FLOOR) {
      err('FORCED_GROUP_TOO_BIG', `${group.length} players are pinned to the ${name} but only ${ON_FLOOR} fit.`, group);
    }
    for (const [a, b] of combinations(group, 2)) {
      if (avoidSet.has(pairKey(a, b))) {
        err('FORCED_GROUP_AVOID', `${label(a)} and ${label(b)} are both pinned to the ${name} but are set Apart.`, [a, b]);
      }
    }
    for (const id of group) {
      const mx = c.maxMinutes[id];
      if (mx != null && pinned && mx < pinned.minutes) {
        err('FORCED_OVER_CAP', `${label(id)} is pinned to the ${name} but their ${mx}-minute cap will not cover a ${fmtMinutes(pinned.minutes)}-minute stint.`, [id]);
      }
    }
  }

  if (c.closing) {
    if (c.closing.players.length > ON_FLOOR) {
      err('CLOSERS_TOO_MANY', `${c.closing.players.length} players are set to close but only ${ON_FLOOR} fit on the floor.`, c.closing.players);
    }
    if (c.closing.stints > stints.length) {
      warn('CLOSERS_TOO_LONG', `The closing window is longer than the game; the closing group will play every stint.`, c.closing.players);
    }
    for (const [a, b] of combinations(c.closing.players, 2)) {
      if (avoidSet.has(pairKey(a, b))) {
        err('CLOSERS_AVOID', `${label(a)} and ${label(b)} are both set to close but are set Apart.`, [a, b]);
      }
    }
  }

  /* What is pinned to each stint comes from buildForced alone, so this and the
     solver cannot disagree (#436). A pin the cap cannot cover is refused here;
     the search never gets to drop it quietly. */
  const forced = buildForced(stints, c, { periods });
  const platoonUnits = strategy === 'platoon' && c.units.length > 0;
  if (!platoonUnits) {
    const ahead = pinnedAhead(forced, stints);
    const groupsOf = pinGroups(stints, c, periods);
    for (const id of avail) {
      const mx = c.maxMinutes[id];
      if (mx == null) continue;
      const pinnedMin = ahead.get(id)?.[0] ?? 0;
      if (mx + 1e-9 >= pinnedMin || issues.some(i => i.code === 'FORCED_OVER_CAP' && i.playerIds.includes(id))) continue;
      const why = groupsOf.filter(g => g.forced.some(set => set.has(id))).map(g => g.say);
      err('PINS_OVER_CAP', `${label(id)} is ${andList(why)} (${fmtMinutes(pinnedMin)} min) but is capped at ${mx}.`, [id]);
    }

    /* One stint can be pinned by two groups at once, which no single group's size
       shows. Only reported when no one group is already too big or Apart. */
    const groups = [c.openingFive, c.lastPeriodFive, c.closing ? c.closing.players : []];
    const seenApart = new Set();
    let reportedBig = false;
    forced.forEach(set => {
      if (set.size > ON_FLOOR && groups.every(g => g.length <= ON_FLOOR) && !reportedBig) {
        reportedBig = true;
        err('FORCED_GROUP_TOO_BIG', `${set.size} players are pinned to the same stint but only ${ON_FLOOR} fit. Check who is set to start, to start the last period or to close.`, [...set]);
      }
      for (const [a, b] of combinations([...set], 2)) {
        if (!avoidSet.has(pairKey(a, b)) || seenApart.has(pairKey(a, b))) continue;
        seenApart.add(pairKey(a, b));
        if (groups.some(g => g.includes(a) && g.includes(b))) continue;
        err('FORCED_GROUP_AVOID', `${label(a)} and ${label(b)} are both pinned to the same stint but are set Apart.`, [a, b]);
      }
    });
  }

  /* A pinned five naming neither of them has no seat left to give, and no
     amount of searching invents one -- arithmetic, so an error, not a cost. */
  for (const [name, group] of [['starting five', c.openingFive], ['last period', c.lastPeriodFive],
                               ['closing five', c.closing ? c.closing.players : []]]) {
    if (group.length < ON_FLOOR) continue;
    for (const [a, b] of c.keepOnFloor) {
      if (!group.includes(a) && !group.includes(b)) {
        err('FORCED_GROUP_KEEPON',
          `The ${name} is a full ${ON_FLOOR} without ${label(a)} or ${label(b)}, but you have one of them on the floor at all times. Change one of the two.`,
          [a, b]);
      }
    }
  }

  for (const { id, from, to } of c.raised) {
    warn('TARGET_UNDER_MIN',
      `${label(id)}'s By hand number was raised from ${fmtMinutes(from)} to ${fmtMinutes(to)} to meet their ${fmtMinutes(to)}-minute minimum.`, [id]);
  }

  if (Object.keys(c.targetMinutes).length) {
    const pinned = avail.filter(id => c.targetMinutes[id] != null);
    const sum = pinned.reduce((a, id) => a + c.targetMinutes[id], 0);
    const free = avail.length - pinned.length;
    // A mismatch is guidance, not a blocker. The solver gets as close as it
    // can and the shortfall is reported, so the coach can set the players
    // they care about and reconcile afterwards.
    /* #368: By hand's targets are regulation numbers, so a game that went to
       overtime is measured without it. A suffix that is all overtime (the
       re-plan after it was added) has no regulation to measure against and
       keeps the whole of what it was handed. */
    const regulation = stints.filter(s => !isOvertimeStint(s));
    const targetFloor = (regulation.length ? regulation : stints).reduce((a, s) => a + s.minutes, 0) * ON_FLOOR;
    if (free === 0 && Math.abs(sum - targetFloor) > 1e-9) {
      warn(sum > targetFloor ? 'TARGETS_OVER_BUDGET' : 'TARGETS_UNDER_BUDGET',
        sum > targetFloor
          ? `Minute targets add up to ${sum}, which is ${fmtMinutes(sum - targetFloor)} more than the game has. Somebody will fall short of their number.`
          : `Minute targets add up to ${sum} of ${fmtMinutes(targetFloor)} floor-minutes. The spare ${fmtMinutes(targetFloor - sum)} minutes get shared out.`,
        pinned);
    }
    for (const [id, t] of Object.entries(c.targetMinutes)) {
      const mx = c.maxMinutes[id];
      if (mx != null && t > mx) warn('TARGET_OVER_CAP', `${label(id)} is targeted at ${t} min but capped at ${mx}.`, [id]);
    }
  }

  let minConflict = [], minConflictMost = 0;
  if (c.maxConsecutive) {
    if (avail.length <= ON_FLOOR) {
      warn('CONSEC_IMPOSSIBLE', `With only ${avail.length} available, nobody can be rested — the Plays at most N in a row rule will be ignored.`, avail);
    } else {
      /* Any r+1 stints in a row must hold a sit for everyone, and they have
         only (r+1)*(n-5) bench seats between them. Arithmetic, no search. */
      const r = c.maxConsecutive, n = avail.length;
      if (stints.length >= r + 1 && (r + 1) * (n - ON_FLOOR) < n) {
        const tryLimit = Math.ceil(ON_FLOOR / (n - ON_FLOOR));
        warn('CONSEC_TOO_FEW',
          `With ${n} players, Plays at most ${r} in a row cannot hold: it needs ${Math.ceil(ON_FLOOR * (r + 1) / r)} players. ${tryLimit < stints.length ? `Try a limit of ${tryLimit}.` : 'Turn off Plays at most N in a row or add players.'}`);
      }
      const most = mostMinutesUnderRun(stintLens, r);
      minConflict = avail.filter(id => c.minMinutes[id] && c.minMinutes[id] > most + 1e-9);
      minConflictMost = most;
    }
  }

  /* Sits at most N in a row (#441). Two arithmetic lines, one at most. Every
     kid needs X stints on so that no m+1 in a row are all sits; the floor has
     5 seats a stint. When that cannot be met the rule cannot hold at all. When
     it can, the entries over any m breaks must still cover everyone who sat,
     which the change limit may not allow -- the plan then holds the bench limit
     by changing more at once, so this line replaces SUBS_EXCEEDED. */
  if (c.maxBench && avail.length > ON_FLOOR) {
    const m = c.maxBench, n = avail.length, S = benchSpan(stints);
    if (benchTotalShort(m, n, S) || benchWindowShort(m, n, S)) {
      /* the nearest limit a coach can set (the stepper stops at MAX_BENCH_LIMIT) that holds */
      let tryLimit = m + 1;
      while (tryLimit < S && (benchTotalShort(tryLimit, n, S) || benchWindowShort(tryLimit, n, S))) tryLimit++;
      const advice = tryLimit < S && tryLimit <= MAX_BENCH_LIMIT ? `Try a limit of ${tryLimit}.` : 'Turn off Sits at most N in a row or add players.';
      warn('BENCH_TOO_FEW',
        benchTotalShort(m, n, S)
          ? `With ${n} players, Sits at most ${m} in a row cannot hold: everyone needs ${plural(benchNeedOn(m, S), 'stint')} on, ${n * benchNeedOn(m, S)} in all, and the game has ${ON_FLOOR * S}. ${advice}`
          : `With ${n} players, Sits at most ${m} in a row cannot hold: any ${m + 1} stints in a row have ${ON_FLOOR * (m + 1)} spots on the floor, and all ${n} players need one. ${advice}`,
        avail);
    } else if (strategy !== 'platoon' && benchOutrunsChanges(m, maxSubs, n, S)) {
      /* The window check above keeps this at most MAX_CHANGES (n <= 5(m+1)),
         so "Allow N changes" is never above the 5 Settings allows. */
      const need = Math.ceil((n - ON_FLOOR) / m);
      const tryLimit = Math.ceil((n - ON_FLOOR) / maxSubs);
      warn('BENCH_SUBS',
        `With ${n} players and ${plural(maxSubs, 'change')} at a time, Sits at most ${m} in a row needs ${need} changes at some breaks. Allow ${need} changes at a time, or ${tryLimit < S && tryLimit <= MAX_BENCH_LIMIT ? `try a limit of ${tryLimit}.` : 'turn off Sits at most N in a row.'}`,
        avail);
    }
  }

  /* #451: Everyone plays in each half or period. Two arithmetic lines, one at
     most, and each replaces what the change limit would say (SUBS_EXCEEDED).
     A half or period of k stints seats 5 in the first and `maxSubs` more at each
     break after it; more kids than that cannot all play in it. When the clock
     itself has fewer than n seats (5 x k) no number of changes helps. */
  if (playsInMode(playsIn) && strategy !== 'platoon' && periodMinutes > 0) {
    const mode = playsIn, format = { periods, periodMinutes };
    const noun1 = playsInNoun(mode, periods);
    const noun = `each ${noun1}`;
    let few = null, subs = null;
    for (const { key: g, idx } of stintGroups(stints, format, mode)) {
      const k = idx.length;
      const n = avail.filter(id => !coveredIn?.[id]?.includes(g)).length;
      if (n <= ON_FLOOR) continue;
      if (n > ON_FLOOR * k) { if (!few || k < few.k) few = { k, n }; continue; }
      if (maxSubs > 0 && k > 1 && n > ON_FLOOR + maxSubs * (k - 1)) {
        const need = Math.ceil((n - ON_FLOOR) / (k - 1));
        if (!subs || need > subs.need) subs = { need, n };
      }
    }
    if (few) {
      warn('PLAYS_IN_TOO_FEW',
        `With ${few.n} players, Everyone plays in ${noun} cannot hold: a ${noun1} is ${plural(few.k, 'stint')} here, ${ON_FLOOR * few.k} spots on the floor. Sub more often, or turn it off.`, avail);
    } else if (subs) {
      warn('PLAYS_IN_SUBS',
        `With ${subs.n} players and ${plural(maxSubs, 'change')} at a time, Everyone plays in ${noun} needs ${subs.need} changes at some breaks. Allow ${subs.need} changes at a time, or turn it off.`, avail);
    }
  }

  // Choosing platoon without defining the fives used to fall through and plan
  // as if balanced -- a silent no-op is worse than a clear ask.
  if (strategy === 'platoon' && !c.units.length) {
    err('UNITS_MISSING', `Platoon needs at least one group of ${ON_FLOOR}. Pick the players for Group 1.`, []);
  }

  if (c.units.length) {
    c.units.forEach((u, i) => {
      if (u.length !== ON_FLOOR) {
        err('UNIT_WRONG_SIZE', `Group ${i + 1} has ${u.length} player${u.length === 1 ? '' : 's'}; a group needs exactly ${ON_FLOOR}.`, u);
      }
    });
    const inUnit = new Set(c.units.flat());
    const benched = avail.filter(id => !inUnit.has(id));
    if (benched.length) {
      warn('UNIT_LEFTOVERS', `${benched.map(label).join(', ')} ${benched.length === 1 ? 'is' : 'are'} not in any group and will not play.`, benched);
    }
    /* A unit is used exactly as declared -- there is nothing for the solver to
       optimize -- so a "never together" pair sitting inside one was honoured
       silently and the plan came back clean. Two instructions that contradict
       each other is the coach's call to make, but they have to be told there
       is a contradiction. Found by fuzzing platoon, which until now had never
       been fuzzed at all. */
    c.units.forEach((u, i) => {
      for (const [a, b] of c.keepOnFloor) {
        if (!u.includes(a) && !u.includes(b)) {
          warn('UNIT_KEEPON',
            `Group ${i + 1} has neither ${label(a)} nor ${label(b)}, but you have one of them on the floor at all times. The group wins — drop the rule or change the group.`,
            [a, b]);
        }
      }
      for (const [a, b] of combinations(u, 2)) {
        if (avoidSet.has(pairKey(a, b))) {
          warn('UNIT_AVOID',
            `Group ${i + 1} puts ${label(a)} and ${label(b)} on the floor together, but you have them set Apart. The group wins — drop the rule or change the group.`,
            [a, b]);
        }
      }
    });
  }

  if (c.avoids.length && !issues.some(i => i.code === 'NOT_ENOUGH_PLAYERS')) {
    const legal = combinations(avail, ON_FLOOR)
      .some(group => combinations(group, 2).every(([a, b]) => !avoidSet.has(pairKey(a, b))));
    if (!legal) {
      err('AVOID_IMPOSSIBLE',
        `No legal lineup of ${ON_FLOOR} exists — the Apart rules rule out every combination. Drop one of them.`,
        c.avoids.flat());
    }
  }

  /* Said last, and only for a plan that will be built: a minimum already
     refused as unsatisfiable does not also need Plays at most N in a row blamed. One line
     however many players, because a league-wide minimum reaches all of them. */
  if (minConflict.length && !issues.some(i => i.severity === 'error')) {
    const r = c.maxConsecutive;
    const who = minConflict.length === 1
      ? `${label(minConflict[0])}'s ${c.minMinutes[minConflict[0]]}-minute minimum needs`
      : `${andList(minConflict.map(label))} have minimums that need`;
    warn('CONSEC_MIN_CONFLICT',
      `${who} more than Plays at most ${r} in a row allows (${fmtMinutes(minConflictMost)} minutes at most), so they will play longer runs. Lower one of the two.`, minConflict);
  }

  return issues;
}

/* ------------------------------------------------------------------ *
 * theoretical best spread, given how the clock divides
 * ------------------------------------------------------------------ */
export function minPossibleSpread(stints, nAvail) {
  const lens = stints.map(s => s.minutes);
  const uniform = lens.every(l => Math.abs(l - lens[0]) < 1e-9);
  const slots = stints.length * ON_FLOOR;
  if (!uniform) {
    // Unequal stint lengths: exact answer is a partition problem. Report the
    // uniform-case bound as an estimate and flag it rather than lying.
    const avg = lens.reduce((a, b) => a + b, 0) * ON_FLOOR / nAvail;
    return { minutes: slots % nAvail === 0 ? 0 : null, exact: false, fairShare: avg };
  }
  const L = lens[0];
  const fairShare = slots * L / nAvail;
  return { minutes: slots % nAvail === 0 ? 0 : L, exact: true, fairShare };
}

/* ------------------------------------------------------------------ *
 * plan generation
 * ------------------------------------------------------------------ */
/* ================================================================== *
 * lineup balance
 *
 * Even minutes is not the whole job. Five players chosen only for
 * fairness can put a coach's five weakest on the floor together, which
 * is how a close game stops being one -- and the coach's answer to that
 * is usually to abandon even minutes altogether.
 *
 * So each player carries a tier, 1-5, middle by default. A lineup's
 * strength is the sum of its five tiers, and every stint gets a target.
 * `even` asks each stint to look like the average of them; the other
 * shapes tilt that target across the game.
 *
 * Two things keep this honest. It is scored, never forced: the weight
 * below sits far under the minutes term, so balance is what the solver
 * does with the freedom fairness leaves it, not a license to spend
 * anyone's minutes. And with every player on the default tier the term
 * is identically zero, so a coach who ignores the feature gets exactly
 * the plan they got before it existed.
 *
 * The amplitude is not a magic number: it is the gap between the best
 * five available and the average five, so "start" really does aim the
 * top five at the first stint rather than nudging vaguely upward.
 * ================================================================== */
export const BALANCE = ['even', 'start', 'finish', 'both'];
export const DEFAULT_TIER = 3;

/* Where along the game each shape wants strength, as a multiplier on the
   amplitude.
 *
 * Every shape here has to average to zero, and that is not a stylistic
 * choice. The total strength across a game is *already decided* by the
 * minutes: it is the sum over players of their tier times the number of
 * stints they play. Even minutes therefore fix the mean stint strength
 * exactly, and a curve that averages above it is asking for strength the
 * roster does not have. The first version of this asked `start` for a ramp
 * from full amplitude down to the average -- mean +0.5 -- and the solver did
 * the only thing it could, which was flatten into a compromise that satisfied
 * nothing. It looked like a weight that was too low. It was arithmetic.
 *
 * So `start` runs +1 to -1 rather than +1 to 0: strongest first genuinely
 * does mean weakest last, because those minutes have to go somewhere. `both`
 * is a cosine for the same reason -- strong ends buy a softer middle. */
function balanceShape(kind, i, n) {
  if (n <= 1 || kind === 'even') return 0;
  const t = i / (n - 1);
  if (kind === 'start') return 1 - 2 * t;
  if (kind === 'finish') return 2 * t - 1;
  if (kind === 'both') return Math.cos(2 * Math.PI * t);
  return 0;
}

/* Belt and braces on the paragraph above: center whatever the shape produced
   so it averages to zero for this particular stint count. A cosine over eight
   samples is not exactly balanced, and the residue is a standing bias the
   solver can never satisfy. */
function centered(values) {
  if (!values.length) return values;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.map(v => v - mean);
}

/* Deliberately low. A minute of unfairness costs 60; a whole game of stints
   two tiers off costs about a tenth of that. The minute-neutral exchange move
   is what actually does the work here -- it rearranges who is on the floor
   together without moving anyone's total, so in most plans balance is free and
   this weight only decides what happens when the two genuinely conflict. */
const BALANCE_WEIGHT = 5;

/* Everyone plays before halftime. Even totals were never the whole promise: a
   kid who does not start, sits a period and then plays one has the same number
   on the card and a different afternoon, and over 2,880 plans 4.4% of players
   got their first minutes at or after the break. A DEFAULT, not a setting --
   a coach who wants a kid held back has minimum minutes and the out list.

   A flat charge per player still waiting at the break, sized to outbid a double
   sit at 30, a spare change at 40 or any amount of balance, so the fix comes
   out of the minute-neutral exchange move and not out of anyone's total -- and
   to lose to a floor, a cap or a lock at 1000 a minute. Level-blind, so it can
   run in both passes without a level reaching a single total.

   `halfReach` caps the ambition and it is the COACH'S number: the first stint
   seats five, every break after seats `maxSubs` more. Past that, everyone-on-
   early would override a control the settings page shows, so the default
   yields and `HALF_LATE` says which limit bound. `maxSubs` was exposed first
   for exactly this. */
const LATE_WEIGHT = 200;
const playedBeforeHalf = (lineups, ctx) => {
  const on = new Set();
  for (let i = 0; i < ctx.firstHalf; i++) for (const id of lineups[i]) on.add(id);
  return on;
};

/* #451: the [id, group] pairs where a kid is on for no stint of a half or
   period they are owed (one a re-plan says they already played in is not).
   `cost` and `broken` run this on every candidate lineup, so they take the
   count, which allocates nothing; the named list is for `finish`. */
function playsInMissCount(lineups, ctx, out = null) {
  let n = 0;
  for (const g of ctx.playsIn.groups) {
    for (const id of ctx.avail) {
      if (ctx.playsIn.covered(id, g.key)) continue;
      let on = false;
      for (let k = 0; k < g.idx.length && !on; k++) on = lineups[g.idx[k]].includes(id);
      if (!on) { n++; if (out) out.push([id, g.key]); }
    }
  }
  return n;
}
const playsInMisses = (lineups, ctx) => { const out = []; playsInMissCount(lineups, ctx, out); return out; };

export function generatePlan(input) {
  const {
    players,
    availableIds,
    format,
    granularity,
    constraints = {},
    carryover = null,       // { [playerId]: minutes already played today }
    /* Who gets the odd stint when the clock does not divide evenly:
       { [playerId]: number }, highest first, ties falling through to a seeded
       rotation. A number and nothing else -- the engine is not told, and must
       not be told, what the number means. See `applyTieBreak`. */
    priority = null,
    seed = 1,
    maxSubs = DEFAULT_MAX_SUBS,
    minSubs = DEFAULT_MIN_SUBS,
    iterations = 4000,
  } = input;

  /* `input.stints` lets a caller hand the solver a stint list directly instead
     of one derived from `format` + `granularity`. It exists for exactly one
     caller -- `resolveRest` in `state.js`, the mid-game re-solve -- which needs
     the SUFFIX of a game, and a suffix is frequently not describable as any
     {periods, periodMinutes} pair (28.6% of cut points across every format
     `sanitize` accepts; 6 of the 11 cut points in the app's own 4x8 default at
     3-minute stints). `format.periods` keeps being passed -- the REAL period
     count -- so a suffix that still holds the last period's first stint pins
     `lastPeriodFive` there. A suffix that starts inside the last period has
     no such stint to pin: `resolveRest` clears the rule first, because the
     five has already started the period. Absent, every
     call is byte-identical to before; that is measured, not assumed. */
  const stints = input.stints || buildStints(format, granularity);
  const byId = new Map(players.map(p => [p.id, p]));
  const avail = availableIds.filter(id => byId.has(id));
  /* #450: full periods are pinned before anything reads pins. The picks ride
     on a copy of the constraints, so feasibility, `buildForced`, `cost` and the
     notes after the fact all see one set. Platoon applies no pins. */
  let cons = constraints, fullShort = [];
  const order = input.strategy === 'order';
  const searched = !fivesAreSet(input.strategy);
  /* Rotation order applies none of the pins that choose who plays: the list
     does. Starts the last period is the one pin still read, and is only
     warned about when the list misses it. */
  if (order) {
    cons = { ...constraints, openingFive: [], fullPeriods: {}, fullPins: {}, fullFinish: {}, closing: null,
      units: [], targetMinutes: {}, lockedTargets: [] };
  }
  if (searched && Object.keys(constraints.fullPeriods || {}).length) {
    const c0 = normalize(constraints, new Set(avail));
    if (Object.keys(c0.fullPeriods).length) {
      const start0 = Array.isArray(input.start) && input.start.length === stints.length
        ? input.start.map(row => (Array.isArray(row) ? row : [])) : null;
      const got = assignFullPeriods(stints, c0, format, avail, avoidSetOf(c0.avoids), start0, seed);
      cons = { ...constraints, fullPins: got.pins };
      fullShort = got.short;
    }
  }
  const playsMode = searched ? playsInMode(input.playsIn) : null;
  const issues = analyzeFeasibility({ players, availableIds: avail, constraints: cons, stints, strategy: input.strategy, periods: format.periods, maxSubs, periodMinutes: format.periodMinutes, playsIn: playsMode, coveredIn: input.coveredIn });

  if (issues.some(i => i.severity === 'error')) {
    return { ok: false, stints: [], minutes: {}, spread: null, issues, seed };
  }

  const availSet = new Set(avail);
  const c = normalize(cons, availSet);
  const avoidSet = avoidSetOf(c.avoids);
  const short = deriveShortNames(players);

  const gameMinutes = stints.reduce((a, s) => a + s.minutes, 0);
  const capOf = id => (c.maxMinutes[id] != null ? c.maxMinutes[id] : Infinity);
  const minOf = id => (c.minMinutes[id] || 0);

  // Carryover credit: a player light on the day starts with a positive credit,
  // clamped so one lopsided game cannot hand someone the whole next one.
  const credit = {};
  for (const id of avail) credit[id] = 0;
  if (carryover) {
    const totals = avail.map(id => carryover[id] || 0);
    const avg = totals.reduce((a, b) => a + b, 0) / avail.length;
    const clamp = 2 * Math.max(...stints.map(s => s.minutes));
    for (const id of avail) {
      credit[id] = Math.max(-clamp, Math.min(clamp, avg - (carryover[id] || 0)));
    }
  }

  const tier = {};
  for (const p of players) tier[p.id] = Number.isFinite(Number(p.tier)) ? Number(p.tier) : DEFAULT_TIER;
  const tierOf = id => (tier[id] == null ? DEFAULT_TIER : tier[id]);

  // rows the coach locked. The proportional top-up below leaves these alone,
  // which is the whole meaning of the lock.
  const lockedSet = new Set(c.lockedTargets || []);

  /* #449: `input.start` is a previous plan's fives, one row per stint, for a
     re-solve after a rule edit to begin from (`greedy` tries them first, and
     still through `legalWith`, so a new rule repairs a row). Ignored unless it
     has one row per stint; absent, every call is byte-identical to before. */
  const start = Array.isArray(input.start) && input.start.length === stints.length
    ? input.start.map(row => (Array.isArray(row) ? row.filter(id => availSet.has(id)) : []))
    : null;
  const ctx = { stints, avail, avoidSet, start, capOf, minOf, credit, gameMinutes, maxSubs, minSubs, lockedSet,
                pairs: c.pairs, alwaysPairs: c.alwaysPairs, keepOn: c.keepOnFloor, tierOf,
                targetOf: id => (c.targetMinutes[id] != null ? c.targetMinutes[id] : null),
                maxConsecutive: c.maxConsecutive,
                leadOf: id => input.streakBefore?.[id] || 0,
                maxBench: c.maxBench,
                benchSpan: benchSpan(stints),   // Sits at most counts regulation only
                sitLeadOf: id => (c.maxBench ? input.sitBefore?.[id] || 0 : 0),
                hasCarryover: !!carryover && avail.some(id => Math.abs(credit[id]) > 1e-9) };
  // halftime is a regulation fact (#367): overtime follows it and never moves it
  if (playsMode) {
    ctx.playsIn = {
      mode: playsMode,
      groups: stintGroups(stints, format, playsMode),
      covered: (id, key) => !!input.coveredIn?.[id]?.includes(key),
    };
  }
  ctx.firstHalf = stintsBeforeHalftime(stints.filter(s => s.period <= format.periods));
  ctx.halfReach = ctx.firstHalf ? ON_FLOOR + Math.max(0, maxSubs) * (ctx.firstHalf - 1) : 0;
  ctx.targets = computeTargets(ctx);
  applyTieBreak(ctx, priority, seed);
  ctx.balanceTargets = balanceTargets(ctx, input.balance);

  const forcedByStint = buildForced(stints, c, format);
  ctx.forced = forcedByStint;
  let lineups;
  if (order) {
    lineups = orderLineups(ctx, input.order, avail);
  } else if (input.strategy === 'platoon' && c.units.length) {
    // the coach has already decided the fives; there is nothing to optimize
    lineups = platoonLineups(ctx, c.units);
  } else {
    /* Two passes, and the split is the whole point of the tie-break above.
     *
     * The first pass runs with the balance term switched off, so nothing about
     * a player's rotation level can reach the decision it makes -- and the
     * decision it makes is everyone's minute TOTAL. The second pass switches
     * balance back on but restricts the search to exchanges between
     * equal-length stints, the one move that cannot shift a total. Levels
     * therefore rearrange who shares the floor and nothing else, which is what
     * the control has always claimed to do.
     *
     * Before this, balance was a tie-break on the totals by accident: with 11
     * players over eight 4-minute stints the minutes term is exactly flat
     * across every choice of which seven play 16 and which four play 12, so
     * whatever term was left standing picked -- and that was the tiers.
     * Marking a child developing cost them four minutes a game with nothing on
     * screen to say so.
     *
     * Skipped entirely when there is no balance term (one tier for everybody,
     * which is most rosters): the first pass is then the whole search, exactly
     * as before. The second pass gets half the budget because it starts from a
     * solved plan and its neighbourhood is much smaller -- measured on a
     * lopsided eleven it reaches the same stint strengths as a full budget and
     * costs a third of a solve rather than a whole one. */
    const shaped = ctx.balanceTargets;
    /* #449: the previous plan's fives are a candidate too. If they cost no more
       than what the search found -- a rule that changes nothing, say -- they are
       the answer, so an edit that needs no seat moved moves none. */
    // (`cost` prices a broken minimum, cap or pin but not an Apart pair: the
    // search never makes one, so a start that has one is not a candidate)
    const startLegal = () => ctx.start.every(row => row.length === ON_FLOOR
      && row.every((a, i) => row.slice(i + 1).every(b => !avoidSet.has(pairKey(a, b)))));
    // `neutral`: the balance pass moves no minutes, so the start must carry the same totals as `lu`
    const keepStart = (lu, neutral = false) => {
      if (!ctx.start || !startLegal() || cost(ctx.start, ctx) > cost(lu, ctx) + 1e-9) return lu;
      if (neutral) {
        const a = minutesOf(ctx.start, ctx), b = minutesOf(lu, ctx);
        if (ctx.avail.some(id => Math.abs(a[id] - b[id]) > 1e-9)) return lu;
      }
      return ctx.start.map(row => row.slice());
    };
    const solve = (shapeSits) => {
      const rng = makeRng(seed);
      ctx.shapeSits = shapeSits;
      ctx.balanceTargets = null;
      const lu = keepStart(localSearch(greedy(ctx, forcedByStint, rng), ctx, forcedByStint, rng, iterations));
      return { lu, rng, shapeSits };
    };
    /* Long sits cost more (`LONG_SIT`), but the coach's numbers win: a plan
       that breaks any rule the coach sees as a warning is solved again from
       the same seed with the charge off, which is today's search exactly. The
       long-sit plan is kept only if it is no worse than that one on every
       count (`broken`), so no rule is ever broken more than it was before.
       The choice is made before the balance pass, so a rotation level can
       never move anyone's minutes; the pass can then not start a new break
       on a long-sit plan (below). */
    const broken = (lu) => {
      const m = minutesOf(lu, ctx);
      let capOver = 0, minShort = 0, pins = 0, subsOver = 0, restOver = 0, benchOver = 0, late = 0;
      const playsMiss = ctx.playsIn ? playsInMissCount(lu, ctx) : 0;
      const benched = lu.slice(0, ctx.benchSpan);
      for (const id of avail) {
        capOver += Math.max(0, m[id] - capOf(id));
        minShort += Math.max(0, minOf(id) - m[id]);
        if (ctx.maxConsecutive) restOver += Math.max(0, longestRun(lu, id, ctx.leadOf(id)) - ctx.maxConsecutive);
        if (ctx.maxBench) benchOver += Math.max(0, longestRun(benched, id, ctx.sitLeadOf(id), false) - ctx.maxBench);
      }
      lu.forEach((row, i) => { for (const id of forcedByStint[i]) if (!row.includes(id)) pins++; });
      for (let i = 1; i < lu.length; i++) subsOver += Math.max(0, changesAt(lu, i) - maxSubs);
      if (!ctx.playsIn && avail.length <= ctx.halfReach) {
        const on = playedBeforeHalf(lu, ctx);
        late = avail.filter(id => !on.has(id)).length;
      }
      return [capOver, minShort, pins, subsOver, restOver, benchOver, late, playsMiss];
    };
    const worse = (a, b) => a.some((v, k) => v > b[k] + 1e-9);
    // the bench queue at the change limit; no limit to read when maxSubs is 0 or not a number
    const queue = maxSubs > 0 ? Math.ceil((avail.length - ON_FLOOR) / maxSubs) : 0;
    ctx.sitFree = Math.max(1, Math.min(Math.max(3, queue), Math.ceil(stints.length / 2) - 1));
    let kept = solve(true);
    const keptBroken = broken(kept.lu);
    if (keptBroken.some(v => v > 1e-9)) {
      const plain = solve(false);
      if (worse(keptBroken, broken(plain.lu))) kept = plain;
    }
    ctx.shapeSits = kept.shapeSits;
    lineups = kept.lu;
    if (shaped) {
      ctx.balanceTargets = shaped;
      ctx.neutralOnly = true;
      const balanced = keepStart(localSearch(lineups, ctx, forcedByStint, kept.rng, iterations / 2), true);
      ctx.neutralOnly = false;
      /* the pass trades changes for strength; on a long-sit plan it may not
         start breaking a rule the plan kept (it may still trade one for
         another, as today's does). The plain plan keeps today's pass as it is. */
      const before = broken(lineups), after = broken(balanced);
      lineups = !kept.shapeSits || !after.some((v, k) => v > 1e-9 && before[k] <= 1e-9) ? balanced : lineups;
    }
  }

  // platoon alternates whole fives by definition; see the churn report in `finish`
  return finish(lineups, ctx, issues, { players, short, seed, stints, c, periods: format.periods, fullShort,
    platoon: input.strategy === 'platoon' && c.units.length > 0, order });
}

/* #450: which periods each kid plays start to finish, picked once before the
   search and handed to `buildForced` as pins, so every reader of pins sees them.
   In order of priority a pick never puts more than five on a stint (the other
   pins count), never seats two Apart kids in one period and never pins a kid
   past their cap; then it keeps the kid's pinned run under Plays at most N in a
   row; then it takes a period in a half the kid has none in, then the
   least-loaded period, then one the kid already plays in `start`, then the seed.
   Picks go round by round so no kid is left the leftovers. A kid it cannot place
   gets a one-step repair (another kid moves to a period with room); one still
   short comes back in `short`, never as an error.

   #535: a kid in `c.fullFinish` ({ id: period }) is on the floor for every stint
   of a period a re-plan starts inside (`resolveRest` says who). That period is
   not whole in the list, so it is never offered to anyone, but those kids are
   pinned to the rest of it first, when the same rules allow it, and a kid so
   placed owes one period fewer. */
function assignFullPeriods(stints, c, format, avail, avoidSet, start, seed) {
  const elig = eligiblePeriods(stints, format);
  const base = buildForced(stints, { ...c, fullPins: {} }, format);
  const forced = base.map(set => new Set(set));
  const rng = makeRng(((seed ^ 0x45f9a1) >>> 0) || 1);
  const stintsOf = p => stints.map((s, i) => i).filter(i => stints[i].period === p);
  const idxOf = new Map(elig.map(p => [p, stintsOf(p)]));
  // the period a re-plan starts inside is read like the others for the stints it has, and is never in `elig`
  for (const q of Object.values(c.fullFinish)) if (!idxOf.has(q)) idxOf.set(q, stintsOf(q));
  // a period's half is its last stint's, as `playsInGroup` files it: a middle period of three ends in the second half
  const half = new Map([...elig, ...Object.values(c.fullFinish)].filter(p => idxOf.get(p).length)
    .map(p => [p, playsInGroup(stints[idxOf.get(p).at(-1)], format, 'halves')]));
  const pins = {};
  const has = (id, p) => idxOf.get(p).every(i => forced[i].has(id));
  const pinnedMin = id => stints.reduce((a, s, i) => a + (forced[i].has(id) ? s.minutes : 0), 0);
  const capOf = id => (c.maxMinutes[id] != null ? c.maxMinutes[id] : Infinity);
  const can = (id, p) => {
    if (has(id, p)) return false;
    const idx = idxOf.get(p);
    if (!idx.every(i => forced[i].has(id) || forced[i].size < ON_FLOOR)) return false;
    for (const i of idx) for (const q of forced[i]) if (avoidSet.has(pairKey(id, q))) return false;
    const added = idx.reduce((a, i) => a + (forced[i].has(id) ? 0 : stints[i].minutes), 0);
    return pinnedMin(id) + added <= capOf(id) + 1e-9;
  };
  const put = (id, p) => { for (const i of idxOf.get(p)) forced[i].add(id); (pins[id] ||= []).push(p); };
  // a pick is taken back; a stint the starting five, last period or closers pin the kid in stays pinned
  const take = (id, p) => { for (const i of idxOf.get(p)) if (!base[i].has(id)) forced[i].delete(id); pins[id] = pins[id].filter(x => x !== p); };
  const load = p => Math.max(...idxOf.get(p).map(i => forced[i].size));
  const inStart = (id, p) => !!start && idxOf.get(p).every(i => start[i].includes(id));
  const owned = id => elig.filter(p => has(id, p));

  const want = {};
  const owed = {};
  for (const id of avail) if (c.fullPeriods[id] > 0) { owed[id] = c.fullPeriods[id]; want[id] = Math.min(owed[id], elig.length); }
  const order = Object.keys(want).map(id => [rng(), id]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  for (const id of order) {
    const q = c.fullFinish[id];
    if (q == null || !idxOf.get(q).length) continue;
    if (has(id, q) || can(id, q)) {
      if (!has(id, q)) put(id, q);
      owed[id] -= 1;
      want[id] = Math.min(owed[id], elig.length);
    }
  }
  /* Plays at most N in a row: how far past the limit the kid's pinned run (in
     stints, across breaks) would go with period `p` added. 0 with no limit. One
     period longer than the limit on its own is a conflict between the rules; it
     is picked anyway and the rest warnings say so. */
  const runOver = (id, p) => {
    if (!c.maxConsecutive) return 0;
    const added = new Set(idxOf.get(p));
    let run = 0, best = 0;
    stints.forEach((s, i) => { run = forced[i].has(id) || added.has(i) ? run + 1 : 0; best = Math.max(best, run); });
    return Math.max(0, best - c.maxConsecutive);
  };
  const pick = (id) => {
    // the period a kid was kept on to finish (#535) is one they own: its half is taken
    const finished = c.fullFinish[id] != null && has(id, c.fullFinish[id]) ? [c.fullFinish[id]] : [];
    const mine = [...owned(id), ...finished].map(p => half.get(p));
    const options = elig.filter(p => can(id, p)).map(p => [runOver(id, p), mine.includes(half.get(p)) ? 1 : 0, load(p), inStart(id, p) ? 0 : 1, rng(), p]);
    options.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
    return options.length ? options[0][5] : null;
  };
  const repair = (id) => {
    for (const p of elig) {
      if (has(id, p) || can(id, p)) continue;
      for (const y of Object.keys(pins)) {
        if (y === id || !pins[y].includes(p)) continue;
        for (const q of elig) {
          take(y, p);
          if (q !== p && can(y, q)) {
            put(y, q);
            if (can(id, p)) { put(id, p); return true; }
            take(y, q);
          }
          put(y, p);
        }
      }
    }
    return false;
  };
  const stuck = new Set();
  for (let round = 1; ; round++) {
    let any = false;
    for (const id of order) {
      if (stuck.has(id) || owned(id).length >= want[id]) continue;
      any = true;
      const p = pick(id);
      if (p != null) put(id, p);
      else if (!repair(id)) stuck.add(id);
    }
    if (!any) break;
  }
  const short = order.filter(id => owned(id).length < owed[id]).map(id => ({ id, need: owed[id], got: owned(id).length }));
  return { pins, short };
}

function buildForced(stints, c, format) {
  const forced = stints.map(() => new Set());
  if (c.openingFive.length) for (const id of c.openingFive) forced[0].add(id);
  if (c.lastPeriodFive.length) {
    const i = lastPeriodStintIndex(stints, format.periods);
    if (i >= 0) for (const id of c.lastPeriodFive) forced[i].add(id);
  }
  // closers: the same group holds the floor for the last N stints
  if (c.closing && c.closing.players.length) {
    const from = Math.max(0, stints.length - c.closing.stints);
    for (let i = from; i < stints.length; i++) for (const id of c.closing.players) forced[i].add(id);
  }
  // #450: a kid's full periods, picked by `assignFullPeriods`, are pinned like any other group
  for (const [id, periods] of Object.entries(c.fullPins || {})) {
    stints.forEach((s, i) => { if (periods.includes(s.period)) forced[i].add(id); });
  }
  return forced;
}

/* Per kid, the minutes they are pinned to from stint i onward: `.get(id)[i]`,
   with a 0 at index stints.length. A stint two groups pin counts once. The one
   place pinned minutes are summed (#436): feasibility reads index 0, greedy
   reads the stints after the current one. */
function pinnedAhead(forced, stints) {
  const ahead = new Map();
  forced.forEach((set, i) => {
    for (const id of set) if (!ahead.has(id)) ahead.set(id, new Array(stints.length + 1).fill(0));
  });
  for (const [id, row] of ahead) {
    for (let i = stints.length - 1; i >= 0; i--) row[i] = row[i + 1] + (forced[i].has(id) ? stints[i].minutes : 0);
  }
  return ahead;
}

/* Each pin group on its own, run through buildForced so which stints it pins
   is still decided there. `say` is the coach's own words for it. */
function pinGroups(stints, c, periods) {
  const none = { openingFive: [], lastPeriodFive: [], closing: null, fullPins: {} };
  return [
    ['OPENING_MISSED', 'is set to start', 'Starting five', false, { openingFive: c.openingFive }],
    ['LAST_PERIOD_MISSED', 'is set to start the last period', 'Starts the last period', false, { lastPeriodFive: c.lastPeriodFive }],
    ['CLOSER_MISSED', 'is set to close', 'Closers', true, { closing: c.closing }],
    ['FULL_PERIOD_MISSED', `is set to play a whole ${periodNoun(periods)}`, `Whole ${periodNoun(periods, 2)}`, true, { fullPins: c.fullPins }],
  ].map(([code, say, name, plural, only]) => ({ code, say: say.replace(/^is /, ''), verb: say, name, plural,
    forced: buildForced(stints, { ...none, ...only }, { periods }) }));
}

/* The warnings for pins the search still missed: one per group, naming
   everyone left out. Platoon applies no pins, so it has none. */
export function missedPinIssues({ stints, c, periods, lineups, avail, platoon, order, label }) {
  if (platoon) return [];
  const out = [];
  for (const { code, verb, forced } of pinGroups(stints, c, periods)) {
    const missed = avail.filter(id => forced.some((set, i) => set.has(id) && !lineups[i].includes(id)));
    if (!missed.length) continue;
    const one = missed.length === 1;
    out.push({
      severity: 'warn', code, playerIds: missed,
      message: `${andList(missed.map(label))} ${one ? verb : verb.replace('is', 'are')} but ${one ? 'is' : 'are'} not on the floor for it — ${order ? 'the order does not put them there' : 'no legal lineup kept them there'}.`,
    });
  }
  return out;
}

// Units alternate wholesale. No search: the coach has already decided.
function platoonLineups(ctx, units) {
  // by the stint's number in the whole game, which is its own position unless
  // the solver was handed a suffix (a mid-game re-plan) -- then it is `index`
  return ctx.stints.map((s, i) => units[(s.index ?? i) % units.length].slice(0, ON_FLOOR));
}

/* The strategies a game can be on. state.js's `STRATEGIES` keys the same
   five with their words (a guard in test/analytics.test.js holds the two
   together); storage.js and analytics.js read the list from here. */
export const STRATEGY_KEYS = ['balanced', 'minutes', 'closers', 'platoon', 'order'];

/* Platoon and Order are the two strategies where the coach's own list decides
   the fives, so the search, the pins that choose who plays and the plays-in
   rule are all left out of them. One answer, read by `generatePlan` and by
   state.js. */
export const fivesAreSet = strategy => strategy === 'platoon' || strategy === 'order';

/* Rotation order (#545): the circle is the available players in the coach's
   order, turned so the first stint's lead is first. Stint j puts on the five
   at positions j*c .. j*c+4, counted round the circle, where c is Players
   changing at once; the stints handed in are the ones counted, so a re-plan's
   suffix starts where its circle does. A player the order leaves out joins
   the end. */
export function orderChanges(maxSubs) {
  const n = Number(maxSubs);
  return Number.isFinite(n) ? Math.max(1, Math.min(ON_FLOOR, Math.trunc(n))) : DEFAULT_MAX_SUBS;
}
/* The one formula for who is on at stint `j`: the places j*c .. j*c+4, counted
   round a circle of `n`. `orderLineups` seats the circle's players there and
   `buildOrder` counts the minutes each place plays. */
const placesOn = (n, c, j) => Array.from({ length: ON_FLOOR }, (_, t) => (j * c + t) % n);
function orderLineups(ctx, order, avail) {
  const here = new Set(avail);
  const circle = [...new Set([...(order || []).filter(id => here.has(id)), ...avail])];
  const n = circle.length, c = orderChanges(ctx.maxSubs);
  return ctx.stints.map((s, j) => placesOn(n, c, j).map(k => circle[k]));
}

/* One quantizer for "who is ahead": a hundredth of a minute, so season shares
   that differ by arithmetic noise tie. `tieBreakOrder` and `buildOrder` both
   read priority through it, and so can never disagree on what a tie is. */
const quantizePriority = value => Math.round((Number(value) || 0) * 100);

/* #547: the list Order builds for a coach who has not set one. `ids` are the
   players here in roster order, `priority` the one number per kid `solveDay`
   composes from the odd minutes setting (higher plays more), and `constraints`
   the composed ones. Spot k plays every stint whose five takes place k, so the
   list decides who plays how long; the search seats kids in spots to score
   best. Score = 1e6 x what the rules cost in minutes + the preference cost, so
   a rule always beats a preference. Start: kids by priority against spots by
   minutes. Search: best swap until none improves, then every three-way turn
   once, with a fixed cap on scores worked out -- never a clock -- so the same
   input always gives the same list. Returns `{ order, short }`, `short` being
   the rules the final list breaks as `{ kind, ids }`.

   #557: `mix` is a map of kid id -> level, passed only when the coach chose
   Mix the fives. When the levels differ, the score becomes 1e6 x rules + V +
   pref / (1 + n^2 M^2): V is the minutes-weighted variance of the fives'
   strength (a five's strength is the sum of its kids' levels) times the game's
   minutes M, so the fives are made even first and the preference only chooses
   between lists that are equally even. The restarts then run whether or not a
   rule is broken. With `mix` absent, or every kid at one level, none of this
   runs and the list is the one above, evaluation for evaluation. */
/* The divisor that keeps the preference behind evenness. Levels are whole
   numbers and every stint is a multiple of a grain 1/d minutes (d found below),
   so with T = M x d whole grains V = (T sum q v^2 - (sum q v)^2) / (d T): its
   smallest nonzero step is 1/(d^2 M). The preference, a weight under n times
   the 5 M seat-minutes, is at most 5 n M. Dividing by 5 n d^2 M^2 puts all of
   it under one step. Whole-minute stints (d = 1) with n >= 5 need less than the
   n^2 M^2 the default always used, so that stays the floor and those scores
   are unchanged. */
export function mixTieDivisor(n, minutes) {
  const M = minutes.reduce((a, m) => a + m, 0);
  let d = 1;
  while (d < 720 && !minutes.every(m => Math.abs(m * d - Math.round(m * d)) < 1e-9)) d++;
  return 1 + Math.max(n * n * M * M, 5 * n * d * d * M * M);
}
export const BUILD_CAP = 12000;
export function buildOrder({ ids, stints, maxSubs, priority = {}, constraints: c = {}, periods, cap = BUILD_CAP, mix }) {
  const n = ids.length;
  if (n < 2) return { order: [...ids], short: [], evals: 0 };
  const change = orderChanges(maxSubs);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const seats = stints.map((s, j) => placesOn(n, change, j));
  const floor = seats.map(places => { const row = Array(n).fill(false); for (const k of places) row[k] = true; return row; });
  const on = (k, j) => (floor[j][k] ? 1 : 0);
  // the caller passes `tierOfPlayer` levels, so a kid with no entry is the only one defaulted
  const levels = mix ? ids.map(id => (mix[id] === undefined ? DEFAULT_TIER : mix[id])) : null;
  const gameMinutes = stints.reduce((a, s) => a + s.minutes, 0);
  // no minutes, no evenness to measure
  const mixing = !!levels && gameMinutes > 0 && levels.some(v => v !== levels[0]);
  const mins = Array.from({ length: n }, (_, k) => stints.reduce((a, s, j) => a + on(k, j) * s.minutes, 0));
  // minutes spots k and l share, both on (`both`) or both off
  const share = (k, l, both) => stints.reduce((a, s, j) => a + (!!on(k, j) === both && !!on(l, j) === both ? s.minutes : 0), 0);
  const matrix = both => Array.from({ length: n }, (_, k) => Array.from({ length: n }, (_, l) => share(k, l, both)));
  const together = matrix(true), bothOff = matrix(false);
  let fewestApart = Infinity;
  for (let k = 0; k < n; k++) for (let l = k + 1; l < n; l++) {
    fewestApart = Math.min(fewestApart, mins[k] + mins[l] - 2 * together[k][l]);
  }
  const pairs = list => (list || []).map(([a, b]) => [idx.get(a), idx.get(b)]).filter(([a, b]) => a != null && b != null && a !== b);
  const avoids = pairs(c.avoids), glued = pairs(c.pairs), oneOf = pairs(c.keepOnFloor);
  const lastAt = (c.lastPeriodFive || []).length ? lastPeriodStintIndex(stints, periods) : -1;
  const lastKids = lastAt < 0 ? [] : (c.lastPeriodFive || []).map(id => idx.get(id)).filter(k => k != null);
  const kidMin = ids.map(id => Number(c.minMinutes?.[id]) || 0);
  const kidMax = ids.map(id => c.maxMinutes?.[id] ?? Infinity);

  // kids by priority, a tie group sharing one weight: how many have strictly less
  const prio = k => quantizePriority(priority[ids[k]]);
  const groups = [];
  for (const k of Array.from({ length: n }, (_, i) => i).sort((a, b) => prio(b) - prio(a) || a - b)) {
    const last = groups[groups.length - 1];
    if (last && prio(last[0]) === prio(k)) last.push(k);
    else groups.push([k]);
  }
  const weight = Array(n).fill(0);
  let placed = 0;
  for (const group of groups) {
    placed += group.length;
    for (const k of group) weight[k] = n - placed;
  }

  // start: each tie group takes the next block of the most-minutes spots, in spot order
  const spots = Array.from({ length: n }, (_, k) => k).sort((a, b) => mins[b] - mins[a] || a - b);
  let perm = Array(n).fill(0);
  let next = 0;
  for (const group of groups) {
    const block = spots.slice(next, next + group.length).sort((a, b) => a - b);
    next += group.length;
    [...group].sort((a, b) => a - b).forEach((kid, i) => { perm[block[i]] = kid; });
  }

  /* The score of a list, rule minutes first. `parts` is filled only when
     asked, with what the list leaves unmet. Under Mix this runs thousands of
     times, so it allocates nothing: the seats, minutes and strengths are flat
     typed arrays, and `add` is made once. */
  const pos = Array(n).fill(0);
  let evals = 0;
  const S = stints.length;
  const seatAt = new Int16Array(mixing ? S * ON_FLOOR : 0);
  const stintMin = Float64Array.from(stints, s => s.minutes);
  const strength = new Float64Array(S);
  if (mixing) for (let j = 0; j < S; j++) for (let t = 0; t < ON_FLOOR; t++) seatAt[j * ON_FLOOR + t] = seats[j][t];
  const tieDivisor = mixTieDivisor(n, stintMin);
  let rule = 0, ask = null;
  const add = (amount, kind, a, b) => {
    rule += amount;
    if (ask && amount > 1e-9) ask.push({ kind, ids: b < 0 ? [ids[a]] : [ids[a], ids[b]] });
  };
  const cost = (list, parts) => {
    for (let k = 0; k < n; k++) pos[list[k]] = k;
    rule = 0; ask = parts || null;
    let pref = 0;
    for (let k = 0; k < n; k++) {
      const kid = list[k];
      add(Math.max(0, kidMin[kid] - mins[k]), 'minimum', kid, -1);
      add(Math.max(0, mins[k] - kidMax[kid]), 'cap', kid, -1);
      pref -= weight[kid] * mins[k];
    }
    for (let i = 0; i < avoids.length; i++) { const a = avoids[i][0], b = avoids[i][1]; add(together[pos[a]][pos[b]], 'apart', a, b); }
    for (let i = 0; i < glued.length; i++) { const a = glued[i][0], b = glued[i][1]; add(mins[pos[a]] + mins[pos[b]] - 2 * together[pos[a]][pos[b]] - fewestApart, 'together', a, b); }
    for (let i = 0; i < oneOf.length; i++) { const a = oneOf[i][0], b = oneOf[i][1]; add(bothOff[pos[a]][pos[b]], 'keepon', a, b); }
    if (lastAt >= 0) for (let i = 0; i < lastKids.length; i++) add(on(pos[lastKids[i]], lastAt) ? 0 : stints[lastAt].minutes, 'lastq', lastKids[i], -1);
    evals++;
    if (!mixing) return rule * 1e6 + pref;
    // V: minutes-weighted variance of the fives' strength, times the game's minutes
    let weighted = 0;
    for (let j = 0; j < S; j++) {
      let sum = 0;
      for (let t = 0; t < ON_FLOOR; t++) sum += levels[list[seatAt[j * ON_FLOOR + t]]];
      strength[j] = sum;
      weighted += sum * stintMin[j];
    }
    const mean = weighted / gameMinutes;
    let spread = 0;
    for (let j = 0; j < S; j++) spread += stintMin[j] * (strength[j] - mean) ** 2;
    return rule * 1e6 + spread + pref / tieDivisor;
  };

  let score = cost(perm);
  const EPS = 1e-7;
  /* Moves are rows of (i, j, k, flip): a swap has k = -1, a three-way turn
     the rest. Each is tried in one scratch list and copied only on a strict
     gain, so a scan allocates nothing. */
  const swaps = [], turns = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    swaps.push([i, j, -1, 0]);
    for (let k = j + 1; k < n; k++) turns.push([i, j, k, 0], [i, j, k, 1]);
  }
  const cand = Array(n).fill(0), top = Array(n).fill(0);
  const make = ([i, j, k, flip]) => {
    for (let x = 0; x < n; x++) cand[x] = perm[x];
    if (k < 0) { cand[i] = perm[j]; cand[j] = perm[i]; }
    else if (flip) { cand[i] = perm[k]; cand[j] = perm[i]; cand[k] = perm[j]; }
    else { cand[i] = perm[j]; cand[j] = perm[k]; cand[k] = perm[i]; }
  };
  /* The best of `moves` that beats the score now, or null. Scan order is
     fixed and only a strict gain counts. */
  const best = moves => {
    let found = false, topScore = score - EPS;
    for (let m = 0; m < moves.length; m++) {
      if (evals >= cap) break;
      make(moves[m]);
      const s = cost(cand);
      if (s < topScore) { for (let x = 0; x < n; x++) top[x] = cand[x]; found = true; topScore = s; }
    }
    return found && { list: top.slice(), score: topScore };
  };
  const descend = () => {
    while (evals < cap) {
      const step = best(swaps) || best(turns);
      if (!step) break;
      perm = step.list;
      score = step.score;
    }
  };
  descend();
  /* A search that ends still breaking a rule may only be stuck: two kids that
     must both move to separate may need two moves at once. Start again from
     the list turned round by one place, then two, and so on -- the same
     seeds in the same order every time -- and keep the best. Only while a
     rule is broken and the cap allows, so a list that meets every rule is
     never looked at twice. Under Mix they run regardless (#557). */
  let winner = perm, winnerScore = score;
  for (let turn = 1; turn < n && (mixing || winnerScore >= 1e6 - EPS) && evals < cap; turn++) {
    perm = winner.map((_, k) => winner[(k + turn) % n]);
    score = cost(perm);
    descend();
    if (score < winnerScore - EPS) { winner = perm; winnerScore = score; }
  }
  perm = winner;

  const searched = evals;
  const short = [];
  cost(perm, short);
  evals = searched;
  return { order: perm.map(k => ids[k]), short, evals };
}

/* The one note a built list writes when no list meets every rule. A part with
   `each` is one per pair; the others gather every kid into one part. */
const SHORT_PARTS = [
  ['apart', names => `keep ${andList(names)} apart`, true],
  ['together', names => `keep ${andList(names)} together more`, true],
  ['minimum', names => `give ${andList(names)} their minimum`, false],
  ['cap', names => `keep ${andList(names)} to their most minutes`, false],
  ['keepon', names => `keep ${names.join(' or ')} on the floor`, true],
  ['lastq', names => `start ${andList(names)} in the last period`, false],
];
export function orderShortNote(short, label) {
  if (!short.length) return null;
  const parts = [];
  for (const [kind, say, each] of SHORT_PARTS) {
    const of = short.filter(s => s.kind === kind);
    if (each) parts.push(...of.map(s => say(s.ids.map(label))));
    else if (of.length) parts.push(say(of.flatMap(s => s.ids).map(label)));
  }
  return { severity: 'warn', code: 'ORDER_BUILT_SHORT', playerIds: [...new Set(short.flatMap(s => s.ids))],
    message: `No order meets every rule, so this list comes closest. It can't ${andList(parts)}.` };
}

/* `held`: minutes this player is pinned to in later stints. Seating them in an
   unpinned stint is legal only if those still fit under the cap (#436). */
function legalWith(id, chosen, ctx, minutes, stintLen, onStreak, held = 0) {
  if (minutes[id] + stintLen + held > ctx.capOf(id) + 1e-9) return false;
  // a player who has already held the floor for the maximum run has to sit
  if (ctx.maxConsecutive && onStreak && onStreak[id] >= ctx.maxConsecutive) return false;
  for (const other of chosen) {
    if (ctx.avoidSet.has(pairKey(id, other))) return false;
  }
  return true;
}

/* The change limit cannot hold beside Sits at most m: the entries over any m
   breaks must cover the n - 5 who sat, and maxSubs a break is too few. */
const MAX_BENCH_LIMIT = 4;   // the Sits at most stepper's top, rules.js
const benchNeedOn = (lim, S) => Math.max(0, Math.ceil((S - lim) / (lim + 1)));
/* The rule cannot hold when the game has too few floor seats for everyone's
   required stints, or when some m+1 stints in a row have fewer than n seats. */
const benchTotalShort = (m, n, S) => S > m && n * benchNeedOn(m, S) > ON_FLOOR * S;
const benchWindowShort = (m, n, S) => S > m && n > ON_FLOOR * (m + 1);
function benchOutrunsChanges(m, maxSubs, n, S) {
  return S > m && maxSubs > 0 && maxSubs * m < n - ON_FLOOR;
}

/* The most minutes one player can play with no run longer than `limit`
   stints: a small DP over the stint lengths, so unequal stints are exact. */
function mostMinutesUnderRun(lens, limit) {
  let dp = new Array(limit + 1).fill(-Infinity);   // dp[k]: best so far, k in a row
  dp[0] = 0;
  for (const len of lens) {
    const next = new Array(limit + 1).fill(-Infinity);
    next[0] = Math.max(...dp);
    for (let k = 0; k < limit; k++) next[k + 1] = dp[k] + len;
    dp = next;
  }
  return Math.max(...dp);
}

/* Stints in a row `id` has played, counting back from lineups[end]. `on` false
   counts the stints sat in a row instead (#441): one counter for both kinds. */
export function runEndingAt(lineups, id, end, lead = 0, on = true) {
  let run = 0, j = end;
  for (; j >= 0 && lineups[j].includes(id) === on; j--) run++;
  return j < 0 ? run + lead : run;
}

/* `lead`: stints in a row already played before lineups[0] (#442). It only
   extends a run that starts at stint 0, and `best` moves only when the kid is
   on the floor, so a past run never counts by itself. */
/* The one wording of a run over its limit: `verb` is 'plays' (CONSEC_EXCEEDED)
   or 'sits' (BENCH_EXCEEDED). The notes the engine writes and the ones the app
   rebuilds from the fives on screen (#456, #534) both come from here. */
export const runOverSentence = (name, verb, run, limit, order = false) =>
  `${name} ${verb} ${run} stints in a row against a limit of ${limit} — ${order
    ? `the order keeps them ${verb === 'plays' ? 'on the floor' : 'on the bench'}`
    : 'no legal lineup kept them under it'}.`;

export function longestRun(lineups, id, lead = 0, on = true) {
  let run = lead, best = 0;
  for (const lu of lineups) { if (lu.includes(id) === on) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
}

function greedy(ctx, forcedByStint, rng) {
  const { stints, avail } = ctx;
  const minutes = {};
  const sitStreak = {};   // stints sat in a row; with Sits at most, seeded with the run at the cut
  const onStreak = {};
  for (const id of avail) { minutes[id] = 0; sitStreak[id] = ctx.sitLeadOf(id); onStreak[id] = ctx.leadOf(id); }

  const ahead = pinnedAhead(forcedByStint, stints);
  const span = ctx.benchSpan;
  const lineups = [];
  let prev = null;
  let elapsed = 0;

  for (let s = 0; s < stints.length; s++) {
    const len = stints[s].minutes;
    const remainingAfter = stints.slice(s + 1).reduce((a, x) => a + x.minutes, 0);

    // pinned minutes still ahead are held back from an unpinned seat's cap
    const held = id => (forcedByStint[s].has(id) ? 0 : ahead.get(id)?.[s + 1] ?? 0);

    const chosen = [];
    for (const id of forcedByStint[s]) {
      if (chosen.length < ON_FLOOR && legalWith(id, chosen, ctx, minutes, len, null)) chosen.push(id);
    }

    // Anyone whose remaining minimum no longer fits in the stints left after
    // this one has to go in now.
    for (const id of avail) {
      if (chosen.length >= ON_FLOOR || chosen.includes(id)) continue;
      const need = ctx.minOf(id) - minutes[id];
      if (need > 0 && need > remainingAfter && legalWith(id, chosen, ctx, minutes, len, onStreak, held(id))) chosen.push(id);
    }

    // Sits at most: whoever has sat the limit goes in now, if the rules allow
    const atBenchLimit = new Set();
    if (ctx.maxBench && s < span) {
      // more at the limit than seats: longest sit first, so the same late-roster kid is not always left over
      const due = avail.filter(id => sitStreak[id] >= ctx.maxBench).sort((a, b) => sitStreak[b] - sitStreak[a]);
      for (const id of due) {
        if (chosen.length >= ON_FLOOR || chosen.includes(id)) continue;
        if (legalWith(id, chosen, ctx, minutes, len, onStreak, held(id))) { chosen.push(id); atBenchLimit.add(id); }
      }
    }

    const scores = {};
    const frac = (elapsed + len) / ctx.gameMinutes;
    for (const id of avail) {
      const deficit = ctx.targets.get(id) * frac - minutes[id];
      let sc = deficit * 10;
      if (sitStreak[id] >= 1) sc += 8;
      if (sitStreak[id] >= 2) sc += 30;
      if (ctx.minOf(id) - minutes[id] > 0) sc += 4;
      sc += rng() * 0.5;
      scores[id] = sc;
    }

    const pool = avail
      .filter(id => !chosen.includes(id))
      .sort((a, b) => scores[b] - scores[a]);
    // #449: the previous plan's five for this stint, tried first (stable: by score within each half)
    if (ctx.start) {
      const wanted = new Set(ctx.start[s]);
      pool.sort((a, b) => wanted.has(b) - wanted.has(a));
    }

    for (const id of pool) {
      if (chosen.length >= ON_FLOOR) break;
      let bonus = 0;
      for (const [a, b] of ctx.pairs) {
        if ((a === id && chosen.includes(b)) || (b === id && chosen.includes(a))) bonus += 6;
      }
      if (bonus) scores[id] += bonus;
      if (legalWith(id, chosen, ctx, minutes, len, onStreak, held(id))) chosen.push(id);
    }

    // If caps or avoids starved the lineup, fall back to anyone legal on avoids
    // alone -- an under-filled floor is worse than a busted cap, and the cap
    // shortfall gets surfaced as a warning at the end.
    if (chosen.length < ON_FLOOR) {
      // kids with pinned minutes still ahead come last: they are the ones a cap would starve
      const fallback = [...pool].sort((a, b) => (held(a) > 0) - (held(b) > 0));
      for (const id of fallback) {
        if (chosen.length >= ON_FLOOR) break;
        if (chosen.includes(id)) continue;
        if (chosen.every(o => !ctx.avoidSet.has(pairKey(id, o)))) chosen.push(id);
      }
    }

    const stay = atBenchLimit.size ? new Set([...forcedByStint[s], ...atBenchLimit]) : forcedByStint[s];
    const repaired = repairChurn(prev, chosen, scores, stay, ctx, minutes, len, onStreak, held);

    for (const id of avail) {
      if (repaired.includes(id)) { minutes[id] += len; sitStreak[id] = 0; onStreak[id] += 1; }
      else { sitStreak[id] += 1; onStreak[id] = 0; }
    }

    lineups.push(repaired);
    prev = repaired;
    elapsed += len;
  }

  return lineups;
}

// Keep continuity on the floor: swap newcomers back out for holdovers until the
// number of changes lands inside [minSubs, maxSubs].
function repairChurn(prev, chosen, scores, forced, ctx, minutes, len, onStreak, held) {
  if (!prev) return chosen;
  const sel = chosen.slice();
  const maxSubs = ctx.maxSubs;
  const minSubs = Math.min(ctx.minSubs, Math.max(0, ctx.avail.length - ON_FLOOR));

  const churn = () => sel.filter(id => !prev.includes(id)).length;

  let guard = 0;
  while (churn() > maxSubs && guard++ < 20) {
    const newcomers = sel.filter(id => !prev.includes(id) && !forced.has(id))
      .sort((a, b) => scores[a] - scores[b]);
    const holdovers = prev.filter(id => !sel.includes(id))
      .sort((a, b) => scores[b] - scores[a]);
    let done = false;
    for (const out of newcomers) {
      for (const back of holdovers) {
        const trial = sel.filter(id => id !== out);
        if (legalWith(back, trial, ctx, minutes, len, onStreak, held(back))) {
          sel.splice(sel.indexOf(out), 1, back);
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done) break;
  }

  guard = 0;
  while (churn() < minSubs && guard++ < 20) {
    const bench = ctx.avail.filter(id => !sel.includes(id))
      .sort((a, b) => scores[b] - scores[a]);
    const droppable = sel.filter(id => !forced.has(id))
      .sort((a, b) => scores[a] - scores[b]);
    let done = false;
    for (const out of droppable) {
      for (const inc of bench) {
        const trial = sel.filter(id => id !== out);
        if (legalWith(inc, trial, ctx, minutes, len, onStreak, held(inc))) {
          sel.splice(sel.indexOf(out), 1, inc);
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done) break;
  }

  return sel;
}

/* ------------------------------------------------------------------ *
 * local search
 * ------------------------------------------------------------------ */
// Each player's achievable share, water-filled around caps, minimums and
// carryover credit. Scoring against this instead of raw max-minus-min matters:
// a single capped player otherwise anchors the minimum and blinds the optimizer
// to real imbalance among everyone else.
function computeTargets(ctx) {
  const floorMinutes = ctx.gameMinutes * ON_FLOOR;
  const targets = new Map();
  let pool = ctx.avail.slice();
  let remaining = floorMinutes;

  // A minute target set by the coach is a pin, not a preference. Everyone
  // else water-fills whatever floor-time is left over.
  for (const id of pool.slice()) {
    const t = ctx.targetOf(id);
    if (t == null) continue;
    targets.set(id, t);
    remaining -= t;
    pool = pool.filter(x => x !== id);
  }

  for (let iter = 0; iter < 12 && pool.length; iter++) {
    const creditSum = pool.reduce((a, id) => a + ctx.credit[id], 0);
    const base = (remaining - creditSum) / pool.length;
    let changed = false;
    for (const id of pool.slice()) {
      const want = base + ctx.credit[id];
      const lo = ctx.minOf(id);
      const hi = ctx.capOf(id);
      if (want < lo - 1e-9) { targets.set(id, lo); remaining -= lo; pool = pool.filter(x => x !== id); changed = true; }
      else if (want > hi + 1e-9) { targets.set(id, hi); remaining -= hi; pool = pool.filter(x => x !== id); changed = true; }
    }
    if (!changed) break;
  }
  if (pool.length) {
    const creditSum = pool.reduce((a, id) => a + ctx.credit[id], 0);
    const base = (remaining - creditSum) / pool.length;
    for (const id of pool) targets.set(id, base + ctx.credit[id]);
  } else if (remaining > 1e-9) {
    /* Everybody is pinned and the asks fall short of the floor.
     *
     * The surplus has to land somewhere -- five players are on the court
     * whether the targets say so or not. Left alone the target cost is flat
     * across every way of placing it, so the spread term breaks the tie and
     * pushes the SMALLEST ask up: dial a player to 4 minutes and they play 8,
     * which is the opposite of what was asked for.
     *
     * Sharing it in proportion to the asks keeps a small ask small, and -- the
     * part that actually makes it work -- brings the targets back to summing to
     * the floor, which is the condition under which the solver honours them at
     * all. A locked row is excluded and keeps exactly what the coach dialled
     * in; that is what the lock now means.
     *
     * Clamped to each player's cap, because a cap is a promise and a share of
     * the surplus is not. */
    const open = ctx.avail.filter(id => !ctx.lockedSet.has(id));
    const share = open.reduce((a, id) => a + Math.max(0, targets.get(id)), 0);
    const spread = share > 1e-9 ? open : ctx.avail;
    const weight = share > 1e-9
      ? id => Math.max(0, targets.get(id)) / share
      : () => 1 / spread.length;
    for (const id of spread) {
      targets.set(id, Math.min(targets.get(id) + remaining * weight(id), ctx.capOf(id)));
    }
  }
  return targets;
}

/* ------------------------------------------------------------------ *
 * the tie-break: who gets the odd stint
 *
 * Eight 4-minute stints is forty slots. Eleven players cannot have forty
 * slots each; seven of them play 16 minutes and four play 12, and the
 * minutes term in `cost` is EXACTLY flat across every choice of which
 * seven -- move a player from the high side to the low side and swap
 * someone the other way and the total deviation is unchanged to the last
 * decimal. Something has to settle it, and until now the something was
 * whatever term happened to be left standing: the tiers. Four minutes a
 * game over a twelve-game season is a game and a half of playing time,
 * decided by a control sold as balancing lineups.
 *
 * So it is settled deliberately instead, by the one thing that is
 * self-correcting: how far each player is off their share of the season,
 * then how little they have played today, then a seeded rotation so game
 * one of a fresh season does not pick the same four children every week.
 * The engine is handed that as a NUMBER per player and nothing else -- it
 * is not told what the number means, and it never sees a level. A
 * stable-arbitrary tie-break was the obvious alternative and was rejected:
 * the same child lands short week after week by roster position, which is
 * the exact complaint the season feature exists to answer.
 *
 * The mechanism is a nudge on the minute TARGETS, not a new cost term: the
 * objective is untouched, and a flat landscape simply stops being flat.
 * The size is chosen to be decisive and nothing more. A whole ramp end to
 * end is a tenth of a minute, so the largest swing it can produce anywhere
 * in the cost function is 12 -- under the 20 a missed sub is worth, under
 * the 25 a soft pair is worth, under the 30 a double sit is worth, and two
 * orders of magnitude under a floor, a cap or a locked target at 1000. It
 * decides what nothing else has an opinion about, and loses every argument
 * it is ever in.
 *
 * Anyone the coach has spoken for is left out entirely: a hand-set target,
 * a locked row, or a target already sitting on its own floor or cap. Their
 * number means something, and a nudge on it would be this feature quietly
 * moving a number the coach set.
 * ------------------------------------------------------------------ */
const TIE_BREAK_NUDGE = 0.05;

function tieBreakOrder(ctx, priority, seed) {
  /* The seeded rotation, laid down first so it is the tie-break of the
     tie-break. Its own seed is derived from the plan's, so a reseed varies it
     and an identical input never does. */
  const rot = makeRng(((seed >>> 0) ^ 0x5bf03635) >>> 0);
  const base = ctx.avail
    .map(id => ({ id, k: rot() }))
    .sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : 1))
    .map(x => x.id);

  /* Quantized to a hundredth of a minute before it is compared. Season shares
     are averages and land on values like 0.0000000004 apart; sorting on the
     raw float would let arithmetic noise outrank the rotation. */
  const q = id => quantizePriority(priority && priority[id]);
  return base
    .map((id, i) => ({ id, r: q(id), i }))
    .sort((a, b) => (b.r - a.r) || (a.i - b.i))
    .map(x => x.id);
}

function applyTieBreak(ctx, priority, seed) {
  const free = new Set(ctx.avail.filter(id => {
    if (ctx.targetOf(id) != null || ctx.lockedSet.has(id)) return false;
    const t = ctx.targets.get(id);
    return t > ctx.minOf(id) + TIE_BREAK_NUDGE && t < ctx.capOf(id) - TIE_BREAK_NUDGE;
  }));
  if (free.size < 2) return;
  const order = tieBreakOrder(ctx, priority, seed).filter(id => free.has(id));
  const n = order.length;
  // a symmetric ramp: it sums to zero, so the targets still add up to the floor
  order.forEach((id, i) => {
    ctx.targets.set(id, ctx.targets.get(id) + TIE_BREAK_NUDGE * (1 - (2 * i) / (n - 1)));
  });
}

function minutesOf(lineups, ctx) {
  const m = {};
  for (const id of ctx.avail) m[id] = 0;
  lineups.forEach((lu, i) => { for (const id of lu) m[id] += ctx.stints[i].minutes; });
  return m;
}

/* The per-stint strength each shape is asking for, or null when there is
   nothing to ask: one tier for everybody means every five is worth the same
   and the whole term is a no-op. Computed once, off the minute targets rather
   than off the current lineups, so it is a fixed goal the search moves toward
   instead of a moving average it can satisfy by standing still. */
function balanceTargets(ctx, kind) {
  const shape = BALANCE.includes(kind) ? kind : 'even';
  const tiers = ctx.avail.map(ctx.tierOf);
  if (!tiers.length || Math.min(...tiers) === Math.max(...tiers)) return null;

  // strength of an average five, weighted by how much each player is on for
  const totalMin = ctx.avail.reduce((a, id) => a + ctx.targets.get(id), 0);
  const meanTier = totalMin > 0
    ? ctx.avail.reduce((a, id) => a + ctx.tierOf(id) * ctx.targets.get(id), 0) / totalMin
    : tiers.reduce((a, b) => a + b, 0) / tiers.length;
  const base = 5 * meanTier;

  const best = [...tiers].sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
  const amp = Math.max(0, best - base);
  if (amp < 1e-9) return null;

  const n = ctx.stints.length;
  const f = centered(ctx.stints.map((_, i) => balanceShape(shape, i, n)));
  return f.map(v => base + amp * v);
}

/* A bench stint past the free run length costs this times how far past it is
   (60, then 120, then 180 ...), so one long sit costs more than two short ones
   instead of the same flat 30. It grows because a sit feels worse the longer it
   runs, and a flat charge per stint cannot tell 20 minutes from 8. The free
   length is not a round number but `ctx.sitFree`, taken from the change limit:
   at `maxSubs` changes a break the bench queue is that long whether we like it
   or not, so charging inside it only pushes plans over the limit. */
const LONG_SIT = 60;
/* #449: under every rule term (the smallest is 20), so it only breaks ties; 1 left a no-op cap edit moving seats on 4 of 10 seeds (spec 489). */
const START_WEIGHT = 5;

/* How many come on at break i: ids in lineups[i] not in lineups[i - 1]. */
function changesAt(lineups, i) {
  return lineups[i].filter(id => !lineups[i - 1].includes(id)).length;
}

function cost(lineups, ctx) {
  const m = minutesOf(lineups, ctx);
  let c = 0;
  /* A minute off target costs 60. A minute off a *locked* target costs the
     same as breaking a floor or a cap, because that is what a lock is: the
     coach saying they mean this number.
   *
   * Without the distinction the sit penalty wins the argument on a short
   * roster. Six available and one player asked for 4 minutes means they sit
   * seven stints in a row, and "nobody sits forever" is worth ~180 against the
   * 240 for missing the target -- close enough that the solver split the
   * difference and played them 8. A locked row now settles it. */
  for (const id of ctx.avail) {
    const off = Math.abs(m[id] - ctx.targets.get(id));
    c += off * (ctx.lockedSet.has(id) ? 1000 : 60);
  }

  for (const id of ctx.avail) {
    const short = ctx.minOf(id) - m[id];
    if (short > 0) c += short * 1000;
    const over = m[id] - ctx.capOf(id);
    if (over > 0) c += over * 1000;
  }

  /* A pin is the coach's word: a pinned kid off the floor in a stint they are
     pinned to costs what a busted cap does, so the search repairs the miss
     (#436). Platoon never reaches here, and applies no pins. */
  if (ctx.forced) {
    lineups.forEach((lu, i) => {
      for (const id of ctx.forced[i]) if (!lu.includes(id)) c += ctx.stints[i].minutes * 1000;
    });
  }

  // consecutive sits, and churn outside the sub window
  const streak = {};
  for (const id of ctx.avail) streak[id] = 0;
  for (let i = 0; i < lineups.length; i++) {
    for (const id of ctx.avail) {
      if (lineups[i].includes(id)) streak[id] = 0;
      else {
        streak[id] += 1;
        if (streak[id] >= 2) c += 30;
        if (ctx.shapeSits && streak[id] > ctx.sitFree) c += LONG_SIT * (streak[id] - ctx.sitFree);
      }
    }
    if (i > 0) {
      const subs = changesAt(lineups, i);
      if (subs > ctx.maxSubs) c += (subs - ctx.maxSubs) * 40;
      if (subs < ctx.minSubs) c += (ctx.minSubs - subs) * 20;
    }
  }

  if (ctx.maxConsecutive) {
    for (const id of ctx.avail) {
      const over = longestRun(lineups, id, ctx.leadOf(id)) - ctx.maxConsecutive;
      if (over > 0) c += over * over * 400;
    }
  }

  if (ctx.maxBench) {
    const benched = lineups.slice(0, ctx.benchSpan);
    for (const id of ctx.avail) {
      const over = longestRun(benched, id, ctx.sitLeadOf(id), false) - ctx.maxBench;
      if (over > 0) c += over * over * 400;
    }
  }

  if (ctx.playsIn) c += playsInMissCount(lineups, ctx) * LATE_WEIGHT;   // #451, in place of the halftime term
  else if (ctx.avail.length <= ctx.halfReach) {   // see LATE_WEIGHT
    const on = playedBeforeHalf(lineups, ctx);
    for (const id of ctx.avail) if (!on.has(id)) c += LATE_WEIGHT;
  }

  if (ctx.balanceTargets) {
    for (let i = 0; i < lineups.length; i++) {
      let strength = 0;
      for (const id of lineups[i]) strength += ctx.tierOf(id);
      c += Math.abs(strength - ctx.balanceTargets[i]) * BALANCE_WEIGHT;
    }
  }

  if (ctx.pairs.length) {
    for (const pr of ctx.pairs) {
      const [a, b] = pr;
      let apart = 0;
      lineups.forEach((lu, i) => {
        const ha = lu.includes(a), hb = lu.includes(b);
        if (ha !== hb) apart += ctx.stints[i].minutes;
      });
      c += apart * (isAlways(pr) ? 400 : 25);
    }
  }

  /* "Never both off the court", scored over the SITTING set rather than the
     lineup -- the one thing neither pair term above can say.

     1000 a minute is the weight reserved above for a broken minimum or a
     busted cap, and that is the point: unlike "play together" there is no
     useful weaker reading. A ball handler on the floor most of the time is
     not a ball handler on the floor. So no soft/hard switch, the way `avoids`
     has none, and the arithmetically impossible cases are refused up front by
     KEEPON_UNSATISFIABLE and FORCED_GROUP_KEEPON rather than priced here.

     `avoids` on the same two is not a contradiction and is not flagged as one:
     never both on plus never both off is exactly one of them, always. */
  if (ctx.keepOn.length) {
    for (const [a, b] of ctx.keepOn) {
      let off = 0;
      lineups.forEach((lu, i) => {
        if (!lu.includes(a) && !lu.includes(b)) off += ctx.stints[i].minutes;
      });
      c += off * 1000;
    }
  }

  /* #449: a seat that is not the previous plan's costs START_WEIGHT, so a rule
     edit moves the seats the rule needs and no others. Only when a start is
     given. */
  if (ctx.start) {
    for (let i = 0; i < lineups.length; i++) {
      for (const id of lineups[i]) if (!ctx.start[i].includes(id)) c += START_WEIGHT;
    }
  }

  return c;
}

function swapLegal(lineups, i, outId, inId, ctx, forcedByStint) {
  const lu = lineups[i];
  // The move generators below are lazy, and an accepted move rewrites the
  // lineup while they are still yielding. Re-check against live state or a
  // stale move can swap in someone already on the floor -- which puts the same
  // player on twice and silently fields four.
  if (!lu.includes(outId) || lu.includes(inId)) return false;
  if (forcedByStint[i].has(outId)) return false;
  const trial = lu.filter(id => id !== outId);
  for (const other of trial) if (ctx.avoidSet.has(pairKey(inId, other))) return false;
  return true;
}

// One-for-one inside a single stint. Shifts both players' minute totals, so it
// is the move that fixes minute balance.
function* singleSwaps(cur, ctx, forcedByStint) {
  for (let i = 0; i < cur.length; i++) {
    const bench = ctx.avail.filter(id => !cur[i].includes(id));
    for (const outId of cur[i]) {
      for (const inId of bench) {
        if (!swapLegal(cur, i, outId, inId, ctx, forcedByStint)) continue;
        yield { kind: 'single', i, outId, inId };
      }
    }
  }
}

// Trade two players' places across two stints. Minute totals are unchanged, so
// this is the only way to improve pairing, sit patterns or continuity once the
// minutes are already even -- a single swap would break the balance and cost
// more than it saves.
function* exchangeSwaps(cur, ctx, forcedByStint) {
  for (let i = 0; i < cur.length; i++) {
    for (let j = i + 1; j < cur.length; j++) {
      /* "Minute totals are unchanged" is only true when the two stints are the
         same length -- trading a 4-minute stint for a 6-minute one moves four
         minutes off one player and six onto the other. Ordinarily that is a
         legal move like any other; in the minute-neutral pass below it is not,
         so the pass filters here rather than re-deriving the rule. */
      if (ctx.neutralOnly && Math.abs(ctx.stints[i].minutes - ctx.stints[j].minutes) > 1e-9) continue;
      for (const u of cur[i]) {
        if (cur[j].includes(u)) continue;
        for (const v of cur[j]) {
          if (cur[i].includes(v)) continue;
          if (!swapLegal(cur, i, u, v, ctx, forcedByStint)) continue;
          if (!swapLegal(cur, j, v, u, ctx, forcedByStint)) continue;
          yield { kind: 'exchange', i, j, u, v };
        }
      }
    }
  }
}

/* Same live-lineup legality as swapLegal, for a move that replaces two players
   at once: every out is on and not pinned, no in is already on, no Apart pair. */
function replaceLegal(lu, outs, ins, forced, ctx) {
  if (!outs.every(id => lu.includes(id) && !forced.has(id))) return false;
  if (ins.some(id => lu.includes(id))) return false;
  const stay = lu.filter(id => !outs.includes(id));
  // only pairs with an incoming player are new; the rest were already legal
  for (const inId of ins) for (const other of stay) if (ctx.avoidSet.has(pairKey(inId, other))) return false;
  const [x, y] = ins;
  return !ctx.avoidSet.has(pairKey(x, y));
}

/* An Always pair can only move together, but every other move changes one player
   at a time, and unseating one of the two costs the pair penalty before the
   partner can follow -- so the search never finds the even plan that exists.
   These moves seat, bench or trade the pair as one. Listed after singleSwaps and
   before exchangeSwaps (measured): first, it starves the budget on long formats
   because descend restarts at the head after every gain; last, it is never
   reached on 16-stint formats. Yields nothing without an Always pair. */
function* pairSwaps(cur, ctx, forcedByStint) {
  for (const [a, b] of ctx.alwaysPairs) {
    for (let i = 0; i < cur.length; i++) {
      const on = cur[i].includes(a) && cur[i].includes(b);
      const off = !cur[i].includes(a) && !cur[i].includes(b);
      if (!on && !off) continue;
      if (!ctx.neutralOnly) {
        const others = on ? ctx.avail.filter(id => !cur[i].includes(id)) : cur[i];
        for (const two of combinations(others, 2)) {
          const outs = on ? [a, b] : two;
          const ins = on ? two : [a, b];
          if (replaceLegal(cur[i], outs, ins, forcedByStint[i], ctx)) yield { kind: 'pair', i, outs, ins };
        }
      }
      if (!on) continue;
      for (let j = 0; j < cur.length; j++) {
        if (j === i || cur[j].includes(a) || cur[j].includes(b)) continue;
        if (ctx.neutralOnly && Math.abs(ctx.stints[i].minutes - ctx.stints[j].minutes) > 1e-9) continue;
        const us = cur[j].filter(id => !cur[i].includes(id));
        for (const vs of combinations(us, 2)) {
          if (!replaceLegal(cur[i], [a, b], vs, forcedByStint[i], ctx)) continue;
          if (!replaceLegal(cur[j], vs, [a, b], forcedByStint[j], ctx)) continue;
          yield { kind: 'pair', i, j, outs: [a, b], ins: vs };
        }
      }
    }
  }
}

function applyMove(cur, mv) {
  if (mv.kind === 'pair') {
    const swap = (lu, outs, ins) => lu.map(id => { const k = outs.indexOf(id); return k < 0 ? id : ins[k]; });
    cur[mv.i] = swap(cur[mv.i], mv.outs, mv.ins);
    if (mv.j != null) cur[mv.j] = swap(cur[mv.j], mv.ins, mv.outs);
  } else if (mv.kind === 'single') {
    cur[mv.i] = cur[mv.i].map(id => (id === mv.outId ? mv.inId : id));
  } else {
    cur[mv.i] = cur[mv.i].map(id => (id === mv.u ? mv.v : id));
    cur[mv.j] = cur[mv.j].map(id => (id === mv.v ? mv.u : id));
  }
}

function undoMove(cur, mv, savedI, savedJ) {
  cur[mv.i] = savedI;
  if (mv.j != null) cur[mv.j] = savedJ;
}

function descend(cur, ctx, forcedByStint, budgetRef, gens) {
  let curCost = cost(cur, ctx);
  let moved = true;
  while (moved && budgetRef.left > 0) {
    moved = false;
    for (const gen of gens) {
      for (const mv of gen(cur, ctx, forcedByStint)) {
        if (--budgetRef.left <= 0) break;
        const savedI = cur[mv.i];
        const savedJ = mv.j != null ? cur[mv.j] : null;
        applyMove(cur, mv);
        const c2 = cost(cur, ctx);
        if (c2 < curCost - 1e-9) { curCost = c2; moved = true; }
        else undoMove(cur, mv, savedI, savedJ);
      }
      if (moved) break; // re-run the cheap neighborhood first after any gain
    }
  }
  return curCost;
}

/* Kick the plan out of a local optimum. In the ordinary pass that is a random
   single swap; in the minute-neutral pass it has to be a random exchange
   between two equal-length stints, or the restart itself would move minutes
   the pass is not allowed to move. */
function perturb(cur, ctx, forcedByStint, rng) {
  const i = Math.floor(rng() * cur.length);
  if (!ctx.neutralOnly) {
    const bench = ctx.avail.filter(id => !cur[i].includes(id));
    if (!bench.length) return;
    const outId = cur[i][Math.floor(rng() * ON_FLOOR)];
    const inId = bench[Math.floor(rng() * bench.length)];
    if (swapLegal(cur, i, outId, inId, ctx, forcedByStint)) {
      cur[i] = cur[i].map(id => (id === outId ? inId : id));
    }
    return;
  }
  const mates = [];
  for (let j = 0; j < cur.length; j++) {
    if (j !== i && Math.abs(ctx.stints[i].minutes - ctx.stints[j].minutes) < 1e-9) mates.push(j);
  }
  if (!mates.length) return;
  const j = mates[Math.floor(rng() * mates.length)];
  const us = cur[i].filter(id => !cur[j].includes(id));
  const vs = cur[j].filter(id => !cur[i].includes(id));
  if (!us.length || !vs.length) return;
  const u = us[Math.floor(rng() * us.length)];
  const v = vs[Math.floor(rng() * vs.length)];
  if (swapLegal(cur, i, u, v, ctx, forcedByStint) && swapLegal(cur, j, v, u, ctx, forcedByStint)) {
    cur[i] = cur[i].map(id => (id === u ? v : id));
    cur[j] = cur[j].map(id => (id === v ? u : id));
  }
}

function localSearch(lineups, ctx, forcedByStint, rng, iterations) {
  const gens = ctx.neutralOnly ? [exchangeSwaps, pairSwaps] : [singleSwaps, pairSwaps, exchangeSwaps];
  const budgetRef = { left: iterations };
  let cur = lineups.map(l => l.slice());
  let curCost = descend(cur, ctx, forcedByStint, budgetRef, gens);
  let best = cur.map(l => l.slice());
  let bestCost = curCost;

  while (budgetRef.left > 0) {
    cur = best.map(l => l.slice());
    for (let k = 0; k < 3; k++) perturb(cur, ctx, forcedByStint, rng);
    budgetRef.left -= 25;
    const c = descend(cur, ctx, forcedByStint, budgetRef, gens);
    if (c < bestCost - 1e-9) { bestCost = c; best = cur.map(l => l.slice()); }
  }

  return best;
}

/* ------------------------------------------------------------------ *
 * result assembly
 * ------------------------------------------------------------------ */
// whether `total` is the sum of some of the stint lengths (a minimum the clock can hit)
function isSumOfStints(total, lens) {
  let sums = new Set([0]);
  for (const l of lens) for (const v of [...sums]) sums.add(Math.round((v + l) * 1e6) / 1e6);
  return sums.has(Math.round(total * 1e6) / 1e6);
}

/* The stints (of those asked about) where the pinned groups together seat a
   full five, and the groups that pin a seat in any of them -- named in the
   coach's words, "the starting five and the last-period five". Which group
   pins which stint is `pinGroups`' answer alone, and a kid two groups pin
   counts once. `groups` is `pinGroups`' result, built once in `finish`. */
function pinsFilling(groups, among) {
  const filled = among.filter(i => new Set(groups.flatMap(g => [...g.forced[i]])).size >= ON_FLOOR);
  const named = groups.filter(g => filled.some(i => g.forced[i].size));
  const names = named.map(g => g.name);
  return { filled, who: names.length ? `${andList(names)} fill${named.length === 1 && !named[0].plural ? 's' : ''}` : '' };
}

/* #446: why a minimum the stints could add up to was still missed. When the
   open stints (no full five pinned) the player sat could have made up the
   shortfall, it was not a pin or a rival that held them back: the plain truth.
   Otherwise the pinned fives that filled a stint they sat, then other players
   whose minimum or By hand number held one, else the plain truth. */
function minMissedReason(id, need, ctx, lineups, minutes, groups, label) {
  const { stints } = ctx;
  if (!isSumOfStints(need, stints.map(s => s.minutes))) return 'The clock does not divide to hit it exactly.';
  const sat = stints.map((s, i) => i).filter(i => !lineups[i].includes(id));
  const { filled, who } = pinsFilling(groups, sat);
  const openRoom = sat.filter(i => !filled.includes(i)).reduce((a, i) => a + stints[i].minutes, 0);
  if (openRoom >= need - minutes[id] - 1e-9) return 'No legal lineup gave them more.';
  if (filled.length) {
    const lens = [...new Set(filled.map(i => stints[i].minutes))];
    const where = filled.length === 1 && lens.length === 1 ? `the ${fmtMinutes(lens[0])}-minute stint` : plural(filled.length, 'stint');
    return `${who} ${where}.`;
  }
  const holders = ctx.avail.filter(q => q !== id && sat.some(i => {
    if (!lineups[i].includes(q)) return false;
    const left = minutes[q] - stints[i].minutes;
    const held = ctx.lockedSet.has(q) ? ctx.targetOf(q) : null;
    return left < ctx.minOf(q) - 1e-9 || (held != null && left < held - 1e-9);
  }));
  if (holders.length) {
    return `${andList(holders.map(label))} would drop under their minimum or By hand number if they gave up a stint ${label(id)} sat.`;
  }
  return 'No legal lineup gave them more.';
}

/* #446: the rule that made the spread wider than the clock does. Each reason
   reads its own condition off the final minutes, so a note is only said when
   it is true. Null when no rule explains it, and the plain clock note stands.
   `{ message, playerIds }`, the sentences joined. */
function spreadRuleNote(ctx, c, minutes, label) {
  const n = ctx.avail.length;
  const said = [], named = new Set();
  const say = (text, ids) => { said.push(text); ids.forEach(id => named.add(id)); };

  for (const [a, b] of c.avoids) {
    const ma = minutes[a], mb = minutes[b];
    const rest = ctx.avail.filter(id => id !== a && id !== b);
    if (n >= 2 * ON_FLOOR || Math.abs(ma + mb - ctx.gameMinutes) > 1e-9) continue;
    if (!rest.every(id => minutes[id] > Math.max(ma, mb) + 1e-9)) continue;
    say(`${label(a)} and ${label(b)} share one spot because they are Apart and only ${n} are here, so they play ${Math.abs(ma - mb) < 1e-9 ? `${fmtMinutes(ma)} each` : `${fmtMinutes(ma)} and ${fmtMinutes(mb)}`}.`, [a, b]);
  }

  /* An Always pair ties a kid with nothing set to a partner who has a cap, a
     minimum or a By hand number, so they play the partner's minutes. */
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  const bare = id => ctx.minOf(id) === 0 && ctx.capOf(id) === Infinity && ctx.targetOf(id) == null;
  const bound = (id) => {
    const m = minutes[id];
    if (ctx.capOf(id) !== Infinity && near(m, ctx.capOf(id))) return `capped at ${fmtMinutes(ctx.capOf(id))} min`;
    if (ctx.minOf(id) && near(m, ctx.minOf(id))) return `minimum ${fmtMinutes(ctx.minOf(id))} min`;
    if (ctx.targetOf(id) != null && near(m, ctx.targetOf(id))) return `By hand ${fmtMinutes(ctx.targetOf(id))} min`;
    return null;
  };
  if (c.alwaysPairs.length) {
    for (const [x, y] of c.alwaysPairs) {
      for (const [a, b] of [[x, y], [y, x]]) {
        if (!bare(b) || bare(a) || !near(minutes[a], minutes[b])) continue;
        const why = bound(a);
        const others = ctx.avail.filter(id => id !== a).map(id => minutes[id]);
        const ends = near(minutes[b], Math.min(...others)) || near(minutes[b], Math.max(...others));
        if (!why || !ends) continue;
        say(`${label(b)} plays ${fmtMinutes(minutes[b])} min because they are set Always together with ${label(a)} (${why}).`, [a, b]);
        break;
      }
    }
  }

  /* a tied group bigger than the bench has seats can never all sit, so it
     plays every minute */
  if (c.alwaysPairs.length) {
    const group = tiedGroups(ctx.avail, c.alwaysPairs);
    for (const set of new Set(group.values())) {
      const ids = [...set];
      if (ids.length > n - ON_FLOOR && ids.every(id => near(minutes[id], ctx.gameMinutes))) {
        say(`${andList(ids.map(label))} play every minute because ${ids.length} players are set Always together and only ${n - ON_FLOOR} can sit.`, ids);
      }
    }
  }

  /* an Apart partner who never leaves the floor keeps their pair off it */
  for (const [x, y] of c.avoids) {
    for (const [a, b] of [[x, y], [y, x]]) {
      if (near(minutes[a], 0) && near(minutes[b], ctx.gameMinutes)) {
        say(`${label(a)} plays 0 because they are Apart from ${label(b)}, who plays every minute.`, [a, b]);
      }
    }
  }

  for (const [a, b] of c.keepOnFloor) {
    const rest = ctx.avail.filter(id => id !== a && id !== b);
    if (!near(minutes[a] + minutes[b], ctx.gameMinutes)) continue;
    if (!rest.every(id => minutes[id] < Math.min(minutes[a], minutes[b]) - 1e-9)) continue;
    say(`${label(a)} and ${label(b)} split the game because One of two on keeps one of them on the floor, so everyone else plays less.`, [a, b]);
  }
  return said.length ? { message: said.join(' '), playerIds: [...named] } : null;
}

/* The arithmetic both halftime warnings give: how many can play in the `stints`
   stints of one half when `reach` is the most the clock and the change limit let
   take the floor, or null when everyone available fits. `when` is "before" or
   "after" (halftime). */
function halfReachSentence(ctx, when, stints, reach) {
  const capped = reach < stints * ON_FLOOR;
  const fits = Math.min(stints * ON_FLOOR, reach);
  if (ctx.avail.length <= fits) return null;
  return `Only ${fits} can play ${when} halftime here — ${plural(stints, 'stint')}${capped ? `, ${ctx.maxSubs} changes at a time` : ''} — and you have ${ctx.avail.length}. Sub more often${capped ? ', or allow more changes at once' : ''}.`;
}

/* The notes only a Rotation order plan writes: an Apart pair the list puts on
   the floor together, and "fewer than c change" when fewer than c players sit. */
function orderNotes(ctx, c, lineups, label) {
  const out = [];
  for (const [a, b] of c.avoids) {
    const together = lineups.filter(lu => lu.includes(a) && lu.includes(b)).length;
    if (together) {
      out.push({ severity: 'warn', code: 'APART_TOGETHER', playerIds: [a, b],
        message: `${label(a)} and ${label(b)} are set Apart but are on the floor together for ${plural(together, 'stint')}.` });
    }
  }
  const n = ctx.avail.length, change = orderChanges(ctx.maxSubs);
  if (n > ON_FLOOR && change > n - ON_FLOOR) {
    out.push({ severity: 'warn', code: 'ORDER_CHANGES', playerIds: [],
      message: `With ${n} players, only ${n - ON_FLOOR} sit each stint, so fewer than ${change} change at a break.` });
  }
  return out;
}

function finish(lineups, ctx, issues, meta) {
  const { players, short, seed, stints, c, platoon, periods, order } = meta;
  const searched = !platoon && !order;
  const byId = new Map(players.map(p => [p.id, p]));
  const label = id => byId.get(id)?.name || id;
  const minutes = minutesOf(lineups, ctx);
  for (const id of Object.keys(minutes)) minutes[id] = Math.round(minutes[id] * 100) / 100;

  const rows = lineups.map((lu, i) => {
    const prev = i > 0 ? lineups[i - 1] : null;
    const ordered = lu.slice().sort((a, b) => short[a].localeCompare(short[b]));
    return {
      index: i,
      period: stints[i].period,
      /* Carried through, and this line is the whole bug: `finish` builds fresh
         row objects, so a field added to `buildStints` reaches nobody unless it
         is copied here. Every renderer was falling back to a hardcoded "Q" --
         invisibly correct for four quarters, wrong for two halves. */
      periodName: stints[i].periodName,
      startSec: stints[i].startSec,
      endSec: stints[i].endSec,
      clock: `${fmtClock(stints[i].startSec)}-${fmtClock(stints[i].endSec)}`,
      minutes: stints[i].minutes,
      onFloor: ordered,
      sitting: ctx.avail.filter(id => !lu.includes(id)).sort((a, b) => short[a].localeCompare(short[b])),
      in: prev ? ordered.filter(id => !prev.includes(id)) : [],
      out: prev ? prev.filter(id => !lu.includes(id)).sort((a, b) => short[a].localeCompare(short[b])) : [],
    };
  });

  const vals = ctx.avail.map(id => minutes[id]);
  const spread = Math.round((Math.max(...vals) - Math.min(...vals)) * 100) / 100;
  // A capped kid legitimately sits below everyone else; the number that tells
  // you whether the rotation is fair is the spread across the unpinned players.
  const free = ctx.avail.filter(id => ctx.minOf(id) === 0 && ctx.capOf(id) === Infinity);
  const freeVals = free.map(id => minutes[id]);
  const spreadUnconstrained = freeVals.length > 1
    ? Math.round((Math.max(...freeVals) - Math.min(...freeVals)) * 100) / 100 : 0;
  const floor = minPossibleSpread(stints, ctx.avail.length);
  /* which group pins which stint, asked once; platoon applies no pins */
  const groups = platoon ? [] : pinGroups(stints, c, periods);

  // post-hoc constraint report -- soft constraints can miss, so say so
  for (const id of ctx.avail) {
    const need = ctx.minOf(id);
    if (need && minutes[id] < need - 1e-9) {
      issues.push({
        severity: 'warn', code: 'MIN_MISSED', playerIds: [id],
        message: `${label(id)} got ${fmtMinutes(minutes[id])} minutes against a ${need}-minute minimum. ${order ? 'The order puts them on the floor for less.' : minMissedReason(id, need, ctx, lineups, minutes, groups, label)}`,
      });
    }
    const cap = ctx.capOf(id);
    if (cap !== Infinity && minutes[id] > cap + 1e-9) {
      issues.push({
        severity: 'warn', code: 'CAP_EXCEEDED', playerIds: [id],
        message: `${label(id)} is at ${fmtMinutes(minutes[id])} minutes against a ${cap}-minute cap — ${order ? 'the order puts them on the floor for more' : 'there was no legal lineup that kept them under it'}.`,
      });
    }
  }

  /* A pin the search still missed, which feasibility could not see. One issue
     per group, naming everyone left out. Each group is run through buildForced
     alone, so which stints it pins is still decided in one place. Platoon is
     exempt: it applies no pins, the units are the coach's. */
  issues.push(...missedPinIssues({ stints, c, periods, lineups, avail: ctx.avail, platoon, order, label }));
  if (meta.fullShort?.length) {
    issues.push({
      severity: 'warn', code: 'FULL_PERIODS_SHORT', playerIds: meta.fullShort.map(x => x.id),
      message: `${andList(meta.fullShort.map(x => `${label(x.id)} gets ${x.got} of ${wholePeriods(periods, x.need)}`))}: no period had room for them without breaking another rule.`,
    });
  }

  if (ctx.playsIn && !issues.some(i => i.code === 'PLAYS_IN_TOO_FEW')) {
    const name = g => (ctx.playsIn.mode === 'halves' ? (g === 1 ? 'the first half' : 'the second half') : periodLabel(g, periods));
    const byKid = new Map();
    for (const [id, g] of playsInMisses(lineups, ctx)) byKid.set(id, [...(byKid.get(id) || []), g]);
    if (byKid.size) {
      issues.push({
        severity: 'warn', code: 'PLAYS_IN_MISSED', playerIds: [...byKid.keys()],
        message: [...byKid].map(([id, gs]) => `${label(id)} misses ${andList(gs.map(name))}.`).join(' '),
      });
    }
  }

  const saidUpFront = issues.some(i => i.code === 'CONSEC_TOO_FEW' || i.code === 'CONSEC_IMPOSSIBLE');
  const span = ctx.benchSpan;
  if (ctx.maxBench && !issues.some(i => i.code === 'BENCH_TOO_FEW')) {
    const benched = lineups.slice(0, span);
    for (const id of ctx.avail) {
      const run = longestRun(benched, id, ctx.sitLeadOf(id), false);
      if (run > ctx.maxBench) {
        issues.push({
          severity: 'warn', code: 'BENCH_EXCEEDED', playerIds: [id],
          message: runOverSentence(label(id), 'sits', run, ctx.maxBench, order),
        });
      }
    }
  }
  const minConflicted = new Set(issues.filter(i => i.code === 'CONSEC_MIN_CONFLICT').flatMap(i => i.playerIds));
  if (ctx.maxConsecutive && !saidUpFront) {
    for (const id of ctx.avail) {
      if (minConflicted.has(id)) continue;
      const run = longestRun(lineups, id, ctx.leadOf(id));
      if (run > ctx.maxConsecutive) {
        issues.push({
          severity: 'warn', code: 'CONSEC_EXCEEDED', playerIds: [id],
          message: runOverSentence(label(id), 'plays', run, ctx.maxConsecutive, order),
        });
      }
    }
  }

  /* How many change at once is a PREFERENCE, and this is what makes saying so
     honest. `repairChurn` holds the ceiling while a lineup is built, but the
     search that follows charges 40 per extra change against 60 a minute off
     target -- so when holding to the number would cost somebody minutes the
     plan goes over, and always could. Measured at the default of 3: about one
     plan in nine. Same contract as CONSEC_EXCEEDED above -- say the limit was
     missed rather than under-deliver quietly. Platoon is exempt: alternating
     whole fives IS the strategy. */
  // BENCH_SUBS, PLAYS_IN_SUBS or PLAYS_IN_TOO_FEW, or BENCH_TOO_FEW beside a change limit too small, already said it
  const benchSaidChanges = issues.some(i => i.code === 'BENCH_SUBS' || i.code === 'PLAYS_IN_SUBS' || i.code === 'PLAYS_IN_TOO_FEW')
    || (issues.some(i => i.code === 'BENCH_TOO_FEW') && benchOutrunsChanges(ctx.maxBench, ctx.maxSubs, ctx.avail.length, span));
  if (searched && ctx.maxSubs > 0 && !benchSaidChanges) {
    let over = 0, worst = 0, forced = 0, byRest = 0, byBench = 0;
    for (let i = 1; i < lineups.length; i++) {
      const subs = changesAt(lineups, i);
      if (subs > ctx.maxSubs) {
        over += 1; worst = Math.max(worst, subs);
        /* Players whose run ending at i-1 has reached Plays at most N in a row must come
           off; more of them than the number asked for means the limit forced it. */
        let rest = false, bench = false;
        if (ctx.maxConsecutive) {
          const spent = lineups[i - 1].filter(id => !lineups[i].includes(id)
            && runEndingAt(lineups, id, i - 1, ctx.leadOf(id)) >= ctx.maxConsecutive).length;
          rest = spent > ctx.maxSubs;
        }
        /* ... and whoever has sat the Sits at most limit must come on. */
        if (ctx.maxBench && i < span) {
          const due = lineups[i].filter(id => !lineups[i - 1].includes(id)
            && runEndingAt(lineups, id, i - 1, ctx.sitLeadOf(id), false) >= ctx.maxBench).length;
          bench = due > ctx.maxSubs;
        }
        if (rest || bench) forced += 1;
        if (rest) byRest += 1;
        if (bench) byBench += 1;
      }
    }
    if (over) {
      issues.push({
        severity: 'warn', code: 'SUBS_EXCEEDED', playerIds: [],
        message: `${over === 1 ? 'One break puts' : `${over} breaks put`} ${worst} players on at once, more than the ${ctx.maxSubs} you asked for${over === forced ? (byBench > byRest
              ? ` — Sits at most ${ctx.maxBench} in a row makes more than ${ctx.maxSubs} come on at once.`
              : ` — Plays at most ${ctx.maxConsecutive} in a row makes more than ${ctx.maxSubs} come off at once.`) : ' — holding to your number would have cost somebody minutes.'}`,
      });
    }
  }

  /* The coach never asked for the halftime default, so they will not go looking
     for why it slipped: name who is waiting and give the arithmetic. The number
     that fits is the tighter of the clock and the coach's change limit, and the
     second lever is only offered when lifting it would actually help. Platoon
     is exempt for the SUBS_EXCEEDED reason: the units are the coach's. */
  if (ctx.firstHalf && searched && !ctx.playsIn) {
    const on = playedBeforeHalf(lineups, ctx);
    const late = ctx.avail.filter(id => !on.has(id));
    if (late.length) {
      /* #446: when nothing the clock or the change limit says, the rule that
         held them off: the pinned fives, or an Apart partner on the floor
         for every stint before halftime. */
      const whyLate = (ids) => {
        const first = stints.map((s, i) => i).filter(i => i < ctx.firstHalf);
        const { filled, who } = pinsFilling(groups, first);
        if (first.length && filled.length === first.length) return `${who} every stint before halftime.`;
        const apart = [], unexplained = new Set(ids);
        for (const id of ids) {
          for (const [x, y] of c.avoids) {
            const q = x === id ? y : y === id ? x : null;
            if (q && first.every(i => lineups[i].includes(q))) {
              apart.push(`${label(id)} is Apart from ${label(q)}, who is on the floor for every stint before halftime.`);
              unexplained.delete(id);
            }
          }
        }
        if (!apart.length) return 'No legal lineup got them on any sooner.';
        return unexplained.size ? `${apart.join(' ')} No legal lineup got ${andList([...unexplained].map(label))} on any sooner.` : apart.join(' ');
      };
      issues.push({
        severity: 'warn', code: 'HALF_LATE', playerIds: late,
        message: `${andList(late.map(label))} ${late.length === 1 ? 'does' : 'do'} not get on until the second half. ${
          halfReachSentence(ctx, 'before', ctx.firstHalf, ctx.halfReach) ?? whyLate(late)}`,
      });
    }
  }

  /* #448: the mirror. Somebody who plays before halftime and never after
     is the same silence HALF_LATE ends. The arithmetic is counted for the
     stints after halftime, the first of which is a change like any other. */
  if (ctx.firstHalf && searched && !ctx.playsIn) {
    const after = new Set();
    for (let i = ctx.firstHalf; i < lineups.length; i++) for (const id of lineups[i]) after.add(id);
    const gone = [...playedBeforeHalf(lineups, ctx)].filter(id => !after.has(id));
    if (gone.length) {
      const left = lineups.length - ctx.firstHalf;
      const reach = ON_FLOOR + Math.max(0, ctx.maxSubs) * (left - 1);
      /* Only the arithmetic: when it does not bind, nothing here knows why they
         sat (no cost term pushes second-half minutes), so no reason is claimed. */
      const why = halfReachSentence(ctx, 'after', left, reach);
      issues.push({
        severity: 'warn', code: 'HALF_EARLY', playerIds: gone,
        message: `${andList(gone.map(label))} ${gone.length === 1 ? 'does' : 'do'} not play after halftime.${why ? ` ${why}` : ''}`,
      });
    }
  }

  const pairReport = c.pairs.map(([a, b]) => {
    let together = 0;
    lineups.forEach((lu, i) => { if (lu.includes(a) && lu.includes(b)) together += stints[i].minutes; });
    // ceiling is whichever of the two plays fewer minutes -- "of 32" would be
    // a number they can never reach
    return { a, b, together, of: Math.min(minutes[a], minutes[b]), gameMinutes: ctx.gameMinutes };
  });
  for (const p of pairReport) {
    if (p.together < p.of) {
      issues.push({
        severity: 'warn', code: 'PAIR_PARTIAL', playerIds: [p.a, p.b],
        message: `${label(p.a)} + ${label(p.b)} are on the floor together for ${fmtMinutes(p.together)} of a possible ${fmtMinutes(p.of)} minutes.`,
      });
    }
  }

  /* Feasibility refuses what cannot work; this catches what the search merely
     failed to reach. Same job as SUBS_EXCEEDED and PAIR_PARTIAL. */
  for (const [a, b] of platoon ? [] : c.keepOnFloor) {
    const offAt = lineups.map((lu, i) => i).filter(i => !lineups[i].includes(a) && !lineups[i].includes(b));
    const off = offAt.length;
    if (off) {
      /* #446: the pinned fives, when they filled every stint both sat; else
         both held at their cap or locked number; else the plain truth */
      const { filled, who } = pinsFilling(groups, offAt);
      const pinned = filled.length === off;
      const atLimit = id => (ctx.capOf(id) !== Infinity && minutes[id] >= ctx.capOf(id) - 1e-9)
        || (ctx.lockedSet.has(id) && ctx.targetOf(id) != null && minutes[id] >= ctx.targetOf(id) - 1e-9);
      const why = order ? 'the order sits both of them then.'
        : pinned ? `${who} ${off === 1 ? 'it' : 'them'}.`
        : atLimit(a) && atLimit(b) ? `Both are at their cap or By hand number, so neither could play more.`
        : `no legal lineup kept one of them on.`;
      issues.push({
        severity: 'warn', code: 'KEEPON_PARTIAL', playerIds: [a, b],
        message: `${label(a)} and ${label(b)} are both off the floor for ${plural(off, 'stint')}${pinned || atLimit(a) && atLimit(b) ? '. ' : ' — '}${why}`,
      });
    }
  }

  /* Rotation order says what the list does: who is on together against an
     Apart pair, and a change limit the bench is too short for. */
  if (order) issues.push(...orderNotes(ctx, c, lineups, label));

  if (!order && free.length !== ctx.avail.length && spreadUnconstrained !== spread) {
    issues.push({
      severity: 'info', code: 'SPREAD_CONSTRAINED',
      message: `Spread is ${fmtMinutes(spread)} minutes overall, ${fmtMinutes(spreadUnconstrained)} among the players without a minimum or cap.`,
      playerIds: [],
    });
  }
  /* #446: only when the spread is wider than the clock alone makes it. */
  const clockFloor = floor.exact ? floor.minutes : Math.max(...stints.map(s => s.minutes));
  const ruleNote = searched && spread > clockFloor + 1e-9 ? spreadRuleNote(ctx, c, minutes, label) : null;
  // Where the spread is deliberate -- hand-set targets, or carryover evening
  // out the day -- the single-game floor is the wrong benchmark and saying
  // "best possible is 0" is just wrong.
  const pinnedTargets = ctx.avail.filter(id => ctx.targetOf(id) != null);
  if (order) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const at = v => ctx.avail.filter(id => Math.abs(minutes[id] - v) < 1e-9);
    issues.push({ severity: 'info', code: 'SPREAD_ORDER', playerIds: at(lo),
      message: minutesSpreadSentence(at(lo), lo, at(hi), hi, ctx.avail.length, label) });
  } else if (pinnedTargets.length) {
    issues.push({
      severity: 'info', code: 'TARGETS_ACTIVE',
      message: pinnedTargets.length === ctx.avail.length
        ? `Minutes are set by hand for every player.`
        : `Minutes are set by hand for ${pinnedTargets.map(label).join(', ')}; everyone else splits what is left.`,
      playerIds: pinnedTargets,
    });
  } else if (ctx.hasCarryover) {
    /* #572: both sides are named, the biggest credit first. Up to 4 kids on a
       side by name; past that the first 3 and a count. */
    const side = (up) => {
      const ids = ctx.avail.filter(id => (up ? ctx.credit[id] > 1e-9 : ctx.credit[id] < -1e-9))
        .sort((a, b) => (up ? ctx.credit[b] - ctx.credit[a] : ctx.credit[a] - ctx.credit[b]));
      const names = ids.length > 4 ? [...ids.slice(0, 3).map(label), `${ids.length - 3} others`] : ids.map(label);
      return names.length ? `${andList(names)} ${ids.length === 1 ? 'gets' : 'get'} a little ${up ? 'more' : 'less'}.` : '';
    };
    const more = side(true), less = side(false);
    issues.push({
      severity: 'info', code: 'CARRYOVER_ACTIVE',
      message: more
        ? `Minutes are deliberately uneven here to even out the day. ${more}${less ? ` ${less}` : ''}`
        : `Balanced against minutes already played today.`,
      playerIds: [],
    });
  } else if (spread === 0) {
    issues.push({
      severity: 'info', code: 'SPREAD_EVEN',
      message: evenMinutesSentence(minutes[ctx.avail[0]]),
      playerIds: [],
    });
  } else if (ruleNote) {
    issues.push({ severity: 'info', code: 'SPREAD_RULE', ...ruleNote });
  } else if (floor.exact) {
    /* "Best possible spread is 4 minutes" is true and, on its own, useless: it
       tells the coach the clock does not divide and nothing about who pays for
       it. Somebody plays a stint less than everyone else, and the coach has two
       per-player answers to that already -- a hand-set target and a lock -- but
       only if they know who it is. So the names go on the line.

       The short end is always what gets named and always what `playerIds`
       hands back, because those are the rows a coach might want to reach for.
       Past six of them the names come off and the count goes on instead: a
       thirteenth player over eight stints puts twelve on the short end, and
       twelve names is four lines of phone screen saying what the bars
       underneath already say.

       Only added when the two totals account for everybody -- a floor or a cap
       can put a third number in the middle, and naming "the other 7" would
       then be a lie. The trailing full stop is load-bearing: `state.js` swaps
       it for the reason, which is the half the engine is deliberately not told.
       See `sayWhyTheyAreShort`. */
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const at = v => ctx.avail.filter(id => Math.abs(minutes[id] - v) < 1e-9);
    const lows = at(lo), highs = at(hi);
    let who = '';
    const end = lowEndPhrase(lows, lo, highs, hi, ctx.avail.length, label);
    if (end.covers) who = ` ${end.named ? end.who : `${end.who}, ${end.other}`}.`;
    issues.push({
      severity: 'info', code: 'SPREAD_FLOOR',
      message: `Best possible spread with ${ctx.avail.length} players and ${fmtMinutes(stints[0].minutes)}-minute stints is ${fmtMinutes(floor.minutes)} minutes.${who}`,
      playerIds: lows,
    });
  }

  return {
    ok: true, seed, stints: rows, minutes, spread, spreadUnconstrained,
    constrainedIds: ctx.avail.filter(id => !free.includes(id)),
    targets: Object.fromEntries(ctx.targets),
    minPossibleSpread: floor, pairs: pairReport, shortNames: short, issues,
  };
}

/* The three ways `sitRest` (gamemode.js) refuses, keyed by `resolveRest`'s
   `reason`. They live here, not in gamemode.js, so `node --test` can import
   the wording: gamemode.js reaches for `matchMedia` at import time. */
export const SIT_REFUSALS = {
  strategy: 'Sit for the rest does not apply to this strategy. Its minutes are set by hand.',
  nobody: 'Not enough players left to cover the rest of the game.',
  nothing: 'Nothing left to share out. This is the last stint.',
};

/* Whether the kids are not all at one level. */
export const tiersDiffer = (ids, tierOf) => new Set(ids.map(tierOf)).size > 1;

/* #569: Platoon's groups, filled for a coach who has picked nobody. Who is placed
   never depends on level: the first 5 x floor(n / 5) kids in roster order, the
   rest left out. Level only decides who plays together. When the placed kids'
   levels differ they are dealt strongest first (roster order breaking ties) in a
   snake -- 1-2-2-1-1-2 -- so each group gets some of the stronger players; when
   they are all alike the groups are the roster in fives. `tierOf(id)` is the
   level, higher is stronger. */
export function fillGroups(ids, tierOf) {
  const count = Math.floor(ids.length / ON_FLOOR);
  const placed = ids.slice(0, count * ON_FLOOR);
  const groups = Array.from({ length: count }, () => []);
  if (tiersDiffer(placed, tierOf)) {
    const rank = new Map(placed.map((id, i) => [id, i]));
    placed.slice().sort((a, b) => tierOf(b) - tierOf(a) || rank.get(a) - rank.get(b)).forEach((id, r) => {
      const pos = r % count, row = Math.floor(r / count);
      groups[row % 2 ? count - 1 - pos : pos].push(id);
    });
    groups.forEach(g => g.sort((a, b) => ids.indexOf(a) - ids.indexOf(b)));
  } else {
    groups.forEach((g, i) => g.push(...placed.slice(i * ON_FLOOR, (i + 1) * ON_FLOOR)));
  }
  return groups;
}

/* #569: Closers' five. When levels differ, the five highest (roster order
   breaking ties); when alike, `lastFive` -- who is on the floor last in the
   plan the game had -- or the first five when there is no plan to read. Fewer
   than five kids: nothing. */
export function fillClosers(ids, tierOf, lastFive) {
  if (ids.length < ON_FLOOR) return [];
  if (tiersDiffer(ids, tierOf)) {
    return ids.map((id, i) => [id, i]).sort((a, b) => tierOf(b[0]) - tierOf(a[0]) || a[1] - b[1])
      .slice(0, ON_FLOOR).map(([id]) => id);
  }
  const last = (lastFive || []).filter(id => ids.includes(id));
  return last.length === ON_FLOOR ? last : ids.slice(0, ON_FLOOR);
}
