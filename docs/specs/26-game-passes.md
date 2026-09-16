# 26 — Game passes on Today

## Issue

#26 (parent #18, blocked by #23, now closed): each of today's games on Today
becomes a **game pass** — tip-off, status, opponent as the title, a mini
rotation and a one-line summary — so a coach sees a whole tournament day at a
glance.

## Goal

A coach opens Benchcard on a tournament morning and sees four passes, one per
game, in the order they are played. Each says when it tips off, whether its
plan is ready ("Planned") or blocked ("Needs a fix"), and who it is against.
It also shows a small picture of who plays when, and one line of how it is set
up. Tapping a pass opens that game.

## Survey (2026-09-16, on `424251a`)

Checked against the ticket. Nothing it says is false. These are the facts the
build rests on:

- **Today's list today.** `renderTabs()` in `app/teams-view.js` paints
  `#todayGames`: one `button.today-game` per game with
  `.today-game-lb` (the `gameLabel`), `.today-game-when` (`g.when`, if set),
  a red `.bad` dot when `plans[i].ok` is false, and `aria-label`
  `"<label>, <when>"`. `#todayAddGame` and `#todayNewDay` sit side by side in
  `.today-acts` below the list, then `#todayTeam` and `#todaySeason`.
  `#barToday` holds `#teamBtn`, `#teamMenu`, a spacer, `#keysHint` and
  `#settingsBtn`.
- **Plans for every game exist.** `computeAll()` (`state.js`) fills
  `plans[i]` for every game in `state.day.games`, in order, so a pass reads
  its own plan. `effectiveStints(g, p)` is the rotation with bench-mode swaps
  folded in (the one the card prints). Each stint carries `period`,
  `minutes` and `onFloor`. A blocked plan is `p.ok === false`.
- **Player color** is `colorOf(id)` (`state.js`), an `oklch()` string built
  from `--pc-l`/`--pc-c`.
- **Status colors exist** in `app/tokens.css` for every theme block:
  `--ok` (green) and `--warn` (amber). The current dot uses `--err` (red).
- **Evening out the day** is `g.useCarryover` (`CONTEXT.md`); `newGame` turns
  it on for every game after the first.
- **The rules count disagrees with the rules list.** `renderConsCount()`
  (`game-setup.js`) adds `openingFive.length` and `lastPeriodFive.length`
  (five each for one rule), leaves out `keepOnFloor`, and counts min/max
  rules for absent players. `renderConstraints()` (`rules.js`) shows one chip
  per rule, skips absent players' min/max, and includes `keepOnFloor`.
  `test/league-min.test.js` and `test/game-format.test.js` pin the badge's
  count expression by reading the source.
- **`renderTabs` is in `AFTER_EDIT` and `PLAN_ONLY`** (`render.js`), so today
  it runs on every edit on the Game screen, while Today is hidden.
- **Budgets.** The DOM budget is measured once, on the lean cold load
  (`SEED`, `view: 'games'`): `scripts/budgets.json` `nodes` 1519, ceiling
  `ceiling('nodes', 1519)` = 1769 (`scripts/budgets.mjs`), counted as
  `document.getElementsByTagName('*').length`. `requests` is pinned: no new
  module.
- **The ticket's DOM budget claim does not hold as a whole-page count.**
  Measured on `424251a` (a CDP script, `FOUR` below loaded onto Today, the
  same `getElementsByTagName('*')` count): **2052 nodes** before this ticket
  adds anything, against the 1769 ceiling. The hidden Game screen alone is
  835 of them. The cold load itself measured **1660** in the same run's
  smoke table, which leaves **109 nodes** of room. Decision 9 says how the
  claim is read.
- **`state.js` is importable under `node --test`** with the small `document`
  stub `test/league-min.test.js` already uses.
- **Tests on the markup this replaces:** the smoke checks click
  `.today-game`, read `.today-game-lb` / `.today-game-when`
  (`today-and-back.mjs`), and click `#todayNewDay` / `#todayAddGame`
  (`today-keys-and-undo.mjs`).

