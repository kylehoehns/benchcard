/* #358: how a smoke row's `{ pass, detail }` is built. A probe records its
 * checks into a recorder (`ctx.rec`) and `runCheck` judges from it, so no
 * probe keeps its own `ck`/`problems`/catch. The limit, the separator and the
 * empty and throw rules live here and nowhere else.
 *
 *   rec.check(cond, msg)  records a failure when cond is falsy; returns cond
 *   rec.fail(msg)         records a failure
 *   rec.ok(detail)        the detail shown when every check passed
 *
 * A probe that records no check fails: a list that came back empty must not
 * pass by having nothing to measure. */
const LIMIT = 5;
const SEP = ' | ';

export function recorder() {
  const rec = {
    checks: 0,
    failures: [],
    detail: null,
    check(cond, msg) { rec.checks++; if (!cond) rec.failures.push(msg); return cond; },
    fail(msg) { rec.checks++; rec.failures.push(msg); },
    ok(detail) { rec.detail = detail; },
  };
  return rec;
}

/* A view of `rec` whose failures read `<prefix>: <msg>`, for a pass that runs
 * the same checks once per theme or size. Checks count on the real recorder. */
export function scoped(rec, prefix) {
  return {
    check: (cond, msg) => rec.check(cond, `${prefix}: ${msg}`),
    fail: msg => rec.fail(`${prefix}: ${msg}`),
  };
}

/* An error's first line: a stack or a CDP dump is not a verdict detail. */
export const firstLine = e => String(e?.message ?? e).split('\n')[0];

export function verdict(rec, thrown) {
  const shown = rec.failures.slice(0, LIMIT);
  if (rec.failures.length > LIMIT) shown.push('…');
  if (thrown) shown.push(`threw: ${firstLine(thrown)}`);
  if (shown.length) return { pass: false, detail: shown.join(SEP) };
  if (!rec.checks) return { pass: false, detail: 'the probe checked nothing' };
  return { pass: true, detail: rec.detail ?? `${rec.checks} check(s) passed` };
}

/* What a row returned, judged with what it recorded. A row that returns its
 * own `{ pass, detail }` (narrow, sweep) stands as it is. One that also
 * recorded cannot be rescued by its own `pass: true`: a recorded failure
 * fails the row, and then the recorder's detail is the one shown. */
export function rowResult(result, rec) {
  if (typeof result?.pass !== 'boolean') return verdict(rec);
  if (!rec.checks) return result;
  const v = verdict(rec);
  return v.pass ? result : v;
}
