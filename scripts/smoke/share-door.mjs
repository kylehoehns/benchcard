/* #257's own guard (docs/specs/257-hand-off-door.md, Proof section): the
   share sheet opens on Print card, a segment beside it swaps the body to
   Hand off in the same dialog, and a game with no card says so on both
   sides. Measured at 390x844 on the rich fixture. The code drawn and the
   link it carries are #250's rows (`hand-off.mjs`), re-pointed at this door. */
import { evalIn, TODAY_HOME, wait } from './dom.mjs';
import { land } from './page-state.mjs';
import { goRich } from './fixtures.mjs';
import { evalJSON, tap, settle, setGame } from './sheet-drive.mjs';

const PRINT_BODY = ['sheetCardPreview', 'print', 'shareCard', 'printScope', 'copies', 'cardSize', 'cardId', 'showMinutes'];
const HANDOFF_BODY = ['handoffQr', 'handoffShare', 'handoffNote', 'handoffNames'];

const READ = `(() => {
  const dlg = document.getElementById('sheetCard');
  const vis = id => { const r = document.getElementById(id)?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; };
  const first = dlg.querySelector('.bsheet-body').querySelector('button, select, input, a');
  const seg = [...dlg.querySelectorAll('#shareSeg button')].map(b => [b.textContent.trim(), b.getAttribute('aria-pressed')]);
  return JSON.stringify({
    open: dlg.open,
    dialogsOpen: document.querySelectorAll('dialog[open]').length,
    title: document.getElementById('sheetCardTitle')?.textContent,
    firstIsSeg: !!first && first.closest('#shareSeg') !== null,
    seg,
    print: ${JSON.stringify(PRINT_BODY)}.filter(vis),
    handoff: ${JSON.stringify(HANDOFF_BODY)}.filter(vis),
    gone: ['handoffBtn', 'sheetHandoff', 'sheetHandoffClose'].filter(id => document.getElementById(id)),
  });
})()`;

const PICK = pane => `document.querySelector('#shareSeg [data-pane=${pane}]').click()`;

async function qrDrawn(c) {
  for (let i = 0; i < 100; i++) {
    if (await evalIn(c, `!!document.querySelector('#handoffQr svg path')`)) return true;
    await wait(50);
  }
  return false;
}

async function openShare(c) {
  await tap(c, `${TODAY_HOME}; document.querySelector('.today-game').click()`);
  await tap(c, `document.getElementById('shareBtn').click()`);
}

// H. The pages, read as a coach reads them: rendered innerText, with every
// fold opened first (a closed <details> renders none of its body).
const PAGE_TEXT = `(() => {
  document.querySelectorAll('details').forEach(d => { d.open = true; });
  return JSON.stringify({
    text: document.body.innerText.replace(/\\s+/g, ' '),
    qa: [...document.querySelectorAll('details.qa')].map(d => ({ q: d.querySelector('summary')?.innerText ?? '',
      text: d.innerText.replace(/\\s+/g, ' '), links: [...d.querySelectorAll('a')].map(a => a.getAttribute('href')) })),
    sec: document.getElementById('handoff')?.closest('section')?.innerText.replace(/\\s+/g, ' ') ?? '',
    h2: [...document.querySelectorAll('h2')].map(h => [h.id, h.innerText]),
  });
})()`;
const NEVER_LEAVES = 'Your roster never leaves your device.';

