#!/usr/bin/env node
/* #596: the merge step's preview check. `merge-one.sh` runs it before
 * `gh pr merge`; it can also run alone, to post the comment from a run that
 * may not merge.
 *
 *   node scripts/lanes/preview-check.mjs <pr-number>
 *
 * 1. Waits (20 minutes at most) for the `Workers Builds: benchcard` check run
 *    to succeed on the PR's head commit. A failed build, or the cap, fails.
 * 2. Waits (5 minutes at most) until the branch alias's `/sw.js` is byte for
 *    byte the head build's own `Preview URL` `/sw.js`, so the alias serves
 *    the head commit. With no `Preview URL` in the summary it says so and
 *    relies on the check run alone.
 * 3. Picks the pages from the diff against origin/main (`viewsFor`) and runs
 *    `scripts/look.mjs` on them through `ci-slot.sh`, the shared Chrome pool.
 *    Fails on an unexcused finding or a console error from the preview's own
 *    origin. With no pages it only checks that `/` answers 200.
 * 4. Posts one PR comment either way, and exits 0 on PASS, 1 on FAIL.
 *
 * Exit 2 (#613): could not read from GitHub. The first `gh pr view` and the two
 * `git fetch` calls get 3 tries, LANES_GH_RETRY_WAIT seconds apart (default 5),
 * each retry printed; an empty headRefOid or headRefName is a failed read. A
 * build wait whose every check-runs read failed ends the same way. No comment
 * is posted, because that is not a verdict on the PR.
 *
 * Reused, not re-derived: `coachFacing` (which app/ paths a coach sees),
 * `VIEWS` (the five app views), look.mjs (shots and clip findings).
 * The pure parts are exported for test/preview-check.test.js; `main()` runs
 * only on direct invocation, so importing this launches nothing. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { coachFacing } from '../check-whats-new.mjs';
import { VIEWS } from '../smoke/sweep.mjs';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = 'kylehoehns/benchcard';
const CHECK = 'Workers Builds: benchcard';
const BUILD_CAP_MS = 20 * 60_000, BUILD_EVERY_MS = 20_000;
const ALIAS_CAP_MS = 5 * 60_000, ALIAS_EVERY_MS = 10_000;
const FETCH_MS = 15_000, GIT_MS = 120_000, GH_MS = 60_000, LOOK_MS = 60 * 60_000;
/* LOOK_MS caps a slot wait plus the run (ci-slot.sh waits for a Chrome slot
 * with no limit, then CI_SLOT_TIMEOUT bounds the run itself). */
const APP_VIEWS = VIEWS.map(v => v.name);

/* ---------- pure parts ---------- */

export const aliasUrl = branch =>
  `https://${branch.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-benchcard.kyhoehns.workers.dev`;

/* The views a diff needs shot. A page maps to itself (whats-new included,
 * though `coachFacing` calls it plumbing: it is generated, but its page is
 * what a coach reads); other coach-facing app/ paths can show on any screen,
 * so they map to the five app views. */
export function viewsFor(paths) {
  const seen = new Set();
  for (const p of paths) {
    const page = /^app\/([^/]+)\.html$/.exec(p)?.[1];
    if (page === '404') continue;
    if (page && page !== 'index') seen.add(page);
    else if (coachFacing(p)) APP_VIEWS.forEach(v => seen.add(v));
  }
  return [...seen];
}

export const notChecked = paths => paths.filter(p => p === 'app/404.html');

/* The URL actually checked: the build's own alias when the check run names
 * one (Cloudflare may shorten a long branch's), else the branch-derived one. */
export const urlToCheck = (summaryAlias, branchUrl) => summaryAlias || branchUrl;

export function lookFailure(e) {
  if (e.killed || e.signal === 'SIGTERM') return `look.mjs timed out after ${LOOK_MS / 60_000} minutes (a slot wait plus the run)`;
  return `look.mjs did not finish: ${(e.stderr || e.message).trim().split('\n').slice(-3).join(' / ')}`;
}

export function urlsFromSummary(summary) {
  const text = typeof summary === 'string' ? summary : '';
  const pick = label => new RegExp(`^${label}:\\s*(https?://\\S+)\\s*$`, 'm').exec(text)?.[1] ?? null;
  return { preview: pick('Preview URL'), alias: pick('Preview Alias URL') };
}

