import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* A phone with the OS text size turned up. Every other breakpoint in the app is
   in `px`, and `px` is the one unit blind to this: the reader's text grows, the
   bar's rems grow with it, and the screen is still 390px wide, so nothing
   fires. The `em` query is the entire fix, and there are three ways to undo it
   without anything looking wrong, so all three are pinned here. */

const ROOT = new URL('../app/', import.meta.url);
const css = readFileSync(new URL('app.css', ROOT), 'utf8');

const BIG = '@media (max-width: 19em)';
/* The 620px block that carries the bar's stages -- there are several blocks at
   that width, and this is the one that lets the bar wrap. Anchored on the
   bar's own wrap rule rather than a neighboring selector, which #29 removed
   (`.statrow`, the stat tiles' own 620px gap rule). */
const PHONE_AT = css.lastIndexOf('@media (max-width: 620px)', css.indexOf('.bar { gap: .4rem;'));
const PHONE_BLOCK = css.slice(PHONE_AT, css.indexOf('\n}', PHONE_AT));

test('the big-text query is in em, not px', () => {
  const at = css.indexOf(BIG);
  assert.ok(at > -1, 'the big-text block is gone, or its query was rewritten');
  /* 19em is 304px at default text -- narrower than any phone -- so at normal
     size this never fires. Rewritten as `304px` it would fire on nothing at
     all, because the screen does not shrink when the text grows. */
  assert.ok(!/max-width:\s*304px/.test(css), 'the em query was converted to px and now fires on nothing');
});

test('the big-text block sits after the px breakpoints it has to beat', () => {
  const block = css.indexOf(BIG);
  /* Same specificity on `.bar` in all three, so source order is the whole of
     the cascade. Declared above either one, the tightening here is dead. */
  for (const q of ['@media (max-width: 620px)', '@media (max-width: 385px)']) {
    const at = css.indexOf(q);
    assert.ok(at > -1, `${q} is gone`);
    assert.ok(at < block, `${q} is declared after the big-text block and would win on .bar`);
  }
});

test('the two rows that overflowed are allowed to wrap', () => {
  /* The picker's wrap is the big-text block's own; the bar's has moved up into
     the 620px block, which matches every phone at every text size instead of
     only the bottom of the range. That move is the fix for the 305-341px band,
     where the bar's floor sat above where the last narrowing stage began and
     Print hung 21px off the right edge on both views. Pinned in the phone block
     rather than here because a wrap that only fires at 19em is exactly the
     shape of the bug that shipped twice. */
  const big = css.slice(css.indexOf(BIG), css.indexOf('}', css.indexOf('.seg.wide button', css.indexOf(BIG))) + 1);
  assert.match(big, /\.seg\.wide\s*{[^}]*flex-wrap:\s*wrap/, 'the strategy picker can no longer wrap');

  assert.ok(PHONE_AT > -1, 'the 620px bar block is gone');
  assert.match(PHONE_BLOCK, /\.bar\s*{[^}]*flex-wrap:\s*wrap/,
    'the top bar can no longer wrap on a phone, so it can overflow again between its floor and the next stage');
});

test('the 385px stage is declared after the 620px one, where it can win', () => {
  /* It was not, for its whole life: it sat six hundred lines above the 620px
     block, both matched on a phone, both named `.bar`, and the later one won.
     Nothing looked wrong -- the stage simply never happened. The whole class of
     bug this file exists for is a `.bar` rule on the losing side of the
     cascade, so all three orderings are pinned, not just the em one. */
  const at385 = css.indexOf('@media (max-width: 385px)');
  assert.ok(at385 > -1, 'the 385px stage is gone');
  assert.ok(at385 > PHONE_AT,
    'the 385px stage is above the 620px bar block again and does nothing');
  assert.ok(at385 < css.indexOf(BIG), 'the 385px stage is below the big-text block and would beat it');
});

test('nothing pins the root font size, which would freeze every rem', () => {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  /* `html { font-size: 16px }` anywhere would override the reader's setting
     outright and make the whole app ignore it -- a far worse bug than the
     overflow, and an easy one to add while tidying. */
  assert.ok(!/(^|})\s*(html|:root)\s*{[^}]*font-size/.test(bare),
    'a rule pins the root font size and overrides the reader');
  /* docs/specs/24-text-size.md decision 1: `font: -apple-system-body` on
     `html` is the same kind of pin unless it is gated -- unguarded, it would
     freeze the root on every Mac WebKit at the measurement the spec's Survey
     records, instead of following the reader there too. */
  const bodyRule = bare.indexOf('-apple-system-body');
  assert.ok(bodyRule > -1, '-apple-system-body is gone -- #24 item 2 needs the gated root rule');
  const gate = bare.lastIndexOf('@supports (-webkit-touch-callout: none)', bodyRule);
  assert.ok(gate > -1, 'no @supports (-webkit-touch-callout: none) gate found before -apple-system-body');
  const between = bare.slice(gate, bodyRule);
  assert.equal((between.match(/}/g) || []).length, 0,
    'the @supports gate already closed before the -apple-system-body rule -- it is ungated');
});

