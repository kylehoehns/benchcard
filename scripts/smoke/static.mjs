import { evalIn, HEIGHT, OVERFLOW_PROBE } from './dom.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH, TOUCH_CHECK } from './registry.mjs';

/* The pages no browser check had ever loaded.
 *
 * Everything above this drives `index.html` and only `index.html`. The site is
 * nine pages: the app, `about.html`, `advanced.html`, and the six roster-size chart pages that
 * `scripts/charts.mjs` generates. The other seven were audited by nothing —
 * which is why `images declare alt text` reported "0 image(s)" on every
 * evaluation of a run while the app's only two <img> sat on `about.html`, and
 * why five real defects on these pages were found with a tape measure rather
 * than by CI (a shape mock 640px wide in a 390px viewport, a top-bar button
 * reaching 432px, the chart pages' bar overflowing at large text, a JSON-LD
 * arithmetic error, a missing og:image:alt on seven of eight pages).
 *
 * ALL SIX CHART PAGES, not one representative. Their *structure* cannot drift
 * — `charts.mjs --check` fails the suite the moment a page on disk stops
 * matching the generator. What varies page to page is the card: two names on
 * the change line at 7 players and three at 12, different auto-fit type sizes,
 * and a minutes footer of 7 names or of 12. That is exactly what could make
 * one page overflow and not another, and there is no single worst case to
 * nominate — 12 has the longest lines, 7 has the largest type. Measured, the
 * whole pass costs about four seconds, so the honest option is also the cheap
 * one.
 *
 * TWO WIDTHS, RELOADED AT EACH, not the 300-420 sweep. That sweep exists
 * because the app's top bar has an intrinsic floor that moves between
 * narrowing stages; these pages have no such chrome. And reloaded rather than
 * resized in place: a resize without a reload leaves the layout unreflowed and
 * reports a width that was never rendered.
 *
 * WHAT IT DOES NOT ASSERT, deliberately — each of these is a decision someone
 * will otherwise "fix", so the reason is on the line:
 *   - the card size. The chart pages' card is responsive on screen (293px wide
 *     at a 320px viewport); its printed size comes from `@media print`, which
 *     this harness does not emulate.
 *   - link resolution. These pages link extensionless absolute URLs (`/about`,
 *     `/7-player-...`) which the static server above does not route, so it
 *     would invent 404s. `scripts/redirect-check.mjs` already answers that
 *     question against production-shaped rules.
 *
 * Console errors are covered for free: this runs inside the same CDP session,
 * before the `no console errors` verdict is assembled, so that check now
 * covers seven more pages than it used to. */
/* The URLs A READER GETS, not the files on disk. These were the `.html`
   spellings until September 2026, which meant the eight checks below measured
   eight addresses nothing on the site links to -- and would have kept passing
   while the real ones broke. `scripts/serve.mjs` 307s `.html` to these, the
   same as Cloudflare. */
const STATIC_PAGES = ['/about', '/advanced', ...[7, 8, 9, 10, 11, 12].map(n => `/${n}-player-basketball-rotation-chart`)];
const STATIC_WIDTHS = [390, 320];

/* ---- the large-text pass ----
 *
 * WHY IT EXISTS. The six chart pages overflowed 22px at 320px with the
 * browser's default font size at 32px — a reader on 200% text, which is a
 * supported OS setting, not an exotic one — and this check was green through
 * all of it, because it never emulated a font size. `about.html` carried the
 * one-line fix (`footer a { overflow-wrap: anywhere }` under `19em`) and the
 * generator did not; the pages measured 342 in a 320px viewport with the
 * footer's mail address as the worst element. Found with a tape measure, which
 * is the second defect on these pages found that way. A check that only ever
 * asks at 16px is not measuring the case that broke.
 *
 * ONE CELL, NOT A MATRIX. 320px at a 32px root, and nothing else. Measured
 * across all seven pages × 390/320 × 16/32px, every failure in the whole grid
 * sits in that one cell: 390 is clean at both font sizes and 320 is clean at
 * 16px, because `19em` is 304px at a 16px root and 608px at a 32px one — the
 * narrow-and-large corner is the only place the large-text rules are live and
 * the column is still short. So the pass costs seven navigations, not
 * twenty-eight, and it is the cell with all the information in it.
 *
 * THE ALLOWANCE, and it is the part to read before changing it. `about.html`
 * has a RECORDED, ACCEPTED 7px overflow in exactly this cell: a `span.nm` in a
 * drawn mock reaching 327px. It predates this check, it is accepted residue
 * rather than something to chase, and a pass added without an
 * allowance would go red on day one and be switched off by the next person —
 * which is how a check stops being read. So the residue is named at PAGE
 * granularity with the smallest number that covers it, rather than as a
 * blanket tolerance: every other page is pinned at zero, so the 22px defect
 * this pass was built for fails on any of the six, and would fail on
 * `about.html` too. Do NOT raise a number here to make a new failure go away —
 * a new overflow is a bug on a crawlable landing page. Fix the page, or accept
 * the residue deliberately and write the reason here, next to the number.
 *
 * The existing 390/320 pass at the default font size is untouched: this is an
 * addition, not a relaxation. */
