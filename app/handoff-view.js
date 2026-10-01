/* handoff-view.js -- #250, #257: the Hand off pane of the share sheet. It
   builds the link with `encode` (handoff.js), draws it as a QR code and offers
   it to Share. The encoder that draws the code is fetched when Hand off is
   picked, not at boot, so first paint does not carry it. This module is
   fetched on the first tap of Hand off (app.js), so a cold load does not carry
   it either. The link is handed out exactly as it is drawn: one URL, built
   once per opening. */
import { $, on } from './dom.js';
import { state, team, game, plans, effectiveStints } from './state.js';
import { flash } from './toast.js';
import { encode, leavingNames } from './handoff.js';

const NS = 'http://www.w3.org/2000/svg';
let link = '';
let opening = 0;

/* The grid as one path: a 1 x 1 square per dark module, so a test can read
   the same matrix back. Light square behind it, whatever the theme. */
function drawQr(grid) {
  const n = grid.length;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', n); bg.setAttribute('height', n); bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('fill', '#000');
  path.setAttribute('d', grid.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : []))).join(''));
  svg.append(bg, path);
  $('#handoffQr').replaceChildren(svg);
}

/* A render that finished after the coach left: a newer opening, or the pane
   put away by picking Print card. */
const stale = mine => mine !== opening || $('#handoffPane').hidden;

let wired = false;

export async function openHandoff() {
  if (!wired) { wired = true; wire(); }
  const mine = ++opening;
  const g = game();
  const p = plans[state.activeGame];
  link = '';
  $('#handoffShare').disabled = true;
  $('#handoffQr').replaceChildren();
  $('#handoffStatus').textContent = '';
  $('#handoffNames').replaceChildren(...leavingNames(team().players).map(name => {
    const li = document.createElement('li');
    li.textContent = name;
    return li;
  }));
  $('#handoffShareLabel').textContent = navigator.share ? 'Share link' : 'Copy link';
  if (!g || !p?.ok) {
    $('#handoffStatus').textContent = 'There is no card to hand off yet. Fix the plan first.';
    return;
  }

  const hash = await encode(team(), g, effectiveStints(g, p).map(s => s.onFloor));
  if (stale(mine)) return;
  link = location.origin + location.pathname + hash;
  $('#handoffShare').disabled = false;
  try {
    const { encode: qr } = await import('./vendor/uqr.mjs');
    if (!stale(mine)) drawQr(qr(link).data);
  } catch {
    if (!stale(mine)) $('#handoffStatus').textContent = 'The code could not be drawn. The link still works.';
  }
}

async function shareLink() {
  if (!link) return;
  if (navigator.share) {
    try { await navigator.share({ title: 'Benchcard game', url: link }); }
    catch { /* dismissed the share sheet */ }
    return;
  }
  try { await navigator.clipboard.writeText(link); flash('Link copied.'); }
  catch { $('#handoffStatus').textContent = 'Could not copy the link.'; }
}

function wire() {
  on('#handoffShare', 'onclick', shareLink);
}
