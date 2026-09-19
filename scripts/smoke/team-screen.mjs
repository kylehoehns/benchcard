/* balance.js reads `document` at import time (through state.js/dom.js); this
   is the Node side of the check, not the browser page, so it needs the same
   stub test/*.js gives that module. */
import '../../test/dom-stub.js';
import { evalIn, step, TODAY_HOME, WIDTH, HEIGHT } from './dom.mjs';
import { nameOf, TOUCH_FLOOR, TOUCH_WIDTHS } from './registry.mjs';
import { goRich, PLAYERS, tierOf, LONG_NAME, SAMPLE_PLAYERS, SAMPLE_TEAM, reloadWithRecord } from './fixtures.mjs';
import { drag, evalJSON, key, realTap, setGame, tap, settle, typeIn, waitClosed } from './sheet-drive.mjs';
import { levelName } from '../../app/balance.js';

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
   maps to -- `PLAYERS` and `tierOf` are the rich fixture's own (fixtures.mjs),
   `levelName` is balance.js's, so this is never a second copy of either.
   Item 1 names all three of these outcomes; the other eight rows are the
   "other nine read Regular" half of the same sentence. */
const ROSTER = PLAYERS.map(p => [p.name, p.number, levelName({ tier: tierOf(p) })]);

/* I1's floor, minus the repo's 0.5px `getBoundingClientRect` tolerance --
   the same pair `smoke-checks.js` measures every control against, named once
   here rather than spelled as a bare `47.5` in each of the three places below
   that ask for it. Failure messages read `TOUCH_FLOOR` too, so the number a
   reader is told to hit is the number that was measured. */
const ROW_MIN = TOUCH_FLOOR - 0.5;

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
    ck(r.height >= ROW_MIN, `${name}'s row is ${r.height.toFixed(1)}px tall, want >= ${TOUCH_FLOOR}px`);
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

/* A1: `.rrow .rord, .rrow .av` and `rosterDown`'s handle check used to match
   every roster row, tapping list included -- a pointer drag on a tapping
   row's badge began a real drag (reordering the roster and swallowing the tap
   that would have opened the sheet) instead of letting the page scroll under
   a thumb. Both are now scoped to `.rrow-edit`: only an Edit row drags. */
async function noDragOnTappingRow(c, ck) {
  const before = await rosterRows(c);
  const av = await evalJSON(c, `(() => {
    const b = document.querySelector('#rosterlist .rrow .av').getBoundingClientRect();
    return JSON.stringify({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
  })()`);
  await drag(c, av.x, av.y, av.y + 80, 8);
  await settle(c);
  const dragging = await evalJSON(c, `JSON.stringify({
    dragging: document.getElementById('rosterlist').classList.contains('dragging'),
  })`);
  ck(!dragging.dragging,
    "a pointer drag on a tapping row's badge left #rosterlist mid-drag (.dragging)");
  const after = await rosterRows(c);
  ck(JSON.stringify(after.map(r => r.name)) === JSON.stringify(before.map(r => r.name)),
    "a pointer drag on a tapping row's badge reordered the roster -- the tapping list is not a drag surface");
  // A plain tap on the row (no reorder happened) may have opened the sheet --
  // that is correct, and irrelevant here; leave it closed for the next check.
  await evalIn(c, `document.getElementById('sheetPlayer')?.open && document.getElementById('sheetPlayer').close()`);
}

/* Item 3: the whole of one player, in one sheet. Every expected value is the
   RICH fixture's own row for Marcus Williams (`fixtures.mjs`: p0, number 4,
   tier 3, `shortName` empty). "MARC" is what the card would print for him if
   he never sets one: `deriveShortNames` upper-cases and cuts to four. */
