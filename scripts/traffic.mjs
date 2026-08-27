#!/usr/bin/env node
/* Has anyone but me used this yet?
 *
 *   CLOUDFLARE_API_TOKEN=... node scripts/traffic.mjs
 *   ... node scripts/traffic.mjs --days 7 --json
 *
 * One command, one question. Benchcard has no accounts and no login, so there
 * is nothing in the data that says "this row is the person who built it" and
 * nothing that says "this row is a stranger". A self-exclusion flag was
 * considered and REJECTED on purpose: it would get forgotten, and a forgotten
 * flag turns your own testing into what looks like real traffic — the worst
 * possible failure for the one number you actually care about.
 *
 * So this script uses the only exclusion mechanism that cannot be forgotten:
 * TIMESTAMPS. It prints every `first_run_complete` INDIVIDUALLY, with the time
 * it happened, the country it came from and the roster bucket — never a count.
 * You know when you were sitting in front of this app. Anything outside those
 * windows is somebody else. A country that is not yours is the other tell.
 * The script will not say which ones were you; it cannot know, and guessing
 * would be worse than useless. It describes; you decide.
 *
 * `first_run_complete` fires once per fresh browser profile, which makes it
 * the closest thing to a "a new person arrived" signal that exists here.
 *
 * WHY THE ZONE NUMBERS ARE PRINTED WITH THEIR COUNTRIES, ALWAYS
 *
 * Zone traffic at the time this was written read 2,500-3,300 requests and
 * 96-176 uniques a day, which looks exactly like a launch. It was not. The
 * country mix was Bulgaria, Singapore, Ireland, Luxembourg, Netherlands,
 * Taiwan, Japan, Korea and India — datacenter regions, i.e. crawlers and
 * scanners — while every app event was US-only and consistent with one person
 * testing. The decisive reconciliation was 269 pageviews in a day against
 * exactly ONE `first_run_complete` in the dataset's whole history.
 *
 * Uniques on their own would have read as growth. So the country breakdown is
 * printed beside them every time, and never omitted for brevity.
 *
 * AND THE CRAWLERS ARE PARTLY GOOD NEWS. benchcard.app was submitted to
 * Google Search Console and Bing Webmaster Tools. Indexing bots turning up is
 * the system working, not a problem to fix — do not file it as one. It is only
 * a problem if somebody mistakes it for people, which is what this layout is
 * built to prevent.
 *
 * The token, the account and zone ids, the two read permissions it needs and
 * the promise that a token never reaches an error message all live in
 * `scripts/cf.mjs`. Nothing here writes anything, anywhere.
 */
import { EVENTS } from '../app/analytics.js';
import {
  DATASET, ZONE, blobColumn, graphqlQuery, readToken, sqlQuery, windowDays,
} from './cf.mjs';

const ONBOARDING = 'first_run_complete';

/* Cloudflare keeps `httpRequests1dGroups` for 30 days on the plan this runs
   on, so a longer window is silently empty rather than an error. Ask for the
   Analytics Engine window the caller wanted and clamp only the zone half. */
export const ZONE_MAX_DAYS = 30;

// ---------------------------------------------------------------------------
// Queries. Shapes verified live against production 2026-08-24; the column
// mapping (blob1 = event name, blob2 = country, blob3+ = the event's own
// string fields) is confirmed, not assumed.

/* Filtered on `blob1`, not `index1`: blob1 holding the event name is the part
   that was verified against live data. `src/index.js` writes both. */
export function buildEventsSql(days = 30) {
  const n = windowDays(days);
  return `SELECT blob1 AS event, blob2 AS country, sum(_sample_interval) AS est
FROM ${DATASET}
WHERE timestamp >= NOW() - INTERVAL '${n}' DAY
GROUP BY event, country
ORDER BY est DESC
FORMAT JSONEachRow`;
}

/* One row per onboarding, never an aggregate — see the header. The roster
   column is DERIVED from `EVENTS` so that adding a string field ahead of it
   moves the query too, instead of quietly returning a column of nulls. */
export function buildOnboardingSql(days = 30) {
  const n = windowDays(days);
  const roster = blobColumn(EVENTS, ONBOARDING, 'roster');
  return `SELECT timestamp, blob2 AS country, ${roster} AS roster, _sample_interval AS est
FROM ${DATASET}
WHERE blob1 = '${ONBOARDING}' AND timestamp >= NOW() - INTERVAL '${n}' DAY
ORDER BY timestamp ASC
FORMAT JSONEachRow`;
}

