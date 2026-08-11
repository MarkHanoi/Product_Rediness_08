# BIM 3.0 Continuity Deliverable — parts A–I

> **Stamp**: 2026-08-11 · **Branch**: `main` · **Answers**: the founder's BIM 3.0
> Readiness / Continuity Mission, §20 parts A–I plus the §16 matrix and §18 architecture rule.
>
> **This document adds no new investigation.** It is the assembly layer over four measured
> artefacts, and every claim below points at one of them:
> - [`BIM30-READINESS-REPORT.md`](BIM30-READINESS-REPORT.md) — the excavation
> - [`BIM30-EVOLUTION-AUDIT.md`](BIM30-EVOLUTION-AUDIT.md) §§1–16 + **§17 addendum** (the downgrades)
> - [`BIM20-CERTIFICATION-RESULTS.md`](BIM20-CERTIFICATION-RESULTS.md) — the first EXECUTED certification
> - [`bim30-evidence/EV-03`](bim30-evidence/EV-03-change-impact.md) (probed change-impact) ·
>   [`EV-04`](bim30-evidence/EV-04-semanticgraph-write-coverage.md) (graph write coverage)
>
> **Where evidence is absent the cell says so.** No cell in this document is filled by inference.
> A guessed ✓ in a readiness matrix is the same defect class as a gate printing a number it never
> measured — and this session found fifteen of those.
>
> ---
>
> ### ⟳ Revision 2 — 2026-08-11, later the same day
>
> **Rev 1 is superseded in §A, §D and §G by work that has since LANDED.** Rev 1 was written when
> the certification had run once; four fixes have since been committed and re-measured, so several
> of its "remaining" rows are closed. Corrected in place rather than in a second document —
> a companion file that disagrees with its parent is how a reader ends up trusting the wrong one.
>
> **The persistence suite moved 11 failed / 10 passed → 8 failed / 13 passed** (`f941b39a`).
> Landed since Rev 1: `50725deb` stair+beam identity · `dcf646a0` opening refit-or-refuse +
> the prevState seam · `a48fa88d` the read-only capability class · `f941b39a` GUID stability ·
> `36617890` ADR-0319 (PROPOSED, treated as ratified by founder directive).
>
> **The headline 34 · 0 VERIFIED · 10 PARTIAL · 24 FAILED is NOT re-scored** — that figure spans
> both suites, and seven agents are editing the subject as this is written. Re-scoring mid-edit
> would measure neither state. The per-row deltas below are each individually measured; the
> aggregate is not, and is marked as such rather than estimated.

---

## A. BIM 2.0 closure status — what remains

**BIM 2.0 is NOT closed, and it is now measured rather than estimated.** The first executed
certification returned **34 operations · 0 VERIFIED · 10 PARTIALLY VERIFIED · 24 FAILED**.

**VERIFIED is unreachable by construction.** Collaboration is UNPROVEN on every row because there
is no transport (L-391, leg C). PARTIALLY VERIFIED is the arithmetic ceiling until the sync server
is deployed. This is the single most important sentence in this document: **no amount of further
engineering raises the ceiling; one founder decision does.**

Remaining, in dependency order:

| # | Blocker | Evidence | Shape of the fix |
|---|---|---|---|
| A-1 | **F-1** — identity/audit fields re-minted on every restore and redo | certification §F-1 | **PARTIALLY CLOSED (rev 2).** The **identity** half is done: `ifcData.guid` is now AUTHORITATIVE and carried, resolved in each command's *constructor* so redo re-stamps the same value — **not one guid divergence remains in the harness** (`f941b39a`). The **audit-field** half is decided by [ADR-0319](../02-decisions/adrs/ADR-0319-audit-fields-are-derived-not-authored.md) and is C3/C4 work in flight |
| A-2 | **F-2** — stairs and beams **lose their identity** across save/reload | `ImportProjectCommand.ts:680`, `:875` | ✅ **CLOSED** (`50725deb`). §PERSIST-L1 reached the path that ships — it had been fixed in May 2026 on the *legacy fallback* path only. The `level` row went 2 divergences → **PROVEN** |
| A-3 | leg C — no CRDT transport deployed | C66: 0 tiers HELD | **founder decision** (auth on WS upgrade + ~$5–10/mo), then staging-only flag. **Still the ceiling.** WS auth + the scoring gate are being built now so the decision becomes a single reversible flip |
| A-4 | F-3/F-4 — plumbing+furniture drift **+15 mm/reload cumulative**; openings gain frame fields on reload | certification | **IN FLIGHT.** Explicitly *not* fixable by subtracting 15 mm — the mechanism (an offset applied at authoring **and again** on load) must be proven first |
| A-5 | undo gesture race, pinned RED-BY-DESIGN at the 125 ms cliff | P1-7, `it.fails` tests | founder decision on §UNDO-GESTURE-ID |
| A-6 | read-only capability class | `a48fa88d` | ✅ **CLOSED.** Wired to the live intent path and proven against **store bytes** with a positive control, so "unchanged" cannot be a probe that touched nothing. UNREADABLE ≠ EMPTY asserted through the production context builder |

