import { setWidth, TODAY_HOME, navigateAndWaitForCard } from './dom.mjs';
import { tap, evalJSON, typeIn } from './sheet-drive.mjs';
import { goRich } from './fixtures.mjs';

/* #142's own guard (docs/specs/142-settings-groups.md's Proof section, "Group
 * look" row): Settings adopted the app's shared `.pgrp`/`.prow` grammar, and
 * the four claims a node test cannot make about that -- because they are
 * about the CASCADE, not the markup -- are read back here, in a real
 * browser, at both widths the row names (320 and 390) and both themes:
 *
 *   1. No `.pgrp` carries a border (a bespoke `.side-box` border sneaking
 *      back in, or a dark-theme rule punching one through).
 *   2. Every VISIBLE `h2.pgrp-h` and `p.pgrp-f`'s own TEXT starts 32px from
 *      the screen edge -- the `.wrap` gutter (16px) plus the Settings
 *      modifier's own 1rem (item 3) -- read from a live
 *      `getBoundingClientRect()` plus computed `padding-left`, not the two
 *      numbers added by hand. `#persistNote` ships `hidden` (Decision 6) and
 *      only #backupFootnote's `.pgrp-f` is on screen in the ordinary run
 *      this check drives, so a `[hidden]` element's own rect (all zero,
 *      unlike its rem-based padding, which resolves without layout) must not
 *      be measured as if it were painted.
 *   3. Every header reads sentence case -- computed `text-transform: none`,
 *      not the old `.set-h`/`.side-hd` eyebrow's upper case, and
 *      `letter-spacing` no wider than normal, not that eyebrow's tracked-out
 *      positive spacing. `h1,h2,h3,h4` all carry a small NEGATIVE tracking
 *      app-wide (app.css :49) that a literal `letter-spacing: normal` would
 *      wrongly flag, so this checks the sign, not the value.
 *   4. Only one VISIBLE `p.pgrp-f` sits between one `.pgrp` and the next --
 *      "one footnote per group" (item 5), read from the live sibling chain.
 *
 * `no visible .btn or .linkish control` (item 2) and "every header is an
 * h2.pgrp-h, and there are exactly three" (item 4's other half) are already
 * pinned by test/settings-look.test.js at the markup seam; nothing here
 * repeats them. */
const WIDTHS = [320, 390];
const TOL = 1;

const READ_LOOK = `JSON.stringify((() => {
  const view = document.getElementById('view-settings');
  if (!view) return null;
  const headers = [...view.querySelectorAll('h2.pgrp-h')];
  const groups = [...view.querySelectorAll('.pgrp')];
  const bordered = groups.filter(g => {
    const cs = getComputedStyle(g);
    return parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
  }).map(g => g.className);
  const insets = [...headers, ...view.querySelectorAll('p.pgrp-f')].filter(el => !el.hidden).map(el => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { text: el.textContent.trim().slice(0, 24), left: r.left + parseFloat(cs.paddingLeft),
      textTransform: cs.textTransform, letterSpacing: cs.letterSpacing };
  });
  const footnoteCounts = groups.map(g => {
    let n = 0;
    let sib = g.nextElementSibling;
    while (sib && !sib.matches('.pgrp, h2.pgrp-h')) { if (sib.matches('p.pgrp-f') && !sib.hidden) n++; sib = sib.nextElementSibling; }
    return n;
  });
  return { headerCount: headers.length, bordered, insets, footnoteCounts };
})())`;

/* #265: the Settings policy controls, driven in the page and read back from
 * the state they write (`team().settings`, `state.ui`, `state.teamName`) and
 * from the field or button the coach sees. Every control is put back to what
 * the rich fixture had before this returns -- later rows read the same state. */
const READ_STATE = `(async () => {
  const s = await import('/state.js');
  const t = s.team().settings, g = s.game();
  const on = id => [...document.querySelectorAll(id + ' button')].filter(b => b.classList.contains('on'))
    .map(b => b.textContent + ':' + b.getAttribute('aria-pressed'));
  return JSON.stringify({
    maxSubs: t.maxSubs, tieBreak: t.tieBreak, minMinutes: t.minMinutes, seasonDefault: t.seasonDefault,
    periods: t.periods, periodMinutes: t.periodMinutes, theme: s.state.ui.theme, teamName: s.state.teamName,
    game: { periods: g.periods, periodMinutes: g.periodMinutes, useCarryover: g.useCarryover, useSeasonTargets: g.useSeasonTargets },
    pressed: [...document.querySelectorAll('#view-settings .seg button')].filter(b => b.getAttribute('aria-pressed') === 'true')
      .map(b => b.closest('.seg').id + '/' + b.textContent),
    on: on('#view-settings .seg'),
    fields: { minMins: document.querySelector('#minMins').value, periods: document.querySelector('#setPeriods').value,
      perMins: document.querySelector('#setPerMins').value },
    html: document.documentElement.getAttribute('data-theme'),
  });
})()`;
const readState = c => evalJSON(c, READ_STATE);

