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

  /* #72: `.tl-name` (the timeline row's own name button) is excluded from
     both generic touch-target sweeps below (44px and item 4's 48px) ONLY
     when it is pinned to the one-row layout's row pitch -- 2.25rem (36px),
     short of both floors by design, because a taller button there would
     overlap the next row (see the spec's "one conflict, and the call
     made"). `scripts/smoke/game-rows-fit.mjs` owns that number instead,
     against `min(48, pitch) - 0.5`; in the stacked layout `.tl-name` keeps
     its own `min-height: 48px` and stays counted here like any other
     control.

     "One-row layout" is read off `.tl-row`'s own computed
     `grid-template-areas` rather than the viewport width: the stacked rule
     names two grid rows ('"lab tot" "trk trk"', 4 quote marks); the
     `@container (min-width: 20em)` rule collapses that to one
     ('"lab trk tot"', 2) -- so this asks which CSS rule actually matched,
     not a width this file would have to keep in sync with app.css by hand.
     "Its height equals its row pitch" is read structurally too: the
     distance from this row's own top to the next `.tl-row`'s top (or, for
     the last row, from the previous one's), since only the one-row layout
     ever makes the button's height equal that distance -- the stacked
     layout's `.tl-name` sits above a separate `.tl-track` row, always
     shorter than the whole row's pitch. */
  const rowPitch = row => {
    const rows = [...document.querySelectorAll('.tl-row')];
    const i = rows.indexOf(row);
    if (i < 0) return null;
    if (i + 1 < rows.length) return rows[i + 1].getBoundingClientRect().top - row.getBoundingClientRect().top;
    if (i > 0) return row.getBoundingClientRect().top - rows[i - 1].getBoundingClientRect().top;
    return null;
  };
  const skipRowPitchName = el => {
    if (!el.classList.contains('tl-name')) return false;
    const row = el.closest('.tl-row');
    if (!row) return false;
    const quotes = (getComputedStyle(row).gridTemplateAreas.match(/"/g) || []).length;
    if (quotes !== 2) return false; // stacked layout: two named grid rows, not one
    const pitch = rowPitch(row);
    if (pitch == null) return false;
    return Math.abs(el.getBoundingClientRect().height - pitch) < 1;
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
    if (skipRowPitchName(el)) continue; // #72: game-rows-fit.mjs owns this floor instead
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

  /* 3b. #22: every row in #view-settings -- each setting row, each link row
        (About, Contact, Buy me a coffee -- `.setrow` doubles as the base for
        both) and the backup row -- at least 48px, a floor higher than the
        44px sweep above and scoped to this one view (I1; the app-wide 44px
        sweep is #37's, not this ticket's).

        A ROW IS DEFINED STRUCTURALLY, not by `.setrow`/`.backuprow` -- a
        guard-falsifier renamed both classes throughout `#view-settings` and
        this check kept reporting "0 rows" as a pass, because the old
        `querySelectorAll('.setrow, .backuprow')` found nothing to measure and
        nothing-to-measure took the same branch as nothing-open. So a row here
        is: a direct child of one of `#view-settings`'s `.side-box` sections
        that (a) either IS an interactive control (button, a[href], input,
        [role=group]) or contains one, AND (b) is laid out as a flex row the
        way every real row is -- `.setrow`/`.backuprow`'s own base rule sets
        `display: flex`, and it is also the one thing an impostor row has to
        fake to look like a row (verified: a `<div>` with a button inside it
        but no flex layout, added above About, was invisible to this rule
        until it also set `display: flex`, and then measured short and was
        caught). (a) alone is what keeps headings and notes out: `.side-hd`,
        `.set-h` and every `.note` paragraph in this view contain no control
        and drop out there, no class name needed. (a) alone is also why a
        bare `<a>` row still counts even if `display` stops being read from
        `.setrow` -- the anchor is a control itself, not a container of one --
        which is what still catches the About/Contact/Buy-me-a-coffee rows
        after a rename, short, rather than them silently disappearing.

        The one thing (a)+(b) together deliberately leaves out is Backup's own
        "or paste a backup" trigger (`.pastein`): a control sits directly
        inside it, but it is a plain block, not a flex row -- the design's own
        comment calls it "a quiet way in underneath, never a second top-level
        button", and spec item 7 names only the backup ROW (singular), not
        every control the Backup box holds. Measured: `.pastein` is 44px tall
        at every width this check runs at, so counting it here would fail the
        real, unmodified page -- (b) is what keeps that specific control out
        without naming it.

        Same shape as "last control in an open dialog is reachable" above for
        WHERE it runs: `smoke.mjs`'s `settingsRowPass` is what actually opens
        Settings before reading this back, at three widths. Unlike that check,
        though, nothing-open is a FAILURE here, not a pass held for later --
        a guard-falsifier that dropped `setView('settings')` from the cog's
        click handler left `#view-settings` never opening and this check kept
        reporting PASS "0 rows" anyway, because only `shortRows.length` gated
        `pass` and an empty measured set is vacuously short-free. So `pass`
        now requires the view to actually be open AND at least one row
        measured, not just none of the rows found being short. */
  /* Shared by 3a-3c below (#22 settings rows, #27 who's-here rows, #69
        today-and-game controls): count what is visible among a caller-picked
        set of elements, measure each against the same 47.99 tolerance
        (getBoundingClientRect can report a box a hair under its CSS
        min-height at 2x device scale, and 47.5 is far enough under 48 to
        pass a floor set a half-pixel short of the real one -- verified
        against `min-height: 47.5px`), and report the same three-way message:
        gated on the view actually being open, then 0-found, then a short
        list, then a clean total. Extracted rather than a third near-identical
        copy of the loop -- `scripts/smoke/width-sweep.mjs` already extracted
        this shape once, one layer up, for the browser-driving half; this is
        its in-page counterpart. `gateOpen: true` (item4) means there is no
        "not open" state to gate on, so `notOpenMsg` is never read for it. */
  function minSizeCheck(name, { gateOpen, notOpenMsg, elements, emptyMsg, dim, fmt, noun, slice }) {
    const short = [];
    let count = 0;
    if (gateOpen) {
      for (const el of elements()) {
        if (!visible(el)) continue;
        count++;
        const r = el.getBoundingClientRect();
        if (dim(r) < 47.99) short.push(fmt(el, r));
      }
    }
    add(name, gateOpen && count > 0 && short.length === 0,
      !gateOpen ? notOpenMsg
        : !count ? emptyMsg
        : short.length ? `${short.length}/${count} under 48px: ${short.slice(0, slice).join(', ')}`
        : `${count} ${noun}, all ≥ 48px`);
  }

  /* 3a. #22: every row in #view-settings -- each setting row, each link row
        (About, Contact, Buy me a coffee -- `.setrow` doubles as the base for
        both) and the backup row -- at least 48px, a floor higher than the
        44px sweep above and scoped to this one view (I1; the app-wide 44px
        sweep is #37's, not this ticket's).

        A ROW IS DEFINED STRUCTURALLY, not by `.setrow`/`.backuprow` -- a
        guard-falsifier renamed both classes throughout `#view-settings` and
        this check kept reporting "0 rows" as a pass, because the old
        `querySelectorAll('.setrow, .backuprow')` found nothing to measure and
        nothing-to-measure took the same branch as nothing-open. So a row here
        is: a direct child of one of `#view-settings`'s `.side-box` sections
        that (a) either IS an interactive control (button, a[href], input,
        [role=group]) or contains one, AND (b) is laid out as a flex row the
        way every real row is -- `.setrow`/`.backuprow`'s own base rule sets
        `display: flex`, and it is also the one thing an impostor row has to
        fake to look like a row (verified: a `<div>` with a button inside it
        but no flex layout, added above About, was invisible to this rule
        until it also set `display: flex`, and then measured short and was
        caught). (a) alone is what keeps headings and notes out: `.side-hd`,
        `.set-h` and every `.note` paragraph in this view contain no control
        and drop out there, no class name needed. (a) alone is also why a
        bare `<a>` row still counts even if `display` stops being read from
        `.setrow` -- the anchor is a control itself, not a container of one --
        which is what still catches the About/Contact/Buy-me-a-coffee rows
        after a rename, short, rather than them silently disappearing.

        The one thing (a)+(b) together deliberately leaves out is Backup's own
        "or paste a backup" trigger (`.pastein`): a control sits directly
        inside it, but it is a plain block, not a flex row -- the design's own
        comment calls it "a quiet way in underneath, never a second top-level
        button", and spec item 7 names only the backup ROW (singular), not
        every control the Backup box holds. Measured: `.pastein` is 44px tall
        at every width this check runs at, so counting it here would fail the
        real, unmodified page -- (b) is what keeps that specific control out
        without naming it.

        Same shape as "last control in an open dialog is reachable" above for
        WHERE it runs: `smoke.mjs`'s `settingsRowPass` is what actually opens
        Settings before reading this back, at three widths. Unlike that check,
        though, nothing-open is a FAILURE here, not a pass held for later --
        a guard-falsifier that dropped `setView('settings')` from the cog's
        click handler left `#view-settings` never opening and this check kept
        reporting PASS "0 rows" anyway, because only `shortRows.length` gated
        `pass` and an empty measured set is vacuously short-free. So `pass`
        now requires the view to actually be open AND at least one row
        measured, not just none of the rows found being short. */
  const ROW_CONTROL_SEL = 'button, a[href], input, [role="group"]';
  const settingsView = document.getElementById('view-settings');
  const settingsOpen = !!settingsView && visible(settingsView);
  minSizeCheck('settings rows ≥ 48px', {
    gateOpen: settingsOpen,
    notOpenMsg: '#view-settings not open',
    emptyMsg: '#view-settings open but 0 rows found -- structural row detection matched nothing',
    elements: function* () {
      if (!settingsView) return;
      for (const box of settingsView.querySelectorAll('.side-box')) {
        for (const row of box.children) {
          const isControl = row.matches(ROW_CONTROL_SEL);
          const hasControl = isControl || !!row.querySelector(ROW_CONTROL_SEL);
          if (!hasControl) continue;                                    // heading or note
          if (getComputedStyle(row).display !== 'flex' && !isControl) continue; // e.g. .pastein
          yield row;
        }
      }
    },
    dim: r => r.height,
    fmt: (el, r) => `${label(el)} ${round(r.height)}px`,
    noun: 'rows',
    slice: 4,
  });

  /* 3b. #27 item 10: every row in the Who's here sheet, at least 48px, at the
        same three phone widths `touchPass` and `settingsRowPass` sweep
        (`who-rows.mjs` drives the sweep; this cell is what it reads back at
        each width). `.sheetrow` buttons sit straight under `#sheetWhoBody` --
        the row IS the control, unlike Settings' box-then-row-then-control
        nesting -- so this reads them directly rather than walking two
        levels. Same "open but nothing measured is a failure, not a vacuous
        pass" shape as the settings check above, for the same reason: a
        falsifier that stopped the sheet from opening at all must not read as
        clean because there was nothing short to find. */
  const whoSheet = document.getElementById('sheetWho');
  const whoOpen = !!whoSheet && whoSheet.open;
  minSizeCheck("who's here rows ≥ 48px", {
    gateOpen: whoOpen,
    notOpenMsg: '#sheetWho not open',
    emptyMsg: '#sheetWho open but 0 rows found -- structural row detection matched nothing',
    elements: () => document.querySelectorAll('#sheetWhoBody .sheetrow'),
    dim: r => r.height,
    fmt: (el, r) => `${label(el)} ${round(r.height)}px`,
    noun: 'rows',
    slice: 4,
  });

  /* 3c-plan. #28 item 11: every row (`.prow`) AND tile (`.plr`, the player
        pickers `pickFive` paints -- the closing-window picker at level 1, and
        several rule kinds' player pickers on the add page) is at least 48px
        tall, at the same three phone widths the other row checks sweep
        (`plan-rows.mjs` drives the sweep; this cell is what it reads back at
        each width). `#sheetPlan` holds two panes (`#planMain`, `#planSub`),
        only one shown at a time, so this reads both classes from the dialog
        as a whole and lets `!el.closest('[hidden]')` drop whichever pane is
        not on show -- the same exclusion `minSizeCheck`'s caller-picked
        `elements()` already does for other hidden subtrees. Same "open but
        nothing measured is a failure" shape as the who's-here-row check
        above. */
  const planSheet = document.getElementById('sheetPlan');
  const planOpen = !!planSheet && planSheet.open;
  minSizeCheck('plan rows ≥ 48px', {
    gateOpen: planOpen,
    notOpenMsg: '#sheetPlan not open',
    emptyMsg: '#sheetPlan open but 0 rows/tiles found -- structural row/tile detection matched nothing',
    elements: () => [...document.querySelectorAll('#sheetPlan .prow, #sheetPlan .plr')].filter((el) => !el.closest('[hidden]')),
    dim: r => r.height,
    fmt: (el, r) => `${label(el)} ${round(r.height)}px`,
    noun: 'rows/tiles',
    slice: 4,
  });

  /* 3c-plan2. #28 review finding: item 11 also asks the sheet's OTHER
        controls -- not only its rows -- to clear 48x48: the strategy
        segments, the kind/closing chips, the player tiles, the stepper
        buttons, the back button, the ✕ and "Add rule". Same fixed-list shape
        as the today-and-game-controls check below, scoped to `#sheetPlan`
        and gated on the dialog being open the same way `plan rows ≥ 48px`
        above is. `!el.closest('[hidden]')` drops whichever pane (level 1 or
        the add page) is not on show, same as the row check. */
  const PLAN_CONTROL_SEL = [
    '#stratseg button', '.prow', '.chip', '.plr', '.pstep-btn',
    '#planBack', '#sheetPlanClose', '#planAddRuleBtn',
  ].map((s) => `#sheetPlan ${s}`).join(', ');
  minSizeCheck('plan sheet controls ≥ 48px', {
    gateOpen: planOpen,
    notOpenMsg: '#sheetPlan not open',
    emptyMsg: '#sheetPlan open but 0 controls found -- structural control detection matched nothing',
    elements: () => [...document.querySelectorAll(PLAN_CONTROL_SEL)].filter((el) => !el.closest('[hidden]')),
    dim: (r) => Math.min(round(r.width), round(r.height)),
    fmt: (el, r) => `${label(el)} ${round(r.width)}×${round(r.height)}`,
    noun: 'controls',
    slice: 6,
  });

  /* 3c. #69 (restyle Today and the game screen) "What would settle it" item 4:
        the controls the restyle itself names, all at least 48x48 -- a floor
        higher than the app-wide 44px sweep above, the same shape as the
        settings-row and who's-here-row checks (a fixed, named list, not
        structural discovery), because item 4 is a fixed, named list too.
        `today-game-rows.mjs` drives Today, the game screen and the game
        screen with every fold open, at the three phone widths the other two
        row checks sweep at. No "open" gate of its own: the list is already
        scoped to whichever of Today/the game screen is on show, so an empty
        result is 0-found, not not-open. */
  const ITEM4_SEL = [
    '#teamBtn', '#todayNewDay', '#settingsBtn', '.today-game', '#todayAddGame',
    '#todayTeam', '#todaySeason', '#backBtn', '.phrase', '.tl-name',
    '#regen', '.fold > summary', 'details.dz > summary', '.seg button',
    '#abBench', '#abCard',
  ].join(', ');
  minSizeCheck('today and game controls ≥ 48px', {
    gateOpen: true,
    notOpenMsg: null,
    emptyMsg: "none of item 4's controls were found on screen",
    // #72: `.tl-row` (the old target) is replaced by `.tl-name` (the row's
    // own button now) -- skipRowPitchName excludes it here too, in the
    // one-row layout, for the same reason it is skipped in the 44px sweep
    // above.
    elements: () => [...document.querySelectorAll(ITEM4_SEL)]
      .filter((el) => !el.closest('[hidden]') && !skipRowPitchName(el)),
    dim: (r) => Math.min(round(r.width), round(r.height)),
    fmt: (el, r) => `${label(el)} ${round(r.width)}×${round(r.height)}`,
    noun: 'controls',
    slice: 6,
  });

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
        already moved onto for the same reason. This is the one check here that
        moves the page, and it puts back what it moves: `scrollIntoView` can
        scroll a sheet's own body (an ordinary element, not the window), and
        that element is reused, not rebuilt, the next time its dialog opens --
        a later check sharing this page would otherwise inherit the scroll. */
  const winH = window.visualViewport?.height ?? window.innerHeight;
  const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const cut = [];
  const audited = [];
  for (const dlg of document.querySelectorAll('[role="dialog"], dialog[open]')) {
    if (dlg.hidden || !visible(dlg)) continue;
    const foc = [...dlg.querySelectorAll(FOCUSABLE)]
      .filter(el => visible(el) && !el.closest('[hidden]') && el.type !== 'hidden');
    if (!foc.length) continue;
    const last = foc[foc.length - 1];
    const scrolled = [dlg, ...dlg.querySelectorAll('*')].map(el => [el, el.scrollTop, el.scrollLeft]);
    last.scrollIntoView({ block: 'nearest' });
    const r = last.getBoundingClientRect();
    for (const [el, top, left] of scrolled) { el.scrollTop = top; el.scrollLeft = left; }
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
