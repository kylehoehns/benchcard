import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* EVERY <summary> THIS SITE STYLES CARRIES `touch-action: manipulation`.
 *
 * A47. `app.css` gave `button` both `-webkit-tap-highlight-color: transparent`
 * and `touch-action: manipulation` from the start, and a <summary> is not a
 * button, so the disclosure rows in the app shell and the eight FAQ rows
 * on `about.html` had neither. On iOS that means the platform's own tap
 * highlight paints -- which is what the reporter photographed on "Enter my
 * team" -- and, worse, Safari holds the tap open to see whether a
 * double-tap-to-zoom follows before it activates the control. Highlight now,
 * activation later, so the coach taps again.
 *
 * The reason this is a guard and not a one-line fix left to stand on its own:
 * it was already the fourth summary to arrive bare, and `.fold > summary` had
 * had the tap-highlight half hand-written on it for weeks -- the same fix
 * applied by hand, in one place, without anyone asking why it kept being
 * needed. A fifth will arrive the same way unless something asks.
 *
 * DELIBERATELY STRUCTURAL, NOT `css.includes`. The check parses TOP-LEVEL
 * rules and reads the declarations inside the matched block, because a string
 * being present in a stylesheet never proves a rule applies: an `app.css`
 * comment that closed early once swallowed a whole rule while `npm test` stayed
 * green. It requires the selector to be a bare `summary` (a selector that
 * matches every summary on the page, not one class of them) and requires the
 * rule to be unconditional -- a declaration inside `@media print` is not a
 * declaration a thumb ever meets.
 *
 * `manipulation` gives up double-tap-to-zoom and keeps panning and pinch zoom,
 * so it is right on a control and would be wrong wrapping scrollable or
 * zoomable content. Every summary on this site is a label row; if one ever
 * wraps something a reader zooms into, this guard is the thing to argue with.
 */

const ROOT = new URL('../app/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html'));

const REQUIRED = [
  ['touch-action', 'manipulation'],
  ['-webkit-tap-highlight-color', 'transparent'],
];

/* Every stylesheet a page loads: linked local sheets in document order, then
 * its inline `<style>` blocks. Same shape as `css-collide.test.js`, which is
 * the other guard that has to know which sheets meet on which page. */
function sheetsOf(page) {
  const html = read(page);
  const out = [];
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\.\/([\w.-]+\.css)"/g)) {
    out.push({ name: m[1], css: read(m[1]) });
  }
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  if (inline.trim()) out.push({ name: `inline:${page}`, css: inline });
  return out;
}

/* Top-level rules only, as `{selector, body}`. Walking the braces rather than
 * regexing `([^{}]+)\{` is what makes "unconditional" decidable: anything
 * inside an `@media`/`@supports`/`@container` block is at depth 1 and is not
 * returned. */
export function topLevelRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rules = [];
  let depth = 0, start = 0;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '{') {
      if (depth === 0) {
        const sel = clean.slice(start, i).trim().replace(/\s+/g, ' ');
        const from = i + 1;
        let d = 1, j = i + 1;
        for (; j < clean.length && d > 0; j++) {
          if (clean[j] === '{') d++;
          else if (clean[j] === '}') d--;
        }
        if (sel && !sel.startsWith('@')) rules.push({ sel, body: clean.slice(from, j - 1) });
      }
      depth++;
    } else if (clean[i] === '}') {
      depth--;
      if (depth === 0) start = i + 1;
    } else if (depth === 0 && clean[i] === ';') {
      start = i + 1;
    }
  }
  return rules;
}

const declares = (body, prop, value) =>
  body.split(';').some((d) => {
    const [p, ...rest] = d.split(':');
    return p && p.trim() === prop && rest.join(':').trim().replace(/\s*!important$/, '') === value;
  });

/* A selector that matches EVERY summary on the page: the bare element, alone
 * or in a selector list. `.qa summary` matches some of them and is not enough
 * to answer the question this guard asks. */
