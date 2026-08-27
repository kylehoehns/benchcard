---
name: address-review
description: How to act on review findings on a pull request in this repo -- verify a finding before complying with it, fix the cause rather than the symptom named, reply with what you actually ran, resolve only what you fixed, and escalate a repeated class of mistake into the harness. Use when a reviewer (human or Claude) has left comments on a PR, when asked to address review feedback, and before resolving any review thread.
allowed-tools: Bash(gh pr *), Bash(gh api *), Bash(npm test), Bash(npm run *), Bash(node --test*)
---

# Acting on a review

`REVIEW.md` says how to GIVE a review here. This is the other direction, which
has its own failure modes and had nothing written about it until a review found
two real bugs and the answers to "what do I do now" were all improvised.

## 1. A finding is a claim, not an instruction

**Another agent's report is not proof** — `AGENTS.md` § Judgement says so about
every other claim in this repo and it does not stop being true because the
claim arrived as a review comment. Reproduce the failure before you fix it.

Worked example, from the review that prompted this file. The finding said a
deleted `work/` directory would throw `ENOENT` at module load and take down the
whole test file. That was checked before it was accepted:

```
fresh checkout, work/ removed, before the fix:   0 pass, 1 fail
after the fix, .gitkeep missing:                 6 pass, 5 fail
after the fix, .gitkeep present, queue emptied: 11 pass, 0 fail
```

Zero-pass is the file dying before a test runs. The finding was right, the fix
was shaped by the reproduction rather than by the comment, and the reproduction
is what the reply could point at.

**A finding you cannot reproduce is a finding you push back on**, with what you
ran. Say so in the thread and leave it open. Complying with a wrong finding
costs more than arguing with a right one: it puts a change in the tree that
nothing justifies and that the next reader cannot trace to a reason.

## 2. Fix the cause, not the symptom the comment names

A comment names what the reviewer could see from the diff. That is often
downstream of the real defect.

The same worked example: the comment's headline was a tautological assertion
(`Array.isArray` on a value that is an array by construction). Fixing only that
would have left the actual bug — `work/` was tracked solely through the files
inside it, so shipping the last item deletes the directory itself. The
tautology was the visible end of it.

## 3. Verify your fix against the state CI will see, not the one on your disk

The bug above got past its own author's verification because the empty-queue
case was tested by emptying `work/` **locally**, where the directory still
existed. A fresh clone has no such directory.

Check against `git archive` output or a clean clone whenever the change
involves a file's existence, a directory, a checkout, or anything git tracks
differently from a filesystem. `/browser-verify` is the equivalent rule for
measurements; this is it for the tree.

## 4. A quiet re-review is not confirmation

The reviewer skips a pull request it has already commented on, and skips one
whose workflow files the PR modifies. Both cases finish GREEN and post nothing.
So "no new findings" can mean the fix is good, or can mean nothing ran.

**Read the run log before treating silence as a pass.** A review that took
under a minute did not review anything. The evidence your fix is right is your
own reproduction, not the reviewer's silence.

## 5. Reply with what you ran, then resolve

One reply per thread, saying which of these happened:

- **Addressed**, with the commit and the evidence — the numbers, not "fixed".
- **Not a defect**, with what you ran that shows it. Leave the thread open.
- **Real, not here** — a genuine problem outside this PR's scope. Say where it
  goes: a `work/<slug>/intent.md`, or a row in `notes/TICKETS.md`.

**Resolve only threads you actually addressed.** Never resolve to tidy the page
— an unresolved thread you disagree with is the record of a live disagreement,
and closing it deletes that. Resolving is a claim that the thing is done.

## 6. The second time is the harness's fault, not yours

This is the step everyone skips and it is the one that compounds.

When a finding names a class of mistake **that is already written down** in
`AGENTS.md` or a skill, the fix is not finished when the code is fixed. The
harness said the right thing and failed to stop it, so the harness is what
needs the change.

Both findings on the review that prompted this file were exactly that: a guard
that could not go red, and two answers to one question. Both are named in
`AGENTS.md`, one of them as the worst defect in the repo's history, and both
shipped into a pull request anyway. Fixing the two files and moving on would
have left the next occurrence exactly as likely.

Ask: could a hook have caught this? A test? A sentence in the file the mistake
was made in? If the answer is yes, that change belongs in the same PR as the
fix — see `/new-guard` for making it one that can actually fail.
