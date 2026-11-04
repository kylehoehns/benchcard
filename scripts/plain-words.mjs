import { htmlBodyText } from '../test/glossary.js';

/* #598: coach-facing text uses plain words and short sentences. One word list
   and one limit, here; test/plain-words.test.js reads them. The test checks
   only the list and the length. Whether a coach who has never seen the app
   would understand a sentence the first time is the reviewer's call
   (REVIEW.md).

   A banned word matches as a whole word, any case, with an optional plural s.
   Longer forms ("configure") are not matched; add them if they turn up. */
export const BANNED = ['stint', 'unit', 'toggle', 'config', 'strategy engine', 'fingerprint'];
export const MAX_WORDS = 25;

/* Exact sentences that copy the app's own screen text verbatim (a mock-up of
   its rules list), per file. Nothing written for the page itself goes here.
   Each entry must still be found on its page, or the test fails. */
export const APP_COPY = {
  'app/about.html': ['Each player plays at most 2 stints in a row (8 min)'],
  'app/advanced.html': ['Each player plays at most 2 stints in a row (8 min)'],
};

const BLOCK = 'p|li|ul|ol|dl|h[1-6]|dt|dd|figure|figcaption|summary|details|div|td|th|tr|table|section|article|header|footer|nav|main|aside|blockquote|pre|br|hr';
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', hellip: '…', times: '×', middot: '·',
};

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** The text a reader sees, one line per block, and one per legend token span. */
export function visibleText(html) {
  let h = htmlBodyText(html).replace(/\s+/g, ' ');
  h = h.replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  /* Each link in a nav is its own line, not a run-on sentence. */
  h = h.replace(/<nav\b[\s\S]*?<\/nav>/gi, (nav) => nav.replace(/<\/a>/gi, '</a><br>'));
  h = h.replace(new RegExp(`</?(?:${BLOCK})\\b[^>]*>`, 'gi'), '\n');
  h = h.replace(/<span\b[^>]*class="[^"]*\btok\b[^"]*"[^>]*>/gi, '\n');
  return decode(h.replace(/<[^>]*>/g, ' '));
}

/** Sentences: a line break, or . ! ? followed by white space, ends one. */
export function sentences(text) {
  return text.split('\n')
    .flatMap((line) => line.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

const bannedRe = (w) => new RegExp(`(?<![\\w])${w.split(' ').join('\\s+')}s?(?![\\w])`, 'i');

/** One message per sentence that breaks a rule; empty when the text is plain. */
export function problems(file, list) {
  const exempt = new Set(APP_COPY[file] || []);
  const hint = 'rewrite it in plain words (APP_COPY in scripts/plain-words.mjs is only for text copied verbatim from the app\'s screens)';
  const out = [];
  for (const s of list) {
    if (exempt.has(s)) continue;
    for (const w of BANNED) {
      if (bannedRe(w).test(s)) out.push(`${file}: "${s}": banned word "${w}"; ${hint}`);
    }
    const n = s.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
    if (n > MAX_WORDS) out.push(`${file}: "${s}": ${n} words, limit ${MAX_WORDS}; ${hint}`);
  }
  return out;
}
