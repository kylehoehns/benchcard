/* #125: the one module that navigates, resizes, sets text size, sets
   emulated media or waits for boot. A check asks for a page STATE --
   everything the page must be in before it can be measured -- rather than
   driving each of those CDP calls by hand and copying its own boot wait.
   `planLanding` is the pure half: it resolves a partial `want` against
   `BASELINE` and returns the state plus the localStorage-seeding script
   source, with no CDP call in it, so it is unit-tested directly
   (`test/smoke-page-state.test.js`). `land` only executes that plan. */
import { evalIn, SETTLE, quiet, WIDTH, HEIGHT, LOCALSTORAGE_WIPE } from './dom.mjs';
import { RICH, seeded } from './fixtures.mjs';

export const BASELINE = Object.freeze({
  page: '/index.html',   // path under origin; '/about.html' etc. for static pages
  query: '',             // e.g. '?try=9'
  record: RICH,          // a record object, 'wiped', or 'kept'
  width: WIDTH, height: HEIGHT,
  textPx: 16,            // root text size, via Page.setFontSizes (standard and fixed)
  media: [],             // Emulation.setEmulatedMedia features
  ready: `document.querySelector('.card')`, // JS expression, polled until truthy
  freshHistory: false,   // navigate to a cache-busted URL first (reloadWithRecord's trick)
  scripts: [],           // extra on-new-document sources, removed after the boot
});

const FIELDS = new Set(Object.keys(BASELINE));

/* The #35 fix (`seeded`, fixtures.mjs), moved here as the one seeding path: a
   record's `version` picks the localStorage key, written by a script added
   with `Page.addScriptToEvaluateOnNewDocument` so it runs on the NEXT
   document, never the one about to be navigated away from. Anything else --
   an unsupported version, or a `record` that is neither an object nor
   `'wiped'`/`'kept'` -- throws, the same way an unknown `want` field does: a
   typo here must not silently mean "baseline". */
function scriptFor(record) {
  if (record === 'kept') return null;
  if (record === 'wiped') return LOCALSTORAGE_WIPE;
  if (record && typeof record === 'object') {
    if (record.version === 7) {
      return `(() => {
        localStorage.removeItem('benchcard.v3');
        localStorage.removeItem('benchcard.v7.bak');
        localStorage.setItem('benchcard.v7', ${JSON.stringify(JSON.stringify(record))});
      })()`;
    }
    if (record.version === 3) {
      return `(() => {
        localStorage.removeItem('benchcard.v7');
        localStorage.removeItem('benchcard.v7.bak');
        localStorage.setItem('benchcard.v3', ${JSON.stringify(JSON.stringify(record))});
      })()`;
    }
    throw new Error(`planLanding: record version ${record.version} is not supported (want 3, 7, 'wiped' or 'kept')`);
  }
  throw new Error(`planLanding: record must be an object with a version, or 'wiped' or 'kept', got ${JSON.stringify(record)}`);
}

export function planLanding(want = {}) {
  for (const key of Object.keys(want)) {
    if (!FIELDS.has(key)) {
      throw new Error(`planLanding: unknown field "${key}" -- want one of ${[...FIELDS].join(', ')}`);
    }
  }
  const state = { ...BASELINE, ...want };
  return { state, script: scriptFor(state.record) };
}

/* Add every source in order (the seeding script, then any of the state's own
   `scripts`) as its own on-new-document script, run `fn`, and remove them
   again -- innermost first -- regardless of outcome. Nests `seeded`
   (fixtures.mjs) rather than re-deriving the add/try/finally/remove idiom a
   second time for "more than one script". */
async function withScripts(c, sources, fn) {
  if (sources.length === 0) return fn();
  const [first, ...rest] = sources;
  return seeded(c, first, () => withScripts(c, rest, fn));
}

/* Get the page into `want`'s state, defaulting every field left out to
   `BASELINE`. Order: device metrics, font sizes, emulated media, the seeding
   script(s), navigate (twice first if `freshHistory`, `reloadWithRecord`'s
   cache-busting trick), wait for the load event once, then the one boot
   wait -- `document.fonts.ready`, poll `ready` every 50ms up to 3s, `SETTLE`
   (reused, not re-derived). A `ready` still false after 3s throws (D3):
   `runCheck` turns that into a FAIL row that names what it was waiting for,
   rather than measuring a page that never booted. */
