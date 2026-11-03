import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { S, bareGame, withTeam, player, finishGame } from './state-fixture.js';
import { writeOverrides } from '../app/live.js';
import { sanitize } from '../app/storage.js';
import { encode, decode } from '../app/handoff.js';

/* #572: a game with no swaps hands the rest of the day the same minutes whether
   it is unplayed, underway or finished, so counting played minutes (rather than
   planned ones) must not move a single plan. Seam: `computeAll` (state.js) over
   a seeded day. */

/* FINGERPRINTS were taken at f22c36a, before #572 changed anything under app/.
   Per shape: the fives, minutes and issue codes of every game of the day, for
   seeds 1-20, three ways: no game started, game 1 started (live.at = 2) with no
   swaps, game 1 finished with no swaps. Two- and three-game days, the later
   games on Even with carryover on. They are re-taken only when the planning is
   meant to change. PRINT_FINGERPRINTS=1 prints them. */
const FINGERPRINTS = {
  '4x8/4 10kids 2games': { planned: 'db13649e1f34', started: 'db13649e1f34', finished: 'db13649e1f34' },
  '2x12/4 9kids 3games': { planned: 'c1b4a66ef58a', started: 'c1b4a66ef58a', finished: 'c1b4a66ef58a' },
  '4x9/3 11kids 2games': { planned: 'f8cfc6ef76b0', started: 'f8cfc6ef76b0', finished: 'f8cfc6ef76b0' },
  '4x8/2 10kids 3games': { planned: '066e6cb0ac50', started: '066e6cb0ac50', finished: '066e6cb0ac50' },
};
// [periods, periodMinutes, granValue, kids, games]
const SHAPES = [[4, 8, 4, 10, 2], [2, 12, 4, 9, 3], [4, 9, 3, 11, 2], [4, 8, 2, 10, 3]];
const sha = text => createHash('sha1').update(text).digest('hex').slice(0, 12);

const fingerprints = () => {
  const out = {}, good = {};
  for (const [periods, periodMinutes, granValue, kids, nGames] of SHAPES) {
    const key = `${periods}x${periodMinutes}/${granValue} ${kids}kids ${nGames}games`;
    const ids = Array.from({ length: kids }, (_, i) => `p${i}`);
    const rows = { planned: [], started: [], finished: [] };
    good[key] = { planned: 0, started: 0, finished: 0, live: 0 };
    for (let seed = 1; seed <= 20; seed++) {
      for (const way of ['planned', 'started', 'finished']) {
        const games = Array.from({ length: nGames }, (_, i) => bareGame({
          id: `g${i}`, seed: seed * 10 + i, periods, periodMinutes, granValue,
          out: i === 0 ? [ids[kids - 1]] : i === 1 && nGames === 3 ? [ids[0]] : [],
          useCarryover: i > 0,
        }));
        const row = withTeam(ids.map(id => player(id)), games, {}, () => {
          S.computeAll();
          if (way === 'started') games[0].live = { at: 2, overrides: {} };
          if (way === 'finished') finishGame(games[0], S.plans[0]);
          S.computeAll();
          if (way !== 'planned' && !S.plans.every(p => p.ok)) return 'blocked';
          if (S.plans.every(p => p.ok)) good[key][way]++;
          if (way === 'started' && S.plans.slice(1).some(p => p.issues.some(i => i.code === 'CARRYOVER_ACTIVE'))) good[key].live++;
          return JSON.stringify(S.plans.map(p => [p.ok, p.stints?.map(s => s.onFloor), p.minutes, p.issues.map(i => i.code)]));
        });
        rows[way].push(row);
      }
    }
    out[key] = Object.fromEntries(Object.entries(rows).map(([way, r]) => [way, sha(r.join('\n'))]));
  }
  return { out, good };
};

test('a day with no swaps plans the same fives, minutes and notes whether game 1 is unplayed, underway or finished', () => {
  const { out: got, good } = fingerprints();
  if (process.env.PRINT_FINGERPRINTS) console.log(JSON.stringify(got, null, 2), JSON.stringify(good));
  assert.deepEqual(got, FINGERPRINTS);
  // each row guards real plans: most of the 20 seeds plan every game of the day
  for (const [key, rows] of Object.entries(good)) for (const [row, n] of Object.entries(rows)) if (row !== 'live') assert.ok(n >= 15, `${key} ${row}: only ${n} of 20 seeds gave plans`);
  for (const [key, rows] of Object.entries(good)) assert.ok(rows.live >= 10, `${key}: carryover was live in only ${rows.live} of 20 seeds, so the fingerprint proves little`);
  for (const way of ['planned', 'started', 'finished']) {
    assert.equal(new Set(Object.values(FINGERPRINTS).map(f => f[way])).size, SHAPES.length, `two shapes share a ${way} fingerprint`);
  }
});

