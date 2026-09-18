import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* "This game" -- Opponent, Tip-off and Remove -- may not live inside the card.
 *
 * It used to. The box sat at the bottom of `.s-cardopts`, and that block was
 * `display: none` while the card was folded (`#view-games.card-shut
 * .s-cardopts`). `storage.js` seeded `ui.cardOpen` FALSE, so on a phone a coach
 * who had never opened the card preview could not see the opponent field, the
 * tip-off field or "Remove this game" at all -- measured, 2026-08-24: all
 * three had zero client rects at 390x844 on a default state. With the card
 * open they were still the last block on a 3,281px page.
 *
 * #29 removed the fold entirely -- `renderCardFold`, `.cardtoggle` and every
 * `.card-shut` rule are gone, and the card moved into a sheet a coach reaches
 * from `#shareBtn` -- so the bug this file was written against cannot recur
 * the old way. What still matters, and is still pinned here:
 *   1. STRUCTURE -- the three controls still sit together in one box.
 *   2. READING ORDER -- below 1100px `.col-main` is `display: contents`, so
 *      source order proves nothing and the `order:` list in `app.css` is the
 *      only reading order there. "This game" still reads right after the
 *      rotation and before Rules (#30 moved Across the day off this stack
 *      entirely, onto the Season screen).
 *
 * Source-level, like note-placement and print-gate: no DOM, so it holds for
 * every state rather than the one a rendered check happened to be given.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
const css = read('app.css');
const teamsView = read('teams-view.js');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr']);

/* The source of the element whose opening tag contains `needle`, from `<` to
   its matching close. Depth-counted rather than regex-matched: these boxes
   nest divs, and a lazy match would stop at the first `</div>` and report a
   subtree that ends before the thing being looked for. */
function element(src, needle) {
  const start = src.lastIndexOf('<', src.indexOf(needle));
  assert.ok(start > 0, `${needle} is not in index.html`);
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m; (m = tag.exec(src));) {
    const [, close, name, attrs] = m;
    if (close) { if (--depth === 0) return src.slice(start, tag.lastIndex); continue; }
    if (!(/\/\s*$/.test(attrs) || VOID.has(name.toLowerCase()))) depth++;
  }
  assert.fail(`unbalanced markup around ${needle}`);
}

const IDS = ['id="label"', 'id="when"', 'id="removeGame"'];

test('Opponent, Tip-off and Remove are one box', () => {
  const box = element(html, 'class="side-box noprint s-thisgame"');
  for (const id of IDS) {
    assert.ok(box.includes(id), `${id} left the "This game" box`);
  }
});

test('"This game" reads after the rotation, but still above the rules', () => {
  const at = css.indexOf('@media screen and (max-width: 1099px)');
  assert.ok(at > 0, 'the phone stack media block moved -- re-point this test');
  const block = css.slice(at, css.indexOf('\n}', css.indexOf('#tabledetails', at)));
  const orderOf = (sel) => {
    const m = block.match(new RegExp(`\\${sel}\\s*\\{[^}]*order:\\s*(\\d+)`));
    assert.ok(m, `no order: declared for ${sel} in the phone stack`);
    return Number(m[1]);
  };
  // #29 removed `.s-cardopts` and the fold -- the card now lives inside
  // `.s-rot` (Timeline/Card) or in `#sheetCard`, a dialog with no `order:` of
  // its own. #30 then moved "Across the day" to the Season screen, so it
  // drops out of this list too. So "This game" (Opponent, Tip-off, Remove) is
  // checked against its actual phone-stack neighbors: it reads right after
  // the rotation and right before Rules (`#tabledetails`).
  assert.ok(orderOf('.s-rot') < orderOf('.s-thisgame'),
    '"This game" now reads before the rotation');
  assert.ok(orderOf('.s-thisgame') < orderOf('#tabledetails'),
    '"This game" now reads after Rules');
});

test('removing a game is still undoable and still refuses the last game', () => {
  const at = teamsView.indexOf("$('#removeGame')");
  assert.ok(at > 0, 'the #removeGame wiring moved -- re-point this test');
  const wiring = teamsView.slice(at, teamsView.indexOf('\n}', at));
  // no confirm(): removing a TEAM is the one confirm in this app, and this is
  // not that. Undo is the affordance here.
  assert.ok(!/\bconfirm\(/.test(wiring), '#removeGame grew a confirm dialog');
  assert.match(wiring, /undoable\(/);
  // a day must always have a game, or game() is undefined and every render
  // downstream throws. The guard is belt (hidden) and braces (the early return).
  assert.match(wiring, /hidden = state\.day\.games\.length < 2/);
  assert.match(wiring, /if \(state\.day\.games\.length < 2\) return/);
});
