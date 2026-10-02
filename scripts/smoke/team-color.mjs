import { evalIn, step } from './dom.mjs';
import { RICH, withSecondTeam, TODAY_LANDING } from './fixtures.mjs';
import { land, reset } from './page-state.mjs';

/* #25 item 4 and item 7, together: with Royal active, the K1 controls read
 * the tint and nothing else on screen does; switching team changes them in
 * the same task, with no reload. Item 4 names two full lists (tinted,
 * unchanged) and this check proves both of them, not a sample of each —
 * see docs/specs/25-team-color.md's Proof section and the #59 review that
 * found the first cut of this file covering only six of the twelve tinted
 * elements and four of the sixteen unchanged ones.
 *
 * Expected colors are the spec's own table (docs/specs/25-team-color.md,
 * item 2), typed once here as `rgb()` strings -- never `tokens-css.mjs`'s
 * `contrast()` or any other route the app itself computes them through, so a
 * bug that reaches both the app and the computation this check trusted would
 * still be caught. Royal's light fill is `#2450D6` = rgb(36, 80, 214);
 * Royal's light label is white, per the ticket's survey ("every other light
 * fill clears 4.5:1 with a white label" -- Royal is not Hardwood or Gold);
 * Graphite's light fill is `#1C1C1E` = rgb(28, 28, 30), the value the
 * `--accent`-reading items of the "unchanged" list keep, because `--accent`
 * stays pinned to `--ink` (graphite-tokens.test.js, item 10). `--accent-soft`
 * (`::selection`'s token, `--ring`'s) is `rgba(28, 28, 30, .10)` at Graphite,
 * unchanged since #21 and read here the same way, for the same reason.
 *
 * A handful of the "unchanged" items below (`#setTeamHd`, the back button,
 * `#backBtn`'s icon, `.note` (#33 removed the footer link this used to be),
 * `.linkish`, and `.stage`'s glow) do not
 * read `--accent` at all -- they are secondary ink, a different neutral
 * token, or (`.stage`) a `color-mix()` this file cannot re-serialize by
 * hand -- so proving them unchanged means comparing the SAME element's
 * computed style before and after the team switch below, not a hand-typed
 * literal: a value this file invented would be a recomputation, not a fact
 * the spec states. The picker's `.color-opt.on` mark and the phrase style
 * read `--tint-soft` / `--tint` respectively, and only `--tint`'s own fill
 * has a spec literal (item 2) -- `--tint-soft` is an alpha the ticket leaves
 * to the implementation, so `.color-opt.on` is proved the same way: it must
 * CHANGE between the two states, where the unchanged set must not.
 *
 * `getComputedStyle` resolves color custom properties through the cascade
 * regardless of `[hidden]` / `display: none` -- confirmed against this app's
 * own overlay states -- so most elements below are read straight off the
 * static markup, with no dialog opened. Three groups of the tinted/unchanged
 * elements do not exist in static markup at all, though, and are handled the
 * two ways the #59 review named:
 *   - `.gm-p.picked`, `#gamemode .seg button.on`, "Sit for the rest" and
 *     `.gm-dot.now` are built by `renderGameMode()` only once bench mode is
 *     opened and a floor
 *     player picked -- the same navigation `overlay.mjs`'s "game mode, swap
 *     picker" state already drives -- so this check drives it too, once,
 *     read-only, and closes bench mode again before the team switch below.
 *   - `input[type=checkbox].box`, `.phrase` and `.tour-dots i.on` are CSS
 *     rules with no control wired to them yet in this app (the checkbox and
 *     phrase ship ahead of #27's control and sentence; the tour's dots exist
 *     only once `startTour()` runs). Each is proved on a probe element built
 *     with exactly the class chain its real selector names, inserted and
 *     removed in the same expression, per the #59 finding's own instruction.
 *   - The focus ring (`:focus-visible`) is a pseudo-CLASS, not a
 *     pseudo-element, so `getComputedStyle(el, ':focus-visible')` cannot
 *     read it and a script-only `el.focus()` does not satisfy Chromium's
 *     focus-visible heuristic (confirmed empirically against this app: a
 *     `.focus()` call left `:focus-visible` false). A real Tab keypress does,
 *     because it is dispatched through the DevTools protocol's `Input`
 *     domain rather than through script, so this check sends one.
 */
