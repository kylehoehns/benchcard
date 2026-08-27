# Product roadmap

Open work lives in `TICKETS.md`; the harness is `AGENTS.md`. This file is the
*why* behind them — the research an iteration should not have to re-derive, and
the calls already made.

Researched August 2026 across ~40 substitution apps, App Store review corpora,
league rulebooks, YMCA coach pages and search-vocabulary data.

**The one caveat that matters: Reddit was hard-blocked in every research
thread.** There is not one coach-forum quote behind any of this. Every piece of
coach voice below is an App Store review or a blog comment. That is the layer
where the emotional texture of the problem lives, and it is missing.

---

## Where we actually stand

**The constraint engine is unclaimed territory.** The only basketball-native
planner with real distribution is The Hoops Geek (1,067 ratings, 4.89★), bundled
inside a $99/yr playbook product, and per its own site it has no min/max minute
enforcement, no pairings and no skill balancing. The only tool found anywhere
with pairings *and* designated starters/finishers is EqualSubs.net. Nobody
handles league minimum-minutes rules or skill-balanced units. That is this
app's entire engine, sitting in open space.

**Re-checked in a browser, 2026-08-24, and two corrections belong here.**

- **EqualSubs is no longer "a free unattributed web page"** — the wording this
  paragraph used to carry, and it understated them. It is attributed to a named solo
  developer, versioned (V2.06), ad-funded, has optional accounts, a
  second calculator and a coaching blog, and its sitemap says it was updated
  within the last week. **A maintained solo product with momentum**, not a
  page somebody left up.
- **The Hoops Geek claim HELD and is marked verified as of that date:** no
  min/max minute enforcement, no pairings, no skill balancing; the only
  fairness mechanism named anywhere is a one-click "Balance Minutes" button,
  and their knowledge base contains zero rotation-maker articles. The
  screenshot they publish to illustrate the feature shows a 33:30-to-12:30
  spread across the roster. Caveat
  to carry with every Hoops Geek claim: all of it is **observed from their
  marketing, not verified in use** — the tool is account-walled and no account
  was created.
- **No real gap appears in BOTH competitors**, which is worth knowing before
  anyone reads a competitor feature as a mandate. Positions are Hoops Geek
  only; "never both off the court" is EqualSubs only (and is the one genuine
  constraint gap found — the mid-game re-solve, since shipped).
  The sole overlap is handing the plan to someone digitally, which is what
  accounts and a server buy, and which is already a recorded
  deliberately-not-doing below.
- A third competitor (**Striveon**) is still being researched and will be
  recorded separately.

**Equal-time apps that do not deliver equal time.** A basketball coach reviewing
a competitor: *"it doesn't ensure equal play time. I coach basketball and if I
have 8 players at a game, the third player in the list will play less than
everyone else."* And the job itself, from a coach about to stop doing it by
hand: *"throw away the spreadsheet that you spent 4 hours developing to make
sure kids get even playing time!"*

**Data loss is the category's signature failure**, and we are exposed to it.
Both leaders carry public 1★ reviews about wiped histories. WebKit deletes
localStorage after seven days without a visit; home-screen installs are exempt,
a tab is not. Hence the backup file and the install nudge, both since
shipped: the whole record out to a file the coach owns and back in again,
and a home-screen prompt on the second use.

**MEASURED ON A REAL iPHONE, 2026-08-26, and this is the one claim here that
used to be documentation rather than evidence.** Same phone, same build: in a
**Safari tab** the Backup box does NOT show the persistence line, and in the
**Home Screen install** it DOES. `#persistNote` is unhidden only when the
browser itself answers `true` to `navigator.storage.persisted()`, so that is
the browser's own answer and not an inference from `persist()`'s return value.

**AND THE INSTALL DOES NOT BRING THE DATA WITH IT.** Reported from the same
phone in the same breath: the installed app has its own storage and sets up
from scratch. That is the fact that matters most here, and it inverts what the
install nudge used to say. "On your Home Screen it stays put" was false, and
expensively so: a coach told to install IN ORDER TO protect a season would
install, open an empty app, and reasonably conclude the season was gone. The
nudge now says it sets up fresh and offers the backup file in the same toast.

BOTH HALVES ARE THE iPHONE, confirmed on a re-ask. The first report said
"installed to desktop", which was written down here as a Home Screen install
without checking -- a desktop PWA would have shared the browser profile's
storage and told us nothing about iOS. It was the phone. So the whole picture
below is one device: a tab that is not persisted, a home-screen app that is,
and no data passing between them.

