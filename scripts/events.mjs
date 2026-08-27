#!/usr/bin/env node
/* What do the eleven product events actually say?
 *
 *   CLOUDFLARE_API_TOKEN=... node scripts/events.mjs
 *   ... node scripts/events.mjs --days 90 --json
 *
 * The Worker has been writing every event to the `benchcard_events` Analytics
 * Engine dataset since events shipped, and until this script existed the only
 * readers were `traffic.mjs` (has anyone but me used this at all) and
 * `card-prints.mjs` (one event, one dimension). Neither answers the general
 * question, so "is anyone using this?" stayed unanswerable and every product
 * decision after it was a guess.
 *
 * **A script, not a site feature.** A `/stats` route would need auth designed,
 * would add attack surface, would spend request budget and could leak the
 * counters to strangers. This needs none of the four, and the numbers stay
 * private because reading them requires a token nobody else has.
 *
 * **It prints the questions, not just the counts.** Every entry in `EVENTS`
 * already carries a comment saying what it exists to answer -- "Does anyone
 * use anything but Balanced?", "Was the phone-as-card thesis right?" -- and
 * those comments are read out of `app/analytics.js` AT RUNTIME rather than
 * copied here, so the script and the source cannot drift. A count with no
 * question above it is a number nobody acts on.
 *
 * The token, the account id, the two read permissions and the promise that a
 * token never reaches an error message all live in `scripts/cf.mjs`. This one
 * needs the first permission only: Account -> Account Analytics -> Read.
 * Nothing here writes anything, anywhere.
 *
 * WHAT IS VERIFIED AND WHAT IS NOT, because guessing here is silent
 *
 * No live query has ever been run from this machine -- no token has ever been
 * present. Everything below is tested against fixtures in
 * `test/events.test.js`, and the fixtures are shaped like the rows
 * `traffic.mjs` records as verified against production on 2026-08-24
 * (`{ event, country, est }`, `est` arriving as a STRING, one JSON object per
 * line under `FORMAT JSONEachRow`). What is NOT confirmed by any run here:
 * that this particular SELECT list -- aliased `blobN`/`doubleN` columns beyond
 * the two `traffic.mjs` uses -- is accepted, and what a `doubleN` looks like
 * in the response (assumed a JSON number or a numeric string; `est` is handled
 * both ways for the same reason). If the first live run errors, that SELECT
 * list is the first thing to suspect, not the decode.
 */
import { readFileSync } from 'node:fs';
import { EVENTS } from '../app/analytics.js';
import { DATASET, readToken, sqlQuery, windowDays } from './cf.mjs';

export { windowDays };

// ---------------------------------------------------------------------------
// The column layout, DERIVED from the writer rather than typed in.
//
// `src/index.js`'s `record()` walks `Object.keys(EVENTS[event])` in
// DECLARATION ORDER and packs:
//
//     blobs   = [event name, country, ...string fields in that order]
//     doubles = [                     ...number fields in that order]
//
// so a field's column is its position among fields OF ITS OWN KIND, not among
// all fields. Getting this wrong returns plausible nonsense rather than an
// error, which is why it is computed from `EVENTS` here and pinned against the
// three lines of `record()` in `test/events.test.js`.
//
// One honest limit of the writer, not of this decode: `record()` SKIPS a field
// that is null, so a missing first string field would slide the second into
// its column with nothing to mark the gap. Today no event declares two fields
// of one kind, so the ambiguity is not live -- `test/events.test.js` fails
// loudly if that ever stops being true.

const isString = (allowed) => Array.isArray(allowed); // NUMBER is a Symbol

/* Per event: which query alias holds each of its fields. `s1`/`n1` are the
   aliases `buildSql` gives `blob3`/`double1`; going through aliases keeps the
   positional arithmetic in exactly one place. */
export function layout(events, event) {
  const schema = events[event];
  if (!schema) throw new Error(`unknown event: ${event}`);
  const out = [];
  let strings = 0;
  let numbers = 0;
  for (const [field, allowed] of Object.entries(schema)) {
    out.push(isString(allowed)
      ? { field, kind: 'string', alias: `s${++strings}` }
      : { field, kind: 'number', alias: `n${++numbers}` });
  }
  return out;
}

