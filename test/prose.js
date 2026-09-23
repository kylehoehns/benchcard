/* #14. This repo hard-wraps prose at about 78 columns, so a phrase can split
   across two lines. A search that reads one line at a time cannot see a
   wrapped phrase -- `#help`'s lede read "Everything stays on this device"
   for months and passed a "must not contain the old wording" check because
   the markup wrapped between "this" and "device" and the check wanted a
   literal space.

   `flat` is the one flattener in this repo (`one-answer.test.js` had its own
   copy; `analytics.test.js`'s `claim()` makes the same `\s+` move for
   building a pattern rather than testing absence, and stays as it is).
   `lacks(text, phrase)` is the "must not contain" check built on it: a
   string phrase is flattened and matched against the flattened text; a
   RegExp phrase is rebuilt with each literal space in its source turned into
   `\s+` (flags kept) and matched against the raw text, so it still catches a
   phrase that wraps without needing `text` flattened first.

   `wrapSafe` is that one rewrite (a regex SOURCE string in, a wrap-tolerant
   source string out): every literal space becomes `\s+`. `lacks` uses it to
   rebuild a RegExp phrase, and `analytics.test.js`'s `claim()` uses it to
   build its four ABSOLUTE patterns -- the same move, written once. */
export const flat = s => s.replace(/\s+/g, ' ');

export const wrapSafe = source => source.replace(/ /g, '\\s+');

export function lacks(text, phrase) {
  if (phrase instanceof RegExp) {
    const wrapped = new RegExp(wrapSafe(phrase.source), phrase.flags);
    return !wrapped.test(text);
  }
  return !flat(text).includes(flat(phrase));
}
