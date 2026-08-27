# Operations

Running it, testing it, shipping it, and what it measures once it is out there.

## Running it

    cd app && python3 -m http.server 8137     # then open http://localhost:8137

Serve `app/`, not the repo root: the service worker's scope, the manifest's
`start_url` and every absolute path in it assume `app/` is `/`. ES modules are
blocked over `file://`, so it has to be served either way.
## Testing

`node --test` — no install step, because there are no dependencies.
`.github/workflows/test.yml` runs it on every push and PR against `main`, on
Node 22 and 24, with `fail-fast: false` so one red leg does not hide the
other's result. The repo is private, so the badge above only renders for
someone signed in with access.

There are **six** CI jobs in total: the `node --test` matrix above, then
`smoke` (`node scripts/smoke.mjs --no-tests`), `redirect` (`redirect-check.mjs`,
the service worker behind Cloudflare's trailing-slash 307s), `about dateline`
(`check-about-date.mjs`), `service worker version` (below) and `vendor drift`
(below). The three named in this sentence went unmentioned here for months
while this paragraph counted to three; if you add a seventh, say so here.

The service-worker version job runs `scripts/check-sw-version.mjs`, which fails when a file in `sw.js`'s
`PRECACHE` changed in the diff but `VERSION` did not. That mistake cannot be
caught by a unit test — the tests see one commit and the bug only exists
between two. It used to cost the worst failure this project has: a returning
coach served the old shell forever, offline, with nothing to notice. What the
cache is named and which half of it actually busts are in `AGENTS.md`, which
owns that rule; this job is what keeps the human-readable half honest across
commits. Both sides' precache lists count, so removing a file from `PRECACHE`
needs the bump as well. Run it locally with `node scripts/check-sw-version.mjs
origin/main`. It exits 0 when there is no base ref to compare against — a first
push, a shallow clone, a force-push — because a guard that fails on a ref it
cannot read is a guard people learn to ignore.

`.github/workflows/vendor-drift.yml` re-runs `sh app/vendor/fetch.sh` and
fails if the working tree moves. Committing the output of a script is only
honest if the two stay in sync, and this catches both ways they come apart: a
vendored file edited by hand — tempting, because `app/vendor/` is just files sitting
in the repo — and a CDN serving something new under the same version pin, which
nothing on our side prevents. Because only the second one happens without a
commit, the job runs weekly as well as on changes under `app/vendor/`. It is
kept off every push because it depends on a live CDN, not because it is slow:
a full re-vendor is Motion, two Inter subsets and 26 icons, about 250 KB, and
takes seconds. (It was ~10 MB when Tesseract was vendored; that went with the
photo roster scanner and this sentence did not.)
A deliberate version bump trips it on purpose — label the PR `vendor-bump` to
skip it once the new output is committed. Untracked files count too: an icon
`fetch.sh` downloads but that was never committed is as broken as a modified
one, and that is exactly the state `app/vendor/icons/grip-vertical.svg` was in.

Beyond the example-based tests, `fuzz.test.js` generates 400 random scenarios
(roster size, availability, format, granularity, and a random mix of every
constraint type) and asserts invariants that must always hold:

- no input throws, and a refusal always carries a usable error message
- every stint fields exactly five distinct, available players
- minutes reconcile against the floor-time budget
- **any violated constraint appears in `issues`** — this is the brief's
  "make constraint violations explicit rather than silently ignored",
  tested directly rather than assumed
- identical input yields an identical plan
- short names are always unique and printable

The fuzzer immediately found a real one: a 10-minute period split three ways
gives 3.33-minute stints, and minutes were printing as
`23.333333333333332` — on the pocket card.
## Deployment

ES modules are blocked over `file://`, and this runs on a phone at the gym, so it needs to be served — Cloudflare Pages in production, or `npx serve` locally. No build step either way.

**Cloudflare settings.** Framework preset **None**, build command **`npm test`**,
deploy command **`npx wrangler deploy`**, version command
**`npx wrangler versions upload`**, root directory **`/`**. All four are
mirrored in the comment at the top of `wrangler.jsonc`; they were read off the
dashboard on 2026-08-24, because "confirm the build command is not empty" is
not a question the repo can answer about itself. The version command is what
Cloudflare runs for a **non-production branch** — it uploads the version and
hands back a preview URL instead of publishing to `benchcard.app`, so the same
green-suite gate applies to a branch build without it going live. Note there is
no "output directory" field in the Workers static-assets flow — that belongs to
the older Pages UI. The served directory comes from `assets.directory` in
`wrangler.jsonc`, which names `app`; the root directory is `/` because that is
where `wrangler.jsonc` itself lives. Nothing to install, so no Node version to
pin.

There is genuinely nothing to build, so the build command runs the suite
instead: `node --test` exits non-zero on a failure, which aborts the deploy. A
red suite should never reach benchcard.app, and this is the cheapest place to
enforce that. `.app` is an HSTS-preloaded TLD, which is a non-issue here rather than a
task: Pages serves HTTPS and redirects HTTP with no configuration.

`app/_headers` is the part worth reading before changing. It sits at the root
of the asset directory, which is where Cloudflare looks for it; it is consumed
rather than served. Nothing is content-hashed
— there is no build step, so every URL keeps its name across deploys — and that
one fact decides every rule in it, in both directions:

- **`sw.js` and the HTML get `no-cache`.** A stale `index.html` is a coach on
  three-week-old code; a stale `sw.js` is worse, because it is the only thing
  that can replace itself, so a copy an intermediary is holding never updates.
- **Nothing in `PRECACHE` gets a long cache.** Pages' default for uncached
  assets is already `public, max-age=0, must-revalidate`, which is right for
  them. Be careful about *why*: `sw.js` does **not** precache with
  `cache.addAll` (read the comment above `precache()` — `addAll` stores a
  redirected response and the spec then refuses to serve it for a navigation),
  and it fetches each entry with `{ cache: 'reload' }`, which bypasses the HTTP
  cache outright. So the rule is not protecting the install. It protects the
  first load before any worker exists, the HTML and `sw.js` above, and `LAZY` —
  the Inter ext subset, the one file the fetch handler gets with a plain
  `fetch(req)` and therefore the one that really is served out of the HTTP
  cache. This paragraph claimed `addAll` for months; do not let it back.
- **The long-cache exception is deliberate.** Inter ends up in the worker's
  cache either way, so it gets a week — long enough that nobody refetches it,
  short enough that a re-vendor is not frozen into returning browsers.

The origin is `https://benchcard.app`, registered and used in the canonical,
the `og:`/`twitter:` URLs and the JSON-LD of every HTML file, plus `robots.txt`
and `sitemap.xml`. Absolute URLs are required for Open Graph — Slack, iMessage
and Twitter will not resolve a relative `og:image`. Grep for the string if the
host ever moves.
## Analytics

**On.** `analytics.js` exports a single `ANALYTICS` constant, and it now holds a
live Cloudflare beacon token and the `/e` endpoint. The off switch is still
real and still the design — with `ANALYTICS` null every function in the module
no-ops and touches no network — but "off by default" is a description of the
code, not of production. Two layers are running: the
Cloudflare Web Analytics beacon (cookieless, injected from JS so the markup
carries no third-party script when it is off) and eleven events posted
to a Worker. Each event is tied to a decision in `notes/ROADMAP.md` §1;
`plan_generated` fires on every strategy change *and* once per load, since a
coach who picked Closers months ago and never touches the segment would
otherwise read as Balanced forever. (This paragraph said "seven" for as long as
there were ten of them, which is the whole argument for `analytics.test.js`
pinning the list rather than the count.)

**Ten of the eleven are product questions; `app_error` is not, and it is the
one deliberate exception to the rule that this list does not grow.** Until it
existed the app had no way to say it had broken — no `window.onerror`, no
`unhandledrejection`, no try/catch at the boot boundary — so a coach whose app
died in a gym was the only person who would ever know. Its single field is
`where`, one of five literals (`boot`, `render`, `solve`, `storage`, `share`),
picked by `errorWhere()` from the script that threw. **There is no message
field and no stack field**, which is what keeps "counters only" literally true
for an event whose whole subject is an exception. It fires at most once per
page load: an error loop must not become a beacon loop.

**A sample team counts nothing until the coach edits it.**
`first_run_complete{roster}` is the only roster-size signal the app has, and
the six roster-size landing pages are built on that distribution — so if
loading a sample fired it, the data steering the roadmap would be measuring the
app's own suggestion, and those pages would feed their own sizes back into the
numbers that justify them. Loading a sample therefore fires nothing at all
(`plan_generated` cannot fire either: `app.js` fires it at boot behind
`state.onboarded`, which is still false while `initOnboarding` runs), and
neither does **filling the form with it** — a roster submitted exactly as the
app wrote it is our suggestion, not a team, so `finishOnboarding` compares the
box against the text it filled in and defers the count the same way. A
read-and-reset flag on `state.js` defers the count to the first edit, read in
`soon()` — an edit is the coach saying "this is now my team" — and it carries
the roster size **at that moment**, so a coach who trims the sample to eight is
counted as eight. No event and no dimension was added for any of this.

**Counters only, enforced structurally.** `payload()` knows every event and
every field it may carry; a string field must match one of a fixed set of
literals, a number field is clamped to 0–99, and anything else is dropped. A
call site *cannot* send a name, a team or an opponent, and `analytics.test.js`
fuzzes every event with name-shaped values to prove it. Roster size is bucketed
(`1-5` / `6-9` / `10-12` / `13+`) rather than exact.

That is why the copy says *"your roster and your players never leave your
device"* and no longer says *"nothing is uploaded"* — the narrower claim is the
one that stays true once a beacon can load. `analytics.test.js` also greps the
HTML and this file for the old wording, so it cannot creep back.

**Reading it back.** `node scripts/traffic.mjs` is the one command that answers
"has anyone but me used this yet?" — it prints every `first_run_complete`
individually with its timestamp, country and roster bucket, the app events by
country, and zone traffic with the country breakdown always beside the uniques.
That layout is deliberate: there are no accounts, so nothing in the data marks a
row as yours, and a self-exclusion flag was rejected because a forgotten flag
turns your own testing into apparent traffic. Timestamps are the exclusion
mechanism instead, and the script describes rather than concludes. Crawler
traffic in the zone numbers is partly the system working — the site is
submitted to Google and Bing. `node scripts/card-prints.mjs` answers the later
question of *which card format* gets printed; both read from
`benchcard_events` through `scripts/cf.mjs`, which owns the auth, needs a
read-only `CLOUDFLARE_API_TOKEN` in the environment, and never lets a token
reach an error message.
## Search, sharing and install

The app is JS-rendered, so a crawler that does not execute scripts sees a shell.
Two things address that, and they are different problems:

- **`about.html`** is the indexable page — real prose about the problem, the four
  plans, the rules, how to read the card, and an FAQ carrying `FAQPage` JSON-LD.
  It is standalone in the sense that it loads no modules, but it **links**
  `./tokens.css` rather than carrying a copy (the copy drifted on `--shadow`
  and `--accent-line`, which is why; `tokens.css` is precached, so arriving
  from the app costs no request) and it repeats the pre-paint theme script, so
  arriving from a dark app does not flash white. and links back
  to the app three times. Each section leads with the artefact it is about, and
  most of those artefacts are **drawn in HTML/CSS against the app's own class
  names** (`.tl-*`, `.bal-*`, `.rchip`, `.sn-*`) rather than screenshotted:
  correct in both themes for free, sharper than a PNG, and no extra request.
  Only two images remain, both pre-existing. Every `<h2>` carries an id and a
  nine-row **section index** sits under the hero card: the page is ~14,600px at
  390px and roughly forty screens at 200% text, and the index is the only way
  in other than the scroll bar. It is stacked rows rather than a chip row
  because the labels are the headings themselves — no new prose — and headings
  that long in a wrapping chip row would hang off 320px at a 32px root. It is
  below the card rather than under the CTA pair so it does not compete with
  "Build a card". `test/about-nav.test.js` pins that a tenth section cannot be
  added without an entry. The scroll reveals are
  `IntersectionObserver` plus opacity and transform, and every hidden state is
  behind a `.js` class that the head script adds **only when
  `IntersectionObserver` exists** — so a crawler that does not run scripts, the
  reader this page is for, gets the whole page painted. `test/about-reveal.test.js`
  pins that; do not add a reveal rule outside the `.js` guard. The footer's **How it works** link is the only path a
  crawler has into it, which is why the footer is no longer hidden wholesale when
  `TIP_URL` is empty — only the tip link is.
- **The roster-size pages** — `7-player-basketball-rotation-chart.html` through
  `12-…` — are the long tail. Google's autocomplete suggests every one of those
  variants across unrelated seeds, no competitor has a page for any of them, and
  a coach with nine kids searches for *nine kids*. They are **generated**, by
  `scripts/charts.mjs` (`npm run charts`), and that matters in three ways:
  one template renders all six, so six near-identical pages cannot drift apart;
  the card on each is a real `generatePlan` run at build time rather than a
  drawing or a screenshot, so it cannot contradict the engine; and
  `test/charts.test.js` re-renders all six and compares, so an engine change
  that moves the plans fails the suite until `npm run charts` is re-run.
  The prose slots (`lede`, `caption`) are placeholders carrying `data-draft="1"`
  until the author writes them — `grep -l data-draft app/*.html`. The `<title>`
  and description are assembled from the generated plan's own numbers instead.
  Canonical and `sitemap.xml` use the **extensionless** URL, which is what
  Cloudflare 200s; internal `href`s keep `.html`, which is what works locally
  and what `redirect-check` exercises. They are deliberately **not precached**:
  offline value is near zero for a page reached from a search result, and the
  precache list is the payload budget's problem. The one internal link into them
  is on `about.html` rather than `index.html`, so the app's own cold-load budget
  is untouched.
- **`<noscript>`** is *not* an SEO device; Googlebot runs the JS. It is for the
  human whose browser does not, and a `<noscript><style>` in the head hides
  `.app` so they get the explanation instead of a dead grey page.

`og.png` (1200×630) is generated, not drawn: the real card, screenshotted from
the running app, composed beside the headline. Regenerate it the same way if the
card design changes — a stale preview of an old card is the one image everyone
sees. `icon-512.png` is the brand mark full-bleed on `--accent` at 62% so it
survives a maskable safe zone; 192 and the 180px `apple-touch-icon` are `sips`
downscales of it.

**Offline.** `sw.js` precaches the shell on install and serves it cache-first:
`index.html`, `about.html`, the three stylesheets, every local module in the
import graph, the **latin** Inter subset, the manifest and the icons — well
under a megabyte. The latin-ext subset is the one deliberate exception,
`LAZY` in `sw.js`: fetched and kept only when a roster actually contains a
glyph it covers, rather than pushing 74 KB to every install. The stylesheets are render-blocking, so all three have to be in there
or an offline boot paints unstyled. A gym
with no signal now costs nothing: kill the server, reload, and the app boots and
re-plans from `localStorage`.

Two things about it worth knowing before you change it:

- **The `VERSION` and `SHELL` bump is a rule `AGENTS.md` owns**, along with
  which of the two actually busts the cache and which guard catches a forgotten
  bump. It is not restated here. The one detail that belongs to this file
  rather than that one: `activate` deletes every other `benchcard-*` cache, so
  a new shell leaves nothing of the old one behind.
- **`vendor/motion.mjs` imports `vendor/motion.umd.js`.** Missing that
  side-effect import is not a degraded animation — `fx.js` throws, `app.js`
  never runs, and the offline app is a skeleton. `sw.test.js` walks the import
  graph from `app.js` and fails if anything in it is not precached, which is how
  that one was caught.

A new worker never swaps code underneath a coach mid-game: the open page keeps
the modules it already loaded, and a waiting worker is told to `skip-waiting`
only on a load with no unsaved edit in flight. When one does take over,
`toast.js` *offers* a reload ("Benchcard updated." / "Reload") rather than
taking it, and never over game mode — see the Status section. That offer is the
update prompt; this paragraph said there was none.

`site.webmanifest` uses `display_override: ["minimal-ui", "standalone"]`. A
home-screen install still prints fine — the in-app **Print** button calls
`window.print()` rather than relying on the browser's share sheet, which
standalone iOS does not have.

**Asking a coach to install it** is the other half of the eviction defence the
Backup box started, because WebKit exempts an installed app from the seven-day
sweep and does not exempt a tab. It lives in `toast.js` beside the tip jar and
borrows its whole contract: one ask, on the second time the app delivered
something (the same `ui.prints` counter — there is deliberately not a second
one), never over a live game, and remembered in `ui.installDone` whichever way
it is answered. It goes on an earlier use than the tip because a roster is
worth more than a coffee, and when it fires the tip stands down: one toast box,
one ask. Chrome's `beforeinstallprompt` is caught and deferred, so the Install
button appears at a moment that earned it rather than as a banner nobody asked
for; iOS has no such API, so that path is an illustration pointing at the Share
glyph in Safari's toolbar. A browser offering neither is shown nothing — there
would be no instruction to give it — and one already running standalone is
never asked at all. `test/install.test.js` pins those rules the way
`test/tip.test.js` pins the tip's.
## Money

There is none. A tip jar link in the footer, switched **on** — `TIP_URL` at the
top of `toast.js` holds a live Buy Me a Coffee URL, and `about.html` hard-codes
the same one with `analytics.test.js` pinning the two together. Set it to `null`
to hide the link (not the footer: the footer carries the only crawlable link to
`about.html`). The market research behind that decision:
GameChanger gives coaches every premium feature free and monetises parents
instead, so coach-side tooling is expected to be free, and paid-upfront tools
above about $3 collect hostile reviews.
## Status

Feature-complete for a tournament weekend: engine + tests, a roster editor, a
day of games with tabs, per-game constraints, cumulative day minutes, light and
dark themes, and the printed card.

It is deployed, at `benchcard.app`, with analytics on -- see "Deployment" and
"Analytics". Season history is done too: `season-view.js` keeps the ledger, the
CSV and the carryover across games. What is still not done: a foul-tally
companion card. Offline is done: a service worker precaches the shell, so after one visit the
app boots with the network gone -- see "Search, sharing and install". A new
worker takes over as soon as it installs, but the open page keeps the modules it
already loaded, so nothing swaps under a coach mid-substitution; the new code
lands on the next navigation. An installed iOS app can go weeks without one --
it resumes from a snapshot rather than navigating -- so `index.html` re-checks
for a worker whenever the app returns to the foreground, and when one takes over
`toast.js` *offers* the reload rather than taking it, never over game mode.
