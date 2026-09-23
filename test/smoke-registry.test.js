/* #124's own guard, named in its spec's Proof section as the seam for "What
 * would settle it" items 1-3: adding a smoke check should mean writing its
 * module and one entry in `scripts/smoke/registry.mjs`, and touching nothing
 * else. That is an invariant about the SHAPE of the harness's source, not a
 * behavior a browser run exercises, so — per `/new-guard` — it is proven by
 * reading the source, not by running it, and is written down here as a guard
 * rather than folded into a behavior test.
 *
 * Three things are asserted, matching the three item numbers:
 *   1. `scripts/smoke.mjs` imports nothing from `./smoke/` except the five
 *      shared modules every check needs (chrome, dom, fixtures, registry,
 *      card-at-32) — no per-check module, no `RUN` map, no `safeCheck(...)`,
 *      and no reshuffle filter that names a row by hand.
 *   2. No module under `scripts/smoke/` other than `registry.mjs` and
 *      `card-at-32.mjs` imports `registry.mjs`, and no check module calls
 *      `nameOf`.
 *   3. Every module under `scripts/smoke/` that exports a function named
 *      `...Pass` is the `run` of exactly one row in `registry.mjs`'s `ROWS`
 *      — `card-at-32.mjs`'s `cardAt32Pass` is the one named exception, since
 *      it edits the cold `cardsize` row in place rather than being a row of
 *      its own.
 *
 * Rule 2a: every assertion below counts what it found before judging it, so
 * a walk that silently found nothing (a renamed directory, a regex that stopped
 * matching) fails loudly instead of reading as "nothing wrong here".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SMOKE_DIR = join(ROOT, 'scripts', 'smoke');
const SMOKE_ENTRY = join(ROOT, 'scripts', 'smoke.mjs');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const SMOKE_FILES = walk(SMOKE_DIR);
// Rule 2a: fail loudly if the directory this whole file is about stopped
// resolving, rather than let every assertion below pass vacuously over zero
// files.
assert.ok(SMOKE_FILES.length >= 30,
  `expected at least 30 .mjs files under scripts/smoke/, found ${SMOKE_FILES.length} — ` +
  'a guard that measured nothing must fail, not pass');

// One path -> source map, read once, that every test below shares. Before
// this, offendersMatching's two callers and the ...Pass scan each re-read
// every file under scripts/smoke/ from disk, up to four reads per file for a
// single `npm test` run.
const fileSrc = new Map(SMOKE_FILES.map(f => [relative(SMOKE_DIR, f), readFileSync(f, 'utf8')]));

/* ---------- item 1: smoke.mjs's own imports ---------- */

const smokeSrc = readFileSync(SMOKE_ENTRY, 'utf8');

test('scripts/smoke.mjs imports only the five shared ./smoke/ modules, no per-check module', () => {
  const imported = [...smokeSrc.matchAll(/from\s+'(\.\/smoke\/[^']+)'/g)].map(m => m[1]);
  assert.ok(imported.length > 0, 'found no ./smoke/ imports in scripts/smoke.mjs — the regex or the file moved');
  const allowed = new Set([
    './smoke/chrome.mjs', './smoke/dom.mjs', './smoke/fixtures.mjs',
    './smoke/registry.mjs', './smoke/card-at-32.mjs',
  ]);
  const extra = [...new Set(imported)].filter(p => !allowed.has(p));
  assert.deepEqual(extra, [],
    `scripts/smoke.mjs imports from ./smoke/ paths outside the five allowed ones: ${extra.join(', ')} — ` +
    'a check module belongs in registry.mjs\'s own import list, not smoke.mjs\'s');
});

