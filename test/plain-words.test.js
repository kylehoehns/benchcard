import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BANNED, MAX_WORDS, APP_COPY, visibleText, sentences, problems,
} from '../scripts/plain-words.mjs';

/* #598: coach-facing text uses plain words and short sentences. The word list
   and the limit live in scripts/plain-words.mjs; whether a new coach would
   understand a sentence the first time stays a reviewer's judgement
   (REVIEW.md). */

const words = (n) => Array.from({ length: n }, () => 'word').join(' ') + '.';

test('a clean sentence passes', () => {
  assert.deepEqual(problems('f.html', ['Tap a player to sub them out.']), []);
});

test('the list and the limit are the agreed ones', () => {
  assert.equal(MAX_WORDS, 25);
  assert.deepEqual([...BANNED].sort(),
    ['config', 'fingerprint', 'strategy engine', 'stint', 'toggle', 'unit'].sort());
});

for (const word of ['stint', 'unit', 'toggle', 'config', 'strategy engine', 'fingerprint']) {
  test(`banned word "${word}" fails, naming file, sentence and reason`, () => {
    const s = `Every ${word} counts here.`;
    const out = problems('scripts/whats-new.json', [s]);
    assert.equal(out.length, 1);
    assert.match(out[0], /scripts\/whats-new\.json/);
    assert.ok(out[0].includes(s));
    assert.ok(out[0].includes(`banned word "${word}"`));
    assert.match(out[0], /plain words/);
  });
}

test('plural and case match; a longer word does not', () => {
  assert.equal(problems('f', ['Two Stints in a row.']).length, 1);
  assert.equal(problems('f', ['All the units.']).length, 1);
  assert.equal(problems('f', ['A strategy   engine.']).length, 1);
  assert.deepEqual(problems('f', ['A community of unity.']), []);
});

test('25 words pass, 26 fail with the count and the limit', () => {
  assert.deepEqual(problems('f', [words(25)]), []);
  const out = problems('f', [words(26)]);
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('26 words, limit 25'));
});

test('an APP_COPY sentence for that file is exempt, for no other file', () => {
  const s = 'Each player plays at most 2 stints in a row (8 min)';
  assert.deepEqual(problems('app/about.html', [s]), []);
  assert.equal(problems('app/other.html', [s]).length, 1);
});

test('sentences split on full stops, question marks and line breaks', () => {
  assert.deepEqual(sentences('One two. Three? Four!\nFive six\n\nSeven.'),
    ['One two.', 'Three?', 'Four!', 'Five six', 'Seven.']);
});

test('visibleText skips head, script, style, svg, noscript, comments and attributes', () => {
  const html = '<html><head><title>Stint title</title></head><body>'
    + '<!-- unit note --><script>var unit=1</script><style>.unit{}</style>'
    + '<svg><text>fingerprint</text></svg><noscript>toggle</noscript>'
    + '<p aria-label="config">Hello there.</p><li>No stop</li></body></html>';
  assert.deepEqual(sentences(visibleText(html)), ['Hello there.', 'No stop']);
});

test('visibleText ends a sentence at each block, and at each legend token span', () => {
  const html = '<body><h2>Heading</h2><p>One <b>bold</b> bit. Two.</p>'
    + '<p><span class="tok a">A</span> first <span class="tok b">B</span> second</p></body>';
  assert.deepEqual(sentences(visibleText(html)),
    ['Heading', 'One bold bit.', 'Two.', 'A first', 'B second']);
});

test('each link in a nav is its own sentence; links in prose are not split', () => {
  const html = '<body><nav><a href="#a">First part</a> <a href="#b">Second part</a></nav>'
    + '<p>Read <a href="#c">the guide</a> now.</p></body>';
  assert.deepEqual(sentences(visibleText(html)), ['First part', 'Second part', 'Read the guide now.']);
});

test('entities are decoded', () => {
  assert.deepEqual(sentences(visibleText('<body><p>Tom&rsquo;s &amp; Ann&#39;s plan.</p></body>')),
    ['Tom’s & Ann\'s plan.']);
});

/* The real sources. */
const NEW_HINT = 'rewrite it in plain words (APP_COPY only for text copied verbatim from the app\'s screens)';

const whatsNew = JSON.parse(readFileSync(new URL('../scripts/whats-new.json', import.meta.url), 'utf8'))
  .flatMap((e) => sentences(e.text));
const page = (p) => sentences(visibleText(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')));
const SOURCES = {
  'scripts/whats-new.json': whatsNew,
  'app/about.html': page('app/about.html'),
  'app/advanced.html': page('app/advanced.html'),
};

for (const [file, list] of Object.entries(SOURCES)) {
  test(`${file}: the scan read sentences`, () => {
    assert.ok(list.length > 0, `${file} yielded no sentences, so the scan measured nothing`);
  });
  test(`${file} uses plain words and short sentences`, () => {
    const out = problems(file, list);
    assert.deepEqual(out, [], `\n${out.join('\n')}\n(${NEW_HINT})`);
  });
}

test('every APP_COPY sentence is still on its page', () => {
  const files = Object.keys(APP_COPY);
  assert.ok(files.length > 0);
  for (const file of files) {
    for (const s of APP_COPY[file]) {
      assert.ok(SOURCES[file].includes(s), `${file}: APP_COPY entry "${s}" is no longer on the page; delete it`);
    }
  }
});
