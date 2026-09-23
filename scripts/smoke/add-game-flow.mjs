import { TODAY_HOME, WIDTH, HEIGHT } from './dom.mjs';
import { nameOf } from './registry.mjs';
import { goRich } from './fixtures.mjs';
import { closedWithFocus, evalJSON, key, openAddGameFlow as openFlow, realTap, tap, typeIn, waitClosed } from './sheet-drive.mjs';
import { addGameFitChecks } from './add-game-fit.mjs';

/* #32's own guard (docs/specs/32-add-a-game.md, Proof seam 4): "add a game:
   three steps", RICH fixture, 390x844. It settles the acceptance items that
   are claims about the real screen -- 1 (full screen, step count, ✕), 2
   (Android back), 3 (step 1), 4 ("Use it" copies), 5 (step 2), 6 (step 3), 7
   (the discard ask) and 9 (the game lands on Today) -- by driving the app
   with real buttons and real keys, the shape `team-screen.mjs` already uses.

   Every expected string here is the spec's own ("New game", "1 of 3", "Who
   are you playing?", "11 players, 4 × 8, even minutes", "Absent", "Plan it"),
   never a second computation of what the app does. The numbers that are the
   fixture's rather than the spec's -- eleven players, two games already in
   the day -- are read from `fixtures.mjs` or measured before the action, so
   this file never hand-copies a count.

   One deviation from item 1, deliberate: it names `#actionbar` as the thing
   the flow has to cover, and `#actionbar` is `hidden` on Today (render.js:
   it belongs to the game screen). Covering a hidden element measures nothing
   (/new-guard rule 2a), so what is measured instead is the fixed chrome that
   IS on screen when the flow opens -- `.bar` -- through `elementFromPoint`,
   which is the same C10 claim against something that exists. */

/* `realTap` and `key`: Chrome refuses to let a `cancel` handler keep a dialog
   open unless the page has had a genuine interaction ("Blocked aborting a
   dialog because the user has not interacted with the page"), and BOTH the
   back-steps-through-the-flow handler (item 2) and the discard ask (item 7)
   are exactly that handler -- the same trap `team-screen.mjs` documents for
   the paste sheet, which is why both live in `sheet-drive.mjs` now (I6). */

/* Everything one round trip can answer about the open flow. `accName` is the
   accessible name the way the a11y pass reads one: `aria-label` first, then
   the visible text. */
const flowState = c => evalJSON(c, `(() => {
  const d = document.getElementById('addGameFlow');
  if (!d) return JSON.stringify({ exists: false, open: false });
  const r = d.getBoundingClientRect();
  const accName = n => n ? ((n.getAttribute('aria-label') || n.textContent || '').trim()) : null;
  const focusables = [...d.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
    .filter(n => !n.disabled && n.tabIndex !== -1 && n.getClientRects().length);
  const bar = document.querySelector('.bar');
  const br = bar ? bar.getBoundingClientRect() : null;
  const overBar = br && br.height
    ? (() => { const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
        return !!(hit && d.contains(hit)); })()
    : null;
  const prog = document.getElementById('agProg');
  const foot = document.getElementById('agFoot');
  const ask = document.getElementById('agAsk');
  return JSON.stringify({
    exists: true,
    open: d.open,
    box: { width: r.width, height: r.height, top: r.top, left: r.left },
    overBar,
    title: (d.querySelector('.flow-t')?.textContent || '').trim(),
    step: (document.getElementById('agStep')?.textContent || '').trim(),
    firstControl: accName(focusables[0]),
    segments: prog ? prog.children.length : null,
    segmentsOn: prog ? [...prog.children].filter(n => n.classList.contains('on')).length : null,
    onIndex: prog ? [...prog.children].findIndex(n => n.classList.contains('on')) : null,
    heading: (document.querySelector('#agBody h2')?.textContent || '').trim(),
    headingFocused: document.activeElement === document.querySelector('#agBody h2'),
    backShown: foot ? !document.getElementById('agBack').hidden : null,
    next: (document.getElementById('agNext')?.textContent || '').trim(),
    footShown: foot ? !foot.hidden : null,
    askShown: !!(ask && !ask.hidden),
    askTitle: ask ? (ask.querySelector('.bsheet-ask-t')?.textContent || '').trim() : null,
    askButtons: ask ? [...ask.querySelectorAll('button')].map(b => b.textContent.trim()) : [],
  });
})()`);

