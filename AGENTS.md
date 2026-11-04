# Working on Benchcard

Static, client-side app that plans youth basketball substitution rotations and
prints them on a pocket-notebook card. No backend, no accounts, and one build
step (§ Deploy).

`README.md` is the front door; `docs/` explains what the code does and why.
This file is the harness: the things that will bite you, which are not obvious
from reading the code.

## The loop

Open work is **GitHub issues**; `/ship-feature` is the whole procedure for
one, and this section is only what it rests on. `notes/ROADMAP.md` holds the
research behind them, so no iteration re-derives evidence that already exists.

**The issue is the requirement, not the truth about the tree.** Issues here
have been falsified by the first survey more than once. Check its claims
against the code, and take what does not hold to the human.

**A large change is decided once, then cut into tickets**: `/to-spec`
publishes one parent issue holding the decisions, and `/to-tickets` cuts it
into `ready-for-agent` sub-issues (§ Agent skills). Work the frontier — an
open ticket whose blockers are all closed.

**The spec ships in the same pull request as the change it describes, and
stays**: it is the record of what was asked for at that commit, not a
description of the code today. A small fix carries no spec; its issue is the
record (`/ship-feature` § The small-fix lane).

**Proof** is `npm test` and `npm run smoke`, and neither is optional. "It
works" means a harness said so, in a browser, on this tree; `/browser-verify`
is the order of operations for the parts a harness does not cover, and a
layout change gets a screenshot. `npm run evals` runs the Stage 4 suite in
`evals/` — read its NOT RUN count: those checks are written down and nothing
here can decide them.

**One issue at a time.** Not two, and not "while I am in here". A diff that
touches three issues cannot be judged against any one spec, which is the
check `REVIEW.md` exists to make possible. A real problem found along the way
becomes a new issue. A batch of tickets runs one lane per issue
(`/ship-feature` § A batch of tickets).

**Every change reaches `main` through a pull request**, reviewed against
`REVIEW.md` — including a one-line fix and a change that touches only
`notes/`. Its body says `Closes #N`, so the merge closes the issue.

## Test seams

A coach-facing slice starts from a red Coach scenario: a test that drives
the app through `test/coach.js` the way a coach would, and asserts only what
is on screen or saved after a reopen. This is the seam for anything a coach
taps or reads. A screen with no verb in the driver yet gets one added there.
Do not add a unit test of a handler or of rendering beside a scenario that
covers it. An existing unit test stays: it is removed only when a scenario
covers everything it checks, which is rare.

`node --test` on a pure function is the other seam, and only when it has
many input cases: the engine, roster-line parsing, Filing, the wording
builders. Smoke keeps layout and visuals: overflow, clipping, dark mode,
text size. A check that judges the tree goes to `/new-guard`.

## What is enforced, and what is only written down

Most of this file is judgement. These rules are mechanized in
`.claude/hooks/`. Each row is the one place the rule is written, and the deny
message says why when it fires:

| Enforced | How |
| --- | --- |
| No blanket `--update-budgets` | denied, `guard-bash.sh` |
| No `git add -A` / `git add .`: stage explicit paths | denied, `guard-bash.sh` |
| No `Co-Authored-By` or `Claude-Session` trailer in a commit | denied, `guard-bash.sh` |
| A PR or issue body ends at `Closes #N`: no generated-by footer or session link | denied, `guard-bash.sh` |
| No hand edits to `app/vendor/**` (third-party code changes only through `fetch.sh`; `fetch.sh` and `README.md` are editable), the eight generated chart pages, or `scripts/budgets.json` | denied, `guard-edit.sh` — file tools only, not a shell write |
| A text file over 60 KB is read in parts (`grep -n`, then offset and limit) | denied, `guard-read.sh` |
| American spelling everywhere (word list: `scripts/spelling.mjs`) | reminded, `after-edit.sh` — file tools only, not a shell write |
| A dirty tree means another writer is here: read the diff before writing anything | reported at session start |

What catches a shell write instead:

- `app/vendor/**`: the `vendor drift` workflow.
- the eight chart pages: `test/charts.test.js`.
- a British spelling: `test/spelling.test.js`, over every tracked file.
- `scripts/budgets.json`: nothing. Review is the only check.

`test/hooks.test.js` holds the hooks to this table.

Procedures live in `.claude/skills/` and cite this file rather than copy it:

- `/ship-feature` runs an issue end to end with the subagents in
  `.claude/agents/`.
- `/browser-verify` and `/new-guard` own their subjects outright (§ Traps,
  § Guards).
- `/address-review` is for acting on findings on a pull request: verify a
  finding before complying with it, and treat a repeat of a class already
  written down here as the harness failing rather than the code.
