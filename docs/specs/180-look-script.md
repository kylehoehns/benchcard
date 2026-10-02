# #180 — `scripts/look.mjs` takes the look-check screenshots in one command

## Issue

#180. Add one committed command that screenshots the app at the widths, text
sizes and themes we check, against a local server or a preview URL, and
writes the same cut-off-text measurements the #179 smoke check makes — so no
ticket writes a throwaway capture script again, and the quality reviewer sees
pictures instead of judging a look change from the diff alone.

## Goal

No coach sees this. An agent (or a person) checking a change a coach can see
runs `node scripts/look.mjs ...` and gets PNGs it can trust — taken at the text
size and theme they claim, on fresh code, with nothing still fading in — plus
a `measurements.json` that lists any cut-off text in each shot. `/ship-feature`
step 7 hands that output to `quality-reviewer`.

## What the survey found (against `4ed4d19`)

- **"64 one-off scripts" — holds, and undercounts.** This session's scratch
  folder alone has 120 `.mjs` files; 83 of them import
  `scripts/smoke/chrome.mjs` or `compare-shots.mjs` and hand-roll the same
  launch → size → seed → navigate → screenshot loop (e.g. `shots152.mjs`,
  `shot187.mjs`). None use Playwright; all drive Chrome over CDP.
- **Trap 1, text size before load — holds.** `Page.setFontSizes` on a page
  already laid out does not reflow it; `compare-shots.mjs`' `capture()` and
  `app-large-text.mjs` both set it and then reload.
- **Trap 2, element screenshot drops large text — holds in the form
  `compare-shots.mjs` documents:** `captureBeyondViewport: true` resizes the
  renderer and drops the `setFontSizes` override. The fix there is: never pass
  that flag, grow the viewport instead, and re-measure the root font size
  before and after `Page.captureScreenshot` (`shotProblems`,
  `postCaptureProblems`).
- **Trap 3, static pages fade in — holds for `about.html` only.**
  `.js .reveal { opacity: 0 }` until an `IntersectionObserver` adds `.in`;
  `@media (prefers-reduced-motion: reduce)` forces `opacity: 1`. The six chart
  pages say in their own CSS that they have no scroll reveals.
- **Trap 4, stale service worker — real, but only for a reused browser
  profile.** `launch()` in `chrome.mjs` makes a fresh `--user-data-dir` every
  run, so the first load has no worker. `index.html` then registers `sw.js`,
  and every later navigation in the run is served by it — from the same deploy,
  so not stale unless the preview redeploys mid-run. Belt and braces:
  `Network.setBypassServiceWorker`, and record per shot whether a worker
  controlled the page (`/browser-verify` §2: every probe returns
  `location.host`).
- **"The same test as the clipping check in #179" — exists but is not
  importable.** `CLIP_PROBE` in `scripts/smoke/clip-sweep.mjs` is a
  module-private `const`; the known-issue matching and the finding-to-message
  formatting are inline inside `clipSweepPass`. The fixture that makes the
  probe bite, `LONG_AND_SQUEEZE` (RICH with `LONG_NAME` and
  `'Featherstonehaugh Bartholomew'`), is private too.
- **"Builds on #125" — #125 is merged** (#280, 906e4c5). Every smoke check
  now sets up its page through `scripts/smoke/page-state.mjs`: `land(c,
  origin, want)` (page, record, width, font, media, ready expression,
  `mobile`), `resize`, `setMedia`, `bootWait`, `withScripts`, `reset`.
  Shared landings live in `fixtures.mjs` (`TODAY_LANDING`,
  `WELCOME_LANDING`). The old helpers (`goRich`, `goSeed`,
  `reloadWithRecord`, `setWidth`, `landWiped`) are deleted. See
  **Sequencing** below.
- **`--view today,game`** — the app's own names are `VIEWS` in
  `scripts/smoke/sweep.mjs`: `today`, `games`, `team`, `season`, `settings`.
  The wider state list (sheets, dialogs, bench mode, first run, ~45 entries)
  is `APP_LARGE_TEXT_STATES` plus `CONFIRM_STATE`, the list `clip-sweep.mjs`
  walks.
