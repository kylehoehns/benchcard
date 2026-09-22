import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackedFiles } from '../scripts/spelling.mjs';
import { pngSize } from '../scripts/png-size.mjs';

/* #75: the mark went from ember to Hardwood everywhere it is drawn, and the
 * share image and its meta tags moved from 1200×630 to 2400×1260. Both are
 * the kind of change that is invisible once it is right and silent once it
 * drifts back -- a hand edit that reintroduces one ember hex, or a page whose
 * og:image:width stops matching the file it actually points at, ships and
 * nothing fails until someone notices the preview looks wrong.
 *
 * Three checks, at the seam `docs/specs/75-pages-and-images-after-redesign.md`
 * names them at:
 *   1. no ember hex survives, in app/ (outside vendor/) or in the two scripts
 *      that draw the mark;
 *   2. every page's declared og:image size is the size og.png actually is --
 *      read from the file's own bytes, not a second hardcoded literal, so a
 *      resize that forgets one page fails here even if it also forgot the
 *      hardcoded check in charts.test.js;
 *   3. About and Advanced carry none of the glossary's retired words for
 *      item 6 -- Team tab, ledger, a floor/ceiling for a rule, the old
 *      "Balanced"/"Minutes" strategy names, "short names" -- with comments
 *      stripped the same way test/team-tab-copy.test.js strips them, so a
 *      developer note recording the fix is not scored as a re-offense. */

const EMBER = [/#E14E12/i, /#C33F08/i, /#FFF3EC/i];

test('no ember hex survives under app/ (outside vendor) or in scripts/og.mjs and scripts/charts.mjs', () => {
  const files = trackedFiles().filter(f =>
    (f.startsWith('app/') && !f.startsWith('app/vendor/')) ||
    f === 'scripts/og.mjs' || f === 'scripts/charts.mjs');
  assert.ok(files.length > 20, `only ${files.length} files scanned; the file list is wrong`);
  const offenders = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const re of EMBER) {
      if (re.test(text)) offenders.push(`${f}: ${re}`);
    }
  }
  assert.deepEqual(offenders, [], `ember hex left behind:\n${offenders.join('\n')}`);
});

/* `pngSize` (scripts/png-size.mjs) is the one IHDR parse -- scripts/og.mjs
   and test/hero-density.test.js read the same function rather than each
   carrying its own copy, for the same reason this test reads it at all: the
   dimensions are the whole claim a page's og:image:width/height makes, so
   read them off the actual file rather than trust a second copy of the
   number. */
const OG_BYTES = readFileSync(new URL('../app/og.png', import.meta.url));
const OG = pngSize(OG_BYTES, 'app/og.png');
const PAGES = ['index.html', 'about.html', 'advanced.html',
  '7-player-basketball-rotation-chart.html', '8-player-basketball-rotation-chart.html',
  '9-player-basketball-rotation-chart.html', '10-player-basketball-rotation-chart.html',
  '11-player-basketball-rotation-chart.html', '12-player-basketball-rotation-chart.html'];

/* #75 item 3 / Design step 3: og.png is captured sharp (DPR 2 composition,
   DPR 3 phone) rather than downscaled or recompressed lossy to hit a byte
   budget. The reference render the human approved was 213 KB flat; 300 KB is
   the ceiling `docs/specs/75-pages-and-images-after-redesign.md`'s "What
   would settle it" item 3 sets, reachable without either trick. */
test('app/og.png is at most 300 KB', () => {
  assert.ok(OG_BYTES.length <= 300 * 1024,
    `app/og.png is ${(OG_BYTES.length / 1024).toFixed(1)} KB, over the 300 KB budget`);
});

test('every page\'s og:image:width/height is the size app/og.png actually is', () => {
  assert.ok(OG.w > 0 && OG.h > 0, 'app/og.png did not parse as a PNG');
  for (const name of PAGES) {
    const page = readFileSync(new URL(`../app/${name}`, import.meta.url), 'utf8');
    const w = page.match(/<meta property="og:image:width" content="(\d+)">/);
    const h = page.match(/<meta property="og:image:height" content="(\d+)">/);
    assert.ok(w, `${name} has no og:image:width meta`);
    assert.ok(h, `${name} has no og:image:height meta`);
    assert.equal(Number(w[1]), OG.w, `${name} claims og:image:width ${w[1]}, but app/og.png is ${OG.w} wide`);
    assert.equal(Number(h[1]), OG.h, `${name} claims og:image:height ${h[1]}, but app/og.png is ${OG.h} tall`);
  }
});

