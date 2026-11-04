/* #597: the six WebKit checks. Each opens its own page in its own context,
 * lands it the way smoke does (`land`: RICH, 390x844, 16px text, the pinned
 * clock), drives it with smoke's own drivers, reads facts off the page, and
 * hands them to a verdict function (verdicts.mjs, unit-tested). Nothing here
 * decides pass or fail itself, and a check that found nothing to press or
 * measure fails (/new-guard 2a).
 *
 * What WebKit cannot reproduce is said in the spec
 * (docs/specs/597-webkit-checks.md): Playwright's WebKit is desktop WebKit, not
 * iOS Safari. The Home Screen app is emulated, and bench mode's iOS-only
 * `-webkit-overflow-scrolling` bug cannot be. */
import { evalIn, SETTLE, TIMER_TRACKER, TODAY_HOME, DESCRIBE_EL } from '../smoke/dom.mjs';
import { CLOCK_SCRIPT } from '../smoke/clock.mjs';
import { RICH, TODAY_LANDING } from '../smoke/fixtures.mjs';
import { land } from '../smoke/page-state.mjs';
import { evalJSON, realTap, tap, typeIn, waitClosed, openAddGameFlow } from '../smoke/sheet-drive.mjs';
import { PRINT_SPY, HOME_SCREEN_APP } from '../smoke/page-spies.mjs';
import {
  printProblems, homeScreenProblems, shareImageProblems, benchProblems, addGameProblems, largeTextProblems, rowOf,
} from './verdicts.mjs';
import { CLIP_PROBE, SCROLL_TO_BOTTOM, findingsOf, knownIssueFor } from '../smoke/clip-sweep.mjs';

const TODAY = { record: { ...RICH, view: 'today' }, ...TODAY_LANDING };

/* A fresh page with the pinned clock and the timer tracker `settle` waits on,
 * plus any spy a check wants, all on every document it opens. */
async function freshPage(wk, ...spies) {
  const c = await wk.newPage();
  for (const source of [CLOCK_SCRIPT, TIMER_TRACKER, ...spies]) {
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }
  return c;
}

/* Run `body` on a fresh page and close that page's context whatever happens. */
async function onPage(wk, spies, body) {
  const c = await freshPage(wk, ...spies);
  try { return await body(c); } finally { await c.close().catch(() => {}); }
}

const visible = sel => `(() => { const el = document.querySelector(${JSON.stringify(sel)});
  return !!el && !el.hidden && el.getClientRects().length > 0; })()`;

const PRINT_LABEL = 'Print card for Ravens';

async function print(wk, origin) {
  return onPage(wk, [PRINT_SPY], async c => {
    await land(c, origin, TODAY);
    const sel = `[aria-label="${PRINT_LABEL}"]`;
    const found = await evalIn(c, visible(sel));
    if (found) await realTap(c, sel);
    const prints = await evalIn(c, 'window.__prints');
    const views = await evalIn(c, 'window.__printViews');
    return rowOf('print', printProblems({ found, prints, views }),
      `${PRINT_LABEL} called window.print() once, from ${views[0]}`);
  });
}

/* The Ravens pass's own Print button, found by `.today-print` inside the pass
 * that mentions Ravens, not by its label (the label changes in the Home Screen
 * app, which is what this check is about). It is marked so a real tap can find
 * it. */
const MARK_RAVENS_PRINT = `(() => {
  const pass = [...document.querySelectorAll('.today-pass')].find(p => /Ravens/.test(p.textContent));
  const b = pass?.querySelector('.today-print');
  if (b) b.setAttribute('data-wk-target', '1');
  return !!b;
})()`;

const SHARES_AND_PRINTS = `JSON.stringify({
  shares: window.__sharedImages.map(s => ({ files: s.files, types: s.types })),
  prints: window.__prints })`;

