/* One list of feature keys, and one reader for the surfaces that must name
 * them. A20 slice 1.
 *
 * `test/feature-coverage.test.js` is the guard; `scripts/feature-mutate.mjs`
 * is the harness that proves the guard can go red. Both read THIS file, so
 * there is exactly one list -- a second copy of it would be the drift the
 * whole item exists to stop.
 */
import { readFileSync } from 'node:fs';

export const app = (f) => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');

/* ---------------------------------------------------------- reading a page */

/* Comments are prose ABOUT the page, not text ON it. This repo has shipped two
 * guards that scored their own explanatory comment, and `about.html` carries a
 * comment naming the league minimum while arguing for keeping it OUT of a
 * list -- exactly the false green. Scripts and styles go for the same reason. */
export const stripped = (html) => html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ')
  .replace(/<script[\s\S]*?<\/script>/g, ' ');

export const normalize = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&rsquo;|&lsquo;|[‘’]/g, "'")
  .replace(/&ldquo;|&rdquo;|[“”]/g, '"')
  .replace(/&hellip;|…/g, '...')
  .replace(/&mdash;|&ndash;|[—–]/g, '|')
  .toLowerCase();

/* Everything a reader sees, as one run of text: for phrasings distinctive
 * enough that anywhere on the page counts. */
