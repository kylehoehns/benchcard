/* ================================================================== *
 * plan-view.js -- the four read-only readouts of a plan
 *
 * `renderSummary` (the one-line minutes/changes summary), `renderIssues`
 * (the engine's alerts), `renderPlanTable` (the full stint grid plus the
 * minute bars) and `renderDayTotals` (the across-the-day chart). Nothing
 * here mutates a plan: they all read `plans` / `dayTotals` and paint. That
 * is why they make one seam -- they share no state with each other beyond
 * the plan cache, and none of them owns a control a coach types into.
 *
 * No outward dependency any more (#30): the day chart's own "+ Add a game"
 * call to action, the one thing here that ever pushed a game and needed a
 * full repaint, went with Season taking over the empty state -- Today
 * already owns Add a game (#26).
 * ================================================================== */
import { fmtMinutes } from './engine.js';
import { countTo } from './fx.js';
import { $, el, set } from './dom.js';
import { icon } from './icons.js';
import { state, plans, dayTotals, game, availIds, noRoster, colorOf, gameLabel, effectiveStints, effectiveMinutes, spreadOf, summaryLine } from './state.js';
import { DEFAULT_SETTINGS } from './storage.js';

/* #29 decision 6: replaces the stat tiles. One sentence, read off the
   rotation the coach is actually looking at -- `effectiveMinutes` /
   `effectiveStints`, hand swaps folded in, never `p.minutes` / `p.stints` --
   because the card prints those and a summary that disagrees with the card
   is the bug this whole seam exists to close. Hidden with no roster or a
   blocked plan (decision 7's panel says why instead); `#regen` (Shuffle) is
   on the same row in the markup and keeps its own disabled state from
   `renderCards`' sweep. */
export function renderSummary() {
  const row = $('#summaryRow'), box = $('#summary');
  const p = plans[state.activeGame], g = game();
  if (noRoster() || !p || !p.ok) {
    if (row) row.hidden = true;
    if (box) box.textContent = '';
    return;
  }
  if (row) row.hidden = false;
  const stints = effectiveStints(g, p);
  const mins = effectiveMinutes(g, p);
  const subs = stints.slice(1).reduce((a, r) => a + r.in.length, 0);
  if (box) box.textContent = summaryLine(mins, subs);
}

export function renderIssues() {
  const box = $('#issues'); box.textContent = '';
  const p = plans[state.activeGame];
  if (!p || noRoster()) return;   // the timeline is already asking for a roster; do not shout it in red too
  const rank = { error: 0, warn: 1, info: 2 };
  const ico = { error: 'circle-alert', warn: 'triangle-alert', info: 'info' };
  const list = [...p.issues];
  /* #29 decision 7: while blocked, `timelineEmpty` already shows the first
     error (the same one `blockedFix`, state.js, picks) as the reason the
     plan can't be built -- repeating it here as a red row too says the same
     thing twice. Everything else -- warnings, infos, any later error -- still
     lists normally. */
  if (!p.ok) {
    const i = list.findIndex(x => x.severity === 'error');
    if (i >= 0) list.splice(i, 1);
  }
  /* Platoon is explicitly "no optimisation", so the engine's balanced-floor
     info ("best possible spread ... is 4 minutes") sits under a plan that is
     not trying to hit it and reads as an accusation. The engine is right about
     the format and stays untouched; it is only irrelevant here, so drop it in
     the view. SPREAD_EVEN is kept — with full units that one is simply true. */
  if (game()?.strategy === 'platoon') {
    const i = list.findIndex(x => x.code === 'SPREAD_FLOOR');
    if (i >= 0) list.splice(i, 1);
  }
  /* `MIN_OFF_STINT_BOUNDARY` is one warning per player, which was right while
     minimums were set a player at a time. The league floor set in Settings puts
     the same number on everyone, so a rule that is not a whole multiple of the
     stint fired twelve identical red rows. The engine is right about every one
     of them and stays untouched; the repetition is a view problem, so it is
     collapsed here -- the same move, in the same function, as dropping
     Platoon's SPREAD_FLOOR. Kept verbatim below three: two players named is
     more useful than a count. */
  const boundary = list.filter(x => x.code === 'MIN_OFF_STINT_BOUNDARY');
  if (boundary.length > 2) {
    for (const x of boundary.slice(1)) list.splice(list.indexOf(x), 1);
    const rest = boundary.length - 1;
    boundary[0] = { ...boundary[0],
      message: `${boundary[0].message} Same for ${rest} other player${rest === 1 ? '' : 's'}.` };
    list[list.findIndex(x => x.code === 'MIN_OFF_STINT_BOUNDARY')] = boundary[0];
  }
  /* With exactly five available the five who turned up play the whole game.
     The engine reports that as "minutes divide evenly: every player gets 32",
     which is true and is not the thing this coach is asking — they want to hear
     that there are no subs to make. Said here rather than in the engine because
     it is a fact about who showed up, not about the solve. The sort is stable,
     so unshifting puts it first among the infos. */
  if (p.ok && availIds(game()).length === 5) {
    list.unshift({ severity: 'info', code: 'NO_SUBS_ALL_GAME', playerIds: [],
      message: 'Five available, so nobody comes off. Every stint on the card reads NO SUBS.' });
  }
  /* Closers with an empty closing group is the one strategy that can silently
     do nothing: the engine only forces anyone on when the group has players, so
     the plan comes out byte-identical to Even and the coach has no way to
     tell their choice did not take. Platoon says so loudly because it has no
     plan at all; this one still has a valid plan, so it is an info, not a
     block. */
  if (p.ok && game()?.strategy === 'closers' && !game().constraints.closing.players.length) {
    list.unshift({ severity: 'info', code: 'NO_CLOSERS_PICKED', playerIds: [],
      message: 'Nobody is set to close yet, so this is still a balanced plan. Pick who finishes.' });
  }
  for (const i of list.sort((x, y) => rank[x.severity] - rank[y.severity])) {
    const a = el('div', 'alert ' + i.severity);
    const ic = el('span', 'ico');
    ic.append(icon(ico[i.severity], { size: '1.05em' }));
    a.append(ic, el('span', null, i.message));
    box.append(a);
  }
}

