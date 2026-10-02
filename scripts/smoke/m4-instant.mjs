import { computedStyle } from './dom.mjs';
import { evalJSON, openAddGameFlow, realTap, waitClosed } from './sheet-drive.mjs';

/* #151 item 6 (M4): a coach marks players on/off, and flips a switch, many
 * times a minute -- app.css sets `transition: none` on the switch knob
 * (`input[switch]::after`, `.switch input::after`), the checkbox tick
 * (`input[type=checkbox].box`) and the player chip avatar (`.plr .av`), so
 * each state change lands at once rather than fading in behind the finger.
 * The checkbox has no live instance anywhere in the app today (#152, dead
 * CSS), so only the two reachable targets are read here, matching the
 * spec's own Proof line.
 *
 * Step 2 of the Add-a-game flow ("Who's here?") carries the roster's `.plr`
 * picker tiles, and step 3 ("How should minutes split?") carries the "Even
 * out earlier games" switch (`switchRow`, rules.js, shared with
 * `#showMinutes`) -- so this check walks the same flow forward through both
 * rather than opening two separate sheets. Neither read types or toggles
 * anything, so closing with `#agClose` afterwards does not trigger the
 * discard ask (see add-game-flow.mjs's own "nothing typed" comment).
 *
 * `input[switch]::after` is a pseudo-element, so its computed style is read
 * with `getComputedStyle(el, '::after')`, the only way to ask the browser
 * for a pseudo-element's paint -- `computedStyle` (dom.mjs) only reads real
 * elements, so this one probe is inline rather than routed through it. */
const KNOB_PROBE = `JSON.stringify((() => {
  const el = document.querySelector('#agBody input[switch]');
  if (!el) return null;
  const cs = getComputedStyle(el, '::after');
  return { transitionDuration: cs.transitionDuration, transitionProperty: cs.transitionProperty };
})())`;

const instant = cs => cs.transitionProperty === 'none' || cs.transitionDuration.split(',').every(d => parseFloat(d) === 0);

export async function m4InstantPass(c, origin) {
  const problems = [];
  try {
    await openAddGameFlow(c);
    await realTap(c, '#agNext'); // step 1 -> step 2: "Who's here?"

    const av = await computedStyle(c, '#agBody .plr .av', ['transitionDuration', 'transitionProperty']);
    if (!av) {
      problems.push('#agBody .plr .av was not found on step 2 -- nothing to measure there');
    } else if (!instant(av)) {
      problems.push(`a player chip's .av has transitionProperty "${av.transitionProperty}" `
        + `and transitionDuration "${av.transitionDuration}", want "none" or every duration 0s`);
    }

    await realTap(c, '#agNext'); // step 2 -> step 3: "How should minutes split?"
    const knob = await evalJSON(c, KNOB_PROBE);
    if (!knob) {
      problems.push('#agBody input[switch] was not found on step 3 -- nothing to measure there');
    } else if (!instant(knob)) {
      problems.push(`the switch knob's ::after has transitionProperty "${knob.transitionProperty}" `
        + `and transitionDuration "${knob.transitionDuration}", want "none" or every duration 0s`);
    }

    // Rule 2a: a run that found neither target measured nothing.
    if (!av && !knob) {
      problems.push('neither a player chip avatar nor the switch knob was found -- a broken probe, not a pass');
    }

    await realTap(c, '#agClose'); // nothing typed or toggled -- closes at once
    await waitClosed(c, '#addGameFlow');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'a player chip avatar and the switch knob both change state with no transition',
  };
}
