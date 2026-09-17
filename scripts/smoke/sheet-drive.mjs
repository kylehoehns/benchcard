import { evalIn, step, HEIGHT } from './dom.mjs';

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

// #73 item 10: `closeSheet` (✕, Escape, backdrop, drag/flick) now slides
// rather than closing at once, so a check right after the action would race
// the `--t` + 100ms transition (trap.js) -- this polls instead of reading
// `dialog.open` the instant the action returns.
export async function waitClosed(c, sel, timeoutMs = 700) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const open = await evalJSON(c, `JSON.stringify(document.querySelector(${JSON.stringify(sel)})?.open ?? null)`);
    if (open === false) return true;
    await new Promise(r => setTimeout(r, 30));
  }
  return false;
}

// #73 item 20's "fast flick" close path: one `mouseMoved` spanning the whole
// distance, released immediately -- the fewest possible round trips, so the
// wall-clock time `dragSpeed` (trap.js) reads between its first and last
// sample is short enough to register as a flick rather than a slow drag that
// happens to cross the same distance.
export async function flick(c, x, y0, y1) {
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: y0, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y1, button: 'left' });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y1, button: 'left', clickCount: 1 });
}

// #73 item 4: right after opening (or a push, item 1's Plan-sheet clause),
// focus is the sheet's own title (`h2`, tabindex="-1") -- never the handle,
// which item 2 gives its own, later, tab stop (trap.js's `focusTarget`).
export async function titleFocused(c, titleId) {
  return evalJSON(c, `JSON.stringify({
    onTitle: document.activeElement?.id === ${JSON.stringify(titleId)},
    isHandle: document.activeElement?.classList?.contains('bsheet-handle') || false,
  })`);
}

// `sentence-sheets.mjs`'s own shape on top of `titleFocused` above, for its
// three sheets opened at level 1 (Who's here, Format, Sub interval): naming
// the handle specifically when that is where focus landed, since that is the
// regression item 1/2 exist to catch. `plan-sheet.mjs`'s pushes read
// `titleFocused` directly instead -- there focus is one field among several
// gathered in the same round trip, not its own check.
export async function checkTitleFocused(c, ck, titleId, label) {
  const tf = await titleFocused(c, titleId);
  ck(tf.onTitle && !tf.isHandle, tf.isHandle
    ? `focus landed on the handle on opening ${label}, want ${titleId}`
    : `focus did not land on ${titleId} on opening ${label}`);
}

// #73 items 3/10/20: the shape every close path (✕, Escape, backdrop, drag,
// flick) checks -- closed within the slide, and focus back on the trigger.
export async function closedWithFocus(c, dialogSel, triggerSel) {
  const closed = await waitClosed(c, dialogSel);
  const focusBack = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector(${JSON.stringify(triggerSel)}))`);
  return { closed, focusBack };
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

// The half <-> full resize check both passes share, word-for-word but for
// each sheet's own half-height math (Who's here's half band vs. Plan's flat
// 50vh) -- `halfOk(topPx)` is that one caller-owned predicate. Drags up past
// ~30% of the sheet's own height to full, checks the handle's aria-label
// flips too (item 17), then a plain click on the handle back to half.
export async function resizeCheck(c, sel, ck, halfOk) {
  const rect = await sheetRect(c, sel);
  if (!ck(!!rect.handle, `${sel} has no .bsheet-handle to drag (resize)`)) return;
  await drag(c, rect.handle.x, rect.handle.y, rect.handle.y - rect.height * 0.3);
  await settle(c);
  const full = await sheetRect(c, sel);
  const fullLabel = await evalJSON(c, `JSON.stringify(document.querySelector(${JSON.stringify(sel)} + ' .bsheet-handle')?.getAttribute('aria-label'))`);
  ck(full.top <= HEIGHT * 0.15, `${sel}'s top edge is ${Math.round(full.top)}px after dragging up, want <= 15%`);
  ck(fullLabel === 'Half height', `the handle reads "${fullLabel}" at full height, want "Half height"`);
  await click(c, full.handle.x, full.handle.y);
  await settle(c);
  const half = await sheetRect(c, sel);
  ck(halfOk(half.top), `${sel}'s top is ${Math.round(half.top)}px after clicking the handle again, want half height`);
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

// The `statusMatches` check every open sheet's status line gets, folded into
// one wrapper: `sentence-sheets.mjs` and `plan-sheet.mjs` each had their own,
// word-for-word identical but for `sentence-sheets.mjs`'s second assertion
// (its three sheets' status line also has to match the minutes-each/blocked
// wording, which #28's Plan sheet does not additionally claim -- `planSay`
// is the single source for both, so there is nothing left for a Plan-sheet
// caller to check twice). `extra`, an optional `(r, ck, sel) => void`, is
// exactly that second assertion, left to the caller rather than baked in
// here; `sel` is passed through so an `extra` shared across several
// selectors can still name the right one in its own failure message.
export async function statusOk(c, sel, ck, extra) {
  const r = await statusMatches(c, sel);
  ck(r.match, `${sel} reads "${r.got}", want planSay's own "${r.want}"`);
  if (extra) extra(r, ck, sel);
}
