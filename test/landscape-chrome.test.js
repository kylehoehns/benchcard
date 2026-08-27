import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The planning views on a phone held sideways. The block trims the sticky top
   bar, the fixed action bar and the day title so the plan is not pushed 256px
   down a 390px window. It has the same two ways of failing silently as the
   game-mode landscape block, so both are pinned here rather than left to a
   screenshot: it wins on source order alone, and it must never trim the app
   horizontally -- that is what puts a control out of reach. */

const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');

const LAND = '@media (orientation: landscape) and (max-height: 560px)';
/* the second occurrence: the first is game mode's, which gm-landscape.test.js
   pins separately */
const start = css.indexOf(LAND, css.indexOf(LAND) + 1);
const body = start > -1 ? css.slice(start, css.indexOf('\n}', start)) : '';

test('the chrome landscape block sits after every bar rule it overrides', () => {
  assert.ok(start > -1, 'the planning-views landscape block is gone');
  /* A media query adds no specificity, so a later copy of any of these wins. */
  for (const sel of ['@media (max-width: 620px)', '@media (max-width: 19em)', '.actionbar {', '.ab-main {', '.dayhead input.daytitle {']) {
    const at = css.indexOf(sel);
    assert.ok(at > -1, `${sel} is gone`);
    assert.ok(at < start, `${sel} is declared after the landscape block and would win`);
  }
});

test('it trims vertically only, and never below the 44px touch floor', () => {
  for (const prop of ['padding-left', 'padding-right', 'width:', 'gap:', 'display: none']) {
    assert.ok(!body.includes(prop), `${prop} in the landscape block trims the app horizontally`);
  }
  assert.ok(/\.ab-main, \.ab-side \{ min-height: 44px; \}/.test(body),
    'the action bar buttons lost their 44px floor');
});
