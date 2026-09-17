# 29 — Timeline or Card, and the card sheet

## Issue

#29 (parent #18; blocker #27 merged as PR #67; built on #69, #72, #73). The
game screen switches between the timeline and a card preview, shows one
summary line instead of five stat tiles, and gathers printing, sharing and card
options into one card sheet opened from a share button. A blocked plan says
what is wrong and has one button that goes to the fix.

## Goal

A coach on the game screen taps **Card** and sees exactly what will print,
scaled to the phone. Under the rotation, one line says "16–20 min each · 21
changes", with Shuffle beside it. The share button top right opens **The
card**, where they print, share an image, and pick what to print, how many
copies, the size, names and the minutes strip. When a plan cannot be built, the
screen says so, says why, and has one button that opens the sheet that fixes
it. The printed card and the shared image do not change at all.

## Survey (2026-09-17, on `4348a8c`)

Nothing in the ticket is false. The facts the build rests on:

- **The five stat tiles** are `#stats.statrow` in `.s-rot`, painted by
  `renderStats` (`app/plan-view.js`), render key `stats` (`app/render.js`,
  also named in `AFTER_EDIT`, `PLAN_ONLY` and `app/gamemode.js`). The
  "Subs" tile counts `stints.slice(1).reduce((a, r) => a + r.in.length, 0)`
  over `effectiveStints(g, p)`; the prototype's "21 changes" is the same count.
  Minutes come from `effectiveMinutes(g, p)`; `fmtMinutes` is in `engine.js`.
- **Shuffle** is `#regen`, in `.s-rot .block-hd` beside an `h3` "Rotation".
  The `s` shortcut clicks it; `renderCards` disables it while blocked.
- **The card fold** is `button#cardToggle.s-cardhd.cardtoggle` in
  `aside.col-side`, with `renderCardFold` (`card.js`), the `#cardToggle`
  handler (`app.js`), `state.ui.cardOpen` (`state.js`, sanitized in
  `storage.js`), and `#view-games.card-shut …` rules in `app.css`.
- **The card options panel** is `.s-cardopts` in the aside: `#printScope`,
  `#copies`, `#cardId` (Names: short names / jersey numbers), `#cardSize`,
  `#showMinutes`, and the note "Cut on the dashed line. Underlined = just came
  in." Handlers are in `app.js`; `renderSetup` (`game-setup.js`) syncs their
  values.
- **Print and Share** are `#print` and `#shareCard` in `.gm-cta` in the aside,
  both `data-needs-card`, beside `.gmq` (`#gmOpen` + a `?`). `.gm-cta`'s bench
  and print half is hidden below 900px (`test/actionbar-split.test.js`).
- **The bottom action bar** is `#actionbar`: `#abBench` (Start game), a `?`,
  and `#abCard` (a printer, `data-needs-card`, wired to `printCard`). It exists
  below 900px only.
- **The printed card** is `#sheet.stage.print-path` in `aside.col-side.print-path`.
  Print CSS (`card.css`) shows only `.print-path` ancestors and hides
  `.noprint`. `renderCards` fills `#sheet` (copies beyond the first get
  `.card-copy`, hidden on screen, printed), fills `#cardnote`, runs the
  `[data-needs-card]` disable sweep and disables `#gmOpen`/`#abBench`.
  `fitPreview` sets `--cardzoom` from `sheet.clientWidth - 32`, a hard-coded
  padding that is wrong at a 32px root (open issue #56).
- **Share image** (`share.js`) clones `#sheet .card:not(.card-copy)` into an
  offscreen host under `<body>`, so it works while `#sheet` is not displayed.
- **The blocked state** is `timelineEmpty` (`timeline.js`): "No rotation yet.
  Resolve the errors below." plus "Fix the rules" for `RULE_ERRORS`, or the
  Platoon "Fill a unit" message; the no-roster case is `rosterCta`. Engine
  error codes (`engine.js`): `NOT_ENOUGH_PLAYERS`; rules: `MIN_EXCEEDS_GAME`,
  `MIN_ABOVE_CAP`, `MINS_UNSATISFIABLE`, `CAPS_UNSATISFIABLE`,
  `PAIR_AVOID_CONFLICT`, `KEEPON_UNSATISFIABLE`, `FORCED_GROUP_TOO_BIG`,
  `FORCED_GROUP_AVOID`, `FORCED_OVER_CAP`, `FORCED_GROUP_KEEPON`,
  `AVOID_IMPOSSIBLE`; closers: `CLOSERS_TOO_MANY`, `CLOSERS_AVOID`; platoon:
  `UNITS_MISSING`, `UNIT_WRONG_SIZE`.
- **Sheets** open with `openSheet(dialog, trigger, { full })` (`trap.js`).
  Who's here opens from `#phrasePlayers` (`paintWhoBody(); openSheet(...)`,
  `game-setup.js`); the Plan sheet opens with `openPlanSheet(section, trigger)`
  where `section` is `'strategy'` or `'rules'`.
