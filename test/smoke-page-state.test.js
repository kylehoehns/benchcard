/* #125's own Proof seams 1 and 2.
 *
 * Seam 1 (pure, built with `/tdd`): `planLanding` is a pure function with no
 * CDP call in it, so its rules from the spec's Design section -- an empty
 * `want` resolves to `BASELINE`, what each kind of `record` writes, unknown
 * fields and unsupported versions throw -- are `node --test` assertions
 * directly against its return value, not against a running browser.
 *
 * Seam 2 (source-reading, built under `/new-guard`): during the migration,
 * only `page-state.mjs` may call the four CDP methods a check used to call by
 * hand, or read `document.fonts.ready` -- everywhere else is pinned to
 * today's count by an allow-list that shrinks every slice and never grows
 * (`AGENTS.md`'s rule for allow maps). Rule 2a: the walk counts what it found
 * before judging it, so a walk that silently found nothing fails loudly
 * instead of reading as a clean tree. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pageState from '../scripts/smoke/page-state.mjs';
import { ROWS } from '../scripts/smoke/registry.mjs';

const { planLanding, BASELINE } = pageState;
import { RICH, SEED } from '../scripts/smoke/fixtures.mjs';
import { LOCALSTORAGE_WIPE } from '../scripts/smoke/dom.mjs';

/* ---------- seam 1: planLanding, the pure half ---------- */

test('planLanding: an empty want resolves to BASELINE', () => {
  const { state } = planLanding({});
  assert.deepStrictEqual(state, BASELINE);
});

