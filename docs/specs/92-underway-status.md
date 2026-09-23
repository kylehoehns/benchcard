# #92 — A part-played game's card still says "Planned"

## Issue

#92. When a game is part-played, the Resume bar offers it, but that game's
card on Today still reads "Planned". The card's status should know a game can
be underway.

## Goal

A coach who comes back to Today mid-game sees the same answer twice: the Resume
bar says the game is underway, and so does that game's card. A game that has not
started still reads "Planned". A game whose plan is blocked still reads "Needs a fix".

## Decisions

The issue is unlabelled. The survey held up the defect but not its pointer.
Nothing here is the maintainer's to decide, because the glossary and the tree
answer each question:

- **The status lives in `app/teams-view.js`, not `app/render.js`.** The issue
  names `passStatus` in `render.js`. Today it is `passStatusEl(ok)` in
  `teams-view.js`, and it answers only `plans[i].ok`. Two places use it: the
  Today card (`renderPass`) and the game screen's sub line (`renderTabs`,
  #69 decision 5). Both get the third state, because the issue asks for the
  status to be decided in one place.
- **The word is "Underway".** The glossary's term is **Part-played game**, and
  its `_Avoid_` list rules out "in progress" and "live game". "Part-played" is
  a docs term, not a coach's word. `resumeAt`'s own comment in `app/card.js`
  already calls this state "underway". The card's aria-label uses the
  lowercase word, as it does for the other two states.
- **The dot is `--accent`.** The timeline's "the game is here" line
  (`.tl-now` in `app/app.css`) already marks a part-played game with
  `--accent`. `--ok` would read as "planned, all fine", and `--warn` would read
  as a problem.
- **"Needs a fix" wins over "Underway".** `resumeAt` already returns null for a
  blocked plan, so a blocked game can never read "Underway".
- **Underway means `resumeAt` answers for the game.** That is the same test the
  Resume bar uses (`resumeBarAt` calls `resumeAt` for each game). Stint 0 and
  the last stint are not underway. `resumeAt` owns that rule and it is not
  restated.

## What would settle it

1. A pure `passStatus(p, g)` exported from `app/card.js` returns:
   - `{ word: 'Underway', cls: 'now' }` when `resumeAt(p, g)` is not null;
   - `{ word: 'Planned', cls: 'ok' }` when `p.ok` is true and the game is not
     underway (this includes `live.at` of 0 and the last stint);
   - `{ word: 'Needs a fix', cls: 'warn' }` when there is no plan or `p.ok` is
     false, even when `live.at` points mid-game.
2. For a game the Resume bar offers, its Today card's `.pass-status` reads
   `Underway` and carries class `now`. Its dot's computed color equals
   `--accent`. The card's aria-label ends `, underway`.
3. With that game open, the game screen's sub line status reads `Underway`.
4. The other cards in the same fixture keep today's status: `Planned` with the
   `--ok` dot, and `Needs a fix` with the `--warn` dot. Their aria-labels are
   unchanged.
5. At 320px with 32px text, the Underway card's top row is not clipped, and
   the page does not scroll sideways.
6. `npm test` and `npm run smoke` pass. The smoke checks that assert "Planned"
   (`scripts/smoke/game-passes.mjs`, `scripts/smoke/game-title.mjs`) keep
   passing, and one smoke check covers item 2.

## Surfaces

Changes: `app/card.js` (new `passStatus`), `app/teams-view.js`
(`passStatusEl` and the aria status word both read `passStatus`), `app/app.css`
(one rule: `.pass-status.now::before { background: var(--accent); }`),
`app/sw.js` (`VERSION`, `SHELL`), tests and smoke checks.

Must not change: `resumeAt`, `resumeBarAt`, the Resume bar's text, the
timeline's `.tl-now`, and how a plan is solved.

## Constraints

- **Reuse, do not re-derive:**
  - "Underway" is `resumeAt(p, g) !== null`. Do not re-check `live.at` or the
    stint count in the new function.
  - `passStatusEl` stays the one place that builds the status element. The card
    and the game screen both call it. Pass it the result of `passStatus`, or have
    it call `passStatus`. Do not add a second element builder.
  - The aria-label's status word comes from the same `passStatus` result
    (`word.toLowerCase()`). Do not keep a second ternary.
  - When calling `resumeAt` for a game that is not the active one, pass the
    plan explicitly (`dayPlans[d][i] ?? null`). The `resumeBarAt` comment in
    `card.js` says why: an `undefined` plan falls back to the active game's.
- **Precache bump:** `card.js`, `teams-view.js` and `app.css` are precached.
  Bump `VERSION` in `app/sw.js` and set `SHELL` to the digest `npm test` names.
- **Mobile first:** "Underway" is shorter than "Needs a fix", so nothing new
  should overflow. The browser check still looks at 320px with 32px text.
- **Color:** use the `--accent` token, never a hex value.

## Design

- `card.js`: `export function passStatus(p, g)` returns `{ word, cls }` as in
  item 1. It uses `resumeAt(p ?? null, g)`.
- `teams-view.js`: `passStatusEl(s)` builds `span.pass-status.<cls>` with
  `word`. `renderPass` computes `passStatus(dayPlans[d][i] ?? null, g)` once.
  It uses that result for the element and for the aria-label. `renderTabs`'s sub
  line does the same with `plans[i] ?? null` and `game()`.
- `app.css`: a `.pass-status.now::before` rule next to `.ok` and `.warn`.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `passStatus` over real plans (the way `test/resume-bar.test.js` builds them) | `node --test`, a new `test/pass-status.test.js` | 1 |
| Today card and game-screen sub line for a part-played game, dot color read from the class rule | `npm run smoke`, a check in `scripts/smoke/game-passes.mjs` (or a sibling module) | 2, 3, 4 |
| existing pass and title checks unchanged | `npm run smoke`, `game-passes.mjs`, `game-title.mjs` | 4 |
| `/browser-verify` on the preview at 390×844 and 320px/32px | preview | 2, 3, 5 |

## Out of scope

- Showing where the game is (for example "Q2 4:00") on the card. The Resume bar
  already says it.
- Any change to when a game counts as underway.
