# #187 — Today card breaks team names mid-word at 320px and 32px text

## Issue

#187. On Today, at 320px wide with 32px text, a game's name on its card
(`span.pass-title`) breaks in the middle of a word ("Hawk" / "s"); it should
fit, shrink, move to its own line or end in "…" instead.

## Goal

A coach with large text on a small phone reads each game's opponent whole on
Today — "Panthers", not "Pant" over "hers" — and the card still looks like the
Today card it is at normal size.

## Survey

The issue's claims hold. What the tree says:

- **The rule that breaks the word** is `app/app.css:3568`, inside the
  `@media (max-width: 19em)` block (the large-text stage, `app.css:3376`):
  `.pass-title { white-space: normal; overflow-wrap: anywhere; }`. #66 added
  it so "Panthers" stopped showing as "Pant…"; `overflow-wrap: anywhere` is
  what now splits it.
- **Why nothing fits:** the title keeps its base size, `--fs-large`
  (`app.css:415-416`), which is 68px at a 32px root. The card's content box is
  184px at 320px (`.today-game` side padding `1.125rem` = 36px each,
  `app.css:391-393`). Measured in DejaVu Sans Bold at 68px: Hawks 241px,
  Ravens 265px, Panthers 327px, "Game" 211px, Owls 176px. Every fixture name
  but Owls is wider than the whole box, so every one of them splits.
- **Where it shows:** the card is rendered by `renderPass`
  (`app/teams-view.js:469-485`), text from `gameLabel` (`app/state.js:594`).
  It sits behind the team menu, bench mode, the shortcuts sheet and both add
  flows, which is why the sweep reports it in those states too.
- **Reproduced** by commenting out #187's `CLIP_SWEEP_KNOWN_ISSUES` entry
  (`scripts/smoke/clip-sweep.mjs:103-106`) and running
  `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`:
  55 problems, all `span.pass-title` "splits across lines mid-word" — Hawks
  and Ravens in `today`, `team menu open`, the five bench mode states,
  `shortcuts sheet`, `add a game, step 1/2/3` and `Add a team step 1`, and
  Panthers, Ravens and "Game" in `today, FOUR`, each at top and bottom. No
  other kind of problem on this element. File restored after.

## Decisions

These follow from the repo's rules and earlier specs. The one visible
trade-off (how small the title gets, and whether the card's padding gives
some room) is the human's; the recommended answer is written in.

- **Smaller type, not a mid-word break.** Only a smaller size can fit these
  names. At 184px, "Panthers" fits only at 38px or below. `docs/specs/24-text-size.md`
  decision 4 allows a `vw` cap (`.wel-h`'s `min(var(--fs-large), 15vw)`,
  `app.css:3430`) only on the three screen titles. It would also give
  off-scale sizes. So the title steps down to a token on the scale.
- **The step is headline (`--fs-headline`, 1.0625rem, 34px at a 32px root).**
  It is the largest step "Panthers" fits: 164px. The title step (44px) makes
  it 212px, still too wide. Headline still passes Today's hierarchy check
  (`scripts/smoke/today-and-back.mjs:162-175`: title ≥ tip-off, which is
  `--fs-secondary`, 28px).
- **The card's side padding drops to `.75rem` in the same block** (36px →
  24px a side, box 184px → 208px). At headline with the old padding,
  "Panthers" leaves 11% spare. `AGENTS.md` says a text row that fits with
  less than 15% spare is still the defect. With `.75rem` it leaves 21%, and a
  9-letter name like "Minnesota" fits whole too. Trimming padding inside the
  19em block has precedent: `.who-row`, `.actionbar` and `.bar` all do it.
  **Alternative:** the body step (`--fs-body`, 32px) with the padding left
  alone gives "Panthers" 16% spare. Then the title is the same size as body
  text. Recommended: headline plus `.75rem` padding.
