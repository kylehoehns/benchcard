import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The season ledger (B2), pinned at the level its decisions live at.
 *
 * Source-level rather than rendered, for the same reason `leak.test.js` is: a
 * rendered check only ever sees the season it was handed, and these have to
 * hold for every season -- including the one with a player who left in
 * November. The behaviour underneath it (what gets filed, and with whose
 * minutes) is `test/season.test.js`; this file is about the view over it.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const view = read('season-view.js');

test('the ledger reads the season, not the day', () => {
  assert.match(view, /season\??\.games/,
    'season-view.js no longer reads teams[].season.games — the ledger is the record, '
    + 'not a recomputation of it');
  assert.ok(!/\bplans\b/.test(view),
    'season-view.js reaches for `plans` — a finished game\'s minutes are a fact stored '
    + 'in the record, and re-solving them would rewrite history from today\'s roster');
});

/* The CSV button is rendered with the ledger, so before the first day is filed
   this view has no controls at all. If the empty state does not name the
   spreadsheet, nothing on the screen says the season can leave the app. */
test('the empty season still names the spreadsheet', () => {
  const empty = view.match(/'Nothing filed yet[^']*'/)?.[0];
  assert.ok(empty, 'the season empty state is gone or reworded past recognition');
  assert.match(empty, /CSV|spreadsheet/,
    'the empty Season view names no control and no file — a coach who has filed nothing '
    + 'has no way to learn the season can be exported at all');
});

/* The season is deliberately NOT swept against the roster (see storage.js): a
   kid who left the team in November still played those minutes in October. So
   the view has to be able to show a row it cannot put a name to. */
test('an id with no player is shown, not dropped', () => {
  assert.match(view, /Left the team/,
    'season-view.js has no wording for a player who is no longer on the roster — their '
    + 'minutes are in the record and must not silently disappear from the ledger');
  assert.ok(!/filter\([^)]*byId/.test(view),
    'season-view.js filters the minutes against the roster — that is the one loss the '
    + 'season record exists to prevent');
});

/* Deleting a game is the only correction path for the phantom game "New day"
   tapped twice files. It goes through the same net as every other destructive
   edit: removing a team is the one confirm in this app. */
test('deleting a game goes through undoable, and asks for no confirm', () => {
  assert.match(view, /import \{ undoable[^}]*\} from '\.\/toast\.js'/,
    'season-view.js no longer imports `undoable` — a deleted game with no way back is a '
    + 'season a coach cannot correct');
  assert.match(view, /undoable\(/);
  assert.ok(!/confirmAction|window\.confirm|[^.\w]confirm\(/.test(view),
    'season-view.js asks for a confirm — removing a team is the one confirm in this app');
});

test('the ledger paints in the app\'s own colour slots', () => {
  assert.match(view, /colorOf\(/,
    'season-view.js no longer uses `colorOf` — a player\'s colour is `player.hue`, the '
    + 'same stable slot the rest of the app reads');
});

test('the season is a section the dispatcher knows about, and not an edit target', () => {
  const render = read('render.js');
  assert.match(render, /season:\s*\(\) => renderSeason\(\)/,
    'render.js no longer registers the season section, so nothing repaints the ledger');
  const after = /export const AFTER_EDIT = \[(.*?)\];/s.exec(render)[1];
  const planOnly = /export const PLAN_ONLY = \[(.*?)\];/s.exec(render)[1];
  for (const [name, list] of [['AFTER_EDIT', after], ['PLAN_ONLY', planOnly]]) {
    assert.ok(!list.includes("'season'"),
      `${name} repaints the season — nothing a coach edits about today changes a game `
      + 'that is already filed, and rebuilding the list would close every open game');
  }
});

test('the ledger is on the roster page and is precached', () => {
  const html = read('index.html');
  const at = html.indexOf('id="seasonbox"');
  assert.ok(at > -1, '#seasonbox is gone — the ledger has nowhere to paint');
  const roster = html.indexOf('id="view-team"');
  assert.ok(roster > -1 && roster < at,
    'the season box is no longer inside the roster view — see the header in '
    + 'season-view.js for why it lives there rather than behind a third nav tab');
  assert.match(read('sw.js'), /'\.\/season-view\.js'/,
    'season-view.js is not precached, so the roster page breaks offline');
});

/* ================================================================== *
 * B2b -- the season as a CSV
 *
 * These assert on the produced bytes rather than on the source, because
 * the properties that matter here are properties of a file: what the
 * header row says, what a comma in a team name does to it, and what a
 * player who is no longer on the roster is called. `test/leak.test.js`
 * holds the other half -- that no column in it can ever carry a level.
 *
 * `season-view.js` reaches for a document at import time (dom.js keeps a
 * canvas, toast.js binds a listener), so the same stub `season.test.js`
 * uses stands in. Nothing below renders: `seasonCsv` only reads.
 * ================================================================== */
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });
const S = await import('../app/state.js');
const { seasonCsv, totals } = await import('../app/season-view.js');
const { seasonFilename, backupFilename } = await import('../app/backup.js');
const { seasonShare } = await import('../app/storage.js');

