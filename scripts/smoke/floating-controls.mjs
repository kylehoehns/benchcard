/* #33, "What would settle it" items 1, 2, 3, 4, 5, 6 and 10: the floating
 * chrome itself. Item 7 (focus never landing under it) is focus-clear.mjs's
 * job and item 11 is the compare set's; everything else about `.bar` and
 * `#actionbar` after the redesign is measured here, in one place, because
 * every one of these facts is read off the same two elements in the same
 * browser and splitting them would mean five navigations of the same five
 * screens.
 *
 * Why a browser check and not a node test: none of this is in the source
 * text. `--bar-side` is written by `render.js` from measured widths, the
 * round fills are `color-mix()` and `backdrop-filter`, and the solid
 * fallbacks only exist under emulated media. A grep of `app.css` would pass
 * against all of them being overridden three rules later -- which is
 * precisely the bug the landscape block introduced during this change (it
 * re-declared `.actionbar`'s `padding-bottom` without the `-max-` variable,
 * quietly undoing AC4 in landscape only). So item 4's declaration check
 * below walks the live CSSOM and audits EVERY rule that sets the property,
 * not the one the base block happens to contain. */
import { evalIn, step, SETTLE, TODAY_HOME, WIDTH, HEIGHT, alpha, SOLID_FALLBACK_MEDIA } from './dom.mjs';
import { nameOf, LARGE_TEXT_WIDTH } from './registry.mjs';
/* The five screens and the click that reaches each one, from the one list
   that already holds them -- `sweep.mjs`'s `VIEWS`, which `app-large-text.mjs`
   imports for the same reason. A second hand-typed copy of "how do I get to
   Season" is a second place to keep in step the next time Today's entries
   move. */
import { VIEWS as SCREENS } from './sweep.mjs';

/* Decision 9's five: the header controls that ride directly on the bar's
   glass. `sel` is the control (the hit area item 3 sizes); `fill` is the
   painted chip, which is the `.i` span for the four icon buttons and the
   button itself for `#teamBtn`, whose content is text. `view` is the screen
   that shows it -- four of the five are hidden everywhere else. */
const CHIPS = [
  { sel: '#teamBtn', fill: '#teamBtn', view: 'today' },
  { sel: '#settingsBtn', fill: '#settingsBtn .i', view: 'today' },
  { sel: '#backBtn', fill: '#backBtn .i', view: 'games' },
  { sel: '#shareBtn', fill: '#shareBtn .i', view: 'games' },
  { sel: '#teamAdd', fill: '#teamAdd .i', view: 'team' },
];

/* Decision 5/6 and items 1 and 2: what `#barTitle` must read on each screen,
   and whether it is exposed to assistive tech there. The four screens with a
   large title of their own get the title's OWN words (read back from the
   `[data-large-title]` element, not hand-typed -- hand-typing is what made
   the bar say "Team" while the screen said the team's name), and hide the
   copy so exactly one `h1` is announced. Settings is the one screen with no
   large title of its own -- `light-settings.png` shows a bar title and
   nothing above the first card -- so its bar title is the only one there and
   stays announced. That single exception is the only fact this file adds to
   `SCREENS`; the screens themselves and the way in come from there. */
const NO_LARGE_TITLE = new Set(['settings']);
const VIEWS = SCREENS.map(({ name }) => ({
  view: name, main: `view-${name}`, hasLarge: !NO_LARGE_TITLE.has(name),
}));
const GO = Object.fromEntries(SCREENS.map(({ name, open }) => [name, open]));

