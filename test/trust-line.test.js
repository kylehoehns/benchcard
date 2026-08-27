/* The privacy claim, pinned to ONE wording.
 *
 * `test/analytics.test.js` guards the other half of this sentence: it BANS four
 * absolute phrasings ("nothing is uploaded", and friends) because the site
 * counts anonymous usage and those sentences would be false. This file guards
 * the opposite failure, which that one cannot see: the claim being TRUE
 * everywhere and WORDED differently in different places.
 *
 * That is not a style complaint. Two wordings of a trust claim is two claims,
 * and a reader who meets both has to decide which one the product means. It is
 * also how the narrow version rots: nobody edits five sentences in step, so one
 * of them eventually widens, and the widened one is the one that is false.
 *
 * WHY A GUARD AND NOT JUST A FIX. What made the drift possible is that nothing
 * asserted a single form existed. Correct the strings alone and the next
 * surface someone adds says it whichever way they happened to copy. The strings
 * are the perishable half of this change; this file is the durable half.
 *
 * The canonical form is the SHORTER one, and it was already in use in three
 * places before this file existed. "Your roster and your players" names one
 * noun twice -- a roster is the players -- so standardising on the short form
 * is a delete rather than a rewrite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const APP = new URL('../app/', import.meta.url);
const read = f => readFileSync(new URL(f, APP), 'utf8');

const CANONICAL = 'your roster never leaves your device';
/* Every wording this claim has ever taken here, canonical one excepted. A
   variant is listed rather than matched by pattern on purpose: a regex loose
   enough to catch "roster and your players" is loose enough to catch the
   canonical form too, and a guard that cannot tell its target from its goal is
   not a guard. */
const VARIANTS = [
  'your roster and your players never leave your device',
];

const htmlFiles = readdirSync(APP).filter(f => f.endsWith('.html'));

/* Sources that can state the claim to a reader: every served page, plus the
   generator that writes six of them, plus every module string. */
const SURFACES = [
  ...htmlFiles.map(f => ({ name: `app/${f}`, text: read(f) })),
  { name: 'scripts/charts.mjs', text: readFileSync(new URL('../scripts/charts.mjs', import.meta.url), 'utf8') },
];

test('no surface states the claim in a form other than the canonical one', () => {
  const offenders = [];
  for (const { name, text } of SURFACES) {
    const flat = text.replace(/\s+/g, ' ').toLowerCase();
    for (const variant of VARIANTS) {
      if (flat.includes(variant)) offenders.push(`${name}: "${variant}"`);
    }
  }
  assert.deepEqual(offenders, [],
    `the privacy claim is worded more than one way. Two wordings of a trust claim is two claims. Standardise on "${CANONICAL}":\n  ` + offenders.join('\n  '));
});

test('the generator emits the canonical form, or the six chart pages drift back', () => {
  const charts = readFileSync(new URL('../scripts/charts.mjs', import.meta.url), 'utf8')
    .replace(/\s+/g, ' ').toLowerCase();
  assert.ok(charts.includes(CANONICAL),
    'scripts/charts.mjs does not emit the canonical claim. Editing the six generated pages by hand is undone by the next `npm run charts`, so the generator is the only place this can be fixed.');
});

test('the claim still appears at all, so standardising cannot become deleting', () => {
  const stating = SURFACES.filter(({ text }) =>
    text.replace(/\s+/g, ' ').toLowerCase().includes(CANONICAL));
  assert.ok(stating.length >= 4,
    `only ${stating.length} surface(s) state the claim. It is the product's central trust promise; making the wording consistent must not quietly remove it.`);
});

/* The narrowness is analytics.test.js's job and is not re-checked here -- one
   answer, one place. What IS checked is that the two guards still agree on
   which sentence they are talking about: if the canonical form ever drifted
   into something analytics.test.js bans, this file would happily pin a false
   claim everywhere. */
test('the canonical form is not one of the absolutes the other guard bans', () => {
  const banned = ['nothing is uploaded', 'nothing leaves your device', 'nothing ever leaves'];
  for (const phrase of banned) {
    assert.ok(!CANONICAL.includes(phrase),
      `the canonical claim contains "${phrase}", which analytics.test.js bans as false — the site counts anonymous usage`);
  }
});
