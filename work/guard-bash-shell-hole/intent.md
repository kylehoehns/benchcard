# Intent: the edit guards only guard the file tools

**Stage 1.** The problem, written down. No spec and no plan yet, deliberately —
this is what Stage 1 looks like.

## Problem

`.claude/hooks/guard-edit.sh` denies edits to `app/vendor/**`, the six generated
chart pages, and `scripts/budgets.json`. It is registered on
`PreToolUse(Edit|Write|NotebookEdit)`.

**A shell write is none of those tools.** `sed -i`, a `>` redirect, `tee`, `cp`
and `python3 -c 'open(...).write(...)'` all reach the same files and the hook
never fires. `after-edit.sh` has the same shape and so misses the
`VERSION`/`SHELL` reminder on a shell-driven edit of a precached file.

This is not theoretical. Both happened during the work that built the hooks:
`scripts/budgets.json` was edited through Python, which the guard is supposed to
deny outright, and two precached files were changed without the reminder firing
— the suite caught the second, nothing caught the first.

**The commit that introduced the hooks describes those rules as enforced.** That
overstates what is true, and an overstated guarantee is worse than a documented
gap, because the gap is then invisible.

## Proposed outcome

Either the shell path is covered, or `AGENTS.md` stops saying the rule is
enforced and says which half is. Both are acceptable outcomes; what is not
acceptable is the current state, where the table in `AGENTS.md` reads as
complete coverage.

## Affected surfaces

- `.claude/hooks/guard-bash.sh` — the plausible home, since it already reads
  the command string.
- `.claude/hooks/guard-edit.sh`, `after-edit.sh` — unchanged if the work lands
  in the Bash guard.
- `AGENTS.md` § "What is enforced" — the table that currently overstates.
- `test/hooks.test.js`, `evals/*.json` — both assert current behaviour and will
  need the new arms.

## Constraints

- **The ALLOW cases are as load bearing as the DENY cases.** A pattern broad
  enough to catch every shell write is broad enough to catch reading a file,
  and a guard that eats ordinary work is a guard that gets switched off. Any
  detection must survive `grep`, `cat`, `git diff` and a heredoc that merely
  *mentions* a protected path — the last one already caused a false denial once.
- **Fail closed, like the existing guards.** A detector that cannot parse a
  command must block, not shrug.
- Shell is not parseable in general. A best-effort matcher that names its own
  limits in the denial message is preferable to one that pretends to be
  complete.

## Open questions

1. Is full coverage achievable at acceptable false-positive cost, or is the
   honest answer to narrow the claim in `AGENTS.md` instead? **This is the
   question the spec has to answer, and it may well answer "narrow the claim".**
2. Does `deny` on a compound command (`npm test && sed -i ...`) reject the whole
   line, and is that the behaviour we want?

## What would settle it

`AGENTS.md`'s enforcement table is true. Either a shell write to a protected
path is denied — with the ALLOW cases from `test/hooks.test.js` still passing —
or the table says plainly which tool surfaces are covered and which are not.
