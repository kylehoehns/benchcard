# #250 — hand off a game with a link or QR code

## Issue

#250: let a coach hand a game to an assistant with a link or a QR code, with
no accounts and no server.

## Goal

The head coach taps Hand off. The assistant scans the code, and their phone
opens the same game, ready for bench mode. The assistant can run subs from
it. Nothing passes through a server: the plan travels in the part of the URL
after `#`, which browsers never send.

## What the survey found

- `app/vendor/` holds only motion, fonts and icons. There is no QR encoder.
  Vendored code is pinned in `app/vendor/fetch.sh`, and CI diffs its output
  byte for byte.
- `#shareBtn` (`app/app.js:176`) is the one door into `#sheetCard`, the card
  sheet on the game screen.
- `?try=N` (`app/onboarding.js`) is the only URL the app reads on load today.
  Nothing reads `location.hash`.
- `storage.js` `sanitizeTeam` (line 426) and `sanitize` (line 649) already
  turn untrusted JSON into a valid team. That is where a link's contents get
  cleaned.
- The six chart pages say "Your roster never leaves your device."
  `notes/ROADMAP.md:48` calls handing the plan over digitally out of reach.

## Decisions (made with the human)

1. **A live copy, with no syncing.** The assistant's phone gets a working
   copy and can swap and sit kids in bench mode. The two phones are not
   linked, so they drift apart after the first change on either one.
2. **One game and its roster.** The link carries:
   - the game the coach is looking at: format, sub interval, strategy,
     balance, seed, its rules, and who is out;
   - the exact stints the card shows;
   - where the game stands (`live.at`, overrides, `finished`) if it is
     underway;
   - the roster: id, card name, number and level per kid;
   - the team's id, name and color.

   It carries no season and no other games.
3. **Short names only, never the full name.** Each kid travels as the name
   bench mode calls them by: `roster.js` `callNames` ("Priya", or "Priya R."
   when two kids share a first name). The card's 5-letter abbreviations
   ("PRIY") are re-derived from that on the receiving phone, as they are
   everywhere. The Hand off sheet lists the names that will travel before the
   coach shares. (The human chose "card names"; the survey found the card
   prints 5-letter abbreviations, which would leave bench mode calling
   "PRIY", so the call name is the closest thing that keeps the intent.)
4. **A team already on the phone.** Teams are matched by team id. If the
   phone has the team, the handed-off game replaces the game with the same id
   in that team's days, or is added to today if there is none. The phone's
   own roster is kept: link names never overwrite it, and a kid in the link
   who is not on the phone is added with their card name. With no match, a
   new team is created.
5. **QR code from a pinned library, loaded on demand.** Add `uqr@0.1.3`
   (MIT, one ES module with no imports, 27.7 KB, exports `encode` and
   `renderSVG`) through `app/vendor/fetch.sh` as `app/vendor/uqr.mjs`, pinned
   like motion. It is fetched
   only when the Hand off sheet opens, so first paint does not grow. It is
   precached so a hand-off works offline.
6. **The privacy line stays.** The server still never sees the roster. The
   Hand off sheet says plainly that anyone the link is sent to can open it,
   and shows which names it carries.

## What would settle it

Fixture: 12 kids with first and last names (two share a first name), 4 × 8, sub every
2 (16 stints), 3 rules (a cap, a pair, an apart), underway at stint 5 with one
hand swap.

- **Size.** The whole URL for the fixture is ≤ 1,200 characters.
- **The QR code is the link.** In a smoke check at 390×844, the code drawn on
  the sheet has, module for module, the matrix `encode(url)` returns for the
  URL that Share link hands out. On the preview, Chrome's `BarcodeDetector`
  (macOS) decodes a screenshot of it back to that same URL.
- **Round trip.** Opening the link on a fresh device (empty storage) gives a
  game whose effective stints, effective minutes, `live.at` and hand swaps
  equal the sender's exactly. The card renders the same rows.
- **Names.** No last name from the fixture appears anywhere in the decoded
  payload (only a last initial for the two who share a first name). The sheet
  lists the 12 names.
- **Existing team.** On a phone that has the team with full names and a
  different version of the game:
  - the game is replaced;
  - every kid keeps their full name;
  - nothing else in the team changes (other days, season, settings).
- **Bad links.** A truncated, corrupted or hand-edited `#p=` payload opens the
  app normally, with one toast: "This hand-off link is damaged. Ask for a new
  one." Nothing is written to storage.
