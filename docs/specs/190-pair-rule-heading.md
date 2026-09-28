# #190 — A pair rule's heading runs off screen with a long name at 32px text

## Issue

#190. At 320px wide with 32px text, a pair rule's heading on the Plan sheet
(`p.plan-rule-sentence`) runs off the right edge when it names a player with
a long one-word name, so "Featherstonehaugh" shows as "Featherstoneh".

## Goal

A coach with large text who opens a rule on the Plan sheet can read the whole
rule, every letter of every name in it, even when a name is one long word.

## Survey

The issue's claims hold, with two corrections worth knowing before building.

- **The element and its CSS.** `openRuleDetail` builds the heading at
  `app/rules.js:277` (`el('p', 'plan-rule-sentence', item.text)`); its only
  CSS is `app/app.css:3090-3091`: `margin: 1.125rem 1.5rem 0;
  font-size: var(--fs-title); font-weight: 600; letter-spacing: -.01em`.
  Nothing lets a word break, so a word wider than the line sticks out, and
  the sheet's `overflow: hidden` (`dialog.bsheet`, `app/app.css:2319`) cuts
  it off. The class is shared by every rule kind, not only pairs.
- **Reproduced on this tree** (DejaVu Sans, #190's known-issues entry
  commented out):

  ```
  plan sheet, a pair rule@top: "Featherstonehaugh and Hana together" is 478px wide in a 284px box (p.plan-rule-sentence)
  plan sheet, a pair rule@bottom: "Featherstonehaugh and Hana together" is 478px wide in a 284px box (p.plan-rule-sentence)
  1 stale known-issue entry (never matched this run): #190
  ```

  The issue's "381px in 247px" was measured before #177 (a Mac font); the
  word itself is what is 478px: `--fs-title` is 1.375rem, 44px at a 32px
  root. The name is the short label of the fixture's `Featherstonehaugh
  Bartholomew` (`SQUEEZE_NAME`, `clip-sweep.mjs`).
- **The word cannot fit at any readable size, so it has to break.** The box
  is at most 284px. Even at `--fs-body` (32px here) the word is about 348px.
  To fit with the 15% spare `AGENTS.md` asks for it would need about 17px
  text, half the reader's own setting. The issue already allows this: "a
  long name may wrap or break, but no letters are cut off".
- **#179's check flags that break.** With `overflow-wrap: break-word`
  injected, the clip goes away and a new problem appears:
  `"Featherstonehaugh" splits across lines mid-word (p.plan-rule-sentence)`.
  The check only excuses a split word when the element sits inside a row
  from `ROW_LIKE` (`scripts/smoke/clip-sweep.mjs:290`, `.prow, .gm-p, .gm-b,
  .sn-row`) and the word is wider than that row can ever be. The heading is
  not in any of those, so it gets no excuse. The check has to learn that
  this heading is its own row (Design, part 2).
- **A generic excuse was tried and rejected.** "Excuse a split when the
  word is wider than the nearest clipping box" also excused #187's Today
  card team names ("Hawks" 241px in a 184px card) and left #187's entry
  stale. That would hide a real bug, and it is #187's lane. Keep the change
  scoped to this one element.
- **The sheet is 380px wide in this state, not 320px.** The game screen's
  info alert ("Best possible spread…", `#issues .alert.info`, #191's entry)
  pushes the layout viewport to 380px, so every sheet opened from the game
  screen is 380px wide (`innerWidth` 380, `visualViewport.width` 320). With
  that alert hidden, the heading's box is 224px, not 284px. The fix must hold
  at both, because #191 is being fixed in parallel. Measured with
  `break-word` and the alert hidden: 5 lines, the widest 214px, all inside
  the 224px box. Without the alert hidden: 4 lines, widest 265px, in 284px.
- **The Design below was tried as throwaway edits** (then reverted): with
  `break-word` injected and `.plan-rule-sentence` added to `ROW_LIKE`, the
  row's only remaining problem was the #190 entry itself going stale, with
  and without the alert hidden. Removing the entry is what turns it green.

## What would settle it

1. At 320px wide, 32px root text, DejaVu Sans, with the `LONG_AND_SQUEEZE`
   fixture (`LONG_NAME` plus `SQUEEZE_NAME`, `clip-sweep.mjs`), in the state
   `plan sheet, a pair rule`, at the top and the bottom: every line of
   `p.plan-rule-sentence` ends inside the sheet's box. The heading is
   allowed to break "Featherstonehaugh" across lines; no letter is hidden.
