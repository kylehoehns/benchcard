import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, KEEP, SURFACES, read, covered, shipped, chunksOf, textOf }
  from '../scripts/feature-keys.mjs';

/* The two reference surfaces have to name the same features (A20 slice 1).
 *
 * There are three help surfaces, not one: `#tour` (four first-run coach-marks),
 * `#help` (the in-app sheet) and `about.html` (the public page). A19 measured
 * what that costs -- `keepon` shipped and was named in `rules.js` and nowhere
 * else; the whole three-scope bench vocabulary was undocumented; the league
 * minimum was on `about.html` and nowhere in the app. Four gaps, one cause:
 * two reference surfaces and no way to know they disagree.
 *
 * So this pins the FEATURE LIST -- `scripts/feature-keys.mjs` -- and not the
 * prose. Each key carries the phrasings that count as NAMING it, and a surface
 * may say anything it likes around them. Generating one surface from the other
 * was considered and rejected (the public page is meant to be fuller), and so
 * was shrinking `#help`, which is the offline story the app is built on.
 *
 * Two directions, because coverage can rot from either end:
 *   1. a pinned feature that a surface never names -- the A19 gap;
 *   2. a feature the APP ships that is not pinned here at all -- which is how
 *      A19 happened in the first place. `shipped()` reads the app's own lists,
 *      so a fifth strategy or an eighth rule kind goes red until it is on the
 *      list, and therefore until it is on both surfaces.
 *
 * Direction 2 is also what stops direction 1 passing on an empty set.
 *
 * `#tour` is deliberately out of scope: four first-run coach-marks are not a
 * reference, and holding them to the full list would gut them. The six
 * generated roster-size pages are marketing, not documentation.
 *
 * `scripts/feature-mutate.mjs` proves this can fail, key by key and surface by
 * surface. Run it after touching the list -- a phrasing that survives having
 * its name deleted is an ordinary English word, not a name.
 */

test('every pinned feature is named on both reference surfaces', () => {
  const gaps = [];
  for (const name of Object.keys(SURFACES)) {
    const html = read(name);
    for (const f of FEATURES) {
      if (KEEP.has(`${name} ${f.key}`)) continue;
      if (!covered(html, f)) {
        gaps.push(`${name}: ${f.key} (${f.src}) -- names none of `
          + JSON.stringify([...(f.term || []), ...(f.text || [])]));
      }
    }
  }
  assert.deepEqual(gaps, [],
    'the app ships it and this surface never names it -- document it, or add '
    + 'it to KEEP with the reason:\n  ' + gaps.join('\n  '));
});

test('every KEEP entry is still a real, still-uncovered omission', () => {
  /* The allowlist's own rot check, in the `css-collide` idiom. A KEEP line is
     a promise that a coach can find the feature elsewhere, so it has to keep
     costing something to write: an entry naming a surface or a key that no
     longer exists is a typo nobody would notice, and an entry for a key the
     surface DOES name again is a hole the guard would stop reporting. Both
     fail here. */
  const keys = new Set(FEATURES.map((f) => f.key));
  const stale = [];
  for (const [entry, why] of KEEP) {
    const at = entry.indexOf(' ');
    const [name, key] = [entry.slice(0, at), entry.slice(at + 1)];
    if (!SURFACES[name]) { stale.push(`${entry}: no such surface`); continue; }
    if (!keys.has(key)) { stale.push(`${entry}: no such feature key`); continue; }
    assert.ok(why && why.trim().length > 10, `KEEP entry "${entry}" has no reason on the line`);
    const f = FEATURES.find((x) => x.key === key);
    if (covered(read(name), f)) stale.push(`${entry}: ${name} names it again — delete the entry`);
  }
  assert.deepEqual(stale, [],
    'KEEP has entries that are no longer true:\n  ' + stale.join('\n  '));
});

test('the app ships exactly the features this list pins', () => {
  const ship = shipped();
  const pinned = (prefix) => FEATURES
    .filter((f) => f.key.startsWith(prefix + ':'))
    .map((f) => f.ships || f.key.slice(prefix.length + 1)).sort();

  assert.deepEqual(ship.strategy.sort(), pinned('strategy'),
    'a strategy in `STRATEGIES` that the list does not pin is a strategy nobody has to document');
  assert.deepEqual(ship.shape.sort(), pinned('shape'), 'balance.js SHAPES has moved');
  assert.deepEqual(ship.rule.sort(), pinned('rule'),
    'rules.js KINDS has moved -- this is the exact shape of the `keepon` gap A19 found');
  assert.deepEqual(ship.bench.sort(), pinned('bench'), 'the bench scopes in gamemode.js have moved');
  assert.deepEqual(ship.card.sort(), pinned('card'),
    '#cardSize offers a size the docs are not required to name');
});

test('the surfaces are the ones this test means, and comments are not text', () => {
  const help = textOf(read('#help'));
  const about = textOf(read('about.html'));

  assert.ok(help.includes('how this works'), '#help should be sliced from its own title');
  assert.ok(!help.includes('keyboard shortcuts'), 'the #help slice should stop before #keys');
  assert.ok(help.length > 3000, `#help reads as ${help.length} chars -- the slice has collapsed`);
  assert.ok(about.length > 8000, `about.html reads as ${about.length} chars`);

  /* Both of these sentences exist ONLY inside an HTML comment. If either shows
   * up, every check above can be satisfied by a note to the next developer
   * instead of by a word a coach reads. */
  assert.ok(!help.includes('static markup on purpose'),
    'a comment in #help is being read as page text');
  assert.ok(!about.includes('deliberately not in the list above'),
    'a comment in about.html is being read as page text');

  /* The third surface, added with the page in A20 slice 2. Same two questions:
   * is it really being read, and is its own explanation being read as if a
   * coach could see it. */
  const advanced = textOf(read('advanced.html'));
  assert.ok(advanced.length > 6000, `advanced.html reads as ${advanced.length} chars`);
  assert.ok(advanced.includes('the four ways to split a game'),
    'advanced.html should be read whole, headings included');
  assert.ok(!advanced.includes('there is no new raster asset on this page'),
    'a comment in advanced.html is being read as page text');

  /* And the chunk reader really does isolate a name from the sentence it sits
   * in, which is the whole reason `term` exists. */
  assert.ok(chunksOf('<dt>Play together / Keep apart</dt>').has('keep apart'));
  assert.ok(!chunksOf('<p>a plan that is balanced across the game</p>').has('balanced'));
});
