import { evalIn, step } from './dom.mjs';
import { nameOf } from './registry.mjs';

/* ---------- the states the first pass never sees ----------

   `smoke-checks.js` audits whatever is on screen, and what is on screen when
   the app boots is one screen: 54 controls. Counting the ones inside closed
   dialogs and overlays finds three times that. Help, the shortcuts
   sheet, game mode and the tour were never checked by anything.

   So: open each state, re-run the same file, keep only its accessibility
   verdicts. Written here rather than in `smoke-checks.js` on purpose — that
   file stays one paste-able expression that audits "now", and knowing how to
   drive this particular app is the harness's job.

   `open`/`close` are statements evaluated in the page with `$` in scope, and
   `shows` is the element that proves the state actually arrived: without it a
   renamed button would silently audit the opening screen twelve times and
   still report green. Everything is driven through the real trigger where one
   exists; `forced` marks the states that have no reachable trigger (the
   welcome screen needs a fresh install) and are shown by hand, which covers
   their static markup. */
export const STATES = [
  /* Today is home (#23): every state below opens from it and every `close`
     returns to it (`#backBtn`), which is the same "one baseline" contract the
     old states kept with the games view. */
  { name: 'team view',
    open: `$('#todayTeam').click()`, shows: '#view-team',
    close: `$('#backBtn').click()` },
  /* #31: the Team screen's three sheets and its Edit mode, in place of the
     old `team + bulk add` fold. Each opens through its real trigger -- a
     roster row, the header `+`, the "Paste a list" row, the header "Edit" --
     and the sheets close with the dialog's own `close()` rather than their ✕,
     the same way "who's here sheet" does: this pass audits accessibility, and
     `team screen: roster rows, the player sheet, add and paste` is what covers
     the close paths. `close()` also steps around the paste sheet's discard
     guard, which nothing here has typed into anyway. Edit mode is a screen
     state rather than an overlay, but it swaps every row in the list for a
     different control set, so it is audited like one and toggled back off. */
  { name: 'team player sheet',
    open: `$('#todayTeam').click(); $('#rosterlist .rrow').click()`, shows: '#sheetPlayer[open]',
    close: `$('#sheetPlayer').close(); $('#backBtn').click()` },
  { name: 'team add a player',
    open: `$('#todayTeam').click(); $('#teamAdd').click()`, shows: '#sheetAddPlayer[open]',
    close: `$('#sheetAddPlayer').close(); $('#backBtn').click()` },
  { name: 'team paste a list',
    open: `$('#todayTeam').click(); $('#pasteRow').click()`, shows: '#sheetPaste[open]',
    close: `$('#sheetPaste').close(); $('#backBtn').click()` },
  { name: 'team edit mode',
    open: `$('#todayTeam').click(); $('#teamEdit').click()`, shows: '#rosterlist .rrow-edit',
    close: `$('#teamEdit').click(); $('#backBtn').click()` },
  { name: 'games view, every disclosure open',
    open: `$('.today-game').click(); for (const d of document.querySelectorAll('details')) d.open = true`,
    shows: '#tabledetails[open]',
    close: `for (const d of document.querySelectorAll('details')) d.open = false; $('#backBtn').click()` },
  /* #27 item 10: the first of the three new sheets, opened through its real
     trigger (the sentence's players phrase) rather than by hand -- the same
     rule every other state here follows. Closed with the dialog's own native
     `close()` rather than the ✕: this pass audits accessibility, not the
     sheet's own close paths, which `sentence and sheets` (the new guard)
     covers. */
  { name: "who's here sheet",
    open: `$('.today-game').click(); $('#phrasePlayers').click()`, shows: '#sheetWho[open]',
    close: `$('#sheetWho').close(); $('#backBtn').click()` },
  /* #28's Plan sheet, opened through its real trigger like every other state
     here. Four states: level 1, and each of the three level-2 pages it owns. */
  { name: 'plan sheet',
    open: `$('.today-game').click(); $('#phraseStrategy').click()`, shows: '#sheetPlan[open]',
    close: `$('#sheetPlan').close(); $('#backBtn').click()` },
  /* A rule's detail needs a rule on the game first, which the harness's
     RICH fixture does not seed (Hawks ships with none) -- seeded the same
     way `plan-sheet.mjs`'s own item 4 seeds one, by editing
     `game().constraints` in the page and calling `renderAll()`, rather than
     driving the whole Add-a-rule flow just to get one row to tap. `close`
     clears it the same way, so the fixture is exactly as it was found for
     every check that runs after this one. */
  { name: 'plan sheet, a rule',
    open: `$('.today-game').click(); $('#phraseRules').click();
           await (async () => {
             const st = await import('/state.js');
             st.game().constraints.minMinutes = { p0: 16 };
             (await import('/render.js')).renderAll();
           })();
           $('#constraints .prow:not(.add-rule)').click();`,
    shows: '#planSub .plan-rule-sentence',
    close: `await (async () => {
              const st = await import('/state.js');
              st.game().constraints.minMinutes = {};
              (await import('/render.js')).renderAll();
            })();
            $('#sheetPlan').close(); $('#backBtn').click()` },
  { name: 'plan sheet, add a rule',
    open: `$('.today-game').click(); $('#phraseRules').click(); $('#constraints .add-rule').click()`,
    shows: '#planAddRuleBtn:not([hidden])',
    close: `$('#sheetPlan').close(); $('#backBtn').click()` },
  { name: 'plan sheet, lineup balance',
    open: `$('.today-game').click(); $('#phraseStrategy').click(); $('#planLineups .prow').click()`,
    shows: '#planSub .prow-shape',
    close: `$('#sheetPlan').close(); $('#backBtn').click()` },
  { name: 'season view',
    open: `$('#todaySeason').click()`, shows: '#view-season',
    close: `$('#backBtn').click()` },
  /* #30: the RICH fixture now files three season games (`fixtures.mjs`), so
     the ledger has folds to open -- each one a `<details class="sn-game">`,
     the app's own `.sn-game > summary.prow` disclosure. Opened the same way
     the games-view disclosures above are, rather than seeding a fourth game
     just to reach this state: the harness never pays a cold-load cost for it,
     since this is a `rich`-setup row and the fixture is already loaded. */
  { name: 'season view, every game open',
    open: `$('#todaySeason').click(); for (const d of document.querySelectorAll('#view-season details')) d.open = true`,
    shows: '#view-season details.sn-game[open]',
    close: `for (const d of document.querySelectorAll('#view-season details')) d.open = false; $('#backBtn').click()` },
  { name: 'settings view',
    open: `$('#settingsBtn').click()`, shows: '#view-settings',
    close: `$('#backBtn').click()` },
  { name: 'settings view, paste box open',
    open: `$('#settingsBtn').click(); $('#view-settings .paste-open').click()`,
    shows: '#view-settings .pastebox',
    // not through `.paste-go`: an empty textarea is a rejected restore, which
    // leaves the box open and the state uncloseable
    close: `$('#view-settings .pastebox').hidden = true;
            $('#view-settings .paste-open').hidden = false;
            $('#backBtn').click()` },
  /* #25: the team color picker, nested inside `#view-settings` (it is
     per-team policy, painted by `renderSettings` -- see the comment in
     index.html above `#colorPicker`), so it opens from the cog exactly
     like the paste box above it. Closed through its own control, not
     `#backBtn`: the dialog is a full-screen `.keyswrap` overlay, so a real
     tap can never reach the back button while it is up. */
  { name: 'team color picker',
    open: `$('#settingsBtn').click(); $('#teamColorBtn').click()`, shows: '#colorPicker',
    close: `$('#colorPickerClose').click(); $('#backBtn').click()` },
  /* `?` and the theme toggle left the top bar for Settings, so these three no
     longer reach `#helpBtn` from the opening screen. Clicking a button inside a
     hidden view still fires its handler, so leaving them alone would have kept
     every one of them green while auditing a control no coach could reach --
     a check passing for the wrong reason. The cog comes first now. */
  { name: 'help sheet',
    open: `$('#settingsBtn').click(); $('#helpBtn').click()`, shows: '#help',
    close: `$('#helpClose').click(); $('#backBtn').click()` },
  { name: 'shortcuts sheet',
    open: `$('#keysHint').click()`, shows: '#keys', close: `$('#keysClose').click()` },
  /* The tour puts itself on the games view before it points at anything
     (`startTour`), so it lands there regardless of where it was opened from;
     `#backBtn` is what returns to Today afterwards now that Today, not games,
     is the baseline every other state assumes. */
  { name: 'tour, first step',
    open: `$('#settingsBtn').click(); $('#helpBtn').click(); $('#helpTour').click()`,
    shows: '#tour', close: `$('#tourSkip').click(); $('#backBtn').click()` },
  { name: 'tour, last step',
    open: `$('#settingsBtn').click(); $('#helpBtn').click(); $('#helpTour').click();
           while (!$('#tourSkip').hidden) $('#tourNext').click()`,
    shows: '#tour', close: `$('#tourNext').click(); $('#backBtn').click()` },
  /* `#gmOpen` lives inside the games view, but clicking a control inside a
     hidden view still fires its handler (same rule `#print`'s own note
     relies on), so this opens bench mode straight from Today without first
     navigating to a game. */
  { name: 'game mode',
    open: `$('#gmOpen').click()`, shows: '#gamemode', close: `$('#gmClose').click()` },
  { name: 'game mode, swap picker',
    open: `$('#gmOpen').click(); $('#gmFloor .gm-p').click()`, shows: '#gamemode .gm-p.picked',
    close: `$('#gmClose').click()` },
  /* #29 decision 3: `#shareBtn` is the one door into the card sheet -- a
     native `<dialog>` nested inside `#view-games`, unlike `#gamemode`
     above (a plain overlay `div` outside it), so `showModal()` throws
     while that ancestor is `hidden` on Today. Opened the same way
     "who's here sheet" and "plan sheet" are: a game first, then the
     sheet's own trigger. */
  { name: 'card sheet open',
    open: `$('.today-game').click(); $('#shareBtn').click()`, shows: '#sheetCard[open]',
    close: `$('#sheetCard').close(); $('#backBtn').click()` },
  /* #32: the Add-a-game flow, opened from Today through its real trigger.
     A full-screen `<dialog>` in the top layer, so nothing this pass has
     audited before covers its controls -- the ✕, the step count, the two
     fields and the footer pair. Closed with the dialog's own `close()`, the
     same way every sheet above is: the close paths are `add a game: three
     steps`'s job, this pass audits accessibility. */
  { name: 'add a game flow',
    open: `$('#todayAddGame').click()`, shows: '#addGameFlow[open]',
    close: `$('#addGameFlow').close()` },
  { name: 'welcome screen', forced: true,
    open: `$('#view-welcome').hidden = false`, shows: '#view-welcome',
    close: `$('#view-welcome').hidden = true` },
];

