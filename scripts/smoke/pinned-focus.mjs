/* #232: closing a pinned timeline card puts keyboard focus back on that
 * player's `.tl-name`, and Escape closes the card. Landed once per scenario
 * with `land()` at 390x844 on the RICH record, every input a real CDP key
 * press or mouse click, every verdict read off `document.activeElement`.
 *
 * Scenarios (spec 232's "What would settle it", items 1-6):
 *   1 Tab to the second row's name, Enter, Tab to the close button, Enter
 *   2 the same, but the close button is clicked with the mouse
 *   3 Escape from the close button
 *   4 Escape from the name, right after opening with Enter
 *   5 Escape with no card open does nothing (a reasoning check, NOT a guard:
 *     no listener change turns it red, since with no card there is nothing
 *     to close and no id to focus)
 *   6 a modal's Escape (the shortcuts sheet, opened with `?`) does not also
 *     close the card behind it. Covers the openTrap path only; the
 *     <dialog>-based sheets (openSheet) are not exercised. Goes red only if
 *     BOTH the #timeline scoping and the target check are gone: a listener on
 *     document that keeps the target check is still correct, since the
 *     sheet's focus is neither the name nor inside #tlDetail.
 * Rule 2a of /new-guard: every scenario first asserts that the card really
 * opened and the focus really sat where it says, so a run whose keys went
 * nowhere fails on that instead of passing on nothing. */
import { evalIn, quiet, key, enter, escape, tab, DESCRIBE_EL } from './dom.mjs';
import { land } from './page-state.mjs';
import { RICH } from './fixtures.mjs';

const ROW = 1; // the second player's row
const NAME = `document.querySelectorAll('#timeline .tl-row[data-id] .tl-name')[${ROW}]`;

const settle = quiet;

/* what the page looks like now, by name so a failure line reads */
const STATE = `(() => {
  const name = ${NAME};
  const a = document.activeElement;
  const who = !a ? 'nothing' : a === document.body ? '<body>' : a === name ? 'the second row\\'s .tl-name'
    : (${DESCRIBE_EL})(a);
  return JSON.stringify({ who, onName: a === name, onClose: !!a && a.classList.contains('tld-x'),
    open: !!document.getElementById('tlDetail'), expanded: name && name.getAttribute('aria-expanded'),
    scrollY: Math.round(window.scrollY) });
})()`;
const state = async c => JSON.parse(await evalIn(c, STATE));

async function fresh(c, origin) {
  await land(c, origin, {
    width: 390, height: 844, record: RICH,
    ready: `document.querySelectorAll('#timeline .tl-row[data-id]').length > ${ROW + 1}`,
  });
  await evalIn(c, `(() => { document.querySelectorAll('#timeline .tl-row[data-id] .tl-name')[${ROW - 1}].focus(); })()`);
}
/* real Tab presses until `until` (a page expression) holds; false if it never does */
async function tabTo(c, until) {
  for (let i = 0; i < 6; i++) {
    await tab(c);
    if (await evalIn(c, `(${until})()`)) return true;
  }
  return false;
}
const onNameJs = `() => document.activeElement === ${NAME}`;
const onCloseJs = `() => document.activeElement?.classList.contains('tld-x')`;

/* Tab to the row's name and press Enter; the card must be open, focus on the name */
async function openWithKeys(c, label, rec) {
  if (!await tabTo(c, onNameJs)) { rec.fail(`${label}: Tab never reached the second row's .tl-name`); return false; }
  await enter(c); await settle(c);
  const s = await state(c);
  if (!s.open || !s.onName) { rec.fail(`${label}: Enter on the name left open=${s.open}, focus on ${s.who}, want the card open with focus on the name`); return false; }
  return true;
}
const closedOnName = (label, s, rec, extra = '') => {
  if (s.open) rec.fail(`${label}: #tlDetail is still in the page${extra}`);
  if (s.expanded !== 'false') rec.fail(`${label}: the name's aria-expanded is ${JSON.stringify(s.expanded)}, want "false"`);
  if (!s.onName) rec.fail(`${label}: focus is on ${s.who}, want the second row's .tl-name`);
};

export async function pinnedFocusPass(c, origin, rec) {
  let scenarios = 0;
  try {
    // 1: keyboard × -> name
    await fresh(c, origin);
    if (await openWithKeys(c, '1 (× by keyboard)', rec)) {
      if (!await tabTo(c, onCloseJs)) rec.fail('1 (× by keyboard): Tab never reached the close button');
      else { await enter(c); await settle(c); closedOnName('1 (× by keyboard)', await state(c), rec); }
    }
    scenarios++;

    // 2: mouse × -> name
    await fresh(c, origin);
    if (await openWithKeys(c, '2 (× by mouse)', rec)) {
      const at = JSON.parse(await evalIn(c, `(() => { const r = document.querySelector('#tlDetail .tld-x').getBoundingClientRect();
        return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, inView: r.top >= 0 && r.bottom <= innerHeight }); })()`));
      if (!at.inView) rec.fail('2 (× by mouse): the close button is off screen, nothing to click');
      else {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
        await settle(c);
        closedOnName('2 (× by mouse)', await state(c), rec);
      }
    }
    scenarios++;

    // 3: Escape from the ×
    await fresh(c, origin);
    if (await openWithKeys(c, '3 (Escape from ×)', rec)) {
      if (!await tabTo(c, onCloseJs)) rec.fail('3 (Escape from ×): Tab never reached the close button');
      else { await escape(c); await settle(c); closedOnName('3 (Escape from ×)', await state(c), rec); }
    }
    scenarios++;

    // 4: Escape from the name; the page must not scroll either
    await fresh(c, origin);
    if (await openWithKeys(c, '4 (Escape from name)', rec)) {
      const before = (await state(c)).scrollY;
      await escape(c); await settle(c);
      const s = await state(c);
      closedOnName('4 (Escape from name)', s, rec);
      if (s.scrollY !== before) rec.fail(`4 (Escape from name): the page scrolled from ${before} to ${s.scrollY}`);
    }
    scenarios++;

    // 5: no card open, Escape does nothing (reasoning check, cannot go red)
    await fresh(c, origin);
    if (!await tabTo(c, onNameJs)) rec.fail('5 (no card): Tab never reached the second row\'s .tl-name');
    else {
      const before = await state(c);
      await escape(c); await settle(c);
      const s = await state(c);
      if (s.open || !s.onName || s.scrollY !== before.scrollY) rec.fail(`5 (no card): Escape changed something: open=${s.open}, focus on ${s.who}, scrollY ${before.scrollY} -> ${s.scrollY}`);
    }
    scenarios++;

    // 6: a modal's Escape closes the modal only
    await fresh(c, origin);
    if (await openWithKeys(c, '6 (modal)', rec)) {
      await key(c, '?', 'Slash', 191, '?'); await settle(c);
      const sheet = () => evalIn(c, `!document.getElementById('keys').hidden`);
      if (!await sheet()) rec.fail('6 (modal): "?" did not open the shortcuts sheet, so nothing was tested');
      else {
        await escape(c); await settle(c);
        const s = await state(c);
        if (await sheet()) rec.fail('6 (modal): Escape did not close the shortcuts sheet');
        if (!s.open) rec.fail('6 (modal): Escape in the shortcuts sheet also closed the pinned card behind it');
      }
    }
    scenarios++;
  } finally {
    await land(c, origin);
  }
  rec.check(scenarios === 6, `only ${scenarios} of 6 scenarios ran`);
  rec.ok(`closing a pinned card by keyboard, mouse or Escape lands on the name; Escape is inert with no card and inside a modal (${scenarios} scenarios)`);
}