export function renderPlanTable() {
  const box = $('#plan'); box.textContent = '';
  const p = plans[state.activeGame];
  if (!p || !p.ok) {
    box.append(el('div', 'empty', noRoster() ? 'No plan yet. Add your roster first.' : 'No plan yet. Resolve the errors first.'));
    return;
  }
  const sh = p.shortNames;
  // same reason as renderSummary: the grid and the bars quote the rotation the
  // card prints, hand swaps and all
  const stints = effectiveStints(game(), p);
  const mins = effectiveMinutes(game(), p);

  const t = el('table', 'grid');
  const hr = el('tr');
  for (const h of ['', 'Clock', 'On the floor', 'In', 'Out', 'Sitting']) hr.append(el('th', null, h));
  t.append(hr);
  for (const r of stints) {
    const tr = el('tr', r.index && stints[r.index - 1].period !== r.period ? 'period-break' : '');
    tr.append(el('td', 'per', r.periodName || 'Q' + r.period));
    tr.append(el('td', 'clk', r.clock));
    tr.append(el('td', 'floor', r.onFloor.map(i => sh[i]).join(' ')));
    tr.append(el('td', 'in', r.in.map(i => sh[i]).join(' ') || '—'));
    tr.append(el('td', 'out', r.out.map(i => sh[i]).join(' ') || '—'));
    // '—' like In and Out: with five available nobody ever sits, and a column
    // of blank cells under a heading reads as "not worked out yet"
    tr.append(el('td', 'sit', r.sitting.map(i => sh[i]).join(' ') || '—'));
    t.append(tr);
  }
  box.append(t);

  const carrying = p.issues.some(i => i.code === 'CARRYOVER_ACTIVE');
  const entries = Object.entries(mins).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(e => e[1]));
  const bars = el('div', null); bars.style.marginTop = '1rem';
  for (const [id, m] of entries) {
    const row = el('div', 'mrow' + (m === max ? ' heavy' : m === entries[entries.length - 1][1] ? ' light' : ''));
    row.append(el('div', 'nm', sh[id]));
    // `trk`, not `track`: the analytics `track` is a module-scope import here
    const trk = el('div', 'track');
    const bar = el('i'); bar.style.width = `${(m / max) * 100}%`;
    trk.append(bar); row.append(trk);
    const v = el('div', 'v');
    countTo(v, m, 'bar:' + id, fmtMinutes);
    row.append(v);
    bars.append(row);
  }
  box.append(bars);

  const spreadMin = spreadOf(mins);
  box.append(el('p', 'note', spreadMin === 0
    ? `Even: every available player gets ${fmtMinutes(entries[0][1])} minutes.`
    : `Spread ${fmtMinutes(spreadMin)} min` +
      /* The unconstrained figure and the theoretical floor are both facts about
         the *solve*, so they only belong next to the number the solver
         produced. Once a hand swap has moved the minutes they describe a
         rotation that is no longer on screen, and the sentence stops being
         true — drop them rather than restate them wrongly. */
      (spreadMin === p.spread && p.spreadUnconstrained !== p.spread ? ` (${fmtMinutes(p.spreadUnconstrained)} among unpinned players)` : '') +
      (carrying ? ' · uneven on purpose to balance the day'
        : spreadMin === p.spread && p.minPossibleSpread.exact ? ` · best possible is ${fmtMinutes(p.minPossibleSpread.minutes)}` : '')));

  /* Even minutes are only half of what a kid feels. The other half is how long
     they sat in one go, and until now the plan never said. Measured over 200
     solves at 4×8: at a change limit of 3 the worst unbroken bench run in a
     game is 12 minutes or more in 43% of them and reaches 20; at 5 it tops out
     at 12 and the mean spread is identical (3.00 either way, 179 of 200 minute
     maps byte-identical). So the limit is the lever, and it is a trade the
     coach is entitled to see rather than a failure to warn about — no issue
     code, no red row, one sentence under the bars. */
  const sit = longestSit(stints, Object.keys(mins));
  if (sit.minutes > 0) {
    const names = sit.ids.slice(0, 3).map(id => sh[id]);
    const gameMins = stints.reduce((a, r) => a + r.minutes, 0);
    /* A third of the game, not a hard 12: 12 of 32 is what the measurement
       found, and a 4×6 game would never reach it while sitting a third of it
       feels exactly as long. */
    const long = sit.minutes > gameMins / 3;
    box.append(el('p', 'note', `Longest sit ${fmtMinutes(sit.minutes)} min in a row: ` +
      `${names.join(', ')}${sit.ids.length > 3 ? ` and ${sit.ids.length - 3} more` : ''}.` +
      (long && maxSubsNow() < 5
        ? ' Letting more players change at once, in Settings, breaks up runs like that. The totals come out the same.'
        : '')));
  }
}

