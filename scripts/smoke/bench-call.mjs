/* #430's own guard (docs/specs/430-bench-call-pinned.md, Proof table): in
 * bench mode the Off/On call is pinned above the foot (it does not scroll with
 * the floor), "Here now" sits above the floor, the floor keeps room, and a
 * toast never lands on the call, the foot or (bar the one cell the spec names)
 * "Here now". Four cells -- 320x568 and 390x844, each at 16px and 32px text --
 * with `LONG_AND_SQUEEZE` (long names) and reduced motion, each state opened
 * by the harness's own `openState`.
 *
 * Spec item 3 (the floor keeps room) is judged in short-phone.mjs only, same
 * states and cells.
 *
 * Reuses rather than re-derives: `land`, `openState`, `CLIP_STATES`,
 * `LONG_AND_SQUEEZE`, `REDUCED_MOTION`, `TOUCH_MIN`, `step`, `SETTLE`
 * (via `cellWant`). "Visible" is the spec's: the whole box inside the
 * viewport and `elementFromPoint` at its corners and center lands inside it.
 *
 * Rule 2a (/new-guard): a state that never opened, an empty call, a missing
 * node or fewer stints than the spec's eight fails rather than measuring
 * nothing. Exemptions are by cell name (`TIGHT_CELL`), never a blanket tolerance. */
import { evalIn, step, TIMERS_QUIET, TODAY_HOME } from './dom.mjs';
import { TOUCH_MIN } from './sizes.mjs';
import { land } from './page-state.mjs';
import { openState } from './clip-sweep.mjs';
import { cellWant, overlaps, stateNamed, PHONE_CELLS, TIGHT_CELL } from './short-phone.mjs';
import { firstLine } from './verdict.mjs';

export const BENCH_CALL_CHECK =
  'bench call: the call is pinned, Here now is up top and the toast stays clear at 320x568 and 390x844, 16px and 32px text';

const CELLS = PHONE_CELLS;
const STINTS = 8;                 // spec item 1: every stint 1-8
const HERE_NOW = 'Here now, Featherstonehaugh Bartholomew';

const PROBE = `JSON.stringify((() => {
  const R = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  // whole box in the viewport and, at its corners and center, the topmost element is inside it
  const visible = e => {
    if (!e || !e.getClientRects().length) return false;
    const b = e.getBoundingClientRect();
    if (b.left < -0.5 || b.top < -0.5 || b.right > vw + 0.5 || b.bottom > vh + 0.5 || b.width < 1 || b.height < 1) return false;
    // a rounded box does not hit-test in its corner cut-outs, so the corner samples sit just inside the curve
    const r = Math.min(parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0, b.width / 2, b.height / 2), k = r * 0.3 + 1;
    return [[b.left + k, b.top + k], [b.right - k, b.top + k], [b.left + k, b.bottom - k], [b.right - k, b.bottom - k],
      [(b.left + b.right) / 2, (b.top + b.bottom) / 2]].every(([x, y]) => { const h = document.elementFromPoint(x, y); return h && e.contains(h); });
  };
  const q = s => document.querySelector(s);
  const next = q('#gmNext'), body = q('.gm-body'), ot = q('#gmNext .gm-ot'), btn = q('#gmOut button');
  const names = [...document.querySelectorAll('#gmNext .gm-next-col .nm')].map(n => {
    const cs = getComputedStyle(n), fs = parseFloat(cs.fontSize), lh = parseFloat(cs.lineHeight) || fs * 1.2;
    return { text: n.textContent, lines: Math.round(n.getBoundingClientRect().height / lh * 10) / 10, spill: n.scrollWidth - n.clientWidth };
  });
  const toast = q('#toasts .toast');
  return { vw, vh, next: R(next), nextVisible: visible(next), nextText: next ? next.textContent.trim() : '',
    none: !!q('#gmNext .gm-next-none'), names, foot: R(q('.gm-foot')), body: R(body),
    out: R(q('#gmOutSec')), outShown: !!(q('#gmOutSec') && !q('#gmOutSec').hidden),
    here: R(btn), hereVisible: visible(btn), hereName: btn ? btn.getAttribute('aria-label') : null,
    ot: R(ot), otVisible: visible(ot), toast: R(toast),
    floor: R(q('#gmFloor')), bench0: R(q('#gmBench .gm-b')), bench0Visible: visible(q('#gmBench .gm-b')),
    go: R(q('#overtimeGo')), goVisible: visible(q('#overtimeGo')) };
})())`;

