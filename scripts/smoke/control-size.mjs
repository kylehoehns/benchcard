import { evalJSON, tap } from './sheet-drive.mjs';
import { goRich } from './fixtures.mjs';
import { TODAY_HOME, CSS_VAR_COLOR_PROBE } from './dom.mjs';

/* #140 (prototype control size), "What would settle it" items 1, 3-6 -- the
 * "Drawn sizes" row of the spec's Proof table. Nothing before this pinned how
 * small each control is actually PAINTED: the touch sweep, `plan sheet
 * controls >= 48px` and `settings rows >= 48px` all measure the HIT area
 * (item 8), which this ticket keeps at 48px on purpose, so none of them would
 * notice a stepper or a seg button drawn back up to its old size.
 *
 * "Drawn size is the painted box (background or track), +/-2px" is the
 * spec's own words at the top of "What would settle it"; every rect
 * comparison below uses that +/-2px tolerance (`TOL`).
 *
 * RUNS AT THIS SUITE'S OWN DEFAULT 390x844, light and dark, once per theme
 * end to end: item 4's stepper pill is painted `in --seg-track`, which is a
 * different literal color per theme, so the fill is read back from the live
 * page in each theme rather than one theme standing in for both (the same
 * reasoning `gameRowsFitPass` gives for measuring both). `--seg-track` itself
 * is never re-typed here -- `dom.mjs`'s `CSS_VAR_COLOR_PROBE` reads it back
 * through `getComputedStyle`, in the same rgb() shape the browser reports
 * every other computed color in, so the comparison is never a hex string
 * against an rgb() string.
 *
 * `goRich` lands straight on the games view (it waits for `.card`, same as
 * `goSeed` -- see that function's own comment), so every phrase this reads
 * (`#phraseStrategy`, `#phraseFormat`, `#phraseRules`) is already on screen
 * with no `.today-game` click first. */
const TOL = 2;
const near = (v, target, tol = TOL) => typeof v === 'number' && Math.abs(v - target) <= tol;

const RECT = 'el => { const r = el.getBoundingClientRect(); '
  + 'return { w: r.width, h: r.height, l: r.left, r: r.right, t: r.top, b: r.bottom }; }';

// Item 1: the sentence's own line pitch, and the first phrase's hit area
// (Q1: its full line box, 34.5 tall, never under 34).
async function sentenceMetrics(c) {
  return evalJSON(c, `(() => {
    const rect = ${RECT};
    const sentence = document.getElementById('sentence');
    const phrase = document.getElementById('phrasePlayers');
    if (!sentence || !phrase) return JSON.stringify(null);
    return JSON.stringify({ pitch: parseFloat(getComputedStyle(sentence).lineHeight), phraseH: rect(phrase).h });
  })()`);
}

// Item 3: each seg's button and track drawn height, and the button's own
// font size (14px everywhere, unchanged -- Q2).
const SEG_SELECTORS = ['#stratseg', '#maxSubsSeg', '#tieBreakSeg', '#seasonDefSeg', '#themeSeg'];
async function segMetrics(c) {
  const rows = await evalJSON(c, `JSON.stringify(${JSON.stringify(SEG_SELECTORS)}.map(sel => {
    const rect = ${RECT};
    const track = document.querySelector(sel);
    if (!track || track.getClientRects().length === 0) return { sel, visible: false };
    const btn = track.querySelector('button');
    return { sel, visible: true, trackH: rect(track).h, btnH: rect(btn).h, fontPx: parseFloat(getComputedStyle(btn).fontSize) };
  }))`);
  return rows.filter(r => r.visible);
}

// Items 4 and 5: each stepper's pill (drawn 88x32, painted in --seg-track),
// its two buttons (must not overlap, and must meet exactly at the pill's own
// horizontal middle -- the "two halves of 44" item 4 asks for), the row (48
// tall), and both buttons staying inside the row (+/-0.5, item 5's own
// tolerance for containment, tighter than the drawn-size +/-2px).
async function stepperMetrics(c, containerSel) {
  return evalJSON(c, `JSON.stringify([...document.querySelectorAll(${JSON.stringify(containerSel)} + ' .pstep-row')].map(row => {
    const rect = ${RECT};
    const pstep = row.querySelector('.pstep');
    const btns = [...row.querySelectorAll('.pstep-btn')].map(rect);
    const segTrack = (${CSS_VAR_COLOR_PROBE})('var(--seg-track)');
    const pillRect = rect(pstep);
    return {
      rowRect: rect(row), pillW: pillRect.w, pillH: pillRect.h,
      pillBg: getComputedStyle(pstep).backgroundColor, segTrack,
      mid: pillRect.l + pillRect.w / 2, btn0: btns[0], btn1: btns[1],
    };
  }))`);
}

