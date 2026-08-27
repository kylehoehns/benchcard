import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ZONE_MAX_DAYS, ZONE_QUERY, buildEventsSql, buildOnboardingSql, dateRange,
  eventTotals, onboardings, report, silentCountries, stamp, verdict, zoneDays,
} from '../scripts/traffic.mjs';
import { fail, graphqlQuery, parseRows, readToken, sqlQuery, windowDays } from '../scripts/cf.mjs';

/* `scripts/traffic.mjs` answers one question — has anyone but me used this —
 * against two APIs neither CI nor a laptop without a token can reach. So every
 * decision it makes is a pure function over rows, and these tests hold those
 * functions against fixtures shaped like the real 2026-08-24 data: US-only app
 * events, exactly one onboarding, and 2,500-3,300 requests a day from
 * datacenter regions that must not be allowed to read as growth.
 *
 * No network, no credentials, no git history: the CI `tests` job checks out at
 * depth 1 with no secrets and runs `node --test` alone.
 */

// The real thing, on the day the script was written.
const EVENT_ROWS = [
  { event: 'plan_generated', country: 'US', est: '270' },
  { event: 'game_mode_opened', country: 'US', est: '117' },
  { event: 'first_run_complete', country: 'US', est: '1' },
];
const ZONE_DATA = {
  viewer: {
    zones: [{
      httpRequests1dGroups: [
        { dimensions: { date: '2026-08-22' }, sum: { requests: 2531, pageViews: 233, countryMap: [{ clientCountryName: 'BG', requests: 900 }, { clientCountryName: 'US', requests: 700 }] }, uniq: { uniques: 96 } },
        { dimensions: { date: '2026-08-24' }, sum: { requests: 2904, pageViews: 269, countryMap: [{ clientCountryName: 'SG', requests: 1200 }, { clientCountryName: 'US', requests: 400 }] }, uniq: { uniques: 176 } },
      ],
    }],
  },
};

// ---------------------------------------------------------------------------
// The queries

test('the onboarding query derives its roster column from EVENTS, never types it', () => {
  const sql = buildOnboardingSql(30);
  // blob1 = event name, blob2 = country, blob3 = the event's first string field.
  assert.match(sql, /blob3 AS roster/);
  assert.match(sql, /blob2 AS country/);
  assert.match(sql, /WHERE blob1 = 'first_run_complete'/);
});

test('the onboarding query returns rows, not a count -- the whole point of the script', () => {
  const sql = buildOnboardingSql(30);
  assert.match(sql, /SELECT timestamp,/);
  assert.match(sql, /ORDER BY timestamp ASC/);
  assert.doesNotMatch(sql, /GROUP BY/); // an aggregate here would hide the timestamps
  assert.doesNotMatch(sql, /count\(\)/);
});

test('the events query weights by sample interval rather than counting rows', () => {
  const sql = buildEventsSql(30);
  assert.match(sql, /sum\(_sample_interval\) AS est/);
  assert.doesNotMatch(sql, /count\(\) AS est/);
  assert.match(sql, /FROM benchcard_events/);
  assert.match(sql, /GROUP BY event, country/);
});

test('the window is clamped and nothing from the command line lands in the SQL', () => {
  assert.match(buildEventsSql(7), /INTERVAL '7' DAY/);
  assert.match(buildEventsSql(0), /INTERVAL '1' DAY/);
  assert.match(buildEventsSql(9999), /INTERVAL '365' DAY/);
  assert.match(buildOnboardingSql("1' OR '1"), /INTERVAL '30' DAY/);
  assert.doesNotMatch(buildOnboardingSql("1' OR '1"), /1' OR '1/);
});

test('the zone query asks for the countries alongside the uniques', () => {
  assert.match(ZONE_QUERY, /httpRequests1dGroups/);
  assert.match(ZONE_QUERY, /dimensions \{ date \}/);
  assert.match(ZONE_QUERY, /countryMap \{ clientCountryName requests \}/);
  assert.match(ZONE_QUERY, /uniq \{ uniques \}/);
  assert.match(ZONE_QUERY, /zoneTag: \$zone/);
});

