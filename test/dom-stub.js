/* The document/matchMedia stub several pure-module test files need at import
 * time, before any of their own assertions run: state.js (through
 * test/state-fixture.js's `S`) and trap.js (test/trap.test.js) both read
 * `document` and `matchMedia` at the top of the module, not lazily inside a
 * function, so importing either without this first throws before a single
 * test runs.
 *
 * A side-effect-only module (no export), imported for what it does to
 * `globalThis`, not what it returns -- `test/state-fixture.js` used to hold
 * this inline and `test/trap.test.js` copied it, with an extra
 * `querySelectorAll` neither module actually reads at import time; this is
 * the one copy both import now, so the two stubs cannot drift the way the
 * hand-copy already had. A plain file straight in test/, not test/helpers/: see
 * state-fixture.js's own comment on why a subdirectory is not safe for a
 * module that only has side effects -- `node --test`'s glob would otherwise
 * run it as its own (empty) suite twice, once for each name. */

globalThis.document ??= {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
  addEventListener: () => {},
};
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener: () => {} });
