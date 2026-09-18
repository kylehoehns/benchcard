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

/* The rect-overlap test itself, as a string rather than a function: it is
 * needed INSIDE a browser-evaluated expression, not as a Node-side value, so
 * a plain function would have to be `.toString()`'d back into text anyway --
 * two ways to say the same thing. It used to be exported, for #34's
 * resume-bar.mjs, which tabs Today against `#resumeBar` the same way this
 * file tabs the game screen; the whole WALK is shared now (`tabWalk` below),
 * so this literal has one reader again. */
const OVERLAPS = '(a, b) => !!b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)';

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

/* The walk itself, driven once for two passes: this file's (the game screen,
 * against `.bar` and `#actionbar`) and #34's resume-bar.mjs (Today, against
 * `#resumeBar`). Both do exactly the same forty lines -- plant a focusable
 * probe at the top of a view, press real Tab keys over CDP up to `MAX_TABS`
 * times, skip anything inside the floating chrome, mark each element the
 * first time it is reached so a second visit ends the lap, read the focused
 * rect against the bar rects with `OVERLAPS`, and tidy the probe and the
 * markers away again -- and differed only in the names, the view, what to
 * skip and which bars to test. Two copies of a probe this fiddly is two
 * places for the wrap-around artefact below to be fixed in.
 *
 * `name` gives both the probe's id (`__<name>Probe`) and the marker attribute
 * (`data-<name>tabbed`), so the two can never drift apart. `bars` are
 * selectors, and a selector is its own label in the failure message.
 *
 * The probe is marked from the moment it is created, not only once Tab has
 * left it. Without that, a lap that runs out of forward content wraps around
 * the whole document and lands back on the probe, which the walk then counts
 * as an ordinary NEW control (it reads `input#__<name>Probe` back
 * as if a coach could tab to it) -- a bookkeeping artefact, not a control on
 * the page. Marking it up front makes the wrap a `done`, the same way any
 * other already-visited element stops the walk. Measured on this tree, the
 * game screen's own walk had the artefact too: 25 controls before, 24 after,
 * down to the same scrollY 550 -- the one that went is the probe itself,
 * which the lap came back around to. So both passes mark, and the floor of 8
 * below is judged against the honest count. */
export async function tabWalk(c, { name, probeParent, skip = [], bars = [], maxTabs = MAX_TABS }) {
  const probeId = `__${name}Probe`;
  const marker = `data-${name}tabbed`;
  await evalIn(c, `(() => {
    const p = document.createElement('input');
    p.id = ${JSON.stringify(probeId)};
    p.setAttribute(${JSON.stringify(marker)}, '1');
    document.querySelector(${JSON.stringify(probeParent)}).prepend(p);
    p.focus();
  })()`);

  let visited = 0, maxScrollY = 0;
  const labels = [], overlaps = [];
  for (let i = 0; i < maxTabs; i++) {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    const info = JSON.parse(await evalIn(c, `(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.hasAttribute(${JSON.stringify(marker)})) return JSON.stringify({ done: true });
      if (${JSON.stringify(skip)}.some(s => el.closest(s))) return JSON.stringify({ inChrome: true });
      el.setAttribute(${JSON.stringify(marker)}, '1');
      const r = el.getBoundingClientRect();
      const overlaps = ${OVERLAPS};
      const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join(''));
      return JSON.stringify({ label, scrollY: Math.round(window.scrollY),
        under: ${JSON.stringify(bars)}.filter(s => overlaps(r, document.querySelector(s)?.getBoundingClientRect())) });
    })()`));
    if (info.done) break;
    if (info.inChrome) continue;
    visited++;
    labels.push(info.label);
    if (info.scrollY > maxScrollY) maxScrollY = info.scrollY;
    for (const sel of info.under) {
      overlaps.push(`${info.label} overlaps ${sel} (control ${visited} of the tab sequence, at scrollY ${info.scrollY})`);
    }
  }

  await evalIn(c, `(() => {
    document.getElementById(${JSON.stringify(probeId)})?.remove();
    for (const el of document.querySelectorAll('[${marker}]')) el.removeAttribute(${JSON.stringify(marker)});
  })()`);

  return { visited, labels, overlaps, maxScrollY };
}

export async function focusClearPass(c) {
  const problems = [];
  // Guarantee the game screen regardless of what state this pass inherits --
  // RICH already lands there, but `--only focusclear` should not have to
  // assume that stays true.
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));

  const { visited, overlaps, maxScrollY } = await tabWalk(c, {
    name: 'focus', probeParent: '#view-games',
    skip: ['.bar', '#actionbar'], bars: ['.bar', '#actionbar:not([hidden])'],
  });
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
