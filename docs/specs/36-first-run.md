# First run in three steps

## Issue

[#36](https://github.com/kylehoehns/benchcard/issues/36) — a coach with no team
sees a welcome screen, then three short steps that end on their first card. The
sample team stays one tap away, and the tour runs on the new screens.

Parent: #18. Blocked by #32 (add a game in three steps) and #33 (floating
controls), both merged.

## Goal

A coach downloads the app in the parking lot twenty minutes before tip-off.
Today they meet a landing screen, tap a door, and get one long form: team name,
roster, periods, minutes, sub interval, all at once, ending on a button called
"Build my first card". It works, but it is one screen carrying five decisions,
and the card it promises only shows up after the screen is gone.

After this change the same coach answers one question per screen — who is on
the team, how long the game is — and the third screen is the card itself, with
Print and Share image on it. The sample team still fills the roster box in one
tap, and nothing is written to the device until the second step is done.

## Survey

Numbered so the rest of the spec can cite them. Each was read, not assumed.

1. **The welcome screen is a real view.** `app/index.html:816`
   `<main class="view welcome noprint" id="view-welcome" hidden>`. It is not in
   `sanitize`'s allow-list (`games | team | season | settings`) — it exists only
   as the value `applyView` is handed. `app/render.js:655` folds it:
   `state.view = v === 'welcome' ? 'today' : v`.

2. **Three places decide welcome-vs-Today, and all three key off
   `state.onboarded`.** Runtime `app/render.js:257` (`if (!state.onboarded) v =
   'welcome'`), boot `app/app.js:370`, and the pre-paint inline script in
   `index.html` that stamps `data-boot` / `data-view` before any module loads.
   `test/first-paint.test.js` extracts those real bytes and runs them.

3. **Today's first run is two panes toggled by one boolean.**
   `app/onboarding.js` has a private `pane(setup)` that flips `#welLanding` and
   `#welSetup`. There is no step structure, no step count, and no close button.

4. **`#32`'s flow shell is the shape to copy.** `app/index.html:1609`
   `<dialog class="flow noprint" id="addGameFlow">` — a top-level `<dialog>`
   with `.flow-bar` (✕, title, "1 of 3"), `.flow-prog`, `.flow-body`,
   `.flow-foot` (‹ Back, primary) and a `.bsheet-cta` discard ask. The header
   comment at `index.html:1601` says why it is top level: `showModal()` throws
   on a dialog with a `hidden` ancestor, and every `.view` is `hidden` most of
   the time.

5. **`closeSheets()` only closes bottom sheets.** `app/trap.js:568`
   `for (const d of document.querySelectorAll('dialog.bsheet[open]'))`. A
   `dialog.flow` survives `applyView`, so a flow can stay open across a
   `setView` call. Checked directly; this is load-bearing for decision 6.

6. **`applyView` saves unconditionally.** `app/render.js:656` `save();`, with no
   `onboarded` guard. `render()` does guard (`app/render.js:107` `if
   (!state.onboarded) return;`). So "saves nothing" means: do not touch
   `state.players` / `state.teamName` / `state.day.games[0]`, and do not call
   `setView`.

7. **`renderCards()` takes no arguments and is the one place a `.card` is
   built.** `app/card.js:313`. `buildCard` is module-private and reads
   `state.ui.cardId`, `state.ui.cardSize`, `state.ui.showMinutes` and
   `state.players`. There is **no** exported way to draw a card from a passed
   plan. `refreshCardSheetPreview()` (`card.js:298`) gets its cards by cloning
   `#sheet .card:not(.card-copy)`, and its own comment names that as the
   decision: "cloning is what keeps this from becoming a second, driftable
   implementation".

8. **`test/print-gate.test.js` discovers print/share controls from `app.js`.**
   It walks top-level `on('#sel', 'onev', …)` bindings, resolves one hop of
   named zero-argument functions (`/^function (\w+)\(\)[\s\S]*?\n}/gm`), and
   then asserts the set of markup elements carrying `data-needs-card` is
   **exactly** that trigger set. So step 3's Print and Share must be real
   elements in `index.html` with ids and the attribute, bound at the top level
   of `app.js`.

9. **`stepperRow` is already exported and already state-free.**
   `app/game-setup.js:268`, `get`/`set` closures, clamped by the pure
   `stepFormat` (`app/state.js:846`). `app/rules.js:330` already drives it from
   a draft object. Its ranges are `PERIODS_LO = 1, PERIODS_HI = 4` and
   `MINUTES_LO = 4, MINUTES_HI = 20` (`game-setup.js:256`) — both currently
   module-private.

10. **The sub-interval list exists twice.** `GRAN_CHOICES` (`app/state.js:102`,
    eight entries) is rendered as `.sheetrow` buttons by the private
    `paintIntervalBody` (`game-setup.js:328`) and as `.chip` buttons by the
    private `renderWelcome` (`onboarding.js:327`). Same data, same job, two
    builders.

11. **`test/aria-state.test.js:23` anchors a case on `$('#welGran')` in
    `onboarding.js`** and its own comment says: "If the control was renamed,
    move this case with it rather than deleting it."

12. **`fitPreview()` names its two stages by hand.** `app/card.js:270` calls
    `fitStage($('#sheet'))` and `fitStage($('#sheetCardPreview'))`. A third
    stage would have to be remembered here.

13. **`app/render.js` contains two raw NUL bytes**, so `grep` skips the whole
    file. One survey pass missed `takeFirstRunPending()` because of it; it is
    there, inside `export function soon(…)`, and `test/sample-team.test.js:186`
    pins it. Read that file with `readFileSync`, never `grep`. Filed as #95 —
    not fixed here.

14. **The smoke harness has no first-run row.** `scripts/smoke/registry.mjs`
    `ROWS` is 44 rows and the welcome screen appears only inside `overlay`
    (state `'welcome screen'`, `overlay.mjs:181`) and `applargetext`
    (`'welcome screen, first run'` and `'welcome screen, sample filled'`,
    `app-large-text.mjs:206` and `:231`).

