# BIM 3.0 — the certification plan

> **Stamp**: 2026-08-12 · **Status**: PLAN (Phase 0) · **Supersedes nothing**
> **Authority**: [`C70`](../../02-decisions/contracts/C70-BIM30-TARGET-AND-GOLDEN-CHAIN.md) owns
> the Golden Chain, the four-exit-code contract, the minimum-evidence floor and the Definition of
> Done. [`C71`](../../02-decisions/contracts/C71-GRAPH-AND-TOPOLOGY.md)–
> [`C75`](../../02-decisions/contracts/C75-PROVENANCE.md) own the subject invariants.
> **This plan owns only the harness**: the canonical world, the canonical operations, the scoring,
> the falsifiability discipline, and the named limits.
> **Companion**: [`BIM30-READINESS-GATES.md`](../../04-reference/BIM30-READINESS-GATES.md) — the
> 23 gate specifications this harness runs (4 BUILT, 19 SPECIFIED-NOT-BUILT).
> **Siblings, forthcoming, owned elsewhere — not duplicated here**:
> `docs/04-reference/BIM30-GAP-REGISTER.md` · `docs/04-reference/BIM30-DO-NOT-REBUILD.md`.
> **Model**: the BIM 2.0 harness that worked —
> `tools/rac-conformance/certification/{world,seed,capture,report,contract,floors,certify}.ts`
> and [`BIM20-CERTIFICATION-PLAN.md`](BIM20-CERTIFICATION-PLAN.md). *Activate, retain and certify
> — do not rebuild.*

---

## §0 — What certification is, and the one sentence it exists to make impossible

Certification is **an executed run whose comparator has been watched go red**. Nothing else on
this page counts: not a document, not a test count, not a UI acknowledgement, not a green suite
over a substituted implementation.

The sentence this harness exists to make impossible is the one the repository has already
printed:

> *"0 divergences."* — over a subject of zero.

An **empty seed** once produced the best-looking certification this repository had ever recorded.
Every kind failed to seed, every comparator honestly reported "nothing to compare", every row
read UNPROVEN, the FAILED tally was 0, and vitest exited 0. That run was **maximally broken and
maximally green**. It now exits **2** (`e5addac8`). Independently, a compile gate fabricated ~90
PASS lines per run for its entire life and never compiled the thing it reported on (`2b1e7e99`).

Everything below — the floors, the printed compared-counts, the negative controls, the derived
statuses — is downstream of those two incidents.

---

## §1 — The canonical test world

### §1.1 — The decision: **EXTEND**, do not supersede — and the justification is from reading `seed.ts`

**Decision: keep `tools/rac-conformance/certification/seed.ts` exactly as it is and add a second,
additive world builder — `seedBuilding30.ts` — in the same directory, sharing `world.ts`,
`capture.ts`, `contract.ts` and `report.ts`.**

Two separate findings drive this, and they point in opposite directions:

**(a) The seeding *machinery* is right and must be reused.** `seed.ts` composes every kind
through **real** `@pryzm/command-registry` commands on the **real** `CommandManager`; no store is
written directly, so *a kind that cannot be composed by a real command is REPORTED as unseeded
rather than faked into existence*. Its `seed()` wrapper records `SEEDED` / `REFUSED: <reason>` /
`THREW: <error>` and **swallows nothing** — which is what makes `floors.ts`'s
`minEstablished` floor meaningful. Its `mutate()` half drives **live bus verbs** so persisted
values are not defaults. Rewriting that would be rebuilding the one part that works.

**(b) The seeded *model* cannot support a single BIM 3.0 topology assertion.** Read the fixture,
not the file:

