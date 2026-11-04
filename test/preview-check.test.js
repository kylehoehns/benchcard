/* #596: the pure parts of `scripts/lanes/preview-check.mjs`, at the seam the
 * spec's Proof names: the URL from a branch, `viewsFor`, reading the two URLs
 * out of a check run's summary, the verdict from measurements.json records
 * and the comment text. No network, no Chrome. Expected values are typed from
 * the spec. Importing the module launches nothing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { aliasUrl, viewsFor, notChecked, urlsFromSummary, urlToCheck, lookFailure, verdict, commentText } from '../scripts/lanes/preview-check.mjs';
import { parseArgs } from '../scripts/look.mjs';

const FIVE = ['today', 'games', 'team', 'season', 'settings'];

test('aliasUrl lowercases the branch and turns anything outside a-z 0-9 - into a dash', () => {
  assert.equal(aliasUrl('lane-end-596'), 'https://lane-end-596-benchcard.kyhoehns.workers.dev');
  assert.equal(aliasUrl('Feature/Avery_Fix.2'), 'https://feature-avery-fix-2-benchcard.kyhoehns.workers.dev');
});

test('viewsFor: about, whats-new and other pages map to themselves', () => {
  assert.deepEqual(viewsFor(['app/about.html']), ['about']);
  assert.deepEqual(viewsFor(['app/whats-new.html']), ['whats-new']);
  assert.deepEqual(viewsFor(['app/advanced.html']), ['advanced']);
  assert.deepEqual(viewsFor(['app/7-player-basketball-rotation-chart.html']), ['7-player-basketball-rotation-chart']);
});

test('viewsFor: shell code, styles and images map to the five app views', () => {
  assert.deepEqual(viewsFor(['app/app.js']), FIVE);
  assert.deepEqual(viewsFor(['app/app.css']), FIVE);
  assert.deepEqual(viewsFor(['app/index.html']), FIVE);
  assert.deepEqual(viewsFor(['app/icons/icon-192.png']), FIVE);
});

test('viewsFor: plumbing, 404 and paths outside app/ map to nothing', () => {
  const none = ['app/sw.js', 'app/_headers', 'app/robots.txt', 'app/sitemap.xml', 'app/vendor/README.md',
    'app/404.html', 'scripts/look.mjs', 'test/look.test.js', 'docs/specs/596-x.md'];
  for (const p of none) assert.deepEqual(viewsFor([p]), [], p);
  assert.deepEqual(viewsFor(none), []);
});

test('viewsFor: a mix keeps first-seen order and lists each view once', () => {
  assert.deepEqual(viewsFor(['docs/a.md', 'app/about.html', 'app/app.css', 'app/app.js', 'app/about.html']),
    ['about', ...FIVE]);
});

test('notChecked lists 404.html when the diff touches it, and only then', () => {
  assert.deepEqual(notChecked(['app/404.html', 'app/app.js']), ['app/404.html']);
  assert.deepEqual(notChecked(['app/app.js']), []);
});

test('every app page except index and 404 is a view look.mjs can shoot', () => {
  const app = join(dirname(dirname(fileURLToPath(import.meta.url))), 'app');
  const pages = readdirSync(app).filter(f => f.endsWith('.html') && !['index.html', '404.html'].includes(f));
  assert.ok(pages.length >= 11, `expected the eleven static pages, found ${pages.length}`);
  for (const f of pages) {
    const views = viewsFor([`app/${f}`]);
    assert.equal(views.length, 1, f);
    assert.deepEqual(parseArgs(['--out', 'o', '--view', views[0]]).views, views, `look.mjs cannot shoot ${f}`);
  }
});

test('urlsFromSummary reads the Preview URL and the Preview Alias URL', () => {
  const summary = [
    'Successfully deployed.', '',
    'Preview URL: https://c42d3fba-benchcard.kyhoehns.workers.dev',
    'Preview Alias URL: https://autoexit-595-benchcard.kyhoehns.workers.dev', '',
  ].join('\n');
  assert.deepEqual(urlsFromSummary(summary), {
    preview: 'https://c42d3fba-benchcard.kyhoehns.workers.dev',
    alias: 'https://autoexit-595-benchcard.kyhoehns.workers.dev',
  });
});

test('urlsFromSummary: a missing line is null, and a summary that is not text is all null', () => {
  assert.deepEqual(urlsFromSummary('Preview Alias URL: https://a-benchcard.kyhoehns.workers.dev'),
    { preview: null, alias: 'https://a-benchcard.kyhoehns.workers.dev' });
  assert.deepEqual(urlsFromSummary(null), { preview: null, alias: null });
  assert.deepEqual(urlsFromSummary(''), { preview: null, alias: null });
});

test('urlToCheck: the summary\'s own alias when it names one, else the branch-derived URL', () => {
  const branch = 'https://a-very-long-branch-benchcard.kyhoehns.workers.dev';
  assert.equal(urlToCheck('https://shortened-benchcard.kyhoehns.workers.dev', branch), 'https://shortened-benchcard.kyhoehns.workers.dev');
  assert.equal(urlToCheck(null, branch), branch);
});

test('lookFailure says a timeout timed out, and otherwise shows the last stderr lines', () => {
  assert.match(lookFailure({ killed: true, signal: 'SIGTERM', message: 'x' }), /timed out/);
  const other = lookFailure({ code: 1, stderr: 'a\nb\nc\nd\n', message: 'x' });
  assert.doesNotMatch(other, /timed\s+out/);
  assert.match(other, /b \/ c \/ d/);
});

const rec = (file, over = {}) => ({ file, findings: [], consoleErrors: [], thirdParty: [], ...over });

test('verdict passes clean shots of every view, counting them', () => {
  const v = verdict([rec('today-390-16-light.png', { view: 'today' }), rec('team-390-16-light.png', { view: 'team' })], ['today', 'team']);
  assert.deepEqual(v, { pass: true, shots: 2, findings: [], consoleErrors: [], problems: [] });
});

test('verdict fails on an unexcused finding, and lists it; an excused one is not counted', () => {
  const clip = { kind: 'clip', el: 'p.sub', excused: null };
  const known = { kind: 'split', el: 'span.pass-title', excused: 187 };
  const v = verdict([rec('today-390-16-light.png', { view: 'today', findings: [clip, known] })], ['today']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.findings, ['today-390-16-light.png: clip p.sub']);
});

test('verdict fails on a console error from the preview, and ignores third-party noise', () => {
  const noisy = rec('today-390-16-light.png', { view: 'today', thirdParty: ['blocked https://static.cloudflareinsights.com/b.js'] });
  assert.equal(verdict([noisy], ['today']).pass, true);
  const bad = rec('today-390-16-light.png', { view: 'today', consoleErrors: ['Uncaught Error: boom'] });
  const v = verdict([bad], ['today']);
  assert.equal(v.pass, false);
  assert.deepEqual(v.consoleErrors, ['today-390-16-light.png: Uncaught Error: boom']);
});

test('verdict fails when nothing was measured, or a view has no shot (rule 2a)', () => {
  const none = verdict([], ['today']);
  assert.equal(none.pass, false);
  assert.match(none.problems[0], /no shot/);
  const some = verdict([rec('today-390-16-light.png', { view: 'today' })], ['today', 'team']);
  assert.equal(some.pass, false);
  assert.match(some.problems.join(' '), /team/);
});

const BASE = {
  url: 'https://lane-end-596-benchcard.kyhoehns.workers.dev', sha: '0123456789abcdef0123456789abcdef01234567',
  views: ['today', 'about'], notChecked: [], shots: 3, findings: [], consoleErrors: [], problems: [], pass: true,
};

test('commentText: URL, short sha, pages, counts and PASS', () => {
  const t = commentText(BASE);
  for (const want of [BASE.url, '0123456', 'today, about', '3 shots', '0 findings', '0 console errors', 'PASS']) {
    assert.ok(t.includes(want), `missing "${want}" in:\n${t}`);
  }
  assert.ok(!t.includes('FAIL'));
});

test('commentText: FAIL lists each finding and console error, and says 404 was not checked', () => {
  const t = commentText({ ...BASE, pass: false, notChecked: ['app/404.html'],
    findings: ['today-390-16-light.png: clip p.sub'], consoleErrors: ['today-390-16-light.png: Uncaught Error: boom'] });
  for (const want of ['FAIL', '1 finding', '1 console error', 'clip p.sub', 'Uncaught Error: boom', '404.html', 'not checked']) {
    assert.ok(t.includes(want), `missing "${want}" in:\n${t}`);
  }
});

test('commentText: no pages says only that the alias answered, and a reason appears when given', () => {
  const t = commentText({ ...BASE, views: [], shots: 0, answered: 200 });
  assert.match(t, /no pages/i);
  assert.match(t, /200/);
  const f = commentText({ ...BASE, views: [], shots: 0, pass: false, reason: 'the Workers build failed' });
  assert.ok(f.includes('the Workers build failed') && f.includes('FAIL'));
});
