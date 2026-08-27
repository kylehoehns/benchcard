/* The printed card.

   The product is a piece of paper: everything here exists so a coach can fold
   a 3.45 × 5 in card into a pocket and read it at a glance across a gym. The
   card is laid out at its true print size, so screen CSS pixels (96/in) map
   1:1 to inches and the on-screen preview is the print output.

   Split out of app.js as its own seam; it reads state and the plan cache, and
   owns the auto-fit, the pagination and the preview zoom. Nothing else in the
   app measures type this way, so the canvas metrics stay here. */
import { fmtClock, fmtMinutes } from './engine.js';
import { $, el, set, ctx2d } from './dom.js';
import { icon } from './icons.js';
import { state, plans, game, gameLabel, teamName, elideMiddle, noRoster, effectiveStints, effectiveMinutes } from './state.js';

/* Where an unfinished game has got to, or null. `live.at` is the stint the
   coach last had open; stint 0 is indistinguishable from "never started" and
   the last stint is a game that is over (game mode restarts that one), so
   only the middle counts as underway. */
export function resumeAt(p = plans[state.activeGame], g = game()) {
  if (!p || !p.ok || !g) return null;
  const at = g.live?.at || 0;
  if (at <= 0 || at >= p.stints.length - 1) return null;
  const row = p.stints[at];
  return { at, where: `${row.periodName || 'Q' + row.period} ${fmtClock(row.startSec)}` };
}

/* The one thing that says a game is already underway. A reload drops the coach
   back here with bench mode shut -- on iOS, switching to the clock app and back
   is often enough -- and "Use on the bench" reads as *start*, so the coach has
   no sign the app still holds their place. Reopening always resumed correctly;
   this is the app finally saying so. Bench mode is deliberately NOT reopened on
   load: a coach who reloaded because something was wrong would be trapped. */
