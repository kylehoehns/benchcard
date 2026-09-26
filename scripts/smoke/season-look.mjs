/* #144's own guard (docs/specs/144-season-lists.md's Proof section, "New
 * smoke check"): reads computed sizes, colors, radii, borders and text for
 * items 1-6 and the 320px/32px clip check of item 8, against the RICH
 * fixture, light and dark. `test/season-view.test.js` and
 * `test/day-games-text.test.js` pin the pure logic underneath this (the
 * ledger's own order, `offNote`'s words, `dayGamesText`'s join); this file is
 * the CASCADE and the rendered DOM, which only a real browser can answer.
 *
 * `season.mjs` (the older #30 guard) already reads the ledger's order, a
 * filed game's rows and Delete, and the day chart's presence/legend count --
 * nothing here repeats those; this file is the prototype's LOOK only.
 *
 * FIX PASS (post-merge): four defects the first pass let through, found by
 * comparing `compare-shots.mjs`'s own season screenshots against
 * `notes/mockups/prototype/light-season.png` pixel for pixel --
 *   1. `h2.sn-h` and the day subheaders sat 16px past `#dayhint` and the
 *      title's own left edge (two edges on one page).
 *   2. One `.pgrp` per filed day drew a separate card per game, the exact
 *      thing #144 asked to remove.
 *   3. "Across the day"'s minutes were bold ink; "Minutes so far"'s were
 *      muted -- two list styles on a ticket titled "one list style".
 * Each of those three gets its own read below, named for the defect rather
 * than folded into the item-1/3 blocks above them, since that is what let a
 * broken tree read green the first time. */
import { setWidth, TODAY_HOME, WIDTH, OVERFLOW_PROBE, WORD_FLOOR_FN } from './dom.mjs';
import { evalJSON, tap } from './sheet-drive.mjs';
import { goRich, reloadWithRecord, RICH } from './fixtures.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';

const OPEN_SEASON = `document.querySelector('#todaySeason').click()`;

/* The Range-based left-edge reader both page-side scripts below need (a div
   whose text is a bare text node has no child element, so its own
   border-box left edge does not move when only its padding-left changes --
   see the comment at its first use). One source string, interpolated into
   both `READ_SEASON_LOOK` and `READ_FIVE_GAMES`, so the two copies cannot
   drift the way a hand-typed second copy already had. */
const TEXT_LEFT_FN = `const textLeft = el => {
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = range.getClientRects();
    return rects.length ? rects[0].left : el.getBoundingClientRect().left;
  };`;

/* Item 2: the Minutes so far row, at the prototype's own sizes. Read from a
   live row rather than from the CSS source -- a source regex cannot tell a
   rule that applies from one that is overridden, or a computed 30px from a
   30px that only ever appears in a comment. Items 1, 3, 5 and 6 read off the
   same page load, and item 4's basic wiring reads off "Across the day" on
   RICH's own two-game day -- one page, one settle, everything items 1-6 need
   that RICH already renders without building a second record for it. */
