/* The printed card.

   The product is a piece of paper: everything here exists so a coach can fold
   a 3.45 × 5 in card into a pocket and read it at a glance across a gym. The
   card is laid out at its true print size, so screen CSS pixels (96/in) map
   1:1 to inches and the on-screen preview is the print output.

   Split out of app.js as its own seam; it reads state and the plan cache, and
   owns the auto-fit, the pagination and the preview zoom. Nothing else in the
   app measures type this way, so the canvas metrics stay here. */
import { fmtClock, fmtMinutes, isOvertimeStint } from './engine.js';
import { $, el, set, ctx2d } from './dom.js';
import { icon } from './icons.js';
import { state, plans, game, gameLabel, teamName, elideMiddle, noRoster, effectiveStints, effectiveMinutes, blockedFix, BLOCKED_TITLE } from './state.js';
import { cornerLabel } from './storage.js';
import { resumeAt, finishedGame } from './live.js';
import { CARD_SIZES, KEY_LINE, printable, isBigRow, clockWidth, timeColumn } from './card-spec.js';

/* The one thing that says a game is already underway. A reload drops the coach
   back here with bench mode shut -- on iOS, switching to the clock app and back
   is often enough -- and "Start game" reads as *start*, so the coach has
   no sign the app still holds their place. Reopening always resumed correctly;
   this is the app finally saying so. Bench mode is deliberately NOT reopened on
   load: a coach who reloaded because something was wrong would be trapped. */
function labelBench(blocked) {
  const r = blocked ? null : resumeAt(plans[state.activeGame] ?? null, game()?.live);
  // #432: a finished game is looked back on, not started.
  const finished = finishedGame(game()?.live);
  for (const sel of ['#abBench', '#gmOpen']) {
    const btn = $(sel);
    if (!btn) continue;
    const lab = btn.querySelector('.ab-lab');
    if (lab) lab.textContent = r ? `Resume · ${r.where}` : finished ? 'View game' : 'Start game';
    /* The `.i` span is the styled wrapper and the svg lives inside it (see the
       hydration loop in app.js), so swap the contents, never the span. */
    const ic = btn.querySelector('.i');
    const want = r ? 'play' : 'maximize-2';
    if (ic && ic.dataset.icon !== want) {
      ic.dataset.icon = want;
      ic.textContent = '';
      ic.append(icon(want, { size: '1em' }));
    }
    /* A `.resuming` class was toggled here and no stylesheet ever carried a
       rule for it. The label above already says "Resume · Q2 4:30" and the
       icon already swaps to `play`; removed 2026-08-24 by the dead-class
       sweep. */
  }
}

/* Nothing on the card said where it came from, and coaches hand these to
   parents. Bare domain, no wordmark, no toggle: it is a fact, not a message.
   It costs no height -- it sits inside the line box the opponent headline
   already reserves -- but its width does come out of the headline's budget
   below. Insert it without doing that and the CSS tail ellipsis takes the job
   back off `fitHeadline`, which is the bug `fitHeadline` exists to fix. */
const MARK = 'benchcard.app';
const cardSize = () => CARD_SIZES[state.ui.cardSize] || CARD_SIZES.pocket;
const contentPx = () => { const c = cardSize(); return c.w * 96 - 2 * c.padX; };
const listPx = (c, strip) => c.h * 96 - c.padTop - c.padBot - c.header - c.key - strip;
/* A card holds the rows that fit at the minimum row height; the fit below then
   spends whatever is left on bigger boxes. The minutes strip is reserved here
   as a constant so RICH (8 stints, 11 players) stays on one card with it on. */
const rowsPerCard = () => { const c = cardSize(); return Math.max(1, Math.floor(listPx(c, state.ui.showMinutes ? c.strip : 0) / c.minRow)); };

// Must match .card's font-family exactly: the auto-fit sizes the card from
// these measurements, so a mismatch silently mis-sizes the print output.
export const CARD_FONT = `'InterVar', "Helvetica Neue", Arial, sans-serif`;
function widthAt(text, px, weight = 800) {
  ctx2d.font = `${weight} ${px}px ${CARD_FONT}`;
  return ctx2d.measureText(text).width;
}
/* Width of a run as the card lays it out: the glyphs, plus the letter-spacing
   after every character and the word-spacing on every space. */
