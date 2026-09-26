import { evalIn, step, WIDTH, HEIGHT } from './dom.mjs';
import { goRich } from './fixtures.mjs';
import { APP_LARGE_TEXT_STATES, firstRun, tryLanding } from './app-large-text.mjs';

/* #24 item 3: the scale's runtime proof. Item 3's "What would settle it" is
   computed rem values, so this reads the SAME size/weight set the spec's own
   table lists (T2/T3), never the tokens.css values recomputed — the
   tautology `/tdd` bans. `meta[name="text-scale"]` is asserted once, not
   per state: it is document-level, not something a state can change.
   #145 item 6 adds 30px (--fs-flow, both flows' titles) to the set. */
const TYPESCALE_SIZES_PX = new Set([13, 14, 16, 17, 22, 25, 30, 34]);
const TYPESCALE_WEIGHTS = new Set([400, 500, 600, 700]);
/* Every element with its own text, structurally, the same way
   `smoke-checks.js`'s touch-target scan finds controls rather than guessing a
   selector list: a direct non-whitespace text node, or a form control whose
   value is its "text". `.card` is print output at a fixed size and out of
   scope (#24's item 5 covers it separately). */
const TYPESCALE_PROBE = `(() => {
  const seen = [];
  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const isFormEl = el => el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.card')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    if (!hasOwnText(el) && !isFormEl(el)) continue;
    const cs = getComputedStyle(el);
    const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join(''));
    seen.push({ sel: label, size: Math.round(parseFloat(cs.fontSize)), weight: Number(cs.fontWeight) });
  }
  return JSON.stringify(seen);
})()`;

export async function typeScalePass(c, origin) {
  const problems = [];
  let elements = 0;
  await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
  await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await goRich(c, origin);

  const meta = await evalIn(c, `document.querySelector('meta[name="text-scale"]')?.getAttribute('content') ?? null`);
  if (meta !== 'scale') problems.push(`meta[name="text-scale"] is ${JSON.stringify(meta)}, not "scale"`);

  for (const v of APP_LARGE_TEXT_STATES) {
    try {
      if (v.firstRun) await firstRun(c, origin);
      else if (v.tryLink) await tryLanding(c, origin, v.tryLink);
      else await evalIn(c, step(v.open));
      const seen = JSON.parse(await evalIn(c, TYPESCALE_PROBE));
      elements += seen.length;
      if (seen.length === 0) problems.push(`${v.name}: measured no elements at all`);
      for (const el of seen) {
        if (!TYPESCALE_SIZES_PX.has(el.size)) problems.push(`${v.name} — ${el.sel}: ${el.size}px is off the scale`);
        if (!TYPESCALE_WEIGHTS.has(el.weight)) problems.push(`${v.name} — ${el.sel}: weight ${el.weight} is off the scale`);
      }
    } catch (e) {
      problems.push(`${v.name}: ${e.message.split('\n')[0]}`);
    } finally {
      if (v.close) await evalIn(c, step(v.close))
        .catch(e => problems.push(`${v.name}: did not close — ${e.message.split('\n')[0]}`));
    }
  }
  return {
    pass: problems.length === 0 && elements > 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : elements === 0
        ? 'measured no elements across any state'
        : `${APP_LARGE_TEXT_STATES.length} states, ${elements} elements, every font-size in `
          + `{${[...TYPESCALE_SIZES_PX].join(',')}}px and every weight in {${[...TYPESCALE_WEIGHTS].join(',')}}`,
  };
}
