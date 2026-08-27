import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* "This game" -- Opponent, Tip-off and Remove -- may not live inside the card.
 *
 * It used to. The box sat at the bottom of `.s-cardopts`, and that block is
 * `display: none` while the card is folded (`#view-games.card-shut
 * .s-cardopts`). `storage.js` seeds `ui.cardOpen` FALSE, so on a phone a coach
 * who had never opened the card preview could not see the opponent field, the
 * tip-off field or "Remove this game" at all -- measured, 2026-08-24: all
 * three had zero client rects at 390x844 on a default state. With the card
 * open they were still the last block on a 3,281px page.
 *
 * Two things are pinned here and they are different claims:
 *   1. STRUCTURE -- the three controls sit together in one box that is not
 *      inside anything `.card-shut` hides. This is the bug that hid them.
 *   2. READING ORDER -- below 1100px `.col-main` is `display: contents`, so
 *      source order proves nothing and the `order:` list in `app.css` is the
 *      only reading order there. "This game" reads before the squad.
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

test('Opponent, Tip-off and Remove are one box, outside the card fold', () => {
  const box = element(html, 'class="side-box noprint s-thisgame"');
  for (const id of IDS) {
    assert.ok(box.includes(id), `${id} left the "This game" box`);
  }

  /* Everything `.card-shut` hides on a phone. Read out of the CSS rather than
     hard-coded, so a fourth selector added to that rule is checked too. */
  const rule = css.match(/((?:#view-games\.card-shut[^,{]+,\s*)*#view-games\.card-shut[^,{]+)\{\s*display:\s*none/);
  assert.ok(rule, 'the .card-shut hide rule moved -- re-point this test');
  const hidden = rule[1].split(',').map(s => s.replace('#view-games.card-shut', '').trim());
  assert.ok(hidden.length >= 3, `only ${hidden.length} selectors folded away with the card`);

  for (const sel of hidden) {
    const needle = sel.startsWith('#') ? `id="${sel.slice(1)}"` : `${sel.slice(1)}"`;
    const region = element(html, needle);
    for (const id of IDS) {
      assert.ok(!region.includes(id), `${id} is inside ${sel}, which the card fold hides`);
    }
  }
});

test('"This game" reads before the squad in the phone stack', () => {
  const at = css.indexOf('@media screen and (max-width: 1099px)');
  assert.ok(at > 0, 'the phone stack media block moved -- re-point this test');
  const block = css.slice(at, css.indexOf('\n}', css.indexOf('.s-cardopts', at)));
  const orderOf = (sel) => {
    const m = block.match(new RegExp(`\\${sel}\\s*\\{[^}]*order:\\s*(\\d+)`));
    assert.ok(m, `no order: declared for ${sel} in the phone stack`);
    return Number(m[1]);
  };
  assert.ok(orderOf('.s-thisgame') < orderOf('.s-squad'),
    '"This game" no longer reads first on a phone');
  assert.ok(orderOf('.s-thisgame') < orderOf('.s-cardopts'),
    '"This game" sank back down beside the card options');
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
