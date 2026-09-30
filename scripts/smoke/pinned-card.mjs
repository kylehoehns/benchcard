/* #225: a pinned timeline row and its details read as ONE card. Tapping a
 * player's `.tl-name` pins the row (`.tl-row.pin`) and puts `#tlDetail`
 * (`.tld`) directly after it as a sibling. The spec's "What would settle it"
 * asks for one box: no gap, one background, only the outer corners rounded,
 * one stripe down the whole left edge; the name once (the panel keeps an
 * accessible name and a 48px close button); the dot clear of the stripe; and
 * pinning moves nothing.
 *
 * Landed with `land()` at 390x844, 1280x800 and 320px wide with a 32px root,
 * each in light and dark. Each landing measures the chosen row unpinned,
 * clicks its `.tl-name`, and measures it again, so "pinning moves nothing" is
 * a before/after comparison of the same boxes, not a number written down.
 * Rule 2a of /new-guard: every landing must find its rows, the panel, the
 * dot, the track and the time axis, or it fails on that instead of passing on
 * nothing. */
import { evalIn, quiet } from './dom.mjs';
import { land } from './page-state.mjs';
import { RICH } from './fixtures.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';

const ROW = 1; // the second player's row: neither first (its `.tl-now` dot) nor last
const CELLS = [
  { label: '390px', width: 390, height: 844, textPx: 16 },
  { label: '1280px', width: 1280, height: 800, textPx: 16 },
  { label: `${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, width: LARGE_TEXT_WIDTH, height: 844, textPx: LARGE_TEXT_PX },
];
const SCHEMES = ['light', 'dark'];

const MEASURE = `(() => {
  const round = n => Math.round(n * 100) / 100;
  const rect = e => { if (!e) return null; const r = e.getBoundingClientRect();
    return { l: round(r.left), r: round(r.right), t: round(r.top), b: round(r.bottom), w: round(r.width), h: round(r.height) }; };
  const rows = [...document.querySelectorAll('#timeline .tl-row[data-id]')];
  const row = rows[${ROW}];
  if (!row) return JSON.stringify({ rows: rows.length });
  const cs = e => getComputedStyle(e);
  const panel = document.getElementById('tlDetail');
  const head = document.querySelector('#timeline .tl-head');
  const per = document.querySelector('#timeline .tl-periods');
  const pcs = per && cs(per);
  const rcs = cs(row);
  const nm = row.querySelector('.nm');
  const name = nm ? nm.textContent : '';
  const out = {
    bodyBg: cs(document.body).backgroundColor,
    rows: rows.length, pinned: row.classList.contains('pin'),
    row: rect(row), name: rect(row.querySelector('.tl-name')), dot: rect(row.querySelector('.dot')),
    track: rect(row.querySelector('.tl-track')), tot: rect(row.querySelector('.tl-tot')),
    axis: per && { l: round(per.getBoundingClientRect().left + parseFloat(pcs.paddingLeft)),
                   r: round(per.getBoundingClientRect().right - parseFloat(pcs.paddingRight)) },
    hasHead: !!head,
    rowStyle: { bg: rcs.backgroundColor, stripe: rcs.borderLeftWidth, stripeColor: rcs.borderLeftColor,
      tl: rcs.borderTopLeftRadius, tr: rcs.borderTopRightRadius, bl: rcs.borderBottomLeftRadius, br: rcs.borderBottomRightRadius },
    dotColor: cs(row.querySelector('.dot')).backgroundColor,
    other: (() => { const o = rows.find((r, i) => i !== ${ROW}); return o ? Number(cs(o).opacity) : null; })(),
  };
  if (panel) {
    const p = cs(panel);
    const x = panel.querySelector('.tld-x');
    const labelled = panel.getAttribute('aria-labelledby');
    const target = labelled && document.getElementById(labelled.split(/\\s+/)[0]);
    out.panel = {
      isNext: row.nextElementSibling === panel, r: rect(panel), opacity: Number(p.opacity),
      bg: p.backgroundColor, stripe: p.borderLeftWidth, stripeColor: p.borderLeftColor,
      tl: p.borderTopLeftRadius, tr: p.borderTopRightRadius, bl: p.borderBottomLeftRadius, br: p.borderBottomRightRadius,
      dots: panel.querySelectorAll('.dot').length, heads: panel.querySelectorAll('.tld-hd, .tld-nm').length,
      nameCopies: [...panel.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() === name)).length,
      labelledBy: labelled, labelText: target ? target.textContent : null, labelInRow: !!target && row.contains(target),
      close: x && { label: x.getAttribute('aria-label'), w: round(x.getBoundingClientRect().width), h: round(x.getBoundingClientRect().height),
        inside: panel.contains(x) && x.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 0.5 && x.getBoundingClientRect().top < panel.getBoundingClientRect().top + 24 },
    };
  }
  out.name0 = name;
  return JSON.stringify(out);
})()`;

const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const px = s => parseFloat(s) || 0;

/* Pure judgement of one landing: `before` is the row unpinned, `after` the
   same row pinned. Returns problem strings; none means one card. */
export function pinnedCardProblems(label, before, after, scheme) {
  const bad = [];
  const at = m => `${label}: ${m}`;
  if (!before.row || !after.row) return [at(`found ${before.rows} rows, but row ${ROW + 1} is missing`)];
  const lum = (after.bodyBg.match(/[\d.]+/g) || []).slice(0, 3).reduce((a, n) => a + Number(n), 0) / 3;
  if (scheme && (scheme === 'dark') !== (lum < 128)) bad.push(at(`asked for ${scheme} but the page painted ${after.bodyBg}`));
  if (before.pinned) bad.push(at('the row was already pinned before the tap'));
  if (!after.pinned) return [...bad, at('tapping .tl-name did not pin the row')];
  const p = after.panel;
  if (!p) return [...bad, at('no #tlDetail after pinning')];
  if (!p.isNext) bad.push(at('#tlDetail is not the pinned row\'s next sibling'));
  const R = after.row, P = p.r;
  if (!near(R.b, P.t)) bad.push(at(`row bottom ${R.b} and panel top ${P.t} do not meet (gap ${round2(P.t - R.b)}px)`));
  if (!near(R.l, P.l) || !near(R.r, P.r)) bad.push(at(`row spans ${R.l}-${R.r}, panel ${P.l}-${P.r}: not one width`));
  const s = after.rowStyle;
  if (s.bg === 'rgba(0, 0, 0, 0)' || s.bg !== p.bg) bad.push(at(`row background ${s.bg}, panel ${p.bg}: not one fill`));
  if (px(s.tl) <= 0 || px(s.tr) <= 0) bad.push(at(`the row's top corners are ${s.tl} / ${s.tr}, want rounded`));
  if (px(s.bl) !== 0 || px(s.br) !== 0) bad.push(at(`the row's bottom corners are ${s.bl} / ${s.br}, want square`));
  if (px(p.tl) !== 0 || px(p.tr) !== 0) bad.push(at(`the panel's top corners are ${p.tl} / ${p.tr}, want square`));
  if (px(p.bl) <= 0 || px(p.br) <= 0) bad.push(at(`the panel's bottom corners are ${p.bl} / ${p.br}, want rounded`));
  if (px(s.stripe) < 2 || s.stripe !== p.stripe) bad.push(at(`stripe is ${s.stripe} on the row and ${p.stripe} on the panel, want one width`));
  if (s.stripeColor !== p.stripeColor || s.stripeColor !== after.dotColor) {
    bad.push(at(`stripe color ${s.stripeColor} (row), ${p.stripeColor} (panel), dot ${after.dotColor}: not one player color`));
  }
  const gap = after.dot.l - (R.l + px(s.stripe));
  if (gap < 6) bad.push(at(`the dot is ${round2(gap)}px past the stripe's inner edge, want at least 6`));
  if (p.dots !== 0) bad.push(at(`the panel has ${p.dots} .dot`));
  if (p.heads !== 0) bad.push(at('the panel still has its .tld-hd / .tld-nm header'));
  if (p.nameCopies !== 0) bad.push(at(`the player's name (${after.name0}) appears ${p.nameCopies} time(s) in the panel`));
  if (!p.labelledBy || !p.labelInRow || !(p.labelText || '').includes(after.name0)) {
    bad.push(at(`the panel's accessible name is aria-labelledby="${p.labelledBy}" -> "${p.labelText}", want the row's name`));
  }
  if (!p.close) bad.push(at('no .tld-x close button'));
  else {
    if (p.close.label !== 'Close') bad.push(at(`close button label is "${p.close.label}"`));
    if (p.close.w < 44 || p.close.h < 44) bad.push(at(`close button is ${p.close.w}x${p.close.h}px, want at least 44x44`));
    if (!p.close.inside) bad.push(at('close button is not at the top-right of the panel'));
  }
  if (!(after.other < 1)) bad.push(at(`other rows are not dimmed (opacity ${after.other})`));
  if (p.opacity !== 1) bad.push(at(`panel opacity is ${p.opacity}, want 1`));
  for (const k of ['name', 'dot', 'track', 'tot']) {
    const a = before[k], b = after[k];
    if (!a || !b) { bad.push(at(`row has no .${k} box to compare`)); continue; }
    if (!near(a.l, b.l) || !near(a.t, b.t) || !near(a.w, b.w) || !near(a.h, b.h)) {
      bad.push(at(`pinning moved the ${k}: ${a.l},${a.t} ${a.w}x${a.h} -> ${b.l},${b.t} ${b.w}x${b.h}`));
    }
  }
  if (!after.hasHead || !after.axis) bad.push(at('no .tl-head time axis to line up with'));
  else for (const [when, m] of [['unpinned', before], ['pinned', after]]) {
    if (!near(m.track.l, m.axis.l) || !near(m.track.l + m.track.w, m.axis.r)) {
      bad.push(at(`${when} track spans ${m.track.l}-${m.track.l + m.track.w}, the time axis ${m.axis.l}-${m.axis.r}`));
    }
  }
  return bad;
}
const round2 = n => Math.round(n * 100) / 100;

