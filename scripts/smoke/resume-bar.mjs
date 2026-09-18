/* #34, "What would settle it" items 1-6: the floating resume bar itself.
 * Item 7 (which game `resumeBarAt()` picks) is a pure function, proved under
 * `node --test` at test/resume-bar.test.js -- everything here is what only a
 * browser can answer: the label actually painted, a real tap opening bench
 * mode on the right stint, the bar hiding and reappearing around it, staying
 * hidden everywhere it should, surviving a reload without reopening bench
 * mode itself, its geometry and solid fallbacks at three widths, and focus
 * never landing under it.
 *
 * The fixture is `partPlayed(RICH)` (fixtures.mjs, decision 14): BOTH of
 * RICH's games mid-play, so "picks the game that's underway" and "picks the
 * LATER one" are actually different claims -- a fixture with only one
 * part-played game could not tell them apart. */
import { evalIn, step, SETTLE, TODAY_HOME, WIDTH, HEIGHT, landWiped } from './dom.mjs';
import { nameOf } from './registry.mjs';
import { OVERLAPS } from './focus-clear.mjs';
import { VIEWS as SCREENS } from './sweep.mjs';
import { RICH, partPlayed, reloadWithRecord, goRich } from './fixtures.mjs';

const alpha = c => {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return null;
  const parts = m[1].split(/[,/]/).map(s => s.trim());
  return parts.length > 3 ? Number(parts[3]) : 1;
};

// Decision 14's exact fixture and item 1's exact string -- the SECOND
// game's label, "Northwest Valley Thunderbirds", not the first's "Hawks".
const EXPECT_LABEL = 'Northwest Valley Thunderbirds · Q2 4:00 · Resume';

