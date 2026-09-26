/* #141 (one control each), item 4 ("One input"): the game screen's
 * `#gameDate`/`#label`/`#dayName`/`#when` used to carry their own override
 * (`border-color: transparent; background: var(--bg)`) so they read
 * differently from every other text field in the app -- `#teamName` in
 * Settings included, which gets only the base input rule. That override is
 * gone now; this checks the two actually agree in the browser, in light and
 * dark, rather than trusting that deleting a few lines of CSS did what it
 * looks like it did. */
import { evalIn, step, TODAY_HOME } from './dom.mjs';
import { goRich } from './fixtures.mjs';

const GAME_FIELDS = ['#gameDate', '#label', '#dayName', '#when'];

async function readColors(c, sel) {
  return JSON.parse(await evalIn(c, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return JSON.stringify(null);
    const cs = getComputedStyle(el);
    return JSON.stringify({ bg: cs.backgroundColor, border: cs.borderTopColor });
  })()`));
}

export async function gameFieldMatchPass(c, origin) {
  const problems = [];
  let measured = 0;

  try {
    for (const theme of ['light', 'dark']) {
      // `goRich` lands on the games view, where the four game fields live.
      await goRich(c, origin, { theme });
      const gameColors = {};
      for (const sel of GAME_FIELDS) gameColors[sel] = await readColors(c, sel);

      // `#teamName` is in Settings; reached the same way remove-rows.mjs gets
      // to `#removeTeam`.
      await evalIn(c, step(TODAY_HOME));
      await evalIn(c, step(`document.querySelector('#settingsBtn').click()`));
      const want = await readColors(c, '#teamName');
      if (!want) { problems.push(`${theme}: #teamName not found in Settings -- nothing to compare against`); continue; }

      for (const sel of GAME_FIELDS) {
        const got = gameColors[sel];
        if (!got) { problems.push(`${theme}: ${sel} not found`); continue; }
        measured++;
        if (got.bg !== want.bg) problems.push(`${theme}: ${sel} background is ${got.bg}, #teamName's is ${want.bg}`);
        if (got.border !== want.border) problems.push(`${theme}: ${sel} border color is ${got.border}, #teamName's is ${want.border}`);
      }
    }

    // Rule 2a: 4 fields x 2 themes = 8 measurements expected.
    if (measured < 8) problems.push(`only ${measured}/8 game fields were measured -- a selector stopped matching`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await evalIn(c, step(TODAY_HOME));
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `#gameDate, #label, #dayName and #when all match #teamName's background and border color, light and dark`,
  };
}
