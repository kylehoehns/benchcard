import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lacks } from './prose.js';
import { thisGameBox } from './markup.js';

/* #112: the day-name field, spec docs/specs/112-day-name-field.md.
 *
 * Two seams, per the spec's own Proof table:
 *   - `renderSetup` (game-setup.js) against a hand-built DOM: the placeholder
 *     is never overwritten by script, and the hint reads `weekdayLabel`.
 *   - the markup itself (`app/index.html`), read with `element()` from
 *     test/markup.js -- depth-balanced tag walking, never a line-by-line
 *     phrase search, since this repo hard-wraps prose.
 *
 * `renderSetup` needs a full `document` double (id -> plain object, so
 * `dom.js`'s `set()` can assign properties onto it) rather than the
 * `querySelector: () => null` stub `dom-stub.js` gives every OTHER pure-state
 * test file: those files never read what a renderer painted, this one does.
 * So this file installs `dom-stub.js`'s stub first -- it must be in place
 * before `state.js`/`game-setup.js` load, since both reach `document`
 * (directly, and through `trap.js`'s `addEventListener` and `fx.js`'s
 * `matchMedia`) at import time -- then overrides just `querySelector` to read
 * from the `els` map below, before `game-setup.js` itself loads. Static
 * `import` is hoisted ahead of any assignment textually before it, which is
 * exactly the ordering problem; `await import(...)` (league-min.test.js's
 * own move) runs `game-setup.js`'s load in place, after the override. */

import { withDays, bareGame, S } from './state-fixture.js';

const IDS = ['dayName', 'dayNameHint', 'gameDate', 'label', 'when',
  'copies', 'cardId', 'cardSize', 'printScope', 'showMinutes'];
const els = new Map(IDS.map(id => ['#' + id, {}]));
globalThis.document.querySelector = sel => els.get(sel) || null;

const { renderSetup } = await import('../app/game-setup.js');

// The one-team, one-day, one-game shape test/state-fixture.js's `withDays`
// and `bareGame` already build, with the team's own name settable after
// delegation -- `withDays` hardcodes it to `'T'`, and this file needs
// `teamName()` (state.js) to read something a coach would recognize as wrong
// in `#dayName`'s placeholder if it ever showed up there.
const withGame = (name, dayName, date, fn) => withDays([],
  [{ name: dayName, date, games: [bareGame()] }], {}, () => {
    S.state.teams[0].name = name;
    return fn();
  });

test('renderSetup never overwrites #dayName\'s placeholder with the team name', () => {
  els.get('#dayName').placeholder = 'Spring Classic (optional)';
  withGame('Sample team', '', '2026-09-23', () => renderSetup());
  assert.equal(els.get('#dayName').placeholder, 'Spring Classic (optional)',
    "#dayName's placeholder changed -- a script is still painting the team name into it");
});

test('renderSetup paints #dayNameHint from weekdayLabel(state.day.date)', () => {
  withGame('Sample team', '', '2026-09-23', () => renderSetup());
  assert.equal(els.get('#dayNameHint').textContent, 'Shared by every game on Wed, Sep 23');
});

test('renderSetup repaints #dayNameHint when the game is on a different date', () => {
  withGame('Sample team', '', '2026-10-03', () => renderSetup());
  assert.equal(els.get('#dayNameHint').textContent, 'Shared by every game on Sat, Oct 3');
});

/* ---------------------------------------------------------------------- */

const { html, box } = thisGameBox();

test('the #dayName field is labelled "Day name"', () => {
  const m = box.match(/<label class="f" for="dayName">([^<]*)<\/label>/);
  assert.ok(m, '#dayName lost its <label class="f" for="dayName">');
  assert.equal(m[1], 'Day name');
});

test('no coach-visible text says "Day or tournament"', () => {
  assert.ok(lacks(html, 'Day or tournament'));
});

test('#dayName\'s markup placeholder reads exactly "Spring Classic (optional)"', () => {
  const inputM = box.match(/<input[^>]*\bid="dayName"[^>]*>/);
  assert.ok(inputM, '#dayName input not found in the "This game" box');
  const ph = inputM[0].match(/placeholder="([^"]*)"/);
  assert.ok(ph, '#dayName has no placeholder attribute');
  assert.equal(ph[1], 'Spring Classic (optional)');
});

test('#dayName points at its hint with aria-describedby, and the hint exists', () => {
  const inputM = box.match(/<input[^>]*\bid="dayName"[^>]*>/);
  assert.ok(inputM, '#dayName input not found in the "This game" box');
  const described = inputM[0].match(/aria-describedby="([^"]+)"/);
  assert.ok(described, '#dayName has no aria-describedby');
  assert.ok(box.includes(`id="${described[1]}"`),
    `aria-describedby points at #${described[1]}, which is not in the "This game" box`);
});

test('the hint sits right after #dayName, before the next row', () => {
  const nameAt = box.indexOf('id="dayName"');
  const hintAt = box.indexOf('id="dayNameHint"');
  assert.ok(nameAt > 0 && hintAt > nameAt, '#dayNameHint does not follow #dayName');
  const nextRowAt = box.indexOf('class="row"', hintAt);
  const whenAt = box.indexOf('id="when"');
  assert.ok(nextRowAt < 0 || whenAt < 0 || nextRowAt <= whenAt,
    'a row boundary was found between #dayNameHint and Tip-off -- unexpected shape, re-check by hand');
});

test('the #dayName row comes after the row holding #gameDate', () => {
  const dateAt = box.indexOf('id="gameDate"');
  const nameAt = box.indexOf('id="dayName"');
  assert.ok(dateAt > 0 && nameAt > 0, '#gameDate or #dayName missing from the "This game" box');
  assert.ok(dateAt < nameAt, '#dayName reads before #gameDate, not after it');
});