const textW = (t, px, weight, ls = 0, ws = 0) => widthAt(t, px, weight) + t.length * ls * px + (t.split(' ').length - 1) * ws * px;

/* `.card-hd .opp` clips with a tail ellipsis, which eats exactly the words that
   tell two games apart -- three tournament cards all printed "VS RIVERSIDE
   REGIONAL TOURNAMENT QUART…". Reuse the tabs' middle elision, but size it by
   measurement rather than a fixed character count: pocket and half-sheet have
   very different header widths, and a card that could show the whole label
   should. Only the string changes -- type size, baseline and the one-line
   header height are untouched, and the CSS ellipsis stays as the backstop. */
const HEAD_LS = 0.02;  // .card-hd .opp letter-spacing, in em
const HEAD_SLACK = 2;  // canvas metrics land a subpixel under the laid-out box
const headWidth = (t, px) => widthAt(t, px, 900) + t.length * HEAD_LS * px + HEAD_SLACK;
function fitHeadline(text, px, avail) {
  if (avail <= 0 || headWidth(text, px) <= avail) return text;
  let n = text.length - 1;
  while (n > 6 && headWidth(elideMiddle(text, n), px) > avail) n--;
  return elideMiddle(text, n);
}

/* Past a legibility floor the answer is a second card, not smaller type. Two
   floors: the rows that fit at the minimum row height, and then whatever
   `fits(rows)` says -- the real fit, which also fails when wrapped rows are
   still too tall at the smallest boxes and the 0.8 squeeze. When a split does
   not fit, the card holds fewer rows until it does (one row, at worst). */
function paginate(stints, fits = () => true) {
  const split = maxPer => {
    if (stints.length <= maxPer) return [stints];
    const periods = [...new Set(stints.map(s => s.period))];
    const perCard = Math.ceil(periods.length / Math.ceil(stints.length / maxPer));
    const pages = [];
    for (let i = 0; i < periods.length; i += perCard) {
      const set = new Set(periods.slice(i, i + perCard));
      pages.push(stints.filter(s => set.has(s.period)));
    }
    if (pages.every(p => p.length && p.length <= maxPer)) return pages;
    const flat = [];
    for (let i = 0; i < stints.length; i += maxPer) flat.push(stints.slice(i, i + maxPer));
    return flat;
  };
  let cap = rowsPerCard(), pages = split(cap);
  while (cap > 1 && !pages.every(fits)) pages = split(--cap);
  return pages;
}

/* How many lines these names take, wrapped as units with a space between,
   in a run `avail` px wide. The card's text and its minutes strip both ask. */
function linesOf(names, px, wt, avail, ls = 0, ws = 0) {
  const sp = textW(' ', px, wt, ls, ws);
  let lines = 1, cur = 0;
  for (const n of names) {
    const w = textW(n, px, wt, ls, ws);
    if (cur && cur + sp + w > avail) { lines++; cur = w; } else cur += (cur ? sp : 0) + w;
  }
  return lines;
}

/* The fit, from canvas widths. A port of the judged prototype's decisions
   (docs/specs/622-card-redesign/prototype.mjs) with `measureText` standing in
   for the DOM, because `#sheet` can be hidden and the previews are clones that
   are never fitted. Each row is `{ first, newq, ins, outs, outAll, stays, bench,
   lineup }` of printed names. It returns what to apply: box size and wrap per
   row, OUT/STAY sizes, whether STAY is dropped, the half-sheet's right column,
   the row padding and the names-area zoom. */
