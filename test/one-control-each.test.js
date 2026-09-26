import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* #141 ("What would settle it" item 6): one guard for the three absence/shape
 * rules the ticket decides -- a `.wel-seg` rule or class must not come back
 * (item 1), `danger sm` must not come back and every remove action must be a
 * `.prow-danger` row (item 2). Comments are stripped first, the way
 * `test/help-deeplink.test.js` does, so a comment that still SAYS
 * "wel-seg" or "danger sm" (this repo narrates its own history in comments)
 * cannot be mistaken for the thing coming back. */

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripHtml = s => s.replace(/<!--[\s\S]*?-->/g, ' ');

const html = stripHtml(read('app/index.html'));
const css = stripCss(read('app/app.css'));

const APP_JS_FILES = readdirSync(new URL('app/', ROOT)).filter(f => f.endsWith('.js'));
const jsSources = APP_JS_FILES.map(f => ({ file: f, src: stripCss(read(`app/${f}`)) }));

test('no .wel-seg rule or class comes back', () => {
  assert.doesNotMatch(css, /\.wel-seg\b/, 'app.css still has a .wel-seg or .wel-seg-b rule');
  assert.doesNotMatch(html, /wel-seg/, 'app/index.html still names wel-seg on an element');
  for (const { file, src } of jsSources) {
    assert.doesNotMatch(src, /wel-seg/, `app/${file} still names wel-seg`);
  }
});

test('"danger sm" does not come back on any button', () => {
  // Static markup: every class="..." attribute.
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    const classes = m[1].split(/\s+/);
    assert.ok(
      !(classes.includes('danger') && classes.includes('sm')),
      `app/index.html has a button classed "${m[1]}" -- danger sm is gone from remove actions`,
    );
  }
  // Rows built with el('button', 'classes', text) in app/*.js.
  for (const { file, src } of jsSources) {
    for (const m of src.matchAll(/el\(\s*'button'\s*,\s*'([^']*)'/g)) {
      const classes = m[1].split(/\s+/);
      assert.ok(
        !(classes.includes('danger') && classes.includes('sm')),
        `app/${file} builds a button classed "${m[1]}" -- danger sm is gone from remove actions`,
      );
    }
  }
});

/* A "remove action" is a button whose own text starts with "Remove" or
 * "Delete" (item 6's own definition). `#confirmYes` is excluded by name: the
 * spec (decision 1) keeps it as the one confirm dialog's own button, not a
 * remove action, and its static markup text is "Remove" for exactly that
 * reason. Everything else that starts that way must carry `.prow-danger`. */
function isRemoveText(text) {
  return /^(Remove|Delete)\b/.test(text.trim());
}

test('every remove action in static markup is a .prow-danger row', () => {
  let checked = 0;
  for (const m of html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)) {
    const [, attrs, text] = m;
    if (!isRemoveText(text)) continue;
    const idMatch = attrs.match(/id="([^"]*)"/);
    if (idMatch && idMatch[1] === 'confirmYes') continue;
    checked++;
    const classAttr = (attrs.match(/class="([^"]*)"/) || [, ''])[1];
    const classes = classAttr.split(/\s+/);
    assert.ok(classes.includes('prow-danger'),
      `app/index.html's "${text.trim()}" button (${idMatch ? '#' + idMatch[1] : 'no id'}) is classed "${classAttr}", not .prow-danger`);
  }
  // Rule 2a: a count of zero means the regex stopped matching, not that
  // every remove action passed.
  assert.ok(checked >= 3, `only found ${checked} remove-action button(s) in app/index.html -- expected at least #removeGame, #removeTeam and #playerRemove`);
});

test('every remove action built in app/*.js is a .prow-danger row', () => {
  let checked = 0;
  for (const { file, src } of jsSources) {
    for (const m of src.matchAll(/el\(\s*'button'\s*,\s*'([^']*)'\s*,\s*(`[^`]*`|'[^']*')\s*[,)]/g)) {
      const [, classAttr, rawText] = m;
      const text = rawText.slice(1, -1); // drop the surrounding quote/backtick
      if (!isRemoveText(text)) continue;
      checked++;
      const classes = classAttr.split(/\s+/);
      assert.ok(classes.includes('prow-danger'),
        `app/${file} builds "${text}" classed "${classAttr}", not .prow-danger`);
    }
  }
  assert.ok(checked >= 3, `only found ${checked} remove-action button(s) built in app/*.js -- expected at least "Remove rule", "Remove unit N" and Season's remove button`);
});
