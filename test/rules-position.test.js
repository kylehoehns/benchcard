import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Where the constraint engine sits, and what its collapsed row says (A21b).
 *
 * `notes/ROADMAP.md` calls the constraint engine the one thing no competitor
 * has. It shipped at reading position 11 of 13 on a phone -- below the card,
 * below the bench button, under a summary that said `> RULES` and nothing
 * else, because the count badge is hidden at zero. The feature worked and was
 * filed where nobody looks, which is the A11/A12 shape.
 *
 * Two things are pinned here, and they are pinned because BOTH are silent
 * when they rot: a reordering leaves every test green, and a badge that hides
 * itself leaves an empty row that looks deliberate.
 *
 * COMMENTS ARE STRIPPED FROM EVERY SOURCE FIRST. This repo has shipped two
 * guards that scored their own explanatory comment, and the note beside each
 * of the things below names it -- so an unstripped read here would pass on
 * the explanation of a rule someone had deleted.
 */

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
const noC = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const css = noC(read('app/app.css'));
const html = read('app/index.html').replace(/<!--[\s\S]*?-->/g, '');
const setup = noC(read('app/game-setup.js'));

/* Every `order:` in the stylesheet is one line of the stacked reading order:
   `.col-main` / `.col-side` are `display: contents` below 1100px, so this
   list -- not source order -- is what a coach on a phone reads down. */
const ORDER = [...css.matchAll(/([#.][\w-]+)\s*\{\s*order:\s*([\d.]+);\s*\}/g)]
  .map(m => ({ sel: m[1], n: Number(m[2]) }));

test('the stacked reading order is a whole, gapless renumbering', () => {
  assert.ok(ORDER.length >= 12,
    `only ${ORDER.length} ordered blocks found — the reading-order list has moved or been reshaped`);
  const ns = ORDER.map(o => o.n).sort((a, b) => a - b);
  assert.deepEqual(ns, ns.map((_, i) => i),
    'the order list is no longer 0..n-1 exactly once each. A fraction slipped in to avoid '
    + 'renumbering, or two blocks share a place and the tie breaks on source order — which '
    + 'is the thing this list exists to stop being a hidden input');
});

test('Rules reads as the last INPUT, above the rotation and the card', () => {
  const at = sel => {
    const hit = ORDER.find(o => o.sel === sel);
    assert.ok(hit, `${sel} has no place in the stacked reading order`);
    return hit.n;
  };
  /* Below it, in the order a coach reads them. `.s-day` is in the list too:
     promoting Rules to just above it would still leave it under the card,
     which is the half of the ticket that is easy to get wrong. */
  for (const below of ['.s-rot', '.s-cardhd', '#sheet', '.gm-cta', '.s-day', '#tabledetails']) {
    assert.ok(at('#consdetails') < at(below),
      `Rules is below ${below} again — the constraint engine is back in the drawer at the `
      + 'bottom of the page, which is the whole of A21b');
  }
  /* And it is the LAST of the inputs, not dropped in among them. */
  for (const above of ['.s-squad', '.s-fmt', '.s-plan', '.s-balance']) {
    assert.ok(at(above) < at('#consdetails'),
      `Rules now reads before ${above} — it is the fifth input, after the four that shape the game`);
  }
});

test('the wide layout agrees, because there order does not apply', () => {
  /* Above 1100px `.col-main` is a block and nothing in the list above has any
     effect: source order is the reading order. The two must not disagree, or
     the app moves a section when the window is resized. */
  const iBalance = html.indexOf('id="balanceFold"');
  const iRules = html.indexOf('id="consdetails"');
  const iRot = html.indexOf('class="block s-rot"');
  const iDay = html.indexOf('class="block s-day"');
  for (const [name, i] of [['balanceFold', iBalance], ['consdetails', iRules],
    ['s-rot', iRot], ['s-day', iDay]]) assert.ok(i > -1, `${name} is gone from index.html`);
  assert.ok(iBalance < iRules && iRules < iRot,
    'in the source, Rules no longer sits between Lineup balance and the Rotation — the wide '
    + 'layout and the phone stack now disagree about where the constraint engine lives');
  assert.ok(iRules < iDay, 'Rules is back below "Across the day" in the source');
});

test('an empty Rules row says what it holds instead of nothing at all', () => {
  const hint = /const CONS_HINT = '([^']+)'/.exec(setup);
  assert.ok(hint, 'the zero-state hint is gone — the collapsed row is back to "> RULES" and a blank');
  assert.ok(hint[1].length > 8,
    `"${hint[1]}" is too short to name anything a coach could set here`);
  assert.match(setup, /set\('#conscount', 'textContent',[^;]*\bhint\b/,
    'the hint is declared but never written to the row');
  assert.match(setup, /set\('#conscount', 'className',[^;]*'count zero'/,
    'the zero state no longer takes its own class, so it renders in the accent pill — '
    + '"nothing set yet" as an attention badge is worse than the blank it replaced');
});

test('and the zero hint is not styled as a badge', () => {
  const at = css.indexOf('details.dz > summary .count.zero');
  assert.ok(at > -1, 'the .count.zero rule is gone — the hint inherits the accent-soft pill');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.match(rule, /background: none/,
    'the zero hint keeps the pill background, which reads as an alert about something the '
    + 'coach has not done');
  assert.doesNotMatch(rule, /var\(--accent\)/, 'the zero hint is painted in the accent colour');
  assert.match(rule, /color: var\(--faint\)/, 'the zero hint is not muted');
  /* Order matters: it has to come after the pill it unsets, or it loses at
     equal specificity. This file's own siblings record that trap twice. */
  assert.ok(css.indexOf('details.dz > summary .count {') < at,
    '.count.zero is declared ABOVE the pill rule it overrides — at equal specificity the '
    + 'later rule wins and the unset does nothing');
});
