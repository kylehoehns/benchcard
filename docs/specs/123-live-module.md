# #123 — One module decides where a game stands

## Issue

#123. One small pure module should decide where a game stands: not started,
part-played or finished. It should also decide which stint to show, where to
resume, and the status word the app shows.

## Goal

A game's place in bench mode means the same thing everywhere: the Today
pass, the game screen's sub line, the resume bar, the "Resume · Q2 4:30"
button, the timeline and bench mode itself. They all ask one module, so two
screens can never disagree about whether a game is part-played again (#113's
bug).

## Decisions

The issue is unlabelled and came from an architecture review, not from the
owner. Every open question is decided here from the tree, `CONTEXT.md` and
`AGENTS.md`, so none is the owner's to make.

- **The survey held up the issue's claims.**
  - `live.at` is interpreted in `resumeAt` (`app/card.js`), `openGameMode`'s
    restart and clamp, `closeGameMode`'s `reachedEnd`, `renderGameMode`'s
    clamp and `gmStep`'s clamp (all `app/gamemode.js`).
  - "Is bench mode open?" is a DOM read of `#gamemode`'s `hidden` in
    `dueToFile` (`app/state.js`), four places in `app/toast.js`,
    `app/shortcuts.js`, and three places inside `app/gamemode.js` itself.
  - `resumeAt(p = plans[state.activeGame], g = game())` has the default
    arguments, and `resumeBarAt` carries a comment warning about them.
- **The module is `app/live.js`.** The glossary's **Part-played game** names
  `live.at` in code, and every question here is about the `live` value. The
  module takes a plan and a `live` value, never a game or `state`.
- **The stage words are the glossary's.** `stage(p, live)` returns
  `'not-started'`, `'part-played'` or `'finished'`. `CONTEXT.md` says to avoid
  "in progress" and "live game". "Underway" stays only as the copy on the
  pass, which #92 decided.
- **Today's meanings are kept exactly.** This is a move, not a change in
  behavior:
  - finished: `at >= stints.length - 1` (so a one-stint plan is finished at
    0, as `reachedEnd` says today);
  - not started: otherwise, `at <= 0`;
  - part-played: everything else.
  - A missing `live` is `at: 0`.
- **Where the bench-open fact lives: `state.js`.** Every module that asks
  already imports `state.js`, so there is no cycle. It is a module variable
  with `benchOpen()` to read it and `setBenchOpen(v)` to set it. It is not in
  `state` itself: `state` is saved and snapshotted for Undo, and whether a
  screen is open is neither.
  - `gamemode.js` sets it on the same line that shows or hides `#gamemode`.
- **`resumeBarAt` moves too, and takes its inputs.** It becomes
  `resumeBarAt(days, dayPlans)` in `live.js`. It walks days and games and
  asks `resumeAt`, which is progress logic. `teams-view.js` passes
  `team().days` and `dayPlans`.
- **`labelBench` stays in `card.js`.** It paints buttons, which is view work.
  It calls `resumeAt(plans[state.activeGame] ?? null, game()?.live)` with its
  arguments spelled out.
- **The request budget is re-pinned here, on purpose.** Found at the first
  proof run: `live.js` joins the boot graph and the cold load measures 42
  requests against a ceiling of 41 (#122's `edit.js` had already spent the
  one spare). `AGENTS.md` says a module that joins on purpose has to say so
  out loud, and the hook on `budgets.json` says to re-pin in
  `scripts/budgets.mjs` instead. So `REQUESTS_BASELINE = 41` moves there,
  one under the measured 42, the shape the pin has always had. Folding
  `live.js` into an existing module to dodge the count would undo the
  ticket, which asks for a separate pure module. `AGENTS.md` and the
  `guard-bash.sh` message, which described the old pin, are updated to
  point at it.
- **The existing tests are kept and repointed.** `test/pass-status.test.js`
  and `test/resume-bar.test.js` build real plans and stay as they are, apart
  from the new signatures. The new `test/live.test.js` is the plain-input
  test the issue asks for.

