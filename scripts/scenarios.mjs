#!/usr/bin/env node
/* #628: the Coach scenario files, run on their own.

       node scripts/scenarios.mjs              # every scenario file
       node scripts/scenarios.mjs --shard 2/3  # the second of three parts

   CI's `scenario part k/n` jobs and `scripts/lanes/ci-local.sh` call this; the
   list comes from `suite-files.mjs`, the one place that says what a scenario
   is. No coverage is taken: the scenarios load `app/` in Chrome and the
   floor in `scripts/coverage.json` never counted them. The exit code is
   `node --test`'s own. */
import { spawn } from 'node:child_process';
import { scenarioFiles } from './suite-files.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--shard');
const shard = at < 0 ? null : args[at + 1];
if (at >= 0 && !/^[1-9]\d*\/[1-9]\d*$/.test(shard || '')) {
  console.error('scenarios: --shard needs k/n, for example --shard 2/3');
  process.exit(2);
}
const files = scenarioFiles();
if (!files.length) {
  console.error('scenarios: found no scenario files, so there is nothing to run');
  process.exit(2);
}
const cmd = ['--test', ...(shard ? [`--test-shard=${shard}`] : []), ...files];
const child = spawn(process.execPath, cmd, { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
