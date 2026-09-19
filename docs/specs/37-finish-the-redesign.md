# 37 — Finish the redesign: 48px targets everywhere, old interface removed

## Issue

[#37](https://github.com/kylehoehns/benchcard/issues/37) — raise the smoke
suite's touch-target floor from 44px to 48px, and delete what is left of the
old interface.

Parent: [#18](https://github.com/kylehoehns/benchcard/issues/18). Every blocker
(#30–#36) is merged; this is the last child.

## Goal

A coach taps this standing up, one-handed, in a gym. Every control they can hit
is at least 48px, on every screen, at every phone width the app supports — and
the harness says so rather than a person remembering to check. Nothing is left
in the stylesheet for parts of the interface a coach can no longer see.

Guideline **I1** ("Touch targets are 48px") is the rule. `docs/interface-guidelines.md`
owns it and already states 48px; everything else in the repo has to agree.

## What would settle it

The issue's six acceptance criteria, with the values this spec pins.

1. **The touch-target check requires 48px.** `scripts/smoke-checks.js`'s
   generic sweep measures against 48px (with the repo's existing 0.5px
   `getBoundingClientRect` tolerance, so 47.5) instead of 44px/43.5, and it
   passes at 320, 360 and 390px for all 17 `TOUCH_STATES` in
   `scripts/smoke/touch.mjs` plus the `FOUR` Today state — 51 measurements in
   all. Measured on `cf223ab`, 24 of those 51 measurements fail at 48px today;
   every one of them is a control at exactly 44px or 44.53px:

   | Where | Controls under 48px today |
   | --- | --- |
   | games (all widths) | `#removeGame` 140.55×44 |
   | team (all widths) | `#teamEdit` 53.91×44 |
   | settings (all widths) | `#teamName` ×44.53, `#setPeriods`/`#setPerMins`/`#minMins` 68×44.53, `#teamColorBtn` 112.31×44, `#removeTeam` 137.39×44, `#helpBtn` 63.67×44, `#helpTourSettings` 180.28×44, `#exportBackup` ×44, `#importBackup` ×44, `.linkish` 118.55×44 |
   | settings, color picker open | the eleven above plus `#colorPickerClose` 44×44 |
   | add a game, step 1 | two `input` ×44.53, `.btn.primary` ×44 |
   | first run, step 1 | `#frTeam` ×44.53 |
   | first run, step 3 | `#frPrint` 81.34×44, `#frShare` 132.86×44 |

   After the change all 51 measurements pass and the check's own name and
   detail read `48px`.

2. **The roster row at 360px.** `scripts/smoke/team-screen.mjs`'s roster-row
   check runs at 320, 360 and 390px (`TOUCH_WIDTHS`, not a fourth copy of the
   list). At each width, for each of the 11 rows, the row is ≥ 47.5px tall
   **and the player's name is not clipped**: `.prow-t`'s `scrollWidth` is no
   more than its `clientWidth + 0.5`, and its painted right edge is inside the
   row's own content box.

   Run against two rosters: the `RICH` fixture (longest name "Marcus
   Williams" / "Casey Lindqvist", 15 characters) and the app's own **sample
   team** (`sampleRoster()` in `app/roster.js`, 10 of the 12 names in
   `SAMPLE_LINES`, longest "Harper Pratt", 12 characters). The sample is the
   roster the ticket names, and `RICH` is the harder case; both are measured
   rather than one being argued from the other.

3. **Nothing left of the old interface.** `app.css` carries no rule for a
   class nothing puts on an element. Measured on `cf223ab`, six such classes
   remain, and every one belongs to a screen part an earlier ticket removed:

   - `.budget-acts` (2 rules) — the old minutes-budget action row.
   - `.ruleedit`, `.ruleedit.stack`, `.ruleedit select`, `.ruleedit .mini`,
     `.ruleedit .note` (5 rules) and `.rule-switches` (1 rule) — the old Rules
     fold's inline editor, replaced by the Plan sheet in #28.
   - `.fold > summary` and its seven siblings — the fold chrome itself,
     replaced by sheets in #27/#28.
   - `details.dz > summary .count.zero` — the zero-count pill on a fold's
     summary; `.dz` itself is live (`#tabledetails`, "Stint by stint") but
     `.zero` is never emitted.

   These are deleted, and a guard is added so the seventh cannot appear:
   `test/dead-class.test.js` gains the reverse sweep for the shell — every
   class `app.css`/`tokens.css`/`card.css` defines in selector position must be
   emitted by `index.html` or an `app/*.js` module or another `app/*.html`
   page. Its allow list starts empty. `dead-class`, `dead-id`, `dead-var` and
   `dead-export` all pass with no new entry in `HOOKS`, `KEEP`, `KEEP_UNREAD`
   or any other allowance.

4. **Budgets, by name, only downward.** Measured on `cf223ab`:

   | Metric | Measured | Recorded | Verdict |
   | --- | --- | --- | --- |
   | bytes | 1200.6 KB | 1188.4 KB (`BYTES_BASELINE`) | **up** — not touched |
   | requests | 40 | 39 (hand pin) | never re-recorded |
   | nodes | 1367 | 1519 | **down** — re-pinned |

   `nodes` is re-pinned by hand to the value this branch measures. It cannot be
   re-pinned in `scripts/budgets.json` (`guard-edit.sh` denies hand edits to
   that file, and `--update-budgets` is denied by the tool), so it moves to
   `scripts/budgets.mjs` as `NODES_BASELINE` beside `BYTES_BASELINE`, read
   through the same `pinned()` helper, with the same style of comment saying
   what was measured and how. `requests` stays in `budgets.json` untouched, so
   its hand pin survives. `bytes` is left exactly as it is — it measures above
   its baseline and still passes under the ceiling.

5. **One statement of the floor.** `docs/interface-guidelines.md` I1 owns the
   number and already says 48px. Every other statement of it in the harness
   docs says 48px too, or stops stating it:

   - `AGENTS.md` § Layout: "every touch target ≥44px across 320–390px" →
     ≥48px; "the last control in an open dialog on screen and still 44px" →
     48px.
   - `docs/architecture.md` line 731: "Touch minimums (44px) are gated
     `@media (pointer: coarse)`…" → 48px.
   - `docs/architecture.md` lines 369, 371, 834, 1051, 1057 are the narrative
     of past bugs at the time they happened, not a statement of today's floor.
     They stay as they are. So do every `docs/specs/*.md` entry: a spec is the
     record of what was asked for at that commit.

6. **Green.** `npm test` and `npm run smoke` both pass, and no test written
   against markup this ticket deletes is left behind.

## Surfaces

**Changes**

- `scripts/smoke-checks.js` — one `TOUCH_FLOOR` constant (48) and one
  `TOUCH_TOL` (0.5) replacing the three separate literals (`43.5` twice in the
  generic sweep, `43.5` in the dialog check, `47.99`/`47.5` in `minSizeCheck`).
  The check's name and detail strings read the constant, not a hard-coded "44".
- `scripts/smoke/touch.mjs`, `scripts/smoke/static.mjs`,
  `scripts/smoke/registry.mjs`, `scripts/smoke.mjs` (line 321 filter),
  `test/smoke-only.test.js` — the check name moves from
  `touch targets ≥ 44px` to `touch targets ≥ 48px`. One name, changed
  everywhere it is spelled out.
- `app/app.css` — raise the control primitives that sit at 44px to 48px, and
  delete the six dead class families in criterion 3. Every `44px` in this file
  is reviewed; the ones that are a **touch floor** rise, the ones that are a
  measured layout number (`.toast .tx` width, `.gm-dot` height inside a row,
  `min(48, pitch)` timeline rows) are judged on their own and left alone if
  raising them would break a layout the harness pins.
- `app/index.html` — only if a control needs markup to reach 48px. Prefer CSS.
- `app/about.html`, `app/advanced.html`, `scripts/charts.mjs` — the same floor.
  `static.mjs`'s own comment records the decision already made here: when these
  pages failed the touch check, "that was a real defect on the pages, not a
  rule that did not apply to them", and the pages were fixed. So one floor, not
  two. The six chart pages are regenerated with `npm run charts`; they are
  never hand-edited (`guard-edit.sh` denies it).
- `app/sw.js` — `VERSION` bumped and `SHELL` set to the digest `npm test`
  names, in the same edit as the last `app/` change.
- `scripts/smoke/team-screen.mjs` + `scripts/smoke/fixtures.mjs` — criterion 2.
  Watch `test/smoke-size.test.js`: `team-screen.mjs` is 33,470 bytes today and
  no file under `scripts/smoke/` may reach 40,000. If it would, split along a
  real seam.
- `test/dead-class.test.js` — the reverse sweep and its falsifier.
- `scripts/budgets.mjs` — `NODES_BASELINE`.
- `scripts/compare-shots.mjs` — extend `SHOTS` with the 360px cells this
  ticket's look check needs. Extend the existing list; do not write a second
  capture script.
- `AGENTS.md`, `docs/architecture.md` — criterion 5.
- `notes/mockups/prototype/compare/37/` — the committed compare shots.

**Must not change**

- `app/engine.js`, `app/budget.js`, `app/storage.js`, `app/roster.js` — pure
  and heavily tested; nothing here is about them.
- `app/card.css` and anything that changes the printed card. It stays
  3.45 × 5in. The 48px floor is a screen rule: `.card` is already exempt from
  the sweep (`el.closest('.card')`).
- `scripts/budgets.json` — hand edits denied, and the `requests: 39` pin is the
  reason.
- `app/vendor/**`.
- `docs/specs/*.md` other than this one.

## Constraints

- **The service worker.** Any edit under `app/` means bumping `VERSION` in
  `app/sw.js` and setting `SHELL` to the digest in the same edit. Never trust a
  digest quoted anywhere, including in a commit message or a prior session's
  note: re-derive it from your own tree with
  `npm test 2>&1 | grep -A 25 "SHELL matches the bytes"` — the AssertionError
  names the expected value.
- **`app/render.js` holds two raw NUL bytes** (offsets 27365, 27409). Plain
  `grep` silently skips the whole file and returns nothing, which on a ticket
  about proving things are unused is indistinguishable from a real absence. Any
  search whose answer matters is done with node's `readFileSync`, not `grep`.
  This is filed as #95 and is not fixed here.
- **The budget harness.** `node scripts/smoke.mjs --update-budgets` is denied
  by the tool. Re-pin by hand, per criterion 4. A byte overrun is widened by
  `bytesAbs` and moved past; it is never a reason to stop.
- **Smoke module size.** No file under `scripts/smoke/` may pass 40,000 bytes
  (`test/smoke-size.test.js`). `plan-sheet.mjs` is already at ~37.3 KB.
- **Staging.** A hook denies `git add -A` / `git add .`. Stage explicit paths.
- **No commit trailers.**
- **American spelling** (`test/spelling.test.js` scans every tracked file).
- **The privacy claim stays narrow** — `test/analytics.test.js` bans four
  absolute phrasings across every `app/` HTML file and every string literal in
  every `app/*.js`.
- **Do not delete something that only looks orphaned because it is new.** #36
  landed `#firstRunFlow` and `paintFlowShell` / `flowStepBody` / `flowField` in
  `app/trap.js`; #35 landed the wide layout. Both are new markup the dead-class,
  dead-id, dead-var and dead-export tests now cover.
- **`#actionbar` is live, not legacy.** #33 built the floating controls on its
  shell and #34 built `#resumeBar` as its sibling; `test/actionbar-split.test.js`
  and `test/wide-layout.test.js` pin its breakpoints. The issue's list of old
  interface parts names an "action bar" that no longer exists in that form.
- **Reuse, do not re-derive:** `TOUCH_WIDTHS` in `scripts/smoke/registry.mjs`
  is the width list; `widthSweep` in `scripts/smoke/width-sweep.mjs` is the
  sweep; `minSizeCheck` in `scripts/smoke-checks.js` is the in-page row
  measurement; `hitBox` is how an extended hit area is read; `PLAYERS` /
  `tierOf` in `fixtures.mjs` and `levelName` in `app/balance.js` are where the
  roster's expected values come from; `sampleRoster` in `app/roster.js` is the
  only cast for the sample team — never a second one.

## Design

**One floor, one constant.** `scripts/smoke-checks.js` is read as text and
evaluated in the page, so the floor is a `const` at the top of that IIFE rather
than an import. Every measurement in the file — the generic sweep, the dialog
check, and `minSizeCheck`'s three row sweeps — reads it. Today the file spells
the same idea three ways (`43.5`, `43.5`, `47.99`); after this there is one
number and one tolerance, and raising the floor is a one-line change.

**The app reaches 48px in CSS, not markup.** Everything in criterion 1's table
is a control primitive at 44px: `.btn`'s coarse-pointer floor, the text-input
primitive, `.linkish`, `.btn.icon`. Raising those rules lifts every failing
control at once. Controls are not padded individually.

**The marketing pages get the same floor.** `.mark`, `.btn`, `footer a`,
`.more a` and the in-page section links in `about.html` and `advanced.html`, and
the same rules in `charts.mjs`'s template, go from `min-height: 44px` to `48px`.
The chart pages are regenerated rather than edited.

**Dead rules go, and a guard keeps them gone.** `test/dead-class.test.js`
already sweeps the standalone pages in both directions and the shell in only
one. This adds the shell's missing direction, with the same shape: selector
classes defined by the sheets `index.html` links, minus every class any
`app/*.js` or `app/*.html` file can put on an element. It is falsified the way
the file's existing guards are — a rule for a class nothing emits, injected into
the sheet under test, must be reported.

**`nodes` follows `bytes` out of `budgets.json`.** Same reason, same shape,
same kind of comment: the file cannot be hand-edited and the blanket re-record
would erase the `requests` pin, so the pin lives where a ceiling is allowed to
live.

## Proof

Seams, in build order. Each is a real failing test before the code exists.

1. **The floor constant** — `node scripts/smoke.mjs --only "touch targets ≥ 48px, 320–390px"`.
   Red first: the check under the new name does not exist / the sweep fails on
   the 24 measurements in criterion 1's table. Green when `app.css`'s
   primitives are 48px. Covers criterion 1.
2. **The dialog check and the row sweeps read the same constant** —
   `node scripts/smoke.mjs --only "last control in an open dialog is reachable"`
   and the four `≥ 48px` row rows. Covers criterion 1's "and passes".
3. **The static pages** — `node scripts/smoke.mjs --only "static pages: 2 guides + 6 charts"`.
   Red on all 8 pages at 48px before `about.html` / `advanced.html` /
   `charts.mjs` move. Covers criterion 1 for the pages the same check measures.
4. **The roster row at 360px** —
   `node scripts/smoke.mjs --only "team screen: roster rows, the player sheet, add and paste"`.
   Red first by narrowing to 360 before the check sweeps widths, or by making a
   name clip. Covers criterion 2.
5. **The reverse dead-class sweep** — `node --test test/dead-class.test.js`.
   Red listing the six dead class families; green when they are deleted. Its
   own falsifier test proves it can see an injected orphan. This is a guard
   under `/new-guard`, named here as a seam. Covers criterion 3.
6. **Budgets** — `node --test test/budgets.test.js test/budget-actuals.test.js`
   and the three budget rows in `npm run smoke`. Covers criterion 4.
7. **Docs** — `node --test test/one-answer.test.js` plus a read of the three
   lines in criterion 5. Covers criterion 5.
8. **The whole suite** — `npm test` then `npm run smoke -- --no-tests`, once,
   by whoever commits. Covers criterion 6.
9. **The look check** — `node scripts/compare-shots.mjs --issue 37`, at 320
   (32px root), 360, 390, 840 and 1280, in both themes, including long real
   names, scrolled to the bottom, full height, and the empty / first-run state.
   Anything clipped blocks the merge. Shots are committed.

## Out of scope

- **Fixing the NUL bytes in `app/render.js`** — that is #95.
- **Re-recording `bytes` or `requests`.** Neither went down.
- **`#actionbar`.** It is the current floating-control shell, not the old
  action bar.
- **The printed card.** Unchanged, in size and in content.
- **Any `44px` in `app.css` that is a measured layout number rather than a
  touch floor.** Each is judged, and left alone where raising it would break a
  layout a check already pins.
- **`docs/specs/*.md` and the narrative paragraphs in `docs/architecture.md`.**
  They record what was true when they were written.
