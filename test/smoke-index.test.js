/* #181's own guard, named in its spec's Proof section as the seam for "What
 * would settle it" items 1-5: `scripts/smoke/README.md` is a VIEW of
 * `scripts/smoke/registry.mjs`'s `ROWS`, not a second list of checks, so
 * this test holds every column it can derive against `ROWS` itself
 * (imported, not re-parsed) and the registry's own import lines — never a
 * hand-written copy of the row list.
 *
 * Three columns, three checks:
 *   Check   — the README's rows, in order, must be exactly `ROWS.map(r =>
 *             r.name)`, in order.
 *   File    — for a row with a `run`, the module `String(row.run)` calls,
 *             derived from `registry.mjs`'s own `import { xPass } from
 *             './x.mjs'` lines (never hand-listed here). For the thirteen
 *             rows with no `run` (the five non-selectable rows plus the
 *             eight `cold` rows), every path the README names for it must
 *             exist on disk.
 *   Fixture — derived from the row's own `setup`: `cold` -> `SEED`, `rich`
 *             -> `RICH`, `null` -> `whole run`.
 *
 * Rule 2a: a table that parses to zero rows fails loudly rather than passing
 * vacuously.
 *
 * STATES THIS WAS RUN AGAINST (per /new-guard step 2, each induced by hand
 * in a scratch copy of the README and reverted, not kept as fixtures here):
 *   - a `ROWS` entry with no README row (deleted one row's line) -> failed
 *     on "missing from the README: ...";
 *   - a README row with no `ROWS` entry (duplicated a row's line and
 *     changed its name) -> failed on "in the README but not in ROWS: ...";
 *   - a renamed check (edited one Check cell's text) -> failed the same way,
 *     both a missing and an extra name;
 *   - a wrong File (changed `cardfont`'s File cell to a different module)
 *     -> failed on "README says ... registry.mjs says ...";
 *   - a wrong Fixture (changed a `rich` row's Fixture cell to `SEED`) ->
 *     failed on "README says SEED, setup 'rich' means RICH";
 *   - rows out of order (swapped two adjacent rows) -> failed on "misplaced
 *     at index ...";
 *   - the table deleted outright (removed everything after the intro) ->
 *     failed on "parsed 0 rows".
 *   The finished tree passes all of the above.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const README_PATH = join(ROOT, 'scripts', 'smoke', 'README.md');
const REGISTRY_PATH = join(ROOT, 'scripts', 'smoke', 'registry.mjs');

const { ROWS } = await import('../scripts/smoke/registry.mjs');
assert.ok(Array.isArray(ROWS) && ROWS.length > 0, 'registry.mjs exports no ROWS — nothing here to check against');

const readmeSrc = readFileSync(README_PATH, 'utf8');

/* Split a table row's cells on unescaped `|`, restoring `\|` to a literal
 * pipe inside each cell afterwards -- the only cell that legitimately holds
 * one is Check, for the `timelinecardsheet` row's "Timeline | Card". */
function splitRow(line) {
  const PLACEHOLDER = '\u0000';
  const cells = line.replace(/\\\|/g, PLACEHOLDER).split('|').map(c => c.trim());
  if (cells[0] === '') cells.shift();
  if (cells.at(-1) === '') cells.pop();
  return cells.map(c => c.replaceAll(PLACEHOLDER, '|'));
}

const stripBackticks = s => s.replace(/^`(.*)`$/, '$1');

