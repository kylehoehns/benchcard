/* The SDLC artefacts are structure, and structure rots quietly: an eval loses
 * a check, a skill launches an agent nobody kept, a config reads as live when
 * half of it is not. None of that fails anything on its own, which is exactly why it
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
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
/* ---------- The team /ship-feature orchestrates ---------- */

/* The skill names its subagents in a table, and the orchestrator launches
 * whatever the table says. A row whose agent was renamed or deleted fails at
 * launch, in the middle of an unattended run; an agent nobody put in the table
 * is never launched at all and reads as coverage. Both directions, because
 * both have the same shape: the table and the directory disagree and nothing
 * says so.
 *
 * STATES THIS WAS RUN AGAINST: the healthy tree; a row removed; an agent file
 * added with no row; a row renamed; a row in another table or a code block;
 * a row without spaces; and the table deleted outright. The last
 * one is why the row count is asserted on its own -- with no table, the
 * directory check still fires, but on the first agent's name, which points at
 * the agent rather than at the missing table. */
const SHIP = '.claude/skills/ship-feature/SKILL.md';
const agentFiles = () => readdirSync(new URL('.claude/agents', ROOT))
  .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));

test('the /ship-feature team table and .claude/agents/ agree, in both directions', () => {
  /* ONLY THE TEAM SECTION, and only its first column. Scanning the whole file
   * counted a row in any other table, or in a code block, as a team member --
   * falsified both ways -- and demanding one space around the name failed a
   * row written `|\`developer\`|`, which renders identically. */
  const section = (read(SHIP).split(/^## The team\s*$/m)[1] ?? '').split(/^## /m)[0];
  const rows = [...section.matchAll(/^\|\s*`([a-z][a-z0-9-]*)`\s*\|/gm)].map(m => m[1]);
  assert.ok(rows.length > 0,
    `${SHIP} has no "## The team" section with table rows ("| \`agent-name\` | job | writes |"), so nothing says which subagents it launches`);
  const agents = agentFiles();
  for (const r of rows) {
    assert.ok(agents.includes(r),
      `${SHIP} launches \`${r}\`, but .claude/agents/${r}.md does not exist — rename the row or restore the agent`);
  }
  for (const a of agents) {
    assert.ok(rows.includes(a),
      `.claude/agents/${a}.md exists but ${SHIP}'s team table never names it, so the pipeline never runs it — add a row or delete the agent`);
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
