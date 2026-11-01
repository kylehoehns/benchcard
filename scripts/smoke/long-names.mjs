/* #422's own guard (docs/specs/422-large-text-long-names.md, Proof table):
 * long names, decimal minutes and large text on the timeline, the player
 * sheet's header, Today's Team/Season lines, the team switcher and Season's
 * bars. Four cells -- 320x568 and 390x844, each at 16px and 32px text -- with
 * reduced motion, on two records built from RICH: `LONG`, real-length names
 * and the team "Northside Thunder Gold", and `DECIMAL`, nine of those players
 * at "3x a period" (decimal totals, an uneven plan with FEWEST rows).
 *
 * Reuses rather than re-derives: `land`, `REDUCED_MOTION`, `SETTLE`, `RICH`,
 * `TODAY_LANDING`, `GAMES_VIEW_READY`, `TOUCH_MIN`, short-phone.mjs's cell
 * shape. Expected values are the spec's: names are the player's own, the
 * layout per cell is written down in `CELLS` (the one-row timeline starts at
 * a 20em container, which only 390/16 reaches). Rule 2a (/new-guard): zero
 * rows, zero names, no extreme row, a sheet that never opened -- each fails
 * rather than measuring nothing. */
import { evalIn, SETTLE, SOLID_FALLBACK_MEDIA, alpha } from './dom.mjs';
import { TOUCH_MIN } from './sizes.mjs';
import { land, setMedia } from './page-state.mjs';
import { REDUCED_MOTION } from './clip-sweep.mjs';
import { RICH, TODAY_LANDING, GAMES_VIEW_READY } from './fixtures.mjs';
import { firstLine } from './verdict.mjs';

export const LONG_NAMES_CHECK =
  'long names: timeline, player sheet, Today lines, team switcher and Season bars at 320x568 and 390x844, 16px and 32px text';

const NAMES = ['Alexandria Montgomery-Okafor', 'Bartholomew Christopherson', 'Devon Ellis', 'Ana Reyes',
  'Jordan Bell', 'Maximiliano Fitzgerald', 'Sam Okafor', 'Riley Novak', 'Casey Lindqvist', 'Theo Alvarez', 'Nia Brooks'];
const TEAM = 'Northside Thunder Gold';
const SHEET_NAME = 'Bartholomew Christopherson';

const named = (n = NAMES.length) => {
  const r = JSON.parse(JSON.stringify(RICH));
  r.teams[0].name = TEAM;
  r.teams[0].players = r.teams[0].players.slice(0, n);
  r.teams[0].players.forEach((p, i) => { p.name = NAMES[i]; });
  return r;
};
const LONG = named();
const DECIMAL = (() => {
  const r = named(9);
  for (const g of r.teams[0].days[0].games) { g.granMode = 'perPeriod'; g.granValue = 3; }
  return r;
})();

// `oneRow`: the timeline is the one-row layout (`@container (min-width: 20em)`),
// which only 390/16 reaches. `numBelow`: the 19em block's stacked row, where
// the name takes the whole row and the number sits on the word's line under it.
const CELLS = [
  { width: 320, height: 568, textPx: 16, oneRow: false, numBelow: false },
  { width: 320, height: 568, textPx: 32, oneRow: false, numBelow: true },
  { width: 390, height: 844, textPx: 16, oneRow: true, numBelow: false },
  { width: 390, height: 844, textPx: 32, oneRow: false, numBelow: true },
];

const TL_PROBE = `JSON.stringify((() => {
  const tl = document.querySelector('.tl');
  const rows = [...document.querySelectorAll('.tl-row')].map(r => {
    const nm = r.querySelector('.tl-lab .nm'), num = r.querySelector('.tl-tot .num'), ex = r.querySelector('.tl-tot .ex');
    const rr = r.getBoundingClientRect(), nr = num.getBoundingClientRect(), nb = r.querySelector('.tl-name').getBoundingClientRect();
    const eb = ex.getBoundingClientRect(), tb = r.querySelector('.tl-track')?.getBoundingClientRect();
    return { name: nm.textContent, cut: nm.scrollWidth > nm.clientWidth + 1, nameW: nb.width, numW: nr.width, num: num.textContent,
      numRight: nr.right, numTop: nr.top - rr.top, numBesideName: nr.top + nr.height / 2 > nb.top && nr.top + nr.height / 2 < nb.bottom, numAboveTrack: tb ? tb.top - nr.bottom : null, wordHitsNum: eb.width > 0 && eb.left < nr.right - 0.5 && eb.right > nr.left + 0.5 && eb.top < nr.bottom - 0.5 && eb.bottom > nr.top + 0.5, wordOut: eb.width > 0 && eb.right > rr.right + 0.5, word: ex.textContent,
      wordShown: !!ex.textContent && ex.getClientRects().length > 0 && eb.height > 0 && getComputedStyle(ex).visibility !== 'hidden' };
  });
  return { even: !!tl && tl.classList.contains('even'), rows };
})())`;

