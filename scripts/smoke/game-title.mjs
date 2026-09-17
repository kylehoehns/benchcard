/* #69 decision 5, "What would settle it" item 8: opening a game shows one
 * large title on screen -- the opponent -- with a sub line under it reading
 * "<tip-off> · <status>", reusing the pass's own status word and dot rather
 * than a second copy of that text. `#barTitle` (the header's own title,
 * `renderTabs`'s `gameLabel(...)`) stays in the DOM for the other back
 * screens but must not also be a second visible `h1` here.
 *
 * The expected title/tip-off/status text is the RICH fixture's own first
 * game (`fixtures.mjs`: `id: 'g0', label: 'Hawks', when: '9:00'`, a plain
 * balanced plan with no rules, so `plans[0].ok` is true) -- pinned by hand,
 * never read back from `gameLabel` or `renderPass`'s own status text, the
 * same way `game-passes.mjs`'s `WANT` table pins game 0's answer under a
 * different fixture. */
import { evalIn, step, TODAY_HOME, OVERFLOW_PROBE, WIDTH, HEIGHT, SETTLE } from './dom.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './registry.mjs';

const WANT = { title: 'Hawks', when: '9:00', status: 'Planned' };

export async function gameTitlePass(c, origin) {
  const problems = [];
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));

  const info = JSON.parse(await evalIn(c, `(() => {
    // > 1px, not just non-zero: \`.title-vh\` (app.css) clips \`#barTitle\` to a
    // 1x1 box on purpose, to keep it in the accessibility tree rather than
    // \`hidden\`-ing it outright -- a plain truthy width/height check would
    // still count that box as "visible" and never catch a second title.
    const visible = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
    };
    const h1s = [...document.querySelectorAll('#view-games h1, .bar h1')].filter(visible);
    const gameTitle = document.getElementById('gameTitle');
    const gameSub = document.getElementById('gameSub');
    const barTitle = document.getElementById('barTitle');
    return JSON.stringify({
      visibleCount: h1s.length,
      visibleTexts: h1s.map(h => h.textContent),
      titleText: gameTitle ? gameTitle.textContent : null,
      subText: gameSub ? gameSub.textContent : null,
      // A 1x1 clipped box (\`.title-vh\`, the sr-only idiom) still reports
      // \`checkVisibility()\` true by default -- that call only asks about
      // \`display: none\`/detachment, not size -- so a screen reader's rotor
      // still announces "Panthers" from #barTitle a second time even though
      // the bounding-rect check above is satisfied. #69 decision 5: the games
      // view has to hide it for real (\`hidden\`/\`display: none\`), not just
      // clip it, so \`checkVisibility()\` itself reads false there.
      barTitleReallyVisible: barTitle ? barTitle.checkVisibility() : null,
    });
  })()`));

  await evalIn(c, step(TODAY_HOME));

  if (info.visibleCount !== 1) {
    problems.push(`${info.visibleCount} visible h1(s) on the game screen: ${JSON.stringify(info.visibleTexts)}`);
  }
  if (info.titleText !== WANT.title) {
    problems.push(`#gameTitle reads ${JSON.stringify(info.titleText)}, want ${JSON.stringify(WANT.title)}`);
  }
  if (!info.subText || !info.subText.includes(WANT.when)) {
    problems.push(`#gameSub is ${JSON.stringify(info.subText)}, want it to include ${JSON.stringify(WANT.when)}`);
  }
  if (!info.subText || !info.subText.includes(WANT.status)) {
    problems.push(`#gameSub is ${JSON.stringify(info.subText)}, want it to include ${JSON.stringify(WANT.status)}`);
  }
  if (info.barTitleReallyVisible !== false) {
    problems.push(`#barTitle.checkVisibility() is ${info.barTitleReallyVisible} on the games view, want false -- a screen reader still hears "Panthers" from it a second time`);
  }

  /* #69 decision 7: the one-row timeline used to spend most of a 368px
   * row on its label and total gutters, leaving the track -- the thing a
   * coach is actually reading -- about 105px of it. The track is the
   * majority of the row or the layout has regressed, at the width the app
   * actually ships at. */
  await evalIn(c, step(`document.querySelector('.today-game').click()`));
  const tl = JSON.parse(await evalIn(c, `(() => {
    const timeline = document.getElementById('timeline');
    const track = timeline && timeline.querySelector('.tl-track');
    if (!timeline || !track) return JSON.stringify({ timelineWidth: 0, trackWidth: 0 });
    const t = timeline.getBoundingClientRect(), r = track.getBoundingClientRect();
    return JSON.stringify({ timelineWidth: t.width, trackWidth: r.width });
  })()`));
  if (tl.timelineWidth > 0 && tl.trackWidth / tl.timelineWidth < 0.5) {
    problems.push(`the timeline track is ${Math.round(tl.trackWidth)}px of a ${Math.round(tl.timelineWidth)}px timeline `
      + `(${Math.round(100 * tl.trackWidth / tl.timelineWidth)}%) at ${WIDTH}px, want the track at least half the row`);
  }
  await evalIn(c, step(TODAY_HOME));

  /* And the same screen at a 200% reader's root, the narrowest phone anyone
   * carries: the timeline drops to its stacked layout there (see app.css),
   * and nothing on the games screen may run past either edge. A font size
   * cannot be re-applied without a reload -- see app-large-text.mjs's own
   * comment -- so this reloads onto the games view RICH already leaves
   * active, rather than clicking a game a second time. */
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
    const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
    const where = `${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
    if (o.pans) problems.push(`${where}: the games view pans sideways`);
    if (o.worst) problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`);
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
  await evalIn(c, step(TODAY_HOME));

  return {
    name: nameOf('gametitle'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.join(' | ')}`
      : `one visible h1 (${JSON.stringify(info.titleText)}), sub line ${JSON.stringify(info.subText)}`,
  };
}