- **A word too long for the line ends in "…", it does not break.** Drop
  `overflow-wrap: anywhere`. The base rule's `overflow: hidden;
  text-overflow: ellipsis` (`app.css:415`) then cuts off only a single word
  wider than the whole line. Checked in Chrome: "Minnesota Timberwolves"
  shows "Minnesota" / "Timberw…". The issue lists "ends in …" as allowed.
  Names made of shorter words still wrap between words.
- **Only inside the 19em block.** The same as #66, so 390px with 16px text
  is unchanged. At 16px text the block only applies below 304px.

## What would settle it

1. At 320px wide with a 32px root, in DejaVu Sans (smoke's forced font), no
   `.pass-title` word splits across lines. Seen on `RICH` (Hawks, Ravens),
   `FOUR` (Panthers, Ravens, Game 3, Owls) and every state
   `clip-sweep.mjs` walks.
2. #187's entry is gone from `CLIP_SWEEP_KNOWN_ISSUES`, and
   `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
   passes with no other entry added or widened.
3. At 320px/32px, every `FOUR` `.pass-title` is one line (height ≤ its
   line-height + 1px), is not ellipsized (`scrollWidth <= clientWidth`), and
   its longest word is ≤ 85% of its `clientWidth` (15% spare). Expected:
   computed font size 34px, card `padding-left`/`padding-right` 24px, title box
   208px, Panthers about 164px.
4. #66's checks still hold at 320px/32px: nothing on the card is ellipsized
   or clipped, the status stays inside the card's content edge, and Ravens'
   full summary reads whole (`pass-large-text.mjs`). The title is at least as
   large as the tip-off (`today-and-back.mjs`).
5. No regression at 390px with 16px text: `.pass-title` is still 34px
   (`--fs-large`), the card's side padding is still 18px (`1.125rem`), and
   every `FOUR` title is one line. `pass-large-text.mjs` item 2 and
   `game-passes.mjs` still pass.
6. It still looks right next to the prototype (`notes/mockups/prototype/`,
   `light-today.png` / `dark-today.png`) at 390px with 16px text: pixel-same
   as `main` on Today. No tab bar anywhere. Shown with screenshots at
   390px/16px and 320px/32px, light and dark.
7. `npm test` and `npm run smoke` pass.

## Surfaces

Change:

- `app/app.css`: in the `@media (max-width: 19em)` block only, the
  `.pass-title` rule at `:3568`. It keeps `white-space: normal`, drops
  `overflow-wrap: anywhere` and adds `font-size: var(--fs-headline)`. Also
  add `.today-game { padding-left: .75rem; padding-right: .75rem; }` beside
  it, and rewrite the comment at `:3560-3565` to say why.
- `app/sw.js`: `VERSION` and `SHELL`, via `npm run sw:bump`.
- `scripts/smoke/clip-sweep.mjs`: delete #187's `CLIP_SWEEP_KNOWN_ISSUES`
  entry (`:103-106`). If the #179 decision text there lists #187 as open,
  update it too.
- `scripts/smoke/pass-large-text.mjs`: item 3's one-line and 15%-spare
  assertions at 320px/32px.
- `test/clip-sweep-known-issues.test.js`: drop #187 from the list of entries
  it requires, since the entry is gone.
- This spec.

Must not change: `renderPass`, `gameLabel`, the `.pass-title` base rule, any
`.pass-*` or `.today-game` rule outside the 19em block, `tokens.css`, the
other `CLIP_SWEEP_KNOWN_ISSUES` entries, `CLIP_SWEEP_ALLOW` (do not
allow-list `.pass-title`), `APP_LARGE_TEXT_ALLOW`, the budgets.

## Constraints

