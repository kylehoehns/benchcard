#!/usr/bin/env node
/* #628: the Coach scenario files, run on their own.

       node scripts/scenarios.mjs              # every scenario file
       node scripts/scenarios.mjs --shard 2/3  # the second of three parts

   CI's `scenario part k/n` jobs and `scripts/lanes/ci-local.sh` call this; the
   list comes from `suite-files.mjs`. The exit code is `node --test`'s own. */
import { spawn } from 'node:child_process';
import { scenarioFiles } from './suite-files.mjs';
import { parseShard } from './smoke/shard.mjs';

const fail = msg => { console.error(`scenarios: ${msg}`); process.exit(2); };
const args = process.argv.slice(2);
let shard = null;
if (args.length) {
  if (args[0] !== '--shard' || args.length !== 2) fail(`takes no argument but --shard k/n, got ${args.join(' ')}`);
  try {
    const s = parseShard(args[1]);
    if (s.suite) throw new Error('--shard suite is a smoke part, not a scenario part');
    shard = `${s.k}/${s.n}`;
  } catch (e) { fail(e.message); }
}
const files = scenarioFiles();
if (!files.length) {
  console.error('scenarios: found no scenario files, so there is nothing to run');
  process.exit(2);
}
const cmd = ['--test', ...(shard ? [`--test-shard=${shard}`] : []), ...files];
const child = spawn(process.execPath, cmd, { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
