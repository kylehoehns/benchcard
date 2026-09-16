import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadState, KEY, BACKUP_KEY, V5_KEY, V5_BACKUP_KEY, V4_KEY, V4_BACKUP_KEY,
         V3_KEY, COLORS } from '../app/storage.js';

/* THE FIRST FRAME AND THE LOADER MUST ANSWER THE SAME QUESTION.
 *
 * `#view-games` is the one view that ships visible, so until A41 a coach on
 * their first ever load painted the games shell and then watched it flip to the
 * welcome screen once `app.js` had booted and found no record. Reported from
 * production. The fix is an inline pre-paint script in index.html's head — the
 * same idiom as the theme resolver beside it — that stamps
 * `data-boot="welcome"` on <html> when the boot is going to land on welcome,
 * and two rules in app.css that make the first frame agree.
 *
 * The danger in that shape is not the flash, it is the SECOND IMPLEMENTATION.
 * "Does this coach have a record" is `loadState`'s question, and after A36/A37
 * its answer is three clauses deep (`hasRoster`, or `onboarded`, or a COMPLETE
 * primary). An inline check that answers it slightly differently does not
 * remove the flash, it moves it: guess "first run" for a coach whose primary is
 * gone but whose backup is good and the welcome screen flashes at somebody with
 * a season of history. This repo has shipped that split three times already
 * (the ledger vs the CSV, the two attendance readings, the stale `#conscount`).
 *
 * So this file does not read the script, it RUNS it — the real bytes out of
 * index.html — against `loadState` over one table of records, and fails on any
 * disagreement. Written to fail: the fixtures include the three records where a
 * cheaper check flips (a complete-but-empty primary over a good backup, junk
 * over a good backup, an incomplete primary over a good backup).
 *
 * A42 WIDENED THE ANSWER FROM TWO VALUES TO FIVE, AND THIS IS STILL ONE TABLE.
 * A41's script stamped welcome or nothing, so a coach who left the app on Team,
 * Season or Settings watched the games shell paint and flip — the same defect,
 * one view along. The script now resolves the stored view too, which means it
 * depends on `sanitize`'s allow-list AND on `VIEW_WAS`, its one legacy
 * translation (`roster` → `team`, kept for backup files older than A40). The
 * `want` column below is therefore a VIEW, the boot side asks the real
 * `loadState` + the real `sanitize` for it, and every row compares both. The
 * members of the two lists are pinned separately at the foot of this file,
 * because a table can only catch a view that already exists in it — adding a
 * fifth view to `sanitize` alone is invisible to every fixture here.
 */

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');
const renderSrc = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');
const stateSrc = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');

/* The script is found by the attribute it stamps, not by position: it is the
   third inline script in the head and the two beside it must not be picked up
   by mistake. Exactly one, or the extraction is measuring the wrong thing. */
const prePaintScript = () => {
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(m => m[1])
    .filter(s => s.includes("setAttribute('data-boot'"));
  assert.equal(blocks.length, 1,
    'index.html must carry exactly one pre-paint view script; found ' + blocks.length);
  return blocks[0];
};

/* `migrateLegacy` lives in state.js, which touches `document` at import time,
   so it comes through `new Function` the way availability.test.js takes
   `setAvailable`. Copying it here would be one more second implementation. */
const migrateLegacy = (() => {
  const body = stateSrc.slice(stateSrc.indexOf('export function migrateLegacy'));
  const fn = body.slice(0, body.indexOf('\n}\n') + 2).replace('export function', 'function');
  // eslint-disable-next-line no-new-func
  return new Function('newGame', `${fn}\nreturn migrateLegacy;`)(() => newGame());
})();

const emptyConstraints = () => ({
  minMinutes: {}, maxMinutes: {}, pairs: [], avoids: [],
  openingFive: [], lastPeriodFive: [], hardPairs: false, maxConsecutive: 0,
  targetSlots: {}, lockedTargets: [], closing: { stints: 2, players: [] }, units: [],
});
const newGame = () => ({ id: 'gnew', label: '', when: '', periods: 4, periodMinutes: 8,
  granMode: 'everyN', granValue: 4, out: [], useCarryover: false, strategy: 'balanced',
  seed: 1, constraints: emptyConstraints() });
