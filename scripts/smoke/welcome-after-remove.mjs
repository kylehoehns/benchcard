/* #224: remove the only team in Settings and the app returns to the welcome
 * screen -- and the demo under its three tabs has to be there, the same as on
 * a fresh start. It used to be built once, at boot, only when there was no
 * team; removing the last team set `onboarded = false` and showed the screen
 * with nothing built under it. Driven through the real Settings button and the
 * real confirm dialog, then read back off the page. Expected values are the
 * issue's own: rows with their cells, a caption, the card figure, the bench
 * drawing, and each tab showing its own pane. */
import { evalIn } from './dom.mjs';
import { land } from './page-state.mjs';
import { evalJSON, settle, tap } from './sheet-drive.mjs';
import { RICH } from './fixtures.mjs';

const PANES = [['#welTabPlan', '#welPanePlan'], ['#welTabPaper', '#welPanePaper'], ['#welTabScreen', '#welPaneScreen']];

const look = c => evalJSON(c, `JSON.stringify({
  welcomeShown: document.getElementById('view-welcome')?.hidden === false,
  rows: document.querySelectorAll('#welRows .wel-row').length,
  cellsInFirstRow: document.querySelector('#welRows .wel-row')?.querySelectorAll('.wel-c').length ?? 0,
  cap: (document.getElementById('welCap')?.textContent || '').trim(),
  shot: !!document.querySelector('#welPanePaper img.wel-shot'),
  bench: !!document.querySelector('#welPaneScreen .wel-bench'),
  planShown: document.getElementById('welPanePlan')?.hidden === false,
})`);

export async function welcomeAfterRemovePass(c, origin) {
  const problems = [];
  try {
    await land(c, origin, { record: RICH });
    await tap(c, `document.querySelector('#settingsBtn').click()`);
    await tap(c, `document.querySelector('#removeTeam').click()`);
    await tap(c, `document.querySelector('#confirmYes').click()`);
    await evalIn(c, `(async () => {
      for (let i = 0; i < 60 && document.getElementById('view-welcome')?.hidden !== false; i++) await new Promise(r => setTimeout(r, 50));
    })()`);
    await settle(c);

    const s = await look(c);
    if (!s.welcomeShown) problems.push('removing the only team did not land on #view-welcome');
    if (s.rows === 0) problems.push('#welRows has no rows after removing the last team, want one per demo player');
    if (s.rows > 0 && s.cellsInFirstRow === 0) problems.push('#welRows rows have no .wel-c cells');
    if (!s.cap) problems.push('#welCap is empty after removing the last team');
    if (!s.shot) problems.push('#welPanePaper has no img.wel-shot after removing the last team');
    if (!s.bench) problems.push('#welPaneScreen has no .wel-bench after removing the last team');
    if (!s.planShown) problems.push('the Plan tab is not the one showing after removing the last team');

    for (const [tab, pane] of PANES) {
      await tap(c, `document.querySelector('${tab}').click()`);
      const shown = await evalJSON(c, `JSON.stringify(${JSON.stringify(PANES.map(p => p[1]))}.map(p => document.querySelector(p)?.hidden === false))`);
      const want = PANES.map(p => p[1] === pane);
      if (JSON.stringify(shown) !== JSON.stringify(want)) {
        problems.push(`clicking ${tab} shows panes ${JSON.stringify(shown)} (plan, paper, screen), want ${JSON.stringify(want)}`);
      }
    }
  } catch (e) {
    problems.push(String(e && e.message || e));
  }
  return { pass: problems.length === 0, detail: problems.length ? problems.join('; ') : 'demo rebuilt after removing the last team' };
}
