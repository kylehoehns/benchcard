# Working on Benchcard

Static, client-side app that plans youth basketball substitution rotations and
prints them on a pocket-notebook card. No backend, no accounts, no build step.

`README.md` is the front door; `docs/` explains what the code does and why.
Open work is GitHub issues. This file is the harness:
the things that will bite you, which are not obvious from reading the code.

## The loop

Open work is **GitHub issues** — `gh issue list`. `notes/ROADMAP.md` holds the
research behind them, so no iteration re-derives evidence that already exists.
`/ship-feature` is the whole procedure; this section is only what it rests on.

**The issue is the requirement, not the truth about the tree.** Issues here
have been falsified by the first survey more than once. Read it with its
comments, check its claims against the code, and take what does not hold to the
human.

**A large change is decided once, then cut into tickets.** The conversation
that settles it ends in `/to-spec`, which publishes one parent issue holding the
decisions, and `/to-tickets`, which breaks that into sub-issues: vertical slices,
each labelled `ready-for-agent` and linked to its blockers with GitHub's native
dependencies. Work the frontier — an open ticket whose blockers are all closed.
`docs/agents/issue-tracker.md` says how they are published.

**Spec** is `docs/specs/<issue>-<slug>.md`, written after `/grill-with-docs`
has driven every open question to a decision the human made. A
`ready-for-agent` ticket has had that conversation already, so its spec is
written from the ticket and its parent without an interview — **unless** the
survey falsifies one of its claims or leaves a question the ticket does not
answer, and then only those questions go to the human. Its **What would
settle it** clause is the acceptance test, with concrete values — written
before the code, and an issue without one is not ready to build. The spec ships
in the same pull request as the change it describes, and stays: it is the
record of what was asked for at that commit, not a description of the code
today. A small fix carries no spec; its issue is the record instead.
`/ship-feature` § The small-fix lane says what counts as small. Terms go to
`CONTEXT.md`; a hard-to-reverse trade-off goes to `docs/adr/`.

**Proof** is `npm test` and `npm run smoke`, and neither is optional. "It
works" means a harness said so, in a browser, on this tree. `/browser-verify`
is the order of operations for the parts a harness does not cover.
`npm run evals` runs the Stage 4 suite in `evals/` — read its NOT RUN count,
which is honest rather than decorative: those checks are written down and
nothing here can decide them.

**One issue at a time.** Finish it, hand it back. Not two, and not "while I am
in here". A diff that touches three issues cannot be judged against any one
spec, which is the check `REVIEW.md` exists to make possible. A real problem
found along the way becomes a new issue, not part of this diff.

**Done is the merge.** The pull request says `Closes #N`, so merging it closes
the issue. Finished work is the closed issue, its pull request and `git log`.

**Review** against `REVIEW.md`, on a pull request. Every change reaches `main`
through one — no exceptions, including a one-line fix and including a change
that touches only `notes/`. Branch, commit, push, open the PR, and let the
checks report before merging. The same passes every time, and severity that
means the same thing twice running.

## Test seams

A coach-facing slice starts from a red Coach scenario: a test that drives
the app through `test/coach.js` the way a coach would, and asserts only what
is on screen or saved after a reopen. This is the seam for anything a coach
taps or reads. A screen with no verb in the driver yet gets one added there.
Do not add a unit test of a handler or of rendering beside a scenario that
covers it.

`node --test` on a pure function is the other seam, and only when it has
many input cases: the engine, roster-line parsing, Filing, the wording
builders. Smoke keeps layout and visuals: overflow, clipping, dark mode,
text size. A check that judges the tree goes to `/new-guard`.

## What is enforced, and what is only written down

Most of this file is judgement and cannot be mechanized. Nine rules can be, and
are, in `.claude/hooks/` — they are stated in their own sections above and are
not restated here, only listed, so there is still one answer per rule:

