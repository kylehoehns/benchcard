/* #132's own guard (docs/specs/132-phone-gutter.md, "What would settle it"
 * items 1, 2 and 6): the phone `.wrap` gutter, and the two floating-chrome
 * classes it drags along (`.actionbar`, `.toasts`), actually paint 16px from
 * each edge on every screen the ticket names -- 32px at a 32px root -- not
 * the 11.2px (22.4px) the old `.7rem` phone rule gave every one of them.
 *
 * #145 item 9 extends this rather than opening a new check (its own Proof
 * row names either): `#view-welcome`, the landing before first run, gets the
 * same 16px-gutter claim at every TOUCH_WIDTHS phone (all <= the item's own
 * 600px ceiling) -- see `measureWelcome`, below.
 *
 * "Left" and "right" are measured exactly as the spec's own "What would
 * settle it" table defines them: `rect.left`, and `innerWidth - rect.right`.
 * Both come from a live `getBoundingClientRect()` read in the page, never
 * from the stylesheet -- a floor set in CSS has to be proven by the box the
 * browser actually painted. */
import { evalIn, step, TODAY_HOME, WIDTH, HEIGHT, landWiped, navigateAndWaitForCard, toGameOne } from './dom.mjs';
import { TOUCH_WIDTHS, LARGE_TEXT_WIDTH, LARGE_TEXT_PX } from './sizes.mjs';
import { RICH, partPlayed, reloadWithRecord } from './fixtures.mjs';

const TOL = 1;

/* Item 1's five screens, each named by its own JS expression rather than a
 * bare CSS selector -- `#view-settings` holds several `.pgrp` groups now
 * (#142 moved it onto the app's shared grammar), so "first" and "last" are
 * taken by array position, not by a `:first-of-type`/`:last-of-type`
 * pseudo-class that would silently pick the wrong element (or none) the
 * moment an unrelated `<div>` sits ahead of them in source order.
 *
 * Every state runs `TODAY_HOME` as its OWN `step()` call, awaited
 * before the click that follows it, rather than one script chaining both:
 * `setView('today')` applies its repaint synchronously but raises the actual
 * `history.back()` a moment later, and firing the next view's `click()` in
 * the same tick as that pending traversal races it -- a `pushState` landing
 * before the browser's own `back()` resolves can walk it past this
 * document's own history entries into the PREVIOUS real navigation (`goRich`
 * is itself a second `Page.navigate`, so there is one to walk into), which
 * is a genuine page reload, not a same-document `popstate`, and kills the
 * CDP execution context this whole pass is running in ("Inspected target
 * navigated or closed"). Two `step()` calls, not one, so `SETTLE`'s own
 * `requestAnimationFrame` pair gives the pending `popstate` a turn first --
 * exactly the gap a real, unhurried tap always has. */
const GUTTER_STATES = [
  { name: 'games',
    click: `document.querySelector('.today-game').click()`,
    sels: [
      ['dayhead', `document.querySelector('#view-games .dayhead')`],
      ['sentence', `document.querySelector('#sentence')`],
      ['cols', `document.querySelector('#view-games .cols')`],
    ] },
  { name: 'today', click: null,
    sels: [
      ['h1', `document.querySelector('.today-h1')`],
      ['game', `document.querySelectorAll('#todayGames .today-game')[0]`],
      ['team', `document.querySelector('#todayTeam')`],
      ['season', `document.querySelector('#todaySeason')`],
    ] },
  { name: 'team',
    click: `document.querySelector('#todayTeam').click()`,
    sels: [
      ['dayhead', `document.querySelector('#view-team .dayhead')`],
      ['roster', `document.querySelector('#rosterlist')`],
    ] },
  { name: 'season',
    click: `document.querySelector('#todaySeason').click()`,
    sels: [
      ['dayhead', `document.querySelector('#view-season .dayhead')`],
      ['box', `document.querySelector('#seasonbox')`],
    ] },
  { name: 'settings',
    click: `document.querySelector('#settingsBtn').click()`,
    sels: [
      ['first', `document.querySelectorAll('#view-settings .pgrp')[0]`],
      ['last', `(els => els[els.length - 1])(document.querySelectorAll('#view-settings .pgrp'))`],
    ] },
];

// The one "left, right from a live rect" formula both scripts below need --
// a single element's `getBoundingClientRect()` turned into the pair the
// spec's own "What would settle it" table names, or null if the element
// isn't there to measure.
const edgeExpr = get => `(() => { const el = ${get}; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: window.innerWidth - r.right };
  })()`;

const rectsScript = entries => `JSON.stringify(Object.fromEntries([
  ${entries.map(([k, get]) => `['${k}', ${edgeExpr(get)}]`).join(',\n  ')}
]))`;

function checkEdges(r, want, where) {
  const bad = [];
  if (!r) { bad.push(`${where}: not in the document`); return bad; }
  if (Math.abs(r.left - want) > TOL) bad.push(`${where}: left ${r.left.toFixed(1)}px, want ${want}px`);
  if (Math.abs(r.right - want) > TOL) bad.push(`${where}: right ${r.right.toFixed(1)}px, want ${want}px`);
  return bad;
}

