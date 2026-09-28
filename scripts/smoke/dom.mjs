/* Shared DOM/CDP helpers: the viewport every pass measures at, evaluating
   script in the page, waiting for entrance animations to settle, and the two
   overflow probes reused across passes. Moved out of `smoke.mjs` unchanged. */

export const WIDTH = 390, HEIGHT = 844;

/* Fix pass, efficiency-2: `page-state.mjs` is imported dynamically everywhere
   in this file for the load-order reason `setWidth`'s own comment below
   gives -- but every one of those call sites was re-awaiting its own
   `import()`, which after the first call is just a promise the module loader
   already has cached; nothing needs a second round trip through it. One
   module-level promise, created on first use and reused by every later call
   in this process, same as the loader would do anyway, minus the repeated
   await. */
let pageStateModule;
const pageState = () => (pageStateModule ??= import('./page-state.mjs'));

/* Fix pass finding 3: `bar-rows.mjs` and `gm-open.mjs` each carried a
   byte-for-byte identical `setWidth` -- override the device metrics at the
   given width (keeping this suite's own HEIGHT and mobile emulation unless a
   caller needs a different height too, #147's own short-phone heights among
   them), then wait two rAFs for the resulting reflow to settle before
   anything measures it. One copy here, imported by everyone who needs it.
   #125: a one-line wrapper over `resize` (`page-state.mjs`), which does the
   exact same two things and nothing else -- a dynamic import, not a static
   one, because `page-state.mjs` itself imports from this file (`WIDTH`,
   `evalIn`) and a static import back would be a load-order-dependent cycle:
   whichever of the two modules some other file happens to import first would
   decide whether `page-state.mjs`'s own top-level `BASELINE` sees `RICH`
   already initialized or not. A dynamic import resolves at call time, after
   the whole module graph has settled, so it is safe either way. */
export async function setWidth(c, width, height = HEIGHT) {
  const { resize } = await pageState();
  return resize(c, width, height);
}

/* #125: the ambient page state a check has already set by hand -- via a raw
   CDP call right beside the wrapped call below -- before asking for a
   navigate, wipe or reseed. `land` (`page-state.mjs`) always asserts every
   field of the state it lands on, baseline width/text/media included when a
   caller leaves them out, so a wrapper that only passed through the one field
   it used to touch would silently reset whatever the CALLER had already
   emulated a moment earlier: a check narrowed to 320px, or pinned to
   `prefers-color-scheme: light`, immediately before the reload it expects to
   land at that same width and scheme (`first-run-flow.mjs`'s `firstRunPass`
   is the real case this was caught against -- it pins light, then reloads
   through what is now `landWiped`, then reads a theme-dependent color).
   Read here, off the page itself, and passed straight back into `want` by
   the wrapper that calls this, so the reload re-asserts the same state
   instead of resetting it. `matchMedia` cannot tell "the host really is
   light" from "CDP forced light"; it does not need to -- reasserting
   whichever value it currently reports reproduces the same visible page
   state either way. */
export async function ambient(c) {
  const json = await evalIn(c, `JSON.stringify({
    width: document.documentElement.clientWidth,
    textPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    forcedColors: matchMedia('(forced-colors: active)').matches,
    moreContrast: matchMedia('(prefers-contrast: more)').matches,
    reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
  })`);
  const a = JSON.parse(json);
  return {
    width: a.width,
    textPx: a.textPx,
    media: [
      { name: 'prefers-color-scheme', value: a.dark ? 'dark' : 'light' },
      { name: 'prefers-reduced-motion', value: a.reducedMotion ? 'reduce' : 'no-preference' },
      { name: 'forced-colors', value: a.forcedColors ? 'active' : 'none' },
      { name: 'prefers-contrast', value: a.moreContrast ? 'more' : 'no-preference' },
      { name: 'prefers-reduced-transparency', value: a.reducedTransparency ? 'reduce' : 'no-preference' },
    ],
  };
}

