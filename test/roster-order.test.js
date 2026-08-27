import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The roster's two reorder affordances are ONE pair of facts, and the drag
   code got them wrong for as long as the grip has existed.
 *
 * Below 620px `app.css` hides `.rrow .obtn` and shows `.rrow .rgrip`, so on a
 * phone the ▲▼ buttons measure 0x0 and the grip is the whole reorder surface:
 * drag, and Up/Down keys. The grip is built with `.obtn` on it too, and it is
 * the FIRST of the three -- so `rosterUp`'s `querySelectorAll('.obtn')` was
 * addressing the grip as if it were the Up arrow. Measured after one drag at
 * 390x844: the top row's grip came back `disabled`, 0.22 opacity, unfocusable
 * and undraggable (the only reorder affordance a phone has), the last row's Up
 * arrow was disabled instead of its Down, and no row's Down was updated at all.
 *
 * Both halves are pinned because either one alone is satisfiable while the
 * roster is unusable: a correct selector over a grip CSS has stopped showing
 * leaves a phone with nothing to press. */
const js = readFileSync(new URL('../app/roster-view.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');

/* Comments first: this file's own explanation names `.obtn` and `.rgrip`
   repeatedly, and the block above `rosterUp`'s loop describes the exact bug
   these tests ban. Scoring the explanation is not scoring the code. */
const decomment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const code = decomment(js);
const cssCode = decomment(css);

test('the drag-end re-enable addresses the arrows, never the grip', () => {
  assert.ok(/querySelectorAll\('\.obtn:not\(\.rgrip\)'\)/.test(code),
    "roster-view.js no longer selects the arrows as `.obtn:not(.rgrip)`. The grip carries "
    + '`.obtn` and comes first, so any selection that includes it shifts the pair by one.');
  assert.ok(!/querySelector(All)?\('\.obtn'\)/.test(code),
    'roster-view.js selects a bare `.obtn` again -- that set starts with the grip, and '
    + "disabling the grip is disabling the phone's only way to reorder a player.");
});

test('the grip takes the arrow keys it advertises', () => {
  const at = code.indexOf("'obtn rgrip press'");
  assert.notEqual(at, -1, 'the roster grip is gone or renamed; move this case with it');
  const window = code.slice(at, at + 700);
  assert.ok(/aria-label/.test(window) && /arrow keys/.test(window),
    'the grip stopped promising the arrow keys in its accessible name');
  assert.ok(/ArrowUp/.test(window) && /ArrowDown/.test(window) && /movePlayer/.test(window),
    'the grip promises Up/Down in its label but no longer moves the player -- below 620px '
    + 'that is the entire non-pointer path, because the ▲▼ buttons are display:none there');
});

test('a phone keeps the grip when it loses the arrows', () => {
  /* Anchored on the rule, not on the breakpoint: eleven blocks in this file
     open with `max-width: 620px`, and the first of them is nowhere near the
     roster. The breakpoint is then read back off the block this rule is in. */
  const at = cssCode.indexOf('.rrow .obtn');
  assert.notEqual(at, -1, 'the ▲▼ buttons are no longer hidden at phone width. If that is '
    + 'deliberate, the comment in roster-view.js naming the grip as the phone path has to '
    + 'change with it.');
  assert.match(cssCode.slice(at, at + 120), /^\.rrow \.obtn \{[^}]*display:\s*none/);
  const opener = cssCode.slice(cssCode.lastIndexOf('@media', at), at);
  assert.match(opener, /max-width: 620px/,
    'the arrows are hidden somewhere other than the phone breakpoint now');
  const grip = cssCode.indexOf('.rrow .rgrip', at);
  assert.ok(grip !== -1 && grip - at < 300 && /^\.rrow \.rgrip \{[^}]*display:\s*grid/.test(cssCode.slice(grip, grip + 120)),
    '`.rrow .obtn { display: none }` hides the grip too -- it carries `.obtn`. Without the '
    + 'rule that shows it back, a phone has no reorder affordance at all.');
});

/* The reorder announces itself, and the grip's own name is the whole mechanism.
 *
 * `movePlayer` rebuilds the rows and `withFocus` restores focus by `data-fk`,
 * which is keyed to the PLAYER (`r:<id>:ord`) -- so the grip that comes back
 * is the one that moved, and the node it replaces is detached, which makes the
 * restore a genuine focus event on a new element. A screen reader reads a
 * newly focused control's accessible name. Measured at 390x844 before the
 * change: three presses fired three focus events carrying the IDENTICAL
 * string, which is why the reorder was silent. Measured after: "position 1 of
 * 11", "2 of 11", "3 of 11", "4 of 11", the same `data-fk` throughout.
 *
 * So the position has to stay IN the name, and it has to be computed. A
 * literal position or a literal count is the same silence with extra words --
 * every row would claim the same place, or the count would lie the moment a
 * player is added. This is deliberately the ONLY announcement in the app:
 * there is no live region and no visually-hidden class, and inventing the
 * first announcer is a product decision, not a defect fix. */
test('the grip names the position it moved to, computed not written', () => {
  const at = code.indexOf("'obtn rgrip press'");
  assert.notEqual(at, -1, 'the roster grip is gone or renamed; move this case with it');
  /* Scoped to the grip's OWN setAttribute call, not to a window of source.
     A 900-character window from the anchor reaches `up.setAttribute` twenty
     lines below, and this case went GREEN with the position moved off the grip
     and onto the Up arrow -- which is `display: none` at the 390px baseline,
     i.e. the guard scoring the one element the phone cannot see. */
  const call = code.indexOf('grip.setAttribute(', at);
  assert.ok(call > at && call - at < 500, 'the grip no longer sets its own accessible name');
  const window = code.slice(call, code.indexOf(');', call));
  assert.ok(!/\b(up|dn)\.setAttribute/.test(window), 'this slice ran past the grip into the arrows');
  const m = window.match(/position \$\{([^}]+)\} of \$\{([^}]+)\}/);
  assert.ok(m, 'the grip stopped naming its position. Focus IS restored to this grip after a '
    + 'move, so the name is the only thing a screen reader has to hear -- without the position '
    + 'it reads the same words on every press and the reorder is silent again.');
  assert.match(m[1], /\bidx\b|\bindex\b|\bi\b/,
    'the position is not the row index, so every grip would announce the same place');
  assert.match(m[2], /\.length\b/,
    'the count is a literal, so it lies the moment a player is added or removed');
});
