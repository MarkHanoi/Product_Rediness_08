# September Readiness — Master Program Plan (cross-pipeline)

> **Stamp**: 2026-07-17 · **Target**: early-to-mid September 2026 (~7–8 calendar weeks) · **Status**: PROGRAM PLAN
> (no code changed, no contract flipped, no master tracker/plan edited).
> **Author**: cross-pipeline program review (workload / critical-path / leverage pass).
> **Founder intent**: *"everything in place by September, we will work day and night, make it work, architecturally
> sound, no shortcuts, review how to leverage the work and where everything should be done between the pipelines."*
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

**Verdict: FITS-WITH-NAMED-CUTS.** "Day and night" can put a *credible, architecturally-sound* September surface on
`pryzm.fly.dev` — **but only if "everything" is defined honestly.** The full literal ask (all P0/P1 launch blockers
**and** full Archistar-parity compliance across Denmark + Spain + Switzerland **and** verified IFC/DXF/Rhino interop, in
7–8 weeks) **does not fit** and cannot be made to fit by adding people, because the two decisive chains are *serial* and
partly *human-ratification-latency-bound*, not merely dev-day-bound. Compliance-to-parity alone is estimated at
**~8–11 focused dev-weeks for one engineer on Denmark only** (Archistar audit §5.4) — that single number already
exceeds the calendar before a single launch blocker is touched.

**What fits (the honest September surface):**

1. **All P0/P1 launch blockers closed** — the P0 core is larger than the named list: **L-360** (checksum bricks valid
   projects — the live data-integrity P0; L-334 already shipped), **L-361–366** (WebGPU device-loss cascade on batch AI
   generation — today this can make *no project creatable*), **L-391** Phases 1–3 (+L-53/L-335 → make C08 ACTIVE),
   **L-188** (GIS/site data lost on reopen — a hard prerequisite for the whole compliance pillar). Then the P1 band —
   L-387 (deps), L-388/L-204 (green CI gate), L-393 (interop round-trip *verified*), L-394 (migration tested), L-395
   (embed token), L-396 (durability), L-392 (observability), **L-345** (GDPR/C22 — an EU launch-blocker the Denmark
   pillar makes unavoidable) — plus the **L-397** pricing decision (founder). **These are non-negotiable and set the
   launch date; the formal gate is G0-CONTRACTS (C08/C10/C13/C48-min/C22-min ACTIVE).**
2. **Compliance pillar = Denmark ONLY, end-to-end, behind a flag** — governance (L-403) → envelope solver (L-398) →
   authoring bridge (L-401) → explain-why report + 3D volume (L-402), proven on the one jurisdiction with structured
   zoning (Plandata.dk). This is the founder's CF-1 pillar realised as a *demonstrable, architecturally-sound wedge*:
   parcel → zoning → buildable envelope → **a generated building that provably fits inside the envelope** → export.
3. **Pipeline B parcel-select (Spain/Catastro) already shipped** — folded in as the input spine the envelope reuses;
   its residual lift-to-L2 + proxy-cache hardening ride along.

**What must be CUT or de-scoped for September (say so plainly):**

- **Spain compliance breadth (L-399c / B4)** — numeric rules are PDF-trapped (curated `es-barcelona` pack) and Spain
  has *little free LOD2*, so the Spanish envelope is both lower-fidelity and lower-confidence. **Fast-follow (Q4), not
  September.** Spain's *parcel-select authoring* demo already ships; only its *compliance* half is cut.
- **Switzerland (L-399/L-400 CH adapters / B7)** — 26-canton PDF federation + the Terrara buy-vs-build decision (CF-2).
  **Explicitly a later bet. Out of September.**
- **Denmark demo-fidelity LOD2 + terrain (L-404 / B5, executes L-383a–e)** — native-binary/JVM offline-bake toolchain;
  valuable for the *flagship* demo but decouplable. **Ship the engine in September; the cinematic LOD2 context is
  fast-follow.** September's DK demo uses the existing Cesium/footprint context, not baked LOD2.
