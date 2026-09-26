import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/* Every class name the app emits, against every rule the app loads.
 *
 * This exists because of a bug that shipped in the first commit and survived
 * nineteen months: `renderPlanTable` emitted `.mrow`, `.nm`, `.track`, `.v`,
 * `.heavy` and `.light` for the per-game minute bars and *no stylesheet ever
 * carried a rule for any of them*, so the chart rendered as a stacked column
 * of names and numbers with an invisible full-width div between each pair. It
 * hid inside a closed `<details>`, where no screenshot ever caught it and no
 * test ever looked.
 *
 * That is a class of bug, not one bug: this app has no build step, so a class
 * name is a string in one file hoping for a rule in another, and nothing
 * checks the hope. The 2026-08-24 sweep found four more (`.boot`, `.missed`,
 * `.resuming`, `.bal-empty`) and one real layout bug (`.mini`, which made the
 * Minutes-limit editor a four-row stack). This test is what stops the sixth.
 *
 * The first test's scope, deliberately: only the shell (`index.html` +
 * `app/*.js`) against the three sheets it links. The standalone pages carry
 * their own inline <style> instead, and THIS FILE USED TO SAY THEY "were swept
 * by hand" -- which was true once and then quietly became the reason nobody
 * noticed A20 slice 3 orphaning ~8 KB of `about.html`'s sheet when it removed
 * four figures. A hand sweep is not a guard. The second half of this file is
 * the sweep, run per page, in both directions.
 *
 * Only the precise emission shapes are scanned -- a leading class literal, a
 * `class="..."` attribute, `classList` arguments -- plus the codebase's own
 * concatenation idiom, `'row' + (cond ? ' heavy' : ' light')`, where a class
 * fragment is a quoted string that begins with a space. Dynamic names built
 * some other way slip past, and that is fine: the point is to catch the shape
 * the bug actually took, not to prove a negative.
 */

const ROOT = new URL('../app/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');

/* Classes that are real and rule-less on purpose: JS reads them as selectors
 * or writes through them, and the styling is somebody else's job. Anything
 * added here needs a reason on the line, or the next sweep cannot tell a hook
 * from the next invisible chart. */
const HOOKS = new Set([
  'ab-lab',      // card.js swaps the bench button's label text through it
  'card-copy',   // styled as `.stage .card-copy`; share.js strips it from clones
  'mv',          // strategy.js writes the projected minutes into it
  'paste-open',  // app.js binds the restore box's disclosure
  'paste-text',  // app.js reads the pasted backup; `textarea` styles it
  'paste-go',    // app.js binds the restore button
  'rgrip',       // roster-view.js selects the arrows APART from the grip
                 // (`.obtn:not(.rgrip)`); `.obtn` is what styles all three
  'fr-gran',     // #145 item 1: its own spacing rule is gone (subsumed into
                 // `.flow-body > div > *`), but onboarding.js still needs the
                 // box `paintGranRows` fills, and first-run-flow.mjs's smoke
                 // check still finds its rows through `.fr-gran .sheetrow`.
]);

const stripJsComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n').map((l) => l.replace(/(^|[^:'"`\\])\/\/.*$/, '$1')).join('\n');

/* Nothing on disk changes while this file runs, so each reader below reads
   the tree once. `shellSweep` alone runs four times, and before this each
   call re-read index.html and every `app/*.js` twice over. The one test that
   needs a mutated sheet builds its own `[name, source]` pairs and hands them
   straight to `shellSweep`, so it never reaches the memo. */
const memo = (fn) => { let v; return () => (v === undefined ? (v = fn()) : v); };

/* The scripts the shell can put a class from: every `app/*.js` except
   `sw.js`, which serves bytes and never touches the DOM. `emitted()` below
   and `shellUses()` further down both want that list, so it is spelled once,
   the way `shellSheets()` spells the sheet list once for the two sweeps that
   want it. */
const shellScripts = memo(() => readdirSync(new URL('.', ROOT)).filter((f) => f.endsWith('.js') && f !== 'sw.js'));

