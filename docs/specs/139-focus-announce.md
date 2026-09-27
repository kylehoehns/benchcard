# #139 Focus lands somewhere useful, and changes are announced

## Issue

#139 (child of #153). When a screen changes, keyboard focus drops to `<body>`
and the page title never changes. In bench mode focus is lost after most
actions, the stint change is silent, and the swap toast sits outside the
bench-mode dialog. A plain Shuffle says nothing at all. Rules A1, A2, A3, P5.

## Goal

A coach using a keyboard or a screen reader always knows where they are and
what just changed. After any screen change, focus sits on something on the
new screen, and the tab title names that screen. In bench mode, focus never
falls to `<body>`. Each stint change, swap and Shuffle is read out once.
Nothing a sighted mouse or touch user sees changes, except the tab title.

## Survey (tree at 280dad6, headless Chrome, 390×844, rich fixture)

| Issue claim | Verdict | Evidence |
|---|---|---|
| Focus lands on `<body>` after a push to game, Team, Season or Settings | holds | Keyboard Enter from Today: `activeElement` is BODY on all four |
| Focus lands on `<body>` after Back | holds | BODY after `#backBtn` and after `history.back()` |
| Focus never returns to the opener | holds | Also: `.today-game` passes are rebuilt by `renderTabs` on each return, so the opener node is gone; `#todayTeam` survives |
| `document.title` never changes | holds | Static `index.html:321` on every screen; nothing in `app/` writes it |
| `render.js` has no focus handling for view changes | holds | Only `withFocus`, which keeps focus through a repaint |
| `#gmNext2` is disabled while focused on the last stint | changed since | Since #135 it is also `hidden`, and `#gmFinish` shows. Focus still drops to BODY |
| (not in issue) `#gmPrev` at stint 1 | same defect | BODY |
| Focus lost after a keyboard swap | holds | BODY after Enter on a bench row |
| (not in issue) other losses | found | BODY after This stint / Rest of game, Sit for the rest, `#gmReset`, and toast Undo |
| `#gmGame` has no live region | holds | No live region anywhere inside `#gamemode` |
| Stint text example "Q2 · 4:00 to 0:00, 6 of 8" | format holds, example differs | On the rich fixture, 6 of 8 is "Q3 · 4:00 to 0:00"; the format `title, subtitle` from `benchHeaderText` holds |
| `.picked` has no `aria-pressed` | holds | Picked floor row: `aria-pressed` null |
| Bench label text | changed since | Now "Bench · tap who goes on for Ana" (#138); no role, not live |
| Player rows read as run-on text | partly falsified | `textContent` "3Ana Reyes0 / 16", but Chrome's accessible name is "3 Ana Reyes 0 / 16". Still no "of … minutes". Bench rows are `div`s until a pick |
| `#gmReset` named only by `title` | holds | `title="Undo in-game changes"`, no `aria-label`; its toast says "Back to the printed plan." |
| Scope toggle has no `aria-pressed` | holds | Class `on` only |
| `#toasts` is outside the aria-modal `#gamemode` | holds | `index.html:1702` vs `1596`. `#gamemode` is not a `showModal` dialog, so Chrome's tree still exposes `#toasts`; screen readers that honor `aria-modal` will not |
| `.bsheet-toasts` has no role | holds, lines moved | `toast.js` ~115-125; created in the same tick as its first toast |
| `#summary` is not live; a plain Shuffle says nothing | holds | Summary "12–16 min each · 21 changes" is the same before and after; no toast. Shuffle with hand swaps flashes "New rotation. The swaps you made by hand were cleared."; an underway game gets #134's "Rotation changed." |
| `#issues` rebuilt every render | holds, line moved | `plan-view.js:48`; child nodes replaced on Shuffle with the same text |

## What would settle it

Measured at 390×844 on the rich fixture, by keyboard (real key events over
CDP), reading `document.activeElement` and Chrome's accessibility tree.

### Screen changes

1. **Push lands on the new screen's h1.** After Enter on a Today door, focus
   is on that screen's heading, which has `tabindex="-1"` and shows the A1
   ring (`:focus-visible` rules apply only if the heading was reached by
   keyboard; a heading focused after a mouse tap shows no ring):
   - game pass → `#gameTitle`
   - `#todayTeam` → `#teamTitle`
   - `#todaySeason` → `.season-h1`
   - `#settingsBtn` → `#barTitle` (the Settings heading lives in the bar;
     its `aria-hidden` is already false there)
   The page does not scroll because of the focus (`scrollY` unchanged, 0).
2. **Callers that place focus win.** These still end where they do today:
   Team's add-player path from Timeline (`#teamAdd` clicked), Settings'
   team-name field (`teams-view.js` ~398-404), and the add-game flow's commit
   landing on the game.
3. **Back returns to the door.** After Back to Today (`#backBtn`, Escape, or
   `history.back()`), focus is on the door that opened the screen:
   `#todayTeam`, `#todaySeason`, `#settingsBtn`, or the `.today-game` pass for
   that game (matched by game id, since the node is rebuilt). If that door is
   gone or hidden, focus is on Today's h1 (`.today-h1`). Never BODY.
4. **No focus move at boot or on the welcome screen.** Loading the app on any
   screen leaves focus where the browser put it.
5. **Tab title.** `document.title` is `"<h1 text> · Benchcard"` on pushed
   screens:
   - game "Hawks" → `Hawks · Benchcard`
   - Team "Smoke Test" → `Smoke Test · Benchcard`
   - Season → `Season · Benchcard`
   - Settings → `Settings · Benchcard`
   On Today it is the home title, decided with the maintainer: the static
   `Benchcard — basketball substitution rotation generator`. A game
   rename or team rename updates the title on the next render.

### Bench mode

6. **Focus is never BODY.** After each of these, `activeElement` is inside
   `#gamemode` and is the named node:
   - Next onto the last stint of an unfinished game → `#gmFinish`
   - Next onto the last stint of a finished game → `#gmPrev`
   - Previous onto stint 1 → `#gmNext2`
   - a swap (Enter on a bench row) → the incoming player's floor row
     (`[data-pid="<in id>"]`)
   - Sit for the rest → the player now in that seat; if sitting is refused,
     the row that was picked
   - This stint / Rest of game → the button just pressed
   - `#gmReset`, or Undo on a bench-mode toast → the first floor row, or
     `#gmClose` if the floor has no buttons
   Arrow-key stepping (`shortcuts.js`) behaves the same as the buttons.
7. **Stint change is read once.** A static visually-hidden `#gmLive`
   (`role="status"`, inside `#gamemode`) holds `"<title>, <subtitle>"` from
   `benchHeaderText` after each step. On the rich fixture, stepping from 1:
   `Q1 · 8:00 to 4:00, 1 of 8` → `Q1 · 4:00 to 0:00, 2 of 8` → … →
   `Q4 · 4:00 to 0:00, 8 of 8`. It is written only when the stint index
   changes (not on open, not on a pick, not on a swap, not on a repaint with
   the same stint).
8. **Pressed state.** The picked floor row has `aria-pressed="true"`; other
   floor rows `"false"`. This stint / Rest of game carry `aria-pressed`
   `true`/`false` matching their `on` class. Sit for the rest has none.
9. **Row names.** Each floor and bench row's accessible name is
   `"<number>, <name>, <played> of <projected> minutes"`, then
   `", just on"` if that tag shows. Example: `3, Ana Reyes, 0 of 16 minutes`.
   The number part is present only when the player has a jersey number
   (`initials` otherwise shows two letters, which are not read). Minutes use
   `fmtMinutes` (so `4.5 of 16 minutes`). Holds for bench rows as `div`s
   (before a pick) and as buttons (after).
10. **Reset is named.** `#gmReset` has `aria-label="Back to the printed plan"`
    and no `title` that says anything else (the `title` is removed).
11. **Toasts inside the dialog.** While bench mode is open, a new toast's
    live region is a descendant of `#gamemode`. After a swap, the accessible
    tree has exactly one live node holding `Casey on for Ana this stint.`,
    and its Undo is reachable by Tab. After Done, the same toast is still
    visible above the page and its Undo still works (today's behavior),
    and its text is not announced a second time.
12. **Sheet toasts are live.** `.bsheet-toasts` has `role="status"`
    (`aria-live="polite"` implied) and is in the DOM before its first toast's
    text is inserted.

### Plan changes (A3)

13. **Shuffle says one line.** After Shuffle (button or `s`):
    - plain Shuffle, nothing else fires → a visually-hidden polite line in
      `#view-games` reads `New rotation.` followed by the summary, e.g.
      `New rotation. 12–16 min each · 21 changes`. The text is written even
      if it equals the last one (clear, then set in the next frame, or
      alternate so a repeat is still announced).
    - Shuffle that clears hand swaps → only the existing flash
      `New rotation. The swaps you made by hand were cleared.`
    - Shuffle on an underway game → only #134's `Rotation changed.` toast.
    Never two lines for one Shuffle.
14. **`#issues` is quiet unless it changed.** A render whose issues text is
    the same leaves `#issues`' child nodes untouched (same node identity);
    changed text replaces them.

## Surfaces

- `app/render.js`: `applyView` / `setView` (focus after a real transition,
  remembering the opener), `syncBarTitle` (tab title from the same source).
- `app/gamemode.js`: `renderGameMode` (row names, `aria-pressed`, `#gmLive`),
  `gmStep`, `applySwap`, `sitRest`, scope buttons, `clearOverrides` path.
- `app/app.js`: `#gmReset` wiring (~334), `#regen` (~135).
- `app/toast.js`: `toastHost`, `.bsheet-toasts` creation, bench-mode host.
- `app/plan-view.js`: `renderIssues` (~48), Shuffle's line.
- `app/index.html`: `tabindex="-1"` on the h1s, `#gmLive`, `#gmReset` label,
  the Shuffle line's node.
- `app/app.css`: nothing new expected beyond reusing `.sr-only`; heading
  focus ring only if A1's existing rule does not already reach it.
- `app/sw.js`: precache bump.
- `scripts/smoke/`: one new check module plus its `registry.mjs` entry.

## Constraints

- **Reuse, do not re-derive:**
  - `.sr-only` (`app.css` ~1290, from #144) for every hidden line; no second
    visually-hidden rule.
  - `benchHeaderText` for the stint line; do not rebuild "Q1 · …" text.
  - `initials`, `fmtMinutes`, the existing name source (`pl.name || shorts`)
    and the existing "just on" test for the row names.
  - `setAttribute('aria-pressed', String(on))`, as in `teams-view.js`,
    `game-setup.js`, `rules.js`, `balance.js`.
  - The Settings heading is `#barTitle`; the tab title reads the same
    `[data-large-title]` / `data-bar-title` source `syncBarTitle` already
    uses. One source for "what this screen is called".
  - Shuffle's existing messages (`flash` text in `app.js`, `ROTATION_CHANGED`
    / `SWAPS_CLEARED` in `render.js`) stay the one place those words live.
  - `liftToasts` keeps working; it keys on `box.id === 'toasts'`.
  - `trap.js`'s Tab reach to toasts stays (Undo reachable by Tab).
- **Order matters:** the h1 focus runs synchronously inside the view change,
  after `closeSheets()`, so callers that focus afterwards (constraint in item
  2) override it. Only on a real transition (`from !== v && from !== null`),
  including a forward popstate; not on the self-back echo (`pendingSelfBack`).
- **P5 / motion:** focus uses `preventScroll: true`; nothing new animates.
- **A1:** every focused target shows the 2px ring when reached by keyboard.
- **No visible change** for touch users except the tab title.
- **Precache bump:** `VERSION` past the branch's committed value, `SHELL` to
  the digest `npm test` names.
- **Budgets:** add no new boot module (request budget). A byte-budget widen
  is routine.
- **Smoke checks** through the registry (#130), using `chrome.mjs`,
  `dom.mjs`, `fixtures.mjs`; no second launcher.
- American spelling. They/them or names.

## Design

- **View focus.** `applyView` records the focused element (or the door id and
  game id) when leaving Today, and at the end of a real transition focuses the
  new screen's heading (`tabindex="-1"`). Returning to Today looks up the
  door by id / game id, falling back to `.today-h1`. A small map from view to
  heading and view to door keeps it in one place.
- **Tab title.** Set in `syncBarTitle` (runs from `applyView` and the end of
  `render()`), so renames follow for free.
- **Bench focus.** A single `gmFocus(target)` helper runs after
  `renderGameMode` for each action; it picks the target by the rules in item
  6 and falls back to `#gmClose`. Stepping checks the button it came from:
  if now hidden or disabled, move to the other step control.
- **Stint line.** `#gmLive.sr-only[role=status]` static in `index.html`;
  `renderGameMode` writes it only when the stint index differs from the last
  one written. Cleared on close so reopening does not re-read.
- **Row names.** Visible parts `aria-hidden="true"`, plus one `.sr-only`
  span with the full text. Works for both `div` and `button`. A pure
  `rowLabel(player, played, projected, justOn)` gets unit tests.
- **Toasts in bench mode.** On open, move the `#toasts` element itself into
  `#gamemode`; on close, move it back. It stays one node with one id, so
  `liftToasts`, the trap's Tab reach, and "still visible after Done" hold. The
  developer must confirm (item 11) that the move does not re-announce; if it
  does, use a second host inside `#gamemode` and move only live toast nodes
  out on close with `aria-live` off during the move.
- **Shuffle line.** One `.sr-only` polite node in `#view-games`, written only
  when Shuffle produced no flash and no Rotation-changed toast.
- **`#issues`.** Compare the new text with the old; skip the rebuild if equal.

## Proof

| Seam | Covers |
|---|---|
| New smoke check `scripts/smoke/focus-announce.mjs` + `registry.mjs` entry: real key events, `activeElement`, `document.title`, `scrollY`, Chrome AX tree (`Accessibility.getFullAXTree`) for names, pressed, live nodes | 1-14 |
| Same check: the three caller-focus paths | 2 |
| Same check: count live nodes holding the swap text after a swap, then after Done | 11 |
| Same check: `#issues` node identity across a same-text render | 14 |
| `node --test` for `rowLabel` (with number, without number, decimal minutes, just on) and the stint line join | 7, 9 |
| Existing `gm-open`, `focus-clear`, `rotation-undo`, `resume-bar` smoke rows stay green | no regressions |

A real screen reader is not run in CI. Item 11's "announced once" is proved
by the AX tree (one live node) and checked by ear at review if possible.

## Out of scope

- Moving bench mode to a native `<dialog>` / `showModal`.
- Announcing edits other than Shuffle (A3 for single edits is later work).
- Focus inside sheets and flows (their look is #143; their focus is not changed here).
- New visible text, toasts or controls.
- Screen-reader testing tooling in CI.
