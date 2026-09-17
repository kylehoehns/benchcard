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
 * it.
 *
 * #28 replaced the Rules fold, and its collapsed-row count badge, with the
 * `#phraseRules` sentence phrase and the Plan sheet's Rules group. There is no
 * cached count to go stale any more (A25's bug): `sentenceParts` (state.js)
 * and `renderConstraints` (rules.js) both read `ruleCount`/`ruleItems`
 * fresh on every repaint rather than a badge painted once and left standing,
 * so the staleness this file used to guard cannot recur in this shape. What
 * survives is the one claim that was never about the fold or the badge:
 * `ruleCount(g)` counts the PLAYER rules and nothing about the game's format.
 *
 * Source-read, no DOM, same trick as note-placement.test.js.
 */

const read = (f) => readFileSync(new URL('../app/' + f, import.meta.url), 'utf8');

const FORMAT_IDS = ['periods', 'periodMinutes', 'gran'];

test('the Rules count still counts only the player rules', () => {
  // it always did — the A11 report expected a behavior change here and there
  // was none to make. Pinned so a later "tidy-up" cannot fold the format into
  // it. #26 moved the count itself into `ruleCount(g)` (state.js); #28's
  // sentence phrase reads that same function directly rather than a call
  // site elsewhere re-deriving it, so the pin still means something.
  const stateJs = read('state.js');
  assert.match(stateJs, /rules: rules \? `\$\{rules\} rule\$\{rules === 1 \? '' : 's'\}` : 'no rules'/,
    "sentenceParts' rules phrase no longer reads ruleCount(g) — re-point this test at wherever it counts now");
  const at = stateJs.indexOf('export function ruleCount');
  assert.ok(at > 0, 'ruleCount has moved out of state.js — re-point this test');
  const src = stateJs.slice(at, stateJs.indexOf('\n}', at));
  for (const id of FORMAT_IDS) assert.ok(!src.includes(id), `ruleCount counts ${id}`);
  assert.match(src, /minMinutes[\s\S]*maxMinutes[\s\S]*pairs[\s\S]*avoids/);
});
