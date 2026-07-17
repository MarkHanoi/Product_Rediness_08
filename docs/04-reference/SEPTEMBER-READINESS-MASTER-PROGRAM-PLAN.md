# September Readiness — Master Program Plan (cross-pipeline)

> **Stamp**: 2026-07-17 · **Target**: early-to-mid September 2026 (~7–8 calendar weeks) · **Status**: PROGRAM PLAN
> (no code changed, no contract flipped, no master tracker/plan edited).
> **Author**: cross-pipeline program review (workload / critical-path / leverage pass).
> **Founder intent**: *"everything in place by September, we will work day and night, make it work, architecturally
> sound, no shortcuts, review how to leverage the work and where everything should be done between the pipelines."*
> **Founder directive (2026-07-17, this revision)**: *fit FULL Archistar parity — Denmark + Switzerland + Spain — into
> the September pipeline; do NOT cut DK/CH/ES.* This plan is re-shaped from a one-engineer / cut-scope reading to a
> **full-scope-fitted-via-parallel-execution** reading: work is done by many worktree-isolated agents concurrently, so
> wall-clock is bounded by the **critical path (the irreducibly-serial engine core)**, not the *sum* of dev-weeks. The
> fit verdict, critical path, parallelization map, and week-by-week schedule below are rewritten accordingly; the
> inventory, leverage map, risk register, and work-item deltas are preserved and reconciled to the new shape.
> **Governance posture**: launch-readiness/program deliverable, NOT a `*-AUDIT.md` contract-derivative. References the
> canonical C-contracts and the L-NNN issue log; authors none; flags conflicts; resolves none. Proposes work-item
> deltas (§8) — LISTED here for the orchestrator to transcribe into `V1-LAUNCH-READINESS-AUDIT.md` /
> `V1-LAUNCH-IMPLEMENTATION-PLAN.md`; NOT written into those master docs here.
> **Grounded in** (read as current-state; a couple of agents are editing the master docs for CF-1 + contract
> cross-refs — statuses below are *as of read 2026-07-17*): `V1-LAUNCH-READINESS-AUDIT.md`,
> `V1-LAUNCH-IMPLEMENTATION-PLAN.md`, `ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md`,
> `L-391-CRDT-COLLAB-PLAN.md`, `DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`, `PARCEL-ZONING-FEATURE-SCOPING.md`,
> `CLAUDE.md` (8-layer model, P1–P8, contracts-first governance). **No capability or traction is invented.**

---

## §1 — Executive summary & honest fit verdict

**Verdict: FITS — full DK/CH/ES scope — under parallel execution, PROVIDED (a) the L-391/L-397 ratification gates are
decided in week 1, (b) the September fidelity cut is accepted as DK full-fidelity + ES-and-CH shipped "estimated —
flagged" (C58's mandatory confidence label), and (c) every merge is test- and tsc-gated.** The earlier
"FITS-WITH-NAMED-CUTS" reading assumed **one engineer working serially** — under which Denmark alone is ~8–11 focused
dev-weeks (Archistar §5.4) and the *sum* of both pipelines overruns the calendar before a blocker is touched. **That
assumption does not hold for this execution model.** Work is done by **many worktree-isolated agents concurrently**, so
wall-clock is bounded by the **critical path — the irreducibly-serial engine core — not the *sum* of dev-weeks.** Once
the jurisdiction-agnostic engine is built and its interface frozen (~week 2), the jurisdictions, report, interop,
blockers, and view/demo tracks all fan out in parallel. The dev-day sum is unchanged (§2); the calendar it occupies is
not. This lets the FULL Archistar footprint — Denmark **and** Switzerland **and** Spain — fit September, with fidelity
following structure where the source data is not yet machine-readable.

**This does NOT dissolve every constraint.** Three residuals survive parallelization and are stated plainly in §1.3:
human ratification latency, CH/ES rule-pack fidelity, and verification load. The honest September shape is
**parity-in-structure with fidelity following**: DK provably full-fidelity; ES/CH shipped as *structurally identical
adapters* whose numeric packs carry the "estimated" confidence label until human-validated post-launch. We do **not**
claim full CH/ES regulatory fidelity by September.

### §1.1 — Serial core (the critical path — ~4 weeks, built once)

The jurisdiction-agnostic engine, built once and reused by every jurisdiction:

- **C57/C58 finalize** (L-403) — Parcel Data Layer + Zoning Rules Engine contracts.
- **Envelope solver** (L-398a→d) — parcel ⊖ setbacks (Turf negative buffer) → height cap → FAR → two-fidelity /
  provenance resolution → wire to `site.updateZoning` (P6 bus).
- **Envelope → authoring bridge** (L-401a/b/c) — thread inset + maxHeight into the generators / typology-pipeline;
  permitted-use → brief seed; `SpatialValidator` envelope-containment.

**Freeze the engine interface by ~week 2** (`BuildableEnvelope` / `JurisdictionZoningContract` / `ZoningProvider`
schemas). The freeze is the hinge: it lets Track J fan out across jurisdictions off a stable contract. This ~4-week
serial spine — plus its two hard upstream prerequisites (L-188 site-data persistence; a healthy render surface,
L-361–366) — is the only chain the calendar cannot compress by adding agents.

### §1.2 — Parallel fan-out tracks (concurrent off the frozen engine)

- **Track J — jurisdictions:** DK (Plandata structured zoning + Datafordeler/Matriklen parcels — L-399a/b, L-400b) ‖
  ES (Catalonia MUC — L-399c) ‖ CH (cantonal — structural adapter + curated packs). Each is an adapter off the shared
  engine; net-new packages, collision-free by construction.
- **Track R — report:** explain-why compliance report + 3D envelope render (L-402a/b/c), reusing
  `buildPlanGraphOverlaySvg` + `pryzmRenderFormaMassing`.
- **Track I — interop:** IFC/DXF/Rhino round-trip harness + adversarial malformed-file cases (L-393a/b).
- **Track B — launch blockers:** L-360 checksum, L-391 collab P1→P3, L-53 LWW, L-387 deps, L-395/L-405 security,
  L-396 versions/durability, **L-188 (GIS/site data lost on reopen — a HARD PREREQUISITE for the compliance pillar)**.
  Different subsystems → fully parallel to compliance.
- **Track V — view + demo:** unified view-switcher (L-405) + Denmark LOD2 demo-fidelity (L-404 — **no longer cut**,
  folded here).

### §1.3 — Honest residuals parallelization does NOT solve (keep prominent)

1. **Human RATIFICATION LATENCY.** L-391 (R-A..R-E collab infra) + L-397 (pricing) gate the launch and cannot be coded
   around or bought down with more agents — they are calendar, not dev-days. **Front-load to weeks 1–2.**
