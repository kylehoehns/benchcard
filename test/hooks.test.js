/* The hooks in `.claude/hooks/` are guards, so they answer to the Guards
 * section of AGENTS.md like every other guard here: run them GREEN before
 * trusting them, and prove they can go RED.
 *
 * Both halves are the point. A hook that denies nothing is a hook everyone
 * believes is protecting them; a hook that denies everything gets switched off
 * within a day, and a switched-off hook is worse than no hook because the
 * prose in AGENTS.md was deleted on the strength of it. So every pattern below
 * is asserted in BOTH directions, and the ALLOW cases are not filler -- each
 * one is a real command from this repo's own history that a lazier regex
 * would have eaten. `grep -n update-budgets scripts/smoke.mjs` is the one that
 * matters most: reading ABOUT a forbidden command has to stay legal.
 *
 * The fixtures live in this file rather than in a shell line on purpose. A
 * PreToolUse(Bash) hook reads the whole command string, so a test harness that
 * passed these as arguments to `bash` would be denied by the very hook it was
 * trying to test -- which is what happened on the first attempt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOKS = new URL('../.claude/hooks/', import.meta.url);
const ROOT = new URL('../', import.meta.url);

/* Feed a hook its stdin JSON the way Claude Code does and read back what it
 * decided. A hook that says nothing has allowed the call: silence is consent,
 * and that is the contract, not an accident of this helper. */
function run(hook, input) {
  const out = execFileSync(new URL(hook, HOOKS).pathname, {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: new URL('.', ROOT).pathname },
  });
  if (!out.trim()) return { decision: null, reason: '', context: '' };
  const o = JSON.parse(out).hookSpecificOutput ?? {};
  return {
    decision: o.permissionDecision ?? null,
    reason: o.permissionDecisionReason ?? '',
    context: o.additionalContext ?? '',
  };
}

const bash = cmd => run('guard-bash.sh', { tool_input: { command: cmd } });
const edit = file_path => run('guard-edit.sh', { tool_input: { file_path } });

/* ---------- guard-bash: the RED half ---------- */

test('a blanket --update-budgets is denied', () => {
  const r = bash('node scripts/smoke.mjs --update-budgets');
  assert.equal(r.decision, 'deny');
  assert.match(r.reason, /requests/, 'the reason has to name the pin it protects, or it teaches nothing');
});

test('--update-budgets is denied however the command is dressed up', () => {
  for (const cmd of [
    'node scripts/smoke.mjs --json --update-budgets',
    'cd /repo && node scripts/smoke.mjs --update-budgets',
    'npm run smoke -- --update-budgets && node scripts/smoke.mjs --update-budgets',
  ]) assert.equal(bash(cmd).decision, 'deny', cmd);
});

test('git add -A, --all and . are denied', () => {
  for (const cmd of ['git add -A', 'git add --all', 'git add .', 'cd app && git add .', 'git add -A && git commit -m x']) {
    assert.equal(bash(cmd).decision, 'deny', cmd);
  }
});

test('a Co-Authored-By trailer on a commit is denied', () => {
  const r = bash('git commit -m "fix\n\nCo-Authored-By: Someone <s@example.com>"');
  assert.equal(r.decision, 'deny');
});

test('the trailer is caught in any casing', () => {
  assert.equal(bash('git commit -m "x\n\nco-authored-by: a <a@b.c>"').decision, 'deny');
});

/* ---------- guard-bash: the GREEN half ----------
 * Every command here is one this repo actually runs. If one of these ever
 * starts being denied, the guard has stopped being usable, and that is a
 * failure of the same size as missing a violation. */

test('reading about a forbidden command is not running it', () => {
  for (const cmd of [
    'grep -n "update-budgets" scripts/smoke.mjs',
    'rg -- --update-budgets scripts/',
    'cat AGENTS.md',
  ]) assert.equal(bash(cmd).decision, null, cmd);
});

