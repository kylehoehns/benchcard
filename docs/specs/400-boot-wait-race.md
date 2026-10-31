# #400 — Smoke boot wait sometimes stays on Today: what was checked, and a message that names the cause next time

## Issue

#400. Three CI runs failed with `boot wait timed out: document.querySelector('.card')
on /index.html (page showed /index.html, complete, visible views: view-today)`,
each on a different row, each passing on rerun. The issue asks to reproduce it
on purpose, then fix the cause, and says: if no cause can be found, say what
was checked and close nothing.

## Goal

No cause was found, so this change closes nothing and changes no wait. It
makes the next CI failure say which of the possible causes it was.

## What was checked (none reproduced the failure)

All through the smoke lock, on the rebased tree's ancestor (d6665c8):

- a full `--no-tests` run with `Emulation.setCPUThrottlingRate` 4x: 90 rows, no FAIL;
- a full run with coverage on (CI's shape) at 4x: no FAIL;
- `--only "game title: ..."` at CPU 1x and 6x: passed;
- the six rows around the three failures (three days, game title, team color,
  team default, sheet spacing, Timeline | Card) looped 12 times at 4x: 72 rows, no boot-wait FAIL;
- a `history.back()` left in flight by `TODAY_HOME` racing the next `land`: 0 of 50, CPU 1x to 20x;
- a lost seed: each preceding row, then a `land` that does not seed. Every one
  still painted `.card`, so a lost or late seed does not give this message.

## Decisions

1. **Close nothing.** The issue's own rule. The PR says `Refs #400`, not
   `Closes #400`, overriding the lane's default body ending.
2. **The message keeps its prefix byte for byte**, so `npm run flakes` and
   earlier greps still match, and appends facts after it.
3. **No cap change, no retry** (issue item 4).

## What would settle it

1. `describeBootTimeout(ready, where, facts)` (pure, in
   `scripts/smoke/page-state.mjs`) returns the old prefix
   `boot wait timed out: <ready> on <where> (page showed <path>, <readyState>, visible views: <ids joined by ,>`
   followed by `booted: yes|no`, `sw: controlled|not`, `card note: "<text>"|none`
   (whitespace collapsed to one line), and `record: <key>, <n> day(s), view <v>` /
   `record: none` / `record: unreadable`.
2. `readRecordFacts(storage)` picks the highest `benchcard.v<N>` key and counts
   days the way `storage.js` resolves a record (`teams` array, else the record
   is the team; `activeTeam` clamped). `bootWait` runs it in the page on timeout
   and throws the message from Node; other results resolve.
3. `land` removes its `Page.loadEventFired` listener with `c.off` and never
   throws on `Page.navigate`'s `errorText`. Only when the error is a boot-wait
   timeout it appends `, navigate error: <errorText>` (if any) and
   `, document: the one navigated to` / `NOT the one navigated to (loader a vs b)` / `unknown`
   (no loaderId, frame tree error, or no answer in 1s). Other errors are rethrown untouched.
4. `npm test` and a full `npm run smoke` stay green.

## Surfaces

- `scripts/smoke/page-state.mjs` — `describeBootTimeout`, `bootWait`, `land`.
- `test/smoke-page-state.test.js` — cases for items 1 to 3; the fake client gains `off`.

## Proof

Unit seam: `test/smoke-page-state.test.js`, with a fake CDP client, for items 1
to 3. A green smoke run never times out, so the in-page fact gathering was
proved by a scratch script that forces three timeouts (ready `false`, a 404
page, a refused port). The refused port showed that an error page denies
`localStorage`, so the page reads it inside a try and says `record: unreadable`.

## Out of scope

Any change to the app, the 3s cap, or row code. Fixing the cause, once a
failure names it.