## B. Existing BIM 3.0 infrastructure — what PRYZM already possesses

Full list at audit §10 (16 subsystems). The load-bearing ones:

**Three graphs already exist.** `RoomGraphService` (rooms-as-nodes, doors-as-edges, BFS
pathfinding, connected components — a genuine **G5 computation**, 20/20 tests) · `SemanticGraph`
(25 typed relationship types, **persisted in snapshot v3**) · `@pryzm/building-graph` (the UBG —
pure, Zod-validated, span-instrumented, 10-edge vocabulary).

**The propagation spine exists and works** — `prevState` store events, `DoorDependencyTracker` /
`WindowDependencyTracker` (regression-pinned), `WallRebuildCoordinator`, `RoomTopologyObserver`,
cascade-delete. EV-03 proved moving a wall carries its openings.

**Deterministic generation is complete and LLM-free**: D-TGL apartment layout, D-FLE furnish,
D-CE ceilings, room detection, ADR-0055 wall joins, schedules, IFC export **including
`IfcRelSpaceBoundary`**, solar analysis, C63 envelope resolution with typed refusals.

**The honesty idioms to copy, not invent**: `LandBasis` (a branded type making a wrong basis
*unrepresentable*), `BuildableEnvelope`'s 17 typed determinations + 11-member refusal union,
`WallOccupancyStore.canPlace` (a real commit-time constraint gate), the roof overhang oracle,
and the R3 canonical-file-plus-counting-gate pattern.

## C. Missing BIM 3.0 primitives — genuinely absent

| Primitive | Status | Evidence |
|---|---|---|
| `wall.split` verb | **MEASURED-ABSENT.** `CutWallCommand` discards the far half **including its openings** | audit §5, §17 |
| level-elevation verb family | **MEASURED-ABSENT** (zero grep hits). `spatial-authority-reconcile` rebuilds **walls and slabs only** — columns, beams, stairs, roofs, furniture stranded | audit §5, §17.2 |
| a real geometric solver | **planegcs is not a dependency.** `PlanegcsAdapter` delegates 100% to `MockSolver`; the worker entry was never written; **the 31/33 passing tests test the mock** | audit §17.1 |
| model-space constraint store | absent — only `annotationConstraints` are persisted, and they are checked, never solved | audit §17.1 |
| 3-D clash engine | UI stub: **12 command ids, no engine** | audit §17 |
| per-element provenance | one family only (`detectionMethod` on room/floor/ceiling), and it is **invented on load** at `roomSnapshotUtils.ts:156` | audit §7, §17 |
| an epsilon policy | **42 point-in-polygon implementations under no declared tolerance** | audit §17 |

## D. Missing invariants — things that exist but are not guaranteed

1. ~~**Openings are not re-clamped when their host wall shrinks.**~~ ✅ **CLOSED rev 2**
   (`dcf646a0`). A 0.9 m door survived on a 1.5 m wall and a 2.1 m door in a 1.0 m wall. The gate
   always existed (`clampToWall`) with two production call sites, **both opening-side** — the wall
   never asked. It asks now, via `planOpeningRefit`, which returns *a plan*: relocations where an
   opening still fits, **typed refusals naming both measurements** where it does not. A refused
   wall is skipped keeping its previous geometry; **no opening is ever deleted to make room.**
2. **Room identity survives a boundary change only by centroid proximity** — move a bounding wall
   far enough and the room is *destroyed and unregistered*, not updated. (EV-03)
3. **Room closure is re-derived but never blocking**, and `repairToSimplePolygon` **invents** a
   boundary and records it as authored (P1-5). (audit §3, §6)
4. **Graph edges are written for 11 of 25 declared relationship types**; `CreateWallCommand`
   writes none at all, and the loader rebuild regenerates only 5 — so a pre-graph snapshot
   **permanently loses all `sitsOn` and `supports` topology**. (EV-04)
5. **Deleting a wall never removes its SemanticGraph edges** — the only kind that doesn't — while
   `DependencyResolver.ts:274` comments that it does. (EV-03)
6. **`_graphAuthoritativeLevels` is marked and never un-marked anywhere**, so a generated level
   freezes its rooms permanently; the releasing sweep is a no-op by construction. (EV-03)
