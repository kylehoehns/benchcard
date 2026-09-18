/* #30's own guard (see docs/specs/30-season-screen.md's Proof section): the
 * Season screen, reached through `#todaySeason` like a coach, against the
 * RICH fixture (11 players, two games today, three filed games).
 *
 * The minutes-so-far rows and their order are checked against `totals()` and
 * `offNote()` called live, in the page, on `seasonGames()` -- the app's own
 * exported answer -- rather than a second computation of a share here
 * (`app/season-view.js`'s own comment: "Reused, never reimplemented"). A
 * filed game is opened and its rows and Delete button are read the same way.
 * Export, every filed-game summary and every Delete are then measured at
 * 320/360/390px, the day chart's move off the game screen is checked by
 * absence there and presence (with its legend) on Season, and Export is
 * checked absent from every other screen. */
import { evalIn, step, TODAY_HOME, WIDTH, HEIGHT, SETTLE } from './dom.mjs';
import { nameOf, TOUCH_WIDTHS } from './registry.mjs';
import { goRich } from './fixtures.mjs';

const OPEN_SEASON = `document.querySelector('#todaySeason').click()`;

async function readLedger(c) {
  return JSON.parse(await evalIn(c, `(async () => {
    const sv = await import('/season-view.js');
    const st = await import('/state.js');
    const eng = await import('/engine.js');
    const games = sv.seasonGames();
    const rows = sv.totals(games);
    const maxMin = rows.reduce((m, r) => Math.max(m, r.min), 0);
    const want = rows.map(r => ({
      name: st.byId(r.id) ? ((st.byId(r.id).name || '').trim() || 'Unnamed') : 'Left the team',
      footnote: \`\${r.games} game\${r.games === 1 ? '' : 's'}\${sv.offNote(r.off)}\`,
      minText: eng.fmtMinutes(r.min),
      pct: maxMin > 0 ? Math.min(100, (r.min / maxMin) * 100) : 0,
    }));
    const domRows = [...document.querySelectorAll('#seasonbox .sn-list .sn-row')].map(r => ({
      name: r.querySelector('.sn-nm')?.textContent || '',
      footnote: r.querySelector('.sn-x')?.textContent || '',
      minText: r.querySelector('.sn-min')?.textContent || '',
      fillPct: parseFloat(r.querySelector('.sn-fill')?.style.width || '0'),
    }));

    const day0 = sv.seasonDays(games)[0];
    const g = day0 && day0.games[0];
    const wantGameRows = g
      ? Object.entries(g.minutes || {}).sort((a, b) => b[1] - a[1])
          .map(([id, m]) => ({
            name: st.byId(id) ? ((st.byId(id).name || '').trim() || 'Unnamed') : 'Left the team',
            minText: eng.fmtMinutes(m),
          }))
      : [];

    return JSON.stringify({ want, domRows, wantGameRows });
  })()`));
}

async function measureAt(c, width) {
  await c.send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
  return JSON.parse(await evalIn(c, `(() => {
    const rectOf = el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
    const out = { exportBtn: null, summaries: [], deletes: [] };
    const exp = document.querySelector('#seasonExport');
    if (exp && !exp.hidden) out.exportBtn = rectOf(exp);
    for (const d of document.querySelectorAll('#view-season details.sn-game')) {
      out.summaries.push(rectOf(d.querySelector('summary')));
    }
    for (const d of document.querySelectorAll('#view-season details.sn-game')) d.open = true;
    for (const b of document.querySelectorAll('#view-season .sn-del')) out.deletes.push(rectOf(b));
    for (const d of document.querySelectorAll('#view-season details.sn-game')) d.open = false;
    return JSON.stringify(out);
  })()`));
}

