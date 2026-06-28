# ADR-0075 — Residential plate: corner-preserving perimeter fill (default-on)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-06-28 |
| Owner | Residential-building generator (`@pryzm/ai-host` workflows/residentialBuilding) |
| Supersedes | The flag-gated `__pryzmCorridorGrid` even-grid of §RESI-CORRIDOR-GRID Phase 2 (default OFF) |
| Spec | [SPEC-NONRECT-APARTMENTS-CORRIDOR-FIRST](../../03-execution/specs/SPEC-NONRECT-APARTMENTS-CORRIDOR-FIRST.md) §Phase 3 |
| Contracts | C50 §1.7 (soft-fail, never throw), C53 (polygon-native engine) |

## Context

Founder, 2026-06-27 (with screenshot): on a rectangular floor plate — almost regardless of
size — the generator placed only **~4 apartments, one in each corner**, around a central core
with cross-shaped corridors, leaving the entire perimeter between the corners EMPTY. On a large
plate this is absurd (~4 units where 12–20+ fit).

**Root cause.** `platePartition.ts` selects corridor centrelines via `sideCorridors`, an outward
walk that steps from the core by `pitch = 2·MAX_APARTMENT_DEPTH_M + corridorWidth (≈ 19.5 m)` and
CLAMPS the last corridor a fixed `cap (≈ 9.75 m)` in from each plate edge. On a plate whose depth
is between one and two pitches (e.g. 40×30, 60×30) the core corridor and the two clamped edge
corridors crowd within ~5 m, so the apartment ROWS between them collapse to ~1.9 m — below the
engine-feasible depth. Only the two deep outer rows host real apartments, and their corner-anchored
packing reads as "4 corner units around an empty perimeter band." A flag-gated even corridor GRID
(Phase 2, default OFF) lifted the raw count but laid all rows at one SHALLOW depth, which (a) hid
the deep dual-aspect corner units the founder explicitly wants to KEEP and (b) produced rows below
the frozen D-TGL engine's ~7.5 m feasibility floor (studios / soft-fails).

## Decision

1. **Corner-preserving HYBRID corridor candidate, DEFAULT-ON.** The new grid candidate KEEPS two
   DEEP outer corridors (their outer rows are a full `MAX_APARTMENT_DEPTH_M` and reach the plate
   edge → dual-aspect corner units) and FILLS the interior between them with evenly-spaced corridors
   whose rows tile the residual depth. It is offered on every plate (no opt-in flag). A small plate
   with no room for a deep outer band PLUS a feasible interior corridor offers no hybrid and keeps
   the baseline (its proven deep-corner result).

2. **Engine-feasibility-gated interior.** An interior corridor is added only when its rows clear the
   engine-feasible depth floor (`ENGINE_MIN_ROW_DEPTH_M = 7.5 m`). A band too thin for a feasible
   row is left for the baseline / residual rather than minting un-buildable slivers the founder would
   see as the same empty band.

3. **Feasible-first best-of-candidates selection.** The candidate score is (engine-feasible cell
   count, then total count, then placed area). This makes the hybrid win where it genuinely tiles the
   perimeter with BUILDABLE units, and keeps the baseline where it already fills feasibly — **no
   regression by construction** (the baseline is always candidate 0; ties keep it).

4. **Geometry-honest typology VARIETY (§RESI-EDGE-TYPE-VARIETY).** After placement, each cell's
   typology is re-stamped from its REAL AREA, choosing among the typologies the brief enabled — so
   the deep corner cells become the larger typology (T3/T4) and the shallower edge-fill cells the
   smaller ones (T1/T2). The orchestrator pairs each cell to a program BY the cell's stamped typology
   (not the demand index). A single-typology brief is a no-op (uniform, byte-identical).

5. **Opt-out kill-switch.** `globalThis.__pryzmCorridorGrid === false` forces baseline-only
   (byte-identical to pre-P3). Retained purely as a safety hatch; the default is the rich fill.

## Consequences

- A large rectangular plate now reads as corners + a full ring/grid of edge-adjacent units of mixed
  typology, corridor-first, minimal dead space — the founder's requested default. Sample (T2-only,
  core 8×6, corridor 1.5): 40×30 4→8, 60×40 ~feasible-12 + interior, 80×60 52→56 feasible, every
  cell corridor-reached, no overlaps.
- Small plates are unchanged (a 20×15 still yields its honest few units; a 28–32 m square keeps its 4
  deep corners — the interior is genuinely too thin for a feasible row).
- More typologies survive (T3 no longer steps down to T2 on a deep corner cell), so more apartments
  lay out — slightly more per-cell engine work (one test's timeout was raised).
- The deep-band valley plates (60×44 / 60×50) where neither candidate can add a feasible interior
  corridor keep the baseline (feasible corners + a thin un-built middle) — acceptable; deeper-row
  rework is out of scope.

## In-browser verification still owed (pryzm.fly.dev)

(a) the per-cell D-TGL engine lays out the hybrid's interior rows as real units; (b) the executor
builds the extra corridor bands + their cell walls as real circulation tied to the core spine; (c)
the founder's actual large drawn plate now reads as corners + filled perimeter, not 4 corners.