15. **`app-large-text.mjs`'s `firstRun()` hard-codes the two welcome doors.**
    `scripts/smoke/app-large-text.mjs:327` asserts
    `['#welGo', '#welTry'].filter(s => document.querySelector(s)).length === 2`.
    Any reshaping of the doors fails this check until it is updated.

16. **`APP_LARGE_TEXT_ALLOW` is empty and every view is pinned at zero**
    (`app-large-text.mjs:41`). AGENTS.md and REVIEW.md both make raising a
    number in it a blocker.

17. **The budget that binds is `requests`.** `scripts/budgets.json` pins it at
    39, live is 40, ceiling 41. One slot is left, so a new module in the boot
    graph spends it. `bytes` is hand-pinned as `BYTES_BASELINE = 1_216_873` in
    `scripts/budgets.mjs`; live payload is 1188.7 KB against a 1236.1 KB budget,
    about 47 KB of room.

18. **There is no first-run PNG in the prototype.**
    `notes/mockups/prototype/` has `light/dark-add-game-1..3.png`,
    `sheet-format`, `sheet-interval`, `sheet-card`. So the flow steps take their
    look from `add-game-1..3`, step 2's controls from `sheet-format` and
    `sheet-interval`, and step 3's card from `sheet-card`.

19. **`dialog.flow` has no wide-screen rule.** Nothing in `app/app.css` caps its
    content width, so at 1280px the roster box and the tiles run the full
    window. #35 added the wide layout for the views and did not reach the flow.

20. **The tour's four anchors are already on the new screens.**
    `app/tour.js:51-83`: `#phrasePlayers`, `#phraseStrategy`, `#timeline`,
    `#abBench` / `#gmOpen`. It is started from `onboarding.js:493` and replayed
    from Settings via `#helpTourSettings` → `tourAgain()` (`shortcuts.js:121`),
    pinned by `test/settings.test.js:722`.

## Decisions made in this spec without asking

The ticket is `ready-for-agent`, the survey held up every claim in it, and each
acceptance criterion has a concrete value. These are the calls the criteria
left open.

1. **The welcome screen stays a screen; the three steps are a dialog.**
   Criterion 8 wants a first-time visitor's first *frame* to be the welcome
   screen, and only the pre-paint stamp can do that (survey 2). The steps become
   `<dialog class="flow" id="firstRunFlow">`, mirroring #32: `showModal()` is
   the only API that gives the cancelable `cancel` event Android's back gesture
   fires (I3), inerts the rest of the page, and brings a real focus trap.

2. **Two dialogs, one shared painter — not one renamed shell.** Making
   `#addGameFlow` generic would mean building its ids at runtime, and
   `test/dead-id.test.js` matches ids with a bounded-token regex against the
   source, so an id that is concatenated has no reader. It would also rewrite
   31 KB of `scripts/smoke/add-game-flow.mjs` — #32's own acceptance proof — for
   no behavior change. What actually drifts between two flows is the painting
   logic, not twenty lines of markup, so the painting is what gets shared.

3. **The shared painter goes in `app/trap.js`. No new module.** `requests` has
   one slot left (survey 17) and #32's spec already decided "no new module".
   `trap.js` already owns `openSheet`/`closeSheet`/`guardClose`/`showAskRow`/
   `rememberTrigger`, imports only `$` from `dom.js`, and its header says
   nothing in it touches app state — which is true of a step painter too.

4. **The team is committed when Next is pressed on step 2, not on step 3.**
   Step 3 has to show a *real* card, and `renderCards()` is the one place a
   `.card` is built (survey 7). A draft-only card renderer would be exactly the
   second implementation `card.js` refuses. Committing at the end of step 2 also
   reads the criteria literally: "leaving before the last step saves nothing" —
   step 3 is the last step, and by then the team is made.

5. **Committing calls `setView('games')` while the flow is still open.**
   `closeSheets()` ignores `dialog.flow` (survey 5), so the game screen renders
   behind the modal: `#sheet` fills with the real card, Print needs no view
   switch, and "Go to the game" on step 3 is then just a close, with no
   transition flash. C10 says a flow covers everything including the floating
   bar, and the top layer does exactly that.

6. **Step 3 has no Back.** The team exists by then; stepping back to step 2 and
   then closing would contradict criterion 6's "leaving before the last step
   saves nothing" by making "before the last step" reachable again after the
   save. ✕ on step 3 ends the flow the same way "Go to the game" does, and the
   coach loses nothing: the game screen's sentence (#27) changes the format in
   two taps.

7. **The landing doors are relabelled and reordered, and `#welType` is
   renamed.** Criterion 1 names "Set up my team" as the primary action and "Try
   a sample team" beside it. So `#welType` becomes `#welStart` (`.wel-type`
   becomes `.wel-start`) — a button labelled "Set up my team" with an id meaning
   "type" is the stale name this repo keeps deleting. `#welTry` keeps its id and
   loses the primary style. `#welGo` disappears with the setup pane; the flow's
   footer button is the primary now.

8. **`<section id="welSetup">` is deleted outright, and `id="welLanding"` with
   it.** Every field in it moves into a flow step. With one pane left, a pane id
   nothing reads would fail `test/dead-id.test.js`, so the wrapper keeps its
   class (`.wel-landing`, which does real layout work) and loses its id. Nothing
   about the one-screen layout (A52) changes.

9. **Step 2 uses the app's own format range, 1–4 periods and 4–20 minutes.**
   Today the welcome form allows 1–8 and 1–40 and `startTeam` clamps to that,
   but the format sheet a coach uses for the rest of the season is 1–4 × 4–20
   (survey 9). A first run that produces six periods makes a game the format
   sheet cannot represent, and the next edit silently clamps it. One answer in
   one place: first run reuses `stepperRow` with `game-setup.js`'s own bounds,
   which are exported for it.

