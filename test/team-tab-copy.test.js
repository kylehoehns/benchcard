import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { jsStrings } from './js-strings.js';

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
 * levels or the roster, never a setting". A blind grep for "Team tab" /
 * "Team page" cannot tell those apart -- the odd-minutes note and the levels
 * help paragraph both use the words "Team page" today, and only one of them
 * is about a setting. This reads the sentence the phrase sits in and asks
 * whether it names a team-setting term.
 *
 * Comments are dropped first, the same rule `analytics.test.js` states for
 * the same reason: a developer note ABOUT the move ("the Team tab holds none
 * of this any more") is prose about the code, not text a coach reads, and
 * this file's own diff carries several. Scoring a comment recording the
 * change would be the guard-scores-its-own-comment mistake written down in
 * AGENTS.md's Judgement section. */

const TEAM_LOC = /\bTeam\s+(tab|page|screen)\b/gi;

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

/* Tags and entities stood between "Team" and "tab"/"page" in real copy --
 * `<b>Team</b> tab` and `Team&nbsp;tab` both read as one phrase to a coach
 * and to a screen reader, and both used to slip past a regex that wanted a
 * literal space right after "Team". Normalise the same way a browser
 * renders it, before matching: drop every tag, decode the one entity this
 * copy uses for a hard space, and collapse the whitespace multi-line markup
 * leaves behind -- every sentence in this file is indented onto its own
 * line. */
function normalizeText(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ');
}

/* The sentence around a match, not a fixed window. A window is only ever a
 * guess at how long a sentence runs -- 200 characters let "Everyone plays at
 * least is on the Team tab too." pass by borrowing the word "level" from a
 * sentence two sentences earlier that was legitimately about levels. A
 * sentence boundary is the unit this copy is actually written in: walk back
 * to the `.`/`!`/`?` that ends the sentence before the match, and forward to
 * the one that ends the sentence the match itself sits in. */
function sentenceAround(text, at) {
  let start = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (/[.!?]/.test(text[i]) && /\s/.test(text[i + 1] || '')) { start = i + 1; break; }
  }
  const rest = text.slice(at);
  const end = /[.!?]/.exec(rest);
  return text.slice(start, end ? at + end.index + 1 : text.length).trim();
}

/* A sentence naming the Team tab/page is about a team SETTING -- the thing
 * #22 moved off it -- unless it is naming the tab/page only to place levels
 * (out of scope here: #31) or the roster. These are the words a sentence
 * about a team setting uses about itself; if a "Team tab/page" sentence
 * carries one of them, #22 left a pointer at the old address. */
const SETTING_TERM = [
  /\bat least\b/i, /\bminimum\b/i, /\bat once\b/i, /\bodd minutes\b/i,
  /\bformat\b/i, /\bperiods?\b/i, /\bseason\b/i, /\bteam name\b/i,
  /\bremove this team\b/i,
];
const ABOUT_LEVELS_OR_ROSTER = /\blevel(s)?\b|\broster\b/i;

test('a Team tab/page mention that survives comment-stripping in index.html is about levels or the roster, never a setting', () => {
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  const visible = normalizeText(stripHtmlComments(html));
  const matches = [...visible.matchAll(TEAM_LOC)];
  assert.ok(matches.length > 0,
    'no match at all found nothing to discriminate -- levels help copy moved or was reworded; ' +
    'check this guard is still reading something before trusting it');
  for (const m of matches) {
    const sentence = sentenceAround(visible, m.index);
    const term = SETTING_TERM.find((re) => re.test(sentence));
    assert.equal(term, undefined,
      `index.html: "${sentence}" names a team setting alongside "${m[0]}" (matched ${term}) -- ` +
      'a team setting may be pointing a coach at the old Team tab/page location');
    assert.match(sentence, ABOUT_LEVELS_OR_ROSTER,
      `index.html: "${sentence}" is not about levels or the roster -- ` +
      'a team setting may be pointing a coach at the old Team tab/page location');
  }
});

test('a Team tab/page/screen mention in app/*.js strings is about levels or the roster, never a setting', () => {
  /* Scanning STRINGS rather than raw code minus comments: `jsStrings` already
   * drops comments as part of tokenizing, correctly -- a naive `//` cut used
   * to read a protocol-relative URL's `//` inside a string as a comment
   * start and silently deleted the rest of the line, including the phrase
   * this guard exists to catch. No legitimate JS syntax outside a string can
   * contain a two-word phrase like "Team tab" anyway (an identifier cannot
   * hold a space), so scanning strings is strictly more precise than
   * scanning code.
   *
   * NOT a blanket ban: balance.js builds its own "Set a level under each
   * name on the Team page." out of three appended strings (the note text,
   * the bold "Team" DOM node, and " page.") for the same reason index.html's
   * levels paragraph gets to keep the phrase -- levels still live on the
   * Team page (#31, out of scope). Comments over that call site record two
   * earlier tellings of the same fact this guard is now proving in code:
   * "no such heading since the levels stopped being a fold" and "the tab it
   * names is the LABEL the bar shows". So JS strings get the identical
   * sentence-and-term rule the HTML test above uses, not a bare doesNotMatch
   * -- a real levels sentence lives here too, not only in the static page. */
  const dir = new URL('../app/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert.ok(files.length >= 30, `only ${files.length} JS files found; scanning the wrong place`);
  let found = 0;
  for (const f of files) {
    const raw = readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
    const text = jsStrings(raw).map(normalizeText).join(' ');
    for (const m of text.matchAll(TEAM_LOC)) {
      found++;
      const sentence = sentenceAround(text, m.index);
      const term = SETTING_TERM.find((re) => re.test(sentence));
      assert.equal(term, undefined,
        `${f}: "${sentence}" names a team setting alongside "${m[0]}" -- ` +
        'a team setting may be pointing a coach at the old Team tab/page location');
      assert.match(sentence, ABOUT_LEVELS_OR_ROSTER,
        `${f}: "${sentence}" is not about levels or the roster -- ` +
        'a team setting may be pointing a coach at the old Team tab/page location');
    }
  }
  assert.ok(found > 0,
    'no match at all found in app/*.js -- balance.js\'s levels copy moved or was reworded; ' +
    'check this guard is still reading something before trusting it');
});