/* Six on the roster, one who has left, three games. The fixture carries one of
   every case the wide table has to tell apart:

   - Aaron (p4) was NOT AT the second game.
   - Eli (p1) WAS at the third and did not get on the floor -- a key with a 0.
     Without him neither test below can fail, because `0` and "not there" would
     look the same on every row.
   - Jack (p5) is on the roster and has never been at a game.
   - pGONE played the first two and had left by the third. */
function season({ names = ['Marcus', 'Eli', 'Devon', 'Kade', 'Aaron', 'Jack'],
                  teamName = 'Wildcats', opponents = ['Falcons', 'Hawks', 'Comets'] } = {}) {
  S.state.teams = [{
    id: 't1', name: teamName, activeGame: 0,
    players: names.map((name, i) => ({ id: 'p' + i, name, number: String(i + 1), shortName: '', tier: 3, hue: i })),
    day: { name: '', games: [] },
    season: {
      games: [
        { id: 'g1', date: '2026-09-14', day: '', opponent: opponents[0], periods: 4, periodMinutes: 8,
          minutes: { p0: 20, p1: 18, p2: 16, p4: 10, pGONE: 12 } },
        { id: 'g2', date: '2026-09-21', day: '', opponent: opponents[1], periods: 4, periodMinutes: 8,
          minutes: { p0: 16, p1: 16, p2: 14, p3: 20, pGONE: 8 } },
        { id: 'g3', date: '2026-10-04', day: '', opponent: opponents[2], periods: 4, periodMinutes: 8,
          minutes: { p0: 12, p1: 0, p3: 18, p4: 14 } },
      ],
    },
  }];
  S.state.activeTeam = 0;
  return seasonCsv().trim().split('\r\n').map(l => l.split(','));
}

test('the CSV is the wide table: a player per row, a game per column, oldest first', () => {
  const rows = season();
  assert.deepEqual(rows[0],
    ['Player', 'Sep 14 vs Falcons', 'Sep 21 vs Hawks', 'Oct 4 vs Comets', 'Total'],
    'the columns are not one per game, oldest first, with Total last — a spreadsheet reads '
    + 'left to right as time, which is the one place this file disagrees with the ledger');
  // one row per roster player plus the one who left; nobody is dropped and nobody is doubled
  assert.equal(rows.length - 1, 7);
});

/* The LEDGER's half of the same distinction (A27). The row on screen reads
   "Eli · 3 games · 7 behind · 34", and the game count has to mean the same
   thing the CSV row means or the two screens disagree about the same child --
   the bug A24(a) was about. It used to count games with minutes above zero,
   which is why Eli is in this fixture: she was at three and got on in two. */