const H = { emptyConstraints, newGame, migrateLegacy };

const roster = () => [
  { id: 'a', name: 'Marcus Webb', number: '4', shortName: '' },
  { id: 'b', name: 'Eli Tran', number: '', shortName: 'ELI' },
];
const team = (players) => ({ id: 't1', name: 'Hawks', players, day: { name: '', games: [newGame()] },
  season: { games: [] }, settings: {}, activeGame: 0 });
// #25 item 8: a team carrying a color, for the tint-stamp fixtures below.
const teamColored = (color, players = roster()) =>
  ({ ...team(players), settings: { color } });
// #61: a team saved before the settings-key rename, holding only the pre-#61
// key -- for the legacy-fallback rows below.
const teamLegacyColored = (legacyColor, players = roster()) =>
  ({ ...team(players), settings: { colour: legacyColor } }); // legacy-spelling
// a whole record, the way saveState writes one
const rec = (players = roster(), onboarded = players.length > 0, view = 'games') => ({
  version: 6, onboarded, tourSeen: false, teams: [team(players)], activeTeam: 0,
  view, ui: { copies: 2, theme: 'auto' },
});
const j = v => JSON.stringify(v);

// Every value the pre-paint script can stamp. Read dynamically from the real
// source in the "allow exactly the same views" test below; asserted against
// as a literal here, twice, because both uses are checking the fixed set the
// app actually ships rather than re-deriving it from source a second time.
const VIEW_STAMPS = ['welcome', 'games', 'team', 'season', 'settings'];

/* What the browser will paint on the first frame. The script is run with the
   same stubs the timeline-skeleton test uses: a Map-backed `localStorage` and a
   documentElement that records EVERY attribute stamped on it -- #25 item 8
   adds a second `setAttribute` call (`data-tint`) to the same script, beside
   the view's own `data-boot`, so a single overwritten variable would lose
   whichever call ran first. */
const runPrePaint = (store) => {
  const stamps = {};
  const doc = { documentElement: { setAttribute: (k, v) => { stamps[k] = v; } } };
  // eslint-disable-next-line no-new-func
  new Function('localStorage', 'document', prePaintScript())(
    { getItem: k => (k in store ? store[k] : null) }, doc);
  return stamps;
};

const firstPaint = (store) => {
  const stamps = runPrePaint(store);
  const stamped = 'data-boot' in stamps ? `data-boot=${stamps['data-boot']}` : null;
  /* Today is the markup default and must stay unstamped (#23): that is what
     makes a throw in the script degrade to today's behavior instead of to a
     blank frame, and stamping a view app.css has no rule for would hide every
     view. */
  assert.ok(stamped === null || VIEW_STAMPS.some(v => stamped === `data-boot=${v}`),
    `the pre-paint script stamped something unexpected: ${stamped}`);
  return stamped === null ? 'today' : stamped.slice('data-boot='.length);
};

/* Same script, the color half: what `data-tint` the first frame carries.
   Graphite is today's app and needs no attribute (see tokens.css's own base
   blocks), so its absence reads as 'graphite', the same default `sanitize`
   gives `settings.color`. */
const firstPaintTint = (store) => runPrePaint(store)['data-tint'] || 'graphite';

/* What `app.js` will show a moment later. Line for line, app.js's boot call is
   `setView(state.onboarded ? (state.view || 'today') : 'welcome')`, and
   `setView` forces welcome by itself when the flag is false. `state.view` is
   whatever `sanitize` made of the stored key, so the allow-list and the one
   legacy translation are both asked here rather than restated. No record at all
   is `freshState()`, which is `onboarded: false`. */
const afterBoot = (store) => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: k => (k in store ? store[k] : null), setItem: () => {} },
  });
  try {
    const loaded = loadState(H);
    return loaded && loaded.state.onboarded ? (loaded.state.view || 'today') : 'welcome';
  } finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete globalThis.localStorage;
  }
};

/* #25 item 8, the color half of the same question: what `sanitize` makes of
   `teams[activeTeam].settings.color` for the real boot, read through
   `loadState` exactly as `afterBoot` reads the view above it -- never
   recomputed by hand. */
