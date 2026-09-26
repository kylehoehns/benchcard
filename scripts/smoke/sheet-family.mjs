import { goRich } from './fixtures.mjs';
import { evalJSON, tap } from './sheet-drive.mjs';

/* #143's own guard (docs/specs/143-sheets.md's Proof section): a new check,
 * run once in light and once in dark (RICH fixture), covering:
 *   -- 1/7: the five list sheets (#sheetWho, #sheetInterval, #sheetFormat,
 *      #sheetPlan, #sheetCard) all compute `--sheet`, and every one holds
 *      its rows in a `.pgrp` (`--surface`) inset 16px from each edge;
 *   -- 2/3: the Sub interval sheet's chosen row is a transparent-background,
 *      `--ink`-text row carrying a weight-700 `.prow-check` mark, not a
 *      filled bar -- the unchosen row beside it carries no mark at all.
 *      (First-run step 2's own chosen row is the same claim on a different
 *      screen -- `first-run-flow.mjs`'s `stepTwoDefaults` already drives
 *      that flow for other reasons and proves it there, rather than this
 *      file re-driving a second wiped landing just to read the same CSS.)
 *   -- 4: Who's here's badge is the roster's own `.av` -- `initials(p)` in
 *      the player's `colorOf(p.id)`, the same computed style a roster row's
 *      `.av` gets.
 * The card sheet's own geometry and border (item 5) and `#sheet`/`#frStage`
 * being untouched (item 8) are proved in `timeline-card-sheet.mjs` and
 * `first-run-flow.mjs` -- the Proof table's own "or timeline-card-sheet.mjs"
 * clause -- and are not repeated here.
 *
 * Every literal below is the spec's own (`docs/specs/143-sheets.md`, "What
 * would settle it" items 1 and 7), typed once as an `rgb()`/`rgba()`
 * string -- never a second call through `tokens-css.mjs` or any route the
 * app itself computes them through.
 */

const SHEET_LIGHT = 'rgb(241, 241, 245)', SHEET_DARK = 'rgb(20, 20, 22)';
const SURFACE_LIGHT = 'rgb(255, 255, 255)', SURFACE_DARK = 'rgb(28, 28, 30)';
const INK_LIGHT = 'rgb(28, 28, 30)', INK_DARK = 'rgb(244, 244, 246)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

// Every list sheet, in document order, with what opens it, what its own
// `.pgrp` is, and what closes it again -- `#sheetPlan`'s top-level group
// (Strategy/Format/etc.) is the one `openPlanSheet('rules', ...)` scrolls
// to, same as `sheet-spacing.mjs`'s own `checkAddRuleHeader`.
const SHEETS = [
  { dialog: '#sheetWho', open: "document.getElementById('phrasePlayers').click()",
    pgrp: '#sheetWhoBody .pgrp', close: "document.getElementById('sheetWhoClose').click()" },
  { dialog: '#sheetInterval', open: "document.getElementById('phraseInterval').click()",
    pgrp: '#sheetIntervalBody .pgrp', close: "document.getElementById('sheetIntervalClose').click()" },
  { dialog: '#sheetFormat', open: "document.getElementById('phraseFormat').click()",
    pgrp: '#sheetFormatBody .pgrp', close: "document.getElementById('sheetFormatClose').click()" },
  { dialog: '#sheetPlan', open: "document.getElementById('phraseRules').click()",
    pgrp: '#sheetPlan .pgrp', close: "document.getElementById('sheetPlanClose').click()" },
  { dialog: '#sheetCard', open: "document.getElementById('shareBtn').click()",
    pgrp: '#sheetCard .pgrp', close: "document.getElementById('sheetCardClose').click()" },
];

