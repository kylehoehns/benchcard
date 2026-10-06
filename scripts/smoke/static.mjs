import { evalIn, OVERFLOW_PROBE, WORST_OUTSIDE, IS_CUT } from './dom.mjs';
import { land } from './page-state.mjs';
import { LARGE_TEXT, LARGE_TEXT_PX, LARGE_TEXT_WIDTH, TOUCH_CHECK } from './sizes.mjs';

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

/* #338. The page's own scroll width against its client width, which is the
   number the issue reported (391 in a 390px viewport). `OVERFLOW_PROBE` above
   tolerates 1px per element and so let a 0.67px overshoot through; this one
   tolerates nothing. */
const SCROLL_PROBE = `JSON.stringify({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`;

/* #338. The two guides draw their mocks inside `.plate` cards. This reports
   how many plates the page has and the visible descendant that sticks out
   furthest past its own plate's box, on either edge (`WORST_OUTSIDE`, dom.mjs:
   1px of slack for rounding). `right` and `plate` are the overhanging edge's
   coordinate and the plate's matching edge, so a left-edge failure reads like
   a right-edge one. A page with no plate reports `plates: 0`, which the caller
   fails: a check that measured nothing is not a clean result. */
const PLATE_PROBE = `(() => {
  const isCut = ${IS_CUT};
  const plates = [...document.querySelectorAll('.plate')];
  let worst = null;
  for (const plate of plates) {
    /* No opacity flag: a .reveal block is opacity 0 until scrolled to, and a
       box that is laid out past its plate is the defect either way. */
    const w = ${WORST_OUTSIDE}(plate, false);
    if (w && (!worst || w.out > worst.out)) {
      worst = { el: w.el, text: (w.node.textContent || '').trim().slice(0, 20),
        right: Math.round(w.at * 10) / 10, plate: Math.round(w.edgeOf * 10) / 10, out: Math.round(w.out * 10) / 10 };
    }
  }
  /* A name cut to "B..." fits its box, so the overflow test above passes it.
     scrollWidth over clientWidth is what an ellipsis leaves behind. Zero
     tolerance on purpose: both are integers, and a 1px cut is a cut name. */
  const names = [...document.querySelectorAll('.plate .nm')];
  const cut = names.filter(n => isCut(n, 0)).map(n => (n.textContent || '').trim());
  return JSON.stringify({ plates: plates.length, worst, names: names.length, cut });
})()`;
const PLATE_PAGES = new Set(['/about', '/advanced']);

/* The checks every cell gets, at any width and text size, on every page. */
async function cellChecks(c, page, where, problems) {
  const sc = JSON.parse(await evalIn(c, SCROLL_PROBE));
  if (sc.sw > sc.cw) problems.push(`${where}: scrollWidth ${sc.sw}px exceeds clientWidth ${sc.cw}px`);
  if (!PLATE_PAGES.has(page)) return;
  const pl = JSON.parse(await evalIn(c, PLATE_PROBE));
  if (!pl.plates) problems.push(`${where}: no .plate on the page, so nothing was measured`);
  else if (pl.worst) {
    const w = pl.worst;
    problems.push(`${where}: ${w.el} "${w.text}" reaches ${w.right}px, past its plate's edge at ${w.plate}px`);
  }
  if (page === '/about' && !pl.names) problems.push(`${where}: no .plate .nm on the page, so no name was measured`);
  if (pl.cut.length) problems.push(`${where}: names cut off in the plate: ${pl.cut.join(', ')}`);
}

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
 * TWO CELLS, NOT A MATRIX. 320px and 390px, each at a 32px root, and nothing
 * else. `19em` is 304px at a 16px root and 608px at a 32px one, so the
 * narrow-and-large corner is the only place the large-text rules are live and
 * the column is still short. 320px held every failure the first time this was
 * measured, and the header here used to say 390 was clean at both font sizes;
 * that was assumed, not measured, and #338 found it false on `about.html`
 * (its plan card's track was about 12px wide and the Q labels overlapped, with
 * nothing reaching past the viewport for the page probe to see). So both
 * widths run on all eight pages: sixteen navigations rather than the
 * thirty-two of the whole grid, and the cells with the information in them.
 *
 * THE ALLOWANCE: `LARGE_TEXT_ALLOW` below is empty, and every page is pinned
 * at zero. Do NOT add a number to make a new failure go away -- a new overflow
 * is a bug on a crawlable landing page. Fix the page, or accept the residue
 * deliberately and write the reason next to the number.
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
/* 320 is where the large-text media queries are narrowest; 390 is where they
   are still live (`19em` is 608px at this root) and the column is wider. */
const LARGE_TEXT_WIDTHS = [LARGE_TEXT_WIDTH, STATIC_WIDTHS[0]];

export async function staticPass(c, source, origin) {
  const problems = [];
  const visited = [];
  let images = 0;
  for (const page of STATIC_PAGES) {
    for (const w of STATIC_WIDTHS) {
      const where = `${page}@${w}px`;
      try {
        // These pages have no app to boot (`ready: 'true'`); fonts are what moves the layout.
        await land(c, origin, { page, record: 'kept', width: w, ready: 'true' });

        const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
        if (o.pans) problems.push(`${where}: page pans sideways`);
        if (o.worst) problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`);
        await cellChecks(c, page, where, problems);

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

  /* The large-text cell. See LARGE_TEXT_* above for why it is two cells and why
     the allowance map is empty. Reloaded at each page like the pass above:
     a font-size change without a reload leaves the layout unreflowed and
     reports a width that was never rendered. */
  let allowed = 0;
  for (const [page, width] of STATIC_PAGES.flatMap(p => LARGE_TEXT_WIDTHS.map(w => [p, w]))) {
    const where = `${page}@${width}px/${LARGE_TEXT_PX}px text`;
    try {
      await land(c, origin, { page, record: 'kept', ...LARGE_TEXT, width, ready: 'true' });

      const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
      const slack = LARGE_TEXT_ALLOW[page] || 0;
      if (o.pans) problems.push(`${where}: page pans sideways`);
      if (o.worst && o.worst.out > slack) {
        problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`
          + (slack ? ` (${slack}px allowed)` : ''));
      } else if (o.worst) allowed++;
      await cellChecks(c, page, where, problems);
    } catch (e) {
      problems.push(`${where}: ${e.message.split('\n')[0]}`);
    }
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${visited.length} pages × ${STATIC_WIDTHS.join('/')}px + ${LARGE_TEXT_WIDTHS.join('/')}px@${LARGE_TEXT_PX}px text, `
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
