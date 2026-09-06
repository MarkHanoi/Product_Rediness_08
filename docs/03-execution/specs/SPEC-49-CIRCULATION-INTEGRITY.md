# SPEC-49 — CIRCULATION INTEGRITY (generator output quality)

Status: **audit + specification**. Authored 2026-08-13 by the circulation-integrity audit lane.
Origin: founder production report, 2026-08-13 —

> "The existing apartment, housing and residential building generators are NOT production ready.
> In the first test: **the corridor doesn't reach the relevant bedrooms · rooms without doors ·
> furniture in front of a door**. The graph layout is critical — **every room must be
> accessible**; corridors and circulation are critical."

Everything below is **measured at HEAD by execution**, not inherited from the report or from any
prior claim. Reproductions are committed and named per section. Where a thing is not measured it
says **UNPROVEN** and names the missing instrument (C70 §2.2).

**Scope boundary — read this before filing anything here.** This SPEC measures **generator output
quality**: does the plan the engine ships hold together architecturally. That is a *different
program with a different denominator* from `docs/04-reference/BIM30-GAP-REGISTER.md`, which
measures **model trust under change** (does an edit propagate or refuse honestly). Merging the two
corrupts both counts. Findings here are logged as `L-854`…`L-858` in
`docs/04-reference/ISSUE-LOG.md` and in this SPEC — **not** in the 82-row BIM 3.0 gap register.

Governing prior art, read first and NOT superseded by this document:
[`SPEC-CIRCULATION-GRAPH.md`](SPEC-CIRCULATION-GRAPH.md) (the founder's graph-theory brief — 3
topologies, the ordered hard-rejection gates, §9 doors-as-entities) and
[`ADR-0262`](../../02-decisions/adrs/ADR-0262-doors-as-circulation-graph-entities.md).
This SPEC does not redefine circulation; it measures whether the shipped artefact obeys it.

---

## 1 — The four invariants

| # | Invariant | Statement |
|---|---|---|
| **CI-1** | **Every room is reachable** | Every habitable room has a path of DOOR-connected rooms to the storey entrance. Formally `computeCirculationReachability(option).fraction === 1`. Circulation rooms (corridor/hall/stair) are the spine, not destinations; an en-suite served within its master satisfies this through its parent. |
| **CI-2** | **Every room has a door** | Every emitted room, circulation rooms INCLUDED, has ≥1 realised opening (`doorAdjacentTo.length > 0`). A strict subset of CI-1 that fails differently: CI-1 can fail on a well-doored room stranded behind a bad spine, CI-2 fails on a sealed box. A doorless STAIR or CORRIDOR is the most severe form. |
| **CI-3** | **No furniture blocks a door** | No placed furniture footprint intrudes into a door's swing/clearance zone, evaluated against the door's REAL swing arc (hinge + leaf width + open direction), not a symmetric proxy box. |
| **CI-4** | **Corridors connect what they claim to** | A corridor shares ≥ a door width with the circulation it is supposed to originate from (stair keep-out upstairs, entrance hall on the ground floor), and every private room it exists to serve takes a direct door onto it. At building scale: every apartment's entry door fronts a corridor band that traces back to the core. |

---

## 2 — Measured failure rate at HEAD, per typology

Reproductions (all drive the REAL production entry — C74 §3.4, no fixture supplies the value
under test):

- `packages/ai-host/__tests__/circulationIntegrityAudit.test.ts` — apartment (108 deterministic
  shell × program combos through `generateDeterministicLayouts`)
- `packages/ai-host/__tests__/circulationIntegrityHouseResi.test.ts` — house (24 storeys through
  `generateHouseLayout`) + residential (34 units through `orchestrateResidentialBuilding`)
- `packages/ai-host/__tests__/furnitureDoorClearanceAudit.test.ts` — furniture (288 rooms through
  `furnishRoom`)
- shared predicates: `packages/ai-host/__tests__/helpers/circulationPredicates.ts`

Run: `cd packages/ai-host && npx vitest run __tests__/circulationIntegrity*.test.ts __tests__/furnitureDoorClearanceAudit.test.ts --silent=false --testTimeout=300000 --disable-console-intercept`

