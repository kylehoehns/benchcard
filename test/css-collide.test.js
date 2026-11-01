import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CHARTS } from '../scripts/charts.mjs';
import { linkedSheets, inlineSheets } from './page-sheets.js';

/* The same class name, defined by two stylesheets that meet on one page.
 *
 * This is the one class of CSS defect none of the `dead-*` guards can see, and
 * the reason is structural: `dead-class.test.js` builds its rule set by
 * `[...sheets.map(read), ...inline].join('\n')` -- every sheet flattened into
 * one blob. A colliding name is therefore "styled" and "emitted" in both
 * directions and reads green everywhere, while at runtime the later sheet
 * silently overwrites whatever the earlier one set. Nothing is unused; the
 * wrong rule simply wins.
 *
 * It has already come within one commit of shipping: a `.cols` rule was nearly
 * added to a second sheet, which would have replaced `display: grid` on the
 * whole app shell. And `about.html`'s inline sheet reuses nine `card.css`
 * names (`nm`, `stint`, `newper`, `chg`, `clk`, `io`, `start`, `five`,
 * `fresh`) and is safe only because that page does not link `card.css` -- the
 * day it does, nine rules change meaning. Both are caught here, because the
 * check is per PAGE: it asks which sheets a page actually loads, and only
 * compares those.
 *
 * The 2026-08-24 sweep that produced this file found four collisions, all on
 * `index.html`, all `app.css` against `card.css`, and one of them dead: the
 * bare `.stage { position: relative; }` at app.css:997 set exactly what
 * card.css:13 sets from a later sheet, so deleting it changed nothing. Proved
 * in a browser both ways -- with app.css's rule deleted from the CSSOM
 * `#sheet` still computed `relative`; with card.css's deleted too it computed
 * `static`. The three that remain are name-only: a live probe across the
 * games, roster and season views found no element matching selectors from both
 * sheets for `.clk` (72 elements), `.nm` (339) or `.when` (6).
 *
 * Deliberately name-level, not property-level. Whether two rules can ever land
 * on the same element is not decidable from the sheets alone -- it took a
 * browser to settle the three below. What is decidable, and what the near-miss
 * needed, is "two sheets on this page both have opinions about this name",
 * which is a question worth answering out loud each time.
 */

const ROOT = new URL('../app/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

/* Collisions that are real and fine, keyed `class sheetA|sheetB`. Each needs
 * the reason on the line: the point of the list is that a new entry cannot be
 * added without someone saying why the two rules never meet. */
const ALLOWED = new Map([
  // `td.clk` is the plan table's clock column; `.chg .clk` is the printed
  // change line. No element carries both -- checked in a live DOM.
  ['clk app.css|card.css', 'plan-table column vs. printed change line'],
  // `.plr .nm` / `.tl-lab .nm` / `.tl-skel .nm` are roster and timeline
  // labels; `.five .nm.fresh` is a name on the card.
  ['nm app.css|card.css', 'roster and timeline labels vs. a name on the card'],
  // card.css owns `.stage` as an object; app.css only adds the empty state.
  ['stage app.css|card.css', 'card.css owns the stage; app.css adds `.stage.blank`'],
  // `.gm-p.fresh .nm` is a just-on bench floor row (#147); `.five .nm.fresh`
  // is a name on the printed card's starting five. No element carries both.
  ['fresh app.css|card.css', 'a just-on bench floor row vs. a name on the printed card'],
  /* #434: the timeline rules moved out of app.css into timeline.css, and
     these are the pairs they leave behind on index.html, which were
     app.css's own entries while the rules still lived there. */
  // `.tl-lab .nm` is the timeline's label; `.plr .nm`, `.srow .nm` are roster
  // and Team-page rows; `.five .nm.fresh` is a name on the card.
  ['nm app.css|timeline.css', 'timeline label vs. roster and Team-page row names'],
  ['nm timeline.css|card.css', 'timeline label vs. a name on the printed card'],
  // `.tl-lab .dot` is the timeline's player dot; `.srow .nm .dot` and
  // `.dayrow .nm .dot` are the Team page's and day list's own dots.
  ['dot app.css|timeline.css', 'timeline player dot vs. the Team page and day-list dots'],
  // `.tld-f .v` is a fact in the timeline's pinned-player card; `.srow .v` is
  // a Team-page slider row's value. Different elements.
  ['v app.css|timeline.css', 'pinned-player fact vs. a Team-page slider value'],
  // Same element, additive on purpose: timeline.css owns the close button's
  // look, and app.css's coarse-pointer block lists it with `.gm-x` and
  // `.bsheet-close` to give all three the same 48px floor.
  ['tld-x app.css|timeline.css', 'the close button\'s look vs. the shared 48px touch floor'],
  /* The public pages: a page-only rule that adds to one shared (site.css)
     class, which is the point of keeping it inline. */
  // about.html: the last paragraph in a box loses its bottom margin there
  // only; Advanced's boxes keep it.
  ['box site.css|inline:about.html', 'About-only `.box p:last-child`; Advanced keeps the margin'],
  // about.html: the reveal choreography lands the artefact a beat late.
  ['plate site.css|inline:about.html', 'About-only reveal delay on the shared plate'],
  // 404.html: the wordmark sits in `.wrap` here, with no top bar around it,
  // so it carries the top padding the bar would; and its heading has its own
  // bottom margin and wrap rule.
  ['wrap site.css|inline:404.html', '404-only: the heading sits directly in .wrap'],
  ['mark site.css|inline:404.html', '404-only: the wordmark has no top bar, so it carries its own top padding'],
]);

/* Every stylesheet a page loads, in cascade order: the linked local sheets in
 * document order, then its inline `<style>` blocks (which come after the links
 * on every page here, and win a specificity tie because of it). */
function sheetsOf(page) {
  const html = read(page);
  const out = [];
  for (const f of linkedSheets(html)) out.push({ name: f, css: read(f) });
  const inline = inlineSheets(html).join('\n');
  if (inline.trim()) out.push({ name: `inline:${page}`, css: inline });
  return out;
}

/* Class names in SELECTOR position only. Taking every `.name` in the file
 * would also pick up class names quoted inside `content:` and would make the
 * allowlist meaningless. A selector list is the run of text before a `{` at
 * the top of a block; `@media`/`@supports` wrappers are skipped, and their
 * nested rules are matched on the next pass of the same regex. */
function classesOf(css) {
  const found = new Map();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of clean.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].split(';').pop().trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@')) continue;
    for (const c of sel.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) {
      if (!found.has(c[1])) found.set(c[1], []);
      if (!found.get(c[1]).includes(sel)) found.get(c[1]).push(sel);
    }
  }
  return found;
}

