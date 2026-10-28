/* #357. The overflow walker in scripts/smoke/dom.mjs decides whether a coach
 * could be stranded past the edge of the screen; `narrow.mjs` and `sweep.mjs`
 * call it instead of keeping a loop of their own. Run here in a real Chrome at
 * 320px wide, against three small pages, so each verdict is judged on its own
 * rather than through whichever smoke row leans on it. Skips where there is no
 * Chrome (#235). */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, cdp, closeChrome } from '../scripts/smoke/chrome.mjs';
import { evalIn, TIMER_TRACKER, OVERFLOW_WALK } from '../scripts/smoke/dom.mjs';
import { narrowPass } from '../scripts/smoke/narrow.mjs';
import { NEEDS_CHROME } from './helpers/smoke-cli.mjs';

let chrome, c;

before(async () => {
  if (NEEDS_CHROME.skip) return;
  chrome = await launch(9800 + Math.floor(Math.random() * 150), false);
  c = cdp(chrome.ws);
  await c.ready;
  await c.send('Page.enable');
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: TIMER_TRACKER });
});
after(async () => {
  c?.close();
  if (chrome) await closeChrome(chrome.proc, chrome.dir);
});

/* A: a 600px child inside a parent that scrolls it (overflow-x auto, 100%).
   B: the same child inside a parent that is itself 700px wide and does not
      scroll -- the parent "overflows" too, which must not excuse the child.
   C: an element hung off the LEFT edge. */
/* Item 1, measured before narrow.mjs changed (narrowPass resizes to NARROW,
   360px, itself): on B it FAILED ("stranded off-screen: div → 700px"), so the
   false green was not real for B as written. On B2 below -- B inside a plain
   wrapper, which is how the app nests things -- it PASSED ("nothing
   stranded"): the wrapper's scrollWidth is over its clientWidth, and
   narrow.mjs's ancestor test excused anything under such a box. */
const META = '<meta name=viewport content="width=device-width">';
const FIXTURES = {
  A: `<div style="overflow-x:auto;width:100%"><div style="width:600px;height:20px">wide</div></div>`,
  B: `<div style="width:700px"><div style="width:600px;height:20px">wide</div></div>`,
  // B2: B inside a plain 100%-wide wrapper. The wrapper's scrollWidth is
  // over its clientWidth, which is all narrow.mjs's own ancestor test asks.
  B2: `<div><div style="width:700px"><div style="width:600px;height:20px">wide</div></div></div>`,
  // D: a 600px child inside a content-visibility:hidden box. The browser has
  // display-locked the subtree, so its rects are not trustworthy.
  D: `<div style="content-visibility:hidden;width:100px;height:50px"><div style="width:600px;height:20px">wide</div></div>`,
  C: `<div style="position:absolute;left:-50px;top:0;width:100px;height:20px">left</div>`,
};

async function openAt320(name) {
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  const html = `<!doctype html>${META}<body style="margin:0">${FIXTURES[name]}</body>`;
  await c.send('Page.navigate', { url: `data:text/html,${encodeURIComponent(html)}` });
  await loaded;
}

const CHROME = { timeout: 30_000, ...NEEDS_CHROME };
const walk = async (opts = '') => JSON.parse(await evalIn(c, `JSON.stringify((${OVERFLOW_WALK})(${opts}))`));

test('walker: a 600px child inside a scrolling 100% parent is not overflow (A)', CHROME, async () => {
  await openAt320('A');
  const r = await walk();
  assert.equal(r.worst, null, `reported ${JSON.stringify(r.worst)}`);
});

for (const [name, title] of [
  ['B', 'a 600px child inside a 700px non-scrolling parent is overflow (B)'],
  ['B2', 'the same inside a plain wrapper is still overflow (B2)'],
]) {
  test(`walker: ${title}`, CHROME, async () => {
    await openAt320(name);
    const r = await walk();
    assert.ok(r.worst, 'reported nothing');
    assert.ok(r.worst.out >= 280, `out was ${r.worst.out}`);
  });
}

test('walker: an element at left -50px reports a negative right (C)', CHROME, async () => {
  await openAt320('C');
  const r = await walk();
  assert.ok(r.worst, 'reported nothing');
  assert.ok(r.worst.right < 0, `right was ${r.worst.right}`);
});

test('walker returns vw, pans and a seen count of the boxes it measured', CHROME, async () => {
  await openAt320('A');
  const r = await walk();
  assert.equal(r.vw, 320);
  assert.equal(r.pans, false);
  assert.equal(r.seen, 2);
});

test('walker with visible:true skips a display-locked subtree; the default does not', CHROME, async () => {
  await openAt320('A');
  await evalIn(c, `document.body.insertAdjacentHTML('beforeend', '<div style="content-visibility:hidden;width:50px;height:50px"><i style="display:block;width:10px;height:10px">x</i></div>'); 0`);
  const plain = await walk();
  const vis = await walk('{ visible: true }');
  assert.equal(plain.seen, 4, 'the default walk counts every drawn box');
  assert.equal(vis.seen, 3, 'visible:true leaves the locked child out');
});

test('narrowPass fails fixture B and B2, passes A', CHROME, async () => {
  const got = {};
  for (const name of ['A', 'B', 'B2']) { await openAt320(name); got[name] = (await narrowPass(c)).pass; }
  assert.deepEqual(got, { A: true, B: false, B2: false });
});

test('narrowPass leaves a display-locked subtree out, as sweepPass does', CHROME, async () => {
  await openAt320('D');
  const plain = await walk();
  assert.ok(plain.worst, 'the default walk should see the locked child, or this fixture proves nothing');
  assert.equal((await narrowPass(c)).pass, true);
});
