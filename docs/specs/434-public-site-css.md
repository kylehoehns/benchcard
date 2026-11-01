# 434 — one shared stylesheet for the public pages

## Issue

#434: the public pages (About, Advanced, the eight chart pages) each carry their
own inline `<style>` that restates the same headings, buttons, chips, footer
and Hardwood tint; move the shared part into one sheet built on `tokens.css`,
set Hardwood once, and draw About's sample timeline with the app's own CSS and
markup.

## Goal

A reader sees the same pages they see today. The difference is for whoever
edits them next: a heading, a button, a chip or the Hardwood orange is written
once, in `app/site.css`, so the pages cannot drift apart again, and About's
timeline is the app's own timeline rather than a lookalike that has to be kept
in step by hand.

## What the survey found (choices made where the issue did not decide)

- **There is a fourth public page.** `404.html` carries its own inline sheet
  and a fourth copy of the Hardwood block. The issue says to set Hardwood "in
  that one place", so 404 links `site.css` too and loses its copy. It keeps
  its own `nav` rules inline (only it has them).
- **"Remove the per-page inline blocks" vs. "except what a page truly needs
  alone".** Rule used: a rule worn by two or more public pages goes to
  `site.css` (the eight chart pages count as several pages, so the chart-only
  rules — `.chart-stage`, `.trust`, `[data-draft]` — go there too, from the
  generator). A rule worn by exactly one page stays inline on that page:
  About's steps, level chooser, screenshots/bezel, FAQ and reveal rules;
  Advanced's `.seg`, `.scope`, `.sn-*`, `.switch`, `.paper`, `.legend`; 404's
  `nav`. That is also what keeps the name-level collision guard quiet:
  Advanced's `.paper` mock reuses nine `card.css` class names, and the chart
  pages link `card.css`, so those rules must not move into a sheet the chart
  pages load.
- **`--sp-*` are px; the pages' gaps are rem.** At a 32px root every gap on
  these pages doubles today. Mapping them onto `--sp-*` would halve them in the
  32px shots, a visible change the acceptance forbids. Gaps stay rem.
- **Body text is `17px` (18px on desktop), not rem.** Mapping it to
  `--fs-headline` (1.0625rem) would double body text in every 32px shot.
  That is arguably better for a big-text reader, but it is a different page,
  and the acceptance is "no unintended change". Body stays px; a separate
  issue can take it.
- **Type sizes map onto `--fs-*` where a token is within about 1px at a 16px
  root** (rem to rem, so the 32px shots scale exactly as before):
  `.mark b` 1.05rem → `--fs-headline`; `h3` 1.02rem → `--fs-headline`;
  `p.lead` 1.06rem → `--fs-headline`; `h2` 1.32rem → `--fs-title`;
  desktop `h2` 1.8rem → `--fs-flow`; `figcaption` .88rem → `--fs-secondary`;
  `.rrule` .86rem → `--fs-secondary`; `.jumpto-hd` .82rem → `--fs-footnote`;
  `h1`'s floor → `--fs-flow`. Values with no token that close keep their
  number: `.lede` 1.16rem, `.btn`/`.sizes a` .95rem (16px would widen every
  button and risk a wrap at 320/32), `.plate-hd` .68rem, footer .92rem.
- **Where the pages disagreed, they now agree** (the only intended changes):
  - `h1`: three formulas → one, `min(clamp(var(--fs-flow), 7.5vw, 2.7rem), 13vw)`
    (the chart pages' shape). At 390/16 About goes 32 → 30px, Advanced
    28.8 → 30px, charts 30.4 → 30px. About's `19em` `h1 { font-size: 10vw }`
    override goes; if smoke then finds About's h1 wider than its column at
    320/32, the override stays (in `site.css`, for every page).
  - `h2`: charts 1.15rem → `--fs-title` like the others; section rhythm on
    the charts (1.6/2.2rem) → About/Advanced's 1.9/2.9rem.
  - The chart pages get About/Advanced's top bar markup (`.topbar > .top`
    outside `.wrap`, gutter on `.wrap` not `body`), so the bar sticks there
    too at a normal root and stays static at 32px. It is `.noprint`, so the
    printed card is unchanged.
  - 404's `Open Benchcard` becomes `btn primary` (it was a hand-rolled primary
    button with its own `.btn` rule).
