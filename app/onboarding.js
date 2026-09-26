/* First run.
 *
 * The welcome pane is the only screen a coach sees before there is a team.
 * Its landing doors open `#firstRunFlow` (#36), a three-step dialog built the
 * same way #32's `#addGameFlow` is: `paintFlowShell` (trap.js) paints the
 * step/progress/body/back/next chrome both flows share, and the sub-interval
 * rows and the two format steppers are `game-setup.js`'s own `paintGranRows`
 * and `stepperRow` run against this module's draft instead of a second copy.
 *
 * One thing this module cannot own: `setView` lives in app.js until render.js
 * is extracted, so it comes in through `initOnboarding` rather than being
 * imported back (which would close the graph into a cycle). It took
 * `renderAll` the same way until #36 — the last caller left with
 * `finishOnboarding`, and an injection nothing calls is a dependency the
 * graph carries and no reader can trace. `startTour` is imported directly —
 * tour.js was split off first precisely so this module could.
 */

import { generatePlan } from './engine.js';
import { parseRoster, sampleRoster, sampleRosterText, callNames, SAMPLE_TEAM_NAME } from './roster.js';
import { $, on, set, el, uid } from './dom.js';
import { state, editHappened, markFirstRunPending, HUES } from './state.js';
import { track, bucketRoster } from './analytics.js';
import { startTour } from './tour.js';
import { flash } from './toast.js';
import { closeSheet, guardClose, rememberTrigger, showAskRow, paintFlowShell, flowStepBody, flowField } from './trap.js';
import { stepperRow, paintGranRows, PERIODS_LO, PERIODS_HI, MINUTES_LO, MINUTES_HI } from './game-setup.js';
import { buildNextCols } from './gamemode.js';
import { cardPreviewInto, fitPreview } from './card.js';

/* The lineup floor. Five on the floor is what a game needs, so a roster
   shorter than that cannot leave step 1 yet.

   EXPORTED AS A PREDICATE, not written out at each site, because three places
   ask the same question -- the count line below, `onRosterInput` while the
   coach types, and `paintFr` on every repaint -- and three copies of `n < 5`
   is a rule a test can only agree with by writing a fourth.

   The floor itself stays module-private: the predicate is the answer callers
   and `test/first-run.test.js` want, and exporting the number too would be an
   export with no reader outside this file (`test/dead-export.test.js`). */
const LINEUP_MIN = 5;
export const shortOfLineup = (n) => n < LINEUP_MIN;

/* Step 1's `#frCount` line. An empty box reads as an instruction rather than
 * "0 players", and the floor is `LINEUP_MIN` -- fewer than that is not a
 * lineup. */
export function countLine(n) {
  if (!n) return 'Paste from wherever your roster lives. Jersey numbers are optional.';
  if (shortOfLineup(n)) return `${n} player${n === 1 ? '' : 's'} so far. ${LINEUP_MIN} needed to field a lineup.`;
  return `${n} players so far.`;
}

/* ------------------------------------------------------------------ *
 * A51/A52: the plan a stranger meets before they have typed anything
 * ------------------------------------------------------------------ */

/* The demo game: eleven players, four eight-minute quarters, a substitution
   every four minutes.

   NINE, AND IT HAS TO BE AN ODD SIZE. Forty player-slots divide exactly by ten
   and by eight -- sixteen minutes each, or twenty each, a spread of zero -- so
   at either of those the first thing a coach ever sees this engine do is the
   one case that needs no engine. Nine does not divide: five land on sixteen
   minutes and four on twenty, and watching Shuffle move WHICH four get the
   extra while the totals hold is the argument this screen is making.

   It was eleven for a few hours and eleven was too many: eleven rows of names
   and eight-cell tracks at 320px is a wall of text before a coach has read the
   headline. Nine keeps the split and gives the rows room. Eight was offered and
   would have quietly undone the whole thing -- 40/8 is 5 stints each, exactly.

   This is deliberately NOT the eleven `about.html` argues about, and the two do
   not have to match: that page is explaining a specific arithmetic and names
   the 7-on-16 / 4-on-12 split in its prose, so its figures have to be eleven or
   they contradict the sentences around them. Nothing on this screen states a
   roster size in prose -- the caption is generated from the plan -- so it is
   free to pick the size that reads best. */
const DEMO_N = 9;
const DEMO_FORMAT = { periods: 4, periodMinutes: 8 };
const DEMO_GRAN = { mode: 'everyN', value: 4 };

/* ONE arrangement, baked, for the first paint. Seed 1 of the real solver over
   `sampleRoster(9)`: one string per player, one character per stint. Baked
   rather than solved because this is the first screen of a cold load and a
   solver on that path is a cost every coach pays for a demo. Shuffle below
   calls the solver for real, which is a user gesture and pays for itself.
   Re-derived from the solver, never hand-edited, on every change of size. */
