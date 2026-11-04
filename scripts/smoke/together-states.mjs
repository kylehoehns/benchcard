/* #568: the states the Add a rule look check asked for, walked by the clip
 * sweep at 320px/32px (and shot by name with scripts/look.mjs, which reads
 * `CLIP_STATES`). Two kids carry a long name in each, so a picker row, a rule
 * row and a sentence all have to wrap. Each `open` proves its screen is up
 * before anything is measured, and each `close` puts back exactly what `open`
 * changed. Kept beside `clip-sweep.mjs` rather than in it: that file is near
 * the harness size limit (test/smoke-size.test.js).
 *
 *   1. Add a rule with each of the seven kinds picked: its heading, its chip
 *      and its one line. Together also has both kids picked and Always chosen,
 *      so the strength rows are up.
 *   2. The Rules list with an Always Together rule between two long names.
 *   3. That rule's own page, with Always checked.
 */
const LONG = ['Alexandria Montgomery-Okafor', 'Bartholomew Castellanos-Reyes'];

// the label of each kind, as Add a rule paints it (app/rules.js KINDS)
const KIND_LABELS = ['Plays at least', 'Plays at most', 'Together', 'Apart', 'One of two on', 'Starting five', 'Starts the last period'];

const NAME_LONG = `const st = await import('/state.js');
    window.__names568 = [st.byId('p1').name, st.byId('p2').name];
    st.byId('p1').name = ${JSON.stringify(LONG[0])}; st.byId('p2').name = ${JSON.stringify(LONG[1])};
    (await import('/render.js')).renderAll();`;
const NAME_BACK = `const st = await import('/state.js'), was = window.__names568;
    st.byId('p1').name = was[0]; st.byId('p2').name = was[1];
    st.game().constraints.pairs = [];
    (await import('/render.js')).renderAll();`;
const wait = `await new Promise(r => setTimeout(r, 300));`;
const tapText = (sel, text) => `{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => x.textContent.trim() === ${JSON.stringify(text)});
    if (!b) throw new Error('no ' + ${JSON.stringify(sel)} + ' reads ' + ${JSON.stringify(text)});
    b.click(); ${wait} }`;
const tapName = name => `{ const b = document.querySelector('#planSub button.plr[aria-label=' + JSON.stringify(${JSON.stringify(name)}) + ']');
    if (!b) throw new Error('no picker button names ' + ${JSON.stringify(name)});
    b.click(); ${wait} }`;

export const ADD_RULE_KIND_STATES = KIND_LABELS.map(label => ({
  name: `plan sheet, add a rule, ${label}, long names`,
  open: `${NAME_LONG}
         $('.today-game').click(); $('#phraseRules').click(); $('#constraints .add-rule').click(); ${wait}
         ${tapText('#planKinds .chip', label)}
         ${label === 'Together' ? `${tapName(LONG[0])} ${tapName(LONG[1])} ${tapText('#planSub .pgrp .prow', 'Always')}` : ''}
         const chip = [...document.querySelectorAll('#planKinds .chip')].find(x => x.textContent.trim() === ${JSON.stringify(label)});
         if (chip?.getAttribute('aria-pressed') !== 'true') throw new Error(${JSON.stringify(label)} + ' is not the picked kind');
         const line = document.querySelector('#planKindBody > .plan-kind-line');
         if (!line || !line.textContent.trim()) throw new Error('Add a rule shows no line for ' + ${JSON.stringify(label)});
         ${label === 'Together' ? `if (document.querySelector('#planSub .pgrp .prow[aria-pressed="true"]')?.getAttribute('aria-label') !== 'Always') throw new Error('Always is not the chosen strength');` : ''}`,
  close: `${NAME_BACK}
          $('#sheetPlan').close(); $('#backBtn').click()`,
}));

const OPEN_ALWAYS = `${NAME_LONG}
    st.game().constraints.pairs = [['p1', 'p2', true]];
    (await import('/render.js')).renderAll();
    $('.today-game').click(); $('#phraseRules').click(); ${wait}
    const row = [...document.querySelectorAll('#constraints .prow')].find(b => / always together/.test(b.textContent));
    if (!row || !row.textContent.includes('Alexandria')) throw new Error('the Rules list has no Always row with the long name: ' + [...document.querySelectorAll('#constraints .prow')].map(b => b.textContent).join(' | '));`;

export const ALWAYS_LIST_STATE = {
  name: 'plan sheet, an Always rule, long names',
  open: OPEN_ALWAYS,
  close: `${NAME_BACK}
          $('#sheetPlan').close(); $('#backBtn').click()`,
};

export const ALWAYS_DETAIL_STATE = {
  name: 'plan sheet, Always rule detail, long names',
  open: `${OPEN_ALWAYS}
         row.click(); ${wait}
         const on = [...document.querySelectorAll('#planSub .pgrp .prow[aria-pressed="true"]')].map(b => b.getAttribute('aria-label'));
         if (!on.includes('Always')) throw new Error('the rule page does not show Always chosen: ' + on.join(' | '));`,
  close: `${NAME_BACK}
          $('#sheetPlan').close(); $('#backBtn').click()`,
};

export const TOGETHER_STATES = [...ADD_RULE_KIND_STATES, ALWAYS_LIST_STATE, ALWAYS_DETAIL_STATE];
