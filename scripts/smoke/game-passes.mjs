/* #26: game passes on Today -- items 1-8, 10 and 11, against the `FOUR`
 * fixture (twelve players, four games, booted straight onto Today). New
 * check, `/new-guard`: seen failing against `main`'s markup, where
 * `.pass-title`/`.pass-when`/`.pass-status`/`.pass-rot`/`.pass-summary` do
 * not exist and `renderTabs` never skips a Today rebuild while another
 * screen is on show.
 *
 * Item 10's "developer picks, and says which" (`cold`/`coldToday` from the
 * cold-load evaluate, or a fresh re-measurement): this check does its OWN
 * SEED reload (`goSeed`, fixtures.mjs) rather than reading `smoke-checks.js`'s
 * report, because `--only` on a `setup: 'rich'` row (this one) never runs
 * that evaluate -- see `smoke.mjs`'s `browserChecks`, the `only.setup ===
 * 'rich'` branch. A check that only works inside a full run is not one
 * `--only` can prove alone, so it measures `cold`/`coldToday` itself, the
 * same way `goRich` measures the rich fixture, just against `SEED`/`v3`
 * instead. */
import { evalIn, step, WIDTH, HEIGHT, SETTLE, TODAY_HOME } from './dom.mjs';
import { FOUR, RICH, goSeed, reloadWithRecord } from './fixtures.mjs';
import { nameOf } from './registry.mjs';
import { ceiling } from '../budgets.mjs';
import { readFileSync } from 'node:fs';

const BASELINE_NODES = JSON.parse(
  readFileSync(new URL('../budgets.json', import.meta.url), 'utf8')
).initialPayload.nodes;

// One row per pass, from the spec's own table (items 2-6, 8) -- never read
// back from `passSummary`/`passBlocks` themselves, which would only prove
// those functions agree with themselves.
const WANT = [
  { title: 'Panthers', when: '9:00', status: 'Planned',
    summary: '12 players · even minutes',
    aria: 'Panthers, 9:00, planned', rows: 12, rot: true },
  { title: 'Ravens', when: '11:30', status: 'Planned',
    summary: '11 players · even minutes · evens out the day · 2 rules',
    aria: 'Ravens, 11:30, planned', rows: 11, rot: true },
  { title: 'Game 3', when: '2:00', status: 'Planned',
    summary: '12 players · a closing group',
    aria: 'Game 3, 2:00, planned', rows: 12, rot: true },
  { title: 'Owls', when: null, status: 'Needs a fix',
    summary: '12 players · even minutes · 1 rule',
    aria: 'Owls, needs a fix', rows: 0, rot: false },
];

const parseRgb = s => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const closeEnough = (a, b, tol = 3) =>
  !!a && !!b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

/* Item 6, the pixel half. A CDP screenshot of the current viewport, decoded
 * in the page onto a canvas -- never a regex over `oklch()` or over the
 * gradient string (browser-verify SKILL.md item 5). `sx`/`sy` are read back
 * from the decoded image rather than assumed: `deviceScaleFactor` and
 * `clip.scale` compound (measured directly against #24's card shots,
 * `scripts/og.mjs`), so trusting a fixed ratio here would silently sample
 * the wrong pixel the day either changes. */
/* `clip` is in page (document) coordinates, not the scrolled viewport's --
 * measured directly against the `FOUR` fixture's third pass, which needs a
 * scroll to reach and came back sampling the row two above the scrolled-to
 * one until `scrollX`/`scrollY` (read back off `window` at the same moment
 * as the points) were added here. `points` are `getBoundingClientRect`-style
 * viewport coordinates, same as every other point this file builds. */
async function samplePixels(c, points, scrollX, scrollY) {
  const clipWidth = WIDTH, clipHeight = HEIGHT + scrollY;
  const { data } = await c.send('Page.captureScreenshot', {
    format: 'png', clip: { x: 0, y: 0, width: clipWidth, height: clipHeight, scale: 1 },
  });
  const json = await evalIn(c, `(async () => {
    const img = new Image();
    const ready = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    img.src = 'data:image/png;base64,${data}';
    await ready;
    const sx = img.naturalWidth / ${clipWidth}, sy = img.naturalHeight / ${clipHeight};
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const pts = ${JSON.stringify(points)};
    const out = pts.map(p => {
      const x = Math.min(canvas.width - 1, Math.max(0, Math.round((p.x + ${scrollX}) * sx)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.round((p.y + ${scrollY}) * sy)));
      return [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    });
    return JSON.stringify(out);
  })()`);
  return JSON.parse(json);
}

