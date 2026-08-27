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

// A tail shorter than half the requested interval gets folded into the
// previous stint -- a 1-minute stint is not a real substitution point.
function periodLengths(periodMinutes, g) {
  if (g.mode === 'breaksOnly') return [periodMinutes];

  if (g.mode === 'perPeriod') {
    const n = Math.max(1, Math.floor(g.value));
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
  if (total === 2) return `H${period}`;
  if (total === 4) return `Q${period}`;
  return `P${period}`;
}

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

export function buildStints(format, granularity) {
  const { periods, periodMinutes } = format;
  const lengths = periodLengths(periodMinutes, granularity);
  const stints = [];
  for (let p = 1; p <= periods; p++) {
    let left = periodMinutes;
    for (const len of lengths) {
      stints.push({
        index: stints.length,
        period: p,
        // carried on the row so no renderer has to know the period count, and
        // none of them can disagree with another about what to call it
        periodName: periodLabel(p, periods),
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

function normalize(constraints, availSet) {
  const c = constraints || {};
  // A pair rule means nothing unless both players are at the game. Three lists
  // share that split now, hence the helper.
  const splitPairs = (list) => {
    const keep = [], dropped = [];
    for (const [a, b] of list || []) (availSet.has(a) && availSet.has(b) ? keep : dropped).push([a, b]);
    return [keep, dropped];
  };
  const [keepPairs, droppedPairs] = splitPairs(c.pairs);
  const [keepAvoids, droppedAvoids] = splitPairs(c.avoids);
  const [keepOnFloor, droppedKeepOn] = splitPairs(c.keepOnFloor);
  const filterIds = (ids) => (ids || []).filter(id => availSet.has(id));
  const targetMinutes = {};
  for (const [id, v] of Object.entries(c.targetMinutes || {})) if (availSet.has(id)) targetMinutes[id] = v;
  const closing = c.closing && c.closing.stints > 0
    ? { stints: c.closing.stints, players: filterIds(c.closing.players) } : null;
  const units = (c.units || []).map(u => filterIds(u));
  return {
    minMinutes: c.minMinutes || {},
    maxMinutes: c.maxMinutes || {},
    /* `normalize` is a whitelist, and lockedTargets was never on it -- so a
       locked row had never reached the solver at all. That is why the lock only
       ever guarded the "Even out the rest" button: the UI was the only place
       the flag existed. */
    lockedTargets: filterIds(c.lockedTargets),
    targetMinutes, closing, units,
    maxConsecutive: c.maxConsecutive > 0 ? c.maxConsecutive : 0,
    pairs: keepPairs,
    avoids: keepAvoids,
    /* The third pair relation. `pairs` and `avoids` both constrain the FLOOR
       (both on / never both on); this one constrains the BENCH, and is the
       inverse of neither -- a coach who wants a ball handler out there at all
       times says nothing about whether the other one is also playing. */
    keepOnFloor,
    hardPairs: !!c.hardPairs,
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
export function analyzeFeasibility({ players, availableIds, constraints, stints, strategy }) {
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

  const err = (code, message, playerIds = []) => issues.push({ severity: 'error', code, message, playerIds });
  const warn = (code, message, playerIds = []) => issues.push({ severity: 'warn', code, message, playerIds });

  if (avail.length < ON_FLOOR) {
    err('NOT_ENOUGH_PLAYERS',
      `Only ${avail.length} player${avail.length === 1 ? '' : 's'} available; you need at least ${ON_FLOOR} to field a lineup.`,
      avail);
    return issues;
  }

  for (const id of avail) {
    const mn = c.minMinutes[id];
    const mx = c.maxMinutes[id];
    if (mn != null && mn > gameMinutes) {
      err('MIN_EXCEEDS_GAME',
        `${label(id)} has a ${mn}-minute minimum but the game is only ${gameMinutes} minutes long.`, [id]);
    }
    if (mn != null && mx != null && mn > mx) {
      err('MIN_ABOVE_CAP', `${label(id)} has a ${mn}-minute minimum and a ${mx}-minute cap. Pick one.`, [id]);
    }
    if (mx != null && mx < maxStint) {
      warn('CAP_BELOW_STINT',
        `${label(id)}'s ${mx}-minute cap is shorter than a ${maxStint}-minute stint, so they will play 0 minutes.`, [id]);
    }
    if (mn != null && mn % maxStint !== 0 && stintLens.every(l => l === maxStint)) {
      warn('MIN_OFF_STINT_BOUNDARY',
        `${label(id)}'s ${mn}-minute minimum rounds up to ${Math.ceil(mn / maxStint) * maxStint} (stints are ${maxStint} minutes).`, [id]);
    }
  }

  const minSum = avail.reduce((a, id) => a + (c.minMinutes[id] || 0), 0);
  if (minSum > floorMinutes) {
    const top = avail
      .filter(id => c.minMinutes[id])
      .sort((a, b) => c.minMinutes[b] - c.minMinutes[a])
      .slice(0, 3)
      .map(id => `${label(id)} (${c.minMinutes[id]})`)
      .join(', ');
    err('MINS_UNSATISFIABLE',
      `Required minimums total ${minSum} minutes but the game only has ${floorMinutes} floor-minutes (${gameMinutes} min x ${ON_FLOOR} players). Largest: ${top}.`,
      avail.filter(id => c.minMinutes[id]));
  }

  const capSum = avail.reduce((a, id) => a + (c.maxMinutes[id] != null ? c.maxMinutes[id] : gameMinutes), 0);
  if (capSum < floorMinutes) {
    err('CAPS_UNSATISFIABLE',
      `Caps allow at most ${capSum} total minutes but the game needs ${floorMinutes} floor-minutes to keep ${ON_FLOOR} on the court. Raise a cap or add a player.`,
      avail.filter(id => c.maxMinutes[id] != null));
  }

  const avoidSet = avoidSetOf(c.avoids);
  for (const [a, b] of c.pairs) {
    if (avoidSet.has(pairKey(a, b))) {
      err('PAIR_AVOID_CONFLICT', `${label(a)} and ${label(b)} are set to both play together and never play together.`, [a, b]);
    }
  }

  for (const [a, b] of c.keepOnFloor) {
    const cover = (c.maxMinutes[a] != null ? c.maxMinutes[a] : gameMinutes)
                + (c.maxMinutes[b] != null ? c.maxMinutes[b] : gameMinutes);
    if (cover < gameMinutes) {
      err('KEEPON_UNSATISFIABLE',
        `${label(a)} or ${label(b)} has to be on the floor at all times, but their caps only cover ${cover} of the game's ${gameMinutes} minutes. Raise a cap or drop the rule.`,
        [a, b]);
    }
  }

  for (const [a, b] of c.droppedPairs) warn('PAIR_DROPPED', `Pair ${label(a)} + ${label(b)} ignored: one of them is not available.`, [a, b]);
  for (const [a, b] of c.droppedAvoids) warn('AVOID_DROPPED', `Avoid ${label(a)} / ${label(b)} ignored: one of them is not available.`, [a, b]);
  /* Dropped rather than collapsed into "the other one plays every minute",
     which is a much bigger instruction than the coach gave. */
  for (const [a, b] of c.droppedKeepOn) warn('KEEPON_DROPPED', `"${label(a)} or ${label(b)} always on" ignored: one of them is not available.`, [a, b]);
  for (const id of c.droppedOpening) warn('OPENING_DROPPED', `${label(id)} is set to start but is not available.`, [id]);
  for (const id of c.droppedLastPeriod) warn('LAST_PERIOD_DROPPED', `${label(id)} is set to start the last period but is not available.`, [id]);

  for (const [name, group] of [['opening stint', c.openingFive], ['last period', c.lastPeriodFive]]) {
    if (group.length > ON_FLOOR) {
      err('FORCED_GROUP_TOO_BIG', `${group.length} players are pinned to the ${name} but only ${ON_FLOOR} fit.`, group);
    }
    for (const [a, b] of combinations(group, 2)) {
      if (avoidSet.has(pairKey(a, b))) {
        err('FORCED_GROUP_AVOID', `${label(a)} and ${label(b)} are both pinned to the ${name} but are set to never play together.`, [a, b]);
      }
    }
    for (const id of group) {
      const mx = c.maxMinutes[id];
      if (mx != null && mx < maxStint) {
        err('FORCED_OVER_CAP', `${label(id)} is pinned to the ${name} but their ${mx}-minute cap will not cover a ${maxStint}-minute stint.`, [id]);
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
        err('CLOSERS_AVOID', `${label(a)} and ${label(b)} are both set to close but are set to never play together.`, [a, b]);
      }
    }
    const closeMinutes = stints.slice(-c.closing.stints).reduce((a, x) => a + x.minutes, 0);
    for (const id of c.closing.players) {
      const mx = c.maxMinutes[id];
      if (mx != null && mx < closeMinutes) {
        warn('CLOSER_OVER_CAP', `${label(id)} is set to close (${closeMinutes} min) but is capped at ${mx}.`, [id]);
      }
    }
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

  if (Object.keys(c.targetMinutes).length) {
    const pinned = avail.filter(id => c.targetMinutes[id] != null);
    const sum = pinned.reduce((a, id) => a + c.targetMinutes[id], 0);
    const free = avail.length - pinned.length;
    // A mismatch is guidance, not a blocker. The solver gets as close as it
    // can and the shortfall is reported, so the coach can set the players
    // they care about and reconcile afterwards.
    if (free === 0 && Math.abs(sum - floorMinutes) > 1e-9) {
      warn(sum > floorMinutes ? 'TARGETS_OVER_BUDGET' : 'TARGETS_UNDER_BUDGET',
        sum > floorMinutes
          ? `Minute targets add up to ${sum}, which is ${sum - floorMinutes} more than the game has. Somebody will fall short of their number.`
          : `Minute targets add up to ${sum} of ${floorMinutes} floor-minutes. The spare ${floorMinutes - sum} minutes get shared out.`,
        pinned);
    }
    for (const [id, t] of Object.entries(c.targetMinutes)) {
      const mx = c.maxMinutes[id];
      if (mx != null && t > mx) warn('TARGET_OVER_CAP', `${label(id)} is targeted at ${t} min but capped at ${mx}.`, [id]);
    }
  }

  if (c.maxConsecutive) {
    if (avail.length <= ON_FLOOR) {
      warn('CONSEC_IMPOSSIBLE', `With only ${avail.length} available, nobody can be rested — the consecutive-stint limit will be ignored.`, avail);
    }
  }

  // Choosing platoon without defining the fives used to fall through and plan
  // as if balanced -- a silent no-op is worse than a clear ask.
  if (strategy === 'platoon' && !c.units.length) {
    err('UNITS_MISSING', `Platoon needs at least one unit of ${ON_FLOOR}. Pick the players for Unit 1.`, []);
  }

  if (c.units.length) {
    c.units.forEach((u, i) => {
      if (u.length !== ON_FLOOR) {
        err('UNIT_WRONG_SIZE', `Unit ${i + 1} has ${u.length} player${u.length === 1 ? '' : 's'}; a unit needs exactly ${ON_FLOOR}.`, u);
      }
    });
    const inUnit = new Set(c.units.flat());
    const benched = avail.filter(id => !inUnit.has(id));
    if (benched.length) {
      warn('UNIT_LEFTOVERS', `${benched.map(label).join(', ')} ${benched.length === 1 ? 'is' : 'are'} not in any unit and will not play.`, benched);
    }
    /* A unit is used exactly as declared -- there is nothing for the solver to
       optimise -- so a "never together" pair sitting inside one was honoured
       silently and the plan came back clean. Two instructions that contradict
       each other is the coach's call to make, but they have to be told there
       is a contradiction. Found by fuzzing platoon, which until now had never
       been fuzzed at all. */
    c.units.forEach((u, i) => {
      for (const [a, b] of c.keepOnFloor) {
        if (!u.includes(a) && !u.includes(b)) {
          warn('UNIT_KEEPON',
            `Unit ${i + 1} has neither ${label(a)} nor ${label(b)}, but you have one of them on the floor at all times. The unit wins — drop the rule or change the unit.`,
            [a, b]);
        }
      }
      for (const [a, b] of combinations(u, 2)) {
        if (avoidSet.has(pairKey(a, b))) {
          warn('UNIT_AVOID',
            `Unit ${i + 1} puts ${label(a)} and ${label(b)} on the floor together, but you have them set never to play together. The unit wins — drop the rule or change the unit.`,
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
        `No legal lineup of ${ON_FLOOR} exists -- the "never together" rules rule out every combination. Drop one of them.`,
        c.avoids.flat());
    }
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
 * does with the freedom fairness leaves it, not a licence to spend
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

/* Belt and braces on the paragraph above: centre whatever the shape produced
   so it averages to zero for this particular stint count. A cosine over eight
   samples is not exactly balanced, and the residue is a standing bias the
   solver can never satisfy. */
function centred(values) {
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
     count -- so `lastPeriodFive` still resolves to the first remaining stint of
     the real last period, which is the right answer for a suffix. Absent, every
     call is byte-identical to before; that is measured, not assumed. */
  const stints = input.stints || buildStints(format, granularity);
  const byId = new Map(players.map(p => [p.id, p]));
  const avail = availableIds.filter(id => byId.has(id));
  const issues = analyzeFeasibility({ players, availableIds: avail, constraints, stints, strategy: input.strategy });

  if (issues.some(i => i.severity === 'error')) {
    return { ok: false, stints: [], minutes: {}, spread: null, issues, seed };
  }

  const availSet = new Set(avail);
  const c = normalize(constraints, availSet);
  const avoidSet = avoidSetOf(c.avoids);
  const rng = makeRng(seed);
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

  const ctx = { stints, avail, avoidSet, capOf, minOf, credit, gameMinutes, maxSubs, minSubs, lockedSet,
                pairs: c.pairs, hardPairs: c.hardPairs, keepOn: c.keepOnFloor, tierOf,
                targetOf: id => (c.targetMinutes[id] != null ? c.targetMinutes[id] : null),
                maxConsecutive: c.maxConsecutive,
                hasCarryover: !!carryover && avail.some(id => Math.abs(credit[id]) > 1e-9) };
  ctx.firstHalf = stintsBeforeHalftime(stints);
  ctx.halfReach = ctx.firstHalf ? ON_FLOOR + Math.max(0, maxSubs) * (ctx.firstHalf - 1) : 0;
  ctx.targets = computeTargets(ctx);
  applyTieBreak(ctx, priority, seed);
  ctx.balanceTargets = balanceTargets(ctx, input.balance);

  const forcedByStint = buildForced(stints, c, format);
  let lineups;
  if (input.strategy === 'platoon' && c.units.length) {
    // the coach has already decided the fives; there is nothing to optimise
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
    ctx.balanceTargets = null;
    lineups = greedy(ctx, forcedByStint, rng);
    lineups = localSearch(lineups, ctx, forcedByStint, rng, iterations);
    if (shaped) {
      ctx.balanceTargets = shaped;
      ctx.neutralOnly = true;
      lineups = localSearch(lineups, ctx, forcedByStint, rng, iterations / 2);
      ctx.neutralOnly = false;
    }
  }

  // platoon alternates whole fives by definition; see the churn report in `finish`
  return finish(lineups, ctx, issues, { players, short, seed, stints, c,
    platoon: input.strategy === 'platoon' && c.units.length > 0 });
}

function buildForced(stints, c, format) {
  const forced = stints.map(() => new Set());
  if (c.openingFive.length) for (const id of c.openingFive) forced[0].add(id);
  if (c.lastPeriodFive.length) {
    const i = stints.findIndex(s => s.period === format.periods);
    if (i >= 0) for (const id of c.lastPeriodFive) forced[i].add(id);
  }
  // closers: the same group holds the floor for the last N stints
  if (c.closing && c.closing.players.length) {
    const from = Math.max(0, stints.length - c.closing.stints);
    for (let i = from; i < stints.length; i++) for (const id of c.closing.players) forced[i].add(id);
  }
  return forced;
}

// Units alternate wholesale. No search: the coach has already decided.
function platoonLineups(ctx, units) {
  return ctx.stints.map((s, i) => units[i % units.length].slice(0, ON_FLOOR));
}

function legalWith(id, chosen, ctx, minutes, stintLen, onStreak) {
  if (minutes[id] + stintLen > ctx.capOf(id) + 1e-9) return false;
  // a player who has already held the floor for the maximum run has to sit
  if (ctx.maxConsecutive && onStreak && onStreak[id] >= ctx.maxConsecutive) return false;
  for (const other of chosen) {
    if (ctx.avoidSet.has(pairKey(id, other))) return false;
  }
  return true;
}

function longestRun(lineups, id) {
  let run = 0, best = 0;
  for (const lu of lineups) { if (lu.includes(id)) { run++; best = Math.max(best, run); } else run = 0; }
  return best;
}

function greedy(ctx, forcedByStint, rng) {
  const { stints, avail } = ctx;
  const minutes = {};
  const sitStreak = {};
  const onStreak = {};
  for (const id of avail) { minutes[id] = 0; sitStreak[id] = 0; onStreak[id] = 0; }

  const lineups = [];
  let prev = null;
  let elapsed = 0;

  for (let s = 0; s < stints.length; s++) {
    const len = stints[s].minutes;
    const remainingAfter = stints.slice(s + 1).reduce((a, x) => a + x.minutes, 0);

    const chosen = [];
    for (const id of forcedByStint[s]) {
      if (chosen.length < ON_FLOOR && legalWith(id, chosen, ctx, minutes, len, null)) chosen.push(id);
    }

    // Anyone whose remaining minimum no longer fits in the stints left after
    // this one has to go in now.
    for (const id of avail) {
      if (chosen.length >= ON_FLOOR || chosen.includes(id)) continue;
      const need = ctx.minOf(id) - minutes[id];
      if (need > 0 && need > remainingAfter && legalWith(id, chosen, ctx, minutes, len, onStreak)) chosen.push(id);
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

    for (const id of pool) {
      if (chosen.length >= ON_FLOOR) break;
      let bonus = 0;
      for (const [a, b] of ctx.pairs) {
        if ((a === id && chosen.includes(b)) || (b === id && chosen.includes(a))) bonus += 6;
      }
      if (bonus) scores[id] += bonus;
      if (legalWith(id, chosen, ctx, minutes, len, onStreak)) chosen.push(id);
    }

    // If caps or avoids starved the lineup, fall back to anyone legal on avoids
    // alone -- an under-filled floor is worse than a busted cap, and the cap
    // shortfall gets surfaced as a warning at the end.
    if (chosen.length < ON_FLOOR) {
      for (const id of pool) {
        if (chosen.length >= ON_FLOOR) break;
        if (chosen.includes(id)) continue;
        if (chosen.every(o => !ctx.avoidSet.has(pairKey(id, o)))) chosen.push(id);
      }
    }

    const repaired = repairChurn(prev, chosen, scores, forcedByStint[s], ctx, minutes, len, onStreak);

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
function repairChurn(prev, chosen, scores, forced, ctx, minutes, len, onStreak) {
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
        if (legalWith(back, trial, ctx, minutes, len, onStreak)) {
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
        if (legalWith(inc, trial, ctx, minutes, len, onStreak)) {
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

  /* Quantised to a hundredth of a minute before it is compared. Season shares
     are averages and land on values like 0.0000000004 apart; sorting on the
     raw float would let arithmetic noise outrank the rotation. */
  const q = id => Math.round((Number(priority && priority[id]) || 0) * 100);
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
  const f = centred(ctx.stints.map((_, i) => balanceShape(shape, i, n)));
  return f.map(v => base + amp * v);
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

  // consecutive sits, and churn outside the sub window
  const streak = {};
  for (const id of ctx.avail) streak[id] = 0;
  for (let i = 0; i < lineups.length; i++) {
    for (const id of ctx.avail) {
      if (lineups[i].includes(id)) streak[id] = 0;
      else { streak[id] += 1; if (streak[id] >= 2) c += 30; }
    }
    if (i > 0) {
      const subs = lineups[i].filter(id => !lineups[i - 1].includes(id)).length;
      if (subs > ctx.maxSubs) c += (subs - ctx.maxSubs) * 40;
      if (subs < ctx.minSubs) c += (ctx.minSubs - subs) * 20;
    }
  }

  if (ctx.maxConsecutive) {
    for (const id of ctx.avail) {
      const over = longestRun(lineups, id) - ctx.maxConsecutive;
      if (over > 0) c += over * 400;
    }
  }

  if (ctx.avail.length <= ctx.halfReach) {   // see LATE_WEIGHT
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
    for (const [a, b] of ctx.pairs) {
      let apart = 0;
      lineups.forEach((lu, i) => {
        const ha = lu.includes(a), hb = lu.includes(b);
        if (ha !== hb) apart += ctx.stints[i].minutes;
      });
      c += apart * (ctx.hardPairs ? 400 : 25);
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

function applyMove(cur, mv) {
  if (mv.kind === 'single') {
    cur[mv.i] = cur[mv.i].map(id => (id === mv.outId ? mv.inId : id));
  } else {
    cur[mv.i] = cur[mv.i].map(id => (id === mv.u ? mv.v : id));
    cur[mv.j] = cur[mv.j].map(id => (id === mv.v ? mv.u : id));
  }
}

function undoMove(cur, mv, savedI, savedJ) {
  cur[mv.i] = savedI;
  if (mv.kind === 'exchange') cur[mv.j] = savedJ;
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
        const savedJ = mv.kind === 'exchange' ? cur[mv.j] : null;
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
  const gens = ctx.neutralOnly ? [exchangeSwaps] : [singleSwaps, exchangeSwaps];
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
function finish(lineups, ctx, issues, meta) {
  const { players, short, seed, stints, c, platoon } = meta;
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

  // post-hoc constraint report -- soft constraints can miss, so say so
  for (const id of ctx.avail) {
    const need = ctx.minOf(id);
    if (need && minutes[id] < need - 1e-9) {
      issues.push({
        severity: 'warn', code: 'MIN_MISSED', playerIds: [id],
        message: `${label(id)} got ${fmtMinutes(minutes[id])} minutes against a ${need}-minute minimum. The clock does not divide to hit it exactly.`,
      });
    }
    const cap = ctx.capOf(id);
    if (cap !== Infinity && minutes[id] > cap + 1e-9) {
      issues.push({
        severity: 'warn', code: 'CAP_EXCEEDED', playerIds: [id],
        message: `${label(id)} is at ${fmtMinutes(minutes[id])} minutes against a ${cap}-minute cap — there was no legal lineup that kept them under it.`,
      });
    }
  }

  if (ctx.maxConsecutive) {
    for (const id of ctx.avail) {
      const run = longestRun(lineups, id);
      if (run > ctx.maxConsecutive) {
        issues.push({
          severity: 'warn', code: 'CONSEC_EXCEEDED', playerIds: [id],
          message: `${label(id)} plays ${run} stints in a row against a limit of ${ctx.maxConsecutive} — no legal lineup kept them under it.`,
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
  if (!platoon && ctx.maxSubs > 0) {
    let over = 0, worst = 0;
    for (let i = 1; i < lineups.length; i++) {
      const subs = lineups[i].filter(id => !lineups[i - 1].includes(id)).length;
      if (subs > ctx.maxSubs) { over += 1; worst = Math.max(worst, subs); }
    }
    if (over) {
      issues.push({
        severity: 'warn', code: 'SUBS_EXCEEDED', playerIds: [],
        message: `${over === 1 ? 'One substitution puts' : `${over} substitutions put`} ${worst} players on at once, more than the ${ctx.maxSubs} you asked for — holding to your number would have cost somebody minutes.`,
      });
    }
  }

  /* The coach never asked for the halftime default, so they will not go looking
     for why it slipped: name who is waiting and give the arithmetic. The number
     that fits is the tighter of the clock and the coach's change limit, and the
     second lever is only offered when lifting it would actually help. Platoon
     is exempt for the SUBS_EXCEEDED reason: the units are the coach's. */
  if (ctx.firstHalf && !platoon) {
    const on = playedBeforeHalf(lineups, ctx);
    const late = ctx.avail.filter(id => !on.has(id));
    if (late.length) {
      const capped = ctx.halfReach < ctx.firstHalf * ON_FLOOR;
      const fits = Math.min(ctx.firstHalf * ON_FLOOR, ctx.halfReach);
      issues.push({
        severity: 'warn', code: 'HALF_LATE', playerIds: late,
        message: `${andList(late.map(label))} ${late.length === 1 ? 'does' : 'do'} not get on until the second half. ${
          ctx.avail.length > fits
            ? `Only ${fits} can play before halftime here — ${ctx.firstHalf} stint${ctx.firstHalf === 1 ? '' : 's'}${capped ? `, ${ctx.maxSubs} changes at a time` : ''} — and you have ${ctx.avail.length}. Sub more often${capped ? ', or allow more changes at once' : ''}.`
            : `No legal lineup got them on any sooner.`}`,
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
    const off = lineups.filter(lu => !lu.includes(a) && !lu.includes(b)).length;
    if (off) {
      issues.push({
        severity: 'warn', code: 'KEEPON_PARTIAL', playerIds: [a, b],
        message: `${label(a)} and ${label(b)} are both off the floor for ${off} stint${off === 1 ? '' : 's'} — no legal lineup kept one of them on.`,
      });
    }
  }

  if (free.length !== ctx.avail.length && spreadUnconstrained !== spread) {
    issues.push({
      severity: 'info', code: 'SPREAD_CONSTRAINED',
      message: `Spread is ${fmtMinutes(spread)} minutes overall, ${fmtMinutes(spreadUnconstrained)} among the players without a minimum or cap.`,
      playerIds: [],
    });
  }
  // Where the spread is deliberate -- hand-set targets, or carryover evening
  // out the day -- the single-game floor is the wrong benchmark and saying
  // "best possible is 0" is just wrong.
  const pinnedTargets = ctx.avail.filter(id => ctx.targetOf(id) != null);
  if (pinnedTargets.length) {
    issues.push({
      severity: 'info', code: 'TARGETS_ACTIVE',
      message: pinnedTargets.length === ctx.avail.length
        ? `Minutes are set by hand for every player.`
        : `Minutes are set by hand for ${pinnedTargets.map(label).join(', ')}; everyone else splits what is left.`,
      playerIds: pinnedTargets,
    });
  } else if (ctx.hasCarryover) {
    const up = ctx.avail.filter(id => ctx.credit[id] > 1e-9)
      .sort((a, b) => ctx.credit[b] - ctx.credit[a]).slice(0, 3).map(label);
    issues.push({
      severity: 'info', code: 'CARRYOVER_ACTIVE',
      message: up.length
        ? `Minutes are deliberately uneven here to even out the day — ${up.join(', ')} came in light and are being caught up.`
        : `Balanced against minutes already played today.`,
      playerIds: [],
    });
  } else if (spread === 0) {
    issues.push({
      severity: 'info', code: 'SPREAD_EVEN',
      message: `Minutes divide evenly: every player gets ${fmtMinutes(minutes[ctx.avail[0]])}.`,
      playerIds: [],
    });
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
    if (lows.length + highs.length === ctx.avail.length) {
      who = lows.length <= 6
        ? ` ${andList(lows.map(label))} ${lows.length === 1 ? 'plays' : 'play'} ${fmtMinutes(lo)}.`
        : ` ${lows.length} players play ${fmtMinutes(lo)}, the other ${highs.length} play ${fmtMinutes(hi)}.`;
    }
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