// The one button a seg shows as `.on`, by its label.
async function onlyOn(c, ck, name, sel, label) {
  const on = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('${sel} button.on')].map(b => b.textContent))`);
  ck(JSON.stringify(on) === JSON.stringify([label]), `the ${name} seg shows ${JSON.stringify(on)} on, want ["${label}"]`);
}

async function settingsControlsPass(c, ck) {
  await tap(c, `document.querySelector('#settingsBtn').click()`);
  const before = await readState(c);

  /* A. Subs per break. */
  for (const n of [1, 5, 5]) {
    await tap(c, `document.querySelector('#maxSubsSeg [data-subs="${n}"]').click()`);
    const r = await readState(c);
    ck(r.maxSubs === n, `tapping subs ${n} left settings.maxSubs at ${r.maxSubs}`);
    const seg = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('#maxSubsSeg button')]
      .map(b => [b.textContent, b.classList.contains('on'), b.getAttribute('aria-pressed')]))`);
    ck(JSON.stringify(seg.filter(b => b[1] || b[2] === 'true')) === JSON.stringify([[String(n), true, 'true']]),
      `after subs ${n} the buttons read ${JSON.stringify(seg)}, want only "${n}" on and pressed`);
  }
  await tap(c, `document.querySelector('#maxSubsSeg [data-subs="${before.maxSubs}"]').click()`);
  ck((await readState(c)).maxSubs === before.maxSubs, 'subs per break was not restored');

  /* B. Tie-break. */
  for (const [v, label] of [['levels', 'Best players'], ['behind', 'Furthest behind']]) {
    await tap(c, `document.querySelector('#tieBreakSeg [data-tie="${v}"]').click()`);
    const r = await readState(c);
    ck(r.tieBreak === v, `tapping "${label}" left settings.tieBreak at "${r.tieBreak}", want "${v}"`);
    await onlyOn(c, ck, 'tie-break', '#tieBreakSeg', label);
  }

  /* C. Season default: the team's default moves, the open game's own switch does not. */
  for (const [v, want, label] of [['1', true, 'Evening out the season'], ['0', false, 'Fair on its own']]) {
    await tap(c, `document.querySelector('#seasonDefSeg [data-sdef="${v}"]').click()`);
    const r = await readState(c);
    ck(r.seasonDefault === want, `tapping "${label}" left settings.seasonDefault at ${r.seasonDefault}, want ${want}`);
    ck(JSON.stringify(r.game) === JSON.stringify(before.game), `the open game's own settings moved to ${JSON.stringify(r.game)}, want ${JSON.stringify(before.game)}`);
    await onlyOn(c, ck, 'season-default', '#seasonDefSeg', label);
  }

  /* D. League floor (a number field commits on `change`, so typeIn fires that): each typed value, what took, and what the field then reads. */
  const FLOOR = [['12', 12], ['99', 60], ['-4', 0], ['12.6', 13], ['', 0]];
  for (const [typed, want] of FLOOR) {
    await typeIn(c, '#minMins', typed, 'change');
    const r = await readState(c);
    ck(r.minMinutes === want, `typing "${typed}" in the league floor left settings.minMinutes at ${r.minMinutes}, want ${want}`);
    ck(r.fields.minMins === String(want), `typing "${typed}" in the league floor left the field reading "${r.fields.minMins}", want "${want}"`);
    if (typed !== '12') continue;
    // With 12 set, the floor is a fixed row in the plan's Rules.
    await tap(c, TODAY_HOME);
    await tap(c, `document.querySelector('.today-game').click()`);
    await tap(c, `document.getElementById('phraseRules').click()`);
    const rows = await evalJSON(c, `JSON.stringify([...document.querySelectorAll('#constraints .prow')].map(r => r.textContent.trim()))`);
    ck(rows.includes('Everyone plays at least 12 min'), `the plan's Rules read ${JSON.stringify(rows)}, want a row "Everyone plays at least 12 min"`);
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    await tap(c, `document.getElementById('backBtn').click()`);
    await tap(c, `document.querySelector('#settingsBtn').click()`);
  }
  await typeIn(c, '#minMins', String(before.minMinutes), 'change');

  /* E. Game format: clamped to 1-8 periods and 1-40 minutes, blank is the
   * default, and the game already open keeps its own format. */
  const FORMAT = [
    ['#setPeriods', 'periods', 'periods', [['0', 1], ['9', 8], ['', 4]]],
    ['#setPerMins', 'perMins', 'periodMinutes', [['0', 1], ['41', 40], ['', 8]]],
  ];
  for (const [sel, key, setting, rows] of FORMAT) {
    for (const [typed, want] of rows) {
      await typeIn(c, sel, typed, 'change');
      const r = await readState(c);
      ck(r[setting] === want, `typing "${typed}" in ${sel} left settings.${setting} at ${r[setting]}, want ${want}`);
      ck(r.fields[key] === String(want), `typing "${typed}" in ${sel} left the field reading "${r.fields[key]}", want "${want}"`);
      ck(JSON.stringify(r.game) === JSON.stringify(before.game), `typing in ${sel} moved the open game to ${JSON.stringify(r.game)}, want ${JSON.stringify(before.game)}`);
    }
  }
  await typeIn(c, '#setPeriods', String(before.periods), 'change');
  await typeIn(c, '#setPerMins', String(before.periodMinutes), 'change');

  /* F. Theme. */
  for (const [t, label] of [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Automatic']]) {
    await tap(c, `document.querySelector('#themeSeg [data-theme="${t}"]').click()`);
    const r = await readState(c);
    const want = t !== 'auto' ? t
      : await evalJSON(c, `JSON.stringify(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')`);
    ck(r.theme === t, `tapping "${label}" left state.ui.theme at "${r.theme}", want "${t}"`);
    ck(r.html === want, `tapping "${label}" left <html data-theme> at "${r.html}", want "${want}"`);
    await onlyOn(c, ck, 'theme', '#themeSeg', label);
  }
  await tap(c, `document.querySelector('#themeSeg [data-theme="${before.theme}"]').click()`);

  /* G. Team name: typed, kept in state, and still there after a reload. */
  const NAME = 'Hawks United';
  await typeIn(c, '#teamName', NAME);
  ck((await readState(c)).teamName === NAME, `typing in #teamName left state.teamName at "${(await readState(c)).teamName}", want "${NAME}"`);
  await navigateAndWaitForCard(c, await evalJSON(c, `JSON.stringify(location.href)`));
  await tap(c, `document.querySelector('#settingsBtn').click()`);
  const kept = await evalJSON(c, `(async () => JSON.stringify({ name: (await import('/state.js')).state.teamName,
    field: document.querySelector('#teamName').value }))()`);
  ck(kept.name === NAME && kept.field === NAME, `after a reload the team name reads ${JSON.stringify(kept)}, want "${NAME}" in both`);
  await typeIn(c, '#teamName', before.teamName);
  ck((await readState(c)).teamName === before.teamName, 'the team name was not restored');

  await tap(c, TODAY_HOME);
}

