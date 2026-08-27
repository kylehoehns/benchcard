# Tickets

The queue. Each live item is a directory under `work/<slug>/` holding the
`intent.md` -> `spec.md` -> `plan.md` chain; this file is the index over them,
so there is one place to look for "what is open" and one place per item for
"what does it say".

No archive here — finished work is `DECISIONS.md`. If we stop wanting
something, delete the entry rather than parking it.

Read `AGENTS.md` before starting. One writer at a time: if the tree is dirty an
iteration is already running. Stage explicit paths, never `git add -A`.

## Open

| Item | Stage reached | What would settle it |
| --- | --- | --- |
| [`trust-line-says-it-twice`](../work/trust-line-says-it-twice/) | plan committed, not implemented | one sentence, one form, everywhere; `scripts/charts.mjs` emits it too |
| [`guard-bash-shell-hole`](../work/guard-bash-shell-hole/) | intent only | `AGENTS.md`'s enforcement table is true — either shell writes to protected paths are denied, or the table says which surfaces it covers |
| [`greps-blind-to-line-wraps`](../work/greps-blind-to-line-wraps/) | intent only | every prose-searching guard surveyed, the exposed ones fixed and re-falsified with a wrapped phrase |

## Closed but kept

The two entries below are kept only so the next person does not re-derive them.
They are not open work.

---

## Two taps to open "Enter my team" on Safari/iPhone — CLOSED AS OBSOLETE

Kept only so the next person does not re-derive it. Seven rounds, five
hypotheses shipped and falsified **on the device**: `display:flex` on the
summary, a pre-stylesheet swallow, the boot window and `viewIn`, `touch-action`
plus tap-highlight, and iOS painting `:hover` on tap one. The element no longer
exists, so nothing the phone reports can confirm or refute the last one.

Two things outlived it and both stay: every hover rule in `app.css` now sits
behind `@media (hover: hover)`, correct on its own merits and confirmed on a
real iPhone; and the lesson that a control iOS does not recognise as
interactive is a bad bet, whatever the markup says.

---

## A coach who forgets can still lose a season — ANSWERED BY THE PHONE

The question this was waiting on is settled. Measured on a real iPhone,
2026-08-26, same build both ways: **a Safari tab does not show the persistence
line; the Home Screen install does.** `#persistNote` unhides only on
`navigator.storage.persisted() === true`, so that is the browser's own answer.

**A SECOND FACT ARRIVED AFTER THIS WAS FIRST WRITTEN, and it matters more than
the first one:** the installed app has its OWN storage and sets up from
scratch. So installing was never, on its own, a way to carry a season to
safety, and the nudge that said "it stays put" was telling a coach the
opposite of what happens. That is fixed: the nudge now says it sets up fresh
and hands over the backup file in the same toast. Both halves were measured on
the same iPhone, confirmed on a re-ask: a tab that is not persisted, a
home-screen app that is, and no data passing between them.

By this item's own stated criterion -- "if the installed app says yes, the
install nudge IS the fix and slice 2 shrinks to nothing" -- **slice 2 does not
ship.** The prompt sized to filed games is not built, and it should not be
built on this evidence: the exemption is real, the nudge already points at it,
and a second prompt on a second schedule would be a third interruption in a
product whose whole manner is not interrupting.

The measurement is written up in `ROADMAP.md`, which is where the why lives.

### WHAT IS STILL TRUE, AND IS NOT WORTH A TICKET YET

A coach who never installs is still on a tab. The nudge is offered once, at use
2, and never again either way (`ui.installDone`) -- which is before anybody has
a season worth losing. That is a bounded gap and it is recorded rather than
fixed, because every fix proposed for it so far has been a new interruption.

The cheapest thing that would help is not a nudge at all: the Backup box
already tells a coach the risk and offers a file, and now that installing is
MEASURED to fix it, that box could say so — one sentence, in a place the coach
opened on purpose, shown only when `persisted()` is false and the app is not
already running installed. Not filed as work because it is a copy decision
nobody has asked for; written down so the next person does not re-derive the
evidence for it.

---

---
