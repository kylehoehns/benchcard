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

/* #204 "What would settle it" item 6: the new "text paints past its own box"
 * floor check's own allow list, scoped to that one finding kind rather than
 * excluding the element from every check the way CLIP_SWEEP_ALLOW above does
 * — the `h2.flow-q` step headings in Add a game ("Who are you playing?",
 * "How should minutes split?") run 7–14px into the 32px side margin but stay
 * whole and readable (#204's Decisions: accepted). Same "stale entry fails"
 * treatment as the allow list above. */
export const CLIP_SWEEP_FLOOR_ALLOW = [
  { selector: 'h2.flow-q', reason: 'the step heading runs into the side margin but stays whole and readable' },
];

/* #179 Task 2: real, filed bugs the LONG_AND_SQUEEZE fixture also trips —
 * not false alarms, and not this ticket's to fix, so each is excused by
 * issue number the same way CLIP_SWEEP_ALLOW excuses a deliberate "…" rule.
 * `match` sees the same raw finding shape clipSweepPass builds for every
 * clip/split/hidden/floor/overlap (`kind`, `where`, `el`, and whichever of
 * `text`/`word`/`hitBy` that kind carries). An entry no finding matches this
 * run is stale and fails below, same as the allow list. */
export const CLIP_SWEEP_KNOWN_ISSUES = [];

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
const FLOOR_ALLOW_SELECTORS = CLIP_SWEEP_FLOOR_ALLOW.map(a => a.selector);

