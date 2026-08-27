import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENTS } from '../app/analytics.js';
import {
  CAVEATS, buildSql, comments, layout, question, questions, report, summarize, widths,
} from '../scripts/events.mjs';

/* `scripts/events.mjs` reads counters written by a Worker that cannot run from
 * here, over an API no machine in this repo has ever had a token for. So the
 * two things that can break it silently are the ones tested hardest:
 *
 *   the COLUMN LAYOUT — `src/index.js` packs `blobs = [event, country, ...string
 *   fields in EVENTS declaration order]` and numbers into `doubles`, so a
 *   miscounted position returns plausible nonsense rather than an error; and
 *
 *   the QUESTIONS — read out of `app/analytics.js` at runtime rather than
 *   copied, so that a sharpened comment can never leave a stale question
 *   printed over a live number.
 *
 * The fixture rows are shaped like the ones `scripts/traffic.mjs` records as
 * verified against production on 2026-08-24: one JSON object per row, `est`
 * arriving as a string. The extra aliased columns this script selects are NOT
 * confirmed by any run here and the header of the script says so.
 */

const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../app/analytics.js', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

/* A schema this app does not have: two string fields and two number fields,
   interleaved. It is the only way to prove the decode splits positions BY KIND
   and in declaration order rather than by a single running counter -- with one
   field per event, every wrong rule gives the right answer. */
const WIDE = {
  ...EVENTS,
  // a twelfth event, deliberately: nothing here may be a list of the eleven
  bench_swapped: { how: ['tap', 'drag'], count: Symbol('number'), when: ['first', 'second'], seconds: Symbol('number') },
};

// ---------------------------------------------------------------------------
// The writer this decode depends on.

test('the Worker still opens blobs with the event name and the country', () => {
  assert.match(worker, /const blobs = \[event\.e, country\]/);
  assert.match(worker, /const fields = Object\.keys\(EVENTS\[event\.e\] \|\| \{\}\)/);
  assert.match(worker, /if \(typeof v === 'number'\) doubles\.push\(v\);/);
  assert.match(worker, /else blobs\.push\(String\(v\)\)/);
});

test('no event declares two fields of one kind, so a skipped null cannot shift a column', () => {
  // `record()` skips a null field, which would slide a later field of the same
  // kind into its column with nothing to mark the gap. Today that is
  // unreachable. If this fails, the ambiguity is live and events.mjs's header
  // note about it has become a real problem rather than a caveat.
  for (const [event, schema] of Object.entries(EVENTS)) {
    const kinds = Object.values(schema);
    const strings = kinds.filter((a) => Array.isArray(a)).length;
    assert.ok(strings <= 1, `${event} declares two string fields`);
    assert.ok(kinds.length - strings <= 1, `${event} declares two number fields`);
  }
});

// ---------------------------------------------------------------------------
// The layout.

test('a string field lands in blob3 and a number field in double1, derived not typed', () => {
  assert.deepEqual(layout(EVENTS, 'card_printed'), [{ field: 'size', kind: 'string', alias: 's1' }]);
  assert.deepEqual(layout(EVENTS, 'day_game_count'), [{ field: 'games', kind: 'number', alias: 'n1' }]);
  assert.deepEqual(layout(EVENTS, 'game_mode_opened'), []);
});

test('positions are counted per kind, in declaration order, not off one shared counter', () => {
  assert.deepEqual(layout(WIDE, 'bench_swapped').map((f) => `${f.field}:${f.alias}`),
    ['how:s1', 'count:n1', 'when:s2', 'seconds:n2']);
});

test('an unknown event fails loudly rather than querying nothing', () => {
  assert.throws(() => layout(EVENTS, 'card_burned'), /unknown event/);
});

test('the SELECT list is as wide as the widest event and no wider', () => {
  assert.deepEqual(widths(EVENTS), { strings: 1, numbers: 1 });
  assert.deepEqual(widths(WIDE), { strings: 2, numbers: 2 });
});

// ---------------------------------------------------------------------------
// The query.

test('the query weights by sample interval rather than counting rows', () => {
  const sql = buildSql(30);
  assert.match(sql, /sum\(_sample_interval\) AS est/);
  assert.doesNotMatch(sql, /count\(\)/);
  assert.match(sql, /FROM benchcard_events/);
});

test('the first string column is blob3, because blob1 is the event and blob2 the country', () => {
  const sql = buildSql(30);
  assert.match(sql, /blob1 AS event/);
  assert.match(sql, /blob3 AS s1/);
  assert.doesNotMatch(sql, /blob2 AS s1/);
  assert.match(sql, /double1 AS n1/);
  assert.match(sql, /GROUP BY event, s1, n1/);
  assert.match(sql, /FORMAT JSONEachRow/);
});

test('a wider schema widens the query itself, by kind', () => {
  const sql = buildSql(30, WIDE);
  assert.match(sql, /blob3 AS s1, blob4 AS s2/);
  assert.match(sql, /double1 AS n1, double2 AS n2/);
});

test('the window is clamped and never interpolates junk into the SQL', () => {
  assert.match(buildSql(90), /INTERVAL '90' DAY/);
  assert.match(buildSql(0), /INTERVAL '1' DAY/);
  assert.match(buildSql(9999), /INTERVAL '365' DAY/);
  assert.match(buildSql("1' OR '1"), /INTERVAL '30' DAY/);
});

// ---------------------------------------------------------------------------
// The questions, read out of app/analytics.js rather than copied.

test('the questions come from the source text, not from a copy in the script', () => {
  const fake = `export const EVENTS = {
  // Does the fixture answer for the file?
  invented_event: { how: ['a'] },
};`;
  assert.equal(questions(fake).get('invented_event'), 'Does the fixture answer for the file?');
  assert.equal(questions(fake).size, 1); // the real eleven are nowhere in this
});