const ROYAL_FILL = 'rgb(36, 80, 214)';
const ROYAL_LABEL = 'rgb(255, 255, 255)';
const GRAPHITE_INK = 'rgb(28, 28, 30)';
const GRAPHITE_ACCENT_SOFT = 'rgba(28, 28, 30, 0.1)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/* Everything readable off the static markup (or a same-expression probe) in
 * one pass, run twice: once with Royal active, once after the switch to the
 * Graphite team. `$` is scoped to the page, not this module. */
const READ_COLORS = `(() => {
  const $ = s => document.querySelector(s);
  const bg = s => { const e = $(s); return e ? getComputedStyle(e).backgroundColor : null; };
  const fg = s => { const e = $(s); return e ? getComputedStyle(e).color : null; };
  return JSON.stringify({
    // Fix pass finding 2: scoped to #print, not the bare '.btn.primary' this
    // used to be. #gmOpen (#141) now also carries .btn.primary and sits
    // earlier in the DOM, so the bare selector silently started resolving to
    // #gmOpen instead -- #print's own tint went unchecked with no test ever
    // going red. #print is the card sheet's own Print button, which is what
    // this reads by name everywhere else in this file (the Graphite re-check
    // below reuses this same expression).
    primaryBg: bg('#print.btn.primary'), primaryFg: fg('#print.btn.primary'),
    abMainBg: bg('#abBench'), gmNavNextBg: bg('#gmNext2'),
    segOnFg: fg('#maxSubsSeg button.on'),
    // #29 decision 3: \`#showMinutes\` moved into the card sheet's row list and
    // took decision 12's \`input[switch]\` component (the sheet-row switch
    // already established elsewhere) rather than the older \`.switch input\`
    // pair -- \`var(--tint)\` now paints \`input[switch]:checked::before\`, a
    // pseudo-element, not the input's own background, same shape as
    // \`dotNowBg\` below.
    switchBg: (() => { const e = $('#showMinutes'); return e ? getComputedStyle(e, '::before').backgroundColor : null; })(),
    helpHFg: fg('.help-h'), teamCheckFg: fg('.teammenu-check'),
    setTeamHdFg: fg('#setTeamHd'), backBtnFg: fg('#backBtn'),
    // item 4 tinted, the rest of the list: the welcome screen's
    // still-in-the-DOM segmented tab. The Sub interval sheet's selected row
    // is read separately (READ_SHEET below) -- it only exists once the sheet
    // is open (#27 replaced #gran with it).
    welSegFg: fg('#welTabPlan'),
    // the picker's current mark -- --tint-soft, no spec literal, so this is
    // read on both passes and compared for INEQUALITY below, not to a value.
    colorOptOnBg: bg('#colorOpts .color-opt.on'),
    // item 4 unchanged, the rest of the list: the minute-bar fill, the first
    // .note in document order (the welcome screen's "No account..." line --
    // #33 removed the footer link this used to read, but .note shares its
    // color: var(--muted) rule) and the paste-box's own .linkish, #backBtn's
    // icon (secondary ink, not --accent, so read for the invariant
    // comparison below rather than a literal), the logo mark on the welcome
    // screen, and the card preview's glow (.stage, card.css -- also read for
    // the invariant comparison, since its color-mix() output cannot be
    // hand-typed without re-deriving what the browser computes). #142
    // retired Settings' own uppercase-accent .set-h heading -- every
    // section header is h2.pgrp-h now, --muted like every other one.
    mrowBg: bg('.mrow .track i'),
    footFg: fg('.note'), linkishFg: fg('#welRestore'),
    iconFg: (() => { const e = $('#backBtn svg'); return e ? getComputedStyle(e).color : null; })(),
    logoFill: (() => { const e = $('.wel-mark svg > rect:first-child'); return e ? getComputedStyle(e).fill : null; })(),
    stageBg: (() => { const e = $('.stage'); return e ? getComputedStyle(e).backgroundImage : null; })(),
    // ::selection: a per-element cascaded style CSSOM lets you read without
    // any text actually being selected -- confirmed empirically, so this
    // needs no selection to be made in the page.
    selectionBg: getComputedStyle(document.body, '::selection').backgroundColor,
    // a plain, unclassed input satisfies the app's generic
    // \`input:focus, select:focus, textarea:focus\` rule (app.css) without
    // needing a real control on screen -- \`:focus\` triggers on a script
    // \`.focus()\` call, unlike \`:focus-visible\` below.
    inputFocusBorder: (() => {
      const p = document.createElement('input');
      document.body.appendChild(p); p.focus();
      const v = getComputedStyle(p).borderColor;
      p.remove();
      return v;
    })(),
    // probes: no control in this app wires these classes to a live element
    // yet (see the file comment), so each is built with exactly the class
    // chain its real selector names and thrown away in the same expression.
    checkboxBoxBg: (() => {
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.className = 'box'; cb.checked = true;
      document.body.appendChild(cb);
      const v = getComputedStyle(cb).backgroundColor;
      cb.remove();
      return v;
    })(),
    phraseFg: (() => {
      const p = document.createElement('span'); p.className = 'phrase'; p.textContent = 'x';
      document.body.appendChild(p);
      const v = getComputedStyle(p).color;
      p.remove();
      return v;
    })(),
    phraseDecoration: (() => {
      const p = document.createElement('span'); p.className = 'phrase'; p.textContent = 'x';
      document.body.appendChild(p);
      const v = getComputedStyle(p).textDecorationColor;
      p.remove();
      return v;
    })(),
    tourDotOnBg: (() => {
      const d = document.createElement('div'); d.className = 'tour-dots';
      const i = document.createElement('i'); i.className = 'on';
      d.appendChild(i); document.body.appendChild(d);
      const v = getComputedStyle(i).backgroundColor;
      d.remove();
      return v;
    })(),
    tlTotHiFg: (() => {
      const t = document.createElement('div'); t.className = 'tl-tot hi';
      document.body.appendChild(t);
      const v = getComputedStyle(t).color;
      t.remove();
      return v;
    })(),
  });
})()`;

