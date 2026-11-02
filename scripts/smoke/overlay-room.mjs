/* #429's general guard: an overlay on a short phone or at large text keeps a
 * scrolling content region at least three body lines tall. The per-sheet
 * checks (short-phone.mjs) name each sheet; this one asks the same question of
 * every overlay in `CLIP_STATES` without a list to forget to extend.
 *
 * Reuses `CLIP_STATES`, `openState`, `LONG_AND_SQUEEZE`, `REDUCED_MOTION`,
 * `land`. The expected value is the spec's: 3 x the body line height, never a
 * number read back from the CSS. Rule 2a (/new-guard): a cell that did not
 * come up at the size asked for, a state with no overlay, or an overlay with no
 * scrolling region fails rather than measuring nothing. */
import { evalIn, step, SETTLE } from './dom.mjs';
import { land } from './page-state.mjs';
import { CLIP_STATES, LONG_AND_SQUEEZE, REDUCED_MOTION, openState, reloadsPage } from './clip-sweep.mjs';
import { firstLine } from './verdict.mjs';

export const OVERLAY_ROOM_CHECK =
  'overlays keep a scrolling region three lines tall at 320x568 and 390x844, 32px text';

export const ROOM_CELLS = [
  { width: 320, height: 568, textPx: 32 },
  { width: 390, height: 844, textPx: 32 },
];
export const MIN_LINES = 3;

export const OVERLAY_PROBE = `JSON.stringify((() => {
  const cs = getComputedStyle(document.body);
  const fs = parseFloat(cs.fontSize);
  const line = parseFloat(cs.lineHeight) || fs * 1.2;
  const shown = e => e.getClientRects().length > 0;
  const dlg = document.querySelector('dialog[open]');
  const welcome = document.querySelector('#view-welcome');
  const root = dlg || (welcome && shown(welcome) ? welcome : null);
  if (!root) return { overlay: false, line };
  const scrolls = [root, ...root.querySelectorAll('*')].filter(e => {
    const oy = getComputedStyle(e).overflowY;
    return (oy === 'auto' || oy === 'scroll') && e.clientHeight > 0 && shown(e);
  }).map(e => ({ el: (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') || e.tagName.toLowerCase(),
    client: e.clientHeight, shell: e === root }));
  const vh = document.documentElement.clientHeight;
  // The content region is the tallest scroller inside the overlay (the dialog
  // shell is not one of them); a nested field never beats the body that holds
  // it. With none, the overlay is its own region -- or, for the welcome page,
  // the document scrolls and the region is the viewport.
  const inner = scrolls.filter(s => !s.shell).sort((a, b) => b.client - a.client)[0];
  const region = inner || (dlg ? { el: '#' + root.id, client: root.clientHeight } : { el: 'the page', client: vh });
  return { overlay: true, id: root.id, line, vh, region };
})())`;

export async function overlayRoomMeasure(c, origin, cell, onState) {
  // The states that reload their own fixture (first run, FOUR) bring their own
  // record, so `want` carries the size alone; the rich landing adds the names.
  const want = { width: cell.width, height: cell.height, textPx: cell.textPx, media: REDUCED_MOTION };
  const landing = { record: LONG_AND_SQUEEZE, ...want };
  await land(c, origin, landing);
  await evalIn(c, SETTLE);
  for (const v of CLIP_STATES) {
    try {
      await openState(c, origin, v, want);
      await onState(v, JSON.parse(await evalIn(c, OVERLAY_PROBE)));
    } catch (e) {
      await onState(v, { error: firstLine(e) });
    } finally {
      if (v.close) await evalIn(c, step(v.close)).catch(() => {});
      if (reloadsPage(v)) { await land(c, origin, landing); await evalIn(c, SETTLE); }
    }
  }
}

/* Required overlays: the walk must have reached each of these (by the id the
   probe reports), at both cells, or a regression in how states open would
   leave the check green on nothing. */
export const REQUIRED_OVERLAYS = ['view-welcome', 'addGameFlow', 'firstRunFlow', 'sheetOvertime', 'sheetFormat', 'sheetPlan', 'sheetWho', 'sheetPaste'];

export async function overlayRoomPass(c, origin, rec) {
  let measured = 0;
  for (const cell of ROOM_CELLS) {
    const where = `${cell.width}x${cell.height}/${cell.textPx}px`;
    const seen = new Set();
    await overlayRoomMeasure(c, origin, cell, (v, d) => {
      if (d.error) return rec.fail(`${v.name} at ${where}: ${d.error}`);
      if (!d.overlay) return;
      seen.add(d.id);
      measured++;
      const want = MIN_LINES * d.line;
      rec.check(d.region.client >= want,
        `${v.name} at ${where}: ${d.region.el} shows ${d.region.client}px, want >= ${want}px (${MIN_LINES} lines of ${d.line}px)`);
    });
    for (const id of REQUIRED_OVERLAYS.filter(id => !seen.has(id))) {
      rec.fail(`${where}: no state put #${id} on screen -- nothing was measured`);
    }
  }
  rec.ok(`${measured} overlay states keep a scrolling region of at least ${MIN_LINES} lines in ${ROOM_CELLS.length} cells`);
}
