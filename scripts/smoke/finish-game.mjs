/* #135, "What would settle it" items 1-5, 7, 9 and 10: closing on the last
 * stint, resuming there, the Finish game button's own look and no-op edges,
 * tapping it, the Finished dot's color, the Undo toast it offers, and a
 * finished game staying finished (with no way back in) once it is reopened.
 * Items 6, 8, 11-13 are proved elsewhere (contrast.test.js, live.test.js /
 * pass-status.test.js / resume-bar.test.js, storage.test.js / backup.test.js,
 * live-guard.test.js / gamemode-open.test.js, app-large-text.mjs) per the
 * spec's own Proof table -- nothing here repeats them.
 *
 * A game's last stint and its "where" label are read off the page's own
 * plan and `fmtClock` (engine.js) -- the same generic clock formatter
 * `resumeAt` itself calls, never a copy of `resumeAt`'s own decision logic
 * (stage/finished/at) -- so a clamping or stage bug here still fails this
 * check rather than being hidden by a value computed the same wrong way.
 */
import { evalIn, step, TODAY_HOME, PASS_STATUS_DOT_PROBE, CSS_VAR_COLOR_PROBE } from './dom.mjs';
import { RICH, reloadWithRecord, goRich } from './fixtures.mjs';

// The last stint's own "<periodName> <clock>" label, straight off the page's
// plan for game 0 -- not a second copy of `resumeAt`'s formula, just the
// generic formatter it also calls.
const LAST_STINT_WHERE = `(async () => {
  const { plans } = await import('/state.js');
  const { fmtClock } = await import('/engine.js');
  const p = plans[0];
  const row = p.stints[p.stints.length - 1];
  return (row.periodName || 'Q' + row.period) + ' ' + fmtClock(row.startSec);
})()`;

const passRead = `(() => {
  const btn = document.querySelectorAll('#todayGames .today-game')[0];
  const statusEl = btn ? btn.querySelector('.pass-status') : null;
  return JSON.stringify({
    status: statusEl ? statusEl.textContent : null,
    cls: statusEl ? [...statusEl.classList].find(c => c !== 'pass-status') ?? null : null,
    ariaLabel: btn ? btn.getAttribute('aria-label') : null,
  });
})()`;

const liveRead = `JSON.stringify(JSON.parse(localStorage.getItem('benchcard.v7')).teams[0].days[0].games[0].live)`;

const benchState = `(() => JSON.stringify({
  gmHidden: document.getElementById('gamemode')?.hidden,
  gmGame: document.getElementById('gmGame')?.textContent || '',
  next2Hidden: document.getElementById('gmNext2')?.hidden,
  next2Disabled: document.getElementById('gmNext2')?.disabled,
  finishHidden: document.getElementById('gmFinish')?.hidden,
}))()`;

const stepToLastStint = step(`
  while (!document.getElementById('gmNext2').disabled) document.getElementById('gmNext2').click();
`);

