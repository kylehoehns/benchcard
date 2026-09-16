/* The fixtures the browser passes drive: a lean SEED for the cold-load
   measurement and a RICH record for everything else. Moved out of
   `smoke.mjs` unchanged. */
import { evalIn, SETTLE } from './dom.mjs';

/* ---------- the roster the harness plans with ---------- */

/* 11 players at 4×8 with subs every 4 minutes: the realistic case the rules
   ask every check to use, not a three-kid toy. Written straight to the storage
   key so the app boots with a plan already on screen — `sanitize` fills in
   every field left out here. */
const PLAYERS = [
  ['Marcus Williams', '4'], ['Devon Ellis', '7'], ['Hana Kim', '9'], ['Eli Tran', '12'],
  ['Ana Reyes', '3'], ['Jordan Bell', '21'], ['Sam Okafor', '5'], ['Riley Novak', '8'],
  ['Casey Lindqvist', '11'], ['Theo Alvarez', '15'], ['Nia Brooks', '2'],
].map(([name, number], i) => ({ id: 'p' + i, name, number, shortName: '' }));

export const UI = {
  // cardOpen: below 1100px the card preview is folded behind a disclosure by
  // default, and a folded card measures 0×0 -- the size check would be
  // guarding nothing. Opened here so the check sees a laid-out card, which is
  // the state it exists to police.
  copies: 2, showMinutes: true, printScope: 'game', cardId: 'short',
  cardSize: 'pocket', theme: 'light', cardOpen: true,
};

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
    players: PLAYERS.map(p => ({
      ...p,
      tier: p.id === 'p2' ? 5 : p.id === 'p10' ? 1 : 3,
    })),
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
export async function goRich(c, origin) {
  await evalIn(c, `(() => {
    localStorage.removeItem('benchcard.v3');
    localStorage.removeItem('benchcard.v6.bak');
    localStorage.setItem('benchcard.v6', ${JSON.stringify(JSON.stringify(RICH))});
    return 1;
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
