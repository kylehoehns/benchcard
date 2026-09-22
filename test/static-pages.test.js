import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trackedFiles } from '../scripts/spelling.mjs';

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

/* PNG: 8 bytes of signature, 8 of chunk header, then width and height as
   big-endian uint32s -- the same minimal parse test/hero-density.test.js
   uses, for the same reason: the dimensions are the whole claim a page's
   og:image:width/height makes, so read them off the actual file rather than
   trust a second copy of the number. */
function pngSize(path) {
  const b = readFileSync(path);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', `${path} is not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const OG = pngSize(new URL('../app/og.png', import.meta.url));
const PAGES = ['index.html', 'about.html', 'advanced.html',
  '7-player-basketball-rotation-chart.html', '8-player-basketball-rotation-chart.html',
  '9-player-basketball-rotation-chart.html', '10-player-basketball-rotation-chart.html',
  '11-player-basketball-rotation-chart.html', '12-player-basketball-rotation-chart.html'];

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

/* The glossary's retired words for item 6 (CONTEXT.md's own `_Avoid_` lines),
   plus the old rule-name headings and phrases they replaced. "floor"/"ceiling"
   are not banned bare -- "five on the floor" is correct basketball copy and
   stays -- only the specific phrases the old minimum/cap copy used. */
const AVOID = [
  /\bledger\b/i,
  /\bceiling\b/i,
  /\bTeam tab\b/,
  /<h3>Balanced<\/h3>/,
  /<h3>Minutes<\/h3>/,
  /\bshort names\b/i,
  /\bnickname\b/i,
  /\bplay together\b/i,
  /\bkeep apart\b/i,
  /\balways one on\b/i,
  /\bnever both off\b/i,
  /\bkeep on floor\b/i,
  /\bminute floors?\b/i,
  /\bfloor for the whole team\b/i,
  /\bholds a floor\b/i,
  /\bguarantees floor time\b/i,
  /\bminutes ceiling\b/i,
];

for (const page of ['about.html', 'advanced.html']) {
  test(`${page} carries none of the glossary's retired words for item 6`, () => {
    const text = stripComments(readFileSync(new URL(`../app/${page}`, import.meta.url), 'utf8'));
    const hits = AVOID.filter(re => re.test(text)).map(re => re.toString());
    assert.deepEqual(hits, [], `${page} still carries: ${hits.join(', ')}`);
  });
}