7. **Junction records are computed then discarded** — `JunctionDraft` dies inside
   `resolveJunctions`, so wall connectivity is re-detected on every query. (audit §3, §17)
8. **Byte-compatible round-trip (C13 §2) does not hold** for any element kind. (certification F-1)

## E. Graph / topology assessment

Per-family grades at audit §2 (G0–G6). Summary: **the room tier is G5, hosting and bounding are
G4, and nothing is G6.** Not for want of graph machinery — the three gaps are identical everywhere:
**exposure** (zero graph bus verbs; the UBG lives behind a dev-hook), **retention** (junctions
discarded, dependency edges not indexed), and **failure-honesty** (`RoomGraphService` returns `[]`
for three distinguishable cases).

**Fragmentation is real but must not be "fixed" by merging.** Two edge vocabularies exist
(SemanticGraph 25 types vs UBG 10). The audit's resolution — **declare the UBG's the canonical
*query* vocabulary and map onto it, keep the stores separate** — is smaller, migration-free, and
keeps snapshot v3 loadable. Merging the stores would break every persisted project for a naming
preference.

**Of the eight deterministic topology questions, three are LOOKUP-by-design, four are
RE-DETECTION convertible to LOOKUP by retaining something already computed, and one
(point-in-room) *should* stay geometric.** (audit §3)

## F. Algorithm inventory — what is already deterministic

**Zero-LLM BIM 3.0 is achievable, and this is grep-confirmed, not aspirational: production ships
with no AI key.** ~25 capabilities are fully deterministic today (audit §9), including every
generation engine, room detection, wall joins, pathfinding, spatial queries, quantities, IFC
export, and PDF→BIM tier 1 (proven zero-token).

**AI is required for exactly three things**, all of them *consumers* of bus verbs and graph reads,
none an authority over model state: natural-language intent→command, free-form design
conversation, and AI layout proposals. The P0-4 inversion already made read-only the default
posture; the structural read-only capability class is the last open AI-boundary debt (A-6).

## G. Minimal implementation roadmap — leverage, risk, dependency, compatibility

**Tier 1 — model truth** (unblocks everything; all inside existing commands) — **rev 2: 4 of 6 landed**
1. ✅ **A-2** pass the id in `ImportProjectCommand` — highest value per character in the repo (`50725deb`)
2. ✅ **`clampToWall` inside the two wall commands** (D-1) (`dcf646a0`)
3. ✅ **prevState on `updateDoor`/`updateWindow`** — two arguments that made the shipped
   openings-only fast path reachable and fixed the ADR-057 drag defect. **The test shipped with
   it matters more than the fix**: every existing test built `prevState` by hand, so the whole
   suite was structurally blind to a missing argument at the seam (`dcf646a0`)
4. ⟳ **type `window.semanticGraphManager`** — turns the `measuredAt` bug into a compile error (in flight)
5. ✅ **A-1 contract decision** — [ADR-0319](../02-decisions/adrs/ADR-0319-audit-fields-are-derived-not-authored.md):
   identity AUTHORITATIVE, counters DERIVED-BUT-CAUSAL (may differ across a restore, **never**
   across an undo), timestamps DERIVED-INCIDENTAL and excluded **by enumeration, never by pattern**
6. ✅ **GUID carried, not recomputed** (`f941b39a`) — added in rev 2; it was folded inside A-1 in
   rev 1 and deserved its own line, because the *determination* (authored, not derived) is what
   decided the fix

**Tier 2 — retention** (converts re-detection to lookup; no new architecture)
6. **CONNECT-3** retain ADR-0055 junction records → `connectedTo` gets a deterministic writer,
   the mismatched-epsilon double-detection behind §DIAG-ROOM-LOOP disappears, and
   `IfcRelConnectsPathElements` export unblocks
7. **CONNECT-0** wire the dead cascade — **but note EV-03's correction: listeners alone are not
   enough**, because `DependencyResolver` subscribes to the *bus*, not the stores, so `prevState`
   never reaches it. Both halves, or neither.

**Tier 3 — reasoning** 8. **CONNECT-1** UBG → `composeRuntime` slot + three read-only
refusal-honest verbs (`graph.query` / `neighbors` / `path`) · 9. **CONNECT-2** validators emit
`violates` edges (needs a production caller for `provideLiveGraphSources`, which is dev-only
today) · 10. the 5 provenance fields + the P1-5 fix in the same PR — *the fix **is** writing the field*

**Tier 4 — collaboration** 11. deploy sync (**founder**) → leg C → C66 tiers move CLAIMED→HELD

**Tier 5 — AI interface** 12. finish the read-only capability class; graph verbs become chat-queryable

