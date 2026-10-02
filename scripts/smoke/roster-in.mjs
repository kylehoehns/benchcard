/* balance.js reads `document` at import time (through state.js/dom.js); this
   is the Node side of the check, not the browser page, so it needs the same
   stub test/*.js gives that module. */
import '../../test/dom-stub.js';
import { evalIn, OVERFLOW_PROBE, TODAY_HOME, WIDTH, HEIGHT, toGameOne } from './dom.mjs';
import { goRich, LONG_NAME, PLAYERS } from './fixtures.mjs';
import { LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './sizes.mjs';
import { evalJSON, setGame, settle, tap, waitClosed } from './sheet-drive.mjs';

/* #146's own guard (docs/specs/146-roster-in.md's Proof section): the paste
   sheet and first-run step 1's list/repeat wiring (items 1-3), the item 4
   suffix on every reader named in the spec, the "Add players" branch of the
   blocked panel (item 5), and Add a team as a flow rather than Settings
   (item 6). Large text (item 7) is `app-large-text.mjs`'s own states, not
   repeated here; `first-run-flow.mjs`, `who-rows.mjs` and `team-screen.mjs`
   keep whatever of items 2, 4 and 6 their own existing checks already touch
   (the Proof table's "Existing checks follow any markup move" row). Item 4's
   own last bullet -- a suffixed LONG_NAME not clipped in Who's here or Team
   at 390 or at 320/32 -- is `longNameSuffixOk` below, the one line of item 4
   the fixture above (Maya Webb/Kai Lee, both short) cannot exercise.

   Every expected string below is the spec's own ("What would settle it"),
   never a second computation of what `rosterPreview`/`countLine`/`distinctNames`
   do -- those are already unit-tested against the same values
   (test/roster.test.js, test/first-run.test.js, test/blocked-fix.test.js). */

// A plain multi-line value written in one shot, the way a coach's actual
// paste arrives -- `oninput` is wired as a property on both fields this file
// drives (`ta.oninput = paintPasteConfirm`, roster-view.js; `i.oninput = ...`,
// trap.js's `flowField`), so a plain `Event('input')` reaches it the same as
// a real keystroke would. `typeIn` (sheet-drive.mjs) already covers real
// per-character typing elsewhere; this file only ever needs whole pastes.
const setValue = (sel, text) => `(() => { const el = document.querySelector('${sel}');
  el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input')); })()`;

/* Items 1-3, driven once on the paste sheet (`#sheetPaste`) and once on Add a
   team's step 1 (`#firstRunFlow` in add-team mode) -- the same `stepTeam`
   body first run's own step 1 uses (Design section), so this is not a second
   test of a second implementation. Both bodies get the identical sequence:
   a comma line (item 1, read back through item 2's list sentence), then a
   repeat (item 3) with its "Drop one" button. */
async function listAndRepeatOk(c, ck, where, noteSel, repeatsSel, boxSel, confirmSel) {
  await tap(c, setValue(boxSel, 'Sam, Jo, Kai'));
  let s = await evalJSON(c, `JSON.stringify({
    note: document.querySelector('${noteSel}')?.textContent,
    confirm: ${confirmSel ? `document.querySelector('${confirmSel}')?.textContent.trim()` : 'null'},
  })`);
  ck(s.note === '3 players: Sam, Jo and Kai.' || s.note === '3 players so far: Sam, Jo and Kai. 5 needed to field a lineup.',
    `${where}: the comma line "Sam, Jo, Kai" reads "${s.note}"`);
  if (confirmSel) ck(s.confirm === 'Add 3 players', `${where}: the confirm reads "${s.confirm}", want "Add 3 players"`);

  await tap(c, setValue(boxSel, 'Maya Webb\n12 Maya Webb'));
  s = await evalJSON(c, `JSON.stringify({
    repeat: document.querySelector('${repeatsSel} .paste-repeat span')?.textContent,
    dropLabel: document.querySelector('${repeatsSel} .paste-repeat button')?.getAttribute('aria-label'),
    dropHeight: document.querySelector('${repeatsSel} .paste-repeat button')?.getBoundingClientRect().height,
  })`);
  ck(s.repeat === 'Maya Webb is listed twice.', `${where}: the repeat line reads "${s.repeat}"`);
  ck(s.dropLabel === 'Drop one Maya Webb', `${where}: "Drop one"'s accessible name is "${s.dropLabel}"`);
  ck(s.dropHeight >= 48, `${where}: "Drop one" is ${s.dropHeight}px tall, want >= 48px`);

  await tap(c, `document.querySelector('${repeatsSel} .paste-repeat button').click()`);
  s = await evalJSON(c, `JSON.stringify({
    box: document.querySelector('${boxSel}')?.value,
    repeatsGone: document.querySelector('${repeatsSel}')?.hidden,
  })`);
  ck(s.box === '12 Maya Webb', `${where}: after "Drop one" the box reads "${JSON.stringify(s.box)}", want "12 Maya Webb"`);
  ck(s.repeatsGone === true, `${where}: the repeat row is still shown after "Drop one" removed the only repeat`);
}

async function pasteSheetOk(c, ck) {
  // Three separate `tap()`s, each settled before the next. RICH boots
  // straight onto the games view (fixtures.mjs), so `TODAY_HOME`'s `#backBtn`
  // click here is a real `history.back()` (rich-fixture.mjs's own comment:
  // chaining a click onto that before its `popstate` lands can walk the
  // tab's session history past this reload's own base entry and crash the
  // whole run with "Inspected target navigated or closed"). Landing on Team
  // and opening its paste sheet need their own separation too -- clicking
  // #todayTeam and #pasteRow in the same script left #sheetPaste open for a
  // moment (its DOM built correctly) and then closed on the very next frame,
  // before this check ever read it: switching to Team resizes the bar, and
  // #pasteRow's own `showModal()` racing that resize is what closed it.
  await tap(c, TODAY_HOME);
  await tap(c, `document.getElementById('todayTeam').click();`);
  await tap(c, `document.getElementById('pasteRow').click();`);
  await listAndRepeatOk(c, ck, 'paste sheet', '#pasteNote', '#pasteRepeats', '#pasteText', '#pasteGo');

  // item 2: the empty-box hint is unchanged.
  await tap(c, setValue('#pasteText', ''));
  const s = await evalJSON(c, `JSON.stringify({ note: document.getElementById('pasteNote')?.textContent })`);
  ck(s.note === 'One per line. Numbers are read from either end: “12 Maya Webb” or “Maya Webb #12”.',
    `paste sheet: the empty-box note reads "${s.note}"`);

  await tap(c, `document.querySelector('#sheetPaste .bsheet-close').click()`);
  ck(await waitClosed(c, '#sheetPaste'), 'the paste sheet did not close with an empty box');
}

/* Item 5: the blocked panel's "Add players" branch -- `rosterSize < 5`, not
   how many are marked available (`state.js`'s own `blockedFix`), so a
   3-player roster and an 11-player roster with 7 sat out are two different
   fixtures, not two readings of one. Both mutate the live record through
   `setGame` (sheet-drive.mjs) rather than a reload, and restore what they
   changed before returning -- `pasteSheetOk`/`suffixFixtureOk` after this in
   the run still expect RICH's own 11 players. */
async function blockedAddPlayersOk(c, ck) {
  await tap(c, TODAY_HOME);
  await evalIn(c, setGame(`window.__benched146 = s.state.players.slice(3);
    s.state.players = s.state.players.slice(0, 3);`));
  await settle(c);
  await tap(c, `document.querySelector('.today-game').click()`);
  let s = await evalJSON(c, `JSON.stringify({
    label: document.querySelector('#timeline .empty button')?.textContent,
  })`);
  ck(s.label === 'Add players', `3-player roster: the blocked button reads "${s.label}", want "Add players"`);

  await tap(c, `document.querySelector('#timeline .empty button').click()`);
  s = await evalJSON(c, `JSON.stringify({
    onTeam: document.getElementById('view-team')?.hidden === false,
    pasteOpen: !!document.getElementById('sheetPaste')?.open,
    focused: document.activeElement?.id,
  })`);
  ck(s.onTeam, '"Add players" did not land on the Team screen');
  ck(s.pasteOpen, '"Add players" did not open the paste sheet');
  ck(s.focused === 'pasteText', `"Add players" left focus on "${s.focused}", want #pasteText`);

  await tap(c, `document.querySelector('#sheetPaste .bsheet-close').click()`);
  ck(await waitClosed(c, '#sheetPaste'), 'the paste sheet "Add players" opened did not close');
  await evalIn(c, setGame(`s.state.players = s.state.players.concat(window.__benched146 || []);
    delete window.__benched146;`));
  await settle(c);

  // 11 players, 7 sat out: still "Change who's here", unchanged by item 5.
  await tap(c, TODAY_HOME);
  await tap(c, `document.querySelector('.today-game').click()`);
  await evalIn(c, setGame(`const g = s.game();
    for (const p of s.state.players.slice(4)) s.setAvailable(g, p.id, false);`));
  await settle(c);
  s = await evalJSON(c, `JSON.stringify({
    label: document.querySelector('#timeline .empty button')?.textContent,
  })`);
  ck(s.label === "Change who's here",
    `11-player roster, 7 sat out: the blocked button reads "${s.label}", want "Change who's here"`);
  await evalIn(c, setGame(`const g = s.game();
    for (const p of s.state.players) s.setAvailable(g, p.id, true);`));
  await settle(c);
}

/* Item 4: the shared-name suffix, read back from every place the spec names.
   `byId` mutates four of RICH's own players in place (id, tier, hue and
   every other field untouched) rather than replacing the roster, so the
   plan already built for RICH keeps computing against the same ids -- only
   the two names change. Restored from `PLAYERS` (fixtures.mjs) itself, not a
   hand-typed copy of it, so a restore can never drift from what `goRich`
   would have written anyway. */
const BY_ID = `const byId = id => s.state.players.find(p => p.id === id);`;
// Exported so compare-shots.mjs's own "Who's here with the item 4 fixture"
// look-check state (#146's Proof "Look" line) mutates the same four players
// the same way, rather than a second hand-typed copy of this fixture.
export const FIXTURE4_MUTATE = `${BY_ID}
  byId('p0').name = 'Maya Webb'; byId('p0').number = '12';
  byId('p1').name = 'Maya Webb'; byId('p1').number = '';
  byId('p2').name = 'Kai Lee';   byId('p2').number = '';
  byId('p3').name = 'Kai Lee';   byId('p3').number = '';`;
const FIXTURE4_RESTORE = `${BY_ID} ${PLAYERS.slice(0, 4).map((p) =>
  `byId('${p.id}').name = ${JSON.stringify(p.name)}; byId('${p.id}').number = ${JSON.stringify(p.number)};`).join(' ')}`;

async function suffixFixtureOk(c, ck) {
  await tap(c, TODAY_HOME);
  await evalIn(c, setGame(FIXTURE4_MUTATE));
  await settle(c);

  await toGameOne(c);
  await tap(c, `document.getElementById('phrasePlayers').click()`);
  let s = await evalJSON(c, `JSON.stringify({
    rows: [...document.querySelectorAll('#sheetWhoBody .who-row')].map(r => ({
      text: r.querySelector('.prow-t')?.textContent, label: r.getAttribute('aria-label'),
    })),
  })`);
  const want = ['Maya Webb #12', 'Maya Webb (MAYW2)', 'Kai Lee (KAIL)', 'Kai Lee (KAIL2)'];
  for (const w of want) {
    ck(s.rows.some(r => r.text === w), `Who's here: no row reads "${w}" (got ${JSON.stringify(s.rows.map(r => r.text))})`);
    ck(s.rows.some(r => r.label === w), `Who's here: no row's aria-label is "${w}"`);
  }
  await tap(c, `document.getElementById('sheetWhoClose')?.click() ?? document.getElementById('sheetWho').close()`);

  s = await evalJSON(c, `JSON.stringify({
    rows: [...document.querySelectorAll('#timeline .tl-row')].map(r => ({
      text: r.querySelector('.nm')?.textContent, label: r.querySelector('.tl-name')?.getAttribute('aria-label'),
    })),
  })`);
  for (const w of want) {
    ck(s.rows.some(r => r.text === w), `Timeline: no row reads "${w}" (got ${JSON.stringify(s.rows.map(r => r.text))})`);
    ck(s.rows.some(r => r.label && r.label.startsWith(w)), `Timeline: no row's aria-label starts with "${w}"`);
  }

  await tap(c, TODAY_HOME);
  await tap(c, `document.getElementById('todaySeason').click()`);
  s = await evalJSON(c, `JSON.stringify({
    names: [...document.querySelectorAll('#view-season .sn-list .sn-nm')].map(n => n.textContent),
  })`);
  for (const w of want) ck(s.names.includes(w), `Season: the ledger has no "${w}" row (got ${JSON.stringify(s.names)})`);

  await tap(c, TODAY_HOME);
  await tap(c, `document.getElementById('todayTeam').click()`);
  s = await evalJSON(c, `JSON.stringify({
    names: [...document.querySelectorAll('#rosterlist .rrow .prow-t')].map(n => n.textContent),
  })`);
  for (const w of want) ck(s.names.includes(w), `Team: no roster row reads "${w}" (got ${JSON.stringify(s.names)})`);

  await tap(c, TODAY_HOME);
  await evalIn(c, setGame(FIXTURE4_RESTORE));
  await settle(c);
}

/* Item 4's last bullet, un-checked until now: "At 390 and large text, a
   suffixed long name (LONG_NAME twice, one with #12) wraps or ellipsizes the
   way that screen already does. The suffix is never cut off in Who's here or
   Team, and nothing overflows." `p4`/`p5` (Ana Reyes, Jordan Bell) stand in
   for the fixture -- orthogonal to `p0`-`p3` above, so this can run whenever
   relative to `suffixFixtureOk` without either fixture stepping on the
   other's ids. */
const LONG_MUTATE = `${BY_ID}
  byId('p4').name = ${JSON.stringify(LONG_NAME)}; byId('p4').number = '12';
  byId('p5').name = ${JSON.stringify(LONG_NAME)}; byId('p5').number = '';`;

// The shape of the un-numbered rung -- `deriveShortNames`' own card code,
// " (MAYW2)" -- is not re-derived here (that is roster.js's job, already
// covered by test/roster.test.js); only the shape the spec itself gives is
// asserted: parentheses around capitals and digits.
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LONG_NUMBERED = `${LONG_NAME} #12`;
const LONG_SHORT_RE = new RegExp(`^${escapeRe(LONG_NAME)} \\([A-Z0-9]+\\)$`);

/* A `Range` over the suffix substring -- the same technique `WORD_RECTS_FN`
   (row-stack.mjs) uses per word -- because a clipped `.prow-t` still reports
   its own, unclipped `getBoundingClientRect()` (CSS overflow never shrinks an
   element's own box); only a `Range`'s rect shows what the browser actually
   painted. `wraps` (the whole name's own `getClientRects().length`) and
   `scrollWidth`/`clientWidth` are the other half of "not cut off": either the
   text wrapped onto more than one line, or it did not need to. */
function suffixRowProbe(rowSel) {
  return `(() => {
    const base = ${JSON.stringify(LONG_NAME)};
    const rows = [...document.querySelectorAll(${JSON.stringify(rowSel)})];
    const measure = (row) => {
      const nameEl = row.querySelector('.prow-t');
      if (!nameEl) return null;
      const text = nameEl.textContent || '';
      const walker = document.createTreeWalker(nameEl, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (!node || node.data.length <= base.length) return null;
      const r = document.createRange();
      r.setStart(node, base.length);
      r.setEnd(node, node.data.length);
      const rects = [...r.getClientRects()];
      const rect = rects.reduce((a, b) => a ? {
        left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
        right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom),
      } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, null);
      const full = document.createRange();
      full.selectNodeContents(nameEl);
      const wraps = full.getClientRects().length > 1;
      const rowRect = row.getBoundingClientRect();
      return {
        text, label: row.getAttribute('aria-label'),
        scrollWidth: nameEl.scrollWidth, clientWidth: nameEl.clientWidth, wraps,
        rect,
        rowRect: { left: rowRect.left, top: rowRect.top, right: rowRect.right, bottom: rowRect.bottom },
      };
    };
    const byText = t => rows.find(row => (row.querySelector('.prow-t')?.textContent || '') === t);
    const numbered = byText(${JSON.stringify(LONG_NUMBERED)});
    const shorted = rows.find(row => {
      const t = row.querySelector('.prow-t')?.textContent || '';
      return t !== ${JSON.stringify(LONG_NUMBERED)} && t.startsWith(base + ' (');
    });
    return JSON.stringify({ numbered: numbered ? measure(numbered) : null, shorted: shorted ? measure(shorted) : null });
  })()`;
}

function assertSuffixEntry(ck, where, kind, entry, expectLabel) {
  // rule 2a of /new-guard: a row that was never found measured nothing.
  if (!ck(!!entry, `${where}: no ${kind} row found for the LONG_NAME fixture -- nothing was measured`)) return;
  if (kind === 'numbered') {
    ck(entry.text === LONG_NUMBERED, `${where}: the numbered row reads "${entry.text}", want "${LONG_NUMBERED}"`);
  } else {
    ck(LONG_SHORT_RE.test(entry.text), `${where}: the unnumbered row reads "${entry.text}", want it suffixed "${LONG_NAME} (…)"`);
  }
  // #146 item 4: Who's here's row carries an aria-label naming the player
  // (game-setup.js's `whoRow`); Team's row does not (its accessible name
  // comes from its own visible text, `roster-view.js`'s `playerRow`), so only
  // the sheet the spec lists with "aria-label" is checked for one.
  if (expectLabel) ck(entry.label === entry.text, `${where}: the ${kind} row's aria-label is "${entry.label}", want "${entry.text}"`);
  if (!ck(!!entry.rect, `${where}: the ${kind} row's suffix could not be located in the DOM`)) return;
  const notClipped = entry.scrollWidth <= entry.clientWidth + 1 || entry.wraps;
  ck(notClipped, `${where}: the ${kind} row's name is ${entry.scrollWidth}px in a ${entry.clientWidth}px box and does not wrap`);
  const inside = entry.rect.left >= entry.rowRect.left - 1 && entry.rect.right <= entry.rowRect.right + 1
    && entry.rect.top >= entry.rowRect.top - 1 && entry.rect.bottom <= entry.rowRect.bottom + 1;
  ck(inside, `${where}: the ${kind} row's suffix ${JSON.stringify(entry.rect)} is not inside the row's own box ${JSON.stringify(entry.rowRect)}`);
}

async function longNameSuffixState(c, ck, where) {
  await toGameOne(c);
  await tap(c, `document.getElementById('phrasePlayers').click()`);
  let s = await evalJSON(c, suffixRowProbe('#sheetWhoBody .who-row'));
  assertSuffixEntry(ck, `${where}, Who's here`, 'numbered', s.numbered, true);
  assertSuffixEntry(ck, `${where}, Who's here`, 'shorted', s.shorted, true);
  await tap(c, `document.getElementById('sheetWhoClose')?.click() ?? document.getElementById('sheetWho').close()`);
  let o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
  ck(!o.pans && !o.worst, `${where}, Who's here: page overflows horizontally (${JSON.stringify(o.worst)})`);

  await tap(c, TODAY_HOME);
  await tap(c, `document.getElementById('todayTeam').click()`);
  s = await evalJSON(c, suffixRowProbe('#rosterlist .rrow'));
  assertSuffixEntry(ck, `${where}, Team`, 'numbered', s.numbered, false);
  assertSuffixEntry(ck, `${where}, Team`, 'shorted', s.shorted, false);
  o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
  ck(!o.pans && !o.worst, `${where}, Team: page overflows horizontally (${JSON.stringify(o.worst)})`);
  await tap(c, TODAY_HOME);
}

async function longNameSuffixOk(c, ck, origin) {
  await tap(c, TODAY_HOME);
  await evalIn(c, setGame(LONG_MUTATE));
  await settle(c);
  await longNameSuffixState(c, ck, '390x844');

  // 320/32: `Page.setFontSizes` on a laid-out document reports an unreflowed
  // width (`app-large-text.mjs`'s own comment), so this reloads once through
  // `goRich` to let the new size and width take effect together, then
  // reapplies `LONG_MUTATE` -- a reload wipes it the same way it wipes
  // `suffixFixtureOk`'s own mutation, which is why that check restores by
  // hand and this one simply re-mutates after the reload it needs anyway. */
  try {
    await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await goRich(c, origin);
    await evalIn(c, setGame(LONG_MUTATE));
    await settle(c);
    await longNameSuffixState(c, ck, `${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`);
  } finally {
    // Never leave the emulated font size or width on for whatever runs next
    // in this pass or the ones after it (`appLargeTextPass`'s own rule).
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    // `goRich` reloads onto the fixture's own game screen, not Today (the
    // same reason `pasteSheetOk`'s first line below always clicks
    // `TODAY_HOME`) -- landing on Today here keeps this check leaving the
    // browser the way `suffixFixtureOk` above already does, since
    // `addTeamFlowOk` right after this one reads `.today-game` counts
    // assuming it starts there.
    await goRich(c, origin);
    await tap(c, TODAY_HOME);
  }
}

/* Item 6: Add a team as a flow. Opened from the team menu's own entry
   (`teams-view.js`'s `addTeam`, which now only calls `openAddTeam`), not a
   copy of it. The same step 1 body first run uses gets items 1-3's sequence
   run on it too (`listAndRepeatOk`), settling the spec's own "the same …
   fields as first-run step 1, with items 1-3 working there" line without a
   second, wipe-and-reload path to first run's own step 1 -- that door is
   `first-run-flow.mjs`'s guard, and `#welTry`/`#welStart` open the identical
   `stepTeam`. */
async function addTeamFlowOk(c, ck) {
  const before = await evalJSON(c, `(async () => {
    const s = await import('/state.js');
    return JSON.stringify({ teams: s.state.teams.length, games: document.querySelectorAll('.today-game').length });
  })()`);

  await tap(c, TODAY_HOME);
  await tap(c, `document.getElementById('teamBtn').click();
                document.querySelector('.teammenu-add').click();`);
  let s = await evalJSON(c, `JSON.stringify({
    open: document.getElementById('firstRunFlow')?.open,
    label: document.getElementById('firstRunFlow')?.getAttribute('aria-label'),
    step: document.getElementById('frStep')?.textContent,
    heading: document.querySelector('#frBody h2')?.textContent,
    fillHidden: document.getElementById('frFill')?.hidden,
    nextDisabled: document.getElementById('frNext')?.disabled,
  })`);
  ck(s.open, 'the team menu’s "Add a team" did not open #firstRunFlow');
  ck(s.label === 'Add a team', `#firstRunFlow's aria-label is "${s.label}", want "Add a team"`);
  ck(s.step === '1 of 2', `the step count reads "${s.step}", want "1 of 2"`);
  ck(s.heading === "Who's on the team?", `step 1's heading reads "${s.heading}"`);
  ck(s.fillHidden === true, '"Fill with a sample team" is shown in Add-a-team mode');
  ck(s.nextDisabled === true, 'Next is enabled with nothing typed yet');

  await listAndRepeatOk(c, ck, 'Add a team step 1', '#frCount', '#frRepeats', '#frRoster', null);

  // abandon: a real name and a full roster, then Discard.
  await tap(c, setValue('#frTeam', 'Wolves'));
  await tap(c, setValue('#frRoster', '1 Ann One\n2 Bo Two\n3 Cy Three\n4 Di Four\n5 Ed Five'));
  s = await evalJSON(c, `JSON.stringify({ nextDisabled: document.getElementById('frNext')?.disabled })`);
  ck(s.nextDisabled === false, 'Next is still disabled with 5 players typed');
  await tap(c, `document.getElementById('frClose').click()`);
  s = await evalJSON(c, `JSON.stringify({ askShown: !document.getElementById('frAsk')?.hidden })`);
  ck(s.askShown, 'closing with a typed name and roster did not ask before discarding');
  await tap(c, `document.getElementById('frDiscard').click()`);
  ck(await waitClosed(c, '#firstRunFlow'), '"Discard" did not close #firstRunFlow');
  let after = await evalJSON(c, `(async () => {
    const s = await import('/state.js');
    return JSON.stringify({ teams: s.state.teams.length, games: document.querySelectorAll('.today-game').length });
  })()`);
  ck(after.teams === before.teams, `abandoning Add a team left ${after.teams} teams, want the original ${before.teams}`);
  ck(after.games === before.games,
    `abandoning Add a team left ${after.games} row(s) on Today, want the original ${before.games}`);

  // complete: reopen, type the same roster, and go all the way through.
  await tap(c, `document.getElementById('teamBtn').click();
                document.querySelector('.teammenu-add').click();`);
  await tap(c, setValue('#frTeam', 'Wolves'));
  await tap(c, setValue('#frRoster', '1 Ann One\n2 Bo Two\n3 Cy Three\n4 Di Four\n5 Ed Five'));
  await tap(c, `document.getElementById('frNext').click()`);
  s = await evalJSON(c, `JSON.stringify({
    step: document.getElementById('frStep')?.textContent,
    heading: document.querySelector('#frBody h2')?.textContent,
    settingsShown: document.getElementById('view-settings')?.hidden === false,
  })`);
  ck(s.step === '2 of 2', `after Next, the step count reads "${s.step}", want "2 of 2"`);
  ck(s.heading === "Here's your first card", `step 2's heading reads "${s.heading}"`);
  ck(!s.settingsShown, 'Settings was shown on the way to committing the new team');

  await tap(c, `document.getElementById('frNext').click()`); // "Go to the game"
  ck(await waitClosed(c, '#firstRunFlow'), '"Go to the game" did not close #firstRunFlow');
  const done = await evalJSON(c, `(async () => {
    const s = await import('/state.js');
    const t = s.state.teams[s.state.activeTeam];
    return JSON.stringify({
      teams: s.state.teams.length, active: s.state.activeTeam, name: t?.name,
      players: t?.players.length, games: t?.days[t.activeDay].games.length,
      settingsShown: document.getElementById('view-settings')?.hidden === false,
    });
  })()`);
  ck(done.teams === before.teams + 1, `completing Add a team left ${done.teams} teams, want ${before.teams + 1}`);
  ck(done.active === done.teams - 1, 'the new team was not made active');
  ck(done.name === 'Wolves', `the new team is named "${done.name}", want "Wolves"`);
  ck(done.players === 5, `the new team has ${done.players} player(s), want 5`);
  ck(done.games === 1, `the new team has ${done.games} game(s), want 1 (Game 1, already planned)`);
  ck(!done.settingsShown, 'Settings was shown while completing Add a team');
}

export async function rosterInPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    await pasteSheetOk(c, ck);
    await blockedAddPlayersOk(c, ck);
    await suffixFixtureOk(c, ck);
    await longNameSuffixOk(c, ck, origin);
    await addTeamFlowOk(c, ck);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'paste sheet and Add a team step 1 read back their list/repeat text, "Add players" opens Team with '
        + 'the paste sheet focused, the item 4 fixture is suffixed everywhere it is read, and Add a team '
        + 'opens, abandons cleanly and completes without ever showing Settings',
  };
}