- **Compliance check-back (re-validate after edits, G-ENG-5)** — Phase-B parity feature; out of September.

**The single most important guardrail:** the compliance pillar **must never gate GA and must never starve the P0
blockers.** A compliance demo on top of silent element-loss (L-334) or last-write-wins collab (L-391) is not launchable
(Archistar audit §5.2/§5.5). Compliance ships *dark, behind a flag, additively* — exactly the L-380 §12 / L-391 Phase-0
discipline. If staffing forces a choice in any given week, **the P0 blockers win, every time.**

**Bottom line for the founder:** you can stand up in September and truthfully say *"PRYZM authors compliant-ready
buildings on real European parcels — and on Denmark it computes the buildable envelope from live national zoning and
generates a building that provably fits it."* You cannot yet say *"European Archistar across DK/CH/ES."* The plan below
gets the first claim fully in place, architecturally sound, and sequences the rest as honest fast-follow.

---

## §2 — Full work inventory (both pipelines, every OPEN item)

Effort is rough **dev-days** (single-engineer focus-time), independent of calendar. `Dep` = what must precede it.
Pipeline tags: **A-blocker** (launch-critical data-integrity/collab/security/quality) · **A-compliance** (CF-1 pillar) ·
**B** (parcel/geo, mostly shipped).

### §2.1 — Pipeline A — launch blockers (gate GA regardless of country)

| Item | Title | Sev | Status (as of read) | Subsystem / files | Contract/ADR | Effort (d) | Dep |
|---|---|---|---|---|---|---|---|
| **L-334** | Save data-integrity — silent element-loss reported as success (quarantine + client checksum) | **P0** | **SHIPPED** (Fix 1, 2026-07-16) — but spawned the L-360 regression; **server-side checksum column deferred** | `ProjectLoader.ts`, `ProjectSerializer.ts`, `SnapshotIntegrity`/`QuarantineStore` | C05, C47 §1.6, C48-adjacent | 0 (done) + 1–2 (server col) | — |
| **L-360** | L-334 checksum **hard-refuses valid projects (bricks them)** — codec not bit-exact (checksum pre-compression vs post-decompression) | **P0** | **OPEN — REGRESSION, FIX IN PROGRESS.** The live P0. Fix: round-trip-stable checksum + never-hard-brick (load best-effort + warn) | `SnapshotIntegrity.ts`, `ProjectSerializer.ts:978`, Msgpack/draco codecs | C05, C47 | 3–5 | L-334 |
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

### §2.2 — Pipeline A — compliance-authoring pillar (CF-1, September, Denmark-first)

