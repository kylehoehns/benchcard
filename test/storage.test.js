import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { sanitize, loadState, saveState, seasonGame, seasonDate, addSeasonGames,
         seasonShare, KEY, BACKUP_KEY, V5_KEY, V5_BACKUP_KEY, V4_KEY, V4_BACKUP_KEY,
         V3_KEY, DEFAULT_SETTINGS } from '../app/storage.js';
import { SIZES, file as chartFile } from '../scripts/charts.mjs';

/* Every document that paints themed content before its first frame, and so
   carries its own copy of the theme resolution. The roster-size pages are
   generated from about.html's copy (scripts/charts.mjs), which is why they can
   join this list without adding a maintenance burden — but they are still
   checked, because the generator is a thing someone could take away. */
const THEMED = ['index.html', 'about.html', ...SIZES.map(chartFile)];

const emptyConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [],
  openingFive: [], lastPeriodFive: [], hardPairs: false, maxConsecutive: 0,
  targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [],
});
const newGame = () => ({ id: 'gnew', label: '', when: '', periods: 4, periodMinutes: 8,
  granMode: 'everyN', granValue: 4, out: [], useCarryover: false, strategy: 'balanced',
  seed: 1, constraints: emptyConstraints() });
const H = { emptyConstraints, newGame };

const good = () => ({
  version: 3,
  players: [
    { id: 'a', name: 'Marcus Webb', number: '4', shortName: '' },
    { id: 'b', name: 'Eli Tran', number: '', shortName: 'ELI' },
  ],
  day: { name: 'Sat', games: [{ ...newGame(), id: 'g1', out: ['b'],
    constraints: { ...emptyConstraints(), maxMinutes: { a: 12 }, pairs: [['a', 'b']] } }] },
  activeGame: 0, view: 'games',
  ui: { copies: 2, showMinutes: false, printScope: 'game', cardId: 'short', theme: 'auto' },
});

test('a valid record round-trips unchanged in substance', () => {
  const s = sanitize(good(), H);
  assert.equal(s.teams[0].players.length, 2);
  assert.equal(s.teams[0].day.games[0].constraints.maxMinutes.a, 12);
  assert.deepEqual(s.teams[0].day.games[0].constraints.pairs, [['a', 'b']]);
  assert.deepEqual(s.teams[0].day.games[0].out, ['b']);
});

test('keepOnFloor persists like the other two pair rules, and is empty when the key is absent', () => {
  // every record written before the rule shipped has no key at all, and the
  // whole point of storing it beside pairs/avoids is that it needs no v7
  assert.deepEqual(sanitize(good(), H).teams[0].day.games[0].constraints.keepOnFloor, []);

  const raw = good();
  raw.day.games[0].constraints.keepOnFloor = [['a', 'b'], ['a', 'ghost'], 'nope'];
  const c = sanitize(raw, H).teams[0].day.games[0].constraints;
  assert.deepEqual(c.keepOnFloor, [['a', 'b']], 'dangling and malformed entries are dropped');
});

test('garbage in returns null rather than a broken state', () => {
  for (const junk of [null, undefined, 'nope', 42, [], true]) {
    assert.equal(sanitize(junk, H), null, String(junk));
  }
});

test('constraints pointing at players who no longer exist are dropped, not kept dangling', () => {
  const raw = good();
  raw.day.games[0].constraints.maxMinutes.ghost = 10;
  raw.day.games[0].constraints.pairs.push(['a', 'ghost']);
  raw.day.games[0].constraints.openingFive = ['a', 'ghost'];
  raw.day.games[0].out.push('ghost');
  const s = sanitize(raw, H);
  const c = s.teams[0].day.games[0].constraints;
  assert.deepEqual(c.pairs, [['a', 'b']], 'the dangling pair is gone');
  assert.deepEqual(c.openingFive, ['a']);
  assert.deepEqual(s.teams[0].day.games[0].out, ['b']);
  // this case was set up here from the start and never actually asserted, so
  // a minutes cap naming a stranger survived sanitize until multi-team
  assert.deepEqual(Object.keys(c.maxMinutes), ['a'], 'so is the dangling cap');
});

test('duplicate player ids are collapsed so two kids cannot merge', () => {
  const raw = good();
  raw.players.push({ id: 'a', name: 'Impostor' });
  const s = sanitize(raw, H);
  assert.equal(s.teams[0].players.length, 2);
  assert.equal(s.teams[0].players.find(p => p.id === 'a').name, 'Marcus Webb', 'the first wins');
});

test('players missing an id are discarded, valid ones survive', () => {
  const raw = good();
  raw.players.push({ name: 'No Id' }, null, 'garbage');
  const s = sanitize(raw, H);
  assert.equal(s.teams[0].players.length, 2);
});

test('out-of-range numbers are clamped to something usable', () => {
  const raw = good();
  Object.assign(raw.day.games[0], { periods: 999, periodMinutes: -4, granValue: 0 });
  raw.day.games[0].constraints.maxConsecutive = 500;
  raw.activeGame = 99;
  const s = sanitize(raw, H);
  const g = s.teams[0].day.games[0];
  assert.ok(g.periods >= 1 && g.periods <= 8, `periods ${g.periods}`);
  assert.ok(g.periodMinutes >= 1, `periodMinutes ${g.periodMinutes}`);
  assert.ok(g.granValue >= 1, `granValue ${g.granValue}`);
  assert.ok(g.constraints.maxConsecutive <= 20);
  assert.equal(s.teams[0].activeGame, 0, 'an out-of-range active tab cannot point at nothing');
});

test('unknown enum values fall back instead of breaking the UI', () => {
  const raw = good();
  raw.day.games[0].granMode = 'telepathy';
  raw.day.games[0].strategy = 'vibes';
  raw.ui.theme = 'chartreuse';
  raw.ui.printScope = 'galaxy';
  raw.view = 'nowhere';
  const s = sanitize(raw, H);
  assert.equal(s.teams[0].day.games[0].granMode, 'everyN');
  assert.equal(s.teams[0].day.games[0].strategy, 'balanced');
  assert.equal(s.ui.theme, 'auto');
  assert.equal(s.ui.printScope, 'game');
  assert.equal(s.view, 'games');
});

test('a record with no games gets one rather than rendering nothing', () => {
  const raw = good();
  raw.day.games = [];
  const s = sanitize(raw, H);
  assert.equal(s.teams[0].day.games.length, 1);
});

test('a missing constraints object is filled in, not left undefined', () => {
  const raw = good();
  delete raw.day.games[0].constraints;
  const s = sanitize(raw, H);
  const c = s.teams[0].day.games[0].constraints;
  assert.deepEqual(c.pairs, []);
  assert.deepEqual(c.closing, { stints: 2, players: [] });
  assert.equal(c.maxConsecutive, 0);
});

test('sanitize is idempotent', () => {
  const once = sanitize(good(), H);
  assert.deepEqual(sanitize(once, H), once);
});

test('in-game overrides survive a reload, and stale ones are dropped', () => {
  const raw = good();
  raw.players.push(
    { id: 'c', name: 'Devon Ellis' }, { id: 'd', name: 'Kade Brenner' },
    { id: 'e', name: 'Aaron Volk' }, { id: 'f', name: 'Jack Morrison' });
  // `good()` sits 'b' out; clear that here so this test is about stale ids
  // only. Overrides naming a player who is out are covered in availability.test.js.
  raw.day.games[0].out = [];
  raw.day.games[0].live = { at: 3, overrides: {
    2: ['a', 'b', 'c', 'd', 'e'],       // valid
    4: ['a', 'b', 'c'],                  // too few — must be dropped
    5: ['a', 'b', 'c', 'd', 'ghost'],    // names a departed player — dropped
  } };
  const s = sanitize(raw, H);
  const live = s.teams[0].day.games[0].live;
  assert.equal(live.at, 3);
  assert.deepEqual(Object.keys(live.overrides), ['2']);
  assert.deepEqual(live.overrides[2], ['a', 'b', 'c', 'd', 'e']);
});

test('a game with no live block gets a valid one', () => {
  const s = sanitize(good(), H);
  assert.deepEqual(s.teams[0].day.games[0].live, { at: 0, overrides: {} });
});

test('card size falls back to pocket unless the record says half-sheet', () => {
  assert.equal(sanitize(good(), H).ui.cardSize, 'pocket');
  const half = good(); half.ui.cardSize = 'half';
  assert.equal(sanitize(half, H).ui.cardSize, 'half');
  const junk = good(); junk.ui.cardSize = 'billboard';
  assert.equal(sanitize(junk, H).ui.cardSize, 'pocket');
});