- **The hash is cleared.** After opening, `#p=…` is removed from the address
  bar with `history.replaceState`. A reload does not import the game again.
- **Landing.** The receiving phone shows the game screen with "Open bench
  mode" as the first control, at 390×844 and 320px/32px text, with nothing
  clipped.
- **First paint.** The QR library is not requested until the Hand off sheet
  opens. The `initial payload` and `request count` budgets do not move for a
  cold load.
- **Offline.** With the network off, after one online load, Hand off still
  draws the QR code.
- **Mobile first.** The Hand off sheet passes the touch-target, clip and
  large-text sweeps at 320–390px.

## Surfaces

- **Changes:**
  - a new `app/handoff.js`: encode and decode, pure and testable under
    `node --test`;
  - the Hand off sheet and its door (a row in `#sheetCard`);
  - load-time hash reading in `app/app.js`;
  - `app/vendor/fetch.sh` and the vendored encoder;
  - `app/sw.js` precache;
  - `scripts/smoke/` rows, `test/`;
  - `notes/ROADMAP.md:48`, updated to say this is now possible.
- **Must not change:**
  - `engine.js`, `budget.js`, `roster.js`;
  - the card's size and layout;
  - the privacy line on the chart pages;
  - `storage.js` beyond reusing `sanitizeTeam` (no new rules there).

## Constraints

- **The privacy claim stays narrow.** The hash is never sent anywhere by the
  app. `app/analytics.js` posts no URL today (its own comment at line 92 says
  so); a test keeps it that way for a page opened with `#p=`.
- **Reuse, do not re-derive.**
  - Clean incoming data with `storage.js` `sanitizeTeam`.
  - Names that travel come from `roster.js` `callNames`. Do not write a
    second name shortener.
  - Stints compare through `effectiveStints`.
- **Vendored code.** It is generated by `fetch.sh` only, never edited by hand
  (a hook enforces this).
- **Precache bump.** `npm run sw:bump`.
- **The card is 3.45 × 5in and unchanged.**
- **Compression.** Use the browser's `CompressionStream('deflate-raw')` and
  base64url. No compression library.

## Design

1. **`handoff.js`.**
   - `encode(team, game)` builds the decision-2 object, with card names only.
     It is JSON, then deflate-raw, then base64url, with a 1-character format
     version in front, giving `#p=1…`.
   - `decode(hash)` reverses that, or returns `null` for anything malformed.
2. **Sending.** `#sheetCard` gets a Hand off row. It opens a sheet with:
   - the QR code, drawn by the lazily imported encoder;
   - Share link (`navigator.share`, falling back to Copy link);
   - the list of names that will travel;
   - the line "Anyone you send this to can open it."
3. **Receiving.** On load, `app.js` checks for `#p=`:
   - decode it, and clean it through `sanitizeTeam`;
   - merge per decision 4, then save;
   - clear the hash and open that game's screen;
   - show a toast: "Hawks game added. Open bench mode to run subs."
4. **The stints travel too.** The receiving phone re-solves from the same
   inputs and seed. If its stints differ from the link's (a different app
   version, for example), the link's stints are written as overrides that are
   not hand swaps, so the card matches the sender's.

## Proof

| Seam | Runs from | Covers |
| --- | --- | --- |
| `encode`/`decode` round trip, size, names, malformed input | `node --test`, `test/handoff.test.js` | Size (string length), Round trip (data), Names, Bad links (decode) |
| Merge into a state with and without the team | `node --test`, `test/handoff.test.js` | Existing team, Round trip |
| Send → read the drawn QR → open the link on a fresh profile | smoke row, two browser contexts | The QR code is the link, Round trip (card rows), Landing, The hash is cleared |
| A real decoder reads the code | `/browser-verify` on the preview, `BarcodeDetector` | The QR code is the link |
| Lazy load and budgets | the smoke budget rows plus a network-log assertion | First paint |
| Offline | smoke row with `Network.emulateNetworkConditions` offline | Offline |
| Sweeps | the existing touch-target, clip and large-text rows with the sheet open | Mobile first |

The repo has no npm dependencies, and CI's Linux Chrome has no
`BarcodeDetector`, so the smoke check compares modules rather than decoding.
Nothing that only a test needs ships in `app/`.

## Out of scope

- Syncing two phones, or any live link between them.
- Handing off a whole day, a season, or a backup.
- Changing the privacy line on the chart and about pages.
- Accounts, short links, or any server-side storage.