const afterBootColor = (store) => {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: k => (k in store ? store[k] : null), setItem: () => {} },
  });
  try {
    const loaded = loadState(H);
    const s = loaded && loaded.state;
    return (s && s.teams[s.activeTeam]?.settings.color) || 'graphite';
  } finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete globalThis.localStorage;
  }
};

/* Each row is a real device state. The `want` column is what a coach should
   see, and it is asserted on its own BEFORE the two sides are compared, so a
   fixture whose expectation is wrong fails as itself rather than as a
   disagreement. */
const CASES = [
  ['a brand new device', {}, 'welcome'],
  ['a returning coach', { [KEY]: j(rec()) }, 'games'],
  ['a coach mid-onboarding, flag set before the first player',
    { [KEY]: j(rec([], true)) }, 'games'],
  /* No `view` key at all -- #23's Today is what an unrecognized or absent
     view opens on now, not the games shell. */
  ['a record with players but no flag (a v6 record we never wrote)',
    { [KEY]: j({ version: 6, teams: [team(roster())] }) }, 'today'],

  // --- the rows a cheaper check gets wrong ---
  ['a primary that will not parse, over a good backup',
    { [KEY]: '{not json', [BACKUP_KEY]: j(rec()) }, 'games'],
  ['no primary at all, over a good backup',
    { [BACKUP_KEY]: j(rec()) }, 'games'],
  ['an incomplete primary (no version), over a good backup',
    { [KEY]: j({ teams: [team([])], onboarded: false }), [BACKUP_KEY]: j(rec()) }, 'games'],
  ['an incomplete primary (no teams), over a good backup',
    { [KEY]: j({ version: 6, onboarded: false }), [BACKUP_KEY]: j(rec()) }, 'games'],
  ['a primary that is not an object, over a good backup',
    { [KEY]: '[]', [BACKUP_KEY]: j(rec()) }, 'games'],
  ['a primary that is null, over a good backup',
    { [KEY]: 'null', [BACKUP_KEY]: j(rec()) }, 'games'],
  /* A36/A37's clause, and the one that stops this being "does any key have a
     roster": the coach who removed their last team has a COMPLETE record
     saying so, it is honoured, and the backup is never consulted. */
  ['a complete record that says the last team was removed, over a good backup',
    { [KEY]: j(rec([], false)), [BACKUP_KEY]: j(rec()) }, 'welcome'],

  // --- the migration chain -- none of these old shapes carry a view key ---
  ['a v5 record only', { [V5_KEY]: j({ version: 5, teams: [team(roster())] }) }, 'today'],
  ['a v5 backup only', { [V5_BACKUP_KEY]: j({ version: 5, teams: [team(roster())] }) }, 'today'],
  ['a v4 record only', { [V4_KEY]: j({ version: 4, teams: [team(roster())] }) }, 'today'],
  ['a v4 backup only', { [V4_BACKUP_KEY]: j({ version: 4, teams: [team(roster())] }) }, 'today'],
  ['a v3 record only (roster at the top level)',
    { [V3_KEY]: j({ version: 3, players: roster(), day: { name: '', games: [newGame()] } }) }, 'today'],
  ['a v3 record with an empty roster', { [V3_KEY]: j({ version: 3, players: [] }) }, 'welcome'],
  ['an unusable primary with a v4 record behind it',
    { [KEY]: '{not json', [V4_KEY]: j({ version: 4, teams: [team(roster())] }) }, 'today'],
  ['a legacy v2 record',
    { 'rotation-card.v2': j({ roster: 'Marcus\nEli\n', day: { name: '', games: [newGame()] } }) }, 'today'],
  ['a legacy v1 record',
    { 'rotation-card.v1': j({ roster: 'Marcus\nEli\n', day: { name: '', games: [newGame()] } }) }, 'today'],
  ['a legacy record with a blank roster', { 'rotation-card.v2': j({ roster: '  \n\n' }) }, 'welcome'],

  // --- the edges sanitize has opinions about ---
  ['players that are not players (no id)',
    { [KEY]: j({ version: 6, teams: [team([{ name: 'ghost' }])], onboarded: false }) }, 'welcome'],
  ['a thirteenth team is the only one with players (sanitize keeps twelve)',
    { [KEY]: j({ version: 6, onboarded: false,
      teams: [...Array(12)].map(() => team([])).concat([team(roster())]) }) }, 'welcome'],
  ['an empty object', { [KEY]: '{}' }, 'welcome'],
  ['an empty object over a good backup', { [KEY]: '{}', [BACKUP_KEY]: j(rec()) }, 'games'],

  /* --- A42/#23: the stored view, which is the other half of the boot call ---
     Every one of the five screens gets its own row, plus A40's legacy key and
     the ways a view value can be wrong -- an unrecognized or missing one now
     opens Today rather than Games. `'constructor'` is in here because the
     mapping is a Map for exactly that reason. */
  ['a coach who left the app on Today', { [KEY]: j(rec(roster(), true, 'today')) }, 'today'],
  ['a coach who left the app on Games', { [KEY]: j(rec(roster(), true, 'games')) }, 'games'],
  ['a coach who left the app on the Team tab', { [KEY]: j(rec(roster(), true, 'team')) }, 'team'],
  ['a coach who left the app on Season', { [KEY]: j(rec(roster(), true, 'season')) }, 'season'],
  ['a coach who left the app on Settings', { [KEY]: j(rec(roster(), true, 'settings')) }, 'settings'],
  ['a record written before the Roster tab became Team',
    { [KEY]: j(rec(roster(), true, 'roster')) }, 'team'],
  ['a view key nothing recognizes', { [KEY]: j(rec(roster(), true, 'nope')) }, 'today'],
  ['a view key that is a prototype member',
    { [KEY]: j(rec(roster(), true, 'constructor')) }, 'today'],
  ['a view key that is not a string', { [KEY]: j(rec(roster(), true, 7)) }, 'today'],
  ['a view key that is an object', { [KEY]: j(rec(roster(), true, { team: 1 })) }, 'today'],
  ['a record with no view at all',
    { [KEY]: j({ version: 6, onboarded: true, teams: [team(roster())] }) }, 'today'],
  ['a coach on Settings whose primary will not parse, over a backup on Settings',
    { [KEY]: '{not json', [BACKUP_KEY]: j(rec(roster(), true, 'settings')) }, 'settings'],
  ['a backup on the old Roster key, with no primary',
    { [BACKUP_KEY]: j(rec(roster(), true, 'roster')) }, 'team'],
  ['a complete record that says the last team was removed, from Settings',
    { [KEY]: j(rec([], false, 'settings')), [BACKUP_KEY]: j(rec(roster(), true, 'team')) }, 'welcome'],
  ['a v5 record left on Season',
    { [V5_KEY]: j({ version: 5, teams: [team(roster())], view: 'season' }) }, 'season'],
  ['a v4 record left on the old Roster key',
    { [V4_KEY]: j({ version: 4, teams: [team(roster())], view: 'roster' }) }, 'team'],
  ['a v3 record left on Settings',
    { [V3_KEY]: j({ version: 3, players: roster(), view: 'settings',
      day: { name: '', games: [newGame()] } }) }, 'settings'],
  /* migrateLegacy builds a v3 record with no view, so a `view` in the old bytes
     is not the loader's answer and must not be the first frame's either. */
  ['a legacy v2 record that names a view the migration drops',
    { 'rotation-card.v2': j({ roster: 'Marcus\nEli\n', view: 'settings',
      day: { name: '', games: [newGame()] } }) }, 'today'],
  /* Decision 2: an out-of-range saved game is clamped by `sanitizeTeam`, not
     sent to Today -- the clamp is about WHICH game opens inside Games, not
     about which top-level screen the boot lands on, and neither `loadState`
     nor the pre-paint script (which never reads `activeGame`) treats it as
     anything other than an ordinary `view: 'games'` record. */
  ['an out-of-range activeGame on a coach left on Games',
    { [KEY]: j({ version: 6, onboarded: true, view: 'games',
      teams: [{ ...team(roster()), activeGame: 99 }] }) }, 'games'],
];

