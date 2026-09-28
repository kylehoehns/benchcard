/* #179: sweeps the same ~45 states `applargetext` already covers at
 * 320px/32px text (`APP_LARGE_TEXT_STATES`, `app-large-text.mjs`), for four
 * things that check never looks at: text wider than its own box, a name held
 * narrower than its own longest word, a word broken mid-word, and text
 * sitting under something else. `applargetext` only asks whether anything
 * stuck out past the screen edge.
 *
 * Reused rather than re-derived: `APP_LARGE_TEXT_STATES` and its open/close
 * dispatch (mirrored here the way `type-scale.mjs` does from outside that
 * file); `WORD_FLOOR_FN`, `IS_SR_ONLY_RECT`, `evalIn`, `setWidth`, `WIDTH`,
 * `HEIGHT` (`dom.mjs`); `LARGE_TEXT_PX`/`LARGE_TEXT_WIDTH` (`sizes.mjs`);
 * `LONG_NAME`, `goRich`, `reloadWithRecord`, `FOUR` (`fixtures.mjs`); and the
 * per-word `Range` technique `WORD_RECTS_FN` (`row-stack.mjs`, exported for
 * this ticket rather than copied).
 *
 * `LONG_AND_SQUEEZE` (below) is `RICH` with one player renamed to
 * `LONG_NAME` and a second to a name whose two words are each long enough on
 * their own to force a squeeze, loaded once with `goRich` before the loop —
 * the same "reload once, then click through every state" shape
 * `appLargeTextPass`/`typeScalePass` use, so ordinary states see it without
 * reloading anything themselves.
 *
 * Four states reload their own fixture instead (`firstRun`, `tryLink`,
 * `four`, `firstRunTypedRoster`), which would otherwise leave
 * `LONG_AND_SQUEEZE` gone for every state that follows — none of the four is
 * the last state in this pass's list, so it reloads `LONG_AND_SQUEEZE` again
 * right after each of them. `rotationToast` opens through its own
 * `openRotationToastState` too, but that one only mutates the loaded record's
 * game in place (`setGame`), so it needs no restore. */
import { evalIn, step, setWidth, WIDTH, HEIGHT, IS_SR_ONLY_RECT, WORD_FLOOR_FN } from './dom.mjs';
import { LONG_NAME, RICH, goRich, reloadWithRecord, FOUR } from './fixtures.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';
import { APP_LARGE_TEXT_STATES, firstRun, tryLanding, openRotationToastState, openFirstRunTypedRosterState } from './app-large-text.mjs';
import { WORD_RECTS_FN } from './row-stack.mjs';
import { CONFIRM_DIALOG } from './heading-outline.mjs';

/* Two long, unbroken words (no hyphen) — `LONG_NAME` already covers the
 * hyphenated case (`Featherstone-Whitmore`), so this second name exercises
 * the plain-word squeeze on its own, the way #144's own filed-game titles
 * and #138's own bench rows actually broke. */
const SQUEEZE_NAME = 'Featherstonehaugh Bartholomew';

const LONG_AND_SQUEEZE = (() => {
  const record = JSON.parse(JSON.stringify(RICH));
  const players = record.teams[0].players;
  players[0].name = LONG_NAME;
  players[1].name = SQUEEZE_NAME;
  return record;
})();

/* The one dialog `APP_LARGE_TEXT_STATES` lacks, opened exactly the way
 * `heading-outline.mjs`'s own `#confirm` entry does — its `open`/`close`
 * imported from there rather than a second copy. */
const CONFIRM_STATE = {
  name: 'confirm dialog',
  open: CONFIRM_DIALOG.open,
  close: CONFIRM_DIALOG.close,
};

/* Scroll the page, and every one of its own scrolling descendants (an open
 * sheet's body among them), to the bottom — generic over which element that
 * is, since a coach on a long roster reaches the same rows a fixed sheet
 * body scrolls to reach. */
