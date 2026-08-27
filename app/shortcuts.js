/* ================================================================== *
 * shortcuts.js -- the keyboard, and the two sheets that describe it
 *
 * The keyboard map and the help sheet look like two things and are one:
 * every guard at the top of the keydown handler asks whether some overlay
 * is up, and two of those overlays are the sheets defined here. Splitting
 * them would put the guard in one file and the thing it guards against in
 * another.
 *
 * Both sheets are trapped overlays of the same shape as the rest of the
 * app's (see trap.js), and every shortcut drives an existing button rather
 * than duplicating its work -- so a control that is disabled or missing is
 * already the answer for the key too.
 *
 * `setView` comes in through `initShortcuts`; everything else this needs
 * is a module of its own to import.
 * ================================================================== */
import { $, on } from './dom.js';
import { openTrap, closeTrap } from './trap.js';
import { startTour } from './tour.js';
import { openGameMode } from './gamemode.js';
import { state } from './state.js';

let setView = () => {};

export function initShortcuts(setViewFn) {
  setView = setViewFn;
  on('#keysHint', 'onclick', openKeys);
  on('#keysClose', 'onclick', closeKeys);
  /* Wrapped, not passed by name: `openHelp` takes a section id now and `on`
     hands a handler the click Event. */
  on('#helpBtn', 'onclick', () => openHelp());
  on('#helpClose', 'onclick', closeHelp);
  on('#helpTour', 'onclick', () => { closeHelp(); startTour(); });
  /* The in-app "?" affordances (A20 slice 4). The markup is the list -- one
     `data-help` per `#help` section, on the control that section is about --
     so adding a sixth is an edit to index.html and nothing here.
     `preventDefault` is load-bearing for the three that sit inside a
     `<summary>`: a click on a summary's descendant toggles the fold as its
     default action, and cancelling the event anywhere on the way up cancels
     that too. */
  for (const q of document.querySelectorAll('[data-help]')) {
    q.onclick = e => { e.preventDefault(); openHelp(q.dataset.help); };
  }
  document.addEventListener('keydown', onKey);
}

/* ---- keyboard shortcuts -------------------------------------------------
 * Every shortcut drives an existing button rather than duplicating its work,
 * so a disabled or missing control is already the answer for the key too.
 * The sheet is a trapped overlay like the others; Escape closes it there.
 * Its buttons are wired in initShortcuts, above, with the help sheet's. */
function openKeys() {
  const k = $('#keys');
  if (!k || !k.hidden) return;
  const trigger = document.activeElement;
  k.hidden = false;
  openTrap(k, closeKeys, trigger);
}
function closeKeys() {
  const k = $('#keys');
  if (!k || k.hidden) return;
  k.hidden = true;
  closeTrap(k);
}
/* ---- help ---------------------------------------------------------------
 * The same trapped-overlay shape as the shortcuts sheet, but this one has a
 * button on the phone: the shortcuts are keyboard-only, the reference is for
 * the parent who got handed the clipboard ten minutes ago. Its content is
 * static markup — see the note in index.html.
 *
 * "Show me around again" closes the sheet before starting the tour rather
 * than stacking one overlay on the other: the tour spotlights things the
 * sheet is sitting on top of. */
function openHelp(section) {
  const h = $('#help');
  if (!h || !h.hidden) return;
  const trigger = document.activeElement;
  h.hidden = false;
  const box = h.querySelector('.keysbox');
  box.scrollTop = 0;
  if (section) scrollHelpTo(box, section);
  openTrap(h, closeHelp, trigger);
}

/* Y only, by hand, and never `scrollIntoView` -- the same rule tour.js:206
   carries and for the same reason: its `inline` defaults to 'nearest', which
   scrolls the container sideways the moment the anchor does not fit across.
   A dialog is not a document, so there is nothing to scroll back with, and a
   help sheet parked 30px to the left slices the first letter off every line
   of the copy it was opened to show. Nothing here may move X.

   `.keysbox` is the scroll container (that is why the header above it is
   sticky), so this is one `scrollTop` write and no style change at all --
   `.keyswrap`, `.keysbox` and `.keys-hd` are untouched, which is what keeps
   `test/dialog-viewport.test.js`'s shape out of it. The header's height comes
   OFF the target: it is sticky at `top: 0`, so an anchor scrolled to exactly
   its own offset lands underneath it.

   `offsetTop` rather than a rect: both elements share an offset parent (the
   fixed `.keyswrap`; `.keysbox` is static and the sticky header is a sibling,
   not an ancestor), and the wrap animates in with a translate that a rect
   would read mid-flight while offsets ignore it. */
