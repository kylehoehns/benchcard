import { evalIn, SETTLE, HEIGHT, landWiped } from './dom.mjs';
import { goRich } from './fixtures.mjs';
import { nameOf } from './registry.mjs';

/* [data-id] excludes the boot skeleton's bare `.tl-row` markup, the same
   filter `tryLanding` already relies on for its own player count (see that
   file's comment on the same point). Shared by every in-page selector below
   so the two strings live in one place. */
const ROW_SEL = '#timeline .tl-row[data-id]';
const NAME_SEL = `${ROW_SEL} .tl-name`;

/* #72 ("Fit all 9 player rows on the game screen"), Proof section, first
   bullet: covers items 1 (all 9 rows, and Start game, on screen with no
   scrolling) and 3 (the name button's own tap-target geometry).

   THE LANDING shares its wipe -> navigate -> wait -> cleanup shape with
   `tryLanding` (`app-large-text.mjs`) through `landWiped` (`dom.mjs`), which
   owns that shape now; this function only supplies the URL and the wait
   condition. It does not call `tryLanding` itself: that function's own
   assertions are about the sample-flash toast, not the rows underneath it,
   and a `?try=9` link is the one path this app ships that lands nine
   players straight onto the games view with no rich fixture to build first
   (`onboarding.js`'s `initOnboarding` reads `try` only while
   `state.onboarded` is false, so the wipe has to come first, and
   `browserChecks`'s own on-new-document script would otherwise re-seed
   `benchcard.v3` ahead of it — see `landWiped`'s own comment for both
   facts). The wait condition differs on purpose: `tryLanding` waits for the
   toast; this waits for the ninth row, which is the thing this check reads.

   LIGHT AND DARK, because item 1 and item 3 are both geometry, and a
   dark-only rule (there is none today, but nothing here would catch one
   appearing) could otherwise pass this check while failing a coach whose
   phone is in dark mode. `Emulation.setEmulatedMedia` drives
   `prefers-color-scheme` before the wiped landing — the app has no seeded
   theme at that point, so `theme: 'auto'` (its default) reads the media
   query with nothing else to override it.

   THE FIXTURE IS RESTORED at the end regardless of outcome, the same
   courtesy every rich-fixture pass in this suite pays: this check runs
   between `fixture` and `todayback` in `browserChecks`'s sequence, and
   everything after it expects `RICH`, not a freshly wiped nine-player
   sample. */
async function landOnNine(c, origin) {
  await landWiped(c, `${origin}/index.html?try=9`, `document.querySelectorAll('${ROW_SEL}').length >= 9`);
}

const MEASURE = `(() => {
  const rows = [...document.querySelectorAll('${ROW_SEL}')]
    .map(r => r.getBoundingClientRect());
  const names = [...document.querySelectorAll('${NAME_SEL}')]
    .map(r => r.getBoundingClientRect());
  const ab = document.getElementById('actionbar');
  const bench = document.getElementById('abBench');
  const round = n => Math.round(n * 100) / 100;
  const rect = r => r && { l: round(r.left), r: round(r.right), t: round(r.top), b: round(r.bottom), w: round(r.width), h: round(r.height) };
  return JSON.stringify({
    count: rows.length,
    rows: rows.map(rect),
    names: names.map(rect),
    ab: rect(ab && ab.getBoundingClientRect()),
    bench: rect(bench && bench.getBoundingClientRect()),
    scrollY: window.scrollY,
    vh: document.documentElement.clientHeight,
  });
})()`;

/* Item 1: every row between the top of the screen and `#actionbar`'s own
   top, `#abBench` entirely on screen, and the page not scrolled to get
   there. Item 3: each `.tl-name` at least 48px wide and at least
   `min(48, pitch) − 0.5` tall, per the spec's own formula — `pitch` is the
   distance from this row's top to the next row's top (or, for the ninth
   row, from the previous row's, since there is no next one to measure
   against), the same "row pitch" the one-row layout in app.css is built to
   a 2.25rem number for. Consecutive name buttons must not overlap either,
   since a button reaching into the next row's space would be reachable but
   would mis-tap into the wrong player.

   The pitch here is read off `m.rows` (the `.tl-row` rects), the same
   element `rowPitch` in `scripts/smoke-checks.js` measures, and the same
   formula -- next row's top minus this row's, or this row's minus the
   previous row's for the last one -- so the two never drift apart. It is
   only applied to the `.tl-name` height (`m.names`), since item 3 is about
   the button's own tap-target size, not the row's. */
