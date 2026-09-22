# #75 — The pages and images people see before they open the app

## Issue

#75 (parent #18). Bring the About and Advanced pages, the share image, the
icons and the README up to date with the redesigned app. This also closes #44
(the mark's color) and #47 (the league minimum "on the Team tab").

## Goal

Someone who meets Benchcard through a shared link, a home-screen icon or the
About page sees the app they will actually get: the game screen with its
sentence and timeline, in the Hardwood team color, described in the words the
app uses.

## Decisions (grilled with the human, 2026-09-22)

- **The mark is Hardwood.** Ball fill `#D2500A` (the light Hardwood `--tint`
  in `app/tokens.css`) with light seams `#F4F4F6`, everywhere the mark
  appears: the four icon PNGs, the inline SVG favicon on every page, the logo
  on About and Advanced, and `og.png`. It is an image, so it is the same value
  in light and dark. This replaces ember `#E14E12` / `#C33F08`. The pages'
  interface color (`--accent`, links, buttons) stays Graphite (K1): only the
  mark is Hardwood.
- **og.png is layout "B"**: today's composition (brand top left, "Youth
  basketball" eyebrow, the three-line headline, a phone at -1.4° running off
  the bottom edge). The phone shows the **game screen** (title, status line,
  sentence, Timeline). The eyebrow, "worked out" and the mark are Hardwood
  `#D2500A`. The rest of the headline is ink `#1C1C1E` on ground `#F4F4F6`.
  The human approved a scratch render of exactly this. The render had one
  flaw: its color came from setting `data-tint` by hand. The build must
  instead get it from the seed's team color (see Design).
- **Sharp:** og.png is **2400×1260** (the same 1.91:1 ratio platforms expect,
  at 2×). The composition is captured at `deviceScaleFactor: 2` and the phone
  at `deviceScaleFactor: 3`. Every page's `og:image:width`/`height` says
  2400/1260.
- **The sample game has one rule: Noah / Mia apart.** The sentence then
  ends "with 1 rule", not "with no rules", which read as "no rules in the
  game". It is the rule the About page's drawn rule chip already shows
  (about.html ~963).
- **Rule names on the pages follow the glossary:** Together / Apart / One of
  two on. The app's own mixed wording (`rules.js` "One of two always on",
  `gamemode.js`) is a new issue, not this change.
- **Scope:** #75 + #47 + #44, plus the chart pages' "a 8-player" / "a
  11-player" and the README's avoided words. #77 stays separate.
- **Share-preview proof:** the branch preview runs through a public preview
  tool for title/description/alt. The PR shows the new og.png beside the old.
  It says the image itself goes live on merge, because `og:image` is the
  absolute production URL.

## What would settle it

1. **No ember left.** `#E14E12`, `#C33F08` and `#FFF3EC` appear in no file
   under `app/` (excluding `vendor/`), nor in `scripts/og.mjs` or
   `scripts/charts.mjs`. The mark is `#D2500A` with `#F4F4F6` seams in every
   inline favicon and page logo.
2. **Icons redrawn** at their current sizes: `icon-192.png` 192×192,
   `icon-512.png` 512×512, `apple-touch-icon.png` 180×180, `favicon.ico`
   48×48. Each is the Hardwood ball on its current layout (the same safe area
   and padding as today). None is larger than its current file size + 50%.
   `site.webmanifest` `theme_color`/`background_color` stay `#F4F4F6`.
3. **og.png** is 2400×1260, at most 300 KB, and matches the Decisions above.
   The phone reads "11 players, 4 × 8, subbing every 4 min for even minutes,
   with 1 rule." The status line reads "Planned", which is true because the
   game-screen shot is taken before the game starts. Hardwood comes from the
   seed's team color, not a hand-set attribute.
