/* #595: `node scripts/serve.mjs` stops by itself -- when the process that
 * started it goes away, and after `--ttl` minutes. Judged the way a lane would
 * see it: a real child process, and whether its port still answers.
 * Safety: every pid this file spawns is killed in `after`, by pid only. */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const SERVE = fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url));
const pids = new Set();

after(() => { for (const p of pids) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } } });

const freePort = () => new Promise((ok, fail) => {
  const s = createServer();
  s.once('error', fail);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

/* true if something answers HTTP on the port, false if the connection is refused */
const answers = port => new Promise(ok => {
  const req = request({ host: '127.0.0.1', port, path: '/e', method: 'GET', timeout: 1000 }, res => { res.resume(); ok(true); });
  req.on('timeout', () => { req.destroy(); ok(false); });
  req.on('error', () => ok(false));
  req.end();
});

async function waitFor(fn, ms, what) {
  for (const end = Date.now() + ms; ; await new Promise(r => setTimeout(r, 50))) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out after ${ms}ms waiting for ${what}`);
  }
}
/* A process that has exited but not been reaped is a zombie, and signal 0
   still reaches it. The server here is orphaned when its parent is killed, so
   it is reaped by whatever runs as pid 1, and in Cloudflare's build container
   that does not reap: the server exited at once (its port refused) and stayed
   a zombie past 5s, failing the production build. On Linux, read its state;
   elsewhere (macOS has no /proc, and launchd reaps) signal 0 is the answer. */
const zombie = pid => { try { return readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /s, '')[0] === 'Z'; } catch { return false; } };
const alive = pid => { try { process.kill(pid, 0); } catch (e) { return e.code === 'EPERM'; } return !zombie(pid); };

function startServe(args) {
  const p = spawn(process.execPath, [SERVE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  pids.add(p.pid);
  p.out = ''; p.err = '';
  p.stdout.on('data', d => { p.out += d; });
  p.stderr.on('data', d => { p.err += d; });
  p.done = new Promise(ok => p.once('exit', (code, sig) => ok({ code, sig })));
  return p;
}
const raceExit = (p, ms) => Promise.race([p.done, new Promise(ok => setTimeout(() => ok(null), ms))]);

test('a server whose starting process is SIGKILLed stops listening within 5s (item 1)', { timeout: 30_000 }, async () => {
  const port = await freePort();
  const parent = spawn(process.execPath, ['-e', `
    const c = require('child_process').spawn(process.execPath, [process.argv[1], process.argv[2]], { stdio: 'ignore' });
    console.log(c.pid);
    setInterval(() => {}, 1e6);`, SERVE, String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  pids.add(parent.pid);
  const server = Number(await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('intermediate parent printed no pid in 10s')), 10_000);
    parent.stdout.once('data', d => { clearTimeout(t); ok(String(d).trim()); });
  }));
  pids.add(server);
  await waitFor(() => answers(port), 10_000, 'the server to answer');
  parent.kill('SIGKILL');
  await new Promise(ok => parent.once('exit', ok));
  await waitFor(async () => !(await answers(port)), 5_000, 'the port to refuse after its parent was killed');
  await waitFor(() => !alive(server), 5_000, 'the server process to exit');
});

test('--ttl 0.02 ends the server within 5s; a live one is still answering at 2s (item 2)', { timeout: 30_000 }, async () => {
  const live = await freePort();
  const keeper = startServe([String(live), '--ttl', '60']);
  await waitFor(() => answers(live), 10_000, 'the long-TTL server to answer');
  const port = await freePort();
  const short = startServe([String(port), '--ttl', '0.02']);
  await waitFor(() => short.out.includes('serving app') || short.exitCode !== null, 10_000, 'the short-TTL server to announce itself');
  const exit = await raceExit(short, 5_000);
  assert.ok(exit, `--ttl 0.02 server was still running after 5s (stdout: ${short.out})`);
  assert.equal(await answers(port), false, 'the port still answers after the TTL server exited');
  assert.equal(await answers(live), true, 'a server with its parent alive and TTL not reached stopped answering');
  assert.equal(keeper.exitCode, null);
});

test('a server with its parent alive and TTL not reached still answers after 2s (item 2)', { timeout: 30_000 }, async () => {
  const port = await freePort();
  const s = startServe([port, '--ttl', '60'].map(String));
  await waitFor(() => answers(port), 10_000, 'the server to answer');
  await new Promise(r => setTimeout(r, 2000));
  assert.equal(await answers(port), true, 'the server stopped answering with parent alive and TTL not reached');
  assert.equal(s.exitCode, null);
});

test('the port and --ttl may come in either order', { timeout: 30_000 }, async () => {
  const port = await freePort();
  const s = startServe(['--ttl', '60', String(port)]);
  await waitFor(() => answers(port), 10_000, 'the server to answer on the port given after --ttl');
  assert.equal(s.exitCode, null);
});

for (const [label, args] of [
  ['a non-number', ['--ttl', 'abc']],
  ['zero', ['--ttl', '0']],
  ['a negative', ['--ttl', '-1']],
  ['a missing value', ['--ttl']],
]) {
  test(`--ttl with ${label} exits 2 naming --ttl, and never listens (item 3)`, { timeout: 30_000 }, async () => {
    const port = await freePort();
    const s = startServe([String(port), ...args]);
    const exit = await raceExit(s, 10_000);
    assert.ok(exit, 'serve.mjs kept running with a bad --ttl');
    assert.equal(exit.code, 2, `expected exit 2, got ${exit.code} (stderr: ${s.err})`);
    assert.match(s.err, /--ttl/, 'the message does not name --ttl');
    assert.equal(await answers(port), false, 'serve.mjs listened despite a bad --ttl');
    assert.ok(!/serving app/.test(s.out), 'serve.mjs announced it was serving');
  });
}

test('--ttl=0.02 behaves like --ttl 0.02: the server ends within 5s', { timeout: 30_000 }, async () => {
  const port = await freePort();
  const s = startServe([String(port), '--ttl=0.02']);
  const exit = await raceExit(s, 5_000);
  assert.ok(exit, `--ttl=0.02 server was still running after 5s (stdout: ${s.out})`);
  assert.equal(exit.code, 0);
});

test('an unknown -- argument exits 2 naming it, and never listens', { timeout: 30_000 }, async () => {
  const port = await freePort();
  const s = startServe([String(port), '--bogus']);
  const exit = await raceExit(s, 10_000);
  assert.ok(exit, 'serve.mjs kept running with an unknown argument');
  assert.equal(exit.code, 2, `expected exit 2, got ${exit.code} (stderr: ${s.err})`);
  assert.match(s.err, /--bogus/);
  assert.equal(await answers(port), false, 'serve.mjs listened despite an unknown argument');
});
