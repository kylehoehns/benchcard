# #137 — The header chips read in light mode

## Issue

#137: in light mode the round header chips (back, gear, "+", share) and the
team-name pill on Today nearly vanish, because their fill (`--surface-2`,
#F6F6F8) is almost the page color (`--bg`, #F4F4F6).

## Goal

A coach on a sunny sideline can see where the back button, the gear, "+",
share and the team pill are, in light mode, the way the prototype draws them:
a pale gray disc with a dark icon. Dark mode looks exactly as it does today.

## Decided (owner, on the issue)

The issue asked for 3:1 between the chip fill and `--bg`. The owner chose the
prototype's gray instead: the chip fill in light mode is the segmented
control's track color, #E8E8ED (about 1.1:1 against `--bg`). The chip is
found by its dark icon, which sits on that gray at about 14:1, and that is
what a test pins. Dark mode is unchanged.

## What would settle it

1. Light mode: `#backBtn .i`, `#shareBtn .i`, `#settingsBtn .i`, `#teamAdd .i`
   and `#teamBtn` fill from a chip token whose light value is #E8E8ED (the
   same color as `--seg-track`), still mixed 72% with transparent and still
   blurred, as today.
2. Dark mode: the same five paint exactly what they paint on `main` —
   computed `background-color` identical (`--surface-2` #242426 at 72%).
3. The solid fallbacks (`prefers-reduced-transparency: reduce`,
   `prefers-contrast: more`, and `@supports not backdrop-filter`) use the same
   chip token, opaque, so light mode gets solid #E8E8ED and dark gets solid
   #242426.
4. `test/contrast.test.js`: the chip's glyph ink (whatever color the five
   controls actually draw their icon and the team name in — read it from
   app.css, do not assume) clears 4.5:1 on the chip token in light and dark,
   including under every tint block that redefines that ink.
5. Hover still darkens a chip (`--surface-3` on hover must stay visibly
   different from the new light fill; if `--surface-3` is lighter than or equal
   to #E8E8ED in light mode, say so in the hand-back rather than inventing a
   new color).
6. Checked in a browser on Today, the game screen, Team, Season and Settings,
   light and dark, at 390×844, and with the header collapsed after scrolling:
   the chips show as gray discs over content (L2), and nothing clips.

## Surfaces

- Changes: `app/tokens.css` (one new token, light and dark blocks),
  `app/app.css` (the chip rule near line 286 and the two fallback rules near
  lines 1677 and 1683), `app/sw.js` (precache bump), `test/contrast.test.js`.
- Must not change: `--surface-2` and `--seg-track` values (other text lands on
  `--surface-2`; `--seg-track`'s comment says it carries only the seg control's
  colors, so do not paint chips with `--seg-track` itself), the bar's own scrim,
  the chips' sizes and hit areas.

## Constraints

- One answer in one place: the chip gets its own token (for example
  `--chip`), defined in `:root` as #E8E8ED and in `:root[data-theme="dark"]` as
  #242426, with a comment saying it matches `--seg-track`'s light value on
  purpose (#137) and `--surface-2` in dark. Every chip rule (the main rule and
  both fallbacks) reads that token; none names `--surface-2` any more.
- L2: stays translucent and blurred, solid under reduced transparency, more
  contrast, or no backdrop-filter. K5: a value for every theme. N5.
- Precache: `app/tokens.css` and `app/app.css` are precached — bump `VERSION`
  in `app/sw.js` and set `SHELL` to the digest `npm test` names.
- Do not re-derive contrast math: reuse the helpers `test/contrast.test.js`
  already uses for the `--ink` on `--seg-track` test (around line 129).

## Design

Add the chip token to `tokens.css` next to `--seg-track`. Point the five
chip fills and the two fallback blocks at it. Update the #33 decision-9
comment above the chip rule and the fallback comment so they name the token
and #137.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Token contrast | `test/contrast.test.js` under `node --test` | 4 |
| Token values | `test/contrast.test.js` (or the test that already reads `tokens.css`) | 1, 2 |
| Browser | `/browser-verify` on the preview, plus `node scripts/compare-shots.mjs --issue 137` light and dark | 1, 2, 3, 5, 6 |

The existing smoke checks that sweep light/dark and reduced transparency must
stay green; no new smoke check is needed.

## Out of scope

- Reaching 3:1 between chip and page (decided against, above).
- Any change to dark mode, the segmented control, or the bar scrim.