| What BIM 3.0 needs | What `seed.ts` builds | Consequence |
|---|---|---|
| wall junctions | `cert-wall-1` at `z=0` and `cert-wall-2` at `z=4`, **parallel and never touching** | **zero junctions.** C-INV-2 (junctions retained, not re-detected) is **unmeasurable**, not failing — unmeasurable. |
| room adjacency and door connectivity | **one** room, `detectionMethod: 'manual-boundary'` | `adjacentTo`, `connectedTo`, `boundedBy` beyond one room: **unmeasurable**. And a manual boundary bypasses derived room topology entirely. |
| multi-level fabric | `L1` is added by `AddLevelCommand`; **every element is on `L0`** | `sitsOn`, `contains`, level containment, multi-level stair reasoning: **unmeasurable**. The stair declares `topLevelId: 'L1'` and arrives at an empty floor. |
| hosted opening per wall type | one door on an exterior wall, one window on another exterior wall | **no interior wall exists at all**, so "an opening on an interior wall" has no subject. |
| structural support | one column, one beam, no relationship between them | `supports`: **unmeasurable**. |

An 18-kind inventory is not a building. `seed.ts` proves that **each kind can be composed**;
BIM 3.0 asks whether **a building holds together**, and those are different subjects.

**(c) Why extension rather than replacement — the reviewability argument.** `floors.ts` pins its
floors to a measured reading of *this* seed (18 rows · 19 records · 18/18 SEEDED · 16 undo rows ·
15 undo entries armed), and `cert-ratchet.json` pins `maxFailedRows` to the FAILED-row count over
*this* subject. Editing `seed.ts` moves the subject **underneath** both, in the same commit, and
every floor and every ratchet number would have to be re-derived at once — which is
indistinguishable, in review, from lowering a floor to make a run green (C70 §5.3, the act that
must be reviewed as deleting the gate). The BIM 2.0 verdict must remain re-runnable and
comparable after BIM 3.0 lands.

**Therefore**: `seedWorld()` keeps its floors and its ratchet, untouched; `seedBuilding30()` gets
**its own** `SUITE_FLOORS` entry, its own ratchet file, and its own artefact under `results/`.
Shared: `World`, `captureState`, `diffState`, the ADR-0319 class lists, `contract.ts`, and
`certify.ts`'s ordering of authority.

### §1.2 — The building, specified concretely enough to be built

The founder's §13 canonical building, expanded from the audit's *"two levels, stair, six rooms,
doors, windows, roof"* to the fixture BIM 3.0's invariants actually need. **Every count below is
a declared target the harness asserts.** A target the machinery cannot yet produce is a **named
zero and a finding** — never a silent absence.

**Hierarchy**
- 1 project · 1 site · 1 building.
- **3 levels**: `L0` (ground, elevation 0.00, height 3.20) · `L1` (elevation 3.20, height 3.20) ·
  `L2` (roof datum, elevation 6.40).
- 2 grids (one `X`, one `Z`) — the seed already composes these.

**Walls — 14 total**
- **8 exterior**: a closed 12.0 × 8.0 m rectangle on `L0` and again on `L1`. Closed shells are
  mandatory: **the corners are the junction subject.**
- **6 interior**: 3 per occupied level — one spine wall at `x = 6.0` running the full depth, two
  cross walls meeting it.
- **1 curtain wall** on the `L0` south elevation (a distinct wall *system type*, not a 15th
  structural wall).
- **Declared junction targets**: ≥ 8 **L** (the four corners × two levels) · ≥ 4 **T** (spine
  meets exterior; cross meets spine) · ≥ 1 **X** · **≥ 13 retained junction records total**.
- **Declared system types**: ≥ 3 distinct wall system types across the 14, so
  `wall.updateSystemTypeBatch` has a real subject.

**Hosted openings — ≥ 8, and at least one per wall type**
- exterior: **1 entrance door** (single) + **4 windows** (two per level).
- interior: **2 doors**, each connecting two rooms — these are what make `connectedTo` (room ↔
  room via door) measurable at all.
- curtain wall: **1 opening attempted.** If `CreateWallOpeningCommand` refuses a curtain-wall
  host, **the refusal is the evidence** and the row scores **REFUSES-CORRECTLY** with the reason
  printed. It is never a blank and never an assumed pass.

**Slabs / floors / ceilings / roof**
- 3 slabs: floor plate on `L0`, floor plate on `L1`, **1 balcony slab** on `L1` (a partial plate
  is what makes `sitsOn` and `supports` non-trivial).
