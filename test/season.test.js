import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* ================================================================== *
 * the day ends, and its games become the season
 *
 * `test/storage.test.js` holds the record's shape and its migration.
 * This file holds the other half: that the thing filed into the season
 * is what actually happened on the floor.
 *
 * It exercises the real `state.js`, plans and all, rather than a copy --
 * the whole point is that `archiveDay` and `effectiveMinutes` agree, and
 * a reimplementation here would agree with itself. state.js reaches for
 * a canvas at import time (`dom.js` keeps one for text measurement), so
 * a two-line stub stands in for the document; nothing below renders.
 * ================================================================== */
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
};
const S = await import('../app/state.js');

const NAMES = ['Marcus', 'Eli', 'Devon', 'Kade', 'Aaron', 'Jack',
               'Leighton', 'Nia', 'Cole', 'Reese'];

/* One team, ten players, a two-game Saturday. Written straight onto the
   record rather than through the accessors, because that is the shape the
   sanitiser produces. */
function setup({ games = 2, dayName = 'Sat at Northgate' } = {}) {
  const t = {
    id: 't1', name: 'Wildcats', activeGame: 0,
    players: NAMES.map((name, i) => ({ id: 'p' + i, name, number: String(i + 1), shortName: '', tier: 3, hue: i })),
    day: { name: dayName, games: [] },
    season: { games: [] },
  };
  for (let i = 0; i < games; i++) {
    const g = S.newGame(i);
    g.id = 'g' + i;
    g.label = ['Northgate', 'Kingsway'][i] || '';
    g.seed = 1000 + i;
    t.day.games.push(g);
  }
  S.state.teams = [t];
  S.state.activeTeam = 0;
  S.computeAll();
  return t;
}

const total = m => Math.round(Object.values(m).reduce((a, x) => a + x, 0) * 100) / 100;

test('a day of games lands in the season with its minutes', () => {
  const t = setup();
  const added = S.archiveDay(new Date(2026, 10, 8, 20, 30));

  assert.equal(added, 2, 'both games finished');
  assert.equal(t.season.games.length, 2);
  const [a, b] = t.season.games;
  assert.deepEqual(a.minutes, S.plans[0].minutes, 'an unswapped game files the plan it printed');
  assert.equal(a.id, 'g0');
  assert.equal(a.opponent, 'Northgate');
  assert.equal(a.day, 'Sat at Northgate');
  assert.equal(a.date, '2026-11-08', 'the coach\'s own day, not UTC');
  assert.equal(a.periods, 4);
  assert.equal(a.periodMinutes, 8);
  assert.equal(b.opponent, 'Kingsway');
  // five on the floor for every minute of a 32-minute game
  assert.equal(total(a.minutes), 160);
});

test('the season counts who actually played, not who the plan said', () => {
  /* The one thing that makes this record worth keeping. A coach who swapped
     Ben on for Devon in bench mode changed the minutes; filing `plan.minutes`
     would make the season the plan's opinion of the afternoon rather than the
     afternoon. */
  const t = setup({ games: 1 });
  const g = t.day.games[0];
  const p = S.plans[0];

  const k = 2;                                    // some mid-game stint
  const on = p.stints[k].onFloor;
  const benched = S.state.players.map(x => x.id).find(id => !on.includes(id));
  const swappedOut = on[0];
  g.live = { at: k, overrides: { [k]: [benched, ...on.slice(1)] } };
  S.computeAll();                                  // stamps the override

  const eff = S.effectiveMinutes(g, S.plans[0]);
  assert.notDeepEqual(eff, S.plans[0].minutes, 'the swap moved the minutes');

  S.archiveDay(new Date(2026, 10, 8));
  const filed = t.season.games[0].minutes;
  assert.deepEqual(filed, eff);
  assert.ok(filed[benched] > S.plans[0].minutes[benched], 'the kid who came on gained minutes');
  assert.ok(filed[swappedOut] < S.plans[0].minutes[swappedOut], 'the kid who sat lost them');
  assert.equal(total(filed), 160, 'and the floor still had five on it all game');
});

