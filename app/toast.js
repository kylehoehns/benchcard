/* ================================================================== *
 * toast.js -- everything that appears in `#toasts`
 *
 * One box, one timer, five kinds of message, so they live together:
 *
 *   undo   -- a destructive edit, done and offered back (`undoable`)
 *   offer  -- done, with one narrower way out on the side (`offer`)
 *   flash  -- confirmation that something left the app, nothing to undo
 *   tip    -- the tip jar, asked once and never again
 *   update -- a new version took over; the reload is the coach's to time
 *
 * They share `toastTimer` and `liftToasts`, which is why splitting one of
 * them off would mean two modules racing for the same corner of the
 * screen. Only `renderAll` comes in through `initToast`: it belongs to the
 * dispatcher in render.js, and importing it back would close the graph
 * into a cycle.
 * ================================================================== */
import { icon } from './icons.js';
import { $, on, el, clone } from './dom.js';
import { openTrap, closeTrap } from './trap.js';
import { clearPick } from './gamemode.js';
import { state, save, replaceState } from './state.js';
import { downloadBackup, backupFilename } from './backup.js';

// ---------------------------------------------------------------------------
// Set this to your own Buy Me a Coffee / Ko-fi page. Leave it null to hide the
// tip jar entirely. about.html hard-codes the same URL -- analytics.test.js
// pins the two together.
const TIP_URL = 'https://buymeacoffee.com/kylehoehns';
// ---------------------------------------------------------------------------

let renderAll = () => {};

export function initToast(renderAllFn) {
  renderAll = renderAllFn;
  // No tip URL configured: hide the tip link, not the whole footer. The footer
  // also carries the only link to /about.html -- the one page on this site a
  // crawler can read without running the app -- so hiding the footer wholesale
  // took that with it, back when TIP_URL was empty. It is set now.
  const tip = $('#tipLink');
  if (tip) { if (TIP_URL) tip.href = TIP_URL; else tip.hidden = true; }
}

/* ================================================================== *
 * undo
 *
 * Removing a player, removing a game and starting a new day used to be a
 * `confirm()` and gone. A confirm asks at the wrong moment -- before you
 * can see the result -- and a coach cannot tell whether dropping a game
 * was right until the rest of the day has rebalanced. So do it, show what
 * happened, and offer to take it back.
 *
 * The snapshot is the whole of `state`, which is cheap (a day of games is
 * a few KB) and means undo cannot miss a side effect: removing a player
 * sweeps their id out of every game's out-list, constraints and carryover,
 * and any per-action inverse would have to know all of that.
 * ================================================================== */
const UNDO_MS = 9000;
let toastTimer = null;

/* `message` may be a function, resolved after the mutation. Most callers know
   what they are about to say before they say it, but some only know afterwards
   -- "New day" cannot report how many games it filed into the season until it
   has filed them -- and the alternative is running the mutation's rule twice,
   once to predict it and once to do it, which is a rule in two places. */
export function undoable(message, mutate, refresh) {
  const snap = clone(state);
  mutate();
  (refresh || renderAll)();
  showUndo(typeof message === 'function' ? message() : message, snap, refresh);
}

function dismissToast(t) {
  if (!t || t.classList.contains('out')) return;
  clearTimeout(toastTimer);
  t.classList.add('out');
  t.addEventListener('animationend', () => t.remove(), { once: true });
  // belt and braces: a reduced-motion user gets a ~0ms animation, but if the
  // event never lands the toast must not become permanent furniture
  setTimeout(() => t.remove(), 600);
}

/* One toast, optionally with one action button. Undo is the common case but
   not the only useful one -- a bulk paste wants "Skip them", which throws away
   the repeats rather than the whole paste -- so the button's label and what it
   does are the caller's. A toast with no action reads as a confirmation and
   dwells half as long: nothing is waiting on the coach. */
