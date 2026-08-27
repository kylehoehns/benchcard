/* "One answer lives in one place" is the axiom in CLAUDE.md, and it is there
 * because two answers to one question has caused more bugs in this repo than
 * anything else. Splitting the browser traps and the guard lessons out of
 * AGENTS.md and into `.claude/skills/` is exactly the move that breaks it:
 * a section gets moved, a copy gets left behind, the two drift, and the next
 * iteration follows whichever one it read first.
 *
 * So the split is guarded in BOTH directions, and both halves matter equally:
 *
 *   * a fact must still EXIST, in the file that now owns it -- otherwise the
 *     move silently deleted the reason somebody spent iterations learning;
 *   * a fact must exist NOWHERE ELSE in the harness docs -- otherwise the
 *     move produced the duplication it was meant to end.
 *
 * The markers are deliberately the specific, unlovely details -- `17 of 19`,
 * `21 of 21`, `floor of 5` -- rather than the headline sentences. A headline
 * can be legitimately paraphrased in an index line ("your measurement tools"
 * appears in AGENTS.md on purpose); the number 17 cannot. Picking headlines
 * would have made this guard fire on correct edits, and a guard that fires on
 * correct edits is a guard somebody deletes.
 *
 * Scope is the harness docs only: notes/ is narrative and is allowed to retell
 * whatever it likes, and app/ and scripts/ are code, where `checkVisibility`
 * appearing is the point rather than a duplicate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

const SKILL_DIR = '.claude/skills';
const skills = readdirSync(new URL(SKILL_DIR, ROOT), { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

/* Every file that answers "how do I work in this repo". */
const DOCS = ['AGENTS.md', 'CLAUDE.md', 'REVIEW.md',
  ...skills.map(s => `${SKILL_DIR}/${s}/SKILL.md`)];

/* Every comparison below runs against whitespace-normalised text, and this is
 * not a detail. The first run of this guard failed on "service worker" because
 * AGENTS.md wraps it across two lines -- the doc was right and the guard was
 * wrong, which is the failure mode /new-guard step 1 exists to catch. A marker
 * that happens not to wrap today would start lying the moment someone reflowed
 * a paragraph. */
const flat = s => s.replace(/\s+/g, ' ');
const text = Object.fromEntries(DOCS.map(f => [f, flat(read(f))]));
const raw = Object.fromEntries(DOCS.map(f => [f, read(f)]));

/* marker -> the one file allowed to contain it */
const OWNED = {
  // moved out of AGENTS.md § Traps
  '17 of 19':                          `${SKILL_DIR}/browser-verify/SKILL.md`,
  'checkVisibility':                   `${SKILL_DIR}/browser-verify/SKILL.md`,
  '1×1 canvas':                        `${SKILL_DIR}/browser-verify/SKILL.md`,
  'Cache-Control: no-store':           `${SKILL_DIR}/browser-verify/SKILL.md`,
  'viewIn':                            `${SKILL_DIR}/browser-verify/SKILL.md`,
  'hits: 0':                           `${SKILL_DIR}/browser-verify/SKILL.md`,
  '1.03:1':                            `${SKILL_DIR}/browser-verify/SKILL.md`,
  'no simulator on this machine':      `${SKILL_DIR}/browser-verify/SKILL.md`,

  // moved out of AGENTS.md § Guards and § Judgement
  '21 of 21':                          `${SKILL_DIR}/new-guard/SKILL.md`,
  'floor of 5':                        `${SKILL_DIR}/new-guard/SKILL.md`,
  '--test-reporter=tap':               `${SKILL_DIR}/new-guard/SKILL.md`,
  'read-back that prints nothing':     `${SKILL_DIR}/new-guard/SKILL.md`,
  'git checkout':                      `${SKILL_DIR}/new-guard/SKILL.md`,

  // deliberately NOT moved: these apply whether or not a browser is opened,
  // so AGENTS.md keeps them and the skills must not grow a copy
  'document.fonts.ready':              'AGENTS.md',
  'check-sw-version.mjs':              'AGENTS.md',
  'a window of source is not a scope': 'AGENTS.md',
};

test('every moved fact still exists, in the file that now owns it', () => {
  for (const [marker, owner] of Object.entries(OWNED)) {
    assert.ok(text[owner].includes(marker),
      `"${marker}" has vanished from ${owner} — the move deleted it rather than relocating it`);
  }
});

test('and exists nowhere else in the harness docs', () => {
  for (const [marker, owner] of Object.entries(OWNED)) {
    const strays = DOCS.filter(f => f !== owner && text[f].includes(marker));
    assert.deepEqual(strays, [],
      `"${marker}" is owned by ${owner} but also appears in ${strays.join(', ')} — that is two answers to one question`);
  }
});

/* An index whose pointers are dead is worse than no index: it reads as
 * coverage. `code-review` is bundled with Claude Code rather than living in
 * this tree, and is the only reference allowed not to resolve here. */
const BUNDLED = new Set(['code-review']);

test('every skill referenced in the docs actually exists', () => {
  const ref = /(?:^|[\s(`])\/([a-z][a-z0-9-]{2,})(?=[\s.,`)]|$)/gm;
  for (const f of DOCS) {
    for (const [, name] of text[f].matchAll(ref)) {
      if (BUNDLED.has(name)) continue;
      assert.ok(existsSync(new URL(`${SKILL_DIR}/${name}/SKILL.md`, ROOT)),
        `${f} points at /${name}, which does not exist`);
    }
  }
});

test('and every skill in the tree is pointed at from AGENTS.md', () => {
  for (const s of skills) {
    assert.ok(text['AGENTS.md'].includes(`/${s}`),
      `${SKILL_DIR}/${s}/ exists but AGENTS.md never names it, so nothing routes anyone to it`);
  }
});

/* The index has to say a trap EXISTS without saying what to do about it --
 * that is the difference between an index and a second answer. These are the
 * headlines, which AGENTS.md is allowed and expected to carry. */
test('AGENTS.md still names the traps it no longer explains', () => {
  const a = text['AGENTS.md'];
  for (const headline of ['service worker', 'measurement tools', 'css.includes',
                          'getClientRects()', 'oklch()', 'booted === true']) {
    assert.ok(a.includes(headline),
      `AGENTS.md no longer names "${headline}" — a trap nobody knows exists is not indexed, it is lost`);
  }
});

test('the skills declare who owns what, so the split survives being read out of order', () => {
  for (const s of skills) {
    const body = raw[`${SKILL_DIR}/${s}/SKILL.md`];
    assert.match(body, /owns .* outright/,
      `${s} does not state that it owns its subject; without that a future edit copies it back into AGENTS.md`);
    assert.match(body, /^description:.+/m, `${s} has no description, so nothing will trigger it`);
  }
});
