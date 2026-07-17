# ADR-0027 — Furniture multi-representation model

- Status: **Accepted** (2026-04-27)
- Sprint: **S27** (Phase 2A — non-element-family completion, M14)
- Authors: PRYZM 2 BIM rebuild
- Related: ADR-0009 (frozen producer signature), ADR-0017 (headless package surface), ADR-0023 (S26 second-tier triage), `docs/03-execution/plans/legacy/phases/PHASE-2/2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S27

---

## Context

S27 delivers the headline **Contract 48** ("the sofa with 5 representations") as the first
*multi-representation* element family in PRYZM 2.  Furniture differs from every prior family
in that the producer's output geometry depends on a runtime LOD selector (`activeLod`) rather
than purely on dimensional / topological DTO fields.

Three sub-decisions need an architectural answer before the producer / plugin can be written:

1. **Where do the representation geometries live?**  Two options:
   - **(a) On the DTO itself**, as a per-LOD record — every furniture instance carries its
     own copy of all 5 representations.
   - **(b) In a side-table** (`FurnitureCatalogue`), keyed by `catalogId`, with the DTO
     holding only the catalog id.
2. **What happens when the requested LOD has no representation?**  Fall back, throw, or
     render an empty mesh?
3. **Who owns the auto-LOD switching policy** (distance-based, scene-density-based, …)?

## Decision

### §1. Five LOD levels, frozen at S27

| Code | Name | Triangle budget | Use case |
|---|---|---|---|
| **R0** | plan-symbol | <50 lines (2D) | plan-view symbol projection (S29+) |
| **R1** | schematic-box | ~12 (1 cube) | fast orbit / massing studies |
| **R2** | simplified | ~200 | default 3D view, ≥50 visible furniture items |
| **R3** | medium | ~2,000 | 3D view, <50 visible furniture items |
| **R4** | full | ~20,000 | close-up renders, AI training, IFC export |

The numbers are budget targets, not hard caps — the producer never inspects them, but the
dynamic catalogue editor (S58) will warn authors who exceed budget.

### §2. Representations live on the DTO (Option A)

**Decision: Option A.**  Each furniture instance carries its own `representations: { 0?, 1?, 2?, 3?, 4? }`
record.

**Rationale (the architectural cost trade-off):**

- **BIM-purity wins.**  ADR-0017 mandates that the headless surface be self-contained — no
  hidden runtime side-tables, no implicit catalogue lookups inside the producer.  Option B
  would require the producer to reach across to a separate `FurnitureCatalogue` store,
  breaking K1B-2 ("each plugin owns its store") and complicating the bake worker (which
  would need to ship the catalogue alongside every project).
- **Memory is not the bottleneck.**  Even at 20 k triangles for R4, a single furniture DTO
  is ~1.5 MB worst-case; a typical project has ≤200 furniture items → ~300 MB.  This is
  amortised by the chunk packer (Phase 1D) and tier-streamed loader, which only deserialises
  the LODs visible at the active wave.
- **Catalogue-as-source-of-truth still works.**  At `furniture.create` time, the handler
  copies the catalogue entry's representations into the new DTO.  Subsequent edits never
  consult the catalogue again — the DTO is fully self-describing for IFC export, undo, and
  multi-user merge.

This is the first PRYZM 2 element where the DTO carries embedded geometry; the precedent
is **bounded to furniture** (the only element with multi-representation semantics today).

### §3. Fallback ladder when `activeLod` has no representation

```
R2 (simplified — preferred default)
  ↓ if missing
R3 (medium)
  ↓
R1 (schematic-box)
  ↓
R4 (full)
  ↓
R0 (plan-symbol)
  ↓
empty descriptor (zero-vertex group → committer hides the mesh)
```

The producer **never throws** on a missing LOD — it walks the ladder and emits an empty
descriptor as the terminal fallback.  This contrasts with ADR-0022's room-boundary
behaviour (which throws `DescriptorInvariantError` for unenclosed seeds), because furniture
LOD absence is a normal authoring state (catalog entries can opt out of cheap LODs), while
unenclosed rooms are an authoring error.

### §4. Auto-LOD policy is out-of-scope for S27

The plugin exposes only the **imperative** `furniture.setActiveLod` command.  Distance-based
auto-LOD switching (the S27 phase doc's "auto-LOD based on distance" feature) is a host-scene
concern: it requires a `camera.position` reading per frame, which lives above the headless
plugin layer.  A future S31+ scene-orchestrator sprint will subscribe to the camera and
issue batched `setActiveLod` commands marked `ephemeral: true` (per the linearisation
contract).

This split lets the headless half (which is what S27 ships) be pure and fully testable
without a 3D scene present.

### §5. Catalogue is a static asset; the headless host is a typed in-memory wrapper

**v1 catalogue (S27):** a small in-memory seed list lives in `plugins/furniture/src/catalogue/seed.ts`
(3 entries — chair, sofa, table — with stub representations).  This is enough to satisfy the
phase's "carousel loads and filters" exit criterion at the headless level.

**v2 catalogue (S58):** the dynamic component editor will let authors create / edit catalog
entries; the headless host gains `addEntry(...)` / `removeEntry(...)` mutators.

**v3 catalogue (S70-tier Plugin SDK):** third-party catalogue providers register via the
plugin descriptor.

In all three versions, the plugin's `FurnitureCatalogue` class exposes the same surface:
`list() / filter(query) / find(id) / select(id)` — the DOM carousel (deferred to a UI
sprint) is a thin adapter.

### §6. Hash includes `activeLod`

`composeFurnitureGeometryHash` carries `activeLod` as a first-class hash component, plus a
cheap content fingerprint of the active representation (positions length + first vertex +
last vertex).  This guarantees:

- LOD swaps invalidate the chunk cache → committer rebuilds the mesh.
- Two furniture instances with the same catalogId at different positions have distinct
  hashes (position is in the hash too).
- Catalog edits (S58+) that change representation geometry will produce a new fingerprint
  → cache invalidation without manual versioning.

## Consequences

- **Bounded budget**: the K1-C ≤3-day per-family budget is comfortable for furniture
  because the producer is small (~140 lines, no profile dispatch, no join logic) and the
  schema extension is minimal.
- **Bake-worker compatibility**: representations on the DTO means the bake worker
  needs no special "catalogue lookup" path — same producer signature as every other family.
- **Carousel UI is a follow-up**: the headless `FurnitureCatalogue` host is fully tested in
  S27; the DOM binding is left to the editor app sprint.

## Carry-overs (none)

S27 has no S26 carry-over deferred to S28.

## Notes for future ADRs

When the dynamic component editor lands (S58), this ADR's §5 will need a follow-up note
adding the mutator surface to `FurnitureCatalogue`.  The §2 decision to embed representations
on the DTO will be revisited at that point — if catalog entries grow significantly larger
than the 20 k triangle R4 estimate, a hybrid model (DTO holds chunk-keyed references,
representations stream from R2) may become necessary.  Until then the DTO-embedded model
is correct.
