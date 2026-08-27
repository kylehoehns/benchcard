import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ANALYTICS, EVENTS, payload, bucketRoster, track, startAnalytics, errorWhere } from '../app/analytics.js';

/* These tests exist for one reason: the promise on the welcome screen says a
   roster never leaves the device, and `payload` is the only thing standing
   between a call site and a request. Treat a failure here as a privacy bug. */

test('the config carries a token and an endpoint, and nothing else', () => {
  // This began as "must be null", which stopped being true the day the token
  // arrived. What actually matters is not that analytics is off — it is that
  // the config cannot smuggle anything else in, and that a missing field
  // degrades to silence rather than to a broken request.
  if (ANALYTICS === null) return;
  assert.deepEqual(Object.keys(ANALYTICS).sort(), ['endpoint', 'token']);
  if (ANALYTICS.token !== null) {
    assert.match(ANALYTICS.token, /^[0-9a-f]{16,64}$/,
      'a beacon token is hex; anything else suggests a pasted snippet or a secret');
  }
});

test('a missing endpoint means events go nowhere, quietly', () => {
  // The beacon and the event endpoint are independent switches: having one
  // must never imply the other, or turning on pageviews would silently start
  // sending product events to an endpoint that does not exist.
  if (ANALYTICS && ANALYTICS.endpoint) return;
  assert.equal(track('game_mode_opened'), false);
  assert.equal(track('plan_generated', { strategy: 'closers' }), false);
});

test('the beacon does not load without a document', () => {
  assert.equal(typeof document === 'undefined' ? startAnalytics() : false, false);
});

/* Deliberately a list and not a count. Adding an event should require editing
   this line, so that "what does Benchcard send" is answerable by reading one
   assertion rather than auditing every call site. */
test('carries exactly the events we have agreed to send', () => {
  assert.deepEqual(Object.keys(EVENTS).sort(), [
    'app_error',
    'card_printed', 'card_shared', 'day_game_count', 'first_run_complete',
    'game_mode_opened', 'plan_generated', 'pwa_installed',
    'team_added', 'team_removed', 'team_switched',
    // A51. The denominator for first_run_complete, which has been a count with
    // nothing to divide by since it shipped. Read the note above it in
    // analytics.js before adding a thirteenth.
    'welcome_seen',
  ]);
});

/* The one event that is not a product question. It exists because the app had
   no way to say it had broken; what keeps it inside the promise is that its
   only field is a five-value literal and there is no message or stack field to
   put anything else in. These tests are the shape of that guarantee. */
test('app_error can only ever say which half of the app broke', () => {
  assert.deepEqual(Object.keys(EVENTS.app_error), ['where']);
  assert.deepEqual(EVENTS.app_error.where,
    ['boot', 'render', 'solve', 'storage', 'share']);
  // the obvious mistake, made impossible by the whitelist rather than by care
  assert.deepEqual(
    payload('app_error', { where: 'solve', message: "Cannot read 'hue' of Ana Ruiz", stack: 'at engine.js' }),
    { e: 'app_error', where: 'solve' });
  // a `where` that is not one of the five is dropped, not passed through
  assert.deepEqual(payload('app_error', { where: 'TypeError: Ana is not a function' }), { e: 'app_error' });
});

test('errorWhere only ever returns one of the five, whatever it is handed', () => {
  const allowed = new Set(EVENTS.app_error.where);
  const inputs = [undefined, null, '', 0, {}, [],
    'http://localhost:8477/engine.js', './storage.js', '/app/share.js?v=176',
    'https://benchcard.app/render.js', 'engine.js#12',
    "TypeError: Cannot read properties of undefined (reading 'Ana Ruiz')",
    'https://evil.example/x.js'];
  for (const painted of [true, false]) {
    for (const i of inputs) {
      const w = errorWhere(i, painted);
      assert.ok(allowed.has(w), `errorWhere(${JSON.stringify(i)}, ${painted}) = ${w}`);
    }
  }
});

test('errorWhere reads the module, and a dead boot outranks it', () => {
  assert.equal(errorWhere('http://localhost:8477/engine.js', true), 'solve');
  assert.equal(errorWhere('/app/strategy.js', true), 'solve');
  assert.equal(errorWhere('./storage.js', true), 'storage');
  assert.equal(errorWhere('https://benchcard.app/share.js', true), 'share');
  assert.equal(errorWhere('./card.js', true), 'render');
  assert.equal(errorWhere(null, true), 'render');
  // before the first paint it does not matter which file threw: the coach is
  // looking at a dead shell either way, and that is the case they cannot fix
  for (const f of ['./engine.js', './share.js', './card.js', null]) {
    assert.equal(errorWhere(f, false), 'boot');
  }
});

