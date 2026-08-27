import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Print belongs to the game screen, and it lives THERE rather than being hidden
 * from somewhere else.
 *
 * The first pass at this hid the top-bar button off Games -- `applyView` set
 * `$('#print').hidden = v !== 'games'`. That fixed the wrong reading ("print
 * THIS" over Settings or Roster) and shipped a worse one: `hidden` takes the
 * button out of the bar's flex flow, so the whole right-hand cluster reflowed
 * and the settings cog jumped into the corner every time the coach opened
 * Settings. In place, that is only fixable by reserving dead space or anchoring
 * the cog -- both workarounds for a button that should not be in the bar.
 *
 * So `#print` left the top bar entirely and now sits beside the card, in the
 * `.gm-cta` cluster with Share. Four things have to hold together, and each one
 * is worthless alone:
 *
 *   1. The TOP BAR carries no print control, on any view, so it is byte-for-byte
 *      the same bar everywhere. Measured after the move: the right cluster is
 *      identical on games/roster/season/settings at 390 and 320, both themes,
 *      normal and 200% text.
 *   2. `#print` still EXISTS, inside the games view. `card.js` sweeps
 *      `[data-needs-card]` and `test/print-gate.test.js` discovers the control
 *      from its handler; both need the node, and the `p` key clicks it.
 *   3. The `p` shortcut stays GLOBAL. The button is now unreachable by pointer
 *      off Games -- its whole `<main>` is hidden -- so scoping `p` to Games
 *      would make it a dead key on three views, which is worse than an absent
 *      one. It does not need scoping, because `printCard` still does
 *      `setView('games', true)` before it prints: `p` from Settings takes the
 *      coach to the card and prints it.
 *   4. Therefore `printCard`'s view switch is NOT dead code now that the button
 *      is games-only by location. It is the only thing keeping `p` honest.
 *
 * Shipping any of these alone is a bug. This test pins all four.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const render = strip(read('render.js'));
const app = strip(read('app.js'));
const keys = strip(read('shortcuts.js'));
const html = read('index.html');
const bare = html.replace(/<!--[\s\S]*?-->/g, '');

// The `<header class="bar">…</header>` shell, comments removed.
function topBar() {
  const i = bare.indexOf('<header class="bar');
  const j = bare.indexOf('</header>', i);
  assert.ok(i > -1 && j > i, 'the top bar has moved or been renamed — re-read index.html');
  return bare.slice(i, j);
}

test('the top bar carries no print control at all', () => {
  const bar = topBar();
  assert.doesNotMatch(bar, /id="print"/,
    '#print is back in the top bar — hiding it off three views is what made the cog jump');
  assert.doesNotMatch(bar, /data-icon="printer"/,
    'a printer icon is back in the top bar; the bar must be identical on all four views');
  assert.doesNotMatch(bar, /data-needs-card/,
    'a print/share control is back in the top bar — it belongs beside the card');
});

test('nothing in the top bar is decided from the view, so all four bars match', () => {
  const body = render.slice(render.indexOf('function applyView'));
  const end = body.indexOf('\n}');
  const fn = body.slice(0, end > -1 ? end : undefined);
  assert.doesNotMatch(fn, /\$\('#print'\)/,
    'applyView touches #print again — that is the reflow bug, whichever property it sets');
  assert.doesNotMatch(fn, /#print/,
    'applyView names #print again — the bar must have no view-dependent print control');
});

test('#print lives beside the card, in the same cluster as Share', () => {
  const i = bare.indexOf('<div class="gm-cta');
  const j = bare.indexOf('</div>', bare.indexOf('id="shareCard"'));
  assert.ok(i > -1, 'the .gm-cta cluster has gone — re-read the card column in index.html');
  const cta = bare.slice(i, j);
  assert.match(cta, /<button[^>]*\bid="print"[^>]*>/,
    '#print must sit in the .gm-cta cluster beside Share — that is where "print this card" belongs');
  assert.match(cta.match(/<button[^>]*\bid="print"[^>]*>/)[0], /data-needs-card/,
    '#print must carry data-needs-card so card.js gates it with every other print/share control');
});

test('#print is inside the games view, so it is never on screen off Games', () => {
  const g = bare.indexOf('<main class="view print-path" id="view-games"');
  const next = bare.indexOf('<main', g + 1);
  assert.ok(g > -1 && next > g, 'the games view has moved — re-read index.html');
  assert.ok(bare.indexOf('id="print"') > g && bare.indexOf('id="print"') < next,
    '#print must live inside #view-games — it is games-only by location now, not by a hidden flag');
});

test('printing from anywhere lands on the card, so the p key is never dead', () => {
  const fn = app.slice(app.indexOf('function printCard'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /setView\('games'/,
    'printCard must switch to Games before printing — the p key clicks a button inside a hidden view, '
    + 'so without this it would print Settings');
  assert.ok(body.indexOf('setView(') < body.indexOf('window.print('),
    'the view switch has to happen BEFORE window.print(), not after it');
});

test('the p shortcut is not scoped to the games view', () => {
  /* `shortcuts.js` guards the games-only keys with an
     `else if (state.view !== 'games') return;` line, and `p` sits ABOVE it on
     purpose. If `p` ever moves below that guard it goes dead on three views
     out of four. */
  const p = keys.indexOf("k === 'p'");
  const guard = keys.indexOf("state.view !== 'games'");
  assert.ok(p > -1 && guard > -1, 'the p shortcut or the games-only guard has moved — re-read onKey');
  assert.ok(p < guard,
    'the `p` shortcut has fallen below the games-only guard, so it is now a dead key on Roster, Season and Settings');
});

test('the shortcuts sheet still promises what p actually does', () => {
  const row = html.match(/<div class="keys-row"><dt><kbd>P<\/kbd><\/dt><dd>([^<]*)<\/dd>/);
  assert.ok(row, 'the P row has left the #keys sheet');
  assert.equal(row[1], 'Print the card',
    'P prints the card from any view — the sheet must not grow a view caveat it does not need');
});
