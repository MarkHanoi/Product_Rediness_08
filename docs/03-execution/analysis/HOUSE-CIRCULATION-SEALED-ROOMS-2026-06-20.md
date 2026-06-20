# House ground-storey sealed-rooms — root-cause analysis (2026-06-20)

**Founder report (live deploy):** a 2-storey / 2-bed / 1-bath house ships a GROUND storey
with the **entry hall, dining, and a bedroom sealed (no door)**. Live §DIAG:

```
§DIAG-DOORS summary: doors=3 roomsWithDoor=4/8
   sealed=[r0(hall), r3(dining), r5(bedroom), stair0(stair)]
§DIAG-ADJACENCY r0(hall) → NO DOOR ✗
§DIAG-TOPO-GATE hardValid=false on EVERY candidate
§TOPO-HARD-REJECT-ALL: every one of the 8 strategies is HARD-INVALID
   (failed rules: [circulation, corridor-public, reach, window]) → ships the least-bad.
```

## Reproduction (deterministic, no browser)

`generateHouseLayout(SHELL, PROGRAM, …, { storeyCount: 2 })` with the founder's brief —
`bedrooms:2, bathrooms:1, masterEnSuite:false, openPlanKitchenDining:true, livingRoom:true,
entranceHall:true` on a ~175 m² plate — triggers `§TOPO-HARD-REJECT-ALL`. The reproduction
test lives at `packages/ai-host/__tests__/houseCentralStairSealed.test.ts`.

### ⚠ INVESTIGATION OUTCOME (2026-06-20) — the seal does NOT reproduce on the current engine

Driving the real entry point at the reported brief + dims (**17.491 × 13.416 m, net 175 m²**)
ships a **fully-connected ground storey** — it does NOT reproduce the live seal:

```
§DIAG-ADJACENCY r0(hall) → corridor✓          ← hall IS connected (live report: "NO DOOR ✗")
§REPRO realised doors:
  Entrance Hall – Corridor Door (hall↔corridor) w=1000
  Corridor – Bedroom 1 Door (corridor↔bedroom) w=900
  Living Room – Bathroom Door (living↔bathroom) w=900
  Living Room – Kitchen Door  (living↔kitchen)  w=1100
  Living Room – Dining Door   (living↔dining)   w=1100
```

Every habitable room has a realised door; only the `stair` keep-out is door-less (correct).
`hardValid=false` still fires, but on the **`corridor-public`** rule (a public room fronts the
corridor) + a `circulation` compromise — **not** a sealed hall. So the field truth is:

- The `LayoutOption.rooms[].doorAdjacentTo` field is the **D-TGL graph permeability**
  (`emitGeometry.ts:131`), which the live §DIAG-ADJACENCY / §DIAG-DOORS seal also reads — and
  here it reports the hall connected.
- The live `r0(hall) → NO DOOR ✗` was therefore **plate/seed-specific** (most likely the
  central-stair fragmentation at *other* exact dims — this reproduction picked a `left`-cornered
  U-stair, not the live `central` one), and is **NOT reproducible at this brief**.

**Consequence for the fix:** there is **no failing unit test** proving the carve-engine defect
at this brief, so the candidate carve fixes below stay **un-implemented** (the subsystem's 5×
revert history makes a blind change net-negative). The reproduction test is retained as a
**GREEN standing regression guard** (it pins "this brief ships a connected hall"). To resume the
fix, capture the **exact live plate dims + the central-stair variant** that seals, add them as a
RED case, then proceed.

## Root-cause chain (NOT a one-liner)

1. **The good carve is rejected.** `§HALL-HINGE-CARVE` (`subdivide.ts` ~1180-1382) is the
   ground-floor architecture that seats `[public | hall | corridor | private]` so the hall
   borders circulation. Its `sound()` gate (line ~1356-1369) rejects the carve when **any
   room balloons past 1.15× its bubble target** ("cavern"). Here the **hall squarifies to
   15.9 m² vs a 12.2 m² target (1.30×)** → cavern → carve rejected. This gate is *intentional*
   ("fall through to the 3-zone's more even fill — strictly non-regressing").
2. **The fallback seats the hall badly.** The 3-zone fallback carve does not guarantee the
   hall borders the corridor, so the realised geometry leaves the hall (and dining/bedroom)
   adjacent only via **short shared walls**.
3. **The door engine can't recover.** The bubble graph IS correct — `bubbleGraph.ts:503`
   links `entry(hall) → corridor` with a door. But the bubble-pass `addDoor` (`wallsAndDoors.ts`
   ~1288-1291) returns false when the shared wall is shorter than the minimum door width +
   clearance. `§DIAG-CORRIDOR-QUALITY directAccess=1/3` confirms most rooms have only
   short/served-through walls onto the thin corridor → no min-width door fits → sealed.

So the door engine is a **symptom**; the cause is the **carve** (hall caverns → hinge carve
falls back → thin fragmented corridor with short walls). The central-stair variant in the
live log makes it worse (extra plate fragmentation), but a corner-stair variant of the same
brief ALSO ships `hardValid=false` (stair sealed + corridor-public), so the stair position is
secondary.

## Candidate fixes (need full ai-host house suite + browser verification before deploy)

- **A — keep the hall near target in the hinge squarify** so it does not cavern (distribute
  the public-zone excess to living/kitchen/dining instead of the hall). Then the hinge carve
  applies and the hall borders the corridor by construction. Highest-leverage; touches the
  squarify allocation.
- **B — make the 3-zone fallback hall-adjacent-to-corridor** so even on fallback the hall
  borders circulation with a door-length wall.
- **C — a last-resort circulation rescue** in `wallsAndDoors` that, when the entry hall has no
  realised door, widens/relocates one shared wall to host a minimum hall door.

**Governance:** this subsystem has a long revert history (sealed-rescue, stair-bridge,
area-cap regressions). Any fix must run the FULL `packages/ai-host/__tests__/house*.test.ts`
suite green AND be browser-verified on a rebuilt house before deploy — do NOT auto-deploy a
blind change.
