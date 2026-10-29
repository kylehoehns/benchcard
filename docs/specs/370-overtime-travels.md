# #370 — overtime travels in the share link and prints as OT on the card

## Issue

#370 (parent #366): a game's overtime reaches the places a game goes outside
bench mode — the hand-off link, the printed card, backup and restore — and the
mini rotation draws it.

## Goal

An assistant who opens the coach's link sees the same overtime stints and the
same five. A reprinted card names overtime pages "OT" and "OT2", never "Q5". A
backup restores into the same overtime stint. The mini rotation on the game
pass shows the minutes a kid played in overtime, which already count in their
total.

## What would settle it

Default fixture: 10 players, 2 × 16, `everyN` 4, seed fixed, Even strategy.

1. **Link carries overtime.** That game with one 2-minute overtime
   (`{ minutes: 2, who: 'next' }`), encoded and decoded on a fresh record:
   bench mode shows the OT stint with the same five, and the header reads
   "OT · 2:00 to 0:00". A Keep this five / Strongest five overtime arrives with
   its `who` and `five` (cleaned by `sanitizeTeam`, as any stored game).
2. **Older receiver.** The same link decoded by a receiver that drops the
   `overtime` field (the payload's `g.overtime` deleted before `receive`)
   opens without error and shows regulation only: 8 stints, no OT.
3. **Card labels.** The card's stint rows for that game print "OT" on the OT
   stint (already true; a test pins it). A game with two overtimes prints "OT"
   and "OT2". When a card is split into pages, the page title's scope names
   overtime by its name: a page holding Q4 and OT reads "Q4-OT", never
   "Q4-Q5"; a page of only OT reads "OT". (A 4 × 8 game cannot make a lone OT
   page on the pocket card, so the build pins that case with 4 × 12, `everyN`
   2 and a 6-minute overtime.)
4. **No overtime, no change.** A card for a game with no overtime is
   byte-for-byte as today (existing card suites unchanged, and a page title
   for a 2-page regulation game still reads "Q1-Q2").
5. **Backup and restore.** Backup then restore on a fresh record keeps
   `g.overtime` (entries and `five`) and `live.at`: the game reopens on the
   same OT stint.
6. **Mini rotation.** `rowGradient` draws one track per period including each
   overtime period, each track's width proportional to its minutes (the whole
   row is equal per minute). A block in OT shows in the player's color in the
   OT track. A game with no overtime returns exactly today's string.

## Surfaces

Change:
- `app/handoff.js` — `encode` puts `overtime: game.overtime` in `g`.
- `app/card.js` — `buildCard`'s page scope names a period with its
  `periodName` when it is overtime.
- `app/state.js` — `rowGradient` lays out overtime tracks.
- Tests: `test/handoff.test.js`, a card suite (`test/card-scenarios.test.js`
  or `test/card-prints.test.js`), `test/backup.test.js`,
  `test/game-pass.test.js`.

Must not change: `app/engine.js` (period names come from `overtimeLabel`
there), `app/storage.js`'s sanitizer (it already cleans overtime), the
handoff `VERSION` (an added optional field is read by old receivers as
nothing).

## Constraints

- **One answer for a period's name.** OT/OT2 come from the stint's
  `periodName` (`overtimeLabel` in engine.js); do not build "OT" a second way
  in card.js. Recognize overtime with `isOvertimeStint`, as state.js does.
- **The card** is the artefact: a game without overtime must print exactly
  what it prints today (`AGENTS.md` card rule; the card suites are the proof).
- **The privacy claim.** The link still carries only call names; `five` is
  ids already in the payload's roster.
- `decode` cleans through `sanitizeTeam`; do not add a second overtime
  cleaner in handoff.js.
- `rowGradient` stays pure (reads only its arguments). Read overtime minutes
  through `overtimeMinutes` (storage.js), the one helper for them.
- Interface rules P1, D4. Run `npm run sw:bump` when a precached file changes.

## Design

`encode` adds `overtime` to the game payload; `decode` passes it through
`sanitizeTeam`, which already cleans it, and `receive` re-solves, so the OT
stints exist on the receiving phone and the link's stints write over any that
differ, as for regulation. An old receiver's `sanitizeTeam` drops the unknown
field; its `receive` loop skips link stints past its grid.

`buildCard`'s scope maps each period on the page to `Q<n>` for regulation and
to the row's `periodName` for overtime.

`rowGradient` builds a list of period lengths — `g.periods` ×
`g.periodMinutes`, then `overtimeMinutes(g.overtime)` — and gives each track
`length / total` of the row less the gaps. With no overtime every track is
equal, as today.

## Proof

- **`node --test`, `test/handoff.test.js`** (encode → decode → receive):
  items 1, 2.
- **Card suites** (`test/card-*.test.js` harness): items 3, 4.
- **`test/backup.test.js`**: item 5.
- **`test/game-pass.test.js`** (`rowGradient` exports): item 6.
- **`/browser-verify`** on the preview at 390×844: item 1 (open a link with
  overtime in a fresh tab) and item 3 (the card's OT row).

## Out of scope

- Sudden death. Changing the handoff `VERSION`.
- Showing the who-plays choice anywhere outside bench mode.