for (const [name, store, want] of CASES) {
  test(`first paint agrees with the boot: ${name}`, () => {
    const boot = afterBoot(store);
    assert.equal(boot, want,
      `loadState + setView land on "${boot}" for ${name}; the fixture expects "${want}"`);
    const paint = firstPaint(store);
    assert.equal(paint, boot,
      `the first frame paints "${paint}" and then the boot switches to "${boot}" for ${name} — `
      + 'that is the flash A41 fixed, in one direction or the other');
  });
}

/* #25 item 8: the team color, same shape as the view table above -- each row
   is asserted against `want` on its own before the two sides are compared. */
const COLOR_CASES = [
  ['a returning coach with no color set', { [KEY]: j(rec()) }, 'graphite'],
  ['a returning coach whose team is Royal', { [KEY]: j({ ...rec(), teams: [teamColored('royal')] }) }, 'royal'],
  ['a returning coach whose team is Hardwood', { [KEY]: j({ ...rec(), teams: [teamColored('hardwood')] }) }, 'hardwood'],
  /* THE ACTIVE-TEAM CASE. Two teams, two different colors -- a script that
     reads `teams[0]` regardless of `activeTeam` passes every row above this
     one and fails only here, which is the exact failure named in the spec's
     Proof section ("red when the script ignores activeTeam"). */
  ['a second team is active and it is Forest, the first is Royal',
    { [KEY]: j({ ...rec(), activeTeam: 1, teams: [teamColored('royal'), teamColored('forest')] }) }, 'forest'],
  ['an unrecognized color falls back to graphite',
    { [KEY]: j({ ...rec(), teams: [teamColored('teal')] }) }, 'graphite'],
  ['a color that is not a string falls back to graphite',
    { [KEY]: j({ ...rec(), teams: [teamColored(42)] }) }, 'graphite'],
  ['an out-of-range activeTeam clamps to the last team, which is Maroon',
    { [KEY]: j({ ...rec(), activeTeam: 99, teams: [teamColored('royal'), teamColored('maroon')] }) }, 'maroon'],
  ['a good backup, no primary, team is Gold',
    { [BACKUP_KEY]: j({ ...rec(), teams: [teamColored('gold')] }) }, 'gold'],
  ['a v3 record (no settings at all) has no color to read',
    { [V3_KEY]: j({ version: 3, players: roster(), day: { name: '', games: [newGame()] } }) }, 'graphite'],
  ['a first-run device has no team to read a color from', {}, 'graphite'],
  /* #61: a record saved before the settings-key rename holds only the
     pre-#61 key, and the first frame must still find it, with the same
     precedence sanitizeSettings uses (storage.test.js). */
  ['a returning coach saved before #61, holding only the pre-#61 key, Navy',
    { [KEY]: j({ ...rec(), teams: [teamLegacyColored('navy')] }) }, 'navy'],
  ['color wins over a pre-#61 value when both are on the record',
    { [KEY]: j({ ...rec(), teams: [{ ...team(roster()), settings: { color: 'royal', colour: 'navy' } }] }) }, 'royal'], // legacy-spelling
];

