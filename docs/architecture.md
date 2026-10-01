# Architecture

How the app is put together and why each piece is shaped the way it is. Paths
are relative to `app/` unless stated otherwise.

`AGENTS.md` is the harness — the traps, the rules and what is enforced — and it
is not repeated here. Where the two would overlap, this file points and AGENTS
explains.

This file is an index. Each heading below is one line about what the area
covers; the module itself, moved without rewording, is the file it links.

## Layout

`app/`'s files, the pure engine/budget/storage/roster modules, and the boot
wiring that hands each view its own callbacks. See [architecture/layout.md](architecture/layout.md).

## Planning strategies

The four ways minutes are shared out (Even, By hand, Closers, Platoon) and
the pair rules that compose with any of them. See [architecture/planning-strategies.md](architecture/planning-strategies.md).

## Lineup balance

Tiers, the balance shapes and why a level can never move anyone's total
minutes. See [architecture/lineup-balance.md](architecture/lineup-balance.md).

## First run

The welcome screen, the three-step flow, blocked/empty states and the sample
data. See [architecture/first-run.md](architecture/first-run.md).

## Interface

The header, floating bar, timeline, sheets, flows and the wide-screen layout.
See [architecture/interface.md](architecture/interface.md).

## Bench mode

The live bench screen — stints, Next change, the scope control and the wake
lock. See [architecture/bench-mode.md](architecture/bench-mode.md).

## Plan changes and announcements

How a mid-game rotation edit is announced and offered an Undo. See
[architecture/plan-changes.md](architecture/plan-changes.md).

## Card

The printed 3.45 × 5in card and how its type is auto-fitted. See
[architecture/card.md](architecture/card.md).

## Rules are additive, not tabular

Why rules compose (min/cap, Together/Apart, `keepOnFloor`) rather than sitting
in one table. See [architecture/rules.md](architecture/rules.md).

## Blocked states say why

Why a blocked action always names the fix, not just the block. See
[architecture/blocked-states.md](architecture/blocked-states.md).

## A boot that fails says so, and hands the season back

The inline error boundary and the backup download it offers when a boot
throws. See [architecture/boot-failure.md](architecture/boot-failure.md).

## Hand off

Sharing a game with an assistant through a link or QR code — the game, its
roster and its rotation plan travel in the URL hash, which is never sent to a
server. See [architecture/interface.md](architecture/interface.md) § Hand off.

## Photo scanning: removed

What the removed roster-from-a-photo feature was, and why it was pulled. See
[architecture/photo-scanning.md](architecture/photo-scanning.md).
