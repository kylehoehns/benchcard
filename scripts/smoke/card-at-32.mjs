import { evalIn, IS_CUT } from './dom.mjs';
import { nameOf } from './registry.mjs';
import { PLAYERS, UI, SEED } from './fixtures.mjs';
import { LARGE_TEXT_PX } from './sizes.mjs';
import { land } from './page-state.mjs';
import { seasonDate } from '../../app/storage.js';
import { smokeToday } from './clock.mjs';
import { recorder, verdict } from './verdict.mjs';

/* #24 item 5: the card does not scale. Extends the `cardsize` row rather than
   adding a new one — same seam, same name, so `--only "card is 3.45 × 5in"`
   proves this too. Reuses the existing `Page.setFontSizes` idiom (see
   `appLargeTextPass`) for the 32px root. `card.css` and `card.js`'s fitting
   are untouched by #24, so this MEASURES that stays true rather than
   implementing anything: the card's own font stack is set from canvas
   `measureText`, independent of the root rem this ticket changes. */
/* #29 decisions 2 and 5: `.card` (inside `#sheet`) only shows on screen in
   the Card view; a fresh/reloaded page lands on Timeline (the default), so
   this clicks `#viewSeg`'s Card button first -- the same click
   `smoke-checks.js`'s own "card is 3.45 × 5in" check makes -- rather than
   measuring a `.card` that exists but is not laid out. */
async function measureCard(c) {
  return JSON.parse(await evalIn(c, `(() => {
    const viewCard = document.querySelector('#viewSeg button[data-view="card"]');
    if (viewCard) viewCard.click();
    const card = document.querySelector('.card:not(.card-copy)');
    if (!card) return JSON.stringify(null);
    const z = card.currentCSSZoom || 1;
    const r = card.getBoundingClientRect();
    const five = card.querySelector('.five');
    const chg = card.querySelector('.chg');
    return JSON.stringify({
      w: Math.round(r.width / z * 100) / 100,
      h: Math.round(r.height / z * 100) / 100,
      five: five ? getComputedStyle(five).fontSize : null,
      chg: chg ? getComputedStyle(chg).fontSize : null,
    });
  })()`));
}

/* Runs one probe against its own recorder and folds the verdict onto the
 * cold row's `check`: ` | <failPrefix>: <failures>` when it failed, else
 * ` | <the probe's ok text>`. A probe that throws is judged with what it
 * recorded before the throw, so one probe cannot end the others. */
async function foldProbe(check, failPrefix, probe) {
  const rec = recorder();
  let thrown;
  try { await probe(rec); } catch (e) { thrown = e; }
  const v = verdict(rec, thrown);
  check.pass = check.pass && v.pass;
  check.detail += v.pass ? ` | ${v.detail}` : ` | ${failPrefix}: ${v.detail}`;
}

export async function cardAt32Pass(c, origin, report) {
  const check = report.checks.find(k => k.name === nameOf('cardsize'));
  if (!check) return; // the base check is gone -- nothing here to extend

  const at16 = await measureCard(c);
  if (!at16) {
    check.pass = false;
    check.detail += ' | no .card at a 16px root to compare against';
    return;
  }

  await foldProbe(check, '32px root', async rec => {
    let at32;
    try {
      await land(c, origin, { record: 'kept', textPx: LARGE_TEXT_PX });
      at32 = await measureCard(c);
    } finally {
      // Never leave the emulated font size on: land back at 16px.
      await land(c, origin, { record: 'kept' });
    }

    if (!at32) {
      rec.fail('no .card at a 32px root');
    } else {
      rec.check(Math.abs(at32.w - at16.w) <= 1 && Math.abs(at32.h - at16.h) <= 1,
        `card measures ${at32.w}×${at32.h}px at a 32px root, ${at16.w}×${at16.h}px at 16px`);
      rec.check(at16.five === at32.five, `.five is ${at32.five} at a 32px root, ${at16.five} at 16px`);
      rec.check(at16.chg === at32.chg, `.chg is ${at32.chg} at a 32px root, ${at16.chg} at 16px`);
      rec.ok(`32px root: unchanged (${at32.w}×${at32.h}px, .five ${at32.five}, .chg ${at32.chg})`);
    }
  });

  await cardFitProbe(c, origin, check);
  await multiGameProbe(c, origin, check);
}

