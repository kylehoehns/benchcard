/* #145 item 1's own guard (docs/specs/145-flow-spacing.md, Proof row 1): every
 * visible box or run of text inside `.flow-body`, on every step of both
 * flows, sits no closer than 16px to either edge -- the one shared inset
 * rule the spec asks for, proved from the painted geometry rather than from
 * which CSS rule produced it.
 *
 * `#agBody`/`#frBody` (`ids.body` in `paintFlowShell`, trap.js) hold exactly
 * one child each -- the plain `<div>` `flowStepBody` builds and returns. That
 * div carries no border, background or text of its own; it is glue, not a
 * box the spec's own sentence is a claim about, so it is the one element
 * this probe excludes by reference. Every element under IT is a real
 * question: `checkVisibility` and the zero-size skip are the same two the
 * other overflow probes in `dom.mjs` already use, so a decorative or
 * `display: none` node cannot register a false positive.
 *
 * Two widths (390, 320), both flows, every step the spec names -- including
 * add a game step 1 with the "Same as" card showing (the rich fixture's
 * second game makes that the default) and step 2 with no players (a
 * temporary, restored roster wipe, since nothing else in the fixture set
 * reaches that state). First run's step 3 is a one-way door (`commitFirstRun`
 * runs on step 2's own Next), so it gets its own fresh wiped landing per
 * width, the same shape `first-run-flow.mjs` already uses for its own
 * step-3 card-fit measurement. */
import { evalIn, landWiped, setWidth } from './dom.mjs';
import { goRich } from './fixtures.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';
import { evalJSON, openAddGameFlow, realTap, typeIn, waitClosed } from './sheet-drive.mjs';

const TOL = 1;
const WIDTHS = [390, 320];

// The probe itself: every visible descendant of `bodyId`, except the one
// wrapper `flowStepBody` returns as the body's only child (see header
// comment), checked against [16, width-16].
const insetProbe = (bodyId, width) => `(() => {
  const body = document.getElementById(${JSON.stringify(bodyId)});
  if (!body) return JSON.stringify({ found: false });
  const wrap = body.firstElementChild;
  const bad = [];
  let audited = 0;
  for (const el of body.querySelectorAll('*')) {
    if (el === wrap) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (!el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) continue;
    audited++;
    const left = Math.round(r.left), right = Math.round(r.right);
    const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + ((el.className && typeof el.className === 'string')
        ? '.' + el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.') : '');
    if (left < 16 - ${TOL}) bad.push({ el: name, left, right, side: 'left' });
    else if (right > ${width} - 16 + ${TOL}) bad.push({ el: name, left, right, side: 'right' });
  }
  return JSON.stringify({ found: true, audited, bad: bad.slice(0, 4) });
})()`;

async function measureInset(c, bodyId, width, label, ck) {
  const r = JSON.parse(await evalIn(c, insetProbe(bodyId, width)));
  if (!ck(r.found, `#${bodyId} is not in the document at ${label}`)) return;
  ck(r.audited > 0, `#${bodyId} has nothing visible to measure at ${label} (the probe measured 0 elements)`);
  ck(r.bad.length === 0, `${label}: ${r.bad.length} box(es) closer than 16px to an edge: `
    + r.bad.map(b => `${b.el} (${b.side} at ${b.side === 'left' ? b.left : b.right}px)`).join(', '));
}

const wipeRoster = `(async () => {
  const s = await import('/state.js');
  window.__insetSavedPlayers = s.state.players;
  s.state.players = [];
  (await import('/render.js')).renderAll();
})()`;

const restoreRoster = `(async () => {
  const s = await import('/state.js');
  s.state.players = window.__insetSavedPlayers;
  delete window.__insetSavedPlayers;
  (await import('/render.js')).renderAll();
})()`;

async function addGameSweep(c, ck) {
  for (const width of WIDTHS) {
    await setWidth(c, width);

    await openAddGameFlow(c);
    await measureInset(c, 'agBody', width, `add a game step 1 (with the "Same as" card)@${width}px`, ck);
    await realTap(c, '#agNext');
    await measureInset(c, 'agBody', width, `add a game step 2@${width}px`, ck);
    await realTap(c, '#agNext');
    await measureInset(c, 'agBody', width, `add a game step 3@${width}px`, ck);
    await realTap(c, '#agClose'); // nothing typed on this walk -- closes at once
    await waitClosed(c, '#addGameFlow');

    await evalIn(c, wipeRoster);
    await openAddGameFlow(c);
    await realTap(c, '#agNext');
    await measureInset(c, 'agBody', width, `add a game step 2, no players@${width}px`, ck);
    await realTap(c, '#agClose');
    await waitClosed(c, '#addGameFlow');
    await evalIn(c, restoreRoster);
  }
  await setWidth(c, 390);
}