test('tourSeen persists so the first-run tour never runs twice', () => {
  assert.equal(sanitize(good(), H).tourSeen, false);
  const seen = good(); seen.tourSeen = true;
  assert.equal(sanitize(seen, H).tourSeen, true);
  // a missing or junk value must land on "not seen" rather than undefined,
  // so the flag is always a real boolean by the time the UI reads it
  for (const junk of [undefined, null, 0, '']) {
    const r = good(); r.tourSeen = junk;
    assert.equal(sanitize(r, H).tourSeen, false, String(junk));
  }
});

/* loadState reads `localStorage` as a bare global, so a Map-backed stub is all
   it takes to run the recovery paths under node. The map is handed to `fn` as
   well, because a test about what `saveState` WROTE has to read it back. */
const withStore = (entries, fn) => {
  const m = new Map(Object.entries(entries));
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) },
  });
  try { return fn(m); }
  finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete globalThis.localStorage;
  }
};

test('a readable main record loads without claiming a recovery', () => {
  const r = withStore({ [KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(r.recovered, false);
  assert.equal(r.recoveredFrom, undefined);
  assert.equal(r.state.teams[0].players.length, 2);
});

test('a corrupt main record recovers and is reported as unreadable', () => {
  const r = withStore({ [KEY]: '{not json', [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(r.recovered, true);
  assert.equal(r.recoveredFrom, 'unreadable');
  assert.equal(r.state.teams[0].players.length, 2);
});

test('an absent main record recovers but is reported as missing, not unreadable', () => {
  // an evicted key is not a corrupt one: there was nothing to read, so telling
  // the coach their save was unreadable would invent a corruption
  const r = withStore({ [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(r.recovered, true);
  assert.equal(r.recoveredFrom, 'missing');
});

test('a main record that parses but is not a whole record recovers as incomplete', () => {
  /* Present, readable, and rejected. It used to be reported as "missing",
     which is a false statement about bytes sitting right there -- the key is
     neither absent nor unreadable, it just is not a record we wrote. */
  const empty = { ...good(), players: [], onboarded: false };
  const r = withStore({ [KEY]: JSON.stringify(empty), [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(r.recovered, true);
  assert.equal(r.recoveredFrom, 'incomplete');
  // and the half-written shapes that reach an object still recover the same way
  for (const junk of ['{}', '{"teams":[]}', '{"version":6}']) {
    const j = withStore({ [KEY]: junk, [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
    assert.equal(j.recovered, true, junk);
    assert.equal(j.recoveredFrom, 'incomplete', junk);
    assert.equal(j.state.teams[0].players.length, 2, junk);
  }
});

/* ---- A36: deleting the last team must stay deleted ---- *
 *
 * `removeTeam()` on the last team writes one team, no players and
 * `onboarded: false`, and `saveState` promotes the pre-delete record to the
 * backup at the same moment. The loader used to reject that record for being
 * empty, take the backup, and hand the coach back the team they had just
 * deleted -- under a banner blaming a save failure that never happened. */
const emptiedByDelete = () => ({
  version: 6, onboarded: false, tourSeen: true,
  teams: [{ id: 't9', name: '', players: [], day: { name: '', games: [] },
            season: { games: [] }, settings: {}, activeGame: 0 }],
  activeTeam: 0, view: 'games', ui: {},
});

test('a record emptied by removing the last team loads as empty, not recovered', () => {
  const r = withStore({ [KEY]: JSON.stringify(emptiedByDelete()),
                        [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(r.recovered, false, 'the backup must not overrule a deliberate deletion');
  assert.equal(r.recoveredFrom, undefined);
  assert.equal(r.state.onboarded, false, 'an empty app is expressed as not onboarded');
  assert.equal(r.state.teams.length, 1);
  assert.equal(r.state.teams[0].players.length, 0, 'the deleted team must not come back');
});

test('completeness, not emptiness, is what lets the empty record through', () => {
  /* Each of these is the same empty record with one vital sign missing, and
     each must still fall back to the backup: the point is not "empty is fine",
     it is "a whole record we wrote is entitled to say the coach has no team". */
  const missingSign = [
    ['no version', r => { delete r.version; }],
    ['a version we never wrote', r => { r.version = 5; }],
    ['no teams array', r => { delete r.teams; }],
    ['an empty teams array', r => { r.teams = []; }],
    ['onboarded absent rather than false', r => { delete r.onboarded; }],
    ['onboarded as a non-boolean', r => { r.onboarded = 0; }],
  ];
  for (const [what, break_] of missingSign) {
    const rec = emptiedByDelete(); break_(rec);
    const r = withStore({ [KEY]: JSON.stringify(rec),
                          [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
    assert.equal(r.recovered, true, what);
    assert.equal(r.state.teams[0].players.length, 2, what);
  }
});

test('the backup still rescues an absent or unreadable primary', () => {
  // the half the fix must not break: the guard exists because this happens
  const gone = withStore({ [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(gone.recovered, true);
  assert.equal(gone.recoveredFrom, 'missing');
  assert.equal(gone.state.teams[0].players.length, 2);

  const junk = withStore({ [KEY]: '{not json', [BACKUP_KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(junk.recovered, true);
  assert.equal(junk.recoveredFrom, 'unreadable');
  assert.equal(junk.state.teams[0].players.length, 2);
});

/* ---- A37: the boot after a recovery must not eat the good backup ---- *
 *
 * `saveState` promotes whatever is under `KEY` to the backup before writing,
 * and on the boot AFTER a recovery `KEY` still holds the bytes `loadState`
 * threw out. Promoting those replaced the last known-good copy with `{not
 * json`. Not data loss on the day -- the recovered record is under `KEY` by
 * the time it happens -- but it leaves the coach with one copy instead of two
 * at exactly the moment they most need two. */
const bakPlayers = m => sanitize(JSON.parse(m.get(BACKUP_KEY)), H).teams[0].players.length;

test('a recovery boot leaves the good backup alone instead of promoting the junk', () => {
  /* Every shape the loader can reject and then recover from: bytes that do not
     parse, and bytes that parse into something we did not write whole. */
  for (const junk of ['{not json', '{}', '{"teams":[]}', '{"version":6}', '{"version":5,"teams":[{}],"onboarded":false}']) {
    withStore({ [KEY]: junk, [BACKUP_KEY]: JSON.stringify(good()) }, m => {
      const r = loadState(H);
      assert.equal(r.recovered, true, junk);
      assert.equal(saveState(r.state), null, junk);
      assert.notEqual(m.get(BACKUP_KEY), junk, `${junk} was promoted over the last known-good copy`);
      assert.equal(bakPlayers(m), 2, `the backup no longer holds a roster after ${junk}`);
      assert.equal(JSON.parse(m.get(KEY)).teams[0].players.length, 2, junk);
    });
  }
});

test('an ordinary save still promotes the record it is replacing', () => {
  // the half the fix must not break: the backup exists because this happens
  const first = JSON.stringify(sanitize(good(), H));
  withStore({ [KEY]: first }, m => {
    const next = sanitize(good(), H);
    next.teams[0].players = [];
    assert.equal(saveState(next), null);
    assert.equal(m.get(BACKUP_KEY), first, 'the previous record must reach the backup slot');
    assert.equal(bakPlayers(m), 2);
  });
});

test('a record emptied by removing the last team is still promoted', () => {
  /* The A36 interplay, and the reason the promotion asks `complete` rather
     than "does it have a roster": a deliberate deletion is a whole record and
     is entitled to the backup slot like any other. Gating on players would
     quietly stop backing up the app's own empty state. */
  const emptied = JSON.stringify(emptiedByDelete());
  withStore({ [KEY]: emptied }, m => {
    const next = sanitize(good(), H);
    assert.equal(saveState(next), null);
    assert.equal(m.get(BACKUP_KEY), emptied, 'a whole record that says "no team" is still a good copy');
  });
});

test('nothing usable anywhere returns null rather than a phantom recovery', () => {
  assert.equal(withStore({}, () => loadState(H)), null);
  assert.equal(withStore({ [KEY]: '{not json', [BACKUP_KEY]: 'also junk' }, () => loadState(H)), null);
});

/* ================================================================== *
 * v3 → v4: one roster at the top level becomes one team
 *
 * The migration is the riskiest change in this file's history: there is
 * no server, so a coach's only copy of their roster is the record these
 * tests describe. Everything below asserts that nothing is lost.
 * ================================================================== */

test('a v3 record migrates to a single team with nothing lost', () => {
  const raw = good();                       // a genuine v3 shape: no `teams`
  raw.teamName = 'Wildcats 6th Grade';
  const s = sanitize(raw, H);

  assert.equal(s.version, 6);
  assert.equal(s.teams.length, 1, 'one roster in, one team out');
  const t = s.teams[0];
  assert.equal(t.name, 'Wildcats 6th Grade', 'teamName becomes the team name');
  assert.equal(t.players.length, 2);
  assert.deepEqual(t.players.map(p => p.id), ['a', 'b'], 'player ids are untouched');
  assert.equal(t.day.name, 'Sat');
  assert.equal(t.day.games.length, 1);
  assert.equal(t.day.games[0].constraints.maxMinutes.a, 12, 'constraints survive');
  assert.deepEqual(t.day.games[0].constraints.pairs, [['a', 'b']]);
  assert.deepEqual(t.day.games[0].out, ['b'], 'availability survives');
  assert.ok(t.id, 'the migrated team gets an id');
});

test('a v4 record round-trips both teams', () => {
  const a = good(), b = good();
  b.players = [{ id: 'z', name: 'Nia Brooks', number: '2', shortName: '' }];
  b.day = { name: 'Sun', games: [{ ...newGame(), id: 'g9', out: [] }] };
  const s = sanitize({ version: 4, onboarded: true, activeTeam: 1,
    teams: [{ ...a, name: 'Hawks' }, { ...b, name: 'Ravens' }] }, H);

  assert.equal(s.teams.length, 2);
  assert.deepEqual(s.teams.map(t => t.name), ['Hawks', 'Ravens']);
  assert.equal(s.activeTeam, 1);
  assert.deepEqual(s.teams[1].players.map(p => p.id), ['z']);
  assert.equal(s.teams[1].day.name, 'Sun');
});

test('one team cannot borrow another team\'s players', () => {
  // 'a' exists on team one only. A constraint on team two naming it is stale,
  // and honouring it would put a kid on a floor they are not on.
  const one = good();
  const two = good();
  two.players = [{ id: 'z', name: 'Nia', number: '', shortName: '' }];
  two.day.games[0].constraints.maxMinutes = { a: 12, z: 8 };
  two.day.games[0].constraints.pairs = [['a', 'z']];
  two.day.games[0].out = ['a'];
  const s = sanitize({ version: 4, teams: [one, two] }, H);

  const c = s.teams[1].day.games[0].constraints;
  assert.deepEqual(Object.keys(c.maxMinutes), ['z'], 'the other team\'s player is dropped');
  assert.deepEqual(c.pairs, [], 'a pair naming a stranger is not kept dangling');
  assert.deepEqual(s.teams[1].day.games[0].out, [], 'nor is their availability');
  assert.equal(s.teams[0].day.games[0].constraints.maxMinutes.a, 12, 'team one is untouched');
});

test('activeTeam cannot point past the end', () => {
  const s = sanitize({ version: 4, onboarded: true, activeTeam: 9, teams: [good()] }, H);
  assert.equal(s.activeTeam, 0);
});

test('a record with an empty teams array still gets a team', () => {
  const s = sanitize({ version: 4, onboarded: true, teams: [] }, H);
  assert.equal(s.teams.length, 1, 'falls back to reading the record as one team');
  assert.equal(s.teams[0].day.games.length, 1, 'and that team has a game');
});

test('teams are capped so a corrupt record cannot stall the boot', () => {
  const s = sanitize({ version: 4, onboarded: true, teams: Array(50).fill(good()) }, H);
  assert.equal(s.teams.length, 12);
});

test('sanitize is idempotent across the migration', () => {
  const once = sanitize(good(), H);
  const twice = sanitize(once, H);
  // ids are generated when absent, so compare everything else
  assert.deepEqual(twice.teams.map(t => ({ ...t, id: 0 })), once.teams.map(t => ({ ...t, id: 0 })));
  assert.equal(twice.version, 6);
});

test('onboarded survives a migration even with every player deleted', () => {
  const raw = good();
  raw.players = [];
  raw.onboarded = true;
  const s = sanitize(raw, H);
  assert.equal(s.onboarded, true, 'a coach who cleared their roster is not sent back to first run');
});

/* ================================================================== *
 * removing a player has to sweep every reference to their id
 *
 * Reported from a phone mid-game: five rows on the bench-mode screen
 * reading "undefined" behind "?" avatars. A live override is a whole
 * five the coach picked by hand; removing one of them left the other
 * four plus a dead id, and the bench view renders whatever the override
 * says. `sanitize` drops unresolvable overrides on load, so a reload
 * fixed it and it looked intermittent.
 * ================================================================== */

test('sanitize drops a live override holding an id that no longer exists', () => {
  const raw = good();
  raw.day.games[0].live = { at: 1, overrides: { 0: ['a', 'b', 'ghost', 'x', 'y'] } };
  const s = sanitize(raw, H);
  assert.deepEqual(s.teams[0].day.games[0].live.overrides, {},
    'an override that cannot be resolved must not survive a load');
});

test('an override of exactly five real players does survive', () => {
  const raw = good();
  raw.players.push(
    { id: 'c', name: 'Cole', number: '', shortName: '' },
    { id: 'd', name: 'Dev', number: '', shortName: '' },
    { id: 'e', name: 'Eli', number: '', shortName: '' },
  );
  raw.day.games[0].out = [];   // `good()` sits 'b' out; see availability.test.js
  raw.day.games[0].live = { at: 0, overrides: { 2: ['a', 'b', 'c', 'd', 'e'] } };
  const s = sanitize(raw, H);
  assert.deepEqual(s.teams[0].day.games[0].live.overrides[2], ['a', 'b', 'c', 'd', 'e']);
});

/* ================================================================== *
 * a player's colour belongs to the player, not to their row
 * ================================================================== */

test('hue defaults to the current index, so existing records keep their colours', () => {
  const raw = good();
  const s = sanitize(raw, H);
  assert.deepEqual(s.teams[0].players.map(p => p.hue), [0, 1],
    'a record written before hues existed must look exactly as it did');
});

test('reordering the roster does not change anyone\'s colour', () => {
  /* The bug this replaced: colour was HUES[indexOf(player)], so dragging one
     player up the list recoloured everyone below them. A coach who has learned
     "Leighton is the purple one" should not lose that for tidying their
     roster. */
  const raw = good();
  const first = sanitize(raw, H).teams[0].players;
  const before = Object.fromEntries(first.map(p => [p.id, p.hue]));

  // write it back reversed, the way a drag-to-reorder would
  raw.players = [...first].reverse();
  const after = sanitize(raw, H).teams[0].players;
  for (const p of after) {
    assert.equal(p.hue, before[p.id], `${p.id} changed colour by being moved`);
  }
});

test('a hue survives a round trip rather than being reassigned', () => {
  const raw = good();
  raw.players[0].hue = 7;
  raw.players[1].hue = 3;
  const s = sanitize(raw, H);
  assert.deepEqual(s.teams[0].players.map(p => p.hue), [7, 3]);
});

test('the pre-paint theme script reads the key the app actually writes', () => {
  /* Both HTML files open with an inline copy of the theme resolution, because
     it has to run before the first paint and a shared module is two round
     trips away. That copy read `benchcard.v3` long after storage.js moved to
     v4, so a fresh install had nothing to read and fell back to
     prefers-color-scheme -- an explicit "dark" flashed white for ~130ms on
     every cold load, which is the one thing the script exists to prevent.
     Pin the key here so the next schema bump cannot quietly do it again. */
  for (const file of THEMED) {
    const src = readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8');
    const head = src.slice(0, src.indexOf('</script>'));
    const keys = [...head.matchAll(/localStorage\.getItem\('([^']+)'\)|get\('([^']+)'\)/g)]
      .map(m => m[1] || m[2]);
    assert.ok(keys.includes(KEY),
      `${file}'s pre-paint script does not read ${KEY}, the key storage.js writes`);
    assert.equal(keys[0], KEY,
      `${file} must try ${KEY} before any older key, or a stale record wins`);
    for (const old of [V5_KEY, V4_KEY, V3_KEY]) {
      assert.ok(keys.includes(old),
        `${file} should still fall back to ${old} for a coach who has not been migrated`);
    }
    /* Newest first, all the way down: a returning coach whose v6 record has
       not been written yet must not pay a flash of the wrong theme, and a
       coach who has one must not have an older key answer ahead of it. */
    assert.deepEqual(keys, [KEY, V5_KEY, V4_KEY, V3_KEY],
      `${file} must try the keys newest first, or a stale record wins`);
  }
});

test('the pre-paint theme scripts have not drifted apart', () => {
  const body = f => {
    const src = readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
    return src.slice(0, src.indexOf('</script>'))
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ').trim();
  };
  /* The roster-size pages lift this script out of about.html at build time
     rather than keeping a copy (scripts/charts.mjs), so they cannot drift --
     but they are checked here anyway, because "cannot drift" is a property of
     a build step somebody could remove. */
  for (const f of THEMED) {
    if (f === 'index.html') continue;
    assert.equal(body(f), body('index.html'),
      `index.html and ${f} resolve the theme differently; arriving at one from the other will flash`);
  }
});

/* The other inline script in index.html: the one that paints the timeline's
   shape while the modules are still on the wire. It made exactly the mistake
   the theme script above made -- read one key, `benchcard.v3`, and kept
   reading it after v4 and v5 shipped -- so it parsed `null` and returned
   before drawing anything on every cold load since the multi-team migration.
   Nothing threw and nothing logged; the skeleton was simply never there.
   Both chains are pinned here now. */
const skeletonScript = () => {
  const src = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const at = src.indexOf('tl-skel');
  return src.slice(src.lastIndexOf('<script>', at) + '<script>'.length, src.indexOf('</script>', at));
};

test('the timeline skeleton reads the key the app actually writes', () => {
  const keys = [...skeletonScript().matchAll(/localStorage\.getItem\('([^']+)'\)|get\('([^']+)'\)/g)]
    .map(m => m[1] || m[2]);
  assert.deepEqual(keys, [KEY, V5_KEY, V4_KEY, V3_KEY],
    'the skeleton must try the keys newest first, the same chain as the theme script');
});

test('the timeline skeleton paints for a coach on the current schema', () => {
  // run the real inline script rather than reading it: the whole failure mode
  // here was code that looked right
  const paint = (store) => {
    const tl = { innerHTML: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const doc = { getElementById: id => (id === 'timeline' ? tl : null) };
    new Function('localStorage', 'document', skeletonScript())(
      { getItem: k => (k in store ? store[k] : null) }, doc);
    return tl;
  };
  const rows = tl => (tl.innerHTML.match(/tl-row/g) || []).length;

  const record = sanitize(good(), H);           // a v5 record, roster under teams[]
  record.teams[0].players = 'abcdefgh'.split('').map((id, i) =>
    ({ id, name: `P${i}`, number: String(i), shortName: '', hue: i }));

  const painted = paint({ [KEY]: JSON.stringify(record) });
  assert.equal(rows(painted), 8, 'one skeleton row per player on the active team');
  assert.equal(painted.attrs['aria-busy'], 'true');

  // the active team is the one being drawn, not team 0
  const two = JSON.parse(JSON.stringify(record));
  two.teams.push({ ...record.teams[0], players: record.teams[0].players.slice(0, 6) });
  two.activeTeam = 1;
  assert.equal(rows(paint({ [KEY]: JSON.stringify(two) })), 6);

  // an older key still answers for a coach who has not been migrated yet
  const v3 = { ...good(), onboarded: true };
  v3.players = record.teams[0].players.slice(0, 7);
  assert.equal(rows(paint({ [V3_KEY]: JSON.stringify(v3) })), 7,
    'a v3 record keeps its roster at the top level');

  // and a first-timer gets nothing -- the welcome screen is about to replace
  // this whole view, so a fake rotation would just flash at them
  assert.equal(paint({}).innerHTML, '');
  assert.equal(rows(paint({ [KEY]: JSON.stringify({ ...record, onboarded: false }) })), 0);
  assert.equal(rows(paint({ [KEY]: '{ not json' })), 0);
});

test('the format inputs let a coach type back what the sanitizer accepts', () => {
  // `periodMinutes` sanitizes to 40, but both number inputs capped at 20: a
  // record with a 24-minute half loaded fine, planned fine and could never be
  // typed in again -- the spinner stopped at 20 and the field read invalid.
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const maxOf = (id) => {
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
    return Number(tag.match(/max="(\d+)"/)[1]);
  };
  const ceiling = Number(
    readFileSync(new URL('../app/storage.js', import.meta.url), 'utf8')
      .match(/periodMinutes: num\(g\.periodMinutes, \d+, \d+, (\d+)\)/)[1]);
  assert.equal(maxOf('periodMinutes'), ceiling);
  assert.equal(maxOf('welMinutes'), ceiling, 'the welcome screen asks the same question');
  const onboarding = readFileSync(new URL('../app/onboarding.js', import.meta.url), 'utf8');
  assert.match(onboarding, new RegExp(`Math\\.min\\(${ceiling}, Number\\(\\$\\('#welMinutes'\\)`),
    'onboarding clamps the welcome value in JS as well, and must use the same ceiling');
});

/* ================================================================== *
 * v4 → v5: a season keeps its finished games
 *
 * The second migration in this file's history, and the same rule as the
 * first: there is no server, so the record these tests describe is the
 * coach's only copy of their roster. v4 is READ and never written, and a
 * v4 record has no `teams[].season` -- it must load into an empty one,
 * not a broken one, and lose nothing else on the way.
 * ================================================================== */

// a genuine v4 shape: `teams`, no `season` anywhere
const v4 = () => ({
  version: 4,
  onboarded: true,
  tourSeen: true,
  activeTeam: 1,
  view: 'roster',
  ui: { copies: 3, showMinutes: true, printScope: 'day', cardId: 'number',
        cardSize: 'half', cardOpen: true, tipDone: true, installDone: true,
        prints: 4, theme: 'dark' },
  teams: [
    { id: 't1', name: 'Hawks', activeGame: 0, players: [
        { id: 'a', name: 'Marcus Webb', number: '4', shortName: '', tier: 5, hue: 3 },
        { id: 'b', name: 'Eli Tran', number: '', shortName: 'ELI', tier: 2, hue: 7 }],
      day: { name: 'Sat', games: [{ ...newGame(), id: 'g1', label: 'Northgate', out: ['b'],
        live: { at: 2, overrides: {} },
        constraints: { ...emptyConstraints(), maxMinutes: { a: 12 }, pairs: [['a', 'b']] } }] } },
    { id: 't2', name: 'Ravens', activeGame: 0, players: [
        { id: 'z', name: 'Nia Brooks', number: '2', shortName: '', tier: 3, hue: 0 }],
      day: { name: '', games: [{ ...newGame(), id: 'g9' }] } },
  ],
});

test('a v4 record migrates forward with an empty season and nothing else lost', () => {
  const s = sanitize(v4(), H);

  assert.equal(s.version, 6);
  assert.equal(s.teams.length, 2, 'both teams survive');
  assert.deepEqual(s.teams.map(t => t.name), ['Hawks', 'Ravens']);
  assert.equal(s.activeTeam, 1);
  for (const t of s.teams) {
    assert.deepEqual(t.season, { games: [] },
      'a v4 team has no season, and an absent one must load empty rather than undefined');
  }
  // everything a coach would notice, checked field by field: this is the
  // migration, so "it still parses" is not the bar
  const t = s.teams[0];
  assert.deepEqual(t.players.map(p => p.id), ['a', 'b'], 'player ids are untouched');
  assert.deepEqual(t.players.map(p => p.name), ['Marcus Webb', 'Eli Tran']);
  assert.deepEqual(t.players.map(p => p.number), ['4', '']);
  assert.deepEqual(t.players.map(p => p.shortName), ['', 'ELI']);
  assert.deepEqual(t.players.map(p => p.tier), [5, 2], 'levels survive');
  assert.deepEqual(t.players.map(p => p.hue), [3, 7], 'colours survive');
  assert.equal(t.day.name, 'Sat');
  assert.equal(t.day.games[0].label, 'Northgate');
  assert.deepEqual(t.day.games[0].out, ['b'], 'availability survives');
  assert.equal(t.day.games[0].live.at, 2, 'how far into the game survives');
  assert.equal(t.day.games[0].constraints.maxMinutes.a, 12, 'constraints survive');
  assert.deepEqual(t.day.games[0].constraints.pairs, [['a', 'b']]);
  assert.equal(s.teams[1].players[0].name, 'Nia Brooks');
  assert.equal(s.tourSeen, true);
  assert.equal(s.view, 'team',
    'the view key was renamed in A40 slice 2 and an old record carries the old '
    + 'string; `sanitize` translates it, which is what stops a backup file '
    + 'written last season landing on the wrong page');
  assert.deepEqual(s.ui, sanitize(v4(), H).ui);
  assert.equal(s.ui.theme, 'dark');
  assert.equal(s.ui.prints, 4);
  assert.equal(s.ui.installDone, true);
});

test('the v4 → v5 migration is shape-driven, so it is idempotent', () => {
  const once = sanitize(v4(), H);
  assert.deepEqual(sanitize(once, H), once);
});

const seasonRecord = () => {
  const s = sanitize(v4(), H);
  s.teams[0].season.games = [
    { id: 'g1', date: '2026-11-08', day: 'Sat at Northgate', opponent: 'Northgate',
      periods: 4, periodMinutes: 8, minutes: { a: 18.5, b: 13.5 } },
    { id: 'g2', date: '2026-11-15', day: '', opponent: 'Kingsway',
      periods: 2, periodMinutes: 16, minutes: { a: 16, b: 16 } },
  ];
  return s;
};

test('a v5 record round-trips unchanged, season included', () => {
  const s = seasonRecord();
  assert.deepEqual(sanitize(s, H), s, 'a v5 record must survive a load byte for byte');
  // and through a write/read of the actual stored bytes, which is what a
  // reload really is
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s)), H), s);
});

test('a finished game keeps its date, format, opponent and minutes', () => {
  const g = sanitize(seasonRecord(), H).teams[0].season.games[0];
  assert.equal(g.id, 'g1');
  assert.equal(g.date, '2026-11-08');
  assert.equal(g.day, 'Sat at Northgate');
  assert.equal(g.opponent, 'Northgate');
  assert.equal(g.periods, 4);
  assert.equal(g.periodMinutes, 8);
  assert.deepEqual(g.minutes, { a: 18.5, b: 13.5 });
});

test('the season carries no rotation level, ever', () => {
  const raw = seasonRecord();
  raw.teams[0].season.games[0].tier = 5;
  raw.teams[0].season.games[0].tiers = { a: 5 };
  const g = sanitize(raw, H).teams[0].season.games[0];
  assert.ok(!('tier' in g) && !('tiers' in g),
    'a level is a coaching judgement about a child and is banned from the record');
  assert.deepEqual(Object.keys(g).sort(),
    ['date', 'day', 'id', 'minutes', 'opponent', 'periodMinutes', 'periods']);
});

test('season minutes are NOT swept against the roster — history is not rewritten', () => {
  /* The opposite rule to constraints, deliberately. A cap naming a departed
     player is an instruction about a future game and honouring it would put
     the wrong kid on the floor, so it is dropped. A finished game's minutes
     are a fact: a kid who left in November still played those minutes in
     October, and deleting them is the exact loss this record exists to stop. */
  const raw = seasonRecord();
  raw.teams[0].season.games[0].minutes.departed = 12;
  const g = sanitize(raw, H).teams[0].season.games[0];
  assert.equal(g.minutes.departed, 12, 'a player who left the team still played');
});

test('junk in a season game is coerced rather than dropping the game', () => {
  const raw = seasonRecord();
  raw.teams[0].season.games.push({
    id: 'g3', date: 'last Saturday', day: 42, opponent: null,
    periods: 999, periodMinutes: -4,
    minutes: { a: 'lots', b: 8.005, c: -3, d: 1e9, e: null, f: '', g: true, h: '12' },
  });
  const g = sanitize(raw, H).teams[0].season.games[2];
  assert.equal(g.date, '', 'a date that is not YYYY-MM-DD reads as unknown, not as itself');
  assert.equal(g.day, '');
  assert.equal(g.opponent, '');
  assert.ok(g.periods >= 1 && g.periods <= 8, `periods ${g.periods}`);
  assert.ok(g.periodMinutes >= 1, `periodMinutes ${g.periodMinutes}`);
  assert.deepEqual(g.minutes, { b: 8.01, c: 0, d: 999, h: 12 },
    'unnumbers go, the rest is clamped and rounded to the cent of a minute');
});

test('a season that is missing, junk or half-written loads as an empty one', () => {
  for (const junk of [undefined, null, 42, 'season', [], {}, { games: null }, { games: 'g1' }]) {
    const raw = sanitize(v4(), H);
    raw.teams[0].season = junk;
    assert.deepEqual(sanitize(raw, H).teams[0].season, { games: [] }, String(junk));
  }
  const raw = sanitize(v4(), H);
  raw.teams[0].season = { games: [null, 'g1', 7, {}] };
  const games = sanitize(raw, H).teams[0].season.games;
  assert.equal(games.length, 1, 'only the object survives; it gets an id and empty minutes');
  assert.deepEqual(games[0].minutes, {});
});

test('two entries for one game id collapse, so nobody is counted twice', () => {
  const raw = seasonRecord();
  raw.teams[0].season.games.push({ ...raw.teams[0].season.games[0], minutes: { a: 99 } });
  const games = sanitize(raw, H).teams[0].season.games;
  assert.equal(games.length, 2, 'the duplicate is gone');
  assert.equal(games[0].minutes.a, 18.5, 'the first wins');
});

test('a season is capped, newest kept, so a corrupt record cannot stall the boot', () => {
  const raw = sanitize(v4(), H);
  raw.teams[0].season.games = Array.from({ length: 500 }, (_, i) => ({
    id: 'g' + i, date: '2026-11-08', opponent: '', periods: 4, periodMinutes: 8, minutes: {},
  }));
  const games = sanitize(raw, H).teams[0].season.games;
  assert.equal(games.length, 200);
  assert.equal(games.at(-1).id, 'g499', 'the newest games are the ones carryover cares about');
});

test('one team\'s season is its own', () => {
  const raw = seasonRecord();
  assert.deepEqual(sanitize(raw, H).teams[1].season, { games: [] },
    'a second team does not inherit the first one\'s history');
});

/* ---- the pure writers: one place knows what a finished game looks like ---- */

test('seasonGame takes the minutes it is handed, not the plan\'s', () => {
  const when = new Date(2026, 10, 8, 20, 30);
  const g = seasonGame(
    { id: 'g1', label: '  Northgate  ', periods: 4, periodMinutes: 8 },
    { a: 18.5, b: 13.5 },
    { dayName: ' Sat at Northgate ', when });
  assert.deepEqual(g, { id: 'g1', date: '2026-11-08', day: 'Sat at Northgate',
    opponent: 'Northgate', periods: 4, periodMinutes: 8, minutes: { a: 18.5, b: 13.5 } });
  assert.deepEqual(sanitize({ teams: [{ ...v4().teams[0], season: { games: [g] } }] }, H)
    .teams[0].season.games[0], g, 'and what it builds is what the sanitiser accepts');
});

test('seasonGame stamps the coach\'s own day, not UTC', () => {
  // a Saturday game archived at 8pm Pacific is not Sunday's game
  assert.equal(seasonDate(new Date(2026, 10, 8, 20, 30)), '2026-11-08');
  assert.equal(seasonDate(new Date(2027, 0, 1, 0, 5)), '2027-01-01');
});

test('a game copies its minutes rather than aliasing the plan\'s object', () => {
  const mins = { a: 10 };
  const g = seasonGame({ id: 'g1', periods: 4, periodMinutes: 8 }, mins);
  mins.a = 99;
  assert.equal(g.minutes.a, 10);
});

test('archiving the same game twice cannot double a kid\'s minutes', () => {
  const season = { games: [] };
  const one = seasonGame({ id: 'g1', label: 'Northgate', periods: 4, periodMinutes: 8 }, { a: 18 });
  assert.equal(addSeasonGames(season, [one]), 1);
  assert.equal(addSeasonGames(season, [one]), 0, 'the second archive adds nothing');
  assert.equal(season.games.length, 1);
  assert.equal(addSeasonGames(season, [one, { ...one, id: 'g2' }]), 1, 'the new one still lands');
  assert.deepEqual(season.games.map(g => g.id), ['g1', 'g2']);
});

test('a duplicate inside one archive batch is filed once', () => {
  const season = { games: [] };
  const one = seasonGame({ id: 'g1', periods: 4, periodMinutes: 8 }, { a: 18 });
  assert.equal(addSeasonGames(season, [one, one]), 1);
});

test('appending past the cap drops the oldest, not the newest', () => {
  const season = { games: Array.from({ length: 200 }, (_, i) => ({ id: 'g' + i, minutes: {} })) };
  addSeasonGames(season, [seasonGame({ id: 'new', periods: 4, periodMinutes: 8 }, {})]);
  assert.equal(season.games.length, 200);
  assert.equal(season.games.at(-1).id, 'new');
  assert.equal(season.games[0].id, 'g1', 'the oldest game left, the new one stayed');
});

/* ---- what loadState does with an old key ---- */

test('a v4 record under the old key loads, migrated, when there is nothing newer', () => {
  const r = withStore({ [V4_KEY]: JSON.stringify(v4()) }, () => loadState(H));
  assert.equal(r.migrated, true);
  assert.equal(r.migratedFrom, 4);
  assert.equal(r.state.version, 6);
  assert.equal(r.state.teams.length, 2);
  assert.deepEqual(r.state.teams[0].players.map(p => p.name), ['Marcus Webb', 'Eli Tran']);
  assert.deepEqual(r.state.teams[0].season, { games: [] });
});

test('the v4 record is read, never written — a downgraded coach still finds it', () => {
  const m = new Map([[V4_KEY, JSON.stringify(v4())]]);
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) },
  });
  try {
    const before = m.get(V4_KEY);
    const r = loadState(H);
    assert.equal(saveState(r.state), null);
    assert.equal(m.get(V4_KEY), before, 'v4 is left exactly as it was');
    assert.ok(m.has(KEY), 'the migrated record is written under the current key');
    assert.equal(JSON.parse(m.get(KEY)).version, 6);
  } finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete globalThis.localStorage;
  }
});

test('v5 wins over v4, and v4 over v3, so an upgrade never loads yesterday', () => {
  const v5 = seasonRecord();
  const older = v4();
  older.teams[0].name = 'STALE';
  const r = withStore({ [KEY]: JSON.stringify(v5), [V4_KEY]: JSON.stringify(older),
                        [V3_KEY]: JSON.stringify(good()) }, () => loadState(H));
  assert.equal(r.recovered, false);
  assert.equal(r.migrated, undefined);
  assert.equal(r.state.teams[0].name, 'Hawks');
  assert.equal(r.state.teams[0].season.games.length, 2, 'the season came with it');

  const noV5 = withStore({ [V4_KEY]: JSON.stringify(older), [V3_KEY]: JSON.stringify(good()) },
    () => loadState(H));
  assert.equal(noV5.migratedFrom, 4, 'v4 outranks v3');
});

test('a truncated v5 record falls back to the v5 backup, then to v4', () => {
  // half-written bytes: a quota failure or a tab killed mid-setItem
  const cut = JSON.stringify(seasonRecord()).slice(0, 140);
  const r = withStore({ [KEY]: cut, [BACKUP_KEY]: JSON.stringify(seasonRecord()) },
    () => loadState(H));
  assert.equal(r.recovered, true);
  assert.equal(r.recoveredFrom, 'unreadable');
  assert.equal(r.state.teams[0].season.games.length, 2, 'the season came back too');

  // no backup either, but the v4 record the migration read is still sitting
  // there untouched -- which is the entire reason it is never written
  const toV4 = withStore({ [KEY]: cut, [V4_KEY]: JSON.stringify(v4()) }, () => loadState(H));
  assert.equal(toV4.migratedFrom, 4);
  assert.equal(toV4.state.teams[0].players.length, 2);

  // and the v4 backup is read as well: the first boot after an upgrade is
  // exactly when a half-written v5 record is most likely, and at that moment
  // there are two readable v4 copies on the device
  const toV4Bak = withStore({ [KEY]: cut, [V4_BACKUP_KEY]: JSON.stringify(v4()) }, () => loadState(H));
  assert.equal(toV4Bak.migratedFrom, 4);
  assert.equal(toV4Bak.state.teams[0].players.length, 2);
});

test('a truncated record with nothing behind it is null, not a phantom team', () => {
  const cut = JSON.stringify(seasonRecord()).slice(0, 140);
  assert.equal(withStore({ [KEY]: cut }, () => loadState(H)), null);
});

/* ================================================================== *
 * v5 → v6: a team gains settings
 *
 * The same discipline the season got. `teams[].settings` is how this
 * team wants its plans made; an ABSENT block means today's defaults, so
 * a v5 record -- and a v5 backup file a coach saved last week -- loads
 * with the app behaving exactly as it did. There is still no version
 * branch in storage.js: the shape is the migration.
 * ================================================================== */

// a genuine v5 shape: `teams[].season`, and no `settings` anywhere
const v5record = () => {
  const r = JSON.parse(JSON.stringify(seasonRecord()));
  r.version = 5;
  for (const t of r.teams) delete t.settings;
  return r;
};

test('a v5 record has no settings block at all, or this file is testing nothing', () => {
  for (const t of v5record().teams) {
    assert.equal('settings' in t, false, 'the v5 fixture must not carry v6\'s addition');
  }
});

test('a v5 record migrates forward with default settings and nothing else lost', () => {
  const s = sanitize(v5record(), H);

  assert.equal(s.version, 6);
  assert.equal(s.teams.length, 2, 'both teams survive');
  for (const t of s.teams) {
    assert.deepEqual(t.settings, { ...DEFAULT_SETTINGS },
      'a v5 team has no settings, and an absent block must load as the defaults');
  }
  assert.equal(s.teams[0].settings.maxSubs, 3,
    'the default is the number engine.js has always used, so nothing changes for anyone');

  // field by field, the way the v4 → v5 test does it: "it still parses" is
  // not the bar for a migration a coach's only roster goes through
  const t = s.teams[0];
  assert.deepEqual(t.players.map(p => p.id), ['a', 'b'], 'player ids are untouched');
  assert.deepEqual(t.players.map(p => p.name), ['Marcus Webb', 'Eli Tran']);
  assert.deepEqual(t.players.map(p => p.tier), [5, 2], 'levels survive');
  assert.deepEqual(t.players.map(p => p.hue), [3, 7], 'colours survive');
  assert.equal(t.day.name, 'Sat');
  assert.equal(t.day.games[0].label, 'Northgate');
  assert.deepEqual(t.day.games[0].out, ['b'], 'availability survives');
  assert.equal(t.day.games[0].live.at, 2);
  assert.equal(t.day.games[0].constraints.maxMinutes.a, 12, 'constraints survive');
  assert.deepEqual(t.day.games[0].constraints.pairs, [['a', 'b']]);
  assert.equal(t.season.games.length, 2, 'the season survives, which is the whole of v5');
  assert.deepEqual(t.season.games[0].minutes, { a: 18.5, b: 13.5 },
    'the minutes a coach would quote to a parent are untouched');
  assert.equal(s.teams[1].players[0].name, 'Nia Brooks');
  assert.equal(s.activeTeam, 1);
  assert.equal(s.tourSeen, true);
  assert.equal(s.view, 'team',
    'the view key was renamed in A40 slice 2 and an old record carries the old '
    + 'string; `sanitize` translates it, which is what stops a backup file '
    + 'written last season landing on the wrong page');
  assert.equal(s.ui.theme, 'dark');
  assert.equal(s.ui.prints, 4);
});

test('the v5 → v6 migration is shape-driven, so it is idempotent', () => {
  const once = sanitize(v5record(), H);
  assert.deepEqual(sanitize(once, H), once);
});

test('a v6 record round-trips unchanged, settings included', () => {
  const s = sanitize(v5record(), H);
  s.teams[0].settings.maxSubs = 5;
  s.teams[1].settings.maxSubs = 1;
  assert.deepEqual(sanitize(s, H), s, 'a v6 record must survive a load byte for byte');
  // and through a write and a read of the actual stored bytes, which is what
  // a reload really is
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s)), H), s);
});

test('a junk or out-of-range maxSubs lands on something a coach can use', () => {
  const at = raw => sanitize({ version: 6, onboarded: true,
    teams: [{ ...good(), settings: raw }] }, H).teams[0].settings.maxSubs;
  assert.equal(at({ maxSubs: 9 }), 5, 'five is the whole floor; nothing above it means anything');
  assert.equal(at({ maxSubs: 0 }), 1, 'zero changes is not a rotation');
  assert.equal(at({ maxSubs: -4 }), 1);
  assert.equal(at({ maxSubs: 2.6 }), 3, 'a fraction of a player does not exist');
  for (const junk of [undefined, null, 'three', {}, [], NaN]) {
    assert.equal(at({ maxSubs: junk }), 3, String(junk));
  }
  for (const junk of [undefined, null, 'nope', 42, []]) {
    assert.equal(at(junk), 3, `a settings block of ${String(junk)} is the defaults`);
  }
});

test('a settings block holds only what the app reads, so the file makes no claim it does not keep', () => {
  const s = sanitize({ version: 6, onboarded: true,
    teams: [{ ...good(), settings: { maxSubs: 4, tieBreak: 'levels', leagueMin: 12 } }] }, H);
  assert.deepEqual(Object.keys(s.teams[0].settings),
    ['maxSubs', 'tieBreak', 'minMinutes', 'seasonDefault', 'periods', 'periodMinutes'],
    'a key nothing honours must not survive into the record a coach can open');
  assert.equal(s.teams[0].settings.maxSubs, 4);
  assert.equal(s.teams[0].settings.tieBreak, 'levels');
  // `leagueMin` above is the junk key now: the honoured one is `minMinutes`,
  // and a record that never mentioned it means off
  assert.equal(s.teams[0].settings.minMinutes, 0);
});

test('a junk or out-of-range league minimum is off, not a rule the coach never gave', () => {
  const at = raw => sanitize({ version: 6, onboarded: true,
    teams: [{ ...good(), settings: raw }] }, H).teams[0].settings.minMinutes;
  assert.equal(at({ minMinutes: 10 }), 10);
  assert.equal(at({ minMinutes: '12' }), 12, 'a number typed into a field is a string');
  assert.equal(at({ minMinutes: 8.6 }), 9, 'a fraction of a minute is not a league rule');
  assert.equal(at({ minMinutes: -4 }), 0);
  assert.equal(at({ minMinutes: 900 }), 60, 'longer than any youth game is a typo');
  for (const junk of [undefined, null, '', ' ', 'ten', {}, [], NaN]) {
    assert.equal(at({ minMinutes: junk }), 0, String(junk));
  }
  assert.equal(at(undefined), 0, 'a v5 record has no settings block at all');
});

test('a junk or unknown tie-break stance falls back to the default, not to nothing', () => {
  const at = raw => sanitize({ version: 6, onboarded: true,
    teams: [{ ...good(), settings: raw }] }, H).teams[0].settings.tieBreak;
  assert.equal(at({ tieBreak: 'levels' }), 'levels');
  assert.equal(at({ tieBreak: 'behind' }), 'behind');
  for (const junk of [undefined, null, '', 'Levels', 'strongest', 3, {}, [], true]) {
    assert.equal(at({ tieBreak: junk }), 'behind',
      `a stance nothing implements must not reach the solver: ${String(junk)}`);
  }
  assert.equal(at(undefined), 'behind', 'no settings block at all is the default stance');
});

test('a record written before the stance existed loads with the old behaviour', () => {
  // the whole no-version-branch bargain: absent means default, so a v6 record
  // from before this key keeps solving exactly as it did
  const s = sanitize({ version: 6, onboarded: true,
    teams: [{ ...good(), settings: { maxSubs: 2 } }] }, H);
  assert.equal(s.teams[0].settings.maxSubs, 2, 'the key that was there survives');
  assert.equal(s.teams[0].settings.tieBreak, DEFAULT_SETTINGS.tieBreak);
});

test('one team\'s settings are its own — there is no cascade', () => {
  const raw = { version: 6, onboarded: true, teams: [
    { ...good(), settings: { maxSubs: 5 } },
    { ...good(), settings: { maxSubs: 1 } },
  ] };
  const s = sanitize(raw, H);
  assert.equal(s.teams[0].settings.maxSubs, 5);
  assert.equal(s.teams[1].settings.maxSubs, 1, 'a league rule for one squad never lands on the other');
  s.teams[0].settings.maxSubs = 2;
  assert.equal(s.teams[1].settings.maxSubs, 1, 'and the two objects are not shared');
});

/* ---- what loadState does with a v5 key ---- */

test('a v5 record under the old key loads, migrated, when there is no v6 yet', () => {
  const r = withStore({ [V5_KEY]: JSON.stringify(v5record()) }, () => loadState(H));
  assert.equal(r.migrated, true);
  assert.equal(r.migratedFrom, 5);
  assert.equal(r.state.version, 6);
  assert.equal(r.state.teams.length, 2);
  assert.deepEqual(r.state.teams[0].players.map(p => p.name), ['Marcus Webb', 'Eli Tran']);
  assert.equal(r.state.teams[0].season.games.length, 2, 'the season came with it');
  assert.deepEqual(r.state.teams[0].settings, { ...DEFAULT_SETTINGS });
});

test('the v5 record is read, never written — a downgraded coach still finds it', () => {
  const m = new Map([[V5_KEY, JSON.stringify(v5record())]]);
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) },
  });
  try {
    const before = m.get(V5_KEY);
    const r = loadState(H);
    assert.equal(saveState(r.state), null);
    assert.equal(m.get(V5_KEY), before, 'v5 is left exactly as it was');
    assert.ok(m.has(KEY), 'the migrated record is written under v6');
    assert.equal(JSON.parse(m.get(KEY)).version, 6);
  } finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete globalThis.localStorage;
  }
});

test('v6 wins over v5, and v5 over v4, so an upgrade never loads yesterday', () => {
  const now = sanitize(v5record(), H);
  now.teams[0].name = 'Hawks';
  now.teams[0].settings.maxSubs = 2;
  const stale = v5record();
  stale.teams[0].name = 'STALE';
  const r = withStore({ [KEY]: JSON.stringify(now), [V5_KEY]: JSON.stringify(stale),
                        [V4_KEY]: JSON.stringify(v4()) }, () => loadState(H));
  assert.equal(r.recovered, false);
  assert.equal(r.migrated, undefined);
  assert.equal(r.state.teams[0].name, 'Hawks');
  assert.equal(r.state.teams[0].settings.maxSubs, 2, 'the coach\'s own number, not a default');

  const noV6 = withStore({ [V5_KEY]: JSON.stringify(stale), [V4_KEY]: JSON.stringify(v4()) },
    () => loadState(H));
  assert.equal(noV6.migratedFrom, 5, 'v5 outranks v4');
});

test('a truncated v6 record falls back to the v6 backup, then to v5, then to the v5 backup', () => {
  // half-written bytes: a quota failure or a tab killed mid-setItem
  const record = sanitize(v5record(), H);
  record.teams[0].settings.maxSubs = 4;
  const cut = JSON.stringify(record).slice(0, 140);

  const toBak = withStore({ [KEY]: cut, [BACKUP_KEY]: JSON.stringify(record) }, () => loadState(H));
  assert.equal(toBak.recovered, true);
  assert.equal(toBak.recoveredFrom, 'unreadable');
  assert.equal(toBak.state.teams[0].settings.maxSubs, 4, 'the settings came back too');
  assert.equal(toBak.state.teams[0].season.games.length, 2);

  // no v6 backup either, but the v5 record the migration read is still sitting
  // there untouched -- which is the entire reason it is never written
  const toV5 = withStore({ [KEY]: cut, [V5_KEY]: JSON.stringify(v5record()) }, () => loadState(H));
  assert.equal(toV5.migratedFrom, 5);
  assert.equal(toV5.state.teams[0].players.length, 2);
  assert.equal(toV5.state.teams[0].season.games.length, 2);

  // and the v5 backup as well: the first boot after an upgrade is exactly when
  // a half-written v6 record is most likely, and at that moment there are two
  // readable v5 copies on the device
  const toV5Bak = withStore({ [KEY]: cut, [V5_BACKUP_KEY]: JSON.stringify(v5record()) },
    () => loadState(H));
  assert.equal(toV5Bak.migratedFrom, 5);
  assert.equal(toV5Bak.state.teams[0].players.length, 2);

  // and with nothing behind it at all, still null rather than a phantom team
  assert.equal(withStore({ [KEY]: cut }, () => loadState(H)), null);
});

/* ================================================================== *
 * how far off their share (B3)
 *
 * The input to season carryover, and the number a coach would have to be
 * able to defend to a parent. "Their share" is attendance-weighted, one
 * game at a time: a game's share is its own mean, and a player is only
 * ever measured against the games they were actually in.
 * ================================================================== */
const sgame = (id, minutes) => ({ id, date: '2026-01-10', day: '', opponent: '',
  periods: 4, periodMinutes: 8, minutes });
const round = v => Math.round(v * 100) / 100;

test('a perfectly even season leaves nobody owed anything', () => {
  const even = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, 32]));
  const { deficit } = seasonShare([sgame('s1', even), sgame('s2', even)]);
  assert.deepEqual(deficit, { a: 0, b: 0, c: 0, d: 0, e: 0 });
});

test('the share is the game\'s own mean, so missing a game owes you nothing', () => {
  /* The decision this pins, and the one that would be easiest to get wrong:
     an equal split of the whole season across the roster would hand the kid
     who missed a game a claim on a game\'s worth of floor time, paid for by
     the kids who turned up. Attendance is not a debt. */
  const full = { a: 20, b: 20, c: 20, d: 20 };
  const { deficit, expected, appearances } = seasonShare([
    sgame('s1', full),
    sgame('s2', { a: 30, b: 30, c: 30 }),      // d was not there
  ]);
  assert.equal(deficit.d, 0, 'the absent player is neither owed nor in credit');
  assert.equal(expected.d, 20, 'and is only ever measured against the game they were in');
  assert.equal(appearances.d, 1);
  assert.equal(deficit.a, 0);
});

test('within-game unfairness is what accumulates, and it accumulates', () => {
  // the same kid two minutes light three weeks running
  const light = { a: 14, b: 16, c: 16, d: 18 };
  const { deficit } = seasonShare([sgame('s1', light), sgame('s2', light), sgame('s3', light)]);
  assert.equal(round(deficit.a), 6, 'three games at two minutes down is six minutes owed');
  assert.equal(round(deficit.d), -6, 'and the kid who took them is six up');
  assert.equal(round(deficit.b), 0);
});

test('a player who has left the roster still counts toward the mean they were part of', () => {
  /* Dropping them would inflate everyone else\'s share and invent deficits out
     of a departure. The season is history; it is not rewritten to match
     today\'s list. */
  const withGone = seasonShare([sgame('s1', { a: 10, b: 20, gone: 30 })]);
  assert.equal(round(withGone.expected.a), 20, 'the mean of the three who played');
  assert.equal(round(withGone.deficit.a), 10);
  assert.equal(round(withGone.deficit.gone), -10, 'and the departed id is still measured');
});

test('an empty season and an empty game are both nothing, not a throw', () => {
  assert.deepEqual(seasonShare([]).deficit, {});
  assert.deepEqual(seasonShare(undefined).deficit, {});
  assert.deepEqual(seasonShare([sgame('s1', {}), null, 'nope']).deficit, {});
});

test('a one-game season is a real season, just a small one', () => {
  const { deficit } = seasonShare([sgame('s1', { a: 12, b: 20 })]);
  assert.equal(round(deficit.a), 4);
  assert.equal(round(deficit.b), -4);
});

/* ---- the switch that reads it back ---- */

test('season carryover is off on a record written before it existed', () => {
  const s = sanitize(good(), H);
  assert.equal(s.teams[0].day.games[0].useSeasonTargets, false,
    'a coach who has never opened the season must see no change whatsoever');
});

test('season carryover round-trips once a coach turns it on', () => {
  const rec = good();
  rec.day.games[0].useSeasonTargets = true;
  assert.equal(sanitize(rec, H).teams[0].day.games[0].useSeasonTargets, true);
  // and it is a boolean whatever was on the record
  rec.day.games[0].useSeasonTargets = 'yes please';
  assert.equal(sanitize(rec, H).teams[0].day.games[0].useSeasonTargets, true);
  rec.day.games[0].useSeasonTargets = 0;
  assert.equal(sanitize(rec, H).teams[0].day.games[0].useSeasonTargets, false);
});

/* ================================================================== *
 * the view key, and the one place a superseded one is translated
 *
 * A40 renamed the Roster tab to Team in three steps: the label (slice 1),
 * the per-team settings (slice 2A) and finally the stored key (slice 2B).
 * `state.view` is persisted, so the last step is a data question, and the
 * case that decides it is NOT the returning coach on this device -- the
 * user waived those -- but the `.json` BACKUP FILE a coach exported before
 * the rename. `restoreBackup` runs it through this same `sanitize`, so a
 * broken key means landing on Games the one day the file is actually
 * needed, silently. Hence a translation rather than a break.
 *
 * The risk the translation carries is the one this repo keeps re-finding: a
 * SECOND implementation of the same question, in `applyView` or in the
 * markup, drifting away from this one. So there is a structural arm below
 * as well as a behavioural one, and it is written to catch a mapping being
 * ADDED, not only one being renamed.
 * ================================================================== */

const viewRec = (view) => ({ ...good(), view });

test('a record stored on the old `roster` key loads on Team', () => {
  assert.equal(sanitize(viewRec('roster'), H).view, 'team',
    "a backup file written before A40 slice 2 carries `view: 'roster'`, and it "
    + 'must land on the page that used to be called that');
});

test('a record already on `team` survives untouched', () => {
  assert.equal(sanitize(viewRec('team'), H).view, 'team');
  // and translating is idempotent, which is what keeps `sanitize` shape-driven
  // rather than version-driven: running it twice may never move the key again
  assert.equal(sanitize(sanitize(viewRec('roster'), H), H).view, 'team');
});

test('every other view key is untouched, and anything unknown still lands on Games', () => {
  for (const v of ['games', 'season', 'settings']) {
    assert.equal(sanitize(viewRec(v), H).view, v, `the ${v} view stopped round-tripping`);
  }
  for (const v of ['teams', 'welcome', 'ROSTER', '', null, 42, {}, undefined, 'constructor']) {
    assert.equal(sanitize(viewRec(v), H).view, 'games',
      `${JSON.stringify(v)} is not a view this app has, and a record carrying it `
      + 'must not be able to hide every view at once');
  }
});

test('every tab in the markup names a view `sanitize` accepts unchanged', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-view="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 3, 'the nav bar did not parse -- re-read this test before trusting it');
  for (const k of keys) {
    assert.equal(sanitize(viewRec(k), H).view, k,
      `the bar offers a tab for view "${k}", which \`sanitize\` does not accept as-is: `
      + 'a coach who taps it, reloads, and comes back lands somewhere else');
  }
  assert.ok(!keys.includes('roster'),
    'the markup still ships the superseded view key -- the tab and the stored key must agree, '
    + 'and `roster` is only allowed to exist as a translation in storage.js');
});

test('storage.js is the only place a view key is translated', () => {
  /* Written as a scan of every served module rather than a list, because the
     failure this is for is a SECOND translation being ADDED -- in `applyView`,
     in a new view module, in a file that does not exist yet -- and a hand-kept
     list closes over exactly today's set (A20 slice 1). The first version of
     this guard matched `view === 'roster'` and went GREEN against
     `if (v === 'roster') v = 'team';` dropped into `applyView`, which is the
     precise mutation it exists to catch.

     Comments are stripped first, on purpose: `roster` is still the right NOUN
     for the list of players, `SECTIONS.roster` is still the right repaint key,
     and balance.js explains itself with the word. What may not survive is the
     string LITERAL, which is only ever a key. */
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const files = readdirSync(new URL('../app/', import.meta.url)).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 20 && files.includes('render.js'), 'the module scan found nothing to scan');
  for (const f of files) {
    const raw = readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
    const src = strip(raw);
    assert.ok(src.length > raw.length * 0.2, `${f}: the comment stripper ate the file`);
    const hits = [...src.matchAll(/['"]roster['"]/g)].length;
    const want = f === 'storage.js' ? 1 : 0;
    assert.equal(hits, want, f === 'storage.js'
      ? 'storage.js must carry the one translation of the superseded view key, and only one'
      : `${f} names the superseded view key '${'roster'}'. The translation lives in ONE place, `
        + '`VIEW_WAS` in storage.js; a second one here is exactly the drift this guard exists to stop');
  }
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/data-view=["']roster|id="view-roster"/.test(html), 'index.html uses the superseded view key');
  /* ONE mirror is allowed and it is the pre-paint script, which runs before any
     module exists and so cannot import `VIEW_WAS`. A41's script is inline for
     that reason and A42 made it read the view. It is pinned to storage.js's map
     member-for-member by test/first-paint.test.js, which is what keeps it a
     mirror rather than a second implementation -- but only ONE copy of it can
     be pinned, so a second literal in this file is the drift again. */
  const inHtml = [...strip(html).matchAll(/'roster'/g)].length;
  assert.equal(inHtml, 1,
    'index.html must carry exactly one `\'roster\'` -- the pre-paint script\'s mirror of '
    + `VIEW_WAS, pinned by test/first-paint.test.js. Found ${inHtml}`);
  assert.ok(/setAttribute\('data-boot'/.test(strip(html).split("'roster'")[1] || ''),
    'the one `\'roster\'` in index.html is no longer inside the pre-paint script');
  const storage = readFileSync(new URL('../app/storage.js', import.meta.url), 'utf8');
  assert.match(storage, /VIEW_WAS = new Map\(\[\['roster', 'team'\]\]\)/,
    'the one translation is gone -- an old backup file now restores onto the wrong page');
});
