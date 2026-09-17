/* The rotation timeline.

   Players down the side, the game clock across. Blocks are positioned by
   elapsed minutes rather than stint index, so unequal stint lengths land in
   the right place. This is the view a coach actually thinks in -- fairness,
   back-to-back sits and the closing group are all visible at a glance in a
   way a table of rows never makes them.

   Split out of app.js as its own seam. It owns `tlPinned` (the player whose
   breakdown is open), the FLIP that moves the blocks, the two dead-end empty
   states and the detail panel. Everything it reads comes from `state.js`, so
   the graph stays acyclic — the one thing it cannot own is `setView`, which
   the "no players yet" call to action uses to cross into the roster view, so
   app.js hands that in through `initTimeline` for the same reason
   `initGameMode` takes `render`. */
import { fmtClock, fmtMinutes } from './engine.js';
import { riseIn, popIn, countTo, enabled as fxOn } from './fx.js';
import { icon } from './icons.js';
import { $, el } from './dom.js';
import { state, plans, colorOf, game, byId, noRoster, effectiveStints, effectiveMinutes, blockedFix } from './state.js';
import { resumeAt, fitPreview } from './card.js';
import { openPlanSheet, openWhoSheet } from './game-setup.js';

/* Set by initTimeline; see the note above on why this is injected. */
let setView = () => {};

/* Called once at startup from app.js's wiring block. */
export function initTimeline(setViewFn) {
  setView = setViewFn;
}

/* #29 decisions 5 and 7: which of `#timeline` / `#sheet` shows.
 *
 * `state.ui.gameView` is the coach's own choice, but a blocked plan overrides
 * it rather than asking the Card view to explain a card that does not exist:
 * `timelineEmpty` (above) already carries the one blocked panel, so blocked
 * always shows `#timeline`, in either view, and leaves `gameView` itself
 * untouched -- unblocking resumes whichever view was chosen. `#viewSeg`'s
 * `.on`/`aria-pressed` sync is the same delegated-click shape `applyTheme`
 * (render.js) already keeps `#themeSeg` in. */
export function applyGameView() {
  const p = plans[state.activeGame];
  const blocked = !p || !p.ok;
  const onCard = !blocked && state.ui.gameView === 'card';
  const tl = $('#timeline'), sheet = $('#sheet');
  if (tl) tl.hidden = onCard;
  if (sheet) sheet.hidden = !onCard;
  const seg = $('#viewSeg');
  if (seg) {
    for (const b of seg.querySelectorAll('button[data-view]')) {
      const on = b.dataset.view === state.ui.gameView;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  if (onCard) fitPreview();
}

let tlPinned = null;   // player whose breakdown is showing

/* The timeline reconciles rather than rebuilds. Blocks are the same DOM nodes
   between renders, so the FLIP below has a previous geometry to move from and
   the rotation visibly redistributes when you move a slider. Rebuilding would
   throw that away and every change would read as a pop, not a move. */
function runsFor(stints, id, starts) {
  const runs = [];
  let open = null;
  stints.forEach((s2, i) => {
    if (s2.onFloor.includes(id)) {
      if (open == null) open = starts[i];
      runs.push({ start: open, end: starts[i] + s2.minutes, merge: true });
    } else open = null;
  });
  // collapse consecutive stints into one block so a long run reads as a run
  const out = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.end - r.start) < 1e-9 && last.start === r.start) { last.end = r.end; continue; }
    if (last && last.start === r.start) { last.end = Math.max(last.end, r.end); continue; }
    out.push({ start: r.start, end: r.end });
  }
  return out;
}

/* Timeline blocks move by transform, never by `left`/`width`.
 *
 * The geometry is still expressed as percentages of the track — that is what
 * keeps a block pinned to its stint boundaries at any width — but the *change*
 * is played as a FLIP: the new left/width is applied at once, then the block is
 * animated from an inverse transform back to identity. Nothing lays out during
 * those 420ms, and the block rests with an untransformed border radius.
 *
 * translateX is a percentage of the block's own (new) width, so the inverse
 * needs no pixel measurement and no forced reflow. */