10. **The sub-interval list is extracted, not copied a third time.**
    `paintIntervalBody`'s body becomes an exported `paintGranRows(box, get,
    onPick)` in `game-setup.js`; the sheet and first-run step 2 both call it,
    and `renderWelcome`'s chip builder is deleted. `test/aria-state.test.js`'s
    `$('#welGran')` case moves to the new function rather than being deleted
    (survey 11).

11. **Step 3's card is a clone of `#sheet`'s cards, through one generalized
    function.** `refreshCardSheetPreview()` becomes a thin call to a new
    exported `cardPreviewInto(host)`; step 3 calls the same function with its
    own stage. `fitPreview()` stops naming stages by hand and fits every
    `.stage` in the document (survey 12), so a fourth stage cannot be forgotten.

12. **Print and Share image on step 3 are plain buttons, not filled ones.**
    `notes/mockups/prototype/light-sheet-card.png` draws Print filled, but C2
    says the primary action is the only filled button on the screen and on step
    3 that is "Go to the game" in the footer. The guidelines win, which is the
    rule the prototype README itself states.

13. **The inline share handler in `app.js` is extracted to a named
    zero-argument function.** `test/print-gate.test.js` resolves one hop of
    `function name()` (survey 8), so `function shareCardImage()` lets `#shareCard`
    and step 3's `#frShare` share one rule instead of two copies of the same
    twenty lines.

14. **`dialog.flow` gets a wide-screen content cap.** Survey 19: at 1280px the
    flow currently runs edge to edge. One rule centers the bar row, the progress
    strip, the body and the footer in a 34rem column past `WIDE_MIN`. This also
    improves #32's flow, which is the point of putting it on `.flow` rather than
    on `#firstRunFlow`.

15. **`?try=N` is untouched.** It already wipes, builds and lands on the card
    (`loadSample` → `markFirstRunPending` → `setView('games')` → flash), and
    criterion 5's second clause is a characterization of that, not a change.

## What would settle it

Concrete values, one item per acceptance criterion. `<n>` values are exact.

1. **The landing screen.** With `localStorage` empty at 390×844, `#view-welcome`
   is not hidden, `.bar` computes `display: none`, and the screen carries: the
   `h1` "The whole game, worked out before you leave the house."; a `#welRows`
   strip with **9** rows of real solved stints; `#welStart`, a `.btn.primary`
   labelled exactly **"Set up my team"**, first in `.wel-doors`; `#welTry`, a
   non-primary `.btn` labelled exactly **"Try a sample team"**; and `#welRestore`
   labelled **"Restore a backup"** in the tail row. `#firstRunFlow` exists in the
   markup and is **not** open.

2. **Step 1.** Tapping `#welStart` opens `#firstRunFlow` with `dialog.open ===
   true`, `#frStep` reading **"1 of 3"**, one of three `.flow-prog i` carrying
   `.on`, and `.flow-q` reading exactly **"Who's on the team?"**. The body holds
   `#frTeam` (text input, placeholder `Wildcats 6th Grade`) and `#frRoster`
   (textarea). Typing `"12 Maya Webb\n4 Eli Tran\nDevon Ellis"` into `#frRoster`
   puts `#frCount` at **"3 players so far. 5 needed to field a lineup."** and
   leaves `#frNext.disabled === true`. Adding two more lines puts `#frCount` at
   **"5 players so far."** and `#frNext.disabled === false`. An empty box reads
   **"Paste from wherever your roster lives. Jersey numbers are optional."**
   Parsing is `parseRoster` from `app/roster.js` and nothing else.

3. **Step 2.** Next from step 1 puts `#frStep` at **"2 of 3"** and `.flow-q` at
   exactly **"How long is a game?"**. The body holds two `.pstep-row`s:
   "Periods" reading **4** with − disabled below 1 and + disabled above 4, and
   "Minutes each" reading **8** with bounds 4 and 20. Under them, eight
   `.sheetrow` buttons built from `GRAN_CHOICES`, with **"Every 4 min"** carrying
   `aria-pressed="true"` and a `✓`. `#frNext` reads **"Next"**.

4. **Step 3.** Next from step 2 puts `#frStep` at **"3 of 3"** and `.flow-q` at
   exactly **"Here's your first card"**. `#frStage` holds **at least 1**
   `.card`, whose `.card-hd .opp` text is non-empty. `#frBack` is hidden.
   `#frPrint` (labelled "Print") and `#frShare` (labelled "Share image") are both
   present, both carry `data-needs-card`, both are enabled, and neither carries
   `.primary`. `#frNext` reads exactly **"Go to the game"**. Tapping it closes
   the dialog and leaves `#view-games` not hidden with `#sheet` holding the same
   card count.

5. **The sample, and the deep link.** Tapping `#welTry` opens the flow on step 1
   with `#frTeam.value === 'Sample team'` and `#frRoster.value` holding exactly
   `sampleRosterText(n)` for the `n` lines it wrote, and with `localStorage`
   still holding **0** players and `state.onboarded === false`. `n` is **9**,
   not `roster.js`'s `SAMPLE_SIZE` of 10: `fillSample(n = DEMO_N)`
   (`app/onboarding.js:397`) already defaults to the hero demo's nine-player
   roster on purpose, so the box matches the rotation the coach just watched
   solve. The check asserts that self-consistency rather than a hand-written
   count, so it cannot drift from `roster.js`. `#frFill` inside step 1 does the
   same thing and is hidden once the box is non-empty. Separately, landing on
   `?try=12` still ends with `#view-games` not hidden, **12** `.tl-row[data-id]`
   rows in `#timeline`, and a toast starting `"Sample team loaded."`.

6. **Every step has a way out, and leaving early saves nothing.** ✕ (`#frClose`)
   is present on all three steps. Android back (a `cancel` event) on step 2 goes
   to step 1; on step 1 it asks; on step 3 it finishes. With text in `#frTeam` or
   `#frRoster`, ✕ on step 1 or 2 shows `#frAsk` reading **"Discard this team?"**
   with "Keep editing" and "Discard", and the dialog stays open. "Discard" closes
   it, and afterwards `state.onboarded === false`, `state.players.length === 0`,
   and the stored record holds **0** players. With both boxes empty, ✕ closes
   with no ask.

