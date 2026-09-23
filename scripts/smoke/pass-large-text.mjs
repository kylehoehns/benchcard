/* #66, "What would settle it" items 1-3: at 320px/32px text every Today
 * card's own pieces stay whole -- nothing ellipsized, nothing clipped by the
 * card's own padding. At 390px/16px (the default) no `.pass-summary` is ever
 * ellipsized -- the spec's later decision is that the summary wraps at every
 * size, not only inside the 19em block, so Ravens' full summary (too long for
 * 332px at this root) is allowed a second line and must read whole; the
 * other three summaries still fit one line and are held to that. `.pass-title`
 * keeps its own base rule and stays one line, not ellipsized, at every card.
 * New check, `/new-guard`: seen failing against `main`'s CSS, where
 * `.pass-summary` is `white-space: nowrap; overflow: hidden; text-overflow:
 * ellipsis` with no wrap rule at its base, and `.pass-top` has no
 * `flex-wrap`.
 *
 * `OVERFLOW_PROBE` (item 3's own check, run by `appLargeTextPass`) cannot see
 * this defect: it compares an element's edge to the VIEWPORT, and `.pass-*`
 * sits inside the card's own padding, well short of 320px, the whole time --
 * ellipsis quietly eats the overflow before any edge ever reaches the
 * viewport. So this measures the two things that probe cannot:
 * `scrollWidth`/`clientWidth` (nothing truncated) and the status's own right
 * edge against the CARD's content edge, not the viewport's. */
import { evalIn, WIDTH, HEIGHT } from './dom.mjs';
import { FOUR, RICH, reloadWithRecord } from './fixtures.mjs';
import { nameOf, LARGE_TEXT_PX, LARGE_TEXT_WIDTH } from './registry.mjs';
import { GAME_SUMMARIES } from './game-passes.mjs';

// Ravens' full summary, imported from `game-passes.mjs`'s own `GAME_SUMMARIES`
// table (the one place that string is written down) -- never recomputed from
// `passSummary`, the way `AGENTS.md`'s reuse rule asks, and never a second
// copy of the literal either.
const RAVENS_SUMMARY = GAME_SUMMARIES.Ravens;

/* Every `.today-game` card's own measurements, read once per width/root pair
 * so both items below share one evaluate. `contentRight` is the card's own
 * padding-right subtracted from its right edge -- "the card's content edge"
 * item 1 asks the status's right edge to clear -- read from the card's own
 * computed style, never a copied `1.125rem`. `lineHeight` falls back to
 * `1.5 * font-size` when computed as `normal`, exactly as item 2 specifies. */
const MEASURE = `(() => {
  const cards = [...document.querySelectorAll('.today-game')];
  const lineHeightOf = el => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight);
    return Number.isFinite(lh) ? lh : parseFloat(cs.fontSize) * 1.5;
  };
  return JSON.stringify(cards.map(card => {
    const rect = card.getBoundingClientRect();
    const padRight = parseFloat(getComputedStyle(card).paddingRight) || 0;
    const contentRight = rect.right - padRight;
    const partOf = cls => {
      const el = card.querySelector('.' + cls);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
        right: r.right, top: r.top, height: r.height, lineHeight: lineHeightOf(el),
        text: el.innerText, hyphens: getComputedStyle(el).hyphens,
      };
    };
    return {
      title: card.querySelector('.pass-title')?.textContent ?? null,
      contentRight,
      summary: partOf('pass-summary'), passTitle: partOf('pass-title'),
      when: partOf('pass-when'), status: partOf('pass-status'), top: partOf('pass-top'),
    };
  }));
})()`;

// `.pass-when`, `.pass-status` and `.pass-top` are simple single-word
// classes; only `passTitle` (camelCase, matching `MEASURE`'s own key) and
// `top` need a rewrite to reach `pass-title`/`pass-top`.
const SELECTOR_OF = { summary: 'pass-summary', passTitle: 'pass-title', status: 'pass-status', top: 'pass-top' };

// Sets the emulated root font size and viewport width together, since
// `Page.setFontSizes` on an already-laid-out document leaves it unreflowed --
// every call site pairs it with a reload. `safe: true` gives each of the two
// sends its own independent catch, the restore discipline the `finally`
// below relies on: if the font-size reset fails, the viewport reset is still
// attempted rather than abandoned.
async function setRoot(c, px, width, { safe = false } = {}) {
  const guard = p => safe ? p.catch(() => {}) : p;
  await guard(c.send('Page.setFontSizes', { fontSizes: { standard: px, fixed: px } }));
  await guard(c.send('Emulation.setDeviceMetricsOverride',
    { width, height: HEIGHT, deviceScaleFactor: 2, mobile: true }));
}

// Ravens' summary is asserted whole at both sizes item 1 and item 2 name --
// `where` names which pass a failure came from, since both share one wording.
function checkRavensSummary(cards, where, problems) {
  const ravens = cards.find(card => card.title === 'Ravens');
  if (!ravens) problems.push(`no card titled Ravens at ${where}`);
  else if (ravens.summary?.text !== RAVENS_SUMMARY) {
    problems.push(`Ravens' .pass-summary reads ${JSON.stringify(ravens.summary?.text)} at ${where}, `
      + `want ${JSON.stringify(RAVENS_SUMMARY)}`);
  }
}