export async function pinnedCardPass(c, origin) {
  const problems = [];
  let landings = 0;
  try {
    for (const scheme of SCHEMES) for (const cell of CELLS) {
      const label = `${cell.label} ${scheme}`;
      await land(c, origin, {
        width: cell.width, height: cell.height, textPx: cell.textPx,
        // the rich record pins ui.theme to 'light', so the scheme goes in the
        // record: OS emulation alone would paint light either way
        record: { ...RICH, ui: { ...RICH.ui, theme: scheme } },
        ready: `document.querySelectorAll('#timeline .tl-row[data-id]').length > ${ROW + 1}`,
      });
      const before = JSON.parse(await evalIn(c, MEASURE));
      await evalIn(c, `(() => { document.querySelectorAll('#timeline .tl-row[data-id] .tl-name')[${ROW}].click(); })()`);
      // the dimming is an opacity transition (--t-fast), so let it finish
      await quiet(c);
      const after = JSON.parse(await evalIn(c, MEASURE));
      landings++;
      problems.push(...pinnedCardProblems(label, before, after, scheme));
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await land(c, origin);
  }
  return {
    pass: problems.length === 0 && landings === CELLS.length * SCHEMES.length,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 3).join(' | ')}`
      : `pinned row and details are one card (one fill, one stripe, no name twice, dot clear, nothing moves) at 390, 1280 and ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px, light and dark (${landings} landings)`,
  };
}