const READ_SEASON_LOOK = `JSON.stringify((() => {
  const rows = [...document.querySelectorAll('#seasonbox .sn-row')];
  const r = rows[0];
  const rect = el => el ? el.getBoundingClientRect() : null;
  const cs = el => el ? getComputedStyle(el) : null;
  const nm = r && r.querySelector('.sn-nm');
  const nmCs = cs(nm);
  const track = r && r.querySelector('.sn-track');
  const trackCs = cs(track);
  // item 2: the track is var(--track) itself, not a hand-typed hex --
  // read off a probe painted with the token (the same pattern
  // game-passes.mjs's checkRotation uses for the same token), so a change to
  // the token's own value in tokens.css does not need a second edit here.
  const trackProbe = document.createElement('div');
  trackProbe.style.cssText = 'position:fixed;left:0;top:99999px;width:9px;height:9px;background:var(--track);';
  document.body.appendChild(trackProbe);
  const trackTokenColor = getComputedStyle(trackProbe).backgroundColor;
  trackProbe.remove();
  const fill = r && r.querySelector('.sn-fill');
  const fillCs = cs(fill);
  const min = r && r.querySelector('.sn-min');
  const minCs = cs(min);
  const rCs = cs(r);

  // item 1: section headers and #dayhint share the title's own left edge.
  // look-defect fix pass: a day subheader's TEXT lines up with a filed
  // game's own text instead -- read with a Range rather than
  // getBoundingClientRect() on the subheader div itself, because that div
  // has no child element (its text is a bare text node) and its own
  // border-box left edge does not move when only its padding-left changes;
  // a Range on its contents measures the glyphs, not the box.
  ${TEXT_LEFT_FN}
  const titleLeft = document.querySelector('.season-h1')?.getBoundingClientRect().left ?? null;
  const snH = [...document.querySelectorAll('#view-season .sn-h')];
  const snDays = [...document.querySelectorAll('#seasonFiled .sn-day')];
  const dayhintEl = document.querySelector('#dayhint');
  const firstGameTitle = document.querySelector('#seasonFiled .sn-game .sn-gt');

  // item 1 (fix pass): the gap from a group's own bottom to the NEXT section
  // header is the same for both groups that have one above them -- "Minutes
  // so far" -> "Across the day" and "Across the day"/its chart -> "Filed
  // games". The gap before "Minutes so far" itself (the layout's model) is
  // not re-measured here: nothing sits between it and the page's own title
  // block for this check to compare it against.
  const minPgrpBottom = document.querySelector('#seasonbox .pgrp')?.getBoundingClientRect().bottom ?? null;
  const dayH2Top = document.querySelector('#daySection .sn-h')?.getBoundingClientRect().top ?? null;
  const dayTotalsBottom = document.querySelector('#daytotals')?.getBoundingClientRect().bottom ?? null;
  const filedH2Top = document.querySelector('#seasonFiled .sn-h')?.getBoundingClientRect().top ?? null;

  // item 2 (fix pass): Filed games is ONE .pgrp, not one per day. A game's
  // own "Remove" button sits in its own nested .pgrp (#141) inside the
  // opened <details>, which this must not count as a second top-level card.
  const filedPgrps = [...document.querySelectorAll('#seasonFiled .pgrp')];
  const topFiledPgrps = filedPgrps.filter(p => !p.parentElement.closest('#seasonFiled .pgrp'));
  const filedGames = [...document.querySelectorAll('#seasonFiled .sn-game')];
  const allGamesInsideTopPgrp = topFiledPgrps.length === 1
    && filedGames.every(g => g.closest('.pgrp') === topFiledPgrps[0]);

  // item 3 (fix pass): "Across the day"'s own numbers/names against
  // "Minutes so far"'s -- one list style, not two.
  const dayRow = document.querySelector('#daytotals .dayrow');
  const dayV = dayRow && dayRow.querySelector('.v');
  const dayVCs = cs(dayV);
  const dayNmForStyle = dayRow && dayRow.querySelector('.nm');
  const dayNmForStyleCs = cs(dayNmForStyle);

  // item 3: the hidden "N games (behind/ahead)" line.
  const hidden = r && r.querySelector('.sr-only');
  const hiddenCs = cs(hidden);
  const visibleX = document.querySelector('#seasonbox .sn-x');
  // fix pass: the spec's own item-3 illustration reads "Nia, 12.5 minutes,
  // 2 games, 16 behind" -- the minutes value before the hidden note, not
  // after -- so a screen reader's linear order has to put .sn-min ahead of
  // the hidden text, not the other way around.
  const minBeforeHidden = (min && hidden)
    ? !!(min.compareDocumentPosition(hidden) & Node.DOCUMENT_POSITION_FOLLOWING) : null;

  // item 4 (basic wiring -- the 5-game/320px case is a second pass below).
  const dayNm = dayRow && dayRow.querySelector('.nm span:last-child');
  const dayNmCs = cs(dayNm);
  const dayHidden = dayRow && dayRow.querySelector('.sr-only');
  // fix pass: same reading-order question as .sn-row above, for "Across the
  // day"'s own total (.v) against its per-game hidden text.
  const dayVBeforeHidden = (dayV && dayHidden)
    ? !!(dayV.compareDocumentPosition(dayHidden) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
  const legendI = document.querySelector('.legend i');
  const legendCs = cs(legendI);
  const hintCs = cs(document.querySelector('#dayhint'));
  const dayHeadCs = cs(document.querySelector('#seasonFiled .sn-day'));

  // item 5: the shared chevron, and no card of a filed game's own.
  const game = document.querySelector('#seasonFiled .sn-game');
  const chev = game && game.querySelector('.prow-chev');
  const gameCs = cs(game);
  const gameAfter = game ? getComputedStyle(game, '::after').content : null;

  // item 6: no uppercase, no positive letter-spacing, anywhere on the screen.
  let badCase = null, badTrack = null;
  for (const el of document.querySelectorAll('#view-season *')) {
    const s = getComputedStyle(el);
    if (!badCase && s.textTransform === 'uppercase') {
      badCase = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/)[0] : '');
    }
    const ls = parseFloat(s.letterSpacing);
    if (!badTrack && !Number.isNaN(ls) && ls > 0) {
      badTrack = el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/)[0] : '');
    }
  }

  return {
    rowHeight: rect(r) ? rect(r).height : null,
    name: nm ? nm.textContent : null,
    nameFontSize: nmCs ? nmCs.fontSize : null,
    nameFontWeight: nmCs ? nmCs.fontWeight : null,
    nameWhiteSpace: nmCs ? nmCs.whiteSpace : null,
    nameOverflow: nmCs ? nmCs.textOverflow : null,
    trackHeight: track ? track.getBoundingClientRect().height : null,
    trackRadius: trackCs ? trackCs.borderRadius : null,
    trackColor: trackCs ? trackCs.backgroundColor : null,
    trackTokenColor,
    fillBg: fillCs ? fillCs.backgroundColor : null,
    minFontSize: minCs ? minCs.fontSize : null,
    minFontWeight: minCs ? minCs.fontWeight : null,
    minTextAlign: minCs ? minCs.textAlign : null,
    minVariant: minCs ? minCs.fontVariantNumeric : null,
    minColor: minCs ? minCs.color : null,
    rowBorderBottom: rCs ? rCs.borderBottomWidth : null,
    rowBoxShadow: rCs ? rCs.boxShadow : null,

    titleLeft,
    snHLefts: snH.map(h => h.getBoundingClientRect().left),
    snDayLefts: snDays.map(textLeft),
    dayhintLeft: dayhintEl ? dayhintEl.getBoundingClientRect().left : null,
    firstGameTitleLeft: firstGameTitle ? textLeft(firstGameTitle) : null,

    gapBeforeAcrossDay: (dayH2Top != null && minPgrpBottom != null) ? dayH2Top - minPgrpBottom : null,
    gapBeforeFiledGames: (filedH2Top != null && dayTotalsBottom != null) ? filedH2Top - dayTotalsBottom : null,

    topFiledPgrpCount: topFiledPgrps.length,
    allGamesInsideTopPgrp,

    dayVFontSize: dayVCs ? dayVCs.fontSize : null,
    dayVFontWeight: dayVCs ? dayVCs.fontWeight : null,
    dayVColor: dayVCs ? dayVCs.color : null,
    dayVVariant: dayVCs ? dayVCs.fontVariantNumeric : null,
    dayNmStyleFontSize: dayNmForStyleCs ? dayNmForStyleCs.fontSize : null,
    dayNmStyleFontWeight: dayNmForStyleCs ? dayNmForStyleCs.fontWeight : null,

    hiddenText: hidden ? hidden.textContent : null,
    hiddenPosition: hiddenCs ? hiddenCs.position : null,
    hiddenWidth: hiddenCs ? hiddenCs.width : null,
    visibleXPresent: !!visibleX,
    minBeforeHidden,

    dayName: dayNm ? dayNm.textContent : null,
    dayNameTransform: dayNmCs ? dayNmCs.textTransform : null,
    dayHiddenText: dayHidden ? dayHidden.textContent : null,
    dayVBeforeHidden,
    legendRadius: legendCs ? legendCs.borderRadius : null,
    legendWidth: legendCs ? legendCs.width : null,
    hintFontSize: hintCs ? hintCs.fontSize : null,
    hintColor: hintCs ? hintCs.color : null,
    dayHeadFontSize: dayHeadCs ? dayHeadCs.fontSize : null,
    dayHeadColor: dayHeadCs ? dayHeadCs.color : null,

    chevPresent: !!chev,
    gameBg: gameCs ? gameCs.backgroundColor : null,
    gameAfterContent: gameAfter,

    badCase, badTrack,
  };
})())`;

