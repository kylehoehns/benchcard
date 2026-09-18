# 34 — A Resume bar for a part-played game

## Issue

#34: when a game is part-played, Today shows a floating bar reading
"{opponent or Game N} · {period and clock} · Resume" that opens bench mode
where the coach left off.

Parent #18 (user story 51, and the Navigation decision "a part-played game
shows a floating Resume bar on Today. It reads the existing resume-point
logic rather than computing its own"). Blocked by #26 (game passes on Today)
and #33 (floating controls) — both closed and merged. The issue comment also
names #69, which is closed.

## Goal

A coach steps away from bench mode mid-game — the phone locks, they switch to
the clock app, the browser reloads. They come back to Today and the app says,
at the bottom of the screen where their thumb already is, "Northwest Valley
Thunderbirds · Q2 4:00 · Resume". One tap puts them back on the bench at the
stint they left.

## Survey (2026-09-18, on `3a90ead`)

Checked against the ticket. Nothing it says is false. These are the facts the
build rests on.

- **The resume point already exists and is already the one answer.**
  `resumeAt(p = plans[state.activeGame], g = game())` in `app/card.js:20`
  returns `null` or `{ at, where }`, where `at` is `g.live.at` and `where` is
  `` `${row.periodName || 'Q' + row.period} ${fmtClock(row.startSec)}` `` —
  exactly the "Q2 4:00" the ticket asks for. It already encodes "part-played":
  `at <= 0 || at >= p.stints.length - 1` returns null, so stint 0 (never
  started) and the last stint (over) are both excluded. `CONTEXT.md`
  § Part-played game names `live.at` and `resumeAt` as the code for the term.
  It takes both arguments, so it can be asked about **any** game, not just the
  active one. Nothing new has to be derived.
- **The game screen already relabels its own button.** `labelBench` in
  `app/card.js:34` writes `Resume · ${r.where}` onto `#abBench` / `#gmOpen`
  and swaps the icon to `play`. So the words and the icon this ticket needs
  are already in the tree; what is missing is the Today surface.
- **Bench mode is already not reopened on load.** `app/card.js:32`'s comment
  and `docs/architecture.md` § Bench mode both state it, and nothing in
  `app/app.js` or `app/render.js` calls `openGameMode` at boot — the only
  callers are `#abBench`/`#gmOpen`'s handlers and the `b` shortcut
  (`app/shortcuts.js:166`). AC4's last clause is therefore already true and
  this ticket must keep it true, not make it true.
- **`openGameMode()` takes no arguments** (`app/gamemode.js:110`). It reads
  `plans[state.activeGame]` and `game()`, and picks up at `live.at`, resetting
  only a game already on its last stint. So "open bench mode at that stint"
  is `state.activeGame = i; openGameMode()` — no new entry point and no new
  argument.
- **Today's list.** `renderPass(g, i)` / `renderTabs()` in
  `app/teams-view.js:441`–`516` paint `#todayGames`, one `button.today-game`
  per game, in `state.day.games` order. A pass's tap handler is
  `state.activeGame = i; setView('games')` (`:472`). `gameLabel(g, i)`
  (`app/state.js:508`) is `g.label || \`Game ${i + 1}\`` — the ticket's
  "opponent or Game N", already shared by the pass, the game screen's title
  and the bar title.
- **`plans` is filled for every game, in day order.** `computeAll()`
  (`app/state.js:1201`) maps `state.day.games`, so `plans[i]` is game `i`'s
  plan. `export let plans` is a live binding, so an importer sees each
  recompute.
- **The floating-control shell is a class, not an id.** #33 left
  `.actionbar` (`app/app.css:1572`–`1607`) carrying the fixed position,
  `z-index: 60`, the `safe-area-max-inset-bottom` padding, the masked
  `::before` scrim with its `backdrop-filter`, and the `abIn` slide. The
  solid-fallback block at `app/app.css:1610` and the `@supports not`
  block at `:1619` both select `.bar::before, .actionbar::before` — **by
  class**. `.ab-main` (`:1630`) is the full-width tinted button inside it:
  `flex: 1`, `min-height: 54px`, `background: var(--tint)`. A second element
  carrying `class="actionbar"` therefore inherits every one of AC5's
  requirements with no new CSS rule.
