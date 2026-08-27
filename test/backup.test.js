import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, DEFAULT_SETTINGS } from '../app/storage.js';
import { readFileSync } from 'node:fs';
import { backupFilename, backupText, readBackup, keepStored } from '../app/backup.js';

/* The point of this file is one property: a backup is lossless. Export writes
   the record the sanitiser produced and import runs the same sanitiser, so
   `sanitize(read(write(sanitize(x))))` must deep-equal `sanitize(x)` -- and
   the fixture below is deliberately fully populated, because the failure this
   guards against is a *new* field being added to the schema and silently not
   surviving a coach's backup. If you add a field to storage.js, add it here. */

const emptyConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [],
  openingFive: [], lastPeriodFive: [], hardPairs: false, maxConsecutive: 0,
  targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [],
});
const newGame = () => ({ id: 'gnew', label: '', when: '', periods: 4, periodMinutes: 8,
  granMode: 'everyN', granValue: 4, out: [], useCarryover: false, strategy: 'balanced',
  balance: 'even', live: { at: 0, overrides: {} }, seed: 1, constraints: emptyConstraints() });
const migrateLegacy = () => null;
const H = { emptyConstraints, newGame, migrateLegacy };

const ids = n => Array.from({ length: n }, (_, i) => 'p' + i);

/* Two teams, twelve and six players, levels away from the default, an out
   list, pairs and avoids, units, locked targets, per-player caps, a named day,
   two games and a live override mid-game. */
