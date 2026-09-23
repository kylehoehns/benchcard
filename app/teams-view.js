/* ================================================================== *
 * teams-view.js -- Today, and team identity everywhere it is shown
 *
 * Today is home (#23): `renderTeams` paints the team menu that hangs off
 * Today's header, and `renderTabs` paints Today's own content -- one entry
 * per game, the Team and Season entries below them. They are still one seam
 * because they are still one reading: team ▸ day ▸ game, all on the one
 * screen the coach opens the app to. Both own destructive actions --
 * removing a team, removing a game, clearing the day -- so both go through
 * `undoable`, imported straight from toast.js.
 *
 * Three injections through `initTeams`: `renderAll`, because switching team or
 * game changes everything downstream of it; `setView`, because opening a
 * game, Team, Season or a fresh team's Settings is a screen change; and
 * `edit` (#122, `app/edit.js`), which the six Settings handlers below call
 * instead of `renderAll` directly. `renderAll`/`setView` belong to render.js.
 *
 * `#removeGame` is wired from inside `renderTabs`, repainted with the rest
 * of the game screen -- it shows whenever there is a game (#126), since the
 * game screen can't be reached without one.
 * ================================================================== */
import { $, on, set, el } from './dom.js';
import { undoable, confirmAction } from './toast.js';
import { track } from './analytics.js';
import { state, plans, dayPlans, newGame, newTeam, team, lastGame, gameLabel, game, activeColor,
         colorOf, passSummary, passBlocks, rowGradient, sameAsLast, availIds, setAvailable,
         initials, STRATEGIES, EVEN_OUT_DAY_LABEL, openGame, dayHeading, addGame, removeGame,
         hasGames } from './state.js';
import { tipoffLabel } from './storage.js';
// #34 decision 5/6: the picker lives in live.js, and this is the one place
// it is called from -- both the paint and the tap. No cycle: gamemode.js
// does not import teams-view.js.
import { resumeBarAt, passStatus } from './live.js';
/* #35 decision 8. Two pure predicates -- no DOM, no state, just `(view, wide)`
   -- so this is a value import, not the behavior injection `renderAll` and
   `setView` get above. render.js imports this file, so the graph does close
   here; both bindings are read inside the render functions and never while
   this module is evaluating, which is the condition an ES module cycle has to
   meet. Copying the two expressions into this file instead would put the
   840px breakpoint in a second place. */
import { todayPaneShowing, gamePaneShowing } from './render.js';
import { openGameMode } from './gamemode.js';
// One switch builder for the whole app (#32): the Plan sheet's "Even out
// earlier games" row and step 3's are the same control.
import { switchRow } from './rules.js';
import { DEFAULT_SETTINGS, colorName, seasonDate } from './storage.js';
// The one close path and the one "ask before discarding" hook, shared with
// every bottom sheet (#32 uses them from a full-screen dialog).
import { closeSheet, guardClose, rememberTrigger, showAskRow, paintFlowShell, flowStepBody, flowField } from './trap.js';
// season-view.js is already in the boot graph (app.js calls `initSeason`),
// so this names no new request -- it is the one place a filed game is
// counted, and Today's Season entry reads it the same way (#23 review).
import { seasonGames } from './season-view.js';

let renderAll = () => {};
let setView = () => {};
let edit = () => {};

const MAX_TEAMS = 12;   // matches the cap sanitize() applies on load

/* The team label fallback, one helper for every place team identity is shown:
   the header button and the menu on Today, the Team entry's own name, the
   settings heading and a removal confirm's title. Written three times before
   this ticket (`renderTeams`, `renderSettings`, `removeTeam`); Today's header
   and its Team entry are two more call sites, and the rule is still one
   helper, not a fourth copy. `t` may be undefined -- `team()` before the
   first team exists -- so the fallback still has to answer something. */
const teamLabel = (t, i) => ((t && t.name) || '').trim() || `Team ${i + 1}`;

/* The read-back for `#maxSubsSeg`, one sentence per option, indexed by the
   number. Bare digits read as a rule; the setting is not one, and the only
   honest description is a RANGE, so every sentence names BOTH ends. Claim by
   claim, against `engine.js` -- do not reword any of this without re-reading
   it there:
   - "Aims for", never "keeps to". `repairChurn` (:826) walks the lineup toward
     `[minSubs, maxSubs]` but breaks out when no legal swap exists, the search
     after it charges cost rather than enforcing (40 a change over at :1091,
     20 a change short at :1092), and the floor is clamped to
     `avail.length - ON_FLOOR` (:830) so a five-player squad changes nobody.
   - The floor is `DEFAULT_MIN_SUBS = 1` (:6) under EVERY option -- `minSubs`
     is exposed nowhere, so it does not move with the seg.
   - The tail is SUBS_EXCEEDED's own arithmetic (:1380, severity `warn`), and
     "the plan says so" is that warning reaching the card.
   - 5 says "no ceiling" and deliberately NOT "no limit": `ON_FLOOR` is 5, so
     `subs > 5` is unreachable and the over-cost can never fire -- but the
     floor is still pulling, so a claim about BOTH bounds would be a lie. */
const overTail = (w) =>
  `, and goes higher only when holding to ${w} would cost somebody minutes. The plan says so when it does.`;
const SUBS_READ = [
  '',
  `Aims for one change a break${overTail('one')}`,
  `Aims for one or two changes a break${overTail('two')}`,
  `Aims for one to three changes a break${overTail('three')}`,
  `Aims for one to four changes a break${overTail('four')}`,
  'Aims for at least one change a break, with no ceiling. Five is everyone on the floor, so there is nothing higher to ask for.',
];

