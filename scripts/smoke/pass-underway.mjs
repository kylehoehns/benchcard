/* #92, "What would settle it" items 2-4: a part-played game's Today card and
 * the game screen's sub line both read "Underway", while the fixture's other
 * cards keep today's own status -- proved at `node --test`
 * (test/pass-status.test.js) for `passStatus` itself; this is the one seam
 * only a browser can answer: the real markup, the real computed dot color,
 * and the real aria-label, painted from `FOUR` (fixtures.mjs, #26's own
 * fixture) with one game driven mid-play through `setGame` (sheet-drive.mjs)
 * rather than a hand-typed stand-in state.
 *
 * `FOUR`'s own table (fixtures.mjs) is the independent source of truth for
 * every OTHER card's status here -- game 0 (Panthers) is the one this check
 * pushes into play; games 1-2 stay Planned and game 3 (Owls) stays Needs a
 * fix because its plan is blocked, exactly as `game-passes.mjs`'s own `WANT`
 * table already pins. */
import { evalIn, step, TODAY_HOME, PASS_STATUS_DOT_PROBE, CSS_VAR_COLOR_PROBE } from './dom.mjs';
import { FOUR, RICH, reloadWithRecord } from './fixtures.mjs';
import { setGame } from './sheet-drive.mjs';

const WANT = [
  { title: 'Panthers', status: 'Underway', cls: 'now' },
  { title: 'Ravens', status: 'Planned', cls: 'ok' },
  { title: 'Game 3', status: 'Planned', cls: 'ok' },
  { title: 'Owls', status: 'Needs a fix', cls: 'warn' },
];

export async function passUnderwayPass(c, origin) {
  const problems = [];
  try {
    await reloadWithRecord(c, origin, FOUR);

    // Drive game 0 (Panthers) mid-play: not stint 0 (never started), not the
    // last stint (game over) -- `stints.length` read back from the page's
    // own plan rather than assumed, so this holds even if the plan's own
    // shape ever changes.
    await evalIn(c, setGame(`
      const p = s.plans[0];
      const at = Math.max(1, Math.min(p.stints.length - 2, Math.floor(p.stints.length / 2)));
      s.state.day.games[0].live = { at, overrides: {} };
    `));

    const passes = JSON.parse(await evalIn(c, `(() => {
      const btns = [...document.querySelectorAll('#todayGames .today-game')];
      return JSON.stringify(btns.map(b => {
        const statusEl = b.querySelector('.pass-status');
        return {
          title: b.querySelector('.pass-title')?.textContent ?? null,
          statusText: statusEl ? statusEl.textContent : null,
          cls: statusEl ? [...statusEl.classList].find(c => c !== 'pass-status') ?? null : null,
          ariaLabel: b.getAttribute('aria-label'),
        };
      }));
    })()`));

    passes.forEach((p, i) => {
      const want = WANT[i];
      if (p.title !== want.title) problems.push(`pass ${i} title is ${JSON.stringify(p.title)}, want ${JSON.stringify(want.title)}`);
      if (p.statusText !== want.status) problems.push(`pass ${i} status text is ${JSON.stringify(p.statusText)}, want ${JSON.stringify(want.status)}`);
      if (p.cls !== want.cls) problems.push(`pass ${i}'s status class is ${JSON.stringify(p.cls)}, want ${JSON.stringify(want.cls)}`);
    });

    const underwayAria = passes[0]?.ariaLabel || '';
    if (!underwayAria.endsWith(', underway')) {
      problems.push(`pass 0's aria-label is ${JSON.stringify(underwayAria)}, want it to end ", underway"`);
    }

    // The dot's color is a real class rule, read off a probe built with the
    // same class the pass carries -- never a copied hex (AGENTS.md's own
    // rule) -- compared against `--accent` read the same way, matching
    // `game-passes.mjs`'s own `dotColors` probe for `.ok`/`.warn` (both share
    // `PASS_STATUS_DOT_PROBE`/`CSS_VAR_COLOR_PROBE`, dom.mjs).
    const dotColors = JSON.parse(await evalIn(c, `(() => {
      const probe = ${PASS_STATUS_DOT_PROBE};
      const cssVar = ${CSS_VAR_COLOR_PROBE};
      const accent = cssVar('var(--accent)');
      const btns = [...document.querySelectorAll('#todayGames .today-game')];
      const dot0 = getComputedStyle(btns[0].querySelector('.pass-status'), '::before').backgroundColor;
      return JSON.stringify({ now: probe('now'), accent, dot0 });
    })()`));
    if (dotColors.now !== dotColors.accent) {
      problems.push(`.pass-status.now's dot is ${dotColors.now}, want --accent (${dotColors.accent})`);
    }
    if (dotColors.dot0 !== dotColors.accent) {
      problems.push(`the underway pass's own dot paints ${dotColors.dot0}, want --accent (${dotColors.accent})`);
    }

    // Item 3: the game screen's sub line, with the underway game open.
    await evalIn(c, step(`document.querySelectorAll('#todayGames .today-game')[0].click()`));
    const sub = await evalIn(c, `document.getElementById('gameSub')?.textContent ?? null`);
    if (!sub || !sub.includes('Underway')) {
      problems.push(`#gameSub is ${JSON.stringify(sub)}, want it to include "Underway"`);
    }
    await evalIn(c, step(TODAY_HOME));
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    // Same courtesy `gamePassesPass` pays (fixtures.mjs's own FOUR/RICH
    // split): leave the fixture as `goRich` left it for whatever check runs
    // next.
    await reloadWithRecord(c, origin, RICH).catch(() => {});
  }
  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `pass 0 (Panthers) reads Underway/now with an --accent dot and an aria-label ending ", underway", `
        + `the game screen's sub line reads Underway, and passes 1-3 keep Planned/Needs a fix`,
  };
}
