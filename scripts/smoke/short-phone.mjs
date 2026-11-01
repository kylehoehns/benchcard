/* #421's own guard (docs/specs/421-large-text-short-phone.md, Proof table):
 * on a short phone or at large text, the three half-height sheets, bench mode
 * and the tour leave room for their own content. Four cells -- 320x568 and
 * 390x844, each at 16px and 32px text -- with `LONG_AND_SQUEEZE` (long names)
 * and reduced motion, each state opened by the harness's own `openState`
 * (CLIP_STATES' own open scripts), the tour's from overlay.mjs's `STATES`.
 *
 * Reuses rather than re-derives: `land`, `openState`, `CLIP_STATES`,
 * `LONG_AND_SQUEEZE`, `REDUCED_MOTION`, `TOUCH_MIN`, `step`, `SETTLE`,
 * `STATES`, `STEP_COUNT`.
 *
 * Expected values are the spec's, not recomputed from the app: the sheet
 * opens full exactly where `(max-height: 40em)` matches, which at a 16px
 * default is 640px tall and at 32px is 1280px -- so `full` per cell is
 * written down below. Rule 2a (/new-guard): a state that never opened, an
 * empty floor, a missing anchor fails rather than measuring nothing. */
import { evalIn, step, SETTLE, TIMERS_QUIET, TODAY_HOME } from './dom.mjs';
import { TOUCH_MIN } from './sizes.mjs';
import { land } from './page-state.mjs';
import { CLIP_STATES, LONG_AND_SQUEEZE, REDUCED_MOTION, openState } from './clip-sweep.mjs';
import { STATES } from './overlay.mjs';
import { STEP_COUNT } from './tour-steps.mjs';
import { firstLine } from './verdict.mjs';

export const SHORT_PHONE_CHECK =
  'short phone: sheets, bench mode and the tour leave room at 320x568 and 390x844, 16px and 32px text';

// `full`: whether `(max-height: 40em)` matches (spec item 1).
const CELLS = [
  { width: 320, height: 568, textPx: 16, full: true },
  { width: 320, height: 568, textPx: 32, full: true },
  { width: 390, height: 844, textPx: 16, full: false },
  { width: 390, height: 844, textPx: 32, full: true },
  // A phone held sideways at large text: the landscape bench block must not
  // stretch the 52px nav buttons. Bench mode only (`only`).
  { width: 568, height: 320, textPx: 32, full: true, only: 'bench', square: true },
];

const SHEETS = [
  { state: "who's here sheet", id: 'sheetWho' },
  { state: 'format sheet', id: 'sheetFormat' },
  { state: 'sub interval sheet', id: 'sheetInterval' },
];
const BODY_SHARE = 0.45; // spec: body clientHeight >= 45% of the viewport height

const stateNamed = name => {
  const v = CLIP_STATES.find(s => s.name === name);
  if (!v) throw new Error(`no state named "${name}" in CLIP_STATES -- nothing was measured`);
  return v;
};

const SHEET_PROBE = `JSON.stringify((() => {
  const d = document.querySelector('dialog.bsheet[open]');
  if (!d) return { open: false };
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
  return { open: true, id: d.id, full: d.classList.contains('full'), half: d.classList.contains('bsheet-half'),
    handle: d.querySelector('.bsheet-handle')?.getAttribute('aria-label') || '',
    hd: r(d.querySelector('.bsheet-hd')), body: r(d.querySelector('.bsheet-body')),
    bodyClient: d.querySelector('.bsheet-body')?.clientHeight || 0,
    status: r(d.querySelector('.bsheet-status')), close: r(d.querySelector('.bsheet-close')),
    vh: document.documentElement.clientHeight };
})())`;

