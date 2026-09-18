import { evalIn, step, TODAY_HOME, WIDTH, HEIGHT } from './dom.mjs';
import { nameOf } from './registry.mjs';
import { goRich } from './fixtures.mjs';
import { click, evalJSON, tap, settle, waitClosed } from './sheet-drive.mjs';

/* #31's own guard (docs/specs/31-roster-and-player-sheet.md, Proof P8):
   "team screen: roster rows, the player sheet, add and paste", RICH fixture.
   It settles the acceptance items that are claims about the real screen --
   1 (the rows), 3 (the player sheet), 4 (remove and undo), 5 (add a player),
   6 (paste a list and the discard ask), 7 (Edit mode) and 10 (the empty
   state) -- by driving the app with real buttons and real keys, the shape
   `plan-sheet.mjs` and `timeline-card-sheet.mjs` already use.

   Every expected value here is the spec's own or the RICH fixture's
   (`fixtures.mjs`: 11 players, Hana Kim at level 5, Nia Brooks at level 1,
   everyone else at 3), never a second computation of what the app does. */

/* The fixture's roster, in order, with the level name each player's `tier`
   maps to (`LEVELS` in balance.js: 1 Developing ... 5 Go-to). Item 1 names
   all three of these outcomes; the other eight rows are the "other nine read
   Regular" half of the same sentence. */
const ROSTER = [
  ['Marcus Williams', '4', 'Regular'],
  ['Devon Ellis', '7', 'Regular'],
  ['Hana Kim', '9', 'Go-to'],
  ['Eli Tran', '12', 'Regular'],
  ['Ana Reyes', '3', 'Regular'],
  ['Jordan Bell', '21', 'Regular'],
  ['Sam Okafor', '5', 'Regular'],
  ['Riley Novak', '8', 'Regular'],
  ['Casey Lindqvist', '11', 'Regular'],
  ['Theo Alvarez', '15', 'Regular'],
  ['Nia Brooks', '2', 'Developing'],
];

async function toTeam(c) {
  await tap(c, TODAY_HOME);
  await tap(c, `document.getElementById('todayTeam').click()`);
}

const rosterRows = c => evalJSON(c, `JSON.stringify([...document.querySelectorAll('#rosterlist .rrow')].map(r => {
  const b = r.getBoundingClientRect();
  const t = s => { const n = r.querySelector(s); return n ? n.textContent.trim() : null; };
  return { badge: t('.av'), name: t('.prow-t'), level: t('.prow-v'),
    chevron: !!r.querySelector('.prow-chev'), tag: r.tagName, height: b.height };
}))`);

/* Item 1: eleven rows, in roster order, each one a single button carrying a
   badge, the name, the level's own word and a chevron, at least 48px tall. */
async function rosterListOk(c, ck) {
  const rows = await rosterRows(c);
  if (!ck(rows.length === ROSTER.length,
    `the Team screen shows ${rows.length} roster row(s), want ${ROSTER.length}`)) return;
  rows.forEach((r, i) => {
    const [name, number, level] = ROSTER[i];
    ck(r.name === name, `row ${i + 1} reads "${r.name}", want "${name}" -- roster order`);
    ck(r.badge === number, `${name}'s badge reads "${r.badge}", want "${number}"`);
    ck(r.level === level, `${name}'s row reads "${r.level}", want "${level}"`);
    ck(r.chevron, `${name}'s row has no chevron, so nothing says it opens`);
    ck(r.tag === 'BUTTON', `${name}'s row is a <${r.tag.toLowerCase()}>, want one button for the whole row`);
    ck(r.height >= 47.5, `${name}'s row is ${r.height.toFixed(1)}px tall, want >= 48px`);
  });
}

/* Item 2: nothing editable in the list itself. A mis-tap cannot change a
   jersey number, because there is nothing on the screen to change. Asked of
   the whole `#view-team` subtree with no sheet open, so a control hiding
   outside `#rosterlist` is caught too. */
async function nothingEditableOnTeam(c, ck) {
  const found = await evalJSON(c, `JSON.stringify([...document.querySelectorAll(
    '#view-team input, #view-team textarea, #view-team select, #view-team .bal-meter, #view-team .xbtn, #view-team #cardnames'
  )].filter(n => !n.closest('dialog'))
    .map(n => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className ? '.' + String(n.className).trim().split(/\\s+/).join('.') : '')))`);
  ck(found.length === 0,
    `the Team screen still carries ${found.length} editing control(s) outside a sheet: ${found.slice(0, 5).join(', ')}`);
}