async function pagesProblems(c, origin, ck) {
  await land(c, origin, { page: '/about.html', record: 'kept', ready: 'document.body' });
  const about = await evalJSON(c, PAGE_TEXT);
  const qa = about.qa.find(q => /assistant/i.test(q.q) && /phone/i.test(q.q + q.text));
  ck(qa, 'about.html has no Questions entry about an assistant running subs from their phone');
  ck(qa?.links.some(h => /advanced(\.html)?#handoff$/.test(h)), `the about entry links ${JSON.stringify(qa?.links)}, want advanced#handoff`);
  ck(about.text.includes(NEVER_LEAVES), 'about.html lost "Your roster never leaves your device."');
  ck(/hand-?off link carries one game['\u2019]s card names/i.test(about.text) && /no Benchcard server sees it/i.test(about.text),
    'about.html privacy note does not say a hand-off link carries one game\'s card names and no Benchcard server sees it');
  await land(c, origin, { page: '/advanced.html', record: 'kept', ready: 'document.body' });
  const adv = await evalJSON(c, PAGE_TEXT);
  ck(adv.h2.some(([id, t]) => id === 'handoff' && t === 'Handing a game to an assistant'), `advanced.html headings: ${JSON.stringify(adv.h2.map(h => h[1]))}, want "Handing a game to an assistant" as #handoff`);
  const sec = adv.sec;
  ck(/one game/i.test(sec) && /card names/i.test(sec) && /where the game stands|where it stands/i.test(sec), 'the advanced section does not cover what travels: one game, card names, where the game stands');
  ck(/not linked|aren.t linked|stay linked|no longer linked/i.test(sec), 'the advanced section does not say the two phones are not linked afterward');
  ck(/Share/.test(sec) && /Hand off/.test(sec), 'the advanced section does not say where the door is (Share, then Hand off)');
  ck(adv.text.includes(NEVER_LEAVES), 'advanced.html lost "Your roster never leaves your device."');
  ck(/hand-?off link carries one game['\u2019]s card names/i.test(adv.text) && /no Benchcard server sees it/i.test(adv.text),
    'advanced.html privacy note does not say a hand-off link carries one game\'s card names and no Benchcard server sees it');
}

export async function shareDoorPass(c, origin) {
  const problems = [];
  const ck = (ok, msg) => { if (!ok) problems.push(msg); return ok; };
  try {
    await goRich(c, origin);
    await openShare(c);

    // A. Default
    const a = await evalJSON(c, READ);
    ck(a.open, 'the share sheet did not open');
    ck(a.title === 'Share', `the sheet heading reads "${a.title}", want "Share"`);
    ck(a.firstIsSeg, 'the first control in the sheet body is not the Print card | Hand off segment');
    ck(JSON.stringify(a.seg) === JSON.stringify([['Print card', 'true'], ['Hand off', 'false']]),
      `the segment reads ${JSON.stringify(a.seg)}, want Print card pressed and Hand off not`);
    ck(a.print.length === PRINT_BODY.length, `on Print card these are not visible: ${PRINT_BODY.filter(i => !a.print.includes(i))}`);
    ck(a.handoff.length === 0, `on Print card the hand-off controls ${a.handoff} are visible`);
    ck(a.gone.length === 0, `${a.gone} still exist; the hand-off door is the segment now`);

    // B. Hand off, inline
    await tap(c, PICK('handoff'));
    ck(await qrDrawn(c), 'Hand off: the code was never drawn in the sheet');
    const b = await evalJSON(c, READ);
    ck(b.dialogsOpen === 1 && b.open, `Hand off: ${b.dialogsOpen} dialogs are open, want the share sheet alone`);
    ck(b.handoff.length === HANDOFF_BODY.length, `Hand off: these are not visible: ${HANDOFF_BODY.filter(i => !b.handoff.includes(i))}`);
    ck(b.print.length === 0, `Hand off: the print controls ${b.print} are still visible`);
    ck(JSON.stringify(b.seg) === JSON.stringify([['Print card', 'false'], ['Hand off', 'true']]), `Hand off: the segment reads ${JSON.stringify(b.seg)}`);
    const note = await evalJSON(c, `JSON.stringify({ share: !document.getElementById('handoffShare').disabled,
      note: document.getElementById('handoffNote').textContent, names: document.querySelectorAll('#handoffNames li').length })`);
    ck(note.share, 'Hand off: Share link is disabled');
    ck(note.note === 'Anyone you send this to can open it.', `Hand off: the note reads "${note.note}"`);
    ck(note.names === 11, `Hand off: the sheet lists ${note.names} names, want the roster's 11`);

    // C. Back to Print
    await tap(c, PICK('print'));
    const cc = await evalJSON(c, READ);
    ck(cc.print.length === PRINT_BODY.length, `Print card again: these are not visible: ${PRINT_BODY.filter(i => !cc.print.includes(i))}`);
    ck(cc.handoff.length === 0, `Print card again: the hand-off controls ${cc.handoff} are still visible`);
    ck(JSON.stringify(cc.seg) === JSON.stringify([['Print card', 'true'], ['Hand off', 'false']]), `Print card again: the segment reads ${JSON.stringify(cc.seg)}`);
    const fit = await evalIn(c, `getComputedStyle(document.getElementById('sheetCardPreview')).getPropertyValue('--cardzoom')`);
    ck(fit.trim() !== '' && Number(fit) > 0 && Number(fit) <= 1, `Print card again: the preview's fit is "${fit}", want a zoom in (0, 1]`);

    // Leaving mid-encode must not leave a drawn code behind.
    await evalIn(c, `${PICK('handoff')}; ${PICK('print')}`);
    await wait(1500);
    ck(!(await evalIn(c, `!!document.querySelector('#handoffQr svg')`)), 'a code was drawn after Print card was picked mid-encode');

    // D. Reset on open
    await tap(c, PICK('handoff'));
    await tap(c, `document.getElementById('sheetCardClose').click()`);
    await tap(c, `document.getElementById('shareBtn').click()`);
    const d = await evalJSON(c, READ);
    ck(JSON.stringify(d.seg) === JSON.stringify([['Print card', 'true'], ['Hand off', 'false']]), `reopened: the segment reads ${JSON.stringify(d.seg)}, want Print card pressed`);
    ck(d.print.length === PRINT_BODY.length && d.handoff.length === 0, 'reopened: the print body is not the one showing');

    // G. Names
    const name = await evalIn(c, `document.getElementById('shareBtn').getAttribute('aria-label')`);
    ck(name === 'Share or hand off', `#shareBtn is named "${name}", want "Share or hand off"`);

    // F. No card: today's behavior on both segments.
    await evalIn(c, `document.getElementById('sheetCard').close()`);
    await evalIn(c, setGame(`const g = s.game();
      for (const id of s.state.players.slice(4).map(p => p.id)) s.setAvailable(g, id, false);`));
    await settle(c);
    await tap(c, `document.getElementById('shareBtn').click()`);
    const f1 = await evalJSON(c, `JSON.stringify({ print: document.getElementById('print').disabled, image: document.getElementById('shareCard').disabled })`);
    ck(f1.print && f1.image, `no card: Print disabled is ${f1.print}, Share image disabled is ${f1.image}, want both disabled`);
    await tap(c, PICK('handoff'));
    await settle(c);
    const f2 = await evalJSON(c, `JSON.stringify({ status: document.getElementById('handoffStatus').textContent, share: document.getElementById('handoffShare').disabled })`);
    ck(f2.status === 'There is no card to hand off yet. Fix the plan first.', `no card: Hand off says "${f2.status}"`);
    ck(f2.share, 'no card: Share link is enabled');

    // H. The pages
    await evalIn(c, `document.getElementById('sheetCard').close()`);
    await pagesProblems(c, origin, ck);
  } finally {
    await evalIn(c, `document.getElementById('sheetCard')?.close()`).catch(() => {});
    await goRich(c, origin);
  }
  return { pass: problems.length === 0, detail: problems.length ? problems.slice(0, 4).join(' | ') : 'ok' };
}