// The day's games, read out of state.js rather than out of the screen.
const dayGames = c => evalJSON(c, `(async () => {
  const s = await import('/state.js');
  return JSON.stringify(s.state.day.games.map(g => ({
    label: g.label, tipoff: g.tipoff, periods: g.periods, periodMinutes: g.periodMinutes,
    granMode: g.granMode, granValue: g.granValue, strategy: g.strategy,
    out: [...g.out].sort(), constraints: g.constraints, seed: g.seed,
    useCarryover: g.useCarryover,
  })));
})()`);

// #102's own "Same as <tip-off>?" title, read through `tipoffLabel` --
// storage.js's one time-label function, the same one `sameAsLast` (state.js)
// calls to build it -- rather than recomputed here with a second formatting
// call that could drift from the app's own locale/zero-pad rules.
const sameAsText = c => evalJSON(c, `(async () => {
  const s = await import('/state.js');
  const { tipoffLabel } = await import('/storage.js');
  const last = s.state.day.games.at(-1);
  return JSON.stringify(last.tipoff ? \`Same as \${tipoffLabel(last.tipoff)}?\` : 'Same as the last game?');
})()`);

/* Item 1: full screen over the chrome, "New game", "1 of 3", a ✕ named
   "Close" as the first control, and a three-segment progress bar with one
   segment on. */
async function opensFullScreen(c, ck) {
  await openFlow(c);
  const s = await flowState(c);
  if (!ck(s.exists, 'there is no #addGameFlow in the shell at all')) return false;
  if (!ck(s.open, '"Add a game" on Today opened no #addGameFlow')) return false;
  ck(Math.abs(s.box.width - WIDTH) <= 1 && Math.abs(s.box.height - HEIGHT) <= 1
    && Math.abs(s.box.top) <= 1 && Math.abs(s.box.left) <= 1,
    `the flow's box is ${Math.round(s.box.width)}×${Math.round(s.box.height)} at `
    + `(${Math.round(s.box.left)}, ${Math.round(s.box.top)}), want the whole ${WIDTH}×${HEIGHT} viewport (C10)`);
  ck(s.overBar === true, 'the app chrome (.bar) is still taking taps with the flow open -- it is not covering it (C10)');
  ck(s.title === 'New game', `the flow's header reads "${s.title}", want "New game"`);
  ck(s.step === '1 of 3', `the step count reads "${s.step}", want "1 of 3"`);
  ck(s.firstControl === 'Close',
    `the first control in the flow is named "${s.firstControl}", want "Close" (N8/C10: ✕ top left)`);
  ck(s.segments === 3, `the progress bar has ${s.segments} segment(s), want 3`);
  ck(s.segmentsOn === 1, `${s.segmentsOn} progress segment(s) are marked on, want exactly 1`);
  ck(s.onIndex === 0, `segment ${s.onIndex + 1} is marked on at step 1, want the first`);
  return true;
}

/* I9: `openAddGame` used to call `showModal()` straight, bypassing
   `openSheet` -- so nothing recorded `#todayAddGame` as the opener in
   `sheetTrigger`. Measured: Chrome's own native dialog focus restore still
   puts focus back on `#todayAddGame` regardless (it was the focused element
   when `showModal()` ran), so `focusBack` alone does not falsify this --
   what actually depends on `sheetTrigger` is `returnFocus`'s Safari-ring
   suppression (`data-noring`, trap.js), the same one every other sheet in
   the app gets on a pointer close. That is the real, falsifiable gap
   `rememberTrigger` closes. Nothing was typed, so ✕ closes at once with no
   ask in the way. */
async function focusReturnsToTrigger(c, ck) {
  await openFlow(c);
  await realTap(c, '#agClose');
  const r = await closedWithFocus(c, '#addGameFlow', '#todayAddGame');
  ck(r.closed, '✕ did not close the flow');
  ck(r.focusBack, 'focus is not back on #todayAddGame after the flow closes (I9)');
  ck(r.noring, 'closing the flow with a tap left no data-noring on #todayAddGame -- '
    + 'every other sheet suppresses the ring after a pointer close, this one draws it (I9)');
}

