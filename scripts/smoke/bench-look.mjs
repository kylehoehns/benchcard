/* #138, "What would settle it" items 1-9: bench mode's own restyle. The
 * Proof section calls for a browser check reading computed styles and text
 * on the rich fixture, 390x844, light and dark -- none of this is decidable
 * from source: `--tint`/`--ink`/`--sheet`/`--surface` are runtime color-mix
 * and theme-conditional, the round chip fills are the same
 * translucent-blur-plus-fallback technique `floating-controls.mjs` already
 * audits for the header/foot chrome, and whether a text node's color really
 * lands on the ink or muted token (not a stray player color) is only true
 * once the cascade has run.
 *
 * `benchHeaderText`/`nextAt` (gamemode.js) already have `node --test` cases
 * for their own string logic (test/gamemode-bench-text.test.js) -- this file
 * does not re-derive those strings, it reads what the DOM actually painted
 * and, where the spec itself gives a literal ("Next change at 4:00", "Next
 * change at Q2 8:00"), checks against that literal rather than a value
 * computed the same way the source computes it.
 *
 * Light and dark are the app's OWN `ui.theme` record (`goRich`'s third
 * argument), not an emulated `prefers-color-scheme` -- the same mechanism
 * `finish-game.mjs`'s item 5 already uses for the same reason: RICH boots
 * onto the record it was given, `prefers-color-scheme` never enters into it. */
import { evalIn, step, setWidth, WIDTH, HEIGHT, alpha, SOLID_FALLBACK_MEDIA, CSS_VAR_COLOR_PROBE, TODAY_HOME, navigateAndWaitForCard, OVERFLOW_PROBE, WORD_FLOOR_FN } from './dom.mjs';
import { goRich, RICH, seeded } from './fixtures.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';

// Same shape as CSS_VAR_COLOR_PROBE (dom.mjs) but for `color`, not
// `background-color` -- item 6 asks about TEXT color inside #gmNext, and
// there is no shared text-color probe yet worth promoting for one caller.
const TEXT_VAR_COLOR_PROBE = `(v => {
  const d = document.createElement('div');
  d.style.color = v;
  document.body.appendChild(d);
  const c = getComputedStyle(d).color;
  d.remove();
  return c;
})`;

// A var()'s own computed font-size, the same probe technique -- item 4 asks
// for the 22px step (`--fs-title`) without hard-coding the pixel value.
const FONT_VAR_PROBE = `(v => {
  const d = document.createElement('div');
  d.style.fontSize = v;
  document.body.appendChild(d);
  const s = getComputedStyle(d).fontSize;
  d.remove();
  return s;
})`;

const OPEN_BENCH = `document.querySelector('#gmOpen').click()`;

