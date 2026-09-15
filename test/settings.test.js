import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments, functionBody } from './js-comments.js';

/* ================================================================== *
 * team settings — v6
 *
 * `test/storage.test.js` holds the record's shape and the v5 → v6
 * migration. This file holds the other half: that the settings a coach
 * sets are the ones the solver is handed, that they belong to the team
 * and not the device, and that adding the accessor did not quietly put
 * a second copy of them in every saved record.
 *
 * It runs the real `state.js` rather than a copy, for the reason
 * season.test.js does: the point is that the wiring agrees with itself.
 * state.js reaches for a canvas at import time (dom.js keeps one for
 * text measurement), so a two-line stub stands in for the document.
 * ================================================================== */
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
};
const S = await import('../app/state.js');
const { sanitizeSettings } = await import('../app/storage.js');

const NAMES = ['Marcus', 'Eli', 'Devon', 'Kade', 'Aaron', 'Jack',
               'Leighton', 'Nia', 'Cole', 'Reese', 'Sam'];

function setup({ maxSubs = 3, players = NAMES.length } = {}) {
  const t = S.newTeam('Wildcats', NAMES.slice(0, players).map((name, i) =>
    ({ id: 'p' + i, name, number: String(i + 1), shortName: '', tier: 3, hue: i })));
  t.day.games[0].id = 'g0';
  t.day.games[0].seed = 7;
  t.settings.maxSubs = maxSubs;
  S.state.teams = [t];
  S.state.activeTeam = 0;
  S.computeAll();
  return t;
}

// the most players that change at any one break, which is what the coach's
// number is about
const worstBreak = plan => {
  let worst = 0;
  for (let i = 1; i < plan.stints.length; i++) worst = Math.max(worst, plan.stints[i].in.length);
  return worst;
};

/* ---- the number reaches the solver ---- */

test('a new team starts on the default, so nothing changes for a coach who never opens the page', () => {
  const t = setup();
  assert.equal(S.newTeam('Fresh').settings.maxSubs, 3);
  assert.equal(t.settings.maxSubs, 3);
});

test('lowering the number actually changes the plan the card prints', () => {
  const loose = setup({ maxSubs: 5 });
  const wide = worstBreak(S.plans[0]);
  assert.ok(S.plans[0].ok);

  loose.settings.maxSubs = 1;
  S.computeAll();
  const tight = worstBreak(S.plans[0]);

  assert.ok(S.plans[0].ok, 'the plan still solves');
  assert.ok(tight < wide,
    `the setting must reach generatePlan: ${wide} changed at once at 5, ${tight} at 1`);
});

test('the plan cache does not serve yesterday\'s number', () => {
  /* The cache is keyed on a signature of everything that changes a plan. Leave
     the setting out of it and the coach moves the control, the card does not
     move, and there is nothing on screen to say why -- the same bug tiers and
     balance each had. */
  const t = setup({ maxSubs: 5 });
  const before = S.plans[0].stints.map(r => r.onFloor.join(''));
  t.settings.maxSubs = 1;
  S.computeAll();
  const after = S.plans[0].stints.map(r => r.onFloor.join(''));
  assert.notDeepEqual(after, before);
});

test('the number is the team\'s, not the device\'s', () => {
  const a = S.newTeam('Hawks', NAMES.slice(0, 8).map((name, i) => ({ id: 'a' + i, name, tier: 3, hue: i })));
  const b = S.newTeam('Ravens', NAMES.slice(0, 8).map((name, i) => ({ id: 'b' + i, name, tier: 3, hue: i })));
  a.settings.maxSubs = 5;
  b.settings.maxSubs = 1;
  S.state.teams = [a, b];
  S.state.activeTeam = 0;
  assert.equal(S.state.settings.maxSubs, 5);
  S.state.activeTeam = 1;
  assert.equal(S.state.settings.maxSubs, 1, 'the accessor follows the active team');
  S.state.activeTeam = 0;
  assert.equal(a.settings.maxSubs, 5, 'and one team\'s number never reached the other');
});

/* ---- copy on create, not a cascade ---- */

test('a team created from another copies its settings and is then its own', () => {
  const first = S.newTeam('Hawks');
  first.settings.maxSubs = 5;
  const second = S.newTeam('Ravens', null, first.settings);
  assert.equal(second.settings.maxSubs, 5, 'a second squad in the same league starts where the first is');

  second.settings.maxSubs = 2;
  assert.equal(first.settings.maxSubs, 5,
    'a copy, not an inheritance -- changing one team must never reach the other');
});

test('creating a team from nothing is the defaults, not a crash', () => {
  for (const junk of [undefined, null, {}, 'nope', 42]) {
    assert.equal(S.newTeam('T', null, junk).settings.maxSubs, 3, String(junk));
  }
});

