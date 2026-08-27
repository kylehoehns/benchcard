/* The first-run tour: four coach-marks, their placement maths and the three
   handlers that drive them. Split out of app.js as its own seam — the
   smallest of them, and the last one before onboarding itself. The banner
   below is the original and still says why the tour works the way it does.

   Everything it touches lives inside `#tour` except `setView`: the tour has
   to be on the games view before it can point at anything, and `setView`
   stays in app.js until `render.js`, so app.js hands it in through
   `initTour` — the same injection as `initTimeline`. `startTour` is exported
   as well, because two callers fire it: onboarding once, and the help sheet
   on request. */
import { $, on, set, el } from './dom.js';
import { openTrap, closeTrap } from './trap.js';
import { state, save } from './state.js';

let setView = () => {};

/* Called once at startup from app.js's wiring block. */
export function initTour(setViewFn) {
  setView = setViewFn;

  on('#tourNext', 'onclick', () => tourGo(tourAt + 1));
  on('#tourSkip', 'onclick', endTour);
  // a tap anywhere on the scrim advances, including on the spotlit control
  // itself -- the likeliest mis-tap, and the one where "nothing happened" would
  // be the worst answer
  on('#tour', 'onclick', e => { if (!$('#tourBox').contains(e.target)) tourGo(tourAt + 1); });
}

/* ================================================================== *
 * first-run tour
 *
 * Four coach-marks, straight after onboarding, once per device. A spotlight
 * over the real screen rather than a modal with pictures of it: the coach is
 * looking at their own roster in their own rotation while it is explained,
 * which is the only version of this that survives being read once.
 *
 * A step names a fallback anchor wherever the primary one can be off screen
 * -- the action bar is phone-only, so on a desktop window the last step
 * points at the same button beside the card instead. Step 3 is the exception
 * and always was: `#timeline` is never conditional. (The banner used to claim
 * every step had two, and step 2 had one until A21 gave it `#planFold`.)
 * A step whose anchors are all missing still shows its copy, centred, rather
 * than silently dropping a quarter of the explanation.
 *
 * What a fallback does NOT cover: an anchor inside a shut `<details>`. Chrome
 * reports client rects for those, so `tourAnchor` accepts one and the ring
 * lands on a control the coach cannot see. Any step anchored inside a fold
 * opens it in `before` -- pinned by `test/tour-anchors.test.js`.
 * ================================================================== */
const TOUR = [
  {
    sel: ['#squadFold', '#avail'],
    title: 'Who is here tonight',
    body: 'Everyone on the roster starts in. Pick a player to sit them out for a no-show or foul trouble, and the rotation rebuilds around who is left.',
    before: () => { const f = $('#squadFold'); if (f) f.open = true; },
  },
  {
    /* `#planFold` shuts on first paint for anyone not on Balanced, and a
       spotlight on a control inside a shut fold is either centred copy or a
       ring around nothing. Open it first, exactly as step 1 does for the
       squad, and name the fold itself as the fallback anchor so this step
       has two like every other one. */
    sel: ['#stratseg', '#planFold'],
    before: () => { const f = $('#planFold'); if (f) f.open = true; },
    title: 'How the minutes get shared',
    lines: [
      ['Balanced', 'as close to equal as the clock allows.'],
      ['Minutes', 'you set each player’s total by hand.'],
      ['Closers', 'even early, then a group you pick finishes.'],
      ['Platoon', 'fixed fives that swap as whole units.'],
    ],
  },
  {
    sel: ['#timeline'],
    title: 'This is the rotation',
    body: 'One row per player, the game clock running left to right. Open a row to see that player’s minutes, stints and rest.',
  },
  {
    sel: ['#abBench', '#gmOpen'],
    title: 'What you use in the gym',
    body: 'Bench mode is the big-button sideline view: who is on, who is next, one tap to move the game along. The card prints the same plan for your pocket.',
  },
];

let tourAt = -1;

const tourEl = () => $('#tour');
const tourAnchor = s => {
  for (const q of s.sel) { const n = $(q); if (n && n.getClientRects().length) return n; }
  return null;
};

/* Whether scrolling to this anchor would do anything. The action bar is
   `position: fixed`, so scrolling to it walks the page to the top and
   leaves the button exactly where it was; the fallback beside the card is a
   normal in-flow button that genuinely needs scrolling to. Asking the anchor
   rather than hard-coding a per-step flag is what makes the fallback work --
   the first version carried `noScroll` on the step and left the desktop
   spotlight clamped to a zero-height sliver below the fold. */
