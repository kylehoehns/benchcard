/* #223: the "just on" tag in the welcome screen's On screen demo. Bench mode
 * styles its tag as `.gm-p .mn .tag` (#169 moved it inside the minutes), and
 * the demo copied bench mode's rows but appended the tag to `.nm`, where no
 * rule reaches it: it painted as bare text. This reads the painted tag, not
 * the stylesheet: every `.wel-bench .tag.in` must sit inside `.mn`, be
 * inline-block and have a real background. At least one must exist, so a
 * selector that stops matching fails instead of passing on nothing. */
import { evalIn } from './dom.mjs';
import { land } from './page-state.mjs';

const PROBE = `(() => {
  const tags = [...document.querySelectorAll('.wel-bench .tag.in')];
  return JSON.stringify(tags.map(t => {
    const cs = getComputedStyle(t);
    return { text: t.textContent, inMn: !!t.closest('.mn'), display: cs.display, bg: cs.backgroundColor };
  }));
})()`;

export async function welcomeTagPass(c, origin, rec) {
  await land(c, origin, { record: 'wiped', ready: `document.querySelector('#view-welcome')?.hidden === false` });
  await evalIn(c, `document.querySelector('#welTabScreen').click()`);
  const tags = JSON.parse(await evalIn(c, PROBE));
  rec.check(tags.length, 'no .wel-bench .tag.in on the On screen tab');
  tags.forEach((t, i) => {
    rec.check(t.inMn, `tag ${i} ("${t.text}") is not inside .mn`);
    rec.check(t.display === 'inline-block', `tag ${i} has display ${t.display}, want inline-block`);
    rec.check(t.bg !== 'transparent' && t.bg !== 'rgba(0, 0, 0, 0)', `tag ${i} has no background (${t.bg})`);
  });
  rec.ok(`${tags.length} "just on" tag(s) on the welcome On screen tab, each inside .mn, inline-block, with a background`);
}
