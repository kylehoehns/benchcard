import { capInstall, capUse, capRead, capRestore, expectedPngSize } from './capture.mjs';
import { HEIGHT } from './dom.mjs';
import { tap, evalJSON } from './sheet-drive.mjs';

/* #263 A-D (docs/specs/263-share-backup-tests.md): every way `#shareCard` can
   end, forced one at a time with the recorder in capture.mjs, on the card
   sheet `timelineCardSheetPass` already has open on the rich fixture. Each
   branch reads what came out -- the PNG's size from its own bytes, the toast a
   coach sees -- and the stubs are put back before the row moves on. */

const SAVED = 'Card saved as a PNG.';
const COPIED = 'Card copied. Paste it into a message.';
const COULD_NOT_SHARE = 'Could not share the image. Print still works.';
const COULD_NOT_MAKE = 'Could not make the image. Print still works.';

const press = (c, opts) => capUse(c, opts).then(() => tap(c, `document.getElementById('shareCard').click()`));
const setSize = (c, size) => tap(c, `const s = document.getElementById('cardSize');
  s.value = '${size}'; s.dispatchEvent(new Event('change', { bubbles: true }))`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function shareImageBranches(c, ck) {
  await capInstall(c);
  try {
    // Wait for the toast a branch raised and for a stubbed promise to settle.
    const out = async () => { await tap(c, ''); return capRead(c); };

    /* ---- A. saved: no share, no clipboard ---- */
    await press(c, {});
    let r = await out();
    // the toast is raised inside the open sheet (the page behind it is inert),
    // so it has to be on screen there, not just in the DOM
    const shown = await evalJSON(c, `(() => { const b = document.querySelector('dialog[open] .toast')?.getBoundingClientRect();
      return JSON.stringify(b ? { top: b.top, bottom: b.bottom, w: b.width } : null); })()`);
    ck(shown && shown.w > 0 && shown.top >= 0 && shown.bottom <= HEIGHT,
      `the saved-image toast is ${JSON.stringify(shown)} in the open card sheet, want it inside the ${HEIGHT}px viewport`);
    ck(r.clicks.length === 1, `saving the card image clicked ${r.clicks.length} <a download>, want 1`);
    const png = r.clicks[0] || {};
    ck(/^benchcard-[a-z0-9-]+\.png$/.test(png.download), `the saved image is named "${png.download}", want benchcard-<slug>.png`);
    ck(png.type === 'image/png' && png.png, `the saved Blob is ${png.type}, PNG signature ${png.png}, want image/png with the signature`);
    const want = await expectedPngSize(c);
    ck(want.cards === 1 && want.w === 1078 && want.h === 1572,
      `one pocket card should paint ${want.cards} card(s) at 1078×1572; the cards' rects give ${want.w}×${want.h}`);
    ck(png.w === want.w && png.h === want.h, `the saved PNG is ${png.w}×${png.h}, want ${want.w}×${want.h}`);
    // #277: the band under the card carries the card mark -- its #D2500A ground
    // is the only orange down there. A 12px mark at 3x is 36px square; #284's card
    // covers about half of it, leaving ~466 device px of ground. The floor is well
    // under that, and a band with no mark has none.
    ck(png.bandOrange >= 300, `the band under the card holds ${png.bandOrange} #D2500A pixels, want at least 300 (the card mark's ground)`);
    ck(same(r.toasts, [SAVED]), `saving the image toasted ${JSON.stringify(r.toasts)}, want ["${SAVED}"]`);
    ck(r.hosts === 0, `${r.hosts} offscreen host(s) left in the DOM after painting, want 0`);

    /* ---- the size rule in every case: Half sheet lays out its own width ---- */
    await setSize(c, 'half');
    await press(c, {});
    r = await out();
    const half = await expectedPngSize(c);
    ck(r.clicks[0]?.w === half.w && r.clicks[0]?.h === half.h,
      `the Half sheet PNG is ${r.clicks[0]?.w}×${r.clicks[0]?.h}, want ${half.w}×${half.h} from the cards' rects`);
    await setSize(c, 'pocket');

    /* ---- B. copied, and a rejected copy falls through to the save ---- */
    await press(c, { clip: 'resolve' });
    r = await out();
    ck(same(r.clips, [[{ ctor: 'ClipboardItem', types: ['image/png'] }]]),
      `the clipboard got ${JSON.stringify(r.clips)}, want one ClipboardItem of image/png`);
    ck(same(r.toasts, [COPIED]) && r.clicks.length === 0,
      `a copy toasted ${JSON.stringify(r.toasts)} with ${r.clicks.length} download(s), want ["${COPIED}"] and none`);
    await press(c, { clip: 'reject' });
    r = await out();
    ck(r.clicks.length === 1 && r.clicks[0].png && same(r.toasts, [SAVED]),
      `a refused copy toasted ${JSON.stringify(r.toasts)} with ${r.clicks.length} download(s), want the save: ["${SAVED}"] and 1`);

    /* ---- C. shared, cancelled, failed ---- */
    await press(c, { canShare: true, share: 'resolve' });
    r = await out();
    ck(r.shares.length === 1 && same(r.shares[0].files.map(f => [f.type, /^benchcard-.*\.png$/.test(f.name)]), [['image/png', true]])
      && r.shares[0].title === 'Rotation vs Hawks',
      `share got ${JSON.stringify(r.shares)}, want one image/png File and the title "Rotation vs Hawks"`);
    ck(r.toasts.length === 0 && r.clicks.length === 0, `a finished share toasted ${JSON.stringify(r.toasts)}, want no toast and no download`);
    await press(c, { canShare: true, share: 'abort' });
    r = await out();
    ck(r.shares.length === 1 && r.toasts.length === 0 && r.clicks.length === 0,
      `a dismissed share sheet toasted ${JSON.stringify(r.toasts)}, want no toast`);
    await press(c, { canShare: true, share: 'error' });
    r = await out();
    ck(same(r.toasts, [COULD_NOT_SHARE]) && r.clicks.length === 0,
      `a failed share toasted ${JSON.stringify(r.toasts)}, want ["${COULD_NOT_SHARE}"]`);

    /* ---- D. the paint fails: nothing is shared, copied or saved ---- */
    await press(c, { canShare: true, share: 'resolve', clip: 'resolve', noContext: true });
    r = await out();
    ck(same(r.toasts, [COULD_NOT_MAKE]) && !r.shares.length && !r.clips.length && !r.clicks.length,
      `a failed paint toasted ${JSON.stringify(r.toasts)} and shared ${r.shares.length}, copied ${r.clips.length}, saved ${r.clicks.length}; want the one toast and nothing out`);
    ck(r.hosts === 0, `${r.hosts} offscreen host(s) left after a failed paint, want 0`);
  } finally {
    await capRestore(c);
  }
  // the real navigator doors are back: the page's own `share` is not our stub
  const back = await evalJSON(c, `JSON.stringify({ own: ['canShare', 'share', 'clipboard'].filter(k => Object.hasOwn(navigator, k)) })`);
  ck(back.own.length === 0, `stubs left on navigator after the share checks: ${back.own}`);
}