for (const [name, store, want] of COLOR_CASES) {
  test(`first paint's tint agrees with the boot: ${name}`, () => {
    assert.ok(COLORS.includes(want), `fixture expectation "${want}" is not one of COLORS`);
    const boot = afterBootColor(store);
    assert.equal(boot, want, `loadState resolves "${boot}" for ${name}; the fixture expects "${want}"`);
    const paint = firstPaintTint(store);
    assert.equal(paint, boot,
      `the first frame stamps "${paint}" and then the boot resolves "${boot}" for ${name} — `
      + 'a coach whose active team is not Graphite would see a Graphite frame first');
  });
}

/* The height is the other half, and it is a NUMBER the first frame has to get
   right rather than a state. An empty strip is 9.6px of padding; the row a
   coach actually gets is that plus a chip. Both numbers are read out of the
   stylesheet's own rules and compared, so a chip that grows a taller target
   fails here instead of silently re-opening the jump. */
/* A COMMENT THAT CLOSES EARLY EATS THE RULE BELOW IT, AND EVERY GUARD IN THIS
 * FILE READS app.css AS TEXT, SO NONE OF THEM CAN SEE IT.
 *
 * A45's own working tree: a paragraph added to the comment above the welcome
 * rules carried a closing delimiter of its own, so the comment ended early, the
 * orphaned prose parsed as a selector, and it swallowed the whole welcome rule.
 * `npm test` stayed green -- `css.includes` on that selector is true either way
 * -- and the browser showed a first-timer the top bar, the team strip and the
 * games shell stacked under the welcome screen. Only the live probe caught it.
 * The delimiters are what broke, so count them. */
