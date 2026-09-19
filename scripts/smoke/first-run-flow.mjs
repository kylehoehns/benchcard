import { HEIGHT, WIDTH, landWiped } from './dom.mjs';
import { goRich } from './fixtures.mjs';
import { LARGE_TEXT_WIDTH, nameOf } from './registry.mjs';
import { evalJSON, key, realTap, typeIn, waitClosed } from './sheet-drive.mjs';

/* #36's own guard (docs/specs/36-first-run.md, Proof seam 7): "the flow in a
 * browser". It settles the acceptance items that are claims about the real
 * screen -- 1 (the landing), 2 (step 1), 3 (step 2), 4 (step 3, and landing
 * on the game), 5 (the sample), 6 (every way out) and 7 (the tour) -- by
 * driving the app with real buttons, real keys and a real wiped landing, the
 * same shape `add-game-flow.mjs` uses for #32.
 *
 * Every expected string here is the spec's own ("The whole game, worked out
 * before you leave the house.", "1 of 3", "Who's on the team?", "Go to the
 * game", "Discard this team?"), never a second computation of what the app
 * does. Where the spec's own number and the shipped, reasoned default
 * genuinely differ -- item 5's "first 10 SAMPLE_LINES" against `fillSample`'s
 * documented `DEMO_N` default (onboarding.js: the hero above the fold solves
 * an 11-player game precisely because 11 does not divide evenly, and handing
 * "Try a sample team" a different size than the hero just showed reopens the
 * seam that comment fixed) -- the check below proves the box holds an
 * UNEDITED PREFIX of the sample cast via `sampleRosterText` itself (Reuse),
 * rather than re-asserting a literal count this file has no authority to
 * settle either way.
 *
 * STEP 3 COMMITS FOR REAL (`commitFirstRun` runs on step 2's own Next, before
 * step 3 ever paints -- decision 4), so it is a one-way door: nothing after
 * it can still read `state.onboarded === false`. `landingReads` through
 * `sampleFillsAndSavesNothing` all need that pre-commit state and so share
 * ONE wiped landing; `stepThreeShowsACard` onward needs a SECOND, fresh one,
 * the same way `game-rows-fit.mjs` calls `landWiped` twice (light, then
 * dark) rather than trying to make one landing answer two different
 * questions. That second landing is also the NARROW one -- 320px, the width
 * at which step 3's card fit is observable at all; see `firstRunPass` for why
 * the narrowing has to come before the flow paints. The rich fixture and 390
 * are both restored at the end regardless of outcome, the same courtesy
 * `teamscreen` and `addgameflow` pay. */

const READY = `!document.getElementById('view-welcome').hidden`;
const land = (c, origin) => landWiped(c, `${origin}/index.html`, READY);

const viewport = (c, width) => c.send('Emulation.setDeviceMetricsOverride',
  { width, height: HEIGHT, deviceScaleFactor: 2, mobile: true });

/* Everything one round trip can answer about the open flow -- the same
 * shape `add-game-flow.mjs`'s own `flowState` reads for `#addGameFlow`. */
const flowState = c => evalJSON(c, `(() => {
  const d = document.getElementById('firstRunFlow');
  if (!d) return JSON.stringify({ exists: false, open: false });
  const prog = document.getElementById('frProg');
  const ask = document.getElementById('frAsk');
  const next = document.getElementById('frNext');
  const back = document.getElementById('frBack');
  return JSON.stringify({
    exists: true,
    open: d.open,
    step: (document.getElementById('frStep')?.textContent || '').trim(),
    segments: prog ? prog.children.length : null,
    segmentsOn: prog ? [...prog.children].filter(n => n.classList.contains('on')).length : null,
    heading: (document.querySelector('#frBody h2')?.textContent || '').trim(),
    next: (next?.textContent || '').trim(),
    backHidden: back ? back.hidden : null,
    askShown: !!(ask && !ask.hidden),
    askTitle: ask ? (ask.querySelector('.bsheet-ask-t')?.textContent || '').trim() : null,
    askButtons: ask ? [...ask.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
  });
})()`);

