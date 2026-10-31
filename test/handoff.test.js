import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame } from './state-fixture.js';
import * as L from '../app/live.js';
import { seasonDate } from '../app/storage.js';
import { benchHeaderText } from '../app/gamemode.js';
import { encode, decode, receive } from '../app/handoff.js';

/* #250: hand a game to an assistant in a link. Seam: handoff.js's exports
   under node --test (spec 250, Proof table). The fixture is the spec's:
   12 kids with first and last names (two share a first name), 4 x 8, sub
   every 2 (16 stints), 3 rules (a cap, a pair, an apart), underway at
   stint 5 with one hand swap. Expected values come from the spec. */
const KIDS = [
  ['Priya', 'Raman'], ['Priya', 'Shah'], ['Marcus', 'Okafor'], ['Dev', 'Patel'],
  ['Lena', 'Kowalski'], ['Tomas', 'Hernandez'], ['Aiden', 'Brooks'], ['Zoe', 'Lindqvist'],
  ['Noah', 'Fitzgerald'], ['Ivy', 'Nakamura'], ['Omar', 'Haddad'], ['Ruth', 'Castellanos'],
];
const LAST_NAMES = KIDS.map(k => k[1]);
const ids = KIDS.map((_, i) => `p${(i * 7919 + 104729).toString(36)}x${i}`);

/* Builds the sender's team on the live state, solves it, tips it off to
   stint 5 and makes one hand swap in stint 7 -- the way bench mode does. */
function sender() {
  const players = KIDS.map(([f, l], i) => ({
    id: ids[i], name: `${f} ${l}`, number: String(i + 3), shortName: '', tier: 1 + (i % 5), hue: i,
  }));
  const g = bareGame({
    id: 'gHawks1', granValue: 2, seed: 4242, balance: 'both', out: [ids[11]],
    constraints: {
      ...S.emptyConstraints(),
      maxMinutes: { [ids[2]]: 14 }, pairs: [[ids[0], ids[3]]], avoids: [[ids[4], ids[5]]],
    },
    live: { at: 0, overrides: {} },
  });
  const team = {
    id: 'tHawks', name: 'Hawks', players,
    days: [{ name: '', date: '2026-09-12', games: [g] }], activeDay: 0, activeGame: 0,
    season: { games: [{ id: 'sg1', opp: 'Wolves' }] }, settings: { color: 'hardwood' },
  };
  S.state.teams = [team]; S.state.activeTeam = 0;
  S.computeAll();
  g.live.at = 5;
  S.computeAll();
  const eff = S.effectiveStints(g, S.plans[0]);
  const five = [...eff[7].onFloor];
  const sitting = eff[7].sitting.find(id => id !== ids[11]);
  five[0] = sitting;
  L.writeOverrides(g.live, { 7: five }, true);
  S.computeAll();
  return { team, g, p: S.plans[0] };
}
const floorOf = (g, p) => S.effectiveStints(g, p).map(s => s.onFloor);

test('size: the whole URL for the fixture is at most 1,200 characters', async () => {
  const { team, g, p } = sender();
  const hash = await encode(team, g, floorOf(g, p));
  assert.ok(hash.startsWith('#p=1'), `hash starts #p=1, got ${hash.slice(0, 8)}`);
  const url = 'https://benchcard.app/' + hash;
  assert.ok(url.length <= 1200, `URL is ${url.length} characters`);
});

const sameFives = (a, b) => JSON.stringify(a.map(f => [...f].sort())) === JSON.stringify(b.map(f => [...f].sort()));

/* A phone with empty storage: the placeholder team the app starts with. */
function freshDevice() {
  S.state.teams = [S.newTeam('')]; S.state.activeTeam = 0; S.state.onboarded = false;
}

test('round trip: a fresh device opens the game with the sender\'s stints, minutes, place and swaps', async () => {
  const { team, g, p } = sender();
  const want = {
    floor: floorOf(g, p), minutes: { ...S.effectiveMinutes(g, p) },
    at: L.playedStints(g.live), hand: L.handStints(g.live),
  };
  const hash = await encode(team, g, want.floor);
  assert.deepEqual(want.hand, [7], 'fixture has one hand swap');

  freshDevice();
  const incoming = await decode(hash);
  assert.ok(incoming, 'the link decodes');
  receive(incoming);

  assert.equal(S.state.teams.length, 1, 'a new team replaces the empty placeholder');
  assert.equal(S.team().id, 'tHawks');
  assert.equal(S.team().name, 'Hawks');
  const got = S.game();
  const gp = S.plans[S.state.activeGame];
  assert.equal(got.id, 'gHawks1');
  assert.ok(sameFives(floorOf(got, gp), want.floor), 'same fives, stint for stint');
  assert.deepEqual(S.effectiveMinutes(got, gp), want.minutes);
  assert.equal(L.playedStints(got.live), want.at);
  assert.deepEqual(L.handStints(got.live), want.hand);
  assert.equal(L.finishedGame(got.live), false);
  assert.equal(S.team().days.length, 1);
  assert.equal(S.team().season.games.length, 0, 'no season travels');
});

