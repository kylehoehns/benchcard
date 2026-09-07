# Plan: one spelling per page

**Stage 3.** Written from `intent.md` (merged, `c7c401c`) and `spec.md`
(merged, `c6da0ad`), after a second survey aimed at one question the spec did
not ask: **what stays green while becoming false?**

That survey changed this plan twice — the server count and the state of
`redirect-check.mjs` — and both changes are recorded below rather than folded
in silently.

**Status: NOT YET IMPLEMENTED.** Nothing in this plan has been written. The
only things measured so far are the failures it describes — the offline
shell-instead-of-page result, the four server behaviours, and
`redirect-check.mjs:220` navigating a URL nothing links to. Everything under
"Steps" is still a proposal.

## What this fixes

Each page has two working addresses. Cloudflare 200s `/about` and 307s
`/about.html` to it. The site tells the outside world the extensionless one is
the address — canonical, `og:url`, `sitemap.xml`, JSON-LD, 28 places, no
exceptions — while nearly every link it writes to itself says `.html`.

Where the two meet, things break and nothing goes red:

- **Offline, `/about` and `/advanced` serve the app shell instead of the page.**
  `sw.js` precaches `./about.html`; `cache.match(..., { ignoreSearch: true })`
  drops the query string, not the extension. Every link from About to the
  reference page and every link back uses the extensionless spelling, so
  **precaching `advanced.html` currently buys nothing.**
- **Those same eleven links 404 under the dev server `AGENTS.md` documents.**

No claim is made about search indexing. Three pages sit in "Discovered –
currently not indexed"; that is a young domain being rationed crawl budget, and
nothing here hurries it.

## The two findings that changed this plan

### 1. `redirect-check.mjs` is already green against a URL nothing links to

`scripts/redirect-check.mjs:220` navigates `/advanced.html`. Counted across
`app/*.html`, **`./advanced.html` is linked zero times** — every one of the
seven links to that page is already extensionless. Its comment says the
opposite:

> Navigated by its `.html` spelling for the reason above: `/advanced` is not a
> cache key, so it would go to the network and pass while broken.

So the arm added to prove the reference page survives the worker has been
proving it for a URL no reader can reach. `:207` (`/about.html`) is still
honest today and stops being so at step 4.

This is the `/new-guard` failure class the repo already names, found in the
guard this very item leans on. **Step 1 therefore starts by fixing the existing
arms, not only by adding one.**

### 2. There are four local servers, not three

The spec found three. There is a fourth:

| Server | `/about.html` | `/about` |
| --- | --- | --- |
| Cloudflare (production) | 307 → `/about` | 200 |
| `python3 -m http.server` (documented) | 200 | **404** |
| `scripts/smoke.mjs:50` | 200 | **404** |
| `scripts/og.mjs:148` | 200 | **404** |
| `scripts/redirect-check.mjs:47` | 307 → `/about` | 200 |

`scripts/og.mjs:148` calls itself *"static server (mirrors scripts/smoke.mjs)"*
— and `og.mjs:520` already navigates `origin + '/about'`, **which 404s under
it today**. It survives only because the next line replaces
`documentElement.innerHTML` wholesale, so the 404 body is thrown away before
anything looks at it. Pre-existing, not caused here, but fixing two servers and
leaving this one makes the "mirrors" comment false in a new way.

## Why PRECACHE keeps the `.html` spelling

The tempting alternative is to list `./about` in `PRECACHE` and skip any
runtime lookup. **Three separate guards say no**, and two of them say it
silently:

- `test/sw.test.js:164` computes `SHELL` with `readFileSync(new URL(p, ROOT))`
  over each entry — entries are literal files on disk. `./about` is not a file.
  **Fails loudly.**
- `scripts/check-sw-version.mjs:24-27` parses `PRECACHE` into names and
  compares them with `git diff --name-only` output. `about` would never again
  match `about.html`, so the CI job that catches a precached file changing
  without a `VERSION` bump **stops watching About and Advanced forever, green
  and silent.**
