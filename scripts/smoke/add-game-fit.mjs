import { WIDTH, HEIGHT, TODAY_HOME } from './dom.mjs';
import { evalJSON, openAddGameFlow as openFlow, realTap, settle, tap, waitClosed } from './sheet-drive.mjs';

/* #32's hard-size look checks, split out of `add-game-flow.mjs` when that
   file crossed the 40,000-byte ceiling `smoke-size.test.js` holds every smoke
   module to. The seam is a real one rather than a byte count cut in half:
   everything here drives the flow at a size it was NOT designed against
   (320px, a 32px root, names longer than any the fixture ships) and measures
   whether the text survives it. `add-game-flow.mjs` keeps the behavior --
   the three steps, the back gesture, what a commit puts in the day.

   Each check re-emulates the viewport and the root font itself and puts both
   back in a `finally`, so this file can run before or after any other and
   leaves the phone as it found it. */
/* Item 10's one clause no sweep can express. The large-text and touch passes
   measure overflow, stranding and target size at 320px/32px; "no word broken
   mid-word" is counted in line boxes, not widths -- a Range around a name
   that has ALREADY been split reports the union of its two lines, which is
   never wider than the box that split it, so a width probe calls it clean.
   Same measurement `team-screen.mjs`'s `identNotBrokenMidWord` makes, on the
   same ordinary "Marcus Williams", at the cell where the tiles are narrowest.
   The root size is asserted before the name is, so a cell that silently
   failed to apply cannot report a pass. */
/* B1: on this fixture, none of the eleven names actually overflow their own
   tile at either breakpoint -- measured, not assumed (every word's own Range
   clears its tile's right edge at both 390×844/16px and 320×844/32px). What
   does reproduce, red-first, is the roster's longest possible entry: a
   single word longer than any of the fixture's own. Before this fix, `.nm`
   was `overflow: visible` (app.css, decision 8), which gives a grid item an
   *automatic minimum size* equal to its own unbroken content -- one long
   enough name grows its column past what `.pick`'s own box can hold, and
   every tile after it in that row goes with it (293px of tiles in a 256px
   box at 320px/32px, unpatched). That is the shape "clipped" actually takes
   here: not a single letter shaved off in place, but a whole row pushed
   past the edge of the sheet. Widening `.pick`'s columns was the first fix
   tried and it made this worse, not better -- the spec holds step 2 to
   three across at 390×844/16px (`stepTwoReads`, below), so the fix instead
   leaves `.pick`'s own three-column grid untouched and gives `.plr` itself
   `min-width: 0`, which is what actually stops a name's automatic minimum
   size from reaching the grid track, plus `overflow: hidden` and a
   two-line clamp on `.nm` as the backstop for whatever still does not fit.
   The clamp still wraps at word boundaries first, so a name that fits
   across two words is never split mid-word the way #31's
   `overflow-wrap: anywhere` was ("Marc/us/Willi/ams"). */
