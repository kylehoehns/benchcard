/* #259 item C. Coverage taken from a real Chrome survives the page going away:
   V8 drops a page's counts when it is replaced, so the cdp client takes them
   first, for a `Page.navigate` that it sends itself and for a navigation the
   page makes on its own (`location.href =`, `location.reload()`); a navigation
   it did not see coming (a link click) is reported, not lost quietly. Each fixture page loads a script
   with one function called and one not; the page after it has no script, so
   anything counted for them was taken before they went. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, cdp, closeChrome } from '../scripts/smoke/chrome.mjs';
import { folder } from '../scripts/coverage.mjs';
import { NEEDS_CHROME } from './helpers/smoke-cli.mjs';

const script = name => [
  `function called_${name}() {`,    // 1
  '  return 1;',                    // 2
  '}',                              // 3
  `function uncalled_${name}() {`,  // 4
  '  return 2;',                    // 5
  '}',                              // 6
  `called_${name}();`,              // 7
].join('\n');
const page = body => `<!doctype html><title>t</title>${body}`;

/* d.js runs a different function on its second load in the same tab, so what
   the first load ran is only on record if it was taken before the reload. */
const RELOAD_SCRIPT = [
  'function first() {',                                 // 1
  '  return 1;',                                        // 2
  '}',                                                  // 3
  'function second() {',                                // 4
  '  return 2;',                                        // 5
  '}',                                                  // 6
  "if (!sessionStorage.n) { sessionStorage.n = '1'; first(); }",   // 7
  'else { second(); }',                                 // 8
].join('\n');

/* A fixture site, a Chrome driving it through `cdp`, and the folded coverage.
   `fn(run)` gets `{ c, origin, go, evaluate }`; `run` is returned after
   `stopCoverage`. */
async function withFixture({ takeMs }, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cov-fixture-'));
  writeFileSync(join(dir, 'a.js'), script('a'));
  writeFileSync(join(dir, 'c.js'), script('c'));
  writeFileSync(join(dir, 'd.js'), RELOAD_SCRIPT);
  writeFileSync(join(dir, 'a.html'), page('<script src="a.js"></script>'));
  writeFileSync(join(dir, 'c.html'), page('<script src="c.js"></script>'));
  writeFileSync(join(dir, 'd.html'), page('<script src="d.js"></script>'));
  writeFileSync(join(dir, 'b.html'), page('<p>no script here</p>'));
  writeFileSync(join(dir, 'l.html'), page('<script src="a.js"></script><a id="x" href="/b.html">go</a>'));
  const server = createServer((req, res) => {
    const file = new URL(req.url, 'http://x').pathname.slice(1);
    try {
      const body = readFileSync(join(dir, file));
      res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(0);
  await new Promise(ok => server.once('listening', ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let chrome;
  try {
    chrome = await launch(9222 + Math.floor(Math.random() * 500), false);
    const c = cdp(chrome.ws, takeMs === undefined ? {} : { takeMs });
    await c.ready;
    await c.send('Page.enable');
    const folded = folder({ appDir: dir, read: f => readFileSync(join(dir, f), 'utf8') });
    await c.startCoverage(entries => folded.add(entries));
    const loaded = () => new Promise(ok => c.on('Page.loadEventFired', ok));
    const go = async url => { const l = loaded(); await c.send('Page.navigate', { url: `${origin}/${url}` }); await l; };
    const evaluate = async expression => { const l = loaded(); await c.send('Runtime.evaluate', { expression }); await l; };
    await fn({ c, go, evaluate });
    const notes = await c.stopCoverage();
    c.close();
    return { merged: folded.result(), ...notes };
  } finally {
    if (chrome) await closeChrome(chrome.proc, chrome.dir);
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test('coverage survives a Page.navigate and an in-page location.href', { timeout: 60_000, ...NEEDS_CHROME }, async () => {
  const { merged, unseen, dropped } = await withFixture({}, async ({ go, evaluate }) => {
    await go('a.html');
    await go('b.html');                      // the hook: Page.navigate
    await go('c.html');
    await evaluate(`location.href = '/b.html'`);   // the page's own navigation
  });
  for (const name of ['a', 'c']) {
    const m = merged.get(`${name}.js`);
    assert.ok(m, `${name}.js is in the merged coverage`);
    assert.deepEqual([...m.covered].sort(), [1, 2, 3, 7], `${name}.js: called function and the call`);
    assert.deepEqual([...m.uncovered].sort(), [4, 5, 6], `${name}.js: the uncalled function`);
  }
  assert.deepEqual(unseen, [], 'every navigation had a take first');
  assert.deepEqual(dropped, []);
});

test('coverage survives an in-page location.reload()', { timeout: 60_000, ...NEEDS_CHROME }, async () => {
  const { merged, unseen } = await withFixture({}, async ({ go, evaluate }) => {
    await go('d.html');
    await evaluate('location.reload()');
  });
  const m = merged.get('d.js');
  assert.deepEqual([...m.covered].sort(), [1, 2, 3, 4, 5, 6, 7, 8], 'both loads are on record: first() from before the reload, second() after');
  assert.deepEqual(unseen, []);
});

test('a navigation no take came before is named, not silently lost: a link click', { timeout: 60_000, ...NEEDS_CHROME }, async () => {
  const { unseen } = await withFixture({}, async ({ go, evaluate }) => {
    await go('l.html');
    await evaluate(`document.getElementById('x').click()`);
  });
  assert.equal(unseen.length, 1, `unseen: ${JSON.stringify(unseen)}`);
  assert.ok(unseen[0].endsWith('/b.html'), unseen[0]);
});

test('a take that gets no answer in time is dropped and counted, and the run carries on', { timeout: 60_000, ...NEEDS_CHROME }, async () => {
  const { dropped, merged } = await withFixture({ takeMs: 0 }, async ({ go }) => {
    await go('a.html');
    await go('b.html');
    await go('c.html');
  });
  assert.ok(dropped.length >= 1, 'a take that timed out is named');
  assert.match(dropped[0], /takePreciseCoverage/);
  assert.ok(merged instanceof Map);
});
