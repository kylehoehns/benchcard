import { evalIn } from './dom.mjs';
import { land } from './page-state.mjs';
import { REFERENCE_GAMES, referenceGame } from './fixtures.mjs';
import { LARGE_TEXT_PX } from './sizes.mjs';

/* #622 items 4-8 and 11: the printed card's layout, on the four reference
   games (fixtures.mjs `referenceGame`) at both sizes, at a 16px root and a 32px
   one, through the Card view at 390x844.

   WHAT IS ASSERTED. `WANT` is the judged prototype's own decisions, read off
   its pages in Chrome (docs/specs/622-card-redesign/prototype.mjs) with the
   same fonts: the box size each tier settles on, which rows wrapped, and
   whether STAY was dropped. The app has to land within half a pixel of them.
   Then the layout facts that make a card unreadable when they are wrong: no
   text wider than its own box, no row's content spilling onto the next row, no
   row overlapping another, nothing past the bottom of the card, and the time
   column at the same font size at a 32px root as at 16px.

   A CHECK THAT MEASURED NOTHING FAILS. Every card must hold the eight rows the
   game has, with boxes in seven of them; a record that did not load, a card
   that rendered empty or a renamed class finds zero and is red. */
const WANT = {
  pocket: {
    std: { few: 16 }, lines: { big: 14 }, mixed: { few: 17.5, big: 15 },
    long5: { few: 14, big: 13.5, wrapped: [1], nostay: true },
  },
  half: {
    std: { few: 23 }, lines: { big: 19 }, mixed: { few: 21, big: 18 },
    long5: { few: 20, big: 17, wrapped: [1] },
  },
};
const TIME_PX = { pocket: ['13px', '16px'], half: ['18px', '26px'] };

const MEASURE = `(() => {
  const card = document.querySelector('#sheet .card:not(.card-copy)');
  if (!card) return JSON.stringify(null);
  const z = card.currentCSSZoom || 1;
  const px = e => parseFloat(getComputedStyle(e).fontSize);
  const rect = e => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
  const rows = [...card.querySelectorAll('.crow')];
  const cr = rect(card);
  const problems = [];
  const wide = (e, what) => { if (e.scrollWidth > e.clientWidth + 1) problems.push(what + ' is ' + e.scrollWidth + 'px wide in a ' + e.clientWidth + 'px box: ' + e.textContent.trim().slice(0, 30)); };
  rows.forEach((r, i) => {
    const rr = rect(r);
    for (const e of r.querySelectorAll('.cchips, .lineup, .grp, .sub, .b, .mid')) {
      if (!e.checkVisibility()) continue;
      if (!e.matches('.cwrap')) wide(e, 'row ' + i + ' ' + e.className);
      const er = rect(e);
      if (er.b > rr.b + 0.75 || er.t < rr.t - 0.75) problems.push('row ' + i + ' ' + e.className + ' spills out of its row (' + er.t.toFixed(1) + '-' + er.b.toFixed(1) + ' in ' + rr.t.toFixed(1) + '-' + rr.b.toFixed(1) + ')');
    }
    if (i && rr.t < rect(rows[i - 1]).b - 0.75) problems.push('row ' + i + ' overlaps the row above');
    if (rr.b > cr.b + 0.75) problems.push('row ' + i + ' runs past the bottom of the card');
  });
  const ft = card.querySelector('.card-ft');
  if (ft && rect(ft).b > cr.b + 0.75) problems.push('the footer runs past the bottom of the card');
  const list = card.querySelector('.list');
  if (list.scrollHeight > list.clientHeight + 1) problems.push('the rows are taller than the list: ' + list.scrollHeight + ' > ' + list.clientHeight);
  const chipRows = rows.map(r => r.querySelector('.cchips')).map(c => c && { n: c.querySelectorAll('.cchip').length, px: px(c.querySelector('.cchip')), wrap: c.classList.contains('cwrap') });
  return JSON.stringify({
    rows: rows.length, chipRows, problems,
    nostay: card.classList.contains('nostay'),
    stays: [...card.querySelectorAll('.g-stay')].filter(e => e.checkVisibility()).length,
    time: [px(card.querySelector('.ctime .cq')), px(card.querySelector('.ctime .cclk'))].map(v => v + 'px'),
    w: Math.round(cr.r - cr.l) / z, h: Math.round(cr.b - cr.t) / z,
  });
})()`;

const sizesOf = (m, tier) => [...new Set(m.chipRows.filter(c => c && (tier === 'big' ? c.n >= 4 : c.n < 4)).map(c => c.px))];

export async function cardLayoutPass(c, origin, rec) {
  const timeAt = {};
  for (const textPx of [undefined, LARGE_TEXT_PX]) {
    for (const size of ['pocket', 'half']) {
      for (const name of REFERENCE_GAMES) {
        const where = `${name} ${size} at ${textPx ? textPx : 16}px`;
        await land(c, origin, { record: referenceGame(name, size), textPx, ready: `document.querySelector('#sheet .card .crow')` });
        const m = JSON.parse(await evalIn(c, MEASURE));
        if (!m) { rec.fail(`${where}: no card on screen`); continue; }
            rec.check(m.rows === 8, `${where}: ${m.rows} rows, want 8`);
        rec.check(m.chipRows.filter(Boolean).length === 7, `${where}: boxes on ${m.chipRows.filter(Boolean).length} rows, want 7`);
        const want = WANT[size][name];
        for (const tier of ['few', 'big']) {
          const got = sizesOf(m, tier);
          if (want[tier] === undefined) rec.check(got.length === 0, `${where}: ${tier} boxes exist (${got}) but the prototype has none`);
          else rec.check(got.length === 1 && Math.abs(got[0] - want[tier]) <= 0.5, `${where}: ${tier} boxes are ${got}px, the prototype's are ${want[tier]}px`);
        }
        const wrapped = m.chipRows.flatMap((r, i) => (r && r.wrap ? [i] : []));
        rec.check(JSON.stringify(wrapped) === JSON.stringify(want.wrapped ?? []), `${where}: rows ${JSON.stringify(wrapped)} wrapped, the prototype wraps ${JSON.stringify(want.wrapped ?? [])}`);
        rec.check(m.nostay === !!want.nostay, `${where}: STAY is ${m.nostay ? 'dropped' : 'kept'}, the prototype ${want.nostay ? 'drops' : 'keeps'} it`);
        // std keeps STAY on all 7 sub rows; mixed and long5 open with a 5-for-5 swap, which has nobody to stay
        if (!want.nostay) { const stays = { std: 7, lines: 0, mixed: 6, long5: 6 }[name]; rec.check(m.stays === stays, `${where}: STAY shows on ${m.stays} rows, want ${stays}`); }
        for (const p of m.problems) rec.fail(`${where}: ${p}`);
        rec.check(JSON.stringify(m.time) === JSON.stringify(TIME_PX[size]), `${where}: time column is ${m.time}, want ${TIME_PX[size]}`);
        timeAt[`${size}${name}${textPx ?? 16}`] = m.time.join('/');
      }
    }
  }
  rec.ok('the four reference games, pocket and half, at 16px and 32px: the prototype\'s box sizes, wraps and STAY, nothing clipped or overlapping, the time column unchanged');
}
