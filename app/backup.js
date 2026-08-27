/* Take the record out of the browser, and put it back.

   Everything Benchcard knows lives in one `localStorage` key, and a browser is
   allowed to throw that away: WebKit deletes local storage after seven days
   without a visit (a home-screen install is exempt, a tab is not), and
   "clear history" takes it everywhere. A coach who sets up in October and
   comes back in January finds an empty app and no explanation. A file they
   own is the only answer that does not need a server.

   Two rules hold this module to one page of code:

   1. **There is no second serialiser.** Export is `JSON.stringify(state)`.
      The accessors on `state` (`players`, `day`, `activeGame`, `teamName`) are
      non-enumerable precisely so that walk yields the record shape, which
      means the exported bytes are what `saveState` already writes -- pretty-
      printed, so a coach who opens the file sees something legible. A hand
      written writer here would be a second copy of the schema to drift.

   2. **There is no second parser.** Import runs `sanitize` from storage.js,
      the same call boot makes, so every field is whitelisted, every dangling
      id is swept and a v3 file loads for free. Anything `sanitize` rejects --
      or a record it accepts that holds no team and was never onboarded, which
      is what any other JSON file degrades to -- is not ours.

   The DOM half (which button, which toast) is deliberately not here: this file
   takes strings and records so `test/backup.test.js` can hold the round-trip
   to being lossless without a browser. */

import { sanitize } from './storage.js';

/** `benchcard-wildcats-6th-grade-2026-08-23.json`, or no slug if unnamed. */
export function backupFilename(teamName, date = new Date()) {
  const slug = String(teamName || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const p = n => String(n).padStart(2, '0');
  // the coach's own date, not UTC: a Saturday game exported at 8pm Pacific is
  // not Sunday's backup
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `benchcard-${slug ? slug + '-' : ''}${stamp}.json`;
}

/** `benchcard-wildcats-6th-grade-2026-08-23-season.csv`.

    The season CSV is a *report*, not a backup -- it is read, never restored,
    and it does not go near `sanitize`. It borrows this module's stamp anyway
    so a coach's two Benchcard files sort together in Downloads, and so there
    is one place that knows how a team name becomes a filename. Its contents
    are built in `season-view.js`, which owns the ledger's wording. */
export const seasonFilename = (teamName, date = new Date()) =>
  backupFilename(teamName, date).replace(/\.json$/, '-season.csv');

/** The bytes of a backup. Indented: the file is a coach's, not a wire format. */
export const backupText = state => JSON.stringify(state, null, 2);

/**
 * Read a backup file's text back into a record, or `null` if it is not ours.
 * `helpers` is the same `{ emptyConstraints, newGame, migrateLegacy }` boot
 * hands `loadState`.
 */
export function readBackup(text, helpers) {
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  const s = sanitize(raw, helpers);
  if (!s) return null;
  /* `sanitize` is generous by design -- it is there to salvage a half-written
     record, so it turns `{}` into a valid empty one. That is right on boot and
     wrong here: an empty record is exactly what someone's shopping list
     becomes, and importing it would wipe the roster it replaced. A backup
     worth restoring has a team in it, or was written by a coach who had
     finished onboarding. */
  if (!s.onboarded && !s.teams.some(t => t.players.length)) return null;
  return s;
}

/* Hand a file to the browser. Same `<a download>` + object-URL dance as
   share.js's PNG fallback, and revoked on the same generous timer -- Safari
   has been known to start the download after the click returns.

   Generic because there are now two files a coach can save -- the backup and
   the season CSV -- and two copies of this would be two things to get wrong
   about revoking. */
export function downloadText(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const downloadBackup = (state, filename) =>
  downloadText(backupText(state), filename, 'application/json');

/* ================================================================== *
 * Ask the browser to keep us
 *
 * `navigator.storage.persist()` asks the browser not to reclaim this
 * origin's storage on its own -- which is the eviction the box above
 * exists to survive. It costs nothing to ask and it is the fix the
 * backup file is only a fallback for, so it is asked once, at boot,
 * and never nagged about.
 *
 * Measured 2026-08-26, not read off a table. Chromium (headless and
 * headed, with and without a gesture, in a persistent profile) answers
 * `false` and leaves `persisted()` false; grant `durableStorage` over
 * the DevTools protocol and the same page answers `true` and reports
 * `persisted()` true before it is even asked. Desktop WebKit -- which
 * is the engine iOS Safari runs, but NOT iOS Safari, and there is no
 * simulator here -- answers `false` in every arm, and does not know
 * the `persistent-storage` permission name at all. So the request is
 * cheap, sometimes granted, and never something to promise on.
 *
 * Which is why the answer returned here is `persisted()` and not
 * `persist()`. They can disagree, and only one of them is the browser
 * saying what is true right now: an origin can already be persisted
 * without asking, and a `persist()` that resolves is still not a
 * report of the state. Nothing that reassures a coach may be drawn
 * from anything but this.
 * ================================================================== */
export async function keepStored() {
  const s = globalThis.navigator?.storage;
  if (typeof s?.persisted !== 'function') return false;
  // a browser that refuses to be asked has certainly not granted it, so the
  // throw is not interesting -- the state below is
  try { await s.persist?.(); } catch { /* fall through to the real answer */ }
  try { return await s.persisted() === true; } catch { return false; }
}