// The stored record, read the way `saveState` (storage.js) writes it: plain
// `JSON.stringify(state)` under its own `KEY`, no wrapper -- so 0 players
// there and 0 in `state.players` both settle item 6's "saves nothing".
const storedPlayers = c => evalJSON(c, `(async () => {
  const st = await import('/storage.js');
  let n = 0;
  try { n = JSON.parse(localStorage.getItem(st.KEY) || 'null')?.players?.length ?? 0; } catch {}
  return JSON.stringify(n);
})()`);

/* Item 1: the landing, before any dialog opens. */
async function landingReads(c, ck) {
  const s = await evalJSON(c, `(() => {
    const start = document.getElementById('welStart');
    const tryBtn = document.getElementById('welTry');
    const dialog = document.getElementById('firstRunFlow');
    return JSON.stringify({
      welcomeHidden: document.getElementById('view-welcome')?.hidden,
      barDisplay: getComputedStyle(document.querySelector('.bar')).display,
      h1: (document.querySelector('#view-welcome h1')?.textContent || '').trim(),
      rows: document.querySelectorAll('#welRows .wel-row').length,
      firstDoor: document.querySelector('.wel-doors .btn')?.id,
      startText: (start?.textContent || '').trim(),
      startPrimary: start?.classList.contains('primary'),
      tryText: (tryBtn?.textContent || '').trim(),
      tryPrimary: tryBtn?.classList.contains('primary'),
      restoreText: (document.getElementById('welRestore')?.textContent || '').trim(),
      dialogExists: !!dialog,
      dialogOpen: dialog ? dialog.open : null,
    });
  })()`);
  ck(s.welcomeHidden === false, '#view-welcome is hidden on a wiped landing');
  ck(s.barDisplay === 'none', `.bar computes display "${s.barDisplay}" on the welcome screen, want "none"`);
  ck(s.h1 === 'The whole game, worked out before you leave the house.', `the welcome h1 reads "${s.h1}"`);
  ck(s.rows === 9, `#welRows draws ${s.rows} row(s), want 9`);
  ck(s.firstDoor === 'welStart', `"${s.firstDoor}" is first in .wel-doors, want welStart`);
  ck(s.startText === 'Set up my team', `#welStart reads "${s.startText}"`);
  ck(s.startPrimary === true, '#welStart is not .btn.primary');
  ck(s.tryText === 'Try a sample team', `#welTry reads "${s.tryText}"`);
  ck(s.tryPrimary === false, '#welTry carries .primary');
  ck(s.restoreText === 'Restore a backup', `#welRestore reads "${s.restoreText}"`);
  ck(s.dialogExists, '#firstRunFlow is not in the markup');
  ck(s.dialogOpen === false, '#firstRunFlow ships open');
}

/* Item 2: step 1, and `parseRoster`'s own count line as the coach types. */
async function stepOneCounts(c, ck) {
  await realTap(c, '#welStart');
  let s = await flowState(c);
  if (!ck(s.open && s.step === '1 of 3', `#welStart opened the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 1`)) return;
  ck(s.segments === 3 && s.segmentsOn === 1, `${s.segmentsOn}/${s.segments} progress dot(s) on, want 1/3`);
  ck(s.heading === "Who's on the team?", `step 1 asks "${s.heading}"`);

  let read = await evalJSON(c, `JSON.stringify({
    placeholder: document.getElementById('frTeam')?.placeholder,
    count: (document.getElementById('frCount')?.textContent || '').trim(),
    nextDisabled: document.getElementById('frNext')?.disabled,
  })`);
  ck(read.placeholder === 'Wildcats 6th Grade', `#frTeam's placeholder reads "${read.placeholder}"`);
  ck(read.count === 'Paste from wherever your roster lives. Jersey numbers are optional.',
    `an empty #frRoster reads "${read.count}"`);

  await typeIn(c, '#frRoster', '12 Maya Webb\n4 Eli Tran\nDevon Ellis');
  read = await evalJSON(c, `JSON.stringify({
    count: (document.getElementById('frCount')?.textContent || '').trim(),
    nextDisabled: document.getElementById('frNext')?.disabled,
  })`);
  ck(read.count === '3 players so far. 5 needed to field a lineup.', `three typed lines read "${read.count}"`);
  ck(read.nextDisabled === true, 'Next is enabled with only 3 players typed');

  await typeIn(c, '#frRoster', '12 Maya Webb\n4 Eli Tran\nDevon Ellis\n3 Nia Bell\n15 Caleb Ruiz');
  read = await evalJSON(c, `JSON.stringify({
    count: (document.getElementById('frCount')?.textContent || '').trim(),
    nextDisabled: document.getElementById('frNext')?.disabled,
  })`);
  ck(read.count === '5 players so far.', `five typed lines read "${read.count}"`);
  ck(read.nextDisabled === false, 'Next is disabled with 5 players typed');
}

