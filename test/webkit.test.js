/* #597: the WebKit run's pure parts, at the seams the spec's Proof names: the
 * loader's missing-module message, the CDP-to-Playwright adapter against a fake
 * page, and each row's verdict function. No Playwright and no browser here:
 * `npm test` must pass with neither installed. Expected values are typed from
 * the spec. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLAYWRIGHT_VERSION, loadPlaywright } from '../scripts/webkit/playwright.mjs';

/* ---------- the loader ---------- */

test('the pinned Playwright version is 1.64.1', () => {
  assert.equal(PLAYWRIGHT_VERSION, '1.64.1');
});

test('a module that cannot be found gives the install line and nothing else', async () => {
  await assert.rejects(loadPlaywright('benchcard-no-such-module-597'), e => {
    assert.equal(e.message, 'Playwright not installed: run npm install --no-save --no-package-lock '
      + 'playwright@1.64.1 && npx playwright@1.64.1 install webkit');
    return true;
  });
});

/* ---------- the adapter: CDP in, Playwright out ---------- */

import { EventEmitter } from 'node:events';
import { cdpOverPage } from '../scripts/webkit/cdp.mjs';
import { listen } from '../scripts/smoke/chrome.mjs';

/* A page that writes down what it was asked, and answers from `answers`. */
function fakePage(answers = {}) {
  const page = new EventEmitter();
  page.calls = [];
  const note = (name, fn = () => undefined) => (...args) => {
    page.calls.push([name, ...args]);
    return Promise.resolve(fn(...args));
  };
  page.evaluate = note('evaluate', answers.evaluate);
  page.goto = note('goto');
  page.setViewportSize = note('setViewportSize');
  page.emulateMedia = note('emulateMedia');
  page.screenshot = note('screenshot', () => Buffer.from('PNGBYTES'));
  page.disposed = [];
  page.addInitScript = note('addInitScript', source => ({ dispose: () => { page.disposed.push(source); return Promise.resolve(); } }));
  page.mouse = { move: note('mouse.move'), down: note('mouse.down'), up: note('mouse.up') };
  page.keyboard = { down: note('keyboard.down'), up: note('keyboard.up') };
  return page;
}
const calls = (page, name) => page.calls.filter(c => c[0] === name).map(c => c.slice(1));

test('Runtime.evaluate hands the expression to the page and returns its value', async () => {
  const page = fakePage({ evaluate: () => 'hello' });
  const c = cdpOverPage(page, { close: async () => {} });
  const r = await c.send('Runtime.evaluate', { expression: '1 + 1', awaitPromise: true, returnByValue: true });
  assert.deepEqual(r, { result: { value: 'hello' } });
  assert.deepEqual(calls(page, 'evaluate'), [['1 + 1']]);
});

test('Runtime.evaluate turns a page error into exceptionDetails, as Chrome answers', async () => {
  const page = fakePage({ evaluate: () => { throw new Error('boom: x is not defined'); } });
  const c = cdpOverPage(page, { close: async () => {} });
  const r = await c.send('Runtime.evaluate', { expression: 'x' });
  assert.equal(r.exceptionDetails.text, 'boom: x is not defined');
  assert.equal(r.exceptionDetails.exception.description, 'boom: x is not defined');
});

test('Page.navigate goes to the url and a load on the page fires Page.loadEventFired until it is taken off', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  let fired = 0;
  const on = () => { fired++; };
  c.on('Page.loadEventFired', on);
  await c.send('Page.navigate', { url: 'http://127.0.0.1:1/index.html' });
  assert.deepEqual(calls(page, 'goto'), [['http://127.0.0.1:1/index.html', { waitUntil: 'load' }]]);
  page.emit('load');
  assert.equal(fired, 1);
  c.off('Page.loadEventFired', on);
  page.emit('load');
  assert.equal(fired, 1, 'a listener taken off was still called');
});

test('a script added for new documents is an init script, and removing it disposes exactly that one', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  const a = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: 'A()' });
  const b = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: 'B()' });
  assert.notEqual(a.identifier, b.identifier);
  assert.deepEqual(calls(page, 'addInitScript'), [['A()'], ['B()']]);
  await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: a.identifier });
  assert.deepEqual(page.disposed, ['A()']);
});

test('the viewport override sets the viewport size and nothing else', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  await c.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  assert.deepEqual(calls(page, 'setViewportSize'), [[{ width: 320, height: 640 }]]);
});

