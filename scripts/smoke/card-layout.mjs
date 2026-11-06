import { evalIn } from './dom.mjs';
import { land } from './page-state.mjs';
import { REFERENCE_GAMES, referenceGame, squeezeGame, fourInGame } from './fixtures.mjs';
import { LARGE_TEXT_PX } from './sizes.mjs';
import { isBigRow } from '../../app/card-spec.js';
import { capInstall, capUse, capRead, capRestore } from './capture.mjs';

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
    // the prototype dropped STAY here; it now takes its own line under OUT (stayOwnLine below)
    long5: { few: 14, big: 13.5, wrapped: [1] },
  },
  half: {
    std: { few: 23 }, lines: { big: 19 }, mixed: { few: 21, big: 18 },
    long5: { few: 20, big: 17, wrapped: [1] },
  },
};
const TIME_PX = { pocket: ['13px', '16px'], half: ['18px', '26px'] };

const MEASURE = `(() => {
  const cards = [...document.querySelectorAll('#sheet .card:not(.card-copy)')];
  if (!cards.length) return JSON.stringify(null);
  const px = e => parseFloat(getComputedStyle(e).fontSize);
  const rect = e => { const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
  const problems = [];
  const wide = (e, what) => { if (e.scrollWidth > e.clientWidth + 1) problems.push(what + ' is ' + e.scrollWidth + 'px wide in a ' + e.clientWidth + 'px box: ' + e.textContent.trim().slice(0, 30)); };
  cards.forEach((card, k) => {
    const rows = [...card.querySelectorAll('.crow')];
    const cr = rect(card);
    const at = cards.length > 1 ? 'card ' + (k + 1) + ' ' : '';
    rows.forEach((r, i) => {
      const rr = rect(r);
      for (const e of r.querySelectorAll('.cchips, .lineup, .grp, .sub, .b, .mid')) {
        if (!e.checkVisibility()) continue;
        if (!e.matches('.cwrap')) wide(e, at + 'row ' + i + ' ' + e.className);
        const er = rect(e);
        if (er.b > rr.b + 0.75 || er.t < rr.t - 0.75) problems.push(at + 'row ' + i + ' ' + e.className + ' spills out of its row (' + er.t.toFixed(1) + '-' + er.b.toFixed(1) + ' in ' + rr.t.toFixed(1) + '-' + rr.b.toFixed(1) + ')');
      }
      if (i && rr.t < rect(rows[i - 1]).b - 0.75) problems.push(at + 'row ' + i + ' overlaps the row above');
      if (rr.b > cr.b + 0.75) problems.push(at + 'row ' + i + ' runs past the bottom of the card');
    });
    const ft = card.querySelector('.card-ft');
    if (ft && rect(ft).b > cr.b + 0.75) problems.push(at + 'the footer runs past the bottom of the card');
    const list = card.querySelector('.list');
    if (list.scrollHeight > list.clientHeight + 1) problems.push(at + 'the rows are taller than the list: ' + list.scrollHeight + ' > ' + list.clientHeight);
  });
  const card = cards[0], z = card.currentCSSZoom || 1;
  const rows = [...card.querySelectorAll('.crow')];
  const cr = rect(card);
  const chipRows = rows.map(r => r.querySelector('.cchips')).map(c => c && { n: c.querySelectorAll('.cchip').length, px: px(c.querySelector('.cchip')), wrap: c.classList.contains('cwrap') });
  return JSON.stringify({
    cards: cards.length, rows: rows.length, chipRows, problems,
    nostay: card.classList.contains('nostay'),
    stays: [...card.querySelectorAll('.g-stay')].filter(e => e.checkVisibility()).length,
    time: [px(card.querySelector('.ctime .cq')), px(card.querySelector('.ctime .cclk'))].map(v => v + 'px'),
    w: Math.round(cr.r - cr.l) / z, h: Math.round(cr.b - cr.t) / z,
  });
})()`;

const sizesOf = (m, tier) => [...new Set(m.chipRows.filter(c => c && (tier === 'big') === isBigRow(c.n)).map(c => c.px))];

/* A clock is two digits wide in a 12-minute quarter or a 20-minute half (12:00,
   20:00), and the time column was sized for 8:00. The width of the text itself
   is read from a Range over it, not from scrollWidth, which a block box hides. */
