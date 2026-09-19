import { evalIn, step, WIDTH, HEIGHT } from './dom.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH, TOUCH_FLOOR, TOUCH_MIN } from './registry.mjs';
import { goRich } from './fixtures.mjs';
import { evalJSON, tap, settle, setGame } from './sheet-drive.mjs';
import { boxesOverlap } from './sheet-spacing.mjs';

/* #29's own guard (docs/specs/29-timeline-card-sheet.md's Proof section):
   "Smoke, a new check `game screen: Timeline | Card and the card sheet`
   (its own module under scripts/smoke/, RICH fixture): drives the segment,
   reloads, opens the share button, reads the sheet's controls and names,
   changes Size and sees the preview change, checks the blocked panel for
   the three fixes and the disabled gate, checks P calls window.print once,
   and checks the Stint by stint row height. (Settles 1, 2, 3, 5, 6, 7.)"

   Driven with real buttons, a real keydown and a real reload -- the
   `plan-sheet.mjs` / `sentence-sheets.mjs` shape, on `sheet-drive.mjs`'s
   shared helpers. What it deliberately does NOT re-check: `summaryLine`'s
   own wording (test/summary-line.test.js) and `blockedFix`'s pure
   error-to-fix mapping (test/blocked-fix.test.js) are already unit-tested
   from the spec's own values -- this module only drives the real DOM wiring
   on top of them. `#print`'s own page-count/PNG-size proof (item 4) stays
   with /browser-verify and test/print-scope.test.js / test/card-prints.test.js,
   both unchanged. */

// The three `blockedFix` (state.js) branches, each reached the same way a
// human would break the plan, not by poking the mapping directly:
//   'who'      -- NOT_ENOUGH_PLAYERS: mark absent every player but four,
//                 `sentence-sheets.mjs`'s own trigger for the same code.
//   'strategy' -- UNITS_MISSING: Platoon with no unit filled.
//   'rules'    -- MIN_EXCEEDS_GAME (the default branch): a minutes rule the
//                 game cannot satisfy, modeled on FOUR's own Owls game.
const BREAK_WHO = `const g = s.game();
  const ids = s.state.players.slice(4).map(p => p.id);
  for (const id of ids) s.setAvailable(g, id, false);`;
const FIX_WHO = `const g = s.game();
  for (const p of s.state.players) s.setAvailable(g, p.id, true);`;
const BREAK_STRATEGY = `const g = s.game(); g.strategy = 'platoon'; g.constraints.units = [];`;
const FIX_STRATEGY = `s.game().strategy = 'balanced';`;
const BREAK_RULES = `s.game().constraints.minMinutes = { p0: 999 };`;
const FIX_RULES = `s.game().constraints.minMinutes = {};`;

// The spec's own middle cell (360px/24px) -- neither the default root nor
// `LARGE_TEXT_PX`/`LARGE_TEXT_WIDTH` (320/32, `registry.mjs`), so it has no
// existing name to import; local to this one check.
const MID_TEXT_WIDTH = 360, MID_TEXT_PX = 24;

// Fix pass finding 1: `.prow-t`'s flex-basis: 0 (its general rule, app.css)
// let a wide <select> or the switch win the row's width and squeeze the
// label to nothing, which then painted UNDER the control instead of beside
// it -- measured at 320px/32px: Names 97px, Size 58px, Print 63px, Minutes
// strip 44px under the switch; at 360px/24px: Size 43px, Names 34px, Print
// 29px. Reads each `.prow`'s own box, its label's, and its control's --
// `.prow-ctl` (the select+chevron pair) where the row has one, the bare
// switch input where it does not -- no dependency on how the fix lays them
// out, matching `sheet-spacing.mjs`'s `pstepGeometry` for the identical bug
// class in `.pstep-row`.
async function prowGeometry(c) {
  return evalJSON(c, `JSON.stringify([...document.querySelectorAll('#sheetCard .pgrp .prow')].map(r => {
    const row = r.getBoundingClientRect();
    const label = r.querySelector('.prow-t');
    const lr = label.getBoundingClientRect();
    const ctl = r.querySelector('.prow-ctl') || r.querySelector('input[switch]');
    const cr = ctl.getBoundingClientRect();
    const box = x => ({ left: x.left, right: x.right, top: x.top, bottom: x.bottom });
    return { text: label.textContent, row: box(row),
      label: { ...box(lr), scrollWidth: label.scrollWidth, clientWidth: label.clientWidth },
      ctl: box(cr) };
  }))`);
}

