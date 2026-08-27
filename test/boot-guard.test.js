import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KEY, V5_KEY, V4_KEY, V3_KEY } from '../app/storage.js';

/* A broken boot must say so, and must still hand the coach their season.
 *
 * `#view-games` is the only view in index.html that is not `hidden`, so until
 * this existed a throw anywhere in the boot graph left a coach looking at a
 * live, empty shell: no message, no console they would ever open, and no route
 * to their backup. Nothing was reported either -- there was not one
 * `window.onerror`, `unhandledrejection` or try/catch at the boot boundary in
 * the whole of `app/`.
 *
 * The guard is an inline script in the head, and that placement IS the
 * feature: a handler installed from a module cannot see a throw at the top of
 * app.js, because module bodies run after every import they pull in. So these
 * are source-level assertions -- there is no DOM here, and the thing being
 * pinned is where the code lives as much as what it does.
 *
 * The rendered half is checked by hand in a browser (break the boot, watch the
 * panel paint, click the download). What a test can hold is everything that
 * would silently rot: the placement, the reuse, the key chain, and the fact
 * that no message and no stack is ever handed to `track`.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const appJs = read('app.js');

/* The guard's own script element: the one that installs the handlers. Sliced
   out by hand rather than "the second script", so inserting an unrelated one
   above it does not silently re-point this whole file at the wrong code. */
const guard = (() => {
  const at = html.indexOf('window.benchcard');
  assert.ok(at > 0, 'the boot guard is gone from index.html');
  const open = html.lastIndexOf('<script>', at);
  return html.slice(open + '<script>'.length, html.indexOf('</script>', at));
})();

test('the guard is inline, in the head, and above the module graph', () => {
  const at = html.indexOf('window.benchcard');
  assert.ok(at < html.indexOf('</head>'),
    'the boot guard left the head; it can no longer see a throw in a module');
  assert.ok(!/<script[^>]*\bsrc=/.test(html.slice(0, at)),
    'a script now loads before the boot guard, so a failure in it goes unreported');
  // it must not become a module: a module cannot report its own failure to
  // load, and a second file is a 41st request against a budget pinned at 41
  const tag = html.lastIndexOf('<script', at);
  assert.equal(html.slice(tag, html.indexOf('>', tag)), '<script',
    'the boot guard grew an attribute -- type="module" or defer would break it');
});

test('both global handlers are installed, and the boot catch reports too', () => {
  assert.match(guard, /addEventListener\('error'/);
  assert.match(guard, /addEventListener\('unhandledrejection'/);
  // the second half: app.js's boot boundary
  const at = appJs.indexOf('renderAll();\n  if (window.benchcard)');
  assert.ok(at > 0, 'the boot renderAll() is no longer inside a try/catch');
  const boundary = appJs.slice(appJs.lastIndexOf('try {', at));
  assert.match(boundary, /catch/);
  assert.match(boundary, /window\.benchcard\?\.fail\('boot'\)/);
  assert.match(boundary, /booted = true/);
});

test('nothing but the bounded `where` is ever handed to track', () => {
  const call = guard.match(/m\.track\(([\s\S]*?)\);/);
  assert.ok(call, 'the guard no longer reports anything');
  assert.match(call[1], /'app_error'/);
  for (const leak of ['message', 'stack', 'error', 'lineno', 'colno', 'name', 'team']) {
    assert.ok(!new RegExp(`\\b${leak}\\b`).test(call[1]),
      `the error report carries ${leak}, which can hold what a coach typed`);
  }
  // and the listener must not be closing over the message either
  assert.ok(!/function \(e\) \{ report\(null, e && e\.message/.test(guard),
    'the guard classifies on the message rather than the script');
});

test('the recovery panel reuses backup.js rather than rebuilding it', () => {
  assert.match(guard, /import\('\.\/backup\.js'\)/);
  assert.match(guard, /m\.downloadText\(/);
  assert.match(guard, /m\.backupFilename\(/);
  /* The mechanics live in backup.js because two copies would be two things to
     get wrong about revoking an object URL -- share.js's PNG fallback is the
     other legitimate one, and it is not here. */
  for (const dupe of ['createObjectURL', 'new Blob', 'revokeObjectURL']) {
    assert.ok(!guard.includes(dupe), `the guard reimplements ${dupe} instead of using backup.js`);
  }
});

test('the panel costs nothing until it is needed', () => {
  // built in the catch, never in the markup: the node budget has ~11 nodes of
  // headroom and a hidden panel would spend a third of them on a screen almost
  // nobody sees
  assert.ok(!/id="recover"/.test(html),
    'the recovery panel is in the markup now, and every coach pays for it');
  assert.match(guard, /createElement\('div'\)/);
  assert.match(guard, /document\.body\.replaceChildren\(/);
});

test('the guard downloads the key the app actually writes, newest first', () => {
  const keys = [...guard.matchAll(/'(benchcard\.v\d+)'/g)].map(m => m[1]);
  assert.deepEqual(keys, [KEY, V5_KEY, V4_KEY, V3_KEY],
    'the recovery download must try the keys newest first, the same chain as '
    + 'the theme script -- a coach whose boot broke mid-migration would '
    + 'otherwise be handed an empty file, which is worse than nothing');
});