async function runTheme(c, origin, theme, problems, notes) {
  const tag = m => `(${theme}) ${m}`;
  let measured = 0;

  await goRich(c, origin, { theme });

  const tint = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})('var(--tint)')`);
  const surface = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})('var(--surface)')`);
  const sheet = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})('var(--sheet)')`);
  const inkText = await evalIn(c, `(${TEXT_VAR_COLOR_PROBE})('var(--ink)')`);
  const mutedText = await evalIn(c, `(${TEXT_VAR_COLOR_PROBE})('var(--muted)')`);
  const titleFont = await evalIn(c, `(${FONT_VAR_PROBE})('var(--fs-title)')`);
  const bodyFont = await evalIn(c, `(${FONT_VAR_PROBE})('var(--fs-body)')`);

  await evalIn(c, step(OPEN_BENCH));

  /* ---- item 1: the header ---- */
  const hdr = JSON.parse(await evalIn(c, `(() => {
    const x = document.getElementById('gmClose'), fill = x.querySelector('.i');
    const xr = x.getBoundingClientRect(), fr = fill.getBoundingClientRect();
    const cs = getComputedStyle(fill);
    return JSON.stringify({
      gmGame: document.getElementById('gmGame').textContent,
      gmClock: document.getElementById('gmClock').textContent,
      headerText: document.querySelector('.gm-bar').textContent,
      ariaLabel: x.getAttribute('aria-label'),
      xHit: { w: xr.width, h: xr.height },
      fillRadius: cs.borderTopLeftRadius,
      fillH: fr.height,
      fillVisible: cs.backgroundColor,
    });
  })()`));
  if (hdr.gmGame !== 'Q1 · 8:00 to 4:00') problems.push(tag(`item 1: #gmGame reads ${JSON.stringify(hdr.gmGame)}, want "Q1 · 8:00 to 4:00"`));
  if (hdr.gmClock !== '1 of 8') problems.push(tag(`item 1: #gmClock reads ${JSON.stringify(hdr.gmClock)}, want "1 of 8"`));
  if (/vs Hawks|stint/i.test(hdr.headerText)) problems.push(tag(`item 1: .gm-bar still reads ${JSON.stringify(hdr.headerText)}, "vs Hawks"/"stint" should be gone`));
  if (hdr.ariaLabel !== 'Leave bench mode') problems.push(tag(`item 1: #gmClose aria-label is ${JSON.stringify(hdr.ariaLabel)}, want "Leave bench mode"`));
  if (hdr.xHit.w < 48 || hdr.xHit.h < 48) problems.push(tag(`item 1: #gmClose hit area is ${Math.round(hdr.xHit.w)}x${Math.round(hdr.xHit.h)}, want >=48x48`));
  if (Math.abs(hdr.xHit.w - hdr.xHit.h) > 0.5) problems.push(tag(`item 1: #gmClose is ${hdr.xHit.w}x${hdr.xHit.h}, want width == height`));
  if (!(parseFloat(hdr.fillRadius) >= hdr.fillH / 2 - 0.5)) problems.push(tag(`item 1: #gmClose's fill has border-radius ${hdr.fillRadius} on a ${Math.round(hdr.fillH)}px chip, want at least half its height`));
  if (alpha(hdr.fillVisible) === 0) problems.push(tag(`item 1: #gmClose's fill paints ${hdr.fillVisible}, want a visible fill`));
  else measured++;

  // #gmReset is round the same way, once an override makes it show. Swap a
  // floor player out for a bench one -- default scope is "this stint", so
  // the tap alone writes an override, no scope button needed.
  await evalIn(c, step(`document.querySelector('#gmFloor .gm-p').click()`));
  await evalIn(c, step(`document.querySelector('#gmBench .gm-b').click()`));
  const reset = JSON.parse(await evalIn(c, `(() => {
    const r = document.getElementById('gmReset');
    if (r.hidden) return JSON.stringify({ hidden: true });
    const fill = r.querySelector('.i');
    const rr = r.getBoundingClientRect(), fr = fill.getBoundingClientRect();
    const cs = getComputedStyle(fill);
    return JSON.stringify({ hidden: false, w: rr.width, h: rr.height, radius: cs.borderTopLeftRadius, fillH: fr.height });
  })()`));
  if (reset.hidden) problems.push(tag('item 1: #gmReset never showed after a swap, so its round shape could not be measured'));
  else {
    measured++;
    if (reset.w < 48 || reset.h < 48) problems.push(tag(`item 1: #gmReset hit area is ${Math.round(reset.w)}x${Math.round(reset.h)}, want >=48x48`));
    if (Math.abs(reset.w - reset.h) > 0.5) problems.push(tag(`item 1: #gmReset is ${reset.w}x${reset.h}, want width == height`));
    if (!(parseFloat(reset.radius) >= reset.fillH / 2 - 0.5)) problems.push(tag(`item 1: #gmReset's fill has border-radius ${reset.radius} on a ${Math.round(reset.fillH)}px chip, want at least half its height`));
  }
  // undo the swap so the rest of this pass sees a clean stint 1
  await evalIn(c, step(`document.getElementById('gmReset').click()`));
  notes.push(tag('item 1: header title/subtitle, #gmClose and #gmReset are round 48px chips'));

  /* ---- item 2: no uppercase or letter-spaced text anywhere in #gamemode ---- */
  const caseOffenders = JSON.parse(await evalIn(c, `(() => {
    const bad = [];
    for (const el of document.querySelectorAll('#gamemode *')) {
      const cs = getComputedStyle(el);
      if (cs.textTransform === 'uppercase') bad.push((el.id ? '#' + el.id : el.className) + ' text-transform: uppercase');
      const ls = parseFloat(cs.letterSpacing);
      if (Number.isFinite(ls) && ls > 0) bad.push((el.id ? '#' + el.id : el.className) + ' letter-spacing: ' + cs.letterSpacing);
    }
    return JSON.stringify(bad);
  })()`));
  if (caseOffenders.length) problems.push(tag(`item 2: ${caseOffenders.length} element(s) still uppercase/letter-spaced: ${caseOffenders.slice(0, 4).join(', ')}`));
  else measured++;
  notes.push(tag('item 2: no uppercase or positive letter-spacing inside #gamemode'));

  /* ---- item 3: no lines, no opaque bar, foot floats with a fade ---- */
  const chrome = JSON.parse(await evalIn(c, `(() => {
    const noBorder = (el, side) => parseFloat(getComputedStyle(el)['border' + side + 'Width']);
    const bar = document.querySelector('.gm-bar'), foot = document.querySelector('.gm-foot');
    const before = getComputedStyle(foot, '::before');
    const inertRows = [...document.querySelectorAll('.gm-b.inert')];
    return JSON.stringify({
      barBottom: noBorder(bar, 'Bottom'),
      footTop: noBorder(foot, 'Top'),
      barBg: getComputedStyle(bar).backgroundColor,
      footBg: getComputedStyle(foot).backgroundColor,
      beforeBf: before.backdropFilter || before.webkitBackdropFilter,
      beforeMask: before.maskImage || before.webkitMaskImage,
      rowSeparators: inertRows.slice(0, -1).map(r => getComputedStyle(r).boxShadow),
    });
  })()`));
  if (chrome.barBottom !== 0) problems.push(tag(`item 3: .gm-bar has a ${chrome.barBottom}px bottom border, want 0`));
  if (chrome.footTop !== 0) problems.push(tag(`item 3: .gm-foot has a ${chrome.footTop}px top border, want 0`));
  if (alpha(chrome.barBg) !== 0 && alpha(chrome.barBg) !== null) problems.push(tag(`item 3: .gm-bar itself paints ${chrome.barBg}, want the fade on ::before only`));
  if (alpha(chrome.footBg) !== 0 && alpha(chrome.footBg) !== null) problems.push(tag(`item 3: .gm-foot itself paints ${chrome.footBg}, want the fade on ::before only`));
  if (!chrome.beforeBf || chrome.beforeBf === 'none') problems.push(tag(`item 3: .gm-foot::before backdrop-filter is ${chrome.beforeBf}, want a blur`));
  if (!chrome.beforeMask || chrome.beforeMask === 'none') problems.push(tag('item 3: .gm-foot::before has no mask-image, want a fade toward the content'));
  if (!chrome.rowSeparators.length) problems.push(tag('item 3: no bench-row separators found to check'));
  else if (chrome.rowSeparators.some(s => s === 'none')) problems.push(tag('item 3: a bench row separator is gone (box-shadow: none)'));
  else measured++;
  notes.push(tag('item 3: no bar/foot borders, the foot floats on a blurred, masked ::before, bench separators stay'));

  // solid fallback: same two media features floating-controls.mjs checks
  for (const [feature, value] of SOLID_FALLBACK_MEDIA) {
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: feature, value }] });
    const solid = JSON.parse(await evalIn(c, `(() => {
      const before = getComputedStyle(document.querySelector('.gm-foot'), '::before');
      return JSON.stringify({ bf: before.backdropFilter || before.webkitBackdropFilter, bg: before.backgroundColor });
    })()`));
    if (solid.bf && solid.bf !== 'none') problems.push(tag(`item 3 (${feature}): .gm-foot::before still has backdrop-filter ${solid.bf}, want none`));
    if (alpha(solid.bg) !== 1) problems.push(tag(`item 3 (${feature}): .gm-foot::before paints ${solid.bg}, want fully opaque`));
  }
  await c.send('Emulation.setEmulatedMedia', { features: [] });
  notes.push(tag('item 3: .gm-foot::before turns solid under reduced transparency / more contrast'));

  /* ---- item 4: floor rows, unselected and selected ---- */
  const floor = JSON.parse(await evalIn(c, `(() => {
    const rows = [...document.querySelectorAll('#gmFloor .gm-p')];
    const one = rows[0];
    const cs = getComputedStyle(one);
    const nameCs = getComputedStyle(one.querySelector('.nm'));
    return JSON.stringify({
      count: rows.length,
      bg: cs.backgroundColor,
      borderWidths: ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs['border' + s + 'Width'])),
      borderColor: cs.borderTopColor,
      nameFont: nameCs.fontSize,
      nameWeight: nameCs.fontWeight,
    });
  })()`));
  if (!floor.count) problems.push(tag('item 4: #gmFloor has no rows to check'));
  else {
    measured++;
    if (floor.bg !== surface) problems.push(tag(`item 4: an unselected .gm-p paints ${floor.bg}, want ${surface} (--surface)`));
    const hasVisibleBorder = floor.borderWidths.some(w => w > 0) && alpha(floor.borderColor) > 0;
    if (hasVisibleBorder) problems.push(tag(`item 4: an unselected .gm-p has a visible border (${floor.borderWidths.join('/')}px, ${floor.borderColor})`));
    if (floor.nameFont !== titleFont) problems.push(tag(`item 4: .gm-p .nm font-size is ${floor.nameFont}, want ${titleFont} (--fs-title, the 22px step)`));
    if (floor.nameWeight !== '600') problems.push(tag(`item 4: .gm-p .nm font-weight is ${floor.nameWeight}, want 600 (prototype: .fr .nm)`));
  }
  // select one -- the picked outline
  await evalIn(c, step(`document.querySelector('#gmFloor .gm-p').click()`));
  const picked = JSON.parse(await evalIn(c, `(() => {
    const p = document.querySelector('#gmFloor .gm-p.picked');
    return p ? JSON.stringify(getComputedStyle(p).boxShadow) : JSON.stringify(null);
  })()`));
  if (picked === null) problems.push(tag('item 4: clicking a floor row never produced .gm-p.picked'));
  else {
    measured++;
    if (!picked.includes('inset')) problems.push(tag(`item 4: the picked row's box-shadow is ${picked}, want an inset outline`));
    if (!picked.includes('2px')) problems.push(tag(`item 4: the picked row's box-shadow is ${picked}, want a 2px outline`));
    const tintRgb = tint.match(/[\d.]+/g).slice(0, 3).join(', ');
    if (!picked.includes(tintRgb)) problems.push(tag(`item 4: the picked row's outline color is ${picked}, want ${tint} (--tint / K1)`));
  }
  await evalIn(c, step(`document.querySelector('#gmFloor .gm-p.picked').click()`)); // deselect
  notes.push(tag('item 4: floor rows are surface-filled and borderless; the picked row gets a 2px --tint inset outline'));

  /* ---- item 5: no visible "On the floor" heading; #gmFloor names the numbers ---- */
  const floorA11y = JSON.parse(await evalIn(c, `(() => {
    const headings = [...document.querySelectorAll('#gamemode *')].filter(el =>
      el.children.length === 0 && el.textContent.trim() === 'On the floor');
    return JSON.stringify({
      headings: headings.length,
      floorLabel: document.getElementById('gmFloor').getAttribute('aria-label'),
    });
  })()`));
  if (floorA11y.headings) problems.push(tag(`item 5: a visible "On the floor" heading is still in #gamemode (${floorA11y.headings} match(es))`));
  if (!/played/i.test(floorA11y.floorLabel || '') || !/projected/i.test(floorA11y.floorLabel || '')) {
    problems.push(tag(`item 5: #gmFloor aria-label is ${JSON.stringify(floorA11y.floorLabel)}, want it to say the numbers are minutes played of projected`));
  } else measured++;
  notes.push(tag('item 5: no visible "On the floor" heading; #gmFloor carries the meaning for screen readers'));

  /* ---- item 6: the Next change box, same stint (no period change) ---- */
  const next1 = JSON.parse(await evalIn(c, `(() => {
    const nx = document.getElementById('gmNext');
    const cs = getComputedStyle(nx);
    const cols = [...nx.querySelectorAll('.gm-next-col')].map(c => ({
      cls: c.className, label: c.querySelector('.gm-next-lb')?.textContent,
      names: [...c.querySelectorAll('.nm')].map(n => n.textContent),
    }));
    const colors = [...nx.querySelectorAll('*')].filter(el => el.textContent.trim() && el.children.length === 0)
      .map(el => getComputedStyle(el).color);
    return JSON.stringify({
      border: parseFloat(cs.borderTopWidth), bg: cs.backgroundColor,
      hd: nx.querySelector('.gm-next-hd')?.textContent,
      hdWeight: nx.querySelector('.gm-next-hd') ? getComputedStyle(nx.querySelector('.gm-next-hd')).fontWeight : null,
      icons: nx.querySelectorAll('svg, [data-icon]').length,
      cols, colors,
    });
  })()`));
  if (next1.border !== 0) problems.push(tag(`item 6: #gmNext has a ${next1.border}px border, want 0`));
  if (next1.bg !== sheet) problems.push(tag(`item 6: #gmNext paints ${next1.bg}, want ${sheet} (--sheet)`));
  if (next1.icons) problems.push(tag(`item 6: #gmNext still has ${next1.icons} icon(s), want none`));
  if (next1.hd !== 'Next change at 4:00') problems.push(tag(`item 6: #gmNext's header reads ${JSON.stringify(next1.hd)}, want "Next change at 4:00"`));
  if (Number(next1.hdWeight) < 600) problems.push(tag(`item 6: #gmNext's header font-weight is ${next1.hdWeight}, want 600`));
  const off1 = next1.cols.find(cl => cl.cls.includes('off')), on1 = next1.cols.find(cl => cl.cls.includes('on'));
  if (!off1 || off1.label !== 'Off') problems.push(tag(`item 6: no "Off" column found (got ${JSON.stringify(off1)})`));
  if (!on1 || on1.label !== 'On') problems.push(tag(`item 6: no "On" column found (got ${JSON.stringify(on1)})`));
  if (!off1?.names.length || !on1?.names.length) problems.push(tag('item 6: the Off/On columns are empty on stint 1, want at least one name each'));
  const stray = next1.colors.filter(cl => cl !== inkText && cl !== mutedText);
  if (stray.length) problems.push(tag(`item 6: #gmNext has text painted ${[...new Set(stray)].join(', ')}, want only --ink/--muted`));
  else measured++;
  notes.push(tag('item 6: #gmNext is a borderless --sheet box, no icons, "Next change at 4:00", Off/On columns, ink/muted text only'));

  /* ---- item 6: cross-period case -- Q1's second stint changes into Q2 ---- */
  await evalIn(c, step(`document.getElementById('gmNext2').click()`));
  const next2hd = await evalIn(c, `document.querySelector('.gm-next-hd').textContent`);
  if (next2hd !== 'Next change at Q2 8:00') problems.push(tag(`item 6: stepping into Q1's last stint reads ${JSON.stringify(next2hd)}, want "Next change at Q2 8:00" (the period carries across a period boundary)`));
  else measured++;
  await evalIn(c, step(`document.getElementById('gmPrev').click()`)); // back to stint 1
  notes.push(tag('item 6: the period name reappears when the next change crosses into a new period'));

  /* ---- item 7: the bench label, unpicked and picked ---- */
  const unpicked = await evalIn(c, `document.getElementById('gmBenchLab').textContent.trim()`);
  if (unpicked !== 'Bench · tap a player on the floor to swap') problems.push(tag(`item 7: #gmBenchLab reads ${JSON.stringify(unpicked)} with nothing picked`));
  else measured++;
  const pickInfo = JSON.parse(await evalIn(c, `(async () => {
    const row = document.querySelector('#gmFloor .gm-p');
    const fullName = row.querySelector('.nm').firstChild.textContent.trim();
    row.click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const lab = document.getElementById('gmBenchLab');
    // just the label's own sentence, not the This stint/Rest of game/Sit
    // for the rest scope buttons appended after it (item 7's last line:
    // that control stays, but it is not part of this sentence).
    const text = [...lab.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
    return JSON.stringify({ fullName, text });
  })()`));
  // callNames() (roster.js) always starts a call name with the player's
  // first name -- their own first/withLast/full forms all do -- so the
  // label's call name is checked against that first token, not a copy of
  // callNames' own collision logic.
  const firstName = pickInfo.fullName.split(' ')[0];
  if (!pickInfo.text.startsWith(`Bench · tap who goes on for ${firstName}`)) {
    problems.push(tag(`item 7: with ${JSON.stringify(pickInfo.fullName)} picked, #gmBenchLab reads ${JSON.stringify(pickInfo.text)}, want it to start with "Bench · tap who goes on for ${firstName}"`));
  } else measured++;
  notes.push(tag('item 7: the bench label reads the unpicked/picked sentences, with the real call name'));

  /* ---- item 8: bench badges filled, no ring ---- */
  const bench8 = JSON.parse(await evalIn(c, `(() => {
    const row = document.querySelector('#gmBench .gm-b');
    const av = row.querySelector('.av'), cs = getComputedStyle(av);
    const c = row.style.getPropertyValue('--c');
    const rowCs = getComputedStyle(row);
    const mn = row.querySelector('.mn');
    const mnCs = getComputedStyle(mn);
    // Every text-bearing node inside .mn EXCEPT .proj (the "/ 8" projected
    // half, whose own muted weight is untouched by this item) -- the played
    // digits are wrapped in a bold tag, whose own font-weight is set by a
    // bare-tag rule regardless of what .mn's class rule sets on the parent
    // span, so reading only .mn's computed style missed a bold digit
    // sitting right inside it.
    const mnNodeWeights = [mn, ...mn.querySelectorAll('*')]
      .filter(n => !n.classList.contains('proj'))
      .filter(n => [...n.childNodes].some(cn => cn.nodeType === 3 && cn.textContent.trim()))
      .map(n => getComputedStyle(n).fontWeight);
    const nmCs = getComputedStyle(row.querySelector('.nm'));
    return JSON.stringify({
      bg: cs.backgroundColor, boxShadow: cs.boxShadow, outlineStyle: cs.outlineStyle, outline: cs.outlineWidth, c,
      rowBorderWidths: ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(rowCs['border' + s + 'Width'])),
      rowBorderStyles: ['Top', 'Right', 'Bottom', 'Left'].map(s => rowCs['border' + s + 'Style']),
      rowOutlineStyle: rowCs.outlineStyle, rowOutlineWidth: rowCs.outlineWidth,
      mnColor: mnCs.color, mnNodeWeights, mnFontSize: mnCs.fontSize,
      nmWeight: nmCs.fontWeight,
    });
  })()`));
  const probeColor = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})(${JSON.stringify(bench8.c || 'transparent')})`);
  if (!bench8.c) problems.push(tag('item 8: a bench row has no --c custom property to check its badge color against'));
  else if (bench8.bg !== probeColor) problems.push(tag(`item 8: a bench badge paints ${bench8.bg}, want ${probeColor} (its own --c, the player's color)`));
  else measured++;
  if (bench8.boxShadow !== 'none') problems.push(tag(`item 8: a bench badge has box-shadow ${bench8.boxShadow}, want none (no outlined ring)`));
  if (bench8.outlineStyle !== 'none' && parseFloat(bench8.outline) > 0) problems.push(tag('item 8: a bench badge has an outline, want none'));
  if (bench8.mnColor !== mutedText) problems.push(tag(`item 8: .gm-b .mn paints ${bench8.mnColor}, want ${mutedText} (--muted, prototype: .bench-l button .m)`));
  if (bench8.mnNodeWeights.some(w => w !== '400')) problems.push(tag(`item 8: .gm-b .mn has a text node at font-weight ${bench8.mnNodeWeights.join('/')}, want 400 throughout (the played digits must not be bold, prototype: .bench-l button .m)`));
  else measured++;
  if (bench8.mnFontSize !== bodyFont) problems.push(tag(`item 8: .gm-b .mn font-size is ${bench8.mnFontSize}, want ${bodyFont} (--fs-body, prototype: 17px)`));
  else measured++;
  if (bench8.nmWeight !== '400') problems.push(tag(`item 8: .gm-b .nm font-weight is ${bench8.nmWeight}, want 400 (prototype: .bench-l button, unbolded)`));
  else measured++;
  // the row itself, in the picked state (a floor player is picked at this
  // point, left live by item 7) -- it must look the same picked or not: no
  // border on any side, no outline, the same list separators as unpicked.
  const rowHasBorder = bench8.rowBorderWidths.some((w, i) => w > 0 && bench8.rowBorderStyles[i] !== 'none');
  if (rowHasBorder) problems.push(tag(`item 8: a picked-state bench row has a border (widths ${bench8.rowBorderWidths.join('/')}px, styles ${bench8.rowBorderStyles.join('/')}), want none -- picked and unpicked rows must look the same`));
  if (bench8.rowOutlineStyle !== 'none' && parseFloat(bench8.rowOutlineWidth) > 0) problems.push(tag(`item 8: a picked-state bench row has an outline (${bench8.rowOutlineWidth} ${bench8.rowOutlineStyle}), want none`));
  if (!rowHasBorder && (bench8.rowOutlineStyle === 'none' || parseFloat(bench8.rowOutlineWidth) === 0)) measured++;
  notes.push(tag("item 8: bench badges are filled with the player's own color, no ring; picked-state rows carry no border/outline either"));

  // deselect the pick this item 7/8 left live
  await evalIn(c, step(`document.querySelector('#gmFloor .gm-p.picked')?.click()`));

  /* ---- item 9: bottom controls ---- */
  const foot = JSON.parse(await evalIn(c, `(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
    const shape = id => { const el = document.getElementById(id); const cs = getComputedStyle(el);
      return { ...rect(el), radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor }; };
    return JSON.stringify({ done: shape('gmDone'), prev: shape('gmPrev'), next2: shape('gmNext2'), dots: !!document.getElementById('gmDots') });
  })()`));
  if (!(foot.done.h >= 48)) problems.push(tag(`item 9: #gmDone is ${Math.round(foot.done.h)}px tall, want >=48`));
  if (!(foot.done.radius >= foot.done.h / 2 - 0.5)) problems.push(tag(`item 9: #gmDone border-radius ${foot.done.radius} on a ${Math.round(foot.done.h)}px pill, want at least half its height`));
  if (foot.done.bg === tint) problems.push(tag(`item 9: #gmDone paints the primary tint ${tint}, want the raised surface`));
  for (const [name, box] of [['prev', foot.prev], ['next2', foot.next2]]) {
    if (box.w < 48 || box.h < 48) problems.push(tag(`item 9: #gm${name} is ${Math.round(box.w)}x${Math.round(box.h)}, want >=48x48`));
    if (Math.abs(box.w - box.h) > 0.5) problems.push(tag(`item 9: #gm${name} is ${box.w}x${box.h}, want width == height (round)`));
    if (!(box.radius >= box.h / 2 - 0.5)) problems.push(tag(`item 9: #gm${name} border-radius ${box.radius} on a ${Math.round(box.h)}px control, want at least half its height`));
  }
  if (foot.next2.bg !== tint) problems.push(tag(`item 9: #gmNext2 paints ${foot.next2.bg}, want ${tint} (--tint, K1's primary fill)`));
  if (foot.prev.bg === tint) problems.push(tag(`item 9: #gmPrev paints the primary tint ${tint}, want the raised surface`));
  if (!foot.dots) problems.push(tag('item 9: #gmDots is gone, want the dot strip to stay'));
  else measured++;
  notes.push(tag('item 9: Done/Finish game are pills, ‹/› are round, › carries --tint, the dots stay'));

  // #gmFinish, the last stint's replacement for ›
  await evalIn(c, step(`while (!document.getElementById('gmNext2').disabled) { document.getElementById('gmNext2').click(); }`));
  const finish = JSON.parse(await evalIn(c, `(() => {
    const el = document.getElementById('gmFinish');
    if (el.hidden) return JSON.stringify({ hidden: true });
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return JSON.stringify({ hidden: false, h: r.height, radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor });
  })()`));
  if (finish.hidden) problems.push(tag('item 9: #gmFinish never showed on the last stint'));
  else {
    measured++;
    if (!(finish.h >= 48)) problems.push(tag(`item 9: #gmFinish is ${Math.round(finish.h)}px tall, want >=48`));
    if (!(finish.radius >= finish.h / 2 - 0.5)) problems.push(tag(`item 9: #gmFinish border-radius ${finish.radius} on a ${Math.round(finish.h)}px pill, want at least half its height`));
    if (finish.bg === tint) problems.push(tag(`item 9: #gmFinish paints the primary tint ${tint}, want a pill like Done (the raised surface)`));
  }
  await evalIn(c, step(`while (!document.getElementById('gmPrev').disabled) { document.getElementById('gmPrev').click(); }`));
  notes.push(tag('item 9: #gmFinish is a pill like Done, not the primary fill'));

  if (measured < 12) problems.push(tag(`only ${measured}/12+ measurements were taken -- a selector stopped matching`));

  await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
}

