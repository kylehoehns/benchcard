# The redesign prototype

This is the look the redesign must match. The redesign is issue #18 and its
children. The issues say how each screen behaves; this folder shows how it
looks.

Match it closely: spacing, type sizes and weights, colors, corner radii, row
heights, the styling of the game sentence, the timeline, the sheets and the
buttons. The redesign should match this prototype's look, and ease of use comes
first.

## How to use it

`index.html` is a clickable phone. It runs the app's real `app/engine.js`, so
every rotation in it is what the solver really produces. Nothing is saved;
reload and it starts over.

Open it from a local server at the **repo root**, because it imports
`../../../app/engine.js`. `npm run serve` serves only `app/`, so it cannot
reach this file. Any plain static server works, for example:

```sh
python3 -m http.server 8300   # from the repo root
# then open http://localhost:8300/notes/mockups/prototype/
```

The phone follows your system's light or dark setting. Set
`data-theme="light"` or `"dark"` on `<html>` to force one.

The PNGs are the quick reference. Each is the phone screen only, 390 × 844,
in `dark-<screen>.png` and `light-<screen>.png`.

| Screen | What it shows |
| --- | --- |
| `today` | Today, with a game pass for each game |
| `game-timeline` | Panthers, the game screen with the timeline |
| `game-card` | The same game switched to Card |
| `game-later` | Hawks, the second game, with "Evens out the 9:00 game." |
| `sheet-who` | Who's here (tap "9 players") |
| `sheet-format` | Format (tap "4 × 8") |
| `sheet-interval` | Sub interval (tap "every 4 min") |
| `sheet-plan` | Plan (tap "even minutes" or "2 rules"; both open the same sheet) |
| `sheet-plan-day` | Plan for Hawks, with "Even out earlier games" on |
| `sheet-rule` | One rule, opened from the Plan sheet |
| `sheet-add-rule` | Add a rule, opened from the Plan sheet |
| `sheet-card` | The card sheet (the share button, top right of a game) |
| `bench` | Bench mode after Start game |
| `bench-selected` | Bench mode with a player on the floor tapped, ready to swap |
| `add-game-1` to `add-game-3` | The three steps of Add a game |
| `team` | The roster |
| `settings` | Settings |
| `settings-team-color` | The Team color sheet |
| `season` | Season |

## Where the prototype and the docs disagree, the docs win

The written rules are in `docs/interface-guidelines.md` (rule IDs below) and in
issue #18. The prototype was made before some of them were settled. Copy its
look, not these parts:

- **No tab bar.** The prototype has Game, Team and Season tabs. The app has
  none (N1). Today is the home screen. Team and Season are rows on Today (N2).
  A gear in Today's header opens Settings, and nothing else does (N4). In the
  prototype, Settings opens from the Team screen instead.
- **Touch targets are 48px** (I1), and list rows are at least 48px (C6). The
  prototype has smaller ones: Timeline | Card and the Plan strategy tabs (32px),
  stepper buttons (44 × 32), the share button (36px), Shuffle (36px), chips
  (40px), header text buttons and menu items (44px), and list rows (46px).
  Keep the look; make the hit area 48px.
- **Back buttons are icons.** The prototype uses text ("‹ Today", "‹ Back").
  The app uses a chevron in a round control, named for where it goes, such as
  "Back to Today" (N5, A2).
- **Sheet buttons.** The prototype puts "Done" top right on every sheet. Live
  sheets (Who's here, Format, Plan) get a ✕ close button top right instead.
  Commit sheets (Add a rule, Paste a list) get ✕ top left and a confirm named
  for the result, like "Add rule", not "Add" or "Done" (C4, W2).
- **Sheet shape.** The prototype's sheets have 14px top corners and always open
  near full height. The app uses 28px top corners (L6), and Who's here opens at
  half height so the rotation shows above it (C3).
- **Flows close with ✕.** Add a game says "Cancel" on step 1 and "‹ Back" after.
  The app puts a close ✕ top left on every step (N8, C10).
- **The tint goes on three things only** (K1): the primary button, the phrases
  in the sentence, and a selected state. The prototype also tints header text
  buttons (Done, Settings), the Shuffle button, the tab bar and the bench's
  "Next change" box. You only see this with a team color, since Graphite's
  tint is the ink color.
- **Sizes are in rem, and the smallest is the footnote** (T2, T3). The
  prototype uses px, with some text below 13px: 11px quarter labels on the
  timeline, 12px labels in bench mode, and 10px tab labels. Use the type scale
  in `app/tokens.css`. Its sizes already match the prototype's main ones (34px
  title, 25px sentence, 22px bench names). One step differs: the prototype's
  row text is 17px at weight 400, and the scale's Body is 1rem (16px). Use
  Body.
- **Players changing at once lives in Settings only** (S2). The prototype
  shows it in Settings and again in the Plan sheet.
- **Settings holds more** (S1): default format, league minimum, how odd
  minutes fall, and whether new games even out the season. The prototype
  shows only team color and players changing at once in the team section.
- **No line above floating controls** (L3). The prototype's tab bar has a top
  border; with no tab bar, this goes away.

The prototype also leaves out some features on purpose. The full build keeps
them, styled the same way as the rest: the By hand and Platoon strategies,
lineup balance, the starting-five, last-period, rest-limit and "one of two
always on" rules, first run, the Resume bar for a part-played game, the
stint-by-stint table, printing, Share image, backup, and the wide layout.

## Use the values, not the CSS

The prototype's CSS values are the reference. Do not paste its CSS into the
app. The app keeps its own tokens in `app/tokens.css` (colors, type scale,
radii, easing, and the light and dark blocks) and its rules in `app/app.css`.
Build the screens with those tokens, set to the prototype's values, and add a
token where one is missing.