const BLK_MS = 420, BLK_EASE = 'cubic-bezier(.22,.61,.36,1)';

function flipFrom(l0, w0, l1, w1) {
  if (!fxOn || !Number.isFinite(l0) || !Number.isFinite(w0) || w0 <= 0 || w1 <= 0) return null;
  if (Math.abs(l0 - l1) < 1e-6 && Math.abs(w0 - w1) < 1e-6) return null;
  return `translateX(${((l0 - l1) / w1) * 100}%) scaleX(${w0 / w1})`;
}

function blockMove(b, from) {
  b.getAnimations().forEach(a => a.cancel());
  b.animate([{ transform: from }, { transform: 'none' }], { duration: BLK_MS, easing: BLK_EASE });
}

function blockIn(b) {
  if (!fxOn) return;
  const a = b.animate([{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'none', opacity: 0.92 }],
    { duration: BLK_MS, easing: BLK_EASE, fill: 'forwards' });
  a.finished.then(() => { b.style.transform = ''; b.style.opacity = ''; a.cancel(); }, () => {});
}

function blockOut(b) {
  if (!fxOn) { b.remove(); return; }
  // a dying block must not be handed back out as a reusable one on the next
  // render — it is still in the DOM, and its removal timer is already armed
  b.classList.add('gone');
  b.getAnimations().forEach(a => a.cancel());
  const a = b.animate([{ transform: 'none', opacity: 0.92 }, { transform: 'scaleX(0)', opacity: 0 }],
    { duration: BLK_MS, easing: BLK_EASE, fill: 'forwards' });
  a.finished.then(() => b.remove(), () => {});
  setTimeout(() => b.remove(), BLK_MS + 200);
}

function rosterCta() {
  const e = el('div', 'roster-empty');
  e.append(el('div', 'se-ico', '🏀'));
  e.append(el('div', 'se-t', 'No players yet'));
  e.append(el('div', 'se-s', 'Add them one at a time, or paste your whole roster at once.'));
  const acts = el('div', 're-acts');
  // Cross the view boundary and press the roster's own button, so there is one
  // implementation of "add a player" rather than a second one drifting apart.
  const jump = (label, cls, id) => {
    const b = el('button', 'btn press' + cls, label);
    b.type = 'button';
    b.onclick = () => { setView('team'); $(id)?.click(); };
    return b;
  };
  acts.append(jump('Add player', '', '#addplayer'), jump('Paste a list', ' ghost', '#bulktoggle'));
  e.append(acts);
  return e;
}

/* #29 decision 7: the non-roster branch (a roster exists but the plan is
   blocked) reads the engine's own first error through `blockedFix`
   (state.js) rather than re-deriving which sheet fixes what -- Platoon's
   missing unit and a rules conflict both come out of the same one mapping
   now, so there is exactly one place that can drift from the engine's codes.
   The no-roster case (`rosterCta`) is untouched. */
function timelineEmpty(g, p) {
  if (noRoster()) return rosterCta();
  const box = el('div', 'empty');
  box.append(el('div', 'se-t', "This plan can't be built"));
  const fix = blockedFix(p?.issues);
  box.append(el('div', 'se-s', fix ? fix.message : 'Set up the game to see the rotation.'));
  if (fix) {
    const b = el('button', 'btn sm press', fix.label);
    b.type = 'button';
    // 'who' opens Who's here the way `#phrasePlayers` does (game-setup.js's
    // own opener, reused rather than re-derived); 'strategy'/'rules' open the
    // Plan sheet's matching group through its one opener, `openPlanSheet`.
    b.onclick = () => fix.opener === 'who' ? openWhoSheet(b) : openPlanSheet(fix.opener, b);
    box.append(b);
  }
  return box;
}