const MARCUS = (() => {
  const p = PLAYERS[0];
  return { name: p.name, number: p.number, short: 'MARC', level: levelName({ tier: tierOf(p) }), tier: tierOf(p) };
})();

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
    identAv: v('#playerIdentAv', 'text'),
    identName: v('#playerIdentName', 'text'),
    identLevel: v('#playerIdentLevel', 'text'),
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
  // A4: at the design size every field's label still fits on its own line.
  await prowFieldsOk(c, ck, '#sheetPlayer', '390px/16px', true);

  /* A5: the identity block above the fields -- prototype's own 56px badge,
     name and level line, painted from the same values as the row it opened
     from (never a second copy of `initials`/`levelName`). */
  ck(s.identAv === MARCUS.number, `the identity badge reads "${s.identAv}", want "${MARCUS.number}"`);
  ck(s.identName === MARCUS.name, `the identity name reads "${s.identName}", want "${MARCUS.name}"`);
  ck(s.identLevel === MARCUS.level, `the identity level line reads "${s.identLevel}", want "${MARCUS.level}"`);

  // A5: it stays live with the fields below it, the way the row behind it does.
  await typeInto(c, '#playerName', 'Temp Name');
  const renamed = await sheetState(c);
  ck(renamed.identName === 'Temp Name',
    `the identity name did not follow a Name edit -- reads "${renamed.identName}"`);
  await typeInto(c, '#playerName', MARCUS.name);

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

/* A4/A10: `#sheetCard .pgrp .prow-select`'s fix (app.css) never reached a
   plain text field's row -- `.pgrp .prow-in`'s flex-basis of auto beats
   `.prow-t`'s flex-basis of 0 the same way, so the label loses the row's
   width. Measured before any fix: at 390px/16px "Card name" (the longest
   label) is squeezed to 69.5px, just short of the ~70px "Card name" needs on
   one line, so it wraps to two (48px tall against a 24px line) while
   "Number"/"Name" still fit; at 320px/32px every label in #sheetPlayer and
   #sheetAddPlayer collapses to 0 width outright, painting under the field
   instead of beside it. `.prow-t` is blockified as a flex item, so a wrapped
   label still reports one `getClientRects()` box -- only its OWN height
   against its line-height says whether it wrapped, the same measure a
   collapsed-to-0-width label already fails outright. */
async function prowFieldGeometry(c, dialogSel) {
  return evalJSON(c, `JSON.stringify([...document.querySelectorAll('${dialogSel} .pgrp .prow-in')].map(input => {
    const label = input.closest('.prow').querySelector('.prow-t');
    const lr = label.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(label).lineHeight);
    return { text: label.textContent, width: lr.width, height: lr.height, lh };
  }))`);
}

async function prowFieldsOk(c, ck, dialogSel, where, oneLine) {
  const fields = await prowFieldGeometry(c, dialogSel);
  for (const f of fields) {
    ck(f.width > 0, `${where}: "${f.text}"'s label in ${dialogSel} measures 0px wide`);
    if (oneLine) ck(f.height <= f.lh * 1.5,
      `${where}: "${f.text}"'s label in ${dialogSel} is ${f.height.toFixed(1)}px tall against a ${f.lh.toFixed(1)}px line, want one line`);
  }
}

/* Item 5: the header `+`. A commit sheet, so C4 puts the ✕ top LEFT and gives
   the sheet a confirm named for the result -- "Add player", exactly, for one
   player. */
const addState = c => evalJSON(c, `(() => {
  const d = document.getElementById('sheetAddPlayer');
  if (!d) return JSON.stringify({ open: false });
  const ask = d.querySelector('#addAsk');
  return JSON.stringify({
    open: d.open,
    closeSide: d.querySelector('.bsheet-close')?.closest('.bsheet-hd-l, .bsheet-hd-r')?.className ?? null,
    fields: [...d.querySelectorAll('input')].map(i => i.id),
    confirm: d.querySelector('.bsheet-cta .btn.primary')?.textContent.trim() ?? null,
    confirmDisabled: d.querySelector('#addPlayerGo')?.disabled ?? null,
    askShown: !!(ask && !ask.hidden),
    askButtons: ask ? [...ask.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
  });
})()`);