export const textOf = (html) =>
  normalize(stripped(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/* The same text as separate nodes, so a NAME can be required to sit where the
 * page names things -- a heading, a `<dt>`, a bolded label -- rather than
 * anywhere an ordinary English word happens to fall. `<dt>Together /
 * Apart</dt>` is two names, hence the split. */
export const partsOf = (text) => normalize(text).split(/[/|·]/)
  .map((t) => t.replace(/\s+/g, ' ').trim().replace(/^[.,:;'"]+|[.,:;'"]+$/g, '').trim())
  .filter(Boolean);

export const chunksOf = (html) =>
  new Set(stripped(html).split(/<[^>]+>/).flatMap(partsOf));

/* ------------------------------------------------------------- the surfaces */

/* `#help` is bounded on both ends by ids -- a slice that silently ran to the
 * end of `index.html` would satisfy every check on unrelated markup. */
export function helpRange(index = app('index.html')) {
  const from = index.indexOf('id="help"');
  const to = index.indexOf('id="keys"');
  if (!(from > 0 && to > from)) throw new Error('the #help dialog should sit before #keys');
  return [from, to];
}

export const SURFACES = {
  '#help': {
    file: 'index.html',
    slice: (all) => all.slice(...helpRange(all)),
    splice: (all, next) => {
      const [a, b] = helpRange(all);
      return all.slice(0, a) + next + all.slice(b);
    },
  },
  'about.html': {
    file: 'about.html',
    slice: (all) => all,
    splice: (all, next) => next,
  },
  /* A20 slice 2. The public deep reference: a whole file, like `about.html`,
     because the page IS the surface. It joined the list in the same commit
     that created it, so the guard is what proves it names all 22 keys. */
  'advanced.html': {
    file: 'advanced.html',
    slice: (all) => all,
    splice: (all, next) => next,
  },
};

export const read = (name) => SURFACES[name].slice(app(SURFACES[name].file));

/* ----------------------------------------------------------------- the list */

/* `term`: must appear where the surface NAMES things (a whole text node).
 * Either a plain array, meaning the same word on every surface, or an object
 * keyed by surface name, when the word differs by surface.
 * `text`: distinctive enough to count anywhere on the surface.
 * Either `term` or `text` satisfies the key. `src` is where the app defines
 * the feature.
 *
 * DELIBERATELY NOT A KEY, so the next iteration does not re-file it: the
 * per-day switch "Balance against minutes already played today". `#help` names
 * the control; `about.html` describes the behavior ("the day balances across
 * every game by default") without naming it. A20's list is the contract, that
 * switch is not on it, and naming an in-app control label is exactly the
 * detail slice 3 moves OFF the public page.
 */
export const FEATURES = [
  /* #19 renamed the strategy in-app to Even / By hand and the balance shape
   * `even` to Steady, but only in-app: about.html and advanced.html stayed
   * out of #19's scope and kept saying Balanced / Minutes / Even. #75 (item 6,
   * against CONTEXT.md) brought both pages onto the strategy's glossary name
   * too, so all three surfaces now call it Even -- which is exactly the
   * collision the old comment here warned about: `even` would then name TWO
   * keys on the SAME surface, the strategy AND the balance shape. `term` for
   * `shape:even` is narrowed to the surface that still uses the bare word
   * (`#help`'s "Steady" is a different word, so it never collided); about.html
   * and advanced.html instead prove the shape by the one sentence that names
   * it ("every stint about as strong as every other"), via `text`, so the two
   * keys never claim the same chunk. */
  { key: 'strategy:balanced', src: 'state.js STRATEGIES', term: ['even'] },
  { key: 'strategy:minutes', src: 'state.js STRATEGIES', term: ['by hand'] },
  { key: 'strategy:closers', src: 'state.js STRATEGIES', term: ['closers'] },
  { key: 'strategy:platoon', src: 'state.js STRATEGIES', term: ['platoon'] },

  { key: 'shape:even', src: 'balance.js SHAPES',
    term: { '#help': ['steady'] }, text: ['every stint about as strong as every other'] },
  { key: 'shape:start', src: 'balance.js SHAPES', term: ['start strong'], text: ['start strong'] },
  { key: 'shape:finish', src: 'balance.js SHAPES', term: ['finish strong'], text: ['finish strong'] },
  { key: 'shape:both', src: 'balance.js SHAPES', term: ['both ends'], text: ['both ends'] },

  /* #75 item 6: about.html and advanced.html dropped "minutes limit" (one
   * phrase for the app's `minimum`/`cap` pair, per `shipped()`'s note below)
   * for the glossary's own two rules, named side by side ("Minimum and Cap").
   * `#help` is unchanged and still uses the app's internal "Minutes limit" --
   * that mismatch is #75's own Decisions section, not a new one -- so this
   * key is per-surface the same way `shape:even` is. #98 brought the three
   * pair rules' names into line instead: `#help`'s own `<dt>`s now read
   * Together / Apart / One of two on, the same words about.html and
   * advanced.html already used, so those three keys below are plain arrays
   * again rather than per-surface objects. */
  { key: 'rule:limit', src: 'rules.js KINDS',
    term: { '#help': ['minutes limit'], 'about.html': ['minimum'], 'advanced.html': ['minimum'] } },
  { key: 'rule:starts', src: 'rules.js KINDS', term: ['starting five'], text: ['starting five'] },
  { key: 'rule:lastq', src: 'rules.js KINDS', term: ['last period'] },
  { key: 'rule:together', src: 'rules.js KINDS', term: ['together'] },
  { key: 'rule:apart', src: 'rules.js KINDS', term: ['apart'] },
  { key: 'rule:keepon', src: 'rules.js KINDS', term: ['one of two on'] },
  { key: 'rule:rest', src: 'rules.js KINDS', term: ['rest limit'], text: ['rest limit'] },

  /* The bench scopes are pinned by the LABEL the button carries, not by its
   * internal key: two of the three have no key at all (one is a bare button),
   * and an extraction that looked for `['stint'|'rest', ...]` could not see a
   * fourth scope being added beside them. Found by mutation, not by reading. */
  { key: 'bench:stint', ships: 'This stint', src: 'gamemode.js', term: ['this stint'], text: ['this stint'] },
  { key: 'bench:rest', ships: 'Rest of game', src: 'gamemode.js', term: ['rest of game'], text: ['rest of game'] },
  { key: 'bench:rebalance', ships: 'Sit, rebalance', src: 'gamemode.js', term: ['sit, rebalance'], text: ['sit, rebalance'] },

  { key: 'season:carryover', src: 'rules.js useSeasonTargets', term: ['even out the season so far'], text: ['even out the season so far'] },
  { key: 'league:minimum', src: 'state.js leagueMinutes', text: ['everyone plays at least'] },

  { key: 'card:pocket', src: 'index.html #cardSize', text: ['pocket size', 'pocket 3.45'] },
  { key: 'card:half', src: 'index.html #cardSize', text: ['half-sheet'] },
];

/* Deliberate omissions: `'<surface> <key>'` with the reason on the line.
 *
 * A20 slice 3 turned `about.html` into the high-level page and these are the
 * only three keys it let go. All three are BUTTON LABELS in the in-app swap
 * sheet, and reciting a control's label is the detail a page that exists to
 * convince a coach hands off -- the same call slice 1 already recorded for the
 * per-day "Balance against minutes already played today" switch.
 *
 * Each line is a promise that a coach can still find the feature, and the
 * promise is checkable: `#help` names all three (that is the surface a coach
 * standing at the bench can actually reach, offline, without leaving the app)
 * and `advanced.html#midgame` names all three. `about.html` keeps the sentence
 * that bench mode changes the plan mid-game, and links to the reference.
 *
 * `test/feature-coverage.test.js` fails an entry that has stopped being true
 * in either direction -- an unknown surface or key, or a key this surface now
 * names anyway. An allowlist nobody can prove is stale is how the next drift
 * gets in. */
export const KEEP = new Map([
  ['about.html bench:stint', 'in-app button label; #help and advanced.html#midgame name it'],
  ['about.html bench:rest', 'in-app button label; #help and advanced.html#midgame name it'],
  ['about.html bench:rebalance', 'in-app button label; #help and advanced.html#midgame name it'],
]);

/* `f.term` resolves to the words THIS surface names the feature by: the whole
 * array when it is plain (every surface means the same thing), or just its
 * own entry when it is keyed by surface -- a surface with no entry there has
 * no term to check and falls back to `text`, same as a feature with no term
 * at all. */
export const termsFor = (f, surfaceName) => {
  if (!f.term) return [];
  return Array.isArray(f.term) ? f.term : (f.term[surfaceName] || []);
};

export const covered = (html, f, surfaceName) =>
  termsFor(f, surfaceName).some((t) => chunksOf(html).has(t))
  || (f.text || []).some((t) => textOf(html).includes(t));

/* ------------------------------------------- what the app itself still ships */

const between = (src, open, close) => {
  const i = src.indexOf(open);
  if (i < 0) throw new Error(`${open} is no longer in the source`);
  const j = src.indexOf(close, i);
  if (j < 0) throw new Error(`${open} is no longer closed by ${close}`);
  return src.slice(i + open.length, j);
};

/* The app's own lists, read from the app. This is the direction that would
 * have caught A19 the day `keepon` shipped. */
export const shipped = () => {
  const gm = app('gamemode.js');
  const index = app('index.html');
  /* #28 split the app's one "Minutes limit" kind into `minimum` and `cap`
   * (Plays at least / Plays at most), but `#help`'s doc kept them as one
   * `<dt>Minutes limit</dt>` -- unchanged, per the ticket's survey. Folded
   * back to one `limit` entry here so the list below still means "the
   * doc's own concepts", not the app's internal split. */
  const ruleKinds = [...between(app('rules.js'), 'const KINDS = [', '\n];')
    .matchAll(/\['(\w+)',\s*'[^']+'\]/g)]
    .map((m) => (m[1] === 'minimum' || m[1] === 'cap') ? 'limit' : m[1]);
  return {
    strategy: [...between(app('state.js'), 'export const STRATEGIES = {', '\n};')
      .matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]),
    shape: [...between(app('balance.js'), 'const SHAPES = [', '\n];')
      .matchAll(/\bv:\s*'([^']+)'/g)].map((m) => m[1]),
    rule: [...new Set(ruleKinds)],
    /* Every scope the swap sheet can offer: the keyed pair list, plus any bare
     * action button beside it. Both halves are open-ended on purpose -- a
     * fourth scope has to show up here whatever shape it arrives in. */
    bench: [...between(gm, 'for (const [k, t] of [', ']) {')
      .matchAll(/\[\s*'[^']*',\s*'([^']+)'\s*\]/g)].map((m) => m[1])
      .concat([...gm.matchAll(/el\('button', 'press act', '([^']+)'\)/g)].map((m) => m[1])),
    card: [...between(index, '<select id="cardSize" class="prow-select">', '</select>')
      .matchAll(/<option value="(\w+)"/g)].map((m) => m[1]),
  };
};
