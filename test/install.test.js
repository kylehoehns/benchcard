import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The Add to Home Screen nudge is the other half of the storage-eviction
   defence: WebKit clears a Safari tab after seven days idle and exempts an
   installed app. Like the tip jar next to it in `toast.js` it is an ask, so
   what matters is that it is asked once, at a moment that has earned it, and
   never over a live game. `toast.js` touches the DOM at import time, so this
   reads the source and pins the rule. */
const src = readFileSync(new URL('../app/toast.js', import.meta.url), 'utf8');
const storage = readFileSync(new URL('../app/storage.js', import.meta.url), 'utf8');

test('it reuses the one use counter rather than adding a second', () => {
  assert.equal((src.match(/state\.ui\.prints\s*=/g) || []).length, 1,
    'there is one counter of "the app did something for this coach"');
  const m = src.match(/const USES_BEFORE_INSTALL = (\d+);/);
  assert.ok(m, 'the threshold should be a named constant, not a literal in a branch');
  const ask = Number(src.match(/const USES_BEFORE_ASKING = (\d+);/)[1]);
  assert.ok(Number(m[1]) >= 2, 'a first-time visitor has not got value out of it yet');
  assert.ok(Number(m[1]) < ask,
    'the roster is worth more than the coffee, so the install goes first');
});

test('both use moments offer it, and the tip stands down when it does', () => {
  for (const name of ['tipAfterPrint', 'tipAfterGame']) {
    const fn = src.slice(src.indexOf(`export function ${name}`));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.match(body, /nudgeInstall\([\s\S]*?\)\) return;/,
      `${name} must offer the install before the tip -- one toast box, one ask`);
  }
});

test('the counter runs before either gate', () => {
  /* Declining the tip used to be enough to stop `countUse` being reached at
     all, which would have frozen the install nudge behind a threshold it
     could never cross. */
  for (const name of ['tipAfterPrint', 'tipAfterGame']) {
    const fn = src.slice(src.indexOf(`export function ${name}`));
    const body = fn.slice(0, fn.indexOf('\n}'));
    assert.ok(body.indexOf('countUse()') < body.indexOf('tipEligible()'),
      `${name} counts the use whether or not anything is asked`);
  }
});

test('never installed twice, and never to an app already installed', () => {
  const fn = src.slice(src.indexOf('function installEligible'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /state\.ui\.installDone/);
  assert.match(body, /standalone\(\)/);
  assert.match(body, /gamemode/, 'bench mode is the one screen that must not be interrupted');
  assert.match(src, /matchMedia[\s\S]{0,120}display-mode: standalone/);
  assert.match(src, /navigator\.standalone/, 'iOS reports installed its own way');
});

test('answering either way is the end of it', () => {
  const fn = src.slice(src.indexOf('function showInstall'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /state\.ui\.installDone = true/);
  // the accept button and the dismiss both run the same recorded answer
  assert.equal((body.match(/answered\b/g) || []).length >= 3, true,
    'the Install button and the dismiss must share one "answered" path');
});

test('the Android prompt is deferred, not fired on arrival', () => {
  assert.match(src, /beforeinstallprompt[\s\S]{0,120}preventDefault\(\)/,
    'an unprompted banner is exactly what this is meant to avoid');
  assert.match(src, /appinstalled[\s\S]{0,140}installDone = true/,
    'installed by some other route is still an answer');
});

test('the dismissal is remembered the way tipDone is', () => {
  assert.match(storage, /installDone: !!raw\.ui\?\.installDone/,
    'it is a `ui` flag on the v4 record, sanitised like every other one');
});