function scrollHelpTo(box, section) {
  const t = box.querySelector(`#${section}`);
  if (!t) return;
  const hd = box.querySelector('.keys-hd');
  /* The 10px is not decoration. Both offsets are taken from the same offset
     parent, so the difference carries `.keysbox`'s 1px border, and measured
     without it the Rules heading landed one pixel UNDER the sticky header --
     its top row clipped, on the one section this affordance exists to reach.
     The rest is air, so the heading reads as the top of a section rather than
     as a second line of the sheet's own title. */
  box.scrollTop = Math.max(0, t.offsetTop - box.offsetTop - (hd ? hd.offsetHeight : 0) - 10);
}
function closeHelp() {
  const h = $('#help');
  if (!h || h.hidden) return;
  h.hidden = true;
  closeTrap(h);
}
/* `v` used to flip a pair; with a third tab it walks a ring, and the ring is
   read off the bar rather than listed here. The tabs ARE the answer to "which
   views does v visit", so asking them is what keeps a fourth tab -- or a
   removed one -- from needing a second edit in this file.

   Settings is deliberately outside the ring: it has no tab (the bar's last slot
   went to Season), it is opened once a season, and a shortcut that drops a
   coach onto a page of policy while they are hunting for the roster is worse
   than a shorter ring. From Settings, `indexOf` misses and this lands on the
   first tab, which is the "get me back to the app" a coach wanted anyway. */
function nextView() {
  const views = [...document.querySelectorAll('#viewnav button')].map(b => b.dataset.view);
  if (!views.length) return 'games';
  return views[(views.indexOf(state.view) + 1) % views.length];
}

// while a field has the keyboard it owns every key: eating a letter out of a
// player's name to shuffle the rotation is worse than having no shortcut
const typingIn = t => !!t && (t.isContentEditable ||
  /^(input|textarea|select)$/i.test(t.tagName || ''));

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return;
  if (!state.onboarded) return;
  // same for the tour: Escape (the trap's job) and the buttons are the whole
  // interface while it is up, and a stray `s` reshuffling the rotation being
  // pointed at would be baffling
  if (!$('#tour').hidden) return;
  // the help sheet is reading matter, and the shortcuts it describes should
  // not fire out from under it
  if (!$('#help').hidden) return;
  if (e.key === '?') { e.preventDefault(); $('#keys').hidden ? openKeys() : closeKeys(); return; }
  // the sheet is the top layer: nothing underneath it moves while it is up
  if (!$('#keys').hidden) return;
  const gmOpen = !$('#gamemode').hidden;
  if (gmOpen) {
    // Escape is the focus trap's job -- see openTrap
    if (e.key === 'ArrowRight') { $('#gmNext2').click(); return; }
    if (e.key === 'ArrowLeft') { $('#gmPrev').click(); return; }
    return;
  }
  const k = e.key.toLowerCase();
  /* `p` stays global even though `#print` now lives inside the games view
     (beside the card -- it left the top bar entirely), so on three views out of
     four the button it clicks is inside a hidden `<main>`. A dead key is worse
     than an absent one, and the third option beats both of the obvious two:
     `printCard` already switches to Games before it reaches the print dialog,
     so clicking the button inside the hidden view takes the coach to the card
     and prints it. `.click()` fires on a hidden element -- only `disabled`
     stops it, which is what `[data-needs-card]` wants, so the blocked-plan gate
     still covers the key too.
     It also keeps the `#keys` sheet honest: "Print the card", no view caveat. */
  if (k === 'p') { e.preventDefault(); $('#print').click(); }
  else if (k === 'v') { e.preventDefault(); setView(nextView()); }
  else if (state.view !== 'games') return;
  else if (k === 's') { e.preventDefault(); $('#regen').click(); }
  else if (k === 'b') { e.preventDefault(); openGameMode(); }
}
