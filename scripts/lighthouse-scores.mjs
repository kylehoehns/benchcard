#!/usr/bin/env node
/* Turns a Lighthouse JSON report into the small scores file the README badges
 * read.
 *
 *     node scripts/lighthouse-scores.mjs report.json > lighthouse.json
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
const CATEGORIES = {
  performance: 'performance',
  accessibility: 'accessibility',
  'best-practices': 'bestPractices',
  seo: 'seo',
};

export function scoresFrom(report) {
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

/* Run only when invoked directly, so the pure half can be tested. */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(JSON.stringify(scoresFrom(report), null, 2) + '\n');
  } catch (e) {
    console.error(`lighthouse-scores: ${e.message}`);
    process.exit(1);
  }
}