async function timelineAt(c, origin, rec, cell, where, label, record, names) {
  await land(c, origin, { record: { ...record, view: 'games' }, width: cell.width, height: cell.height, textPx: cell.textPx,
    media: REDUCED_MOTION, ready: GAMES_VIEW_READY });
  await evalIn(c, SETTLE);
  const d = JSON.parse(await evalIn(c, TL_PROBE));
  const at = `timeline (${label}) at ${where}`;
  if (!rec.check(d.rows.length === names.length, `${at}: ${d.rows.length} rows, want ${names.length} -- nothing was measured`)) return;
  if (!cell.oneRow) {
    const cut = d.rows.filter(r => r.cut).map(r => r.name);
    rec.check(!cut.length, `${at}: names cut with an ellipsis: ${cut.join(', ')}`);
    rec.check(d.rows.every((r, i) => r.name === names[i]),
      `${at}: names read ${d.rows.map(r => r.name).join(' | ')}, want the players' own`);
  }
  const extremes = d.rows.filter(r => r.word);
  if (label === 'decimal' || !d.even) {
    if (rec.check(extremes.length > 0, `${at}: no MOST/FEWEST row -- nothing was measured`)) {
      const hidden = extremes.filter(r => !r.wordShown).map(r => r.name);
      rec.check(!hidden.length, `${at}: MOST/FEWEST word not shown on ${hidden.join(', ')}`);
      const hit = extremes.filter(r => r.wordHitsNum || r.wordOut).map(r => r.name);
      rec.check(!hit.length, `${at}: MOST/FEWEST overlaps the total or runs past the row on ${hit.join(', ')}`);
      if (!cell.oneRow) {
        // A row's name column must not depend on its word. Beside the number,
        // the name's width plus its own total's (which differs by digits) is
        // the same on every row; with the number below, the name's alone is.
        const col = r => (cell.numBelow ? r.nameW : r.nameW + r.numW);
        let pairs = 0;
        for (const e of extremes) for (const p of d.rows.filter(r => !r.word)) {
          pairs++;
          rec.check(Math.abs(col(e) - col(p)) <= 1,
            `${at}: ${e.name} (${e.word}) has a name column ${Math.round(col(e))}px wide, ${p.name} (no word) ${Math.round(col(p))}px`);
        }
        rec.check(pairs > 0, `${at}: no FEWEST/MOST row has a plain row to compare with -- nothing was compared`);
      }
    }
  }
  if (cell.oneRow) {
    // One row means one line: the total sits level with its own name, not
    // dropped onto a line of its own under the track.
    const off = d.rows.filter(r => !r.numBesideName).map(r => r.name);
    rec.check(!off.length, `${at}: the total is not level with the name on ${off.join(', ')}`);
  }
  if (label === 'decimal') {
    const r0 = d.rows[0];
    rec.check(d.rows.every(r => Math.abs(r.numRight - r0.numRight) <= 1),
      `${at}: totals end at x ${d.rows.map(r => Math.round(r.numRight)).join(', ')}, want one edge`);
    // Beside the name, every total sits at one offset from its row's top; on
    // the word's line, at one offset above its own bar (names wrap to
    // different heights, so the row's top is not the reference there).
    const off = r => (cell.numBelow ? r.numAboveTrack : r.numTop);
    if (rec.check(d.rows.every(r => off(r) !== null), `${at}: a row has no track to measure the total against`)) {
      rec.check(d.rows.every(r => Math.abs(off(r) - off(r0)) <= 1),
        `${at}: totals sit ${d.rows.map(r => Math.round(off(r))).join(', ')}px ${cell.numBelow ? 'above their bar' : "below their row's top"}, want one offset`);
    }
    rec.check(d.rows.some(r => r.num.includes('.')), `${at}: no decimal total -- nothing was measured`);
  }
}

const landToday = (c, origin, cell) => land(c, origin, { record: { ...LONG, view: 'today' }, ...TODAY_LANDING,
  width: cell.width, height: cell.height, textPx: cell.textPx, media: REDUCED_MOTION });