function actionToast(message, label, act) {
  const box = $('#toasts');
  if (!box) return;
  clearTimeout(toastTimer);
  [...box.children].forEach(c => c.remove());

  const t = el('div', 'toast');
  t.append(el('span', 'tmsg', message));

  if (label) {
    const u = el('button', 'tundo press', label);
    u.type = 'button';
    u.onclick = () => { dismissToast(t); act(); };
    t.append(u);
  }

  const x = el('button', 'tx press');
  x.type = 'button';
  x.setAttribute('aria-label', 'Dismiss');
  x.append(icon('x', { size: '1em' }));
  x.onclick = () => dismissToast(t);

  t.append(x);
  box.append(t);

  liftToasts(box);
  toastTimer = setTimeout(() => dismissToast(t), label ? UNDO_MS : UNDO_MS / 2);
  return t;
}

/* The refresh runs twice -- once for the action, once for the undo -- and the
   two are not always the same repaint. Removing a team leaves the coach on a
   roster that no longer exists, so it moves them to Games; putting it back
   should put them back where they were, not leave them where the removal sent
   them. Callers that do not care ignore the flag. */
function showUndo(message, snap, refresh) {
  const t = actionToast(message, 'Undo', () => {
    replaceState(snap);
    clearPick();
    save();
    (refresh || renderAll)(true);
  });
  if (t) t.dataset.undo = '1';
}

/* An undo holds a snapshot of the *whole* app, so applying it after the coach
   has changed something else throws that change away without saying so:
   delete a player, fix a spelling, think better of the delete, and the
   spelling goes back too. A per-action inverse is the other answer and it is
   the one this file deliberately does not take (see `undoable`), so the offer
   retires instead -- the next edit is the coach moving on, and an undo that
   silently loses work is worse than one that is no longer there.

   `soon()` is the caller, for the same reason `editHappened` is called from
   there: it is the one place that can tell "the coach changed something" from
   "the app repainted". Only snapshot toasts carry `data-undo`; an `offer`
   acts on ids, takes nothing back, and is left alone. */
export function retireUndo() {
  const t = $('#toasts .toast[data-undo]');
  if (t) dismissToast(t);
}

/* An offer, not an undo: the roster keeps what the coach just pasted, and the
   button is a second, narrower way out. Nothing happens if it is ignored. */
export function offer(message, label, act) {
  actionToast(message, label, act);
}

// lift clear of whatever else owns the bottom edge -- the phone action bar,
// or game mode's stint nav, which is the one thing a coach must not lose
function liftToasts(box) {
  const gmFoot = $('#gamemode')?.hidden === false ? $('#gamemode .gm-foot') : null;
  const ab = $('#actionbar');
  const bar = gmFoot || (ab && !ab.hidden && getComputedStyle(ab).display !== 'none' ? ab : null);
  const lift = bar ? bar.offsetHeight : 0;
  box.classList.toggle('lifted', lift > 0);
  box.style.setProperty('--toast-lift', `${lift}px`);
}

/* ================================================================== *
 * the tip jar
 *
 * Asked once, at the moment the app has actually done something for the
 * coach -- a card in hand, or a game they just finished coaching off the
 * phone -- and never again whichever way they answer. Declining counts as
 * an answer: a free tool that keeps asking is how something starts
 * feeling like shareware, and the footer link is always there for anyone
 * who changes their mind.
 *
 * Never during a game. `openGameMode` is the one screen where an
 * interruption costs something real, so the bench-mode trigger fires on
 * the way *out*, not on reaching the last stint.
 * ================================================================== */
/* One counter, both paths, and the ask on the third.
 *
 * These used to disagree: printing waited for the second card, finishing a
 * game asked the first time. Whichever happened first won, so from the coach's
 * side the threshold was arbitrary -- and finishing one game could be someone
 * trying it out, which is the worst moment to put a hand out.
 *
 * Three, not two, because two prints can be one game: change a rule, print
 * again. What earns the ask is coming back, and three is the first number that
 * cannot be a single Saturday. */
const USES_BEFORE_ASKING = 3;

function tipEligible() {
  return !!TIP_URL && !state.ui.tipDone && $('#gamemode')?.hidden !== false;
}