/* Item 3: step 2's two steppers (against `PERIODS_LO/HI`, `MINUTES_LO/HI`)
 * and the eight `GRAN_CHOICES` rows. Read at the default the draft opens
 * with, which already sits at `PERIODS_HI` -- so the "+ disabled above 4"
 * half of the rule is observable without also walking `- ` down to 1 and
 * disturbing the roster the next two checks still need. */
async function stepTwoDefaults(c, ck) {
  await realTap(c, '#frNext');
  const s = await flowState(c);
  if (!ck(s.open && s.step === '2 of 3', `Next from step 1 left the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 2`)) return;
  ck(s.heading === 'How long is a game?', `step 2 asks "${s.heading}"`);
  ck(s.next === 'Next', `step 2's primary button reads "${s.next}", want "Next"`);

  const body = await evalJSON(c, `(() => {
    const rows = [...document.querySelectorAll('.pstep-row')].map(r => {
      const btns = r.querySelectorAll('.pstep-btn');
      return {
        label: (r.querySelector('.prow-t')?.textContent || '').trim(),
        value: (r.querySelector('.pstep-val')?.textContent || '').trim(),
        minusDisabled: btns[0]?.disabled, plusDisabled: btns[1]?.disabled,
      };
    });
    const gran = [...document.querySelectorAll('.fr-gran .sheetrow')];
    const on = gran.find(b => b.getAttribute('aria-pressed') === 'true');
    return JSON.stringify({
      rows, granCount: gran.length,
      onLabel: on ? (on.querySelector('.sheetrow-t')?.textContent || '').trim() : null,
      onMark: on ? (on.querySelector('.sheetrow-state')?.textContent || '').trim() : null,
    });
  })()`);
  const [periods, minutes] = body.rows;
  ck(periods?.label === 'Periods' && periods.value === '4' && periods.plusDisabled === true && periods.minusDisabled === false,
    `the periods row reads ${JSON.stringify(periods)}, want Periods: 4, + disabled, - enabled`);
  ck(minutes?.label === 'Minutes each' && minutes.value === '8' && minutes.minusDisabled === false && minutes.plusDisabled === false,
    `the minutes row reads ${JSON.stringify(minutes)}, want Minutes each: 8, both enabled`);
  ck(body.granCount === 8, `${body.granCount} sub-interval choice(s) drawn, want the 8 in GRAN_CHOICES`);
  ck(body.onLabel === 'Every 4 min' && body.onMark === '✓',
    `the pressed sub-interval choice reads "${body.onLabel}" "${body.onMark}", want "Every 4 min" "✓"`);
}

/* Item 6: `#frBack` (real tap, priming Chrome's "genuine interaction" rule
 * for the `cancel` event right behind it -- `realTap`'s own comment), then
 * Android's back gesture on step 1 with text still in the draft. */
async function backAndCancel(c, ck) {
  await realTap(c, '#frBack');
  let s = await flowState(c);
  if (!ck(s.open && s.step === '1 of 3', `Back from step 2 left the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 1`)) return;

  await key(c, 'Escape', 27);
  s = await flowState(c);
  ck(s.open === true, 'a close request over typed text closed the flow with no ask');
  ck(s.askShown === true, 'a close request over typed text did not show the discard ask');
  ck(s.askTitle === 'Discard this team?', `the ask reads "${s.askTitle}", want "Discard this team?"`);
  ck(s.askButtons.join(' | ') === 'Keep editing | Discard',
    `the ask offers ${JSON.stringify(s.askButtons)}, want ["Keep editing", "Discard"]`);
}