/* Fix pass, efficiency-1 + reuse-2 (handed back together: the fix for one is
   the fix for the other): the "dynamic import, read `ambient`, call `land`
   carrying its width/textPx/media forward" idiom five wrappers hand-copied --
   this file's own `navigateAndWaitForCard` and `landWiped` below, plus
   `fixtures.mjs`'s `goRich`, `goSeed` and `reloadWithRecord`. One helper,
   here, next to `ambient` itself.

   On skipping the read: `ambient`'s own comment above names the one real case
   it exists for -- a caller that has already set width/text/media by hand,
   right before asking for a reload (`first-run-flow.mjs`'s `firstRunPass`).
   The other four wrappers are called about 130 times combined across
   `scripts/smoke/`, and proving which of those call sites can and cannot have
   deviated from `BASELINE` first would mean auditing every one by hand and
   keeping that audit right as the migration in slices 3 and 4 moves more
   checks onto `land` directly -- exactly the kind of one-off proof that goes
   stale the next time a check changes what it does before reloading. Given
   that cost, this keeps the read: one `Runtime.evaluate` round trip per
   reload not the two dynamic-import-call sites finding 2 was about, and
   still one copy of the idiom, not five. A later slice that DOES thread
   "did this caller touch CDP state" through from the call site can drop the
   read for the callers that answer no; nothing here forecloses that. */
export async function landKeepingAmbient(c, origin, want) {
  const { land } = await pageState();
  const a = await ambient(c);
  return land(c, origin, { width: a.width, textPx: a.textPx, media: a.media, ...want });
}

/* Evaluate in the page and throw the page's own error, rather than letting a
   typo in a selector come back as a silent `undefined`. */
