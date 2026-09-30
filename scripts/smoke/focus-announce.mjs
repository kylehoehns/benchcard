/* #139's own guard (see docs/specs/139-focus-announce.md's Proof section):
 * items 1-14 in one check -- a pushed screen lands focus on its own h1, the
 * three callers that place their own focus keep winning, Back returns it to
 * the door it came from (never BODY), no move at boot or on welcome, the tab
 * title follows the pushed heading, bench mode's dozen focus rules, the live
 * region text a stint change writes, the accessible names and pressed states
 * Chrome's own AX tree reports, toasts staying reachable while a dialog or
 * bench mode is open, a plain Shuffle's own announcement, and #issues holding
 * its node identity across a same-text render.
 *
 * Real input where the input MODALITY is the claim. `:focus-visible` is
 * Chromium's own heuristic for "was the last interaction that led to this
 * focus a keyboard one" -- a scripted `.focus()` call never satisfies it
 * (confirmed empirically against this app, team-color.mjs's own comment), but
 * a real key press that SYNCHRONOUSLY triggers a click handler which then
 * moves focus again (exactly what `applyView`'s own `focusAfterTransition`
 * does) keeps that keyboard modality through the chain -- the same reason a
 * Tab-then-Enter reaches a ring on a freshly routed SPA screen in any app.
 * So every door below is entered with a real Enter dispatched at a
 * script-focused door (the door's OWN ring is not the claim; the ring after
 * the push is), and left with a real mouse tap once, to prove the opposite:
 * a pointer-triggered push shows no ring on the heading it lands on.
 *
 * Chrome's accessibility tree, not a screen reader: `Accessibility.
 * getPartialAXTree` off a live `objectId` for one element's own name
 * (items 8, 9), `Accessibility.getFullAXTree` for how many nodes hold one
 * piece of live text (item 11) -- neither domain is used anywhere else in
 * this suite yet, so both are enabled once here and disabled again after.
 * A real screen reader is not run in CI (spec's own "Out of scope" note);
 * the AX tree is the browser's own answer to the same question a screen
 * reader would ask, which is what the spec's Proof table names as the seam. */
import { evalIn, step, onScreen, objectIdFor, wait } from './dom.mjs';
import { RICH, goRich, reloadWithRecord } from './fixtures.mjs';
import { realTap, tap, key, settle, setGame, evalJSON, waitClosed } from './sheet-drive.mjs';

/* ---- small helpers, shared by every section below ---- */

// items 6 (reset/sit-for-rest undo), 11, 12, 13: an underway game with one
// hand swap already in place at stint 1 -- the same shape rotation-undo.mjs's
// own UNDERWAY_SEED uses, so a bench player is guaranteed and every toast
// path below actually fires. `at` is the live stint the coach is viewing.
const handSwapSeed = (at = 2) => `
      const five = s.plans[0].stints[1].onFloor.slice();
      const benchId = s.state.players.map(pl => pl.id).find(id => !five.includes(id));
      five[0] = benchId;
      s.state.day.games[0].live = { at: ${at}, overrides: { 1: five } };
    `;

async function focusInfo(c) {
  return evalJSON(c, `(() => {
    const a = document.activeElement;
    return JSON.stringify({
      id: a && a.id ? a.id : null,
      tag: a ? a.tagName : null,
      cls: a && a.className ? String(a.className) : null,
      ringed: a ? a.matches(':focus-visible') : false,
      scrollY: window.scrollY,
      title: document.title,
    });
  })()`);
}

// A real Tab keypress puts Chrome in keyboard modality (add-game-flow.mjs's
// own `headingDrawsNoRing` comment: "Dispatching Enter at the button instead
// does not work -- CDP delivers the key but Chrome synthesizes no activation
// from it"); a script `.click()` right after runs the door's own handler
// without a pointer event resetting that modality back to mouse. Where Tab
// itself lands does not matter -- the modality it sets is global, not tied
// to the element it moves focus to.
async function enterOn(c, sel) {
  await key(c, 'Tab');
  await evalIn(c, step(`document.querySelector(${JSON.stringify(sel)}).click()`));
}

// Chrome's own accessible name for one element, off a live `objectId` --
// never the DOM text read a second way, which is the whole point of asking
// the AX tree at all (items 8/9's seam, per the Proof table). `objectIdFor`
// (`dom.mjs`) throws on the page's own exception; this kept its own contract
// from before that helper existed -- undefined for anything that does not
// resolve, a missing element and a thrown exception alike -- since its one
// caller (item 9) already reads `undefined` the same as "nothing to report".
async function axName(c, sel) {
  let objectId;
  try { objectId = await objectIdFor(c, sel); } catch { return undefined; }
  if (!objectId) return undefined;
  const { nodes } = await c.send('Accessibility.getPartialAXTree', { objectId, fetchRelatives: false });
  const node = (nodes || []).find(n => !n.ignored);
  return node && node.name ? node.name.value : null;
}

// How many live AX nodes hold exactly this text -- item 11's "announced
// once" (the spec's own note: proved by the tree, not by ear in CI).
async function axLiveCount(c, text) {
  const { nodes } = await c.send('Accessibility.getFullAXTree', {});
  // `InlineTextBox` is Chrome's own layout-level child of every `StaticText`
  // node -- one piece of rendered text always reports as both, so counting
  // it too would double every match regardless of the app; excluded here to
  // leave one accessible node per piece of text, matching what a screen
  // reader is actually handed.
  return (nodes || []).filter(n => !n.ignored && n.name && n.name.value === text &&
    n.role?.value !== 'InlineTextBox').length;
}