test('the last two games-view rows wrap, and only at big text', () => {
  /* At 32px of root text -- past anything Chrome's own font-size menu offers,
     but not past the OS setting -- two rows the `px` stages cannot see were the
     whole of a remaining 12px sideways pan on the games view: the section
     heading row (a title plus Shuffle, which is `white-space: nowrap` and had
     nowhere to go) and the bench button, whose label made it wider than the
     centered flex line it sits in, so it hung off both edges.

     Both fixes live in the big-text block on purpose, unlike the bar's. At
     default text neither row overflows anything, so wrapping them at every
     phone width would change a layout that is already correct -- the opposite
     of the bar, which overflowed across the whole phone range. */
  const at = css.indexOf(BIG);
  const big = css.slice(at, css.indexOf('\n}', at));
  assert.match(big, /\.block-hd\s*{[^}]*flex-wrap:\s*wrap/,
    'the section heading row can no longer wrap, so Shuffle can hang off the edge again at big text');
  // #29 decision 8: `.gm-start` (Start game, above 900px) carries the same
  // wrap-at-big-text rule `.gm-cta` (the card sheet's own Print/Share row)
  // already did -- one declaration, both selectors.
  assert.match(big, /\.gm-cta\s+\.btn,\s*\.gm-start\s+\.btn\s*{[^}]*white-space:\s*normal/,
    'the bench button is nowrap again at big text, which makes it wider than its own column');

  /* And nowhere else: `.btn` is nowrap by design everywhere else in the app,
     and `.block-hd` is a baseline-aligned single row at normal text. */
  const others = css.slice(0, at) + css.slice(at + big.length);
  assert.ok(!/\.block-hd\s*{[^}]*flex-wrap:\s*wrap/.test(others),
    '.block-hd now wraps outside the big-text block, which changes normal-text layout');
});