- **`#actionbar` is the game screen's, and only the game screen's.** Its
  `hidden` flag is set in three places, all with the same expression
  `state.view !== 'games' || !state.onboarded`: `applyView`
  (`app/render.js:572`), `renderCards` (`app/card.js:339`), and `closeGameMode`
  (`app/gamemode.js:269`). `openGameMode` (`:135`) hides it outright. On Today
  it is hidden, so the bottom edge of Today is free.
- **Scroll padding is measured, not guessed.** `measureChromeHeights()`
  (`app/render.js:509`) writes `--bar-h` and `--ab-h` onto `<html>`;
  `app/app.css:27` turns them into `scroll-padding-top` / `-bottom`. `--ab-h`
  reads `#actionbar` **by id** and is `0px` on every screen without it, so
  today a floating bar on Today would have no scroll padding at all — which
  is exactly A1's failure.
- **The undo toast lifts over whatever owns the bottom edge.** `liftToasts`
  (`app/toast.js:199`) measures `#gamemode .gm-foot` or `#actionbar`, by id.
  Today has an undoable action (`#todayNewDay`), so a bar on Today that
  `liftToasts` does not know about would sit on top of the undo toast.
- **`.wrap`'s bottom clearance is keyed on `#actionbar` by id.**
  `app/app.css:1652`: `body:has(#actionbar[hidden]) .wrap { padding-bottom:
  2rem; }` overrides the `6.5rem` above it. On Today that override fires, so
  the last row of Today would sit under a new bar.
- **The page that recedes behind bench mode does not list Today.**
  `pageBehind()` (`app/gamemode.js:147`) is `['.bar', '#view-games',
  '#view-team']` — written before #23 made Today its own view. Bench mode
  opened from Today would rise over a page that does not step back.
- **Full-screen flows are `<dialog>`s.** `#addGameFlow` is opened with the
  sheet primitive (`openAddGame`, `app/teams-view.js:600`) and `showModal()`
  promotes it to the top layer, which covers and inerts a `position: fixed`
  sibling. First run is `#view-welcome`, which only shows while
  `state.onboarded` is false. Bench mode (`.gm`, `z-index: 200`,
  `app/app.css:1294`) is **not** a dialog, so it needs the same explicit hide
  `#actionbar` already gets.
- **`card.js` imports cleanly under `node --test`.** Verified by running
  `import './test/dom-stub.js'; await import('./app/card.js')` — the stub's
  `createElement().getContext()` satisfies `dom.js`'s `ctx2d`. So a pure
  helper placed next to `resumeAt` has a real unit seam, the way
  `test/state-fixture.js` already gives `state.js` one.
- **The smoke registry prints 43 rows today** (`node -e` against
  `scripts/smoke/registry.mjs`: `ROWS.length` 43, 38 selectable), while
  `AGENTS.md` § Layout still says 41. The count was already stale before this
  ticket; adding a row makes it 44.
- **`compare-shots.mjs`'s `SHOTS` table** is `BASE_SHOTS` (five views × two
  themes) plus `EXTRA_SHOTS` (long name, bottom, full, one 320px/32px cell,
  first run, title-collapsed). Every entry carries the full flag set, and
  `test/compare-shots.test.js` hand-types the expected counts as the
  independent second reading — including `plainShotsFor`, which lists every
  flag by name.
- **Budgets.** `bytesAbs`/`bytesPct` are 384 / 59.5% against a 754209-byte
  baseline: a 1175.1 KB ceiling, with #33 measured at 1164.1 KB — about
  11.0 KB of room. `scripts/budgets.mjs`'s own comment says the mechanism has
  roughly 3 KB left before `test/budgets.test.js` turns red and that the next
  overrun must re-record the `bytes` baseline by hand rather than run
  `--update-budgets`. `requests` is pinned at 39 and no new file under `app/`
  joins the boot graph here.

## Decisions made in this spec without asking

