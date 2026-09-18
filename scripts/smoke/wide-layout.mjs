import { evalIn, step, TODAY_HOME, WIDTH, HEIGHT } from './dom.mjs';
import { VIEWS } from './sweep.mjs';
import { nameOf, RAIL, WIDE_MIN, SHEET_MIN, LAPTOP } from './registry.mjs';
import { evalJSON, tap } from './sheet-drive.mjs';

/* #35's own guard (docs/specs/35-wide-screens.md, Proof 3): the two-pane
 * layout, driven in the real app over CDP and measured with
 * `getBoundingClientRect`.
 *
 * WHY A BROWSER AND NOT A TEST. Everything this asserts is the OUTCOME of a
 * cascade -- `[hidden] { display: none !important }` beaten by the wide
 * block's own `display: block !important`, a `position: fixed` rail under a
 * bar whose height is a custom property, and five margins. Reading the
 * stylesheet cannot tell you where the boxes landed, and the one test that
 * does read it (`test/wide-layout.test.js`) says so in its own header. These
 * are the numbers from "What would settle it" items 1, 2, 3 and 4, measured.
 *
 * The five screens and the click that opens each one come from `VIEWS` in
 * `sweep.mjs` -- there is no second list of how to reach Team here, and a
 * sixth screen added there arrives here too. `RAIL`, `WIDE_MIN`, `SHEET_MIN`
 * and `LAPTOP` come from the registry, which is also where the row's printed
 * name and the sweep's own extra widths are built from them, so the numbers in
 * the table and the numbers measured are the same numbers.
 *
 * Rule 2a: every assertion is counted, and a run that made fewer than
 * `AUDIT_FLOOR` of them FAILS even with nothing wrong -- a probe that came
 * back empty (a renamed id, a view that never opened) would otherwise print
 * a green row having proved nothing at all.
 */

// 39 assertions in a healthy run, measured: the two wide widths, 3 for the
// window dragged across the breakpoint without navigating, the sheet at 600px
// and at 599px, and the Resume bar's own when the fixture has a part-played
// game to offer. Well under that means a probe came back empty.
const AUDIT_FLOOR = 30;

// The centered sheet's cap (decision 11) and the width that must still show a
// bottom sheet (What would settle it, item 4). 560 is the spec's number, not
// a reading of the stylesheet -- `test/wide-layout.test.js` holds the CSS to
// it from the other side.
const SHEET_CAP = 560;
const SHEET_BELOW = SHEET_MIN - 1;
const WIDE_WIDTHS = [LAPTOP, WIDE_MIN];
// One pixel below the two-pane floor: the narrow side of the boundary a coach
// drags a laptop window across. Derived from `WIDE_MIN`, like `SHEET_BELOW` is
// from `SHEET_MIN`, so there is no second copy of either number here.
const WIDE_BELOW = WIDE_MIN - 1;

const openOf = name => VIEWS.find(v => v.name === name).open;

/* One round trip, every box this pass has anything to say about. `on` is
   "actually drawn", not "has no hidden attribute": above 840px `#view-today`
   carries `hidden` the whole time and is on screen anyway, which is the
   entire point of the layout, and `#actionbar` is the mirror image. */