## What would settle it

1. `app/live.js` exists and imports only `./engine.js` (for `fmtClock`). It
   touches no DOM and no `state`. It exports:
   - `stage(p, live)`: `null` when `p` is missing or `!p.ok`, otherwise
     `'not-started' | 'part-played' | 'finished'` by the rules above;
   - `stintIndex(p, live)`: `live.at` clamped to `0 .. stints.length - 1`;
   - `resumeAt(p, live)`: `{ at, where }` when part-played, else `null`.
     `where` is today's string, for example `Q2 4:30`;
   - `passStatus(p, live)`: `{ word: 'Underway', cls: 'now' }` when
     part-played, `{ word: 'Planned', cls: 'ok' }` for any other ok plan, and
     `{ word: 'Needs a fix', cls: 'warn' }` otherwise;
   - `openAt(p, live)`: the position bench mode opens on. `0` when finished,
     otherwise `stintIndex`;
   - `stepAt(p, live, d)`: `live.at + d` clamped like `stintIndex`;
   - `resumeBarAt(days, dayPlans)`: today's walk, latest day first and last
     game first, returning `{ d, i, at, where }` or `null`.
   None of them has default arguments.
2. `app/card.js` no longer exports `resumeAt`, `passStatus` or `resumeBarAt`,
   and nothing in it reads `live`.
3. `app/gamemode.js` asks `live.js` for every `live.at` decision:
   - `openGameMode` sets `live.at = openAt(p, live)`;
   - `closeGameMode`'s `reachedEnd` is `stage(p, live) === 'finished'`;
   - `renderGameMode` uses `stintIndex`;
   - `gmStep` uses `stepAt`.
4. No file in `app/` other than `live.js` compares, clamps or does arithmetic
   on `live.at`. `app/storage.js`'s sanitizer is allowed. A guard enforces
   this by reading the source.
5. `benchOpen()` and `setBenchOpen(v)` are exported from `app/state.js`.
   `gamemode.js` calls `setBenchOpen(true)` where it shows `#gamemode` and
   `setBenchOpen(false)` where it hides it. No file in `app/` reads
   `#gamemode`'s `hidden` property. Setting it, as `gm.hidden = …`, is still
   allowed. A guard enforces this.
6. `test/live.test.js` tests every export with hand-built plans such as
   `{ ok: true, stints: [...] }` and `live` values, with no `withTeam`,
   `computeAll` or DOM stub. Cases:
   - a 4-stint plan at `at` 0, 1, 2 and 3, and past the end (7);
   - a missing `live`;
   - a 1-stint plan;
   - `p` missing and `p.ok === false`;
   - `stepAt` at both ends;
   - `openAt` on a finished game and on a game past the end;
   - `resumeBarAt` preferring the latest day, then the last game, and
     skipping a day with no plans.
7. `test/pass-status.test.js`, `test/resume-bar.test.js` and
   `test/season.test.js` pass, repointed at `live.js`'s signatures. The
   season tests set the fact with `setBenchOpen(true)` instead of stubbing
   `document.querySelector('#gamemode')`.
8. `npm test` and `npm run smoke` pass (50 checks). `app/sw.js` has
   `live.js` in `PRECACHE`, `VERSION` +1, and `SHELL` set to the digest
   `npm test` names.
9. In a browser at 390×844 with the RICH fixture, the Today pass, the resume
   bar, `#gameSub` and the "Resume · …" button agree:
   - with game 0's `live.at` set to 2: the pass reads Underway, the resume bar
     shows, and the button reads `Resume · …`;
   - after stepping to the last stint and closing: the pass reads Planned,
     the resume bar is hidden, and the button reads `Start game`;
   - reopening lands on stint 0.

## Surfaces

Changes:

- `app/live.js` (new);
- `app/card.js`: the three functions leave, and `labelBench` calls `live.js`;
- `app/gamemode.js`, `app/timeline.js`, `app/teams-view.js`: the callers;
- `app/state.js`: `benchOpen`/`setBenchOpen`, and `dueToFile` uses it;
- `app/toast.js`, `app/shortcuts.js`: the bench-open reads;
- `app/sw.js`;
- `scripts/budgets.mjs`, `test/budgets.test.js`, `AGENTS.md` and
  `.claude/hooks/guard-bash.sh`: the request pin (see Decisions);