export async function passLargeTextPass(c, origin) {
  const problems = [];
  try {
    // Item 1: 320px wide, a 32px root -- "set the font size the way
    // app-large-text.mjs does (set, then reload)".
    await setRoot(c, LARGE_TEXT_PX, LARGE_TEXT_WIDTH);
    await reloadWithRecord(c, origin, FOUR);

    const cards320 = JSON.parse(await evalIn(c, MEASURE));
    for (const card of cards320) {
      const label = card.title ?? '(untitled card)';
      // Owls has no tip-off in FOUR (fixtures.mjs), so `renderPass` never
      // appends a `.pass-when` for it (teams-view.js: `if (when)
      // top.append(...)`) -- a missing `.pass-when` there is the app working
      // as designed, not a defect this check should flag.
      for (const cls of ['summary', 'passTitle', 'status', 'top']) {
        const p = card[cls];
        const selector = SELECTOR_OF[cls];
        if (!p) { problems.push(`${label}: no .${selector} found`); continue; }
        if (p.scrollWidth > p.clientWidth) {
          problems.push(`${label}'s .${selector} scrollWidth is ${p.scrollWidth}px, clientWidth is ${p.clientWidth}px (ellipsized/clipped)`);
        }
      }
      if (card.when && card.when.scrollWidth > card.when.clientWidth) {
        problems.push(`${label}'s .pass-when scrollWidth is ${card.when.scrollWidth}px, clientWidth is ${card.when.clientWidth}px (ellipsized/clipped)`);
      }
      if (card.status && card.status.right > card.contentRight + 0.5) {
        problems.push(`${label}'s .pass-status right edge is ${card.status.right.toFixed(1)}px, `
          + `past the card's content edge at ${card.contentRight.toFixed(1)}px`);
      }
      // A mid-word break from `overflow-wrap: anywhere` alone lands with no
      // mark ("Panth" / "ers", reads as two words) -- `hyphens: auto` asks
      // Chrome for a dictionary-point break with a hyphen when the browser
      // has one, keeping `overflow-wrap` only as the fallback for a name
      // that has none. `lang="en"` on `index.html` is what lets it fire.
      if (card.passTitle && card.passTitle.hyphens !== 'auto') {
        problems.push(`${label}'s .pass-title computed hyphens is ${JSON.stringify(card.passTitle.hyphens)}, want "auto"`);
      }
    }
    checkRavensSummary(cards320, '320px/32px text', problems);

    // Item 2: back to the default 390px/16px root -- same reload discipline,
    // the font size cannot be re-applied without one.
    await setRoot(c, 16, WIDTH);
    await reloadWithRecord(c, origin, FOUR);

    // Item 2, as the spec now reads: the summary wraps at every size, so
    // Ravens (the one FOUR summary too long for 332px at 16px root) is
    // allowed to spill onto a second line -- it must not be ellipsized and
    // must read the full string. The other three summaries fit one line
    // already and are held to that. The title keeps its own base rule
    // (one line, not ellipsized) for every card.
    const ONE_LINE_SUMMARY_TITLES = ['Panthers', 'Game 3', 'Owls'];
    const cards390 = JSON.parse(await evalIn(c, MEASURE));
    for (const card of cards390) {
      const label = card.title ?? '(untitled card)';
      const summary = card.summary;
      if (!summary) { problems.push(`${label}: no .pass-summary found at 390px/16px`); }
      else if (summary.scrollWidth > summary.clientWidth) {
        problems.push(`${label}'s .pass-summary is ellipsized at 390px/16px `
          + `(scrollWidth ${summary.scrollWidth}px > clientWidth ${summary.clientWidth}px)`);
      } else if (ONE_LINE_SUMMARY_TITLES.includes(label) && summary.height > summary.lineHeight + 1) {
        problems.push(`${label}'s .pass-summary is ${summary.height.toFixed(1)}px tall at 390px/16px, `
          + `want at most one line-height (${summary.lineHeight.toFixed(1)}px) + 1px`);
      }

      const title = card.passTitle;
      if (!title) { problems.push(`${label}: no .pass-title found at 390px/16px`); }
      else {
        if (title.height > title.lineHeight + 1) {
          problems.push(`${label}'s .pass-title is ${title.height.toFixed(1)}px tall at 390px/16px, `
            + `want at most one line-height (${title.lineHeight.toFixed(1)}px) + 1px`);
        }
        if (title.scrollWidth > title.clientWidth) {
          problems.push(`${label}'s .pass-title is ellipsized at 390px/16px `
            + `(scrollWidth ${title.scrollWidth}px > clientWidth ${title.clientWidth}px)`);
        }
      }

      if (card.when && card.status) {
        const delta = Math.abs(card.when.top - card.status.top);
        if (delta > 2) {
          problems.push(`${label}'s .pass-top is not one row at 390px/16px: `
            + `.pass-when top ${card.when.top.toFixed(1)}px vs .pass-status top ${card.status.top.toFixed(1)}px (${delta.toFixed(1)}px apart)`);
        }
      }
    }
    checkRavensSummary(cards390, '390px/16px', problems);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    // Same restore discipline `appLargeTextPass` closes with: never leave the
    // emulated font size or viewport on. Same courtesy `gamePassesPass`/
    // `passUnderwayPass` pay: leave the fixture as `goRich` left it (RICH)
    // for whatever check runs next.
    await setRoot(c, 16, WIDTH, { safe: true });
    await reloadWithRecord(c, origin, RICH).catch(() => {});
  }
  return {
    name: nameOf('passlargetext'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `every .today-game card's .pass-summary/.pass-title/.pass-when/.pass-status/.pass-top fit their own `
        + `box at ${LARGE_TEXT_WIDTH}px/${LARGE_TEXT_PX}px, .pass-status clears the card's content edge, `
        + `Ravens' summary reads whole at both sizes, no .pass-summary is ellipsized at 390px/16px, and `
        + `.pass-title stays one line at 390px/16px`,
  };
}
