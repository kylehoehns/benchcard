/* Game mode.

   The card, full screen and live. Reality diverges from the plan -- foul
   trouble, a late arrival -- so a swap here overrides the plan for this
   stint (or the rest of the game) without re-solving underneath the coach.
   Overrides are stored per game, so leaving and coming back keeps them.

   Split out of app.js as its own seam. It owns `gmPick` / `gmScope` and the
   live-minutes maths, and it is the only thing that writes `game().live`.
   The one thing it cannot own is `render()`: the dispatcher still names the
   twelve view functions and stays in app.js until they are all modules, so
   app.js hands it in through `initGameMode` rather than gamemode.js importing
   back into app.js and making the graph circular. */
import { fmtClock, fmtMinutes } from './engine.js';
import { callNames } from './roster.js';
import { swapIn, sheetUp, tick, enabled as fxOn } from './fx.js';
import { icon } from './icons.js';
import { $, on, set, el, ctx2d } from './dom.js';
import { openTrap, closeTrap } from './trap.js';
import { track } from './analytics.js';
import { state, save, plans, colorOf, initials, game, gameLabel, byId, availIds, effectiveLineup,
         resolveRest } from './state.js';

/* Set by initGameMode; see the note above on why this is injected. */
let render = () => {};
/* Called on the way out with whether the coach actually got to the end of the
   game. app.js uses it to decide whether to show the tip prompt; this module
   deliberately knows nothing about that. */
let onClose = () => {};
/* Injected like `render`, and for a reason of its own: toast.js imports
   `clearPick` from this module, so importing `undoable` back the other way
   would close the graph into a cycle.

   This used to arrive beside an injected `retireUndo`, because every mid-game
   edit that offered no undo of its own had to take the pending one down --
   a snapshot that predates the edit throws it away silently. Every mid-game
   edit now offers one, and `undoable` retires the previous offer by replacing
   it: there is one toast box and `actionToast` empties it before appending.
   So `retireUndo` had no caller left and came out with the last one. */
let undoable = (msg, mutate, refresh) => { mutate(); (refresh || render)(); };
let flash = () => {};

/* Called once at startup from app.js's wiring block. */
export function initGameMode(renderFn, onCloseFn, toastFns) {
  render = renderFn;
  if (onCloseFn) onClose = onCloseFn;
  if (toastFns?.undoable) undoable = toastFns.undoable;
  if (toastFns?.flash) flash = toastFns.flash;
  $('.gm-body')?.addEventListener('pointerdown', gmSwipeDown);
  on('#gmClose', 'onclick', closeGameMode);
  on('#gmDone', 'onclick', closeGameMode);   // phone-height twin of the top-left X
  on('#gmPrev', 'onclick', () => gmStep(-1));
  on('#gmNext2', 'onclick', () => gmStep(1));
}

let gmPick = null;      // player selected for a swap
let gmScope = 'stint';  // 'stint' | 'rest'

const liveOf = g => (g.live ||= { at: 0, overrides: {} });
const effLineup = (p, g, i) => effectiveLineup(g, p, i);

/* upTo === null totals the whole game; a number totals the stints completed
   before it. On the bench the live question is "how much has this kid actually
   played", not what they will finish on. */
function liveMinutes(p, g, upTo = null) {
  const m = {};
  for (const id of availIds(g)) m[id] = 0;
  p.stints.forEach((s2, i) => {
    if (upTo != null && i >= upTo) return;
    for (const id of effLineup(p, g, i)) m[id] = (m[id] || 0) + s2.minutes;
  });
  return m;
}

export function openGameMode() {
  track('game_mode_opened');
  const p = plans[state.activeGame];
  if (!p || !p.ok) return;
  // grabbed before the action bar hides itself below -- hiding the focused
  // button blurs it, and by then there is nothing left to hand focus back to
  const trigger = document.activeElement;
  const g = game();
  const live = liveOf(g);
  /* A finished game starts over; an unfinished one picks up where it was.
   *
   * Holding the position is the point during a game -- close it to check
   * something at Q3 4:00 and you must not come back at Q1. But reopening on
   * the last stint of a game you already coached reads as stuck rather than
   * resumed, which is exactly how it was reported. So the one case that is
   * unambiguously over is the one case that resets. */
  if (live.at >= p.stints.length - 1) live.at = 0;
  // the clamp writes to persisted state too (a shorter plan can leave `at`
  // past the end), so it saves rather than waiting for closeGameMode
  live.at = Math.min(live.at, p.stints.length - 1);
  save();
  gmPick = null;
  const gm = $('#gamemode');
  gm.hidden = false;
  const ab0 = $('#actionbar'); if (ab0) ab0.hidden = true;
  document.body.style.overflow = 'hidden';
  renderGameMode();
  enterGameMode(gm);
  openTrap(gm, closeGameMode, trigger);
}

