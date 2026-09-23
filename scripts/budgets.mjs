/* Performance budgets for the initial payload.

   The pure half of the budget check: `smoke.mjs` measures what the browser
   actually fetched on a cold load, this compares it with the numbers recorded
   in `budgets.json` and turns the difference into pass/fail lines.

   Two different kinds of rule live here, and the distinction matters:

   * **Recorded baselines** — bytes, request count, DOM nodes. Nobody knows
     what the "right" number is, so we do not invent one: we record today's and
     fail when it grows, and the diff shows up in review as a number going up,
     which is the whole point. `requests` comes from budgets.json. `bytes` and
     `nodes` no longer do: they are hand-pinned below as `BYTES_BASELINE` and
     `NODES_BASELINE`, because the only command that rewrites budgets.json
     would erase the hand-set `requests` pin and is denied. See those pins'
     comments.

   The photo scanner used to add a second, harder rule here: its ~9.6 MB OCR
   bundle had to stay out of the initial payload, and one request was a
   failure. The scanner is gone, so that rule went with it rather than being
   left behind as a check that can no longer fail -- a permanently green line
   is how a list of checks stops being read.

   Slack exists because a headless run is not byte-identical forever — gzip
   output shifts with Chrome's `accept-encoding`, and a one-line comment should
   not turn CI red. It is small on purpose. */

