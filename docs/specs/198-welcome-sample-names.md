# #198 — Welcome screen breaks a sample name mid-word at 320px and 32px text

## Issue

#198. On the first-run welcome screen, at 320px wide with 32px text, the
sample player "Harper" is cut off ("Har…") in the plan demo's name column.
It should show whole.

## Goal

A coach with large text on a small phone opens Benchcard for the first time
and reads every sample player's name in the demo plan, whole.

## Survey

The issue's claims hold, with one correction and one finding.

- **The element.** `span.wel-nm`, built by `renderDemo()` in
  `app/onboarding.js:170`, one per demo row, named off `callNames` of
  `sampleRoster(9)`: Maya, Eli, Devon, Nia, Caleb, Harper, Silas, Jonah,
  Ruby. Harper is the widest.
- **The rules.** `.wel-nm` (`app/app.css:2152`) is footnote size, 600,
  `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. Its box is
  the grid column `var(--nmw)` of `.wel-row` (`app/app.css:2148`:
  `8px var(--nmw) minmax(0, 1fr) min(1.6rem, 13vw)`, `gap: .35rem`), and
  `--nmw` is `min(4.2rem, 30vw)` on `#welPanePlan` (`app/app.css:2137`). At
  320px, 30vw is 96px.
- **Correction: it does not wrap.** `nowrap` keeps it on one line; the name
  ends in "…". The check reports it twice, as a clip and as a split, because
  the ellipsis gives the word's `Range` more than one rect. The fix is the
  same either way: give the name the room.
- **Both states are the same element.** "first-run step 1, 12 names + a
  repeat" opens the first-run dialog over the welcome screen, and the check
  still sees the welcome rows behind it. One fix covers both.
- **Reproduced** with #198's known-issues entry commented out and all
  problems printed (`node scripts/smoke.mjs --no-tests --only "no cut-off
  text at 320px/32px text"`, DejaVu Sans):

  ```
  welcome screen, first run@top: "Harper" is 101px wide in a 96px box (span.wel-nm)
  welcome screen, first run@top: "Harper" splits across lines mid-word (span.wel-nm)
  welcome screen, first run@bottom: "Harper" is 101px wide in a 96px box (span.wel-nm)
  welcome screen, first run@bottom: "Harper" splits across lines mid-word (span.wel-nm)
  first-run step 1, 12 names + a repeat@top: "Harper" is 101px wide in a 96px box (span.wel-nm)
  first-run step 1, 12 names + a repeat@top: "Harper" splits across lines mid-word (span.wel-nm)
  first-run step 1, 12 names + a repeat@bottom: "Harper" is 101px wide in a 96px box (span.wel-nm)
  first-run step 1, 12 names + a repeat@bottom: "Harper" splits across lines mid-word (span.wel-nm)
  ```

  Nothing else failed.
- **Measured row at 320px/32px, DejaVu Sans:** the row is 206px wide:
  8px dot + 96px name + 26.8px track + 41.6px minutes + three 11.2px gaps.
  The name is 26px text. At 390px/16px the columns are
  `8px 67.19px 214.44px 25.59px`.
- **Finding, not this issue: the stint track is already gone at 320/32.**
  The 26.8px track holds eight cells plus 23px of fixed gaps, so each cell is
  0.77px wide. The demo's colored bars are invisible slivers on `main` today.
  That is not text, so the clip check cannot see it. It goes in a new issue
  (see Out of scope).
- **No prototype mockup.** `notes/mockups/prototype/README.md` lists first
  run among the features the prototype leaves out on purpose. So there is no
  PNG to match; the screen keeps its current look at 390px/16px, which is
  what "matching" means here. No tab bar is added.
- **Other rows.** `firstrun` (`scripts/smoke/first-run-flow.mjs:118`) only
  counts `.wel-row`s. `applargetext` covers both states for sideways
  overflow. Nothing else reads `--nmw` or `.wel-nm`.
- **Overlap with #191/#197:** none. Their bench-mode names (`span.nm`,
  including `.wel-bench .gm-p .nm` in the welcome screen's "On screen" tab)
  are other elements. The "On screen" tab is hidden in both states, so the
  check never scans it. A #197 fix to `.gm-p .nm` may reach that tab, but
  not `.wel-nm`.

## What would settle it

1. At 320px wide and 32px root text, in DejaVu Sans, in both
   "welcome screen, first run" and "first-run step 1, 12 names + a repeat",
   every `span.wel-nm` shows its whole name with no "…". "Harper" (101px)
   sits in a name column of at least 116px (101px plus 15%). With the
   design below it is 118px.