// Every row: at least 48px tall, its label's own box not clipped
// (scrollWidth <= clientWidth -- never collapsed and overflowing), and the
// label never overlapping its control (stacked under it is fine; painted
// under it is not). `#sheetCard` must be open when this runs.
async function cardSheetRowsOk(c, ck, where) {
  const rows = await prowGeometry(c);
  if (!ck(rows.length === 5, `${where}: #sheetCard has ${rows.length} .prow row(s), want 5 -- is the sheet open?`)) return;
  for (const r of rows) {
    const h = r.row.bottom - r.row.top;
    ck(h >= TOUCH_MIN, `${where}: "${r.text}" row is ${h.toFixed(1)}px tall, want >= ${TOUCH_FLOOR}px`);
    const labelFits = (r.label.right - r.label.left) > 0 && r.label.scrollWidth <= r.label.clientWidth + 0.5;
    ck(labelFits, `${where}: "${r.text}"'s label is clipped (scrollWidth ${r.label.scrollWidth}px > clientWidth ${r.label.clientWidth}px)`);
    ck(!boxesOverlap(r.label, r.ctl), `${where}: "${r.text}"'s label overlaps its control -- label ${JSON.stringify(r.label)}, control ${JSON.stringify(r.ctl)}`);
  }
}

// Look pass: the two things the fix-pass row guard above could not see.
//
// First, the Print/Share pair. At 320px/32px `flex: 1` could not shrink two
// buttons below their own min-content, so the row ran from -14px to 334px on
// a 320px screen -- both ends cut off. The pair also sat edge to edge where
// the prototype aligns it with the options group below it, so both edges are
// checked against `.pgrp`'s own, not against a number typed in here.
//
// Second, whether a <select> shows its selected option or slices it. A
// <select> reports `scrollWidth === clientWidth` whatever its text does --
// the measure the row guard uses for labels is blind here -- so this draws
// the selected option with the select's own computed font and compares.
//
// `short` says whether a shortened value is allowed at this size. At the
// design size (390px, 16px root) it is not: every option has to read in
// full. Grow the text and at some point a value cannot fit on one line at
// all -- "Pocket · 3.45 × 5 in" needs 264px against 192px at 320px/32px --
// so above the design size a value may be shortened, but only with an
// ellipsis to show for it, never sliced. Which value runs out of room first
// is not pinned here on purpose: a select paints its own text in whatever
// font the platform gives form controls, and CI's is wider than a Mac's --
// "Short names" needs 174px here and 203px there. The rule that matters is
// the same on both: it fits, or it ends in an ellipsis.
async function cardSheetWidthOk(c, ck, where, width, short = true) {
  const m = await evalJSON(c, `(() => {
    const box = n => { const b = n.getBoundingClientRect();
      return { left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10 }; };
    const cv = document.createElement('canvas').getContext('2d');
    return JSON.stringify({
      pgrp: box(document.querySelector('#sheetCard .pgrp')),
      cta: [...document.querySelectorAll('#sheetCard .gm-cta .btn')].map(b => ({ id: b.id, ...box(b) })),
      selects: [...document.querySelectorAll('#sheetCard .pgrp select')].map(s => {
        const cs = getComputedStyle(s);
        cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const text = s.options[s.selectedIndex].textContent;
        return { id: s.id, text,
          need: Math.round(cv.measureText(text).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)),
          have: Math.round(s.clientWidth), ellipsis: cs.textOverflow };
      }),
    });
  })()`);
  if (!ck(m.cta.length === 2, `${where}: #sheetCard's .gm-cta holds ${m.cta.length} button(s), want Print and Share image`)) return;
  for (const b of m.cta) {
    ck(b.left >= -0.5 && b.right <= width + 0.5,
      `${where}: #${b.id} runs ${b.left}px to ${b.right}px in a ${width}px viewport -- it is cut off`);
  }
  // Side by side or stacked, the pair fills the group's width exactly: the
  // leftmost button starts where the group starts and the rightmost ends
  // where it ends. Read off `.pgrp`, so this holds at any root size without
  // a pixel typed in here.
  const left = Math.min(...m.cta.map(b => b.left)), right = Math.max(...m.cta.map(b => b.right));
  ck(Math.abs(left - m.pgrp.left) <= 1 && Math.abs(right - m.pgrp.right) <= 1,
    `${where}: Print and Share image span ${left}-${right}, the options group ${m.pgrp.left}-${m.pgrp.right} -- they do not line up`);
  for (const s of m.selects) {
    if (s.need <= s.have + 0.5) continue;
    ck(short,
      `${where}: #${s.id}'s value "${s.text}" needs ${s.need}px of a ${s.have}px control -- it is cut`);
    ck(s.ellipsis === 'ellipsis',
      `${where}: #${s.id}'s value "${s.text}" is ${s.need - s.have}px too wide and text-overflow is "${s.ellipsis}" -- a value that cannot fit is shortened, never sliced`);
  }
}

