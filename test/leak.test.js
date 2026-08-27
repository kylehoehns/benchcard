import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A rotation level is a coaching judgement about a child. It is useful to the
   solver and to the coach on the planning screen, and it is nobody else's
   business — least of all a parent reading over a shoulder in a gym.
 *
 * Three surfaces are held to that: the printed card, bench mode (the screen a
 * coach holds up on a sideline), and the PNG the share button produces and a
 * coach might text to another coach. These tests are the line. They are
 * source-level rather than rendered, deliberately: a rendered check only sees
 * the roster it happened to be given, and this has to hold for every roster.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');

/* Anything that could put a level on screen. `tier` covers the field itself;
   the level words are the labels a lazy future change might reach for. */
const LEAKS = [
  /\.tier\b/,
  /\btierOf\b/,
  /\bDEFAULT_TIER\b/,
  /['"`](?:Developing|Learning|Rotation level|Reliable|Go-to)['"`]/,
];

/* season-view.js joins the list with v5's ledger: it is the one screen that
   shows a whole season's minutes per child, which makes it the surface most
   likely to be turned around and shown to a parent -- and the one a future
   "while we are here" column would land on. */
/* budget.js joins them for a different reason and it is worth stating: it is
   not a screen, it is the module that decides who gets minutes -- the even
   split, and since B3 the season catch-up. That makes it the file a future
   "weight the catch-up by rotation level" would land in, which is the second
   strength system this app must never grow. Catching a kid up is about the
   clock and nothing else. */
for (const file of ['card.js', 'gamemode.js', 'share.js', 'season-view.js', 'budget.js']) {
  test(`${file} cannot show a rotation level`, () => {
    const src = read(file);
    for (const re of LEAKS) {
      assert.ok(!re.test(src),
        `${file} references ${re} — levels must not reach the card, the bench or a shared image`);
    }
  });
}

test('the printed card markup carries no level', () => {
  // the card is built in JS, so this catches a level smuggled in as a class or
  // a data attribute rather than as text
  const src = read('card.js');
  assert.ok(!/data-tier|class=.*tier|bal-step|bal-lv/.test(src));
});

test('levels are declared where they are allowed to be shown', () => {
  /* The counterpart to the bans above: if the roster ever stops showing levels,
     these tests would pass while the feature had silently lost its only UI.
     The meter is built in balance.js and hosted by the roster row, so the
     promise to the coach is rendered by roster-view.js -- the ban list above is
     what keeps it off the card, the bench and a shared image. */
  const src = read('balance.js') + read('roster-view.js');
  assert.ok(/\.tier\b/.test(src), 'balance.js should be the one place levels are edited');
  // loose on wording, strict on both halves being present: this is a promise
  // to a coach, not a fixed string, and it has survived one rewrite already
  assert.ok(/never printed.{0,40}never shown in bench mode/.test(src),
    'the promise to the coach should be on screen, not only in a comment');
});

test('analytics can never carry a level', () => {
  /* Structural already — payload() whitelists every field — but a level is
     exactly the kind of thing a future call site would think is harmless. */
  const src = read('analytics.js');
  assert.ok(!/tier/i.test(src), 'analytics.js mentions tiers');
});

/* ------------------------------------------------------------------ *
 * the CSV (B2b)
 *
 * The bans above are source-level because a rendered check only ever sees
 * the roster it was handed. The CSV gets the opposite treatment as well as,
 * not instead of: it is the ONE Benchcard file that leaves the phone and
 * gets forwarded — to a parent, to a league, into an email thread — so the
 * bytes themselves are checked, against a roster where every player carries
 * a level and every level word is in play.
 *
 * The load-bearing assertion is the header WHITELIST. The failure mode this
 * guards is not malice, it is "while I am here, let us add a column for
 * completeness": there is no column in this file but `Player`, one per game,
 * and `Total`, and adding one fails the build rather than shipping a child's
 * rotation level to their parents.
 * ------------------------------------------------------------------ */
/* Same two-line document stub `test/season.test.js` uses, plus a listener
   sink: `season-view.js` pulls in `toast.js`, which binds to the document at
   import time. Nothing below renders — `seasonCsv` only reads the record. */
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });
const S = await import('../app/state.js');
const { seasonCsv } = await import('../app/season-view.js');

const LEVELLED = () => {
  const players = ['Marcus', 'Eli', 'Devon', 'Kade', 'Aaron', 'Jack']
    .map((name, i) => ({ id: 'p' + i, name, number: String(i + 1), shortName: '', tier: (i % 5) + 1, hue: i }));
  S.state.teams = [{
    id: 't1', name: 'Wildcats', activeGame: 0, players,
    day: { name: '', games: [] },
    season: {
      games: [
        { id: 'g1', date: '2026-09-14', day: '', opponent: 'Falcons', periods: 4, periodMinutes: 8,
          minutes: { p0: 20, p1: 18, p2: 16, p3: 14, p4: 12 } },
        { id: 'g2', date: '2026-09-21', day: '', opponent: 'Hawks', periods: 4, periodMinutes: 8,
          minutes: { p0: 16, p1: 16, p5: 20, pGONE: 24 } },
      ],
    },
  }];
  S.state.activeTeam = 0;
  return S.state.teams[0];
};

test('the CSV carries no level, and no column that could become one', () => {
  LEVELLED();
  const csv = seasonCsv();
  const lines = csv.trim().split('\r\n');

  assert.deepEqual(lines[0].split(','), ['Player', 'Sep 14 vs Falcons', 'Sep 21 vs Hawks', 'Total'],
    'the CSV header is not exactly Player, one column per game, Total — a column was added, '
    + 'and a column is where a rotation level gets to a parent');

  for (const re of [...LEAKS, /\btier\b/i, /Developing|Rotation level|Go-to/i]) {
    assert.ok(!re.test(csv), `the season CSV matched ${re}`);
  }
  // every row is exactly as wide as the header: no smuggled trailing field
  const width = lines[0].split(',').length;
  for (const l of lines.slice(1)) assert.equal(l.split(',').length, width, `row is not ${width} fields: ${l}`);
});
