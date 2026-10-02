/* #287: the welcome lockup clears the iPhone status bar and is bigger. With a
 * 59px top safe-area inset emulated (a Dynamic Island iPhone; CDP
 * `Emulation.setSafeAreaInsetsOverride`), the logo's svg must paint 36x36 and
 * its top edge must sit at least 59px plus the old 16px padding below the top
 * of the viewport. The wordmark is the --fs-title token (the owner asked for
 * 1.35rem; type-scale.test.js allows only --fs-* tokens), read resolved from
 * the page. The numbers are the issue's own.
 * The mark animates in from scale(.6); `land` waits out finite animations
 * before the probe reads it. A missing logo or a refused inset override FAILS, never skips.
 * Height: at 390x745 with no inset the page may be no taller than it was with
 * the old 26px lockup. The old lockup is restored in the same page by a
 * <style>, so the baseline shares the machine, the font and the headline
 * wrapping -- no hand-measured constant to drift on CI. */
import { evalIn, WIDTH } from './dom.mjs';
import { land, resize } from './page-state.mjs';
import { WELCOME_LANDING } from './fixtures.mjs';

const INSET = 59;
const FIT_HEIGHT = 745; // the Safari-tab phone; app.css's .wel-show comment names it
const OVERFLOW = `document.documentElement.scrollHeight - innerHeight`;
const OLD_PADDING = 16; // clamp(1rem, 4vw, 3rem) at the 390px smoke width (spec item 2: clear the inset plus the old padding)
const GAP_REM = 0.55; // spec item 1: the lockup gap is .55rem
// The lockup as it was before #287 (spec Design): 26px mark, --fs-headline
// wordmark, .45rem gap, .62rem under the lockup, .7rem above the stage.
const OLD_LOCKUP_CSS = `.wel-mark svg { width: 26px !important; height: 26px !important; }
  .wel-lockup { font-size: var(--fs-headline) !important; gap: .45rem !important; margin-bottom: .62rem !important; }
  .wel-stage { margin-top: .7rem !important; }`;
const ADD_OLD = `(() => { const s = document.createElement('style'); s.id = 'oldLockup'; s.textContent = ${JSON.stringify(OLD_LOCKUP_CSS)}; document.head.appendChild(s); })()`;

const PROBE = `(() => {
  const svg = document.querySelector('.wel-mark svg');
  const word = document.querySelector('.wel-lockup b');
  const lockup = document.querySelector('.wel-lockup');
  if (!svg || !word) return JSON.stringify({ found: false });
  const r = svg.getBoundingClientRect();
  return JSON.stringify({ found: true, w: r.width, h: r.height, top: r.top,
    wordPx: parseFloat(getComputedStyle(word).fontSize),
    titlePx: (() => { const t = document.createElement('span'); t.style.fontSize = 'var(--fs-title)';
      document.body.appendChild(t); const px = parseFloat(getComputedStyle(t).fontSize); t.remove(); return px; })(),
    rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    gapPx: parseFloat(getComputedStyle(lockup).columnGap) });
})()`;

export async function welcomeLockupPass(c, origin) {
  const problems = [];
  let m = null;
  let fit = null;
  let old = null;
  try {
    await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: INSET } });
    await land(c, origin, WELCOME_LANDING);
    m = JSON.parse(await evalIn(c, PROBE));
    if (!m.found) problems.push('no .wel-mark svg or .wel-lockup b on the welcome screen');
    else {
      if (Math.round(m.w) !== 36 || Math.round(m.h) !== 36) problems.push(`the logo is ${m.w}x${m.h}, want 36x36`);
      if (m.top < INSET + OLD_PADDING) problems.push(`the logo's top is ${m.top}px with a ${INSET}px inset, want at least ${INSET + OLD_PADDING}`);
      if (Math.abs(m.wordPx - m.titlePx) > 0.5) problems.push(`the wordmark is ${m.wordPx}px, want --fs-title (${m.titlePx}px)`);
      if (Math.abs(m.gapPx - GAP_REM * m.rootPx) > 1) problems.push(`the lockup gap is ${m.gapPx}px, want about ${GAP_REM}rem (${GAP_REM * m.rootPx}px)`);
      // Safari tab mode: the status bar is outside the layout viewport, so the
      // inset is 0 and the page may not run past the 745px viewport -- or the
      // footer lands under the address bar. (Standalone has the inset inside a
      // taller viewport, so the inset at 745 is not a real condition.)
      await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0 } });
      await resize(c, WIDTH, FIT_HEIGHT);
      fit = Number(await evalIn(c, OVERFLOW));
      await evalIn(c, ADD_OLD);
      old = Number(await evalIn(c, OVERFLOW));
      if (fit > old) problems.push(`the welcome page is ${fit}px taller than a ${WIDTH}x${FIT_HEIGHT} viewport; the old lockup in this page was ${old}px, and every px more pushes the footer further under the address bar`);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0 } }).catch(() => {});
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join(' | ')
      : `welcome logo ${m.w}x${m.h}, top at ${Math.round(m.top)}px under a ${INSET}px inset; wordmark ${m.wordPx}px; ${fit}px over a ${WIDTH}x${FIT_HEIGHT} viewport (old lockup, same page: ${old}px)`,
  };
}
