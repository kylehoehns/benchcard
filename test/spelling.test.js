import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scan, trackedFiles, WORDS, LEGACY_MARK, ALLOWED } from '../scripts/spelling.mjs';

/* #61: American spelling everywhere. `scan` is the seam: it reads one file's
   text and returns every British fragment it finds, case-insensitively, with
   the American word to use instead -- the same table the CLI and the hook
   print from. */

test('scan finds each literal-fragment British word, case-insensitively, with the right American word', () => {
  /* A fragment that carries a lookahead (#109's six -ism/-ist-guarded stems)
     is regex source, not literal text -- using it as both the pattern and
     the probe line would scan for its own syntax characters. Those six are
     covered below, with real word forms, by the #109 stem test instead. */
  for (const [british, american] of WORDS.filter(([b]) => !b.includes('('))) {
    for (const line of [british, british.toUpperCase(),
      british[0].toUpperCase() + british.slice(1)]) {
      const hits = scan(`x ${line} y`);
      assert.equal(hits.length, 1, `expected exactly one hit scanning "${line}"`);
      assert.equal(hits[0].fragment.toLowerCase(), british.toLowerCase());
      assert.equal(hits[0].american, american);
      assert.equal(hits[0].line, 1);
      assert.equal(hits[0].marked, false);
    }
  }
});

test('a clean line gives no hits', () => {
  assert.deepEqual(scan('nothing to see here, the whole word list is clean'), []);
});

test('a line carrying the legacy marker comes back marked', () => {
  const [british] = WORDS[0];
  const hits = scan(`x ${british} y // ${LEGACY_MARK}`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].marked, true);
});

/* #109: British -ise verbs. Sixteen new stems join WORDS. Built from pieces,
   like WORDS itself, so this file's own source never spells out the British
   word it is testing for -- otherwise the whole-tree scan below would flag
   this file. */

const NEW_STEMS = [
  ['author', 'authoriz'],
  ['capital', 'capitaliz'],
  ['crystall', 'crystalliz'],
  ['formal', 'formaliz'],
  ['general', 'generaliz'],
  ['mechan', 'mechaniz'],
  ['monet', 'monetiz'],
  ['neutral', 'neutraliz'],
  ['normal', 'normaliz'],
  ['optim', 'optimiz'],
  ['priorit', 'prioritiz'],
  ['quant', 'quantiz'],
  ['sanit', 'sanitiz'],
  ['serial', 'serializ'],
  ['standard', 'standardiz'],
  ['summar', 'summariz'],
];

const IS = 'is';

test('scan finds each of the 16 new British -ise stems in -ise/-ised/-isation/-iser forms', () => {
  for (const [stem, americanStem] of NEW_STEMS) {
    for (const suffix of ['e', 'ed', 'ation', 'er']) {
      const british = stem + IS + suffix;
      const hits = scan(`x ${british} y`);
      assert.equal(hits.length, 1, `expected exactly one hit scanning "${british}"`);
      assert.equal(hits[0].fragment.toLowerCase(), (stem + IS).toLowerCase());
      assert.equal(hits[0].american, americanStem);
      assert.equal(hits[0].marked, false);
    }
  }
});

test('scan finds nothing in a line of correct American words that share a stem with the new list', () => {
  const line = 'promise otherwise raise rise noise exercise advertise precise '
    + 'premise compromise enterprise concise improvise praise surprise wise '
    + 'optimism optimist generalist formalism capitalism capitalist mechanism';
  assert.deepEqual(scan(line), []);
});

/* The tree scan (a guard, under /new-guard): every tracked file outside
   app/vendor/, scanned, with a fixed allowance for the four files carrying
   the legacy-key fallback (#61). */

test('trackedFiles reads the real repo, not nothing', () => {
  const files = trackedFiles();
  assert.ok(files.length > 0, 'a scan that reads no files finds no bugs');
  for (const f of ['AGENTS.md', 'app/storage.js', 'scripts/spelling.mjs']) {
    assert.ok(files.includes(f), `trackedFiles() must include ${f}`);
  }
});

test('no tracked file name outside app/vendor contains a British fragment', () => {
  const offenders = trackedFiles().filter(f => scan(f).some(h => !h.marked));
  assert.deepEqual(offenders, []);
});

test('every unmarked hit in the tree fails, naming the file, line, fragment and fix', () => {
  const messages = [];
  for (const file of trackedFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const hit of scan(text)) {
      if (!hit.marked) {
        messages.push(`${file}:${hit.line}: "${hit.fragment}" → use "${hit.american}"`);
      }
    }
  }
  assert.deepEqual(messages, [],
    `British spelling found:\n${messages.join('\n')}`);
});

test('a marked line outside the four allowed files is not permitted', () => {
  const offenders = [];
  for (const file of trackedFiles()) {
    if (file in ALLOWED) continue;
    const text = readFileSync(file, 'utf8');
    for (const hit of scan(text)) {
      if (hit.marked) offenders.push(`${file}:${hit.line}`);
    }
  }
  assert.deepEqual(offenders, [], 'the legacy marker is only for the four files #61 names');
});

test('each allowed file carries exactly its pinned number of marked lines', () => {
  for (const [file, want] of Object.entries(ALLOWED)) {
    const text = readFileSync(file, 'utf8');
    const markedLines = new Set(scan(text).filter(h => h.marked).map(h => h.line));
    assert.equal(markedLines.size, want, `${file} must carry exactly ${want} marked line(s)`);
  }
});