> ⚠ **Two flags were ADDED to that command on 2026-09-06, because the command as
> written no longer works.** Measured at HEAD: without `--testTimeout`, the apartment
> sweep (16.7 s) blows vitest's 5 s default and the run reports
> `Test Files 1 failed | 1 passed (2)` / `Tests 2 failed | 5 passed (7)` with
> `Error: Test timed out in 5000ms` — **a timeout, not an assertion failure, and
> nothing in that output says so.** An agent running the documented command would
> read the authority for these rates as RED and could easily record a generator
> regression that did not happen. Without `--disable-console-intercept` the run
> passes but prints **none** of the rate lines below, so the numbers this section
> exists to carry are invisible. With both flags: `Test Files 2 passed (2)` /
> `Tests 7 passed (7)`.

### CI-1 / CI-2 — reachability and doorlessness

**Re-measured 2026-09-06** (lane RESI-CI0-EMIT-BOUNDARY), by re-running the reproductions
above — the §8 protocol, which requires a changed rate to be re-measured HERE before it is
quoted in the tracker:

| Typology | Sample | **CI-1 unreachable** | **CI-2 doorless** | Verdict |
|---|---|---|---|---|
| `apartmentLayout` | **107** shipped winners (of 108 combos) | **5 / 107 = 5%** | **5 / 107 = 5%** | **PRESENT** |
| `houseLayout` | 24 shipped storeys (0 null) | **9 / 24 = 38%** | **9 / 24 = 38%** | **PRESENT — severe** |
| `residentialBuilding` | 34 shipped units | **0 / 34 = 0%** | **0 / 34 = 0%** | **ABSENT** on the plates swept |