4. **Meta tags on all nine pages** (index, about, advanced, six chart pages):
   `og:image:width` 2400, `og:image:height` 1260. Every `og:image:alt` and
   `twitter:image:alt` is the same new text, and it describes the new image:
   "Benchcard’s game screen on a phone: the sentence “11 players, 4 × 8,
   subbing every 4 min for even minutes, with 1 rule” above a timeline of each
   player’s minutes, beside the words “Even minutes, worked out before the
   game.”" Advanced's descriptions (:38/46/54) no longer say "ledger".
5. **bench-sample.png** is recaptured from the redesigned bench mode with the
   Hardwood seed, at 780×1688 as now. `card-sample.png`/`@2x` are recaptured
   from the new seed (the rule may move stints). `wel-card.png`/`@2x` come
   from `?try=N`, which this change does not touch, so they stay
   byte-identical.
6. **About and Advanced copy, against `CONTEXT.md`:** no "Team tab", no
   "ledger", no "floor" for a minimum, no strategy called "Balanced" or
   "Minutes" (they are **Even** and **By hand**). Advanced uses **Card name**,
   not "short names". The rule names are **Together / Apart / One of two on**.
   The Advanced page points to "under **Size**", not "under **Print**", as the
   app does (index.html ~1856). The league minimum is "in **Settings**" (#47).
   "Team page" sentences about levels and the roster stay as they are.
7. **About's hand-drawn eleven agree with the photographs.** The drawn
   timeline's totals (seven on 16, four on 12) and its stint cells match
   the plan the new seed produces, and so do the JSON-LD prose at about.html
   :83 and the card-sample. If the rule changes the solved rotation, update
   the drawings to match the solver, not the other way round.
8. **Chart pages** say "an 8-player" and "an 11-player" (and "an 18-" if
   generated). The fix goes in `scripts/charts.mjs`, and the six pages are
   regenerated from it, not hand-edited.
9. **README**: no "shifts", "season ledger" or "re-solve". It uses the
   glossary words. The embedded image is the new og.png.
10. **Existing checks pass:** `npm test` and `npm run smoke`, including
    `static pages: 2 guides + 6 charts` (no overflow at 390, 320 and 320 with
    large text; alt text; touch targets). `scripts/check-about-date.mjs
    origin/main` passes, because about.html's dateline moved.
11. **Service worker:** `VERSION` goes from 330 to 331, and `SHELL` is set to the
    digest `npm test` names. The precached pages and images changed.

## Surfaces

Change: `app/about.html`, `app/advanced.html`, `app/index.html` (favicon SVG,
og/twitter meta, JSON-LD alt if any), `app/charts/*` or wherever charts.mjs
writes (regenerated), `app/og.png`, `app/bench-sample.png`,
`app/card-sample*.png`, `app/icon-192.png`, `app/icon-512.png`,
`app/apple-touch-icon.png`, `app/favicon.ico`, `app/sw.js`, `scripts/og.mjs`,
`scripts/charts.mjs`, `README.md`, `test/team-tab-copy.test.js`, new tests
under `test/`.

Must not change: the app's own screens and copy (`app/*.js`, `app.css`,
`tokens.css` values), `card.css` and the printed card's design, `wel-card*`,
`site.webmanifest` colors.

## Constraints