/* Everything the coach is stepping away from. Deliberately not `.app`: game
   mode, the toasts and the confirm dialog all live inside it, so transforming
   it would take the overlay along and would also make every `position: fixed`
   child position against it instead of the viewport. */
function pageBehind() {
  return ['.bar', '#view-games', '#view-team', '.foot']
    .map(sel => document.querySelector(sel))
    .filter(n => n && !n.hidden && getComputedStyle(n).display !== 'none');
}

/* Belt and braces for the interrupted case. The recede reverts on its own when
   it ends -- it runs exactly as long as the rise, under an opaque panel by then
   -- but a coach who closes mid-animation would otherwise be handed a page
   still scaled to 93%, and a stray transform on `.bar` also breaks its
   stickiness. Cancelling is what undoes a WAAPI animation; clearing inline
   styles would not, because Motion never set any. */
function restorePage() {
  for (const n of pageBehind()) {
    for (const a of n.getAnimations()) a.cancel();
    n.style.transform = '';
    n.style.opacity = '';
  }
}

/* Every node the entry or an interrupted render may leave parked at opacity 0
   -- `:scope > *` plus the sections inside `.gm-body`. The sheet itself parks
   nothing, but `swapIn` and a half-finished close both can, and an invisible
   panel on the next open is the failure this sweeps up on the way out. */
const ENTRY_PARTS = ':scope > *, .gm-sec, #gmNext, #gmFloor .gm-p';

/* The entry transition: the sheet, and only the sheet.
 *
 * The whole view is driven up from the bottom edge while the page behind it
 * steps back -- the native modal idiom a coach already has muscle memory for,
 * and the one picked over a hard cut and a staged reveal after
 * running all three back to back on a phone.
 *
 * It measures nothing, which is the other half of why it won. The
 * shared-element grow it replaces asked the page where to start from and got
 * the wrong answer twice in production -- 0x0 against a folded card preview,
 * and `top: 855` against an 844px viewport when the coach beat the action
 * bar's own slide-in -- each time degrading to a plain CSS fade that is
 * indistinguishable from the animation not running at all. There is no origin
 * rect here to be wrong.
 *
 * The CSS `gmIn` keyframe is the fallback: it is what plays when `sheetUp`
 * declines under reduced motion, where the global reduced-motion rule
 * collapses it to an instant state change rather than a fast animation. It is
 * suppressed for the frames the JS owns, or the two fight over `transform`
 * and the overlay lands crooked. */
function enterGameMode(gm) {
  gm.style.animation = 'none';
  const ok = sheetUp(gm, { recede: pageBehind() });
  /* Armed even when the sheet declined and the CSS keyframe is playing --
     that fade is 260ms of unreadable panel and a tap should end it too. Under
     reduced motion there is nothing to finish and the sweep is a no-op. */
  if (!ok) gm.style.animation = '';
  armInterrupt(gm);
}

/* A tap during the entry ends it on the spot.
 *
 * The rule is that nothing may stand between the coach and the first
 * substitution, and the honest way to keep it is to let the animation be
 * dismissed rather than to keep shortening it. Finishing is not the same as
 * cancelling: none of these fill, so a finished animation lands on exactly
 * the state the page would have had a moment later -- including the receding
 * page reverting -- which means the interrupt has no separate end state to
 * get wrong. Capture, so it fires before the button under the thumb. */