/* The step heading is a focus TARGET, not a control: `stepBody` gives it
   `tabIndex = -1` and `paintFlow` focuses it on every step change so the
   screen reader announces what the screen now asks. It never reaches the Tab
   order, so a ring on it is noise -- the coach did not put it there and
   cannot Tab to it. `.bsheet-hd-row h2:focus` already says exactly this for
   every bottom sheet in the app (#73 item 1/A1); the flow's own heading was
   simply never given the same rule, so the global `:focus-visible` outline
   painted a box around "Who are you playing?" the moment the flow opened.

   BOTH halves matter. `focused` is the anti-vacuity half: if the heading
   ever stops being focused, the ring question becomes unmeasurable and this
   check would pass having proved nothing, so it fails loudly instead. The
   ring half reads the two properties that can draw one -- `outline`, which
   is what the global rule uses, and `box-shadow`, which is what `.wel-h2`
   uses for the same job -- rather than testing `:focus-visible` matching,
   because what the coach sees is the paint, not the selector. */
async function headingDrawsNoRing(c, ck) {
  await openFlow(c);
  await readHeadingRing(c, ck, 'a tap');
  await realTap(c, '#agClose');
  await waitClosed(c, '#addGameFlow');

  // The keyboard path opens the same flow. Chrome decides `:focus-visible`
  // from the modality of the interaction that preceded the focus move, so a
  // heading focused after Enter is judged differently from the same heading
  // focused after a tap -- which is why a tap-only check reads clean over a
  // screen the coach sees a ring on.
  await tap(c, TODAY_HOME);
  // A real key press is what puts Chrome in keyboard modality; `.click()`
  // then runs the same `openAddGame` the button runs without a pointer event
  // resetting it. Dispatching Enter at the button instead does not work --
  // CDP delivers the key but Chrome synthesizes no activation from it.
  await key(c, 'Tab');
  await evalJSON(c, `(() => { document.querySelector('#todayAddGame').click(); return 'null'; })()`);
  await readHeadingRing(c, ck, 'the keyboard');
  // Nothing was typed either time, so ✕ closes at once and the checks after
  // this one start from a closed flow.
  await realTap(c, '#agClose');
  await waitClosed(c, '#addGameFlow');
}

async function readHeadingRing(c, ck, how) {
  const r = await evalJSON(c, `(() => {
    const h = document.querySelector('#agBody h2');
    if (!h) return JSON.stringify({ found: false });
    const cs = getComputedStyle(h);
    const a = document.activeElement;
    return JSON.stringify({
      found: true,
      open: !!document.getElementById('addGameFlow')?.open,
      active: a ? (a.id || a.tagName + '.' + a.className) : 'none',
      focused: a === h,
      text: (h.textContent || '').trim(),
      outline: cs.outlineStyle === 'none' ? '' : cs.outlineStyle + ' ' + cs.outlineWidth,
      shadow: cs.boxShadow === 'none' ? '' : cs.boxShadow,
    });
  })()`);
  ck(r.found, `the flow has no step heading to measure after opening with ${how}`);
  ck(r.focused, `the step heading is not the focused element after opening with ${how} -- `
    + `the ring check below would measure nothing (open=${r.open}, active=${r.active})`);
  ck(!r.outline, `opened with ${how}, the step heading "${r.text}" draws an outline ring `
    + `(${r.outline}) -- it is a focus target, not a control, and every bottom sheet `
    + 'heading is already exempt');
  ck(!r.shadow, `opened with ${how}, the step heading "${r.text}" draws a box-shadow ring `
    + `(${r.shadow})`);
}

/* A close request (Escape here, the back gesture on the phone) fires the
   dialog's `cancel` event whether or not the page has fresh interaction --
   measured against a bare `<dialog>` (see the `close`-listener comment in
   teams-view.js): what changes without one is that Chrome closes the dialog
   regardless of `preventDefault()`. So this is the real sequence a coach's
   thumb produces -- no priming tap between presses. */
async function backFromStep(c) {
  await key(c, 'Escape', 27);
}

/* Item 2: Android back. A close request that follows a real interaction --
   a tap, a Next -- steps back one, because the page still holds the
   activation Chrome's close watcher spends on it (I1, measured). A SECOND
   close request with nothing touched in between gets no such activation:
   Chrome force-closes the dialog outright rather than landing on the step
   before it, and no code here can veto that (I1's own finding). So this
   walks 3 -> 2 with the leftover activation from the second Next, taps to
   refresh it, steps 2 -> 1 the same way, and then proves the real (unprimed)
   sequence: a second press right behind the first force-closes rather than
   landing on step 1 -- and nothing is added to the day either way. */