test('adding a team copies from the team the coach was on', () => {
  // the wiring, read rather than run: addTeam is behind a click handler in
  // teams-view.js, and what matters is that it passes the ACTIVE team's block
  const src = readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function addTeam'), src.indexOf('function addTeam') + 900);
  assert.match(fn, /newTeam\('',\s*null,\s*team\(\)\?\.settings\)/,
    'a new team must be created from the active team\'s settings');
});

/* ---- the accessor, and why it must stay non-enumerable ---- */

test('state.settings is a non-enumerable accessor, so no record gains a second copy', () => {
  /* `saveState` and `backupText` both serialise with JSON.stringify, which
     walks own *enumerable* properties. An enumerable getter here would write
     the active team's settings a second time at the top of the record, and on
     the next load the two would disagree -- the same trap `players`, `day` and
     `season` have carried since multi-team. */
  const t = setup({ maxSubs: 4 });

  const d = Object.getOwnPropertyDescriptor(S.state, 'settings');
  assert.ok(d && typeof d.get === 'function', 'settings is an accessor');
  assert.equal(d.enumerable, false);
  assert.ok(!Object.keys(S.state).includes('settings'));

  const written = JSON.parse(JSON.stringify(S.state));
  assert.ok(!('settings' in written), 'the saved record must carry one settings block, on the team');
  assert.equal(written.teams[0].settings.maxSubs, 4);
  assert.equal(S.state.settings, t.settings, 'and reading it still reaches the active team');
});

test('replaceState swaps the record without losing the settings accessor', () => {
  // undo and a restored backup both go through here
  const t = setup({ maxSubs: 5 });
  const snapshot = JSON.parse(JSON.stringify(S.state));
  t.settings.maxSubs = 1;
  assert.equal(S.state.settings.maxSubs, 1);

  S.replaceState(snapshot);
  assert.equal(S.state.settings.maxSubs, 5, 'undo puts the number back');
  assert.ok(!Object.keys(S.state).includes('settings'), 'and the accessor survived the sweep');
});

/* ---- the tie-break stance ---- *
 *
 * The odd stint has to land on somebody. `settings.tieBreak` is the coach's
 * say in who: 'behind' (the default, and what the app has always done
 * silently) hands it to whoever is furthest behind their share of the season,
 * 'levels' hands it to the rotation levels. It is composed in state.js and
 * handed to the engine as a bare priority number, so the engine is not
 * involved in the choice at all.
 *
 * Eleven players on 4x8 with 4-minute stints is the case the whole thing is
 * about: 40 slots for 11 players, so four of them play 16 and seven play 12,
 * and something has to pick the four. */
const uneven = (tiers) => {
  const t = S.newTeam('Wildcats', NAMES.slice(0, 11).map((name, i) =>
    ({ id: 'p' + i, name, number: String(i + 1), shortName: '', tier: tiers ? tiers[i] : 3, hue: i })));
  t.day.games[0].id = 'g0';
  t.day.games[0].seed = 7;
  S.state.teams = [t];
  S.state.activeTeam = 0;
  S.computeAll();
  return t;
};
const shortEnd = () => {
  const m = S.plans[0].minutes;
  const low = Math.min(...Object.values(m));
  return Object.keys(m).filter(id => m[id] === low).sort();
};

test('a new team starts on the season stance, so nothing changes for a coach who never opens the page', () => {
  assert.equal(S.newTeam('Fresh').settings.tieBreak, 'behind');
  assert.equal(uneven().settings.tieBreak, 'behind');
});

test('with no levels set, the two stances are the same plan byte for byte', () => {
  /* The bar a settings page has to clear: a coach who never opens the levels
     fold cannot be hurt by this control. Every player starts on the middle
     level, so under 'levels' every tier is equal and the season still orders
     them -- which is the default stance's own order. */
  const t = uneven();
  const before = JSON.stringify(S.plans[0]);
  t.settings.tieBreak = 'levels';
  S.computeAll();
  assert.equal(JSON.stringify(S.plans[0]), before,
    'a flat roster must solve identically under either stance');
});

test('under the levels stance the stint that has to come off comes off the lower levels', () => {
  /* Eleven on 4x8 is seven players at 16 minutes and four at 12. Five go-to
     players and six developing: the four short ends must all come out of the
     six, because that is what the coach asked the setting for. */
  const strong = new Set(['p0', 'p1', 'p2', 'p3', 'p4']);
  const t = uneven([5, 5, 5, 5, 5, 1, 1, 1, 1, 1, 1]);
  t.settings.tieBreak = 'levels';
  S.computeAll();

  assert.ok(S.plans[0].ok);
  const short = shortEnd();
  assert.equal(short.length, 4);
  assert.ok(short.every(id => !strong.has(id)),
    `no go-to player should be on the short end, got ${short.join(',')}`);
  for (const id of strong) assert.equal(S.plans[0].minutes[id], 16, id);
});

