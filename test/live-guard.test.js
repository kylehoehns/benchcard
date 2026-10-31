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

/* #356: `live.js` is the only module that assigns `at`, `hand`, `overrides`,
 * `finished` or (#412) `sat` on a game's live record (storage.js's sanitizer builds whole
 * records and is the one named exception). Every write the app makes is an
 * operation there -- openGame, step, finish, dropPlayer, keepThrough, replaceOverrides,
 * writeOverrides -- so the rule that `hand` lists only stints that still have
 * an override sits in one file. The shapes below are the ways a write has
 * been, or could be, spelled; `writeShapes` is exercised on its own so a
 * regex that stopped matching fails here and not silently. */
const FIELDS = 'at|hand|overrides|finished|sat';
// `x.at = …`, `x.hand ||= …`, `x?.overrides += …` -- not `==`, `>=`, `!=`, and
// not a DOM `el.dataset.at = …`.
const ASSIGN = new RegExp(`(?<!\\bdataset)\\.(?:${FIELDS})\\s*(?:[-+*/%|&?]{1,2})?=(?!=)`, 'g');
// `.hand.push(…)`, `.overrides.splice(…)` and friends: in-place mutation.
const MUTATE = new RegExp(`\\.(?:hand|overrides)\\s*\\.\\s*(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)\\s*\\(`, 'g');
// `delete x.overrides[k]`, `delete x.hand[k]`, `Object.assign(x.overrides, …)`.
const DELETE_DIRECT = /\bdelete\s+[\w.?]*\.(?:overrides|hand)\s*\??\.?\s*\[/g;
const ASSIGN_INTO = /\bObject\.assign\(\s*[\w.?]*\.(?:overrides|hand)\b/g;
// `delete g.live.finished`, `delete live.hand`: the whole field goes.
const DELETE_FIELD = new RegExp(`\\bdelete\\s+[\\w.?]*\\.(?:${FIELDS})\\b(?!\\s*\\??\\.?\\s*\\[)`, 'g');
// `live.hand.length = 0` truncates the list in place.
const LENGTH_SET = /\.(?:hand|overrides)\s*\.\s*length\s*=(?!=)/g;
// A live record by expression: `live`, `g.live`, `game().live`, `liveOf(…)`.
const LIVEISH = String.raw`(?:\b(?:[\w$?.()]*\.)?live|\bliveOf\((?:[^()]|\([^()]*\))*\))(?![\w$]|\??\.\w)`;
// `const ov = g.live?.overrides` / `= live.overrides || {}` / `= x.hand`: an
// alias whose own writes (`ov[k] = …`, `delete ov[k]`, `ov.push`) land on the record.
const ALIAS = /\b(?:const|let|var)\s+(\w+)\s*=\s*[\w.?]*\.(?:overrides|hand)\b(?!\s*[(\w])/g;
// `const { overrides } = live` / `const { overrides: ov, hand } = g.live`: the same alias, destructured.
const DESTRUCTURED = new RegExp(String.raw`\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${LIVEISH}`, 'g');
// `const l = liveOf(g)` / `const lv = g.live`: a name for the whole record.
const LIVE_NAME = new RegExp(String.raw`\b(?:const|let|var)\s+(\w+)\s*=\s*${LIVEISH}`, 'g');

const writesThrough = name => new RegExp(`\\bdelete\\s+${name}\\s*\\[|\\b${name}\\s*\\[[^\\]]*\\]\\s*(?:[-+*/%|&?]{1,2})?=(?!=)`
  + `|\\b${name}\\s*\\.\\s*(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)\\s*\\(|Object\\.assign\\(\\s*${name}\\b`
  + `|\\b${name}\\s*\\.\\s*length\\s*=(?!=)`, 'g');

// The names this file gives a whole live record, besides `live` itself.
const liveNames = src => [...new Set([...src.matchAll(LIVE_NAME)].map(m => m[1]))];

export function writeShapes(src) {
  const found = [];
  for (const re of [ASSIGN, MUTATE, DELETE_DIRECT, ASSIGN_INTO, DELETE_FIELD, LENGTH_SET]) {
    for (const m of src.matchAll(re)) found.push(m[0].trim());
  }
  const names = ['live', ...liveNames(src)];
  // `Object.assign(live, {...})` onto the record itself, by any name it has here.
  const assignOnto = new RegExp(String.raw`\bObject\.assign\(\s*(?:${names.join('|')}\b|${LIVEISH.replace(/\(\?!.*$/, '')})`, 'g');
  for (const m of src.matchAll(assignOnto)) found.push(m[0].trim());
  const aliases = [...src.matchAll(ALIAS)].map(m => m[1]);
  for (const m of src.matchAll(DESTRUCTURED)) {
    for (const part of m[1].split(',')) {
      const [field, as] = part.split(':').map(x => x.trim());
      if (field === 'overrides' || field === 'hand') aliases.push(as || field);
    }
  }
  for (const name of new Set(aliases)) {
    for (const u of src.matchAll(writesThrough(name))) found.push(`${name} (alias): ${u[0].trim()}`);
  }
  return found;
}

// Reads of `at` / `finished` on a live record, in any spelling this app uses:
// `live.at`, `g.live?.finished`, `liveOf(g).at`, `const l = liveOf(g); l.at`,
// `const { at } = live`. Not `dataset.at` or `resume.at`: those are not records.
export function readShapes(src) {
  const found = [];
  const direct = new RegExp(String.raw`${LIVEISH.replace(/\(\?!.*$/, '')}\)?\s*\??\.(?:at|finished)\b`, 'g');
  for (const m of src.matchAll(direct)) found.push(m[0].trim());
  for (const name of liveNames(src)) {
    for (const m of src.matchAll(new RegExp(`\\b${name}\\s*\\??\\.(?:at|finished)\\b`, 'g'))) found.push(`${name} (alias): ${m[0].trim()}`);
  }
  for (const m of src.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s*\{([^}]*)\}\s*=\s*${LIVEISH}`, 'g'))) {
    if (/\b(?:at|finished)\b/.test(m[1].replace(/:\s*\w+/g, ''))) found.push(m[0].trim());
  }
  return found;
}

test('writeShapes: every forbidden shape is found, and a plain read is not', () => {
  const bad = [
    'x.at = 3;', 'g.live.hand = [];', 'live.overrides = {};', 'live.finished = true;',
    'l.at ||= 0;', 'live.at += 1;',
    'delete g.live.overrides[k];', 'live.hand.push(2);', 'Object.assign(live.overrides, r);',
    'const ov = g.live?.overrides;\nfor (const k of ks) delete ov[k];',
    'const ov = live.overrides || {};\nov[2] = five;',
    'const h = live.hand;\nh.splice(0, 1);',
    'delete g.live.finished;', 'delete live.at;', 'delete x.hand;', 'delete l?.overrides;',
    'Object.assign(live, { at: 2 });', 'Object.assign(g.live, r);', 'Object.assign(liveOf(g), r);',
    'const l = liveOf(g);\nObject.assign(l, { finished: true });',
    'const { overrides } = live;\noverrides[k] = five;',
    'const { overrides: ov } = g.live;\ndelete ov[k];',
    'const { hand, at } = live;\nhand.push(2);',
    'live.hand.length = 0;', 'g.live.overrides.length = 0;',
    'const { hand } = live;\nhand.length = 0;',
  ];
  for (const src of bad) assert.notDeepEqual(writeShapes(src), [], `a write went unseen: ${src}`);
  const fine = [
    'if (live.at === was) tick();', 'line.dataset.at = starts[i];', 'const a = l.at >= 2;', 'if (x.finished != true) go();',
    'const ov = g.live?.overrides || {};\nreturn ov[k] ? 1 : 0;',
    'const before = live.overrides || {};\nconst five = k => before[k] || p;',
    'const overrides = {};\noverrides[k + i] = s.onFloor;',
    'const hand = handStints(live).filter(k => k < 3);',
    'const { overrides } = live;\nreturn overrides[k] ? 1 : 0;',
    'const { overrides: ov, hand } = g.live;\nreturn [ov[2], hand.length];',
    'delete live.arrived;', 'delete live.stamp;', 'const o = Object.assign({}, live);', 'if (hand.length === 0) go();',
    'const l = liveOf(g);\nl.stamp = s;',
  ];
  for (const src of fine) assert.deepEqual(writeShapes(src), [], `a read was flagged: ${src}`);
});

test('readShapes: every spelling of a read of at/finished on a live record is found, and other .at is not', () => {
  const bad = [
    'if (live.at) go();', 'const n = g.live?.at;', 'game().live.finished', 'liveOf(g).at',
    'const l = liveOf(game());\nif (l.at !== was) tick();',
    'const lv = g.live;\nreturn lv.finished;',
    'const l = liveOf(game());\nconst a = l?.at;',
    'const { at } = live;', 'const { finished, hand } = g.live;',
  ];
  for (const src of bad) assert.notDeepEqual(readShapes(src), [], `a read went unseen: ${src}`);
  const fine = [
    'line.dataset.at = starts[i];', 'now.style.left = pct(starts[resume.at]);',
    'const l = liveOf(game());\nl.stamp = s;', 'const { overrides: at } = live;',
    'const r = resumeAt(p, live);', 'const live = g.live?.overrides;',
  ];
  for (const src of fine) assert.deepEqual(readShapes(src), [], `a non-read was flagged: ${src}`);
});

test('no app/ file but live.js and storage.js writes live.at, hand, overrides or finished', () => {
  // 2a: a scan of an empty or wrong directory listing measures nothing.
  assert.ok(APP_FILES.length > 10,
    `app/ file listing came back with only ${APP_FILES.length} entries; this guard is reading the wrong directory`);
  const offenders = [];
  for (const f of APP_FILES) {
    if (f === 'live.js' || f === 'storage.js') continue;
    for (const w of writeShapes(read(f))) offenders.push(`${f}: ${w}`);
  }
  assert.deepEqual(offenders, [],
    'a game\'s live.at / hand / overrides / finished is written in live.js only (storage.js\'s sanitizer builds '
    + 'whole records and is the other named exception); call openGame, step, finish, dropPlayer, keepThrough, '
    + 'replaceOverrides or writeOverrides instead');
});

// The read side of #113: live.at may not be compared, clamped or done
// arithmetic on outside live.js/storage.js; nothing there reads it at all now
// that the writes are operations, so the whole name is off limits.
test('no app/ file but live.js and storage.js reads live.at or live.finished, by any name it gives the record', () => {
  assert.ok(APP_FILES.length > 10,
    `app/ file listing came back with only ${APP_FILES.length} entries; this guard is reading the wrong directory`);
  const offenders = [];
  for (const f of APP_FILES) {
    if (f === 'live.js' || f === 'storage.js') continue;
    for (const r of readShapes(read(f))) offenders.push(`${f}: ${r}`);
  }
  assert.deepEqual(offenders, [],
    'live.at may only be compared, clamped or done arithmetic on inside live.js, and live.finished read there '
    + 'only; every other file asks stage/stintIndex/resumeAt/openAt/stepAt/playedStints/finishedGame instead');
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

test('live.js imports only ./engine.js', () => {
  const src = readFileSync(new URL('live.js', APP), 'utf8');
  const specifiers = [...src.matchAll(/^import\s+.*?\bfrom\s+'([^']+)';/gm)].map(m => m[1]);
  assert.ok(specifiers.length > 0, 'live.js scan found no import lines -- the shape changed');
  assert.deepEqual(specifiers, ['./engine.js'],
    'live.js may import only engine.js (for fmtClock) -- the no-import-cycle constraint');
});