const SCROLL_TO_BOTTOM = `(() => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  for (const el of document.querySelectorAll('*')) {
    // #179 fix 5b: cheap layout-only check first, so \`getComputedStyle\` (a
    // style recalc) only runs for an element that could possibly be a
    // scroller in the first place.
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
      el.scrollTop = el.scrollHeight;
    }
  }
})()`;

/* The allow list (#179 "What would settle it" item 3): each selector is CSS
 * in `app/app.css` that deliberately ends a name or title in "…" rather than
 * let it wrap or overflow. An entry this run's probe never needs (nothing
 * matching it overflowed) is stale and fails the check below, so this stays
 * trimmed to exactly what `--only clipsweep` exercises. */
export const CLIP_SWEEP_ALLOW = [
  { selector: '.bar-title', reason: 'the collapsing top-bar title stays one line as it fades in' },
  { selector: '#teamBtnLabel', reason: "the team-switcher button's own label truncates, not the bar" },
  { selector: '.today-entry-sub', reason: 'the "Add a game" entry\'s subtitle line' },
  { selector: '.dayhead .game-h1, .dayhead .season-h1, .dayhead .team-h1', reason: 'the large page heading stays one line' },
  { selector: '.tl-lab .nm', reason: "a timeline row's own player name" },
  { selector: '.gm-p.fresh .nm', reason: 'a bench row just tagged "just on" keeps its name on one line' },
  { selector: 'dialog.flow .plr .plr-first, dialog.flow .plr .plr-sur', reason: "a roster tile's first/last name each ellipsize on their own line" },
  { selector: '.sn-list .sn-nm', reason: "a season ledger row's own player name" },
];

/* #179 Task 2: real, filed bugs the LONG_AND_SQUEEZE fixture also trips —
 * not false alarms, and not this ticket's to fix, so each is excused by
 * issue number the same way CLIP_SWEEP_ALLOW excuses a deliberate "…" rule.
 * `match` sees the same raw finding shape clipSweepPass builds for every
 * clip/split/hidden/floor/overlap (`kind`, `where`, `el`, and whichever of
 * `text`/`word`/`hitBy` that kind carries). An entry no finding matches this
 * run is stale and fails below, same as the allow list. */
export const CLIP_SWEEP_KNOWN_ISSUES = [
  {
    issue: 187,
    reason: 'the Today card\'s pass-title badge breaks a team name mid-word',
    match: p => p.kind === 'split' && p.el === 'span.pass-title',
  },
  {
    issue: 190,
    reason: 'a pair rule\'s sentence overflows its own box past the plan sheet edge',
    match: p => p.kind === 'clip' && p.el === 'p.plan-rule-sentence' && p.where === 'plan sheet, a pair rule',
  },
  {
    issue: 188,
    reason: 'the small centered keysbox dialogs (help, team color, shortcuts, confirm) are too narrow for 32px text',
    match: p => p.kind === 'clip' && (
      (p.where === 'help sheet' && (p.el === 'h3.help-h' || p.el === 'button#helpTour.btn.press')) ||
      (p.where === 'team color picker' && p.el.startsWith('button.color-opt')) ||
      // The keyboard shortcuts dialog's own `dd`s: its `.keysbox` content
      // scrolls sideways, so a description that runs past the dialog's own
      // width is cut off the same way (#179 fix 1) as any other scroll
      // container — same root cause, different content.
      (p.where === 'shortcuts sheet' && p.el === 'dd') ||
      // The confirm dialog's "Remove team" button: `.confirm-acts .btn` has
      // `flex: 1` but no `min-width: 0`, so its label doesn't fit.
      (p.where === 'confirm dialog' && p.el === 'button#confirmYes.btn.danger')
    ),
  },
  {
    issue: 191,
    reason: 'a very long one-word name is cut off, or drawn over other text, on the roster, the plan\'s info alert, day totals and a cap rule\'s player picker',
    match: p => (
      (p.kind === 'clip' && p.el === 'span.prow-t' && p.text === 'Featherstonehaugh Bartholomew') ||
      (p.kind === 'clip' && p.el === 'span' && p.text.startsWith('Best possible spread')) ||
      // Season → day totals (`#daytotals` rows, a bare `span` from
      // `renderDayTotals()`): the name runs over its own minutes.
      (p.kind === 'clip' && p.el === 'span' && p.text === 'Featherstonehaugh' &&
        (p.where === 'season' || p.where === 'season, filed game open')) ||
      // Plan sheet → a cap rule's player picker (`span.nm`): the name spills
      // past its own box onto the sheet's status line below it.
      (p.kind === 'overlap' && p.el === 'span.nm' && p.where === 'plan sheet, a cap rule') ||
      // Found once smoke drew in CI's font (#177): the plan sheet's rule
      // pickers and bench mode's rows cut the long name off too.
      (p.kind === 'clip' && p.el === 'span.nm' && p.text === 'Featherstonehaugh' && p.where.startsWith('plan sheet, ')) ||
      (p.kind === 'clip' && p.el === 'span.nm' && p.text === 'Featherstonehaugh Bartholomew' && p.where.startsWith('bench mode'))
    ),
  },
  {
    issue: 197,
    reason: 'bench mode breaks short one-word names mid-word',
    match: p => p.kind === 'split' && p.el === 'span.nm' && p.where.startsWith('bench mode'),
  },
  {
    issue: 198,
    reason: 'the welcome screen cuts a sample name off and breaks it mid-word',
    match: p => p.el === 'span.wel-nm',
  },
  {
    issue: 189,
    reason: 'the plan sheet\'s "Lineup balance" value is drawn on top of its own label',
    match: p => p.kind === 'overlap' && p.where === 'plan sheet' && p.el === 'span.prow-t' && p.text === 'Lineup balance',
  },
];

