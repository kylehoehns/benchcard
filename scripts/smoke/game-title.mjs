/* #69 decision 5, "What would settle it" item 8: opening a game shows one
 * large title on screen -- the opponent -- with a sub line under it reading
 * "<tip-off> · <status>", reusing the pass's own status word and dot rather
 * than a second copy of that text. `#barTitle` (the header's own title)
 * stays in the DOM for the other back screens but must not also read as a
 * second title here.
 *
 * #33 changed HOW it stays out of the way, not whether it does. It used to
 * be `hidden` on this view -- a real `display: none` -- so "one h1" could be
 * answered with `checkVisibility()`. It is now a centered overlay that is
 * always laid out and faded in by `.bar.title-in` once the large title has
 * scrolled under the bar, so at the top of the game screen it is present,
 * the size of its box, and painted at `opacity: 0`. Two things replace the
 * old check, one per audience: to the EYE, its computed opacity is 0 while
 * the large title is on screen; to a SCREEN READER, it carries
 * `aria-hidden="true"` here, so `#gameTitle` is still the only announced
 * heading. Neither is the other's proof -- an overlay faded out but still in
 * the accessibility tree is a rotor with "Hawks" in it twice, and one hidden
 * from the tree but painted over the large title is a visible double.
 *
 * The expected title/tip-off/status text is the RICH fixture's own first
 * game (`fixtures.mjs`: `id: 'g0', label: 'Hawks', tipoff: '09:00'`, a plain
 * balanced plan with no rules, so `plans[0].ok` is true) -- pinned by hand,
 * never read back from `gameLabel` or `renderPass`'s own status text, the
 * same way `game-passes.mjs`'s `WANT` table pins game 0's answer under a
 * different fixture. `WANT.when` stays the digits `tipoffLabel` prints for
 * 09:00 in en-US (`9:00`, no leading zero) -- a substring check, so it does
 * not care whether ICU puts an ASCII space or U+202F before "AM". */
import { evalIn, step, TODAY_HOME, OVERFLOW_PROBE, WIDTH, HEIGHT, SETTLE } from './dom.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './registry.mjs';

const WANT = { title: 'Hawks', when: '9:00', status: 'Planned' };

export async function gameTitlePass(c, origin) {
  const problems = [];
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));

  const info = JSON.parse(await evalIn(c, `(() => {
    // > 1px, not just non-zero: guards against a possible future regression
    // where a heading is kept off the screen by clipping it to a near-zero
    // box rather than by the means the app actually uses -- a plain non-zero
    // check would still count a 1x1 clipped box as "visible" and miss a
    // second title reappearing that way.
    const visible = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // #33: \`opacity\` joins the test because it is now how \`#barTitle\` is
      // kept off this screen. A fully transparent heading paints nothing,
      // which is the question this line is asking.
      return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0;
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
      // #33 decision 6: the accessibility half of "one title". The overlay
      // is in the tree now (it is Settings' only heading), so what keeps a
      // screen reader from announcing "Hawks" twice here is \`aria-hidden\`,
      // not \`display: none\`. Read as the attribute rather than through
      // \`checkVisibility()\`, which by default answers a different question
      // (\`display: none\` and detachment) and would report an
      // \`aria-hidden\` overlay as visible.
      barTitleAriaHidden: barTitle ? barTitle.getAttribute('aria-hidden') : null,
      barTitleOpacity: barTitle ? getComputedStyle(barTitle).opacity : null,
      barTitleText: barTitle ? barTitle.textContent.trim() : null,
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
  if (info.barTitleAriaHidden !== 'true') {
    problems.push(`#barTitle's aria-hidden is ${JSON.stringify(info.barTitleAriaHidden)} on the games view, want "true" `
      + `-- a screen reader hears ${JSON.stringify(info.barTitleText)} from it a second time`);
  }
  if (parseFloat(info.barTitleOpacity) !== 0) {
    problems.push(`#barTitle is painted at opacity ${info.barTitleOpacity} at the top of the game screen, want 0 `
      + '-- the large title has not gone anywhere yet, so the header copy must not be showing');
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
