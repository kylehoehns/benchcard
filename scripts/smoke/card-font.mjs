import { evalIn } from './dom.mjs';

/* #21 item 8: the UI no longer uses Inter, so nothing else on the page starts
   loading InterVar, and the coach's card must never stay sized for the
   fallback face app.js waited past. `app.js` loads `CARD_FONT` explicitly and
   re-fits once that settles (`AGENTS.md` § Traps names the general shape of
   this trap).

   THE CHECK: read `.five`'s on-screen font-size, then call the page's own
   `renderCards()` again -- dynamic-imported from `${origin}/card.js` (an
   absolute specifier, because a relative one would resolve against this
   Runtime.evaluate call's own base rather than the page and 404) so it is the
   SAME module instance operating on the SAME live state, not a
   reimplementation of the fit. By settle time `document.fonts.check(...)` is
   true either way (`.card`'s own CSS names InterVar, which starts the fetch
   with or without app.js's explicit call), so that alone proves nothing; the
   SIZE is the tell. If the size on screen already matches what a fresh fit
   produces now that the font is loaded, nothing was ever wrong; if it does
   not, the rendered card is still sized for a font it did not measure.

   WHAT THIS CATCHES, VERIFIED: deleting the whole `document.fonts...then(()
   => render('cards'))` block (so nothing ever re-fits) turns this row red --
   `.five` stays at its boot-time size while a fresh fit reports a different
   one. `node scripts/smoke.mjs --only "card font loads before the card is
   fitted"` printed FAIL with both numbers named; restoring the block turned
   it back to PASS.

   WHAT THIS DOES NOT CATCH, ALSO VERIFIED: swapping the explicit
   `document.fonts.load(...)` for a bare `document.fonts.ready` -- the exact
   wording of item 8's own mutation list -- stays GREEN here, including under
   `Network.emulateNetworkConditions` latency and `Network.setCacheDisabled`
   during a fresh reload. The reason: `card.js`'s own canvas `measureText`
   call, which runs synchronously during the very first `renderCards()` at
   boot (before either promise is even read), already asks Chromium to load
   InterVar -- canvas text measurement triggers font loading same as CSS does.
   By the time app.js's own `document.fonts.ready` is evaluated, that load is
   already pending, so `.ready` wants the same thing `.load(CARD_FONT)` wants
   and resolves at the same real moment. Chromium is the only engine this
   harness can drive (`/browser-verify` says so), and the CSS Font Loading
   spec leaves exactly how eagerly a font starts loading up to the engine, so
   this may be a real, narrower race in Safari/WebKit that this check cannot
   see. Reported rather than hidden behind a check that would only ever be
   green. */
export async function cardFontPass(c, origin) {
  const probe = await evalIn(c, `(async () => {
    const five = document.querySelector('.card .five');
    if (!five) return JSON.stringify({ error: 'no .card .five in the DOM' });
    const before = getComputedStyle(five).fontSize;
    const loaded = document.fonts.check('800 16px InterVar');
    const mod = await import(${JSON.stringify(origin)} + '/card.js');
    mod.renderCards();
    const again = document.querySelector('.card .five');
    const after = again ? getComputedStyle(again).fontSize : null;
    return JSON.stringify({ loaded, before, after });
  })()`);
  const r = JSON.parse(probe);
  const problems = [];
  if (r.error) problems.push(r.error);
  else {
    if (!r.loaded) problems.push('document.fonts.check(\'800 16px InterVar\') is false after settle');
    if (r.after === null) problems.push('no .card .five left in the DOM after re-rendering');
    else if (r.before !== r.after) {
      problems.push(`.five was fitted at ${r.before} but the loaded font fits it at ${r.after} — `
        + 'the card was sized before InterVar arrived and never re-fit');
    }
  }
  return {
    pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : `InterVar loaded, .five stays at ${r.before} once it has`,
  };
}
