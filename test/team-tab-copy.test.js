import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* #22 (spec item 10): every team setting's coach-facing home moved off the
 * Team tab and into Settings, under the team's own name. Two help-sheet
 * paragraphs said "the Team tab" for `minMinutes` and `seasonDefault` and both
 * had to be corrected to "Settings". Out of scope: LEVELS. They still live on
 * the Team page (roster-view.js paints the steps under each player's name),
 * so a sentence that points a coach at the Team page to set levels is still
 * true and must keep passing.
 *
 * So the rule this pins is narrower than "the phrase is gone": it is "the
 * phrase, where it still appears in something a coach reads, is about
 * levels". A blind grep for "Team tab" / "Team page" cannot tell those two
 * apart -- the odd-minutes note and the levels help paragraph both use the
 * words "Team page" today, and only one of them is about a setting. This
 * reads the surrounding sentence and requires the word "level" nearby before
 * it lets a match through.
 *
 * Comments are dropped first, the same rule `analytics.test.js` states for
 * the same reason: a developer note ABOUT the move ("the Team tab holds none
 * of this any more") is prose about the code, not text a coach reads, and
 * this file's own diff carries several. Scoring a comment recording the
 * change would be the guard-scores-its-own-comment mistake written down in
 * AGENTS.md's Judgement section. */

const TEAM_LOC = /\bTeam\s+(tab|page)\b/gi;

/* index.html carries developer prose two ways: `<!-- -->` around markup, and
 * `/* *\/` block comments inside its two inline `<script>` blocks (the
 * pre-paint theme and view scripts) -- one of those, explaining the `roster
 * -> team` view rename, says "Team page" in a sentence about routing, not
 * about where a setting lives, and would false-positive this guard if only
 * the markup-comment syntax were stripped. Both are dropped for the same
 * reason: prose ABOUT the code is not text a coach reads. */
function stripHtmlComments(s) {
  return s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/* A scanner, not a parser -- deliberately cruder than `analytics.test.js`'s
 * `jsStrings`, because all this has to keep apart is a `/* *\/` or `//`
 * comment from real code, not tell a string from a regex too. Verified by
 * hand against every match `git grep -n "Team tab\|Team page" app/*.js` finds
 * on this tree: none sit inside a URL, a regex body or a string that a
 * naive `//` cut would clip early. If that stops being true the assertion
 * below will say so -- a code line, not a comment, will start matching. */
function stripJsComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

test('a Team tab/page mention that survives comment-stripping in index.html is about levels, not a setting', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const visible = stripHtmlComments(html);
  const matches = [...visible.matchAll(TEAM_LOC)];
  assert.ok(matches.length > 0,
    'no match at all found nothing to discriminate -- levels help copy moved or was reworded; ' +
    'check this guard is still reading something before trusting it');
  for (const m of matches) {
    const before = visible.slice(Math.max(0, m.index - 200), m.index);
    assert.match(before, /level/i,
      `index.html: "${m[0]}" near "${before.slice(-80)}" is not about levels -- ` +
      'a team setting may be pointing a coach at the old Team tab/page location');
  }
});

test('no app/*.js code (comments dropped) still names the Team tab/page as where a setting lives', () => {
  const dir = new URL('../app/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 30, `only ${files.length} JS files found; scanning the wrong place`);
  for (const f of files) {
    const raw = readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
    const code = stripJsComments(raw);
    assert.doesNotMatch(code, TEAM_LOC,
      `${f}: code outside a comment still names "Team tab/page" -- ` +
      'every team setting\'s home is Settings now, and JS carries no legitimate levels copy of its own');
  }
});