/* #179 fix 1: a scroll container is treated as a clip boundary below
 * (`CLIPPING_OVERFLOW`, in `CLIP_PROBE`) — this is the one exception, a box
 * built to scroll sideways on purpose. Same "stale entry fails" treatment as
 * the allow list above: an entry this run never needs fails the check. */
export const CLIP_SWEEP_SIDEWAYS = [
  { selector: '#plan', reason: 'the stint-by-stint table is a real table, meant to scroll sideways' },
];
const SIDEWAYS_SELECTORS = CLIP_SWEEP_SIDEWAYS.map(s => s.selector);

const notAllowed = CLIP_SWEEP_ALLOW.map(a => `:not(${a.selector})`).join('');
const CANDIDATE_SEL = `body *${notAllowed}`;
const ALLOW_SELECTORS = CLIP_SWEEP_ALLOW.map(a => a.selector);

/* One probe, both scroll positions, every state: scanned/clip/split/hidden
 * off one walk of `CANDIDATE_SEL` (every allow-listed element excluded, the
 * way `TYPESCALE_PROBE` in `type-scale.mjs` walks `document.body
 * .querySelectorAll('*')`), plus one `wordFloorRows` call (`WORD_FLOOR_FN`,
 * `dom.mjs`) over the same set — `rowSel: 'body'` turns that shared
 * row-vs-name floor into a generic "is this element narrower than its own
 * longest word" for any leaf of text.
 *
 * `wordRects` (`WORD_RECTS_FN`) tokenizes on `\S+`, so a hyphenated compound
 * (`Featherstone-Whitmore`) is one token whose two rects are what a
 * design-intended wrap after the hyphen looks like, indistinguishable from a
 * genuine bad break inside the token. A token containing a hyphen is treated
 * as exempt rather than tokenizing more finely just for this case. */