test('the ledger counts games ATTENDED, the same games the CSV gives her a cell in', () => {
  season();
  const rows = totals(S.team().season.games);
  const by = Object.fromEntries(rows.map(r => [r.id, r]));
  assert.equal(by.p1.games, 3,
    'a player who was at a game and did not get on the floor is not counted as being there '
    + '— `storage.js` records that a key in the minutes map IS the attendance');
  assert.equal(by.p4.games, 2, 'Aaron was at two of the three games');
  assert.equal(by.p5.games, 0, 'Jack has never been at a game');
  assert.equal(by.pGONE.games, 2, 'the departed player was at the first two');

  /* Same shape as the CSV, cell for cell: the count of games she has a number
     in over there is the count this says here, for every row. */
  const csv = season().slice(1);
  const cells = Object.fromEntries(csv.map(r => [r[0], r.slice(1, -1).filter(c => c !== '—').length]));
  for (const r of rows) {
    const name = S.state.players.find(p => p.id === r.id) ? r.id : 'pGONE';
    const label = name === 'pGONE' ? 'Left the team' : S.state.players.find(p => p.id === r.id).name;
    assert.equal(cells[label], r.games,
      `the ledger and the CSV disagree about how many games ${label} was at`);
  }
});

/* REWRITTEN (A27), and it used to pin the opposite: "a player who missed a game
   is a 0". That rule reasoned about a player who could have played and did not
   — `0` is true for her — and it was then applied to every gap, including the
   games before a player joined the team and the games after she left. The
   record already tells those apart (`storage.js`: a key means she was available
   for that game, a 0 included); only the CSV was throwing it away, in the one
   file a coach forwards to a parent. A `0` now means she was there and did not
   get on, which is the only thing it was ever true for. */
test('a player who was not there is a dash; one who was there and did not play is a 0', () => {
  const rows = season();
  const by = Object.fromEntries(rows.slice(1).map(r => [r[0], r.slice(1)]));
  assert.deepEqual(by.Aaron, ['10', '—', '14', '24'],
    'a player with no entry in a game must read as a gap, not as 0 — the record only holds '
    + 'the ids that were available for that game, so a 0 here credits a player with turning '
    + 'up to a game she was not at');
  assert.deepEqual(by.Eli, ['18', '16', '0', '34'],
    'a player who was at the game and did not get on the floor must read 0 — that is the '
    + 'one case a 0 is true for, and it is what makes the dash mean something');
  assert.deepEqual(by.Jack, ['—', '—', '—', '0'],
    'a rostered player who has never been at a game is still a row — that is exactly the row '
    + 'a coach looking for who is behind is looking for — but her cells are gaps, and her '
    + 'season total is still a number');

  /* Total is the ledger's number for her, and it sums the cells that are
     numbers: a dash is skipped by SUM in Excel and Sheets exactly as a blank
     is, so a coach adding the row up by hand or by formula gets the same
     answer the app shows. */
  for (const r of rows.slice(1)) {
    const cells = r.slice(1, -1).filter(c => c !== '—').map(Number);
    assert.ok(cells.every(Number.isFinite), `a cell on ${r[0]} is neither a number nor a gap`);
    assert.equal(Number(r.at(-1)), cells.reduce((a, b) => a + b, 0), `Total is wrong on ${r[0]}`);
  }
});

/* REWRITTEN (A24a). This used to pin "most minutes first", which is the bug:
   raw minutes cannot say who is behind, so the ledger and the Games view named
   different children off the same record. The order is now `seasonShare`'s
   deficit, the same number `computeAll` plans against. Asserted against
   `seasonShare` itself rather than against a hand-typed list, so the pin is on
   the RELATIONSHIP between the two surfaces and not on today's arithmetic. */
