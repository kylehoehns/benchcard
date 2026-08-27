/* ================================================================== *
 * teams-view.js -- the two navigation strips, team above game
 *
 * Team ▸ day ▸ game, top to bottom. The team chips (`renderTeams`) now
 * mount in the SHELL and the game tabs (`renderTabs`) inside the games
 * view, but they are still one seam because they are still one reading:
 * the strip sits directly above the tabs on the only view that has them.
 * Both own destructive actions -- removing a team, removing a game,
 * clearing the day -- so both go through `undoable`, imported straight
 * from toast.js.
 *
 * Two injections through `initTeams`, which also wires the two buttons
 * that live outside the strip (`#addTeam` on the roster page and
 * `#removeTeam`): `renderAll`, because switching team or game changes
 * everything downstream of it, and `setView`, because adding a team lands
 * the coach on the roster. Both belong to render.js.
 *
 * `#removeGame` is wired from inside `renderTabs` -- its hidden state
 * depends on how many games the day has, so it is repainted with them.
 * ================================================================== */
import { $, on, el } from './dom.js';
import { undoable, confirmAction } from './toast.js';
import { track } from './analytics.js';
import { state, plans, newGame, newTeam, team, lastGame, gameLabel, elideMiddle, archiveDay } from './state.js';
import { DEFAULT_SETTINGS } from './storage.js';

let renderAll = () => {};
let setView = () => {};

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
  on('#addTeam', 'onclick', addTeam);
  on('#removeTeam', 'onclick', removeTeam);
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

/* ---------------- teams ----------------
   One row above whatever is showing, because the hierarchy is team ▸ day ▸
   game and a coach who switches team expects the day, its games, the season
   ledger and the team's settings to change with it.

   It lived inside the games view until Season and Settings became team-scoped,
   at which point switching team from either meant leaving the page you were
   on. It is now shell furniture, mounted between the bar and the views -- one
   move, four views fixed. The games view reads exactly as it did: the game
   tabs are still the next thing down, so "+ Team" is still one level out from
   "+ Game".

   This row used to hide itself at one team, on the reasoning that a switcher
   with nothing to switch to is a tax on the majority. That was wrong, and the
   way we found out is that the person who asked for multiple teams could not
   find how to add one. "Add a team" lived only on the roster page, which reads
   as "edit my players", not "I coach another side". So the row is always here,
   one chip and an add, and the add carries the word Team: the game tabs
   directly below have their own "+ Game", and two bare plus signs stacked is
   how you turn one confusion into two.

   The one place it must NOT be is the welcome screen, where there is no team
   to name yet and the rest of the chrome is hidden too — and that flag is set
   by `applyView` in render.js, deliberately NOT here. `render()` returns early
   while `onboarded` is false, so a renderer cannot hide it on the one path
   that matters: removing the last team flips `onboarded` off, and this
   function never runs again to notice. Contents here, visibility there. */
export function renderTeams() {
  const box = $('#teamtabs');
  if (!box) return;
  box.textContent = '';
  state.teams.forEach((t, i) => {
    const b = el('button', 'ttab press' + (i === state.activeTeam ? ' on' : ''));
    const label = (t.name || '').trim() || `Team ${i + 1}`;
    b.textContent = label;
    b.title = label;
    if (i === state.activeTeam) b.setAttribute('aria-current', 'true');
    b.setAttribute('aria-label', `${label}, ${t.players.length} player${t.players.length === 1 ? '' : 's'}`);
    b.onclick = () => {
      if (i === state.activeTeam) return;
      state.activeTeam = i;
      track('team_switched', { teams: state.teams.length });
      renderAll();
    };
    box.append(b);
  });
  if (state.teams.length < MAX_TEAMS) {
    const add = el('button', 'ttab add press', '+ Team');
    add.type = 'button';
    add.setAttribute('aria-label', 'Add a team');
    add.onclick = addTeam;
    box.append(add);
  }
}

const MAX_TEAMS = 12;   // matches the cap sanitize() applies on load

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

   So it borrows `renderTeams`'s own fallback verbatim -- an unnamed team reads
   `Team 2` in the chip strip, and it must read `Team 2` here too. */
export function renderSettings() {
  const hd = $('#setTeamHd');
  if (hd) hd.textContent = (team()?.name || '').trim() || `Team ${state.activeTeam + 1}`;

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
     and a "no players yet" placeholder. The roster is the only useful next
     screen, and it is where the name field lives -- an unnamed team reads as
     "Team 2" everywhere until it is called something. */
  if (state.view !== 'team') setView('team');
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
  const label = (team().name || '').trim() || `Team ${state.activeTeam + 1}`;
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
      // On undo, `state.view` is the restored snapshot: a team removed from
      // the Team page used to come back with the coach on Games.
      setView(undoing ? (state.view || 'games') : 'games');
      renderAll();
    }),
  });
}

/* ---------------- the game tabs ---------------- */
export function renderTabs() {
  const box = $('#tabs'); box.textContent = '';
  state.day.games.forEach((g, i) => {
    const b = el('button', 'gtab press' + (i === state.activeGame ? ' on' : ''));
    // .lb, not a bare span: a tournament label ("Riverside Regional Tournament
    // Semifinal vs Northgate") made a 431px tab in a 368px row and pushed the
    // whole page into a horizontal scroll. The visible text is elided in the
    // middle (see elideMiddle); the full label stays on the button as its
    // accessible name and its tooltip, and in the game's own opponent field.
    const full = gameLabel(g, i);
    b.append(el('span', 'lb', elideMiddle(full)));
    b.title = full;
    b.setAttribute('aria-label', g.when ? `${full}, ${g.when}` : full);
    // Same attribute as the team tabs above, for the same reason: which game
    // is open is carried by `.on` alone otherwise, and that is a colour.
    if (i === state.activeGame) b.setAttribute('aria-current', 'true');
    if (g.when) b.append(el('span', 'when', g.when));
    if (plans[i] && !plans[i].ok) b.append(el('span', 'bad'));
    b.onclick = () => { state.activeGame = i; renderAll(); };
    box.append(b);
  });
  const add = el('button', 'gtab add press', '+ Game');
  add.onclick = () => {
    state.day.games.push(newGame(state.day.games.length, lastGame(), state.settings));
    state.activeGame = state.day.games.length - 1;
    track('day_game_count', { games: state.day.games.length });
    renderAll();
  };
  box.append(add);

  const nd = el('button', 'gtab add press', 'New day');
  nd.style.marginLeft = '.35rem';
  nd.onclick = startNewDay;
  box.append(nd);

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
      });
    };
  }
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