> ⚠ **The 2026-08-13 reading was `7/106 · 7/106` · `12/24 · 11/24` · `0/34 · 0/34`.**
> Every apartment and house figure has moved, and the apartment DENOMINATOR moved too
> (106 → 107 shipped winners: one combo that previously shipped nothing now ships).
> **This lane changed no generator code** — the movement is other lanes' work between
> 08-13 and 09-06, surfaced here by re-running the instrument, not produced by it.
> The improvement is real but it is NOT this section's achievement, and none of it was
> obtained by weakening a predicate: the reproductions are unchanged.
>
> ⭐ **CI-1 and CI-2 are now EQUAL on both generators (5/5 and 9/9).** §2 fact 2 below
> predicted exactly this: the two sets were already identical on apartment and 11-of-12
> on house, because the defect is *"no door was ever emitted"*, not a routing failure.
> The house sweep has now collapsed to full identity.
>
> ⚠ **A SECOND INSTRUMENT DISAGREES ABOUT CI-1, AND THE DISAGREEMENT IS REAL, NOT NOISE.**
> `tools/ga-gate/check-generator-circulation.ts` — same three sweeps, same HEAD — reads
> CI-1 at **3/107 · 4/24 · 0/34** where this table reads **5/107 · 9/24 · 0/34**. The two
> are measuring different things and both are correct: the gate reads the **carried CI-0
> verdict** (`unreachableRoomIds`, computed on the bubble graph *before* emission), while
> this table's helper runs an **independent BFS over the SHIPPED door graph**. A room the
> engine's own pre-emission graph believes is reached, but which no shipped door reaches,
> counts here and not there. **CI-2 agrees exactly on all three (5/107 · 9/24 · 0/34)**,
> which is what makes the CI-1 gap a finding rather than a bug in either reader.
> **Do not reconcile these by preferring one number** — the artefact-side reading is the
> one closer to the user (§0-style reasoning; the tracker's CONTESTED doctrine).

Two facts the numbers carry that a single blended rate would have hidden:

1. **The three generators are not in the same condition.** House is an order of magnitude worse
   than apartment; residential is clean. A blended "generators are ~20% broken" would have been
   true of nothing and would have pointed the fix at the wrong place.
2. **CI-1 and CI-2 fail on the SAME cases.** In the apartment sweep the two sets are identical;
   in the house sweep 11 of the 12 unreachable storeys are doorless. This is *not* "the corridor
   fails to reach a well-doored bedroom" — it is **no door was ever emitted**. The founder's
   phrasing named two symptoms; the measurement says they are one defect.

Observed house victims include `Bathroom`, `Bedroom`, `Storage`, and — on
`17.491x13.416-b2-s2/F1` — **`Stair`**: a storey whose vertical circulation element has no
opening at all. Bathrooms dominate, which is consistent by construction: §DOOR-RESCUE-REACH
deliberately EXCLUDES wet rooms from its rescue pass (`SPEC-CIRCULATION-GRAPH` §9.5 — they are
owned by the privacy passes), so a landlocked bathroom has no rescuer.

### CI-3 — furniture vs door clearance

| Keep-out definition | Rate | Offenders |
|---|---|---|
| **A** — `placeSolver.doorObstacles`, the box placement ACTUALLY consults | **0 / 288 = 0%** | none |
| **B** — the REAL 90° swing arc (`doorSwingKeepout`), either hinge | **3 / 288 = 1%** | `dining_chair` ×2, `japanese_walnut_bed` ×1 |
| **B′** — blocked whichever way the door is hung | **2 / 288 = 1%** | `dining_chair` ×2 |
| **C** — collision-EXEMPT paths, vs the wired box | **22 across 96 rooms** | `rug` ×22 (100%) |

**Verdict: PRESENT but LOW in the measured space; the production rate is UNPROVEN.** The wired
keep-out holds perfectly (arm A = 0). Every intrusion lives in the gap between the box the solver
consults and the arc a real door actually sweeps.

**Scope limit, stated rather than papered over:** this sweep uses single-door, centred-door,
RECTANGULAR rooms. Production furnishes generated rooms with multiple, off-centre doors and
non-rectangular polygons. **1% is a measured FLOOR, not the production rate.** Missing instrument
(CI-3-INSTRUMENT, §6): an end-to-end probe `generateDeterministicLayouts → room payload →
furnishRoom`. It does not exist today because the room-payload builder lives at L7 in
`apps/editor/src/ui/furnish-layout/FurnishLayoutExecutor.ts` and cannot be called from the L2
engine — the same layering fault as §5.

### CI-4 — corridor contiguity

| Scale | Measurement | Result |
|---|---|---|
| Building (`residentialBuilding`) | `ApartmentCell.coreReachable === false` | **0 / 34 orphaned**, **0 unset** (affirmative, not a default), **0 missing a §RESI-CORE-DOOR entry offset** |
| Storey (house/apartment) | corridor↔stair / corridor↔hall gap | **UNPROVEN as a shipped-artefact rate.** `corridorStairGap` / `corridorHallGap` are computed per CANDIDATE inside `enumerate.ts` and are not carried onto `LayoutOption`, so they cannot be read off the shipped result. Missing instrument: CI-4-INSTRUMENT, §6. |

---

## 3 — Which invariants are ALREADY enforced, and why they are not catching this

**This is the heart of the audit. The detection is not missing. The refusal is.**

Every one of CI-1, CI-2 and CI-4 is already computed, correctly, at candidate level in
`packages/ai-host/src/workflows/apartmentLayout/tgl/enumerate.ts`:

| Existing machinery | What it computes | Status |
|---|---|---|
| Rule `reach` — `unreachableHabitableRoomIds()` | CI-1, angle-independently over the realised door graph | **works** |
| Rule `circulation` — `unroutedToCirculationRoomIds` | CI-2 (no door onto circulation) | **works** |
| Rule `served-through` — `servedThroughPrivateRoomIds()` | a private room with no DIRECT circulation door | **works** |
| Rules `corridor-stair` / `corridor-hall` | CI-4 at storey scale | **works** |
| Rules `ensuite-corridor` / `corridor-public` / `corridor-blob` | corridor purity | **works** |
| §DOOR-RESCUE-REACH (`wallsAndDoors.ts`, pass 2e) | repairs CI-1/CI-2 by adding permitted doors, iterating to convergence | **works, but excludes wet rooms by design** |
| §RESI-CORE-CIRCULATION `coreReachable` + `repairCoreCirculation` | CI-4 at building scale | **works — measured 0 orphans** |
| `circulationRobustnessSweep.test.ts` | candidate-level sound rate | **works, but see below** |

**So why does a broken layout ship?** Because nothing refuses it.

1. **§TOPO-HARD-REJECT-ALL ships the least-bad INVALID candidate — by design.**
   `enumerate.ts` tier-ranks hard-valid above hard-invalid, but when EVERY strategy fails the
   gates it emits a `console.warn` and **ships anyway**: *"shipping the LEAST-BAD layout (never an
   empty result)"*. The gates are a preference ordering, not a gate.
