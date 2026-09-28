/* #177 item 1: "same font on both machines." `smoke.mjs` registers
 * `smoke-font.mjs`'s `FONT_INJECTION_SCRIPT` on every new document, before the
 * page's own scripts run, so by the time anything here measures, DejaVu Sans
 * is already the only face `--font` can resolve to. This row is what actually
 * proves that landed: CDP `CSS.getPlatformFontsForNode` reports the physical
 * face Chromium drew a node's text in, which is the one thing a computed-style
 * read (`getComputedStyle(el).fontFamily`) cannot show -- that still reads
 * back the CSS font-family LIST, DejaVu Sans first or not, whether or not the
 * browser actually had it to draw with.
 *
 * `CSS.getPlatformFontsForNode` needs a `nodeId`, which needs `DOM.enable`;
 * the domain call itself needs `CSS.enable` (Design section). Both are turned
 * on here and off again in a `finally`, per that section's own warning that
 * leaving them on could change another row's own behavior.
 *
 * Five places, matching item 1's own list, all reached from the rich fixture
 * with real clicks. A rich row's own `run` is called wherever the row before
 * it in registry.mjs order left the page -- `fixturePass` right before this
 * one navigates through Team and Season and back -- so this row calls
 * `goRich` itself first, the same reload `--only` already gets for free, so
 * it lands on the per-game screen (`RICH.view` is 'games') the same way
 * whether it runs on its own or after every row ahead of it. Reproduced: a
 * full run left every place here reporting "no glyphs drawn" -- an element
 * that resolves but was never actually painted -- while `--only "text draws
 * in DejaVu Sans"` passed on the exact same tree, which is what a row that
 * trusts the row before it to leave the screen it wants looks like.
 *   - a heading:      #gameTitle (the opponent's own <h1>)
 *   - a button label: #regen ("Shuffle")
 *   - body text:      .who-row .prow-t, inside the Who's here sheet
 *   - a weight-600 name: .gm-p .nm, inside bench mode's floor -- reached
 *     through #abBench, the phone-width entry point (`#gmOpen` is hidden
 *     below 840px, `gm-open.mjs`'s own comment)
 *   - a sheet's text at 320px/32px: .who-row .prow-t again, after the same
 *     `Page.setFontSizes` + `Emulation.setDeviceMetricsOverride` +
 *     `navigateAndWaitForCard` reload `app-large-text.mjs` uses for its own
 *     large-text pass -- a font-size change needs a reload to apply, and the
 *     font-injection script runs again on that new document the same as
 *     every other reload's does, so this proves the font survives it rather
 *     than only ever being checked once, right after `goRich`.
 * The printed card (InterVar) and the paste box's monospace textarea are
 * excluded by name: neither is in the list above.
 *
 * Nothing here adds a request or a DOM node of its own -- it only reads
 * platform fonts and clicks existing controls -- so the three smoke budgets
 * are untouched by this row, on top of never moving from the injection itself
 * (`smoke-font.mjs`'s own comment). */
import { evalIn, step, WIDTH, HEIGHT, navigateAndWaitForCard } from './dom.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';
import { SMOKE_FONT_FAMILY } from './smoke-font.mjs';
import { goRich } from './fixtures.mjs';

// Runtime.evaluate without returnByValue hands back an objectId for a real
// element (needed for DOM.requestNode -> CSS.getPlatformFontsForNode); a
// selector matching nothing evaluates to `null`, which carries no objectId.
async function nodeIdFor(c, selector) {
  const { result, exceptionDetails } = await c.send('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(selector)})`,
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
  if (!result.objectId) return null;
  const { nodeId } = await c.send('DOM.requestNode', { objectId: result.objectId });
  return nodeId;
}

export async function fontDrawsPass(c, origin) {
  // #177 fix (see the module comment above): its own reload, not whatever
  // screen the row before it left the page on.
  await goRich(c, origin);

  const problems = [];
  const checked = [];

  // Rule 2a: a place that never got measured is a failure, not a skip, so
  // every call site below runs through this one gate.
  async function check(label, selector) {
    const nodeId = await nodeIdFor(c, selector);
    if (nodeId == null) {
      problems.push(`${label}: no element matched ${selector} -- nothing was measured`);
      return;
    }
    const { fonts } = await c.send('CSS.getPlatformFontsForNode', { nodeId });
    if (!fonts.length) {
      problems.push(`${label} (${selector}): CSS.getPlatformFontsForNode reported no glyphs drawn -- nothing was measured`);
      return;
    }
    const other = [...new Set(fonts.filter(f => f.familyName !== SMOKE_FONT_FAMILY).map(f => f.familyName))];
    if (other.length) {
      problems.push(`${label} (${selector}) drew in ${other.join(', ')}, not ${SMOKE_FONT_FAMILY}`);
    } else {
      checked.push(label);
    }
  }

  await c.send('DOM.enable');
  await c.send('CSS.enable');
  // DOM.requestNode below only resolves a nodeId once the DOM domain has
  // fetched the document tree at least once -- without this, CDP reports
  // "Could not find node with given id" for every node, having tracked none.
  await c.send('DOM.getDocument');
  try {
    await check('heading', '#gameTitle');
    await check('button label', '#regen');

    await evalIn(c, step(`$('#phrasePlayers').click()`));
    await check('body text', '.who-row .prow-t');
    await evalIn(c, step(`$('#sheetWho').close()`));

    await evalIn(c, step(`$('#abBench').click()`));
    await check('weight-600 name', '.gm-p .nm');
    await evalIn(c, step(`$('#gmClose').click()`));

    // The sheet's text at 320px/32px -- same technique as appLargeTextPass.
    await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
    try {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
      await navigateAndWaitForCard(c, origin + '/index.html');
      // A reload replaces the whole document, so the DOM domain's node table
      // (populated by the DOM.getDocument above, before this reload) no
      // longer has anything valid to hand `check` -- refetch it for the new
      // document before asking for a node in it.
      await c.send('DOM.getDocument');
      await evalIn(c, step(`$('#phrasePlayers').click()`));
      await check(`sheet text at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px`, '.who-row .prow-t');
      await evalIn(c, step(`$('#sheetWho').close()`));
    } finally {
      await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    }
  } finally {
    await c.send('CSS.disable');
    await c.send('DOM.disable');
  }

  // Rule 2a again, for the row as a whole: five places named above, so fewer
  // than five checked-or-flagged outcomes means one silently never ran.
  const total = checked.length + problems.length;
  if (total < 5) problems.push(`only ${total}/5 places were checked -- one silently never ran`);

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.join(' | ')}`
      : `${checked.length} place(s) drew only in ${SMOKE_FONT_FAMILY}: ${checked.join(', ')}`,
  };
}
