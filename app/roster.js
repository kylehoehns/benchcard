// Roster text parsing. Pure — shared by first-run and bulk paste.

/**
 * Parse one line into { number, name }. Coaches paste rosters in whatever
 * shape their league emailed them, so accept the common ones:
 *   "12 Maya Webb"   "Maya Webb #12"   "12. Maya Webb"
 *   "Maya Webb - 12" "12, Maya Webb"   "Maya Webb"
 */
export function parseRosterLine(line) {
  let s = String(line || '').trim();
  if (!s) return null;

  let number = '';

  // trailing "#12" / "- 12" / ", 12"
  let m = s.match(/^(.*?)[\s,\-–—]*#?\s*(\d{1,2})$/);
  if (m && m[1].trim()) { s = m[1].trim(); number = m[2]; }

  // leading "12" / "12." / "12)" / "#12"
  if (!number) {
    m = s.match(/^#?\s*(\d{1,2})\s*[.)\-–—:,]?\s+(.*)$/);
    if (m && m[2].trim()) { number = m[1]; s = m[2].trim(); }
  }

  // tidy separators left behind, and collapse runs of spaces
  s = s.replace(/[\s,;|]+$/g, '').replace(/^[\s,;|]+/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!s) return null;

  return { number: number.replace(/^0+(?=\d)/, ''), name: s };
}

/** Parse a block of text, one player per line. Blank lines are skipped. */
export function parseRoster(text) {
  return String(text || '')
    .split(/[\r\n]+/)
    .map(parseRosterLine)
    .filter(Boolean);
}

/**
 * The sample team, for the coach who has no roster to paste -- off-season, or
 * still deciding whether this app is worth typing eleven names into.
 *
 * ONE fictional cast, not two: `#welRoster`'s placeholder already established
 * the vocabulary, and its three names are the first three lines here. The
 * twelve resolve to twelve distinct four-letter short names and twelve
 * distinct jersey numbers, so nothing the sample produces looks like a bug --
 * no duplicate-number warning, no two rows on the card reading the same four
 * letters.
 *
 * THE CAST IS MIXED, and the default ten is where that has to hold: rec
 * basketball is co-ed as often as not, and a sample roster of ten boys tells a
 * coach with a girls' team that this app was not built for her. It was twelve
 * boys until 2026-08-26. `scripts/charts.mjs` and `scripts/og.mjs` carry the
 * other two casts and were balanced in the same change. (`scripts/charts.mjs` keeps its own first-names-only cast; that one
 * exists to fit a printed card and its widths are pinned by a test.)
 *
 * Text rather than objects on purpose: the sample is then parsed by exactly
 * the code a pasted roster is, and cannot drift into a shape `parseRoster`
 * would never produce. There is no level here and there must never be --
 * `test/leak.test.js` bans a player level from every artefact the app hands
 * out, and a sample gets the same default every typed player gets, from the
 * same line of the same caller.
 */
export const SAMPLE_TEAM_NAME = 'Sample team';

/* Ten, not twelve: the middle of the six roster-size landing pages, and a
   squad big enough that the rotation has something to solve. */
const SAMPLE_SIZE = 10;

const SAMPLE_LINES = [
  '12 Maya Webb', '4 Eli Tran', '7 Devon Ellis', '3 Nia Bell',
  '15 Caleb Ruiz', '9 Harper Pratt', '21 Silas Hart', '5 Jonah Reed',
  '11 Ruby Marsh', '8 Isaac Lowe', '24 Aisha Doyle', '6 Ryan Vance',
];

/** The first `n` of them as the coach would have pasted them, clamped to what
 *  the engine can plan and to what the cast holds. Anything unparseable falls
 *  back to `SAMPLE_SIZE`.
 *
 *  TEXT is the primary form and the parsed roster is derived from it (A49):
 *  the welcome screen's "Try a sample team" fills `#welRoster` with this and
 *  lets the coach edit it, which is the use the comment at the head of this
 *  block always described. One clamp, one cast, two shapes. */
export function sampleRosterText(n) {
  const k = Math.floor(Number(n));
  const size = Number.isFinite(k) && k > 0 ? Math.max(5, Math.min(SAMPLE_LINES.length, k)) : SAMPLE_SIZE;
  return SAMPLE_LINES.slice(0, size).join('\n');
}

export function sampleRoster(n) {
  return parseRoster(sampleRosterText(n));
}

/**
 * Jersey numbers worn by more than one player. A real team cannot have two
 * #7s, so a duplicate is always a typo or a double-paste -- and it is not
 * harmless: the card can be printed by number instead of short name, and two
 * rows reading "7" name nobody. Blank numbers are not duplicates; most of a
 * roster may legitimately have none.
 *
 * Leading zeros are stripped before comparing, the same way `parseRosterLine`
 * normalises them, so a pasted "07" and a typed "7" are one number and not two.
 * Returns [{ number, ids }] in first-appearance order, `number` normalised.
 */
export function duplicateNumbers(players) {
  const by = new Map();
  for (const p of players || []) {
    const n = String(p?.number ?? '').trim().replace(/^0+(?=\d)/, '');
    if (!n) continue;
    if (!by.has(n)) by.set(n, []);
    by.get(n).push(p.id);
  }
  return [...by].filter(([, ids]) => ids.length > 1).map(([number, ids]) => ({ number, ids }));
}

/**
 * Which of `incoming` carry a name the roster already has. A coach who pastes,
 * scrolls, and pastes again used to get every kid twice with nothing said, so
 * the bulk add reports this and offers to drop them.
 *
 * Compared against the roster as it stood *before* the paste, never within the
 * paste itself: two "Maya Webb"s on one pasted list are twins, which are
 * real, and calling those a repeat would be wrong. Names are matched loosely
 * (case, edge and run-of-spaces) because the same list exported twice rarely
 * comes back byte-identical. Returns indexes into `incoming`.
 */
export function repeatIndexes(existing, incoming) {
  const key = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const had = new Set((existing || []).map(p => key(p?.name)).filter(Boolean));
  const out = [];
  (incoming || []).forEach((x, i) => { if (key(x?.name) && had.has(key(x?.name))) out.push(i); });
  return out;
}

/**
 * Drop index for a reorder drag: row `from` has moved `dy` px in a list of
 * `count` equally tall rows spaced `step` px apart. Pure so the maths can be
 * tested — `dy` must be measured in *document* space, because the drag
 * autoscrolls the page and a viewport-relative delta would drift by exactly
 * the distance scrolled.
 */
export function dropIndex(from, dy, step, count) {
  if (!(step > 0) || !(count > 0)) return from;
  return Math.max(0, Math.min(count - 1, from + Math.round(dy / step)));
}

/**
 * Which row a list should hand focus to after the row at `idx` is removed,
 * given the `len` rows that are left: the row that took its place, the new
 * last row when the removed one was last, and -1 when the list is now empty
 * and the caller has to look outside it.
 *
 * Pure and here rather than inline in the view because it is the whole of the
 * decision: measured 2026-08-25, removing a player left `document.activeElement`
 * on `<body>`, which sends a keyboard coach back to the top of the document
 * mid-edit -- and puts the Undo in the toast a page of tabbing away.
 */
export function focusAfterRemoval(idx, len) {
  if (!(len > 0)) return -1;
  return Math.max(0, Math.min(idx, len - 1));
}

/**
 * Display names for the on-court call: "Priya", or "Priya R." when two
 * available players share a first name, or the full name when even that
 * collides. Deliberately not the card's short names -- five letters exist so
 * five columns fit a pocket card, and a coach reading "PRIY" off a screen with
 * room for the real name is doing work nobody asked for. Returns id -> name;
 * a player with no name at all maps to '' so the caller can fall back.
 */
export function callNames(players) {
  const parts = p => String(p.name || '').trim().split(/\s+/).filter(Boolean);
  const forms = p => {
    const w = parts(p);
    const first = w[0] || '';
    const li = (w[1] || '').slice(0, 1);
    return { first, withLast: li ? `${first} ${li.toUpperCase()}.` : first, full: w.join(' ') };
  };

  const count = (key) => {
    const m = new Map();
    for (const p of players) m.set(key(p), (m.get(key(p)) || 0) + 1);
    return m;
  };
  const firsts = count(p => forms(p).first.toLowerCase());
  const withLasts = count(p => forms(p).withLast.toLowerCase());

  const out = {};
  for (const p of players) {
    const f = forms(p);
    if (!f.first) { out[p.id] = ''; continue; }
    out[p.id] = firsts.get(f.first.toLowerCase()) === 1 ? f.first
      : withLasts.get(f.withLast.toLowerCase()) === 1 ? f.withLast
      : f.full;
  }
  return out;
}