export function initTeams(renderAllFn, setViewFn, editFn) {
  renderAll = renderAllFn;
  setView = setViewFn;
  edit = editFn;
  // #addTeam is gone (#22); the team menu's own "Add a team" entry calls
  // `addTeam` directly, and it is the only way in now.
  on('#removeTeam', 'onclick', removeTeam);
  // "+ Game" and the two entries below it are static buttons on Today now,
  // not rebuilt every render -- bound once, like #removeTeam above. It opens
  // the three-step flow (#32); `wireAddGameFlow` binds it along with the
  // rest of the flow's controls. #100 removed "New day": a day files itself
  // once it is over, so there is nothing here left to press.
  wireAddGameFlow();
  on('#todayTeam', 'onclick', () => setView('team'));
  on('#todaySeason', 'onclick', () => setView('season'));
  // #34 decision 8: stays on Today -- no setView, no history entry. The
  // picker is called again here rather than trusting the paint's last
  // answer, so a slow tap after a same-tick state change still opens the
  // game the bar is actually showing.
  on('#resumeBtn', 'onclick', () => {
    const r = resumeBarAt(team().days, dayPlans);
    if (!r) return;
    openGame(r.d, r.i);
    openGameMode();
  });
  // The menu is anchored to the button that opens it (C8), not to a fixed
  // point on the screen. `toggle` (not `beforetoggle`) is what fires AFTER
  // the popover's own box exists, which is what makes measuring ITS size --
  // not just the button's -- possible; `beforetoggle` fires while the
  // popover is still `display: none` and would measure a 0x0 box.
  on('#teamMenu', 'ontoggle', (e) => { if (e.newState === 'open') positionTeamMenu(); });
  // Delegated and bound once: the five buttons are static markup, and
  // `renderSettings` only moves the `.on` class.

  on('#maxSubsSeg', 'onclick', (e) => {
    const b = e.target.closest('button[data-subs]');
    const s = team()?.settings;
    if (!b || !s) return;
    const v = Number(b.dataset.subs);
    if (v === s.maxSubs) return;
    s.maxSubs = v;
    /* A full render, not debounced: this re-solves every plan in the day, and
       nobody is mid-drag on a settings page. No analytics event -- both
       allow-lists would have to grow, and "did anyone move this" is not worth
       widening the privacy contract for. */
    edit('teamSetting');
  });

  /* Same shape, same reasons: static buttons, delegated once, a full render
     because the stance re-solves every plan in the day. */
  on('#tieBreakSeg', 'onclick', (e) => {
    const b = e.target.closest('button[data-tie]');
    const s = team()?.settings;
    if (!b || !s || b.dataset.tie === s.tieBreak) return;
    s.tieBreak = b.dataset.tie;
    edit('teamSetting');
  });

  /* The carryover default. Same delegated shape again, and `edit('teamSetting')`
     for the same reason -- but NOT for the same effect: nothing already planned moves,
     because `newGame` is the only reader and it has already run for every game
     in the day. Every plan signature is unchanged, so the solve is a cache hit
     and the render is really just the seg repainting itself and the record
     being saved. */
  on('#seasonDefSeg', 'onclick', (e) => {
    const b = e.target.closest('button[data-sdef]');
    const s = team()?.settings;
    if (!b || !s) return;
    const v = b.dataset.sdef === '1';
    if (v === s.seasonDefault) return;
    s.seasonDefault = v;
    edit('teamSetting');
  });

  /* The league floor. `onchange`, not `oninput`: typing "1" on the way to "12"
     would otherwise re-solve every plan in the day against a one-minute rule
     and flash its warnings at a coach mid-keystroke. Blank is off, and the
     field is re-painted from the sanitized number so a coach who types 99 or
     -4 sees what actually took. */
  on('#minMins', 'onchange', (e) => {
    const s = team()?.settings;
    if (!s) return;
    const raw = e.target.value.trim();
    const v = raw === '' ? 0 : Math.round(Math.min(60, Math.max(0, Number(raw) || 0)));
    if (v === s.minMinutes) { e.target.value = String(v); return; }
    s.minMinutes = v;
    edit('teamSetting');
  });

  /* The game format. `onchange` for the same reason the floor is -- a half
     typed "2" on the way to "20" is not a stance -- and blank falls back to the
     default rather than to 0, because a game with no periods is not a game.
     `edit('teamSetting')` repaints and saves, but nothing already planned moves:
     newGame is the only reader and it has already run for every game in the day. */
  const fmt = (sel, key, lo, hi) => on(sel, 'onchange', (e) => {
    const s = team()?.settings;
    if (!s) return;
    const raw = e.target.value.trim();
    const n = raw === '' ? NaN : Number(raw);
    const v = Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : DEFAULT_SETTINGS[key];
    if (v === s[key]) { e.target.value = String(v); return; }
    s[key] = v;
    edit('teamSetting');
  });
  fmt('#setPeriods', 'periods', 1, 8);
  fmt('#setPerMins', 'periodMinutes', 1, 40);
}

/* Anchor the popover to `#teamBtn`, not to a fixed point on the screen (C8,
   spec item 2). Run on the popover's own `toggle` event once it has actually
   opened -- its box exists by then, `position: fixed` in app.css already
   makes `top`/`left` viewport-relative, and this only ever overrides those
   two properties, never `display` or anything `:popover-open` owns. Clamped
   to the viewport on both edges: a button hard against the right or bottom
   edge (a narrow phone, a long team name) must not push the menu off screen
   the way a bare "under and left-aligned" rule would. */