- **About's timeline (item 3).** The app's timeline rules live in `app.css`,
  which About cannot load (it is the whole app shell). So they move, unchanged,
  into a new `app/timeline.css`: every `.tl*` rule from `app.css`'s timeline
  section (`.tl` through `.tld*`, including skeleton, hover and pin rules, so
  `app.css` keeps no `.tl*` selector and the collision guard has no `.tl-row`
  pair to excuse), plus the two `.tl-row`/`.tl-tot .num` lines from `app.css`'s
  `19em` block and the `.tl-blk` line from its `forced-colors` block, each
  under its own copy of that media query. `index.html` links it directly
  after `app.css`; About links it after `site.css`. About's figure then uses
  the markup `timeline.js` builds (`.tl > .tl-head > div + .tl-periods + div`,
  `.tl-body > .tl-row > .tl-lab + .tl-track + .tl-tot > .num + .ex`), with the
  dot and name directly in `.tl-lab` (no `<button class="tl-name">`: nothing
  on About is tappable there). About's `.tl-*` rules, its `.tl-div.onblk`
  dark rule and the `onblk` markup go. The figure will look like the app's
  timeline now (notches instead of hairlines, app type sizes): that is the
  point of the item, and the only change to About's look beyond the h1.
- **Hardwood contrast on the timeline total.** The app paints `.tl-tot.hi`
  with `--accent`; on About that is Hardwood, 3.9:1 on light, under #332's
  4.5:1. `timeline.css` reads `var(--tl-hi, var(--accent))`; `site.css` sets
  `--tl-hi: var(--accent-text)`. The app declares no `--tl-hi`, so it paints
  exactly as before. The smoke row `hardwood pages` already measures
  `.tl-tot.hi` on About and keeps doing so.
- **The two known 32px wraps** (`hello@benchcard.app` breaking in the footer,
  a clock range splitting at 320px) are left alone: the shared sheet does not
  make either easier, and changing them is a look change of its own.

## What would settle it

1. No public page (about, advanced, the eight chart pages, 404) has an inline
   `<style>` except the page-only rules listed above and the chart pages'
   one-line `<noscript>` print-button rule.
2. The Hardwood block (`html:root[data-tint="hardwood"]` and its #332 arms)
   appears in exactly one file under `app/`: `site.css`.
3. `app.css` contains no selector naming a `.tl` or `.tl-*` class; About's
   timeline markup uses `.tl-head`, `.tl-periods`, `.tl-body`, `.tl-row`,
   `.tl-lab`, `.tl-track`, `.tl-blk`, `.tl-div`, `.tl-tot`, `.num` and `.ex`,
   and About links `timeline.css`.
4. The app's own timeline is pixel-for-pixel what it was: the `games` view at
   320 and 390, 16 and 32px, light and dark (`scripts/look.mjs --view games`),
   before vs. after.
5. Before/after full-height screenshots of every public page at 320 and 390,
   16 and 32px, light and dark, show no difference except the intended ones
   listed above.
6. `site.css` and `timeline.css` are in `sw.js`'s `PRECACHE` (About and
   Advanced are precached and need them offline; `index.html` needs
   `timeline.css`).
7. `npm run smoke` green, including every static-page row at 0 and the
   `hardwood pages` row.
8. Lighthouse on About and one chart page does not drop against `main`.

## Surfaces