/* The verdict from look.mjs's measurements.json records. A run that measured
 * nothing, or a view with no shot, fails (/new-guard rule 2a). */
export function verdict(records, views) {
  const problems = [];
  if (!records.length) problems.push('no shot was taken, so nothing was measured');
  else for (const v of views) {
    if (!records.some(r => r.view === v)) problems.push(`no shot of ${v}`);
  }
  const findings = records.flatMap(r => r.findings.filter(f => f.excused === null).map(f => `${r.file}: ${f.kind} ${f.el}`));
  const consoleErrors = records.flatMap(r => r.consoleErrors.map(e => `${r.file}: ${e}`));
  return { pass: !problems.length && !findings.length && !consoleErrors.length, shots: records.length, findings, consoleErrors, problems };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function commentText(r) {
  const lines = [`Preview check: **${r.pass ? 'PASS' : 'FAIL'}**`, '', `- URL: ${r.url}`, `- Head: ${r.sha.slice(0, 7)}`];
  lines.push(r.views.length ? `- Pages checked: ${r.views.join(', ')}`
    : `- Pages checked: none (no pages changed that a coach sees)${r.answered ? `; \`/\` answered ${r.answered}` : ''}`);
  if (r.notChecked?.length) lines.push(`- Changed but not checked: ${r.notChecked.join(', ')}`);
  lines.push(`- ${plural(r.shots, 'shot')}, ${plural(r.findings.length, 'finding')}, ${plural(r.consoleErrors.length, 'console error')}`);
  if (r.reason) lines.push(`- Reason: ${r.reason}`);
  for (const p of r.problems ?? []) lines.push(`- Problem: ${p}`);
  if (r.findings.length) lines.push('', 'Findings:', ...r.findings.map(f => `- ${f}`));
  if (r.consoleErrors.length) lines.push('', 'Console errors:', ...r.consoleErrors.map(e => `- ${e}`));
  return lines.join('\n');
}

/* What waitForBuild throws at its cap. When every read failed, the build was
 * never seen, so this is a read failure (exit 2), not "did not finish". */
export function capError({ tried, failed, lastError, N, fallback }) {
  if (tried > 0 && failed === tried) return readError(N, lastError);
  return new Error(fallback);
}

function readError(N, lastError) {
  const e = new Error(`couldn't read #${N} from GitHub: ${lastError}`);
  e.unreadable = true;
  return e;
}

/* ---------- the run ---------- */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = m => console.log(`preview-check: ${m}`);
const gh = async args => (await run('gh', args, { timeout: GH_MS, maxBuffer: 20e6 })).stdout;
const git = async (...args) => (await run('git', args, { timeout: GIT_MS, maxBuffer: 20e6 })).stdout;

const lastLine = e => ((e.stderr || '').trim() || e.message).split('\n').filter(Boolean).pop() ?? 'unknown error';

/* 3 tries, LANES_GH_RETRY_WAIT seconds apart; each retry is printed. `read`
 * throws on a failed or empty answer. */
async function withRetries(N, read) {
  const wait = Number(process.env.LANES_GH_RETRY_WAIT ?? 5) * 1000;
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await read(); } catch (e) {
      last = lastLine(e);
      if (attempt < 3) { log(`read failed (attempt ${attempt} of 3): ${last}; retrying`); await sleep(wait); }
    }
  }
  throw readError(N, last);
}

async function getText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_MS), redirect: 'follow', cache: 'no-store' });
  return { status: res.status, body: res.status === 200 ? await res.text() : '' };
}

async function waitForBuild(sha, N) {
  const end = Date.now() + BUILD_CAP_MS;
  let tried = 0, failed = 0, lastError = '';
  while (Date.now() < end) {
    let found;
    tried++;
    try {
      const out = JSON.parse(await gh(['api', `repos/${REPO}/commits/${sha}/check-runs`]));
      found = out.check_runs.find(c => c.name === CHECK);
    } catch (e) { failed++; lastError = lastLine(e); log(`check-runs read failed (${lastError}); retrying`); }
    if (found?.conclusion === 'success') return found;
    if (found?.conclusion) throw new Error(`${CHECK} ${found.conclusion} on ${sha.slice(0, 7)}`);
    await sleep(BUILD_EVERY_MS);
  }
  throw capError({ tried, failed, lastError, N,
    fallback: `${CHECK} did not finish on ${sha.slice(0, 7)} within ${BUILD_CAP_MS / 60_000} minutes` });
}

