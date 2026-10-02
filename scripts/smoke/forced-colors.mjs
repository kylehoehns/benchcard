import { evalIn, TODAY_HOME, computedStyle } from './dom.mjs';
import { tap } from './sheet-drive.mjs';
import { setMedia } from './page-state.mjs';

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
// #145 item 8's `computedStyle(c, sel, props)` (dom.mjs) already probes one
// selector's computed style and returns null when nothing matches -- reused
// here for both the on/off pair and the timeline block's border, rather than
// re-rolling a second `getComputedStyle` probe (m4-instant.mjs's own use is
// the precedent this follows).
const PAIR_PROPS = ['outlineStyle', 'outlineWidth', 'borderWidth', 'borderStyle'];

async function readPair(c, onSel, offSel) {
  const on = await computedStyle(c, onSel, PAIR_PROPS);
  const off = await computedStyle(c, offSel, PAIR_PROPS);
  if (!on || !off) return null;
  return { on, off };
}

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
    await setMedia(c, [{ name: 'forced-colors', value: 'active' }]);

    for (const s of STEPS) {
      try {
        await tap(c, s.open);
        const pair = await readPair(c, s.onSel, s.offSel);
        if (!pair) problems.push(`${s.name}: could not find both a selected/on control and an unselected one`);
        else if (!differs(pair)) problems.push(`${s.name}: the selected/on control's outline/border does not differ from the unselected one`);
        if (s.checkTlBlk) {
          const blk = await computedStyle(c, '.tl-blk', ['borderWidth']);
          if (!blk) problems.push('the game screen: no .tl-blk found to check its border');
          else if (parseFloat(blk.borderWidth) <= 0) problems.push(`the game screen: .tl-blk border-width is ${blk.borderWidth}, want a non-zero border`);
        }
        await tap(c, s.close);
      } catch (e) { throw new Error(`${s.name}: ${e.message.split('\n')[0]}`); }
    }
    await evalIn(c, TODAY_HOME);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${STEPS.length} screens: the selected/on control differs from the unselected one under forced colors, and .tl-blk has a border`,
  };
}
