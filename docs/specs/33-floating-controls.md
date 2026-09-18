# 33 — Floating controls

## Issue

#33: headers and the primary action float above the content. Large titles
settle into the header as you scroll, header buttons are round and
translucent, Start game floats full width at the bottom, and content fades
out beneath both. The in-app footer and every `?` control go, and How it
works is brought up to date.

Parent #18. Blocked by #21, #23, #28, #29 — all merged. #69, named in the
issue comment as the thing to build on, is closed.

## Goal

A coach holds the phone one-handed at the scorer's table. The controls they
need are always in the same two places — top corners and thumb reach — and
the content runs underneath them instead of stopping at a line. Nothing on
screen exists only to explain the screen.

## Survey (2026-09-18, on `da407aa`)

- **Header.** One `header.bar` with two halves, `#barToday` and `#barBack`,
  toggled by `applyView` in `app/render.js`. `.bar` is `position: sticky` with
  `background: color-mix(in srgb, var(--bg) 76%, transparent)` and
  `backdrop-filter: saturate(180%) blur(24px)` — a semi-opaque bar, with no
  solid fallback for either reduced transparency, more contrast, or a missing
  `backdrop-filter`. It has no border.
- **Bar title.** `h1#barTitle` sits inside `#barBack`, after `#backBtn`.
  `applyView` writes `screenTitle(v)` into it and hides it on the three views
  in `NO_BAR_TITLE` (`games`, `season`, `team`), so today it is visible only
  on Settings. `SCREEN_TITLE` is a hand-typed map of three words.
- **Large titles.** `h1.today-h1` "Today"; `h1.game-h1#gameTitle`, written by
  `renderTabs` in `app/teams-view.js`; `h1.team-h1#teamTitle`, written by
  `roster-view.js` with the **team's name**, not the word "Team";
  `h1.season-h1#seasonTitle` "Season". Settings has no in-page `h1` — the
  prototype's `light-settings.png` shows a bar title only, so it stays that
  way. None of the four move or shrink on scroll today.
- **Header buttons.** `#backBtn` and `#shareBtn` are already 48px hit areas
  with a 2.25rem `--surface-2` circle inside. `#settingsBtn` and `#teamAdd`
  are 48px squares with no circle. `#teamBtn` is a 48px-min `--r-sm` text
  button with no fill. None of the four are translucent or blurred.
- **Primary action.** `div#actionbar` is `position: fixed`, below 900px only,
  semi-opaque with a blur, padded
  `calc(.6rem + env(safe-area-inset-bottom))`. It holds `#abBench.ab-main`
  ("Start game", `flex: 1`) and a `.helpq` `?`. The `?` is what keeps the
  primary action from being full width.
- **Help icons.** Two `.helpq` buttons, both `data-help="help-bench"`: one in
  `#actionbar` (phone) and one in `.gm-start` (900px and up). `.helpq` CSS at
  `app/app.css:3158`. `app/shortcuts.js` wires `[data-help]` to
  `openHelp(section)` and scrolls `#help` to the anchor.
  `test/help-deeplink.test.js` guards that path;
  `test/actionbar-split.test.js` asserts exactly two of them exist.
- **Footer.** `footer.foot` carries the free/privacy line, a "How it works"
  link to `./about`, a Contact mailto and `#tipLink`. `.foot` is the one
  hairline in the app (`border-top: 1px solid var(--line)`). The Settings
  About / Contact / Buy-me-a-coffee rows already exist (`app/index.html`
  1498–1525); a comment there says they duplicate the footer until #37
  removes it. So the second half of AC6 is already true.
- **Focus.** There is no `scroll-padding` anywhere in `app/app.css`. Tabbing
  scrolls a control flush to the top of the scrollport, which is under the
  sticky header, and the fixed action bar is invisible to the browser's
  scroll-into-view entirely.
- **Budgets.** `scripts/budgets.json` `requests` is pinned at 39 and must not
  be re-recorded, so **no new file under `app/` may join the boot graph**.
  Every line of new behavior here goes into a module that already loads.

## Decisions made in this spec without asking

The ticket is `ready-for-agent`. Where the prototype and
`docs/interface-guidelines.md` disagree, the guidelines win.

1. **The collapse is driven by an `IntersectionObserver` in
   `app/render.js`.** No new `app/` module: the `requests` budget is pinned at
   39 and a new module would re-record it, which REVIEW.md calls a Blocker.
   One observer watches whichever `[data-large-title]` element the current
   view owns and toggles `.bar.title-in`.
2. **The large title itself does not move.** It stays in normal flow, so it
   scrolls at exactly scroll speed by construction — L4's "at scroll speed"
   and NN/g's "should not jump" are both free. What changes is the bar title
   fading in as the large one leaves. Nothing shrinks in place, because a
   `font-size` animation on scroll is the layout thrash `REVIEW.md` calls
   Important.