const CLOCK = `(() => {
  const card = document.querySelector('#sheet .card:not(.card-copy)');
  if (!card) return JSON.stringify(null);
  const z = card.currentCSSZoom || 1;
  const all = [...card.querySelectorAll('.crow')].map(r => {
    const t = r.querySelector('.ctime'), tr = t.getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(t);
    const next = t.nextElementSibling.getBoundingClientRect();
    return { clock: t.querySelector('.cclk').textContent, right: rg.getBoundingClientRect().right / z, col: Math.min(tr.right, next.left) / z };
  });
  return JSON.stringify(all);
})()`;

async function wideClocks(c, origin, rec, size, periodMinutes, granValue, textPx) {
  const record = referenceGame('std', size);
  Object.assign(record.teams[0].days[0].games[0], { periodMinutes, granValue });
  const where = `${periodMinutes}-minute periods ${size} at ${textPx ? textPx : 16}px`;
  await land(c, origin, { record, textPx, ready: `document.querySelector('#sheet .card .crow')` });
  const rows = JSON.parse(await evalIn(c, CLOCK));
  if (!rows || !rows.some(r => r.clock.length >= 5)) { rec.fail(`${where}: no two-digit clock on the card (${rows && rows.map(r => r.clock)})`); return; }
  for (const r of rows) rec.check(r.right <= r.col + 0.5, `${where}: the clock ${r.clock} reaches ${r.right.toFixed(1)}px, past its column at ${r.col.toFixed(1)}px`);
}

/* The worst a card can be asked for: ten five-letter names, every row all five
   in (fixtures.mjs `squeezeGame`). Even at the smallest boxes and the 0.8
   squeeze the eight rows are taller than one card, so the game has to split
   into more cards rather than let the rows push the footer off the paper. */
async function squeezePass(c, origin, rec, size, textPx) {
  const where = `the all-five five-letter game ${size} at ${textPx ? textPx : 16}px`;
  await land(c, origin, { record: squeezeGame(size, 7), textPx, ready: `document.querySelector('#sheet .card .crow')` });
  const m = JSON.parse(await evalIn(c, MEASURE));
  if (!m) { rec.fail(`${where}: no card on screen`); return; }
  rec.check(m.cards >= 2, `${where}: ${m.cards} card(s), want the game split into 2 or more`);
  for (const p of m.problems) rec.fail(`${where}: ${p}`);
}

/* A card squeezed to fit (the names area at 0.88 or 0.95) shares as an image
   with its names still inside their boxes. The share paints from computed font
   sizes, which a CSS zoom does not scale, so it once drew full-size names in
   boxes that were 0.88 of that: the last letter of each ran off the box in
   white on white. */
async function squeezedShare(c, origin, rec, size) {
  const where = `the squeezed card ${size}, shared as an image`;
  await land(c, origin, { record: { ...squeezeGame(size, 6), ui: { ...squeezeGame(size, 6).ui, showMinutes: true } }, ready: `document.querySelector('#sheet .card .crow')` });
  const zoom = JSON.parse(await evalIn(c, `JSON.stringify(parseFloat(document.querySelector('#sheet .card [style*=zoom]')?.style.zoom || 1))`));
  rec.check(zoom < 1, `${where}: the card is not squeezed (zoom ${zoom}), so this proves nothing`);
  await capInstall(c);
  try {
    await capUse(c, {});
    await evalIn(c, `document.getElementById('shareCard').click()`);
    await evalIn(c, `new Promise(r => setTimeout(r, 500))`);
    const png = (await capRead(c)).clicks[0];
    const ink = png?.boxes?.chipInk;
    rec.check(ink >= 0.97 && ink <= 1.03, `${where}: the first name was drawn ${ink} times as wide as the card laid it out, want 1 (within 3%)`);
  } finally { await capRestore(c); }
}

/* The title is elided only when it will not fit. The header's room is what is
   left after the date and the mark, so measuring those at the wrong weight
   (the CSS prints the date at 700 and the mark at 600) shaved a few pixels and
   cut names that fit. These two are the longest that fit, found by sweeping. */
