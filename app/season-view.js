/* ================================================================== *
 * season-view.js -- the ledger: what everyone has played this season
 *
 * B1 made "New day" keep its games (`teams[].season.games`, schema v5).
 * This is the first thing that reads them: the artefact a coach wants
 * when a parent stops them in the car park, and the only place a game
 * filed by mistake can be taken back out.
 *
 * It has its OWN NAV TAB, and that is a reversal: it shipped at the foot
 * of the roster page because a third chip was judged not to fit the top
 * bar at 360px. Re-measured against the real bar, that judgement was
 * wrong -- what a tab costs is vertical chrome, not overflow. Measured
 * against the real bar with `?` and the theme toggle moved into
 * Settings and a cog in their place: the one-row floor is 374px in the
 * 620px stage and 359.9px once the 385px stage tightens the gaps, so
 * three tabs are ONE ROW at 360, 375 and 390, and two rows at 320 --
 * exactly what two tabs did. So the ledger is a view, which is what it
 * always wanted to be: it is the thing a coach opens BETWEEN games, and
 * a page you go to on purpose does not belong under someone else's.
 * A dialog was never right either -- a dialog is for something you
 * dismiss, and this is something a coach reads and edits.
 *
 * Nothing inside changed with the move. Same markup, same copy, same
 * ids: `#seasonbox` and `#seasonCount` are still the only two things
 * this file reaches for outside itself.
 *
 * GAME-FIRST, NOT A GRID. Twelve players by ten games is 120 cells: at
 * 390px a table either pans sideways (which this app does not do, and a
 * smoke check enforces) or shrinks past reading. So it is two lists --
 * season totals per player, then one collapsible row per game holding
 * that game's minutes. Every number the wide table would carry is here,
 * one screen-width at a time.
 *
 * An id with no player is NOT an error and never dropped: the season is
 * not swept against the roster on purpose, because a kid who left in
 * November still played those minutes in October. They read "Left the
 * team", with a hollow dot -- `player.hue` is a roster fact and they are
 * not on it.
 *
 * No level, no tier. Same ban as the card (`test/leak.test.js`).
 * ================================================================== */
import { $, el } from './dom.js';
import { undoable, flash } from './toast.js';
import { state, team, byId, colorOf, teamName } from './state.js';
import { fmtMinutes } from './engine.js';
import { seasonShare } from './storage.js';
import { downloadText, seasonFilename } from './backup.js';

let renderAll = () => {};

export function initSeason(renderAllFn) { renderAll = renderAllFn; }

const seasonGames = () => {
  const t = team();
  return Array.isArray(t?.season?.games) ? t.season.games : [];
};

/* Season totals, FURTHEST BEHIND FIRST -- by deficit, not by raw minutes.
 *
 * The question this list answers is "who is behind", and raw minutes cannot
 * answer it: a kid who made two games of six is bottom of a minutes list while
 * being AHEAD of their share of the two they were in. Sorting on minutes named
 * the wrong child in both directions -- furthest ahead at the top, and the kid
 * the solver has been quietly shorting every week mid-list, looking fine.
 * `seasonShare` is the app's one answer, the same numbers `computeAll` is
 * planning against, so this screen and the Games view cannot disagree. Read
 * here, never reimplemented.
 *
 * A rostered player who has played nothing is still listed, on zero: that is
 * exactly the row a coach is looking for, and with no appearances they are
 * neither owed nor ahead.
 *
 * The game count is ATTENDANCE, and it is read from `seasonShare`, not counted
 * here. `storage.js` records the rule -- a `minutes` map holds a key for
 * everyone who was available for that game, a 0 included -- so "was she
 * there" is key presence and nothing else. This used to count `m > 0`, which
 * silently dropped the kid who suited up and never got on, and disagreed with
 * the CSV's row for the same player. Same reason the order is read from
 * `seasonShare`: one answer, two surfaces.
 *
 * Exported for `test/season-view.test.js` only: these rows ARE the ledger and
 * they are also the CSV's rows, so the attendance count is worth pinning by
 * running it rather than by grepping the source for a variable name. */
export function totals(games) {
  const { deficit, appearances } = seasonShare(games);
  const rows = new Map();
  const put = id => rows.get(id)
    || (rows.set(id, { id, min: 0, games: appearances[id] || 0, off: deficit[id] || 0 }), rows.get(id));
  for (const p of state.players) put(p.id);
  for (const g of games) {
    for (const [id, m] of Object.entries(g.minutes || {})) put(id).min += m;
  }
  return [...rows.values()]
    .sort((a, b) => b.off - a.off || b.min - a.min || nameOf(a.id).localeCompare(nameOf(b.id)));
}

/* The order is the point, so the row says what it is ordered by -- an
   unexplained 96, 96, 100, 100 reads as a bug. No unit: the heading carries
   "minutes" for the list. Rounded, and silent at 0 -- level is the quiet
   case and a tenth of a minute is not something a coach acts on. */
