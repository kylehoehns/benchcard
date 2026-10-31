# 418 — Jersey 00 stays 00

## Issue

#418: jersey "00" is turned into "0", so a team with a real #0 and a real #00
gets a duplicate-number warning it can never clear, and a number-only card
cannot tell the two apart.

## Goal

A coach whose team has both a #0 and a #00 pastes them in, sees both numbers
as they wear them, gets no duplicate warning, and the card printed by number
shows #00 for that player. A pasted "07" still counts as the same number as a
typed "7".

## What would settle it

- `parseRosterLine('00 Mateo Garcia')` returns `{ number: '00', name: 'Mateo Garcia' }`;
  `'0 Zoe Kim'` gives `'0'`; `'07 Zed'` still gives `'7'`; `'Mateo Garcia #00'` gives `'00'`.
- `duplicateNumbers`: `'07'` and `'7'` are one number (reported as `'7'`);
  `'0'` and `'00'` are not duplicates; `'00'` and `'00'` are (reported as `'00'`).
- `distinctNames`: two players with the same name wearing `'0'` and `'00'` get
  the suffixes `#0` and `#00`, not the parenthesized fallback.
- The normalizing rule, stated once: leading zeros before a non-zero digit are
  stripped ("07" → "7", "007" → "7"); an all-zero number keeps its length, and
  three or more zeros collapse to "00" ("0" → "0", "00" → "00", "000" → "00").
- Coach scenario: paste `0 Zoe Kim` and `00 Mateo Garcia`. The paste preview
  names `#0` and `#00`; after adding, the roster shows no duplicate-number
  warning; the card, set to print by number, shows `00` for Mateo Garcia.

## Surfaces

- Changes: `app/roster.js` (the three copies of `/^0+(?=\d)/` at the parser,
  `distinctNames`' `numKey`, and `duplicateNumbers`), `test/roster.test.js`,
  a scenario in `test/roster-scenarios.test.js` (or `card-scenarios`), and
  `test/coach.js` only if a verb is missing.
- Must not change: `app/storage.js`'s load-time number cleaning (it already keeps
  "00": digits only, at most two), `app/roster-view.js`'s `digitsOnly` (keeps
  "00"), `app/card.js` (prints `p.number` as stored).

## Constraints

- `roster.js` is one of the four pure modules (`AGENTS.md` § Rules). This task
  is explicitly about it, so this rule changes; nothing else in it does.
- One answer in one place: the rule lives in **one** exported helper in
  `roster.js` that all three call sites use. Do not leave three regexes.
- Reuse the existing `duplicateNumbers` and `parseRosterLine` tests' shape
  (`dn(...)` helper). Keep the existing "07 = 7" test.
- A number already saved as "00" (typed, or loaded) is compared as "00" with no
  migration: the comparison does the work, not storage.

## Design

Add `export const jerseyKey = n => …` (name may differ) to `roster.js`:
trim, then strip leading zeros only before a non-zero digit, then collapse a
run of three or more zeros to "00". Use it in `parseRosterLine`'s return,
`distinctNames`' `numKey`, and `duplicateNumbers`. Update the `duplicateNumbers`
doc comment to say "00" is its own number.

## Proof

- `node --test test/roster.test.js` (pure function, many input cases): every
  parser, `duplicateNumbers` and `distinctNames` item above.
- Coach scenario (`test/coach.js` driver): the paste-and-card item.

## Out of scope

- Three-digit jersey numbers (the parser and storage cap numbers at two digits).
- Migrating saved rosters: a stored "0" that was once a "00" cannot be recovered.

## Choices the issue did not make

- "000 can collapse to 00": implemented as collapsing, so the helper is total
  even though the parser never yields three digits.