- floors and ceilings per room where the composing command exists; unseeded kinds are reported.
- **1 roof** over the `L2` footprint with a **300 mm overhang** — deliberately the polygon-offset
  oracle case, so the geometry link has a known answer (spread 0.000) rather than a self-consistent
  one.

**Rooms — 10**
- `L0` (**6**, the founder's number): entrance hall · living · kitchen · bathroom · bedroom ·
  corridor.
- `L1` (**4**): landing · bedroom 2 · bedroom 3 · bathroom 2.
- **The corridor is adjacent to ≥ 3 rooms** and connected by door to ≥ 2. Rooms are **derived**
  from wall topology where the detection engine can run — `detectionMethod: 'manual-boundary'` is
  permitted **only** where derivation refuses, and the fallback is recorded per room.

**Circulation, structure, materials**
- **1 multi-level stair** `L0 → L1`, and a second flight `L1 → L2` where composable. **At least
  one stair must span two levels** — a single-level stair cannot exercise level connectivity.
- **6 columns** (grid intersections) and **4 beams** spanning between them, so `supports` has a
  real subject in both directions.
- **1 handrail** on the stair · plumbing and furniture ≥1 each (they carry `hostedBy`/`contains`
  questions).
- **≥ 3 distinct material assignments** across wall / slab / room, and ≥ 1 system type per
  wall, door, window and slab family.

**Declared topology targets** — asserted per family, printed per family, a zero against a declared
target being a finding:

| Family | Target | Notes |
|---|---|---|
| `hosts` / `hostedBy` | ≥ 8 | the reference-shape pair |
| `boundedBy` | ≥ 30 | ~4 walls per room × 10 rooms |
| `adjacentTo` | ≥ 8 room pairs | corridor carries ≥ 3 |
| `connectedTo` | ≥ 3 | room ↔ room **via door** — never overloaded with wall ids |
| `joinedTo` | ≥ 13 | **wall ↔ wall via retained junction.** Zero today: not a member of `RelationshipType`, no writer. **Named zero.** |
| `sitsOn` | ≥ 8 | `L1` walls and columns on the `L0` plate |
| `supports` | ≥ 6 | columns → beams; walls → slab |
| `contains` | ≥ 10 | level contains rooms. **No first-party writer today. Named zero.** |
| `partOf` | ≥ 1 | unit containment |

> **§1.2.1** The two named zeros are **the fixture doing its job**. A world that could not express
> `joinedTo` and `contains` would let their absence read as "nothing to measure"; a world that
> declares the target and measures 0 makes the gap a **finding with a name**.

### §1.3 — What the world does *not* do, declared as a stub ledger

Copied from `world.ts`'s existing discipline, which declares its stubs loudly:

- **The plugin-DTO stores are write-only sinks by construction** — exactly production's
  `storesAsRecordView` shape. **Nothing in this harness may read a verdict from them.**
- **No fragment builders are registered**, so geometry **meshes** are not built and the
  **Geometry link is UNPROVEN in every row this harness emits** — unless and until the BIM 3.0
  harness registers builders, which is a scoped, reviewable change and is the precondition for
  `check-deterministic-regeneration`.
- **`document.hidden === true`** routes `ProjectLoader` through its real hidden-tab macrotask
  branch, because the P3 frame bus never ticks headlessly and the load would await a frame that
  can never arrive (the L-716 unsatisfiable-gate shape; the smoke run measured a 600 s hang).
  **This is a real production path, not a harness fork**, and it is declared so nobody has to
  rediscover it.
- **The undo harness certifies the legacy `commandManager` stack**; the unified `performUndoRedo`
  path (ring-first + 250 ms cross-stack window) is **not certified** and the report says so.
- **9 plugin bridges of 48 plugins** are registered. Any claim of the form "no listener anywhere"
  is therefore a **static** claim (see C72 §6.1.1) and must not be made from this world.

---

## §2 — The canonical operations

Every operation below is executed **through bus verbs on the composed world**, and every one is
scored on all 11 Golden Chain links (§3). The oracle for the **state** link is always
`capture.ts`: a JSON deep-clone taken **before** the operation, compared against a **fresh read of
the live stores after** it. **The comparator never consults `CommandResult.success`, a handler
patch, or any store's own opinion** — §7's oracle rule: *never ask the same object whether it is
valid.*

### 2.1 — Model operations

| Operation | Read-back oracle |
|---|---|
| **create** | the element appears in the authoritative store with the requested id and properties; the DTO store is **not** consulted |
| **modify** | before→after diff equals the declared expected path set, **exactly** — extra paths are findings |
| **delete** | element absent; **its edges are purged** (feeds `check-graph-delete-integrity`); the cascade is **non-empty** |
| **undo** | capture equals the pre-operation capture, **class-2 counters included** (a counter that walks forward through an undo is a real defect, ADR-0319 §2) |
| **redo** | capture equals the post-operation capture; no identity or monotonic counter walks forward (B-INV-2) |
| **save → reload** | ids and `ifcData.guid` byte-identical, no tolerance (B-INV-1); the ADR-0319 class-2 list may be consumed **here only**, with its citation printed on every row it touches |
| **regenerate** | rebuild-from-authoritative ≡ restored snapshot (I-INV-1); twice in-process ≡ byte-identical (E-INV-1) |

### 2.2 — Topology operations

`connect` · `host` · `contain` · `support` · `intersect` · `adjacent` · `depend`.

Each is scored as: **the edge is written at the moment the relationship comes into being** ·
**typed-read by a named consumer** · **persisted or declared regenerated** · **updated on move**
(the axis that is UNPROVEN for every family) · **removed on delete, restored verbatim on undo**.
That is C71 §1.2's six semantics, executed rather than declared.

### 2.3 — Graph operations

`create edge` · `query` · `delete` · `persist` · `rebuild` · `propagate along edge`.

- **rebuild twice from the same authoritative state → identical snapshots** (D-INV-2).
- **serialize → restore → rebuild → diff ∅**.
- Every query is asked **through the same bus verbs every other consumer uses, the AI interface
  included** (D-INV-3); a harness that reaches into `SemanticGraph` directly is measuring a
  different system than the product ships.
- **`[]` may only ever mean "zero results".** A query that cannot be answered **refuses with a
  named reason** (C71 §4.4).

### 2.4 — Geometry operations

`move` · `resize` · `split` · `join` · `offset` · `roof` · `opening`.

- **`offset` carries a known answer**: the 300 mm eave, spread 0.000. An operation with an oracle
  is worth ten with self-consistency.
- **`opening` on a shrinking wall is the refusal case**: `planOpeningRefit` relocates the opening
  or **refuses naming both numbers** — the opening's required span and the wall's remaining span.
  A silently clipped opening is a failure; a refusal naming both numbers is
  **REFUSES-CORRECTLY**.
- Impossible transforms produce **named typed refusals** (`BaselineReversalError`, the roof's
  three named collapse modes, `polygonOffset`'s labelled `{ degenerate: true, reason }`), never an
  empty array, a clamp, or an identity transform.

### 2.5 — Reasoning operations

*what is connected · what is hosted · what is affected · what depends on this · what does this
support · shortest path · what clashes · what becomes invalid.*

Each needs a **hand-checked expected answer over the canonical world**, written down before the
run. Each is executed **twice — once with the AI host composed, once with it absent — and the two
answers must be identical.** *Removing the AI box entirely must cost the system no capability
except conversation* (C70 §1.3), and that is a property to be tested, not admired.

### 2.6 — Collaboration operations

`concurrent wall + opening edit` · `topology-preserving merge` · `conflict` · `reload`.

**Every one of these is UNPROVEN today, by construction, because no transport is deployed** — and
that is a founder decision, not an engineering task. The harness reports `transport-absent` →
**exit 2**, never a green row. `check-collab-graph-integrity`'s local-harness mode proves the
**code** preserves the hosting edge; it does **not** prove a deployed transport, and production
still runs socket.io last-writer-wins.

---

## §3 — Golden Chain scoring

### §3.1 — Eleven links, one axis each

```
intent → command → state → geometry → topology → graph → propagation
      → persistence → undo/redo → collaboration → report
```

Every canonical operation is scored on **all eleven**. The BIM 2.0 `report.ts` scores **seven**
(`authoritativeState`, `geometry`, `persistence`, `undo`, `redo`, `collaboration`, `report`);
BIM 3.0 extends `CertRow` with **intent**, **command**, **topology**, **graph** and
**propagation**, and splits nothing that already works.

**The rules, restated because they are the whole point:**

- **No partial credit.** A capability missing a link **is not BIM 3.0 complete**, and may not be
  described as "mostly there", "90 %", or "complete except". A wall-move that updates geometry but
  strands the schedule is an **incomplete chain**, not a working feature with a known issue.
- **No axis is inferred from a neighbour.** Geometry holding says nothing about topology. This is
  the rule that makes eleven columns worth having instead of one grade.
- **A link that has not been executed is UNPROVEN**, and a chain containing an UNPROVEN link
  scores as **incomplete, never as passing**. This is what stops "we have no transport" from
  quietly reading as "collaboration is fine".
- **No link may be scored by the subsystem that owns it.** A subsystem asserting its own success
  is the bench-asserts-its-own-header defect.

### §3.2 — The verdict vocabulary (reused from BIM 2.0, extended by one)

| Verdict | Meaning | Counts as |
|---|---|---|
| **PROVEN** | executed, read back, comparator watched go red elsewhere | pass |
| **REFUSES-CORRECTLY** | the system declined, named the rule and **both numbers**, and changed nothing | **pass** — a delivered, named refusal is correct behaviour, and `report.ts` already classes it with PROVEN |
| **FAIL** / **SILENT** | executed and wrong; or succeeded without saying so | fail |
| **UNPROVEN** | nobody looked, or the path could not be executed | **neither pass nor fail** |
| **MISCONFIGURED** | the subject could not be established | **neither** — and never absorbable |
| **n/a** | the link does not apply to this operation, with the reason printed | excluded from the tally, never from the row |

Row-level statuses: **VERIFIED · PARTIALLY VERIFIED · FAILED · UNPROVEN · MISCONFIGURED**.

**Two required changes to `report.ts`:**

1. **`MISCONFIGURED` must become a row status.** Today `diffKind` can return `MISCONFIGURED` for a
   kind, but `statusOf` has no such status — so a misconfigured row can only land as UNPROVEN,
   which reads as "nobody looked" when the truth is "the harness is broken". They must be
   different values (C70 §5.1) and MISCONFIGURED must propagate to the suite exit code.
2. **`links` grows from 7 to 11**, and the ceiling declaration in the header is restated.

### §3.3 — Why status is DERIVED from axes, never hand-assigned

`statusOf()` computes the row status from its own link verdicts, and it is the correct design for
a reason that has nothing to do with tidiness:

- **A hand-assigned status is an opinion in a column of measurements.** It survives every code
  change that invalidates it, because nothing recomputes it. The whole failure family this
  certification exists to prevent — the fabricating compile gate, the empty seed, the mock behind
  the passing tests — is a *stated result that outlived the thing it described*.
- **Derivation makes partial credit structurally impossible.** `statusOf` cannot answer VERIFIED
  while any measured link is unproven, because the arithmetic forbids it. Nobody has to *remember*
  §3.1's no-partial-credit rule; it is a property of the function.
- **It makes the ceiling visible and declarable on day one.** With collaboration UNPROVEN by
  construction, **`VERIFIED` is unreachable for every row in this harness, and the ceiling is
  `PARTIALLY VERIFIED`.** BIM 2.0's `report.ts` says exactly this in a comment on the line that
  makes it true. **Declaring an arithmetic ceiling on day one is a DoD requirement** (C70 §6.3) —
  precisely so the number cannot be quietly redefined later, when the pressure to redefine it
  arrives.

### §3.4 — The mapping to the eight golden operations

The DoD's second condition (C70 §6.2): **query · impact · validation · geometry · provenance ·
propagation · collaboration · explanation**, each holding its **entire** Golden Chain, statuses
derived. Seven map to existing-or-planned machinery; **collaboration is named as blocked on
founder-owned infrastructure rather than absorbed dishonestly**, and that framing is binding on
every report this harness emits.

---

## §4 — Falsifiability requirements

**Non-negotiable. A harness that has never failed has not been shown to be able to.**

### §4.1 — Every comparator is proven against a tampered state

Before any comparator's verdict is trusted, it is watched go red against a deliberate corruption,
and **the failure text is recorded in the harness header**:

| Comparator | Tamper | Must report |
|---|---|---|
| identity | re-mint one element id, and separately one `ifcData.guid` | the kind, the lost id, the minted id |
| state read-back | mutate a property the verb did not touch | the extra path, not silence |
| DTO-vs-authoritative | point a handler at the detached DTO clone | "authoritative store unchanged; DTO-only write" |
| topology | dissolve a junction; re-identify a surviving edge | the stale edge; the re-identification |
| graph rebuild | strip one persist-only family from the snapshot | the **named** loss |
| regeneration | seed a producer with `Date.now()`; reverse iteration order | the first divergent path |
| undo | leave a monotonic counter moved | the counter — **class 2 is restore-only and must never be consumed across an undo** |
| collaboration | dangling host after merge | already built in and run every time (`blind-comparator` → exit 2) |

### §4.2 — Every run reports how many objects it compared

Every comparator prints its **compared count next to its verdict**, and every floor prints
`measured / min` whether met or not — `contract.ts`'s `reportGate` already does this and it is not
optional. **"0 divergences" without a compared count is not a result.**

### §4.3 — A negative control per harness, in-run

Each harness runs its own checker over a **deliberately broken fixture inside the run**. If the
checker calls the broken fixture clean, the run is **`blind-comparator` → exit 2**, and **every
verdict it produced that run is invalidated** — not downgraded, invalidated.
`collabGraphIntegrity.ts` is the working implementation and the pattern to copy.

### §4.4 — The deliberate-breakage proof

Before the BIM 3.0 harness is trusted, it is run **against a deliberately empty world** and must
exit **2**, not 0. This is the empty-seed incident reproduced on purpose, and the proof is
recorded with its output. `floors.ts` already names the three ways a broken run could print a
pass, and each must be re-proven for the new suite:

1. **the seed is empty** → `minRecords` / `minEstablished` → exit 2;
2. **the suite crashes and the artefact is stale** → the freshness stamp taken **before** the
   runner spawns vitest → exit 2 (*grading a stale artefact is grading the past*);
3. **the measurement never ran** → `requireRan` on `serializeError` / `loadError` → exit 2
   (*every "0 divergences" is vacuous when the round-trip never executed*).

### §4.5 — Floors are derived from a measured reading, and stated with it

Each floor sits **below** the reading it guards, far enough that ordinary drift does not trip it
and close enough that a collapse does — and it is written down **with the measurement it came
from**, so that raising it to make something pass is **visibly a lie rather than a tuning
choice**. Floors may never be lowered to make a run green.

### §4.6 — Vitest's exit code is not the verdict

The suites are **red by design** — they use `expect.soft` so the whole table prints, and every red
`it` is a **measured divergence, a finding, not breakage**. Treating a non-zero vitest exit as
"broken" would make the honest state of the estate indistinguishable from a crash; and the
dangerous converse is that a suite seeding **nothing** exits 0. So `certify.ts` timestamps, runs,
and then grades the **artefact** against floors, in this order of authority:
**MISCONFIGURED (2) → RATCHET (3) → DECLARED (1) → CLEAN (0)**.

---

## §5 — What certification CANNOT prove today

Named, per doctrine, so that no reader mistakes the harness for coverage. Each is **UNPROVEN**,
which is neither a pass nor a fail.

1. **The collaboration axis — no transport.** No deployed sync transport exists; production runs
   socket.io last-writer-wins. Every collaboration link is UNPROVEN **by construction**, which
   caps every row at PARTIALLY VERIFIED (§3.3). `check-collab-graph-integrity`'s local mode proves
   the **code**, never a deployed transport, and C66 tiers therefore remain **CLAIMED, not HELD**.
   **This is a founder decision, not engineering work**, and it must never be reported as an
   engineering backlog item.
2. **GPU and shader geometry.** Anything computed in a shader is outside every gate and every
   harness here. The world builds no meshes at all today (no fragment builders registered), so the
   **Geometry** link is UNPROVEN in every row until that scoped change lands — and even then, the
   GPU half stays outside.
3. **Cross-architecture float determinism.** `check-deterministic-regeneration` D1/D2 run in **one
   process on one architecture**. Platform-dependent floating-point differences — the ones that
   make a Windows founder's model differ from a Linux CI runner's — are **not measured by
   anything**.
4. **Runtime reachability of graph writers, listeners, releases and algorithms.** Discovery is
   static: **a writer that exists but is never reached counts as present**. C70 §4.2 is the
   standing warning — *machinery present ≠ capability reachable* — and it is exactly how Level 6
   was graded "one constraint store away" when the solver in the tree is a mock. **No gate and no
   harness in this plan answers the reachability question.**
5. **Five further named limits**, each stated so it is not inferred from silence:
   - **The fixture is not the user's project.** An executed run proves the seeded world, and the
     world is itself a declared, reviewable artefact.
   - **Correctness beyond stability.** Counting gates are deliberately blind to correctness; a
     writer emitting the *wrong* edge, a solver computing the wrong answer, and an algorithm
     returning a well-formed falsehood all pass every arm. **Oracle fixtures with hand-checked
     answers are the only remedy**, and today only polygon offset has one.
   - **Refusal reachability at the UI.** No gate asserts that a refusal reaches the user verbatim
     rather than being caught and logged (C73 §5.4d, C70 L-INV-3).
   - **The provenance export boundary.** No mapping from the five-value vocabulary into IFC or DXF
     exists; C75 §5 names it the largest open risk in that contract — *provenance that stops at
     the export boundary protects nothing downstream*.
   - **Bespoke propagation.** The propagation that actually works in this repository is bespoke
     per-pair wiring, and **no gate asserts that the bespoke trackers still reach their pairs**
     (C72 §6.1.2d). The generic cascade is the gated one and it is the dead one.

---

## §6 — Sequencing

| Phase | Deliverable | Gate it unblocks |
|---|---|---|
| **0 — now** | this plan · [`BIM30-READINESS-GATES.md`](../../04-reference/BIM30-READINESS-GATES.md) · the gap register and do-not-rebuild siblings | — |
| **1** | Tier-1 + Tier-2 gates from the gates doc §5 (static, no world needed) — they land **red at named ledgers** and start shrinking | 12 of 19 |
| **2** | `seedBuilding30.ts` + its own floors entry + its own ratchet + the §4.4 deliberate-breakage proof | the executed-harness tier |
| **3** | `report.ts` extended to 11 links, `MISCONFIGURED` added as a row status, the PARTIALLY VERIFIED ceiling **declared in the header** | Golden Chain scoring |
| **4** | Tier-3 gates: `check-authoritative-state` first — it is what makes every other row's read-back trustworthy | 7 of 19 |
| **5** | `check-gates-are-real` — the meta-gate, which **reports a finding and never aborts the suite it audits** (the C9 rule) | the suite's self-audit |
| **blocked** | the collaboration axis | **founder decision on transport deployment** |

---

## §7 — The standing instruction

The audit's own closing line, which this plan is an implementation of:

> **Activate, retain, and certify — do not rebuild.**

`world.ts`, `seed.ts`, `capture.ts`, `contract.ts`, `floors.ts`, `certify.ts` and
`collabGraphIntegrity.ts` are working machinery built to the right discipline. BIM 3.0
certification is an **extension** of them — a second world, five more links, nineteen more gates
— and every line of this plan that could have been "rewrite the harness" is deliberately not.