2. This holds both with today's 380px sheet and with the sheet at 320px
   (inject `#issues .alert.info { display: none; }` through
   `clipSweepPass`'s `injectCss` to get the second).
3. #190's entry is removed from `CLIP_SWEEP_KNOWN_ISSUES`, and
   `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
   is green: no problem naming `p.plan-rule-sentence`, and no stale entry.
4. At 390×844 with 16px text, the same state with the same fixture shows the
   heading with no word broken. "Featherstonehaugh" is about 239px at 22px
   in a 342px box, so it fits on one line. The rest of the smoke suite is
   unchanged.
5. The rule page still matches the prototype
   (`notes/mockups/prototype/light-sheet-rule.png`,
   `dark-sheet-rule.png`): same size, weight, and 24px side inset at 390px.
   No tab bar is added.
6. `npm test` and `npm run smoke -- --no-tests` pass.

## Surfaces

Change:

- `app/app.css` — the `.plan-rule-sentence` rule (line 3090).
- `app/sw.js` — `VERSION` and `SHELL`, via `npm run sw:bump`, because
  `app.css` is precached.
- `scripts/smoke/clip-sweep.mjs` — remove the #190 entry (lines 107-111),
  and add `.plan-rule-sentence` to `ROW_LIKE` (line 290) with a comment.
- `test/clip-sweep-known-issues.test.js` — line 18 lists 190 as a required
  entry; drop it from that list and the test's title.

Must not change: `app/rules.js` (the sentence text comes from `ruleItems`,
and #148's spec says not to build a second one), any other known-issues
entry, `CLIP_SWEEP_ALLOW`, `WORD_FLOOR_FN` in `dom.mjs`, and `span.nm` in the
plan sheet's rule pickers (#191's lane).

## Constraints

- **Precache bump.** `app/app.css` is precached, so run `npm run sw:bump`
  in the same change (`AGENTS.md` Traps), and `npm run check:history`
  before pushing.
- **Reuse the existing long-name fix.** `overflow-wrap: break-word` is
  already the answer for block-level name text: `.pident-name`
  (`app/app.css:3086`), `.sn-nm` (3772), `.sn-gt` (3833). Use it, not a new
  technique. `anywhere` is only needed when a flex item's min-content has to
  shrink (`.who-row .prow-t`); this is a plain block `p`, so `break-word`
  wraps the same way.
- **Put it on the base rule, not only in the `max-width: 19em` block.** It
  only acts when a word is wider than a whole line, so at 390px/16px it
  changes nothing. The same text can overflow at 390px with a long enough
  name, and `.pident-name` sets it on its base rule for the same reason.
- **Do not shrink the text or truncate it.** Smaller text undoes the
  reader's own setting and still would not fit (interface guidelines T2:
  lay out for 200%, rows grow). An "…" fails the issue: every letter must
  be visible.
- **Changing the check is a guard change: follow `/new-guard`.** Show that
  the `ROW_LIKE` change still fails the tree when it should (see Proof).
- **Mobile first, then the prototype.** Check 390×844 first. Screenshot the
  rule page next to `light-sheet-rule.png`.

## Design

1. **CSS.** Add `overflow-wrap: break-word;` to `.plan-rule-sentence`
   (`app/app.css:3090`). Extend its one-line comment: a long one-word name
   is wider than the sheet at a 32px root (478px against a 224-284px box),
   so it breaks rather than being cut off; same fix as `.pident-name`.
2. **The check.** Add `.plan-rule-sentence` to `ROW_LIKE` in
   `scripts/smoke/clip-sweep.mjs:290`. Comment why: it is a block alone on
   its own line in `#planSub`, so nothing beside it can take its room; its
   own box (the sheet's width less its fixed side margins) is the widest it
   can ever be. That makes it its own row, and the existing rule applies
   unchanged: a word wider than that row may split.
   The comment should also say the known weakness. If a later change
   narrowed the heading itself (a `max-width`), a split inside it would be
   excused too. The clip check still catches anything that is cut off.
3. **Remove #190's entry** from `CLIP_SWEEP_KNOWN_ISSUES`, and 190 from
   `test/clip-sweep-known-issues.test.js`'s required list.
4. `npm run sw:bump`.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| the cut-off text row | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`, green with #190's entry gone | 1, 3 |
| the same row at a 320px sheet | the same run with `injectCss: '#issues .alert.info { display: none; }'` passed to `clipSweepPass` (a throwaway edit, reverted, reported) — no problem naming `p.plan-rule-sentence` | 2 |
| `/new-guard` falsification | the row with #190's entry removed but the CSS fix reverted fails with the clip line above; the row with the CSS fix but without the `ROW_LIKE` change fails with the split line above. Both reported, then reverted | 1, 3 |
| the known-issues export's shape | `node --test test/clip-sweep-known-issues.test.js` | 3 |
| 390/16 and the prototype | `/browser-verify`: open the pair rule state at 390×844, 16px, with the fixture; one screenshot next to `light-sheet-rule.png`, and one at 320px/32px showing the broken name fully visible | 4, 5 |
| the proof pair | `npm test` then `npm run smoke -- --no-tests`, by whoever commits | 6 |

## Out of scope

- The 380px layout viewport caused by the game screen's info alert. It is
  #191's "Best possible spread" entry; this change must work with it fixed
  or not.
- `span.nm` in the plan sheet's rule pickers (#191), and any other rule
  page element.
- A generic "word wider than its clipping box" excuse in the check. It
  hides #187.
- The empty `cs.font` that `WORD_FLOOR_FN` reads for this element (Chrome
  cannot serialize its font shorthand, so the word measures about 304px at
  body text instead of 478px). Both numbers are wider than the heading's
  224-284px box, so the verdict does not depend on it. Fixing that
  measurement belongs to `dom.mjs`, which other checks share.
- Trimming the heading's 1.5rem side margins at a 32px root. It would break
  the name into two pieces instead of three, but the issue does not ask for
  it and it moves the heading off the prototype's inset.
