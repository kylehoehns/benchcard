import { evalIn, step, SETTLE, WIDTH, HEIGHT, OVERFLOW_PROBE, DIALOG_OVERFLOW_PROBE, TODAY_HOME } from './dom.mjs';
import { VIEWS } from './sweep.mjs';
import { STATES } from './overlay.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './registry.mjs';
import { FOUR, reloadWithRecord } from './fixtures.mjs';

/* ---- the same large-text cell, on the app shell ----
 *
 * WHY IT EXISTS, and it is the uncomfortable part. The pass above covers seven
 * STATIC pages. `index.html` — the app, the page a coach actually uses — was
 * never checked at a large root at all: `sweepPass` walks 300–420px at the
 * DEFAULT font size, and the large-text cell only ever visited `DEAD_STATIC`.
 * So the app's own views were held to a lower standard than its marketing
 * pages, and a **228px** sideways pan on the games view was shippable the
 * whole time — `table.grid` measuring 675px in a 320px column at a 32px root.
 * Nothing was wrong with either existing check; the cell simply had no owner.
 *
 * SAME ONE CELL, for the same reason: 320px at a 32px root is where the app's
 * `19em` large-text block is live and the column is still short. Every screen
 * `VIEWS` names, because the five chromes differ and only one of them has to
 * be wrong — that is the lesson `sweepPass` already wrote down about deriving
 * a view list instead of enumerating one.
 *
 * ONE NAVIGATION, then the views are switched in the page. A font size cannot
 * be changed without a reload — `Page.setFontSizes` on a laid-out document
 * leaves it unreflowed and reports a width that was never rendered — but a
 * view switch reflows on its own, so the reload is paid once, not four times.
 *
 * FOLDS ARE LEFT AS THEY BOOT, unlike `touchPass`. Measured both ways when
 * this shipped: every screen reports identically with every `<details>`
 * forced open, because the app's folds hide their content with CSS rather than
 * by removing the box, so a closed fold's children still have rects and are
 * still swept. Opening them would cost a settle per screen for nothing.
 *
 * THE ALLOWANCES ARE PER VIEW, never blanket, and each number is the smallest
 * that covers a residue accepted deliberately, with its reason on the key.
 * A blanket tolerance
 * is what would have let the 228px through. Tighten one by 1px and it must go
 * red; if it does not, the number is decoration. Do NOT raise one to silence a
 * new failure — that is a bug on the screen the coach stands in front of. */
const APP_LARGE_TEXT_ALLOW = {
  /* EMPTY, and that is the finding, not an omission. Every screen measured
     clean in this cell once the three defects behind the 2026-08-24 report
     were fixed, so there is no residue to name and every one is pinned at
     zero. Add a key here only for a residue accepted deliberately, with the
     reason on the line and the smallest number that covers it — and tighten it
     by 1px first to prove the number is load-bearing. */
};
/* Every screen `VIEWS` names (Today plus the four it opens), plus BENCH
   MODE — which is the state this pass could not see and the one a coach is
   standing in when it matters most.
 *
 * `VIEWS` is `sweepPass`'s own list (#23), read here rather than kept a
 * second time, and game mode is not on it: it is a full-screen overlay
 * behind `#gmOpen`. Nothing in this harness had ever enumerated it at a
 * large root, and the measured consequence was `#gmNext2` — "Next stint",
 * the primary action of the screen a coach uses with the clock running —
 * sitting at left 349 in a 320px viewport with no pan available. Wholly off
 * screen, unreachable, and green in every check.
 *
 * The swap picker is here too because picking a player changes the layout of
 * the bench list underneath it, so it is a different measurement, not the same
 * screen with a class on it. Both close themselves so the pass leaves the app
 * on the games screen for whatever runs next. */
