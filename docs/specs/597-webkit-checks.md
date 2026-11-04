# #597 — Key checks in WebKit

## Issue

#597. Every check runs Chrome, so two iPhone-only bugs reached coaches (Nov 1:
Print card did nothing in the installed iOS app; Nov 2: bench mode's scroll
bar still showed on iOS). Add a small WebKit run, a non-blocking CI job for it,
and `--engine webkit` on `scripts/look.mjs`.

## Lane

Light review, by the orchestrator's instruction for this batch: this short
brief, a test-first build, `quality-reviewer` and `doc-writer`. Tooling only.
No coach note: a new test run and a look-check flag; nothing a coach sees.

## Decisions the issue left open (closest to its intent)

- **Playwright stays out of `package.json`.** The repo has zero dependencies
  (`test/no-dependencies.test.js`, the README badge). Playwright is found at
  run time with a dynamic `import('playwright')`. Pinned at **1.64.1**
  (released 2026-10-14; WebKit revision 2370). One exported constant holds the
  version; the workflow repeats it and a test holds the two equal. Missing, it
  prints `Playwright not installed: run npm install --no-save --no-package-lock
  playwright@1.64.1 && npx playwright@1.64.1 install webkit` and exits 1.
  `npm test`, `npm run smoke` and every existing CI job never import it.
- **Own workflow file, not a sixth job in `test.yml`.** `test/ci-config.test.js`
  pins `test.yml`'s job list to branch protection. A separate
  `.github/workflows/webkit.yml` is never required and never pending; its job
  sets `continue-on-error: true` so a red run cannot block a merge, and it
  still prints the table and uploads the look shots.
