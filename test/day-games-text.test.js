import { test } from 'node:test';
import assert from 'node:assert/strict';

/* #144 item 4: "Across the day" hides each game's minutes on the bar's own
   segments, so a screen reader needs the same fact as text -- `dayGamesText`
   is that join, read at its own seam (`node --test`) rather than only
   through the browser check that reads the rendered row.
   `plan-view.js` reaches for a canvas and a media query at import time, so
   the stubs below stand in for the document; nothing here renders
   (`test/longest-sit.test.js` does the same for the same reason). */
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {} });
globalThis.window = globalThis;
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 0 }) }) }),
};
const { dayGamesText } = await import('../app/plan-view.js');

const CASES = [
  { desc: 'two games, unlabeled, reads "Game 1: 8, Game 2: 6"',
    games: [{}, {}], perGame: [{ p1: 8 }, { p1: 6 }],
    want: 'Game 1: 8, Game 2: 6' },
  { desc: 'labeled games use the legend\'s own wording ("Hawks: 16, Ravens: 16")',
    games: [{ label: 'Hawks' }, { label: 'Ravens' }], perGame: [{ p1: 16 }, { p1: 16 }],
    want: 'Hawks: 16, Ravens: 16' },
  { desc: 'five games names all five, in order',
    games: [{ label: 'Hawks' }, { label: 'Ravens' }, {}, { label: 'Owls' }, {}],
    perGame: [{ p1: 8 }, { p1: 6 }, { p1: 4 }, { p1: 5 }, { p1: 3 }],
    want: 'Hawks: 8, Ravens: 6, Game 3: 4, Owls: 5, Game 5: 3' },
  { desc: 'a player with 0 in one game still gets that game named, at 0',
    games: [{ label: 'Hawks' }, { label: 'Ravens' }], perGame: [{ p1: 12 }, { p1: 0 }],
    want: 'Hawks: 12, Ravens: 0' },
  { desc: 'a player missing from a game\'s map reads as 0, same as being there for none of it',
    games: [{ label: 'Hawks' }, { label: 'Ravens' }], perGame: [{ p1: 12 }, {}],
    want: 'Hawks: 12, Ravens: 0' },
];

for (const { desc, games, perGame, want } of CASES) {
  test(desc, () => {
    assert.equal(dayGamesText(games, perGame, 'p1'), want);
  });
}