7. **The tour.** Finishing step 3 with `state.tourSeen === false` shows `#tour`
   within 1000 ms, with `#tourStep` reading **"Step 1 of 4"**. Each of the four
   `TOUR` steps resolves at least one of its selectors to an element in the
   markup. `#helpTourSettings` in Settings still reaches the same `tourAgain()`
   that `#helpTour` does.

8. **First paint.** With an empty store, the pre-paint script stamps
   `data-boot="welcome"` and `data-view="welcome"`, agreeing with `loadState` +
   `sanitize`; and `#firstRunFlow` ships without an `open` attribute, so the
   first frame is the welcome screen and not the flow.

9. **The harness.** `npm test` passes with **0** failures and `npm run smoke`
   passes every row. Every test written against markup this change replaces is
   updated or retired in the same commit: `test/sample-team.test.js`,
   `test/anim-fill.test.js`'s pane-sibling case, `test/aria-state.test.js`,
   `test/backup.test.js`, `scripts/smoke/app-large-text.mjs`,
   `scripts/smoke/overlay.mjs`, `scripts/smoke/touch.mjs` and
   `scripts/smoke/registry.mjs`. `APP_LARGE_TEXT_ALLOW` and `LARGE_TEXT_ALLOW`
   stay empty. `requests` stays pinned at 39.

## Surfaces

### Changes

| File | What |
| --- | --- |
| `app/index.html` | Landing doors relabelled/reordered; `<section id="welSetup">` deleted; `id="welLanding"` dropped; new `<dialog class="flow noprint" id="firstRunFlow">` beside `#addGameFlow`; `#agAsk`/`#agClose` gain shared classes |
| `app/onboarding.js` | `pane`/`renderWelcome`/`finishOnboarding` replaced by the three-step flow; `startTeam`, `fillSample`, `loadSample`, the demo stage and the `?try=` landing kept |
| `app/trap.js` | New export `paintFlowShell(ids, n, total, node, opts)` |
| `app/teams-view.js` | `paintFlow` delegates to `paintFlowShell` |
| `app/game-setup.js` | `paintIntervalBody` split into an exported `paintGranRows`; `PERIODS_LO/HI`, `MINUTES_LO/HI` exported |
| `app/card.js` | New export `cardPreviewInto(host)`; `refreshCardSheetPreview` calls it; `fitPreview` fits every `.stage` |
| `app/app.js` | Inline `#shareCard` handler extracted to `function shareCardImage()`; `#frPrint` and `#frShare` bound |
| `app/app.css` | `.wel-setup`/`.wel-card`/`.wel-back`/`.wel-h2`/`.wel-fill`/`.chips` welcome rules deleted; `.wel-start` replaces `.wel-type`; `.flow-ask` replaces `#agAsk`; `.flow-bar-row .bsheet-close` replaces `#agClose`; new `.fr-*` rules and the wide `.flow` cap |
| `app/sw.js` | `VERSION` bumped and `SHELL` set to the digest `npm test` names, in the same edit |
| `test/first-run.test.js` | New: the flow's pure seams |
| `test/sample-team.test.js` | Pane assertions replaced with flow assertions |
| `test/anim-fill.test.js` | Pane-sibling case retired with its reason |
| `test/aria-state.test.js` | `#welGran` case moved to `paintGranRows` |
| `test/backup.test.js` | Welcome restore assertion repointed |
| `test/first-paint.test.js` | New case for criterion 8 |
| `test/big-text.test.js` | `.wel-go` comment/count if the selector list changes |
| `scripts/smoke/first-run-flow.mjs` | New: the flow's browser seams |
| `scripts/smoke/registry.mjs` | One new row |
| `scripts/smoke/app-large-text.mjs` | `firstRun()` doors; three flow-step states |
| `scripts/smoke/overlay.mjs` | First-run flow states |
| `scripts/smoke/touch.mjs` | First-run flow states |
| `scripts/compare-shots.mjs` | `SHOTS` gains the three first-run steps, light and dark |
| `test/compare-shots.test.js` | #86's "exactly one 320px/32px shot" claim splits by domain, the way #34 already split it for `resume-bar-320` |
| `test/smoke-only.test.js` | The pinned `--only`-able row count, 40 → 41 |
| `test/card-blocked.test.js`, `test/storage.test.js` | Follow the `cardPreviewInto` seam and the draft commit |
| `scripts/smoke.mjs` | Import and `RUN` entry for the new check |
| `AGENTS.md` | The smoke check count, and the large-text state list |
| `docs/specs/36-first-run.md` | This file |

### Must not change

- `app/engine.js`, `app/budget.js`, `app/storage.js`, `app/roster.js` — the four
  pure modules. `parseRoster` is reused exactly as it is.
- `scripts/budgets.json` — `requests` stays 39. Never run
  `node scripts/smoke.mjs --update-budgets`.