/* Bytes and nodes are REGRESSION ALARMS, not design constraints. Decided
   on 2026-08-24, and right on the merits: this app precaches its
   whole shell in a service worker, so after the first load neither number
   costs a coach anything. The payload budget only ever describes one visit,
   once, and 770 KB is not a problem on a connection somebody installs an app
   over.

   The tight version of these two was actively making bad calls. A UX study
   rejected a navigation index for a 2,885px wall of prose (14,389px at 200%
   text) because it cost five DOM nodes, and ranked twenty worthwhile fixes
   down to three on the same grounds. That is a design decision being made by
   an arbitrary number instead of by what a coach gains. **Node and byte cost
   is NOT a reason to reject a fix. Measure it, report it, spend it.**

   So: generous on bytes and nodes -- wide enough that ordinary work never
   argues with them, tight enough that an accidental 200 KB or a runaway
   render still turns CI red.

   `requests` stays at +2 and is the one deliberately-tight pin. It is not
   about weight: request count is what hurts on a high-latency connection in a
   way raw bytes do not, and it is the thing that stops a new module quietly
   joining the boot graph. Never re-record it.

   `bytesAbs` widened 4096 -> 6144 -> 8192 for #22 (one Settings screen): the ticket
   moves a whole team-settings box into `#view-settings` and adds an
   Appearance group plus three link rows, on top of the box it replaces --
   real markup and CSS, not padding. Against the recorded baseline (736.5 KB)
   the old +25%+4 KB ceiling is 924.7 KB; main measured 918.7 KB and this
   change measured 926.0 KB, 1.3 KB past it. The review fix on the same PR
   (the cog's back target moving into render.js's setView) then measured
   926.7 KB, exactly the 6144 ceiling, so it widened again to 8192: a ceiling
   with zero bytes of room fails the next comment, which is noise rather than
   an alarm. `requests` did not move
   (still 40 of a 41 budget): nothing joined the boot graph, this is bytes
   the same modules already on the wire now spend. Not re-recorded with
   `--update-budgets`, which would also touch the `requests` pin above.

   `bytesAbs` widened 8192 -> 16384 for #23 (Today is home): a new Today
   screen, a header per screen, the team menu and their CSS, replacing the
   view tabs and both chip strips. It measured 929.4 KB against the 928.7 KB
   ceiling, 0.7 KB past it, with `requests` still 40 of 41. Doubled rather
   than nudged, because three nudges in two tickets is the ceiling arguing
   with ordinary work, which this comment says it must not; 936.7 KB still
   turns an accidental 200 KB red.

   `bytesAbs` widened again 16384 -> 24576 on the same PR (#51). Its review
   rounds fixed real bugs -- going home painted late, a reload stacked dead
   history entries, the first frame showed Today's header over a reloaded
   screen -- and each fix brought its CSS, its guard and its comment. The
   last measured 937.9 KB against 936.7 KB. The whole ticket is 926.7 KB
   on main to 937.9 KB here, +11.2 KB of markup, CSS and comments in modules
   already on the wire; `requests` still 40 of 41. The ceiling is now 944.7
   KB. Two widenings in one ticket is itself worth a look: much of the
   growth is prose comments in precached modules, which a coach downloads
   once and never reads. That is a question for a human, not a reason to
   leave a real fix out.

   `bytesAbs` widened 24576 -> 32768 for #24 (text follows the phone's text
   size). The ticket rewrites every font-size and font-weight in app.css onto
   seven tokens, adds the tokens, the iOS root rule, and big-text wraps for
   the help sheet, shortcuts sheet, tour and welcome form that the 320px/32px
   pass now opens. It measured 948.3 KB against 944.7 KB; `requests` still 40
   of 41. The ceiling is now 952.7 KB.

   `bytesAbs` widened again 32768 -> 34816 on the same PR (#54). Two CI rounds
   fixed real 320px/32px overflows on the season screen, each bringing its rule
   and the measurement that found it, and the last run measured 951.6 KB
   against the 952.7 KB ceiling -- 1.1 KB of room, which the next comment
   spends. 34816 is not a round number and is not meant to be: it is as far as
   this can go while `test/budgets.test.js` ("slack is small enough to catch a
   real regression") still fails a second 60 KB vendor script, which needs
   `125000 + bytesAbs < 160000`. A first attempt at 40960 turned that guard red
   -- the guard was right and the widening was wrong. The ceiling is now
   954.7 KB, and the next widening after this one is not available: the answer
   then is to spend fewer bytes, or to re-record the baseline deliberately.
   `requests` still 40 of 41.

   #25 (team color) measured 975.8 KB against that 954.7 KB ceiling: nine
   colors times four theme blocks in tokens.css, the picker markup and its
   CSS. `bytesAbs` cannot move (see above), and budgets.json cannot be
   re-pinned by hand or re-recorded without erasing `requests`. So the
   percentage moves instead, and the absolute part shrinks: 25% + 34816 ->
   33% + 8192. On the real 736.5 KB baseline that is a 987.6 KB ceiling
   (11.8 KB of room). On `test/budgets.test.js`'s 100 KB fixture it is
   141.2 KB, still under the 160 KB second-vendor-script case, so that guard
   still fails a real regression. `requests` still 40 of 41.

   #27 (the sentence, and the Who's here, Format and Sub interval sheets)
   measured 1010.4 KB against that 987.6 KB ceiling: a new sheet primitive in
   trap.js, the sentence and the three sheets' bodies in game-setup.js, the
   pure `sentenceParts`/`intervalWords`/`evensOutLine`/`planSay`/`stepFormat`
   helpers in state.js, and their CSS, replacing the Squad and Game format
   folds they retire -- real markup, JS and CSS for a feature, not padding.
   `bytesAbs` cannot simply widen from 8192 to cover it: `test/budgets.test.js`
   ("slack is small enough to catch a real regression") needs
   `100000 + 100000*bytesPct + bytesAbs < 160000`, which pins `bytesAbs` under
   about 27000 at the current 33% no matter what a real ticket measures. So,
   the same move #25 made: the percentage goes up and the absolute part stays
   put. 33% + 8192 -> 40% + 8192. On the real 736.5 KB baseline that is a
   1039.1 KB ceiling (28.7 KB of room over the 1010.4 KB measured). On
   `test/budgets.test.js`'s 100 KB fixture it is 148.2 KB, still under the
   160 KB second-vendor-script case, so that guard still fails a real
   regression. `requests` still 40 of 41 -- no new module, so nothing joined
   the boot graph.

   #28 (the Plan sheet) measured 1050.8 KB against that 1039.1 KB ceiling:
   the grouped sheet style, the pushed Rule, Add a rule and Lineup balance
   pages, the player tiles and their CSS, replacing the Rules, Lineup balance
   and Across the day folds. Same move as #25 and #27: 40% + 8192 -> 46% +
   8192. On the 736.5 KB baseline that is a 1083.3 KB ceiling (32.5 KB of
   room, so the review fixes on the same PR do not widen it again). On
   `test/budgets.test.js`'s 100 KB fixture it is 154.2 KB, still under the
   160 KB second-vendor-script case. This is the last widening of its kind:
   the percentage has about 5% left before that guard turns red, so the
   next overrun is a deliberate re-record, not another nudge. `requests`
   still 40 of 41.

   #29 (Timeline or Card, and the card sheet) measured 1086.4 KB against that
   1083.3 KB ceiling: the view segment, the summary line, the blocked-plan
   panel with its fix button, and the card sheet's markup, CSS and preview
   cloning, replacing the card fold and the stat tiles. The last nudge above
   said the next overrun should be a deliberate re-record rather than another
   percentage bump, and that is still the right call -- but a re-record has no
   supported route today: `--update-budgets` is denied because it would erase
   the hand-set `requests` pin, and `budgets.json` cannot be edited by hand.
   So the percentage moves once more and the re-record stays open as a
   question for a human: 46% + 8192 -> 49% + 8192. On the 736.5 KB baseline
   that is a 1105.4 KB ceiling, 19.0 KB of room, which is deliberately enough
   that the CI rounds on this PR do not widen it again. On
   `test/budgets.test.js`'s 100 KB fixture it is 153.5 KB, still under the
   160 KB second-vendor-script case, so that guard still fails a real
   regression. About 1% of percentage is left after this one. `requests`
   still 40 of 41 -- no new module joined the boot graph.

   #31 (the roster, and a player sheet) measured 1107.5 KB against that
   1105.4 KB ceiling: the player sheet, the add-a-player sheet and the paste
   sheet -- three dialogs' markup plus their painters, the close-guard seam in
   trap.js and the Edit-mode row -- against the six-column roster grid, the
   inline fields and the bulk-add fold they replace. 2.1 KB net, so this is a
   nudge, not a feature's worth of growth. `bytesAbs` alone cannot carry it:
   `test/budgets.test.js` pins it under about 11000 at the current 49%, which
   would leave half a kilobyte of room and fail on the next CI round. So the
   same move #25 made -- the percentage up, the absolute part down: 49% + 8192
   -> 52% + 6144. On the 736.5 KB baseline that is a 1125.5 KB ceiling,
   18.0 KB of room. On `test/budgets.test.js`'s 100 KB fixture it is 154.4 KB,
   still under the 160 KB second-vendor-script case, so that guard still fails
   a real regression. `requests` still 40 of 41.

   The fix pass on that same PR (A5's identity block, B1's cheap arrow-move
   path reusing `rosterDrop`, and the C2-C5 duplicate-comment and label
   cleanups) measured 1119.4 KB against the 1125.5 KB ceiling above -- 6.1 KB
   of room, not 18.0 KB, now that the feature is actually finished rather than
   estimated mid-review. Still under it, so this is a truthful correction of
   the number recorded above, not another widening: `bytesPct`/`bytesAbs`
   stay exactly as `#31` first set them. `requests` still 40 of 41; DOM nodes
   1363, well under the 1769 budget.

   #32 (add a game in three steps) widened the slack twice, and only the
   second number is worth trusting. Mid-review a projection off the diff put
   the flow at 18.5 KB of new boot graph and 1137.9 KB of payload, over the
   1125.5 KB ceiling, so the slack went 52% + 6144 -> 56% + 3072 for a
   1151.9 KB ceiling. Against the 6605424 that this branch starts from, the
   finished change adds 32040 bytes to `app/` (app/teams-view.js +14383,
   app/app.css +12046, app/index.html +2573, app/state.js +1730,
   app/trap.js +1138, app/shortcuts.js +177, app/rules.js +169,
   app/render.js +3, app/roster-view.js -179, app/sw.js unchanged in size).

   A first attempt at that per-file list was itself wrong, which is worth a
   line because it is an easy mistake to repeat: it was taken by diffing the
   tree against an `app/` copied out of a mid-branch commit rather than out of
   `6605424`, so every file that had already changed once was counted only for
   its second change, and the total came out at 10323. Sizes above come from
   `git cat-file -s 6605424:app/<file>` against `wc -c app/<file>`. Diff the
   merge base, not whatever is lying around.

   What the finished change actually measures, from a full `npm run smoke` on
   the commit this comment ships with: 1151.5 KB. Against the 1151.9 KB
   ceiling that is 0.4 KB of room, which is not room -- a cold load on CI is
   not byte-identical to a cold load here, so the next round could fail on
   noise alone. Hence the second widening, done before a red run rather than
   after one: 56% + 3072 -> 57.5% + 2048. On the 736.5 KB baseline that is a
   1162.0 KB ceiling and 10.5 KB of real, measured room, close to the margin
   the #31 correction was left with.

   The gap between +31.3 KB of diff and +32.1 KB of payload since the 1119.4 KB
   recorded above is small only because both were finally taken the same way.
   A projection is still not a measurement, and only a cold load counts what
   the phone actually fetches. Take the cold load.

   `bytesAbs` comes down again for the same reason it did at #31: on
   `test/budgets.test.js`'s 100 KB fixture 57.5% + 2048 is 159548 bytes, still
   under the 160000-byte second-vendor-script case that guard fails on, so it
   still catches a real regression. `requests` measured 40 of its 41 ceiling,
   unchanged: no new module joined the boot graph -- all of the flow lives in
   `app/teams-view.js` -- so the hand pin is untouched. The new smoke module
   `scripts/smoke/add-game-fit.mjs` is harness, not app, and is not fetched by
   the page at all.

   #33 (floating controls) measured 1164.1 KB on a full cold `npm run smoke`,
   2.1 KB over the 1162.0 KB ceiling above, so the slack goes 57.5% + 2048 ->
   59.5% + 384 for a 1175.1 KB ceiling and 11.0 KB of measured room -- the
   same margin #32 settled on, and for the same reason: a cold load on CI is
   not byte-identical to a cold load here.

   Against `da407aa`, taken file by file with `git cat-file -s da407aa:app/…`
   against `wc -c` (diff the merge base, not a mid-branch copy), `app/` grows
   12448 bytes: app/render.js +10991 (the title observer, the two measure
   passes and the comments that explain them), app/app.css +3039 (the scrims,
   the chip rule and both solid-fallback blocks, against every `.foot*`,
   `.tip*` and `.helpq` rule they replace), app/teams-view.js +263,
   app/gamemode.js -9, app/toast.js -135, app/icons.js -176,
   app/index.html -468, app/shortcuts.js -600, and app/vendor/icons/coffee.svg
   -457 deleted outright with the footer's tip link. app/sw.js is unchanged in
   size. That is within a few hundred bytes of the 12.6 KB the cold load
   gained, which is what you want the two numbers to do.

   READ THIS BEFORE THE NEXT WIDENING. This one is close to the last that will
   fit. `test/budgets.test.js` ("slack is small enough to catch a real
   regression") needs 100000 * (1 + bytesPct) + bytesAbs < 160000 on its
   100 KB fixture, which caps `bytesPct` just under 0.6 once `bytesAbs` is
   spent -- and on the 736.5 KB baseline recorded in budgets.json that caps
   the ceiling at about 1178.5 KB, roughly 3 KB above where this change lands.
   The mechanism is out of road because the baseline is stale by 58%, not
   because the app grew suddenly. So the next ticket that goes over should
   re-record the `bytes` baseline BY HAND to its own measured cold load and
   reset the slack to a small percentage plus a real absolute allowance, sized
   so that baseline * bytesPct + bytesAbs stays under 60000 -- the second copy
   of a 60 KB vendor script that this alarm exists to catch, measured against
   the app's actual size rather than a fixture's. Do not reach for
   `--update-budgets` to do it: that would re-record `requests` too and erase
   the hand pin, which is the one real constraint here. `requests` measured 40
   of its 41 ceiling, unchanged -- everything #33 adds lives in
   `app/render.js`, no new module joined the boot graph, and the two new smoke
   modules are harness the page never fetches. DOM nodes 1362 of 1769. */