const offNote = off => {
  const n = Math.round(off);
  return n > 0 ? ` · ${n} behind` : n < 0 ? ` · ${-n} ahead` : '';
};

const nameOf = id => (byId(id)?.name || '').trim();

/* One row, in both lists. Whether `byId` finds them is the whole "a player who
   has left" decision: their minutes are real, their colour slot is not. */
function playerRow(id, min, extra) {
  const p = byId(id);
  const row = el('div', 'sn-row');
  const dot = el('span', 'sn-dot' + (p ? '' : ' gone'));
  if (p) dot.style.background = colorOf(id);
  row.append(dot);
  const nm = el('span', 'sn-nm', p ? (nameOf(id) || 'Unnamed') : 'Left the team');
  if (!p) nm.classList.add('gone');
  row.append(nm);
  if (extra) row.append(el('span', 'sn-x', extra));
  row.append(el('span', 'sn-min', fmtMinutes(min)));
  return row;
}

/* "Sat 14 Sep" is a date a coach recognises from a schedule; the stored form
   is `YYYY-MM-DD` and is nobody's reading format. Parsed as parts rather than
   `new Date(iso)`, which is UTC for this shape and lands on the day before for
   anyone west of Greenwich -- an archive filed on Saturday must not read
   Friday. */
function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* Most games have an opponent typed on them and some have a day name instead
   ("Jamboree"); plenty have neither, because a coach in a hurry types nothing
   and the plan works anyway. The date alone is the honest title for those --
   "Aug 23 · Game" says the word Game twice and the date once. */
const gameTitle = (g, sep = ' · ') => {
  const when = dateLabel(g.date);
  const who = g.opponent ? `vs ${g.opponent}` : (g.day || '');
  if (when && who) return `${when}${sep}${who}`;
  return when || who || 'Game';
};

/* ---- the season as a file ------------------------------------------ *
 * The ledger above is the screen; this is the same thing as one wide
 * table -- `Player | Sep 14 vs Falcons | ... | Total`, one row per player
 * and one column per game. That is the shape a coach pastes into a parent
 * email and the shape a league timesheet asks for, and it is the shape the
 * ledger cannot be: 120 cells do not fit a phone.
 *
 * It is a REPORT, not a backup. Nothing reads it back, so it never goes
 * near `sanitize`; it borrows only the filename stamp and the download
 * dance from backup.js so there is still one of each.
 *
 * It lives in this file rather than in backup.js because it is the ledger's
 * twin: the same rows, the same order, the same "Left the team", the same
 * `gameTitle`. A copy over there would be a second source of this file's
 * wording, drifting the day someone renames something here.
 *
 * NO LEVELS, NO TIERS, AND NO COLUMN THAT IS NOT ONE OF THESE. This is the
 * one Benchcard file that gets forwarded; a parent opening it and finding
 * their child labelled "developing" is a real harm. `test/leak.test.js`
 * whitelists the header row for exactly that reason -- a column added here
 * "for completeness" fails the build.
 * -------------------------------------------------------------------- */

/* RFC 4180: quote when the field holds a quote, a comma or a line break,
   and double the quotes inside it. Edge whitespace too -- readers disagree
   about trimming, and a team name that arrived by paste can carry it.
   Opponent names, team names and player names are all free text and one of
   them will eventually be "St Mary's, Reds". */
