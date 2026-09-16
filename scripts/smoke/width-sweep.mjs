import { evalIn, step } from './dom.mjs';
import { TOUCH_WIDTHS } from './registry.mjs';

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
   `{ bad, audited, seen }` a caller assembles its own `detail` string from --
   `touchPass`'s wording and `settingsRowPass`'s wording differ, and neither
   is this function's to decide. */
export async function widthSweep(c, source, { states, checkName, countRe, label, missing, close }) {
  const before = await c.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__SMOKE_VIEWPORT || [390, 844])', returnByValue: true,
  });
  const [w0, h0] = JSON.parse(before.result.value);

  const bad = [];
  let audited = 0, seen = 0;
  for (const st of states) {
    await evalIn(c, step(st.open));
    for (const w of TOUCH_WIDTHS) {
      await c.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h0, deviceScaleFactor: 2, mobile: true });
      await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
      const chk = (await evalIn(c, source)).checks.find(k => k.name === checkName);
      const where = label(st, w);
      if (!chk) { bad.push(`${where}: ${missing}`); continue; }
      audited++;
      const n = Number((countRe.map(re => chk.detail.match(re)).find(Boolean) || [])[1] || 0);
      seen = Math.max(seen, n);
      if (!chk.pass) bad.push(`${where}: ${chk.detail}`);
    }
  }

  await evalIn(c, step(close));
  await c.send('Emulation.setDeviceMetricsOverride',
    { width: w0, height: h0, deviceScaleFactor: 2, mobile: true });
  await new Promise(r => setTimeout(r, 300));

  return { bad, audited, seen };
}
