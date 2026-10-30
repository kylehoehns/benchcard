# #381: About says the home-screen app starts fresh; Advanced documents overtime

Started in the small lane and switched to the full lane mid-build: the diff
is 34 changed lines of static copy outside `test/` and `docs/` (about.html,
advanced.html, sitemap.xml), over the 20-line limit. No logic changed.

## Issue

#381 asks for two static-page fixes: About's "Could I lose my roster?" answer
should say the home-screen app starts empty, and the Advanced page should
document overtime.

## Goal

A coach who installs to the home screen to protect a season saves a backup
first, because About told them the installed app starts fresh. A coach who
reads Advanced learns overtime exists and what each "Who plays" choice does.

## What would settle it

- The visible answer and the FAQPage JSON-LD answer to "Could I lose my
  roster?" both contain "backup" and "starts fresh", and are the same text.
- `app/advanced.html` has `<h2 id="overtime">Overtime</h2>`, a contents link
  to `#overtime`, and names `<b>Tied? Add overtime</b>`, `<b>Next rotation</b>`,
  `<b>Even out</b>`, `<b>Keep this five</b>`, `<b>Strongest five</b>` and
  `<b>Add overtime</b>`, the exact on-screen labels.
- Smoke's static-page checks pass at 320 and 390 wide, 16 and 32px text.

## Surfaces

Change: `app/about.html`, `app/advanced.html`, `app/sitemap.xml`, `app/sw.js`
(version bump), `test/faq-jsonld.test.js`, `test/advanced-overtime.test.js`.
Must not change: any `.js` under `app/` other than `sw.js`.

## Constraints

- W1, W2: the labels are copied from `app/index.html` (`#overtimeWho`,
  `#overtimeGo`) and `app/gamemode.js` ("Tied? Add overtime"); the test reads
  them from there rather than holding a second copy.
- The About wording matches what `app/toast.js` already tells a coach: the
  home-screen app sets up fresh, so save a backup and restore it there
  (`notes/ROADMAP.md` records the iPhone measurement).
- About's dateline and both sitemap `<lastmod>`s move to 2026-10-30
  (`scripts/check-about-date.mjs`, `scripts/check-sitemap-lastmod.mjs`).
- Both pages are precached: `npm run sw:bump`.

## Design

About's answer is reordered so the backup comes first and the home-screen
sentence can point back at it. Advanced gets an Overtime section after
"Changing the plan mid-game" (overtime is a bench-mode action), one bullet per
choice, matching the mid-game section's `<b>label</b> — what it does` style.

## Proof

- `test/faq-jsonld.test.js` (node --test): finds "Could I lose my roster?" in
  the visible FAQ and in the JSON-LD and checks /backup/ and /starts fresh/;
  the existing test there holds the two lists identical. Covers item 1.
- `test/advanced-overtime.test.js` (node --test): a guard that reads
  index.html, gamemode.js and advanced.html. Covers item 2.
- `npm run smoke` static-page checks, and `scripts/look.mjs` on about and
  advanced at 320/390, 16/32px. Covers item 3.

## Out of scope

Adding overtime to `scripts/feature-keys.mjs` (the in-app help and About
coverage list); the issue asks only for Advanced.