2. **CH/ES rule-pack FIDELITY.** Agents can *draft* rule packs, but validating 26 Swiss cantons + fragmented Spanish
   PGOU against real regulation is human-judgment-heavy. September honest shape = **DK full-fidelity; ES + CH shipped
   "estimated — flagged"** (C58's mandatory confidence label), hardened post-launch. This is **parity-in-structure with
   fidelity following** — state it plainly; do **not** claim full CH/ES fidelity by September.
3. **VERIFICATION LOAD.** The parallel code volume only stays sound if **EVERY merge is test- and tsc-gated** — root
   `tsc --skipLibCheck` clean + the relevant suite green before each merge, no exceptions. This is an explicit **program
   rule**, not a nicety; it is the price of trading dev-day-sum for critical-path.

### §1.4 — Two corrections the plan itself surfaced (applied in this doc's narrative)

- **L-334 checksum is SHIPPED**; the live P0 is **L-360**, a regression whose checksum hard-refuses valid projects
  (bricks them). *Awaiting code verification — do not assert L-360's exact mechanism as fact until verified in code.*
- **L-188 is a compliance PREREQUISITE**, not a generic blocker: parcel → envelope → persist is meaningless if site/GIS
  data does not survive close+reopen. Tagged as a hard prerequisite in Track B.

**The single most important guardrail (unchanged):** the compliance pillar ships **dark, behind a flag, additively** and
**must never gate GA nor starve the P0 blockers** (Archistar §5.2/§5.5) — exactly the L-380 §12 / L-391 Phase-0
discipline. Under parallel execution the tracks sit on disjoint subsystems, so contention is the exception; but if any
week does force a choice, **the P0 blockers win, every time.**

**Bottom line for the founder:** in September you can truthfully say *"PRYZM authors compliant-ready buildings on real
European parcels across Denmark, Switzerland and Spain — full-fidelity on Denmark from live national zoning, and
structurally-identical estimated envelopes (clearly labelled) on Switzerland and Spain, hardening to full fidelity
post-launch."* The structure is full-scope DK/CH/ES parity; the fidelity is honest and labelled. The plan below puts the
serial engine core on the critical path, fans the jurisdictions/report/interop/blockers/view tracks out off its frozen
interface, and keeps every residual risk visible.

---

## §2 — Full work inventory (both pipelines, every OPEN item)

Effort is rough **dev-days** (single-engineer focus-time), independent of calendar. `Dep` = what must precede it.
Pipeline tags: **A-blocker** (launch-critical data-integrity/collab/security/quality) · **A-compliance** (CF-1 pillar) ·
**B** (parcel/geo, mostly shipped).

### §2.1 — Pipeline A — launch blockers (gate GA regardless of country)

| Item | Title | Sev | Status (as of read) | Subsystem / files | Contract/ADR | Effort (d) | Dep |
|---|---|---|---|---|---|---|---|
| **L-334** | Save data-integrity — silent element-loss reported as success (quarantine + client checksum) | **P0** | **SHIPPED** (Fix 1, 2026-07-16) — but spawned the L-360 regression; **server-side checksum column deferred** | `ProjectLoader.ts`, `ProjectSerializer.ts`, `SnapshotIntegrity`/`QuarantineStore` | C05, C47 §1.6, C48-adjacent | 0 (done) + 1–2 (server col) | — |
| **L-360** | L-334 checksum **hard-refuses valid projects (bricks them)** — codec not bit-exact (checksum pre-compression vs post-decompression) | **P0** | **OPEN — REGRESSION, FIX IN PROGRESS.** The live P0 (L-334 itself is SHIPPED). *Mechanism above is awaiting code verification — do not assert as fact until verified.* Fix: round-trip-stable checksum + never-hard-brick (load best-effort + warn) | `SnapshotIntegrity.ts`, `ProjectSerializer.ts:978`, Msgpack/draco codecs | C05, C47 | 3–5 | L-334 |
| **L-361–366** | **WebGPU device-loss cascade on batch AI generation** — repeated GPU crash until browser disables accel → **no project creatable**; +TSL-module/`_renderTransparents` shader errors; auto-WebGL fallback not firing for real buildings | **P0** | OPEN — several "IMPLEMENTED, awaiting live WebGPU confirmation" (NOT yet Fixed) | renderer-three, RenderPipelineManager, auto-fallback | C04 §1.4, C10, ADR-0089/0094/0267/0077 | 6–12 (confirm+harden) | — |
| **L-53** | Concurrent wall-baseline move = silent LWW (collab data loss) | **P0** (re-flagged 07-17) | GAP — needs shared CRDT id normalization; `CRDTConflictResolver` never called on baseline write | `YjsDocAdapter.applyCommand` | C08 §3.1/§3.3, P8 | 4–6 | L-391 P2 |
| **L-335 / L-340** | Real-time collab not conflict-safe; Yjs CRDT dead-wired; C08 asserts a server-side merge the code doesn't provide | **P0/P1** | OPEN — FIX 2 decision-gated; **make C08 ACTIVE** (G0-CONTRACTS) | `YjsDocAdapter.ts:558`, C08 | C08, P8 | (rolled into L-391) | L-391 |
| **L-85** | hostedSpaceId / mark carry-through follow-ups | P1 | **Core FIXED** (kitchen/wardrobe/lighting restore, tests) — founder-named carry-through follow-ups remain | hosted-element persistence, `projectLoaderUtils.ts` | C15, C13, C05, P8 | 1–2 | — |
| **L-188** | Project with GIS/site data **LOSES it on close+reopen** (data loss) | **CRITICAL** | OPEN — **HARD PREREQUISITE for the compliance pillar** (parcel/envelope persistence is meaningless if site data doesn't survive reopen) | site-model persistence, C19, C13 | C19, C13, P8 | 3–5 | — |
| **L-345** | C22 Privacy/PII DRAFT + **fully unimplemented — GDPR launch-blocker for EU** (anonymise/storageRouter/consentStore/DSAR missing) | **P1 (EU BLOCKER)** | OPEN — directly gates a **Denmark/EU** compliance launch | `packages/*` privacy, `server.js` | C22, C08 §8 | 5–8 | — |
| **L-387** | 93 dependency advisories (7 critical / 28 high), runtime-reachable (jsPDF, Multer/ws/form-data) | P1 | OPEN — UNASSIGNED | root deps, lockfile | C07, C29 | 3–5 | — |
| **L-388** | Root vitest gate RED (3 door/dimension specs fail at module load, SCC barrel-at-load) — ties L-204 (165-file editor suite never runs in CI) | P1 | OPEN (founder: "in progress"); audit: UNASSIGNED | `DoorStore.ts:227`, `dimensionSelectionPanel.spec.ts`, ci.yml | C13, C03 | 3–6 | — |
| **L-391** | Real-time CRDT collab deploy (no network backend today = silent LWW) | **P0** | Phase 0 **shipped** (flag-OFF); Phases 1–3 open; **founder decision to deploy vs descope** | `sync-client`, `apps/sync-server`, `engineLauncher.ts:817`, Fly infra | C08, ADR-0033, ADR-049, P1/P4/P8 | 16–25 + infra | Phase serial; R-A..R-E |
| **L-392** | P8 OTel spans are no-ops; no tracer provider; crash reporter is Noop (corruption invisible until user reports) | P1 | OPEN | `server.js:2172`, cross-cutting spans | C10 §OTel, P8 | 3–5 | — |
| **L-393** | IFC/DXF/Rhino round-trip fidelity UNVERIFIED | P1 | OPEN — only BCF + family/chunk have round-trip coverage | `packages/file-format/src/import/{ifc,dxf,rhino}` | C05, C47 (C25/26/32/33 DRAFT) | 5–8 | — |
| **L-394** | Snapshot schema migration (v0→v5) UNTESTED; forward-version loads with silent field loss | P1 | OPEN | `MigrationEngine.ts:233`, `server/dbMigrate.js` | C05, C47 | 2–4 | — |
| **L-395** | `/embed` token has no server-side validation (blast radius unconfirmed) | P1 | OPEN — UNVERIFIED | `server.js:4557` | C07 §6.1, C08 | 2–3 | — |
| **L-396** | Backup RESTORE never drilled; `VERSION_LIMITS.free=0` → free projects live only in browser IndexedDB | P1 | OPEN | `server.js:3258`, DR runbook, PITR | C48, DR-DRILL-RUNBOOK | 3–5 | L-397 |
| **L-397** | Pricing contradiction — marketing (Solo $25/Studio £15…) vs billing code (architect $59/studio $149/firm $349) vs `VERSION_LIMITS` free 0/1 | P1 | OPEN — **FOUNDER DECISION** (ratify into C39) | `PlanConfig.ts:178+`, `server.js`, C39 | C39-PRICING | 1 (decision) + 1–2 | founder |

**Blocker subtotal (dev-days):** ~55–90 dev-days + L-391 infra/ratification latency (see §3). This is the launch spine —
**larger than a first read suggests**: the WebGPU device-loss cluster (L-361–366) gates whether a user can even *create*
a project, and L-345 (GDPR) + L-188 (GIS persistence) are launch-gating for an EU compliance pillar specifically.

**Gate note — G0-CONTRACTS (L-347):** launch is gated until the Tier-1 contracts are ACTIVE — **C08** (blocked by
L-391/L-53/L-335), **C10** (L-341), **C13** (L-342), **C48-min** (L-344), **C22-min** (L-345 GDPR). This gate is the
formal expression of "collab correctness + GDPR + durability must be real before GA," and it directly couples the
compliance pillar's EU exposure (C22) to the launch.

### §2.2 — Pipeline A — compliance-authoring pillar (CF-1, September — DK full-fidelity, ES + CH shipped "estimated — flagged")

| Item | Title | Sev | Status | Subsystem / new package | Contract/ADR | Effort (d) | Dep |
|---|---|---|---|---|---|---|---|
| **L-403** | Governance — author C57 (Parcel Data Layer) + C58 (Zoning Rules Engine) + SPEC-PARCEL-SELECTION + SPEC-COMPLIANCE-REPORT + strategy ADR + VISION wedge | P1 (pillar) | **IN PROGRESS** — contracts-first | `docs/` C00 index, contracts, SPECs, ADRs | C57/C58 (NEW), C00, C19 §9/§10.2, STR-02/STR-12 | 5–8 | — |
| **L-398** | Zoning Rules Engine + BuildableEnvelope solver (parcel ⊖ setbacks → inset + area×maxHeight, two-fidelity) | **P1** | OPEN — 0% built; the hardest piece | new `@pryzm/*` L2 engine; Turf dep | **C58 (NEW)**, C19 §1.4/§1.6 | 8–12 | L-403 (C58 skeleton), Turf dep |
| **L-399** | ZoningProvider adapters + curated rule packs — **fan-out Track J**: DK Plandata structured + `da-*` pack (full-fidelity); ES-Catalonia MUC + `es-barcelona` pack **("estimated — flagged")**; CH cantonal structural adapter + curated pack **("estimated — flagged")** | **P1** | OPEN — DK full; ES/CH structural adapters w/ estimated confidence label (C58) | zoning providers, `JurisdictionZoningContract` packs | C58 (NEW), L-373 | 4–7 (DK) + 3–5 ea (ES/CH adapters, parallel) | L-398a schemas (frozen iface) |
| **L-400** | Parcel Data Layer completion — lift shipped Catastro provider to `@pryzm/site-parcel-data` (L2); DkParcelProvider (Matriklen, server-side Datafordeler key); ES already shipped (Catastro); CH parcel adapter (structural) | P2 | OPEN | `apps/editor/src/ui/site/parcel/` → L2; `server/parcelZoningProxy.js` clone | **C57 (NEW)**, C12, C19 | 3–5 (DK) + CH adapter (parallel) | L-403 (C57 skeleton) |
| **L-401** | Envelope → authoring constraint bridge (inset + maxHeight + permitted-use → generators / typology-pipeline) | **P1** | OPEN | `generateResidentialFromBoundary`, `@pryzm/typology-pipeline`, house/apartment/resi generators | C19 §1.6, C50, C53 | 5–8 | L-398 |
| **L-402** | Compliance "explain-why" report + 3D envelope volume render | **P1** | OPEN | report artefact (reuse `buildPlanGraphOverlaySvg`), Cesium/renderer 3D volume | SPEC-COMPLIANCE-REPORT (NEW), C23, L-373, C04/C18 | 5–8 | L-398 (report needs an envelope) |
| **L-404** | Denmark demo-fidelity — LOD2 3D-Tiles + DHM terrain (executes L-383a–e) | P2 | OPEN | offline-bake toolchain (GDAL/citygml-tools/tyler/ctb); Cesium tileset+terrain seams | extends L-383; C12, C55 | M–L (offline) | independent — **folded into Track V (no longer cut); parallel to all other tracks** |
| **L-405** | Unified view-switcher (plan / 3D / massing / site surfaces) + view-surface security hardening | P2 | OPEN — just logged (Track V) | view-state, split-view, view-switcher UI | C04/C18 | 3–5 | independent |

**Compliance subtotal:** the **serial engine core** (L-403 + L-398 + L-401, jurisdiction-agnostic) is ~20–32 dev-days on
a strict serial spine (see §3) — this is the critical path. The **per-jurisdiction adapters** (L-399/L-400 for DK, ES,
CH) and the **report** (L-402) are ~15–25 additional dev-days that **fan out in parallel off the frozen engine
interface**, not serially added to the core. The old ~8–11 dev-week figure (Archistar §5.4) was the *one-engineer
serial sum for Denmark alone*; under parallel execution the calendar cost is the ~4-week core plus concurrent fan-out,
not the sum. **DK ships full-fidelity; ES + CH ship structurally-identical adapters with the C58 "estimated" confidence
label** (§1.3-2).

### §2.3 — Pipeline B — parcel/geo (mostly shipped; residuals fold in)

| Item | Title | Sev | Status | Note |
|---|---|---|---|---|
| **L-380** | Parcel-select → buildable-envelope (Spain-first) | P2 | **SHIPPED-PARTIAL** — Catastro parcel-select (keyless) + site-authoring UX live; zoning/envelope half became the L-398+ track | Input spine the envelope reuses |
| **L-380a** | Provider-agnostic Parcel Data Layer | P2 | Interface + CatastroParcelProvider shipped → **absorbed into L-400** (lift to L2) | — |
| **L-380b** | Zoning Rules Engine | P2 | **superseded by L-398** | — |
| **L-380c** | Parcel-select map UI (select-vs-draw, chips, fallback) | P2 | Shipped-partial; polish + envelope-render ride with L-402 | — |
| **L-380d** | Same-origin parcel/zoning proxy + shared cache | P2 | Catastro proxy shipped (`server/parcelZoningProxy.js`); cache/rate-limit hardening + DK zoning route = **rides with L-399/L-400** | — |
| **L-380e** | Governance (VISION/ADR/C57/C58/SPEC) | P2 | **superseded by L-403** | — |

**Net:** Pipeline B has no independent September work beyond what L-398–L-402/L-400 already carry; its shipped seams are
the leverage substrate (§5), not new build.

---

## §3 — Dependency graph & critical path

**Under parallel execution the governing quantity is the CRITICAL PATH (the serial engine core), not the dev-day sum.**
The engine is built once; jurisdictions / report / interop / blockers / view fan out off its **frozen interface** (~wk2).

```
                    ┌──────── SERIAL CORE = CRITICAL PATH (~4 weeks, built ONCE) ────────┐
 PREREQ (Track B): L-188 (site data survives reopen) · render surface healthy (L-361–366)
        │
 L-403 (C57/C58 finalize) ─→ L-398a (schemas + Turf; ◆ FREEZE ENGINE IFACE ~wk2 ◆)
        └─→ L-398b/c (solver: ⊖setbacks + height + FAR + two-fidelity/provenance)
                 └─→ L-398d (wire → site.updateZoning, P6 bus)
                          └─→ L-401a/b/c (envelope → authoring bridge + containment)  ══ engine complete ══
                                     │
        ══ interface frozen ~wk2  ⇒  FAN-OUT BEGINS (all tracks concurrent, disjoint subsystems) ══
                                     │
   ┌────────────────┬──────────────┬────────────────┬───────────────────────┬──────────────────┐
   ▼                ▼              ▼                ▼                       ▼
 Track J          Track R        Track I          Track B                 Track V
 DK ‖ ES ‖ CH     report + 3D    IFC/DXF/Rhino    launch blockers         view-switch + demo
 adapters         (L-402a/b/c)   (L-393a/b)       (L-360 · L-391 ·        (L-405 view-switcher
 (L-399/L-400)                                    L-53 · L-387 ·          + L-404 LOD2/terrain)
 DK full-fidelity;                                L-395/L-405-sec ·
 ES/CH "estimated                                L-396 · L-188 prereq)
 — flagged" (C58)

 LAUNCH GATE (its OWN critical path, human-latency-bound, runs concurrently in Track B):
   L-334 (SHIPPED) → L-360 (live regression, awaiting code verify) → L-391 P1→P2→P3 → production flip (founder)
 G0-CONTRACTS (blocks GA): C08 ⇐ L-391+L-53+L-335 · C22-min ⇐ L-345 (GDPR) · C48-min ⇐ L-344 · C10 ⇐ L-341 · C13 ⇐ L-342
```

**There is one serial critical path and one concurrent human-latency chain; neither is the *sum* of dev-weeks:**

1. **The serial critical path (~4 weeks): `L-403 (C57/C58) → L-398 solver → L-401 bridge`.** This is the only chain the
   calendar cannot compress by adding agents, because each stage consumes the previous stage's output and all touch the
   same net-new packages. **Everything downstream of the frozen interface (~week 2) parallelizes.** Freezing
   `BuildableEnvelope` / `JurisdictionZoningContract` / `ZoningProvider` by week 2 is the **single highest-leverage
   scheduling act in the program** — it converts DK + ES + CH from a serial *sum* into concurrent adapters (Track J),
   and lets Tracks R/I/V build against a stable contract.
2. **The launch gate is a SEPARATE critical path, bounded by human latency not dev-days:** `L-360 → L-391 P1→P2→P3 →
   production flip`, gated by **five ratification points** — R-A protocol, R-B ws-auth, R-C Fly infra + billing, R-D
   one-authority reconciliation, R-E Yjs durability↔snapshot reconciliation — that **cannot be parallelized or bought
   down with more engineers**. R-E couples L-391 to L-334/L-85 (a CRDT merge that drops elements must be caught by
   snapshot element-count reconciliation). This runs concurrently with the engine core on disjoint subsystems (Track B).
   **L-334 is SHIPPED; L-360 is the live regression on this chain** (mechanism awaiting code verification — do not assert
   as fact until verified).

**Two hard prerequisites gate the compliance core before its own chain starts** (both sit in Track B and must close
early): (i) **L-188** — site/GIS data must survive close+reopen or the parcel→envelope→persist loop is moot; (ii) the
**WebGPU device-loss cluster (L-361–366)** — the 3D envelope render (L-402b) rides the same Forma/Cesium/renderer path
that L-183 (globe crash) and L-355 (slow load) still afflict, so the render surface must be healthy first.

**Refinement to the founder's original hypothesis:** it is no longer "the compliance chain *vs* L-391 — one must slip."
Under parallel execution **both run concurrently on disjoint subsystems.** The residual serialization is not *between*
the two chains but *within* each: the ~4-week engine core, and the human-latency L-391 ladder. The contention surface
shrinks to two shared seams (persistence/durability, composition root), serialized per §4.2 — not a scope cut. The
honest consequence of the old plan ("compliance slips first") is **replaced** by: full DK/CH/ES scope fits *provided*
the fidelity cut (DK-full / ES-CH-flagged-estimated, §1.3-2) and the verification-gate rule (§1.3-3) are accepted.

---

## §4 — Parallelization & collision map (where work happens between the pipelines)

**Delivery model (existing, from the implementation plan):** many agents in parallel, one issue each, in isolated
git worktrees → merge → gate on `pryzm.fly.dev` (root `tsc --skipLibCheck --noEmit` = exit 0 **and** the relevant suite
green — the §1.3-3 verification rule) → push. This plan adopts it unchanged. The MEMORY mandate on multi-agent
shared-tree collisions applies: **agents commit scoped CODE only; the orchestrator owns the master audit/plan/logs docs;
explicit per-agent file fences; verify integrity before push.**

**Fan-out track → worktree mapping (the parallel structure from §1.2/§3).** The **serial engine core** (L-403 → L-398 →
L-401) is built first on the critical path; once its interface freezes (~wk2) the five fan-out tracks run concurrently
off disjoint subsystems. Each fan-out Track maps to one or more worktrees below:

- **Serial core** → worktrees **T6** (governance L-403) + **T4-core** (L-398 solver) + the composition-root seam for
  L-401 (serialized per §4.2). This is the critical path; freeze `BuildableEnvelope`/`JurisdictionZoningContract`/
  `ZoningProvider` by ~wk2 to release the fan-out.
- **Track J — jurisdictions** → **T4-adapters** (L-399 DK/ES/CH ZoningProviders + rule packs) + **T5** (L-400 parcel
  adapters). DK full-fidelity; ES + CH structural adapters carrying the C58 "estimated" label.
- **Track R — report** → **T9** (L-402 explain-why report + 3D envelope render).
- **Track I — interop** → **T7** (L-393 round-trip harness).
- **Track B — launch blockers** → **T1** (data integrity), **T2** (collab infra), **T3** (security/deps/privacy),
  **T8** (render stability), including the **L-188 compliance prerequisite** (serialized into T1's persistence seam).
- **Track V — view + demo** → **T10** (L-405 unified view-switcher + view-surface security; L-404 LOD2/terrain
  offline-bake).

### §4.1 — Tracks that run TRULY concurrently (disjoint subsystems/files)

| Track | Owns (files/packages) | Why isolated |
|---|---|---|
| **T1 — Data integrity** (L-334/L-360/L-85) | persistence save path, `ServerSyncQueue`, `server.js` save/validate | Server-side; no overlap with client render/collab hot path |
| **T2 — Collab infra** (L-391 P1) | `apps/sync-server`, `fly.toml`/`Dockerfile` (PROPOSED), `sync-client` provider seam | New service + infra; touches `engineLauncher.ts` only at the already-carved `connectCrdtProvider` seam |
| **T3 — Security/deps/gate/privacy** (L-387/L-388/L-394/L-395/L-392/**L-345**) | lockfile, CI config, test suites, migration script, embed route, C22 privacy substrate | Cross-cutting but mostly config/test files; L-345 (GDPR) adds new privacy modules — isolated |
| **T8 — Render stability** (L-361–366, L-183/L-355) | renderer-three, RenderPipelineManager, Forma/Cesium view | **Serialize against RenderPipelineManager owners** (per the plan, L-205 owns `§FIX-SHADOW-PASS-SINGLE-OWNER`); the 3D envelope render (L-402b) depends on this being healthy |
| **T4-core — Compliance ENGINE** (L-398 solver, serial core) | **new** `@pryzm/*` L2 zoning engine package | Net-new package on the critical path; imports nothing the launch touches. Freeze its exported interface ~wk2 to release Track J |
| **T4-adapters — Jurisdiction adapters** (L-399 DK/ES/CH, Track J) | provider adapters + `JurisdictionZoningContract` rule packs (`da-*` full · `es-*`/`ch-*` estimated) | Fan out off the frozen engine iface; **each jurisdiction is an independent adapter worktree** — DK ‖ ES ‖ CH truly concurrent |
| **T5 — Parcel data layer** (L-400, Track J) | **new** `@pryzm/site-parcel-data` (L2) + `parcelZoningProxy.js` clone (DK Datafordeler, CH adapter) | Net-new package + server route; isolated |
| **T6 — Governance** (L-403, serial core) | `docs/` contracts/SPECs/ADRs, C00 index | Docs only; **orchestrator-adjacent — serialize against the master-doc editors**. Gates the engine iface freeze |
| **T7 — Interop** (L-393, Track I) | file-format round-trip harness | Independent test harness |
| **T9 — Compliance report** (L-402, Track R) | report artefact (reuse `buildPlanGraphOverlaySvg`), Forma massing render (`pryzmRenderFormaMassing`) | Reuses shipped overlay + massing renderer; depends on a frozen `BuildableEnvelope`, not on the solver internals — fans out after ~wk2 |
| **T10 — View + demo** (L-405/L-404, Track V) | view-switcher UI + view-state, LOD2 offline-bake toolchain, Cesium tileset/terrain | Independent UI + offline toolchain; fully parallel to compliance |

### §4.2 — SHARED-FILE hot spots that MUST serialize (no two agents at once)

| Shared surface | Contended by | Rule |
|---|---|---|
| **`engineLauncher.ts` (composition root, P1)** | L-391 (provider wiring), L-401 (envelope→generator wiring if it touches launch) | **Serialize.** One agent at a time; changes only at pre-carved seams (`connectCrdtProvider`, generator entry). Never two edits to the composition root in flight. |
| **Persistence / `ProjectLoader` / `ServerSyncQueue` / `server.js` save path** | L-360, L-85, L-188 (site-model persistence), L-391 R-E (durability flush), L-396 | **Serialize behind T1.** The Yjs durability flush (R-E) reconciles *into* the same snapshot path L-334 validated — L-391 P2/P3 durability work must land *after* L-360, never concurrently. **L-188 (GIS/site data on reopen) touches the same loader** — it is the compliance-pillar prerequisite and must serialize here, not in the compliance worktree. |
| **`fly.toml` / `Dockerfile`** | L-391 P1 (R-C infra), L-404 (offline-bake image, if ever in-image) | **Serialize + ratify.** Infra changes are PROPOSED, founder-gated (billing). L-404 keeps native binaries OUT of the app image by design. |
| **Master docs** (`V1-LAUNCH-*.md`, C00 index, contracts) | L-403, orchestrator, the two in-flight CF-1/cross-ref editors | **Orchestrator-only.** Code agents never edit these. L-403's contract authoring serializes against whoever is mid-edit (read as "as of read"). |
| **`site.updateZoning` / `site.parcel-boundary-set` commands (C19)** | L-398d (engine→command), L-400 (parcel commit) | **Serialize behind the C19 command owner.** Both write the same site-model commands; one PR at a time. |
| **`VERSION_LIMITS` / `PlanConfig.ts`** | L-396, L-397 | **Serialize behind the L-397 founder decision** — do not touch the three inconsistent numbers until the decision lands, then fix all three in one PR. |

### §4.3 — Worktree-isolation strategy (recommended)

- **One worktree per track T1–T10**, branched off `main` (or the current integration branch). Net-new packages
  (T4-core/T4-adapters/T5/T9) are collision-free by construction — they add files, import nothing the launch imports,
  and can develop full-speed in parallel. **Track J's three jurisdiction adapters (DK ‖ ES ‖ CH) are separate
  worktrees** off the frozen engine iface — the fan-out that lets full DK/CH/ES scope fit the calendar.
- **Sequencing rule for the fan-out:** the serial core (T6 governance → T4-core solver → L-401 bridge) runs first on
  the critical path; **freeze the engine interface (`BuildableEnvelope`/`JurisdictionZoningContract`/`ZoningProvider`) by
  ~week 2**, then release T4-adapters/T5/T9/T10 to develop against the frozen contract. Track B (blockers) and Track I
  (interop) do not depend on the freeze and run from day one.
- **The three shared surfaces (composition root, persistence, infra) get a single "integration" worktree** that agents
  rebase onto in sequence; no two shared-surface PRs open simultaneously.
- **`pnpm-lock.yaml` discipline:** L-398a (Turf) and any new dep sync the lockfile in the *same* PR (MEMORY:
  agent-added devDep w/o lockfile sync = silent Fly build fail). Run root `tsc --skipLibCheck` before every commit that
  touches `packages/*` (MEMORY: Fly build uses stricter root tsc).
- **Compliance stays dark:** everything T4/T5 ships behind the parcel/zoning flag (mirror L-391 Phase-0's
  default-OFF gate) so it can merge to `main` continuously without touching GA behaviour.

---

## §5 — Leverage map (the heart of "leverage the work")

Every new compliance/blocker item maps to an **existing shipped PRYZM asset** it reuses; only the **net-new** column is
truly new build. This is why Denmark-end-to-end is ~30–48 dev-days and not a from-scratch quarter.

| New item | Reuses (existing asset, file/package) | Net-new only |
|---|---|---|
| **L-400** DkParcelProvider + L2 lift | `server/parcelZoningProxy.js` (keyless Catastro proxy — clone for Datafordeler, server-side key) · `ParcelProvider` interface + `CatastroParcelProvider` (`apps/editor/src/ui/site/parcel/`) · `overpassProxy.js` proxy template | Datafordeler key handling; Matriklen GML→GeoJSON normalize; `@pryzm/site-parcel-data` package shell |
| **L-398** envelope solver | `buildBoundaryFromLatLonRing` (`apps/editor/src/ui/site/boundaryProjection.ts`) → `siteSetParcelBoundary` one-shot commit (`packages/stores/src/site-commands/siteSetParcelBoundary.ts`, cmd `site.setParcelBoundary` → event `site.parcel-boundary-set`, C19 §1.4 immutable) — the committed XZ polygon **already carries per-edge front/side/rear classification** (exactly the input a per-edge setback solver needs); the envelope inset flows down the **identical committed path** a drawn boundary uses (zero new persistence) · `site.updateZoning` (`packages/stores/src/site-commands/siteUpdateZoning.ts`) already implemented · C19 `Parcel` carries `setbacks/maxFAR/maxHeight/zoning.*` · `@pryzm/solar-analysis` as the **deterministic geometry-analysis precedent**: pure THREE-free L2 engine + **injected occlusion oracle** (`accumulateSunHours`, BVH `buildOccluderIndex`), with the renderer supplying real geometry (`renderer-three/src/solar/computeSunHoursOnModel.ts`) | Turf negative-buffer inset math; `ZoningRulesEngine`; `BuildableEnvelope` schema; two-fidelity resolution |
| **L-399** DkZoningProvider + rule packs | `parcelZoningProxy.js` clone (Plandata anonymous WFS) · `rules/programRules.ts` as the **curated-ruleset pattern** to mirror for `JurisdictionZoningContract` packs · L-373 credibility/confidence-chip discipline | Plandata field mapping (`bebyggelsesprocent`/`maksbygningshoejde`/`maksantaletager`/`anvendelse`); `da-*` curated pack |
| **L-401** authoring bridge | `generateResidentialFromBoundary` (`apps/editor/src/ui/residential-building/residentialFromBoundary.ts`) + apartment/house/resi/office generators (`pryzmGenerate*` → `@pryzm/ai-host` workflows) + `@pryzm/typology-pipeline` 7-stage `PipelineRouter` (C50) — **the constraints stage already has `joinProgramRulesWithRegulatory` (the exact merge point for regulatory envelope) and a `validators` stage `runValidators`/`SpatialValidator` (the containment-check point)** · layout engine (C53) · `briefSchema` for permitted-use → program | Thread inset+maxHeight as generation bounds; `anvendelse`→brief seed; `SpatialValidator` envelope-containment rule |
| **L-402** explain-why report + 3D volume | `buildPlanGraphOverlaySvg` (**reuse the graph/preview overlay compositor** for the report thumbnail) · existing renderer for one translucent extrusion (P2-safe, brand `#6600FF`, no new THREE site — MEMORY/P2) · Cesium/Forma 3D site view for context · `check-windcfd-beta-label.ts` as the **CI fidelity-label gate template** (L-373) | Report artefact layout + provenance chips; max-height volume mesh; the DK confidence gate |
| **L-391** collab | `YjsDocAdapter` (wired at `engineLauncher.ts:817`) + `connectCrdtProvider` seam (Phase-0, shipped) + `CRDTConflictResolver` (real 3-way merge) + `YjsProjectCache` (server merge cache, exists) + existing `SESSION_SECRET` identity for ws-auth | Deploy `apps/sync-server` (or stock y-websocket per R-A); ws-auth enforcement; Fly process/app; E2E harness |
| **L-334/L-360** checksum | Existing snapshot save path + server 50 MB/furniture validation (extend, don't replace) · element-count reconciliation ties to L-391 R-E | Whole-snapshot validation that does **not** brick large projects (the reverted-fix lesson) |
| **L-393** interop | Existing IFC-bridge + IFC4X3-RV exporter + BCF/family round-trip harness (extend to geometry compare) | import→export→re-import geometry-delta harness; adversarial malformed-file cases |

**Top 3 leverage wins:**

1. **The site-commit spine is already the destination.** `buildBoundaryFromLatLonRing → site.parcel-boundary-set` +
   `site.updateZoning` + C19 `Parcel.setbacks/maxHeight/maxFAR` already exist and persist — **the envelope solver
   (L-398) plugs into a fully-wired output with zero new persistence surface.** The field destination is built; only
   the source (the solver) is missing.
2. **The Catastro keyless proxy is the provider template for every jurisdiction.** `server/parcelZoningProxy.js` (+ the
   `ParcelProvider`/`CatastroParcelProvider` seam) makes DkParcelProvider/DkZoningProvider **adapter swaps, not new
   infra** — exactly as L-380 §4.4 / L-383 §4 designed (GeoJSON-canonical, CRS-blind).
3. **The generators are the moat, and the bridge is a thin inset+cap.** L-401 threads a polygon inset and a height cap
   into `generateResidentialFromBoundary`/typology-pipeline — the compliant-building generation reuses the entire
   shipped authoring substrate; the "beat Archistar on authoring *of the compliant* building" thesis is a small
   connector on top of proven engines, not a new generator. The solar-analysis raycast package is the deterministic
   analysis-engine precedent the solver mirrors.

---

## §6 — Week-by-week schedule (~7–8 weeks to early-September)

The **serial engine core** occupies the critical path in **weeks 1–4**; its interface **freezes at the end of week 2**,
releasing the five fan-out tracks (**J** jurisdictions · **R** report · **I** interop · **B** blockers · **V** view+demo)
to run concurrently. Ratification gates are **front-loaded into weeks 1–2** — "day and night" compresses dev-days within
a week but **cannot compress serial ratification latency.** Track B (blockers) and Track I (interop) do not depend on the
freeze and run from day one.

| Week | Serial engine core (CRITICAL PATH) | Parallel fan-out tracks (concurrent) | Ratification / decision gates |
|---|---|---|---|
| **W1 (Jul 21)** | **L-403** finish C57/C58 + SPEC stubs; **L-398a** L0 schemas (`BuildableEnvelope`/`JurisdictionZoningContract`/`ZoningProvider`) + Turf dep (lockfile-synced). Draft the engine interface. | **B:** L-360 checksum-never-brick fix start (live P0); L-361–366 WebGPU **live-confirm on real hardware**; L-388/L-204 green CI; L-387 dep triage; **L-188 site-persistence (compliance prereq) start**. **I:** L-393 round-trip harness scaffold. **V:** L-405 view-switcher start. | **Decide in week 1: R-A** protocol; **R-C** Fly infra/billing; **L-397 pricing (founder)**. |
| **W2 (Jul 28)** | **L-398b/c** solver core (parcel⊖setbacks inset + height cap + FAR + two-fidelity/provenance). **◆ FREEZE ENGINE INTERFACE (end W2) ◆** — releases Track J/R. | **B:** L-360 landed; L-361–366 harden/confirm; **L-345 GDPR/C22-min** start; L-391 **P1** deploy sync-server + ws-auth in staging; **L-188 landed**. **I/V** continue. | **R-B** ws-auth model. (All R-gates now decided/in-flight by end W2.) |
| **W3 (Aug 4)** | **L-398d** wire engine→`site.updateZoning`; **L-401a/b** thread inset+maxHeight into generators/typology-pipeline + permitted-use→brief seed. | **J (fan-out live):** DK L-399a/b (Plandata + `da-*` pack) ‖ ES L-399c (MUC + `es-barcelona`, *estimated*) ‖ CH structural adapter start; L-400b DkParcelProvider (Datafordeler key). **R:** L-402a report artefact start. **B:** L-345 continue; L-391 P1 smoke; L-394/L-395. | Datafordeler service-user **key wiring** (server-side). |
| **W4 (Aug 11)** | **L-401c** envelope-containment `SpatialValidator` + containment assertion test. **Engine complete.** | **J:** DK full-fidelity end-to-end; ES/CH adapters producing *flagged-estimated* envelopes. **R:** L-402a done; L-402b 3D volume start. **B:** L-391 **P2** authoritative + retire silent LWW (R-D); L-53 unblocked. **I:** L-393 harness runs. | **R-D** one-authority (socket.io demotion). |
| **W5 (Aug 18)** | *(core done — engineers roll into Track J/R hardening)* | **J:** DK/ES/CH confidence labels wired (L-398c). **R:** L-402b 3D envelope render + **L-402c CI fidelity-label gate** (`estimated` never authoritative, L-373). **B:** L-391 **P3** two-browser E2E gate; L-396 durability + DR drill (**R-E** ties L-334). **V:** L-405 done; L-404 LOD2 tileset bake. | **R-E** durability reconciliation. |
| **W6 (Aug 25)** | — | **J:** DK/CH/ES per-jurisdiction end-to-end dry-run (parcel→zoning→envelope→generated building fits). **R:** report polish + per-fidelity provenance chips. **B:** L-392 observability; L-393 adversarial malformed-file; regression hardening. **V:** LOD2 demo-fidelity polish. | — |
| **W7 (Sep 1)** | — | **B (close-out):** all P0/P1 green on `pryzm.fly.dev`; **G0-CONTRACTS ACTIVE** (C08/C10/C13/C48-min/C22-min); L-391 **production flip** after E2E gate (founder). GA-candidate. **J/R/V:** DK/CH/ES compliance demo polish behind flag; honest-messaging copy (full DK · flagged ES/CH). | **Production `VITE_COLLAB_CRDT=true` flip (founder)**. |
| **W8 (Sep 8, buffer)** | — | Regression buffer; DR drill re-run; launch-readiness sign-off. Flip compliance flag ON for demo (DK full + ES/CH *estimated — flagged*); frame post-launch **fidelity-hardening** backlog (ES/CH rule-pack human validation, canton coverage). | GA sign-off. |

**Where the tracks meet:** the fan-out tracks run on **disjoint subsystems**; contention is confined to two shared seams
— the persistence/durability seam (L-334 ↔ L-391 R-E, and L-188, W5) and the composition root (L-391 provider wiring vs
L-401 generator wiring, W3–W4). Both are serialized per §4.2 under one integration worktree. Everything else — the three
jurisdiction adapters, the report, interop, view-switcher, LOD2 bake — runs on files no other track touches.

---

## §7 — Risk register (ranked)

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| **R1** | **Compliance work starves the P0 data-integrity/collab blockers.** The CF-1 pillar is exciting and net-new; the P0 blockers are unglamorous and hard. Pulling engineers to compliance slips L-334/L-391 → **no launchable product.** | **Critical** | Hard fence: **P0 blockers are non-negotiable and staffed first every week.** Compliance ships dark behind a flag and NEVER gates GA (Archistar §5.2). If W-by-W contention arises, compliance slips (§1 cut list), launch does not. Orchestrator tracks blocker burn-down as the primary metric. |
| **R2** | **L-391 human/infra ratification latency (R-A..R-E) + L-397 pricing decision** — calendar cost not solvable by code or more people; a late R-C (Fly billing) or R-D can push the production flip past September. | **High** | **Front-load all R-gates into W1–W2** (§6). Production stays flag-OFF (socket.io) until Phase-3 E2E passes, so a late flip degrades to "collab beta" not "no launch". Founder decisions (R-C billing, L-397 pricing, production flip) surfaced W1. |
| **R3** | **Compliance data reality / CH-ES fidelity** — numeric rules PDF-trapped everywhere except Denmark; Datafordeler key-gating; 26-canton + fragmented-PGOU curation long-tail (Archistar §2). Shipping ES/CH as if full-fidelity would be dishonest and unbuildable in September. | **High** | **September = parity-in-STRUCTURE, fidelity following** (§1.3-2): DK full-fidelity (structured Plandata); **ES + CH ship structurally-identical adapters carrying the C58 `estimated` confidence label** — `estimated-ruleset` NEVER shown authoritative (L-373 CI gate, L-402c). Human rule-pack validation for ES/CH is the explicit post-launch fidelity-hardening backlog. Datafordeler key server-side only; keyless mirror fallback noted. **Do not claim full CH/ES fidelity by September.** |
| **R4** | **L-360 checksum bricks valid projects** — L-334 (SHIPPED) computes the checksum pre-compression at save and verifies it post-decompression at load; the codec is reported not bit-exact, so valid projects hard-refuse to load. Flagged **live P0 regression** — but the exact mechanism is **awaiting code verification; do not assert as fact until verified in code.** | **Critical** | Round-trip-stable checksum + **never hard-brick** (load best-effort + warn); large-project fixture in the gate; ties L-391 R-E element-count reconciliation. **Verify the mechanism in code before committing to the fix shape.** |
| **R4b** | **WebGPU device-loss (L-361–366) makes project creation itself fail** on some hardware — several fixes are "implemented, awaiting live confirmation", i.e. *unconfirmed*. If unconfirmed on the founder's Windows box, GA has no product to launch. | **Critical** | Live-confirm on real hardware early (W1–W2); WebGL is the stable demo backend on this box (MEMORY); auto-fallback must fire for real buildings. Blocks the 3D envelope render (L-402b) too. |
| **R4c** | **GDPR/C22 (L-345) unbuilt for an EU (Denmark-first) launch** — a compliance pillar aimed at Denmark makes C22-min ACTIVE a hard G0-CONTRACTS gate; shipping EU-facing without DSAR/consent/anonymise is a legal, not just technical, blocker. | High | Scope C22-min (consent + DSAR + storage routing) into the blocker track W2–W4; do not let the compliance pillar's EU framing outrun the privacy substrate. |
| **R5** | **Multi-agent shared-tree collisions** on composition root / persistence / master docs (MEMORY hazard). | Medium | §4.2 serialization + §4.3 worktree isolation; agents commit scoped CODE only; orchestrator owns master docs; integrity-verify before push. |
| **R6** | **Interop (L-393) surfaces a real IFC/DXF/Rhino fidelity defect late** — round-trip is UNVERIFIED, so an unknown-unknown could appear in W6. | Medium | Run the round-trip harness **early (W6 start, not end)**; if a defect surfaces, it is a fast-follow fix, not a launch blocker (interop is P1 credibility, not P0 data-integrity). |
| **R7** | **Fly build hard-fails on lockfile/tsc drift** from the net-new packages (MEMORY: stricter root tsc, lockfile sync). | Medium | Root `tsc --skipLibCheck` + lockfile sync in every `packages/*` PR; Turf dep synced in L-398a's own PR. |
| **R8** | **Scope creep on the compliance report** (L-402) toward full Archistar-parity packaging. | Low-Med | SPEC-COMPLIANCE-REPORT scopes September to explain-why + provenance + 3D volume; check-back (G-ENG-5) explicitly out. |
| **R9** | **VERIFICATION LOAD under parallel execution** — trading dev-day-sum for critical-path only stays sound if the merged code volume is actually tested; an unverified merge can silently break `main` for every downstream track. | **High** | **Program rule (§1.3-3): EVERY merge is test- AND tsc-gated** — root `tsc --skipLibCheck` clean + relevant suite green before merge, no exceptions. Orchestrator tracks a green-`main` invariant; a red merge blocks all dependent fan-out. |
| **R10** | **Engine-interface freeze slips past week 2** — the fan-out (Track J/R) cannot start until `BuildableEnvelope`/`JurisdictionZoningContract`/`ZoningProvider` are frozen; a late freeze serializes the jurisdictions and re-creates the one-engineer overrun. | **High** | Treat the ~wk2 freeze as a hard milestone (§3, §6); scope L-398a schemas narrowly and stabilise the exported types first, iterate solver *internals* behind the frozen surface. DK/ES/CH adapters code against the contract, not the implementation. |

---

## §8 — Proposed work-item deltas (for the orchestrator to transcribe)

The coarse compliance L-items need breaking into schedulable sub-items. **Listed here only — NOT written into the master
docs.** Each: one-line scope + contract map. (L-391 already has Phases 0–3 + R-A..R-E; L-334/L-360 already paired.)

**L-398 → envelope solver sub-items:**
- **L-398a** — Add Turf dep (lockfile-synced) + L0 schemas `BuildableEnvelope` / `JurisdictionZoningContract` /
  `ZoningRecord`, P5-pure, Zod round-trip. *(C58, C57; P5)*
- **L-398b** — `ZoningRulesEngine` core: parcel ⊖ setbacks (Turf negative buffer) → inset polygon + `area×maxHeight`
  volume; pure L2, deterministic. *(C58; C19 §1.4)*
- **L-398c** — Two-fidelity resolution (`structured` / `estimated-ruleset` / `none`) + per-field provenance +
  confidence labels. *(C58; L-373)*
- **L-398d** — Wire engine → `site.updateZoning` command (P6 bus); no direct store write. *(C19; P6)*

**L-399 → zoning providers + rule packs sub-items:**
- **L-399a** — `DkZoningProvider` (Plandata anonymous WFS; `bebyggelsesprocent`/`maksbygningshoejde`/`maksantaletager`/
  `anvendelse`). *(C58)*
- **L-399b** — Curated `da-*` `JurisdictionZoningContract` pack for PDF-gap fill (mirror `rules/programRules.ts`).
  *(C58; L-373)*
- **L-399c** — `MucZoningProvider` (Catalonia MUC zone class) + curated `es-barcelona` pack. **SEPTEMBER — Track J
  fan-out, shipped "estimated — flagged"** (C58 confidence label; numeric pack human-validated post-launch). *(C58; L-373)*
- **L-399d** — `ChZoningProvider` (cantonal structural adapter) + curated `ch-*` pack (pilot cantons). **SEPTEMBER —
  Track J fan-out, shipped "estimated — flagged"** (C58 confidence label; 26-canton validation is the post-launch
  fidelity-hardening backlog). *(C58; L-373)*

**L-400 → parcel data layer sub-items:**
- **L-400a** — Lift shipped Catastro provider to `@pryzm/site-parcel-data` (L2) + `ParcelProvider` registry. *(C57; C12)*
- **L-400b** — `DkParcelProvider` (Matriklen via server-side Datafordeler key in the proxy clone). *(C57)*
- **L-400c** — `ChParcelProvider` structural adapter (cantonal cadastre; parcel geometry only — the estimated zoning
  rides L-399d). **SEPTEMBER — Track J fan-out.** *(C57)*

**L-401 → authoring bridge sub-items:**
- **L-401a** — Thread inset polygon + maxHeight into `generateResidentialFromBoundary` + the typology-pipeline
  constraints stage (`joinProgramRulesWithRegulatory`) as generation bounds. *(C19 §1.6; C50)*
- **L-401b** — Permitted-use (`anvendelse`) → typology-brief seed (brief-capture stage). *(C50; briefSchema)*
- **L-401c** — Envelope-containment `SpatialValidator` in the validators stage (`runValidators` → `ValidationReport`):
  generated footprint ⊂ inset ∧ height ≤ cap; C53 slider-as-intent preserved (no parallel knob). *(C53; C19 §1.6)*

**L-402 → report + render sub-items:**
- **L-402a** — Explain-why compliance report artefact (envelope + rule refs + ordinance links + confidence chips);
  reuse the pure-SVG-string overlay pattern `buildPlanGraphOverlaySvg`
  (`apps/editor/src/ui/apartment-layout/layoutBubbleGraph.ts`). *(SPEC-COMPLIANCE-REPORT NEW; C23)*
- **L-402b** — 3D translucent max-height envelope volume via the Forma massing renderer (`pryzmRenderFormaMassing`,
  `apps/editor/src/ui/geospatial/`, same ENU frame), `#6600FF`, P2-safe. *(C04/C18)*
- **L-402c** — CI fidelity-label gate (`estimated-ruleset` never authoritative); mirror `check-windcfd-beta-label.ts`.
  *(L-373)*

**L-393 → interop sub-items:**
- **L-393a** — IFC/DXF/Rhino round-trip harness (import→export→re-import geometry-delta compare). *(C25/C26/C32/C33)*
- **L-393b** — Adversarial malformed-file behaviour (crash vs silent-drop vs graceful reject). *(L-393)*

**L-404** — already decomposed as L-383a–e (LOD2 3D-Tiles + DHM terrain + Matriklen keyed parcel). **SEPTEMBER — folded
into Track V (no longer cut); runs fully parallel to all other tracks** on the offline-bake toolchain (native binaries
stay OUT of the app image — §4.2 `fly.toml` rule). Denmark demo ships with baked LOD2 context, not just Cesium footprints.

**L-405 → view + demo sub-items (Track V):**
- **L-405a** — Unified view-switcher across plan / 3D / massing / site surfaces (single view-state authority; no parallel
  knob per C04/C18). *(C04/C18; view-state)*
- **L-405b** — View-surface security hardening (the security half of the `L-395/L-405-security` grouping — embed/view
  entry hardening alongside L-395's embed-token server-side validation). *(C07 §6.1; C08)*

---

## §9 — Verdict summary (for the founder)

- **Fit:** **FITS — full DK/CH/ES scope — under parallel execution, PROVIDED (a) the L-391/L-397 ratification gates are
  decided in week 1, (b) the September fidelity cut is accepted as DK full-fidelity + ES-and-CH shipped "estimated —
  flagged" (C58 confidence label), and (c) test-gated merges are held.** All P0/P1 launch blockers + the full Archistar
  footprint (Denmark **and** Switzerland **and** Spain, envelope provably constrains generation) fit ~7–8 weeks —
  because wall-clock is the **critical path (the ~4-week serial engine core), not the dev-day sum**, and the
  jurisdictions/report/interop/blockers/view tracks fan out concurrently off the frozen engine interface. **DK/CH/ES are
  NOT cut.** What follows structure is *fidelity*: ES + CH ship as structurally-identical adapters carrying the
  mandatory "estimated" label, hardened to full fidelity post-launch.
- **Serial critical path:** `L-403 (C57/C58) → L-398 solver (a→d) → L-401 authoring bridge (a→c)` — the jurisdiction-
  agnostic engine, ~4 weeks, built once. **Freeze `BuildableEnvelope`/`JurisdictionZoningContract`/`ZoningProvider` by
  ~week 2** — the single highest-leverage act; it releases the fan-out.
- **Parallel fan-out tracks (off the frozen engine):** **Track J** jurisdictions (DK ‖ ES ‖ CH adapters) · **Track R**
  explain-why report + 3D envelope render · **Track I** IFC/DXF/Rhino round-trip · **Track B** launch blockers
  (L-360 · L-391 P1→P3 · L-53 · L-387 · L-395/L-405-sec · L-396 · **L-188 compliance prereq**) · **Track V** unified
  view-switcher (L-405) + Denmark LOD2 demo (L-404). The launch gate `L-360 → L-391 P1→P2→P3 → flip` is its own
  human-latency-bound critical path inside Track B, running concurrently with the engine core.
- **Honest residuals parallelization does NOT solve:** (1) human ratification latency (R-A..R-E + L-397) — front-loaded
  to weeks 1–2; (2) CH/ES rule-pack fidelity — DK-full / ES-CH-flagged-estimated, human validation post-launch; (3)
  verification load — **every merge test- and tsc-gated** (program rule). Plus the two plan-surfaced corrections: **L-334
  is SHIPPED, L-360 is the live regression** (awaiting code verification — not asserted as fact); **L-188 is a compliance
  prerequisite**, not a generic blocker.
- **Top 3 leverage wins:** (1) the site-commit spine (`buildBoundaryFromLatLonRing` → `site.parcel-boundary-set` +
  `site.updateZoning` + C19 `Parcel` fields) is already the wired destination — the solver plugs in with zero new
  persistence; (2) the Catastro keyless proxy + `ParcelProvider` seam makes **every jurisdiction (DK/ES/CH) an adapter
  swap** — the mechanism that turns full-scope into a parallel fan-out; (3) the shipped generators + typology-pipeline
  are the moat — L-401 is a thin inset+cap connector, and `@pryzm/solar-analysis` is the deterministic-analysis
  precedent for L-398.
- **Top 3 risks:** (1) **compliance starving the P0 blockers** → hard fence, blockers first, compliance dark/flagged
  (contention is the exception under disjoint-subsystem parallelism); (2) **the P0 surface is larger and partly
  *unconfirmed*** — L-360 checksum bricks valid projects (live, mechanism awaiting code verify), L-361–366 WebGPU
  device-loss can make project creation itself fail, L-345 GDPR/C22 unbuilt for an EU pillar → confirm/close early
  (W1–W2), WebGL as the stable demo backend; (3) **engine-interface-freeze slip + verification load** — a late freeze
  re-serializes DK/CH/ES and an unverified merge breaks every downstream track → treat the ~wk2 freeze as a hard
  milestone and hold the test-gated-merge rule.

*End of program plan. No code was modified, no contract was flipped, no master tracker/plan was edited in producing this
document.*
