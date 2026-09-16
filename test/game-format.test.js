import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Where the Rules COUNT lives, once Periods / Min-per-period / Sub interval
 * left this file's original subject behind.
 *
 * #27 moved those three controls out of `<details id="fmtFold">` entirely --
 * they read now as two phrases in the sentence (`#phraseFormat`,
 * `#phraseInterval`) and open the Format / Sub interval sheets, not a fold on
 * this page at all. The position assertions this file used to carry
 * (`fmtFold` above the rotation, in and out of the Rules fold, the summary
 * hint on `#fmthint`) went with the markup they described; test/sentence.test.js
 * and the new "sentence and sheets" smoke guard cover the sheets that replaced
 * it, and test/rules-position.test.js still pins where the Rules fold itself
 * reads in the phone stack.
 *
 * What survives here is the one claim that was never about the fold's
 * position: `ruleCount(g)` counts the PLAYER rules and nothing about the
 * game's format, and the collapsed Rules row is kept in step with it by
 * `renderConsCount()`, called back from `renderConstraints()` on every edit.
 * Neither of those moved with the controls, and neither is pinned elsewhere.
 *
 * Source-read, no DOM, same trick as note-placement.test.js.
 */

const read = (f) => readFileSync(new URL('../app/' + f, import.meta.url), 'utf8');
const setupJs = read('game-setup.js');

const FORMAT_IDS = ['periods', 'periodMinutes', 'gran'];

test('the Rules count still counts only the player rules', () => {
  // it always did — the A11 report expected a behavior change here and there
  // was none to make. Pinned so a later "tidy-up" cannot fold the format into
  // it. #26 moved the count itself into `ruleCount(g)` (state.js); this reads
  // the function it moved to rather than the call site game-setup.js left
  // behind, so the pin still means something.
  assert.match(setupJs, /const n = ruleCount\(g\)/,
    'renderConsCount no longer reads ruleCount(g) — re-point this test at wherever it counts now');
  const stateJs = read('state.js');
  const at = stateJs.indexOf('export function ruleCount');
  assert.ok(at > 0, 'ruleCount has moved out of state.js — re-point this test');
  const src = stateJs.slice(at, stateJs.indexOf('\n}', at));
  for (const id of FORMAT_IDS) assert.ok(!src.includes(id), `ruleCount counts ${id}`);
  assert.match(src, /minMinutes[\s\S]*maxMinutes[\s\S]*pairs[\s\S]*avoids/);
});

test('the Rules count is repainted by the rules body, not only by a full render', () => {
  /* `setup` is in neither AFTER_EDIT nor PLAN_ONLY, and every rule edit in
     rules.js repaints by calling `renderConstraints()` straight back. So the
     badge on the collapsed Rules row held the count as of the last FULL render
     and a coach's first rule of the session changed the row not at all (A25).
     A/B'd in a browser: without this call the badge stays hidden through the
     rule being added and the chip appearing. */
  const rulesJs = read('rules.js');
  assert.match(setupJs, /export function renderConsCount\(\)/,
    'the badge paint is no longer extracted — rules.js has nothing to call');
  const at = rulesJs.indexOf('export function renderConstraints()');
  assert.ok(at > 0, 'renderConstraints has moved — re-point this test');
  const body = rulesJs.slice(at, rulesJs.indexOf("\n  const box = $('#constraints')", at));
  assert.ok(body.includes('renderConsCount()'),
    'renderConstraints no longer repaints the Rules count badge, so it goes stale on the first rule');
});