async function sheetsAt(c, origin, rec, cell, where) {
  for (const sh of SHEETS) {
    const label = `${sh.state} at ${where}`;
    const v = stateNamed(sh.state);
    try {
      await evalIn(c, step(TODAY_HOME)); // the sheets' open scripts start from Today
      await openState(c, origin, v, cellWant(cell));
      const d = JSON.parse(await evalIn(c, SHEET_PROBE));
      if (!rec.check(d.open && d.id === sh.id, `${label}: #${sh.id} never opened -- nothing was measured`)) continue;
      if (cell.full) {
        rec.check(d.full && d.handle === 'Half height',
          `${label}: opened ${d.full ? 'full' : 'half'} (handle "${d.handle}"), want full ("Half height")`);
        rec.check(d.bodyClient >= BODY_SHARE * d.vh,
          `${label}: body shows ${d.bodyClient}px, want >= ${Math.ceil(BODY_SHARE * d.vh)}px (45% of ${d.vh})`);
      } else {
        rec.check(d.half && !d.full, `${label}: opened ${d.full ? 'full' : 'not half'}, want half (bsheet-half)`);
      }
      for (const part of ['hd', 'body', 'status']) {
        if (!rec.check(!!d[part], `${label}: .bsheet-${part} not found -- nothing was measured`)) continue;
        rec.check(d[part].top >= -0.5 && d[part].bottom <= d.vh + 0.5,
          `${label}: .bsheet-${part} spans ${Math.round(d[part].top)}-${Math.round(d[part].bottom)}, outside the ${d.vh}px viewport`);
      }
      if (rec.check(!!d.close, `${label}: .bsheet-close not found -- nothing was measured`)) {
        rec.check(d.close.width >= TOUCH_MIN - 0.5 && d.close.height >= TOUCH_MIN - 0.5,
          `${label}: close button is ${Math.round(d.close.width)}x${Math.round(d.close.height)}, want >= ${TOUCH_MIN}`);
      }
    } catch (e) {
      rec.fail(`${label}: ${firstLine(e)}`);
    } finally {
      if (v.close) await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
    }
  }
}

// The title stays centered in its header when the side slots differ (Add rule
// on the right, Back on the left). Measured on the open sheet's own h2.
const HEADER_PROBE = `JSON.stringify((() => {
  const d = document.querySelector('dialog.bsheet[open]');
  const row = d && [...d.querySelectorAll('.bsheet-hd-row')].find(e => e.getClientRects().length);
  const h = row && row.querySelector('h2');
  if (!h) return { found: false };
  const a = row.getBoundingClientRect(), b = h.getBoundingClientRect(), cs = getComputedStyle(row);
  const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
  return { found: true, offset: (b.left + b.right) / 2 - ((a.left + pl) + (a.right - pr)) / 2,
    lines: Math.round(b.height / (parseFloat(getComputedStyle(h).lineHeight) || parseFloat(getComputedStyle(h).fontSize) * 1.2)) };
})())`;

async function headersAt(c, origin, rec, cell, where) {
  const states = [STATES.find(x => x.name === 'plan sheet, add a rule'), stateNamed('overtime sheet')];
  for (const v of states) {
    const label = `${v?.name} header at ${where}`;
    if (!rec.check(!!v, `a header state is missing -- nothing was measured at ${where}`)) continue;
    try {
      await evalIn(c, step(TODAY_HOME));
      await openState(c, origin, v, cellWant(cell));
      const d = JSON.parse(await evalIn(c, HEADER_PROBE));
      if (!rec.check(d.found, `${label}: no sheet title found -- nothing was measured`)) continue;
      rec.check(Math.abs(d.offset) <= 1.5, `${label}: title center is ${Math.round(d.offset)}px off the header's center`);
    } catch (e) {
      rec.fail(`${label}: ${firstLine(e)}`);
    } finally {
      if (v.close) await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
    }
  }
}

const BENCH_PROBE = `JSON.stringify((() => {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
  const shown = e => e && !e.hidden && e.getClientRects().length > 0;
  const bar = document.querySelector('.gm-bar'), foot = document.querySelector('.gm-foot'), moved = document.getElementById('gmMoved');
  const name = id => { const e = document.getElementById(id);
    return e ? (e.getAttribute('aria-label') || e.textContent || '').trim() : ''; };
  return { bar: r(bar), foot: r(foot), moved: shown(moved) ? r(moved) : null,
    cards: [...document.querySelectorAll('#gmFloor > *')].map(r),
    done: r(document.getElementById('gmDone')), prev: r(document.getElementById('gmPrev')),
    next: r(document.getElementById('gmNext2')), doneName: name('gmDone'), vh: document.documentElement.clientHeight };
})())`;