const SHEET_PROBE = `JSON.stringify((() => {
  const box = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height }; };
  const d = document.getElementById('sheetPlayer');
  return { open: !!(d && d.open), title: box(document.getElementById('sheetPlayerTitle')), titleText: document.getElementById('sheetPlayerTitle')?.textContent || '',
    close: box(document.getElementById('sheetPlayerClose')), sheet: box(d),
    vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight };
})())`;

async function sheetAt(c, origin, rec, cell, where) {
  await landToday(c, origin, cell);
  await evalIn(c, `document.querySelector('#todayTeam').click()`);
  await evalIn(c, SETTLE);
  const opened = await evalIn(c, `(() => { const b = [...document.querySelectorAll('#view-team button, #view-team [role=button]')].find(b => b.textContent.includes(${JSON.stringify(SHEET_NAME)})); if (!b) return false; b.click(); return true; })()`);
  await evalIn(c, SETTLE);
  const d = JSON.parse(await evalIn(c, SHEET_PROBE));
  const at = `player sheet at ${where}`;
  if (!rec.check(opened && d.open && !!d.close && !!d.title, `${at}: the sheet for ${SHEET_NAME} never opened -- nothing was measured`)) return;
  rec.check(d.titleText === SHEET_NAME, `${at}: title reads "${d.titleText}", want "${SHEET_NAME}"`);
  const k = d.close;
  rec.check(k.left >= -0.5 && k.top >= -0.5 && k.right <= d.vw + 0.5 && k.bottom <= d.vh + 0.5,
    `${at}: #sheetPlayerClose spans x ${Math.round(k.left)}-${Math.round(k.right)} in a ${d.vw}px viewport`);
  rec.check(k.width >= TOUCH_MIN - 0.5 && k.height >= TOUCH_MIN - 0.5,
    `${at}: #sheetPlayerClose is ${Math.round(k.width)}x${Math.round(k.height)}, want >= ${TOUCH_MIN}`);
  const t = d.title;
  rec.check(!(t.left < k.right - 0.5 && t.right > k.left + 0.5 && t.top < k.bottom - 0.5 && t.bottom > k.top + 0.5),
    `${at}: the title (x ${Math.round(t.left)}-${Math.round(t.right)}) overlaps the close button (x ${Math.round(k.left)}-${Math.round(k.right)})`);
  rec.check(t.right <= d.sheet.right + 0.5 && t.left >= d.sheet.left - 0.5,
    `${at}: the title spans x ${Math.round(t.left)}-${Math.round(t.right)}, outside the sheet's ${Math.round(d.sheet.left)}-${Math.round(d.sheet.right)}`);
}

// #501: the team name is a plain large title, so #teamBtn paints no chip fill.
const TEAM_FILL_READ = `(() => { const b = getComputedStyle(document.getElementById('teamBtn'));
  return { bg: b.backgroundColor, bf: b.backdropFilter || b.webkitBackdropFilter,
    hovered: document.getElementById('teamBtn').matches(':hover') }; })()`;
// Every style rule, in any nesting of @media / @supports (a CSSSupportsRule's
// children are in the CSSOM even when its condition is false, which reaches the
// `@supports not (backdrop-filter)` copy headless Chrome cannot apply), whose
// selector list holds `#teamBtn` itself and paints a fill or blur. A style
// rule is checked AND descended into: an empty CSSRuleList is truthy.
const TEAM_FILL_RULES = `JSON.stringify((() => {
  const out = [];
  const walk = (rules, where) => { for (const r of rules) {
    if (r.selectorText && r.style && r.selectorText.split(',').some(s => /(^|[\\s>+~])#teamBtn(?![\\w-])/.test(s.trim()))) {
      for (const p of ['background', 'background-color', 'backdrop-filter', '-webkit-backdrop-filter']) {
        if (r.style.getPropertyValue(p)) out.push(where + r.selectorText + ' { ' + p + ': ' + r.style.getPropertyValue(p) + ' }');
      }
    }
    if (r.cssRules) walk(r.cssRules, r.conditionText ? where + '@' + r.conditionText + ' ' : where);
  } };
  let sheets = 0;
  for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; } sheets++; walk(rs, ''); }
  return { out, sheets };
})())`;
// What the press and hover fills must paint: the resolved colors of --chip
// (hover) and --chip-hover (press), read through a probe element.
const TOKEN_COLOR = t => `(() => { const e = document.createElement('i'); e.style.background = 'var(${t})';
  document.body.append(e); const c = getComputedStyle(e).backgroundColor; e.remove(); return c; })()`;