test('the stance is a tie-break and nothing more: a minimum still wins', () => {
  /* The thing that makes this safe to ship. `applyTieBreak` never touches a
     player the coach has spoken for, so a floor on a developing player
     outranks the stance every time. */
  const t = uneven([5, 5, 5, 5, 5, 1, 1, 1, 1, 1, 1]);
  t.settings.tieBreak = 'levels';
  t.day.games[0].constraints.minMinutes = { p10: 16 };
  S.computeAll();

  assert.ok(S.plans[0].ok);
  assert.ok(S.plans[0].minutes.p10 >= 16,
    `a floor the coach set must outrank the stance, got ${S.plans[0].minutes.p10}`);
});

test('the plan cache does not serve the other stance', () => {
  const t = uneven([5, 5, 5, 5, 5, 1, 1, 1, 1, 1, 1]);
  const before = shortEnd();
  t.settings.tieBreak = 'levels';
  S.computeAll();
  assert.notDeepEqual(shortEnd(), before,
    'moving the control must move the card, or there is nothing on screen to say why');
});

test('the stance belongs to the team, and one squad\'s never reaches the other', () => {
  const a = S.newTeam('Hawks');
  const b = S.newTeam('Ravens', null, a.settings);
  a.settings.tieBreak = 'levels';
  assert.equal(b.settings.tieBreak, 'behind', 'a copy, not an inheritance');
  S.state.teams = [a, b];
  S.state.activeTeam = 1;
  assert.equal(S.state.settings.tieBreak, 'behind', 'the accessor follows the active team');
});

test('the roster note stops claiming minutes are level-blind when they are not', () => {
  /* Copy that is false in a state the app can be in is the reason this option
     is opt-in rather than a weight quietly folded into the default. */
  const src = readFileSync(new URL('../app/roster-view.js', import.meta.url), 'utf8');
  assert.match(src, /tieBreak.*===\s*'levels'/s,
    'the level note must branch on the stance');
  assert.match(src, /share of the minutes is worked out without them/,
    'and must still say the true thing under the default');
});

test('the plan says which reason is actually deciding it', () => {
  /* The engine hands back a bare number and is deliberately never told what
     it means, so state.js supplies the reason. A line that names the wrong
     one is worse than no line. */
  const say = () => (S.plans[0].issues.find(i => i.code === 'SPREAD_FLOOR') || {}).message || '';

  const flat = uneven();
  assert.match(say(), /ahead|rotates/, 'the default stance talks about the season or the day');
  assert.doesNotMatch(say(), /rotation levels/);

  flat.settings.tieBreak = 'levels';
  S.computeAll();
  assert.doesNotMatch(say(), /rotation levels/,
    'levels that are all the same decided nothing, so they get no credit');

  const tiered = uneven([5, 5, 5, 5, 5, 1, 1, 1, 1, 1, 1]);
  tiered.settings.tieBreak = 'levels';
  S.computeAll();
  assert.match(say(), /the lower rotation levels/,
    'and where they did separate them, the line says so');
});

/* ---- the league minimum ---- */

/* `settings.minMinutes` is a floor applied to everyone available, composed
   into the per-player `minMinutes` map `engine.js` has always read. The
   engine never learns the setting exists, which is what keeps this an input
   rather than a solver change. */

test('a new team has no league minimum, so nothing changes for a coach who never sets one', () => {
  const t = setup();
  assert.equal(S.newTeam('Fresh').settings.minMinutes, 0);
  const off = { ...S.plans[0].minutes };
  t.settings.minMinutes = 0;
  S.computeAll();
  assert.deepEqual(S.plans[0].minutes, off, 'off must be byte-identical to never having the key');
});

test('a league minimum puts a floor under every available player', () => {
  const t = setup();
  t.settings.minMinutes = 10;
  S.computeAll();
  assert.ok(S.plans[0].ok, S.plans[0].issues.map(i => i.message).join(' | '));
  for (const [id, m] of Object.entries(S.plans[0].minutes)) {
    assert.ok(m >= 10, `${id} played ${m}`);
  }
});

test('a cap the coach set by hand still wins, rather than becoming an error they never asked for', () => {
  const t = setup();
  t.day.games[0].constraints.maxMinutes.p0 = 6;
  t.settings.minMinutes = 12;
  S.computeAll();
  const p = S.plans[0];
  assert.ok(!p.issues.some(i => i.code === 'MIN_ABOVE_CAP'),
    'the league floor must never be raised past a cap the coach set deliberately');
  assert.ok(p.ok, p.issues.map(i => i.message).join(' | '));
  assert.ok(p.minutes.p0 <= 6, `held back to their cap, played ${p.minutes.p0}`);
});

test('a minimum the coach set by hand still wins when it is the higher of the two', () => {
  const t = setup();
  t.day.games[0].constraints.minMinutes.p0 = 20;
  t.settings.minMinutes = 8;
  S.computeAll();
  assert.ok(S.plans[0].minutes.p0 >= 20, `played ${S.plans[0].minutes.p0}`);
});

