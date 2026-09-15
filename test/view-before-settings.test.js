import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments, functionBody } from './js-comments.js';

/* ================================================================== *
 * PR #48 (#22 review fix): the cog used to remember "where to go back
 * to" in `let backFrom` -- a module-level variable in app.js, written
 * ONLY inside the cog's own `#settingsBtn` handler. `addTeam()` in
 * teams-view.js calls `setView('settings')` directly, never through that
 * handler, so the write never ran: Season -> "+ Team" -> cog landed on
 * Games, not Season.
 *
 * The fix moves the memory to the one place every view change already
 * passes through: `setView()` in render.js now records `lastView` (the
 * last view that is neither 'settings' nor 'welcome', defaulting to
 * 'games'), and `viewBeforeSettings()` exports it. `backFrom` is gone.
 *
 * The class of mistake -- a second record of "where the coach was",
 * kept by one entry point instead of the one seam every caller shares --
 * is what this file guards against, two ways:
 *
 *   1. Behaviour: exercise `setView` / `viewBeforeSettings` straight out
 *      of render.js, under a minimal DOM stub.
 *   2. Wiring, comment-stripped: the cog reads `viewBeforeSettings()`,
 *      and neither app.js nor teams-view.js keeps a module-level
 *      variable holding a view name to go back to.
 * ================================================================== */

/* ---------------- 1. behaviour: render.js's own bookkeeping ---------------- *
 *
 * render.js reaches five other view modules (card.js, roster-view.js,
 * teams-view.js among them) and none of that machinery is needed to prove
 * `setView` / `viewBeforeSettings` -- only that every DOM read/write those
 * modules do at IMPORT time and inside `applyView` resolves to something
 * rather than throwing. A tolerant fake element (every property readable,
 * every method a no-op, `querySelector` returning a fresh one of itself)
 * stands in for the whole tree: this test never inspects what got painted,
 * only what `viewBeforeSettings()` reports back, so the stub does not need
 * to remember anything either. `card.js` calls the bare global
 * `addEventListener('resize', ...)` at import time (not `window.`'s), which
 * is why that is stubbed too, same as `settings.test.js`'s `document` stub
 * stands in for `state.js` reaching for a canvas. */
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
function fakeEl() {
  return {
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    style: { setProperty() {} },
    dataset: {},
    hidden: false,
    textContent: '',
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, removeEventListener() {},
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    appendChild() {}, remove() {}, focus() {}, select() {},
    get clientWidth() { return 300; },
  };
}
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => fakeEl(),
  querySelectorAll: () => [],
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }), font: '' }) }),
  documentElement: fakeEl(),
  addEventListener() {}, removeEventListener() {},
  fonts: { load: () => Promise.resolve(), ready: Promise.resolve() },
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.scrollTo = () => {};

const R = await import('../app/render.js');
const S = await import('../app/state.js');

// Every test below runs in declaration order in the same module instance
// (node:test's default within a file), so this one has to come first: it is
// the only point at which `setView` has never yet been called.
test('a fresh import backs out to games before any view has been set', () => {
  assert.equal(R.viewBeforeSettings(), 'games');
});

S.state.onboarded = true;

test('games -> settings backs out to games', () => {
  R.setView('games');
  R.setView('settings');
  assert.equal(R.viewBeforeSettings(), 'games');
});

test('season -> settings backs out to season', () => {
  R.setView('season');
  R.setView('settings');
  assert.equal(R.viewBeforeSettings(), 'season');
});

test('team -> settings -> settings again still backs out to team', () => {
  // the second setView('settings') is the cog re-opened, or addTeam()'s
  // direct call landing on top of an already-open Settings -- either way,
  // Settings must never overwrite its own memory of where the coach was
  R.setView('team');
  R.setView('settings');
  R.setView('settings');
  assert.equal(R.viewBeforeSettings(), 'team');
});

test('the welcome screen is never recorded as somewhere to back out to', () => {
  R.setView('team');
  S.state.onboarded = false;
  R.setView('team'); // forced to 'welcome' by setView itself, not onboarded
  S.state.onboarded = true;
  R.setView('settings');
  assert.equal(R.viewBeforeSettings(), 'team',
    'a reload landing on welcome must not clobber the last real view');
});

/* ---------------- 2. wiring: no second record of "where" ---------------- */

const appSrc = stripComments(readFileSync(new URL('../app/app.js', import.meta.url), 'utf8'));
const teamsSrc = stripComments(readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8'));

test('the cog reads viewBeforeSettings() rather than keeping its own memory', () => {
  assert.match(appSrc, /import\s*\{[^}]*\bviewBeforeSettings\b[^}]*\}\s*from\s*['"]\.\/render\.js['"]/,
    'app.js must import viewBeforeSettings from render.js');
  const start = appSrc.indexOf("on('#settingsBtn'");
  assert.ok(start > -1, '#settingsBtn handler not found; this guard is reading nothing');
  const end = appSrc.indexOf('\n});', start);
  assert.ok(end > start, 'could not find the end of the #settingsBtn handler');
  const handler = appSrc.slice(start, end);
  assert.match(handler, /viewBeforeSettings\(\)/,
    'the #settingsBtn handler must call viewBeforeSettings() to decide where to go back to');
});

/* The class of mistake, generalised: a module-level `let` in app.js or
   teams-view.js (the two files whose callers reach setView('settings') from
   more than one place) that is ever assigned a view name is exactly the
   second record `backFrom` was -- kept by one entry point rather than by
   the seam every view change already passes through. render.js's own
   `lastView` is deliberately out of scope here: it is the ONE place this
   is allowed to live. */
const VIEW_LITERALS = ['games', 'team', 'season', 'settings', 'welcome'];

// module-scope (brace depth 0) `let NAME` declarations, in source order.
// Same brace-matching rigour as functionBody -- good enough for these two
// files, which do not put a `{` or `}` character inside a string literal.
function topLevelLets(src) {
  const names = [];
  let depth = 0;
  const re = /\{|\}|\blet\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0] === '{') depth++;
    else if (m[0] === '}') depth--;
    else if (depth === 0) names.push(m[1]);
  }
  return names;
}

// true if `name` is ever assigned (anywhere in the file, any scope) an
// expression whose right-hand side names one of the five view literals --
// catches both a bare `backFrom = 'games'` and the ternary
// `backFrom = state.view === 'welcome' ? 'games' : state.view`.
function assignsViewLiteral(src, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*([^;]{1,200});`, 'g');
  let m;
  while ((m = re.exec(src))) {
    if (VIEW_LITERALS.some(v => new RegExp(`['"]${v}['"]`).test(m[1]))) return m[0];
  }
  return null;
}

test('no module-level variable in app.js or teams-view.js remembers a view to go back to', () => {
  for (const [file, src] of [['app.js', appSrc], ['teams-view.js', teamsSrc]]) {
    for (const name of topLevelLets(src)) {
      const hit = assignsViewLiteral(src, name);
      assert.equal(hit, null,
        `${file}'s top-level \`let ${name}\` is assigned a view name (${hit}) -- that is a second ` +
        `record of where the coach was, kept outside render.js's lastView. viewBeforeSettings() ` +
        `must be the only one.`);
    }
  }
});