test('the smoke harness and the suite run untouched', () => {
  for (const cmd of [
    'npm test',
    'node --test',
    'node scripts/smoke.mjs',
    'node scripts/smoke.mjs --no-tests',
    'node scripts/smoke.mjs --json',
  ]) assert.equal(bash(cmd).decision, null, cmd);
});

test('staging explicit paths is the whole point and stays allowed', () => {
  for (const cmd of [
    'git add app/sw.js app/app.js',
    'git add notes/TICKETS.md',
    'git add -p app/app.css',
    'git add -u app/',
  ]) assert.equal(bash(cmd).decision, null, cmd);
});

test('an ordinary commit is allowed', () => {
  assert.equal(bash('git commit -m "The level meters line up in a column now"').decision, null);
});

test('a path that merely contains "add" is not a staging command', () => {
  assert.equal(bash('node scripts/charts.mjs --check').decision, null);
  assert.equal(bash('ls app/addendum.md').decision, null);
});

/* ---------- guard-edit ---------- */

test('vendored files, generated chart pages and the budget baseline are denied', () => {
  for (const p of [
    '/repo/app/vendor/motion.mjs',
    '/repo/app/vendor/motion.umd.js',
    '/repo/app/vendor/icons/plus.svg',
    '/repo/app/vendor/icons/x.svg',
    '/repo/app/vendor/fonts/inter-latin-wght-normal.woff2',
    '/repo/app/vendor/icons/fetch.sh',
    '/repo/app/vendor/fetch.sh.bak',
    '/repo/app/vendor/fonts/README.md',
    '/repo/app/vendor/x/app/vendor/fetch.sh',
    '/repo/app/vendor/icons/app/vendor/README.md',
    '/repo/app/9-player-basketball-rotation-chart.html',
    '/repo/app/12-player-basketball-rotation-chart.html',
    '/repo/scripts/budgets.json',
  ]) assert.equal(edit(p).decision, 'deny', p);
});

test('the chart denial names the generator, since that is the actual instruction', () => {
  assert.match(edit('/repo/app/7-player-basketball-rotation-chart.html').reason, /charts\.mjs/);
});

test('fetch.sh and README.md are the two hand-opened files under app/vendor/, so the deny message stays true', () => {
  assert.equal(edit('/repo/app/vendor/fetch.sh').decision, null);
  assert.equal(edit('/repo/app/vendor/README.md').decision, null);
});

test('every other file in the tree stays editable', () => {
  for (const p of [
    '/repo/app/app.js',
    '/repo/app/index.html',
    '/repo/app/about.html',
    '/repo/app/sw.js',
    '/repo/scripts/charts.mjs',
    '/repo/scripts/budgets.mjs',
    '/repo/notes/TICKETS.md',
    '/repo/AGENTS.md',
  ]) assert.equal(edit(p).decision, null, p);
});

test('budgets.mjs is the escape hatch the budgets.json denial points at, so it must be open', () => {
  assert.equal(edit('/repo/scripts/budgets.mjs').decision, null);
  assert.match(edit('/repo/scripts/budgets.json').reason, /budgets\.mjs/);
});

/* ---------- guard-read: a large text file is read in parts ---------- */

/* Fixtures are written to a temp dir rather than pointed at app/app.css, so
 * the RED half cannot turn green the day that file shrinks, and the ALLOW
 * half cannot turn red the day a small file grows. */
const scratch = mkdtempSync(join(tmpdir(), 'guard-read-'));
const fixture = (name, bytes) => {
  const f = join(scratch, name);
  writeFileSync(f, 'x'.repeat(bytes));
  return f;
};
const read = (file_path, extra = {}) =>
  run('guard-read.sh', { tool_input: { file_path, ...extra } });

test('reading a large text file whole is denied, with the way out in the reason', () => {
  for (const name of ['big.css', 'big.mjs', 'big.html', 'BIG.JS']) {
    const r = read(fixture(name, 60001));
    assert.equal(r.decision, 'deny', name);
    assert.match(r.reason, /grep -n/, 'the reason has to say how to find the part you need');
    assert.match(r.reason, /offset and limit/);
  }
});

