import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* GUARD, and it reads source files on purpose (the spec's Proof names this
 * seam): advanced.html is static prose with no behavior to run.
 * advanced.html documents Overtime with the words the coach sees on screen.
 * The labels are read out of index.html and gamemode.js, not retyped here, so
 * renaming a button without touching the guide fails this test. */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const index = read('index.html');
const advanced = read('advanced.html').replace(/<!--[\s\S]*?-->/g, ' ');

const who = index.match(/id="overtimeWho"[^>]*>([\s\S]*?)<\/div>/);
const whoLabels = who ? [...who[1].matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map(m => m[1].trim()) : [];
const go = index.match(/id="overtimeGo"[^>]*>([^<]*)</);
const tied = read('gamemode.js').match(/'Tied\? Add overtime'/);

const HEAD = '<h2 id="overtime">Overtime</h2>';
const start = advanced.indexOf(HEAD);
const end = start < 0 ? -1 : advanced.indexOf('</section>', start);
const section = start < 0 || end < 0 ? '' : advanced.slice(start, end);

test('guard: advanced.html Overtime section (source read) names every on-screen choice', () => {
  assert.equal(whoLabels.length, 4, 'index.html #overtimeWho should have four buttons');
  assert.ok(go && go[1].trim(), 'index.html has no #overtimeGo label');
  assert.ok(tied, 'gamemode.js no longer has the "Tied? Add overtime" button');
  assert.ok(section, 'advanced.html has no <h2 id="overtime">Overtime</h2> followed by </section>');
  assert.ok(advanced.includes('href="#overtime"'), 'advanced.html has no contents link to #overtime');
  for (const label of [...whoLabels, go[1].trim(), 'Tied? Add overtime']) {
    assert.ok(section.includes(`<b>${label}</b>`), `the Overtime section of advanced.html does not name <b>${label}</b>`);
  }
});