const probe = async c => JSON.parse(await evalIn(c, PROBE));
const rr = b => `y ${Math.round(b.top)}-${Math.round(b.bottom)}`;

// spec item 1, for one stint at one scroll
function callPinned(rec, d, label) {
  if (!rec.check(!!(d.next && d.foot && d.body), `${label}: #gmNext, .gm-foot or .gm-body not found -- nothing was measured`)) return;
  rec.check(d.nextVisible, `${label}: #gmNext (${rr(d.next)}) is not fully visible in the ${d.vh}px viewport`);
  rec.check(d.next.bottom <= d.foot.top + 0.5, `${label}: #gmNext bottom ${Math.round(d.next.bottom)} is below .gm-foot top ${Math.round(d.foot.top)}`);
  if (!rec.check(d.nextText.length > 0 && (d.names.length > 0 || d.none || !!d.ot),
    `${label}: the call is empty -- nothing was measured`)) return;
  for (const n of d.names) {
    rec.check(n.lines <= 1.5 && n.spill <= 1, `${label}: the call name "${n.text}" runs ${n.lines} lines (spill ${n.spill}px), want one line and no split word`);
  }
}

async function stintsAt(c, origin, rec, cell, where, last) {
  const name = last ? 'bench mode, last stint' : 'bench mode';
  const label = `${name} at ${where}`;
  const v = stateNamed(name);
  try {
    await openState(c, origin, v, cellWant(cell));
    let named = 0;
    for (let i = 1; i <= (last ? 1 : STINTS); i++) {
      const at = last ? label : `${label}, stint ${i}`;
      await evalIn(c, `document.querySelector('.gm-body') && (document.querySelector('.gm-body').scrollTop = 0)`);
      const top = await probe(c);
      if (last) rec.check(top.ot && top.otVisible && top.ot.width >= TOUCH_MIN && top.ot.height >= TOUCH_MIN,
        `${at}: "Tied? Add overtime" is ${top.ot ? Math.round(top.ot.width) + 'x' + Math.round(top.ot.height) : 'missing'}, visible ${top.otVisible}, want visible and >= ${TOUCH_MIN}`);
      callPinned(rec, top, `${at}, opening scroll`);
      named += top.names.length;
      await evalIn(c, `document.querySelector('.gm-body').scrollTop = 1e6`);
      const bottom = await probe(c);
      callPinned(rec, bottom, `${at}, scrolled to the bottom`);
      if (!last) {
        const dis = await evalIn(c, `document.getElementById('gmNext2').disabled`);
        if (i < STINTS) {
          if (!rec.check(!dis, `${at}: #gmNext2 is disabled -- the game has fewer than ${STINTS} stints`)) break;
          await evalIn(c, step(`document.getElementById('gmNext2').click()`));
        }
      }
    }
    if (!last) rec.check(named > 0, `${label}: no stint named anyone in the call -- nothing was measured`);
  } catch (e) {
    rec.fail(`${label}: ${firstLine(e)}`);
  } finally {
    await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
  }
}