test('the zone window is inclusive of both ends and clamped to what Cloudflare keeps', () => {
  const now = new Date('2026-08-24T09:00:00Z');
  assert.deepEqual(dateRange(3, now), { since: '2026-08-22', until: '2026-08-24', days: 3 });
  assert.deepEqual(dateRange(1, now), { since: '2026-08-24', until: '2026-08-24', days: 1 });
  assert.equal(dateRange(365, now).days, ZONE_MAX_DAYS);
});

// ---------------------------------------------------------------------------
// Shaping

test('an Analytics Engine timestamp is read as UTC, not as local time', () => {
  assert.equal(stamp('2026-08-24 12:30:04'), '2026-08-24 12:30 UTC');
  assert.equal(stamp('2026-08-24T12:30:04Z'), '2026-08-24 12:30 UTC');
  assert.equal(stamp(''), '(no timestamp)');
  assert.equal(stamp('not a date'), 'not a date'); // shown, never silently dropped
});

test('every onboarding survives as its own row -- two at the same minute stay two', () => {
  const runs = onboardings([
    { timestamp: '2026-08-24 12:30:04', country: 'US', roster: '6-9', est: 1 },
    { timestamp: '2026-08-24 12:30:51', country: 'IE', roster: '10-12', est: 1 },
  ]);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].country, 'US');
  assert.equal(runs[1].country, 'IE');
  assert.equal(runs[1].roster, '10-12');
});

test('a missing country or roster is labelled rather than dropped', () => {
  const [run] = onboardings([{ timestamp: '2026-08-24 12:30:04' }]);
  assert.equal(run.country, '??');
  assert.equal(run.roster, '(unset)');
  assert.equal(run.est, 1); // a sampled row still stands for at least one real one
});

test('events group by name with their countries kept, ordered by volume', () => {
  const out = eventTotals([...EVENT_ROWS, { event: 'plan_generated', country: 'IE', est: '5' }]);
  assert.equal(out[0].event, 'plan_generated');
  assert.equal(out[0].total, 275);
  assert.deepEqual(out[0].countries, [{ country: 'US', est: 270 }, { country: 'IE', est: 5 }]);
  assert.equal(out[1].event, 'game_mode_opened');
});

test('zone days survive missing pieces instead of throwing', () => {
  const days = zoneDays(ZONE_DATA);
  assert.equal(days.length, 2);
  assert.equal(days[1].requests, 2904);
  assert.equal(days[1].pageViews, 269);
  assert.equal(days[1].uniques, 176);
  assert.equal(days[1].countries[0].country, 'SG');
  assert.deepEqual(zoneDays(null), []);
  assert.deepEqual(zoneDays({ viewer: { zones: [] } }), []);
  assert.deepEqual(zoneDays({ viewer: { zones: [{ httpRequests1dGroups: [{}] }] } })[0].countries, []);
});

test('a silent country is measured, not read off a hard-coded bot list', () => {
  const days = zoneDays(ZONE_DATA);
  const silent = silentCountries(days, eventTotals(EVENT_ROWS));
  assert.deepEqual(silent.map((c) => c.country), ['SG', 'BG']); // by requests, descending
  // The instant a real person in Singapore generates a plan, SG stops being silent.
  const withUser = silentCountries(days, eventTotals([...EVENT_ROWS, { event: 'plan_generated', country: 'SG', est: 1 }]));
  assert.deepEqual(withUser.map((c) => c.country), ['BG']);
  // And US is never listed, because it has events -- not because it is home.
  assert.ok(!silent.some((c) => c.country === 'US'));
});

// ---------------------------------------------------------------------------
// The verdict, which is the actual deliverable

test('no onboardings is stated plainly, including that it was not you either', () => {
  const v = verdict({ runs: [], events: [], zone: [], silent: [] }).join('\n');
  assert.match(v, /No onboarding completed in this window/);
  assert.match(v, /not by you either/);
});

