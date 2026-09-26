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
 * numbers below are hand-typed, and they are measurements, not a formula. */
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
 * not just one. */
const WANT = {
  light: {
    390:  {
      mrow:   { cols: '76.7969px 220.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(28, 28, 30, 0.05)', valueAlign: 'right' },
      dayrow: { cols: '76.7969px 220.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(28, 28, 30, 0.05)', valueAlign: 'right' },
      sn_row: { cols: '144px 143.625px 48px', trackH: 6.39, trackColor: 'rgba(28, 28, 30, 0.15)', valueAlign: 'right' },
    },
    1280: {
      mrow:   { cols: '76.7969px 312.828px 41.5938px', trackH: 9.91, trackColor: 'rgba(28, 28, 30, 0.05)', valueAlign: 'right' },
      dayrow: { cols: '76.7969px 634.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(28, 28, 30, 0.05)', valueAlign: 'right' },
      sn_row: { cols: '144px 557.625px 48px', trackH: 6.39, trackColor: 'rgba(28, 28, 30, 0.15)', valueAlign: 'right' },
    },
  },
  dark: {
    390:  {
      mrow:   { cols: '76.7969px 220.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(244, 244, 246, 0.06)', valueAlign: 'right' },
      dayrow: { cols: '76.7969px 220.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(244, 244, 246, 0.06)', valueAlign: 'right' },
      sn_row: { cols: '144px 143.625px 48px', trackH: 6.39, trackColor: 'rgba(244, 244, 246, 0.16)', valueAlign: 'right' },
    },
    1280: {
      mrow:   { cols: '76.7969px 312.828px 41.5938px', trackH: 9.91, trackColor: 'rgba(244, 244, 246, 0.06)', valueAlign: 'right' },
      dayrow: { cols: '76.7969px 634.422px 41.5938px', trackH: 9.91, trackColor: 'rgba(244, 244, 246, 0.06)', valueAlign: 'right' },
      sn_row: { cols: '144px 557.625px 48px', trackH: 6.39, trackColor: 'rgba(244, 244, 246, 0.16)', valueAlign: 'right' },
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
        await evalIn(c, `document.getElementById('tabledetails').open = true`);
        const mrow = await measureRow(c, '.mrow', '.track', '.v');
        check(problems, theme, width, '.mrow', mrow, WANT[theme][width].mrow);
        if (mrow) measured++;

        // `.dayrow` and the ledger's `.sn-row` (the track variant, not the
        // trackless per-game one) both live on Season (#30 moved the day
        // chart there).
        await evalIn(c, step(TODAY_HOME));
        await evalIn(c, step(`document.querySelector('#todaySeason').click()`));
        const dayrow = await measureRow(c, '.dayrow', '.trk', '.v');
        check(problems, theme, width, '.dayrow', dayrow, WANT[theme][width].dayrow);
        if (dayrow) measured++;

        const snRow = await measureRow(c, '#seasonbox .sn-list .sn-row', '.sn-track', '.sn-min');
        check(problems, theme, width, '.sn-row', snRow, WANT[theme][width].sn_row);
        if (snRow) measured++;

        await evalIn(c, step(TODAY_HOME));
        await evalIn(c, step(`document.querySelector('.today-game').click()`));
      }
    }
    await setWidth(c, WIDTH);

    // Rule 2a: 3 rows x 2 widths x 2 themes = 12 measurements expected.
    if (measured < 12) problems.push(`only ${measured}/12 bar-row measurements were taken -- a selector stopped matching`);
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
      : `.mrow, .dayrow and .sn-row all match their own pinned columns, track height/color and value alignment, 390/1280px light and dark`,
  };
}
