import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The stint table's In, Out and Sitting columns are all "sometimes empty".
   In and Out fell back to an em dash; Sitting did not, so a five-available
   game — where nobody ever sits — printed a header over a column of blank
   cells, which reads as "not worked out yet" rather than "nobody". Same
   source-reading trick as remove-player.test.js: plan-view.js builds DOM. */
const src = readFileSync(new URL('../app/plan-view.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function renderPlanTable'));
const fn = body.slice(0, body.indexOf('\n}\n') + 2);

for (const col of ['in', 'out', 'sit']) {
  test(`the ${col} column says "—" rather than nothing when it is empty`, () => {
    const re = new RegExp(`el\\('td', '${col}'[^\\n]*\\|\\| '—'`);
    assert.ok(re.test(fn), `the ${col} cell has no em-dash fallback`);
  });
}
