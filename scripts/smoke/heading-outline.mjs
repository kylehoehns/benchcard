import { evalIn, TODAY_HOME } from './dom.mjs';
import { tap, evalJSON } from './sheet-drive.mjs';

/* #151 item 4: the rendered heading outline -- what a screen reader's own
 * outline is built from, headings that are actually in the accessibility
 * tree. An element is excluded the same way the app itself hides things,
 * walking up to `root`: the `hidden` attribute (every screen and dialog here
 * uses it) or `aria-hidden="true"` (`#barTitle`'s decorative copy, most of
 * the time). Scoped to `root` rather than always `document`: a screen check
 * passes `body` (the other screens are `hidden`, so nothing of theirs
 * leaks in), and a dialog check passes the dialog's own id, so the page's
 * own h1 sitting behind it does not count as that dialog's first heading. */
const OUTLINE_JS = rootSel => `JSON.stringify((() => {
  const root = document.querySelector(${JSON.stringify(rootSel)});
  if (!root) return null;
  const hiddenChain = el => {
    for (let n = el; n; n = n.parentElement) {
      if (n.hasAttribute('hidden')) return true;
      if (n.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  };
  return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(h => !hiddenChain(h))
    .map(h => Number(h.tagName[1]));
})())`;

// Level can drop by any amount (closing back out to a section boundary), but
// climb by at most 1 at a time -- item 4's own wording, "no h1 -> h3, no
// h2 -> h4".
function outlineProblems(name, levels, startLevel) {
  const problems = [];
  if (!levels || !levels.length) return [`${name}: no headings found in its accessible outline`];
  if (levels[0] !== startLevel) problems.push(`${name}: starts at h${levels[0]}, want h${startLevel}`);
  if (startLevel === 1) {
    const ones = levels.filter(l => l === 1).length;
    if (ones !== 1) problems.push(`${name}: ${ones} h1(s) in its accessible outline, want exactly 1`);
  }
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) problems.push(`${name}: h${levels[i - 1]} → h${levels[i]} skips a level`);
  }
  return problems;
}

// Screens: each one's own outline, read against the whole document -- every
// other screen is `hidden`, so only the open one's headings ever show up.
// Each opens from Today through its own real trigger and closes back to
// Today with `#backBtn` before the next one opens -- `overlay.mjs`'s own
// `STATES` shape, rather than trusting `TODAY_HOME` to unwind two screens'
// worth of pushed history at once.
const SCREENS = [
  { name: 'Today', open: null, close: null },
  { name: 'the game screen', open: `$('.today-game').click()`, close: `$('#backBtn').click()` },
  { name: 'Team', open: `$('#todayTeam').click()`, close: `$('#backBtn').click()` },
  { name: 'Season', open: `$('#todaySeason').click()`, close: `$('#backBtn').click()` },
  { name: 'Settings', open: `$('#settingsBtn').click()`, close: `$('#backBtn').click()` },
];

// Dialogs: each one's own outline, read against just its own subtree, so the
// screen's h1 behind it never counts as this dialog's first heading. Opened
// through the real trigger the coach would use, same as `overlay.mjs`'s
// `STATES` (`#confirm`'s only live door is Remove team; cancelled with
// `#confirmNo` rather than actually removing the team).
// Exported so #179's clip-sweep check can open the same dialog through the
// same trigger, rather than a second copy of these two scripts.
export const CONFIRM_DIALOG = { name: '#confirm', root: '#confirm',
  open: `$('#settingsBtn').click(); $('#removeTeam').click()`,
  close: `$('#confirmNo').click(); $('#backBtn').click()` };

const DIALOGS = [
  { name: '#help', root: '#help',
    open: `$('#settingsBtn').click(); $('#helpBtn').click()`,
    close: `$('#helpClose').click(); $('#backBtn').click()` },
  CONFIRM_DIALOG,
  { name: 'bench mode', root: '#gamemode',
    open: `$('#gmOpen').click()`,
    close: `$('#gmClose').click()` },
];

// Screens and dialogs are checked the same way -- open (if there is a
// trigger), read the outline against the right root, record any problems,
// close -- differing only in which root each item's outline is read
// against and the level its own outline must start at.
async function checkGroup(c, problems, items, startLevel, rootFor) {
  for (const item of items) {
    try {
      if (item.open) await tap(c, item.open);
      const levels = await evalJSON(c, OUTLINE_JS(rootFor(item)));
      problems.push(...outlineProblems(item.name, levels, startLevel));
      if (item.close) await tap(c, item.close);
    } catch (e) { throw new Error(`${item.name}: ${e.message.split('\n')[0]}`); }
  }
}

export async function headingOutlinePass(c, origin) {
  const problems = [];
  try {
    await evalIn(c, TODAY_HOME);
    await checkGroup(c, problems, SCREENS, 1, () => 'body');
    await checkGroup(c, problems, DIALOGS, 2, d => d.root);
    await evalIn(c, TODAY_HOME);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${SCREENS.length} screens and ${DIALOGS.length} dialogs, each heading outline starts at the right level with no skip`,
  };
}
