/* #510: a Chrome whose owner node process was SIGKILLed (no handler ran) is
 * reaped by the next `launch()`; a Chrome whose owner is alive is never touched.
 *
 * Two seams, both judged by running the harness code for real:
 *  - `reapOrphans(sandbox)` against stand-in `node -e` processes (no Chrome);
 *  - a real `scripts/smoke.mjs` run SIGKILLed mid-boot / mid-page, then a real
 *    in-process `launch()` (NEEDS_CHROME).
 * Safety: every test works in its own sandbox TMPDIR, so the sweep only sees
 * dirs this file made, and only kills processes this file spawned (cleaned up
 * in `after`). Every wait has its own timeout. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reapOrphans, launch, closeChrome } from '../scripts/smoke/chrome.mjs';
import { NEEDS_CHROME, SMOKE, CWD } from './helpers/smoke-cli.mjs';

const REAL_TMPDIR = process.env.TMPDIR;
const sandboxes = [];
const pidsToKill = new Set();      // plain pids this file spawned
const groupsToKill = new Set();    // detached spawns we own the group of

function sandbox() {
  const d = mkdtempSync(join(tmpdir(), 'orphans-test-'));
  sandboxes.push(d);
  return d;
}

/* Deliberately independent of chrome.mjs's own ps parser and pid check: the
   test's oracle must not share the sweep's code. */