/* How many of each kind the widest event declares -- the SELECT list has to be
   wide enough for all eleven, and no wider. */
export function widths(events) {
  let strings = 0;
  let numbers = 0;
  for (const schema of Object.values(events)) {
    const kinds = Object.values(schema);
    strings = Math.max(strings, kinds.filter(isString).length);
    numbers = Math.max(numbers, kinds.length - kinds.filter(isString).length);
  }
  return { strings, numbers };
}

// ---------------------------------------------------------------------------
// The query.

/* One round trip for all eleven events. Grouping on the raw columns rather
   than per-event queries means an event this file has never heard of still
   comes back and gets reported, instead of being silently absent.

   `sum(_sample_interval)`, never `count()`: Analytics Engine samples under
   load and each stored row stands for that many real ones. At today's volume
   the interval is 1 and the two agree exactly, which is the trap -- a
   `count()` would look correct for months and then quietly under-report on the
   first busy week. */
export function buildSql(days = 30, events = EVENTS) {
  const n = windowDays(days);
  const { strings, numbers } = widths(events);
  const cols = ['blob1 AS event'];
  for (let i = 0; i < strings; i++) cols.push(`blob${i + 3} AS s${i + 1}`); // blob1 = event, blob2 = country
  for (let i = 0; i < numbers; i++) cols.push(`double${i + 1} AS n${i + 1}`);
  const names = cols.map((c) => c.split(' AS ')[1]);
  return `SELECT ${cols.join(', ')}, sum(_sample_interval) AS est
FROM ${DATASET}
WHERE timestamp >= NOW() - INTERVAL '${n}' DAY
GROUP BY ${names.join(', ')}
ORDER BY est DESC
FORMAT JSONEachRow`;
}

// ---------------------------------------------------------------------------
// The questions, read out of the source at runtime.

const SOURCE = new URL('../app/analytics.js', import.meta.url);

/* Pull the comment above each `EVENTS` entry straight out of the module text.
   Copying the questions here instead would let the two drift the first time
   somebody sharpens a comment, and a stale question over a live number is
   worse than no question at all. */
export function comments(source) {
  const text = String(source || '');
  const start = text.indexOf('export const EVENTS = {');
  if (start < 0) return new Map();
  const lines = text.slice(start).split('\n').slice(1);
  const out = new Map();
  let buffer = [];
  let block = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '};') break;
    if (block) {
      buffer.push(line.replace(/\*\/\s*$/, '').replace(/^\*\s?/, ''));
      if (line.includes('*/')) block = false;
      continue;
    }
    if (line.startsWith('//')) { buffer.push(line.slice(2)); continue; }
    if (line.startsWith('/*')) {
      buffer.push(line.slice(2).replace(/\*\/\s*$/, ''));
      if (!line.includes('*/')) block = true;
      continue;
    }
    const key = line.match(/^([A-Za-z_]\w*)\s*:\s*\{/);
    if (key) {
      out.set(key[1], buffer.join(' ').replace(/\s+/g, ' ').trim());
      buffer = [];
    }
  }
  return out;
}

/* The comment is the whole justification for the entry; the QUESTION is its
   first sentence. Everything up to the first `?` where there is one, and the
   first full stop otherwise -- two entries argue their case in prose rather
   than asking (`card_shared`, `app_error`) and both open with the point. */
