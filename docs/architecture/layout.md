# Layout

    app/       everything that gets served — the site root
    test/      node --test
    scripts/   CI tooling
    notes/     internal working notes, never deployed

`app/` is an allowlist, and that is the point: the build copies it to `dist/`,
and `wrangler.jsonc` points `assets.directory` at `dist/`, so a file is public
only by being put in the source. The
previous arrangement served the repo root minus an `.assetsignore` denylist,
where forgetting one line published an internal file at `benchcard.app/<name>`.
A directory that has to be opted into fails closed.

Everything below is relative to `app/`.

- `engine.js` — planning core. Pure, dependency-free, deterministic for a given seed.
- `roster.js` — roster text parsing (jersey numbers from either end of a line). Pure.
- `icons.js` — Lucide path data, extracted at vendor time.
- `fx.js` — animation vocabulary over the vendored Motion library; exports one easing curve so Motion, timeline blocks, and game-mode slides all animate on the same curve.
- `budget.js` — minute-budget allocation in stint slots. Pure.
- `live.js` — where a game stands (not started, part-played, or finished), which stint to show, where to resume, and what status word to display. Pure. Exports `stage`, `stintIndex`, `resumeAt`, `passStatus`, `openAt`, `stepAt`, and `resumeBarAt` (#123).
- `storage.js` — load/save with validation and a one-behind backup, plus the shape of a finished game (which now carries a date, #100), `teams[].days` (a list, each day's games sorted by tip-off time, #102), `teams[].activeDay` to track the open day, and migration from v6's single `day` to v7's `days` list. Pure apart from `localStorage`.
- `dom.js` — forgiving DOM one-liners shared by the UI modules, plus the
  shared `ctx2d` canvas everything that sizes type by measurement uses.
- `trap.js` — focus trap for the overlays, the `data-fk` focus/caret restore,
  the bottom sheets' open, close, push and drag (#73), and the step painter the
  two full-screen flows share (#36).
- `state.js` — the app record: state shape and migration, load/save glue, the
  accessors every view reads through, the slot budget and the plan cache,
  and `benchOpen()` / `setBenchOpen(v)` to track whether bench mode is open (#123).
  Imports only the pure modules, so the view seams can depend on it freely.
- `card.js` — the printed card: sizes, canvas auto-fit, pagination, the preview
  zoom and the phone disclosure. The card is the product, so it is its own file.
- `share.js` — the same card as a PNG, painted from the laid-out DOM onto a
  canvas, for `navigator.share` with a clipboard/download fallback. The image
  keeps a taller bottom margin than its other three, with `benchcard.app`
  centered in it: the in-card mark is 7px, which is about five device pixels
  once a phone scales the picture into a message bubble. A URL and nothing
  else — the band is outside the card rect, so it costs the card no space.
- `backup.js` — the whole record out to a JSON file and back. Deliberately
  small: export is `JSON.stringify(state)` and import is `storage.js`'s
  `sanitize`, so there is neither a second serializer nor a second parser to
  drift from the schema.
- `render.js` — the repaint dispatcher: `SECTIONS` (one key per independently
  repaintable region), `render` / `renderAll`, the
  view switch (`setView`: the one place a screen changes and the one place
  browser history is pushed, replaced or popped for it (#23) — flip the
  `hidden` flags on Today / Games / Team / Season / Settings, scroll to the
  top; deliberately *not* a View Transition — see the comment there) and the
  theme. **The Roster view became "Team" in A40** — label first (slice 1),
  then the stored key and the `id` (slice 2). The old key `roster` is still
  written in coaches' backup files, so `sanitize` translates it in exactly one
  place (`VIEW_WAS` in `storage.js`); nothing else in the app may. A guard
  must still not assume the label and the key are the same string — they
  agree today by coincidence, not by rule.
  It imports every renderer, so
  nothing may import it back: a view that needs to repaint is handed the
  callback at boot, through its `init*` function. That rule is what keeps the
  import graph a tree.
- `edit.js` (#122) — the one path every coach edit takes: `EDITS`, a table
  from each kind of change (a slider drag, a typed field, a Settings toggle)
  to whether it is a record edit or a preference, which `SECTIONS` keys it
  repaints, and whether it paints now or after the same 140ms debounce
  `render.js`'s own `soon` used to own; and `edit(kind)`, which every handler
  calls instead of naming a repaint or a `SECTIONS` key itself. It imports no
  view and touches no DOM — `render` and `retireUndo` are handed to it once,
  at boot, through `initEdits`, the same `init*` shape the views take their
  own callbacks through.
- The views, one module each — `roster-view.js`, `teams-view.js` (Today: the
  team's name and team-switcher menu in the large title, multiple days stacked with headings and their games, the Team and Season entries below, and Add a game),
  `season-view.js` (the Season view, in grouped cards like Team's: minutes per
  player across every filed game, the across-the-day chart when two or more
  games are on today, filed games grouped by day in one card, and the one
  place a game filed by mistake can be deleted),
  `game-setup.js`, `strategy.js`, `balance.js`,
  `rules.js`, `pills.js`, `plan-view.js`, `timeline.js`, `gamemode.js`,
  `tour.js`, `onboarding.js`, `shortcuts.js` (the keyboard and
  the two reference sheets) and `toast.js` (undo, the tip jar, flash).
- `app.js` / `index.html` — the entry point and the markup. `app.js` is now the
  wiring only: the controls no single module owns, and the boot block that
  hands each module its callbacks. The boot also runs `fileIfPast` (#100) after
  the first render, and a `visibilitychange` listener runs it again when the app
  returns to the foreground — unless bench mode is open, in which case it waits
  until bench mode closes.
- `tokens.css` / `app.css` / `card.css` — the styles, in that load order and
  for that reason. `tokens.css` is the palette, type, radii and easings plus
  the two theme blocks (dark mode is nothing but the second block — no
  component rule anywhere has a dark variant); `app.css` is the chrome and the
  components; `card.css` is the printed card and the `@media print` block that
  prints it, kept beside the object it describes. The order is load-bearing in
  two places on purpose: `.stage`'s narrow-screen padding and the `@media
  print` overrides both have to come last.
- `sw.js`, `_headers`, `site.webmanifest`, `robots.txt`, `sitemap.xml`, the
  icons and `vendor/` — the rest of what is served.

Outside it: `test/*.test.js` (`node --test`) and
`scripts/check-sw-version.mjs`, the CI guard on the service-worker version.

The suite includes 400-scenario property-based fuzzing of the engine (the
README carries the test count; it is not repeated here). Generation runs
20–50 ms across every configuration tried, including a 20-player roster and a
20-stint game.