/* `ui.prints` keeps its name for the records already carrying it, but it now
   counts every moment the app delivered something, not printed cards. */
function countUse() {
  state.ui.prints = Math.min(99, (state.ui.prints || 0) + 1);
  save();
  return state.ui.prints;
}

/* The two moments worth asking at, kept here rather than at their call sites
   so the wording and the "never twice" rule stay in one file.
 *
 * Two things want these moments now -- the install nudge and the tip jar --
 * and one toast box means one of them at a time. The install nudge goes
 * first and on the earlier use: it protects the coach's roster from being
 * evicted, which is worth more than the coffee, and by the time the tip is
 * due it has already been answered and stood down. `countUse` runs before
 * either gate so declining one does not freeze the counter for the other. */
export function tipAfterPrint() {
  const uses = countUse();
  // after the dialog, not under it
  if (nudgeInstall(uses, 900)) return;
  if (!tipEligible()) return;
  if (uses >= USES_BEFORE_ASKING) setTimeout(() => showTip('That’s your card, coach.'), 900);
}

export function tipAfterGame(reachedEnd) {
  if (!reachedEnd) return;
  const uses = countUse();
  if (nudgeInstall(uses, 700)) return;
  if (!tipEligible()) return;
  if (uses >= USES_BEFORE_ASKING) setTimeout(() => showTip('Good game, coach.'), 700);
}

function showTip(lead) {
  if (!tipEligible()) return;
  const box = $('#toasts');
  if (!box) return;
  clearTimeout(toastTimer);
  [...box.children].forEach(c => c.remove());

  const t = el('div', 'toast tip-toast');
  const msg = el('span', 'tmsg');
  msg.append(el('b', 'tip-lead', lead), ' Benchcard is free, with no ads and no account. If you’d like to help cover the hosting and keep it getting better, a coffee goes a long way.');
  t.append(msg);

  const a = el('a', 'tundo press');
  a.href = TIP_URL;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Buy me a coffee';
  // taking the link is an answer too -- do not ask this coach again
  a.onclick = () => { state.ui.tipDone = true; save(); dismissToast(t); };

  const x = el('button', 'tx press');
  x.type = 'button';
  x.setAttribute('aria-label', 'Not now');
  x.append(icon('x', { size: '1em' }));
  x.onclick = () => { state.ui.tipDone = true; save(); dismissToast(t); };

  t.append(a, x);
  box.append(t);
  liftToasts(box);
  // no auto-dismiss timer: this one waits for an answer rather than expiring
  // unseen, and either button ends it
}

/* ================================================================== *
 * Add to Home Screen
 *
 * WebKit clears a Safari tab's storage after seven days without a visit;
 * an installed web app is exempt. A coach who plans in September and
 * comes back in October loses the roster from a tab and keeps it from the
 * Home Screen, so this is the other half of the defence that roster
 * export and import started -- and it opens full-screen, which is what a
 * coach wants standing on a sideline.
 *
 * Offered once, on an earlier use than the tip jar, and never again
 * either way: the same contract as `tipDone`, remembered in
 * `ui.installDone`. Never over a live game, and never to a browser that
 * is already running installed.
 *
 * iOS has no install API -- Safari's Share sheet is the only way in -- so
 * that path is an illustration pointing at the glyph the coach has to
 * find. Chrome hands over `beforeinstallprompt`, which is a real button.
 * A browser offering neither (desktop Safari, Firefox) is shown nothing:
 * there would be no instruction to give it.
 * ================================================================== */
const USES_BEFORE_INSTALL = 2;

/* Chrome offers the prompt exactly once, and only if the app qualifies:
   manifest, icons, service worker. Holding it is the point -- fired the moment
   it arrives it is a banner nobody asked for; deferred, it becomes a button at
   a moment that has earned one. */
let installEvent = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; });
// installed some other way (Chrome's own menu, an iOS Share sheet before we
// asked): the question is answered, so never put it to them
addEventListener('appinstalled', () => { installEvent = null; state.ui.installDone = true; save(); });

