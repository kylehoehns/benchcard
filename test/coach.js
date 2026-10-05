/* The Coach driver for scenario tests (the BDD pilot): the app as a coach
 * uses it, in real Chrome, through what is on screen. A scenario says what a
 * coach does -- `tap('Paste a list')`, `type('12 Maya Webb')` -- and reads
 * back what a coach sees -- `rosterNames()`, `toast()`. Nothing here imports
 * app code or reads `state`; if a coach cannot see it, a scenario cannot
 * assert it.
 *
 * Taps are real CDP mouse events at the control's center, after a hit test:
 * a control that is covered, off screen or inside a closed sheet fails the
 * tap by name instead of being clicked through `.click()`, which would not
 * notice. Typing is `Input.insertText`, so the app's own `input` handlers
 * run as they do for a coach.
 *
 * Built on the smoke harness rather than beside it -- `launch`/`cdp`
 * (chrome.mjs), `land` (page-state.mjs), the pinned clock, `quiet` --
 * so a page here boots exactly the way a smoke row's does.
 *
 * A plain file straight in test/, not test/helpers/: see state-fixture.js on
 * why `node --test`'s glob makes a subdirectory unsafe for an export-only
 * module. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve } from '../scripts/serve.mjs';
import { launch, cdp, closeChrome, hasChrome } from '../scripts/smoke/chrome.mjs';
import { evalIn, quiet, screenReadyExpr, FAST_PLAYBACK_RATE, TIMER_TRACKER } from '../scripts/smoke/dom.mjs';
import { land } from '../scripts/smoke/page-state.mjs';
import { buildClockScript, SMOKE_CLOCK } from '../scripts/smoke/clock.mjs';
import { RICH, TODAY_GAME_READY, GAMES_VIEW_READY, WELCOME_LANDING } from '../scripts/smoke/fixtures.mjs';
import { SAMPLE_PLAYERS, withSecondTeam } from '../scripts/smoke/fixtures.mjs';

export { hasChrome };

/* RICH's team, settings and games, with the roster swapped for `players`
 * (names, or `{ name, number }`) and the Team screen showing. The season is
 * emptied so no filed minutes point at a player who is not there. */
export function teamWith(players = []) {
  const [team] = RICH.teams;
  return {
    ...RICH, view: 'team',
    teams: [{
      ...team,
      players: players.map((p, i) => {
        const { name, number = '' } = typeof p === 'string' ? { name: p } : p;
        return { id: `p${i}`, name, number, tier: 3 };
      }),
      days: team.days.map(d => ({ ...d, games: d.games.map(g => ({ ...g, out: [] })) })),
      season: { games: [] },
    }],
  };
}

/* The roles a coach can tap or type into. Controls are found through
 * Chrome's own accessibility tree (CDP `Accessibility.getFullAXTree`), so a
 * control's name is exactly what a screen reader announces -- aria-label,
 * <label>, text, with aria-hidden parts left out -- and anything a coach
 * cannot reach (a closed sheet, `hidden`, the page behind a modal) is left
 * out. */
const ROLES = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio',
  'switch', 'tab', 'menuitem', 'slider', 'spinbutton', 'option']);

/* RICH's team with its first game day set to the pinned clock's date, so
 * Today opens on the Hawks (9:00 AM) and Ravens (11:30 AM) games, and an
 * empty season so a filed game is the only one there. */
export function gameDay() {
  const [team] = RICH.teams;
  const { y, m, d } = SMOKE_CLOCK;
  const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { ...RICH, view: 'today', teams: [{ ...team, days: [{ ...team.days[0], date }], season: { games: [] } }] };
}

/* RICH's team with its first game day set to the pinned clock's date, as
 * `gameDay()` has it, but keeping RICH's own three filed games: a season
 * already under way when the coach plans today's game. */
export function midSeason() {
  const [team] = RICH.teams;
  const [day] = gameDay().teams[0].days;
  return { ...RICH, view: 'today', teams: [{ ...team, days: [day] }] };
}

/* A phone's share sheet: keeps the link it is given and resolves. Headless
 * Chrome has no `navigator.share` on every OS, so without this Hand off's
 * button would read `Share link` on one machine and `Copy link` on another. */
const SHARE_SHEET = `Object.defineProperty(navigator, 'share', { configurable: true,
  value: data => { window.__sharedLink = data.url; return Promise.resolve(); } })`;

