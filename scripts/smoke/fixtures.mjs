/* The fixtures the browser passes drive: a lean SEED for the cold-load
   measurement and a RICH record for everything else. Moved out of
   `smoke.mjs` unchanged. */
import { evalIn, SETTLE } from './dom.mjs';

/* ---------- the roster the harness plans with ---------- */

/* 11 players at 4×8 with subs every 4 minutes: the realistic case the rules
   ask every check to use, not a three-kid toy. Written straight to the storage
   key so the app boots with a plan already on screen — `sanitize` fills in
   every field left out here. */
export const PLAYERS = [
  ['Marcus Williams', '4'], ['Devon Ellis', '7'], ['Hana Kim', '9'], ['Eli Tran', '12'],
  ['Ana Reyes', '3'], ['Jordan Bell', '21'], ['Sam Okafor', '5'], ['Riley Novak', '8'],
  ['Casey Lindqvist', '11'], ['Theo Alvarez', '15'], ['Nia Brooks', '2'],
].map(([name, number], i) => ({ id: 'p' + i, name, number, shortName: '' }));

/* The rich fixture's tier assignment, named so a check that wants a level
   word can derive it (with `LEVELS` in balance.js) instead of hand-copying
   one per row: 5 (Go-to) on Hana Kim (p2), 1 (Developing) on Nia Brooks
   (p10), 3 (Regular) on everyone else -- the split item 1's roster rows
   exist to show. */
export const tierOf = p => (p.id === 'p2' ? 5 : p.id === 'p10' ? 1 : 3);

export const UI = {
  copies: 2, showMinutes: true, printScope: 'game', cardId: 'short',
  cardSize: 'pocket', theme: 'light',
};

/* A5: long enough to wrap the identity block's name line rather than fit it.
 * `team-screen.mjs` and `sheet-spacing.mjs` each held their own copy of this
 * string before #86, which is a third place for it to drift the moment one
 * changed and the other two did not -- one export, three importers. */
export const LONG_NAME = 'Maximilian Alexander Featherstone-Whitmore';

/* THE LEAN FIXTURE. One team, one game, no filed season, every player on the
   default level. This is the ONLY state the cold load ever sees, and therefore
   the only state the byte/node/request budget is measured against — see the
   split below for why that matters.

   It stays on `benchcard.v3`, deliberately. That key is the returning coach
   with an old record on their phone, `sanitize` is shape-driven so reading it
   is the migration, and moving this to v6 would move the recorded node
   baseline for a reason that has nothing to do with the app. The rich fixture
   below is on v6, so each schema branch is exercised by exactly one fixture
   rather than neither being exercised on purpose. */
