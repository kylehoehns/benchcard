import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Game mode on a phone held sideways. The landscape block turns the one tall
   column into two, and it wins by source order alone -- every selector in it
   shares its specificity with the base rule it overrides. Two ways to break it
   silently, so both are pinned here rather than left to a screenshot. */

const ROOT = new URL('../app/', import.meta.url);
const css = readFileSync(new URL('app.css', ROOT), 'utf8');
const html = readFileSync(new URL('index.html', ROOT), 'utf8');

const LAND = '@media (orientation: landscape) and (max-height: 560px)';

test('the game-mode landscape block sits after the base rules it overrides', () => {
  const block = css.indexOf(LAND);
  assert.ok(block > -1, 'the landscape block is gone');
  /* A media query does not add specificity: `.gm-foot` and `.gm-nav` declared
     later in the file would beat the copies inside it. */
  for (const sel of ['.gm-foot {', '.gm-nav {', '.gm-p {', '.gm-body {']) {
    const base = css.indexOf(sel);
    assert.ok(base > -1, `base rule ${sel} is gone`);
    assert.ok(base < block, `${sel} is declared after the landscape block and would win`);
  }
});

test('the bench section carries no inline margin for that block to fight', () => {
  const tag = html.match(/<div class="gm-sec" id="gmBenchSec"[^>]*>/);
  assert.ok(tag, '#gmBenchSec is gone');
  assert.ok(!/style=/.test(tag[0]), 'an inline style on #gmBenchSec beats the landscape override');
  assert.ok(/#gmBenchSec\s*{[^}]*margin-top/.test(css), 'the bench margin left app.css');
});
