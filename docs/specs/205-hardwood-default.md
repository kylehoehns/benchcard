# #205 — New teams start in Hardwood

## Issue

#205. The default team color moves from Graphite (the gray) to Hardwood (the
orange), for new teams and for the screens shown before a team exists.

## Goal

A coach who sets up Benchcard for the first time, or adds a second team, sees
Hardwood from the first frame: on the welcome screen, through first run, and on
the new team. A coach who already has a team sees no change, and a coach who
wants the gray can still pick Graphite and keep it.

## Decisions

The owner settled the issue's four questions on the issue thread, taking the
recommended answer each time:

1. **Existing teams keep their saved color.** A saved color that is one of the
   nine is never rewritten.
2. **A team record with no `color` key, or one that is not one of the nine,
   shows Hardwood.** It follows the new default. No separate "missing means
   Graphite" rule is kept.
3. **The welcome screen and first run use Hardwood**, so the first team does
   not change color the moment it is created.
4. **The picker lists Hardwood first and Graphite second.**

The survey checked every claim the issue makes about the tree. Most hold. Four
things are different from what the issue says, and two of them need a design
choice (A and B below). The owner confirmed both on the issue thread.

- **Decision 1 needs no migration.** `saveState` (`app/storage.js:756`)
  writes the sanitized state with `JSON.stringify`, and `sanitizeSettings`
  always fills in `color`. So every team loaded and saved since #25 already
  has `color: 'graphite'` written out, and keeps it. Decision 2 only reaches a
  record that has not been opened since #25, a hand-edited file, or an old
  backup file.
- **A. "Add a team" copies the current team's color today.** `commitAddTeam`
  (`app/onboarding.js:711`) calls `newTeam(name, players, team()?.settings)`,
  and `newTeam` keeps the whole settings block, color included
  (`docs/design-decisions.md` "A second team copies the first's settings").
  So a team added from a Graphite team would be Graphite, which breaks the
  issue's "a new team made through Add team opens in Hardwood". **Choice:
  `newTeam` copies everything except the color; a new team always starts in
  the default color.** The copy is there because two teams usually share a
  league's rules. The color is there to tell two teams apart, so copying it
  works against its own job.
- **B. The welcome screen can carry a saved Graphite.** `setView` saves on
  every call (`app/render.js:766`), so a device that opened the welcome screen
  before this change, and a coach who removed their last team, both have a
  complete v7 record with `onboarded: false` and one empty placeholder team
  saved as `color: 'graphite'`. The pre-paint script and `sanitize` both read
  that team's color, so those devices would show Graphite on welcome and make a
  Graphite team in first run (`startTeam`, `app/onboarding.js:387`, fills that
  placeholder in place). **Choice: while a record is not onboarded, its teams'
  color loads as the default.** Nobody chose that color: the picker is in
  Settings, and Settings cannot be reached while `onboarded` is false
  (`setView` forces welcome). So this does not break decision 1. The rule
  lives in `sanitize` (`app/storage.js:630`), next to where `onboarded` is
  worked out, and the pre-paint script copies it.
- **Nothing checks the pre-paint script's `COLORS` copy as a list.** The
  issue says a test keeps it in line with `storage.js`. `test/first-paint.test.js`
  does run the real script against `loadState` and compare the two, but its
  `COLOR_CASES` table only reaches six of the nine colors (royal, hardwood,
  forest, maroon, gold, navy). A copy missing `red` or `purple` would pass.
  Nothing checks that the picker's nine buttons in `app/index.html` are in
  `COLORS` order either.
- **`scripts/smoke/team-color.mjs` does not check the default color.** It sets
  `color: 'royal'` and `color: 'graphite'` on its two teams by hand
  (lines 236-238). It keeps passing after this change, but proves nothing about
  the default. A new smoke row does that (see Design).