test('planLanding: a v7 record writes v7 and removes v3 and .bak', () => {
  const { script } = planLanding({ record: RICH });
  assert.match(script, /localStorage\.removeItem\('benchcard\.v3'\)/);
  assert.match(script, /localStorage\.removeItem\('benchcard\.v7\.bak'\)/);
  assert.match(script, /localStorage\.setItem\('benchcard\.v7', /);
});

test('planLanding: a v3 record writes v3 and removes both v7 keys', () => {
  const { script } = planLanding({ record: SEED });
  assert.match(script, /localStorage\.removeItem\('benchcard\.v7'\)/);
  assert.match(script, /localStorage\.removeItem\('benchcard\.v7\.bak'\)/);
  assert.match(script, /localStorage\.setItem\('benchcard\.v3', /);
});

test("planLanding: 'wiped' clears storage", () => {
  const { script } = planLanding({ record: 'wiped' });
  assert.equal(script, LOCALSTORAGE_WIPE);
});

test("planLanding: 'kept' has no seeding script", () => {
  const { script } = planLanding({ record: 'kept' });
  assert.equal(script, null);
});

test('planLanding: an unknown field throws', () => {
  assert.throws(() => planLanding({ bogus: true }));
});

test('planLanding: a record with another version throws', () => {
  assert.throws(() => planLanding({ record: { version: 99 } }));
});

/* ---------- the start fingerprint's verdict (pure half) ---------- */

const FP = {
  url: '/index.html', screen: 'view-games', width: 390, height: 844, rootPx: '16px',
  dark: false, forced: false, recordLength: 4120, recordHash: 'a1b2c3',
};

test('compareFingerprints: identical fingerprints differ in nothing', () => {
  assert.equal(pageState.compareFingerprints(FP, { ...FP }), null);
});

test('compareFingerprints: names the first field that changed, was and want', () => {
  assert.equal(
    pageState.compareFingerprints(FP, { ...FP, screen: 'view-today' }),
    'start state differs from baseline: screen was "view-today", want "view-games"');
});

test('compareFingerprints: a changed record hash is caught even at the same length', () => {
  assert.match(
    pageState.compareFingerprints(FP, { ...FP, recordHash: 'ffffff' }),
    /^start state differs from baseline: recordHash was "ffffff", want "a1b2c3"$/);
});

test('compareFingerprints: dark or forced colors leaking in are caught', () => {
  assert.match(pageState.compareFingerprints(FP, { ...FP, dark: true }), /dark was true, want false/);
  assert.match(pageState.compareFingerprints(FP, { ...FP, forced: true }), /forced was true, want false/);
});

test('compareFingerprints: with two fields changed, the first in FINGERPRINT_FIELDS order is named', () => {
  assert.equal(
    pageState.compareFingerprints(FP, { ...FP, recordHash: 'ffffff', width: 320, url: '/about.html' }),
    'start state differs from baseline: url was "/about.html", want "/index.html"');
  assert.match(
    pageState.compareFingerprints(FP, { ...FP, recordHash: 'ffffff', width: 320 }),
    /^start state differs from baseline: width was 320, want 390$/);
});

test('compareFingerprints: a fingerprint missing any field is reported, never equal', () => {
  assert.deepEqual(pageState.FINGERPRINT_FIELDS,
    ['url', 'screen', 'width', 'height', 'rootPx', 'dark', 'forced', 'recordLength', 'recordHash']);
  for (const field of pageState.FINGERPRINT_FIELDS) {
    const { [field]: _gone, ...without } = FP;
    const problem = pageState.compareFingerprints(FP, without);
    assert.ok(problem && problem.includes(field),
      `a fingerprint with no ${field} must be reported naming it, got ${JSON.stringify(problem)}`);
    // and a baseline that lost the field is just as wrong: undefined === undefined must not pass
    const both = pageState.compareFingerprints(without, { ...without });
    assert.ok(both && both.includes(field),
      `two fingerprints both missing ${field} must not compare equal, got ${JSON.stringify(both)}`);
  }
});

/* ---------- setMedia: live emulation inside one page load ---------- */

test('setMedia sends exactly the features it is given, and [] clears them', async () => {
  const sent = [];
  const c = { send: async (method, params) => { sent.push([method, params]); return {}; } };
  const dark = [{ name: 'prefers-color-scheme', value: 'dark' }];
  await pageState.setMedia(c, dark);
  await pageState.setMedia(c, []);
  assert.deepEqual(sent, [
    ['Emulation.setEmulatedMedia', { features: dark }],
    ['Emulation.setEmulatedMedia', { features: [] }],
  ]);
});

/* ---------- the registry: the harness owns the reset ---------- */

test('no registry row carries resetAfter: the next row\'s reset is what restores', () => {
  assert.ok(ROWS.length >= 70, `expected the registry's rows, found ${ROWS.length}`);
  assert.deepEqual(ROWS.filter(r => 'resetAfter' in r).map(r => r.name), []);
});

/* ---------- seam 2: the guard half ---------- */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SMOKE_DIR = join(ROOT, 'scripts', 'smoke');

const PATTERNS = {
  navigate: /send\(\s*['"]Page\.navigate['"]/g,
  metrics: /send\(\s*['"]Emulation\.setDeviceMetricsOverride['"]/g,
  fontsizes: /send\(\s*['"]Page\.setFontSizes['"]/g,
  media: /send\(\s*['"]Emulation\.setEmulatedMedia['"]/g,
  fontsready: /document\.fonts\.ready/g,
};

function countsFor(source) {
  const counts = {};
  for (const [key, re] of Object.entries(PATTERNS)) counts[key] = (source.match(re) || []).length;
  return counts;
}

function smokeFiles() {
  const files = [join(ROOT, 'scripts', 'smoke.mjs')];
  for (const name of readdirSync(SMOKE_DIR)) {
    if (name.endsWith('.mjs')) files.push(join(SMOKE_DIR, name));
  }
  return files;
}

/* Today's per-file allow-list, pinned by counting the tree before slice 1's
 * edit (`dom.mjs`/`fixtures.mjs` are not here: their wrapper bodies moved
 * every one of these calls into `page-state.mjs`, so their own count is 0,
 * same as any file never in this map). Each later slice removes the files it
 * migrates; none may raise a number that is still here (`AGENTS.md`'s rule
 * for allow maps) -- the last slice deletes the list entirely. */
const ALLOW = {
  'scripts/smoke/card-font.mjs': { navigate: 0, metrics: 0, fontsizes: 0, media: 0, fontsready: 2 },
  'scripts/smoke/clip-sweep.mjs': { navigate: 0, metrics: 1, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/today-and-back.mjs': { navigate: 0, metrics: 0, fontsizes: 0, media: 0, fontsready: 1 },
};

const ZERO = { navigate: 0, metrics: 0, fontsizes: 0, media: 0, fontsready: 0 };

test('only page-state.mjs sends these CDP methods or reads fonts.ready, outside the pinned allow-list', () => {
  const files = smokeFiles();
  assert.ok(files.length >= 30,
    `expected at least 30 files across scripts/smoke.mjs and scripts/smoke/, found ${files.length} -- ` +
    'a guard that measured nothing must fail, not pass');

  let measured = 0;
  const bad = [];
  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join('/');
    const counts = countsFor(readFileSync(file, 'utf8'));
    measured += Object.values(counts).reduce((a, b) => a + b, 0);

    if (rel === 'scripts/smoke/page-state.mjs') {
      for (const key of Object.keys(PATTERNS)) {
        if (counts[key] < 1) bad.push(`page-state.mjs has ${counts[key]} ${key}, want at least 1`);
      }
      continue;
    }
    const want = ALLOW[rel] || ZERO;
    for (const key of Object.keys(PATTERNS)) {
      if (counts[key] !== want[key]) {
        bad.push(`${rel}: ${key} is ${counts[key]}, allow-list says ${want[key]}`);
      }
    }
  }

  assert.ok(measured > 0, 'the guard scanned every file and matched nothing it tracks -- a check that measured nothing must fail, not pass');
  assert.deepEqual(bad, []);
});

test('the guard above can fail: a planted raw call outside the allow-list is caught', () => {
  const counts = countsFor(`await c.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });`);
  const want = ZERO; // a file at zero, which is where every file ends up
  assert.notEqual(counts.fontsizes, want.fontsizes,
    'planting a fontsizes call where the allow-list says 0 must change the measured count, or the guard above could never fail');
});

/* A check no longer puts RICH back itself: the harness's `reset` runs before
 * the next rich row (#125 D1), so a restore on the way out -- `goRich(c,
 * origin)` or `reloadWithRecord(c, origin, RICH...)` as the LAST statement of
 * a pass or of a `finally`, with or without a trailing `.catch` -- is dead
 * weight and a second owner of the reset. A `goRich` in the middle of a pass
 * sets up that pass's own start state and is not matched: the call must be
 * followed by nothing but comments and blank lines before the closing brace
 * or the `return`. Rule 2a: the pattern is proved able to match each form
 * first. */
const RESTORE = new RegExp(
  String.raw`(?:await\s+)?(?:goRich\(c, origin\)|reloadWithRecord\(c, origin, RICH\b[^\n]*?\))` +
  String.raw`(?:\.catch\([^\n]*\))?;?[^\n]*\n(?:[ \t]*(?:\/\/[^\n]*)?\n)*[ \t]*(?:\}|return\b)`, 'g');

test('no check module restores RICH itself', () => {
  const forms = {
    catch: `  await goRich(c, origin).catch(() => {});\n  return {`,
    finallyTail: `  } finally {\n    await goRich(c, origin);\n  }\n`,
    commentedTail: `  } finally {\n    // put it back\n    await goRich(c, origin);\n  }\n`,
    reloadTail: `  } finally {\n    await reloadWithRecord(c, origin, RICH, GAMES_VIEW_READY);\n  }\n`,
    reloadPlain: `  reloadWithRecord(c, origin, RICH).catch(() => {});\n}\n`,
    beforeReturn: `  await goRich(c, origin);\n\n  return {\n`,
  };
  for (const [name, text] of Object.entries(forms)) {
    assert.equal(text.match(RESTORE)?.length, 1,
      `the restore pattern must match the ${name} form, or a clean tree proves nothing`);
  }
  const startState = `    await goRich(c, origin);\n    await evalIn(c, step(X));\n  }\n`;
  assert.equal(startState.match(RESTORE), null,
    'a goRich that sets up the pass\'s own start state, with work after it, is not a restore');
  const files = smokeFiles();
  assert.ok(files.length >= 30, `expected at least 30 smoke files, found ${files.length}`);
  const bad = files.filter(f => (readFileSync(f, 'utf8').match(RESTORE) || []).length > 0)
    .map(f => relative(ROOT, f).split(sep).join('/'));
  assert.deepEqual(bad, []);
});
