/* Benchcard analytics.

   Two layers, one switch (see notes/ROADMAP.md §1):

   - Cloudflare Web Analytics for the baseline — cookieless, no fingerprint,
     no consent banner, one script tag. Visits, referrers, devices, vitals.
   - Eleven product events, each attached to a decision someone would act on,
     posted to a Worker that writes them to Analytics Engine. (Ten of them are
     product; the eleventh, `app_error`, is the one exception -- see the note
     beside it.)

   The line that must not be crossed: **counters only**. No player names, no
   team name, no opponent, no free text of any kind. That is enforced here
   structurally rather than by care at the call site — `payload()` knows every
   event and every field it may carry, a string field must match one of a
   fixed set of literals, and a number field is clamped to a small integer.
   Anything else is dropped. A call site that tries to send a name cannot.

   The off switch is real and still works -- with ANALYTICS null every function
   here is a no-op that returns false, loads nothing and touches no network --
   but it is NOT off: the token and endpoint below are filled in and live. This
   comment said "off by default" for months after they were. */

// ---------------------------------------------------------------------------
// Fill this in to switch analytics on. Either field may stay null on its own.
//   token    — Cloudflare Web Analytics beacon token (baseline pageviews)
//   endpoint — the Worker URL that records product events
export const ANALYTICS = {
  token: 'f4226e9e324b4385ad41e45c1dd20b80',
  // Same origin on purpose: no CORS, no preflight, no second host in anyone's
  // network tab, and the footer's promise stays literally true because the only
  // thing that ever goes is a counter. Handled by src/index.js.
  endpoint: '/e',
};
// The token is a public beacon identifier, not a secret — it is designed to be
// served to every visitor, so committing it is correct. It is bound to the
// benchcard.app hostname, so it reports nothing from localhost. That is
// expected, not a fault: do not go looking for local pageviews.
// ---------------------------------------------------------------------------

const NUMBER = Symbol('number');

/* Every event and, per event, every field it is allowed to carry. A string
   field lists its permitted values; NUMBER means a small non-negative count. */
export const EVENTS = {
  /* THE SECOND EXCEPTION to "this list does not grow", and it is a
     denominator, not a curiosity. `first_run_complete` below has been a COUNT
     since it shipped: a hundred of them is a triumph or a disaster depending
     on how many people met the first screen, and nothing has ever recorded
     that. So "does onboarding work?" was unanswerable, and A51 rebuilt that
     screen on a diagnosis nobody could check. Fires once per cold load, and
     only for a coach with no record -- `initOnboarding`, behind
     `!state.onboarded`, the same question app.js asks to pick the view. No
     fields: a rate needs two counts and nothing else. */
  welcome_seen: {},
  // Does onboarding actually work?
  first_run_complete: { roster: ['1-5', '6-9', '10-12', '13+'] },
  // Does anyone use anything but Balanced?
  plan_generated: { strategy: ['balanced', 'minutes', 'closers', 'platoon'] },
  // The core conversion. Is the card the point?
  card_printed: { size: ['pocket', 'half'] },
  /* The other half of that question: a card that gets sent to another coach is
     the whole word-of-mouth story. `how` separates the platforms that got a
     real share sheet from the desktops that fell back to the clipboard. */
  card_shared: { how: ['shared', 'copied', 'saved'] },
  // Was the phone-as-card thesis right?
  game_mode_opened: {},
  // Is tournament mode real, or did we build it for one coach?
  day_game_count: { games: NUMBER },
  // Do coaches install it, or bookmark it?
  pwa_installed: {},
  /* Multi-team: does the second team exist outside our heads? A count only --
     never a name. `team_added` firing without `team_switched` following would
     say coaches try it once and abandon it, which is the answer that matters. */
  team_added: { teams: NUMBER },
  team_switched: { teams: NUMBER },
  team_removed: { teams: NUMBER },
  /* THE ONE EXCEPTION, and it is recorded here so the precedent survives it.
     The standing rule is that this list does not grow: every entry costs a
     decision to justify it, and "we might want to know" is not one. This entry
     is not a product question. Until it existed the app had no way to tell
     anyone it had broken -- no `window.onerror`, no `unhandledrejection`, no
     try/catch at the boot boundary -- so a coach whose app died in a gym was
     the only person who would ever know, and they had a dead shell to look at.
     A counter is the smallest thing that changes that.

     What keeps "counters only, never a name, team or opponent" LITERALLY true
     is the shape, not the intent: `where` is a bounded list of five literals,
     and there is no message field and no stack field to add one to. The
     classifier (`errorWhere`) never returns anything but one of these five, so
     the whitelist below has nothing to reject. Do not add `message`, `stack`,
     `url` or a count of anything a coach typed. */
  app_error: { where: ['boot', 'render', 'solve', 'storage', 'share'] },
};

