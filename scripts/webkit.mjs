#!/usr/bin/env node
/* #597: the key checks, in WebKit. Prints a PASS/FAIL/SKIP table of five rows
 * and exits 1 on any FAIL (or if nothing ran). Playwright is not a dependency:
 * it is found at run time (`webkit/playwright.mjs`), and missing it prints the
 * install line and exits 1. Playwright's WebKit is desktop WebKit, not iOS
 * Safari; what it cannot reproduce is in docs/specs/597-webkit-checks.md.
 *
 *   node scripts/webkit.mjs [--headful]
 *
 * Every row has its own time limit and the run has an overall one; WebKit and
 * the server are closed on every exit path. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from './serve.mjs';
import { launchWebKit } from './webkit/open.mjs';
import { CHECKS } from './webkit/checks.mjs';
import { runRow, tableOf, exitCodeOf } from './webkit/verdicts.mjs';

const ROW_MS = 60_000;
const RUN_MS = 4 * 60_000;

export async function main(argv = process.argv.slice(2)) {
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  let wk;
  const giveUp = setTimeout(async () => {
    console.error(`webkit: the run took longer than ${RUN_MS / 1000}s; giving up`);
    await wk?.close();
    server.close();
    process.exit(1);
  }, RUN_MS);
  try {
    wk = await launchWebKit({ headful: argv.includes('--headful') });
    const rows = [];
    for (const check of CHECKS) rows.push(await runRow(check.name, () => check.run(wk, origin), ROW_MS));
    console.log(tableOf(rows));
    return exitCodeOf(rows);
  } catch (e) {
    console.error(e.message.startsWith('Playwright not installed') ? e.message : `webkit: ${e.message}`);
    return 1;
  } finally {
    clearTimeout(giveUp);
    await wk?.close();
    server.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(code => process.exit(code), e => { console.error(e.message); process.exit(1); });
}
