/* handoff.js -- #250: hand a game to an assistant in a link. The plan travels
   in the part of the URL after `#`, which a browser never sends, so no
   server is involved. `encode` builds that hash from a team and one of its
   games; names that travel are `callNames` (roster.js), never the full ones.
   Compression is the browser's own `CompressionStream`, no library. */
import { callNames } from './roster.js';
import { DAMAGED_LINK, handStints, playedStints, finishedGame, writeOverrides } from './live.js';
import { sanitizeTeam, seasonDate, sortDay } from './storage.js';
import { state, team, computeAll, effectiveStints, availIds, plans, openGame, dayFor,
         hueSlots, emptyConstraints, newGame } from './state.js';

const VERSION = '1';
const PREFIX = '#p=' + VERSION;

const toBase64Url = bytes => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function deflate(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* The one place a kid's name for the link is decided: the card name, never the
   full one. The Hand off sheet lists exactly these. */
export function leavingNames(players) {
  const names = callNames(players);
  return players.map(p => names[p.id] || p.name);
}

export { DAMAGED_LINK };

/* `stints` is the rotation the card shows -- the caller's
   `effectiveStints(g, p).map(s => s.onFloor)` -- as lists of player ids. */
export async function encode(team, game, stints) {
  const leaving = leavingNames(team.players);
  const index = new Map(team.players.map((p, i) => [p.id, i]));
  const live = game.live;
  const payload = {
    t: [team.id, team.name, team.settings?.color ?? ''],
    p: team.players.map((p, i) => [p.id, leaving[i], p.number, p.tier]),
    g: {
      id: game.id, periods: game.periods, periodMinutes: game.periodMinutes,
      granMode: game.granMode, granValue: game.granValue, strategy: game.strategy,
      balance: game.balance, seed: game.seed, out: game.out, constraints: game.constraints,
      overtime: game.overtime,
    },
    s: stints.map(five => five.map(id => index.get(id))),
    l: { at: playedStints(live), hand: handStints(live), finished: finishedGame(live), arrived: live?.arrived ?? {} },
  };
  return PREFIX + toBase64Url(await deflate(JSON.stringify(payload)));
}

const fromBase64Url = text => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

// a hand-built link could inflate to gigabytes; no real one is near this
const MAX_JSON = 100_000;

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_JSON) { await reader.cancel(); throw new Error('too big'); }
    chunks.push(value);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(await new Blob(chunks).arrayBuffer());
}

const isStr = v => typeof v === 'string';
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/* The payload's shape, checked before anything reads it. What it says is then
   cleaned by `sanitizeTeam`; this only makes sure there is something for it
   to clean. */
function shapeOk(d) {
  if (!isObj(d)) return false;
  const { t, p, g, s, l } = d;
  if (!Array.isArray(t) || t.length !== 3 || !t.every(isStr) || !t[0]) return false;
  if (!Array.isArray(p) || p.length < 5 || p.length > 40) return false;
  if (!p.every(r => Array.isArray(r) && isStr(r[0]) && r[0] && isStr(r[1]) && isStr(r[2]) && typeof r[3] === 'number')) return false;
  if (!isObj(g) || !isStr(g.id) || !g.id) return false;
  if (!Array.isArray(s) || s.length < 1 || s.length > 200) return false;
  const ok = s.every(five => Array.isArray(five) && five.length === 5
    && five.every(i => Number.isInteger(i) && i >= 0 && i < p.length) && new Set(five).size === 5);
  if (!ok) return false;
  return isObj(l) && Array.isArray(l.hand) && l.hand.every(k => Number.isInteger(k) && k >= 0 && k < s.length);
}

/* `hash` is `location.hash`. Returns `{ team, stints }` -- the team cleaned
   through `sanitizeTeam`, holding one day with the one game, and the card's
   stints as lists of ids -- or `null` for anything that is not a link this
   app made. */
