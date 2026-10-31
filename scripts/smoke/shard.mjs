/* #459: smoke split into parts, so CI can run them as separate jobs.

   `--shard k/n` runs the cold load and every n-th rich row (shard 1 also
   keeps the cold rows and the payload); `--shard suite` runs the unit suite
   alone; each writes a partial with `--out`. `--merge <dir>` reads every
   partial there and hands smoke.mjs the run a single process would have had,
   so the budgets, the coverage floor, the drift check and the table are
   judged on the whole run. A missing or doubled part fails the merge loudly
   rather than printing a table with a hole in it. */

export function parseShard(raw) {
  if (raw === 'suite') return { suite: true };
  const m = /^(\d+)\/(\d+)$/.exec(raw ?? '');
  const k = m && Number(m[1]), n = m && Number(m[2]);
  if (!m || n < 2 || k < 1 || k > n) {
    throw new Error(`--shard takes k/n (1 ≤ k ≤ n, n ≥ 2) or "suite", got ${JSON.stringify(raw)}`);
  }
  return { k, n };
}

/* Round-robin, so neighbouring rows (often the same screen, similar cost)
   spread across shards. Every rich row starts from `reset`, so none should
   depend on the row before it; the shards put each row after a different
   neighbour than a single run does, which is how the dark-theme row's
   dependence on its neighbour's history came to light. */
export const inShard = (rich, { k, n }) => rich.filter((_, i) => i % n === k - 1);

/* The one shape of a shard's partial, written by smoke.mjs and built by the
   tests, so the two cannot drift apart. */
export const shardPartial = ({
  shard, viewport = [390, 844], cold = [], rich = [], payload, consoleErrors = [], thirdParty = [],
  coverageNotes = { dropped: [], unseen: [] }, lines = {}, rowSeconds = [],
  tallies = { sleep: { ms: 0, calls: 0 }, settle: { ms: 0, calls: 0, capped: 0 } },
}) => ({ shard, viewport, cold, rich, payload, consoleErrors, thirdParty, coverageNotes, lines, rowSeconds, tallies });

/* The one wording of the console row, for a single run and a merge alike. */
export function consoleRow(name, consoleErrors, thirdParty) {
  return {
    name,
    pass: consoleErrors.length === 0,
    detail: consoleErrors.length
      ? consoleErrors.slice(0, 4).join(' | ')
      : `clean${thirdParty.length ? ` (${thirdParty.length} third-party, ignored)` : ''}`,
  };
}

export function mergePartials(partials, rows) {
  if (!partials.length) throw new Error('--merge: no partials found');
  const suites = partials.filter(p => p.shard.suite);
  const shards = partials.filter(p => !p.shard.suite);
  if (suites.length !== 1) throw new Error(`--merge: expected one suite partial, found ${suites.length}`);
  if (!shards.length) throw new Error('--merge: no --shard k/n partials found');
  const n = shards[0].shard.n;
  if (shards.some(p => p.shard.n !== n)) throw new Error('--merge: partials disagree on n');
  for (let k = 1; k <= n; k++) {
    const found = shards.filter(p => p.shard.k === k).length;
    if (found === 0) throw new Error(`--merge: missing shard ${k}/${n}`);
    if (found > 1) throw new Error(`--merge: shard ${k}/${n} found twice`);
  }
  shards.sort((a, b) => a.shard.k - b.shard.k);
  const order = new Map(rows.map((r, i) => [r.name, i]));
  const rank = c => order.get(c.name) ?? Infinity;
  const rich = shards.flatMap(p => p.rich).sort((a, b) => rank(a) - rank(b));
  const consoleErrors = shards.flatMap(p => p.consoleErrors);
  const thirdParty = shards.flatMap(p => p.thirdParty);
  const sum = (pick, key) => shards.reduce((t, p) => t + pick(p.tallies)[key], 0);
  return {
    viewport: shards[0].viewport,
    checks: [consoleRow(rows.find(r => r.id === 'console').name, consoleErrors, thirdParty), ...shards[0].cold, ...rich],
    payload: shards[0].payload,
    nodeRow: suites[0].nodeRow,
    lines: partials.map(p => p.lines),
    coverageNotes: {
      dropped: shards.flatMap(p => p.coverageNotes.dropped),
      unseen: shards.flatMap(p => p.coverageNotes.unseen),
    },
    rowSeconds: shards.flatMap(p => p.rowSeconds),
    tallies: {
      sleep: { ms: sum(t => t.sleep, 'ms'), calls: sum(t => t.sleep, 'calls') },
      settle: { ms: sum(t => t.settle, 'ms'), calls: sum(t => t.settle, 'calls'), capped: sum(t => t.settle, 'capped') },
    },
  };
}
