import { evalIn, step, IS_SR_ONLY_RECT, DESCRIBE_EL } from './dom.mjs';
import { land } from './page-state.mjs';
import { APP_LARGE_TEXT_STATES, firstRun, tryLanding } from './app-large-text.mjs';
import { firstLine } from './verdict.mjs';

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
  const isSrOnly = ${IS_SR_ONLY_RECT};
  const describe = ${DESCRIBE_EL};
  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const isFormEl = el => el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('.card')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    // A .sr-only heading (#151 item 4) paints no text -- checkVisibility
    // only catches display/visibility/opacity, not the 1x1-box clip trick,
    // so its own computed font-size is not part of the visible scale.
    if (isSrOnly(r)) continue;
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    if (!hasOwnText(el) && !isFormEl(el)) continue;
    const cs = getComputedStyle(el);
    const label = describe(el);
    seen.push({ sel: label, size: Math.round(parseFloat(cs.fontSize)), weight: Number(cs.fontWeight) });
  }
  return JSON.stringify(seen);
})()`;

export async function typeScalePass(c, origin, rec) {
  let elements = 0;
  await land(c, origin);

  const meta = await evalIn(c, `document.querySelector('meta[name="text-scale"]')?.getAttribute('content') ?? null`);
  rec.check(meta === 'scale', `meta[name="text-scale"] is ${JSON.stringify(meta)}, not "scale"`);

  for (const v of APP_LARGE_TEXT_STATES) {
    try {
      if (v.firstRun) await firstRun(c, origin);
      else if (v.tryLink) await tryLanding(c, origin, v.tryLink);
      else await evalIn(c, step(v.open));
      const seen = JSON.parse(await evalIn(c, TYPESCALE_PROBE));
      elements += seen.length;
      rec.check(seen.length > 0, `${v.name}: measured no elements at all`);
      for (const el of seen) {
        rec.check(TYPESCALE_SIZES_PX.has(el.size), `${v.name} — ${el.sel}: ${el.size}px is off the scale`);
        rec.check(TYPESCALE_WEIGHTS.has(el.weight), `${v.name} — ${el.sel}: weight ${el.weight} is off the scale`);
      }
    } finally {
      if (v.close) await evalIn(c, step(v.close))
        .catch(e => rec.fail(`${v.name}: did not close — ${firstLine(e)}`));
    }
  }
  rec.check(elements > 0, 'measured no elements across any state');
  rec.ok(`${APP_LARGE_TEXT_STATES.length} states, ${elements} elements, every font-size in `
    + `{${[...TYPESCALE_SIZES_PX].join(',')}}px and every weight in {${[...TYPESCALE_WEIGHTS].join(',')}}`);
}
