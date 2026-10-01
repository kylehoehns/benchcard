import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalIn, step, wait, objectIdFor, TODAY_HOME } from './dom.mjs';
import { tap, evalJSON } from './sheet-drive.mjs';
import { capInstall, capReset, capRead, capRestore } from './capture.mjs';
import { backupFilename } from '../../app/backup.js';

/* #263 E-H (docs/specs/263-share-backup-tests.md): the backup file a coach
   saves, and the two ways they put one back, on the Settings page
   `settingsRowPass` has already loaded. Every restore is undone before the
   next step, so the fixture is the record this started with when the row
   hands the page on. The file the picker "chooses" is real -- written to a
   temp dir and handed over with `DOM.setFileInputFiles`, the same path a
   coach's tap takes -- and its player count is read from the file itself. */

const STATE = `(await import('/state.js')).state`;
const count = rec => rec.teams.reduce((n, t) => n + t.players.length, 0);
const restored = rec => `Restored ${count(rec)} player${count(rec) === 1 ? '' : 's'}`
  + `${rec.teams.length > 1 ? ` across ${rec.teams.length} teams` : ''}.`;
const NOT_A_BACKUP = 'That is not a Benchcard backup.';

// `cap.toasts` grows as toasts appear; wait for it to reach `n` (a file's
// text is read asynchronously) rather than sleeping a guessed time.
async function toastsAt(c, n) {
  for (let i = 0; i < 60; i++) {
    const r = await capRead(c);
    if (r.toasts.length >= n) return r;
    await wait(50);
  }
  return capRead(c);
}