/* #35 is the ticket the note above said would come, and it went over: a full
   cold `npm run smoke` measured 1188.4 KB against the 1175.1 KB ceiling. So
   this is the re-pin that note prescribes, and the ratchet stops here.

   `bytes` in budgets.json still reads 754209 (736.5 KB), a 2026-08-24
   measurement five tickets stale. It could not be corrected: `--update-budgets`
   is denied because it would erase the hand-set `requests` pin, and
   `guard-edit.sh` denies a hand edit to that file outright, naming this file as
   the place to change a ceiling instead. Both guards and AGENTS.md agree on
   that route, so the pin is taken here, where a ceiling is allowed to live.
   Nothing reads budgets.json's `bytes` for the check any more -- `pinned()`
   below replaces it -- so there is still exactly one live answer, and it is
   this one. `requests` and `nodes` were left in the file at that point;
   `nodes` came out the same way two tickets later, in the entry below.

   `BYTES_BASELINE` is a measurement, not a guess: a full cold load of the
   commit this ships with, 1216873 bytes at 390x844, taken with
   `node scripts/smoke.mjs --json --no-tests`. It agrees with the tree file by
   file -- Stylesheet 294421 against 293871 bytes of app.css + tokens.css +
   card.css on disk, Document 119624 against 119439 bytes of index.html -- so
   the 61% gap to the old baseline is five tickets of real growth, not double
   counting.

   The slack goes back to a shape that means something: 59.5% + 384 bytes
   becomes 2% + 24 KB. Against the real baseline that is 48913 bytes of room,
   under the 60000 a second copy of a 60 KB vendor script would cost, which is
   the regression this alarm exists to catch -- and now it is measured against
   the app's actual size rather than a 100 KB fixture's. The ceiling is
   1265786 bytes, 1236.1 KB.

   WHEN THIS GOES OVER AGAIN: re-pin `BYTES_BASELINE` here to your own measured
   cold load and say what you measured, the way this entry does. Keep
   `baseline * bytesPct + bytesAbs` under 60000. Do not reach for
   `--update-budgets`, and do not widen the percentage instead of re-pinning --
   that is the ratchet this entry exists to end. `requests` measured 40 of its
   41 ceiling, unchanged: everything #35 adds is CSS and two exports in
   `app/render.js`, no new module joined the boot graph, and the new smoke
   module `scripts/smoke/wide-layout.mjs` is harness the page never fetches.
   DOM nodes 1368 of 1769. */