function labelBench(blocked) {
  const r = blocked ? null : resumeAt();
  for (const [sel, verb] of [['#abBench', 'Resume'], ['#gmOpen', 'Resume the game']]) {
    const btn = $(sel);
    if (!btn) continue;
    const lab = btn.querySelector('.ab-lab');
    if (lab) lab.textContent = r ? `${verb} · ${r.where}` : sel === '#abBench' ? 'Use on the bench' : 'Use this on the bench';
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

/* Two shapes, both cut from one letter sheet: the pocket card two-up across,
   the clipboard half-sheet two-up down the page (2 × 5.1in + the .15in
   gutter is 10.35in, comfortably inside the .25in margins). Everything downstream reads
   these numbers, so the auto-fit and the pagination follow the shape. */
const CARD_SIZES = {
  // oppPx/whenPx must match `.card-hd .opp` / `.card-hd .when` in index.html
  // (and their `.card.half` overrides): the header elision is measured from
  // them, so a mismatch elides at the wrong width.
  pocket: { w: 3.45, h: 5.0, pad: 0.11, header: 26, footer: 18, minName: 16, maxName: 26, oppPx: 11, whenPx: 8, markPx: 7, cols: 1 },
  half:   { w: 8.0, h: 5.1, pad: 0.2, header: 34, footer: 22, minName: 20, maxName: 44, oppPx: 15, whenPx: 11, markPx: 9, cols: 2 },
};
/* Nothing on the card said where it came from, and coaches hand these to
   parents. Bare domain, no wordmark, no toggle: it is a fact, not a message.
   It costs no height -- it sits inside the line box the opponent headline
   already reserves -- but its width does come out of the headline's budget
   below. Insert it without doing that and the CSS tail ellipsis takes the job
   back off `fitHeadline`, which is the bug `fitHeadline` exists to fix. */
const MARK = 'benchcard.app';
const cardSize = () => CARD_SIZES[state.ui.cardSize] || CARD_SIZES.pocket;
const SAFETY_PX = 10, CHG_RATIO = 0.70;
const contentPx = () => { const c = cardSize(); return (c.w - 2 * c.pad) * 96; };
const stintPx = px => px * 1.12 + px * CHG_RATIO * 1.3;
const bodyHeightPx = () => {
  const c = cardSize();
  return (c.h - 2 * c.pad) * 96 - c.header - SAFETY_PX - (state.ui.showMinutes ? c.footer : 0);
};

/* The half-sheet is height-bound and width-unbound: at 8in wide its width-fit
   ceiling is 44.96px against a `maxName` of 44, so the width does nothing and
   the type is only large because the auto-fit has nowhere else to spend the
   horizontal space. The consequence was absurd -- the big sheet held 9 stints
   against the pocket card's 12, and told the coach to sub less often.

   A second column of stints spends that width. But NOT unconditionally: the
   half-sheet exists to print bigger names, and two columns on a card that
   already fits would shrink an 8-stint sheet from 23.7px to 21.95px, which is
   the "merely wider" card the shape was invented to avoid. So the width is
   only spent when the alternative is a second card. Up to one column's worth
   the half-sheet is exactly what it always was; past it the second column buys
   `maxPer` 9 -> 18, at type still a third larger than the pocket card's. The
   `minName` floor of 20 is untouched -- it never binds below twenty stints. */
const COL_GUTTER = 0.18;   // inches; must match `.stintcols` gap in card.css
const columnPx = cols => (contentPx() - (cols - 1) * COL_GUTTER * 96) / cols;
const perColumn = () => Math.max(1, Math.floor(bodyHeightPx() / stintPx(cardSize().minName)));
const columnsFor = n => Math.max(1, Math.min(cardSize().cols, Math.ceil(n / perColumn())));

// Must match .card's font-family exactly: the auto-fit sizes the card from
// these measurements, so a mismatch silently mis-sizes the print output.
const CARD_FONT = `'InterVar', "Helvetica Neue", Arial, sans-serif`;
function widthAt(text, px) {
  ctx2d.font = `800 ${px}px ${CARD_FONT}`;
  return ctx2d.measureText(text).width;
}
const rowWidth = (names, px) => names.reduce((a, n) => a + widthAt(n, px), 0) + (names.length - 1) * 0.42 * px;

/* `.card-hd .opp` clips with a tail ellipsis, which eats exactly the words that
   tell two games apart -- three tournament cards all printed "VS RIVERSIDE
   REGIONAL TOURNAMENT QUART…". Reuse the tabs' middle elision, but size it by
   measurement rather than a fixed character count: pocket and half-sheet have
   very different header widths, and a card that could show the whole label
   should. Only the string changes -- type size, baseline and the one-line
   header height are untouched, and the CSS ellipsis stays as the backstop. */
const HEAD_LS = 0.02;  // .card-hd .opp letter-spacing, in em
const HEAD_SLACK = 2;  // canvas metrics land a subpixel under the laid-out box
const headWidth = (t, px) => widthAt(t, px) + t.length * HEAD_LS * px + HEAD_SLACK;
function fitHeadline(text, px, avail) {
  if (avail <= 0 || headWidth(text, px) <= avail) return text;
  let n = text.length - 1;
  while (n > 6 && headWidth(elideMiddle(text, n), px) > avail) n--;
  return elideMiddle(text, n);
}
function fitSize(rows, avail, lo, hi) {
  const at100 = Math.max(...rows.map(r => rowWidth(r, 100)));
  return Math.max(lo, Math.min(hi, 100 * avail / at100));
}

// Past a legibility floor the answer is a second card, not smaller type.
function paginate(stints) {
  const maxPer = perColumn() * cardSize().cols;
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

function buildCard(plan, rows, page, pageCount, title, when, minutes = plan.minutes) {
  const sh = labelsFor(plan);
  const size = cardSize();
  const card = el('div', 'card' + (state.ui.cardSize === 'half' ? ' half' : ''));

  const per = [...new Set(rows.map(r => r.period))];
  const scope = pageCount > 1 ? ` Q${per[0]}${per.length > 1 ? '-Q' + per[per.length - 1] : ''}` : '';
  const hd = el('div', 'card-hd');
  const whenTxt = (when || '') + (pageCount > 1 ? `  ${page + 1}/${pageCount}` : '');
  // The scope ("Q1-Q2") and the date are never elided: they are short and they
  // are the other half of "which card am I holding".
  const gap = 0.06 * 96;
  const avail = contentPx() - (whenTxt ? widthAt(whenTxt, size.whenPx) + gap : 0)
    - widthAt(MARK, size.markPx) - gap - headWidth(scope, size.oppPx);
  hd.append(el('span', 'opp', fitHeadline(title, size.oppPx, avail) + scope));
  hd.append(el('span', 'card-mark', MARK));
  hd.append(el('span', 'when', whenTxt));
  card.append(hd);

  /* One column until one column stops fitting -- see `columnsFor`. Every
     measurement below is per column, so a one-column card measures exactly
     what it always did. */
  const cols = columnsFor(rows.length);
  const colPx = columnPx(cols);
  const perCol = Math.ceil(rows.length / cols);
  const widthFit = fitSize(rows.map(r => r.onFloor.map(i => sh[i])), colPx, size.minName, size.maxName);
  const heightFit = bodyHeightPx() / (perCol * stintPx(1));
  const fiveSize = Math.max(size.minName, Math.min(widthFit, heightFit, size.maxName));
  const chgRows = rows.map(r => [`Q1 00:00   ` + (r.out.length ? '▼' + r.out.map(i => sh[i]).join(' ') : 'NO SUBS')]);
  const chgSize = Math.min(fiveSize * CHG_RATIO, fitSize(chgRows, colPx, 8, size.maxName * 0.65));

  const bodies = Array.from({ length: cols }, () => el('div', 'stints'));
  const first = rows[0].index;
  for (const [ri, r] of rows.entries()) {
    const s = el('div', 'stint' + (r.index > first && plan.stints[r.index - 1].period !== r.period ? ' newper' : ''));
    const top = el('div', 'chg');
    top.style.fontSize = chgSize + 'px';
    const newPeriod = r.index === first || plan.stints[r.index - 1].period !== r.period;
    top.append(el('span', 'clk', (newPeriod ? `${r.periodName || 'Q' + r.period} ` : '') + fmtClock(r.startSec)));
    top.append(r.out.length
      ? el('span', 'io', '▼' + r.out.map(i => sh[i]).join(' '))
      : el('span', 'io start', r.index === first ? 'START' : 'NO SUBS'));
    s.append(top);

    const five = el('div', 'five');
    five.style.fontSize = fiveSize + 'px';
    for (const id of r.onFloor) five.append(el('span', 'nm' + (r.in.includes(id) ? ' fresh' : ''), sh[id]));
    s.append(five);
    bodies[Math.floor(ri / perCol)].append(s);
  }
  if (cols > 1) {
    const wrap = el('div', 'stintcols');
    for (const b of bodies) wrap.append(b);
    card.append(wrap);
  } else card.append(bodies[0]);

  if (state.ui.showMinutes) {
    const ft = el('div', 'card-ft');
    ft.textContent = Object.entries(minutes).sort((a, b) => b[1] - a[1])
      .map(([id, m]) => `${sh[id]} ${fmtMinutes(m)}`).join('   ');
    card.append(ft);
  }
  return card;
}

/* The card is laid out at its true print size so screen px map 1:1 to inches;
   an 8in half-sheet is simply wider than a phone. Preview-only `zoom` shrinks
   it to fit the column (print resets it to 1), so the coach sees the whole
   card instead of a slice of one. */
function fitPreview() {
  const sheet = $('#sheet');
  if (!sheet) return;
  const avail = sheet.clientWidth - 32;   // .stage padding, 1rem a side
  const wanted = cardSize().w * 96;
  sheet.style.setProperty('--cardzoom', avail > 0 ? Math.min(1, avail / wanted).toFixed(4) : 1);
}
addEventListener('resize', fitPreview);

export function renderCards() {
  const sheet = $('#sheet'); sheet.textContent = '';
  fitPreview();
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
  set('#regen', 'disabled', blocked);
  set('#regen', 'title', blocked
    ? (noRoster() ? 'Add your roster first. Nothing to shuffle yet'
      : 'Shuffling only changes the seed. Fix the errors above first')
    : '');
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
    const why = live?.issues.find(i => i.severity === 'error');
    const d = el('div', 'stage-empty');
    const si = el('div', 'se-ico');
    si.append(icon('printer', { size: '1.6rem', stroke: 1.6 }));
    d.append(si);
    d.append(el('div', 'se-t', 'No card yet'));
    d.append(el('div', 'se-s', noRoster() ? 'Add your players and the card shows up here.'
      : why ? why.message : 'Set up the game to see the card.'));
    sheet.append(d);
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
      const pages = paginate(stints);
      const many = pages.length > 1 || which.length > 1;
      const title = many ? gameLabel(g, i).toUpperCase()
        : g.label ? 'VS ' + g.label.toUpperCase()
        : (teamName().toUpperCase() || 'ROTATION');
      pages.forEach((rows, pg) => {
        const c = buildCard(p, rows, pg, pages.length, title, g.when, mins);
        // Copies are a print setting. Rendering all of them on screen made the
        // preview two identical cards deep -- ~500px of scroll on a phone
        // saying nothing the first one did not. They stay in the DOM because
        // print pulls the same nodes; screen hides everything past copy 0.
        if (copy > 0) c.classList.add('card-copy');
        sheet.append(c);
      });
      if (copy === 0 && pages.length > 1) {
        notes.push(`${gameLabel(g, i)} needs ${pages.length} cards: ${p.stints.length} stints will not fit one at a readable size. Sub less often for a single card.`);
      }
    }
  }
  if (notes.length) {
    const ic = el('span', 'ico');
    ic.append(icon('info', { size: '1.05em' }));
    note.append(ic, el('span', null, notes.join(' ')));
  }
}

/* The card disclosure. Only meaningful below the two-column breakpoint -- the
   class is harmless above it, where the CSS ignores it entirely, so the state
   survives a rotation from landscape back to portrait instead of being reset
   by a resize handler nobody would think to look for. */
export function renderCardFold() {
  const v = $('#view-games'), b = $('#cardToggle');
  if (!v || !b) return;
  v.classList.toggle('card-shut', !state.ui.cardOpen);
  b.setAttribute('aria-expanded', String(!!state.ui.cardOpen));
}