test('stints the phone solves differently are written as overrides that are not hand swaps', async () => {
  const { team, g, p } = sender();
  const floor = floorOf(g, p);
  // as if the sender's app version had solved stint 10 differently
  const swapped = [...floor[10]];
  swapped[0] = S.availIds(g).find(id => !floor[10].includes(id));
  const sent = floor.map((f, k) => (k === 10 ? swapped : f));
  const hash = await encode(team, g, sent);

  freshDevice();
  receive(await decode(hash));
  const got = S.game();
  const gp = S.plans[S.state.activeGame];
  assert.ok(sameFives(floorOf(got, gp), sent), 'the card shows the sender\'s fives');
  assert.deepEqual(L.handStints(got.live), [7], 'only the sender\'s own swap is a hand swap');
  assert.ok(got.live.overrides[10], 'stint 10 is held as an override');
});

test('a kid marked out after playing: the played stints still show them on the receiver', async () => {
  const { team, g } = sender();
  const kid = S.effectiveStints(g, S.plans[0])[0].onFloor[0];
  g.out = [...g.out, kid];
  S.computeAll();
  const gp = S.plans[0];
  const want = { floor: floorOf(g, gp), minutes: { ...S.effectiveMinutes(g, gp) } };
  assert.ok(want.floor.slice(0, 5).some(f => f.includes(kid)), 'fixture: the kid is in a played stint');
  const hash = await encode(team, g, want.floor);

  freshDevice();
  receive(await decode(hash));
  const got = S.game();
  const rp = S.plans[S.state.activeGame];
  const fives = floorOf(got, rp);
  for (let k = 0; k < 5; k++) assert.deepEqual([...fives[k]].sort(), [...want.floor[k]].sort(), `played stint ${k}`);
  assert.deepEqual(S.effectiveMinutes(got, rp), want.minutes);
});

test('a second computeAll after receive keeps the received hand swap and overrides', async () => {
  const { team, g, p } = sender();
  const floor = floorOf(g, p);
  const swapped = [...floor[10]];
  swapped[0] = S.availIds(g).find(id => !floor[10].includes(id));
  const hash = await encode(team, g, floor.map((f, k) => (k === 10 ? swapped : f)));

  freshDevice();
  receive(await decode(hash));
  const once = floorOf(S.game(), S.plans[S.state.activeGame]);
  S.computeAll();
  const got = S.game();
  assert.deepEqual(L.handStints(got.live), [7], 'the hand swap survives');
  assert.ok(got.live.overrides[10], 'the reconcile override survives');
  assert.ok(sameFives(floorOf(got, S.plans[S.state.activeGame]), once), 'the card is unchanged');
});

