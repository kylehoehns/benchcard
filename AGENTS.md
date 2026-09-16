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
today. Terms go to `CONTEXT.md`; a hard-to-reverse trade-off goes to
`docs/adr/`.

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

## What is enforced, and what is only written down

Most of this file is judgement and cannot be mechanised. Seven rules can be, and
are, in `.claude/hooks/` — they are stated in their own sections above and are
not restated here, only listed, so there is still one answer per rule:

| Enforced | How |
| --- | --- |
| No blanket `--update-budgets` | denied, `guard-bash.sh` |
| No `git add -A` / `git add .` | denied, `guard-bash.sh` |
| No `Co-Authored-By` trailer | denied, `guard-bash.sh` |
| No hand edits to `app/vendor/**` (except `fetch.sh` and `README.md`), the six generated chart pages, or `scripts/budgets.json` | denied, `guard-edit.sh` |
| A text file over 60 KB is read in parts (`grep -n`, then offset and limit) | denied, `guard-read.sh` |
| A precached file changed → bump `VERSION`, set `SHELL` | reminded, `after-edit.sh` |
| A dirty tree means another writer is here | reported at session start |

`test/hooks.test.js` asserts all of it in both directions and runs in
`npm test`, because a guard nobody guards is a guard nobody should trust. The
ALLOW cases in it are real commands out of this repo's history and are as load
bearing as the DENY ones: a hook that ate `grep -n update-budgets` would be
switched off within a day, and a switched-off hook is worse than none, because
the prose was deleted on the strength of it.

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

`npm run smoke` runs the browser checks — **28 of them**, printed as a pass/fail
table: no horizontal overflow at 390×844, the card is still 3.45 × 5in, no
console errors, every touch target ≥44px across 320–390px, every row in
Settings ≥48px across the same three widths, the last control in an open
dialog on screen and still 44px, every control accessibly named, ids
unique and aria references resolving, alt text, `lang`/title/tab order, the
card's own font loading before it is fitted, the three budgets, and the suite.
`scripts/smoke.mjs` is the entry point: flags, the check registry, the run
order and the table. Each check lives in its own module under
`scripts/smoke/`, with the helpers several checks share beside them, so read
the one check you are changing rather than the whole suite. No file there may
pass 40,000 bytes (`test/smoke-size.test.js`). Two fixtures on purpose (A26): a lean `SEED` for
the cold-load measurement, and a `RICH` record — 11 players, two games today,
three filed, levels set — for the overlay, touch, narrow and sweep passes. Do
not merge them back into one.

It drives `index.html` for all of that, plus one pass over every screen at
320px with the browser's default font size emulated at 32px (a reader on 200%
text) — the app shell was held to a lower standard than the marketing pages
until 2026-08-24, and a 228px sideways pan on the games view lived there the
whole time. That pass now covers twelve states (Today and the four screens it
opens, the team menu open, bench mode, bench mode with the undo toast, the swap picker, the
welcome screen on a first run and with the sample filled in, and the sample's
flash after a `?try=` landing) and checks **both axes**:
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
load, or the cold load plus `goRich`), for the loop while iterating —
`node scripts/smoke.mjs --only "bench mode wake lock"` prints that one row and
nothing else. It is not proof: a partial run says nothing about the other 22
checks, and the full `npm run smoke` still stands between every change and its
PR. **The iterate-then-prove rule**: while iterating, run `node --test <file>`
for the file you touched and `--only "<check>"` for the check it covers, never
the full suite. Before handing work to someone else, `npm test` once — it is
the half that catches a markup move breaking a test three files away — and
not smoke. **The proof pair runs once per commit, by whoever commits**, and
nowhere else: `npm test` then `npm run smoke -- --no-tests`, so the suite runs
once, not twice, and both halves always, because the commit's handoff has to
cover the tree it names. On #22 every agent ran the pair before handing back
and the committer ran it again on the same bytes — about twelve pairs for one
ticket, half of them repeats. A tree a commit already recorded as green is not
re-run to say so again.

The payload budget is a **recorded** baseline in `scripts/budgets.json`.
**Bytes and nodes are regression alarms, not constraints**: the shell is
precached, so
after the first load neither number costs a coach anything, and node or byte
cost is not a reason to reject a fix. Their ceilings are deliberately wide.
**`requests` is the one real pin** — it is hand-set at 40 of 41 and is what
stops a new module quietly joining the boot graph. Never re-record it, and
never run a blanket `node scripts/smoke.mjs --update-budgets`, which would
erase the pin. Widen a ceiling in `scripts/budgets.mjs` instead, deliberately,
and say why in the commit.

Nothing outside `app/` is deployed — `wrangler.jsonc` names `assets.directory`
as `"app"`. That is deliberate: it replaced an `.assetsignore` denylist that
would have published the old ticket list at `benchcard.app/TICKETS.md`. Keep the
allowlist shape; do not reintroduce a denylist.

## Traps

**Bump `app/sw.js` VERSION whenever a precached file changes**, and set `SHELL`
to the digest `npm test` names in the same edit. The cache is
`benchcard-v${VERSION}-${SHELL}`: `SHELL` is what actually busts it, so a
forgotten bump now leaves a stale release LABEL rather than a stale app on a
coach's phone. `VERSION` is that label and nothing more — keep it honest.
`scripts/check-sw-version.mjs` needs a base ref, so it is inert locally and
only fires in CI; the `SHELL` guard in `test/sw.test.js` runs everywhere.

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
docs rather than running code — without it. A test that exercises behaviour
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

## Rules

- **Mobile first.** Verify at 390×844 before anything else; desktop is the
  adaptation. A coach uses this standing up, one-handed, in a gym.
- **Never regress the card.** It must stay 3.45 × 5in and legible at arm's
  length. It is the product.
- **`engine.js`, `budget.js`, `storage.js`, `roster.js` are pure and heavily
  tested.** Leave their behaviour alone unless the task is explicitly about
  them.
- **Prefer transform/opacity for animation.** Anything animating `left`, `top`,
  `width` or `height` on a hot path is a bug to fix, not a pattern to copy.
- **Verify in a real browser**, not by reading code. Screenshot layout changes.
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
- **No `Co-Authored-By` trailer in commits.**
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