/* Item 6: "Discard" from the ask `backAndCancel` left open. */
async function discardSavesNothing(c, ck) {
  await realTap(c, '#frDiscard');
  if (!ck(await waitClosed(c, '#firstRunFlow'), '"Discard" did not close the flow')) return;
  const after = await evalJSON(c, `(async () => {
    const s = await import('/state.js');
    return JSON.stringify({ onboarded: s.state.onboarded, players: s.state.players.length });
  })()`);
  ck(after.onboarded === false, `state.onboarded is ${after.onboarded} after discarding, want false`);
  ck(after.players === 0, `state.players holds ${after.players} after discarding, want 0`);
  const stored = await storedPlayers(c);
  ck(stored === 0, `the stored record holds ${stored} player(s) after discarding, want 0`);
}

/* Item 5: both doors that fill the draft from the sample -- `#welTry`
 * (fresh, from the welcome screen the discard above left showing) and
 * `#frFill` inside step 1 -- neither creating or saving a team. The fill's
 * own size is read back through `sampleRosterText` (Reuse) rather than
 * pinned to a literal: see this file's header comment. */
async function sampleFillsAndSavesNothing(c, ck) {
  await realTap(c, '#welTry');
  let s = await flowState(c);
  if (!ck(s.open && s.step === '1 of 3', `#welTry opened the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 1`)) return;

  let filled = await evalJSON(c, `(async () => {
    const r = await import('/roster.js');
    const team = document.getElementById('frTeam')?.value;
    const roster = document.getElementById('frRoster')?.value || '';
    const n = roster.split('\\n').filter(Boolean).length;
    return JSON.stringify({ team, roster, n, want: r.sampleRosterText(n), name: r.SAMPLE_TEAM_NAME,
      fillHidden: document.getElementById('frFill')?.hidden });
  })()`);
  ck(filled.team === filled.name, `#frTeam reads "${filled.team}" after "Try a sample team", want "${filled.name}"`);
  ck(filled.n >= 5, `"Try a sample team" leaves only ${filled.n} player(s), fewer than the 5 a lineup needs`);
  ck(filled.roster === filled.want, `#frRoster does not hold an unedited prefix of the sample cast (sampleRosterText(${filled.n}))`);
  ck(filled.fillHidden === true, '#frFill is still offered once "Try a sample team" has filled the box');

  let after = await evalJSON(c, `(async () => { const s = await import('/state.js');
    return JSON.stringify(s.state.onboarded); })()`);
  ck(after === false, `state.onboarded is ${after} right after the fill, want false`);
  let stored = await storedPlayers(c);
  ck(stored === 0, `the stored record holds ${stored} player(s) right after the fill, want 0`);

  await realTap(c, '#frClose');
  s = await flowState(c);
  if (ck(s.askShown, '✕ over the filled sample did not show the discard ask')) {
    await realTap(c, '#frDiscard');
    await waitClosed(c, '#firstRunFlow');
  }

  await realTap(c, '#welStart');
  s = await flowState(c);
  if (!ck(s.open && s.step === '1 of 3', `#welStart opened the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 1`)) return;
  const empty = await evalJSON(c, `JSON.stringify(document.getElementById('frFill')?.hidden)`);
  ck(empty === false, '#frFill is hidden on an empty box');

  await realTap(c, '#frFill');
  filled = await evalJSON(c, `(async () => {
    const r = await import('/roster.js');
    const team = document.getElementById('frTeam')?.value;
    const roster = document.getElementById('frRoster')?.value || '';
    const n = roster.split('\\n').filter(Boolean).length;
    return JSON.stringify({ team, roster, want: r.sampleRosterText(n), name: r.SAMPLE_TEAM_NAME,
      fillHidden: document.getElementById('frFill')?.hidden });
  })()`);
  ck(filled.team === filled.name, `#frTeam reads "${filled.team}" after "Fill with a sample team", want "${filled.name}"`);
  ck(filled.roster === filled.want, '#frFill does not fill the same unedited sample prefix "Try a sample team" does');
  ck(filled.fillHidden === true, '#frFill stays offered once it has filled the box itself');

  await realTap(c, '#frClose');
  s = await flowState(c);
  if (ck(s.askShown, '✕ over the fill did not show the discard ask')) {
    await realTap(c, '#frDiscard');
    await waitClosed(c, '#firstRunFlow');
  }
}

/* Item 4: step 3, reached by really committing a 5-player team (decision 4:
 * the card comes from `renderCards`, never a draft renderer). Returns the
 * card count `landsOnTheGame` needs, once `#frStage` itself is gone. */