2. **On the HOUSE path the structured rejection is disabled outright.**
   `isHousePath = input.envelopeValidator !== undefined` is **always true** for a house storey (the
   orchestrator always injects `validateHouseStorey`), and the empty-result branch is guarded
   `if (viable.length === 0 && !isHousePath)`. A house storey must always produce a layout. **This
   is exactly why house measures 50% against apartment's 7%** — same engine, same door router, one
   fewer refusal.
3. **No orchestrator applies a final gate.** `assembleHouse` pushes the argmax-score option per
   storey with no soundness check; its only failure mode is `null` when the engine returned `[]`.
   `runApartmentCellLayout` takes `options[0]` unconditionally.
4. ~~**The `hardValid` / `hardFailedRules` verdict is DROPPED at the emit boundary.**~~
   **CLOSED — `CI-0` SHIPPED in `1559275e`.** As audited, the verdict lived on `TglCandidate` and
   `emitGeometry` projected to a `LayoutOption` with no such field, so even a caller that WANTED to
   refuse could not see the verdict — *"the single most consequential structural fact in this
   audit"*. **That is no longer true at HEAD**, and this item is kept struck-through rather than
   deleted because the tracker and this SPEC both sequenced everything else beneath it.
   `LayoutOption.circulation?: LayoutCirculationVerdict` now carries `hardValid`,
   `hardFailedRules`, and **three separately-named room sets that are never merged** (C75 §1.2) —
   `unreachableRoomIds`/`Names`, `unroutedToCirculationRoomIds`/`Names`,
   `doorlessRoomIds`/`Names` — plus the CI-4 `corridorStairGap` / `corridorHallGap` flags. Verified
   by execution **2026-09-06**: the verdict is carried on **107/107 apartment · 24/24 house ·
   34/34 residential** shipped options, with **0 disagreements across 165 measured options**
   between the carried verdict and the shipped artefact
   (`npx tsx tools/ga-gate/check-generator-circulation.ts`, ARM A + ARM B).
   ⚠ **`undefined` means NOT MEASURED, never "sound"** — the type says so and the gate classifies
   it that way. **The verdict is a verdict, not a refusal:** nothing in the engine refuses on it,
   and §TOPO-HARD-REJECT-ALL still ships the least-bad hard-invalid candidate (items 1–3 above are
   all still live). What CI-0 bought is that the answer now EXISTS at the layer that must act on
   it — and one consumer already does: `houseLayout/circulationBanner.ts` emits a
   `§DIAG-CI-1-BANNER` naming the sealed rooms, e.g. *"SEALED — no door at all: Bedroom 3,
   Bedroom 1, Bathroom 1 … the layout was generated and SHIPPED anyway — this is a warning about
   what was built, not a refusal to build it."*
5. **The existing sweep is structurally blind to the defect.**
   `circulationRobustnessSweep.test.ts` counts a candidate `sound` only when it is ALREADY
   `hardValid` — precisely excluding the case where nothing is hard-valid and the least-bad ships.
   Its tripwire (`expect(sound).toBeGreaterThanOrEqual(50)` of 108) tolerates a 54% failure rate.
   Measured at HEAD it reports 60/108 sound, 88/108 shipped: **28 shipped winners are hard-INVALID
   and the harness never looks at them.**
