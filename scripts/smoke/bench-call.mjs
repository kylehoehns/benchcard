/* #430's own guard (docs/specs/430-bench-call-pinned.md, Proof table): in
 * bench mode the Off/On call is pinned above the foot (it does not scroll with
 * the floor), "Here now" sits above the floor, the floor keeps room, and a
 * toast never lands on the call, the foot or (bar the one cell the spec names)
 * "Here now". Four cells -- 320x568 and 390x844, each at 16px and 32px text --
 * with `LONG_AND_SQUEEZE` (long names) and reduced motion, each state opened
 * by the harness's own `openState`.
 *
 * Reuses rather than re-derives: `land`, `openState`, `CLIP_STATES`,
 * `LONG_AND_SQUEEZE`, `REDUCED_MOTION`, `TOUCH_MIN`, `step`, `SETTLE`
 * (via `cellWant`). "Visible" is the spec's: the whole box inside the
 * viewport and `elementFromPoint` at its corners and center lands inside it.
 *
 * Rule 2a (/new-guard): a state that never opened, an empty call, a missing
 * node or fewer stints than the spec's eight fails rather than measuring
 * nothing. Exemptions are by cell name (`TIGHT`), never a blanket tolerance. */
import { evalIn, step, TIMERS_QUIET, TODAY_HOME } from './dom.mjs';
import { TOUCH_MIN } from './sizes.mjs';
import { land } from './page-state.mjs';
import { CLIP_STATES, openState } from './clip-sweep.mjs';
import { cellWant } from './short-phone.mjs';
import { firstLine } from './verdict.mjs';

export const BENCH_CALL_CHECK =
  'bench call: the call is pinned, Here now is up top and the toast stays clear at 320x568 and 390x844, 16px and 32px text';

const CELLS = [
  { width: 320, height: 568, textPx: 16 },
  { width: 320, height: 568, textPx: 32 },
  { width: 390, height: 844, textPx: 16 },
  { width: 390, height: 844, textPx: 32 },
];
const STINTS = 8;                 // spec item 1: every stint 1-8
const TIGHT = '320x568/32px';     // spec item 3, 4: the one cell the screen cannot hold everything in
const TIGHT_FLOOR_MIN = 96;       // two touch-target heights
const HERE_NOW = 'Here now, Featherstonehaugh Bartholomew';

const stateNamed = name => {
  const v = CLIP_STATES.find(s => s.name === name);
  if (!v) throw new Error(`no state named "${name}" in CLIP_STATES -- nothing was measured`);
  return v;
};

const PROBE = `JSON.stringify((() => {
  const R = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  // whole box in the viewport and, at its corners and center, the topmost element is inside it
  const visible = e => {
    if (!e || !e.getClientRects().length) return false;
    const b = e.getBoundingClientRect();
    if (b.left < -0.5 || b.top < -0.5 || b.right > vw + 0.5 || b.bottom > vh + 0.5 || b.width < 1 || b.height < 1) return false;
    return [[b.left + 1, b.top + 1], [b.right - 1, b.top + 1], [b.left + 1, b.bottom - 1], [b.right - 1, b.bottom - 1],
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
    none: !!q('#gmNext .gm-next-none'), names, foot: R(q('.gm-foot')), body: R(body), bodyClient: body ? body.clientHeight : 0,
    out: R(q('#gmOutSec')), outShown: !!(q('#gmOutSec') && !q('#gmOutSec').hidden),
    here: R(btn), hereVisible: visible(btn), hereName: btn ? btn.getAttribute('aria-label') : null,
    ot: R(ot), otVisible: visible(ot), toast: R(toast),
    cards: [...document.querySelectorAll('#gmFloor > *')].map(R),
    go: R(q('#overtimeGo')), goVisible: visible(q('#overtimeGo')) };
})())`;

const probe = async c => JSON.parse(await evalIn(c, PROBE));
const hit = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
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
      // item 3: a whole floor card in .gm-body's visible box (the window, not the content)
      const b = top.body;
      if (b && top.cards.length) {
        await evalIn(c, `document.querySelector('.gm-body').scrollTop = 0`);
        const d = await probe(c);
        if (cell.where === TIGHT) rec.check(d.bodyClient >= TIGHT_FLOOR_MIN, `${at}: .gm-body shows ${d.bodyClient}px, want >= ${TIGHT_FLOOR_MIN}px at ${TIGHT}`);
        else rec.check(d.cards.some(k => k.top >= d.body.top - 0.5 && k.bottom <= d.body.bottom + 0.5),
          `${at}: no floor card is whole inside .gm-body (${rr(d.body)}); card heights ${d.cards.map(k => Math.round(k.height)).join(',')}`);
      } else rec.fail(`${at}: .gm-body or #gmFloor cards missing -- nothing was measured`);
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
      if (cell.where !== TIGHT) rec.check(!hit(d.toast, d.here), `${label}: the toast (${rr(d.toast)}) covers the first "Here now" (${rr(d.here)})`);
      rec.check(!hit(d.toast, d.next) && !hit(d.toast, d.foot), `${label}: the toast (${rr(d.toast)}) covers the call (${rr(d.next)}) or the foot (${rr(d.foot)})`);
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
    rec.check(!hit(d.toast, d.next), `${label}: the toast (${rr(d.toast)}) covers #gmNext (${rr(d.next)})`);
    rec.check(!hit(d.toast, d.foot), `${label}: the toast (${rr(d.toast)}) covers .gm-foot (${rr(d.foot)})`);
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
  rec.check(cells === CELLS.length, `only ${cells} of ${CELLS.length} cells were measured`);
  rec.ok(`the call is pinned at all ${STINTS} stints, Here now is up top and the toast stays clear in ${CELLS.length} cells`);
}
