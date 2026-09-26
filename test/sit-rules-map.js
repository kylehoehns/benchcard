import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './js-comments.js';

/* rule-words.test.js and sit-rules.test.js both read SIT_RULES through this
   one reader. gamemode.js reaches for the DOM at import time (fx.js's
   matchMedia), so SIT_RULES is read out of source rather than imported. */
export function sitRulesMap() {
  const src = stripComments(readFileSync(new URL('../app/gamemode.js', import.meta.url), 'utf8'));
  const i = src.indexOf('const SIT_RULES = {');
  assert.ok(i > 0, 'SIT_RULES is gone from gamemode.js');
  const body = src.slice(i, src.indexOf('\n};', i));
  const map = new Map([...body.matchAll(/^\s*([A-Z_]+):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]));
  assert.ok(map.size > 10, `only ${map.size} SIT_RULES entries parsed -- the parser broke`);
  return map;
}