test('a game that never produced a rotation is not a game that was played', () => {
  // four available cannot field a lineup, so the plan fails -- there is no
  // honest set of minutes to file, and `p.ok` is the signal
  const t = setup({ games: 2 });
  t.day.games[1].out = S.state.players.slice(4).map(p => p.id);
  S.computeAll();
  assert.equal(S.plans[1].ok, false, 'fixture check: the second game does not solve');

  assert.equal(S.archiveDay(), 1);
  assert.deepEqual(t.season.games.map(g => g.id), ['g0']);
});

test('archiving twice cannot double a kid\'s season', () => {
  const t = setup();
  assert.equal(S.archiveDay(), 2);
  assert.equal(S.archiveDay(), 0, 'the same games are already filed');
  assert.equal(t.season.games.length, 2);
});

test('a team with no season yet gets one rather than throwing', () => {
  const t = setup({ games: 1 });
  delete t.season;
  assert.equal(S.archiveDay(), 1);
  assert.equal(t.season.games.length, 1);
  t.season = { games: 'not an array' };
  S.state.teams[0].day.games[0].id = 'g-later';
  S.computeAll();
  assert.equal(S.archiveDay(), 1, 'a junk season is replaced, not appended to');
  assert.equal(t.season.games.length, 1);
});

test('the season belongs to the team, and follows the active one', () => {
  const first = setup({ games: 1 });
  const second = { ...first, id: 't2', name: 'Ravens', season: { games: [] },
                   day: { name: '', games: [{ ...S.newGame(0), id: 'gz' }] } };
  S.state.teams.push(second);
  S.archiveDay();
  assert.equal(first.season.games.length, 1);
  assert.equal(second.season.games.length, 0, 'the other team\'s history is untouched');

  S.state.activeTeam = 1;
  assert.equal(S.state.season, second.season, 'the accessor follows the active team');
  S.state.activeTeam = 0;
});

/* ---- the accessor, and why it must stay non-enumerable ---- */

test('state.season is a non-enumerable accessor, so no record gains a second copy', () => {
  /* `saveState` and `backupText` both serialise with JSON.stringify, which
     walks own *enumerable* properties. An enumerable getter here would write
     the active team's season a second time at the top of the record, and on
     the next load the two would disagree -- the same trap `players` and `day`
     have carried since multi-team. */
  const t = setup({ games: 1 });
  S.archiveDay();

  const d = Object.getOwnPropertyDescriptor(S.state, 'season');
  assert.ok(d && typeof d.get === 'function', 'season is an accessor');
  assert.equal(d.enumerable, false);
  assert.ok(!Object.keys(S.state).includes('season'));

  const written = JSON.parse(JSON.stringify(S.state));
  assert.ok(!('season' in written), 'the saved record must carry one season, on the team');
  assert.equal(written.teams[0].season.games.length, 1);
  assert.equal(S.state.season, t.season, 'and reading it still reaches the active team');
});

test('replaceState swaps the record without losing the season accessor', () => {
  // undo and a restored backup both go through here
  const t = setup({ games: 1 });
  S.archiveDay();
  const snapshot = JSON.parse(JSON.stringify(S.state));
  t.season.games = [];
  assert.equal(S.state.season.games.length, 0);

  S.replaceState(snapshot);
  assert.equal(S.state.season.games.length, 1, 'undo puts the season back');
  assert.ok(!Object.keys(S.state).includes('season'), 'and the accessor survived the sweep');
});

/* ---- where archiving is wired in ---- */

test('"New day" archives inside the undo snapshot, not before it', () => {
  /* Order is the whole contract. `undoable` clones the record first and then
     runs the mutation, so archiving inside it means Undo restores the season
     exactly as it was along with the day -- no second un-archive path to keep
     honest. Hoisting the call above `undoable(` would put the archived games
     inside the snapshot and Undo would leave them behind, silently. */
  const src = readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function startNewDay'));
  const fn = body.slice(0, body.indexOf('\n}'));
  assert.ok(fn.includes('archiveDay('), 'startNewDay must file the day into the season');
  assert.ok(fn.indexOf('undoable(') < fn.indexOf('archiveDay('),
    'archiveDay must run inside undoable\'s mutation, after the snapshot is taken');
});

