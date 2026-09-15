/* Shared with analytics.test.js and team-tab-copy.test.js -- not a *.test.js
   file itself, so `node --test`'s default discovery leaves it alone (proven:
   an empty `test/_dummy_helper.js` produced no `not ok` and no test count
   change under `node --test --test-reporter=tap` with no path argument).

   One tokenizer, because a second hand-rolled comment/string scanner is
   exactly the "one answer lives in one place" defect AGENTS.md's front matter
   names as the one that has cost this repo the most: team-tab-copy.test.js
   used to carry its own cruder `stripJsComments`, which read a `//` right
   after a `"` (a protocol-relative URL's `//` inside a string) as a real
   comment and silently deleted the rest of the line -- including the very
   phrase the guard existed to catch. This tokenizer already gets that case
   right, because it tracks string/template state instead of scanning `//`
   over the raw text. */

/* The text a JS module can put on the screen: every string and template
   literal, with the code around them left behind. A scanner, not a parser,
   but it has to keep four things apart or it reads the wrong text --
   `//` inside 'https://...' is not a comment; `"` inside a regex is not a
   quote (season-view.js:177 is literally /[",\r\n]|^\s|\s$/, and mistaking it
   for a string swallows the next forty characters of code); a template can
   nest another template inside `${}` (app.js:265, engine.js:1381); and `/`
   after `return` opens a regex while `/` after `)` divides.

   COMMENTS ARE DROPPED, on purpose and for the third time in this repo: a
   guard that scores its own explanatory comment has shipped twice, and
   app.js:336 carries the narrow claim in a comment precisely so the next
   reader knows why `payload` is shaped the way it is. Prose ABOUT the code is
   not text ON the page. */
export function jsStrings(src) {
  const OPENS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>']);
  const KEYWORDS = new Set(['return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await', 'new', 'delete', 'void', 'instanceof']);
  const lastTok = (t, at) => {
    let j = at - 1;
    while (j >= 0 && /\s/.test(t[j])) j--;
    if (j < 0) return '';
    if (!/[\w$]/.test(t[j])) return t[j];
    let k = j;
    while (k >= 0 && /[\w$]/.test(t[k])) k--;
    return t.slice(k + 1, j + 1);
  };
  // an escape becomes the character it stands for, and \n \t \r become the
  // whitespace they are -- so a claim broken across a `\n` still reads as one
  const unesc = (c) => ('ntr'.includes(c) ? ' ' : c);
  const out = [];
  const frames = [{ t: 'code', d: 0 }];
  let i = 0;
  while (i < src.length) {
    const f = frames[frames.length - 1];
    const c = src[i], d = src[i + 1];
    if (f.t === 'tmpl') {
      if (c === '\\') { f.buf += unesc(d); i += 2; continue; }
      if (c === '`') { out.push(f.buf); frames.pop(); i++; continue; }
      // an interpolation reads as a space: `Nothing ${x} leaves your device`
      // is still one sentence to whoever reads it off the screen
      if (c === '$' && d === '{') { f.buf += ' '; frames.push({ t: 'code', d: 0 }); i += 2; continue; }
      f.buf += c; i++; continue;
    }
    if (c === '/' && d === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/') {
      const tok = lastTok(src, i);
      if (!OPENS.has(tok) && !KEYWORDS.has(tok)) { i++; continue; }   // division
      i++;
      let cls = false;
      while (i < src.length) {
        const r = src[i];
        if (r === '\\') { i += 2; continue; }
        if (r === '\n') break;
        if (r === '[') cls = true;
        else if (r === ']') cls = false;
        else if (r === '/' && !cls) { i++; break; }
        i++;
      }
      while (i < src.length && /[a-z]/.test(src[i])) i++;                // flags
      continue;
    }
    if (c === '"' || c === "'") {
      let buf = '';
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') { buf += unesc(src[i + 1]); i += 2; continue; }
        if (src[i] === '\n') break;                                     // resync
        buf += src[i++];
      }
      i++; out.push(buf); continue;
    }
    if (c === '`') { frames.push({ t: 'tmpl', buf: '' }); i++; continue; }
    if (c === '{') { f.d++; i++; continue; }
    if (c === '}') {
      if (f.d === 0 && frames.length > 1) { frames.pop(); i++; continue; }
      f.d--; i++; continue;
    }
    i++;
  }
  return out;
}