async function addSheetOk(c, ck) {
  await tap(c, `document.getElementById('teamAdd').click()`);
  let s = await addState(c);
  if (!ck(s.open, 'the header + opened no "Add a player" sheet')) return;
  ck(s.closeSide === 'bsheet-hd-l', `the ✕ sits in ${s.closeSide ?? 'no header slot'}, want the left (C4)`);
  ck(s.fields.length === 2, `the add sheet holds ${s.fields.length} field(s) (${s.fields.join(', ')}), want a number and a name`);
  ck(s.confirm === 'Add player', `the add sheet's confirm reads "${s.confirm}", want "Add player"`);

  /* A3: nothing typed is nothing to add -- the confirm starts disabled rather
     than pushing a totally blank "Unnamed" player. */
  ck(s.confirmDisabled === true, 'the add sheet\'s confirm is enabled with both fields empty');

  await typeInto(c, '#addNumber', '9');
  s = await addState(c);
  ck(s.confirmDisabled === false, 'a jersey number alone does not enable the confirm');

  await typeInto(c, '#addNumber', '');
  await typeInto(c, '#addName', 'Sam');
  s = await addState(c);
  ck(s.confirmDisabled === false, 'a name alone does not enable the confirm');

  /* A3: closing on top of typed content asks first, the same guard the paste
     sheet already carries (C4/decision 5). */
  await tap(c, `document.querySelector('#sheetAddPlayer .bsheet-close').click()`);
  s = await addState(c);
  ck(s.open, 'the ✕ threw away a typed name without asking');
  ck(s.askShown, 'the ✕ closed the add sheet but never asked -- there is no discard ask');
  ck(s.askButtons.join(' / ') === 'Keep editing / Discard',
    `the add sheet's ask offers ${s.askButtons.join(' / ') || 'nothing'}, want "Keep editing / Discard"`);

  await tap(c, `document.getElementById('addKeep').click()`);
  s = await addState(c);
  ck(s.open && !s.askShown, '"Keep editing" did not put the coach back in the add sheet');

  await typeInto(c, '#addName', '');
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
    keepClass: d.querySelector('#pasteKeep')?.className ?? null,
    discardClass: d.querySelector('#pasteDiscard')?.className ?? null,
  });
})()`);

// `typeInto`, `realTap`: moved into sheet-drive.mjs (I6) -- word-for-word the
// same helpers `add-game-flow.mjs` carried its own copy of.
const typeInto = typeIn;

async function pasteSheetOk(c, ck) {
  await realTap(c, '#pasteRow');
  let s = await pasteState(c);
  if (!ck(s.open, '"Paste a list" opened no sheet')) return;

  /* A9: no desktop resize grabber on a phone sheet that already has its own
     drag handle. */
  const resize = await evalJSON(c, `JSON.stringify({
    resize: getComputedStyle(document.getElementById('pasteText')).resize,
  })`);
  ck(resize.resize === 'none',
    `#pasteText has resize: ${resize.resize}, want none -- this is a phone sheet, not a desktop textbox`);

  await typeInto(c, '#sheetPaste textarea', PASTE_THREE.replace(/\\n/g, '\n'));
  s = await pasteState(c);
  ck(s.confirm === 'Add 3 players', `with three lines typed the confirm reads "${s.confirm}", want "Add 3 players"`);

  await typeInto(c, '#sheetPaste textarea', '4 Eli Tran');
  s = await pasteState(c);
  ck(s.confirm === 'Add player', `with one line typed the confirm reads "${s.confirm}", want "Add player"`);

  // Escape with text in the box: the sheet stays, and asks.
  await key(c, 'Escape', 27);
  s = await pasteState(c);
  ck(s.open, 'Escape threw away typed text without asking');
  ck(s.askShown, 'Escape closed nothing but never asked either -- there is no discard ask');
  ck(s.askText != null && s.askText.includes('Discard what you typed?'),
    `the ask reads ${JSON.stringify(s.askText)}, want "Discard what you typed?"`);
  ck(s.askButtons.join(' / ') === 'Keep editing / Discard',
    `the ask offers ${s.askButtons.join(' / ') || 'nothing'}, want "Keep editing / Discard"`);
  /* A8: the safe choice is the filled one, the destructive one is quiet --
     a coach who taps fast should land on "Keep editing" by default. */
  const keepCls = (s.keepClass || '').split(/\s+/);
  const discardCls = (s.discardClass || '').split(/\s+/);
  ck(keepCls.includes('primary') && !keepCls.includes('danger'),
    `"Keep editing" is "${s.keepClass}", want the filled primary button`);
  ck(discardCls.includes('ghost') && discardCls.includes('danger') && !discardCls.includes('primary'),
    `"Discard" is "${s.discardClass}", want the quiet ghost-danger button`);

  await tap(c, `document.getElementById('pasteKeep').click()`);
  s = await pasteState(c);
  ck(s.open && !s.askShown, 'Keep editing did not put the coach back in the sheet');

  // Empty box: the ✕ closes at once, with nothing to lose.
  await typeInto(c, '#sheetPaste textarea', '');
  await tap(c, `document.querySelector('#sheetPaste .bsheet-close').click()`);
  ck(await waitClosed(c, '#sheetPaste'), 'the ✕ did not close the paste sheet with an empty box');
}