test('the team events carry a count and nothing that could name a team', () => {
  for (const ev of ['team_added', 'team_switched', 'team_removed']) {
    assert.deepEqual(payload(ev, { teams: 3 }), { e: ev, teams: 3 });
    // the obvious mistake this whitelist exists to make impossible
    assert.deepEqual(payload(ev, { teams: 2, name: 'Wildcats 6th Grade' }), { e: ev, teams: 2 });
    assert.deepEqual(payload(ev, { name: 'Ravens' }), { e: ev });
  }
});

test('an unknown event never becomes a request', () => {
  assert.equal(payload('roster_uploaded', { names: ['Ana'] }), null);
  assert.equal(payload('', {}), null);
  assert.equal(payload('toString', {}), null); // no prototype leakage
  assert.equal(track('roster_uploaded', { names: ['Ana'] }), false);
});

test('drops every field the event did not declare', () => {
  const p = payload('plan_generated', {
    strategy: 'closers', team: 'Wildcats', opponent: 'Hawks',
    players: ['Marcus Ward'], note: 'sub Ana for Eli',
  });
  assert.deepEqual(p, { e: 'plan_generated', strategy: 'closers' });
});

test('a declared string field only accepts its listed literals', () => {
  assert.deepEqual(payload('card_printed', { size: 'half' }), { e: 'card_printed', size: 'half' });
  // a name smuggled into a known field is dropped, not passed through
  assert.deepEqual(payload('card_printed', { size: 'Marcus Ward' }), { e: 'card_printed' });
});

test('a number field is coerced to a small clamped integer', () => {
  assert.equal(payload('day_game_count', { games: 3 }).games, 3);
  assert.equal(payload('day_game_count', { games: '4' }).games, 4);
  assert.equal(payload('day_game_count', { games: 2.9 }).games, 2);
  assert.equal(payload('day_game_count', { games: -5 }).games, 0);
  assert.equal(payload('day_game_count', { games: 1e9 }).games, 99);
  assert.equal('games' in payload('day_game_count', { games: 'Hawks' }), false);
  assert.equal('games' in payload('day_game_count', {}), false);
});

test('no payload can ever carry free text', () => {
  const nasty = ['Marcus Ward', 'Wildcats U12', 'vs Hawks', '{"n":"Ana"}', 7.5, { n: 'Ana' }, ['Ana']];
  for (const name of Object.keys(EVENTS)) {
    for (const v of nasty) {
      const props = {};
      for (const f of Object.keys(EVENTS[name])) props[f] = v;
      props.extra = v;
      const p = payload(name, props);
      const json = JSON.stringify(p);
      assert.match(json, /^\{"e":"[a-z_]+"(,"[a-z]+":("(1-5|6-9|10-12|13\+|balanced|minutes|closers|platoon|pocket|half)"|\d+))?\}$/,
        `${name} produced ${json}`);
    }
  }
});

test('roster sizes are bucketed, never exact', () => {
  assert.equal(bucketRoster(1), '1-5');
  assert.equal(bucketRoster(5), '1-5');
  assert.equal(bucketRoster(9), '6-9');
  assert.equal(bucketRoster(12), '10-12');
  assert.equal(bucketRoster(13), '13+');
  assert.equal(bucketRoster(40), '13+');
  assert.equal(bucketRoster('x'), '1-5');
  for (const n of [0, 5, 6, 11, 15]) {
    assert.ok(EVENTS.first_run_complete.roster.includes(bucketRoster(n)));
  }
});

