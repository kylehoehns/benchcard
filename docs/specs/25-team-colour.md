# 25 — Team colour

## Issue

#25 (parent #18): a coach gives each team a colour in Settings. Graphite is the
default. The colour tints only the primary action, tappable phrases and
selected states.

## Goal

A coach with a rec team and a club team opens the app and can tell which team
is on screen from the colour of the big button, without reading the name.
Nothing else on screen changes colour: headers, back buttons, icons and menus
stay grey and ink. A coach who never opens the setting sees exactly today's
app.

## Survey (2026-09-16)

- **Settings' team section** exists (#22): `#view-settings`, heading
  `#setTeamHd`, rows painted by `renderSettings()` in `teams-view.js`. #18
  story 60 orders the team section "default format, team colour, players
  changing at once …", so the new row goes directly after "A game is".
- **Team settings** live in `storage.js` (`DEFAULT_SETTINGS`,
  `sanitizeSettings`). An unknown string falls back to the default (the
  `tieBreak` / `TIE_BREAKS` pattern). That is "rejected the same way other
  invalid settings are".
- **The tint today** is `--accent` in `app/tokens.css`, a literal equal to
  `--ink` (#21). `app.css` reads `--accent` in about 50 places, most of which
  K1 forbids tinting: the focus ring, `::selection`, input focus borders,
  help-sheet and tour headings, timeline totals, minute bars, footer and
  `.linkish` links, the team menu's check, the logo in `index.html`, and
  `card.css`'s preview glow.
- **Selected states today** mostly do not read `--accent`: `.seg button.on`
  and `.gm-scope button.on` are a surface pill with ink text; `.chip.sel` and
  `.wel-seg-b.sel` are ink/surface. The ones that do read it are
  `.switch input:checked`, `input[type=checkbox].box:checked`, `.gm-p.picked`,
  `.tour-dots i.on` and `.gm-dot.now`.
- **Tappable phrases do not exist yet.** The sentence is #27. This ticket
  builds the phrase style so #27 only has to use it.
- **There is no sheet primitive yet** (#27/#28). The existing overlay pattern
  is the `.keyswrap` dialog (`#help`, `#keys`, `#confirm`) with `trap.js`.
- **A first-paint script** already resolves theme and view before `app.js`
  arrives, and `test/first-paint.test.js` runs it against `loadState`. #18
  names that test as prior art for this ticket.

### The ticket's contrast rule, checked against its own values

Measured with `scripts/tokens-css.mjs`'s `contrast()`:

| Light fill | White label | Ink `#1C1C1E` label | `#000000` label |
| --- | --- | --- | --- |
| Hardwood `#D2500A` | 4.29 | 3.96 | 4.89 |
| Gold `#A87200` | 4.14 | 4.11 | 5.07 |

Every other light fill clears 4.5:1 with a white label (lowest: Red 6.16).
Every dark fill clears it with a `#1C1C1E` label (lowest: Red 6.13). Every
colour clears 3:1 as text on every ground in its theme (lowest: Gold light on
`--bg`, 3.64).

So the fill values the ticket fixes, and its 4.5:1 test, together force the
label: **Hardwood and Gold carry `#000000` text in light.** "Gold's fill carries
dark text" holds, and Hardwood carries it too, because white on Hardwood is
4.29:1. No value in the ticket changes. No question for the human.

**More contrast.** K5 (cited by the ticket) says every colour has a
`prefers-contrast: more` value. The ticket gives none. #21 decision 4 set the
rule for this: the developer picks them, held to text ≥ 7:1 and controls
≥ 4.5:1. That applies here unchanged.

## What would settle it

At 390×844, on the smoke suite's `RICH` fixture, unless stated:

1. **Row and picker.** `#view-settings`' team section has a row titled
   `Team colour`, directly after "A game is". It shows the current colour's
   name and opens a picker. The picker is a dialog with a close control and
   exactly nine choices in this order: Graphite, Hardwood, Royal, Navy,
   Maroon, Red, Forest, Gold, Purple. Each shows a swatch and its name. The
   current one is marked (`aria-pressed="true"` or `aria-checked="true"`, and
   a visible mark). Choosing one applies it, saves, and closes the picker.
2. **Values.** `app/tokens.css` holds, for the tint fill:

   | Colour | Light | Dark |
   | --- | --- | --- |
   | Graphite | `#1C1C1E` | `#F4F4F6` |
   | Hardwood | `#D2500A` | `#FF7A2A` |
   | Royal | `#2450D6` | `#7C9BFF` |
   | Navy | `#1F3A6E` | `#8FB0EA` |
   | Maroon | `#8C1D3A` | `#EE7896` |
   | Red | `#C0182C` | `#FF6B6B` |
   | Forest | `#1B6A43` | `#4CC98A` |
   | Gold | `#A87200` | `#FFC53D` |
   | Purple | `#5B34B8` | `#AE92FF` |

   Labels: light Hardwood and Gold `#000000`, every other light `#FFFFFF`;
   every dark `#1C1C1E`. Each colour also has a light and a dark
   `prefers-contrast: more` value (developer's choice, item 6's floors).
3. **Storage.** The per-team settings block gains `colour`, one of
   `graphite`, `hardwood`, `royal`, `navy`, `maroon`, `red`, `forest`, `gold`,
   `purple`. `test/storage.test.js` (or `settings.test.js`) covers: a record
   with no `colour` loads as `graphite`; each valid value round-trips through
   `sanitizeSettings`; an unknown string (`'teal'`), a wrong case
   (`'Royal'`), `null`, a number and an object each load as `graphite`. The
   two teams' colours are independent. `DEFAULT_SETTINGS.colour` is
   `'graphite'`.
4. **Where the tint goes, and nowhere else.** With Royal chosen, in light:
   - these read the tint: `.btn.primary` and `.ab-main` and `.gm-nav.next`
     fills (label = the tint label); the phrase style (item 5); and selected
     states: `.seg button.on` and `.gm-scope button.on` text,
     `.chip.sel` and `.wel-seg-b.sel`, `.switch input:checked`,
     `input[type=checkbox].box:checked`, `.gm-p.picked`, and the picker's
     current mark.
   - these do not change from Graphite: the focus ring, `::selection`,
     input focus borders, headings (`.help-h` and the other uppercase
     eyebrows), `#setTeamHd`, back buttons, `.teammenu-check` and the team
     menu, `.linkish` and footer links, timeline totals and minute bars,
     `.tour-dots`, `.gm-dot.now`, `.gm-scope button.act`, icons, the logo
     in `index.html`, and `card.css`.
   A smoke check proves both lists by computed style (see Proof).
5. **Phrases.** A `.phrase` style exists for #27's sentence. With Graphite
   it is ink with a 2px underline (`text-decoration-thickness: 2px`, colour
   ink at the `--accent-line` alpha). With any other colour its text is the
   colour's own fill value and it has no underline.
6. **Contrast test.** `test/contrast.test.js` checks, for all nine colours in
   light, dark, light + more and dark + more: the label on its fill ≥ 4.5:1
   (≥ 7:1 more), and the fill as text on every ground token (`--bg`, `--bg-2`,
   `--surface`, `--surface-2`, `--surface-3`) ≥ 3:1 (≥ 4.5:1 more). It finds
   the nine by the same list the app uses, so a tenth colour without values,
   or values for a colour the app does not offer, fails.
7. **Switching.** With two teams (Graphite and Royal), switching team from the
   team menu changes `.btn.primary`'s computed background from `#1C1C1E` to
   `#2450D6` in the same task as the switch, with no reload.
8. **First paint.** A coach whose active team is Royal does not see a
   Graphite frame first: the pre-paint script stamps the tint from the same
   record `loadState` reads, and `test/first-paint.test.js` runs it against
   `loadState` over its table and fails on any disagreement.
9. **Appearance still works.** Royal in dark shows `#7C9BFF`; switching
   Appearance flips the tint with the theme.
10. `npm test` and `npm run smoke` pass. `test/graphite-tokens.test.js`'s
    "`--accent` equals `--ink`" check still holds (see Design). Any test
    written against markup this ticket replaces is updated in the same change.

## Surfaces

Change:

- `app/storage.js`: `DEFAULT_SETTINGS.colour`, the allow-list, and
  `sanitizeSettings`.
- `app/tokens.css`: the `--tint*` tokens and their per-colour blocks.
- `app/app.css`: the K1 rules in item 4 read `--tint*`; `.phrase`; the Team
  colour row and picker.
- `app/index.html`: the row, the picker dialog, and the pre-paint tint stamp.
- `app/teams-view.js` (or `render.js`): paint the row and apply the tint when
  the team or the setting changes. `app/app.js`: wire the picker.
- `app/sw.js`: bump `VERSION`, set `SHELL`.
- `scripts/tokens-css.mjs`: parse the per-colour blocks.
- `scripts/smoke/`: a check for item 4 and item 7; the overlay and touch checks
  cover the picker once it is in their open-state list.
- `test/contrast.test.js`, `test/storage.test.js` or `test/settings.test.js`,
  `test/first-paint.test.js`, `test/graphite-tokens.test.js` as needed.
- `AGENTS.md`: the smoke check count, if a row is added.

Must not change:

- `app/engine.js`, `app/budget.js`, `app/roster.js`. `storage.js` only as
  above.
- The printed card, `card.js`, `card.css`.
- Player hue tokens and code, and the status colours.
- `about.html`, `advanced.html`, the six chart pages.
- Any stored key other than the new `colour`.

## Constraints

- **Reuse, do not re-derive:**
  - One list of the nine colours, in order, in JS (next to `TIE_BREAKS` in
    `storage.js`). The picker, the sanitiser and the contrast test read it.
    The display name is derived from it or kept beside it, not typed twice.
  - The values live only in `tokens.css`. No hex from the table above appears
    in a JS file.
  - `renderSettings()` stays the one painter of team settings.
  - `applyTheme()` stays the one place `data-theme` is written. The tint gets
    its own attribute (for example `data-tint` on `<html>`), written from one
    function, called from wherever the active team or its settings change.
  - The picker uses the existing `.keyswrap` dialog pattern and `trap.js`.
    No new overlay kind.
  - The pre-paint stamp copies `sanitize`'s clauses the way the view script
    does, and `first-paint.test.js` pins it.
- **The selector trap (#21).** `:root[data-tint="royal"]` outranks
  `[data-theme="dark"]`, so a light tint block written that way paints light
  values on a dark phone. Every per-colour block names its theme explicitly
  (`:root:not([data-theme="dark"])[data-tint=…]` /
  `:root[data-theme="dark"][data-tint=…]`), inside and outside the
  more-contrast media query. The picker's swatches need each colour whatever
  the current tint, so write the blocks so a swatch element can carry its own
  `data-tint` too.
- **Graphite is the base.** The base `:root` / dark blocks declare `--tint*`
  with Graphite's values, so no attribute, or `graphite`, is today's app.
- **`--accent` stays ink.** It keeps every non-K1 use neutral, and
  `graphite-tokens.test.js` keeps holding it to `--ink`. Only the K1 rules
  move to `--tint*`. Renaming `--accent` is out of scope.
- **Guards.** The `tokens-css.mjs` parser change, the contrast test and the
  smoke check judge the tree: `/new-guard`, and each must be shown red.
- **The four pure modules.** `storage.js` changes only by the one key, which
  the ticket asks for. No other behaviour moves.
- **Precache bump.** Bump `VERSION` and set `SHELL` to the digest `npm test`
  names.
- **`requests` budget.** No new module or stylesheet.
- **Mobile first.** 390×844, then 320px with 32px root text; the picker's
  last choice and close control stay on screen and ≥ 44px; the new Settings
  row is ≥ 48px. `APP_LARGE_TEXT_ALLOW` stays empty.
- **Interface guidelines:** K1 (three things only), K3 (no status colour is a
  team colour: red `#C0182C` is not `--err`, and none of the nine equals
  `--ok`/`--warn`/`--err`), K5 (4.5:1 labels, 3:1 controls, a more-contrast
  value for each).
- **Words:** "Team colour", and the nine names exactly as written.

## Design

- **Tokens.** Base blocks add `--tint`, `--tint-2` (hover), `--tint-ink`
  (label), `--tint-soft`, `--tint-line` at Graphite's values (today's
  `--accent*` values), plus `--phrase` / `--phrase-line`. Each non-Graphite
  colour gets a light, dark, light-more and dark-more block setting those.
  Non-Graphite colours set `--phrase-line` to `transparent`, or `.phrase`
  reads a thickness token that is `0` for them — whichever the test can read.
- **Apply.** One function sets `document.documentElement.dataset.tint` from
  the active team's `settings.colour` (removing it for `graphite` is fine).
  It runs at boot, on team switch, on add/remove/undo of a team, and when the
  picker changes the value.
- **Row.** A `setrow` titled `Team colour`, with a button showing a swatch
  and the current name, opening the picker.
- **Picker.** A `.keyswrap` dialog titled "Team colour" with a close button
  and nine full-width option buttons (swatch + name), the current one
  marked. Tapping one saves, applies, closes, and returns focus to the row.
- **Pre-paint.** Extend the head script (or add one beside it) to read the
  active team's `settings.colour` with `sanitize`'s rules and stamp
  `data-tint`.

## Proof

- **`node --test` seams:**
  - `sanitizeSettings` / `sanitize` / `loadState` exports — item 3.
  - `test/contrast.test.js` over `tokens.css` and the colour list — items 2
    and 6. Red when: Hardwood's light label is set to `#FFFFFF`; one dark
    block's selector loses `[data-theme="dark"]`; a colour is added to the JS
    list with no blocks.
  - `test/first-paint.test.js` runs the pre-paint script against
    `loadState` — item 8. Red when the script ignores `activeTeam`.
  - `test/graphite-tokens.test.js` — item 10.
- **Smoke:** a new check, on `RICH` with the active team set to Royal:
  computed styles of the item-4 "tinted" elements equal Royal's values, and
  the "unchanged" ones equal their Graphite values; then switch to a Graphite
  team and the primary fill is `#1C1C1E` (item 7). Red when `.btn.primary`
  is put back on `--accent`, and when `.help-h` is moved onto `--tint`. The
  overlay, touch-target and 320px/32px checks include the open picker.
- **`/browser-verify`** at 390×844, light and dark: Settings with the row;
  the picker open; Royal, Hardwood and Gold applied (screenshots of Today and
  a game); a team switch; a reload with Royal active (no Graphite frame).

## Out of scope

- The sentence itself and its sheets (#27). Only the `.phrase` style ships.
- Renaming `--accent`, or moving non-K1 uses to other tokens beyond keeping
  them neutral.
- App icons, `og.png`, the `theme-color` meta (stays the ground colour).
- The printed card.
- Any colour choice beyond the nine.