- `test/`, and comments in `scripts/smoke/` that name `card.js` as the home
  of these functions.

Must not change:

- any copy;
- what any pass, bar, button or bench-mode screen shows for a given `live`;
- `storage.js`'s sanitizing of `live`;
- `live.overrides` handling (`syncOverrides`, `effectiveLineup`,
  `resolveRest`);
- the four pure modules (`engine.js`, `budget.js`, `storage.js`,
  `roster.js`).

## Constraints

- **One answer lives in one place.** Each rule about `live.at` exists once,
  in `live.js`. `passStatus` is built on `stage`, and `resumeAt` is built on
  `stage`. Neither re-checks `at` itself.
- **Reuse, do not re-derive.** `fmtClock` comes from `engine.js`. The
  `where` string is today's, moved as it is. `dayPlans` is `computeAll`'s,
  so nothing re-solves.
- **No import cycle.** `live.js` imports only `engine.js`. `state.js` gains
  no import.
- **Mobile first:** the browser check is at 390×844.
- **Precache bump**, including the new file in `PRECACHE`.
- **`CONTEXT.md`:** the **Part-played game** entry's `_In code_` line names
  `live.js` (`stage`, `resumeAt`), and **Bench mode**'s gains `benchOpen`.
- **`wrap-blind.test.js`:** negative checks use `lacks` from `test/prose.js`.
- **Guards follow `/new-guard`:** each is shown red on a planted violation.

## Design

- `app/live.js`: the seven functions in item 1, with a header comment on why
  the module exists (#113).
- `app/state.js`: `let benchIsOpen = false;`, plus
  `export const benchOpen = () => benchIsOpen;` and
  `export const setBenchOpen = v => { benchIsOpen = !!v; };`. `dueToFile`
  reads `benchOpen()`.
- `app/gamemode.js`: import from `live.js`. Replace the four `live.at`
  decisions and the three `#gamemode` `hidden` reads (the wake-lock grant,
  `visibilitychange` and `gmSwipeDown`) with `benchOpen()`.
- `app/toast.js` (four reads) and `app/shortcuts.js` (one read): use
  `benchOpen()`.
- `app/timeline.js`: `resumeAt(p, g.live)` from `live.js`.
- `app/teams-view.js`: `passStatus(p ?? null, g.live)` and
  `resumeBarAt(team().days, dayPlans)` from `live.js`.
- `app/card.js`: remove the three functions and their comments, and import
  `resumeAt` from `live.js` for `labelBench`.
- A new guard test, `test/live-guard.test.js`, for items 4 and 5.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `live.js`'s exports with hand-built plans and `live` values | `node --test` (`test/live.test.js`) | 1, 6 |
| real plans through the new signatures | `node --test` (`pass-status`, `resume-bar`, `season` tests) | 7 |
| a guard reading `app/`: no `live.at` comparison, clamp or arithmetic outside `live.js`/`storage.js`; no read of `#gamemode`'s `hidden`; `card.js` has no `resumeAt`/`passStatus`/`resumeBarAt` export and no `live` read; `live.js` imports only `./engine.js` (named here, so it is a seam; `/new-guard` applies) | `node --test`, reading source | 2, 3, 4, 5 |
| every smoke check, including `pass-underway` and `resume-bar` | `npm run smoke` | 8, 9 |
| pass, bar, sub line and button agree through a step to the end | a browser look at 390×844 | 9 |
| `test/sw.test.js`'s digest | `npm test` | 8 |

## Out of scope

- Any change to what "part-played" means, such as counting stint 0 as
  started.
- `live.overrides` (swaps and sit for the rest).
- Moving the view code in `labelBench` or `renderResumeBar`.
- Looking a plan up by its game rather than by index (a separate review
  finding).
