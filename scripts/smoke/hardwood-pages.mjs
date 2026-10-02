import { evalIn, samplePixels } from './dom.mjs';
import { contrast } from '../tokens-css.mjs';
import { RICH, WELCOME_READY } from './fixtures.mjs';
import { land, reset } from './page-state.mjs';

/* #231's own guard (docs/specs/231-hardwood-pages.md, Proof section): the
 * welcome screen, about.html and advanced.html carry the Hardwood orange --
 * an orange main button and links, and one orange phrase in the h1. #242
 * took away the soft orange band #231 put behind the headline, so the block
 * that held it must now paint no gradient.
 *
 * Expected colors are the spec's own literals, typed once here as rgb()
 * strings, never read back from tokens.css or resolved the way the pages
 * resolve them: Hardwood light #D2500A, dark #FF7A2A (spec item 1), and the
 * two more-contrast steps tokens.css documents (#993A07 light, #FF853B
 * dark). The more-contrast and dark cases are the SELECTOR TRAP's proof:
 * `:root[data-theme="dark"]` and the more-contrast blocks outrank a plain
 * `:root` remap, and only a browser painting the page can say the remap won.
 *
 * Every color is resolved through a 1x1 canvas (/browser-verify section 5),
 * never a `getComputedStyle` string compared as text, because a `color-mix()`
 * or a var() chain does not serialize the way a literal does. A missing headline block,
 * `.hl` or button FAILS (rule 2a); it is never skipped.
 *
 * Contrast (spec item 4) uses `contrast` from `scripts/tokens-css.mjs`. The
 * backdrop is the PAINTED pixel 2px up and left of the text's box, read from a
 * real screenshot (`samplePixels`, dom.mjs), so whatever actually paints
 * under a line of text is what gets measured, and --muted clears 4.5:1 on the page ground by only
 * 0.25, which a full-strength tint would take away. */
