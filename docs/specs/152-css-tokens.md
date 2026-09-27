# #152 — Remove dead CSS and add spacing, layer and radius tokens

## Issue

#152: delete the dead rules the redesign left in `app/app.css`, close the gap
in the dead-class guard that let them survive, and give spacing, layers and
radii tokens so the literals stop drifting.

## Goal

A coach sees nothing change. The next person editing `app.css` finds one place
for each spacing step, layer and radius, and a file that is mostly rules rather
than change history.

## What would settle it

1. **Dead rules gone.** From `app/app.css`: the `.switch` family (the `.switch`,
   `.switch input`, `.switch input::after`, `.switch input:checked`,
   `.switch input:checked::after` rules, and `.switch { min-height: 48px; }` in
   the coarse-pointer block), `td.num`, `.block-hd h3`, and `.block-hd .hint`.
   `.rulechips` / `.rchip` are already gone (#150); nothing to do there.
   `app/advanced.html` keeps its own `.switch` copy — it does not load
   `app.css`.
2. **`#dayhint` checked.** `#dayhint` is a `span.hint` outside `.block-hd`, so
   `.block-hd .hint` never styled it. After the removal, a screenshot of Today
   with a day that has games shows `#dayhint` unchanged from `main` (it is
   styled today by whatever rules match it outside `.block-hd`; if the removal
   changes its computed `font-size`, `color` or `margin-left`, that is a
   defect).
3. **Dead-class guard.** `test/dead-class.test.js` counts a class as used only
   by pages that `<link>` `app.css` (today: `index.html`), plus the `app/*.js`
   it already scans. It is shown red on `main`'s tree (before the removal):
   it must name `switch` and `num`/`block-hd` children that the removal then
   deletes. The spec's green state is the same test after the removal.
4. **Tokens in `app/tokens.css`:**
   - spacing `--sp-1: 4px` `--sp-2: 8px` `--sp-3: 12px` `--sp-4: 16px`
     `--sp-6: 24px` `--sp-8: 32px` (L6's scale);
   - layers `--z-bar: 50` `--z-actionbar: 60` `--z-gm: 200` `--z-toasts: 250`
     `--z-tour: 310` `--z-modal: 320` (names may be adjusted to what each
     layer is), each with the value it has today so nothing restacks;
   - radius: the existing `--r-*` scale stays; a literal radius that has no
     equal on the scale (9px, 7px, 3px, 2px, 1px) either gets a named token or
     keeps its literal with a one-line reason on the same line.
5. **Every `z-index`, `border-radius` and color literal in `app.css` uses a
   token, or carries a one-line reason.** Colors: hex, `rgb()`/`rgba()`
   literals outside comments. z-index `-1`, `1`, `2`, `5` inside a component's
   own stacking context may stay literal with a reason. A test (named seam,
   `/new-guard`) scans `app.css` outside comments and fails on a literal
   `z-index` above 5, a hex/rgb color, or a `border-radius` px literal that has
   no reason comment on its line; shown red by planting one of each.
6. **Inline `style=` margins in `app/index.html` move to classes.** Today:
   `margin:0`, `margin:0 0 .9rem`, `margin-top:1.4rem`, `margin-bottom:1.1rem`,
   `margin-bottom:.9rem`. Each class keeps the same value (no visual change);
   using `--sp-*` where the value is on the scale. The noscript
   `style="max-width:34rem;...border-radius:16px..."` block is left inline (it
   renders with no stylesheet guaranteed) but its `16px` may become
   `var(--r)`. `style="max-width:820px"` and `style="color:var(--accent)"` are
   not margins and are out of scope.
7. **`--faint` merged into `--muted`.** They differ by 1–2 levels per channel
   in every theme (light `#6C6C72`/`#6B6B73`, dark `#98989F`/`#96969C`,
   light-more `#4F4F54`/`#4F4F55`, dark-more both `#BCBCC0`). Every
   `var(--faint)` in `app/` (app.css 23, about.html 8, advanced.html 6) becomes
   `var(--muted)`, and `--faint` is deleted from `tokens.css`. Contrast tests
   keep passing.
8. **Comments trimmed.** `app.css` is 303,475 bytes today. Keep a comment only
   where it explains a non-obvious *why* (a browser quirk, a constraint another
   file depends on, a number that must not change). Delete change history,
   restated issue narratives, and comments that say what the next line says.
   The PR states the byte count before and after, and the comment share
   before and after.
9. **No visual change.** `npm test` and `npm run smoke` pass. A screenshot set
   of the same states on `main` and on the branch (390×844 light and dark,
   320px at 32px text: Today with a day, Team, a game's plan, bench mode, the
   Rules page, How it works) is pixel-compared; the only differences allowed
   are text that used `--faint` shifting by ≤ 3 per channel.

## Surfaces

Change: `app/app.css`, `app/tokens.css`, `app/index.html`, `app/about.html`,
`app/advanced.html` (the `--faint` swap only), `scripts/charts.mjs` and the
regenerated chart pages if they reference `--faint`, `app/sw.js` (precache
bump), `test/dead-class.test.js`, one new guard test, any test that names
`--faint` or a removed selector.

Must not change: the four pure modules (`engine.js`, `budget.js`,
`storage.js`, `roster.js`), the card's print styles' output, any copy.

## Constraints

- Precached files change: bump `VERSION` in `app/sw.js` and set `SHELL` to the
  digest `npm test` names.
- The six chart pages are generated by `scripts/charts.mjs`; edit it and run
  `npm run charts`.
- `about.html` changing means its "Last updated" dateline must be today's date;
  `npm run check:history` checks it.
- Reuse `app/trap.js`'s dependency on `#confirm` at 320: the `--z-modal` token
  must keep 320, and `trap.js`'s comment names the token.
- Do not change the value of any spacing, radius or z-index while tokenizing:
  a token takes the value that is there. Moving `app.css`'s 62 rem spacing
  values onto the 4/8/12/16/24/32 scale would change the layout and is out of
  scope.
- American spelling.

## Design

Tokens are added to the `:root` block of `tokens.css` next to the existing
`--r-*` line. `app.css` swaps literals for `var(--…)`. Comment trimming is a
separate pass after everything else is green, so a test that reads a comment
fails on its own commit-worth of change.

## Proof

- `test/dead-class.test.js` (existing seam, extended): items 1 and 3; red on
  the pre-removal tree.
- New source-reading guard `test/css-literals.test.js` (named seam,
  `/new-guard`): item 5; red by planting a hex, a `z-index: 400` and a
  `border-radius: 6px`.
- `test/contrast.test.js` and `test/graphite-tokens.test.js` (existing): item 7.
- Full smoke suite (existing): item 9's "smoke passes".
- `/browser-verify` by the orchestrator: items 2 and 9's screenshot compare,
  and item 6 (spot-check each moved margin measures the same).
- Byte counts in the PR: item 8.

## Out of scope

- Moving the rem spacing values onto the scale.
- Rules that never matched in smoke but belong to states smoke doesn't visit
  (hover, landscape, drag, the install toast).
- `about.html` and `advanced.html`'s own copies of app classes.
