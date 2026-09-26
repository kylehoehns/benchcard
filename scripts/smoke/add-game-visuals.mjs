import { evalJSON, realTap } from './sheet-drive.mjs';

/* #145's own visual checks for Add a game, split out of `add-game-flow.mjs`
 * when that file crossed the 40,000-byte ceiling `smoke-size.test.js` holds
 * every smoke module to (the same seam `add-game-fit.mjs` already split off
 * for the flow's hard-size look checks). This file's own seam: items 4, 5
 * and 6's painted-style claims -- exactly one `--tint` fill, a checked-in
 * tile's ring, and step 3's title/radio/group look -- called from
 * `addGameFlowPass`, which still owns the flow itself. */

/* #145 item 4: with the "Same as" card showing, step 1 has exactly one
 * element filled with `--tint` -- the footer's `#agNext`. The card is a
 * button now (item 4), so this is a real risk: a stray `.primary`/`.btn`
 * class left on it would fill it too. `--tint`'s own resolved color, read
 * off a probe element, not a re-typed hex -- teams carry their own tint, so
 * a literal here would be the wrong color for every team but one. */
export async function exactlyOneTintFill(c, ck) {
  const r = await evalJSON(c, `(() => {
    const probe = document.createElement('div');
    probe.style.background = getComputedStyle(document.documentElement).getPropertyValue('--tint');
    document.body.append(probe);
    const tint = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const body = document.getElementById('agBody');
    const next = document.getElementById('agNext');
    const candidates = [...(body ? body.querySelectorAll('*') : []), next].filter(Boolean);
    const filled = candidates.filter(el => getComputedStyle(el).backgroundColor === tint)
      .map(el => el.id || el.className || el.tagName);
    return JSON.stringify({ filled });
  })()`);
  ck(r.filled.length === 1 && r.filled[0] === 'agNext',
    `step 1 has ${r.filled.length} element(s) filled with --tint (${JSON.stringify(r.filled)}), want exactly ["agNext"]`);
}

/* #145 item 5: a checked-in tile's own look, read off the painted styles --
 * surface fill, no ring, a border matching an out tile's, and the ✓ still
 * showing. Runs in whatever theme is current when it is called, so
 * `addGameFlowPass` below calls it once under the rich fixture's own theme
 * and once more after a dark reload, the same way `darkInputBgPass` reloads
 * for its own dark pass rather than emulating `prefers-color-scheme`. */
export async function checkedTileHasNoRing(c, ck, label) {
  // The rich fixture's step 2 opens with everyone present -- a real out tile
  // to compare against needs one tap, undone right after.
  await realTap(c, '#agBody .plr:nth-child(2)');
  const r = await evalJSON(c, `(() => {
    const on = document.querySelector('#agBody .plr.on');
    const off = document.querySelector('#agBody .plr.off');
    if (!on || !off) return JSON.stringify({ found: false });
    const cs = getComputedStyle(on);
    const check = on.querySelector('.plr-check');
    return JSON.stringify({
      found: true,
      boxShadow: cs.boxShadow,
      borderColor: cs.borderColor,
      offBorderColor: getComputedStyle(off).borderColor,
      checkHidden: check ? check.hidden : null,
    });
  })()`);
  await realTap(c, '#agBody .plr:nth-child(2)'); // restore
  if (!ck(r.found, `${label}: #agBody needs both an "on" and an "off" tile to compare`)) return;
  ck(r.boxShadow === 'none', `${label}: a checked-in tile's box-shadow is "${r.boxShadow}", want "none"`);
  ck(r.borderColor === r.offBorderColor,
    `${label}: a checked-in tile's border is "${r.borderColor}", an out tile's is "${r.offBorderColor}" -- want them equal`);
  ck(r.checkHidden === false, `${label}: a checked-in tile's ✓ is hidden`);
}

/* #145 item 6: step 3's own look, called once under light and once under
 * dark (the same idiom as `checkedTileHasNoRing`, above) -- the title fits
 * "How should minutes split?" on one line at 390px, and each `.opt` draws a
 * 22px radio circle (an empty ring off, a filled dot on) that is decoration,
 * not a fourth control: it is a `::before` pseudo-element, which never
 * reaches the accessibility tree, rather than a real node needing its own
 * aria-hidden. `aria-checked` itself is already read by `stepThreeReads`, so
 * this only measures the circle's own geometry and the on/off difference. */
export async function stepThreeVisuals(c, ck, label) {
  const r = await evalJSON(c, `(() => {
    const h2 = document.querySelector('#agBody .flow-q');
    const opts = [...document.querySelectorAll('#agBody [role=radio]')];
    const on = opts.find(o => o.getAttribute('aria-checked') === 'true');
    const off = opts.find(o => o.getAttribute('aria-checked') === 'false');
    if (!h2 || !on || !off) return JSON.stringify({ found: false });
    const range = document.createRange();
    range.selectNodeContents(h2);
    const lines = range.getClientRects().length;
    const onCs = getComputedStyle(on, '::before');
    const offCs = getComputedStyle(off, '::before');
    const sw = document.querySelector('#agBody input[switch]');
    const pgrp = sw ? sw.closest('.pgrp') : null;
    return JSON.stringify({
      found: true,
      lines,
      titleSize: getComputedStyle(h2).fontSize,
      onWidth: onCs.width, onHeight: onCs.height,
      offWidth: offCs.width, offHeight: offCs.height,
      onBg: onCs.backgroundColor, offBg: offCs.backgroundColor,
      swInPgrp: !!pgrp,
    });
  })()`);
  if (!ck(r.found, `${label}: step 3 needs its title and a checked and an unchecked option to compare`)) return;
  ck(r.titleSize === '30px', `${label}: the step 3 title is ${r.titleSize}, want 30px (--fs-flow)`);
  ck(r.lines === 1, `${label}: the step 3 title wraps onto ${r.lines} line(s) at 390px, want 1`);
  ck(r.onWidth === '22px' && r.onHeight === '22px',
    `${label}: a checked option's radio circle is ${r.onWidth}x${r.onHeight}, want 22px x 22px`);
  ck(r.offWidth === '22px' && r.offHeight === '22px',
    `${label}: an unchecked option's radio circle is ${r.offWidth}x${r.offHeight}, want 22px x 22px`);
  ck(r.onBg !== r.offBg,
    `${label}: a checked and an unchecked radio circle both fill "${r.onBg}" -- checked should be a filled dot, unchecked an empty ring`);
  ck(r.swInPgrp, `${label}: "Even out earlier games" is not inside a .pgrp group`);
}
