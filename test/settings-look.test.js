import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexHtml, cutView } from './js-comments.js';
import { lacks } from './prose.js';

/* #142: Settings has to look like the rest of the app -- the shared
 * `.pgrp`/`.prow`/`.pgrp-h`/`.pgrp-f` grammar every sheet already uses,
 * not its own `.side-box`/`.setrow`/`.set-h`/`.linkrow` grammar. And every
 * long explanation a row loses has to keep its meaning in How it works, or
 * the redesign is a word count cut, not a move.
 *
 * indexHtml and cutView live in js-comments.js, shared with settings.test.js
 * -- both files were hand-rolling the same pair. cutView takes an id, so
 * this file's own cut (below, for #help) works unmodified; settings.test.js
 * keeps its own `views()`, scoped to zone-ordering pins inside
 * #view-settings, local to that file. */

test('Settings carries none of the old card/row/header classes', () => {
  const view = cutView(indexHtml(), 'view-settings');
  for (const bad of ['side-box', 'side-hd', 'set-h', 'setrow', 'linkrow']) {
    assert.ok(!view.includes(bad), `#view-settings still uses .${bad}, which the redesign retires`);
  }
});

test('no visible .btn or .linkish control survives in Settings outside the color dialog', () => {
  /* #colorPicker is its own dialog, out of scope (item 2 names it excluded
     explicitly). It sits, in source order, between its own id and
     #removeTeam's group -- ahead of it, per the dialog's own placement
     comment -- so slicing that span out leaves every OTHER control in the
     view for this check to read. */
  const view = cutView(indexHtml(), 'view-settings');
  const dialogStart = view.indexOf('id="colorPicker"');
  const removeAt = view.indexOf('id="removeTeam"');
  assert.ok(dialogStart > -1 && removeAt > dialogStart, 'could not find the color dialog span to exclude it');
  const outsideDialog = view.slice(0, dialogStart) + view.slice(removeAt);
  assert.doesNotMatch(outsideDialog, /class="[^"]*\bbtn\b/, 'a bare .btn survives in Settings outside the color dialog');
  assert.doesNotMatch(outsideDialog, /class="[^"]*\blinkish\b/, 'a .linkish control survives in Settings outside the color dialog');
});

test('every Settings section header is an h2.pgrp-h, and there are exactly three', () => {
  const view = cutView(indexHtml(), 'view-settings');
  const headers = [...view.matchAll(/<h2\s+class="pgrp-h"/g)];
  assert.equal(headers.length, 3,
    `Settings should open exactly three groups (team, Benchcard, Backup and restore), found ${headers.length} h2.pgrp-h headers`);
  // no other heading level carries a Settings section title
  assert.ok(lacks(view, /<h[1345][^>]*>(This team|Benchcard|Backup and restore)</),
    'a Settings section title is riding a heading level other than h2');
});

test('How it works has a Settings section holding each moved explanation', () => {
  /* Scoped to the new section's own text, not the whole #help dialog: "Even
     out the season so far" already appears once, today, in an unrelated
     section ("A tournament day, and the season") -- a check against the
     whole dialog would pass without this section ever being added. */
  const html = indexHtml();
  const start = html.indexOf('<h4 class="help-h">Settings</h4>');
  assert.ok(start > -1, '#help is missing its "Settings" section');
  const end = html.indexOf('id="helpTour"', start);
  assert.ok(end > start, 'could not find the end of the Settings help section (expected before #helpTour)');
  const section = html.slice(start, end);
  const phrases = [
    'nine seconds to undo',
    'nothing to copy',
    'one stint less',
    'league has a rule',
    'Even out the season so far',
    'nowhere else',
  ];
  for (const phrase of phrases) {
    assert.ok(section.includes(phrase), `the Settings help section is missing "${phrase}"`);
  }
});
