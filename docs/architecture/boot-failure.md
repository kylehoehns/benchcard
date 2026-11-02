# A boot that fails says so, and hands the season back

`index.html`'s head carries a small inline script — the only one besides the
theme resolver and the timeline skeleton — that installs `window.onerror` and
`unhandledrejection` before a single module runs, and app.js's final
`renderAll()` sits inside a try/catch that calls it.

**Why inline and not a module.** A throw at the top of `app.js`, or in any
module it imports, happens before a line of app.js's own body executes: a
handler installed from a module cannot see the failure that matters most. A
module also cannot report its own failure to load, and a second file would be a
41st request against a budget deliberately pinned at 41.

**What a coach sees.** `#view-games` is the only view in the markup that is not
`hidden`, so before this a broken boot left a live, empty shell: no message and
no route to the backup. (A first-run device now hides it before paint — see
"The first frame" in [interface.md](interface.md) — which the panel survives,
because it replaces the whole body rather than un-hiding a view.) The guard now replaces the page with a panel that says
Benchcard could not start, offers **Download my backup** and a reload, and says
in plain words that the roster is still on the device. The panel is BUILT IN
THE CATCH and is not in the markup — a hidden panel would spend a third of the
node budget's headroom on a screen almost nobody sees.

**A module that fails to load gets one reload first (#527).** A throw inside a
module reaches the boot try. A module that never arrives does not: the browser
fires `error` on the app.js module `<script>` tag, not on
`window`, so the guard cannot see it. That tag's `onerror` calls
`benchcard.loadFailed()`, which reloads the page once and sets the
sessionStorage flag `benchcard.reloaded`. The app.js tag's `onload` clears the flag
(`benchcard.fetched()`): that event fires only once the whole module graph
arrived, so a failed document never clears it. It is not window `load` or
`booted`, because the app awaits a shared link before it boots and both can
come too early. If the flag is already set, or sessionStorage throws, the
guard goes straight to the panel and sends `app_error` with `where: 'boot'`. A
coach therefore sees at most one reload, and the app never reloads twice. Only
the app.js tag is hooked: `analytics.js` injects a module of its own, and its
failure must not reload a healthy app.

Smoke pre-spends the flag, so the app never navigates by itself inside the
harness; `RELOAD_FLAG` and `SPEND_RELOAD` in `scripts/smoke/page-state.mjs`
say why. The harness's own retry stays the only one.

**The download is `backup.js`'s, not a copy of it.** It dynamically imports
`downloadText` and `backupFilename` at click time, and hands them the raw
`localStorage` bytes — trying the same newest-first key chain the theme script
uses, because a coach whose boot broke mid-migration still has a record under
an older key, and an empty file would be worse than nothing. `backup.js` is
already in the boot graph, so on a normal failure the import resolves from the
module registry and fetches nothing; if the boot died earlier than that, it is
precached.

The reporting half is `app_error` — see Analytics in
[../operations.md](../operations.md) for why that event is the one sanctioned
exception, and why it carries no message and no stack.