- Matt Pocock's, copied in unchanged so they can be refreshed from upstream
  (the setup skill keeps only its GitHub tracker template): `/grill-with-docs`,
  the interview `/ship-feature` starts with, built from `/grilling` and
  `/domain-modeling`; `/to-spec` and `/to-tickets`, which turn a settled
  conversation into issues, configured by `/setup-matt-pocock-skills`; `/tdd`,
  how a change is built — one failing test at a seam the spec named, then just
  enough code to pass it; and `/codebase-design`, the vocabulary it consults
  when where a seam goes is itself in question.

**Skills are Claude-specific. This file is not** — anything an agent must know
to avoid breaking the tree belongs here, where every tool reads it.

## Agent skills

### Issue tracker

GitHub Issues: a spec is a parent issue, tickets are its sub-issues with native
blocking links and the `ready-for-agent` label. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root, created
when a term or decision first needs them. See `docs/agents/domain.md`.

## Layout

`app/` is everything served, and the only directory deployed, by way of its
copy in `dist/` (§ Deploy). Everything else is process, and none of it reaches
a coach. `docs/design-decisions.md` is near the 60 KB limit: a new decision
goes in the matching side file in its index, or in a new side file added to
that index.

Serve with `npm run serve` (port 8201), never `python3 -m http.server`. It
redirects the way Cloudflare does: `about.html` 307s to the extensionless
spelling, which is what every internal href, canonical tag and sitemap entry
uses. The python server 404s on all of them. It stops itself after
60 minutes (`--ttl <minutes>`) or as soon as the process that started it
exits, so start it in the foreground or as a background job, not with a bare
`&` from a shell that then exits (#595).

`npm run smoke` runs the browser checks, the unit suite and the coverage floor
as one pass/fail table (`--no-tests` skips the suite and the floor).
`scripts/smoke/README.md` indexes every row and says how a run works
(fixtures, the pinned clock, timing, the large-text passes); read the one
module you are changing, not the whole suite. A run ends itself if it hangs
(`--timeout`, default 60 minutes) and closes its Chrome even when killed, so
it needs no wrapper.

**The iterate-then-prove rule.** While iterating, run `node --test <file>`
for the file you touched and `node scripts/smoke.mjs --only "<check>"` for the
check it covers. `--only` is not proof: a partial run says nothing about the
other checks. Before handing work to someone else, `npm test` once — it
catches a markup move breaking a test three files away — and not smoke.
**The proof pair runs once per commit, by whoever commits**, and nowhere else:
one full `npm run smoke`, which runs the unit suite inside it, so the suite
runs once. It cannot be split: the coverage floor needs both halves in one
run, and the commit's handoff has to cover the tree it names. A tree a commit
already recorded as green is not re-run to say so again (on #22 every agent
re-ran it: about twelve pairs for one ticket).

**Do not raise a number in `LARGE_TEXT_ALLOW` or `APP_LARGE_TEXT_ALLOW` to
clear a new failure**, and never replace one with a blanket tolerance. Both
are empty, every page is pinned at zero, and a blanket is what let a 228px
sideways pan ship on the games view.

**Smoke forces CI's font on a Mac too.** CI's Ubuntu fonts measured wider than
a Mac's, and seven of ten red CI runs in #131–#150 were text that fit locally.
So the harness forces CI's own font, DejaVu Sans (`scripts/fonts/`), on every
page it opens (#177); the printed card's InterVar and the paste box's
monospace keep their real fonts. A check that measures text still leaves at
least 15% spare width, as `scripts/smoke/row-stack.mjs` does. When CI fails a
text row that passes locally, read the measured values in the CI log before
changing anything.

**Coverage is counted on every full run**, merged from the browser rows and
the unit suite (`scripts/coverage.mjs`). The row fails when the total is more
than half a point under `scripts/coverage.json`. `node scripts/smoke.mjs
--update-coverage` re-records it, on a full run only and only when every check
passed, and the diff shows in review. A row that flakes only with coverage on
is a finding to report, not a retry.

**Budgets.** **`requests` is the one real pin** — `REQUESTS_BASELINE` in
`scripts/budgets.mjs`, held one under the measured cold load, so a new module
cannot quietly join the boot graph. A module that joins on purpose re-pins it
there and says which and why (#123). **Bytes and nodes are regression alarms,
not constraints**: the shell is precached, so neither costs a coach anything
after the first load, and neither is a reason to reject a fix. Re-pin
`BYTES_BASELINE` (or `NODES_BASELINE`) in `scripts/budgets.mjs` to your own
measured cold load, deliberately, and say what you measured there and in the
commit. Do not widen the percentage instead: that ratchet ran from #22 to #33
and ended with a ceiling 61% above a stale number.

**Pictures.** `node scripts/look.mjs --out <dir>` is the harness for any look
check: any URL (a preview included), the `--widths`, `--font` sizes and
`--view`s you choose, `--dark`, one PNG per cell, and a `measurements.json`
listing each shot's cut-off text (`excused` names the known issue, `null` is
new). It exits 0 unless a shot could not be proved (#180). A redesign
ticket's fixed side-by-side set against the prototype is `node
scripts/compare-shots.mjs --issue <n>` instead. Do not write a throwaway
capture script.

## Traps

**`scripts/check-about-date.mjs`, `scripts/check-sitemap-lastmod.mjs` and
`scripts/check-whats-new.mjs` need a base ref,** so the proof pair skips them;
`npm run check:history` runs all three against `origin/main` — run it before
every push. The third fails a coach-facing change with no What's new entry;
`/ship-feature` § Would a coach notice this? says what to add.

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
them reports SUCCESS while being wrong. Load that skill before you measure
anything in a browser, and before you write a probe, an interception or a
delaying server.

## Guards

Guards here have gone green against a broken tree five separate ways.
**`/new-guard` owns the procedure and all five.** Do not write, edit or trust
a check that judges the tree — a smoke check, a CI script, a hook, a mutation
harness, a test that reads source or docs rather than running code — without
it. A test that exercises behavior through a seam is built with `/tdd`
instead: watching it fail for the right reason before the code exists is its
proof that it can.

## Judgement

- **"It works" and "what does it buy" are different questions, and only the
  second justifies a constraint.** Six iterations went into preserving a
  no-JavaScript property that opened a form which could not be submitted.
- **Naming one engine as sufficient is a confession, not a justification.** A
  comment reading "enough in Chrome" in a rule that exists because three engines
  differ is an admission the other two were never tested.
- **A grep hit is not proof, a grep MISS is not proof, a code comment is not
  proof, and another agent's report is not proof.** A claim about
  `feature-keys.mjs` was relayed through two iterations before someone ran it
  and found it false. Scan whole files — a window of source is not a scope.
  This repo wraps prose at ~78 columns, so a phrase search misses a phrase
  that wraps: flatten first, or write the pattern with `\s+`, before a miss
  counts as an answer. `test/prose.js`'s `lacks` does this for tests.

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
- **Redesign screens match the prototype.** Work on #18 and its children must
  look like `notes/mockups/prototype/` — read its README first — and a PR that
  changes a redesigned screen shows a side-by-side screenshot next to the
  matching prototype PNG.
- **The privacy claim is narrow on purpose**: "your roster and your players
  never leave your device", never "nothing is uploaded" — analytics loads a
  script. `test/analytics.test.js` bans the absolute phrasings in every HTML
  file and every string literal in `app/`.
- **Never quote the owner** in anything that lands on GitHub or in the repo
  (the repo is public). Paraphrase.

## Deploy

Cloudflare Workers static assets, connected to `main`. The dashboard's build
command is `npm test`, so a red suite never deploys. The four dashboard
settings are mirrored in `wrangler.jsonc`'s header comment, and
`docs/operations.md` § Deployment explains them.

**The build does two things: it strips CSS comments (#339) and writes `SHELL`
into `dist/sw.js`.** This is the one place that says so; every other mention
points here. Both wrangler commands run `wrangler.jsonc`'s `build.command`,
`node scripts/build.mjs`, which copies `app/` to the git-ignored `dist/`,
strips the comments from each `.css` file there, then replaces the
`const SHELL = 'unbuilt';` line in `dist/sw.js` with the first 12 hex of a
sha256 over the files `PRECACHE` names, as they sit in `dist/`. The service
worker's cache is `benchcard-${SHELL}`, so a precached byte that ships changing
makes a new cache and `activate` deletes the old one. Nothing edits `SHELL` or
`app/sw.js` by hand, and a CSS edit that only touches a comment changes
nothing that ships, so it keeps the cache name. Every other byte ships as it
is in git — no minifying, no bundling, no hashed names. `npm run serve`, and
so smoke and the Coach driver, strip and stamp with the same functions on the
fly, so local runs measure what ships. `app/_headers` sets `no-cache` on the
HTML and `sw.js` — read the reasoning in that file before changing it.

`wrangler.jsonc` publishes `dist/`, an allowlist: a copy of `app/` and nothing
else. It replaced an `.assetsignore` denylist that would have published the
old ticket list; keep the allowlist shape.