test('a text size is applied to the page now, and to every later document, replacing the one before', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  await c.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
  await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
  const inits = calls(page, 'addInitScript').map(([s]) => s);
  assert.equal(inits.length, 2);
  assert.match(inits[0], /32px/);
  assert.match(inits[1], /16px/);
  assert.deepEqual(page.disposed, [inits[0]], 'the 32px init script still runs on later pages');
  const live = calls(page, 'evaluate').map(([s]) => s);
  assert.equal(live.length, 2);
  assert.match(live[1], /16px/);
  assert.match(live[1], /font-size/);
});

test('emulated media maps each feature to the Playwright option, and an empty list clears them', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  await c.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-color-scheme', value: 'dark' },
    { name: 'forced-colors', value: 'active' },
  ] });
  await c.send('Emulation.setEmulatedMedia', { features: [] });
  assert.deepEqual(calls(page, 'emulateMedia'), [
    [{ reducedMotion: 'reduce', colorScheme: 'dark', forcedColors: 'active' }],
    [{ reducedMotion: null, colorScheme: null, forcedColors: null }],
  ]);
});

test('an emulated media feature with no Playwright option throws, naming it', async () => {
  const c = cdpOverPage(fakePage(), { close: async () => {} });
  await assert.rejects(c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-contrast', value: 'more' }] }),
    /prefers-contrast/);
});

test('a screenshot comes back as base64 data', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  assert.equal(r.data, Buffer.from('PNGBYTES').toString('base64'));
  assert.deepEqual(calls(page, 'screenshot'), [[{ type: 'png' }]]);
});

test('mouse and key events go to the page mouse and keyboard', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 6 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 6, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 6, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape' });
  await c.send('Input.dispatchKeyEvent', { type: 'char', key: 'a', text: 'a' });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  /* Playwright's down and up act where the pointer is, and CDP's carry their own
   position, so the pointer is moved to it first (a click sent without a move
   would land at 0,0). */
  assert.deepEqual(page.calls.filter(c => c[0].startsWith('mouse.')).map(c => c[0]),
    ['mouse.move', 'mouse.move', 'mouse.down', 'mouse.move', 'mouse.up']);
  assert.deepEqual(calls(page, 'mouse.move'), [[5, 6], [5, 6], [5, 6]]);
  assert.deepEqual(calls(page, 'mouse.down'), [[{ button: 'left', clickCount: 1 }]]);
  assert.deepEqual(calls(page, 'mouse.up'), [[{ button: 'left', clickCount: 1 }]]);
  assert.deepEqual(calls(page, 'keyboard.down'), [['Escape']]);
  assert.deepEqual(calls(page, 'keyboard.up'), [['Escape']]);
});

test('the enabling calls Chrome needs and the context already does are accepted and do nothing', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  for (const m of ['Runtime.enable', 'Page.enable', 'Network.enable', 'Network.setBypassServiceWorker', 'Emulation.setTouchEmulationEnabled']) {
    await c.send(m, {});
  }
  assert.deepEqual(page.calls, []);
});

test('a CDP method WebKit has no meaning for throws, naming the method', async () => {
  const c = cdpOverPage(fakePage(), { close: async () => {} });
  await assert.rejects(c.send('Animation.setPlaybackRate', { playbackRate: 100 }),
    /WebKit has no equivalent for CDP Animation\.setPlaybackRate/);
  await assert.rejects(c.send('Page.getFrameTree'), /WebKit has no equivalent for CDP Page\.getFrameTree/);
});

test('ready is resolved and close closes the browser', async () => {
  let closed = 0;
  const c = cdpOverPage(fakePage(), { close: async () => { closed++; } });
  await c.ready;
  await c.close();
  assert.equal(closed, 1);
});

/* ---------- the verdicts: each row's pass/fail, from facts read off the page ---------- */

import {
  printProblems, homeScreenProblems, shareImageProblems, benchProblems, addGameProblems,
  rowOf, tableOf, exitCodeOf,
} from '../scripts/webkit/verdicts.mjs';

const has = (problems, pattern) => assert.ok(problems.some(p => pattern.test(p)), `no problem matching ${pattern} in ${JSON.stringify(problems)}`);

test('print: one window.print() with the game screen showing passes', () => {
  assert.deepEqual(printProblems({ found: true, prints: [['Ravens']], views: ['view-games'] }), []);
});