- **Dark mode.** `RICH.ui.theme` is `'light'`, so emulating a dark OS paints
  nothing (#86). Static pages read the same `ui.theme` from `benchcard.v7`
  in their head script, so seeding the record themes both.
- **`/index.html` 307s to `/`** on both `npm run serve` and Cloudflare, so the
  existing fixtures' `origin + '/index.html'` navigation works against a
  preview URL unchanged.
- **The quality reviewer can see images:** `.claude/agents/quality-reviewer.md`
  has `Read`, which renders PNGs.

## Sequencing

**Decided:** build after #125 merges (it has, #280), and do page setup
through `land`/`resize`/`setMedia`/`bootWait` (`scripts/smoke/page-state.mjs`).
look.mjs sends no `Emulation.setDeviceMetricsOverride`,
`Page.setFontSizes` or `Emulation.setEmulatedMedia` itself;
`test/smoke-page-state.test.js` guards the smoke checks for that and look.mjs
should hold the same line.

## What would settle it

1. **One command, both targets.**
   `node scripts/look.mjs --url <url> --widths 320,390 --font 16,32 [--dark] [--view a,b] --out <dir>`
   exits 0 and writes PNGs plus `measurements.json` to `<dir>`. Proved against
   (a) `npm run serve` (`--url http://127.0.0.1:8201`) and (b) the PR's
   Cloudflare branch preview URL. Without `--url` it serves `app/` itself on an
   ephemeral port, as `compare-shots.mjs` does.
2. **Arguments are checked before Chrome launches.** `--out` is required. An
   unknown `--view` name is refused by name and the known names are printed. A
   width or font that is not a positive integer is refused. Defaults:
   `--widths 320,390`, `--font 16,32`, light only, `--view` = the five `VIEWS`.
3. **One shot per cell, named predictably.** For every view × width × font ×
   theme (theme = `light`, plus `dark` with `--dark`):
   `<view-slug>-<width>-<font>-<theme>.png`, viewport-sized, scrolled to the
   top. When that state scrolls (the page, or an open sheet's own scroller,
   moved), a second PNG `<...>-bottom.png` is written scrolled to the bottom.
   `--view today,settings --widths 320,390 --font 16,32 --dark` therefore
   writes at least 16 PNGs.
4. **Each shot is proved, not trusted.** Before and after
   `Page.captureScreenshot`, the root font size is measured and must be within
   0.5px of the request, and `body`'s painted background must equal
   `THEME_BG[theme]` — reusing `shotProblems` and `postCaptureProblems` from
   `compare-shots.mjs`. A failure stops the run naming both numbers and the
   shot. `captureBeyondViewport` is never passed.
5. **The four traps are handled.** Font size is set, then the page is
   (re)loaded. `prefers-reduced-motion: reduce` is emulated for the whole run,
   and for `about` every `.reveal` must compute `opacity: 1` before its shot.
   The run uses a fresh profile with `Network.setBypassServiceWorker`
   `{ bypass: true }`; each record carries `origin` (`location.host`) and
   `swControlled` (`!!navigator.serviceWorker.controller`), and a shot with
   `swControlled: true` fails the run.
6. **`measurements.json` carries the #179 findings.** One record per PNG:
   `{ file, view, width, font, theme, pos, origin, swControlled, measured:
   { fontSizePx, bg }, digest, findings: [...] }`. Each finding is the raw
   shape `CLIP_PROBE` produces (`kind` = clip / split / hidden / overlap /
   floor, `el`, `text`/`word`/`hitBy`, widths) plus `excused`: the matching
   `CLIP_SWEEP_KNOWN_ISSUES` issue number, or `null`. Allow-listed selectors
   are skipped by the probe itself, as in the smoke check.
7. **Findings are reported, not a failure.** look.mjs prints a one-line count
   per shot with unexcused findings and exits 0. It exits non-zero only when a
   shot could not be proved (item 4, 5) or a state did not open. (Decided:
   the smoke check already fails on cut-off text; look.mjs is for looking.)
8. **The measurement is the smoke check's, proved by agreement.** On `main`,
   `node scripts/look.mjs --widths 320 --font 32 --view "<state>"` for a state
   that still has an open `CLIP_SWEEP_KNOWN_ISSUES` entry at build time (e.g.
   `plan sheet` for #189/#190, or `team menu open` for #196 if not yet merged)
   lists that finding with `excused: <issue>`. If every known issue has been
   fixed by then, put one fix back locally, see the finding appear unexcused,
   and restore it.
9. **`/ship-feature` step 7 uses it.** `.claude/skills/ship-feature/SKILL.md`
   step 7 says: when the diff touches anything a coach sees (`app/**` other
   than `sw.js`), run look.mjs against a local `npm run serve` for the views the
   diff touches at `--widths 320,390 --font 16,32` (plus `--dark` when colors
   change), and pass the output directory to `quality-reviewer`, which reads
   the PNGs and `measurements.json`.
10. **`AGENTS.md` names it beside `compare-shots.mjs`**, with one line on when
    to use which: `compare-shots.mjs` for a redesign ticket's fixed
    side-by-side set against the prototype; `look.mjs` for any look check, any
    URL including a preview, the widths/fonts/views you choose, with
    cut-off-text findings.
11. **Nothing under `app/` changes.** `git diff main -- app/` is empty; no
    `sw:bump`. `npm test` and `npm run smoke -- --no-tests` stay green, and
    `clipsweep` still reports what it reported before the refactor.

## Surfaces

Change:

- `scripts/look.mjs` — new. CLI, cell matrix, capture loop, JSON writer. Pure
  parts exported; `main()` runs only on direct invocation.
- `scripts/smoke/clip-sweep.mjs` — export `CLIP_PROBE`, `LONG_AND_SQUEEZE`,
  `CONFIRM_STATE`, and a new pure `knownIssueFor(finding)` (the
  `CLIP_SWEEP_KNOWN_ISSUES.find(k => k.match(p))` line) that `clipSweepPass`
  itself then calls. Also extract the per-state open dispatch
  (`firstRun`/`tryLink`/`four`/`rotationToast`/`firstRunTypedRoster`/`open`)
  into an exported `openState(c, origin, v)` that `clipSweepPass` calls —
  unless #125 has already given that a home, in which case use #125's.
- `scripts/compare-shots.mjs` — export `READ_PAINT` (the pre/post paint read).
  No behavior change.
- `test/look.test.js` — new.
- `.claude/skills/ship-feature/SKILL.md` — step 7.
- `AGENTS.md` — the `compare-shots.mjs` paragraph in § Layout.

Must not change: anything under `app/`; `CLIP_SWEEP_ALLOW`,
`CLIP_SWEEP_KNOWN_ISSUES`, `CLIP_SWEEP_SIDEWAYS` entries (sibling PRs
#187–#191, #195–#198 edit those); `compare-shots.mjs`' shot table and
behavior; `fixtures.mjs`' records.

## Constraints

- **Reuse, do not re-derive:** `launch`/`cdp` (`smoke/chrome.mjs`); `serve`
  (`serve.mjs`); `FONT_INJECTION_SCRIPT` (`smoke/registry.mjs` re-export of
  `smoke-font.mjs`); `land`, `resize`, `setMedia`, `bootWait`, `withScripts`
(`smoke/page-state.mjs`) and the landings in `fixtures.mjs`; `VIEWS`,
  `APP_LARGE_TEXT_STATES`, `CONFIRM_STATE`, `LONG_AND_SQUEEZE`; `CLIP_PROBE`
  and `CLIP_SWEEP_KNOWN_ISSUES`; `shotProblems`, `postCaptureProblems`,
  `deviceMetrics`, `THEME_BG`, `READ_PAINT` from `compare-shots.mjs`;
  `SETTLE`/`evalIn`/`step` (`smoke/dom.mjs`). A second copy of any of these is
  a `reuse-reviewer` finding.
- **Draw text in DejaVu Sans, as smoke does** (#177, AGENTS.md "Smoke forces
  CI's font on a Mac too"): `FONT_INJECTION_SCRIPT` on every new document, so
  a finding in `measurements.json` is the one CI would report. (Decided.)
- **Dark is reached through the record** (`ui.theme: 'dark'`), never OS
  emulation, and proved by paint (#86).
- **`/browser-verify` §2–3:** every record returns `location.host`; a probe
  that cannot say which origin it measured has measured nothing.
- **`/new-guard`:** the pure rule functions in `test/look.test.js` are
  watched fail before they are trusted; a run that captured zero shots or
  scanned zero elements fails rather than writing an empty
  `measurements.json`.
- `scripts/smoke/clip-sweep.mjs` stays under the 55,000-byte cap
  (`test/smoke-size.test.js`); it is 28,560 today. `look.mjs` lives in
  `scripts/`, outside that cap, but keep it small by importing.
- One issue: no fixes to the clipping bugs look.mjs finds.

## Design

1. **Parse** (`parseArgs(argv)`, pure): `--url`, `--widths`, `--font`,
   `--dark`, `--view`, `--out`, `--headful`. Validates per item 2. View names
   resolve against `[...APP_LARGE_TEXT_STATES, CONFIRM_STATE]` (which already
   starts with `VIEWS`) plus `about`. The chart pages are out of scope
   (decided). A slug per name: lowercase, non-alphanumerics to
   `-`.
2. **Plan** (`cells({ views, widths, fonts, dark })`, pure): the ordered cell
   list with each cell's file stem. Exported so the test can count and name
   cells without a browser.
3. **Launch** a fresh Chrome (`launch`), `Page.enable`, `Runtime.enable`,
   `Network.enable` + `Network.setBypassServiceWorker`, touch emulation,
   `Emulation.setEmulatedMedia` reduced motion, `FONT_INJECTION_SCRIPT` on new
   documents. First navigation to the origin so storage writes are allowed.
4. **Per cell:** `Page.setFontSizes` → `setDeviceMetricsOverride`
   (`deviceMetrics`) → load the page with `LONG_AND_SQUEEZE` seeded and
   `ui.theme` set (the reload is what makes the font size take) → open the
   state (`openState`, or #125's call) → `SETTLE` → for `about`, assert every
   `.reveal` is at opacity 1 → read `READ_PAINT` + origin + `swControlled` →
   `shotProblems` → run `CLIP_PROBE` → capture → re-read →
   `postCaptureProblems` → write PNG. Then scroll to the bottom (the same
   generic scroll `clip-sweep.mjs` does); if anything moved, probe and capture
   again as `-bottom`.
5. **Classify** each raw finding with `knownIssueFor` → `excused`.
6. **Write** `measurements.json` (item 6), print a summary line per shot with
   unexcused findings, restore overrides in `finally`, close Chrome and the
   server.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `parseArgs`, `cells` | `test/look.test.js`, `node --test` | 2, 3 (names, counts, refusals) |
| `knownIssueFor` | `test/look.test.js` feeding a finding shaped like #187's split and one matching nothing | 6 |
| Import launches nothing | `test/look.test.js`, as `test/compare-shots.test.js` does | — |
| `READ_PAINT` / `shotProblems` reuse | existing `test/compare-shots.test.js` stays green | 4 |
| `clipsweep` unchanged after the refactor | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`, same row result before and after | 11 |
| Real run, local | `node scripts/look.mjs --view today,settings,about --widths 320,390 --font 16,32 --dark --out <scratch>`; read the PNGs and `measurements.json` | 1a, 3, 4, 5, 6 |
| Real run, `npm run serve` | same with `--url http://127.0.0.1:8201` | 1a |
| Agreement with smoke | item 8's run | 8 |
| Preview | same command with `--url <branch preview>` at step 12 | 1b |
| Docs | read SKILL.md step 7 and AGENTS.md § Layout in the diff | 9, 10 |

## Overlaps

- **#125** (merged, #280) — the setup module; see Sequencing.
- **#187–#191, #195–#198** edit `CLIP_SWEEP_KNOWN_ISSUES`. look.mjs imports
  the list and never edits entries, so its only conflict risk is the
  export/`knownIssueFor` lines in `clip-sweep.mjs`. Item 8 names its state at
  build time for the same reason.
- **#200** changes the word-floor measurement (`WORD_FLOOR_FN`) that
  `CLIP_PROBE` calls; look.mjs picks that up for free.
- **#181** (smoke index / architecture doc) may also edit `AGENTS.md` § Layout.

## Out of scope

- Fixing any clipping look.mjs reports.
- Replacing or merging `compare-shots.mjs`.
- Making look.mjs a smoke row or a CI job.
- Pixel diffing between runs.
