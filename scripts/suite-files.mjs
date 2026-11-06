/* #628: which test file is a Coach scenario, written once. A scenario's name
   ends `-scenarios.test.js`. CI (`scripts/scenarios.mjs`), the smoke harness
   and `scripts/lanes/ci-local.sh` all ask here; nothing else spells the rule.

   Scenarios drive `app/` in Chrome through `test/coach.js`, which takes no
   coverage, so they run apart from the unit files that the coverage floor
   measures. `node --test`'s own default picks up `test/*.test.js` and nothing
   else, so the two lists together are exactly what a bare `node --test` runs. */
import { readdirSync } from 'node:fs';

const TEST_DIR = new URL('../test/', import.meta.url);
const SCENARIO = /-scenarios\.test\.js$/;

const all = () => readdirSync(TEST_DIR).filter(f => f.endsWith('.test.js')).sort().map(f => `test/${f}`);

export const scenarioFiles = () => all().filter(f => SCENARIO.test(f));
export const unitFiles = () => all().filter(f => !SCENARIO.test(f));
