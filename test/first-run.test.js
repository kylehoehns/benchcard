import './dom-stub.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countLine, newDraft, shortOfLineup, startTeam } from '../app/onboarding.js';
import { S, bareGame, withTeam, player } from './state-fixture.js';

const html = () => readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

/* Proof item 1: the count line under `#frCount`, and the rule that disables
 * `#frNext` on step 1. Pure function, no DOM — the exact strings come from
 * the spec (docs/specs/36-first-run.md), not from re-deriving the copy the
 * way `countLine` itself builds it. */

const COUNT_LINE_CASES = [
  ['reads the empty box as an instruction', 0,
    'Paste from wherever your roster lives. Jersey numbers are optional.'],
  ['counts up to the 5-player floor, singular at 1', 1,
    '1 player so far. 5 needed to field a lineup.'],
  ['counts up to the 5-player floor, plural below it', 3,
    '3 players so far. 5 needed to field a lineup.'],
  ['drops the floor once it is met', 5, '5 players so far.'],
  ['keeps counting past the floor', 12, '12 players so far.'],
];

for (const [label, n, want] of COUNT_LINE_CASES) {
  test(`countLine ${label}`, () => {
    assert.equal(countLine(n), want);
  });
}

/* `shortOfLineup` is the app's own predicate, imported, not restated: a test
 * that declares `const disabled = n => n < 5` and asserts against that agrees
 * with itself whatever `#frNext` actually does. 4 and 5 are the spec's two
 * numbers ("leaves `#frNext.disabled === true`" at 3, "`false`" at 5), and 5
 * is the boundary -- the one value a moved floor changes the answer for. */
test('Next stays disabled below 5 players and enables at 5', () => {
  assert.equal(shortOfLineup(4), true);
  assert.equal(shortOfLineup(5), false);
});

/* Proof item 2: the draft defaults and the commit. Expected values are the
 * spec's own (docs/specs/36-first-run.md), not read back off `newGame`'s
 * defaults -- which happen to match, so the committed draft below picks
 * different numbers to prove `startTeam` actually writes from the draft. */

test('newDraft gives the spec defaults', () => {
  const d = newDraft();
  assert.equal(d.periods, 4);
  assert.equal(d.periodMinutes, 8);
  assert.equal(d.granMode, 'everyN');
  assert.equal(d.granValue, 4);
});

test('a draft committed through startTeam writes exactly those onto state.day.games[0]', () => {
  const g = bareGame({ constraints: { ...S.emptyConstraints(),
    targetSlots: { p0: 3 }, targetCapacity: 5 } });
  withTeam([player('p0')], [g], {}, () => {
    const draft = { ...newDraft(), teamName: 'Sample team',
      periods: 2, periodMinutes: 6, granMode: 'perPeriod', granValue: 3 };
    const players = [{ name: 'Ann', number: '4' }, { name: 'Bo', number: '5' }];
    startTeam(players, draft.teamName, draft);
    assert.equal(g.periods, 2);
    assert.equal(g.periodMinutes, 6);
    assert.equal(g.granMode, 'perPeriod');
    assert.equal(g.granValue, 3);
    assert.deepEqual(g.constraints.targetSlots, {});
    assert.equal(g.constraints.targetCapacity, null);
  });
});

/* Proof item 3: the shell markup. A guard under /new-guard -- it reads
 * index.html directly, because these are facts about bytes, not behavior;
 * nothing runs them. */

test('#firstRunFlow is a dialog.flow, ships closed, sibling to #addGameFlow, outside every .view', () => {
  const doc = html();
  const tag = doc.match(/<dialog[^>]*id="firstRunFlow"[^>]*>/);
  assert.ok(tag, '#firstRunFlow is not a dialog in the markup');
  assert.match(tag[0], /class="[^"]*\bflow\b/, '#firstRunFlow does not carry the flow class');
  assert.ok(!/\sopen(\s|>)/.test(tag[0]), '#firstRunFlow ships with `open` -- it must not be the first frame');
  // same indentation as #addGameFlow: both are direct children of <body>,
  // never nested inside a .view -- this repo's convention is that depth is
  // indentation, checked directly rather than assumed
  const agLine = doc.slice(0, doc.indexOf('id="addGameFlow"')).match(/\n( *)<dialog[^\n]*$/);
  const frLine = doc.slice(0, doc.indexOf('id="firstRunFlow"')).match(/\n( *)<dialog[^\n]*$/);
  assert.ok(agLine && frLine, 'could not find the opening line of one of the two dialogs');
  assert.equal(frLine[1], agLine[1], '#firstRunFlow sits at a different depth than #addGameFlow');
  // outside every .view: its position must not fall inside any <main
  // class="view ...">...</main> block
  const at = doc.indexOf('id="firstRunFlow"');
  for (const m of doc.matchAll(/<main class="view[^"]*"[^>]*>/g)) {
    const start = m.index;
    const end = doc.indexOf('</main>', start);
    assert.ok(!(at > start && at < end), `#firstRunFlow sits inside ${m[0]}`);
  }
});

test('#frClose is the first child of .flow-bar-row', () => {
  const doc = html();
  const at = doc.indexOf('id="firstRunFlow"');
  const dialog = doc.slice(at, doc.indexOf('</dialog>', at));
  const barRow = dialog.slice(dialog.indexOf('flow-bar-row'));
  const firstChild = barRow.match(/<(\w+)[^>]*>/g)?.[0];
  assert.ok(firstChild, '.flow-bar-row inside #firstRunFlow has no children');
  assert.match(firstChild, /id="frClose"/, '#frClose is not the first child of .flow-bar-row');
});

/* Proof item 3 names this one, so it stays -- but `test/print-gate.test.js`
 * is the authority: it discovers the print/share triggers out of app.js and
 * asserts the set of `data-needs-card` carriers is EXACTLY that set, which
 * this cannot. Read as a locator (these two ids, in this markup), not as the
 * gate. */
test('#frPrint and #frShare carry data-needs-card', () => {
  const doc = html();
  for (const id of ['frPrint', 'frShare']) {
    const tag = doc.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `#${id} is not in the markup`);
    assert.match(tag[0], /data-needs-card/, `#${id} does not carry data-needs-card`);
  }
});

test('#welGo and #welSetup are gone', () => {
  const doc = html();
  assert.ok(!doc.includes('id="welGo"'), '#welGo is still in the markup');
  assert.ok(!doc.includes('id="welSetup"'), '#welSetup is still in the markup');
});

test('#welStart is .btn.primary and precedes #welTry in .wel-doors', () => {
  const doc = html();
  const doors = doc.slice(doc.indexOf('class="wel-doors"'), doc.indexOf('</div>', doc.indexOf('class="wel-doors"')));
  const start = doors.match(/<button[^>]*id="welStart"[^>]*>/);
  assert.ok(start, '#welStart is not in .wel-doors');
  assert.match(start[0], /class="[^"]*\bbtn\b[^"]*\bprimary\b/, '#welStart is not .btn.primary');
  const startAt = doors.indexOf('id="welStart"');
  const tryAt = doors.indexOf('id="welTry"');
  assert.ok(tryAt > startAt, '#welStart does not precede #welTry in .wel-doors');
});