// Claim 1/7: open each sheet, read its own background and its first
// `.pgrp`'s background and inset -- x >= 16 from the left, and at least
// 16px shy of the dialog's own right edge (`dialog.bsheet` is full-width,
// per dom.mjs's own OVERFLOW_PROBE comment, so the dialog's own rect is the
// sheet's own edge to inset from).
async function backgroundAndGroupPass(c, ck, where, sheetWant, surfaceWant) {
  for (const s of SHEETS) {
    await tap(c, s.open);
    const m = await evalJSON(c, `(() => {
      const d = document.querySelector(${JSON.stringify(s.dialog)});
      const g = document.querySelector(${JSON.stringify(s.pgrp)});
      const dr = d.getBoundingClientRect();
      const gr = g ? g.getBoundingClientRect() : null;
      return JSON.stringify({
        open: d.open,
        sheetBg: getComputedStyle(d).backgroundColor,
        hasPgrp: !!g,
        pgrpBg: g ? getComputedStyle(g).backgroundColor : null,
        left: gr ? gr.left : null,
        rightInset: gr ? dr.right - gr.right : null,
      });
    })()`);
    ck(m.open, `${where}: ${s.dialog} did not open`);
    ck(m.sheetBg === sheetWant, `${where}: ${s.dialog}'s background is ${m.sheetBg}, want ${sheetWant} (--sheet)`);
    if (ck(m.hasPgrp, `${where}: ${s.dialog} has no .pgrp`)) {
      ck(m.pgrpBg === surfaceWant, `${where}: ${s.dialog}'s .pgrp background is ${m.pgrpBg}, want ${surfaceWant} (--surface)`);
      ck(m.left >= 15.5, `${where}: ${s.dialog}'s .pgrp left edge is ${m.left.toFixed(1)}px, want >= 16px (the group inset)`);
      ck(m.rightInset >= 15.5, `${where}: ${s.dialog}'s .pgrp right inset is ${m.rightInset.toFixed(1)}px, want >= 16px`);
    }
    await tap(c, s.close);
  }
}

// Claim 2/3: Sub interval's own chosen row.
async function chosenRowPass(c, ck, where, inkWant) {
  await tap(c, "document.getElementById('phraseInterval').click()");
  const m = await evalJSON(c, `(() => {
    const rows = [...document.querySelectorAll('#sheetIntervalBody .prow')];
    const on = rows.find(r => r.getAttribute('aria-pressed') === 'true');
    const off = rows.find(r => r.getAttribute('aria-pressed') === 'false');
    const mark = on ? on.querySelector('.prow-check') : null;
    return JSON.stringify({
      rows: rows.length,
      onBg: on ? getComputedStyle(on).backgroundColor : null,
      onFg: on ? getComputedStyle(on).color : null,
      hasMark: !!mark,
      markFg: mark ? getComputedStyle(mark).color : null,
      markWeight: mark ? getComputedStyle(mark).fontWeight : null,
      offHasMark: off ? !!off.querySelector('.prow-check') : null,
    });
  })()`);
  if (ck(m.rows > 1, `${where}: #sheetIntervalBody has ${m.rows} .prow row(s), want more than one`)) {
    ck(m.onBg === TRANSPARENT, `${where}: Sub interval's chosen row background is ${m.onBg}, want transparent`);
    ck(m.onFg === inkWant, `${where}: Sub interval's chosen row text is ${m.onFg}, want ${inkWant} (--ink)`);
    if (ck(m.hasMark, `${where}: Sub interval's chosen row has no .prow-check mark`)) {
      ck(m.markFg === inkWant, `${where}: Sub interval's check mark is ${m.markFg}, want ${inkWant} (--ink)`);
      ck(m.markWeight === '700', `${where}: Sub interval's check mark font-weight is ${m.markWeight}, want 700`);
    }
    ck(m.offHasMark === false, `${where}: an unchosen Sub interval row carries a .prow-check mark, and it shouldn't`);
  }
  await tap(c, "document.getElementById('sheetIntervalClose').click()");
}