- `app/render.js` — it carries two NUL bytes (survey 13, #95). No edit here.
- `scripts/smoke/add-game-flow.mjs` — #32's acceptance proof stays byte-identical;
  decision 2 exists so it can.
- The card's 3.45 × 5 in geometry, `CARD_FONT`, and the privacy line
  "No account. Your roster never leaves your device."

## Constraints

### Reuse — do not re-derive

- **`parseRoster`** (`app/roster.js:33`) for step 1's box. Do not write a second
  parser, and do not pre-split on newlines before handing it the text.
- **`sampleRoster` / `sampleRosterText` / `SAMPLE_TEAM_NAME`** (`app/roster.js`)
  for the sample. `fillSample` already does this and already records what it
  wrote; keep it.
- **`stepperRow`** (`app/game-setup.js:268`) and **`stepFormat`**
  (`app/state.js:846`) for step 2's two steppers. Do not build a stepper.
- **`GRAN_CHOICES`** (`app/state.js:102`) through the new `paintGranRows`. Do not
  write a third list of sub intervals, and do not hand-write the labels.
- **`renderCards` → `#sheet` → `cardPreviewInto`** for step 3. Do not render a
  card from a draft plan; there is exactly one card builder and it is private.
- **`shareCards(cards, opts)`** (`app/share.js:204`) through the extracted
  `shareCardImage()`. It already takes nodes and imports no state.
- **`printCard`** (`app/app.js:127`) for `#frPrint`. Do not call `window.print()`
  anywhere else — `test/print-gate.test.js` fails on it.
- **`guardClose` / `showAskRow` / `closeSheet` / `rememberTrigger`**
  (`app/trap.js`) for the discard ask and the close path, exactly as
  `wireAddGameFlow` uses them.
- **`startTour`** (`app/tour.js:238`). Do not add a fifth tour step and do not
  move the anchors — survey 20 says they already point at the new screens.
- **`markFirstRunPending` / `takeFirstRunPending` / `bucketRoster`** for the
  analytics rule. The sample must never fire `first_run_complete`; the deferred
  count fires from `soon()` on the first real edit.

### Guideline rules the ticket names

- **N8** — multi-step tasks are full screen, with a step count and a close
  button, and always skippable. Three steps, `#frStep`, `#frClose`, and "Try a
  sample team" as the skip.
- **C2** — the primary action is one full-width verb-labelled button in thumb
  reach, and the only filled button on the screen. That is `#frNext` on every
  step, which is why decision 12 unfills Print.
- **C10** — full screen, ✕ top left, covering everything including the floating
  bar. `showModal()` and the top layer; ✕ is first in `.flow-bar-row`.
- **P2** — one job per screen, one prominent action. One question per step.
- **N1** — no tab bar, anywhere. The prototype README already concedes this one.
- **I1 / C6** — 48px targets and rows. `.flow-foot .btn` and `.sheetrow` both
  already carry the floor; the new rows must not undercut it.
- **I3** — a gesture is never the only way. Android back has a visible twin in
  `#frBack`, and on step 3 it finishes rather than dead-ending.
- **C4** — a commit surface asks before losing typed text. `#frAsk`.
- **A2 / N5** — the back control is named for where it goes: "‹ Back".

### Harness traps this change walks into

1. **The service worker.** Any edit under `app/` means bumping `VERSION`
   (`app/sw.js:22`) and setting `SHELL` (`app/sw.js:32`) to the new digest **in
   the same edit**. Never trust a quoted digest, including one a session hook
   printed — re-derive it:
   `npm test 2>&1 | grep -A 25 "SHELL matches the bytes"`.
2. **Ids must be literal.** `test/dead-id.test.js` matches with a bounded-token
   regex over `app/*.js`, `app/*.css` and the markup. No `'#fr' + n` anywhere.
3. **Classes the JS emits need a rule.** `test/dead-class.test.js`. Deleting the
   setup pane means deleting its CSS in the same commit.
4. **`test/print-gate.test.js` is exact.** The set of `data-needs-card` carriers
   must equal the discovered trigger set — adding the attribute without the
   binding fails, and so does the reverse.
5. **The byte budget.** If the payload overruns, re-pin `BYTES_BASELINE` in
   `scripts/budgets.mjs` to the measured cold load and say why in the commit
   message. Routine. `requests` is the one that must not move.
6. **Smoke files stay under 40,000 bytes.** `scripts/smoke/plan-sheet.mjs` is
   already at 37.3 KB; the new work goes in its own module.
7. **A guard must be shown red before it is trusted green.** Every new or edited
   test and smoke check is run against the unchanged tree first, and the actual
   failure text is reported.
8. **Extend `scripts/compare-shots.mjs`'s `SHOTS` table** — do not write a
   throwaway capture script. Do not reintroduce the bug #35 fixed where the
   `bottom` scroll was skipped for some shot types.
9. **Never `grep` `app/render.js`** (survey 13).

### Mobile first

390 × 844 is the design width. The 320px / 32px large-text cell is a hard pass
with `APP_LARGE_TEXT_ALLOW` empty. Step 1's two fields, step 2's two steppers
plus eight rows, and step 3's card all have to survive it — the flow bar already
has its `@media (max-width: 14em)` reflow, and `.flow-foot`'s `flex: 1 1 9rem`
already wraps the primary to its own row at a 32px root.

## Design

### The shell

```
┌─────────────────────────────────────┐  dialog.flow#firstRunFlow
│ ✕      Get started           2 of 3 │  .flow-bar > .flow-bar-row
│  ▁▁▁▁▁▁  ▃▃▃▃▃▃  ▁▁▁▁▁▁            │  .flow-prog  (i, i.on, i)
├─────────────────────────────────────┤
│                                     │
│  How long is a game?                │  .flow-q  (h2, tabindex=-1)
│                                     │
│  ┌─────────────────────────────┐    │  .flow-body#frBody
│  │ Periods            4  [−][+]│    │  .pgrp > .prow.pstep-row
│  │ Minutes each       8  [−][+]│    │
│  └─────────────────────────────┘    │
│  How often do you sub?              │  .f
│  ┌─────────────────────────────┐    │
│  │ Every 2 min                 │    │  .sheetrow
│  │ Every 4 min               ✓ │    │  .sheetrow.sel
│  │ …                           │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  [ ‹ Back ]  [      Next      ]     │  .flow-foot#frFoot
└─────────────────────────────────────┘
```

Markup, beside `#addGameFlow` and outside every `.view` (survey 4):

```html
<dialog class="flow noprint" id="firstRunFlow" aria-label="Get started">
  <div class="flow-bar">
    <div class="flow-bar-row">
      <button type="button" class="bsheet-close" id="frClose" aria-label="Close">✕</button>
      <span class="flow-t">Get started</span>
      <span class="flow-step" id="frStep"></span>
    </div>
    <div class="flow-prog" id="frProg" aria-hidden="true"></div>
  </div>
  <div class="flow-body" id="frBody"></div>
  <div class="flow-foot" id="frFoot">
    <button class="btn ghost press" id="frBack" type="button" hidden>‹ Back</button>
    <button class="btn primary press" id="frNext" type="button">Next</button>
  </div>
  <div class="bsheet-cta flow-ask" id="frAsk" hidden>
    <p class="bsheet-ask-t">Discard this team?</p>
    <button class="btn primary press" id="frKeep" type="button">Keep editing</button>
    <button class="btn ghost danger press" id="frDiscard" type="button">Discard</button>
  </div>
</dialog>
```

Step 3's Print and Share are real markup, inside `#frBody`'s step-3 subtree —
which means they cannot be built by `el()` (survey 8). They live in the dialog
as a hidden row that step 3 moves into place:

```html
<div class="gm-cta fr-cta" id="frShareRow" hidden>
  <button class="btn press" id="frPrint" data-needs-card aria-label="Print the card">
    <span class="i" data-icon="printer"></span> Print
  </button>
  <button class="btn press" id="frShare" data-needs-card>
    <span class="i" data-icon="share-2"></span> Share image
  </button>
</div>
```

`stepCard` appends `#frShareRow` into its own wrapper and clears `hidden`;
leaving step 3 puts it back and re-hides it. That keeps both ids literal in the
markup and keeps them out of the tab order on steps 1 and 2.

### The shared painter (`app/trap.js`)

```js
export function paintFlowShell(ids, n, total, node, opts = {}) {
  const { nextText = 'Next', nextDisabled = false, backHidden = n === 1 } = opts;
  const step = $(ids.step); if (step) step.textContent = `${n} of ${total}`;
  const prog = $(ids.prog);
  if (prog) {
    if (prog.children.length !== total)
      prog.replaceChildren(...Array.from({ length: total },
        () => document.createElement('i')));
    [...prog.children].forEach((seg, i) => seg.classList.toggle('on', i === n - 1));
  }
  const body = $(ids.body);
  if (body) body.replaceChildren(node);
  const back = $(ids.back); if (back) back.hidden = backHidden;
  const next = $(ids.next);
  if (next) { next.textContent = nextText; next.disabled = nextDisabled; }
  body?.querySelector('h2')?.focus({ preventScroll: true });
}
```

`teams-view.js`'s `paintFlow` keeps its own `showFlowAsk(false)` and draft guard
and becomes one call:

```js
const AG = { step: '#agStep', prog: '#agProg', body: '#agBody',
             back: '#agBack', next: '#agNext' };
function paintFlow() {
  if (!draft) return;
  showFlowAsk(false);
  paintFlowShell(AG, flowStep, STEPS, stepBody(flowStep),
    { nextText: flowStep === STEPS ? 'Plan it' : 'Next' });
}
```

Behavior is identical, so `scripts/smoke/add-game-flow.mjs` does not move.

### The steps (`app/onboarding.js`)

```js
const FR = { step: '#frStep', prog: '#frProg', body: '#frBody',
             back: '#frBack', next: '#frNext' };

const FR_STEPS = [
  { q: "Who's on the team?",     build: stepTeam },
  { q: 'How long is a game?',    build: stepFormat_ },
  { q: "Here's your first card", build: stepCard },
];
const FR_TOTAL = FR_STEPS.length;

// The draft. Nothing outside this object is written until `commitFirstRun`.
let fr = null;
let frStep = 1;
const newDraft = () => ({
  teamName: '', roster: '', filled: null,
  periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
});
```

**Opening.** `#welStart` opens at step 1 empty; `#welTry` opens at step 1 with
the sample already in the draft. Both go through one function:

```js
function openFirstRun(trigger, withSample) {
  const d = $('#firstRunFlow');
  if (!d) return;
  fr = newDraft();
  frStep = 1;
  if (withSample) fillSample();          // writes fr.teamName / fr.roster / fr.filled
  rememberTrigger(d, trigger);
  showFrAsk(false);
  d.showModal();
  paintFr();
}
```

**Painting.**

```js
function paintFr() {
  if (!fr) return;
  showFrAsk(false);
  const last = frStep === FR_TOTAL;
  paintFlowShell(FR, frStep, FR_TOTAL, frStepBody(frStep), {
    nextText: last ? 'Go to the game' : 'Next',
    nextDisabled: frStep === 1 && rosterCount() < 5,
    backHidden: frStep === 1 || last,      // decision 6
  });
}
```

**Step 1** builds the two fields with the same `.f` label + input pair the flow
already uses, writes straight into `fr` on `input`, and repaints only the count
line and the Next button — never the whole body, which would steal the caret.

```js
const rosterCount = () => parseRoster(fr.roster).length;

function countLine(n) {
  if (!n) return 'Paste from wherever your roster lives. Jersey numbers are optional.';
  if (n < 5) return `${n} player${n === 1 ? '' : 's'} so far. 5 needed to field a lineup.`;
  return `${n} players so far.`;
}

function onRosterInput(v) {
  fr.roster = v;
  const n = rosterCount();
  set('#frCount', 'textContent', countLine(n));
  set('#frFill', 'hidden', n > 0);
  set('#frNext', 'disabled', n < 5);
}
```

`#frCount` keeps `aria-live="polite"` and is the roster box's
`aria-describedby`, exactly as `#welCount` is today.

**Step 2** is two `stepperRow`s and `paintGranRows`, both against `fr`:

```js
function stepFormat_(wrap) {
  const grp = el('div', 'pgrp');
  grp.append(
    stepperRow('Periods', () => fr.periods, v => { fr.periods = v; },
               PERIODS_LO, PERIODS_HI, 'periods'),
    stepperRow('Minutes each', () => fr.periodMinutes, v => { fr.periodMinutes = v; },
               MINUTES_LO, MINUTES_HI, 'minutes'),
  );
  wrap.append(grp, el('span', 'f fr-f', 'How often do you sub?'));
  const box = el('div', 'fr-gran');
  wrap.append(box);
  paintGranRows(box, () => fr, c => { fr.granMode = c.mode; fr.granValue = c.value; });
}
```

`paintGranRows(box, get, onPick)` is `paintIntervalBody`'s body with `game()`
replaced by `get()` and the write replaced by `onPick(c)`; the sheet's own
caller keeps its `soon('strategy', …)` in the callback, so nothing about the
sheet changes.

**Committing** happens on Next from step 2, before step 3 paints:

```js
function commitFirstRun() {
  const players = parseRoster(fr.roster);
  startTeam(players, fr.teamName, fr);      // same writer as today, given the draft
  if (fr.filled !== null && fr.roster === fr.filled) markFirstRunPending();
  else { track('first_run_complete', { roster: bucketRoster(players.length) }); editHappened(); }
  setView('games');                          // renders the card into #sheet (decision 5)
}
```

`startTeam` keeps its shape and loses its DOM reads: instead of pulling
`#welPeriods` / `#welMinutes` / `welGran`, it takes the draft. It still writes
`state.players` (hue = index), `state.teamName`, `state.day.games[0]`'s
`periods` / `periodMinutes` / `granMode` / `granValue`, clears `targetSlots` and
`targetCapacity`, and sets `state.onboarded = true`.

**Step 3** clones, then borrows the share row:

```js
function stepCard(wrap) {
  const stage = el('div', 'stage fr-stage');
  stage.id = 'frStage';                     // NOTE: literal, see below
  wrap.append(stage, el('p', 'flow-note',
    'This card waits on the game screen whenever you need it.'));
  cardPreviewInto(stage);
  const row = $('#frShareRow');
  if (row) { row.hidden = false; wrap.append(row); }
}
```

`stage.id = 'frStage'` is a literal string assignment, which
`test/dead-id.test.js` accepts as a runtime id (it scans for
`\.id\s*=\s*['"\`]name['"\`]`, the same path `rules.js` and `strategy.js` take).
`#frShareRow` is moved rather than built, so `#frPrint` and `#frShare` stay in
the markup for `test/print-gate.test.js`.

**Leaving.**

```js
function frNext()   { if (frStep < FR_TOTAL) { if (frStep === 2) commitFirstRun();
                                               frStep++; paintFr(); } else finishFr(); }
function frBack()   { if (frStep === FR_TOTAL) return finishFr();
                      if (frStep > 1) { frStep--; paintFr(); } else requestCloseFr(); }
function askBeforeDiscardTeam() {
  if (!fr || frStep === FR_TOTAL) return false;             // nothing left to lose
  if (!fr.teamName.trim() && !fr.roster.trim()) return false;
  showFrAsk(true);
  return true;
}
function closeFr()  { fr = null; showFrAsk(false); parkShareRow(); closeSheet($('#firstRunFlow')); }
function finishFr() { const first = !state.tourSeen; closeFr();
                      if (first) setTimeout(startTour, 520); }
```

`parkShareRow()` puts `#frShareRow` back inside the dialog and re-hides it, so
the next open finds it where the markup left it.

Wiring mirrors `wireAddGameFlow` exactly: `#frClose` → `requestCloseFr`,
`#frBack` → `frBack`, `#frNext` → `frNext`, `#frKeep` → hide the ask and refocus
`#frNext`, `#frDiscard` → `closeFr`, `oncancel` → `preventDefault()` then
`frBack()`, `onclose` → drop an untouched draft, and `guardClose(d,
askBeforeDiscardTeam)`.

### The card seam (`app/card.js`)

```js
export function cardPreviewInto(host) {
  if (!host) return;
  host.textContent = '';
  const p = plans[state.activeGame];
  if (!p || !p.ok) {
    const fix = blockedFix(p?.issues);
    host.append(stageEmpty(BLOCKED_TITLE,
      fix ? fix.message : 'Add your players and the card shows up here.'));
    return;
  }
  for (const c of document.querySelectorAll('#sheet .card:not(.card-copy)'))
    host.append(c.cloneNode(true));
  fitPreview();
}
export function refreshCardSheetPreview() { cardPreviewInto($('#sheetCardPreview')); }

export function fitPreview() {
  for (const s of document.querySelectorAll('.stage')) fitStage(s);
}
```

### Print and share (`app/app.js`)

```js
function shareCardImage() {
  const cards = [...document.querySelectorAll('#sheet .card:not(.card-copy)')];
  …                                        // body moves across unchanged
}
on('#print', 'onclick', printCard);
on('#shareCard', 'onclick', shareCardImage);
on('#frPrint', 'onclick', printCard);
on('#frShare', 'onclick', shareCardImage);
```

Four triggers, four carriers — which is what `test/print-gate.test.js`'s last
test compares. The function must be top-level, zero-argument, and closed by a
`}` in column 0, or the walker will not resolve it.

### CSS

- Delete `.wel-setup`, `.wel-backrow`, `.wel-back`, `.wel-h2`, `.wel-card`,
  `.wel-fill`, and the `.wel-landing[hidden], .wel-setup[hidden]` rule.
- `.wel-type` → `.wel-start`. The `@media (max-width: 19em)` comment that says
  "One class covers all three full-width buttons" becomes two.
- `#agClose` → `.flow-bar-row .bsheet-close` and `#agAsk` → `.flow-ask`, so the
  two flows share them.
- New: `.fr-f` (the "How often do you sub?" label, `padding: 0 1rem`),
  `.fr-gran` (the row list, `margin: 0 1rem`), `.fr-stage`
  (`padding: 0 1rem; display: flex; justify-content: center`), `.fr-cta`
  (`margin: 1rem 1rem 0`), `dialog.flow .pgrp { margin: 0 1rem }`.
- New wide cap (decision 14):

```css
@media (min-width: 840px) {
  .flow-bar-row, .flow-prog, .flow-body > *, .flow-foot {
    max-width: 34rem; margin-inline: auto; width: 100%;
  }
}
```

## Proof

Numbered `/tdd` seams. Each names where it runs from and which **What would
settle it** items it covers. Every one is run red first, against the unchanged
tree, and the actual failure text is reported.

1. **`test/first-run.test.js` — the count line.** `node --test`. Import the
   copy rule and assert `countLine(0)`, `countLine(1)`, `countLine(3)`,
   `countLine(5)`, `countLine(12)` against the exact strings, and that Next's
   disabled rule is `n < 5`. Covers item 2. Pure function, no DOM.

2. **`test/first-run.test.js` — the draft defaults and the commit.**
   `node --test`. `newDraft()` gives `periods: 4`, `periodMinutes: 8`,
   `granMode: 'everyN'`, `granValue: 4`; a draft committed through `startTeam`
   writes exactly those onto `state.day.games[0]` and leaves `targetSlots` and
   `targetCapacity` cleared. Covers item 3 and the second half of item 6.

3. **`test/first-run.test.js` — the shell markup.** `node --test`, a guard under
   `/new-guard` (it reads `index.html`). `#firstRunFlow` is a `<dialog>` with
   `class="flow"`, ships without `open`, sits at the same depth as
   `#addGameFlow` and outside every `.view`; `#frClose` is the first child of
   `.flow-bar-row`; `#frPrint` and `#frShare` carry `data-needs-card`; `#welGo`
   and `#welSetup` are gone; `#welStart` is `.btn.primary` and precedes `#welTry`
   in `.wel-doors`. Covers items 1, 4 and 8. Named here because these are facts
   about bytes, not behavior — nothing runs them.

4. **`test/first-paint.test.js` — the first frame.** `node --test`. An empty
   store stamps `welcome` (existing `CASES` row), plus a new case asserting
   `#firstRunFlow` has no `open` attribute so the first frame cannot be the
   flow. Covers item 8.

5. **`test/print-gate.test.js` — unchanged, run as a seam.** `node --test`. It
   must discover four triggers and find four carriers with no edit to the test
   itself. Covers item 4's gate clause. If it needs editing, the design is
   wrong.

6. **`test/sample-team.test.js` — the sample rule, rewritten around the flow.**
   `node --test`. `#welTry` opens the flow and fills the draft; `fillSample`
   still calls none of `startTeam` / `setView` / `flash` / `track` /
   `markFirstRunPending`; the fill is offered inside step 1; the `?try=` path
   still goes through `loadSample`; `soon()` still reads
   `takeFirstRunPending()`. Covers item 5 and the analytics half of item 6.

7. **`scripts/smoke/first-run-flow.mjs` — the flow in a browser.** New smoke
   row `firstrun`, run at 390×844 from a wiped profile via `landWiped`, and
   reloading the rich profile before it returns (the same courtesy
   `teamscreen` and `addgameflow` pay). Checks:
   `landingReads` (item 1), `stepOneCounts` (item 2 — types three lines, reads
   `#frCount` and `#frNext.disabled`, types two more, reads both again),
   `stepTwoDefaults` (item 3), `stepThreeShowsACard` (item 4 — counts `.card` in
   `#frStage`, reads `#frNext`'s label, checks neither share control is
   `.primary`), `sampleFillsAndSavesNothing` (item 5 — reads `localStorage`
   after the fill), `backAndCancel` (item 6 — `realTap` on `#frBack`, then an
   Escape `key` press, then the ask row), `discardSavesNothing` (item 6),
   `finishStartsTheTour` (item 7 — reads `#tourStep`), `landsOnTheGame`
   (item 4). Assertion style is `add-game-flow.mjs`'s local `ck` collector, not
   `assert`. Its own file, so `plan-sheet.mjs`'s 37.3 KB is not touched and this
   one starts well under 40,000 bytes.

8. **`scripts/smoke/app-large-text.mjs` — 320px at a 32px root.** Existing row.
   `firstRun()`'s door check becomes `['#welStart', '#welTry']`; the
   "welcome screen, sample filled" state is replaced by three states,
   `'first run, step 1 with the sample'`, `'first run, step 2'` and
   `'first run, step 3'`, each opened by driving the real controls and closed by
   discarding. `APP_LARGE_TEXT_ALLOW` stays empty and every one is pinned at
   zero. Covers items 1-4 and 9 in the large-text cell.

9. **`scripts/smoke/overlay.mjs` and `scripts/smoke/touch.mjs`.** Existing rows.
   `overlay` gains the three first-run steps for the a11y sweep (names,
   contrast, focus order), `touch` gains them for the 44px floor at 320/360/390.
   Covers item 9's "mobile first" half.

10. **`/browser-verify` + `node scripts/compare-shots.mjs --issue 36`.** The
    look check. `SHOTS` gains `first-run-1`, `first-run-2` and `first-run-3` in
    both themes, a `first-run-long-names` (a roster of full real names, scrolled
    to the bottom), the 320px/32px cell, and the 840px and 1280px wide layouts.
    "Scrolled to the bottom" here means `#frRoster`'s own `scrollTop`, not
    `.flow-body`'s: the flow body is the dialog's flex container and three form
    fields never overflow it, so scrolling it would prove nothing. The capture
    asserts a non-zero scroll and fails loudly if it gets one that is zero.
    The existing `first-run` pair stays and now captures the landing. Compared
    against `notes/mockups/prototype/light|dark-add-game-1..3.png`,
    `sheet-format`, `sheet-interval` and `sheet-card`. Any clipping blocks the
    merge. Covers items 1-4 as a reader sees them.

11. **The proof pair.** `npm test` then `npm run smoke -- --no-tests`, once per
    commit, by the orchestrator. Covers item 9.

## Out of scope

- **Fixing the NUL bytes in `app/render.js`.** Filed as #95.
- **Touching `?try=N`.** Decision 15 — it already does what criterion 5 asks.
- **A fifth tour step, or re-anchoring the four.** Survey 20.
- **Renaming `#addGameFlow`'s ids or sharing its markup.** Decision 2.
- **A card renderer that takes a plan.** Decision 4 and survey 7.
- **Seeding a fake roster on first open.** `newTeam`'s comment
  (`app/state.js:173`) settled that: an app that opens pre-filled with strangers
  reads like a demo.
- **Moving the landing screen's demo stage, tabs or Shuffle.** Criterion 1 keeps
  the real sample rotation; nothing else about the hero changes.
- **A tab bar.** N1, and the prototype README concedes it.