**Do not reverse this order.** Tiers 3–5 are unprovable while Tier 1 is open: the certification
ceiling is set by Tier 4, and every graph claim is unverifiable while identity is re-minted.

## H. Architecture-change report

> ## NO ARCHITECTURAL REWRITE REQUIRED.

The audit's REPLACE list is **empty** and survived the §17 downgrades. Every item in §G is
retention, wiring, dedup, a missing verb, or contained construction filling an existing scaffold.

Two items are **construction, not wiring**, and are labelled as such rather than smuggled in:
writing the planegcs WASM binding (fills an existing adapter; no architecture change) and the
model-space constraint store (follows the component-editor's existing store pattern).

One candidate for replacement was considered and **rejected**: the dual edge vocabulary, resolved
by mapping instead (§E).

## I. BIM 3.0 readiness gates — **the real remaining gap**

Parts A–H are *claims*. §I is what keeps them true, and **it does not exist yet.** The pattern is
already proven in-repo — the certification harness derives status from axes rather than
hand-assigning it, and proves its own falsifiability by diffing against a *tampered* state. These
gates extend that harness; none needs new infrastructure.

| Gate | Asserts | Extends |
|---|---|---|
| `check-identity-roundtrip` | every element kind restores with its original id **and** GUID; hard-0, no baseline | certification `persistence.cert.ts` |
| `check-topology-survives` | move / resize / regenerate / save-load / undo never mint a new semantic id | new probe over the cert world |
| `check-graph-write-coverage` | declared relationship types with zero writers **do not grow**; ratchet from 12 downward | EV-04 census |
| `check-derived-regenerable` | rebuild-from-authoritative ≡ restored snapshot; the persist-or-lose list is a **named, shrinking** ledger, not a surprise | cert comparator |
| `check-propagation-reaches` | every declared cascade event has ≥1 listener **and** its emitter carries `prevState` | would have caught CONNECT-0 *and* EV-03's second cause |
| `check-constraint-honesty` | no adapter may report a solve it did not perform; a mock must announce itself | would have caught the planegcs mock |
| `check-epsilon-policy` | one declared tolerance constant; new geometric predicates must consume it | R3 counting-gate pattern |
| `check-provenance-not-invented` | no code path stamps an origin it did not observe | `roomSnapshotUtils.ts:156` |
| `check-collab-graph-integrity` | concurrent edits to a wall and its hosted door converge with the hosting edge intact | **blocked on A-3** |

**Every gate above must obey the four exit-code contract this session established** — `0` clean ·
`1` failed at its declared level · `2` **MISCONFIGURED, never absorbable** · `3` **RATCHET
EXCEEDED, never absorbable** — and must declare a `minFiles`-style floor so that *a broken scan
can never print a pass*. That rule is not stylistic: fifteen gates were found green-and-blind this
session, and every one of them failed by being unable to distinguish emptiness from failure.

## The target, scored honestly

| Mission §21 statement | Today |
|---|---|
| persistent, authoritative, identity-preserving model | **rev 2: identity HOLDS** — element ids and IFC GUIDs now survive save→restore→redo across every kind the harness covers. What still fails is *state* round-trip (audit fields, a +15 mm drift, phantom frame fields), not identity |
| topologically coherent | partial — junctions discarded, room identity centroid-fragile |
| computationally queryable | **machinery yes, exposure no** — zero graph verbs |
| geometry a deterministic consequence of model state | **YES** — the strongest finding in the whole assessment |
| relationships explicit enough for algorithms | 11 of 25 types written |
| changes propagate deterministically | **bespoke yes, generic dead** |
| collaboration preserves graph integrity | **UNPROVABLE** — no transport |
| AI is an interface, not the source of truth | **YES**, with the read-only class the last gap |

**Maturity Level 4 of 8. 50–75%, at the floor of that bracket.** Level 5 is one composition slot
away; Level 6 is one constraint store **plus a real solver** away.

---

*Not verified here: this document performs no independent measurement. Rows depending on
[EV-01](bim30-evidence/) (topology/geometry field detail) and EV-02 (per-schema provenance) are
carried at the audit's own BY-READ/UNPROVEN grade — those two sweeps were stopped before
reporting and their gaps are named, not filled.*

*Rev 2 addendum: the aggregate certification score (34 · 0 VERIFIED · 10 PARTIAL · 24 FAILED) is
**not** re-measured above. Only the per-row deltas are, each from an executed run. Seven agents
were editing the subject when rev 2 was written, and a score taken mid-edit describes no state
that ever existed. The next full re-score belongs in
[`BIM20-CERTIFICATION-RESULTS.md`](BIM20-CERTIFICATION-RESULTS.md), which is the artefact that
owns it — not here.*
