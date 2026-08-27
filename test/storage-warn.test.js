import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The save-failure banner has to be in the SHELL.
 *
 * `storage.js` says of `saveState` that it "returns a reason string on failure
 * rather than swallowing it -- a full quota that silently stops saving is the
 * worst possible outcome here", and `state.js` turns that string into
 * "Changes are not being saved — …" in `#storagewarn`. That contract only
 * holds if the box is on screen wherever the coach is editing. For months it
 * was not: `#storagewarn` sat inside `<main id="view-games">`, and the other
 * three views hide that main outright. Measured 2026-08-25 at 390x844 with a
 * throwing `localStorage.setItem`: adding a player from the Roster view put
 * the exact words "Changes are not being saved — storage is full." into the
 * DOM at 0x0 with `checkVisibility` false, the twelfth row visible on screen
 * and eleven players in storage. `role="status"` was dead in the same breath,
 * because a live region inside a `hidden` subtree announces nothing.
 *
 * These are structural checks on the markup because that is where the defect
 * lived -- nothing about the rendering code was wrong. Comments are stripped
 * first: the element's own explanation names `<main>` and every id below, and
 * a guard that its own documentation can satisfy is not a guard. */
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '');

const WARN = /<div id="storagewarn"[^>]*>/;

test('the storage warning box exists and is a live region', () => {
  const m = html.match(WARN);
  assert.ok(m, '#storagewarn is gone; state.js renderStorageWarning writes nowhere');
  assert.match(m[0], /role="status"/, 'the banner has to be announced, not just drawn');
  assert.match(m[0], /aria-live="polite"/);
  assert.match(m[0], /class="[^"]*\bnoprint\b/, 'a shell strip must not print on the card sheet');
});

test('the storage warning box is not inside any view', () => {
  const at = html.search(WARN);
  assert.ok(at > 0);
  /* Every view is a <main class="view …>. Walk them by their own tags rather
     than by id, so a fifth view added tomorrow is covered without an edit. */
  const mains = [...html.matchAll(/<main\b[^>]*class="[^"]*\bview\b/g)];
  assert.ok(mains.length >= 4, `expected the view mains, found ${mains.length}`);
  for (const m of mains) {
    const start = m.index;
    const end = html.indexOf('</main>', start);
    assert.ok(end > start, 'unbalanced <main>');
    const id = (html.slice(start, html.indexOf('>', start)).match(/id="([^"]+)"/) || [])[1];
    assert.ok(
      at < start || at > end,
      `#storagewarn is inside <main id="${id}">; every other view hides that main, `
      + 'so a save failure there is invisible and unannounced',
    );
  }
});

test('the shell strip is above the views, next to the team switcher', () => {
  const at = html.search(WARN);
  const firstView = html.search(/<main\b[^>]*class="[^"]*\bview\b/);
  assert.ok(at < firstView, '#storagewarn must precede the views to be shell chrome');
  assert.ok(
    html.search(/<nav[^>]*id="teamtabs"/) < at,
    '#storagewarn belongs with the other shell strip, under the team switcher',
  );
});