export async function settingsLookPass(c, origin) {
  const problems = [];
  const ck = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
  let measured = 0;

  try {
    for (const theme of ['light', 'dark']) {
      await goRich(c, origin, { theme });
      for (const width of WIDTHS) {
        await setWidth(c, width);
        await tap(c, `document.querySelector('#settingsBtn').click()`);
        const look = await evalJSON(c, READ_LOOK);
        if (!look) { problems.push(`${theme}/${width}px: #view-settings not open -- nothing to measure`); continue; }

        if (look.bordered.length) {
          problems.push(`${theme}/${width}px: ${look.bordered.length} .pgrp group(s) carry a border`);
        }
        for (const ins of look.insets) {
          measured++;
          if (Math.abs(ins.left - 32) > TOL) {
            problems.push(`${theme}/${width}px: "${ins.text}" text starts at ${ins.left.toFixed(1)}px, want 32px`);
          }
          if (ins.textTransform !== 'none') {
            problems.push(`${theme}/${width}px: "${ins.text}" text-transform is ${ins.textTransform}, want none`);
          }
          if (ins.letterSpacing !== 'normal' && parseFloat(ins.letterSpacing) > 0) {
            problems.push(`${theme}/${width}px: "${ins.text}" letter-spacing is ${ins.letterSpacing}, want normal or tighter, not tracked out`);
          }
        }
        const overCount = look.footnoteCounts.filter(n => n > 1).length;
        if (overCount) problems.push(`${theme}/${width}px: ${overCount} group(s) show more than one footnote`);

        await tap(c, TODAY_HOME);
      }
    }

    await settingsControlsPass(c, ck);

    // Rule 2a: a run that never found #view-settings open measured nothing.
    if (measured === 0 && problems.length === 0) {
      problems.push('no header or footnote was measured in any pass -- a broken probe, not a pass');
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await setWidth(c, 390);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${measured} header/footnote(s) at 32px, sentence case, no .pgrp border, one footnote per group -- ${WIDTHS.join('/')}px, light and dark; the policy controls write what they say`,
  };
}
