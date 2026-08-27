---
name: browser-verify
description: How to verify a Benchcard change in a real browser, and the six things in this tree that lie to you by reporting success -- the service worker, your measurement tools, css.includes, getClientRects, the oklch player hue under a regex, and booted === true. Use before claiming any layout, contrast, animation, overflow, touch-target, copy or offline change works; whenever a browser check returns a result that looks too good; and before writing a probe, an interception or a delaying server.
allowed-tools: Bash(node scripts/smoke.mjs*), Bash(npm run smoke*), Bash(npm test), Bash(node --test*)
---

# Verifying in a browser

This file owns the browser traps outright. `AGENTS.md` indexes them and does
not restate them, because two answers to one question is the defect that has
cost this repo more than any other.

Every trap below reached this list the same way: something reported success
and was wrong, and somebody spent iterations finding out.

## 1. Try not to drive a browser at all

`node scripts/smoke.mjs` already covers 20 checks across eleven pages, serves
`app/` on its own ephemeral port, and is therefore immune to the stale-worker
trap by construction. If the thing you changed is overflow, card dimensions,
console errors, touch targets, accessible names, id uniqueness, alt text,
`lang`, tab order, large-text reflow or the payload budget — **it is already
checked, and your hand-rolled version of it will be worse.**

Reach for a hand-driven browser only when the harness does not cover it, or
when it fails and you need to see why.

## 2. Buy a clean origin, before the first measurement

**The service worker will serve you stale code.** Unregister it and clear its
caches at the start of *every* browser session, or you will verify against
files you already changed and everything will pass. A re-install does not
re-fire on a port that already has one, so verify precaching on a fresh unused
port.

**A never-used port is not a clean origin.** 17 of 19 carried a registration,
several with this tree's own cache digest. Return `location.host` inside every
probe's own payload and read it — a probe that cannot tell you which origin it
ran on has not told you anything.

## 3. Your measurement tools lie, and they lie by reporting success

- **`browser_resize` on a shared browser silently no-ops and returns OK.** The
  tell is a number that never moves. Run your own Playwright browsers, or drive
  a same-origin iframe and delete it after.
- **`page.route` never fires when a leftover worker serves the module graph**,
  so an interception reporting `hits: 0` means your arms were never tested.
- **A delaying server needs `Cache-Control: no-store`**, or the memory cache
  serves the file and every arm of your experiment passes identically.

## 4. Take the measurement so it can fail

**`css.includes` proves a string is present, never that a rule applies.** A
comment that closed early once swallowed a whole rule while `npm test` stayed
green. Prove a rule *applies*, in a browser. The same holds for copy: a grep
proves a phrase is in the file, not that a reader sees it — read
`document.body.innerText`.

**`getClientRects().length` is not a visibility test.** Use
`checkVisibility({contentVisibilityAuto: true, opacityProperty: true,
visibilityProperty: true})`.

**`booted === true` is not "settled".** Measuring the instant it flips catches
`viewIn`'s 7px translate mid-flight and reads like a cross-engine regression.
Wait for the animation, not the boot.

**Check both axes.** Every overflow probe here was horizontal until 2026-08-25,
and a toast 160px above the top of the viewport passed all of them.

## 5. Colour: resolve through a 1×1 canvas

**Player colours are `oklch()`; the palette is not.** `tokens.css`, `app.css`
and `card.css` contain zero `oklch()` — 32 hex literals and 33 `rgba()`. The
one runtime `oklch()` is the per-player hue built in `state.js:27` (plus
`about.html`'s demo markup). It still matters, because parsing
`getComputedStyle().color` with a `[\d.]+` regex reads `oklch(0.72 0.15 26)` as
RGB and reports a healthy player chip as a 1.03:1 contrast failure — two
iterations nearly filed that.

Stated as an absolute this used to invert into the opposite trap: **a hex
readout is not a parsing bug, it is most of the palette.**

## 6. Judge the result, and say what you actually ran

- **If the result is suspiciously perfect, verify the check before you believe
  it.** That instinct has paid for itself more often than any check here. When
  the check under suspicion is a guard, `/new-guard` is the procedure.
- **Playwright's WebKit is not iOS Safari.** Same engine, different touch input
  model. A clean desktop-WebKit run clears nothing about an iPhone bug; there
  is no simulator on this machine. Do not claim a device test you cannot run.
- Naming one engine as sufficient is a confession, not a justification.

## 7. Before you commit

If a precached file changed, bump `VERSION` and set `SHELL` to the digest
`npm test` names, in the same edit — the rule and the reason are in `AGENTS.md`
§ Traps, which owns it because it applies whether or not you opened a browser.
