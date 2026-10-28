/* #357 guard. Reads source, so it is a guard (/new-guard), not a behavior test:
 * the behavior of the shared walker is test/smoke-overflow.test.js.
 *
 * Three things the smoke rows must not drift back to, each of which once
 * existed as several private copies that disagreed:
 *   1. a loop over `document.body.querySelectorAll('*')` or an `overflowX`
 *      ancestor walk in narrow.mjs / sweep.mjs -- the walker is dom.mjs's;
 *   2. an element name built from `tagName.toLowerCase() + ...` anywhere under
 *      scripts/smoke/ or in smoke-checks.js, other than `DESCRIBE_EL`;
 *   3. a read of `window.__SMOKE_VIEWPORT` in narrow.mjs, sweep.mjs or
 *      width-sweep.mjs -- page-state.mjs reads it once.
 * Comments are dropped first, so a note that names the old way is not a hit.
 * Rule 2a: each scan asserts it read files, and the one place each thing is
 * allowed to live must contain it, or the scan has measured nothing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const SMOKE = new URL('../scripts/smoke/', import.meta.url);
const read = url => readFileSync(url, 'utf8');
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const smokeFiles = () => readdirSync(SMOKE).filter(f => f.endsWith('.mjs')).map(f => ({ name: `scripts/smoke/${f}`, src: code(read(new URL(f, SMOKE))) }));
const checks = () => ({ name: 'scripts/smoke-checks.js', src: code(read(new URL('../scripts/smoke-checks.js', import.meta.url))) });

const NAMER = /tagName\.toLowerCase\(\)\s*\+/g;

test('no element name is built from tagName.toLowerCase() except DESCRIBE_EL', () => {
  const files = [...smokeFiles(), checks()];
  assert.ok(files.length > 40, `read only ${files.length} files`);
  const dom = files.find(f => f.name === 'scripts/smoke/dom.mjs');
  assert.equal(dom.src.match(NAMER)?.length, 1, 'dom.mjs should hold exactly one namer, DESCRIBE_EL');
  const named = files.filter(f => f !== dom).filter(f => (f.src.match(NAMER) || []).length).map(f => f.name);
  assert.deepEqual(named, [], `build the name with DESCRIBE_EL instead: ${named.join(', ')}`);
});

test('smoke-checks.js gets its namer from the page global smoke.mjs injects', () => {
  const checksSrc = checks().src;
  assert.match(checksSrc, /const label = window\.__SMOKE_DESCRIBE\b/, 'label must be window.__SMOKE_DESCRIBE');
  const smoke = code(read(new URL('../scripts/smoke.mjs', import.meta.url)));
  assert.match(smoke, /window\.__SMOKE_DESCRIBE = \$\{DESCRIBE_EL\};/);
});

test('narrow.mjs and sweep.mjs carry no walk of their own', () => {
  for (const f of ['narrow.mjs', 'sweep.mjs']) {
    const src = code(read(new URL(f, SMOKE)));
    assert.ok(src.length > 500, `${f} read as nearly empty`);
    assert.doesNotMatch(src, /querySelectorAll\(\s*['"]\*['"]\s*\)/, `${f} loops over every element`);
    assert.doesNotMatch(src, /overflowX/, `${f} walks ancestors for overflow-x`);
    assert.match(src, /OVERFLOW_WALK/, `${f} does not call the shared walker`);
  }
});

test('only page-state.mjs reads window.__SMOKE_VIEWPORT among the sweep files', () => {
  const pageState = code(read(new URL('page-state.mjs', SMOKE)));
  assert.match(pageState, /window\.__SMOKE_VIEWPORT/, 'page-state.mjs no longer holds the read');
  for (const f of ['narrow.mjs', 'sweep.mjs', 'width-sweep.mjs']) {
    const src = code(read(new URL(f, SMOKE)));
    assert.ok(src.length > 500, `${f} read as nearly empty`);
    assert.doesNotMatch(src, /__SMOKE_VIEWPORT/, `${f} reads the viewport itself; use smokeViewport()`);
  }
});