/* ================================================================== *
 * B3 -- the season feeds back into the plan
 *
 * The toggle opens each player's minute target adjusted by how far off
 * their share of the season they are. It is an INPUT: everything below
 * arrives at the solver as `constraints.targetMinutes`, which the engine
 * has always taken, and nothing in `engine.js` changed for it.
 * ================================================================== */

/* A season where `light` is two minutes down and `heavy` two minutes up in
   every filed game, which is exactly the drift the feature exists for: the
   remainder minutes stint arithmetic has to drop on somebody, week after
   week. `extra` is folded into every game, for ids that are not on the roster. */
function seasonOf(t, { games = 3, light = 'p0', heavy = 'p9', by = 2, extra = {} } = {}) {
  t.season = { games: [] };
  for (let i = 0; i < games; i++) {
    const minutes = {};
    for (const p of t.players) minutes[p.id] = 16;
    minutes[light] = 16 - by;
    minutes[heavy] = 16 + by;
    Object.assign(minutes, extra);
    t.season.games.push({ id: 'sg' + i, date: '2026-01-0' + (i + 1), day: '', opponent: 'X',
      periods: 4, periodMinutes: 8, minutes });
  }
}
const adjOf = id => S.seasonAdjust[id];

test('a season nobody has opened changes nothing at all', () => {
  const t = setup({ games: 1 });
  const before = { ...S.plans[0].minutes };
  seasonOf(t);
  S.computeAll();
  assert.equal(t.day.games[0].useSeasonTargets, false, 'off by default, and not inherited');
  assert.deepEqual(S.plans[0].minutes, before, 'a filed season is history until a coach asks for it');
  assert.equal(adjOf('g0'), undefined, 'and nothing is even computed');
});

test('the switch opens the player who is behind higher, and the plan follows', () => {
  const t = setup({ games: 1 });
  seasonOf(t);                                   // p0 six down, p9 six up
  t.day.games[0].useSeasonTargets = true;
  S.computeAll();

  const a = adjOf('g0');
  assert.equal(a.reason, 'ok');
  assert.equal(a.even, 16, 'ten available, 32 minutes, five on the floor');
  assert.equal(Math.round(a.deficit.p0 * 100) / 100, 6, 'three games at two minutes light');
  assert.ok(a.targets.p0 > 16 && a.targets.p9 < 16, 'the numbers the solver was handed');
  // the sum is the condition under which the engine honours targets at all
  const sum = Object.values(a.targets).reduce((x, y) => x + y, 0);
  assert.ok(Math.abs(sum - 160) < 1e-6, 'the targets add up to the floor budget exactly');

  assert.ok(S.plans[0].minutes.p0 > S.plans[0].minutes.p9, 'and the plan actually moves');
  assert.equal(Object.values(S.plans[0].minutes).reduce((x, y) => x + y, 0), 160,
    'five on the floor for every minute, still');
});

test('the coach is told the season set the minutes, not their own hand', () => {
  const t = setup({ games: 1 });
  seasonOf(t);
  t.day.games[0].useSeasonTargets = true;
  S.computeAll();
  const info = S.plans[0].issues.find(i => i.code === 'TARGETS_ACTIVE');
  assert.ok(info, 'the solver still reports that targets are in play');
  assert.match(info.message, /season/i);
  assert.doesNotMatch(info.message, /set by hand for every player/,
    'they were not set by hand -- a number that moved with a wrong reason beside it is worse than none');
});

test('a locked row is a promise and carryover does not touch it', () => {
  /* Carryover is a suggestion; a lock is a promise, weighted 1000/min against
     60. So a locked player is left out of the pinned set entirely rather than
     handed a target -- giving them one would promote the suggestion to a pin
     on its way past the lock. */
  const t = setup({ games: 1 });
  seasonOf(t, { light: 'p1' });
  const g = t.day.games[0];
  g.constraints.lockedTargets = ['p1'];
  g.useSeasonTargets = true;
  S.computeAll();

  const a = adjOf('g0');
  assert.deepEqual(a.locked, ['p1']);
  assert.ok(!('p1' in a.targets), 'the locked row is given no target at all');
  assert.equal(S.plans[0].minutes.p1, 16, 'so it water-fills to the plain even share');
  assert.equal(Object.values(S.plans[0].minutes).reduce((x, y) => x + y, 0), 160);
});