const populated = () => ({
  version: 4,
  onboarded: true,
  tourSeen: true,
  activeTeam: 1,
  view: 'roster',
  ui: { copies: 3, showMinutes: true, printScope: 'day', cardId: 'number',
        cardSize: 'half', cardOpen: true, tipDone: true, prints: 4, theme: 'dark' },
  teams: [
    {
      id: 't1', name: 'Wildcats 6th Grade', activeGame: 1,
      players: ids(12).map((id, i) => ({
        id, name: `Player ${i}`, number: String(i + 1), shortName: i % 3 ? '' : `P${i}`,
        tier: (i % 5) + 1, hue: (i * 5) % 12,
      })),
      day: {
        name: 'Saturday at Northgate',
        games: [
          {
            id: 'g1', label: 'Northgate', when: '9:00', periods: 4, periodMinutes: 8,
            granMode: 'everyN', granValue: 4, out: ['p10', 'p11'], useCarryover: false,
            strategy: 'closers', balance: 'finish', seed: 12345,
            live: { at: 3, overrides: { 2: ['p0', 'p1', 'p2', 'p3', 'p4'] } },
            constraints: {
              ...emptyConstraints(),
              minMinutes: { p0: 8 }, maxMinutes: { p1: 14 },
              targetSlots: { p0: 5, p1: 4 }, targetCapacity: 40,
              lockedTargets: ['p0'],
              pairs: [['p2', 'p3']], avoids: [['p4', 'p5']],
              openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'],
              lastPeriodFive: ['p0', 'p5', 'p6', 'p7', 'p8'],
              hardPairs: true, maxConsecutive: 3,
              closing: { stints: 3, players: ['p0', 'p1'] },
              units: [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6']],
            },
          },
          {
            id: 'g2', label: 'Kingsway', when: '11:30', periods: 2, periodMinutes: 16,
            granMode: 'perPeriod', granValue: 2, out: [], useCarryover: true,
            strategy: 'platoon', balance: 'both', seed: 999,
            live: { at: 0, overrides: {} }, constraints: emptyConstraints(),
          },
        ],
      },
    },
    {
      id: 't2', name: 'Wildcats 4th Grade', activeGame: 0,
      players: ids(6).map((id, i) => ({
        id: id + 'b', name: `Kid ${i}`, number: '', shortName: '', tier: 3, hue: i,
      })),
      day: { name: '', games: [{ ...newGame(), id: 'g3', granMode: 'breaksOnly' }] },
      season: { games: [
        { id: 'sg1', date: '2026-11-08', day: 'Sat at Northgate', opponent: 'Northgate',
          periods: 4, periodMinutes: 8, minutes: { p0b: 18.5, p1b: 13.5 } },
      ] },
    },
  ],
});

const roundTrip = raw => {
  const once = sanitize(raw, H);
  const back = readBackup(backupText(once), H);
  return { once, back };
};

test('a fully populated record survives export and import unchanged', () => {
  const { once, back } = roundTrip(populated());
  assert.deepEqual(back, once);
});

test('the parts a coach would notice come back intact', () => {
  const { back } = roundTrip(populated());
  assert.equal(back.teams.length, 2);
  assert.equal(back.activeTeam, 1);
  assert.equal(back.teams[0].players.length, 12);
  assert.deepEqual(back.teams[0].players.map(p => p.tier), [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2]);
  assert.deepEqual(back.teams[0].players.map(p => p.hue), [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]);
  const g = back.teams[0].day.games[0];
  assert.deepEqual(g.out, ['p10', 'p11']);
  assert.deepEqual(g.constraints.units, [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6']]);
  assert.deepEqual(g.constraints.lockedTargets, ['p0']);
  assert.deepEqual(g.live.overrides, { 2: ['p0', 'p1', 'p2', 'p3', 'p4'] });
  assert.equal(g.live.at, 3);
  assert.equal(g.seed, 12345);
  assert.equal(back.teams[1].day.games[0].granMode, 'breaksOnly');
  assert.equal(back.ui.theme, 'dark');
  assert.equal(back.ui.prints, 4);
  const season = back.teams[1].season.games;
  assert.equal(season.length, 1, 'the season survives the round trip');
  assert.equal(season[0].opponent, 'Northgate');
  assert.deepEqual(season[0].minutes, { p0b: 18.5, p1b: 13.5 },
    'the minutes a coach would quote to a parent are the point of the file');
  assert.deepEqual(back.teams[0].season, { games: [] },
    'a team with no finished games exports an empty season, not a missing one');
});

/* The record is exported straight off `state`, whose `players` / `day` /
   `activeGame` / `teamName` are non-enumerable accessors onto the active team.
   If one of them ever became enumerable the backup would carry a second copy
   of the active roster beside `teams`, and the two would disagree on the next
   load. Cheap to pin, and invisible until it bites. */
test('a backup carries teams only, never a duplicated active roster', () => {
  const state = sanitize(populated(), H);
  for (const key of ['players', 'day', 'season', 'settings', 'activeGame', 'teamName']) {
    Object.defineProperty(state, key, {
      get: () => state.teams[state.activeTeam][key === 'teamName' ? 'name' : key],
      enumerable: false, configurable: true,
    });
  }
  const written = JSON.parse(backupText(state));
  for (const key of ['players', 'day', 'season', 'settings', 'activeGame', 'teamName']) {
    assert.ok(!(key in written), `${key} leaked into the backup`);
  }
});

/* ================================================================== *
 * an old file, restored today
 *
 * This is the case a real coach hits: exported last week, storage
 * evicted (WebKit deletes local storage after seven days without a
 * visit), restoring on a build that has moved a schema since. The file
 * is the only copy, so "we can no longer read it" is the one outcome
 * this whole module exists to prevent.
 * ================================================================== */

// the file a coach saved on v5: teams and seasons, no `settings` anywhere
const v5file = () => {
  const r = JSON.parse(backupText(sanitize(populated(), H)));
  r.version = 5;
  for (const t of r.teams) delete t.settings;
  return JSON.stringify(r, null, 2);
};

test('a v5 backup file still imports into a v6 app, with nothing lost', () => {
  const raw = JSON.parse(v5file());
  for (const t of raw.teams) {
    assert.equal('settings' in t, false, 'the fixture must be a genuine pre-v6 file');
  }

  const back = readBackup(v5file(), H);
  assert.ok(back, 'a v5 file is one of ours and must be readable');
  assert.equal(back.version, 6);
  assert.equal(back.teams.length, 2);
  assert.equal(back.teams[0].players.length, 12, 'the roster is the point of the file');
  assert.deepEqual(back.teams[0].players.map(p => p.tier), [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2]);
  assert.deepEqual(back.teams[0].day.games[0].out, ['p10', 'p11']);
  assert.equal(back.teams[0].day.games[0].constraints.maxConsecutive, 3);
  assert.deepEqual(back.teams[0].day.games[0].live.overrides, { 2: ['p0', 'p1', 'p2', 'p3', 'p4'] });
  assert.deepEqual(back.teams[1].season.games[0].minutes, { p0b: 18.5, p1b: 13.5 },
    'the season a coach would quote to a parent survives the schema bump');
  assert.equal(back.ui.theme, 'dark');

  // and the team it did not know how to describe gets today's defaults, so the
  // restored app plans exactly as the file's own app did
  for (const t of back.teams) {
    assert.deepEqual(t.settings, { ...DEFAULT_SETTINGS },
      'an absent settings block is a coach who never opened the page, not a broken one');
  }

  // restoring the same file twice cannot drift: the second import is the first
  assert.deepEqual(readBackup(backupText(back), H), back);
});

test('a v6 file carries the coach\'s settings back, per team', () => {
  const state = sanitize(populated(), H);
  state.teams[0].settings.maxSubs = 5;
  state.teams[1].settings.maxSubs = 1;
  const back = readBackup(backupText(state), H);
  assert.deepEqual(back.teams.map(t => t.settings.maxSubs), [5, 1]);
  assert.deepEqual(back, state, 'and the file is still lossless with settings in it');
});

test('a v3 file imports, because sanitize already understands that shape', () => {
  const v3 = {
    version: 3,
    players: [{ id: 'a', name: 'Marcus Webb', number: '4', shortName: '' }],
    day: { name: 'Sat', games: [{ ...newGame(), id: 'g1' }] },
    activeGame: 0, teamName: 'Wildcats', ui: { copies: 2 },
  };
  const back = readBackup(JSON.stringify(v3), H);
  assert.equal(back.version, 6);
  assert.equal(back.teams.length, 1);
  assert.equal(back.teams[0].name, 'Wildcats');
  assert.equal(back.teams[0].players[0].name, 'Marcus Webb');
});

test('anything that is not one of our backups is refused, not half-imported', () => {
  for (const junk of ['', 'not json', '[]', 'null', '42', '{"a":1}',
                      JSON.stringify({ teams: [] }), JSON.stringify({ shopping: ['milk'] })]) {
    assert.equal(readBackup(junk, H), null, junk.slice(0, 20));
  }
});

test('a record with a team but no roster still imports — a coach may have deleted everyone', () => {
  const empty = sanitize({ onboarded: true, teams: [{ id: 't', name: 'Wildcats', players: [] }] }, H);
  assert.ok(readBackup(backupText(empty), H));
});

test('the filename carries the team and the day, and survives a nameless team', () => {
  const d = new Date(2026, 7, 23, 20, 30);
  assert.equal(backupFilename('Wildcats 6th Grade', d), 'benchcard-wildcats-6th-grade-2026-08-23.json');
  assert.equal(backupFilename('', d), 'benchcard-2026-08-23.json');
  assert.equal(backupFilename('  ¡¿!  ', d), 'benchcard-2026-08-23.json');
  assert.match(backupFilename('Wildcats'), /^benchcard-wildcats-\d{4}-\d{2}-\d{2}\.json$/);
});

test('the exported text is legible to a human, not one long line', () => {
  const text = backupText(sanitize(populated(), H));
  assert.ok(text.includes('\n  "teams"'), 'expected indented JSON');
});

/* ================================================================== *
 * a v4 backup file must still import into a v5 app
 *
 * This is the case a coach actually hits: they exported last week,
 * WebKit evicted the origin after seven days without a visit, and they
 * restore today against code that has moved a schema on. The file is the
 * only copy. It imports through the same `sanitize` boot uses, so this
 * costs nothing -- but it is the one thing a schema bump can silently
 * break, so it is pinned rather than assumed.
 * ================================================================== */

const v4File = () => {
  const raw = populated();          // the fully populated fixture, minus v5
  raw.version = 4;
  for (const t of raw.teams) delete t.season;
  return JSON.stringify(raw, null, 2);
};

test('a v4 backup file imports into today\'s app with nothing lost', () => {
  const back = readBackup(v4File(), H);
  assert.ok(back, 'a v4 file is still one of ours');
  assert.equal(back.version, 6);
  assert.equal(back.teams.length, 2);
  assert.deepEqual(back.teams.map(t => t.name), ['Wildcats 6th Grade', 'Wildcats 4th Grade']);
  assert.equal(back.teams[0].players.length, 12);
  assert.deepEqual(back.teams[0].players.map(p => p.hue), [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7]);
  assert.deepEqual(back.teams[0].players.map(p => p.tier), [1, 2, 3, 4, 5, 1, 2, 3, 4, 5, 1, 2]);
  const g = back.teams[0].day.games[0];
  assert.deepEqual(g.out, ['p10', 'p11']);
  assert.deepEqual(g.live.overrides, { 2: ['p0', 'p1', 'p2', 'p3', 'p4'] });
  assert.deepEqual(g.constraints.units, [['p0', 'p1', 'p2', 'p3', 'p4'], ['p5', 'p6']]);
  assert.equal(back.ui.theme, 'dark');
  assert.equal(back.activeTeam, 1);
});

test('a backup written before the Roster tab became Team restores onto Team', () => {
  /* This is the case that decided A40 slice 2B. Returning coaches on this
     device were waived -- but `populated()` is a real pre-rename file,
     carrying `view: 'roster'`, and a coach only opens a backup on the day
     something went wrong. Landing them on Games, silently, on that day, is
     the failure the translation in `sanitize` exists to prevent. */
  assert.equal(populated().view, 'roster', 'the fixture stopped being a pre-rename file');
  assert.equal(readBackup(v4File(), H).view, 'team');
  // and a file exported today already says `team`, and must come back unmoved
  const { once, back } = roundTrip(populated());
  assert.equal(once.view, 'team');
  assert.equal(back.view, 'team');
});

test('a v4 file has no season, and gets an empty one rather than a broken one', () => {
  const back = readBackup(v4File(), H);
  for (const t of back.teams) assert.deepEqual(t.season, { games: [] });
});

test('a restored v4 file matches what the same record loads as from storage', () => {
  // one sanitiser, one answer: importing a file and booting off the record
  // must not be able to disagree
  const raw = populated();
  raw.version = 4;
  for (const t of raw.teams) delete t.season;
  assert.deepEqual(readBackup(JSON.stringify(raw), H), sanitize(raw, H));
});

test('a v5 backup keeps the season through export and import', () => {
  const { once, back } = roundTrip(populated());
  assert.deepEqual(back.teams[1].season, once.teams[1].season);
  assert.equal(back.teams[1].season.games[0].date, '2026-11-08');
});

/* ------------------------------------------------------------------ *
 * The paste path
 *
 * `readBackup` takes a string and does not care where it came from, which is
 * the whole reason pasting a backup is a textarea and not a feature: what
 * these pin is that it stayed that way. A .json in an email attachment or in
 * iCloud Drive is awkward to hand to a mobile browser, and the moment this
 * exists for -- storage evicted, restoring on a phone in a hurry -- is
 * exactly when the file picker fights the coach. The wiring is DOM, so these
 * read the source the way `install.test.js` reads `toast.js`.
 * ------------------------------------------------------------------ */
const appjs = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

test('picking a file and pasting text land in one restore', () => {
  assert.equal((appjs.match(/readBackup\(/g) || []).length, 1,
    'one parser: the picker and the paste box must not be able to disagree');
  assert.equal((appjs.match(/That is not a Benchcard backup\./g) || []).length, 1,
    'one rejection message, for both ways in');
  const fn = appjs.slice(appjs.indexOf('function restoreBackup'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /undoable\(/, 'the paste path keeps the same nine-second net');
  assert.doesNotMatch(body, /confirmAction/, 'removing a team is the one confirm in this app');
});

test('both ways in are offered from both entry points', () => {
  const welcome = indexHtml.slice(indexHtml.indexOf('id="view-welcome"'), indexHtml.indexOf('id="view-team"'));
  // anchored on the heading a coach actually reads, not on a wrapper element:
  // the `<div id="backupbox">` this used to cut at existed only for this line
  const backupBox = indexHtml.slice(indexHtml.indexOf('class="set-h">Backup<'));
  for (const [name, html] of [['first run', welcome], ['settings', backupBox]]) {
    assert.match(html, /class="pastein/, `${name} offers no way to paste a backup`);
    assert.match(html, /welRestore|importBackup/, `${name} lost its file picker`);
  }
});

test('the paste path is a quiet link, not a second top-level button', () => {
  // one Restore control per entry point; the paste box is revealed from under
  // it, so it must not read as a second choice to make
  const links = [...indexHtml.matchAll(/<button[^>]*class="([^"]*paste-open[^"]*)"/g)].map((m) => m[1]);
  assert.equal(links.length, 2, 'both entry points, and only those');
  for (const cls of links) assert.match(cls, /linkish/, 'a link, not a .btn');
});

/* ================================================================== *
 * keepStored: the browser is the only one allowed to reassure a coach
 *
 * `navigator.storage.persist()` is the half of the data-loss defence that
 * costs the coach no memory, and its return value is not a report of the
 * state -- an origin can be persisted without ever asking, and a request
 * can resolve without being granted. The one rule this module has is that
 * only `persisted()` may be believed, because a sentence on the Backup
 * screen is drawn from it.
 *
 * The table is generated from two behaviour maps rather than hand-listed,
 * so a shape added to either is covered without editing an assertion --
 * which is the mutation arm this file cares about.
 * ================================================================== */
const PERSIST = {
  missing: null,
  refuses: () => Promise.resolve(false),
  grants: () => Promise.resolve(true),
  throws: () => { throw new TypeError('no'); },
  rejects: () => Promise.reject(new Error('no')),
  notAPromise: () => true,
};
const PERSISTED = {
  missing: [null, false],
  no: [() => Promise.resolve(false), false],
  yes: [() => Promise.resolve(true), true],
  throws: [() => { throw new TypeError('no'); }, false],
  rejects: [() => Promise.reject(new Error('no')), false],
  // a browser that answers with something that is not `true` has not said yes
  vague: [() => Promise.resolve('yes'), false],
};

const withNavigator = async (storage, fn) => {
  const had = Object.hasOwn(globalThis, 'navigator');
  const prev = had ? globalThis.navigator : undefined;
  Object.defineProperty(globalThis, 'navigator', { value: storage === undefined ? undefined : { storage }, configurable: true, writable: true });
  try { return await fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', { value: prev, configurable: true, writable: true });
    else delete globalThis.navigator;
  }
};

test('keepStored reports what persisted() says, whatever persist() did', async () => {
  const rows = [];
  for (const [pName, persist] of Object.entries(PERSIST)) {
    for (const [dName, [persisted, expected]] of Object.entries(PERSISTED)) {
      const storage = {};
      if (persist) storage.persist = persist;
      if (persisted) storage.persisted = persisted;
      const got = await withNavigator(storage, () => keepStored());
      assert.equal(typeof got, 'boolean', `persist:${pName} persisted:${dName} answered ${got}`);
      assert.equal(got, expected,
        `persist:${pName} persisted:${dName} -> ${got}; only persisted() may be believed`);
      rows.push(`${pName}/${dName}`);
    }
  }
  // the table is generated: if either map shrinks to nothing this must fail
  assert.equal(rows.length, Object.keys(PERSIST).length * Object.keys(PERSISTED).length);
  assert.ok(rows.length >= 30, `only ${rows.length} combinations tried`);
});

test('keepStored survives a browser with no storage API at all', async () => {
  assert.equal(await withNavigator(undefined, () => keepStored()), false);
  assert.equal(await withNavigator({}, () => keepStored()), false);
  assert.equal(await withNavigator(null, () => keepStored()), false);
});

test('nothing reassures a coach except the browser saying yes', () => {
  /* The sentence ships hidden and is unhidden from the resolved `keepStored`
     answer and nowhere else. Comments are stripped first: this rule is written
     out beside the element and beside the call, and a guard its own
     documentation can satisfy is not a guard. */
  const note = indexHtml.replace(/<!--[\s\S]*?-->/g, ' ').match(/<p[^>]*id="persistNote"[^>]*>/);
  assert.ok(note, '#persistNote is gone; app.js unhides nothing');
  assert.match(note[0], /\shidden\b/, 'the persisted line must ship hidden -- refused is the common answer');

  const js = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const mentions = [...js.matchAll(/persistNote/g)].length;
  assert.ok(mentions > 0, 'app.js no longer touches the persisted line');
  const guarded = [...js.matchAll(/keepStored\(\)[^;]*persistNote[^;]*;/g)].length;
  assert.equal(mentions, guarded,
    'the persisted line is unhidden outside keepStored()’s answer: that is a promise, not a report');
});
