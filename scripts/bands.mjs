#!/usr/bin/env node
/* Stage 6: the detection half of the control band.
 *
 *     node scripts/bands.mjs              # read CI history, report the tier
 *     node scripts/bands.mjs --json       # machine-readable, for the workflow
 *     node scripts/bands.mjs --limit 200  # widen the window
 *
 * WHAT THIS DOES. It reads `bands.yaml`, pulls this repo's CI run history
 * through `gh`, computes the metric per day, and says which tier the latest
 * point is in under the Western Electric rules. That is the deterministic
 * half, and it is the half that can exist today.
 *
 * WHAT IT DOES NOT DO. It does not invoke a model, does not write an intent,
 * and does not open a pull request. The playbook's loop continues from here
 * into a diagnose step; that needs a model in CI, which needs an API key this
 * repo does not have and a working Actions account, which it currently also
 * does not have. `bands.yaml` says so. When it becomes untrue, this comment
 * and that file change together.
 *
 * TWO THINGS IT REFUSES TO DO, both deliberate:
 *
 *   1. IT WILL NOT CLASSIFY ON A THIN BASELINE. `bands.yaml` asks for
 *      rolling_30d. With four days of history, sigma is an artefact of having
 *      almost no data, and a band drawn on it fires on noise. Below
 *      MIN_POINTS it reports `insufficient-baseline` and stops. A tier printed
 *      from five points would look exactly like a tier printed from fifty.
 *
 *   2. IT WILL NOT COUNT A REFUSED RUN AS A TEST FAILURE. A run that GitHub
 *      declined to start -- billing, quota, a broken runner image -- has
 *      conclusion "failure" and tells you nothing about the suite. Three of
 *      this repo's ten recorded failures are exactly that. Counting them would
 *      point the band at code quality while the actual fault was an unpaid
 *      invoice. They are separated out and reported on their own line.
 *
 * No dependencies. The YAML subset parser below is deliberate: this repo has
 * zero dependencies and a config this shape does not justify the first one.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* A run that never started a job finishes in seconds. Real CI here takes about
   two minutes; the refusals took five. The threshold sits far from both. */
export const REFUSED_UNDER_SECONDS = 15;

/* Below this many daily points, no verdict. */
export const MIN_POINTS = 20;

/* ---------- a YAML subset, only what bands.yaml uses ---------- */

/* Handles: `key: value`, nested maps by indent, `- item` lists, comments and
   quoted scalars. It does NOT handle anchors, multi-line scalars, flow
   collections or documents. Anything it cannot represent, it throws on rather
   than guessing -- a config parser that silently drops a tier would hand you a
   band with a missing rung and no way to notice. */
export function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '');
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;

    if (body.startsWith('- ')) {
      if (!Array.isArray(parent.__list)) parent.__list = [];
      parent.__list.push(scalar(body.slice(2).trim()));
      continue;
    }
    const m = body.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!m) throw new Error(`bands.yaml: cannot parse line: ${raw}`);
    const [, key, value] = m;
    if (value === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, node: child });
    } else {
      parent[key] = scalar(value);
    }
  }
  return collapse(root);
}
const scalar = v => {
  const s = v.replace(/^["'](.*)["']$/, '$1');
  if (/^-?\d+$/.test(s)) return Number(s);
  return s;
};
/* A map that only ever collected `- items` is really a list. */
function collapse(node) {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === '__list') return node.__list;
    for (const k of keys) node[k] = collapse(node[k]);
  }
  return node;
}

/* ---------- the metric ---------- */

export const durationSeconds = r =>
  (new Date(r.updatedAt) - new Date(r.createdAt)) / 1000;

/* Split what the suite said from what the account said. */
export function classify(runs) {
  const real = [], refused = [];
  for (const r of runs) {
    if (r.conclusion === 'failure' && durationSeconds(r) < REFUSED_UNDER_SECONDS) refused.push(r);
    else if (r.conclusion === 'success' || r.conclusion === 'failure') real.push(r);
  }
  return { real, refused };
}