test('hand-set minutes are the hand-set targets, and carryover stands aside', () => {
  const t = setup({ games: 1 });
  seasonOf(t);
  const g = t.day.games[0];
  g.strategy = 'minutes';
  g.useSeasonTargets = true;
  S.computeAll();
  const withSwitch = { ...S.plans[0].minutes };
  assert.equal(adjOf('g0').reason, 'strategy', 'and it says so rather than doing it silently');

  g.useSeasonTargets = false;
  S.computeAll();
  assert.deepEqual(S.plans[0].minutes, withSwitch,
    'the sliders are already the coach\'s numbers; nothing may move them underneath');
});

test('a cap on the game is not crossed to catch anybody up', () => {
  const t = setup({ games: 1 });
  seasonOf(t, { by: 6 });                        // p0 eighteen minutes down
  const g = t.day.games[0];
  g.constraints.maxMinutes = { p0: 18 };
  g.useSeasonTargets = true;
  S.computeAll();
  assert.ok(adjOf('g0').targets.p0 <= 18 + 1e-9, 'the target respects the cap');
  assert.ok(S.plans[0].minutes.p0 <= 18, 'and so does the plan');
});

test('an id that has left the roster counts toward the mean and breaks nothing', () => {
  const t = setup({ games: 1 });
  seasonOf(t, { extra: { pGONE: 16, pALSOGONE: 16 } });
  t.day.games[0].useSeasonTargets = true;
  S.computeAll();
  const a = adjOf('g0');
  assert.equal(S.plans[0].ok, true, 'a season id that is no longer on the roster is not a crash');
  assert.ok(!('pGONE' in a.targets), 'they get no target -- they are not in the gym');
  assert.ok(a.targets.p0 > 16, 'and the player who is behind is still caught up');
});

test('a player who joined late is neither owed nor in credit', () => {
  const t = setup({ games: 1 });
  seasonOf(t);
  // the new kid was at none of the filed games
  t.players.push({ id: 'pNEW', name: 'Rowan', number: '20', shortName: '', tier: 3, hue: 10 });
  t.day.games[0].useSeasonTargets = true;
  S.computeAll();
  const a = adjOf('g0');
  assert.equal(a.deficit.pNEW, 0, 'you cannot be behind on games you were not at');
  assert.equal(Math.round(a.even * 100) / 100, Math.round((160 / 11) * 100) / 100);
  assert.ok(Math.abs(a.targets.pNEW - a.even) < 1e-9, 'so they open on the plain even share');
});

test('two games in a day do not correct the same deficit twice', () => {
  /* Without today's earlier games folded in, game 2 corrects a deficit game 1
     has already paid off and the kid is paid twice. Today's are read as
     PLANNED minutes, the same choice `cum` makes: a hand swap in game 1 must
     not silently re-solve game 2 underneath the coach. */
  const t = setup({ games: 2 });
  seasonOf(t);
  for (const g of t.day.games) g.useSeasonTargets = true;
  S.computeAll();

  const one = adjOf('g0'), two = adjOf('g1');
  assert.ok(one.deficit.p0 > 5, 'fixture check: six minutes down going in');
  assert.ok(two.deficit.p0 < one.deficit.p0 - 1,
    'game 1 paid some of it back, so game 2 sees a smaller debt');
  assert.ok(two.targets.p0 < one.targets.p0, 'and asks for less');
});