test('an offset alone is still a whole-file read from there on, so it is denied', () => {
  assert.equal(read(fixture('tail.css', 90000), { offset: 10 }).decision, 'deny');
});

test('a large file read with a limit is allowed, since that is the instruction', () => {
  assert.equal(read(fixture('part.css', 90000), { offset: 2000, limit: 80 }).decision, null);
  assert.equal(read(fixture('head.css', 90000), { limit: 80 }).decision, null);
});

test('a file at the limit, a missing file and a large binary are all allowed', () => {
  assert.equal(read(fixture('edge.css', 60000)).decision, null);
  assert.equal(read(join(scratch, 'nope.css')).decision, null);
  for (const name of ['og.png', 'shot.JPG', 'doc.pdf', 'inter.woff2']) {
    assert.equal(read(fixture(name, 225000)).decision, null, name);
  }
});

test('settings.json wires guard-read.sh to Read', () => {
  const pre = JSON.parse(readFileSync(new URL('.claude/settings.json', ROOT), 'utf8')).hooks.PreToolUse;
  const wired = pre.filter(h => h.hooks.some(x => x.command.endsWith('/guard-read.sh')));
  assert.equal(wired.length, 1, 'guard-read.sh is not wired, so it guards nothing');
  assert.equal(wired[0].matcher, 'Read');
});

/* ---------- after-edit: advisory, never blocking ---------- */

test('editing a precached file reminds about VERSION and SHELL, and never denies', () => {
  const r = run('after-edit.sh', { tool_input: { file_path: '/repo/app/app.js' } });
  assert.equal(r.decision, null, 'this hook must never block -- the right SHELL is not knowable at edit time');
  assert.match(r.context, /VERSION/);
  assert.match(r.context, /SHELL/);
});

test('the reminder quotes the live constants rather than a copy of them', () => {
  const sw = readFileSync(new URL('app/sw.js', ROOT), 'utf8');
  const version = sw.match(/const VERSION = '([^']*)'/)[1];
  const r = run('after-edit.sh', { tool_input: { file_path: '/repo/app/app.js' } });
  assert.match(r.context, new RegExp(`'${version}'`),
    'a hard-coded VERSION here would drift from sw.js, which is the defect this repo names most often');
});

test('a file outside PRECACHE gets no shell reminder', () => {
  assert.equal(run('after-edit.sh', { tool_input: { file_path: '/repo/notes/TICKETS.md' } }).context, '');
  assert.equal(run('after-edit.sh', { tool_input: { file_path: '/repo/scripts/charts.mjs' } }).context, '');
});

test('editing a guard reminds you to run it red', () => {
  const r = run('after-edit.sh', { tool_input: { file_path: '/repo/test/engine.test.js' } });
  assert.match(r.context, /RED/);
});

/* ---------- fail-closed ----------
 * A guard that cannot read its input must block, not shrug. Without jq every
 * pattern above misses and the hook exits 0, which Claude Code reads as "no
 * objection" -- a silent, total loss of protection that reports success. Exit
 * 2 is the blocking code, and this is asserted because the failure it prevents
 * is invisible by construction. */

test('the blocking guards fail CLOSED when jq is unreachable', () => {
  for (const hook of ['guard-bash.sh', 'guard-edit.sh']) {
    let status = 0;
    try {
      execFileSync(new URL(hook, HOOKS).pathname, {
        input: '{}',
        encoding: 'utf8',
        env: { PATH: '/nonexistent' },
      });
    } catch (e) {
      status = e.status;
    }
    assert.equal(status, 2, `${hook} must exit 2 (block) with no jq, not 0 (allow)`);
  }
});

test('the advisory hook fails OPEN, since blocking on a reminder would be worse', () => {
  let status = 0;
  try {
    execFileSync(new URL('after-edit.sh', HOOKS).pathname, {
      input: '{}', encoding: 'utf8', env: { PATH: '/nonexistent' },
    });
  } catch (e) { status = e.status; }
  assert.notEqual(status, 2, 'after-edit.sh must never block a tool call');
});