test('the padding rule that lets it live outside a .wrap is present', () => {
  const css = readFileSync(new URL('../app/app.css', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(
    css,
    /#storagewarn:not\(:empty\)\s*\{[^}]*padding:/,
    'outside a .wrap the banner runs edge to edge unless this rule pads it',
  );
});

/* ...and the coach has to be told where they are STANDING.
 *
 * The banner is shell chrome at the top of `.app`, which is the right place
 * for a standing record and the wrong place for news. Measured 2026-08-25 at
 * 390x844: adding a player on the Roster focuses the new row at the foot of
 * the list, so at the instant the warning appears it is at y −1277. So the
 * transition into failure also fires the toast machinery that already exists
 * for exactly this shape of event -- `render.js` does the same thing one line
 * earlier for `overridesDropped()`.
 *
 * Three things have to hold and each has been a bug in this repo before:
 * the signal is read-and-reset so it fires ONCE per failure and not once per
 * render; the toast carries the banner's own sentence so the two surfaces
 * cannot drift into two wordings of one failure; and `state.js` does not
 * import `flash` itself, because `toast.js` imports from `state.js` and that
 * would close the module graph into a cycle.
 *
 * Source-text checks, comments stripped: both files explain all of this in
 * prose that would satisfy a guard written on the names alone. */
const src = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

test('render.js flashes the save failure, and reads the signal from state.js', () => {
  const render = src('render.js');
  /* Match the CALL and the whole shape, not the identifier: a guard anchored
     on a name is satisfied by anything that mentions it. */
  const fire = render.match(/const (\w+) = (\w+)\(\);\s*if \(\1\) flash\(\1\);/);
  assert.ok(fire, 'render.js must flash the save-failure signal it reads from state.js');
  const [, , reader] = fire;
  const imports = render.match(/import \{([^}]*)\} from '\.\/state\.js';/);
  assert.ok(imports, 'render.js imports from state.js');
  assert.ok(
    imports[1].split(',').map(s => s.trim()).includes(reader),
    `render.js flashes ${reader}() but does not import it from state.js`,
  );
  assert.ok(
    render.indexOf(`${reader}()`) > render.indexOf('save();'),
    'the signal is only set by save(), so reading it before save() reads the previous render',
  );
});

test('the save-failure signal is read-and-reset, so it fires once per failure', () => {
  const state = src('state.js');
  const render = src('render.js');
  const reader = render.match(/const (\w+) = (\w+)\(\);\s*if \(\1\) flash\(\1\);/)[2];
  const decl = state.match(
    new RegExp(`export const ${reader} = \\(\\) => \\{\\s*const (\\w+) = (\\w+);\\s*\\2 = (?:''|0|null|false);\\s*return \\1;`),
  );
  assert.ok(decl, `${reader} must read its flag and clear it in the same breath`);
  const flag = decl[2];

  const from = state.indexOf('export const save = ()');
  assert.ok(from > 0, 'state.js still has a save()');
  const body = state.slice(from, state.indexOf('\n};', from));
  const guard = body.indexOf('if (problem');
  const set = body.indexOf(`${flag} =`);
  assert.ok(guard > 0, 'save() still guards on a failure reason');
  assert.ok(set > guard, `${flag} is set outside the failure branch, so it would fire on every render`);
  assert.match(
    body.slice(set),
    new RegExp(`^${flag} = storageWarning`),
    'the toast must carry the banner\'s own sentence, not a second wording of it',
  );
});

test('state.js does not import the toast, which imports state.js', () => {
  const state = src('state.js');
  assert.doesNotMatch(
    state,
    /from '\.\/toast\.js'/,
    'toast.js imports from state.js; importing it back closes the graph into a cycle',
  );
});

/* ...and every reason the loader can give has to have a sentence of its own.
 *
 * A36, 2026-08-25: `recoveredFrom` was a two-way choice and the banner was a
 * two-way ternary, so the third case -- a record that was present, readable
 * and rejected -- came out as "Your last save was missing", which is a false
 * statement about bytes sitting right there in the key. The failure mode is
 * cross-file: `storage.js` learns a new reason and `state.js` quietly keeps
 * describing it as one of the old ones. So the two lists are checked against
 * each other rather than either being written down twice. */
test('every recoveredFrom the loader can return has its own banner sentence', () => {
  const storage = src('storage.js');
  const state = src('state.js');

  const decl = storage.match(/const from = ([^;]+);/);
  assert.ok(decl, 'loadState still decides why the primary failed');
  assert.match(storage, /recoveredFrom: from/, 'and still reports it to the caller');
  const reasons = [...decl[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
  assert.ok(reasons.length >= 3, `expected the three failure reasons, found ${reasons.join()}`);

  const copy = state.match(/const RECOVERY_COPY = \{([\s\S]*?)\n\};/);
  assert.ok(copy, 'state.js still maps a reason to a sentence');
  const sentences = new Map(
    [...copy[1].matchAll(/(\w+): '([^']+)'/g)].map(m => [m[1], m[2]]),
  );
  for (const r of reasons) {
    assert.ok(sentences.has(r), `loadState can say '${r}' and the banner has no sentence for it`);
  }
  assert.equal(
    new Set(sentences.values()).size, sentences.size,
    'two reasons sharing a sentence means one of them is being described as the other',
  );
});
