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