test('a player who is out is not given a minimum they cannot play', () => {
  const t = setup();
  t.day.games[0].out = ['p0'];
  t.settings.minMinutes = 10;
  S.computeAll();
  assert.ok(S.plans[0].ok, S.plans[0].issues.map(i => i.message).join(' | '));
  assert.ok(!('p0' in S.plans[0].minutes) || S.plans[0].minutes.p0 === 0);
});

test('changing the league minimum re-solves rather than serving the cached plan', () => {
  /* Asserted through an outcome only a re-solve can produce: eleven players
     at 20 minutes each wants 220 floor-minutes out of a 32-minute game's 160,
     and the engine's own arithmetic refuses. If the setting were missing from
     the plan signature the cached plan would come back happy. */
  const t = setup();
  assert.ok(S.plans[0].ok);
  t.settings.minMinutes = 20;
  S.computeAll();
  assert.ok(!S.plans[0].ok, 'the setting has to be in the plan signature or the card never moves');
  assert.ok(S.plans[0].issues.some(i => i.code === 'MINS_UNSATISFIABLE'),
    'and the engine still gets to say the game is not long enough');
});

test('the per-player boundary warning is collapsed, because the league floor sets it on everyone', () => {
  /* One warning per player was right while minimums were set one at a time.
     A league number that is not a whole multiple of the stint fired it for
     every available player -- twelve identical red rows. */
  const src = readFileSync(new URL('../app/plan-view.js', import.meta.url), 'utf8');
  assert.match(src, /MIN_OFF_STINT_BOUNDARY/,
    'renderIssues must collapse the fan-out the league floor creates');
});

/* ---------------- the carryover default (slice 4) ----------------
   It is the first setting that is not a solver input: `newGame` is the only
   thing that reads it, at the moment a game is created. So the tests are
   about creation and about what it must NOT touch, not about minutes. */

test('a new game opens on its own by default, which is what every older record means', () => {
  const t = setup();
  assert.equal(t.settings.seasonDefault, false, 'absent means off');
  assert.equal(S.newGame(1, t.day.games[0], t.settings).useSeasonTargets, false);
  assert.equal(S.newGame(1, t.day.games[0]).useSeasonTargets, false,
    'no settings block at all is still off');
});

test('with the default on, a new game opens already evening out the season', () => {
  const t = setup();
  t.settings.seasonDefault = true;
  assert.equal(S.newGame(1, t.day.games[0], t.settings).useSeasonTargets, true);
});

test('the default never reaches back into a game that already exists', () => {
  const t = setup();
  const g = t.day.games[0];
  assert.equal(g.useSeasonTargets, false);
  t.settings.seasonDefault = true;
  S.computeAll();
  assert.equal(g.useSeasonTargets, false,
    'a default is read at creation; a coach must not find this week’s plan rearranged');
});

test('flipping the default does not re-solve, because no card can move', () => {
  const t = setup();
  const before = JSON.stringify(S.plans[0].stints);
  t.settings.seasonDefault = true;
  S.computeAll();
  assert.equal(JSON.stringify(S.plans[0].stints), before,
    'it must stay out of the plan signature: the per-game switch is already in it');
});

test('a junk carryover default is off rather than a stance the coach never took', () => {
  const at = raw => sanitizeSettings(raw).seasonDefault;
  assert.equal(at({ seasonDefault: true }), true);
  for (const junk of [undefined, null, 1, 'true', 'yes', {}, []]) {
    assert.equal(at({ seasonDefault: junk }), false, String(junk));
  }
});

/* ---------------- the game format default (slice 4) ----------------
   The trap this slice had to design past is the thing worth pinning: the
   format is ALREADY sticky, because `newGame` deep-copies it off the game it
   clones and every "+ Game" and "New day" passes one. So the default must lose
   to the clone -- otherwise a tournament day at an odd format snaps back on
   game 2 -- and must win everywhere there is nothing to clone, which is the
   only place it can help. Both directions are tested. */

test('an older record with no format keys still opens on four eights', () => {
  const s = sanitizeSettings({});
  assert.equal(s.periods, 4);
  assert.equal(s.periodMinutes, 8);
  const g = S.newGame(0);
  assert.equal(g.periods, 4, 'no settings block at all is the literals newGame always had');
  assert.equal(g.periodMinutes, 8);
});

test('a brand new team opens on the format it was given, which is where the app used to guess', () => {
  const t = S.newTeam('Hawks', [], { periods: 2, periodMinutes: 20 });
  assert.equal(t.settings.periods, 2);
  assert.equal(t.day.games[0].periods, 2, 'the opening game is the one thing with nothing to clone');
  assert.equal(t.day.games[0].periodMinutes, 20);
});

