/* #141 (one control each), item 3 ("One bar row"): `.mrow` (the Plan sheet's
 * minutes bars), `.dayrow` (the day chart, Season screen) and `.sn-row`
 * (Season's own ledger, the track variant with a fill) shared one label /
 * track / value grid with their own, separately-declared columns, track
 * height and track color. `.barrow` is the one shared rule now; each row
 * still sets only its own `--barrow-cols` / `--barrow-track-h` /
 * `--barrow-track`.
 *
 * "Nothing a coach sees changes" (decision 3) is proved by pinning the
 * computed values THIS FILE measured on `origin/main` at 2f28915, before any
 * CSS here moved -- not by re-deriving them from the CSS this ticket writes,
 * which would just prove the refactor agrees with itself. Column widths are
 * read off `getComputedStyle(row).gridTemplateColumns` (the resolved px
 * string, not the `rem` source), track color through the same
 * `getComputedStyle(...).backgroundColor` resolution every other check here
 * uses instead of a hand-typed literal for the color itself -- only the
 * numbers below are hand-typed, and they are measurements, not a formula.
 *
 * #144 moved `.dayrow` and `.sn-row` into a `.pgrp` card on purpose (item 1)
 * and set `.sn-row`'s track to `var(--track)` on purpose (item 2), so their
 * pre-#141 literals are no longer "nothing changed" -- they are exactly what
 * #144 changed. Pinning a new literal for them here would just be a second,
 * looser copy of what `season-look.mjs` (the #144 guard, Proof's "New smoke
 * check") already owns for those two rows: it checks `.sn-row`'s track
 * against `var(--track)` itself, not a hand-typed hex, the same way it
 * already checks the radius against `var(--r-full)`. Only `.mrow` (the game
 * screen's Plan sheet, which #144 does not touch) keeps its pinned literal
 * here. */
import { evalIn, step, TODAY_HOME, WIDTH, setWidth } from './dom.mjs';
import { goRich } from './fixtures.mjs';

const WIDTHS = [390, 1280];
const TOL = 2;

async function measureRow(c, rowSel, trackSel, valueSel) {
  return JSON.parse(await evalIn(c, `(() => {
    const row = document.querySelector(${JSON.stringify(rowSel)});
    if (!row) return JSON.stringify(null);
    const track = row.querySelector(${JSON.stringify(trackSel)});
    const value = row.querySelector(${JSON.stringify(valueSel)});
    return JSON.stringify({
      cols: getComputedStyle(row).gridTemplateColumns,
      trackH: track ? Math.round(track.getBoundingClientRect().height * 100) / 100 : null,
      trackColor: track ? getComputedStyle(track).backgroundColor : null,
      valueAlign: value ? getComputedStyle(value).textAlign : null,
    });
  })()`));
}

/* Measured on this branch's `main`-equivalent app.css (before item 3's CSS
 * moved anything), by this same file's own `measureRow`, at 390 and 1280,
 * light and dark. The middle (bar) column is a flexible track, so its
 * resolved px width differs between 390 and 1280 -- both widths are pinned,
 * not just one. Only `.mrow` remains: #144 owns `.dayrow` and `.sn-row` now
 * (see the file comment above). */
const WANT = {
  light: {
    390:  {
      mrow: { cols: '76.7969px 220.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(28, 28, 30, 0.05)', valueAlign: 'right' },
    },
    1280: {
      mrow: { cols: '76.7969px 312.828px 41.5938px', trackH: 9.91, trackColor: 'rgba(28, 28, 30, 0.05)', valueAlign: 'right' },
    },
  },
  dark: {
    390:  {
      mrow: { cols: '76.7969px 220.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(244, 244, 246, 0.06)', valueAlign: 'right' },
    },
    1280: {
      mrow: { cols: '76.7969px 312.828px 41.5938px', trackH: 9.91, trackColor: 'rgba(244, 244, 246, 0.06)', valueAlign: 'right' },
    },
  },
};

function check(problems, theme, width, where, got, want) {
  if (!got) { problems.push(`${theme} ${width}px: ${where} not found -- nothing measured`); return; }
  if (got.cols !== want.cols) problems.push(`${theme} ${width}px: ${where} columns are "${got.cols}", want "${want.cols}"`);
  if (Math.abs(got.trackH - want.trackH) > TOL) problems.push(`${theme} ${width}px: ${where} track is ${got.trackH}px tall, want ${want.trackH} +/-${TOL}`);
  if (got.trackColor !== want.trackColor) problems.push(`${theme} ${width}px: ${where} track color is ${got.trackColor}, want ${want.trackColor}`);
  if (got.valueAlign !== want.valueAlign) problems.push(`${theme} ${width}px: ${where} value align is ${got.valueAlign}, want ${want.valueAlign}`);
}

export async function barRowsPass(c, origin) {
  const problems = [];
  let measured = 0;

  try {
    for (const theme of ['light', 'dark']) {
      await goRich(c, origin, { theme });
      for (const width of WIDTHS) {
        await setWidth(c, width);

        // `.mrow`: the Plan sheet's minute bars, inside the "Stint by stint"
        // `<details>` on the game screen -- closed by default, so opened here.
        // #144 does not touch the game screen, so this is the only row left
        // to pin here (see the file comment above for `.dayrow`/`.sn-row`).
        await evalIn(c, `document.getElementById('tabledetails').open = true`);
        const mrow = await measureRow(c, '.mrow', '.track', '.v');
        check(problems, theme, width, '.mrow', mrow, WANT[theme][width].mrow);
        if (mrow) measured++;
      }
    }
    await setWidth(c, WIDTH);

    // Rule 2a: 1 row x 2 widths x 2 themes = 4 measurements expected.
    if (measured < 4) problems.push(`only ${measured}/4 bar-row measurements were taken -- a selector stopped matching`);
  } catch (e) {
    problems.push(e.message.split('\n')[0]);
  } finally {
    await evalIn(c, step(TODAY_HOME));
    await goRich(c, origin);
  }

  return {
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `.mrow matches its pinned columns, track height/color and value alignment, 390/1280px light and dark`,
  };
}