async function backStepsThrough(c, ck) {
  const before = (await dayGames(c)).length;
  ck(before === 2, `the rich fixture's day holds ${before} game(s); this check is measuring the wrong record`);

  await realTap(c, '#agNext');
  await realTap(c, '#agNext');
  let s = await flowState(c);
  if (!ck(s.step === '3 of 3', `two taps of Next left the flow on "${s.step}", want "3 of 3"`)) return;
  ck(s.next === 'Plan it', `step 3's primary button reads "${s.next}", want "Plan it"`);
  ck(s.backShown === true, 'step 3 shows no "Back" button -- the gesture has no visible twin (I3)');

  await backFromStep(c);
  s = await flowState(c);
  ck(s.open && s.step === '2 of 3', `the browser's close request from step 3 left the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 2`);

  await realTap(c, '#agBody h2');
  await backFromStep(c);
  s = await flowState(c);
  ck(s.open && s.step === '1 of 3', `a close request with a fresh interaction left the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 1`);
  ck(s.backShown === false, 'step 1 still shows a "Back" button -- there is nothing behind it');

  // The real sequence: nothing touched between this press and the last one.
  await backFromStep(c);
  ck(await waitClosed(c, '#addGameFlow'),
    'a second close request right behind the first did not close the flow -- it should, since Chrome will not let this handler veto it (I1)');
  const after = (await dayGames(c)).length;
  ck(after === before, `backing out of the flow left ${after} game(s) in the day, want the ${before} it started with`);
}

/* I1's own finding: the close request that force-closes the dialog cannot be
   asked about first -- Chrome does not give the handler the chance. What the
   flow can still do is not lose what was typed: type an opponent, reach it
   with the same unvetoable back-to-back presses `backStepsThrough` proves
   close the dialog outright, and check that reopening shows "Panthers"
   still in the field rather than a blank one. */
async function forceCloseKeepsDraft(c, ck) {
  const before = (await dayGames(c)).length;
  await openFlow(c);
  await typeIn(c, '#agBody input[type=text]', 'Panthers');
  await realTap(c, '#agNext'); // a real interaction: the one close request this can veto
  await key(c, 'Escape', 27); // steps back to step 1, spending that activation
  await key(c, 'Escape', 27); // nothing touched since -- force-closes the dialog
  if (!ck(await waitClosed(c, '#addGameFlow'), 'two close requests in a row did not close the flow')) return;
  const after = (await dayGames(c)).length;
  ck(after === before, `the forced close left ${after} game(s) in the day, want the ${before} it started with`);

  await openFlow(c);
  const kept = await evalJSON(c, `JSON.stringify(document.querySelector('#agBody input[type=text]').value)`);
  ck(kept === 'Panthers', `reopening after a forced close shows the opponent field as "${kept}", want "Panthers" kept`);
  await realTap(c, '#agClose');
  await realTap(c, '#agDiscard');
  ck(await waitClosed(c, '#addGameFlow'), '"Discard" did not close the flow after resuming it');
}

/* What the current step's body holds: the labels of its fields, the names of
   its buttons, and its text with whitespace collapsed so a line can be looked
   for without caring which element carries it. */
const bodyState = c => evalJSON(c, `(() => {
  const b = document.getElementById('agBody');
  if (!b) return JSON.stringify({ text: '', fields: [], buttons: [] });
  const named = n => (n.getAttribute('aria-label')
    || [...(n.labels || [])].map(l => l.textContent).join(' ')
    || n.textContent || '').replace(/\\s+/g, ' ').trim();
  return JSON.stringify({
    text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
    fields: [...b.querySelectorAll('input[type=text], input[type=time]')].map(named),
    buttons: [...b.querySelectorAll('button')].map(named),
  });
})()`);

/* Item 3: step 1 asks the one thing that always differs (who we are playing),
   and offers the last game as a copy. The card's title carries the previous
   game's own tip-off, so it is read out of the day rather than typed here;
   the summary line is the spec's literal string for this fixture. */
async function stepOneReads(c, ck) {
  await openFlow(c);
  const s = await flowState(c);
  if (!ck(s.open && s.step === '1 of 3', 'reopening the flow did not land on step 1')) return;
  ck(s.heading === 'Who are you playing?',
    `step 1 asks "${s.heading}", want "Who are you playing?"`);
  ck(s.headingFocused, 'step 1 opened without moving focus to its question -- the screen changed under the coach');

  const b = await bodyState(c);
  ck(b.fields.join(' | ') === 'Opponent | Tip-off',
    `step 1's fields are labeled "${b.fields.join(' | ')}", want "Opponent | Tip-off"`);
  const sameAs = await sameAsText(c);
  ck(b.text.includes(sameAs),
    `step 1 shows no "${sameAs}" card over the last game (its body reads "${b.text.slice(0, 120)}")`);
  ck(b.text.includes('11 players, 4 × 8, even minutes'),
    `the card's summary line is missing "11 players, 4 × 8, even minutes" (body reads "${b.text.slice(0, 160)}")`);
  ck(b.buttons.includes('Use it'),
    `step 1 offers no "Use it" button; its buttons are ${JSON.stringify(b.buttons)}`);
}