So slice 1's persistence request is confirmed working end to end on the device
the feature exists for. Nothing here was reproducible on this machine:
Chromium answers `false`/`prompt` unless durable storage is granted over CDP,
desktop WebKit answers `false` in every arm including after 200 KB of storage
and three visits, and a CDP-driven PWA install did not flip it. There is no
simulator here and Playwright's WebKit is not iOS Safari.

**What it leaves open**, stated so nobody reads this as "solved": a coach who
never installs is still on a tab, and the nudge is offered ONCE at use 2 and
never again (`ui.installDone`) -- which is before anybody has a season worth
losing. That is a bounded gap, not a covered one.

**There is no self-serve door into any platform.** SportsEngine, Stack Sports,
Sports Connect, LeagueApps and TeamSnap have no marketplace or submission
program; Jr. NBA is a closed first-party ecosystem. Distribution is negotiated
one relationship at a time.

---

## What the product should become

**The season, not the afternoon.** Every existing tool solves "rotate ten kids
fairly today". The problem coaches name — irregular attendance leaving one kid
on 27 shifts and another on 20 across a season — is planned for by nobody. This
is the differentiator, and it is why the season ledger exists. It also fixes
retention as a side effect: today the app forgets everything when the day ends,
so there is no reason to come back between games.

**Re-solve when the game breaks the plan.** Every bug found in the recent hunts
has been plan-versus-reality drift. It was not a bug class, it was the central
unsolved problem — the plan is a static artefact and then foul trouble happens.
Minutes-so-far turned out to be just another constraint set, and the shared
plumbing held: the mid-game re-solve ships, and it reaches the solver through
the same carryover targets the season ledger fills — an input, not new solver
machinery.

---

## Deliberately not doing

A roadmap that only adds is a wish list. Each of these is something a reasonable
person would suggest.

- **Scorekeeping and stats.** GameChanger owns it, it is a different job during
  the game, and a coach's hands are full. Anything needing more than one tap
  while play is live is dead on arrival. The advantage is doing one thing better
  than anyone; the fastest way to lose it is to become a worse GameChanger.
- **A native app.** Every free tool in this category is web-only and every
  monetised one is native. No reviewer asks for a web version — they defect to
  one. App Store search for "basketball substitution rotation" returns ten
  basketball video games and zero coaching tools.
- **Accounts and a server.** No accounts is the product's soul and a repeated
  point of praise. It is also a hard ceiling on anything parent- or
  league-facing. Accept the ceiling deliberately rather than drifting across it
  one feature at a time.
- **Soccer as the second sport.** Soccer is a graveyard behind one winner, and
  that winner (SubTime) already lists basketball — a direct competitor, not a
  future neighbour. Hockey is the real whitespace, but shift-based line changes
  are a genuine modelling difference, not a re-skin.
- **Show HN.** Documented norm for this exact niche is 2–3 points and zero
  comments across three attempts by comparable tools.
- **Marketing built on tournament-day balancing.** Zero search demand; no
  tournament phrasing returns any autocomplete suggestion at all.

---

## Distribution, ranked by evidence

1. **Rec-league and YMCA sports directors.** The YMCA of Northwest North
   Carolina's coach corner links a competitor by name *and* links a Buy Me a
   Coffee page belonging to a volunteer hobbyist — this exact model, already
   accepted institutionally. Stark County's resources page ends "More coming
   soon!" and names its admin. QuickScores alone serves 750+ organisations with
   that identical page structure, and no rec department found links any of our
   direct competitors. Blocked today by having no contact address on the site.
2. **r/basketballcoach** (15,155 members), after genuinely being a member.
   Six near-identical tool posts have survived with zero removals.
3. **Becoming the standing answer**, over months. SubTime's only visible asset
   is that its name appears inside other people's questions.

Coaches search for an **artefact**, not software: *chart* > *calculator* >
*sheet/template/generator* > *printable*. Question-form phrasings return zero
suggestions. The roster-size long tail (7/8/9/10/11/12 players) is suggested by
Google across unrelated seeds and no competitor has a page for any of it.

---

## On money

Not "coaches refuse to pay". They refuse to pay **twice**, to pay **per seat on
a collective**, and to pay **recurring for a seasonal activity** — while
volunteering money to remove ads (*"Take my $10!!"*). The unserved shape is a
one-time or per-season purchase, bought by the coach, covering the team.

The tip jar will not fund this — best-documented outcomes are ~$20/month and
0.024% conversion. Keep it, it is honest and costs nothing, but do not plan
around it. **The practical consequence for the loop: anything needing server
money needs a revenue answer first, which is a strong argument for staying
client-side.**

Free-and-no-ads earns loud unprompted praise in this category. That is what we
already are.
