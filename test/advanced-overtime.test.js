import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* advanced.html documents Overtime with the words the coach sees on screen.
 * The labels are read out of index.html and gamemode.js, not retyped here, so
 * renaming a button without touching the guide fails this test. */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const index = read('index.html');
const advanced = read('advanced.html').replace(/<!--[\s\S]*?-->/g, ' ');

const who = index.match(/id="overtimeWho"[^>]*>([\s\S]*?)<\/div>/);
const whoLabels = who ? [...who[1].matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map(m => m[1].trim()) : [];
const go = index.match(/id="overtimeGo"[^>]*>([^<]*)</);
const tied = read('gamemode.js').match(/'Tied\? Add overtime'/);

test('advanced.html has an Overtime section that names every on-screen choice', () => {
  assert.equal(whoLabels.length, 4, 'index.html #overtimeWho should have four buttons');
  assert.ok(go && go[1].trim(), 'index.html has no #overtimeGo label');
  assert.ok(tied, 'gamemode.js no longer has the "Tied? Add overtime" button');
  assert.ok(advanced.includes('<h2 id="overtime">Overtime</h2>'), 'advanced.html has no <h2 id="overtime">Overtime</h2>');
  assert.ok(advanced.includes('href="#overtime"'), 'advanced.html has no contents link to #overtime');
  for (const label of [...whoLabels, go[1].trim(), 'Tied? Add overtime']) {
    assert.ok(advanced.includes(`<b>${label}</b>`), `advanced.html does not name <b>${label}</b>`);
  }
});