export async function floatingControlsPass(c, origin) {
  const problems = [];
  const notes = [];

  /* ---- items 1 and 2: the bar title on all five screens ---- */
  for (const { view, main, hasLarge } of VIEWS) {
    await evalIn(c, step(TODAY_HOME));
    if (view !== 'today') await evalIn(c, step(GO[view]));
    await evalIn(c, `${SETTLE}`);
    const t = JSON.parse(await evalIn(c, `(() => {
      const bar = document.querySelector('.bar');
      const bt = document.getElementById('barTitle');
      const m = document.getElementById(${JSON.stringify(main)});
      const large = m && m.querySelector('[data-large-title]');
      /* The bar's own visible controls, so the centered overlay can be
         proved clear of them. \`--bar-side\` is measured by render.js from
         whichever half is on screen; if that measurement runs before the
         view's buttons have been shown or hidden it is a screen behind, and
         the overlay overlaps a control -- invisible in a screenshot at 390px
         with a short title, visible the moment the title is long. */
      const rects = [...document.querySelectorAll('.bar > :not([hidden]) > *')]
        .filter(el => !el.hasAttribute('hidden') && !el.classList.contains('spacer'))
        .map(el => {
          const r = el.getBoundingClientRect();
          return { label: (el.id ? '#' + el.id : el.tagName.toLowerCase()), r: { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width } };
        })
        .filter(x => x.r.w > 0);
      const br = bt.getBoundingClientRect();
      return JSON.stringify({
        barTitle: bt.textContent.trim(),
        ariaHidden: bt.getAttribute('aria-hidden'),
        large: large ? large.textContent.trim() : null,
        titleIn: bar.classList.contains('title-in'),
        overlap: rects.filter(x => !(br.right <= x.r.l || br.left >= x.r.r || br.bottom <= x.r.t || br.top >= x.r.b)).map(x => x.label),
        barSide: getComputedStyle(bar).getPropertyValue('--bar-side').trim(),
      });
    })()`));

    if (hasLarge) {
      if (!t.large) problems.push(`${view}: no [data-large-title] element on #${main}`);
      else if (t.barTitle !== t.large) {
        problems.push(`${view}: #barTitle reads ${JSON.stringify(t.barTitle)} but the large title reads `
          + `${JSON.stringify(t.large)} -- the bar title is a screen behind`);
      }
      if (t.ariaHidden !== 'true') {
        problems.push(`${view}: #barTitle aria-hidden is ${JSON.stringify(t.ariaHidden)}, want "true" -- `
          + 'the screen already has its own h1 and both would be announced');
      }
      if (t.titleIn) problems.push(`${view}: .bar has .title-in at the top of the screen, want the large title showing alone`);
    } else {
      if (t.large) problems.push(`${view}: has a [data-large-title], want none (light-settings.png shows a bar title only)`);
      if (t.barTitle !== 'Settings') problems.push(`${view}: #barTitle reads ${JSON.stringify(t.barTitle)}, want "Settings"`);
      if (t.ariaHidden !== 'false') problems.push(`${view}: #barTitle aria-hidden is ${JSON.stringify(t.ariaHidden)}, want "false" -- it is this screen's only title`);
      if (!t.titleIn) problems.push(`${view}: .bar is missing .title-in, so the only title Settings has is faded out`);
    }
    if (t.overlap.length) {
      problems.push(`${view}: the centered #barTitle overlaps ${t.overlap.join(', ')} `
        + `(--bar-side is ${t.barSide || 'unset'})`);
    }
  }

  /* ---- item 1's other half: scrolling hands the title over ---- */
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(GO.games));
  const handoff = JSON.parse(await evalIn(c, `(async () => {
    const bar = document.querySelector('.bar');
    const large = document.getElementById('gameTitle');
    const out = { atTop: bar.classList.contains('title-in') };
    /* Far enough that the large title is well clear of the bar, then back.
       Read after two frames: the IntersectionObserver reports on the frame
       after the scroll, and \`title-in\` is set from its callback. */
    window.scrollTo(0, 400);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.scrolled = bar.classList.contains('title-in');
    /* The class lands on the frame after the scroll, but \`opacity\` is a
       TRANSITION: read two frames in and the computed value is whatever the
       fade has reached so far, which is still nearly 0. Wait it out rather
       than reading a number mid-flight. */
    await new Promise(r => setTimeout(r, 400));
    out.opacityScrolled = getComputedStyle(document.getElementById('barTitle')).opacity;
    /* The hand-off itself: at the moment the large title's BOTTOM passes the
       bar's bottom edge, one of the two titles has to be on screen. A
       \`threshold: 0\` observer with no rootMargin only fires once the large
       title has left the viewport entirely, leaving a bar's height of scroll
       with no title at all -- the "disappear" L4 forbids. */
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const barH = bar.getBoundingClientRect().height;
    window.scrollTo(0, Math.max(0, large.getBoundingClientRect().bottom + window.scrollY - barH + 2));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.atHandoff = bar.classList.contains('title-in');
    out.largeBottomAtHandoff = large.getBoundingClientRect().bottom;
    out.barBottom = barH;
    window.scrollTo(0, 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.backAtTop = bar.classList.contains('title-in');
    return JSON.stringify(out);
  })()`));
  if (handoff.atTop) problems.push('games: .title-in is already on before any scrolling');
  if (!handoff.scrolled) problems.push('games: scrolling 400px did not fade the bar title in (.title-in never set)');
  if (handoff.opacityScrolled !== '1') problems.push(`games: #barTitle opacity is ${handoff.opacityScrolled} while scrolled, want 1`);
  if (!handoff.atHandoff) {
    problems.push('games: the large title has slid under the bar '
      + `(its bottom is at ${Math.round(handoff.largeBottomAtHandoff)}px, the bar ends at ${Math.round(handoff.barBottom)}px) `
      + 'and the bar title has not faded in yet -- the screen has no title at all for that stretch');
  }
  if (handoff.backAtTop) problems.push('games: scrolling back to the top left .title-in on');
  notes.push('title hand-off both ways');

  /* ---- item 3: the five round chips, at 390px and at 320px ---- */
  /* `LARGE_TEXT_WIDTH` is the registry's own name for 320px, "the narrowest
     phone anyone carries" -- the width every other size sweep in the harness
     already bottoms out at. */
  for (const w of [WIDTH, LARGE_TEXT_WIDTH]) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    for (const view of ['today', 'games', 'team']) {
      await evalIn(c, step(TODAY_HOME));
      if (view !== 'today') await evalIn(c, step(GO[view]));
      await evalIn(c, `${SETTLE}`);
      const want = CHIPS.filter(x => x.view === view);
      const got = JSON.parse(await evalIn(c, `(() => JSON.stringify(${JSON.stringify(want)}.map(x => {
        const el = document.querySelector(x.sel), f = document.querySelector(x.fill);
        if (!el || !f) return { sel: x.sel, missing: true };
        const r = el.getBoundingClientRect(), fr = f.getBoundingClientRect(), cs = getComputedStyle(f);
        return { sel: x.sel, w: r.width, h: r.height, fh: fr.height,
          radius: cs.borderTopLeftRadius, bf: cs.backdropFilter || cs.webkitBackdropFilter };
      })))()`));
      for (const g of got) {
        if (g.missing) { problems.push(`${view}: ${g.sel} is not on screen at ${w}px`); continue; }
        /* `#backBtn`, `#settingsBtn` and `#teamBtn` are already swept for
           48px by today-game-rows.mjs and `#shareBtn` by
           timeline-card-sheet.mjs; only `#teamAdd`'s floor is new. Re-read
           here on purpose rather than trimmed to the one new control: the
           rect is already in hand for the radius math on the next line, and
           the thing at risk in THIS change is the round shape, which is
           exactly where a chip could keep its 48px hit area while its
           painted fill shrank out from under it. */
        if (g.w < 48 || g.h < 48) problems.push(`${w}px ${view}: ${g.sel} is ${Math.round(g.w)}×${Math.round(g.h)}, want at least 48×48`);
        // `border-radius` resolving to at least half the fill's height IS round;
        // a percentage resolves to a px pair in computed style, so one number
        // covers both the `--r-full` pill and a 50% circle.
        const rad = parseFloat(g.radius);
        if (!(rad >= g.fh / 2 - 0.5)) {
          problems.push(`${w}px ${view}: ${g.sel}'s fill has border-radius ${g.radius} on a ${Math.round(g.fh)}px-tall chip, want at least half its height`);
        }
        if (!g.bf || g.bf === 'none') problems.push(`${w}px ${view}: ${g.sel}'s fill has backdrop-filter ${g.bf}, want a blur`);
      }
    }
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  notes.push(`${CHIPS.length} round chips at ${WIDTH}px and 320px`);

  /* ---- items 4 and 6: the action bar ---- */
  await evalIn(c, step(TODAY_HOME));
  await evalIn(c, step(GO.games));
  await evalIn(c, `${SETTLE}`);
  const ab = JSON.parse(await evalIn(c, `(() => {
    const bar = document.querySelector('.bar'), abEl = document.getElementById('actionbar');
    const bench = document.getElementById('abBench');
    const cs = getComputedStyle(abEl);
    const inner = abEl.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    /* Item 4's second half. \`getComputedStyle\` cannot answer this: with no
       home indicator in headless Chrome every \`env()\` above resolves to 0px
       and the live variable and the \`-max-\` one are indistinguishable. The
       DECLARATION is the fact, so the live CSSOM is walked for every rule
       that sets the property on \`.actionbar\`, in any media block -- a
       landscape or narrow-width override that dropped back to the live
       variable is exactly the regression AC4 is about, and it would not show
       up in the rule the base block happens to contain. */
    const decls = [];
    /* A style rule is checked AND descended into, not one or the other: with
       CSS nesting, Chrome gives every \`CSSStyleRule\` a \`cssRules\` list of
       its own, and an empty \`CSSRuleList\` is truthy. Treating "has
       cssRules" as "is a group" therefore skipped every plain rule in the
       sheet and this audit found nothing at all. */
    const walk = (rules, where) => {
      for (const r of rules) {
        if (r.selectorText && r.style && /(^|,)\\s*\\.actionbar\\b/.test(r.selectorText)) {
          const v = r.style.getPropertyValue('padding-bottom')
            || (r.style.getPropertyValue('padding') ? 'shorthand: ' + r.style.getPropertyValue('padding') : '');
          if (v) decls.push({ where, selector: r.selectorText, value: v });
        }
        if (r.cssRules) walk(r.cssRules, r.conditionText ? where + ' @ ' + r.conditionText : where);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules = null;
      try { rules = sheet.cssRules; } catch { continue; }
      if (rules) walk(rules, (sheet.href || 'inline').split('/').pop());
    }
    const noBorder = el => {
      const s = getComputedStyle(el);
      return { borders: ['Top', 'Right', 'Bottom', 'Left'].map(k => parseFloat(s['border' + k + 'Width'])),
        shadow: s.boxShadow, bg: s.backgroundColor };
    };
    return JSON.stringify({
      benchWidth: bench ? bench.getBoundingClientRect().width : null,
      innerWidth: inner,
      decls,
      bar: noBorder(bar), abox: noBorder(abEl),
      hasFoot: !!document.querySelector('.foot, .foot-link, .foot-why, #tipLink'),
    });
  })()`));
  if (ab.benchWidth === null) problems.push('games: #abBench is not in the document');
  else if (Math.abs(ab.benchWidth - ab.innerWidth) > 1) {
    problems.push(`#abBench is ${Math.round(ab.benchWidth)}px inside a ${Math.round(ab.innerWidth)}px action-bar content box, `
      + 'want it full width (C2: one full-width floating primary action)');
  }
  if (!ab.decls.length) problems.push('no rule sets padding-bottom on .actionbar at all');
  for (const d of ab.decls) {
    if (!/safe-area-max-inset-bottom/.test(d.value)) {
      problems.push(`${d.where}: "${d.selector} { padding-bottom: ${d.value} }" does not go through `
        + 'safe-area-max-inset-bottom, so the action bar moves with the URL bar (AC4/L5)');
    }
  }
  for (const [label, box] of [['.bar', ab.bar], ['#actionbar', ab.abox]]) {
    const bw = box.borders.filter(n => n > 0);
    if (bw.length) problems.push(`${label} has a ${bw.join('/')}px border -- L3 asks for a fade, not a line`);
    if (box.shadow !== 'none') problems.push(`${label} has box-shadow ${box.shadow}, which is a hairline by another name`);
    const a = alpha(box.bg);
    if (a !== null && a > 0) problems.push(`${label} itself paints ${box.bg} -- the scrim belongs on its ::before so the mask can fade it`);
  }
  if (ab.hasFoot) problems.push('the footer (.foot / .foot-link / .foot-why / #tipLink) is still in the document');
  notes.push('action bar full width, no hairline');

  /* ---- item 5: the solid fallbacks ---- */
  const SCRIMS = ['.bar::before', '.actionbar::before'];
  for (const [feature, value] of SOLID_FALLBACK_MEDIA) {
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: feature, value }] });
    await evalIn(c, `${SETTLE}`);
    const solid = JSON.parse(await evalIn(c, `(() => {
      const read = (sel) => {
        const [base, pseudo] = sel.split('::');
        const el = document.querySelector(base);
        if (!el) return { sel, missing: true };
        const cs = getComputedStyle(el, pseudo ? '::' + pseudo : null);
        return { sel, bf: cs.backdropFilter || cs.webkitBackdropFilter, bg: cs.backgroundColor, img: cs.backgroundImage, mask: cs.maskImage || cs.webkitMaskImage };
      };
      return JSON.stringify([${SCRIMS.map(s => JSON.stringify(s)).join(',')}, '#backBtn .i', '#shareBtn .i'].map(read));
    })()`));
    for (const s of solid) {
      if (s.missing) { problems.push(`${feature}: ${s.sel} is not on screen`); continue; }
      if (s.bf && s.bf !== 'none') problems.push(`${feature}: ${s.sel} still has backdrop-filter ${s.bf}, want none`);
      const a = alpha(s.bg);
      if (a !== 1) problems.push(`${feature}: ${s.sel} paints ${s.bg} (alpha ${a}), want a fully opaque color`);
      if (s.img && s.img !== 'none') problems.push(`${feature}: ${s.sel} still paints ${s.img}, want a flat color`);
      if (SCRIMS.includes(s.sel) && s.mask && s.mask !== 'none') {
        problems.push(`${feature}: ${s.sel} still has mask-image ${s.mask} -- an opaque scrim faded by a mask is a translucent scrim again`);
      }
    }
  }
  notes.push('solid under reduced transparency and more contrast');

  /* ---- item 10: reduced motion ---- */
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await evalIn(c, `${SETTLE}`);
  const rm = JSON.parse(await evalIn(c, `(async () => {
    const bar = document.querySelector('.bar'), bt = document.getElementById('barTitle');
    const out = {};
    bar.classList.remove('title-in');
    out.transformOut = getComputedStyle(bt).transform;
    bar.classList.add('title-in');
    out.transformIn = getComputedStyle(bt).transform;
    out.transition = getComputedStyle(bt).transitionProperty;
    bar.classList.remove('title-in');
    const abEl = document.getElementById('actionbar');
    out.abAnim = getComputedStyle(abEl).animationDuration;
    return JSON.stringify(out);
  })()`));
  for (const [k, v] of [['collapsed', rm.transformIn], ['expanded', rm.transformOut]]) {
    if (v !== 'none') problems.push(`reduced motion: #barTitle's transform is ${v} when ${k}, want none -- nothing in the bar may travel`);
  }
  if (rm.transition.split(',').map(s => s.trim()).some(p => p !== 'opacity')) {
    problems.push(`reduced motion: #barTitle transitions ${rm.transition}, want opacity only`);
  }
  if (parseFloat(rm.abAnim) > 0.001) {
    problems.push(`reduced motion: #actionbar's entry animation still runs for ${rm.abAnim}, want it removed`);
  }
  notes.push('nothing travels under reduced motion');

  await c.send('Emulation.setEmulatedMedia', { features: [] });
  await evalIn(c, step(TODAY_HOME));

  return {
    name: nameOf('floatingcontrols'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}${problems.length > 4 ? ` (+${problems.length - 4} more)` : ''}`
      : notes.join('; '),
  };
}