async function homeScreenPrint(wk, origin) {
  return onPage(wk, [PRINT_SPY, HOME_SCREEN_APP], async c => {
    await land(c, origin, TODAY);
    const problems = [];

    const foundToday = await evalIn(c, MARK_RAVENS_PRINT);
    if (foundToday) await realTap(c, '[data-wk-target]');
    problems.push(...homeScreenProblems({ where: 'Today', found: foundToday, ...await evalJSON(c, SHARES_AND_PRINTS) }));

    // The tap opened the Ravens game. The same button on its share sheet.
    await evalIn(c, 'window.__sharedImages.length = 0; window.__prints.length = 0');
    await realTap(c, '#shareBtn');
    const foundGame = await evalIn(c, visible('#print'));
    if (foundGame) await realTap(c, '#print');
    problems.push(...homeScreenProblems({ where: 'the game screen', found: foundGame, ...await evalJSON(c, SHARES_AND_PRINTS) }));

    return rowOf('home-screen print', problems,
      'Today and the game screen each shared one image/png named benchcard-ravens.png and called window.print() 0 times (Home Screen app emulated)');
  });
}

/* Records, never opens: `navigator.share`, where this WebKit has one, is
 * replaced by a recorder; the toasts the app raises are kept. Nothing else on
 * the navigator is touched, so the app takes WebKit's own fallback otherwise. */
const SHARE_RECORDER = `(() => {
  window.__wk = { shares: [], toasts: [], hadShare: typeof navigator.share === 'function' };
  if (window.__wk.hadShare) {
    Object.defineProperty(navigator, 'share', { configurable: true, value: d => {
      window.__wk.shares.push({ files: (d.files || []).map(f => f.name), types: (d.files || []).map(f => f.type) });
      return Promise.resolve();
    } });
  }
  new MutationObserver(() => {
    for (const t of document.querySelectorAll('.toast .tmsg')) {
      if (!window.__wk.toasts.includes(t.textContent)) window.__wk.toasts.push(t.textContent);
    }
  }).observe(document.body, { childList: true, subtree: true });
})()`;

const OUTCOME = `new Promise(done => { const t0 = Date.now();
  const tick = () => (window.__wk.shares.length || window.__wk.toasts.length || Date.now() - t0 > 4000)
    ? done(JSON.stringify({ shares: window.__wk.shares, toasts: window.__wk.toasts, hadShare: window.__wk.hadShare }))
    : (window.__untrackedTimeout || setTimeout)(tick, 50);
  tick(); })`;

async function shareImage(wk, origin) {
  return onPage(wk, [], async c => {
    await land(c, origin, { record: RICH });
    await realTap(c, '#shareBtn');
    await evalIn(c, SHARE_RECORDER);
    const found = await evalIn(c, visible('#shareCard'));
    if (found) await realTap(c, '#shareCard');
    const { shares, toasts, hadShare } = JSON.parse(await evalIn(c, OUTCOME));
    return rowOf('share image', shareImageProblems({ found, shares, toasts }),
      shares.length ? 'Share image reached navigator.share (recorded, not opened)' : `Share image showed "${toasts[0]}" (navigator.share ${hadShare ? 'exists' : 'is absent'} here)`);
  });
}

/* Every scroller inside `.gm` (bench mode), by computed style, and a control
 * scroller outside it, measured the same way. A scroll bar's width is what the
 * box gives up to it: offset size less client size less borders. */
const GUTTER = `(el => { const cs = getComputedStyle(el);
  const v = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
  const h = el.offsetHeight - el.clientHeight - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
  return Math.max(v, h); })`;
const BENCH_SCROLLERS = `(() => {
  const gutter = ${GUTTER}, name = ${DESCRIBE_EL};
  const scrollers = [...document.querySelectorAll('.gm, .gm *')].filter(el => {
    const cs = getComputedStyle(el);
    return /(auto|scroll)/.test(cs.overflowY + cs.overflowX)
      && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  }).map(el => ({ el: name(el), scrollbarWidth: getComputedStyle(el).scrollbarWidth, gutter: gutter(el) }));
  const control = document.createElement('div');
  control.style.cssText = 'overflow:scroll;width:100px;height:100px;position:absolute;left:0;top:0';
  control.innerHTML = '<div style="width:300px;height:300px"></div>';
  document.body.appendChild(control);
  const controlGutter = gutter(control);
  control.remove();
  return JSON.stringify({ scrollers, controlGutter });
})()`;