| Item | Title | Sev | Status | Subsystem / new package | Contract/ADR | Effort (d) | Dep |
|---|---|---|---|---|---|---|---|
| **L-403** | Governance — author C57 (Parcel Data Layer) + C58 (Zoning Rules Engine) + SPEC-PARCEL-SELECTION + SPEC-COMPLIANCE-REPORT + strategy ADR + VISION wedge | P1 (pillar) | **IN PROGRESS** — contracts-first | `docs/` C00 index, contracts, SPECs, ADRs | C57/C58 (NEW), C00, C19 §9/§10.2, STR-02/STR-12 | 5–8 | — |
| **L-398** | Zoning Rules Engine + BuildableEnvelope solver (parcel ⊖ setbacks → inset + area×maxHeight, two-fidelity) | **P1** | OPEN — 0% built; the hardest piece | new `@pryzm/*` L2 engine; Turf dep | **C58 (NEW)**, C19 §1.4/§1.6 | 8–12 | L-403 (C58 skeleton), Turf dep |
| **L-399** | ZoningProvider adapters + curated rule packs (DK Plandata structured + `da-*` pack; ES-Catalonia MUC = fast-follow) | **P1** | OPEN | zoning providers, `JurisdictionZoningContract` packs | C58 (NEW), L-373 | 4–7 (DK) | L-398a schemas |
| **L-400** | Parcel Data Layer completion — lift shipped Catastro provider to `@pryzm/site-parcel-data` (L2); DkParcelProvider (Matriklen, server-side Datafordeler key) | P2 | OPEN | `apps/editor/src/ui/site/parcel/` → L2; `server/parcelZoningProxy.js` clone | **C57 (NEW)**, C12, C19 | 3–5 (DK) | L-403 (C57 skeleton) |
| **L-401** | Envelope → authoring constraint bridge (inset + maxHeight + permitted-use → generators / typology-pipeline) | **P1** | OPEN | `generateResidentialFromBoundary`, `@pryzm/typology-pipeline`, house/apartment/resi generators | C19 §1.6, C50, C53 | 5–8 | L-398 |
| **L-402** | Compliance "explain-why" report + 3D envelope volume render | **P1** | OPEN | report artefact (reuse `buildPlanGraphOverlaySvg`), Cesium/renderer 3D volume | SPEC-COMPLIANCE-REPORT (NEW), C23, L-373, C04/C18 | 5–8 | L-398 (report needs an envelope) |
| **L-404** | Denmark demo-fidelity — LOD2 3D-Tiles + DHM terrain (executes L-383a–e) | P2 | OPEN | offline-bake toolchain (GDAL/citygml-tools/tyler/ctb); Cesium tileset+terrain seams | extends L-383; C12, C55 | M–L (offline) | independent — **CUT to fast-follow** |

**Compliance subtotal (September DK-only, L-403+L-398+L-399(DK)+L-400(DK)+L-401+L-402):** ~30–48 dev-days on a strict
serial spine (see §3). This is the ~8–11 dev-week figure from the Archistar audit §5.4, expressed as a schedulable list.

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

```
                          ┌─────────────── LAUNCH SPINE (gates GA) ───────────────┐
 L-388 (green gate) ──┐   L-334 ─→ L-360 ─(reconcile R-E)─┐
 L-387 (deps) ────────┼─→                                 ├─→  L-391 P1 (deploy+auth+Fly, R-A/R-B/R-C)
 L-394/L-395/L-392 ───┘   L-85 f/u ──────────────────────┘         │
                                                                    ▼
                                                          L-391 P2 (authoritative, R-D)  ← also unblocks L-53
                                                                    │
                                                                    ▼
                                                          L-391 P3 (two-browser E2E gate)
                                                                    │
                                                    ┌───────────────┴──── production flip (founder) = GA-collab
 L-397 (pricing, founder) ─→ L-396 (durability) ────┘

                          ┌───────────── COMPLIANCE SPINE (CF-1 pillar, dark/flagged) ────────────┐
 L-188 (site data survives reopen) ═══PREREQUISITE═══▶ everything below
 L-403 (C57/C58 skeleton) ─→ L-398a (schemas+Turf) ─→ L-398b/c/d (solver) ─→ L-401 (authoring bridge) ─→ demo
                                        │                       │
                                        │                       └─→ L-402 (report + 3D volume; needs Forma/Cesium view L-355/L-183 healthy)
                                        └─→ L-399 (DkZoningProvider + da-* pack)  L-400 (DkParcelProvider, key)
 (independent, CUT to fast-follow) L-404 (LOD2+terrain)   ·   L-393 (interop round-trip, independent)

 G0-CONTRACTS gate (blocks GA): C08 ACTIVE ⇐ L-391+L-53+L-335 · C22-min ACTIVE ⇐ L-345 (GDPR) · C48-min ⇐ L-344 · C10 ⇐ L-341 · C13 ⇐ L-342
```

**Two critical paths converge on the September date — the founder's hypothesis is essentially correct, with one
refinement:**

1. **Blocker critical path — `L-334 → L-360 → L-391 P1 → P2 → P3 → production flip`.** ~24–35 dev-days of code, **but
   its true length is calendar-latency, not dev-days**: Phases 1–3 are strictly serial and gated by **five human/infra
   ratification points** (R-A protocol, R-B ws-auth, R-C Fly infra + billing, R-D one-authority reconciliation, R-E Yjs
   durability↔snapshot reconciliation) that **cannot be parallelized or bought down with more engineers**. R-E explicitly
   couples L-391 to L-334/L-85 (a CRDT merge that drops elements must be caught by snapshot element-count
   reconciliation). **This is the critical path for *launching at all*.**