/* One pass's rotation, checked against real pixels: item 6, for pass `i`
 * (0-2; pass 3 has no rotation to check). Reads `plans`, `effectiveStints`
 * and `colorOf` from `state.js` in the page -- never `p.stints` and never a
 * copy of `rowGradient`'s own gap math. The naive equal-per-period boundary
 * (`pi / periods` of the row's width) always falls inside the true gap
 * whatever gap width `rowGradient` picked: with a `G`-wide gap the true gap
 * for boundary `pi` spans `[pi*100/periods + pi*G/periods - G, pi*100/periods
 * + pi*G/periods]`, and the naive point sits `pi*G/periods` inside that span
 * for any `G > 0` -- so this does not copy `ROW_GAP_PCT`. */
// #69 decision 13: off a player's color, a row's inline linear-gradient
// (rowGradient, state.js) now paints `--track` -- the same off-floor color
// the full timeline uses -- and only the period gaps stay transparent, so
// only THOSE show the pass button's own computed background-color through.
// `--track` is read off a probe element rather than parsed out of
// tokens.css, the same reason `probeRects` below reads a player's color off
// one: a computed style is what the row actually painted, not a second copy
// of the token table that could drift from it.
async function checkRotation(c, origin, i, problems) {
  const prep = JSON.parse(await evalIn(c, `(async () => {
    const mod = await import('${origin}/state.js');
    const g = mod.state.day.games[${i}];
    const p = mod.plans[${i}];
    const stints = mod.effectiveStints(g, p).map(s => ({ period: s.period, minutes: s.minutes, onFloor: s.onFloor }));
    const avail = mod.availIds(g);
    const passEl = document.querySelectorAll('#todayGames .today-game')[${i}];
    passEl.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 60));
    const rowEls = [...passEl.querySelectorAll('.pass-rot .pass-row')];
    const rows = rowEls.map((el, idx) => ({ id: avail[idx], rect: el.getBoundingClientRect().toJSON() }));
    const bg = getComputedStyle(passEl).backgroundColor;
    const probeRects = {};
    avail.forEach((id, idx) => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:' + (idx * 11) + 'px;top:0;width:9px;height:9px;z-index:99999;';
      d.style.background = mod.colorOf(id);
      document.body.appendChild(d);
      probeRects[id] = d.getBoundingClientRect().toJSON();
    });
    const trackProbe = document.createElement('div');
    trackProbe.style.cssText = 'position:fixed;left:0;top:99999px;width:9px;height:9px;z-index:99999;background:var(--track);';
    document.body.appendChild(trackProbe);
    const track = getComputedStyle(trackProbe).backgroundColor;
    return JSON.stringify({ periods: g.periods, periodMinutes: g.periodMinutes, stints, rows, bg, track, probeRects, scrollX: window.scrollX, scrollY: window.scrollY });
  })()`));

  const { periods, periodMinutes, stints, rows, bg, track, probeRects, scrollX, scrollY } = prep;
  const bgRgb = parseRgb(bg);
  const trackRgb = parseRgb(track);
  if (rows.some(r => r.rect.height < 3 || r.rect.height > 6)) {
    problems.push(`pass ${i}: a mini-rotation row is ${rows.map(r => r.rect.height).join(',')}px tall, want 3-6px`);
  }

  const stintPoints = [];
  for (const row of rows) {
    const midY = row.rect.top + row.rect.height / 2;
    let offset = 0, curPeriod = null;
    for (const s of stints) {
      if (s.period !== curPeriod) { curPeriod = s.period; offset = 0; }
      const from = offset, to = offset + s.minutes;
      offset = to;
      const mid = (from + to) / 2;
      const xFrac = ((s.period - 1) + mid / periodMinutes) / periods;
      stintPoints.push({
        rowId: row.id, period: s.period, from, to,
        onFloor: s.onFloor.includes(row.id),
        x: row.rect.left + xFrac * row.rect.width, y: midY,
      });
    }
  }
  const gapPoints = [];
  for (let pi = 1; pi < periods; pi++) {
    for (const row of rows) {
      const x0 = row.rect.left + (pi / periods) * row.rect.width;
      const y = row.rect.top + row.rect.height / 2;
      // The exact naive equal-per-period boundary, not a swept window: the
      // file comment above proves it always lands inside the true gap
      // whatever gap width `rowGradient` picked, so a tighter window here
      // would only risk a false failure on a correct, tight gap.
      gapPoints.push({ rowId: row.id, pi, x: x0, y });
    }
  }
  const probeIds = Object.keys(probeRects);
  const probePoints = probeIds.map(id => ({
    id, x: probeRects[id].left + probeRects[id].width / 2, y: probeRects[id].top + probeRects[id].height / 2,
  }));

  const all = [...stintPoints, ...gapPoints, ...probePoints];
  const pixels = await samplePixels(c, all, scrollX, scrollY);
  let k = 0;
  const stintPx = stintPoints.map(() => pixels[k++]);
  const gapPx = gapPoints.map(() => pixels[k++]);
  const probePx = {};
  for (const id of probeIds) probePx[id] = pixels[k++];

  for (let n = 0; n < stintPoints.length; n++) {
    const pt = stintPoints[n], px = stintPx[n];
    const want = pt.onFloor ? probePx[pt.rowId] : trackRgb;
    if (!closeEnough(px, want)) {
      problems.push(`pass ${i}, ${pt.rowId}, period ${pt.period} ${pt.from}-${pt.to}min: pixel ${JSON.stringify(px)}, `
        + `want ${pt.onFloor ? 'its color ' : 'the track color '}${JSON.stringify(want)} (onFloor=${pt.onFloor})`);
    }
  }
  const badGaps = new Set();
  for (let n = 0; n < gapPoints.length; n++) {
    if (!closeEnough(gapPx[n], bgRgb)) badGaps.add(`pass ${i} period gap ${gapPoints[n].pi}, row ${gapPoints[n].rowId}`);
  }
  for (const g of badGaps) problems.push(`${g}: the period boundary is not the background there`);
}