const SLACK = 0.5;
// `.sub`'s row-gap in card.css: the space between OUT and a STAY on its own line
const SUB_GAP = 2;
const half$ = (a, b) => Math.floor(a * b * 2) / 2;
function fitCard(R, K, isHalf, stripH) {
  const listH = listPx(K, stripH);
  const ws = r => (r.outAll ? 0 : K.ws);
  const outStr = r => (r.outAll ? 'ALL 5' : r.outs.join(' '));
  const tagW = t => (isHalf ? K.tagMin : Math.max(K.tagMin, textW(t, K.tagPx, 900, 0.04) + 8));
  const lines = (names, px, wt, avail) => linesOf(names, px, wt, avail, K.txtLs, K.ws);

  let rw = 0;
  if (isHalf) {
    let w = 0;
    for (const r of R) if (!r.first) {
      w = Math.max(w, 60 + textW(outStr(r), K.o, 800, 0, ws(r)));
      if (r.stays.length) w = Math.max(w, 60 + textW(r.stays.join(' '), K.s, 600, 0, K.ws));
    }
    rw = Math.min(K.rwHi, Math.max(K.rwLo, Math.ceil(w) + 4));
  }
  const avail = contentPx() - K.tick - K.tCol - (isHalf ? 3 : 2) * K.colGap - K.midPadR - rw;
  const chipsW = (r, p) => {
    const big = isBigRow(r.ins.length);
    return r.ins.reduce((a, n) => a + textW(n, p, 800, big ? 0 : 0.02) + 2 * (big ? K.padBig : K.padFew), 0)
      + (r.ins.length - 1) * (big ? K.gapBig : K.gapFew) + K.chipsPadR;
  };

  const layout = (dec, drop) => {
    const rows = R.map(r => ({ r }));
    const chipRows = rows.filter(x => !x.r.first);
    for (const x of chipRows) {
      let p = K.chip - dec;
      while (chipsW(x.r, p) > avail + SLACK && p > K.chipMin) p -= 0.5;
      x.fit = chipsW(x.r, p) > avail + SLACK ? null : p;
    }
    const tier = big => {
      const mine = chipRows.filter(x => (isBigRow(x.r.ins.length)) === big);
      if (!mine.length) return null;
      const ok = mine.map(x => x.fit).filter(Boolean);
      return ok.length ? Math.min(...ok) : K.chipMin;
    };
    let few = tier(false);
    const big = tier(true);
    if (few && big) few = Math.min(few, Math.floor(big / 0.85 * 2) / 2);
    for (const x of chipRows) {
      x.sz = isBigRow(x.r.ins.length) ? big : few;
      x.wrap = chipsW(x.r, x.sz) > avail + SLACK;
    }
    const caps = (which = chipRows) => {
      for (const x of which) {
        x.o = Math.max(K.oMin, Math.min(K.o, half$(x.sz, K.oCap)));
        x.s = Math.max(K.sMin, Math.min(K.s, half$(x.sz, K.sCap)));
      }
    };
    caps();
    // pocket: OUT and STAY share a line, shrunk a little if need be. A row that
    // still cannot puts STAY on a line of its own under OUT (`stack`); `drop`
    // instead leaves STAY off every row, for when that extra line would cost
    // the black boxes size (see the end). OUT is never dropped.
    const grpW = (label, str, px, wt, wsp) => tagW(label) + K.tagGap + textW(str, px, wt, K.txtLs, wsp);
    let nostay = false;
    if (!isHalf) {
      const both = x => grpW('OUT', outStr(x.r), x.o, 800, ws(x.r)) + 8 + grpW('STAY', x.r.stays.join(' '), x.s, 600, K.ws);
      let stuck = false;
      for (const x of chipRows.filter(y => y.r.stays.length)) {
        while (both(x) > avail && (x.o > K.oMin || x.s > K.sMin)) {
          if (x.o > K.oMin) x.o -= 0.5;
          if (x.s > K.sMin) x.s -= 0.5;
        }
        if (both(x) > avail) stuck = x.stack = true;
      }
      // dropped: every row gets its full size back; stacked: only the stacked
      // rows do, since the others still share one line at their shrunk size
      if (stuck) { nostay = drop; caps(drop ? chipRows : chipRows.filter(x => x.stack)); }
    }
    // text lines: shrink a little, then wrap as a unit
    const settle = (label, names, wt, wsp, fs, min) => {
      const str = names.join(' ');
      const w = f => (isHalf ? 60 : tagW(label) + K.tagGap) + textW(str, f, wt, isHalf ? 0 : K.txtLs, wsp);
      const lim = isHalf ? rw : avail;
      let f = fs;
      while (w(f) > lim + SLACK && f > min) f -= 0.5;
      if (w(f) <= lim + SLACK) return { fs: f, lines: 1, wrap: false };
      const col = lim - (isHalf ? 60 : tagW(label) + K.tagGap);
      return { fs: f, lines: lines(names, f, wt, col), wrap: true };
    };
    for (const x of rows) {
      const r = x.r;
      x.grps = [];
      if (r.first) {
        const f = { fs: K.st, wrap: false, lines: 1 };
        const str = r.lineup.join(' ');
        const w = p => textW(str, p, 800, K.txtLs, K.ws);
        while (w(f.fs) > avail + SLACK && f.fs > K.stMin) f.fs -= 0.5;
        if (w(f.fs) > avail + SLACK) { f.wrap = true; f.lines = lines(r.lineup, f.fs, 800, avail); }
        x.st = f;
        x.grps.push({ kind: 'bench', label: 'BENCH', ...settle('BENCH', r.bench, 600, K.ws, K.s, K.minB) });
        continue;
      }
      x.grps.push({ kind: 'out', label: 'OUT', ...settle('OUT', r.outAll ? ['ALL 5'] : r.outs, 800, ws(r), x.o, K.minO) });
      if (r.stays.length && !nostay) x.grps.push({ kind: 'stay', label: 'STAY', ...settle('STAY', r.stays, 600, K.ws, x.s, K.minS) });
    }
    // heights, before padding and zoom
    for (const x of rows) {
      const gh = g => Math.max(K.tagH, g.lines * g.fs * 1.1);
      const subs = x.grps.map(gh);
      x.hSub = isHalf ? subs.reduce((a, b) => a + b, 0) + (subs.length - 1) * K.stackGap
        : K.subTop + (x.stack && !nostay ? subs.reduce((a, b) => a + b, 0) + (subs.length - 1) * SUB_GAP : Math.max(...subs));
      if (x.r.first) x.hMid = K.ebH + K.ebMb + x.st.lines * x.st.fs * 1.05;
      else {
        const lh = x.sz + 2 * K.chipPadY;
        x.hMid = x.wrap ? 2 * lh + 2 * K.rowGap : lh;
      }
    }
    return { rows, nostay };
  };
  const heightOf = (rows, pad, z) => rows.reduce((sum, x, i) => {
    const names = (isHalf ? Math.max(x.hMid, x.hSub) : x.hMid + x.hSub) * z;
    return sum + Math.max(K.minRow, 2 * pad + Math.max(K.tick, K.tH, names) + (i === 0 ? 0 : x.r.newq ? 3 : 1));
  }, 0);
  const tall = (rows, pad, z) => heightOf(rows, pad, z) > listH + SLACK;

  // too tall: shrink the boxes a step at a time before touching the padding;
  // never squash rows into each other
  const squeeze = drop => {
    let dec = 0, out = layout(0, drop);
    while (tall(out.rows, K.rowPad, 1) && dec < 5) { dec += 0.5; out = layout(dec, drop); }
    let pad = K.rowPad, z = 1;
    if (tall(out.rows, pad, z)) pad = 3;
    // still too tall: scale only the names area, never the time column or the tick
    while (tall(out.rows, pad, z) && z > 0.8) z = Math.round((z - 0.01) * 100) / 100;
    return { ...out, rw, pad, z, tooTall: tall(out.rows, pad, z) };
  };
  // STAY on its own line is kept unless the card cannot fit it even after the
  // usual squeeze; only then does it come off every row
  const kept = squeeze(false);
  return kept.tooTall ? squeeze(true) : kept;
}

