import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The dialog shell and the viewport it is allowed to trust.
 *
 * `.keyswrap` / `.keysbox` is the shell behind all three dialogs -- the
 * shortcuts sheet, help, and the one confirm. It was capped at `92vh`, and on
 * iOS `vh` resolves against the LARGE viewport, the page as if the URL bar were
 * hidden, so while the bar is showing the bottom of a full-height sheet sits
 * below the window. The help sheet's last button was 16px under the fold on a
 * 390x844 iPhone and could not be scrolled to, because what is clipped is the
 * box, not its overflow.
 *
 * Pinned here rather than left to a screenshot for one reason: the tempting
 * wrong fix is to shrink the number. `max-height: 80vh` looks fixed at whatever
 * URL-bar state you happen to be in and is still broken at the other one, and a
 * screenshot taken at the lucky state agrees with it. So this asserts the shape
 * of the fix -- a dynamic viewport unit and a safe-area inset -- not a number.
 */

const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');

const rule = sel => {
  const at = css.indexOf(sel + ' {');
  assert.ok(at > -1, `${sel} is gone`);
  return css.slice(at, css.indexOf('}', at) + 1);
};

test('the dialog box is capped by the viewport you can see, not the large one', () => {
  const box = rule('.keysbox');
  assert.ok(/max-height:[^;]*dvh/.test(box),
    '.keysbox caps its height in `vh` only — on iOS that is the viewport with the URL bar '
    + 'hidden, so the bottom of a tall sheet sits below the window');
  /* The plain-`vh` line has to stay, and stay first: it is the fallback for
     anything without `dvh`, and it is no worse than what shipped. */
  const dvhAt = box.indexOf('dvh');
  const vhAt = box.search(/max-height: \d+vh/);
  assert.ok(vhAt > -1, 'the plain-vh fallback for browsers without dvh is gone');
  assert.ok(vhAt < dvhAt, 'the vh fallback is declared after the dvh cap and would win');
  /* Bounded by the wrap as well as by the viewport, so a fixed box handed the
     large viewport by the browser still cannot push its contents off screen. */
  assert.ok(/max-height:[^;]*100%/.test(box),
    '.keysbox is no longer bounded by its wrap (`100%`), only by a viewport unit');
});

test('the wrap clears the home indicator and the notch', () => {
  const wrap = rule('.keyswrap');
  for (const side of ['bottom', 'top']) {
    assert.ok(new RegExp(`padding-${side}: calc\\([^;]*env\\(safe-area-inset-${side}\\)`).test(wrap),
      `.keyswrap has no safe-area inset at the ${side} — on a notched phone the sheet `
      + `runs under the ${side === 'bottom' ? 'home indicator' : 'status bar'}`);
  }
  assert.ok(/height: 100dvh/.test(wrap),
    '.keyswrap no longer sizes itself to the visible viewport, so it centres its sheet '
    + 'in a box the coach cannot entirely see');
});

test('all three dialogs share the shell, so the fix reaches all three', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  for (const id of ['confirm', 'help', 'keys']) {
    const at = html.indexOf(`id="${id}"`);
    assert.ok(at > -1, `#${id} is gone`);
    const open = html.lastIndexOf('<div', at);
    assert.ok(html.slice(open, at).includes('keyswrap'),
      `#${id} no longer uses the .keyswrap shell — it needs its own viewport handling`);
  }
});

/* The header of that shell stays put while the box scrolls.
 *
 * The box IS the scroll container, so a header inside it is just the first
 * thing to scroll away: past the first screen of the help sheet the close
 * button had left the top of the sheet, while the comment above the rule
 * claimed it could not. Nothing was trapped -- Escape and the backdrop still
 * close -- but the affordance was gone.
 *
 * The negative-margin trap is pinned rather than the pixel: `position: sticky`
 * aligns the MARGIN box, so a header pulled up with `margin-top: -1.2rem` to
 * reach the box's inner edge pins 1.2rem BELOW the top of the scrollport and
 * prose slides through the gap above it. The padding lives on the header
 * instead, which is why `.keysbox` has no `padding-top` of its own.
 */
test('the dialog header stays while the box scrolls under it', () => {
  const hd = rule('.keys-hd');
  assert.ok(/position: sticky/.test(hd) && /top: 0/.test(hd),
    '.keys-hd is not sticky — the close button scrolls off the top of a capped sheet');
  assert.ok(/background:/.test(hd),
    '.keys-hd has no background, so the text scrolling under it shows through');
  assert.ok(!/margin: *-/.test(hd) && !/margin-top: *-/.test(hd),
    '.keys-hd has a negative top margin — sticky aligns the margin box, so it would pin '
    + 'that far below the top of the scrollport and let content show above it');
  assert.ok(/padding: 0 /.test(rule('.keysbox')),
    '.keysbox has taken its top padding back — the sticky header has to own it, or the '
    + 'inset above the title scrolls away and the header jumps when it sticks');
});
