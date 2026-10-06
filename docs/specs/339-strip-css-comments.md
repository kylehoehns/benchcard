# #339 — Strip CSS comments at deploy time

## Issue

#339. The first visit waits on `app.css` (81 KB gzipped) before it paints
anything. The survey on the issue found that comments are 77% of that. The
owner chose option A: strip the comments from the CSS that Cloudflare serves,
and keep them in the repo.

## Goal

A coach opening benchcard.app for the first time sees the welcome screen
sooner, with nothing on screen changed. The repo keeps every comment.

## Decisions (owner's comment on #339)

- Only CSS comments come out. JS and HTML are out of scope. The repo keeps
  every comment, and only what Cloudflare serves is stripped.
- The script has no dependencies and has its own unit tests. They cover `/*`
  inside quoted strings and inside `url(...)`. They also check that stripping
  changes nothing except comments and the whitespace around them.
- It runs as the build command in `wrangler.jsonc`, so branch previews get it
  too and the Cloudflare dashboard does not change. It strips a copy made
  inside the build, never the repo.
- `scripts/serve.mjs` strips on the fly, so smoke runs against what ships.
- "No build step" becomes "one build step: CSS comments are stripped on
  deploy". AGENTS.md is the one place that says so. The other places that
  say "no build step" either agree with it or point to it.

From the coordinator: the build copies `app/` to a git-ignored `dist/`, and
`assets.directory` points at `dist/`. That way a `wrangler deploy` run on a
laptop cannot rewrite `app/`. Checked with wrangler 4.147.0 `--dry-run`:
`deploy` and `versions upload` both run `build.command` before they read the
assets directory, and they work when `dist/` does not exist yet.

## What would settle it

1. **The stripper.** `stripCssComments(src)` passes `node --test` cases for:
   - a comment on its own line, which removes the whole line;
   - a comment after a declaration on the same line;
   - a comment between two tokens. Where the comment touches no whitespace
     and both neighbors are name characters, it leaves `/**/` so the two
     names do not merge into one;
   - `/*` and `*/` inside `"..."` and `'...'`, including escaped quotes, which
     are kept;
   - `/*` inside an unquoted `url(...)`, which is kept, and a quoted one;
   - an unterminated comment, which runs to the end of the file;
   - a file with no comments, which comes back byte-identical.
2. **Nothing else changes.** For each of `app/tokens.css`, `app/app.css` and
   `app/card.css`, the output has no `/*` left. With all whitespace removed,
   it equals the source with every comment cut out by the plain regex
   `/\/\*[\s\S]*?\*\//g`. That regex is a fair reference only because none
   of these files has `/*` inside a string or `url(...)`, so the test checks
   that first.
3. **The build.** `build(appDir, outDir)` gives an `outDir` with exactly the
   same file list as `appDir`. Every non-`.css` file is byte-identical. Every
   `.css` file equals `stripCssComments` of its source. `app/` is not
   modified. A stale `outDir` is replaced, not merged into.
4. **wrangler.jsonc.** `build.command` runs the build, and `assets.directory`
   is `dist`. `dist/` is in `.gitignore`.
5. **The local server.** `serve()` returns each `.css` file stripped and with
   `content-type: text/css`. Every other file is returned unchanged.
6. **The numbers.** Lighthouse 12, mobile, devtools throttling, gzip server,
   median of 3: `app/` against `dist/`. Report the score, FCP, LCP and the
   render-blocking bytes. The survey's prototype measured 1846 ms → 1409 ms.
7. **The preview.** `curl` of the branch preview's `/app.css` contains no
   `/*`, and its byte count equals `stripCssComments(app/app.css)`. A look
   check of welcome, Today, a game, the plan sheet and settings at 320 and
   390px, 16 and 32px text, light and dark, shows no difference from main.
   Offline reload still works.
8. `npm test` and `npm run smoke` pass, and `test/no-dependencies.test.js`
   passes.

## Surfaces

Change:

- `scripts/build.mjs` (new): `stripCssComments`, `build`, and a CLI that
  writes `dist/`.
- `scripts/serve.mjs`: strips `.css` responses through the same function.
- `wrangler.jsonc`: `build.command`, `assets.directory`, and the header
  comment.
- `.gitignore`: `dist/`.
- `test/build.test.js` (new): items 1–5.
- The "no build step" wording, reworded to agree with AGENTS.md or point to
  it: AGENTS.md, README, `wrangler.jsonc`, `app/_headers`,
  `docs/operations.md`, `.claude/agents/developer.md`, `app/vendor/README.md`,
  and the header comments in `test/dead-class.test.js`,
  `test/dead-id.test.js`, `test/dead-export.test.js`,
  `test/faq-jsonld.test.js` and `test/hover-guard.test.js`.

Must not change: any CSS, JS or HTML under `app/`, so no precache bump. The
one exception is the comment in `app/_headers`, which is not precached. Also
unchanged: `src/index.js` and the Cloudflare dashboard fields.

## Constraints

- No dependencies. `test/no-dependencies.test.js` must keep passing.
- One answer in one place. Both the build and `serve.mjs` import the same
  `stripCssComments`.
- The `SHELL` digest stays a digest of the source files. Stripping is
  deterministic, so the same source always gives the same served bytes.
- Allowlist deploy shape (AGENTS.md § Layout): what gets deployed is a copy
  of `app/`, with no other files added and none removed.

## Proof

- `node --test test/build.test.js`: items 1–5. The stripper has many input
  cases, which is the pure-function seam.
- The full smoke run is item 8. Because smoke now serves stripped CSS, it is
  also a check of the stripped bytes in a browser.
- `/browser-verify` and `scripts/look.mjs` against the preview: item 7.
- Lighthouse runs: item 6.

There is no Coach scenario, because nothing a coach taps or reads changes.

## Out of scope

Stripping or minifying JS and HTML. Splitting `app.css`. Changing the
dashboard build command. The "no build step" wording in `app/about.html` and
`app/dom.js`: both are about markup and scripts, which still have no build
step, and changing them would bump the precache for a comment.