6. **There is NO CI-level gate for any of this.** Verified by enumeration of `tools/ga-gate/*.ts`
   (56 checks): none reads `doorAdjacentTo`, `unreachableHabitableRoomIds`, or drives any
   generator. The two gates that mention `apartmentLayout` (`check-refusal-identity`,
   `check-suppression-is-reversible`) are about refusal *messaging*, not circulation soundness.
   **Generator output quality is entirely ungated in CI.**

For **CI-3** the shape of the failure is different and simpler: the correct machinery exists and is
**wired to nothing**.

- `packages/ai-host/src/workflows/furnishLayout/doorSwingKeepout.ts` — true swing sector, HARD by
  design (`rejectFurnitureClashingDoors` DROPS clashing items), fully unit-tested — is imported by
  **exactly one file in the repo: its own test.** Authored-but-unwired since commit `bd43b2bf`,
  whose own header promised *"engine wiring follows"*. It never did.
- **Root cause is upstream of the furnisher.** `Door.swing` exists on the schema
  (`packages/schemas/src/elements/Door.ts`) but is dropped at the wall-opening boundary, so
  `OpeningPose` carries no hinge side and the sector geometry has no data to run on.
  `placeSolver.ts:184-185` states this outright and settles for a symmetric box.
- That box, `doorObstacles`, is **duplicated four times** (`placeSolver.ts`, `kitchenLayout.ts`,
  `wardrobeLayout.ts`, `rules/kitchenValidation.ts`) and **one copy has drifted**:
  `kitchenValidation.doorSwingAabb` uses depth `0.45` half-extent (0.9 m) where placement uses
  `max(width, 0.9)` — for a 1.2 m door the validator's band is 0.9 m where placement's is 1.2 m.
- `validate.ts` has **no area test** for door clearance; its only door check is a 1-D ray from
  0.5 m inside the door to the room centroid, and it is soft-fail (warnings, never a rejection).
  A chair beside the door line but squarely in the arc produces zero warnings.
- Several placement paths bypass the obstacle set entirely: `placeUnder` (rug), `placeOnLeaderWall`
  (wall-hosted), and `placeBedsideLamps` — `furnishRoom.ts:93` calls it WITHOUT the obstacle set
  while the integrated-bed branch one line above passes it.

---

## 4 — The gate that would enforce each invariant

Each is stated so it can be built and watched red (C70 §5.6). **None of these is implemented by
this audit — this lane diagnoses.**

> **2026-08-14 — FOUNDER DECISION (the standing §4 decision, LEDGER half).** The founder
> authorized ledgering **CI-1 and CI-4** in `tools/ga-gate/check-generator-circulation.ts`
> alongside CI-2, at their **measured baselines, shrink-only** (C73 §3.4 — pinned AT the executed
> reading, never above it). Pinned same-commit at: CI-1 UNREACHABLE **5/106 · 7/24 · 0/34**,
> CI-4 CORRIDOR-GAP **0/106 · 8/24 (6 stair + 2 hall) · 0/34** (apartment · house · residential),
> as named rows per (class × sweep case) in `generator-circulation-ledger.json` (C70 §5.5 — never
> bare counts). The gate exits 3 on regression AND on a stale (paid-but-unstruck) row; both
> directions were watched red before the pin (C70 §5.6). **This closes only the ledger question.**
> The RUNTIME-REFUSAL half of CI-1 below — refuse the storey vs ship-with-blocking-banner —
> remains a separate open decision the ledger does not pre-empt; silently shipping remains ruled
> out as the end state.