- **"Scroll bars on the long sheets" is bench mode.** The survey found one place
  that hides scroll bars: `.gm, .gm * { scrollbar-width: none }` (app.css,
  #549/#551). Every other sheet keeps its scroll bar on purpose.
- **One CDP-shaped adapter over a Playwright page**, so `land()`, `evalIn`,
  `openState`, the clock, the seeding scripts and look.mjs's whole `shoot()`
  run unchanged in WebKit. A CDP method with no WebKit meaning throws, naming
  the method, rather than being skipped.
- **What WebKit cannot reproduce, said plainly.**
  - Nov 1: `window.print()` doing nothing is a property of the iOS Home Screen
    app, not of WebKit. Playwright's WebKit is desktop WebKit
    (`navigator.standalone` is `false` there). The check emulates the Home
    Screen app (`navigator.standalone = true` and a share sheet that takes
    files, the same emulation `test/coach.js` uses) and asserts the app shares
    instead of calling `window.print()`. That proves the app's choice in WebKit,
    not iOS's print behavior.
  - Nov 2: iOS ignored `::-webkit-scrollbar` on a box with
    `-webkit-overflow-scrolling: touch`. Desktop WebKit does not implement that
    property, so the #551 bug cannot be reproduced here. The check catches the
    #549 class (no rule hides the bar) in WebKit: computed `scrollbar-width` is
    `none` on every bench-mode scroller, and, where this WebKit draws classic
    scroll bars, each one takes 0px. macOS WebKit draws overlay bars (a control
    scroller measures 0px), so there the width arm reports SKIP with that
    reason and only the computed-style arm judges.
  - No touch input model and no device: a clean WebKit run clears nothing on a
    real iPhone (`/browser-verify` §6).

## What would settle it

1. `node scripts/webkit.mjs` prints a PASS/FAIL/SKIP table of five rows and
   exits 0 on `main`, in WebKit 2370:
   - **print**: in a browser tab, Today's `Print card for Ravens …` calls
     `window.print()` once, with the game screen showing.
   - **home-screen print**: with the Home Screen app emulated, Today's Print
     card row for Ravens (found by `.today-print` in the Ravens pass, not by its
     label) shares one `image/png` file named `benchcard-ravens.png` and calls
     `window.print()` zero times. The same for the game screen's `#print`.
   - **share image**: in a browser tab with WebKit's own navigator, the Share
     image button either reaches `navigator.share` (recorded, not opened) or
     shows the fallback toast (`Card copied…` or `Card saved as a PNG.`).
   - **bench mode scroll bars**: at 390×500 (so the floor scrolls), at least one
     scroller inside `.gm` is found; each has computed `scrollbar-width: none`;
     where a control scroller measures > 0px, each bench-mode scroller
     measures 0px.
   - **add a game**: Today → `#todayAddGame` → type `Panthers` → Next → Add
     game: the flow closes, the day holds one more game labelled Panthers, and
     Today shows its pass.
2. With the Nov 1 fix taken back out (`printCard`'s
   `if (isHomeScreenApp()) { shareCardImage(); return; }` removed), the
   **home-screen print** row FAILs in WebKit and the run exits 1; put back, it
   passes. With #549/#551's two hiding lines removed, **bench mode scroll bars**
   FAILs.
3. `node scripts/look.mjs --engine webkit --out <dir> --view today` writes PNGs
   at 320 and 390 wide (16 and 32px text) plus `measurements.json`.
   `--engine chromium` (the default) behaves exactly as today. Any other value
   is refused by `parseArgs`.
4. Without Playwright installed, `node scripts/webkit.mjs` and
   `look.mjs --engine webkit` print the `Playwright not installed: run …` line
   and exit 1; `npm test` passes with no Playwright anywhere.
5. `.github/workflows/webkit.yml` runs on push to main and on pull requests, on
   `ubuntu-24.04`, installs exactly `playwright@1.64.1` with `--with-deps
   webkit`, runs the five checks and a look run, uploads the shots, and its job
   has `continue-on-error: true`.

## Surfaces

New: `scripts/webkit.mjs` (entry: table, exit code), `scripts/webkit/`
(`playwright.mjs` loader + version; `cdp.mjs` adapter; the checks),
`.github/workflows/webkit.yml`, `test/webkit.test.js`.
Change: `scripts/look.mjs` (`--engine`), `test/look.test.js`,
`test/ci-config.test.js` (webkit.yml is advisory and pins the version),
`test/coach.js` only to import the print spy and Home Screen app emulation from
one shared module instead of holding its own copy.
Must not change: `package.json`, `app/`, `scripts/lanes/`,
`.claude/skills/ship-feature/`, `test.yml`, `scripts/coverage.json`.

## Constraints

- Reuse, do not re-derive: `land`/`bootWait`/`withScripts` (page-state.mjs),
  `evalIn`/`SETTLE`/`TIMER_TRACKER` (dom.mjs), `CLOCK_SCRIPT`, `RICH`/`richWith`
  /`TODAY_LANDING` (fixtures.mjs), `realTap`/`typeIn`/`waitClosed`
  (sheet-drive.mjs), `serve()`. The print spy and the Home Screen app emulation
  live once and both `test/coach.js` and the WebKit checks use them.
- `/new-guard`: every row must be able to fail. A row that found nothing to
  measure (no `.today-print`, no scroller, no toast and no share) is FAIL, not
  PASS. SKIP only for the overlay-scroll-bar width arm, with its reason.
- Every probe and run has its own timeout. The adapter and runner close their
  own WebKit on every exit path.
- Made-up names only (fixtures already comply).

## Proof

- **Unit, `node --test` (`test/webkit.test.js`, `test/look.test.js`,
  `test/ci-config.test.js`)**: the pure verdict functions per row, the loader's
  missing-module message (fed a module name that cannot exist), the adapter's
  CDP-to-Playwright translation against a fake page (navigate/evaluate/
  viewport/font size/media/init-script add+remove/screenshot/unknown method
  throws), `parseArgs`' `--engine`, and the workflow pins. Covers 3 (args), 4,
  5.
- **Real WebKit, by the orchestrator**: `node scripts/webkit.mjs` on the branch
  (item 1), with the fix reverted and restored (item 2), and a look run
  (item 3). Output goes in the PR's Evidence.

## Out of scope

- Running the whole smoke suite or the Coach scenarios in WebKit.
- An iOS simulator or device run.
- Making the job required; that is a later decision once it proves stable.