/* The name on a timeline row. Full name first, short name only as a fallback
   for a player who somehow has none — the opposite of the card, and
   deliberately so. The four-character abbreviation is a *card* constraint:
   3.45 inches of paper with a column per stint. A timeline row puts the name
   above a full-width bar, so the room is there, and the abbreviation was the
   constraint leaking somewhere it does not apply. The rest of this module
   already agreed — the row's aria-label, the detail host label and the
   expanded row heading have always read `byId(id)?.name` first, so a screen
   reader announced "Austin Schumacher" where the eye read AUST. This is the
   two visible call sites joining them. `deriveShortNames` is untouched and the
   card and bench mode keep their abbreviations.
   A name too long for the column ellipsizes (`.tl-lab .nm`, app.css); a
   first-name / last-initial ladder is the eventual shape there and is
   deliberately not built yet. */
function tlName(p, id) {
  return byId(id)?.name || p.shortNames[id] || id;
}

export function renderTimeline() {
  const box = $('#timeline');
  const p = plans[state.activeGame];
  const g = game();

  // whatever happens below, the pre-paint skeleton's turn is over
  box.removeAttribute('aria-busy');

  if (!p || !p.ok) {
    box.textContent = ''; box.dataset.sig = '';
    box.append(timelineEmpty(g, p));
    return;
  }

  /* Every number and block below is read off the *effective* rotation, not
     `p.stints`. A five the coach swapped by hand in bench mode is the rotation
     now, and the card two inches under this view has printed it that way since
     `effectiveStints` landed — the timeline quoting the pre-swap plan is how
     you got DEVO 12 up here and DEVO 4 on the card. Unswapped, these are the
     plan's own arrays by identity, so nothing costs anything. */
  const stints = effectiveStints(g, p);
  const mins = effectiveMinutes(g, p);

  const ids = state.players.filter(pl => !g.out.includes(pl.id)).map(pl => pl.id);
  const total = stints.reduce((a, s2) => a + s2.minutes, 0);
  const pct = m => (m / total) * 100;
  const starts = [];
  let acc = 0;
  for (const s2 of stints) { starts.push(acc); acc += s2.minutes; }

  // rebuild the frame only when the shape of the thing changes
  const sig = ids.join(',') + '|' + stints.map(x => x.minutes).join(',');
  if (box.dataset.sig !== sig) {
    box.textContent = '';
    box.dataset.sig = sig;

    const head = el('div', 'tl-head');
    head.append(el('div'));
    const per = el('div', 'tl-periods');
    const seen = new Set();
    stints.forEach((s2, i) => {
      if (seen.has(s2.period)) return;
      seen.add(s2.period);
      const lab = el('span', null, s2.periodName || 'Q' + s2.period);
      lab.style.left = pct(starts[i]) + '%';
      per.append(lab);
    });
    head.append(per, el('div'));
    box.append(head);

    const body = el('div', 'tl-body');
    for (const id of ids) {
      const row = el('div', 'tl-row');
      row.dataset.id = id;
      row.style.setProperty('--c', colorOf(id));
      const lab = el('div', 'tl-lab');
      const nameBtn = el('button', 'tl-name');
      nameBtn.type = 'button';
      nameBtn.append(el('span', 'dot'), el('span', 'nm', tlName(p, id)));
      nameBtn.onclick = () => { tlPinned = tlPinned === id ? null : id; renderTimeline(); };
      lab.append(nameBtn);
      const track = el('div', 'tl-track');
      stints.forEach((s2, i) => {
        if (i === 0 || s2.period === stints[i - 1].period) return;
        const line = el('i', 'tl-div');
        line.style.left = pct(starts[i]) + '%';
        line.dataset.at = starts[i];
        track.append(line);
      });
      row.append(lab, track, el('div', 'tl-tot'));
      body.append(row);
    }
    box.append(body);
    riseIn(body.querySelectorAll('.tl-row'), { delay: 0.02, from: 7 });
  } else {
    // names can change without the shape changing
    for (const id of ids) {
      const nm = box.querySelector(`.tl-row[data-id="${CSS.escape(id)}"] .nm`);
      if (nm) nm.textContent = tlName(p, id);
    }
  }

  /* "You are here." A reload shuts bench mode, and without this the plan page
     looks exactly like a game that has not started. One marker per track
     rather than one across the body: the track is a middle column on desktop
     and a full-width row on a phone, so a body-level overlay would have to
     know the breakpoint and this does not. */
  const resume = resumeAt(p, g);

  if (tlPinned && !ids.includes(tlPinned)) tlPinned = null;
  box.classList.toggle('pinned', !!tlPinned);

  const vals = Object.values(mins);
  const hi = Math.max(...vals), lo = Math.min(...vals);
  /* MOST and FEWEST mark the outliers, so an end only earns the word when it
     is actually a minority of the squad. With 15 players the split is ten at
     16 and five at 8: calling ten of them "the most" says nothing, and the
     row labels read "the most on the team" ten times running. A third of the
     squad is the cut — the story there is that five kids are short, not that
     ten lead. Both ends can be too big to name (a 6/6 split of twelve), in
     which case nobody is exceptional and the plan reads as even. */
  const cut = vals.length / 3;
  const count = v => vals.reduce((a, x) => a + (x === v ? 1 : 0), 0);
  const nameHi = hi !== lo && count(hi) <= cut;
  const nameLo = hi !== lo && count(lo) <= cut;
  // no word anywhere means the gutter that keeps the numbers aligned has
  // nothing to hold and would just push them off the edge
  box.classList.toggle('even', !nameHi && !nameLo);

  for (const id of ids) {
    const row = box.querySelector(`.tl-row[data-id="${CSS.escape(id)}"]`);
    if (!row) continue;
    const track = row.querySelector('.tl-track');
    const runs = runsFor(stints, id, starts);
    const blocks = [...track.querySelectorAll('.tl-blk:not(.gone)')];

    runs.forEach((r, i) => {
      const L = pct(r.start), W = pct(r.end - r.start);
      let b = blocks[i];
      if (!b) {
        b = el('div', 'tl-blk');
        b.style.left = L + '%';
        b.style.width = W + '%';
        // collapsed at its own left edge until the animation takes over, so it
        // never paints a frame at full size first
        if (fxOn) { b.style.transform = 'scaleX(0)'; b.style.opacity = '0'; }
        track.append(b);
        blockIn(b);
      } else {
        // FLIP: land the new geometry synchronously, then play the move on the
        // compositor. No layout runs while it animates — the old
        // `transition: left, width` relaid out every block on every frame.
        const from = flipFrom(+b.dataset.l, +b.dataset.w, L, W);
        b.style.left = L + '%';
        b.style.width = W + '%';
        if (from) blockMove(b, from);
      }
      b.dataset.l = L; b.dataset.w = W;
    });

    for (let i = runs.length; i < blocks.length; i++) blockOut(blocks[i]);

    let now = track.querySelector('.tl-now');
    if (resume) {
      if (!now) { now = el('i', 'tl-now'); now.setAttribute('aria-hidden', 'true'); track.append(now); }
      now.style.left = pct(starts[resume.at]) + '%';
    } else if (now) now.remove();

    /* Orange and blue used to be the only thing saying which end of the squad
       a number sat at, which is nothing at all to a color-blind coach or a
       screen reader. Say it: the word carries the meaning and the color is
       now decoration on top of it. */
    const m = mins[id] ?? 0;
    const extreme = nameHi && m === hi ? 'most' : nameLo && m === lo ? 'fewest' : '';
    const tot = row.querySelector('.tl-tot');
    /* Two spans, built once and then written into: the number counts to its
       new value (see countTo) and would have nothing to count from if the
       total were rebuilt every render. The word is always there, empty or
       not — it is a fixed-width gutter, so the column of numbers stays flush
       no matter which rows carry one. */
    if (!tot.querySelector('.num')) {
      tot.textContent = '';
      tot.append(el('span', 'num'), el('span', 'ex'));
    }
    countTo(tot.querySelector('.num'), m, 'tl:' + id, fmtMinutes);
    tot.querySelector('.ex').textContent = extreme;
    tot.className = 'tl-tot' + (extreme === 'most' ? ' hi' : extreme === 'fewest' ? ' lo' : '');
    row.classList.toggle('pin', id === tlPinned);

    /* The row is a button whose whole meaning is drawn, not written: the
       blocks say when this player is on and nothing in the subtree says it in
       words. Spell the row out instead — who, how long, how many stints — and
       let aria-expanded carry the pin state, since the tap opens the detail
       panel beneath. */
    const onCount = stints.reduce((a, s2) => a + (s2.onFloor.includes(id) ? 1 : 0), 0);
    const nameBtn = row.querySelector('.tl-name');
    nameBtn.setAttribute('aria-label',
      `${tlName(p, id)}, ${fmtMinutes(m)} minutes` +
      (extreme ? `, the ${extreme} on the team` : '') +
      `, on the floor for ${onCount} of ${stints.length} stints`);
    nameBtn.setAttribute('aria-expanded', String(id === tlPinned));
    if (id === tlPinned) nameBtn.setAttribute('aria-controls', 'tlDetail');
    else nameBtn.removeAttribute('aria-controls');
  }

  renderPinned(p, stints, mins, starts);
}