/* The step 2 grid: one entry per tile, with the accessible name the way a
   screen reader would take it and the top of its box, which is what "three
   across" is actually a claim about. */
const tiles = c => evalJSON(c, `(() => JSON.stringify(
  [...document.querySelectorAll('#agBody .plr')].map(b => ({
    name: (b.getAttribute('aria-label') || '').trim(),
    text: (b.textContent || '').replace(/\\s+/g, ' ').trim(),
    pressed: b.getAttribute('aria-pressed'),
    top: Math.round(b.getBoundingClientRect().top),
  }))))()`);

// The roster the fixture actually loaded, so no count is hand-copied here.
const roster = c => evalJSON(c, `(async () => {
  const s = await import('/state.js');
  return JSON.stringify(s.state.players.map(p => ({ id: p.id, name: p.name, number: p.number })));
})()`);

/* Item 5: who is here, as tiles. The count line and the "Absent" naming are
   the spec's own strings; the number of tiles and the names on them come
   from the roster in the record. */
async function stepTwoReads(c, ck) {
  await realTap(c, '#agNext');
  const s = await flowState(c);
  if (!ck(s.step === '2 of 3', `Next from step 1 left the flow on "${s.step}"`)) return;
  ck(s.heading === "Who's here?", `step 2 asks "${s.heading}", want "Who's here?"`);

  const players = await roster(c);
  let t = await tiles(c);
  if (!ck(t.length === players.length,
    `step 2 draws ${t.length} tile(s) for a roster of ${players.length}`)) return;
  const rows = [...new Set(t.map(x => x.top))];
  ck(t.filter(x => x.top === rows[0]).length === 3,
    `the first row of tiles holds ${t.filter(x => x.top === rows[0]).length}, want 3 across`);
  const first = players[0];
  ck(t[0].name === first.name,
    `the first tile is named "${t[0].name}", want the roster's first player "${first.name}"`);
  for (const part of [first.number, ...first.name.split(' ')]) {
    ck(t[0].text.includes(part), `the first tile does not show "${part}" (it reads "${t[0].text}")`);
  }

  let b = await bodyState(c);
  ck(b.text.includes('11 of 11'), `step 2's count line is missing "11 of 11" (body reads "${b.text.slice(-80)}")`);

  await realTap(c, '#agBody .plr');
  t = await tiles(c);
  b = await bodyState(c);
  ck(b.text.includes('10 of 11'), `tapping a tile left the count at "${b.text.slice(-80)}", want "10 of 11"`);
  ck(t[0].pressed === 'false', `the tapped tile still reads aria-pressed="${t[0].pressed}"`);
  ck(t[0].name.includes('Absent'), `the absent tile is named "${t[0].name}", which does not say "Absent"`);

  await realTap(c, '#agBody .plr');
  t = await tiles(c);
  b = await bodyState(c);
  ck(b.text.includes('11 of 11'), `tapping the tile again did not restore the count (body reads "${b.text.slice(-80)}")`);
  ck(t[0].pressed === 'true' && !t[0].name.includes('Absent'),
    `tapping again left the tile "${t[0].name}" at aria-pressed="${t[0].pressed}"`);
}

/* Step 3's four cards and the switch under them. The descriptions are read
   out of `STRATEGIES` rather than typed here: the spec names that map as the
   single source of the wording, so a third copy written into the flow is the
   failure this is looking for, and a copy of the map in this file would be a
   fourth. The labels ARE typed, because the spec names those four words. */
const splitState = c => evalJSON(c, `(async () => {
  const { STRATEGIES } = await import('/state.js');
  const g = document.querySelector('#agBody [role=radiogroup]');
  const opts = g ? [...g.querySelectorAll('[role=radio]')] : [];
  const sw = document.querySelector('#agBody input[switch]');
  return JSON.stringify({
    group: !!g,
    options: opts.map(o => ({
      text: (o.textContent || '').replace(/\\s+/g, ' ').trim(),
      checked: o.getAttribute('aria-checked') === 'true',
    })),
    descriptions: Object.values(STRATEGIES),
    switchLabel: sw ? (sw.closest('label')?.textContent || '').replace(/\\s+/g, ' ').trim() : null,
    switchOn: sw ? sw.checked : null,
  });
})()`);