export const APP_LARGE_TEXT_STATES = [
  ...VIEWS,
  /* AND THE TEAM MENU OPEN, on Today: a native popover is its own box in the
     top layer, sized independently of the screen behind it, and none of the
     five `VIEWS` states above ever opens one. Reported from a real browser
     (#23 review): `.teammenu`'s `min-width: 14rem` beat its own `max-width`
     at a 32px root -- 448px against a 265.6px ceiling in a 320px viewport --
     and the menu overflowed on both axes, invisible to every other state
     here because closing a popover before moving to the next screen is what
     every other click in this file already does. */
  { name: 'team menu open', open: `${TODAY_HOME}; document.querySelector('#teamBtn')?.click()`,
    close: `document.querySelector('#teamMenu')?.hidePopover?.()` },
  { name: 'bench mode', open: `document.querySelector('#gmOpen').click()`,
    close: `document.querySelector('#gmClose').click()` },
  /* AND A TOAST, which this pass could not see either, for a different reason:
     the other states are static and a toast expires. It joins anyway because
     it is drivable — "Sit, rebalance" is two clicks from `#gmOpen`, its copy
     was the longest the app ever put in a toast until A35's sample flash (58
     characters against 86; the state at the foot of this list covers that one)
     and it is the only toast with a button squeezing the message — and because
     `UNDO_MS` is far longer than the settle, so it is still up when the probe
     runs.

     ITS OWN FAILURE IS VERTICAL, which is why `STRANDED_ABOVE` exists below:
     the toast box is anchored to the BOTTOM of the screen and grows upward, so
     a message squeezed to seven pixels wide by the buttons beside it made a
     568px box at y -160 and every horizontal probe in this harness called it
     clean.

     `close` takes the Undo rather than the dismiss, so the pass hands the next
     one an unmodified plan — and the undo path is exercised for free. */
  { name: 'bench mode, undo toast',
    open: `document.querySelector('#gmOpen').click();
           await new Promise(r => setTimeout(r, 400));
           document.querySelector('#gmFloor .gm-p').click();
           await new Promise(r => setTimeout(r, 400));
           [...document.querySelectorAll('#gamemode button')]
             .find(b => b.textContent.trim() === 'Sit, rebalance').click()`,
    close: `document.querySelector('.toast .tundo')?.click();
            await new Promise(r => setTimeout(r, 400));
            document.querySelector('#gmClose').click()` },
  { name: 'bench mode, swap picker',
    open: `document.querySelector('#gmOpen').click();
           document.querySelector('#gmFloor .gm-p').click()`,
    close: `document.querySelector('#gmClose').click()` },
  /* #24 item 4: the help sheet, the keyboard shortcuts dialog and the first
     tour step, none of which any state above this one opens. #27 item 10
     adds the Who's here sheet to the same reused list: a `dialog.bsheet` is
     a viewport-anchored overlay exactly like the ones this list already
     covers, and half-height (its default) is the shorter box, so a row near
     the bottom of a long roster is the one most likely to fall past either
     edge at a 32px root. Reused from `STATES` by reference rather than
     retyped, so the open/close scripts cannot drift between the two passes
     that drive them. #28 adds its own two: level 1, where the segment and
     every group sit at once, and Add a rule, its own level-2 page with the
     kind chips and the picker (a rule's detail needs a seeded rule, which
     this fixture does not carry, so it is left to `plan sheet` (smoke.mjs)
     the same way `sentence-sheets.mjs` covers what this pass cannot). */
  ...['help sheet', 'shortcuts sheet', 'tour, first step', 'team color picker', "who's here sheet",
      'plan sheet', 'plan sheet, add a rule']
    .map(n => STATES.find(s => s.name === n)),
  /* #26 item 12: "at 320px with 32px root text ... Today with FOUR has no
     horizontal overflow and nothing stranded above the viewport" -- every
     state above this one measures Today (and the other four chromes) on
     whatever `RICH`'s two-game record renders; none of them ever put four
     passes with their titles, tip-offs, status, summaries and mini rotations
     on screen at once, which is the case this claim is actually about.
     `reloadWithRecord` (`fixtures.mjs`) rather than an `open` script: a font
     size cannot be re-applied without a reload (see the file comment above),
     but `Page.setFontSizes`/`Emulation.setDeviceMetricsOverride` are already
     set for the whole pass, so a reload here keeps rendering at 320px/32px
     and lands back on Today (`reloadWithRecord` waits for `.today-game`).
     LAST OF THE NON-DESTRUCTIVE STATES, deliberately: it changes the loaded
     record, and the trio below either wipes it outright (`firstRun`,
     `tryLanding`) or is never reached again this run (`staticPass` is the
     only pass after this one and it navigates away from `index.html` for
     good) -- so nothing downstream needs `RICH` restored. */
  { name: 'today, FOUR', four: true },
  /* AND THE SIXTH CHROME: the welcome screen, the first thing a coach ever
     sees, and the one screen in the app this cell had never visited.
     `overlayPass` has audited it since it was written; this pass enumerates
     every screen `VIEWS` names and the welcome screen is not one of them —
     it is the screen you get INSTEAD of those five, with `.bar`, `.foot` and
     `#actionbar` all taken off the screen by `applyView`. A different chrome
     is exactly the argument this list already makes for game mode.

     It is reached by a REAL FIRST RUN — clear the record, reload — not by
     unhiding `#view-welcome` the way `overlayPass` forces it. Forcing leaves
     the games view laid out underneath and `OVERFLOW_PROBE` reports only the
     WORST element on the page, so a forced welcome screen would measure the
     games view and say "welcome screen" over it. That is the whole reason
     this entry costs a navigation.

     MUST STAY LAST, with the two states below it: it destroys the rich fixture.
     Nothing after it in this array would find `#gmOpen`, and `staticPass` (the
     only pass after this one) navigates away from `index.html` for good. */
  { name: 'welcome screen, first run', firstRun: true },
  /* AND THE FORM WITH THE SAMPLE IN IT (A49). A46 hid the roster form behind an
     "Enter my team" disclosure and this pass had to open it as its own state;
     A49 deleted the disclosure, so the state above sweeps the empty form for
     free again and what is worth a second state is the form FULL -- ten names
     in a textarea, the count line grown to "10 players. Ready.", and at 320px
     on 200% text that is the tallest this screen ever gets.

     A51 MOVED THE BUTTON, not the behavior: `#welTry` in the hero now opens
     the app (`loadSample`, which is what `?try=N` has always called) and the
     fill lives on `#welFill` inside the roster box, for the coach who is
     already typing. A52 then put the whole form behind `#welType`, so this
     state opens it first and the two clicks are the coach's real path: ask for
     the form, then fill it. The assertion is on the VALUES, because a state
     that quietly stops measuring something is the same shape as a guard that
     cannot fail -- if the fill silently stopped working this would go on
     sweeping an empty form and report clean.

     WHAT THIS REPLACED, DELIBERATELY AND NOT SILENTLY: a state that raised the
     sample flash, the longest copy the app puts in a toast (84 characters
     against the rebalance message's 58). That sentence survives only on the
     `?try=N` path now, which creates a team and lands on the games view, so it
     is out of reach of a states loop that does not navigate — which is what
     the state BELOW navigates for. `bench mode, undo toast` above measures a
     toast with a button in it; this one has none. */
  { name: 'welcome screen, sample filled',
    open: `document.querySelector('#welType').click();
           await new Promise(r => setTimeout(r, 200));
           document.querySelector('#welFill').click();
           await new Promise(r => setTimeout(r, 300));
           if (document.querySelector('#welRoster').value.split('\\n').filter(Boolean).length < 5
               || !document.querySelector('#welTeam').value.trim())
             throw new Error('the sample never filled the form -- this state measured an empty one')`,
    close: `document.querySelector('#welRoster').value = '';
            document.querySelector('#welTeam').value = '';
            document.querySelector('#welBack').click()` },
  /* AND THE SENTENCE THE STATE ABOVE STOPPED MEASURING (A50). The sample flash
     is the longest copy the app puts in a toast, and its whole job is telling a
     first-run coach how to undo the thing they just did — so 320px at 200% text
     is exactly where it has to be looked at, and after A49 nothing looked.

     IT IS A NAVIGATION, not a click, for two reasons. `?try=N` is the only path
     that still raises it (the six chart pages link in with their own roster
     size), and `initOnboarding` reads the parameter only while
     `state.onboarded` is false — so the record has to be wiped first, exactly
     as `firstRun` above wipes it and for the same on-new-document reason.

     THE FLASH'S OWN BOX IS ASSERTED, and that is the point of `tryLanding`
     rather than an `open` string. `OVERFLOW_PROBE` reports the WORST element on
     the page, so a state where the toast never appeared would sweep the games
     view underneath it and report clean — the same trap the forced welcome
     screen has above, and the reason a new state is worth less than no state
     when it can quietly measure nothing. So the arrival is checked with
     `checkVisibility`, the text is checked so it is THIS toast and not another,
     and its four edges are checked against the viewport before the generic
     probes run over the page around it.

     IT RACES A TIMER, deliberately and loudly. `flash()` has no button, so it
     dwells `UNDO_MS / 2` — 4.5s — and the boot plus settle ahead of the probe
     is well under a second. If that ever inverts, the visibility assertion
     fails and says so, which is the failure to want; the alternative is a state
     that measures a dismissed toast and calls it clean.

     LAST, with the two states above it: all three destroy the rich fixture, and
     this one leaves a sample team in the record. `staticPass` is the only pass
     after it and it navigates away from `index.html` for good. */
  { name: 'sample flash, ?try= landing', tryLink: 12 },
];
/* THE OTHER EDGE, and the one no probe in this file had. `OVERFLOW_PROBE`
 * answers "can the coach reach it sideways"; nothing answered "is it above the
 * top of the screen", and for a VIEWPORT-ANCHORED overlay that question has no
 * scrollbar to rescue it — content off the top of a fixed box is simply gone.
 *
 * That is exactly how a 275x568 toast at y -160 stayed green: `scrollWidth`,
 * `pans` and both horizontal edges were clean the whole time, and a coach at
 * 200% text was reading the rebalance message from its middle.
 *
 * SCOPED TO FIXED SUBTREES, not the whole page, because everywhere else a
 * negative `top` is just the page being scrolled. The toast itself is a static
 * child of a `position: fixed` container, so the walk has to go down from each
 * fixed root rather than test `position` on the element that overflows.
 *
 * Scrollable ancestors are skipped for the same reason `OVERFLOW_PROBE` skips
 * them: a scroller's content above its own top is one flick away. */
