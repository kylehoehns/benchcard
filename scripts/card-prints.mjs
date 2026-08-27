#!/usr/bin/env node
/* Does anybody print the half-sheet card?
 *
 *   CLOUDFLARE_API_TOKEN=... node scripts/card-prints.mjs
 *   ... node scripts/card-prints.mjs --days 90 --json
 *
 * `app/analytics.js` has recorded `card_printed` with a `size` dimension of
 * `pocket | half` since the day events shipped, into the `benchcard_events`
 * Analytics Engine dataset (`wrangler.jsonc`, binding `AE`). Nothing has ever
 * read it back. This is the reader.
 *
 * **Why it matters**, so the number is used rather than admired: the queue
 * carries a two-column fix for the half-sheet card. If the half-sheet is ~0%
 * of prints, that stops being a fix and becomes a deletion candidate, and the
 * per-player grid becomes the only card format worth building. Do not start
 * card-format work without running this first.
 *
 * Read `scripts/traffic.mjs` first, though. It answers the prior question —
 * has anyone but you used this at all — and a format share computed over one
 * person's testing is a number about you, not about coaches.
 *
 * The token and the account id come from `scripts/cf.mjs`, which is where the
 * auth plumbing, the permissions this needs and the promise that a token never
 * reaches an error message all live. This one needs only the first of the two
 * permissions listed there: Account -> Account Analytics -> Read.
 *
 * The blob positions are DERIVED from `EVENTS`, not typed in. `src/index.js`
 * writes `blobs = [event name, country, ...string fields in EVENTS order]`, so
 * the column holding `size` moves the moment somebody adds a string field
 * ahead of it. `test/card-prints.test.js` pins the derivation against the real
 * schema so a rename fails a test here instead of quietly returning zeroes.
 */
import { EVENTS } from '../app/analytics.js';
import { DATASET, blobColumn as columnFor, readToken, sqlQuery, windowDays } from './cf.mjs';

const EVENT = 'card_printed';
const DIMENSION = 'size';

/* Bound to this app's schema so callers and tests keep the two-argument shape
   they had before the derivation moved into `cf.mjs` to be shared. */
export const blobColumn = (event, field) => columnFor(EVENTS, event, field);

export { windowDays };

export function buildSql(days = 30) {
  const n = windowDays(days);
  const col = blobColumn(EVENT, DIMENSION);
  return `SELECT ${col} AS ${DIMENSION}, SUM(_sample_interval) AS prints
FROM ${DATASET}
WHERE index1 = '${EVENT}' AND timestamp >= NOW() - INTERVAL '${n}' DAY
GROUP BY ${col}
ORDER BY SUM(_sample_interval) DESC`;
}

export function summarize(rows) {
  const counts = new Map();
  for (const r of rows || []) {
    const key = String(r[DIMENSION] ?? '') || '(unset)';
    counts.set(key, (counts.get(key) || 0) + Number(r.prints || 0));
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  return { total, rows: sorted.map(([size, prints]) => ({ size, prints, share: total ? prints / total : 0 })) };
}

/* The verdict, not just the table -- the point of running this is a decision
   about the half-sheet, so say which one the numbers support. */
export function verdict({ total, rows }) {
  if (!total) return 'No prints recorded in the window. Either nobody printed, or events are not reaching /e -- check a fresh print in the Worker logs before reading anything into this.';
  const half = rows.find((r) => r.size === 'half');
  const share = half ? half.share : 0;
  if (total < 30) return `Only ${total} prints in the window: too few to decide a format on. Re-run over a longer window (--days 90) before acting.`;
  if (share < 0.02) return 'The half-sheet is under 2% of prints. The queued two-column fix is a deletion candidate, not a fix -- build the per-player grid instead.';
  if (share < 0.15) return 'The half-sheet is a minority format but real. Fix it; do not lead with it.';
  return 'The half-sheet is a substantial share of prints. It earns the two-column fix.';
}

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const days = argv.includes('--days') ? windowDays(argv[argv.indexOf('--days') + 1]) : 30;

  const token = readToken();
  const out = summarize(await sqlQuery(buildSql(days), { token }));

  if (asJson) {
    console.log(JSON.stringify({ days, ...out, verdict: verdict(out) }, null, 2));
    return;
  }
  console.log(`card_printed by size, last ${days} days\n`);
  for (const r of out.rows) {
    console.log(`  ${r.size.padEnd(8)} ${String(r.prints).padStart(7)}  ${(r.share * 100).toFixed(1)}%`);
  }
  console.log(`  ${'total'.padEnd(8)} ${String(out.total).padStart(7)}\n`);
  console.log(verdict(out));
}

if (process.argv[1] && process.argv[1].endsWith('card-prints.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