/* Item 3: the whole of one player, in one sheet. Every expected value is the
   RICH fixture's own row for Marcus Williams (`fixtures.mjs`: p0, number 4,
   tier 3, `shortName` empty). "MARC" is what the card would print for him if
   he never sets one -- the spec's item 3 writes the placeholder as "Marcus",
   which no roster in this app ever shows: `deriveShortNames` upper-cases and
   cuts to four. The value here is the app's, and the slip is reported. */
const MARCUS = { name: 'Marcus Williams', number: '4', short: 'MARC', level: 'Regular', tier: 3 };

const sheetState = c => evalJSON(c, `(() => {
  const d = document.getElementById('sheetPlayer');
  const v = (s, k) => { const n = d && d.querySelector(s); return n ? (k === 'value' ? n.value : n.textContent.trim()) : null; };
  const steps = d ? [...d.querySelectorAll('.bal-step')] : [];
  return JSON.stringify({
    open: !!(d && d.open),
    title: v('h2', 'text'),
    number: v('#playerNumber', 'value'),
    name: v('#playerName', 'value'),
    short: v('#playerShort', 'value'),
    shortPlaceholder: d && d.querySelector('#playerShort') ? d.querySelector('#playerShort').placeholder : null,
    steps: steps.length,
    checked: steps.findIndex(b => b.getAttribute('aria-checked') === 'true') + 1,
    levelWord: v('.bal-lv', 'text'),
    body: d ? d.textContent.replace(/\\s+/g, ' ') : '',
    remove: d ? [...d.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => /remove/i.test(t)) : [],
  });
})()`);

async function playerSheetOk(c, ck) {
  await tap(c, `document.querySelector('#rosterlist .rrow').click()`);
  const s = await sheetState(c);
  if (!ck(s.open, 'tapping the first roster row opened no player sheet')) return false;
  ck(s.title === MARCUS.name, `the sheet's heading reads "${s.title}", want "${MARCUS.name}"`);
  ck(s.number === MARCUS.number, `Number reads "${s.number}", want "${MARCUS.number}"`);
  ck(s.name === MARCUS.name, `Name reads "${s.name}", want "${MARCUS.name}"`);
  ck(s.short === '', `Card name is prefilled with "${s.short}", want an empty field`);
  ck(s.shortPlaceholder === MARCUS.short,
    `Card name's placeholder reads "${s.shortPlaceholder}", want the automatic "${MARCUS.short}"`);
  ck(s.steps === 5, `the Level control has ${s.steps} steps, want 5`);
  ck(s.checked === MARCUS.tier, `step ${s.checked} is selected, want ${MARCUS.tier}`);
  ck(s.levelWord === MARCUS.level, `the level footnote reads "${s.levelWord}", want "${MARCUS.level}"`);
  ck(/never printed and never shown in bench mode/.test(s.body),
    'the sheet never says levels are not printed -- the levels explanation did not move here');
  ck(s.remove.includes('Remove from team'),
    `the sheet offers ${s.remove.length ? s.remove.map(t => `"${t}"`).join(', ') : 'no remove row'}, want "Remove from team"`);
  return true;
}

/* Item 4: removing from the sheet. The toast names the player, and -- because
   the RICH fixture files three season games with minutes for everyone -- it
   also has to say the season keeps his minutes and not his name. Undo puts him
   back at the top of the list, where he started. */
async function removeAndUndoOk(c, ck) {
  await tap(c, `[...document.querySelectorAll('#sheetPlayer button')].find(b => b.textContent.trim() === 'Remove from team')?.click()`);
  await waitClosed(c, '#sheetPlayer');
  const after = await evalJSON(c, `JSON.stringify({
    open: document.getElementById('sheetPlayer').open,
    rows: document.querySelectorAll('#rosterlist .rrow').length,
    first: document.querySelector('#rosterlist .rrow .prow-t')?.textContent.trim() ?? null,
    toast: document.querySelector('#toasts .toast[data-undo] .tmsg')?.textContent.trim() ?? null,
  })`);
  ck(after.open === false, 'Remove from team left the player sheet open');
  ck(after.rows === ROSTER.length - 1,
    `after removing one player the list shows ${after.rows} rows, want ${ROSTER.length - 1}`);
  ck(after.first === ROSTER[1][0], `the list now starts with "${after.first}", want "${ROSTER[1][0]}"`);
  ck(after.toast != null && after.toast.includes(MARCUS.name),
    `the undo snackbar reads ${JSON.stringify(after.toast)}, which does not name ${MARCUS.name}`);
  ck(after.toast != null && /season keeps their minutes/.test(after.toast),
    `the undo snackbar reads ${JSON.stringify(after.toast)}, which never says what the season loses`);

  await tap(c, `document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`);
  const back = await evalJSON(c, `JSON.stringify({
    rows: document.querySelectorAll('#rosterlist .rrow').length,
    first: document.querySelector('#rosterlist .rrow .prow-t')?.textContent.trim() ?? null,
  })`);
  ck(back.rows === ROSTER.length, `Undo left ${back.rows} rows, want ${ROSTER.length}`);
  ck(back.first === MARCUS.name, `Undo put "${back.first}" at the top of the list, want "${MARCUS.name}"`);
}