| Enforced | How |
| --- | --- |
| No blanket `--update-budgets` | denied, `guard-bash.sh` |
| No `git add -A` / `git add .` | denied, `guard-bash.sh` |
| No `Co-Authored-By` or `Claude-Session` trailer | denied, `guard-bash.sh` |
| No generated-by footer or session link in a PR or issue body | denied, `guard-bash.sh` |
| No hand edits to `app/vendor/**` (except `fetch.sh` and `README.md`), the six generated chart pages, or `scripts/budgets.json` | denied, `guard-edit.sh` — file tools only, not a shell write |
| A text file over 60 KB is read in parts (`grep -n`, then offset and limit) | denied, `guard-read.sh` |
| A precached file changed → bump `VERSION`, set `SHELL` | reminded, `after-edit.sh` — file tools only, not a shell write |
| A British spelling in an edited file | reminded, `after-edit.sh` — file tools only, not a shell write |
| A dirty tree means another writer is here | reported at session start |

`guard-edit.sh` and `after-edit.sh` are wired to the file tools
(`.claude/settings.json`'s matcher) and never fire on a shell write. What
catches it instead:

- `app/vendor/**`: the `vendor drift` workflow.
- the six chart pages: `test/charts.test.js`.
- a precache bump missed: `test/sw.test.js`'s `SHELL` digest, and
  `scripts/check-sw-version.mjs` in CI.
- a British spelling: `test/spelling.test.js`.
- `scripts/budgets.json`: nothing. Review is the only check.

`test/hooks.test.js` asserts every row of the enforcement table above in both
directions and runs in `npm test`, because a guard nobody guards is a guard
nobody should trust. The ALLOW cases in it are real commands out of this
repo's history and are as load bearing as the DENY ones: a hook that ate
`grep -n update-budgets` would be switched off within a day, and a
switched-off hook is worse than none, because the prose was deleted on the
strength of it.

Procedures live in `.claude/skills/` rather than here, because they are
sequences you follow rather than facts you need loaded at all times:
`/browser-verify` and `/new-guard`, which own their subjects outright, and
`/address-review` for acting on findings on a pull request — verify a finding
before complying with it, and treat a repeat of a class already written down
here as the harness failing rather than the code. They cite the sections above rather than
copying them. `/ship-feature` runs an issue end to end with the subagents in
`.claude/agents/`. `/grill-with-docs` is the interview it starts with, built
from `/grilling` and `/domain-modeling`. `/to-spec` and `/to-tickets` turn a
settled conversation into issues, and `/setup-matt-pocock-skills` wrote their
configuration. `/tdd` is how a change is built: one failing test at a seam the
spec named, then just enough code to pass it, then the next. Those seven are
Matt Pocock's, copied in unchanged so they can be
refreshed from upstream — except that the setup skill keeps only its GitHub
tracker template, because issues here live on GitHub. **They are Claude-specific. This file is not** — anything an
agent must know to avoid breaking the tree belongs here, where every tool reads
it.

## Agent skills

### Issue tracker

GitHub Issues: a spec is a parent issue, tickets are its sub-issues with native
blocking links and the `ready-for-agent` label. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created
when a term or decision first needs them. See `docs/agents/domain.md`.

## Layout

```
app/       everything served — HTML, JS modules, sw.js, vendor/
test/      *.test.js          scripts/  CI guards and the eval runner
docs/      reference prose; specs/ one spec per issue; adr/ decisions
evals/     *.json + README    bands.yaml  stage 6, unwired (it says so)
notes/     ROADMAP.md (the why), DECISIONS.md (what was built, to 2026-09)
.claude/   settings.json, hooks/, skills/, agents/
```

`app/` is the only directory that is deployed. Everything above it is process,
and none of it reaches a coach.

Serve with `npm run serve` (port 8201), never `python3 -m http.server`. It
redirects the way Cloudflare does: `about.html` 307s to the extensionless
spelling, which is what every internal href, canonical tag and sitemap entry
uses. The python server 404s on all of them, and a local server that disagrees
with production is a class of bug nothing can see. Run tests with `npm test`
from the repo root (`node --test`, no dependencies to install).

`npm run smoke` runs the browser checks (with `--no-tests`, it skips the check
that runs the unit suite, and the coverage floor with it) — printed as a
pass/fail table: no horizontal overflow at 390×844, the card is still 3.45 × 5in, no
console errors, every touch target ≥48px across 320–390px, every row in
Settings ≥48px across the same three widths, the last control in an open
dialog on screen and still 48px, every control accessibly named, ids
unique and aria references resolving, alt text, `lang`/title/tab order, the
card's own font loading before it is fitted, the three budgets, the suite, and
the line-coverage floor.
`scripts/smoke.mjs` is the entry point: flags, the check registry, the run
order and the table. Each check lives in its own module under
`scripts/smoke/`, with the helpers several checks share beside them, so read
the one check you are changing rather than the whole suite. `scripts/smoke/README.md`
is the index of every row — Check, File and Fixture, held to the registry by
`test/smoke-index.test.js` — read it, not this file, for which module covers
a given check. No file there may
pass the limit in `test/smoke-size.test.js` (`LIMIT`). Two fixtures on purpose
(A26): a lean `SEED` for the cold-load measurement, and a `RICH` record — 11
players, two games today, three filed, levels set — for the overlay, touch,
narrow and sweep passes. Do not merge them back into one. A check that needs a
page asks `land()` in `scripts/smoke/page-state.mjs` for it (record, width,
text size, media), rather than navigating and waiting for boot by hand. The
harness resets to the rich fixture before each rich row, so a check never
restores what it changed.

Every page it opens has its clock pinned to 2026-09-12 12:00 local
(`scripts/smoke/clock.mjs`), ticking forward from there — not frozen, since
`SETTLE` and the wait loops need it to move — so a run gives the same answer
at any hour instead of failing when CI happens to cross midnight (#178). A run
also ends on its own if it hangs: `--timeout <minutes>` (default 60) closes
Chrome and exits 1, naming the check it was on; `Ctrl-C`/`kill` do the same.
No `perl -e 'alarm …'` wrapper is needed.

How a run spends its time (fast animations, `--timing`, when to sleep): `scripts/smoke/README.md`.

It drives `index.html` for all of that, plus one pass over every screen at
320px with the browser's default font size emulated at 32px (a reader on 200%
text) — the app shell was held to a lower standard than the marketing pages
until 2026-08-24, and a 228px sideways pan on the games view lived there the
whole time. That pass covers Today and the four screens it
opens, the sheets and overlays, both step flows, the welcome screen on a first
run, the sample's flash after a `?try=` landing, and bench mode on the last stint
(#135). The list itself is
`APP_LARGE_TEXT_STATES` in `scripts/smoke/app-large-text.mjs` and the run
prints every name it measured, so read those rather than a copy here. It
checks **both axes**:
`STRANDED_ABOVE` exists because every overflow probe here was horizontal until
2026-08-25, and a toast 160px above the top of the viewport passed all of them.
`APP_LARGE_TEXT_ALLOW` is empty and every view is pinned at zero; the same rule
applies to it as to `LARGE_TEXT_ALLOW` below.

Then it loads the other seven pages — `about.html` and the six generated
roster-size chart pages — at 390 and 320 for overflow, alt text, ids, lang,
touch targets and console errors, plus the same 320px/32px-root pass. That one
cell is where the large-text media queries are live and the column is still
narrow, which is why it is one cell and not a matrix. `about.html` has a
recorded 8px allowance there for residue that predates the check; every other
page is pinned at zero. **Do not raise a number in either allow map to clear a
new failure**, and never replace one with a blanket tolerance — a blanket is
what let the 228px pan above ship. Then it prints a pass/fail table. It serves
`app/` on its own ephemeral port and drives headless Chrome over the DevTools
protocol, so it is immune to the stale-service-worker trap below. Do the hand
checks it already covers only when it fails, or when you need something it does
not check.

`--only "<check>"` runs just the one named row and the setup it needs (a cold
load, or the cold load plus a rich-fixture reset), for the loop while iterating —
`node scripts/smoke.mjs --only "bench mode wake lock"` prints that one row and
nothing else. It is not proof: a partial run says nothing about the other
checks, and the full `npm run smoke` still stands between every change and its
PR. **The iterate-then-prove rule**: while iterating, run `node --test <file>`
for the file you touched and `--only "<check>"` for the check it covers, never
the full suite. Before handing work to someone else, `npm test` once — it is
the half that catches a markup move breaking a test three files away — and
not smoke. **The proof pair runs once per commit, by whoever commits**, and
nowhere else: one full `npm run smoke`, which runs the unit suite inside it, so
the suite runs once, not twice. It cannot be split: the coverage floor (below)
needs both halves in one run, and the commit's handoff has to cover the tree it
names. On #22 every agent ran the pair before handing back
and the committer ran it again on the same bytes — about twelve pairs for one
ticket, half of them repeats. A tree a commit already recorded as green is not
re-run to say so again.

**Smoke forces CI's font on a Mac too.** The smoke job runs Chrome on Ubuntu,
whose fonts used to be wider than a Mac's: "Bartholomew-Christopherson"
measured 227px there in a 209px row, and two button labels that fit on one
line locally wrapped in CI. Seven of the ten red CI runs in #131–#150 were
this. Rather than trust the two machines to agree, the harness carries CI's
own resolved font, DejaVu Sans (`scripts/fonts/`), and forces it onto every
page it opens, on a Mac and in CI alike (#177) — so `npm run smoke` on a Mac
now measures text the width CI measures it, and a text row that fails in CI
fails there first. Only `--font` is forced: the printed card's own InterVar
and the paste box's monospace textarea keep their real fonts. A check that
measures text still leaves at least 15% spare width, as
`scripts/smoke/row-stack.mjs` does — belt and braces now, not the only
defense; a layout that fits locally only with less than that is still the
defect, not the check. When CI fails a text row that passes locally, read the
measured values in the CI log before changing anything.

**Coverage is counted on every full run.** The browser rows and the unit suite
both run `app/`, so a full smoke run merges V8's own line coverage from both
(`scripts/coverage.mjs`; no dependency, nothing instrumented into `app/`) and
prints one total with a per-file table. The row fails when the total is more
than half a point under `scripts/coverage.json`; the table is informational.
`node scripts/smoke.mjs --update-coverage` re-records it, on a full run only
and only when every check passed, and the diff shows in review. A main-frame
navigation with no coverage taken first fails the row, naming it. `--only` and
`--no-tests` print no coverage row.
The CI job is named `smoke` (the ruleset requires it by that name) and runs the
suite inside it, so it is not run twice. A row that flakes only with coverage on
is a finding to report, not a retry.

The payload budget is a **recorded** baseline. `requests` comes from
`scripts/budgets.json`; `bytes` and `nodes` are hand-pinned as
`BYTES_BASELINE` and `NODES_BASELINE` in `scripts/budgets.mjs`, because
nothing can rewrite `budgets.json` without erasing the `requests` pin (#35,
#37).
**Bytes and nodes are regression alarms, not constraints**: the shell is
precached, so
after the first load neither number costs a coach anything, and node or byte
cost is not a reason to reject a fix. Their ceilings are deliberately wide.
**`requests` is the one real pin** — `REQUESTS_BASELINE` in
`scripts/budgets.mjs`, held one under the measured cold load, and is what
stops a new module quietly joining the boot graph. A module that joins on
purpose re-pins it there and says which and why (#123). Never re-record it, and
never run a blanket `node scripts/smoke.mjs --update-budgets`: every live
baseline is a hand pin in `scripts/budgets.mjs`. Re-pin the `bytes` baseline to your own measured cold load in
`scripts/budgets.mjs` instead, deliberately, and say what you measured there
and in the commit. Do not widen the percentage in place of re-pinning: that
ratchet ran from #22 to #33 and ended with a ceiling 61% above a stale number.

Shipping a redesign ticket and need a screenshot compare set? `node
scripts/compare-shots.mjs --issue <n>` is the one committed harness — it
writes PNGs and `measurements.json` to
`notes/mockups/prototype/compare/<n>/`, proving every shot's root font size
by measurement and every dark shot by painted color rather than trusting
either silently (#86). Do not write a second throwaway capture script.

`node scripts/look.mjs --out <dir>` is the other one, for any look check:
any URL (a preview included), the `--widths`, `--font` sizes and `--view`s you
choose, `--dark` through the record, one PNG per cell, and a
`measurements.json` that lists each shot's cut-off text with the #179 probe
(`excused` names the known issue, `null` is new). Use `compare-shots.mjs` for a
redesign ticket's fixed side-by-side set against the prototype and `look.mjs`
for everything else; it reports findings and exits 0 unless a shot could not
be proved (#180).

Nothing outside `app/` is deployed — `wrangler.jsonc` names `assets.directory`
as `"app"`. That is deliberate: it replaced an `.assetsignore` denylist that
would have published the old ticket list at `benchcard.app/TICKETS.md`. Keep the
allowlist shape; do not reintroduce a denylist.

## Traps

**Bump `app/sw.js` VERSION whenever a precached file changes**, and set `SHELL`
to the digest in the same edit: `npm run sw:bump` does both (`VERSION` becomes
`origin/main`'s plus one). The cache is
`benchcard-v${VERSION}-${SHELL}`: `SHELL` is what actually busts it, so a
forgotten bump now leaves a stale release LABEL rather than a stale app on a
coach's phone. `VERSION` is that label and nothing more — keep it honest.
`scripts/check-sw-version.mjs` and `scripts/check-about-date.mjs` need a base
ref, so the proof pair skips them; `npm run check:history` runs both against
`origin/main` — run it before every push. The `SHELL` guard in
`test/sw.test.js` runs everywhere.

**Two open PRs that both bump conflict on `app/sw.js`.** Run `npm run setup`
once per clone: it registers the merge driver `.gitattributes` names, which
clears a conflict that touches only `VERSION` and `SHELL` (any other conflict
in the file is still reported). After the rebase, run `npm run sw:bump`. If
the rebase changed nothing on your branch but those two constants, `npm test`
is the whole proof — its `SHELL` guard proves the digest — and the smoke suite
need not run again.

**The printed card is auto-fitted from canvas `measureText`.** Its measurement
font stack must match `.card`'s exactly. The UI itself does not use the card's
face, so nothing else starts loading it at boot: cards re-fit once
`document.fonts.load('800 16px ' + CARD_FONT)` settles (falling back to
`document.fonts.ready` where `load` is unsupported or itself fails) —
otherwise a cold load measures the fallback and sizes the card for a typeface
it will not print in.

**The browser traps are not here.** `/browser-verify` owns them: the service
worker, your measurement tools, `css.includes`, `getClientRects()`, the
`oklch()` player hue read through a regex, and `booted === true`. Every one of
them reports SUCCESS while being wrong, every one has cost iterations, and none
is restated in this file. Load that skill before you measure anything in a
browser, and before you write a probe, an interception or a delaying server.

## Guards

Guards here have gone green against a broken tree five separate ways: a floor
that could never be met, a fail count the runner never printed, a `-1` sentinel
that made `-1 > 0` the verdict, a name that differed by file, and a restore
that deleted the very fix under test. **`/new-guard` owns the procedure and all
five.** Do not write, edit or trust a check that judges the tree — a smoke
check, a CI script, a hook, a mutation harness, a test that reads source or
docs rather than running code — without it. A test that exercises behavior
through a seam is built with `/tdd` instead: watching it fail for the right
reason before the code exists is its proof that it can.

## Judgement

- **"It works" and "what does it buy" are different questions, and only the
  second justifies a constraint.** Six iterations went into preserving a
  no-JavaScript property that opened a form which could not be submitted.
  Everyone verified it worked; nobody asked what it was for.
- **Naming one engine as sufficient is a confession, not a justification.** A
  comment reading "enough in Chrome" in a rule that exists because three engines
  differ is an admission the other two were never tested.
- **A grep hit is not proof, a grep MISS is not proof, a code comment is not
  proof, and another agent's report is not proof.** Two comments in `app.css`
  cite device measurements no machine here could have taken; a claim about
  `feature-keys.mjs` was relayed through two iterations before someone ran it
  and found it false. Scan whole files — a window of source is not a scope.
  A phrase search also misses a phrase that wraps, and this repo wraps prose
  at ~78 columns: flatten first, or write the pattern with `\s+`, before a
  miss counts as an answer. `test/prose.js`'s `lacks` does this for tests.

## Rules

- **Mobile first.** Verify at 390×844 before anything else; desktop is the
  adaptation. A coach uses this standing up, one-handed, in a gym.
- **Never regress the card.** It must stay 3.45 × 5in and legible at arm's
  length. It is the product.
- **`engine.js`, `budget.js`, `storage.js`, `roster.js` are pure and heavily
  tested.** Leave their behavior alone unless the task is explicitly about
  them.
- **Prefer transform/opacity for animation.** Anything animating `left`, `top`,
  `width` or `height` on a hot path is a bug to fix, not a pattern to copy.
- **Verify in a real browser**, not by reading code. Screenshot layout changes.
- **Redesign screens match the prototype.** Work on #18 and its children must
  look like `notes/mockups/prototype/` — read its README first — and a PR that
  changes a redesigned screen shows a side-by-side screenshot next to the
  matching prototype PNG.
- **Third-party code changes only through `app/vendor/fetch.sh`.** A CI job
  re-runs it and fails if the tree differs by a byte.
- **The privacy claim is narrow on purpose**: "your roster and your players
  never leave your device", never "nothing is uploaded" — analytics loads a
  script. `test/analytics.test.js` bans four absolute phrasings across **every**
  HTML file in `app/` (9 today) **and every string literal in every `app/*.js`**
  (31 today) — most of the copy is in the modules, and the guard read only
  markup until 2026-08-25. One list of phrasings serves both. JS comments and
  regex bodies are dropped, `console.*` is deliberately in scope, and no
  attempt is made to tell prose from selectors: the phrase is the
  discriminator. It used to name two files by hand, which left the six chart
  pages carrying the trust line unguarded.
- **This repo uses American spelling everywhere.** The word list lives in
  `scripts/spelling.mjs`, not here; `test/spelling.test.js` scans every tracked
  file outside `app/vendor/` and fails on a spelling from the other list.
- **No `Co-Authored-By` or `Claude-Session` trailer in commits.** A PR or
  issue body ends at `Closes #N`: no generated-by line, no session link.
- **Stage explicit paths, never `git add -A` / `git add .`.** This tree carries
  screenshots, `.playwright-mcp` scratch and worktrees that are ignored today
  only because someone remembered to ignore them; the next scratch file will
  not be.
- **One writer at a time.** A dirty tree means another session is mid-change.
  Read the diff before writing anything — two writers here has meant one
  reverting the other's uncommitted fix.

## Deploy

Cloudflare Workers static assets, connected to `main`. Build command
`npm test` (there is nothing to build, so the field gates the deploy on the
suite), deploy command `npx wrangler deploy`, version command
`npx wrangler versions upload` (branch builds — uploads a preview version
instead of publishing), root directory `/`. All four are mirrored in
`wrangler.jsonc`'s header comment and were confirmed from the dashboard
2026-08-24; keep the three copies in step.
`app/_headers` sets `no-cache` on the HTML and `sw.js` — read the reasoning in
that file before changing it.
