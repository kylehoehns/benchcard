import { evalIn, SETTLE } from './dom.mjs';
import { nameOf } from './registry.mjs';

/* A fixture is not a guard until something fails when it does not arrive.
 *
 * Without this check, a renamed storage key, a record `sanitize` rejects or a
 * reload that raced the settle would drop the whole run back onto the lean
 * state — and every pass below would go green while auditing exactly the
 * screens this item exists to stop auditing. That is not a hypothetical: the
 * green run with five live defects in it is what put this item in the queue.
 *
 * So it asserts the three preconditions REACHED THE DOM, one per defect class,
 * by the same route a coach would see them. It does not assert on
 * localStorage: that would prove the write, which was never the doubtful
 * part. */
export async function fixturePass(c) {
  const probe = await evalIn(c, `(async () => {
    const $ = s => document.querySelector(s);
    const out = { host: location.host };
    $('#todayTeam').click();
    await ${SETTLE};
    /* #31 decision 6: the one levels control still on this screen sits in
       \`#teamActions\`, the group under the roster, and it only appears once
       somebody is off the default level -- which is the precondition being
       proved. Scoped to that group rather than to \`#view-team\`, because
       \`#view-team\` now also contains three dialogs, and a button that had
       drifted into a closed sheet would still answer a \`#view-team\` query
       while no coach could see it. */
    out.resetLevels = [...document.querySelectorAll('#teamActions button')]
      .filter(b => /back to the same level/i.test(b.textContent)).length;
    $('#backBtn').click();
    /* Going home from a pushed screen is a REAL \`history.back()\` now (#23
       review, item A) -- an async browser traversal, not a same-tick repaint.
       Clicking the next thing before its own \`popstate\` has landed is
       exactly the "back-then-push in one tick" race that traversal's own
       fix guards against, and the guard's recovery is to reassert history at
       the CURRENT position -- which is safe, but is not "nothing happened",
       and chaining three of these with no yield between them was enough to
       walk the tab's session history back past this reload's own base entry
       and off the app entirely (reproduced: \`npm run smoke -- --no-tests\`
       died with "Inspected target navigated or closed" mid-\`fixturePass\`).
       One settle is the fix, here and at every \`#backBtn\` click below. */
    await ${SETTLE};
    $('#todaySeason').click();
    await ${SETTLE};
    /* #30 moved "Across the day" (\`#daytotals\`) from the game screen to the
       Season screen, unfolded rather than behind a fold -- so both it and the
       filed-games ledger are read from the same screen now. */
    out.dayRows = document.querySelectorAll('#daytotals .dayrow').length;
    out.dayGames = document.querySelectorAll('#daytotals .legend span').length;
    out.filedGames = document.querySelectorAll('#view-season details.sn-game').length;
    $('#backBtn').click();
    await ${SETTLE};
    return JSON.stringify(out);
  })()`);
  const r = JSON.parse(probe);
  const missing = [
    r.resetLevels >= 1 ? null : 'no "back to the same level" button — no player is off the default level',
    r.dayGames >= 2 ? null : `day legend names ${r.dayGames} game(s), want ≥ 2`,
    r.dayRows >= 11 ? null : `day totals has ${r.dayRows} row(s), want 11`,
    r.filedGames >= 3 ? null : `${r.filedGames} filed game(s) in the ledger, want 3`,
  ].filter(Boolean);
  return {
    name: nameOf('fixture'),
    pass: missing.length === 0,
    detail: missing.length
      ? `${missing.length} precondition(s) missing on ${r.host}: ${missing.join('; ')}`
      : `${r.dayRows} players × ${r.dayGames} games today, ${r.filedGames} filed, `
        + `levels set (${r.host})`,
  };
}