test('every event carries a question, and each one is really in app/analytics.js', () => {
  const asked = questions();
  assert.deepEqual([...asked.keys()], Object.keys(EVENTS)); // eleven, in declaration order
  for (const [event, q] of asked) {
    assert.ok(q.length > 10, `${event} has no question`);
    assert.ok(source.includes(q.replace(/\s+/g, ' ').slice(0, 30)), `${event}'s question is not in the source`);
  }
});

test('the three questions the ticket named come back word for word', () => {
  const asked = questions();
  assert.equal(asked.get('plan_generated'), 'Does anyone use anything but Balanced?');
  assert.equal(asked.get('card_printed'), 'The core conversion. Is the card the point?');
  assert.equal(asked.get('game_mode_opened'), 'Was the phone-as-card thesis right?');
});

test('an entry with no comment of its own inherits the block it was declared under', () => {
  const raw = comments(source);
  assert.equal(raw.get('team_switched'), ''); // the file really does not comment it
  const asked = questions();
  assert.equal(asked.get('team_switched'), asked.get('team_added'));
  assert.equal(asked.get('team_removed'), asked.get('team_added'));
});

test('a question is the first sentence: through the first ? where there is one', () => {
  assert.equal(question('Is it real? And more prose after it.'), 'Is it real?');
  assert.equal(question('Not a question at all. More prose.'), 'Not a question at all.');
  assert.equal(question('  spread  over\n  lines?  rest'), 'spread over lines?');
  assert.equal(question(''), '');
});

// ---------------------------------------------------------------------------
// Decoding rows.

const ROWS = [
  { event: 'plan_generated', s1: 'balanced', n1: 0, est: '180' },
  { event: 'plan_generated', s1: 'minutes', n1: 0, est: '62' },
  { event: 'game_mode_opened', s1: '', n1: 0, est: '117' },
  { event: 'day_game_count', s1: '', n1: 2, est: '4' },
  { event: 'card_printed', s1: '', n1: 0, est: '3' },
];

test('every event is reported, including the ones with nothing recorded', () => {
  const out = summarize(ROWS);
  assert.deepEqual(out.events.map((e) => e.event), Object.keys(EVENTS));
  assert.equal(out.events.find((e) => e.event === 'pwa_installed').total, 0);
  assert.equal(out.total, 366);
});

test('totals add the sampled estimate, which arrives as a string', () => {
  const out = summarize(ROWS);
  const plan = out.events.find((e) => e.event === 'plan_generated');
  assert.equal(plan.total, 242);
  assert.deepEqual(plan.breakdown, [
    { label: 'strategy balanced', est: 180 },
    { label: 'strategy minutes', est: 62 },
  ]);
});

test('a number field is read from its double column, not from a blob', () => {
  const day = summarize(ROWS).events.find((e) => e.event === 'day_game_count');
  assert.deepEqual(day.breakdown, [{ label: 'games 2', est: 4 }]);
});

test('a missing dimension is labelled rather than dropped, and a fieldless event has none', () => {
  const out = summarize(ROWS);
  assert.deepEqual(out.events.find((e) => e.event === 'card_printed').breakdown, [{ label: 'size (unset)', est: 3 }]);
  assert.deepEqual(out.events.find((e) => e.event === 'game_mode_opened').breakdown, []);
});

test('an event name the schema does not know is surfaced, never silently dropped', () => {
  const out = summarize([...ROWS, { event: 'card_favourited', est: '9' }, { event: '', est: '2' }]);
  assert.deepEqual(out.unknown, [{ event: 'card_favourited', est: 9 }, { event: '(blank)', est: 2 }]);
});

test('a twelfth event is decoded by declaration order, with no list of the eleven anywhere', () => {
  const out = summarize([
    { event: 'bench_swapped', s1: 'drag', s2: 'second', n1: 3, n2: 41, est: '7' },
  ], WIDE);
  const row = out.events.find((e) => e.event === 'bench_swapped');
  assert.equal(row.total, 7);
  assert.deepEqual(row.breakdown, [{ label: 'how drag, count 3, when second, seconds 41', est: 7 }]);
  assert.equal(out.unknown.length, 0);
});

// ---------------------------------------------------------------------------
// The output.

test('each count is printed under the question it answers', () => {
  const out = summarize(ROWS);
  const text = report({ window: 30, ...out, asked: questions() });
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.includes('plan_generated '));
  assert.match(lines[at - 1], /Does anyone use anything but Balanced\?/);
  assert.match(lines[at], /242/);
  assert.match(text, /last 30 days/);
  assert.match(text, /pwa_installed\s+0\s+\(nothing recorded\)/);
});

test('the trust caveat is printed by the script, not left in a comment', () => {
  const text = report({ window: 30, ...summarize(ROWS), asked: questions() });
  assert.match(text, /sum\(_sample_interval\), not a row count/);
  assert.match(text, /only as hard to poison as \/e is to abuse/);
  assert.match(text, /expensive rather\s+than impossible/);
});

test('the rate limit the caveat quotes is the one wrangler.jsonc actually sets', () => {
  const limit = wrangler.match(/"simple":\s*\{\s*"limit":\s*(\d+),\s*"period":\s*(\d+)/);
  assert.ok(limit, 'no rate limit found in wrangler.jsonc');
  const [, n, period] = limit;
  assert.equal(period, '60');
  assert.ok(CAVEATS.join(' ').includes(`${n} posts a minute`), `the caveat does not quote ${n} a minute`);
});
