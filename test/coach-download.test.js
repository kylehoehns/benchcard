/* Coach.download(): it returns the file the app saved, and ignores any other
 * download Chrome makes into the folder (#401). Driven in real Chrome through
 * `test/coach.js`. Skipped where there is no Chrome. */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Coach, hasChrome } from './coach.js';

const skip = !(await hasChrome()) && 'no Chrome on this machine';

describe('Coach.download', { skip }, () => {
  let coach;
  before(async () => { coach = await Coach.open(); });
  after(async () => { await coach?.close(); });

  test('a control that saves two files fails, naming the count', async () => {
    await coach.onGameDayMidSeason();
    await coach.c.send('Runtime.evaluate', { expression: `(() => {
      const b = document.createElement('button');
      b.textContent = 'Save two files';
      b.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647';
      b.onclick = () => {
        for (const n of ['one.txt', 'two.txt']) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([n]));
          a.download = n;
          a.click();
        }
      };
      document.body.append(b);
    })()` });

    await assert.rejects(coach.download('Save two files'), /saved 2 files/);
  });

  test('a download the app did not make, held open in the same folder, does not count', async () => {
    /* A server on another origin whose download starts and never finishes,
       the way the half-written downloads.html.crdownload looked on CI. */
    const foreign = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Disposition': 'attachment; filename="downloads.html"' });
      res.write('<html>');
    });
    await new Promise(ok => foreign.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${foreign.address().port}/downloads.html`;
    const realSend = coach.c.send;
    let started = false;
    coach.c.send = async (method, params) => {
      const reply = await realSend(method, params);
      if (method === 'Browser.setDownloadBehavior' && !started) {
        started = true;
        const began = new Promise(ok => coach.c.on('Browser.downloadWillBegin', p => { if (p.url === url) ok(); }));
        /* The attachment header makes Chrome save it; the page stays put. */
        await realSend('Runtime.evaluate', { expression: `(() => { const a = document.createElement('a'); a.href = ${JSON.stringify(url)}; document.body.append(a); a.click(); a.remove(); })()` });
        await began;
      }
      return reply;
    };
    try {
      await coach.onGameDayMidSeason();
      await coach.tap('Season 3 games filed ›');

      const file = await coach.download('Export');

      assert.match(file.filename, /^benchcard-smoke-test-.*-season\.csv$/);
      assert.match(file.text.replace(/^﻿/, ''), /^Player,/);
    } finally {
      coach.c.send = realSend;
      foreign.closeAllConnections();
      await new Promise(ok => foreign.close(ok));
    }
  });
});