The ticket is `ready-for-agent` and every acceptance criterion carries a
concrete value, so nothing went to the human. Where the prototype and
`docs/interface-guidelines.md` disagree, the guidelines win — and
`notes/mockups/prototype/README.md` says outright that the prototype leaves
the Resume bar out, so there is no PNG to match for the bar itself. The rest
of Today must still look exactly like `light-today.png` / `dark-today.png`.

1. **The bar is a new `#resumeBar` element carrying `class="actionbar"`,**
   a sibling of `#actionbar` in `app/index.html`. It reuses #33's floating
   shell wholesale — the scrim, the blur, the safe-area padding, the
   `z-index`, and both solid-fallback blocks, all of which already select
   `.actionbar` by class. AC5's three requirements ("at least 48px tall, a
   solid fallback, and focus never hidden beneath it") are therefore met by
   the rules that already exist, not by a second copy of them. A bar built
   from its own rules would be a second answer to "what does a floating
   control look like", which is the defect `CLAUDE.md` names.
2. **The whole bar is one button, `#resumeBtn.ab-main`,** holding a `play`
   icon and one `.ab-lab` span. AC2 says tapping *the bar* opens bench mode,
   and one full-width target is the biggest thing a coach can hit standing
   up. `.ab-main`'s `min-height: 54px` clears AC5's 48px floor and its
   `var(--tint)` fill is K1-legal: on Today, when it is there, this *is* the
   primary action.
3. **Its label is `` `${gameLabel(g, i)} · ${where} · Resume` ``** — the
   ticket's own string, built from `gameLabel` and `resumeAt().where`, with
   no third copy of either. The button's accessible name is its visible text;
   the icon is `aria-hidden` like every other `.i`.
4. **The label wraps, it never clips.** `.ab-main` has a `min-height`, not a
   height, so a long opponent name at 320px with a 32px root grows the button
   instead of truncating it. One rule (`#resumeBtn { text-align: center }`,
   `#resumeBtn .ab-lab { min-width: 0 }`) and one padding-block allowance is
   all that is added, and item 7 below proves it with a screenshot.
5. **The picker is `resumeBarAt()`, exported from `app/card.js` next to
   `resumeAt`.** It walks `state.day.games` from the end and returns the first
   game whose `resumeAt(plans[i], g)` is non-null, as `{ i, at, where }`, or
   `null`. Walking from the end is AC3 ("the last of them in day order")
   stated once. It lives in `card.js` because `resumeAt` does, and calling
   `resumeAt` is the whole of it — a copy in `state.js` would be a second
   definition of "part-played", and `state.js` cannot import `card.js`
   anyway (`card.js` imports `state.js`).
6. **The painter is `renderResumeBar()` in `app/teams-view.js`,** which owns
   Today. It sets `#resumeBar.hidden` and writes the label in one function, so
   there is one expression for "is the bar there", not the three copies
   `#actionbar`'s `hidden` is spread across. It is registered in
   `render.js`'s `SECTIONS` as `resume` and called directly from `applyView`
   beside the `#actionbar` line.
7. **It is NOT in `AFTER_EDIT` or `PLAN_ONLY`.** Same call #26 decision 6
   made for the passes: those lists run on every edit on the game screen,
   where this bar is hidden, and painting a hidden control on every slider
   move is work nobody sees. `applyView` paints it on a real transition into
   Today (the existing `if (v === 'today' && ...) render('tabs')` becomes
   `render('tabs', 'resume')`) and hides it on the way out; boot's own
   `renderAll()` covers the first paint. `test/render-sections.test.js` makes
   that a decision rather than an oversight: a `SECTIONS` key in neither list
   fails until it is entered in that test's own `KEEP` map **with the reason
   written on the line**, exactly as `tabs` already is. So `resume` joins
   `KEEP`, with the reason above.
8. **Tapping sets `state.activeGame` and opens bench mode, staying on
   Today.** `state.activeGame = i; openGameMode();` — no `setView`. AC2 asks
   for bench mode, not for a navigation, and a coach who taps Done lands back
   where they tapped rather than one screen deeper with a two-tap way home.
   It also pushes no history entry, so back still leaves Today the way N6
   says it should.