/* `.gm-p.picked`, `#gamemode .seg button.on`, "Sit for the rest" and
 * `.gm-dot.now` only exist once bench mode is open with a floor player
 * picked -- the same navigation
 * `overlay.mjs`'s "game mode, swap picker" state drives (`$('#gmOpen').click();
 * $('#gmFloor .gm-p').click()`). Read-only: closed again before the team
 * switch below, so it leaves the fixture exactly as its last `land` set it
 * up, the same courtesy every other rich-fixture pass in this suite pays. */
/* #27 item 11: `#gran` is gone -- the Sub interval sheet's own selected row
 * is the replacement "a real chip, present whether the fold is open" this
 * check named. It only exists once the sheet is opened (sheet bodies paint
 * on open), so this is read, then the sheet is closed again, before
 * `READ_COLORS` runs -- same courtesy `READ_GAME_MODE` pays bench mode.
 *
 * #143 moved the chosen row from a `--tint` fill to a transparent
 * background with a `.prow-check` mark in `--ink` -- so this now belongs on
 * the UNCHANGED side of the ledger (below), not the tinted one: the row's
 * own background stays transparent and its mark stays ink on every team
 * color, Royal included. */
const READ_SHEET = `(() => {
  const row = [...document.querySelectorAll('#sheetInterval .prow')]
    .find(r => r.getAttribute('aria-pressed') === 'true');
  const mark = row ? row.querySelector('.prow-check') : null;
  return JSON.stringify({
    chipBg: row ? getComputedStyle(row).backgroundColor : null,
    markFg: mark ? getComputedStyle(mark).color : null,
  });
})()`;

// #138 moved the selected floor row's outline from a border to an inset
// box-shadow (app.css: .gm-p.picked's box-shadow is inset 0 0 0 2px
// var(--tint)), so the tint now paints there, not in borderColor.
//
// #147 item 3/8: the scope toggle is the shared `.seg` now (no `.gm-scope`
// look survives), scoped to `#gamemode` since `.seg` also appears elsewhere
// on the page (`#maxSubsSeg`, read separately below as `r.segOnFg`). "Sit for
// the rest" no longer carries `.act` -- it is a plain `.btn` sibling found by
// its own text, the same way `bench-details.mjs` finds it.
const READ_GAME_MODE = `(() => {
  const $ = s => document.querySelector(s);
  const gp = $('#gamemode .gm-p.picked');
  const on = $('#gamemode .seg button.on');
  const sit = [...document.querySelectorAll('#gmBenchLab button')].find(b => b.textContent.trim() === 'Sit for the rest');
  const dot = $('.gm-dot.now');
  return JSON.stringify({
    pickedShadowColor: gp ? (getComputedStyle(gp).boxShadow.match(/rgba?\\([^)]+\\)/) || [null])[0] : null,
    scopeOnFg: on ? getComputedStyle(on).color : null,
    sitBg: sit ? getComputedStyle(sit).backgroundColor : null,
    dotNowBg: dot ? getComputedStyle(dot, '::before').backgroundColor : null,
  });
})()`;

