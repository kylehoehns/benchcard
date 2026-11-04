import { evalJSON, realTap } from './sheet-drive.mjs';

/* #145's own visual checks for Add a game, split out of `add-game-flow.mjs`
 * when that file crossed the 40,000-byte ceiling `smoke-size.test.js` holds
 * every smoke module to (the same seam `add-game-fit.mjs` already split off
 * for the flow's hard-size look checks). This file's own seam: items 4 and
 * 5's painted-style claims -- exactly one `--tint` fill and a checked-in
 * tile's ring -- called from `addGameFlowPass`, which still owns the flow
 * itself. (Step 3's title and radio look went with the step, #565.) */

/* #145 item 4: with the "Same as" card showing, step 1 has exactly one
 * element filled with `--tint` -- the footer's `#agNext`. The card is a
 * button now (item 4), so this is a real risk: a stray `.primary`/`.btn`
 * class left on it would fill it too. `--tint`'s own resolved color, read
 * off a probe element, not a re-typed hex -- teams carry their own tint, so
 * a literal here would be the wrong color for every team but one.
 *
 * Fix pass: the card had shrunk to fit its own text (about 232px of a 390px
 * screen) with "Use it" wrapped onto its own line underneath, instead of the
 * prototype's full-width row with "Use it" beside the text. This same check
 * also measures the card's geometry against the Opponent field above it
 * (same left/right, ±1px) and "Use it"'s box against the title's (to its
 * right, sharing the same vertical band) -- one seam for the whole card. */
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
    const opponent = [...(body ? body.querySelectorAll('.flow-f') : [])]
      .find(l => (l.querySelector('.f')?.textContent || '').trim() === 'Opponent');
    const oppInput = opponent ? opponent.querySelector('input') : null;
    const card = body ? body.querySelector('.flow-card') : null;
    const title = card ? card.querySelector('.flow-card-t') : null;
    const use = card ? card.querySelector('.flow-card-use') : null;
    const rect = el => el ? el.getBoundingClientRect() : null;
    return JSON.stringify({ filled, oppRect: rect(oppInput), cardRect: rect(card),
      titleRect: rect(title), useRect: rect(use) });
  })()`);
  ck(r.filled.length === 1 && r.filled[0] === 'agNext',
    `step 1 has ${r.filled.length} element(s) filled with --tint (${JSON.stringify(r.filled)}), want exactly ["agNext"]`);
  if (!ck(r.oppRect && r.cardRect && r.titleRect && r.useRect,
    'step 1 needs the Opponent input and the card\'s title/"Use it" to compare')) return;
  ck(Math.abs(r.cardRect.left - r.oppRect.left) <= 1 && Math.abs(r.cardRect.right - r.oppRect.right) <= 1,
    `the "Same as" card spans ${Math.round(r.cardRect.left)}-${Math.round(r.cardRect.right)}, `
    + `the Opponent field spans ${Math.round(r.oppRect.left)}-${Math.round(r.oppRect.right)} -- want them equal (±1px)`);
  ck(r.useRect.left >= r.titleRect.right - 1,
    `"Use it" (left ${Math.round(r.useRect.left)}) sits left of the title's own right edge `
    + `(${Math.round(r.titleRect.right)}) instead of beside it`);
  const overlaps = r.useRect.top < r.titleRect.bottom && r.useRect.bottom > r.titleRect.top;
  ck(overlaps, `"Use it" (top ${Math.round(r.useRect.top)}-${Math.round(r.useRect.bottom)}) does not `
    + `vertically overlap the title (${Math.round(r.titleRect.top)}-${Math.round(r.titleRect.bottom)})`);
}

/* #145 item 5: a checked-in tile's own look, read off the painted styles --
 * surface fill, no ring, no border at all (the prototype's `.tile`, decision
 * 8 -- an out tile below keeps its own 1.5px hairline; a checked-in tile
 * does not), and the ✓ still showing. Runs in whatever theme is current when
 * it is called, so `addGameFlowPass` below calls it once under the rich
 * fixture's own theme and once more after a dark reload, the same way
 * `darkInputBgPass` reloads for its own dark pass rather than emulating
 * `prefers-color-scheme`. */
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
      borderWidth: cs.borderTopWidth,
      offBorderColor: getComputedStyle(off).borderColor,
      checkHidden: check ? check.hidden : null,
    });
  })()`);
  await realTap(c, '#agBody .plr:nth-child(2)'); // restore
  if (!ck(r.found, `${label}: #agBody needs both an "on" and an "off" tile to compare`)) return;
  ck(r.boxShadow === 'none', `${label}: a checked-in tile's box-shadow is "${r.boxShadow}", want "none"`);
  // "Transparent or 0 width" rather than one literal: a 0-width border and a
  // transparent 1.5px one both paint nothing, and either keeps the tile from
  // shifting by a pixel against an out tile's real hairline.
  const borderColor = String(r.borderColor);
  const noBorder = borderColor === 'rgba(0, 0, 0, 0)' || borderColor === 'transparent'
    || r.borderWidth === '0px';
  ck(noBorder, `${label}: a checked-in tile's border is "${r.borderColor}" at ${r.borderWidth}, `
    + `want transparent or 0 width (the prototype's tile has no border)`);
  ck(r.checkHidden === false, `${label}: a checked-in tile's ✓ is hidden`);
}
