# #360 — The build writes the service worker's SHELL digest

## Issue

#360. `app/sw.js` carries two hand-kept values, `VERSION` and `SHELL`, and
four scripts plus a git merge driver exist only to keep them right; let the
build write `SHELL` instead.

## Goal

Editing a precached file and committing needs no edit to `app/sw.js`, no
`npm run sw:bump`, and no merge-driver setup. Two PRs in flight no longer
conflict on `sw.js`. A coach still gets the new shell after a deploy, because
the deployed worker's cache name still changes whenever a precached byte that
ships changes.

## Decisions

From the Decided comment on #360 (made with the owner):

1. **`SHELL` is computed from the bytes the build writes to `dist/`**, since
   that is what ships. `npm run serve` computes it the same way, so a local
   run matches a deploy.
2. **`VERSION` is dropped.** The cache name is `benchcard-${SHELL}`.
3. **`PRECACHE` stays hand-written.** `test/sw.test.js` already checks it
   against `index.html` and the import graph.

Made in this spec, closest to the issue's intent (the issue does not decide
them):

- **The digest covers the files `PRECACHE` names, as they sit in `dist/`.**
  Same algorithm as today (paths sorted, each `path \0 bytes \0`, `./` and
  `./sw.js` skipped, first 12 hex of sha256), only reading `dist/` instead of
  `app/`. A file that is not precached is not cached, so changing it has no
  cache to bust. A consequence worth knowing: a CSS edit that only touches a
  comment no longer changes `SHELL`, because the shipped bytes are the same.
- **`app/sw.js` keeps the line `const SHELL = 'unbuilt';`** as the slot the
  build fills. The build fails loudly if the line is missing or already
  filled, so a deploy can never ship the placeholder silently.
- **`scripts/check-sw-version.mjs` is deleted too**, with its test and its CI
  step. Its only job was "a precached file changed but `VERSION` did not",
  and `VERSION` no longer exists. The `checks that need history` job keeps its
  two other steps.
- **`scripts/sw-shell.mjs` is deleted.** `parsePrecache` and the digest move
  into `scripts/build.mjs`, the one module both the build and `serve.mjs`
  already import. `setConstants`, `parseShell` and `isValidVersion` go: nothing
  is left to rewrite in the source.
- **`scripts/setup.mjs` and `npm run setup` are deleted.** They only
  registered the merge driver. `.gitattributes` held only the driver line, so
  it is deleted.
- **The two hook lines about the shell go.** `after-edit.sh` stops reminding
  about `sw:bump` on a precached edit (there is nothing to do), and
  `session-start.sh` stops printing `VERSION`/`SHELL` (there is no `VERSION`,
  and `SHELL` in source is always `unbuilt`).
- **`serve.mjs` computes the digest on each request for `/sw.js`.** It reads
  the live files, so an edit shows up on the next fetch with no restart. It is
  one request per page load at most, so caching it buys nothing.

## What would settle it

1. **No `sw.js` edit for a precached change.** `app/sw.js` holds no `VERSION`
   constant and no 12-hex digest; its `SHELL` line is
   `const SHELL = 'unbuilt';`. Nothing in `npm test` compares a digest
   against the source tree, so editing `app/app.js` and running `npm test`
   passes with `app/sw.js` untouched.
2. **A build test proves `dist/sw.js` holds the digest of what `dist/`
   contains.** After `build(app, out)`: `out/sw.js` has
   `const SHELL = '<12 hex>'` and `const CACHE = \`benchcard-${SHELL}\``, and
   the 12 hex equal a sha256 the test computes itself over the precached
   files read from `out/` (not from `app/`). The rest of `out/sw.js` is
   byte-identical to `app/sw.js`.
3. **The digest moves when, and only when, shipped precached bytes move.** On
   a temp copy of `app/`: changing a byte of a precached `.js` file changes
   `SHELL`; changing only a comment inside `app.css` leaves it the same;
   changing a file not in `PRECACHE` (e.g. `robots.txt`) leaves it the same;
   building the same tree twice gives the same `SHELL`.
4. **The build refuses a source with no slot.** `build()` throws, naming
   `SHELL`, when `sw.js` has no `const SHELL = 'unbuilt'` line.
5. **Local matches deploy.** `serve()`'s `/sw.js` body is byte-identical to
   `dist/sw.js` built from the same tree.
6. **The machinery is gone.** `scripts/sw-bump.mjs`, `scripts/sw-merge.mjs`,
   `scripts/sw-shell.mjs`, `scripts/check-sw-version.mjs`, `scripts/setup.mjs`,
   `.gitattributes`, `test/sw-bump.test.js` and
   `test/check-sw-version.test.js` do not exist; `package.json` has no
   `sw:bump` or `setup` script and `check:history` no longer runs
   `check-sw-version.mjs`; `test.yml` has no `check-sw-version` step.
   `git grep -nE "sw:bump|sw-bump|sw-merge|sw-shell|check-sw-version|merge driver|npm run setup"`
   outside `docs/specs/` and `notes/` prints nothing.
