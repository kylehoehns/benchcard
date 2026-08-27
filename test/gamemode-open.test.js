import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* gamemode.js reaches for the DOM at import time, so these read the source.
   What is being pinned is a decision that already failed silently once. */
const src = readFileSync(new URL('../app/gamemode.js', import.meta.url), 'utf8');

test('the entry transition is the sheet, and it measures nothing', () => {
  /* The shared-element grow was tuned four separate times and still read as
     janky, so three structurally different candidates went behind `?fx=` and
     the sheet was picked. What is pinned here is the property that made
     it the safe pick as well as the nice one: it asks the page no questions.

     The grow measured an origin rect and got the wrong answer twice in
     production -- 0x0 against the card preview, which is folded away by
     default below 1100px, so every mobile open silently took the plain CSS
     fade instead; and `top: 855` against an 844px viewport when the coach
     beat the action bar's own slide-in. Both degraded to something
     indistinguishable from the animation not running. There is no rect here
     to be wrong, and there must not be one again. */
  const fn = src.slice(src.indexOf('function enterGameMode'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /sheetUp\(gm, \{ recede: pageBehind\(\) \}\)/,
    'the sheet is the entry transition');
  assert.doesNotMatch(body, /\bif \(v ===|entryVariant/,
    'the ?fx= switch is gone; the sheet is unconditional');
  const open = src.slice(src.indexOf('export function openGameMode'));
  assert.doesNotMatch(body + open.slice(0, open.indexOf('\n}')), /getBoundingClientRect/,
    'nothing on the way into game mode may measure the page -- that is the bug class the sheet closes');
  assert.doesNotMatch(src, /growFrom|cutIn|stagedIn|originRect|\?fx=|'fx'/,
    'the losing variants and the switch that compared them are deleted');
  assert.match(body, /gm\.style\.animation = 'none'/,
    'the CSS keyframe must not fight the JS over transform');
  assert.match(body, /if \(!ok\) gm\.style\.animation = ''/,
    'and it must come back when sheetUp declines under reduced motion');
});

test('a tap ends the entry transition instead of waiting it out', () => {
  /* Nothing may stand between the coach and the first substitution. Finishing
     is not cancelling: none of these animations fill, so finishing lands on
     the state the page would have had a moment later. */
  const fn = src.slice(src.indexOf('function armInterrupt'));
  const body = fn.slice(0, fn.indexOf('\nexport'));
  assert.match(body, /pointerdown/);
  assert.match(body, /a\.finish\(\)/, 'the transition is finished, not cancelled');
  assert.match(body, /requestAnimationFrame/,
    'Motion creates its animations a frame late, so one sweep can find nothing');
});

test('a finished game starts over; an unfinished one resumes', () => {
  /* Holding the position is the point during a game -- close it at Q3 4:00 to
     check something and you must not come back at Q1. But reopening on the
     last stint of a game already coached reads as stuck rather than resumed,
     which is how it was reported. */
  const open = src.slice(src.indexOf('export function openGameMode'));
  const body = open.slice(0, open.indexOf('\n}'));
  assert.match(body, /live\.at >= p\.stints\.length - 1/,
    'reopening on the last stint should reset to the start');
  assert.match(body, /live\.at = 0/);
  assert.ok(!/live\.at = 0;\s*$/m.test(body.split('live.at >= p.stints.length - 1')[0]),
    'the reset must be conditional, not unconditional');
});

test('every mid-game edit offers an undo, and takes the previous offer down', () => {
  /* "Back to the printed plan" leaves a nine-second undo up. A swap made while
     it is still there is an edit its snapshot predates, so pressing Undo threw
     the new swap away silently. `applySwap` used to answer that with an
     injected `retireUndo()`; it now answers it by OFFERING an undo of its own,
     which is strictly stronger -- `undoable` snapshots after the older edit and
     `actionToast` empties the single toast box before appending, so the stale
     offer is replaced rather than merely dismissed, and the swap itself finally
     has a one-tap way back. `retireUndo` had no other caller in this module and
     went with it.

     Everything still arrives by injection: toast.js imports `clearPick` from
     gamemode.js, so importing back the other way would close a cycle. */
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  assert.match(app, /initGameMode\(render, tipAfterGame, \{ undoable, flash \}\)/,
    'app.js must hand undoable and flash to initGameMode');
  assert.match(src, /export function initGameMode\(renderFn, onCloseFn, toastFns\)/,
    'initGameMode should take the render, the close hook and the toast API');
  assert.doesNotMatch(src, /from '\.\/toast\.js'/,
    'gamemode.js importing toast.js would close a cycle');
  /* The mid-game re-solve goes through the same door for the same reason: it
     offers an Undo rather than a confirm, and `undoable` lives in toast.js. */
  for (const fn of ['undoable', 'flash']) {
    assert.match(src, new RegExp(`toastFns\\?\\.${fn}`),
      `${fn} must be injected, not imported`);
  }
  /* Both of game mode's writes to `live.overrides` -- the hand swap and the
     rebalance -- and nothing between them may write outside an `undoable`. */
  for (const name of ['applySwap', 'sitRest']) {
    const body = src.slice(src.indexOf(`function ${name}`)).split('\n}')[0];
    assert.match(body, /undoable\(/, `${name} must offer an undo`);
    assert.ok(body.indexOf('undoable(') < body.indexOf('live.overrides['),
      `${name} must write inside undoable's mutation, after the snapshot is taken`);
    assert.doesNotMatch(body, /retireUndo\(/,
      `${name} offers its own undo; retiring one as well is a second mechanism`);
  }
  /* Comments strip first, or this scores the paragraph above `undoable` that
     explains why `retireUndo` left -- the same way a source-text guard
     anchored on a name gets satisfied by its own explanation. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  assert.doesNotMatch(code, /\bretireUndo\b/,
    'retireUndo lost its last caller here; the injection must go with it');
});

test('a part-played game says so on the plan page', () => {
  /* A reload shuts bench mode -- on iOS, switching to the clock app and back
     is often enough -- and the coach landed on Games with nothing saying a
     game was underway, over a button reading "Use on the bench", which reads
     as *start*. State survived fine; only the page was silent. */
  const card = readFileSync(new URL('../app/card.js', import.meta.url), 'utf8');
  const fn = card.slice(card.indexOf('export function resumeAt'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /at <= 0/, 'stint 0 is indistinguishable from "never started"');
  assert.match(body, /at >= p\.stints\.length - 1/,
    'the last stint is a game that is over -- game mode restarts that one');
  assert.match(body, /periodName/, 'the label must follow halves as well as quarters');
  assert.match(card, /labelBench\(blocked\)/,
    'renderCards must relabel the bench buttons');
  assert.match(card, /Resume/, 'the button should say Resume, not start');

  const tl = readFileSync(new URL('../app/timeline.js', import.meta.url), 'utf8');
  assert.match(tl, /resumeAt/, 'the timeline should mark where the game is');
  assert.match(tl, /tl-now/);
});

test('a reload does not force the coach back into bench mode', () => {
  /* Deliberately only (a) of the two candidate fixes: reopening on load would
     trap a coach who reloaded *because* something was wrong. */
  const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
  const calls = app.match(/^\s*openGameMode\(/gm) || [];
  assert.equal(calls.length, 0,
    'openGameMode must only ever be called from a control the coach pressed');
});

test('the stint dots are a picture, not twelve unhittable buttons', () => {
  /* They were `<button>`s that jumped to a stint. Measured in game mode on a
     390px phone: 17.8px wide with eight stints, 11.9px with twelve, 2.4px at
     150% text and 4.7px at 200% -- the strip is `flex: 1; min-width: 0`
     between two controls that are not, so it is what gives. Against a 44px
     rule the app applies everywhere else, and twelve of them were also twelve
     tab stops between Previous and Next, each announcing "Stint 4 of 12" on
     the way past.

     Sliced to the loop rather than the file: the paragraph above it in
     gamemode.js explains all of this and names both `button` and
     `aria-hidden`, and a guard that reads its own explanation is not a
     guard. */
  const loop = src.slice(src.indexOf('for (let k = from;'), src.indexOf("set('#gmPrev'"));
  assert.ok(loop.length > 20 && loop.length < 600, 'the dot loop moved; this guard is reading the wrong slice');
  assert.match(loop, /el\('div', 'gm-dot'/, 'a stint dot is a div; a 12px button is not a place a thumb can go');
  assert.doesNotMatch(loop, /el\('button'|\.onclick|addEventListener|tabIndex/i,
    'the dots are interactive again -- prev/next, the swipe and the keyboard are the ways to move a stint');

  /* And the strip says nothing to a screen reader, because `#gmGame` already
     says "stint N of M" in words directly above it. */
  const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="gmDots" aria-hidden="true"/,
    'the dot strip is announced again, one dot at a time, next to the sentence that already says it');
});