const STRANDED_ABOVE = `(() => {
  const roots = [...document.body.querySelectorAll('*')]
    .filter(el => getComputedStyle(el).position === 'fixed');
  let worst = null;
  const vis = el => el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true });
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if ((!r.width && !r.height) || r.top >= -1 || !vis(el)) continue;
      let n = el.parentElement, scrolls = false;
      while (n && n !== document.body) {
        const ov = getComputedStyle(n).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && n.scrollHeight > n.clientHeight + 1) { scrolls = true; break; }
        n = n.parentElement;
      }
      if (scrolls) continue;
      if (!worst || r.top < worst.top) worst = {
        el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
          + ((el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(c => '.' + c).join('')),
        top: Math.round(r.top),
      };
    }
  }
  return JSON.stringify({ host: location.host, worst });
})()`;

/* Wipe the record and reload, so the app puts up the welcome screen by its own
 * route (`setView` forces `welcome` while `state.onboarded` is false) instead
 * of the harness unhiding a `<main>`.
 *
 * A FIXTURE IS NOT A GUARD UNTIL SOMETHING FAILS WHEN IT DOES NOT ARRIVE —
 * same rule `fixturePass` is written under, and it bites harder here: if the
 * wipe or the reload silently did nothing, this state would measure the games
 * view a second time, report clean, and the cell it exists to cover would go
 * on being uncovered while reading green. So it asserts the screen arrived AND
 * that the app's chrome really came off, and it names both buttons — `#welTry`
 * is the one A35 added and the reason this cell was worth closing. */