test('the verdict counts onboardings and refuses to say which were you', () => {
  const runs = onboardings([{ timestamp: '2026-08-24 12:30:04', country: 'US', roster: '6-9', est: 1 }]);
  const v = verdict({ runs, events: eventTotals(EVENT_ROWS), zone: zoneDays(ZONE_DATA), silent: [] }).join('\n');
  assert.match(v, /1 onboarding in this window/);
  assert.match(v, /does not guess which were you/);
  // It describes; it never concludes that a row is or is not the user.
  assert.doesNotMatch(v, /that was you|this is you|nobody has used/i);
});

test('an onboarding from outside the home country is called out as the place to start', () => {
  const runs = onboardings([
    { timestamp: '2026-08-24 12:30:04', country: 'US', roster: '6-9', est: 1 },
    { timestamp: '2026-08-25 03:11:00', country: 'IE', roster: '10-12', est: 1 },
  ]);
  const v = verdict({ runs, events: [], zone: [], silent: [] }).join('\n');
  assert.match(v, /1 of them came from outside US \(IE\)/);
});

test('events reaching zero while the app was in use is named as a bug, not a quiet week', () => {
  const v = verdict({ runs: [], events: [], zone: [], silent: [] }).join('\n');
  assert.match(v, /beacon is not reaching \/e and that is a bug/);
});

test('the pageview-to-onboarding gap is reconciled rather than left to be misread', () => {
  const runs = onboardings([{ timestamp: '2026-08-24 12:30:04', country: 'US', roster: '6-9', est: 1 }]);
  const v = verdict({ runs, events: [], zone: zoneDays(ZONE_DATA), silent: [] }).join('\n');
  assert.match(v, /502 pageviews across the same window against 1 onboarding/);
});

test('silent countries are explained as partly good news, not filed as a problem', () => {
  const days = zoneDays(ZONE_DATA);
  const v = verdict({ runs: [], events: eventTotals(EVENT_ROWS), zone: days, silent: silentCountries(days, eventTotals(EVENT_ROWS)) }).join('\n');
  assert.match(v, /produced no app event whatsoever \(SG, BG\)/);
  assert.match(v, /submitted to Google and Bing/);
});

// ---------------------------------------------------------------------------
// The report

test('the report prints onboardings individually and never as a bare count', () => {
  const out = report({
    window: 30,
    runs: onboardings([
      { timestamp: '2026-08-24 12:30:04', country: 'US', roster: '6-9', est: 1 },
      { timestamp: '2026-08-25 03:11:00', country: 'IE', roster: '10-12', est: 1 },
    ]),
    events: eventTotals(EVENT_ROWS),
    zone: zoneDays(ZONE_DATA),
    silent: [],
  });
  assert.match(out, /2026-08-24 12:30 UTC\s+US\s+roster 6-9/);
  assert.match(out, /2026-08-25 03:11 UTC\s+IE\s+roster 10-12/);
  assert.match(out, /Timestamps are the exclusion mechanism/);
});

test('no zone line ever shows uniques without the countries beside them', () => {
  const out = report({ window: 30, runs: [], events: [], zone: zoneDays(ZONE_DATA), silent: [] });
  const lines = out.split('\n').filter((l) => /^ {2}\d{4}-\d\d-\d\d\s/.test(l));
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(line, /\b[A-Z]{2} [\d,]+/, `no country breakdown on: ${line}`);
  }
  assert.match(out, /top countries by requests/);
  assert.match(out, /partly good news/);
});

/* The first draft called both the day count and the zone rows `days`, so the
   shorthand property ate the window and the header printed `[object Object]`.
   Rendering it found that; reading it had not. */
test('the header carries the window it was asked for, not the zone rows', () => {
  const out = report({ window: 7, runs: [], events: [], zone: zoneDays(ZONE_DATA), silent: [] });
  assert.match(out, /\(last 7 days\)/);
  assert.doesNotMatch(out, /\[object Object\]/);
});

test('an empty window renders rather than throwing', () => {
  const out = report({ window: 7, runs: [], events: [], zone: [], silent: [] });
  assert.match(out, /\(none in this window\)/);
  assert.match(out, /\(no zone data in this window\)/);
  assert.match(out, /VERDICT/);
});

