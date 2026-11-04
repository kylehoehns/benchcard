/* #566: the three states the league-rules look check asked for, walked by the
 * clip sweep at 320px/32px (and shot by name with scripts/look.mjs, which reads
 * `CLIP_STATES`). Each `open` proves its screen is up before anything is
 * measured, and each `close` puts back exactly what `open` changed, so the next
 * state starts from the loaded record. Kept beside `clip-sweep.mjs` rather than
 * in it: that file is near the harness size limit (test/smoke-size.test.js).
 *
 *   1. Settings scrolled to League rules, both in-a-row rules on, the minimum
 *      in whole quarters with its live line showing. It also measures the
 *      minimum's unit select with each label a coach can meet, by the width
 *      of the text against the select's box: a native select cuts a long
 *      label with "..." and reports no overflow, so scrollWidth alone cannot
 *      see it.
 *   2. A game's Plan sheet Rules list, both in-a-row rows on, and a roster
 *      with a long name on a rule row.
 *   3. That game's Sits at most detail page, with its "this game only" line.
 */
import { TODAY_HOME } from './dom.mjs';

// the longest label each period word can give the unit select (Settings names them by the game)
const UNIT_LABELS = ['quarters of time', 'whole quarters', 'halves of time', 'whole halves', 'periods of time', 'whole periods'];
const LONG_ROSTER_NAME = 'Alexandria Montgomery-Okafor';

export const LEAGUE_RULES_STATE = {
  name: 'settings, league rules on',
  open: `document.querySelector('#settingsBtn').click();
         const st = await import('/state.js');
         const s = st.state.settings;
         window.__league566 = { minMinutes: s.minMinutes, minUnit: s.minUnit, maxConsecutive: s.maxConsecutive, maxBench: s.maxBench };
         s.minMinutes = 2; s.minUnit = 'full'; s.maxConsecutive = 2; s.maxBench = 2;
         (await import('/render.js')).renderAll();
         await new Promise(r => setTimeout(r, 300));
         const view = document.getElementById('view-settings');
         const live = document.getElementById('minLive');
         if (view.hidden || !/^= 2 whole quarters/.test(live.textContent) || live.hidden) throw new Error('Settings did not show the minimum with its live line: ' + live.textContent);
         if (view.querySelectorAll('#restGrp .pstep-row, #benchGrp .pstep-row').length !== 2) throw new Error('Settings did not show both in-a-row steppers');
         // each unit label, whole, in the select's own box: no ellipsis, no clipping
         const sel = document.getElementById('minUnit');
         const was = [...sel.options].map(o => o.textContent);
         const cs = getComputedStyle(sel);
         const cx = document.createElement('canvas').getContext('2d');
         cx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
         const room = sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
         const cut = ${JSON.stringify(UNIT_LABELS)}.filter(label => {
           sel.options[2].textContent = label;
           return cx.measureText(label).width > room || sel.scrollWidth > sel.clientWidth || cs.textOverflow === 'ellipsis';
         });
         was.forEach((t, i) => { sel.options[i].textContent = t; });
         if (cut.length) throw new Error('the unit select cuts these labels (room ' + Math.round(room) + 'px, text-overflow ' + cs.textOverflow + '): ' + cut.join(', '));
         [...view.querySelectorAll('.pgrp-h')].find(h => h.textContent.trim() === 'League rules').scrollIntoView();`,
  close: `const st = await import('/state.js'), was = window.__league566;
          if (was) Object.assign(st.state.settings, was);
          (await import('/render.js')).renderAll();
          ${TODAY_HOME}`,
};

// the Plan sheet with both in-a-row rules on the open game and a long name on a rule row of its own
const OPEN_RULES = `$('.today-game').click(); $('#phraseStrategy').click();
         const st = await import('/state.js');
         const g = st.game(), c = g.constraints, p = st.byId('p2');
         window.__rules566 = { name: p.name, maxConsecutive: c.maxConsecutive, maxBench: c.maxBench, min: c.minMinutes.p2 };
         p.name = ${JSON.stringify(LONG_ROSTER_NAME)}; c.maxConsecutive = 2; c.maxBench = 2; c.minMinutes.p2 = 12;
         (await import('/render.js')).renderAll();
         await new Promise(r => setTimeout(r, 300));
         const rows = [...document.querySelectorAll('#constraints .prow .prow-t')].map(e => e.textContent);
         for (const want of [/^Each player plays at most 2/, /^Each player sits at most 2/, /Alexandria/]) {
           if (!rows.some(t => want.test(t))) throw new Error('the Rules list has no row matching ' + want + ': ' + rows.join(' | '));
         }`;
const CLOSE_RULES = `const st = await import('/state.js'), was = window.__rules566;
          const c = st.game().constraints;
          st.byId('p2').name = was.name; c.maxConsecutive = was.maxConsecutive; c.maxBench = was.maxBench;
          if (was.min === undefined) delete c.minMinutes.p2; else c.minMinutes.p2 = was.min;
          (await import('/render.js')).renderAll();`;

export const BOTH_RUNS_STATE = {
  name: 'plan sheet, both in-a-row rules, long names',
  open: OPEN_RULES,
  close: `${CLOSE_RULES}
          $('#sheetPlan').close(); $('#backBtn').click()`,
};

export const SITS_DETAIL_STATE = {
  name: 'plan sheet, Sits at most detail',
  open: `${OPEN_RULES}
         [...document.querySelectorAll('#constraints .prow')].find(b => /^Each player sits at most/.test(b.textContent)).click();
         await new Promise(r => setTimeout(r, 300));
         const sub = document.getElementById('planSub');
         if (!sub.textContent.includes("Changes this game only. Your team's rule is in Settings.") || !sub.querySelector('.pstep-row')) {
           throw new Error('the Sits at most page did not open with its stepper and its game-only line: ' + sub.textContent);
         }`,
  close: `${CLOSE_RULES}
          $('#sheetPlan').close(); $('#backBtn').click()`,
};