export async function decode(hash) {
  try {
    if (!isStr(hash) || !hash.startsWith(PREFIX)) return null;
    const body = hash.slice(PREFIX.length);
    if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
    const d = JSON.parse(await inflate(fromBase64Url(body)));
    if (!shapeOk(d)) return null;
    const { t, p, g, s, l } = d;
    const ids = p.map(r => r[0]);
    const stints = s.map(five => five.map(i => ids[i]));
    const overrides = Object.fromEntries(l.hand.map(k => [k, stints[k]]));
    const raw = {
      id: t[0], name: t[1], settings: { color: t[2] },
      players: p.map(([id, name, number, tier], hue) => ({ id, name, number, tier, hue })),
      days: [{ name: '', date: seasonDate(new Date()), games: [{
        ...g, useCarryover: false,
        live: { at: l.at, overrides, hand: l.hand, finished: l.finished === true, arrived: l.arrived },
      }] }],
    };
    const cleaned = sanitizeTeam(raw, { emptyConstraints, newGame });
    // a roster the cleaning shortened no longer lines up with the stints
    if (cleaned.players.length !== p.length || cleaned.days[0]?.games.length !== 1) return null;
    return { team: cleaned, stints };
  } catch {
    return null;
  }
}

/* The phone's copy of a game is further along than the link's: more stints
   played, more hand swaps, or finished where the link is not. */
const furtherAlong = (mine, link) => playedStints(mine) > playedStints(link)
  || handStints(mine).length > handStints(link).length
  || (finishedGame(mine) && !finishedGame(link));

const sameFive = (a, b) => a.length === b.length && a.every(id => b.includes(id));

/* Where the team keeps a game, as [day, index], or null. */
function findGame(t, id) {
  for (let d = 0; d < t.days.length; d++) {
    const i = t.days[d].games.findIndex(x => x.id === id);
    if (i >= 0) return [d, i];
  }
  return null;
}

/* A kid the phone lacks is added by card name, with a hue of its own. */
function addMissingPlayers(t, players) {
  const known = new Set(t.players.map(p => p.id));
  const added = players.filter(p => !known.has(p.id));
  const hues = hueSlots(added.length, t.players);
  added.forEach((p, i) => t.players.push({ ...p, hue: hues[i] }));
}

/* The link's game takes the place of the phone's; the phone's own label and
   tipoff are not in the link, so they stay. */
function replaceGame(t, [d, i], game) {
  const old = t.days[d].games[i];
  if (old.label !== undefined) game.label = old.label;
  if (old.tipoff !== undefined) game.tipoff = old.tipoff;
  t.days[d].games[i] = game;
  return [d, i];
}

function addGame(t, date, game) {
  const d = dayFor(date);
  t.days[d].games.push(game);
  sortDay(t.days[d].games);
  return [d, t.days[d].games.indexOf(game)];
}

/* Puts a decoded link into the app's record and opens its game. A team the
   phone already has (same id) keeps its own roster and everything else; a
   kid it lacks is added by card name. With no match, the placeholder a fresh
   phone starts with is replaced, or a team is added. Then the game is
   re-solved here, and any stint that differs from the link's is written as an
   override that is not a hand swap, so the card matches the sender's. */
export function receive({ team: incoming, stints }) {
  const game = incoming.days[0].games[0];
  const have = state.teams.findIndex(t => t.id === incoming.id);
  let outcome = 'added';
  if (have < 0) {
    const placeholder = !state.onboarded && !state.teams.some(t => t.players.length);
    if (placeholder) state.teams = [incoming]; else state.teams.push(incoming);
    state.onboarded = true;
    state.activeTeam = state.teams.indexOf(incoming);
    openGame(0, 0);
  } else {
    state.activeTeam = have;
    const mine = team();
    const own = findGame(mine, game.id);
    if (own && furtherAlong(mine.days[own[0]].games[own[1]].live, game.live)) {
      openGame(...own);
      computeAll();
      return { teamName: mine.name, outcome: 'kept' };
    }
    if (own) outcome = 'replaced';
    addMissingPlayers(mine, incoming.players);
    openGame(...(own ? replaceGame(mine, own, game) : addGame(mine, incoming.days[0].date, game)));
  }
  computeAll();
  const p = plans[state.activeGame];
  if (p?.ok) {
    const solved = effectiveStints(game, p);
    const free = new Set(availIds(game));
    const fix = {};
    const played = playedStints(game.live);
    stints.forEach((five, k) => {
      // a played stint is history and is always written; only a stint still to come must name kids who can play
      if (solved[k] && !sameFive(solved[k].onFloor, five) && (k < played || five.every(id => free.has(id)))) fix[k] = five;
    });
    if (Object.keys(fix).length) { writeOverrides(game.live, fix, false); computeAll(); }
  }
  return { teamName: team().name, outcome };
}