function labelsFor(plan) {
  if (state.ui.cardId !== 'number') return plan.shortNames;
  const out = {};
  for (const p of state.players) out[p.id] = p.number || plan.shortNames[p.id];
  return out;
}

/* Minutes read off the rows the card is actually printing.

   The footer used `plan.minutes` — the solver's answer — while the stints
   above it are rebuilt from `live.overrides` whenever the coach has swapped
   anyone by hand. So a card printed after a swap contradicted itself: the
   rows showed a kid on the floor for stints the plan never gave her, and the
   footer still quoted the planned total. The totalling now lives in
   `state.js` as `effectiveMinutes`, next to `effectiveStints`, because the
   timeline and the stat tiles needed the same number and a second copy of it
   here is how the card and the plan page drifted apart in the first place. */

/* Everything the card's rows are drawn from, and the fit that sizes them: the
   printed names of each row, the minutes strip, the time column and `fitCard`'s
   answer. `paginate` asks it whether a page fits before the card is built. */
const when$ = r => ({ q: r.periodName || 'Q' + r.period, clk: fmtClock(r.startSec) });

function layoutOf(plan, rows, minutes) {
  const sh = labelsFor(plan);
  const size = cardSize();
  const isHalf = state.ui.cardSize === 'half';
  const ids = Object.keys(plan.minutes);
  const names = list => list.map(i => sh[i]);
  const specs = rows.map((r, i) => ({
    first: r.index === 0,
    newq: i > 0 && rows[i - 1].period !== r.period,
    ins: names(r.in), outs: names(r.out), outAll: r.out.length === 5,
    stays: names(r.onFloor.filter(id => !r.in.includes(id))),
    bench: names(ids.filter(id => !r.onFloor.includes(id))),
    lineup: names(r.onFloor),
  }));
  const minsText = state.ui.showMinutes
    ? Object.entries(minutes).sort((a, b) => b[1] - a[1]).map(([id, m]) => `${sh[id]} ${fmtMinutes(m)}`).join('   ') : '';
  let stripH = 0;
  if (minsText) {
    // the strip wraps like text: reserve the lines it will really take
    const lines = linesOf(minsText.split(/\s{3}/), size.stripPx, 600, contentPx());
    stripH = Math.max(size.strip, lines * size.stripLh + 3);
  }
  const clk$ = (t, px) => clockWidth(t, px, widthAt(':', px, 900), isHalf ? 0 : -0.01);
  const tCol = timeColumn(size, rows.map(r => {
    const { q, clk } = when$(r);
    return isHalf ? textW(q, 18, 900) + 5 + clk$(clk, 26) : Math.max(textW(q, 13, 900), clk$(clk, 16));
  }));
  const fit = fitCard(specs, { ...size, tCol }, isHalf, stripH);
  return { specs, fit, tCol, size, isHalf, minsText };
}