const tourFixed = n => {
  for (let e = n; e && e !== document.body; e = e.parentElement) {
    if (getComputedStyle(e).position === 'fixed') return true;
  }
  return false;
};

/* What the overlay is drawn against. `.tour` is `position: fixed` under a
   `viewport-fit=cover` meta, so it spans the whole screen -- but `innerHeight`
   on iOS reports the *visual* viewport, which shrinks and grows as Safari's
   toolbars collapse on scroll. Measuring the ring against one box while
   painting the scrim over another is what made the tour look like it zoomed
   the page: every step re-measured against a viewport that had just changed
   size underneath it. `visualViewport` is the box the coach can actually see,
   and its offsets are non-zero while a pinch-zoom is in effect, so the ring
   keeps tracing the control instead of sliding off it. */
const tourViewport = () => {
  const v = typeof visualViewport !== 'undefined' && visualViewport;
  return v
    ? { w: v.width, h: v.height, ox: v.offsetLeft, oy: v.offsetTop }
    : { w: innerWidth, h: innerHeight, ox: 0, oy: 0 };
};

/* Measured, never transitioned -- see the note on `.tour-hole`. Called on
   every scroll and resize while the tour is up, so it must stay cheap: two
   getBoundingClientRects and a handful of style writes. */
function placeTour() {
  const wrap = tourEl();
  if (!wrap || wrap.hidden) return;
  const s = TOUR[tourAt];
  if (!s) return;
  const hole = $('#tourHole'), box = $('#tourBox');
  const vp = tourViewport();
  const vw = vp.w, vh = vp.h;
  const gap = 12, pad = 8, edge = 10;
  const n = tourAnchor(s);
  let r = n ? n.getBoundingClientRect() : null;
  if (r && (r.width < 2 || r.height < 2)) r = null;

  // clamp into the viewport: an anchor taller than the screen (the timeline
  // with a full roster) would otherwise push the ring off both ends
  let top = Math.max(edge, (r?.top ?? 0) - pad);
  let bottom = Math.min(vh - edge, (r?.bottom ?? 0) + pad);
  const left = Math.max(edge, (r?.left ?? 0) - pad);
  const right = Math.min(vw - edge, (r?.right ?? 0) + pad);

  /* A ring around the whole screen highlights nothing, and it leaves the copy
     nowhere to sit but on top of the thing it is describing -- which is what
     step 3 did with a full roster, where the timeline is 678px of an 844px
     phone. Past this height the ring traces the leading edge of the anchor
     instead: enough rows to show what is being talked about, and the rest of
     the screen kept free for the card. Scrolling the anchor to `start` rather
     than `center` (see tourGo) is what makes that top slice the part the coach
     is already looking at. */
  const CAP = Math.round(vh * 0.52);
  if (r && bottom - top > CAP) bottom = top + CAP;

  // an anchor that clamps away to nothing is off screen, not spotlightable
  if (right - left < 2 || bottom - top < 2) r = null;

  if (r) {
    hole.hidden = false;
    hole.style.top = `${top + vp.oy}px`;
    hole.style.left = `${left + vp.ox}px`;
    hole.style.width = `${Math.max(0, right - left)}px`;
    hole.style.height = `${Math.max(0, bottom - top)}px`;
    // put the card in whichever side of the cutout has more room, and never
    // let it cover the cutout: overlapping the spotlight is strictly worse
    // than sitting slightly off-centre from it
    const bh = box.offsetHeight;
    const below = vh - bottom - gap - edge, above = top - gap - edge;
    const boxTop = below >= bh || below >= above ? bottom + gap : top - gap - bh;
    const lo = edge, hi = Math.max(edge, vh - edge - bh);
    box.style.top = `${Math.max(lo, Math.min(hi, boxTop)) + vp.oy}px`;
    const cx = (left + right) / 2 - box.offsetWidth / 2;
    box.style.left = `${Math.max(edge, Math.min(vw - edge - box.offsetWidth, cx)) + vp.ox}px`;
  } else {
    hole.hidden = true;
    box.style.top = `${Math.max(edge, (vh - box.offsetHeight) / 2) + vp.oy}px`;
    box.style.left = `${Math.max(edge, (vw - box.offsetWidth) / 2) + vp.ox}px`;
  }
}

