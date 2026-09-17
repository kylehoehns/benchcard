import { evalIn, SETTLE } from './dom.mjs';
import { nameOf } from './registry.mjs';

/* #24 item 5: the card does not scale. Extends the `cardsize` row rather than
   adding a new one — same seam, same name, so `--only "card is 3.45 × 5in"`
   proves this too. Reuses the existing `Page.setFontSizes` idiom (see
   `appLargeTextPass`) for the 32px root. `card.css` and `card.js`'s fitting
   are untouched by #24, so this MEASURES that stays true rather than
   implementing anything: the card's own font stack is set from canvas
   `measureText`, independent of the root rem this ticket changes. */
/* #29 decisions 2 and 5: `.card` (inside `#sheet`) only shows on screen in
   the Card view; a fresh/reloaded page lands on Timeline (the default), so
   this clicks `#viewSeg`'s Card button first -- the same click
   `smoke-checks.js`'s own "card is 3.45 × 5in" check makes -- rather than
   measuring a `.card` that exists but is not laid out. */
async function measureCard(c) {
  return JSON.parse(await evalIn(c, `(() => {
    const viewCard = document.querySelector('#viewSeg button[data-view="card"]');
    if (viewCard) viewCard.click();
    const card = document.querySelector('.card:not(.card-copy)');
    if (!card) return JSON.stringify(null);
    const z = card.currentCSSZoom || 1;
    const r = card.getBoundingClientRect();
    const five = card.querySelector('.five');
    const chg = card.querySelector('.chg');
    return JSON.stringify({
      w: Math.round(r.width / z * 100) / 100,
      h: Math.round(r.height / z * 100) / 100,
      five: five ? getComputedStyle(five).fontSize : null,
      chg: chg ? getComputedStyle(chg).fontSize : null,
    });
  })()`));
}

// Shared by the two reloads `cardAt32Pass` below does (into the 32px
// measurement, then back out of it): `Page.navigate` alone does not await
// paint, so every caller in this file pairs it with the load event.
async function reloadIndex(c, origin) {
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Page.navigate', { url: origin + '/index.html' });
  await loaded;
}

export async function cardAt32Pass(c, origin, report) {
  const check = report.checks.find(k => k.name === nameOf('cardsize'));
  if (!check) return; // the base check is gone -- nothing here to extend

  const at16 = await measureCard(c);
  const problems = [];
  if (!at16) {
    check.pass = false;
    check.detail += ' | no .card at a 16px root to compare against';
    return;
  }

  await c.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
  let at32;
  try {
    await reloadIndex(c, origin);
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
    at32 = await measureCard(c);
  } finally {
    // Never leave the emulated font size on, and leave the app reloaded at
    // 16px so whatever runs next (goRich, in the full run) starts clean.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await reloadIndex(c, origin);
  }

  if (!at32) {
    problems.push('no .card at a 32px root');
  } else {
    if (Math.abs(at32.w - at16.w) > 1 || Math.abs(at32.h - at16.h) > 1) {
      problems.push(`card measures ${at32.w}×${at32.h}px at a 32px root, ${at16.w}×${at16.h}px at 16px`);
    }
    if (at16.five !== at32.five) problems.push(`.five is ${at32.five} at a 32px root, ${at16.five} at 16px`);
    if (at16.chg !== at32.chg) problems.push(`.chg is ${at32.chg} at a 32px root, ${at16.chg} at 16px`);
  }

  check.pass = check.pass && problems.length === 0;
  check.detail += problems.length
    ? ` | 32px root: ${problems.join('; ')}`
    : ` | 32px root: unchanged (${at32.w}×${at32.h}px, .five ${at32.five}, .chg ${at32.chg})`;
}