- **The printed card does not change** (#18). Only the card *photographs* are
  retaken.
- **The four pure modules** are untouched: this is pages, images and scripts.
- **Precache bump:** any precached file changing means bump `VERSION` and set
  `SHELL` to the digest `npm test` prints (`AGENTS.md` § deploy).
  `check-sw-version.mjs` only runs in CI.
- **Reuse `scripts/og.mjs`**, not a second capture script. It stays
  zero-dependency (its own CDP client, `serve.mjs`, `recompressPng`). One
  `SEED` still feeds og, bench and card, so they cannot drift. The rule and
  the team color go **into `SEED`**, and nothing else changes it.
- **Hardwood comes from the real setting.** Seed the team's `color:
  'hardwood'` through the record the app loads (it is sanitized by
  `COLORS` in `app/storage.js` and applied by `applyTint` in `app/render.js`).
  Do not set `data-tint` from the script. The composition reads the hex back
  with `getComputedStyle(...).getPropertyValue('--tint')`. It does not type
  `#D2500A` into og.mjs, because tokens.css is the one place that holds the
  value.
- **The game-screen shot is taken with `live` removed from the seeded game.**
  The bench shot keeps `live: { at: 2 }`. Same roster, same rule, same seed
  number, so the same rotation. The composition's crop point is measured from
  the live layout, not hard-coded, as the current `cut` is.
- **The icons have no generator today** (index.html:274 says favicon.ico was
  made by hand from icon-192). Add one to `scripts/og.mjs` behind a flag
  (e.g. `--icons`), drawing the mark SVG in Chrome at each size, so the next
  color change is one command. `favicon.ico` wraps a 48×48 PNG in an ICO
  header. That can be done in node with no dependency.
- **Glossary** (`CONTEXT.md`) is the source for every word decision in item 6.
  Do not re-derive the avoided words; read them from the glossary's
  `_Avoid_` lines.
- **Mobile first:** 390×844 first, then 320 and 320 with large text, for both
  pages, in light and dark.
- `/browser-verify`'s traps apply to every browser claim. That means the
  service worker serves stale files, and `css.includes` is not evidence.

## Design

1. `scripts/og.mjs`: add the rule (`avoids: [['p7', 'p6']]` — Noah, Mia) and
   the team color to `SEED`. Capture the game screen (no `live`) at DPR 3 for
   og, and bench mode (with `live`) at DPR 2 for bench-sample. Compose layout B at
   DPR 2 with the tint read from the page. Replace the ember hexes with the
   read tint. Add `--icons`. Update the file's comments where they now lie
   (e.g. "The hero is a real screenshot of bench mode").
2. Regenerate: `node scripts/og.mjs --bench app/bench-sample.png --card
   app/card-sample.png --icons`. Leave `--welcard` out.
3. Pages: copy fixes per item 6, the mark color, the meta tags, the
   dateline. Check about's drawn timeline against the new card-sample.
4. `scripts/charts.mjs`: an article helper (`an` before 8, 11, 18, 80–89),
   then regenerate the chart pages.
5. README wording.
6. `sw.js` bump.

## Proof

- **`test/team-tab-copy.test.js`** (existing guard) extended to read
  `app/about.html` and `app/advanced.html`. Covers item 6's Team-tab part
  (#47). Falsify it by putting the old about.html:996 sentence back: the test
  must fail. That is a guard under `/new-guard`.
- **New guard `test/static-pages.test.js`** (reads source, named here, built
  under `/new-guard`):
  - no ember hex under `app/` (excluding vendor) or in og.mjs/charts.mjs
    (item 1);
  - every page's `og:image:width`/`height` equals og.png's IHDR dimensions,
    read from the bytes, and every page's og/twitter alt is identical (items
    3–4);
  - about/advanced contain none of the glossary's `_Avoid_` words that
    item 6 lists, and none of the old rule names, with comments stripped the
    way team-tab-copy does (item 6).

  Each check is falsified once: re-insert the bad text or hex and see it fail.
- **`scripts/charts.mjs` article helper** is exported and unit-tested under
  `node --test` for 6, 8, 11, 18 and 12 (item 8). The regenerated pages are
  checked by the guard above. No chart page may say `a 8` or `a 11`.
- **`npm run smoke`**, the `static pages: 2 guides + 6 charts` check (item 10).
- **`/browser-verify`** on About and Advanced at 390×844, 320 and 320 large
  text, light and dark. It checks the Hardwood mark, no overflow, and that
  radii and type match the app. It also reads og.png, bench-sample and
  card-sample by eye against items 3, 5 and 7, and checks the icons at their
  real sizes (item 2).
- **Preview tool** on the branch preview URL (Decisions).

## Out of scope

- #77 and any app copy, including the app's own mixed rule names. That goes in a
  new issue, filed with this change.
- #92 (Today's card says "Planned" for a part-played game). The og shot
  avoids it by being taken before the game starts.
- A new og layout, or dark-mode share image.
- `site.webmanifest` colors and the in-app `--accent`.