// spec item 2 and the not-here half of item 4
async function notHereAt(c, origin, rec, cell, where, withToast) {
  const name = 'bench mode, not here';
  const label = `${name}${withToast ? ' with a toast' : ''} at ${where}`;
  const v = stateNamed(name);
  try {
    await openState(c, origin, v, cellWant(cell));
    if (withToast) {
      await evalIn(c, step(`document.querySelector('#gmFloor .gm-p').click()`));
      await evalIn(c, step(`document.querySelector('#gmBench .gm-b').click()`));
    }
    const d = await probe(c);
    if (!rec.check(d.outShown && !!d.out && !!d.body, `${label}: #gmOutSec never showed -- nothing was measured`)) return;
    rec.check(d.out.bottom <= d.body.top + 0.5, `${label}: #gmOutSec (${rr(d.out)}) is not above .gm-body (top ${Math.round(d.body.top)})`);
    if (!rec.check(!!d.here, `${label}: no "Here now" button -- nothing was measured`)) return;
    rec.check(d.hereName === HERE_NOW, `${label}: the button is named ${JSON.stringify(d.hereName)}, want "${HERE_NOW}"`);
    if (!withToast) {
      rec.check(d.hereVisible, `${label}: the first "Here now" (${rr(d.here)}) is not visible at the opening scroll`);
      rec.check(d.here.width >= TOUCH_MIN && d.here.height >= TOUCH_MIN, `${label}: "Here now" is ${Math.round(d.here.width)}x${Math.round(d.here.height)}, want >= ${TOUCH_MIN}`);
    } else {
      if (!rec.check(!!d.toast, `${label}: no toast showed -- nothing was measured`)) return;
      if (cell.where !== TIGHT_CELL) rec.check(!overlaps(d.toast, d.here), `${label}: the toast (${rr(d.toast)}) covers the first "Here now" (${rr(d.here)})`);
      rec.check(!overlaps(d.toast, d.next) && !overlaps(d.toast, d.foot), `${label}: the toast (${rr(d.toast)}) covers the call (${rr(d.next)}) or the foot (${rr(d.foot)})`);
    }
  } catch (e) {
    rec.fail(`${label}: ${firstLine(e)}`);
  } finally {
    if (withToast) await evalIn(c, `document.querySelector('.toast .tundo')?.click()`).catch(() => {});
    await evalIn(c, `(async () => { await ${TIMERS_QUIET}; })()`).catch(() => {});
    await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
  }
}

// spec item 4's two toast states
async function toastAt(c, origin, rec, cell, where, name) {
  const label = `${name} at ${where}`;
  const v = stateNamed(name);
  try {
    await openState(c, origin, v, cellWant(cell));
    const d = await probe(c);
    if (!rec.check(!!d.toast, `${label}: no toast showed -- nothing was measured`)) return;
    if (!rec.check(!!(d.next && d.foot), `${label}: #gmNext or .gm-foot not found -- nothing was measured`)) return;
    rec.check(!overlaps(d.toast, d.next), `${label}: the toast (${rr(d.toast)}) covers #gmNext (${rr(d.next)})`);
    rec.check(!overlaps(d.toast, d.foot), `${label}: the toast (${rr(d.toast)}) covers .gm-foot (${rr(d.foot)})`);
    // stepping stints while the toast is up changes the call's height: the toast must follow
    if (name === 'bench mode, swap toast') {
      let seen = 0;
      for (let i = 1; i < STINTS; i++) {
        const dis = await evalIn(c, `document.getElementById('gmNext2').disabled`);
        if (dis) break;
        await evalIn(c, step(`document.getElementById('gmNext2').click()`));
        const e = await probe(c);
        if (!e.toast) continue;
        seen++;
        rec.check(!overlaps(e.toast, e.next), `${label}, after stepping to stint ${i + 1}: the toast (${rr(e.toast)}) covers #gmNext (${rr(e.next)})`);
      }
      rec.check(seen > 0, `${label}: the toast was gone at every step -- nothing was measured`);
    }
  } catch (e) {
    rec.fail(`${label}: ${firstLine(e)}`);
  } finally {
    await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
  }
}

// spec item 5
async function overtimeAt(c, origin, rec, cell, where) {
  const label = `overtime sheet at ${where}`;
  const v = stateNamed('overtime sheet');
  try {
    await openState(c, origin, v, cellWant(cell));
    const d = await probe(c);
    if (!rec.check(!!d.go, `${label}: #overtimeGo not found -- nothing was measured`)) return;
    rec.check(d.goVisible, `${label}: "Add overtime" (${rr(d.go)}) is not visible without scrolling in the ${d.vh}px viewport`);
  } catch (e) {
    rec.fail(`${label}: ${firstLine(e)}`);
  } finally {
    await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
  }
}