/* EMPTY, and it should stay that way. It held `{'/about.html': 8}` for one
   week: five 16px names in a narrow column inside that page's drawn card mock.
   Slice 2 declined to copy the 8 onto `advanced.html` and fixed the same
   overflow ON that page instead (`.paper .five` wraps inside the `19em` cell);
   A20 slice 3 then moved the mock off `about.html` altogether, so the last
   recorded residue on the site went with it -- re-measured at 0 rather than
   assumed. A number here is an accepted defect on a crawlable page; add one
   only with the finding and the reason for accepting it written here. */
const LARGE_TEXT_ALLOW = {};

export async function staticPass(c, source, origin) {
  const problems = [];
  const visited = [];
  let images = 0;
  for (const page of STATIC_PAGES) {
    for (const w of STATIC_WIDTHS) {
      const where = `${page}@${w}px`;
      try {
        await c.send('Emulation.setDeviceMetricsOverride',
          { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
        const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
        await c.send('Page.navigate', { url: origin + page });
        await loaded;
        // These pages have no app to boot; fonts are what moves the layout.
        await evalIn(c, `document.fonts.ready`);
        await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);

        const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
        if (o.pans) problems.push(`${where}: page pans sideways`);
        if (o.worst) problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`);

        // The static verdicts do not change with width; ask them once, wide.
        if (w !== STATIC_WIDTHS[0]) continue;
        visited.push(page);
        const report = await evalIn(c, source);
        const alt = report.checks.find(k => k.name === 'images declare alt text');
        if (alt?.pass) images += Number((alt.detail.match(/(\d+) image/) || [])[1] || 0);
        for (const chk of report.checks) {
          if (!STATIC_A11Y.has(chk.name) || chk.pass) continue;
          problems.push(`${page} — ${chk.name}: ${chk.detail}`);
        }
      } catch (e) {
        problems.push(`${where}: ${e.message.split('\n')[0]}`);
      }
    }
  }

  /* The large-text cell. See LARGE_TEXT_* above for why it is one cell and why
     `about.html` has an allowance. Reloaded at each page like the pass above:
     a font-size change without a reload leaves the layout unreflowed and
     reports a width that was never rendered. */
  let allowed = 0;
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    for (const page of STATIC_PAGES) {
      const where = `${page}@${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
      try {
        await c.send('Emulation.setDeviceMetricsOverride',
          { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
        const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
        await c.send('Page.navigate', { url: origin + page });
        await loaded;
        await evalIn(c, `document.fonts.ready`);
        await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);

        const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
        const slack = LARGE_TEXT_ALLOW[page] || 0;
        if (o.pans) problems.push(`${where}: page pans sideways`);
        if (o.worst && o.worst.out > slack) {
          problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`
            + (slack ? ` (${slack}px allowed)` : ''));
        } else if (o.worst) allowed++;
      } catch (e) {
        problems.push(`${where}: ${e.message.split('\n')[0]}`);
      }
    }
  } finally {
    // Never leave the emulated font size on: every check after this one runs
    // in the same CDP session and would silently measure a 200% reader.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
  }

  return {
    name: nameOf('static'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${visited.length} pages × ${STATIC_WIDTHS.join('/')}px + ${LARGE_TEXT_WIDTH}px@${LARGE_TEXT_PX}px text, `
        + `${images} image(s) with alt, no overflow`
        + (allowed ? ` (${allowed} recorded residue)` : '')
        + `, ids and lang clean, ${TOUCH_CHECK}`,
  };
}

/* Not `A11Y`: that set carries the dialog check, which has no dialogs to find
   here, and it is scoped to the app's overlay states. These are the verdicts
   that mean something on a page of prose.

   `touch targets` was excluded when this pass shipped, because all seven pages
   failed it: a 118x27 wordmark linking home and 24px footer links, on chrome
   that is tapped on a phone exactly like the app's is. That was a real defect
   on the pages, not a rule that did not apply to them, so the pages were fixed
   (a `min-height` on `.mark` and on `footer a`, in about.html's own stylesheet
   and in charts.mjs) and the check joined the set. The one remaining flag was
   the FAQ's inline link inside a `<dd>`, which was the app rule's prose
   exemption being one selector short — `dd` is now in it. */
const STATIC_A11Y = new Set([
  'controls have accessible names',
  'images declare alt text',
  'ids unique, aria references resolve',
  'document lang, title, tab order',
  TOUCH_CHECK,
]);
