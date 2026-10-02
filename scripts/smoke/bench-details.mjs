/* #147's own guard (see docs/specs/147-bench-details.md's Proof section):
 * settles items 1, 3, 4, 5 and 6.
 *
 *   item 1 -- the Next change box clears the floating foot at every stint,
 *     at three phone heights, and a "just on" tag never grows a floor row.
 *   item 3 -- the scope control is the shared `.seg` (no `.gm-scope` look
 *     left behind), and "Sit for the rest" is a plain `.btn` sibling after
 *     it, not a third segment.
 *   item 4 (closes #167) -- no sideways spill at 320px/32px text with a
 *     player picked, checked with a "just on" tagged floor row on screen
 *     (stint 0 never carries one, so a plain fresh `goRich` open would
 *     measure nothing about the tag).
 *   item 5 -- the last bench row stays reachable by scrolling `.gm-body`,
 *     with and without a pick, and its 9.5rem bottom padding is not
 *     narrowed to make that true.
 *   item 6 -- `#gmDone` reads "Leave".
 *
 * Item 2 (the swap toast's minutes) is `test/gamemode-bench-text.test.js`'s
 * job, at the `node --test` seam -- this file does not re-derive that
 * string. Item 7 (the large-text toast state) lives in `app-large-text.mjs`;
 * item 8 (dark/team-color pinning of the seg and the sit button) lives in
 * `team-color.mjs`, which already owns every other bench-mode color pin.
 */
import { evalIn, step, WIDTH, OVERFLOW_PROBE, CSS_VAR_COLOR_PROBE, GM_BODY_OVERFLOW_PROBE, setWidth } from './dom.mjs';
import { land } from './page-state.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';

const OPEN_BENCH = `document.querySelector('#gmOpen').click()`;
const PICK = `document.querySelector('#gmFloor .gm-p')?.click()`;
const CLOSE_BENCH = `document.getElementById('gmClose')?.click()`;

// The three heights the spec's item 1 checks by name, plus 390x844 doubling
// as the everyday phone for items 3-6 below.
const STINT_VIEWPORTS = [{ w: 320, h: 640 }, { w: 375, h: 667 }, { w: 390, h: 844 }];

const NEXT_VS_FOOT_PROBE = `(() => {
  const next = document.getElementById('gmNext');
  const foot = document.querySelector('.gm-foot');
  const nr = next.getBoundingClientRect(), fr = foot.getBoundingClientRect();
  return JSON.stringify({ nextBottom: Math.round(nr.bottom), footTop: Math.round(fr.top) });
})()`;

// Floor row heights (I1's 48px floor) and which ones carry the "just on" tag
// -- item 1's own claim is that a row showing the tag is not taller than one
// that does not, at 320px wide.
const FLOOR_ROWS_PROBE = `JSON.stringify([...document.querySelectorAll('#gmFloor .gm-p')].map(p => ({
  h: Math.round(p.getBoundingClientRect().height),
  tagged: !!p.querySelector('.tag.in'),
})))`;

