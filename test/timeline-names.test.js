import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* timeline.js touches the DOM at render time, so this reads the source the way
   tour-scroll.test.js and gamemode-open.test.js do. What is pinned is a
   polarity, and polarities are exactly what a well-meaning tidying pass flips
   back: the timeline shows FULL names, the card shows short ones.

   The four-character abbreviation is a *card* constraint — 3.45 inches of paper
   with a column per stint. A timeline row puts the name above a full-width bar,
   so the room is there. Before this was pinned the module disagreed with
   itself: the two visible labels read `shortNames` first while the aria-label,
   the detail host label and the expanded row heading read `name` first, so a
   screen reader announced "Austin Schumacher" where the eye read AUST. */
const src = readFileSync(new URL('../app/timeline.js', import.meta.url), 'utf8');
const card = readFileSync(new URL('../app/card.js', import.meta.url), 'utf8');

test('one function answers "what is this player called" on the timeline', () => {
  assert.match(src, /function tlName\(p, id\)\s*\{\s*return byId\(id\)\?\.name \|\| p\.shortNames\[id\] \|\| id;/,
    'tlName must prefer the full name, with the short name only as a fallback');
  /* Five call sites used to spell the fallback chain out by hand, two of them
     in the opposite order. Only tlName may read shortNames now, so there is
     nowhere for the two orders to drift apart again. */
  const reads = src.match(/shortNames/g) || [];
  assert.equal(reads.length, 1,
    'only tlName may read shortNames in timeline.js — every label goes through it');
});

test('the card keeps its abbreviations', () => {
  /* The other half of the rule. Full names everywhere there is room,
     abbreviations only where there is not, and the printed card is where there
     is not. If this ever goes green because card.js stopped reading
     shortNames, the pocket card has become unreadable. */
  assert.match(card, /plan\.shortNames\[p\.id\]/,
    'the printed card is 3.45 inches wide and must stay on short names');
});