export async function firstRun(c, origin) {
  /* CLEARING THE RECORD IN THE CURRENT DOCUMENT IS NOT ENOUGH, and the first
     draft of this that did so failed with all three keys back — which is why
     the precondition below exists. `browserChecks` registers an
     `addScriptToEvaluateOnNewDocument` that re-seeds `benchcard.v3` on EVERY
     document, so a wiped record is refilled before the app's first line runs
     and the reload lands on the games view. (`goRich`'s comment already says
     that write "still fires on every new document"; it is inert only because
     v6 wins the read order — with v6 gone it is the record.)

     So the wipe rides in a SECOND on-new-document script, added later and
     therefore run later, and it is removed again straight afterwards: leaving
     it registered would empty the record under `staticPass` too. The seed
     script is left alone, because `smoke-checks.js` reads
     `window.__SMOKE_VIEWPORT` out of it and `staticPass` still runs. */
  const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument',
    { source: `try { localStorage.clear(); } catch {}` });
  try {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && document.querySelector('#view-welcome')?.hidden !== false; i++)
        await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
  } finally {
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  const r = JSON.parse(await evalIn(c, `JSON.stringify({
    host: location.host,
    shown: document.querySelector('#view-welcome')?.hidden === false,
    bar: getComputedStyle(document.querySelector('.bar')).display,
    buttons: ['#welGo', '#welTry'].filter(s => document.querySelector(s)).length,
    seeded: Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('Smoke Test')),
  })`));
  const wrong = [
    r.shown ? null : '#view-welcome is still hidden',
    r.bar === 'none' ? null : `.bar is display: ${r.bar}, so the app chrome is still up`,
    r.buttons === 2 ? null : `${r.buttons} of the 2 welcome buttons are in the DOM`,
    r.seeded ? 'a seeded team survived the wipe' : null,
  ].filter(Boolean);
  if (wrong.length) throw new Error(`first run did not arrive on ${r.host}: ${wrong.join('; ')}`);
}