test('rows keep the ledger\'s order — furthest behind their share first', () => {
  const rows = season().slice(1);
  const { deficit } = seasonShare(S.team().season.games);
  const idOf = name => (S.state.players.find(p => p.name === name) || {}).id
    || (name === 'Left the team' ? 'pGONE' : null);
  const offs = rows.map(r => deficit[idOf(r[0])] || 0);
  assert.deepEqual(offs, [...offs].sort((a, b) => b - a),
    'the ledger is not ordered by deficit — a coach reads this list to find who is behind, '
    + 'and the player furthest behind must be the first row');

  /* The wrong instance, not merely an absent one: on this record the minutes
     order and the deficit order genuinely disagree, so a regression to
     "most minutes first" fails rather than coincidentally passing. */
  const mins = rows.map(r => Number(r.at(-1)));
  assert.notDeepEqual(mins, [...mins].sort((a, b) => b - a),
    'the fixture no longer distinguishes the two orders — it has to, or this test cannot fail');
});

test('a player who has left the roster keeps their minutes, under the ledger\'s name for them', () => {
  const rows = season();
  const gone = rows.slice(1).find(r => r[0] === 'Left the team');
  assert.ok(gone, 'the departed player vanished from the CSV — the season is history and is '
    + 'deliberately not swept against the roster, so the file must be able to show a row it '
    + 'cannot put a name to (same wording as the ledger on screen)');
  /* REWRITTEN (A27): the third column used to be `0`, which said this player
     turned up to a game she had already left the team before. The gap is the
     honest cell, and the two games she did play are untouched. */
  assert.deepEqual(gone.slice(1), ['12', '8', '—', '20'],
    'a player who had already left the team is credited with attending a later game');
});

/* Opponent names, team names and player names are all free text typed by a
   coach in a hurry, and one of them is eventually going to be "St Mary's,
   Reds" or a name with a quote in it. RFC 4180: wrap, and double the quotes. */
test('commas and quotes in free text are quoted, not smuggled into extra columns', () => {
  season({ names: ['Smith, Jr.', 'Bo "Bo" Ng', 'Devon', 'Kade', 'Aaron', 'Jack'],
           opponents: ['Falcons, B', 'Hawks "away"', 'Comets'] });
  const csv = seasonCsv();
  const lines = csv.trim().split('\r\n');
  assert.ok(lines[0].includes('"Sep 14 vs Falcons, B"'), 'a comma in an opponent name is unquoted');
  assert.ok(lines[0].includes('"Sep 21 vs Hawks ""away"""'), 'a quote in an opponent name is not doubled');
  assert.ok(csv.includes('"Smith, Jr."'), 'a comma in a player name is unquoted');
  assert.ok(csv.includes('"Bo ""Bo"" Ng"'), 'a quote in a player name is not doubled');
  /* The fixture has to actually contain commas for any of this to mean
     anything: a naive split must see more fields than there are columns. */
  assert.ok(lines[0].split(',').length > 5, 'the fixture lost its commas');
  // and the real damage a missed quote does is that a row stops lining up with
  // the header, so every line is parsed back rather than eyeballed
  for (const l of lines) {
    assert.equal(splitCsv(l).length, 5, `row does not parse to 5 fields: ${l}`);
  }
});

/* A deliberately dumb RFC 4180 reader, so the assertion above is against a
   parse and not against the writer's own idea of a field. */
function splitCsv(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

test('the report is a different file from the backup, and the team name cannot break it', () => {
  const d = new Date(2026, 7, 23);
  assert.equal(seasonFilename('Wildcats 6th Grade', d), 'benchcard-wildcats-6th-grade-2026-08-23-season.csv');
  assert.notEqual(seasonFilename('Wildcats', d), backupFilename('Wildcats', d),
    'the CSV would overwrite the backup — it is a report, read and never restored');
  assert.equal(seasonFilename('Reds, B "squad"', d), 'benchcard-reds-b-squad-2026-08-23-season.csv',
    'punctuation in a team name reached the filename');
});