function buildCard(plan, rows, page, pageCount, title, when, minutes = plan.minutes) {
  const { specs, fit, tCol, size, isHalf, minsText } = layoutOf(plan, rows, minutes);
  const card = el('div', 'card' + (isHalf ? ' half' : ''));

  const per = [...new Set(rows.map(r => r.period))];
  /* A period is named as its stint names it: regulation "Q<n>", overtime by
     the engine's own `periodName` ("OT", "OT2"), so there is one answer.
     Regulation keeps `Q<n>` on purpose: the title's name for it is unchanged
     for games without overtime (spec 370 item 4). */
  const nameOf = period => {
    const row = rows.find(r => r.period === period);
    return isOvertimeStint(row) ? row.periodName : `Q${period}`;
  };
  const scope = pageCount > 1 ? ` ${nameOf(per[0])}${per.length > 1 ? '-' + nameOf(per[per.length - 1]) : ''}` : '';
  const hd = el('div', 'card-hd');
  const whenTxt = (when || '') + (pageCount > 1 ? `  ${page + 1}/${pageCount}` : '');
  // The scope ("Q1-Q2") and the date are never elided: they are short and they
  // are the other half of "which card am I holding".
  const gap = 0.06 * 96;
  const avail = contentPx() - (whenTxt ? widthAt(whenTxt, size.whenPx, 700) + gap : 0)
    - widthAt(MARK, size.markPx, 600) - gap - headWidth(scope, size.oppPx);
  hd.append(el('span', 'opp', fitHeadline(title, size.oppPx, avail) + scope));
  hd.append(el('span', 'card-mark', MARK));
  hd.append(el('span', 'when', whenTxt));
  card.append(hd);

  const list = el('div', 'list');
  if (fit.nostay) card.classList.add('nostay');
  if (isHalf) card.style.setProperty('--rw', fit.rw + 'px');
  if (tCol !== size.tCol) card.style.setProperty('--tcol', tCol + 'px');
  const grpEl = (g, spec) => {
    const e = el('div', 'grp ' + (g.kind === 'stay' ? 'g-stay' : g.kind === 'out' ? 'g-out' : 'g-bench') + (g.wrap ? ' cwrap' : ''));
    e.append(el('span', 'ctag', g.label));
    const t = el('span', g.kind === 'out' ? 'o' : 's', g.kind === 'bench' ? spec.bench.join(' ')
      : g.kind === 'stay' ? spec.stays.join(' ') : spec.outAll ? 'ALL 5' : spec.outs.join(' '));
    if (g.kind === 'out' && spec.outAll) t.classList.add('all');
    t.style.fontSize = g.fs + 'px';
    e.append(t);
    return e;
  };
  for (const [i, x] of fit.rows.entries()) {
    const r = rows[i], spec = specs[i];
    const row = el('div', 'crow' + (spec.newq ? ' newq' : ''));
    if (fit.pad !== size.rowPad) row.style.paddingBlock = fit.pad + 'px';
    row.append(el('div', 'tick'));
    const t = el('div', 'ctime');
    t.append(el('span', 'cq', when$(r).q), el('span', 'cclk', when$(r).clk));
    row.append(t);
    const mid = el('div', isHalf ? 'mid' : 'b');
    if (spec.first) {
      mid.append(el('div', 'eb', 'STARTING FIVE'));
      const st = el('div', 'lineup' + (x.st.wrap ? ' cwrap' : ''), spec.lineup.join(' '));
      st.style.fontSize = x.st.fs + 'px';
      mid.append(st);
    } else {
      const chips = el('div', 'cchips ' + (isBigRow(spec.ins.length) ? 'big' : 'few') + (x.wrap ? ' cwrap' : ''));
      chips.style.fontSize = x.sz + 'px';
      spec.ins.forEach((n, k) => {
        chips.append(el('span', 'cchip', n));
        if (x.wrap && k === Math.ceil(spec.ins.length / 2) - 1) chips.append(el('span', 'br'));
      });
      mid.append(chips);
    }
    const sub = el('div', 'sub' + (x.stack && !fit.nostay ? ' stack' : ''));
    for (const g of x.grps) sub.append(grpEl(g, spec));
    if (isHalf) { row.append(mid, sub); if (fit.z < 1) mid.style.zoom = sub.style.zoom = fit.z; }
    else { mid.append(sub); row.append(mid); if (fit.z < 1) mid.style.zoom = fit.z; }
    list.append(row);
  }
  card.append(list);

  const ft = el('div', 'card-ft');
  ft.append(el('div', 'key', KEY_LINE));
  if (minsText) ft.append(el('div', 'mins', minsText));
  card.append(ft);
  return card;
}

