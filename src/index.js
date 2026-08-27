/* The Benchcard Worker.
 *
 * The site is static — `app/` is the whole thing, served by Cloudflare's asset
 * layer without this script running at all. The only reason server code exists
 * is to receive the eleven product events, because until now they had nowhere
 * to go: Web Analytics told us people arrive, and nothing told us whether
 * anybody prints a card or opens bench mode.
 *
 * Three decisions worth stating.
 *
 * **Same origin.** The endpoint is `/e` on benchcard.app, not a third-party
 * host. No CORS, no preflight, no second domain in anyone's network tab, and
 * the privacy line on the footer stays literally true — the only thing that
 * ever leaves the device is a counter.
 *
 * **The server re-validates.** A public endpoint takes whatever the internet
 * sends it. `payload()` is imported from the app's own analytics module rather
 * than reimplemented, so the client and the server cannot drift about what a
 * legal event is: one whitelist, one place, already tested. Anything it does
 * not recognise is dropped on the floor, not stored and not echoed back.
 *
 * **It degrades.** If the Analytics Engine binding is absent — a preview
 * deploy, a plan without it — the event is written to the log instead, which
 * `observability` in wrangler.jsonc is already capturing at full rate. The
 * endpoint never fails because of how the account is configured. The rate
 * limiter below follows the same rule: no binding, no limit, never a failure.
 */
import { payload, EVENTS } from '../app/analytics.js';

/* Small enough that an oversized body is a mistake or an attack, never a real
   event: the largest legal payload is an event name and one short field. */
const MAX_BODY = 512;

/* No body is echoed back and no error is explained. An endpoint that reports
   why it rejected something is a probe for what it would accept. */
const NO_CONTENT = () => new Response(null, { status: 204 });

/* A ceiling on how often one caller may post. Be honest about what it buys: it
   makes the counters *harder* to poison, not trustworthy — the limit is per
   Cloudflare location, and anyone willing to spread across addresses still gets
   through. What it actually buys is a cap on the bill, because a loop against
   `/e` runs up Worker invocations and Analytics Engine data points on the
   account whether or not anything legal is ever written.

   The address is the only key available: no accounts, no cookies, nothing else
   identifies a caller. It has a real false positive — a gym full of coaches is
   one venue's wifi and one address — which is why the numbers in wrangler.jsonc
   are set generously rather than tightly. The address is read here, used here,
   and goes nowhere else: `record()` still takes country and nothing more.

   Requests arriving without the header (local `wrangler dev`, the tests) share
   one bucket, which is correct — off Cloudflare there is no caller to tell
   apart. */
async function allowed(env, req) {
  if (!env.LIMITER) return true; // preview deploy or unconfigured account
  try {
    const { success } = await env.LIMITER.limit({
      key: req.headers.get('CF-Connecting-IP') || 'unkeyed',
    });
    return success;
  } catch {
    return true; // never fail a beacon over how the account is configured
  }
}

function record(env, event, req) {
  /* Country only, and only because "is this one league or several" is the
     question a counter cannot answer on its own. No IP, no user agent, no
     referrer, nothing that narrows to a person. Cloudflare hands this over
     without our asking; taking less of it than we are given is the point. */
  const country = req.cf?.country || 'XX';
  const fields = Object.keys(EVENTS[event.e] || {});
  const blobs = [event.e, country];
  const doubles = [];
  for (const f of fields) {
    const v = event[f];
    if (v == null) continue;
    if (typeof v === 'number') doubles.push(v);
    else blobs.push(String(v));
  }

  if (env.AE) {
    env.AE.writeDataPoint({ blobs, doubles, indexes: [event.e] });
    return;
  }
  // No dataset bound: Workers Logs is on at full sampling, so this is still
  // a usable signal rather than a silent drop.
  console.log(JSON.stringify({ benchcard_event: event, country }));
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);

    if (url.pathname === '/e') {
      // The beacon only ever POSTs. Anything else is somebody looking around.
      if (req.method !== 'POST') return new Response(null, { status: 405 });

      /* Checked before the body is read, so a flood costs as little as we can
         make it cost. A limited request gets the same 204 as a malformed one:
         204 and not 429 for the reason above — a rejection that explains
         itself tells a caller exactly what to change. */
      if (!(await allowed(env, req))) return NO_CONTENT();

      let body;
      try {
        const text = await req.text();
        if (text.length > MAX_BODY) return NO_CONTENT();
        body = JSON.parse(text);
      } catch {
        return NO_CONTENT();
      }

      // `payload` is the same whitelist the client runs: it returns null for an
      // event it does not know, and strips every field the event never declared.
      const clean = body && typeof body === 'object' ? payload(body.e, body) : null;
      if (clean) {
        try { record(env, clean, req); } catch { /* never fail a beacon */ }
      }
      return NO_CONTENT();
    }

    /* Everything else is the site. Cloudflare serves assets before this script
       runs, so in practice this is the 404 path — but routing it explicitly
       means the Worker behaves the same however the asset layer is configured,
       rather than depending on it. */
    return env.ASSETS.fetch(req);
  },
};
