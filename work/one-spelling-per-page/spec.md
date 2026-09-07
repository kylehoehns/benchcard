# Spec: extensionless is the spelling, and the dev server is the real cost

**Stage 2.** Written from `intent.md`, after running the survey it asked for.
The survey **confirms the intent's diagnosis and settles its central open
question**, but it moves the cost: the expensive part is not the service
worker, it is that this repo ships three local servers and only one of them
behaves like production.

## The survey

Open question 3 asked whether anything else assumes the `.html` spelling. Four
findings, and the first two shrink the work.

### A. Every outward-facing URL is already extensionless, without exception

Counted across all nine shipped pages in `app/`:

| Declaration | Extensionless | `.html` |
| --- | --- | --- |
| `<link rel="canonical">` | 9 | 0 |
| `<meta property="og:url">` | 9 | 0 |
| `sitemap.xml` `<loc>` | 9 | 0 |
| JSON-LD `"url"` | 1 | 0 |

**This settles open question 1.** The site already tells every outside reader
that the extensionless spelling is the address of each page — in twenty-eight
places, with no exceptions and no exemptions. `.html` survives only in hrefs
this site writes to itself. Choosing `.html` would mean permanently linking to
addresses the same files instruct Google not to use, and would require changing
twenty-eight declarations to say otherwise. Extensionless wins on the evidence
already in the tree.

### B. Nothing in `app/*.js` builds a page href — clean negative

314 references to a `.html` filename exist outside `app/*.html`. Every one is a
filesystem read in a test, or prose in a comment. `grep -rn "href *[=:]"` over
`app/*.js` returns no page link at all; `app/toast.js:37` mentions "the only
link to /about.html" but is describing markup in `index.html`, and only sets
`#tipLink.href` to an external URL.

**The link surface is exactly the nine HTML files and `scripts/charts.mjs`.**
No runtime navigation to update, so the intent's worry here costs nothing.

### C. Three local servers, one production, and only one match

This is the finding the intent did not have, and it is the one that shapes the
work.

| Server | `/about.html` | `/about` | Who uses it |
| --- | --- | --- | --- |
| Cloudflare | 307 → `/about` | 200 | coaches, Googlebot |
| `python3 -m http.server` | 200 | **404** | the loop `AGENTS.md` § Layout documents |
| `scripts/smoke.mjs:50` | 200 | **404** | `npm run smoke`, all 20 checks |
| `scripts/redirect-check.mjs:47` | 307 → `/about` | 200 | `npm run redirect-check` |

All four measured, 2026-09-06. The only local server that behaves like
production is the one written because the others do not.

And `scripts/smoke.mjs:58` carries this comment, about its own `/e` stub:

> Same principle as `scripts/redirect-check.mjs`: dev behaves like prod, or the
> checks are measuring the wrong thing.

The file states the rule and then breaks it on the very next line of
resolution. That is this repo's named defect — one answer living in more than
one place — and it is why the eleven extensionless links could 404 locally
without anything going red.

### D. Three smaller spelling assumptions

- **`app/_headers`** has a `/about.html` no-cache rule. `/advanced.html` and
  the six chart pages already have none and fall to Cloudflare's default,
  `public, max-age=0, must-revalidate`, which that file's own comment calls
  correct for precached assets. So the rule is belt-and-braces **and already
  inconsistent** — it is not load-bearing, and must not be quietly duplicated
  into a second spelling.
- **`scripts/smoke.mjs:827`** — `STATIC_PAGES` hardcodes nine `.html` URLs. It
  navigates them directly, so it will keep passing whatever the hrefs say. That
  is the problem: after this change it would be checking eight URLs no reader
  reaches.
- **`test/link-graph.test.js:126`** asserts the exact attribute string
  `<a class="wel-about" href="./about.html"`. This is the guard the entire
  six-page chart tail hangs off — `index.html:770` carries a comment saying so
  — and it goes red on the first href changed. **It must be re-anchored, not
  loosened**: the reason it matches an exact string is that a mutation arm
  which neutered `.wel-about` passed an earlier, laxer cut of that file.

## Requirement

One spelling, extensionless, everywhere a URL is written or served.

1. **The service worker resolves a navigation miss to `<path>.html`.** One
   extra `cache.match` on the navigation path only, before the network attempt.
   No new cache entries — this honours the intent's constraint against
   precaching both spellings, and keeps `PRECACHE` a list of files on disk.
2. **Every internal href drops `.html`** — 52 of them, counted from the files:

   | Where | Count | How |
   | --- | --- | --- |
   | `about.html` → six chart pages | 6 | by hand |
   | `index.html` → about | 3 | by hand (one is inside `<noscript>`) |
   | six generated pages → siblings and about | 42 | `scripts/charts.mjs:297,466,490`, then `npm run charts` |

   The six generated pages are **never** hand-edited — `guard-edit.sh` denies
   it. Two comments quote the old spelling as fact and go stale with the
   change: `scripts/charts.mjs:315`, which states the rule, and
   `index.html:770`, which quotes the `wel-about` anchor for the guard in D.
   Both are part of the diff.
3. **One local server, shaped like Cloudflare.** `serve()` from
   `redirect-check.mjs` moves to a shared module; `redirect-check.mjs` and
   `smoke.mjs` both import it, and `npm run serve` exposes it. `AGENTS.md`
   § Layout stops naming `python3 -m http.server` in the same commit.
4. **`STATIC_PAGES` becomes extensionless**, so the smoke pass measures the
   URLs a reader actually gets.

## Explicitly not doing

- **Not precaching both spellings.** Ruled out by the intent, and B shows it is
  unnecessary.
- **Not adding a `/about` rule to `app/_headers`.** Per D it is not
  load-bearing; adding one would create the second answer this change exists to
  remove. Delete the `/about.html` rule or leave it — argue it in the plan, but
  do not add.
- **Not touching the 307.** `.html` URLs are live and bookmarkable; they keep
  redirecting forever.
- **Not promising a crawl-rate change.** The intent already says no edit here
  hurries Google, and the acceptance below deliberately contains no indexing
  assertion.
- **Not re-recording `scripts/budgets.json`.** The `requests` pin at 40 of 41
  stands; hrefs do not change the boot graph.

## Acceptance

The intent's three settling conditions, as checks:

1. **`scripts/redirect-check.mjs`** gains an arm asserting that offline, each
   precached document loads through the spelling its own hrefs use. It must
   fail on today's tree — verified red before the fix, per `/new-guard`.
2. **Every internal href returns 200** under the server `AGENTS.md` documents.
   Derived from the files, not listed.
3. **No internal href points at a redirecting URL**, and no shipped page is
   reachable only through one. `test/link-graph.test.js` already derives its
   scope from the directory; `target()` at line 69 stops accepting both
   spellings and starts requiring one, and the exact-string anchor at line 126
   is re-anchored to the new spelling with its mutation resistance intact.

Plus `npm test`, `npm run smoke` (20 checks) and `npm run redirect-check`
green, and `VERSION`/`SHELL` bumped in `app/sw.js` because a precached file
changes.

## Open question for the plan

**Does requirement 3 belong in this item at all?** It is a harness change with
its own blast radius — `smoke.mjs` is the 20-check gate — and it is separable:
requirements 1, 2 and 4 could land against `python3 -m http.server` if the
eleven extensionless links were reverted first.

The argument for keeping it here is that requirement 2 is unbuildable without
it: acceptance condition 2 asks that every href resolve under the documented
dev server, and today that server 404s on the spelling this spec is adopting.
Splitting would mean shipping links the documented loop cannot open.

**The plan decides, and says which.** If it splits, the second half gets its
own intent rather than a note here.
