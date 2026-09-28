# #191 and #197 — A name that fits never breaks; a name that can't fit breaks instead of being cut off

## Issue

#191. A very long one-word name ("Featherstonehaugh") is cut off, or drawn
over other text, at 320px with 32px text: on the roster, in the plan's info
box, in Season's day totals, in the plan sheet's rule pickers and in bench
mode.

#197. Bench mode breaks short, ordinary names mid-word at the same size
("HANA", "MAXI", "THEO", "CASE", and "Lindqvist" after a swap), because the
rows leave the name too little room.

Shipped as one change because both are about the same elements (bench mode's
`span.nm` above all), and two branches would edit the same rules.

## Goal

A coach with their phone's text at 200% can read every player's whole name,
everywhere. An ordinary name is never split in the middle. A name too long for
any line on a phone this narrow wraps onto the next line rather than losing
its last letters.

## Decisions

The survey held up both issues' claims, with these corrections and findings.
Nothing here needs the maintainer: every change follows a rule the guidelines
already set (T2, "lay out for 200%: rows grow and side-by-side pieces stack")
or a fix this file already uses elsewhere.

- **One rule for both issues: the box gets the room, the word breaks only
  when it must.** `overflow-wrap` (either `anywhere` or `break-word`) only
  breaks a word that would otherwise run past its box. So in a box of fixed
  width the two values break in exactly the same places. #197 is not a wrap
  setting at all: the boxes are too narrow. #191 is the opposite: some boxes
  have no wrap setting, or are sized so they can never be narrower than the
  longest word.
- **#197's short names are in the "Next change" box, not the rows.** HANA,
  MAXI, THEO and CASE are the card's short names, shown in `.gm-next-col .nm`
  when the full names don't fit (`fitCallRows`, `app/gamemode.js:492`). At
  320px/32px the Off and On columns are 91px each; the names measure 92–98px
  in DejaVu Sans. "Lindqvist" is the floor row's `.gm-p .nm`: 218px wide in a
  209px box.
- **Bench mode's long name is in a bench row** (`.gm-b .nm`, `app/app.css:1251`),
  which has no `overflow-wrap` at all, so "Featherstonehaugh" paints 316px in
  a 243px box and `.gm-body` cuts it off.
- **Day totals must stack, not just wrap.** Only adding a wrap to the name
  was tried (injected CSS, below): "Jordan", "Casey" and "Maximilian" then
  break mid-word, because the name column is `min(4.8rem, 34vw)` = 109px at
  320px, about 80px after the dot. Those names already spill over the bar
  today; nothing flags it because the bar has no text. Stacking the name
  above the bar is the fix `.sn-list .sn-row` already uses at this size
  (`app/app.css:3471`).
- **The cut-off check needs to know three more rows.** Once the long word
  breaks, the check reports it as "splits across lines mid-word", because it
  only excuses an unavoidable split inside `.prow`, `.gm-p`, `.gm-b` and
  `.sn-row` (`ROW_LIKE`, `scripts/smoke/clip-sweep.mjs:290`). The alert, the
  day-totals row and the picker tile need the same excuse, judged by the same
  floor (`WORD_FLOOR_FN`): a word wider than its row's content box may
  split. This is the rule #179 already set, applied to three more rows. It is
  not a new tolerance.

## What would settle it

All at 320px wide, 32px text (`LARGE_TEXT_WIDTH`/`LARGE_TEXT_PX`), in DejaVu
Sans (smoke's forced font), on the check's own roster (`LONG_AND_SQUEEZE`:
`Maximilian Alexander Featherstone-Whitmore` and
`Featherstonehaugh Bartholomew`).

1. **Every problem below is gone.** These are the exact lines
   `--only "no cut-off text at 320px/32px text"` printed on `main` (4ed4d19)
   with the #191 and #197 entries switched off. 79 lines, 7 shapes:
   - `"Best possible spread with 11 players and" is 272px wide in a 272px box (span)`
     — the plan's info alert, in 24 states (games, tour, who's here, format,
     sub interval, plan sheet and its three rule states, card sheet, who's
     here long name, game screen on Card, stint by stint, first run steps
     1–3), top and bottom.
   - `"Featherstonehaugh Bartholomew" is 311px wide in a 311px box (span.prow-t)`
     — team, and paste sheet (12 names + a repeat), top and bottom.
   - `"Featherstonehaugh" is 272px wide in a 272px box (span)` — season, and
     season with a filed game open (day totals).
   - `"Featherstonehaugh" is 353px wide in a 266px box (span.nm)` — plan
     sheet: add a rule, a cap rule, a pair rule.
   - `"Featherstonehaugh Bartholomew" is 316px wide in a 243px box (span.nm)`
     — bench mode, plain, undo toast, swap picker, swap toast (`.gm-b .nm`).
   - `"HANA" / "MAXI" / "THEO" / "CASE" splits across lines mid-word (span.nm)`
     — the same four bench states (`.gm-next-col .nm`).
   - `"Lindqvist" splits across lines mid-word (span.nm)` — bench mode, swap
     toast (`.gm-p .nm`).