export const BYTES_BASELINE = 1_216_873;

/* #37: the node baseline, re-pinned DOWNWARD. `budgets.json` records 1519 from
   a 2026-08-24 run; a full cold load of the commit this ships with measures
   1367 at 390x844, taken with `node scripts/smoke.mjs --json --no-tests`. The
   gap is #30-#36 deleting markup -- the folds and their summaries, the old
   inline rule editor, the bulk-add box -- so the recorded number had quietly
   become 152 nodes of free headroom on top of the 250 the slack already
   allows.

   It is pinned here rather than re-recorded in `budgets.json` for exactly the
   reason `BYTES_BASELINE` above is, and that entry carries the reasoning.
   `pinned()` below replaces the file's value, so there is still one live
   answer per metric. (`requests` came from the file until #123 pinned it
   here too; see `REQUESTS_BASELINE`.)

   WHEN A TICKET GENUINELY ADDS NODES: this is a regression alarm, not a design
   constraint (see the note at the top of this file). Measure your own cold
   load, re-pin here, and say what you measured -- do not widen `SLACK.nodes`
   instead, and do not reach for `--update-budgets`. */
export const NODES_BASELINE = 1_367;

/* #123: the request baseline, re-pinned by hand for the first time. Every
   note above says `requests` is the one real constraint, held one under the
   truth so a new module in the boot graph has to say so out loud. This is
   that. #122 added `app/edit.js` and spent the one spare request (41 of
   41, silently: it passed). #123 adds `app/live.js`, the pure module that
   decides where a game stands, and the cold load at 390x844 measures 42.
   Both are real modules on purpose: each is a pure seam the architecture
   review asked for, and folding either into an existing file would undo the
   point of the ticket. So the pin moves 39 -> 41: one under the measured 42,
   the same shape it has always had, with one spare again.

   `budgets.json` still holds 39 and is not edited (a hook denies it, and
   `--update-budgets` would re-record the other numbers too). `pinned()` below
   takes `requests` from here, as it does `bytes` and `nodes`.

   WHEN THE NEXT MODULE JOINS THE BOOT GRAPH: measure the cold load, re-pin
   here to one under it, and say which module and why. Do not raise
   `SLACK.requests`. */