const emitted = memo(() => {
  const files = ['index.html', ...shellScripts()];
  const found = new Map();
  const add = (c, where) => {
    if (!c || !/^[a-zA-Z_-][\w-]*$/.test(c)) return;
    if (!found.has(c)) found.set(c, where);
  };
  for (const f of files) {
    const src = f.endsWith('.js') ? stripJsComments(read(f)) : read(f);
    src.split('\n').forEach((line, i) => {
      const where = `${f}:${i + 1}`;
      let m;
      const literal = [
        /\bclass\s*=\s*["']([^"']*)["']/g,                     // <div class="a b">
        /\bel\(\s*["'][^"']*["']\s*,\s*["'`]([^"'`]*)["'`]/g,    // el('div', 'a b')
        /className\s*=\s*["'`]([^"'`]*)["'`]/g,                 // n.className = 'a b'
        /setAttribute\(\s*["']class["']\s*,\s*["'`]([^"'`]*)["'`]/g,
      ];
      for (const re of literal) {
        while ((m = re.exec(line))) m[1].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).forEach((c) => add(c, where));
      }
      /* `toggle(cls, cond)` puts an expression in the second argument, and
         `v === 'settings'` is not a class name -- so read only the first. */
      const cl = /classList\.(?:add|remove|contains|replace)\(([^)]*)\)|classList\.toggle\(\s*(["'][^"']*["'])/g;
      while ((m = cl.exec(line))) {
        let n; const q = /["']([^"']+)["']/g;
        while ((n = q.exec(m[1] ?? m[2]))) n[1].split(/\s+/).forEach((c) => add(c, where));
      }
      /* `'srow' + (locked ? ' locked' : '')` -- a class fragment is a quoted
         string holding one leading space and one token, which prose never is
         (`' tap who comes off first'` has spaces inside it). Only on lines
         that are already building a class. */
      if (/\bel\(|className\s*=|classList\./.test(line)) {
        let n; const frag = /["'`]\s+([a-zA-Z][\w-]*)["'`]/g;
        while ((n = frag.exec(line))) add(n[1], where);
      }
    });
  }
  return found;
});

/* The sheets `index.html` links, as `[name, source]`. Both shell sweeps in
   this file want them -- one for the rules they carry, the other for the
   classes those rules name -- so which sheets the shell loads is read out of
   the markup once, here. */
const shellSheets = memo(() =>
  [...read('index.html').matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)]
    .map((m) => [m[1], read(m[1])]));

function styled() {
  const html = read('index.html');
  /* The noscript block is a stylesheet too -- `.app` is only ever styled
     there, and a sweep that ignored it would report a false positive. */
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  const css = [...shellSheets().map(([, src]) => src), ...inline].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const set = new Set();
  let m; const re = /\.(-?[a-zA-Z_][\w-]*)/g;
  while ((m = re.exec(css))) set.add(m[1]);
  return set;
}

test('every class name the app emits has a rule somewhere, or is a declared hook', () => {
  const rules = styled();
  const orphans = [...emitted()].filter(([c]) => !rules.has(c) && !HOOKS.has(c));
  assert.deepEqual(
    orphans.map(([c, where]) => `.${c} (${where})`),
    [],
    'class names emitted with no CSS rule anywhere. Either style them, delete them, or add them to HOOKS with the reason.',
  );
});

test('the sweep can actually see the bug it was written for', () => {
  // If the scanner ever stops finding the minute-bar classes, it has gone
  // blind and the test above is passing for the wrong reason.
  const found = emitted();
  for (const c of ['mrow', 'track', 'heavy', 'light']) {
    assert.ok(found.has(c), `${c} should be visible to the emission scanner`);
  }
  const rules = styled();
  for (const c of ['mrow', 'track', 'heavy', 'light']) {
    assert.ok(rules.has(c), `${c} should have a rule -- it is the bug this file exists for`);
  }
});

test('the declared hooks are all still emitted, so the list cannot rot', () => {
  const found = emitted();
  for (const c of HOOKS) assert.ok(found.has(c), `HOOKS lists .${c} but nothing emits it any more`);
});

/* ------------------------------------------------------------------ *
 * The standalone pages: one document, one inline sheet, both ways.
 *
 * `about.html`, `advanced.html` and the six roster-size pages are each a
 * single document with a single inline <style>, which makes the question
 * decidable in a way it is not for the shell: the classes that sheet DEFINES,
 * minus the classes the markup uses, minus the ones the page's own inline
 * script adds, is exactly the set of rules nothing can reach. Slice 3 left 8,363
 * bytes of such rules on `about.html` -- `.paper`, `.stint`, `.chg`, `.five`,
 * `.legend`, every `.bal-*` and `.sn-*`, `.switch`, `.seasonadj` -- and a
 * hand-written script, not CI, is what found them.
 *
 * THE SCRIPT-ADDED PAIR IS THE WHOLE REASON A NAIVE SWEEP WOULD BE WRONG.
 * `about.html` styles `.js .reveal` and `.reveal.in`, and neither `js` nor
 * `in` appears in a single `class="..."` in the file -- both are written by
 * the page's own inline script. Read the scripts, or the guard's first act is
 * to delete the reveal animation. Pinned by a test below.
 *
 * `index.html` is deliberately excluded: its classes come from `app/*.js`,
 * which is what the first test in this file already sweeps.
 * ------------------------------------------------------------------ */

const STANDALONE = readdirSync(new URL('.', ROOT))
  .filter((f) => f.endsWith('.html') && f !== 'index.html');

const inlineSheet = (html) =>
  [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

/* Class names in SELECTOR position only -- the same reading `css-collide`
   uses, and for the same reason: every `.name` in the file would also catch
   names quoted inside `content:`. */
function selectorClasses(css) {
  const found = new Map();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of clean.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].split(';').pop().trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@')) continue;
    for (const c of sel.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) {
      if (!found.has(c[1])) found.set(c[1], sel);
    }
  }
  return found;
}

/* What the page can actually put on an element: its `class` attributes, plus
   whatever its own inline scripts add. The <style> block is cut out first so a
   selector never counts as a use of itself. */
function pageUses(html) {
  const set = new Set();
  const body = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ');
  for (const m of body.matchAll(/\bclass="([^"]*)"/g)) {
    m[1].split(/\s+/).forEach((c) => c && set.add(c));
  }
  for (const s of body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    const re = /classList\.(?:add|remove|toggle|contains|replace)\(\s*['"]([^'"]+)['"]/g;
    for (const m of s[1].matchAll(re)) set.add(m[1]);
    for (const m of s[1].matchAll(/className\s*=\s*['"]([^'"]*)['"]/g)) {
      m[1].split(/\s+/).forEach((c) => c && set.add(c));
    }
  }
  return set;
}

const linkedClasses = (html) => {
  const set = new Set();
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="\.\/([\w.-]+\.css)"/g)) {
    for (const c of selectorClasses(read(m[1])).keys()) set.add(c);
  }
  return set;
};

function sweep(html) {
  const defined = selectorClasses(inlineSheet(html));
  const uses = pageUses(html);
  const linked = linkedClasses(html);
  return {
    defined,
    dead: [...defined].filter(([c]) => !uses.has(c)).map(([c, sel]) => `.${c} (${sel})`),
    unstyled: [...uses].filter((c) => !defined.has(c) && !linked.has(c)).map((c) => `.${c}`),
  };
}

test('no standalone page carries a rule for a class it never puts on an element', () => {
  for (const page of STANDALONE) {
    assert.deepEqual(sweep(read(page)).dead, [],
      `${page}'s inline stylesheet has rules nothing can reach. Delete them, or `
      + 'use the class.');
  }
});

test('no standalone page uses a class that no stylesheet it loads defines', () => {
  for (const page of STANDALONE) {
    assert.deepEqual(sweep(read(page)).unstyled, [],
      `${page} puts a class on an element that neither its own sheet nor the `
      + 'sheets it links ever style.');
  }
});

test('the standalone sweep can see a rule nobody uses', () => {
  const html = read('about.html').replace('</style>', '.zz-orphan { color: red }\n</style>');
  assert.ok(sweep(html).dead.some((d) => d.startsWith('.zz-orphan')),
    'a rule for a class no element carries must be reported');
});

test('the standalone sweep can see an element nobody styles', () => {
  const html = read('advanced.html').replace('</body>', '<p class="zz-nostyle">x</p></body>');
  assert.ok(sweep(html).unstyled.includes('.zz-nostyle'),
    'a class with no rule on any sheet the page loads must be reported');
});

/* The naive-sweep trap, pinned in both directions. */
test('classes a page\'s own script adds count as uses, and .js/.in are the proof', () => {
  const html = read('about.html');
  const uses = pageUses(html);
  for (const c of ['js', 'in']) {
    assert.ok(uses.has(c), `.${c} is added by about.html's inline script and must count as used`);
    assert.ok(!/class="[^"]*\b(js|in)\b[^"]*"/.test(html.replace(/<style[\s\S]*?<\/style>/, '')),
      `.${c} must not be reachable from a class attribute, or this test proves nothing`);
    assert.ok(sweep(html).defined.has(c), `about.html should still style .${c}`);
  }
  /* Blind the script reader and the reveal animation's rules go dead -- which
     is what a sweep that only read markup would have reported on day one. */
  const noScript = html.replace(/classList\.add\('js'\)/, '0');
  assert.ok(sweep(noScript).dead.some((d) => d.startsWith('.js ')),
    'with the script-added class gone, .js must be reported dead');
});

/* ------------------------------------------------------------------ *
 * The shell, the other way round.
 *
 * The first test in this file asks "does every class the shell emits have a
 * rule?". Nobody asked the reverse, so a rule whose markup was deleted just
 * sat in the sheet: the #37 sweep found the old minutes-budget action row
 * (`.budget-acts`), the old Rules fold's inline editor (`.ruleedit` and its
 * `.mini`, `.rule-switches`), the fold chrome itself (`.fold`), the
 * zero-count pill on a fold summary, and two boxes earlier tickets deleted
 * outright (`.surface`, `.squad`) still styled and unreachable. The
 * standalone half above already runs this direction per page; this asks the
 * same question of the three sheets `index.html` links.
 *
 * A class counts as used if `index.html` or an `app/*.html` page puts it in a
 * `class` attribute, if `emitted()` above can see it, or if it appears as a
 * token in a quoted string in any shell script -- `'plr press ' + (on ? 'on'
 * : 'off')` and `querySelectorAll('.rrow')` are both real emission idioms
 * that no attribute and no `el()` call spells out. Reading every string is
 * deliberately generous: a false "used" leaves one dead rule in place, while
 * a false "unused" deletes a rule a coach can see. Template interpolations
 * are cut first, since `${shape.count}` is code, not a class name.
 *
 * The allow list starts empty, and should stay that way: a class this sweep
 * calls dead when it is not needs a line here with the reason, the way HOOKS
 * carries the reason for the other direction.
 * ------------------------------------------------------------------ */

const SHELL_KEEP = new Map([]);

/* Every whitespace-separated token, and every `.name` inside a selector, of
   every quoted string in a script. */
function stringTokens(src, add) {
  for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
    const lit = (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ');
    lit.split(/\s+/).forEach(add);
    for (const c of lit.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) add(c[1]);
  }
}

const shellUses = memo(() => {
  const set = new Set(emitted().keys());
  const add = (t) => { if (/^-?[a-zA-Z_][\w-]*$/.test(t)) set.add(t); };
  for (const f of shellScripts()) stringTokens(stripJsComments(read(f)), add);
  for (const f of readdirSync(new URL('.', ROOT))) {
    if (!f.endsWith('.html')) continue;
    /* A selector is not a use, so the page's own sheet is cut out first --
       the same reading `pageUses` takes. Comments go too, which is why this
       does not simply call `pageUses`: a class left behind in commented-out
       markup must not count as a use. */
    const body = read(f).replace(/<style[^>]*>[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    for (const m of body.matchAll(/\bclass="([^"]*)"/g)) m[1].split(/\s+/).forEach(add);
    for (const s of body.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
      stringTokens(stripJsComments(s[1]), add);
    }
  }
  return set;
});

function shellSweep(sheets = shellSheets()) {
  const uses = shellUses();
  const defined = new Map();
  const dead = new Map();
  for (const [file, css] of sheets) {
    for (const [c, sel] of selectorClasses(css)) {
      if (!defined.has(c)) defined.set(c, `${file}: ${sel}`);
      if (uses.has(c) || SHELL_KEEP.has(c) || dead.has(c)) continue;
      dead.set(c, `.${c} (${file}: ${sel})`);
    }
  }
  return { defined, dead: [...dead.values()] };
}

test('no shell stylesheet carries a rule for a class nothing can put on an element', () => {
  const { defined, dead } = shellSweep();
  assert.ok(defined.size > 300, `the shell sheets define ${defined.size} classes -- the sweep read nothing`);
  assert.deepEqual(dead, [],
    'the sheets index.html links carry rules no shell file and no standalone page can reach. '
    + 'Delete them, or add the class to SHELL_KEEP with the reason.');
});

/* The two idioms a `class="..."` reader would miss, pinned: neither class is
   ever written as a literal attribute, so a sweep that only read markup
   would have called both dead and somebody would have deleted the rules. */
test('classes built by concatenation or read back as a selector count as uses', () => {
  const uses = shellUses();
  const shellSrc = shellScripts().map((f) => read(f)).join('\n');
  for (const c of ['off', 'rrow']) {
    assert.ok(uses.has(c), `.${c} is emitted by a script and must count as used`);
    assert.ok(!new RegExp(`class="[^"]*\\b${c}\\b`).test(read('index.html')),
      `.${c} must not be reachable from a class attribute, or this test proves nothing`);
    assert.ok(new RegExp(`\\b${c}\\b`).test(shellSrc), `.${c} must still be built by a shell script`);
  }
  const blind = shellSweep().dead;
  assert.ok(!blind.some((d) => d.startsWith('.off ') || d.startsWith('.rrow ')),
    'neither class may be reported dead while the scripts still build them');
});

/* Once per sheet, not once for `app.css`: the sweep walks `sheets` in a loop
   and its bite on the other two was never shown. `tokens.css` and `card.css`
   are much smaller than `app.css`, so "the loop only really ran on the first
   one" is exactly the failure this would not have caught. */
test('the shell sweep can see a rule nobody uses, in every sheet it reads', () => {
  const sheets = shellSheets();
  assert.equal(sheets.length, 3, `index.html links ${sheets.length} sheets -- the reader found the wrong set`);
  for (const [target] of sheets) {
    const orphan = `zz-orphan-${target.replace(/\W/g, '-')}`;
    const injected = sheets.map(([f, css]) =>
      (f === target ? [f, `${css}\n.${orphan} { color: red }\n`] : [f, css]));
    const dead = shellSweep(injected).dead;
    assert.ok(dead.some((d) => d.startsWith(`.${orphan} (${target}:`)),
      `a rule in ${target} for a class no element carries must be reported, and named to ${target}`);
  }
});

test('the standalone sweep is reading real sheets, not an empty set', () => {
  const about = sweep(read('about.html'));
  const advanced = sweep(read('advanced.html'));
  assert.ok(about.defined.size > 40, `about.html defines ${about.defined.size} classes`);
  assert.ok(advanced.defined.size > 40, `advanced.html defines ${advanced.defined.size} classes`);
  /* The slice-3 orphans, pinned gone: these belong to the figures that moved
     to `advanced.html`, and about.html must never define them again. */
  for (const c of ['paper', 'stint', 'bal-row', 'sn-row', 'seasonadj', 'legend']) {
    assert.ok(!about.defined.has(c), `about.html defines .${c} again -- it moved to advanced.html`);
  }
});