// The landscape block. At 844x390/16px the call, Not here and the bench share the right
// column, so a coach taps off on the floor and on from the bench without scrolling. At
// 568x320/16px with a Not here player the right column cannot push the foot off screen.
const LAND_CELLS = [
  { width: 844, height: 390, textPx: 16, state: 'bench mode', bench: true },
  { width: 568, height: 320, textPx: 16, state: 'bench mode, not here', bench: false },
];
async function landscapeAt(c, origin, rec, cell) {
  const where = `${cell.width}x${cell.height}/${cell.textPx}px`;
  const label = `${cell.state} at ${where}`;
  const v = stateNamed(cell.state);
  try {
    await land(c, origin, cellWant(cell));
    await evalIn(c, step(TODAY_HOME));
    await openState(c, origin, v, cellWant(cell));
    await evalIn(c, `document.querySelectorAll('.gm-body > .gm-sec').forEach(e => { e.scrollTop = 0; })`);
    const d = await probe(c);
    if (!rec.check(!!(d.next && d.foot && d.floor), `${label}: #gmNext, .gm-foot or #gmFloor not found -- nothing was measured`)) return;
    rec.check(d.foot.top >= -0.5 && d.foot.bottom <= d.vh + 0.5, `${label}: .gm-foot (${rr(d.foot)}) is not inside the ${d.vh}px viewport`);
    rec.check(d.nextVisible, `${label}: #gmNext (${rr(d.next)}) is not fully visible in the ${d.vh}px viewport`);
    rec.check(d.next.bottom <= d.foot.top + 0.5, `${label}: #gmNext bottom ${Math.round(d.next.bottom)} is below .gm-foot top ${Math.round(d.foot.top)}`);
    if (!cell.bench) {
      // the right column must not push the foot off screen at any stint (a 3-swap call is the tallest)
      for (let i = 2; i <= STINTS; i++) {
        if (await evalIn(c, `document.getElementById('gmNext2').disabled`)) break;
        await evalIn(c, step(`document.getElementById('gmNext2').click()`));
        const e = await probe(c);
        if (e.foot) rec.check(e.foot.top >= -0.5 && e.foot.bottom <= e.vh + 0.5, `${label}, stint ${i}: .gm-foot (${rr(e.foot)}) is not inside the ${e.vh}px viewport`);
      }
      return;
    }
    if (!rec.check(!!d.bench0, `${label}: no #gmBench row -- nothing was measured`)) return;
    rec.check(d.bench0.left >= d.floor.right - 0.5, `${label}: the first bench row starts at x ${Math.round(d.bench0.left)}, left of the floor's right edge ${Math.round(d.floor.right)} -- want it in the right column`);
    rec.check(d.bench0Visible && d.bench0.bottom <= d.foot.top + 0.5, `${label}: the first bench row (${rr(d.bench0)}) is not visible without scrolling the floor (foot top ${Math.round(d.foot.top)})`);
  } catch (e) {
    rec.fail(`${label}: ${firstLine(e)}`);
  } finally {
    await evalIn(c, step(v.close)).catch(e => rec.fail(`${label}: did not close -- ${firstLine(e)}`));
  }
}

export async function benchCallPass(c, origin, rec) {
  let cells = 0;
  for (const cell0 of CELLS) {
    const where = `${cell0.width}x${cell0.height}/${cell0.textPx}px`;
    const cell = { ...cell0, where };
    await land(c, origin, cellWant(cell));
    await evalIn(c, step(TODAY_HOME));
    const vp = JSON.parse(await evalIn(c, `JSON.stringify({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight,
      px: parseFloat(getComputedStyle(document.documentElement).fontSize) })`));
    if (!rec.check(vp.w === cell.width && vp.h === cell.height && vp.px === cell.textPx,
      `${where}: the page measured ${vp.w}x${vp.h} at ${vp.px}px -- nothing was measured`)) continue;
    cells++;
    await stintsAt(c, origin, rec, cell, where, false);
    await stintsAt(c, origin, rec, cell, where, true);
    await notHereAt(c, origin, rec, cell, where, false);
    await notHereAt(c, origin, rec, cell, where, true);
    for (const n of ['bench mode, undo toast', 'bench mode, swap toast']) await toastAt(c, origin, rec, cell, where, n);
    if (where === '320x568/16px') await overtimeAt(c, origin, rec, cell, where);
  }
  for (const cell of LAND_CELLS) await landscapeAt(c, origin, rec, cell);
  rec.check(cells === CELLS.length, `only ${cells} of ${CELLS.length} cells were measured`);
  rec.ok(`the call is pinned at all ${STINTS} stints, Here now is up top and the toast stays clear in ${CELLS.length} cells`);
}