/* One probe, both scroll positions, every state: scanned/clip/split/hidden/
 * floor/overlap off one walk of `CANDIDATE_SEL` (every allow-listed element
 * excluded, the way `TYPESCALE_PROBE` in `type-scale.mjs` walks
 * `document.body.querySelectorAll('*')`). `wordFloorRows` (`WORD_FLOOR_FN`,
 * `dom.mjs`) is still reused, but only for the split check's own row-vs-word
 * floor (`ROW_LIKE`, below) — #204 replaced the page-width `rowSel: 'body'`
 * floor that used to run over every scanned element with a per-element check:
 * an element's own text-node client rects (`textLineRects`, `hasOwnText`,
 * `isSrOnly`, `checkVisibility` — none of them re-derived) measured against
 * its OWN border box rather than `body`'s width, which ignores a row's own
 * padding, avatars, icons, chevrons and switches (#204's survey: 9 false
 * alarms from the old floor, none from this one).
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
  // #204 "What would settle it" item 3: a spill can land on a form control
  // that carries no text of its own (a switch's <input>, the #221 case) --
  // counted as an overlap hit the same as a sibling that DOES have text.
  const FORM_CONTROL_TAGS = new Set(['input', 'select', 'button', 'textarea']);
  const isFormControl = el => FORM_CONTROL_TAGS.has(el.tagName.toLowerCase());
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
  // #204: the new floor check's own allow list (h2.flow-q), scoped to that
  // one finding kind -- unlike CLIP_SWEEP_ALLOW, matching this selector does
  // NOT exclude the element from CANDIDATE_SEL, so it still runs through
  // clip/split/hidden/overlap above.
  const FLOOR_ALLOW_SELECTORS = ${JSON.stringify(FLOOR_ALLOW_SELECTORS)};
  const usedFloorAllow = [];
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
  // '.plan-rule-sentence' (#190) is added narrowly, not as a general "word
  // wider than its clipping box" excuse -- that excused #187's Today card
  // team names too and is rejected. It qualifies because it is a block
  // alone on its own line in #planSub: nothing beside it can take its room,
  // so its own box (the sheet's width less its fixed side margins) is the
  // widest it can ever be, making it its own row the same way '.prow' is.
  // Known weakness: a later change that narrowed the heading itself (a
  // max-width) would excuse a split inside it too. The clip check above
  // still catches anything actually cut off.
  // #191/#197: .alert, .dayrow and .plr join the list for the same reason --
  // each now wraps a word rather than clipping or overlapping it, so the
  // floor below (fr.longest > fr.rowContent) is what still tells "the word
  // was wider than its whole row" apart from "the row had room and something
  // else squeezed it". This only loosens the check for a word wider than its
  // own row -- it does not widen the floor itself.
  const ROW_LIKE = '.prow, .gm-p, .gm-b, .sn-row, .plan-rule-sentence, .alert, .dayrow, .plr';
  const SPLIT_MARK = '__cs179split__';

  let scanned = 0;
  const clip = [], split = [], hidden = [], overlap = [], floor = [];

  for (const el of document.querySelectorAll(${JSON.stringify(CANDIDATE_SEL)})) {
    if (!hasOwnText(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (isSrOnly(r)) continue;
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    scanned++;

    const cs = getComputedStyle(el);

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

    // #204: the floor check -- does el's OWN text paint past its OWN border
    // box, on either edge -- reusing the same textLineRects measurement the
    // clip check above just took, but against \`box\` (this element's own
    // rect) rather than \`bound\` (the nearest CLIPPING ancestor). Independent
    // of the clip check: a heading can paint past its own box into open
    // margin space with no clipping ancestor and no clip finding at all (the
    // h2.flow-q case), and unlike overlap below it does not require anything
    // to actually sit where the spill lands.
    const floorAllowSel = FLOOR_ALLOW_SELECTORS.find(sel => el.matches(sel));
    let floorOver = null;
    for (const lr of textLineRects(el)) {
      const over = Math.max(lr.right - box.right, box.left - lr.left);
      if (over > 1 && (!floorOver || over > floorOver.over)) floorOver = { over, width: lr.width };
    }
    if (floorOver) {
      if (floorAllowSel) usedFloorAllow.push(floorAllowSel);
      else floor.push({ el: path(el), text: el.textContent.trim().slice(0, 40), over: Math.round(floorOver.over), box: Math.round(box.width) });
    }

    // #179 fix 2: nothing clips this element, but its own text can still
    // spill past its own box into a sibling's space and get drawn under that
    // sibling's text (Plan's "Lineup balance" row: "Steady" paints over the
    // label). Only checked when there's no clip finding already, and only
    // counts as overlap when something actually sits where the spill lands —
    // empty space beside it doesn't. #204 "What would settle it" item 3: that
    // something can be a sibling with its own text OR a form control with
    // none of its own (isFormControl, above) -- the #221 case, "Even out
    // earlier games" painting under the switch <input> it labels.
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
              && !isForeignFixed(hit, el) && (hasOwnText(hit) || isFormControl(hit))) { hitFound = hit; break; }
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
            if (sib === el || !(hasOwnText(sib) || isFormControl(sib))) return false;
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

  return JSON.stringify({ scanned, clip, split, hidden, overlap, floor, usedAllow, usedSideways, usedFloorAllow });
})()`;

export async function clipSweepPass(c, origin, { injectCss } = {}) {
  const problems = [];
  const found = []; // raw problems, matched against CLIP_SWEEP_KNOWN_ISSUES below
  let scanned = 0;
  const usedAllow = new Set();
  const usedSideways = new Set();
  const usedFloorAllow = new Set();
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
          res.usedFloorAllow.forEach(sel => usedFloorAllow.add(sel));
          for (const cl of res.clip) found.push({ kind: 'clip', where, pos, ...cl });
          for (const sp of res.split) found.push({ kind: 'split', where, pos, ...sp });
          for (const hd of res.hidden) found.push({ kind: 'hidden', where, pos, ...hd });
          for (const ov of res.overlap) found.push({ kind: 'overlap', where, pos, ...ov });
          for (const fl of res.floor) found.push({ kind: 'floor', where, pos, ...fl });
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

    // An allow-list, sideways-scroll, floor-allow or known-issue entry this
    // run never needed is stale and fails here, same reasoning for all four.
    const reportStale = (label, verb, items, sep, fmt = String) => {
      if (!items.length) return;
      problems.push(`${items.length} stale ${label} entr${items.length === 1 ? 'y' : 'ies'} (never ${verb} this run): ${items.map(fmt).join(sep)}`);
    };
    reportStale('allow-list', 'needed', ALLOW_SELECTORS.filter(sel => !usedAllow.has(sel)), ' | ');
    reportStale('sideways-scroll', 'needed', SIDEWAYS_SELECTORS.filter(sel => !usedSideways.has(sel)), ' | ');
    reportStale('floor allow-list', 'needed', FLOOR_ALLOW_SELECTORS.filter(sel => !usedFloorAllow.has(sel)), ' | ');

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
      else if (p.kind === 'floor') problems.push(`${p.where}@${p.pos}: "${p.text}" paints ${p.over}px past its own ${p.box}px box (${p.el})`);
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