| Invariant | Gate | Where | Shape |
|---|---|---|---|
| **CI-0 (prerequisite)** | ✅ **SHIPPED `1559275e`** — the verdict crosses the emit boundary | `emitGeometry.ts` → `LayoutOption` | Delivered as `LayoutOption.circulation?: LayoutCirculationVerdict`, and it carries MORE than this row asked for: `hardValid`, `hardFailedRules`, **three** never-merged room sets by **both id and name** (`unreachable*`, `unroutedToCirculation*`, `doorless*`) and the CI-4 `corridorStairGap`/`corridorHallGap` flags. Re-verified by execution 2026-09-06 — carried 107/107 · 24/24 · 34/34, ARM B 0 disagreements / 165 options. Additive as promised: no candidate is dropped and no geometry moved. ⚠ It is a **verdict, not a refusal** — §TOPO-HARD-REJECT-ALL still ships the least-bad candidate, so CI-1's runtime half below is NOT closed by this row. |
| **CI-1** | **Final orchestrator gate** | `houseOrchestrator.assembleHouse`, `runApartmentCellLayout`, `generate.ts` | A winner ships only if `fraction === 1`. Requires a decision the founder owns: house currently CANNOT refuse a storey. Options: (a) refuse and surface the reason, (b) ship + a blocking honest banner naming the sealed rooms. **Silently shipping is the one option this SPEC rules out.** *2026-08-14: the CI ledger half is DECIDED and BUILT (see the decision block above); the (a)-vs-(b) runtime half is still open.* |
| **CI-2** | ✅ **BUILT** — shrink-only doorless ratchet | `tools/ga-gate/check-generator-circulation.ts` | Drives the three generators over the committed sweeps, reads the carried CI-0 verdict AND an independent door-graph reader, and fails if a NAMED row appears that the ledger does not declare. Pinned 2026-08-13 at 7/106 · 11/24 · 0/34; **reads 5/107 · 9/24 · 0/34 on 2026-09-06** and the ledger has shrunk **38 → 27 rows** (`generator-circulation-ledger.json`). ⚠ **Rows are NAMED `<CLASS>::<generator>::<sweep-case>`, never a bare count** — a count lets one fix and one new break cancel out. The gate also exits **3 on a STALE row** (declared but no longer measured), which is what caught 11 rows paid by earlier commits and never struck (`c1e4de7c`). |
| **CI-3** | **Wire the sector, then hard-assert it** | schema → `OpeningPose` → `placeSolver` | Three ordered steps: (1) thread `Door.swing` through the wall-opening payload into `OpeningPose`; (2) replace `doorObstacles` with `doorSwingKeepout`'s sector at all four duplicate sites, deleting the drift; (3) add an AREA validator to `validate.ts` and promote it from soft-warn to hard. Step 1 is the blocker and is the only one that leaves the furnisher. |
| **CI-4** | **Carry contiguity onto the option** | `enumerate.ts` → `emitGeometry.ts` | `corridorStairGap` / `corridorHallGap` exist per-candidate and are dropped. Carry them (part of CI-0's block), then gate. Building scale is already enforced and measured clean — do not rebuild it. *2026-08-14: carried and LEDGERED (storey scale), see the decision block above.* |

**Ordering.** CI-0 first — it is a small additive change and it unblocks CI-1, CI-2 and CI-4. CI-2's
ratchet is the cheapest independent win. CI-3 is a separate track that shares no code with the
others.

---

## 5 — A structural finding that outlives these three defects

**The only implementation of "is every room reachable" lives in the UI.**
`computeCirculationReachability` is in `apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts`
(L7). The generators that SHIP the layouts are in `packages/ai-host` (L2). A lower layer cannot
import a higher one, so **the engine physically cannot call the invariant that judges it.**

The consequence is exactly what is measured above: the invariant can only ever be a *displayed
number* — the "Circulation NN%" chip — never a *gate*. The audit reproductions had to REPLICATE the
predicate (`__tests__/helpers/circulationPredicates.ts`) to measure it at all.

The same fault appears in CI-3: the furnish room-payload builder is L7-only
(`FurnishLayoutExecutor.ts`), which is why the end-to-end furnish probe cannot be written.

**Proposed remedy (not undertaken here):** promote the reachability predicate and the room-payload
builder to a pure L1/L2 package (`packages/circulation-graph` or into `@pryzm/ai-host` itself),
leaving the L7 module a thin consumer. One implementation, callable by the engine, the gate, and
the UI. This is a precondition for CI-1 being enforceable at all, and it should be sequenced
before the gate work rather than after.

---

## 6 — Named missing instruments (C70 §2.2)

| Id | What is UNPROVEN | Instrument needed |
|---|---|---|
| **CI-3-INSTRUMENT** | the production furniture-vs-door rate on GENERATED rooms (multi-door, off-centre, non-rect). Measured floor 1% on synthetic rooms. | end-to-end probe `generateDeterministicLayouts → room payload → furnishRoom`. Blocked on the L7-only payload builder (§5). |
| **CI-4-INSTRUMENT** | ~~the storey-scale corridor-contiguity rate on SHIPPED artefacts~~ **EXISTS since 2026-08-14**: `check-generator-circulation.ts` reads the carried flags and ledgers the rate (8/24 house · 0/106 apartment · 0/34 residential). | ~~blocked on CI-0~~ CI-0 shipped the flags; the instrument is the gate. |
| **CI-5-INSTRUMENT** | whether these rates hold on REAL user plates (the sweeps use synthetic convex quads and founder-scale rectangles) | a corpus of real project shells replayed through the generators. |
| **CI-6-INSTRUMENT** | the DUPLICATE-NAME latent defect (§7) firing in production | it is guarded upstream and measured absent (0 duplicate-named winners in 106); the instrument exists, the risk does not currently realise. |

---

## 7 — A latent defect found by watching the instrument go red

`§DUP-NAME-SAFE` (ADR-0098) keys the reachability BFS by array index and resolves a referenced
NAME to ALL rooms bearing it. That fixes the *collapse-to-one-node* half of the original bug, but
it does **not** make the predicate duplicate-safe: because the reverse edge is minted for every
bearer, a room whose own `doorAdjacentTo` is EMPTY still receives an inbound edge from any
neighbour that names its duplicate — and reads as reached. This is the founder's original
"Circulation 100% while the top rooms are sealed", still live in the predicate.

**It is LATENT, not active**, and that is measured rather than assumed: `emitGeometry`'s
§DUP-NAME-UNIQUE pass mints a unique display name per space, and a dedicated arm confirms **0 of
106 shipped winners carry duplicate room names**. Pinned as current behaviour in
`circulationIntegrityAudit.test.ts`. The durable fix is to key the access graph by room **id**
rather than display name; the uniqueness pass is a guard, not a fix.

**A second instrument defect, worth recording as method.** The furniture probe's first run reported
`0/288` on all three arms — a clean bill of health. The C70 §5.6 negative control failed, and the
cause was that `RectXZ` is `{minX,minZ,maxX,maxZ}` while the probe passed `{x0,z0,x1,z1}`: every
rect was garbage and arm B could never fire. Vitest does not typecheck, so nothing else would have
caught it. **Watching the check go red is what turned a false all-clear into a real measurement** —
and a false all-clear on this exact question is what the founder's report says production already
delivered once.

---

## 8 — Proposal: a generator-readiness register (NOT created here)

The findings above do not belong in `BIM30-GAP-REGISTER.md` (§ scope boundary). They are also
broader than circulation: the same denominator — *"is the plan the generator ships architecturally
sound"* — would hold room-proportion, daylight, window-mandatory, out-of-bounds and
furniture-realism findings, several of which already have hard rules in `enumerate.ts` and the same
"detected, ranked, shipped anyway" fate (`window` was the single largest hard-fail in the sweep at
25 occurrences).

This SPEC proposed such a register rather than creating one unilaterally. **It now exists:**
`docs/03-execution/plans/GENERATIVE-QUALITY-MASTER-TRACKER.md`, minted concurrently by the
programme lane in `a487fe87` with its **own denominator (28)**, explicitly never folded into the
BIM 3.0 82. It consumes this SPEC's §2 readings directly and maps the founder's three defects to
invariants **R1 REACHABILITY / R2 APERTURE / R3 CLEARANCE** (= CI-1 / CI-2 / CI-3 here).

**Division of labour, so neither document drifts:** this SPEC owns the *measurement method, the
per-typology readings, and the gate design*; the tracker owns *programme sequencing and status*.
A changed rate is re-measured HERE first (re-run the four reproductions in §2), then quoted there.

`ISSUE-LOG.md` L-854…L-858 carry the findings. (The tracker was written while those rows were
still in flight and flags them "verify before citing" — they landed in `df028328`.)