async function benchAt(c, origin, rec, cell, where) {
  for (const name of ['bench mode', 'bench mode, last stint']) {
    const label = `${name} at ${where}`;
    const v = stateNamed(name);
    try {
      await openState(c, origin, v, cellWant(cell));
      const d = JSON.parse(await evalIn(c, BENCH_PROBE));
      if (!rec.check(!!(d.bar && d.foot), `${label}: .gm-bar or .gm-foot not found -- nothing was measured`)) continue;
      // The sideways cell is only here for the nav buttons' size: a 32px card is
      // taller than that window, so no whole card is asked of it.
      if (rec.check(d.cards.length > 0, `${label}: #gmFloor holds no cards -- nothing was measured`) && !cell.square) {
        const top = Math.max(d.bar.bottom, d.moved ? d.moved.bottom : 0);
        const whole = d.cards.filter(k => k.top >= top - 0.5 && k.bottom <= d.foot.top + 0.5);
        rec.check(whole.length >= 1,
          `${label}: no floor card is whole between the bar (bottom ${Math.round(top)}) and the foot (top ${Math.round(d.foot.top)}); ` +
          `card heights ${d.cards.map(k => Math.round(k.height)).join(',')}`);
      }
      if (name === 'bench mode') {
        if (cell.square) {
          for (const [n, b] of [['Leave', d.done], ['Back', d.prev], ['Next', d.next]]) {
            if (b) rec.check(Math.abs(b.width - 52) <= 0.5 && Math.abs(b.height - 52) <= 0.5,
              `${label}: ${n} is ${Math.round(b.width)}x${Math.round(b.height)}, want 52x52`);
          }
        }
        const btns = { Leave: d.done, Back: d.prev, Next: d.next };
        for (const [n, b] of Object.entries(btns)) {
          if (!rec.check(!!b, `${label}: ${n} not found -- nothing was measured`)) continue;
          rec.check(b.width >= TOUCH_MIN - 0.5 && b.height >= TOUCH_MIN - 0.5,
            `${label}: ${n} is ${Math.round(b.width)}x${Math.round(b.height)}, want >= ${TOUCH_MIN}`);
        }
        if (d.done && d.prev && d.next) {
          rec.check(Math.abs(d.done.top - d.prev.top) <= 1 && Math.abs(d.done.top - d.next.top) <= 1,
            `${label}: Leave, Back and Next sit at tops ${Math.round(d.done.top)}, ${Math.round(d.prev.top)}, ${Math.round(d.next.top)}, want one row`);
        }
        rec.check(/leave/i.test(d.doneName), `${label}: #gmDone is named "${d.doneName}", want it to say Leave`);
      }
    } catch (e) {
      rec.fail(`${label}: ${firstLine(e)}`);
    } finally {
      if (v.close) await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
    }
  }
}

const TOUR_PROBE = `JSON.stringify((() => {
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const bd = document.getElementById('tourBody');
  const cs = bd && getComputedStyle(bd);
  const lh = cs ? (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2) : 0;
  return { open: !!(document.getElementById('tour') && !document.getElementById('tour').hidden),
    holeHidden: !!document.getElementById('tourHole')?.hidden,
    box: r(document.getElementById('tourBox')), hole: r(document.getElementById('tourHole')),
    next: r(document.getElementById('tourNext')),
    bodyClient: bd ? bd.clientHeight : 0, bodyScroll: bd ? bd.scrollHeight : 0, lineHeight: lh,
    overflowY: cs ? cs.overflowY : '', vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight };
})())`;

const overlaps = (a, b) =>
  a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;

