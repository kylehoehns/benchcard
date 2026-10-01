# #263 — Cover share image, backup and season CSV

## Issue

#263: the card image, the backup file and the season spreadsheet are three
of the things a coach hands to someone else, and almost none of their code
runs under test. `app/share.js` is 7.1% covered. Drive each one end to end
and check what comes out.

## Goal

Every way a coach shares the card, saves or restores a backup, or saves the
season spreadsheet runs in a test that checks the output: the PNG's size,
the toast the coach sees, the file's name and first line. The coverage floor
in `scripts/coverage.json` is re-recorded higher.

## What the survey found

On `main` (cc2ad7f):

- **`app/share.js`** is 7.1% covered: 145 lines uncovered, from `offscreen`
  through `drawCards`, `pngBlob`, `shareCards` and `save` (lines 42-229).
- **`shareCards` has three ways out.** In order:
  - `navigator.canShare({files})` true: `navigator.share`, resolving
    `'shared'`, or `'cancelled'` on an `AbortError`, or rejecting otherwise;
  - `navigator.clipboard.write` and `ClipboardItem` present: resolves
    `'copied'`, or falls back to a save if the write rejects;
  - otherwise `save`: an `<a download>` click on an object URL, `'saved'`.
- **The PNG's size** (`drawCards`, `SCALE=3`, `PAD=14`, `GAP=14`,
  `FOOT=30`):
  - width = round((sum of card widths + 14 × (cards − 1) + 28) × 3);
  - height = round((tallest card + 14 + 30) × 3).
  - The card is 3.45in × 5in with `box-sizing: border-box`, so 331.2 × 480
    CSS px at `--cardzoom: 1`. One card gives **1078 × 1572**.
  - `.card` also has `zoom: var(--cardzoom)`, so the measured rect, not the
    stylesheet, decides.
- **`shareCardImage`** (`app/app.js:235-266`) wraps it:
  - a throw while painting: "Could not make the image. Print still works.";
  - `'copied'`: "Card copied. Paste it into a message.";
  - `'saved'`: "Card saved as a PNG.";
  - `'shared'` and `'cancelled'`: no toast;
  - a rejected share: "Could not share the image. Print still works.";
  - the filename is `benchcard-<slug>.png`, the slug taken from the game
    label, else the team name, else `rotation`.
- **Backup** (`app/app.js:297-369`):
  - `#exportBackup`: "Backup saved. Keep it somewhere safe.", or "Could not
    save the backup file." on a throw;
  - `#backupFile` change: "Could not read that file." if `file.text()`
    rejects;
  - `restoreBackup`: "That is not a Benchcard backup." on a rejected string;
    otherwise an undo toast, "Restored N player(s)." with " across T teams"
    when there is more than one team;
  - `.paste-go` clears and closes the paste box only on success.
- **Season CSV** (`app/season-view.js:278-305`):
  - the header is `Player,<one column per filed game>,Total`;
  - the file starts with a BOM (`﻿`), lines end `\r\n`, and the type is
    `text/csv;charset=utf-8`;
  - toasts: "Spreadsheet saved." or "Could not save the spreadsheet.".
- **`downloadText`** (`app/backup.js:82-90`) is the one download path for
  both files: a Blob, an object URL, an `<a download>` click, then a revoke
  after 10 seconds.
- **Already tested:** `readBackup`, `backupFilename`, `seasonFilename`
  (`test/backup.test.js`); `seasonCsv` is read as source in
  `test/season-view.test.js`.
- **Toasts in smoke.** Toasts land in `#toasts .toast`; an undo toast has
  `[data-undo]` and its button `.tundo` (`today-keys-and-undo.mjs:95-98`).
- **Smoke rows already on these pages:**
  - `timeline-card-sheet.mjs` `timelineCardSheetPass` opens the share sheet
    on the rich fixture and reads `#shareCard` (lines 286-417);
  - `season.mjs` `seasonPass` reaches Season with `#seasonExport` showing
    (line 213);
  - `settings-rows.mjs` `settingsRowPass` is on Settings, where
    `#exportBackup`, `#importBackup` and the paste box live;
  - `overlay.mjs` opens the paste box but deliberately never presses
    `.paste-go` (line 169).

## Decisions (made with the human)