const b64uToBytes = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const inflateText = async hash => {
  const s = new Blob([b64uToBytes(hash.slice(3 + 1))]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(s).text();
};

test('names: no last name is in the payload, only a last initial for the two who share a first name', async () => {
  const { team, g, p } = sender();
  const hash = await encode(team, g, floorOf(g, p));
  const json = await inflateText(hash);
  for (const last of LAST_NAMES) assert.ok(!json.includes(last), `${last} is not in the payload`);
  for (const call of ['Priya R.', 'Priya S.', 'Marcus', 'Dev', 'Ruth']) {
    assert.ok(json.includes(`"${call}"`), `${call} travels`);
  }
  freshDevice();
  receive(await decode(hash));
  const names = S.team().players.map(x => x.name);
  assert.deepEqual(names.slice(0, 3), ['Priya R.', 'Priya S.', 'Marcus']);
  assert.equal(names.length, 12);
});

/* The phone already has the team, with full names and its own version of the
   game: another day, a season, and a game the link does not mention. */
function phoneWithTeam() {
  const { team, g, p } = sender();
  const hashP = encode(team, g, floorOf(g, p));
  const mine = structuredClone(team);
  mine.players = mine.players.filter(x => x.id !== ids[10]);
  mine.players.push({ id: 'pExtra', name: 'Extra Kid', number: '99', shortName: '', tier: 3, hue: 40 });
  const mineGame = mine.days[0].games[0];
  Object.assign(mineGame, { seed: 7, strategy: 'closers', label: 'Wolves', tipoff: '09:30', live: { at: 0, overrides: {} } });
  mine.days.push({ name: 'Away', date: '2999-09-19', games: [bareGame({
    id: 'gLater', label: 'Eagles', constraints: S.emptyConstraints(), live: { at: 0, overrides: {} },
  })] });
  mine.settings = { ...mine.settings, maxSubs: 3 };
  const other = S.newTeam('Other');
  S.state.teams = [other, mine]; S.state.activeTeam = 1; S.state.onboarded = true;
  S.computeAll();   // the phone has been opened before: every game is stamped
  S.state.activeTeam = 0;
  return { hashP, mine };
}

test('existing team: the game is replaced, kids keep their names, nothing else in the team changes', async () => {
  const { hashP, mine } = phoneWithTeam();
  const before = structuredClone({ ...mine, players: undefined, days: undefined });
  const otherDay = structuredClone(mine.days[1]);
  const names = Object.fromEntries(mine.players.map(x => [x.id, x.name]));
  const hash = await hashP;

  receive(await decode(hash));

  assert.equal(S.state.teams.length, 2, 'no team is added');
  const t = S.state.teams[1];
  assert.equal(S.state.activeTeam, 1);
  assert.equal(t.days.length, 2);
  const g = t.days[0].games[0];
  assert.equal(g.label, 'Wolves', 'the phone\'s own game label stays');
  assert.equal(g.tipoff, '09:30', 'and its tipoff');
  assert.equal(t.days[0].games.length, 1, 'replaced, not added alongside');
  assert.equal(g.id, 'gHawks1');
  assert.equal(g.seed, 4242, 'the link\'s game is the one kept');
  assert.equal(g.strategy, 'balanced');
  assert.deepEqual(L.handStints(g.live), [7]);
  for (const [id, full] of Object.entries(names)) {
    assert.equal(t.players.find(x => x.id === id).name, full, `${full} keeps their full name`);
  }
  assert.equal(t.players.find(x => x.id === ids[10]).name, 'Omar', 'a kid the phone lacks arrives by card name');
  assert.ok(t.players.some(x => x.id === 'pExtra'), 'the phone\'s own kids stay');
  assert.deepEqual(t.days[1], otherDay);
  assert.deepEqual(t.season, before.season);
  assert.deepEqual(t.settings, before.settings);
  assert.equal(t.name, before.name);
});

test('existing team: a game it does not have is added to today', async () => {
  const { hashP, mine } = phoneWithTeam();
  mine.days[0].games[0].id = 'gSomethingElse';
  const hash = await hashP;

  receive(await decode(hash));

  const t = S.state.teams[1];
  const today = t.days.find(d => d.games.some(x => x.id === 'gHawks1'));
  assert.ok(today, 'the handed-off game is in a day');
  assert.notEqual(today.date, '2026-09-12', 'it is not put into the sender\'s old day');
  assert.equal(today.games.length, 2, 'joins the phone\'s own unplayed game, carried to today (#379)');
  assert.ok(t.days.some(d => d.games.some(x => x.id === 'gSomethingElse')), 'the phone\'s own game stays');
  assert.equal(S.game().id, 'gHawks1', 'and it is the open game');
});

const repack = async obj => {
  const s = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(s).arrayBuffer());
  return '#p=1' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

test('bad links: truncated, corrupted and hand-edited payloads decode to null and touch nothing', async () => {
  const { team, g, p } = sender();
  const hash = await encode(team, g, floorOf(g, p));
  const doc = JSON.parse(await inflateText(hash));
  const edit = fn => { const d = structuredClone(doc); fn(d); return repack(d); };
  const flipped = hash.slice(0, 40) + (hash[40] === 'A' ? 'B' : 'A') + hash.slice(41);
  const bad = {
    'truncated': hash.slice(0, Math.floor(hash.length / 2)),
    'one character flipped': flipped,
    'cut to the prefix': '#p=1',
    'unknown version': '#p=2' + hash.slice(4),
    'not base64url': '#p=1' + '!!!!',
    'not a payload': '#p=1' + 'aGVsbG8',
    'a stint with four kids': await edit(d => { d.s[3].pop(); }),
    'a stint naming nobody': await edit(d => { d.s[3][0] = 99; }),
    'a swap on a stint that is not there': await edit(d => { d.l.hand = [40]; }),
    'no roster': await edit(d => { d.p = []; }),
    'a game with no id': await edit(d => { delete d.g.id; }),
  };
  const snapshot = JSON.stringify(S.state.teams);
  for (const [why, h] of Object.entries(bad)) {
    assert.equal(await decode(h), null, why);
  }
  assert.equal(JSON.stringify(S.state.teams), snapshot, 'decoding wrote nothing');
  assert.ok(await decode(await repack(doc)), 'the repack helper itself makes a good link');
});

/* #370: overtime travels in the link. The fixture is the spec's: 10 kids,
   2 x 16, sub every 4 (8 stints), seed fixed, Even; one 2-minute overtime. */
const OT_IDS = Array.from({ length: 10 }, (_, i) => `o${i}`);
const otTeam = (overtime) => {
  const g = bareGame({
    id: 'gOT', periods: 2, periodMinutes: 16, granValue: 4, seed: 99, balance: 'even',
    live: { at: 0, overrides: {} }, overtime,
  });
  const team = {
    id: 'tOT', name: 'Owls', players: OT_IDS.map((id, i) => ({ id, name: `Kid${i}`, number: String(i), tier: 3, hue: i })),
    days: [{ name: '', date: '2026-09-12', games: [g] }], activeDay: 0, activeGame: 0,
    season: { games: [] }, settings: {},
  };
  S.state.teams = [team]; S.state.activeTeam = 0;
  S.computeAll();
  return { team, g, p: S.plans[0] };
};

test('overtime: a link carries the OT stint, the same fives and a header reading OT', async () => {
  const { team, g, p } = otTeam([{ minutes: 2, who: 'next' }]);
  const want = floorOf(g, p);
  assert.equal(want.length, 9, 'fixture: 8 regulation stints and one OT');
  const hash = await encode(team, g, want);

  freshDevice();
  receive(await decode(hash));
  const got = S.game(), gp = S.plans[S.state.activeGame];
  assert.equal(gp.stints.length, 9);
  assert.ok(sameFives(floorOf(got, gp), want), 'same fives, OT included');
  const ot = gp.stints[8];
  assert.equal(benchHeaderText(ot, 8, 9).title, 'OT · 2:00 to 0:00');
});

test('overtime: Keep this five and Strongest five arrive with who and five', async () => {
  const five = OT_IDS.slice(0, 5);
  const { team, g, p } = otTeam([{ minutes: 2, who: 'keep', five }, { minutes: 1, who: 'strongest', five: OT_IDS.slice(5) }]);
  const hash = await encode(team, g, floorOf(g, p));
  freshDevice();
  const incoming = await decode(hash);
  assert.deepEqual(incoming.team.days[0].games[0].overtime, [
    { minutes: 2, who: 'keep', five },
    { minutes: 1, who: 'strongest', five: OT_IDS.slice(5) },
  ]);
});

test('overtime: a receiver that drops the field opens regulation only, played past the grid', async () => {
  const { team, g } = otTeam([]);
  assert.ok(S.addOvertime(g, 2), 'the sender adds a 2-minute overtime');
  S.computeAll();
  g.live.at = 8;   // on the OT stint
  const eff = S.effectiveStints(g, S.plans[0]);
  const swapped = k => { const f = [...eff[k].onFloor]; f[0] = eff[k].sitting[0]; return f; };
  L.writeOverrides(g.live, { 8: swapped(8) }, true);   // a hand swap in the OT stint
  L.writeOverrides(g.live, { 3: swapped(3) }, true);   // and one in regulation
  S.computeAll();
  const p = S.plans[0];
  assert.deepEqual(L.handStints(g.live), [3, 8], 'fixture: two hand swaps');
  const sent = floorOf(g, p);
  const hash = await encode(team, g, sent);

  // an older app: its sanitizer does not know `overtime`
  const incoming = await decode(hash);
  delete incoming.team.days[0].games[0].overtime;
  freshDevice();
  receive(incoming);

  const got = S.game(), gp = S.plans[S.state.activeGame];
  assert.equal(gp.stints.length, 8);
  assert.ok(!gp.stints.some(s => /^OT/.test(s.periodName ?? '')), 'no OT stint');
  assert.ok(sameFives(floorOf(got, gp), sent.slice(0, 8)), 'regulation fives, hand swap included');
  assert.ok(L.handStints(got.live).includes(3), 'the regulation hand swap shows');
  // `at` stays 8, past the 8-stint grid: bench mode reads it clamped to the last stint
  assert.equal(got.live.at, 8);
  assert.equal(L.stintIndex(gp, got.live), 7);
  assert.equal(L.stepAt(gp, got.live, 0), 7);
  assert.equal(L.finishedGame(got.live), false);
  const row = gp.stints[L.stintIndex(gp, got.live)];
  assert.equal(benchHeaderText(row, 7, 8).title, 'H2 · 4:00 to 0:00');
});

/* Which copy of a game wins a retap: the link at `link` ({ at, swaps, finished })
   against the phone's own at `mineLive`. Returns what `receive` reports. */
async function retap(mineLive, link) {
  const { team, g } = sender();
  g.live = { at: link.at, overrides: {}, finished: link.finished === true };
  S.computeAll();
  const sent = S.effectiveStints(g, S.plans[0]);
  for (const k of link.swaps || []) {
    const five = [...sent[k].onFloor];
    five[0] = sent[k].sitting.find(id => id !== ids[11]);
    L.writeOverrides(g.live, { [k]: five }, true);
  }
  S.computeAll();
  const hash = await encode(team, g, floorOf(g, S.plans[0]));

  const { mine } = phoneWithTeam();
  const mg = mine.days[0].games[0];
  mg.live = { at: mineLive.at, overrides: {}, finished: mineLive.finished === true };
  S.state.activeTeam = 1; S.computeAll();
  const eff = S.effectiveStints(mg, S.plans[S.state.activeGame] || S.plans[0]);
  for (const k of mineLive.swaps || []) {
    const five = [...eff[k].onFloor];
    five[0] = eff[k].sitting.find(id => !mine.players.every(x => x.id !== id) && id !== ids[11]);
    L.writeOverrides(mg.live, { [k]: five }, true);
  }
  S.state.activeTeam = 0;
  const before = { at: L.playedStints(mg.live), hand: L.handStints(mg.live) };
  const res = receive(await decode(hash));
  return { res, before, got: S.game() };
}

test('retap: equal stints, the phone has one more hand swap -> the phone is kept', async () => {
  const { res } = await retap({ at: 4, swaps: [6, 8] }, { at: 4, swaps: [6] });
  assert.equal(res.outcome, 'kept');
});

test('retap: the link is ahead in stints, the phone has more hand swaps -> the link comes in', async () => {
  const { res, got } = await retap({ at: 2, swaps: [6, 8] }, { at: 4 });
  assert.equal(res.outcome, 'replaced');
  assert.equal(L.playedStints(got.live), 4);
});

test('retap: the phone is finished, the link is not -> the phone is kept', async () => {
  const { res } = await retap({ at: 2, finished: true }, { at: 4 });
  assert.equal(res.outcome, 'kept');
});

test('retap: the link is finished, the phone is not -> the link comes in', async () => {
  const { res, got } = await retap({ at: 6, swaps: [8] }, { at: 4, finished: true });
  assert.equal(res.outcome, 'replaced');
  assert.equal(L.finishedGame(got.live), true);
});

/* #379: the link carries the sender's day, label and tipoff. Dates are made
   relative to the real today, which `decode` reads; 2000 and 2999 are
   always before and after it. */
const todayIso = () => seasonDate(new Date());
async function linkWith(edit) {
  const { team, g, p } = sender();
  const doc = JSON.parse(await inflateText(await encode(team, g, floorOf(g, p))));
  edit(doc);
  return decode(await repack(doc));
}

test('the day: a link with no d imports today', async () => {
  const got = await linkWith(d => { delete d.d; });
  assert.equal(got.team.days[0].date, todayIso());
});

test('the day: a d before today imports today; a d after today keeps d', async () => {
  assert.equal((await linkWith(d => { d.d = '2000-01-01'; })).team.days[0].date, todayIso());
  assert.equal((await linkWith(d => { d.d = '2999-11-01'; })).team.days[0].date, '2999-11-01');
});

test('the day: a junk d imports today, however it compares as a string', async () => {
  for (const junk of ['zzzz', '9999-99-99', '2999-02-31', 20991101, null, ['2999-11-01'], {}]) {
    const got = await linkWith(d => { d.d = junk; });
    assert.ok(got, `the link still decodes with d = ${JSON.stringify(junk)}`);
    assert.equal(got.team.days[0].date, todayIso(), `d = ${JSON.stringify(junk)}`);
    assert.equal(got.team.days.length, 1);
  }
});

test('encode puts the sender\'s day date in d, and the label and tipoff in the game', async () => {
  const { team, g, p } = sender();
  g.label = 'vs Hawks'; g.tipoff = '09:30';
  const doc = JSON.parse(await inflateText(await encode(team, g, floorOf(g, p))));
  assert.equal(doc.d, '2026-09-12');
  assert.equal(doc.g.label, 'vs Hawks');
  assert.equal(doc.g.tipoff, '09:30');
});

test('label and tipoff round-trip through encode and decode', async () => {
  const { team, g, p } = sender();
  g.label = 'vs Hawks'; g.tipoff = '09:30';
  const got = await decode(await encode(team, g, floorOf(g, p)));
  assert.equal(got.team.days[0].games[0].label, 'vs Hawks');
  assert.equal(got.team.days[0].games[0].tipoff, '09:30');
});

test('the day: a sender whose game is on a later day dates it that day on the receiver', async () => {
  const { team, g, p } = sender();
  team.days = [{ name: '', date: '2026-09-12', games: [bareGame({ id: 'other' })] },
    { name: '', date: '2999-11-01', games: [g] }];
  const got = await decode(await encode(team, g, floorOf(g, p)));
  assert.equal(got.team.days[0].date, '2999-11-01');
});

test('the night before: a link for a team that was not active carries that team\'s unplayed day first, then joins it', async () => {
  const { team, g, p } = sender();
  const hash = await encode(team, g, floorOf(g, p));
  const mine = structuredClone(team);
  mine.days = [{ name: '', date: '2000-01-01', games: [bareGame({ id: 'gNight', live: { at: 0, overrides: {} } })] }];
  S.state.teams = [S.newTeam('Other'), mine]; S.state.activeTeam = 0; S.state.onboarded = true;
  S.computeAll();

  receive(await decode(hash));

  assert.equal(S.state.activeTeam, 1);
  assert.ok(!mine.season.games.some(x => x.id === 'gNight'), 'the night-before game was not filed');
  assert.equal(mine.days.length, 1, 'one day, not a left-out day beside today');
  assert.equal(mine.days[0].date, todayIso());
  assert.deepEqual(mine.days[0].games.map(x => x.id).sort(), ['gHawks1', 'gNight']);
});

test('encode caps the label at 40 characters', async () => {
  const { team, g, p } = sender();
  g.label = 'x'.repeat(300);
  const doc = JSON.parse(await inflateText(await encode(team, g, floorOf(g, p))));
  assert.equal(doc.g.label.length, 40);
});

test('decode takes today as a second argument: d == today and d == tomorrow', async () => {
  const { team, g, p } = sender();
  const doc = JSON.parse(await inflateText(await encode(team, g, floorOf(g, p))));
  const today = new Date(2026, 9, 31, 9);
  doc.d = '2026-10-31';
  assert.equal((await decode(await repack(doc), today)).team.days[0].date, '2026-10-31', 'd == today is today');
  doc.d = '2026-11-01';
  assert.equal((await decode(await repack(doc), today)).team.days[0].date, '2026-11-01', 'd == tomorrow is kept');
  doc.d = '2026-10-30';
  assert.equal((await decode(await repack(doc), today)).team.days[0].date, '2026-10-31', 'd == yesterday is today');
});

/* #419: the replaced game was alone on its day and the link says it was played
   on another day. The game moves there and the emptied day goes. */
test('replace to the played day: the game\'s old day, left empty, is dropped and the game opens on the played day', async () => {
  const { hashP } = phoneWithTeam();
  const doc = JSON.parse(await inflateText(await hashP));
  doc.d = '2026-09-05';
  const got = await decode(await repack(doc));
  assert.equal(got.played, '2026-09-05', 'a started game with a real date carries it');

  receive(got);

  const t = S.state.teams[1];
  assert.deepEqual(t.days.map(d => d.date), ['2026-09-05', '2999-09-19'], 'the old day is gone, days stay in order');
  assert.ok(t.days.every(d => d.games.length > 0), 'no empty day');
  assert.equal(t.days[0].games[0].id, 'gHawks1');
  assert.equal(t.days[t.activeDay].date, '2026-09-05', 'the game is open on the played day');
});

test('decode: an unstarted game carries no played date', async () => {
  const { team, g, p } = sender();
  g.live.at = 0;
  S.computeAll();
  const doc = JSON.parse(await inflateText(await encode(team, g, floorOf(g, p))));
  doc.d = '2026-09-05';
  assert.equal((await decode(await repack(doc))).played, null);
});
