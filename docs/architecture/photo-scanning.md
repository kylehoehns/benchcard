# Photo scanning: removed

Benchcard used to read a roster off a photo of a team sheet -- Tesseract in a
worker, lazily fetched, with a review step because OCR on a gym printout is a
suggestion rather than an answer. It was ~9.6 MB of vendored WASM, a lazy-load
budget rule, a focus-trapped dialog, its own analytics event and a chunk of
this file.

It was removed after it was tried in an actual gym several times and did not
work well enough. Copy-and-paste is not much of a hardship, and a feature that
mostly fails is worse than one that does not exist: it is the first thing a new
coach reaches for, so it was failing at exactly the wrong moment.

What went with it: `scan.js`, `scan-view.js`, `vendor/ocr/`, the `scan_used`
event, the `LAZY_PREFIXES` machinery in `scripts/budgets.mjs` and its smoke
check, two vendored icons, and two forced states in the a11y overlay pass.
Worth remembering as a shape rather than a lesson about OCR: the check that
guarded it ("the OCR bundle stays lazy") could no longer fail once the bundle
was gone, so it was deleted rather than left green forever.