const FITS = { pocket: 'Mmmm Wwww R', half: 'Mmmm Wwww Rrrr Hhhh Ssss Tttt' };
async function titleFits(c, origin, rec, size) {
  const record = referenceGame('std', size);
  record.teams[0].days[0].games[0].label = FITS[size];
  await land(c, origin, { record, ready: `document.querySelector('#sheet .card .crow')` });
  const t = JSON.parse(await evalIn(c, `JSON.stringify(document.querySelector('#sheet .card:not(.card-copy) .card-hd .opp').textContent)`));
  rec.check(t === 'VS ' + FITS[size].toUpperCase(), `the title that fits ${size} was printed as "${t}"`);
}

/* Four in at every sub leaves one kid on, and that kid is the one a coach
   cannot work out at a glance. STAY did not fit beside a four-name OUT, so the
   pocket card used to drop it from every row. Now it takes its own line under
   OUT, and the card stays one card: the usual squeeze (padding, then the names
   area down to 85%) makes the room. STAY comes off only when even that is not
   enough. */
const STAY_LINE = `(() => {
  const card = document.querySelector('#sheet .card:not(.card-copy)');
  const rows = [...card.querySelectorAll('.crow')].slice(1);
  const own = rows.filter(r => { const o = r.querySelector('.g-out'), s = r.querySelector('.g-stay');
    return o && s && s.checkVisibility() && s.getBoundingClientRect().top >= o.getBoundingClientRect().bottom - 1; }).length;
  return JSON.stringify({ own });
})()`;
async function stayOwnLine(c, origin, rec, textPx) {
  const where = `four in at every sub, pocket at ${textPx ?? 16}px`;
  await land(c, origin, { record: fourInGame('pocket'), textPx, ready: `document.querySelector('#sheet .card .crow')` });
  const m = JSON.parse(await evalIn(c, MEASURE));
  if (!m) { rec.fail(`${where}: no card on screen`); return; }
  const { own } = JSON.parse(await evalIn(c, STAY_LINE));
  rec.check(m.cards === 1 && m.rows === 8, `${where}: ${m.rows} rows on ${m.cards} card(s), want 8 on 1`);
  rec.check(!m.nostay && m.stays === 7, `${where}: STAY shows on ${m.stays} rows${m.nostay ? ' (dropped)' : ''}, want all 7 sub rows`);
  rec.check(own === 7, `${where}: STAY is on its own line under OUT on ${own} rows, want 7`);
  for (const p of m.problems) rec.fail(`${where}: ${p}`);
}

export async function cardLayoutPass(c, origin, rec) {
  for (const textPx of [undefined, LARGE_TEXT_PX]) await stayOwnLine(c, origin, rec, textPx);
  for (const size of ['pocket', 'half']) await titleFits(c, origin, rec, size);
  for (const size of ['pocket', 'half']) await squeezedShare(c, origin, rec, size);
  for (const textPx of [undefined, LARGE_TEXT_PX]) for (const size of ['pocket', 'half']) await squeezePass(c, origin, rec, size, textPx);
  for (const textPx of [undefined, LARGE_TEXT_PX]) {
    await wideClocks(c, origin, rec, 'pocket', 12, 6, textPx);
    await wideClocks(c, origin, rec, 'pocket', 20, 10, textPx);
    await wideClocks(c, origin, rec, 'half', 20, 10, textPx);
  }
  const timeAt = {};
  for (const textPx of [undefined, LARGE_TEXT_PX]) {
    for (const size of ['pocket', 'half']) {
      for (const name of REFERENCE_GAMES) {
        const where = `${name} ${size} at ${textPx ? textPx : 16}px`;
        await land(c, origin, { record: referenceGame(name, size), textPx, ready: `document.querySelector('#sheet .card .crow')` });
        const m = JSON.parse(await evalIn(c, MEASURE));
        if (!m) { rec.fail(`${where}: no card on screen`); continue; }
        rec.check(m.rows === 8 && m.cards === 1, `${where}: ${m.rows} rows on ${m.cards} card(s), want 8 on 1`);
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
  rec.ok('the four reference games, pocket and half, at 16px and 32px: the prototype\'s box sizes, wraps and STAY, nothing clipped or overlapping, the time column unchanged, two-digit clocks inside it, the worst game split into cards, a squeezed card shared with its names inside their boxes, and a title that fits not elided');
}