const standalone = () =>
  !!(matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true);

// iPadOS 13+ reports itself as a Mac, so the touch count is the tell
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

function installEligible() {
  return !state.ui.installDone && !standalone() &&
    !!(installEvent || isIOS()) && $('#gamemode')?.hidden !== false;
}

/* Says whether it took this moment, so the tip jar can stand down: one toast
   box means one of them, and stacking two asks back to back is worse than
   either on its own. */
function nudgeInstall(uses, delay) {
  if (uses < USES_BEFORE_INSTALL || !installEligible()) return false;
  setTimeout(showInstall, delay);
  return true;
}

function showInstall() {
  if (!installEligible()) return;
  const box = $('#toasts');
  if (!box) return;
  clearTimeout(toastTimer);
  [...box.children].forEach(c => c.remove());

  const t = el('div', 'toast tip-toast install-toast');
  const msg = el('span', 'tmsg');
  msg.append(el('b', 'tip-lead', 'Keep Benchcard on this device.'));
  // both ways out record an answer, exactly as the tip jar does
  const answered = () => { state.ui.installDone = true; save(); dismissToast(t); };

  if (installEvent) {
    /* Says what installing actually buys, the way the iOS branch below does.
       "safe from a browser cleanup" promised more than that: clearing site
       data still takes the roster, which is what the backup box says two
       screens away. Installed storage is exempt from the browser reclaiming
       space, and that is the claim worth making. */
    msg.append(' Installed, the browser will not clear your roster to free up space. It also opens full screen and works with no signal in the gym.');
    const b = el('button', 'tundo press', 'Install');
    b.type = 'button';
    // hand the prompt over once and let it go: it cannot be shown twice
    b.onclick = () => { const e = installEvent; installEvent = null; answered(); e.prompt?.(); };
    t.append(msg, b);
  } else {
    /* TWO THINGS THIS USED TO GET WRONG, both reported from a phone on
       2026-08-26.

       It said the roster "stays put", which is false and expensive: an
       installed home-screen app gets its OWN storage, so it opens on the
       welcome screen with nothing in it. A coach told to install in order to
       protect a season would install, find an empty app, and reasonably
       conclude they had just lost the season. So the toast says it starts
       empty and hands them the backup file in the same breath -- the one
       moment they are certain to need it is the moment we ask them to install.

       And it named Safari. This branch is the no-`beforeinstallprompt` path,
       which `installEligible` gates behind `isIOS()`, and every browser on iOS
       is WebKit with the same Share sheet -- so a coach in Chrome or Edge on an
       iPhone was being told about a browser they are not using. Nothing here
       needs the brand: the instruction is the same either way.
       `test/device-neutral.test.js` holds both the phrasing and the ban. */
    msg.append(' A browser tab can be cleared after a week without a visit, roster and all. On your home screen it stays and works with no signal. It sets up fresh, though, so save a backup now and restore it there.');
    /* Saves in place and says so on itself. It cannot `flash()`: that goes
       through `actionToast`, which empties the toast box first, and the box is
       holding the Add-to-Home-Screen instruction this whole toast exists to
       give. Nor does it call `answered()` -- saving a file is not an answer to
       "will you install", and the instruction has to survive the tap. */
    const b = el('button', 'tundo press', 'Save a backup');
    b.type = 'button';
    b.onclick = () => {
      try {
        downloadBackup(state, backupFilename(state.teamName));
        b.textContent = 'Backup saved';
      } catch (err) {
        console.warn('backup failed', err);
        b.textContent = 'Could not save';
      }
      b.disabled = true;
    };
    const how = el('span', 'install-how');
    how.append('Then tap ', icon('share', { size: '1.2em', cls: 'install-share' }), ' and ');
    how.append(el('b', null, 'Add to Home Screen'), '.');
    msg.append(how);
    t.append(msg, b);
  }

  const x = el('button', 'tx press');
  x.type = 'button';
  x.setAttribute('aria-label', 'Not now');
  x.append(icon('x', { size: '1em' }));
  x.onclick = answered;

  t.append(x);
  box.append(t);
  liftToasts(box);
  // no timer, same as the tip: this one waits for an answer rather than
  // expiring unseen, and either way out ends it for good
}

