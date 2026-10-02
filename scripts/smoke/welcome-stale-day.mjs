/* #252 (docs/specs/252-welcome-day-over-toast.md, Proof row E): a coach with
 * no team never hears about days ending, and the first game they set up is
 * dated the day they set it up. Seeds the record Remove-last-team leaves
 * behind -- not onboarded, one empty team whose one day is dated the day
 * before the smoke clock (2026-09-12, so 2026-09-11) -- loads it, then runs
 * the real first-run flow and reloads. The dates and the words are the
 * spec's own: no toast on the welcome screen, then "Today" on the game's day
 * heading and no "is over" toast after the reload. The harness resets before the next row. */
import { land } from './page-state.mjs';
import { evalJSON, realTap, settle, typeIn } from './sheet-drive.mjs';
import { RICH } from './fixtures.mjs';

const YESTERDAY = '2026-09-11'; // the smoke clock is pinned to 2026-09-12 (clock.mjs)

const STALE_WELCOME = {
  ...RICH,
  onboarded: false,
  view: 'today',
  teams: [{
    id: 't0', name: '', players: [],
    days: [{ name: '', date: YESTERDAY, games: [
      { id: 'g0', label: '', tipoff: '', periods: 4, periodMinutes: 8, granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1 },
    ] }],
    activeDay: 0, activeGame: 0, season: { games: [] },
  }],
};

const WELCOME = `document.getElementById('view-welcome') && !document.getElementById('view-welcome').hidden`;

const toasts = c => evalJSON(c, `JSON.stringify(
  [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.trim()))`);

export async function welcomeStaleDayPass(c, origin) {
  const problems = [];
  try {
    await land(c, origin, { record: STALE_WELCOME, ready: WELCOME });
    const onWelcome = await evalJSON(c, `JSON.stringify(${WELCOME})`);
    if (!onWelcome) problems.push('a not-onboarded record did not land on the welcome screen');
    const before = await toasts(c);
    if (before.length) problems.push(`the welcome screen shows a toast: ${JSON.stringify(before)}`);

    await realTap(c, '#welStart');
    await typeIn(c, '#frRoster', '12 Maya Webb\n4 Eli Tran\nDevon Ellis\n3 Nia Bell\n15 Caleb Ruiz');
    await realTap(c, '#frNext'); // step 1 -> 2
    await realTap(c, '#frNext'); // step 2 -> 3, commits the team
    await realTap(c, '#frNext'); // step 3: Go to the game
    await settle(c);

    await land(c, origin, { record: 'kept' });
    const after = await evalJSON(c, `JSON.stringify({
      sub: (document.getElementById('gameSub')?.textContent || '').trim(),
      toasts: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.trim()),
    })`);
    if (!after.sub.startsWith('Today')) problems.push(`the game's day heading reads "${after.sub}", want it to start with "Today"`);
    if (after.toasts.some(t => /is over/.test(t))) problems.push(`an "is over" toast showed after the reload: ${JSON.stringify(after.toasts)}`);
  } catch (e) {
    problems.push(String(e && e.message || e));
  } finally {
    await land(c, origin); // back to RICH for the next row
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ')
      : 'a stale not-onboarded record shows the welcome screen with no toast; after the first-run flow and a reload the day reads Today with no "is over" toast',
  };
}
