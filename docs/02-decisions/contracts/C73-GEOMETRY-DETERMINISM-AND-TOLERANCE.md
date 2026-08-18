# C73 — Geometry Determinism and Tolerance

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: geometry as a **deterministic consequence of model state** — the same authoritative model must produce the same geometry, on any machine, in any order, on any run — and the **epsilon policy**: what "small enough to be equal" means, who declares it, and who is allowed to invent one. Owns the geometric *predicates* (point-in-polygon, offset, intersection, coincidence) and the rule that each family has exactly one implementation.
> **Key principle**: *Every private epsilon is a private definition of "the same place".* Two hundred of them is not a tolerance policy, it is two hundred geometries. And where the model cannot answer, the system **refuses with both numbers** — it never substitutes.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers with **C11** (element creation pipeline — owns the forward build this contract makes reproducible), **C04** (rendering/scheduling — owns when geometry is drawn, never what it is), **C03** (schemas/commands/state — owns the authoritative model this contract derives from), **C05**/**C13** (persistence & lifecycle — own the snapshot round-trip that regeneration is measured against), **C15** (hosted elements — owns the opening-refit refusal cited in §4), **C64** (envelope compiler — owns the generated-envelope refusals), **C72** (propagation — owns *reaching* the dependent; this contract owns what it then computes). Supersedes nothing.
> **Gate**: precedent `tools/ga-gate/check-offset-implementations.ts` (**exists**, baseline 0, exit target met) and `tools/rac-conformance/certification/gates/check-derived-regenerable.ts` (**exists**). ~~Three gates are **specified here and NOT YET BUILT**: `check-epsilon-policy`, `check-predicate-canonical`, `check-deterministic-regeneration`.~~ ⛔ **CORRECTED 2026-08-18 — ALL THREE EXIST AND ALL THREE ARE RED (RC=3).** §5 was amended earlier, but **the correction never reached this front-matter line — the first thing a reader sees still carried the falsehood.** Re-run rather than trust: `for g in check-epsilon-policy check-predicate-canonical check-deterministic-regeneration; do npx tsx tools/ga-gate/$g.ts > /tmp/$g.txt 2>&1; echo "RC=$?" >> /tmp/$g.txt; done` — measured **`check-epsilon-policy` RATCHET EXCEEDED 322/318**, **`check-predicate-canonical` RATCHET EXCEEDED 139/138**, **`check-deterministic-regeneration` STALE LEDGER** (1 declared entry no longer measured: `D2::packages/geometry-curtain-wall/src/CurtainWallInstanceManager.ts::disposeCache` — *"debt that has been paid must LEAVE the ledger in the commit that pays it"*). ⛔ Per R7 none of the three is absorbable; **do not raise 318, 138, or the ledger.** ⭐ The authoring rule: this line was written in the **present tense** and rotted. **Write a build status dated, or cite the gate's exit code.**
> **Changelog**: 2026-08-12 — created as part of the BIM 3.0 suite, from the Phase 0 tolerance/predicate sweep. Every number in §0 was measured at HEAD on this date; the commands are given so they can be re-run rather than trusted.

---

## §0 — Why this contract exists

### §0.1 — There is no tolerance policy

Measured at HEAD, 2026-08-12, over `packages/`, `apps/`, `plugins/`, matching declarations
of the form `const|readonly|static <…EPS|EPSILON|TOL|TOLERANCE…> =`:

**267 declarations.** Of the numeric-literal ones, the histogram of *values*:

> ⚠ **AMENDED 2026-08-12, same day — this number is NOT re-derivable from the recipe above,
> and the gate that implements this section says so.** The prose omits two decisions that move
> the count: whether comments are stripped, and whether tests are included. `check-epsilon-policy`
> re-measured with an anchored recipe and read **279 sites / 271 production (file×NAME), 339
> including tests** — and it records that a naive substring match on `EPS`/`TOL` also drags in
> `MAX_STEPS`, `ARC_STEPS`, `deps`, `reps` and `ontology`.
>
> **The gate is now the authority for the number; this section is the authority for the
> ordering.** Run `npx tsx tools/ga-gate/check-epsilon-policy.ts` — it prints its own recipe and
> histogram every run, per C69 §0.1 (cite the generated artefact, never transcribe it).
>
> Nothing in §0.1's *argument* changes: hundreds of rival declarations, values spanning three
> orders of magnitude, and `geometry-kernel` exporting no policy at all. A count that cannot be
> reproduced is a count nobody should trust — including this one, which is why it now names the
> command that replaces it.

| value | count | | value | count |
|---|---|---|---|---|
| `1e-6` | 49 | | `1e-3` | 9 |
| `0.05` | 24 | | `1e-5` | 7 |
| `0.001` | 21 | | `0.5` | 6 |
| `1e-9` | 18 | | `0.1` | 6 |
| `1e-4` | 12 | | `0.01` | 6 |
| `0.02` | 10 | | long tail | … |

That is **at least eight distinct "a small number means equal" conventions spanning three
orders of magnitude**, in one product, deciding the same question. `0.001` and `0.05` are
both metres; they differ by 50×. `1e-9` and `1e-6` are both "numerically zero"; they
differ by 1000×. Which one a given coincidence test uses is an accident of who wrote it.

- ⛔ **SUPERSEDED BY MEASUREMENT — 2026-08-18. This bullet used to read
  *"`packages/geometry-kernel` exports no epsilon at all. The layer that owns geometry has no
  opinion on tolerance, so every consumer forms its own."* IT IS FALSE, and has been since
  five days after this contract was stamped.**
  `packages/geometry-kernel/src/tolerance.ts` shipped **2026-08-13** (commits `3dba3557`,
  `07173cdf`, `f580a721`) and declares all three roles §2.1 requires, unit-qualified per §2.3
  — plus a fourth. Measured at HEAD:

  | §2.1 role | export | line | value |
  |---|---|---|---|
  | numeric-zero (dimensionless) | `EPSILON_ZERO` | `:76` | `1e-9` |
  | model-space coincidence (metres) | `COINCIDENT_M` | `:92` | `0.001` |
  | recompute identity (metres) | `RECOMPUTE_IDENTITY_M` | `:120` | `1e-9` |
  | parallelism (radians) | `PARALLEL_RAD` | `:139` | `1e-9` |

  **The layer that owns geometry now HAS an opinion on tolerance, and it is exported.**
  §0.1's *argument* stands untouched — 267 rival declarations across three orders of
  magnitude — and every MUST in §2 stands. What is dead is only the claim of ABSENCE, and
  §2.2's *"consumes the declared tolerance"* now has a real referent to name.

  ⚠ **This is the C69 §0.1 defect wearing a contract instead of a gate: stamped prose
  outliving the code it described. IT HAS ALREADY PROPAGATED** — C84 §4D was drafted on
  2026-08-18 asserting the Stack A/B parity harness *"had none to consume"*, sourced from
  here, and was corrected before landing. **Check the module, never a contract, for whether
  a module exists.** *Logged as L-954.*
- The **only** central, named tolerances in the estate are **domain-local**, not general:
  `defaultJunctionBandM()` (`packages/geometry-wall/src/JunctionResolverV2.ts:220`,
  0.20 m — a wall-junction band) and `CENTROID_MATCH_RADIUS`
  (`packages/room-topology/src/RoomDetectionEngine.ts:121`, 2.0 m — a room-identity
  radius). Both are correct as *domain* constants. Neither is a numeric epsilon, and
  neither is what the 267 declarations are reaching for.

### §0.2 — The same predicate, sixty-one times

**Point-in-polygon has ~71 named definitions across 116 files** touching
`pointIn*`/`pointInside*` naming, with **61 distinct ray-cast bodies across 56 files**
by structural signature. A prior audit reported **42**. *That number was a floor, not a
ceiling* — and this is the second time in this repository that a hand-counted duplicate
tally came in under the machine count in the direction of leniency (see
`check-offset-implementations.ts`, whose prose "3" measured **4**).

One file makes the cost concrete. `apps/editor/src/ui/geospatial/CesiumViewport.ts`
contains **three** copies of the even-odd ray cast, with **three different
degenerate-divide guards**:

- `:9621` — `/ ((yj - yi) || 1e-12)`
- `:10317` — `/ (nj - ni || 1e-9)`
- the third (`pointInRing`, referenced by the comment at `:10313`) — **no guard at all**

A horizontal edge is therefore "inside" under one copy, "outside" under another, and a
division by zero under the third — in one file, on one polygon, in one session.

There are **2 rival "shared" point-in-polygon implementations with 3 consumers between
them.** Both were written to end the duplication. Neither did.

Adjacent duplicate families, measured the same day:
`WallIntersectionResolver` ×3 (`packages/ai-host/src/`, `packages/core-app-model/src/ai/`,
`packages/room-topology/src/` — two of the three byte-identical);
`FloorPlanDiagnostics` ×2 (`packages/ai-host/src/`, `packages/core-app-model/src/ai/`);
`RoomStore.ts` ×2 (`packages/room-topology/src/`, `packages/stores/src/`).

### §0.3 — But canonicalisation demonstrably works here

This is not a counsel of despair, because **the recipe is proven in this repo**. Polygon
offset had the identical disease — three prose-claimed, four measured copies, and *the
untouched one was the one the shipping committer called*, so a user asking for a 300 mm
eave on a square got 212 mm and **every copy passed its own package's tests**. The fix:

1. **One canonical file**, named in the gate (`packages/geometry-kernel/src/pure/polygonOffset.ts`).
2. **A counting gate** — `check-offset-implementations.ts` — that matches on *structure*
   (per-edge shifted supporting lines intersected pairwise; centroid-radial displacement),
   not on the word "offset", so it counts implementations rather than call sites.
3. **Named, on-the-record exclusions** for constructions that merely resemble it
   (`site-parcel-data/src/geometry/insetPolygon.ts`, a capsule-union erosion).
4. **Baseline pinned at the measured reading, shrink-only**, with an honesty floor that
   exits **2** if the scan reads too few files.

Result: **1 implementation across the whole tree** (baseline `MAX_IMPLEMENTATIONS = 0`
non-canonical, exit target met), oracle-true at 300 mm with spread 0.000.

> **The gate's own recorded lesson, which §3 turns into a rule:** *"COUNTING IS THE POINT.
> A correctness gate on the surviving implementation cannot catch this class of defect;
> only a gate on the NUMBER OF THEM can."*

---

## §1 — Determinism

> **§1.1 — MUST.** Geometry is a **pure function of authoritative model state**. Given the
> same model, a regeneration produces the same geometry — independent of machine, of the
> order elements were created in, of iteration order over any hash-keyed container, and of
> how many times it has already been regenerated.

> **§1.2 — MUST NOT.** Geometry may not depend on: wall-clock time, `Math.random` without
> a model-derived seed, unstable sort (ties must be broken on a stable model key, not on
> insertion order), floating-point accumulation order that varies with container
> iteration, or any renderer/viewport state. A value the renderer knows and the model does
> not is not an input to geometry.

> **§1.3 — MUST.** A derived field is classified by the **three-state** measurement
> `check-derived-regenerable` already uses, because two states cannot distinguish the
> cases: serialize (A1) → restore (A2) → serialize-and-restore again (A3).
> *differs A1→A2, identical A2→A3* = **REGENERABLE** (the restore reaches a fixed point).
> *differs A1→A2 **and** A2→A3* = **PERSIST-OR-LOSE** (every cycle mints a new value and
> destroys the authored one). The second list is **named and shrink-only**; an entry that
> stops being measured is **STALE and exits 3** — a paid debt left on the books is where
> the next regression hides.

> **§1.4 — MUST NOT.** `REGENERABLE` may not be read as "blessed". It means only "a
> rebuild reproduces it". A field deterministically recomputed to a value the author never
> wrote is still a round-trip divergence, and its documented-tolerance list stays **empty**.

---

## §2 — The epsilon policy

> **§2.1 — MUST.** There is **one declared tolerance module**, owned by the geometry layer
> and exported from `packages/geometry-kernel`. It declares a small, named, documented set
> — each entry stating **what it is a tolerance of** and **in what unit** — not a single
> magic number. At minimum the estate needs, and must name explicitly:
> a **numeric-zero** epsilon (degenerate divides, near-zero lengths — dimensionless),
> a **model-space coincidence** tolerance (metres: "these two points are the same point"),
> and a **model-space parallelism/collinearity** tolerance (radians or a normalised dot).
> Domain bands (`defaultJunctionBandM`, `CENTROID_MATCH_RADIUS`) are **not** epsilons and
> stay where they are, under their own domain owner.

> **§2.2 — MUST.** A new or modified geometric predicate **consumes the declared
> tolerance**. Inventing a literal at the call site is the defect §0.1 measures, and it is
> the mechanism by which two orders of magnitude entered the same question.

> **§2.3 — MUST.** A tolerance is **unit-qualified in its name**. `EPS = 0.05` is
> unreadable: 5 cm, or 5% of something? `COINCIDENT_M = 0.05` cannot be misread. The
> existing `defaultJunctionBandM` is the naming precedent.

> **§2.4 — MUST NOT.** A degenerate-divide guard may be chosen per call site. `|| 1e-12`,
> `|| 1e-9` and *no guard* in one file (§0.2) are three different geometries of the same
> polygon. The guard comes from §2.1's numeric-zero epsilon or the predicate refuses.

> **§2.5 — MUST NOT.** A tolerance may not be *widened* to make a test, a gate, or a
> user-visible artefact pass. Widening a tolerance changes what "the same place" means for
> every consumer of that tolerance, and the change is invisible at the site that made it.

---

## §3 — Predicate canonicalisation — the R3 recipe, one family per PR

> **§3.1 — MUST.** Each **predicate family** has exactly **one** implementation, in one
> named canonical file, enforced by a **counting** gate built to the four-step recipe of
> §0.3. Families in scope, in the order their measured duplication argues for:
> **point-in-polygon** (61 bodies), **segment/segment intersection**, **polygon area &
> winding**, **point-to-segment distance**, **polygon containment/overlap**. Polygon
> **offset** is done and is the reference implementation of the recipe.

> **§3.2 — MUST.** The gate matches on **structure**, not on names. A name-based count
> counts call sites and re-exports and is trivially defeated by renaming.

> **§3.3 — MUST.** Exclusions are **named in the gate file, individually, with the reason**
> — as `check-offset-implementations.ts` excludes `insetPolygon.ts` — so an exclusion is a
> decision on the record rather than a pattern that quietly fails to match.

> **§3.4 — MUST.** The baseline is pinned **at the measured reading**, never above it, and
> is shrink-only. A ratchet above its own reading is not a ratchet; it is free slots, and
> that error has already been made once here and caught by re-measurement.

> **§3.5 — MUST NOT — no blind mass refactor.** **One family per PR.** The offset fix
> succeeded because it was one family, oracle-tested at a known-answer case (300 mm eave,
> spread 0.000), with the shipping path identified *first*. A sweep replacing sixty-one
> ray casts in one change has no oracle, no bisect, and would land on top of the §0.2
> guard divergence rather than resolving it.

> **§3.6 — MUST.** Before a family is collapsed, the **shipping consumer is identified by
> name**. The offset defect was not "three copies"; it was that *the fix and the shipping
> code were different files*, and each copy passed its own package's tests. Collapsing onto
> a copy the shipping path cannot reach fixes nothing and reads as done.

> **§3.7 — MUST.** Where copies **disagree** (§0.2's three guards), the collapse states
> which behaviour is canonical and why. A silent pick is a behaviour change shipped as a
> refactor.

---

## §4 — Refusal, not substitution

The binding rule of this contract, and the one place the repo already has good precedent.

> **§4.1 — MUST.** When a geometric operation cannot produce a correct result, it
> **refuses**, naming the operation and **both measurements** — what was asked and what is
> possible. It does not silently produce an approximation, a clamped value, an empty
> result, or a fallback.

> **§4.2 — the working precedents, to be copied rather than reinvented:**
> - **`planOpeningRefit`** — on a wall shrink, an opening is **relocated or the edit is
>   refused**, and the refusal names *both* numbers (the opening's required span and the
>   wall's remaining span). Never a silently clipped opening.
>   (`packages/command-registry/src/walls/UpdateWallBaselineCommand.ts` and kin.)
> - **`BaselineReversalError`** (`packages/geometry-wall/src/errors.ts`) — a named,
>   typed refusal for a specific impossible transform, rather than a wall that quietly
>   flips.
> - **The inset gate's three named collapse modes** — `packages/geometry-kernel/src/
>   producers/roof.ts:197/236/267` and `_internal/roof/roofFormResolution.ts:126/130`
>   refuse a mansard whose ridge, skirt or top ring collapses, each with its own message
>   carrying the inward distance in metres. Three *named* modes, not one "invalid roof".
> - **`polygonOffset`'s `{ polygon: [], degenerate: true, reason: 'offset collapsed the
>   ring' }`** — an empty result that **arrives labelled**, so a consumer cannot read it
>   as "no overhang".

> **§4.3 — MUST NOT.** An empty array, `null`, `0`, or an identity transform may not be
> returned to mean "could not compute". **Failure and emptiness are never the same value**
> (§CONTEXT-DATA-HONESTY). This is the defect that let a hard-rejected envelope fall
> through to a silent strip-slicer fallback.

> **§4.4 — MUST.** A refusal is **user-legible**. "Invalid geometry" is not a refusal; it
> is a shrug. The roof collapse messages are the standard: what was attempted, at what
> measurement, and what the constraint was.

---

## §5 — The gates

> ## ⛔ SUPERSEDED IN PART — 2026-08-18, by measurement. READ BEFORE §5.1, §5.2 OR §5.3.
>
> **ALL THREE gates below are headed "SPECIFIED, NOT BUILT". ALL THREE EXIST.** Measured at
> HEAD by `find tools -name '<gate>.ts'`:
>
> | Section | Gate | Path | Size | Dated |
> |---|---|---|---|---|
> | §5.1 | `check-epsilon-policy` | `tools/ga-gate/check-epsilon-policy.ts` | 36,188 B | 2026-08-16 |
> | §5.2 | `check-predicate-canonical` | `tools/ga-gate/check-predicate-canonical.ts` | 119,698 B | 2026-08-16 |
> | §5.3 | `check-deterministic-regeneration` | `tools/ga-gate/check-deterministic-regeneration.ts` | 59,674 B | 2026-08-16 |
>
> They are not merely present, they are **RUNNING AND REPORTING**: `check-predicate-canonical`
> was read at **138/138, declared level** during the 2026-08-18 session, and
> `check-deterministic-regeneration` at **exit 3 (137/134)** — a ratchet breach, which per
> `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)` is never absorbable. A contract cannot describe as
> unbuilt a gate that is currently **failing merge**.
>
> **§5.1 E1 in particular is self-refuting as written:** it asserts *"the declared tolerance
> module exists and is exported from `packages/geometry-kernel`"* — and §0.1 simultaneously
> claimed no such module existed. **E1's subject shipped 2026-08-13 and E1 passes it** (see
> the §0.1 banner).
>
> **WHAT STANDS:** every check definition — E0–E5, the per-family arms of §5.2, D1–D2 of §5.3
> — is unchanged and correct. Only the **BUILD STATUS HEADINGS** are false. Do not re-specify
> what is already written; **run the gate and read its exit code**, which is the authority for
> every number here. §0.1's own amendment already ruled the gate authoritative over the count;
> this banner extends that to the gates' existence.
>
> ⚠ **Why this matters beyond bookkeeping:** a roadmap or status document reading these
> headings would report three unbuilt gates and schedule work to build them — duplicating
> 215 KB of shipped, running enforcement. That is the **EI-10 / "what a second implementation
> must earn"** defect, minted by stale prose rather than by a coder. *Logged as L-954.*

### §5.1 — `check-epsilon-policy` — ~~SPECIFIED, NOT BUILT~~ **BUILT — see the §5 banner**

| Check | Kind | What it asserts |
|---|---|---|
| **E0** | exit **2** | ≥ a floor of source files scanned and ≥1 tolerance declaration found. A scan that finds none is misconfigured, not clean. |
| **E1** | hard | the declared tolerance module exists and is exported from `packages/geometry-kernel` (§2.1) |
| **E2** | ratchet, **named** | count of tolerance literals declared **outside** the module, pinned at the measured reading (267 today), shrink-only, listed by file (§3.4) |
| **E3** | hard | a new or modified geometric predicate imports the declared tolerance (§2.2) |
| **E4** | hard | a declared tolerance's **value may only shrink or stay**; a widening is a contract violation and must be an explicit, argued change to the module (§2.5) |
| **E5** | ratchet, **named** | unit-unqualified tolerance names (§2.3) |

### §5.2 — `check-predicate-canonical` — ~~SPECIFIED, NOT BUILT~~ **BUILT — see the §5 banner**

One arm per family in §3.1, each an R3-style **structural counting** gate.

| Check | Kind | What it asserts |
|---|---|---|
| **C0** | exit **2** | `minFiles` floor, per `lib/sourceScan.ts` — the gate can never pass by looking nowhere |
| **C1** | ratchet, **named**, per family | non-canonical implementation count, pinned at the measured reading (point-in-polygon: **61**), shrink-only |
| **C2** | hard | each family names its canonical file and its exclusions individually with reasons (§3.3) |
| **C3** | hard | within a single file, no family may appear twice with **differing** degenerate-divide guards (§2.4) — the `CesiumViewport` finding, generalised |

### §5.3 — `check-deterministic-regeneration` — ~~SPECIFIED, NOT BUILT~~ **BUILT, AND CURRENTLY RED — see the §5 banner**

Extends the existing `check-derived-regenerable` (§1.3) from *round-trip* to *regeneration*.

| Check | Kind | What it asserts |
|---|---|---|
| **D0** | exit **2** | ≥1 element kind regenerated; an empty subject is misconfiguration |
| **D1** | hard | regenerating the same authoritative model twice, in the same process, yields byte-identical geometry |
| **D2** | hard | regenerating after **shuffling** model iteration order yields byte-identical geometry (§1.2) |
| **D3** | ratchet, **named** | the PERSIST-OR-LOSE ledger (§1.3), shrink-only, stale entry exits **3** |

> **§5.4 — what these gates CANNOT see**, stated so nobody reads them as coverage:
> **(a)** whether the surviving canonical implementation is *correct* — counting gates are
> deliberately blind to correctness (§0.3), and each family therefore also needs an oracle
> fixture at a known answer, as offset has at 300 mm;
> **(b)** cross-machine determinism — D1/D2 run in one process on one architecture, so
> platform-dependent floating-point differences are **UNPROVEN**;
> **(c)** GPU-side geometry — anything computed in a shader is outside every gate here,
> and **UNPROVEN**;
> **(d)** whether a refusal (§4) is actually surfaced to the user rather than caught and
> logged — **UNPROVEN: no gate asserts refusal reachability at the UI**;
> **(e)** tolerance *appropriateness* — E4 can see a widening, not whether 0.05 m was ever
> the right coincidence radius for walls.

---

## §6 — Exit conditions

- **§5.1 exits** when E2 reaches **0** tolerance literals outside the declared module and
  E5's unqualified list is empty.
- **§5.2 exits** when every family in §3.1 reads **0** non-canonical implementations, each
  with an oracle fixture at a known answer — the state polygon offset is in today.
- **§5.3 exits** when D1 and D2 are hard-0 across every element kind and the
  PERSIST-OR-LOSE ledger is empty; the ledger file is then deleted with the finding path.
- **§4 exits** never — refusal is a permanent invariant, not a debt.

---

## §7 — Anti-patterns

- **§7.a — A local epsilon.** §2.2. Two hundred and sixty-seven of them is how the
  product acquired eight definitions of "the same place".
- **§7.b — An unnamed unit.** §2.3. `EPS = 0.05` is unreadable and will be copied.
- **§7.c — A per-call-site degenerate-divide guard.** §2.4. Three in one file today.
- **§7.d — Widening a tolerance to go green.** §2.5.
- **§7.e — A name-based duplicate count.** §3.2. Counts call sites; defeated by a rename.
- **§7.f — A correctness gate instead of a counting gate.** §0.3. Cannot see the class of
  defect at all — every copy passes its own package's tests.
- **§7.g — A mass predicate refactor.** §3.5. No oracle, no bisect, and it lands on top of
  a live behavioural disagreement.
- **§7.h — Fixing the copy the shipping path cannot reach.** §3.6. Reads as done, is not.
- **§7.i — Returning `[]` for "could not compute".** §4.3. Failure and emptiness are never
  the same value.
- **§7.j — "Invalid geometry" as a refusal.** §4.4. Name the operation and both numbers.
- **§7.k — Trusting a hand-counted duplicate tally.** §0.2. Twice now it has come in low,
  both times in the direction of leniency. Re-run the command.
