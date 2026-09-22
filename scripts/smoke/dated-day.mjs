import { evalIn, step } from './dom.mjs';
import { RICH, reloadWithRecord, goRich } from './fixtures.mjs';
import { nameOf } from './registry.mjs';

/* #100 (docs/specs/100-dated-days.md), Proof row 4: "New day" is gone --
   `#todayNewDay` no longer exists anywhere on Today -- and a day dated
   before today files itself on boot, no tap required. `PAST_DAY` is RICH
   with its one change: `day.date` pinned to 2024-01-06, a Saturday safely in
   the past (so this stays true no matter what day the harness actually runs
   on) -- everything else about the day, including its two solved games, is
   RICH's own fixture, unmodified. The toast's exact wording
   ("Sat, Jan 6: 2 games saved to the season.") is hand-computed from that
   same fixed date, the way `en-US` renders `{ weekday: 'short', month:
   'short', day: 'numeric' }` -- not read back from the app's own formatter. */
const PAST_DAY = {
  ...RICH,
  teams: [{ ...RICH.teams[0], day: { ...RICH.teams[0].day, date: '2024-01-06' } }],
};

/* #100 review, finding 2: the same day, dated so far in the future
   (2099-12-31, safely past this app's lifetime, never past-dated on any
   clock this check will ever run under) that it can never file. Loading it
   puts the SAME day and season content that PAST_DAY carries through
   `sanitizeTeam` -- the app's own migration/normalization, which adds
   fields raw fixture data does not have (`constraints`, `live`, and so on)
   -- without ever running filing, so its saved record is the "before"
   shape Undo has to restore, produced by the app itself rather than
   retyped by hand. Only `day.date` differs from PAST_DAY on purpose: that
   field is asserted against the literal '2024-01-06' below instead, since
   this fixture's own date is the one field that is NOT what filing should
   restore. */
const NEVER_DAY = {
  ...RICH,
  teams: [{ ...RICH.teams[0], day: { ...RICH.teams[0].day, date: '2099-12-31' } }],
};

export async function datedDayPass(c, origin) {
  const problems = [];
  try {
    await reloadWithRecord(c, origin, { ...NEVER_DAY, view: 'today' });
    const before = JSON.parse(await evalIn(c, `JSON.stringify({
      day: JSON.parse(localStorage.getItem('benchcard.v6')).teams[0].day,
      seasonGames: JSON.parse(localStorage.getItem('benchcard.v6')).teams[0].season.games,
    })`));

    await reloadWithRecord(c, origin, { ...PAST_DAY, view: 'today' });

    const after = JSON.parse(await evalIn(c, `JSON.stringify({
      onToday: !!(document.getElementById('view-today') && !document.getElementById('view-today').hidden),
      hasNewDayBtn: !!document.getElementById('todayNewDay'),
      gamesOnToday: document.querySelectorAll('.today-game').length,
      toastText: document.querySelector('#toasts .toast[data-undo] .tmsg')?.textContent.trim() ?? null,
      record: JSON.parse(localStorage.getItem('benchcard.v6')),
    })`));

    if (after.hasNewDayBtn) problems.push('#todayNewDay is still on Today; "New day" was supposed to be removed');
    if (!after.onToday) problems.push('did not land on Today after boot');

    const t0 = after.record?.teams?.[0];
    const seasonCount = t0?.season?.games?.length ?? -1;
    // RICH ships with 3 filed games already; the past day's two solved games
    // (Hawks, Ravens) join them.
    if (seasonCount !== 5) {
      problems.push(`the record's season has ${seasonCount} filed game(s) after boot, want 5 (RICH's 3 plus the 2 the past day filed)`);
    }
    if (t0 && !t0.season.games.some(g => g.date === '2024-01-06' && g.opponent === 'Hawks')) {
      problems.push('the filed Hawks game is not dated 2024-01-06 (the day it was played on)');
    }
    if (t0 && !t0.season.games.some(g => g.date === '2024-01-06' && g.opponent === 'Ravens')) {
      problems.push('the filed Ravens game is not dated 2024-01-06 (the day it was played on)');
    }
    if (t0 && t0.day.date === '2024-01-06') problems.push('the day on screen is still dated 2024-01-06 -- filing did not replace it');
    if (t0 && !/^\d{4}-\d{2}-\d{2}$/.test(t0.day.date || '')) problems.push(`the fresh day's date reads "${t0 && t0.day.date}", want a real YYYY-MM-DD`);
    if (after.gamesOnToday !== 1) problems.push(`Today shows ${after.gamesOnToday} game(s) after filing, want 1 (the fresh day)`);

    if (!after.toastText) {
      problems.push('no Undo toast was shown after a past day filed');
    } else if (after.toastText !== 'Sat, Jan 6: 2 games saved to the season.') {
      problems.push(`the filing toast reads "${after.toastText}", want "Sat, Jan 6: 2 games saved to the season."`);
    }

    /* #100 review, finding 2: Undo has to put the day AND the season back
       exactly as they were before filing -- not just show a plausible
       screen. Tap the toast's own Undo control (the same selector
       `today-keys-and-undo.mjs` uses), then read the saved record and
       Today itself, and compare against `before`, captured above from the
       identical day and season content before anything filed. */
    await evalIn(c, step(`document.querySelector('#toasts .toast[data-undo] .tundo')?.click()`));

    const undone = JSON.parse(await evalIn(c, `JSON.stringify({
      gamesOnToday: document.querySelectorAll('.today-game').length,
      gameLabels: [...document.querySelectorAll('.today-game')].map(n => n.textContent),
      record: JSON.parse(localStorage.getItem('benchcard.v6')),
    })`));
    const u0 = undone.record?.teams?.[0];

    if (undone.gamesOnToday !== 2) {
      problems.push(`Undo: Today shows ${undone.gamesOnToday} game(s), want 2 (Hawks and Ravens, restored)`);
    }
    if (!u0 || u0.day.date !== '2024-01-06') {
      problems.push(`Undo: the day's date reads "${u0 && u0.day.date}", want "2024-01-06" (the filed day, restored)`);
    }
    if (!u0 || u0.day.name !== before.day.name) {
      problems.push(`Undo: the day's name reads "${u0 && u0.day.name}", want "${before.day.name}" (the day before it filed)`);
    }
    if (!u0 || JSON.stringify(u0.day.games) !== JSON.stringify(before.day.games)) {
      problems.push('Undo: the day\'s games do not match what was there before filing (Hawks and Ravens, unfiled)');
    }
    if (!u0 || JSON.stringify(u0.season.games) !== JSON.stringify(before.seasonGames)) {
      problems.push('Undo: the season\'s games do not match what was there before filing (RICH\'s 3, not the 2 Hawks/Ravens filed)');
    }
  } catch (e) {
    problems.push(`threw: ${e.message}`);
  }

  await goRich(c, origin); // restore RICH for every check that runs after this one

  return {
    name: nameOf('dateddayfiling'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 5).join(' | ')}`
      : 'no #todayNewDay on Today; a past-dated day files itself on boot, shows the Undo toast '
        + 'with the right date and count, Today opens on a fresh day, and tapping Undo restores '
        + 'the day and the season exactly as they were before filing',
  };
}