- `.claude/hooks/after-edit.sh:22` greps `sw.js` for `'./$base'` where `$base`
  is the edited file's basename. Same mismatch: the `VERSION`/`SHELL` reminder
  **silently stops firing** for those pages. `test/hooks.test.js:155-173` only
  exercises `app/app.js`, so nothing would catch it.

Keeping `PRECACHE` a list of files leaves all three intact and untouched. The
fetch handler does the resolving instead.

## Steps

Run in order. Steps 1 and 2 are a red-then-green pair; do not write step 2
before seeing step 1 fail.

### 1. `scripts/redirect-check.mjs` — fix the dishonest arms, then add the new one

1. **Re-point `:207` and `:220`** at the spelling the hrefs will use, and
   **rewrite both comments** — they currently argue for the `.html` spelling on
   grounds that are about to invert, and `:220`'s is already false.
2. **Add the fifth arm:** offline, each precached document loads through the
   spelling its own hrefs use.

Expected red on today's tree: `/about` and `/advanced` return the shell
(`#view-games` present, wrong `<h1>`). Measured already while writing the
intent — this is the reproduction, not a guess.

### 2. `app/sw.js` — resolve the navigation

In the `fetch` handler, after the existing `cache.match` miss and **before**
the network attempt (`cached` becomes `let`):

```js
/* Links use the extensionless spelling, because that is what the canonical,
   og:url and sitemap all name. The cache is keyed by the file on disk, and
   ignoreSearch drops the query string, not the extension -- so resolve the
   one to the other, or every internal link is a cache miss offline. */
if (!cached && req.mode === 'navigate') {
  const p = url.pathname;
  if (p !== '/' && !/\.[a-z0-9]+$/i.test(p)) {
    cached = await cache.match(`${p}.html`, { ignoreSearch: true });
  }
}
```

Navigation-only on purpose: a subresource is requested by the exact URL the
markup names, and widening this would put a second cache lookup on every 404.

The six chart pages are not precached, so they still fall back to the shell
offline. Unchanged, and out of scope.

**`app/sw.js:112-120`'s `precache()` comment** is the canonical explanation of
this exact behaviour and names the 307 as the live hazard. It gets rewritten
here — it is the one place this rule should be explained.

**Then bump `VERSION` 257 → 258 and set `SHELL`** to the digest `npm test`
names, in the same edit. Two precached documents change in step 4: `index.html`
and `about.html`. **`advanced.html` needs no edit at all** — its four links to
About are already extensionless, which is half of why this item exists.

Step 1's arms should now be green.

### 3. One local server (`scripts/serve.mjs`, new)

Lift `serve()` and `TYPES` out of `scripts/redirect-check.mjs:47`. It is
already the Cloudflare-shaped one: 307s `/index.html` → `/`, 307s
`/<name>.html` → `/<name>`, resolves `/<name>` to `<name>.html`, stubs `/e`
with 204, and carries `stopHard()` for the offline arm.

The servers are near-identical already — same `TYPES`, same `/e` stub, same
`startsWith(APP)` traversal guard. Only the redirect handling and `stopHard()`
differ, and `stopHard()` is harmless everywhere.

- `serve()` takes an optional port. Ephemeral stays the default for the
  harnesses; `serve(8201)` gives the docs a stable address.
- **All three callers import it**: `redirect-check.mjs`, `smoke.mjs`, and
  `og.mjs` — the last per finding 2, so its "mirrors smoke.mjs" comment stays
  true and `og.mjs:520`'s `/about` stops 404ing.
- Add `"serve": "node scripts/serve.mjs"` to `package.json`.
- **Four documents name a dev server and they do not agree today:**

  | File | Says | After |
  | --- | --- | --- |
  | `AGENTS.md:114` | `python3 -m http.server 8201` | `npm run serve` |
  | `README.md:76` | `python3 -m http.server 8201` | `npm run serve` |
  | `docs/operations.md:7` | `python3 -m http.server 8137` | `npm run serve` |
  | `docs/operations.md:74` | "`npx serve` locally" | `npm run serve` |

  Two ports and two tools for one instruction. The first three become false the
  moment step 4 lands, so all four change **in this commit, not after it.**

