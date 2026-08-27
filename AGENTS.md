# Working on Benchcard

Static, client-side app that plans youth basketball substitution rotations and
prints them on a pocket-notebook card. No backend, no accounts, no build step.

`README.md` explains what the code does and why. `notes/TICKETS.md` is the
open work — open only; finished work is `notes/DECISIONS.md`. This file is the harness:
the things that will bite you, which are not obvious from reading the code.

## The loop

Work moves through four artefacts and each one is committed before the next
begins. The chain is the audit trail: the artefacts say what was asked for, what
was produced, and what proved it. `notes/DECISIONS.md` is the closed-work
half of that record.

**Intent** is `work/<slug>/intent.md` — problem, outcome, affected surfaces,
constraints, and what would settle it. That last clause is the acceptance test,
written before the work, and an item without one is not ready to start.
`notes/TICKETS.md` is the index over the open ones; `notes/ROADMAP.md` holds
the research behind them so no iteration re-derives evidence that already
exists.

**Spec** is `work/<slug>/spec.md` — the requirement and the design, with the
policy constraints from the intent applied rather than restated.

**Plan** before code, as `work/<slug>/plan.md`. Start in plan mode with the
intent and the spec, interrogate the plan
— what breaks, which step is riskiest, what else would work — and iterate until
someone who had not read this file could follow it. Then commit it, either as
the ticket's own "how" or in the commit message that lands the change. This
repo's dominant bug class is plan-versus-reality drift; the plan being written
down is what makes the drift visible.

**Proof** is `npm test` and `npm run smoke`, and neither is optional. "It
works" means a harness said so, in a browser, on this tree. `/browser-verify`
is the order of operations for the parts a harness does not cover.
`npm run evals` runs the Stage 4 suite in `evals/` — read its NOT RUN count,
which is honest rather than decorative: those checks are written down and
nothing here can decide them.

**Review** against `REVIEW.md` before committing — same passes every time, and
severity that means the same thing twice running.

## What is enforced, and what is only written down

Most of this file is judgement and cannot be mechanised. Six rules can be, and
are, in `.claude/hooks/` — they are stated in their own sections above and are
not restated here, only listed, so there is still one answer per rule:

| Enforced | How |
| --- | --- |
| No blanket `--update-budgets` | denied, `guard-bash.sh` |
| No `git add -A` / `git add .` | denied, `guard-bash.sh` |
| No `Co-Authored-By` trailer | denied, `guard-bash.sh` |
| No hand edits to `app/vendor/**`, the six generated chart pages, or `scripts/budgets.json` | denied, `guard-edit.sh` |
| A precached file changed → bump `VERSION`, set `SHELL` | reminded, `after-edit.sh` |
| A dirty tree means another writer is here | reported at session start |

`test/hooks.test.js` asserts all of it in both directions and runs in
`npm test`, because a guard nobody guards is a guard nobody should trust. The
ALLOW cases in it are real commands out of this repo's history and are as load
bearing as the DENY ones: a hook that ate `grep -n update-budgets` would be
switched off within a day, and a switched-off hook is worse than none, because
the prose was deleted on the strength of it.

Two procedures live in `.claude/skills/` rather than here, because they are
sequences you follow rather than facts you need loaded at all times:
`/browser-verify` and `/new-guard`. Both cite the sections above rather than
copying them. **They are Claude-specific. This file is not** — anything an
agent must know to avoid breaking the tree belongs here, where every tool reads
it.

## Layout

```
app/       everything served — HTML, JS modules, sw.js, vendor/
test/      *.test.js          scripts/  CI guards and the eval runner
work/      <slug>/intent.md -> spec.md -> plan.md, one directory per item
evals/     *.json + README    bands.yaml  stage 6, unwired (it says so)
notes/     TICKETS.md (the queue), ROADMAP.md (the why), DECISIONS.md (closed)
.claude/   settings.json, hooks/, skills/, agents/
```

`app/` is the only directory that is deployed. Everything above it is process,
and none of it reaches a coach.

Serve with `cd app && python3 -m http.server 8201`. Run tests with `npm test`
from the repo root (`node --test`, no dependencies to install).

`npm run smoke` runs the browser checks — **20 of them**, printed as a pass/fail
table: no horizontal overflow at 390×844, the card is still 3.45 × 5in, no
console errors, every touch target ≥44px across 320–390px, the last control in
an open dialog on screen and still 44px, every control accessibly named, ids
unique and aria references resolving, alt text, `lang`/title/tab order, the
three budgets, and the suite. Two fixtures on purpose (A26): a lean `SEED` for
the cold-load measurement, and a `RICH` record — 11 players, two games today,
three filed, levels set — for the overlay, touch, narrow and sweep passes. Do
not merge them back into one.

It drives `index.html` for all of that, plus one pass over all four views at
320px with the browser's default font size emulated at 32px (a reader on 200%
text) — the app shell was held to a lower standard than the marketing pages
until 2026-08-24, and a 228px sideways pan on the games view lived there the
whole time. That pass now covers seven states (the four views, bench mode,
bench mode with the undo toast, the swap picker) and checks **both axes**:
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
would have published `notes/TICKETS.md` at `benchcard.app/TICKETS.md`. Keep the
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
font stack must match `.card`'s exactly, and cards re-fit on
`document.fonts.ready` — otherwise a cold load measures the fallback and sizes
the card for a typeface it will not print in.

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
five.** Do not write, edit or trust anything that reports pass/fail — a test, a
CI check, a hook, a mutation harness — without it.

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
