/* #339: the deploy copy of app/ has its CSS comments stripped. The repo keeps
   every comment; only what Cloudflare serves (and what `scripts/serve.mjs`
   serves, so smoke runs against what ships) loses them. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stripCssComments as strip, build } from '../scripts/build.mjs';
import { serve } from '../scripts/serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP = join(ROOT, 'app');

/* --- 1. the stripper ---------------------------------------------------- */

test('a comment on its own line removes the whole line', () => {
  assert.equal(strip('a { color: red; }\n  /* note */\nb { top: 0; }\n'),
    'a { color: red; }\nb { top: 0; }\n');
});

test('a multi-line comment on its own lines removes every line of it', () => {
  assert.equal(strip('a {}\n/* one\n   two\n   three */\nb {}\n'), 'a {}\nb {}\n');
});

test('a comment after a declaration drops the spaces before it too', () => {
  assert.equal(strip('a { color: red; /* why */\n  top: 0; }\n'), 'a { color: red;\n  top: 0; }\n');
  assert.equal(strip('a { color: red; }   /* why */\nb {}\n'), 'a { color: red; }\nb {}\n');
});

test('a comment between tokens collapses to one space when whitespace touches it', () => {
  assert.equal(strip('a { margin: 0 /* x */ 4px; }'), 'a { margin: 0 4px; }');
  assert.equal(strip('a { margin: 0/* x */ 4px; }'), 'a { margin: 0 4px; }');
  assert.equal(strip('a { margin: 0 /* x */4px; }'), 'a { margin: 0 4px; }');
});

test('a comment touching no whitespace keeps /**/ only between two name characters', () => {
  assert.equal(strip('a { margin: 0/* x */4px; }'), 'a { margin: 0/**/4px; }');
  assert.equal(strip('.a/* x */.b {}'), '.a.b {}');
  assert.equal(strip('a { color:/* x */red; }'), 'a { color:red; }');
  assert.equal(strip('a{b-/* x */c}'), 'a{b-/**/c}');
  assert.equal(strip('a{é/* x */b}'), 'a{é/**/b}');
});

test('/* and */ inside quoted strings are kept, escaped quotes included', () => {
  const css = [
    `a::after { content: "/* not a comment */"; }`,
    `a::after { content: '/* nor this */'; }`,
    `a::after { content: "say \\"/* hi */\\" now"; }`,
    `a::after { content: 'it\\'s /* kept */'; }`,
  ].join('\n') + '\n';
  assert.equal(strip(css), css);
  assert.equal(strip(`a { content: "/*" } /* gone */\nb {}`), `a { content: "/*" }\nb {}`);
});

test('/* inside url(...) is kept, quoted or not', () => {
  const css = 'a { background: url(data:image/svg+xml;x=/*y) }\nb { background: url("a/*b") }\nc { background: url(\'a/*b\') }\n';
  assert.equal(strip(css), css);
  assert.equal(strip('a { background: url(x/*y) } /* gone */'), 'a { background: url(x/*y) }');
});

test('an unterminated comment runs to the end of the file', () => {
  assert.equal(strip('a {}\n/* never closed\nb {}\n'), 'a {}\n');
  assert.equal(strip('a {} /* never closed'), 'a {}');
});

test('a file with no comments comes back byte-identical', () => {
  const css = '  a  {\n\tcolor : red ;\n}\r\n\n\n b{top:0}  \n';
  assert.equal(strip(css), css);
  assert.equal(strip(''), '');
});

/* --- 2. nothing else changes -------------------------------------------- */

