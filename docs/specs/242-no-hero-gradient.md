# #242: no gradient behind the headline

**Issue** — #242. Remove the soft orange gradient at the top of the welcome
screen, About and Advanced.

**Goal** — the top of those three pages is the plain page color. The owner
decided the gradient did not look right, after #240 moved it up under the top
bar.

**What would settle it**

1. On the welcome screen (`.wel-hero`), About and Advanced (`.hero-band`), in
   light, dark and both more-contrast modes, the headline's block has
   `background-image: none`.
2. On all three, the h1 still sits at least 16px inside its block's top edge,
   so the headline does not move up against the top bar.
3. The orange button, links and phrase from #231 are unchanged.

**Surfaces** — `app/app.css` (`.wel-hero`), `app/about.html` and
`app/advanced.html` (`.hero-band`), `scripts/smoke/hardwood-pages.mjs`, and
the docs that described the band. Not `tokens.css`: `--tint-soft` is used
elsewhere.

**Constraints** — the precache bump (`npm run sw:bump`).

**Design** — delete the `radial-gradient` backgrounds, plus `.wel-hero`'s
`border-radius`, which only shaped the gradient. `.hero-band` keeps
`padding-top: 1.6rem` and `h1 { margin-top: 0 }` from #238, so the h1 stays
26px below the top bar.

**Proof** — the smoke row "welcome, about and advanced carry the Hardwood
orange" covers items 1–3. Its old "painted band" check becomes "no
background-image", and the #238 gap check goes, because there is no painted
edge left to line up.

**Out of scope** — any other use of `--tint-soft`.
