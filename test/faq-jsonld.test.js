import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* about.html's FAQPage structured data, against the FAQ a reader actually sees.
 *
 * Google's condition for an FAQ rich result is that the question and the answer
 * both appear on the page. This block failed it: five entries in the JSON-LD
 * against seven `<dt>`s on the page, one of the five -- "How does it handle a
 * tournament with several games in one day?" -- with no visible counterpart at
 * all, and three of the rest paraphrases rather than the page's own answer.
 *
 * That is the same class of bug as the dead-class and dead-export sweeps: this
 * project has no build step, so the JSON-LD is a hand-typed copy of prose that
 * lives forty lines away, and nothing checked the copy. The copy sweep could
 * not have caught it either -- it checked the page's claims against the module
 * that emits them, not the structured data against the DOM.
 *
 * So the rule is the strongest one available, and deliberately not "every
 * JSON-LD entry exists somewhere on the page": the two lists must be the SAME
 * list -- same questions, same answers, same order, nothing extra on either
 * side. A subset would be legal for Google and would leave the next author
 * guessing which subset, which is how this drifted the first time.
 *
 * Everything below reads text the way a reader gets it: comments stripped,
 * tags stripped, entities decoded, whitespace collapsed. An entity this file
 * does not know fails loudly rather than comparing raw `&mdash;` against a real
 * em dash and passing for the wrong reason.
 */

const src = readFileSync(new URL('../app/about.html', import.meta.url), 'utf8');

const ENTS = {
  mdash: '—', ndash: '–', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', hellip: '…', nbsp: ' ',
  times: '×', middot: '·', amp: '&', lt: '<', gt: '>', quot: '"',
};

function text(html) {
  const t = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENTS ? ENTS[n] : m))
    .replace(/\s+/g, ' ')
    .trim();
  assert.ok(!/&[a-zA-Z]+;/.test(t),
    `unknown HTML entity in the FAQ — add it to ENTS in this test: ${t}`);
  return t;
}

/** The visible FAQ, in document order.
 *
 * A20 slice 3 made the FAQ collapsible, one `<details class="qa">` per
 * question, so this reads `<summary>` and the body rather than `<dt>`/`<dd>`.
 * The CONTRACT below did not move an inch — same questions, same answers, same
 * order, nothing extra on either side. Only the extraction changed, and it had
 * to: `<details>` is not a legal child of `<dl>`, whose content model is dt/dd
 * groups optionally wrapped in a `<div>`.
 *
 * Collapsing is safe for the rich result precisely because `<details>` keeps
 * its body in the DOM when it is shut — Google's condition is that the question
 * and the answer both appear on the page, not that they are both painted. The
 * test below pins that the answers really are in the markup rather than being
 * fetched or built by script, which is the version of this that would break it.
 */
function visible() {
  const box = src.match(/<div class="faq">([\s\S]*?)\n\s*<\/div>/);
  assert.ok(box, 'about.html has no <div class="faq"> — this guard is looking at the wrong page');
  /* `<summary>` then the rest of that `<details>`, with anything else inside it
     (the tip-link comment lives beside one) thrown away by `text`. */
  const items = [...box[1].matchAll(/<details class="qa">\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)];
  assert.ok(items.length > 0, 'no <details class="qa"> found in the visible FAQ');
  /* A `<details>` the pattern above could not read — a missing `<summary>`, a
     nested one — would silently shrink the list, and a shorter list is exactly
     the drift this file exists to catch. Count them independently. */
  assert.equal(items.length, (box[1].match(/<details\b/g) || []).length,
    'a <details> in the FAQ has no <summary> immediately inside it, so this guard cannot see its question');
  return items.map(([, q, a]) => ({ q: text(q), a: text(a) }));
}

/** The FAQPage block, in document order. */
function structured() {
  const blocks = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]));
  const faq = blocks.filter(b => b['@type'] === 'FAQPage');
  assert.equal(faq.length, 1, 'about.html should carry exactly one FAQPage block');
  const main = faq[0].mainEntity;
  assert.ok(Array.isArray(main), 'FAQPage.mainEntity must be an array of Questions');
  return main.map(e => {
    assert.equal(e['@type'], 'Question');
    assert.equal(e.acceptedAnswer?.['@type'], 'Answer');
    return { q: e.name, a: e.acceptedAnswer.text };
  });
}

test('about.html carries valid JSON-LD', () => {
  // JSON.parse in structured() is the assertion; this pins the shape around it
  const blocks = [...src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length >= 1, 'about.html should carry a JSON-LD block');
  for (const [, body] of blocks) {
    const parsed = JSON.parse(body);
    assert.equal(parsed['@context'], 'https://schema.org');
  }
});

test('every JSON-LD question is a question the page visibly asks', () => {
  const seen = new Set(visible().map(p => p.q));
  for (const { q } of structured()) {
    assert.ok(seen.has(q),
      `the FAQPage block advertises a question that is nowhere in <dl class="faq">: "${q}"`);
  }
});

test('every JSON-LD answer is word for word the answer the page gives', () => {
  const byQ = new Map(visible().map(p => [p.q, p.a]));
  for (const { q, a } of structured()) {
    const want = byQ.get(q);
    if (want === undefined) continue; // the test above owns that failure
    assert.equal(a, want,
      `the FAQPage answer to "${q}" paraphrases the page instead of quoting it`);
  }
});

test('collapsing the FAQ did not take the answers off the page', () => {
  /* The one way the collapse COULD have broken the rich result: an accordion
     that builds its answers from script, or hides them with `display: none` on
     a container rather than letting `<details>` do it, stops satisfying
     Google's "both appear on the page". `<details>` shut is fine; an answer
     that is not in the HTML is not. */
  const answers = visible().map(p => p.a);
  assert.ok(answers.length >= 5, 'the FAQ should still carry its questions');
  for (const a of answers) assert.ok(a.length > 40, `an FAQ answer is not in the markup: "${a}"`);

  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>'));
  const rules = css.split('}').map(r => r.trim()).filter(Boolean);
  for (const rule of rules) {
    const [sel = '', body = ''] = rule.split('{');
    if (!/\.faq\b|\.qa\b/.test(sel)) continue;
    /* A pseudo-element is not content: `::-webkit-details-marker` is the
       default triangle being replaced by the chevron, not an answer. */
    if (sel.includes('::')) continue;
    assert.ok(!/display:\s*none/.test(body),
      `about.html hides part of the FAQ in CSS rather than letting <details> do it: ${sel.trim()}`);
  }
});

test('the structured FAQ and the visible FAQ are the same FAQ, in the same order', () => {
  /* The whole point, and the one that catches a new <dt> nobody marked up.
     Both directions and the ordering in one assertion, so the failure message
     shows the two lists side by side. */
  assert.deepEqual(structured(), visible().map(p => ({ q: p.q, a: p.a })),
    'app/about.html: the FAQPage JSON-LD and <dl class="faq"> have drifted apart — ' +
    'they must hold the same questions and answers, in the same order');
});
