import { evalIn, step, SETTLE } from './dom.mjs';
import { RICH, withSecondTeam, reloadWithRecord } from './fixtures.mjs';
import { nameOf } from './registry.mjs';

/* #25 item 4 and item 7, together: with Royal active, the K1 controls read
 * the tint and nothing else on screen does; switching team changes them in
 * the same task, with no reload.
 *
 * Expected colours are the spec's own table (docs/specs/25-team-colour.md,
 * item 2), typed once here as `rgb()` strings -- never `tokens-css.mjs`'s
 * `contrast()` or any other route the app itself computes them through, so a
 * bug that reaches both the app and the computation this check trusted would
 * still be caught. Royal's light fill is `#2450D6` = rgb(36, 80, 214);
 * Royal's light label is white, per the ticket's survey ("every other light
 * fill clears 4.5:1 with a white label" -- Royal is not Hardwood or Gold);
 * Graphite's light fill is `#1C1C1E` = rgb(28, 28, 30), the value the
 * `--accent`-reading items of the "unchanged" list keep, because `--accent`
 * stays pinned to `--ink` (graphite-tokens.test.js, item 10).
 *
 * Two of the "unchanged" items below (`#setTeamHd`, the back button) do not
 * read `--accent` at all -- they are secondary ink, a different neutral
 * token the spec gives no literal for -- so proving them unchanged means
 * comparing the SAME element's colour before and after the team switch
 * below, not a hand-typed literal: a value this file invented would be a
 * recomputation, not a fact the spec states.
 *
 * `getComputedStyle` resolves colour custom properties through the cascade
 * regardless of `[hidden]` / `display: none` -- confirmed against this app's
 * own overlay states -- so every element below is read straight off the
 * static markup, with no dialog opened and no game-mode entry needed. That
 * keeps the check to one reload plus one team switch, not a tour through
 * every overlay item 4 names.
 */
const ROYAL_FILL = 'rgb(36, 80, 214)';
const ROYAL_LABEL = 'rgb(255, 255, 255)';
const GRAPHITE_INK = 'rgb(28, 28, 30)';

const READ_COLOURS = `(() => {
  const $ = s => document.querySelector(s);
  const bg = s => { const e = $(s); return e ? getComputedStyle(e).backgroundColor : null; };
  const fg = s => { const e = $(s); return e ? getComputedStyle(e).color : null; };
  return JSON.stringify({
    primaryBg: bg('.btn.primary'), primaryFg: fg('.btn.primary'),
    abMainBg: bg('#abBench'), gmNavNextBg: bg('#gmNext2'),
    segOnFg: fg('#maxSubsSeg button.on'), switchBg: bg('#showMinutes'),
    helpHFg: fg('.help-h'), teamCheckFg: fg('.teammenu-check'),
    setTeamHdFg: fg('#setTeamHd'), backBtnFg: fg('#backBtn'),
  });
})()`;

export async function teamColourPass(c, origin) {
  const problems = [];
  try {
    const base = JSON.parse(JSON.stringify(RICH));
    base.view = 'today';
    base.teams[0].settings = { colour: 'royal' };
    const record = withSecondTeam(base);
    record.teams[1].settings = { colour: 'graphite' };
    await reloadWithRecord(c, origin, record);

    const r = JSON.parse(await evalIn(c, READ_COLOURS));

    const tinted = [
      ['.btn.primary background', r.primaryBg, ROYAL_FILL],
      ['.btn.primary label', r.primaryFg, ROYAL_LABEL],
      ['.ab-main (#abBench) background', r.abMainBg, ROYAL_FILL],
      ['.gm-nav.next (#gmNext2) background', r.gmNavNextBg, ROYAL_FILL],
      ['.seg button.on (#maxSubsSeg) text', r.segOnFg, ROYAL_FILL],
      ['.switch input:checked (#showMinutes) background', r.switchBg, ROYAL_FILL],
    ];
    for (const [label, got, want] of tinted) {
      if (got !== want) problems.push(`${label} is ${got} with Royal active, want ${want}`);
    }

    const accentInk = [['.help-h', r.helpHFg], ['.teammenu-check', r.teamCheckFg]];
    for (const [label, got] of accentInk) {
      if (got !== GRAPHITE_INK) problems.push(`${label} is ${got} with Royal active, want ${GRAPHITE_INK} (unchanged)`);
    }

    // item 7: switching team (team menu's second entry, the Graphite one)
    // changes `.btn.primary` in the same task, with no reload. Re-read
    // everything, both to check the switch and to prove `#setTeamHd`/the
    // back button (a token the spec gives no literal for) are the same
    // colour on the Graphite team as they were on Royal.
    await evalIn(c, step(`document.querySelectorAll('#teamMenu .teammenu-item')[1]?.click()`));
    const a = JSON.parse(await evalIn(c, READ_COLOURS));
    if (a.primaryBg !== GRAPHITE_INK) {
      problems.push(`.btn.primary background is ${a.primaryBg} after switching to the Graphite team, `
        + `want ${GRAPHITE_INK} — no reload happened in between`);
    }
    const invariant = [
      ['#setTeamHd', r.setTeamHdFg, a.setTeamHdFg], ['back button (#backBtn)', r.backBtnFg, a.backBtnFg],
    ];
    for (const [label, before, afterVal] of invariant) {
      if (before !== afterVal) {
        problems.push(`${label} is ${before} with Royal active and ${afterVal} with Graphite active — `
          + 'it should not read the team colour at all');
      }
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  return {
    name: nameOf('teamcolour'),
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'Royal tints the K1 controls, the unchanged list stays graphite ink, '
        + 'and switching to a graphite team repaints .btn.primary with no reload',
  };
}