/* The longest unbroken bench run in the plan, and everyone tied on it. Reads
   `sitting`, which the engine fills from the available players only, so a
   player who is out is never "sitting" for the whole game. */
export function longestSit(stints, ids) {
  const run = {}, best = {};
  for (const r of stints) {
    const sitting = new Set(r.sitting);
    for (const id of ids) {
      run[id] = sitting.has(id) ? (run[id] || 0) + r.minutes : 0;
      if (run[id] > (best[id] || 0)) best[id] = run[id];
    }
  }
  const minutes = Math.max(0, ...Object.values(best));
  return { minutes, ids: ids.filter(id => (best[id] || 0) === minutes && minutes > 0) };
}

const maxSubsNow = () => state.settings?.maxSubs ?? DEFAULT_SETTINGS.maxSubs;

export function renderDayTotals() {
  const section = $('#daySection');
  const box = $('#daytotals'); box.textContent = '';
  const n = state.day.games.length;
  set('#dayhint', 'textContent', n > 1 ? `${n} games` : '');
  /* #30 decision 4: under two games there is nothing to chart, and Today
     already owns adding a game (#26), so the section is hidden rather than
     asking for one here. With no `#daySection` (the game screen no longer
     has one) this is a no-op, the same guard every other `$(...)` call in
     this file already leans on. */
  if (section) section.hidden = n < 2;
  if (n < 2) return;
  const totals = state.players.map(p => dayTotals[p.id] || 0);
  const hi = Math.max(...totals, 1), lo = Math.min(...totals);
  const sorted = [...state.players].sort((a, b) => (dayTotals[b.id] || 0) - (dayTotals[a.id] || 0));

  /* The chart sums across games, so it needs the effective minutes *per game*
     — one map each, computed once rather than per player per game. `dayTotals`
     is already the effective sum (see computeAll); the segments have to match
     it or the bar would not add up to the number beside it. */
  const perGame = state.day.games.map((g, i) => (plans[i]?.ok ? effectiveMinutes(g, plans[i]) : null));

  for (const p of sorted) {
    const tot = dayTotals[p.id] || 0;
    const row = el('div', 'dayrow');
    row.style.setProperty('--c', colorOf(p.id));
    const nm = el('div', 'nm');
    nm.append(el('span', 'dot'), el('span', null, plans.find(x => x?.ok)?.shortNames[p.id] || p.name));
    row.append(nm);
    const trk = el('div', 'trk');
    state.day.games.forEach((g, i) => {
      const m2 = perGame[i]?.[p.id] || 0;
      if (!m2) return;
      const seg = el('i');
      seg.style.width = `${(m2 / hi) * 100}%`;
      seg.title = `${gameLabel(g, i)}: ${fmtMinutes(m2)} min`;
      trk.append(seg);
    });
    const v = el('div', 'v');
    countTo(v, tot, 'day:' + p.id, fmtMinutes);
    row.append(trk, v);
    box.append(row);
  }

  const legend = el('div', 'legend');
  state.day.games.forEach((g, i) => {
    const sp = el('span'); sp.append(el('i'), document.createTextNode(gameLabel(g, i)));
    legend.append(sp);
  });
  box.append(legend);
  box.append(el('p', 'note', hi === lo
    ? `Even across the day: everyone at ${fmtMinutes(hi)} minutes.`
    : `Day spread ${fmtMinutes(hi - lo)} min. Heaviest ${fmtMinutes(hi)}, lightest ${fmtMinutes(lo)}. Later games rebalance against this automatically.`));
}