test('scripts/smoke.mjs carries no RUN map, no safeCheck, no hand-named reshuffle filter', () => {
  assert.doesNotMatch(smokeSrc, /\bRUN\s*=\s*\{/,
    'scripts/smoke.mjs still builds a RUN map — registry.mjs\'s own rows now carry their run');
  assert.doesNotMatch(smokeSrc, /\bsafeCheck\s*\(/,
    'scripts/smoke.mjs still calls safeCheck — the one runner (runCheck) replaces it for the full run and --only alike');
  // The six rows that replace a cold verdict named their own cold name by
  // hand here before #124; after it, the name lives once, in the row's own
  // `replaces` in registry.mjs.
  const HAND_NAMED_RESHUFFLES = [
    'settings rows ≥ 48px', "who's here rows ≥ 48px", 'plan sheet controls ≥ 48px',
    'today and game controls ≥ 48px', "startsWith('plan rows'",
  ];
  for (const needle of HAND_NAMED_RESHUFFLES) {
    assert.ok(!smokeSrc.includes(needle),
      `scripts/smoke.mjs still names "${needle}" directly — that reshuffle belongs in the row's own ` +
      '`replaces` in registry.mjs');
  }
});

/* ---------- item 2: only registry.mjs and card-at-32.mjs may import it ---------- */

const REGISTRY_IMPORT_ALLOWED = new Set(['registry.mjs', 'card-at-32.mjs']);

// Both tests below walk the same map with the same allow-list, differing
// only in the pattern that makes a file an offender — one loop, not two, and
// no re-read of any file (fileSrc was built once, above).
function offendersMatching(pattern) {
  const offenders = [];
  for (const [base, src] of fileSrc.entries()) {
    if (REGISTRY_IMPORT_ALLOWED.has(base)) continue;
    if (pattern.test(src)) offenders.push(base);
  }
  return offenders;
}

test('no module under scripts/smoke/ except registry.mjs and card-at-32.mjs imports registry.mjs', () => {
  const offenders = offendersMatching(/from\s+'\.\/registry\.mjs'/);
  assert.deepEqual(offenders, [],
    `these modules import registry.mjs directly, which is only allowed for registry.mjs itself and ` +
    `card-at-32.mjs (the one row it edits in place, not a registry entry): ${offenders.join(', ')} — ` +
    'read the sizes they need from sizes.mjs instead');
});

test('no check module under scripts/smoke/ calls nameOf', () => {
  const offenders = offendersMatching(/\bnameOf\s*\(/);
  assert.deepEqual(offenders, [],
    `these modules still call nameOf: ${offenders.join(', ')} — a check returns { pass, detail } and the ` +
    'harness (runCheck, from the row it ran) adds the name');
});

/* ---------- item 3: every ...Pass is exactly one registry row's run ---------- */

test('every exported ...Pass function is the run of exactly one registry row, except card-at-32.mjs\'s own exception', async () => {
  const found = [];
  for (const [base, src] of fileSrc.entries()) {
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+Pass)\s*\(/g)) {
      found.push({ name: m[1], file: base });
    }
  }
  assert.ok(found.length >= 30,
    `found only ${found.length} exported ...Pass function(s) across scripts/smoke/ — the scan found ` +
    'almost nothing, which is not what a healthy tree looks like');

  const NAMED_EXCEPTION = { name: 'cardAt32Pass', file: 'card-at-32.mjs' };
  assert.ok(found.some(p => p.name === NAMED_EXCEPTION.name && p.file === NAMED_EXCEPTION.file),
    'card-at-32.mjs no longer exports cardAt32Pass — the named exception in the spec has moved or been renamed');
  const rows = found.filter(p => !(p.name === NAMED_EXCEPTION.name && p.file === NAMED_EXCEPTION.file));

  const { ROWS } = await import('../scripts/smoke/registry.mjs');
  assert.ok(Array.isArray(ROWS) && ROWS.length > 0, 'registry.mjs exports no ROWS — nothing here to check against');
  const runSources = ROWS.filter(r => typeof r.run === 'function').map(r => r.run.toString());
  assert.ok(runSources.length >= 30,
    `only ${runSources.length} row(s) in ROWS carry a run — expected the bulk of the registry to`);

  const inRegistryCount = name => runSources.filter(src => src.includes(`${name}(`)).length;

  // A ...Pass function can also be a helper another check's own module calls
  // rather than a row of its own — `plan-closes.mjs`'s `planClosePass` runs
  // inside `planSheetPass`'s try block, sharing its `ck`, because #73 split it
  // out of `plan-sheet.mjs` when that file reached the size ceiling. So a
  // function counts as wired if it is EITHER exactly one registry row's run,
  // OR reachable from exactly one OTHER `...Pass` function that is itself
  // reachable this way — checked to a fixed point, not just one hop.
  //
  // A single hop ("called from exactly one other module's source") is not
  // enough: it is not transitive, so two ...Pass functions that mention only
  // each other (neither ever reached from a registry row) would each read as
  // "called from exactly one other module" and both pass, though neither is
  // wired into anything a full run executes. It is also not selective about
  // WHO is doing the calling: any other file's source counts, including a
  // module with no ...Pass export of its own, so a stray comment mentioning a
  // removed row's function name (e.g. `wakeLockPass(` typed in a neighboring
  // module's comment after `wakelock` was dropped from ROWS) would pass too.
  // Seeding the reachable set from the registry and only ever accepting a new
  // member on account of an ALREADY-reachable ...Pass function's own source
  // closes both holes: an orphaned pair never bootstraps itself into
  // reachability, and a comment in a module that exports no ...Pass function
  // at all is never treated as a caller.
  const key = p => `${p.name}\u0000${p.file}`;
  const reachable = new Map(rows.map(p => [key(p), inRegistryCount(p.name) === 1]));

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of rows) {
      const k = key(p);
      if (reachable.get(k)) continue;
      if (inRegistryCount(p.name) !== 0) continue; // 0 registry rows is the only case a caller can rescue
      const callers = rows.filter(q => key(q) !== k && reachable.get(key(q)) &&
        fileSrc.get(q.file).includes(`${p.name}(`));
      if (callers.length === 1) {
        reachable.set(k, true);
        changed = true;
      }
    }
  }

  for (const p of rows) {
    const inRegistry = inRegistryCount(p.name);
    if (inRegistry === 1) continue;
    if (inRegistry === 0 && reachable.get(key(p))) continue;
    const callers = rows.filter(q => key(q) !== key(p) && reachable.get(key(q)) &&
      fileSrc.get(q.file).includes(`${p.name}(`));
    assert.fail(
      `${p.name} (${p.file}) is wired into ${inRegistry} registry row run(s) and reachable from ` +
      `${callers.length} other already-reachable ...Pass module(s), want exactly one of the two — ` +
      (inRegistry === 0 && callers.length === 0
        ? 'it is missing from registry.mjs entirely, and no already-reachable ...Pass module calls it'
        : 'it is wired into more than one place, so a rename would leave one silently orphaned'));
  }
});