/* Found on the preview check, not #138's own "What would settle it" list:
 * item 11 only asked the EXISTING 320px/32px rows in `app-large-text.mjs` to
 * keep passing, and every one of them checks an edge running off screen --
 * none reads a name squeezed into a sliver that still sits fully on screen.
 * `.gm-p .nm` is `flex: 1; min-width: 0` (app.css), so at a 32px root the
 * avatar (2.3rem) and the minutes span (`.mn`, itself scaled up) leave the
 * name almost nothing to sit in, and app.css's `overflow-wrap: anywhere`
 * breaks it one letter per line instead of wrapping between words --
 * measured: "Ana Reyes" at `.nm` scrollWidth 29 > clientWidth 13.
 *
 * A real long name is renamed onto `p7` in a RICH clone, the same technique
 * `LONG_NAME`/`reloadWithRecord` (fixtures.mjs) use elsewhere, so the check
 * exercises a name that is long even at 16px, not only ones that only break
 * once the root grows. `reloadWithRecord` itself is not reused here: it waits
 * for `.today-game`, which is right for the callers that reload onto Today,
 * but RICH's own `view` is 'games' and this pass wants the game screen
 * directly, the same place `goRich` above already lands -- so this reseeds
 * with the same `seeded`/`navigateAndWaitForCard` idiom `goRich` itself uses,
 * only with one player's name changed.
 *
 * The middle word is `Featherstonehaugh` (`add-game-fit.mjs` already uses the
 * same surname on `Marcus Featherstonehaugh` as its own too-long-to-fit
 * fixture), not `Christopherson`: CI's fonts render wider than this
 * machine's, and on run 36251254331 `Christopherson` alone (227.4px) came in
 * wider than the row's own content box (209px) -- a case the assertion below
 * is written to accept, but only once it forces that branch. `Christopherson`
 * fit inside the row locally (~196px), so the local run and CI were exercising
 * different code paths for the same fixture. The longer word is wide enough
 * on this machine's own fonts too, so both runs take the same branch. */