function positionTeamMenu() {
  const btn = $('#teamBtn'), menu = $('#teamMenu');
  if (!btn || !menu) return;
  const b = btn.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const gap = 6, edge = 8;
  const top = Math.max(edge, Math.min(b.bottom + gap, innerHeight - edge - m.height));
  const left = Math.max(edge, Math.min(b.left, innerWidth - edge - m.width));
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

/* ---------------- the team menu (#23) ----------------
   Today's header names the active team on a button; tapping it opens a
   native `popover` (C8) listing every team, the current one checked, then
   "Add a team". It replaces the team chip strip, which was shell furniture
   above every view -- this is the same identity, just reached from Today's
   header instead of a row that used to sit above all four screens.

   Choosing another team closes the menu and repaints Today -- the rendering
   rule (a render never repaints the control a coach is using) is kept by
   closing the popover BEFORE `renderAll()` runs, so the menu is never the
   thing being redrawn mid-tap.

   The one place this must not paint is the welcome screen, same as the strip
   it replaces: `render()` returns early while `onboarded` is false, and
   `applyView` in render.js owns visibility, not this function. */
export function renderTeams() {
  const label = $('#teamBtnLabel');
  const menu = $('#teamMenu');
  if (!label || !menu) return;
  const activeName = teamLabel(team(), state.activeTeam);
  label.textContent = activeName;
  // #101 item 6: `#backBtn`'s accessible name follows the team, same as the
  // large title it collapses from -- updated here, alongside it, whenever a
  // rename or a team switch repaints this button.
  $('#backBtn')?.setAttribute('aria-label', `Back to ${activeName}`);
  menu.textContent = '';
  state.teams.forEach((t, i) => {
    const item = el('button', 'teammenu-item press');
    item.type = 'button';
    const current = i === state.activeTeam;
    const name = teamLabel(t, i);
    if (current) item.setAttribute('aria-current', 'true');
    item.append(el('span', 'teammenu-check', current ? '✓' : ''));
    item.append(el('span', 'teammenu-nm', name));
    item.setAttribute('aria-label', `${name}, ${t.players.length} player${t.players.length === 1 ? '' : 's'}`);
    item.onclick = () => {
      menu.hidePopover?.();
      if (current) return;
      state.activeTeam = i;
      track('team_switched', { teams: state.teams.length });
      renderAll();
    };
    menu.append(item);
  });
  if (state.teams.length < MAX_TEAMS) {
    const add = el('button', 'teammenu-item teammenu-add press', 'Add a team');
    add.type = 'button';
    add.onclick = () => { menu.hidePopover?.(); addTeam(); };
    menu.append(add);
  }
}

/* ---------------- the settings page's team heading ----------------
   The one piece of the settings surface that is not static markup, and it
   lives here rather than in a settings module of its own for two reasons.
   The small one: a module costs a request, and the boot graph is at 40 of a
   recorded 41 -- a whole file for one textContent write is the wrong place to
   spend the last one. The real one: this IS team identity, which is what this
   file already owns everywhere else in the app. The chip strip above the plan,
   the name on a removal confirm and this heading all answer "which team am I
   looking at", and they have to answer it the same way or the settings page
   becomes the one place a league rule can land on the wrong roster.

   So it uses `teamLabel`, the one team-identity fallback -- an unnamed team
   reads `Team 2` on Today's header and in its menu, and it must read
   `Team 2` here too. */
export function renderSettings() {
  const hd = $('#setTeamHd');
  if (hd) hd.textContent = teamLabel(team(), state.activeTeam);

  /* The game format, written back like the league floor and with the same
     caret rule: `renderAll` runs on every save, so rewriting the value under a
     coach mid-type is how a half-typed "2" becomes "2" forever. Painted first
     and outside the early-return chain below, so a missing seg further down
     cannot leave these two fields showing the previous team's numbers. */
  for (const [sel, key] of [['#setPeriods', 'periods'], ['#setPerMins', 'periodMinutes']]) {
    const f = $(sel);
    if (f && document.activeElement !== f) {
      f.value = String(team()?.settings?.[key] ?? DEFAULT_SETTINGS[key]);
    }
  }

  /* The team's own churn ceiling (v6). Marked, never rebuilt -- the buttons are
     in the markup, so this is the same write as the heading above it.
     `DEFAULT_SETTINGS` rather than a 3 typed here: the control must never paint
     a number the solver is not using. */
  const seg = $('#maxSubsSeg');
  if (!seg) return;
  const now = team()?.settings?.maxSubs ?? DEFAULT_SETTINGS.maxSubs;
  for (const b of seg.querySelectorAll('button[data-subs]')) {
    const v = Number(b.dataset.subs);
    b.classList.toggle('on', v === now);
    b.setAttribute('aria-pressed', String(v === now));
    // the digit alone is meaningless read out of the group's label
    b.setAttribute('aria-label', `${v} player${v === 1 ? '' : 's'} at once`);
  }

  /* The read-back, written only when it actually changes. `renderSettings`
     runs on every render, and re-assigning `textContent` inside an
     `aria-live` region is a fresh announcement even when the string is
     identical -- so the guard is what keeps the region quiet until the coach
     moves the setting, which is the one moment it should speak. */
  const read = $('#maxSubsRead');
  const line = SUBS_READ[now] || '';
  if (read && read.textContent !== line) read.textContent = line;

  // the tie-break stance, marked the same way -- the labels read on their own,
  // so these need no aria-label of their own
  const tie = $('#tieBreakSeg');
  if (!tie) return;
  const stance = team()?.settings?.tieBreak ?? DEFAULT_SETTINGS.tieBreak;
  for (const b of tie.querySelectorAll('button[data-tie]')) {
    const on = b.dataset.tie === stance;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }

  /* The league floor, written back the same way -- but never while the coach
     is in the box: `renderAll` runs on every save, and rewriting the value
     under a caret is how a half-typed "1" becomes "1" again forever. */
  const mm = $('#minMins');
  if (mm && document.activeElement !== mm) {
    mm.value = String(team()?.settings?.minMinutes ?? DEFAULT_SETTINGS.minMinutes);
  }

  // the carryover default, marked exactly like the stance above it
  const sd = $('#seasonDefSeg');
  if (!sd) return;
  const on = (team()?.settings?.seasonDefault ?? DEFAULT_SETTINGS.seasonDefault) === true;
  for (const b of sd.querySelectorAll('button[data-sdef]')) {
    const is = (b.dataset.sdef === '1') === on;
    b.classList.toggle('on', is);
    b.setAttribute('aria-pressed', String(is));
  }

  /* #25: the row's read-back and the picker's current mark. `#teamColorSwatch`
     needs no write here -- it carries no `data-tint` of its own, so it reads
     `--tint` straight off `<html>` (see the CSS comment above `.color-swatch`)
     and stays in step with `applyTint()` for free. `colorName` is storage.js's
     one capitalizer (#18/#25's "do not re-derive" rule), not re-typed here.
     `activeColor()` (state.js) is the same accessor `applyTint` (render.js)
     reads, so the row and the tint it describes cannot disagree. */
  const opts = $('#colorOpts');
  if (!opts) return;
  const color = activeColor();
  const name = $('#teamColorName');
  if (name) name.textContent = colorName(color);
  for (const b of opts.querySelectorAll('.color-opt[data-color]')) {
    const is = b.dataset.color === color;
    b.classList.toggle('on', is);
    b.setAttribute('aria-pressed', String(is));
  }
}

function addTeam() {
  if (state.teams.length >= MAX_TEAMS) return;
  /* Copy on create (v6): the new team starts from the settings of the team it
     was added from, and is then entirely its own. A coach with two squads is
     usually in one league, so the copy is right far more often than the
     defaults would be -- and it is a copy, not an inheritance, so changing one
     team's number never reaches the other. */
  state.teams.push(newTeam('', null, team()?.settings));
  state.activeTeam = state.teams.length - 1;
  track('team_added', { teams: state.teams.length });
  // before the view swap: setView only toggles visibility, so without this the
  // team row still shows yesterday's chips and the roster is the old team's
  renderAll();
  /* A new team has no players, so the games view would show it an empty plan
     and a "no players yet" placeholder, and the Team tab is only the roster
     now (#22) -- nothing there names the team either. Settings is where the
     name field lives, under the new team's own (still unnamed) heading, so
     that is where a fresh "Team N" gets called something. */
  if (state.view !== 'settings') setView('settings');
  // setView is synchronous -- it flips `hidden` and returns -- so the field is
  // in a visible subtree by now and takes focus. It used to run through a View
  // Transition and this had to wait on `finished`, because focusing into a
  // still-`hidden` subtree silently does nothing.
  const f = $('#teamName');
  if (f) { f.focus(); f.select(); }
}

/* Removing the last team is allowed. A season ends, and "that team is done"
   is a real thing a coach wants to say -- refusing it would leave them
   deleting players one at a time to get to the same place. Emptying the app
   lands back on the welcome screen, which is the honest destination: there is
   nothing left to plan with. Undo still restores everything, including the
   fact that they were past onboarding. */
function removeTeam() {
  const label = teamLabel(team(), state.activeTeam);
  const last = state.teams.length === 1;
  const n = state.players.length;
  /* Two whole sentences, not a count phrase slotted in front of a fixed tail:
     an empty team read "no players yet, their levels and every game go with
     it", which starts lowercase in the middle of a sentence and does not
     parse. This is the one confirm in the app, so it is the one piece of copy
     a coach reads at a destructive moment. */
  const what = n
    ? `${n} player${n === 1 ? '' : 's'}, their levels and every game go with it.`
    : 'There are no players yet, but every game for this team goes with it.';

  confirmAction({
    title: `Remove ${label}?`,
    body: what + (last
      ? ' Benchcard goes back to the start. You can undo this for a few seconds afterwards.'
      : ' You can undo this for a few seconds afterwards.'),
    verb: 'Remove team',
    run: () => undoable(`Removed ${label}.`, () => {
      state.teams.splice(state.activeTeam, 1);
      if (!state.teams.length) {
        // the record always holds at least one team; an empty app is expressed
        // as "not onboarded", which is the state the welcome screen reads
        state.teams.push(newTeam(''));
        state.onboarded = false;
      }
      state.activeTeam = Math.max(0, Math.min(state.activeTeam, state.teams.length - 1));
      track('team_removed', { teams: state.teams.length });
    }, (undoing) => {
      // setView forces 'welcome' whenever onboarded is false, so this is right
      // in both directions -- including on undo, which restores it to true.
      // Removing a team from Settings returns to Today; undo returns to
      // Settings, where the coach was standing when they removed it.
      setView(undoing ? 'settings' : 'today');
      renderAll();
    }),
  });
}

/* ---------------- Today's games, and the Team/Season entries below them ----
   `renderTabs` keeps its name (and its render-dispatch key, 'tabs') for what
   it has always been: the thing that repaints when the day's games move --
   but what it paints is Today's list now, not a strip of tabs inside the
   games view. Activating an entry opens that game's screen; "Add a game" is
   a static button on Today, wired once in `initTeams`. */
/* One game pass (#26): tip-off, status, the game's own name as the title, a
 * mini rotation and a one-line summary. Reuses `gameLabel`, `passSummary`,
 * `passBlocks`, `rowGradient` and `colorOf` from state.js -- nothing here is
 * re-derived from the plan. One `button`, no focusable element inside it
 * (item 8): the mini rotation is `aria-hidden`, and its accessible name is
 * set with `aria-label` instead of read off the visible text.
 */
// The pass's own status word and dot (`.pass-status`): Underway/now,
// Planned/ok or Needs a fix/warn -- `passStatus` (live.js) is the one place
// that decides which, read straight off its `{ word, cls }` result rather
// than re-derived here. `renderPass` (the mini pass on Today) and
// `renderTabs`'s game-screen sub line (#69 decision 5) both show it, so it
// is one function, not two copies of the same class string and label.
function passStatusEl(s) {
  return el('span', 'pass-status ' + s.cls, s.word);
}

function renderPass(g, i, d) {
  const p = dayPlans[d][i];
  const status = passStatus(p ?? null, g.live);
  const hasPlan = !!(p && p.ok);
  const full = gameLabel(g, i);
  const when = tipoffLabel(g.tipoff);

  const b = el('button', 'today-game press');

  const top = el('div', 'pass-top');
  if (when) top.append(el('span', 'pass-when', when));
  top.append(passStatusEl(status));
  b.append(top);

  b.append(el('span', 'pass-title', full));

  // Decision 4: a blocked plan has no stints to draw, so there is no mini
  // rotation for it -- not an empty one.
  if (hasPlan) {
    const rot = el('div', 'pass-rot');
    rot.setAttribute('aria-hidden', 'true');
    for (const { id, blocks } of passBlocks(g, p)) {
      const row = el('div', 'pass-row');
      row.style.background = rowGradient(blocks, g, colorOf(id), 'var(--track)');
      rot.append(row);
    }
    b.append(rot);
  }

  b.append(el('span', 'pass-summary', passSummary(g, i)));

  const statusWord = status.word.toLowerCase();
  b.setAttribute('aria-label', when ? `${full}, ${when}, ${statusWord}` : `${full}, ${statusWord}`);
  b.onclick = () => { openGame(d, i); setView('games'); };
  return b;
}

/* #34 decision 6: sets `#resumeBar`'s hidden state and writes the label in
   one function, exactly like `renderTabs` does for the entries below it.
   Only offered on Today, and only once onboarded -- the same guard
   `#actionbar`'s own hidden line uses, so a part-played game never shows a
   floating primary action on the welcome screen. */
export function renderResumeBar() {
  const bar = $('#resumeBar');
  if (!bar) return;
  /* #35 decision 8: "is Today on screen?", not "is Today the current screen?".
     Above 840px Today is the left rail under every view, so the Resume bar --
     which belongs to Today, and is pinned to the rail's width there -- is
     offered under the game screen, Team, Season and Settings as well. */
  const r = state.onboarded && todayPaneShowing(state.view) ? resumeBarAt(team().days, dayPlans) : null;
  bar.hidden = !r;
  if (r) {
    set('#resumeBtn .ab-lab', 'textContent',
      `${gameLabel(team().days[r.d].games[r.i], r.i)} · ${r.where} · Resume`);
  }
}

export function renderTabs() {
  // The Game screen's own header title, kept live while the coach edits the
  // opponent field -- `setView` only sets it on a view CHANGE, and typing in
  // #label does not change the view. `gameLabel` is the one game label,
  // reused here exactly as Today's own entries reuse it below.
  /* #35 decision 8: the game pane, not the game view. Above 840px the open
     game is the right pane's resting state, so it is on screen while Today is
     the current screen too, and its title and sub line have to keep up. */
  if (gamePaneShowing(state.view) && hasGames()) {
    const g = game(), i = state.activeGame, label = gameLabel(g, i);
    /* `#barTitle` is the exception, and stays on the view: the bar belongs to
       the screen the coach is on, not to a pane beside it. Writing the game's
       name into it while she is reading Today would title the window wrong. */
    const t = $('#barTitle');
    if (t && state.view === 'games') t.textContent = label;

    // #69 decision 5: the one large title on the game screen is the
    // opponent, reusing `gameLabel`; the sub line reuses `passStatusEl`
    // above -- the pass's own status word and dot -- rather than a second
    // copy of either. `#barTitle` above holds the same words, but #33 made it
    // a centered overlay that is laid out at all times: at the top of this
    // screen it is painted at `opacity: 0` and marked `aria-hidden="true"`
    // (`syncBarTitle` in render.js), so it is neither a second visible `h1`
    // nor a second announced one. It fades in only once the large title has
    // scrolled under the bar, by which point it is the only title left.
    const gt = $('#gameTitle');
    if (gt) gt.textContent = label;
    const gs = $('#gameSub');
    if (gs) {
      gs.textContent = '';
      // #101 item 3: the day's heading leads the sub line, the same label
      // Today gives it, so a game moved to another date reads as moved
      // right here rather than only back on Today.
      gs.append(dayHeading(state.day) + ' · ');
      if (g.tipoff) gs.append(tipoffLabel(g.tipoff) + ' · ');
      gs.append(passStatusEl(passStatus(plans[i] ?? null, g.live)));
    }
  }

  const box = $('#todayGames');
  /* #26 decision 6: passes paint only while Today is the screen on show.
     `renderTabs` runs on every edit on the Game screen (AFTER_EDIT,
     PLAN_ONLY -- app/edit.js), and building four mini rotations -- the one
     thing here that costs more than a couple of elements -- on every slider
     move, hidden the whole time, is work nobody sees. `applyView` (render.js)
     calls `render('tabs')` once, on the way in, when Today becomes the
     screen again, so the passes are never more than one edit stale.

     #35 decision 9: at 840px and up Today is the left rail and the coach CAN
     see those four mini rotations while she edits the game beside them, so
     the work is no longer wasted and the guard has to let it through. Below
     840px nothing changes -- `todayPaneShowing` is `state.view === 'today'`
     there, which is the line this replaced. */
  if (box && todayPaneShowing(state.view)) {
    box.textContent = '';
    // #101 item 4: one group per day, stacked in date order (`team().days`
    // is kept sorted -- `dayFor`/`sanitizeTeam` are the only things that
    // insert one, and both insert in order) -- a heading (`dayHeading`)
    // over that day's own passes.
    team().days.forEach((day, d) => {
      const group = el('div', 'day-group');
      group.append(el('h2', 'day-heading', dayHeading(day)));
      day.games.forEach((g, i) => group.append(renderPass(g, i, d)));
      box.append(group);
    });
  }

  // #126: one gray line, "Add a game" stays the one prominent action beside
  // it (not duplicated inside the note) -- P2/W3.
  const noGames = $('#todayNoGames');
  if (noGames) noGames.hidden = hasGames();

  const teamBtn = $('#todayTeam');
  if (teamBtn) {
    teamBtn.textContent = '';
    teamBtn.append(el('span', 'today-entry-lab', 'Team'));
    const n = state.players.length;
    teamBtn.append(el('span', 'today-entry-sub',
      `${teamLabel(team(), state.activeTeam)} · ${n} player${n === 1 ? '' : 's'}`));
  }

  const seasonBtn = $('#todaySeason');
  if (seasonBtn) {
    seasonBtn.textContent = '';
    seasonBtn.append(el('span', 'today-entry-lab', 'Season'));
    // `seasonGames()`, not a second `Array.isArray` check -- the same
    // reader season-view.js's own heading counts a filed game with.
    const n = seasonGames().length;
    seasonBtn.append(el('span', 'today-entry-sub',
      n === 0 ? 'No games filed yet' : `${n} game${n === 1 ? '' : 's'} filed`));
  }

  const rmBtn = $('#removeGame');
  if (rmBtn) {
    // #126: the game screen needs a game, so it can't be reached with none --
    // shows whenever the game screen is showing, with no count to guard on.
    rmBtn.hidden = false;
    rmBtn.onclick = () => {
      const label = gameLabel(state.day.games[state.activeGame], state.activeGame);
      // #126: with the team's LAST game going, there is no day left to
      // rebalance -- the toast drops that clause.
      const last = team().days.reduce((n, d) => n + d.games.length, 0) < 2;
      undoable(`Removed ${label}.${last ? '' : ' The day rebalanced.'}`, () => {
        removeGame();
        // Removing the open game returns to Today; undo restores the game
        // and reopens its Game screen (the snapshot holds `view: 'games'`
        // and the old `activeGame`, so the default undo refresh reopens it).
        setView('today');
      });
    };
  }
}

/* ---------------- Add a game, in three steps (#32) --------------------
 *
 * The one-tap "+ Game" is gone: it dropped a copy of the last game into the
 * day and left the coach on a screen full of controls to undo it with. The
 * flow asks the three questions that copy was guessing at -- who you are
 * playing, who is here, how the minutes split -- and is still one tap when
 * the answer is "same as last time" (N8: always skippable).
 *
 * `newGame(len, lastGame(), settings)` builds the draft at OPEN, and both
 * "Use it" (step 1's card) and "Plan it" (step 3) commit that same object.
 * There is no second copy path, which is what makes "Use it" and walking all
 * three steps without changing anything land on identical games.
 *
 * The steps themselves are one list below -- the question each one asks
 * beside the builder that fills its body -- so a heading and its content
 * cannot drift apart and "how many steps" is counted rather than written
 * down in a second place.
 */
const FLOW_STEPS = [
  { q: 'Who are you playing?', build: stepWho },
  { q: "Who's here?", build: stepHere },
  { q: 'How should minutes split?', build: stepSplit },
];
const STEPS = FLOW_STEPS.length;

let draft = null;
let flowStep = 1;

/* I1: resume rather than restart when `draft` survived the last close. It
   survives by default -- it is module state, and the close Chrome will not
   let us veto runs none of our code (see the `close` listener below). The
   close paths that DO run code clear it first: Discard and a commit null it
   outright, and a plain close with nothing typed is nulled by that listener.
   So a draft still here is one with something in it worth coming back to.

   I9: the spec's own pseudocode names this `openAddGame(trigger)` -- opened
   by hand (`showModal()`, not `openSheet`) because `openSheet` also runs the
   `.bsheet` slide/height/cancel machinery #32's full-screen flow does not
   use, so `rememberTrigger` is called directly instead of picking that whole
   path up. Without it, `returnFocus` (trap.js) has nothing to send focus
   back to when the flow closes -- the ✕/Escape/Discard paths (`closeSheet`)
   all end up there. */
function openAddGame(trigger) {
  const d = $('#addGameFlow');
  if (!d) return;
  if (!draft) {
    // #101 item 2: defaults to the team's LAST day (not necessarily the
    // open one -- a coach can be viewing an earlier day's game when she
    // taps Add a game), same day `sameAsLast()` and `lastGame()` already
    // read for the shortcut card below.
    const days = team().days;
    const last = days[days.length - 1];
    // #126: no days at all -- the first game a coach who removed the last
    // one adds back. Same draft a brand-new team gets (`newGame(0, null,
    // ...)`, `newTeam`), dated today (`seasonDate`, never a second
    // formatter).
    if (last) {
      draft = newGame(last.games.length, last.games[last.games.length - 1], state.settings);
      draft.date = last.date;
    } else {
      draft = newGame(0, null, state.settings);
      draft.date = seasonDate();
    }
    flowStep = 1;
  }
  rememberTrigger(d, trigger);
  showFlowAsk(false);
  d.showModal();
  paintFlow();
}

// #36: this flow's own id set, handed to the shared painter both flows use
// now (`paintFlowShell`, trap.js) so the step/progress/body/back/next
// painting lives in one place instead of two near-identical copies.
const AG = { step: '#agStep', prog: '#agProg', body: '#agBody', back: '#agBack', next: '#agNext' };

function paintFlow() {
  if (!draft) return;
  // I2: `flowBack()` repaints under whatever the ask left behind -- a step
  // change is itself the answer "keep editing", so it can never still be
  // asking about the step it just left.
  showFlowAsk(false);
  paintFlowShell(AG, flowStep, STEPS, flowStepBody(FLOW_STEPS, flowStep),
    { nextText: flowStep === STEPS ? 'Plan it' : 'Next' });
}

/* Step 1. The two fields write straight into the draft, so what is typed
   survives stepping forward and back, and is what the discard ask is about.
   The card underneath is the one-tap path (N8): `sameAsLast()` has already
   decided whether there is anything worth copying, and "Use it" commits the
   very draft `openAddGame` built -- no second copy. */
function stepWho(wrap) {
  // #101 item 2: the Date field, above Opponent and Tip-off -- `min` is
  // today (`seasonDate`, never a second formatter), and changing it
  // re-derives `useCarryover` the same way `newGame`'s own `n > 0` rule
  // does: on, only when the target date already has a day (so already has
  // a game), off for a date that would start a new day.
  const [dateField, dateInput] = flowField('input', 'Date', draft.date, null,
    v => { draft.date = v; draft.useCarryover = team().days.some(d => d.date === v); }, 'date');
  dateInput.min = seasonDate();
  const [opponent] = flowField('input', 'Opponent', draft.label, 'Panthers',
    v => { draft.label = v; });
  const [tipoff] = flowField('input', 'Tip-off', draft.tipoff, null,
    v => { draft.tipoff = v; }, 'time');
  wrap.append(dateField, opponent, tipoff);
  const same = sameAsLast();
  if (!same) return;
  const card = el('div', 'flow-card');
  const use = el('button', 'btn primary press', 'Use it');
  use.type = 'button';
  use.onclick = commitFlow;
  card.append(el('p', 'flow-card-t', same.title), el('p', 'flow-card-s', same.summary), use);
  wrap.append(card);
}

/* Step 2. The Plan sheet's picker tiles (`.pick` / `.plr` / `.plr-check`),
   pointed at availability instead of a five: the number in the player's own
   color, the first name bold and the surname muted under it, a ✓ while they
   are here. The visible "✓" is decorative -- the accessible name carries the
   state, as ", Absent", the same split `whoRow` draws on the Who sheet. */
const tileName = p => p.name || 'Unnamed';

function paintTile(b, p, present) {
  b.className = 'plr press ' + (present ? 'on' : 'off');
  b.setAttribute('aria-pressed', String(present));
  b.setAttribute('aria-label', present ? tileName(p) : `${tileName(p)}, Absent`);
  const check = b.querySelector('.plr-check');
  if (check) check.hidden = !present;
}

function tile(p, present) {
  const b = el('button');
  b.type = 'button';
  b.style.setProperty('--c', colorOf(p.id));
  const name = tileName(p).trim();
  const cut = name.lastIndexOf(' ');
  /* Each part gets its own element so each can be its own ellipsized line
     (B1, app.css). The space between them is kept as a real text node so
     `.nm`'s textContent is still "First Last" -- the smoke check reads it
     that way, and so does anything that copies a name out of the DOM. */
  const nm = el('span', 'nm');
  nm.append(el('span', 'plr-first', cut > 0 ? name.slice(0, cut) : name));
  if (cut > 0) nm.append(' ', el('span', 'plr-sur', name.slice(cut + 1)));
  const check = el('span', 'plr-check', '✓');
  check.setAttribute('aria-hidden', 'true');
  b.append(el('span', 'av', initials(p)), nm, check);
  // The tile carries its own answer rather than reading it back out of the
  // attribute it just wrote -- one place decides what "here" means.
  let here = present;
  paintTile(b, p, here);
  b.onclick = () => {
    here = !here;
    // setAvailable, never a bare `draft.out` edit: sitting a player down has
    // to take any override naming them with it (state.js).
    setAvailable(draft, p.id, here);
    paintTile(b, p, here);
    paintHereCount();
  };
  return b;
}

// "11 of 11", repainted on every tap -- the only part of step 2 that changes.
const hereCount = () => `${availIds(draft).length} of ${state.players.length}`;
function paintHereCount() {
  const c = $('#agBody .flow-count');
  if (c) c.textContent = hereCount();
}

function stepHere(wrap) {
  if (!state.players.length) {
    /* I10: unlike the Who sheet's own empty state (game-setup.js) this one is
       reachable on a brand-new team's very first game, where Next still walks
       on to step 3 and lets a coach plan for nobody -- copy is the only fix
       in scope (no navigation added), so it names where the roster gets
       filled in rather than repeating game-setup.js's plain line. */
    wrap.append(el('p', 'sheetempty', 'No players on the roster yet. Build your roster on the Team page, then come back.'));
    return;
  }
  const grid = el('div', 'pick');
  const out = new Set(draft.out);
  for (const p of state.players) grid.append(tile(p, !out.has(p.id)));
  wrap.append(grid, el('p', 'flow-count', hereCount()));
  /* Only when there was a game to copy from: it tells the coach the tiles
     already carry last game's answer, so the job is to fix what changed
     rather than to fill the whole thing in. */
  if (lastGame()) {
    wrap.append(el('p', 'flow-note', "Copied from the last game. Tap anyone who's changed."));
  }
}

/* Step 3. The four words come off `#stratseg` itself rather than a list
   written here -- the Plan sheet's picker and this one have to read the same,
   and two lists is how they stop. The sentence under each is `STRATEGIES`,
   the one map that holds them. */
function stepSplit(wrap, q) {
  const group = el('div', 'flow-opts');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', q);
  for (const src of document.querySelectorAll('#stratseg button[data-strat]')) {
    const key = src.dataset.strat;
    const b = el('button', 'opt press');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(draft.strategy === key));
    b.append(el('span', 'opt-t', src.textContent.trim()), el('span', 'opt-d', STRATEGIES[key]));
    b.onclick = () => {
      draft.strategy = key;
      for (const n of group.children) n.setAttribute('aria-checked', String(n === b));
    };
    group.append(b);
  }
  wrap.append(group);
  /* The Plan sheet's own switch builder (rules.js), not a second one: this is
     the same control, bound to the same field of the same game. */
  wrap.append(switchRow(EVEN_OUT_DAY_LABEL, draft.useCarryover, false,
    (v) => { draft.useCarryover = v; }));
}