3. **`#barTitle` moves out of `#barBack` and becomes a centered overlay on
   `.bar`.** It is `position: absolute`, centered, `pointer-events: none`, so
   it takes no space in either half. This is the only shape that works on all
   five screens: in flow it would push `New day` and the gear around on
   Today, and at 320px with a 32px root it would force the bar to wrap a
   third row. Centered also matches `light-settings.png`.
4. **The overlay's width is measured, not guessed.** `render.js` writes
   `--bar-side` = the widest of the header's leading and trailing control
   clusters, and `.bar-title` is
   `max-width: calc(100% - 2 * var(--bar-side) - 1rem)`. A fixed percentage
   clips: Team's right-hand pair (Edit + `+`) is about 102px at 390px, more
   than any symmetric percentage leaves. Recomputed on view change and from a
   `ResizeObserver` on `.bar`.
5. **`NO_BAR_TITLE` and `SCREEN_TITLE` are deleted.** The bar title is a copy
   of the view's large title, read from the DOM at collapse time
   (`syncBarTitle`). Hand-typing it would make Team's bar say "Team" while
   its large title says the team's name. Settings has no large title, so its
   bar title is the static `data-bar-title` on its `<main>` and is shown at
   all times.
6. **`#barTitle` stays an `h1` and gains `aria-hidden` on the four views that
   have their own large title.** It is a visual duplicate there; on Settings
   it is the screen's only heading and stays exposed. Exactly one `h1` is
   announced per screen, as now.
7. **The bar and the action bar lose their backgrounds for a masked
   `::before` scrim.** L3: a fade, not a bar. Each pseudo-element carries a
   `linear-gradient` in `--bg` plus a `backdrop-filter`, both masked with a
   `mask-image` that runs to transparent at the content-facing edge, so the
   blur itself fades out rather than ending on an edge. `.bar` keeps
   `z-index: 50`; the pseudo sits at `z-index: -1` inside it.
8. **Solid fallbacks are one shared block**, applied under
   `@media (prefers-reduced-transparency: reduce), (prefers-contrast: more)`
   and under
   `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))`.
   Both set the scrim to a flat `var(--bg)`, drop the mask and drop the
   filter, and make the round buttons' fills opaque `--surface-2`. L3 says no
   opaque bar; AC3 says solid under these conditions. AC3 wins where they
   meet, which is what L2's own sentence says too.
9. **Round header buttons: `#backBtn`, `#shareBtn`, `#settingsBtn`,
   `#teamAdd`, `#teamBtn`.** One rule for all five: a 48px hit area, a
   2.25rem round fill in
   `color-mix(in srgb, var(--surface-2) 72%, transparent)` with a blur.
   `#teamBtn` is a pill (`--r-full`) rather than a circle because it holds
   text. `#teamAdd` joins the AC's four because it is an icon button in the
   same header and leaving it square beside a round `#shareBtn` would read as
   a bug.
10. **`#todayNewDay`, `#teamEdit` and `#seasonExport` stay plain text.** L2's
    rule is about round buttons; `light-today.png` and `light-team.png` both
    show these as bare text. The AC names four buttons and none of these is
    one of them.
11. **Both `.helpq` controls, the `.helpq` CSS and the `[data-help]` wiring
    are deleted** (W3). Removing the one in `#actionbar` is what makes
    `#abBench` full width, since `.ab-main` is already `flex: 1`.
    `test/help-deeplink.test.js` is rewritten as the W3 guard: no `?` help
    control exists in `app/index.html`, and no element carries `data-help`.
    `openHelp` keeps its optional section argument — `#helpBtn` in Settings
    still opens the dialog, and `app/tour.js` still ends on it.
12. **`#keysHint`'s `<kbd>?</kbd>` stays.** It is a keyboard-shortcut hint on
    a desktop-only control (`display: none` below 760px), not a help icon;
    W3 is about `?` buttons that open an explanation beside a control.
13. **The footer goes entirely**, markup and all `.foot*` / `.tip*` CSS. Its
    three destinations already exist in Settings. `app/render.js`'s
    `display` toggle for `.foot`, `app/gamemode.js`'s hide list and
    `scripts/smoke/team-color.mjs`'s `.foot-link` probe all move off it.
14. **`scroll-padding` is measured too.** `render.js` writes `--bar-h` and
    `--ab-h` from the same `ResizeObserver` as decision 4, and
    `html` gets `scroll-padding-top: calc(var(--bar-h) + .5rem)` and
    `scroll-padding-bottom: calc(var(--ab-h) + .5rem)`. Static values cannot
    work: the bar wraps to two rows at 320px with a 32px root, so its height
    is not a constant.
15. **A new smoke check, `focusclear`**, tabs the game screen at 390×844 and
    fails if the focused control overlaps `.bar` or `#actionbar`. It counts
    the elements it visited and fails if focus never moved, so a run that
    measured nothing cannot read green.
