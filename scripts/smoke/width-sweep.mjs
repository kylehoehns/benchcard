import { evalIn, step } from './dom.mjs';
import { resize, smokeViewport } from './page-state.mjs';
import { TOUCH_WIDTHS } from './sizes.mjs';

/* The sweep both `touchPass` and `settingsRowPass` are built from: read the
   harness's own viewport, drive one or more named states, sweep
   `TOUCH_WIDTHS` at each, and at every width pull ONE named check back out of
   `smoke-checks.js`'s own verdict -- a floor set in CSS has to be proven by
   measuring the rendered box, not by reading the stylesheet. Extracted rather
   than duplicated a second time: they were the same read-loop-reset shape
   with only the state list, the check name and the count regex differing, and
   #22 was about to add a third copy of it. `close` is run once, after the
   sweep, before the viewport is put back -- `touchPass` also closes the folds
   it opened; `settingsRowPass` has nothing else to undo. Returns the raw
   `{ bad, gone, audited, seen }` a caller assembles its own `detail` string from --
   `touchPass`'s wording and `settingsRowPass`'s wording differ, and neither
   is this function's to decide. */
export async function widthSweep(c, source, { states, checkName, countRe, label, missing, close }) {
  const [w0, h0] = await smokeViewport(c);

  const bad = [], gone = [];
  let audited = 0, seen = 0;
  for (const st of states) {
    await evalIn(c, step(st.open));
    for (const w of TOUCH_WIDTHS) {
      await resize(c, w, h0);
      const chk = (await evalIn(c, source)).checks.find(k => k.name === checkName);
      const where = label(st, w);
      if (!chk) { gone.push(`${where}: ${missing}`); continue; }
      audited++;
      const n = Number((countRe.map(re => chk.detail.match(re)).find(Boolean) || [])[1] || 0);
      seen = Math.max(seen, n);
      if (!chk.pass) bad.push(`${where}: ${chk.detail}`);
    }
  }

  await evalIn(c, step(close));
  await resize(c, w0, h0, { debounce: true });

  return { bad, gone, audited, seen };
}

/* The tail every `widthSweep` caller shares: one failure per undersized
   measurement (prefixed as one), one per entry for a check that went missing
   (as it is -- it is not a measurement), and a failure when nothing at all was
   measured. `what` names the thing measured, `floor` is the px floor. */
export function recordSweep(rec, { bad, gone = [], audited }, { what, floor }) {
  for (const b of bad) rec.fail(`measurement under ${floor}px: ${b}`);
  for (const g of gone) rec.fail(g);
  rec.check(audited > 0, `no ${what} was measured`);
}