export async function evalIn(c, expression) {
  const { result, exceptionDetails } = await c.send('Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  }
  return result.value;
}

/* A selector's own LIVE objectId -- the one thing `evalIn` above can never
   hand back, since it always asks for `returnByValue: true` (a JSON copy, not
   the object itself). A CDP domain call that needs the live node
   (`DOM.requestNode` for `CSS.getPlatformFontsForNode`, `Accessibility.
   getPartialAXTree`) needs this instead. `font-draws.mjs`'s own `nodeIdFor`
   and `focus-announce.mjs`'s own `axName` each carried an identical first
   step -- `Runtime.evaluate` the selector without `returnByValue`, throw the
   page's own exception, and treat "matched nothing" (no `objectId`) as a
   plain `null` -- until it moved here. */
export async function objectIdFor(c, selector) {
  const { result, exceptionDetails } = await c.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.objectId || null;
}

/* #102: the "Evens out ..." sentence's second line, read through the same
   `tipoffLabel` the sentence itself calls rather than a hard-coded "9:00 AM"
   this ICU version's own AM/PM spacing (an ASCII space or U+202F) could
   break. `plan-sheet.mjs` and `sentence-sheets.mjs` each drove this exact
   expression until they were pulled here. */
export async function evensOutWant(c, hhmm) {
  const json = await evalIn(c, `(async () => {
    const { tipoffLabel } = await import('/storage.js');
    return JSON.stringify(\`Evens out the \${tipoffLabel('${hhmm}')} game.\`);
  })()`);
  return JSON.parse(json);
}

/* Wait until nothing is animating. `fx.js` fades controls in from opacity 0
   and `smoke-checks.js` skips anything at opacity 0, so a page measured
   mid-entrance is audited for whichever controls happened to have arrived:
   three runs of the unchanged app counted 54, 57 and 58 of them. The timeline
   skeleton shimmers forever, so infinite animations are excluded — and the
   whole wait is capped, because a harness that hangs is worse than one that
   measures early. */
export const SETTLE = `(async () => {
  const running = () => document.getAnimations().filter(a => {
    const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
    return a.playState === 'running' && t && t.iterations !== Infinity;
  }).length;
  const cap = Date.now() + 3000;
  // two consecutive quiet samples: one is not enough, since fx.js starts the
  // next element's animation on the frame after the last one finished
  for (let quiet = 0; quiet < 2 && Date.now() < cap; ) {
    quiet = running() ? 0 : quiet + 1;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
})()`;

export const step = js => `(async () => { const $ = s => document.querySelector(s); ${js};
  await ${SETTLE}; })()`;

/* The alpha channel of a computed color, or null if it is not an `rgb()`/
   `rgba()` at all. `floating-controls.mjs` and `resume-bar.mjs` both ask the
   same question of the same scrims -- "is this fallback actually OPAQUE" --
   and carried a byte-for-byte identical copy of this until it moved here.
   Computed style always hands back `rgb(...)` or `rgba(...)`, in either the
   comma or the slash spelling, which is why both separators are split on. */
export const alpha = c => {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return null;
  const parts = m[1].split(/[,/]/).map(s => s.trim());
  return parts.length > 3 ? Number(parts[3]) : 1;
};

/* A `.pass-status <cls>` dot's computed `::before` color, from a throwaway
   span carrying the real class -- never a copied hex (AGENTS.md's own rule).
   `game-passes.mjs` (item 4, the `ok`/`warn` dots) and `pass-underway.mjs`
   (#92, the `now` dot) each drove this identical closure inline until it
   moved here; both call it as `${PASS_STATUS_DOT_PROBE}` inside a page
   expression, then invoke the resulting function with the class to probe. */
export const PASS_STATUS_DOT_PROBE = `(cls => {
  const d = document.createElement('span');
  d.className = 'pass-status ' + cls;
  document.body.appendChild(d);
  const v = getComputedStyle(d, '::before').backgroundColor;
  d.remove();
  return v;
})`;

/* A CSS custom property's own computed color, from a throwaway element given
   `background: var(--x)` and read back through `getComputedStyle` -- the
   only way to ask the browser what a var() resolves to, rather than a copied
   hex. `game-passes.mjs` (`--err`) and `pass-underway.mjs` (`--accent`) each
   drove this identical create/append/read/remove sequence inline until it
   moved here; both call it as `${CSS_VAR_COLOR_PROBE}('var(--x)')` inside a
   page expression. */
export const CSS_VAR_COLOR_PROBE = `(v => {
  const d = document.createElement('div');
  d.style.background = v;
  document.body.appendChild(d);
  const c = getComputedStyle(d).backgroundColor;
  d.remove();
  return c;
})`;

/* The two user preferences `docs/interface-guidelines.md` L2 says a
   translucent, blurred surface must turn solid under, as CDP
   `Emulation.setEmulatedMedia` features. One fact, one copy: every pass that
   audits a floating surface's fallback (`floating-controls.mjs` for `.bar`
   and `#actionbar`, `resume-bar.mjs` for `#resumeBar`) emulates the SAME two,
   and a third query added to L2 must reach all of them at once. */
export const SOLID_FALLBACK_MEDIA = [
  ['prefers-reduced-transparency', 'reduce'],
  ['prefers-contrast', 'more'],
];

// #125 fix pass, reuse-1: is `#id` the screen currently on show, as a plain
// JS-expression string rather than a value read through CDP -- so a caller
// that needs the EXPRESSION (`GAMES_VIEW_READY`, fixtures.mjs, evaluated
// later inside `land`'s own boot-wait poll) and a caller that wants the
// ANSWER right now (`onScreen` below, both #23 checks) share one builder
// instead of `fixtures.mjs` re-typing the check by hand and dropping the null
// guard: an id that has not painted yet must read false and let the poll
// retry, not throw a `TypeError` on `.hidden` of `null`.
export const screenReadyExpr = id => `!!(document.getElementById('${id}') && !document.getElementById('${id}').hidden)`;

// Is `#id` the screen currently on show? Both #23 checks below ask this of
// more than one screen (Today, and on the keys/undo side, Games too), so it
// is one helper rather than a `!!(document.getElementById(...) && ...)` at
// every call site.
export const onScreen = (c, id) => evalIn(c, screenReadyExpr(id));

// #145 item 8: a named set of one element's own computed-style properties,
// or null if the selector matches nothing -- the way `add-game-flow.mjs` and
// `first-run-flow.mjs` each prove `#agClose .i`/`#frClose .i` paint the exact
// same chip `#backBtn .i` does, from the PAINTED result rather than a copied
// hex or px literal (AGENTS.md's own rule: a computed style, never a value
// recomputed the way the CSS itself computes it).
export async function computedStyle(c, sel, props) {
  return JSON.parse(await evalIn(c, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return JSON.stringify(null);
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of ${JSON.stringify(props)}) out[p] = cs[p];
    return JSON.stringify(out);
  })()`));
}

// #145 item 8, continued: `#agClose`/`#frClose` have to draw the exact
// `#backBtn .i` chip (Reuse: that rule's own selector list is extended,
// never copied), with an icon rather than a text glyph. One shared
// assertion, called once per flow with its own close selector --
// `add-game-flow.mjs` and `first-run-flow.mjs` each carried a byte-for-byte
// copy of this, `CHIP_PROPS` included, until it moved here.
const CHIP_PROPS = ['backgroundColor', 'backdropFilter', 'width', 'height', 'borderRadius'];

export async function assertChipMatchesBackBtn(c, ck, closeSel) {
  const want = await computedStyle(c, '#backBtn .i', CHIP_PROPS);
  const got = await computedStyle(c, `${closeSel} .i`, CHIP_PROPS);
  if (ck(got, `${closeSel} has no .i chip to measure`)) {
    for (const p of CHIP_PROPS) {
      ck(got[p] === want[p], `${closeSel} .i's ${p} is "${got[p]}", want #backBtn .i's own "${want[p]}"`);
    }
  }
  const closeIcon = JSON.parse(await evalIn(c,
    `JSON.stringify(document.querySelector('${closeSel} .i')?.dataset.icon || null)`));
  ck(closeIcon === 'x', `${closeSel}'s icon is data-icon="${closeIcon}", want "x"`);
}

// The chevron twin of the assertion above, for `#agBack`/`#frBack`.
export async function assertBackIsChevron(c, ck, backSel) {
  const back = JSON.parse(await evalIn(c, `JSON.stringify({
    icon: document.querySelector('${backSel} .i')?.dataset.icon || null,
    text: (document.querySelector('${backSel}')?.textContent || '').trim(),
  })`));
  ck(back.icon === 'chevron-left', `${backSel}'s icon is data-icon="${back.icon}", want "chevron-left"`);
  ck(back.text.includes('Back'), `${backSel} reads "${back.text}", want it to still say "Back"`);
}

// The "get back to Today" script every sweep below opens from. One copy,
// here, because `sweepPass`, `touchPass`, `settingsRowPass` and
// `appLargeTextPass` all need it and it moved unchanged out of `smoke.mjs`.
// See `VIEWS` in `sweep.mjs` for why Today is the baseline each sweep starts
// from.
export const TODAY_HOME = `document.querySelector('#barBack').hidden || document.querySelector('#backBtn').click()`;

/* #36: the three first-run steps as a state list, and the fixture snapshot
   they need, in one place.

   Three passes drive the same trio -- `overlay.mjs`, `touch.mjs` and
   `app-large-text.mjs` -- and each had its own hand-typed copy of these three
   names. A state name is the key `app-large-text.mjs` already reuses
   `overlay.mjs`'s states BY (`STATES.find(s => s.name === n)`), so three
   spellings of the same trio is a rename away from a silent `undefined`.
   What each pass does to open and close them genuinely differs (`touch` chains
   from the state before it, `app-large-text` leaves through `#frClose`), so
   only the names are shared. */
export const FIRST_RUN_STEPS = [
  'first run, step 1 with the sample',
  'first run, step 2',
  'first run, step 3',
];

/* Step 3 commits a real team (`commitFirstRun`, decision 4), overwriting
   `state.players`/`state.teamName`/`state.day.games[0]` on a page load that
   `overlay` and `touch` share with every pass after them up to `teamscreen`'s
   own `goRich`. Both take the same snapshot before opening step 3 and put it
   back whole afterwards, so the pair lives here rather than being typed twice:
   a restore that drifted from its snapshot would corrupt a later pass's
   fixture, and the failure would land in some other check's name. */
export const FR_SNAPSHOT = `window.__frSnap = await (async () => {
  const st = await import('/state.js');
  return JSON.parse(JSON.stringify(st.state));
})()`;

export const FR_RESTORE = `await (async () => {
  const st = await import('/state.js');
  Object.assign(st.state, window.__frSnap);
  delete window.__frSnap;
  (await import('/render.js')).renderAll();
})()`;

/* Today -> the first game, awaited as two separate `step()`s rather than one
   script with both clicks chained: the Today -> Games rebuild has to land
   before a phrase's own handler (`#phrasePlayers`, `#phraseStrategy`, ...) is
   live to receive the next click, a trap `who-rows.mjs` hit first (caught by
   running that state's own tab count against zero, per rule 2a, before
   landing on this fix). `who-rows.mjs` and `plan-rows.mjs` both open a sheet
   this way, so it is one copy rather than two. */
export async function toGameOne(c) {
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(`document.querySelector('.today-game').click()`));
}

