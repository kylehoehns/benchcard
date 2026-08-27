import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The card carries `benchcard.app` so a parent holding one knows where it came
   from. It is source-scanned rather than rendered because the interesting part
   is not that the span exists — it is the trap underneath it.
   `.card-hd .opp` clips with a CSS tail ellipsis, and `fitHeadline` exists to
   middle-elide the headline before that backstop ever fires. Adding a third
   item to the header without taking its width out of `avail` hands the job
   back to the ellipsis and reinstates the exact bug: three tournament cards
   all printing "VS RIVERSIDE REGIONAL TOURNAMENT QUART…". */
const card = readFileSync(new URL('../app/card.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/card.css', import.meta.url), 'utf8');

test('the card is marked with the bare domain', () => {
  assert.match(card, /const MARK = 'benchcard\.app';/);
  assert.match(card, /el\('span', 'card-mark', MARK\)/);
});

test('the mark comes out of the headline budget, not out of the ellipsis', () => {
  const avail = card.slice(card.indexOf('const avail ='));
  assert.match(avail.slice(0, avail.indexOf(';')), /- widthAt\(MARK, size\.markPx\) - gap/);
  // measured at the size it is drawn at, on both card shapes
  assert.match(card, /pocket: \{[^}]*markPx: 7/);
  assert.match(card, /half:\s*\{[^}]*markPx: 9/);
});

test('the mark is styled at both card sizes', () => {
  assert.match(css, /\.card-hd \.card-mark \{[^}]*font-size: 7px/);
  assert.match(css, /\.card\.half \.card-hd \.card-mark \{[^}]*font-size: 9px/);
});

/* The share PNG repeats the domain in a taller bottom margin, because the
   in-card mark is 7px — about five device pixels once a phone has scaled the
   picture into a message bubble, which is where a shared card actually lands.
   Measured in the rendered PNG on 2026-08-24: a 92-device-px band under both
   card sizes, the string 212 device px wide, centred to within half a pixel of
   the image midline, with 29 device px of clear ground beneath it. */
const share = readFileSync(new URL('../app/share.js', import.meta.url), 'utf8');

test('the share image reserves a bottom band, not a symmetric margin', () => {
  // `PAD * 2` here would take the band away and clip the mark off the bottom
  assert.match(share, /const FOOT = 30;/);
  assert.match(share, /const h = tall \+ PAD \+ FOOT;/);
});

test('the band carries the bare domain, centred, and nothing else', () => {
  assert.match(share, /const MARK = 'benchcard\.app';/);
  assert.match(share, /ctx\.textAlign = 'center';/);
  assert.match(share, /ctx\.fillText\(MARK, w \/ 2, tall \+ PAD \+ FOOT \/ 2\);/);
  // exactly one string is painted outside the cards
  assert.equal(share.match(/ctx\.fillText\(/g).length, 2);
});

test('the band resets the context state drawText leaves behind', () => {
  // `drawText` sets `letterSpacing` per leaf; without this the band inherits
  // whatever the last leaf of the last card happened to use.
  const band = share.slice(share.indexOf("ctx.font = `${MARK_PX}px"));
  assert.match(band.slice(0, band.indexOf('fillText')), /ctx\.letterSpacing = '0px';/);
});