export async function backupChecks(c, ck) {
  const dir = mkdtempSync(join(tmpdir(), 'benchcard-263-'));
  await evalIn(c, step(`document.querySelector('#settingsBtn').click()`));
  await capInstall(c);
  try {
    const live = () => evalJSON(c, `(async () => JSON.stringify({
      players: ${STATE}.players.map(p => p.name), record: JSON.stringify(${STATE}) }))()`);
    const before = await live();

    /* ---- E. saved ---- */
    await capReset(c);
    await tap(c, `document.getElementById('exportBackup').click()`);
    let r = await capRead(c);
    const name = await evalJSON(c, `(async () => JSON.stringify(${STATE}.teamName))()`);
    const file = r.clicks[0] || {};
    const wantName = backupFilename(name, new Date(2026, 8, 12));
    ck(r.clicks.length === 1 && file.download === wantName,
      `saving a backup clicked ${r.clicks.length} download(s), the first named "${file.download}", want one named ${wantName}`);
    ck(file.type === 'application/json', `the backup Blob is "${file.type}", want application/json`);
    ck(r.toasts.length === 1 && r.toasts[0] === 'Backup saved. Keep it somewhere safe.',
      `saving a backup toasted ${JSON.stringify(r.toasts)}, want ["Backup saved. Keep it somewhere safe."]`);
    const text = file.text || '{}';
    const rec = JSON.parse(text);
    ck(JSON.stringify(rec) === before.record, 'the saved backup is not the live record');
    const accepted = await evalJSON(c, `(async () => {
      const { readBackup } = await import('/backup.js');
      const s = await import('/state.js');
      const rec = readBackup(${JSON.stringify(text)}, { emptyConstraints: s.emptyConstraints, newGame: s.newGame, migrateLegacy: s.migrateLegacy });
      return JSON.stringify(rec && rec.teams.length);
    })()`);
    ck(accepted === rec.teams.length, `readBackup read the saved file as ${accepted} team(s), want ${rec.teams.length}`);

    /* ---- F. restored from a file, then undone ---- */
    const fewer = JSON.parse(text);
    fewer.teams[0].players.splice(0, 3);       // a different roster, so the restore shows
    const two = JSON.parse(text);
    const second = JSON.parse(text).teams[0];
    second.id = 't1'; second.name = 'JV Ravens';
    two.teams.push(second);
    const pick = async rec => {
      const path = join(dir, `b${Math.random().toString(36).slice(2)}.json`);
      writeFileSync(path, typeof rec === 'string' ? rec : JSON.stringify(rec));
      await capReset(c);
      await c.send('DOM.setFileInputFiles', { files: [path], objectId: await objectIdFor(c, '#backupFile') });
      return toastsAt(c, 1);
    };
    const undo = async () => {
      await tap(c, `document.querySelector('.toast .tundo').click()`);
      return live();
    };
    for (const [what, file] of [['one team', fewer], ['two teams', two]]) {
      r = await pick(file);
      ck(r.toasts[0] === restored(file), `restoring ${what} toasted ${JSON.stringify(r.toasts)}, want "${restored(file)}"`);
      const now = await live();
      const want = file.teams[0].players.map(p => p.name);
      ck(JSON.stringify(now.players) === JSON.stringify(want),
        `after restoring ${what} the roster reads ${JSON.stringify(now.players)}, want ${JSON.stringify(want)}`);
      const back = await undo();
      ck(JSON.stringify(back.players) === JSON.stringify(before.players),
        `Undo after restoring ${what} left ${JSON.stringify(back.players)}, want the earlier roster`);
    }

    /* ---- G. rejected: not a backup, nothing changes ---- */
    for (const junk of ['{"shopping":["milk","eggs"]}', 'not json at all']) {
      r = await pick(junk);
      const now = await live();
      ck(r.toasts[0] === NOT_A_BACKUP && now.record === before.record,
        `restoring ${JSON.stringify(junk)} toasted ${JSON.stringify(r.toasts)} and the record ${now.record === before.record ? 'held' : 'changed'}, want "${NOT_A_BACKUP}" and no change`);
    }

    /* ---- H. paste restore ---- */
    const paste = await evalJSON(c, `JSON.stringify((() => {
      const w = document.querySelector('#view-settings .pastein');
      return { has: !!w };
    })())`);
    ck(paste.has, 'Settings has no paste box (#view-settings .pastein)');
    const box = () => evalJSON(c, `JSON.stringify((() => {
      const w = document.querySelector('#view-settings .pastein');
      return { text: w.querySelector('.paste-text').value, boxHidden: w.querySelector('.pastebox').hidden,
        openHidden: w.querySelector('.paste-open').hidden };
    })())`);
    const pasteIn = async value => {
      await capReset(c);
      await tap(c, `const w = document.querySelector('#view-settings .pastein');
        w.querySelector('.paste-open').click();
        const t = w.querySelector('.paste-text'); t.value = ${JSON.stringify(value)};`);
      await tap(c, `document.querySelector('#view-settings .paste-go').click()`);
      return capRead(c);
    };
    r = await pasteIn(JSON.stringify(fewer));
    let b = await box();
    ck(r.toasts[0] === restored(fewer), `a pasted restore toasted ${JSON.stringify(r.toasts)}, want "${restored(fewer)}"`);
    ck(b.text === '' && b.boxHidden && !b.openHidden,
      `after a pasted restore the box reads ${JSON.stringify(b)}, want it empty, hidden, with "or paste a backup" showing`);
    const back = await undo();
    ck(JSON.stringify(back.players) === JSON.stringify(before.players), 'Undo after a pasted restore did not bring the earlier roster back');
    r = await pasteIn('this is not a backup');
    b = await box();
    ck(r.toasts[0] === NOT_A_BACKUP && b.text === 'this is not a backup' && !b.boxHidden,
      `pasting junk toasted ${JSON.stringify(r.toasts)} and left the box ${JSON.stringify(b)}, want "${NOT_A_BACKUP}", the text kept and the box open`);
    // put the box back as the other Settings checks expect it
    await tap(c, `const w = document.querySelector('#view-settings .pastein');
      w.querySelector('.paste-text').value = ''; w.querySelector('.pastebox').hidden = true;
      w.querySelector('.paste-open').hidden = false;`);
    ck((await live()).record === before.record, 'the record is not what the row started with after the backup checks');
  } finally {
    await capRestore(c);
    rmSync(dir, { recursive: true, force: true });
    await evalIn(c, step(TODAY_HOME));
  }
}