test('print: no button found is a failure, not a pass', () => {
  has(printProblems({ found: false, prints: [], views: [] }), /Print card for Ravens/);
});

test('print: no print, two prints, or a print from the wrong screen fail', () => {
  has(printProblems({ found: true, prints: [], views: [] }), /0 time/);
  has(printProblems({ found: true, prints: [['Ravens'], ['Ravens']], views: ['view-games', 'view-games'] }), /2 time/);
  has(printProblems({ found: true, prints: [['Ravens']], views: ['view-today'] }), /view-today/);
});

const SHARED = { files: ['benchcard-ravens.png'], types: ['image/png'] };

test('home-screen print: one image/png named benchcard-ravens.png and no window.print() passes', () => {
  assert.deepEqual(homeScreenProblems({ where: 'Today', found: true, shares: [SHARED], prints: [] }), []);
});

test('home-screen print: the Nov 1 bug (window.print() called, nothing shared) fails', () => {
  const p = homeScreenProblems({ where: 'Today', found: true, shares: [], prints: [['Ravens']] });
  has(p, /Today.*0 image/);
  has(p, /Today.*window\.print\(\) 1 time/);
});

test('home-screen print: a missing button, a second share, a wrong name or type each fail', () => {
  has(homeScreenProblems({ where: 'Today', found: false, shares: [], prints: [] }), /\.today-print/);
  has(homeScreenProblems({ where: 'the game screen', found: true, shares: [SHARED, SHARED], prints: [] }), /game screen.*2 image/);
  has(homeScreenProblems({ where: 'Today', found: true, shares: [{ files: ['card.png'], types: ['image/png'] }], prints: [] }), /card\.png/);
  has(homeScreenProblems({ where: 'Today', found: true, shares: [{ files: ['benchcard-ravens.png'], types: ['image/jpeg'] }], prints: [] }), /image\/jpeg/);
});

test('share image: reaching navigator.share, or either fallback toast, passes', () => {
  assert.deepEqual(shareImageProblems({ found: true, shares: [{ files: ['benchcard-hawks.png'], types: ['image/png'] }], toasts: [] }), []);
  assert.deepEqual(shareImageProblems({ found: true, shares: [], toasts: ['Card copied. Paste it into a message.'] }), []);
  assert.deepEqual(shareImageProblems({ found: true, shares: [], toasts: ['Card saved as a PNG.'] }), []);
});

test('share image: no share, no toast fails, and so does an error toast or a missing button', () => {
  has(shareImageProblems({ found: true, shares: [], toasts: [] }), /neither/);
  has(shareImageProblems({ found: true, shares: [], toasts: ['Could not make the image. Print still works.'] }), /neither/);
  has(shareImageProblems({ found: false, shares: [], toasts: [] }), /#shareCard/);
});

const scroller = (over = {}) => ({ el: 'div.gm-body', scrollbarWidth: 'none', gutter: 0, ...over });

test('bench scroll bars: every scroller hidden and 0px passes', () => {
  const r = benchProblems({ scrollers: [scroller(), scroller({ el: 'div.gm-list' })], controlGutter: 15 });
  assert.deepEqual(r.problems, []);
  assert.equal(r.widthArm, 'checked');
});

test('bench scroll bars: a scroller that is not scrollbar-width none fails (the #549 class)', () => {
  const r = benchProblems({ scrollers: [scroller({ scrollbarWidth: 'auto', gutter: 15 })], controlGutter: 15 });
  has(r.problems, /div\.gm-body.*scrollbar-width.*auto/);
  has(r.problems, /div\.gm-body.*15px/);
});

test('bench scroll bars: overlay scroll bars skip the width arm with the reason, and the style arm still judges', () => {
  const ok = benchProblems({ scrollers: [scroller()], controlGutter: 0 });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.widthArm, 'skipped');
  assert.match(ok.reason, /overlay/);
  has(benchProblems({ scrollers: [scroller({ scrollbarWidth: 'auto' })], controlGutter: 0 }).problems, /scrollbar-width/);
});

test('bench scroll bars: no scroller found is a failure, not a pass', () => {
  has(benchProblems({ scrollers: [], controlGutter: 15 }).problems, /no scroller/);
});

test('add a game: the flow closes, one more Panthers game, and its pass on Today passes', () => {
  assert.deepEqual(addGameProblems({
    closed: true, before: ['Hawks', 'Ravens'], after: ['Hawks', 'Ravens', 'Panthers'], passes: ['Hawks', 'Ravens', 'Panthers 0 min'],
  }), []);
});