/* Item 6: how the minutes split. */
async function stepThreeReads(c, ck) {
  await realTap(c, '#agNext');
  const s = await flowState(c);
  if (!ck(s.step === '3 of 3', `Next from step 2 left the flow on "${s.step}"`)) return;
  ck(s.heading === 'How should minutes split?',
    `step 3 asks "${s.heading}", want "How should minutes split?"`);
  ck(s.next === 'Plan it', `step 3's primary button reads "${s.next}", want "Plan it"`);

  const sp = await splitState(c);
  if (!ck(sp.group && sp.options.length === 4,
    `step 3 draws ${sp.options.length} option(s) in ${sp.group ? 'a radiogroup' : 'no radiogroup'}, want 4`)) return;
  ['Even', 'By hand', 'Closers', 'Platoon'].forEach((w, i) => {
    ck(sp.options[i].text.startsWith(w),
      `option ${i + 1} reads "${sp.options[i].text}", want it to start with "${w}" -- #stratseg's own word`);
  });
  sp.descriptions.forEach((d, i) => {
    ck(sp.options[i].text.includes(d),
      `option ${i + 1} ("${sp.options[i].text}") does not carry its STRATEGIES line, "${d}"`);
  });
  const on = sp.options.filter(o => o.checked).length;
  ck(on === 1, `${on} of the four options are marked aria-checked, want exactly 1`);
  ck(sp.switchLabel === 'Even out earlier games',
    `the switch under the options is labeled "${sp.switchLabel}", want "Even out earlier games"`);
  ck(sp.switchOn === true, 'the "Even out earlier games" switch is off on a second game of the day, want it on');
}

// Where the app is looking, and which game it thinks is open.
const viewState = c => evalJSON(c, `(async () => {
  const s = await import('/state.js');
  return JSON.stringify({ view: s.state.view, activeGame: s.state.activeGame });
})()`);

/* Item 4: "Use it". The copy itself is `newGame`'s, characterized in
   test/add-game.test.js; what is settled here is that the button really does
   commit that draft and open it. */
async function useItCopies(c, ck) {
  const before = await dayGames(c);
  const prev = before.at(-1);
  await openFlow(c);
  await realTap(c, '#agBody .flow-card .btn');
  if (!ck(await waitClosed(c, '#addGameFlow'), '"Use it" did not close the flow')) return;

  const after = await dayGames(c);
  if (!ck(after.length === before.length + 1,
    `"Use it" left ${after.length} game(s) in the day, want ${before.length + 1}`)) return;
  const made = after.at(-1);
  for (const k of ['periods', 'periodMinutes', 'granMode', 'granValue', 'strategy']) {
    ck(made[k] === prev[k], `the new game's ${k} is ${JSON.stringify(made[k])}, want the last game's ${JSON.stringify(prev[k])}`);
  }
  ck(JSON.stringify(made.out) === JSON.stringify(prev.out),
    `the new game is out ${JSON.stringify(made.out)}, want the last game's ${JSON.stringify(prev.out)}`);
  ck(JSON.stringify(made.constraints) === JSON.stringify(prev.constraints),
    'the new game did not copy the last game\'s rules');
  ck(made.seed !== prev.seed, `the new game reuses seed ${made.seed} -- it is the same rotation over again`);
  ck(made.useCarryover === true, 'the new game is not evening out the earlier games of the day');

  const v = await viewState(c);
  ck(v.view === 'games' && v.activeGame === after.length - 1,
    `after "Use it" the app is on "${v.view}" with game ${v.activeGame} open, want the new game on "games"`);
}

/* Items 5 (the tapped tile's id lands in the game) and 6 ("Plan it" commits
   the chosen strategy and the switch's own state). */