const READY = `!document.getElementById('view-welcome').hidden`;
const land = (c, origin) => landWiped(c, `${origin}/index.html`, READY);
const SAMPLE_ROSTER = '12 Maya Webb\n4 Eli Tran\nDevon Ellis\n3 Nia Bell\n15 Caleb Ruiz';

// At 320px with a 32px root a button can break the inset two ways the sweep
// above misses: its box sits past 16px, or its label is wider than the box
// (`scrollWidth` > `clientWidth`) while the box itself stays inside.
const largeTextButtonProbe = ids => `(() => {
  const out = {};
  for (const id of ${JSON.stringify(ids)}) {
    const el = document.getElementById(id);
    if (!el) { out[id] = { found: false }; continue; }
    const r = el.getBoundingClientRect();
    out[id] = { found: true, left: Math.round(r.left), right: Math.round(r.right),
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  }
  return JSON.stringify(out);
})()`;

async function measureLargeTextButtons(c, ids, label, ck) {
  const out = JSON.parse(await evalIn(c, largeTextButtonProbe(ids)));
  for (const id of ids) {
    const m = out[id];
    if (!ck(m && m.found, `#${id} is not in the document at ${label}`)) continue;
    ck(m.scrollWidth <= m.clientWidth + TOL,
      `#${id} at ${label}: content is ${m.scrollWidth}px wide, its own box is only ${m.clientWidth}px `
      + '(content runs past its own border box)');
    ck(m.left >= 16 - TOL, `#${id} at ${label}: left edge at ${m.left}px, want >= 16`);
    ck(m.right <= LARGE_TEXT_WIDTH - 16 + TOL,
      `#${id} at ${label}: right edge at ${m.right}px, want <= ${LARGE_TEXT_WIDTH - 16}`);
  }
}

// A font size needs a reload (`app-large-text.mjs`), so this lands on its
// own and puts the size back after.
async function firstRunLargeTextButtons(c, ck, origin) {
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await setWidth(c, LARGE_TEXT_WIDTH);
    await land(c, origin);
    await realTap(c, '#welStart');
    await measureLargeTextButtons(c, ['frFill'],
      `first run step 1@${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, ck);
    await typeIn(c, '#frRoster', SAMPLE_ROSTER);
    await realTap(c, '#frNext');
    await realTap(c, '#frNext'); // commits the team for real -- lands on step 3
    await measureLargeTextButtons(c, ['frPrint', 'frShare'],
      `first run step 3@${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`, ck);
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
  }
}

async function firstRunSweep(c, ck, origin) {
  // Steps 1 and 2: not a one-way door yet, so both widths can share the
  // ordinary loop the way `addGameSweep` above does.
  for (const width of WIDTHS) {
    await setWidth(c, width);
    await land(c, origin);
    await realTap(c, '#welStart');
    await measureInset(c, 'frBody', width, `first run step 1@${width}px`, ck);
    await typeIn(c, '#frRoster', SAMPLE_ROSTER);
    await realTap(c, '#frNext');
    await measureInset(c, 'frBody', width, `first run step 2@${width}px`, ck);
  }
  // Step 3 commits for real on THIS Next -- a fresh wiped landing per width,
  // the same shape `first-run-flow.mjs`'s own `stepThreeShowsACard` uses.
  for (const width of WIDTHS) {
    await setWidth(c, width);
    await land(c, origin);
    await realTap(c, '#welStart');
    await typeIn(c, '#frRoster', SAMPLE_ROSTER);
    await realTap(c, '#frNext');
    await realTap(c, '#frNext');
    await measureInset(c, 'frBody', width, `first run step 3@${width}px`, ck);
  }
  await setWidth(c, 390);
}

export async function flowInsetPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    await addGameSweep(c, ck);
    await firstRunSweep(c, ck, origin);
    await firstRunLargeTextButtons(c, ck, origin);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  await setWidth(c, 390).catch(() => {});
  await goRich(c, origin).catch(() => {});

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'every step of both flows, at 390px and 320px, keeps a 16px inset on every side',
  };
}
