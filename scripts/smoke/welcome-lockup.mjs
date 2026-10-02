/* #287: the welcome lockup clears the iPhone status bar and is bigger. With a
 * 59px top safe-area inset emulated (a Dynamic Island iPhone; CDP
 * `Emulation.setSafeAreaInsetsOverride`), the logo's svg must paint 36x36 and
 * its top edge must sit at least 59px plus the old 16px padding below the top
 * of the viewport; the wordmark is 1.35rem, which the type scale (type-scale.test.js allows
 * only --fs-* tokens) spells --fs-title, 1.375rem: within 0.5px. The numbers
 * are the issue's own.
 * The mark animates in from scale(.6), so it is measured after its animations
 * finish. A missing logo or a refused inset override FAILS, never skips. */
import { evalIn } from './dom.mjs';
import { land, reset } from './page-state.mjs';
import { WELCOME_LANDING } from './fixtures.mjs';

const INSET = 59;
const OLD_PADDING = 16; // clamp(1rem, 4vw, 3rem) at the 390px smoke width

const PROBE = `(async () => {
  const mark = document.querySelector('.wel-mark');
  const svg = document.querySelector('.wel-mark svg');
  const word = document.querySelector('.wel-lockup b');
  const gap = document.querySelector('.wel-lockup');
  if (!mark || !svg || !word) return JSON.stringify({ found: false });
  await Promise.all(mark.getAnimations().map(a => a.finished));
  const r = svg.getBoundingClientRect();
  return JSON.stringify({ found: true, w: r.width, h: r.height, top: r.top,
    wordPx: parseFloat(getComputedStyle(word).fontSize),
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    gapPx: parseFloat(getComputedStyle(gap).columnGap) });
})()`;

export async function welcomeLockupPass(c, origin) {
  const problems = [];
  let m = null;
  try {
    await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: INSET } });
    await land(c, origin, WELCOME_LANDING);
    m = JSON.parse(await evalIn(c, PROBE));
    if (!m.found) problems.push('no .wel-mark svg or .wel-lockup b on the welcome screen');
    else {
      if (Math.round(m.w) !== 36 || Math.round(m.h) !== 36) problems.push(`the logo is ${m.w}x${m.h}, want 36x36`);
      if (m.top < INSET + OLD_PADDING) problems.push(`the logo's top is ${m.top}px with a ${INSET}px inset, want at least ${INSET + OLD_PADDING}`);
      if (Math.abs(m.wordPx - 1.35 * m.rootPx) > 0.5) problems.push(`the wordmark is ${m.wordPx}px, want 1.35rem (${1.35 * m.rootPx}px)`);
      if (Math.abs(m.gapPx - 0.55 * m.rootPx) > 1) problems.push(`the lockup gap is ${m.gapPx}px, want about .55rem (${0.55 * m.rootPx}px)`);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0 } }).catch(() => {});
    await reset(c, origin).catch(() => {});
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join(' | ')
      : `welcome logo ${m.w}x${m.h}, top at ${Math.round(m.top)}px under a ${INSET}px inset; wordmark ${m.wordPx}px`,
  };
}