const coversEverySummary = (sel) =>
  sel.split(',').some((s) => s.trim() === 'summary');

function summaryCoverOn(page) {
  const missing = [];
  for (const [prop, value] of REQUIRED) {
    const ok = sheetsOf(page).some((sheet) =>
      topLevelRules(sheet.css).some((r) => coversEverySummary(r.sel) && declares(r.body, prop, value)));
    if (!ok) missing.push(`${prop}: ${value}`);
  }
  return missing;
}

/* HTML comments explain several of these rows at length and say `<summary>`
 * while doing it, and so does a CSS comment inside `about.html`'s own sheet --
 * that one cost a red run on the first try. Comments, `<style>` and `<script>`
 * all come out before anything is counted. */
const summaryCount = (page) =>
  (read(page)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/g, ' ')
    .match(/<summary[\s>]/g) || []).length;

const pagesWithSummaries = () => PAGES.filter((p) => summaryCount(p) > 0).sort();

test('every page with a <summary> styles all of them with touch-action: manipulation', () => {
  const bare = [];
  for (const page of pagesWithSummaries()) {
    const missing = summaryCoverOn(page);
    if (missing.length) bare.push(`${page} (${summaryCount(page)} summaries) lacks ${missing.join(' and ')}`);
  }
  assert.deepEqual(bare, [],
    'a <summary> ships without the two declarations `button` has carried from the start. '
    + 'On iOS that is the platform tap highlight plus a held tap while Safari waits for a '
    + 'double-tap-to-zoom, which the coach experiences as "it needs two taps" (A47). Add '
    + '`summary { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }` to '
    + "a sheet that page loads — not to one class of summary, which is how this bug got here.");
});

test('the rule it was copied from is still there, on button', () => {
  // If `button` ever loses these, the summary rule stops being "the same two
  // declarations" and this guard is measuring half a decision.
  const btn = topLevelRules(read('app.css')).find((r) => r.sel === 'button');
  assert.ok(btn, 'app.css no longer has a bare `button` rule');
  for (const [prop, value] of REQUIRED) {
    assert.ok(declares(btn.body, prop, value), `app.css's button rule no longer sets ${prop}: ${value}`);
  }
});

test('the guard can see the pages it claims to, and its parser is not lying', () => {
  /* Pin the LIST, not a count: a page that stops being scanned would otherwise
     read as a page with nothing to find. */
  assert.deepEqual(pagesWithSummaries(), ['about.html', 'index.html'],
    'the set of pages carrying a <summary> changed; the new one needs the rule too');
  // Seven since A49, which deleted the welcome screen's "Enter my team"
  // disclosure -- the eighth, and the one A47 was reported against.
  assert.equal(summaryCount('index.html'), 7, 'the app shell no longer has seven summaries');
  assert.equal(summaryCount('about.html'), 8, 'about.html no longer has eight FAQ rows');

  // The parser really does read a real rule out of a real sheet...
  const rules = topLevelRules(read('app.css'));
  assert.ok(rules.some((r) => r.sel === 'summary'), 'app.css has no top-level `summary` rule');
  assert.ok(rules.some((r) => r.sel === '[hidden]' && declares(r.body, 'display', 'none !important')
    || r.sel === '[hidden]'), 'app.css lost its [hidden] rule, so the parser found nothing familiar');

  // ...and it refuses the three shapes that would make this guard fake.
  assert.equal(topLevelRules('@media print { summary { touch-action: manipulation; } }').length, 0,
    'a rule inside @media is being counted as unconditional');
  assert.ok(!coversEverySummary('.qa summary, .fold > summary'),
    'a selector matching SOME summaries is being read as matching all of them');
  assert.ok(!declares('touch-action: pan-y', 'touch-action', 'manipulation'),
    'the declaration reader matches on the property and ignores the value');
  assert.ok(declares('a: b; touch-action:manipulation', 'touch-action', 'manipulation'),
    'the declaration reader cannot see a declaration without spaces around the colon');
});
