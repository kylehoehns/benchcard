/* A35 slice 1: the sample team.
 *
 * Two claims are load-bearing and neither is obvious from reading the app.
 *
 * 1. THERE IS ONE FICTIONAL CAST. `#welRoster`'s placeholder wrote the first
 *    three names; `roster.js` continues them. A second cast appearing beside
 *    the first is the drift this pins.
 * 2. A SAMPLE LOAD COUNTS NOTHING. `first_run_complete{roster}` is the only
 *    roster-size signal the app has and the six landing pages are built on
 *    that distribution, so a sample firing it would make the data measure the
 *    app's own suggestion. The deferral is proven in a browser; what is pinned
 *    here is the shape it depends on, each scoped to the function that owns
 *    it rather than to a window of source -- a window reaches into the
 *    neighbours and scores them instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sampleRoster, SAMPLE_TEAM_NAME, duplicateNumbers, callNames, parseRoster } from '../app/roster.js';

const app = (f) => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');

/* The body of one named function, from its own `function` line to the closing
   brace in column 0. Not a byte window: a window of source is not a scope. */
function body(src, decl) {
  const from = src.indexOf(decl);
  assert.ok(from > 0, `${decl} is gone`);
  const end = src.indexOf('\n}\n', from);
  assert.ok(end > from, `${decl} has no closing brace in column 0`);
  return src.slice(from, end);
}

test('the sample is a real roster of the size asked for', () => {
  assert.equal(sampleRoster().length, 10, 'the default sample is ten players');
  assert.equal(sampleRoster(7).length, 7);
  assert.equal(sampleRoster('9').length, 9, 'a ?try= value arrives as a string');
  assert.equal(sampleRoster(2).length, 5, 'below five there is no lineup to field');
  assert.equal(sampleRoster(99).length, 12, 'clamped to the cast that exists');
  assert.equal(sampleRoster('nonsense').length, 10, 'garbage falls back to the default');
  for (const p of sampleRoster(12)) {
    assert.ok(p.name && p.number, 'every sample player has a name and a number');
    assert.deepEqual(Object.keys(p).sort(), ['name', 'number'],
      'the sample carries nothing but a name and a number -- a level here would reach every artefact test/leak.test.js guards');
  }
});

test('nothing in the sample looks like a bug a coach would report', () => {
  const players = sampleRoster(12).map((p, i) => ({ id: `p${i}`, ...p }));
  assert.deepEqual(duplicateNumbers(players), [],
    'two sample players share a jersey number, which raises the duplicate warning on first run');
  const names = Object.values(callNames(players));
  assert.equal(new Set(names).size, names.length, 'two sample players resolve to the same on-court name');
  const shorts = players.map((p) => p.name.slice(0, 4).toUpperCase());
  assert.equal(new Set(shorts).size, shorts.length, 'two sample players collide in four characters, which is what the card prints');
});

test('there is one fictional cast, not two', () => {
  // #36 replaced the welcome pane's own roster box (`#welRoster`, static
  // markup with a `placeholder="..."` attribute) with step 1 of the
  // first-run flow: `#frRoster` is a textarea `stepTeam` builds at runtime,
  // so its placeholder is a string literal in onboarding.js now, not an
  // attribute in index.html.
  const step = body(app('onboarding.js'), 'function stepTeam(');
  const ph = step.match(/frField\('textarea', 'Your players, one per line', fr\.roster,\s*\n?\s*'([^']*)'/)?.[1];
  assert.ok(ph, '#frRoster has no placeholder to share a cast with');
  const placeholder = parseRoster(ph.replace(/\\n/g, '\n')).map((p) => p.name);
  assert.equal(placeholder.length, 3, 'the placeholder cast changed shape');
  assert.deepEqual(sampleRoster(5).slice(0, 3).map((p) => p.name), placeholder,
    'the sample no longer opens with the placeholder names -- that is a second invented cast, which the item forbids');
});

test('the sample team is named so it cannot be mistaken for the coach own team', () => {
  assert.match(SAMPLE_TEAM_NAME, /sample/i, 'a plausible club name here is a fake team a coach could mistake for theirs');
});