const DEMO_SEED0 = ['00111001', '01110101', '10101010', '01100110', '10010110',
                    '10101011', '01011100', '11010011', '11001101'];
/* Minutes for that baked arrangement, per player and in the same order. A
   SINGLE number lived here while the demo was ten players, because ten was the
   size where one number was true of everybody. It cannot be one number at any
   size that actually needs this app, and quietly showing the maximum would
   print twenty beside the five players who get sixteen. */
const DEMO_SEED0_MINS = [16, 20, 16, 16, 16, 20, 16, 20, 20];

/* What the stage is showing: `rows[i][s]` is 1 when player i is on the floor
   for stint s, plus the numbers beside and under it. Replaced by `solve`. */
let demo = { rows: DEMO_SEED0.map(r => [...r].map(Number)), mins: DEMO_SEED0_MINS, subs: 21 };

/* Spelled out, because "11 players, 12 or 16 minutes each" is three numbers in
   a row and reads like a table row rather than a sentence. Falls back to the
   digits for any size not listed. */
const NUM_WORD = { 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Eleven', 12: 'Twelve' };

const demoPlayers = () => sampleRoster(DEMO_N).map((p, i) => ({
  id: `d${i}`, name: p.name, number: p.number, shortName: '', tier: 3,
}));

/* SHUFFLE RE-SOLVES. It used to cycle four baked arrangements, which ran out
   after four taps and was reported as "shuffle does not actually shuffle".
   `engine.js` is already in the boot graph (state.js imports it), so calling it
   here adds no request -- and a random seed is what the games view's own
   `#regen` does, so this is the same control doing the same thing.

   A refusal falls back to whatever is on screen rather than blanking the stage:
   the solver cannot fail on this input, and if it ever does, a stale plan is a
   better first impression than an empty box. */
function solveDemo() {
  const players = demoPlayers();
  const ids = players.map(p => p.id);
  const plan = generatePlan({
    players, availableIds: ids, format: DEMO_FORMAT, granularity: DEMO_GRAN,
    seed: Math.floor(Math.random() * 1e6),
  });
  if (!plan.ok || !plan.stints?.length) return false;
  const rows = ids.map(id => plan.stints.map(st => (st.onFloor || []).includes(id) ? 1 : 0));
  let subs = 0;
  for (let i = 1; i < plan.stints.length; i++) {
    const prev = new Set(plan.stints[i - 1].onFloor);
    subs += plan.stints[i].onFloor.filter(id => !prev.has(id)).length;
  }
  // per player, in row order -- see DEMO_SEED0_MINS
  const mins = ids.map(id => (plan.minutes || {})[id] ?? 0);
  demo = { rows, mins, subs };
  return true;
}

/* A row per player, colored by the same hue table the app uses for the same
   players everywhere else, and named off the ONE fictional cast through
   `callNames` -- which is what the bench and the timeline call a player on
   screen. */
function renderDemo() {
  const box = $('#welRows');
  if (!box) return;
  const players = demoPlayers();
  const call = callNames(players);
  box.textContent = '';
  players.forEach((p, i) => {
    const row = el('div', 'wel-row');
    row.style.setProperty('--h', String(HUES[i % HUES.length]));
    const track = el('div', 'wel-track');
    (demo.rows[i] || []).forEach((on, sidx) => {
      const c = el('i', 'wel-c' + (on ? ' on' : '') + (sidx % 2 && sidx < 7 ? ' qgap' : ''));
      c.style.setProperty('--d', `${i * 40}ms`);
      track.append(c);
    });
    row.append(el('span', 'wel-dot'), el('span', 'wel-nm', call[p.id]), track,
               el('span', 'wel-min', String(demo.mins[i] ?? '')));
    box.append(row);
  });
  /* Read off the plan rather than written down. The split is 7 on sixteen and
     4 on twelve for this format and stays that way through every shuffle, but
     a sentence that states a number the rows can contradict is the kind of
     thing that goes stale the first time somebody edits DEMO_FORMAT. */
  const seen = [...new Set(demo.mins)].sort((a, b) => a - b);
  set('#welCap', 'textContent',
    `${NUM_WORD[DEMO_N] || DEMO_N} players, ${seen.join(' or ')} minutes each, `
    + `${demo.subs} substitutions.`);
}

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

/* `playDemo` used to live here: it armed the cells to `scaleX(0)`, forced a
   reflow, and swapped in the class that ran the grow. It is gone, and so are
   both classes. The reveal is a plain CSS animation on `.wel-c.on` now (see
   `app.css`), which means nothing in this file can leave a coach looking at an
   empty grid -- the old arrangement could, because the script that hid the
   cells was also the only thing that could bring them back, and a page that
   loads while hidden does not run the frame callback that did it.

   Replay comes free: `renderDemo` below rebuilds every cell, and a fresh
   element starts its animation from the beginning. Shuffle rebuilds, and so
   does returning to the plan tab. */

/* THE BENCH TAB IS DRAWN, NOT PHOTOGRAPHED (A61), and it is drawn out of the
   REAL COMPONENTS: `.gm-p`, `.av`, `.tag`, `.mn`, `.gm-next` are the classes
   `gamemode.js` builds the live bench from, they are bare classes in this same
   document, and every color in them is a token.

   Two things fall out of that and both were the point. It is theme-aware for
   free, where `bench-sample.png` is a LIGHT-THEME capture that sat in the dark
   app as a bright white panel telling a coach their phone looks like something
   it does not. And it cannot drift: restyle bench mode and this restyles with
   it, because it is not a picture of the component, it IS the component.

   THE CARD TAB KEEPS ITS PHOTOGRAPH and that is not an inconsistency. The card
   is black on white in BOTH themes because it is paper, not UI (see the head of
   card.css), so a picture of it is honest in a way a picture of a screen is
   not. One white rectangle on this screen was true and the other was a lie.
   `about.html` makes the same call in its own words -- a phone screen and a
   sheet of paper are things a picture is honest about and CSS is not -- which
   held while that figure was a bezelled phone shot on a light page and stopped
   holding the moment this one became an edge-to-edge panel in a themed app.

   The cast is `sampleRoster` as well, so the plan tab and the screen tab are
   one team now. They were two: the plan drew Maya's roster and the bench shot
   photographed the marketing cast. */
function benchFigure(pane) {
  const box = $(pane);
  if (!box) return;
  box.textContent = '';                 // rebuilt whenever the plan changes

  /* STINT 3 OF 8, READ OFF THE PLAN THE OTHER TAB IS SHOWING. Every number in
     this figure used to be written down: a fixed five on the floor, three on
     the bench whatever the roster size, "/ 16" beside all of them, and two
     next-sub lines naming players who were not necessarily on or off. It was a
     picture of bench mode rather than a view of this game, so the two tabs
     described different afternoons and the projections were only ever right by
     coincidence -- at nine players the totals are 16 AND 20, so a written-down
     16 is wrong for four of them.

     Derived, it cannot drift: shuffle re-solves, this rebuilds, and the tabs
     stay one game. Stint index 2 is the third of eight, which is the heading
     this figure has always carried. */
  const S = 2;
  const players = sampleRoster(DEMO_N);
  const call = callNames(players.map((p, i) => ({ id: `b${i}`, name: p.name })));
  const on = i => (demo.rows[i] || [])[S] === 1;
  const onAt = (i, s) => (demo.rows[i] || [])[s] === 1;
  const idx = players.map((_, i) => i);
  const floorIx = idx.filter(on);
  const benchIx = idx.filter(i => !on(i));
  // whole stints already finished, at DEMO_FORMAT's own stint length
  const stintMin = (DEMO_FORMAT.periods * DEMO_FORMAT.periodMinutes) / (demo.rows[0]?.length || 8);
  const played = i => idx.slice(0, S).reduce((m, s) => m + (onAt(i, s) ? stintMin : 0), 0);

  const wrap = el('div', 'wel-bench');
  wrap.append(el('p', 'wel-bench-hd', 'Stint 3 of 8 \u00b7 Q2 8:00\u20134:00'));

  const mins = (i) => {
    const mn = el('span', 'mn', String(played(i)));
    mn.append(el('span', 'proj', ` / ${demo.mins[i] ?? ''}`));
    return mn;
  };

  const floor = el('div', 'gm-floor');
  floorIx.forEach(i => {
    const row = el('div', 'gm-p');
    row.style.setProperty('--c', `oklch(var(--pc-l) var(--pc-c) ${HUES[i % HUES.length]})`);
    row.append(el('span', 'av', players[i].number));
    const nm = el('span', 'nm', call[`b${i}`]);
    // "just on" is a fact about the plan now: they were not out there last stint
    if (!onAt(i, S - 1)) nm.append(' ', el('span', 'tag in', 'just on'));
    row.append(nm, mins(i));
    floor.append(row);
  });

  /* #138 item 12: the same look and words as bench mode's own Next change
     box -- two columns, Off and On, no arrows. */
  const next = el('div', 'gm-next');
  next.append(el('div', 'gm-next-hd', 'Next change at Q2 4:00'));
  const going = floorIx.filter(i => !onAt(i, S + 1));
  const coming = benchIx.filter(i => onAt(i, S + 1));
  next.append(buildNextCols(going, coming, i => ({ full: call[`b${i}`], short: call[`b${i}`] })).cols);

  /* The bench, in `gamemode.js`'s own `.gm-b` rows -- the half a coach scans
     for a name, and the half that gives the block enough height to fill the
     stage on a tall viewport. */
  const bench = el('div', 'wel-bench-sec');
  /* #138 item 12: bench mode's own label class and words -- sentence case,
     one line, no separate hint span. */
  bench.append(el('p', 'gm-lab', 'Bench · tap a player on the floor to swap'));
  const list = el('div', 'gm-bench');
  benchIx.forEach(i => {
    const row = el('div', 'gm-b inert');
    row.style.setProperty('--c', `oklch(var(--pc-l) var(--pc-c) ${HUES[i % HUES.length]})`);
    row.append(el('span', 'av', players[i].number));
    row.append(el('span', 'nm', call[`b${i}`]));
    row.append(mins(i));
    list.append(row);
  });
  bench.append(list);
  wrap.append(floor, next, bench);
  box.append(wrap);
}

/* The card figure, written here rather than in the markup so a returning coach
   never fetches it for a screen they will not see. It is already in `sw.js`'s
   PRECACHE for `about.html`, so a second visit pays nothing either. CROPPED,
   not shrunk: shown at its true print width and running off the bottom of the
   stage, which is legible, where an 86px thumbnail of the whole card was not
   (A52). */
function demoFigure(pane, src, alt, srcset) {
  const box = $(pane);
  if (!box || box.firstChild) return;
  const img = el('img', 'wel-shot');
  img.src = src;
  if (srcset) img.srcset = srcset;
  img.alt = alt;
  box.append(img);
}

/* One stage, three views of the same game. The captions live here rather than
   in the markup because the plan's changes every time it is solved, and one
   writer for the line is one place to be wrong. */
const CAPS = {
  plan: null,   // written by renderDemo, which is the only thing that knows
  paper: 'The printed card, actual size. Cut it out and put it in your pocket.',
  screen: 'Bench mode. Minutes played against projected, and the next substitution.',
};
function showStage(which) {
  for (const [tab, pane, key] of [['#welTabPlan', '#welPanePlan', 'plan'],
                                  ['#welTabPaper', '#welPanePaper', 'paper'],
                                  ['#welTabScreen', '#welPaneScreen', 'screen']]) {
    const on = key === which;
    $(tab)?.setAttribute('aria-selected', String(on));
    set(pane, 'hidden', !on);
  }
  // Shuffle belongs to the plan and to nothing else.
  set('#welShuf', 'hidden', which !== 'plan');
  if (which === 'plan') renderDemo();
  else set('#welCap', 'textContent', CAPS[which]);

  /* Pan the figure that just came up, every time it comes up. The class is
     removed from both panes and re-added to this one after a reflow, which is
     what restarts the keyframes -- without the reflow the second visit to a tab
     sits where the first one stopped. Decoration only: `--pan-0` is a plain
     declaration, so a figure that never pans is still a figure. */
  for (const p of ['#welPanePaper', '#welPaneScreen']) $(p)?.classList.remove('pan');
  if (which !== 'plan' && !REDUCED.matches) {
    const fig = $(which === 'paper' ? '#welPanePaper' : '#welPaneScreen');
    if (!fig) return;
    /* The drawn pane needs its travel in pixels, and it can only be measured
       once the pane is on screen -- which it is, `set(pane, 'hidden', ...)`
       ran above. `clientHeight` is the box, the block's `scrollHeight` is what
       is in it, and the difference is exactly how far there is to go. Never
       further: a figure shorter than the stage sets 0 and stays put. */
    const block = fig.firstElementChild;
    if (fig.classList.contains('wel-pane-draw') && block) {
      const travel = Math.max(0, block.scrollHeight - fig.clientHeight);
      fig.style.setProperty('--pan-px', `-${travel}px`);
    }
    void fig.offsetWidth;
    fig.classList.add('pan');
  }
}

/* Set by initOnboarding. See the header: this is app.js's, not ours. */
let setView = () => {};

/* #36's flow draft. Nothing outside `fr` (the module state the flow steps
   share) is written until it is committed through `startTeam`, which is why
   this has its own defaults rather than reading them off `GRAN_CHOICES[0]`
   or `newGame`'s -- the two happen to agree, but a draft that read the
   game's own defaults could never prove it wrote anything at all. */
export const newDraft = () => ({
  teamName: '', roster: '', filled: null,
  periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4,
});

/* Everything the two ways in share: a squad, a name, and the game the coach
   described in the draft. Only what happens AFTER differs -- a typed
   roster is counted and gets the tour, a sample is neither (A35, DECISION 1).
   `draft` carries the format fields now, not the DOM: #36 moved the two
   steppers and the chips into the flow's own step 2, so there is no
   `#welPeriods` / `#welMinutes` / `welGran` left on the page to read. */
export function startTeam(players, teamName, draft) {
  state.players = players.map((x, i) => ({ id: uid('p'), name: x.name, number: x.number, shortName: '', tier: 3, hue: i }));
  state.teamName = teamName;
  const g = state.day.games[0];
  // 40, not 20: `storage.js` sanitizes periodMinutes to 40, and a lower cap
  // here meant a record with a 24-minute half loaded fine but could never be
  // typed back in
  g.periods = Math.max(1, Math.min(8, Number(draft.periods) || 4));
  g.periodMinutes = Math.max(1, Math.min(40, Number(draft.periodMinutes) || 8));
  g.granMode = draft.granMode;
  g.granValue = draft.granValue;
  g.constraints.targetSlots = {};
  g.constraints.targetCapacity = null;
  state.onboarded = true;
  state.view = 'games';
}

/* "Try a sample team": it fills the DRAFT and creates NOTHING (A49). No team,
   no navigation, no flash, no analytics -- there is nothing to undo, so there
   is no undo sentence to get wrong, and the coach lands in the same step they
   would have typed into. The name goes in too: "Sample team" in a field they
   are about to edit reads as a prompt to replace it.

   #36 moved this from writing `#welRoster`/`#welTeam` directly to writing
   `fr` -- step 1 (`stepTeam`) reads the draft when it paints, so there is
   still exactly one place that puts the sample on screen. `fr.filled` is
   what `commitFirstRun` compares the submitted roster against: A35 DECISION
   1 is that a sample submitted untouched must never fire `first_run_complete`
   with our own suggestion, and comparing text (not a boolean) means any edit
   at all -- a name, a number, a deleted line -- makes it theirs.

   DEFAULTS TO `DEMO_N`, not to roster.js's own `SAMPLE_SIZE`, and that is the
   fix for a real seam: the hero above this form solves an eleven-player game
   precisely because eleven does NOT divide evenly, and the button under it used
   to hand back ten -- the one size that does. A coach watched four players land
   on twelve minutes, tapped "Start with a sample team", and got a roster where
   the thing they had just been shown could not happen. Same team on both sides
   of the tap now. `SAMPLE_SIZE` stays ten and stays roster.js's business: it is
   the middle of the six roster-size landing pages, which is a different
   question from what this screen demonstrates. `?try=N` is unaffected -- it
   goes through `loadSample` with a size the chart page names. */
function fillSample(n = DEMO_N) {
  fr.teamName = SAMPLE_TEAM_NAME;
  fr.roster = sampleRosterText(n);
  fr.filled = fr.roster;
}

/* The sample team, built and put on the screen. SINCE A49 THIS IS THE `?try=N`
   PATH AND NOTHING ELSE: somebody who clicked "Try it with nine sample players"
   at the foot of a roster-size chart page asked to SEE the card, and handing
   them a filled-in form instead would answer a different question. The button
   on the welcome screen fills the form (`fillSample` above); this one skips it.

   It is a team like any other the moment it lands -- editable, removable, and
   saved -- which is why there is no "sample mode" anywhere in the record: v6 is
   settled, and a sample is just a team.

   It counts NOTHING. `first_run_complete` is the only roster-size signal the
   app has and the six landing pages are built on that distribution, so a
   sample firing it would make the data measure our own suggestion. The flag
   set here fires it on the coach's first EDIT instead; `plan_generated` cannot
   fire either, because app.js fires that at boot behind `state.onboarded`,
   which is still false while this runs.

   No tour: this IS the tour, in the coach's own hands, and two explainers
   stacked on a 390px screen is worse than either. `tourSeen` is untouched. */
function loadSample(n) {
  // `startTeam` reads its format off a draft since #36; `?try=N` never ran a
  // flow to build one, so it hands over `newDraft()`'s own defaults -- the
  // same 4 periods / 8 minutes / every-4 sub this path always used, back when
  // it read `#welPeriods`/`#welMinutes` (both defaulted to 4 and 8 in the
  // markup) and the module's own `welGran` (everyN/4) directly.
  startTeam(sampleRoster(n), SAMPLE_TEAM_NAME, newDraft());
  markFirstRunPending();
  // `setView('games')` renders it: always called from welcome, always a real
  // transition into Games, so `applyView` does the render itself now (#23
  // review, third round) -- a second `renderAll()` here is the double work
  // that review flagged.
  setView('games');
  /* The one piece of copy the item is really about: removing the last team
     already works (`teams-view.js`, `removeTeam`), and what was missing is
     that nobody knew. A flash, not a banner -- it is a fact about a thing the
     coach just did, not a standing condition.

     It said "in Teams" for a few hours (A38). There was no Teams tab -- the
     bar was Games, Roster, Season, and `#removeTeam` sat on the ROSTER page
     beside "Add a team" -- so the one sentence whose job is telling a
     first-time coach how to undo the sample pointed at a surface the app does
     not have. A40 slice 1 renamed that tab's LABEL to "Team" (the stored view
     key is still `roster`); #22 then moved `#removeTeam` itself off that tab
     and into Settings, behind the cog. #23 removed the tab bar outright --
     Settings is reached from the gear on Today now, and nowhere else -- so
     this sentence still has to name it. `test/sample-team.test.js` reads
     `#settingsBtn`'s own aria-label and fails if this sentence names a
     destination the app does not offer, or if `#removeTeam` ever leaves
     Settings. */
  flash('Sample team loaded. Change any name to make it yours, or remove it in Settings.');
}

/* ------------------------------------------------------------------ *
 * #36: three steps, one dialog (`#firstRunFlow`), the same shape as
 * #32's `#addGameFlow` -- see `paintFlowShell` (trap.js) and
 * `wireAddGameFlow` (teams-view.js), which this mirrors exactly.
 * ------------------------------------------------------------------ */

// This flow's own id set, handed to the shared painter both flows use.
const FR = { step: '#frStep', prog: '#frProg', body: '#frBody', back: '#frBack', next: '#frNext' };

const FR_STEPS = [
  { q: "Who's on the team?",     build: stepTeam },
  { q: 'How long is a game?',    build: stepFormat_ },
  { q: "Here's your first card", build: stepCard },
];
const FR_TOTAL = FR_STEPS.length;

// The draft. Nothing outside `fr` is written until `commitFirstRun`.
let fr = null;
let frStep = 1;

/* `#welStart` opens at step 1 empty; `#welTry` opens at step 1 with the
   sample already in the draft -- both go through this one function so there
   is one place that resets `fr`/`frStep` and shows the dialog. */
function openFirstRun(trigger, withSample) {
  const d = $('#firstRunFlow');
  if (!d) return;
  fr = newDraft();
  frStep = 1;
  if (withSample) fillSample();          // writes fr.teamName / fr.roster / fr.filled
  rememberTrigger(d, trigger);
  showFrAsk(false);
  d.showModal();
  paintFr();
}

function paintFr() {
  if (!fr) return;
  showFrAsk(false);
  const last = frStep === FR_TOTAL;
  paintFlowShell(FR, frStep, FR_TOTAL, flowStepBody(FR_STEPS, frStep), {
    nextText: last ? 'Go to the game' : 'Next',
    nextDisabled: frStep === 1 && shortOfLineup(rosterCount()),
    backHidden: frStep === 1 || last,      // decision 6: step 3 has no Back
  });
  /* AFTER the shell attaches the body, never before. `stepCard` builds
     `#frStage` and hands it to `cardPreviewInto`, which ends in `fitPreview()`
     -- but that walks `document.querySelectorAll('.stage')` (card.js), and the
     body is still DETACHED while it is being evaluated as an argument above.
     So the stage step 3 just built was not in that list, and without this
     second call it would never get a `--cardzoom`: the card would be left at
     its full 3.45in and squashed to whatever the stage happened to be wide
     (`.stage` is a flex container, so the card shrinks rather than spilling,
     which is why no overflow check can see it). Harmless at 390, where the
     honest zoom is 1 anyway; visible on a narrow phone. */
  if (last) fitPreview();
}

/* Step 1. The two fields write straight into `fr` on input, and repaint only
   the count line and the Next button -- never the whole body, which would
   steal the caret. Parsing is `parseRoster` and nothing else (Reuse). */
const rosterCount = () => parseRoster(fr.roster).length;

function onRosterInput(v) {
  fr.roster = v;
  const n = rosterCount();
  set('#frCount', 'textContent', countLine(n));
  set('#frFill', 'hidden', n > 0);
  set('#frNext', 'disabled', shortOfLineup(n));
}

function stepTeam(wrap) {
  const [teamField, teamInput] = flowField('input', 'Team name', fr.teamName,
    'Wildcats 6th Grade', v => { fr.teamName = v; });
  teamInput.id = 'frTeam';
  // The placeholder cast is roster.js's own sample, first three -- one
  // fictional cast, not a second one invented for this box (test/sample-team.test.js).
  const [rosterField, rosterInput] = flowField('textarea', 'Your players, one per line', fr.roster,
    '12 Maya Webb\n4 Eli Tran\nDevon Ellis', onRosterInput);
  rosterInput.id = 'frRoster';
  rosterInput.spellcheck = false;
  rosterInput.setAttribute('aria-describedby', 'frCount');

  const count = el('p', 'note', countLine(rosterCount()));
  count.id = 'frCount';
  count.setAttribute('aria-live', 'polite');

  // Offered while the box is empty, same rule `#welFill` used to follow --
  // a coach who arrived through "Try a sample team" never sees it at all.
  const fill = el('button', 'btn ghost sm press', 'Fill with a sample team');
  fill.type = 'button';
  fill.id = 'frFill';
  fill.hidden = rosterCount() > 0;
  /* IN PLACE, not `paintFr()`. Filling writes two strings into the draft, and
     rebuilding the whole step to show them is the thing the comment above
     `onRosterInput` rules out -- that function is already the in-place update
     for exactly this (the count line, this button, `#frNext`), so this writes
     the two values and calls it. The caret goes to the box the sample just
     landed in, which is what the coach edits next and is also where a
     rebuild's focus move (the shell focuses the step heading) would not have
     left it. */
  fill.onclick = () => {
    fillSample();                          // writes fr.teamName / fr.roster / fr.filled
    teamInput.value = fr.teamName;
    rosterInput.value = fr.roster;
    onRosterInput(fr.roster);
    rosterInput.focus({ preventScroll: true });
  };

  wrap.append(teamField, rosterField, count, fill);
}

/* Step 2: two `stepperRow`s and `paintGranRows`, both against `fr` instead of
   `game()` (Reuse: no second stepper, no third sub-interval list). */
function stepFormat_(wrap) {
  const grp = el('div', 'pgrp');
  grp.append(
    stepperRow('Periods', () => fr.periods, v => { fr.periods = v; },
               PERIODS_LO, PERIODS_HI, 'periods'),
    stepperRow('Minutes each', () => fr.periodMinutes, v => { fr.periodMinutes = v; },
               MINUTES_LO, MINUTES_HI, 'minutes'),
  );
  wrap.append(grp, el('span', 'f fr-f', 'How often do you sub?'));
  const box = el('div', 'fr-gran');
  wrap.append(box);
  paintGranRows(box, () => fr, c => { fr.granMode = c.mode; fr.granValue = c.value; });
}

/* Committed on Next from step 2, before step 3 paints (decision 4): step 3
   shows the real card through `renderCards()`, so the team has to exist by
   then. `startTeam` keeps its shape and takes the draft instead of reading
   DOM fields. */
function commitFirstRun() {
  const players = parseRoster(fr.roster);
  startTeam(players, fr.teamName, fr);
  if (fr.filled !== null && fr.roster === fr.filled) {
    // our own sample, submitted untouched -- defer exactly as `?try=` does
    // (A35 DECISION 1), so the size recorded is one the coach chose
    markFirstRunPending();
  } else {
    track('first_run_complete', { roster: bucketRoster(players.length) });
    editHappened();
  }
  setView('games');                          // renders the card into #sheet
}

/* Step 3: a clone of #sheet's own cards, through the one card builder
   (Reuse) -- there is no draft-plan renderer to show one before this.
   `#frShareRow` is real markup (survey 8), moved into place here and parked
   back by `parkShareRow` when the flow leaves this step. */
function stepCard(wrap) {
  /* `.stage` alone, no modifier of this step's own. It shipped with a second
     class and a `.fr-stage` rule repeating `display: flex`,
     `justify-content: center` and a 1rem inset -- every line of which `.stage`
     itself already sets in card.css, which loads AFTER app.css, so a
     single-class rule there could not win anyway. Measured on step 3 at 390px
     the stage read 4.8px of side padding, card.css's own narrow-phone value,
     not the 16px that rule asked for.

     #145 decision 2 reverses the call this comment used to record: the stage
     DOES get the 16px inset now, the same as every other direct child of a
     flow step's wrapper (item 1's shared rule, app.css) -- `.stage`'s own
     narrow-phone padding (card.css) still governs the card's OWN spacing
     inside the stage, so at 320px the card shrinks from about 94% to about
     84% of its prior size. That is accepted. */
  const stage = el('div', 'stage');
  stage.id = 'frStage';                     // literal, so test/dead-id.test.js reads it
  wrap.append(stage, el('p', 'flow-note',
    'This card waits on the game screen whenever you need it.'));
  cardPreviewInto(stage);
  const row = $('#frShareRow');
  if (row) { row.hidden = false; wrap.append(row); }
}

// Puts `#frShareRow` back where the markup ships it -- the next sibling of
// `#firstRunFlow` -- and re-hides it, so the next open finds it there.
function parkShareRow() {
  const row = $('#frShareRow');
  const dialog = $('#firstRunFlow');
  if (!row || !dialog) return;
  row.hidden = true;
  dialog.after(row);
}

function frNext() {
  if (frStep < FR_TOTAL) {
    if (frStep === 2) commitFirstRun();
    frStep++;
    paintFr();
  } else finishFr();
}

/* I3: the footer's "‹ Back" and Android's back gesture are the same action.
   Step 3 has no Back button (decision 6, `paintFr`'s `backHidden`), but the
   gesture still reaches this function directly -- so a `cancel` event on
   step 3 finishes the flow rather than doing nothing. */
function frBack() {
  if (frStep === FR_TOTAL) return finishFr();
  if (frStep > 1) { frStep--; paintFr(); } else requestCloseFr();
}

/* C4: a commit surface asks before losing typed text. Nothing is left to
   lose once the team is committed (step 3), so there is nothing to ask. */
function askBeforeDiscardTeam() {
  if (!fr || frStep === FR_TOTAL) return false;
  if (!fr.teamName.trim() && !fr.roster.trim()) return false;
  showFrAsk(true);
  return true;
}

function showFrAsk(show) { showAskRow('#frAsk', '#frFoot', '#frKeep', show); }

function closeFr() {
  fr = null;
  showFrAsk(false);
  parkShareRow();
  closeSheet($('#firstRunFlow'));
}

function finishFr() {
  const first = !state.tourSeen;
  closeFr();
  // after the entrance settles, not during it: the tour measures rects, and
  // the squad pills and timeline blocks are still flying into place here
  if (first) setTimeout(startTour, 520);
}

/* Decision 6: ✕ on step 3 ends the flow the same way "Go to the game" does
   -- the team already exists, so closing and finishing are the same act --
   while ✕ on steps 1-2 asks first through `closeSheet`'s guard, exactly as
   `wireAddGameFlow`'s `requestCloseFlow` does for `#addGameFlow`. */
function requestCloseFr() {
  if (frStep === FR_TOTAL) { finishFr(); return; }
  closeSheet($('#firstRunFlow'));
}

export function initOnboarding(setViewFn) {
  setView = setViewFn;

  /* #36 decision 7: both doors open `#firstRunFlow` at step 1 -- "Set up my
     team" empty, "Try a sample team" with the draft already filled. */
  on('#welStart', 'onclick', () => openFirstRun($('#welStart'), false));
  on('#welTry', 'onclick', () => openFirstRun($('#welTry'), true));

  /* Wiring mirrors `wireAddGameFlow` (teams-view.js) exactly. */
  on('#frClose', 'onclick', requestCloseFr);
  on('#frBack', 'onclick', frBack);
  on('#frNext', 'onclick', frNext);
  on('#frKeep', 'onclick', () => { showFrAsk(false); $('#frNext')?.focus({ preventScroll: true }); });
  on('#frDiscard', 'onclick', closeFr);
  /* `cancel` is the one event Escape AND Android's back gesture both fire --
     see `wireAddGameFlow`'s own comment on the same line for the Chrome
     force-close case this cannot do anything about either. */
  on('#firstRunFlow', 'oncancel', (e) => { e.preventDefault(); frBack(); });
  on('#firstRunFlow', 'onclose', () => {
    if (fr && !fr.teamName.trim() && !fr.roster.trim()) fr = null;
    showFrAsk(false);
  });
  guardClose($('#firstRunFlow'), askBeforeDiscardTeam);

  // `renderDemo` rebuilds the cells, and new cells replay the grow on their own.
  /* The bench tab is a view of THIS plan (see `benchFigure`), so a re-solve has
     to rebuild it too or the two tabs drift apart the first time anyone taps
     Shuffle -- which is the drift this whole arrangement exists to stop. */
  on('#welShuf', 'onclick', () => {
    solveDemo();
    renderDemo();
    benchFigure('#welPaneScreen');
  });
  on('#welTabPlan', 'onclick', () => showStage('plan'));
  on('#welTabPaper', 'onclick', () => showStage('paper'));
  on('#welTabScreen', 'onclick', () => showStage('screen'));

  /* The demo is the whole of A51 and it costs a returning coach nothing: ten
     rows and two images are built only when this screen is the one about to be
     shown. `state.onboarded` is the same question `app.js` asks one line later
     to pick the view, and `sanitize` has already answered it by here.

     `welcome_seen` fires in the same breath, and it is the reason the event
     list grew for only the second time. Read the note above it in
     `analytics.js`: `first_run_complete` has been a count with no denominator
     since it shipped, so nobody can say whether this screen works. */
  if (!state.onboarded) {
    track('welcome_seen');
    renderDemo();
    /* `wel-card.png`, NOT the About page's `card-sample.png`. Same picture of the
       same kind of object, different team: the About card is eleven players
       because that page argues the eleven-player arithmetic in prose, and this
       one is `sampleRoster(DEMO_N)` because the two tabs either side of it are
       drawn from exactly that. `scripts/og.mjs --welcard` takes it through the
       app's own `?try=N` path, so the cast cannot drift from this file's. */
    demoFigure('#welPanePaper', './wel-card.png',
      'A printed Benchcard rotation card for the sample team: the clock down the left, who is coming off after a triangle, and the five players on the floor underneath in bold capitals.',
      './wel-card.png 1x, ./wel-card@2x.png 2x');
    benchFigure('#welPaneScreen');
  }

  /* `?try=N` -- the roster-size landing pages link in with their own size, so a
     coach who arrived reading about a nine-player rotation gets a nine-player
     one to push around. Read only when there is no team: a link must never be
     able to overwrite a roster. Stripped from the URL the moment it is used,
     so it cannot survive into a bookmark or a reload.

     This is NOT a URL share and must never become one. The no-URL-share rule
     is about privacy -- a share encodes the coach's own roster into a link --
     and this carries one integer the site already publishes on six public
     pages, about nobody. A35, DECISION 2. */
  const want = new URLSearchParams(location.search).get('try');
  if (want !== null && !state.onboarded) {
    history.replaceState(null, '', location.pathname + location.hash);
    loadSample(want);
  }
}