async function stepThreeShowsACard(c, ck) {
  await realTap(c, '#welStart');
  await typeIn(c, '#frRoster', '12 Maya Webb\n4 Eli Tran\nDevon Ellis\n3 Nia Bell\n15 Caleb Ruiz');
  await realTap(c, '#frNext'); // step 1 -> 2
  await realTap(c, '#frNext'); // step 2 -> 3, commits the team for real
  const s = await flowState(c);
  if (!ck(s.open && s.step === '3 of 3', `two taps of Next left the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 3`)) return null;
  ck(s.heading === "Here's your first card", `step 3 asks "${s.heading}"`);
  ck(s.backHidden === true, 'step 3 still shows a "Back" button -- decision 6 says it should not');
  ck(s.next === 'Go to the game', `step 3's primary button reads "${s.next}", want "Go to the game"`);

  const stage = await evalJSON(c, `(() => {
    const cards = [...document.querySelectorAll('#frStage .card')];
    const print = document.getElementById('frPrint');
    const share = document.getElementById('frShare');
    return JSON.stringify({
      cards: cards.length,
      opp: (cards[0]?.querySelector('.card-hd .opp')?.textContent || '').trim(),
      printText: (print?.textContent || '').trim(), shareText: (share?.textContent || '').trim(),
      printNeeds: print?.hasAttribute('data-needs-card'), shareNeeds: share?.hasAttribute('data-needs-card'),
      printDisabled: print?.disabled, shareDisabled: share?.disabled,
      printPrimary: print?.classList.contains('primary'), sharePrimary: share?.classList.contains('primary'),
    });
  })()`);
  ck(stage.cards >= 1, `#frStage holds ${stage.cards} .card(s), want at least 1`);
  ck(!!stage.opp, `the card's .opp reads "${stage.opp}", want a non-empty opponent`);
  ck(stage.printText === 'Print', `#frPrint reads "${stage.printText}", want "Print"`);
  ck(stage.shareText === 'Share image', `#frShare reads "${stage.shareText}", want "Share image"`);
  ck(stage.printNeeds && stage.shareNeeds, '#frPrint/#frShare do not both carry data-needs-card');
  ck(stage.printDisabled === false && stage.shareDisabled === false, '#frPrint/#frShare are not both enabled');
  ck(!stage.printPrimary && !stage.sharePrimary, '#frPrint/#frShare carry .primary, and neither should');

  /* AND THE FIT, which is why this whole second landing runs at
     `LARGE_TEXT_WIDTH` instead of 390 (see `firstRunPass` below).
     `cardPreviewInto` ends in `fitPreview()`, and `fitPreview` is
     `document.querySelectorAll('.stage')` (card.js) -- so a `#frStage` built
     and filled while it is still DETACHED, as `stepCard` does when `paintFr`
     evaluates the body as an argument to `paintFlowShell`, is not in that
     list and never gets a `--cardzoom` at all. The card then paints at its
     true print width, 3.45in = 331.2px, whatever the stage is.

     NEITHER HALF OF THIS IS SPARE. `--cardzoom` unset is the direct symptom
     and reads the same at every width; the geometry below is what a coach
     actually sees, and it is only observable where the correct zoom is not 1
     -- at 390 the card fits at zoom 1 and an unfitted stage looks identical.
     Nothing else in the harness covers it: `OVERFLOW_PROBE` skips any element
     under a sideways-scrollable ancestor, and `.flow-body`'s `overflow-y:
     auto` (app.css) makes its `overflow-x` compute to `auto`.

     GEOMETRY, NOT OVERFLOW, and measured UNZOOMED -- `r.width /
     currentCSSZoom`, the same divide `scripts/smoke-checks.js` uses for the
     sheet's own card. An unfitted card does not spill out of the stage to be
     caught by a width comparison: `.stage` is `display:flex` (card.css), so
     the card is a flex item and the default `flex-shrink: 1` squashes it to
     the stage's width instead. Measured on the unfixed tree it read 310px
     wide by 480 tall -- the height untouched, the width crushed -- which is
     the shape this asserts against: a card that was fitted is 3.45in x 5in
     unzoomed at any stage width, and a card that was only shrunk is not. */
  const IN = 96;
  const fit = await evalJSON(c, `(() => {
    const st = document.getElementById('frStage');
    if (!st) return JSON.stringify({ found: false });
    const card = st.querySelector('.card');
    const r = card && card.getBoundingClientRect();
    const z = card ? (card.currentCSSZoom || 1) : 1;
    return JSON.stringify({
      found: true,
      zoom: getComputedStyle(st).getPropertyValue('--cardzoom').trim(),
      card: r ? [Math.round(r.width / z), Math.round(r.height / z)] : null,
    });
  })()`);
  if (ck(fit.found, '#frStage is not in the document on step 3')) {
    ck(fit.zoom !== '', '#frStage carries no --cardzoom, so nothing ever fitted it');
    if (ck(!!fit.card, '#frStage holds no .card to measure')) {
      const want = [3.45 * IN, 5 * IN];
      ck(Math.abs(fit.card[0] - want[0]) <= 1 && Math.abs(fit.card[1] - want[1]) <= 1,
        `step 3's card is ${fit.card[0]}x${fit.card[1]} unzoomed at ${LARGE_TEXT_WIDTH}px`
        + `, want ${Math.round(want[0])}x${Math.round(want[1])}`);
    }
  }
  return stage.cards;
}