/* The identity block is a badge beside a name, and the badge does not shrink.
   At 320px/32px it takes 112px of a 320px screen, which left the name about a
   third of the row -- narrow enough that `overflow-wrap: break-word` cut an
   ORDINARY first name in half ("Marc / us / Willi / ams"). Nothing else could
   see it: the text still fit its box, so there was no overflow to report and
   no sideways pan for `identLongNameOk` to catch.

   Measured on the rich fixture's ordinary "Marcus Williams", not on a
   deliberately long name, and counted in line boxes rather than in widths: a
   Range around a word that has ALREADY been broken reports the union of its
   two line boxes, which is never wider than the box that broke it, so a width
   comparison here says everything is fine while the name is in pieces. The
   long-name cell keeps its own check below; one word wider than the whole
   screen does have to break somewhere, but an ordinary name never does. */
async function identNotBrokenMidWord(c, ck) {
  const g = await evalJSON(c, `JSON.stringify((() => {
    const el = document.getElementById('playerIdentName');
    const r = document.createRange();
    r.selectNodeContents(el);
    const text = el.textContent.trim();
    return { text, lines: r.getClientRects().length, words: text.split(/\\s+/).length };
  })())`);
  ck(g.lines <= g.words,
    `at 320px/32px the identity name "${g.text}" paints on ${g.lines} line(s) for ${g.words} word(s) -- it is being broken mid-word`);
}

/* A10: the same bug `prowFieldsOk` guards above, at the cell where it is
   worst -- 320px/32px, the narrowest phone at the largest reader text
   (`LARGE_TEXT_WIDTH`/`LARGE_TEXT_PX`, registry.mjs). Not `oneLine`: a label
   wrapping here is the fix (`#sheetCard`'s own prior art), only a 0-width
   label is the bug. */
async function fieldsAtLargeTextOk(c, ck) {
  await c.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width: 320, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await settle(c);
    await tap(c, `document.querySelector('#rosterlist .rrow').click()`);
    await prowFieldsOk(c, ck, '#sheetPlayer', '320px/32px', false);
    await identNotBrokenMidWord(c, ck);
    await tap(c, `document.getElementById('sheetPlayerClose').click()`);
    await tap(c, `document.getElementById('teamAdd').click()`);
    await prowFieldsOk(c, ck, '#sheetAddPlayer', '320px/32px', false);
    await tap(c, `document.querySelector('#sheetAddPlayer .bsheet-close').click()`);
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
}

