import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripComments } from './js-comments.js';
import { lacks } from './prose.js';

/* #123 Proof: "a guard reading app/: no live.at comparison, clamp or
 * arithmetic outside live.js/storage.js; no read of #gamemode's hidden; card.js
 * has no resumeAt/passStatus/resumeBarAt export and no live read; live.js
 * imports only ./engine.js" -- covers items 2, 3, 4 and 5. Two screens
 * disagreeing about a part-played game (#113) came from `live.at` being read
 * and clamped in five different places (see `live.js`'s header comment) and
 * `#gamemode`'s `hidden` being read directly in several more (the count is on
 * `setBenchOpen`'s comment in `state.js`). Both are now one function apiece
 * in `live.js` and `state.js`; this guard is what keeps a new copy of either
 * from growing back. */

const APP = new URL('../app/', import.meta.url);
const APP_FILES = readdirSync(APP).filter(f => f.endsWith('.js'));
const read = f => stripComments(readFileSync(new URL(f, APP), 'utf8'));

test('every app/ file other than live.js and storage.js leaves live.at alone', () => {
  // 2a: a scan of an empty or wrong directory listing measures nothing.
  assert.ok(APP_FILES.length > 10,
    `app/ file listing came back with only ${APP_FILES.length} entries; this guard is reading the wrong directory`);
  const offenders = [];
  for (const f of APP_FILES) {
    if (f === 'live.js' || f === 'storage.js') continue;
    const src = read(f);
    for (const m of src.matchAll(/live\.at\b/g)) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const nl = src.indexOf('\n', m.index);
      const line = src.slice(lineStart, nl === -1 ? src.length : nl).trim();
      // The one allowed shape: a plain assignment, `live.at = <expr>;`, of
      // the kind openGameMode makes with live.js's own openAt(). Any
      // comparison, clamp or arithmetic on the read side is the bug class
      // #113 came from and belongs inside live.js instead.
      if (!/^live\.at\s*=\s*[^=].*;$/.test(line)) offenders.push(`${f}: ${line}`);
    }
  }
  assert.deepEqual(offenders, [],
    'live.at may only be compared, clamped or done arithmetic on inside live.js (storage.js\'s sanitizer is the '
    + 'other named exception); every other file must ask stage/stintIndex/resumeAt/openAt/stepAt instead');
});

// A `#gamemode` selector stashed in a variable before its `.hidden` is read --
// `const gm = document.querySelector('#gamemode'); if (gm && gm.hidden === false) …`
// -- is the same read the direct-chain shape below catches, one step removed.
// It is what `dueToFile` did before #123; a write through the same variable,
// `gm.hidden = true;`, is still how gamemode.js shows and hides the panel, so
// only a read is an offense.
const GM_SELECTOR_DECL = /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:\$|document\.querySelector)\(\s*['"]#gamemode['"]\s*\)/g;

function storedSelectorReadsHidden(src) {
  for (const m of src.matchAll(GM_SELECTOR_DECL)) {
    const name = m[1];
    const usage = new RegExp(`\\b${name}\\??\\.\\s*hidden\\b`, 'g');
    for (const u of src.matchAll(usage)) {
      const after = src.slice(u.index + u[0].length);
      // The one allowed shape: a plain write, `name.hidden = <expr>;`. Anything
      // else on `.hidden` -- ===, !, a bare read in a condition -- is a read.
      if (!/^\s*=\s*[^=]/.test(after)) return true;
    }
  }
  return false;
}

test("no file in app/ reads #gamemode's hidden property, directly or through a stored selector", () => {
  assert.ok(APP_FILES.length > 10,
    `app/ file listing came back with only ${APP_FILES.length} entries; this guard is reading the wrong directory`);
  const offenders = [];
  for (const f of APP_FILES) {
    const src = read(f);
    if (/#gamemode['"]\)\s*\?{0,2}\.\s*hidden/.test(src) || storedSelectorReadsHidden(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    "every read of \"is bench mode open\" must go through state.js's benchOpen(); setting it, as gm.hidden = ..., "
    + 'is still allowed, directly or through a variable holding the same selector');
});

test('card.js exports none of resumeAt, passStatus or resumeBarAt', () => {
  const src = read('card.js');
  assert.ok(src.length > 100, 'card.js read back empty; this guard is reading the wrong file');
  for (const name of ['resumeAt', 'passStatus', 'resumeBarAt']) {
    assert.ok(lacks(src, `export function ${name}`),
      `card.js still exports ${name}; #123 moved it to live.js`);
  }
});

// #135 item 13: the flag `stage` reads first must not grow a second reader.
// The one allowed shape is gamemode.js's own write inside the Finish game
// undoable, `live.finished = true;` -- nothing else, in any file.
test('no file outside live.js and storage.js reads live.finished; gamemode.js may only write it true', () => {
  assert.ok(APP_FILES.length > 10,
    `app/ file listing came back with only ${APP_FILES.length} entries; this guard is reading the wrong directory`);
  const offenders = [];
  for (const f of APP_FILES) {
    if (f === 'live.js' || f === 'storage.js') continue;
    const src = read(f);
    for (const m of src.matchAll(/live\.finished\b/g)) {
      const lineStart = src.lastIndexOf('\n', m.index) + 1;
      const nl = src.indexOf('\n', m.index);
      const line = src.slice(lineStart, nl === -1 ? src.length : nl).trim();
      const isAllowedWrite = f === 'gamemode.js' && /^live\.finished\s*=\s*true;$/.test(line);
      if (!isAllowedWrite) offenders.push(`${f}: ${line}`);
    }
  }
  assert.deepEqual(offenders, [],
    'live.finished may only be written as `live.finished = true;` inside gamemode.js -- every other file, '
    + 'and every other shape, must ask stage() instead');
});

test('live.js imports only ./engine.js', () => {
  const src = readFileSync(new URL('live.js', APP), 'utf8');
  const specifiers = [...src.matchAll(/^import\s+.*?\bfrom\s+'([^']+)';/gm)].map(m => m[1]);
  assert.ok(specifiers.length > 0, 'live.js scan found no import lines -- the shape changed');
  assert.deepEqual(specifiers, ['./engine.js'],
    'live.js may import only engine.js (for fmtClock) -- the no-import-cycle constraint');
});
