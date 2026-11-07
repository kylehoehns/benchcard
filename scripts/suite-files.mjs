/* #628: which test file is a Coach scenario, written once. A scenario's name
   ends `-scenarios.test.js`. CI (`scripts/scenarios.mjs`), the smoke harness
   and `scripts/lanes/ci-local.sh` all ask here; nothing else spells the rule.

   The two lists together are exactly what a bare `node --test` runs: Node 24's
   default discovery, spelled out below, minus node_modules. test/suite-files.test.js
   checks that against `node --test` itself. */
import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const SCENARIO = /-scenarios\.test\.js$/;

/* Node's documented default patterns, for .js, .mjs and .cjs. */
const DEFAULT = ['*.test', '*-test', '*_test', 'test-*', 'test'].map(p => `**/${p}.?(c|m)js`)
  .concat('**/test/**/*.?(c|m)js');

const all = root => globSync(DEFAULT, { cwd: root, exclude: ['**/node_modules'] }).sort();

export const scenarioFiles = (root = REPO) => all(root).filter(f => SCENARIO.test(f));
export const unitFiles = (root = REPO) => all(root).filter(f => !SCENARIO.test(f));