test('turning the switch back off restores exactly the plan that was there', () => {
  // nothing is written to the record but one boolean, which is what makes an
  // opt-in safe: it is a lens, not an edit
  const t = setup({ games: 1 });
  seasonOf(t);
  const g = t.day.games[0];
  const before = { ...S.plans[0].minutes };
  const constraintsBefore = JSON.stringify(g.constraints);
  g.useSeasonTargets = true;
  S.computeAll();
  assert.notDeepEqual(S.plans[0].minutes, before);
  g.useSeasonTargets = false;
  S.computeAll();
  assert.deepEqual(S.plans[0].minutes, before);
  assert.equal(JSON.stringify(g.constraints), constraintsBefore, 'and no target was ever stored');
  assert.equal(adjOf('g0'), undefined);
});

test('the carryover panel repaints on a solve, and the rules section does not', () => {
  /* The panel is the only thing in `rules.js` that depends on a SOLVE, so it
     goes stale the moment a player is marked absent or the format moves --
     and `constraints` cannot join the edit lists to fix that, because the rule
     editor holds a select and two number inputs a coach may be part-way
     through. Hence its own in-place section, the same shape `budget` uses. */
  const render = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');
  assert.match(render, /seasonadj:\s*\(\) => renderSeasonAdjust\(\)/,
    'render.js no longer registers the carryover panel, so nothing refreshes it');
  const list = key => render.match(new RegExp(`export const ${key} = \\[([^\\]]*)\\]`))[1];
  for (const key of ['AFTER_EDIT', 'PLAN_ONLY']) {
    assert.ok(list(key).includes("'seasonadj'"), `${key} must refresh the carryover panel`);
    assert.ok(!list(key).includes("'constraints'"),
      `${key} must not rebuild the rules section under a coach's fingers`);
  }
});

/* ================================================================== *
 * who plays the odd stint, and why the coach is told
 *
 * Eleven available over eight 4-minute stints does not divide: seven play
 * 16 and four play 12. `engine.js` picks who, from a number this module
 * hands it, and it is never told what the number means. These are the
 * other half -- that the number really is the season, and that the line a
 * coach reads says so only when it is true.
 * ================================================================== */
function elevenAvailable() {
  const t = setup({ games: 1 });
  t.players.push({ id: 'p10', name: 'Sawyer', number: '11', shortName: '', tier: 3, hue: 10 });
  return t;
}

const floorLine = () => S.plans[0].issues.find(i => i.code === 'SPREAD_FLOOR');
const shortIds = () => {
  const m = S.plans[0].minutes;
  const lo = Math.min(...Object.values(m));
  return Object.keys(m).filter(id => m[id] === lo).sort();
};

test('a season ahead is what decides who plays the odd stint short', () => {
  const t = elevenAvailable();
  // two players are 6 minutes up on their share; nobody else has a history
  t.season.games = [{
    id: 'sg1', date: '2026-09-14', day: '', opponent: 'Falcons', periods: 4, periodMinutes: 8,
    minutes: Object.fromEntries(t.players.map(p => [p.id, ['p4', 'p9'].includes(p.id) ? 20 : 14])),
  }];
  S.computeAll();
  const short = shortIds();
  assert.ok(short.includes('p4') && short.includes('p9'),
    `the two players furthest ahead should give up the stint, got ${short.join(', ')}`);
  assert.match(floorLine().message, /furthest ahead on the season so far/);
  assert.match(floorLine().message, /Aaron/);
  assert.match(floorLine().message, /Reese/);
});

test('with no history at all the line does not invent a reason', () => {
  elevenAvailable();
  S.computeAll();
  const line = floorLine();
  assert.ok(line, 'no floor line');
  assert.ok(!/furthest ahead/.test(line.message), 'claimed a season that does not exist');
  assert.match(line.message, /rotates/);
  // and it points at the two controls that actually move it
  assert.match(line.message, /Shuffle/);
  assert.match(line.message, /minutes by hand/);
});

test('the short end named on the line is the short end on the card', () => {
  const t = elevenAvailable();
  t.season.games = [{
    id: 'sg1', date: '2026-09-14', day: '', opponent: 'Falcons', periods: 4, periodMinutes: 8,
    minutes: Object.fromEntries(t.players.map(p => [p.id, p.id === 'p2' ? 24 : 14])),
  }];
  S.computeAll();
  assert.deepEqual([...floorLine().playerIds].sort(), shortIds(),
    'the ids on the line and the minutes on the plan disagree');
});