export async function benchDetailsPass(c, origin) {
  const problems = [];
  let measuredStints = 0;

  try {
    /* ---- item 1: Next change clears the controls, stint by stint ---- */
    for (const { w, h } of STINT_VIEWPORTS) {
      await land(c, origin, { width: w, height: h });
      await evalIn(c, step(OPEN_BENCH));
      for (let i = 0; i < 8; i++) {
        const where = `stint ${i + 1} of 8 @ ${w}x${h}`;
        await evalIn(c, `document.querySelector('.gm-body').scrollTop = 0`);
        const r = JSON.parse(await evalIn(c, NEXT_VS_FOOT_PROBE));
        if (r.nextBottom > r.footTop + 0.5) {
          problems.push(`${where}: #gmNext bottom ${r.nextBottom} is below .gm-foot top ${r.footTop}`);
        }
        measuredStints++;
        const rows = JSON.parse(await evalIn(c, FLOOR_ROWS_PROBE));
        if (!rows.length) {
          problems.push(`${where}: no floor rows to measure`);
        } else {
          const short = rows.find(row => row.h < 48);
          if (short) problems.push(`${where}: a floor row is ${short.h}px tall, want >=48 (I1)`);
          if (w === 320) {
            const tagged = rows.filter(row => row.tagged).map(row => row.h);
            const plain = rows.filter(row => !row.tagged).map(row => row.h);
            if (tagged.length && plain.length && Math.max(...tagged) > Math.max(...plain)) {
              problems.push(`${where}: a floor row with "just on" is ${Math.max(...tagged)}px tall against `
                + `${Math.max(...plain)}px for one without -- the tag grew the row`);
            }
          }
        }
        const next2 = await evalIn(c, `document.getElementById('gmNext2').disabled`);
        if (!next2 && i < 7) await evalIn(c, step(`document.getElementById('gmNext2').click()`));
      }
      await evalIn(c, step(CLOSE_BENCH));
    }
    if (measuredStints !== 8 * STINT_VIEWPORTS.length) {
      // rule 2a of /new-guard: a check that measured nothing (or fewer
      // stints than the game actually has) fails rather than passing quietly.
      problems.push(`only measured ${measuredStints} of ${8 * STINT_VIEWPORTS.length} stint/viewport combinations`);
    }

    /* ---- item 1, continued: reachable by scrolling at 320px/32px text ---- */
    await land(c, origin, { width: LARGE_TEXT_WIDTH, textPx: LARGE_TEXT_PX });
    {
      await evalIn(c, step(OPEN_BENCH));
      await evalIn(c, `(() => { const b = document.querySelector('.gm-body'); b.scrollTop = b.scrollHeight; })()`);
      const r = JSON.parse(await evalIn(c, NEXT_VS_FOOT_PROBE));
      if (r.nextBottom > r.footTop + 0.5) {
        problems.push(`${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text, max scroll: #gmNext bottom ${r.nextBottom} `
          + `is below .gm-foot top ${r.footTop}`);
      }
      await evalIn(c, step(CLOSE_BENCH));
    }

    /* ---- item 3: the scope control is `.seg`, Sit for the rest is a
       plain `.btn` sibling after it ---- */
    await land(c, origin);
    await evalIn(c, step(OPEN_BENCH));
    await evalIn(c, step(PICK));
    const surface = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})('var(--surface)')`);
    const scope = JSON.parse(await evalIn(c, `(() => {
      const lab = document.getElementById('gmBenchLab');
      const kids = [...lab.children];
      const seg = lab.querySelector('.seg');
      const sit = kids.find(k => k.textContent.trim() === 'Sit for the rest');
      const r = sit ? sit.getBoundingClientRect() : null;
      return JSON.stringify({
        hasSeg: !!seg,
        hasOldScope: !!lab.querySelector('.gm-scope'),
        segIndex: seg ? kids.indexOf(seg) : -1,
        sitIndex: sit ? kids.indexOf(sit) : -1,
        sitInsideSeg: seg && sit ? seg.contains(sit) : null,
        sitTag: sit ? sit.tagName : null,
        sitClasses: sit ? [...sit.classList] : null,
        sitText: sit ? sit.textContent.trim() : null,
        sitH: r ? Math.round(r.height) : null,
        sitBg: sit ? getComputedStyle(sit).backgroundColor : null,
        onCount: document.querySelectorAll('#gmBenchLab .seg button.on').length,
      });
    })()`));
    if (!scope.hasSeg) problems.push('item 3: no .seg scope control in #gmBenchLab');
    if (scope.hasOldScope) problems.push('item 3: .gm-scope is still present -- the old look was not dropped');
    if (scope.onCount !== 1) problems.push(`item 3: ${scope.onCount} segmented buttons carry .on, want exactly 1`);
    if (!scope.sitTag) problems.push('item 3: no "Sit for the rest" control found');
    else {
      if (scope.sitTag !== 'BUTTON') problems.push(`item 3: "Sit for the rest" is a <${scope.sitTag.toLowerCase()}>, want <button>`);
      if (scope.sitInsideSeg) problems.push('item 3: "Sit for the rest" is still inside the segmented control');
      if (scope.segIndex >= 0 && scope.sitIndex >= 0 && scope.sitIndex < scope.segIndex) {
        problems.push('item 3: "Sit for the rest" comes before the segmented control, want after');
      }
      if (!scope.sitClasses.includes('btn')) problems.push(`item 3: "Sit for the rest" classes are ${JSON.stringify(scope.sitClasses)}, want .btn`);
      if (scope.sitClasses.includes('primary')) problems.push('item 3: "Sit for the rest" is .btn.primary -- the one filled button here is Finish game');
      if (scope.sitText !== 'Sit for the rest') problems.push(`item 3: "Sit for the rest" reads ${JSON.stringify(scope.sitText)}`);
      if (scope.sitH < 48) problems.push(`item 3: "Sit for the rest" hit area is ${scope.sitH}px tall, want >=48`);
      if (scope.sitBg !== surface) problems.push(`item 3: "Sit for the rest" background is ${scope.sitBg}, want the plain surface fill ${surface} -- not tint or accent filled`);
    }

    /* ---- item 4 (closes #167): no sideways spill at 320px/32px text with
       a player picked, with a "just on" tagged floor row on screen.
       Review finding on this diff's first pass: every 320/32 check opened
       bench mode fresh (`i === 0`), where `prevFloor` is null and no row
       can carry the tag (gamemode.js's `justOn`/`prevFloor`), so the tag's
       own CSS (`.gm-p.fresh .nm` and `.gm-p .mn`'s `white-space: nowrap`,
       app.css) went untested at a large-text root. One `#gmNext2` step
       lands on stint 2, which this fixture already tags at 320/16 (the
       item 1 loop above), so the row is on screen before either probe
       runs. */
    await land(c, origin, { width: LARGE_TEXT_WIDTH, textPx: LARGE_TEXT_PX });
    {
      await evalIn(c, step(OPEN_BENCH));
      await evalIn(c, step(`document.getElementById('gmNext2').click()`));
      const tagged = await evalIn(c, `document.querySelectorAll('#gmFloor .gm-p.fresh').length`);
      if (!tagged) {
        // rule 2a of /new-guard: without a tagged row on screen, the spill
        // check below would measure stint 0 and prove nothing about the tag.
        problems.push(`item 4: no "just on" tagged floor row on screen at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text -- nothing was measured`);
      }
      await evalIn(c, step(PICK));
      // reuse GM_BODY_OVERFLOW_PROBE (dom.mjs) for the scrollWidth-vs-
      // clientWidth comparison rather than re-deriving it here.
      const gb = JSON.parse(await evalIn(c, GM_BODY_OVERFLOW_PROBE));
      if (!gb.body) problems.push('item 4: no .gm-body to check for a body-relative sideways spill');
      else if (gb.scrollWidth > gb.clientWidth + 1) {
        problems.push(`item 4 (#167): .gm-body scrollWidth ${gb.scrollWidth} exceeds its clientWidth ${gb.clientWidth} at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`);
      } else if (gb.worst) {
        problems.push(`item 4 (#167): ${gb.worst.el} reaches ${gb.worst.out}px past .gm-body's own box`);
      }
      // layered on top of the probe: the seg/sit boxes themselves, which
      // `GM_BODY_OVERFLOW_PROBE` does not name individually.
      const boxes = JSON.parse(await evalIn(c, `(() => {
        const vw = document.documentElement.clientWidth;
        const seg = document.querySelector('#gmBenchLab .seg');
        const sit = [...document.getElementById('gmBenchLab').children].find(k => k.textContent.trim() === 'Sit for the rest');
        const segR = seg?.getBoundingClientRect(), sitR = sit?.getBoundingClientRect();
        return JSON.stringify({
          vw,
          seg: segR && { l: Math.round(segR.left), r: Math.round(segR.right) },
          sit: sitR && { l: Math.round(sitR.left), r: Math.round(sitR.right) },
        });
      })()`));
      for (const [label, box] of [['.seg', boxes.seg], ['Sit for the rest', boxes.sit]]) {
        if (!box) { problems.push(`item 4: ${label} not found while checking for spill`); continue; }
        if (box.l < -0.5 || box.r > boxes.vw + 0.5) {
          problems.push(`item 4 (#167): ${label} spans ${box.l} to ${box.r} in a ${boxes.vw}px viewport`);
        }
      }
      const ov = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
      if (ov.pans || ov.worst) problems.push(`item 4 (#167): the page itself overflows at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text: ${JSON.stringify(ov)}`);
      await evalIn(c, step(CLOSE_BENCH));
    }

    /* ---- item 5: bench rows reachable by scrolling, 390x844 and 320x640,
       with and without a pick -- and the 9.5rem bottom padding stays ---- */
    for (const { w, h } of [{ w: 390, h: 844 }, { w: 320, h: 640 }]) {
      for (const picked of [false, true]) {
        await land(c, origin, { width: w, height: h });
        await evalIn(c, step(OPEN_BENCH));
        if (picked) await evalIn(c, step(PICK));
        await evalIn(c, `(() => { const b = document.querySelector('.gm-body'); b.scrollTop = b.scrollHeight; })()`);
        const r = JSON.parse(await evalIn(c, `(() => {
          const rows = document.querySelectorAll('#gmFloor .gm-p, #gmBench .gm-b');
          const last = rows[rows.length - 1];
          const foot = document.querySelector('.gm-foot');
          if (!last) return JSON.stringify({ none: true });
          const lr = last.getBoundingClientRect(), fr = foot.getBoundingClientRect();
          return JSON.stringify({ lastBottom: Math.round(lr.bottom), footTop: Math.round(fr.top) });
        })()`));
        const where = `${w}x${h}, ${picked ? 'a player picked' : 'no pick'}`;
        if (r.none) problems.push(`item 5: ${where}: no floor or bench row to measure`);
        else if (r.lastBottom > r.footTop + 0.5) {
          problems.push(`item 5: ${where}: the last bench row ends at ${r.lastBottom}, below .gm-foot's top ${r.footTop}`);
        }
        await evalIn(c, step(CLOSE_BENCH));
      }
    }
    await land(c, origin);
    const padBottom = parseFloat(await evalIn(c, `getComputedStyle(document.querySelector('.gm-body')).paddingBottom`));
    if (padBottom < 152 - 0.5) {
      problems.push(`item 5: .gm-body's bottom padding computes to ${padBottom}px, want at least 9.5rem (152px)`);
    }

    /* ---- item 6: the bottom exit reads "Leave" ---- */
    const doneText = await evalIn(c, `document.getElementById('gmDone').textContent.trim()`);
    if (doneText !== 'Leave') problems.push(`item 6: #gmDone reads ${JSON.stringify(doneText)}, want "Leave"`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await evalIn(c, step(CLOSE_BENCH)).catch(() => {});
    await setWidth(c, WIDTH);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}${problems.length > 4 ? ` (+${problems.length - 4} more)` : ''}`
      : `Next change clears the foot at all 8 stints across 3 phone heights and at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text (scrolled), `
        + 'the scope control is .seg with Sit for the rest a plain .btn after it, no sideways spill at 320px/32px text, '
        + 'the last bench row stays reachable, and #gmDone reads "Leave"',
  };
}