/* Two games, 10 kids on Even, a change every 4 minutes (8 stints of 4). Game 2
   evens out the earlier game. In game 1 stint 1 is played; then a hand swap
   takes `A` off for stint 2 (index 1), a stint they were planned to play. */
const IDS = Array.from({ length: 10 }, (_, i) => `p${i}`);
const twoGames = () => [
  bareGame({ id: 'g0', seed: 3, periods: 4, periodMinutes: 8, granValue: 4 }),
  bareGame({ id: 'g1', seed: 4, periods: 4, periodMinutes: 8, granValue: 4, useCarryover: true }),
];
const inTwoGames = (fn) => {
  const games = twoGames();
  return withTeam(IDS.map(id => player(id)), games, {}, () => { S.computeAll(); return fn(games); });
};
const swapOff = (g, kid, k) => {
  const floor = S.plans[0].stints[k].onFloor;
  const bench = IDS.find(id => !floor.includes(id));
  writeOverrides(g.live, { [k]: floor.map(id => (id === kid ? bench : id)) }, true);
};

test('a kid swapped off for one 4-minute stint in game 1 gets those 4 minutes back in game 2', () => {
  inTwoGames(games => {
    games[0].live = { at: 1, overrides: {} };
    S.computeAll();
    const kid = S.plans[0].stints[1].onFloor.find(id => S.plans[0].stints[0].onFloor.includes(id));
    const before = S.plans[1].minutes[kid];
    assert.equal(before, 16, 'the premise: planned level with everyone');
    swapOff(games[0], kid, 1);
    S.computeAll();
    assert.equal(S.effectiveMinutes(games[0], S.plans[0])[kid], 12, 'the premise: the swap took 4 minutes off');
    assert.equal(S.plans[1].minutes[kid], before + 4);
  });
});

test('after a swap in a started game 1 the day chart totals are level, because game 2 evened out what was played', () => {
  inTwoGames(games => {
    games[0].live = { at: 1, overrides: {} };
    S.computeAll();
    const kid = S.plans[0].stints[1].onFloor.find(id => S.plans[0].stints[0].onFloor.includes(id));
    swapOff(games[0], kid, 1);
    S.computeAll();
    assert.deepEqual(IDS.map(id => S.dayTotals[id]), IDS.map(() => 32));
  });
});

test('a game that has not started hands later games its planned minutes, even with a swap made before tip-off', () => {
  inTwoGames(games => {
    games[0].live = { at: 0, overrides: {} };
    S.computeAll();
    const planned = { ...S.plans[1].minutes };
    const kid = S.plans[0].stints[1].onFloor[0];
    swapOff(games[0], kid, 1);
    S.computeAll();
    assert.deepEqual(S.plans[1].minutes, planned);
  });
});

/* The Season day chart says later games even out "automatically" only for the
   later games that do (item 5). Seam: `dayChartNote` (state.js), the sentence
   renderDayTotals ends its note with. */
const dayOf = (...later) => [{ strategy: 'balanced' }, ...later.map(l => ({ strategy: 'balanced', useCarryover: true, ...l }))];
const flat = s => s.replace(/\s+/g, ' ');

test('every later game evens out: the chart says later games even out against the day', () => {
  assert.equal(S.dayChartNote(dayOf({}, {})), 'Later games even out against this automatically.');
  assert.equal(S.dayChartNote(dayOf({})), 'Later games even out against this automatically.');
});

test('some later games even out: the chart names them by tip-off, else opponent', () => {
  const one = dayOf({ tipoff: '14:30' }, { tipoff: '16:00', useCarryover: false });
  assert.equal(flat(S.dayChartNote(one)), 'The 2:30 PM game evens out against this automatically.');
  const two = dayOf({ tipoff: '14:30' }, { tipoff: '16:00' }, { tipoff: '17:00', useCarryover: false });
  assert.equal(flat(S.dayChartNote(two)), 'The 2:30 PM and 4:00 PM games even out against this automatically.');
  const opp = dayOf({ tipoff: '14:30' }, { label: 'Owls' }, { tipoff: '17:00', useCarryover: false });
  assert.equal(flat(S.dayChartNote(opp)), 'The 2:30 PM and Owls games even out against this automatically.');
});

test('some later games even out and one has neither tip-off nor opponent: the chart counts them', () => {
  assert.equal(S.dayChartNote(dayOf({}, { useCarryover: false })), '1 later game evens out against this automatically.');
  assert.equal(S.dayChartNote(dayOf({}, { tipoff: '16:00' }, { useCarryover: false })), '2 later games even out against this automatically.');
});

