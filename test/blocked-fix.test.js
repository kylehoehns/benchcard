import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-stub.js';
const { blockedFix, BLOCKED_TITLE } = await import('../app/state.js');

/* Decision 7: the blocked panel's one exported pure error-to-fix mapping.
   First error in the issues list wins; every other error code falls back to
   "Change the rules" / the Plan sheet's rules group. One row per code that
   gets its own branch, each fed through `blockedFix` as the sole issue. */
const CODES = [
  { code: 'NOT_ENOUGH_PLAYERS', desc: "opens Who's here", label: "Change who's here", opener: 'who' },
  { code: 'UNITS_MISSING', desc: 'opens the strategy group to Fill a unit', label: 'Fill a unit', opener: 'strategy' },
  { code: 'UNIT_WRONG_SIZE', desc: 'opens the strategy group to Fill a unit', label: 'Fill a unit', opener: 'strategy' },
  { code: 'CLOSERS_TOO_MANY', desc: 'opens the strategy group to Change the rules', label: 'Change the rules', opener: 'strategy' },
  { code: 'CLOSERS_AVOID', desc: 'opens the strategy group to Change the rules', label: 'Change the rules', opener: 'strategy' },
  { code: 'MIN_EXCEEDS_GAME', desc: '(every other error) opens the rules group to Change the rules', label: 'Change the rules', opener: 'rules' },
];

for (const { code, desc, label, opener } of CODES) {
  test(`blockedFix: ${code} ${desc}`, () => {
    const message = `${code} message`;
    const fix = blockedFix([{ severity: 'error', code, message }]);
    assert.equal(fix.label, label);
    assert.equal(fix.opener, opener);
    assert.equal(fix.message, message, 'the error\'s own message passes through unchanged');
  });
}

test('blockedFix: the first error wins over a later, differently-mapped one', () => {
  const fix = blockedFix([
    { severity: 'error', code: 'NOT_ENOUGH_PLAYERS', message: 'Only 3 available; 5 are needed on the floor.' },
    { severity: 'error', code: 'UNITS_MISSING', message: 'Platoon needs at least one unit of 5.' },
  ]);
  assert.equal(fix.label, "Change who's here");
  assert.equal(fix.opener, 'who');
});

test('blockedFix: a warning or info ahead of the error is skipped', () => {
  const fix = blockedFix([
    { severity: 'warn', code: 'MIN_OFF_STINT_BOUNDARY', message: 'not the reason' },
    { severity: 'error', code: 'CLOSERS_TOO_MANY', message: '6 players are set to close but only 5 fit on the floor.' },
  ]);
  assert.equal(fix.label, 'Change the rules');
  assert.equal(fix.opener, 'strategy');
  assert.equal(fix.message, '6 players are set to close but only 5 fit on the floor.');
});

test('blockedFix: no error at all returns null', () => {
  assert.equal(blockedFix([]), null);
  assert.equal(blockedFix([{ severity: 'info', code: 'NO_SUBS_ALL_GAME', message: 'x' }]), null);
});

/* #29 fix pass finding 7: the blocked panel's title is typed once here so
   timeline.js and card.js read the same string instead of each carrying
   their own copy of the literal. */
test('BLOCKED_TITLE: the blocked panel title string', () => {
  assert.equal(BLOCKED_TITLE, "This plan can't be built");
});