2. **The row is green with both entries removed.** The #191 and #197 entries
   are deleted from `CLIP_SWEEP_KNOWN_ISSUES`, `191` leaves the list in
   `test/clip-sweep-known-issues.test.js`, and
   `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
   passes. No other entry is edited, and no allow-list or sideways entry is
   added.
3. **An ordinary word never breaks, a too-long word always wraps.** No word of
   4 to 11 letters in the fixture breaks anywhere above. "Featherstonehaugh"
   may break, and where it does every letter is on screen inside its own row.
   The check's printed numbers must show that each excused split is a word
   wider than its row's content box (for example "Featherstonehaugh" wider
   than the day-totals row), not a squeezed box.
4. **The bench floor name keeps 15% spare.** `.gm-p .nm` is at least 251px
   wide at 320px/32px ("Lindqvist", 218px, plus 15%, the margin `AGENTS.md`
   asks of any text row). The Next change column is at least 113px (THEO, 98px,
   plus 15%). Measured and reported, not computed.
5. **No regression at 390×844, 16px text.** Nothing in this change applies
   there except the three wrap rules, which only act on a word wider than its
   whole box. Proven by the full smoke run, and by a before/after screenshot
   of bench mode, the roster, the plan sheet with a rule open, and Season, at
   390×844, which must look the same.
6. **Bench mode still matches the prototype.** `bench mode matches the
   prototype` and `bench mode: next change, scope control, no spill,
   reachable rows, Leave` stay green, with the Next change box's two
   columns still side by side at 390×844. No tab bar is added anywhere.
7. `npm test` and `npm run smoke -- --no-tests` pass, and
   `npm run check:history` passes before push.

## Surfaces

Change:

- `app/app.css` — the rules under **Design**, and the comments beside the
  rules they change (`.rrow .prow-t` at 1061 and its block comment above it;
  `.gm-p .nm`/`.gm-b .nm` at 1202/1251; the 32px-root bench comment at 3578;
  the `.dayrow` rule and comment at 3449–3456).
- `app/sw.js` — `VERSION` and `SHELL`, by `npm run sw:bump`.
- `scripts/smoke/clip-sweep.mjs` — delete the #191 and #197 entries; add
  `.alert, .dayrow, .plr` to `ROW_LIKE` and say why in its comment.
- `test/clip-sweep-known-issues.test.js` — drop 191 from the list it requires
  (the test name too).

Must not change: any `app/*.js` file; `WORD_FLOOR_FN` or anything else in
`scripts/smoke/dom.mjs`; any other `CLIP_SWEEP_KNOWN_ISSUES` entry;
`CLIP_SWEEP_ALLOW`, `CLIP_SWEEP_SIDEWAYS`; `APP_LARGE_TEXT_ALLOW`,
`LARGE_TEXT_ALLOW`; the budgets.

## Constraints

- **Precache bump.** `app/app.css` is precached: `npm run sw:bump` in the same
  commit (`VERSION` becomes `origin/main`'s plus one, `SHELL` the digest).
  Other lanes bump too; `npm run setup`'s merge driver clears that conflict,
  then run `npm run sw:bump` again after the rebase.
- **Names scale fully (T4).** Do not shrink a name's font to make it fit. The
  room comes from padding, stacking and wrapping.
- **Lay out for 200% (T2).** Side-by-side pieces stack at 32px text. Every
  size-only change goes in the existing `@media (max-width: 19em)` block
  (`app/app.css:3376`), which never fires at 16px text on any phone (19em is
  304px there). That block sits after the base rules, so equal specificity
  wins by source order (the trap its own `.sn-list .sn-row` comment names).
- **Reuse, do not re-derive:** the `.sn-list .sn-row` stack for day totals;
  the `.pident` comment's reasoning for why `min-content` alone brings the
  sideways cut back; `.gm-p .nm`'s existing `overflow-wrap: anywhere` for its
  sibling `.gm-b .nm`; `WORD_FLOOR_FN`'s floor for the three new rows.
- **No blanket tolerance.** Growing `ROW_LIKE` is allowed only because the
  floor it applies is unchanged: an excused split must be a word wider than
  its row's whole content box. It must still flag an ordinary name that
  breaks in a squeezed alert, day-totals row or tile (see Proof).
- **The check changes are a guard change.** Built under `/new-guard`: shown
  red against the broken tree before it is trusted green.
- **The welcome screen's bench demo shares these classes.**
  `onboarding.js`'s `benchFigure` builds `.gm-p`, `.gm-b` and `.gm-next-cols`
  on purpose, "to look identical". Its own `.wel-bench .gm-p` padding
  (higher specificity) is unaffected. The Next change stack applies to it too
  at 32px text, which is correct, since it copies bench mode.
- **One engine.** The roster fix rests on a flexbox rule: an item's automatic
  minimum width is its longest word, capped by its `max-width`. Chrome is the
  only engine measured here. Say so in the comment rather than claiming
  Safari.

## Design

All in `app/app.css`.

**Everywhere (all sizes), three wrap rules**, which only act on a word wider
than its whole box:

- `.gm-b .nm` gains `overflow-wrap: anywhere` (the same value as `.gm-p .nm`
  beside it).
- `.plr .nm` (the tile rule at 3247, the plan sheet's pickers) gains
  `overflow-wrap: break-word`. The add-a-game flow's tiles are unaffected:
  their name parts are `white-space: nowrap` with their own ellipsis.
- `.alert > span` gets `min-width: 0; overflow-wrap: break-word`. The span is
  a flex item next to `.ico`, and its default minimum width is its longest
  word, which is what pushes it past the edge.

**The roster (`.rrow .prow-t`, 1061):** replace `min-width: min-content` with
`min-width: auto; max-width: 100%; overflow-wrap: break-word`. `auto` is the
same floor as `min-content` (the longest word), and it is capped at the row's
width by `max-width`. So the level word still wraps under the name exactly as
before, and only a word wider than the whole row breaks. Tried with injected
CSS: the roster and paste sheet lines are gone, and the row's own split
excuse (`.prow`) covers "Featherstonehaugh".

Alternative, not chosen: `.pident`'s `flex: 1 1 12ch; min-width: 0`. It
drops the longest-word floor, so a 13-letter name would break beside the
badge instead of moving to its own line.

**At 32px text only, inside `@media (max-width: 19em)`:**

- Bench mode gutters: `.gm-body` and `.gm-p` side padding go to `.5rem` (the
  `.bar` in the same block already uses `.5rem`). `.gm-p .nm` grows from
  209px to about 254px; `.gm-b .nm` from 243px to about 269px.
- `.gm-next-cols { grid-template-columns: 1fr; }`. Off stacks above On, each
  column about 227px wide. `fitCallRows` then measures the wider column on
  its own and may show full names where it showed short ones. That is its
  job, not a change to it.
- Day totals: `.dayrow { grid-template-columns: minmax(0, 1fr) min(2.6rem, 20vw); }`,
  `.dayrow .nm { grid-column: 1 / -1; min-width: 0; }`, and the name span
  `min-width: 0; overflow-wrap: break-word`. The name gets the whole row;
  the bar and minutes share the line below. This replaces the three-track
  rule at 3456.

Update the comment at 3578: it says "Christopherson" (~196px) fits once the
avatar moves. That was measured before #177. In DejaVu Sans the room was
209px and "Lindqvist" alone is 218px.

**In `scripts/smoke/clip-sweep.mjs`:** `ROW_LIKE` becomes
`'.prow, .gm-p, .gm-b, .sn-row, .alert, .dayrow, .plr'`. Delete the #191 and
#197 entries.

The Understand pass tried exactly this set of changes with the check's own
`injectCss` hook, plus the `ROW_LIKE` change, with both entries removed. The
only line left was the two now-stale entries. That run is not proof; the
build runs it for real.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| the cut-off row | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`: red on the tree before the CSS change with both entries removed (the 79 lines above), green after | 1, 2, 3 |
| the grown `ROW_LIKE` can still fail | `clipSweepPass`'s `injectCss`, run and reported by the developer: (a) the fix with `.dayrow` left as three columns makes "Jordan", "Casey" and "Maximilian" fail as mid-word splits; (b) `.plr .nm { max-width: 4rem }` makes an ordinary tile name fail. Each red, then green without it | 3 |
| known-issues shape | `node --test test/clip-sweep-known-issues.test.js` | 2 |
| bench widths | `/browser-verify` at 320px/32px: `.gm-p .nm` and `.gm-next-col` widths, "Lindqvist" and THEO rendered widths, read from the page and reported | 4 |
| 390×844 looks the same | `/browser-verify`: before/after screenshots of bench mode, roster, plan sheet with a cap rule open, and Season | 5 |
| bench mode rows | `--only "bench mode matches the prototype"` and `--only "bench mode: next change, scope control, no spill, reachable rows, Leave"` | 6 |
| app shell at 32px (includes `row-stack`) | `--only "app shell at 320px/32px text"` | 5, 6 |
| the proof pair and history | `npm test`, `npm run smoke -- --no-tests`, `npm run check:history` | 7 |

## Out of scope

- **`WORD_FLOOR_FN` mis-measures bench mode's names.** It copies the element's
  `font` shorthand. Chrome returns an empty shorthand when
  `font-variant-numeric: tabular-nums` is set (inherited inside bench mode),
  so the word is measured in the page's default font. It measured
  "Lindqvist" as 134px when it paints 218px. The error runs toward flagging
  too much, never toward a false pass, so it does not block this change.
  File it as its own issue.
- The other lanes' problems: #187 (`span.pass-title`), #188 (small dialogs),
  #189 (`span.prow-t` "Lineup balance" in the plan sheet, a plain `.prow`, not
  `.rrow`), #190 (`p.plan-rule-sentence`), #195 (Timeline | Card), #196
  (`span.teammenu-nm`), #198 (`span.wel-nm`).
- Other widths or text sizes; the printed card.