/* Which half of the app threw, from the script it threw in -- never from the
   message, which is the only place user data could ever appear.
 *
 * The filename is one of our own asset paths and is used ONLY to pick one of
 * `EVENTS.app_error.where`'s five literals; it is not sent and never leaves
 * this function. `painted` false wins outright: an error before the first
 * paint is a boot failure whatever module raised it, and that is the case a
 * coach cannot work around.
 */
const WHERE = {
  'engine.js': 'solve', 'rules.js': 'solve', 'strategy.js': 'solve', 'balance.js': 'solve',
  'storage.js': 'storage', 'backup.js': 'storage', 'state.js': 'storage',
  'share.js': 'share',
};
export function errorWhere(src, painted) {
  if (!painted) return 'boot';
  return WHERE[String(src || '').split(/[/\\?#]/).filter(Boolean).pop()] || 'render';
}

/* Roster sizes are bucketed rather than sent exact: a team is identifiable by
   its size far more easily than people expect, and "does onboarding work" is
   answered just as well by the bucket. */
export function bucketRoster(n) {
  const k = Math.floor(Number(n) || 0);
  if (k <= 5) return '1-5';
  if (k <= 9) return '6-9';
  if (k <= 12) return '10-12';
  return '13+';
}

/* The whole privacy guarantee lives in this function, which is why it is pure
   and tested. Returns null for anything it does not recognise — an unknown
   event never becomes a request. */
export function payload(name, props) {
  const schema = Object.prototype.hasOwnProperty.call(EVENTS, name) ? EVENTS[name] : null;
  if (!schema) return null;
  const out = { e: name };
  for (const [field, allowed] of Object.entries(schema)) {
    const v = props ? props[field] : undefined;
    if (v === undefined || v === null) continue;
    if (allowed === NUMBER) {
      const n = Math.floor(Number(v));
      if (Number.isFinite(n)) out[field] = Math.max(0, Math.min(99, n));
    } else if (allowed.includes(v)) {
      out[field] = v;
    }
    // anything else is dropped on the floor, deliberately and silently
  }
  return out;
}

/* Fire and forget. sendBeacon survives the page going away, which matters for
   card_printed and pwa_installed; fetch with keepalive is the fallback. */
export function track(name, props) {
  const url = ANALYTICS && ANALYTICS.endpoint;
  if (!url) return false;
  const body = payload(name, props);
  if (!body) return false;
  try {
    const json = JSON.stringify(body);
    if (navigator.sendBeacon) return navigator.sendBeacon(url, json);
    fetch(url, { method: 'POST', body: json, keepalive: true, mode: 'no-cors' }).catch(() => {});
    return true;
  } catch {
    return false; // analytics must never be able to break the app
  }
}

/* The Cloudflare beacon. Injected rather than hard-coded into index.html so
   that the single ANALYTICS constant really is the whole switch, and so the
   markup carries no third-party script when it is off. */
export function startAnalytics() {
  const token = ANALYTICS && ANALYTICS.token;
  if (!token || typeof document === 'undefined') return false;
  const s = document.createElement('script');
  // Cloudflare's own snippet uses type=module; defer is implicit for modules
  // and setting both would be contradictory.
  s.type = 'module';
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.dataset.cfBeacon = JSON.stringify({ token });
  document.head.append(s);
  return true;
}