/* A5: the identity block must not clip or pan a long name at 320px/32px --
   the same long-name safety `.rrow .prow-t`/`.sn-nm` already give the roster
   row and card name (`app.css`'s `overflow-wrap: break-word` on
   `.pident-name`, `min-width: 0` on `.pident-t`). Mutates p5 (`Jordan Bell`,
   `fixtures.mjs`) through `setGame`, never a second player list. */
async function identLongNameOk(c, ck) {
  await tap(c, setGame(`s.team().players.find(p => p.id === 'p5').name = ${JSON.stringify(LONG_NAME)};`));
  await c.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width: 320, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await settle(c);
    await tap(c, `document.querySelectorAll('#rosterlist .rrow')[5].click()`);
    const g = await evalJSON(c, `JSON.stringify((() => {
      const body = document.querySelector('#sheetPlayer .bsheet-body');
      return {
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth,
        name: document.getElementById('playerIdentName').textContent.trim(),
      };
    })())`);
    ck(g.name === LONG_NAME, `the identity name reads "${g.name}", want the long name in place`);
    ck(g.bodyScrollWidth <= g.bodyClientWidth + 1,
      `the sheet body scrolls sideways (${g.bodyScrollWidth}px wide against a ${g.bodyClientWidth}px box) with a long name in the identity block`);
    await tap(c, `document.getElementById('sheetPlayerClose').click()`);
  } finally {
    await tap(c, setGame(`s.team().players.find(p => p.id === 'p5').name = ${JSON.stringify('Jordan Bell')};`));
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
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

/* #37 criterion 2: the roster row at every phone width, on two rosters.
 *
 * `rosterListOk` above measures the rows once, at 390px, and a row that fits
 * there can still lose the name at 320 or 360 -- the widths a coach's phone
 * actually is. `TOUCH_WIDTHS` (registry.mjs) is the list the touch sweep and
 * every row sweep already use; this is not a fourth copy of it.
 *
 * Three claims per row, because "48px tall" alone passed a row whose name was
 * quietly cut in half:
 *   - the row clears the 48px floor (I1), with the repo's own 0.5px
 *     `getBoundingClientRect` tolerance;
 *   - `.prow-t` is not clipped -- its `scrollWidth` fits its own `clientWidth`,
 *     which is what `text-overflow`/`overflow: hidden` hides;
 *   - and it does not paint past the row's own CONTENT box, which is the case
 *     an unclipped name that simply overhangs its padding would otherwise
 *     slip through.
 *
 * The count is asserted before anything about the rows: a selector that
 * matched nothing would otherwise report "every row fine" about no rows at
 * all. */
const rosterFit = c => evalJSON(c, `JSON.stringify([...document.querySelectorAll('#rosterlist .rrow')].map(r => {
  const t = r.querySelector('.prow-t');
  const rb = r.getBoundingClientRect();
  const cs = getComputedStyle(r);
  const contentRight = rb.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
  const tb = t && t.getBoundingClientRect();
  return {
    name: t ? t.textContent.trim() : null,
    height: rb.height,
    scrollWidth: t ? t.scrollWidth : 0,
    clientWidth: t ? t.clientWidth : 0,
    past: tb ? tb.right - contentRight : 0,
  };
}))`);

async function rosterRowsFitOk(c, ck, who, want) {
  try {
    for (const w of TOUCH_WIDTHS) {
      await atWidth(c, w);
      const rows = await rosterFit(c);
      if (!ck(rows.length === want,
        `${who}@${w}px: ${rows.length} roster row(s) measured, want ${want}`)) continue;
      for (const r of rows) {
        if (!ck(r.name, `${who}@${w}px: a roster row carries no .prow-t, so no name was measured`)) continue;
        ck(r.height >= ROW_MIN,
          `${who}@${w}px: ${r.name}'s row is ${r.height.toFixed(1)}px tall, want >= ${TOUCH_FLOOR}px`);
        ck(r.scrollWidth <= r.clientWidth + 0.5,
          `${who}@${w}px: ${r.name} is clipped -- the name needs ${r.scrollWidth}px in a ${r.clientWidth}px box`);
        ck(r.past <= 0.5,
          `${who}@${w}px: ${r.name} paints ${r.past.toFixed(1)}px past the row's own content box`);
      }
    }
  } finally {
    await atWidth(c, WIDTH);
  }
}

/* The same three claims against the app's OWN sample team -- the roster a
   coach who taps "Try a sample team" is looking at, `sampleRoster()`'s cast
   (fixtures.mjs `SAMPLE_TEAM`), never a second list of names here. Runs last
   and reloads its own record, because `emptyStateOk` above leaves RICH's
   roster empty; `teamScreenPass`'s own `goRich` puts RICH back afterwards for
   whatever runs next. */
async function sampleRosterRowsOk(c, origin, ck) {
  await reloadWithRecord(c, origin, SAMPLE_TEAM);
  await toTeam(c);
  await rosterRowsFitOk(c, ck, 'the sample team', SAMPLE_PLAYERS.length);
}

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

  /* A2: Edit is a property of the screen, not the data -- leaving Team mid-edit
     (even without pressing Done) and coming back must land on the tapping
     list, the way a coach expects of a mode they turned on to move one
     player. `toTeam` leaves for Today and comes straight back. */
  await toTeam(c);
  const afterReturn = await evalJSON(c, `JSON.stringify({
    text: document.getElementById('teamEdit').textContent.trim(),
    pressed: document.getElementById('teamEdit').getAttribute('aria-pressed'),
    grips: document.querySelectorAll('#rosterlist .rgrip').length,
  })`);
  ck(afterReturn.text === 'Edit',
    `after leaving and returning to Team the header button reads "${afterReturn.text}", want "Edit"`);
  ck(afterReturn.pressed === 'false',
    `after leaving and returning to Team the header button is aria-pressed="${afterReturn.pressed}", want false`);
  ck(afterReturn.grips === 0,
    `after leaving and returning to Team, Edit mode's grip is still in the list (${afterReturn.grips})`);
  await tap(c, `document.getElementById('teamEdit').click()`);

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
        ck(Math.min(b.w, b.h) >= ROW_MIN,
          `${name}'s "${b.name}" measures ${b.w.toFixed(1)}x${b.h.toFixed(1)} at ${width}px, want >= ${TOUCH_FLOOR}px`);
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
    /* A2: with exactly one player left there is nothing to reorder, so
       #teamEdit must not offer to. */
    if (i === ROSTER.length - 2) {
      const oneLeft = await evalJSON(c, `JSON.stringify({
        hidden: document.getElementById('teamEdit').hidden,
      })`);
      ck(oneLeft.hidden, 'with one player left, #teamEdit is still shown -- there is nothing to reorder');
    }
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
      teamEditHidden: document.getElementById('teamEdit').hidden,
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
  ck(s.teamEditHidden, 'with nobody on the roster, #teamEdit is still shown -- there is nothing to reorder');
}

export async function teamScreenPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    await toTeam(c);
    await rosterListOk(c, ck);
    await rosterRowsFitOk(c, ck, 'RICH', ROSTER.length);
    await nothingEditableOnTeam(c, ck);
    await noDragOnTappingRow(c, ck);
    if (await playerSheetOk(c, ck)) await removeAndUndoOk(c, ck);
    await addSheetOk(c, ck);
    await pasteSheetOk(c, ck);
    await fieldsAtLargeTextOk(c, ck);
    await identLongNameOk(c, ck);
    await editModeOk(c, ck);
    await emptyStateOk(c, ck);
    await sampleRosterRowsOk(c, origin, ck);
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
      : `the roster list holds at ${TOUCH_WIDTHS.join('/')}px on both rosters `
        + `(${ROSTER.length} rich rows, ${SAMPLE_PLAYERS.length} sample rows, none clipped), `
        + 'and nothing on Team is editable outside a sheet',
  };
}