export function dailyRates(runs) {
  const byDay = new Map();
  for (const r of runs) {
    const day = r.createdAt.slice(0, 10);
    const d = byDay.get(day) ?? { day, total: 0, failed: 0 };
    d.total++;
    if (r.conclusion === 'failure') d.failed++;
    byDay.set(day, d);
  }
  return [...byDay.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(d => ({ ...d, rate: d.failed / d.total }));
}

export function stats(series) {
  const n = series.length;
  const mean = series.reduce((a, b) => a + b, 0) / n;
  const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { mean, sigma: Math.sqrt(variance) };
}

/* Western Electric, the four standard rules, evaluated at the END of the
   series -- the question is "is the latest point a breach", not "was there
   ever one". Each returns the sigma level it corresponds to. */
export function westernElectric(series, { mean, sigma }) {
  /* NOT `sigma === 0`. Twenty readings of exactly 0.1 sum to 2.0000000000000004,
     which leaves a sigma around 1.4e-17 rather than zero -- and every z-score
     computed against it explodes, so a PERFECTLY STABLE metric fires the band.
     That is the failure this whole script exists to avoid, and it was one
     equality away. Compare against an epsilon scaled to the data. */
  const eps = Math.max(1e-12, Math.abs(mean) * 1e-9);
  if (!(sigma > eps)) return [];
  const z = series.map(v => (v - mean) / sigma);
  const last = n => z.slice(-n);
  const fired = [];

  if (Math.abs(z.at(-1)) > 3) fired.push({ rule: 1, sigma: 3, detail: 'one point beyond 3 sigma' });

  const beyond = (arr, k) => arr.filter(v => Math.abs(v) > k && Math.sign(v) === Math.sign(z.at(-1))).length;
  if (series.length >= 3 && beyond(last(3), 2) >= 2)
    fired.push({ rule: 2, sigma: 2, detail: '2 of 3 consecutive points beyond 2 sigma, same side' });
  if (series.length >= 5 && beyond(last(5), 1) >= 4)
    fired.push({ rule: 3, sigma: 1, detail: '4 of 5 consecutive points beyond 1 sigma, same side' });
  if (series.length >= 8 && last(8).every(v => Math.sign(v) === Math.sign(z.at(-1)) && v !== 0))
    fired.push({ rule: 4, sigma: 1, detail: '8 consecutive points on one side of the mean' });

  return fired;
}

/* The highest rung any fired rule reaches. No rule fired is not a breach. */
export function tierFor(fired, bands) {
  if (!fired.length) return null;
  const level = Math.max(...fired.map(f => f.sigma));
  const key = `${level}sigma`;
  return { key, ...(bands.tiers?.[key] ?? {}) };
}

/* ---------- I/O ---------- */

function fetchRuns(limit) {
  const out = execFileSync('gh',
    ['run', 'list', '--limit', String(limit), '--json', 'conclusion,createdAt,updatedAt,name'],
    { cwd: ROOT, encoding: 'utf8' });
  return JSON.parse(out);
}

/* Run only when invoked directly, so the pure half above can be unit-tested
   without a network or a gh login. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const jsonOut = args.includes('--json');
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? Number(args[li + 1]) : 100;

  const bands = parseYaml(readFileSync(join(ROOT, 'bands.yaml'), 'utf8'));

  let runs;
  try {
    runs = fetchRuns(limit);
  } catch (e) {
    console.error('bands: could not read CI history through `gh`. ' +
      'This is a detection script; with no data it reports nothing rather than reporting calm.');
    process.exit(2);
  }

  const { real, refused } = classify(runs);
  const days = dailyRates(real);
  const series = days.map(d => d.rate);

  const report = {
    metric: bands.metric,
    baseline: bands.baseline,
    runs: { total: runs.length, counted: real.length, refused: refused.length },
    points: days.length,
    days,
  };

  if (days.length < MIN_POINTS) {
    report.verdict = 'insufficient-baseline';
    report.detail = `${days.length} daily point(s); ${MIN_POINTS} needed before a band means anything. ` +
      `\`${bands.baseline}\` is the configured baseline and this history does not reach it.`;
  } else {
    const s = stats(series);
    const fired = westernElectric(series, s);
    const tier = tierFor(fired, bands);
    Object.assign(report, {
      mean: s.mean, sigma: s.sigma, fired,
      verdict: tier ? 'breach' : 'in-control',
      tier: tier?.key ?? null,
      action: tier?.action ?? null,
    });
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\nbands — ${report.metric}\n`);
    console.log(`  runs read      ${report.runs.total} (${report.runs.counted} counted, ${report.runs.refused} refused by the account and excluded)`);
    console.log(`  daily points   ${report.points}`);
    for (const d of report.days) {
      console.log(`    ${d.day}  ${String(d.failed).padStart(2)}/${String(d.total).padEnd(3)} = ${(d.rate * 100).toFixed(1)}%`);
    }
    if (report.verdict === 'insufficient-baseline') {
      console.log(`\n  VERDICT  insufficient-baseline\n  ${report.detail}\n`);
    } else {
      console.log(`\n  mean ${(report.mean * 100).toFixed(1)}%  sigma ${(report.sigma * 100).toFixed(1)}pp`);
      for (const f of report.fired) console.log(`  rule ${f.rule}: ${f.detail}`);
      console.log(`\n  VERDICT  ${report.verdict}${report.tier ? ` at ${report.tier} -> ${report.action}` : ''}\n`);
    }
  }
  /* Exit 0 whatever the verdict. This reports; the workflow decides. A
     detection script that exited non-zero on a breach would make "the band
     fired" indistinguishable from "the script broke". */
  process.exit(0);
}
