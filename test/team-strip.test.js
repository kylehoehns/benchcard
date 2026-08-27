import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The team switcher is SHELL furniture, not part of the games view.
 *
 * It mounted inside `#view-games` for as long as a team was only a roster.
 * Once Season and Settings became team-scoped, that meant a coach standing on
 * Settings had to go back to Games to change which team's settings they were
 * editing -- reported, in those words, as goofy. Moving `#teamtabs` between
 * the bar and the views fixes all four at once, and these are the four things
 * that moving it can quietly break.
 *
 * Source-reading, like undo-view.test.js: every one of these is markup or a
 * DOM callback. */
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8');
const render = readFileSync(new URL('../app/render.js', import.meta.url), 'utf8');
const teams = readFileSync(new URL('../app/teams-view.js', import.meta.url), 'utf8');

test('the team strip mounts in the shell, above every view', () => {
  const strip = html.indexOf('id="teamtabs"');
  const games = html.indexOf('id="view-games"');
  assert.ok(strip > 0 && games > 0, 'both #teamtabs and #view-games must exist');
  assert.ok(strip < games,
    '#teamtabs must sit before the first view, not inside one — otherwise Season and '
    + 'Settings lose the switcher again');
  // and it must not have been dropped into a later view instead
  assert.equal(html.indexOf('id="teamtabs"', strip + 1), -1, 'exactly one #teamtabs');
});

test('the shell strip is not printed', () => {
  const tag = html.slice(html.lastIndexOf('<nav', html.indexOf('id="teamtabs"')),
    html.indexOf('>', html.indexOf('id="teamtabs"')) + 1);
  assert.match(tag, /class="[^"]*\bnoprint\b/,
    'the strip used to inherit .noprint from .dayhead; in the shell it needs its own');
});

/* `[hidden]` does not beat an author `display: flex`, and `applyView` hides
   this element with the attribute every time the coach lands on welcome — the
   last-team path included. It no longer SHIPS hidden: A45 gave it a reserved
   row instead, so the boot stops pushing every view down by one, and
   test/first-paint.test.js owns that half. */
test('the strip honours the hidden attribute', () => {
  assert.match(css, /\.teamtabs\[hidden\]\s*\{[^}]*display:\s*none/);
});

/* The one that actually bit. `render()` returns early while `onboarded` is
   false, so a renderer cannot hide the strip on the path that matters:
   removing the last team flips the flag off and lands on welcome, and
   `renderTeams` never runs again to notice. Visibility belongs to applyView,
   beside the bar and the foot; contents stay in renderTeams. */
test('welcome hides the strip from applyView, not from a renderer', () => {
  const fn = render.slice(render.indexOf('function applyView'));
  assert.match(fn.slice(0, fn.indexOf('\n}')), /#teamtabs[\s\S]{0,120}v === 'welcome'/,
    'applyView must hide #teamtabs on the welcome screen');
  const rt = teams.slice(teams.indexOf('export function renderTeams'));
  assert.doesNotMatch(rt.slice(0, rt.indexOf('\n}')), /\.hidden\s*=/,
    'renderTeams must not own the hidden flag — it does not run when onboarded is false');
});

/* The roster page keeps the team's *editing* controls. That is a different
   job from switching, and moving them would leave the roster with no way to
   rename or delete a team. */
test('the roster keeps the team editing controls', () => {
  const view = html.slice(html.indexOf('id="view-team"'), html.indexOf('id="view-season"'));
  for (const id of ['teamName', 'addTeam', 'removeTeam', 'teamCount']) {
    assert.ok(view.includes(`id="${id}"`), `#${id} must stay on the roster page`);
  }
});