export const REQUESTS_BASELINE = 41;

export const SLACK = { bytesPct: 0.02, bytesAbs: 24_576, requests: 2, nodes: 250 };

/**
 * The recorded baseline with `bytes`, `requests` and `nodes` taken from the hand pins
 * above. Returns null unchanged so a missing budgets.json still fails loudly.
 * @param {{bytes:number, requests:number, nodes:number}|null} recorded
 */
export const pinned = recorded =>
  (recorded ? { ...recorded, bytes: BYTES_BASELINE, requests: REQUESTS_BASELINE, nodes: NODES_BASELINE } : recorded);

const kb = n => `${(n / 1024).toFixed(1)} KB`;
const pct = (got, want) => (want ? `${got > want ? '+' : ''}${(((got - want) / want) * 100).toFixed(1)}%` : 'n/a');

/** The ceiling a measurement is allowed to reach before it counts as a regression. */
export const ceiling = (key, baseline) =>
  key === 'bytes' ? Math.round(baseline * (1 + SLACK.bytesPct) + SLACK.bytesAbs)
    : key === 'requests' ? baseline + SLACK.requests
    : baseline + SLACK.nodes;

/**
 * Compare a measured payload against the recorded baseline.
 * @param {{bytes:number, requests:number, nodes:number}} baseline
 * @param {{bytes:number, requests:number, nodes:number, byType?:object}} measured
 * @returns {{name:string, pass:boolean, detail:string}[]}
 */
