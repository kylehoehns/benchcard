# #244: the welcome logo is orange

**Issue** — #244. The Benchcard logo on the welcome screen is white or black.
It should be orange, like the logo on About and Advanced.

**Goal** — someone opening Benchcard for the first time sees the same orange
logo the public pages show.

**What would settle it**

1. `.wel-mark circle` paints the Hardwood tint in light, dark and both
   more-contrast modes: #D2500A, #FF7A2A, #993A07 and #FF853B.
2. Its lines are `#F4F4F6`, as on `about.html`.

**Surfaces** — `app/index.html` (the welcome lockup's SVG),
`scripts/smoke/hardwood-pages.mjs` and `scripts/smoke/team-color.mjs`. Not `about.html` or `advanced.html`.

**Constraints** — the precache bump (`npm run sw:bump`). Use `--tint`, the
token the orange phrase already uses, and not a Hardwood literal.

**Design** — the circle's fill goes from `var(--accent)` to `var(--tint)`.

This reverses one line of #25's team-color rule, which listed "the logo in
`index.html`" among the things that never take the team color. That list was
written before Hardwood became the default (#231). The welcome screen only
shows when there is no team, and then the tint is Hardwood, so in practice the
logo is always orange. `team-color.mjs` moves the logo from its "unchanged"
list to its "tinted" list, next to the phrase.

**Proof** — the smoke row "welcome, about and advanced carry the Hardwood
orange" reads the circle's fill through the canvas and compares it with each
mode's expected orange. On the old markup it reports 4 problems.

**Out of scope** — About and Advanced's hard-coded `#D2500A`, which stays the
same in dark mode.