1. **Scope.** This issue covers the share image, backup save and restore,
   and the season CSV. Roster (#264), settings and rules (#265) and dead code
   (#262) are separate. Phone-only and timing-only branches are out.
2. **Batch.** One of four issues, each built in its own worktree and merged
   one at a time. Each PR re-records the coverage floor.
3. **Node first, extend rows.** Anything that imports under
   `test/dom-stub.js` is tested in `node --test`. Browser checks extend the
   existing rows above, on a page they have already loaded, rather than add
   rows that reload. The PR reports the smoke time before and after; there is
   no hard cap.
4. **Bugs a new test finds.** Fixed in this PR when the fix is about 20 lines
   of `app/` or fewer and obvious, and called out in the PR. Anything bigger
   becomes its own issue.

## What would settle it

At 390×844, under the smoke clock, on the pages the rows already load:

- **A. Saved PNG.** With `navigator.canShare` and `navigator.clipboard`
  removed, tap `#shareCard` on the rich fixture.
  - One `<a download>` is clicked, named `benchcard-<slug>.png`, holding an
    `image/png` Blob that starts with the PNG signature.
  - Its decoded width and height are 1078 × 1572 for one card, and in every
    case equal the formula above applied to the cards' measured rects.
  - The toast reads "Card saved as a PNG.".
  - No offscreen host is left in the DOM.
- **B. Copied.** With `canShare` false and a stub `clipboard.write` that
  resolves: the stub receives one `ClipboardItem` with `image/png`, and the
  toast reads "Card copied. Paste it into a message.". With a stub that
  rejects, it falls through to A's save and toast.
- **C. Shared and cancelled.** With `canShare` true and a stub `share`:
  - resolving: the stub gets one `File` and the title; no toast;
  - rejecting with an `AbortError`: no toast;
  - rejecting with any other error: "Could not share the image. Print still
    works.".
- **D. Paint fails.** With `HTMLCanvasElement.prototype.getContext`
  returning null: "Could not make the image. Print still works.", and no
  share, copy or save happens.
- **E. Backup saved.** Tap `#exportBackup`: one `<a download>` named by
  `backupFilename`, holding `application/json` that `readBackup` accepts and
  that matches the live state. Toast: "Backup saved. Keep it somewhere safe.".
- **F. Backup restored from a file.** Set `#backupFile`'s file over CDP
  (`DOM.setFileInputFiles`) to a backup with a known count:
  - the undo toast reads "Restored N players." (or "across T teams" for a
    multi-team file) and the roster shows the restored players;
  - tapping `.tundo` puts the earlier roster back.
- **G. Restore rejected.** A file that is not a backup: "That is not a
  Benchcard backup." and the state is unchanged.
- **H. Paste restore.** On Settings, paste a valid backup into the paste box
  and press `.paste-go`: same toast as F, the textarea is empty, the box is
  hidden and `.paste-open` shows. Paste junk: the rejection toast, and the
  text and the box stay.
- **I. Season CSV.** Tap `#seasonExport` on the rich fixture's Season:
  - one `<a download>` named by `seasonFilename`, type
    `text/csv;charset=utf-8`;
  - the text starts with `﻿`, its first line is
    `Player,<the filed games' titles>,Total`, and lines end `\r\n`;
  - toast: "Spreadsheet saved.".
- **J. Unit level.** Under `node --test`, `downloadText` builds one Blob of
  the given type, clicks one `<a>` with that `download` name, and revokes the
  object URL once the timer runs. (`restoreBackup` lives in `app.js`, which
  no test imports, so its copy is checked in the browser only.)
- **K. Coverage.** `app/share.js` is above 80% lines. The full run's total
  is above the current record (92.20), and `--update-coverage` records it.

## Surfaces

- **Changes:**
  - `scripts/smoke/timeline-card-sheet.mjs` (A-D);
  - `scripts/smoke/settings-rows.mjs` (E-H);
  - `scripts/smoke/season.mjs` (I);
  - `test/backup.test.js`, and `test/season-view.test.js` if a check fits
    there better (J);
  - `scripts/coverage.json` (K);
  - `app/`, only for a bug fix that Decision 4 allows.
- **Must not change:**
  - what the PNG looks like, or the order of the three share branches;
  - the backup format and `readBackup`;
  - the CSV's bytes;
  - `overlay.mjs`'s paste-box state (it stays a layout check).

## Constraints

- **Stub in the page, then put it back.** Each branch is forced by replacing
  `navigator.canShare`, `navigator.share`, `navigator.clipboard`,
  `URL.createObjectURL` or `HTMLAnchorElement.prototype.click` inside the
  page, and restoring the originals before the row moves on. A real download
  or a real share sheet must never open in headless Chrome.
- **Read the size from the PNG.** Decode width and height from the IHDR bytes
  of the captured Blob. Do not trust `canvas.width`; the Blob is what a coach
  gets.
- **No reloads added.** Every check runs on a page its row has already
  loaded. A restore changes state, so it runs last in its row or is undone
  before the row's existing checks.
- **The activation rule.** `shareCards` is called with no `await` in front of
  it (`app.js:229` comment). Tests must not add one.
- **Precache.** Only bump `sw.js` if `app/` changes.

## Design

1. **A shared capture helper** in `scripts/smoke/` (or inside the row that
   needs it first): install stubs that record `<a download>` clicks (name,
   Blob type, bytes as base64) and the last toast text; a `restore` call puts
   everything back.
2. **Share branches** run in `timelineCardSheetPass` after its existing
   `#shareCard` checks, one branch per stub set, each reading the toast and
   the capture.
3. **Backup** runs in `settingsRowPass`: export, then file restore with undo,
   then the rejection, then paste restore. The fixture file is built from the
   export the row just captured, so its player count is known.
4. **CSV** runs in `seasonPass` where `#seasonExport` is already visible.
5. **Node** tests for `downloadText` with a stubbed `document` and
   `URL.createObjectURL`, using `test/dom-stub.js`.
6. **Re-record** the floor from a full run and state the before and after in
   the PR.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| Share branches, PNG size, toasts | `timeline-card-sheet.mjs`, rich fixture | A, B, C, D |
| Backup save, restore, undo, reject, paste | `settings-rows.mjs` | E, F, G, H |
| Season CSV bytes and toast | `season.mjs` | I |
| `downloadText` | `node --test` (`test/backup.test.js`) | J |
| Coverage total and `share.js` | one full `npm run smoke`, output read | K |

## Out of scope

- The real share sheet and the real clipboard (phone-only).
- The 10-second revoke timer's exact timing.
- `keepStored` and the persist note.
- Roster, settings and rule flows (#264, #265) and dead code (#262).
- Changing any copy above. A test that finds wrong copy reports it.