async function tourAt(c, rec, where) {
  for (let i = 1; i <= STEP_COUNT; i++) {
    const s = STATES.find(x => x.name === `tour, step ${i} of ${STEP_COUNT}`);
    const label = `tour step ${i} at ${where}`;
    if (!rec.check(!!s, `overlay.mjs has no "tour, step ${i} of ${STEP_COUNT}" state`)) continue;
    try {
      await evalIn(c, step(s.open));
      await evalIn(c, TIMERS_QUIET); // past placeTour's own +320ms re-run
      const d = JSON.parse(await evalIn(c, TOUR_PROBE));
      if (!rec.check(d.open, `${label}: #tour never opened -- nothing was measured`)) continue;
      if (!rec.check(!d.holeHidden && !!d.hole && !!d.box, `${label}: no ring or box to measure`)) continue;
      rec.check(!overlaps(d.box, d.hole),
        `${label}: #tourBox y ${Math.round(d.box.top)}-${Math.round(d.box.bottom)} overlaps #tourHole y ${Math.round(d.hole.top)}-${Math.round(d.hole.bottom)}`);
      rec.check(d.box.left >= -0.5 && d.box.top >= -0.5 && d.box.right <= d.vw + 0.5 && d.box.bottom <= d.vh + 0.5,
        `${label}: #tourBox is outside the ${d.vw}x${d.vh} viewport`);
      if (rec.check(!!d.next, `${label}: #tourNext not found`)) {
        rec.check(d.next.top >= d.box.top - 0.5 && d.next.bottom <= d.box.bottom + 0.5,
          `${label}: #tourNext y ${Math.round(d.next.top)}-${Math.round(d.next.bottom)} spills out of #tourBox y ${Math.round(d.box.top)}-${Math.round(d.box.bottom)}`);
        rec.check(d.next.left >= -0.5 && d.next.top >= -0.5 && d.next.right <= d.vw + 0.5 && d.next.bottom <= d.vh + 0.5,
          `${label}: #tourNext is outside the viewport`);
        rec.check(d.next.width >= TOUCH_MIN - 0.5 && d.next.height >= TOUCH_MIN - 0.5,
          `${label}: #tourNext is ${Math.round(d.next.width)}x${Math.round(d.next.height)}, want >= ${TOUCH_MIN}`);
      }
      rec.check(d.bodyClient >= d.lineHeight,
        `${label}: #tourBody shows ${d.bodyClient}px, under one ${Math.round(d.lineHeight)}px line`);
      if (d.bodyScroll > d.lineHeight + 1) {
        rec.check(d.overflowY === 'auto' || d.overflowY === 'scroll',
          `${label}: #tourBody text is ${d.bodyScroll}px but overflow-y is "${d.overflowY}", want auto or scroll`);
      }
    } catch (e) {
      rec.fail(`${label}: ${firstLine(e)}`);
    } finally {
      await evalIn(c, step(s.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
    }
  }
}

// What `openState` hands the states that reload their own fixture (none of
// the ones this pass opens do; kept so it stays the harness's own shape).
export const cellWant = cell => ({ record: LONG_AND_SQUEEZE, width: cell.width, height: cell.height, textPx: cell.textPx, media: REDUCED_MOTION });

export async function shortPhonePass(c, origin, rec) {
  let cells = 0;
  for (const cell of CELLS) {
    const where = `${cell.width}x${cell.height}/${cell.textPx}px`;
    await land(c, origin, cellWant(cell));
    await evalIn(c, `${SETTLE}`);
    // Rule 2a: the cell really is the size asked for.
    const vp = JSON.parse(await evalIn(c, `JSON.stringify({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight,
      px: parseFloat(getComputedStyle(document.documentElement).fontSize) })`));
    if (!rec.check(vp.w === cell.width && vp.h === cell.height && vp.px === cell.textPx,
      `${where}: the page measured ${vp.w}x${vp.h} at ${vp.px}px -- nothing was measured`)) continue;
    cells++;
    if (cell.only === 'bench') { await benchAt(c, origin, rec, cell, where); continue; }
    await sheetsAt(c, origin, rec, cell, where);
    await headersAt(c, origin, rec, cell, where);
    await benchAt(c, origin, rec, cell, where);
    await tourAt(c, rec, where);
  }
  rec.check(cells === CELLS.length, `only ${cells} of ${CELLS.length} cells were measured`);
  rec.ok(`${SHEETS.length} sheets, bench mode (2 states) and ${STEP_COUNT} tour steps leave room in ${CELLS.length} cells`);
}