2. #198's entry is removed from `CLIP_SWEEP_KNOWN_ISSUES`
   (`scripts/smoke/clip-sweep.mjs`), and
   `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"`
   passes. Leaving the entry in must fail as a stale entry (#198). This was
   checked during the survey with the CSS below injected:
   `1 stale known-issue entry (never matched this run): #198`.
3. No change at 390px/16px: `.wel-row`'s computed columns stay
   `8px 67.19px 214.44px 25.59px` and the plan demo looks as it does on
   `main`. The rule lives only in the `@media (max-width: 19em)` block, which
   never matches at 16px text on any phone.
4. The minutes ("16", "20") and the dot stay on the row, whole. No new
   sideways pan: the "app shell at 320px/32px text" row stays green.
5. Full `npm test` and `npm run smoke -- --no-tests` pass.

## Surfaces

Change:

- `app/app.css`: in the existing `@media (max-width: 19em)` block
  (`app/app.css:3376`), next to `.wel-qs { display: none; }`.
- `app/sw.js`: `VERSION` and `SHELL`, by `npm run sw:bump` (`app.css` is
  precached, `app/sw.js:45`).
- `scripts/smoke/clip-sweep.mjs`: delete the #198 entry. Nothing else in the
  file changes.
- `docs/specs/198-welcome-sample-names.md`: this spec.

Must not change: `app/onboarding.js`, the sample cast in `app/roster.js`,
`.wel-nm`'s font size (footnote is the smallest step, T3), the base
`#welPanePlan { --nmw }` and `.wel-row` rules outside the 19em block, and
any other known-issues or allow-list entry.

## Constraints

- **Mobile first.** The 390px/16px demo is unchanged (item 3).
- **Big text is fixed in the 19em block**, the pattern that block already
  uses for this screen (`.wel-go`, `.wel-cap`, `.wel-qs`, `.wel-in`,
  `.wel-h`). Its em query fires only when text is large.
- **T3/T4:** the name stays footnote size. It gets more room; it does not
  get smaller.
- **Do not excuse it instead.** Adding `.wel-nm` to `CLIP_SWEEP_ALLOW`
  (it does end in "…") would turn the check green without fixing anything.
  The issue asks for the whole name.
- **Measured in CI's font.** Smoke draws in DejaVu Sans on a Mac too (#177),
  so the 101px is CI's width. The 15% margin in item 1 is AGENTS.md's.
- **Precache bump:** `npm run sw:bump` in the same commit as the CSS.
- **Reuse, do not re-derive:** `--nmw` stays the one number for the name
  column; the fix sets it again rather than adding a second width.

## Design

Two lines in the existing `@media (max-width: 19em)` block, with a short
comment:

```css
#welPanePlan { --nmw: min(4.2rem, 37vw); }
.wel-row { column-gap: .15rem; }
```

At 320px this makes the name column 118px (was 96px). The three gaps drop
from 11.2px to 4.8px, which pays for most of it. The track goes from 26.8px
to 23.6px. It was already invisible at this size (0.77px cells), so the demo
loses nothing it showed before.

Measured with this CSS injected at 320/32: columns
`8px 118.39px 23.63px 41.59px`, "Harper" whole, the clip check green with
only #198's entry stale. At 390/16 the columns were unchanged.

At other large-text sizes: 360px/32px gives a 133px column (was 108px), and
390px/32px stays at the 4.2rem cap, 134px.

**Alternative considered: stack the row at 19em** (name and minutes on one
line, the track full width underneath, `.wel-show` raised to `15rem`). Tried
with injected CSS: it also clears #198 and brings the colored bars back
(24px cells). But it is a redesign of the demo at large text, the rows need
more space between them to read as pairs, and it fixes a problem the issue
does not name. It belongs to the new issue about the track, not here.

**Also considered:** widening `--nmw` without tightening the gaps. That
leaves the track 6.8px, less than its own 23px of fixed gaps, so the cells
would spill into the minutes. Rejected.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| clip check, #198's entry removed | `node scripts/smoke.mjs --no-tests --only "no cut-off text at 320px/32px text"` | 1, 2 |
| stale-entry guard still bites | the same row with the entry left in, before deleting it: must fail naming #198 | 2 |
| large-text overflow | `node scripts/smoke.mjs --no-tests --only "app shell at 320px/32px text"` | 4 |
| 390/16 unchanged, and the name whole at 320/32 | `/browser-verify`: computed `.wel-row` columns at 390/16 and 320/32, plus a screenshot of the plan demo at both (DejaVu Sans forced, as smoke does) | 1, 3, 4 |
| the proof pair | `npm test` then `npm run smoke -- --no-tests` | 5 |

No new guard. The clip check already fails on this bug and on a stale entry.

## Out of scope

- The stint track at 320px/32px, whose eight cells are under a pixel wide
  on `main`. To be filed as its own issue; stacking the row (above) is the
  likely fix.
- Bench-mode names, including the welcome screen's "On screen" tab (#191,
  #197).
- Any other known-issues entry.
