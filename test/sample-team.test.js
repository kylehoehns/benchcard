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
  const ph = app('index.html').match(/id="welRoster"[^>]*placeholder="([^"]*)"/)?.[1];
  assert.ok(ph, '#welRoster has no placeholder to share a cast with');
  const placeholder = parseRoster(ph.replace(/&#10;/g, '\n')).map((p) => p.name);
  assert.equal(placeholder.length, 3, 'the placeholder cast changed shape');
  assert.deepEqual(sampleRoster(5).slice(0, 3).map((p) => p.name), placeholder,
    'the sample no longer opens with the placeholder names -- that is a second invented cast, which the item forbids');
});

test('the sample team is named so it cannot be mistaken for the coach own team', () => {
  assert.match(SAMPLE_TEAM_NAME, /sample/i, 'a plausible club name here is a fake team a coach could mistake for theirs');
});

/* A49 removed a `<details>` disclosure from this screen. A52 put the roster
   form behind a tap again, and this test is the record of WHICH HALF of A49
   survives that, because the two halves were never the same claim.

   THE HALF THAT DID NOT SURVIVE was the no-script argument: a `<summary>`
   opens with no JavaScript running, so the form could not be lost to a dead
   module graph. A49 checked it and it was worth nothing -- there is no
   `<form>`, no `type="submit"` and no submit listener anywhere in `app/`, so
   `#welGo` is a JS onclick and this screen has needed the module graph since
   it was written. A hidden form costs a dead graph exactly nothing extra.

   THE HALF THAT SURVIVES, and is pinned below, is A47's: a control iOS does
   not recognize as interactive is a bad bet, whatever the markup says. Six
   rounds went into a two-tap bug on the one button-styled `<summary>` in the
   app. So the reveal is a plain `<button>`, it is one tap, and `<details>` and
   `<summary>` are still banned from this screen.

   The form ships `hidden` and `#welType` is the only thing that opens it, so
   that is now asserted rather than forbidden -- a reveal that no longer exists
   would leave a screen with no way to type a roster at all. */