**Graphite stays the base look in `tokens.css`.** It is still the only color
with no `data-tint` attribute, and "no attribute" still means Graphite. Only the
starting value changes, in the app and in the pre-paint script. Making Hardwood
the base would mean moving every `--tint*` literal in the base blocks, and
`test/graphite-tokens.test.js` pins `--tint` to `--ink` there on purpose. It
would also make an explicit Graphite need a new block. None of that buys a
coach anything.

## What would settle it

All at 390×844 in light mode, smoke's forced font, unless a line says
otherwise. Hardwood light is `#D2500A` = `rgb(210, 80, 10)` with a black label
`rgb(0, 0, 0)`; Graphite light is `rgb(28, 28, 30)`.

1. **The default is Hardwood.** `DEFAULT_SETTINGS.color === 'hardwood'`.
   `sanitizeSettings` gives `'hardwood'` for `{}`, `undefined`, and for a
   `color` of `'teal'`, `'Royal'`, `null`, `42`, `{}`, `[]` and `''`, and for
   the pre-#61 key holding `'bogus'`. Each of the nine names still
   round-trips, `'graphite'` included.
2. **The picker order.** `COLORS` is `['hardwood', 'graphite', 'royal',
   'navy', 'maroon', 'red', 'forest', 'gold', 'purple']`. The `.color-opt`
   buttons in `#colorOpts` carry `data-color` in exactly that order, so the
   first `.color-opt` is Hardwood and the second is Graphite.