Change: `app/site.css` (new), `app/timeline.css` (new), `app/app.css` (the
timeline section leaves), `app/index.html` (one `<link>`), `app/about.html`,
`app/advanced.html`, `app/404.html`, `scripts/charts.mjs` and the eight
regenerated chart pages, `app/sw.js`, `scripts/budgets.mjs` (the `requests`
pin moves by one: `timeline.css` joins the app's cold load on purpose), and
the guards that read a page's inline `<style>` (`test/contrast.test.js`,
`test/dead-static.test.js`, `test/hover-guard.test.js`,
`test/css-collide.test.js`, `test/about-reveal.test.js`,
`test/faq-jsonld.test.js`, `test/charts.test.js` and any other the suite
names) so each reads `site.css`/`timeline.css` where the rule now lives.

Must not change: `app/engine.js`, `app/state.js` (another lane), `app/timeline.js`,
`tokens.css`'s values, `card.css`, the printed card.

## Constraints

- `AGENTS.md` § Rules: mobile first (390×844 first); never regress the card;
  the chart pages are generated — edit `scripts/charts.mjs` and regenerate,
  never the pages by hand.
- Reuse, do not re-derive: the Hardwood block, the top bar, `.btn`, `.sizes`,
  `.jumpto`, `.strip`, `.rrule`, footer and the sticky-bar media query each
  exist in one place (`site.css`). The timeline exists in one place
  (`timeline.css`). Keep the existing comments that explain a rule's reason,
  once, beside the rule in its new home.
- Precache rule (`app/sw.js` header, `AGENTS.md` § Deploy): every file a
  precached page needs offline is in `PRECACHE`.
- `requests` is the one real budget pin: re-pin it by exactly one in
  `scripts/budgets.mjs`, saying it is `timeline.css`. Re-pin `bytes` only if
  it trips, to the measured cold load. Never `--update-budgets`.
- A guard edited here is a guard under `/new-guard`: show each one red
  against a broken tree before trusting it green.
- Static-page allow maps stay at zero (`LARGE_TEXT_ALLOW`, `APP_LARGE_TEXT_ALLOW`).
- `css-collide`: new `ALLOWED` entries only for real, reasoned name-only
  collisions (e.g. `nm`/`dot` between `timeline.css` and `card.css`/`app.css`
  on `index.html`, which today are `app.css`'s own entries moving with the
  rules). Rename a page-only class rather than allow a collision on a public
  page (About's level chooser `.lv-lab .dot`/`.nm` → page-only names).

## Design

1. `app/site.css`: the shared rules, in the order About's sheet has them,
   with the token mapping above, the unified h1/h2/section, the chart-only
   rules, `--tl-hi`, and the Hardwood block once.
2. `app/timeline.css`: the `app.css` timeline section moved verbatim plus
   the `19em` and `forced-colors` lines, and the `--tl-hi` hook on `.tl-tot.hi`.
3. Pages link `tokens.css`, then (charts) `card.css`, then `site.css`, then
   (About) `timeline.css`, then any page-only inline block. 404 uses
   root-relative `/site.css`.
4. `scripts/charts.mjs` emits the new head and top-bar markup and no inline
   block; regenerate the eight pages.

## Proof

- **Smoke** (`npm run smoke`): the static-page rows (overflow, 32px pass,
  touch targets, plate/name cut-off on the guides) and `hardwood pages`
  cover settle-items 5 and 7 in a browser; the app rows (`game rows fit`,
  clip sweep, app large text) cover the moved timeline.
- **Guards** under `/new-guard`, as `node --test`: a test that the Hardwood
  block appears in exactly one `app/` file (item 2); that no public page
  carries an inline rule that `site.css` also defines and that `app.css`
  names no `.tl*` class (items 1, 3); `sw.test.js` for item 6. `dead-static`
  gains `site.css` (and `timeline.css` on About) in direction 1, and checks
  `site.css` in direction 2 against the union of the pages that link it.
- **Look check** by the orchestrator: before/after full-height captures of
  every public page and `look.mjs --view games` (items 4, 5); Lighthouse
  median-of-3 on About and the 8-player page against `main` (item 8).

## Out of scope

Body text in rem, `--sp-*` spacing, the two known 32px wraps, any change to
the app's own look, `index.html` beyond the one `<link>`.