/* This test pinned A47/A49/A52's shape: a landing pane and a setup pane,
   `hidden`-swapped by `pane()`, reached and left by `#welType`/`#welBack`.
   #36 deletes that shape outright -- "Set up my team" and "Try a sample
   team" both open `#firstRunFlow`, a `<dialog>` sibling to `#addGameFlow`
   (see `test/anim-fill.test.js`'s own retirement note on the sibling case
   this same rewrite hit) -- so there is no second pane, no `pane()`, no
   `#welType`/`#welBack`/`#welSetup` left to pin. The one-tap-of-a-real-button
   claim this test carried forward from A47 still holds: `#welStart`/`#welTry`
   are plain `<button>`s and `test/first-run.test.js`'s own shell-markup test
   already checks `#firstRunFlow` ships closed (no `open` attribute) and sits
   outside every `.view`, which is the "one screen at a time" half of A52 in
   the shape this app now has. */

test('filling the form creates nothing, and it is offered inside the form', () => {
  const onb = app('onboarding.js');
  const fill = body(onb, 'function fillSample(');
  assert.match(fill, /sampleRosterText\(/, 'the fill no longer writes the sample text into the box');
  assert.match(fill, /SAMPLE_TEAM_NAME/, 'the team name field is not filled');
  for (const forbidden of ['startTeam(', 'setView(', 'flash(', 'track(', 'markFirstRunPending(']) {
    assert.ok(!fill.includes(forbidden),
      `fillSample calls ${forbidden} -- filling a form must create nothing, count nothing and go nowhere (A49)`);
  }
  // #36 moved the fill button from the old `#welCard` region (wired
  // separately in initOnboarding) into step 1 itself: `stepTeam` builds it
  // right beside the roster box it fills, which is the same "offered inside
  // the form" claim A51 made, now true of the box that still exists.
  const step = body(onb, 'function stepTeam(');
  assert.match(step, /id = 'frFill'/, 'the fill button is gone from step 1');
  assert.match(step, /fill\.onclick = \(\) => \{ fillSample\(\); paintFr\(\); \}/,
    'nothing in step 1 offers the fill any more -- A49 built it for the coach who wants to edit a sample');
});

/* BOTH DOORS OPEN THE SAME FLOW (#36 decision 7), and the sample one arrives
   with the draft already filled. That is A49's `fillSample` again: A51
   pointed this button at `loadSample` because a sample that answered "what
   does this make?" with a second helping of the form was the whole
   complaint, and the stage on the landing screen answers that question now --
   the plan, the card and bench mode, before a coach taps anything.

   The ?try= deep link keeps its own function and its own behavior: somebody
   who clicked "try it with nine players" on a chart page asked to see the
   card, not a form. */
test('both doors open the flow, and the sample one fills the draft on the way', () => {
  const init = body(app('onboarding.js'), 'export function initOnboarding(');
  assert.match(init, /on\('#welStart', 'onclick', \(\) => openFirstRun\(\$\('#welStart'\), false\)\)/,
    'the typing door no longer opens the flow empty');
  assert.match(init, /on\('#welTry', 'onclick', \(\) => openFirstRun\(\$\('#welTry'\), true\)\)/,
    'the sample door no longer opens the flow with the draft filled');
  assert.match(init, /loadSample\(want\)/,
    'the ?try= deep link no longer builds the team and shows the card');
  assert.ok(!/on\('#welTry'[^\n]*loadSample/.test(init),
    'the hero button calls loadSample directly again -- ?try= is the only path that should');
});

test('loading the sample counts nothing, and the first edit counts instead', () => {
  const onb = body(app('onboarding.js'), 'function loadSample(');
  assert.ok(!/\btrack\(/.test(onb),
    'loadSample fires an event: a sample would then measure the app own suggestion (A35 DECISION 1)');
  assert.match(onb, /markFirstRunPending\(\)/,
    'nothing defers first_run_complete, so a sample coach is never counted at all');

  const soon = body(app('render.js'), 'export function soon(');
  assert.match(soon, /takeFirstRunPending\(\)/,
    'the deferred count has no reader on the edit path');
  assert.match(soon, /track\('first_run_complete', \{ roster: bucketRoster\(state\.players\.length\) \}\)/,
    'the deferred count must send the size AT THE MOMENT OF THE EDIT, not the size we suggested');

  // #36 replaced `finishOnboarding` with `commitFirstRun`, which runs on
  // Next from step 2 rather than on a form submit -- same two claims either
  // way: a typed roster is counted immediately, and an untouched sample
  // (`fr.filled` still equal to `fr.roster`) defers instead.
  const commit = body(app('onboarding.js'), 'function commitFirstRun(');
  assert.match(commit, /track\('first_run_complete'/,
    'a typed roster must still be counted immediately -- only the sample waits');

  /* A49 opened a second way for our own suggestion to be counted: fill the
     draft from the sample, tap Next without touching it, and the typed-roster
     path above would fire `first_run_complete{roster:10}` for a roster the
     app itself wrote. So the submitted text is compared against what the
     fill wrote, and an untouched sample defers exactly as `?try=` does. */
  assert.match(commit, /fr\.filled !== null && fr\.roster === fr\.filled/,
    'commitFirstRun no longer knows whether it is submitting our own sample untouched');
  assert.match(commit, /markFirstRunPending\(\)/,
    'an untouched sample submitted through the flow is counted immediately, which measures our own suggestion (A35 DECISION 1)');
  const fill = body(app('onboarding.js'), 'function fillSample(');
  assert.match(fill, /fr\.filled = fr\.roster/, 'the fill records nothing for commitFirstRun to compare against');
});

/* A38: the toast that tells a new coach how to undo the sample named "Teams",
   and there is no Teams tab. The mechanism was verified when it shipped; the
   SENTENCE was not. A destination in copy is checkable, so it is checked --
   scoped to the flash call's own string literal, because a window of source
   reaches into its neighbours and scores them instead.

   #23 removed the tab bar this test used to read a label -> view map out of;
   there is no `#viewnav` any more, and `#removeTeam` is reached one way now
   -- the gear on Today, named "Settings" -- so that is the one destination
   this sentence is allowed to name, and it is checked against the gear's own
   aria-label and against `#removeTeam`'s real home rather than assumed. */
const flashString = (src) => {
  const at = src.indexOf('flash(');
  assert.ok(at > 0, 'loadSample no longer flashes anything -- the removal copy is gone');
  const lit = /^flash\('((?:[^'\\]|\\.)*)'\)/.exec(src.slice(at));
  assert.ok(lit, 'the flash argument is no longer a single-quoted literal this can read');
  return lit[1];
};

test('the sample toast names a destination the app actually has', () => {
  const html = app('index.html');
  const cog = html.match(/id="settingsBtn"[^>]*aria-label="([^"]*)"/);
  assert.ok(cog, '#settingsBtn has no aria-label to read a destination name from');

  const msg = flashString(body(app('onboarding.js'), 'function loadSample('));
  const named = [...msg.matchAll(/\b(?:in|on|under|from) (?:the )?([A-Z][A-Za-z]+)/g)].map((m) => m[1]);
  assert.ok(named.length, `"${msg}" points a first-time coach nowhere -- naming where to undo the sample is the whole job of this line`);
  for (const d of named) {
    assert.equal(d, cog[1],
      `the sample toast sends a coach to "${d}", which is not a destination this app offers (${cog[1]})`);
  }

  /* And the right one of them: `#removeTeam` has to actually live on the
     screen the gear opens, or the toast points a coach at a real word for
     the wrong place. */
  const settings = html.slice(html.indexOf('id="view-settings"'));
  assert.ok(settings.includes('id="removeTeam"'),
    `#removeTeam is not inside #view-settings, and the toast sends the coach to ${named.join(', ')}`);
});

test('a ?try= link cannot overwrite a roster, and does not survive the load', () => {
  const init = body(app('onboarding.js'), 'export function initOnboarding(');
  assert.match(init, /new URLSearchParams\(location\.search\)\.get\('try'\)/, 'the deep link is gone');
  assert.match(init, /!state\.onboarded/,
    'a ?try= link that is read while a team exists can replace a real roster with a sample');
  assert.match(init, /history\.replaceState\(/,
    'the param must be stripped, or a reload or a bookmark carries it');
});

test('every roster-size landing page links into the app with its own size', () => {
  for (const n of [7, 8, 9, 10, 11, 12]) {
    const page = app(`${n}-player-basketball-rotation-chart.html`);
    assert.ok(page.includes(`href="./?try=${n}"`), `the ${n}-player page does not offer a ${n}-player sample`);
    assert.ok(!/href="\.\/\?try=[^"]*(name|team|player=)/i.test(page),
      'a ?try= link carries a size and nothing else -- it is not a URL share');
  }
});
