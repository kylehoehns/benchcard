import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, bareGame } from './state-fixture.js';
import * as L from '../app/live.js';
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
  mine.days.push({ name: 'Away', date: '2026-09-19', games: [bareGame({
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
  assert.equal(today.games.length, 1);
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
