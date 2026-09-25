import { TODAY_HOME } from './dom.mjs';
import { tap, evalJSON } from './sheet-drive.mjs';
import { goRich } from './fixtures.mjs';

/* #131 fix-pass finding, item 7: a plain `:root` prefix on the three
 * descendant dark-theme rules (app.css ~989, ~1002) added one class of
 * specificity, which flipped ten fields from transparent to filled in dark
 * mode -- three deliberate overrides (`#sheetCard .pgrp .prow-select`,
 * `.pgrp .prow-in`, `input[switch]`) had each been sized to beat those
 * rules' OLD specificity, and the extra class let the dark rule win instead.
 * The fix anchors the three rules with `:where(:root)[data-theme="dark"]`,
 * which adds nothing, so this guards the paint stays what each override's
 * own `background: none` says, in a real browser, rather than re-deriving a
 * specificity number by hand the way the CSS itself has to be trusted to get
 * right.
 *
 * Every field the finding named: the four print-sheet selects and the
 * minutes switch inside `#sheetCard`, the player sheet's three text fields
 * and the add-sheet's two -- ten in total, covering all three overrides
 * (`#printScope`/`#copies`/`#cardSize`/`#cardId` and `#showMinutes` are
 * `#sheetCard`'s; the rest are `.pgrp .prow-in`). */
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const readBgs = sels => `JSON.stringify(${JSON.stringify(sels)}.map(sel => {
  const e = document.querySelector(sel);
  return { sel, bg: e ? getComputedStyle(e).backgroundColor : null };
}))`;

export async function darkInputBgPass(c, origin) {
  const problems = [];
  const results = [];

  try {
    // A live theme switch, the same way `compare-shots.mjs`'s `goFirstRun`
    // reaches dark paint -- through the fixture's own `ui.theme`, never by
    // emulating `prefers-color-scheme` (#131's own rule, item 3 of its
    // Design). RICH otherwise lands on the games view with a game active,
    // which is what #shareBtn needs.
    await goRich(c, origin, { theme: 'dark' });

    // #sheetCard: the four print options and the minutes switch.
    await tap(c, `document.getElementById('shareBtn').click()`);
    const cardOpen = await evalJSON(c, `JSON.stringify(!!document.getElementById('sheetCard')?.open)`);
    if (!cardOpen) {
      problems.push('#shareBtn did not open #sheetCard -- nothing to measure there');
    } else {
      results.push(...await evalJSON(c, readBgs(['#printScope', '#copies', '#cardSize', '#cardId', '#showMinutes'])));
    }
    await tap(c, `document.getElementById('sheetCardClose').click()`);

    // #sheetPlayer: Number, Name, Card name.
    await tap(c, TODAY_HOME);
    await tap(c, `document.getElementById('todayTeam').click()`);
    await tap(c, `document.querySelector('#rosterlist .rrow')?.click()`);
    const playerOpen = await evalJSON(c, `JSON.stringify(!!document.getElementById('sheetPlayer')?.open)`);
    if (!playerOpen) {
      problems.push('tapping the first roster row did not open #sheetPlayer -- nothing to measure there');
    } else {
      results.push(...await evalJSON(c, readBgs(['#playerNumber', '#playerName', '#playerShort'])));
    }
    await tap(c, `document.getElementById('sheetPlayerClose')?.click()`);

    // #sheetAddPlayer: the same two fields as the player sheet's Number/Name.
    await tap(c, `document.getElementById('teamAdd').click()`);
    const addOpen = await evalJSON(c, `JSON.stringify(!!document.getElementById('sheetAddPlayer')?.open)`);
    if (!addOpen) {
      problems.push('the header + did not open #sheetAddPlayer -- nothing to measure there');
    } else {
      results.push(...await evalJSON(c, readBgs(['#addNumber', '#addName'])));
    }
    await tap(c, `document.querySelector('#sheetAddPlayer .bsheet-close')?.click()`);

    // Rule 2a: a run that opened no sheet at all measured nothing, and must
    // not read as a quiet pass.
    if (results.length === 0 && problems.length === 0) {
      problems.push('no field was read in any of the three sheets -- a broken probe, not a pass');
    }
    for (const { sel, bg } of results) {
      if (bg == null) problems.push(`${sel} was not found in the DOM`);
      else if (bg !== TRANSPARENT) {
        problems.push(`${sel}'s computed background-color is ${bg} in dark theme, want ${TRANSPARENT} `
          + `(its own \`background: none\`)`);
      }
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    // Restore RICH's own light theme and games view for the rows after this
    // one -- the same courtesy `addgameflow` and `teamscreen` pay when their
    // own pass leaves the fixture somewhere else.
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${results.length} field(s) stayed transparent in dark theme: ${results.map(r => r.sel).join(', ')}`,
  };
}