3. **First run is Hardwood before the app's JavaScript runs.** With no record
   at all, the pre-paint script stamps `data-tint="hardwood"` on `<html>`. After
   boot, `<html>` still has `data-tint="hardwood"` and `#welStart` (the welcome
   screen's "Set up my team" button) is `rgb(210, 80, 10)` with `rgb(0, 0, 0)`
   text.
4. **A welcome record saved before this change is Hardwood too.** A complete
   v7 record with `onboarded: false` and one empty team saved with
   `color: 'graphite'`: the pre-paint script stamps `data-tint="hardwood"`,
   and `loadState` gives that team `color: 'hardwood'`. The same record with
   `onboarded: true` keeps `'graphite'`.
5. **A record with no `color` key paints Hardwood.** Smoke's `RICH` fixture
   (it has no `settings` block) loads with `data-tint="hardwood"`,
   `#print.btn.primary` is `rgb(210, 80, 10)`, `#teamColorName` reads
   "Hardwood", and `#colorOpts .color-opt.on` is the Hardwood option. The
   pre-paint script gives the same answer for the same record (item 7).
6. **A saved Graphite stays Graphite.** `RICH` with
   `settings: { color: 'graphite' }` loads with no `data-tint` attribute,
   `#print.btn.primary` is `rgb(28, 28, 30)`, and `#teamColorName` reads
   "Graphite". After a second plain reload (no re-seeding), all three still
   hold. Picking Graphite in the picker on a Hardwood team, then reloading,
   gives the same three results.
7. **The pre-paint script and the boot agree on every color.** In
   `test/first-paint.test.js`, one row per `COLORS` entry (all nine, built from
   `COLORS`) gives the same color from the pre-paint script and from
   `loadState`. The "no color set", unknown, not-a-string, v3 and first-run
   rows now expect `'hardwood'`. A row for item 4 is added.
8. **A new team starts in Hardwood.** `newTeam('Ravens', null,
   { color: 'graphite', maxSubs: 5 })` gives `settings.color === 'hardwood'`
   and `settings.maxSubs === 5`. `newTeam('Fresh').settings.color` is
   `'hardwood'`. "Add a team" still passes the current team's settings
   (the existing wiring test in `test/settings.test.js` is unchanged).
9. **The docs agree.** `docs/design-decisions.md` says the fallback is
   Hardwood and that a new team copies every setting except its color.
   `CONTEXT.md` ("Team color"), `docs/architecture.md` (the Team color zone,
   the pre-paint section and the tokens section) and
   `docs/interface-guidelines.md` ("Color") say Hardwood is the default and
   Graphite is the neutral choice with no attribute.
10. **Contrast is unchanged.** `test/contrast.test.js` still walks every color
    in `COLORS` in all four states and passes without edits.
11. `app/sw.js` `VERSION` and `SHELL` are bumped with `npm run sw:bump`, and
    the proof pair is green: `npm test`, then `npm run smoke -- --no-tests`.

## Surfaces

Change:

- `app/storage.js`: `DEFAULT_SETTINGS.color` becomes `'hardwood'` and its
  comment stops saying Graphite is what an old record means. `COLORS` swaps
  its first two entries. `sanitizeSettings`' comment says "else the default".
  `sanitize` sets each team's `settings.color` to the default when the record
  is not onboarded.
- `app/state.js`: `newTeam` sets `color` to `DEFAULT_SETTINGS.color` after
  sanitizing the settings it was given. `activeColor` needs no change (it
  already falls back to `DEFAULT_SETTINGS.color`).
- `app/index.html`: the pre-paint script starts from `'hardwood'`, its `COLORS`
  copy swaps its first two entries, it reads the team's color only when
  `welcome` is false, and its comment is updated. The Hardwood and Graphite
  `.color-opt` buttons swap places. `#teamColorName`'s markup text becomes
  "Hardwood".
- `app/sw.js`: `VERSION` and `SHELL`, through `npm run sw:bump`.
- `test/storage.test.js`, `test/first-paint.test.js`, `test/settings.test.js`:
  the expectations and rows in Proof.
- New `test/color-picker-order.test.js`: the picker markup against `COLORS`.
- `scripts/smoke/team-color.mjs`: a second exported pass,
  `teamDefaultPass`. `scripts/smoke/registry.mjs`: one row for it.
- Docs, by the doc-writer: `docs/design-decisions.md` (lines 44-49),
  `docs/architecture.md` (around lines 564-566, 668-671, 717),
  `docs/interface-guidelines.md` (lines 267 and 277), `CONTEXT.md` (line 275).

Must not change:

- `app/tokens.css`. Graphite stays the base with no block. Hardwood's blocks
  are already there.
- `app/render.js` `applyTint`. It still removes the attribute for
  `'graphite'` and stamps every other color.
- `test/contrast.test.js`, `test/graphite-tokens.test.js`,
  `scripts/tokens-css.mjs`.
- `teamColorPass` in `scripts/smoke/team-color.mjs`. Its teams set their
  colors by hand, so it keeps passing as it is.
- `commitAddTeam` in `app/onboarding.js`. It keeps passing `team()?.settings`;
  the color rule lives in `newTeam`.
- `scripts/og.mjs`. It already sets `color: 'hardwood'` by hand.
- `docs/specs/25-team-color.md` and every other older spec. They are the record
  of what was asked at the time.
- `notes/mockups/prototype/`. Its sample team stays Graphite.

## Constraints

- **Precache bump.** `index.html`, `storage.js` and `state.js` are all in the
  precache list, so run `npm run sw:bump` in the same change, and
  `npm run check:history` before pushing.
- **`storage.js` is one of the four pure modules.** This task is about its
  default, so changing it is in scope. Keep it to the default, the order and
  the not-onboarded rule. `sanitize` must stay idempotent (running it twice
  gives the same record).
- **One answer in one place.** The default is typed in two places that cannot
  share code: `DEFAULT_SETTINGS.color` and the pre-paint script's starting
  value. Item 7's rows are what holds them together, by running the real
  script against `loadState`. The same goes for the pre-paint `COLORS` copy
  and the picker buttons; the new rows and the new order test hold those.
  Do not add a third copy of the default anywhere (for example a literal
  `'hardwood'` in `activeColor` or `applyTint`).
- **Reuse, do not re-derive.** `newTeam` reads `DEFAULT_SETTINGS.color`; it
  does not type `'hardwood'`. The smoke pass reuses `RICH`, `reloadWithRecord`
  and `seeded` from `scripts/smoke/fixtures.mjs`, and the `step`/`evalIn`
  helpers. The order test reads `COLORS` from `app/storage.js` rather than
  typing the list. In `test/first-paint.test.js`, `firstPaintTint`'s
  `|| 'graphite'` stays (no attribute still means Graphite), but
  `afterBootColor`'s fallback for "no record at all" becomes
  `DEFAULT_SETTINGS.color`, because the real boot builds `freshState()`,
  whose team comes from `newTeam`.
- **The pre-paint rule mirrors `sanitize`.** "Not onboarded" in the script is
  its existing `welcome` flag (it is `!onboarded(raw)` for a v7 record, and
  `onboarded` already mirrors `sanitize`'s `!!raw.onboarded || anyPlayers`).
  Do not work it out a second way.
- **The card is untouched.** The printed card does not read `--tint`.
- **Mobile first.** Smoke items run at 390×844.
- **Guidelines K1** (the tint goes on three things only) is unchanged: this
  changes which color, not where it goes.
- **No tab bar** (guidelines N1). Nothing here adds one.
- **No prototype side-by-side.** No redesigned screen changes shape. The
  prototype's sample team is Graphite, so `node scripts/compare-shots.mjs`
  shots of the no-color fixtures will now be orange where the prototype is
  gray. That is expected and is not a mismatch to fix here.
- **Smoke files stay under 40,000 bytes.** `team-color.mjs` is 21,767 today.

## Design

**The default.** In `app/storage.js`, `DEFAULT_SETTINGS.color` becomes
`'hardwood'`. `sanitizeSettings` already falls back to it, so a missing or
unknown color becomes Hardwood with no other change. `activeColor`
(`app/state.js:466`) already falls back to it too.

**The order.** `COLORS` becomes `['hardwood', 'graphite', 'royal', 'navy',
'maroon', 'red', 'forest', 'gold', 'purple']`. In `app/index.html`, the
Hardwood button (with its own `data-tint="hardwood"` swatch) moves above the
Graphite button (no swatch `data-tint`; its swatch is painted by
`app/app.css:1809`). Nothing else reads the order.

**A new team.** In `newTeam` (`app/state.js:170`), after
`const s = sanitizeSettings(settings)`, set `s.color = DEFAULT_SETTINGS.color`.
Update the "Copy on create" comment: a new team copies the league settings
from the team it was made from, but its color starts at the default, because
the color is how two teams are told apart. This covers "Add a team", the
placeholder made when the last team is removed, and `freshState`.

**The welcome record.** In `sanitize` (`app/storage.js:630`), work out
`onboarded` once, and when it is false set every team's `settings.color` to
`DEFAULT_SETTINGS.color`. Say why in a comment: a record that is not
onboarded only holds a placeholder team nobody could have picked a color for.
Because `startTeam` fills that placeholder in place, first run then makes a
Hardwood team with no color change.

**The pre-paint script** (`app/index.html:200-217`). Start from
`var color = 'hardwood';`. Swap the first two entries of its `COLORS` copy.
Read the team's color only when `activeTeamObj && !welcome`. Keep
`if (color !== 'graphite') setAttribute('data-tint', color)`. Rewrite the
comment: an unknown or missing color is the default, Hardwood; Graphite still
needs no attribute because it is the base in `tokens.css`; a record that is
not onboarded always gets the default, the same rule as `sanitize`.

**The smoke row.** In `scripts/smoke/team-color.mjs`, add
`teamDefaultPass(c, origin)`, registered in `scripts/smoke/registry.mjs` as
`{ id: 'teamdefault', name: 'new teams start in Hardwood, a saved Graphite
stays', selectable: true, setup: 'rich', run: ..., resetAfter: true }`. It
checks, in this order, reporting each failure with the value it read:

1. Storage cleared through `seeded` (no record), load `index.html`: item 3.
2. `RICH` as it is, through `reloadWithRecord`: item 5, and item 2 read from
   the live picker (first `.color-opt` has `data-color="hardwood"`, second
   `"graphite"`).
3. `RICH` with `teams[0].settings = { color: 'graphite' }`: item 6, then a
   plain `Page.navigate` reload (no seeding) and the same reads again.
4. Back to `RICH` as it is, open Settings, open `#teamColorBtn`, click the
   Graphite `.color-opt`, close the picker, plain reload: item 6's last
   sentence.

Colors are typed as `rgb()` strings, like `teamColorPass` types them, not
computed through `scripts/tokens-css.mjs`.

**Comments that name the old default.** `app/storage.js:183-186` and
`:235-237`, `app/index.html:201-207` and `:1290`, `app/render.js:956-958`
(only if it says Graphite is the default; its "graphite removes the attribute"
stays true), and `test/first-paint.test.js:143-147`. Code comments here are
read as documentation, so a stale "else graphite" is a defect.

## Proof

| Seam | Runs from | Settles |
| --- | --- | --- |
| `sanitizeSettings`, `DEFAULT_SETTINGS`, `COLORS` | `node --test test/storage.test.js`: the existing color tests, retitled, now expect `'hardwood'` (lines 1429-1440, 1465-1472); a new assertion on `COLORS`' exact order | 1, 2 |
| `sanitize` of a not-onboarded record | `node --test test/storage.test.js`: new test, `{ version: 7, onboarded: false, teams: [emptyTeam with color 'graphite'] }` loads `'hardwood'`; the same with `onboarded: true` keeps `'graphite'`; running `sanitize` on its own output gives the same color | 4 |
| `newTeam` | `node --test test/settings.test.js`: new test for item 8, next to "a team created from another copies its settings" | 8 |
| the pre-paint script against `loadState` | `node --test test/first-paint.test.js`: `COLOR_CASES` rows updated to `'hardwood'`, one row per `COLORS` entry built from `COLORS`, and item 4's row. Red first: with only `storage.js` changed, the "no color set" and first-run rows fail with the script stamping nothing (Graphite) while the boot says Hardwood | 3, 4, 5, 7 |
| picker markup order | new `test/color-picker-order.test.js`: the `data-color` values inside `#colorOpts` in `app/index.html`, in order, deep-equal `COLORS`; it counts the buttons it found (9) before comparing. This reads source, so it is a guard: build it with `/new-guard`, and show it red by swapping two buttons back | 2 |
| the booted app | `node scripts/smoke.mjs --no-tests --only "new teams start in Hardwood, a saved Graphite stays"`. Red first: run it before any `app/` change; steps 1 and 2 fail on Graphite values | 2, 3, 5, 6 |
| existing tint behavior | `teamcolor` row unchanged, in the full smoke run | 6 |
| contrast | `node --test test/contrast.test.js`, unchanged | 10 |
| docs | doc-writer, checked by review against item 9 | 9 |
| precache bump | `test/sw.test.js` in `npm test`; `npm run check:history` | 11 |
| the proof pair | the committer: `npm test`, then `npm run smoke -- --no-tests` | 11 |

The full smoke run also covers the risk that another check typed a Graphite
literal for something that reads `--tint`: every smoke fixture has no `color`,
so after this change every check runs on a Hardwood team. The survey read every
`rgb(` literal under `scripts/smoke/`. The ones outside `team-color.mjs`
(`sheet-family.mjs`, `bar-rows.mjs`, `first-run-flow.mjs`) measure `--ink`,
`--surface`, `--sheet`, `--muted` or `--barrow-track`, not the tint, so none
should move. If one does, read the value before changing anything.

## Out of scope

- Changing any saved team's color, or a one-time "try the new color" prompt.
- Making Hardwood the base look in `tokens.css`, or giving Graphite its own
  block.
- The static pages (`about.html` and the six chart pages). They never read a
  team color and stay Graphite (K1, #75).
- The share image (`scripts/og.mjs`). It already sets Hardwood by hand.
- Seeding a color into smoke's `SEED` or `RICH` fixtures, or into
  `compare-shots.mjs`.
- A smoke check that blocks `app.js` to watch the pre-paint frame in a browser.
  `test/first-paint.test.js` already runs the script's real bytes.