const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const box = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      on: getComputedStyle(el).display !== 'none' && r.width > 0 && r.height > 0,
      /* The attribute as well as the paint, because they answer different
         questions: measureChromeHeights (render.js) picks the first bottom
         bar WITHOUT a hidden attribute to set --ab-h from, so an #actionbar
         that is merely display:none still counts as the bar, and --ab-h
         reads 0 while the Resume bar is on screen. */
      hidden: el.hidden,
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      width: Math.round(r.width), height: Math.round(r.height),
    };
  };
  return JSON.stringify({
    vw, vh,
    view: document.documentElement.dataset.view || null,
    rail: box('#view-today'),
    games: box('#view-games'),
    team: box('#view-team'),
    resume: box('#resumeBar'),
    actionbar: box('#actionbar'),
    sheet: box('dialog.bsheet[open]'),
  });
})()`;

/* A width change is two settles, not one: the media queries apply on the next
   frame, and `render.js`'s `change` listener on the wide query then repaints
   both panes through `soon()`'s 140ms debounce. Measuring on the frame after
   the resize reads the layout the app is leaving. */
async function atWidth(c, w) {
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
  await new Promise(r => setTimeout(r, 400));
}

export async function wideLayoutPass(c) {
  const problems = [];
  let audited = 0;
  const ck = (cond, msg) => { audited++; if (!cond) problems.push(msg); return cond; };
  const read = () => evalJSON(c, PROBE);

  try {
    /* ---- items 1 and 2: the two-pane layout at 1280px and 840px ---- */
    for (const w of WIDE_WIDTHS) {
      await atWidth(c, w);
      await tap(c, TODAY_HOME);

      const home = await read();
      const where = `${w}px`;
      // The rail: Today, on screen while Today is also the current screen.
      // `ck` hands its own verdict back, so the two measurements that only
      // mean something once the box exists are guarded by the assertion that
      // it does, written once. A box that never turned up still counts those
      // measurements (`audited`): it has already pushed a message naming the
      // real failure, and a short count would hand the blame to the audit
      // floor instead.
      if (ck(home.rail && home.rail.on, `${where}: #view-today is not on screen -- the left rail is missing`)) {
        ck(home.rail.left === 0, `${where}: the rail starts at ${home.rail.left}px, want 0`);
        ck(home.rail.width === RAIL, `${where}: the rail is ${home.rail.width}px wide, want ${RAIL}`);
      } else { audited += 2; }
      /* Decision 7: on Today the right pane's resting state is the open game,
         so BOTH panes are on screen and the game starts where the rail ends.
         Item 2's own number falls straight out of it: 1280 - 360 = 920. */
      if (ck(home.games && home.games.on,
        `${where}: the game is not on screen beside Today -- the right pane is empty`)) {
        ck(home.games.left === RAIL,
          `${where}: the open screen starts at ${home.games.left}px, want ${RAIL} (the rail's own width)`);
        ck(home.games.width === home.vw - RAIL,
          `${where}: the right pane is ${home.games.width}px wide, want ${home.vw - RAIL}`);
      } else { audited += 2; }
      /* Decision 7's second consequence: the floating Start-game bar is a
         narrow-screen affordance, so only one bottom bar is ever on screen
         here and `measureChromeHeights`'s one-bar assumption still holds. */
      ck(!(home.actionbar && home.actionbar.on),
        `${where}: #actionbar is still drawn -- above ${WIDE_MIN}px the inline .gm-start row carries Start game`);
      // Today's own floating action, pinned to the rail because it belongs to
      // the rail. Only when the fixture has a part-played game to resume.
      if (home.resume && home.resume.on) {
        ck(home.resume.left === 0, `${where}: #resumeBar starts at ${home.resume.left}px, want 0`);
        ck(home.resume.width <= RAIL,
          `${where}: #resumeBar is ${home.resume.width}px wide -- it belongs to the ${RAIL}px rail, not the window`);
      }

      /* "Choosing Team on the left replaces the right pane." */
      await tap(c, openOf('team'));
      const team = await read();
      ck(team.rail && team.rail.on && team.rail.left === 0 && team.rail.width === RAIL,
        `${where}: the rail did not survive opening Team (${JSON.stringify(team.rail)})`);
      ck(team.team && team.team.on, `${where}: Team did not open in the right pane`);
      ck(team.team && team.team.left === RAIL,
        `${where}: Team starts at ${team.team && team.team.left}px, want ${RAIL}`);
      ck(!(team.games && team.games.on),
        `${where}: the game is still drawn under Team -- Team covers it, it does not sit beside it`);

      /* "Pressing back puts the game back." Back from Team is Today, and at
         this width Today IS the game in the right pane -- which is what the
         acceptance criterion means by the previous choice coming back. */
      await tap(c, `document.querySelector('#backBtn').click()`);
      const back = await read();
      ck(back.games && back.games.on,
        `${where}: back from Team left the right pane empty -- the open game did not come back`);
      ck(back.games && back.games.left === RAIL,
        `${where}: after back the game starts at ${back.games && back.games.left}px, want ${RAIL}`);
    }

    /* ---- the window dragged across the breakpoint, without navigating ----
     *
     * A coach on a laptop resizes the window; she does not tap a screen to
     * make the layout change. `applyView` is the only thing that decides
     * `#actionbar.hidden`, and it runs on a view CHANGE -- so whichever
     * verdict the last navigation left is the one a crossing inherits. Both
     * directions are wrong in their own way, which is why both are measured:
     * dragged wider, an `#actionbar` with no `hidden` attribute is still
     * `measureChromeHeights`'s bottom bar, so `--ab-h` reads 0 while the
     * Resume bar sits over the rail; dragged narrower, a `hidden` left behind
     * from the wide layout takes Start game away entirely -- the inline
     * `.gm-start` row is gone below 840px too, so there is no way in at all.
     *
     * Every other pass here taps something at each width, which is exactly
     * what hides this: the tap repaints the thing the resize should have. */
    await atWidth(c, WIDE_BELOW);
    await tap(c, TODAY_HOME);
    await tap(c, openOf('games'));
    ck((await read()).actionbar?.on,
      `${WIDE_BELOW}px: #actionbar is not drawn on the game screen, so the crossing below `
      + 'starts from the wrong place and proves nothing');

    await atWidth(c, WIDE_MIN);
    const wider = await read();
    ck(wider.actionbar?.hidden === true,
      `${WIDE_BELOW} -> ${WIDE_MIN}px without navigating: #actionbar has no hidden attribute, so `
      + `measureChromeHeights takes --ab-h from a bar that is not drawn and the rail's last game `
      + 'entry sits under the Resume bar');

    /* The other direction starts from a REAL wide navigation -- open the game
       at 840px, where `applyView` hides the floating bar on purpose -- and
       then drags the window narrow. Starting it from the crossing above
       instead would prove nothing until the fix exists: the bar was still
       showing, so it would go on showing. */
    await atWidth(c, WIDE_MIN);
    await tap(c, TODAY_HOME);
    await tap(c, openOf('games'));
    await atWidth(c, WIDE_BELOW);
    ck((await read()).actionbar?.on,
      `${WIDE_MIN} -> ${WIDE_BELOW}px without navigating: #actionbar is still hidden from the wide `
      + 'layout, and .gm-start is hidden at this width too -- the coach has no way to start a game');

    /* ---- items 3 and 4: one column, and the sheet at 600px and 599px ---- */
    for (const w of [SHEET_MIN, SHEET_BELOW]) {
      await atWidth(c, w);
      await tap(c, TODAY_HOME);
      await tap(c, openOf('games'));

      const where = `${w}px`;
      const one = await read();
      // Item 3's first half: below WIDE_MIN there is no rail, so Today is off
      // screen while the game is the current screen, exactly as on a phone.
      ck(!(one.rail && one.rail.on),
        `${where}: #view-today is on screen under the game -- the two-pane layout starts at ${WIDE_MIN}px, not here`);

      // The card sheet is the one `dialog.bsheet` reachable from the game
      // screen's own chrome (#29 decision 8's #shareBtn), so it is the sheet
      // these two widths are measured on.
      await tap(c, `document.getElementById('shareBtn').click()`);
      const s = (await read()).sheet;
      if (ck(s && s.on, `${where}: #shareBtn did not open a dialog.bsheet, so nothing was measured`)) {
        if (w >= SHEET_MIN) {
          // Item 3: centered, capped, clear of all four edges.
          ck(s.width <= SHEET_CAP, `${where}: the sheet is ${s.width}px wide, want at most ${SHEET_CAP}`);
          ck(s.left > 0, `${where}: the sheet's left edge is at ${s.left}px -- a centered dialog is clear of the edge`);
          ck(s.right < one.vw, `${where}: the sheet reaches ${s.right}px of ${one.vw}px -- it is still full width`);
          ck(s.top > 0, `${where}: the sheet's top edge is at ${s.top}px -- it is still a full-height sheet`);
        } else {
          // Item 4: one pixel below the breakpoint nothing has changed.
          ck(s.width >= one.vw - 1,
            `${where}: the sheet is ${s.width}px wide in a ${one.vw}px window -- below ${SHEET_MIN}px it is still full width`);
          ck(s.bottom >= one.vh - 1,
            `${where}: the sheet's bottom edge is at ${s.bottom}px of ${one.vh}px -- below ${SHEET_MIN}px it is flush to the bottom`);
        }
      } else if (w >= SHEET_MIN) { audited += 4; } else { audited += 2; }
      await tap(c, `document.getElementById('sheetCardClose')?.click()`);
    }
  } finally {
    /* Back to the viewport every other pass measures at, as `narrowPass`
       does -- and back to Today, so the next pass starts where a full run's
       previous pass would have left it. Through `atWidth`, so the restore
       waits out the same two settles every measured width above did: a pass
       that handed the next one a half-applied layout would be the same bug
       this one is written to catch, one pass later. */
    await atWidth(c, WIDTH);
    await evalIn(c, step(TODAY_HOME));
  }

  // Rule 2a: nothing measured is a failure, not a pass.
  if (!problems.length && audited < AUDIT_FLOOR) {
    problems.push(`only ${audited} measurement(s) were made, want at least ${AUDIT_FLOOR}`
      + ' -- the probes came back empty, so this row proves nothing');
  }

  const pass = problems.length === 0;
  return {
    name: nameOf('widelayout'),
    pass,
    detail: pass
      ? `${audited} measurements: ${RAIL}px rail at left 0 and the open screen at ${RAIL}px, `
        + `${WIDE_WIDTHS.join('px and ')}px; Team replaces the right pane and back restores the game; `
        + `the sheet is centered at ${SHEET_MIN}px and flush to the bottom at ${SHEET_BELOW}px`
      : `${problems.length} of ${audited}: ${problems.slice(0, 6).join('; ')}${problems.length > 6 ? ' …' : ''}`,
  };
}