/* The card is laid out at its true print size so screen px map 1:1 to inches;
   an 8in half-sheet is simply wider than a phone. Preview-only `zoom` shrinks
   it to fit the column (print resets it to 1), so the coach sees the whole
   card instead of a slice of one.

   #29 decision 10 / #56: reads the stage's own computed horizontal padding
   rather than a hard-coded 32 (wrong the moment a coach turns the OS text
   size up, which is what widens `.stage`'s padding at a 32px root and is
   exactly the overflow #56 reported), and fits every stage on the game
   screen carries -- `#sheet` and, once the card sheet exists, its own
   preview -- to its own width rather than assuming they match. */
function fitStage(stage) {
  if (!stage) return;
  const cs = getComputedStyle(stage);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const avail = stage.clientWidth - padX;
  const wanted = cardSize().w * 96;
  stage.style.setProperty('--cardzoom', avail > 0 ? Math.min(1, avail / wanted).toFixed(4) : 1);
}
/* Every stage on the page, found by class: #36 step 3 adds a third
   (`#frStage`) and a fourth would need no line here either.

   IT ONLY SEES ATTACHED STAGES. `cardPreviewInto` ends in a call to this, so a
   host that is still detached when it is filled -- which is what #36's
   `paintFr` does, building the step body as an argument to `paintFlowShell`
   -- is not in this list and keeps whatever `--cardzoom` it had, meaning
   none. A caller in that shape has to call this again once the node is in the
   document; `paintFr` (onboarding.js) does, and says so. */
