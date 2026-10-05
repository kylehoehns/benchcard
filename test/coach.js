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

import { serve } from '../scripts/serve.mjs';
import { launch, cdp, closeChrome, hasChrome } from '../scripts/smoke/chrome.mjs';
import { evalIn, quiet, screenReadyExpr, FAST_PLAYBACK_RATE, TIMER_TRACKER } from '../scripts/smoke/dom.mjs';
import { land } from '../scripts/smoke/page-state.mjs';
import { buildClockScript, SMOKE_CLOCK } from '../scripts/smoke/clock.mjs';
import { RICH, TODAY_GAME_READY } from '../scripts/smoke/fixtures.mjs';

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

export class Coach {
  static async open() {
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const port = 9222 + 500 + Math.floor(Math.random() * 2000);
    const { proc, dir, ws } = await launch(port, !!process.env.HEADFUL);
    const c = cdp(ws);
    await c.ready;
    const errors = [];
    c.on('Runtime.exceptionThrown', p => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    c.on('Runtime.consoleAPICalled', p => {
      if (p.type === 'error') errors.push(p.args.map(a => a.value ?? a.description).join(' '));
    });
    await c.send('Runtime.enable');
    await c.send('DOM.enable');
    await c.send('Accessibility.enable');
    await c.send('Page.enable');
    await c.send('Animation.setPlaybackRate', { playbackRate: FAST_PLAYBACK_RATE });
    const { identifier: clock } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: buildClockScript(SMOKE_CLOCK) });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: TIMER_TRACKER });
    return new Coach({ c, origin, server, proc, dir, errors, clock });
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
}
