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
const dirs = d => readdirSync(new URL(d, ROOT), { withFileTypes: true })
  .filter(e => e.isDirectory()).map(e => e.name);

/* ---------- Stage 1 -> 3: the chain ---------- */

const STAGES = ['intent.md', 'spec.md', 'plan.md'];
const items = dirs('work');

test('there is at least one work item, or the chain is a directory of nothing', () => {
  assert.ok(items.length > 0, 'work/ is empty — the artefact chain exists only as a folder');
});

test('every work item carries the whole chain', () => {
  for (const item of items) {
    for (const stage of STAGES) {
      assert.ok(existsSync(new URL(`work/${item}/${stage}`, ROOT)),
        `work/${item}/ is missing ${stage} — a chain with a gap is not a chain`);
    }
  }
});

test('each stage says which stage it is, so a file read alone is not ambiguous', () => {
  const n = { 'intent.md': 1, 'spec.md': 2, 'plan.md': 3 };
  for (const item of items) {
    for (const stage of STAGES) {
      assert.match(read(`work/${item}/${stage}`), new RegExp(`\\*\\*Stage ${n[stage]}\\.\\*\\*`),
        `work/${item}/${stage} does not declare its stage`);
    }
  }
});

test('a plan states whether it has been implemented', () => {
  for (const item of items) {
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