function flowNext() {
  if (flowStep < STEPS) { flowStep++; paintFlow(); } else commitFlow();
}

/* I3: the footer's "‹ Back" and Android's back gesture are the same action.
   From step 1 there is nothing behind the flow, so it asks to leave. */
function flowBack() {
  if (flowStep > 1) { flowStep--; paintFlow(); } else requestCloseFlow();
}

/* Every close a coach can make goes through `closeSheet`, which is the one
   place the discard guard below is consulted. */
function requestCloseFlow() { closeSheet($('#addGameFlow')); }

// I7: the same ask-row toggle `showAddAsk`/`showPasteAsk` (roster-view.js)
// use, shared out of trap.js next to `guardClose`.
function showFlowAsk(show) { showAskRow('#agAsk', '#agFoot', '#agKeep', show); }

/* The two ways the flow ends for good, committing and discarding. The draft
   is dropped FIRST so the guard below has nothing left to ask about: the
   answer is either in the day now or thrown away on purpose. */
function closeFlow() {
  draft = null;
  showFlowAsk(false);
  closeSheet($('#addGameFlow'));
}

// "Plan it" and "Use it" both end here: one commit path, not two.
function commitFlow() {
  if (!draft) return;
  addGame(draft, draft.date);
  track('day_game_count', { games: state.day.games.length });
  closeFlow();
  // `applyView` renders on a real transition into Games (#23 review, third
  // round) -- a `renderAll()` here would be exactly the double work it flagged.
  setView('games');
}