export const ZONE_QUERY = `query BenchcardZoneTraffic($zone: String!, $since: Date!, $until: Date!) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequests1dGroups(
        limit: ${ZONE_MAX_DAYS}
        filter: { date_geq: $since, date_leq: $until }
        orderBy: [date_ASC]
      ) {
        dimensions { date }
        sum { requests pageViews countryMap { clientCountryName requests } }
        uniq { uniques }
      }
    }
  }
}`;

/* Inclusive of both ends, so `--days 1` is today and `--days 3` is today and
   the two days before it — which is how somebody reading a report thinks
   about it, whatever the API would have done. */
export function dateRange(days, now = new Date()) {
  const n = windowDays(days, { max: ZONE_MAX_DAYS });
  const day = (offset) => new Date(now.getTime() - offset * 86400000).toISOString().slice(0, 10);
  return { since: day(n - 1), until: day(0), days: n };
}

// ---------------------------------------------------------------------------
// Shaping. Everything below is pure so the whole report can be built and
// asserted from fixtures, with no token and no network — see test/traffic.test.js.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Analytics Engine hands back `2026-08-24 12:30:04` (UTC, no zone marker).
   Keep it readable and keep it obviously UTC, because the whole point is
   comparing it against when you remember using the app. */
export function stamp(raw) {
  const s = String(raw || '').trim();
  if (!s) return '(no timestamp)';
  const iso = s.replace(' ', 'T');
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function onboardings(rows) {
  return (rows || []).map((r) => ({
    when: stamp(r.timestamp),
    country: String(r.country || '??') || '??',
    roster: String(r.roster || '(unset)') || '(unset)',
    est: Math.max(1, num(r.est)),
  }));
}

/* Grouped by event, countries kept per event: "which events happened" and
   "where from" are the same question here, and splitting them is how uniques
   got read as growth in the first place. */
export function eventTotals(rows) {
  const byEvent = new Map();
  for (const r of rows || []) {
    const event = String(r.event || '(unnamed)') || '(unnamed)';
    const country = String(r.country || '??') || '??';
    const est = num(r.est);
    if (!byEvent.has(event)) byEvent.set(event, { event, total: 0, countries: new Map() });
    const e = byEvent.get(event);
    e.total += est;
    e.countries.set(country, (e.countries.get(country) || 0) + est);
  }
  return [...byEvent.values()]
    .map((e) => ({
      event: e.event,
      total: e.total,
      countries: [...e.countries].sort((a, b) => b[1] - a[1]).map(([country, est]) => ({ country, est })),
    }))
    .sort((a, b) => b.total - a.total);
}

export function zoneDays(data) {
  const zones = (data && data.viewer && data.viewer.zones) || [];
  const groups = (zones[0] && zones[0].httpRequests1dGroups) || [];
  return groups.map((g) => ({
    date: (g.dimensions && g.dimensions.date) || '(no date)',
    requests: num(g.sum && g.sum.requests),
    pageViews: num(g.sum && g.sum.pageViews),
    uniques: num(g.uniq && g.uniq.uniques),
    countries: ((g.sum && g.sum.countryMap) || [])
      .map((c) => ({ country: String(c.clientCountryName || '??'), requests: num(c.requests) }))
      .sort((a, b) => b.requests - a.requests),
  }));
}

/* Countries that loaded pages but produced no app event at all. Measured, not
   a hard-coded list of "bot countries" — a list would be wrong the first time
   a real coach in Ireland turned up, and this is the shape of the evidence
   that actually settled it. */
export function silentCountries(zone, events) {
  const seen = new Set();
  for (const e of events) for (const c of e.countries) seen.add(c.country);
  const totals = new Map();
  for (const d of zone) {
    for (const c of d.countries) {
      if (seen.has(c.country)) continue;
      totals.set(c.country, (totals.get(c.country) || 0) + c.requests);
    }
  }
  return [...totals].sort((a, b) => b[1] - a[1]).map(([country, requests]) => ({ country, requests }));
}

/* Describe, do not conclude. The script cannot know which onboarding was you,
   and a script that guesses is a script that will one day tell you nobody has
   used your app on the day somebody did. */
export function verdict({ runs, events, zone, silent }) {
  const out = [];
  const home = 'US';
  const pageViews = zone.reduce((a, d) => a + d.pageViews, 0);

  if (!runs.length) {
    out.push('No onboarding completed in this window — not by a stranger, and not by you either.');
  } else {
    const away = runs.filter((r) => r.country !== home);
    out.push(
      `${runs.length} onboarding${runs.length === 1 ? '' : 's'} in this window, listed above with the time each happened.`,
      'The script does not guess which were you: it has no way to know. Compare the timestamps against when you were using the app — anything outside those windows is somebody else.',
    );
    if (away.length) {
      const where = [...new Set(away.map((r) => r.country))].join(', ');
      out.push(`${away.length} of them came from outside ${home} (${where}). Start there.`);
    } else {
      out.push(`${runs.length === 1 ? 'It came' : 'They all came'} from ${home}, which is where you are, so country tells you nothing here. The timestamps are the whole signal.`);
    }
  }

  if (!events.length) {
    out.push('No app events at all in this window. If you know you used the app in it, the beacon is not reaching /e and that is a bug, not a quiet week.');
  }

  if (pageViews && runs.length) {
    out.push(`${pageViews.toLocaleString('en-US')} pageviews across the same window against ${runs.length} onboarding${runs.length === 1 ? '' : 's'}. A gap that size is crawlers, bounces and your own return visits, not people who stayed.`);
  }

  if (silent.length) {
    const top = silent.slice(0, 6).map((c) => c.country).join(', ');
    out.push(`${silent.length} countr${silent.length === 1 ? 'y' : 'ies'} requested pages and produced no app event whatsoever (${top}${silent.length > 6 ? ', …' : ''}). Datacenter regions in that list are crawlers — which is partly the point, since the site was submitted to Google and Bing.`);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Rendering.

const pad = (s, n) => String(s).padEnd(n);
const rpad = (v, n) => String(v).padStart(n);
const commas = (n) => Number(n).toLocaleString('en-US');

/* `window` is the number of days asked for; `zone` is the per-day zone rows.
   They were both called `days` in the first draft, which meant one shorthand
   property silently ate the other -- caught by rendering the report, not by
   reading it. */
export function report({ window, runs, events, zone, silent }) {
  const L = [];
  L.push(`Benchcard — has anyone but me used this yet?   (last ${window} days)`, '');

  L.push(`ONBOARDINGS — every ${ONBOARDING}, individually`);
  if (!runs.length) {
    L.push('  (none in this window)');
  } else {
    for (const r of runs) L.push(`  ${pad(r.when, 20)} ${pad(r.country, 4)} roster ${r.roster}${r.est > 1 ? `  (x${r.est}, sampled)` : ''}`);
  }
  L.push('  Timestamps are the exclusion mechanism: you know when you were using it.', '');

  L.push('APP EVENTS');
  if (!events.length) {
    L.push('  (none in this window)');
  } else {
    for (const e of events) {
      L.push(`  ${pad(e.event, 20)} ${rpad(commas(e.total), 7)}   ${e.countries.map((c) => `${c.country} ${commas(c.est)}`).join(' · ')}`);
    }
  }
  L.push('');

  L.push('ZONE TRAFFIC — everyone who loaded a page, crawlers included');
  L.push(`  ${pad('date', 12)}${rpad('requests', 9)}${rpad('views', 7)}${rpad('uniques', 9)}   top countries by requests`);
  if (!zone.length) {
    L.push('  (no zone data in this window)');
  } else {
    for (const d of zone) {
      const top = d.countries.slice(0, 8).map((c) => `${c.country} ${commas(c.requests)}`).join(' · ');
      L.push(`  ${pad(d.date, 12)}${rpad(commas(d.requests), 9)}${rpad(commas(d.pageViews), 7)}${rpad(commas(d.uniques), 9)}   ${top || '(none)'}`);
    }
  }
  L.push('  Uniques are never printed without the countries beside them. A mix of', '  datacenter regions is bots, and bots are partly good news here: the site', '  was submitted to Google Search Console and Bing Webmaster Tools.', '');

  L.push('VERDICT');
  for (const line of verdict({ runs, events, zone, silent })) L.push(`  ${line}`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const requested = argv.includes('--days') ? argv[argv.indexOf('--days') + 1] : undefined;
  const aeDays = windowDays(requested);
  const range = dateRange(requested);

  const token = readToken();
  const [runRows, eventRows, zoneData] = await Promise.all([
    sqlQuery(buildOnboardingSql(aeDays), { token }),
    sqlQuery(buildEventsSql(aeDays), { token }),
    graphqlQuery(ZONE_QUERY, { zone: ZONE, since: range.since, until: range.until }, { token }),
  ]);

  const runs = onboardings(runRows);
  const events = eventTotals(eventRows);
  const zone = zoneDays(zoneData);
  const silent = silentCountries(zone, events);

  if (asJson) {
    console.log(JSON.stringify({ window: aeDays, runs, events, zone, silent, verdict: verdict({ runs, events, zone, silent }) }, null, 2));
    return;
  }
  console.log(report({ window: aeDays, runs, events, zone, silent }));
}

if (process.argv[1] && process.argv[1].endsWith('traffic.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
