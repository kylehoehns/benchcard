# #177 — Smoke draws text in CI's font, on a Mac too

## Issue

#177. A text row that fails the smoke suite in CI should fail it on a Mac
first, before the push.

## Goal

A developer on a Mac sees the same text widths the CI smoke job sees, so
"fits here, wraps in CI" stops costing a push, a CI wait and a fix developer.
Seven of the ten red CI runs in #131–#150 were this.

## Decisions

- **One font for smoke, no Docker** (the maintainer's decision, on the issue).
  The smoke harness carries CI's font and forces it on every page it opens,
  on a Mac and in CI alike. The font never goes under `app/`, so it never
  ships to a coach.
- **CI's font is DejaVu Sans** (survey, verified). `--font` in
  `app/tokens.css:37` is `-apple-system, BlinkMacSystemFont, "Segoe UI",
  Roboto, system-ui, sans-serif`; on the Ubuntu runner none of the first four
  exist and `system-ui` resolves to DejaVu Sans. Evidence: CI run 36276362685
  measured "Lindqvist" at 145px in plain 32px text (weight 400, no letter
  spacing, `.who-row .prow-t`). Measured locally in Chrome with the release
  fonts: DejaVu Sans 144.7px, Liberation Sans 126.3px, the Mac stack 125.8px.
- **Only `--font` is forced.** Every UI element takes its face from
  `var(--font)` (`app/app.css:30`, and `button, input, select, textarea
  { font: inherit }` at `:53`). The printed card uses InterVar, which the app
  ships itself, so it is already the same on both machines and is not touched.
- **Delivered as bytes, not a request.** The font reaches the page through
  `FontFace` with the file's bytes and `document.fonts.add`, plus one
  constructed stylesheet in `document.adoptedStyleSheets` that sets
  `:root { --font: <the smoke face> !important }`. No network request and no
  DOM node, so the three budgets (bytes, requests, nodes) cannot move, and
  nothing is served from `app/`'s origin that a coach would not get.

## What would settle it

1. **Same font on both machines.** A new smoke row asserts, with CDP
   `CSS.getPlatformFontsForNode`, that text in at least these places renders
   only in DejaVu Sans (`familyName` "DejaVu Sans", every glyph): body text,
   a weight-600 name, a heading, a button label, and a sheet's text at
   320px/32px. The printed card (InterVar) and the paste box's monospace
   `textarea` (`.pastebox textarea`) are excluded by name. It passes on the
   Mac and in CI. With the font injection removed, it fails on the Mac
   (reporting the face it found instead).
2. **An old CI failure replays locally.** In a scratch worktree at
   `98ffdf18cf0b4d1fa7f25a8003e3f7e39b2f65c7` (#138's first push, red in CI
   run 36251254331 with `"Bartholomew-Christopherson Novak" is 209px wide,
   narrower than its own longest word (227.4px)`), with only this change's
   smoke-font code ported in:
   `node scripts/smoke.mjs --only "bench mode matches the prototype"` fails
   on the Mac with the longest word within 1px of 227.4. Without the port,
   the same command passes on the Mac. Report both outputs.
3. **Nothing else moves.** The budget rows print the same numbers as `main`
   (1279.2 KB, 42 requests, 1398 DOM nodes). `main`'s smoke is green in CI
   today, so the full local smoke should be green too. A row that goes red
   locally with the forced font is a real CI-parity finding: report it with
   its numbers. Do not loosen the check to make it pass.
4. **`AGENTS.md` says so.** The "CI draws text wider than a Mac does"
   paragraph is rewritten: smoke forces DejaVu Sans on both machines, so
   `npm run smoke` on a Mac measures text the way CI does, and a text row
   that fails in CI fails there first. It names where the font lives and
   what is not forced (the card's InterVar, the monospace textarea). The 15%
   rule is kept, and reworded as belt and braces rather than the only
   defense. `row-stack.mjs`'s margin is not changed.
5. The full smoke suite's wall time on this Mac grows by less than 10%
   compared with `main` (report both times).
6. Full `npm test` and the smoke suite pass.

## Surfaces

Change:

- `scripts/fonts/DejaVuSans.ttf` and `scripts/fonts/DejaVuSans-Bold.ttf`:
  DejaVu Fonts 2.37, unmodified, from
  `https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip`
  (copies are in the orchestrator's scratchpad at
  `/private/tmp/claude-501/-Users-khoehns-dev-benchcard/6cd3b058-9577-402e-bdc6-589595e7f829/scratchpad/fonts/dejavu-fonts-ttf-2.37/`).
  `scripts/fonts/LICENSE` is the release's `LICENSE` file, unmodified. The
  fonts are **not** under `scripts/smoke/`: `test/smoke-size.test.js` caps
  every file there at 55,000 bytes.
- `scripts/smoke/smoke-font.mjs` (new): reads the two files once and exports
  the source string for `Page.addScriptToEvaluateOnNewDocument`.
- `scripts/smoke.mjs`: registers that script in `browserChecks`, next to the
  existing `addScriptToEvaluateOnNewDocument` (`__SMOKE_VIEWPORT` and the
  seed), so every navigation of the one smoke page gets it.
- `scripts/smoke/registry.mjs` and a new check module (or an existing one
  that fits, under the size cap) for item 1's row; `scripts/smoke/sizes.mjs`
  if row names live there.
- `test/` as the smoke registry tests require.
- `AGENTS.md` (item 4).

Must not change: anything under `app/` (no `VERSION`/`SHELL` bump);
`scripts/compare-shots.mjs`, `scripts/og.mjs` and
`scripts/redirect-check.mjs`, which launch their own Chrome and must keep the
real system font (the prototype comparisons are Mac-to-mockup); any existing
check's thresholds; the budgets.

## Constraints

- **Reuse, do not re-derive:** the one page and CDP session `browserChecks`
  already sets up (`scripts/smoke.mjs:97-148`); `evalIn` and the existing
  `document.fonts.ready` settles (`scripts/smoke/dom.mjs`,
  `scripts/smoke/fixtures.mjs`); `LARGE_TEXT_PX`/`LARGE_TEXT_WIDTH` from
  `sizes.mjs` and how `app-large-text.mjs` sets 320px/32px, for item 1's
  sheet case.
- **The font must be loaded before anything measures.** Every existing
  reload already awaits `document.fonts.ready`; a `FontFace` built from bytes
  and added to `document.fonts` is part of what that waits for. Prove it: item
  1's row runs right after a reload, not after a long settle.
- **Two faces, matched the way CSS matches them:** DejaVu Sans at weight 400
  and DejaVu Sans Bold at weight 700, both under one family name. CSS's
  own weight matching then picks Book for 500 and Bold for 600 and 800, the
  same as CI's fontconfig. Do not declare weight ranges.
- AGENTS.md: every exported `...Pass` is the `run` of exactly one row
  (`test/smoke-registry.test.js`); files under `scripts/smoke/` stay under
  55,000 bytes.
- AGENTS.md § the proof pair: the developer runs `npm test` and targeted
  `--only` rows; the full smoke suite is the orchestrator's.

## Design

`smoke-font.mjs` reads `scripts/fonts/DejaVuSans.ttf` and
`DejaVuSans-Bold.ttf`, base64-encodes them once, and builds one script:

```text
on every new document (before the page's own scripts):
  for each (bytes, weight) in [(book, 400), (bold, 700)]:
    face = new FontFace(<smoke family>, decode(bytes), { weight })
    document.fonts.add(face)
  sheet = new CSSStyleSheet()
  sheet.replaceSync(':root { --font: <smoke family> !important; }')
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
```

`browserChecks` registers it with `Page.addScriptToEvaluateOnNewDocument`
right after the existing one. Item 1's row reads platform fonts through
`CSS.getPlatformFontsForNode` (it needs `DOM.enable` and `CSS.enable` on the
session; turn them off again if leaving them on changes another row).

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| the new "text draws in DejaVu Sans" row | `node scripts/smoke.mjs --only "<row name>"`, on the Mac and in CI; red with the injection removed | 1 |
| the #138 replay | orchestrator, scratch worktree at `98ffdf1`, with and without the port | 2 |
| budgets and every other row | the orchestrator's full smoke run, and CI | 3, 6 |
| `AGENTS.md` paragraph | read in review | 4 |
| wall time | orchestrator, `time` on the full run, this branch and `main` | 5 |
| registry wiring | `test/smoke-registry.test.js`, `test/smoke-only.test.js` | 1 |

## Out of scope

- Docker or colima.
- Forcing the monospace `textarea` font or italics (`.sn-nm.gone`).
- Changing `row-stack.mjs`'s 15% margin, or any other check's threshold.
- `compare-shots.mjs`, `og.mjs`, `redirect-check.mjs`.