## Decisions made in this spec without asking

The ticket was decided with the human; these fill in what it leaves open, in
the direction #18 already points.

1. **Strategy words in the summary.** The same two-or-three-word labels the
   Plan screen already shows under the strategy picker (`#stratnote`), read
   from one shared map so the two screens cannot disagree: `balanced` →
   `even minutes`, `minutes` → `minutes set by hand`, `closers` →
   `a group finishes`, `platoon` → `fixed fives`. (Review: a first draft
   invented its own wording, which differed from the Plan screen for three of
   the four strategies.)
2. **Summary order and plurals.** `<N> player(s) · <strategy words>`, then
   `evens out the day` for a later game with it on, then `<N> rule(s)` when
   there is at least one. No rules means no rules segment. Separator is
   ` · ` (space, U+00B7, space).
3. **One rule count.** A new `ruleCount(g)` in `state.js` counts each rule
   once, exactly as the rules list shows them, plus the league minimum when it
   is on. `renderConsCount()` uses it too, so the Rules badge and the pass
   never disagree. The badge's number changes for a starting five or a
   last-period five (1, not 5) and for an "always on" pair (now counted).
4. **A blocked pass has no mini rotation.** A blocked plan has no stints to
   draw. The status and summary still show.
5. **The mini rotation is a picture.** It is `aria-hidden="true"` and
   carries no names. The pass's accessible name says what it is; the game
   screen carries the names (K2's "a name is there too" is met one tap away).
6. **Passes paint only while Today is on show.** `renderTabs` skips the
   passes when `state.view !== 'today'`, and entering Today paints them.
   Editing a game does not rebuild four hidden pictures on every slider move.
7. **The pass keeps the `today-game` class** and `#todayAddGame` /
   `#todayNewDay` keep their ids, so existing smoke checks keep their hooks.
8. **New day in the header is a text button** reading `New day`, between the
   spacer and the gear. On a phone the header's right side is then New day and
   the gear: two actions, as C1 allows.
9. **What "within the DOM budget" means here.** The only DOM budget is the
   smoke row measured on the lean cold load, and #18 says it "still applies".
   A whole page with four games is already over it on `main` (Survey), so
   that cannot be the test. The test is: the nodes a four-game,
   twelve-player Today adds over the cold load's Today fit in the room the
   cold load leaves under the ceiling (item 10). No new number is invented;
   both sides come from the existing budget. This is flagged on the PR for a
   human to confirm.
10. **One element per mini-rotation row.** 109 nodes of room for four passes
    of twelve rows means about one node per row. Each row is a single
    element whose background is a `linear-gradient` with hard stops: player
    color where they are on the floor, transparent elsewhere, including the
    gaps between periods. The status dot is a `::before`, not a node.

## What would settle it

At 390×844, on a new smoke fixture `FOUR`: `RICH`'s team with **12 players**
(`RICH`'s 11 plus `['Kai Moreau', '10']` as `p11`) and **four games**, in this
order, booted with `view: 'today'`:

| # | label | when | setup | expected status |
| --- | --- | --- | --- | --- |
| 0 | `Panthers` | `9:00` | balanced, nobody out, no rules, `useCarryover: false` | Planned |
| 1 | `Ravens` | `11:30` | balanced, `p11` out, `useCarryover: true`, one pair (`p0`+`p1` together) and one starting five (`p0`–`p4`) | Planned |
| 2 | *(empty)* | `2:00` | `closers`, `useCarryover: false` | Planned |
| 3 | `Owls` | *(empty)* | balanced, a min of 40 for `p0` at 4×8 (more than the game) | Needs a fix |

1. **Order.** `#todayGames` holds four `button.today-game`, in day order.
   Inside `#view-today`, in document order: the four passes, then
   `#todayAddGame`, then `#todayTeam`, then `#todaySeason`. `#todayNewDay` is
   inside `#barToday`, and it is visible on Today and not on any other screen.
2. **Title.** Each pass's title text is `gameLabel(g, i)`: `Panthers`,
   `Ravens`, `Game 3`, `Owls`.
3. **Tip-off.** Passes 0–2 show `9:00`, `11:30`, `2:00`. Pass 3 shows no
   tip-off element.
4. **Status.** Passes 0–2 show the text `Planned` beside a dot whose computed
   `background-color` equals the computed value of `--ok`. Pass 3 shows
   `Needs a fix` beside a dot whose color equals `--warn`. No dot on any
   pass uses a player color or `--err`.
5. **Summary.** Exactly:
   - pass 0: `12 players · even minutes`
   - pass 1: `11 players · even minutes · evens out the day · 2 rules`
   - pass 2: `12 players · a group finishes`
   - pass 3: `12 players · even minutes · 1 rule`
6. **Mini rotation.** Passes 0–2 each have one mini rotation,
   `aria-hidden="true"`, with one row element per available player in roster
   order (12, 11, 12 rows). Every row is between 3px and 6px tall. Measured
   on **real pixels** (a CDP screenshot of the pass, decoded in the page onto
   a canvas): for every row and every stint `k` of
   `effectiveStints(g, plans[i])`, the pixel at the row's vertical middle and
   the horizontal middle of stint `k`'s slot is the player's color **if and
   only if** that player is in `onFloor` for stint `k`, and otherwise is the
   pass's background. "The player's color" is the pixel of a probe element
   painted with `background: colorOf(id)` in the same screenshot, within 3
   per channel. Between the last stint of one period and the first of the
   next there is a gap at least 2px wide where every row shows the pass's
   background. Pass 3 has no mini rotation.
7. **Opening.** Tapping pass `i` opens the Game screen with `activeGame ===
   i` and the header title `gameLabel(g, i)`.
8. **Accessible names.** Each pass is one `button` with no focusable element
   inside it. Its accessible name is exactly `Panthers, 9:00, planned`,
   `Ravens, 11:30, planned`, `Game 3, 2:00, planned`, `Owls, needs a fix`.
9. **Rule count.** `ruleCount(g)` counts: one per min and one per cap on an
   available player, one per together pair, one per apart pair, one per
   "always on" pair, one for a starting five, one for a last-period five, one
   for a rest limit, and one for the league minimum when it is above 0. A
   min or cap on an absent player does not count. `#conscount` shows the same
   number as `ruleCount(game())`.
10. **DOM budget** (decision 9). Let `cold` be the node count the smoke
    suite's `DOM nodes ≤ budget` row measured on this run's cold load,
    `coldToday` the number of elements inside `#view-today` on that same
    cold load, and `fourToday` the number inside `#view-today` with `FOUR`
    on Today. Then `cold + (fourToday − coldToday)` is at most
    `ceiling('nodes', budgets.json initialPayload.nodes)` (1769 today). The
    check prints all four numbers.
11. **Repaints.** On the Game screen, an edit that re-renders (`soon()` with
    `PLAN_ONLY`) does not replace the nodes inside `#todayGames`. After
    changing a game's plan and going back to Today, that game's pass shows the
    new plan (its summary and mini rotation match `plans[i]`).
12. **Fit.** At 320px with 32px root text, and across 320–390px, Today with
    `FOUR` has no horizontal overflow and nothing stranded above the
    viewport; the pass and `#todayNewDay` are touch targets of at least 44px.
13. `npm test` and `npm run smoke` pass. Every test or smoke state written
    against `.today-acts`, the red `.bad` dot, or the old
    `"<label>, <when>"` accessible name is updated or retired in the same
    change.

## Surfaces

Change:

- `app/teams-view.js`: `renderTabs` paints passes (only on Today).
- `app/state.js`: new pure exports `ruleCount(g)`, `passSummary(g, i)`,
  `passBlocks(g, p)` and `rowGradient(blocks, g, color)` (see Design).
- `app/game-setup.js`: `renderConsCount` uses `ruleCount`.
- `app/render.js`: entering Today paints the passes.
- `app/index.html`: `#todayNewDay` moves into `#barToday`; `.today-acts`
  holds only Add a game.
- `app/app.css`: pass styles; old `.today-game` row styles replaced.
- `app/sw.js`: `VERSION` bump and `SHELL` digest.
- `scripts/smoke/`: the `FOUR` fixture and a new check `game passes`;
  existing checks updated where they read the replaced markup; the 320px/32px
  and touch passes cover Today with `FOUR`.
- `test/`: a new `test/game-pass.test.js`; `test/league-min.test.js` and
  `test/game-format.test.js` re-pinned to `ruleCount`.
- `scripts/budgets.mjs`: widen `SLACK` bytes if the payload ceiling is hit
  (routine; say so in the comment).
- `docs/`: `architecture.md` / `README.md` where they describe Today.

Must not change: `engine.js`, `budget.js`, `storage.js`, `roster.js`, the
printed card (`card.js`, `card.css`), `scripts/budgets.json`, and anything
under `app/vendor/`.

## Constraints

- **The card does not change.** Nothing here touches the card's markup,
  fitting or print styles.
- **Mobile first.** Build and check at 390×844, then 320px and 32px root text.
- **The four pure modules are untouched.** The new helpers go in `state.js`.
- **No new module.** `requests` is pinned at 40 of 41; everything goes into
  modules already on the wire.
- **Precache bump.** A precached file changes, so bump `VERSION` in
  `app/sw.js` and set `SHELL` to the digest `npm test` names.
- **Reuse, do not re-derive:**
  - the label: `gameLabel(g, i)`;
  - the rotation: `effectiveStints(g, plans[i])` (so the pass matches the
    card after a bench-mode swap), never `p.stints` directly;
  - player color: `colorOf(id)`;
  - availability: `availIds(g)`;
  - the league minimum: `leagueMinutes()`;
  - status colors: `--ok` and `--warn` from `tokens.css`, not new hex values;
  - `ceiling()` from `scripts/budgets.mjs` and `budgets.json` for item 10,
    not a copied number;
  - the existing `reloadWithRecord` fixture loader and the smoke passes'
    shared helpers.
- **No animation of `left`/`width`.** Blocks are placed once per paint with
  percentages; nothing animates them.
- **Guidelines:**
  - **L1:** each pass is a surface (white on the gray ground, rounded).
  - **C6:** Team and Season stay rows at least 48px.
  - **K2:** player colors appear only in the mini rotation, and never as a
    status.
  - **K3:** Planned is `--ok`, Needs a fix is `--warn`; neither is a team
    color.
  - **A2:** the pass is named for what it opens (item 8).
- **Words:** `Planned`, `Needs a fix`, `evens out the day`, `New day`,
  `Add a game` (`CONTEXT.md`). The pass is not called a "tile" or "row" in
  copy.
- **Privacy claim** unchanged; no new copy makes an absolute upload claim.

## Design

```
Today (390px)
┌───────────────────────────────────┐
│ [Smoke Test ⌄]     [New day] [⚙]  │
│ Today                             │
│ ┌───────────────────────────────┐ │
│ │ 9:00                ● Planned │ │
│ │ Panthers                      │ │
│ │ ▬▬▬ ▬▬  │ ▬▬ ▬▬▬ │ ... (rows)  │ │
│ │ 12 players · even minutes     │ │
│ └───────────────────────────────┘ │
│ ┌ … three more passes …         ┐ │
│ [Add a game]                      │
│ Team    Smoke Test · 12 players › │
│ Season  3 games filed           › │
└───────────────────────────────────┘
```

- **`ruleCount(g)`** — `state.js`, beside `leagueMinutes`. Item 9.
- **`passSummary(g, i)`** — `state.js`. Returns the summary string of item 5,
  built from `availIds(g).length`, the strategy words (decision 1),
  `i > 0 && g.useCarryover`, and `ruleCount(g)`.
- **`passBlocks(g, p)`** — `state.js`. For an ok plan, returns one entry per
  available player, in roster order: `{ id, blocks }`, where each block is
  `{ period, from, to }` in minutes from that period's start. Consecutive
  stints on the floor in the same period merge into one block; a run never
  crosses a period. Built from `effectiveStints(g, p)`. Returns `[]` for a
  blocked plan.
- **`rowGradient(blocks, g, color)`** — `state.js`, pure. Turns one
  player's blocks into a `linear-gradient(to right, …)` string with hard
  stops. The row's width is split into one equal-per-minute track per period
  with a fixed gap between periods (the gap is a `calc()` or percentage the
  developer picks, at least 2px at 390px). Color where a block is,
  `transparent` everywhere else.
- **Rendering** — `renderTabs` builds, per pass, about seven elements plus
  one per row: a top line (tip-off, then the status text with its dot as a
  `::before`), the title, the mini rotation (one element per row, background
  from `rowGradient`), and the summary. Budget: `fourToday − coldToday` must
  stay under the room item 10 leaves (about 109 today). The
  accessible name is set with `aria-label`. When Today is not on show the
  passes are left as they are; `applyView` paints them when Today is entered
  from another screen.
- **Header** — `#todayNewDay` moves into `#barToday` as a text button; its
  handler (`startNewDay`) does not change.

## Proof

The seams `/tdd` builds at:

- **`node --test test/game-pass.test.js`** (new; imports `state.js` with the
  `document` stub from `test/league-min.test.js`). Exercises `ruleCount`,
  `passSummary`, `passBlocks` and `rowGradient` on hand-built games and
  plans: every row of item 9; the four summaries of item 5 plus the singulars
  (`1 player`, `1 rule`) and each strategy's words; `passBlocks` merging
  consecutive stints, splitting at a period change, leaving out absent
  players, following a bench-mode override, and returning `[]` for a blocked
  plan; `rowGradient` putting color exactly on a block's span, transparent
  across each period gap, and nothing else. Covers items 5, 6 (the model
  half) and 9.
- **`node --test test/league-min.test.js test/game-format.test.js`** —
  re-pinned so the badge reads `ruleCount` and `ruleCount` counts the league
  minimum and only player rules. These read source and are guards
  (`/new-guard`). Covers item 9's badge half.
- **Smoke, new check `game passes`** (`/new-guard`), on `FOUR` via
  `reloadWithRecord`: items 1–8, 10 and 11. It reads `plans`,
  `effectiveStints`, `colorOf` and `gameLabel` from `state.js` in the page
  and measures the pass geometry with `getBoundingClientRect` (not
  `getClientRects`). Item 6 is read from screenshot pixels against a probe
  painted with `colorOf(id)` (never a regex over `oklch()` or over the
  gradient string). Item 10 reads `cold` and `coldToday` from the cold load
  (the check's `setup` is `rich`, so `coldToday` is recorded by the cold-load
  evaluate in `smoke-checks.js` and passed through, or re-measured on a SEED
  reload — the developer picks, and says which). It must be seen failing
  against the current `main` markup before it passes.
- **Smoke, existing checks** — `today and back` and `today keys and undo`
  updated for the new header position of New day and the new accessible
  name; the touch, sweep and `app shell at 320px/32px text` passes include
  Today with `FOUR` loaded. Items 12 and 13.
- **`npm test`** — item 13.
- **`/browser-verify`** at 390×844, then 320px with 32px root text, light and
  dark: a screenshot of Today with `FOUR`; the mini rotation's period gaps;
  the status colors; tapping a pass and coming back.

## Out of scope

- The game screen's sentence and its sheets (#18's later tickets).
- The Resume bar (#34), wide-screen side by side (#35), first run (#36).
- Any change to what New day, Add a game or removing a game does.
- Animation of the mini rotation.
- Showing player names or numbers in the mini rotation.
