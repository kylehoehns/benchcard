/* The SDLC artefacts are structure, and structure rots quietly: a work item
 * loses its plan, an eval loses a check, a queue points at a directory nobody
 * created. None of that fails anything on its own, which is exactly why it
 * needs a guard — the failure mode of a process artefact is that it keeps
 * looking correct while meaning nothing.
 *
 * Two of these assertions exist to stop the artefacts becoming decoration:
 *
 *   * an `agent`-kind eval may hold ONLY `manual` checks. If it held a
 *     runnable one, `npm run evals` would skip a check it could have run and
 *     report the whole eval as not-run — a check silently not running while
 *     the table says NOT RUN reads as honest and is not.
 *   * `bands.yaml` must keep naming which half of itself is wired. Detection
 *     really runs; the diagnose half does not. A config that reads as live
 *     when it is half aspiration is a claim the tree cannot support, and the
 *     day the other half lands, that line and this test change together.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
/* Tolerant on purpose. `work/` is tracked only by `work/.gitkeep`, and a
 * checkout that somehow lacks it must fail on an ASSERTION that names the
 * problem, not on ENOENT thrown at module load -- which takes down every test
 * in this file, including the ones that have nothing to do with work/. */
const dirs = d => existsSync(new URL(d, ROOT))
  ? readdirSync(new URL(d, ROOT), { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name)
  : null;

/* ---------- Stage 1 -> 3: the chain ---------- */

const STAGES = ['intent.md', 'spec.md', 'plan.md'];
const items = dirs('work');

/* THERE IS NO ASSERTION THAT work/ IS NON-EMPTY, and there was one until the
 * first item was about to ship. An empty queue is a finished queue. The old
 * assertion would have gone red at the exact moment a session did the right
 * thing -- deleted the directory of the item it had just completed -- and sent
 * it hunting a failure that was the guard's fault, not the change's.
 *
 * It only ever passed because it was written while exactly one item existed.
 * That is the state-of-one trap: a guard run in a single state is a guard whose
 * other states are guesses. What is checked below is the SHAPE of whatever is
 * in work/, which is the thing that can actually rot. */
test('work/ survives an empty queue', () => {
  assert.notEqual(items, null,
    'work/ is missing from the checkout. It is tracked only by work/.gitkeep, and git does not track empty directories — so shipping the last item deletes the directory itself unless .gitkeep stays.');
  assert.ok(existsSync(new URL('work/.gitkeep', ROOT)),
    'work/.gitkeep is gone. The next PR that finishes the last open item removes work/ entirely, and this file then throws ENOENT at module load rather than failing one assertion.');
});

/* PREFIX-COMPLETE, NOT COMPLETE. This demanded all three files, which was
 * written when the only item that had ever existed was already at Stage 3 --
 * and it is wrong for the same reason the empty-queue assertion and the
 * skill-ownership assertion were wrong before it. The stages are SEQUENTIAL:
 * an item legitimately exists carrying only `intent.md` from the moment the
 * problem is written down until the spec is agreed. Demanding the whole chain
 * up front forces a plan to be invented alongside the intent, which is exactly
 * the "plan written to match the diff" failure one stage earlier.
 *
 * What is actually wrong is a GAP -- a plan with no spec above it, a spec with
 * no intent. That is what is checked. */
const stagesPresent = item =>
  STAGES.map(s => existsSync(new URL(`work/${item}/${s}`, ROOT)));

test('a work item has no gap in its chain', () => {
  for (const item of items) {
    const present = stagesPresent(item);
    assert.ok(present[0],
      `work/${item}/ has no intent.md. Every item starts with the problem, whatever else it has.`);
    const firstMissing = present.indexOf(false);
    if (firstMissing === -1) continue;
    assert.ok(!present.slice(firstMissing).includes(true),
      `work/${item}/ skips ${STAGES[firstMissing]} but has a later stage — a chain with a gap is not a chain, and the later stage rests on a decision nobody wrote down`);
  }
});

test('each stage says which stage it is, so a file read alone is not ambiguous', () => {
  const n = { 'intent.md': 1, 'spec.md': 2, 'plan.md': 3 };
  for (const item of items) {
    for (const stage of STAGES) {
      if (!existsSync(new URL(`work/${item}/${stage}`, ROOT))) continue;
      assert.match(read(`work/${item}/${stage}`), new RegExp(`\\*\\*Stage ${n[stage]}\\.\\*\\*`),
        `work/${item}/${stage} does not declare its stage`);
    }
  }
});

test('a plan, once it exists, states whether it has been implemented', () => {
  for (const item of items) {
    if (!existsSync(new URL(`work/${item}/plan.md`, ROOT))) continue;
    const plan = read(`work/${item}/plan.md`);
    assert.match(plan, /implemented/i,
      `work/${item}/plan.md never says whether it was implemented — an unexecuted plan that reads as done is worse than no plan`);
    assert.match(plan, /## Proof/,
      `work/${item}/plan.md has no Proof section, so nothing says how it would be known to work`);
  }
});

/* The queue and the directories are two halves of one answer, and they drift
 * in both directions: an item shipped but still listed, or created and never
 * queued. */
test('the TICKETS index and work/ agree, in both directions', () => {
  const tickets = read('notes/TICKETS.md');
  for (const item of items) {
    assert.ok(tickets.includes(`work/${item}/`),
      `work/${item}/ exists but notes/TICKETS.md never lists it`);
  }
  for (const [, linked] of tickets.matchAll(/work\/([a-z0-9-]+)\//g)) {
    assert.ok(items.includes(linked),
      `notes/TICKETS.md points at work/${linked}/, which does not exist`);
  }
});

/* ---------- Stage 4: the evals ---------- */

const RUNNABLE = new Set(['hook', 'hookExit', 'suite']);
const evalFiles = readdirSync(new URL('evals', ROOT)).filter(f => f.endsWith('.json'));

test('every eval is well formed', () => {
  for (const f of evalFiles) {
    const e = JSON.parse(read(`evals/${f}`));
    assert.equal(e.id, f.replace(/\.json$/, ''), `${f}: id must match the filename`);
    for (const field of ['stage', 'kind', 'prompt', 'why', 'checks']) {
      assert.ok(e[field], `${f}: missing "${field}"`);
    }
    assert.ok(['deterministic', 'agent'].includes(e.kind), `${f}: unknown kind "${e.kind}"`);
    assert.ok(Array.isArray(e.checks) && e.checks.length, `${f}: an eval with no checks asserts nothing`);
  }
});

test('an agent-kind eval holds only manual checks', () => {
  for (const f of evalFiles) {
    const e = JSON.parse(read(`evals/${f}`));
    if (e.kind !== 'agent') continue;
    for (const c of e.checks) {
      assert.equal(c.type, 'manual',
        `${f}: kind is "agent" but a "${c.type}" check is runnable — the runner would skip it and the table would still say NOT RUN`);
    }
  }
});

test('a deterministic eval holds no manual checks, or it is not deterministic', () => {
  for (const f of evalFiles) {
    const e = JSON.parse(read(`evals/${f}`));
    if (e.kind !== 'deterministic') continue;
    for (const c of e.checks) {
      assert.ok(RUNNABLE.has(c.type),
        `${f}: kind is "deterministic" but holds a "${c.type}" check, which nothing can decide`);
    }
  }
});

test('every eval says WHY it exists, at some length', () => {
  for (const f of evalFiles) {
    const e = JSON.parse(read(`evals/${f}`));
    assert.ok(e.why.length > 60,
      `${f}: "why" is a stub. An eval whose reason nobody wrote down is one nobody will maintain.`);
  }
});

/* ---------- Stage 6: the band ---------- */

test('bands.yaml keeps saying which half of it is wired', () => {
  const bands = read('bands.yaml').replace(/\s+/g, ' ');
  assert.match(bands, /THE DIAGNOSE HALF DOES NOT RUN/,
    'bands.yaml stopped naming the unwired half. If a model now diagnoses breaches, wire it and change this test; if not, keep saying so — a config that reads as live is a claim the tree cannot support.');
  assert.match(bands, /DETECTION RUNS/,
    'the wired half should be named too, or the file reads as pure aspiration when half of it actually works');
});

/* ---------- Stage 3: the subagents ---------- */

test('every subagent declares a name and a description', () => {
  for (const f of readdirSync(new URL('.claude/agents', ROOT)).filter(f => f.endsWith('.md'))) {
    const body = read(`.claude/agents/${f}`);
    assert.match(body, /^---\n/, `${f}: no frontmatter`);
    assert.match(body, /^name: .+/m, `${f}: no name`);
    assert.match(body, /^description: .+/m, `${f}: no description, so nothing routes work to it`);
  }
});