/* #103 item 4: the ticket's own worst case for the corner (`cornerLabel`,
   storage.js) -- a 20-character opponent alongside "Wed 12:30 PM", the
   longest of the spec's worked examples. `.when` is `flex: none` and the
   title's own available width already subtracts the corner's measured width
   (`buildCard`), so this MEASURES that stays true rather than re-implementing
   the fit math here. FIT_DATE is the next Wednesday on or after the PINNED
   smoke day (#178), never a fixed literal and never the day this actually
   runs: a day dated in the past files itself on boot (`dated-day.mjs`),
   which would take the card this measures with it. */
const nextWednesday = () => {
  const d = smokeToday();
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
  return seasonDate(d);
};
// Exported for test/smoke-clock.test.js (Proof row 2).
export const FIT_DATE = nextWednesday();
const FIT_OPPONENT = 'Riverside Wolverines'; // 20 characters
const FIT_TIPOFF = '12:30';

function fitRecord(cardSize) {
  return {
    version: 7, onboarded: true, tourSeen: true, activeTeam: 0, view: 'games',
    ui: { ...UI, gameView: 'card', printScope: 'game', cardSize },
    teams: [{
      id: 't0', name: 'Smoke Test', players: PLAYERS,
      days: [{
        name: '', date: FIT_DATE,
        games: [{ id: 'g0', label: FIT_OPPONENT, tipoff: FIT_TIPOFF, periods: 4, periodMinutes: 8,
          granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 }],
      }],
      activeDay: 0, activeGame: 0, season: { games: [] },
    }],
  };
}

async function loadFitRecord(c, origin, cardSize) {
  await land(c, origin, { record: fitRecord(cardSize) });
}

// The title and corner boxes, read straight off the layout rather than a
// second computation of where they "should" land: no overlap (their
// bounding boxes must not intersect), the corner's text not clipped
// (scrollWidth <= clientWidth), and both inside the header's own box.
async function measureFit(c) {
  return JSON.parse(await evalIn(c, `(() => {
    const hd = document.querySelector('.card-hd');
    const opp = document.querySelector('.card-hd .opp');
    const when = document.querySelector('.card-hd .when');
    if (!hd || !opp || !when) return JSON.stringify(null);
    const h = hd.getBoundingClientRect(), o = opp.getBoundingClientRect(), w = when.getBoundingClientRect();
    return JSON.stringify({
      overlap: o.right > w.left + 0.5,
      clipped: ${IS_CUT}(when, 1),
      outside: o.left < h.left - 0.5 || w.right > h.right + 0.5
        || o.top < h.top - 0.5 || w.bottom > h.bottom + 0.5,
      whenText: when.textContent,
    });
  })()`));
}

/* #103 fix pass finding 1: item 3 ("Multi-game card") had no executable
   proof -- `printScope: 'day'`, three games on one day timed 09:00, 11:00
   and untimed, corners `<wd> 9:00 AM`, `<wd> 11:00 AM`, `<wd>`. `<wd>` is
   computed HERE, independently of `cornerLabel` (storage.js) and of the app
   under test, from a locally-built `Date` the same way `cornerLabel` itself
   is documented to -- not read off the page -- so a broken wiring shows up
   as a text mismatch rather than two copies of the same bug agreeing.
   Reuses FIT_DATE rather than adding a second date. Matches the time with `\s`
   before AM/PM: ICU puts U+202F there, not an ASCII space. */