9. **`pageBehind()` gains `#view-today`.** Bench mode's entry steps the page
   behind it back to 0.94/0.45; opened from Today that page is `#view-today`,
   which the list predates. Without it the sheet rises over a static screen —
   the same animation gap in reverse that `docs/architecture.md` § Bench mode
   already warns about. One string in an existing array, no new measuring:
   `docs/architecture.md`'s "entering measures nothing" rule and
   `test/gamemode-open.test.js` both still hold.
10. **`openGameMode` hides `#resumeBar` the way it already hides
    `#actionbar`,** and `closeGameMode` adds `'resume'` to the render keys it
    already passes. Bench mode is not a `<dialog>`, so `z-index: 200` hides
    it visually but leaves it in the tab order; the explicit flag is what AC4
    actually asks for. The full-screen flows need nothing: `#addGameFlow` is a
    modal `<dialog>` in the top layer, and first run is gated by
    `!state.onboarded`, which the painter already checks.
11. **`--ab-h` becomes "the bottom floating bar", not "`#actionbar`".**
    `measureChromeHeights()` measures whichever of `#actionbar` / `#resumeBar`
    is showing (they are never both, one being Today's and one the game
    screen's), so `html`'s `scroll-padding-bottom` clears the Resume bar and
    A1 holds. `#resumeBar` joins the same `ResizeObserver` pair.
12. **`liftToasts` and `.wrap`'s clearance follow the same move.**
    `liftToasts` measures `#resumeBar` as well, so Today's own undo toast
    ("New day") is never buried; `app/app.css:1652` becomes
    `body:has(#actionbar[hidden]):has(#resumeBar[hidden]) .wrap`, so Today
    keeps its 6.5rem of clearance exactly while the bar is up and drops back
    to 2rem when it is not. Written as an override, not a condition, so a
    browser without `:has()` keeps the safe over-padded behavior — #33's own
    reasoning, applied unchanged. Landscape needs nothing: `app/app.css:3672`
    re-declares `.actionbar`'s tighter padding **by class**, so the new bar
    picks it up, and `app/app.css:3676`'s `.wrap { padding-bottom: 3.6rem }`
    there is unconditional, so it already clears a bar it has never heard of.
13. **It shows at every width, not only below 900px.** `.actionbar`'s
    `display: flex` is inside `@media (max-width: 900px)` because above that
    the game screen has `.gm-start`/`#gmOpen` instead. Today has no such
    twin, so `#resumeBar:not([hidden]) { display: flex; }` is unconditional.
    A part-played game the app knows about and does not mention on a laptop
    is the bug this ticket exists to fix, only wider.
14. **The smoke fixture gives the later game a long opponent name.** A new
    `partPlayed(record)` helper in `scripts/smoke/fixtures.mjs` returns RICH
    with `games[0].live = { at: 2, overrides: {} }`, `games[1].live = { at: 3,
    overrides: {} }` and `games[1].label` set to a long real opponent. Two
    part-played games is what makes AC3 falsifiable — a picker that returned
    the first would say "Hawks" — and the long label makes every Resume-bar
    screenshot a long-name screenshot by construction, rather than adding a
    sixth flag to the shot table for it.
15. **One new smoke row, `resumebar`,** in `scripts/smoke/resume-bar.mjs`. It
    covers AC1–AC5 by driving real clicks. Its focus half reuses the overlap
    predicate `scripts/smoke/focus-clear.mjs` already has (exported from
    there rather than copied), so there are not two answers to "does this
    control sit under the floating chrome". Registration is the same three
    places every row uses — `ROWS` in `registry.mjs`, an `import` in
    `scripts/smoke.mjs`, and that file's dispatch map — plus the count
    `test/smoke-only.test.js` pins by hand, which goes from 38 selectable rows
    to 39 with the reason on the line, the way #31, #32 and #33 each left
    theirs. `AGENTS.md` § Layout's row count goes to 44 — and is corrected on
    the way past, since it says 41 against a tree that already has 43.
16. **Five new compare shots,** behind one new `partPlayed` flag:
    `resume-bar-{light,dark}` (Today, 390×844), `resume-bar-full-{light,dark}`
    (the whole document height, which is where a bar covering the last row
    would show), and `resume-bar-320` (320px at a 32px root, light only, no
    twin — the wrapping cell). Today in RICH is 853px against an 844px
    viewport, so a `bottom: true` scroll on it would move nine pixels and
    prove nothing; the full-height capture is the honest version of that
    state, which is the same reading `compare-shots.mjs` already wrote down
    for `title-collapsed`.

## What would settle it

1. On Today, with `games[0].live.at = 2` and `games[1].live.at = 3` on the
   rich fixture's 4 × 8 day (eight 4-minute stints, so stint 3 begins at
   Q2 4:00), `#resumeBar` is visible and `#resumeBtn`'s text is
   `Northwest Valley Thunderbirds · Q2 4:00 · Resume` — the **second** game's
   label, not the first's, and not `Game 2`.
