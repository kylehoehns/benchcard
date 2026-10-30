import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const TIMESTAMP = /^[^\t]*\t[^\t]*\t\S+Z /;
// gh writes colors two ways: real ESC bytes, and the literal text `^[[31m`.
const ANSI = /(?:\x1b|\^\[)\[[0-9;]*m/g;
const NODE_FAIL = /^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?ms\))?\s*$/;
const SMOKE_FAIL = /^\s*FAIL {2}(.+?)(\s{2,}|$)/;

// Names of the failing tests in one `gh run view --log-failed` log, each once,
// in first-seen order.
export function parseFailures(log) {
  const names = new Set();
  for (const line of log.split('\n')) {
    const text = line.replace(TIMESTAMP, '').replace(ANSI, '').replace(/\r$/, '');
    const m = NODE_FAIL.exec(text) || SMOKE_FAIL.exec(text);
    if (m && m[1] !== 'failing tests:') names.add(m[1]);
  }
  return [...names];
}

// One row per name: failures on main, failures on other branches, newest run
// id. A name counts once per run. Highest total first; ties keep first-seen order.
export function tally(runs) {
  const rows = new Map();
  for (const run of runs) {
    for (const name of new Set(run.names)) {
      const row = rows.get(name) || { name, main: 0, other: 0, newest: run.id };
      if (run.branch === 'main') row.main += 1;
      else row.other += 1;
      row.newest = Math.max(row.newest, run.id);
      rows.set(name, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.main + b.other - (a.main + a.other));
}

export function formatRows(rows, { read, failed }) {
  const head = `Read ${read} runs, ${failed} failed.`;
  if (!rows.length) return `${head}\nNo failing tests in these runs.`;
  const wNewest = Math.max('newest run'.length, ...rows.map((r) => String(r.newest).length));
  const lines = rows.map(
    (r) =>
      `${String(r.main).padStart(4)}  ${String(r.other).padStart(2)}  ` +
      `${String(r.newest).padStart(wNewest)}  ${r.name}`,
  );
  return [head, `main  PR  ${'newest run'.padStart(wNewest)}  name`, ...lines].join('\n');
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function reason(err) {
  if (err.code === 'ENOENT') return 'gh is not installed (https://cli.github.com)';
  const text = String(err.stderr || err.message || err).trim().split('\n')[0];
  return /auth login|not logged in/i.test(text) ? 'gh is not logged in; run `gh auth login`' : text;
}

function fetchLog(id) {
  try {
    return gh(['run', 'view', String(id), '--log-failed']);
  } catch {
    return gh(['run', 'view', String(id), '--log-failed']);
  }
}

function main(argv) {
  const i = argv.indexOf('--limit');
  const limit = i >= 0 ? Number(argv[i + 1]) : 30;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit needs a positive whole number');
  const list = JSON.parse(
    gh(['run', 'list', '--workflow', 'tests', '--limit', String(limit), '--json', 'databaseId,conclusion,headBranch']),
  );
  const failed = list.filter((r) => r.conclusion === 'failure');
  const runs = [];
  for (const r of failed) {
    try {
      runs.push({ id: r.databaseId, branch: r.headBranch, names: parseFailures(fetchLog(r.databaseId)) });
    } catch (err) {
      console.error(`flakes: skipped run ${r.databaseId}: ${reason(err)}`);
    }
  }
  console.log(formatRows(tally(runs), { read: list.length, failed: failed.length }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`flakes: ${reason(err)}`);
    process.exit(1);
  }
}
