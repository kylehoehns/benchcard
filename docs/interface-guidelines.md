# Interface guidelines

The rules for how Benchcard looks and behaves on a phone. Benchcard is a web app
that coaches install on iPhone and Android, and it should feel at home on both
without copying either.

**Status: target design, adopted 2026-09-14. The app does not follow these yet.**
The redesign is built issue by issue, and a spec cites the rules it implements by
ID (`N1`, `C4`, …). Where the running app and this file disagree, the app is
behind, not wrong about how it works today — `architecture.md` describes what the
code does now.

Every rule says where it came from. The sources were read on 2026-09-14 and are
listed at the end:

- **Apple** — the Human Interface Guidelines as of iOS 27.
- **Material** — Material 3 Expressive, including the I/O 2026 updates.
- **Web** — the web platform itself: Baseline, WebKit and Chrome release notes, WCAG.
- **Research** — Nielsen Norman Group and Steven Hoober.
- **Benchcard** — a call made here, usually because the platforms disagree.

Three rules decide everything else:

1. **Where Apple and Google agree, we do it.** Floating controls, one prominent
   action, sheets with resting heights, visible navigation.
2. **Where they differ, we pick something that looks right on both phones, and
   write down why.** See [Where Apple and Google differ](#where-apple-and-google-differ).
3. **Where the web can't do something, we don't fake it.** No imitation glass
   lensing, no shape morphing, no design that changes by platform.

A few things could not be verified from documentation and need a real phone.
They are marked **(unverified)** where they matter, and collected under
[Needs a real phone](#needs-a-real-phone).

---

## Principles

When a rule below doesn't cover a case, these decide it.

**P1. The card is the product.** The printed card's rules live in
[`AGENTS.md`](../AGENTS.md) and do not bend for the app around it. The app exists
to make a good card and to use the plan on the bench.

**P2. One job per screen, one prominent action.** Today picks a game. The game
screen plans it and starts it. Everything that shapes a plan opens over it and
closes back to it. *Apple: Buttons. Material: FAB.*

**P3. Navigation you can see.** No tab bar for three places when a coach spends
a visit in one of them, and no hidden menu for navigation either. *Research:
NN/g, mobile navigation patterns; hidden navigation.*

**P4. Controls float; content fills the screen.** Headers and the primary action
sit on a layer above the content. Content scrolls underneath and fades at the
edges. No full-width bars with lines. *Apple: Layout. Material: Toolbars.*

**P5. Respect the phone.** Its text size, light or dark setting, contrast,
reduced motion, back gesture and screen shape. A coach set those once for every
app. *Apple: Dark Mode. Web: text-scale.*

**P6. Undo, don't ask.** Act immediately and offer Undo. A confirmation is only
for something that can't be undone. *Research: NN/g, confirmation dialogs.
Benchcard: `architecture.md`, destructive actions.*

**P7. Built from the web, not imitations of apps.** Use the browser's own
`<dialog>`, `popover`, History and View Transitions, so the back gesture, focus
handling and accessibility come with them. *Web: Chrome 126 close requests;
Baseline.*

---

## Navigation

Today is the hub. Everything else is one step away from it and says how to get
back.

```
Today (hub) ──push──▶ Game ──sheet──▶ Who's here · Format · Plan
   │                    └──full screen──▶ Bench mode
   ├──push──▶ Team (roster) ──sheet──▶ Player
   ├──push──▶ Season
   ├──gear──▶ Settings
   └──full screen──▶ Add a game (3 steps)
```

**N1. Today is the home screen and the hub. There is no tab bar.** NN/g:
home-as-hub "can work well in task-based websites and apps, especially when users
tend to limit themselves to using only one branch of the navigation hierarchy
during a single session." A coach opens Today, plans one game and leaves.
Material allows a navigation bar for three to five destinations and says it is
not for "accessing single tasks"; Benchcard would sit at the minimum with one
dominant destination. Revisit only with evidence that coaches move between Team,
Season and games in one visit. *Research: NN/g. Material: Navigation bar.*

**N2. Team and Season are labelled rows on Today, below the games.** "Team ·
Sample team · 9 ›" and "Season · 3 games filed ›". NN/g found hiding navigation
cut discoverability "almost in half". *Research: NN/g, hidden navigation.*

**N3. Switching teams is a menu on the team name in Today's header.** A labelled
button ("Sample team ⌄") opens a popover with a checkmark on the current team and
"Add a team". *Apple: Menus.*

**N4. Settings opens from a gear button in Today's header, and nowhere else.**
Top right, icon-only, with the accessible name "Settings". No other screen has a
settings entry, and no screen has settings of its own. This is a deliberate
choice: NN/g lists the gear among icons people may not recognise, and Android
recommends settings in the top bar. Revisit if coaches can't find it. *Material:
Settings pattern. Research: NN/g, icon usability. Benchcard: decided
2026-09-14.*

**N5. Every pushed screen has a visible back button, top left, as an icon.** A
chevron in a round control, with an accessible name that says where it goes
("Back to Today"). Installed web apps on iOS have no browser back button, and
iOS's newer swipe-anywhere-back is documented for native apps, not web apps
**(unverified)**. *Apple: Toolbars ("don't use a text label that says Back").
Web: Apple Support, Open as web app.*

**N6. Every push is a history entry, and every overlay closes on back.** Pushing
a screen calls `history.pushState`; `popstate` pops it. Sheets and menus are
`<dialog>` or `popover`, which Chrome on Android closes on the back gesture.
Back from Today leaves the app on Android, which is expected. Whether Android's
predictive back animation runs inside an installed web app is **(unverified)**.
*Web: New in Chrome 126.*

**N7. A game in progress floats above Today.** When a game is part-played, a
floating "Panthers · Q2 4:00 · Resume" bar sits at the bottom of Today. Apple's
tab bar accessory and Material's floating toolbar are the same idea. *Apple: Tab
bars (accessory). Material: Toolbars (floating). Benchcard: `resumeAt()`.*

**N8. Multi-step tasks are full screen, and always skippable.** Adding a game and
first run use a full-screen flow with a step count and a close button. Apple:
"When a guided flow is necessary, make it easy to skip or escape." A "Same as
9:00?" shortcut skips the steps when the new game copies the last one. *Apple:
Design principles; Modality.*

---

## Settings

**S1. One Settings screen, with two sections.** The top section is headed with
the active team's name and holds everything that belongs to that team: default
game format, team colour, players changing at once, league minimum, how odd
minutes fall, and whether new games even out the season. The second is headed
*Benchcard* and holds appearance, backup and restore, How it works (with the
tour), and About, contact and the tip jar. The heading is the scope, so a coach
never has to guess which team a setting landed on. *Benchcard: decided
2026-09-14; the two-zone split already described in `architecture.md`.*

**S2. No settings anywhere else.** The Team screen is the roster. The Plan sheet
holds only choices about this game: strategy, rules, lineup balance, and evening
out earlier games. A setting that belongs to the team is never also editable from
a game. *Benchcard: decided 2026-09-14.*

**S3. Appearance is first in the Benchcard section: Automatic, Light, Dark.**
Automatic is the default and follows the phone, including a switch at sunset
while the app is open. See K4.

---

## Layout and surfaces

**L1. Content layer: a soft grey ground with white grouped surfaces.** Lists are
inset groups with rounded corners. Separate objects (a game pass, a sheet) get a
surface; a timeline doesn't need a box. *Apple: Color (grouped backgrounds).
Material: Color system (surface roles).*

**L2. Control layer: header buttons and the primary action float.** Round buttons
top left and right, one full-width action at the bottom. They are slightly
translucent with a blur, and go solid under `prefers-reduced-transparency`,
`prefers-contrast: more`, or where `backdrop-filter` is unavailable.
`prefers-reduced-transparency` is Chromium-only today, so the contrast query
matters. *Apple: Materials. Material: Toolbars. Web: MDN.*

**L3. Separate controls from content with a fade, not a line or a bar.** Apple:
"Instead of applying a solid or semi-opaque background color beneath controls,
use a scroll edge effect." Android: "Don't: Have opaque system bars." *Apple:
Layout (updated 2026-09-09). Android: System bars.*

**L4. Large titles that shrink as you scroll, at scroll speed.** The title starts
large and settles into the header. NN/g: a shrinking header "should not
disappear, jump, or otherwise startle the user." *Apple: Toolbars. Material: App
bars (flexible). Research: NN/g, sticky headers.*

**L5. Draw to the edges and pad for the notch, the home bar and the keyboard.**
`viewport-fit=cover`, `env(safe-area-inset-*)` on the outer wrapper, and
`safe-area-max-inset-bottom` so bottom controls don't jump as Chrome's bar
slides. Chrome does not yet draw installed web apps edge-to-edge on Android.
Test a normal Safari tab as well as the installed app: iOS 26+ Safari's floating
toolbar interacts with fixed bottom UI **(unverified)**. *Web: Chrome,
edge-to-edge.*

**L6. An 8px grid, 16px side margins, concentric corners.** Spacing steps of 4,
8, 12, 16, 24, 32. An inner radius is the outer radius minus the padding between
them. Sheets have 28px top corners. *Material: I/O 2026 spacing; Bottom sheets.
Apple: Toolbars (concentric corners).*

**L7. One layout that adapts by width, not a separate desktop design.** Under
600px: one column, pushed screens. 600–839px: the same, with sheets as centred
dialogs. 840px and up (tablets, laptops, an unfolded iPhone Duo): Today on the
left, the open game on the right. The same features at every width. *Material:
Breakpoints. Apple: Designing for iPhone Duo.*

---

## Components

**C1. Header: back or close on the left, title, at most two actions on the
right.** Material: "App bars should only have one action, two if necessary."
Actions are icons with accessible names, except a confirm in a sheet (C4).
*Material: App bars. Apple: Toolbars.*

**C2. The primary action is one full-width button, floating at the bottom,
labelled with a verb.** "Start game", "Add a game", "Next". It is the only filled
button on the screen, and it is in thumb reach. Material's large extended FAB for
compact windows and Apple's prominent button meet here. *Material: FAB. Apple:
Buttons. Research: Hoober.*

**C3. Sheets are for short edits only, built on `<dialog>`.** A drag handle; two
resting heights, half and full; dismiss by swiping down, tapping outside, the
back gesture, or the close button. Half height is the default when the screen
behind should stay visible — in Who's here, the rotation rebuilds above the
sheet. NN/g: "We strongly recommend not using a bottom sheet to replace typical
page-to-page user flows." *Apple: Sheets. Material: Bottom sheets. Research:
NN/g, bottom sheets.*

**C4. Live sheets and commit sheets have different buttons.** Live sheets change
the plan as you tap (who's here, format, plan): one close button, ✕, top right.
Commit sheets collect something first (add a rule, paste a list): ✕ top left and
a confirm top right named for the result — "Add rule", never "Done". If closing
would lose typed text, ask first. *Apple: Sheets. Material: Dialogs.*

**C5. One overlay at a time, at most one level deep.** A sheet may push one level
inside itself (Plan › Add a rule) with a back chevron. It never opens a second
sheet on top. *Apple: Modality. Research: NN/g, bottom sheets.*

**C6. Lists: rows at least 48px, one control per row.** A chevron means the row
opens something, a checkmark means it's chosen, a switch means on or off. Use
`<input type="checkbox" switch>` where supported; Safari gives it a haptic tap on
iPhone. Swipe-to-remove is only a shortcut; every row can also be removed from its
detail. *Apple: Lists and tables. Web: Safari 18.0; WCAG 2.5.7.*

**C7. Segmented controls: up to 3 options to switch a view, up to 5 to choose.**
Timeline | Card. Even | By hand | Closers | Platoon. Text only, equal widths.
*Apple: Segmented controls. Material: Buttons (button groups).*

**C8. Menus are popovers anchored to the button that opened them.** The current
choice has a checkmark. Icons on every item in a group, or none. *Apple: Menus.
Web: anchor positioning (Baseline 2026).*

**C9. Undo appears in a snackbar at the bottom, above the primary action.** One
line of what happened ("Removed Harper") and Undo, for the window
`architecture.md` describes. A new one replaces the old; they never stack.
*Material 2: Snackbars. Research: NN/g, confirmation dialogs.*

**C10. Bench mode and multi-step flows are full screen.** Close ✕ top left, and
in bench mode a Done within thumb reach at the bottom. They cover everything,
including any floating bar. *Apple: Modality. Material: Dialogs (full screen).*

---

## Colour

Graphite by default. The players are the colour. A team colour, if chosen, marks
what you can press.

| Token | Light | Dark |
| --- | --- | --- |
| Ground | `#F4F4F6` | `#0B0B0C` |
| Surface | `#FFFFFF` | `#1C1C1E` |
| Ink (the Graphite tint) | `#1C1C1E` | `#F4F4F6` |
| Secondary text | `#6C6C72` | `#98989F` |

Team colours: Graphite (default), Hardwood, Royal, Navy, Maroon, Red, Forest,
Gold, Purple. Each has a light and a dark value; Gold needs dark text on its fill.

**K1. The tint goes on three things only.** The primary action's fill, the
tappable phrases in a game's sentence, and a selected state. Never on back
buttons, headers, list labels or icons. Apple: use brand colour "for primary
actions or status indicators… consider moving it into the content layer." With
Graphite, tappable phrases get a soft underline, since the tint is the ink.
*Apple: Branding (updated 2026-09-09); Color.*

**K2. Player colours mean a player and nothing else.** They never signal state.
Wherever a colour identifies a player, a name or number is there too. *Apple:
Color (inclusive color).*

**K3. Status colours are their own set.** Planned is green, needs-a-fix is amber,
destructive is red. None is a team colour, and none is offered as one. *Apple:
Color ("Avoid using the same color to mean different things").*

**K4. Follow the phone's light or dark setting by default, and offer an
override.** Automatic, Light, Dark, in Settings (S3). Android recommends exactly
this ("Light, Dark, System default (the recommended default option)"), and
web.dev says to "initially adhere to… `prefers-color-scheme`, but to then
optionally allow users to override". Apple says "Avoid offering an app-specific
appearance setting"; we differ knowingly, because a coach may want a different
screen in a gym without changing their whole phone. In dark, sheets and menus sit
on a lighter surface than the screen behind them. *Android: Dark theme. Web:
web.dev. Apple: Dark Mode (differs). Benchcard: decided 2026-09-14.*

**K5. Contrast: 4.5:1 for text, aiming for 7:1 on small text; 3:1 for controls.**
Every colour has a light, a dark and a `prefers-contrast: more` value. *Apple:
Dark Mode. Material: Color (contrast levels). Web: WCAG 2.2.*

---

## Type

**T1. Use the system font stack; don't ship a UI font.** SF on Apple devices,
Roboto on Android. The printed card keeps its own face and the fitting rules in
`AGENTS.md`. *Apple: Typography; Branding.*

**T2. Size everything in `rem`, and let the phone set 1rem.** On Android,
`<meta name="text-scale" content="scale">` (Chrome 146) makes the root size follow
the OS text size. On iOS, `font: -apple-system-body` on the root follows Dynamic
Type; whether it does so inside an installed web app is **(unverified)**. Lay out
for 200%: rows grow and side-by-side pieces stack. *Web: Chrome 146 release notes;
Adrian Roselli, 2026. Android: font scaling to 200%.*

| Style | Size | Weight | Used for |
| --- | --- | --- | --- |
| Large title | 2.125rem | 700 | Screen titles before scrolling |
| Sentence | 1.5625rem | 600 | A game's summary sentence |
| Title | 1.375rem | 700 | Sheet titles, names in bench mode |
| Headline | 1.0625rem | 600 | Buttons, row titles that need weight |
| Body | 1rem | 400 | Everything else |
| Secondary | 0.875rem | 400 | Subtitles, summaries |
| Footnote | 0.8125rem | 400 | Group footers, timeline labels; the smallest size |

**T3. Weights 400, 500, 600 and 700 only. Nothing smaller than footnote.** *Apple:
Typography ("avoid light font weights").*

**T4. When text size grows, the plan grows first.** Names, minutes and the
sentence scale fully; header labels and footers may scale less. Apple: people
"don't always want to increase the size of every word on the screen." *Apple:
Typography.*

---

## Motion

**M1. One easing, no bounce.** `cubic-bezier(.32,.72,0,1)`, 250–450ms. Material's
motion system has a Standard scheme with "minimal bounce" for "utilitarian
products". *Material: Motion.*

**M2. Pushes slide, overlays rise, changes in place move in place.** When the
plan changes, timeline blocks travel to their new positions rather than being
redrawn. Use same-document View Transitions where available (Baseline since
2025-10), CSS otherwise. *Apple: Motion. Web: Baseline.*

**M3. Every animation can be interrupted, and reduced motion removes the
travel.** A tap during a transition finishes it. Under `prefers-reduced-motion`,
movement becomes a short fade or an instant change, and the preference is watched
rather than read once. *Apple: Motion ("Let people cancel motion").*

**M4. No motion on things a coach does many times a minute.** Checking players in
and out, stepping through stints, toggling switches: instant, with a state change
only. *Apple: Motion.*

---

## Touch and input

**I1. Touch targets are 48px.** Material's 48dp covers Apple's 44pt, and both
clear WCAG's 24px minimum. A visually smaller control keeps a 48px hit area.
*Material: Accessibility (structure). Apple: Buttons. Web: WCAG 2.5.8.
Benchcard: decided 2026-09-14.*

**I2. What's used during a game lives in the bottom half.** Start game, stepping
through stints, Done and Undo sit where a thumb reaches. Rarely used controls
(team menu, Settings, share) go to the top corners. *Research: Hoober. Apple:
Designing for iOS.*

**I3. Gestures are shortcuts, never the only way.** Swipe back, swipe a sheet
down, swipe a row, drag to reorder: each has a visible button that does the same.
*Web: WCAG 2.5.7.*

**I4. Every control shows it was pressed.** A slight darken and scale on press,
and a clear focus ring for the keyboard. Vibration works on Android only; iPhone
gets a haptic only from the native switch. Neither is ever the only feedback.
*Apple: Buttons ("Always include a press state"). Web: MDN, Vibration API.*

---

## The phone around us

**D1. Installed as `standalone`; nothing depends on other display modes.** iOS
supports only `standalone` and `browser`. The manifest colours come from the
ground token. *Web: web.dev, App design; WebKit, Safari 26.0.*

**D2. Keep the screen on in bench mode.** Request a Screen Wake Lock when bench
mode opens, release it on close, and request it again when the app returns to the
foreground. Supported in iOS Home Screen web apps since 18.4. *Web: WebKit, Safari
18.4.*

**D3. Offline is normal, so don't announce it.** Everything works offline. Only
an action that truly needs the network says so, and names what still works. *Web:
web.dev, Offline UX.*

**D4. The card leaves through the phone's own share sheet.** `navigator.share`
with the image, on both platforms. *Web: MDN, Web Share. Benchcard: `share.js`.*

**D5. No platform sniffing to change the design.** Feature detection may add
something (a haptic switch, text scaling). It never swaps one layout or component
for another based on which phone it is. *Benchcard.*

---

## Accessibility

WCAG 2.2 AA is the floor. W3C: "The best way to prepare for WCAG 3… is to meet
WCAG 2.2 success criteria now."

**A1. Focus is always visible and never hidden under a floating control.** A 2px
ring at 3:1. `scroll-padding` matches the floating header and bottom action.
*Web: WCAG 2.4.11, 2.4.13.*

**A2. Every icon-only button has a name that says what happens.** "Back to
Today", "Close", "Settings", "Share the card". *Web: WCAG 4.1.2.*

**A3. When the plan changes, say so.** A polite live region announces the new
summary after an edit. *Web: WCAG 4.1.3.*

**A4. Test with the phone's settings turned up.** Text at 200%, dark mode with
increased contrast, reduced transparency, reduced motion, and a screen reader, on
an iPhone and an Android phone. *Apple: Dark Mode. Android: font scaling.*

---

## Words

**W1. Sentence case everywhere: buttons, menus, titles, headers.** "Add a game",
"New day", "By hand". Apple prefers Title Case for buttons and menus; sentence
case reads naturally on both platforms and matches how the app already talks.
*Apple: Menus (differs). Benchcard.*

**W2. Buttons are verbs and name the result.** "Start game", "Add rule", "Remove
from team". Not "OK", "Submit" or "Done" when a more specific word exists.
*Material: Dialogs. Apple: Buttons.*

**W3. No help icons, no paragraphs beside controls.** At most one grey line under
a group, when a choice truly needs it. The full explanation lives in How it works.
*Apple: Design principles ("Be concise").*

**W4. Problems say what to do, with the button that goes there.** *Benchcard:
`architecture.md`, blocked states say why.*

---

## Where Apple and Google differ

| Question | Apple (iOS 27) | Google (Material 3) | Benchcard |
| --- | --- | --- | --- |
| Persistent navigation | Tab bar, no minimum count | Bar for 3–5 destinations | None; Today is the hub (N1) |
| Back | Chevron, edge swipe | Arrow, system back gesture | Chevron button, plus the gesture where the platform has one (N5, N6) |
| Settings entry | Not specified for iPhone | Top bar or its menu | Gear on Today only (N4) |
| Primary action | Tinted item at the toolbar's trailing edge | FAB or extended FAB at the bottom | Full-width floating button at the bottom (C2) |
| Sheet confirm | "Done" trailing, Cancel leading | Name the result, never "Done" | Live sheets: ✕ only; commit sheets: ✕ and a named verb (C4) |
| Capitalisation | Title Case for buttons and menus | No rule found in this research | Sentence case (W1) |
| Touch target | 44 × 44pt | 48 × 48dp | 48px (I1) |
| Control material | Liquid Glass | Tonal fills | Neutral translucency with a solid fallback; no imitation lensing (L2) |
| Motion | System motion tied to gestures | Springs; Expressive bounces | One easing, no bounce (M1) |
| Appearance setting | "Avoid" an in-app one | Light, Dark, System default | Automatic by default, with an override (K4) |

---

## What we don't do

Each is something a reasonable person would suggest.

- **A tab bar or a hamburger menu.** See N1 and N2.
- **Imitation Liquid Glass or Material shape morphing.** Neither has a web API, and
  a lookalike reads as fake on one platform and foreign on the other.
- **Settings on more than one screen, or per-screen settings.** See N4 and S2.
- **Stacked sheets, or sheets for long flows.** See C3 and C5.
- **"Are you sure?" where Undo works.** Only restoring a backup over existing data
  asks first.
- **A different design per platform.** See D5.
- **Branding in the way.** No logo in headers and no marketing footer inside the
  app. About, contact and the tip jar live in Settings. *Apple: Branding.*

---

## Needs a real phone

Documentation could not settle these. Each needs checking on a device before the
rule that depends on it ships.

- Whether iOS's swipe-back gesture works inside an installed web app (N5).
- Whether Android's predictive back animation runs inside an installed web app
  (N6).
- How iOS 26+ Safari's floating toolbar treats a fixed bottom button in a normal
  tab (L5, C2).
- Whether `-apple-system-body` follows Dynamic Type inside an installed web app
  (T2).

---

## Sources

Read 2026-09-14. Material component pages carry a "May 2025" Expressive date
unless noted.

**Apple Human Interface Guidelines**

- Tab bars (updated 2026-06-08) — https://developer.apple.com/design/human-interface-guidelines/tab-bars
- Toolbars — https://developer.apple.com/design/human-interface-guidelines/toolbars
- Sheets — https://developer.apple.com/design/human-interface-guidelines/sheets
- Modality — https://developer.apple.com/design/human-interface-guidelines/modality
- Materials — https://developer.apple.com/design/human-interface-guidelines/materials
- Color — https://developer.apple.com/design/human-interface-guidelines/color
- Branding (updated 2026-09-09) — https://developer.apple.com/design/human-interface-guidelines/branding
- Buttons — https://developer.apple.com/design/human-interface-guidelines/buttons
- Layout (updated 2026-09-09) — https://developer.apple.com/design/human-interface-guidelines/layout
- Typography — https://developer.apple.com/design/human-interface-guidelines/typography
- Dark Mode — https://developer.apple.com/design/human-interface-guidelines/dark-mode
- Menus (updated 2026-06-08) — https://developer.apple.com/design/human-interface-guidelines/menus
- Segmented controls — https://developer.apple.com/design/human-interface-guidelines/segmented-controls
- Lists and tables — https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- Motion — https://developer.apple.com/design/human-interface-guidelines/motion
- Settings — https://developer.apple.com/design/human-interface-guidelines/settings
- Design principles (reintroduced 2026-06-08) — https://developer.apple.com/design/human-interface-guidelines/design-principles
- Designing for iOS — https://developer.apple.com/design/human-interface-guidelines/designing-for-ios
- Designing for iPhone Duo (new 2026-09-09) — https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo
- What's new — https://developer.apple.com/design/whats-new/

**Material and Android**

- Navigation bar — https://m3.material.io/components/navigation-bar/guidelines
- Toolbars — https://m3.material.io/components/toolbars/guidelines
- App bars — https://m3.material.io/components/app-bars/guidelines
- Bottom sheets — https://m3.material.io/components/bottom-sheets/guidelines
- Dialogs — https://m3.material.io/components/dialogs/guidelines
- Floating action button — https://m3.material.io/components/floating-action-button/guidelines
- Buttons — https://m3.material.io/components/buttons/guidelines
- Accessibility: structure (48dp targets) — https://m3.material.io/foundations/designing/structure
- Color system — https://m3.material.io/styles/color/system/overview
- Motion — https://m3.material.io/styles/motion/overview/how-it-works
- Breakpoints (renamed 2026-05) — https://m3.material.io/foundations/layout/breakpoints/overview
- What's new at I/O 2026 (2026-05-19) — https://m3.material.io/blog/whats-new-at-io26
- Snackbars (Material 2) — https://m2.material.io/design/components/snackbars.html
- Android design, Settings pattern (updated 2025-12-10) — https://developer.android.com/design/ui/mobile/guides/patterns/settings
- Android design, System bars (updated 2026-09-01) — https://developer.android.com/design/ui/mobile/guides/foundations/system-bars
- Android, Dark theme — https://developer.android.com/develop/ui/views/theming/darktheme
- Android 14 features (font scaling to 200%) — https://developer.android.com/about/versions/14/features

**Web platform**

- web.dev, App design — https://web.dev/learn/pwa/app-design
- WebKit, Safari 26.0 features (2025-09-15) — https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- WebKit, Safari 18.4 (Screen Wake Lock in Home Screen web apps) — https://webkit.org/blog/16574/
- WebKit, Safari 18.0 features (switch control haptics) — https://webkit.org/blog/15865/webkit-features-in-safari-18-0/
- Apple Support, Open as web app — https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios
- New in Chrome 126 (close requests) — https://developer.chrome.com/blog/new-in-chrome-126
- Chrome, Edge-to-edge — https://developer.chrome.com/docs/css-ui/edge-to-edge
- Chrome 146 release notes (text-scale) — https://developer.chrome.com/release-notes/146
- Adrian Roselli, Honoring mobile OS text size (2026-02-06) — http://adrianroselli.com/2026/02/honoring-mobile-os-text-size.html
- web.dev, Baseline: Navigation API — https://web.dev/blog/baseline-navigation-api
- web.dev, Interop 2026 — https://web.dev/blog/interop-2026
- web.dev, prefers-color-scheme — https://web.dev/articles/prefers-color-scheme
- web.dev, Offline UX design guidelines — https://web.dev/articles/offline-ux-design-guidelines
- MDN, prefers-contrast — https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast
- MDN, Web Share API — https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- MDN, Vibration API — https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API
- W3C, WCAG 2.2 — https://www.w3.org/TR/WCAG22/
- W3C, WCAG 3 introduction (updated 2026-09-11) — https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/

**Research**

- NN/g, Basic Patterns for Mobile Navigation (updated 2024-01-24) — https://www.nngroup.com/articles/mobile-navigation-patterns/
- NN/g, Hamburger Menus and Hidden Navigation Hurt UX Metrics — https://www.nngroup.com/articles/hamburger-menus/
- NN/g, Icon Usability — https://www.nngroup.com/articles/icon-usability/
- NN/g, Sticky Headers — https://www.nngroup.com/articles/sticky-headers/
- NN/g, Bottom Sheets (updated 2024-01-30) — https://www.nngroup.com/articles/bottom-sheet/
- NN/g, Confirmation Dialogs (reviewed 2026-08-07) — https://www.nngroup.com/articles/confirmation-dialog/
- Steven Hoober, Design for Fingers, Touch, and People (2017) — https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php

The navigation research is older than the platform guidance: NN/g's core studies
date from 2015–2016, have been updated since, and tested websites rather than
installed apps. No neutral guideline for installed web apps exists; the W3C Design
Tokens format (stable 2025-10) standardises token files only.