const ps = () => execFileSync('ps', ['-A', '-ww', '-o', 'pid=,ppid=,pgid=,command='], { encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\n').map(l => l.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
  .map(m => ({ pid: +m[1], ppid: +m[2], pgid: +m[3], command: m[4] }));
const naming = dir => ps().filter(p => p.command.includes(dir));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out after ${ms}ms waiting for ${what}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

const SLEEP = 'setInterval(() => {}, 1e6)';
/* A stand-in "Chrome": a long-lived node whose command line names `dir`. */
function standIn(dir, { detached = true } = {}) {
  const p = spawn(process.execPath, ['-e', SLEEP, '--', `--user-data-dir=${dir}`], { stdio: 'ignore', detached });
  pidsToKill.add(p.pid);
  if (detached) groupsToKill.add(p.pid);
  return p;
}
const sleeper = () => standIn('no-dir-named-here');

async function visible(pid) {
  await waitFor(() => ps().some(p => p.pid === pid && p.command.includes('--user-data-dir')), 10_000, `process ${pid} to be listed`);
}

/* An owner node that makes `benchcard-smoke-<its pid>-XXXXXX` itself, spawns a
 * stand-in naming it as its direct child, reports both, then waits. */
async function ownerWithChild() {
  const root = sandbox();
  const owner = spawn(process.execPath, ['-e', `
    const fs = require('fs'), cp = require('child_process'), path = require('path');
    const dir = fs.mkdtempSync(path.join(process.argv[1], 'benchcard-smoke-' + process.pid + '-'));
    const c = cp.spawn(process.execPath, ['-e', '${SLEEP}', '--', '--user-data-dir=' + dir], { stdio: 'ignore' });
    console.log(JSON.stringify({ dir, child: c.pid }));
    ${SLEEP};`, root], { stdio: ['ignore', 'pipe', 'inherit'], detached: true });
  pidsToKill.add(owner.pid); groupsToKill.add(owner.pid);
  const line = await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('owner stand-in printed nothing in 10s')), 10_000);
    owner.stdout.once('data', d => { clearTimeout(t); ok(String(d)); });
  });
  const { dir, child } = JSON.parse(line);
  pidsToKill.add(child);
  await visible(child);
  return { root, owner, dir, child };
}
const killAndWait = async pid => {
  process.kill(pid, 'SIGKILL');
  await waitFor(() => !ps().some(p => p.pid === pid && !/<defunct>|^\(/.test(p.command)), 10_000, `pid ${pid} to die`).catch(() => {});
};

after(() => {
  for (const g of groupsToKill) { try { process.kill(-g, 'SIGKILL'); } catch { /* gone */ } }
  for (const p of pidsToKill) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  for (const root of sandboxes) {
    // Safety net for real-Chrome tests: only processes naming OUR sandbox path.
    for (const p of ps().filter(x => x.command.includes(root))) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
    rmSync(root, { recursive: true, force: true });
  }
  process.env.TMPDIR = REAL_TMPDIR;
  if (REAL_TMPDIR === undefined) delete process.env.TMPDIR;
});

/* ---------- reapOrphans against stand-ins (spec items 4, 5) ---------- */

test('a dir whose owner was SIGKILLed has its process reaped and the dir removed', { timeout: 30_000 }, async () => {
  const { root, owner, dir, child } = await ownerWithChild();
  await killAndWait(owner.pid);
  assert.ok(alive(child), 'precondition: the orphan survives its owner (the bug)');
  const r = await reapOrphans(root);
  assert.ok(!naming(dir).length, `a process naming the dead owner's dir survived the sweep: ${JSON.stringify(naming(dir))}`);
  assert.ok(!existsSync(dir), 'the dead owner\'s profile dir was not removed');
  assert.deepEqual(r.reaped, [dir], 'reapOrphans should report the dir it reaped');
});

test('a dir whose owner is alive is left alone, process and dir', { timeout: 30_000 }, async () => {
  const { root, owner, dir, child } = await ownerWithChild();
  const r = await reapOrphans(root);
  assert.ok(alive(owner.pid) && alive(child), 'a live owner\'s Chrome was killed by the sweep');
  assert.ok(existsSync(dir), 'a live owner\'s profile dir was removed');
  assert.deepEqual(r.kept, [dir]);
  assert.deepEqual(r.reaped, []);
});

test('only an exact dir name is reaped: a longer path and an unrelated process survive', { timeout: 30_000 }, async () => {
  const root = sandbox();
  const gone = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise(ok => gone.once('exit', ok));
  const dir = join(root, `benchcard-smoke-${gone.pid}-abc123`);
  mkdirSync(dir);
  const longer = standIn(dir + 'x');       // names the dir plus one character
  const nothing = standIn('unrelated');    // names nothing
  const exact = standIn(dir);              // control: names it exactly
  await Promise.all([visible(longer.pid), visible(nothing.pid), visible(exact.pid)]);
  await reapOrphans(root);
  await waitFor(() => !alive(exact.pid) || ps().find(p => p.pid === exact.pid)?.command.includes('<defunct>'), 5_000, 'exact stand-in to die');
  assert.ok(alive(longer.pid), 'a process naming the dir plus one extra character was killed');
  assert.ok(alive(nothing.pid), 'a process naming no dir was killed');
  assert.ok(!existsSync(dir), 'the dead owner\'s dir was not removed');
});

test('a process that only names the dir, without --user-data-dir=, is not the dir\'s Chrome and survives', { timeout: 30_000 }, async () => {
  const root = sandbox();
  const gone = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise(ok => gone.once('exit', ok));
  const dir = join(root, `benchcard-smoke-${gone.pid}-tok123`);
  mkdirSync(dir);
  const bare = spawn(process.execPath, ['-e', SLEEP, '--', dir], { stdio: 'ignore', detached: true });
  const sub = spawn(process.execPath, ['-e', SLEEP, '--', `${dir}/Crashpad`], { stdio: 'ignore', detached: true });
  for (const p of [bare, sub]) { pidsToKill.add(p.pid); groupsToKill.add(p.pid); }
  const exact = standIn(dir);              // control: the real token
  await Promise.all([visible(exact.pid), waitFor(() => ps().some(p => p.pid === bare.pid && p.command.includes(dir)) && ps().some(p => p.pid === sub.pid && p.command.includes(dir)), 10_000, 'bystanders to be listed')]);
  await reapOrphans(root);
  await waitFor(() => !alive(exact.pid) || ps().find(p => p.pid === exact.pid)?.command.includes('<defunct>'), 5_000, 'exact stand-in to die');
  assert.ok(alive(bare.pid), 'a process whose argv merely names the dir path was killed');
  assert.ok(alive(sub.pid), 'a process whose argv names a path inside the dir was killed');
  assert.ok(!existsSync(dir), 'the dead owner\'s dir was not removed');
});

test('a dir is live when its Chrome is a grandchild of the owner (a launcher that forks)', { timeout: 30_000 }, async () => {
  const root = sandbox();
  const owner = spawn(process.execPath, ['-e', `
    const fs = require('fs'), cp = require('child_process'), path = require('path');
    const dir = fs.mkdtempSync(path.join(process.argv[1], 'benchcard-smoke-' + process.pid + '-'));
    const mid = cp.spawn(process.execPath, ['-e', \`
      require('child_process').spawn(process.execPath, ['-e', '${SLEEP}', '--', '--user-data-dir=' + process.env.D], { stdio: 'ignore' });
      ${SLEEP};\`], { stdio: 'ignore', env: { ...process.env, D: dir } });
    console.log(JSON.stringify({ dir, mid: mid.pid }));
    ${SLEEP};`, root], { stdio: ['ignore', 'pipe', 'inherit'], detached: true });
  pidsToKill.add(owner.pid); groupsToKill.add(owner.pid);
  const line = await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('owner stand-in printed nothing in 10s')), 10_000);
    owner.stdout.once('data', d => { clearTimeout(t); ok(String(d)); });
  });
  const { dir, mid } = JSON.parse(line);
  await waitFor(() => ps().find(p => p.command.includes(`--user-data-dir=${dir}`)), 10_000, 'the grandchild to be listed');
  const grand = ps().find(p => p.command.includes(`--user-data-dir=${dir}`));
  assert.equal(grand.ppid, mid, 'precondition: the Chrome stand-in is not the owner\'s direct child');
  const r = await reapOrphans(root);
  assert.ok(alive(grand.pid), 'a live owner\'s forked Chrome was killed by the sweep');
  assert.ok(existsSync(dir), 'a live owner\'s profile dir was removed');
  assert.deepEqual(r.kept, [dir]);
});