test('the strategy list matches the app', () => {
  const src = readFileSync(new URL('../app/state.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('export const STRATEGIES'));
  const keys = [...block.slice(0, block.indexOf('};')).matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), [...EVENTS.plan_generated.strategy].sort());
});

/* Analytics may load a script, so only the narrow claim is true: the roster
   and the players stay local. Every absolute phrasing has to be caught, not
   just the one that happened to be in the copy when this was written -- the
   footer line survived the first pass because the guard knew one wording.

   Whitespace-tolerant, and that is not decoration. `#help`'s lede read
   "Everything stays on this device" for months and passed, because the markup
   wrapped between "this" and "device" and these patterns wanted a literal
   space. A guard a line wrap can walk past is not a guard, and the wrap is
   invisible to whoever writes the sentence.

   Hoisted out of the HTML test because the same four phrasings are now asked
   of two file types. One list, one place: two copies of this question is the
   defect this repo keeps finding. */
const claim = (s) => new RegExp(s.replace(/ /g, '\\s+'), 'i');
const ABSOLUTE = [
  'nothing is uploaded',
  'nothing (?:ever )?leaves (?:your|this) device',
  'everything stays on (?:your|this) device',
  'no data (?:is )?(?:ever )?(?:sent|uploaded|leaves)',
].map(claim);

test('no user-facing copy makes an absolute "nothing leaves this device" claim', () => {
  /* EVERY served HTML file, not the two this started with. The six generated
     roster-size chart pages carry the same trust line as the app, and for
     months nothing checked them -- a hand-listed pair of filenames is a guard
     that stops covering the site the moment the site grows. Read the directory
     instead, and refuse to pass on an empty list. */
  const files = readdirSync(new URL('../app/', import.meta.url)).filter((f) => f.endsWith('.html'));
  assert.ok(files.length >= 9, `only ${files.length} HTML files found; the privacy guard is looking in the wrong place`);
  for (const file of files) {
    /* Comments are prose ABOUT the page, not text ON it -- the same rule
       scripts/feature-keys.mjs already states. A comment RECORDING which
       phrasings are banned has to be able to name one without failing the
       guard for it, and this repo has shipped the mirror of that mistake
       twice: a guard scoring its own explanatory comment. */
    const src = readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    for (const re of ABSOLUTE) {
      assert.ok(!re.test(src), `${file} still makes an absolute privacy claim: ${re}`);
    }
  }
});

/* The text a JS module can put on the screen: every string and template
   literal, with the code around them left behind. A scanner, not a parser,
   but it has to keep four things apart or it reads the wrong text --
   `//` inside 'https://...' is not a comment; `"` inside a regex is not a
   quote (season-view.js:177 is literally /[",\r\n]|^\s|\s$/, and mistaking it
   for a string swallows the next forty characters of code); a template can
   nest another template inside `${}` (app.js:265, engine.js:1381); and `/`
   after `return` opens a regex while `/` after `)` divides.

   COMMENTS ARE DROPPED, on purpose and for the third time in this repo: a
   guard that scores its own explanatory comment has shipped twice, and
   app.js:336 carries the narrow claim in a comment precisely so the next
   reader knows why `payload` is shaped the way it is. Prose ABOUT the code is
   not text ON the page. */
function jsStrings(src) {
  const OPENS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>']);
  const KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await', 'new', 'delete', 'void', 'instanceof']);
  const lastTok = (t, at) => {
    let j = at - 1;
    while (j >= 0 && /\s/.test(t[j])) j--;
    if (j < 0) return '';
    if (!/[\w$]/.test(t[j])) return t[j];
    let k = j;
    while (k >= 0 && /[\w$]/.test(t[k])) k--;
    return t.slice(k + 1, j + 1);
  };
  // an escape becomes the character it stands for, and \n \t \r become the
  // whitespace they are -- so a claim broken across a `\n` still reads as one
  const unesc = (c) => ('ntr'.includes(c) ? ' ' : c);
  const out = [];
  const frames = [{ t: 'code', d: 0 }];
  let i = 0;
  while (i < src.length) {
    const f = frames[frames.length - 1];
    const c = src[i], d = src[i + 1];
    if (f.t === 'tmpl') {
      if (c === '\\') { f.buf += unesc(d); i += 2; continue; }
      if (c === '`') { out.push(f.buf); frames.pop(); i++; continue; }
      // an interpolation reads as a space: `Nothing ${x} leaves your device`
      // is still one sentence to whoever reads it off the screen
      if (c === '$' && d === '{') { f.buf += ' '; frames.push({ t: 'code', d: 0 }); i += 2; continue; }
      f.buf += c; i++; continue;
    }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/') {
      const tok = lastTok(src, i);
      if (!OPENS.has(tok) && !KEYWORDS.has(tok)) { i++; continue; }   // division
      i++;
      let cls = false;
      while (i < src.length) {
        const r = src[i];
        if (r === '\\') { i += 2; continue; }
        if (r === '\n') break;
        if (r === '[') cls = true;
        else if (r === ']') cls = false;
        else if (r === '/' && !cls) { i++; break; }
        i++;
      }
      while (i < src.length && /[a-z]/.test(src[i])) i++;                // flags
      continue;
    }
    if (c === '"' || c === "'") {
      let buf = '';
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') { buf += unesc(src[i + 1]); i += 2; continue; }
        if (src[i] === '\n') break;                                     // resync
        buf += src[i++];
      }
      i++; out.push(buf); continue;
    }
    if (c === '`') { frames.push({ t: 'tmpl', buf: '' }); i++; continue; }
    if (c === '{') { f.d++; i++; continue; }
    if (c === '}') {
      if (f.d === 0 && frames.length > 1) { frames.pop(); i++; continue; }
      f.d--; i++; continue;
    }
    i++;
  }
  return out;
}