test('the wordmark is capped against the viewport at big text', () => {
  /* The first-run screen panned 41px at a 32px root, and for a reason none of
     the flex fixes above touch: `.wel-h` tops out at `2.6rem`, which is 83px
     at that root, and "Benchcard" is one unbreakable word 404px wide on a
     390px screen. `.wel-in` is a grid item, so `min-width: auto` let that
     min-content beat its own `width: 100%`.

     Both halves are load-bearing. Without the `vw` cap the grid item is free to
     grow again; without `min-width: 0` the heading pushes the box wide instead
     of being contained by it. Measured at 320/360/390px against 16/24/32px
     roots: every combination is scrollWidth === clientWidth, and 24px and
     below are unchanged because `min(2rem, ...)` is what the old `clamp()`
     already resolved to there. */
  const at = css.indexOf(BIG);
  const big = css.slice(at, css.indexOf('\n}', at));
  assert.match(big, /\.wel-in\s*{[^}]*min-width:\s*0/,
    'the welcome column can size to its own min-content again, which the wordmark sets');
  assert.match(big, /\.wel-h\s*{[^}]*font-size:\s*min\(/,
    'the wordmark is no longer capped against the viewport, so it can outgrow a 320px screen');
});

test('the settings panel wraps its widest row at big text', () => {
  /* The last of these, and the widest: 112px of sideways pan at 320px and a
     32px root.

     `.minwrap` holds Periods × Min / period. It is `flex: none`, so its base
     size is max-content and it never shrinks -- and an item that never shrinks
     below max-content never has a line to wrap onto, so `flex-wrap` alone is a
     no-op here. Both declarations are load-bearing.

     The selector is load-bearing too: the base `.minwrap` rule is declared
     BELOW this block, so a bare `.minwrap` here loses on source order the same
     way the 385px stage lost on `.bar` for its whole life. #142 moved the row
     off `.setrow` (retired) onto `#view-settings .pgrp .prow`, so the fix
     needs an id selector now rather than a two-class one -- an id outranks a
     later bare class regardless of source order. The backup buttons (Save a
     backup file, Restore from a file) are each their own full-width `.prow`
     since #142, not a `.gm-cta`-style pair squeezed side by side, so their
     text already wraps at this width and needs no big-text fix of its own. */
  const at = css.indexOf(BIG);
  const big = css.slice(at, css.indexOf('\n}', at));

  const mw = big.match(/#view-settings\s+\.minwrap\s*{([^}]*)}/);
  assert.ok(mw, 'the settings number pair can no longer wrap, so it pans 112px again at big text');
  assert.match(mw[1], /flex-wrap:\s*wrap/, 'the number pair has no wrap');
  assert.match(mw[1], /flex:\s*0\s+1/, 'the number pair cannot shrink, so its wrap never fires');
  assert.ok(css.lastIndexOf('.minwrap {') > at,
    'the base .minwrap rule moved above the big-text block; the id selector is now needlessly specific');
});

test('the season ledger rows collapse to two lines, and only at big text', () => {
  /* `.sn-row` is a three-column grid -- name, track, minutes -- and only the
     middle track can give up space; below a 19em root there is nothing left
     for it to give. #30 decision 8: the name spans the full row on its own
     line, and the track and minutes share the line below it, rather than
     shrinking the track to nothing or letting the row pan off the edge. */
  const at = css.indexOf(BIG);
  const big = css.slice(at, css.indexOf('\n}', at));

  /* `.sn-list .sn-row`, not the bare class: the base `.sn-row` rule (three
     columns) sits ~245 lines BELOW this block and would win on source order
     at equal specificity, exactly the trap `.setrow .minwrap` and
     `.rlist .rrow` are already pinned against a few tests up -- a bare
     `.sn-row` override here measured `.sn-name` at 310px in a 275px row
     before this was caught. */
  assert.match(big, /\.sn-list \.sn-row\s*{[^}]*grid-template-columns:\s*1fr auto/,
    'the season ledger row no longer collapses to two columns at big text, or lost the extra specificity that makes it win');
  assert.match(big, /\.sn-list \.sn-name\s*{[^}]*grid-column:\s*1\s*\/\s*-1/,
    'the season ledger name cell no longer spans the full row at big text, or lost the extra specificity that makes it win');

  /* And nowhere else: at normal text the row is one tidy line with three
     columns, and the minutes column only reads as a column while it does. */
  const others = css.slice(0, at) + css.slice(at + big.length);
  assert.ok(!/\.sn-list \.sn-row\s*{[^}]*grid-template-columns:\s*1fr auto/.test(others),
    'the ledger row collapses to two columns outside the big-text block, which breaks the minutes column at normal text');
});

/* ---- the toast, which is not a breakpoint fix and must not become one ----
 *
 * Read the SOURCE WITH COMMENTS STRIPPED. The rules below are three lines with
 * eleven lines of comment above them explaining the seven-pixel message, and a
 * guard that matches `flex-wrap: wrap` against the prose describing it is a
 * guard scoring its own explanation -- that has already put a dead check into
 * this repo twice. */
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

test('the toast wraps at every text size, not only inside the big-text block', () => {
  /* Measured on the shipped copy at 320px with a 32px root, before the fix:
     `.tmsg` was SEVEN pixels wide in all three toasts -- a flex item with a 0
     basis beside an "Undo" that measures 137px there and a 44px dismiss -- so
     the message wrapped one short word per line and the box grew off the TOP
     of the screen. "Ana is out for the rest. The rest of the game rebalanced."
     measured 275x568 at y -160, so a coach read it from the middle.

     The floor on `.tmsg` is what makes it wrap, and it is in `rem` so the TEXT
     SIZE decides, not a width. `19em` would be the wrong home for it: the box
     is `min(28rem, 100%)`, so at a large root it runs out of room on a desktop
     too, where no narrow-viewport query fires. */
  assert.match(bare, /(^|\n)\.toast\s*{[^}]*flex-wrap:\s*wrap/,
    'the toast row cannot wrap, so the message is squeezed to nothing beside the buttons');

  const m = bare.match(/\.toast\s+\.tmsg\s*{[^}]*}/);
  assert.ok(m, '.toast .tmsg is gone');
  assert.match(m[0], /flex:\s*\d+\s+\d+\s+[\d.]+rem/,
    'the message has no rem-sized flex basis, so nothing forces the buttons onto their own row');

  /* Not inside the big-text block: that block only fires below 19em, and the
     toast is squeezed at every viewport once the text is large. */
  const at = bare.indexOf(BIG);
  const big = bare.slice(at, bare.indexOf('\n}', at));
  assert.ok(!/\.toast\s*{[^}]*flex-wrap/.test(big),
    'the toast wrap moved into the 19em block, where a desktop reader at 200% text never sees it');
});

test('the wrapped action row lands at the right edge, not under the first word', () => {
  /* Both selectors matter and each covers a different toast. `.tundo` is the
     undoable ones; `.tmsg + .tx` is `flash()`, which has no button, so the
     dismiss is alone on the second row. Unwrapped this costs nothing --
     `.tmsg` grows into the free space first, so an auto margin gets none --
     and the 390px measurements are identical either way. */
  assert.match(bare, /\.toast\s+\.tundo[^{]*{[^}]*margin-left:\s*auto/,
    'the undo button no longer right-aligns, so a wrapped action row starts under the message');
  assert.match(bare, /\.toast\s+\.tmsg\s*\+\s*\.tx[^{]*{[^}]*margin-left:\s*auto/,
    'a toast with no action button strands its dismiss under the first word when the row wraps');
});

test('the timeline gives its names back at big text, without losing the word', () => {
  /* NOT a pan -- the page stays 320px wide the whole time -- so every probe in
     `scripts/smoke.mjs` reads this screen green. Measured at 320px on a 32px
     root with twelve players and an uneven plan: `.tl-tot`'s MOST / FEWEST
     gutter is a fixed `3.2rem`, 102px there, the stacked row is `1fr auto`, and
     `.tl-lab` was left 20.9px -- the dot and its gap. Every name on every row
     measured **0px wide**. 132.9px and a readable name after, and 202.9px at
     390px, where eight of twelve real names fit whole.

     Read from the comment-stripped source for the reason the toast tests above
     record: the rule ships with a comment that names every declaration in it. */
  const at = bare.indexOf(BIG);
  const big = bare.slice(at, bare.indexOf('\n}', at));

  const m = big.match(/\.tl-tot\s+\.ex\s*{[^}]*}/);
  assert.ok(m, 'the timeline no longer hands its label column back at big text');
  assert.match(m[0], /display:\s*block/,
    'MOST / FEWEST is beside the number again, so the fixed gutter takes the name column');
  assert.match(m[0], /width:\s*auto/,
    'the gutter is still a fixed width, which is the 102px that left the names 0px wide');

  /* The word is not deleted, here or anywhere: it is what says which end of
     the squad a row is at to a coach who cannot use the color. A rule that
     hides it would pass every width assertion and lose the meaning. */
  assert.ok(!/\.tl-tot\s+\.ex\s*{[^}]*(display:\s*none|visibility:\s*hidden)/.test(bare),
    'MOST / FEWEST is hidden rather than moved, so the color is carrying the meaning alone');

  /* And only at big text. At normal size the fixed gutter is the design -- it
     is what keeps the column of totals flush when some rows carry a word and
     others do not -- so the base rule must still declare it. */
  const others = bare.slice(0, at) + bare.slice(at + big.length);
  assert.match(others, /\.tl-tot\s+\.ex\s*{[^}]*width:\s*3\.2rem/,
    'the base gutter is gone, so the totals column no longer holds a flush edge at normal text');
  assert.match(others, /\.tl\.even\s+\.tl-tot\s+\.ex\s*{[^}]*width:\s*0/,
    'an even plan no longer collapses the gutter, so it holds a blank second line under every number');
});

test('the two short-viewport-height blocks still move a large title down to the sentence step', () => {
  /* #24 decision 4's amendment (docs/specs/24-text-size.md): a short-
     viewport-HEIGHT block -- unlike the 19em big-text block, which is about
     the viewport's WIDTH at big text -- may move a large title down to
     another step on the scale: a step, never a `vw` cap, and never below the
     sentence step. Both titles' pre-#24 values landed there (`.wel-h`'s
     clamp topped out near 1.62rem, the day title -- `.dayhead input.daytitle`,
     now `.dayhead .game-h1` since #69 turned it from an editable day-name
     input into the opponent's `h1` -- was a flat 1.5rem), so both take
     `var(--fs-sentence)` here. */
  const shortAt = bare.indexOf('@media (max-height: 700px)');
  assert.ok(shortAt > -1, 'the short-viewport-height welcome block is gone');
  const short = bare.slice(shortAt, bare.indexOf('\n}', shortAt));
  assert.match(short, /\.wel-h\s*{[^}]*font-size:\s*var\(--fs-sentence\)/,
    'the welcome wordmark no longer shrinks under @media (max-height: 700px), so the bottom row falls below the fold again at 375x667');

  const landscapeAt = bare.lastIndexOf('@media (orientation: landscape) and (max-height: 560px)');
  assert.ok(landscapeAt > -1, 'the short-landscape day-title block is gone');
  const landscape = bare.slice(landscapeAt, bare.indexOf('\n}', landscapeAt));
  assert.match(landscape, /\.dayhead \.game-h1\s*{[^}]*font-size:\s*var\(--fs-sentence\)/,
    'the game title no longer shrinks under the short-landscape block');
});