function armInterrupt(gm) {
  const finish = e => {
    off();
    /* A sheet on its way up has not covered the top of the screen yet, so a
       tap that lands there is on the page the coach is leaving -- and acting
       on whatever happened to be under it is never what they meant. Swallow
       it, and the click that would follow, rather than letting the receding
       page take it. A tap inside the panel goes through untouched: that is
       the coach reaching the first substitution, which is the whole point. */
    if (e && !gm.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      const kill = ev => { ev.preventDefault(); ev.stopPropagation(); };
      addEventListener('click', kill, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', kill, true), 0);
    }
    /* Swept over three frames, not once. Motion creates its WAAPI animations
       on the frame *after* the call, so a tap fast enough to beat that -- and
       the first tap after a press is exactly that fast -- would find nothing
       to finish and then watch the transition start anyway. */
    sweep();
    requestAnimationFrame(() => { sweep(); requestAnimationFrame(sweep); });
  };
  const sweep = () => {
    const anims = [...gm.getAnimations({ subtree: true })];
    for (const n of pageBehind()) anims.push(...n.getAnimations());
    for (const a of anims) { try { a.finish(); } catch { a.cancel(); } }
  };
  const off = () => {
    document.removeEventListener('pointerdown', finish, true);
    clearTimeout(timer);
  };
  const timer = setTimeout(off, 900);
  document.addEventListener('pointerdown', finish, true);
}
function closeGameMode() {
  /* Measured before anything is torn down. "Reached the end" means the coach
     was sitting on the last stint when they closed -- they coached the game
     out on the phone, rather than opening this and backing straight out. */
  const p = plans[state.activeGame];
  const live = game()?.live;
  const reachedEnd = !!(p && p.ok && live && live.at >= p.stints.length - 1);
  const gmEl = $('#gamemode');
  /* The open transition parks the sections at opacity 0 and clears it when the
     animation finishes. Close before it finishes -- which is one impatient tap
     -- and that promise never resolves, so the inline zero survives and the
     next open is an empty panel. Clear it unconditionally on the way out. */
  for (const a of gmEl.getAnimations()) a.cancel();
  gmEl.style.transform = '';
  gmEl.style.opacity = '';
  for (const n of gmEl.querySelectorAll(ENTRY_PARTS)) {
    for (const a of n.getAnimations()) a.cancel();
    n.style.opacity = '';
    n.style.transform = '';
  }
  gmEl.hidden = true;
  restorePage();
  const ab1 = $('#actionbar');
  if (ab1) ab1.hidden = state.view !== 'games' || !state.onboarded;
  document.body.style.overflow = '';
  gmPick = null;
  save();
  render('cards', 'timeline', 'stats');
  closeTrap($('#gamemode'));
  onClose(reachedEnd);
}

/* The next-sub block is the line the coach actually shouts, so it says real
   names -- the card's five-letter short names are a pocket-card constraint,
   not a screen one, and decoding "PRIY" mid-horn is work nobody needs. Three
   names in ~250px usually fit; when they do not, a wrapped call line is worse
   than a code, so the whole block drops back to the short names together
   rather than mixing the two. Measured on the shared canvas, like the pills
   and the card header. */
function fitCallRows(rows) {
  if (!rows.length || !rows[0][0].isConnected) return;
  const cs = getComputedStyle(rows[0][0]);
  ctx2d.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const ls = parseFloat(cs.letterSpacing) || 0;
  const w = t => ctx2d.measureText(t).width + t.length * ls + 1;
  let fits = true;
  for (const [ns, call] of rows) {
    // last flex item on the row, so its left edge does not move with content
    const avail = ns.parentElement.getBoundingClientRect().right - ns.getBoundingClientRect().left;
    if (!(avail > 0)) return;                // not laid out yet: leave it alone
    if (w(call) > avail) fits = false;
  }
  for (const [ns, call, short] of rows) ns.textContent = fits ? call : short;
  // A first paint before Inter arrives measures the fallback face; redo it once.
  if (document.fonts?.status !== 'loaded') {
    document.fonts?.ready.then(() => { if (rows[0][0].isConnected) fitCallRows(rows); });
  }
}

/* `keepFloor` is set by one caller: tapping a name on the floor to pick who
   comes off. That changes a SELECTION and nothing else -- the same five are
   out there before and after, with the same minutes beside them -- but the
   floor was rebuilt from scratch anyway, which replayed `swapIn`'s staggered
   slide across all five rows. Reported from a phone as the screen refreshing
   on every tap. So that one path toggles the classes on the rows already
   there and leaves the nodes alone. Everything else on the screen still
   repaints; none of it animates, so none of it shows. */
export function renderGameMode({ keepFloor = false } = {}) {
  const p = plans[state.activeGame];
  const g = game();
  if (!p || !p.ok) { closeGameMode(); return; }
  const live = liveOf(g);
  const i = Math.max(0, Math.min(live.at, p.stints.length - 1));
  const row = p.stints[i];
  const floor = effLineup(p, g, i);
  const played = liveMinutes(p, g, i);     // stints already completed
  const projected = liveMinutes(p, g);     // where they finish if the plan holds
  const shorts = p.shortNames;
  const calls = callNames(availIds(g).map(byId).filter(Boolean));
  const mtag = id => {
    const d = el('span', 'mn');
    d.append(el('b', null, fmtMinutes(played[id] || 0)));
    d.append(el('span', 'proj', ` / ${fmtMinutes(projected[id] || 0)}`));
    return d;
  };

  set('#gmGame', 'textContent', (g.label ? 'vs ' + g.label : gameLabel(g, state.activeGame)) + ` · stint ${i + 1} of ${p.stints.length}`);
  set('#gmMinsKey', 'textContent', 'played / projected');
  set('#gmClock', 'textContent', `${row.periodName || 'Q' + row.period}  ${row.clock}`);
  set('#gmReset', 'hidden', !Object.keys(live.overrides).length);
  /* Counted against the plan, not off the key list: an override can be written
     with the same five the card already had (a re-solve often leaves a stint
     alone), and "1 stint no longer matches" would then be a lie. `#gmReset`
     stays on the key list on purpose -- it is the escape hatch, and offering it
     for a no-op edit costs nothing. */
  const moved = Object.entries(live.overrides).filter(([k, five]) => {
    const s = p.stints[k];
    return s && [...five].sort().join() !== [...s.onFloor].sort().join();
  }).length;
  set('#gmMoved', 'hidden', !moved);
  set('#gmMoved', 'textContent', !moved ? ''
    : moved === 1 ? '1 stint no longer matches your printed card.'
      : `${moved} stints no longer match your printed card.`);

  // lightest first: the bench order answers "who should go in next"
  const bench = availIds(g).filter(id => !floor.includes(id))
    .sort((a, b) => (played[a] || 0) - (played[b] || 0) || (shorts[a] < shorts[b] ? -1 : 1));
  // With a five-player roster everyone available is already on the floor, so
  // there is no swap to make. Picking would open "Swap in for Ivy" over an
  // empty list -- a dead end. Same reason the bench is inert before a pick.
  const canSwap = bench.length > 0;
  if (!canSwap) gmPick = null;
  $('#gamemode').classList.toggle('swapping', !!gmPick);

  // on the floor
  const fl = $('#gmFloor');
  const prevFloor = i > 0 ? effLineup(p, g, i - 1) : null;
  /* A pick cannot change who is on the floor or what element each row is
     (`canSwap` follows the bench, which a pick does not touch), so the rows
     are still the right rows and only `.picked` moves. */
  if (keepFloor) {
    for (const b of fl.children) b.classList.toggle('picked', b.dataset.pid === gmPick);
  } else {
    fl.textContent = '';
    for (const id of floor) {
      const pl = byId(id) || { name: shorts[id] };
      const b = el(canSwap ? 'button' : 'div', 'gm-p' + (canSwap ? ' press' : '') +
        (gmPick === id ? ' picked' : '') +
        (prevFloor && !prevFloor.includes(id) ? ' fresh' : ''));
      b.style.setProperty('--c', colorOf(id));
      b.dataset.pid = id;      // how the `keepFloor` path finds this row again
      const nameWrap = el('span', 'nm');
      nameWrap.append(document.createTextNode(pl.name || shorts[id]));
      if (prevFloor && !prevFloor.includes(id)) nameWrap.append(el('span', 'tag in', 'just on'));
      b.append(el('span', 'av', initials(pl)), nameWrap, mtag(id));
      if (canSwap) {
        b.type = 'button';
        b.onclick = () => {
          gmPick = gmPick === id ? null : id;
          renderGameMode({ keepFloor: true });
        };
      }
      fl.append(b);
    }
    swapIn(fl.querySelectorAll('.gm-p'));
  }

  // bench
  const lab = $('#gmBenchLab');
  lab.textContent = '';
  lab.className = 'gm-lab rowed';
  lab.append(document.createTextNode(gmPick ? `Swap in for ${calls[gmPick] || shorts[gmPick]}` : 'Bench'));
  // Nothing picked yet means nothing on the bench is tappable. Say so here
  // rather than leaving the coach to tap a dead row and learn it the hard way.
  if (!gmPick && bench.length) lab.append(el('span', 'gm-hint', ' tap who comes off first'));
  if (gmPick) {
    const sc = el('div', 'gm-scope');
    for (const [k, t] of [['stint', 'This stint'], ['rest', 'Rest of game']]) {
      const b = el('button', 'press' + (gmScope === k ? ' on' : ''), t);
      b.type = 'button';
      b.onclick = () => { gmScope = k; renderGameMode(); };
      sc.append(b);
    }
    /* The third scope, and the only one that is an ACTION rather than a mode:
       the other two ask "how long does this swap last" and then wait for a
       name off the bench. This one answers the name itself, so there is
       nothing left to wait for and it fires on the tap. Styled as a button,
       not a segment, so it does not pretend to be a third toggle. */
    const rb = el('button', 'press act', 'Sit, rebalance');
    rb.type = 'button';
    rb.onclick = () => sitRest(p, g, i, gmPick, calls[gmPick] || shorts[gmPick]);
    sc.append(rb);
    lab.append(sc);
  }

  const bx = $('#gmBench'); bx.textContent = '';
  /* No bench: hide the section outright rather than heading an empty list, and
     let the line under the floor carry it. `canSwap` is already false here, so
     nothing in the section is reachable anyway. */
  set('#gmBenchSec', 'hidden', !bench.length);
  set('#gmAllOn', 'hidden', bench.length > 0);
  for (const id of bench) {
    const pl = byId(id) || { name: shorts[id] };
    // Before a pick these are not buttons at all: a disabled button that looks
    // like the live one is a trap -- it swallows the tap and says nothing. So
    // render a plain list until swapping in is actually possible.
    const b = el(gmPick ? 'button' : 'div', 'gm-b' + (gmPick ? ' press' : ' inert'));
    b.style.setProperty('--c', colorOf(id));
    b.append(el('span', 'av', initials(pl)), el('span', 'nm', pl.name || shorts[id]), mtag(id));
    if (gmPick) {
      b.type = 'button';
      b.onclick = () => { applySwap(p, g, i, gmPick, id,
        calls[gmPick] || shorts[gmPick], calls[id] || shorts[id]); };
    }
    bx.append(b);
  }

  // What changes, and exactly when. "Coming off / Going in" with no time on it
  // reads as ambiguous -- the next break is often mid-period, not the period
  // boundary the coach assumes.
  const nx = $('#gmNext'); nx.textContent = '';
  if (i + 1 < p.stints.length) {
    const nrow = p.stints[i + 1];
    const at = `${nrow.periodName || 'Q' + nrow.period} ${fmtClock(nrow.startSec)}`;
    const next = effLineup(p, g, i + 1);
    const going = floor.filter(x => !next.includes(x));
    const coming = next.filter(x => !floor.includes(x));

    nx.append(el('div', 'gm-next-hd', going.length || coming.length ? `Next sub · ${at}` : `Next break · ${at}`));
    if (!going.length && !coming.length) {
      nx.append(el('div', 'gm-next-none', 'Same five stay on.'));
    } else {
      const rows = [];
      const line = (cls, mark, label2, list) => {
        if (!list.length) return;
        const r = el('div', 'gm-next-row ' + cls);
        const m2 = el('span', 'mk');
        m2.append(icon(mark, { size: '.95em', stroke: 2.6 }));
        const ns = el('span', 'ns');
        r.append(m2, el('span', 'lb', label2), ns);
        nx.append(r);
        rows.push([ns, list.map(x => calls[x] || shorts[x]).join('  '),
                       list.map(x => shorts[x]).join('  ')]);
      };
      line('out', 'arrow-down', 'Off', going);
      line('in', 'arrow-up', 'On', coming);
      fitCallRows(rows);
    }
  } else {
    nx.append(el('div', 'gm-next-hd', 'Last stint'));
    nx.append(el('div', 'gm-next-none', 'Game ends at 0:00.'));
  }

  // progress
  //
  // The strip is ~142px wide on a 390px phone and a dot cannot usefully go
  // below 12px, so it holds about 12 of them. An 8x20 game has 40 stints: drawn
  // one-per-stint they overflow both sides of a centred, overflow-hidden strip
  // and everything past ~stint 11 is clipped -- including the `.now` dot, which
  // is the one thing a coach is looking for down there. Past DOT_WINDOW stints
  // the strip windows around the current stint instead. The exact position is
  // never lost: the top bar already says "stint N of M", and the dots at a
  // truncated edge are dimmed so the window reads as a window.
  //
  // The dots are a PICTURE of where the game is, not a control. They were
  // buttons that jumped to a stint, and a dot is not a place a thumb can go:
  // measured in game mode on a 390px phone they are 17.8px wide with eight
  // stints and 11.9px with twelve, against the app's own 44px rule, and the
  // strip is `flex: 1; min-width: 0` between two controls that are not -- so
  // at 150% text a dot is 2.4px and at 200% it is 4.7px. Twelve of them are
  // also twelve tab stops, each announcing "Stint 4 of 12" on the way past,
  // between Previous and Next -- which is the same journey in two presses.
  // Nothing is lost with the click: prev/next, the swipe and the keyboard all
  // still move the stint, `#gmGame` says "stint N of M" in words above, and
  // the strip is `aria-hidden` in index.html because that sentence is the
  // accessible version of this picture.
  const DOT_WINDOW = 12;
  const dots = $('#gmDots'); dots.textContent = '';
  const nStints = p.stints.length;
  const from = nStints <= DOT_WINDOW
    ? 0
    : Math.min(Math.max(i - (DOT_WINDOW >> 1), 0), nStints - DOT_WINDOW);
  const to = Math.min(from + DOT_WINDOW, nStints);
  for (let k = from; k < to; k++) {
    const edge = (k === from && from > 0) || (k === to - 1 && to < nStints);
    dots.append(el('div', 'gm-dot' + (k < i ? ' done' : k === i ? ' now' : '') + (edge ? ' edge' : '')));
  }
  set('#gmPrev', 'disabled', i === 0);
  set('#gmNext2', 'disabled', i >= p.stints.length - 1);
}

/* ---- swipe between stints -----------------------------------------------
 * `.gm-body` is `touch-action: pan-y`, so the browser keeps owning the
 * vertical scroll and every horizontal move lands here instead. Past 60px the
 * stint changes; at either end the drag rubber-bands, so the end of the game
 * is felt rather than guessed at. The prev/next buttons stay the primary
 * control -- the swipe drives them, so there is one code path for the move --
 * and a swipe that started on a player swallows the click it would fire. */
let swipe = null;

function gmSwipeDown(e) {
  if (e.button > 0 || swipe || $('#gamemode').hidden) return;
  swipe = { x0: e.clientX, y0: e.clientY, dx: 0, live: false, el: $('.gm-body') };
  addEventListener('pointermove', gmSwipeMove);
  addEventListener('pointerup', gmSwipeUp);
  addEventListener('pointercancel', gmSwipeUp);
}

function gmSwipeMove(e) {
  if (!swipe) return;
  const dx = e.clientX - swipe.x0, dy = e.clientY - swipe.y0;
  if (!swipe.live) {
    // axis lock: a mostly-vertical move is a scroll, and we get out of its way
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { gmSwipeOff(); return; }
    if (Math.abs(dx) < 10) return;
    swipe.live = true;
    swipe.el.style.transition = 'none';
    document.body.classList.add('gm-swiping');
  }
  const edge = (dx > 0 && $('#gmPrev').disabled) || (dx < 0 && $('#gmNext2').disabled);
  swipe.dx = edge ? dx * 0.28 : dx;
  swipe.el.style.transform = `translateX(${swipe.dx}px)`;
}

function gmSwipeUp() {
  const s = swipe;
  gmSwipeOff();
  if (!s || !s.live) return;
  const kill = ev => { ev.preventDefault(); ev.stopPropagation(); };
  addEventListener('click', kill, { capture: true, once: true });
  setTimeout(() => removeEventListener('click', kill, true), 0);

  const btn = s.dx > 0 ? $('#gmPrev') : $('#gmNext2');
  if (Math.abs(s.dx) > 60 && btn && !btn.disabled) gmSlide(s.el, s.dx > 0 ? 1 : -1, btn);
  else gmSnapBack(s.el);
}

function gmSwipeOff() {
  removeEventListener('pointermove', gmSwipeMove);
  removeEventListener('pointerup', gmSwipeUp);
  removeEventListener('pointercancel', gmSwipeUp);
  document.body.classList.remove('gm-swiping');
  swipe = null;
}

function gmSnapBack(el) {
  el.style.transition = 'transform var(--t-fast) var(--ease)';
  el.style.transform = '';
  setTimeout(() => { el.style.transition = ''; }, 240);
}

/* Out the way it was pushed, then in from the other side. */
function gmSlide(el, dir, btn) {
  const done = () => { el.style.transition = ''; el.style.transform = ''; el.style.opacity = ''; el.scrollTop = 0; };
  if (!fxOn) { btn.click(); done(); return; }
  const d = Math.round(el.clientWidth * 0.3);
  el.style.transition = 'transform 120ms ease-out, opacity 120ms ease-out';
  el.style.transform = `translateX(${dir * d}px)`;
  el.style.opacity = '0';
  setTimeout(() => {
    btn.click();                                  // re-renders at the new stint
    el.scrollTop = 0;
    el.style.transition = 'none';
    el.style.transform = `translateX(${-dir * d}px)`;
    void el.offsetWidth;                          // flush before reversing
    el.style.transition = 'transform var(--t) var(--ease), opacity var(--t) var(--ease)';
    el.style.transform = '';
    el.style.opacity = '';
    setTimeout(() => { el.style.transition = ''; }, 300);
  }, 125);
}

/* A swap is the mis-tap a gym actually produces -- the bench is a list of
   names a thumb wide, and the tap that lands is next to the one that was
   meant. It was the only mid-game edit with no way back: the fallback was
   `#gmReset` in the top-right corner, the worst one-handed reach on the
   screen, and it discards EVERY override rather than the one just made.

   Undo, not confirm, for the reason toast.js gives: a confirm asks before the
   coach can see the result, and here the result is the floor.

   The pending offer this used to `retireUndo()` -- "Back to the printed plan"
   is the one most likely to still be up -- is now retired by `undoable`
   itself. `showUndo` goes through `actionToast`, which empties the single
   toast box before appending, so installing this offer destroys the older one
   in the same synchronous turn; and the snapshot below is cloned BEFORE the
   swap and therefore AFTER whatever that offer did, so it takes back this
   swap and nothing else. That is the same invariant `retireUndo` protected,
   satisfied directly rather than by clearing the field first.

   Undo stays one level deep, as everywhere else in the app. */
function applySwap(p, g, i, outId, inId, outName, inName) {
  const last = gmScope === 'rest' ? p.stints.length - 1 : i;
  tick();
  undoable(
    `${inName} on for ${outName} ${gmScope === 'rest' ? 'for the rest of the game' : 'this stint'}.`,
    () => {
      const live = liveOf(g);
      for (let k = i; k <= last; k++) {
        const cur = effLineup(p, g, k);
        if (!cur.includes(outId) || cur.includes(inId)) continue;
        live.overrides[k] = cur.map(x => (x === outId ? inId : x));
      }
      gmPick = null;
    },
    () => { save(); renderGameMode(); });
}

/* The rule a failed re-solve broke, in the coach's words rather than the
   solver's. The engine's own `message` is not reused here even though it is
   already user-facing copy: every one of those sentences is written about a
   WHOLE game ("the game is only 12 minutes long"), and inside a suffix solve
   its numbers are the remainder's, so pasting it into a mid-game toast would
   say something false with a true number. The clause below names the rule
   using the label its chip carries in `rules.js` KINDS, and the toast supplies
   the "for the rest" framing once.

   Codes with no clause fall back to the generic sentence, which is what
   shipped in slice 1 -- `test/sit-rules.test.js` reads every `err(` code out
   of `engine.js` and fails a new one that is neither mapped nor listed there
   as deliberately unmapped. */
const SIT_RULES = {
  MIN_EXCEEDS_GAME: 'a Minutes limit floor no longer fits in what is left',
  MIN_ABOVE_CAP: 'a Minutes limit has a floor above its own cap',
  MINS_UNSATISFIABLE: 'the Minutes limit floors add up to more than the rest of the game',
  CAPS_UNSATISFIABLE: 'the Minutes limit caps do not cover the rest of the game',
  FORCED_OVER_CAP: 'a Minutes limit cap will not cover a Last period stint',
  PAIR_AVOID_CONFLICT: 'a pair is set to Play together and Keep apart at once',
  AVOID_IMPOSSIBLE: 'the Keep apart rules cannot all be met with who is left',
  CLOSERS_AVOID: 'two players set to close are also set to Keep apart',
  FORCED_GROUP_AVOID: 'two players pinned to the same stint are set to Keep apart',
  KEEPON_UNSATISFIABLE: 'an Always one on pair cannot be covered without them',
  FORCED_GROUP_KEEPON: 'a pinned stint leaves an Always one on pair uncovered',
  CLOSERS_TOO_MANY: 'more players are set to close than fit on the floor',
  FORCED_GROUP_TOO_BIG: 'more players are pinned to one stint than fit on the floor',
  NOT_ENOUGH_PLAYERS: 'fewer than five players would be left available',
};

/* Sit this player for the rest of the game and let the solver decide who
   covers, honouring what everyone has already played.

   `Rest of game` beside it is DELIBERATELY LEFT ALONE and still hands every
   remaining stint to one named kid: there, the coach named them. That is an
   instruction, not an unfairness the app imposed, and it is the only way to
   say "Jordan takes Aiden's minutes". This button is the answer when the
   coach has no opinion about who -- which is the case the feature exists for.

   Undo, not confirm. `confirmAction` has exactly one caller in this app
   (removing a team) and toast.js says why: "A confirm asks at the wrong
   moment -- before you can see the result." A coach cannot tell whether
   sitting Aiden was right until the rest of the game has rebalanced.

   The write is `live.overrides[k..n-1]` and nothing else, so stints already
   played are untouched, `effectiveMinutes` cannot fork, and the rotation
   stamp drops the whole thing if the plan moves underneath it -- the same
   contract every hand swap already has. */
function sitRest(p, g, i, outId, name) {
  const r = resolveRest(g, p, i, [outId]);
  if (!r.ok) {
    gmPick = null;
    renderGameMode();
    const rule = SIT_RULES[(r.issues || []).find(x => x.severity === 'error')?.code];
    flash({
      strategy: 'Rebalancing does not apply to this strategy. Its minutes are set by hand.',
      nobody: 'Not enough players left to cover the rest of the game.',
      nothing: 'Nothing left to rebalance. This is the last stint.',
    }[r.reason] || (rule
      ? `Sitting ${name} leaves no plan for the rest: ${rule}.`
      : `Sitting ${name} for the rest would break one of your rules.`));
    return;
  }
  tick();
  undoable(`${name} is out for the rest. The rest of the game rebalanced.`, () => {
    const live = liveOf(g);
    for (const [k, five] of Object.entries(r.overrides)) live.overrides[k] = five;
    gmPick = null;
  }, () => { save(); renderGameMode(); });
}

/* The stint nav, shared by the prev/next buttons, the swipe and the keyboard.
   `live.at` is persisted, so every move through the game saves. */
function gmStep(d) {
  const p = plans[state.activeGame];
  if (!p) return;
  const l = liveOf(game());
  const was = l.at;
  l.at = Math.max(0, Math.min(p.stints.length - 1, l.at + d));
  // only when the stint actually moved -- a tick at the last stint would say
  // "done" when nothing happened
  if (l.at !== was) tick();
  gmPick = null;
  save();
  renderGameMode();
}

/* Back to the printed plan. The caller wraps this in `undoable`, so it only
   mutates -- the repaint is the caller's second argument. */
export function clearOverrides() {
  liveOf(game()).overrides = {};
  gmPick = null;
}

/* An undo can restore a state whose plan no longer has the picked player on
   the floor, so the toast drops the pick rather than leaving a stale one. */
export function clearPick() {
  gmPick = null;
}
