/* ================================================================== *
 * app.js -- the entry point
 *
 * What is left here after the split is the wiring: the handlers for the
 * controls that no single module owns, and the boot sequence at the
 * bottom that hands each module the callbacks it cannot import. The
 * rendering lives in render.js, and everything it paints in a module of
 * its own -- see docs/architecture.md for the map.
 *
 * The one rule to keep: nothing imports back from this file. Every module
 * takes `render` / `renderAll` / `soon` / `setView` through its `init*`
 * function instead, which is what keeps the import graph a tree.
 * ================================================================== */
import { parseRoster, repeatIndexes } from './roster.js';
import { icon } from './icons.js';
import { $, on, set, uid } from './dom.js';
import { renderCards, renderCardFold, CARD_FONT } from './card.js';
import { shareCards } from './share.js';
import { backupFilename, downloadBackup, readBackup, keepStored } from './backup.js';
import { initTimeline } from './timeline.js';
import { initGameMode, openGameMode, renderGameMode, clearOverrides } from './gamemode.js';
import { initBalance } from './balance.js';
import { initRules } from './rules.js';
import { initStrategy } from './strategy.js';
import { initRoster } from './roster-view.js';
import { initTour } from './tour.js';
import { initOnboarding } from './onboarding.js';
import { initPlanView } from './plan-view.js';
import { initGameSetup } from './game-setup.js';
import { initTeams, renderSettings } from './teams-view.js';
import { initSeason } from './season-view.js';
import { initShortcuts } from './shortcuts.js';
import { initToast, undoable, offer, flash, tipAfterPrint, tipAfterGame } from './toast.js';
import { track, startAnalytics } from './analytics.js';
import { render, renderAll, soon, setView, applyTheme, applyTint, AFTER_EDIT, PLAN_ONLY } from './render.js';
import { state, save, game, teamName, removePlayer , nextHue, hueSlots, reseed,
         replaceState, emptyConstraints, newGame, migrateLegacy, noRoster, team } from './state.js';
import { openTrap, closeTrap } from './trap.js';

/* ---------------- the controls app.js still owns ---------------- */
/* The gear only ever shows on Today (N4) -- it lives inside `#barToday`,
   which `applyView` hides everywhere else -- so it has one job. The back
   button is the same shape on the other four screens: `Back to Today` (N5)
   is always exactly what it does. */
on('#settingsBtn', 'onclick', () => setView('settings'));
on('#backBtn', 'onclick', () => setView('today'));
for (const b of document.querySelectorAll('#stratseg button')) {
  b.onclick = () => { game().strategy = b.dataset.strat; track('plan_generated', { strategy: b.dataset.strat }); renderAll(); };
}

/* #22: the Appearance group replaces the theme cycler. Same delegated shape
   as the segs teams-view.js wires (`#maxSubsSeg` and friends): static
   buttons, one handler, a full paint through `applyTheme()` rather than a
   render key of its own -- the group is the only thing on screen the theme
   change touches. */
on('#themeSeg', 'onclick', (e) => {
  const b = e.target.closest('button[data-theme]');
  if (!b || b.dataset.theme === state.ui.theme) return;
  state.ui.theme = b.dataset.theme;
  save(); applyTheme();
});
/* #25: the picker is the `.keyswrap` dialog pattern (`trap.js`'s
   openTrap/closeTrap), same shape as `#help` -- see shortcuts.js's
   openHelp/closeHelp. Choosing a color only needs the tint attribute and
   the settings row repainted -- nothing else on screen reads the team
   color -- so this saves and calls `applyTint()` / `renderSettings()`
   directly rather than `renderAll()`, same shape as the theme handler
   above. `save()` surfaces a failed write the same way `render()`'s does:
   it writes the recovery banner itself (state.js); only the extra toast
   `render()` fires via `saveJustFailed()` is skipped, same as the theme
   handler. Then this closes the picker and returns focus to
   `#teamColorBtn` -- `closeTrap` is what restores focus to the trigger
   `openTrap` recorded. */