// Items 1 and 2 (restated at the large-text cell by the caller): every state
// in GUTTER_STATES, at whatever viewport is already set.
async function measureScreens(c, want, label) {
  const bad = [];
  let audited = 0;
  for (const st of GUTTER_STATES) {
    await evalIn(c, step(TODAY_HOME));
    if (st.click) await evalIn(c, step(st.click));
    const rects = JSON.parse(await evalIn(c, rectsScript(st.sels)));
    for (const [key] of st.sels) {
      const r = rects[key];
      const where = `${st.name} ${key}@${label}`;
      bad.push(...checkEdges(r, want, where));
      if (r) audited += 2;
    }
  }
  return { bad, audited };
}

const buttonRect = sel => `JSON.stringify(${edgeExpr(`document.querySelector('${sel}')`)})`;

// One button, swept across TOUCH_WIDTHS -- the sweep both #abBench and
// #resumeBtn need below, identical but for which selector and which state
// put the button on screen first.
async function sweepButton(c, sel) {
  const bad = [];
  let audited = 0;
  for (const w of TOUCH_WIDTHS) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await evalIn(c, `new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))`);
    const r = JSON.parse(await evalIn(c, buttonRect(sel)));
    bad.push(...checkEdges(r, 16, `${sel}@${w}px`));
    if (r) audited += 2;
  }
  return { bad, audited };
}

// Item 6: #abBench (the floating bar, up on the games screen every RICH load
// lands on) and #resumeBtn (the resume bar, which only ever shows on Today
// with a part-played game -- `partPlayed(RICH)`, decision 14's own fixture,
// same as resume-bar.mjs).
async function measureButtons(c, origin) {
  await toGameOne(c);
  const ab = await sweepButton(c, '#abBench');

  const rec = partPlayed(RICH);
  rec.view = 'today';
  await reloadWithRecord(c, origin, rec);
  const resume = await sweepButton(c, '#resumeBtn');

  return { bad: [...ab.bad, ...resume.bad], audited: ab.audited + resume.audited };
}

// The large-text cell: item 2's five screens at 32px, plus item 6's own claim
// that #abBench stays at 16px there (the `.5rem` ≤19em `.actionbar` override
// winning over the base rule's `1rem`). A font size cannot be re-applied
// without a fresh navigation (same trap `app-large-text.mjs` documents), so
// this reloads once rather than trying to reflow the live document.
async function measureLargeText(c, origin) {
  const bad = [];
  let audited = 0;
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await navigateAndWaitForCard(c, origin + '/index.html');

    const label = `${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
    const cell = await measureScreens(c, LARGE_TEXT_PX, label);
    bad.push(...cell.bad); audited += cell.audited;

    await toGameOne(c);
    const r = JSON.parse(await evalIn(c, buttonRect('#abBench')));
    bad.push(...checkEdges(r, 16, `#abBench@${label}`));
    if (r) audited += 2;
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
  }
  return { bad, audited };
}

// #145 item 9: the landing before first run, wiped so it always shows --
// same `landWiped` idiom `flow-inset.mjs` uses for the same reason, at every
// TOUCH_WIDTHS phone (all <= 600, the spec's own ceiling for this item).
const WELCOME_READY = `!document.getElementById('view-welcome').hidden`;

async function measureWelcome(c, origin) {
  const bad = [];
  let audited = 0;
  for (const w of TOUCH_WIDTHS) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await landWiped(c, `${origin}/index.html`, WELCOME_READY);
    // `#view-welcome` itself spans the full viewport -- `.wel-in`, the child
    // `.welcome`'s own padding insets, is what actually sits at the gutter.
    const r = JSON.parse(await evalIn(c, `JSON.stringify(${edgeExpr(`document.querySelector('#view-welcome .wel-in')`)})`));
    bad.push(...checkEdges(r, 16, `#view-welcome .wel-in@${w}px`));
    if (r) audited += 2;
  }
  return { bad, audited };
}

export async function phoneGutterPass(c, origin) {
  const bad = [];
  let audited = 0;
  try {
    for (const w of TOUCH_WIDTHS) {
      await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
      const r = await measureScreens(c, 16, `${w}px`);
      bad.push(...r.bad); audited += r.audited;
    }

    const btns = await measureButtons(c, origin);
    bad.push(...btns.bad); audited += btns.audited;

    const large = await measureLargeText(c, origin);
    bad.push(...large.bad); audited += large.audited;

    const welcome = await measureWelcome(c, origin);
    bad.push(...welcome.bad); audited += welcome.audited;
  } finally {
    // Leave the fixture exactly as `goRich` (setup) left it, for whatever
    // runs next in a full run -- the same courtesy `darkInputBgPass` and
    // `teamScreenPass` pay their own next row.
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await reloadWithRecord(c, origin, RICH);
  }

  return {
    pass: bad.length === 0,
    detail: bad.length
      ? `${bad.length}/${audited} measurement(s) off the gutter: ${bad.slice(0, 4).join(' | ')}`
      : `${audited} measurements (5 screens + #abBench/#resumeBtn + #view-welcome, ${TOUCH_WIDTHS.join('/')}px, `
        + `plus 5 screens + #abBench at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px), all left = right = the .wrap gutter`,
  };
}