// #501: force :active (and :hover, where the page matches (hover: hover)) on
// #teamBtn with CDP and read its fill back. Forced state is cleared afterwards.
async function forcedFill(c, pseudo) {
  await c.send('DOM.enable'); await c.send('CSS.enable');
  const { root } = await c.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#teamBtn' });
  if (!nodeId) return null;
  await c.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [pseudo] });
  await evalIn(c, SETTLE); // a transition would otherwise be read mid-way
  try { return await evalIn(c, `getComputedStyle(document.getElementById('teamBtn')).backgroundColor`); }
  finally { await c.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }); }
}
const TODAY_PROBE = `JSON.stringify((() => {
  const subs = [...document.querySelectorAll('.today-entry-sub')].map(s => {
    const row = s.closest('.today-entry'), rb = row.getBoundingClientRect(), sb = s.getBoundingClientRect();
    const a = getComputedStyle(row, '::after'), chevW = parseFloat(a.width) || 0, right = parseFloat(a.right);
    const left = rb.right - right - chevW;
    return { text: s.textContent, cut: s.scrollWidth > s.clientWidth + 1, subRight: sb.right, rowLeft: rb.left, rowRight: rb.right,
      chev: a.content !== 'none' && a.content !== 'normal', chevLeft: left, chevRight: left + chevW, chevPos: a.position,
      chevTop: rb.top + (parseFloat(a.top) || 0), rowTop: rb.top, rowBottom: rb.bottom };
  });
  const l = document.getElementById('teamBtnLabel'), lb = l.getBoundingClientRect(), cs = getComputedStyle(l);
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
  const probe = document.createElement('span'); probe.style.fontSize = 'var(--fs-headline)'; document.body.append(probe);
  const headlinePx = parseFloat(getComputedStyle(probe).fontSize); probe.remove();
  return { subs, label: l.textContent, labelRight: lb.right, labelLeft: lb.left, lines: Math.round(lb.height / lh),
    h1Px: parseFloat(getComputedStyle(document.querySelector('.today-h1')).fontSize), headlinePx, wordCut: l.scrollWidth > l.clientWidth + 1,
    vw: document.documentElement.clientWidth, em: parseFloat(cs.fontSize),
    chevRight: document.querySelector('#teamBtn .teambtn-chev').getBoundingClientRect().right, fill: ${TEAM_FILL_READ} };
})())`;