function closeColorPicker() {
  const p = $('#colorPicker');
  if (!p || p.hidden) return;
  p.hidden = true;
  closeTrap(p);
}
on('#teamColorBtn', 'onclick', (e) => {
  const p = $('#colorPicker');
  if (!p || !p.hidden) return;
  p.hidden = false;
  openTrap(p, closeColorPicker, e.currentTarget);
});
on('#colorPickerClose', 'onclick', closeColorPicker);
on('#colorOpts', 'onclick', (e) => {
  const b = e.target.closest('button[data-color]');
  const s = team()?.settings;
  if (!b || !s) return;
  if (b.dataset.color !== s.color) { s.color = b.dataset.color; save(); applyTint(); renderSettings(); }
  closeColorPicker();
});
on('#dayName', 'oninput', e => { state.day.name = e.target.value; save(); });
on('#teamName', 'oninput', e => {
  state.teamName = e.target.value;
  save();
  // the day title and the card both read it; neither rebuilds this input
  set('#dayName', 'placeholder', teamName() || 'Name this day…');
  soon('cards');
});
on('#label', 'oninput', e => { game().label = e.target.value; soon('tabs', 'totals', 'cards'); });
on('#when', 'oninput', e => { game().when = e.target.value; soon('tabs', 'cards'); });
on('#copies', 'onchange', e => { state.ui.copies = Number(e.target.value); save(); renderCards(); });

