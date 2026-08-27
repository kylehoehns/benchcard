import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* Copy a coach reads must not assume which device they are holding.
 *
 * Reported from a desktop: Settings read "Theme — Follows your phone until you
 * pick one", and the install nudge led with "Keep Benchcard on your phone."
 * Both fire on a laptop -- `beforeinstallprompt` is caught and turned into a
 * real Install button there -- so both were simply wrong for the reader.
 *
 * The fix was device-neutral wording, not device detection: detection is new
 * code, a new thing to get wrong, and a tablet that is neither. This guard
 * keeps it that way.
 *
 * Scope is deliberately narrow. It bans the possessive phrases only -- "your
 * phone", "your laptop", "your tablet" -- and only outside comments. Every
 * other "phone" in `app/` is a code comment, where the word is accurate and
 * load-bearing: the mobile-first reasoning genuinely is about phones and the
 * measurements in those comments were taken at 390x844. A broader ban would
 * be a rule that has to be argued with, and a rule that gets argued with gets
 * deleted. The device-specific instruction still lives where the code already
 * knows the platform: the iOS branch of the install nudge says "Add to Home
 * Screen", which is true precisely there.
 */

const DIR = new URL('../app/', import.meta.url);
const BANNED = ['your phone', 'your laptop', 'your tablet', 'your desktop'];

/* Comments out, so the check reads what a coach reads. `//` only at the start
   of a line, which is this codebase's style and keeps `https://` intact. */
const uncomment = src => src
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const files = readdirSync(DIR)
  .filter(f => /\.(js|html)$/.test(f))
  .sort();

test('user-facing copy never assumes the reader is holding a phone', () => {
  const hits = [];
  for (const f of files) {
    const src = uncomment(readFileSync(new URL(f, DIR), 'utf8')).toLowerCase();
    for (const phrase of BANNED) {
      if (src.includes(phrase)) hits.push(`${f}: "${phrase}"`);
    }
  }
  assert.deepEqual(hits, [],
    'device-neutral wording, not device detection: say "your device"');
});

test('the guard would catch the copy it was written for', () => {
  const src = uncomment('<p class="note">Follows your phone until you pick one.</p>');
  assert.ok(src.toLowerCase().includes('your phone'));
  // ...and leaves the comments that legitimately say it alone
  assert.equal(uncomment('/* thumb-safe on your phone */').trim(), '');
  assert.equal(uncomment('  // measured on your phone at 390x844').trim(), '');
  assert.equal(uncomment('<!-- a disclosure on your phone -->').trim(), '');
});

/* Nor which BROWSER they are in.
 *
 * The install nudge told an iPhone coach "Safari can clear a site you have not
 * opened in a week". That branch is the no-`beforeinstallprompt` path, which
 * `installEligible` gates behind `isIOS()` -- and every browser on iOS is
 * WebKit with the same Share sheet, so a coach in Chrome or Edge on an iPhone
 * was reading about a browser they were not using. The instruction is
 * identical either way, so the brand buys nothing and costs accuracy.
 *
 * Same scope and same method as the tests above: user-facing strings only,
 * comments stripped. A comment may say Safari as often as it likes -- the
 * WebKit reasoning in this codebase genuinely is about Safari, and several of
 * those comments are load-bearing.
 */
/* TWO NAMES, not four, and the two that came out are the point. `chrome` and
   `edge` are ordinary English in UI code and this codebase is full of both --
   viewport edges, card edges, swipe edges, and "the app chrome came off" in
   smoke.mjs's own first-run check. A first cut banned all four and produced
   four false hits and zero real ones. The scope note above applies to this
   rule too: a rule that has to be argued with gets deleted. `safari` and
   `firefox` are never anything but a browser here. */
const BRANDS = ['safari', 'firefox'];

test('user-facing copy never names the browser the coach is in', () => {
  const hits = [];
  for (const f of files) {
    const src = uncomment(readFileSync(new URL(f, DIR), 'utf8')).toLowerCase();
    for (const brand of BRANDS) {
      // word-boundaried: "chrome" must not fire on "chrome" inside a class name
      if (new RegExp(`\\b${brand}\\b`).test(src)) hits.push(`${f}: "${brand}"`);
    }
  }
  assert.deepEqual(hits, [],
    'user-facing copy names a browser. Every browser on iOS is WebKit behind the same Share '
    + 'sheet, and the instruction does not change with the brand -- say "a browser tab" or '
    + '"this browser". Comments may name one; this only reads what a coach reads.');
});

test('the brand guard would catch the copy it was written for', () => {
  const src = uncomment(`msg.append(' Safari can clear a site you have not opened in a week.')`);
  assert.match(src.toLowerCase(), /\bsafari\b/);
  // ...and leaves the comments that legitimately say it alone
  assert.equal(uncomment('/* WebKit: Safari clears a tab after seven days */').trim(), '');
  assert.equal(uncomment('  // measured in Safari on the device').trim(), '');
});