async function tileGridFitsAt(c, ck, width, px) {
  await c.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: px } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await settle(c);
    await tap(c, TODAY_HOME);
    // The fixture's own longest name is "Casey Lindqvist" (9-letter surname).
    // A coach can type longer -- one word wider than any tile column is the
    // shape that grows a grid track past its box, so that is what gets
    // measured here rather than a hand-picked width.
    await evalJSON(c, `(async () => {
      const s = await import('/state.js');
      s.state.players[0].name = 'Marcus Featherstonehaugh';
      return JSON.stringify(true);
    })()`);
    await realTap(c, '#todayAddGame');
    await realTap(c, '#agNext');
    const m = await evalJSON(c, `(() => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const pick = document.querySelector('#agBody .pick');
      if (!pick) return JSON.stringify({ root, found: false });
      const tiles = [...pick.querySelectorAll('.plr')];
      const overflowing = [];
      for (const t of tiles) {
        const tb = t.getBoundingClientRect();
        const nm = t.querySelector('.nm');
        if (!nm) continue;
        const walk = document.createTreeWalker(nm, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          for (const w of n.data.matchAll(/\\S+/g)) {
            const r = document.createRange();
            r.setStart(n, w.index);
            r.setEnd(n, w.index + w[0].length);
            const over = Math.round(r.getBoundingClientRect().right - tb.right);
            if (over > 1) overflowing.push({ text: nm.textContent.replace(/\\s+/g, ' ').trim(), word: w[0], over });
          }
        }
      }
      return JSON.stringify({
        root, found: true, count: tiles.length,
        scrollW: pick.scrollWidth, clientW: pick.clientWidth,
        overflowing: overflowing.filter(o => o.text !== 'Marcus Featherstonehaugh'),
      });
    })()`);
    await evalJSON(c, `(async () => {
      const s = await import('/state.js');
      s.state.players[0].name = 'Marcus Williams';
      return JSON.stringify(true);
    })()`);
    if (!ck(m.root === px, `the ${width}px cell is rendering at a ${m.root}px root, so it is measuring nothing`)) return;
    if (!ck(m.found && m.count === 11, `step 2 shows ${m.count ?? 0} tile(s), want the fixture's 11`)) return;
    ck(m.scrollW - m.clientW <= 1,
      `at ${width}px/${px}px a name longer than the roster's own grows the tile grid `
      + `${m.scrollW}px wide in a ${m.clientW}px sheet -- ${m.scrollW - m.clientW}px of it past the edge (B1)`);
    ck(m.overflowing.length === 0,
      `at ${width}px/${px}px ${m.overflowing.length} of the fixture's own name(s) overflow their tile: `
      + m.overflowing.map(o => `"${o.word}" in "${o.text}" by ${o.over}px`).join(', '));
    await realTap(c, '#agClose');
    await waitClosed(c, '#addGameFlow');
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
}

async function tileGridFits(c, ck) {
  await tileGridFitsAt(c, ck, 390, 16);
  await tileGridFitsAt(c, ck, 320, 32);
}

async function tileNotBrokenAt(c, ck, width, px) {
  await c.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: px } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await settle(c);
    /* The fixture's own names are short enough to fit a column at both
       breakpoints, so on their own they cannot tell a fix that breaks words
       apart from one that does not -- that is exactly how an earlier
       `overflow-wrap: break-word` passed this while painting
       "Konstantin/os". A first name and a surname each longer than a column
       are injected so the measurement has the case in front of it. */
    await evalJSON(c, `(async () => {
      const s = await import('/state.js');
      // Stashed rather than hardcoded, so the restore below cannot drift from
      // whatever the fixture's first two rows actually are.
      window.__names = [s.state.players[0].name, s.state.players[1].name];
      s.state.players[0].name = 'Konstantinos Papadopoulos';
      s.state.players[1].name = 'Rajeshwaran Balasubramanian';
      return JSON.stringify(true);
    })()`);
    await openFlow(c);
    await realTap(c, '#agNext');
    /* WORD BY WORD, against the name's own characters. Counting the name's
       line boxes is not enough: "Marcus Willia / ms" is two lines for two
       words and reads as fine by that measure while the surname is in
       pieces. So each word gets its own Range -- a word that paints on more
       than one line box has been cut in half, whatever the total. */
    const m = await evalJSON(c, `(() => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const tiles = [...document.querySelectorAll('#agBody .plr')];
      if (!tiles.length) return JSON.stringify({ root, count: 0, broken: [], words: 0 });
      const broken = [];
      let words = 0;
      for (const t of tiles) {
        const nm = t.querySelector('.nm');
        if (!nm) continue;
        const text = nm.textContent.replace(/\\s+/g, ' ').trim();
        const walk = document.createTreeWalker(nm, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          for (const m2 of n.data.matchAll(/\\S+/g)) {
            words++;
            const r = document.createRange();
            r.setStart(n, m2.index);
            r.setEnd(n, m2.index + m2[0].length);
            const tops = new Set([...r.getClientRects()].map(x => Math.round(x.top)));
            if (tops.size > 1) broken.push({ word: m2[0], text });
          }
        }
      }
      return JSON.stringify({ root, count: tiles.length, words, broken });
    })()`);
    if (!ck(m.root === px, `the ${width}px cell is rendering at a ${m.root}px root, so it is measuring nothing`)) return;
    if (!ck(m.count === 11, `step 2 shows ${m.count} tile(s) at ${width}px/${px}px, want the fixture's 11`)) return;
    ck(m.words >= 22, `the tiles at ${width}px/${px}px hold ${m.words} word(s) -- too few to be eleven two-word names`);
    ck(m.broken.length === 0,
      `at ${width}px/${px}px ${m.broken.length} tile name word(s) paint across two lines: `
      + m.broken.map(b => `"${b.word}" in "${b.text}"`).join(', '));
    await realTap(c, '#agClose');
    await waitClosed(c, '#addGameFlow');
  } finally {
    await evalJSON(c, `(async () => {
      const s = await import('/state.js');
      if (window.__names) { s.state.players[0].name = window.__names[0]; s.state.players[1].name = window.__names[1]; }
      return JSON.stringify(true);
    })()`);
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
}

