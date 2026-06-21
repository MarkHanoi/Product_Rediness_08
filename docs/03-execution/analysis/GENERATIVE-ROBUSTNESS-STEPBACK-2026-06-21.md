# Generative layout — the step-back: why it fails for ANY layout, and the path (2026-06-21)

Founder: "stop focusing on Almanzora — it must work for ANY possible layout. Step back, analyse
deeply, audit the code." This is that step-back, grounded in code + a new layout-agnostic measurement.

## 1. The measurement (new — `circulationRobustnessSweep.test.ts`)

Instead of one plate, a property harness sweeps **108 feasible (shell × program) combos** (4 programs
× 3 aspect ratios × 3 skews × 3 area-scales) through the REAL `enumerateLayouts` pipeline and measures
the winner:

```
shipped a winner:        85/108 (79%)     ← 21% HARD-REJECT (envelope) even at matched size
hard-valid winner:       57/108 (53%)
FULLY circulation-sound: 57/108 (53% of all; 67% of those that shipped)
hard-fail breakdown:     window=25, circulation=11, reach=5
```

**The engine ships a fully circulation-sound layout on ~half of arbitrary plates.** The dominant
hard-failure is **`window` (25)** — a habitable room buried in the interior with no façade — *more*
common than circulation (11) + reach (5) combined. Almanzora is not special; it is a typical member
of the failing half.

## 2. The root architectural flaw (audit of the pipeline)

The D-TGL pipeline is **AREA-FIRST**; circulation + daylight are *retrofitted consequences*:

1. `bubbleGraph` gives each room an **area-weighted target** (living 51 m² on Almanzora). The
   corridor is just another area-weighted room (target 18 m²) **competing for space**.
2. `subdivide` **packs rooms by area** (squarify / treemap / the carve family). Whether a room ends
   up on the corridor, against a façade, or buried in the middle is a *side effect* of packing.
3. `wallsAndDoors` **retrofits doors** onto whatever adjacencies the packing happened to produce.
4. `enumerate` runs 8 orientations + a hard topology/window gate that **rejects** the broken ones and
   ships the *least-bad*. The gate is doing the engine's quality control AFTER the fact.

Because packing is blind to circulation and daylight, the same structural failure recurs on any
plate the packing doesn't happen to suit: a room with no corridor wall (sealed / served-through), a
room with no exterior wall (`window` fail), the corridor stranded in a corner. The hall-hinge carve
is a special-case attempt to *force* the `[public | hall | corridor | private]` spine, but it is
fragile — on Almanzora it bails (`living↔hall not a door-width wall`, then `bedroom not on corridor`)
the moment the packed/over-enriched plate doesn't fit its 4-band assumption.

## 3. Why every patch this session was a band-aid

`§HALL-HINGE-CORRIDOR-FIT` (shipped), `living-on-hall` (reverted — regressed a test), `§LU-CORRIDOR-
SPINE` (reverted — never fired where needed). Each coerces the area-first packer into emitting
circulation on ONE plate family. None changes the fact that **circulation is not a driver**, so each
just moves the failure to the next plate. The sweep above is the proof: local fixes can't lift a
~53% global rate.

## 4. The general fix — circulation-FIRST (already specified: ADR-0072, ADR-0073 HAG)

Invert the order so the invariant holds **by construction for any footprint**:

1. **Derive the corridor SPINE from the footprint first** — medial axis / long-axis strip, fixed
   walkable width (~1.2 m), NOT area-weighted — anchored at the entry (ground) and the stair. L/U
   follows the plate shape.
2. **Partition the residual** (shell − spine) into bands the spine touches along its whole length.
3. **Pack rooms into the residual bands**, each band against the spine → every room borders
   circulation by construction; façade bands guarantee window rooms an exterior wall.
4. **Doors** land on the spine-adjacent wall (door-width by construction). The topology/window gate
   becomes a rare safety net, not the primary filter.

This is the Finch-style spine-first model the ADRs already endorse. It is a **rebuild of the
subdivide stage**, not a patch — so it must be built in isolation and proven against the sweep.

## 5. Concrete, test-first build plan (acceptance = the sweep → ~100%)

- **P0 (done): the yardstick.** `circulationRobustnessSweep.test.ts` — locks the current floor
  (sound ≥ 50/108) as a regression tripwire and is the acceptance metric to drive up.
- **P1: pure spine deriver.** New L2 module `deriveCorridorSpine(shellPolygon, entry, stairKeepOut)
  → SpinePath` (poly-line + width). Pure, unit-tested on rect/L/U/skewed shells: spine spans the
  long axis, reaches entry + stair, stays inside the shell.
- **P2: residual partitioner.** `packRoomsAlongSpine(shell, spine, rooms) → RoomRect[]` — bands off
  the spine, façade-first for window rooms. Pure, asserts every room borders the spine AND every
  window-room has an exterior edge.
- **P3: wire behind a flag** in `subdivide` (`window.__pryzmSpineFirst` / option), default OFF →
  byte-identical. Run the sweep with the flag ON; iterate P1/P2 until sound-rate climbs.
- **P4: flip the default** once the sweep clears a high bar (e.g. ≥ 95/108) AND the full house+tgl
  suite is green AND the founder browser-verifies a few plates. Retire the fragile carve special-cases.

Reordering the work this way means we stop shipping Almanzora-specific patches and instead move ONE
global number — the sound-rate — with each isolated, test-first step.
