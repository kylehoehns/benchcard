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
import { TOUCH_WIDTHS } from './sizes.mjs';
import { goRich } from './fixtures.mjs';

const OPEN_SEASON = `document.querySelector('#todaySeason').click()`;

async function readLedger(c) {
  return JSON.parse(await evalIn(c, `(async () => {
    const sv = await import('/season-view.js');
    const st = await import('/state.js');
    const eng = await import('/engine.js');
    const roster = await import('/roster.js');
    const games = sv.seasonGames();
    const rows = sv.totals(games);
    const maxMin = rows.reduce((m, r) => Math.max(m, r.min), 0);
    // #144 item 3: the top ledger shows callNames' first name (or the fuller
    // disambiguated form on a collision), read live the same way, never a
    // second full-name computation of our own.
    const names = roster.callNames(st.state.players);
    const want = rows.map(r => ({
      name: st.byId(r.id) ? (names[r.id] || (st.byId(r.id).name || '').trim() || 'Unnamed') : 'Left the team',
      // #144 item 3: "N games * N behind/ahead" is still offNote's own words,
      // now carried in the row's one hidden-text element (app.css's single
      // '.sr-only' rule) instead of a visible '.sn-x' span.
      footnote: \`\${r.games} game\${r.games === 1 ? '' : 's'}\${sv.offNote(r.off)}\`,
      minText: eng.fmtMinutes(r.min),
      pct: maxMin > 0 ? Math.min(100, (r.min / maxMin) * 100) : 0,
    }));
    const domRows = [...document.querySelectorAll('#seasonbox .sn-list .sn-row')].map(r => ({
      name: r.querySelector('.sn-nm')?.textContent || '',
      footnote: r.querySelector('.sr-only')?.textContent || '',
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
    // #141 (one control each), decision 1: '.sn-del' is gone -- the remove
    // button is now the same '.prow-danger' row every other remove action
    // uses, scoped to '.sn-body' so this stays "one per filed game".
    for (const b of document.querySelectorAll('#view-season .sn-body .prow-danger')) out.deletes.push(rectOf(b));
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

  /* ---- review #4, superseded by #144 item 2: the minutes bar must still be
     the prototype's dominant element, not a sliver. #144 stopped the name
     column wrapping at all (call names, one line, ellipsis if long --
     `season-look.mjs` reads that CSS live), so the old two-word-name/footnote
     wrap check no longer applies; what is still this file's own to check is
     that the bar (`.sn-track`) is not squeezed back down to its pre-#30
     sliver now that the row is 30px tall and padded 1rem each side. #144
     item 2's `1rem` row padding (up from the old `.1rem`) trades roughly 29px
     of row width for a shorter, ellipsis-capable name column; measured live
     on RICH at 390px this settles at 115px -- still comfortably past the
     original ~88px sliver, so the floor moves to 100px with it, not to
     whatever a single run happens to measure. */
  const rowShapes = JSON.parse(await evalIn(c, `(() => {
    const rows = [...document.querySelectorAll('#seasonbox .sn-list .sn-row')];
    return JSON.stringify(rows.map(r => {
      const track = r.querySelector('.sn-track');
      return { trackW: track ? track.getBoundingClientRect().width : null };
    }));
  })()`));
  const track0 = rowShapes[0]?.trackW ?? 0;
  if (track0 < 100) {
    problems.push(`.sn-track is ${Math.round(track0)}px wide at ${WIDTH}px, want it meaningfully past the original ~88px (≥100px)`);
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
    const del = body.querySelector('.prow-danger');
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
    // #141 item 2 (W2): "Remove", not "Delete".
    if (g0.delText !== 'Remove this game') {
      problems.push(`filed game's remove control reads ${JSON.stringify(g0.delText)}, want "Remove this game"`);
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
    await evalIn(c, `(async () => { document.querySelector('#view-season .sn-body .prow-danger')?.click(); await ${SETTLE}; })()`);
    // #141 item 2: Season's toast, checked once on the first remove -- the
    // other two would only repeat the same fact.
    if (i === 0) {
      const toastText = await evalIn(c, `document.querySelector('.toast .tmsg')?.textContent || ''`);
      if (!/^Removed .* from the season\.$/.test(toastText)) {
        problems.push(`removing a filed game toasts ${JSON.stringify(toastText)}, want "Removed <title> from the season."`);
      }
    }
  }
  /* The count line under the title used to read "Nothing filed yet" with
     nothing filed, directly above a paragraph opening with the same four
     words -- which reads as a repaint that ran once too often, not a screen
     that knows it is empty. So with nothing to count the line goes away
     entirely (`sub.textContent = ''`) and the paragraph (#100: "Games file
     here once their day has passed.") carries the whole message alone.
     Counted in the rendered text rather than by asking whether one element
     is hidden, so the check still holds if the emptiness is said some other
     way later. */
  const emptied = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    gamesLeft: document.querySelectorAll('#view-season details.sn-game').length,
    exportHidden: document.querySelector('#seasonExport')?.hidden ?? true,
    saysEmpty: (document.querySelector('#view-season')?.innerText.match(/Games file here/g) || []).length,
  }))()`));
  if (emptied.gamesLeft !== 0) problems.push(`${emptied.gamesLeft} filed game(s) remain after deleting all three, want 0`);
  if (!emptied.exportHidden) problems.push('#seasonExport is visible with nothing filed, want it hidden');
  if (emptied.saysEmpty !== 1) {
    problems.push(`the empty Season says "Games file here" ${emptied.saysEmpty} time(s), want exactly 1`);
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
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${domRows.length} minutes rows in order, a filed game's ${wantGameRows.length} rows and Remove read back, `
        + `the day chart on Season only, Export 48×48 at ${TOUCH_WIDTHS.join('/')}px and nowhere else`,
  };
}