async function todayAt(c, origin, rec, cell, where) {
  await landToday(c, origin, cell);
  await evalIn(c, SETTLE);
  const d = JSON.parse(await evalIn(c, TODAY_PROBE));
  if (rec.check(d.subs.length === 2, `Today at ${where}: ${d.subs.length} .today-entry-sub lines, want 2 (Team, Season) -- nothing was measured`)) {
    for (const s of d.subs) {
      const at = `Today line "${s.text}" at ${where}`;
      rec.check(!s.cut, `${at}: cut off`);
      rec.check(s.chev && s.chevPos === 'absolute' && s.chevLeft >= s.rowLeft - 0.5 && s.chevRight <= s.rowRight + 0.5 &&
        s.chevTop >= s.rowTop - 0.5 && s.chevTop <= s.rowBottom + 0.5 && s.subRight <= s.chevLeft + 0.5,
        `${at}: the chevron (${s.chevPos}, x ${Math.round(s.chevLeft)}-${Math.round(s.chevRight)}) is not inside the row at the right edge, clear of the text`);
    }
  }
  const at = `#teamBtnLabel at ${where}`;
  if (!rec.check(d.label === TEAM, `${at}: reads "${d.label}", want "${TEAM}" -- nothing was measured`)) return;
  rec.check(d.labelRight <= d.vw + 0.5 && d.labelLeft >= -0.5, `${at}: spans x ${Math.round(d.labelLeft)}-${Math.round(d.labelRight)} in a ${d.vw}px viewport`);
  // #501: no container, so the viewport is the edge the name keeps 0.5em from.
  rec.check(d.labelLeft >= 0.5 * d.em - 0.5 && d.chevRight <= d.vw - 0.5 * d.em + 0.5,
    `${at}: the name starts at x ${Math.round(d.labelLeft)} and the chevron ends at x ${Math.round(d.chevRight)} in a ${d.vw}px viewport, want 0.5em (${d.em / 2}px) clear of both edges`);
  const noFill = (f, media) => rec.check(!f.hovered && alpha(f.bg) === 0 && (!f.bf || f.bf === 'none'),
    f.hovered ? `#teamBtn at ${where}${media}: a pointer is over the button, so its resting fill was not measured`
      : `#teamBtn at ${where}${media}: paints ${f.bg} with backdrop-filter ${f.bf}, want no fill (a plain large title, not a chip)`);
  noFill(d.fill, '');
  // The press (and a pointer hover) fill: --chip-hover and --chip. Hover only
  // where (hover: hover) matches; the suite's touch emulation makes it false.
  const press = await forcedFill(c, 'active');
  const pressWant = await evalIn(c, TOKEN_COLOR('--chip-hover'));
  rec.check(press === pressWant && alpha(press) > 0, `#teamBtn at ${where}: forced :active paints ${press}, want --chip-hover ${pressWant}`);
  if (await evalIn(c, `matchMedia('(hover: hover)').matches`)) {
    const hov = await forcedFill(c, 'hover');
    const hovWant = await evalIn(c, TOKEN_COLOR('--chip'));
    rec.check(hov === hovWant && alpha(hov) > 0, `#teamBtn at ${where}: forced :hover paints ${hov}, want --chip ${hovWant}`);
  }
  const rules = JSON.parse(await evalIn(c, TEAM_FILL_RULES));
  if (rec.check(rules.sheets > 0, `#teamBtn at ${where}: no readable style sheet -- nothing was walked`)) {
    rec.check(rules.out.length === 0, `#teamBtn at ${where}: a rule on #teamBtn itself paints a fill: ${rules.out.join('; ')}`);
  }
  for (const [feature, value] of SOLID_FALLBACK_MEDIA) {
    await setMedia(c, [...REDUCED_MOTION, { name: feature, value }]);
    await evalIn(c, SETTLE);
    noFill(JSON.parse(await evalIn(c, `JSON.stringify(${TEAM_FILL_READ})`)), ` under ${feature}: ${value}`);
  }
  await setMedia(c, REDUCED_MOTION);
  // At large text the heading steps down to --fs-headline and the name wraps to
  // at most two lines, each word whole on its line (no word is wider than the
  // label). At 16px the one-line ellipsis is the deliberate design, so only the
  // viewport bound above is asked there (docs/specs/422's decisions).
  if (cell.textPx === 32) {
    rec.check(Math.abs(d.h1Px - d.headlinePx) <= 0.5, `${at}: the heading is ${d.h1Px}px, want --fs-headline (${d.headlinePx}px)`);
    rec.check(d.lines <= 2, `${at}: ${d.lines} lines, want at most 2`);
    rec.check(!d.wordCut, `${at}: a word of the team name is wider than its line, so it is cut`);
  }
}

async function seasonAt(c, origin, rec, cell, where) {
  await landToday(c, origin, cell);
  await evalIn(c, `document.querySelector('#todaySeason').click()`);
  await evalIn(c, SETTLE);
  const w = JSON.parse(await evalIn(c, `JSON.stringify([...document.querySelectorAll('.sn-list .sn-row')].map(r => r.querySelector('.sn-track').getBoundingClientRect().width))`));
  const at = `Season bars at ${where}`;
  if (!rec.check(w.length >= 2, `${at}: ${w.length} rows -- nothing was measured`)) return;
  rec.check(w.every(x => Math.abs(x - w[0]) <= 1), `${at}: track widths ${w.map(Math.round).join(', ')}, want one width`);
}

export async function longNamesPass(c, origin, rec) {
  let cells = 0;
  for (const cell of CELLS) {
    const where = `${cell.width}x${cell.height}/${cell.textPx}px`;
    try {
      await timelineAt(c, origin, rec, cell, where, 'long', LONG, NAMES);
      await timelineAt(c, origin, rec, cell, where, 'decimal', DECIMAL, NAMES.slice(0, 9));
      await sheetAt(c, origin, rec, cell, where);
      await todayAt(c, origin, rec, cell, where);
      await seasonAt(c, origin, rec, cell, where);
      const vp = JSON.parse(await evalIn(c, `JSON.stringify({ w: document.documentElement.clientWidth, h: document.documentElement.clientHeight,
        px: parseFloat(getComputedStyle(document.documentElement).fontSize) })`));
      if (rec.check(vp.w === cell.width && vp.h === cell.height && vp.px === cell.textPx,
        `${where}: the page measured ${vp.w}x${vp.h} at ${vp.px}px -- nothing was measured`)) cells++;
    } catch (e) {
      rec.fail(`${where}: ${firstLine(e)}`);
    }
  }
  rec.check(cells === CELLS.length, `only ${cells} of ${CELLS.length} cells were measured`);
  rec.ok(`names, totals, player sheet, Today lines, team label and Season bars hold in ${CELLS.length} cells, 2 records`);
}