// Fix pass finding 4: `refreshCardSheetPreview()` used to run before
// `openSheet(...)` in `#shareBtn`'s handler (app.js), so `fitStage` read
// `#sheetCardPreview.clientWidth: 0` (the dialog was still closed, so
// `avail <= 0`) and fell back to the unzoomed `--cardzoom: 1`. `.stage`'s
// own `display: flex` then shrinks the oversized card's outer box to fit
// anyway (its default `flex-shrink: 1`), so a plain "does the card's box
// stay inside its container" measurement passes either way -- it is the
// zoom itself, not the box, that stays wrong. `.card.half`'s CSS width is a
// fixed 8in (768px, card.css): on this 390px phone that cannot show unzoomed
// without a real fit ever running, so a `--cardzoom` still at the literal
// fallback `1` is a direct, independent sign the sheet was measured while
// still closed -- checking it does not re-derive `fitStage`'s own ratio.
// The bug only shows on the FIRST open of a fresh page load (after that,
// `clientWidth` is no longer 0 and every later fit is already correct), so
// each call here starts from its own `goRich` reload -- `#sheetCard` has
// never been opened in that page load -- rather than reusing a sheet this
// pass already opened once. `size` goes into the fixture's own `ui.cardSize`
// (a `goRich` override, not a live post-boot mutation): `#sheet`'s cards are
// built once at boot from that saved value, and `refreshCardSheetPreview`
// only ever clones `#sheet .card` -- it does not rebuild at whatever
// `state.ui.cardSize` happens to hold when it runs. So a size change that
// skips `renderCards` (as a raw `state.ui.cardSize = ...` would) never
// reaches the sheet, which matches how a real reload -- Size set last time,
// picked up fresh -- actually arrives.
async function firstOpenFits(c, ck, origin, size, where) {
  await goRich(c, origin, { cardSize: size });
  await tap(c, `document.getElementById('shareBtn').click()`);
  const r = await evalJSON(c, `(() => {
    const host = document.getElementById('sheetCardPreview');
    const card = host.querySelector('.card:not(.card-copy)');
    if (!card) return 'null';
    const cs = getComputedStyle(host);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const hr = host.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    return JSON.stringify({
      contentWidth: hr.width - padX, cardWidth: cr.width,
      zoom: parseFloat(getComputedStyle(card).zoom),
    });
  })()`);
  if (ck(r !== null, `${where}: #sheetCardPreview has no live .card on first open`)) {
    ck(r.cardWidth <= r.contentWidth + 1,
      `${where}: the fitted card is ${r.cardWidth.toFixed(1)}px wide, #sheetCardPreview's content box is only ${r.contentWidth.toFixed(1)}px -- fitted before the sheet opened (finding 4)`);
    // 8in (768px, card.css's `.card.half`) cannot show unzoomed on a 390px
    // phone -- a zoom still at 0.9+ means the fit ran against a closed (0px)
    // stage (finding 4), not the real, open one.
    if (size === 'half') {
      ck(r.zoom < 0.9,
        `${where}: --cardzoom is ${r.zoom} -- a .card.half (768px) fit to a ${r.contentWidth.toFixed(1)}px stage without zooming means fitStage read the sheet before it opened (finding 4)`);
    }
  }
  await tap(c, `document.getElementById('sheetCardClose').click()`);
}