/* A toast with nothing to undo: confirmation that something left the app.
   Same live region as the undo toast, so a screen reader hears it too, and
   half the dwell -- there is no decision waiting on it. */
export function flash(message) {
  actionToast(message, null, null);
}

/* ================================================================== *
 * a new version has taken over
 *
 * `sw.js` hands over as soon as a new worker installs, but the page it
 * hands over to keeps the modules it already loaded -- deliberately, so
 * nothing swaps underneath a coach mid-substitution. New code appears on
 * the next navigation, and on an installed iOS app that navigation can be
 * weeks away (see the registration script in index.html).
 *
 * So say so, and let the coach choose the moment. Never automatic: a
 * reload during a game costs a coach their place in the rotation, and
 * that is the thing the conservative handover exists to protect. Never
 * over game mode either, the same suppression the tip jar and the install
 * nudge use -- and unlike those two this is not an ask that needs
 * remembering across visits, so it carries no counter and no flag: a
 * reload settles it, and the next navigation settles it anyway.
 * ================================================================== */
/* Whether this page was already being controlled when it booted. A first
   visit installs a worker that claims the page immediately, which fires
   `controllerchange` for a page that is not stale at all -- offering that
   coach a reload of the code they just loaded would be nonsense. */
const wasControlled = !!navigator.serviceWorker?.controller;
let updateWaiting = false;

function offerReload() {
  // `hidden === false` is bench mode on screen -- the one place an
  // interruption costs something real, exactly as the tip jar reads it
  if (!updateWaiting || $('#gamemode')?.hidden === false) return;
  /* The flag stays set on purpose. This toast dwells nine seconds like any
     other offer, and a coach who was not looking at the phone for those nine
     seconds is left running the very stale code this exists to clear -- so it
     comes back the next time they return to the app. A reload ends it; so does
     any navigation, which is what fixes the page anyway. */
  offer('Benchcard updated.', 'Reload', () => location.reload());
}

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled) return;
    updateWaiting = true;
    offerReload();
  });
  /* Suppressed because a game was open, or because the takeover happened
     while the app was in the background: offer it on the way back. */
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') offerReload();
  });
}

/* ================================================================== *
 * the one confirm
 *
 * Everything else destructive in this app is an undo toast, deliberately:
 * a confirm asks before you can see the result, and a coach cannot judge
 * dropping a game until the rest of the day has rebalanced.
 *
 * Removing a team is the exception, and it is the only one. It takes a
 * whole roster, a season of levels and every game with it, and a nine
 * second undo window is thin protection for that much work. The undo
 * toast still fires afterwards -- this is a second net, not a
 * replacement.
 * ================================================================== */
let confirmRun = null;

export function confirmAction({ title, body, verb = 'Remove', run }) {
  const wrap = $('#confirm');
  if (!wrap) { run(); return; }          // no dialog in the DOM: do not lose the action
  confirmRun = run;
  $('#confirmTitle').textContent = title;
  $('#confirmBody').textContent = body;
  $('#confirmYes').textContent = verb;
  wrap.hidden = false;
  openTrap(wrap, closeConfirm, document.activeElement);
  // focus lands on Cancel, not on the destructive button: a stray Return
  // should do nothing, and the safe choice is the one already under the thumb
  $('#confirmNo').focus();
}

function closeConfirm() {
  const wrap = $('#confirm');
  if (!wrap || wrap.hidden) return;
  wrap.hidden = true;
  confirmRun = null;
  closeTrap(wrap);
}

on('#confirmNo', 'onclick', closeConfirm);
on('#confirmYes', 'onclick', () => {
  const run = confirmRun;
  closeConfirm();
  run?.();
});
// a tap on the scrim is a cancel, matching every other overlay here
on('#confirm', 'onclick', e => { if (e.target.id === 'confirm') closeConfirm(); });