/* The same assertion `sweepPass` makes, and for the same reason: `scrollWidth`
   is clamped by `overflow-x: clip` on a shrink-to-fit container, so the thing
   clip cannot hide is an element's own edge. `pans` is the other half —
   content out of reach with the scrollbar removed is the same bug with its
   symptom deleted.
   `vw` is `documentElement.clientWidth`, never `window.innerWidth`: Chrome's
   mobile emulation WIDENS `innerWidth` to contain the overflow, so a probe
   written against it reports a 331px window in a 320px viewport and calls the
   overflow that caused it clean.
   BOTH EDGES. A right-edge test is blind to content off the LEFT, and so is
   `scrollWidth`; the Games tab hangs off it and no pass could see it.
   Shared by `staticPass` and `appLargeTextPass`. */
export const OVERFLOW_PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const x0 = window.scrollX;
  window.scrollTo(80, window.scrollY);
  const pans = window.scrollX !== x0;
  window.scrollTo(x0, window.scrollY);
  let worst = null;
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const over = r.right > vw + 1 ? Math.round(r.right) : r.left < -1 ? Math.round(r.left) : null;
    if (over === null) continue;
    let n = el.parentElement, scrolls = false;
    while (n && n !== document.body) {
      const ov = getComputedStyle(n).overflowX;
      if ((ov === 'auto' || ov === 'scroll') && n.scrollWidth > n.clientWidth + 1) { scrolls = true; break; }
      n = n.parentElement;
    }
    if (scrolls) continue;
    const out = over < 0 ? -over : over - vw;
    if (!worst || out > worst.out) worst = { el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')), right: over, out };
  }
  return JSON.stringify({ vw, pans, worst });
})()`;

/* #151's own `.sr-only` headings (app.css:1300) are pulled onto a 1x1 box by
   an explicit `width: 1px; height: 1px` -- not by `visibility`/`opacity`/
   `display`, which `checkVisibility` already covers -- so a check auditing
   what a coach actually SEES has to tell that box apart from a painted one.
   Measured off the element's own rendered rect, not its class name: a
   painted heading is never 1x1, and a bug that widened `.sr-only` back out
   would show up here as "painted" again rather than being grandfathered by a
   name match. A page-side predicate (like `CSS_VAR_COLOR_PROBE` above),
   interpolated into a caller's own injected IIFE with `${IS_SR_ONLY_RECT}` --
   `bench-look.mjs`'s "no visible heading" check and `type-scale.mjs`'s scale
   scan both need this, so it lives once. */
export const IS_SR_ONLY_RECT = `(r => r.width <= 1 && r.height <= 1)`;

/* #200: the named list of computed-style longhands `WORD_FLOOR_FN`'s
   measuring span copies from the real element, in place of the `font`
   shorthand. Chrome's `getComputedStyle(...).font` comes back `""` -- not a
   fallback value, the empty string -- whenever a longhand it cannot express
   in the shorthand is off its initial value, and `body` sets two such
   longhands (`font-feature-settings`, `font-variant-numeric`) that every
   element in the app inherits. A span given `style.font = ''` keeps
   WHATEVER font it already had -- here, `body`'s own at weight 400 -- so a
   600-weight row's longest word measured far too small and a name squeezed
   narrower than that word could pass a floor check that should have caught
   it. One named constant, so `dom.mjs`, `bench-look.mjs`'s failure messages
   and a reader all point at the same list. */
export const WORD_FONT_PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'fontStretch', 'fontVariant', 'fontFeatureSettings', 'fontVariationSettings',
  'fontKerning', 'letterSpacing', 'textTransform'];

/* An element's own text, ignoring a child element (`.tag` beside `.nm`, "just
   on") -- only its DIRECT text nodes, concatenated and trimmed. `WORD_FLOOR_FN`
   uses this to decide what a name or title actually says; `bench-look.mjs`'s
   #200 calibration reuses the exact same function (spliced in alongside
   `WORD_FLOOR_FN`) to re-find the identical node the floor measured, rather
   than a second hand-typed copy of the same walk. */
export const DIRECT_TEXT = `(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim())`;

/* #144's own squeeze check reuses this, #138's own first: the floor a name or
   a title is held to at a large root, once something beside it is fighting
   it for space, is `min(its longest single word, the row's own content-box
   width)` -- not the longest word outright, since a word can be wider than
   the row itself has room for (a real CI finding, `bench-look.mjs`'s own
   comment at its first use has the run number), and not the row's full
   content width either, since a short word should not be held to a floor it
   never claimed. Parameterized by which elements are "names" (`nameSel`) and
   which ancestor is their "row" (`rowSel`, read with `.closest`), so the same
   measurement serves bench mode's `.gm-p`/`.gm-b .nm` rows and Season's own
   filed-game titles and opened-game names, rather than a second hand-typed
   copy of the same probe for each. Interpolated into a caller's own IIFE (the
   same pattern `season-look.mjs`'s `TEXT_LEFT_FN` already uses) rather than
   exported as a full expression on its own, since every caller wraps its
   result in a JSON payload carrying its own extra fields alongside `rows`. */
export const WORD_FLOOR_FN = `const WORD_FONT_PROPS = ${JSON.stringify(WORD_FONT_PROPS)};
const directText = ${DIRECT_TEXT};
const wordFloorRows = (nameSel, rowSel) => {
  const vw = document.documentElement.clientWidth;
  const entries = [];
  for (const nm of document.querySelectorAll(nameSel)) {
    if (!nm.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    const text = directText(nm);
    if (!text) continue;
    // Split after a hyphen too, not only on whitespace: a hyphen is a normal
    // soft-wrap point (UAX #14) the same as a space, so a name breaking there
    // is "between words", not "inside" one -- the browser's own line breaker
    // already treats it that way with no extra CSS asked for.
    const words = text.split(/(?<=-)|\\s+/).filter(Boolean);
    entries.push({ nm, text, words });
  }
  // #179 fix 5a: a word's span used to be appended, measured and removed
  // one word at a time, forcing a layout on every single word across every
  // row. Batched instead -- every span for every word of every row appended
  // first, every width read second, every span removed last -- so the
  // browser only has to lay the page out once for the whole call.
  const allSpans = [];
  for (const entry of entries) {
    const cs = getComputedStyle(entry.nm);
    entry.spans = entry.words.map(word => {
      const span = document.createElement('span');
      span.style.cssText = 'position:absolute; visibility:hidden; white-space:nowrap;';
      for (const prop of WORD_FONT_PROPS) span.style[prop] = cs[prop];
      span.textContent = word;
      document.body.appendChild(span);
      allSpans.push(span);
      return span;
    });
  }
  for (const entry of entries) entry.widths = entry.spans.map(s => s.getBoundingClientRect().width);
  allSpans.forEach(s => s.remove());

  const rows = [];
  for (const { nm, text, words, widths } of entries) {
    const longest = Math.max(...widths);
    const longestWord = words[widths.indexOf(longest)];
    const row = nm.closest(rowSel);
    const rcs = getComputedStyle(row);
    let rowContent = row.clientWidth - parseFloat(rcs.paddingLeft) - parseFloat(rcs.paddingRight);
    // #179 fix 5: a non-shrinking neighbour (\`flex-shrink: 0\`/\`flex: none\`,
    // e.g. an avatar) in a horizontal flex row leaves the name less room than
    // the row's full content width. A grid row (bench mode, the season
    // ledger) sizes its columns another way and is untouched.
    if (rcs.display === 'flex' && (rcs.flexDirection === 'row' || rcs.flexDirection === 'row-reverse')) {
      const gap = parseFloat(rcs.columnGap) || 0;
      let fixedWidth = 0;
      for (const kid of row.children) {
        if (kid === nm || kid.contains(nm)) continue;
        if (parseFloat(getComputedStyle(kid).flexShrink) === 0) fixedWidth += kid.getBoundingClientRect().width;
      }
      const gaps = Math.max(row.children.length - 1, 0) * gap;
      rowContent -= fixedWidth + gaps;
    }
    const floor = Math.min(longest, rowContent);
    const nameRect = nm.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const contained = nameRect.left >= rowRect.left - 1 && nameRect.right <= rowRect.right + 1
      && nameRect.left >= -1 && nameRect.right <= vw + 1;
    rows.push({
      text, width: nm.clientWidth,
      longest: Math.round(longest * 10) / 10,
      longestWord,
      rowContent: Math.round(rowContent * 10) / 10,
      floor: Math.round(floor * 10) / 10,
      contained,
    });
  }
  return rows;
};`;

/* The wipe -> navigate -> wait -> cleanup shape three passes share:
   `firstRun` and `tryLanding` (both `app-large-text.mjs`) and `landOnNine`
   (`game-rows-fit.mjs`) each need a page that boots with no seeded record --
   `browserChecks`'s own on-new-document script re-seeds `benchcard.v3` on
   every navigation otherwise, and clearing the record in the CURRENT
   document is not enough to stop that re-seed from winning the reload (see
   the trap `firstRun` hit first, still described where it calls this). So
   the wipe rides in its own on-new-document script, added here and removed
   again in `finally` regardless of outcome -- left registered it would
   empty the record under whatever this pass runs next.
   `LOCALSTORAGE_WIPE` is the literal source all three used to carry on
   their own; this is the one place it is written now. `readyJs` is a JS
   expression evaluated in the page, polled every 50ms up to 3s until it is
   truthy -- `firstRun` waits for the welcome screen, `tryLanding` for the
   sample-flash toast, `landOnNine` for the ninth row -- so each caller keeps
   its own wait condition and its own assertions; only this boilerplate
   around them is shared. */
export const LOCALSTORAGE_WIPE = `try { localStorage.clear(); } catch {}`;

/* The navigate -> wait-for-load -> wait-for-fonts -> poll-for-ready ->
   SETTLE sequence a full-page reload needs before anything on the page can be
   measured. `goRich` (`fixtures.mjs`), `appLargeTextPass` (`app-large-text.mjs`)
   and `measureLargeText` (`phone-gutter.mjs`, under a font-size override) each
   carried an identical copy of this until it moved here.
   #125: a one-line wrapper over `land` (`page-state.mjs`) -- `record: 'kept'`
   because this function never seeded anything itself, `.card` because that
   is `land`'s own default `ready`, and `ambient`'s width/text/media because a
   caller that just set those by hand (large-text checks, ahead of their own
   migration onto `land` in a later slice) expects the reload to keep them,
   not reset to baseline. Fix pass: routed through `landKeepingAmbient` above,
   which is the ambient-read-plus-`land` half of this; see its own comment.
   `ready` is a selector, `.card` by default; `teamDefaultPass`'s
   `plainReload` (`team-color.mjs`) passes `#print`, since it reloads a
   games-view record with no card to wait for. */
export async function navigateAndWaitForCard(c, url, ready = '.card') {
  const u = new URL(url);
  await landKeepingAmbient(c, u.origin, { page: u.pathname, query: u.search, record: 'kept',
    ready: `document.querySelector(${JSON.stringify(ready)})` });
}

// Fix pass: routed through `landKeepingAmbient` above, same as
// `navigateAndWaitForCard`.
export async function landWiped(c, url, readyJs) {
  const u = new URL(url);
  await landKeepingAmbient(c, u.origin, { page: u.pathname, query: u.search, record: 'wiped', ready: readyJs });
}

/* #28's own overflow probe, for a `dialog[open]`: every visible descendant
   checked against the DIALOG's own `getBoundingClientRect`, not the
   viewport's. `dialog.bsheet` is `width: 100%; max-width: 100%`, so today the
   dialog's box and the viewport are the same width and `OVERFLOW_PROBE` above
   would catch anything this one does -- verified on this tree, at 320px with
   a 32px root, for both the Plan sheet's level 1 and its Add-a-rule page,
   before this probe existed. This one is still worth having: it is the exact
   claim "What would settle it" item 11 makes ("no horizontal overflow ...
   with the Plan sheet open"), read against the box the coach actually sees
   the sheet occupy rather than an equality (dialog width == viewport width)
   that only holds because of one CSS rule elsewhere. If that rule ever
   changes -- a narrower, centered sheet, say -- `OVERFLOW_PROBE` would go on
   reporting the viewport clean while this one caught a control the coach
   cannot reach inside the sheet itself.
   `overflow: hidden` on `dialog.bsheet` clips visually but does not change a
   descendant's own `getBoundingClientRect` -- CSS overflow never does -- so
   this does not need the ancestor-scroll skip `OVERFLOW_PROBE` carries for a
   `overflow: auto` scroller; nothing here can be legitimately reachable by
   scrolling sideways, because nothing in this sheet scrolls on the X axis. */
export const DIALOG_OVERFLOW_PROBE = `(() => {
  const dialog = document.querySelector('dialog[open]');
  if (!dialog) return JSON.stringify({ dialog: false });
  const d = dialog.getBoundingClientRect();
  const vis = el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  let worst = null;
  for (const el of dialog.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if ((!r.width && !r.height) || !vis(el)) continue;
    const over = r.right > d.right + 1 ? Math.round(r.right - d.right)
      : r.left < d.left - 1 ? Math.round(d.left - r.left) : null;
    if (over === null) continue;
    if (!worst || over > worst.out) worst = {
      el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')),
      out: over,
    };
  }
  return JSON.stringify({ dialog: true, dw: Math.round(d.width), worst });
})()`;

/* #147 item 4/#167: the same container-relative shape as `DIALOG_OVERFLOW_PROBE`
   above, for `.gm-body` (bench mode's scrolling body) instead of `dialog[open]`.
   `.gm-body` is `overflow-y: auto`, which computes its own `overflow-x` to
   `auto` too, so `OVERFLOW_PROBE` forgives sideways spill there by its own
   design -- but `.gm-body`'s `touch-action: pan-y` blocks a sideways pan to
   reach it, so this checks its own `scrollWidth` against its `clientWidth` too.
   Proof: failed on today's code before #147's `.gm-scope` -> `.seg`+`.btn`
   change (29 to 340 against a 320px `.gm-body`). */
export const GM_BODY_OVERFLOW_PROBE = `(() => {
  const body = document.querySelector('.gm-body');
  if (!body) return JSON.stringify({ body: false });
  const b = body.getBoundingClientRect();
  const vis = el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  let worst = null;
  for (const el of body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if ((!r.width && !r.height) || !vis(el)) continue;
    const over = r.right > b.right + 1 ? Math.round(r.right - b.right)
      : r.left < b.left - 1 ? Math.round(b.left - r.left) : null;
    if (over === null) continue;
    if (!worst || over > worst.out) worst = {
      el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')),
      out: over,
    };
  }
  return JSON.stringify({
    body: true, scrollWidth: Math.round(body.scrollWidth), clientWidth: Math.round(body.clientWidth), worst,
  });
})()`;

/* The large-text sweep's reading of GM_BODY_OVERFLOW_PROBE: a problem, or
   null. rule 2a: an absent .gm-body fails rather than measuring nothing. */
export async function gmBodyProblem(c) {
  const gb = JSON.parse(await evalIn(c, GM_BODY_OVERFLOW_PROBE));
  if (!gb.body) return 'no .gm-body to check for a body-relative sideways spill';
  if (gb.scrollWidth > gb.clientWidth + 1) return `.gm-body scrollWidth ${gb.scrollWidth} exceeds its clientWidth ${gb.clientWidth}`;
  return gb.worst ? `${gb.worst.el} reaches ${gb.worst.out}px past .gm-body's own box` : null;
}