test('an owner PID reused by an unrelated live process does not protect the dir', { timeout: 30_000 }, async () => {
  const root = sandbox();
  const stranger = sleeper();                       // alive, but not the parent of the dir's process
  await visible(stranger.pid);
  const dir = join(root, `benchcard-smoke-${stranger.pid}-reuse1`);
  mkdirSync(dir);
  const orphan = standIn(dir);                      // its parent is this test, not `stranger`
  await visible(orphan.pid);
  const r = await reapOrphans(root);
  await waitFor(() => !ps().some(p => p.pid === orphan.pid && !p.command.includes('<defunct>')), 5_000, 'orphan to die').catch(() => {});
  assert.ok(!ps().some(p => p.pid === orphan.pid && !p.command.includes('<defunct>')), 'the process under a reused owner PID was not reaped');
  assert.ok(alive(stranger.pid), 'the unrelated live process that reused the PID was killed');
  assert.deepEqual(r.reaped, [dir]);
});

test('old-format and foreign dirs are not touched', async () => {
  const root = sandbox();
  mkdirSync(join(root, 'benchcard-smoke-OLD123'));
  mkdirSync(join(root, 'something-else'));
  await reapOrphans(root);
  assert.deepEqual(readdirSync(root).sort(), ['benchcard-smoke-OLD123', 'something-else']);
});

test('the sweep never throws', async () => {
  await assert.doesNotReject(reapOrphans(join(sandbox(), 'does-not-exist')));
});

/* ---------- a real smoke run SIGKILLed, then a real launch() (items 1-3) ---------- */

function startSmoke(root, extraEnv = {}) {
  const p = spawn(process.execPath, [SMOKE, '--only', 'rich fixture is live', '--timeout', '3'], {
    cwd: CWD, stdio: 'ignore',
    env: { ...process.env, ...extraEnv, TMPDIR: root, TMP: root, TEMP: root },
  });
  pidsToKill.add(p.pid);
  return p;
}
const profileDir = root => readdirSync(root).filter(n => /^benchcard-smoke-\d+-/.test(n)).map(n => join(root, n))[0];
const midBoot = root => waitFor(() => { const d = profileDir(root); return d && naming(d).length ? d : null; }, 30_000, 'a process naming the profile dir');
const midPage = root => waitFor(async () => {
  const d = profileDir(root);
  if (!d) return null;
  try {
    const port = Number(readFileSync(join(d, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return list.some(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:')) ? d : null;
  } catch { return null; }
}, 45_000, 'the run\'s page on its http://127.0.0.1 origin');

async function nextLaunch(root) {
  process.env.TMPDIR = root;
  const c = await launch(0, false);
  await closeChrome(c.proc, c.dir);
}

for (const [name, reach, env] of [
  ['mid-boot', midBoot, {}],
  ['mid-page', midPage, { BENCHCARD_SMOKE_HANG: 'rich fixture is live' }],
]) {
  test(`a smoke run SIGKILLed ${name} leaves no Chrome after the next launch()`, { timeout: 120_000, ...NEEDS_CHROME }, async () => {
    const root = sandbox();
    const run = startSmoke(root, env);
    const dir = await reach(root);
    run.kill('SIGKILL');
    await new Promise(ok => run.once('exit', ok));
    await new Promise(r => setTimeout(r, 500));
    assert.ok(naming(dir).length, 'precondition: Chrome should outlive its SIGKILLed owner (the bug)');
    await nextLaunch(root);
    assert.deepEqual(naming(dir).map(p => p.command.slice(0, 80)), [], `Chrome from the SIGKILLed run (${name}) still runs after launch()`);
    assert.ok(!existsSync(dir), `the SIGKILLed run's profile dir (${name}) was left behind`);
  });
}

test('a smoke run still going is not disturbed by another launch()', { timeout: 120_000, ...NEEDS_CHROME }, async () => {
  const root = sandbox();
  const run = startSmoke(root, { BENCHCARD_SMOKE_HANG: 'rich fixture is live' });
  const dir = await midPage(root);
  const before = naming(dir).map(p => p.pid).sort();
  assert.ok(before.length, 'precondition: the live run has Chrome processes');
  await nextLaunch(root);
  const still = naming(dir).map(p => p.pid);
  assert.ok(before.every(pid => still.includes(pid)), 'another launch() killed a Chrome whose owner is alive');
  assert.ok(existsSync(dir), 'another launch() removed a live run\'s profile dir');
  run.kill('SIGTERM');                                  // the run closes its own Chrome
  await Promise.race([new Promise(ok => run.once('exit', ok)), new Promise(ok => setTimeout(ok, 20_000))]);
});
