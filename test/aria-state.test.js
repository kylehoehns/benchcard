import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Selected state that is carried by a CSS class alone is carried by a color
   alone, and a screen reader cannot see a color.
 *
 * Four controls in this app always got this right -- the team tabs
 * (`aria-current`), the balance shape picker, the sub-frequency chips and the
 * availability pills (`aria-pressed`) -- so the six below were a wrong
 * instance of a convention the codebase already had, not a missing one. This
 * pins each of them where it is written, because every one of them is a
 * single line sitting beside a `classList.toggle` that looks complete without
 * it.
 *
 * Anchored rather than counted: `aria-pressed` appears elsewhere in three of
 * these files, so a bare "the file mentions it" check would pass with the
 * line deleted. Each case looks only at the source that follows its own
 * control's anchor. */
const SITES = [
  { file: 'strategy.js', what: 'the strategy segmented control',
    anchor: "querySelectorAll('#stratseg button')", within: 400, attr: 'aria-pressed' },
  // #36 moved the sub-frequency picker out of onboarding.js's own
  // renderWelcome (deleted) into game-setup.js's paintGranRows, which both
  // the sub-interval sheet and first-run step 2 now call.
  { file: 'game-setup.js', what: 'the sub-frequency rows',
    anchor: 'GRAN_CHOICES.forEach((c, idx) => {', within: 400, attr: 'aria-pressed' },
  { file: 'teams-view.js', what: 'the team menu',
    anchor: 'state.teams.forEach', within: 500, attr: 'aria-current' },
  { file: 'rules.js', what: "the Add-a-rule kind picker",
    anchor: "draft.kind === k ? ' sel' : ''", within: 400, attr: 'aria-pressed' },
];

for (const s of SITES) {
  test(`${s.what} announces which one is selected`, () => {
    const src = readFileSync(new URL(`../app/${s.file}`, import.meta.url), 'utf8');
    const at = src.indexOf(s.anchor);
    assert.notEqual(at, -1,
      `${s.file}: the anchor ${JSON.stringify(s.anchor)} is gone. If the control was renamed, `
      + 'move this case with it rather than deleting it.');
    const window = src.slice(at, at + s.within);
    assert.ok(window.includes(`setAttribute('${s.attr}'`),
      `${s.file}: ${s.what} sets a class for the selected item but never sets ${s.attr}, `
      + 'so the state is a color and nothing else. See the four controls that do it right.');
  });
}
