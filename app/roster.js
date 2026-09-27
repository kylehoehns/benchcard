// Roster text parsing. Pure — shared by first-run and bulk paste.

// #146 item 4: card names, for distinctNames' parenthesized suffix. engine.js
// has no imports, so this does not create a cycle.
import { deriveShortNames } from './engine.js';

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

/**
 * Parse a block of text, one player per line. Blank lines are skipped.
 *
 * #146 item 1: a coach who pastes one line -- "Sam, Jo, Kai" -- gets nothing
 * today, because there is no line break for the line-splitter to find. When
 * the WHOLE text has no `\r` or `\n` and holds a comma, split on commas
 * instead and parse each piece the same way a line would be. A piece with no
 * letter in it ("12" alone) means the comma was a number separator, not a
 * list separator -- "12, Maya Webb" is one player, not two -- so that blocks
 * the split entirely and the text falls through to the line-parser, which
 * reads it as the single line it is. A text with a line break never takes
 * this path: "Webb, Maya\nTran, Eli" is two lines today and stays two lines.
 */
const commaPieces = s => s.split(',').map(p => p.trim()).filter(Boolean);

/* Whether `s` reads as a comma list rather than lines -- see the doc comment
 * on `parseRoster` for why. `dropRepeat` below splits the same way, so this
 * is the one place that decision is made, not two. */
const isCommaList = s => !/[\r\n]/.test(s) && s.includes(',') &&
  commaPieces(s).length > 0 && commaPieces(s).every(p => /\p{L}/u.test(p));

export function parseRoster(text) {
  const s = String(text || '');
  if (isCommaList(s)) return commaPieces(s).map(parseRosterLine).filter(Boolean);
  return s
    .split(/[\r\n]+/)
    .map(parseRosterLine)
    .filter(Boolean);
}

/* Trim, lowercase, collapse inner spaces -- `repeatIndexes`' own key,
   reused here rather than re-derived, so "which entries share a name" is
   answered the same way whether the question is a repeat against the
   existing roster or a repeat inside the text being typed. */
const nameKey = n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');

/* "Reese, Jonah, Eli and Kira" -- the same shape as engine.js's own private
   `andList`. `joinNames` (state.js) is the one place this shape is meant to
   live, but state.js already imports `callNames` from this module, so the
   reverse import would cycle; a pure module duplicating a two-line join is
   the same trade engine.js already made, for the same reason. */
function andJoin(names) {
  if (names.length < 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * #146 items 2-3: what the paste step shows before anything is added. Pure
 * and generic -- `countLine` (onboarding.js) and the paste sheet's note
 * (roster-view.js) each wrap `text` in their own sentence, so this owns only
 * the two facts every caller needs: the joined name list, numbered players
 * read as "Maya Webb #12"; and the repeat groups, so callers can build
 * "<name> is listed twice."/"Drop one <name>" without re-deriving the key.
 */
export function rosterPreview(entries) {
  const list = entries || [];
  const names = list.map(e => (e.number ? `${e.name} #${e.number}` : e.name));
  const groups = new Map();
  for (const e of list) {
    const k = nameKey(e.name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const repeats = [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => ({ name: g[0].name, count: g.length }));
  return { text: andJoin(names), repeats };
}

/**
 * #146 item 3: the text after "Drop one" removes exactly the entry item 3
 * points at, leaving every other line -- or comma piece -- exactly as typed.
 * Split the same way `parseRoster` decides to split (commas only when the
 * whole text has no line break and every piece holds a letter), keeping the
 * raw separators so splicing one entry out never touches another's bytes. It
 * removes the entry without a number when exactly one of the group lacks
 * one; otherwise the last one in the group.
 */
export function dropRepeat(text, name) {
  const s = String(text || '');
  const targetKey = nameKey(name);
  const parts = s.split(isCommaList(s) ? /(,)/ : /([\r\n]+)/);

  const matches = [];
  for (let i = 0; i < parts.length; i += 2) {
    const parsed = parseRosterLine(parts[i]);
    if (parsed && nameKey(parsed.name) === targetKey) matches.push(i);
  }
  if (matches.length < 2) return s;

  const noNumber = matches.filter(i => !parseRosterLine(parts[i]).number);
  const removeIdx = noNumber.length === 1 ? noNumber[0] : matches[matches.length - 1];

  const out = parts.slice();
  if (removeIdx + 1 < out.length) out.splice(removeIdx, 2);
  else if (removeIdx - 1 >= 0) out.splice(removeIdx - 1, 2);
  else out.splice(removeIdx, 1);
  return out.join('').trim();
}

/**
 * #146 item 3's repeat line. One function, shared by the paste sheet and
 * first-run step 1, the way `confirmAddLabel` already keeps two sheets' one
 * piece of button copy in one place instead of two.
 */
export function repeatNotice(name, count) {
  return `${name} is listed ${count === 2 ? 'twice' : `${count} times`}.`;
}

/**
 * #146 item 4: the full name a coach reads, told apart from a teammate who
 * shares it. Grouped by `nameKey`. Inside a group, a jersey number that only
 * one player there wears is the suffix; otherwise the player's own card name
 * (`deriveShortNames`, engine.js -- the same abbreviator the card prints,
 * never a second one) in parentheses. A unique name is returned bare.
 *
 * The one place this suffix is computed: `callNames` reads it for its last
 * rung below, and every screen that shows a full name reads it from here too,
 * so none of them re-derives it.
 */
export function distinctNames(players) {
  const numKey = n => String(n ?? '').trim().replace(/^0+(?=\d)/, '');
  const groups = new Map();
  for (const p of players || []) {
    const k = nameKey(p.name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const shortNames = deriveShortNames(players || []);
  const out = {};
  for (const p of players || []) {
    const group = groups.get(nameKey(p.name));
    if (!group || group.length < 2) { out[p.id] = p.name; continue; }
    const num = numKey(p.number);
    const sharedNumber = num && group.some(x => x !== p && numKey(x.number) === num);
    out[p.id] = num && !sharedNumber ? `${p.name} #${num}` : `${p.name} (${shortNames[p.id]})`;
  }
  return out;
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
 *  "Try a sample team" fills an editable box with this rather than handing
 *  over a finished roster, which is the use the comment at the head of this
 *  block always described. The box was the welcome screen's `#welRoster`
 *  until #36; it is step 1's `#frRoster` in `#firstRunFlow` now, and the
 *  reason the text form comes first is unchanged. One clamp, one cast, two
 *  shapes. */
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
 * normalizes them, so a pasted "07" and a typed "7" are one number and not two.
 * Returns [{ number, ids }] in first-appearance order, `number` normalized.
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

  const distinct = distinctNames(players);
  const out = {};
  for (const p of players) {
    const f = forms(p);
    if (!f.first) { out[p.id] = ''; continue; }
    out[p.id] = firsts.get(f.first.toLowerCase()) === 1 ? f.first
      : withLasts.get(f.withLast.toLowerCase()) === 1 ? f.withLast
      : (distinct[p.id] ?? f.full);
  }
  return out;
}

/**
 * What the confirm button on the two add sheets says (#31, C4/W2: a commit
 * sheet's confirm is named for the result, never "Add" or "Done"). The paste
 * sheet re-reads its textarea on every keystroke, so one player and several
 * are the same button and the two spellings belong in one place.
 */
export function confirmAddLabel(n) {
  const k = Math.floor(Number(n));
  return Number.isFinite(k) && k > 1 ? `Add ${k} players` : 'Add player';
}