test('every page\'s og:image:alt and twitter:image:alt are the same text', () => {
  const alts = PAGES.map(name => {
    const page = readFileSync(new URL(`../app/${name}`, import.meta.url), 'utf8');
    const og = page.match(/<meta property="og:image:alt" content="([^"]*)">/);
    const tw = page.match(/<meta name="twitter:image:alt" content="([^"]*)">/);
    assert.ok(og, `${name} has no og:image:alt meta`);
    assert.ok(tw, `${name} has no twitter:image:alt meta`);
    assert.equal(og[1], tw[1], `${name}: og:image:alt and twitter:image:alt disagree`);
    return { name, alt: og[1] };
  });
  const [first, ...rest] = alts;
  for (const a of rest) {
    assert.equal(a.alt, first.alt, `${a.name}'s alt text does not match ${first.name}'s`);
  }
});

/* Comments dropped first, the same rule test/team-tab-copy.test.js states for
   the same reason: a developer note recording the fix ("no more 'Team tab'
   here") is prose about the code, not text a coach reads, and would
   false-positive this guard if left in. */
function stripComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/* CONTEXT.md's own `_Avoid_:` lines, parsed rather than retyped -- the spec
   (`docs/specs/75-pages-and-images-after-redesign.md`, Constraints) says not
   to re-derive the avoided words by hand. Each line sits right under a term
   heading ("**Card name**:") and lists its retired words, comma-separated,
   sometimes with a parenthetical qualifier ("Minutes (as a strategy name)").
   Returns { term -> [phrase, ...] }, parenthetical stripped. */
function parseGlossaryAvoid(md) {
  const out = {};
  let term = null;
  for (const line of md.split('\n')) {
    const heading = line.match(/^\*\*([^*]+)\*\*.*:$/);
    if (heading) { term = heading[1].trim(); continue; }
    const avoid = line.match(/^_Avoid_:\s*(.+)$/);
    if (avoid && term) {
      out[term] = avoid[1].split(',')
        .map((p) => p.replace(/\([^)]*\)/g, '').trim())
        .filter(Boolean);
    }
  }
  return out;
}

const AVOID_BY_TERM = parseGlossaryAvoid(readFileSync(new URL('../CONTEXT.md', import.meta.url), 'utf8'));

/* Item 6 names eight glossary terms whose retired words must not survive on
   About or Advanced: the season's old word, the league minimum's old phrase,
   the two retired strategy names, Card name's old words, and the three rule
   names' old phrasing. CONTEXT.md carries about seventy more `_Avoid_` lines
   for screens this change does not touch, and most of those ("out", "list",
   "history") are ordinary English that would false-positive on real
   About/Advanced prose if banned wholesale -- confirmed by grepping the pages
   for every phrase below before picking this set. So TERMS is item 6's own
   selection, not a re-derivation of it; every phrase it pulls in still comes
   from CONTEXT.md's text rather than a second hand-typed list. */
const TERMS = ['Season', 'League minimum', 'Even', 'By hand', 'Card name', 'Together', 'Apart', 'One of two on'];

/* Two phrases from that selection are still too common to ban bare, found the
   same way: "Minutes" (case-insensitively) matches the ordinary word
   "minutes" throughout both pages' real copy -- CONTEXT.md's own parenthetical
   scopes it "(as a strategy name)", and the four strategies are each their own
   `<h3>` heading on these pages, so that is the check. "pair" matches the One
   of two on rule's own legitimate copy ("a pair you never want resting at the
   same time") -- the phrase item 6 actually retires is "play together", which
   Together's own `_Avoid_` line lists separately, so "pair" is dropped rather
   than banned bare. */
const PHRASE_OVERRIDE = { Minutes: /<h3>\s*Minutes\s*<\/h3>/i };
const PHRASE_DROP = new Set(['pair']);

const AVOID = TERMS.flatMap((term) => (AVOID_BY_TERM[term] || [])
  .filter((phrase) => !PHRASE_DROP.has(phrase))
  .map((phrase) => PHRASE_OVERRIDE[phrase]
    || new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')));

assert.ok(AVOID.length >= 10, `only ${AVOID.length} avoided phrases parsed from CONTEXT.md; the parser broke`);

for (const page of ['about.html', 'advanced.html']) {
  test(`${page} carries none of the glossary's retired words for item 6`, () => {
    const text = stripComments(readFileSync(new URL(`../app/${page}`, import.meta.url), 'utf8'));
    const hits = AVOID.filter(re => re.test(text)).map(re => re.toString());
    assert.deepEqual(hits, [], `${page} still carries: ${hits.join(', ')}`);
  });
}