- **Stint by stint** is `details#tabledetails.dz` in `.col-main`.
- **The header** off Today is `.bar-back`: `#backBtn` and `#barTitle` (hidden on
  the game screen).
- **Tests that read replaced markup:** `actionbar-split`, `this-game`
  (`.card-shut`, `.s-cardopts`), `big-text` (`.statrow`, `.gm-cta .btn`),
  `issues-after-timeline` (`#timeline`'s next sibling is `#issues`; its
  fixture names `#stats`), `print-scope` (`#print` and `#shareCard` in a
  `.gm-cta` inside `#view-games`), `print-gate`, `storage`/`backup` fixtures
  (`cardOpen`), smoke `fixtures.mjs` (`cardOpen: true`), `today-game-rows.mjs`
  and `smoke-checks.js` (`#abCard`).
- **`test/card-prints.test.js`** pins `scripts/card-prints.mjs`, which reads the
  `card_printed` event's `size` field. `printCard` must keep sending it.

## The look to match

`notes/mockups/prototype/` (read its README): `light-game-timeline.png` /
`dark-game-timeline.png` for the summary line and the Timeline | Card control,
`light-game-card.png` / `dark-game-card.png` for Card, and
`light-sheet-card.png` / `dark-sheet-card.png` for the sheet. The README's
"docs win" list applies: no tab bar, 48px hit areas (the prototype's 32px
segment, 36px share button and 36px Shuffle keep their look but get 48px hit
areas), a round icon share button, ✕ instead of "Done", 28px sheet corners,
rem type from `app/tokens.css`, and tint on the three K1 things only. Use the
tokens; do not paste prototype CSS.

## Decisions made in this spec without asking

1. **The choice is `state.ui.gameView`**, `'timeline'` (default) or `'card'`,
   sanitized in `storage.js` the way `printScope` is. `cardOpen` is removed
   from `state.js` and from sanitizing; an old save that still has it loads
   and simply drops it.
2. **There is still one print source: `#sheet`.** The Card view shows `#sheet`
   itself on the game screen, scaled to the width. The card sheet's preview is
   a clone of `#sheet`'s non-copy cards, refreshed whenever `renderCards` runs
   while the sheet is open and when it opens. Print keeps printing `#sheet`
   through the `.print-path` chain, whichever view is showing and whether or
   not the sheet is open.