const CLIP_PROBE = `(() => {
  const isSrOnly = ${IS_SR_ONLY_RECT};
  ${WORD_RECTS_FN}
  ${WORD_FLOOR_FN}
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const isFixedOrSticky = el => {
    for (let a = el; a; a = a.parentElement) {
      const p = getComputedStyle(a).position;
      if (p === 'fixed' || p === 'sticky') return true;
    }
    return false;
  };
  // A bottom sheet is itself position: fixed, so isFixedOrSticky is true for
  // every element inside one -- fine for "hidden" (a foreign fixed bar
  // covering scrolled-under content), wrong for "overlap": two siblings
  // inside the SAME sheet aren't an occluder relationship just because their
  // shared ancestor happens to be fixed. Only a fixed/sticky ancestor that
  // does not also contain the spilling element counts as foreign here.
  const isForeignFixed = (hit, from) => {
    for (let a = hit; a; a = a.parentElement) {
      const p = getComputedStyle(a).position;
      if ((p === 'fixed' || p === 'sticky') && !a.contains(from)) return true;
    }
    return false;
  };
  const path = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join(''));

  // Every non-empty text-node line inside el, as client rects -- shared by
  // the clip and overlap checks below, which each turn these into their own
  // "over" measurement.
  const textLineRects = el => {
    const rects = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let tn;
    while ((tn = walker.nextNode())) {
      if (!tn.textContent.trim()) continue;
      const tr = document.createRange();
      tr.selectNodeContents(tn);
      for (const lr of tr.getClientRects()) {
        if (lr.width > 0 && lr.height > 0) rects.push(lr);
      }
    }
    return rects;
  };

  // "Cut off" means an ancestor's computed overflow-x actually clips painted
  // content, not just that a flex/grid item rendered past its own content
  // box into room a sibling isn't using (".prow-t { flex: 1; min-width: 0 }"
  // wraps into empty space next to a switch on add-a-game step 3, fully
  // visible — scrollWidth alone can't tell that apart from a real clip). So
  // this walks up for the nearest ancestor whose overflow-x would clip,
  // falling back to the viewport.
  //
  // #179 fix 1: a scroll container (auto/scroll) is a boundary too, same as
  // hidden/clip — a coach never drags most of these sideways, so a name past
  // a scrolling sheet body's own width (the color picker, the help dialog)
  // is cut off exactly as hard as overflow: hidden would make it. The one
  // exception is CLIP_SWEEP_SIDEWAYS, a box built to scroll sideways on
  // purpose, which this pass never drags across.
  const CLIPPING_OVERFLOW = new Set(['hidden', 'clip', 'auto', 'scroll']);
  const SIDEWAYS_SELECTORS = ${JSON.stringify(SIDEWAYS_SELECTORS)};
  const usedSideways = [];
  // #179 fix 5c: many scanned elements share the same nearest clipping
  // ancestor (every row in a sheet walks up to the same sheet), so this
  // memoizes the walk per element for the life of this one probe run --
  // safe because nothing in this probe scrolls or reflows the page between
  // one element's walk and the next.
  const clipBoxCache = new Map();
  const clipBox = el => {
    if (!el) return { left: 0, top: 0, right: vw, bottom: vh };
    if (clipBoxCache.has(el)) return clipBoxCache.get(el);
    let result;
    const ox = getComputedStyle(el).overflowX;
    if (CLIPPING_OVERFLOW.has(ox)) {
      const sw = SIDEWAYS_SELECTORS.find(sel => el.matches(sel));
      if (sw) { usedSideways.push(sw); result = null; }
      else result = el.getBoundingClientRect();
    } else {
      result = clipBox(el.parentElement);
    }
    clipBoxCache.set(el, result);
    return result;
  };

  // The row-container classes a word-split is measured against: the ones
  // WORD_FLOOR_FN's own callers already key off ('.gm-p, .gm-b', '.sn-row'),
  // plus '.prow' (app.css's shared row grammar, what '.prow-t' names sit
  // inside). No such ancestor means no exemption — the split is flagged.
  const ROW_LIKE = '.prow, .gm-p, .gm-b, .sn-row';
  const SPLIT_MARK = '__cs179split__';

  let scanned = 0;
  const clip = [], split = [], hidden = [], overlap = [];
  // Elements the floor check below can trust: display: inline is excluded
  // (its clientWidth is 0 by spec, not the rendered text's width), and so is
  // an empty computed font shorthand — wordFloorRows's measureWord copies
  // cs.font onto an off-screen span, and when Chrome can't serialize the
  // shorthand (seen on some font-size: var(...) declarations) that copy is a
  // silent no-op that over-states a small label's width.
  const floorEls = [];

  for (const el of document.querySelectorAll(${JSON.stringify(CANDIDATE_SEL)})) {
    if (!hasOwnText(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (isSrOnly(r)) continue;
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    scanned++;

    const cs = getComputedStyle(el);
    if (cs.display !== 'inline' && cs.font !== '') floorEls.push(el);

    // Measured off the actual text nodes, not scrollWidth or a whole-element
    // Range: both also count a descendant's negative margin or enlarged tap
    // target as part of the box, over-stating what's actually painted past
    // the edge (p#sentence's phrase buttons were a false alarm this way).
    const box = el.getBoundingClientRect();
    const bound = clipBox(el);
    let worstLine = null;
    if (bound) {
      for (const lr of textLineRects(el)) {
        const over = Math.max(lr.right - bound.right, bound.left - lr.left);
        if (over > 1 && (!worstLine || over > worstLine.over)) worstLine = { over, width: lr.width };
      }
    }
    if (worstLine && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
      clip.push({ el: path(el), scrollWidth: Math.round(worstLine.width), clientWidth: Math.round(box.width), text: el.textContent.trim().slice(0, 40) });
    }

    // #179 fix 2: nothing clips this element, but its own text can still
    // spill past its own box into a sibling's space and get drawn under that
    // sibling's text (Plan's "Lineup balance" row: "Steady" paints over the
    // label). Only checked when there's no clip finding already, and only
    // counts as overlap when something with its own text actually sits where
    // the spill lands — a switch's empty space next to it doesn't.
    if (!worstLine) {
      let ownWorst = null;
      for (const lr of textLineRects(el)) {
        const over2 = lr.right - box.right;
        if (over2 > 1 && (!ownWorst || over2 > ownWorst.over)) {
          ownWorst = { over: over2, y: (lr.top + lr.bottom) / 2, right: lr.right };
        }
      }
      if (ownWorst) {
        if (ownWorst.y >= 0 && ownWorst.y <= vh) {
          // Sample several points across the spill, not just one -- a flex
          // row's own gap can sit between this box and the neighbour it
          // spills onto, so neither the near edge nor the far tip alone
          // reaches the neighbour's own painted text every time.
          const y = ownWorst.y;
          const from = box.right + 1, to = Math.min(ownWorst.right - 1, vw - 1);
          let hitFound = null;
          for (let i = 0; i <= 8 && from <= to; i++) {
            const x = from + (to - from) * (i / 8);
            if (x < 0 || y < 0 || y > vh) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)
              && !isForeignFixed(hit, el) && hasOwnText(hit)) { hitFound = hit; break; }
          }
          if (hitFound) overlap.push({ el: path(el), hitBy: path(hitFound), text: el.textContent.trim().slice(0, 40) });
        } else {
          // #189: the spilling element can sit entirely off screen at both
          // scroll ends this pass tries (below the fold at the top, above it
          // once scrolled to the bottom), where elementFromPoint never gets a
          // chance. Comparing rects directly works the same either way, and
          // only checks this element's own siblings — the shape every spill
          // found so far sits in (a flex row's label vs. its own value).
          const hitSib = [...el.parentElement.children].find(sib => {
            if (sib === el || !hasOwnText(sib)) return false;
            const sr = sib.getBoundingClientRect();
            return sr.left < ownWorst.right && sr.right > box.right && sr.top < box.bottom && sr.bottom > box.top;
          });
          if (hitSib) overlap.push({ el: path(el), hitBy: path(hitSib), text: el.textContent.trim().slice(0, 40) });
        }
      }
    }

    const words = wordRects(el);
    const bad = words.find(w => w.rectsN > 1 && !w.word.includes('-'));
    if (bad) {
      // Not a squeeze bug if the word itself is wider than its row could
      // ever give it (e.g. "Featherstonehaugh"), only if the row had the
      // room and something else took it: same floor wordFloorRows computes
      // (longest vs rowContent, see WORD_FLOOR_FN in dom.mjs).
      const row = el.closest(ROW_LIKE);
      let exempt = false, fr = null;
      if (row) {
        el.classList.add(SPLIT_MARK);
        [fr] = wordFloorRows('.' + SPLIT_MARK, ROW_LIKE);
        el.classList.remove(SPLIT_MARK);
        exempt = !!fr && fr.longest > fr.rowContent + 1;
      }
      if (!exempt) split.push({ el: path(el), word: bad.word });
    }

    for (const n of [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())) {
      const rg = document.createRange();
      rg.selectNodeContents(n);
      let done = false;
      for (const lr of rg.getClientRects()) {
        if (lr.width <= 0 || lr.height <= 0) continue;
        const x = (lr.left + lr.right) / 2, y = (lr.top + lr.bottom) / 2;
        if (x < 0 || y < 0 || x > vw || y > vh) continue;
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit === el || el.contains(hit) || hit.contains(el)) continue;
        if (isFixedOrSticky(hit)) continue;
        hidden.push({ el: path(el), hitBy: path(hit) });
        done = true;
        break;
      }
      if (done) break;
    }
  }

  const usedAllow = [];
  for (const sel of ${JSON.stringify(ALLOW_SELECTORS)}) {
    for (const el of document.querySelectorAll(sel)) {
      if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
      if (el.scrollWidth > el.clientWidth + 1) { usedAllow.push(sel); break; }
    }
  }

  const FLOOR_MARK = '__cs179floor__';
  floorEls.forEach(el => el.classList.add(FLOOR_MARK));
  const floorFails = wordFloorRows('.' + FLOOR_MARK, 'body')
    .filter(row => row.width < row.floor - 1)
    .map(row => ({ text: row.text.slice(0, 40), width: row.width, floor: row.floor }));
  floorEls.forEach(el => el.classList.remove(FLOOR_MARK));

  return JSON.stringify({ scanned, clip, split, hidden, overlap, usedAllow, usedSideways, floorFails });
})()`;

