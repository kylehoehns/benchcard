/* #223: the "just on" tag in the welcome screen's On screen demo. Bench mode
 * styles its tag as `.gm-p .mn .tag` (#169 moved it inside the minutes), and
 * the demo copied bench mode's rows but appended the tag to `.nm`, where no
 * rule reaches it: it painted as bare text. This reads the painted tag, not
 * the stylesheet: every `.wel-bench .tag.in` must sit inside `.mn`, be
 * inline-block and have a real background. At least one must exist, so a
 * selector that stops matching fails instead of passing on nothing. */
import { evalIn } from './dom.mjs';
import { land } from './page-state.mjs';
import { goRich } from './fixtures.mjs';

const PROBE = `(() => {
  const tags = [...document.querySelectorAll('.wel-bench .tag.in')];
  return JSON.stringify(tags.map(t => {
    const cs = getComputedStyle(t);
    return { text: t.textContent, inMn: !!t.closest('.mn'), display: cs.display, bg: cs.backgroundColor };
  }));
})()`;

export async function welcomeTagPass(c, origin) {
  const problems = [];
  try {
    await land(c, origin, { record: 'wiped', ready: `document.querySelector('#view-welcome')?.hidden === false` });
    await evalIn(c, `document.querySelector('#welTabScreen').click()`);
    const tags = JSON.parse(await evalIn(c, PROBE));
    if (!tags.length) problems.push('no .wel-bench .tag.in on the On screen tab');
    tags.forEach((t, i) => {
      if (!t.inMn) problems.push(`tag ${i} ("${t.text}") is not inside .mn`);
      if (t.display !== 'inline-block') problems.push(`tag ${i} has display ${t.display}, want inline-block`);
      if (t.bg === 'transparent' || t.bg === 'rgba(0, 0, 0, 0)') problems.push(`tag ${i} has no background (${t.bg})`);
    });
    var count = tags.length;
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  await goRich(c, origin).catch(() => {});
  return {
    pass: problems.length === 0,
    detail: problems.length
      ? problems.slice(0, 4).join(' | ')
      : `${count} "just on" tag(s) on the welcome On screen tab, each inside .mn, inline-block, with a background`,
  };
}