3. **The card sheet** is `dialog#sheetCard.bsheet.grouped.noprint`, inside
   `#view-games` like the other sheets, titled "The card", with ✕ top right
   (its options apply as you tap, like the live sheets; Print is its named
   confirm, in the body). It opens at full height. Body, top to bottom:
   - the preview;
   - `#cardnote` (the "needs 2 cards" note), when it has text;
   - a `div.gm-cta` row with two equal buttons: `#print` (visible "Print",
     filled, `aria-label="Print the card"`) and `#shareCard` (visible "Share
     image"), both `data-needs-card`;
   - one grouped list of rows, each at least 48px, using the existing controls
     and ids: **Print** `#printScope` (This game / Every game today),
     **Copies** `#copies` (1 / 2 / 4), **Size** `#cardSize` (Pocket · 3.45 × 5
     in / Half sheet · 8 × 5.1 in), **Names** `#cardId` (Short names / Jersey
     numbers) and **Minutes strip** `#showMinutes` (a switch). The selects are
     native, styled as a row with the value and a chevron on the right, so a
     tap opens the phone's own picker;
   - the footnote "Cut on the dashed line. Underlined = just came in."
   Names is not in the ticket's list; it is kept because #18 keeps every
   feature, and it is a card option.
4. **The share button** is `button#shareBtn` in `.bar-back`, right side, a
   round icon button (`data-icon="share"`), `aria-label="Share the card"`, at
   least 48 × 48, shown only on the game screen. It opens `#sheetCard` even
   while blocked (the sheet then shows why and its Print and Share image are
   disabled). It carries no `data-needs-card` and no printer icon, so
   `test/print-scope.test.js` stays green unchanged.
5. **The Timeline | Card control** is `div#viewSeg.seg` (the existing `.seg`
   pattern, `aria-pressed` buttons), two equal text buttons, under the
   sentence, left-aligned at the prototype's width (about 170px, growing with
   text), 48px hit area. Switching saves `gameView`, shows one of `#timeline`
   / `#sheet` and hides the other, and re-fits the preview.
6. **The summary line** is `#summary` in `.s-rot` after `#issues`: the text
   `{lo}–{hi} min each · {n} changes` (en dash; `{hi} min each` when every
   player has the same; `1 change` singular), minutes through `fmtMinutes`,
   `n` = the Subs count above, both read off `effectiveMinutes` /
   `effectiveStints`. `#regen` (Shuffle, with its icon) sits at the right end
   of the same line. The "Rotation" `h3` header row goes. The line is not
   shown when there is no roster or the plan is blocked. It shows under both
   views. The stat tiles, `renderStats`, `.statrow` and their count-up
   animation go; the render key may be renamed as long as every caller
   follows.
7. **The blocked state** replaces `timelineEmpty`'s non-roster branch:
   a heading "This plan can't be built", the first error's `message` as the
   reason, and one button:
   - `NOT_ENOUGH_PLAYERS` → **Change who's here**, opens Who's here the way
     `#phrasePlayers` does;
   - `UNITS_MISSING`, `UNIT_WRONG_SIZE` → **Fill a unit**,
     `openPlanSheet('strategy', button)`;
   - `CLOSERS_TOO_MANY`, `CLOSERS_AVOID` → **Change the rules**,
     `openPlanSheet('strategy', button)` (the closing group is edited in the
     Plan sheet's strategy group);
   - every other error → **Change the rules**, `openPlanSheet('rules', button)`.
   The mapping is one exported pure function. While blocked, the game screen
   shows this panel in the rotation's place whichever view is chosen (the
   chosen view is kept for later), `#issues` leaves out the error the panel
   already shows, and Start game (`#abBench`, `#gmOpen`), `#print` and
   `#shareCard` are disabled by the existing sweep. The no-roster panel
   (`rosterCta`) is unchanged. In the card sheet, the preview area shows the
   same heading and reason (no fix button there: the sheet is one level and
   the fix is another sheet, C5).