function parseTable(md) {
  const lines = md.split('\n');
  const headerIdx = lines.findIndex(l => /^\s*\|\s*-{3,}/.test(l));
  if (headerIdx === -1) return [];
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    const cells = splitRow(line);
    if (cells.length < 3) continue;
    rows.push({
      check: stripBackticks(cells[0]),
      files: [...cells[1].matchAll(/`([^`]+)`/g)].map(m => m[1]),
      fixture: cells[2],
    });
  }
  return rows;
}

const parsed = parseTable(readmeSrc);
// Rule 2a: a table that parses to zero rows is a broken guard, not a clean
// result -- fail loudly instead of every assertion below passing vacuously.
assert.ok(parsed.length > 0, `scripts/smoke/README.md's table parsed 0 rows — table missing or malformed`);
const byName = new Map(parsed.map(r => [r.check, r]));

test('every row in the README table is exactly one ROWS entry, in ROWS order', () => {
  const expected = ROWS.map(r => r.name);
  const actual = parsed.map(r => r.check);
  const missing = expected.filter(n => !actual.includes(n));
  assert.deepEqual(missing, [], `missing from the README: ${missing.join(', ')}`);
  const extra = actual.filter(n => !expected.includes(n));
  assert.deepEqual(extra, [], `in the README but not in ROWS: ${extra.join(', ')}`);
  assert.equal(actual.length, expected.length,
    `README has ${actual.length} rows, ROWS has ${expected.length} — same names but a different count`);
  for (let i = 0; i < expected.length; i++) {
    assert.equal(actual[i], expected[i], `misplaced at index ${i}: README says "${actual[i]}", ROWS order says "${expected[i]}"`);
  }
});

/* Build `function name -> file` straight from registry.mjs's own import
 * lines, per the spec's "reuse, do not re-derive": every named import from a
 * './x.mjs' path is a check module's own exported ...Pass function. */
const registrySrc = readFileSync(REGISTRY_PATH, 'utf8');
const funcToFile = new Map();
for (const m of registrySrc.matchAll(/import\s*\{\s*(\w+)\s*\}\s*from\s*'\.\/([^']+)'/g)) {
  funcToFile.set(m[1], m[2]);
}
assert.ok(funcToFile.size > 30, `found only ${funcToFile.size} named imports in registry.mjs — the regex or the file moved`);

test('every row with a run names the exact module its run calls', () => {
  for (const row of ROWS) {
    if (typeof row.run !== 'function') continue;
    const runSrc = String(row.run);
    const called = [...funcToFile.keys()].filter(name => new RegExp(`\\b${name}\\(`).test(runSrc));
    assert.equal(called.length, 1,
      `${row.name}'s run calls ${called.length} known check function(s), want exactly 1 — the run or the import map changed shape`);
    const expectedFile = `scripts/smoke/${funcToFile.get(called[0])}`;
    const readmeRow = byName.get(row.name);
    assert.ok(readmeRow, `${row.name} has no README row to check its File cell`);
    assert.deepEqual(readmeRow.files, [expectedFile],
      `${row.name}: README says File is ${JSON.stringify(readmeRow.files)}, registry.mjs says it should be ["${expectedFile}"]`);
  }
});

test('every row with no run names files that exist', () => {
  const noRunRows = ROWS.filter(r => typeof r.run !== 'function');
  assert.ok(noRunRows.length > 0, 'found no no-run rows in ROWS — nothing here to check');
  for (const row of noRunRows) {
    const readmeRow = byName.get(row.name);
    assert.ok(readmeRow, `${row.name} has no README row to check its File cell`);
    assert.ok(readmeRow.files.length > 0, `${row.name}'s File cell names no files`);
    for (const f of readmeRow.files) {
      assert.ok(existsSync(join(ROOT, f)), `${row.name}'s File cell names ${f}, which does not exist`);
    }
  }
});

test('every row\'s Fixture matches its setup', () => {
  const expectedFixture = setup => setup === 'cold' ? 'SEED' : setup === 'rich' ? 'RICH' : 'whole run';
  for (const row of ROWS) {
    const readmeRow = byName.get(row.name);
    assert.ok(readmeRow, `${row.name} has no README row to check its Fixture cell`);
    const want = expectedFixture(row.setup);
    assert.equal(readmeRow.fixture, want,
      `${row.name}: README says Fixture is "${readmeRow.fixture}", setup ${JSON.stringify(row.setup)} means "${want}"`);
  }
});