export function fitPreview() {
  for (const s of document.querySelectorAll('.stage')) fitStage(s);
}
addEventListener('resize', fitPreview);

/* The "nothing to show yet" panel a stage falls back to -- same markup
   whether it is `#sheet` itself (no card to print) or the card sheet's own
   preview (no card to clone), only the title and message differ. */
function stageEmpty(title, message) {
  const d = el('div', 'stage-empty');
  const si = el('div', 'se-ico');
  si.append(icon('printer', { size: '1.6rem', stroke: 1.6 }));
  d.append(si);
  d.append(el('div', 'se-t', title));
  d.append(el('div', 'se-s', message));
  return d;
}

/* #29 decision 2: the card sheet's own preview is a clone of `#sheet`'s
   non-copy cards, not a second render -- `renderCards` below is the one
   place that builds a `.card`, and cloning is what keeps this from becoming
   a second, driftable implementation of it. Refreshed here (called from
   `renderCards` while the sheet is open) and once more when the sheet opens
   (`app.js`), matching decision 2's "refreshed whenever renderCards runs
   while the sheet is open and when it opens". Blocked reuses `blockedFix`'s
   `message` only -- decision 7 explicitly withholds the fix button here
   ("the sheet is one level and the fix is another sheet"). */
export function cardPreviewInto(host) {
  if (!host) return;
  host.textContent = '';
  const p = plans[state.activeGame];
  if (!p || !p.ok) {
    const fix = blockedFix(p?.issues);
    host.append(stageEmpty(BLOCKED_TITLE,
      fix ? fix.message : 'Add your players and the card shows up here.'));
    return;
  }
  for (const c of document.querySelectorAll('#sheet .card:not(.card-copy)'))
    host.append(c.cloneNode(true));
  fitPreview();
}
// #36: step 3's `#frStage` clones the same way the card sheet's own preview
// does -- `cardPreviewInto` above is that one place, now with two callers.
export function refreshCardSheetPreview() { cardPreviewInto($('#sheetCardPreview')); }

