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
import { land, reset, resize } from './page-state.mjs';
import { WELCOME_LANDING } from './fixtures.mjs';

const INSET = 59;
const FIT_HEIGHT = 745; // app.css's .wel-show comment: the Safari-tab phone the page must fit
// Measured on main before #287 (26px logo, 17px wordmark), same emulation:
// scrollHeight 816 at innerHeight 745. The comment's "781 -> 739" no longer
// holds -- the headline has grown since -- so the page already ran 71px over.
// The lockup must not make that worse.
const MAIN_OVER = 71;
const OVERFLOW = `document.documentElement.scrollHeight - innerHeight`;
const OLD_PADDING = 16; // clamp(1rem, 4vw, 3rem) at the 390px smoke width

const PROBE = `(async () => {
  const mark = document.querySelector('.wel-mark');
  const svg = document.querySelector('.wel-mark svg');
  const word = document.querySelector('.wel-lockup b');
  const lockup = document.querySelector('.wel-lockup');
  if (!mark || !svg || !word) return JSON.stringify({ found: false });
  await Promise.all(mark.getAnimations().map(a => a.finished));
  const r = svg.getBoundingClientRect();
  return JSON.stringify({ found: true, w: r.width, h: r.height, top: r.top,
    wordPx: parseFloat(getComputedStyle(word).fontSize),
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    gapPx: parseFloat(getComputedStyle(lockup).columnGap) });
})()`;

export async function welcomeLockupPass(c, origin) {
  const problems = [];
  let m = null;
  let fit = null;
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
      // Safari tab mode: the status bar is outside the layout viewport, so the
      // inset is 0 and the page may not run past the 745px viewport -- or the
      // footer lands under the address bar. (Standalone has the inset inside a
      // taller viewport, so the inset at 745 is not a real condition.)
      await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0 } });
      await resize(c, 390, FIT_HEIGHT);
      fit = Number(await evalIn(c, OVERFLOW));
      if (fit > MAIN_OVER) problems.push(`the welcome page is ${fit}px taller than a 390x${FIT_HEIGHT} viewport; main was ${MAIN_OVER}px, and every px more pushes the footer further under the address bar`);
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
      : `welcome logo ${m.w}x${m.h}, top at ${Math.round(m.top)}px under a ${INSET}px inset; wordmark ${m.wordPx}px; ${fit}px over a 390x${FIT_HEIGHT} viewport (main: ${MAIN_OVER}px)`,
  };
}