const cell = v => {
  const s = String(v ?? '');
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* Was this player at this game? The `minutes` map holds a key for everyone who
   was available, so key presence IS the attendance record (`storage.js`), and
   an own-property check is the whole test -- `in` would answer yes for
   `constructor` on a record that arrived from an old backup. */
const was = (g, id) => Object.prototype.hasOwnProperty.call(g?.minutes || {}, id);

/* The gap in a wide table where a player was not on the team. An em dash and
   not an empty cell: a blank in the middle of a numeric row is what a truncated
   export looks like, and this file gets forwarded to people who did not make
   it. Excel and Sheets skip it in a SUM exactly as they skip a blank. */
const NOT_THERE = '—';

/**
 * The season as CSV text. Columns run OLDEST FIRST, which is the one place
 * this file disagrees with the ledger: a spreadsheet reads left to right as
 * time and `Total` is the rightmost column, whereas the list on screen is
 * newest first because the game a coach wants there is the one that just
 * happened. Rows keep the ledger's order -- furthest behind their share of the
 * season first, which is the order the screen is in and the one thing about
 * this file that must not drift from it.
 *
 * A player who was NOT AT a game gets an em dash, not a `0`. This reverses the
 * rule the file shipped with, and the grounds are that the old one reasoned
 * only about a player who missed a game she could have played: `0` is true for
 * her, and it was read as true for everyone. It is not true for a player who
 * had not joined the team yet, or who had already left -- the file credited a
 * kid with `0` minutes in four games played before her first practice, in the
 * one Benchcard file a coach forwards to a parent. The record already tells
 * the two apart (`storage.js`: a key means she was available for that game,
 * a 0 included); only this line was throwing it away.
 *
 * A `0` therefore still means what a coach would hope: she was there and did
 * not get on. `Total` stays a number in every row -- it sums, it is the same
 * number the ledger shows beside her name, and a dash there would say
 * something about the season rather than about one game.
 */
export function seasonCsv(games = seasonGames()) {
  const head = ['Player', ...games.map(g => gameTitle(g, ' ')), 'Total'];
  const rows = totals(games).map(r => [
    byId(r.id) ? (nameOf(r.id) || 'Unnamed') : 'Left the team',
    ...games.map(g => (was(g, r.id) ? fmtMinutes(g.minutes[r.id]) : NOT_THERE)),
    fmtMinutes(r.min),
  ]);
  return [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

function saveCsv(games) {
  try {
    /* The BOM is what stops Excel on Windows reading "José" as "JosÃ©". It
       goes on here rather than in `seasonCsv` so the generator still returns
       clean text a test can assert on. */
    downloadText('\uFEFF' + seasonCsv(games), seasonFilename(teamName()), 'text/csv;charset=utf-8');
  } catch (err) {
    console.warn('season csv failed', err);
    flash('Could not save the spreadsheet.');
    return;
  }
  flash('Spreadsheet saved.');
}

export function renderSeason() {
  const box = $('#seasonbox');
  if (!box) return;
  box.textContent = '';
  const games = seasonGames();
  const count = $('#seasonCount');

  if (!games.length) {
    if (count) count.textContent = '';
    /* Short, because the paragraph above it has already said when games get
       filed; saying it twice reads as an app that thinks you missed it.

       It does name the spreadsheet, though. The CSV button below is rendered
       WITH the ledger and so does not exist yet, which left this view with
       zero interactive controls and the words CSV, spreadsheet and export
       nowhere on it — a coach who has not filed a day has no way to learn the
       season can leave this app at all. Naming it here is a promise the very
       next screen keeps, not a control that is missing. */
    box.append(el('p', 'note sn-empty',
      'Nothing filed yet. Your first day will land here, and with it a spreadsheet (CSV) you can save.'));
    return;
  }
  if (count) count.textContent = `${games.length} game${games.length === 1 ? '' : 's'}`;

  /* Rendered here rather than sitting in the markup so it comes and goes with
     the ledger: with nothing filed there is nothing to export, and a button
     that hands back a header row and no rows is a support email. Same shape as
     the Backup group in Settings -- note, then the control, then the content. */
  const b = el('button', 'btn press sn-csv', 'Save a spreadsheet');
  b.type = 'button';
  b.onclick = () => saveCsv(games);
  box.append(b);
  box.append(el('p', 'note sn-csvnote',
    'One row per player, one column per game. A CSV: it opens in Excel, Numbers or Sheets.'));

  /* The unit lives in this heading rather than beside every number: a column
     of "70" reads instantly, a column of "70 min" is noise twelve times over. */
  box.append(el('h4', 'sn-h', 'Minutes this season'));
  const list = el('div', 'sn-list');
  for (const r of totals(games)) {
    list.append(playerRow(r.id, r.min, `${r.games} game${r.games === 1 ? '' : 's'}${offNote(r.off)}`));
  }
  box.append(list);

  /* Newest first: the game a coach wants is almost always the one that just
     happened -- either to read it to a parent or, if "New day" filed a game
     nobody played, to delete it. */
  box.append(el('h4', 'sn-h', 'Game by game'));
  for (const g of [...games].reverse()) box.append(gameBlock(g));
}

function gameBlock(g) {
  const d = el('details', 'sn-game');
  const sum = el('summary');
  sum.append(el('span', 'sn-gt', gameTitle(g)));
  const played = Object.values(g.minutes || {}).filter(m => m > 0).length;
  const fmt = g.periods && g.periodMinutes ? `${g.periods}×${g.periodMinutes}` : '';
  sum.append(el('span', 'sn-gm', [`${played} played`, fmt].filter(Boolean).join(' · ')));
  d.append(sum);

  const body = el('div', 'sn-body');
  const rows = Object.entries(g.minutes || {}).sort((a, b) => b[1] - a[1]);
  if (!rows.length) body.append(el('p', 'note', 'No minutes were recorded for this game.'));
  for (const [id, m] of rows) body.append(playerRow(id, m));

  /* The only correction path there is. "New day" finishes whatever is in the
     day, so tapping it twice files a game nobody played -- it says so, with
     Undo, but Undo expires. No confirm: removing a team is the one confirm in
     this app, and `undoable` is the net everywhere else. */
  const del = el('button', 'btn ghost danger sm press sn-del', 'Delete this game');
  del.type = 'button';
  del.onclick = () => deleteGame(g.id, gameTitle(g));
  body.append(del);
  d.append(body);
  return d;
}

function deleteGame(id, title) {
  const t = team();
  undoable(`Deleted ${title} from the season.`, () => {
    const games = t.season.games;
    const at = games.findIndex(g => g.id === id);
    if (at > -1) games.splice(at, 1);
  }, () => renderAll());
}