async function benchScrollBars(wk, origin) {
  return onPage(wk, [], async c => {
    // 500px tall, so the bench floor has more rows than room and scrolls.
    await land(c, origin, { record: RICH, height: 500 });
    await tap(c, `document.querySelector('#gmOpen').click()`);
    const facts = await evalJSON(c, BENCH_SCROLLERS);
    const { problems, widthArm, reason } = benchProblems(facts);
    const row = rowOf('bench mode scroll bars', problems,
      `${facts.scrollers.length} scroller(s) in .gm, each scrollbar-width none; width arm ${widthArm === 'checked' ? 'checked, each 0px' : `SKIP: ${reason}`}`);
    return row;
  });
}

const DAY_LABELS = `(async () => { const s = await import('/state.js');
  return JSON.stringify(s.state.day.games.map(g => g.label)); })()`;
const TODAY_PASSES = `JSON.stringify([...document.querySelectorAll('#todayGames .today-game')].map(b => b.textContent.replace(/\\s+/g, ' ').trim()))`;

async function addGame(wk, origin) {
  return onPage(wk, [], async c => {
    await land(c, origin, TODAY);
    const before = await evalJSON(c, DAY_LABELS);
    await openAddGameFlow(c);
    await typeIn(c, '#agBody input[type=text]', 'Panthers');
    await realTap(c, '#agNext');   // Next
    await realTap(c, '#agNext');   // Add game
    const closed = await waitClosed(c, '#addGameFlow', 3000);
    const after = await evalJSON(c, DAY_LABELS);
    await tap(c, TODAY_HOME);
    const passes = await evalJSON(c, TODAY_PASSES);
    return rowOf('add a game', addGameProblems({ closed, before, after, passes }),
      `the flow closed, the day went from ${before.length} to ${after.length} games with Panthers last, and Today shows ${passes.length} passes`);
  });
}

/* #611: Today with the 32px fake and long-but-wrappable names. WebKit's fake
 * grows the root only, which is what an iPhone with Larger Text does, so this
 * row fails if the large-text layouts (`em` media queries) do not apply. The
 * names are several short words: they may wrap, they must not clip. */
const LONG_TODAY = (() => {
  const record = JSON.parse(JSON.stringify(RICH));
  const team = record.teams[0];
  team.name = 'Riverside Thunder Travel';
  team.days[0].games[0].label = 'Westfield Wildcats Blue';
  team.days[0].games[1].label = 'Northgate Hornets Gold';
  return { ...record, view: 'today' };
})();

const PASS_TITLES = `document.querySelectorAll('.pass-title').length`;

async function todayAtLargeText(wk, origin) {
  return onPage(wk, [], async c => {
    const cells = [];
    for (const width of [320, 390]) {
      await land(c, origin, { record: LONG_TODAY, ...TODAY_LANDING, width, height: 844, textPx: 32 });
      const unexcused = [];
      let passTitles = 0;
      for (const pos of ['top', 'bottom']) {
        if (pos === 'bottom') {
          await evalIn(c, SCROLL_TO_BOTTOM);
          await evalIn(c, SETTLE);
        }
        passTitles = Math.max(passTitles, await evalIn(c, PASS_TITLES));
        const res = JSON.parse(await evalIn(c, CLIP_PROBE));
        for (const f of findingsOf(res, 'today', pos)) {
          if (knownIssueFor(f) === null) unexcused.push(`${pos}: ${f.kind} ${f.el}${f.text ? ` "${f.text}"` : ''}`);
        }
      }
      cells.push({ width, passTitles, unexcused });
    }
    return rowOf('today at large text', largeTextProblems({ cells }),
      'Today at 320 and 390 with the 32px root, top and bottom: no cut-off text, a pass title measured in each');
  });
}

/* The row names are the table's, in the spec's order. */
export const CHECKS = Object.freeze([
  { name: 'print', run: print },
  { name: 'home-screen print', run: homeScreenPrint },
  { name: 'share image', run: shareImage },
  { name: 'bench mode scroll bars', run: benchScrollBars },
  { name: 'add a game', run: addGame },
  { name: 'today at large text', run: todayAtLargeText },
]);