/* Only the verdicts that are about the DOM in front of you. The card size and
   the payload budget are properties of the app, not of the state it is in.

   The dialog check is here rather than only in the first pass because the
   first pass has no dialog open: it is exactly the check that has to run once
   per overlay, and running it in every state is what makes it cover the
   dialogs nobody has written yet. */
export const A11Y = new Set([
  'controls have accessible names',
  'images declare alt text',
  'ids unique, aria references resolve',
  'document lang, title, tab order',
  'last control in an open dialog is reachable',
]);

export async function overlayPass(c, source) {
  const problems = [];
  const visited = [];
  let widest = 0;
  for (const s of STATES) {
    try {
      await evalIn(c, step(s.open));
      const up = await evalIn(c, `(() => { const el = document.querySelector(${JSON.stringify(s.shows)});
        return !!el && !el.hidden && el.getClientRects().length > 0; })()`);
      if (!up) { problems.push(`${s.name}: never opened (${s.shows})`); continue; }
      visited.push(s.name);
      for (const chk of (await evalIn(c, source)).checks) {
        if (!A11Y.has(chk.name)) continue;
        if (!chk.pass) problems.push(`${s.name} — ${chk.name}: ${chk.detail}`);
        const n = chk.name === 'controls have accessible names'
          && (chk.detail.match(/(\d+) controls/) || chk.detail.match(/\/(\d+) unnamed/));
        if (n) widest = Math.max(widest, Number(n[1]));
      }
    } catch (e) {
      problems.push(`${s.name}: ${e.message.split('\n')[0]}`);
    } finally {
      await evalIn(c, step(s.close)).catch(e => problems.push(`${s.name}: did not close — ${e.message.split('\n')[0]}`));
    }
  }
  const forced = STATES.filter(s => s.forced).length;
  return {
    name: nameOf('overlay'),
    pass: problems.length === 0,
    detail: problems.length
      ? `${problems.length} problem(s): ${problems.slice(0, 4).join(' | ')}`
      : `${visited.length}/${STATES.length} states (${forced} shown by hand), `
        + `${widest} controls at the widest, all named and resolving`,
  };
}
