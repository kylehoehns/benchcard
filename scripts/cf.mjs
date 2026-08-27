/* The Cloudflare read plumbing, once.
 *
 * `scripts/card-prints.mjs` and `scripts/traffic.mjs` both ask Cloudflare the
 * same kind of question, and before this file existed they each carried their
 * own copy of: read the token out of the environment, build the URL, POST,
 * check the status, parse the body, keep the token out of the error. Two
 * copies of auth plumbing is exactly the "duplicated logic that should have
 * one source" the tech-debt ledger sweeps for, and the copies had already
 * started to drift — one hard-required an account id from the environment
 * that the other could have defaulted.
 *
 * WHAT YOU NEED, and this module cannot get it for you
 *
 * `CLOUDFLARE_API_TOKEN` — a read-only token, created at
 * dash.cloudflare.com/profile/api-tokens ("Create Custom Token"), carrying
 * exactly two permissions:
 *
 *     Account -> Account Analytics -> Read     (the events, via the SQL API)
 *     Zone    -> Analytics         -> Read     (zone traffic, via GraphQL)
 *
 * `card-prints.mjs` needs only the first. Nothing here needs Workers, DNS or
 * write access of any kind: a token scoped this narrowly cannot deploy, cannot
 * change a record, and cannot read a request body.
 *
 * The token is read from the environment and is NEVER written to disk, echoed
 * in output, or included in an error message — `fail()` below is the only
 * place errors are built, so that guarantee has one place to hold. Prefer a
 * shell that keeps the line out of your history (a leading space, or a `.env`
 * you source): a token in a shell history is a token you have leaked.
 *
 * The account and zone ids ARE NOT SECRETS. They identify which account and
 * which hostname to ask about; they authorise nothing on their own, they are
 * visible in the URL of any dashboard page, and defaulting them is what makes
 * these scripts one command rather than a paragraph of setup.
 */

/* benchcard.app. Identifiers, not credentials — see above. Overridable from
   the environment so the same scripts work against a different account
   without editing them. */
export const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || 'd62c22c8dbe2380b540a92580ef4de5c';
export const ZONE = process.env.CLOUDFLARE_ZONE_ID || '6f4c565bdccc4ee268644326e9476f1d';

/* The Analytics Engine dataset `src/index.js` writes to (`wrangler.jsonc`,
   binding `AE`). */
export const DATASET = 'benchcard_events';

const API = 'https://api.cloudflare.com/client/v4';

/* `_sample_interval` rather than `count()` everywhere downstream: Analytics
   Engine samples under load and each stored row stands for that many real
   ones. Summing the interval is the only count that stays true if the dataset
   ever gets busy. The window is clamped here so that nothing a caller was
   handed on the command line can be interpolated into a query. */
export function windowDays(days, { fallback = 30, max = 365 } = {}) {
  const n = Math.floor(Number(days));
  return Number.isFinite(n) ? Math.max(1, Math.min(max, n)) : fallback;
}

/* Every error out of this module goes through here, so there is exactly one
   line to audit for "does an error ever carry the token". It does not: the
   token is never passed in, and callers hand over a status and a response
   body, neither of which contains a request header. */
export function fail(message, body) {
  const detail = body ? `\n${String(body).slice(0, 500)}` : '';
  return new Error(`${message}${detail}`);
}

/* Thrown, not returned, and the message names the permissions rather than
   telling you to go and find them. */
export function readToken(env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw fail(
      'CLOUDFLARE_API_TOKEN is not set. It needs exactly two read permissions:\n'
        + '  Account -> Account Analytics -> Read\n'
        + '  Zone    -> Analytics         -> Read\n'
        + 'Create one at dash.cloudflare.com/profile/api-tokens.',
    );
  }
  return token;
}

/* `src/index.js` packs `blobs = [event name, country, ...string fields in
   EVENTS order]` and sends numbers to `doubles` instead. So the column that
   holds a given dimension moves the moment somebody adds a string field ahead
   of it, silently and with no error anywhere. Derive it from the schema rather
   than typing `blob3` and hoping; `test/card-prints.test.js` pins the
   derivation against the three lines of the writer it depends on.
   A field declaring an array of permitted literals is a string field; NUMBER
   is a Symbol and is not. */
export function blobColumn(events, event, field) {
  const schema = events[event];
  if (!schema) throw new Error(`unknown event: ${event}`);
  const strings = Object.keys(schema).filter((f) => Array.isArray(schema[f]));
  const at = strings.indexOf(field);
  if (at < 0) throw new Error(`${event} has no string field named ${field}`);
  return `blob${at + 3}`; // blob1 = event name, blob2 = country
}

/* The SQL API answers in two shapes depending on whether the query asked for
   `FORMAT JSONEachRow`: newline-delimited objects if it did, and a single
   `{meta, data, rows}` envelope if it did not. Both are in use here — the
   verified production queries carry the FORMAT clause and `card-prints.mjs`
   does not — so parse either rather than making the caller remember which. */
export function parseRows(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  try {
    const one = JSON.parse(trimmed);
    if (Array.isArray(one)) return one;
    if (one && Array.isArray(one.data)) return one.data;
    if (one && typeof one === 'object') return [one];
  } catch {
    // not a single JSON document: fall through to newline-delimited
  }
  const rows = [];
  for (const line of trimmed.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try { rows.push(JSON.parse(s)); } catch { throw fail('Could not parse a row from the SQL API response.', s); }
  }
  return rows;
}

/* `fetchImpl` is injected rather than reached for so the callers can be tested
   without network access — the CI `tests` job has no credentials and should
   not be making live API calls even if it had them. */
export async function sqlQuery(query, { token, account = ACCOUNT, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(
    `${API}/accounts/${encodeURIComponent(account)}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: query },
  );
  const text = await res.text();
  if (!res.ok) {
    throw fail(
      res.status === 403
        ? 'The SQL API refused the token (403). It needs Account -> Account Analytics -> Read.'
        : `The Analytics Engine SQL API returned ${res.status}.`,
      text,
    );
  }
  return parseRows(text);
}

/* GraphQL answers 200 with an `errors` array for a bad query or a token
   missing the zone permission, so the status alone is not the check. */
export async function graphqlQuery(query, variables, { token, fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw fail(
      res.status === 403
        ? 'The GraphQL API refused the token (403). It needs Zone -> Analytics -> Read.'
        : `The Cloudflare GraphQL API returned ${res.status}.`,
      text,
    );
  }
  let body;
  try { body = JSON.parse(text); } catch { throw fail('The GraphQL API returned something that is not JSON.', text); }
  if (body && Array.isArray(body.errors) && body.errors.length) {
    throw fail('The GraphQL API returned errors.', body.errors.map((e) => e && e.message).join('; '));
  }
  return body && body.data;
}
