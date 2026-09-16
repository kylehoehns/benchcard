import { evalIn, step, SETTLE } from './dom.mjs';
import { RICH, withSecondTeam, reloadWithRecord } from './fixtures.mjs';
import { nameOf } from './registry.mjs';

/* #25 item 4 and item 7, together: with Royal active, the K1 controls read
 * the tint and nothing else on screen does; switching team changes them in
 * the same task, with no reload. Item 4 names two full lists (tinted,
 * unchanged) and this check proves both of them, not a sample of each —
 * see docs/specs/25-team-colour.md's Proof section and the #59 review that
 * found the first cut of this file covering only six of the twelve tinted
 * elements and four of the sixteen unchanged ones.
 *
 * Expected colours are the spec's own table (docs/specs/25-team-colour.md,
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
 * `#backBtn`'s icon, `.foot-link`, `.linkish`, and `.stage`'s glow) do not
 * read `--accent` at all -- they are secondary ink, a different neutral
 * token, or (`.stage`) a `color-mix()` this file cannot re-serialize by
 * hand -- so proving them unchanged means comparing the SAME element's
 * computed style before and after the team switch below, not a hand-typed
 * literal: a value this file invented would be a recomputation, not a fact
 * the spec states. The picker's `.colour-opt.on` mark and the phrase style
 * read `--tint-soft` / `--tint` respectively, and only `--tint`'s own fill
 * has a spec literal (item 2) -- `--tint-soft` is an alpha the ticket leaves
 * to the implementation, so `.colour-opt.on` is proved the same way: it must
 * CHANGE between the two states, where the unchanged set must not.
 *
 * `getComputedStyle` resolves colour custom properties through the cascade
 * regardless of `[hidden]` / `display: none` -- confirmed against this app's
 * own overlay states -- so most elements below are read straight off the
 * static markup, with no dialog opened. Three groups of the tinted/unchanged
 * elements do not exist in static markup at all, though, and are handled the
 * two ways the #59 review named:
 *   - `.gm-p.picked`, `.gm-scope button.on`/`.act` and `.gm-dot.now` are
 *     built by `renderGameMode()` only once bench mode is opened and a floor
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
const READ_COLOURS = `(() => {
  const $ = s => document.querySelector(s);
  const bg = s => { const e = $(s); return e ? getComputedStyle(e).backgroundColor : null; };
  const fg = s => { const e = $(s); return e ? getComputedStyle(e).color : null; };
  return JSON.stringify({
    primaryBg: bg('.btn.primary'), primaryFg: fg('.btn.primary'),
    abMainBg: bg('#abBench'), gmNavNextBg: bg('#gmNext2'),
    segOnFg: fg('#maxSubsSeg button.on'), switchBg: bg('#showMinutes'),
    helpHFg: fg('.help-h'), teamCheckFg: fg('.teammenu-check'),
    setTeamHdFg: fg('#setTeamHd'), backBtnFg: fg('#backBtn'),
    // item 4 tinted, the rest of the list: a real chip (#gran's
    // substitution-interval picker, present whether its details fold is
    // open or not) and the welcome screen's still-in-the-DOM segmented tab.
    chipBg: bg('#gran .chip.sel'), chipFg: fg('#gran .chip.sel'),
    welSegFg: fg('#welTabPlan'),
    // the picker's current mark -- --tint-soft, no spec literal, so this is
    // read on both passes and compared for INEQUALITY below, not to a value.
    colourOptOnBg: bg('#colourOpts .colour-opt.on'),
    // item 4 unchanged, the rest of the list: one more uppercase eyebrow
    // heading beside .help-h (Settings' own "Backup and restore"), the
    // minute-bar fill, the footer link and the paste-box's own .linkish,
    // #backBtn's icon (secondary ink, not --accent, so read for the
    // invariant comparison below rather than a literal), the logo mark on
    // the welcome screen, and the card preview's glow (.stage, card.css
    // -- also read for the invariant comparison, since its color-mix()
    // output cannot be hand-typed without re-deriving what the browser
    // computes).
    setHFg: fg('.set-h'), mrowBg: bg('.mrow .track i'),
    footFg: fg('.foot-link'), linkishFg: fg('#welRestore'),
    iconFg: (() => { const e = $('#backBtn svg'); return e ? getComputedStyle(e).color : null; })(),
    logoFill: (() => { const e = $('.wel-mark circle'); return e ? getComputedStyle(e).fill : null; })(),
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

/* `.gm-p.picked`, `.gm-scope button.on`/`.act` and `.gm-dot.now` only exist
 * once bench mode is open with a floor player picked -- the same navigation
 * `overlay.mjs`'s "game mode, swap picker" state drives (`$('#gmOpen').click();
 * $('#gmFloor .gm-p').click()`). Read-only: closed again before the team
 * switch below, so it leaves the fixture exactly as `reloadWithRecord` set it
 * up, the same courtesy every other rich-fixture pass in this suite pays. */
const READ_GAME_MODE = `(() => {
  const $ = s => document.querySelector(s);
  const gp = $('#gamemode .gm-p.picked');
  const on = $('.gm-scope button.on');
  const act = $('.gm-scope button.act');
  const dot = $('.gm-dot.now');
  return JSON.stringify({
    pickedBorder: gp ? getComputedStyle(gp).borderColor : null,
    scopeOnFg: on ? getComputedStyle(on).color : null,
    scopeActBg: act ? getComputedStyle(act).backgroundColor : null,
    dotNowBg: dot ? getComputedStyle(dot, '::before').backgroundColor : null,
  });
})()`;

