/* The band detector, tested where it can be: the pure half. Nothing here
 * touches the network or `gh` — `scripts/bands.mjs` only fetches when it is
 * invoked directly, which is what makes this file possible.
 *
 * The two assertions that matter most are the REFUSALS. A control band's
 * failure mode is not a wrong number, it is a confident number: a tier printed
 * from five data points looks exactly like a tier printed from fifty, and a
 * run GitHub declined to start looks exactly like a suite that went red. Both
 * would point the loop at the wrong thing while reporting perfect health, so
 * both are pinned here rather than left to the reader of the output.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseYaml, classify, dailyRates, stats, westernElectric, tierFor,
  durationSeconds, REFUSED_UNDER_SECONDS, MIN_POINTS,
} from '../scripts/bands.mjs';

const bandsYaml = readFileSync(new URL('../bands.yaml', import.meta.url), 'utf8');

/* ---------- the config parser ---------- */

test('parses the real bands.yaml', () => {
  const b = parseYaml(bandsYaml);
  assert.equal(b.metric, 'ci_test_failure_rate');
  assert.equal(b.baseline, 'rolling_30d');
  assert.equal(b.rules, 'western_electric');
  assert.equal(b.tiers['1sigma'].action, 'log');
  assert.equal(b.tiers['2sigma'].action, 'diagnose');
  assert.equal(b.tiers['3sigma'].action, 'propose');
});

test('a tier without an action would be a rung with nothing on it', () => {
  const b = parseYaml(bandsYaml);
  for (const [name, tier] of Object.entries(b.tiers)) {
    assert.ok(tier.action, `${name} has no action`);
  }
});

test('the 2 sigma tier is read-only, because a diagnosis that can write is not one', () => {
  const b = parseYaml(bandsYaml);
  assert.match(b.tiers['2sigma'].tools, /Read/);
  assert.doesNotMatch(b.tiers['2sigma'].tools ?? '', /Write|Edit/);
});

test('lists parse as lists', () => {
  const y = parseYaml('routes:\n  - pull_request\n  - runbook:x\n');
  assert.deepEqual(y.routes, ['pull_request', 'runbook:x']);
});

test('comments and blank lines are ignored', () => {
  const y = parseYaml('# a comment\n\nmetric: x  # trailing\n');
  assert.equal(y.metric, 'x');
});

test('an unparseable line throws rather than being skipped', () => {
  assert.throws(() => parseYaml('this is not yaml at all\n'), /cannot parse/);
});

/* ---------- refusal 1: an account failure is not a test failure ---------- */

const run = (day, conclusion, secs) => ({
  conclusion,
  createdAt: `${day}T00:00:00Z`,
  updatedAt: new Date(Date.parse(`${day}T00:00:00Z`) + secs * 1000).toISOString(),
});

test('a run the account refused is excluded, not counted as a red suite', () => {
  const runs = [
    run('2026-08-27', 'failure', 5),    // never started — billing
    run('2026-08-27', 'failure', 112),  // a real red suite
    run('2026-08-27', 'success', 110),
  ];
  const { real, refused } = classify(runs);
  assert.equal(refused.length, 1);
  assert.equal(real.length, 2);
  assert.equal(dailyRates(real)[0].rate, 0.5,
    'the refused run must not appear in the denominator either');
});

test('the refusal threshold sits far from both populations', () => {
  assert.ok(REFUSED_UNDER_SECONDS > 5, 'a 5s refusal must fall under it');
  assert.ok(REFUSED_UNDER_SECONDS < 100, 'a ~110s real run must fall over it');
});

test('cancelled and skipped runs are neither successes nor failures', () => {
  const { real, refused } = classify([run('2026-08-27', 'cancelled', 30), run('2026-08-27', 'skipped', 1)]);
  assert.equal(real.length, 0);
  assert.equal(refused.length, 0);
});

test('durationSeconds reads the real shape', () => {
  assert.equal(durationSeconds(run('2026-08-27', 'failure', 42)), 42);
});

/* ---------- refusal 2: no verdict on a thin baseline ---------- */

test('the minimum baseline is large enough that sigma means something', () => {
  assert.ok(MIN_POINTS >= 20,
    'below about twenty points sigma is an artefact of having no data, and a band drawn on it fires on noise');
});

/* ---------- the rules ---------- */

const flat = n => Array.from({ length: n }, () => 0.1);

test('a stable series is in control and fires nothing', () => {
  const series = [...flat(19), 0.1];
  assert.deepEqual(westernElectric(series, stats(series)), []);
});

test('zero variance never fires, rather than dividing by zero', () => {
  const series = flat(30);
  assert.deepEqual(westernElectric(series, stats(series)), []);
});

test('rule 1: one point beyond 3 sigma', () => {
  const series = [...flat(29), 0.9];
  const fired = westernElectric(series, stats(series));
  assert.ok(fired.some(f => f.rule === 1), 'a huge single spike must reach 3 sigma');
  assert.equal(Math.max(...fired.map(f => f.sigma)), 3);
});

test('rule 4: eight consecutive points on one side of the mean', () => {
  const series = [...flat(12).map((_, i) => (i % 2 ? 0.05 : 0.15)), ...Array(8).fill(0.12)];
  const fired = westernElectric(series, stats(series));
  assert.ok(fired.some(f => f.rule === 4), 'eight on one side is a drift, not noise');
});

test('rule 1 does not fire on a spike that is already in the past', () => {
  const series = [0.9, ...flat(29)];
  const fired = westernElectric(series, stats(series));
  assert.ok(!fired.some(f => f.rule === 1),
    'the question is whether the LATEST point is a breach, not whether there ever was one');
});

/* Rule 4 DOES fire on that series, and this pins it because it is a property
   of Western Electric rather than a bug here: one large outlier drags the mean
   up, every later normal reading sits below it, and eight of those in a row is
   rule 4 by definition. The consequence is real -- a contaminated baseline
   keeps signalling long after the incident -- and the playbook's answer is
   step 7: dismissals tune the bands. Whoever wires the diagnose half needs to
   know this before they read the first alert, not after. */
test('rule 4 keeps firing after a contaminated baseline, by design', () => {
  const series = [0.9, ...flat(29)];
  const fired = westernElectric(series, stats(series));
  assert.ok(fired.some(f => f.rule === 4),
    'eight readings below a mean one outlier lifted is a rule 4 signal, and pretending otherwise would hide a real property');
});

/* ---------- tier selection ---------- */

test('the highest rung any fired rule reaches is the one that is taken', () => {
  const bands = parseYaml(bandsYaml);
  const tier = tierFor([{ rule: 3, sigma: 1 }, { rule: 1, sigma: 3 }], bands);
  assert.equal(tier.key, '3sigma');
  assert.equal(tier.action, 'propose');
});

test('nothing fired is not a breach', () => {
  assert.equal(tierFor([], parseYaml(bandsYaml)), null);
});

test('the 3 sigma tier proposes through a pull request and nothing else', () => {
  const b = parseYaml(bandsYaml);
  assert.deepEqual(b.tiers['3sigma'].routes, ['pull_request'],
    'a runbook route naming a rollback this repo has never rehearsed would be a claim the tree cannot support');
});
