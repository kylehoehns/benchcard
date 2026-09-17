import { evalIn, HEIGHT, WIDTH } from './dom.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './registry.mjs';
import { goRich } from './fixtures.mjs';
import { evalJSON, setGame, settle, tap } from './sheet-drive.mjs';

/* #73 item 21's "sheet spacing" row (docs/specs/73-sheet-polish.md's Proof
 * section): items 5, 7, 8 and 9 -- stepper column equality, equal row
 * padding whether a row wraps, the balance value never touching its label,
 * and every sheet's status line sitting clear of the last row with its own
 * divider and background. Runs on `RICH`, driven with real clicks; state
 * seeded through `setGame` (`sheet-drive.mjs`), never recomputed here.
 *
 * Items 5 and 8 are measured twice: once at the default 390px/16px root,
 * once at 320px/32px (`LARGE_TEXT_WIDTH`/`LARGE_TEXT_PX`, the same cell
 * `app-large-text.mjs` uses), because the spec ties both to that root. Items
 * 7 and 9 carry no width qualifier, so they run once, at the default root. */

// Long enough to wrap the Who's here row at 390px, not just at 320px: the
// spec's own examples ("Alexandria Vasquez-Delacroix") fit on one line at
// this width, so this check needs more length, not more zoom.
const LONG_NAME = 'Maximilian Alexander Featherstone-Whitmore';

// One rule short enough to read on one line, one long enough (five names)
// to wrap, and the longest balance label -- the three states items 5, 7 and
// 8 need, seeded directly rather than re-deriving the rule engine or the
// balance picker.
async function seed(c) {
  await tap(c, setGame(`const g = s.game();
    g.constraints.minMinutes = { p0: 16 };
    g.constraints.openingFive = ['p0', 'p1', 'p2', 'p3', 'p4'];
    g.balance = 'start';
    s.team().players.find(p => p.id === 'p5').name = ${JSON.stringify(LONG_NAME)};`));
}

// Every `.pstep-row`'s − left edge, + left edge, and value box edges, inside
// one container -- the geometry item 5 requires to line up row to row.
async function pstepCols(c, containerSel) {
  return evalJSON(c, `JSON.stringify([...document.querySelectorAll(${JSON.stringify(containerSel)} + ' .pstep-row')].map(r => {
    const btns = r.querySelectorAll('.pstep-btn');
    const val = r.querySelector('.pstep-val').getBoundingClientRect();
    return { minusL: btns[0].getBoundingClientRect().left, plusL: btns[1].getBoundingClientRect().left,
      valL: val.left, valR: val.right,
      minusW: btns[0].getBoundingClientRect().width, minusH: btns[0].getBoundingClientRect().height };
  }))`);
}

function colsAligned(rows) {
  return rows.every(r => Math.abs(r.minusL - rows[0].minusL) <= 0.5
    && Math.abs(r.plusL - rows[0].plusL) <= 0.5
    && Math.abs(r.valL - rows[0].valL) <= 0.5
    && Math.abs(r.valR - rows[0].valR) <= 0.5);
}

function buttonsBigEnough(rows) {
  return rows.every(r => r.minusW >= 48 && r.minusH >= 48);
}

// item 5, Format: Periods and Minutes each are both on screen at once.
async function checkFormatColumns(c, ck, where) {
  await tap(c, `document.getElementById('phraseFormat').click()`);
  const rows = await pstepCols(c, '#sheetFormatBody');
  if (ck(rows.length === 2, `${where}: #sheetFormatBody has ${rows.length} stepper row(s), want 2`)) {
    ck(colsAligned(rows), `${where}: Format's stepper columns do not line up: ${JSON.stringify(rows)}`);
    ck(buttonsBigEnough(rows), `${where}: a Format stepper button is under 48×48: ${JSON.stringify(rows)}`);
  }
  await tap(c, `document.getElementById('sheetFormatClose').click()`);
}

// item 5, Add a rule: one row at a time ("Minutes" for a minimum/cap rule,
// "Stints in a row" for a rest-limit rule) -- the two states are measured
// separately and compared to each other, since both are never on screen
// together the way Format's two rows are.
async function checkAddRuleColumns(c, ck, where) {
  await tap(c, `document.getElementById('phraseRules').click()`);
  await tap(c, `document.querySelector('#constraints .add-rule').click()`);
  const minuteRows = await pstepCols(c, '#planKindBody');
  ck(minuteRows.length === 1, `${where}: Add a rule's "Minutes" kind shows ${minuteRows.length} stepper row(s), want 1`);
  await tap(c, `[...document.querySelectorAll('#planSub .plan-kinds .chip')]
    .find(b => b.textContent.trim() === 'Rest limit').click()`);
  const restRows = await pstepCols(c, '#planKindBody');
  ck(restRows.length === 1, `${where}: Add a rule's "Rest limit" kind shows ${restRows.length} stepper row(s), want 1`);
  if (minuteRows.length === 1 && restRows.length === 1) {
    const both = [minuteRows[0], restRows[0]];
    ck(colsAligned(both), `${where}: Add a rule's stepper column moves between kinds: ${JSON.stringify(both)}`);
    ck(buttonsBigEnough(both), `${where}: an Add-a-rule stepper button is under 48×48: ${JSON.stringify(both)}`);
  }
  await tap(c, `document.getElementById('sheetPlanClose').click()`);
}