export async function seasonPass(c, origin) {
  const problems = [];

  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(OPEN_SEASON));

  /* ---- minutes so far: count, name/footnote/fill/number, and the order ---- */
  const { want, domRows, wantGameRows } = await readLedger(c);
  if (domRows.length !== want.length) {
    problems.push(`${domRows.length} minutes rows on screen, want ${want.length} (one per roster player)`);
  }
  for (let i = 0; i < Math.min(domRows.length, want.length); i++) {
    const d = domRows[i], w = want[i];
    if (d.name !== w.name) problems.push(`row ${i}: name ${JSON.stringify(d.name)}, want ${JSON.stringify(w.name)} (order or wiring off)`);
    if (d.footnote !== w.footnote) problems.push(`row ${i} (${w.name}): footnote ${JSON.stringify(d.footnote)}, want ${JSON.stringify(w.footnote)}`);
    if (d.minText !== w.minText) problems.push(`row ${i} (${w.name}): minutes ${JSON.stringify(d.minText)}, want ${JSON.stringify(w.minText)}`);
    if (Math.abs(d.fillPct - w.pct) > 0.5) problems.push(`row ${i} (${w.name}): fill ${d.fillPct}%, want ${w.pct.toFixed(1)}%`);
  }

  /* ---- review #4: the minutes bar is the prototype's dominant element, not
     a sliver -- but the prototype's own name column is only ever "Maya" or
     "Eli", never a real roster's "Casey Lindqvist" or a footnote's "3 games *
     16 behind" (`.sn-x`, `--fs-footnote`). A first pass gave the bar an `fr`
     SHARE of the row (`1fr 2fr 3rem`), which grew it, but at 390px a third of
     the row is not enough for an ordinary two-word name and its footnote --
     both wrapped, so a one-line row became three. `minmax(0, 9rem) 1fr 3rem`
     CAPS the name at 144px instead of giving it a share: wide enough that an
     ordinary name and its footnote hold one line each, the bar still takes
     whatever that leaves (145-190px across 320-390px here, well past the
     original 88px), and the `0` floor keeps the column shrinkable rather than
     fixed, so it still cannot be the reason a row overflows at a 32px root
     (`app-large-text.mjs`'s "Filed games" case, `.sn-body .sn-row`, that a
     plain fixed rem width broke). Measured live rather than read off the CSS
     source: a source regex cannot tell a share that renders wider, or a name
     that still fits one line, from one that only reads that way. */
  const rowShapes = JSON.parse(await evalIn(c, `(() => {
    const rows = [...document.querySelectorAll('#seasonbox .sn-list .sn-row')];
    const lines = (el) => el ? Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) : null;
    return JSON.stringify(rows.map(r => {
      const track = r.querySelector('.sn-track');
      const nm = r.querySelector('.sn-nm');
      const x = r.querySelector('.sn-x');
      return {
        name: nm ? nm.textContent : null,
        nameLines: lines(nm),
        footnote: x ? x.textContent : null,
        footnoteLines: lines(x),
        trackW: track ? track.getBoundingClientRect().width : null,
      };
    }));
  })()`));
  const track0 = rowShapes[0]?.trackW ?? 0;
  if (track0 < 130) {
    problems.push(`.sn-track is ${Math.round(track0)}px wide at ${WIDTH}px, want it meaningfully past the original ~88px (≥130px)`);
  }
  for (const wantName of ['Casey Lindqvist', 'Marcus Williams']) {
    const row = rowShapes.find(r => r.name === wantName);
    if (!row) { problems.push(`RICH fixture no longer has a "${wantName}" ledger row to check`); continue; }
    if (row.nameLines !== 1) problems.push(`"${wantName}" wraps to ${row.nameLines} lines at ${WIDTH}px, want the name column wide enough for one`);
    if (row.footnoteLines !== 1) problems.push(`"${wantName}"'s footnote (${JSON.stringify(row.footnote)}) wraps to ${row.footnoteLines} lines at ${WIDTH}px, want one`);
  }

  /* ---- a filed game, opened: its rows and its Delete button ---- */
  const firstGame = await evalIn(c, `(() => {
    const d = document.querySelector('#view-season details.sn-game');
    if (!d) return null;
    d.open = true;
    const body = d.querySelector('.sn-body');
    const rows = [...body.querySelectorAll('.sn-row')].map(r => ({
      name: r.querySelector('.sn-nm')?.textContent || '',
      minText: r.querySelector('.sn-min')?.textContent || '',
    }));
    const del = body.querySelector('.sn-del');
    return JSON.stringify({ rows, delText: del ? del.textContent : null });
  })()`);
  const g0 = JSON.parse(firstGame);
  if (!g0) {
    problems.push('no filed game found to open (#view-season details.sn-game)');
  } else {
    if (g0.rows.length !== wantGameRows.length) {
      problems.push(`opened filed game has ${g0.rows.length} row(s), want ${wantGameRows.length}`);
    }
    for (let i = 0; i < Math.min(g0.rows.length, wantGameRows.length); i++) {
      const d = g0.rows[i], w = wantGameRows[i];
      if (d.name !== w.name || d.minText !== w.minText) {
        problems.push(`filed game row ${i}: ${JSON.stringify(d)}, want ${JSON.stringify(w)}`);
      }
    }
    if (g0.delText !== 'Delete this game') {
      problems.push(`filed game's delete control reads ${JSON.stringify(g0.delText)}, want "Delete this game"`);
    }
  }

  /* ---- the day chart moved: gone from Games, present (with its legend) on Season ---- */
  const gameScreen = JSON.parse(await evalIn(c, `(async () => {
    const $ = s => document.querySelector(s);
    $('.today-game') && $('.today-game').click();
    await ${SETTLE};
    return JSON.stringify({
      dayFold: !!document.querySelector('#view-games #dayFold'),
      dayTotalsInGames: !!document.querySelector('#view-games #daytotals'),
    });
  })()`));
  if (gameScreen.dayFold) problems.push('#view-games still holds #dayFold — the day chart did not move');
  if (gameScreen.dayTotalsInGames) problems.push('#view-games still holds #daytotals — the day chart did not move');
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(OPEN_SEASON));

  const chart = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    sectionHidden: document.querySelector('#daySection')?.hidden ?? true,
    dayRows: document.querySelectorAll('#view-season #daytotals .dayrow').length,
    legendSpans: document.querySelectorAll('#view-season #daytotals .legend span').length,
  }))()`));
  if (chart.sectionHidden) problems.push('#daySection is hidden on Season with two games today, want it shown');
  if (chart.dayRows < 11) problems.push(`#view-season's day chart has ${chart.dayRows} row(s), want 11`);
  if (chart.legendSpans < 2) problems.push(`#view-season's day chart legend names ${chart.legendSpans} game(s), want 2`);

  /* ---- touch: Export, each summary and each Delete, at 320/360/390px ---- */
  for (const w of TOUCH_WIDTHS) {
    const m = await measureAt(c, w);
    if (m.exportBtn && (m.exportBtn.w < 48 || m.exportBtn.h < 48)) {
      problems.push(`#seasonExport is ${Math.round(m.exportBtn.w)}×${Math.round(m.exportBtn.h)} at ${w}px, want ≥48×48`);
    }
    m.summaries.forEach((r, i) => {
      if (r.w < 48 || r.h < 48) problems.push(`filed-game summary ${i} is ${Math.round(r.w)}×${Math.round(r.h)} at ${w}px, want ≥48×48`);
    });
    m.deletes.forEach((r, i) => {
      if (r.w < 48 || r.h < 48) problems.push(`Delete this game (${i}) is ${Math.round(r.w)}×${Math.round(r.h)} at ${w}px, want ≥48×48`);
    });
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });

  /* ---- Export exists on Season and on no other screen ---- */
  const elsewhere = [
    { name: 'today', open: TODAY_HOME },
    { name: 'games', open: `document.querySelector('.today-game').click()` },
    { name: 'team', open: `document.querySelector('#todayTeam').click()` },
    { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
  ];
  for (const s of elsewhere) {
    await evalIn(c, step(TODAY_HOME));
    await evalIn(c, step(s.open));
    const hidden = await evalIn(c, `(() => { const b = document.querySelector('#seasonExport'); return !b || b.hidden; })()`);
    if (!hidden) problems.push(`#seasonExport is visible on ${s.name}, want it only on Season`);
  }
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(OPEN_SEASON));
  const onSeason = await evalIn(c, `(() => { const b = document.querySelector('#seasonExport'); return !!b && !b.hidden; })()`);
  if (!onSeason) problems.push('#seasonExport is not visible on Season with 3 games filed, want it shown');

  /* ---- review #1: undoing the deletion of the season's LAST filed game must
     bring Export back. `renderSeason` is hide-only for `#seasonExport`
     (decision 1's comment); showing it is `applyView`'s job, but `deleteGame`
     hands `undoable` its own refresh (`() => renderAll()`), which never runs
     `setView`/`applyView` again. Deleting all three RICH games one at a time
     drives the ledger to empty (Export correctly hides); Undo puts the last
     one back, and Export must reappear without leaving Season. */
  for (let i = 0; i < 3; i++) {
    await evalIn(c, `(async () => { document.querySelector('#view-season .sn-del')?.click(); await ${SETTLE}; })()`);
  }
  /* The count line under the title and the empty note say the same four words
     with nothing filed, so the empty screen must not print them twice --
     "Nothing filed yet" above "Nothing filed yet. New day on Today files the
     day's games here." reads as a repaint that ran once too often. Counted in
     the rendered text rather than by asking whether one element is hidden, so
     the check still holds if the emptiness is said some other way later. */
  const emptied = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    gamesLeft: document.querySelectorAll('#view-season details.sn-game').length,
    exportHidden: document.querySelector('#seasonExport')?.hidden ?? true,
    saysEmpty: (document.querySelector('#view-season')?.innerText.match(/Nothing filed yet/g) || []).length,
  }))()`));
  if (emptied.gamesLeft !== 0) problems.push(`${emptied.gamesLeft} filed game(s) remain after deleting all three, want 0`);
  if (!emptied.exportHidden) problems.push('#seasonExport is visible with nothing filed, want it hidden');
  if (emptied.saysEmpty !== 1) {
    problems.push(`the empty Season says "Nothing filed yet" ${emptied.saysEmpty} time(s), want exactly 1`);
  }

  await evalIn(c, `(async () => { document.querySelector('.toast .tundo')?.click(); await ${SETTLE}; })()`);
  const undone = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    gamesLeft: document.querySelectorAll('#view-season details.sn-game').length,
    exportHidden: document.querySelector('#seasonExport')?.hidden ?? true,
  }))()`));
  if (undone.gamesLeft !== 1) problems.push(`undoing the last delete left ${undone.gamesLeft} filed game(s) on screen, want 1`);
  if (undone.exportHidden) {
    problems.push('#seasonExport stayed hidden after Undo restored the last filed game — the button is only ever hidden, never shown, on a refresh that is not setView/applyView');
  }

  // restore the untouched fixture for every check that runs after this one
  await goRich(c, origin);
  await evalIn(c, step(TODAY_HOME));

  return {
    name: nameOf('season'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${domRows.length} minutes rows in order, a filed game's ${wantGameRows.length} rows and Delete read back, `
        + `the day chart on Season only, Export 48×48 at ${TOUCH_WIDTHS.join('/')}px and nowhere else`,
  };
}