2. Tapping `#resumeBtn` leaves `#gamemode` not hidden, `state.activeGame` at
   1, and bench mode's own top line reading `stint 4 of 8` (`live.at` 3,
   zero-based). `#resumeBar` is hidden for as long as bench mode is open, and
   visible again once it closes, with Today still the screen (`#view-today`
   not hidden, `state.view === 'today'`).
3. `#resumeBar` is hidden on the game screen, Team, Season and Settings, and
   on Today when the record has no part-played game (plain RICH: every
   `live.at` unset). On a first run (`onboarded: false`) it is hidden and
   `#view-welcome` is showing.
4. Loading the app with that same part-played record leaves `#gamemode`
   hidden — the app does not open bench mode by itself. Measured after the
   boot settles, on the reload the fixture arrives through.
5. `#resumeBar`'s measured height is at least 48px at 320, 360 and 390px, and
   `#resumeBtn`'s width is within 1px of `#resumeBar`'s content box. With
   `prefers-reduced-transparency: reduce` emulated, and again with
   `prefers-contrast: more`, the computed `backdrop-filter` on
   `#resumeBar::before` is `none` and its background color has alpha 1.
6. With the bar up on Today, `<html>`'s computed `scroll-padding-bottom` is at
   least `#resumeBar`'s measured height, and tabbing Today from the top of
   the document through every focusable control never leaves
   `document.activeElement`'s rect overlapping `#resumeBar`'s rect. The check
   reports how many controls it visited, and zero is a failure.
7. `resumeBarAt()` under `node --test`, against a two-game day built with
   `test/state-fixture.js`: returns `null` when no game has a `live.at`;
   returns `null` when the only non-zero `live.at` is `0` or the last stint;
   returns `{ i: 1 }` when both games are part-played; returns `{ i: 0 }` when
   only the first is; and its `where` equals `resumeAt(plans[i], games[i])`'s
   `where` for the game it picked — one answer, not two.
8. The compare set under `notes/mockups/prototype/compare/34/`, produced by
   `node scripts/compare-shots.mjs --issue 34`, contains the five new shots
   plus the existing set, with `measurements.json` proving each one's root
   font size and painted background. No clipped text in any of them, and the
   long opponent name wraps rather than truncating in `resume-bar-320`.
   Today's other content is unchanged against `light-today.png` and
   `dark-today.png`.
9. `npm test` and the whole of `npm run smoke` are green, the new
   `resume bar on Today` row included. `scripts/budgets.json` is untouched and
   its `requests` is still 39.

## Surfaces