export async function seasonLookPass(c, origin) {
  const problems = [];
  let measured = 0;

  try {
   for (const theme of ['light', 'dark']) {
    const before = problems.length;
    await goRich(c, origin, { theme });
    await tap(c, TODAY_HOME);
    await tap(c, OPEN_SEASON);

    const row = await evalJSON(c, READ_SEASON_LOOK);
    if (row.rowHeight == null) {
      problems.push('no ".sn-row" found under #seasonbox -- nothing to measure');
    } else {
      measured++;
      // item 2
      if (Math.abs(row.rowHeight - 30) > 2) {
        problems.push(`Minutes so far row is ${row.rowHeight.toFixed(1)}px tall, want 30px ±2px`);
      }
      if (row.nameFontSize !== '14px') {
        problems.push(`row name font-size is ${row.nameFontSize}, want 14px (--fs-secondary)`);
      }
      const nameWeight = parseInt(row.nameFontWeight, 10);
      if (!(nameWeight >= 400 && nameWeight <= 500)) {
        problems.push(`row name font-weight is ${row.nameFontWeight}, want 400-500`);
      }
      if (row.nameWhiteSpace !== 'nowrap' || row.nameOverflow !== 'ellipsis') {
        problems.push(`row name is not a one-line ellipsis (white-space ${row.nameWhiteSpace}, text-overflow ${row.nameOverflow})`);
      }
      if (Math.abs(row.trackHeight - 8) > 1) {
        problems.push(`bar track is ${row.trackHeight}px tall, want 8px`);
      }
      if (row.trackRadius !== '999px' && !/^\d+px$/.test(row.trackRadius || '')) {
        problems.push(`bar track radius is ${row.trackRadius}, want var(--r-full) (999px)`);
      } else if (parseFloat(row.trackRadius) < 100) {
        problems.push(`bar track radius is ${row.trackRadius}, want var(--r-full) (999px), not a small radius`);
      }
      if (row.trackColor !== row.trackTokenColor) {
        problems.push(`bar track color is ${row.trackColor}, want var(--track) (${row.trackTokenColor})`);
      }
      if (row.minFontSize !== '13px') {
        problems.push(`minutes text font-size is ${row.minFontSize}, want 13px (--fs-footnote)`);
      }
      if (parseInt(row.minFontWeight, 10) !== 400) {
        problems.push(`minutes text font-weight is ${row.minFontWeight}, want 400`);
      }
      if (row.minTextAlign !== 'right') {
        problems.push(`minutes text is not right-aligned (text-align: ${row.minTextAlign})`);
      }
      if (!/tabular/.test(row.minVariant || '')) {
        problems.push(`minutes text is not tabular numerals (font-variant-numeric: ${row.minVariant})`);
      }
      if (parseFloat(row.rowBorderBottom) > 0 || (row.rowBoxShadow && row.rowBoxShadow !== 'none')) {
        problems.push(`Minutes so far row carries a divider (border-bottom ${row.rowBorderBottom}, box-shadow ${row.rowBoxShadow})`);
      }

      // item 1 (fix pass): section headers and #dayhint share the title's
      // own left edge, ±1px.
      const titleEdges = { 'the title': row.titleLeft, '#dayhint': row.dayhintLeft,
        ...Object.fromEntries(row.snHLefts.map((v, i) => [`sn-h[${i}]`, v])) };
      if (row.titleLeft != null) {
        for (const [name, left] of Object.entries(titleEdges)) {
          if (left != null && Math.abs(left - row.titleLeft) > 1) {
            problems.push(`${name}'s left edge is ${left}px, the title's is ${row.titleLeft}px -- not the one shared edge`);
          }
        }
      }
      // look-defect fix pass: a day subheader inside Filed games lines up
      // with the GROUP's own rows -- the same left edge as the first
      // `.sn-game`'s text in that card, like a `.pgrp-h` lines up with its
      // group's rows elsewhere (Team, Settings) -- not the title's edge one
      // step further out, which read as the subheader's text sitting flush
      // against the card's own left edge with no padding.
      if (row.firstGameTitleLeft != null) {
        row.snDayLefts.forEach((left, i) => {
          if (Math.abs(left - row.firstGameTitleLeft) > 1) {
            problems.push(`sn-day[${i}]'s left edge is ${left}px, the first filed game's text is at `
              + `${row.firstGameTitleLeft}px -- not level with its own group's rows`);
          }
        });
      }
      // item 1 (fix pass): the gap from a group's bottom to the NEXT section
      // header is the same for both groups that have one, ±2px.
      if (row.gapBeforeAcrossDay != null && row.gapBeforeFiledGames != null) {
        const gapSpread = Math.abs(row.gapBeforeAcrossDay - row.gapBeforeFiledGames);
        if (gapSpread > 2) {
          problems.push(`the gap before "Across the day" (${row.gapBeforeAcrossDay.toFixed(1)}px) and before `
            + `"Filed games" (${row.gapBeforeFiledGames.toFixed(1)}px) do not match`);
        }
      }

      // item 2 (fix pass): Filed games is one card, not one per game/day.
      if (row.topFiledPgrpCount !== 1) {
        problems.push(`#seasonFiled holds ${row.topFiledPgrpCount} top-level .pgrp groups, want exactly 1`);
      }
      if (!row.allGamesInsideTopPgrp) {
        problems.push('not every filed game row sits inside the one shared .pgrp');
      }

      // item 3 (fix pass): Across the day's numbers/names match Minutes so
      // far's -- one list style.
      if (row.dayVFontSize !== '13px') {
        problems.push(`"Across the day" minutes are ${row.dayVFontSize}, want 13px (--fs-footnote), same as Minutes so far's`);
      }
      if (parseInt(row.dayVFontWeight, 10) !== 400) {
        problems.push(`"Across the day" minutes are weight ${row.dayVFontWeight}, want 400, same as Minutes so far's`);
      }
      if (row.minColor != null && row.dayVColor !== row.minColor) {
        problems.push(`"Across the day" minutes are ${row.dayVColor}, Minutes so far's are ${row.minColor} -- two list styles`);
      }
      if (!/tabular/.test(row.dayVVariant || '')) {
        problems.push(`"Across the day" minutes are not tabular numerals (font-variant-numeric: ${row.dayVVariant})`);
      }
      if (row.dayNmStyleFontSize !== row.nameFontSize) {
        problems.push(`"Across the day" names are ${row.dayNmStyleFontSize}, Minutes so far's are ${row.nameFontSize}`);
      }
      if (row.dayNmStyleFontWeight !== row.nameFontWeight) {
        problems.push(`"Across the day" names are weight ${row.dayNmStyleFontWeight}, Minutes so far's are weight ${row.nameFontWeight}`);
      }

      // item 3: the "N games (behind/ahead)" line is hidden, not gone.
      if (!row.hiddenText || !/game/.test(row.hiddenText)) {
        problems.push(`the ledger row's hidden text is "${row.hiddenText}", want the "N games ..." line offNote/totals build`);
      }
      if (row.hiddenPosition !== 'absolute' || row.hiddenWidth !== '1px') {
        problems.push(`the ledger row's hidden text is not visually hidden (position ${row.hiddenPosition}, width ${row.hiddenWidth})`);
      }
      if (row.visibleXPresent) {
        problems.push('the ledger still shows a visible ".sn-x" subline -- item 3 wants it hidden, not repainted');
      }
      if (row.minBeforeHidden === false) {
        problems.push('the ledger row\'s hidden "N games" text sits before .sn-min in DOM order -- a screen reader '
          + 'reads name, N games, behind, minutes, not name, minutes, N games, behind (spec item 3)');
      }

      // item 4 (basic wiring; the 5-game/320px case is checked separately).
      if (!row.dayName) {
        problems.push('no "Across the day" row name found -- nothing to check for a call name');
      } else {
        if (row.dayName === row.dayName.toUpperCase() && /[a-z]/i.test(row.dayName)) {
          problems.push(`"Across the day" row name is "${row.dayName}", reads as an uppercase card name, not a call name`);
        }
        if (row.dayNameTransform === 'uppercase') {
          problems.push(`"Across the day" row name computes text-transform: uppercase`);
        }
      }
      if (!row.dayHiddenText || !row.dayHiddenText.includes(':')) {
        problems.push(`"Across the day" row has no per-game hidden text (got "${row.dayHiddenText}")`);
      }
      if (row.dayVBeforeHidden === false) {
        problems.push('"Across the day" row\'s hidden per-game text sits before its .v total in DOM order -- '
          + 'a screen reader reads the per-game breakdown before the total minutes');
      }
      if (parseFloat(row.legendRadius) * 2 < parseFloat(row.legendWidth) - 0.5) {
        problems.push(`legend swatch border-radius (${row.legendRadius}) is less than half its width (${row.legendWidth}) -- not round`);
      }
      if (row.hintFontSize !== row.dayHeadFontSize || row.hintColor !== row.dayHeadColor) {
        problems.push(`#dayhint (${row.hintFontSize}/${row.hintColor}) does not match the muted footnote voice `
          + `.sn-day already uses (${row.dayHeadFontSize}/${row.dayHeadColor})`);
      }

      // item 5: the shared chevron, no hand-drawn arrow, no card of its own.
      if (!row.chevPresent) {
        problems.push('a filed game row has no ".prow-chev" -- the shared chevron is missing');
      }
      if (row.gameAfterContent && row.gameAfterContent !== 'none' && row.gameAfterContent !== '""') {
        problems.push(`a filed game row still paints its own ::after arrow (content: ${row.gameAfterContent})`);
      }
      if (row.gameBg && !/rgba\(0, ?0, ?0, ?0\)|transparent/.test(row.gameBg)) {
        problems.push(`a filed game row paints its own background (${row.gameBg}) -- item 1 wants no card of its own`);
      }

      // item 6: no uppercase, no positive tracking, anywhere in #view-season.
      if (row.badCase) problems.push(`${row.badCase} computes text-transform: uppercase in #view-season`);
      if (row.badTrack) problems.push(`${row.badTrack} computes a positive letter-spacing in #view-season`);
    }
    for (let i = before; i < problems.length; i++) problems[i] = `${theme}: ${problems[i]}`;
   }

    if (measured === 0 && problems.length === 0) {
      problems.push('no row was measured in any pass -- a broken probe, not a pass');
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await setWidth(c, WIDTH);
    await goRich(c, origin);
  }

  const five = await seasonFiveGamesPass(c, origin);
  if (!five.pass) problems.push(...five.problems);

  const long = await seasonLongNamePass(c, origin);
  if (!long.pass) problems.push(...long.problems);

  const squeeze = await seasonFiledSqueezePass(c, origin);
  if (!squeeze.pass) problems.push(...squeeze.problems);

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `Minutes so far row: 30px tall, 14px/400-500 ellipsis call name, 8px --r-full/--track bar, 13px muted tabular minutes, `
        + `no divider; one shared left edge; Filed games is one card; Across the day matches Minutes so far's numbers; `
        + `the "N games" line is hidden not gone; Across the day uses call names and round dots; filed games use the `
        + `shared chevron; no uppercase or tracked-out text; ${five.detail}; ${long.detail}; ${squeeze.detail}`,
  };
}