export async function land(c, origin, want = {}) {
  const { state, script } = planLanding(want);

  await c.send('Emulation.setDeviceMetricsOverride',
    { width: state.width, height: state.height, deviceScaleFactor: 2, mobile: true });
  await c.send('Page.setFontSizes', { fontSizes: { standard: state.textPx, fixed: state.textPx } });
  await c.send('Emulation.setEmulatedMedia', { features: state.media });

  const sources = script ? [script, ...state.scripts] : state.scripts;
  await withScripts(c, sources, async () => {
    const plain = `${origin}${state.page}${state.query}`;
    const urls = state.freshHistory
      ? [`${plain}${state.query ? '&' : '?'}_smoke=${Date.now()}`, plain]
      : [plain];
    for (const url of urls) {
      const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
      await c.send('Page.navigate', { url });
      await loaded;
    }
    const timeoutMessage = `boot wait timed out: ${state.ready} on ${state.page}${state.query}`;
    await evalIn(c, `(async () => {
      await document.fonts.ready;
      let ok = (${state.ready});
      for (let i = 0; i < 60 && !ok; i++) { await new Promise(r => setTimeout(r, 50)); ok = (${state.ready}); }
      if (!ok) throw new Error(${JSON.stringify(timeoutMessage)});
      await ${SETTLE};
    })()`);
  });
}

/* For a check that sweeps widths inside one page load (`sweep`, `narrow`,
   `width-sweep`, the touch sweeps, `wide-layout`). Sets the metrics and waits
   two frames; `debounce: true` adds the 400ms wait `wide-layout`'s `atWidth`
   needs for `render.js`'s debounced repaint. Does not reload and does not
   change the text size -- it is not a restore, the next row's `reset` is. */
export async function resize(c, width, height = HEIGHT, { debounce = false } = {}) {
  await c.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  // The resize debounce is an app timer TIMER_TRACKER sees, and TIMERS_QUIET
  // starts with two frames, so under `debounce` it is the whole wait.
  if (debounce) await quiet(c);
  else await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
}

/* The start fingerprint (item 5 of the spec's "What would settle it"): what a
   page looks like the moment `reset` hands it to a row. The first `reset` of
   a run records it as the baseline; every later one must reproduce it, or the
   row fails before it starts, so no row can pass or fail on what the row
   before it left behind. Field order is the report order: the first field
   that differs is the one named. */
export const FINGERPRINT_FIELDS = ['url', 'screen', 'width', 'height', 'rootPx', 'dark', 'forced', 'recordLength', 'recordHash'];

/* Pure: null when `now` matches `baseline`, else the message that fails the
   row, naming the first field that changed. */
export function compareFingerprints(baseline, now) {
  for (const field of FINGERPRINT_FIELDS) {
    // A field absent from both would read `undefined !== undefined` as equal:
    // a rename in `readFingerprint` must fail, not turn a comparison off.
    if (!(field in baseline) || !(field in now)) {
      return `start state differs from baseline: ${field} is missing from the ${field in baseline ? 'current' : 'baseline'} fingerprint`;
    }
    if (baseline[field] !== now[field]) {
      return `start state differs from baseline: ${field} was ${JSON.stringify(now[field])}, want ${JSON.stringify(baseline[field])}`;
    }
  }
  return null;
}

/* Read from the page: the address, which top-level screen is showing, the
   layout viewport, the root's computed font size, the two media features a
   check can leave emulated, and the saved record's length plus a cheap hash
   (FNV-1a), so a record a row rewrote is caught even at the same length. */
function readFingerprint(c) {
  return evalIn(c, `(() => {
    const rec = localStorage.getItem('benchcard.v7') || '';
    let h = 2166136261;
    for (let i = 0; i < rec.length; i++) { h ^= rec.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const shown = [...document.querySelectorAll('main.view')].filter(m => !m.hidden).map(m => m.id);
    return {
      url: location.pathname + location.search,
      screen: shown.join(','),
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      rootPx: getComputedStyle(document.documentElement).fontSize,
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      forced: matchMedia('(forced-colors: active)').matches,
      recordLength: rec.length,
      recordHash: h.toString(16),
    };
  })()`);
}

let baselineFingerprint = null;

/* `land(c, origin, {})` plus the start fingerprint: the harness calls this
   before every rich row. The first call of a run records the baseline; each
   later call throws the comparison's message if the page it landed on is not
   that one. */
export async function reset(c, origin) {
  await land(c, origin, {});
  const now = await readFingerprint(c);
  if (!baselineFingerprint) { baselineFingerprint = now; return; }
  const problem = compareFingerprints(baselineFingerprint, now);
  if (problem) throw new Error(problem);
}