/* C4: a commit sheet asks before it throws away typed text, and it cannot ask
   in a second overlay -- `#confirm` is a plain div and `showModal()` inerts
   it. Same guard the paste and add-a-player sheets use (`guardClose`,
   trap.js); true means "asked, stay open". */
function askBeforeDiscard() {
  if (!draft || (!draft.label.trim() && !draft.tipoff.trim())) return false;
  showFlowAsk(true);
  return true;
}

function wireAddGameFlow() {
  const d = $('#addGameFlow');
  if (!d) return;
  on('#todayAddGame', 'onclick', () => openAddGame($('#todayAddGame')));
  // ✕ asks from any step rather than walking back to step 1 first.
  on('#agClose', 'onclick', requestCloseFlow);
  on('#agBack', 'onclick', flowBack);
  on('#agNext', 'onclick', flowNext);
  on('#agKeep', 'onclick', () => { showFlowAsk(false); $('#agNext')?.focus({ preventScroll: true }); });
  on('#agDiscard', 'onclick', closeFlow);
  /* `cancel` is the one event Escape AND Android's back gesture both fire.
     Preventing it and stepping back is what makes the gesture walk the flow
     instead of throwing the whole thing away on the first press. */
  on('#addGameFlow', 'oncancel', (e) => { e.preventDefault(); flowBack(); });
  /* I1: a second close request right behind the first is one Chrome will not
     let `oncancel` veto. Measured against a bare `<dialog>` with the app's
     own scripts stripped out, on a data: page and again on a real http
     origin, so neither an opaque origin nor Benchcard's own Escape handling
     produced it: `cancel` still fires and `preventDefault()` still runs, but
     Chrome closes the dialog anyway once the page's activation for the close
     watcher is spent, and a handler has no way to buy more of it back.

     Nothing of ours runs on that forced path at all. The dialog's own `close`
     event does NOT fire there either -- the log ends at the second vetoed
     `cancel`, re-sampled 1.5s later in case it were merely late. So the flow
     cannot save anything at force-close time, and the fix is that it does not
     have to: `draft` is module state that simply outlives the dialog, and
     `openAddGame` above resumes it instead of starting over. Doing nothing is
     the whole mechanism.

     The listener below is for the ordinary closes, where `closeSheet` calls
     `d.close()` and `close` does fire: it is what makes a flow with nothing
     typed in it start over at step 1 next time rather than resume a blank.

     A history-based (pushState / popstate) alternative was ruled out, not
     just left simpler: a modal dialog's own close watcher is first in line
     for a close request while it is open, so back would never reach
     `popstate` at all. C4's "ask first" cannot hold for a close this handler
     is never told about; not losing the answer is what is left to do. */
  on('#addGameFlow', 'onclose', () => {
    if (draft && !draft.label.trim() && !draft.tipoff.trim()) draft = null;
    showFlowAsk(false);
  });
  guardClose(d, askBeforeDiscard);
}

/* #100 removed `startNewDay` -- a day files itself once it is over
   (`fileIfPast` in state.js, wired from app.js) rather than waiting for a
   tap. */

