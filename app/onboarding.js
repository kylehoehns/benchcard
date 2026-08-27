/* First run.
 *
 * The welcome pane is the only screen a coach sees before there is a team, so
 * it owns its own copy of the granularity chips and its own roster box rather
 * than reusing the setup fold's — the setup fold does not exist yet at this
 * point in the boot.
 *
 * Two things it cannot own: `setView` and `renderAll` both live in app.js
 * until render.js is extracted, so they come in through `initOnboarding`
 * rather than being imported back (which would close the graph into a cycle).
 * `startTour` is imported directly — tour.js was split off first precisely so
 * this module could.
 */

import { generatePlan } from './engine.js';
import { parseRoster, sampleRoster, sampleRosterText, callNames, SAMPLE_TEAM_NAME } from './roster.js';
import { $, on, set, el, uid } from './dom.js';
import { state, editHappened, markFirstRunPending, GRAN_CHOICES, HUES } from './state.js';
import { track, bucketRoster } from './analytics.js';
import { startTour } from './tour.js';
import { flash } from './toast.js';

let welGran = { mode: 'everyN', value: 4 };

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

/* A row per player, coloured by the same hue table the app uses for the same
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
   document, and every colour in them is a token.

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

  const next = el('div', 'gm-next');
  next.append(el('div', 'gm-next-hd', 'Next sub \u00b7 Q2 4:00'));
  const going = floorIx.filter(i => !onAt(i, S + 1));
  const coming = benchIx.filter(i => onAt(i, S + 1));
  for (const [cls, mk, lb, list] of [['out', '\u2193', 'off', going],
                                     ['in', '\u2191', 'on', coming]]) {
    if (!list.length) continue;
    const r = el('div', 'gm-next-row ' + cls);
    r.append(el('span', 'mk', mk), el('span', 'lb', lb),
             el('span', 'ns', list.map(i => call[`b${i}`]).join(' ')));
    next.append(r);
  }

  /* The bench, in `gamemode.js`'s own `.gm-b` rows -- the half a coach scans
     for a name, and the half that gives the block enough height to fill the
     stage on a tall viewport. */
  const bench = el('div', 'wel-bench-sec');
  const bh = el('p', 'wel-bench-hd wel-bench-sub');
  bh.append(el('span', null, 'Bench'), el('span', 'wel-bench-hint', 'tap who comes off first'));
  bench.append(bh);
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
    $(tab)?.classList.toggle('sel', on);
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

function renderWelcome() {
  const box = $('#welGran');
  if (!box) return;
  box.textContent = '';
  for (const c of GRAN_CHOICES) {
    const on = welGran.mode === c.mode && (c.mode === 'breaksOnly' || welGran.value === c.value);
    const b = el('button', 'chip press' + (on ? ' sel' : ''), c.label);
    b.type = 'button';
    // The same chips as the games view's sub-frequency picker, down to the
    // labels -- and that one has carried `aria-pressed` since it was written
    // (game-setup.js). This copy is the first thing a new coach meets, so it
    // is the worse of the two to leave silent.
    b.setAttribute('aria-pressed', String(on));
    b.onclick = () => { welGran = { mode: c.mode, value: c.value }; renderWelcome(); };
    box.append(b);
  }
}

/* Set by initOnboarding. See the header: these are app.js's, not ours. */
let setView = () => {};
let renderAll = () => {};

/* Everything the two ways in share: a squad, a name, and the game the coach
   described in the fields above. Only what happens AFTER differs -- a typed
   roster is counted and gets the tour, a sample is neither (A35, DECISION 1).
   The format fields are read here for both, so a coach who set six-minute
   quarters and then asked for the sample gets six-minute quarters. */
function startTeam(players, teamName) {
  state.players = players.map((x, i) => ({ id: uid('p'), name: x.name, number: x.number, shortName: '', tier: 3, hue: i }));
  state.teamName = teamName;
  const g = state.day.games[0];
  // 40, not 20: `storage.js` sanitizes periodMinutes to 40, and a lower cap
  // here meant a record with a 24-minute half loaded fine but could never be
  // typed back in
  g.periods = Math.max(1, Math.min(8, Number($('#welPeriods').value) || 4));
  g.periodMinutes = Math.max(1, Math.min(40, Number($('#welMinutes').value) || 8));
  g.granMode = welGran.mode;
  g.granValue = welGran.value;
  g.constraints.targetSlots = {};
  g.constraints.targetCapacity = null;
  state.onboarded = true;
  state.view = 'games';
}

/* What `fillSample` last wrote into `#welRoster`, or '' -- the whole of A35's
   DECISION 1 arriving through A49's new door. A coach who fills the form with
   our eleven names and taps "Build my first card" without touching them is
   submitting OUR suggestion, so counting it there would make
   `first_run_complete{roster}` measure the app's own sample -- exactly the
   pollution the sample path has always avoided. Compared as text, so any edit
   at all (a name, a number, a deleted line) makes it theirs. */
let filledText = '';