test('app.css closes every comment exactly once', () => {
  const opens = (css.match(/\/\*/g) || []).length;
  const closes = (css.match(/\*\//g) || []).length;
  assert.equal(closes, opens,
    `app.css has ${opens} comment openers and ${closes} closers; a comment closed twice orphans the prose `
    + 'into the cascade and the next rule after it never applies');
  const residue = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(residue, /\*\/|\/\*/,
    'a comment delimiter survives outside a comment in app.css');
});

test('the welcome stamp still hides the bar and the foot', () => {
  for (const sel of ['.bar', '.foot']) {
    assert.ok(css.includes(`html[data-boot="welcome"] ${sel}`),
      `the welcome rule no longer hides ${sel}`);
  }
});

test('the pre-paint script never throws, whatever it finds', () => {
  const nasty = ['', '{', 'undefined', '[1,2]', '"a string"', '0', 'false',
    j({ teams: 'not an array' }), j({ teams: [null] }), j({ teams: [{ players: 'no' }] })];
  for (const bytes of nasty) {
    for (const key of [KEY, BACKUP_KEY, V5_KEY, V4_KEY, V3_KEY, 'rotation-card.v2']) {
      assert.doesNotThrow(() => firstPaint({ [key]: bytes }), `${key} = ${bytes}`);
    }
  }
});

/* WHAT IT DOES WHEN THE READ FAILS, which is a decision and not an accident.
 *
 * A storage that throws on every `getItem` — Safari with cookies blocked, a
 * locked-down enterprise profile — is not a coach with a record we cannot see:
 * `storage.js`'s own `read` catches the same throw, returns null for every key
 * and `loadState` returns null, so the app WILL show the welcome screen. The
 * pre-paint script therefore says welcome too, because agreeing is the whole
 * job. The fallback that matters is the outer catch: if the SCRIPT breaks,
 * nothing is stamped and the markup default stands, which is games — today's
 * behavior, and the returning coach's case rather than the once-ever one. */
test('a storage that refuses to answer lands where the boot lands', () => {
  const denied = { getItem: () => { throw new Error('denied'); } };
  let stamped = null;
  const doc = { documentElement: { setAttribute: (k, v) => { stamped = `${k}=${v}`; } } };
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function('localStorage', 'document', prePaintScript())(denied, doc);
  });

  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: denied });
  let boot;
  try { const l = loadState(H); boot = l && l.state.onboarded ? 'games' : 'welcome'; }
  finally {
    if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
    else delete globalThis.localStorage;
  }
  assert.equal(boot, 'welcome', 'loadState no longer treats an unreadable storage as a first run');
  assert.equal(stamped === 'data-boot=welcome' ? 'welcome' : 'games', boot,
    'the first frame and the boot disagree when storage is denied');
});

test('a broken pre-paint script stamps nothing, leaving the markup default', () => {
  // the outer catch is the fallback, and it must not be the inner one: a throw
  // anywhere in the resolution has to leave <html> alone
  let stamped = null;
  const doc = { documentElement: null };  // reading .setAttribute of null throws
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function('localStorage', 'document', prePaintScript())({ getItem: () => null }, doc);
  }, 'the pre-paint script must never throw; it runs before everything else');
  assert.equal(stamped, null);
  assert.ok(/\}\s*catch\s*\(e\)\s*\{\s*\}\s*\}\s*\)\(\);/.test(prePaintScript()),
    'the pre-paint script has lost its outer catch');
});