16. **How it works is rewritten against the glossary** (`CONTEXT.md` § The
    app). Nothing in it names a control this redesign removed — no "Season
    tab", no "Print" button, no "Across the day", no "Rules" section.
17. **The 900px desktop split stays.** `.gm-start` and `#gmOpen` are out of
    scope: `app/tour.js` anchors its bench step on both `#abBench` and
    `#gmOpen`, and the ticket is about the phone.

## What would settle it

1. On Today, a game, Team and Season, scrolling down fades a small title into
   the header that reads the same words as the large title that just left —
   including Team, where both say the team's name and not "Team". Scrolling
   back up fades it out. The large title never changes size and never moves
   at anything other than scroll speed.
2. On Settings, the bar title reads "Settings" at all times, and the screen
   still has no large title, as `light-settings.png` shows.
3. `#backBtn`, `#shareBtn`, `#settingsBtn`, `#teamAdd` and `#teamBtn` each
   measure at least 48×48 between 320px and 390px, each has a round fill
   (`border-radius` resolving to at least half its height), and each fill's
   computed `backdrop-filter` is not `none`.
4. `#abBench` spans the action bar's full inner width — its measured width is
   within 1px of `#actionbar`'s content box — and `#actionbar`'s computed
   `padding-bottom` resolves through `safe-area-max-inset-bottom` with
   `env(safe-area-inset-bottom)` as the fallback.
5. With `prefers-reduced-transparency: reduce` emulated, and again with
   `prefers-contrast: more`, the computed `backdrop-filter` on the bar scrim,
   the action-bar scrim and every round button fill is `none`, and each
   background is a fully opaque color (alpha 1).
6. Neither `.bar` nor `#actionbar` has a `border`, a `box-shadow` standing in
   for one, or an opaque background in the default state; `.foot`'s
   `border-top` — the app's one hairline — is gone with the footer.
7. Tabbing the game screen at 390×844 from the top of the document through at
   least 8 distinct controls never leaves `document.activeElement`'s rect
   overlapping `.bar`'s rect or `#actionbar`'s rect. The check reports how
   many controls it visited, and zero is a failure.
8. `app/index.html` contains no `?` help control and no `data-help`
   attribute; the string `Benchcard is free` appears nowhere under `app/`;
   `.foot`, `.foot-link`, `.foot-why` and `#tipLink` are gone from both the
   markup and `app/app.css`. About, Contact and the tip jar are all still
   reachable from Settings in one tap.
9. Every heading and paragraph inside `#help` names only controls that exist:
   no occurrence of "Season tab", "Print", "Across the day" or "under
   **Rules**" anywhere in the dialog.
10. With `prefers-reduced-motion: reduce`, the bar title's computed
    `transform` is `none` in both states and its transition is opacity only —
    nothing in the bar or the action bar travels.
11. The compare set under `notes/mockups/prototype/compare/33/`, produced by
    `node scripts/compare-shots.mjs --issue 33`, covers all five screens in
    light and dark at 390×844, long real names, scrolled to the bottom, full
    height, 320px wide at a 32px root font, the first-run state, and the new
    `title-collapsed` state. No clipped text in any of them.
12. `npm test` and the whole of `npm run smoke` are green. `scripts/budgets.json`
    `requests` is still 39.

## Surfaces

Change: `app/index.html`, `app/app.css`, `app/render.js`,
`app/shortcuts.js`, `app/gamemode.js`, `app/sw.js` (VERSION and SHELL),
`scripts/compare-shots.mjs` (one new state), `scripts/smoke/registry.mjs`,
`scripts/smoke/focus-clear.mjs` (new), `scripts/smoke.mjs`,
`scripts/smoke/team-color.mjs`, `scripts/budgets.mjs` (only if a ceiling is
crossed), `test/` (new and updated cases), `docs/` (architecture and the
guideline coverage table).

Must not change: `app/card.css` and the printed card, the four pure modules'
behavior, `scripts/budgets.json`, any element id that a handler or test
reaches for other than the ones named above.

## Constraints

- `docs/interface-guidelines.md`: L2, L3, L4, L5, C1, C2, A1, M3, W3.
- No new file under `app/`. `requests` stays at 39.
- Colors come from tokens; no raw hex in new `app.css` rules.
- Every `prefers-contrast: more` rule names both themes explicitly, the way
  `tokens.css` already does — the bare `:root` selector loses to
  `:root[data-theme="dark"]` and silently does nothing in dark mode.
- Reduced motion is watched, not sampled (M3), which the global
  `prefers-reduced-motion` sweep in `app.css` already handles for
  transitions.
- Any file under `scripts/smoke/` stays under 40,000 bytes.
- A precached file changes, so `VERSION` in `app/sw.js` goes up and `SHELL`
  becomes the digest `npm test` names, in the same edit.