/* "Try a sample team": it fills the form in place and creates NOTHING (A49).
   No team, no navigation, no flash, no analytics -- there is nothing to undo,
   so there is no undo sentence to get wrong, and the coach lands in the same
   box they would have pasted into. The name goes in too: "Sample team" in a
   field they are about to edit reads as a prompt to replace it.

   The count line under the box is rendered by the `oninput` handler below, so
   this dispatches the event rather than writing a second copy of that copy --
   and `#welCount` is `aria-live`, which makes "11 players. Ready." the
   announcement for a coach who cannot see the box fill.

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
  const box = $('#welRoster');
  if (!box) return;
  $('#welTeam').value = SAMPLE_TEAM_NAME;
  box.value = sampleRosterText(n);
  filledText = box.value;
  box.dispatchEvent(new Event('input'));
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
  startTeam(sampleRoster(n), SAMPLE_TEAM_NAME);
  markFirstRunPending();
  setView('games');
  renderAll();
  /* The one piece of copy the item is really about: removing the last team
     already works (`teams-view.js`, `removeTeam`), and what was missing is
     that nobody knew. A flash, not a banner -- it is a fact about a thing the
     coach just did, not a standing condition.

     It said "in Teams" for a few hours (A38). There was no Teams tab -- the
     bar was Games, Roster, Season, and `#removeTeam` sat on the ROSTER page
     beside "Add a team" -- so the one sentence whose job is telling a
     first-time coach how to undo the sample pointed at a surface the app does
     not have. A40 slice 1 renamed that tab's LABEL to "Team" (the stored view
     key is still `roster`), so this sentence follows the label, which is the
     only half a coach can see. `test/sample-team.test.js` reads the
     label->key map out of `#viewnav` and fails if this sentence names a
     destination the bar does not offer, or names one that is not the view
     holding the control it is talking about. */
  flash('Sample team loaded. Change any name to make it yours, or remove it on the Team page.');
}

function finishOnboarding() {
  const parsed = parseRoster($('#welRoster').value);
  if (parsed.length < 5) {
    const c = $('#welCount');
    c.className = 'note';
    c.textContent = parsed.length
      ? `That is ${parsed.length} player${parsed.length === 1 ? '' : 's'}. You need at least 5 to field a lineup.`
      : 'Add your players above to get started.';
    // the focus move is the sighted cue; aria-invalid is the other half of it,
    // and it has to come off again the moment the coach starts fixing the box
    $('#welRoster').setAttribute('aria-invalid', 'true');
    $('#welRoster').focus();
    return;
  }
  $('#welRoster').removeAttribute('aria-invalid');
  const ours = filledText && $('#welRoster').value === filledText;
  startTeam(parsed, $('#welTeam').value.trim());
  if (ours) {
    /* Our own sample, submitted untouched: defer the count to the first edit
       exactly as the `?try=N` path does, so the size recorded is one the coach
       chose. See `filledText` above and A35 DECISION 1. `editHappened()` is
       deferred with it -- an unedited sample is not "I have checked the
       roster", which is the claim that line is making below. */
    markFirstRunPending();
  } else {
    track('first_run_complete', { roster: bucketRoster(state.players.length) });
    // a roster typed from scratch is the most emphatic "I have checked the
    // roster" there is, and this path never touches soon()
    editHappened();
  }
  setView('games');
  renderAll();
  // after the entrance settles, not during it: the tour measures rects, and
  // the squad pills and timeline blocks are still flying into place here
  if (!state.tourSeen) setTimeout(startTour, 520);
}

export function initOnboarding(setViewFn, renderAllFn) {
  setView = setViewFn;
  renderAll = renderAllFn;

  on('#welGo', 'onclick', finishOnboarding);

  /* A52: two panes, one at a time. Setup is a second SCREEN rather than a box
     that appears under the first one, so the landing screen stays a landing
     screen and the form gets the whole viewport to itself.

     Focus goes to the heading, not to the first field: a field would open the
     keyboard over the screen a coach has just arrived at, and the heading is
     what tells a screen reader they went somewhere. Scroll to the top for the
     same reason -- arriving halfway down a page is not arriving. */
  const pane = (setup) => {
    set('#welLanding', 'hidden', setup);
    set('#welSetup', 'hidden', !setup);
    scrollTo({ top: 0, behavior: REDUCED.matches ? 'auto' : 'smooth' });
    ($(setup ? '#welSetupHd' : '#welType'))?.focus({ preventScroll: true });
  };
  on('#welType', 'onclick', () => pane(true));
  on('#welBack', 'onclick', () => pane(false));

  /* Both doors land on setup; this one arrives with the roster in the box.
     The pane is switched BEFORE the fill so `#welCount` -- which is the live
     region under the box -- announces "11 players. Ready." into a screen that
     is actually on. */
  on('#welTry', 'onclick', () => { pane(true); fillSample(); });
  // The same fill for a coach who walked in by typing and then changed their mind.
  on('#welFill', 'onclick', () => fillSample());
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
  on('#welRoster', 'oninput', () => {
    const n = parseRoster($('#welRoster').value).length;
    const c = $('#welCount');
    $('#welRoster').removeAttribute('aria-invalid');
    /* The fill offers to do something the box has already had done to it, so
       it goes while there is anything in there and comes back if the coach
       clears it. A coach who arrived through "Start with a sample team" never
       sees it at all, which is the point. */
    set('#welFill', 'hidden', n > 0);
    c.className = 'note' + (n >= 5 ? ' ready' : '');
    c.textContent = n === 0
      ? 'Paste from wherever your roster lives. Jersey numbers are optional.'
      : n < 5 ? `${n} player${n === 1 ? '' : 's'}. 5 needed to field a lineup.`
      : `${n} players. Ready.`;
  });
  on('#welRoster', 'onkeydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') finishOnboarding();
  });

  renderWelcome();

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