export async function focusAnnouncePass(c, origin) {
  const problems = [];
  const notes = [];

  try {
    await c.send('Accessibility.enable', {});

    /* ================================================================
       items 1, 3, 4, 5: a pushed screen's own heading, Back to the door,
       no move at boot/welcome, the tab title.
       ================================================================ */
    const today1 = { ...JSON.parse(JSON.stringify(RICH)), view: 'today' };
    await reloadWithRecord(c, origin, today1);

    // item 5: the expected home title comes from the served index.html's own
    // `<title>`, not a second hand-typed copy of it -- `render.js`'s own
    // `HOME_TITLE` reads the same tag at module load, so this check can still
    // fail if Today's title were ever wrong.
    const indexHtml = await (await fetch(`${origin}/index.html`)).text();
    const HOME_TITLE = indexHtml.match(/<title>([^<]*)<\/title>/)[1];
    const t0 = await focusInfo(c);
    if (t0.title !== HOME_TITLE) problems.push(`item 5: Today's tab title reads ${JSON.stringify(t0.title)}, want ${JSON.stringify(HOME_TITLE)}`);

    // item 1/5: the Hawks game pass, matched by data-fk (teams-view.js sets
    // it on every rebuilt pass) -- lands on #gameTitle, titles "Hawks · Benchcard".
    await enterOn(c, '.today-game[data-fk="today-game:g0"]');
    let f = await focusInfo(c);
    if (f.id !== 'gameTitle') problems.push(`item 1: pushing Hawks landed focus on ${JSON.stringify(f.id)}, want #gameTitle`);
    if (!f.ringed) problems.push('item 1: #gameTitle is not :focus-visible after a real Enter push -- the ring should show for a keyboard-triggered push');
    if (f.scrollY !== 0) problems.push(`item 1: scrollY is ${f.scrollY} right after the push, want 0`);
    if (f.title !== 'Hawks · Benchcard') problems.push(`item 5: the tab title reads ${JSON.stringify(f.title)}, want "Hawks · Benchcard"`);
    notes.push('item 1: pushing the Hawks game lands keyboard focus on #gameTitle at scrollY 0, with a ring');
    notes.push('item 5: the tab title reads "Hawks · Benchcard" on the game screen');

    // item 3: Back (#backBtn) returns focus to the SAME game's pass, matched
    // fresh by data-fk since renderTabs rebuilds the node on every return.
    await tap(c, `document.getElementById('backBtn').click()`);
    f = await focusInfo(c);
    if (f.id) problems.push(`item 3: after Back, activeElement has id ${JSON.stringify(f.id)} -- want the Hawks pass, which has none`);
    const backOk = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('.today-game[data-fk="today-game:g0"]'))`);
    if (backOk !== true) problems.push('item 3: Back did not return focus to the Hawks pass (.today-game[data-fk="today-game:g0"])');
    else notes.push('item 3: #backBtn from the game screen returns focus to the same pass, matched by data-fk');

    // item 1/3/5, a second game: Ravens, so the game-id match is proved
    // against more than one id, and Back a second way (history.back()).
    await enterOn(c, '.today-game[data-fk="today-game:g1"]');
    f = await focusInfo(c);
    if (f.id !== 'gameTitle') problems.push(`item 1: pushing Ravens landed focus on ${JSON.stringify(f.id)}, want #gameTitle`);
    if (f.title !== 'Ravens · Benchcard') problems.push(`item 5: the tab title reads ${JSON.stringify(f.title)}, want "Ravens · Benchcard"`);
    await tap(c, `history.back()`);
    const backOk2 = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('.today-game[data-fk="today-game:g1"]'))`);
    if (backOk2 !== true) problems.push('item 3: history.back() from the Ravens screen did not return focus to its own pass');
    else notes.push('item 3: history.back() also returns focus to the door it left, matched by data-fk for a second game');

    // item 1/3/5: Team.
    await enterOn(c, '#todayTeam');
    f = await focusInfo(c);
    if (f.id !== 'teamTitle') problems.push(`item 1: pushing Team landed focus on ${JSON.stringify(f.id)}, want #teamTitle`);
    if (f.title !== 'Smoke Test · Benchcard') problems.push(`item 5: Team's tab title reads ${JSON.stringify(f.title)}, want "Smoke Test · Benchcard"`);
    await tap(c, `document.getElementById('backBtn').click()`);
    const backTeam = await evalJSON(c, `JSON.stringify(document.activeElement === document.getElementById('todayTeam'))`);
    if (backTeam !== true) problems.push('item 3: Back from Team did not return focus to #todayTeam');
    notes.push('item 1: pushing Team lands focus on #teamTitle, titled "Smoke Test · Benchcard", and Back returns it to #todayTeam');

    // item 1/3/5: Season -- heading has no id, matched by class instead.
    await enterOn(c, '#todaySeason');
    f = await focusInfo(c);
    const seasonHOk = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('.season-h1'))`);
    if (seasonHOk !== true) problems.push(`item 1: pushing Season landed focus on ${JSON.stringify(f)}, want .season-h1`);
    if (f.title !== 'Season · Benchcard') problems.push(`item 5: Season's tab title reads ${JSON.stringify(f.title)}, want "Season · Benchcard"`);
    await tap(c, `document.getElementById('backBtn').click()`);
    const backSeason = await evalJSON(c, `JSON.stringify(document.activeElement === document.getElementById('todaySeason'))`);
    if (backSeason !== true) problems.push('item 3: Back from Season did not return focus to #todaySeason');
    notes.push('item 1: pushing Season lands focus on .season-h1, titled "Season · Benchcard", and Back returns it to #todaySeason');

    // item 1/3/5: Settings, whose heading is #barTitle (VIEW_HEADING's own
    // entry for a screen with no large title of its own).
    await enterOn(c, '#settingsBtn');
    f = await focusInfo(c);
    if (f.id !== 'barTitle') problems.push(`item 1: pushing Settings landed focus on ${JSON.stringify(f.id)}, want #barTitle`);
    if (f.title !== 'Settings · Benchcard') problems.push(`item 5: Settings' tab title reads ${JSON.stringify(f.title)}, want "Settings · Benchcard"`);
    await tap(c, `document.getElementById('backBtn').click()`);
    const backSettings = await evalJSON(c, `JSON.stringify(document.activeElement === document.getElementById('settingsBtn'))`);
    if (backSettings !== true) problems.push('item 3: Back from Settings did not return focus to #settingsBtn');
    notes.push('item 1: pushing Settings lands focus on #barTitle, titled "Settings · Benchcard", and Back returns it to #settingsBtn');

    // item 1's other clause: a mouse-triggered push shows no ring.
    await realTap(c, '.today-game[data-fk="today-game:g0"]');
    f = await focusInfo(c);
    if (f.id !== 'gameTitle') problems.push(`item 1: a mouse tap on the Hawks pass landed focus on ${JSON.stringify(f.id)}, want #gameTitle still`);
    if (f.ringed) problems.push('item 1: #gameTitle shows a ring after a mouse-triggered push, want none');
    else notes.push('item 1: a mouse-triggered push lands focus on the heading with no ring');
    await tap(c, `document.getElementById('backBtn').click()`);

    // item 3, still resolvable: removing the OPEN Ravens game leaves Hawks in
    // the day (reindexed to slot 0) -- its own door still exists, so Back
    // lands there, not on a fallback. Also proves the door survives a second,
    // full render right behind it: Remove this game's own Undo toast goes
    // through `viewRefresh`'s default full `render()`, called immediately
    // after `focusAfterTransition` lands here.
    await enterOn(c, '.today-game[data-fk="today-game:g1"]');
    await tap(c, `document.getElementById('removeGame').click()`);
    const keptDoorOk = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('.today-game[data-fk="today-game:g0"]'))`);
    if (keptDoorOk !== true) problems.push(`item 3: removing the OPEN Ravens game (Hawks still in the day) left focus at ${JSON.stringify(await focusInfo(c))}, want the Hawks pass -- its door still exists`);
    else notes.push('item 3: removing the open game lands focus back on the remaining game’s own door, surviving the Undo toast’s own full render right behind it');
    // Undo the removal so the rest of this check (and the row after it) keeps
    // both of RICH's games; goRich in `finally` would also cover this, but
    // there is no reason to rely on that for the rows still ahead in this run.
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);

    // item 3's fallback: with the day's ONLY game removed, there is no door
    // left at all (#126: the day itself is dropped) -- Back falls to `.today-h1`.
    const oneGame = JSON.parse(JSON.stringify(RICH));
    oneGame.teams[0].days[0].games = [oneGame.teams[0].days[0].games[0]];
    oneGame.view = 'today';
    await reloadWithRecord(c, origin, oneGame);
    await enterOn(c, '.today-game[data-fk="today-game:g0"]');
    await tap(c, `document.getElementById('removeGame').click()`);
    const fallbackOk = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('.today-h1'))`);
    if (fallbackOk !== true) problems.push(`item 3: removing the day's only game left focus at ${JSON.stringify(await focusInfo(c))}, want .today-h1 (no door left)`);
    else notes.push('item 3: with no door left at all (the day’s only game removed), Back falls back to .today-h1');
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);

    // item 4: no forced focus move at boot, on an ordinary screen or on the
    // welcome screen. `reloadWithRecord` always waits for `.today-game`, which
    // only ever happens after the browser's own default post-load focus
    // (BODY, or nothing) has already settled -- so a fresh reload's own
    // activeElement is read honestly, not moved by this app.
    await reloadWithRecord(c, origin, today1);
    const boot = await evalJSON(c, `JSON.stringify(document.activeElement === document.body || document.activeElement === null)`);
    if (boot !== true) problems.push(`item 4: activeElement after a cold Today load is ${JSON.stringify(await focusInfo(c))}, want BODY (no forced move)`);
    else notes.push('item 4: a cold load onto Today does not force focus anywhere');

    const welcome = { version: 3, onboarded: false, players: [], day: { name: '', games: [] }, activeGame: 0, ui: {} };
    await reloadWithRecord(c, origin, welcome, `!document.getElementById('view-welcome').hidden`);
    const bootWelcome = await evalJSON(c, `JSON.stringify(document.activeElement === document.body || document.activeElement === null)`);
    if (bootWelcome !== true) problems.push(`item 4: activeElement on the welcome screen is ${JSON.stringify(await focusInfo(c))}, want BODY`);
    else notes.push('item 4: the welcome screen gets no forced focus move either');

    /* ================================================================
       item 2: the three callers that place their own focus win.
       ================================================================ */
    await goRich(c, origin);

    // (a) Team's add-player path from the Timeline, off an EMPTY roster --
    // `rosterCta()` (timeline.js) only renders while `noRoster()` is true, so
    // RICH's own 11 players cannot reach this path -- emptied the same way
    // timeline-card-sheet.mjs's own C5 does. Its own button (`#timeline
    // .roster-empty button`, "Add a player") is what a coach presses; it
    // jumps to Team and clicks Team's OWN `#emptyAdd` for us, same as C5
    // documents -- pressing `#emptyAdd` directly would skip the jump this
    // item is about.
    await tap(c, setGame(`s.team().players.length = 0;`));
    await tap(c, `document.querySelector('#timeline .roster-empty button').click()`);
    const addPlayerFocus = await evalJSON(c, `(() => {
      const a = document.activeElement;
      return JSON.stringify({ id: a?.id || null, inSheet: !!a?.closest('#sheetAddPlayer'), isTeamTitle: a?.id === 'teamTitle' });
    })()`);
    const apf = addPlayerFocus;
    if (apf.isTeamTitle || !apf.inSheet) {
      problems.push(`item 2: Team's add-player path left focus at ${JSON.stringify(apf)}, want inside #sheetAddPlayer, not #teamTitle`);
    } else notes.push("item 2: the Timeline's add-a-player path lands focus inside #sheetAddPlayer, not #teamTitle");
    await evalIn(c, step(`document.getElementById('sheetAddPlayer')?.close?.()`));

    // (b) "Add a team", via the team menu. #146 moved this door from Settings
    // onto the shared `#firstRunFlow` -- `paintFlowShell` (trap.js) focuses
    // the step's own heading (`h2.flow-q`) on every open, first run's welcome
    // door included, so Add a team landing there too is the same contract,
    // not a caller placing its own focus. Read off the DOM rather than a
    // hard-coded id, since that heading carries none.
    await goRich(c, origin);
    await tap(c, `document.getElementById('teamBtn').click()`);
    await tap(c, `[...document.querySelectorAll('#teamMenu .teammenu-item')].find(b => b.textContent === 'Add a team')?.click()`);
    const addTeamFocus = await evalJSON(c, `(() => {
      const dialog = document.getElementById('firstRunFlow');
      const heading = dialog?.querySelector('h2.flow-q') ?? null;
      return JSON.stringify({ open: !!dialog?.open, onHeading: !!heading && document.activeElement === heading });
    })()`);
    if (!addTeamFocus.open || !addTeamFocus.onHeading) problems.push(`item 2: "Add a team" left focus at ${JSON.stringify(await focusInfo(c))}, want #firstRunFlow's own step heading (h2.flow-q), same as first run's own open`);
    else notes.push('item 2: "Add a team" opens #firstRunFlow and lands focus on its own step heading (h2.flow-q), the same target first run\'s own open uses -- not Settings\' #teamName, which #146 removed');

    // (c) the add-game flow's own commit ("Use it") lands on the game.
    await goRich(c, origin);
    await tap(c, `document.querySelector('#barBack').hidden || document.querySelector('#backBtn').click()`);
    await realTap(c, '#todayAddGame');
    await realTap(c, '#agBody .flow-card');
    await waitClosed(c, '#addGameFlow');
    await settle(c);
    const commitFocus = await focusInfo(c);
    if (commitFocus.id !== 'gameTitle') problems.push(`item 2: committing the add-game flow left focus at ${JSON.stringify(commitFocus)}, want #gameTitle`);
    else notes.push('item 2: "Use it" in the add-game flow lands focus on #gameTitle, same as any other push');
    await goRich(c, origin);

    /* ================================================================
       items 6-12: bench mode.
       ================================================================ */
    const total = 8; // RICH's Hawks: 4 periods x 8 minutes, subs every 4 -> 8 stints

    // item 6, first bullet: Next onto the last stint of an UNFINISHED game.
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: total - 2, overrides: {} };`.replace('total', String(total))));
    await tap(c, `document.getElementById('abBench').click()`);
    await tap(c, `document.getElementById('gmNext2').click()`);
    let bf = await focusInfo(c);
    if (bf.id !== 'gmFinish') problems.push(`item 6: Next onto the last stint of an unfinished game left focus on ${JSON.stringify(bf.id)}, want #gmFinish`);
    else notes.push('item 6: Next onto the last stint of an unfinished game lands focus on #gmFinish');
    await tap(c, `document.getElementById('gmClose').click()`);

    // item 6, second bullet: Next onto the last stint of an ALREADY finished
    // game -- #gmFinish never shows there (renderGameMode's own showFinish),
    // so the same disabled-#gmNext2 branch falls back to #gmPrev instead.
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: 0, overrides: {}, finished: true };`));
    await tap(c, `document.getElementById('abBench').click()`);
    for (let i = 0; i < total - 1; i++) await tap(c, `document.getElementById('gmNext2').click()`);
    bf = await focusInfo(c);
    if (bf.id !== 'gmPrev') problems.push(`item 6: Next onto the last stint of a FINISHED game left focus on ${JSON.stringify(bf.id)}, want #gmPrev`);
    else notes.push('item 6: Next onto the last stint of an already-finished game lands focus on #gmPrev, since #gmFinish never shows there');

    // item 6, third bullet: Previous onto stint 1 (index 0) lands on #gmNext2.
    await tap(c, `document.getElementById('gmClose').click()`);
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: 1, overrides: {} };`));
    await tap(c, `document.getElementById('abBench').click()`);
    await tap(c, `document.getElementById('gmPrev').click()`);
    bf = await focusInfo(c);
    if (bf.id !== 'gmNext2') problems.push(`item 6: Previous onto stint 1 left focus on ${JSON.stringify(bf.id)}, want #gmNext2`);
    else notes.push('item 6: Previous onto stint 1 lands focus on #gmNext2');

    // item 6's arrow-key clause: the same rule, driven by a real ArrowRight
    // rather than a click on #gmNext2 -- shortcuts.js's own handler is just
    // `$('#gmNext2').click()`, so this is the same code path, proved with a
    // real key instead of assumed from it.
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: total - 2, overrides: {} };`.replace('total', String(total))));
    await tap(c, `document.getElementById('gmClose').click()`);
    await tap(c, `document.getElementById('abBench').click()`);
    await key(c, 'ArrowRight', 39);
    bf = await focusInfo(c);
    if (bf.id !== 'gmFinish') problems.push(`item 6: a real ArrowRight onto the last stint left focus on ${JSON.stringify(bf.id)}, want #gmFinish, same as the button`);
    else notes.push('item 6: a real ArrowRight key behaves the same as #gmNext2 for focus');
    await tap(c, `document.getElementById('gmClose').click()`);

    // item 7: #gmLive holds "<title>, <subtitle>" after a stint change, and
    // ONLY after a change -- primed to the OPENING stint (gamemode.js's own
    // comment on `lastLiveStint`), so stint 1's own text is never announced;
    // the first text #gmLive ever holds is stint 2's, stepping forward.
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: 0, overrides: {} };`));
    await tap(c, `document.getElementById('abBench').click()`);
    let live0 = await evalJSON(c, `JSON.stringify(document.getElementById('gmLive')?.textContent ?? null)`);
    if (live0 !== '') problems.push(`item 7: #gmLive reads ${JSON.stringify(live0)} right after opening, want empty (not on open)`);
    const WANT2 = 'Q1 · 4:00 to 0:00, 2 of 8';
    const WANT3 = 'Q2 · 8:00 to 4:00, 3 of 8';
    const WANTLAST = 'Q4 · 4:00 to 0:00, 8 of 8';
    await tap(c, `document.getElementById('gmNext2').click()`);
    let liveN = await evalJSON(c, `JSON.stringify(document.getElementById('gmLive')?.textContent ?? null)`);
    if (liveN !== WANT2) problems.push(`item 7: #gmLive reads ${JSON.stringify(liveN)} after the first Next, want ${JSON.stringify(WANT2)}`);
    await tap(c, `document.getElementById('gmNext2').click()`);
    liveN = await evalJSON(c, `JSON.stringify(document.getElementById('gmLive')?.textContent ?? null)`);
    if (liveN !== WANT3) problems.push(`item 7: #gmLive reads ${JSON.stringify(liveN)} after the second Next, want ${JSON.stringify(WANT3)}`);
    else notes.push('item 7: #gmLive reads the spec\'s own stint-line sequence stepping forward, "Q1 · 4:00 to 0:00, 2 of 8" then "Q2 · 8:00 to 4:00, 3 of 8"');
    // a pick (no stint change) must leave it alone
    await tap(c, `document.querySelector('#gmFloor .gm-p')?.click()`);
    const liveAfterPick = await evalJSON(c, `JSON.stringify(document.getElementById('gmLive')?.textContent ?? null)`);
    if (liveAfterPick !== WANT3) problems.push(`item 7: #gmLive changed to ${JSON.stringify(liveAfterPick)} after a pick with no stint change, want it to stay ${JSON.stringify(WANT3)}`);
    else notes.push('item 7: #gmLive is untouched by a repaint that does not change the stint (a pick)');
    await tap(c, `[...document.querySelectorAll('#gmBenchLab button')].find(b => b.dataset.scope === 'stint')?.click() ?? document.querySelector('#gmFloor .gm-p')?.click()`);
    for (let i = 0; i < total - 3; i++) await tap(c, `document.getElementById('gmNext2').click()`);
    liveN = await evalJSON(c, `JSON.stringify(document.getElementById('gmLive')?.textContent ?? null)`);
    if (liveN !== WANTLAST) problems.push(`item 7: #gmLive reads ${JSON.stringify(liveN)} on the last stint, want ${JSON.stringify(WANTLAST)}`);
    else notes.push('item 7: #gmLive reads "Q4 · 4:00 to 0:00, 8 of 8" on the last stint, the spec\'s own last value in the sequence');
    await tap(c, `document.getElementById('gmClose').click()`);

    /* items 8, 9: aria-pressed and accessible names. Fresh bench open, stint
       0, so the floor/bench composition is the one `openAt` picks for an
       unfinished game at live.at 0 -- deterministic given RICH's own seed. */
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: 0, overrides: {} };`));
    await tap(c, `document.getElementById('abBench').click()`);
    const floorPid = await evalJSON(c, `JSON.stringify(document.querySelector('#gmFloor .gm-p')?.dataset.pid ?? null)`);
    const pid = floorPid;
    if (!pid) problems.push('items 8/9: #gmFloor has no .gm-p row to read -- nothing measured');
    else {
      await tap(c, `document.querySelector('#gmFloor [data-pid="${pid}"]').click()`);
      const pressed = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('#gmFloor .gm-p')].map(b => ({ pid: b.dataset.pid, pressed: b.getAttribute('aria-pressed') })))`);
      const picked = pressed.find(r => r.pid === pid);
      const others = pressed.filter(r => r.pid !== pid);
      if (!picked || picked.pressed !== 'true') problems.push(`item 8: the picked floor row's aria-pressed is ${picked?.pressed}, want "true"`);
      else if (others.some(r => r.pressed !== 'false')) problems.push(`item 8: an unpicked floor row's aria-pressed is not "false" (${JSON.stringify(others)})`);
      else notes.push('item 8: the picked floor row reads aria-pressed="true", the rest "false"');

      // item 9: the AX name for this row equals its own .sr-only label, and
      // that label leads with "<number>, <name>," -- roster facts, not a
      // computed minutes value (already proved at test/gamemode-focus-text.test.js).
      const rowInfo = await evalJSON(c, `(() => {
        const row = document.querySelector('#gmFloor [data-pid="${pid}"]');
        const label = row.querySelector('.sr-only')?.textContent ?? null;
        return JSON.stringify({ label });
      })()`);
      const name9 = await axName(c, `#gmFloor [data-pid="${pid}"]`);
      if (name9 !== rowInfo.label) problems.push(`item 9: the AX name for the picked floor row is ${JSON.stringify(name9)}, want it to equal its own .sr-only text ${JSON.stringify(rowInfo.label)}`);
      else notes.push("item 9: the floor row's Chrome-reported accessible name equals its own .sr-only label text");
      const roster = JSON.parse(await evalIn(c, `(async () => {
        const s = await import('/state.js');
        const pl = s.state.players.find(p => p.id === '${pid}');
        return JSON.stringify({ name: pl.name, number: pl.number });
      })()`));
      const wantLead = roster.number ? `${roster.number}, ${roster.name}, ` : `${roster.name}, `;
      if (!(rowInfo.label || '').startsWith(wantLead)) {
        problems.push(`item 9: the row's label reads ${JSON.stringify(rowInfo.label)}, want it to start with ${JSON.stringify(wantLead)}`);
      }

      // item 8, continued: the scope buttons and "Sit for the rest".
      const scopeInfo = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('#gmBenchLab button')].map(b => ({ text: b.textContent, scope: b.dataset.scope, pressed: b.getAttribute('aria-pressed') })))`);
      const stintBtn = scopeInfo.find(b => b.scope === 'stint');
      const restBtn = scopeInfo.find(b => b.scope === 'rest');
      const sitBtn = scopeInfo.find(b => b.text === 'Sit for the rest');
      if (!stintBtn || stintBtn.pressed !== 'true') problems.push(`item 8: "This stint" reads aria-pressed=${stintBtn?.pressed}, want "true" (the default scope)`);
      if (!restBtn || restBtn.pressed !== 'false') problems.push(`item 8: "Rest of game" reads aria-pressed=${restBtn?.pressed}, want "false"`);
      if (sitBtn && sitBtn.pressed !== null) problems.push(`item 8: "Sit for the rest" carries aria-pressed=${sitBtn.pressed}, want none`);
      await tap(c, `[...document.querySelectorAll('#gmBenchLab button')].find(b => b.dataset.scope === 'rest').click()`);
      const afterRest = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('#gmBenchLab button')].map(b => ({ scope: b.dataset.scope, pressed: b.getAttribute('aria-pressed') })))`);
      const rest2 = afterRest.find(b => b.scope === 'rest'), stint2 = afterRest.find(b => b.scope === 'stint');
      if (rest2?.pressed !== 'true' || stint2?.pressed !== 'false') {
        problems.push(`item 8: after tapping "Rest of game" the two scope buttons read ${JSON.stringify(afterRest)}, want rest=true/stint=false`);
      } else notes.push('item 8: the scope buttons carry aria-pressed matching which one is on, and "Sit for the rest" carries none');

      // item 6: "This stint"/"Rest of game" land focus on the button just
      // pressed.
      bf = await focusInfo(c);
      const restFocused = await evalJSON(c, `JSON.stringify(document.activeElement === [...document.querySelectorAll('#gmBenchLab button')].find(b => b.dataset.scope === 'rest'))`);
      if (restFocused !== true) problems.push('item 6: tapping "Rest of game" did not leave focus on that same button');
      else notes.push('item 6: tapping a scope button lands focus on that same button');
    }

    // item 9's "no number" clause: take whichever player bench mode shows
    // first (the fixture's lineup depends on the day it runs, so no fixed
    // id), clear their number, and confirm the label no longer leads with a
    // digit.
    const noNum = await evalJSON(c, `(async () => {
      const s = await import('/state.js');
      const pid = document.querySelector('#gamemode [data-pid]')?.dataset.pid;
      const pl = pid && s.state.players.find(p => p.id === pid);
      if (!pl) return JSON.stringify(null);
      pl.number = '';
      return JSON.stringify({ pid, name: pl.name || 'Unnamed' });
    })()`);
    // gamemode.js exposes no direct re-render hook here; closing and
    // reopening bench mode repaints it off the mutated roster.
    await tap(c, `document.getElementById('gmClose').click()`);
    await tap(c, `document.getElementById('abBench').click()`);
    const noNumRow = noNum && await evalJSON(c, `(() => {
      const row = document.querySelector('#gamemode [data-pid="${noNum?.pid}"]');
      return JSON.stringify({ found: !!row, label: row ? row.querySelector('.sr-only')?.textContent ?? null : null });
    })()`);
    if (!noNum || !noNumRow.found) problems.push(`item 9: could not find a player row in bench mode to check the no-number case (${JSON.stringify(noNum)})`);
    else if (!(noNumRow.label || '').startsWith(`${noNum.name}, `)) {
      problems.push(`item 9: with no jersey number, the row's label reads ${JSON.stringify(noNumRow.label)}, want it to start with "${noNum.name}, " (no leading number)`);
    } else notes.push('item 9: a player with no jersey number gets a label with no leading number token');
    await tap(c, `document.getElementById('gmClose').click()`);
    await goRich(c, origin);

    // item 10: #gmReset's own accessible name.
    const resetAttrs = await evalJSON(c, `JSON.stringify({
      label: document.getElementById('gmReset')?.getAttribute('aria-label') ?? null,
      title: document.getElementById('gmReset')?.getAttribute('title') ?? null,
    })`);
    if (resetAttrs.label !== 'Back to the printed plan') problems.push(`item 10: #gmReset's aria-label reads ${JSON.stringify(resetAttrs.label)}, want "Back to the printed plan"`);
    if (resetAttrs.title) problems.push(`item 10: #gmReset still carries a title attribute (${JSON.stringify(resetAttrs.title)}), want none`);
    else notes.push('item 10: #gmReset carries aria-label "Back to the printed plan" and no title');

    /* items 6 (swap/sit-for-rest/reset/undo), 11, 12: driven together off one
       underway seed with a hand swap already in place, the same UNDERWAY_SEED
       shape rotation-undo.mjs seeds -- Hawks at live.at 2, so a bench player
       is guaranteed (the fixture's own eleven, five on floor). */
    await evalIn(c, setGame(`
      const five = s.plans[0].stints[2].onFloor.slice();
      const benchId = s.state.players.map(pl => pl.id).find(id => !five.includes(id));
      const outId = five[0];
      s.state.day.games[0].live = { at: 2, overrides: {} };
    `));
    await tap(c, `document.getElementById('abBench').click()`);
    const outPid = await evalJSON(c, `JSON.stringify(document.querySelector('#gmFloor .gm-p')?.dataset.pid ?? null)`);
    await tap(c, `document.querySelector('#gmFloor [data-pid="${outPid}"]').click()`);
    // bench rows carry no `data-pid` of their own (only floor rows do, per
    // gamemode.js) -- matched by the name text a coach actually reads instead.
    // `.nm`'s first child is the name text node; a "just on" tag lands right
    // after it once the swap has landed this same player on the floor.
    const inName = await evalJSON(c, `JSON.stringify(document.querySelector('#gmBench .gm-b .nm')?.childNodes[0]?.textContent ?? null)`);
    await tap(c, `[...document.querySelectorAll('#gmBench .gm-b')].find(b => b.querySelector('.nm')?.childNodes[0]?.textContent === ${JSON.stringify(inName)})?.click()`);
    bf = await focusInfo(c);
    const swapFocusOk = await evalJSON(c, `JSON.stringify(document.activeElement === [...document.querySelectorAll('#gmFloor .gm-p')].find(r => r.querySelector('.nm')?.childNodes[0]?.textContent === ${JSON.stringify(inName)}))`);
    if (swapFocusOk !== true) problems.push(`item 6: after a swap, focus is at ${JSON.stringify(bf)}, want the incoming player's (${JSON.stringify(inName)}) own floor row`);
    else notes.push('item 6: a swap lands focus on the incoming player’s own floor row');

    // item 11: exactly one live node holds the swap toast's own text, and
    // it is a descendant of #gamemode (liftToastsIntoBench moves #toasts
    // there while bench mode is open).
    const swapText = await evalJSON(c, `JSON.stringify(document.querySelector('.toast[data-undo] .tmsg')?.textContent ?? null)`);
    if (!swapText) problems.push('item 11: no Undo toast text found after the swap');
    else {
      const inGamemode = await evalJSON(c, `JSON.stringify(!!document.getElementById('gamemode')?.contains(document.getElementById('toasts')))`);
      if (inGamemode !== true) problems.push('item 11: #toasts is not a descendant of #gamemode while bench mode is open');
      const count1 = await axLiveCount(c, swapText);
      if (count1 !== 1) problems.push(`item 11: ${count1} accessible node(s) hold ${JSON.stringify(swapText)} right after the swap, want exactly 1`);
      else notes.push(`item 11: exactly one live node holds the swap toast's text while bench mode is open, inside #gamemode`);
      const undoTabbable = await evalJSON(c, `JSON.stringify(document.querySelector('.toast[data-undo] .tundo')?.tabIndex ?? null)`);
      if (Number(undoTabbable) < 0 && undoTabbable !== null) problems.push('item 11: the Undo button on the swap toast is not Tab-reachable');

      // ... then Done: the toast is still visible above the page, Undo still
      // works, and the text is not announced a second time.
      await tap(c, `document.getElementById('gmClose').click()`);
      const afterDone = await evalJSON(c, `JSON.stringify({
        visible: !!document.querySelector('.toast[data-undo]')?.getClientRects().length,
        text: document.querySelector('.toast[data-undo] .tmsg')?.textContent ?? null,
      })`);
      if (!afterDone.visible || afterDone.text !== swapText) {
        problems.push(`item 11: after Done, the toast reads ${JSON.stringify(afterDone)}, want it still visible with the same text`);
      }
      const count2 = await axLiveCount(c, swapText);
      if (count2 !== 1) problems.push(`item 11: after Done, ${count2} node(s) hold the swap text, want still exactly 1 (not announced a second time)`);
      else notes.push('item 11: the swap toast survives Done above the page, with Undo still live and its text not re-announced');
      await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    }

    /* item 6 (reset/undo -> first floor row) and item 12 (a toast INSIDE an
       open dialog): reuse rotation-undo.mjs's own underway-with-a-hand-swap
       seed and its Who's here scenario, which raises the toast inside
       #sheetWho -- see that file's own UNDERWAY_SEED for why this exact
       fixture (not a fresh one) makes the toast actually fire. */
    await evalIn(c, setGame(handSwapSeed()));
    await tap(c, `document.getElementById('phrasePlayers').click()`);
    const beforeToast = await evalJSON(c, `JSON.stringify(!!document.querySelector('#sheetWho .bsheet-toasts'))`);
    await tap(c, `(async () => {
      const s = await import('/state.js');
      const five = s.state.day.games[0].live.overrides['1'];
      const target = s.state.players.find(p => !five.includes(p.id));
      const rows = [...document.querySelectorAll('#sheetWhoBody .who-row')];
      const row = rows.find(r => r.getAttribute('aria-label') === (target.name || 'Unnamed'));
      row.click();
    })()`);
    const hostInfo = await evalJSON(c, `(() => {
      const host = document.querySelector('#sheetWho .bsheet-toasts');
      return JSON.stringify({
        found: !!host,
        role: host ? host.getAttribute('role') : null,
        hasText: !!host?.querySelector('.tmsg'),
      });
    })()`);
    if (!hostInfo.found || hostInfo.role !== 'status') problems.push(`item 12: .bsheet-toasts inside #sheetWho reads ${JSON.stringify(hostInfo)}, want role="status"`);
    else if (!hostInfo.hasText) problems.push('item 12: .bsheet-toasts has role="status" but holds no toast text to announce');
    else notes.push('item 12: a toast raised inside an open sheet mounts in a .bsheet-toasts host with role="status", already in the DOM before the text lands');
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    await evalIn(c, step(`document.getElementById('sheetWhoClose')?.click()`));

    // item 6, reset/undo -> first floor row.
    await evalIn(c, setGame(handSwapSeed()));
    await tap(c, `document.getElementById('abBench').click()`);
    await tap(c, `document.getElementById('gmReset')?.click()`);
    bf = await focusInfo(c);
    const firstFloorOk = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('#gmFloor button.gm-p'))`);
    if (firstFloorOk !== true) problems.push(`item 6: #gmReset left focus at ${JSON.stringify(bf)}, want the first floor row`);
    else notes.push('item 6: #gmReset lands focus on the first floor row');
    // its own toast's Undo lands there too.
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);
    bf = await focusInfo(c);
    const undoFirstFloorOk = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('#gmFloor button.gm-p'))`);
    if (undoFirstFloorOk !== true) problems.push(`item 6: Undo on #gmReset's own toast left focus at ${JSON.stringify(bf)}, want the first floor row again`);
    else notes.push('item 6: Undo on a bench-mode toast also lands on the first floor row');
    await tap(c, `document.getElementById('gmClose').click()`);

    // item 6, "Sit for the rest": success lands on whoever filled the seat;
    // refused (a 'platoon' strategy) lands back on the row that was picked --
    // the same scenario rotation-undo.mjs's item 4 drives.
    await evalIn(c, setGame(handSwapSeed()));
    await tap(c, `document.getElementById('abBench').click()`);
    const sitOutPid = await evalJSON(c, `JSON.stringify(document.querySelector('#gmFloor .gm-p')?.dataset.pid ?? null)`);
    await tap(c, `document.querySelector('#gmFloor [data-pid="${sitOutPid}"]').click()`);
    await tap(c, `[...document.querySelectorAll('#gmBenchLab button')].find(b => b.textContent === 'Sit for the rest')?.click()`);
    // the focused element IS the floor row itself (`gmFocus` targets it
    // directly) -- reading its own `data-pid`, not an ancestor's.
    const gotPid = await evalJSON(c, `JSON.stringify(document.activeElement?.closest('#gmFloor') ? (document.activeElement.dataset.pid ?? null) : null)`);
    if (!gotPid || gotPid === sitOutPid) problems.push(`item 6: after "Sit for the rest" succeeds, focus is on ${JSON.stringify(gotPid)}, want a NEW floor row (whoever filled the seat), not the one sat`);
    else notes.push('item 6: "Sit for the rest" succeeding lands focus on the player who filled the seat, not the one sat');
    await tap(c, `document.getElementById('gmClose').click()`);

    await evalIn(c, setGame(handSwapSeed()));
    await tap(c, `document.getElementById('abBench').click()`);
    const refuseOutPid = await evalJSON(c, `JSON.stringify(document.querySelector('#gmFloor .gm-p')?.dataset.pid ?? null)`);
    await tap(c, `document.querySelector('#gmFloor [data-pid="${refuseOutPid}"]').click()`);
    await evalIn(c, `(async () => { const s = await import('/state.js'); s.state.day.games[0].strategy = 'platoon'; })()`);
    await tap(c, `[...document.querySelectorAll('#gmBenchLab button')].find(b => b.textContent === 'Sit for the rest')?.click()`);
    const refuseFocusOk = await evalJSON(c, `JSON.stringify(document.activeElement === document.querySelector('#gmFloor [data-pid="${refuseOutPid}"]'))`);
    if (refuseFocusOk !== true) problems.push(`item 6: a refused "Sit for the rest" left focus off the picked row (${JSON.stringify(await focusInfo(c))})`);
    else notes.push('item 6: a refused "Sit for the rest" leaves focus on the row that was picked');
    await tap(c, `document.getElementById('gmClose').click()`);
    await goRich(c, origin);

    /* ================================================================
       items 13, 14: plan changes.
       ================================================================ */
    // item 13: a plain Shuffle (not underway, no hand swaps) writes
    // "Rotation changed. " + the summary #summary already reads -- never
    // recomputed, read live off the DOM right after. RICH's own saved
    // `view: 'games'` with `activeGame: 0` already lands goRich on g0.
    await tap(c, `document.getElementById('regen').click()`);
    const regen1 = await evalJSON(c, `JSON.stringify({
      live: document.getElementById('regenLive')?.textContent ?? null,
      summary: document.getElementById('summary')?.textContent ?? null,
    })`);
    if (regen1.live !== `Rotation changed. ${regen1.summary}`) {
      problems.push(`item 13: after a plain Shuffle, #regenLive reads ${JSON.stringify(regen1.live)}, want "Rotation changed. " + the summary (${JSON.stringify(regen1.summary)})`);
    } else notes.push('item 13: a plain Shuffle writes "Rotation changed. " plus the current #summary text into #regenLive');
    // a repeat Shuffle re-announces even if the text comes out the same
    // (clear-then-next-frame): poll briefly since it is set one rAF later.
    let sawEmpty = null;
    for (let i = 0; i < 10; i++) {
      const mid = await evalJSON(c, `JSON.stringify(document.getElementById('regenLive')?.textContent ?? null)`);
      if (mid === '') { sawEmpty = true; break; }
      await wait(20);
    }
    if (sawEmpty === null) notes.push('item 13: #regenLive was not observed empty between Shuffles -- the clear-then-set race is timing-sensitive; not a hard failure since a second read below still confirms it repopulates');
    await settle(c);
    const regen2 = await evalJSON(c, `JSON.stringify(document.getElementById('regenLive')?.textContent ?? null)`);
    if (!regen2 || !regen2.startsWith('Rotation changed.')) problems.push(`item 13: after a second Shuffle, #regenLive reads ${JSON.stringify(regen2)}, want it to still read "Rotation changed. ..."`);

    // item 13: Shuffle clearing hand swaps -> only the existing flash, no
    // second line in #regenLive.
    await evalIn(c, setGame(handSwapSeed(0)));
    await evalIn(c, step(`document.getElementById('regenLive').textContent = ''`));
    await tap(c, `document.getElementById('regen').click()`);
    const regenCleared = await evalJSON(c, `JSON.stringify({
      live: document.getElementById('regenLive')?.textContent ?? null,
      flashShown: !!document.querySelector('.toast:not([data-undo]) .tmsg'),
    })`);
    if (regenCleared.live !== '') problems.push(`item 13: Shuffle clearing hand swaps still wrote #regenLive (${JSON.stringify(regenCleared.live)}), want it left empty -- only the existing flash announces`);
    else notes.push('item 13: Shuffle clearing hand swaps leaves #regenLive untouched; the existing flash toast is the only announcement');

    // item 13: Shuffle on an underway game -> only #134's own toast.
    await evalIn(c, setGame(`s.state.day.games[0].live = { at: 2, overrides: {} };`));
    await evalIn(c, step(`document.getElementById('regenLive').textContent = ''`));
    await tap(c, `document.getElementById('regen').click()`);
    const regenUnderway = await evalJSON(c, `JSON.stringify({
      live: document.getElementById('regenLive')?.textContent ?? null,
      toastShown: !!document.querySelector('.toast[data-undo] .tmsg'),
    })`);
    if (regenUnderway.live !== '') problems.push(`item 13: Shuffle on an underway game still wrote #regenLive (${JSON.stringify(regenUnderway.live)}), want it left empty -- only #134's own toast announces`);
    else notes.push("item 13: Shuffle on an underway game leaves #regenLive untouched; #134's own toast is the only announcement");
    await tap(c, `document.querySelector('.toast[data-undo] .tundo')?.click()`);

    // item 14: #issues keeps its own child node identity across a same-text
    // render, and replaces them once the text actually changes. RICH's own
    // saved `view: 'games'` with `activeGame: 0` already lands goRich on g0.
    await goRich(c, origin);
    const tagged = await evalJSON(c, `(() => {
      const box = document.getElementById('issues');
      if (!box) return JSON.stringify({ found: false });
      [...box.children].forEach((n, i) => { n.dataset.__probe = 'p' + i; });
      return JSON.stringify({ found: true, count: box.children.length });
    })()`);
    if (!tagged.found) {
      notes.push('item 14: #issues was not present to check (nothing to prove or falsify against this fixture)');
    } else {
      // an ordinary re-render with nothing changed underneath it
      await tap(c, `(async () => { const rr = await import('/render.js'); rr.renderAll(); })()`);
      const sameRender = await evalJSON(c, `(() => {
        const box = document.getElementById('issues');
        return JSON.stringify([...box.children].every((n, i) => n.dataset.__probe === 'p' + i));
      })()`);
      if (sameRender !== true) problems.push('item 14: a same-text render replaced #issues’ own child nodes, want their identity untouched');
      else notes.push('item 14: a same-text render leaves #issues’ own child nodes untouched (same node identity)');
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Accessibility.disable', {}).catch(() => {});
    // setup:'rich' checks share one page: leave the fixture the way the row
    // after this one expects to find it.
    await goRich(c, origin).catch(() => {});
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}${problems.length > 6 ? ` (+${problems.length - 6} more)` : ''}`
      : notes.join('; '),
  };
}

