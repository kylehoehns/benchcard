import { evalIn, step, WIDTH } from './dom.mjs';
import { nameOf } from './registry.mjs';
import { goRich } from './fixtures.mjs';
import { evalJSON, tap, settle, setGame } from './sheet-drive.mjs';

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