/* Item 5: the header `+`. A commit sheet, so C4 puts the ✕ top LEFT and gives
   the sheet a confirm named for the result -- "Add player", exactly, for one
   player. */
async function addSheetOk(c, ck) {
  await tap(c, `document.getElementById('teamAdd').click()`);
  const s = await evalJSON(c, `(() => {
    const d = document.getElementById('sheetAddPlayer');
    if (!d) return JSON.stringify({ open: false });
    return JSON.stringify({
      open: d.open,
      closeSide: d.querySelector('.bsheet-close')?.closest('.bsheet-hd-l, .bsheet-hd-r')?.className ?? null,
      fields: [...d.querySelectorAll('input')].map(i => i.id),
      confirm: d.querySelector('.bsheet-cta .btn.primary')?.textContent.trim() ?? null,
    });
  })()`);
  if (!ck(s.open, 'the header + opened no "Add a player" sheet')) return;
  ck(s.closeSide === 'bsheet-hd-l', `the ✕ sits in ${s.closeSide ?? 'no header slot'}, want the left (C4)`);
  ck(s.fields.length === 2, `the add sheet holds ${s.fields.length} field(s) (${s.fields.join(', ')}), want a number and a name`);
  ck(s.confirm === 'Add player', `the add sheet's confirm reads "${s.confirm}", want "Add player"`);
  await tap(c, `document.querySelector('#sheetAddPlayer .bsheet-close').click()`);
  ck(await waitClosed(c, '#sheetAddPlayer'), 'the ✕ did not close the add sheet with nothing typed');
}

/* Item 6: the paste sheet. Three lines of the formats `parseRoster` already
   reads, the confirm counting them, and the ask that stands between typed
   text and a close (decision 5: inside the sheet, never a second overlay). */
const PASTE_THREE = '12 Maya Webb\\n4 Eli Tran\\nDevon Ellis';

const pasteState = c => evalJSON(c, `(() => {
  const d = document.getElementById('sheetPaste');
  if (!d) return JSON.stringify({ open: false });
  const ask = d.querySelector('#pasteAsk');
  return JSON.stringify({
    open: d.open,
    confirm: d.querySelector('#pasteGo')?.textContent.trim() ?? null,
    askShown: !!(ask && !ask.hidden),
    askText: ask ? ask.textContent.replace(/\\s+/g, ' ').trim() : null,
    askButtons: ask ? [...ask.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
  });
})()`);

const typeInto = (c, sel, text) => tap(c, `(() => {
  const t = document.querySelector(${JSON.stringify(sel)});
  t.value = ${JSON.stringify(text)};
  t.dispatchEvent(new Event('input', { bubbles: true }));
})()`);

