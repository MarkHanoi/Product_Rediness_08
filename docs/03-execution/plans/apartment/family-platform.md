# APARTMENT — Family Platform & User-Defined Elements (Strategic Architecture Review)

Status: **Strategy document, 2026-05-30.** This doc is **inserted as Phase P0** in front of every F-tier (F0–F8) and L-tier (L0–L7) row of the master apartment plan ([APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md)). It does not stop F-tier work — it sets the architectural direction so each subsequent F-tier subphase additively converges toward the User-Defined Element Platform rather than away from it.

Sibling architecture docs (read these first if you haven't):

- [APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) — the LIVE-EDIT axis (data-model maturity stages BIM 1 → 2 → 3)
- [APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-COGNITION-STACK-AND-IMPLEMENTATION-PLAN-2026-05-29.md) — the SOLVER-INTELLIGENCE axis (Phase 1 → 3 cognition layers)
- [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md) — the master ordered tier table (F0–F8 furniture, L0–L7 cognition)

Governing C-contracts (binding):

- [C03 Schemas, Commands & State](../00_Contracts/C03-SCHEMAS-COMMANDS-AND-STATE.md) — P5 schema purity, P6 commands-as-mutation
- [C11 Element Creation Pipeline](../00_Contracts/C11-ELEMENT-CREATION-PIPELINE.md) — the polymorphic create pipeline (already element-type-agnostic)
- [C16 Command Authoring](../00_Contracts/C16-COMMAND-AUTHORING.md) — how new commands are authored
- [C09 §3.4 AI workflows](../00_Contracts/C09-AI-AND-VISIBILITY-INTENT.md) — the apartment workflow pattern

---

## §0 — Why this doc exists

The current F-tier discipline assumes a developer flow:

```
Developer → adds to FurnitureType union → writes builder → adds factory arm → wires archetype → ships
```

This is correct for *today*. It is wrong as the **only** path *forever*. The long-term BIM 2.0 / 3.0 vision requires the inverse flow:

```
User / AI / Developer → submits Family Request →
  Family Generation Pipeline → Registry → all downstream systems auto-discover
```

Without this doc, every F-tier subphase quietly hardens the static-enum assumption, accumulating future migration debt. With it, each new F-tier ship is structured so the SAME ship that adds (say) `desk` to the union also nudges the system one click closer to *not needing the union at all*.

---

## §1 — The full element lifecycle (current vs target)

### Current lifecycle (BIM 1.5 — static developer flow)

```
                                        ← developer edits source
FurnitureType union ────────────────────┐
FurnitureCategoryMap ───────────────────┤
Builder class (DeskBuilder.ts) ─────────┤
FurnitureFactory switch arm ────────────┤
Plan-symbol builder ────────────────────┤
ai-host FurnitureKind union ────────────┤
footprints.ts entry ────────────────────┤  rebuild + redeploy
archetypes.ts entry ────────────────────┤  before any user can
programRules.ts furnitureSpec ──────────┤  request the type
IFC reader / pset mapping ──────────────┤
schemas/Furniture.ts (catalogue seed) ──┤
PropertyDescriptorGenerator SCHEMAS ────┤
…22 more obligations…                   │
                                        ┘
```

24 hand-authored obligations per renderable type (the F-tier §0.1 ladder). At 3–5 dev-days per type, the catalogue plateaus around ~200 types.

### Target lifecycle (BIM 3.0 — user-defined family flow)

```
User uploads FamilyRequest (photos, sketches, dimensions, constraints, BIM meta)
              ↓
Stage 1: Ingestion → FamilyDefinition (canonical structured form)
              ↓
Stage 2: Parametric decomposition → ParametricFamilySchema
              ↓
Stage 3: Geometry synthesis → 3D builder + 2D plan symbol + footprint
              ↓
Stage 4: Data model → auto-generated Zod schema + command schemas
              ↓
Stage 5: Registration into FamilyRegistry (single source of truth)
              ↓
              ↓── all downstream systems consume the Registry ──
              ↓
   ┌──────────┴──────────┬──────────────┬──────────────┐
   ↓                     ↓              ↓              ↓
AI dispatch        Property panels   IFC export    Schedules
(auto-discovery)   (auto-rendered)   (auto-mapped) (auto-listed)
```

Zero developer edits required for a new family. The catalogue scales with users, not engineering time.

---

## §2 — Audit: what already exists in PRYZM

The good news from the 2026-05-30 audit: **the bones for the future architecture already exist** in several layers. The remaining work is mostly *making the static surfaces match the already-dynamic ones* rather than rewriting the architecture from scratch.

| Surface | Today's state | Distance to target |
|---|---|---|
| **Command bus & handlers** | Fully registry-based; commands route through `commandBus.dispatch()`; new types auto-dispatch if their handler is registered | **0 — already dynamic.** A user-defined family's create-command works the moment its handler lands. |
| **C11 element-creation pipeline** | Polymorphic; identical pipeline for every one of the 21 element types | **0 — already dynamic.** Documented as the canonical, type-agnostic pipeline. |
| **Persistence / project loader** | Reconstructs by **replaying commands**, no fixed type universe | **0 — already dynamic.** The loader trusts the command registry; new types load if their command is registered. |
| **AI dispatch** | Workflow coordinators dispatch typed batch commands through the bus | **Low.** New types work if their batch handlers are registered. Only the prompt-side `archetypes.ts` data is hand-authored. |
| **Property panel rendering** | Generic schema-to-UI engine; `PropertyDescriptorGenerator` is *fully generic* | **Low.** The renderer is dynamic; only the `SCHEMAS` map (the schema lookup) is hardcoded — needs a registry. |
| **`FurnitureCategoryRegistry`** | Runtime `TYPE_TO_DESCRIPTOR_MAP` built from static data files; `ai_element` + `glb_import` types already represent *parameterised* furniture flowing through this registry | **Low–medium.** Already half-dynamic. The MISSING piece is the type discriminator (must be pre-declared in the union). |
| **Plugin marketplace** | Manifest schema designed (`packages/plugin-sdk/src/descriptor.ts`) with `element-type` contribution kind + `familyFile` path. Runtime side is stub. | **Medium.** Designed, not yet operational. ADR-0038 froze the manifest at v1.0 — the contract is in place. |
| **CREATE panel / batch catalogue** | Static `batchCatalogue.ts` with 43 hand-imported entries | **Medium.** DI-clean but needs plugin-contribution hook. |
| **Schemas (`packages/schemas/`)** | `SCHEMA_REGISTRY` is a hardcoded object of 23 imports | **Medium.** Pattern is right (registry shape); just needs to accept runtime additions. |
| **IFC export readers** | 13 type-specific reader classes; `FragmentReader` switches on element type | **Medium-high.** Hardcoded dispatch. Needs reader-discovery API; per-type readers stay (specialised serialisation) but new ones registered at runtime. |
| **Schedule / quantity** | `ScheduleStore` with a per-type fixed list | **High.** Probable hard-coded type universe — full audit pending. |
| **`FurnitureType` union** | Static TypeScript union, locked at compile time | **High.** The dominant blocker. The whole F-tier ladder revolves around extending this. |

**Bottom line.** Six surfaces are already dynamic enough to absorb new types today (command bus, C11 pipeline, persistence loader, AI dispatch, property panel renderer, FurnitureCategoryRegistry). Six need migration to a registry pattern (schemas, IFC readers, batch catalogue, schedules, plus the FurnitureType union itself and the plugin marketplace's runtime side).

---

## §3 — The FamilyRequest concept (NEW first-class entity)

A `FamilyRequest` is the user-facing artefact that triggers the whole pipeline. Authored through the UI or imported from disk (`.pryzm-family` JSON bundle).

```
FamilyRequest {
  identity:       { id, name, version, author, license }
  documentation:  { pdfs[], specSheets[], referenceImages[] }
  geometry:       { dimensions, parametricRanges, hostedRelationships }
  behaviour:      { movable, hosted, mountClass: 'floor'|'wall'|'ceiling'|'embedded' }
  constraints:    { minWidth, maxWidth, minDepth, maxDepth, … }
  bim:            { ifcEntityType, ifcPredefinedType, classification }
  placement:      { defaultAnchor, allowedAnchors[], excludeWalls[] }
  materials:      { defaultPalette, allowedSlots[] }
  ai:             { semanticNames[], synonyms[], cuesForPrompts[] }
}
```

Stage 1 of the Family Generation Pipeline (§4) parses any of the input formats into this canonical shape; downstream stages know nothing about the inputs, only the canonical form.

---

## §4 — The Family Generation Pipeline (Stage 1–8)

Each stage is a pure transform from one shape to another; the pipeline is composable and idempotent.

```
FamilyRequest
   │
   ▼  Stage 1 — Ingestion (parse, OCR, image-to-geometry, dimension extraction)
FamilyDefinition (canonical)
   │
   ▼  Stage 2 — Parametric decomposition (identify primitives + variable axes)
ParametricFamilySchema
   │
   ▼  Stage 3 — Geometry synthesis (3D builder + 2D plan symbol + footprint table)
GeneratedGeometry
   │
   ▼  Stage 4 — Data model (auto-Zod schema + command-payload schema)
GeneratedSchemas
   │
   ▼  Stage 5 — Registration (FamilyRegistry insert)
RegisteredFamily
   │
   ▼  Stage 6 — AI integration (semantic vocab + prompt cues + dispatch routing)
AIVocabularyDelta
   │
   ▼  Stage 7 — UI integration (create panel + property descriptors)
UISurfaceDelta
   │
   ▼  Stage 8 — BIM integration (IFC mapping + schedule columns + quantity formulas)
BIMSurfaceDelta
```

Each stage emits a **delta** that downstream consumers apply additively. Stages 5–8 are runtime; no rebuild required.

---

## §5 — Universal element contracts (replaces the F-tier 24-row ladder per-discipline)

The current F-tier §0.1 ladder is a **furniture-specific contract**. Generalising it produces a **universal element contract** that works for any element kind (furniture, fixture, opening, joinery, MEP, structural, custom). Same 24 rows, different per-discipline file paths.

| # | Universal obligation | Applies to |
|---|---|---|
| 1 | Zod schema entry | every element kind |
| 2 | Type discriminator (union member OR FamilyRegistry id) | every element kind |
| 3 | Category mapping | every element kind |
| 4 | 3D geometry builder | every element kind that renders |
| 5 | 2D plan-symbol builder | every element kind that appears in plan view |
| 6 | Factory dispatch arm OR registry lookup | every element kind |
| 7 | Command bus create/update/remove | every element kind that mutates state |
| 8 | Plan-view projection cache entry | every visible element kind |
| 9 | Snapshot round-trip | every element kind that persists |
| 10 | CRDT replication | every element kind in shared projects |
| 11 | ADR-051 single-store undo | every mutating element kind |
| 12 | IFC export mapping | every element kind that exports |
| 13 | Selection + hover behaviour | every visible element kind |
| 14 | Visibility intent rules | every element kind in views |
| 15 | Material + system-type registration | every element kind with materials |
| 16 | OpenTelemetry span (P8) | every element kind at create boundary |
| 17 | Typed window globals (P4) | rare; only when escapes scope |
| 18 | Pure-engine kind union (ai-host) | every element kind used by AI workflows |
| 19 | Footprint entry (placement metadata) | every element kind the auto-pipeline places |
| 20 | Archetype wiring | every element kind used in auto-furnish |
| 21 | Program-rules entry | every element kind with per-room semantics |
| 22 | Consistency test | every element kind in archetypes |
| 23 | Unit tests (builder + plan + factory + Zod + IFC) | every element kind |
| 24 | User-guide entry | every user-facing element kind |

**The 24 rows are the same.** What changes between F-tier (today) and Family Platform (target) is **WHO authors each row**: developer (today) vs the Family Generation Pipeline (target). Rows 1, 4, 5 are pipeline-generated in the future; rows 22, 23, 24 are pipeline-validated; rows 6–17 are pipeline-registered into existing registries.

---

## §6 — The FamilyRegistry (NEW substrate)

A new top-level concept. Single source of truth for every element family ever registered (developer-shipped catalogue + user-defined + plugin-marketplace + AI-generated).

```
FamilyRegistry {
  byId:        Map<FamilyId, RegisteredFamily>
  byCategory:  Map<Category, FamilyId[]>
  byOccupancy: Map<OccupancyType, FamilyId[]>
  byMountClass: Map<MountClass, FamilyId[]>
  byTag:       Map<string, FamilyId[]>
}

RegisteredFamily {
  identity:        FamilyIdentity
  schema:          ZodSchema
  builderRef:      string                // dynamic-import path or inline factory
  planSymbolRef:   string
  footprint:       Footprint
  archetypeHints:  { occupancy, anchor, group }[]
  ifcMapping:      { entityType, predefinedType, psets }
  uiDescriptor:    PropertyDescriptorSet
  aiVocabulary:    { primaryName, synonyms, semanticTags }
  permissions:     { manualPlacement, aiPlacement, batchOps }
  origin:          'core' | 'plugin' | 'user' | 'ai-generated'
}
```

**Layer placement.** L0 schemas package (P5 pure). Read by every higher layer; written only by the Family Generation Pipeline.

**Backward compat.** Today's hardcoded `FurnitureType` union becomes the `core` origin entries in the registry — pre-registered at composition root. Existing call sites that switch on `FurnitureType` keep working unchanged. New consumers consult the registry.

---

## §7 — AI command generation from the registry

This is the critical inversion. Today: AI workflows hand-author archetypes for every type. Target: AI workflows **discover** the type universe from `FamilyRegistry`.

```
User: "place two desks"
   │
   ▼ AI workflow parses intent → resolves "desk" via FamilyRegistry.aiVocabulary
   ▼ Finds registered family family/com.pryzm.core/desk
   ▼ Reads family.schema, family.footprint, family.archetypeHints
   ▼ Dispatches family.create command (generic, NOT furniture.create per-type)
   ▼ Handler reads family.builderRef + family.ifcMapping
   ▼ runs through the C11 polymorphic pipeline
```

**Implication for `furniture.create` and siblings.** These remain — they are the *core-origin* implementations. A new generic `family.create` command lands alongside, routing to the registry-backed handler. Plugins / user-defined families flow through `family.create`; the legacy core types flow through their existing commands or the same generic command (caller's choice). Both paths converge in C11.

---

## §8 — Live editing of registered families (BIM 3.0 intersection)

The Family Platform doc and the [BIM 1/2/3 doc](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) are sibling axes:

| | Family Platform (this doc) | BIM 1/2/3 (sibling doc) |
|---|---|---|
| **Concerned with** | What KINDS of elements exist | What you can EDIT once placed |
| **Substrate** | FamilyRegistry | L0 Data Graph |
| **User action** | "Define a new family" | "Edit a placed parameter" |
| **Engine response** | Auto-registration → instant availability | Local re-solve → propagation |

They COMPOSE: once a family is registered (this doc) and an instance is placed, every editable parameter the family declared (`min/max width`, `default offset`, etc.) becomes a BIM-3.0 editable parameter (sibling doc). The Data Management Panel in the sibling doc reads parameter definitions FROM the Family Registry.

---

## §9 — How this changes the apartment F-tier (today's work)

**The F-tier work continues.** It does not pause. But each F-tier ship is now structured to nudge the system toward the Family Platform target rather than away from it. Concretely:

| F-tier convention today | Adjusted convention going forward |
|---|---|
| Add literal to `FurnitureType` union | Same — but also stash a future `coreOriginRegistration` JSON object in the new `core-family-seed/` directory (one file per type) declaring everything the FamilyRegistry will need at composition root |
| Hand-author builder | Same — but the file path conforms to a discoverable pattern (`builders/<kind>Builder.ts`) so the future builder-discovery API can locate it without a manifest |
| Hand-author Zod schema | Same — but each schema file's default export uses a uniform shape (`SchemaForKind<K>`) so the future schema-discovery API can locate it |
| Hand-author footprint + archetype | Same — but a future pass extracts these into the seed JSON and the rules database becomes the registry's seed loader, not the source of truth |
| `FurnitureCategoryMap` extension | Same — but the future Family Registry's `byCategory` index supersedes the static map; the static map becomes a fallback for back-compat |

**No retroactive rewrites.** Every F-tier ship that already landed (F1.1 desk through F1.13 lounge_chair) stays as-is; the seed files for those types are generated automatically from the existing data once the seed-loader lands.

---

## §10 — The P0 strategic phase (inserted in front of F0 in the master plan)

| ID | Deliverable | Est | Status |
|---|---|---|---|
| **P0.1** | Complete element-lifecycle map (this §1, formalised + visualised) | 2 d | 🟨 §1 here is the first draft |
| **P0.2** | Universal element contract document (generalise the F-tier §0.1 ladder per discipline — wall, opening, fixture, joinery, MEP, structural, custom) | 5 d | ⬜ |
| **P0.3** | `FamilyRegistry` substrate (L0 schemas: types + indexes + registration API + composition-root seeding from existing hardcoded types) | 3 wk | ⬜ |
| **P0.4** | `FamilyRequest` schema + Stage 1 ingestion (JSON form, no UI ingestion yet) | 1 wk | ⬜ |
| **P0.5** | Family Generation Pipeline Stages 2–4 (parametric decomposition + geometry synthesis stub + auto-Zod schema generation) | 6 wk | ⬜ |
| **P0.6** | Family Generation Pipeline Stages 5–8 (registry registration + AI vocab delta + UI descriptor + IFC mapping) | 4 wk | ⬜ |
| **P0.7** | Plugin-marketplace runtime side (load `.pryzm-family` at startup, contribute into Registry) — connects to the manifest schema already designed in `packages/plugin-sdk/` | 3 wk | ⬜ |
| **P0.8** | Schema-discovery API + IFC-reader-discovery API + property-panel-schema-discovery API (replace the three static maps audited in §2) | 4 wk | ⬜ |
| **P0.9** | Gap analysis + roadmap refactor — every F-tier / L-tier / D-tier / T-tier row reviewed for "what does this row look like under Family Platform?" | 1 wk | ⬜ |

**P0 total: ~28 dev-weeks (≈ 7 months single-contributor; 3 months at two parallel).** Bigger than any F-tier slice but smaller than the cumulative cost of *not* doing it (each manual F-tier ship costs 3–5 days; 50 more catalogue entries = 200 dev-days = same magnitude as P0).

**P0 ships in parallel with F-tier.** F-tier rows continue to land; each lands with a `core-family-seed/` JSON sidecar (a 1-line addition per row) so when P0.3 lands, every existing type pre-registers automatically.

---

## §11 — How to read this doc alongside the master plan

The master plan's table of contents stays unchanged. This doc inserts as **Phase P0** at the very top of [APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN §4](APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN-2026-05-29.md), parallel to (not before) F0–F8. The master plan's §5 cross-phase tracking table gains a new tier row (Z.0 — Tier −1 — Family Platform).

The F-tier §0.1 ladder remains binding — generalised by §5 of this doc into the universal element contract. The F-tier §0.2 workaround discipline remains binding — generalised by the principle "no half-registered families".

---

## §12 — What this doc is NOT saying

- **Not stopping F-tier.** F-tier ships continue today, tomorrow, every session. Each one closes its own ladder under §0.1 / §0.2 as before. The §10 P0 phase runs in parallel.
- **Not retroactively rewriting shipped F-tier types.** F1.1 desk through F1.13 lounge_chair are correct as shipped. Their FamilyRegistry seeds are GENERATED from their existing data when P0.3 lands.
- **Not requiring plugin marketplace before user-defined families work.** The plugin marketplace is one *delivery channel* for FamilyRequests; users can also create families through the editor UI (P0.4 ingestion) or import .pryzm-family files directly.
- **Not redefining C03 / C09 / C11 / C15 / C16.** Each remains binding. The Family Registry is L0 (per P5 schema purity); the Family Generation Pipeline runs at L7.5 (transitional engine surface, like the apartment workflow today); the registered families flow into the SAME command bus (C11 pipeline) the existing types already use.
- **Not blocking BIM 2/3.** The sibling [BIM 2/3 doc](APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md) continues; this doc augments it (§8) — registered families' editable parameters become BIM-3-editable.

---

## §13 — Open questions for the next round

1. **Composition root seeding.** Where exactly does the FamilyRegistry get its core-origin seed at startup? Inside `composeRuntime()`? A dedicated `seedCoreFamilies()` function? (Likely the former — it is part of runtime construction.)
2. **Plugin trust boundary.** What sandboxing does a plugin-contributed builder get? Plugins authoring 3D geometry can leak THREE.js globals (P2 violation) — does P0.7 enforce a sandboxed builder API?
3. **AI-generated families.** Can the AI workflow author a FamilyRequest in response to "I need a custom built-in"? This collapses §3 → §4 → §6 inside a single user turn; substantial design question, queued for after P0.5.
4. **Versioning.** When a family is updated (v2 schema), what happens to existing placed instances? Live-migrate (BIM 3 propagation), keep-as-v1 (frozen origin), or user-choice? Likely user-choice with a Migration Center.
5. **Performance.** A 10 000-family registry could slow startup. Lazy load by category (only load families a project actually references) is the obvious answer; needs benchmark.

---

*End — APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS, 2026-05-30.*