const LONG_FLOOR_NAME = 'Bartholomew-Featherstonehaugh Novak';

async function goRichWithLongName(c, origin) {
  const record = JSON.parse(JSON.stringify(RICH));
  const p7 = record.teams[0].players.find(pl => pl.id === 'p7');
  p7.name = LONG_FLOOR_NAME;
  await seeded(c, `(() => {
    localStorage.removeItem('benchcard.v3');
    localStorage.removeItem('benchcard.v7.bak');
    localStorage.setItem('benchcard.v7', ${JSON.stringify(JSON.stringify(record))});
  })()`, async () => {
    await navigateAndWaitForCard(c, origin + '/index.html');
  });
}

/* Measures the longest SINGLE WORD of a name against the box it is actually
 * painted in -- the falsifier for "no line break inside a word" -- by
 * rendering each word off-screen in a throwaway span that copies the real
 * element's `font` shorthand and `letter-spacing`, so the measurement uses
 * the same face/size/weight the row itself paints, not a guessed one. Reads
 * only the DIRECT text nodes of `.nm` (excluding a `.tag` child, "just on"),
 * the same technique item 7 above already uses for the bench label's own
 * sentence.
 *
 * CI finding (run 36251254331): a word can be wider than the row itself has
 * room for -- `Christopherson` at 227.4px against a 209px row on CI's fonts
 * -- and no layout can show that whole without either breaking it or running
 * it off the row. That is not the defect this exists to catch (names
 * squeezed into a sliver by their SIBLINGS); the defect is the name not
 * getting the row's own full content box. So the floor each name is held to
 * is `min(longest word, the row's own content-box width)`, not the longest
 * word outright -- `row.clientWidth` less its own left/right padding, read
 * from the row itself (`.gm-p`/`.gm-b`), independent of whatever the avatar
 * or minutes beside it are doing today. A name still has to stay fully
 * inside its row and the viewport either way (`contained`); that is the
 * other half of "still visible" when a word cannot fit whole.
 *
 * The measuring itself (`measureWord`, the floor, `contained`) is
 * `WORD_FLOOR_FN` (`dom.mjs`) now -- #144's own filed-game titles and
 * opened-game names need the identical floor against a different pair of
 * selectors, and this file's own copy became the shared one rather than
 * leaving a second hand-typed probe beside it. */