2. **Compliance critical path — `L-403 (C58) → L-398 solver → L-401 authoring bridge → L-402 report`.** ~23–36 dev-days
   on a **strict serial chain** (each stage consumes the previous stage's output, and L-398/L-401/L-402 all touch the
   same new packages, so they cannot be meaningfully parallelized across engineers). **This is the critical path for the
   *new pillar*, and it is the longest net-new build in the program.**

**Two prerequisites gate the compliance spine before its own chain even starts:** (i) **L-188** — if GIS/site data does
not survive a close+reopen, the entire parcel→envelope→persist loop is moot, so L-188 must close *before* the compliance
demo is credible; (ii) the **WebGPU device-loss cluster (L-361–366)** — the 3D envelope render (L-402b) rides the same
Forma/Cesium/renderer path that L-183 (globe crash) and L-355 (slow load) still afflict, so the render surface must be
healthy first. Neither is on the compliance track's own critical chain, but both are hard upstream gates.

**The single critical path that sets the September date** is **the compliance chain `L-403 → L-398 → L-401 → L-402`**
*if compliance stays in scope* — it is the longest serial build and it is net-new (no existing code to lean on for the
solver itself). **The launch itself, however, is gated by the blocker chain (L-334 + L-391) regardless of compliance.**
Refinement to the stated hypothesis: it is not "contracts → envelope → bridge" *vs* "L-391" — **both are critical, in
different senses**: L-391 gates *whether we may launch*; the compliance chain gates *whether the CF-1 pillar is in the
launch*. The honest consequence: **if the two chains contend for the same engineers, compliance slips first** (§1 cut
list), because the launch cannot slip and L-391's latency floor is human-ratification-bound.

---

## §4 — Parallelization & collision map (where work happens between the pipelines)

**Delivery model (existing, from the implementation plan):** up to **6 agents in parallel, one issue each, in isolated
git worktrees → merge → gate on `pryzm.fly.dev` (root `tsc --skipLibCheck --noEmit` = exit 0) → push.** This plan
adopts it unchanged. The MEMORY mandate on multi-agent shared-tree collisions applies: **agents commit scoped CODE only;
the orchestrator owns the master audit/plan/logs docs; explicit per-agent file fences; verify integrity before push.**

### §4.1 — Tracks that run TRULY concurrently (disjoint subsystems/files)

