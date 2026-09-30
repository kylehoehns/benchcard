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
import { planLanding, BASELINE } from '../scripts/smoke/page-state.mjs';
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
  'scripts/smoke.mjs': { navigate: 1, metrics: 1, fontsizes: 0, media: 0, fontsready: 1 },
  'scripts/smoke/add-game-fit.mjs': { navigate: 0, metrics: 6, fontsizes: 6, media: 0, fontsready: 0 },
  'scripts/smoke/app-large-text.mjs': { navigate: 0, metrics: 2, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/bench-details.mjs': { navigate: 0, metrics: 0, fontsizes: 4, media: 0, fontsready: 0 },
  'scripts/smoke/bench-look.mjs': { navigate: 0, metrics: 1, fontsizes: 2, media: 3, fontsready: 0 },
  'scripts/smoke/card-at-32.mjs': { navigate: 5, metrics: 0, fontsizes: 2, media: 0, fontsready: 1 },
  'scripts/smoke/card-font.mjs': { navigate: 0, metrics: 0, fontsizes: 0, media: 0, fontsready: 2 },
  'scripts/smoke/clip-sweep.mjs': { navigate: 0, metrics: 1, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/first-run-flow.mjs': { navigate: 0, metrics: 0, fontsizes: 0, media: 2, fontsready: 0 },
  'scripts/smoke/floating-controls.mjs': { navigate: 0, metrics: 2, fontsizes: 0, media: 3, fontsready: 0 },
  'scripts/smoke/flow-inset.mjs': { navigate: 0, metrics: 0, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/font-draws.mjs': { navigate: 0, metrics: 2, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/forced-colors.mjs': { navigate: 0, metrics: 0, fontsizes: 0, media: 2, fontsready: 0 },
  'scripts/smoke/game-rows-fit.mjs': { navigate: 0, metrics: 0, fontsizes: 0, media: 3, fontsready: 0 },
  'scripts/smoke/game-title.mjs': { navigate: 1, metrics: 2, fontsizes: 2, media: 0, fontsready: 1 },
  'scripts/smoke/no-games.mjs': { navigate: 1, metrics: 2, fontsizes: 0, media: 0, fontsready: 1 },
  'scripts/smoke/pass-large-text.mjs': { navigate: 0, metrics: 1, fontsizes: 1, media: 0, fontsready: 0 },
  'scripts/smoke/phone-gutter.mjs': { navigate: 0, metrics: 5, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/resume-bar.mjs': { navigate: 0, metrics: 4, fontsizes: 2, media: 2, fontsready: 0 },
  'scripts/smoke/roster-in.mjs': { navigate: 0, metrics: 2, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/season-look.mjs': { navigate: 0, metrics: 0, fontsizes: 6, media: 0, fontsready: 0 },
  'scripts/smoke/season.mjs': { navigate: 0, metrics: 2, fontsizes: 0, media: 0, fontsready: 0 },
  'scripts/smoke/sheet-spacing.mjs': { navigate: 0, metrics: 2, fontsizes: 2, media: 0, fontsready: 0 },
  'scripts/smoke/static.mjs': { navigate: 2, metrics: 2, fontsizes: 2, media: 0, fontsready: 2 },
  'scripts/smoke/sweep.mjs': { navigate: 0, metrics: 1, fontsizes: 0, media: 0, fontsready: 0 },
  'scripts/smoke/team-screen.mjs': { navigate: 0, metrics: 5, fontsizes: 4, media: 0, fontsready: 0 },
  'scripts/smoke/three-days.mjs': { navigate: 1, metrics: 2, fontsizes: 2, media: 0, fontsready: 1 },
  'scripts/smoke/timeline-card-sheet.mjs': { navigate: 0, metrics: 4, fontsizes: 4, media: 0, fontsready: 1 },
  'scripts/smoke/today-and-back.mjs': { navigate: 0, metrics: 2, fontsizes: 2, media: 0, fontsready: 1 },
  'scripts/smoke/touch.mjs': { navigate: 0, metrics: 1, fontsizes: 0, media: 0, fontsready: 0 },
  'scripts/smoke/type-scale.mjs': { navigate: 0, metrics: 1, fontsizes: 1, media: 0, fontsready: 0 },
  'scripts/smoke/width-sweep.mjs': { navigate: 0, metrics: 1, fontsizes: 0, media: 0, fontsready: 0 },
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
  const want = ALLOW['scripts/smoke/touch.mjs']; // today: fontsizes 0
  assert.notEqual(counts.fontsizes, want.fontsizes,
    'planting a fontsizes call where the allow-list says 0 must change the measured count, or the guard above could never fail');
});