const [MULTI_Y, MULTI_M, MULTI_D] = FIT_DATE.split('-').map(Number);
const MULTI_WD = new Date(MULTI_Y, MULTI_M - 1, MULTI_D).toLocaleDateString('en-US', { weekday: 'short' });

function multiGameRecord() {
  return {
    version: 7, onboarded: true, tourSeen: true, activeTeam: 0, view: 'games',
    ui: { ...UI, gameView: 'card', printScope: 'day', cardSize: 'pocket' },
    teams: [{
      id: 't0', name: 'Smoke Test', players: PLAYERS,
      days: [{
        name: '', date: FIT_DATE,
        games: [
          { id: 'g0', label: 'Hawks', tipoff: '09:00', periods: 4, periodMinutes: 8,
            granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 },
          { id: 'g1', label: 'Eagles', tipoff: '11:00', periods: 4, periodMinutes: 8,
            granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 },
          { id: 'g2', label: 'Bears', tipoff: '', periods: 4, periodMinutes: 8,
            granMode: 'everyN', granValue: 4, out: [], strategy: 'balanced', seed: 1234 },
        ],
      }],
      activeDay: 0, activeGame: 0, season: { games: [] },
    }],
  };
}

async function loadMultiGameRecord(c, origin) {
  await land(c, origin, { record: multiGameRecord() });
}

// Excludes `.card-copy` (UI.copies is 2) and reads the page mark along with
// the corner text; a game that split across pages would carry it, and the
// spec's worked strings above have none.
async function measureMultiGame(c) {
  return JSON.parse(await evalIn(c, `(() => {
    const cards = [...document.querySelectorAll('.card:not(.card-copy)')];
    return JSON.stringify(cards.map(c => c.querySelector('.when')?.textContent ?? null));
  })()`));
}

async function multiGameProbe(c, origin, check) {
  await foldProbe(check, `multi-game probe (${MULTI_WD}, 3 games)`, async rec => {
    try {
      await loadMultiGameRecord(c, origin);
      const whens = await measureMultiGame(c);
      const want = [
        new RegExp(`^${MULTI_WD} 9:00\\sAM$`),
        new RegExp(`^${MULTI_WD} 11:00\\sAM$`),
        new RegExp(`^${MULTI_WD}$`),
      ];
      if (whens.length !== want.length) {
        rec.fail(`expected 3 cards, found ${whens.length} (${JSON.stringify(whens)})`);
      } else {
        whens.forEach((w, i) => rec.check(want[i].test(w), `card ${i}: "${w}" does not match ${want[i]}`));
      }
    } finally {
      // Restore the cold SEED state everything after this expects, same as
      // cardFitProbe's own finally below.
      await land(c, origin, { record: SEED });
    }
    rec.ok(`multi-game probe: 3-game day corners read "${MULTI_WD} 9:00 AM", "${MULTI_WD} 11:00 AM", "${MULTI_WD}"`);
  });
}

async function cardFitProbe(c, origin, check) {
  await foldProbe(check, `fit probe (${FIT_OPPONENT} / Wed 12:30 PM)`, async rec => {
    try {
      for (const cardSize of ['pocket', 'half']) {
        await loadFitRecord(c, origin, cardSize);
        const m = await measureFit(c);
        if (!m) { rec.fail(`${cardSize}: no .card-hd rendered`); continue; }
        rec.check(!m.overlap, `${cardSize}: title overlaps the corner ("${m.whenText}")`);
        rec.check(!m.clipped, `${cardSize}: corner text clipped ("${m.whenText}")`);
        rec.check(!m.outside, `${cardSize}: title or corner sits outside the card header`);
      }
    } finally {
      // Restore the cold SEED state everything after this expects (cardAt32Pass
      // above already left the page at a 16px root; this only owns the record).
      await land(c, origin, { record: SEED });
    }
    rec.ok(`fit probe: "${FIT_OPPONENT}" + Wed 12:30 PM does not overlap or clip, pocket or half`);
  });
}