// Claim 4: Who's here's badge against a roster row's own `.av`, read from
// the SAME page rather than a hand-typed size/color -- `#players` (Team
// screen) is not open in this fixture, so the comparison badge is instead
// the roster's own CSS applied to a probe element carrying the exact class
// chain `roster-view.js`'s `playerRow` builds (`.rrow .av`), thrown away in
// the same expression, the same technique `team-color.mjs`'s probes use.
// Also flips one player absent (a real tap, not a state edit) to prove the
// "Absent" (`.prow-v`) trailing slot, then taps it back present again.
async function whoBadgePass(c, ck, where) {
  await tap(c, "document.getElementById('phrasePlayers').click()");
  const m = await evalJSON(c, `(() => {
    const rows = [...document.querySelectorAll('#sheetWhoBody .prow')];
    const row = rows[0];
    const av = row ? row.querySelector('.av') : null;
    const probe = document.createElement('div');
    probe.className = 'rrow';
    const probeAv = document.createElement('span');
    probeAv.className = 'av';
    probeAv.style.setProperty('--c', av ? getComputedStyle(av).getPropertyValue('--c') : '');
    probe.appendChild(probeAv);
    document.body.appendChild(probe);
    const want = getComputedStyle(probeAv);
    const got = av ? getComputedStyle(av) : null;
    const cmp = got ? {
      width: got.width, height: got.height, borderRadius: got.borderRadius,
      background: got.backgroundColor, color: got.color, boxShadow: got.boxShadow,
    } : null;
    const wantCmp = { width: want.width, height: want.height, borderRadius: want.borderRadius,
      background: want.backgroundColor, color: want.color, boxShadow: want.boxShadow };
    probe.remove();
    return JSON.stringify({
      rowCount: rows.length,
      hasAv: !!av, avText: av ? av.textContent : null,
      rowLabel: row ? row.getAttribute('aria-label') : null,
      got: cmp, want: wantCmp,
    });
  })()`);
  if (ck(m.hasAv, `${where}: a Who's here row has no .av badge`)) {
    ck(m.avText.length > 0, `${where}: the .av badge is empty, want initials(p)`);
    ck(JSON.stringify(m.got) === JSON.stringify(m.want),
      `${where}: Who's here's .av computes ${JSON.stringify(m.got)}, want the roster's own ${JSON.stringify(m.want)}`);
  }

  // Flip the first row absent with a real tap, and check the trailing slot.
  const before = await evalJSON(c, `JSON.stringify(document.querySelectorAll('#sheetWhoBody .prow')[0].getAttribute('aria-pressed'))`);
  await tap(c, "document.querySelectorAll('#sheetWhoBody .prow')[0].click()");
  const after = await evalJSON(c, `(() => {
    const row = document.querySelectorAll('#sheetWhoBody .prow')[0];
    return JSON.stringify({
      pressed: row.getAttribute('aria-pressed'),
      absentText: (row.querySelector('.prow-v')?.textContent || '').trim(),
      absentFg: row.querySelector('.prow-v') ? getComputedStyle(row.querySelector('.prow-v')).color : null,
      hasCheck: !!row.querySelector('.prow-check'),
      avStillThere: !!row.querySelector('.av'),
    });
  })()`);
  const MUTED_LIGHT = 'rgb(108, 108, 114)', MUTED_DARK = 'rgb(152, 152, 159)';
  const mutedWant = where.includes('dark') ? MUTED_DARK : MUTED_LIGHT;
  if (before === 'true') {
    ck(after.pressed === 'false', `${where}: tapping a present row did not flip aria-pressed to false`);
    ck(after.absentText === 'Absent', `${where}: an absent row's trailing text reads "${after.absentText}", want "Absent"`);
    ck(after.absentFg === mutedWant, `${where}: "Absent" is ${after.absentFg}, want ${mutedWant} (--muted)`);
    ck(!after.hasCheck, `${where}: an absent row still carries a .prow-check mark`);
    ck(after.avStillThere, `${where}: the badge disappeared for an absent player -- it must stay full strength`);
  }
  // put it back, the same courtesy every other rich-fixture pass here pays.
  await tap(c, "document.querySelectorAll('#sheetWhoBody .prow')[0].click()");
  await tap(c, "document.getElementById('sheetWhoClose').click()");
}

// Same three passes, once per theme -- `ui: undefined` for light matches the
// bare `goRich(c, origin)` call it replaces (`fixtures.mjs`'s own `ui ? ... :
// RICH` falls back to RICH's default when `ui` is undefined).
const THEMES = [
  { where: 'light', ui: undefined, sheet: SHEET_LIGHT, surface: SURFACE_LIGHT, ink: INK_LIGHT },
  { where: 'dark', ui: { theme: 'dark' }, sheet: SHEET_DARK, surface: SURFACE_DARK, ink: INK_DARK },
];

export async function sheetFamilyPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    for (const { where, ui, sheet, surface, ink } of THEMES) {
      await goRich(c, origin, ui);
      await backgroundAndGroupPass(c, ck, where, sheet, surface);
      await chosenRowPass(c, ck, where, ink);
      await whoBadgePass(c, ck, where);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'all five sheets share --sheet/.pgrp, Sub interval’s chosen row is a check with no fill, '
        + 'and Who’s here’s badge matches the roster’s own -- in light and dark',
  };
}