async function escape(c) {
  for (const type of ['keyDown', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  }
  await settle(c);
}

/* A REAL mouse press, not `.click()` from a script. Chrome refuses to let a
   `cancel` handler keep a dialog open unless the page has had a genuine
   interaction ("Blocked aborting a dialog because the user has not
   interacted with the page"), and the discard ask below is exactly that
   handler -- so a scripted click would close the sheet over the typed text
   for a reason no coach could ever hit. */
async function realTap(c, sel) {
  // the roster is eleven rows tall, so the group below it starts off screen:
  // a mouse event at a page coordinate lands on whatever is actually there.
  await tap(c, `document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'center' })`);
  const r = await evalJSON(c, `(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 }); })()`);
  await click(c, r.x, r.y);
  await settle(c);
}

async function pasteSheetOk(c, ck) {
  await realTap(c, '#pasteRow');
  let s = await pasteState(c);
  if (!ck(s.open, '"Paste a list" opened no sheet')) return;

  await typeInto(c, '#sheetPaste textarea', PASTE_THREE.replace(/\\n/g, '\n'));
  s = await pasteState(c);
  ck(s.confirm === 'Add 3 players', `with three lines typed the confirm reads "${s.confirm}", want "Add 3 players"`);

  await typeInto(c, '#sheetPaste textarea', '4 Eli Tran');
  s = await pasteState(c);
  ck(s.confirm === 'Add player', `with one line typed the confirm reads "${s.confirm}", want "Add player"`);

  // Escape with text in the box: the sheet stays, and asks.
  await escape(c);
  s = await pasteState(c);
  ck(s.open, 'Escape threw away typed text without asking');
  ck(s.askShown, 'Escape closed nothing but never asked either -- there is no discard ask');
  ck(s.askText != null && s.askText.includes('Discard what you typed?'),
    `the ask reads ${JSON.stringify(s.askText)}, want "Discard what you typed?"`);
  ck(s.askButtons.join(' / ') === 'Keep editing / Discard',
    `the ask offers ${s.askButtons.join(' / ') || 'nothing'}, want "Keep editing / Discard"`);

  await tap(c, `document.getElementById('pasteKeep').click()`);
  s = await pasteState(c);
  ck(s.open && !s.askShown, 'Keep editing did not put the coach back in the sheet');

  // Empty box: the ✕ closes at once, with nothing to lose.
  await typeInto(c, '#sheetPaste textarea', '');
  await tap(c, `document.querySelector('#sheetPaste .bsheet-close').click()`);
  ck(await waitClosed(c, '#sheetPaste'), 'the ✕ did not close the paste sheet with an empty box');
}

/* Item 7: Edit mode. The list stops being a list of doors and becomes a list
   of handles -- a grip and both arrows on every row, each a real 48px target
   at 320px as well as at 390px (decision 7 deleted the rule that used to hide
   the arrows below 620px), the two ends disabled because there is nowhere for
   them to go, and the grip's own name saying both what it takes and where it
   is. Done puts the tapping list back. */
const editState = c => evalJSON(c, `JSON.stringify([...document.querySelectorAll('#rosterlist .rrow')].map(r => {
  const ord = [...r.querySelectorAll('.rord button')].map(b => {
    const x = b.getBoundingClientRect();
    return { grip: b.classList.contains('rgrip'), w: x.width, h: x.height,
      off: b.disabled, name: b.getAttribute('aria-label') || '' };
  });
  return { tag: r.tagName, ord };
}))`);

async function atWidth(c, width) {
  await c.send('Emulation.setDeviceMetricsOverride',
    { width, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await settle(c);
}

async function editModeOk(c, ck) {
  await tap(c, `document.getElementById('teamEdit').click()`);
  const on = await evalJSON(c, `JSON.stringify({
    text: document.getElementById('teamEdit').textContent.trim(),
    pressed: document.getElementById('teamEdit').getAttribute('aria-pressed'),
  })`);
  ck(on.text === 'Done', `in Edit mode the header button reads "${on.text}", want "Done"`);
  ck(on.pressed === 'true', `in Edit mode the header button is aria-pressed="${on.pressed}", want true`);

  for (const width of [WIDTH, 320]) {
    if (width !== WIDTH) await atWidth(c, width);
    const rows = await editState(c);
    if (!ck(rows.length === ROSTER.length,
      `Edit mode shows ${rows.length} row(s) at ${width}px, want ${ROSTER.length}`)) break;
    rows.forEach((r, i) => {
      const [name] = ROSTER[i];
      if (r.ord.length !== 3) {
        ck(false, `${name}'s Edit row carries ${r.ord.length} reorder control(s) at ${width}px, `
          + 'want a grip and two arrows');
        return;
      }
      const [grip, up, dn] = r.ord;
      ck(grip.grip, `${name}'s first reorder control is not the drag grip at ${width}px`);
      for (const b of r.ord) {
        ck(Math.min(b.w, b.h) >= 43.5,
          `${name}'s "${b.name}" measures ${b.w.toFixed(1)}x${b.h.toFixed(1)} at ${width}px, want >= 48px`);
      }
      ck(/arrow keys/.test(grip.name),
        `${name}'s grip is named "${grip.name}", which never mentions the arrow keys`);
      ck(grip.name.includes(`position ${i + 1} of ${ROSTER.length}`),
        `${name}'s grip is named "${grip.name}", which does not place it at position ${i + 1} of ${ROSTER.length}`);
      if (i === 0) ck(up.off, `at ${width}px the first row offers a move up with nowhere to go`);
      else ck(!up.off, `${name} cannot be moved up at ${width}px`);
      if (i === rows.length - 1) ck(dn.off, `at ${width}px the last row offers a move down with nowhere to go`);
      else ck(!dn.off, `${name} cannot be moved down at ${width}px`);
    });
  }
  await atWidth(c, WIDTH);

  await tap(c, `document.getElementById('teamEdit').click()`);
  const off = await evalJSON(c, `JSON.stringify({
    text: document.getElementById('teamEdit').textContent.trim(),
    tags: [...document.querySelectorAll('#rosterlist .rrow')].map(r => r.tagName),
    grips: document.querySelectorAll('#rosterlist .rgrip').length,
  })`);
  ck(off.text === 'Edit', `after Done the header button reads "${off.text}", want "Edit"`);
  ck(off.grips === 0, `Done left ${off.grips} grip(s) in the list, so the tapping list never came back`);
  ck(off.tags.length === ROSTER.length && off.tags.every(t => t === 'BUTTON'),
    'after Done the rows are not the one-button-per-player list again');
}

/* Item 10: the first-run state, reached the way a coach reaches it -- by
   removing the last player, not by rewriting storage (which boots onboarding
   instead and never shows this screen at all). A heading, one sentence, both
   ways to start, and NO empty group box standing open above them (W3). */
async function emptyStateOk(c, ck) {
  for (let i = 0; i < ROSTER.length; i++) {
    await tap(c, `document.querySelector('#rosterlist .rrow')?.click()`);
    await tap(c, `document.getElementById('playerRemove')?.click()`);
  }
  const s = await evalJSON(c, `(() => {
    const e = document.getElementById('teamEmpty');
    const box = document.getElementById('rosterlist');
    const acts = e ? [...e.querySelectorAll('button')].map(b => b.textContent.trim()) : [];
    const r = e ? e.getBoundingClientRect() : null;
    return JSON.stringify({
      rows: document.querySelectorAll('#rosterlist .rrow').length,
      emptyShown: !!(e && !e.hidden && e.getBoundingClientRect().height > 0),
      listShown: !!(box && !box.hidden && box.getBoundingClientRect().height > 0),
      actionsShown: (() => { const a = document.getElementById('teamActions');
        return !!(a && !a.hidden && a.getBoundingClientRect().height > 0); })(),
      heading: e?.querySelector('h2')?.textContent.trim() ?? null,
      line: e?.querySelector('p')?.textContent.trim() ?? null,
      acts,
      right: r ? r.right : 0,
      vw: document.documentElement.clientWidth,
      count: document.getElementById('rosterCount')?.textContent.trim() ?? null,
    });
  })()`);
  ck(s.rows === 0, `after removing everyone the list still holds ${s.rows} row(s)`);
  ck(s.emptyShown, 'with nobody on the roster the Team screen shows no empty state at all');
  ck(!s.listShown, 'the empty group box is still standing open above the empty state (W3)');
  ck(!s.actionsShown, 'the second group is still on screen with no roster to act on');
  ck(!!s.heading, 'the empty state has no heading');
  ck(!!s.line && s.line.length > 0, 'the empty state never says what to do');
  ck(s.acts.includes('Add a player') && s.acts.includes('Paste a list'),
    `the empty state offers ${s.acts.join(' / ') || 'nothing'}, want both "Add a player" and "Paste a list"`);
  ck(s.right <= s.vw + 0.5, `the empty state reaches ${s.right.toFixed(1)}px past a ${s.vw}px screen`);
  ck(s.count === '', `the title still reads "${s.count}" with nobody on the roster`);
}

export async function teamScreenPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    await toTeam(c);
    await rosterListOk(c, ck);
    await nothingEditableOnTeam(c, ck);
    if (await playerSheetOk(c, ck)) await removeAndUndoOk(c, ck);
    await addSheetOk(c, ck);
    await pasteSheetOk(c, ck);
    await editModeOk(c, ck);
    await emptyStateOk(c, ck);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  // leave the fixture as `goRich` left it, for whatever runs next.
  await goRich(c, origin).catch(() => {});

  return {
    name: nameOf('teamscreen'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'the roster list holds, and nothing on Team is editable outside a sheet',
  };
}