test('the stamp, the stylesheet and applyView name the same attribute', () => {
  const stamp = prePaintScript().match(/setAttribute\('([^']+)',\s*[A-Za-z_$][\w$]*\)/);
  assert.ok(stamp, 'the pre-paint script no longer stamps an attribute');
  const [, attr] = stamp;
  assert.equal(attr, 'data-boot');
  /* Every value the script can stamp needs both halves of a rule in app.css:
     the Today shell out of the way, and the view the boot is landing on in.
     A stamp with no rule behind it is a frame with every view hidden, which is
     the one outcome worse than the flash. */
  for (const v of VIEW_STAMPS) {
    assert.ok(css.includes(`html[${attr}="${v}"] #view-today`),
      `app.css does not hide #view-today for [${attr}="${v}"], so the stamp paints nothing`);
    assert.ok(css.includes(`html[${attr}="${v}"] #view-${v}[hidden]`),
      `app.css does not reveal #view-${v} for [${attr}="${v}"]`);
  }
  /* Scoped to applyView's own body, not to a window of source: a stale stamp
     hides Today behind !important, so the removal has to be on the path
     every view change takes. */
  const at = renderSrc.indexOf('function applyView(');
  assert.ok(at > 0, 'applyView is gone from render.js');
  const body = renderSrc.slice(at, renderSrc.indexOf('\n}\n', at));
  assert.ok(body.includes(`removeAttribute('${attr}')`),
    `applyView does not remove ${attr}; the pre-paint stamp would outlive the boot and `
    + 'hide Today from a coach who has just finished onboarding');
});