on('#cardToggle', 'onclick', () => {
  state.ui.cardOpen = !state.ui.cardOpen;
  save();
  renderCardFold();
  // opening it should show it: the strip can sit anywhere in a long page, and
  // expanding something below the fold reads as nothing having happened
  if (state.ui.cardOpen) $('#sheet')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
on('#cardId', 'onchange', e => { state.ui.cardId = e.target.value; save(); renderCards(); });
on('#cardSize', 'onchange', e => {
  state.ui.cardSize = e.target.value === 'half' ? 'half' : 'pocket';
  save(); render('setup', 'cards');
});
on('#printScope', 'onchange', e => { state.ui.printScope = e.target.value; save(); renderCards(); });
on('#showMinutes', 'onchange', e => { state.ui.showMinutes = e.target.checked; save(); renderCards(); });
on('#regen', 'onclick', () => { if (reseed(game())) flash('New rotation. The swaps you made by hand were cleared.'); renderAll(); });
function printCard() {
  track('card_printed', { size: state.ui.cardSize === 'half' ? 'half' : 'pocket' });
  /* Still needed after `#print` moved out of the top bar and into the games
     view beside the card. The button is now unreachable by pointer off Games,
     but `p` is deliberately global and clicks it inside the hidden view, so
     without this the key would spool whatever page is on screen. Keeping it
     is what makes `p` land on the card from Settings, Team and Season.
     `instant`: the print dialog opens in the same tick, and a print taken
     while the transition's snapshot overlay is up prints the overlay. */
  if (state.view !== 'games') setView('games', true);
  window.print();
  tipAfterPrint();
}
on('#print', 'onclick', printCard);

/* The phone action bar's second button. It carried a printer icon and scrolled
   to the card instead of printing -- and below 1100px the card preview is
   folded shut by default, so `scrollIntoView` ran against a `display: none`
   element and the button did nothing at all. A printer that silently does
   nothing is about the worst button in the app; it prints now, which is what it
   has always looked like it does. */
on('#abCard', 'onclick', printCard);


/* Share the card as an image. `shareCards` paints synchronously so the tap's
   activation still stands when `navigator.share` is called -- do not put an
   await in front of it. */
on('#shareCard', 'onclick', () => {
  const cards = [...document.querySelectorAll('#sheet .card:not(.card-copy)')];
  if (!cards.length) return;
  const g = game();
  const slug = (g.label || teamName() || 'rotation').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'rotation';
  /* Deliberately not disabled while this runs. The paint is synchronous and
     takes ~10ms, so there is no window to double-tap in, and the share sheet
     is modal on the platforms that have one -- whereas a `finally` that never
     fires (a share promise that simply never settles is a real browser
     behavior) would leave a coach with a dead button and no way back. */
  let how;
  try {
    how = shareCards(cards, {
      filename: `benchcard-${slug}.png`,
      title: g.label ? `Rotation vs ${g.label}` : `${teamName() || 'Benchcard'} rotation`,
    });
  } catch (err) {
    console.warn('share failed', err);
    flash('Could not make the image. Print still works.');
    return;
  }
  // A share sheet is its own confirmation; the quiet fallbacks are not.
  how.then(r => {
    if (r === 'copied') flash('Card copied. Paste it into a message.');
    else if (r === 'saved') flash('Card saved as a PNG.');
    if (r !== 'cancelled') track('card_shared', { how: r });
  }).catch(err => {
    console.warn('share failed', err);
    flash('Could not share the image. Print still works.');
  });
});

on('#addplayer', 'onclick', () => {
  state.players.push({ id: uid('p'), name: '', number: '', shortName: '', tier: 3, hue: nextHue() });
  renderAll();
  const rows = document.querySelectorAll('#rosterlist .rrow');
  rows[rows.length - 1]?.querySelectorAll('input')[1]?.focus();
});
on('#bulktoggle', 'onclick', () => { const w = $('#bulkwrap'); w.hidden = !w.hidden; if (!w.hidden) $('#bulk').focus(); });
/* Phone-only: the card-name override costs the name column 72px it needs more,
   so it lives on a second line the coach opts into. Deliberately not persisted
   -- it is a one-off fix-up, not a mode to come back to. */
on('#cardnames', 'onclick', e => {
  const on2 = $('#rosterlist').classList.toggle('cardnames');
  e.currentTarget.setAttribute('aria-pressed', String(on2));
});
/* Paste appends, and it must keep doing so -- twins with the same first name
   are real, so a silent dedupe would quietly delete a kid. What it must not do
   is say nothing when a coach pastes the same list twice: the roster doubles,
   and the card copes by disambiguating to MARW / MARW2 / MARW3, which is a
   card nobody can read. So: add everything, then name the repeats and offer to
   drop just those. Ignoring the offer leaves the paste exactly as it landed. */
on('#bulkadd', 'onclick', () => {
  const parsed = parseRoster($('#bulk').value);
  if (!parsed.length) return;
  const repeats = repeatIndexes(state.players, parsed);
  const slots = hueSlots(parsed.length);
  const added = parsed.map((x, i) => ({ id: uid('p'), name: x.name, number: x.number, shortName: '', tier: 3, hue: slots[i] }));
  state.players.push(...added);
  $('#bulk').value = ''; $('#bulkwrap').hidden = true;
  renderAll();
  if (!repeats.length) return;
  const n = repeats.length;
  const ids = repeats.map(i => added[i].id);
  offer(`${n} of these ${n === 1 ? 'was' : 'were'} already on the roster.`, 'Skip them', () => {
    for (const id of ids) removePlayer(id);
    renderAll();
  });
});
on('#bulk', 'oninput', () => {
  const n = parseRoster($('#bulk').value).length;
  set('#bulkCount', 'textContent', n ? `${n} player${n === 1 ? '' : 's'} detected` : '');
});

/* ---- backup -------------------------------------------------------------
 * The whole record, out to a file the coach owns and back in again. See
 * backup.js for why there is no second serialiser and no second parser. */
on('#exportBackup', 'onclick', () => {
  try {
    downloadBackup(state, backupFilename(teamName()));
  } catch (err) {
    console.warn('backup failed', err);
    flash('Could not save the backup file.');
    return;
  }
  flash('Backup saved. Keep it somewhere safe.');
});

/* Ask the browser not to evict us, once, after boot.

   This is the half of the data-loss defence that does not need the coach to
   remember anything -- the backup file above and the install nudge in toast.js
   both do. It is deliberately silent when refused: `keepStored` reports what
   `navigator.storage.persisted()` says, and only a `true` from the browser
   itself is allowed to put the reassuring line on screen. See backup.js for
   what each engine actually answered when this was measured. */
keepStored().then(kept => { if (kept) set('#persistNote', 'hidden', false); })
  .catch(() => {});

function pickBackup() {
  const f = $('#backupFile');
  // reset first: picking the same file twice in a row fires no change event
  // otherwise, and a coach who restored the wrong file and undid it wants
  // exactly that second attempt to work
  f.value = '';
  f.click();
}
on('#importBackup', 'onclick', pickBackup);
// the same picker, reached from first run -- see the comment in index.html
on('#welRestore', 'onclick', pickBackup);

/* Restore replaces, it does not merge. Merging is the wrong default here:
   player ids collide across two exports of the same record, and "restore my
   backup" means put it back how it was, not double it. Deliberately no confirm
   dialog -- removing a team is the one confirm in this app -- so the net is
   `undoable`, which snapshots the whole record and offers nine seconds back. */
on('#backupFile', 'onchange', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  let text;
  try { text = await file.text(); }
  catch (err) { console.warn('backup read failed', err); flash('Could not read that file.'); return; }
  restoreBackup(text);
});

/* One restore, whether the string came from a file the coach picked or from
   text they pasted. `readBackup` never cared where the string came from, so
   the paste path is a textarea and this function -- no second parser, no
   second confirm, no second rejection message. Returns whether it took. */
function restoreBackup(text) {
  const record = readBackup(text, { emptyConstraints, newGame, migrateLegacy });
  if (!record) { flash('That is not a Benchcard backup.'); return false; }
  const teams = record.teams.length;
  const players = record.teams.reduce((n, t) => n + t.players.length, 0);
  const from = state.onboarded ? state.view : 'welcome';
  /* A restore from the first-run screen has to leave it, and undoing that
     restore has to go back to it -- `setView` forces 'welcome' by itself once
     `onboarded` is false again. Anywhere else the coach stays exactly where
     they are and watches the roster refill under them; jumping them to
     whatever view the file happened to be saved on would read as the app
     losing its place. */
  const show = () => {
    setView(from === 'welcome' ? 'team' : from, true);
    renderAll();
  };
  undoable(
    `Restored ${players} player${players === 1 ? '' : 's'}`
      + `${teams > 1 ? ` across ${teams} teams` : ''}.`,
    () => replaceState(record), show);
  return true;
}

/* Both entry points carry the same block of markup, so wire them the same way
   rather than by id. Revealing it hides the link: there is one way in and one
   thing to do next, and a coach mid-restore should not be looking at both. On
   a rejection the text stays put -- they may have pasted half a file, and
   clearing it would take the evidence away. */
for (const wrap of document.querySelectorAll('.pastein')) {
  const open = wrap.querySelector('.paste-open');
  const box = wrap.querySelector('.pastebox');
  const ta = wrap.querySelector('.paste-text');
  open.onclick = () => { box.hidden = false; open.hidden = true; ta.focus(); };
  wrap.querySelector('.paste-go').onclick = () => {
    if (!restoreBackup(ta.value)) return;
    ta.value = ''; box.hidden = true; open.hidden = false;
  };
}

// the rest of game mode's wiring lives in initGameMode(), below
on('#gmReset', 'onclick', () => {
  undoable('Back to the printed plan.', clearOverrides, () => { save(); renderGameMode(); });
});
on('#gmOpen', 'onclick', openGameMode);
on('#abBench', 'onclick', openGameMode);


// The card is auto-fitted from canvas measurements. The UI's CSS no longer
// references Inter, so document.fonts.ready is no longer guaranteed to wait
// for the card face in every engine (card.js's own measureText call does
// start that load, but relying on that side effect is engine-specific --
// see scripts/smoke.mjs). Load CARD_FONT explicitly -- the same stack
// card.js measures with, imported rather than re-typed, so this can never
// drift from what the card prints in -- (falling back to `ready` where
// `load` is unsupported, and to `ready` again if the load itself fails) and
// re-fit once it settles.
if (document.fonts) {
  const settled = document.fonts.load
    ? document.fonts.load(`800 16px ${CARD_FONT}`).catch(() => document.fonts.ready)
    : document.fonts.ready;
  settled.then(() => {
    if (state.onboarded) render('cards');
  });
}

// fill the static icon placeholders declared in the markup
for (const n of document.querySelectorAll('.i[data-icon]')) {
  if (!n.firstChild) n.append(icon(n.dataset.icon, { size: '1em' }));
}

// On a phone the rotation and the card matter most; Across-the-day is
// reference. Collapse it by default there, but only on first paint so a
// coach who opens it keeps it open.
if (matchMedia('(max-width: 620px)').matches) {
  const df = $('#dayFold'); if (df) df.open = false;
}

/* Plan folds on the same terms, with one extra condition: it stays open while
   the strategy is still the default. Even has no body at all, so an open
   Plan costs an Even coach ~60px and keeps the one control that says what
   this app does on the first screen. A coach who has picked By hand, Closers
   or Platoon has already made that choice -- and those three carry an editor
   tall enough to push the rotation off the phone entirely -- so for them the
   summary hint is the answer and the fold shuts. First paint only, same rule
   as the folds above. */
if (!noRoster() && game()?.strategy !== 'balanced') { const pf = $('#planFold'); if (pf) pf.open = false; }

/* Analytics: counters only, and only if ANALYTICS has been filled in. See
   analytics.js -- the payload builder is what makes "your roster never leaves
   your device" true rather than a promise. */
startAnalytics();
window.addEventListener('appinstalled', () => track('pwa_installed'));
// once per load as well as on every strategy change, otherwise a coach who
// picked Closers months ago and never touches the segment reads as Even
if (state.onboarded) track('plan_generated', { strategy: game()?.strategy });

/* Wire the modules together. Everything a module cannot import for itself
   is handed to it here: the dispatcher and the scheduler out of render.js,
   and gamemode's second argument, which is the tip prompt's bench-mode
   trigger -- gamemode.js calls it on close and knows nothing else about
   the tip jar. This is the only place in the app that knows the whole
   graph, which is the point of it being the entry point. */
initToast(renderAll, setView);
initTeams(renderAll, setView);
initSeason(renderAll);
initBalance(soon, AFTER_EDIT);
initRoster(soon, AFTER_EDIT);
initGameMode(render, tipAfterGame, { undoable, flash });
initTimeline(setView);
initTour(setView);
initRules(soon, PLAN_ONLY);
initStrategy(soon, PLAN_ONLY);
initOnboarding(setView, renderAll);
initPlanView(renderAll);
initGameSetup(renderAll, soon, PLAN_ONLY, AFTER_EDIT);
initShortcuts(setView);
setView(state.onboarded ? (state.view || 'today') : 'welcome');
/* There was a `body.boot` class here, added before the first paint and removed
   700ms later to "let the entrance play once". No stylesheet ever carried a
   rule for it -- not in any commit -- so it gated nothing. The entrance it was
   meant to gate is `.view { animation: viewIn }`, which already runs once per
   view insertion and not on repaint. Removed 2026-08-24 by the dead-class
   sweep; do not re-add a gate without the rule it gates. */

/* The boot boundary. `window.benchcard` is installed by the inline script in
   index.html's head -- see the comment there for why it cannot live in a
   module. Not re-thrown: the panel is already up and the error is already
   counted, and the stack stays in the console where a developer can read it
   and nothing sends it. */
try {
  renderAll();
  if (window.benchcard) window.benchcard.booted = true;
} catch (e) {
  console.error(e);
  window.benchcard?.fail('boot');
}