const noWs = s => s.replace(/\s+/g, '');
for (const name of ['tokens.css', 'app.css', 'card.css']) {
  test(`${name}: only comments and the whitespace around them go`, () => {
    const src = readFileSync(join(APP, name), 'utf8');
    // The plain regex is a fair reference only if no comment opener hides in
    // a string or url(...). Check that first, or the reference proves nothing.
    for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) {
      const line = src.slice(0, m.index).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').pop();
      assert.equal((line.replace(/\\./g, '').match(/["']/g) || []).length % 2, 0, `${name}: /* inside a string`);
      assert.ok(!/url\([^)]*$/.test(line), `${name}: /* inside url(`);
    }
    const bare = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = strip(src);
    assert.ok(!out.includes('/*'), `${name}: /* left in the output`);
    assert.equal(noWs(out), noWs(bare));
    assert.ok(out.length < src.length, `${name}: nothing was stripped`);
  });
}

/* --- 3. the build ------------------------------------------------------- */

const tmp = () => mkdtempSync(join(tmpdir(), 'benchcard-build-'));
const files = dir => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(e => e.isFile()).map(e => join(e.parentPath ?? e.path, e.name).slice(dir.length + 1)).sort();
const snapshot = dir => files(dir).map(f => [f, readFileSync(join(dir, f)).toString('base64')]);

test('build copies app/ with only .css files changed, and leaves app/ alone', () => {
  const out = join(tmp(), 'dist');
  const before = snapshot(APP);
  build(APP, out);
  assert.deepEqual(files(out), files(APP));
  for (const f of files(APP)) {
    const src = readFileSync(join(APP, f));
    const got = readFileSync(join(out, f));
    if (f.endsWith('.css')) assert.equal(got.toString('utf8'), strip(src.toString('utf8')), f);
    else assert.ok(got.equals(src), `${f} differs`);
  }
  assert.ok(files(APP).some(f => f.endsWith('.css')));
  assert.deepEqual(snapshot(APP), before);
});

test('build replaces a stale outDir instead of merging into it', () => {
  const out = join(tmp(), 'dist');
  mkdirSync(join(out, 'old'), { recursive: true });
  writeFileSync(join(out, 'old', 'stale.txt'), 'x');
  writeFileSync(join(out, 'app.css'), 'stale');
  build(APP, out);
  assert.ok(!existsSync(join(out, 'old')));
  assert.deepEqual(files(out), files(APP));
});

/* --- 4. wrangler.jsonc, .gitignore -------------------------------------- */

test('wrangler.jsonc runs the build and deploys dist/; dist/ is git-ignored', () => {
  const text = readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  const cfg = JSON.parse(text);
  assert.equal(cfg.build?.command, 'node scripts/build.mjs');
  assert.equal(cfg.assets.directory, 'dist');
  assert.ok(readFileSync(join(ROOT, '.gitignore'), 'utf8').split('\n').includes('dist/'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
});

test('run directly, build.mjs writes dist/ at the repo root; imported, it does not', () => {
  const dist = join(ROOT, 'dist');
  const script = join(ROOT, 'scripts/build.mjs');
  rmSync(dist, { recursive: true, force: true });
  const cwd = tmp();
  execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(script)})`], { cwd });
  assert.ok(!existsSync(dist), 'importing build.mjs built dist/');
  assert.deepEqual(readdirSync(cwd), [], 'importing build.mjs wrote into the cwd');
  execFileSync(process.execPath, [script], { cwd });
  assert.deepEqual(files(dist), files(APP));
  assert.deepEqual(readdirSync(cwd), [], 'the CLI wrote into the cwd, not the repo root');
});

/* --- 5. the local server ------------------------------------------------ */

test('serve() returns .css stripped as text/css and everything else unchanged', async () => {
  const server = await serve(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const f of files(APP).filter(f => f.endsWith('.css'))) {
      const r = await fetch(`${base}/${f}`);
      assert.equal(r.headers.get('content-type'), 'text/css; charset=utf-8', f);
      assert.equal(await r.text(), strip(readFileSync(join(APP, f), 'utf8')), f);
    }
    for (const f of ['app.js', 'site.webmanifest', 'og.png', 'robots.txt']) {
      const r = await fetch(`${base}/${f}`);
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(readFileSync(join(APP, f))), f);
    }
  } finally { server.stopHard(); }
});
