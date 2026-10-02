import { evalIn, step, OVERFLOW_PROBE, DIALOG_OVERFLOW_PROBE, gmBodyProblem, TODAY_HOME, landWiped, FIRST_RUN_STEPS, TIMERS_QUIET, wait } from './dom.mjs';
import { VIEWS } from './sweep.mjs';
import { STATES } from './overlay.mjs';
import { STEP_COUNT as TOUR_STEP_COUNT } from './tour-steps.mjs';
import { LARGE_TEXT, LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';
import { FOUR, TODAY_GAME_READY } from './fixtures.mjs';
import { land } from './page-state.mjs';
import { setGame } from './sheet-drive.mjs';
import { UNDERWAY_SEED } from './rotation-undo.mjs';
import { ROW_STACK_LONG_NAME_STATE, ROW_STACK_STATES, rowStackProblem } from './row-stack.mjs';
import { SWITCH_ROW_STATES, switchRowProblem } from './switch-row.mjs';
import { welcomeBarsProblem } from './welcome-bars.mjs';

/* ---- the same large-text cell, on the app shell ----
 *
 * WHY: `sweepPass` above covers seven static pages at 300-420px, default font
 * size only -- `index.html` itself was never checked at a large root, and a
 * 228px sideways pan on the games view (`table.grid` at 675px in a 320px
 * column) was shippable the whole time. Nothing was wrong with either
 * existing check; this cell simply had no owner.
 *
 * SAME CELL (320px/32px root, where the app's `19em` large-text block is
 * live), every screen `VIEWS` names -- the five chromes differ and only one
 * has to be wrong, the same reason `sweepPass` derives its view list rather
 * than enumerating one.
 *
 * ONE NAVIGATION: a font size needs a reload to apply (`Page.setFontSizes` on
 * a laid-out document reports an unreflowed width), but a view switch reflows
 * on its own, so the reload is paid once.
 *
 * FOLDS STAY AS THEY BOOT, unlike `touchPass`: every screen measures
 * identically with every `<details>` forced open, since folded content is
 * hidden by CSS, not removed, so a closed fold's children still have rects.
 *
 * ALLOWANCES ARE PER VIEW, never blanket -- a blanket tolerance is what let
 * the 228px through. Each number is the smallest covering a deliberate
 * residue, tightened by 1px first to prove it is load-bearing. Do NOT raise
 * one to silence a new failure -- that is a bug in front of the coach. */
const APP_LARGE_TEXT_ALLOW = {
  /* EMPTY, and that is the finding, not an omission. Every screen measured
     clean in this cell once the three defects behind the 2026-08-24 report
     were fixed, so there is no residue to name and every one is pinned at
     zero. Add a key here only for a residue accepted deliberately, with the
     reason on the line and the smallest number that covers it — and tighten it
     by 1px first to prove the number is load-bearing. */
};
/* Every screen `VIEWS` names (Today plus the four it opens), plus BENCH MODE
 * -- the state this pass could not see, and the one a coach is standing in
 * when it matters most. `VIEWS` is `sweepPass`'s own list (#23), read here
 * rather than kept a second time; game mode is a full-screen overlay behind
 * `#gmOpen` that no check had ever enumerated at a large root -- the
 * consequence was `#gmNext2` ("Next stint") sitting at left 349 in a 320px
 * viewport, wholly off screen and green everywhere.
 *
 * The swap picker is here too: picking a player changes the bench list's
 * layout, a different measurement, not the same screen with a class on it.
 * Both close themselves, leaving the app on the games screen. */
/* #146 item 7: a full roster, not the three-line placeholder every other
 * paste/first-run state in this file leaves in the box -- the paste-repeats
 * block and the count line both grow with the list, and neither was ever on
 * screen at this cell past three names. Eleven distinct players plus one
 * repeat (the first name again, without a number, same as the spec's own
 * "one of the group lacks a number" rule for which entry "Drop one" removes)
 * -- twelve lines, the same one list "paste sheet, 12 names + a repeat" and
 * "first-run step 1, 12 names + a repeat" (below) both type, so the two
 * cannot drift apart. */
// Exported so compare-shots.mjs's own "12 names + a repeat" look-check
// states (#146's Proof: "first-run step 1 with 12 names") type this exact
// same list rather than a second one that could drift from this one.
export const PLAYER_LIST_12 = [
  '1 Alex Diaz', '2 Jordan Lee', '3 Sam Rivera', '4 Casey Brooks', '5 Taylor Munoz',
  '6 Jamie Ortiz', '7 Morgan Diaz', '8 Riley Chen', '9 Drew Patel', '10 Avery Kim',
  '11 Reese Nguyen', 'Alex Diaz',
].join('\n');

export const APP_LARGE_TEXT_STATES = [
  ...VIEWS,
  /* AND THE TEAM MENU OPEN, on Today: a native popover is its own box in the
     top layer, sized independently of the screen behind it, and none of the
     five `VIEWS` states above ever opens one. Reported from a real browser
     (#23 review): `.teammenu`'s `min-width: 14rem` beat its own `max-width`
     at a 32px root -- 448px against a 265.6px ceiling in a 320px viewport --
     and the menu overflowed on both axes, invisible to every other state
     here because closing a popover before moving to the next screen is what
     every other click in this file already does. */
  { name: 'team menu open', open: `${TODAY_HOME}; document.querySelector('#teamBtn')?.click()`,
    close: `document.querySelector('#teamMenu')?.hidePopover?.()` },
  { name: 'bench mode', open: `document.querySelector('#gmOpen').click()`,
    close: `document.querySelector('#gmClose').click()` },
  /* AND A TOAST, which this pass could not see either, for a different reason:
     the other states are static and a toast expires. It joins anyway because
     it is drivable — "Sit, rebalance" is two clicks from `#gmOpen`, its copy
     was the longest the app ever put in a toast until A35's sample flash (58
     characters against 86; the state at the foot of this list covers that one)
     and it is the only toast with a button squeezing the message — and because
     `UNDO_MS` is far longer than the settle, so it is still up when the probe
     runs.

     ITS OWN FAILURE IS VERTICAL, which is why `STRANDED_ABOVE` exists below:
     the toast box is anchored to the BOTTOM of the screen and grows upward, so
     a message squeezed to seven pixels wide by the buttons beside it made a
     568px box at y -160 and every horizontal probe in this harness called it
     clean.

     `close` takes the Undo rather than the dismiss, so the pass hands the next
     one an unmodified plan — and the undo path is exercised for free. */
  { name: 'bench mode, undo toast',
    open: `document.querySelector('#gmOpen').click();
           await ${TIMERS_QUIET};
           document.querySelector('#gmFloor .gm-p').click();
           await ${TIMERS_QUIET};
           [...document.querySelectorAll('#gamemode button')]
             .find(b => b.textContent.trim() === 'Sit for the rest').click()`,
    close: `document.querySelector('.toast .tundo')?.click();
            await ${TIMERS_QUIET};
            document.querySelector('#gmClose').click()` },
  { name: 'bench mode, swap picker',
    open: `document.querySelector('#gmOpen').click();
           document.querySelector('#gmFloor .gm-p').click()`,
    close: `document.querySelector('#gmClose').click()` },
  /* #147 item 7: the swap toast's minutes clause; close takes the Undo. */
  { name: 'bench mode, swap toast',
    open: `document.querySelector('#gmOpen').click();
           await ${TIMERS_QUIET};
           document.querySelector('#gmFloor .gm-p').click();
           await ${TIMERS_QUIET};
           document.querySelector('#gmBench .gm-b').click()`,
    close: `document.querySelector('.toast .tundo')?.click();
            await ${TIMERS_QUIET};
            document.querySelector('#gmClose').click()` },
  /* #135 item 12: the last stint's own footer row -- #gmFinish beside #gmDone,
     #gmPrev and the dots, none of which any state above puts on screen
     together, because reaching the last stint is the one moment #gmNext2
     is replaced rather than merely disabled. Stepped there with #gmNext2
     itself (the same control a coach uses), not a fixture flag, since
     `partPlayed` (fixtures.mjs) is named "must not change" by this ticket
     and stepping is the real path to this footer anyway.

     CLOSE STEPS BACK FIRST, with #gmPrev, because stepping is a plain save,
     not an undoable edit -- there is no Undo to take the way `bench mode,
     undo toast` above does. Left at the last stint, this state would hand
     RICH's game 0 to every later state already part-played, so the close
     walks it back to stint 0 before `#gmClose`, leaving the record exactly
     as this state found it. */
  { name: 'bench mode, last stint',
    open: `document.querySelector('#gmOpen').click();
           while (!document.querySelector('#gmNext2').disabled) { document.querySelector('#gmNext2').click(); }`,
    close: `while (!document.querySelector('#gmPrev').disabled) { document.querySelector('#gmPrev').click(); }
            document.querySelector('#gmClose').click()` },
  /* #24 item 4: the help sheet, the keyboard shortcuts dialog and the first
     tour step, none of which any state above this one opens. #27 item 10
     adds the Who's here sheet to the same reused list: a `dialog.bsheet` is
     a viewport-anchored overlay exactly like the ones this list already
     covers, and half-height (its default) is the shorter box, so a row near
     the bottom of a long roster is the one most likely to fall past either
     edge at a 32px root. Reused from `STATES` by reference rather than
     retyped, so the open/close scripts cannot drift between the two passes
     that drive them. #28 adds its own two: level 1, where the segment and
     every group sit at once, and Add a rule, its own level-2 page with the
     kind chips and the picker (a rule's detail needs a seeded rule, which
     this fixture does not carry, so it is left to `plan sheet` (smoke.mjs)
     the same way `sentence-sheets.mjs` covers what this pass cannot). #143
     adds the other two sentence sheets Who's here sits beside: Format and
     Sub interval, now the same `.pgrp`/`.prow` family. #148 adds a rule's
     own edit page, one cap and one pair. */
  /* #201: every tour step, not only the first -- the box's own fit at
     this cell is exactly what the tour refresh had to add (survey item 1),
     and a check that only ever opened step 1 would never have seen it. */
  ...['help sheet', 'shortcuts sheet',
      ...Array.from({ length: TOUR_STEP_COUNT }, (_, i) => `tour, step ${i + 1} of ${TOUR_STEP_COUNT}`),
      'team color picker', "who's here sheet",
      'format sheet', 'sub interval sheet', 'plan sheet', 'plan sheet, add a rule', 'plan sheet, a cap rule', 'plan sheet, a pair rule',
      'card sheet open', 'hand off sheet open']
    .map(n => STATES.find(s => s.name === n)),
  // #143: no name above forces a mid-word break; this one does (row-stack.mjs).
  ROW_STACK_LONG_NAME_STATE,
  /* #29 item 8: "the game screen on Card and the card sheet have no
     horizontal overflow" at a 32px root -- "card sheet open" is reused by
     reference above; the games view itself is only ever measured on
     Timeline by `VIEWS` (#23's own list), so a coach's actual choice, the
     card, was never on screen in this cell. Switches `#viewSeg` the same
     way a tap does; closes the same way, back to Timeline, so nothing
     downstream inherits the choice. */
  { name: 'game screen on Card',
    open: `${TODAY_HOME}; document.querySelector('.today-game').click();
           document.querySelector('#viewSeg button[data-view="card"]').click()`,
    close: `document.querySelector('#viewSeg button[data-view="timeline"]').click();
            document.querySelector('#backBtn').click()` },
  /* #30 decision 8: the season ledger row collapses to two lines at this same
     cell (see app.css's `19em` block) -- `season` (`VIEWS`, above) only ever
     measures the totals list and the empty filed-games ledger; a `.sn-game`
     fold's own summary row (title + meta, `.prow`) is a different layout and
     was never on screen here. Opened through its real trigger, same as every
     other state in this list. */
  { name: 'season, filed game open',
    open: `document.querySelector('#todaySeason').click();
           document.querySelector('#view-season details.sn-game').open = true`,
    close: `document.querySelectorAll('#view-season details.sn-game').forEach(d => d.open = false);
            document.querySelector('#backBtn').click()` },
  /* #149 item 16: the Stint by stint table (`#tabledetails`), open, with a
     RICH game -- new headers ('', 'Clock', 'On the floor', 'Comes on',
     'Comes off', 'On the bench') and the reworded spread note both go
     through this fold, and no state above this one ever opens it (it stays
     closed, and a closed `<details>` hides its `.dz-bd` with `display: none`
     -- zero-size, so `OVERFLOW_PROBE` skips it -- until `open` is set). */
  { name: 'stint by stint, open',
    open: `${TODAY_HOME}; document.querySelector('.today-game').click();
           document.querySelector('#tabledetails').open = true`,
    close: `document.querySelector('#tabledetails').open = false;
            document.querySelector('#backBtn').click()` },
  /* #32 item 10: the three steps of the Add-a-game flow, at the cell the
     acceptance criterion names. A full-screen dialog with its own bar,
     scrolling body and fixed footer -- no state above this one has ever put
     one on screen, and the footer's primary is the control the claim is
     really about: it has to stay whole and on screen with the body at a 32px
     root. One state per step, because each body is a different layout (two
     fields and a card; a grid of eleven tiles; four option cards and a
     switch), which is the same argument `bench mode, swap picker` above
     makes for its second entry. */
  { name: 'add a game, step 1',
    open: `${TODAY_HOME}; document.querySelector('#todayAddGame').click()`,
    close: `document.querySelector('#addGameFlow').close()` },
  { name: 'add a game, step 2',
    open: `${TODAY_HOME}; document.querySelector('#todayAddGame').click();
           document.querySelector('#agNext').click()`,
    close: `document.querySelector('#addGameFlow').close()` },
  { name: 'add a game, step 3',
    open: `${TODAY_HOME}; document.querySelector('#todayAddGame').click();
           document.querySelector('#agNext').click();
           document.querySelector('#agNext').click()`,
    close: `document.querySelector('#addGameFlow').close()` },
  /* #134 item 6: the "Rotation changed." Undo toast that ticket's own guard
     (`rotation-undo.mjs`) raises lands INSIDE the open Format sheet, not the
     page-level `#toasts` every state above uses -- `toastHost()` (toast.js)
     mounts the snackbar inside whichever `dialog.bsheet[open]` is up, and no
     state above this one ever puts a toast there. Seeded with
     `UNDERWAY_SEED`, the exact "Hawks underway at live.at 2, one hand swap"
     record `rotation-undo.mjs` drives its own item 1 Format edit from --
     reused rather than re-derived, so the two fixtures cannot drift apart --
     then the same − stepper on minutes per period that check taps.
     `openRotationToastState` (above) returns to the games screen first: the
     three `add a game` states just above leave the app on TODAY, and
     `#sheetFormat` sits inside `#view-games` -- a `showModal()` dialog does
     not render at all while an ancestor is `display: none`, `[open]` and its
     own `display: flex` notwithstanding, so opening it without navigating
     back first would raise a toast this pass could never see. It then does
     the seeding and the tap as two separate `evalIn` calls with a real wait
     between them (the debounce Format schedules its repaint behind), not one
     `step`-wrapped string the way every plain `open` here is.
     `TOAST_FIT_PROBE`, run on every state below, is the assertion item 6
     actually needs: `OVERFLOW_PROBE` only checks the horizontal axis and
     `STRANDED_ABOVE` only the top edge, so neither would have caught a toast
     whose BOTTOM ran off the sheet. `close` takes the toast's own Undo (the
     same restore `rotation-undo.mjs` item 2 already proves) rather than
     leaving the edit in place, closes the sheet, then backs out to Today --
     matching what every state above already leaves for whatever runs next. */
  { name: 'mid-game rotation toast in the Format sheet', rotationToast: true,
    close: `document.querySelector('.toast[data-undo] .tundo')?.click();
            document.getElementById('sheetFormatClose')?.click();
            document.getElementById('backBtn')?.click()` },
  /* #146 item 7: the paste sheet with a full roster in the box, not the
     three lines `team-screen.mjs`'s own paste check leaves it at -- opened
     through the real trigger (`#pasteRow`, the Team screen's own action
     row), typed by setting the field's value and dispatching its own
     `input` event (`roster-view.js` wires `ta.oninput = paintPasteConfirm`
     as a property, so a plain `Event('input')` reaches it same as a real
     keystroke would). Left empty before closing, the same way
     `team-screen.mjs`'s own paste check closes with nothing to lose. */
  { name: 'paste sheet, 12 names + a repeat',
    open: `${TODAY_HOME}; document.getElementById('todayTeam').click();
           document.getElementById('pasteRow').click();
           const ta = document.getElementById('pasteText');
           ta.value = ${JSON.stringify(PLAYER_LIST_12)};
           ta.dispatchEvent(new Event('input'));`,
    close: `const ta = document.getElementById('pasteText');
            ta.value = ''; ta.dispatchEvent(new Event('input'));
            document.querySelector('#sheetPaste .bsheet-close')?.click();
            document.getElementById('backBtn')?.click()` },
  /* #146 item 7: "Add a team" (the team menu's own entry, `teams-view.js`)
     opened onto its step 1 -- the same `stepTeam` body first run's own step 1
     uses (`onboarding.js`, item 6's Design section), reused rather than a
     second copy, so this state is the same layout `stepTeam` paints on
     first run, just reached the other way in. Backing out asks (a name is
     typed) and Discard leaves nothing behind, same as first run's own
     discard-ask. */
  { name: 'Add a team step 1',
    open: `${TODAY_HOME}; document.getElementById('teamBtn').click();
           document.querySelector('.teammenu-add').click();`,
    close: `document.querySelector('#frClose')?.click();
            document.querySelector('#frDiscard')?.click()` },
  /* #146 item 7: the blocked panel's own "Add players" branch (item 5,
     `blockedFix`, state.js) -- the floor is `state.players.length`, not how
     many are marked available, so this trims the roster itself rather than
     reusing `timeline-card-sheet.mjs`'s BREAK_WHO (which only marks players
     absent and never crosses the floor). The removed players are parked on
     `window` rather than dropped, so `close` can hand RICH back exactly as
     every state after this one still expects it. */
  { name: '3-player blocked panel',
    open: `${TODAY_HOME};
           const s = await import('/state.js');
           const rr = await import('/render.js');
           window.__hiddenPlayers = s.state.players.slice(3);
           s.state.players = s.state.players.slice(0, 3);
           rr.renderAll();
           await ${TIMERS_QUIET};
           document.querySelector('.today-game').click();`,
    close: `const s = await import('/state.js');
            const rr = await import('/render.js');
            s.state.players = s.state.players.concat(window.__hiddenPlayers || []);
            delete window.__hiddenPlayers;
            rr.renderAll();
            document.getElementById('backBtn')?.click();` },
  /* #26 item 12: "at 320px with 32px root text ... Today with FOUR has no
     horizontal overflow and nothing stranded above the viewport" -- every
     state above this one measures Today (and the other four chromes) on
     whatever `RICH`'s two-game record renders; none of them ever put four
     passes with their titles, tip-offs, status, summaries and mini rotations
     on screen at once, which is the case this claim is actually about.
     `reloadWithRecord` (`fixtures.mjs`) rather than an `open` script: a font
     size cannot be re-applied without a reload (see the file comment above),
     but `Page.setFontSizes`/`Emulation.setDeviceMetricsOverride` are already
     set for the whole pass, so a reload here keeps rendering at 320px/32px
     and lands back on Today (`reloadWithRecord` waits for `.today-game`).
     LAST OF THE NON-DESTRUCTIVE STATES, deliberately: it changes the loaded
     record, and the trio below either wipes it outright (`firstRun`,
     `tryLanding`) or is never reached again this run (`staticPass` is the
     only pass after this one and it navigates away from `index.html` for
     good) -- so nothing downstream needs `RICH` restored. */
  { name: 'today, FOUR', four: true },
  /* AND THE SIXTH CHROME: the welcome screen, the first thing a coach ever
     sees, and the one screen in the app this cell had never visited.
     `overlayPass` has audited it since it was written; this pass enumerates
     every screen `VIEWS` names and the welcome screen is not one of them —
     it is the screen you get INSTEAD of those five, with `.bar` and
     `#actionbar` both taken off the screen by `applyView` (#33 removed the
     footer this note used to list beside them). A different chrome
     is exactly the argument this list already makes for game mode.

     It is reached by a REAL FIRST RUN — clear the record, reload — not by
     unhiding `#view-welcome` the way `overlayPass` forces it. Forcing leaves
     the games view laid out underneath and `OVERFLOW_PROBE` reports only the
     WORST element on the page, so a forced welcome screen would measure the
     games view and say "welcome screen" over it. That is the whole reason
     this entry costs a navigation.

     MUST STAY LAST, with the five states below it: it destroys the rich
     fixture. Nothing after it in this array would find `#gmOpen`, and
     `staticPass` (the only pass after this one) navigates away from
     `index.html` for good. */
  { name: 'welcome screen, first run', firstRun: true },
  /* AND THE THREE STEPS OF THE FLOW THE STATE ABOVE OPENS ONTO (#36). A46's
     disclosure, A49's fill-in-place and A52's second pane are all gone now --
     "Get started" is `#firstRunFlow`, a full-screen `<dialog>` with the same
     shape `add a game, step 1/2/3` (below) already covers for `#addGameFlow`
     -- so this is that same three-states-per-flow argument again, not a new
     one: each step's body is a different layout (two fields and a roster box;
     two steppers and the sub-frequency rows; a real card through
     `cardPreviewInto`), which is `bench mode, swap picker`'s own reason for a
     state per body repeated a third time in this file.

     `#welTry` OPENS WITH THE SAMPLE ALREADY IN THE DRAFT (decision 7), so step
     1 here is what used to need two clicks and a value check to reach --
     "Set up my team" (`#welStart`) would open the same dialog empty, which is
     already covered at the default root by `test/first-run.test.js`'s
     `newDraft` case, and 320px at 200% text is a claim about a FULL roster
     box, not an empty one.

     CLOSED THE SAME WAY ON ALL THREE: `#frClose` runs the flow's own close
     request, which asks before losing a typed draft on steps 1-2 and finishes
     outright on step 3 (decision 6 -- nothing is lost there, the team already
     exists) -- so `#frDiscard` is always tried and is `undefined` on step 3,
     where it does not exist and does not need to.

     STEP 3 COMMITS A TEAM, same as `welcome screen, sample filled` used to
     leave a filled form behind it and `welcome screen, first run` above wipes
     the whole record: nothing after this trio needs the rich fixture back,
     the state below it wipes again on its own navigation, and `staticPass`
     never touches `index.html` again this run -- so no snapshot here, unlike
     `overlay`'s and `touch`'s copies of this trio.

     THE NAMES ARE `FIRST_RUN_STEPS` (dom.mjs), shared with those two. Only
     the names: what opens and closes a step differs per pass, and this one's
     close is the flow's own `#frClose` rather than a native `close()`. */
  { name: FIRST_RUN_STEPS[0],
    open: `document.querySelector('#welTry').click()`,
    close: `document.querySelector('#frClose')?.click();
            document.querySelector('#frDiscard')?.click()` },
  { name: FIRST_RUN_STEPS[1],
    open: `document.querySelector('#welTry').click();
           document.querySelector('#frNext').click()`,
    close: `document.querySelector('#frClose')?.click();
            document.querySelector('#frDiscard')?.click()` },
  { name: FIRST_RUN_STEPS[2],
    open: `document.querySelector('#welTry').click();
           document.querySelector('#frNext').click();
           document.querySelector('#frNext').click()`,
    close: `document.querySelector('#frClose')?.click();
            document.querySelector('#frDiscard')?.click()` },
  /* #146 item 7: first-run step 1 with a full roster typed in, not the
     three-line sample `#welTry` starts from -- the paste-repeats block and
     the count line both grow with the list, and neither was ever on screen
     at this cell past three names. Wiped and reloaded back onto the welcome
     screen (`firstRun`, above), same as `FIRST_RUN_STEPS` itself needs to be
     reached fresh; `#welStart` ("Set up my team"), the EMPTY starting point,
     since `#welTry` already covers the three-line sample. `PLAYER_LIST_12`
     (above) is the one list this state and "paste sheet, 12 names + a
     repeat" both type, so the two cannot drift apart. */
  { name: 'first-run step 1, 12 names + a repeat', firstRunTypedRoster: true,
    close: `document.querySelector('#frClose')?.click();
            document.querySelector('#frDiscard')?.click()` },
  /* AND THE SENTENCE THE STATE ABOVE STOPPED MEASURING (A50). The sample flash
     is the longest copy the app puts in a toast, and its whole job is telling a
     first-run coach how to undo the thing they just did — so 320px at 200% text
     is exactly where it has to be looked at, and after A49 nothing looked.

     IT IS A NAVIGATION, not a click, for two reasons. `?try=N` is the only path
     that still raises it (the six chart pages link in with their own roster
     size), and `initOnboarding` reads the parameter only while
     `state.onboarded` is false — so the record has to be wiped first, exactly
     as `firstRun` above wipes it and for the same on-new-document reason.

     THE FLASH'S OWN BOX IS ASSERTED, and that is the point of `tryLanding`
     rather than an `open` string. `OVERFLOW_PROBE` reports the WORST element on
     the page, so a state where the toast never appeared would sweep the games
     view underneath it and report clean — the same trap the forced welcome
     screen has above, and the reason a new state is worth less than no state
     when it can quietly measure nothing. So the arrival is checked with
     `checkVisibility`, the text is checked so it is THIS toast and not another,
     and its four edges are checked against the viewport before the generic
     probes run over the page around it.

     IT RACES A TIMER, deliberately and loudly. `flash()` has no button, so it
     dwells `UNDO_MS / 2` — 4.5s — and the boot plus settle ahead of the probe
     is well under a second. If that ever inverts, the visibility assertion
     fails and says so, which is the failure to want; the alternative is a state
     that measures a dismissed toast and calls it clean.

     LAST, with the two states above it: all three destroy the rich fixture, and
     this one leaves a sample team in the record. `staticPass` is the only pass
     after it and it navigates away from `index.html` for good. */
  { name: 'sample flash, ?try= landing', tryLink: 12 },
];
/* THE OTHER EDGE, and the one no probe in this file had. `OVERFLOW_PROBE`
 * answers "can the coach reach it sideways"; nothing answered "is it above the
 * top of the screen", and for a VIEWPORT-ANCHORED overlay that question has no
 * scrollbar to rescue it — content off the top of a fixed box is simply gone.
 *
 * That is exactly how a 275x568 toast at y -160 stayed green: `scrollWidth`,
 * `pans` and both horizontal edges were clean the whole time, and a coach at
 * 200% text was reading the rebalance message from its middle.
 *
 * SCOPED TO FIXED SUBTREES, not the whole page, because everywhere else a
 * negative `top` is just the page being scrolled. The toast itself is a static
 * child of a `position: fixed` container, so the walk has to go down from each
 * fixed root rather than test `position` on the element that overflows.
 *
 * Scrollable ancestors are skipped for the same reason `OVERFLOW_PROBE` skips
 * them: a scroller's content above its own top is one flick away. */
const STRANDED_ABOVE = `(() => {
  const roots = [...document.body.querySelectorAll('*')]
    .filter(el => getComputedStyle(el).position === 'fixed');
  let worst = null;
  const vis = el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if ((!r.width && !r.height) || r.top >= -1 || !vis(el)) continue;
      let n = el.parentElement, scrolls = false;
      while (n && n !== document.body) {
        const ov = getComputedStyle(n).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && n.scrollHeight > n.clientHeight + 1) { scrolls = true; break; }
        n = n.parentElement;
      }
      if (scrolls) continue;
      if (!worst || r.top < worst.top) worst = {
        el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
          + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')),
        top: Math.round(r.top),
      };
    }
  }
  return JSON.stringify({ host: location.host, worst });
})()`;

/* #134 item 6's own opener for `mid-game rotation toast in the Format sheet`
   above: seeds the same underway record `rotation-undo.mjs` seeds (imported
   as `UNDERWAY_SEED`, never re-derived here), then drives the same − stepper
   on minutes per period that check's item 1 taps. Two `evalIn` calls with a
   real wait between them, not one `step`-wrapped string: Format is a
   debounced edit kind (140ms), and `countTo` can still be animating a
   changed number up to 250ms after that -- `rotation-undo.mjs`'s own
   `SETTLE_MS`, matched here for the same reason. */
export async function openRotationToastState(c) {
  // Land on the Hawks game (`.today-game`, the first row -- the same game
  // `rotation-undo.mjs` seeds as `s.state.day.games[0]`) before anything
  // else: the states above this one leave the app on Today, and
  // `#sheetFormat` is a child of `#view-games`.
  await evalIn(c, step(`${TODAY_HOME}; document.querySelector('.today-game').click()`));
  await evalIn(c, setGame(UNDERWAY_SEED));
  await wait(450);
  await evalIn(c, step(`document.getElementById('phraseFormat').click()`));
  await evalIn(c, step(
    `document.querySelector('#sheetFormatBody .pstep-row:last-child .pstep-btn:first-of-type').click()`));
  await wait(450);
}

/* #134 item 6: the toast an underway game's rotation change raises can mount
 * INSIDE an open `dialog.bsheet` instead of the page-level `#toasts` every
 * other toast in this file uses (`toastHost()`, toast.js) -- and neither
 * probe above would have caught it running off the bottom of that sheet:
 * `OVERFLOW_PROBE` only checks the horizontal axis, and `STRANDED_ABOVE` only
 * looks above the top edge. Run on every state, not only the one above that
 * raises a rotation toast: `.toast[data-undo]` is absent everywhere else, so
 * the cost elsewhere is one empty query, and `bench mode, undo toast`'s own
 * page-level toast gets the same check for free -- a regression there fails
 * here too, which is the "does not regress toasts elsewhere" half of this
 * fix. Checks all four edges against `[0, innerWidth] x [0, innerHeight]`,
 * both for the toast's own box and for `.tundo`, since a message that fits
 * while its Undo button does not would be just as unreachable. */
const TOAST_FIT_PROBE = `(() => {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  let worst = null;
  for (const t of document.querySelectorAll('.toast[data-undo]')) {
    if (!t.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    for (const [label, el] of [['toast', t], ['.tundo', t.querySelector('.tundo')]]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const out = Math.max(0, -r.left, -r.top, r.right - vw, r.bottom - vh);
      if (out > 0.5 && (!worst || out > worst.out)) {
        worst = { label, out: Math.round(out * 10) / 10,
          box: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } };
      }
    }
  }
  return JSON.stringify({ vw, vh, worst });
})()`;

/* Wipe the record and reload, so the app puts up the welcome screen by its own
 * route (`setView` forces `welcome` while `state.onboarded` is false) instead
 * of the harness unhiding a `<main>`.
 *
 * A FIXTURE IS NOT A GUARD UNTIL SOMETHING FAILS WHEN IT DOES NOT ARRIVE —
 * same rule `fixturePass` is written under, and it bites harder here: if the
 * wipe or the reload silently did nothing, this state would measure the games
 * view a second time, report clean, and the cell it exists to cover would go
 * on being uncovered while reading green. So it asserts the screen arrived AND
 * that the app's chrome really came off, and it names both buttons — `#welTry`
 * is the one A35 added and the reason this cell was worth closing. */
export async function firstRun(c, origin) {
  /* CLEARING THE RECORD IN THE CURRENT DOCUMENT IS NOT ENOUGH, and the first
     draft of this that did so failed with all three keys back: `browserChecks`
     registers an `addScriptToEvaluateOnNewDocument` that re-seeds
     `benchcard.v3` on EVERY document, so a wiped record is refilled before the
     app's first line runs and the reload lands on the games view. (`goRich`'s
     comment already says that write "still fires on every new document"; it
     is inert only because v6 wins the read order — with v6 gone it is the
     record.) `landWiped` (`dom.mjs`) is what rides a second, later
     on-new-document script to win that race and removes it again straight
     afterwards — see its own comment for why leaving it registered would
     empty the record under `staticPass` too. The seed script is left alone,
     because `smoke-checks.js` reads `window.__SMOKE_VIEWPORT` out of it and
     `staticPass` still runs. */
  await landWiped(c, origin + '/index.html', "document.querySelector('#view-welcome')?.hidden === false");
  const r = JSON.parse(await evalIn(c, `JSON.stringify({
    host: location.host,
    shown: document.querySelector('#view-welcome')?.hidden === false,
    bar: getComputedStyle(document.querySelector('.bar')).display,
    buttons: ['#welStart', '#welTry'].filter(s => document.querySelector(s)).length,
    seeded: Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('Smoke Test')),
  })`));
  const wrong = [
    r.shown ? null : '#view-welcome is still hidden',
    r.bar === 'none' ? null : `.bar is display: ${r.bar}, so the app chrome is still up`,
    r.buttons === 2 ? null : `${r.buttons} of the 2 welcome buttons are in the DOM`,
    r.seeded ? 'a seeded team survived the wipe' : null,
  ].filter(Boolean);
  if (wrong.length) throw new Error(`first run did not arrive on ${r.host}: ${wrong.join('; ')}`);
}

/* #146 item 7's own opener for `first-run step 1, 12 names + a repeat`
   (above): wipes and reloads onto the welcome screen the same way `firstRun`
   does, opens "Set up my team" (the empty start, `#welTry` already having
   its own three-line-sample coverage elsewhere in this list), then writes
   `PLAYER_LIST_12` into the roster field directly and dispatches its own
   `input` event -- `flowField` (trap.js) wires `i.oninput = () => onInput(i.value)`
   as a property, so a plain `Event('input')` reaches it the same as a real
   keystroke would. */
export async function openFirstRunTypedRosterState(c, origin) {
  await landWiped(c, origin + '/index.html', "document.querySelector('#view-welcome')?.hidden === false");
  await evalIn(c, step(`document.querySelector('#welStart').click()`));
  await evalIn(c, step(`const ta = document.getElementById('frRoster');
    ta.value = ${JSON.stringify(PLAYER_LIST_12)};
    ta.dispatchEvent(new Event('input'));`));
}

/* The exact sentence `onboarding.js` flashes on the `?try=N` landing. Pinned
   here as a PREFIX rather than the whole string: `test/sample-team.test.js`
   owns the wording (it fails if the sentence names a destination the nav does
   not offer), and a second copy of the full sentence in this file would make
   every copy edit a two-file edit for no extra coverage. What this needs to
   know is that the toast on screen is the sample flash and not some other
   toast that happened to be up. */
const FLASH_LEAD = 'Sample team loaded.';

/* The `?try=N` landing, which is the only path left that raises that flash.
 *
 * Wiped and navigated with `landWiped` (`dom.mjs`), like `firstRun` above,
 * for a reason that is one step further on: `initOnboarding` reads the
 * parameter only while `state.onboarded` is false, and `browserChecks`'s
 * on-new-document script re-seeds `benchcard.v3` on every document — so
 * without the wipe this would land on the games view of a seeded team with
 * no toast at all, and the state would measure the games view a second time.
 *
 * Returns the flash's measured box for the pass detail, and throws with what
 * it found if the flash is not on screen carrying its own sentence. */
export async function tryLanding(c, origin, n) {
  await landWiped(c, `${origin}/index.html?try=${n}`, "document.querySelector('#toasts .toast .tmsg')");
  const r = JSON.parse(await evalIn(c, `(() => {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const msg = document.querySelector('#toasts .toast .tmsg');
    const box = msg && msg.getBoundingClientRect();
    return JSON.stringify({
      host: location.host, vw, vh,
      games: document.querySelector('#view-games')?.hidden === false,
      /* The [data-id] filter is load-bearing: index.html paints a .tl-skel of
         bare .tl-row divs before the app boots, so a count without it is
         satisfied by the skeleton of a team that was never built. (No
         backticks in here: this whole probe is a template literal, and one
         closed it early -- ReferenceError: data is not defined.) */
      players: document.querySelectorAll('#timeline .tl-row[data-id]').length,
      text: msg && msg.textContent,
      /* NOT getClientRects().length — a box with rects can still be
         opacity: 0 or inside a content-visibility subtree. */
      seen: !!msg && msg.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      box: box && { l: Math.round(box.left), r: Math.round(box.right),
                    t: Math.round(box.top), b: Math.round(box.bottom),
                    w: Math.round(box.width), h: Math.round(box.height) },
    });
  })()`));
  const b = r.box;
  const wrong = [
    r.games ? null : 'the games view is not on screen, so the deep link never built the team',
    r.players === n ? null : `the plan holds ${r.players} players, not the ${n} the link asked for`,
    r.text ? null : 'there is no toast on screen — the flash never appeared, or it expired first',
    r.text && r.text.startsWith(FLASH_LEAD) ? null : r.text ? `the toast on screen is "${r.text}", not the sample flash` : null,
    !r.text || r.seen ? null : 'the flash is in the DOM but not visible',
    !b || (b.w > 0 && b.h > 0) ? null : 'the flash measures 0px',
    /* Its OWN edges, not the page's worst element: see the state's comment. */
    !b || b.l >= -1 ? null : `the flash starts at x ${b.l}, off the left edge`,
    !b || b.r <= r.vw + 1 ? null : `the flash reaches ${b.r}px in a ${r.vw}px viewport`,
    !b || b.t >= -1 ? null : `the flash starts at y ${b.t}, above the top of the screen`,
    !b || b.b <= r.vh + 1 ? null : `the flash ends at y ${b.b} in a ${r.vh}px viewport`,
  ].filter(Boolean);
  if (wrong.length) throw new Error(`?try=${n} on ${r.host}: ${wrong.join('; ')}`);
  return `${b.w}×${b.h} at y ${b.t}`;
}

/* #28 item 11: the two Plan-sheet states named in "What would settle it" get
   the dialog-relative probe too, on top of the viewport-relative one every
   state already gets above -- see `DIALOG_OVERFLOW_PROBE` (`dom.mjs`) for why
   a second probe is worth having even though the two agree today. Not every
   state: the other dialogs this pass already visits (`help sheet`,
   `shortcuts sheet`, `who's here sheet`, `team color picker`) are not this
   ticket's surface, and adding an assertion nobody asked to a screen nobody
   changed is exactly the "while I am in here" `AGENTS.md` rules out. */
const DIALOG_CHECKED_STATES = new Set(['plan sheet', 'plan sheet, add a rule',
  /* #32 item 10: the same two probes for the three flow steps. The
     dialog-relative one earns its place twice over here: the flow's body
     scrolls (`.flow-body` is `overflow-y: auto`, which computes overflow-x
     to `auto` as well), and the viewport probe above deliberately forgives
     anything inside a scroll container -- so without this probe the tiles,
     the option cards and the two fields would be measured by nothing. It
     also carries rule 2a for these rows: if the flow never opens, `dialog:
     false` fails the state instead of quietly measuring Today. */
  'add a game, step 1', 'add a game, step 2', 'add a game, step 3']);

// #147 item 4/#167: the one state with a player pick on screen.
const GM_BODY_CHECKED_STATES = new Set(['bench mode, swap picker']);

export async function appLargeTextPass(c, origin) {
  const problems = [];
  let allowed = 0;
  let flash = '';
  await land(c, origin, { ...LARGE_TEXT });

  for (const v of APP_LARGE_TEXT_STATES) {
    const where = `${v.name}@${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
    try {
      /* `SETTLE`, not `sweepPass`'s flat 500ms: the sweep pays that once per
         view and then measures 121 widths behind it, so the sleep is 0.4% of
         its cost; here it would be half the pass. Waiting on the animations
         themselves is both cheaper and stricter. */
      if (v.firstRun) await firstRun(c, origin);
      else if (v.tryLink) flash = await tryLanding(c, origin, v.tryLink);
      else if (v.four) await land(c, origin, {
        record: FOUR, ...LARGE_TEXT,
        ready: TODAY_GAME_READY, freshHistory: true,
      });
      else if (v.rotationToast) await openRotationToastState(c);
      else if (v.firstRunTypedRoster) await openFirstRunTypedRosterState(c, origin);
      else await evalIn(c, step(v.open));
      const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
      const slack = APP_LARGE_TEXT_ALLOW[v.name] || 0;
      if (o.pans) problems.push(`${where}: page pans sideways`);
      if (o.worst && o.worst.out > slack) {
        problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`
          + (slack ? ` (${slack}px allowed)` : ''));
      } else if (o.worst) allowed++;
      const up = JSON.parse(await evalIn(c, STRANDED_ABOVE));
      if (up.worst) problems.push(`${where}: ${up.worst.el} starts at y ${up.worst.top}, above the top of a fixed overlay`);
      const tf = JSON.parse(await evalIn(c, TOAST_FIT_PROBE));
      if (tf.worst) {
        problems.push(`${where}: the toast's ${tf.worst.label} is ${tf.worst.out}px outside `
          + `[0, ${tf.vw}]x[0, ${tf.vh}] (box ${JSON.stringify(tf.worst.box)})`);
      }
      if (v.rotationToast) {
        // rule 2a of /new-guard: without this, a Format edit that stopped
        // raising a toast at all would leave `TOAST_FIT_PROBE` with nothing
        // to measure and this state would pass having checked nothing.
        const raised = JSON.parse(await evalIn(c, `!!document.querySelector('.toast[data-undo]')`));
        if (!raised) problems.push(`${where}: no Undo toast was raised -- nothing was measured`);
      }
      if (v.name === 'bench mode, swap toast') {
        // rule 2a: a failed swap would raise no toast to measure.
        const msg = await evalIn(c, `document.querySelector('.toast .tmsg')?.textContent ?? null`);
        if (!msg || !msg.includes(' on for ')) {
          problems.push(`${where}: no swap toast text found (got ${JSON.stringify(msg)}) -- nothing was measured`);
        }
      }
      if (DIALOG_CHECKED_STATES.has(v.name)) {
        const dd = JSON.parse(await evalIn(c, DIALOG_OVERFLOW_PROBE));
        // rule 2a of /new-guard: a check that measured nothing fails, rather
        // than passing silently because the dialog it expected never opened.
        if (!dd.dialog) problems.push(`${where}: no open dialog to check for a dialog-relative overflow`);
        else if (dd.worst) problems.push(`${where}: ${dd.worst.el} reaches ${dd.worst.out}px past the dialog's own ${dd.dw}px-wide box`);
      }
      const gbMsg = GM_BODY_CHECKED_STATES.has(v.name) && await gmBodyProblem(c);
      if (gbMsg) problems.push(`${where}: ${gbMsg}`);
      const rsMsg = ROW_STACK_STATES.has(v.name) && await rowStackProblem(c, v.name);
      if (rsMsg) problems.push(`${where}: ${rsMsg}`);
      // #221: every state gets the cheap structural query (most find no
      // switch row and cost one empty pass); the two named states also get
      // rule 2a, below.
      const swMsg = await switchRowProblem(c, SWITCH_ROW_STATES.has(v.name));
      if (swMsg) problems.push(`${where}: ${swMsg}`);
      // #199: the demo plan's stint bars, checked only on the one state
      // that renders them (see welcome-bars.mjs).
      const wbMsg = v.name === 'welcome screen, first run' && await welcomeBarsProblem(c);
      if (wbMsg) problems.push(`${where}: ${wbMsg}`);
    } catch (e) {
      problems.push(`${where}: ${e.message.split('\n')[0]}`);
    } finally {
      if (v.close) await evalIn(c, step(v.close))
        .catch(e => problems.push(`${where}: did not close — ${e.message.split('\n')[0]}`));
    }
  }
  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${APP_LARGE_TEXT_STATES.length} states (${APP_LARGE_TEXT_STATES.map(v => v.name).join(' + ')}), nothing stranded past either side edge or above a fixed overlay`
        + (flash ? `, sample flash ${flash}` : '')
        + (allowed ? ` (${allowed} recorded residue)` : ''),
  };
}
