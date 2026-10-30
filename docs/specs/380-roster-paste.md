# #380 — Pasted rosters: strip list bullets, drop a header row

## Issue

#380. A pasted roster keeps leading list bullets (`• Maya Webb` → card name
`•MAY`), and a spreadsheet header row (`Jersey<TAB>First<TAB>Last`) becomes a
phantom player.

## Goal

A coach pastes whatever the league emailed — a bulleted list, or rows copied
from a spreadsheet with a header row — and gets exactly the kids on it: no
bullet on any name, no player called "Jersey First Last".

## Survey (main at 078e912)

| Claim in the issue | Verdict | Evidence |
| --- | --- | --- |
| `parseRosterLine` trims only `[\s,;|]` at the ends | holds | `app/roster.js:30` |
| `• Maya Webb` keeps the bullet | holds | no rule strips `•`; the leading-number regex (`:25`) also fails on `- 12 Maya Webb` because the line starts with `-` |
| A tab header row becomes a player | holds | `parseRoster` splits on `[\r\n]+` and parses every line |
| A tab collapses to a space | **falsified** | `:30` collapses only runs of two or more (`\s{2,}`), so `12\tMaya\tWebb` reads as `Maya<TAB>Webb`. The build widens it to `\s+` so criterion 3 holds; every single whitespace character now becomes one space. |
| #146 keeps `Webb, Maya` as typed | holds | `parseRoster` doc comment; `test/roster.test.js` "a text with a line break never splits on commas" |

Callers: `parseRoster` in `onboarding.js` (step 1 count and build) and
`roster-view.js` (paste sheet). `dropRepeat` calls `parseRosterLine` per line,
so it inherits the bullet strip.

## What would settle it

`node --test` over `parseRoster` (`test/roster.test.js`):

1. `• Maya Webb\n• Eli Tran\n• Devon Ellis` → `[{number:'',name:'Maya Webb'},{number:'',name:'Eli Tran'},{number:'',name:'Devon Ellis'}]`.
2. `- 12 Maya Webb\n- 4 Eli Tran` → `[{number:'12',name:'Maya Webb'},{number:'4',name:'Eli Tran'}]`.
3. `Jersey\tFirst\tLast\n12\tMaya\tWebb\n4\tEli\tTran` → `[{number:'12',name:'Maya Webb'},{number:'4',name:'Eli Tran'}]`.
4. `Name\nMaya Webb\nEli Tran` → two players, Maya Webb and Eli Tran.
5. `Maya Webb\nJersey Number Name` → two players; the second is named `Jersey Number Name` (only the first line is checked).
6. `Jersey` alone → one player named `Jersey`.
7. Each of the other bullets — `◦` `▪` `·` `*` `–` `—` — is stripped, with or without a space after it.
8. Every existing test in `test/roster.test.js` (including the #146 comma cases) still passes unchanged.

## Surfaces

Changes: `app/roster.js` (`parseRosterLine`, `parseRoster`), `test/roster.test.js`,
`app/sw.js` (version bump only, via `npm run sw:bump`), and
`docs/architecture/first-run.md` if it lists the accepted shapes.

Must not change: `onboarding.js`, `roster-view.js`, the paste box markup, any
other parsing behavior.

## Constraints

- `roster.js` is one of the four pure modules (`AGENTS.md` § Rules). This task
  is explicitly about it; touch only the two functions above. Keep it pure.
- Reuse: the bullet strip lives inside `parseRosterLine`, so every caller
  (`parseRoster`, the comma path, `dropRepeat`) gets it from one place. Do not
  add a second line parser.
- The header drop lives in `parseRoster`'s line path only. Do not re-derive the
  comma-vs-lines decision: `isCommaList` already makes it.
- `app/roster.js` is precached: run `npm run sw:bump`.
- American spelling.

## Design

**Bullets.** First thing in `parseRosterLine` after the trim: remove one
leading bullet from the set `•` `◦` `▪` `·` `*` `-` `–` `—`, plus any
whitespace after it. This runs before the number regexes, so `- 12 Maya Webb`
then reads as `12 Maya Webb`. A line that is only a bullet becomes empty and is
dropped, as a blank line is.

**Header row.** In `parseRoster`'s line path, after splitting: find the first
non-blank line. Drop it when all of these hold:

- at least one other line parses to a player (so a roster is never emptied
  by it — criterion 6, and `Name\n-` stays `[Name]`);
- it has no digit;
- every whitespace-separated word, lowercased, is in
  `name names first last player players jersey number no no. #`.

Words are split on whitespace only, so a tab-separated header works and a
CSV header (`Jersey,First,Last`) does not — CSV is out of scope.

**Choices the issue did not make** (recorded here and in the PR):

- "First line" means the first non-blank line: a paste that starts with an
  empty line still has its header dropped.
- A header that is the only line is kept (the issue's `Jersey` example,
  generalized: a lone `Name` is kept too).
- The comma-list path (no line break at all) never drops anything: it has no
  rows, so it has no header row.
- Only one leading bullet is stripped, not a run of them.

## Proof

One seam: `node --test` on `parseRoster` / `parseRosterLine` in
`test/roster.test.js` — a pure function with many input cases (`AGENTS.md` §
Test seams). It covers criteria 1–8. No Coach scenario: the paste box and its
preview are unchanged, and they read `parseRoster`'s output. The preview check
(ship step 12) pastes criterion 1 and 3 into the paste sheet on the preview
and reads the preview names.

## Out of scope

Rewriting `Last, First`; splitting CSV commas inside a line (#146 decided both).
Numbered-list markers like `1)` stay read as jersey numbers, as today.