// item 7: a one-line rule row and a wrapped one read the same top/bottom
// padding and at least a 1.3 line height, and the wrapped row's chevron is
// still centered on its own (taller) box.
async function checkRowPadding(c, ck, where) {
  await tap(c, `document.getElementById('phraseRules').click()`);
  const rows = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('#constraints .prow:not(.add-rule)')].map(r => {
    const cs = getComputedStyle(r);
    const rect = r.getBoundingClientRect();
    const chev = r.querySelector('.prow-chev').getBoundingClientRect();
    return { h: rect.height, top: rect.top, bottom: rect.bottom,
      padTop: parseFloat(cs.paddingTop), padBottom: parseFloat(cs.paddingBottom),
      lineHeight: parseFloat(cs.lineHeight), fontSize: parseFloat(cs.fontSize),
      chevMid: (chev.top + chev.bottom) / 2, text: r.querySelector('.prow-t').textContent };
  }))`);
  if (!ck(rows.length >= 2, `${where}: #constraints has ${rows.length} rule row(s), want >= 2 (one short, one wrapped)`)) {
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    return;
  }
  const oneLine = rows[0], wrapped = rows[rows.length - 1];
  ck(wrapped.h > oneLine.h + 5,
    `${where}: "${wrapped.text}" is ${Math.round(wrapped.h)}px tall, no taller than the one-line row's ${Math.round(oneLine.h)}px -- did it wrap?`);
  ck(Math.abs(wrapped.padTop - oneLine.padTop) <= 0.5 && Math.abs(wrapped.padBottom - oneLine.padBottom) <= 0.5,
    `${where}: wrapped row padding ${wrapped.padTop}/${wrapped.padBottom}px vs one-line ${oneLine.padTop}/${oneLine.padBottom}px, want equal`);
  ck(oneLine.padTop >= 8 && oneLine.padBottom >= 8,
    `${where}: row padding is ${oneLine.padTop}/${oneLine.padBottom}px, want >= 8px top and bottom`);
  ck(oneLine.lineHeight / oneLine.fontSize >= 1.3,
    `${where}: line height is ${(oneLine.lineHeight / oneLine.fontSize).toFixed(2)}x font size, want >= 1.3`);
  ck(Math.abs(wrapped.chevMid - (wrapped.top + wrapped.bottom) / 2) <= 1,
    `${where}: the wrapped row's chevron sits at y ${Math.round(wrapped.chevMid)}, row center is ${Math.round((wrapped.top + wrapped.bottom) / 2)}, want centered`);
  await tap(c, `document.getElementById('sheetPlanClose').click()`);
}

// item 7, Who's here: a long player name wraps instead of losing its end to
// an ellipsis.
async function checkWhoWrap(c, ck, where) {
  await tap(c, `document.getElementById('phrasePlayers').click()`);
  const r = await evalJSON(c, `(() => {
    const rows = [...document.querySelectorAll('#sheetWhoBody .sheetrow')];
    const row = rows.find(x => x.querySelector('.sheetrow-t')?.textContent === ${JSON.stringify(LONG_NAME)});
    if (!row) return 'null';
    const t = row.querySelector('.sheetrow-t');
    const cs = getComputedStyle(t);
    return JSON.stringify({ h: row.getBoundingClientRect().height, whiteSpace: cs.whiteSpace, textOverflow: cs.textOverflow });
  })()`);
  if (ck(!!r, `${where}: no Who's here row reads "${LONG_NAME}" -- the name seed did not land`)) {
    ck(r.whiteSpace === 'normal', `${where}: .sheetrow-t white-space is "${r.whiteSpace}", want "normal" so a long name wraps`);
    ck(r.textOverflow !== 'ellipsis', `${where}: .sheetrow-t text-overflow is "${r.textOverflow}", want it not to ellipsize`);
    ck(r.h > 55, `${where}: "${LONG_NAME}"'s row is ${Math.round(r.h)}px tall, want > 55px -- evidence it wrapped to a second line`);
  }
  await tap(c, `document.getElementById('sheetWhoClose').click()`);
}