async function planItCommits(c, ck) {
  const before = (await dayGames(c)).length;
  const players = await roster(c);
  await openFlow(c);
  await realTap(c, '#agNext');
  await realTap(c, '#agBody .plr');          // the first player is not here today
  await realTap(c, '#agNext');
  const want = await evalJSON(c, `(() => JSON.stringify({
    strat: [...document.querySelectorAll('#stratseg button[data-strat]')][2].dataset.strat }))()`);
  await realTap(c, '#agBody [role=radiogroup] [role=radio]:nth-child(3)');
  await realTap(c, '#agBody input[switch]');  // evening out, off
  await realTap(c, '#agNext');
  if (!ck(await waitClosed(c, '#addGameFlow'), '"Plan it" did not close the flow')) return;

  const after = await dayGames(c);
  if (!ck(after.length === before + 1,
    `"Plan it" left ${after.length} game(s) in the day, want ${before + 1}`)) return;
  const made = after.at(-1);
  ck(made.strategy === want.strat,
    `the new game's strategy is "${made.strategy}", want the "${want.strat}" option that was tapped`);
  ck(made.useCarryover === false, 'turning the "Even out earlier games" switch off did not reach the game');
  ck(made.out.includes(players[0].id),
    `${players[0].name} was tapped absent on step 2 but is not in the new game's out list`);
  const v = await viewState(c);
  ck(v.view === 'games' && v.activeGame === after.length - 1,
    `after "Plan it" the app is on "${v.view}" with game ${v.activeGame} open, want the new game on "games"`);
}

/* Item 7: nothing typed is thrown away without being asked about. */
async function discardAsks(c, ck) {
  const before = (await dayGames(c)).length;
  await openFlow(c);
  await typeIn(c, '#agBody input[type=text]', 'Panthers');
  await realTap(c, '#agClose');
  let s = await flowState(c);
  if (!ck(s.open, '✕ closed the flow over typed text with no ask at all')) return;
  ck(s.askShown && !s.footShown, 'the discard ask did not replace the footer');
  ck(s.askTitle === 'Discard this game?', `the ask reads "${s.askTitle}", want "Discard this game?"`);
  ck(s.askButtons.join(' | ') === 'Keep editing | Discard',
    `the ask offers ${JSON.stringify(s.askButtons)}, want ["Keep editing", "Discard"]`);

  await realTap(c, '#agKeep');
  s = await flowState(c);
  const typed = await bodyState(c);
  ck(s.open && !s.askShown && s.footShown, '"Keep editing" did not return to the flow');
  ck(await evalJSON(c, `JSON.stringify(document.querySelector('#agBody input[type=text]').value === 'Panthers')`),
    '"Keep editing" lost the typed opponent');
  ck(typed.fields.length === 2, 'the fields are gone after "Keep editing"');

  await realTap(c, '#agClose');
  await realTap(c, '#agDiscard');
  ck(await waitClosed(c, '#addGameFlow'), '"Discard" did not close the flow');
  const after = (await dayGames(c)).length;
  ck(after === before, `"Discard" left ${after} game(s) in the day, want the ${before} it started with`);
}

/* I2: the ask replaces the footer of whatever step is behind it -- it is not
   its own screen. Reach step 2, type an opponent-shaped answer there is
   nothing to lose over (typing only matters on step 1's fields, but the ask
   only asks about `draft.label`/`draft.tipoff`, both step 1 -- so type there),
   open the ask with ✕, then step back with the back gesture rather than
   answering it. `flowBack` repaints the body underneath for the earlier
   step; the ask has to go with it, or it strands over content it was never
   asked about. */
async function askDoesNotStrandOverRepaint(c, ck) {
  await openFlow(c);
  await typeIn(c, '#agBody input[type=text]', 'Panthers');
  await realTap(c, '#agNext');
  let s = await flowState(c);
  if (!ck(s.step === '2 of 3', `two-step setup left the flow on "${s.step}", want "2 of 3"`)) return;

  await realTap(c, '#agClose');
  s = await flowState(c);
  if (!ck(s.askShown, '✕ on step 2 did not open the discard ask')) return;

  await realTap(c, '#agBody h2'); // a real interaction, so the back gesture below can veto
  await key(c, 'Escape', 27);
  s = await flowState(c);
  ck(s.open && s.step === '1 of 3', `the back gesture left the flow ${s.open ? `on "${s.step}"` : 'closed'}, want step 1`);
  ck(!s.askShown && s.footShown,
    'the discard ask is still showing over step 1 -- it was asking about the step the back gesture just left (I2)');

  await realTap(c, '#agClose');
  await realTap(c, '#agDiscard');
  ck(await waitClosed(c, '#addGameFlow'), 'cleanup: "Discard" did not close the flow');
}

