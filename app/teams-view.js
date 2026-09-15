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
 * Two injections through `initTeams`: `renderAll`, because switching team or
 * game changes everything downstream of it, and `setView`, because opening a
 * game, Team, Season or a fresh team's Settings is a screen change. Both
 * belong to render.js.
 *
 * `#removeGame` is wired from inside `renderTabs` -- its hidden state
 * depends on how many games the day has, so it is repainted with them.
 * ================================================================== */
import { $, on, el } from './dom.js';
import { undoable, confirmAction } from './toast.js';
import { track } from './analytics.js';
import { state, plans, newGame, newTeam, team, lastGame, gameLabel, game, archiveDay } from './state.js';
import { DEFAULT_SETTINGS } from './storage.js';
// season-view.js is already in the boot graph (app.js calls `initSeason`),
// so this names no new request -- it is the one place a filed game is
// counted, and Today's Season entry reads it the same way (#23 review).
import { seasonGames } from './season-view.js';

let renderAll = () => {};
let setView = () => {};

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

export function initTeams(renderAllFn, setViewFn) {
  renderAll = renderAllFn;
  setView = setViewFn;
  // #addTeam is gone (#22); the team menu's own "Add a team" entry calls
  // `addTeam` directly, and it is the only way in now.
  on('#removeTeam', 'onclick', removeTeam);
  // "+ Game", "New day" and the two entries below them are static buttons on
  // Today now, not rebuilt every render -- bound once, like #removeTeam above.
  on('#todayAddGame', 'onclick', addGame);
  on('#todayNewDay', 'onclick', startNewDay);
  on('#todayTeam', 'onclick', () => setView('team'));
  on('#todaySeason', 'onclick', () => setView('season'));
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
    /* A full render, not `soon(...)`: this re-solves every plan in the day, and
       nobody is mid-drag on a settings page. No analytics event -- both
       allow-lists would have to grow, and "did anyone move this" is not worth
       widening the privacy contract for. */
    renderAll();
  });

  /* Same shape, same reasons: static buttons, delegated once, a full render
     because the stance re-solves every plan in the day. */
  on('#tieBreakSeg', 'onclick', (e) => {
    const b = e.target.closest('button[data-tie]');
    const s = team()?.settings;
    if (!b || !s || b.dataset.tie === s.tieBreak) return;
    s.tieBreak = b.dataset.tie;
    renderAll();
  });

  /* The carryover default. Same delegated shape again, and `renderAll` for the
     same reason -- but NOT for the same effect: nothing already planned moves,
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
    renderAll();
  });

  /* The league floor. `onchange`, not `oninput`: typing "1" on the way to "12"
     would otherwise re-solve every plan in the day against a one-minute rule
     and flash its warnings at a coach mid-keystroke. Blank is off, and the
     field is re-painted from the sanitised number so a coach who types 99 or
     -4 sees what actually took. */
  on('#minMins', 'onchange', (e) => {
    const s = team()?.settings;
    if (!s) return;
    const raw = e.target.value.trim();
    const v = raw === '' ? 0 : Math.round(Math.min(60, Math.max(0, Number(raw) || 0)));
    if (v === s.minMinutes) { e.target.value = String(v); return; }
    s.minMinutes = v;
    renderAll();
  });

  /* The game format. `onchange` for the same reason the floor is -- a half
     typed "2" on the way to "20" is not a stance -- and blank falls back to the
     default rather than to 0, because a game with no periods is not a game.
     `renderAll` repaints and saves, but nothing already planned moves: newGame
     is the only reader and it has already run for every game in the day. */
  const fmt = (sel, key, lo, hi) => on(sel, 'onchange', (e) => {
    const s = team()?.settings;
    if (!s) return;
    const raw = e.target.value.trim();
    const n = raw === '' ? NaN : Number(raw);
    const v = Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : DEFAULT_SETTINGS[key];
    if (v === s[key]) { e.target.value = String(v); return; }
    s[key] = v;
    renderAll();
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
  label.textContent = teamLabel(team(), state.activeTeam);
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
   games view. Activating an entry opens that game's screen; "Add a game" and
   "New day" are static buttons on Today, wired once in `initTeams`. */
export function renderTabs() {
  // The Game screen's own header title, kept live while the coach edits the
  // opponent field -- `setView` only sets it on a view CHANGE, and typing in
  // #label does not change the view. `gameLabel` is the one game label,
  // reused here exactly as Today's own entries reuse it below.
  if (state.view === 'games') {
    const t = $('#barTitle');
    if (t) t.textContent = gameLabel(game(), state.activeGame);
  }

  const box = $('#todayGames');
  if (box) {
    box.textContent = '';
    state.day.games.forEach((g, i) => {
      const b = el('button', 'today-game press');
      const full = gameLabel(g, i);
      b.append(el('span', 'today-game-lb', full));
      if (g.when) b.append(el('span', 'today-game-when', g.when));
      if (plans[i] && !plans[i].ok) b.append(el('span', 'bad'));
      b.setAttribute('aria-label', g.when ? `${full}, ${g.when}` : full);
      b.onclick = () => { state.activeGame = i; setView('games'); };
      box.append(b);
    });
  }

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
    rmBtn.hidden = state.day.games.length < 2;
    rmBtn.onclick = () => {
      // belt and braces: a day must always have a game, or game() is undefined
      // and every render downstream throws.
      if (state.day.games.length < 2) return;
      const label = gameLabel(state.day.games[state.activeGame], state.activeGame);
      undoable(`Removed ${label}. The day rebalanced.`, () => {
        state.day.games.splice(state.activeGame, 1);
        state.activeGame = Math.max(0, state.activeGame - 1);
        // Removing the open game returns to Today; undo restores the game
        // and reopens its Game screen (the snapshot holds `view: 'games'`
        // and the old `activeGame`, so the default undo refresh reopens it).
        setView('today');
      });
    };
  }
}

/* "+ Game"'s own push, moved with its behaviour intact: a new game copies the
   format, who is at the gym and the rules from the last game in the day, and
   opens straight onto its own screen. */
function addGame() {
  state.day.games.push(newGame(state.day.games.length, lastGame(), state.settings));
  state.activeGame = state.day.games.length - 1;
  track('day_game_count', { games: state.day.games.length });
  setView('games');
  renderAll();
}

/* Its own function rather than an inline handler: the wording and the undo
   behaviour are the point, and this used to have a second entry point in the
   setup fold that had to say exactly the same thing.

   This is also the moment the day becomes history. `archiveDay` files every
   game that solved into `team().season` before the day is replaced -- see the
   note on it in state.js for why "New day" is where a game counts as
   finished. It has to run inside `undoable`'s `mutate`, not before it: the
   snapshot is taken first, so Undo puts the season back exactly as it was
   along with the day, and there is no second un-archive path to keep honest.
   `n` is read after the archive so the toast can say what was kept, because a
   coach who taps this and sees only "cleared" has no way to know their
   Saturday was not thrown away again. */
function startNewDay() {
  const had = state.day.games.length;
  let kept = 0;
  /* When something was kept, that is the news, so it leads -- and "cleared"
     stops being the honest word for it. Nothing kept falls back to the old
     wording, which is still exactly what happened. */
  const msg = () => (kept
    ? `${kept === 1 ? '1 game' : `${kept} games`} saved to the season. New day started.`
    : (had > 1 ? `Cleared ${had} games for a new day.` : 'Started a new day.'));
  undoable(msg, () => {
    kept = archiveDay();
    const g = newGame(0, lastGame(), state.settings);
    g.out = [];
    state.day = { name: '', games: [g] };
    state.activeGame = 0;
  });
}

