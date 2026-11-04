/* #597: each WebKit row's verdict, as a pure function of facts the check read
 * off the page. A function returns the list of problems; an empty list is a
 * pass. A fact that says "nothing was found to measure" is a problem, not a
 * pass (/new-guard 2a). No browser here, so `test/webkit.test.js` runs them. */

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* A print from a browser tab: one `window.print()`, from the game screen. */
export function printProblems({ found, prints, views }) {
  if (!found) return ['no button labelled "Print card for Ravens" on Today, so nothing was pressed'];
  const out = [];
  if (prints.length !== 1) out.push(`window.print() was called ${plural(prints.length, 'time')}, want 1`);
  else if (views[0] !== 'view-games') out.push(`window.print() was called from ${views[0]}, want view-games (the game screen)`);
  return out;
}

/* The Home Screen app: Print shares one PNG and never calls `window.print()`.
 * `where` names the button's place for the message. */
export function homeScreenProblems({ where, found, shares, prints }) {
  if (!found) return [`${where}: no .today-print / #print button was found, so nothing was pressed`];
  const out = [];
  if (shares.length !== 1) out.push(`${where}: shared ${plural(shares.length, 'image')}, want 1`);
  else {
    const [s] = shares;
    if (JSON.stringify(s.files) !== '["benchcard-ravens.png"]') out.push(`${where}: shared ${JSON.stringify(s.files)}, want ["benchcard-ravens.png"]`);
    if (JSON.stringify(s.types) !== '["image/png"]') out.push(`${where}: shared type ${JSON.stringify(s.types)}, want ["image/png"]`);
  }
  if (prints.length) out.push(`${where}: called window.print() ${plural(prints.length, 'time')}, want 0 (it does nothing in the Home Screen app)`);
  return out;
}

const FALLBACK_TOASTS = [/^Card copied\./, /^Card saved as a PNG\./];

/* Share image in a browser tab, on WebKit's own navigator: it reached
 * `navigator.share`, or it showed one of the two quiet fallbacks' toasts. */
export function shareImageProblems({ found, shares, toasts }) {
  if (!found) return ['no #shareCard button was found, so nothing was pressed'];
  const reached = shares.length > 0 || toasts.some(t => FALLBACK_TOASTS.some(re => re.test(t)));
  return reached ? [] : [`Share image did neither: it reached navigator.share ${plural(shares.length, 'time')} and toasted ${JSON.stringify(toasts)}, want a share, "Card copied..." or "Card saved as a PNG."`];
}

/* Bench mode's scroll bars. Two arms: every scroller's computed
 * `scrollbar-width` is `none` (the #549 class: no rule hides the bar), and,
 * where this WebKit draws classic bars (a control scroller takes > 0px), each
 * scroller takes 0px. Where the control measures 0px the bars are overlays and
 * the width arm cannot tell hidden from drawn, so it is skipped, with the
 * reason. The #551 bug itself (iOS ignoring `::-webkit-scrollbar` under
 * `-webkit-overflow-scrolling: touch`) cannot be reproduced in desktop WebKit. */
export function benchProblems({ scrollers, controlGutter }) {
  if (!scrollers.length) return { problems: ['no scroller was found inside .gm, so no scroll bar was measured'], widthArm: 'skipped', reason: 'nothing to measure' };
  const problems = [];
  for (const s of scrollers) {
    if (s.scrollbarWidth !== 'none') problems.push(`${s.el}: computed scrollbar-width is "${s.scrollbarWidth}", want "none"`);
  }
  const classic = controlGutter > 0;
  if (classic) {
    for (const s of scrollers) if (s.gutter > 0) problems.push(`${s.el}: its scroll bar takes ${s.gutter}px, want 0px`);
  }
  return {
    problems,
    widthArm: classic ? 'checked' : 'skipped',
    reason: classic ? null : 'this WebKit draws overlay scroll bars (a control scroller takes 0px), so a 0px width proves nothing',
  };
}

/* Add a game: Today to the flow to a closed flow, one more game labelled
 * Panthers, and Today showing a pass for every game, the last one Panthers. */
export function addGameProblems({ closed, before, after, passes }) {
  if (!before.length) return ['the day held no games before the flow, so the check measured nothing'];
  const out = [];
  if (!closed) out.push('the Add a game flow is still open after "Add game"');
  if (after.length !== before.length + 1) out.push(`the day holds ${plural(after.length, 'game')}, want ${before.length + 1}`);
  const panthers = n => n.filter(l => l === 'Panthers').length;
  if (panthers(after) - panthers(before) !== 1) out.push(`the day holds ${panthers(after)} game(s) labelled Panthers, want one more than the ${panthers(before)} before`);
  if (passes.length !== after.length) out.push(`Today shows ${plural(passes.length, 'pass')} for ${plural(after.length, 'game')}`);
  else if (!passes.at(-1)?.includes('Panthers')) out.push(`Today's last pass reads "${passes.at(-1)}", want it to be Panthers`);
  return out;
}

/* Today at large text (#611), one cell per width: each is `{ width, passTitles,
 * unexcused }`, the count of `.pass-title` found and the described findings
 * `knownIssueFor` did not excuse, top and bottom together. A cell that found
 * no `.pass-title` measured nothing, and so does a run with no cells. */
export function largeTextProblems({ cells }) {
  if (!cells.length) return ['no cell was measured, so nothing was checked'];
  const out = [];
  for (const { width, passTitles, unexcused } of cells) {
    if (!passTitles) out.push(`${width}px: no .pass-title was found on Today, so no game title was measured`);
    for (const f of unexcused) out.push(`${width}px: ${f}`);
  }
  return out;
}

export const rowOf = (name, problems, detail) =>
  problems.length ? { name, status: 'FAIL', detail: problems.join('; ') } : { name, status: 'PASS', detail };

export function tableOf(rows) {
  const w = Math.max(...rows.map(r => r.name.length), 0);
  return rows.map(r => `${r.status.padEnd(4)}  ${r.name.padEnd(w)}  ${r.detail}`).join('\n');
}

/* Non-zero on any FAIL, and on a run with no rows: nothing measured. */
export const exitCodeOf = rows => (rows.length && rows.every(r => r.status !== 'FAIL') ? 0 : 1);

/* One row, with its own time limit. A check that throws (a CDP method WebKit
 * has no meaning for, a selector that never appeared) or never answers is a
 * FAIL row, not a crash and not a hang. */
export async function runRow(name, fn, ms) {
  let timer;
  const hung = new Promise((_, no) => { timer = setTimeout(() => no(new Error(`no answer in ${ms} ms`)), ms); });
  try {
    return await Promise.race([fn(), hung]);
  } catch (e) {
    return { name, status: 'FAIL', detail: e.message.startsWith('no answer') ? e.message : `threw: ${e.message}` };
  } finally {
    clearTimeout(timer);
  }
}