export async function teamColorPass(c, origin) {
  const problems = [];
  try {
    const base = JSON.parse(JSON.stringify(RICH));
    base.view = 'today';
    base.teams[0].settings = { color: 'royal' };
    const record = withSecondTeam(base);
    record.teams[1].settings = { color: 'graphite' };
    await land(c, origin, { record: record, ...TODAY_LANDING });

    await evalIn(c, step(`$('#gmOpen').click(); $('#gmFloor .gm-p').click()`));
    const gm = JSON.parse(await evalIn(c, READ_GAME_MODE));
    await evalIn(c, step(`$('#gmClose').click()`));

    await evalIn(c, step(`document.querySelector('#phraseInterval').click()`));
    const sheet = JSON.parse(await evalIn(c, READ_SHEET));
    await evalIn(c, step(`document.querySelector('#sheetInterval').close()`));

    /* The focus ring (`:focus-visible`, app.css) is a global rule, not tied
     * to any one control, so this proves it against whatever control a real
     * Tab keypress lands the focus on -- see the file comment for why a
     * script `.focus()` will not do. A probe input, prepended so Tab moves
     * INTO the page rather than out of it toward the (nonexistent, headless)
     * chrome, gives the keypress somewhere known to start from. */
    await evalIn(c, `(() => { const p = document.createElement('input'); p.id = '__focusProbe';
      document.body.prepend(p); p.focus(); })()`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab' });
    const focusRing = JSON.parse(await evalIn(c, `(() => {
      const el = document.activeElement;
      const v = { visible: el.matches(':focus-visible'), outline: getComputedStyle(el).outlineColor };
      document.getElementById('__focusProbe')?.remove();
      return JSON.stringify(v);
    })()`));
    if (!focusRing.visible) problems.push('the Tab-key probe did not land in a :focus-visible state — the focus-ring check proved nothing');
    else if (focusRing.outline !== GRAPHITE_INK) {
      problems.push(`the focus ring is ${focusRing.outline} with Royal active, want ${GRAPHITE_INK} (unchanged)`);
    }

    const r = JSON.parse(await evalIn(c, READ_COLORS));

    const tinted = [
      ['#print.btn.primary background', r.primaryBg, ROYAL_FILL],
      ['#print.btn.primary label', r.primaryFg, ROYAL_LABEL],
      ['.ab-main (#abBench) background', r.abMainBg, ROYAL_FILL],
      ['.gm-nav.next (#gmNext2) background', r.gmNavNextBg, ROYAL_FILL],
      ['.seg button.on (#maxSubsSeg) text', r.segOnFg, ROYAL_FILL],
      ['input[switch]:checked::before (#showMinutes) background', r.switchBg, ROYAL_FILL],
      ['.seg button[aria-selected=true] (#welTabPlan) text', r.welSegFg, ROYAL_FILL],
      ['input[type=checkbox].box:checked background', r.checkboxBoxBg, ROYAL_FILL],
      ['.gm-p.picked box-shadow color', gm.pickedShadowColor, ROYAL_FILL],
      ['#gamemode .seg button.on text', gm.scopeOnFg, ROYAL_FILL],
      ['.phrase text', r.phraseFg, ROYAL_FILL],
      // #244 moved the welcome logo here from #25's unchanged list: it reads
      // --tint now, like the welcome's orange phrase.
      ['the logo ground (.wel-mark svg > rect:first-child) fill', r.logoFill, ROYAL_FILL],
    ];
    for (const [label, got, want] of tinted) {
      if (got !== want) problems.push(`${label} is ${got} with Royal active, want ${want}`);
    }
    // #147 item 3/8: "Sit for the rest" is a plain `.btn` now (a surface
    // fill), not `.btn.primary` and not filled with the tint or `--accent`
    // (C2: the one filled button on this screen is ›/Finish game) -- pinned
    // as NOT tint-filled, rather than to a literal background color, since
    // `.btn`'s own fill token is not this spec's to re-derive here. A `null`
    // (the button not found at all) must fail too, not pass by accident
    // (`null !== ROYAL_FILL` would otherwise read as "not tint-filled").
    if (gm.sitBg == null) {
      problems.push('"Sit for the rest" was not found in #gmBenchLab while reading its background');
    } else if (gm.sitBg === ROYAL_FILL) {
      problems.push(`"Sit for the rest" background is ${gm.sitBg}, the same as the Royal tint -- it must not read tint-filled`);
    }
    // item 5: Graphite's phrase carries an underline, every other color's
    // does not (`--phrase-line` goes transparent) -- Royal is "every other
    // color", so this is the one item-4 "tinted" entry proved by a state a
    // literal cannot name (no-underline) rather than a value.
    if (r.phraseDecoration !== TRANSPARENT) {
      problems.push(`.phrase has a visible underline (${r.phraseDecoration}) with Royal active, want none`);
    }

    const accentInk = [
      ['.help-h', r.helpHFg], ['.teammenu-check', r.teamCheckFg],
      ['.mrow .track i (minute bar) background', r.mrowBg],
      ['.gm-dot.now background', gm.dotNowBg],
      ['::selection background', r.selectionBg, GRAPHITE_ACCENT_SOFT],
      ['a focused input’s border', r.inputFocusBorder],
    ];
    for (const [label, got, want = GRAPHITE_INK] of accentInk) {
      if (got !== want) problems.push(`${label} is ${got} with Royal active, want ${want} (unchanged)`);
    }
    // the tour's dots and a timeline total over budget both read `--accent`
    // too, but only exist once the tour has started / a game runs over --
    // proved on probes built with the real selector chain, same rule as
    // `.phrase` and the checkbox above.
    if (r.tourDotOnBg !== GRAPHITE_INK) problems.push(`.tour-dots i.on is ${r.tourDotOnBg} with Royal active, want ${GRAPHITE_INK} (unchanged)`);
    if (r.tlTotHiFg !== GRAPHITE_INK) problems.push(`.tl-tot.hi is ${r.tlTotHiFg} with Royal active, want ${GRAPHITE_INK} (unchanged)`);
    // #143: the Sub interval sheet's chosen row is a check, not a fill --
    // its background stays transparent and its mark stays ink on every team
    // color, so both belong on the unchanged side now.
    if (sheet.chipBg !== TRANSPARENT) {
      problems.push(`the chosen row's background (#sheetInterval) is ${sheet.chipBg} with Royal active, want ${TRANSPARENT} (a check, not a fill)`);
    }
    if (sheet.markFg !== GRAPHITE_INK) {
      problems.push(`the chosen row's check (#sheetInterval) is ${sheet.markFg} with Royal active, want ${GRAPHITE_INK} (ink, not the team tint)`);
    }

    // item 7: switching team (team menu's second entry, the Graphite one)
    // changes `.btn.primary` in the same task, with no reload. Re-read
    // everything, both to check the switch and to prove the tokens the spec
    // gives no literal for (`#setTeamHd`, the back button, its icon,
    // `.note`, `.linkish`, `.stage`'s glow) are the same color on the
    // Graphite team as they were on Royal, and that the picker's mark and
    // the phrase style, which DO read the tint, changed.
    await evalIn(c, step(`document.querySelectorAll('#teamMenu .teammenu-item')[1]?.click()`));
    const a = JSON.parse(await evalIn(c, READ_COLORS));
    if (a.primaryBg !== GRAPHITE_INK) {
      problems.push(`#print.btn.primary background is ${a.primaryBg} after switching to the Graphite team, `
        + `want ${GRAPHITE_INK} — no reload happened in between`);
    }
    const invariant = [
      ['#setTeamHd', r.setTeamHdFg, a.setTeamHdFg], ['back button (#backBtn)', r.backBtnFg, a.backBtnFg],
      ['#backBtn’s icon', r.iconFg, a.iconFg], ['.note', r.footFg, a.footFg],
      ['.linkish (#welRestore)', r.linkishFg, a.linkishFg], ['.stage (card.css) glow', r.stageBg, a.stageBg],
    ];
    for (const [label, before, afterVal] of invariant) {
      if (before !== afterVal) {
        problems.push(`${label} is ${before} with Royal active and ${afterVal} with Graphite active — `
          + 'it should not read the team color at all');
      }
    }
    // the inverse of the invariant list: these two DO read the tint, so they
    // must NOT be the same color on both teams.
    if (r.colorOptOnBg === a.colorOptOnBg) {
      problems.push(`the picker's current mark is ${r.colorOptOnBg} on both Royal and Graphite — it should read the active team's tint`);
    }
    if (r.phraseFg === a.phraseFg) {
      problems.push(`.phrase is ${r.phraseFg} on both Royal and Graphite — it should read the active team's tint`);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'Royal tints all twelve of item 4’s controls and the welcome logo (#244), the rest of the unchanged list stays graphite ink, '
        + 'and switching to a graphite team repaints .btn.primary with no reload',
  };
}

/* #205's own guard (docs/specs/205-hardwood-default.md's Proof section): a
 * new team starts in Hardwood, and a saved Graphite stays Graphite. Hardwood
 * light's fill and label are the spec's own literals (item "What would
 * settle it" preamble); Graphite's is `GRAPHITE_INK`, already typed above
 * for `teamColorPass`, never re-derived. */
const HARDWOOD_FILL = 'rgb(210, 80, 10)';
const HARDWOOD_LABEL = 'rgb(0, 0, 0)';

/* Everything one round trip reads about the team color, off static markup --
 * `getComputedStyle` resolves the cascade regardless of `[hidden]`, same fact
 * `READ_COLORS` above already relies on, so none of this needs Settings on
 * screen to read `#print`, and only needs it open to read `#teamColorName`
 * and the picker's own mark (both painted by `renderSettings` at every
 * boot, not just while Settings is showing). */
const READ_TEAM_DEFAULT = `(() => {
  const $ = s => document.querySelector(s);
  const opts = [...document.querySelectorAll('#colorOpts .color-opt')];
  const on = opts.find(b => b.classList.contains('on'));
  const primary = $('#print.btn.primary');
  return JSON.stringify({
    tint: document.documentElement.getAttribute('data-tint'),
    primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
    teamColorName: ($('#teamColorName') || {}).textContent || null,
    colorOptOn: on ? on.dataset.color : null,
    firstColor: opts[0] ? opts[0].dataset.color : null,
    secondColor: opts[1] ? opts[1].dataset.color : null,
  });
})()`;

const READ_WELCOME_COLOR = `(() => {
  const e = document.getElementById('welStart');
  return JSON.stringify({
    tint: document.documentElement.getAttribute('data-tint'),
    bg: e ? getComputedStyle(e).backgroundColor : null,
    fg: e ? getComputedStyle(e).color : null,
  });
})()`;

/* A plain landing on the page already loaded, seeding nothing --
 * the "no re-seeding" reload item 6 asks for, proving the color a coach
 * picked (or already had saved) survives the app's own write, not this
 * file's. `#print` is real markup on the games view (never built on demand),
 * so waiting for it is waiting for the boot to finish. `land`
 * with `record: 'kept'` is that reload; it waits for `#print` rather than
 * its default `.card`, since this reload lands on the games view, not a
 * screen with a card. */
async function plainReload(c, origin) {
  await land(c, origin, { record: 'kept', ready: `document.querySelector('#print')` });
}

export async function teamDefaultPass(c, origin) {
  const problems = [];
  try {
    // Step 1 / item 3: storage cleared, no record at all -- the pre-paint
    // script and the boot both land on Hardwood before app.js has run. A
    // wiped device has no saved theme, so `ui.theme` resolves 'auto' against
    // the host's own `prefers-color-scheme`; forced light here so the read
    // matches the spec's light-mode literals, same fix `game-rows-fit.mjs`
    // and `first-run-flow.mjs` already apply for the same reason.
    await land(c, origin, {
      record: 'wiped',
      media: [{ name: 'prefers-color-scheme', value: 'light' }],
      ready: `!document.getElementById('view-welcome').hidden`,
    });
    const w = JSON.parse(await evalIn(c, READ_WELCOME_COLOR));
    if (w.tint !== 'hardwood') problems.push(`a fresh device stamps data-tint="${w.tint}" on <html>, want "hardwood"`);
    if (w.bg !== HARDWOOD_FILL) problems.push(`#welStart background is ${w.bg} on a fresh device, want ${HARDWOOD_FILL}`);
    if (w.fg !== HARDWOOD_LABEL) problems.push(`#welStart text is ${w.fg} on a fresh device, want ${HARDWOOD_LABEL}`);

    // Step 2 / items 5 and 2: RICH has no settings block at all, so a coach
    // who has never chosen a color sees Hardwood, and the picker lists it
    // first.
    await land(c, origin, { record: RICH, ready: `document.getElementById('print')`, freshHistory: true });
    const r = JSON.parse(await evalIn(c, READ_TEAM_DEFAULT));
    if (r.tint !== 'hardwood') problems.push(`RICH (no color set) stamps data-tint="${r.tint}", want "hardwood"`);
    if (r.primaryBg !== HARDWOOD_FILL) problems.push(`#print.btn.primary is ${r.primaryBg} for RICH, want ${HARDWOOD_FILL}`);
    if (r.teamColorName !== 'Hardwood') problems.push(`#teamColorName reads "${r.teamColorName}" for RICH, want "Hardwood"`);
    if (r.colorOptOn !== 'hardwood') problems.push(`#colorOpts .color-opt.on is "${r.colorOptOn}" for RICH, want "hardwood"`);
    if (r.firstColor !== 'hardwood' || r.secondColor !== 'graphite') {
      problems.push(`the picker's first two options are "${r.firstColor}", "${r.secondColor}", want "hardwood", "graphite"`);
    }

    // Step 3 / item 6: a saved Graphite stays Graphite, and survives a plain
    // reload with nothing re-seeded.
    const graphiteTeam = { ...RICH.teams[0], settings: { color: 'graphite' } };
    await land(c, origin, { record: { ...RICH, teams: [graphiteTeam] }, ready: `document.getElementById('print')`, freshHistory: true });
    for (const label of ['seeded', 'reloaded']) {
      if (label === 'reloaded') await plainReload(c, origin);
      const g = JSON.parse(await evalIn(c, READ_TEAM_DEFAULT));
      if (g.tint !== null) problems.push(`a saved Graphite team stamps data-tint="${g.tint}" (${label}), want no attribute`);
      if (g.primaryBg !== GRAPHITE_INK) problems.push(`#print.btn.primary is ${g.primaryBg} for a saved Graphite team (${label}), want ${GRAPHITE_INK}`);
      if (g.teamColorName !== 'Graphite') problems.push(`#teamColorName reads "${g.teamColorName}" for a saved Graphite team (${label}), want "Graphite"`);
    }

    // Step 4 / item 6's last sentence: picking Graphite in the picker on a
    // Hardwood team, then reloading, gives the same three results.
    await land(c, origin, { record: RICH, ready: `document.getElementById('print')`, freshHistory: true });
    await evalIn(c, step(`document.getElementById('settingsBtn').click()`));
    await evalIn(c, step(`document.getElementById('teamColorBtn').click()`));
    await evalIn(c, step(`document.querySelector('#colorOpts .color-opt[data-color="graphite"]').click()`));
    await plainReload(c, origin);
    const picked = JSON.parse(await evalIn(c, READ_TEAM_DEFAULT));
    if (picked.tint !== null) problems.push(`picking Graphite then reloading stamps data-tint="${picked.tint}", want no attribute`);
    if (picked.primaryBg !== GRAPHITE_INK) problems.push(`#print.btn.primary is ${picked.primaryBg} after picking Graphite and reloading, want ${GRAPHITE_INK}`);
    if (picked.teamColorName !== 'Graphite') problems.push(`#teamColorName reads "${picked.teamColorName}" after picking Graphite and reloading, want "Graphite"`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await reset(c, origin).catch(() => {});
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'a fresh device, a colorless team and the picker all read Hardwood, and a saved or picked '
        + 'Graphite survives a plain reload',
  };
}