export async function timelineCardSheetPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    await goRich(c, origin); // Hawks, games view, Timeline shown, #sheetCard closed

    /* ---- item 1: the segment, both ways ---- */
    let seg = await evalJSON(c, `JSON.stringify({
      tlHidden: document.getElementById('timeline').hidden,
      sheetHidden: document.getElementById('sheet').hidden,
      pressed: [...document.querySelectorAll('#viewSeg button[data-view]')].map(b => b.getAttribute('aria-pressed')),
    })`);
    ck(!seg.tlHidden && seg.sheetHidden, `on arrival #timeline.hidden=${seg.tlHidden}, #sheet.hidden=${seg.sheetHidden}, want Timeline shown`);
    ck(JSON.stringify(seg.pressed) === JSON.stringify(['true', 'false']),
      `#viewSeg aria-pressed reads ${JSON.stringify(seg.pressed)} on arrival, want only Timeline pressed`);

    await tap(c, `document.querySelector('#viewSeg button[data-view="card"]').click()`);
    seg = await evalJSON(c, `JSON.stringify({
      tlHidden: document.getElementById('timeline').hidden,
      sheetHidden: document.getElementById('sheet').hidden,
      pressed: [...document.querySelectorAll('#viewSeg button[data-view]')].map(b => b.getAttribute('aria-pressed')),
      right: document.getElementById('sheet').getBoundingClientRect().right,
    })`);
    ck(seg.tlHidden && !seg.sheetHidden, `after tapping Card, #timeline.hidden=${seg.tlHidden}, #sheet.hidden=${seg.sheetHidden}, want the card shown and the timeline hidden`);
    ck(JSON.stringify(seg.pressed) === JSON.stringify(['false', 'true']),
      `#viewSeg aria-pressed reads ${JSON.stringify(seg.pressed)} on Card, want only Card pressed`);
    ck(seg.right <= WIDTH + 1, `#sheet's right edge sits at ${Math.round(seg.right)}px in a ${WIDTH}px viewport -- it pans sideways`);

    /* ---- item 1: a reload keeps Card chosen ---- */
    const reloaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await evalIn(c, `location.reload()`);
    await reloaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); })()`);
    const afterReload = await evalJSON(c, `JSON.stringify({
      onGames: document.getElementById('view-games')?.hidden === false,
      sheetHidden: document.getElementById('sheet')?.hidden,
      tlHidden: document.getElementById('timeline')?.hidden,
      pressed: [...document.querySelectorAll('#viewSeg button[data-view]')].map(b => b.getAttribute('aria-pressed')),
    })`);
    ck(afterReload.onGames, 'the games view is not on screen after a reload -- the record did not round-trip');
    ck(!afterReload.sheetHidden && afterReload.tlHidden,
      `after a reload, #sheet.hidden=${afterReload.sheetHidden}, #timeline.hidden=${afterReload.tlHidden}, want Card still chosen`);
    ck(JSON.stringify(afterReload.pressed) === JSON.stringify(['false', 'true']),
      `#viewSeg aria-pressed reads ${JSON.stringify(afterReload.pressed)} after a reload, want Card still pressed`);

    // back to Timeline, for what follows.
    await tap(c, `document.querySelector('#viewSeg button[data-view="timeline"]').click()`);
    const backToTl = await evalJSON(c, `JSON.stringify({
      tlHidden: document.getElementById('timeline').hidden,
      sheetHidden: document.getElementById('sheet').hidden,
    })`);
    ck(!backToTl.tlHidden && backToTl.sheetHidden, 'tapping Timeline after a reload does not switch back');

    /* ---- item 3: #shareBtn opens "The card" ---- */
    const shareBtn = await evalJSON(c, `(() => {
      const b = document.getElementById('shareBtn');
      const r = b.getBoundingClientRect();
      return JSON.stringify({ label: b.getAttribute('aria-label'), hidden: b.hidden, w: r.width, h: r.height });
    })()`);
    ck(shareBtn.label === 'Share the card', `#shareBtn's aria-label reads "${shareBtn.label}", want "Share the card"`);
    ck(!shareBtn.hidden, '#shareBtn is hidden on the game screen');
    ck(shareBtn.w >= 48 && shareBtn.h >= 48, `#shareBtn measures ${Math.round(shareBtn.w)}×${Math.round(shareBtn.h)}, want at least 48×48`);

    await tap(c, `document.getElementById('shareBtn').click()`);
    const sheet1 = await evalJSON(c, `(() => {
      const rowLabels = [...document.querySelectorAll('#sheetCard .prow .prow-t')].map(t => t.textContent);
      return JSON.stringify({
        open: document.getElementById('sheetCard').open,
        title: document.getElementById('sheetCardTitle')?.textContent,
        hasPreviewCard: !!document.querySelector('#sheetCardPreview .card'),
        printLabel: document.getElementById('print')?.textContent.trim(),
        shareLabel: document.getElementById('shareCard')?.textContent.trim(),
        rowLabels,
        printScope: document.getElementById('printScope')?.value,
        copies: document.getElementById('copies')?.value,
        cardSize: document.getElementById('cardSize')?.value,
        cardId: document.getElementById('cardId')?.value,
        showMinutes: document.getElementById('showMinutes')?.checked,
        hasClose: !!document.getElementById('sheetCardClose'),
      });
    })()`);
    ck(sheet1.open, '#sheetCard did not open on tapping #shareBtn');
    ck(sheet1.title === 'The card', `#sheetCardTitle reads "${sheet1.title}", want "The card"`);
    ck(sheet1.hasPreviewCard, '#sheetCardPreview has no live .card clone');
    ck(sheet1.printLabel.includes('Print'), `#print reads "${sheet1.printLabel}", want it to include "Print"`);
    ck(sheet1.shareLabel.includes('Share image'), `#shareCard reads "${sheet1.shareLabel}", want it to include "Share image"`);
    ck(JSON.stringify(sheet1.rowLabels) === JSON.stringify(['Print', 'Copies', 'Size', 'Names', 'Minutes strip']),
      `the sheet's rows read ${JSON.stringify(sheet1.rowLabels)}, want ["Print","Copies","Size","Names","Minutes strip"]`);
    ck(sheet1.hasClose, '#sheetCardClose (✕) is missing');
    // The sheet reflects state.ui -- RICH's own fixture (fixtures.mjs's UI).
    ck(sheet1.printScope === 'game', `#printScope reads "${sheet1.printScope}", want "game" (RICH's own ui.printScope)`);
    ck(sheet1.copies === '2', `#copies reads "${sheet1.copies}", want "2" (RICH's own ui.copies)`);
    ck(sheet1.cardSize === 'pocket', `#cardSize reads "${sheet1.cardSize}", want "pocket" (RICH's own ui.cardSize)`);
    ck(sheet1.cardId === 'short', `#cardId reads "${sheet1.cardId}", want "short" (RICH's own ui.cardId)`);
    ck(sheet1.showMinutes === true, `#showMinutes.checked is ${sheet1.showMinutes}, want true (RICH's own ui.showMinutes)`);

    /* ---- fix pass finding 1: row geometry at 390px/16px (the sheet is
       already open from the check just above) ---- */
    await cardSheetRowsOk(c, ck, '390px/16px');
    await cardSheetWidthOk(c, ck, '390px/16px', WIDTH, false);

    /* ---- item 3: changing Size changes the preview ---- */
    const beforeSize = await evalJSON(c, `(() => {
      const el = document.querySelector('#sheetCardPreview .card');
      const r = el.getBoundingClientRect();
      return JSON.stringify({ half: el.classList.contains('half'), w: r.width });
    })()`);
    await tap(c, `const s = document.getElementById('cardSize');
      s.value = 'half'; s.dispatchEvent(new Event('change', { bubbles: true }))`);
    const afterSize = await evalJSON(c, `(async () => {
      const el = document.querySelector('#sheetCardPreview .card');
      const r = el.getBoundingClientRect();
      const s = await import('/state.js');
      return JSON.stringify({ half: el.classList.contains('half'), w: r.width, uiCardSize: s.state.ui.cardSize });
    })()`);
    ck(afterSize.uiCardSize === 'half', `state.ui.cardSize reads "${afterSize.uiCardSize}" after choosing "Half sheet", want "half"`);
    ck(afterSize.half && !beforeSize.half, 'the preview card did not pick up the "half" size class after choosing "Half sheet"');
    ck(afterSize.w !== beforeSize.w, `the preview measures ${Math.round(afterSize.w)}px both before and after changing Size -- it did not change`);
    // restore pocket.
    await tap(c, `const s = document.getElementById('cardSize');
      s.value = 'pocket'; s.dispatchEvent(new Event('change', { bubbles: true }))`);

    await tap(c, `document.getElementById('sheetCardClose').click()`);

    /* ---- item 5: P calls window.print() once, on the game screen ---- */
    await evalIn(c, `window.__printed = 0; window.print = () => { window.__printed++; }`);
    await evalIn(c, step(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }))`));
    const printed = await evalJSON(c, `JSON.stringify(window.__printed)`);
    ck(printed === 1, `P called window.print() ${printed} time(s) from the game screen, want 1`);

    /* ---- item 7: Stint by stint is a grouped row >= 48px ---- */
    const stint = await evalJSON(c, `(() => {
      const s = document.querySelector('#tabledetails > summary');
      const r = s.getBoundingClientRect();
      return JSON.stringify({ text: s.textContent.trim(), h: r.height });
    })()`);
    ck(stint.text === 'Stint by stint', `#tabledetails' summary reads "${stint.text}", want "Stint by stint"`);
    ck(stint.h >= 48, `#tabledetails' summary row measures ${Math.round(stint.h)}px tall, want at least 48px`);

    /* ---- item 6: the blocked panel -- the three fixes, and the disabled gate ---- */
    await evalIn(c, setGame(BREAK_WHO));
    await settle(c);
    const whoBlocked = await evalJSON(c, `(() => {
      const box = document.getElementById('timeline').querySelector('.empty');
      const btn = box?.querySelector('button');
      return JSON.stringify({
        heading: box?.querySelector('.se-t')?.textContent,
        label: btn?.textContent,
        gmOpenDisabled: document.getElementById('gmOpen')?.disabled,
        abBenchDisabled: document.getElementById('abBench')?.disabled,
        printDisabled: document.getElementById('print')?.disabled,
        shareDisabled: document.getElementById('shareCard')?.disabled,
      });
    })()`);
    ck(whoBlocked.heading === "This plan can't be built", `the blocked panel reads "${whoBlocked.heading}", want "This plan can't be built"`);
    ck(whoBlocked.label === "Change who's here", `the fix button reads "${whoBlocked.label}" with only 4 players in, want "Change who's here"`);
    ck(whoBlocked.gmOpenDisabled === true, '#gmOpen (Start game) is not disabled while blocked');
    ck(whoBlocked.abBenchDisabled === true, '#abBench (Start game, phone) is not disabled while blocked');
    ck(whoBlocked.printDisabled === true, '#print is not disabled while blocked');
    ck(whoBlocked.shareDisabled === true, '#shareCard is not disabled while blocked');

    await tap(c, `document.querySelector('#timeline .empty button').click()`);
    const whoOpen = await evalJSON(c, `JSON.stringify(document.getElementById('sheetWho')?.open)`);
    ck(whoOpen === true, `"Change who's here" did not open #sheetWho`);
    await tap(c, `document.getElementById('sheetWhoClose').click()`);

    // the card sheet still opens while blocked, shows why, and grows no fix
    // button there (decision 7: the fix is a different sheet).
    await tap(c, `document.getElementById('shareBtn').click()`);
    const blockedSheet = await evalJSON(c, `(() => {
      const empty = document.querySelector('#sheetCardPreview .stage-empty');
      return JSON.stringify({
        open: document.getElementById('sheetCard')?.open,
        heading: empty?.querySelector('.se-t')?.textContent,
        hasFixButton: !!empty?.querySelector('button'),
      });
    })()`);
    ck(blockedSheet.open, '#sheetCard did not open while the plan is blocked');
    ck(blockedSheet.heading === "This plan can't be built", `the card sheet's preview reads "${blockedSheet.heading}" while blocked, want "This plan can't be built"`);
    ck(!blockedSheet.hasFixButton, "the card sheet's blocked preview grew a fix button -- decision 7 keeps the fix one sheet away");
    await tap(c, `document.getElementById('sheetCardClose').click()`);

    await evalIn(c, setGame(FIX_WHO));
    await settle(c);

    // 'strategy': Platoon with no unit filled -> "Fill a unit".
    await evalIn(c, setGame(BREAK_STRATEGY));
    await settle(c);
    const unitsBlocked = await evalJSON(c, `JSON.stringify(document.querySelector('#timeline .empty button')?.textContent)`);
    ck(unitsBlocked === 'Fill a unit', `the fix button reads "${unitsBlocked}" with Platoon and no unit filled, want "Fill a unit"`);
    await tap(c, `document.querySelector('#timeline .empty button').click()`);
    const stratOpen = await evalJSON(c, `JSON.stringify(document.getElementById('sheetPlan')?.open)`);
    ck(stratOpen === true, '"Fill a unit" did not open #sheetPlan');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    await evalIn(c, setGame(FIX_STRATEGY));
    await settle(c);

    // 'rules': a minutes rule the game cannot satisfy -> "Change the rules".
    await evalIn(c, setGame(BREAK_RULES));
    await settle(c);
    const rulesBlocked = await evalJSON(c, `JSON.stringify(document.querySelector('#timeline .empty button')?.textContent)`);
    ck(rulesBlocked === 'Change the rules', `the fix button reads "${rulesBlocked}" with an unsatisfiable minutes rule, want "Change the rules"`);
    await tap(c, `document.querySelector('#timeline .empty button').click()`);
    const rulesOpen = await evalJSON(c, `JSON.stringify(document.getElementById('sheetPlan')?.open)`);
    ck(rulesOpen === true, '"Change the rules" did not open #sheetPlan');
    await tap(c, `document.getElementById('sheetPlanClose').click()`);
    await evalIn(c, setGame(FIX_RULES));
    await settle(c);

    /* ---- fix pass finding 1: row geometry at 360px/24px and 320px/32px,
       the other two cells the finding measured ---- */
    await c.send('Page.setFontSizes', { fontSizes: { standard: MID_TEXT_PX, fixed: MID_TEXT_PX } });
    try {
      await c.send('Emulation.setDeviceMetricsOverride', { width: MID_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
      await goRich(c, origin);
      await tap(c, `document.getElementById('shareBtn').click()`);
      await cardSheetRowsOk(c, ck, '360px/24px');
      await cardSheetWidthOk(c, ck, '360px/24px', MID_TEXT_WIDTH);
      await tap(c, `document.getElementById('sheetCardClose').click()`);
    } finally {
      await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
      await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    }

    await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
    try {
      await c.send('Emulation.setDeviceMetricsOverride', { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
      await goRich(c, origin);
      await tap(c, `document.getElementById('shareBtn').click()`);
      await cardSheetRowsOk(c, ck, '320px/32px');
      await cardSheetWidthOk(c, ck, '320px/32px', LARGE_TEXT_WIDTH);
      await tap(c, `document.getElementById('sheetCardClose').click()`);
    } finally {
      await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
      await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    }

    /* C5: with no roster at all, Timeline's own empty-state CTA presses
       `#emptyAdd` -- Team's own first-run button (`rosterCta`, timeline.js)
       -- so the two must read the same words rather than drift apart. */
    await goRich(c, origin);
    await tap(c, setGame(`s.team().players.length = 0;`));
    const want = await evalJSON(c, `JSON.stringify(document.getElementById('emptyAdd')?.textContent.trim())`);
    const got = await evalJSON(c, `JSON.stringify(document.querySelector('#timeline .roster-empty button')?.textContent.trim() ?? null)`);
    ck(got === want, `the Timeline empty-roster button reads "${got}", want "${want}" (#emptyAdd's own label)`);

    /* ---- fix pass finding 4: the preview fits on the sheet's FIRST open,
       at both Size values -- each call starts from its own reload, since
       the bug this guards only shows before `#sheetCard` has ever opened in
       a page load. */
    await firstOpenFits(c, ck, origin, 'pocket', 'first open, pocket');
    await firstOpenFits(c, ck, origin, 'half', 'first open, half');
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  // leave the fixture as `goRich` left it, for whatever the pipeline runs next.
  await goRich(c, origin).catch(() => {});

  return {
    name: nameOf('timelinecardsheet'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : "the segment (both ways, and across a reload), #shareBtn, the card sheet's rows, "
        + 'changing Size, P, Stint by stint and all three blocked-panel fixes hold',
  };
}