export async function finishGamePass(c, origin) {
  const problems = [];
  const notes = [];

  try {
    await reloadWithRecord(c, origin, { ...RICH, view: 'today' });
    const where = await evalIn(c, LAST_STINT_WHERE);

    /* ---- open Hawks, item 3's "every earlier stint" ---- */
    await evalIn(c, step(`document.querySelectorAll('#todayGames .today-game')[0].click()`));
    await evalIn(c, step(`document.getElementById('abBench').click()`));
    const opened = JSON.parse(await evalIn(c, benchState));
    if (opened.gmHidden !== false) problems.push('#abBench did not open bench mode');
    if (opened.finishHidden !== true) problems.push('item 3: #gmFinish is showing on stint 1, want hidden');
    if (opened.next2Hidden !== false) problems.push('item 3: #gmNext2 is hidden on stint 1, want showing');

    /* ---- step to the last stint; item 3's Finish-button checks ---- */
    await evalIn(c, stepToLastStint);
    const last = JSON.parse(await evalIn(c, benchState));
    if (!/stint (\d+) of \1/.test(last.gmGame)) {
      problems.push(`item 3: stepping did not reach the last stint (#gmGame reads ${JSON.stringify(last.gmGame)})`);
    }
    if (last.finishHidden !== false) problems.push('item 3: #gmFinish is hidden on the last stint, want showing');
    if (last.next2Hidden !== true) problems.push('item 3: #gmNext2 is not hidden on the last stint');
    if (last.next2Disabled !== true) problems.push('item 3: #gmNext2 is not disabled on the last stint');

    const finishBox = JSON.parse(await evalIn(c, `(() => {
      const b = document.getElementById('gmFinish');
      const r = b.getBoundingClientRect();
      return JSON.stringify({ text: b.textContent, h: r.height });
    })()`));
    if (finishBox.text !== 'Finish game') {
      problems.push(`item 3: #gmFinish reads ${JSON.stringify(finishBox.text)}, want "Finish game"`);
    }
    if (finishBox.h < 48) problems.push(`item 3: #gmFinish is ${Math.round(finishBox.h)}px tall, want at least 48px`);

    /* ---- item 3: a left swipe and ArrowRight on the last stint are no-ops ---- */
    await evalIn(c, step(`
      const body = document.querySelector('.gm-body');
      const r = body.getBoundingClientRect();
      const y = r.top + r.height / 2;
      body.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.right - 20, clientY: y, bubbles: true, button: 0 }));
      dispatchEvent(new PointerEvent('pointermove', { clientX: r.right - 110, clientY: y, bubbles: true }));
      dispatchEvent(new PointerEvent('pointerup', { clientX: r.right - 110, clientY: y, bubbles: true }));
    `));
    const afterSwipe = JSON.parse(await evalIn(c, benchState));
    if (afterSwipe.gmHidden !== false || afterSwipe.gmGame !== last.gmGame) {
      problems.push(`item 3: a left swipe changed the last stint (now ${JSON.stringify(afterSwipe.gmGame)}, `
        + `bench mode hidden ${afterSwipe.gmHidden})`);
    }
    await evalIn(c, step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))`));
    const afterArrow = JSON.parse(await evalIn(c, benchState));
    if (afterArrow.gmHidden !== false || afterArrow.gmGame !== last.gmGame) {
      problems.push(`item 3: ArrowRight changed the last stint (now ${JSON.stringify(afterArrow.gmGame)}, `
        + `bench mode hidden ${afterArrow.gmHidden})`);
    }
    const liveAfterNoop = JSON.parse(await evalIn(c, liveRead));
    if ('finished' in liveAfterNoop) problems.push('item 3: live.finished is present after a swipe/ArrowRight that should have done nothing');
    notes.push('item 3: Finish game shows only on the last stint, ≥48px, reads "Finish game"; swipe/ArrowRight there are no-ops');

    /* ---- item 1: close on the last stint, Today reads Underway ---- */
    await evalIn(c, step(`document.getElementById('gmClose').click()`));
    await evalIn(c, step(TODAY_HOME));
    const s1 = JSON.parse(await evalIn(c, passRead));
    if (s1.status !== 'Underway' || s1.cls !== 'now') {
      problems.push(`item 1: Hawks' pass reads ${JSON.stringify(s1.status)}/${s1.cls}, want Underway/now`);
    }
    const bar1 = JSON.parse(await evalIn(c, `(() => {
      const bar = document.getElementById('resumeBar');
      const btn = document.getElementById('resumeBtn');
      return JSON.stringify({ hidden: bar ? bar.hidden : null, label: btn ? (btn.querySelector('.ab-lab')?.textContent ?? null) : null });
    })()`));
    const wantBarLabel = `Hawks · ${where} · Resume`;
    if (bar1.hidden !== false) problems.push('item 1: #resumeBar is hidden after closing on the last stint');
    else if (bar1.label !== wantBarLabel) problems.push(`item 1: #resumeBtn reads ${JSON.stringify(bar1.label)}, want ${JSON.stringify(wantBarLabel)}`);
    const openLabels = JSON.parse(await evalIn(c, `(() => JSON.stringify({
      gmOpen: document.getElementById('gmOpen')?.querySelector('.ab-lab')?.textContent ?? null,
      abBench: document.getElementById('abBench')?.querySelector('.ab-lab')?.textContent ?? null,
    }))()`));
    const wantOpenLabel = `Resume · ${where}`;
    if (openLabels.gmOpen !== wantOpenLabel) problems.push(`item 1: #gmOpen reads ${JSON.stringify(openLabels.gmOpen)}, want ${JSON.stringify(wantOpenLabel)}`);
    if (openLabels.abBench !== wantOpenLabel) problems.push(`item 1: #abBench reads ${JSON.stringify(openLabels.abBench)}, want ${JSON.stringify(wantOpenLabel)}`);
    const live1 = JSON.parse(await evalIn(c, liveRead));
    if ('finished' in live1) problems.push('item 1: live.finished is present after closing on the last stint, want absent');
    notes.push(`item 1: Underway, #resumeBar and #gmOpen/#abBench read "${wantBarLabel}"/"${wantOpenLabel}"`);

    /* ---- item 2: resume opens on the last stint ---- */
    await evalIn(c, step(`document.getElementById('resumeBtn').click()`));
    const resumed = JSON.parse(await evalIn(c, benchState));
    if (!/stint (\d+) of \1/.test(resumed.gmGame)) {
      problems.push(`item 2: resuming did not reopen on the last stint (#gmGame reads ${JSON.stringify(resumed.gmGame)})`);
    }
    if (resumed.finishHidden !== false) problems.push('item 2: #gmFinish is not showing once resumed on the last stint');
    notes.push('item 2: resume opens straight on the last stint, with #gmFinish showing');

    /* ---- item 7 (decision 3): force the tip's threshold so its deferral is
       a real test, not a check that never had anything to defer -- `uses`
       just has to clear USES_BEFORE_ASKING (3); `nudgeInstall`'s own gate
       (`installEligible`) never opens in headless Chrome (no
       `beforeinstallprompt`, not iOS), so only the tip path actually fires. */
    await evalIn(c, `(async () => { const { state, save } = await import('/state.js'); state.ui.prints = 5; save(); })()`);

    /* ---- item 4: tap Finish game ---- */
    await evalIn(c, step(`document.getElementById('gmFinish').click()`));
    const afterFinish = JSON.parse(await evalIn(c, `(async () => {
      const { benchOpen } = await import('/state.js');
      return JSON.stringify({ gmHidden: document.getElementById('gamemode')?.hidden, benchOpen: benchOpen() });
    })()`));
    if (afterFinish.gmHidden !== true || afterFinish.benchOpen !== false) {
      problems.push(`item 4: bench mode did not close on Finish game (gmHidden ${afterFinish.gmHidden}, benchOpen ${afterFinish.benchOpen})`);
    }
    const s4 = JSON.parse(await evalIn(c, passRead));
    if (s4.status !== 'Finished' || s4.cls !== 'done') {
      problems.push(`item 4: Hawks' pass reads ${JSON.stringify(s4.status)}/${s4.cls}, want Finished/done`);
    }
    if (!(s4.ariaLabel || '').endsWith(', finished')) {
      problems.push(`item 4: pass aria-label is ${JSON.stringify(s4.ariaLabel)}, want it to end ", finished"`);
    }
    const barHiddenAfterFinish = await evalIn(c, `document.getElementById('resumeBar')?.hidden`);
    if (barHiddenAfterFinish !== true) problems.push('item 4: #resumeBar is still showing once the game is finished');
    const startLabels = JSON.parse(await evalIn(c, `(() => JSON.stringify({
      gmOpen: document.getElementById('gmOpen')?.querySelector('.ab-lab')?.textContent ?? null,
      abBench: document.getElementById('abBench')?.querySelector('.ab-lab')?.textContent ?? null,
    }))()`));
    if (startLabels.gmOpen !== 'Start game') problems.push(`item 4: #gmOpen reads ${JSON.stringify(startLabels.gmOpen)}, want "Start game"`);
    if (startLabels.abBench !== 'Start game') problems.push(`item 4: #abBench reads ${JSON.stringify(startLabels.abBench)}, want "Start game"`);
    const live4 = JSON.parse(await evalIn(c, liveRead));
    const lastIndex = JSON.parse(await evalIn(c, `(async () => {
      const { plans } = await import('/state.js');
      return JSON.stringify(plans[0].stints.length - 1);
    })()`));
    if (live4.finished !== true) problems.push(`item 4: live.finished is ${JSON.stringify(live4.finished)}, want true`);
    if (live4.at !== lastIndex) problems.push(`item 4: live.at is ${live4.at}, want ${lastIndex} (the last stint)`);

    await evalIn(c, step(`document.querySelectorAll('#todayGames .today-game')[0].click()`));
    const sub = await evalIn(c, `document.getElementById('gameSub')?.textContent ?? null`);
    if (!sub || !sub.includes('Finished')) problems.push(`item 4: #gameSub is ${JSON.stringify(sub)}, want it to include "Finished"`);
    await evalIn(c, step(TODAY_HOME));
    notes.push('item 4: Finish game closes bench mode, marks Hawks Finished, and #gameSub reads it too');

    /* ---- item 7: the Undo toast ---- */
    const toast = JSON.parse(await evalIn(c, `(() => {
      const t = document.querySelector('#toasts .toast[data-undo]');
      if (!t) return JSON.stringify({ shown: false });
      const r = t.getBoundingClientRect();
      const ab = document.getElementById('actionbar');
      const abHidden = !ab || ab.hidden;
      const abTop = abHidden ? null : ab.getBoundingClientRect().top;
      return JSON.stringify({
        shown: true,
        text: t.querySelector('.tmsg')?.textContent ?? null,
        hasUndo: !!t.querySelector('.tundo'),
        top: r.top, bottom: r.bottom, left: r.left, right: r.right,
        vw: document.documentElement.clientWidth, vh: window.innerHeight,
        abHidden, abTop,
      });
    })()`));
    if (!toast.shown) {
      problems.push('item 7: no Undo toast was shown after Finish game');
    } else {
      if (toast.text !== 'Marked Hawks finished.') {
        problems.push(`item 7: the toast reads ${JSON.stringify(toast.text)}, want "Marked Hawks finished."`);
      }
      if (!toast.hasUndo) problems.push('item 7: the toast has no Undo button');
      if (toast.top < 0 || toast.left < 0 || toast.bottom > toast.vh || toast.right > toast.vw) {
        problems.push(`item 7: the toast is not fully on screen (top ${Math.round(toast.top)}, bottom ${Math.round(toast.bottom)}, `
          + `left ${Math.round(toast.left)}, right ${Math.round(toast.right)}, viewport ${toast.vw}×${toast.vh})`);
      }
      if (!toast.abHidden && toast.top >= toast.abTop) {
        problems.push(`item 7: the toast (top ${Math.round(toast.top)}) is not above #actionbar (top ${Math.round(toast.abTop)})`);
      }
    }

    // Decision 3: still there 2 seconds later, whatever the tip counter says.
    await new Promise(r => setTimeout(r, 2000));
    const stillThere = await evalIn(c, `document.querySelector('#toasts .toast[data-undo] .tmsg')?.textContent ?? null`);
    if (stillThere !== 'Marked Hawks finished.') {
      problems.push(`item 7 (decision 3): 2s after Finish game the toast reads ${JSON.stringify(stillThere)}, `
        + 'want the same Undo message -- the tip must wait for it to leave');
    }

    await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));
    const afterUndo = JSON.parse(await evalIn(c, `(async () => {
      const { benchOpen } = await import('/state.js');
      return JSON.stringify({ gmHidden: document.getElementById('gamemode')?.hidden, benchOpen: benchOpen() });
    })()`));
    const s7 = JSON.parse(await evalIn(c, passRead));
    const bar7 = JSON.parse(await evalIn(c, `(() => {
      const bar = document.getElementById('resumeBar');
      const btn = document.getElementById('resumeBtn');
      return JSON.stringify({ hidden: bar ? bar.hidden : null, label: btn ? (btn.querySelector('.ab-lab')?.textContent ?? null) : null });
    })()`));
    const live7 = JSON.parse(await evalIn(c, liveRead));
    if (s7.status !== 'Underway' || s7.cls !== 'now') problems.push(`item 7: after Undo the pass reads ${JSON.stringify(s7.status)}/${s7.cls}, want Underway/now`);
    if (bar7.hidden !== false || bar7.label !== wantBarLabel) {
      problems.push(`item 7: after Undo #resumeBar reads hidden=${bar7.hidden}/${JSON.stringify(bar7.label)}, want visible with ${JSON.stringify(wantBarLabel)}`);
    }
    if ('finished' in live7) problems.push('item 7: live.finished is still present after Undo, want absent');
    if (afterUndo.gmHidden !== true || afterUndo.benchOpen !== false) problems.push('item 7: Undo reopened bench mode, want it to stay closed');
    notes.push('item 7: "Marked Hawks finished." with Undo, fully on screen, survives 2s, and Undo restores Underway');

    /* ---- items 9 and 10 need "after item 4" again -- Undo just put that
       back, so re-finish the same way (resume, then Finish game) rather
       than re-driving the whole step-through from stint 1. ---- */
    await evalIn(c, step(`document.getElementById('resumeBtn').click()`));
    await evalIn(c, step(`document.getElementById('gmFinish').click()`));

    /* ---- item 9: reopening a finished game ---- */
    await evalIn(c, step(`document.querySelectorAll('#todayGames .today-game')[0].click()`));
    await evalIn(c, step(`document.getElementById('gmOpen').click()`));
    const reopened = JSON.parse(await evalIn(c, benchState));
    if (!/stint 1 of (\d+)/.test(reopened.gmGame)) {
      problems.push(`item 9: reopening a finished game reads ${JSON.stringify(reopened.gmGame)}, want "stint 1 of N"`);
    }
    await evalIn(c, step(`document.getElementById('gmNext2').click(); document.getElementById('gmNext2').click();`));
    const atThree = await evalIn(c, `document.getElementById('gmGame')?.textContent || ''`);
    if (!/stint 3 of/.test(atThree)) problems.push(`item 9: stepping twice from stint 1 reads ${JSON.stringify(atThree)}, want "stint 3 of N"`);
    await evalIn(c, step(`document.getElementById('gmClose').click()`));
    await evalIn(c, step(TODAY_HOME));
    const s9 = JSON.parse(await evalIn(c, passRead));
    const bar9hidden = await evalIn(c, `document.getElementById('resumeBar')?.hidden`);
    const live9 = JSON.parse(await evalIn(c, liveRead));
    if (s9.status !== 'Finished' || s9.cls !== 'done') problems.push(`item 9: after reopening and stepping, the pass reads ${JSON.stringify(s9.status)}/${s9.cls}, want Finished/done`);
    if (bar9hidden !== true) problems.push('item 9: #resumeBar shows for a finished game the coach stepped through again');
    if (live9.finished !== true) problems.push(`item 9: live.finished is ${JSON.stringify(live9.finished)} after reopening, want true`);
    if (live9.at !== 2) problems.push(`item 9: live.at is ${live9.at} after stepping to stint 3, want 2`);
    notes.push('item 9: a reopened finished game reads "stint 1 of N", stepping it keeps it Finished, and live.finished survives');

    /* ---- item 10: the last stint of a reopened finished game ---- */
    await evalIn(c, step(`document.querySelectorAll('#todayGames .today-game')[0].click()`));
    await evalIn(c, step(`document.getElementById('gmOpen').click()`));
    await evalIn(c, stepToLastStint);
    const last10 = JSON.parse(await evalIn(c, benchState));
    if (last10.finishHidden !== true) problems.push('item 10: #gmFinish shows on the last stint of a reopened finished game, want hidden');
    if (last10.next2Hidden !== false) problems.push('item 10: #gmNext2 is hidden on the last stint of a reopened finished game, want showing (disabled)');
    if (last10.next2Disabled !== true) problems.push('item 10: #gmNext2 is not disabled on the last stint of a reopened finished game');
    await evalIn(c, step(`document.getElementById('gmClose').click()`));
    await evalIn(c, step(TODAY_HOME));
    notes.push('item 10: the last stint of a reopened finished game keeps the plain disabled Next, no way to un-finish');

    /* ---- item 5: the Finished dot is --info, light and dark ---- */
    const dotsLight = JSON.parse(await evalIn(c, `(() => {
      const probe = ${PASS_STATUS_DOT_PROBE};
      const cssVar = ${CSS_VAR_COLOR_PROBE};
      return JSON.stringify({ done: probe('done'), info: cssVar('var(--info)') });
    })()`));
    if (dotsLight.done !== dotsLight.info) problems.push(`item 5 (light): .pass-status.done's dot is ${dotsLight.done}, want --info (${dotsLight.info})`);

    await goRich(c, origin, { theme: 'dark' });
    const dotsDark = JSON.parse(await evalIn(c, `(() => {
      const probe = ${PASS_STATUS_DOT_PROBE};
      const cssVar = ${CSS_VAR_COLOR_PROBE};
      return JSON.stringify({ done: probe('done'), info: cssVar('var(--info)') });
    })()`));
    if (dotsDark.done !== dotsDark.info) problems.push(`item 5 (dark): .pass-status.done's dot is ${dotsDark.done}, want --info (${dotsDark.info})`);
    notes.push('item 5: the Finished dot paints --info in both light and dark');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    // Same courtesy every other check that mutates RICH pays: leave the
    // fixture the way the row after this one expects to find it.
    await goRich(c, origin).catch(() => {});
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ''}`
      : notes.join('; '),
  };
}