export async function clipSweepPass(c, origin, { injectCss } = {}) {
  const problems = [];
  const found = []; // raw problems, matched against CLIP_SWEEP_KNOWN_ISSUES below
  let scanned = 0;
  const usedAllow = new Set();
  const usedSideways = new Set();
  const states = [...APP_LARGE_TEXT_STATES, CONFIRM_STATE];

  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    // A reload (`goRich`) wipes any <style> this injected, so it's re-run
    // after every goRich, not just the first one, so it holds through the
    // three states (`firstRun`/`tryLink`/`four`) that reload mid-run.
    const applyInjectCss = () => injectCss && evalIn(c, `(() => { const s = document.createElement('style');
        s.textContent = ${JSON.stringify(injectCss)}; document.head.appendChild(s); })()`);

    await goRich(c, origin, undefined, LONG_AND_SQUEEZE);
    await applyInjectCss();

    for (const v of states) {
      const where = v.name;
      try {
        if (v.firstRun) await firstRun(c, origin);
        else if (v.tryLink) await tryLanding(c, origin, v.tryLink);
        else if (v.four) await reloadWithRecord(c, origin, FOUR);
        else if (v.rotationToast) await openRotationToastState(c);
        else if (v.firstRunTypedRoster) await openFirstRunTypedRosterState(c, origin);
        else await evalIn(c, step(v.open));

        // rule 2a of /new-guard: a state that never actually opened its own
        // screen would otherwise scan whatever the previous state left up and
        // report clean under this state's name.
        if (v.rotationToast) {
          const raised = JSON.parse(await evalIn(c, `!!document.querySelector('.toast[data-undo] .tmsg')`));
          if (!raised) throw new Error('no Undo toast was raised in the Format sheet -- nothing was measured');
        }
        if (v.firstRunTypedRoster) {
          const lines = JSON.parse(await evalIn(c,
            `(document.getElementById('frRoster')?.value || '').split('\\n').filter(Boolean).length`));
          if (lines !== 12) throw new Error(`the roster box holds ${lines} names, not the 12 the state types`);
        }

        for (const pos of ['top', 'bottom']) {
          if (pos === 'bottom') await evalIn(c, SCROLL_TO_BOTTOM);
          const res = JSON.parse(await evalIn(c, CLIP_PROBE));
          scanned += res.scanned;
          res.usedAllow.forEach(sel => usedAllow.add(sel));
          res.usedSideways.forEach(sel => usedSideways.add(sel));
          for (const cl of res.clip) found.push({ kind: 'clip', where, pos, ...cl });
          for (const sp of res.split) found.push({ kind: 'split', where, pos, ...sp });
          for (const hd of res.hidden) found.push({ kind: 'hidden', where, pos, ...hd });
          for (const ov of res.overlap) found.push({ kind: 'overlap', where, pos, ...ov });
          for (const ff of res.floorFails) found.push({ kind: 'floor', where, pos, ...ff });
        }
      } catch (e) {
        problems.push(`${where}: ${e.message.split('\n')[0]}`);
      } finally {
        if (v.close) await evalIn(c, step(v.close))
          .catch(e => problems.push(`${where}: did not close — ${e.message.split('\n')[0]}`));
      }
      // Restore the roster these states swap out (see header comment), and
      // injectCss's <style>, which the same reload wipes too.
      // `firstRunTypedRoster` reloads too (`openFirstRunTypedRosterState`'s
      // own `landWiped`); `rotationToast` does not -- it only mutates the
      // loaded record's game in place via `setGame`, no navigation.
      if (v.firstRun || v.tryLink || v.four || v.firstRunTypedRoster) {
        await goRich(c, origin, undefined, LONG_AND_SQUEEZE);
        await applyInjectCss();
      }
    }

    // An allow-list, sideways-scroll or known-issue entry this run never
    // needed is stale and fails here, same reasoning for all three.
    const reportStale = (label, verb, items, sep, fmt = String) => {
      if (!items.length) return;
      problems.push(`${items.length} stale ${label} entr${items.length === 1 ? 'y' : 'ies'} (never ${verb} this run): ${items.map(fmt).join(sep)}`);
    };
    reportStale('allow-list', 'needed', ALLOW_SELECTORS.filter(sel => !usedAllow.has(sel)), ' | ');
    reportStale('sideways-scroll', 'needed', SIDEWAYS_SELECTORS.filter(sel => !usedSideways.has(sel)), ' | ');

    // A raw finding matched by CLIP_SWEEP_KNOWN_ISSUES is a real, filed bug,
    // not this ticket's to fix, so it's excused rather than pushed as a
    // problem.
    const matchedIssues = new Set();
    for (const p of found) {
      const hit = CLIP_SWEEP_KNOWN_ISSUES.find(k => k.match(p));
      if (hit) { matchedIssues.add(hit.issue); continue; }
      if (p.kind === 'clip') problems.push(`${p.where}@${p.pos}: "${p.text}" is ${p.scrollWidth}px wide in a ${p.clientWidth}px box (${p.el})`);
      else if (p.kind === 'split') problems.push(`${p.where}@${p.pos}: "${p.word}" splits across lines mid-word (${p.el})`);
      else if (p.kind === 'hidden') problems.push(`${p.where}@${p.pos}: ${p.el} is hidden under ${p.hitBy}`);
      else if (p.kind === 'overlap') problems.push(`${p.where}@${p.pos}: "${p.text}" (${p.el}) spills past its own box onto ${p.hitBy}'s text`);
      else if (p.kind === 'floor') problems.push(`${p.where}@${p.pos}: "${p.text}" is ${p.width}px, narrower than its own longest word's ${p.floor}px floor`);
    }
    reportStale('known-issue', 'matched', CLIP_SWEEP_KNOWN_ISSUES.filter(k => !matchedIssues.has(k.issue)), ', ', k => '#' + k.issue);
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await setWidth(c, WIDTH);
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0 && scanned > 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : scanned === 0
        ? 'measured no elements across any state'
        : `${states.length} states, ${scanned} elements scanned (top+bottom), nothing clipped, squeezed, split or hidden`,
  };
}
