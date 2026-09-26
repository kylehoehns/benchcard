import { evalIn, step, TODAY_HOME, CSS_VAR_COLOR_PROBE, setWidth, WIDTH } from './dom.mjs';
import { goRich } from './fixtures.mjs';

/* #141 (one control each), decision 1 and "What would settle it" item 2:
 * `#removeGame` and `#removeTeam` used to be `btn ghost danger sm`, a
 * different control from the `.prow-danger` row `#playerRemove`, "Remove
 * rule" and "Remove unit N" already were (the ticket's own survey). Neither
 * of those two, nor the class rename itself, has a browser seam anywhere
 * else: `test/one-control-each.test.js` proves the class from source, but
 * "48px tall", "full width" and "reads in `--err`" are computed facts only a
 * live page can settle. The other three remove rows are unchanged by this
 * ticket (already `.prow-danger` per the survey), so they are not
 * re-measured here -- proving a control nothing touched would not catch a
 * regression this diff could cause.
 *
 * Height alone does not tell a `.prow-danger` row apart from the old `.btn
 * ghost danger sm`: app.css already gives every `.btn` a 48px `min-height`
 * (`.btn, .plr, .chip { min-height: 48px; }`), and Chrome's own UA
 * stylesheet centers `<button>` text by default, so both the old and the new
 * markup pass a height-and-centered check. What a `.prow` row actually adds
 * is `width: 100%` -- a `.btn` sizes to its own content instead -- so this
 * checks the button's rendered width against its `.pgrp` parent's width,
 * which only a full-width row can match.
 *
 * `--err` is read back through `CSS_VAR_COLOR_PROBE` (`dom.mjs`), the same
 * indirection `control-size.mjs` uses for `--seg-track`, so this never types
 * out a hex/rgb literal a future palette change would silently drift past.
 *
 * #141 preview defect: below 1100px the Remove row sat flush against "Stint
 * by stint", 0px apart. It now goes last in the game column, the column's
 * usual gap below the card above it. That gap is pinned as measured on
 * `main`: 32px at 390 (flex, margins add) and 17.6px at 1280 (block flow,
 * margins collapse). */

const TOL = 2;

const GAME_COLUMN_GAP_PX = { 390: 32, 1280: 17.6 };

async function measureGameColumn(c) {
  return JSON.parse(await evalIn(c, `(() => {
    const rect = el => {
      if (!el || el.getClientRects().length === 0) return null;
      const r = el.getBoundingClientRect();
      return { t: r.top, b: r.bottom, l: r.left, r2: r.right };
    };
    const pgrp = document.getElementById('removeGame').closest('.pgrp');
    return JSON.stringify({
      pgrp: rect(pgrp),
      sthis: rect(document.querySelector('.side-box.s-thisgame')),
      tabledetails: rect(document.getElementById('tabledetails')),
      gmstart: rect(document.querySelector('.gm-start')),
    });
  })()`));
}

// Two rects are in the same visual column only if their horizontal ranges
// intersect -- at 1280 "Stint by stint" sits in the left rail, well left of
// the right rail's cards, and being far below them on the page does not mean
// it is stacked underneath them.
const overlapsCol = (a, b) => !!a && !!b && a.l < b.r2 && b.l < a.r2;

function checkGameColumnOrder(problems, width, m) {
  const { pgrp, sthis, tabledetails, gmstart } = m;
  if (!pgrp) { problems.push(`w=${width}: #removeGame's .pgrp not found or not visible`); return; }

  const gapPx = GAME_COLUMN_GAP_PX[width];
  const cards = [['This game', sthis], ['Stint by stint', tabledetails], ['Start game', gmstart]];

  // (a) whichever visible card sits immediately above `.pgrp`, in its own
  // column, must leave at least the column's own gap.
  let above = null;
  for (const [label, r] of cards) {
    if (!r || !overlapsCol(r, pgrp)) continue;
    if (r.b <= pgrp.t + TOL && (!above || r.b > above.r.b)) above = { label, r };
  }
  if (!above) {
    problems.push(`w=${width}: no card found above #removeGame's .pgrp (top ${pgrp.t})`);
  } else {
    const gap = pgrp.t - above.r.b;
    if (gap < gapPx - TOL) {
      problems.push(`w=${width}: .pgrp starts ${gap.toFixed(2)}px below "${above.label}" (bottom ${above.r.b}), want >= ${gapPx}px -- the column's own This game -> next-card gap`);
    }
  }

  // (b) nothing but Start game may sit below it.
  for (const [label, r] of cards) {
    if (label === 'Start game' || !r || !overlapsCol(r, pgrp)) continue;
    if (r.t >= pgrp.b - TOL) {
      problems.push(`w=${width}: "${label}" (top ${r.t}) sits below #removeGame's .pgrp (bottom ${pgrp.b}) -- only Start game may follow it`);
    }
  }
}

async function measureRemoveRow(c, sel) {
  return JSON.parse(await evalIn(c, `(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || el.getClientRects().length === 0) return JSON.stringify(null);
    const pgrp = el.closest('.pgrp');
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return JSON.stringify({
      h: r.height,
      w: r.width,
      pgrpW: pgrp ? pgrp.getBoundingClientRect().width : null,
      color: cs.color,
      inPgrp: !!pgrp,
    });
  })()`));
}

function checkRemoveRow(problems, where, m, err) {
  if (!m) { problems.push(`${where}: not found or not visible -- nothing measured`); return; }
  if (Math.abs(m.h - 48) > TOL) problems.push(`${where}: ${m.h}px tall, want 48 +/-${TOL}`);
  if (m.color !== err) problems.push(`${where}: text color is ${m.color}, --err resolves to ${err}`);
  if (!m.inPgrp) problems.push(`${where}: is not inside a .pgrp`);
  else if (Math.abs(m.w - m.pgrpW) > TOL) problems.push(`${where}: ${m.w}px wide, want the .pgrp's own ${m.pgrpW}px (a .prow row is full width, a .btn is not)`);
}

export async function removeRowsPass(c, origin) {
  const problems = [];
  let measured = 0;

  try {
    const err = await evalIn(c, `(${CSS_VAR_COLOR_PROBE})('var(--err)')`);

    // `goRich` (this row's own `setup: 'rich'`) lands straight on the games
    // view -- it waits for `.card`, same as `control-size.mjs`'s own comment
    // on the point -- so `#removeGame` is already on screen with no click.
    const game = await measureRemoveRow(c, '#removeGame');
    checkRemoveRow(problems, '#removeGame', game, err);
    if (game) measured++;

    // Restore WIDTH even on a throw: #removeTeam is measured at it next.
    try {
      for (const width of [390, 1280]) {
        await setWidth(c, width);
        const col = await measureGameColumn(c);
        checkGameColumnOrder(problems, width, col);
      }
    } finally {
      await setWidth(c, WIDTH);
    }

    await evalIn(c, step(TODAY_HOME));
    await evalIn(c, step(`document.querySelector('#settingsBtn').click()`));
    const team = await measureRemoveRow(c, '#removeTeam');
    checkRemoveRow(problems, '#removeTeam', team, err);
    if (team) measured++;

    // Rule 2a: 2 rows measured, or a selector stopped matching.
    if (measured < 2) problems.push(`only ${measured}/2 remove rows were measured`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await evalIn(c, step(TODAY_HOME));
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `#removeGame and #removeTeam are both 48px, full-width .pgrp rows, in --err`,
  };
}
