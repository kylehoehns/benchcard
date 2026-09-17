import { evalIn, step } from './dom.mjs';

/* Shared by the two "own guard" behavioral passes -- #27's `sentence-sheets.mjs`
 * and #28's `plan-sheet.mjs` -- both of which drive a real dialog with real
 * buttons, keys and pointer events rather than reading source. Split out once
 * #28's version of these eight helpers pushed `plan-sheet.mjs` over the
 * 40,000-byte guard `test/smoke-size.test.js` enforces (see that file's own
 * comment on why the ceiling is bytes, not lines): the two files were
 * word-for-word copies already, so this is the one place they now live,
 * matching `width-sweep.mjs`'s own shared-helper shape.
 *
 * The drag and the backdrop click are real `Input.dispatchMouseEvent`s at
 * page coordinates -- a script `.click()` on the dialog element is not what
 * a backdrop tap is (trap.js's own close-on-backdrop guards `e.target ===
 * dialog`, which only an event landing outside every child produces), and a
 * handle drag has to engage `setPointerCapture`, which only a real pointer
 * sequence does. Geometry is `getBoundingClientRect`, never `getClientRects`
 * (`/browser-verify`).
 */

export async function evalJSON(c, expr) {
  return JSON.parse(await evalIn(c, expr));
}

export async function click(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

export async function drag(c, x, y0, y1, steps = 8) {
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: y0, button: 'left', clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const y = y0 + (y1 - y0) * (i / steps);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
  }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y1, button: 'left', clickCount: 1 });
}

export async function settle(c) {
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
  // Every edit these two passes drive goes through `soon(...)` (render.js),
  // which debounces 140ms before it actually repaints -- there is no
  // animation to wait on for a plain textContent swap, so two quiet rAF
  // pairs alone races it. 220ms clears the debounce with margin.
  await new Promise(r => setTimeout(r, 220));
}

// #28 only: a level-2 push/pop plays a 260ms slide (`PANE_MS`, trap.js) that
// `settle` alone does not clear (the harness never emulates
// `prefers-reduced-motion`, so the full transition always plays) -- used
// after every back/push/pop so the popped pane's `hidden` has actually
// landed before the next read.
export async function settlePane(c) {
  await settle(c);
  await new Promise(r => setTimeout(r, 200));
}

// The single most common shape in both passes: a JS statement run through
// `step`, then a settle. `tap`/`tapPane` fold that pair into one call.
export async function tap(c, js) {
  await evalIn(c, step(js));
  await settle(c);
}

export async function tapPane(c, js) {
  await evalIn(c, step(js));
  await settlePane(c);
}

// The dialog's own box, and the handle's, for the geometry and drag checks.
export async function sheetRect(c, sel) {
  return evalJSON(c, `(() => {
    const d = document.querySelector(${JSON.stringify(sel)});
    if (!d) return 'null';
    const r = d.getBoundingClientRect();
    const h = d.querySelector('.bsheet-handle')?.getBoundingClientRect();
    return JSON.stringify({ open: d.open, top: r.top, height: r.height,
      handle: h ? { x: h.left + h.width / 2, y: h.top + h.height / 2 } : null });
  })()`);
}

// A direct `game()` edit in the page, followed by the same re-plan a real
// edit schedules -- used to reach range ends and other states no button
// reaches in one tap. `mutate` is a JS statement string with `s` (state.js)
// already imported for it.
export function setGame(mutate) {
  return step(`(async () => {
    const s = await import('/state.js');
    ${mutate}
    const rr = await import('/render.js');
    rr.renderAll();
  })()`);
}

// The open dialog's own status line against `planSay(g, plans[activeGame])`,
// read from `state.js` -- never recomputed here.
export async function statusMatches(c, statusSel) {
  return evalJSON(c, `(async () => {
    const s = await import('/state.js');
    const g = s.game();
    const p = s.plans[s.state.activeGame];
    const want = s.planSay(g, p);
    const got = document.querySelector(${JSON.stringify(statusSel)})?.textContent || '';
    return JSON.stringify({ want, got, match: want === got });
  })()`);
}
