# app/vendor/

Third-party code, checked in rather than installed. Re-fetch with
`sh app/vendor/fetch.sh`. These are served directly to the browser, so there is no
bundler and no build step — the "build" is that script, and its output is
committed. CI re-runs it weekly and on every change under `app/vendor/`, and fails
if the tree moves (`.github/workflows/vendor-drift.yml`) — so do not hand-edit
anything here, change the pin in `fetch.sh` and commit what it produces. Label
a version-bump PR `vendor-bump` to skip that job.

| what | version | licence | size | loaded |
|---|---|---|---|---|
| `motion.umd.js` + `motion.mjs` | motion 11.18.2 | MIT | 65 KB | always |

`motion` drives spring transitions, staggered entrances and FLIP reordering.
