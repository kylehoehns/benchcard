/* #141 (one control each), item 4 ("One input"): the game screen's
 * `#gameDate`/`#label`/`#dayName`/`#when` used to carry their own override
 * (`border-color: transparent; background: var(--bg)`) so they read
 * differently from every other text field in the app -- a plain
 * `input[type=...]` gets only the base input rule. That override is gone
 * now; this checks the two actually agree in the browser, in light and dark,
 * rather than trusting that deleting a few lines of CSS did what it looks
 * like it did.
 *
 * #142 moved `#teamName` onto `.pgrp .prow-in` (border: 0, background: none
 * -- the ROW is the 48px target there, not the field), so it no longer
 * carries the base input rule this check needs a reference for. `#minMins`
 * is still a plain `input[type=number]` with no border/background override
 * of its own (only size and text-alignment, `#view-settings input.minmins`,
 * app.css), so it stands in for `#teamName` here. */
import { evalIn, step, TODAY_HOME } from './dom.mjs';
import { richWith } from './fixtures.mjs';
import { land } from './page-state.mjs';

const GAME_FIELDS = ['#gameDate', '#label', '#dayName', '#when'];

async function readColors(c, sel) {
  return JSON.parse(await evalIn(c, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return JSON.stringify(null);
    const cs = getComputedStyle(el);
    return JSON.stringify({ bg: cs.backgroundColor, border: cs.borderTopColor });
  })()`));
}

export async function gameFieldMatchPass(c, origin, rec) {
  let measured = 0;

  try {
    for (const theme of ['light', 'dark']) {
      // `land` lands on the games view, where the four game fields live.
      await land(c, origin, { record: richWith({ theme }) });
      const gameColors = {};
      for (const sel of GAME_FIELDS) gameColors[sel] = await readColors(c, sel);

      // `#minMins` is in Settings; reached the same way remove-rows.mjs gets
      // to `#removeTeam`.
      await evalIn(c, step(TODAY_HOME));
      await evalIn(c, step(`document.querySelector('#settingsBtn').click()`));
      const want = await readColors(c, '#minMins');
      if (!rec.check(want, `${theme}: #minMins not found in Settings -- nothing to compare against`)) continue;

      for (const sel of GAME_FIELDS) {
        const got = gameColors[sel];
        if (!rec.check(got, `${theme}: ${sel} not found`)) continue;
        measured++;
        rec.check(got.bg === want.bg, `${theme}: ${sel} background is ${got.bg}, #minMins's is ${want.bg}`);
        rec.check(got.border === want.border, `${theme}: ${sel} border color is ${got.border}, #minMins's is ${want.border}`);
      }
    }

    // Rule 2a: 4 fields x 2 themes = 8 measurements expected.
    rec.check(measured >= 8, `only ${measured}/8 game fields were measured -- a selector stopped matching`);
  } finally {
    await evalIn(c, step(TODAY_HOME));
  }

  rec.ok(`#gameDate, #label, #dayName and #when all match #minMins's background and border color, light and dark`);
}
