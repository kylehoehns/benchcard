/* #259 item C. Coverage taken from a real Chrome survives the page going away:
   V8 drops a page's counts when it is replaced, so the cdp client takes them
   first, for a `Page.navigate` that it sends itself and for a navigation the
   page makes on its own (`location.href =`). Each fixture page loads a script
   with one function called and one not; the page after it has no script, so
   anything counted for them was taken before they went. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, cdp, closeChrome } from '../scripts/smoke/chrome.mjs';
import { merge } from '../scripts/coverage.mjs';
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

test('coverage survives a Page.navigate and an in-page location.href', { timeout: 60_000, ...NEEDS_CHROME }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cov-fixture-'));
  writeFileSync(join(dir, 'a.js'), script('a'));
  writeFileSync(join(dir, 'c.js'), script('c'));
  writeFileSync(join(dir, 'a.html'), page('<script src="a.js"></script>'));
  writeFileSync(join(dir, 'c.html'), page('<script src="c.js"></script>'));
  writeFileSync(join(dir, 'b.html'), page('<p>no script here</p>'));
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
    const c = cdp(chrome.ws);
    await c.ready;
    await c.send('Page.enable');
    await c.startCoverage();
    const loaded = () => new Promise(ok => c.on('Page.loadEventFired', ok));
    const go = async url => { const l = loaded(); await c.send('Page.navigate', { url }); await l; };

    await go(`${origin}/a.html`);
    await go(`${origin}/b.html`);            // the hook: Page.navigate
    await go(`${origin}/c.html`);
    const l = loaded();
    await c.send('Runtime.evaluate', { expression: `location.href = '/b.html'` });
    await l;                                 // the page's own navigation
    const reports = await c.stopCoverage();
    c.close();

    const merged = merge(reports, { appDir: dir, read: f => readFileSync(join(dir, f), 'utf8') });
    for (const name of ['a', 'c']) {
      const m = merged.get(`${name}.js`);
      assert.ok(m, `${name}.js is in the merged coverage`);
      assert.deepEqual([...m.covered].sort(), [1, 2, 3, 7], `${name}.js: called function and the call`);
      assert.deepEqual([...m.uncovered].sort(), [4, 5, 6], `${name}.js: the uncalled function`);
    }
  } finally {
    if (chrome) await closeChrome(chrome.proc, chrome.dir);
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
