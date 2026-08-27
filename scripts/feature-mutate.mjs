/* Falsification harness for `test/feature-coverage.test.js` (A20 slice 1).
 *
 * A coverage guard that cannot go red is worse than no guard: it reports that
 * two surfaces agree without ever having checked. So every pinned key is
 * mutated against EACH surface separately -- 2N mutations, not N -- and every
 * one of them has to be caught.
 *
 * Two things this checks that "delete the word and run the test" does not,
 * both of them traps this repo has already been caught by:
 *   1. the mutation has to LAND. A mutation that edits a literal the guard
 *      never reads produces a false green and reads as "the guard is dead", so
 *      the surface is re-read through the guard's own eyes after the edit and
 *      the key must really have stopped being covered before the suite runs.
 *   2. the file has to come back byte-identical.
 *
 * A `term` mutation blanks the name only where the surface NAMES the feature
 * (a heading, a `<dt>`, a bolded label) and leaves every sentence that
 * discusses it in place. That is the faithful version of the A19 gap --
 * `keepon` was working, and described nowhere -- and it is the version most
 * likely to expose a "name" that is really just an ordinary English word.
 *
 * Run: node scripts/feature-mutate.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FEATURES, KEEP, SURFACES, covered, normalise, partsOf, app } from './feature-keys.mjs';

const ROOT = new URL('../', import.meta.url);
const TEST = 'test/feature-coverage.test.js';
const filePath = (f) => new URL(`app/${f}`, ROOT);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mutate(html, feature) {
  let out = '';
  for (const seg of html.split(/(<[^>]+>)/)) {
    if (seg.startsWith('<')) { out += seg; continue; }
    let t = seg;
    for (const term of feature.term || []) {
      if (partsOf(t).includes(term)) t = t.replace(new RegExp(esc(term), 'ig'), 'REDACTED');
    }
    out += t;
  }
  for (const phrase of feature.text || []) {
    out = out.replace(new RegExp(esc(normalise(phrase)), 'ig'), 'REDACTED');
  }
  return out;
}

let ran = 0;
const missed = [], unlanded = [], skipped = [], allowed = [];

for (const [name, s] of Object.entries(SURFACES)) {
  const file = filePath(s.file);
  const original = readFileSync(file, 'utf8');
  for (const f of FEATURES) {
    const before = s.slice(original);
    /* A key this surface deliberately does not name is not a gap and not a
       failure -- there is simply no name here to delete. KEEP carries the
       reason, and `test/feature-coverage.test.js` is what stops a KEEP entry
       going stale. Anything else uncovered still fails the run. */
    if (!covered(before, f)) {
      (KEEP.has(`${name} ${f.key}`) ? allowed : skipped).push(`${name} ${f.key}`);
      continue;
    }
    const after = mutate(before, f);
    if (covered(after, f)) { unlanded.push(`${name} ${f.key}`); continue; }

    writeFileSync(file, s.splice(original, after));
    let red = false, out = '';
    try {
      execFileSync('node', ['--test', TEST], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      red = true;
      out = String(e.stdout || '');
    }
    writeFileSync(file, original);
    if (readFileSync(file, 'utf8') !== original) throw new Error(`did not restore app/${s.file}`);

    ran++;
    if (!red) missed.push(`${name} ${f.key}: the guard stayed GREEN`);
    else if (!out.includes(f.key)) missed.push(`${name} ${f.key}: red, but not for this key`);
    else console.log(`caught  ${name}  ${f.key}`);
  }
}

console.log(`\n${ran} mutations run across ${Object.keys(SURFACES).length} surfaces, `
  + `${FEATURES.length} keys each.`);
if (allowed.length) console.log(`NOT NAMED HERE, ON PURPOSE (KEEP says why, and the guard checks the entry is still true):\n  ${allowed.map((k) => `${k} -- ${KEEP.get(k)}`).join('\n  ')}`);
if (skipped.length) console.log(`NOT COVERED TO BEGIN WITH (fix the docs first):\n  ${skipped.join('\n  ')}`);
if (unlanded.length) console.log(`MUTATION DID NOT LAND, so the guard is unproven here:\n  ${unlanded.join('\n  ')}`);
if (missed.length) console.log(`FALSE GREEN:\n  ${missed.join('\n  ')}`);
process.exit(missed.length || unlanded.length || skipped.length ? 1 : 0);
