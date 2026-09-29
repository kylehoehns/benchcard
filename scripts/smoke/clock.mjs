/* #178: the smoke suite's own clock. `docs/specs/178-smoke-deterministic.md`'s
 * Decisions settle five questions this file and `smoke.mjs` build from; the
 * one this file owns is #1 -- the page's clock TICKS from a pinned start, it
 * is never stopped, because `SETTLE` (`dom.mjs`), `first-run-flow.mjs`'s own
 * wait loop and `app/trap.js`'s `lastPointerAt > lastKeyAt` all poll a
 * `Date.now()` deadline that a frozen clock would never reach or could never
 * order.
 *
 * `SMOKE_CLOCK` is the one place the pin lives: 2026-09-12 12:00:00 local
 * time -- a Saturday, after `RICH`'s last season game (2026-08-01), and
 * already in the past, so a missing/unregistered clock script can never pass
 * a date-sensitive check by luck.
 *
 * `smokeToday()` is the Node-side half: a real `Date` for the same pinned
 * moment, so `three-days.mjs` and `card-at-32.mjs` compute "today" from this
 * rather than from `new Date()`, and therefore never disagree with the page
 * even if the host's real clock crosses midnight mid-run.
 *
 * `buildClockScript` is the pure page-script builder, the same shape
 * `smoke-font.mjs`'s `buildFontInjectionScript` uses: a function of its
 * input, proved by running the returned text in a `vm` sandbox
 * (`test/smoke-clock.test.js`), never by reading it as source text. The
 * script it returns: saves the real `Date` as `RealDate`, records
 * `RealDate.now()` at that instant as `anchor`, and replaces `globalThis.Date`
 * with a subclass named `Date` (so `Date.name` still reads "Date") where
 * `new Date()` with no arguments and `Date.now()` return
 * `pinStart + (RealDate.now() - anchor)`. `pinStart` is built from local
 * parts (`new RealDate(y, m - 1, d, h)`), so it is noon in whatever time zone
 * Chrome runs in -- the same zone Node runs in on this machine, since both
 * read the host's own timezone database. Every other constructor form,
 * `Date.UTC`, `Date.parse` and the prototype are inherited from `RealDate`
 * untouched, and `instanceof` still works because it is a real subclass. */

export const SMOKE_CLOCK = { y: 2026, m: 9, d: 12, h: 12 };

/** A Node `Date` for the pinned moment, in local time -- what Node-side
 * fixture code calls instead of `new Date()`. */
export function smokeToday() {
  const { y, m, d, h } = SMOKE_CLOCK;
  return new Date(y, m - 1, d, h);
}

/** The pure script builder. `pin` is `{ y, m, d, h }` (`SMOKE_CLOCK`'s own
 * shape); the returned string is a full IIFE ready for
 * `Page.addScriptToEvaluateOnNewDocument`. */
export function buildClockScript({ y, m, d, h }) {
  return `(() => {
  const RealDate = Date;
  const anchor = RealDate.now();
  const pinStart = new RealDate(${y}, ${m - 1}, ${d}, ${h}).getTime();
  // A named CLASS EXPRESSION, not a class declaration: a declared
  // \`class Date extends RealDate\` is hoisted (TDZ) across this whole block,
  // which would shadow the \`Date\` the "const RealDate = Date" line above
  // reads -- even though that line comes first, textually -- and throw
  // "Cannot access 'Date' before initialization". An expression's own name
  // only binds inside its own body (for self-reference), not the
  // surrounding scope, so it still sets \`.name\` to "Date" without shadowing
  // anything above it.
  const SmokeDate = class Date extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(pinStart + (RealDate.now() - anchor));
      else super(...args);
    }
    static now() { return pinStart + (RealDate.now() - anchor); }
  };
  globalThis.Date = SmokeDate;
})();`;
}

export const CLOCK_SCRIPT = buildClockScript(SMOKE_CLOCK);
