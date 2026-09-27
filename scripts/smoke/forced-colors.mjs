import { evalIn, TODAY_HOME } from './dom.mjs';
import { tap, evalJSON } from './sheet-drive.mjs';
import { goRich } from './fixtures.mjs';

/* #151 item 7: forced colors mode strips most author colors down to a small
 * system palette, and can flatten a `background-color`/`box-shadow`-only
 * distinction between a selected/on control and its unselected sibling to
 * nothing. The one `@media (forced-colors: active)` block in app.css is
 * supposed to give the selected/on state a real border or outline that
 * DIFFERS in width or style from the unselected one -- this check never
 * reads a system color's own resolved value (CDP's forced-colors emulation,
 * off Windows, does not promise one), matching the spec's own assertion
 * shape.
 *
 * Three reachable pairs, one per named screen -- none of these opens a
 * further dialog/sheet beyond what the screen name itself implies:
 *   - Today: the Add a game flow's own progress dots (`.flow-prog i.on` /
 *     `i` -- opened with the same `#todayAddGame` trigger `add-game-flow.mjs`
 *     already drives, closed with `#agClose`, which closes at once when
 *     nothing on the step has been touched).
 *   - the game screen: `#viewSeg`'s Timeline/Card `.seg` buttons, on by
 *     default with no sheet needed (`timeline.js`'s `applyGameView`).
 *   - bench mode: the floor's own picked/unpicked players (`.gm-p.picked`),
 *     reached the same way `overlay.mjs`'s "game mode, swap picker" state
 *     already does.
 */
const PAIR_JS = (onSel, offSel) => `JSON.stringify((() => {
  const on = document.querySelector(${JSON.stringify(onSel)});
  const off = document.querySelector(${JSON.stringify(offSel)});
  if (!on || !off) return null;
  const read = el => {
    const cs = getComputedStyle(el);
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, borderWidth: cs.borderWidth, borderStyle: cs.borderStyle };
  };
  return { on: read(on), off: read(off) };
})())`;

const TL_BLK_BORDER_JS = `JSON.stringify((() => {
  const b = document.querySelector('.tl-blk');
  return b ? getComputedStyle(b).borderWidth : null;
})())`;

function differs(pair) {
  const { on, off } = pair;
  return on.outlineStyle !== off.outlineStyle || on.outlineWidth !== off.outlineWidth
    || on.borderWidth !== off.borderWidth || on.borderStyle !== off.borderStyle;
}

const STEPS = [
  { name: 'Today', open: `$('#todayAddGame').click()`, close: `$('#agClose').click()`,
    onSel: '#agProg i.on', offSel: '#agProg i:not(.on)' },
  { name: 'the game screen', open: `$('.today-game').click()`, close: `$('#backBtn').click()`,
    onSel: '#viewSeg button.on', offSel: '#viewSeg button:not(.on)', checkTlBlk: true },
  { name: 'bench mode', open: `$('#gmOpen').click(); $('#gmFloor .gm-p').click()`, close: `$('#gmClose').click()`,
    onSel: '.gm-p.picked', offSel: '.gm-p:not(.picked)' },
];

export async function forcedColorsPass(c, origin) {
  const problems = [];
  try {
    await evalIn(c, TODAY_HOME);
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }] });

    for (const s of STEPS) {
      try {
        await tap(c, s.open);
        const pair = await evalJSON(c, PAIR_JS(s.onSel, s.offSel));
        if (!pair) problems.push(`${s.name}: could not find both a selected/on control and an unselected one`);
        else if (!differs(pair)) problems.push(`${s.name}: the selected/on control's outline/border does not differ from the unselected one`);
        if (s.checkTlBlk) {
          const bw = await evalJSON(c, TL_BLK_BORDER_JS);
          if (bw == null) problems.push('the game screen: no .tl-blk found to check its border');
          else if (parseFloat(bw) <= 0) problems.push(`the game screen: .tl-blk border-width is ${bw}, want a non-zero border`);
        }
        await tap(c, s.close);
      } catch (e) { throw new Error(`${s.name}: ${e.message.split('\n')[0]}`); }
    }
    await evalIn(c, TODAY_HOME);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${STEPS.length} screens: the selected/on control differs from the unselected one under forced colors, and .tl-blk has a border`,
  };
}