test('no absolute privacy claim can hide in a JS string either', () => {
  /* The guard read HTML and nothing else until today, so a toast reading
     "nothing ever leaves your device" -- three lines of JS, no markup --
     shipped green. Most of this app's copy is in `app/*.js`; the HTML is the
     shell. Same four phrasings, same whitespace tolerance, one list.

     WHAT COUNTS AS COPY: every string literal, with no attempt to tell prose
     from machinery. A selector, a `data-` key, a class name and an icon path
     all live in strings too, and a classifier that sorted them would be a
     second implementation of "is this user-facing" -- the exact defect this
     repo keeps finding. It is not needed: the discriminator is the phrase,
     and no selector contains "everything stays on your device". A false
     positive here costs one rewording; a false negative ships a promise the
     app cannot keep.

     `console.*` IS IN SCOPE, deliberately. Excluding it would mean deciding
     which literal belongs to which callee -- more parsing, for a hole that
     opens the moment a warning string is copied into a toast. The cost of
     including it is a reworded dev message.

     Joined with a space, so a claim split across a concatenation
     ('nothing ever leaves ' + 'your device') reads as one sentence. */
  const dir = new URL('../app/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 30, `only ${files.length} JS files found; the privacy guard is looking in the wrong place`);

  /* Assert the scan's OWN SCOPE, not just that it ran. Finding 31 files proves
     nothing about whether anything READ them: a walker that quietly stops
     matching returns [] for every one and passes an empty guard forever. So
     count the sentence-shaped strings it actually pulled out, and the modules
     that contributed one. 358 across 26 modules today; these floors are far
     enough below that to survive a refactor and nowhere near zero. */
  let sentences = 0;
  let speaking = 0;
  for (const file of files) {
    const strings = jsStrings(readFileSync(new URL(file, dir), 'utf8'));
    const prose = strings.filter((s) => (s.match(/ /g) || []).length >= 3);
    if (prose.length) speaking++;
    sentences += prose.length;
    const text = strings.join(' ');
    for (const re of ABSOLUTE) {
      assert.ok(!re.test(text), `${file} still makes an absolute privacy claim: ${re}`);
    }
  }
  assert.ok(sentences >= 250, `only ${sentences} sentence-shaped strings read out of app/*.js; the scanner is not reading them`);
  assert.ok(speaking >= 20, `only ${speaking} modules contributed copy; the scanner stopped part way`);
});

test('the About page tip link matches TIP_URL in the app', () => {
  /* about.html is standalone -- no modules, no shared constant -- so the URL is
     written out by hand in two places. Pin them together: a dead tip link on
     the one crawlable page is the kind of thing nobody notices for months. */
  const about = readFileSync(new URL('../app/about.html', import.meta.url), 'utf8');
  // the constant moved app.js -> toast.js in the split, so find it rather than
  // naming a file: the next seam should not be able to break this guard
  const dir = new URL('../app/', import.meta.url);
  let declared = null;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    declared = readFileSync(new URL(f, dir), 'utf8').match(/const TIP_URL = (null|'([^']+)')/) || declared;
  }
  assert.ok(declared, 'TIP_URL should still be declared somewhere in app/');
  const url = declared[2] || null;
  const linked = [...about.matchAll(/href="(https:\/\/(?:www\.)?(?:buymeacoffee|ko-fi)\.com[^"]*)"/g)]
    .map(m => m[1]);
  if (url === null) {
    assert.deepEqual(linked, [], 'with TIP_URL off, about.html must not link a tip page either');
  } else {
    assert.ok(linked.length, 'about.html should carry the tip link');
    for (const href of linked) assert.equal(href, url, 'about.html links a different tip URL than the app');
  }
});