/* #102 (docs/specs/102-tip-off-time.md): the tip-off field is a real
   `input[type=time]`, and the pass it lands on reads the phone's own locale
   time, not the raw "HH:MM" the field stores. `tipoffLabel` is read out of
   the running `storage.js` for the "want" side too -- the one time-label
   function every display site (including this pass) calls -- so this proves
   the pass agrees with that function rather than with a second formatting
   guess written here. */
async function tipoffSetsAndReadsAsLocaleTime(c, ck) {
  const before = (await dayGames(c)).length;
  await openFlow(c);
  await typeIn(c, '#agBody input[type=text]', 'Comets');
  await typeIn(c, '#agBody input[type=time]', '19:30');
  await realTap(c, '#agNext');
  await realTap(c, '#agNext');
  await realTap(c, '#agNext');
  if (!ck(await waitClosed(c, '#addGameFlow'), '"Plan it" did not close the flow after setting a tip-off')) return;

  const after = await dayGames(c);
  if (!ck(after.length === before + 1,
    `setting a tip-off left ${after.length} game(s) in the day, want ${before + 1}`)) return;
  // Not `.at(-1)`: by this point the day also holds two untimed games from
  // `useItCopies`/`planItCommits` above, and a *timed* new game (#102's own
  // sort) lands ahead of them, not after -- so the new game is found by its
  // own label instead of assumed to be last.
  const made = after.find(g => g.label === 'Comets');
  if (!ck(made, `no game labeled "Comets" is in the day after setting a tip-off (day: ${JSON.stringify(after)})`)) return;
  ck(made.tipoff === '19:30', `the new game's tip-off is "${made.tipoff}", want "19:30"`);

  await tap(c, TODAY_HOME);
  const r = await evalJSON(c, `(async () => {
    const { tipoffLabel } = await import('/storage.js');
    const el = [...document.querySelectorAll('.pass-when')].at(-1);
    return JSON.stringify({ text: el ? el.textContent.trim() : null, want: tipoffLabel('19:30') });
  })()`);
  ck(r.text === r.want, `the new pass's tip-off reads "${r.text}", want tipoffLabel's own "${r.want}"`);
}

/* Item 9: the committed game is on Today, last in the day, reading the same
   summary `passSummary` gives for it. */
async function landsOnToday(c, ck) {
  await tap(c, TODAY_HOME);
  const seen = await evalJSON(c, `(async () => {
    const s = await import('/state.js');
    const btns = [...document.querySelectorAll('#todayGames .today-game')];
    const last = btns.at(-1);
    const i = s.state.day.games.length - 1;
    return JSON.stringify({
      passes: btns.length,
      games: s.state.day.games.length,
      summary: last?.querySelector('.pass-summary')?.textContent ?? null,
      want: s.passSummary(s.state.day.games[i], i),
    });
  })()`);
  ck(seen.passes === seen.games,
    `Today draws ${seen.passes} pass(es) for ${seen.games} game(s) in the day`);
  ck(seen.summary === seen.want,
    `the last pass on Today reads "${seen.summary}", want passSummary's "${seen.want}"`);
}


export async function addGameFlowPass(c, origin) {
  const problems = [];
  const ck = (cond, msg) => { if (!cond) problems.push(msg); return cond; };

  try {
    if (await opensFullScreen(c, ck)) {
      await backStepsThrough(c, ck);
      await stepOneReads(c, ck);
      await stepTwoReads(c, ck);
      await stepThreeReads(c, ck);
      // Nothing was typed on that walk through, so ✕ closes at once -- the
      // last three checks each want a flow of their own.
      await realTap(c, '#agClose');
      await waitClosed(c, '#addGameFlow');
      await headingDrawsNoRing(c, ck);
      await focusReturnsToTrigger(c, ck);
      await useItCopies(c, ck);
      await planItCommits(c, ck);
      await tipoffSetsAndReadsAsLocaleTime(c, ck);
      await discardAsks(c, ck);
      await askDoesNotStrandOverRepaint(c, ck);
      await forceCloseKeepsDraft(c, ck);
      await landsOnToday(c, ck);
      await addGameFitChecks(c, ck);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }

  // The flow commits games into the day, so put the fixture back the way
  // `goRich` left it for whatever runs next -- `team-screen.mjs`'s own rule.
  await goRich(c, origin).catch(() => {});

  return {
    name: nameOf('addgameflow'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 6).join(' | ')}`
      : 'three steps, the back gesture and the discard ask all hold',
  };
}
