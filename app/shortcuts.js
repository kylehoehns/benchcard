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
import { state, benchOpen, hasGames } from './state.js';

let setView = () => {};

export function initShortcuts(setViewFn) {
  setView = setViewFn;
  on('#keysHint', 'onclick', openKeys);
  on('#keysClose', 'onclick', closeKeys);
  on('#helpBtn', 'onclick', () => openHelp());
  on('#helpClose', 'onclick', closeHelp);
  on('#helpTour', 'onclick', tourAgain);
  /* #22: Settings carries its own "Show me around again", beside the help
     sheet's. Same function, not a second way to start the tour -- closing the
     help sheet is a no-op when it is not open, which is exactly the case from
     Settings. */
  on('#helpTourSettings', 'onclick', tourAgain);
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
function openHelp() {
  const h = $('#help');
  if (!h || !h.hidden) return;
  const trigger = document.activeElement;
  h.hidden = false;
  // #126: the tour walks the game screen, unreachable with no games -- its
  // own row in the sheet goes with it.
  const helpTour = $('#helpTour');
  if (helpTour) helpTour.hidden = !hasGames();
  const box = h.querySelector('.keysbox');
  box.scrollTop = 0;
  openTrap(h, closeHelp, trigger);
}

function closeHelp() {
  const h = $('#help');
  if (!h || h.hidden) return;
  h.hidden = true;
  closeTrap(h);
}
/* "Show me around again", wherever it is tapped from. Closes the help sheet
   before starting the tour rather than stacking one overlay on the other --
   see the note above `openHelp` -- and `closeHelp` is already a no-op when
   the sheet is not open, which is the case for the Settings button (#22). */
function tourAgain() { closeHelp(); startTour(); }
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
  // and for the Add-a-game flow (#32): it covers the screen, so the keys
  // belong to the three steps, not to the game underneath them
  if ($('#addGameFlow')?.open) return;
  // the help sheet is reading matter, and the shortcuts it describes should
  // not fire out from under it
  if (!$('#help').hidden) return;
  if (e.key === '?') { e.preventDefault(); $('#keys').hidden ? openKeys() : closeKeys(); return; }
  // the sheet is the top layer: nothing underneath it moves while it is up
  if (!$('#keys').hidden) return;
  const gmOpen = benchOpen();
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
  // Today opens Team; every other screen goes back to Today (#23).
  else if (k === 'v') { e.preventDefault(); setView(state.view === 'today' ? 'team' : 'today'); }
  else if (state.view !== 'games') return;
  else if (k === 's') { e.preventDefault(); $('#regen').click(); }
  else if (k === 'b') { e.preventDefault(); openGameMode(); }
}