test('the clone still wins, so a day played at an odd format stays at it', () => {
  const t = setup();
  const g0 = t.day.games[0];
  Object.assign(g0, { periods: 2, periodMinutes: 20 });
  t.settings.periods = 4; t.settings.periodMinutes = 8;
  const g1 = S.newGame(1, g0, t.settings);
  assert.equal(g1.periods, 2, 'the format a coach set today must carry to game 2');
  assert.equal(g1.periodMinutes, 20);
});

test('the format default never reaches back into a game that already exists', () => {
  const t = setup();
  const g = t.day.games[0];
  assert.equal(g.periods, 4);
  t.settings.periods = 6; t.settings.periodMinutes = 6;
  S.computeAll();
  assert.equal(g.periods, 4, 'a default is read at creation, never after it');
  assert.equal(g.periodMinutes, 8);
});

test('changing the format default does not re-solve, because no card can move', () => {
  const t = setup();
  const before = JSON.stringify(S.plans[0].stints);
  t.settings.periods = 2; t.settings.periodMinutes = 20;
  S.computeAll();
  assert.equal(JSON.stringify(S.plans[0].stints), before,
    'it must stay out of the plan signature: the game’s own periods already are');
});

test('a junk format falls back to the default rather than clamping to a game of one minute', () => {
  const at = raw => sanitizeSettings(raw);
  assert.equal(at({ periods: 2, periodMinutes: 20 }).periods, 2);
  assert.equal(at({ periods: 2, periodMinutes: 20 }).periodMinutes, 20);
  assert.equal(at({ periods: 99 }).periods, 8, 'clamped to the Rules fold’s own max');
  assert.equal(at({ periodMinutes: 99 }).periodMinutes, 40);
  assert.equal(at({ periods: 2.6 }).periods, 3, 'a fraction of a period does not exist');
  for (const junk of [undefined, null, '', 'four', {}, [], NaN]) {
    assert.equal(at({ periods: junk }).periods, 4, String(junk));
    assert.equal(at({ periodMinutes: junk }).periodMinutes, 8, String(junk));
  }
});

test('the format belongs to the team, and one squad’s never reaches the other', () => {
  const a = S.newTeam('A', [], { periods: 2, periodMinutes: 20 });
  const b = S.newTeam('B', [], a.settings);
  b.settings.periods = 4;
  assert.equal(a.settings.periods, 2, 'copy on create, not a cascade');
  assert.equal(b.day.games[0].periods, 2, 'B was created from A’s format, before it was changed');
});

/* ================================================================== *
 * where each zone lives, and in what order
 *
 * A25: the settings surface says of itself, in index.html, that it is
 * legible on first opening because "the first things in it are ones
 * they recognise -- the theme and the help sheet". For most of its life
 * they were the LAST things in it: measured at 390x844, "How this
 * works" opened at y=1459 of a 1938px page, two screens below five rows
 * of league rules a coach may never touch. Backup is last on purpose
 * and for the opposite reason -- it replaces everything on the device.
 *
 * #22 (parent #18) put the per-team rules back ON this page, under the
 * active team's own name, and took the Team tab down to the roster and
 * nothing else. A25's order survives them: Appearance first (S3/K4),
 * then How it works, then Backup last -- the team zone sits ahead of
 * both, because a coach opens Settings under their team, not under
 * Benchcard's own choices.
 * ================================================================== */
/* Comments dropped here, not in a second `visible()` copy further down --
   one clean reading of index.html, not two. A developer note can carry the
   very attribute or word a check is looking for (the paragraph above
   `#themeSeg` names "#themeNow"; the one above the coffee row's `<a>` names
   `data-tip-link` while explaining why it is there), and a check that reads
   raw markup scores the comment instead of the control. `/* *\/` is dropped
   too: index.html's two inline `<script>` blocks carry block comments of
   their own, ahead of `#view-settings`, that this file never has reason to
   read anyway. */
const indexHtml = () => readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
const cutView = (html, id) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</main>', html.indexOf(`id="${id}"`)));
const views = () => {
  const html = indexHtml();
  return { settings: cutView(html, 'view-settings'), roster: cutView(html, 'view-team') };
};

/* stripComments and functionBody moved to js-comments.js, shared with
   view-before-settings.test.js -- see that file for what each one does and
   why. */

test('Settings keeps Appearance above Backup, and Backup keeps the bottom', () => {
  const { settings } = views();
  const appearance = settings.indexOf('id="themeSeg"');
  const help = settings.indexOf('id="helpBtn"');
  const backup = settings.indexOf('class="set-h">Backup and restore<');
  assert.ok(appearance > -1 && help > -1 && backup > -1, 'the settings view lost one of its zones');
  assert.ok(appearance < help,
    'Appearance moved below How it works; S3/K4 puts Appearance first');
  assert.ok(help < backup,
    'the help sheet is back below Backup, on a page a new coach opens for help');
  /* "Keeps the bottom": Backup's heading has to sit inside the LAST box in
     the view, not just somewhere after Appearance -- a box added below it
     would pass the ordering checks above and still bury the one control
     that replaces everything on the device. */
  const lastBoxAt = settings.lastIndexOf('class="side-box"');
  assert.ok(lastBoxAt > -1 && backup > lastBoxAt,
    'Backup is not inside the last box in Settings; something was added below it');
});