export async function resumeBarPass(c, origin) {
  const problems = [];
  const notes = [];

  /* ---- item 1: which game, and the exact label ---- */
  const rec1 = partPlayed(RICH);
  rec1.view = 'today';
  await reloadWithRecord(c, origin, rec1);
  const ac1 = JSON.parse(await evalIn(c, `(() => {
    const bar = document.getElementById('resumeBar');
    const btn = document.getElementById('resumeBtn');
    return JSON.stringify({
      hidden: bar ? bar.hidden : null,
      label: btn ? (btn.querySelector('.ab-lab')?.textContent ?? null) : null,
    });
  })()`));
  if (ac1.hidden !== false) {
    problems.push(`#resumeBar is ${ac1.hidden === null ? 'missing from the document' : 'hidden'} `
      + 'on Today with two part-played games, want visible');
  } else if (ac1.label !== EXPECT_LABEL) {
    problems.push(`#resumeBtn reads ${JSON.stringify(ac1.label)}, want ${JSON.stringify(EXPECT_LABEL)} `
      + '-- the SECOND game, not the first');
  }
  notes.push('item 1: names the later part-played game');

  /* ---- item 2: a tap opens bench mode on the right stint, hides the bar,
     and closing it lands back on Today with the bar showing again ---- */
  await evalIn(c, step(`document.getElementById('resumeBtn').click()`));
  const opened = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    gmHidden: document.getElementById('gamemode')?.hidden,
    gmGame: document.getElementById('gmGame')?.textContent || '',
    barHidden: document.getElementById('resumeBar')?.hidden,
  }))()`));
  if (opened.gmHidden !== false) problems.push('tapping #resumeBtn did not open bench mode (#gamemode is still hidden)');
  if (!/stint 4 of 8/.test(opened.gmGame)) {
    problems.push(`#gmGame reads ${JSON.stringify(opened.gmGame)}, want it to say "stint 4 of 8" -- live.at is 3, zero-based`);
  }
  if (opened.barHidden !== true) problems.push('#resumeBar is still showing once bench mode is open');

  await evalIn(c, step(`document.getElementById('gmClose').click()`));
  const closed = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    gmHidden: document.getElementById('gamemode')?.hidden,
    barHidden: document.getElementById('resumeBar')?.hidden,
    onToday: !document.getElementById('view-today')?.hidden,
  }))()`));
  if (closed.gmHidden !== true) problems.push('closing bench mode left #gamemode open');
  if (closed.barHidden !== false) problems.push('#resumeBar did not come back once bench mode closed');
  if (!closed.onToday) problems.push('closing bench mode did not land back on Today (#view-today is hidden)');
  notes.push('item 2: resumes on stint 4 of 8, hides while open, returns on close');

  /* ---- item 3: hidden everywhere else ---- */
  for (const { name: screen, open } of SCREENS.filter(v => v.name !== 'today')) {
    await evalIn(c, step(TODAY_HOME));
    await evalIn(c, step(open));
    const h = await evalIn(c, `document.getElementById('resumeBar')?.hidden`);
    if (h !== true) problems.push(`#resumeBar is not hidden on ${screen}`);
  }
  await evalIn(c, step(TODAY_HOME));

  const plainToday = { ...RICH, view: 'today' };
  await reloadWithRecord(c, origin, plainToday);
  const plainHidden = await evalIn(c, `document.getElementById('resumeBar')?.hidden`);
  if (plainHidden !== true) problems.push('#resumeBar is showing on Today with no part-played game');

  await landWiped(c, origin + '/index.html',
    "document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden");
  const fr = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    barHidden: document.getElementById('resumeBar')?.hidden,
    welcomeShown: !document.getElementById('view-welcome')?.hidden,
  }))()`));
  if (!fr.welcomeShown) problems.push('first run did not land on #view-welcome -- this check measured the wrong screen');
  else if (fr.barHidden !== true) problems.push('#resumeBar is showing on first run');
  notes.push('item 3: hidden on every other screen, a plain Today, and first run');

  /* ---- item 4: a reload with a part-played game does not reopen bench mode ---- */
  const rec4 = partPlayed(RICH);
  rec4.view = 'today';
  await reloadWithRecord(c, origin, rec4);
  const ac4 = await evalIn(c, `document.getElementById('gamemode')?.hidden`);
  if (ac4 !== true) problems.push('a reload with a part-played game left #gamemode open -- it must only open when the coach taps');
  notes.push('item 4: no auto-open on reload');

  /* ---- item 5: geometry at 320/360/390px, and the solid fallbacks ---- */
  for (const w of [320, 360, 390]) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await evalIn(c, `${SETTLE}`);
    const geo = JSON.parse(await evalIn(c, `(() => {
      const bar = document.getElementById('resumeBar'), btn = document.getElementById('resumeBtn');
      const br = bar.getBoundingClientRect(), cs = getComputedStyle(bar);
      const inner = br.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return JSON.stringify({ h: br.height, btnW: btn.getBoundingClientRect().width, inner });
    })()`));
    if (geo.h < 48) problems.push(`${w}px: #resumeBar is ${Math.round(geo.h)}px tall, want at least 48px`);
    if (Math.abs(geo.btnW - geo.inner) > 1) {
      problems.push(`${w}px: #resumeBtn is ${Math.round(geo.btnW)}px inside a ${Math.round(geo.inner)}px content box, want full width`);
    }
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await evalIn(c, `${SETTLE}`);

  for (const [feature, value] of [['prefers-reduced-transparency', 'reduce'], ['prefers-contrast', 'more']]) {
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: feature, value }] });
    await evalIn(c, `${SETTLE}`);
    const solid = JSON.parse(await evalIn(c, `(() => {
      const cs = getComputedStyle(document.getElementById('resumeBar'), '::before');
      return JSON.stringify({ bf: cs.backdropFilter || cs.webkitBackdropFilter, bg: cs.backgroundColor });
    })()`));
    if (solid.bf && solid.bf !== 'none') problems.push(`${feature}: #resumeBar::before still has backdrop-filter ${solid.bf}, want none`);
    const a = alpha(solid.bg);
    if (a !== 1) problems.push(`${feature}: #resumeBar::before paints ${solid.bg} (alpha ${a}), want a fully opaque color`);
  }
  await c.send('Emulation.setEmulatedMedia', { features: [] });
  await evalIn(c, `${SETTLE}`);
  notes.push('item 5: ≥48px tall and full width at 320-390px; solid under reduced transparency and more contrast');

  /* ---- item 6: scroll-padding-bottom covers it, and focus never lands
     under it ---- */
  const scrollPad = JSON.parse(await evalIn(c, `(() => JSON.stringify({
    pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
    barH: document.getElementById('resumeBar').getBoundingClientRect().height,
  }))()`));
  if (scrollPad.pad + 0.5 < scrollPad.barH) {
    problems.push(`html's scroll-padding-bottom is ${Math.round(scrollPad.pad)}px, want at least #resumeBar's ${Math.round(scrollPad.barH)}px`);
  }

  /* The probe carries `data-resumetabbed` from the moment it is created, not
     only once Tab has left it: without that, a lap that runs out of forward
     content wraps around the whole document and lands back on the probe
     itself, which the walk then counted as an ordinary NEW control (it read
     `input#__resumeFocusProbe` back as if a coach could tab to it) -- a
     bookkeeping artefact, not a control on the page. Marking it up front
     makes the wrap a `done`, the same way any other already-visited element
     stops the walk. */
  await evalIn(c, `(() => {
    const p = document.createElement('input');
    p.id = '__resumeFocusProbe';
    p.setAttribute('data-resumetabbed', '1');
    document.getElementById('view-today').prepend(p);
    p.focus();
  })()`);
  let visited = 0;
  const overlaps = [];
  const labels = [];
  for (let i = 0; i < 80; i++) {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    const info = JSON.parse(await evalIn(c, `(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.hasAttribute('data-resumetabbed')) return JSON.stringify({ done: true });
      /* The probe is prepended INSIDE #view-today, so DOM order puts
         #barToday's own controls (team switcher, New day, the gear) before
         it -- a forward-only tab walk starting there never reaches them on
         a normal lap. A lap that runs off the end of the document instead
         WRAPS back around past them before it reaches the marked probe
         above, which would otherwise count three chrome buttons that live
         outside Today as if they were Today's own content. Skipping '.bar'
         the same way '#resumeBar' is already skipped keeps the count the
         same whether or not a given run happens to wrap. */
      if (el.closest('#resumeBar') || el.closest('.bar')) return JSON.stringify({ inChrome: true });
      el.setAttribute('data-resumetabbed', '1');
      const r = el.getBoundingClientRect();
      const bar = document.getElementById('resumeBar')?.getBoundingClientRect();
      const overlaps = ${OVERLAPS};
      const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
      return JSON.stringify({ label, overlapsBar: overlaps(r, bar) });
    })()`));
    if (info.done) break;
    if (info.inChrome) continue;
    visited++;
    labels.push(info.label);
    if (info.overlapsBar) overlaps.push(`${info.label} overlaps #resumeBar (control ${visited} of the tab sequence)`);
  }
  await evalIn(c, `(() => {
    document.getElementById('__resumeFocusProbe')?.remove();
    for (const el of document.querySelectorAll('[data-resumetabbed]')) el.removeAttribute('data-resumetabbed');
  })()`);
  /* The floor, verified on this tree 2026-09-18 by printing this same
     `labels` list from both seams the Proof section names: `node
     scripts/smoke.mjs --only "resume bar on Today"` and the full `npm run
     smoke -- --no-tests`. Both agree on exactly five, in the same order --
     two game passes (`#todayGames`, RICH plus `partPlayed` gives two),
     `#todayAddGame`, `#todayTeam`, `#todaySeason`. That is everything
     `#view-today` paints; `#resumeBtn` is deliberately skipped above (it is
     the control this item exists to check, not a stand-in for one), and
     `#barToday`'s three chrome buttons are excluded above too, for the
     reason given there. Five is therefore the true count, not a number
     chosen to make a failing run pass: MIN_CONTROLS 8 was calibrated
     against an isolated run that, before the fix above, wrapped a lap
     around the whole document and mis-counted the chrome and its own probe
     as Today's controls. */
  const MIN_CONTROLS = 5;
  if (visited < MIN_CONTROLS) {
    problems.push(`only ${visited} distinct control(s) reached tabbing Today (${labels.join(', ') || 'none'}), `
      + `want at least ${MIN_CONTROLS} -- a run that measured nothing is not a pass`);
  }
  problems.push(...overlaps.slice(0, 3));
  notes.push(`item 6: scroll-padding covers the bar; ${visited} control(s) tabbed clear of it: ${labels.join(', ')}`);

  // Restore the plain fixture: this row runs between `floatingcontrols` and
  // `narrow` in a full run, and every row after it assumes RICH's own two
  // games, neither part-played, on the Games view.
  await goRich(c, origin);

  return {
    name: nameOf('resumebar'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}${problems.length > 4 ? ` (+${problems.length - 4} more)` : ''}`
      : notes.join('; '),
  };
}