export function compare(baseline, measured) {
  const checks = [];
  if (!baseline) {
    checks.push({
      name: 'initial payload budget',
      pass: false,
      detail: 'no budgets.json — record one with `node scripts/smoke.mjs --update-budgets`',
    });
    return checks;
  }

  const rows = [
    ['initial payload ≤ budget', 'bytes', kb],
    ['request count ≤ budget', 'requests', String],
    ['DOM nodes ≤ budget', 'nodes', String],
  ];
  for (const [name, key, fmt] of rows) {
    const got = measured[key], want = baseline[key], max = ceiling(key, want);
    const pass = got <= max;
    checks.push({
      name,
      pass,
      detail: pass
        ? `${fmt(got)} vs ${fmt(want)} recorded (${pct(got, want)}, budget ${fmt(max)})`
        : `${fmt(got)} over the ${fmt(max)} budget (baseline ${fmt(want)}, ${pct(got, want)}). `
          + 'If the growth is intended, re-pin the baseline by hand in scripts/budgets.mjs and say why. '
          + '`node scripts/smoke.mjs --update-budgets` is denied: every live baseline is a hand pin in scripts/budgets.mjs.',
    });
  }
  return checks;
}

/** Split a list of `{url, bytes}` into the report's byType/bytes/requests shape. */
export function summarize(entries, origin) {
  const ours = entries.filter(e => e.url.startsWith(origin));
  return {
    bytes: ours.reduce((n, e) => n + e.bytes, 0),
    requests: ours.length,
    byType: ours.reduce((acc, e) => ((acc[e.type] = (acc[e.type] || 0) + e.bytes), acc), {}),
  };
}