- **Precache bump:** `app.css` is precached. Run `npm run sw:bump` (it sets
  `VERSION` and `SHELL`) and `npm run check:history` before pushing. Other
  worktrees (#188–#198) are bumping `sw.js` too; `npm run setup`'s merge
  driver clears a `VERSION`/`SHELL`-only conflict. After a rebase, run
  `sw:bump` again.
- **The 19em block's order:** it must stay after the 620px and 385px blocks.
  Several parallel issues (#188, #191, #196, #197, #198) are adding rules to
  this block. Keep this change next to the existing `.pass-*` lines so a
  rebase conflict stays small and easy to read.
- **Type scale:** `font-size` must be a `var(--fs-*)` token
  (`test/type-scale.test.js`). The `min(var(--fs-large), Nvw)` cap is for the
  three screen titles only (#24 decision 4), and this title is not one of
  them.
- **15% spare** (`AGENTS.md`, "Smoke forces CI's font on a Mac too"): a fit
  with less spare is the defect. That is why item 3 says 85%.
- **#66 stands:** wrap rather than truncate a name that fits. Truncation is
  only the fallback for a single word longer than the whole line.
- **Guidelines:** T2 (lay out for 200% text), T4 (headers may scale less than
  content), A4 (test with text turned up).
- **Mobile first, redesign matches the prototype:** 390×844 first. The
  prototype has no tab bar, and this adds none.
- **Reuse, do not re-derive:** `FOUR`, `RICH`, `reloadWithRecord`
  (`fixtures.mjs`), `LARGE_TEXT_PX`/`LARGE_TEXT_WIDTH` (`sizes.mjs`),
  `pass-large-text.mjs`'s own `MEASURE`/`setRoot`, and `WORD_RECTS_FN`
  (`row-stack.mjs`) if a per-word width is needed. Do not copy a literal
  `1.125rem` or `34px` into a check; read computed styles.
- **One issue:** do not touch `span.teammenu-nm` (#196), `span.nm` in bench
  mode (#191/#197), or any other known-issues entry, even though those states
  also show this card.

## Design

In `app/app.css`'s `@media (max-width: 19em)` block, replace

```css
.pass-title { white-space: normal; overflow-wrap: anywhere; }
```

with

```css
.today-game { padding-left: .75rem; padding-right: .75rem; }
.pass-title { white-space: normal; font-size: var(--fs-headline); }
```

Also update the comment above them. It should say: #66 wrapped the title; at
68px no fixture name fits the 184px box, so it broke mid-word (#187); the
title steps down to headline, and the padding gives it 208px, so the longest
fixture name keeps 15% spare; a single word longer than the line ends in "…"
through the base rule's ellipsis.

Remove #187's known-issues entry. Extend `pass-large-text.mjs` with item 3.
Bump the service worker.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| cut-off text sweep, #187 entry removed | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"` (red with the entry removed and the old CSS; green after) | 1, 2 |
| `pass-large-text.mjs` item 3 (one line, not ellipsized, longest word ≤ 85% of box) | its smoke row via `--only`. Must be seen red on `main`'s CSS (two lines), and red with headline but old padding (Panthers 89%), before it goes green | 3, 4 |
| `pass-large-text.mjs` items 1–2, `today-and-back.mjs` hierarchy, `game-passes.mjs` | their smoke rows via `--only` | 4, 5 |
| type-scale token rule | `node --test test/type-scale.test.js` | constraint |
| `SHELL` digest | `node --test test/sw.test.js`, `npm run check:history` | constraint |
| look check | `/browser-verify`: Today at 390×844/16px and 320px/32px, light and dark, next to `notes/mockups/prototype/light-today.png` and `dark-today.png`. Also a hand-typed "Minnesota Timberwolves" at 320px/32px showing "Timberw…", not a mid-word break | 5, 6, the fallback |
| the proof pair | orchestrator: `npm test`, then `npm run smoke -- --no-tests` | 7 |

Item 3's new assertion is a guard, so it is written under `/new-guard`.

## Out of scope

- A long name at 390px with 16px text. "Northwest Valley Thunderbirds"
  (`partPlayed`) is already ellipsized there by the base rule. #66 left this
  as a separate question, and it still is.
- `tokens.css`'s comment that `--fs-large` is "used by three screen titles
  only". `.pass-title` uses it too. That is a doc fix, not this bug.
- The team menu's own name (#196), bench mode names (#191, #197), and every
  other known-issues entry.
- Other widths or font sizes than 320px/32px and 390px/16px.