test('setup is a second pane, reached and left by one tap of a real button', () => {
  const html = app('index.html');
  const welcome = html.slice(html.indexOf('id="view-welcome"'), html.indexOf('id="view-team"'))
    // comments out: this screen's comments TALK about the disclosure that was
    // removed, and a guard that reads prose is measuring the wrong thing
    .replace(/<!--[\s\S]*?-->/g, ' ');
  assert.ok(welcome.includes('id="welRoster"'), 'the welcome screen did not parse');
  assert.ok(!/<details|<summary/.test(welcome),
    'the roster form is behind a disclosure again -- A47 is the bug that lived on one');
  /* Two panes, and the setup one ships closed. Both halves matter: a landing
     pane that never hides leaves the coach looking at two screens at once, and
     a setup pane that ships open is not a landing screen at all. */
  assert.match(welcome, /id="welSetup"[^>]*\bhidden\b/,
    'the setup pane no longer ships closed, so the first screen is not one screen (A52)');
  assert.ok(!/id="welLanding"[^>]*\bhidden\b/.test(welcome),
    'the landing pane ships hidden, so a coach arrives on the setup form');
  /* The two ways between them are plain buttons -- never a <summary>, which is
     the one lesson that survives A47 -- and the opener names where it goes. */
  const opener = welcome.match(/<button[^>]*id="welType"[^>]*>/);
  assert.ok(opener, '#welType is gone, so nothing reaches the setup pane');
  assert.match(opener[0], /aria-controls="welSetup"/, '#welType does not say what it opens');
  assert.ok(/<button[^>]*id="welBack"/.test(welcome),
    'nothing leads back out of setup, so the landing screen is a one-way door');

  /* Comments out, the same reason they come out of the markup above: this
     module's comments TALK about the disclosure and about `<summary>`, and a
     guard that reads prose is scoring the explanation instead of the code. */
  const onb = app('onboarding.js')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');
  assert.ok(!/<summary|createElement\(\s*['"]summary/.test(onb),
    'onboarding.js builds a summary for this screen');
  /* ONE function moves between the panes. Two would be two places to forget to
     hide the other one, which is the whole failure mode here. */
  const swaps = [...onb.matchAll(/#welLanding|#welSetup\b/g)].length;
  assert.equal(swaps, 2,
    `${swaps} references to the two panes in onboarding.js; one swapper touches each once`);
  assert.match(onb, /on\('#welType', 'onclick', \(\) => pane\(true\)\)/,
    'nothing takes the coach to setup');
  assert.match(onb, /on\('#welBack', 'onclick', \(\) => pane\(false\)\)/,
    'nothing brings the coach back');
});

test('filling the form creates nothing, and it is offered inside the form', () => {
  const onb = app('onboarding.js');
  const fill = body(onb, 'function fillSample(');
  assert.match(fill, /sampleRosterText\(/, 'the fill no longer writes the sample text into the box');
  assert.match(fill, /SAMPLE_TEAM_NAME/, 'the team name field is not filled');
  for (const forbidden of ['startTeam(', 'setView(', 'flash(', 'track(', 'markFirstRunPending(']) {
    assert.ok(!fill.includes(forbidden),
      `fillSample calls ${forbidden} -- filling a form must create nothing, count nothing and go nowhere (A49)`);
  }
  const init = body(onb, 'export function initOnboarding(');
  assert.match(init, /on\('#welFill', 'onclick', \(\) => fillSample\(\)\)/,
    'nothing offers the fill any more -- A49 built it for the coach who wants to edit a sample');
  const html = app('index.html');
  const card = html.slice(html.indexOf('class="wel-card"'), html.indexOf('id="welGo"'));
  assert.ok(card.includes('id="welFill"'),
    'the fill is offered outside the box it fills, which is what A51 moved it out of');
});

/* THE TWO DOORS BOTH LAND ON SETUP (A52), and the sample one arrives with the
   roster already in the box. That is A49's `fillSample` again: A51 pointed this
   button at `loadSample` because a sample that answered "what does this make?"
   with a second helping of the form was the whole complaint, and the stage on
   the landing screen answers that question now -- the plan, the card and bench
   mode, before a coach taps anything.

   What must not drift is the counting. `first_run_complete` is the only
   roster-size signal the app has and the six chart pages are built on that
   distribution, so a sample the app itself suggested must never fire it. Both
   halves of that are pinned: the fill records what it wrote, and
   `finishOnboarding` defers when the box comes back unchanged. */
test('both doors land on setup, and the sample one fills the box on the way', () => {
  const init = body(app('onboarding.js'), 'export function initOnboarding(');
  assert.match(init, /on\('#welTry', 'onclick', \(\) => \{ pane\(true\); fillSample\(\); \}\)/,
    'the sample door no longer opens setup with the roster in it');
  assert.match(init, /on\('#welType', 'onclick', \(\) => pane\(true\)\)/,
    'the typing door no longer opens setup');
  /* The deep link keeps the OTHER behavior and the other function: somebody
     who clicked "try it with nine players" on a chart page asked to see the
     card, not a form. */
  assert.match(init, /loadSample\(want\)/,
    'the ?try= deep link no longer builds the team and shows the card');
  assert.ok(!/on\('#welTry'[^\n]*loadSample/.test(init),
    'the hero button jumps past setup again -- ?try= is the only path that should');
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

  const fin = body(app('onboarding.js'), 'function finishOnboarding(');
  assert.match(fin, /track\('first_run_complete'/,
    'a typed roster must still be counted immediately -- only the sample waits');

  /* A49 opened a second way for our own suggestion to be counted: fill the
     form from the sample, tap "Build my first card" without touching it, and
     the typed-roster path above would fire `first_run_complete{roster:10}` for
     a roster the app itself wrote. So the submitted text is compared against
     what the fill wrote, and an untouched sample defers exactly as `?try=`
     does. */
  assert.match(fin, /filledText/,
    'finishOnboarding no longer knows whether it is submitting our own sample untouched');
  assert.match(fin, /markFirstRunPending\(\)/,
    'an untouched sample submitted through the form is counted immediately, which measures our own suggestion (A35 DECISION 1)');
  const fill = body(app('onboarding.js'), 'function fillSample(');
  assert.match(fill, /filledText = /, 'the fill records nothing for finishOnboarding to compare against');
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
