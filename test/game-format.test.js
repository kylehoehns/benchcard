import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Where the game format lives, and why it may not drift back.
 *
 * Periods / Min-per-period / "Sub at" spent a long time inside
 * `<details id="consdetails">` — a fold whose summary says **Rules**, shut by
 * default, sitting BELOW the rotation. "Rules" reads as the player rules
 * (keep-together, keep-apart, always-one-on), so a coach trying to say "two
 * halves of twenty minutes" never opened it. The app answered the question and
 * hid the answer. The controls were never missing and the per-game seeding in
 * `state.js` was never wrong; only the placement and the label were.
 *
 * Three things hold the fix in place, and each of them is one careless edit
 * away from coming undone:
 *   1. the three controls are OUT of the Rules fold;
 *   2. the Game format block comes BEFORE the rotation in source order, and
 *      before it in the phone `order:` list too — below 1100px `.col-main`
 *      is `display: contents` and the flex `order` values in app.css are the
 *      real reading order, so source order alone proves nothing there;
 *   3. the summary hint is repainted from the `#periods` / `#periodMinutes`
 *      handler. `setup` is deliberately not in `AFTER_EDIT`, so nothing else
 *      repaints it and a coach typing would watch "2 × 20 min" go stale above
 *      their own finger.
 *
 * Source-read, no DOM, same trick as note-placement.test.js.
 */

const read = (f) => readFileSync(new URL('../app/' + f, import.meta.url), 'utf8');
const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');
const css = read('app.css');
const appJs = read('app.js');
const setupJs = read('game-setup.js');

const FORMAT_IDS = ['periods', 'periodMinutes', 'gran'];

test('the format controls are out of the Rules fold', () => {
  const fold = html.slice(html.indexOf('id="consdetails"'));
  const body = fold.slice(0, fold.indexOf('</details>'));
  for (const id of FORMAT_IDS) {
    assert.ok(!body.includes(`id="${id}"`),
      `#${id} is back inside the "Rules" fold — that is the bug A11 fixed`);
  }
});

test('the format controls are inside the Game format block', () => {
  const at = html.indexOf('id="fmtFold"');
  assert.ok(at > 0, 'the Game format block (#fmtFold) is gone');
  const block = html.slice(at, html.indexOf('</details>', at));
  for (const id of FORMAT_IDS) {
    assert.ok(block.includes(`id="${id}"`), `#${id} is not in the Game format block`);
  }
  assert.match(block, /<h3>Game format<\/h3>/, 'the block is not labelled "Game format"');
  assert.ok(block.includes('id="fmthint"'), 'the summary lost its format hint');
});

test('Game format sits above the rotation, in the markup and on a phone', () => {
  assert.ok(html.indexOf('id="fmtFold"') < html.indexOf('s-rot'),
    'Game format is below the rotation in source order');

  // the phone stack: `.col-main` is display:contents there, so `order` rules
  const orderOf = (sel) => {
    const m = css.match(new RegExp(`\\${sel}\\s*\\{[^}]*order:\\s*(\\d+)`));
    assert.ok(m, `no order: declared for ${sel} in the phone stack`);
    return Number(m[1]);
  };
  assert.ok(orderOf('.s-fmt') < orderOf('.s-rot'),
    'Game format orders below the rotation on a phone');
  assert.ok(orderOf('.s-squad') < orderOf('.s-fmt'),
    'Game format jumped above the squad');

  // and inside that one block every order value is still distinct, or two
  // sections silently tie and their order falls back to source order
  const at = css.indexOf('@media screen and (max-width: 1099px)');
  assert.ok(at > 0, 'the phone stack media block moved — re-point this test');
  const block = css.slice(at, css.indexOf('\n}', css.indexOf('.s-cardopts', at)));
  const orders = [...block.matchAll(/order:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(orders.length >= 13, `only ${orders.length} ordered sections in the phone stack`);
  assert.equal(new Set(orders).size, orders.length, 'two blocks share an order value');
});

test('the summary hint is repainted by the format handlers, not only by a full render', () => {
  assert.match(setupJs, /export function renderFmtHint\(\)/);
  assert.match(setupJs, /#fmthint/);
  // the handler for the two spinners has to call it in place
  const at = appJs.indexOf("for (const k of ['periods', 'periodMinutes'])");
  assert.ok(at > 0, 'the periods handler moved — re-point this test');
  const handler = appJs.slice(at, appJs.indexOf('\n}', at));
  assert.ok(handler.includes('renderFmtHint()'),
    'typing a new period count no longer refreshes the "2 × 20 min" summary');
});

test('the Rules count still counts only the player rules', () => {
  // it always did — the A11 report expected a behaviour change here and there
  // was none to make. Pinned so a later "tidy-up" cannot fold the format into it.
  const at = setupJs.indexOf("#conscount");
  const src = setupJs.slice(setupJs.indexOf('const c = g.constraints;'), at);
  for (const id of FORMAT_IDS) assert.ok(!src.includes(id), `#conscount counts ${id}`);
  assert.match(src, /minMinutes[\s\S]*maxMinutes[\s\S]*pairs[\s\S]*avoids/);
});

test('the Rules count is repainted by the rules body, not only by a full render', () => {
  /* `setup` is in neither AFTER_EDIT nor PLAN_ONLY, and every rule edit in
     rules.js repaints by calling `renderConstraints()` straight back. So the
     badge on the collapsed Rules row held the count as of the last FULL render
     and a coach's first rule of the session changed the row not at all (A25).
     A/B'd in a browser: without this call the badge stays hidden through the
     rule being added and the chip appearing. */
  const rulesJs = read('rules.js');
  assert.match(setupJs, /export function renderConsCount\(\)/,
    'the badge paint is no longer extracted — rules.js has nothing to call');
  const at = rulesJs.indexOf('export function renderConstraints()');
  assert.ok(at > 0, 'renderConstraints has moved — re-point this test');
  const body = rulesJs.slice(at, rulesJs.indexOf("\n  const box = $('#constraints')", at));
  assert.ok(body.includes('renderConsCount()'),
    'renderConstraints no longer repaints the Rules count badge, so it goes stale on the first rule');
});