export function renderCards() {
  const sheet = $('#sheet'); sheet.textContent = '';
  // Fix pass finding 5: fitting `#sheet` here duplicated `applyGameView`'s
  // own `if (onCard) fitPreview()` (timeline.js) -- render.js's section
  // lists always run 'cards' before 'gameview', so both ran on every Card
  // view render. `applyGameView` is the sole owner now; `#cardSize`'s own
  // handler (app.js) adds 'gameview' to its render(...) call so a size
  // change still refits.
  const note = $('#cardnote'); note.textContent = '';
  const live = plans[state.activeGame];
  const blocked = !live || !live.ok;
  set('#gmOpen', 'disabled', blocked);
  set('#abBench', 'disabled', blocked);
  labelBench(blocked);
  /* Shuffle only moves the seed, and `analyzeFeasibility` runs before the seed
     is used at all -- a blocked plan is blocked for every seed. So an enabled
     Shuffle over "No players yet" promises a fix it can never deliver. Like
     `#print`, the `s` shortcut clicks this button, so disabling here disables
     the key too. */
  const done = finishedGame(game()?.live); // a finished game's minutes are played; a new seed would rewrite them
  /* #545: Order has no seed to shuffle, so the button is gone and the `s` key,
     which clicks it, does nothing. */
  const ordered = game()?.strategy === 'order';
  set('#regen', 'hidden', ordered);
  set('#regen', 'disabled', blocked || done || ordered);
  set('#regen', 'title', blocked
    ? (noRoster() ? 'Add your roster first. Nothing to shuffle yet'
      : 'Shuffling only changes the seed. Fix the errors above first')
    : done ? 'This game is finished. Its minutes are already played' : '');
  /* Print used to stay live while the plan was blocked, and there is no `.sheet`
     to print in that state -- the coach got a page of furniture and no card,
     which costs paper and, worse, is only discovered at the printer. Share is
     the same: there is no card to turn into an image either. The `p` shortcut
     clicks `#print` rather than calling window.print() itself, so disabling
     here disables the key too.

     One rule, one place. That bug was fixed once on `#print` and `#shareCard`
     and stayed live on `#abCard` -- the action-bar printer, which is the one a
     coach actually taps on a phone -- because each control remembered the rule
     separately and the third was added after the fix. So the rule now lives on
     the control: anything that ends in a print dialog or a share sheet carries
     `data-needs-card` in the markup and this sweep gates all of them. Adding a
     fourth control cannot silently miss it, and `test/print-gate.test.js`
     discovers the controls from their handlers rather than from a list, so a
     new one that forgets the attribute fails the suite. */
  for (const n of document.querySelectorAll('[data-needs-card]')) {
    n.disabled = blocked;
    n.title = blocked ? 'No card yet. Fix the errors above first' : '';
  }
  const ab = $('#actionbar');
  if (ab) ab.hidden = state.view !== 'games' || !state.onboarded;
  sheet.classList.toggle('blank', blocked);
  if (blocked) {
    const why = blockedFix(live?.issues);
    sheet.append(stageEmpty('No card yet', noRoster() ? 'Add your players and the card shows up here.'
      : why ? why.message : 'Set up the game to see the card.'));
    // #29 decision 2: refreshed here too, so the card sheet's own preview
    // (a clone of `#sheet`) stays in sync while it is open, not just on open.
    if ($('#sheetCard')?.open) refreshCardSheetPreview();
    return;
  }
  const which = state.ui.printScope === 'day' ? state.day.games.map((_, i) => i) : [state.activeGame];
  const notes = [];
  for (let copy = 0; copy < state.ui.copies; copy++) {
    for (const i of which) {
      const p = plans[i];
      if (!p || !p.ok) continue;
      const g = state.day.games[i];
      const stints = effectiveStints(g, p);
      /* Whole-game totals even when the card splits across pages, and keyed
         off `p.minutes` so the ids and their order are exactly what the
         unswapped card prints. */
      const mins = effectiveMinutes(g, p);
      const shown = printable(stints);
      const pages = paginate(shown, rows => !layoutOf(p, rows, mins).fit.tooTall);
      const many = pages.length > 1 || which.length > 1;
      const title = many ? gameLabel(g, i).toUpperCase()
        : g.label ? 'VS ' + g.label.toUpperCase()
        : (teamName().toUpperCase() || 'ROTATION');
      const corner = cornerLabel(state.day.date, g.tipoff);
      pages.forEach((rows, pg) => {
        const c = buildCard(p, rows, pg, pages.length, title, corner, mins);
        // Copies are a print setting. Rendering all of them on screen made the
        // preview two identical cards deep -- ~500px of scroll on a phone
        // saying nothing the first one did not. They stay in the DOM because
        // print pulls the same nodes; screen hides everything past copy 0.
        if (copy > 0) c.classList.add('card-copy');
        sheet.append(c);
      });
      if (copy === 0 && pages.length > 1) {
        notes.push(`${gameLabel(g, i)} needs ${pages.length} cards: all ${shown.length} lines will not fit one at a readable size. Sub less often for a single card.`);
      }
    }
  }
  if (notes.length) {
    const ic = el('span', 'ico');
    ic.append(icon('info', { size: '1.05em' }));
    note.append(ic, el('span', null, notes.join(' ')));
  }
  if ($('#sheetCard')?.open) refreshCardSheetPreview();
}