/* A tapped row opens a plain-language read of that player's game: what they
   actually get, and the two things a coach worries about — long runs on the
   floor and long spells sitting.
 *
 * The panel is inserted directly beneath the row that was tapped. Rendering it
 * below the whole timeline put it ~700px off-screen on a phone with a full
 * squad — you could not see what you had just selected. */
function renderPinned(p, stints, mins, starts) {
  for (const old of document.querySelectorAll('.tld')) old.remove();
  if (!tlPinned) return;

  const id = tlPinned;
  const row = document.querySelector(`#timeline .tl-row[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const host = el('div', 'tld');
  host.id = 'tlDetail';
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', `${tlName(p, id)}, breakdown`);
  host.style.setProperty('--c', colorOf(id));
  const on = stints.map(s2 => s2.onFloor.includes(id));
  const runs = [], sits = [];
  let cur = 0, mode = null;
  stints.forEach((s2, i) => {
    const m2 = on[i];
    if (m2 !== mode) { if (mode !== null) (mode ? runs : sits).push(cur); mode = m2; cur = 0; }
    cur += s2.minutes;
  });
  if (mode !== null) (mode ? runs : sits).push(cur);

  const stintsOn = on.filter(Boolean).length;
  const longestRun = runs.length ? Math.max(...runs) : 0;
  const longestSit = sits.length ? Math.max(...sits) : 0;
  const firstOn = on.indexOf(true);

  const head = el('div', 'tld-hd');
  const dot = el('span', 'dot'); dot.style.background = colorOf(id);
  head.append(dot, el('span', 'tld-nm', tlName(p, id)));
  const close = el('button', 'tld-x press');
  close.append(icon('x', { size: '.9em', stroke: 2.4 }));
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.onclick = () => { tlPinned = null; renderTimeline(); };
  head.append(el('span', 'spacer'), close);
  host.append(head);

  const facts = el('div', 'tld-facts');
  const f = (k, v) => { const d = el('div', 'tld-f'); d.append(el('div', 'k', k), el('div', 'v', v)); facts.append(d); };
  f('Minutes', fmtMinutes(mins[id] || 0));
  f('Stints', `${stintsOn} of ${stints.length}`);
  f('Longest run', longestRun ? fmtMinutes(longestRun) + ' min' : '—');
  f('Longest sit', longestSit ? fmtMinutes(longestSit) + ' min' : 'never sits');
  f('First on', firstOn < 0 ? 'never' : `${stints[firstOn].periodName || 'Q' + stints[firstOn].period} ${fmtClock(stints[firstOn].startSec)}`);
  host.append(facts);

  const when = el('div', 'tld-when');
  stints.forEach((s2, i) => {
    if (!on[i]) return;
    const c = el('span', 'tld-slot', `${s2.periodName || 'Q' + s2.period} ${fmtClock(s2.startSec)}`);
    when.append(c);
  });
  if (when.children.length) {
    host.append(el('div', 'tld-lab', 'On the floor at'));
    host.append(when);
  }

  row.after(host);
  popIn(host, { stiffness: 380, damping: 32 });
}