test('the per-team settings live in Settings, under the team\'s own name -- not on the Team tab', () => {
  const { settings, roster } = views();
  /* Read out of the app rather than typed here, so a SIXTH per-team control
     wired into `renderSettings` has to land in Settings too -- a list of
     today's ids would pass a new one straight through. `renderSettings`
     is the right seam: it is the one function that paints per-team policy, and
     every id it reaches is by definition a control that belongs to the team. */
  const tv = readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8');
  const body = tv.slice(tv.indexOf('export function renderSettings() {'), tv.indexOf('\nfunction addTeam()'));
  assert.ok(body.length > 200, 'renderSettings moved or was renamed; this guard is reading nothing');
  /* Four forms an id can reach the DOM through -- `$('#x')`, `['#x'...`
     (a lookup table keyed by selector), `document.getElementById('x')` and
     `document.querySelector('#x')` -- so a control painted through the
     unabbreviated DOM calls is caught exactly like one painted through the
     app's own `$` helper. */
  const idRe = /\$\('#(\w+)'\)|\['#(\w+)'|getElementById\(\s*['"](\w+)['"]\s*\)|querySelector\(\s*['"]#(\w+)['"]\s*\)/g;
  const perTeam = [...new Set([...body.matchAll(idRe)].map((m) => m[1] || m[2] || m[3] || m[4]))];
  assert.ok(perTeam.length >= 7, `renderSettings should paint at least seven controls, found ${perTeam.length}`);
  const benchcardAt = settings.indexOf('class="side-hd">Benchcard<');
  assert.ok(benchcardAt > -1, 'the Benchcard heading is gone from Settings');
  for (const id of perTeam) {
    assert.ok(!roster.includes(`id="${id}"`), `#${id} is back on the Team tab; per-team policy belongs in Settings now`);
    const at = settings.indexOf(`id="${id}"`);
    assert.ok(at > -1, `#${id} is missing from Settings`);
    assert.ok(at < benchcardAt,
      `#${id} sits inside the Benchcard zone; per-team policy belongs in the team zone above it`);
  }
  // #addTeam's own guard, whole-document, is test/team-strip.test.js's; this
  // one stays scoped to what renderSettings paints.
});

/* ================================================================== *
 * #22 proof items 1, 2 and 5: the theme cycler is gone, Appearance is the
 * three named buttons the spec calls for, the Benchcard zone carries the
 * whole order through Backup, the team zone opens on the name and closes on
 * Remove this team, and addTeam() lands a coach in Settings rather than on
 * the Team tab it used to.
 *
 * `views()` reads through `indexHtml()`, which now strips comments itself
 * (see its own comment above), so it is safe for a "the word Theme is gone"
 * check too -- the comment that used to sit above `#themeSeg`, explaining
 * what it replaced in words including "#themeNow", no longer survives into
 * `settings` for this test to trip over. There used to be a second,
 * separately-stripped `visible()` reading the same file for this reason
 * alone; one clean reading is the point.
 * ================================================================== */

test('the theme cycler is gone: no "Theme" text, no #theme or #themeNow control in Settings', () => {
  const { settings } = views();
  assert.doesNotMatch(settings, /\bTheme\b/,
    'a stray "Theme" label would resurrect the ambiguity Appearance replaced');
  assert.ok(!settings.includes('id="theme"'), 'the #theme cycler must be gone');
  assert.ok(!settings.includes('id="themeNow"'), 'the #themeNow read-back must be gone');
});

test('Appearance is exactly Automatic, Light, Dark, in that order, mapped to auto/light/dark', () => {
  const { settings } = views();
  const at = settings.indexOf('id="themeSeg"');
  assert.ok(at > -1, '#themeSeg is missing from Settings');
  const block = settings.slice(at, settings.indexOf('</div>', at));
  const buttons = [...block.matchAll(/data-theme="(\w+)"[^>]*>([^<]+)</g)]
    .map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(buttons, [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']],
    'Appearance must offer exactly these three choices, in this order, mapped to these three values');
});

test('Benchcard order: Appearance, How it works (with Show me around again), About, Contact, Buy me a coffee, Backup last', () => {
  const { settings } = views();
  const marks = {
    Appearance: settings.indexOf('id="themeSeg"'),
    'How it works': settings.indexOf('id="helpBtn"'),
    'Show me around again': settings.indexOf('id="helpTourSettings"'),
    About: settings.indexOf('>About<'),
    Contact: settings.indexOf('mailto:hello@benchcard.app'),
    'Buy me a coffee': settings.indexOf('>Buy me a coffee<'),
    Backup: settings.indexOf('class="set-h">Backup and restore<'),
  };
  for (const [name, at] of Object.entries(marks)) {
    assert.ok(at > -1, `${name} is missing from Settings`);
  }
  const order = Object.keys(marks);
  for (let i = 1; i < order.length; i++) {
    assert.ok(marks[order[i - 1]] < marks[order[i]],
      `${order[i - 1]} must come before ${order[i]} in Settings`);
  }
  // "Show me around again" belongs in the How it works row, not a row of its
  // own further down -- no setrow boundary between the two buttons.
  const helpRow = settings.slice(marks['How it works'], marks['Show me around again'] + 1);
  assert.equal((helpRow.match(/class="setrow"/g) || []).length, 0,
    'Show me around again must sit in the same row as How it works, not a new one');
  const lastBoxAt = settings.lastIndexOf('class="side-box"');
  assert.ok(marks.Backup > lastBoxAt, 'Backup is not inside the last box in Settings');
});

test('nothing sits after Backup\'s own controls inside #view-settings', () => {
  /* "Keeps the bottom" above only checked that Backup's HEADING is in the
     last box -- a control added inside that same box, after Backup's own
     content, would still pass it. Pin the actual floor: the last of Backup's
     own controls (#exportBackup, #importBackup, #backupFile, the paste box's
     .paste-go) is the last control in the view, full stop. */
  const { settings } = views();
  const markers = ['id="exportBackup"', 'id="importBackup"', 'id="backupFile"', 'paste-go'];
  const lastMarkerAt = Math.max(...markers.map((m) => settings.lastIndexOf(m)));
  assert.ok(lastMarkerAt > -1, 'lost track of Backup\'s own controls');
  const tagEnd = settings.indexOf('>', lastMarkerAt);
  assert.ok(tagEnd > -1);
  const after = settings.slice(tagEnd + 1);
  const control = /<(button|a|input|select|textarea)\b|role="group"/i;
  const found = after.match(control);
  assert.equal(found, null,
    `a control (${found && found[0]}) sits after Backup's own controls in #view-settings`);
});

test('Settings link rows: About, Contact and Buy me a coffee labels are pinned to their own row', () => {
  /* Ordering alone does not catch a swap: two labels changing rows while the
     rows themselves keep their place passes every position check above. Pin
     each label to the marker that names what the row IS, not where it sits
     -- the mailto: address is Contact by definition, the [data-tip-link]
     anchor is the tip jar by definition, and ./about is About by
     definition. */
  const { settings } = views();
  const rowText = (marker) => {
    const at = settings.indexOf(marker);
    assert.ok(at > -1, `${marker} is missing from Settings`);
    const rowStart = settings.lastIndexOf('<a class="setrow linkrow"', at);
    const rowEnd = settings.indexOf('</a>', at);
    assert.ok(rowStart > -1 && rowEnd > -1, `could not find the link row around ${marker}`);
    return settings.slice(rowStart, rowEnd);
  };
  assert.match(rowText('href="./about"'), /<span class="setrow-t">About<\/span>/,
    'the ./about row must read "About"');
  assert.match(rowText('href="mailto:hello@benchcard.app"'), /<span class="setrow-t">Contact<\/span>/,
    'the mailto: row must read "Contact"');
  assert.match(rowText('data-tip-link'), /<span class="setrow-t">Buy me a coffee<\/span>/,
    'the [data-tip-link] row must read "Buy me a coffee"');
});

test('Team section order: Team name first, Remove this team last, both inside the team zone', () => {
  const { settings } = views();
  const boxHd = settings.indexOf('id="setTeamHd"');
  const teamName = settings.indexOf('id="teamName"');
  const removeTeam = settings.indexOf('id="removeTeam"');
  const benchcard = settings.indexOf('class="side-hd">Benchcard<');
  assert.ok(boxHd > -1 && teamName > -1 && removeTeam > -1 && benchcard > -1,
    'the team zone lost one of its landmarks');
  assert.ok(boxHd < teamName, 'the team heading must sit above the Team name row');
  assert.ok(teamName < removeTeam,
    'Team name must be the first row in the team zone, ahead of every other per-team control');
  assert.ok(removeTeam < benchcard, 'Remove this team must stay inside the team zone, above Benchcard');
  const idsAfterRemove = [...settings.slice(removeTeam + 1, benchcard).matchAll(/\sid="(\w+)"/g)]
    .map((m) => m[1]);
  assert.deepEqual(idsAfterRemove, [],
    `nothing should follow Remove this team in the team zone, found ${idsAfterRemove}`);
});

test('the Settings tip link is wired from TIP_URL, not a URL written into markup', () => {
  const html = indexHtml();
  assert.ok(!/buymeacoffee/i.test(html),
    'index.html must not carry the tip URL by hand -- toast.js is the one place that reads TIP_URL');
  const { settings } = views();
  assert.ok(settings.includes('data-tip-link'),
    'the Settings coffee row must carry [data-tip-link] so toast.js finds it');
  assert.ok(!settings.includes('id="tipLink"'),
    '#tipLink is already spoken for by the footer -- the Settings row must not reuse it');
  const toast = readFileSync(new URL('../app/toast.js', import.meta.url), 'utf8');
  assert.match(toast, /querySelectorAll\(\s*['"]\[data-tip-link\]['"]\s*\)/,
    'toast.js must wire every [data-tip-link] element from TIP_URL, covering the new Settings row');
  /* Present in the file is not the same as running: the loop has to sit in
     initToast's OWN body, not inside a second function nested inside it that
     initToast never calls -- the regex above would still match either way. */
  const body = functionBody(stripComments(toast), 'initToast');
  assert.match(body, /querySelectorAll\(\s*['"]\[data-tip-link\]['"]\s*\)/,
    'the [data-tip-link] loop must run in initToast\'s own body');
  assert.doesNotMatch(body, /\bfunction\b/,
    'initToast declares no nested function today -- one appearing here means the loop moved into ' +
    'a function initToast may never call');
});

test('the Settings tour button calls exactly what #helpTour calls, not a second way to start the tour', () => {
  const src = stripComments(readFileSync(new URL('../app/shortcuts.js', import.meta.url), 'utf8'));
  const helpTour = src.match(/on\(\s*['"]#helpTour['"]\s*,\s*['"]onclick['"]\s*,\s*(\w+)\s*\)/);
  const settingsTour = src.match(/on\(\s*['"]#helpTourSettings['"]\s*,\s*['"]onclick['"]\s*,\s*(\w+)\s*\)/);
  assert.ok(helpTour, '#helpTour must still be wired');
  assert.ok(settingsTour,
    '#helpTourSettings must be wired, in real code -- a commented-out line would still be in the file');
  assert.equal(settingsTour[1], helpTour[1],
    'the Settings button must name the same handler #helpTour does');
});

test('adding a team opens Settings, not the Team tab, and focuses the name field', () => {
  const src = stripComments(readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8'));
  const start = src.indexOf('function addTeam');
  const body = src.slice(start, src.indexOf('\nfunction removeTeam', start));
  assert.ok(body.length > 100, 'addTeam moved or was renamed; this guard is reading nothing');
  assert.match(body, /setView\(\s*['"]settings['"]\s*\)/,
    'addTeam must land the coach on Settings, where the new team\'s name field now lives');
  assert.doesNotMatch(body, /setView\(\s*['"]team['"]\s*\)/,
    'addTeam must not still send the coach to the Team tab');
  /* A setView("settings") gated on state.view is only right one way round:
     `!== 'settings'` skips the (no-op) call when already there; `===
     'settings'` is backwards -- it only ever navigates when the coach is
     already on the page it is supposed to land them on, i.e. never from
     anywhere else. Unconditional is fine too, so only the backwards gate is
     refused. */
  const gated = body.match(/if\s*\(\s*state\.view\s*(===|!==)\s*['"]settings['"]\s*\)\s*setView\(\s*['"]settings['"]\s*\)/);
  if (gated) {
    assert.equal(gated[1], '!==',
      'a setView("settings") gated on state.view must use !== -- an === gate only navigates when ' +
      'already on Settings, which never fires from anywhere a coach would actually be');
  }
  // order: the view has to be live before a field inside it can take focus --
  // focusing into a still-hidden subtree is a no-op, not a deferred focus.
  const viewAt = body.search(/setView\(\s*['"]settings['"]\s*\)/);
  const focusAt = body.search(/\.focus\(\)/);
  assert.ok(viewAt > -1 && focusAt > -1, 'addTeam must both switch to Settings and focus something');
  assert.ok(viewAt < focusAt,
    'setView("settings") must run before .focus() -- focusing into a still-hidden view is a no-op');
  /* Not just "#teamName appears somewhere in the body": the element that
     is actually focused and selected has to be the one read from #teamName,
     word for word -- `$('#teamName') && $('#dayName')` still matches a bare
     "reaches #teamName" check while focusing a different field entirely. */
  const decl = body.match(/const\s+(\w+)\s*=\s*(\$\(\s*['"]#teamName['"]\s*\))\s*;/);
  assert.ok(decl,
    'addTeam must declare a variable as exactly $(\'#teamName\'), with nothing else on the right-hand side');
  const name = decl[1];
  assert.match(body, new RegExp(`\\b${name}\\.focus\\(\\)`),
    `addTeam must focus the element read from #teamName (variable "${name}")`);
  assert.match(body, new RegExp(`\\b${name}\\.select\\(\\)`),
    `addTeam must select the element read from #teamName (variable "${name}")`);
});