// ---------------------------------------------------------------------------
// The shared plumbing, and the one promise it makes

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test('the token is read from the environment and the error names both permissions', () => {
  assert.throws(() => readToken({}), /Account Analytics -> Read/);
  assert.throws(() => readToken({}), /Zone {4}-> Analytics {9}-> Read/);
  assert.equal(readToken({ CLOUDFLARE_API_TOKEN: 'abc' }), 'abc');
});

test('a token never reaches an error message, whatever the API says back', async () => {
  const token = 'v1.0-SECRETTOKENVALUE-do-not-print';
  for (const call of [
    () => sqlQuery('SELECT 1', { token, fetchImpl: async () => response(403, 'forbidden') }),
    () => sqlQuery('SELECT 1', { token, fetchImpl: async () => response(500, 'boom') }),
    () => graphqlQuery('{ x }', {}, { token, fetchImpl: async () => response(403, 'forbidden') }),
    () => graphqlQuery('{ x }', {}, { token, fetchImpl: async () => response(200, '{"errors":[{"message":"bad"}]}') }),
    () => graphqlQuery('{ x }', {}, { token, fetchImpl: async () => response(200, '<html>') }),
  ]) {
    const err = await call().then(() => null, (e) => e);
    assert.ok(err, 'the failure must throw, not resolve');
    assert.ok(!err.message.includes(token), `token leaked into: ${err.message}`);
    assert.ok(!/Bearer/.test(err.message), `auth header leaked into: ${err.message}`);
  }
});

test('a 403 says which permission is missing, per API', async () => {
  const forbidden = async () => response(403, 'forbidden');
  await assert.rejects(sqlQuery('SELECT 1', { token: 't', fetchImpl: forbidden }), /Account Analytics -> Read/);
  await assert.rejects(graphqlQuery('{ x }', {}, { token: 't', fetchImpl: forbidden }), /Zone -> Analytics -> Read/);
});

test('the SQL API is asked with the query as the raw body and a bearer token', async () => {
  let seen = null;
  await sqlQuery('SELECT 1', {
    token: 'tok',
    account: 'acct',
    fetchImpl: async (url, init) => { seen = { url, init }; return response(200, '{"data":[{"a":1}]}'); },
  });
  assert.match(seen.url, /\/accounts\/acct\/analytics_engine\/sql$/);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.body, 'SELECT 1');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
});

test('both SQL response shapes parse -- the envelope and JSONEachRow', () => {
  assert.deepEqual(parseRows('{"meta":[],"data":[{"a":1}],"rows":1}'), [{ a: 1 }]);
  assert.deepEqual(parseRows('{"a":1}\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseRows('[{"a":1}]'), [{ a: 1 }]);
  assert.deepEqual(parseRows(''), []);
  assert.deepEqual(parseRows('   \n  '), []);
  assert.throws(() => parseRows('{"a":1}\nnot json'), /Could not parse a row/);
});

test('a GraphQL 200 carrying errors is a failure, not an empty report', async () => {
  await assert.rejects(
    graphqlQuery('{ x }', {}, { token: 't', fetchImpl: async () => response(200, '{"errors":[{"message":"no zone read"}]}') }),
    /no zone read/,
  );
  const data = await graphqlQuery('{ x }', {}, { token: 't', fetchImpl: async () => response(200, '{"data":{"ok":true},"errors":[]}') });
  assert.deepEqual(data, { ok: true });
});

test('the window clamp has one implementation, shared by both scripts', () => {
  assert.equal(windowDays(undefined), 30);
  assert.equal(windowDays('7'), 7);
  assert.equal(windowDays(-4), 1);
  assert.equal(windowDays(1e9), 365);
  assert.equal(windowDays(1e9, { max: 30 }), 30);
});

test('an error body is truncated rather than pasted whole into the terminal', () => {
  assert.equal(fail('x', 'y'.repeat(5000)).message.length, 1 + 1 + 500);
});
