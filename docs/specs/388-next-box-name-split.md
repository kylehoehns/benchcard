# #388: the Next change box splits a long name mid-word

**Issue** — #388. In bench mode at 390px and 16px text, the Next change box
broke "Featherstonehaugh" into `Featherstonehau` / `gh`; make `fitCallRows`
agree with the drawn width.

**Goal** — The line a coach shouts never shows a name broken in the middle.
Either the whole name fits on one line, or the box drops to short names.

**What would settle it** (the issue's acceptance):

1. In bench mode at 390px and 16px text, with "Featherstonehaugh" coming on
   next (the `LONG_AND_SQUEEZE` record, the `bench mode, undo toast` state),
   the Next change box shows either the whole name on one line or the short
   names. No word is split.
2. `scripts/look.mjs --view "bench mode, undo toast" --widths 320,390 --font
   16,32` reports no `split span.nm`.

**Survey** (answers the issue's open question):

- Cause: `fitCallRows` (`app/gamemode.js`) read the computed font of the
  first row only, which is an Off name. `app/app.css` gives Off names weight
  500 and On names weight 600, so every On name was measured at 500 and
  drawn at 600.
- Smoke font or real phone font: the bug is in both, but only the smoke font
  makes this name split. The smoke font (DejaVu Sans) has only a 400 and a
  700 face, so 500 draws in Book and 600 in Bold, a big jump (about 150px
  measured against about 172px drawn, in a 161px column). With the Apple
  system font in Chrome on macOS, "Featherstonehaugh" at 16px is 144.4px at
  weight 500 and 148.0px at 600. That is the same error, only 3.6px, so this
  name fits on a phone either way. A longer name could still hit it.

**Surfaces** — `app/gamemode.js` (`fitCallRows` only), `app/sw.js` (bump),
`scripts/smoke/clip-sweep.mjs` (one more cell). Not `app/app.css`, not
`buildNextCols`, not the 1px slack, not onboarding's demo (it never shrinks).

**Constraints** — `gamemode.js` is precached: `npm run sw:bump`. The guard
change follows `/new-guard` (it must fail on the unfixed tree). Reuse
`openState`, `CLIP_PROBE`, `findingsOf` and the `CLIP_STATES` entry by name;
do not copy the state's open/close.

**Design** — `fitCallRows` measures each name in its own span's computed
font (weight, size, family, letter-spacing). The rest stays: the whole box
drops to short names together, and it re-runs once fonts load.

**Proof** — Smoke, the `no cut-off text at 320px/32px text` row
(`clipSweepPass`). After its 320px/32px walk it lands `LONG_AND_SQUEEZE` at
390px/16px and sweeps `bench mode, undo toast` top and bottom (item 1). Red
on the unfixed tree: `"Featherstonehaugh" splits across lines mid-word
(span.nm)` at 390px/16px, top and bottom. Item 2 is a `look.mjs` run by
whoever ships it.

**Out of scope** — Sweeping every state at 390px/16px. The lane started
small and moved to the full lane when the diff passed 20 lines (19 added,
11 removed outside `test/` and `docs/`).