function collisionsOn(page) {
  const sheets = sheetsOf(page).map((s) => ({ ...s, classes: classesOf(s.css) }));
  const hits = [];
  const owners = new Map();
  for (const s of sheets) {
    for (const c of s.classes.keys()) owners.set(c, [...(owners.get(c) || []), s]);
  }
  for (const [c, ss] of owners) {
    if (ss.length < 2) continue;
    for (let i = 0; i < ss.length; i++) {
      for (let j = i + 1; j < ss.length; j++) {
        hits.push({
          key: `${c} ${ss[i].name}|${ss[j].name}`,
          detail: `${ss[i].name}: ${ss[i].classes.get(c).slice(0, 3).join(', ')}`
            + `  ||  ${ss[j].name}: ${ss[j].classes.get(c).slice(0, 3).join(', ')}`,
        });
      }
    }
  }
  return hits;
}

test('no class name is defined by two stylesheets that meet on the same page', () => {
  const unexpected = [];
  for (const page of PAGES) {
    for (const hit of collisionsOn(page)) {
      if (!ALLOWED.has(hit.key)) unexpected.push(`${page}: .${hit.key}  --  ${hit.detail}`);
    }
  }
  assert.deepEqual(
    unexpected, [],
    'a class name is styled by two sheets on one page, so the later sheet wins '
    + 'silently. Rename one, move the rule, or add it to ALLOWED with the reason.',
  );
});

test('the allowlist cannot rot: every entry is still a live collision', () => {
  const live = new Set();
  for (const page of PAGES) for (const hit of collisionsOn(page)) live.add(hit.key);
  for (const key of ALLOWED.keys()) {
    assert.ok(live.has(key), `ALLOWED lists "${key}" but the two sheets no longer collide on it`);
  }
});

test('the sweep can actually see a stylesheet, and the graph is what we think', () => {
  // Without this the two tests above pass on an empty set the moment the
  // `<link>` shape changes. It also pins the trap: `about.html` reuses nine
  // card.css names and is safe only while it does not link card.css.
  const graph = Object.fromEntries(PAGES.map((p) => [p, sheetsOf(p).map((s) => s.name)]));
  assert.deepEqual(graph['index.html'], ['tokens.css', 'app.css', 'timeline.css', 'card.css', 'inline:index.html']);
  assert.deepEqual(graph['about.html'], ['tokens.css', 'site.css', 'timeline.css', 'inline:about.html']);
  /* The same trap, and the same protection: `advanced.html` reuses `.paper`,
     `.stint`, `.chg`, `.five` and `.nm` from the printed card and is safe only
     while it does not link `card.css` either. */
  assert.deepEqual(graph['advanced.html'], ['tokens.css', 'site.css', 'inline:advanced.html']);
  for (const { file: p } of CHARTS) {
    // the inline block is the one-line <noscript> print rule, nothing else (#434)
    assert.deepEqual(graph[p], ['tokens.css', 'card.css', 'site.css', `inline:${p}`],
      `${p} loads an unexpected set of stylesheets`);
  }
  /* `404.html` links its sheet root-relative (`/tokens.css`), since it is
     served at any depth, so `sheetsOf` reads both spellings (#424). It must
     see tokens.css there, or this page's sweep would measure nothing. */
  assert.deepEqual(graph['404.html'], ['tokens.css', 'site.css', 'inline:404.html']);
  /* index, about, advanced, 404, and every page scripts/charts.mjs generates. */
  assert.equal(PAGES.length, 4 + CHARTS.length, `expected ${4 + CHARTS.length} static pages, found ${PAGES.length}`);
  // and the parser really does read rules out of a real sheet
  assert.ok(classesOf(read('card.css')).has('card'), 'card.css should define .card');
});
