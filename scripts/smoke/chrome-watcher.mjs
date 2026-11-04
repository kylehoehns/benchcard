/* #595: the watcher `launch()` starts beside each Chrome. Run as
   `node chrome-watcher.mjs <chrome-pid> <profile-dir>`, with a pipe on stdin
   that the owner never writes to. When the owner exits for any reason (normal
   exit, crash, SIGKILL) the OS closes the pipe, this process reads end-of-file,
   and it cleans up after the owner: kill Chrome's process group if it is still
   alive (SIGTERM, then SIGKILL after a wait), wait for the group to be gone,
   and remove the profile dir with retries, as `closeChrome` does. `closeChrome`
   ends the pipe itself after its own cleanup, so then this finds nothing left
   and just exits.

   The dir is a plain argument, never a `--user-data-dir=<dir>` token:
   `reapOrphans` takes a process carrying that token for the dir's Chrome, and
   must not mistake this one for it. Chrome's pid is its process group id,
   because `launch()` spawns Chrome detached. */
import { rm } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

const [pidArg, dir] = process.argv.slice(2);
const group = Number(pidArg);
if (!Number.isInteger(group) || group <= 1 || !dir) {
  console.error('usage: chrome-watcher.mjs <chrome-pid> <profile-dir>');
  process.exit(2);
}

const groupGone = () => { try { process.kill(-group, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
const kill = sig => { try { process.kill(-group, sig); } catch { /* gone */ } };
async function waitGone(ms) {
  for (const end = Date.now() + ms; ; await sleep(50)) {
    if (groupGone()) return true;
    if (Date.now() >= end) return false;
  }
}

let cleaning = false;
async function cleanUp() {
  if (cleaning) return;
  cleaning = true;
  if (!groupGone()) {
    kill('SIGTERM');
    if (!(await waitGone(5000))) { kill('SIGKILL'); await waitGone(3000); }
  }
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
  process.exit(0);
}

process.stdin.on('error', cleanUp);
process.stdin.on('end', cleanUp);
process.stdin.on('close', cleanUp);
process.stdin.resume();