// Item 6: a switch row (both the `switchRow`-built rows and `#showMinutes`)
// is 48 tall, with the input's own box still 51x48 and inside the row.
async function switchMetrics(c, sel) {
  return evalJSON(c, `(() => {
    const rect = ${RECT};
    const input = document.querySelector(${JSON.stringify(sel)});
    if (!input || input.getClientRects().length === 0) return JSON.stringify(null);
    const row = input.closest('.prow');
    return JSON.stringify({ inputRect: rect(input), rowRect: row ? rect(row) : null });
  })()`);
}

// Item 3: one assertion loop for every seg `segMetrics` returns, so
// `#stratseg` (the Plan sheet's own seg) and the four Settings segs are held
// to the same 36/32/14 rule rather than the Plan seg's own rows only ever
// contributing to `segCount`.
function checkSegMetrics(problems, theme, segs) {
  for (const s of segs) {
    if (!near(s.trackH, 36)) problems.push(`${theme}: ${s.sel} track is ${s.trackH}px tall, want 36 +/-${TOL}`);
    if (!near(s.btnH, 32)) problems.push(`${theme}: ${s.sel} button is ${s.btnH}px tall, want 32 +/-${TOL}`);
    if (!near(s.fontPx, 14, 0.5)) problems.push(`${theme}: ${s.sel} button text is ${s.fontPx}px, want 14`);
  }
}

function checkStepperRows(problems, theme, where, rows) {
  if (rows.length === 0) { problems.push(`${theme}, ${where}: no .pstep-row found -- nothing measured`); return; }
  for (const r of rows) {
    if (!near(r.pillW, 88)) problems.push(`${theme}, ${where}: pill is ${r.pillW}px wide, want 88 +/-${TOL}`);
    if (!near(r.pillH, 32)) problems.push(`${theme}, ${where}: pill is ${r.pillH}px tall, want 32 +/-${TOL}`);
    if (r.pillBg !== r.segTrack) problems.push(`${theme}, ${where}: pill background is ${r.pillBg}, --seg-track resolves to ${r.segTrack}`);
    if (!r.btn0 || !r.btn1) problems.push(`${theme}, ${where}: expected 2 .pstep-btn, found ${[r.btn0, r.btn1].filter(Boolean).length}`);
    else {
      if (r.btn0.w < 48 - 0.5 || r.btn0.h < 48 - 0.5 || r.btn1.w < 48 - 0.5 || r.btn1.h < 48 - 0.5) {
        problems.push(`${theme}, ${where}: a .pstep-btn box is under 48x48: ${JSON.stringify([r.btn0, r.btn1])}`);
      }
      if (r.btn0.r > r.btn1.l + 0.5) problems.push(`${theme}, ${where}: the two .pstep-btn boxes overlap: ${JSON.stringify([r.btn0, r.btn1])}`);
      if (!near(r.btn0.r, r.mid, 1) || !near(r.btn1.l, r.mid, 1)) {
        problems.push(`${theme}, ${where}: the two halves do not meet at the pill's own middle (${r.mid}): ${JSON.stringify([r.btn0, r.btn1])}`);
      }
      if (r.btn0.t < r.rowRect.t - 0.5 || r.btn0.b > r.rowRect.b + 0.5 || r.btn1.t < r.rowRect.t - 0.5 || r.btn1.b > r.rowRect.b + 0.5) {
        problems.push(`${theme}, ${where}: a .pstep-btn is not inside its row: ${JSON.stringify([r.btn0, r.btn1, r.rowRect])}`);
      }
    }
    if (!near(r.rowRect.h, 48)) problems.push(`${theme}, ${where}: .pstep-row is ${r.rowRect.h}px tall, want 48 +/-${TOL}`);
  }
}