const NAME_WORD_PROBE = `(() => {
  ${WORD_FLOOR_FN}
  const rows = wordFloorRows('#gmFloor .gm-p .nm, #gmBench .gm-b .nm', '.gm-p, .gm-b');
  // The visible FILL ('.i', the translucent circle a coach actually sees),
  // not #gmClose's own 48px hit box: the hit box is a fixed 48px regardless
  // of root text size, but the fill is sized in rem (2.25rem) and at a 32px
  // root paints larger than its own button, bleeding into whatever sits
  // beside it -- the actual shape of this defect (screenshot: the circle
  // paints over the title's wrapped second line).
  const close = document.querySelector('#gmClose .i').getBoundingClientRect();
  const title = document.querySelector('.gm-title').getBoundingClientRect();
  const overlap = !(close.right <= title.left || close.left >= title.right ||
                     close.bottom <= title.top || close.top >= title.bottom);
  return JSON.stringify({
    rows, overlap,
    close: { l: Math.round(close.left), r: Math.round(close.right), t: Math.round(close.top), b: Math.round(close.bottom) },
    title: { l: Math.round(title.left), r: Math.round(title.right), t: Math.round(title.top), b: Math.round(title.bottom) },
  });
})()`;

async function runLargeText(c, origin, problems, notes) {
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await goRichWithLongName(c, origin);
    await evalIn(c, step(OPEN_BENCH));

    const r = JSON.parse(await evalIn(c, NAME_WORD_PROBE));
    const where = `${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;

    if (!r.rows.length) {
      // rule 2a of /new-guard: a check that measured nothing fails.
      problems.push(`${where}: no floor or bench name was on screen to measure`);
    } else {
      for (const row of r.rows) {
        if (row.width + 1 < row.floor) {
          problems.push(`${where}: "${row.text}" is ${Math.round(row.width)}px wide, `
            + `narrower than min(its longest word ${row.longest}px, its row's own content width `
            + `${row.rowContent}px) = ${Math.round(row.floor)}px -- something beside the name is `
            + `taking its space`);
        }
        if (!row.contained) {
          problems.push(`${where}: "${row.text}" paints outside its own row or the viewport`);
        }
      }
      if (!r.rows.some(row => row.text === LONG_FLOOR_NAME)) {
        problems.push(`${where}: "${LONG_FLOOR_NAME}" never appeared among the measured floor/bench names`);
      }
    }
    if (r.overlap) {
      problems.push(`${where}: #gmClose ${JSON.stringify(r.close)} overlaps .gm-title ${JSON.stringify(r.title)}`);
    }
    const ov = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
    if (ov.pans || ov.worst) {
      problems.push(`${where}: the page itself scrolls or overflows horizontally: ${JSON.stringify(ov)}`);
    }
    notes.push(`${where}: every floor/bench name gets at least its row's own content width or its `
      + `longest word (whichever is smaller), stays on screen, #gmClose does not overlap the title, `
      + `and the page does not pan sideways`);
  } finally {
    // Same rule the other large-text passes follow: never leave the emulated
    // font size on for whatever runs after this one.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await evalIn(c, step(`document.getElementById('gmClose')?.click()`)).catch(() => {});
  }
}

export async function benchLookPass(c, origin) {
  const problems = [];
  const notes = [];

  try {
    for (const theme of ['light', 'dark']) {
      await runTheme(c, origin, theme, problems, notes);
    }
    await runLargeText(c, origin, problems, notes);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    await setWidth(c, WIDTH);
    await evalIn(c, step(`document.getElementById('gmClose')?.click()`));
    await evalIn(c, step(TODAY_HOME));
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}${problems.length > 4 ? ` (+${problems.length - 4} more)` : ''}`
      : notes.filter(n => n.startsWith('(light)')).join('; '),
  };
}