export function question(comment) {
  const text = String(comment || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const mark = text.indexOf('?');
  if (mark >= 0) return text.slice(0, mark + 1);
  const stop = text.match(/^(.*?[.!])(?:\s|$)/);
  return stop ? stop[1] : text;
}

/* An entry with no comment of its own inherits the one above the group it was
   declared under -- `team_switched` and `team_removed` sit under the block
   that opens "Multi-team: does the second team exist outside our heads?" and
   names all three. Inheriting says what the file says; leaving them blank
   would print three unlabelled counts where the source labelled all three. */
export function questions(source = readFileSync(SOURCE, 'utf8')) {
  const out = new Map();
  let last = '';
  for (const [event, comment] of comments(source)) {
    const q = question(comment) || last;
    out.set(event, q);
    if (q) last = q;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Decoding rows into events.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* Declaration order, per kind, for whatever `EVENTS` says today -- never a
   list of the eleven names, which would go quietly wrong the moment a twelfth
   arrived or one was renamed. */
export function summarize(rows, events = EVENTS) {
  const known = new Map(Object.keys(events).map((e) => [e, { event: e, total: 0, breakdown: new Map() }]));
  const unknown = new Map();

  for (const row of rows || []) {
    const name = String(row.event ?? '');
    const est = num(row.est);
    const seen = known.get(name);
    if (!seen) {
      unknown.set(name || '(blank)', (unknown.get(name || '(blank)') || 0) + est);
      continue;
    }
    seen.total += est;
    const parts = [];
    for (const { field, alias } of layout(events, name)) {
      const v = row[alias];
      parts.push(`${field} ${v === undefined || v === null || v === '' ? '(unset)' : v}`);
    }
    if (parts.length) {
      const key = parts.join(', ');
      seen.breakdown.set(key, (seen.breakdown.get(key) || 0) + est);
    }
  }

  const list = [...known.values()].map((e) => ({
    event: e.event,
    total: e.total,
    breakdown: [...e.breakdown].sort((a, b) => b[1] - a[1]).map(([label, est]) => ({ label, est })),
  }));
  return {
    events: list,
    total: list.reduce((a, e) => a + e.total, 0),
    unknown: [...unknown].sort((a, b) => b[1] - a[1]).map(([event, est]) => ({ event, est })),
  };
}

// ---------------------------------------------------------------------------
// Rendering.

const pad = (s, n) => String(s).padEnd(n);
const rpad = (v, n) => String(v).padStart(n);
const commas = (n) => Number(n).toLocaleString('en-US');

/* Printed every run, in the output rather than in a comment somebody would
   have to remember: a number nobody can qualify gets quoted as a fact. */
export const CAVEATS = [
  'Totals are sum(_sample_interval), not a row count -- Analytics Engine samples',
  'under load and each stored row stands for that many real ones. At today\'s',
  'volume the interval is 1 and the two agree.',
  '',
  'These counters are only as hard to poison as /e is to abuse. /e is rate-limited',
  'at 100 posts a minute per address, which makes casual poisoning expensive rather',
  'than impossible -- the limit is per Cloudflare location, and anyone willing to',
  'spread across addresses still gets through. Treat a sudden jump as a question,',
  'not a finding, and read traffic.mjs beside it: a count taken over your own',
  'testing is a number about you.',
];

export function report({ window, events, total, unknown, asked }) {
  const L = [];
  L.push(`Benchcard events — the questions these counters exist to answer   (last ${window} days)`, '');

  for (const e of events) {
    const q = asked.get(e.event);
    L.push(`  ${q || '(no question recorded in app/analytics.js)'}`);
    L.push(`    ${pad(e.event, 22)}${rpad(commas(e.total), 9)}${e.total ? '' : '   (nothing recorded)'}`);
    for (const b of e.breakdown) L.push(`      ${pad(b.label, 26)}${rpad(commas(b.est), 5)}`);
    L.push('');
  }

  L.push(`  ${pad('TOTAL of the above', 22)}${rpad(commas(total), 9)}`, '');

  if (unknown.length) {
    L.push('UNRECOGNISED EVENT NAMES — in the dataset, not in EVENTS today');
    for (const u of unknown) L.push(`  ${pad(u.event, 22)}${rpad(commas(u.est), 9)}`);
    L.push('  A renamed or removed event, or an older deploy still reporting.', '');
  }

  L.push('HOW MUCH TO TRUST THIS');
  for (const line of CAVEATS) L.push(line ? `  ${line}` : '');
  return L.join('\n');
}

// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const days = argv.includes('--days') ? windowDays(argv[argv.indexOf('--days') + 1]) : 30;

  const token = readToken(); // never logged, never written, never in an error
  const out = summarize(await sqlQuery(buildSql(days), { token }));
  const asked = questions();

  if (asJson) {
    const events = out.events.map((e) => ({ question: asked.get(e.event) || '', ...e }));
    console.log(JSON.stringify({ window: days, ...out, events, caveats: CAVEATS.filter(Boolean) }, null, 2));
    return;
  }
  console.log(report({ window: days, ...out, asked }));
}

if (process.argv[1] && process.argv[1].endsWith('events.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
