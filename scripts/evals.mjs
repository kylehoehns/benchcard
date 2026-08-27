#!/usr/bin/env node
/* The eval runner. Stage 4's continuous-evals suite, such as it can be run
 * without a model in the loop.
 *
 *     node scripts/evals.mjs            # run them, print a table
 *     node scripts/evals.mjs --json     # machine-readable, for CI
 *
 * WHAT THIS DOES NOT DO, STATED FIRST BECAUSE IT IS THE PART THAT MATTERS.
 * Half the evals in `evals/` need a model to decide them -- did the right
 * skill load, did the session reach for the harness before hand-rolling a
 * browser. This runner cannot decide those and does not try. It prints them as
 * NOT RUN and they never count toward the pass total. A runner that scored
 * them as passes would be the false green this repo has been caught by more
 * than any other failure: 21 of 21 green because a sentinel was `-1`, eleven
 * arms "caught" because the reporter never printed `not ok`.
 *
 * Exit code is 0 only if every DETERMINISTIC check passed. Not-run is not a
 * pass, and it is not a failure either -- it is a number you have to look at.
 *
 * No dependencies, like everything else here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EVALS = join(ROOT, 'evals');
const HOOKS = join(ROOT, '.claude', 'hooks');
const JSON_OUT = process.argv.includes('--json');

/* ---------- check runners ---------- */

/* Feed a hook its stdin JSON exactly the way Claude Code does, and read the
 * decision back out. Silence is consent: a hook that prints nothing has
 * allowed the call, and that is the contract rather than an accident here. */
function runHook(hook, input, env) {
  let stdout = '', status = 0;
  try {
    stdout = execFileSync(join(HOOKS, hook), {
      input: JSON.stringify(input ?? {}),
      encoding: 'utf8',
      env: env ? { ...env } : { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
      /* The fail-closed arms make the hooks print to stderr on purpose. That
         is the eval working, not the runner breaking, so it is captured rather
         than leaked into the table above it. */
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    status = e.status ?? 1;
    stdout = e.stdout ?? '';
  }
  let decision = 'allow', reason = '';
  if (stdout.trim().startsWith('{')) {
    const o = JSON.parse(stdout).hookSpecificOutput ?? {};
    if (o.permissionDecision) decision = o.permissionDecision;
    reason = o.permissionDecisionReason ?? '';
  }
  return { decision, reason, status };
}

const CHECKS = {
  hook(c) {
    const { decision, reason } = runHook(c.hook, c.input);
    if (decision !== c.expect) {
      return `${c.hook} said "${decision}", expected "${c.expect}"`;
    }
    if (c.reasonMatches && !new RegExp(c.reasonMatches).test(reason)) {
      return `${c.hook} denied but its reason did not match /${c.reasonMatches}/ — a denial that does not name the way out teaches nothing`;
    }
    return null;
  },

  hookExit(c) {
    const { status } = runHook(c.hook, c.input, c.env);
    return status === c.expectExit ? null
      : `${c.hook} exited ${status}, expected ${c.expectExit}`;
  },

  /* Judged by EXIT CODE. node's default reporter does not print `not ok`, and
   * a harness that parsed for it reported all eleven of its arms caught. */
  suite(c) {
    try {
      execFileSync(process.execPath, ['--test', c.file], { cwd: ROOT, stdio: 'pipe' });
      return null;
    } catch (e) {
      return `${c.file} failed (exit ${e.status})`;
    }
  },
};

/* ---------- run ---------- */

const files = readdirSync(EVALS).filter(f => f.endsWith('.json')).sort();
const results = [];

for (const f of files) {
  const e = JSON.parse(readFileSync(join(EVALS, f), 'utf8'));
  if (e.kind === 'agent') {
    results.push({ id: e.id, stage: e.stage, kind: e.kind, state: 'not-run',
      detail: `${e.checks.length} check(s) need a model in the loop` });
    continue;
  }
  const failures = [];
  for (const c of e.checks) {
    const run = CHECKS[c.type];
    if (!run) { failures.push(`unknown check type "${c.type}"`); continue; }
    const err = run(c);
    if (err) failures.push(err);
  }
  results.push({
    id: e.id, stage: e.stage, kind: e.kind,
    state: failures.length ? 'fail' : 'pass',
    detail: failures.length ? failures.join('; ') : `${e.checks.length} check(s)`,
  });
}

const pass = results.filter(r => r.state === 'pass').length;
const fail = results.filter(r => r.state === 'fail').length;
const notRun = results.filter(r => r.state === 'not-run').length;

if (JSON_OUT) {
  console.log(JSON.stringify({ pass, fail, notRun, results }, null, 2));
} else {
  const C = { pass: '\x1b[32mPASS   \x1b[0m', fail: '\x1b[31mFAIL   \x1b[0m', 'not-run': '\x1b[33mNOT RUN\x1b[0m' };
  console.log(`\nbenchcard evals — ${results.length} defined, ${pass + fail} runnable here\n`);
  for (const r of results) {
    console.log(`  ${C[r.state]}  ${r.id.padEnd(34)} ${r.detail}`);
  }
  console.log(`\n  ${pass} passed, ${fail} failed, ${notRun} need a model and were not run.`);
  if (notRun) console.log('  NOT RUN is not a pass. Those checks are written down so somebody can run them.\n');
}

process.exit(fail ? 1 : 0);