function tourGo(i) {
  if (i >= TOUR.length) { endTour(); return; }
  tourAt = i;
  const s = TOUR[i];
  s.before?.();
  set('#tourStep', 'textContent', `Step ${i + 1} of ${TOUR.length}`);
  set('#tourTitle', 'textContent', s.title);
  const bd = $('#tourBody');
  bd.textContent = '';
  if (s.lines) {
    for (const [lab, txt] of s.lines) {
      const row = el('span', 'tour-l');
      row.append(el('b', '', lab), ': ' + txt);
      bd.append(row);
    }
  } else bd.append(el('p', '', s.body));
  const dots = $('#tourDots');
  dots.textContent = '';
  for (let k = 0; k < TOUR.length; k++) dots.append(el('i', k === i ? 'on' : ''));
  set('#tourNext', 'textContent', i === TOUR.length - 1 ? 'Got it' : 'Next');
  set('#tourSkip', 'hidden', i === TOUR.length - 1);
  const n = tourAnchor(s);
  /* Y only, by hand, and never `scrollIntoView`: its `inline` defaults to
     'nearest', which scrolls the document *sideways* the moment an anchor does
     not fit across -- a wider text size, a longer label, a 320px phone. The
     page then sits 25-35px to the left for the rest of the tour, the section
     labels lose their first letters and the leftmost chips are sliced, while
     the ring is drawn correctly against a viewport in the wrong place. Nothing
     the tour does may move X.

     Instant, not smooth: the hole is placed from the rect two lines below, and
     a smooth scroll would have it measure a position the page is still
     travelling towards. */
  if (n && !tourFixed(n)) {
    const vh = tourViewport().h;
    const r = n.getBoundingClientRect();
    // Centring an anchor taller than the ring can be leaves the spotlit slice
    // straddling the middle of the screen with the card nowhere to go. Park a
    // tall anchor's top near the top instead -- clear of the sticky bar, and
    // leaving the bottom third free for the copy. Everything else centres,
    // which is what `block: 'center'` used to buy.
    const y = r.height > vh * 0.52 ? r.top - vh * 0.15 : r.top - (vh - r.height) / 2;
    scrollTo({ top: Math.max(0, scrollY + y), behavior: 'auto' });
  }
  placeTour();
  /* And once more when the page has stopped moving. A step whose `before`
     opens a fold measures its anchor mid-`rise` — the 8px translate is still
     on it — so the ring lands 8px low and stays there for the whole step,
     with the control sitting on its edge instead of inside it. Measured at
     390px on step 2 with Plan shut: hole top 394 against an anchor that
     settled at 387. `rise` is --t (260ms). Idempotent for every other step:
     nothing has moved, so the second placement writes the same numbers. */
  setTimeout(placeTour, 320);
}

export function startTour() {
  const wrap = tourEl();
  if (!wrap || !wrap.hidden || !state.onboarded) return;
  // three of the four anchors live in the games view. Re-run from Help while
  // the roster is showing and they are all `hidden`, so every step would fall
  // back to centred copy with nothing spotlit.
  // `instant`: the tour measures anchor rects immediately, and its scrim would
  // spend the transition underneath the snapshot overlay
  if (state.view !== 'games') setView('games', true);
  wrap.hidden = false;
  // capture: the page still scrolls under the scrim (tourGo scrolls it), and
  // a scroll that does not move the cutout with it reads as a broken overlay
  document.addEventListener('scroll', placeTour, true);
  addEventListener('resize', placeTour);
  // iOS fires neither of the above when the toolbars collapse or a pinch-zoom
  // pans -- only the visual viewport knows, and it is the box the ring is
  // measured against
  visualViewport?.addEventListener('resize', placeTour);
  visualViewport?.addEventListener('scroll', placeTour);
  tourGo(0);
  openTrap(wrap, endTour, document.activeElement);
}

function endTour() {
  const wrap = tourEl();
  if (!wrap || wrap.hidden) return;
  wrap.hidden = true;
  tourAt = -1;
  document.removeEventListener('scroll', placeTour, true);
  removeEventListener('resize', placeTour);
  visualViewport?.removeEventListener('resize', placeTour);
  visualViewport?.removeEventListener('scroll', placeTour);
  state.tourSeen = true;
  save();
  closeTrap(wrap);
}