export async function teamColourPass(c, origin) {
  const problems = [];
  try {
    const base = JSON.parse(JSON.stringify(RICH));
    base.view = 'today';
    base.teams[0].settings = { colour: 'royal' };
    const record = withSecondTeam(base);
    record.teams[1].settings = { colour: 'graphite' };
    await reloadWithRecord(c, origin, record);

    await evalIn(c, step(`$('#gmOpen').click(); $('#gmFloor .gm-p').click()`));
    const gm = JSON.parse(await evalIn(c, READ_GAME_MODE));
    await evalIn(c, step(`$('#gmClose').click()`));

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

    const r = JSON.parse(await evalIn(c, READ_COLOURS));

    const tinted = [
      ['.btn.primary background', r.primaryBg, ROYAL_FILL],
      ['.btn.primary label', r.primaryFg, ROYAL_LABEL],
      ['.ab-main (#abBench) background', r.abMainBg, ROYAL_FILL],
      ['.gm-nav.next (#gmNext2) background', r.gmNavNextBg, ROYAL_FILL],
      ['.seg button.on (#maxSubsSeg) text', r.segOnFg, ROYAL_FILL],
      ['.switch input:checked (#showMinutes) background', r.switchBg, ROYAL_FILL],
      ['.chip.sel (#gran) background', r.chipBg, ROYAL_FILL],
      ['.chip.sel (#gran) label', r.chipFg, ROYAL_LABEL],
      ['.wel-seg-b.sel (#welTabPlan) text', r.welSegFg, ROYAL_FILL],
      ['input[type=checkbox].box:checked background', r.checkboxBoxBg, ROYAL_FILL],
      ['.gm-p.picked border', gm.pickedBorder, ROYAL_FILL],
      ['.gm-scope button.on text', gm.scopeOnFg, ROYAL_FILL],
      ['.phrase text', r.phraseFg, ROYAL_FILL],
    ];
    for (const [label, got, want] of tinted) {
      if (got !== want) problems.push(`${label} is ${got} with Royal active, want ${want}`);
    }
    // item 5: Graphite's phrase carries an underline, every other colour's
    // does not (`--phrase-line` goes transparent) -- Royal is "every other
    // colour", so this is the one item-4 "tinted" entry proved by a state a
    // literal cannot name (no-underline) rather than a value.
    if (r.phraseDecoration !== TRANSPARENT) {
      problems.push(`.phrase has a visible underline (${r.phraseDecoration}) with Royal active, want none`);
    }

    const accentInk = [
      ['.help-h', r.helpHFg], ['.teammenu-check', r.teamCheckFg],
      ['.set-h', r.setHFg], ['.mrow .track i (minute bar) background', r.mrowBg],
      ['.gm-scope button.act background', gm.scopeActBg], ['.gm-dot.now background', gm.dotNowBg],
      ['the logo (.wel-mark circle) fill', r.logoFill],
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

    // item 7: switching team (team menu's second entry, the Graphite one)
    // changes `.btn.primary` in the same task, with no reload. Re-read
    // everything, both to check the switch and to prove the tokens the spec
    // gives no literal for (`#setTeamHd`, the back button, its icon,
    // `.foot-link`, `.linkish`, `.stage`'s glow) are the same colour on the
    // Graphite team as they were on Royal, and that the picker's mark and
    // the phrase style, which DO read the tint, changed.
    await evalIn(c, step(`document.querySelectorAll('#teamMenu .teammenu-item')[1]?.click()`));
    const a = JSON.parse(await evalIn(c, READ_COLOURS));
    if (a.primaryBg !== GRAPHITE_INK) {
      problems.push(`.btn.primary background is ${a.primaryBg} after switching to the Graphite team, `
        + `want ${GRAPHITE_INK} — no reload happened in between`);
    }
    const invariant = [
      ['#setTeamHd', r.setTeamHdFg, a.setTeamHdFg], ['back button (#backBtn)', r.backBtnFg, a.backBtnFg],
      ['#backBtn’s icon', r.iconFg, a.iconFg], ['.foot-link', r.footFg, a.footFg],
      ['.linkish (#welRestore)', r.linkishFg, a.linkishFg], ['.stage (card.css) glow', r.stageBg, a.stageBg],
    ];
    for (const [label, before, afterVal] of invariant) {
      if (before !== afterVal) {
        problems.push(`${label} is ${before} with Royal active and ${afterVal} with Graphite active — `
          + 'it should not read the team colour at all');
      }
    }
    // the inverse of the invariant list: these two DO read the tint, so they
    // must NOT be the same colour on both teams.
    if (r.colourOptOnBg === a.colourOptOnBg) {
      problems.push(`the picker's current mark is ${r.colourOptOnBg} on both Royal and Graphite — it should read the active team's tint`);
    }
    if (r.phraseFg === a.phraseFg) {
      problems.push(`.phrase is ${r.phraseFg} on both Royal and Graphite — it should read the active team's tint`);
    }
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  }
  return {
    name: nameOf('teamcolour'),
    pass: problems.length === 0,
    detail: problems.length ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : 'Royal tints all twelve of item 4’s controls, all sixteen of the unchanged list stay graphite ink, '
        + 'and switching to a graphite team repaints .btn.primary with no reload',
  };
}
