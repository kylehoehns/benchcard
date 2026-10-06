#!/usr/bin/env node
/* Turns Lighthouse JSON reports into the small scores file the README badges
 * read. Given several (the workflow runs three), each category is the median
 * of its rounded scores, so one noisy run does not move the badge.
 *
 *     node scripts/lighthouse-scores.mjs report-1.json report-2.json > lighthouse.json
 *
 * The weekly `lighthouse` workflow runs this and pushes the result to the
 * `badges` branch. It refuses a report it cannot read whole: a category with a
 * null score, or a missing one, exits 1, so a broken run never publishes a
 * badge reading "null". */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* The one place the output key names are written: Lighthouse category id ->
   key in lighthouse.json. The README's badge queries are checked against it. */
export const CATEGORIES = {
  performance: 'performance',
  accessibility: 'accessibility',
  'best-practices': 'bestPractices',
  seo: 'seo',
};

function scoreOne(report) {
  const out = {
    url: report.finalDisplayedUrl ?? report.requestedUrl,
    formFactor: report.configSettings?.formFactor,
    fetchTime: report.fetchTime,
    lighthouseVersion: report.lighthouseVersion,
  };
  for (const [id, key] of Object.entries(CATEGORIES)) {
    const category = report.categories?.[id];
    if (!category) throw new Error(`report has no "${id}" category`);
    if (typeof category.score !== 'number') {
      throw new Error(`Lighthouse could not score "${id}" (score is ${category.score})`);
    }
    out[key] = Math.round(category.score * 100);
  }
  return out;
}

/* The middle value; an even count takes the mean of the middle two. */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/* One report or an array. Every report is validated; the metadata is the last
   one's, so fetchTime is too. */
export function scoresFrom(reports) {
  const list = [reports].flat();
  if (list.length === 0) throw new Error('no reports to score');
  const all = list.map(scoreOne);
  const out = { ...all.at(-1) };
  for (const key of Object.values(CATEGORIES)) out[key] = median(all.map(s => s[key]));
  return out;
}

/* Run only when invoked directly, so the pure half can be tested. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const paths = process.argv.slice(2);
    if (paths.length === 0) throw new Error('usage: lighthouse-scores.mjs report.json [more.json ...]');
    const reports = paths.map(p => JSON.parse(readFileSync(p, 'utf8')));
    process.stdout.write(JSON.stringify(scoresFrom(reports), null, 2) + '\n');
  } catch (e) {
    console.error(`lighthouse-scores: ${e.message}`);
    process.exit(1);
  }
}