/* Item 4's own five-game case, plus item 8's clip check at the same state:
   "with 5 games in the day, every row's text names all 5 games and nothing
   clips at 320px" and "a long call name ... does not push the minutes off
   the row". `FOUR` (fixtures.mjs) is the app's own precedent for a record
   built to hold more games than RICH's day carries -- built the same way,
   for the one case here rather than added to that shared fixture, since
   nothing else needs a five-game day. */
const FIVE_GAMES = (() => {
  const record = JSON.parse(JSON.stringify(RICH));
  const team = record.teams[0];
  team.days[0].games = [
    { id: 'g0', label: 'Hawks', tipoff: '09:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1 },
    { id: 'g1', label: 'Ravens', tipoff: '10:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 2 },
    { id: 'g2', label: '', tipoff: '11:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 3 },
    { id: 'g3', label: 'Owls', tipoff: '12:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 4 },
    { id: 'g4', label: '', tipoff: '13:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 5 },
  ];
  team.activeGame = 0;
  record.view = 'today';
  return record;
})();

const READ_FIVE_GAMES = `JSON.stringify((() => {
  const hint = document.querySelector('#dayhint')?.textContent || null;
  const rows = [...document.querySelectorAll('#daytotals .dayrow')].map(r => ({
    name: r.querySelector('.nm span:last-child')?.textContent || null,
    hidden: r.querySelector('.sr-only')?.textContent || null,
  }));
  // look-defect fix pass, at 320px/32px: the same day-subheader/group-row
  // edge check the main light/dark pass makes at 390px, against RICH's own
  // filed days (this record's season data is RICH's, untouched). A Range
  // measures the subheader's TEXT, not its div's own border-box (which does
  // not move when only its padding-left changes -- the shared TEXT_LEFT_FN
  // source string above, interpolated here since this string is evaluated on
  // its own).
  ${TEXT_LEFT_FN}
  const snDayLefts = [...document.querySelectorAll('#seasonFiled .sn-day')].map(textLeft);
  const firstGameTitleLeft = textLeft(document.querySelector('#seasonFiled .sn-game .sn-gt'));
  return { hint, rows, snDayLefts, firstGameTitleLeft };
})())`;

async function seasonFiveGamesPass(c, origin) {
  const problems = [];
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await setWidth(c, LARGE_TEXT_WIDTH);
    await reloadWithRecord(c, origin, FIVE_GAMES);
    await tap(c, OPEN_SEASON);

    const data = await evalJSON(c, READ_FIVE_GAMES);
    if (!data.rows.length) {
      problems.push('no ".dayrow" rows under #daytotals with 5 games seeded -- nothing to measure');
    } else {
      if (data.hint !== '5 games') problems.push(`#dayhint reads "${data.hint}", want "5 games"`);
      for (const r of data.rows) {
        const names = (r.hidden ? r.hidden.match(/:/g) || [] : []).length;
        if (names !== 5) {
          problems.push(`${r.name || '(unnamed row)'}'s hidden per-game text names ${names} game(s) at 320px, want 5 (got "${r.hidden}")`);
        }
      }
      if (data.firstGameTitleLeft != null) {
        data.snDayLefts.forEach((left, i) => {
          if (Math.abs(left - data.firstGameTitleLeft) > 1) {
            problems.push(`at 320px/32px: sn-day[${i}]'s left edge is ${left}px, the first filed game's text is at `
              + `${data.firstGameTitleLeft}px -- not level with its own group's rows`);
          }
        });
      }
    }
    const o = await evalJSON(c, OVERFLOW_PROBE);
    if (o.pans) problems.push('Season pans sideways with 5 games in the day at 320px/32px text');
    if (o.worst) problems.push(`at 320px/32px with 5 games: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await setWidth(c, WIDTH);
    await goRich(c, origin);
  }
  return {
    pass: problems.length === 0,
    problems,
    detail: problems.length ? '' : '5 games at 320px/32px: every row names all 5, no page pan, nothing off-viewport',
  };
}

/* Item 5 (fix pass): a genuinely long call name -- not the fixture's
   existing `LONG_NAME` (a two-word roster name whose CALL name,
   "Maximilian", is unremarkable at the ledger's 9rem name column).
   `callNames` (roster.js) takes a player's first name verbatim when it is
   unique on the roster, so the CALL name is that first word alone -- a
   two-word rename would just grow a short last-initial suffix, not the long
   single name the column actually has to ellipsize. A hyphenated given name
   is one word to `callNames`' own splitter and long enough (20 characters)
   to overflow the column at both text sizes. Built the same way `FIVE_GAMES`
   above is: a clone of RICH with one field changed, not a second fixture. */
const LONG_CALL_NAME = 'Persephone-Anastasia Featherstonehaugh';
const LONG_FIRST_NAME = LONG_CALL_NAME.split(' ')[0];
const LONG_NAME_RECORD = (() => {
  const record = JSON.parse(JSON.stringify(RICH));
  const team = record.teams[0];
  const p = team.players.find(pl => pl.id === 'p10');
  p.name = LONG_CALL_NAME;
  record.view = 'today';
  return record;
})();

const READ_LONG_NAME = `JSON.stringify((() => {
  const rows = [...document.querySelectorAll('#seasonbox .sn-row')];
  const row = rows.find(r => (r.querySelector('.sn-nm')?.textContent || '') === ${JSON.stringify(LONG_FIRST_NAME)});
  const nm = row && row.querySelector('.sn-nm');
  const min = row && row.querySelector('.sn-min');
  const grp = document.querySelector('#seasonbox .pgrp');
  return {
    found: !!row,
    ellipsized: nm ? nm.scrollWidth > nm.clientWidth + 0.5 : null,
    minRight: min ? min.getBoundingClientRect().right : null,
    grpRight: grp ? grp.getBoundingClientRect().right : null,
  };
})())`;

async function seasonLongNamePass(c, origin) {
  const problems = [];
  const cases = [[16, '320px/16px text'], [LARGE_TEXT_PX, '320px/32px text']];
  try {
    for (const [px, label] of cases) {
      await c.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: px } });
      await setWidth(c, LARGE_TEXT_WIDTH);
      await reloadWithRecord(c, origin, LONG_NAME_RECORD);
      await tap(c, OPEN_SEASON);

      const data = await evalJSON(c, READ_LONG_NAME);
      if (!data.found) {
        problems.push(`${label}: no Minutes so far row found for "${LONG_CALL_NAME}"`);
        continue;
      }
      if (!data.ellipsized) {
        problems.push(`${label}: "${LONG_CALL_NAME}"'s call name did not overflow its column -- nothing to ellipsize`);
      }
      if (data.minRight != null && data.grpRight != null && data.minRight > data.grpRight + 0.5) {
        problems.push(`${label}: the minutes column reaches ${data.minRight.toFixed(1)}px, past the group's own `
          + `right edge at ${data.grpRight.toFixed(1)}px`);
      }
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await setWidth(c, WIDTH);
    await goRich(c, origin);
  }
  return {
    pass: problems.length === 0,
    problems,
    detail: problems.length ? '' : `"${LONG_CALL_NAME}" ellipsizes and its minutes stay inside the group at 320px/16px and 320px/32px`,
  };
}

/* Defect found on the branch preview (main has it too, restyled here so it is
   fixed here): at 320px/32px, a filed game's own summary row (its title
   beside its meta, `.sn-game > summary`) and an opened game's own player rows
   (`.sn-body .sn-row` -- RICH's larger, bordered shape, "unchanged" per the
   comment at `.sn-list .sn-row`'s own rule above; the ledger itself already
   stacks correctly at this size) squeeze their text to a sliver: `.prow-t`'s
   `flex: 1` is a 0% flex-basis (app.css), so it claims none of the row's own
   hypothetical width before growing, and a filed game's meta (`.sn-gm`) or a
   name row's track/minutes columns can still leave it almost nothing once the
   row itself is this narrow. `WORD_FLOOR_FN` (dom.mjs) is #138's own
   name-squeeze floor, reused rather than re-derived for a second selector
   pair: `min(a text's longest single word, its own row's content-box
   width)`. RICH's own filed games ("vs Falcons", "vs Comets", ...) and its
   first opened game's own player names are what this reads -- no fixture
   built for it. */
const OPEN_FIRST_FILED_GAME = `document.querySelector('#seasonFiled details.sn-game').open = true`;

const READ_FILED_SQUEEZE = `JSON.stringify((() => {
  ${WORD_FLOOR_FN}
  return {
    titles: wordFloorRows('#seasonFiled .sn-game .sn-gt', 'summary'),
    names: wordFloorRows('#seasonFiled .sn-body .sn-row .sn-nm', '.sn-row'),
  };
})())`;

async function seasonFiledSqueezePass(c, origin) {
  const problems = [];
  const where = `${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await setWidth(c, LARGE_TEXT_WIDTH);
    await goRich(c, origin);
    await tap(c, TODAY_HOME);
    await tap(c, OPEN_SEASON);
    await tap(c, OPEN_FIRST_FILED_GAME);

    const data = await evalJSON(c, READ_FILED_SQUEEZE);
    if (!data.titles.length) {
      // rule 2a of /new-guard: a check that measured nothing fails.
      problems.push(`${where}: no filed-game title was on screen to measure`);
    }
    if (!data.names.length) {
      problems.push(`${where}: no opened-game player name was on screen to measure`);
    }
    for (const row of [...data.titles, ...data.names]) {
      if (row.width + 1 < row.floor) {
        problems.push(`${where}: "${row.text}" is ${Math.round(row.width)}px wide, narrower than `
          + `min(its longest word ${row.longest}px, its row's own content width ${row.rowContent}px) `
          + `= ${Math.round(row.floor)}px`);
      }
    }
    const o = await evalJSON(c, OVERFLOW_PROBE);
    if (o.pans) problems.push(`${where}: Season pans sideways with a filed game open`);
    if (o.worst) problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await setWidth(c, WIDTH);
    await goRich(c, origin);
  }
  return {
    pass: problems.length === 0,
    problems,
    detail: problems.length ? '' : `${where}: every filed-game title and opened-game name gets at least its row's `
      + `content width or its longest word, whichever is smaller, and the page does not pan`,
  };
}
