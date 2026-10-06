/* README carries a "dependencies: 0" badge. It is a static badge, so nothing
 * would notice if package.json gained a dependency and the badge kept
 * claiming zero. This test is the thing that notices: add a dependency and
 * it fails until the badge (and this test) are changed on purpose. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

test('package.json installs nothing, as the README badge claims', () => {
  assert.match(read('README.md'), /badge\/dependencies-0-/, 'the README badge is gone; drop this test with it');
  const pkg = JSON.parse(read('package.json'));
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(Object.keys(pkg[key] ?? {}), [], `package.json has ${key}`);
  }
});