| Track | Owns (files/packages) | Why isolated |
|---|---|---|
| **T1 — Data integrity** (L-334/L-360/L-85) | persistence save path, `ServerSyncQueue`, `server.js` save/validate | Server-side; no overlap with client render/collab hot path |
| **T2 — Collab infra** (L-391 P1) | `apps/sync-server`, `fly.toml`/`Dockerfile` (PROPOSED), `sync-client` provider seam | New service + infra; touches `engineLauncher.ts` only at the already-carved `connectCrdtProvider` seam |
| **T3 — Security/deps/gate/privacy** (L-387/L-388/L-394/L-395/L-392/**L-345**) | lockfile, CI config, test suites, migration script, embed route, C22 privacy substrate | Cross-cutting but mostly config/test files; L-345 (GDPR) adds new privacy modules — isolated |
| **T8 — Render stability** (L-361–366, L-183/L-355) | renderer-three, RenderPipelineManager, Forma/Cesium view | **Serialize against RenderPipelineManager owners** (per the plan, L-205 owns `§FIX-SHADOW-PASS-SINGLE-OWNER`); the 3D envelope render (L-402b) depends on this being healthy |
| **T4 — Compliance engine** (L-398/L-399) | **new** `@pryzm/*` L2 zoning package + provider adapters | Net-new packages; imports nothing the launch touches |
| **T5 — Parcel data layer** (L-400) | **new** `@pryzm/site-parcel-data` (L2) + `parcelZoningProxy.js` clone | Net-new package + server route; isolated |
| **T6 — Governance** (L-403) | `docs/` contracts/SPECs/ADRs, C00 index | Docs only; **orchestrator-adjacent — serialize against the master-doc editors** |
| **T7 — Interop** (L-393) | file-format round-trip harness | Independent test harness |

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

- **One worktree per track T1–T7**, branched off `main` (or the current integration branch). Net-new packages (T4/T5)
  are collision-free by construction — they add files, import nothing the launch imports, and can develop full-speed in
  parallel from day one.
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

Two parallel workstreams throughout: **Blocker spine** (must-close, sets GA) and **Compliance spine** (dark/flagged,
CF-1). Ratification gates placed where they unblock. Weeks are calendar; "day and night" compresses dev-days within a
week but **cannot compress the serial ratification latency** — hence R-gates front-loaded.

| Week | Blocker spine (Pipeline A-blocker) | Compliance spine (A-compliance / B) | Ratification / decision gates |
|---|---|---|---|
| **W1 (Jul 21)** | **L-360** checksum-never-brick design + fix start (live P0); **L-361–366** WebGPU device-loss **live-confirm on real hardware**; L-388/L-204 green CI gate; L-387 dep triage. **Front-load R-A/R-B/R-C** for L-391. | L-403 finish C57/C58 skeleton + SPEC stubs; L-398a schemas (`BuildableEnvelope`/`JurisdictionZoningContract`) + Turf dep (lockfile-synced); L-400a `@pryzm/site-parcel-data` shell; **L-188 site-persistence fix (compliance prerequisite) start**. | **R-A** protocol; **R-C** Fly infra/billing; **L-397 pricing (founder)**. |
| **W2 (Jul 28)** | L-360 landed; **L-361–366 harden/confirm**; **L-345 GDPR/C22-min** (consent + DSAR + storage routing) start; L-391 **P1** deploy sync-server + ws-auth (R-B) in **staging**. | L-398b/c ZoningRulesEngine core (parcel⊖setbacks inset + area×maxHeight) + two-fidelity resolution; L-399 DkZoningProvider (Plandata) start; **L-188 landed**. | **R-B** ws-auth model. |
| **W3 (Aug 4)** | L-345 GDPR/C22-min continue; L-391 P1 staging two-browser smoke; L-394 migration test; L-395 embed token; L-85 carry-through follow-ups. | L-398d wire engine→`site.updateZoning`; L-399 DkZoningProvider done + `da-*` curated pack; L-400b DkParcelProvider (Datafordeler key) staging. | Datafordeler service-user **key wiring** (server-side). |
| **W4 (Aug 11)** | L-391 **P2** make CRDT authoritative + retire silent LWW (R-D); L-85 carry-through follow-ups; L-53 unblocked by P2. | L-401 authoring bridge — thread inset+maxHeight into `generateResidentialFromBoundary`/typology-pipeline; containment assertion test. | **R-D** one-authority (socket.io demotion). |
| **W5 (Aug 18)** | L-391 **P3** two-browser E2E gate (dropped-ws / two-users-same-element / 60s-offline); L-396 durability + DR restore drill. **R-E** Yjs↔snapshot reconciliation (ties L-334). | L-401 done; L-402 explain-why report artefact (reuse `buildPlanGraphOverlaySvg`) + provenance chips. | **R-E** durability reconciliation. |
| **W6 (Aug 25)** | L-392 observability spans; L-393 interop round-trip harness + adversarial malformed-file; blocker regression hardening. | L-402 3D translucent envelope volume render + **CI fidelity-label gate** (L-373); Denmark end-to-end dry-run (parcel→zoning→envelope→generated building fits). | — |
| **W7 (Sep 1)** | **Blocker close-out**: all P0/P1 green on `pryzm.fly.dev`; **G0-CONTRACTS gate ACTIVE** (C08/C10/C13/C48-min/C22-min); L-391 **production flip** after E2E gate (founder). GA-candidate. | Denmark compliance demo polish (behind flag); honest-messaging copy review. | **Production `VITE_COLLAB_CRDT=true` flip (founder)**. |
| **W8 (Sep 8, buffer)** | Regression buffer; DR drill re-run; launch-readiness sign-off. | Flip DK compliance flag ON for demo; fast-follow backlog framing (Spain/CH/L-404). | GA sign-off. |

**Where the pipelines meet:** the blocker spine and compliance spine share **only** the persistence/durability seam
(L-334 ↔ L-391 R-E, W5) and the composition root (L-391 provider wiring vs L-401 generator wiring). Both are serialized
per §4.2 into the same W4–W5 window under one integration worktree. Everything else runs on disjoint files.

---

## §7 — Risk register (ranked)

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| **R1** | **Compliance work starves the P0 data-integrity/collab blockers.** The CF-1 pillar is exciting and net-new; the P0 blockers are unglamorous and hard. Pulling engineers to compliance slips L-334/L-391 → **no launchable product.** | **Critical** | Hard fence: **P0 blockers are non-negotiable and staffed first every week.** Compliance ships dark behind a flag and NEVER gates GA (Archistar §5.2). If W-by-W contention arises, compliance slips (§1 cut list), launch does not. Orchestrator tracks blocker burn-down as the primary metric. |
| **R2** | **L-391 human/infra ratification latency (R-A..R-E) + L-397 pricing decision** — calendar cost not solvable by code or more people; a late R-C (Fly billing) or R-D can push the production flip past September. | **High** | **Front-load all R-gates into W1–W2** (§6). Production stays flag-OFF (socket.io) until Phase-3 E2E passes, so a late flip degrades to "collab beta" not "no launch". Founder decisions (R-C billing, L-397 pricing, production flip) surfaced W1. |
| **R3** | **Compliance data reality** — numeric rules PDF-trapped everywhere except Denmark; Datafordeler key-gating; curation long-tail (Archistar §2). A DK-only scope that quietly assumes Spain/CH parity would be dishonest and unbuildable in September. | **High** | **September = Denmark only** (structured Plandata, least curation). `estimated-ruleset` NEVER shown authoritative (L-373 CI gate). Spain/CH explicitly cut to fast-follow (§1). Datafordeler key server-side only; keyless mirror fallback noted. |
| **R4** | **L-360 checksum bricks valid projects** — L-334's checksum is computed pre-compression at save and verified post-decompression at load; the codec is not bit-exact, so valid projects hard-refuse to load. This is a **live P0 regression**, not hypothetical. | **Critical** | Round-trip-stable checksum + **never hard-brick** (load best-effort + warn); large-project fixture in the gate; ties L-391 R-E element-count reconciliation. |
| **R4b** | **WebGPU device-loss (L-361–366) makes project creation itself fail** on some hardware — several fixes are "implemented, awaiting live confirmation", i.e. *unconfirmed*. If unconfirmed on the founder's Windows box, GA has no product to launch. | **Critical** | Live-confirm on real hardware early (W1–W2); WebGL is the stable demo backend on this box (MEMORY); auto-fallback must fire for real buildings. Blocks the 3D envelope render (L-402b) too. |
| **R4c** | **GDPR/C22 (L-345) unbuilt for an EU (Denmark-first) launch** — a compliance pillar aimed at Denmark makes C22-min ACTIVE a hard G0-CONTRACTS gate; shipping EU-facing without DSAR/consent/anonymise is a legal, not just technical, blocker. | High | Scope C22-min (consent + DSAR + storage routing) into the blocker track W2–W4; do not let the compliance pillar's EU framing outrun the privacy substrate. |
| **R5** | **Multi-agent shared-tree collisions** on composition root / persistence / master docs (MEMORY hazard). | Medium | §4.2 serialization + §4.3 worktree isolation; agents commit scoped CODE only; orchestrator owns master docs; integrity-verify before push. |
| **R6** | **Interop (L-393) surfaces a real IFC/DXF/Rhino fidelity defect late** — round-trip is UNVERIFIED, so an unknown-unknown could appear in W6. | Medium | Run the round-trip harness **early (W6 start, not end)**; if a defect surfaces, it is a fast-follow fix, not a launch blocker (interop is P1 credibility, not P0 data-integrity). |
| **R7** | **Fly build hard-fails on lockfile/tsc drift** from the net-new packages (MEMORY: stricter root tsc, lockfile sync). | Medium | Root `tsc --skipLibCheck` + lockfile sync in every `packages/*` PR; Turf dep synced in L-398a's own PR. |
| **R8** | **Scope creep on the compliance report** (L-402) toward full Archistar-parity packaging. | Low-Med | SPEC-COMPLIANCE-REPORT scopes September to explain-why + provenance + 3D volume; check-back (G-ENG-5) explicitly out. |

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
- **L-399c** — `MucZoningProvider` (Catalonia MUC zone class) + curated `es-barcelona` pack. **FAST-FOLLOW (post-Sept).**
  *(C58)*

**L-400 → parcel data layer sub-items:**
- **L-400a** — Lift shipped Catastro provider to `@pryzm/site-parcel-data` (L2) + `ParcelProvider` registry. *(C57; C12)*
- **L-400b** — `DkParcelProvider` (Matriklen via server-side Datafordeler key in the proxy clone). *(C57)*
- *(OerebParcelProvider CH — fast-follow, out of September.)*

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

**L-404** — already decomposed as L-383a–e (LOD2 3D-Tiles + DHM terrain + Matriklen keyed parcel). **CUT to fast-follow;
schedule after the September GA.**

---

## §9 — Verdict summary (for the founder)

- **Fit:** **FITS-WITH-NAMED-CUTS.** All P0/P1 launch blockers + **Denmark-only** compliance end-to-end (envelope
  provably constrains generation) fit ~7–8 weeks of day-and-night. **Spain compliance breadth, Switzerland, and the
  Denmark LOD2 demo-fidelity are honest fast-follow** — in scope would break the calendar and the honesty mandate.
- **Single critical path:** the **compliance chain `L-403 (C58) → L-398 solver → L-401 bridge → L-402 report`** is the
  longest net-new serial build and sets the pillar date; the **blocker chain `L-334/L-360 → L-391 P1→P2→P3 → flip`**
  gates *whether we launch at all* and is bounded by human ratification latency (R-A..R-E), not dev-days. Both are
  critical; they contend only at the persistence/composition-root seam (W4–W5) and are serialized there.
- **Top 3 leverage wins:** (1) the site-commit spine (`buildBoundaryFromLatLonRing` → `site.parcel-boundary-set` +
  `site.updateZoning` + C19 `Parcel` fields) is already the wired destination — the solver plugs in with zero new
  persistence; (2) the Catastro keyless proxy + `ParcelProvider` seam makes every jurisdiction an adapter swap; (3) the
  shipped generators + typology-pipeline are the moat — L-401 is a thin inset+cap connector, and `@pryzm/solar-analysis`
  is the deterministic-analysis precedent for L-398.
- **Top 3 risks:** (1) **compliance starving the P0 blockers** → hard fence, blockers first, compliance dark/flagged;
  (2) **the P0 surface is larger and partly *unconfirmed* than the named list** — L-360 checksum bricks valid projects
  (live), L-361–366 WebGPU device-loss can make project creation itself fail ("implemented, awaiting live confirmation"),
  L-345 GDPR/C22 is unbuilt for an EU pillar → confirm/close these early (W1–W2), WebGL as the stable demo backend;
  (3) **L-391 ratification + pricing latency** (R-A..R-E, L-397) → front-load all R-gates into W1–W2, production stays
  flag-OFF until the Phase-3 E2E gate.

*End of program plan. No code was modified, no contract was flipped, no master tracker/plan was edited in producing this
document.*
