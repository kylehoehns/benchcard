import { TODAY_HOME } from './dom.mjs';
import { TOUCH_FLOOR, TOUCH_WIDTHS } from './sizes.mjs';
import { widthSweep, recordSweep } from './width-sweep.mjs';
import { backupChecks } from './backup-restore.mjs';

/* #22, spec "What would settle it" item 7: every row in #view-settings --
   each setting row, each link row and the backup row -- at least 48px, at
   the same three widths `touchPass` sweeps (`TOUCH_WIDTHS` -- both checks are
   "phone widths a coach actually carries", so this reads that list rather
   than keeping a second copy of the same three numbers). Settings has no tab
   of its own (it is behind the cog), so the one state here is opening it and
   nothing else. */
const SETTINGS_STATES = [
  { name: 'settings', open: `document.querySelector('#settingsBtn').click()` },
];
export async function settingsRowPass(c, source, rec) {
  const { bad, gone, audited, seen } = await widthSweep(c, source, {
    states: SETTINGS_STATES,
    checkName: 'settings rows ≥ 48px',
    countRe: [/(\d+) rows/],
    label: (st, w) => `${w}px`,
    missing: 'the settings-row check is gone from smoke-checks.js',
    close: TODAY_HOME,
  });

  // #263 E-H: the backup row's own behavior, on the page already loaded.
  recordSweep(rec, { bad, gone, audited }, { what: 'settings row', floor: TOUCH_FLOOR });
  await backupChecks(c, rec.check);
  rec.ok(`${audited} measurements (${TOUCH_WIDTHS.join('/')}px), up to ${seen} rows, all ≥ 48px; `
    + 'backup saves, restores from a file and from paste, undoes, and rejects a non-backup');
}
