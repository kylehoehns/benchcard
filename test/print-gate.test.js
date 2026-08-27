import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Nothing that prints or shares may be tappable while the plan is blocked.
 *
 * A blocked plan renders no `.sheet`, so Print produces a page of furniture and
 * no card -- paper spent, and only discovered at the printer -- and Share has
 * no card to turn into an image. That was found and fixed once, on `#print`
 * and `#shareCard`, and stayed live for months on `#abCard`: the action bar's
 * printer, which is the one a coach actually taps on a phone. Three controls
 * for two actions, each remembering the rule separately.
 *
 * So this test refuses to name them. It DISCOVERS the controls by role --
 * every element bound to a handler that reaches `window.print()` or
 * `shareCards()` -- and then asserts each one carries the `data-needs-card`
 * attribute that `card.js` sweeps. A hard-coded list of ids here would be the
 * same fragility rewritten as a test: it would go stale on exactly the case
 * that matters, the fourth control somebody adds.
 *
 * Source-level, like plan-table and note-placement: no DOM, and it holds for
 * every state rather than the one a rendered check happened to be given.
 */

const read = f => readFileSync(new URL(`../app/${f}`, import.meta.url), 'utf8');
const app = read('app.js');
const cardJs = read('card.js');
const html = read('index.html').replace(/<!--[\s\S]*?-->/g, '');

const GATE = 'data-needs-card';

/* Every `on('#sel', 'onev', handler)` binding in `app.js`, with the handler's
   own text: scan forward from the call balancing parentheses, so the body ends
   where the call ends rather than where the next binding starts. Crude on
   purpose -- it needs no parser -- but it must not err wide, or a handler
   would inherit the next one's body and the test would pass by accident. */
function bindings(src) {
  const out = [];
  const re = /^on\(\s*'([^']+)'\s*,\s*'(on\w+)'\s*,/gm;
  for (const m of src.matchAll(re)) {
    let depth = 1, i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
    }
    out.push({ sel: m[1], event: m[2], body: src.slice(m.index + m[0].length, i) });
  }
  return out;
}

/* A handler "prints or shares" if its body calls one of the sinks, or names a
   function whose body does. One hop is enough for this app (`printCard`) and
   more hops would need a real parser; if a second level ever appears, the
   inner function shows up here as an unresolved name and the test says so. */
function sinkNames(src) {
  const names = new Set(['window.print', 'shareCards']);
  const fn = /^function (\w+)\(\)[\s\S]*?\n}/gm;
  for (const m of src.matchAll(fn)) {
    if (/\bwindow\.print\(|\bshareCards\(/.test(m[0])) names.add(m[1]);
  }
  return names;
}

/* Named as the handler (`on('#print', 'onclick', printCard)`) or called inside
   an inline one -- both count as triggering the action. */
const SINKS = sinkNames(app);
const triggers = bindings(app).filter(b =>
  [...SINKS].some(n => new RegExp(`(^|[^.\\w])${n.replace('.', '\\.')}\\b`).test(b.body)));

// Attributes of the element carrying a given id, read out of the markup.
function attrsOf(id) {
  const m = html.match(new RegExp(`<[a-zA-Z][^>]*\\bid\\s*=\\s*"${id}"[^>]*>`));
  return m ? m[0] : null;
}

test('the discovery actually found the print and share controls', () => {
  assert.ok(SINKS.has('printCard'),
    'no function reaching window.print() was found in app.js — the walker is broken, not the app');
  assert.ok(triggers.length >= 3,
    `only ${triggers.length} print/share trigger(s) discovered (${triggers.map(t => t.sel).join(', ')}) — `
    + 'the app has at least three; the walker has stopped seeing them');
});

test('every control that prints or shares is gated on a plan being printable', () => {
  const ungated = [];
  for (const t of triggers) {
    const id = t.sel.startsWith('#') ? t.sel.slice(1) : null;
    if (!id) { ungated.push(`${t.sel} (not an id — cannot check the markup)`); continue; }
    const tag = attrsOf(id);
    if (!tag) { ungated.push(`${t.sel} (no such element in index.html)`); continue; }
    if (!new RegExp(`\\b${GATE}\\b`).test(tag)) ungated.push(t.sel);
  }
  assert.deepEqual(ungated, [],
    `these trigger print or share but do not carry ${GATE}, so a blocked plan leaves them live: `
    + `${ungated.join(', ')}. Add the attribute — do not add another set() call.`);
});

test('card.js gates every control carrying the attribute, from one place', () => {
  const sweep = new RegExp(`querySelectorAll\\(\\s*'\\[${GATE}\\]'\\s*\\)`);
  assert.match(cardJs, sweep,
    `card.js must sweep [${GATE}] rather than disabling controls one id at a time`);
  // The sweep has to set `disabled` from `blocked`, not merely find the nodes.
  const after = cardJs.slice(cardJs.search(sweep));
  assert.match(after.slice(0, 300), /\.disabled\s*=\s*blocked/,
    'the sweep must set disabled from the blocked flag');
  /* And no id may be gated by hand alongside it: that is how the rule split in
     two the first time. `#regen` and `#abBench` are gated for their own
     reasons and are not print/share controls. */
  for (const t of triggers) {
    const id = t.sel;
    assert.doesNotMatch(cardJs, new RegExp(`set\\(\\s*'${id}'\\s*,\\s*'disabled'`),
      `${id} is gated by its own set() call as well as by the sweep — one rule, one place`);
  }
});

test('the keyboard shortcut prints through the gated button, not around it', () => {
  const keys = read('shortcuts.js');
  assert.doesNotMatch(keys, /window\.print\s*\(/,
    'shortcuts.js calls window.print() directly, so the `p` key would bypass the disabled button');
  assert.match(keys, /\$\('#print'\)\.click\(\)/,
    'the `p` shortcut must click #print so it inherits whatever disables that button');
});

test('the gate attribute is not sprinkled on things that do not print', () => {
  const carriers = [...html.matchAll(new RegExp(`<[a-zA-Z][^>]*\\b${GATE}\\b[^>]*>`, 'g'))]
    .map(m => (m[0].match(/\bid\s*=\s*"([^"]*)"/) || [, '?'])[1]);
  const wanted = triggers.map(t => t.sel.slice(1)).sort();
  assert.deepEqual(carriers.sort(), wanted,
    'the set of elements carrying the gate must be exactly the set that prints or shares');
});
