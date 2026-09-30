/* #125: the one module that navigates, resizes, sets text size, sets
   emulated media or waits for boot. A check asks for a page STATE --
   everything the page must be in before it can be measured -- rather than
   driving each of those CDP calls by hand and copying its own boot wait.
   `planLanding` is the pure half: it resolves a partial `want` against
   `BASELINE` and returns the state plus the localStorage-seeding script
   source, with no CDP call in it, so it is unit-tested directly
   (`test/smoke-page-state.test.js`). `land` only executes that plan. */
import { evalIn, SETTLE, TIMERS_QUIET, WIDTH, HEIGHT, LOCALSTORAGE_WIPE } from './dom.mjs';
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
  await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
  if (debounce) await evalIn(c, TIMERS_QUIET); // the resize debounce is an app timer; TIMER_TRACKER sees it
}

/* `land(c, origin, {})` plus the start fingerprint -- the fingerprint (item 5
   of the spec's "What would settle it") is slice 2's own job, once the
   harness calls this before every rich row; nothing calls `reset` yet. */
export async function reset(c, origin) {
  await land(c, origin, {});
}