/* The exact sentence `onboarding.js` flashes on the `?try=N` landing. Pinned
   here as a PREFIX rather than the whole string: `test/sample-team.test.js`
   owns the wording (it fails if the sentence names a destination the nav does
   not offer), and a second copy of the full sentence in this file would make
   every copy edit a two-file edit for no extra coverage. What this needs to
   know is that the toast on screen is the sample flash and not some other
   toast that happened to be up. */
const FLASH_LEAD = 'Sample team loaded.';

/* The `?try=N` landing, which is the only path left that raises that flash.
 *
 * Wiped and navigated like `firstRun` above, for a reason that is one step
 * further on: `initOnboarding` reads the parameter only while
 * `state.onboarded` is false, and `browserChecks`'s on-new-document script
 * re-seeds `benchcard.v3` on every document — so without the wipe this would
 * land on the games view of a seeded team with no toast at all, and the state
 * would measure the games view a second time. Same removal afterwards, for the
 * same reason: left registered it would empty the record under `staticPass`.
 *
 * Returns the flash's measured box for the pass detail, and throws with what
 * it found if the flash is not on screen carrying its own sentence. */
export async function tryLanding(c, origin, n) {
  const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument',
    { source: `try { localStorage.clear(); } catch {}` });
  try {
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: `${origin}/index.html?try=${n}` });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('#toasts .toast .tmsg'); i++)
        await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);
  } finally {
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
  const r = JSON.parse(await evalIn(c, `(() => {
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const msg = document.querySelector('#toasts .toast .tmsg');
    const box = msg && msg.getBoundingClientRect();
    return JSON.stringify({
      host: location.host, vw, vh,
      games: document.querySelector('#view-games')?.hidden === false,
      /* The [data-id] filter is load-bearing: index.html paints a .tl-skel of
         bare .tl-row divs before the app boots, so a count without it is
         satisfied by the skeleton of a team that was never built. (No
         backticks in here: this whole probe is a template literal, and one
         closed it early -- ReferenceError: data is not defined.) */
      players: document.querySelectorAll('#timeline .tl-row[data-id]').length,
      text: msg && msg.textContent,
      /* NOT getClientRects().length — a box with rects can still be
         opacity: 0 or inside a content-visibility subtree. */
      seen: !!msg && msg.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true }),
      box: box && { l: Math.round(box.left), r: Math.round(box.right),
                    t: Math.round(box.top), b: Math.round(box.bottom),
                    w: Math.round(box.width), h: Math.round(box.height) },
    });
  })()`));
  const b = r.box;
  const wrong = [
    r.games ? null : 'the games view is not on screen, so the deep link never built the team',
    r.players === n ? null : `the plan holds ${r.players} players, not the ${n} the link asked for`,
    r.text ? null : 'there is no toast on screen — the flash never appeared, or it expired first',
    r.text && r.text.startsWith(FLASH_LEAD) ? null : r.text ? `the toast on screen is "${r.text}", not the sample flash` : null,
    !r.text || r.seen ? null : 'the flash is in the DOM but not visible',
    !b || (b.w > 0 && b.h > 0) ? null : 'the flash measures 0px',
    /* Its OWN edges, not the page's worst element: see the state's comment. */
    !b || b.l >= -1 ? null : `the flash starts at x ${b.l}, off the left edge`,
    !b || b.r <= r.vw + 1 ? null : `the flash reaches ${b.r}px in a ${r.vw}px viewport`,
    !b || b.t >= -1 ? null : `the flash starts at y ${b.t}, above the top of the screen`,
    !b || b.b <= r.vh + 1 ? null : `the flash ends at y ${b.b} in a ${r.vh}px viewport`,
  ].filter(Boolean);
  if (wrong.length) throw new Error(`?try=${n} on ${r.host}: ${wrong.join('; ')}`);
  return `${b.w}×${b.h} at y ${b.t}`;
}