export async function gamePassesPass(c, origin) {
  const problems = [];
  let cold = null, coldToday = null, fourToday = null, roomCeiling = null;
  try {
    // Item 10.
    await goSeed(c, origin);
    cold = await evalIn(c, `document.getElementsByTagName('*').length`);
    coldToday = await evalIn(c, `document.querySelectorAll('#view-today *').length`);

    await reloadWithRecord(c, origin, FOUR);
    fourToday = await evalIn(c, `document.querySelectorAll('#view-today *').length`);
    roomCeiling = ceiling('nodes', BASELINE_NODES);
    const total = cold + (fourToday - coldToday);
    if (total > roomCeiling) {
      problems.push(`cold ${cold} + (fourToday ${fourToday} - coldToday ${coldToday}) = ${total}, `
        + `over the ${roomCeiling} ceiling (baseline ${BASELINE_NODES} + slack)`);
    }

    // Item 1.
    const order = JSON.parse(await evalIn(c, `(() => {
      const view = document.getElementById('view-today');
      const kids = [...view.children].map(el => el.id ? '#' + el.id
        : el.classList.contains('today-acts') ? 'today-acts' : el.tagName.toLowerCase());
      const passCount = document.querySelectorAll('#todayGames .today-game').length;
      // #100 removed "New day" (#todayNewDay) from #barToday entirely.
      const newDayGone = !document.getElementById('todayNewDay');
      return JSON.stringify({ kids, passCount, newDayGone });
    })()`));
    if (order.passCount !== 4) problems.push(`#todayGames has ${order.passCount} .today-game buttons, want 4`);
    // #101 item 2 put the team switcher's popover (`#teamMenu`) right after
    // the large title it hangs off of, ahead of `#todayGames`.
    const wantKids = ['h1', '#teamMenu', '#todayGames', 'today-acts', '#todayTeam', '#todaySeason'];
    if (JSON.stringify(order.kids) !== JSON.stringify(wantKids)) {
      problems.push(`#view-today's children are ${JSON.stringify(order.kids)}, want ${JSON.stringify(wantKids)}`);
    }
    if (!order.newDayGone) problems.push('#todayNewDay is still in the markup; "New day" was supposed to be removed');

    // Items 2, 3, 5, 6 (rotation presence), 8.
    const passes = JSON.parse(await evalIn(c, `(() => {
      const btns = [...document.querySelectorAll('#todayGames .today-game')];
      return JSON.stringify(btns.map(b => {
        const statusEl = b.querySelector('.pass-status');
        const rot = b.querySelector('.pass-rot');
        const focusable = b.querySelectorAll('button, a[href], input, select, textarea, [tabindex]').length;
        return {
          tag: b.tagName.toLowerCase(),
          title: b.querySelector('.pass-title')?.textContent ?? null,
          when: b.querySelector('.pass-when')?.textContent ?? null,
          statusText: statusEl ? statusEl.textContent : null,
          statusOk: statusEl ? statusEl.classList.contains('ok') : false,
          statusWarn: statusEl ? statusEl.classList.contains('warn') : false,
          summary: b.querySelector('.pass-summary')?.textContent ?? null,
          hasRot: !!rot,
          rotHidden: rot ? rot.getAttribute('aria-hidden') : null,
          rowCount: rot ? rot.querySelectorAll('.pass-row').length : 0,
          ariaLabel: b.getAttribute('aria-label'),
          focusable,
        };
      }));
    })()`));
    passes.forEach((p, i) => {
      if (p.tag !== 'button') problems.push(`pass ${i} is a <${p.tag}>, want <button>`);
      if (p.focusable !== 0) problems.push(`pass ${i} has ${p.focusable} focusable element(s) inside it`);
      const want = WANT[i];
      if (p.title !== want.title) problems.push(`pass ${i} title is ${JSON.stringify(p.title)}, want ${JSON.stringify(want.title)}`);
      if (p.when !== want.when) problems.push(`pass ${i} tip-off is ${JSON.stringify(p.when)}, want ${JSON.stringify(want.when)}`);
      if (p.statusText !== want.status) problems.push(`pass ${i} status text is ${JSON.stringify(p.statusText)}, want ${JSON.stringify(want.status)}`);
      if (p.summary !== want.summary) problems.push(`pass ${i} summary is ${JSON.stringify(p.summary)}, want ${JSON.stringify(want.summary)}`);
      if (p.ariaLabel !== want.aria) problems.push(`pass ${i} aria-label is ${JSON.stringify(p.ariaLabel)}, want ${JSON.stringify(want.aria)}`);
      if (p.hasRot !== want.rot) problems.push(`pass ${i} has a mini rotation: ${p.hasRot}, want ${want.rot}`);
      if (p.hasRot) {
        if (p.rotHidden !== 'true') problems.push(`pass ${i}'s mini rotation aria-hidden is ${JSON.stringify(p.rotHidden)}, want "true"`);
        if (p.rowCount !== want.rows) problems.push(`pass ${i}'s mini rotation has ${p.rowCount} rows, want ${want.rows}`);
      }
    });

    // Item 4: the status dot's color is a real class rule, read off a probe
    // built with the same class the pass carries -- never a copied hex.
    const dotColors = JSON.parse(await evalIn(c, `(() => {
      const probe = cls => {
        const d = document.createElement('span');
        d.className = 'pass-status ' + cls;
        document.body.appendChild(d);
        const v = getComputedStyle(d, '::before').backgroundColor;
        d.remove();
        return v;
      };
      const btns = [...document.querySelectorAll('#todayGames .today-game')];
      const dots = btns.map(b => {
        const el = b.querySelector('.pass-status');
        return el ? getComputedStyle(el, '::before').backgroundColor : null;
      });
      const errEl = document.createElement('div');
      errEl.style.background = 'var(--err)';
      document.body.appendChild(errEl);
      const err = getComputedStyle(errEl).backgroundColor;
      errEl.remove();
      return JSON.stringify({ ok: probe('ok'), warn: probe('warn'), err, dots });
    })()`));
    dotColors.dots.forEach((d, i) => {
      const want = WANT[i].status === 'Planned' ? dotColors.ok : dotColors.warn;
      if (d !== want) problems.push(`pass ${i}'s status dot is ${d}, want ${want === dotColors.ok ? '--ok' : '--warn'} (${want})`);
      if (d === dotColors.err) problems.push(`pass ${i}'s status dot still reads --err (${d})`);
    });

    // Item 6, the pixel half: passes 0-2 (pass 3 has no rotation).
    for (let i = 0; i < 3; i++) await checkRotation(c, origin, i, problems);

    // Item 7: tapping a pass opens its game, header title included. Checked
    // on pass 0 and pass 3 -- the labelled and the "Game N" case.
    for (const i of [0, 3]) {
      await evalIn(c, step(`document.querySelectorAll('#todayGames .today-game')[${i}].click()`));
      const g = JSON.parse(await evalIn(c, `(async () => {
        const mod = await import('${origin}/state.js');
        return JSON.stringify({
          activeGame: mod.state.activeGame,
          title: document.getElementById('barTitle')?.textContent ?? null,
          gamesShown: !document.getElementById('view-games')?.hidden,
        });
      })()`));
      if (g.activeGame !== i) problems.push(`tapping pass ${i} set activeGame to ${g.activeGame}, want ${i}`);
      if (!g.gamesShown) problems.push(`tapping pass ${i} did not show the Game screen`);
      if (g.title !== WANT[i].title) problems.push(`tapping pass ${i} shows header title ${JSON.stringify(g.title)}, want ${JSON.stringify(WANT[i].title)}`);
      await evalIn(c, step(TODAY_HOME));
    }

    // Item 11: editing on the Game screen must not touch #todayGames' own
    // nodes while Today is hidden (decision 6); going back to Today then
    // shows the edited plan.
    await evalIn(c, step(`document.querySelectorAll('#todayGames .today-game')[0].click()`));
    const marksBefore = JSON.parse(await evalIn(c, `(() => {
      const box = document.getElementById('todayGames');
      [...box.children].forEach((el, i) => { el.dataset.smokeMark = 'm' + i + '_' + Math.random().toString(36).slice(2); });
      return JSON.stringify([...box.children].map(el => el.dataset.smokeMark));
    })()`));
    // Sit Devon Ellis (p1) out of game 0 through Who's here (#27) -- an
    // availability edit, which schedules `soon('strategy', ...PLAN_ONLY)`
    // (game-setup.js), the same repaint item 11 is about.
    await evalIn(c, `(async () => {
      document.querySelector('#phrasePlayers')?.click();
      await ${SETTLE};
      [...document.querySelectorAll('#sheetWho button.sheetrow')]
        .find(b => b.textContent.includes('Devon Ellis'))?.click();
      await ${SETTLE};
    })()`);
    const marksAfter = JSON.parse(await evalIn(c, `(() => {
      const box = document.getElementById('todayGames');
      return JSON.stringify([...box.children].map(el => el.dataset.smokeMark));
    })()`));
    if (JSON.stringify(marksBefore) !== JSON.stringify(marksAfter)) {
      problems.push(`editing game 0 on the Game screen replaced #todayGames' own nodes while Today was hidden `
        + `(${JSON.stringify(marksBefore)} -> ${JSON.stringify(marksAfter)})`);
    }
    await evalIn(c, step(TODAY_HOME));
    const repainted = JSON.parse(await evalIn(c, `(() => {
      const b = document.querySelectorAll('#todayGames .today-game')[0];
      return JSON.stringify({
        summary: b.querySelector('.pass-summary')?.textContent ?? null,
        rowCount: b.querySelectorAll('.pass-rot .pass-row').length,
      });
    })()`));
    if (repainted.summary !== '11 players · even minutes') {
      problems.push(`after sitting a player out and returning to Today, pass 0's summary is `
        + `${JSON.stringify(repainted.summary)}, want "11 players · even minutes"`);
    }
    if (repainted.rowCount !== 11) {
      problems.push(`after sitting a player out and returning to Today, pass 0's mini rotation has `
        + `${repainted.rowCount} rows, want 11`);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    // Same courtesy `todayAndBackPass`/`todayKeysAndUndoPass` pay: leave the
    // fixture as `goRich` left it for whatever check runs next.
    await reloadWithRecord(c, origin, RICH).catch(() => {});
  }
  return {
    name: nameOf('gamepasses'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `4 passes in day order, titles/tip-offs/status/summaries/aria-labels match, mini rotations paint real `
        + `pixels, tapping opens the game, editing does not touch hidden #todayGames — cold ${cold}, `
        + `coldToday ${coldToday}, fourToday ${fourToday}, ceiling ${roomCeiling}`,
  };
}