test('no later game evens out, whether on Platoon, Order or with the switch off: the chart says nothing of it', () => {
  assert.equal(S.dayChartNote(dayOf({ strategy: 'platoon' }, { strategy: 'platoon' })), '');
  assert.equal(S.dayChartNote(dayOf({ strategy: 'order' })), '');
  assert.equal(S.dayChartNote(dayOf({ useCarryover: false }, { useCarryover: false })), '');
});

test('Platoon and Order games are left out of the names while the others are named', () => {
  const mixed = dayOf({ tipoff: '14:30', strategy: 'order' }, { tipoff: '16:00' });
  assert.equal(flat(S.dayChartNote(mixed)), 'The 4:00 PM game evens out against this automatically.');
});

/* Item 7: the minute range sits right after the strategy words in a pass's
   summary, from effectiveMinutes, only when the plan is ok. Game 1 sits p9 out
   and game 2 evens out the day, so game 2's range is 12 to 24 (a kid who sat
   plays 24 and the four who played most play 12). */
test('a pass summary carries the minute range after the strategy words, once the plan is ok', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  const day = [bareGame({ id: 'g0', seed: 1, out: ['p9'] }), bareGame({ id: 'g1', seed: 2, useCarryover: true })];
  withTeam(ids.map(id => player(id)), day, {}, () => {
    S.computeAll();
    assert.equal(S.passSummary(day[0], 0, S.plans[0]), '9 players · even minutes · 16–20 min each');
    assert.equal(S.passSummary(day[1], 1, S.plans[1]), '10 players · even minutes · 12–24 min each · evens out the day');
    assert.equal(S.passSummary(day[1], 1, { ok: false, issues: [] }), '10 players · even minutes · evens out the day');
    assert.equal(S.passSummary(day[1], 1), '10 players · even minutes · evens out the day');
  });
});

test('equal minutes read as one number in the pass summary range', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
  const day = [bareGame({ id: 'g0', seed: 1 })];
  withTeam(ids.map(id => player(id)), day, {}, () => {
    S.computeAll();
    assert.equal(S.passSummary(day[0], 0, S.plans[0]), '10 players · even minutes · 16 min each');
  });
});

/* Item 8: the printed stamp is saved with the game and is not handed off. */
const NINE = Array.from({ length: 9 }, (_, i) => `p${i}`);
const emptyConstraints = () => ({ minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [], openingFive: [],
  lastPeriodFive: [], hardPairs: false, maxConsecutive: 0, targetSlots: {}, lockedTargets: [],
  closing: { stints: 2, players: [] }, units: [] });
const newGame = () => ({ id: 'gnew', label: '', tipoff: '', periods: 4, periodMinutes: 8, granMode: 'everyN',
  granValue: 4, out: [], useCarryover: false, strategy: 'balanced', balance: 'even',
  live: { at: 0, overrides: {} }, seed: 1, constraints: emptyConstraints() });
const loadedGame = extra => sanitize({ version: 4, onboarded: true, teams: [{ id: 't', name: 'T',
  players: NINE.map(id => ({ id, name: id })),
  days: [{ name: '', date: '2026-09-26', games: [{ id: 'g1', ...extra }] }] }] },
{ emptyConstraints, newGame, migrateLegacy: () => null }).teams[0].days[0].games[0];

test('a game keeps its printed stamp through a save and load only when it is a non-empty string', () => {
  assert.equal(loadedGame({ printed: 'k3j9a' }).printed, 'k3j9a');
  for (const bad of ['', 7, true, null, {}]) assert.equal('printed' in loadedGame({ printed: bad }), false, JSON.stringify(bad));
  assert.equal('printed' in loadedGame({}), false);
});

test('a handed-off game arrives without a printed stamp, even from a link that carries one', async () => {
  const players = NINE.map((id, i) => ({ id, name: id, number: String(i), tier: 3 }));
  const g = bareGame({ id: 'gh', seed: 5, printed: 'k3j9a' });
  const team = { id: 't', name: 'T', players, settings: {}, days: [{ name: '', date: '2026-09-22', games: [g] }] };
  await withTeam(players, [g], {}, async () => {
    S.computeAll();
    const hash = await encode(team, g, S.plans[0].stints.map(s => s.onFloor));
    const bytes = Uint8Array.from(atob(hash.slice(4).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const doc = JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
    doc.g.printed = 'k3j9a';   // a hand-edited link
    const packed = new Uint8Array(await new Response(new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const link = '#p=1' + btoa(String.fromCharCode(...packed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const got = await decode(link);
    assert.ok(got, 'the edited link still decodes');
    assert.equal('printed' in got.team.days[0].games[0], false);
  });
});