/* #28 item 11: the two Plan-sheet states named in "What would settle it" get
   the dialog-relative probe too, on top of the viewport-relative one every
   state already gets above -- see `DIALOG_OVERFLOW_PROBE` (`dom.mjs`) for why
   a second probe is worth having even though the two agree today. Not every
   state: the other dialogs this pass already visits (`help sheet`,
   `shortcuts sheet`, `who's here sheet`, `team color picker`) are not this
   ticket's surface, and adding an assertion nobody asked to a screen nobody
   changed is exactly the "while I am in here" `AGENTS.md` rules out. */
const DIALOG_CHECKED_STATES = new Set(['plan sheet', 'plan sheet, add a rule']);

export async function appLargeTextPass(c, origin) {
  const problems = [];
  let allowed = 0;
  let flash = '';
  await c.send('Page.setFontSizes', { fontSizes: { standard: LARGE_TEXT_PX, fixed: LARGE_TEXT_PX } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: LARGE_TEXT_WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    const loaded = new Promise(ok => c.on('Page.loadEventFired', ok));
    await c.send('Page.navigate', { url: origin + '/index.html' });
    await loaded;
    await evalIn(c, `(async () => { await document.fonts.ready;
      for (let i = 0; i < 60 && !document.querySelector('.card'); i++) await new Promise(r => setTimeout(r, 50));
      await ${SETTLE}; })()`);

    for (const v of APP_LARGE_TEXT_STATES) {
      const where = `${v.name}@${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px text`;
      try {
        /* `SETTLE`, not `sweepPass`'s flat 500ms: the sweep pays that once per
           view and then measures 121 widths behind it, so the sleep is 0.4% of
           its cost; here it would be half the pass. Waiting on the animations
           themselves is both cheaper and stricter. */
        if (v.firstRun) await firstRun(c, origin);
        else if (v.tryLink) flash = await tryLanding(c, origin, v.tryLink);
        else if (v.four) await reloadWithRecord(c, origin, FOUR);
        else await evalIn(c, step(v.open));
        const o = JSON.parse(await evalIn(c, OVERFLOW_PROBE));
        const slack = APP_LARGE_TEXT_ALLOW[v.name] || 0;
        if (o.pans) problems.push(`${where}: page pans sideways`);
        if (o.worst && o.worst.out > slack) {
          problems.push(`${where}: ${o.worst.el} reaches ${o.worst.right}px in a ${o.vw}px viewport`
            + (slack ? ` (${slack}px allowed)` : ''));
        } else if (o.worst) allowed++;
        const up = JSON.parse(await evalIn(c, STRANDED_ABOVE));
        if (up.worst) problems.push(`${where}: ${up.worst.el} starts at y ${up.worst.top}, above the top of a fixed overlay`);
        if (DIALOG_CHECKED_STATES.has(v.name)) {
          const dd = JSON.parse(await evalIn(c, DIALOG_OVERFLOW_PROBE));
          // rule 2a of /new-guard: a check that measured nothing fails, rather
          // than passing silently because the dialog it expected never opened.
          if (!dd.dialog) problems.push(`${where}: no open dialog to check for a dialog-relative overflow`);
          else if (dd.worst) problems.push(`${where}: ${dd.worst.el} reaches ${dd.worst.out}px past the dialog's own ${dd.dw}px-wide box`);
        }
      } catch (e) {
        problems.push(`${where}: ${e.message.split('\n')[0]}`);
      } finally {
        if (v.close) await evalIn(c, step(v.close))
          .catch(e => problems.push(`${where}: did not close — ${e.message.split('\n')[0]}`));
      }
    }
  } finally {
    // Same rule as the pass above: never leave the emulated font size on.
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
  return {
    name: nameOf('applargetext'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${APP_LARGE_TEXT_STATES.length} states (${APP_LARGE_TEXT_STATES.map(v => v.name).join(' + ')}), nothing stranded past either side edge or above a fixed overlay`
        + (flash ? `, sample flash ${flash}` : '')
        + (allowed ? ` (${allowed} recorded residue)` : ''),
  };
}