test('add a game: a flow left open, no new game, a wrong label or no pass on Today fail', () => {
  const base = { closed: true, before: ['Hawks', 'Ravens'], after: ['Hawks', 'Ravens', 'Panthers'], passes: ['Hawks', 'Ravens', 'Panthers'] };
  has(addGameProblems({ ...base, closed: false }), /still open/);
  has(addGameProblems({ ...base, after: ['Hawks', 'Ravens'] }), /2 game/);
  has(addGameProblems({ ...base, after: ['Hawks', 'Ravens', 'Eagles'] }), /Panthers/);
  has(addGameProblems({ ...base, passes: ['Hawks', 'Ravens'] }), /pass/);
  has(addGameProblems({ ...base, before: [], after: [], passes: [] }), /measured nothing|no games/);
});

test('a row is PASS with no problems, FAIL with any, and a FAIL names every problem', () => {
  assert.deepEqual(rowOf('print', [], 'one print'), { name: 'print', status: 'PASS', detail: 'one print' });
  const r = rowOf('print', ['a', 'b'], 'x');
  assert.equal(r.status, 'FAIL');
  assert.match(r.detail, /a; b/);
});

test('the table lists every row with its status, and the exit code is 1 on any FAIL or no rows', () => {
  const rows = [rowOf('print', [], 'ok'), { name: 'bench mode scroll bars', status: 'SKIP', detail: 'overlay' }];
  const t = tableOf(rows);
  assert.match(t, /PASS\s+print\s+ok/);
  assert.match(t, /SKIP\s+bench mode scroll bars\s+overlay/);
  assert.equal(exitCodeOf(rows), 0);
  assert.equal(exitCodeOf([...rows, rowOf('add a game', ['x'], '')]), 1);
  assert.equal(exitCodeOf([]), 1, 'a run with no rows measured nothing');
});

/* ---------- running a row: a throw or a hang is a FAIL, never a pass or a crash ---------- */

import { runRow } from '../scripts/webkit/verdicts.mjs';

test('runRow returns the row the check built', async () => {
  const row = await runRow('print', async () => rowOf('print', [], 'fine'), 1000);
  assert.deepEqual(row, { name: 'print', status: 'PASS', detail: 'fine' });
});

test('runRow turns a throw into a FAIL that says what was thrown', async () => {
  const row = await runRow('print', async () => { throw new Error('WebKit has no equivalent for CDP X.y'); }, 1000);
  assert.equal(row.status, 'FAIL');
  assert.equal(row.name, 'print');
  assert.match(row.detail, /threw: WebKit has no equivalent for CDP X\.y/);
});

test('runRow turns a check that never answers into a FAIL after its time', async () => {
  const row = await runRow('print', () => new Promise(() => {}), 30);
  assert.equal(row.status, 'FAIL');
  assert.match(row.detail, /no answer in 30 ms/);
});

/* ---------- console errors through look.mjs's listen() (#609 probe) ---------- */

test('Log.enable is answered, and listen() hears console errors, page errors and failed responses', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  assert.deepEqual(await c.send('Log.enable'), {});
  const heard = [];
  listen(c, t => heard.push(t));
  page.emit('console', { type: () => 'error', text: () => 'look: console probe (ignore)' });
  page.emit('console', { type: () => 'log', text: () => 'not an error' });
  page.emit('pageerror', new Error('x is not a function'));
  page.emit('response', { status: () => 404, url: () => 'http://127.0.0.1:1/gone.js' });
  page.emit('response', { status: () => 200, url: () => 'http://127.0.0.1:1/fine.js' });
  assert.equal(heard.length, 3, heard.join(' | '));
  assert.equal(heard[0], 'look: console probe (ignore)');
  assert.match(heard[1], /x is not a function/);
  assert.match(heard[2], /404/);
  assert.match(heard[2], /gone\.js/);
});

test('a console listener taken off with off() hears nothing more', async () => {
  const page = fakePage();
  const c = cdpOverPage(page, { close: async () => {} });
  let n = 0;
  const fn = () => { n++; };
  c.on('Runtime.consoleAPICalled', fn);
  page.emit('console', { type: () => 'error', text: () => 'one' });
  c.off('Runtime.consoleAPICalled', fn);
  page.emit('console', { type: () => 'error', text: () => 'two' });
  assert.equal(n, 1);
});