/* Item 7: finishing step 3 with `state.tourSeen === false`. Shares the one
 * tap `landsOnTheGame` also reads the aftermath of (`finishFr`'s own
 * `closeFr()` then `startTour`, 520ms apart -- app/onboarding.js). */
async function finishStartsTheTour(c, ck) {
  await realTap(c, '#frNext'); // step 3's "Go to the game"
  const seen = await evalJSON(c, `(async () => {
    const deadline = Date.now() + 1000;
    let t = document.getElementById('tour');
    while (Date.now() < deadline && !(t && !t.hidden)) {
      await new Promise(r => setTimeout(r, 30));
      t = document.getElementById('tour');
    }
    return JSON.stringify({ shown: !!(t && !t.hidden), step: (document.getElementById('tourStep')?.textContent || '').trim() });
  })()`);
  ck(seen.shown === true, '#tour did not appear within 1000ms of finishing step 3');
  ck(seen.step === 'Step 1 of 4', `#tourStep reads "${seen.step}", want "Step 1 of 4"`);
}

// renderCards also draws .card-copy clones for the multi-copy print path
// (card.js); #frStage's own count above never includes those
// (cardPreviewInto clones only the non-copy cards), so this excludes them
// too, the same selector app.js's own copies-menu reads cards with.
async function landsOnTheGame(c, ck, cardCount) {
  const s = await evalJSON(c, `JSON.stringify({
    gamesHidden: document.getElementById('view-games')?.hidden,
    sheetCards: document.querySelectorAll('#sheet .card:not(.card-copy)').length,
  })`);
  ck(s.gamesHidden === false, '#view-games is hidden after finishing step 3');
  ck(s.sheetCards === cardCount, `#sheet holds ${s.sheetCards} card(s), want the ${cardCount} step 3 showed`);
}

export async function firstRunPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    await land(c, origin);
    await landingReads(c, ck);
    await stepOneCounts(c, ck);
    await stepTwoDefaults(c, ck);
    await backAndCancel(c, ck);
    await discardSavesNothing(c, ck);
    await sampleFillsAndSavesNothing(c, ck);

    /* Fresh: step 3 commits for real, a one-way door. AND NARROW, for the
       card fit `stepThreeShowsACard` reads at the end -- 320px is where the
       correct `--cardzoom` is not 1, so it is the only width at which a
       mis-fitted card is distinguishable from a fitted one.
       THE NARROWING HAS TO HAPPEN BEFORE THE FLOW PAINTS, not after:
       `card.js` fits every `.stage` on `resize`, so resizing a step 3 that
       is already on screen would repair the very thing being measured and
       report clean. 390 goes back before the tour, which is the width the
       rest of this pass and everything after it measures at. */
    await viewport(c, LARGE_TEXT_WIDTH);
    await land(c, origin);
    const cardCount = await stepThreeShowsACard(c, ck);
    await viewport(c, WIDTH);
    if (cardCount !== null) {
      await finishStartsTheTour(c, ck);
      await landsOnTheGame(c, ck, cardCount);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  await viewport(c, WIDTH).catch(() => {});
  await goRich(c, origin).catch(() => {});

  return {
    name: nameOf('firstrun'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'the landing, all three steps, every way out, the sample, the tour and landing on the game all hold',
  };
}