test('the pre-paint rule uses the display the welcome view actually has', () => {
  // the override has to restate a display to outrank `[hidden]`; if `.welcome`
  // ever stops being a grid, the first frame lays out differently from the rest
  const own = css.match(/\n\.welcome \{[^}]*?display:\s*([a-z-]+)/);
  assert.ok(own, '.welcome no longer declares a display');
  const pre = css.match(/html\[data-boot="welcome"\] #view-welcome\[hidden\] \{[^}]*?display:\s*([a-z-]+)/);
  assert.ok(pre, 'the pre-paint rule for #view-welcome is gone');
  assert.equal(pre[1], own[1],
    `the first frame gives the welcome view display:${pre[1]} and the app gives it display:${own[1]}`);
});

/* The other four views have no author `display` of their own — Games is
   `<main class="view print-path">`, Team/Season/Settings are
   `<main class="view wrap">` — so the browser gives them `block`, and the
   pre-paint rule restates `block` for that reason. The day one of them
   becomes a grid, the first frame would lay it out differently from every
   frame after it, so the absence is asserted rather than assumed. */
test('the pre-paint rules for Games, Team, Season and Settings restate the right display', () => {
  for (const v of ['games', 'settings']) {
    const pre = css.match(new RegExp(`html\\[data-boot="${v}"\\] #view-${v}\\[hidden\\] \\{[^}]*?display:\\s*([a-z-]+)`));
    assert.ok(pre, `the pre-paint rule revealing #view-${v} is gone`);
    assert.equal(pre[1], 'block');
  }
  for (const sel of ['.view', '.wrap']) {
    const own = css.match(new RegExp(`\\n\\${sel} \\{[^}]*?display:\\s*([a-z-]+)`));
    assert.equal(own, null, own && `${sel} now declares display:${own[1]}; the pre-paint rules `
      + `for Games, Team, Season and Settings still say block, so the first frame would lay them out wrong`);
  }
});

/* THE HEADER IS PART OF THE FIRST FRAME TOO (#23 review, second round).
 *
 * The rules above swap the `<main>`; nothing swapped the header. `#barToday`
 * (the team button, the keys hint, the gear) ships visible in the markup and
 * `#barBack` (the back button, the title) ships `hidden` -- only `applyView`,
 * two round trips away, ever flips them. So a coach who reloads on Games,
 * Team, Season or Settings used to see Today's OWN header -- the gear, the
 * team switcher, no back button -- sitting above the right screen for the
 * first frame(s), then watch it swap. Reported from a live Claude review of
 * PR #51, and reproduced with a frame recorder.
 *
 * `#settingsBtn` lives inside `#barToday`, so hiding `#barToday` hides the
 * gear with it -- there is no separate rule to write or to lose track of. */
test('the pre-paint rules for Games, Team, Season and Settings also swap the header', () => {
  for (const v of ['games', 'team', 'season', 'settings']) {
    const hideToday = css.match(new RegExp(`html\\[data-boot="${v}"\\][^{]*#barToday[^{]*\\{[^}]*?display:\\s*([a-z-]+)\\s*!important`));
    assert.ok(hideToday, `app.css does not hide #barToday for [data-boot="${v}"], so the first `
      + `frame shows Today's own header -- the gear and the team switcher -- over the ${v} screen`);
    assert.equal(hideToday[1], 'none');
    const showBack = css.match(new RegExp(`html\\[data-boot="${v}"\\][^{]*#barBack\\[hidden\\][^{]*\\{[^}]*?display:\\s*([a-z-]+)\\s*!important`));
    assert.ok(showBack, `app.css does not reveal #barBack for [data-boot="${v}"], so the first `
      + `frame ships with no back button over the ${v} screen`);
  }
  // the header's own display, restated so a future redesign of `.bar-back`
  // cannot drift silently out of step with what the first frame promises
  const own = css.match(/\.bar-today,\s*\.bar-back \{[^}]*?display:\s*([a-z-]+)/);
  assert.ok(own, '.bar-today, .bar-back no longer declare a shared display');
  for (const v of ['games', 'team', 'season', 'settings']) {
    const showBack = css.match(new RegExp(`html\\[data-boot="${v}"\\][^{]*#barBack\\[hidden\\][^{]*\\{[^}]*?display:\\s*([a-z-]+)`));
    assert.equal(showBack[1], own[1],
      `the first frame gives #barBack display:${showBack[1]} and the app gives it display:${own[1]}`);
  }
});

/* THE ADDITION ARM, which no fixture in the table above can reach.
 *
 * The table catches a view whose two sides disagree. It cannot catch a FIFTH
 * view added to `sanitize`'s allow-list and not to the script — there would be
 * no row for it, and the guard would go green against a boot that flashes. So
 * the two lists are compared as sets, both read out of the real source. Same
 * for the one legacy translation: `VIEW_WAS` is a Map in storage.js and a
 * literal comparison in the script, and a second entry added to either side is
 * a first frame that lands on the wrong page for somebody's backup file.
 */
test('the pre-paint script and sanitize allow exactly the same views', () => {
  const storage = readFileSync(new URL('../app/storage.js', import.meta.url), 'utf8');
  const list = (src, re, what) => {
    const m = src.match(re);
    assert.ok(m, `${what} is gone`);
    return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
  };
  const theirs = list(storage, /const VIEWS = \[([^\]]*)\]/, "storage.js's allow-list");
  const ours = list(prePaintScript(), /var VIEWS = \[([^\]]*)\]/, "the pre-paint script's allow-list");
  // the specific claim first: today is the markup default and the fallback on
  // both sides (#23), so its absence is a different bug from a set that has drifted
  assert.ok(theirs.includes('today') && ours.includes('today'),
    'today is the fallback on both sides and must be in both lists');
  assert.deepEqual([...ours].sort(), [...theirs].sort(),
    'the first frame and sanitize allow different views; a view in one list and not the other '
    + 'either flashes on boot or paints a frame with every view hidden');

  const was = [...storage.matchAll(/VIEW_WAS = new Map\(\[([\s\S]*?)\]\)/g)];
  assert.equal(was.length, 1, 'storage.js must carry exactly one VIEW_WAS map');
  const pairs = [...was[0][1].matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(pairs, [['roster', 'team']],
    'the legacy view translation changed in storage.js; the pre-paint script repeats it literally');
  const script = prePaintScript();
  for (const [from, to] of pairs) {
    assert.ok(new RegExp(`v === '${from}'\\)\\s*v = '${to}'`).test(script),
      `the pre-paint script does not translate '${from}' to '${to}', so a record written before `
      + 'the rename paints one view and the boot switches to another');
  }
  assert.equal([...script.matchAll(/'roster'/g)].length, pairs.length,
    'the pre-paint script names the superseded view key more than once');
});

test('only index.html carries the pre-paint view script', () => {
  // the guides and the six chart pages have the theme script and no views; a
  // copy there would be styling elements that do not exist
  for (const f of ['about.html', 'advanced.html', '10-player-basketball-rotation-chart.html']) {
    const src = readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('data-boot'), `${f} must not carry the pre-paint view script`);
  }
});