`smoke.mjs:58`'s comment about dev behaving like prod stays, and becomes true of
the file it sits in.

### 4. Every internal href drops `.html` — 52 of them

| Where | Count | How |
| --- | --- | --- |
| `about.html` → six chart pages | 6 | by hand |
| `index.html` → about | 3 | by hand (`:328` noscript, `:775` `wel-about`, `:1433` footer) |
| six generated pages → siblings and about | 42 | `scripts/charts.mjs:297,466,490`, then `npm run charts` |

**Never hand-edit the six generated pages.** `.claude/hooks/guard-edit.sh:44`
denies `*/app/*-player-basketball-rotation-chart.html` by bash `case` glob on
the on-disk path — unaffected by this change, and it will block the edit by
design. `about.html`, `advanced.html` and `index.html` are deliberately not
protected (`test/hooks.test.js:137-147`), so the hand edits are unimpeded.

**Reuse what exists.** `scripts/charts.mjs:55-56` already exports both
spellings, and they already mean different things:

```js
export const slug = n => `${n}-player-basketball-rotation-chart`;  // an address
export const file = n => `${slug(n)}.html`;                        // a file on disk
```

`slug()` already backs the canonical tag and the sitemap; `file()` already
backs disk reads and `pages()`. So this is not new string-building — the hrefs
move from `file()` to `slug()`, and **`file()` is left alone**, because
`charts.test.js:33,93,121,263` and `pages()` all need it to keep naming the
file. Add the two trailing comments above so the distinction is stated once.

The same swap fixes the assertions this breaks — all **red, not stale**:

- `test/charts.test.js:133` — the six about → chart edges
- `test/charts.test.js:139` — the 36 sibling edges
- `test/charts.test.js:26-34` — disk vs generator, red until `npm run charts`
  runs. This is the guard that forces regeneration; do not "fix" it.

**`app/about.html` changes, so bump its dateline** — `<time
datetime="2026-08-27">27 August 2026</time>` at `:1187` → 2026-09-06, or
`scripts/check-about-date.mjs` fails the `about-date` CI job.

### 5. Re-anchor the link guard (`test/link-graph.test.js`)

- `target()` at `:69` stops accepting both spellings and requires one.
- `:126` asserts the exact string `<a class="wel-about" href="./about.html"`.
  **Re-anchor, do not loosen.** That one link carries the whole six-page chart
  tail, and it is exact-string on purpose: a laxer earlier cut passed a
  mutation that had neutered it. Mutation-test the new form the same way.
- Add the acceptance property: no internal href points at a redirecting URL,
  derived from the files so a seventh page cannot arrive exempt.
- `:113`'s sitemap→filename mapping is a third spelling-conversion in this file
  and is unaffected (the sitemap is already extensionless). Leave it; note it.

### 6. `STATIC_PAGES` extensionless (`scripts/smoke.mjs:827`)

So the 20 browser checks measure the addresses a reader actually gets.
`smoke.mjs:819-822`'s "what this does not assert" note about link resolution
gets more true, not less; leave it.

### 7. The comments that would otherwise stay green and lie

Each states the old rule as fact. All are in the diff:

| File | What it says now |
| --- | --- |
| `test/charts.test.js:117-120` | "The in-app links stay `./about.html` on purpose… Rewriting those would break the offline About link" — tells the next reader this change is forbidden |
| `docs/operations.md:240-241` | "internal `href`s keep `.html`, which is what works locally and what `redirect-check` exercises" — recorded policy, both clauses inverted |
| `scripts/charts.mjs:315-321` | three now-false claims in one comment |
| `app/index.html:770` | quotes the `wel-about` anchor for the guard in step 5 |
| `app/toast.js:37` | "the only link to /about.html" |
| `app/onboarding.js:267` | "PRECACHE for `about.html`" — still true, verify wording survives |

### 8. `app/_headers` and its guard

