import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { thisGameBox } from './markup.js';

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
 *
 * #141 (one control each), decision 1 moved Remove out of the box itself: a
 * `.pgrp` list row nested inside `.side-box.s-thisgame` would be a card
 * inside a card, so Remove now reads as `.side-box.s-thisgame`'s own next
 * sibling instead of a child of it. STRUCTURE below is updated to match --
 * Opponent and Tip-off still live in the one box, and Remove still sits
 * immediately under it with nothing else between, so the three still read
 * together as one group even though only two are literally inside the box.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const css = read('app.css');
const teamsView = read('teams-view.js');

const BOX_IDS = ['id="label"', 'id="when"'];

test('Opponent and Tip-off are in the "This game" box', () => {
  const { box } = thisGameBox();
  for (const id of BOX_IDS) {
    assert.ok(box.includes(id), `${id} left the "This game" box`);
  }
  assert.ok(!box.includes('id="removeGame"'),
    'id="removeGame" is back inside the box -- that nests a card inside a card (decision 1)');
});

test('Remove reads immediately under the box, not inside it', () => {
  const { html, box } = thisGameBox();
  const boxEnd = html.indexOf(box) + box.length;
  assert.ok(boxEnd > box.length - 1, 'the "This game" box was not found in index.html');
  // Only whitespace may separate the box from its own next sibling: no other
  // element, and no other id, is allowed to sit between them.
  const after = html.slice(boxEnd, html.indexOf('id="removeGame"') + 'id="removeGame"'.length);
  assert.ok(/^\s*<div class="pgrp[^"]*">\s*<button\b[^>]*\bid="removeGame"/.test(after),
    `Remove is not the box's own next sibling -- found "${after.slice(0, 120)}"`);
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

test('removing a game is still undoable, and now removes the last one too (#126)', () => {
  const at = teamsView.indexOf("$('#removeGame')");
  assert.ok(at > 0, 'the #removeGame wiring moved -- re-point this test');
  const wiring = teamsView.slice(at, teamsView.indexOf('\n}', at));
  // no confirm(): removing a TEAM is the one confirm in this app, and this is
  // not that. Undo is the affordance here.
  assert.ok(!/\bconfirm\(/.test(wiring), '#removeGame grew a confirm dialog');
  assert.match(wiring, /undoable\(/);
  // #126: the game screen needs a game, so it can't be reached without one --
  // "Remove this game" shows whenever the game screen is showing, with no
  // count to guard the click on.
  assert.match(wiring, /hidden = false/);
  assert.ok(!/if \(totalGames < 2\) return/.test(wiring), 'a below-two guard came back');
});
