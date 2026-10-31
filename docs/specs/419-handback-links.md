# #419: hand-back links and the season

**Issue** — #419. A filed game comes back from an old link, and a back link opened the next day files the game under the wrong date.

Switched from the small lane mid-build: the diff came out at 32 lines outside test/ and docs/ (limit 20).

## Decisions (made by the lane, closest to the issue's intent)

1. **Filed game.** In `receive`, when the phone has the team and
   `team.season.games` holds the link's game id: change nothing (do not switch
   team, do not open a game, do not carry), return outcome `'filed'`.
   `app.js` shows `You already filed this game.` (flash, no Undo) and does NOT
   set `state.view = 'games'` for this outcome -- the app opens where it was.
2. **Replace takes the played date.** "The day it was played" = the link's
   date, applied only when the link's game has started
   (`finishedGame(live) || playedStints(live) > 0`) and the date is a real
   date. An unstarted game keeps today's behavior (#379 rule). `decode`
   returns that date beside `team`/`stints` (e.g. `played`), without changing
   `days[0].date` (the add path stays as it is). Validate with storage.js's
   existing `validDayDate` (export it; do not write a second date regex).
   On a replace, if `played` differs from the game's current day date, the
   game moves to `dayFor(played)`, and a day it leaves empty is dropped
   ("no empty days", same as `moveGame` in state.js). Open the game at its
   new place.
3. **Toast on replace:** `${teamName || 'Your'} game updated.` with Undo
   (the existing snapshot). The add toast is unchanged.
4. **When the played date has passed on this phone,** boot's existing
   `fileOverdueDay()` files that day right after, under the played date; its
   own toast (`Sat, Sep 12: 1 game filed to the season.`) replaces the
   "updated" one. That is accepted: it names the date and has its own Undo.
   No new toast logic.

## Acceptance values and seams (Coach seam, `test/handoff-scenarios.test.js`)

Both new scenarios must be red on today's code for the behavior's reason.

A. Filed game comes back. `onGameDay()` (clock 2026-09-12), Hawks, Start
   game, Next stint x7, Finish game, share the hand-off link from the Card.
   `comeBackDaysLater(1)` (files Hawks). Open the link again on 2026-09-13.
   Expect: toast `You already filed this game.`; Season lists Hawks once
   (1 game filed); Today does not show Hawks.
B. Back link opened the next day. Same phone plays B: `onGameDay()`, Hawks,
   start, finish, share link (link date 2026-09-12). Then land A's phone with
   Hawks unplayed again (`onGameDay()` fixture), pin the clock to
   2026-09-13 and open the back link with the record kept. Expect: Hawks is
   filed under Sat, Sep 12 (toast `Sat, Sep 12: 1 game filed to the
   season.` and the Season row dated Sep 12), not Sep 13; Ravens is still on
   Today.
C. The existing "a link ahead of the phone imports" test: its second toast
   becomes `Smoke Test game updated.` (Undo still offered).

`openLinkAgain` waits for the games view; give it an optional `ready`
argument (as `comeBackAt` has) for landings that end elsewhere. Add any
driver verb you need to `test/coach.js`; assert only what is on screen.

## Surfaces

Change: `app/handoff.js`, `app/app.js`, `app/storage.js` (export only),
`test/coach.js`, `test/handoff-scenarios.test.js`,
`docs/design-decisions.md` (hand-off section covers both cases).
Must not change: filing (`fileIfPast`), `carryUnplayedDay`, the link format
and its version.

## Out of scope

The add path (a game the phone does not have) keeps #379's date rule. Merging
the "updated" and filing toasts into one is not done.