`test/headers.test.js:83` pins `no-cache` on `/`, `/index.html`, `/about.html`,
`/sw.js`. Leave both **unchanged**: the `.html` URL still exists and still gets
served on a redirect, and `/advanced.html` and the six chart pages already have
no rule and fall to Cloudflare's `public, max-age=0, must-revalidate`, which
`_headers`' own comment calls correct. Adding a `/about` rule would create the
second answer this whole item exists to remove. Say so in the PR so a reviewer
does not read the omission as an oversight.

## Clean negatives — checked, not affected

- Every other `href=` assertion in `test/` matches a stylesheet, a `#fragment`,
  or `./?try=N`: `sw.test.js:18`, `dead-class`, `dead-static`, `dead-id`,
  `hover-guard`, `tap-action`, `css-collide`, `favicon`, `sample-team`,
  `about-nav`, `analytics`.
- `app/*.js` builds no page href at runtime.
- `evals/*.json` and `bands.yaml` carry no href or URL expectation. The one
  `.html` string, `generated-files-have-one-editor.json:13`, is an on-disk path
  fed to `guard-edit.sh`.
- `test/one-answer.test.js` and `test/sdlc.test.js` cross-reference no URLs.
- `guard-bash.sh` and `session-start.sh` are not path- or href-sensitive.
- `scripts/traffic.mjs`, `app/analytics.js`, `src/index.js` key on nothing but
  `/e`.
- `scripts/charts.mjs:270` `fromAbout()` lifts the theme `<script>` and icon
  `<link>`, not hrefs.

## Found, and deliberately not fixed here

**Nothing validates cross-page fragments.** `about.html` links
`./advanced#midgame`, `#splits`, `#shapes`, `#rules`, `#season`, `#card`, and
no guard checks those ids exist on `advanced.html` — `dead-id.test.js:108` only
covers same-page `href="#x"`. This item edits six of those lines, so it is
tempting. It is a separate defect with its own guard to write: **one item at a
time.** If it still looks worth doing after this merges, it gets its own intent.

## Not doing

- **Not precaching both spellings.** Ruled out by the intent; the three guards
  above are the concrete reason.
- **Not touching the 307.** `.html` URLs are live and bookmarkable.
- **Not re-recording `scripts/budgets.json`.** Checked, because making the
  smoke server redirect could plausibly have added hops: it cannot.
  `smoke.mjs:1452` says service-worker fetches are a different CDP target and
  do not appear in the count, and the measured cold load is `/`, which touches
  no `.html` URL. `--update-budgets` stays denied.

## Proof

| Check | What it settles |
| --- | --- |
| `npm run redirect-check` | step 1 red before step 2, green after — the offline half |
| `npm test` | 978 today; `SHELL`, `charts.test.js`, the re-anchored guard |
| `npm run smoke` | 20 checks against the new server and the new URLs |
| `npm run charts` then `npm test` | the six pages match the generator |
| `node scripts/check-about-date.mjs origin/main` | the dateline was bumped |
| `npm run og` | `og.mjs:520`'s `/about` resolves instead of 404ing |
| `npm run serve`, then walk every internal href at 390×844 | acceptance 2, in a browser, per `/browser-verify` |

**This change is mostly guards, so `REVIEW.md` pass 5 applies to nearly all of
it.** `redirect-check.mjs`, `link-graph.test.js`, `charts.test.js`, `smoke.mjs`
and the new `serve.mjs` all judge the tree, and one of them was already green
against a URL nothing links to. Each gets the `/new-guard` treatment: seen red
against the defect it names, then green.

Acceptance, from the intent:

1. Offline, every internal link lands on the page it names — `/about` and
   `/advanced` included. Asserted against the redirecting server, not by
   reading the href.
2. Every internal href returns 200 under the server the docs name.
3. No internal href points at a redirecting URL, and no shipped page is
   reachable only through one.

## PR shape

One implementation PR. It deletes `work/one-spelling-per-page/` and its
`notes/TICKETS.md` row in the same PR, per `AGENTS.md` § "Done means the
directory goes".