const CASES = [
  { name: 'light', media: [{ name: 'prefers-color-scheme', value: 'light' }], want: 'rgb(210, 80, 10)' },
  { name: 'dark', media: [{ name: 'prefers-color-scheme', value: 'dark' }], want: 'rgb(255, 122, 42)' },
  { name: 'light, more contrast', media: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-contrast', value: 'more' }], want: 'rgb(153, 58, 7)' },
  { name: 'dark, more contrast', media: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-contrast', value: 'more' }], want: 'rgb(255, 133, 59)' },
];
const GRAPHITE_INK = 'rgb(28, 28, 30)';
/* Every team tint the welcome logo can wear (graphite is no attribute). */
const TINTS = [null, 'hardwood', 'royal', 'navy', 'maroon', 'red', 'forest', 'gold', 'purple'];
const HARDWOOD_LIGHT = CASES[0].want;
/* #277: the card is the mark's paper wherever paper reads on the tint (3:1),
   and only otherwise falls back to the tint's ink. */
const PAPER = [244, 244, 246];
const PAPER_RGB = 'rgb(244, 244, 246)';

const PAGES = [
  { name: 'about', page: '/about', record: 'kept', ready: `document.querySelector('h1')`,
    h1: 'Even minutes, worked out before the game.', phrase: 'Even minutes',
    band: '.hero-band', h1Sel: 'h1', hl: 'h1 .hl', button: '.cta .btn.primary', link: 'p a', body: '.lede' },
  { name: 'advanced', page: '/advanced', record: 'kept', ready: `document.querySelector('h1')`,
    h1: 'The reference', phrase: 'reference',
    band: '.hero-band', h1Sel: 'h1', hl: 'h1 .hl', button: '.cta .btn.primary', link: 'p a', body: '.lede' },
  { name: 'welcome', page: '/index.html', record: 'wiped', ready: WELCOME_READY,
    h1: 'The whole game, worked out before you leave the house.', phrase: 'The whole game',
    band: '.wel-hero', h1Sel: 'h1.wel-h', hl: 'h1.wel-h .hl', button: '#welStart', link: null, body: '.wel-sub',
    mark: '.wel-mark svg > rect:first-child' },
];

/* One in-page read. Everything a color is resolved through the canvas. */
const READ = p => `(() => {
  const $ = s => document.querySelector(s);
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = css => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]];
  };
  const fg = s => { const e = $(s); return e ? rgba(getComputedStyle(e).color) : null; };
  const bg = s => { const e = $(s); return e ? rgba(getComputedStyle(e).backgroundColor) : null; };
  const root = getComputedStyle(document.documentElement);
  const band = $(${JSON.stringify(p.band)}), h1 = $(${JSON.stringify(p.h1Sel)});
  const hl = $(${JSON.stringify(p.hl)}), body = $(${JSON.stringify(p.body)});
  const r = e => e ? e.getBoundingClientRect() : null;
  const rb = r(band), rh = r(h1);
  return JSON.stringify({
    h1Text: h1 ? h1.textContent : null,
    hlText: hl ? hl.textContent : null,
    hlNowrap: hl ? getComputedStyle(hl).whiteSpace : null,
    hlColor: fg(${JSON.stringify(p.hl)}), h1Color: fg(${JSON.stringify(p.h1Sel)}),
    btnBg: bg(${JSON.stringify(p.button)}), btnFg: fg(${JSON.stringify(p.button)}),
    linkColor: ${p.link ? `fg(${JSON.stringify(p.link)})` : 'null'},
    bodyColor: fg(${JSON.stringify(p.body)}),
    markFill: ${p.mark ? `(e => e ? rgba(getComputedStyle(e).fill) : null)($(${JSON.stringify(p.mark)}))` : 'null'},
    bandImage: band ? getComputedStyle(band).backgroundImage : null,
    // #238: the h1's margin used to collapse out through the block; its
    // space above the h1 is the block's own padding now.
    h1Inset: band && h1 ? Math.round(rh.top - rb.top) : null,
    hlBox: hl ? { x: r(hl).left - 2, y: r(hl).top - 2 } : null,
    bodyBox: body ? { x: r(body).left - 2, y: r(body).top - 2 } : null,
    scroll: [window.scrollX, window.scrollY],
  });
})()`;

/* The welcome logo's ground and its card, for each team tint, in the page's
   current theme: set data-tint live (the welcome screen only shows on a wiped
   device, which is Hardwood), then resolve both fills through the canvas. */
const READ_LOGO_TINTS = `(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = css => {
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = css; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3]];
  };
  const fill = s => { const e = document.querySelector(s); return e ? rgba(getComputedStyle(e).fill) : null; };
  return JSON.stringify(${JSON.stringify(TINTS)}.map(t => {
    if (t) document.documentElement.dataset.tint = t; else delete document.documentElement.dataset.tint;
    return { tint: t || 'graphite', ground: fill('.wel-mark svg > rect:first-child'), card: fill('.wel-mark svg > g > rect:first-child') };
  }));
})()`;

/* WCAG contrast from the app's own `contrast` (tokens-css.mjs), which takes
   {r,g,b}; the colors resolved here are [r,g,b] arrays. */
const rgb = c => ({ r: c[0], g: c[1], b: c[2] });
const ratio = (a, b) => contrast(rgb(a), rgb(b));
const css = c => c ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : String(c);

async function readPage(c, origin, p, cse) {
  await land(c, origin, { page: p.page, record: p.record, media: cse.media, ready: p.ready });
  return JSON.parse(await evalIn(c, READ(p)));
}

export async function hardwoodPagesPass(c, origin) {
  const problems = [];
  const note = (where, msg) => problems.push(`${where}: ${msg}`);
  try {
    for (const cse of CASES) {
      for (const p of PAGES) {
        const where = `${p.name}, ${cse.name}`;
        const s = await readPage(c, origin, p, cse);
        // Item 3 and the crawlable-text constraint: the phrase exists, is the
        // spec's own words, the h1 reads the same as before and the phrase
        // wraps with its line.
        if (s.hlText === null) note(where, `no ${p.hl} element`);
        else if (s.hlText !== p.phrase) note(where, `the orange phrase reads "${s.hlText}", want "${p.phrase}"`);
        if (s.h1Text !== p.h1) note(where, `the h1 reads "${s.h1Text}", want "${p.h1}"`);
        if (s.hlNowrap === 'nowrap') note(where, 'the orange phrase is nowrap; it must wrap with its line');
        if (s.hlColor && css(s.hlColor) !== cse.want) note(where, `the phrase is ${css(s.hlColor)}, want ${cse.want}`);
        if (s.hlColor && s.h1Color && css(s.hlColor) === css(s.h1Color)) note(where, 'the rest of the h1 is the same color as the phrase');
        // Item 1: the main button and the links.
        if (!s.btnBg) note(where, `no ${p.button}`);
        else if (css(s.btnBg) !== cse.want) note(where, `${p.button} background is ${css(s.btnBg)}, want ${cse.want}`);
        // #244: the welcome logo's ground is the phrase's orange, not --accent.
        if (p.mark) {
          if (!s.markFill) note(where, `no ${p.mark}`);
          else if (css(s.markFill) !== cse.want) note(where, `the logo is ${css(s.markFill)}, want ${cse.want}`);
        }
        if (p.link) {
          if (!s.linkColor) note(where, `no ${p.link}`);
          else if (css(s.linkColor) !== cse.want) note(where, `links are ${css(s.linkColor)}, want ${cse.want}`);
        }
        // #242: no gradient behind the h1, and the h1 keeps its room.
        if (s.bandImage === null) note(where, `no ${p.band} block`);
        else {
          if (s.bandImage !== 'none') note(where, `${p.band} paints ${s.bandImage.slice(0, 40)}, want no background-image`);
          if (s.h1Inset !== null && s.h1Inset < 16) note(where, `the h1 sits ${s.h1Inset}px inside ${p.band}'s top edge, want at least 16`);
        }
        // Item 4: contrast, against the painted pixel up and left of each text
        // box (viewport points; the scroll offset is read back with them).
        if (s.hlColor && s.hlBox) {
          const [back] = await samplePixels(c, [s.hlBox], s.scroll[0], s.scroll[1]);
          const phrase = ratio(s.hlColor, back);
          if (phrase < 3) note(where, `the phrase on its backdrop is ${phrase.toFixed(2)}:1, want at least 3:1`);
        }
        if (s.bodyColor && s.bodyBox) {
          const [back] = await samplePixels(c, [s.bodyBox], s.scroll[0], s.scroll[1]);
          const body = ratio(s.bodyColor, back);
          if (body < 4.5) note(where, `${p.body} on its backdrop is ${body.toFixed(2)}:1, want at least 4.5:1`);
        }
        if (s.btnBg && s.btnFg) {
          const label = ratio(s.btnFg, s.btnBg);
          if (label < 4.5) note(where, `${p.button}'s label is ${label.toFixed(2)}:1 on the orange, want at least 4.5:1`);
        }
        // last, because it rewrites data-tint on the live page
        if (p.mark) {
          // #277: the card must read on the ground (non-text, 3:1) under every tint.
          for (const t of JSON.parse(await evalIn(c, READ_LOGO_TINTS))) {
            if (!t.ground || !t.card) { note(where, `no logo ground or card under ${t.tint}`); continue; }
            const r = ratio(t.card, t.ground);
            if (r < 3) note(where, `the logo's card ${css(t.card)} on its ground ${css(t.ground)} under ${t.tint} is ${r.toFixed(2)}:1, want at least 3:1`);
            // the card is paper wherever paper itself clears 3:1 on the ground
            if (ratio(PAPER, t.ground) >= 3 && css(t.card) !== PAPER_RGB) note(where, `the logo's card is ${css(t.card)} under ${t.tint}, want paper ${PAPER_RGB} (paper is ${ratio(PAPER, t.ground).toFixed(2)}:1 on ${css(t.ground)})`);
            if (cse.name === 'light' && t.tint === 'hardwood' && css(t.card) !== PAPER_RGB) note(where, `the logo's card in light Hardwood is ${css(t.card)}, want ${PAPER_RGB}`);
          }
        }
      }
    }

    // Item 6: a saved Graphite team keeps the app's buttons black, and
    // about.html stays Hardwood.
    const graphiteTeam = { ...RICH.teams[0], settings: { color: 'graphite' } };
    await land(c, origin, {
      record: { ...RICH, teams: [graphiteTeam] },
      media: CASES[0].media,
      ready: `document.getElementById('print')`,
    });
    const app = JSON.parse(await evalIn(c, `(() => {
      const e = document.getElementById('print'); return JSON.stringify(getComputedStyle(e).backgroundColor);
    })()`));
    if (app !== GRAPHITE_INK) note('graphite team', `the app's #print is ${app}, want ${GRAPHITE_INK}`);
    const about = await readPage(c, origin, PAGES[0], CASES[0]);
    if (!about.btnBg || css(about.btnBg) !== HARDWOOD_LIGHT) {
      note('graphite team', `about.html's main button is ${css(about.btnBg)}, want ${HARDWOOD_LIGHT}`);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await reset(c, origin).catch(() => {});
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'welcome, about and advanced: Hardwood button, links, phrase and welcome logo, no gradient behind the headline, in light, dark and more contrast; '
        + 'a Graphite team leaves about.html orange',
  };
}
