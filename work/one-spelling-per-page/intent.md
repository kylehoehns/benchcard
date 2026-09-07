# Intent: one page, two spellings, and neither one works everywhere

**Stage 1.** The problem, written down. No spec and no plan yet, deliberately —
this is what Stage 1 looks like.

Prompted by a Search Console mail on 2026-09-06 reporting "Page with redirect"
and "Alternate page with proper canonical tag". **Neither of those is a
defect** — they are Google correctly describing `html_handling:
auto-trailing-slash` and the `?try=N` canonical, and the right action on both
is to press nothing. What the mail did surface, on the way to that conclusion,
is below.

## Problem

`scripts/charts.mjs:315` states the rule this repo works to:

> Internal hrefs keep the .html spelling so the pages also work under
> `python3 -m http.server`, and so the precached spelling and the linked
> spelling stay the same as they are for about.html.

**`about.html` and `advanced.html` break that rule eleven times.** Every link
from About to the reference page (`about.html:804,864,948,999,1025,1045,1179`)
and every link back (`advanced.html:366,371,676,685`) is extensionless. So the
two pages this app precaches for a gym with no signal can only reach each other
by a spelling nothing serves offline.

Both reasons the rule gives are real, and both bite. Measured on this tree,
2026-09-06:

| Spelling | Cloudflare | `python3 -m http.server` | offline | crawler |
| --- | --- | --- | --- | --- |
| `./about.html` | 307 → `/about` | 200 | the About page | a wasted hop |
| `./about` | 200 | **404** | **the app shell** | the canonical URL |

Neither column set is right. The `.html` spelling is the one that works in a
browser and the one no canonical names; the extensionless spelling is the one
`sitemap.xml` ships and the one that is broken in two places.

**The offline half**, from an adapted `scripts/redirect-check.mjs` — the
harness that exists for exactly this class of Cloudflare-versus-local drift:

```
OFFLINE /about.html    -> "How Benchcard plans basketball substitutions"   correct
OFFLINE /about         -> the app shell                                    WRONG
OFFLINE /advanced.html -> "Benchcard reference: every setting, rule..."    correct
OFFLINE /advanced      -> the app shell                                    WRONG
```

`sw.js` precaches `./about.html` and `./advanced.html`. `cache.match(req, {
ignoreSearch: true })` ignores the query string, not the extension, so `/about`
misses, falls through to the offline navigation fallback, and is handed
`index.html`. No error, no clue — the coach gets the app instead of the page
they tapped. **Precaching `advanced.html` currently buys nothing**, because no
href on the site uses the spelling it is stored under.

**The local half**: those same eleven links 404 under the server `AGENTS.md`
tells you to use. Verified against `python3 -m http.server` on `app/`.

**The crawler half**, which is the smallest of the three. Internal links by
target, counted across `app/*.html`:

| Target | `.html` links | extensionless |
| --- | --- | --- |
| six chart pages | 36 | **0** |
| about | 16 | 4 |
| advanced | 0 | 7 |

Every `<loc>` in `sitemap.xml` is extensionless. The chart pages' canonical
URLs therefore receive zero internal links, and every path a crawler can walk
to them goes through a 307 first. Three of nine URLs are sitting in
"Discovered – currently not indexed" with **last crawled: N/A**. That is mostly
a young domain being rationed crawl budget and no edit here will hurry it —
**do not let the spec promise otherwise.** It is listed because it is the third
symptom of the one inconsistency, not because it is the reason to fix it.

## Proposed outcome

One spelling per page, used by every href, precached under that spelling,
served by the local dev server, and named by the canonical. Which spelling is
the spec's call — see the open questions; the extensionless one is not
obviously the winner.

What is not acceptable is the current state: a rule written down in one
generator, contradicted by two hand-written pages, with an offline failure and
a local 404 behind the contradiction and nothing red.

## Affected surfaces

- `app/sw.js` — `PRECACHE`, and the `fetch` handler's cache lookup. Any change
  here is a precached-file change: bump `VERSION`, set `SHELL`.
- `app/about.html`, `app/advanced.html` — the eleven hrefs.
- `scripts/charts.mjs` — lines 297, 466, 490 build the chart pages' hrefs, and
  the comment at 315 states the rule. **The six generated pages are hand-edit
  denied by `guard-edit.sh`**; the edit lands in the generator and the pages are
  regenerated with `npm run charts`.
- `scripts/redirect-check.mjs` — the natural home for the assertion. Its server
  already reproduces Cloudflare's redirects.
- `test/link-graph.test.js:69` — `target()` resolves both spellings today. If
  one spelling becomes the rule, this is where it stops being optional.
- `AGENTS.md` § Layout — names `python3 -m http.server 8201` as the dev server.
  If extensionless wins, that sentence is no longer true and has to change with
  the work, not after it.

## Constraints

- **The offline promise outranks the crawler.** A gym with no signal is the
  premise of the app; a 307 costs Google a hop. If the two ever conflict,
  offline wins and the intent is wrong to have listed them together.
- **Do not precache both spellings to dodge the choice.** Two cache keys per
  document is two answers to "what is this page", which is the defect
  `CLAUDE.md` names as the costliest in this repo — and it doubles the shell for
  every install.
- **`.html` links must keep working whatever is decided.** They are live URLs
  Google has crawled and anyone may have bookmarked; the 307 stays.
- **A dev server that does not redirect is a trap, not a convenience.** The
  whole reason `scripts/redirect-check.mjs` exists is that
  `python3 -m http.server` is silent about a class of production bug. Any answer
  that leaves local and production disagreeing has recreated that trap.
- Do not raise the `requests` budget pin or re-record `scripts/budgets.json`.

## Open questions

1. **Which spelling wins?** Extensionless matches the canonical and the sitemap
   but needs a service-worker change *and* a replacement for the documented dev
   server. `.html` needs neither and fixes the offline bug on its own — it just
   leaves every internal link pointing at a 307. **The spec has to answer this,
   and "make all eleven `.html` and stop there" is a legitimate answer.**
2. If extensionless wins: does the fetch handler retry a navigation miss as
   `<path>.html`, or does `PRECACHE` simply list the extensionless spelling? The
   second is smaller and has no runtime branch; check whether `precache()`'s
   `fetch(path)` follows the 307 and reintroduces `redirected: true`, which is
   the bug that whole function exists to avoid.
3. Does anything else assume the `.html` spelling? `scripts/og.mjs` navigates
   `?try=N`, `test/charts.test.js` pins named edges, `app/_headers` matches
   paths. Survey before deciding, and **write down what the survey found even
   if it found nothing** — the last two items in this queue were both reshaped
   by one.
4. Is the six chart pages' zero-internal-link-to-canonical state worth its own
   answer, or does it fall out of question 1? Probably the latter; say so rather
   than leaving it implied.

## What would settle it

Three things, all of which fail today:

1. Offline, every internal link lands on the page it names — `/about` and
   `/advanced` included. Asserted in `scripts/redirect-check.mjs`, against its
   redirecting server, not by reading the href.
2. Every internal href resolves 200 under the dev server `AGENTS.md` documents,
   whichever server that ends up being.
3. No internal href points at a URL that redirects, and no shipped page is
   reachable only through one. Counted from the files, not listed by hand, so a
   seventh page cannot arrive exempt.