8. **Removed:** `#cardToggle` and every `.s-cardhd`/`.cardtoggle`/`.card-shut`
   rule, `renderCardFold`, the `.s-cardopts` box (its controls move into the
   sheet), `#abCard` and its handler, the `#stats` tiles. `#gmOpen` and its
   `?` stay as the above-900px Start game, in a wrapper that is **not**
   `.gm-cta` (for example `.gm-start`), still in the aside. The action bar
   keeps `#abBench` and its `?` (every `?` is #33's to remove).
9. **Stint by stint** stays `details#tabledetails`, restyled as a grouped row
   at least 48px tall with a chevron, below the summary line; its table opens
   under it.
10. **`fitPreview` reads the stage's computed horizontal padding** instead of
    32, and fits both `#sheet` and the sheet preview to their own width. This
    is what keeps the preview from overflowing sideways at 320px / 32px root
    (the same cause as #56). Stage styling on the game screen and in the sheet
    follows the prototype (the card on the background with its paper shadow,
    no bordered box); nothing under `@media print` changes.
11. **Bottom clearance.** At 390×844 and at 320px / 32px root, scrolled to the
    bottom, the last control on the game screen (Stint by stint and whatever
    follows it) ends above the top of `#actionbar`, and the card sheet's last
    control ends above its status line / the bottom edge.
12. **Unchanged:** Across the day (`#dayFold`, moves in #30), the This game box,
    the print CSS, `buildCard`/fitting, `share.js`, the `p` shortcut and
    `printCard` (including its `track('card_printed', { size })` and its
    `setView('games', true)`).

## What would settle it

1. At 390×844, the game screen shows Timeline | Card under the sentence;
   tapping Card shows the card preview (its right edge inside the viewport,
   nothing pans sideways) and hides the timeline; after a reload Card is still
   chosen; Timeline switches back.
2. Under the rotation one line reads `16–20 min each · 21 changes` shape: with
   the RICH fixture it matches `{lo}–{hi} min each · {n} changes` computed from
   the plan, and `{m} min each` when all minutes are equal; Shuffle (`#regen`)
   is on that line. No `#stats` / `.statrow` exists.
3. A header button named "Share the card", at least 48×48, shows on the game
   screen only and opens a dialog titled "The card" containing a card preview,
   buttons "Print" and "Share image", rows Print (This game / Every game today),
   Copies, Size (pocket / half sheet), Names and Minutes strip, and a ✕ close.
   Changing a row changes the preview.
4. Print and Share image produce what they produce today: with the RICH
   fixture, `Page.printToPDF` on this branch and on `main` gives the same page
   count for pocket/this game, pocket/every game, half/this game, with copies 2;
   `.card:not(.card-copy)` measures 3.45 × 5in under print emulation; the
   `card is 3.45 × 5in` smoke row passes; `test/card-prints.test.js` and
   `test/print-scope.test.js` pass unchanged; the shared PNG's pixel size for
   one pocket card is the same as on `main`.
5. `#cardToggle`, `.s-cardopts`, `#abCard` and `.card-shut` are gone from
   `app/`; pressing P on the game screen, and on Today, opens the print dialog
   (`window.print` is called once).
6. With a blocked plan (RICH fixture, all but four players marked absent) the
   rotation area shows "This plan can't be built", the engine's reason and a
   "Change who's here" button that opens Who's here; a rules conflict shows
   "Change the rules" that opens the Plan sheet; Platoon with no unit shows
   "Fill a unit". While blocked, Start game, Print and Share image are
   disabled.
7. A "Stint by stint" row at least 48px tall sits below the rotation and opens
   the table.
8. At 390×844 and at 320px with a 32px root, the game screen on Card and the
   card sheet have no horizontal overflow, and scrolled to the bottom their
   last control is fully visible above any pinned bar.
9. `npm test` and `npm run smoke` pass; tests written against replaced markup
   are updated or retired in this change.

## Surfaces

Change: `app/index.html`, `app/app.css`, `app/card.css` (screen rules only),
`app/card.js`, `app/app.js`, `app/plan-view.js`, `app/timeline.js`,
`app/render.js`, `app/gamemode.js`, `app/game-setup.js`, `app/state.js`,
`app/storage.js` (the `ui` sanitizer only), `app/sw.js` (VERSION/SHELL),
`scripts/smoke/*` and `scripts/smoke-checks.js` as needed,
`scripts/budgets.mjs` (only to widen a ceiling), and the tests listed in the
survey.

Must not change: the `@media print` block and `.card*` rules in `card.css`,
`buildCard` and the fitting in `card.js`, `share.js`, `engine.js`, `budget.js`,
`roster.js`, `scripts/card-prints.mjs`, `test/print-scope.test.js`,
`test/card-prints.test.js`.

## Constraints

- **The card (P1, AGENTS.md § Rules).** 3.45 × 5in, legible, printed exactly as
  today. `#sheet` stays the one print source, inside `.print-path` ancestors
  all the way up; every new ancestor between `#view-games` and `#sheet` must be
  `.print-path`, and every new sibling must be `.noprint`.
- **Reuse, do not re-derive:** the `[data-needs-card]` sweep in `renderCards`
  (put the attribute on controls; do not disable them by hand); `openSheet` /
  `closeSheet` for the card sheet; `openPlanSheet` and Who's here's own opener
  for the fix buttons; `effectiveStints` / `effectiveMinutes` / `fmtMinutes`
  for the summary; the `.seg` pattern for Timeline | Card; `.bsheet` markup
  exactly as the other sheets have it (handle button, header row, body, status
  line); `printCard` for Print; the existing `#shareCard` handler for Share
  image.
- **Mobile first.** Verify at 390×844 first. 48px hit areas (I1), rows at least
  48px (C6), rem type from the scale (T2, T3).
- **Guideline rules:** C2 (one full-width Start game), C3 (sheet on
  `<dialog>`, handle, close), C4 (✕; the named action is Print), C7 (two
  equal text segments), W4 (the problem says what to do, with the button that
  goes there), P1 (the card).
- **Animation** on transform/opacity only.
- **Precache bump.** Any change to a precached file: bump `VERSION` in
  `app/sw.js` past `main`'s, and set `SHELL` to the digest `npm test` prints.
- **American spelling.** No quotes of any person in code comments or docs.
- **Budgets:** if a byte or DOM ceiling is exceeded, widen it in
  `scripts/budgets.mjs` and say why in the commit. Never re-record `requests`
  and never run a blanket `--update-budgets`.
- **Smoke allow maps:** do not raise `APP_LARGE_TEXT_ALLOW` or
  `LARGE_TEXT_ALLOW`.

## Proof

- **`node --test test/storage.test.js`**: `ui.gameView` round-trips
  `'card'`, defaults to `'timeline'`, rejects anything else; `cardOpen` is no
  longer kept. (Settles 1's "remembered".)
- **`node --test` on a new `test/summary-line.test.js`**: the exported pure
  summary formatter — range, equal minutes, singular change, fractional
  minutes through `fmtMinutes`. (Settles 2.)
- **`node --test` on a new `test/blocked-fix.test.js`**: the exported pure
  error-to-fix mapping for every code listed in decision 7, and first-error
  wins. (Settles 6's mapping.)
- **Updated/retired guards:** `actionbar-split`, `this-game`, `big-text`,
  `issues-after-timeline`, `print-gate` stay meaningful against the new
  markup (edited under `/new-guard`); `print-scope` and `card-prints` pass
  unchanged. (Settles 5 and part of 4.)
- **Smoke, a new check `game screen: Timeline | Card and the card sheet`**
  (its own module under `scripts/smoke/`, RICH fixture): drives the segment,
  reloads, opens the share button, reads the sheet's controls and names,
  changes Size and sees the preview change, checks the blocked panel for the
  three fixes and the disabled gate, checks P calls `window.print` once, and
  checks the Stint by stint row height. (Settles 1, 2, 3, 5, 6, 7.)
- **Smoke, `APP_LARGE_TEXT_STATES`** gains "game screen on Card" and "card
  sheet open", covering both axes at 320px / 32px root with no new allowance.
  The overlay check covers the card sheet's last control. (Settles 8.)
- **`/browser-verify`**: the `printToPDF` comparison against `main` and the
  shared-PNG size comparison (4), side-by-side screenshots against the
  prototype PNGs, long names, scrolled-to-bottom, full height, the blocked
  state, and 320px / 32px root. (Settles 4 and 8 by eye.)

## Out of scope

- Removing the `?` controls, floating/blurred headers and the large-title
  collapse (#33); moving Across the day to Season (#30); wide-screen layout
  (#35); raising the smoke touch floor to 48px everywhere (#37).
- Any change to the printed card, its fitting, or the share image.
- A haptic or animated transition between Timeline and Card beyond what the
  existing `.seg` gives.