Change: `app/index.html` (the bar's markup), `app/app.css` (its display rule,
the label's wrap, the `.wrap` clearance `:has()`), `app/card.js`
(`resumeBarAt`), `app/teams-view.js` (`renderResumeBar`, the tap handler),
`app/render.js` (the `resume` section, `applyView`, `measureChromeHeights`,
the resize observer), `app/gamemode.js` (`pageBehind`, the open/close flags),
`app/toast.js` (`liftToasts`), `app/sw.js` (VERSION and SHELL),
`scripts/smoke/fixtures.mjs` (`partPlayed`), `scripts/smoke/resume-bar.mjs`
(new), `scripts/smoke/focus-clear.mjs` (export the overlap predicate),
`scripts/smoke/registry.mjs`, `scripts/smoke.mjs`,
`scripts/compare-shots.mjs` (the `partPlayed` flag and five shots),
`scripts/budgets.mjs` (only if the ceiling is crossed), `docs/` and
`AGENTS.md` (the row count).

Under `test/`: `resume-bar.test.js` (new), `render-sections.test.js` (`resume`
joins `KEEP`), `smoke-only.test.js` (38 selectable rows becomes 39),
`compare-shots.test.js` (the `partPlayed` flag and the new counts),
`gamemode-open.test.js` (its "a reload does not force the coach back into
bench mode" guard now has a second entry point to cover). Three more may
answer on their own and are checked rather than assumed: `dead-class.test.js`
and `dead-id.test.js` (every emitted class and id needs a rule or a declared
hook), and `sw.test.js` (it prints the digest `SHELL` must carry).

Must not change: `app/card.css` and the printed card; `resumeAt`'s own
behavior; the four pure modules (`engine.js`, `budget.js`, `storage.js`,
`roster.js`); `scripts/budgets.json`; `#actionbar`'s own visibility rule; any
element id a handler or test reaches for other than the ones named above.

`test/actionbar-split.test.js` slices `#actionbar`'s markup from the `<div>`
before `id="actionbar"` to the first `</div>` after `id="abBench"`, and
asserts the bar holds bench and nothing else. `#resumeBar` goes **after**
`#actionbar` so it falls outside that slice. The same file also pins
`.actionbar { … display: none … }`, which is why decision 13 turns the new bar
on with an id selector rather than by loosening the class rule.

## Constraints

- `docs/interface-guidelines.md`: **N7** (the bar itself), **C2** (one
  full-width floating action, labelled with a verb, in thumb reach), **L2**
  (translucent with a blur, solid under reduced transparency / more contrast /
  no `backdrop-filter`), **L3** (a fade, not a line), **L5** (safe-area
  padding), **A1** (focus visible and never under a floating control), **A2**
  (the icon is not the name), **K1** (the tint goes on the primary action).
- **Reuse `resumeAt`; do not re-derive "part-played".** `CONTEXT.md` names it
  as the code for the term and #18's own Navigation decision says the bar
  reads the existing logic.
- **Reuse `gameLabel`**, `.actionbar`, `.ab-main`, `icon('play')` and
  `focus-clear.mjs`'s overlap predicate. Nothing here gets a second copy.
- **No new file under `app/`.** `requests` is pinned at 39 in
  `scripts/budgets.json` and re-recording it is a `REVIEW.md` Blocker.
- Colors come from tokens; no raw hex in new `app.css` rules. A
  `prefers-contrast: more` rule that names a color must name both themes, the
  way `tokens.css` does.
- Any file under `scripts/smoke/` stays under 40,000 bytes.
- American spelling everywhere (`test/spelling.test.js` scans every tracked
  file).
- A precached file changes, so `VERSION` in `app/sw.js` goes up and `SHELL`
  becomes the digest `node --test test/sw.test.js` prints, in the same edit.
  Re-derive it from this worktree; never trust a digest quoted from elsewhere.
- The new smoke check and the new `SHOTS` entries are guards: `/new-guard`
  applies, and each must be shown to go red before it is trusted green.
- If `scripts/budgets.mjs` overruns, widen it deliberately and say why in the
  commit. If the percentage has no room left, re-record `bytes` in
  `scripts/budgets.json` **by hand** — never
  `node scripts/smoke.mjs --update-budgets`, which would erase the `requests`
  pin.

## Design

`app/index.html`, immediately after `#actionbar`:

```html
<div class="actionbar noprint" id="resumeBar" hidden>
  <button class="ab-main press" id="resumeBtn" type="button">
    <span class="i" data-icon="play"></span>
    <span class="ab-lab"></span>
  </button>
</div>
```

`app/card.js`, beside `resumeAt`:

```js
export function resumeBarAt() {
  const gs = state.day.games;
  for (let i = gs.length - 1; i >= 0; i--) {
    const r = resumeAt(plans[i], gs[i]);
    if (r) return { i, ...r };
  }
  return null;
}
```

`app/teams-view.js`:

```js
export function renderResumeBar() {
  const bar = $('#resumeBar');
  if (!bar) return;
  const r = state.onboarded && state.view === 'today' ? resumeBarAt() : null;
  bar.hidden = !r;
  if (r) set('#resumeBtn .ab-lab', 'textContent',
    `${gameLabel(state.day.games[r.i], r.i)} · ${r.where} · Resume`);
}
```

wired once in `initTeams`:

```js
on('#resumeBtn', 'onclick', () => {
  const r = resumeBarAt();
  if (!r) return;
  state.activeGame = r.i;
  openGameMode();
});
```

`app/render.js`: `SECTIONS.resume = () => renderResumeBar()`; `applyView`
calls `renderResumeBar()` right after the `#actionbar` line and before
`measureChromeHeights()`; the Today branch at the foot becomes
`render('tabs', 'resume')`; `measureChromeHeights` reads whichever bottom bar
is showing; `initBarMeasurements` observes `#resumeBar` too.

`app/gamemode.js`: `pageBehind()` gains `'#view-today'`; `openGameMode` hides
`#resumeBar`; `closeGameMode` adds `'resume'` to its `render(...)` keys.

`app/toast.js`: `liftToasts` measures `#resumeBar` as a third candidate.

`app/app.css`: `#resumeBar:not([hidden]) { display: flex; }`, the label's wrap
allowance, and the `.wrap` clearance `:has()` extension. Nothing else — every
other rule the bar needs already selects `.actionbar` or `.ab-main`.

## Proof

The seams `/tdd` builds at, each with where it runs and which **What would
settle it** items it covers.

1. **`test/resume-bar.test.js`, `node --test`** — imports
   `test/state-fixture.js` (the `document` stub plus `withTeam`) and
   `app/card.js`, builds a two-game day, calls `S.computeAll()`, and drives
   `resumeBarAt()` through the five cases. Covers item 7. This is a behavior
   test through a module's exports, so it is built with `/tdd`: the assertion
   has to fail because `resumeBarAt` returns the wrong game, not because the
   import is missing.
2. **`scripts/smoke/resume-bar.mjs`, the new `resumebar` row** — drives Today
   with the `partPlayed` fixture over CDP: reads `#resumeBtn`'s text, clicks
   it, reads `#gamemode.hidden` and bench mode's stint line, closes bench
   mode, walks the other four screens, reloads on plain RICH and on a
   first-run record, sweeps 320/360/390 for the height, emulates both
   fallback queries, and tabs Today counting the controls it visited. Covers
   items 1–6. A guard, so `/new-guard` applies: it must fail against the tree
   before the feature exists, it must fail when the fixture does not arrive,
   and a run that visited zero controls is a failure rather than a pass.
3. **`scripts/compare-shots.mjs` + `test/compare-shots.test.js`** — the
   `partPlayed` flag, the five new entries, and the hand-typed counts in the
   test (which also gains `partPlayed` in `plainShotsFor`, or the new Today
   shots would be read as plain ones). Covers item 8. `test/compare-shots.test.js`
   is the independent second reading and stays hand-typed.
4. **The proof pair** — `npm test` then `npm run smoke -- --no-tests`, once
   per commit, by the committer. Covers item 9.
5. **`/browser-verify` on the Cloudflare branch preview** — item 1's exact
   string, item 2's tap, and item 5's measured height, on the server that
   redirects the way production does.

## Out of scope

- **Any change to `resumeAt` itself**, to `live.at`, to bench mode's
  behavior, or to what a swap or "sit for the rest" does. The ticket is a
  surface on Today.
- **The game screen's own "Resume · Q2 4:00" button.** It already exists
  (`labelBench`) and is #18's user story 27, not this one.
- **Reopening bench mode on load.** Deliberately not done, and AC4 says so.
- **A resume affordance on Team, Season or Settings.** AC4: the bar appears
  only on Today.
- **The wide (840px+) side-by-side layout** from #18. Decision 13 shows the
  bar at every width; it does not build the split.
- **The prototype's tab bar.** There is none (N1), and
  `notes/mockups/prototype/README.md` says the prototype's is one of the
  places the docs win.