export const SEED = {
  version: 3, onboarded: true, tourSeen: true, teamName: 'Smoke Test',
  players: PLAYERS,
  day: { name: 'Saturday', games: [{ id: 'g0', label: 'Hawks', when: '9:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 }] },
  activeGame: 0, view: 'games',
  ui: UI,
};

/* ---------- THE RICH FIXTURE ----------
 *
 * WHY THERE ARE TWO. Every horizontal-pan and touch-target defect the UX swarm
 * found lives in a state the lean fixture structurally cannot enter, and the
 * harness printed 18 PASS / 0 FAIL with all of them present. The old comments
 * in this file said the season had no filed games because seeding them "would
 * cost more cold-load nodes than the budget has slack" — which was true, and
 * was the wrong trade, because it was one fixture serving two measurements
 * that want opposite things. The budget wants the LEANEST honest cold load;
 * the a11y, overflow and touch passes want the RICHEST honest screen.
 *
 * So they get one each. `report.payload` is snapshotted before any state is
 * driven (see `browserChecks`), and this record is written and reloaded after
 * that line. The cost to the budget is zero by construction, not by estimate.
 *
 * EVERY FACT SEEDED HERE NAMES THE WRONG ANSWER IT MAKES VISIBLE. A fixture
 * can make a guard unfalsifiable — A27's pinning tests could not fail until
 * the fixture grew a player who was at a game and played none of it — so
 * nothing is in here for realism's sake:
 *
 *   - `tier` 5 on Hana and 1 on Nia. `levelledCount()` goes truthy, so
 *     `roster-view.js` renders "Put everyone back to the same level". That one
 *     button is the whole of the roster's 208px pan at 320px/200% text; with
 *     every player on the default level it does not exist and the pan reads
 *     clean.
 *   - A SECOND GAME in the day. Under two games `renderDayTotals` returns
 *     early with a one-line "Tournament?" prompt; at two it renders a bar per
 *     player, a legend and a second game tab. A day-totals row that overflows
 *     is invisible to a fixture with one game.
 *   - THREE FILED SEASON GAMES. Without them the Season view is an empty
 *     state: no totals rows, no `details.sn-game` folds, nothing to pan. The
 *     measured pan there is 132px, not the 11px an empty ledger reports.
 *   - NIA AT THE THIRD GAME WITH ZERO MINUTES (`p10: 0`). "Played none of it"
 *     and "was not there" are only distinguishable in a record that contains
 *     one of each — that is the fixture hole A27 was shipped through.
 *
 * v6, and the current schema on purpose: `smoke.mjs` seeded v3 while
 * `storage.js` was on v6, so every run exercised the migration branch and
 * nothing exercised the branch a coach on this build actually uses. v6 wins
 * the read order in `loadState`, so the v3 write that still fires on every new
 * document is inert once this is in place. */
export const RICH = {
  version: 6, onboarded: true, tourSeen: true, activeTeam: 0, view: 'games',
  ui: UI,
  teams: [{
    id: 't0', name: 'Smoke Test',
    players: PLAYERS.map(p => ({ ...p, tier: tierOf(p) })),
    day: {
      name: 'Saturday',
      games: [
        { id: 'g0', label: 'Hawks', when: '9:00', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 },
        { id: 'g1', label: 'Ravens', when: '11:30', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 5678 },
      ],
    },
    activeGame: 0,
    /* Three Saturdays, uneven on purpose: a ledger where everyone has the same
       total sorts arbitrarily and would hide a sort bug (A24a). Nia (`p10`) is
       AT the third game on zero minutes and ABSENT from the second — the two
       cases the CSV and the ledger must not conflate. */
    season: {
      games: [
        { id: 's1', date: '2026-07-11', day: 'Saturday', opponent: 'Comets', periods: 4, periodMinutes: 8,
          minutes: { p0: 16, p1: 14.5, p2: 18, p3: 12, p4: 15, p5: 13.5, p6: 16, p7: 11, p8: 14, p9: 17, p10: 12.5 } },
        { id: 's2', date: '2026-07-18', day: 'Saturday', opponent: 'Falcons', periods: 4, periodMinutes: 8,
          minutes: { p0: 15, p1: 16, p2: 19.5, p3: 13, p4: 12, p5: 17, p6: 14, p7: 15.5, p8: 13 } },
        { id: 's3', date: '2026-08-01', day: 'Saturday', opponent: 'Wolves', periods: 4, periodMinutes: 8,
          minutes: { p0: 14, p1: 15, p2: 20, p3: 11.5, p4: 16, p5: 12, p6: 18, p7: 13, p8: 15, p9: 14.5, p10: 0 } },
      ],
    },
  }],
};

/* Swap the lean fixture for the rich one and reload. Called exactly once, from
   `browserChecks`, immediately after the payload snapshot. The reload is
   required rather than tidy: `loadState` runs at boot and nothing re-reads
   localStorage afterwards. */
/* `ui` overrides one or more `RICH.ui` fields before the write -- #29's
   "first open" check needs a record that already says 'half' the way a
   returning coach's saved choice would, not a live mutation after boot that
   `renderCards` never re-runs against (state.js's `cardSize` is read where
   `#sheet`'s cards are built, not observed). Every other caller passes
   nothing and gets exactly the old RICH. */
export async function goRich(c, origin, ui) {
  const record = ui ? { ...RICH, ui: { ...RICH.ui, ...ui } } : RICH;
  await evalIn(c, `(() => {
    localStorage.removeItem('benchcard.v3');
    localStorage.removeItem('benchcard.v6.bak');
    localStorage.setItem('benchcard.v6', ${JSON.stringify(JSON.stringify(record))});
    return 1;
  })()`);
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Page.navigate', { url: origin + '/index.html' });
  await loaded;
  await evalIn(c, `(async () => { await document.fonts.ready;
    for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
    await ${SETTLE}; })()`);
}

/* Reload straight onto `SEED` (`benchcard.v3`), the way `game passes` (#26)
   needs to measure its own `cold`/`coldToday` rather than trust a number from
   a different check's run (`--only` on a `setup: 'rich'` row never runs the
   cold-load evaluate that would otherwise report them -- see `smoke.mjs`'s
   `browserChecks`). Waits for `.card` rather than `.today-game` (`reloadWithRecord`
   below) because `SEED` boots straight onto the games view, not Today. */
export async function goSeed(c, origin) {
  await evalIn(c, `(() => {
    localStorage.removeItem('benchcard.v6');
    localStorage.removeItem('benchcard.v6.bak');
    localStorage.setItem('benchcard.v3', ${JSON.stringify(JSON.stringify(SEED))});
  })()`);
  const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
  await c.send('Page.navigate', { url: origin + '/index.html' });
  await loaded;
  await evalIn(c, `(async () => { await document.fonts.ready;
    for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
    await ${SETTLE}; })()`);
}

/* Swap in `record` and reload, the way the #23 checks below need to: a
   cache-busted URL first forces a genuinely new navigation, which is what
   actually truncates any forward session-history entries left dangling by a
   previous reload-then-back — `Page.navigate` to the exact URL already
   loaded does not. The plain URL right behind it restores the real address,
   so `location.href` comparisons against it stay honest. Waits for
   `.today-game` rather than `.card` (`goRich` above) because every #23 check
   reloads onto Today, never straight onto a game. */
export async function reloadWithRecord(c, origin, record) {
  await evalIn(c, `(() => {
    localStorage.removeItem('benchcard.v3');
    localStorage.removeItem('benchcard.v6.bak');
    localStorage.setItem('benchcard.v6', ${JSON.stringify(JSON.stringify(record))});
  })()`);
  for (const url of [`${origin}/index.html?_smoke=${Date.now()}`, `${origin}/index.html`]) {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url });
    await loaded;
  }
  await evalIn(c, `(async () => { await document.fonts.ready;
    for (let i = 0; i < 60 && !document.querySelector('.today-game'); i++) await new Promise(r => setTimeout(r, 50));
    await ${SETTLE}; })()`);
}

/* ---------- FOUR (#26) ----------
 *
 * `RICH`'s team, twelve players (the eleven above plus `p11`, "Kai Moreau"),
 * booted straight onto Today with four games -- the fixture `docs/specs/
 * 26-game-passes.md`'s "What would settle it" table names, verbatim:
 *
 *   0 Panthers  9:00  balanced, everyone in, no rules,        useCarryover false
 *   1 Ravens   11:30  balanced, p11 out, a pair (p0+p1) and    useCarryover true
 *              a starting five (p0-p4)
 *   2 (none)    2:00  closers, everyone in, no rules,          useCarryover false
 *   3 Owls     (none) balanced, everyone in, a min of 40 for   useCarryover false
 *              p0 at 4x8 -- more than the game holds, so this
 *              one plan is blocked ("Needs a fix")
 *
 * Each game omits `constraints` unless the table names a rule for it --
 * `sanitizeTeam` fills in `emptyConstraints()` either way, so a bare game
 * really does carry zero rules rather than this file re-typing the default
 * shape four times. Season and player tiers are `RICH`'s own, untouched:
 * nothing in item 1-11 reads either, and reusing them (rather than a second
 * copy) is one less place the two fixtures could quietly disagree about what
 * a "rich" record looks like. */
export const FOUR = (() => {
  const record = JSON.parse(JSON.stringify(RICH));
  const team = record.teams[0];
  team.players.push({ id: 'p11', name: 'Kai Moreau', number: '10', shortName: '', tier: 3 });
  team.day.games = [
    { id: 'g0', label: 'Panthers', when: '9:00', periods: 4, periodMinutes: 8,
      granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', useCarryover: false, seed: 1111 },
    { id: 'g1', label: 'Ravens', when: '11:30', periods: 4, periodMinutes: 8,
      granMode: 'everyN', granValue: 4, out: ['p11'], strategy: 'balanced', useCarryover: true, seed: 2222,
      constraints: { pairs: [['p0', 'p1']], openingFive: ['p0', 'p1', 'p2', 'p3', 'p4'] } },
    { id: 'g2', label: '', when: '2:00', periods: 4, periodMinutes: 8,
      granMode: 'everyN', granValue: 4, out: [], strategy: 'closers', useCarryover: false, seed: 3333 },
    { id: 'g3', label: 'Owls', when: '', periods: 4, periodMinutes: 8,
      granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', useCarryover: false, seed: 4444,
      constraints: { minMinutes: { p0: 40 } } },
  ];
  team.activeGame = 0;
  record.view = 'today';
  return record;
})();

/* #34 decision 14: RICH with BOTH of its games mid-play, so the resume bar's
   own pick between them (`resumeBarAt`, card.js) is actually falsifiable --
   a fixture with only one part-played game cannot tell "picks the game
   that's underway" apart from "picks the LATER one", which is what AC1 asks.
   `games[1].label` is swapped for a long real name rather than "Ravens": the
   spec's own acceptance value for AC1 is this exact string, and a short
   fixture name would still pass while leaving the wrap case (AC5, the 320px
   shot) unexercised by every other row that reloads this same record. */
export function partPlayed(record = RICH) {
  const withLive = JSON.parse(JSON.stringify(record));
  const games = withLive.teams[0].day.games;
  games[0].live = { at: 2, overrides: {} };
  games[1].live = { at: 3, overrides: {} };
  games[1].label = 'Northwest Valley Thunderbirds';
  return withLive;
}

/* A clone of `record` with a second team ("JV Ravens", a copy of the first)
   pushed on -- RICH ships with one, and the #23 checks below need two before
   the team menu's "switch team" and checkmark mean anything. `id` gets a
   fresh value because sanitizeTeam trusts it for dedup. */
export function withSecondTeam(record) {
  const withTwo = JSON.parse(JSON.stringify(record));
  const second = JSON.parse(JSON.stringify(withTwo.teams[0]));
  second.id = 't1';
  second.name = 'JV Ravens';
  withTwo.teams.push(second);
  return withTwo;
}
