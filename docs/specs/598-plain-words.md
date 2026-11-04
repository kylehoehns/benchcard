# #598 brief: a test flags jargon and long sentences in coach-facing text

Light-review lane (tooling ticket, `ready-for-agent`). This brief stands in for
a full spec.

## Issue

#598 asks for a test that reads the What's new entries and the visible text of
`app/about.html` and `app/advanced.html`, and fails on a banned word or a
sentence over 25 words, naming the file, the sentence and the reason. Plus one
line in `REVIEW.md` that keeps the "would a new coach understand this first
time" read a human judgement.

## Choices the issue did not settle

- **Which What's new file.** The issue says `app/whats-new.json`; that file
  does not exist. The entries live in `scripts/whats-new.json`, and
  `app/whats-new.html` is generated from it. The test reads
  `scripts/whats-new.json`, every entry, not just the newest 15 the page shows.
- **Word forms.** A banned word matches as a whole word, case-insensitive, with
  an optional plural `s` ("unit" catches "units", "stint" catches "stints").
  Multi-word entries ("strategy engine") match with any run of spaces between
  the words. Longer forms ("configure", "toggled") are not matched; add them to
  the list if they turn up.
- **Visible text.** Body text nodes only: the `<head>` (title, meta, JSON-LD),
  `<script>`, `<style>`, `<svg>`, `<noscript>` and comments are skipped, and so
  are attributes (`alt`, `aria-label`). Reuse `htmlBodyCopy` from
  `test/glossary.js` for the body/noscript/comment step.
- **Sentences.** A sentence ends at `.`, `!` or `?` followed by white space, or
  at a block element boundary (p, li, h1-h6, dt, dd, figcaption, summary, div,
  td, th, br, a heading or list item with no full stop). Words are runs of
  non-space characters that hold a letter or digit (a lone "—" is not a word).
  Inline tags become a space, so neighbouring spans never glue into one word. The card legend on `advanced.html` is term/meaning
  pairs written as inline spans; each `<span class="tok…">` starts a new
  sentence so the legend is not read as one 29-word line.
- **Mock-ups of the app's own screen.** Both pages draw the app's rules list,
  whose real row reads "Each player plays at most 2 stints in a row (8 min)"
  (`app/state.js` builds that string). Changing the page's copy of it would
  make the picture disagree with the app, and the app's own labels are not in
  this ticket. So the module keeps a short list of exact sentences that copy
  app text verbatim, per file. Each listed sentence must still be found on its
  page, or the test fails (a stale entry cannot linger). Nothing written for
  the page itself goes on that list.
- **Existing text.** Every sentence the test flags today is rewritten in plain
  words with the same meaning: "stint" becomes the time between two subs (or
  "turn on the floor", whatever reads plainly in place), and long sentences
  are split. The FAQ JSON-LD in `about.html`'s `<head>` mirrors the visible
  FAQ (`test/faq-jsonld.test.js`), so it changes with it.
- **Coach note.** The rewrites change what a coach reads on About and the
  Reference page, so the PR adds one What's new entry for them (following the
  What's new rules), and moves About's dateline and the sitemap `<lastmod>`
  for about, advanced and whats-new to the commit date.

## What would settle it

1. `node --test test/plain-words.test.js` passes on the branch.
2. Adding the word "stint" to any `scripts/whats-new.json` entry fails it, and
   the message names `scripts/whats-new.json`, the sentence, and
   `banned word "stint"`.
3. A 26-word sentence in an entry fails it with the word count and the limit.
4. The banned list (stint, unit, toggle, config, strategy engine, fingerprint)
   and the 25-word limit are written once, in `scripts/plain-words.mjs`.
5. The scan read something: each source yields at least one sentence, or the
   test fails (`/new-guard` 2a).
6. `REVIEW.md` has the judgement line.

## Proof (seams)

- `scripts/plain-words.mjs` exports `BANNED`, `MAX_WORDS`, `APP_COPY`,
  `visibleText(html)`, `sentences(text)` and `problems(file, sentences)`; unit
  tests in `test/plain-words.test.js` run them on made-up strings (both
  directions: a clean sentence passes, each banned word and a 26-word sentence
  fail, a 25-word one passes).
- The same test file then runs `problems` on the three real sources and
  asserts the list is empty. This is a guard under `/new-guard`: falsified by
  adding "stint" to a What's new entry, and by adding a banned word to a new
  sentence on each page.

## Out of scope

- "stint" and other jargon in the app's own screens (`app/*.js`).
- `index.html` and the generated chart pages.
- Judging plainness beyond the word list and the length limit.