export class Coach {
  static async open() {
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    /* #316: port 0 lets Chrome pick a free port; `launch` reads it back from
       DevToolsActivePort. A failed launch used to leave the server open and
       the process hanging. */
    let launched, c, clock;
    const errors = [];
    try {
      launched = await launch(0, !!process.env.HEADFUL);
      c = cdp(launched.ws);
      await c.ready;
      c.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
      c.on('Runtime.consoleAPICalled', p => {
        if (p.type === 'error') errors.push(p.args.map(a => a.value ?? a.description).join(' '));
      });
      await c.send('Runtime.enable');
      await c.send('DOM.enable');
      await c.send('Accessibility.enable');
      await c.send('Page.enable');
      await c.send('Animation.setPlaybackRate', { playbackRate: FAST_PLAYBACK_RATE });
      ({ identifier: clock } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: buildClockScript(SMOKE_CLOCK) }));
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: TIMER_TRACKER });
      await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SHARE_SHEET });
    } catch (err) {
      c?.close();
      if (launched) await closeChrome(launched.proc, launched.dir);
      server.close();
      throw err;
    }
    return new Coach({ c, origin, server, proc: launched.proc, dir: launched.dir, errors, clock });
  }

  constructor(s) { Object.assign(this, s); }

  async close() {
    await closeChrome(this.proc, this.dir);
    this.server.close();
  }

  /* ---- arriving ---- */

  /** Open the app on the Team screen with this roster already saved. */
  async onTeamScreen(players = []) {
    this.errors.length = 0;
    await land(this.c, this.origin, { record: teamWith(players), ready: screenReadyExpr('view-team') });
  }

  /** Close the tab and come back: whatever survives is what was saved. */
  async comeBackLater() {
    await land(this.c, this.origin, { record: 'kept', ready: screenReadyExpr('view-team') });
  }

  /** Open the app on Today, game day, with two games planned. */
  async onGameDay() {
    this.errors.length = 0;
    await this.#setClock(SMOKE_CLOCK);
    await land(this.c, this.origin, { record: gameDay(), ready: TODAY_GAME_READY });
  }

  /** Open the app on Today, game day, with a season of three games already filed. */
  async onGameDayMidSeason() {
    this.errors.length = 0;
    await this.#setClock(SMOKE_CLOCK);
    await land(this.c, this.origin, { record: midSeason(), ready: TODAY_GAME_READY });
  }

  /** Open the app for the first time on a device with nothing saved: the welcome screen. */
  async onFreshDevice() {
    this.errors.length = 0;
    await this.#setClock(SMOKE_CLOCK);
    await land(this.c, this.origin, WELCOME_LANDING);
  }

  /** Close the app and open it again `days` days later, keeping what was saved. */
  async comeBackDaysLater(days, ready = `document.querySelector('.card')`) {
    const { y, m, d, h } = SMOKE_CLOCK;
    const later = new Date(y, m - 1, d + days);
    await this.#setClock({ y: later.getFullYear(), m: later.getMonth() + 1, d: later.getDate(), h });
    await land(this.c, this.origin, { record: 'kept', ready });
  }

  /* Swap the pinned clock for one at `pin`, from the next page load on. */
  async #setClock(pin) {
    await this.c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: this.clock });
    ({ identifier: this.clock } = await this.c.send('Page.addScriptToEvaluateOnNewDocument', { source: buildClockScript(pin) }));
  }

  /* ---- doing ---- */

  /** Tap the one control a coach would call `name`. */
  async tap(name) {
    const found = (await this.#controls()).filter(x => x.name === name);
    if (found.length !== 1) {
      const names = (await this.#controls()).map(x => x.name).filter(Boolean);
      throw new Error(`tap ${JSON.stringify(name)}: it ${found.length ? `matches ${found.length} controls` : 'is not on screen'}.`
        + ` On screen: ${JSON.stringify(names)}`);
    }
    const { object } = await this.c.send('DOM.resolveNode', { backendNodeId: found[0].node });
    await this.#tapObject(object.objectId, JSON.stringify(name));
  }

  /** Tap a player's row on the roster, found by the name it shows. */
  async openPlayer(name) {
    const { result } = await this.c.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('#rosterlist .rrow')]
      .find(r => r.querySelector('.prow-t')?.textContent === ${JSON.stringify(name)}) ?? null` });
    if (!result.objectId) throw new Error(`openPlayer ${JSON.stringify(name)}: no such row. Roster: ${JSON.stringify(await this.rosterNames())}`);
    await this.#tapObject(result.objectId, `${name}'s row`);
  }

  /** Tap the Lock on a player's By hand row. Every row's Lock has the same
      name, so the row is found by the player's slider. */
  async lockMinutes(name) {
    const { result } = await this.c.send('Runtime.evaluate', { expression: `[...document.querySelectorAll('.srow')]
      .find(r => r.querySelector('input')?.getAttribute('aria-label') === ${JSON.stringify(`Target minutes for ${name}`)})
      ?.querySelector('.lockbtn') ?? null` });
    if (!result.objectId) throw new Error(`lockMinutes ${JSON.stringify(name)}: no such row on screen`);
    await this.#tapObject(result.objectId, `${name}'s Lock`);
  }

  /* Every control a coach can reach, in document order. A native modal
     <dialog> already takes the page behind it out of Chrome's tree; bench
     mode is an `aria-modal` div, which a screen reader honors and the full
     tree does not, so while one is showing only it and the toasts are
     searched -- the same reach trap.js gives the keyboard. */
  async #controls(rootsExpr = `(() => {
      const top = [...document.querySelectorAll('[aria-modal="true"]')].filter(m => !m.hidden && m.getClientRects().length).pop();
      return top ? [top, document.getElementById('toasts')].filter(Boolean) : [document.documentElement];
    })()`) {
    const { result } = await this.c.send('Runtime.evaluate', { expression: rootsExpr });
    const { result: roots } = await this.c.send('Runtime.getProperties', { objectId: result.objectId, ownProperties: true });
    const seen = new Set(), found = [];
    for (const r of roots.filter(p => /^\d+$/.test(p.name))) {
      for (const n of (await this.c.send('Accessibility.queryAXTree', { objectId: r.value.objectId })).nodes) {
        if (n.ignored || !ROLES.has(n.role?.value) || !n.backendDOMNodeId || seen.has(n.backendDOMNodeId)) continue;
        seen.add(n.backendDOMNodeId);
        found.push({ name: (n.name?.value || '').replace(/\s+/g, ' ').trim(), node: n.backendDOMNodeId });
      }
    }
    return found;
  }

  /* A real mouse tap at the element's center, after checking nothing covers
     it there: a control under a toast or a sheet fails by name. */
  async #tapObject(objectId, label) {
    const { result } = await this.c.send('Runtime.callFunctionOn', { objectId, returnByValue: true, functionDeclaration: `function () {
      this.scrollIntoView({ block: 'center' });
      const r = this.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      if (!top || !(this === top || this.contains(top))) {
        return { error: 'is covered by ' + (top ? top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + '.' + top.className : 'nothing') };
      }
      return { x, y };
    }` });
    const hit = result.value;
    if (hit.error) throw new Error(`tap ${label}: it ${hit.error}`);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.c.send('Input.dispatchMouseEvent', { type, x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
    }
    await quiet(this.c);
  }

  /** Tap a player's button in bench mode by name alone: its full name also
      carries the jersey and live minutes ("3, Ana Reyes, 0 of 16 minutes"). */
  async tapPlayer(name) {
    const hit = (await this.controls()).filter(n => n.split(', ').includes(name));
    if (hit.length !== 1) throw new Error(`tapPlayer ${JSON.stringify(name)}: ${hit.length} buttons. On screen: ${JSON.stringify(await this.controls())}`);
    await this.tap(hit[0]);
  }

  /** Tap a "More <noun>" / "Fewer <noun>" stepper until the number beside it reads `n`.
      The first press is a full tap (hit test and settle); the rest are the same
      mouse presses back to back, since the button does not move, and the
      number is read once at the end -- eight settles to get from 12 to 20
      is most of a scenario's budget. */
  async stepTo(noun, n) {
    const rowOf = `[...document.querySelectorAll('.pstep-btn')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(`More ${noun}`)} && x.getClientRects().length)`;
    const read = () => evalIn(this.c, `(() => { const b = ${rowOf}; return b ? Number(b.closest('.pstep-row').querySelector('.pstep-val').textContent) : null; })()`);
    const at = await read();
    if (at === null) throw new Error(`stepTo ${JSON.stringify(noun)}: no such stepper on screen. On screen: ${JSON.stringify(await this.controls())}`);
    if (at === n) return;
    const button = `${at < n ? 'More' : 'Fewer'} ${noun}`;
    await this.tap(button);
    const rest = Math.abs(n - at) - 1;
    if (rest > 0) {
      const { x, y } = await evalIn(this.c, `(() => {
        const b = [...document.querySelectorAll('.pstep-btn')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(button)} && x.getClientRects().length);
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      for (let i = 0; i < rest; i++) {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await this.c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        }
      }
      await quiet(this.c);
    }
    const now = await read();
    if (now !== n) throw new Error(`stepTo ${JSON.stringify(noun)}: ended at ${now}, wanted ${n}`);
  }

  /** Type into whatever has focus, the way a keyboard (or a paste) would. */
  async type(text) {
    await this.c.send('Input.insertText', { text });
    await quiet(this.c);
  }

  /** Focus the field a coach would call `name` and type over what is in it. */
  async fill(name, text) {
    await this.tap(name);
    await evalIn(this.c, 'document.activeElement.select?.()');
    await this.type(text);
  }

  /** Set the time field a coach would call `name` ("Tip-off") to a readable
      time such as "10:15 AM", typed a key at a time from the hour on: a tap
      would land on the minutes. */
  async setTime(name, time) {
    const m = /^(\d{1,2}):(\d{2}) ([AP])M$/.exec(time);
    if (!m) throw new Error(`setTime ${JSON.stringify(time)}: write it like "10:15 AM"`);
    const keys = m[1].padStart(2, '0') + m[2] + m[3];
    const { result } = await this.c.send('Runtime.evaluate', { expression: 'document.documentElement' });
    const { nodes } = await this.c.send('Accessibility.queryAXTree',
      { objectId: result.objectId, accessibleName: name, role: 'InputTime' });
    if (nodes.length !== 1) throw new Error(`setTime ${JSON.stringify(name)}: ${nodes.length} time fields match`);
    const { object } = await this.c.send('DOM.resolveNode', { backendNodeId: nodes[0].backendDOMNodeId });
    await this.c.send('Runtime.callFunctionOn', { objectId: object.objectId,
      functionDeclaration: 'function () { this.scrollIntoView({ block: "center" }); this.focus(); }' });
    for (const ch of keys) {
      await this.c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch });
      await this.c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
    await quiet(this.c);
  }

  /* ---- seeing ---- */

  /** The names down the roster, top to bottom, as the rows read. */
  rosterNames() {
    return evalIn(this.c, `[...document.querySelectorAll('#rosterlist .rrow .prow-t')].map(e => e.textContent)`);
  }

  /** The line under the team's name: "3 players". */
  rosterCount() { return this.text('#rosterCount'); }

  /** The roster's warning (a shared jersey number), or '' when there is none. */
  warning() { return this.text('#dupewarn'); }

  /** The paste sheet's preview of who it read: "3 players: ...". */
  pasteNote() { return this.text('#pasteNote'); }

  /** The newest toast's message, without its button. */
  toast() {
    return evalIn(this.c, `(() => {
      const t = [...document.querySelectorAll('.toast:not(.out)')].pop();
      if (!t) return '';
      const c = t.cloneNode(true); c.querySelectorAll('button').forEach(b => b.remove());
      return c.innerText.replace(/\\s+/g, ' ').trim();
    })()`);
  }

  /** Who bench mode shows on the floor, top to bottom, by name. */
  onFloor() { return this.#players('#gmFloor'); }

  /** Who bench mode shows on the bench, top to bottom, by name. */
  onBench() { return this.#players('#gmBench'); }

  /* Bench mode's rows read "3, Ana Reyes, 0 of 16 minutes" to a screen
     reader; the name is the part that is not the jersey or the minutes. */
  async #players(sel) {
    return (await this.#controls(`[document.querySelector(${JSON.stringify(sel)})].filter(Boolean)`))
      .map(x => x.name.split(', ').find(p => !/^\d+$/.test(p) && !/ minutes$/.test(p)));
  }

  /** Bench mode's stint counter: "1 of 8". */
  stint() { return this.text('#gmClock'); }

  /** The Season screen's minutes so far, as `{ name: minutes }`. */
  seasonMinutes() {
    return evalIn(this.c, `Object.fromEntries([...document.querySelectorAll('#seasonbox .sn-row')]
      .map(r => [r.querySelector('.sn-nm').textContent, Number(r.querySelector('.sn-min').textContent)]))`);
  }

  /** The Plan's minutes per player, as `{ name: minutes }`, from the timeline's rows. */
  planMinutes() {
    return evalIn(this.c, `Object.fromEntries([...document.querySelectorAll('.tl-name')]
      .map(b => b.getAttribute('aria-label').match(/^(.+?), ([\\d.]+) minutes/))
      .map(m => [m[1], Number(m[2])]))`);
  }

  /** How many stints the timeline says the plan has: the N in "of N stints". */
  async planStints() {
    const counts = await evalIn(this.c, `[...new Set([...document.querySelectorAll('.tl-name')]
      .map(b => b.getAttribute('aria-label').match(/of (\\d+) stints$/)?.[1]))]`);
    if (counts.length !== 1) throw new Error(`planStints: the timeline shows ${JSON.stringify(counts)}`);
    return Number(counts[0]);
  }

  /** The starting five the card prints, in card order, as it shows them. Needs Card view. */
  starters() {
    return evalIn(this.c, `[...(document.querySelector('#sheet .card .stint .five')?.querySelectorAll('.nm') ?? [])].map(e => e.textContent)`);
  }

  /** The players whose Lock is on, in By hand order. */
  lockedMinutes() {
    return evalIn(this.c, `[...document.querySelectorAll('.srow')]
      .filter(r => r.querySelector('.lockbtn')?.getAttribute('aria-pressed') === 'true')
      .map(r => r.querySelector('input').getAttribute('aria-label').replace(/^Target minutes for /, ''))`);
  }

  /** Bench mode: who is on the floor in each stint from this one to the last (walks 'Next stint'). */
  async floorEachStint() {
    const floors = [];
    for (;;) {
      floors.push(await this.onFloor());
      const [at, of] = (await this.stint()).split(' of ').map(Number);
      if (at >= of) return floors;
      await this.tap('Next stint');
    }
  }

  /** The Blocked plan panel's words, without its button; '' when the plan is not blocked. */
  blockedPlan() {
    return evalIn(this.c, `(() => {
      const t = document.querySelector('#timeline .empty');
      if (!t) return '';
      return [...t.children].filter(c => c.tagName !== 'BUTTON').map(c => c.textContent.trim()).join(' ');
    })()`);
  }

  /** Whether the Tour is up, waiting up to `ms` for it: it opens a beat after
      the setup flow closes. Answers as soon as it shows; a coach who has seen
      the Tour waits the whole time. */
  async tourShows(ms = 1500) {
    const up = `(() => { const t = document.getElementById('tour'); return !!t && !t.hidden && t.getClientRects().length > 0; })()`;
    for (const end = Date.now() + ms; Date.now() < end;) {
      if (await evalIn(this.c, up)) return true;
      await new Promise(ok => setTimeout(ok, 50));
    }
    return false;
  }

  /** The names of every control on screen, top to bottom. */
  async controls() {
    return (await this.#controls()).map(x => x.name).filter(Boolean);
  }

  /** Whether a control a coach would call `name` is showing. */
  async sees(name) {
    return (await this.controls()).includes(name);
  }

  /** What is in the field a coach would call `name`. */
  async valueOf(name) {
    const hit = (await this.#controls()).find(x => x.name === name);
    if (!hit) return null;
    const { object } = await this.c.send('DOM.resolveNode', { backendNodeId: hit.node });
    const { result } = await this.c.send('Runtime.callFunctionOn',
      { objectId: object.objectId, functionDeclaration: 'function () { return this.value; }', returnByValue: true });
    return result.value;
  }

  /** What a screen reader would announce for the focused control. */
  focused() {
    return evalIn(this.c, `(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return '';
      return (el.getAttribute('aria-label') || el.innerText || '').replace(/\\s+/g, ' ').trim();
    })()`);
  }

  /** The text in `sel` as it renders (innerText, so separate boxes keep a gap). */
  text(sel) {
    return evalIn(this.c, `(document.querySelector(${JSON.stringify(sel)})?.innerText || '').replace(/\\s+/g, ' ').trim()`);
  }

  /** Today's games, top to bottom, as the passes read ("Hawks, 9:00 AM, planned"). */
  async todayGames() {
    return (await this.#controls(`[document.querySelector('#todayGames')].filter(Boolean)`)).map(x => x.name);
  }

  /** The open game's minutes per player, as `{ 'Full Name': minutes }`. */
  async gameMinutes() {
    const rows = await this.#controls(`[document.querySelector('#timeline')].filter(Boolean)`);
    return Object.fromEntries(rows.map(x => /^(.*), (\d+) minutes/.exec(x.name)).filter(Boolean).map(m => [m[1], Number(m[2])]));
  }

  /** The Season screen's rows, as `{ callName: 'N games · M behind' }`: the
      second line a screen reader reads under each name. */
  seasonStanding() {
    return evalIn(this.c, `Object.fromEntries([...document.querySelectorAll('#seasonbox .sn-row')]
      .map(r => [r.querySelector('.sn-nm').textContent, r.querySelector('.sr-only')?.textContent.trim() ?? '']))`);
  }

  /** Tap the control a coach would call `name` and return the file the browser
      saved, as `{ filename, text }`. */
  async download(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchcard-download-'));
    try {
      await this.c.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir, eventsEnabled: true });
      const done = new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(new Error(`download ${JSON.stringify(name)}: no file saved within 5s`)), 5000);
        this.c.on('Browser.downloadProgress', p => {
          if (p.state === 'completed') { clearTimeout(timer); ok(); }
          if (p.state === 'canceled') { clearTimeout(timer); fail(new Error(`download ${JSON.stringify(name)}: the browser canceled it`)); }
        });
      });
      done.catch(() => {});
      await this.tap(name);
      await done;
      const files = fs.readdirSync(dir);
      if (files.length !== 1) throw new Error(`download ${JSON.stringify(name)}: saved ${files.length} files: ${JSON.stringify(files)}`);
      return { filename: files[0], text: fs.readFileSync(path.join(dir, files[0]), 'utf8') };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /* ---- Settings ---- */

  /** Open the app on Today, game day, with a second Team (JV Ravens) beside
      Smoke Test: 10 other players, an empty season. Smoke Test is the one showing. */
  async onGameDayWithTwoTeams() {
    const two = withSecondTeam(gameDay());
    two.teams[1].players = SAMPLE_PLAYERS.map(p => ({ ...p }));
    two.teams[1].season = { games: [] };
    this.errors.length = 0;
    await this.#setClock(SMOKE_CLOCK);
    await land(this.c, this.origin, { record: two, ready: TODAY_GAME_READY });
  }

  /** Close the app and open it again where the coach left it: `screen` is
      'today', 'team', 'season' or 'settings'. Whatever survives was saved. */
  async comeBackLaterOn(screen) {
    await land(this.c, this.origin, { record: 'kept', ready: screenReadyExpr(`view-${screen}`) });
  }

  /** Whether the button a coach would call `name` is pressed in. */
  async isPressed(name) {
    const hit = (await this.#controls()).find(x => x.name === name);
    if (!hit) throw new Error(`isPressed ${JSON.stringify(name)}: not on screen. On screen: ${JSON.stringify(await this.controls())}`);
    const { object } = await this.c.send('DOM.resolveNode', { backendNodeId: hit.node });
    const { result } = await this.c.send('Runtime.callFunctionOn',
      { objectId: object.objectId, functionDeclaration: 'function () { return this.getAttribute("aria-pressed"); }', returnByValue: true });
    return result.value === 'true';
  }

  /** The color the page paints behind everything, as the browser reports it. */
  pageBackground() {
    return evalIn(this.c, 'getComputedStyle(document.body).backgroundColor');
  }

  /** The question the app is asking in its own dialog -- `{ title, body, modal }`
      -- or null when none is open. */
  dialog() {
    return evalIn(this.c, `(() => {
      const d = document.getElementById('confirm');
      if (!d || d.hidden) return null;
      const t = id => document.getElementById(id).innerText.replace(/\\s+/g, ' ').trim();
      return { title: t('confirmTitle'), body: t('confirmBody'), modal: d.getAttribute('aria-modal') === 'true' };
    })()`);
  }

  /* Poll `ready` until it holds, for at most 5 seconds. */
  async #until(what, ready) {
    for (let i = 0; i < 100; i++) {
      if (await ready()) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`${what}: nothing happened in 5 seconds`);
  }

  /** Tap the control a coach would call `name` ("Restore from a file") and
      answer the file picker it opens with `file`, a `{ filename, text }` as
      `download` returns it. Waits for the app to answer with a toast that
      differs from the one showing before the tap. The file is written under
      this Chrome's own profile dir, which closeChrome removes. */
  async pickFile(name, { filename, text }) {
    if (!this.picking) {
      /* Registered once: `c.on` has no off. */
      this.picking = {};
      this.c.on('Page.fileChooserOpened', p => {
        if (this.picking.file) this.c.send('DOM.setFileInputFiles', { files: [this.picking.file], backendNodeId: p.backendNodeId });
      });
      await this.c.send('Page.setInterceptFileChooserDialog', { enabled: true });
    }
    this.picking.file = path.join(this.dir, filename);
    fs.writeFileSync(this.picking.file, text);
    const was = await this.toast();
    await this.tap(name);
    await this.#until(`pickFile ${JSON.stringify(name)}`, async () => (await this.toast()) !== was);
    await quiet(this.c);
  }

  /** The Card's Change lines, top to bottom, as they read ("Q2 8:00 ▼ANA SAM THEO"). The first copy of the card only. */
  changeLines() {
    return evalIn(this.c, `[...document.querySelectorAll('#sheet .card:not(.card-copy) .stint .chg')]
      .map(e => e.innerText.replace(/\\s+/g, ' ').trim())`);
  }

  /** The card's size in inches, as a ruler would read the print: '3.45 × 5' or '8 × 5.1'. */
  cardSize() {
    return evalIn(this.c, `(() => {
      const s = getComputedStyle(document.querySelector('#sheet .card:not(.card-copy)'));
      return [s.width, s.height].map(v => +(parseFloat(v) / 96).toFixed(2)).join(' × ');
    })()`);
  }

  /** Each Stint's five on the Card, top to bottom, as the card shows them (['ANA', 'CASE', ...]). */
  cardFives() {
    return evalIn(this.c, `[...document.querySelectorAll('#sheet .card:not(.card-copy) .stint')]
      .map(s => [...s.querySelectorAll('.five .nm')].map(e => e.textContent))`);
  }

  /** Pick `option` in the dropdown a coach would call `name`: tap it, then pick
      the option as its open list does -- select it and fire input and change.
      Typed keys reach the list in headless Chrome on a Mac but not on Linux,
      so the list itself is the one step played by script. Fails by name if no
      option reads `option`, or if the dropdown does not keep it. */
  async choose(name, option) {
    await this.tap(name);
    const found = await evalIn(this.c, `(() => {
      const sel = document.activeElement;
      const o = [...(sel?.options ?? [])].find(o => o.text === ${JSON.stringify(option)});
      if (!o) return false;
      sel.value = o.value;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!found) throw new Error(`choose ${JSON.stringify(name)}: no option reads ${JSON.stringify(option)}`);
    await quiet(this.c);
    const shown = await evalIn(this.c, 'document.activeElement.selectedOptions?.[0]?.text ?? null');
    if (shown !== option) throw new Error(`choose ${JSON.stringify(name)}: wanted ${JSON.stringify(option)}, it shows ${JSON.stringify(shown)}`);
  }

  /** The last link the share sheet was given; fails if nothing was shared. */
  async sharedLink() {
    const url = await evalIn(this.c, 'window.__sharedLink ?? null');
    if (!url) throw new Error('sharedLink: nothing was shared');
    return url;
  }

  /** Open `url` in a fresh page with no saved record (another phone) and wait for the game screen. */
  async openLink(url) {
    const u = new URL(url, this.origin);
    await this.c.send('Page.navigate', { url: 'about:blank' });
    await land(this.c, this.origin, { record: 'wiped', page: u.pathname, query: u.hash, ready: GAMES_VIEW_READY });
  }

  /** Whether the button a coach would call `name` is disabled. */
  async isDisabled(name) {
    const hit = (await this.#controls()).find(x => x.name === name);
    if (!hit) throw new Error(`isDisabled ${JSON.stringify(name)}: not on screen. On screen: ${JSON.stringify(await this.controls())}`);
    const { object } = await this.c.send('DOM.resolveNode', { backendNodeId: hit.node });
    const { result } = await this.c.send('Runtime.callFunctionOn',
      { objectId: object.objectId, functionDeclaration: 'function () { return this.disabled; }', returnByValue: true });
    return result.value === true;
  }
}