async function waitForAlias(alias, preview) {
  const end = Date.now() + ALIAS_CAP_MS;
  while (Date.now() < end) {
    try {
      const [a, p] = await Promise.all([getText(`${alias}/sw.js`), getText(`${preview}/sw.js`)]);
      if (a.status === 200 && p.status === 200 && a.body === p.body) return;
    } catch (e) { log(`sw.js read failed (${e.message.split('\n')[0]}); retrying`); }
    await sleep(ALIAS_EVERY_MS);
  }
  throw new Error(`${alias}/sw.js never matched the head build's own ${preview}/sw.js within ${ALIAS_CAP_MS / 60_000} minutes`);
}

async function lookAt(alias, views) {
  const out = await mkdtemp(join(tmpdir(), 'preview-check-'));
  try {
    try {
      await run(join(HERE, 'ci-slot.sh'), ['node', resolve(HERE, '..', 'look.mjs'), '--url', alias, '--widths', '390',
        '--height', '844', '--font', '16', '--view', views.join(','), '--out', out],
      { timeout: LOOK_MS, maxBuffer: 20e6, env: { ...process.env, CI_SLOT_TIMEOUT: '900' } });
    } catch (e) {
      throw new Error(lookFailure(e));
    }
    return JSON.parse(await readFile(join(out, 'measurements.json'), 'utf8'));
  } finally { await rm(out, { recursive: true, force: true }); }
}

export async function main(argv = process.argv.slice(2)) {
  const N = argv[0];
  if (!/^\d+$/.test(N ?? '')) { console.error('usage: node scripts/lanes/preview-check.mjs <pr-number>'); return 1; }
  const notRead = e => { console.log(e.message); return 2; };
  let headRefName, sha;
  try {
    ({ headRefName, headRefOid: sha } = await withRetries(N, async () => {
      const v = JSON.parse(await gh(['pr', 'view', N, '--json', 'headRefName,headRefOid']));
      if (!v.headRefName || !v.headRefOid) throw new Error('gh returned nothing');
      return v;
    }));
  } catch (e) { if (e.unreadable) return notRead(e); throw e; }
  let url = aliasUrl(headRefName);
  const result = { url, sha, views: [], notChecked: [], shots: 0, findings: [], consoleErrors: [], problems: [], pass: false };
  try {
    await withRetries(N, () => git('fetch', '-q', 'origin', 'main'));
    await withRetries(N, () => git('fetch', '-q', 'origin', `pull/${N}/head`));
    const paths = (await git('diff', '--name-only', '--no-renames', `origin/main...${sha}`)).split('\n').filter(Boolean);
    result.views = viewsFor(paths);
    result.notChecked = notChecked(paths);

    log(`waiting for ${CHECK} on ${sha.slice(0, 7)}`);
    const built = await waitForBuild(sha, N);
    const { preview, alias } = urlsFromSummary(built.output?.summary);
    url = result.url = urlToCheck(alias, url);
    if (preview) { log(`waiting for ${url} to serve ${preview}`); await waitForAlias(url, preview); }
    else log('the check run names no Preview URL; relying on the check run alone');

    if (result.views.length) {
      log(`looking at ${result.views.join(', ')}`);
      Object.assign(result, verdict(await lookAt(url, result.views), result.views));
    } else {
      const { status } = await getText(`${url}/`);
      result.answered = status;
      result.pass = status === 200;
      if (!result.pass) result.reason = `${url}/ answered ${status}`;
    }
  } catch (e) {
    if (e.unreadable) return notRead(e);
    result.pass = false;
    result.reason = e.message.split('\n')[0];
  }
  const text = commentText(result);
  console.log(text);
  try { await run('gh', ['pr', 'comment', N, '--body', text], { timeout: GH_MS }); }
  catch (e) { console.error(`preview-check: could not post the comment: ${e.message.split('\n')[0]}`); }
  return result.pass ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().then(code => process.exit(code), e => { console.error(e.message); process.exit(1); });
}
