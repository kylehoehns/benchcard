import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './js-comments.js';

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
  assert.match(body, /live\.at = openAt\(p, live\)/,
    'openGameMode must resolve its starting stint through live.js\'s openAt -- '
    + 'the finished/part-played decision lives there once, not re-checked here');
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
  /* #100: the second argument is no longer the bare `tipAfterGame` function --
     it also has to fire `fileOverdueDay()` on bench-mode close (one of the
     three moments a day that has gone past midnight gets filed). Matched as
     the whole `initGameMode(render, ..., { undoable, flash })` call, with
     both names required somewhere inside the middle argument, so the claim
     stays "both still run on close", not "close calls exactly this text". */
  const callSrc = app.slice(app.indexOf('initGameMode(render,'));
  const call = callSrc.slice(0, callSrc.indexOf('\n'));
  assert.match(call, /\{ undoable, flash \}\);$/,
    'app.js must hand undoable and flash to initGameMode');
  assert.match(call, /tipAfterGame\(/, 'app.js must still tip after a game on close');
  assert.match(call, /fileOverdueDay\(\)/, 'app.js must file an overdue day on bench-mode close (#100)');
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
  const live = readFileSync(new URL('../app/live.js', import.meta.url), 'utf8');
  const stageFn = live.slice(live.indexOf('export function stage'));
  const stageBody = stageFn.slice(0, stageFn.indexOf('\n}'));
  assert.match(stageBody, /at <= 0/, 'stint 0 is indistinguishable from "never started"');
  assert.match(stageBody, /at >= p\.stints\.length - 1/,
    'the last stint is a game that is over -- game mode restarts that one');
  const resumeFn = live.slice(live.indexOf('export function resumeAt'));
  const resumeBody = resumeFn.slice(0, resumeFn.indexOf('\n}'));
  assert.match(resumeBody, /periodName/, 'the label must follow halves as well as quarters');

  const card = readFileSync(new URL('../app/card.js', import.meta.url), 'utf8');
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

  /* #34 gave the app a SECOND entry point into bench mode -- Today's Resume
     bar -- and the claim above is only as strong as the files it reads. The
     bar's own painter (`renderResumeBar`) runs on every transition into
     Today, including the one a reload lands on, so an `openGameMode()` that
     drifted out of the tap handler and into module scope or into a render
     function would reopen bench mode on load exactly the way this test
     exists to prevent, while app.js stayed clean. */
  const teams = stripComments(readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8'));
  const sites = teams.match(/(?<![\w$.])openGameMode\s*\(/g) || [];
  assert.equal(sites.length, 1,
    'teams-view.js should call openGameMode exactly once -- from #resumeBtn\'s click handler and nowhere else');
  const at = teams.search(/(?<![\w$.])openGameMode\s*\(/);
  const wire = teams.indexOf("on('#resumeBtn'");
  assert.ok(wire > -1, "the #resumeBtn wiring moved; this guard is reading nothing");
  // Brace-match the handler so a call nested inside it still reads as inside.
  const open = teams.indexOf('{', wire);
  let depth = 0, end = open;
  for (; end < teams.length; end++) {
    if (teams[end] === '{') depth++;
    else if (teams[end] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(at > open && at < end,
    'the only openGameMode() in teams-view.js must sit inside #resumeBtn\'s click handler -- '
    + 'at module scope or in a render function it would open bench mode without a tap');
});

test('the stint dots are a picture, not twelve unhittable buttons', () => {
  /* They were `<button>`s that jumped to a stint. Measured in game mode on a
     390px phone: 17.8px wide with eight stints, 11.9px with twelve, 2.4px at
     150% text and 4.7px at 200% -- the strip is `flex: 1; min-width: 0`
     between two controls that are not, so it is what gives. Against the touch
     floor the app applies everywhere else (44px then, 48px since #37), and
     twelve of them were also twelve
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

test('closing bench mode repaints the game screen\'s own sub line, not just the panes behind it', () => {
  /* #123's Goal: a game's place is one answer everywhere. Found in a browser
     at 390x844 (RICH, game 0's live.at = 2): step to the last stint and close
     with #gmClose -- Today's pass turns Planned and #gmOpen reads "Start
     game", but the game screen's own #gameSub kept reading "... Underway"
     until the coach left Games and came back. #gameSub is painted by
     `renderTabs` (app/teams-view.js), dispatched through render.js's 'tabs'
     kind -- the same passStatus(live.js) call the pass and the button read,
     so the fix is asking for that repaint too, not a second place that
     decides the word. */
  const fn = src.slice(src.indexOf('function closeGameMode'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  const call = body.match(/render\(([^)]*)\)/);
  assert.ok(call, 'closeGameMode must still repaint on its way out');
  const kinds = call[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
  assert.ok(kinds.includes('tabs'),
    "closeGameMode's render(...) call must include 'tabs' -- renderTabs is what paints #gameSub, "
    + 'and none of cards/timeline/summary/gameview/resume repaint it');
});
