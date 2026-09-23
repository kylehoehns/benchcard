import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './js-comments.js';

/* #122 Proof: "a guard: no handler file under Surfaces calls soon(,
 * renderAll(, renderCards( or names AFTER_EDIT/PLAN_ONLY; edit.js imports no
 * view and no render.js/toast.js" -- covers items 2 and 3 of "What would
 * settle it": every Design-table handler now goes through `edit(kind)`
 * (app/edit.js), and edit.js itself stays import-clean so render.js can pull
 * it in without closing the graph into a cycle.
 *
 * The seven Surfaces handler files still call `renderAll()` directly at a
 * few sites, on purpose -- the Decisions section's "Out of scope" list: team
 * switch, add and remove a team, a whole-record replace (restoring a
 * backup), an `undoable` refresh callback (day filing) and boot. Each
 * surviving call is named below, by the function it sits inside and why it
 * is out of scope, the same shape render-sections.test.js's KEEP map uses --
 * so a NEW call anywhere else in these seven files trips the count check,
 * while a genuinely out-of-scope one does not. `soon(` and `renderCards(`
 * have no out-of-scope callers left, so their allow-list is empty everywhere. */

const APP = new URL('../app/', import.meta.url);
const read = (f) => stripComments(readFileSync(new URL(f, APP), 'utf8'));

const HANDLER_FILES = [
  'app.js', 'teams-view.js', 'strategy.js', 'rules.js',
  'roster-view.js', 'balance.js', 'game-setup.js',
];

// file -> the renderAll() call sites Decisions marks out of scope, each with
// the function it sits inside and why. Every other handler file's list is
// empty: strategy.js, rules.js, roster-view.js, balance.js and game-setup.js
// have no out-of-scope navigation or undoable-refresh call sites of their
// own -- every soon() they used to own became a kind in EDITS instead.
const ALLOW_RENDER_ALL = {
  'app.js': [
    { in: 'restoreBackup', why: 'a whole-record replace, not a Design-table edit' },
    { in: 'fileOverdueDay', why: 'an undoable refresh callback (day filing)' },
    { in: 'the boot try/catch', why: "boot's own first paint" },
  ],
  'teams-view.js': [
    { in: 'renderTeams (the team menu)', why: 'team switch' },
    { in: 'addTeam', why: 'add a team' },
    { in: 'removeTeam', why: 'remove a team (an undoable refresh callback)' },
  ],
};

const callSites = (src, name) => [...src.matchAll(new RegExp(`\\b${name}\\(`, 'g'))];

for (const file of HANDLER_FILES) {
  test(`${file}: no handler calls soon( or renderCards( -- #122 moved every Design-table edit through edit(kind)`, () => {
    const src = read(file);
    for (const fn of ['soon', 'renderCards']) {
      const hits = callSites(src, fn);
      assert.equal(hits.length, 0,
        `${file} calls ${fn}(), which #122 moved off every Design-table handler and into edit(kind) (app/edit.js)`);
    }
  });

  test(`${file}: renderAll() appears only at its allow-listed out-of-scope call sites`, () => {
    const src = read(file);
    const allow = ALLOW_RENDER_ALL[file] || [];
    const hits = callSites(src, 'renderAll');
    const describe = allow.length
      ? allow.map((a) => `${a.in} (${a.why})`).join('; ')
      : 'none -- every renderAll() in this file must go through edit(kind) instead';
    assert.equal(hits.length, allow.length,
      `${file} has ${hits.length} renderAll() call site(s), expected exactly the ${allow.length} `
      + `allow-listed out-of-scope one(s): ${describe}. A NEW renderAll() call belongs on edit(kind) instead.`);
  });

  test(`${file}: names neither AFTER_EDIT nor PLAN_ONLY -- #122 moved both beside the table in edit.js`, () => {
    const src = read(file);
    for (const name of ['AFTER_EDIT', 'PLAN_ONLY']) {
      assert.ok(!new RegExp(`\\b${name}\\b`).test(src),
        `${file} still names ${name}; #122 moved it to app/edit.js, the one place it is read`);
    }
  });
}

/* The second half of the same Proof line: edit.js imports no view and no
 * render.js/toast.js. Read as import specifiers rather than a blanket
 * "does not contain the word render" check, so a comment describing what
 * edit.js replaced (this file is full of them, see app/edit.js's own header)
 * never trips it -- only a real `import ... from '...'` line can. */
test('edit.js imports only state.js and analytics.js', () => {
  const src = readFileSync(new URL('edit.js', APP), 'utf8');
  const specifiers = [...src.matchAll(/^import\s+.*?\bfrom\s+'([^']+)';/gm)].map((m) => m[1]);
  assert.ok(specifiers.length > 0, 'edit.js scan found no import lines -- the shape changed');
  const allowed = new Set(['./state.js', './analytics.js']);
  const bad = specifiers.filter((s) => !allowed.has(s));
  assert.deepEqual(bad, [],
    `edit.js imports ${bad.join(', ')}; it may import only state.js and analytics.js -- the painter and `
    + 'retireUndo are handed in through initEdits instead (Constraints: "no import cycle")');
});