7. **The harness says the new rule once.** `AGENTS.md` § Deploy is the one
   place that says the build strips CSS comments **and** writes `SHELL`; the
   § Traps bump paragraphs and the enforcement-table row for the precache
   reminder are gone, and the table's rule count matches its rows.
   `test/hooks.test.js` and `test/one-answer.test.js` pass against the new
   text.
8. **A deploy still busts the old cache** (checked on the Workers preview):
   the preview's `/sw.js` has `SHELL` equal to the digest of a local
   `npm run build` of the same commit, and its cache name differs from
   production's current one. A second preview built from a commit that changes
   one precached byte serves a different cache name.

## Surfaces

Change:

- `scripts/build.mjs` — digest + stamp `dist/sw.js`; exports `parsePrecache`,
  the digest and the stamp so `serve.mjs` and tests share them.
- `scripts/serve.mjs` — `/sw.js` served stamped, from the same bytes it
  serves.
- `app/sw.js` — drop `VERSION`; `SHELL = 'unbuilt'`; `CACHE =
  \`benchcard-${SHELL}\``; comments that mention `VERSION`, a bump or
  `check-sw-version.mjs` (top, `LAZY`, the fetch-handler note) updated.
- `test/build.test.js`, `test/sw.test.js`, `test/hooks.test.js`,
  `test/one-answer.test.js`, `test/ci-config.test.js` (comment only).
- `package.json`, `.github/workflows/test.yml`.
- `.claude/hooks/after-edit.sh`, `.claude/hooks/session-start.sh`.
- `AGENTS.md`, `.claude/skills/ship-feature/SKILL.md`,
  `.claude/skills/browser-verify/SKILL.md`.
- `scripts/check-about-date.mjs` (comment that cites `check-sw-version`).
- `docs/operations.md`, `docs/architecture/layout.md` (doc-writer).

Delete: `scripts/sw-bump.mjs`, `scripts/sw-merge.mjs`, `scripts/sw-shell.mjs`,
`scripts/check-sw-version.mjs`, `scripts/setup.mjs`, `.gitattributes`,
`test/sw-bump.test.js`, `test/check-sw-version.test.js`.

Must not change: `PRECACHE`'s contents, the install/activate/fetch logic in
`sw.js`, `stripCssComments`, `wrangler.jsonc`'s build command, anything a
coach sees. `docs/specs/` and `notes/` are history and are not rewritten.

## Constraints

- **One answer in one place.** `AGENTS.md` § Deploy owns the build rule; every
  other doc points there. No second copy of the digest algorithm: build,
  serve and the test-side `PRECACHE` parse all import from `build.mjs`. The
  build test's own sha256 is the oracle on purpose (decision 2's "the test
  computes itself"); it must not import the digest function it is checking.
- **`dist/` is an allowlist copy of `app/`.** Keep that shape; the stamp is a
  rewrite of one file inside it, like the CSS strip.
- **`app/` is never rewritten** by the build or the server.
- `npm test` stays the Cloudflare build gate; nothing here needs git history.
- No `sw:bump` is needed for this change itself (that is the point); there is
  no `VERSION` to bump.
- `/new-guard` for every test that reads source or docs (`hooks.test.js`,
  `one-answer.test.js`, the `sw.test.js` cache-name checks): each is run red
  before it is trusted green.

## Design

`build.mjs`:

- `parsePrecache(swSource)` and `shellDigest(read, swSource)` move here from
  `sw-shell.mjs`; `read(path)` returns the bytes for a `./`-prefixed precache
  path, so the build reads `dist/` and the server reads what it would serve.
- `stampShell(swSource, digest)` replaces `const SHELL = 'unbuilt'` with the
  digest and throws if that exact line is absent.
- `build(appDir, outDir)`: copy, strip CSS (as today), then compute the digest
  from `outDir` and rewrite `outDir/sw.js` with `stampShell`.

`serve.mjs`: for `/sw.js`, read the source, compute the digest with `read`
returning each file as it would be served (CSS stripped through the same
function), stamp, and send.

`sw.js`: `const SHELL = 'unbuilt';` and `const CACHE = \`benchcard-${SHELL}\``.
`activate` already deletes every other `benchcard-` cache, so the first deploy
also deletes the old `benchcard-v453-…` cache.

## Proof

- **`node --test test/build.test.js`** (module exports of `build.mjs` and
  `serve.mjs`, temp dirs): items 2, 3, 4, 5.
- **`node --test test/sw.test.js`**: item 1 (no `VERSION`, `SHELL` slot
  present, cache name is `benchcard-${SHELL}`), a guard under `/new-guard`.
- **`node --test test/hooks.test.js test/one-answer.test.js
  test/ci-config.test.js`**: item 7, guards under `/new-guard`.
- **The `git grep` in item 6**, run by hand and printed in the PR.
- **Full `npm run smoke`**: proves the served worker still precaches and
  boots offline (its offline rows and `redirect-check.mjs` in CI).
- **Workers preview** (step 12): item 8.

## Out of scope

- Generating `PRECACHE` (decision 3).
- Hashed file names or any other build step.
- Rewriting old specs or `notes/`.
- #359, which builds on this after it merges.