function problemsFor(scheme, m) {
  const problems = [];
  if (m.count !== 9) { problems.push(`${scheme}: ${m.count} rows carry a data-id, not 9`); return problems; }
  if (m.scrollY !== 0) problems.push(`${scheme}: the page is scrolled ${m.scrollY}px to see the rows -- item 1 asks for all 9 with no scrolling`);
  const abTop = m.ab && m.ab.t;
  m.rows.forEach((r, i) => {
    if (r.t < -0.5) problems.push(`${scheme}: row ${i + 1} starts at y ${r.t}, above the top of the screen`);
    if (abTop != null && r.b > abTop + 0.5) problems.push(`${scheme}: row ${i + 1} ends at y ${r.b}, past #actionbar's top (${abTop})`);
  });
  if (!m.bench) problems.push(`${scheme}: #abBench not found`);
  else if (m.bench.t < -0.5 || m.bench.b > m.vh + 0.5) {
    problems.push(`${scheme}: #abBench is not fully on screen (top ${m.bench.t}, bottom ${m.bench.b} in a ${m.vh}px-tall viewport)`);
  }

  m.names.forEach((r, i) => {
    if (r.w < 48) problems.push(`${scheme}: .tl-name row ${i + 1} is ${r.w}px wide, under 48px`);
    const row = m.rows[i], nextRow = m.rows[i + 1], prevRow = m.rows[i - 1];
    const pitch = nextRow ? nextRow.t - row.t : prevRow ? row.t - prevRow.t : null;
    const next = m.names[i + 1];
    if (pitch != null) {
      const floor = Math.min(48, pitch) - 0.5;
      if (r.h < floor) problems.push(`${scheme}: .tl-name row ${i + 1} is ${r.h}px tall, under ${floor} (min(48, pitch ${pitch}) - 0.5)`);
    }
    if (next && r.b > next.t + 0.5) problems.push(`${scheme}: .tl-name row ${i + 1} (bottom ${r.b}) overlaps row ${i + 2} (top ${next.t})`);
  });
  return problems;
}

/* The toggle (item 4): a real `<button class="tl-name">` gets Enter/Space
   for free from native button semantics, so this is read-only proof that it
   actually happened, not a second implementation of the handler. Run once,
   against the light-mode landing, since none of this is theme-dependent. */
async function toggleProblems(c) {
  const problems = [];
  const readThird = `(() => {
    const btn = document.querySelectorAll('${NAME_SEL}')[2];
    const row = btn.closest('.tl-row');
    const next = row.nextElementSibling;
    return JSON.stringify({
      expanded: btn.getAttribute('aria-expanded'),
      detailIsNext: !!next && next.id === 'tlDetail',
      detailInDoc: !!document.getElementById('tlDetail'),
    });
  })()`;
  const clickThird = `(() => { document.querySelectorAll('${NAME_SEL}')[2].click(); })()`;

  await evalIn(c, clickThird);
  await evalIn(c, `(async () => { await ${SETTLE}; })()`);
  let r = JSON.parse(await evalIn(c, readThird));
  if (r.expanded !== 'true') problems.push(`clicking the third .tl-name left aria-expanded="${r.expanded}", not "true"`);
  if (!r.detailIsNext) problems.push('#tlDetail is not the clicked row\'s next sibling after opening');

  await evalIn(c, clickThird);
  await evalIn(c, `(async () => { await ${SETTLE}; })()`);
  r = JSON.parse(await evalIn(c, readThird));
  if (r.expanded !== 'false') problems.push(`clicking the third .tl-name again left aria-expanded="${r.expanded}", not "false"`);
  if (r.detailInDoc) problems.push('#tlDetail is still in the document after closing');

  await evalIn(c, `(() => { document.querySelectorAll('${NAME_SEL}')[2].focus(); })()`);
  /* A native `<button>`'s Enter-key activation is Chromium's own default
     action on the KEYPRESS its keydown produces, not on the keydown itself
     -- confirmed empirically against this exact button: `keyDown` + `keyUp`
     alone reached the page as trusted, correctly-labelled events (key
     "Enter", not prevented) and still fired no click at all. CDP's `Input`
     domain does not synthesize that keypress from a `keyDown` the way real
     hardware input does, so it has to be sent explicitly as a `char` event
     (the same three-event shape CDP text-typing already uses) between
     `rawKeyDown` and `keyUp`, or the click this test exists to prove never
     happens. */
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await c.send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await evalIn(c, `(async () => { await ${SETTLE}; })()`);
  r = JSON.parse(await evalIn(c, readThird));
  if (r.expanded !== 'true' || !r.detailIsNext) problems.push('pressing Enter on a focused .tl-name did not open its detail');

  return problems;
}

export async function gameRowsFitPass(c, origin) {
  const problems = [];
  let lightSummary = '';
  try {
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await landOnNine(c, origin);
    const light = JSON.parse(await evalIn(c, MEASURE));
    problems.push(...problemsFor('light', light));
    problems.push(...await toggleProblems(c));
    if (light.rows.length === 9 && light.ab) {
      lightSummary = `rows at ${light.rows.map(r => Math.round(r.t)).join(', ')}, #actionbar top ${Math.round(light.ab.t)}`;
    }

    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await landOnNine(c, origin);
    const dark = JSON.parse(await evalIn(c, MEASURE));
    problems.push(...problemsFor('dark', dark));
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    await goRich(c, origin);
  }
  return {
    name: nameOf('gamerowsfit'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `9 rows and #abBench fully on screen with no scroll, .tl-name ≥ 48px wide and ≥ min(48, pitch) − 0.5 tall `
        + `with no overlap, in light and dark, the toggle opens/closes by click and by Enter (${lightSummary}, ${HEIGHT}px tall viewport)`,
  };
}