function checkSwitchRow(problems, theme, where, m) {
  if (!m) { problems.push(`${theme}, ${where}: switch input not found -- nothing measured`); return; }
  if (!m.rowRect) { problems.push(`${theme}, ${where}: switch input has no .prow ancestor`); return; }
  if (!near(m.rowRect.h, 48)) problems.push(`${theme}, ${where}: row is ${m.rowRect.h}px tall, want 48 +/-${TOL}`);
  if (!near(m.inputRect.w, 51) || !near(m.inputRect.h, 48)) {
    problems.push(`${theme}, ${where}: input box is ${m.inputRect.w}x${m.inputRect.h}, want 51x48 +/-${TOL}`);
  }
  if (m.inputRect.t < m.rowRect.t - 0.5 || m.inputRect.b > m.rowRect.b + 0.5) {
    problems.push(`${theme}, ${where}: input box is not inside its row (input ${JSON.stringify(m.inputRect)}, row ${JSON.stringify(m.rowRect)})`);
  }
}

export async function controlSizePass(c, origin) {
  const problems = [];
  let segCount = 0;

  try {
    for (const theme of ['light', 'dark']) {
      await goRich(c, origin, { theme });

      // Item 1.
      const sm = await sentenceMetrics(c);
      if (!sm) problems.push(`${theme}: #sentence or #phrasePlayers not found`);
      else {
        if (sm.pitch < 34 || sm.pitch > 36) problems.push(`${theme}: sentence line pitch is ${sm.pitch}px, want 34-36 (34.5 expected)`);
        if (sm.phraseH < 34 || sm.phraseH > 36) problems.push(`${theme}: #phrasePlayers hit area is ${sm.phraseH}px tall, want 34-36 (never under 34)`);
      }

      // Item 3, part 1 (#stratseg) and item 6, part 1 (the "Even out earlier
      // games" switch), both inside the Plan sheet's level-1 pane.
      await tap(c, `document.getElementById('phraseStrategy').click()`);
      const planSegs = await segMetrics(c);
      segCount += planSegs.length;
      checkSegMetrics(problems, theme, planSegs);
      const dayMetrics = await switchMetrics(c, '#planDay input[switch]');
      checkSwitchRow(problems, theme, 'Plan sheet, Even out earlier games', dayMetrics);
      await tap(c, `document.getElementById('sheetPlanClose').click()`);

      // Item 3, part 2: the four Settings segs.
      await tap(c, `document.getElementById('settingsBtn').click()`);
      const settingsSegs = await segMetrics(c);
      segCount += settingsSegs.length;
      checkSegMetrics(problems, theme, settingsSegs);
      // `#backBtn` (TODAY_HOME) always lands on Today (app.js wires it that
      // way regardless of which view it left), never back on the game
      // itself -- `.today-game` is the same second step `TOUCH_STATES` takes
      // after it whenever a state needs the game screen again.
      await tap(c, TODAY_HOME);
      await tap(c, `document.querySelector('.today-game').click()`);

      // Items 4 and 5: Format sheet.
      await tap(c, `document.getElementById('phraseFormat').click()`);
      checkStepperRows(problems, theme, 'Format sheet', await stepperMetrics(c, '#sheetFormatBody'));
      await tap(c, `document.getElementById('sheetFormatClose').click()`);

      // Items 4 and 5: Add a rule.
      await tap(c, `document.getElementById('phraseRules').click()`);
      await tap(c, `document.querySelector('#constraints .add-rule').click()`);
      checkStepperRows(problems, theme, 'Add a rule', await stepperMetrics(c, '#planKindBody'));
      await tap(c, `document.getElementById('sheetPlanClose').click()`);

      // Item 6, part 2: #showMinutes, inside #sheetCard.
      await tap(c, `document.getElementById('shareBtn').click()`);
      checkSwitchRow(problems, theme, '#sheetCard, #showMinutes', await switchMetrics(c, '#showMinutes'));
      await tap(c, `document.getElementById('sheetCardClose').click()`);
    }

    // Rule 2a: 5 segs x 2 themes = 10 measured rows expected. Fewer than that
    // means a selector stopped matching (a renamed id, a sheet that failed to
    // open) rather than every seg genuinely passing with nothing read.
    if (segCount < SEG_SELECTORS.length * 2) {
      problems.push(`only ${segCount}/${SEG_SELECTORS.length * 2} seg measurements were taken -- a seg's sheet did not open, or its selector no longer matches`);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `sentence pitch, phrase hit area, ${SEG_SELECTORS.length} seg tracks/buttons, Format and Add-a-rule `
        + `steppers, and 2 switch rows all drawn to spec, light and dark`,
  };
}
