/* Performance budgets for the initial payload.

   The pure half of the budget check: `smoke.mjs` measures what the browser
   actually fetched on a cold load, this compares it with the numbers recorded
   in `budgets.json` and turns the difference into pass/fail lines.

   Two different kinds of rule live here, and the distinction matters:

   * **Recorded baselines** — bytes, request count, DOM nodes. Nobody knows
     what the "right" number is, so we do not invent one: we record today's and
     fail when it grows. Re-record deliberately with
     `node scripts/smoke.mjs --update-budgets`, and the diff shows up in review
     as a number going up, which is the whole point.

   The photo scanner used to add a second, harder rule here: its ~9.6 MB OCR
   bundle had to stay out of the initial payload, and one request was a
   failure. The scanner is gone, so that rule went with it rather than being
   left behind as a check that can no longer fail -- a permanently green line
   is how a list of checks stops being read.

   Slack exists because a headless run is not byte-identical forever — gzip
   output shifts with Chrome's `accept-encoding`, and a one-line comment should
   not turn CI red. It is small on purpose. */

/* Bytes and nodes are REGRESSION ALARMS, not design constraints. Decided
   on 2026-08-24, and right on the merits: this app precaches its
   whole shell in a service worker, so after the first load neither number
   costs a coach anything. The payload budget only ever describes one visit,
   once, and 770 KB is not a problem on a connection somebody installs an app
   over.

   The tight version of these two was actively making bad calls. A UX study
   rejected a navigation index for a 2,885px wall of prose (14,389px at 200%
   text) because it cost five DOM nodes, and ranked twenty worthwhile fixes
   down to three on the same grounds. That is a design decision being made by
   an arbitrary number instead of by what a coach gains. **Node and byte cost
   is NOT a reason to reject a fix. Measure it, report it, spend it.**

   So: generous on bytes and nodes -- wide enough that ordinary work never
   argues with them, tight enough that an accidental 200 KB or a runaway
   render still turns CI red.

   `requests` stays at +2 and is the one deliberately-tight pin. It is not
   about weight: request count is what hurts on a high-latency connection in a
   way raw bytes do not, and it is the thing that stops a new module quietly
   joining the boot graph. Never re-record it. */
export const SLACK = { bytesPct: 0.25, bytesAbs: 4096, requests: 2, nodes: 250 };

const kb = n => `${(n / 1024).toFixed(1)} KB`;
const pct = (got, want) => (want ? `${got > want ? '+' : ''}${(((got - want) / want) * 100).toFixed(1)}%` : 'n/a');

/** The ceiling a measurement is allowed to reach before it counts as a regression. */
export const ceiling = (key, baseline) =>
  key === 'bytes' ? Math.round(baseline * (1 + SLACK.bytesPct) + SLACK.bytesAbs)
    : key === 'requests' ? baseline + SLACK.requests
    : baseline + SLACK.nodes;

/**
 * Compare a measured payload against the recorded baseline.
 * @param {{bytes:number, requests:number, nodes:number}} baseline
 * @param {{bytes:number, requests:number, nodes:number, byType?:object}} measured
 * @returns {{name:string, pass:boolean, detail:string}[]}
 */
export function compare(baseline, measured) {
  const checks = [];
  if (!baseline) {
    checks.push({
      name: 'initial payload budget',
      pass: false,
      detail: 'no budgets.json — record one with `node scripts/smoke.mjs --update-budgets`',
    });
    return checks;
  }

  const rows = [
    ['initial payload ≤ budget', 'bytes', kb],
    ['request count ≤ budget', 'requests', String],
    ['DOM nodes ≤ budget', 'nodes', String],
  ];
  for (const [name, key, fmt] of rows) {
    const got = measured[key], want = baseline[key], max = ceiling(key, want);
    const pass = got <= max;
    checks.push({
      name,
      pass,
      detail: pass
        ? `${fmt(got)} vs ${fmt(want)} recorded (${pct(got, want)}, budget ${fmt(max)})`
        : `${fmt(got)} over the ${fmt(max)} budget (recorded ${fmt(want)}, ${pct(got, want)}). `
          + 'If the growth is intended, re-record with `node scripts/smoke.mjs --update-budgets`.',
    });
  }
  return checks;
}

/** Split a list of `{url, bytes}` into the report's byType/bytes/requests shape. */
export function summarize(entries, origin) {
  const ours = entries.filter(e => e.url.startsWith(origin));
  return {
    bytes: ours.reduce((n, e) => n + e.bytes, 0),
    requests: ours.length,
    byType: ours.reduce((acc, e) => ((acc[e.type] = (acc[e.type] || 0) + e.bytes), acc), {}),
  };
}
