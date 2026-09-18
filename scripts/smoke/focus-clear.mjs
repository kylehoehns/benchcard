/* #33 decision 15, "What would settle it" item 7: `.bar` and `#actionbar`
 * float OVER the game screen now instead of pushing it down (decisions 1-3),
 * so nothing about layout keeps a focused control from landing underneath
 * either one the way it used to. This tabs forward through the game screen
 * and fails if a focused CONTENT control's rect overlaps `.bar`'s rect or
 * `#actionbar`'s rect, or if fewer than 8 distinct controls were ever
 * reached -- rule 2a: a broken probe or a trap that swallowed every
 * keypress must read as a failure, not a quiet, meaningless pass.
 *
 * `.bar`'s and `#actionbar`'s OWN children are skipped, not failed on: a
 * button that lives inside the floating bar trivially overlaps the bar's
 * own rect just by being its child, which is not the bug decision 14 exists
 * to prevent -- the bug is CONTENT scrolled to where the chrome now covers
 * it. So the probe starts inside `#view-games`, past the bar/actionbar in
 * source order, and anything Tab lands back inside either of them (the
 * order still reaches `#actionbar`'s own bench button from inside the view)
 * is skipped rather than counted or flagged.
 *
 * A real Tab keypress, not a scripted `.focus()`: see team-color.mjs's own
 * file comment for why -- a script call never satisfies Chromium's
 * focus-visible heuristic, confirmed empirically against this app there,
 * and the same CDP dispatch is reused here rather than a second way to
 * press Tab. */
import { evalIn, step, TODAY_HOME } from './dom.mjs';
import { nameOf } from './registry.mjs';

/* The floor is a floor, NOT a stopping point, and that distinction is the
 * whole check. Stopping at the eighth control tabbed through only the top of
 * the game screen -- the sentence's own phrases, all of them on screen
 * already -- so the page never scrolled, and a run with decision 14's
 * `scroll-padding` deleted outright still read green. The bug this exists to
 * catch only happens once the browser has to SCROLL to reveal what it just
 * focused, which is the moment `scroll-padding` is the only thing telling it
 * the chrome is there. So the walk runs to the end of the tab order and
 * `maxScrollY` below fails a run where nothing ever scrolled. */
const MIN_CONTROLS = 8;
const MAX_TABS = 80; // generous ceiling so a stuck or cyclic tab order cannot hang the harness

export async function focusClearPass(c) {
  const problems = [];
  // Guarantee the game screen regardless of what state this pass inherits --
  // RICH already lands there, but `--only focusclear` should not have to
  // assume that stays true.
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));

  await evalIn(c, `(() => {
    const view = document.getElementById('view-games');
    const p = document.createElement('input');
    p.id = '__focusProbe';
    view.prepend(p);
    p.focus();
  })()`);

  let visited = 0, maxScrollY = 0;
  const overlaps = [];
  for (let i = 0; i < MAX_TABS; i++) {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    const info = JSON.parse(await evalIn(c, `(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.hasAttribute('data-focustabbed')) return JSON.stringify({ done: true });
      if (el.closest('.bar') || el.closest('#actionbar')) return JSON.stringify({ inChrome: true });
      el.setAttribute('data-focustabbed', '1');
      const r = el.getBoundingClientRect();
      const bar = document.querySelector('.bar')?.getBoundingClientRect();
      const ab = document.querySelector('#actionbar:not([hidden])')?.getBoundingClientRect();
      const overlaps = (a, b) => !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join(''));
      return JSON.stringify({ label, scrollY: Math.round(window.scrollY),
        overlapsBar: overlaps(r, bar), overlapsAb: overlaps(r, ab) });
    })()`));
    if (info.done) break;
    if (info.inChrome) continue;
    visited++;
    if (info.scrollY > maxScrollY) maxScrollY = info.scrollY;
    if (info.overlapsBar || info.overlapsAb) {
      overlaps.push(`${info.label} overlaps ${info.overlapsBar ? '.bar' : '#actionbar'} `
        + `(control ${visited} of the tab sequence, at scrollY ${info.scrollY})`);
    }
  }

  await evalIn(c, `(() => {
    document.getElementById('__focusProbe')?.remove();
    for (const el of document.querySelectorAll('[data-focustabbed]')) el.removeAttribute('data-focustabbed');
  })()`);
  await evalIn(c, step(TODAY_HOME));

  if (visited < MIN_CONTROLS) {
    problems.push(`only ${visited} distinct content control(s) reached by Tab, want at least ${MIN_CONTROLS} -- `
      + 'a run that measured nothing is not a pass');
  }
  /* The second half of rule 2a, and the one that caught this check being
     green against a tree with no `scroll-padding` at all: a walk that never
     left the top of the page proves nothing about a floating control, since
     the browser only consults `scroll-padding` when it has to scroll. */
  if (maxScrollY === 0) {
    problems.push('the tab walk never scrolled the page (scrollY stayed 0), so nothing here '
      + 'exercised scroll-padding -- that is a broken probe, not a clear tab order');
  }
  problems.push(...overlaps.slice(0, 3));

  return {
    name: nameOf('focusclear'),
    pass: problems.length === 0,
    detail: problems.length
      ? problems.join(' | ') + (overlaps.length > 3 ? ` (+${overlaps.length - 3} more)` : '')
      : `${visited} content control(s) tabbed through down to scrollY ${maxScrollY}, clear of .bar and #actionbar`,
  };
}