async function tileNotBroken(c, ck) {
  await tileNotBrokenAt(c, ck, 390, 16);
  await tileNotBrokenAt(c, ck, 320, 32);
}

/* I8: at 320px/32px the bar's middle column ("New game" / "1 of 3") wrapped
   to two lines -- a grid item's default `min-width: auto` would not let
   either text give way to its own column -- which grew `.flow-bar-row`
   past the ✕'s own 96px square and read as the ✕ off-center, not as a row
   taller than the control living in it. Both counts come from the same
   per-line-box technique `tileNotBrokenAt` already uses (distinct
   `Range.getClientRects()` tops), against the title and the step count in
   turn, so a single word painting across two lines fails this the same way
   a broken name would.

   Centering is read off the ✕ against the step count, the control it shares a
   row with. It used to be read against `.flow-bar-row`, which was right while
   the bar was one row tall and became wrong the moment the title moved to a
   row of its own at this size: the ✕ then sits at the top of a two-row bar,
   exactly where N8 asks for it, and the old form called that a defect. */
async function flowBarFitsAt32(c, ck) {
  await c.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } });
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width: 320, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
    await settle(c);
    await openFlow(c);
    const m = await evalJSON(c, `(() => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      function lines(el) {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const tops = new Set();
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const rect of r.getClientRects()) tops.add(Math.round(rect.top));
        }
        return tops.size;
      }
      const row = document.querySelector('.flow-bar-row');
      const title = document.querySelector('.flow-t');
      const step = document.getElementById('agStep');
      const close = document.getElementById('agClose');
      if (!row || !title || !step || !close) return JSON.stringify({ root, found: false });
      const rr = row.getBoundingClientRect();
      const cr = close.getBoundingClientRect();
      // A word of the title painting on two lines, the same per-word test the
      // tiles get -- wrapping at the space is fine, splitting a word is not.
      function splitWords(el) {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const out = [];
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          for (const w of n.data.matchAll(/\\S+/g)) {
            const r = document.createRange();
            r.setStart(n, w.index); r.setEnd(n, w.index + w[0].length);
            if (new Set([...r.getClientRects()].map(x => Math.round(x.top))).size > 1) out.push(w[0]);
          }
        }
        return out;
      }
      /* How much room the title's WIDEST WORD has to spare, measured off a
         hidden copy in the title's own font. titleCut below only reports a fit
         that has already failed; this reports how close to failing a fit that
         passes is, which is the number that actually travels between machines.
         No backticks in here: this comment is inside a template literal, and
         one would end it -- the same trap the line-clamp note hit. */
      const sr = step.getBoundingClientRect();
      const widest = Math.max(...title.textContent.trim().split(/\\s+/).filter(Boolean).map(w => {
        const s = document.createElement('span');
        s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + getComputedStyle(title).font;
        s.textContent = w;
        document.body.append(s);
        const x = s.getBoundingClientRect().width;
        s.remove();
        return x;
      }));
      return JSON.stringify({
        root, found: true,
        titleText: title.textContent.trim(), titleLines: lines(title),
        titleSplit: splitWords(title),
        // Ellipsized-away text: what the box can show against what it holds.
        titleCut: title.scrollWidth - title.clientWidth,
        titleSpare: Math.round(title.clientWidth - widest),
        stepText: step.textContent.trim(), stepLines: lines(step),
        closeMid: Math.round(cr.top + cr.height / 2), stepMid: Math.round(sr.top + sr.height / 2),
      });
    })()`);
    if (!ck(m.root === 32, `the 320px cell is rendering at a ${m.root}px root, so it is measuring nothing`)) return;
    if (!ck(m.found, 'step 1 of the flow is missing .flow-bar-row, the title, the step count or ✕')) return;
    /* The title has to be READABLE, not on one line. Pinning one line is what
       truncated it to "Ne…" at this size while every count still read clean:
       the spec says the header reads "New game" (docs/specs/32-add-a-game.md)
       and never offers truncation as a fallback. So: nothing ellipsized away,
       no word split, and at most the two lines its two words need. */
    ck(m.titleCut <= 1,
      `at 320px/32px the flow bar's title is cut off by ${m.titleCut}px -- it reads "${m.titleText}" `
      + 'but cannot show it, so the screen loses its name (I8)');
    ck(m.titleSplit.length === 0,
      `at 320px/32px the flow bar's title splits ${JSON.stringify(m.titleSplit)} across two lines (I8)`);
    ck(m.titleLines <= 2,
      `at 320px/32px "${m.titleText}" paints across ${m.titleLines} lines in the flow bar, want at most 2 (I8)`);
    ck(m.stepLines === 1,
      `at 320px/32px the step count "${m.stepText}" paints across ${m.stepLines} lines in the flow bar (I8)`);
    /* And it has to fit with room to spare, not exactly. `titleCut <= 1` alone
       went green here with 3px of slack and red on CI by 14px on the very same
       commit: font metrics are the machine's, not the stylesheet's, so a margin
       thinner than one character is a coincidence dressed as a fit. One root
       font size is the smallest margin that means anything at this text size. */
    ck(m.titleSpare >= m.root,
      `at 320px/32px "${m.titleText}" fits its box with only ${m.titleSpare}px to spare, want at least `
      + `${m.root}px -- a margin this thin is a font-metric difference away from being cut off (I8)`);
    /* The ✕ against the control it SHARES A ROW WITH, not against the bar. The
       bar is two rows tall at this size (the title takes one of its own), so
       measuring the ✕ against the whole bar reports "not centered" about a
       control that is exactly where it belongs. What would still be a defect
       is the ✕ and the step count sitting at different heights. */
    ck(Math.abs(m.closeMid - m.stepMid) <= 1,
      `at 320px/32px ✕'s middle is at ${m.closeMid}px and the step count's at ${m.stepMid}px -- `
      + `they share a row and are not lined up on it (I8)`);
    await realTap(c, '#agClose');
    await waitClosed(c, '#addGameFlow');
  } finally {
    await c.send('Page.setFontSizes', { fontSizes: { standard: 16, fixed: 16 } });
    await c.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  }
}

/* The three run together and share one problem list, so one call site in
   `add-game-flow.mjs` covers them all. */
export async function addGameFitChecks(c, ck) {
  await tileNotBroken(c, ck);
  await tileGridFits(c, ck);
  await flowBarFitsAt32(c, ck);
}
