/* The in-page half of the smoke harness.

   This file is not a module and is never served: `smoke.mjs` reads it as text
   and hands it to the page as one expression, so it must evaluate to the
   report object. Keeping it a separate file (rather than a template literal in
   smoke.mjs) means it is also paste-able straight into a devtools console or a
   Playwright `browser_evaluate` when someone wants to check one thing by hand.

   Every check returns a `detail` string whether it passed or not — a harness
   that only explains its failures makes you re-run it to learn anything. */
(() => {
  const IN = 96; // CSS px per inch
  const round = n => Math.round(n * 100) / 100;
  const label = el => {
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const visible = el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  /* 1. No horizontal overflow. The whole app has to fit a 390px phone; a
        sideways scrollbar is the single most common regression here.

        Measure against the width the harness *asked* for, not
        `window.innerWidth`. Under Chrome's mobile emulation the layout viewport
        grows to contain overflowing content, so a 600px-wide element makes
        `innerWidth` report 600 and the check passes while the page is visibly
        broken. Verified: without this the harness misses the exact regression it
        exists to catch. */
  const vw = (window.__SMOKE_VIEWPORT || [])[0] || window.innerWidth;
  const docWidth = Math.max(document.scrollingElement.scrollWidth, window.innerWidth);
  const spill = [];
  if (docWidth > vw + 1) {
    for (const el of document.body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      // Only blame the element itself, not every ancestor it stretches.
      if (r.right > vw + 1 && !spill.some(s => s.el.contains(el))) spill.push({ el, right: round(r.right) });
    }
  }
  add('no horizontal overflow', docWidth <= vw + 1,
    docWidth <= vw + 1
      ? `scrollWidth ${docWidth} ≤ viewport ${vw}`
      : `scrollWidth ${docWidth} > viewport ${vw}; widest: ` +
        spill.sort((a, b) => b.right - a.right).slice(0, 4).map(s => `${label(s.el)} → ${s.right}px`).join(', '));

  /* 2. The card is the product: 3.45 × 5in pocket, 8 × 5.1in half-sheet.
        `.card` carries a `zoom` to fit narrow screens, so divide it back out —
        the printed size is the unzoomed layout size. */
  /* `.card-copy` are the extra print copies. They are deliberately not laid
     out on screen, so they measure 0×0 here -- excluded rather than counted as
     the wrong size. Their printed size is the same nodes under print media,
     which this harness does not emulate. */
  const cards = [...document.querySelectorAll('.card:not(.card-copy)')];
  const wrong = [];
  for (const c of cards) {
    const z = c.currentCSSZoom || 1;
    const r = c.getBoundingClientRect();
    const half = c.classList.contains('half');
    const want = half ? [8 * IN, 5.1 * IN] : [3.45 * IN, 5 * IN];
    const got = [round(r.width / z), round(r.height / z)];
    if (Math.abs(got[0] - want[0]) > 1 || Math.abs(got[1] - want[1]) > 1) {
      wrong.push(`${half ? 'half' : 'pocket'} card ${got[0]}×${got[1]}px, want ${want[0]}×${want[1]}px`);
    }
  }
  add('card is 3.45 × 5in', cards.length > 0 && wrong.length === 0,
    !cards.length ? 'no .card in the DOM — did the plan render?'
      : wrong.length ? wrong.join('; ')
      : `${cards.length} card(s), all ${round(cards[0].getBoundingClientRect().width / (cards[0].currentCSSZoom || 1))}×` +
        `${round(cards[0].getBoundingClientRect().height / (cards[0].currentCSSZoom || 1))}px`);

  /* 3. Touch targets ≥44px. A coach taps this standing up, in a hurry.
        Inline links inside running prose are exempt — they are text, not
        controls, and padding them to 44px would wreck the paragraph. So is
        anything inside `.card`: that is print output, never tapped. */
  const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="switch"], [role="tab"]';
  const small = [];
  let tapCount = 0;
  for (const el of document.querySelectorAll(SEL)) {
    if (!visible(el) || el.closest('.card') || el.closest('[hidden]')) continue;
    if (el.type === 'hidden') continue;
    /* `dd` joined this list when about.html's FAQ tripped the check with a link
       inside a sentence. It is the same kind of container as `p` and `li` — a
       run of body text — so this is the exemption reaching a case it always
       meant to cover, not a threshold being relaxed to fit a page. It costs the
       app nothing either: index.html has 19 `dd`, and not one contains a link
       or a button. */
    const inProse = el.tagName === 'A' && !!el.closest('p, li, dd, .hint, .note, .banner');
    if (inProse) continue;
    tapCount++;
    /* A checkbox or radio wrapped in a label is tapped by the label, so the
       label's box is the real target — the 38×22 control inside it is not. */
    const box = (el.type === 'checkbox' || el.type === 'radio') && el.closest('label') || el;
    const r = box.getBoundingClientRect();
    // A hit area can be extended past the box; count the largest of the two.
    const min = Math.min(round(r.width), round(r.height));
    if (min < 43.5) small.push(`${label(el)} ${round(r.width)}×${round(r.height)}`);
  }
  add('touch targets ≥ 44px', small.length === 0,
    small.length ? `${small.length}/${tapCount} under 44px: ${small.slice(0, 6).join(', ')}`
      : `${tapCount} controls, all ≥ 44px`);

  /* 4. The last control in an open dialog is reachable.

        The help sheet shipped for months with "Show me around again" below the
        fold on an iPhone: `.keysbox` was capped at `92vh`, and on iOS `vh` is
        the LARGE viewport -- the page as if the URL bar were hidden -- so the
        bottom of the box sat under the window. Scrolling the sheet never got
        there, because what was clipped was the box, not its overflow.

        So: for every open dialog, take the last thing you can focus, scroll it
        into view the way a thumb would, and insist it is fully inside the
        window and still a 44px target. One check, every dialog, including the
        ones nobody has written yet -- which is the point, since the three that
        share the `.keysbox` shell were all broken and only the tall one was
        ever noticed.

        Measured against `visualViewport` where there is one: it is the box the
        user can actually see, and it is what the first-run tour's spotlight
        already moved onto for the same reason. Unlike every other check here
        this one moves the page (a scroll, nothing else); the harness closes
        each state after auditing it. */
  const winH = window.visualViewport?.height ?? window.innerHeight;
  const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const cut = [];
  const audited = [];
  for (const dlg of document.querySelectorAll('[role="dialog"]')) {
    if (dlg.hidden || !visible(dlg)) continue;
    const foc = [...dlg.querySelectorAll(FOCUSABLE)]
      .filter(el => visible(el) && !el.closest('[hidden]') && el.type !== 'hidden');
    if (!foc.length) continue;
    const last = foc[foc.length - 1];
    last.scrollIntoView({ block: 'nearest' });
    const r = last.getBoundingClientRect();
    audited.push(label(dlg));
    if (r.top < -0.5 || r.bottom > winH + 0.5) {
      cut.push(`${label(dlg)} → ${label(last)} at ${round(r.top)}–${round(r.bottom)}, window is 0–${round(winH)}`);
    } else if (Math.min(round(r.width), round(r.height)) < 43.5) {
      cut.push(`${label(dlg)} → ${label(last)} only ${round(r.width)}×${round(r.height)}`);
    }
  }
  add('last control in an open dialog is reachable', cut.length === 0,
    cut.length ? cut.slice(0, 3).join('; ')
      : audited.length ? `${audited.length} open: ${audited.join(', ')}, last control on screen and ≥ 44px`
      : 'no dialog open');

  /* ---------- accessibility ----------

     Hand-rolled rather than axe-core: this repo vendors its runtime deps by
     hand and pulling a 500 KB auditing library in to run four rules would cost
     more than it returns. These four are the ones that actually break the app
     for a screen-reader user and that a UI built from icon buttons regresses
     constantly. They are absolute rules, not baselines — the count is zero and
     stays zero. */

  /* An element's accessible name, near enough: the ARIA overrides first, then
     the text a sighted user reads, then the last-ditch `title`. An icon-only
     button with an inline <svg> has no text content, so it lands on '' unless
     someone gave it a label — which is the failure we are hunting. */
  const nameOf = el => {
    const attr = n => (el.getAttribute(n) || '').trim();
    if (attr('aria-label')) return attr('aria-label');
    const by = attr('aria-labelledby');
    if (by) {
      const t = by.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim();
      if (t) return t;
    }
    const text = (el.textContent || '').trim();
    if (text) return text;
    if (el.labels?.length) {
      const t = [...el.labels].map(l => (l.textContent || '').trim()).join(' ').trim();
      if (t) return t;
    }
    const alt = el.querySelector('img[alt]')?.getAttribute('alt')?.trim();
    if (alt) return alt;
    const svgTitle = el.querySelector('svg > title')?.textContent?.trim();
    if (svgTitle) return svgTitle;
    if ((el.type === 'button' || el.type === 'submit') && el.value?.trim()) return el.value.trim();
    if (el.placeholder?.trim()) return el.placeholder.trim();
    return attr('title');
  };

  const A11Y_SEL = SEL + ', [role="checkbox"], [role="radio"], [role="menuitem"], [role="link"]';
  const unnamed = [];
  let namedCount = 0;
  for (const el of document.querySelectorAll(A11Y_SEL)) {
    if (!visible(el) || el.closest('[hidden]') || el.type === 'hidden') continue;
    if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) continue;
    namedCount++;
    if (!nameOf(el)) unnamed.push(label(el));
  }
  add('controls have accessible names', unnamed.length === 0,
    unnamed.length ? `${unnamed.length}/${namedCount} unnamed: ${unnamed.slice(0, 6).join(', ')}`
      : `${namedCount} controls, all named`);

  /* `alt` missing is a failure; `alt=""` is a decorative image and fine. */
  const noAlt = [...document.images].filter(im => !im.hasAttribute('alt')).map(label);
  add('images declare alt text', noAlt.length === 0,
    noAlt.length ? `${noAlt.length} without alt: ${noAlt.slice(0, 4).join(', ')}`
      : `${document.images.length} image(s), all declare alt`);

  /* Duplicate ids and dangling references. Both are silent in the browser and
     both quietly break `for=`, `aria-labelledby` and `aria-controls` — easy to
     introduce when a view re-renders a template into two places at once. */
  const seen = new Set(), dupes = new Set();
  for (const el of document.querySelectorAll('[id]')) {
    if (seen.has(el.id)) dupes.add(el.id); else seen.add(el.id);
  }
  const dangling = [];
  for (const attr of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      if (attr === 'for' && el.tagName !== 'LABEL') continue;
      for (const id of el.getAttribute(attr).split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(id)) dangling.push(`${label(el)}[${attr}=${id}]`);
      }
    }
  }
  const idsOk = dupes.size === 0 && dangling.length === 0;
  add('ids unique, aria references resolve', idsOk,
    idsOk ? `${seen.size} ids, all unique and resolvable`
      : [dupes.size && `duplicate: ${[...dupes].slice(0, 4).join(', ')}`,
         dangling.length && `dangling: ${dangling.slice(0, 4).join(', ')}`].filter(Boolean).join('; '));

  /* Document-level basics, plus positive tabindex — which does not reorder the
     page so much as detach it from the DOM order everything else follows. */
  const lang = document.documentElement.getAttribute('lang');
  const title = (document.title || '').trim();
  const positive = [...document.querySelectorAll('[tabindex]')]
    .filter(el => Number(el.getAttribute('tabindex')) > 0).map(label);
  const docOk = !!lang && !!title && positive.length === 0;
  add('document lang, title, tab order', docOk,
    docOk ? `lang="${lang}", title set, no positive tabindex`
      : [!lang && 'no <html lang>', !title && 'no <title>',
         positive.length && `positive tabindex: ${positive.slice(0, 4).join(', ')}`].filter(Boolean).join('; '));

  /* Informational, never a failure: paint timing on a headless CI runner is
     too noisy to budget on, but seeing it drift is worth the one line. */
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
  add('first contentful paint (informational)', true,
    fcp ? `${Math.round(fcp)}ms — not a budget, timings on CI are noisy` : 'not reported');

  return {
    viewport: [vw, (window.__SMOKE_VIEWPORT || [])[1] || window.innerHeight],
    nodes: document.getElementsByTagName('*').length,
    checks,
  };
})()