// item 8: the Lineup balance value ("Start strong", the longest label) is
// either on its own line below the label or at least 8px clear of it.
async function checkLineupGap(c, ck, where) {
  await tap(c, `document.getElementById('phraseStrategy').click()`);
  const r = await evalJSON(c, `(() => {
    const row = document.querySelector('#planLineups .prow');
    const t = row.querySelector('.prow-t').getBoundingClientRect();
    const v = row.querySelector('.prow-v').getBoundingClientRect();
    return JSON.stringify({ tRight: t.right, tBottom: t.bottom, vLeft: v.left, vTop: v.top, text: row.querySelector('.prow-v').textContent });
  })()`);
  const gap = r.vLeft - r.tRight;
  const wrapped = r.vTop >= r.tBottom - 1;
  ck(wrapped || gap >= 8,
    `${where}: Lineup balance's value ("${r.text}") sits ${Math.round(gap)}px from its label, want >= 8px (or wrapped to its own line)`);
  await tap(c, `document.getElementById('sheetPlanClose').click()`);
}

// item 9: whichever sheet is open, scrolled all the way down, the deepest
// visible descendant's bottom edge stays >= 12px clear of the status line's
// top, and the status line carries a real 1px top divider and an opaque
// background. Generic across every sheet's own markup rather than reading
// one sheet's row shape, since the same claim covers all five.
async function checkStatusGap(c, ck, where, bodySel, statusSel) {
  await evalIn(c, `(() => { document.querySelector(${JSON.stringify(bodySel)}).scrollTop = 1e6; return 1; })()`);
  await settle(c);
  const r = await evalJSON(c, `(() => {
    const body = document.querySelector(${JSON.stringify(bodySel)});
    const status = document.querySelector(${JSON.stringify(statusSel)});
    if (!body || !status) return 'null';
    let lastBottom = -Infinity;
    for (const el of body.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.bottom > lastBottom) lastBottom = rect.bottom;
    }
    const sr = status.getBoundingClientRect();
    const cs = getComputedStyle(status);
    return JSON.stringify({ lastBottom, statusTop: sr.top,
      borderTopWidth: parseFloat(cs.borderTopWidth), bg: cs.backgroundColor });
  })()`);
  if (!ck(!!r, `${where}: could not measure ${bodySel}/${statusSel} -- is the sheet open?`)) return;
  const gap = r.statusTop - r.lastBottom;
  ck(gap >= 12, `${where}: the last row's bottom sits ${Math.round(gap)}px above ${statusSel}, want >= 12px`);
  ck(r.borderTopWidth >= 0.5, `${where}: ${statusSel}'s top border is ${r.borderTopWidth}px, want a visible divider`);
  ck(r.bg !== 'rgba(0, 0, 0, 0)' && r.bg !== 'transparent', `${where}: ${statusSel}'s background is "${r.bg}", want an opaque background`);
}

export async function sheetSpacingPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    await seed(c);

    /* ---- 390px, the default 16px root ---- */
    await checkFormatColumns(c, ck, '390px');
    await tap(c, `document.getElementById('phraseFormat').click()`);
    await checkStatusGap(c, ck, "390px, Format", '#sheetFormatBody', '#sheetFormatStatus');
    await tap(c, `document.getElementById('sheetFormatClose').click()`);

    await checkAddRuleColumns(c, ck, '390px');
    await tap(c, `document.getElementById('phraseRules').click()`);
    await tap(c, `document.querySelector('#constraints .add-rule').click()`);
    await checkStatusGap(c, ck, "390px, Add a rule", '#sheetPlanBody', '#sheetPlanStatus');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    await checkRowPadding(c, ck, '390px');
    await tap(c, `document.getElementById('phraseStrategy').click()`);
    await checkStatusGap(c, ck, "390px, Plan level 1", '#sheetPlanBody', '#sheetPlanStatus');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);

    await checkWhoWrap(c, ck, '390px');
    await tap(c, `document.getElementById('phrasePlayers').click()`);
    await checkStatusGap(c, ck, "390px, Who's here", '#sheetWhoBody', '#sheetWhoStatus');
    await tap(c, `document.getElementById('sheetWhoClose').click()`);

    await tap(c, `document.getElementById('phraseInterval').click()`);
    await checkStatusGap(c, ck, "390px, Sub interval", '#sheetIntervalBody', '#sheetIntervalStatus');
    await tap(c, `document.getElementById('sheetIntervalClose').click()`);

    /* ---- 320px, a 32px root: items 5 and 8, the two the spec ties to it ---- */
    await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
    try {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
      await goRich(c, origin);
      await seed(c);

      await checkFormatColumns(c, ck, '320px/32px');
      await checkAddRuleColumns(c, ck, '320px/32px');
      await checkLineupGap(c, ck, '320px/32px');
    } finally {
      await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  return {
    name: nameOf('sheetspacing'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'stepper columns line up at 390px and 320px/32px, rows keep their padding whether '
        + 'they wrap, the balance value clears its label, and every status line sits clear '
        + 'of the last row with its own divider and background',
  };
}
