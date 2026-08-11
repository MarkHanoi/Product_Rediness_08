# PRYZM — Product Vision

> **Stamp**: 2026-06-01 · **Amended 2026-06-02** (domain canonical per [ADR-0255](../02-decisions/adrs/ADR-0255-one-pryzm-cloudflare-supabase.md)) · **Revised 2026-08-11 (rev 3 — measured)**
> **Status**: CANONICAL
> **Authority**: this doc owns **the product north star + the user journey + the phased roadmap**. Sits above [STR-03-engineering-vision.md](./STR-03-engineering-vision.md) and below only [STR-01-manifesto.md](./STR-01-manifesto.md). When this doc disagrees with code, this doc updates.
> **Foundation above**: [STR-01-manifesto.md](./STR-01-manifesto.md) (founding intent + brand voice)
> **Domain**: **`pryzm.so`** (canonical, owned today) · marketing apex at `pryzm.so` · editor at `app.pryzm.so` · developer docs at `docs.pryzm.so` · marketplace at `marketplace.pryzm.so` (Phase B+).

> ### What changed in rev 3, and why
>
> The June text described a product whose intelligence was *seven AI workflows plus a
> constraint database*, and whose geography was *a Cesium bridge*. Both descriptions have
> been overtaken by shipped architecture, and leaving them in place would have made the
> strategy docs the least accurate documents in the repository.
>
> Two pillars are named here for the first time because they now exist as measured
> machinery, not intent:
>
> 1. **The capability control plane** (§4.11) — the chat is no longer a feature bolted to the
>    editor; it is a *declared, machine-proven contract surface* over everything the editor can
>    do ([C67](../02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md),
>    [C68](../02-decisions/contracts/C68-ELEMENT-CHAT-ONBOARDING.md),
>    [ADR-0315](../02-decisions/adrs/ADR-0315-universal-capability-architecture.md)).
> 2. **Planning law made computable** (§4.12) — the deepest moat, and previously represented
>    in this document by one row saying "Cesium viewer integration ✅"
>    ([C58](../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md),
>    [C63](../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md),
>    [C64](../02-decisions/contracts/C64-ENVELOPE-COMPILER.md), ADR-0279, ADR-0283, ADR-0293).
>
> Everything asserted below is traceable to a contract, ADR or issue-log row by id. Where a
> claim is *intent* rather than *fact* it is marked **NOT-YET-TRUE** with the reason. The
> repository counts in §4.10 were re-measured on 2026-08-11 and had drifted materially from
> the June figures.

---

## §1 — The promise (one line)

> **One conversation, from raw site to coordinated building.**

That is the only promise. Everything else — the renderer, the file format, the 68 contracts, the marketplace, the sovereignty model — is in service of that single line.

And one line qualifies it, because the promise is worthless if the conversation lies:

> **Open language in, hard stoppers at the execution layer.**

The user may phrase a request any way they like. Bounds, liveness, legal limits and
granularity are enforced *where the mutation happens* — never by narrowing what the user is
allowed to type, and never by a confident "Done" over a change that did not occur
([ADR-0315](../02-decisions/adrs/ADR-0315-universal-capability-architecture.md), the founder
doctrine for the whole programme).

---

## §2 — What PRYZM is

PRYZM is an **AI-native design intelligence platform for the built environment**. It is a browser-based BIM editor that accepts a brief as input (natural language, structured constraints, or both), reasons across spatial / environmental / regulatory / programmatic layers, and produces coordinated BIM data (IFC4X3 or `.pryzm`) that downstream consultants and contractors can consume without rework.

Every word matters:

- **Design** — the act of deciding what a building should be (not analysing, not documenting, not visualising)
- **Intelligence** — the platform carries 248+ architectural rules, 14 room-type programs, climate substrates, deterministic generative engines, **and the planning law of the jurisdictions it has been packed for** — actively reasoning, not passively storing
- **Platform** — plugins, families, pricing catalogues, AI workflows, and locale packs are first-class artefacts third parties extend over the substrate
- **Built environment** — buildings, but also sites, rooms, neighbourhoods, climates, **and the legal envelope the parcel is entitled to**

### §2.1 — The two spines

Under the single promise there are two load-bearing structures. Everything else in this
document is detail hanging off one of them.

| Spine | One sentence | Where it is binding |
|---|---|---|
| **The capability control plane (RAC)** | Language is the primary interface, and *every* thing the editor can do is a declared, machine-proven capability — so the assistant can never claim an ability the editor does not have, and can never ship an ability it cannot say out loud. | [C67](../02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md) · [C68](../02-decisions/contracts/C68-ELEMENT-CHAT-ONBOARDING.md) · [ADR-0315](../02-decisions/adrs/ADR-0315-universal-capability-architecture.md) |
| **Planning law made computable** | A parcel resolves to a zoning instrument, the instrument constructs a block, the block constructs a buildable envelope, and the envelope carries the **article it was derived from** — or PRYZM refuses and names what is missing. | [C58](../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) · [C63](../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) · [C64](../02-decisions/contracts/C64-ENVELOPE-COMPILER.md) |

They meet at one point, and that intersection is the product thesis:

> **A legal constraint, expressed in ordinary language, gates a generative design.**

The buildable envelope's `maxHeightM` is not advisory decoration on a site view — it is the
hard stopper that refuses an over-height generation *quoting both numbers* (§GEN-MAXHEIGHT-GATE,
RAC U5b.3). Site context — true north (θ), the parcel ring, setbacks, neighbour heights — is
what makes *"all south-facing exterior walls"* mean a real compass direction rather than a
screen direction (RAC U2.1/U3.2). Neither spine is worth much alone. Together they are the
category.

---

## §3 — Why PRYZM exists — the problem

Architecture and construction is a $13 trillion global industry running on fragmented, disconnected software. The structural problems:

| Problem | Detail |
|---|---|
| **BIM complexity** | Revit and Archicad have 30-year-old interaction paradigms. Months of learning curve. Every project starts from scratch. |
| **No design intelligence** | Current tools store shapes. They do not know what a living room is, what adjacency rules apply, or whether a layout is compliant. |
| **Disconnected environmental data** | Sun, wind, climate, shadow analysis live in separate specialist tools most architects never open. |
| **Manual modelling dominates** | A skilled architect spends weeks drawing something an AI could generate in minutes — *if the AI understood buildings*. |
| **Poor interoperability** | IFC is the universal format but BIM-to-BIM workflows are routinely broken. Data is lost at every handover. |
| **No conversational interface** | Architects describe intent to colleagues in language. To Revit, they draw. Always manually. |
| **Generative tools miss the point** | Image generation produces pictures of buildings, not buildings. There is no constraint, no regulation, no geometry. |

PRYZM's wedge: between 2023 and 2026, three substrates matured simultaneously — large language models with spatial reasoning, browser-native 3D at desktop performance, and CRDT collaboration. The category opens. We enter (see [STR-01-manifesto.md §3](./STR-01-manifesto.md) and [STR-07-positioning.md §1](./STR-07-positioning.md)).

---

## §4 — What's actually shipped (verified 2026-06-01)

The following table is **derived from a full code audit on 2026-06-01**, not from prior documentation claims. Every row is auditable against the repository at that SHA.

### §4.1 — Core engine

| Capability | State | Owner code |
|---|---|---|
| 9-layer code architecture with L0 schemas → L9 plugins | ✅ Shipped | Per [STR-04-architecture.md §1](./STR-04-architecture.md) |
| Single composition root (`composeRuntime()`) | ✅ Shipped | `packages/runtime-composer/` (codified in [C02](../02-decisions/contracts/C02-COMPOSITION-ROOT-AND-BOOT.md)) |
| Command bus (the only mutation path; P6) | ✅ Shipped | `packages/command-bus/` |
| Single THREE owner (P2) | ✅ Shipped + CI-enforced | `packages/renderer-three/src/three-re-export.ts` |
| Single rAF / frame scheduler (P3) | ✅ Shipped + CI-enforced | `packages/frame-scheduler/src/RafAdapter.ts` |
| L0 Zod schemas (pure; P5) | ✅ Shipped | `packages/schemas/` |
| Yjs CRDT collaboration | ✅ Shipped | `packages/sync-client/`, `apps/sync-server/` |
| OpenTelemetry per public function (P8) | ✅ Shipped + CI-enforced | `tools/ga-gate/check-otel-spans.ts` |
| Headless mode | ✅ Ready | `packages/headless/` v1.0.0-rc.1 |

### §4.2 — Element types (14 element families)

Each element family is split across a `packages/geometry-*` (geometry math) and `plugins/*` (UI tool + commands + UI) pair:

| Element | Geometry package | Plugin |
|---|---|---|
| Wall | `packages/geometry-wall/` | `plugins/wall/` |
| Door | `packages/geometry-door/` | `plugins/door/` |
| Window | `packages/geometry-window/` | `plugins/window/` |
| Slab | `packages/geometry-slab/` | `plugins/slab/` |
| Floor (decorative) | (in slab) | `plugins/floor/` |
| Ceiling | (in geometry-kernel) | `plugins/ceiling/` |
| Roof | `packages/geometry-roof/` | `plugins/roof/` |
| Column | `packages/geometry-column/` | `plugins/column/` |
| Beam | `packages/geometry-beam/` | `plugins/beam/` |
| Stair | `packages/geometry-stair/` | `plugins/stair/` |
| Handrail | (in geometry-stair) | `plugins/handrail/` |
| Curtain wall | `packages/geometry-curtain-wall/` | `plugins/curtain-wall/` |
| Lighting | `packages/geometry-lighting/` | `plugins/lighting/` |
| Plumbing | `packages/geometry-plumbing/` | `plugins/plumbing/` |
| Furniture | `packages/geometry-furniture/` | (consumed by AI workflows) |

Plus structural element coordination via `plugins/structural/`, grid systems via `plugins/grid/`, and room-detection via `plugins/rooms/`.

### §4.3 — AI workflows (7 in `packages/ai-host/src/workflows/`)

| Workflow | Path | Routing |
|---|---|---|
| **Generate3Options** | `Generate3Options.ts` | AI (fan-out 3 parallel Haiku calls per style) |
| **PlanCritique** | `PlanCritique.ts` | AI (single Haiku call) |
| **VoiceCommand** | `VoiceCommand.ts` + `VoiceCommand.impl.ts` | Whisper transcription + intent LLM fallback |
| **ApartmentLayout** | `apartmentLayout/workflow.ts` + `generate.ts` | AI primary + deterministic D-TGL fallback |
| **FurnishLayout** | `furnishLayout/furnishRoom.ts` | Deterministic D-FLE (no LLM) |
| **CeilingLayout** | `ceilingLayout/ceilingForRoom.ts` | Deterministic D-CE (no LLM) |
| **LightingLayout** | `lightingLayout/lightRoom.ts` | Deterministic D-LE (no LLM) |

LLM model: `claude-haiku-4-5-20251014` via Anthropic API (direct or via Cloudflare Worker relay; `CF_WORKER_URL` env var). Costs tracked via `@pryzm/ai-cost`; per-project budget caps enforced. AI plane wired into composition root.

### §4.4 — Constraint database

| Subject | State |
|---|---|
| Architectural program rules | `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts` (627 LOC, 14 room types) |
| Per-room furniture specs | 53+ FurnitureSpec objects across room types |
| Spec database (full) | `docs/03-execution/specs/SPEC-LAYOUT-CONSTRAINT-DATABASE.md` — 248 constraints across 14 categories |
| Code-implemented subset | ~40 % of spec (area ratios, room sizes, door topology, programmatic furniture); daylight / acoustic / fire / thermal documented but not yet enforced |

### §4.5 — Geospatial substrate

| Capability | State |
|---|---|
| LTP-ENU local Cartesian (1 km recentre) | ✅ `packages/geospatial/src/LTPENURebase.ts` |
| Proj4 CRS transforms | ✅ `packages/geospatial/src/GeospatialAdapter.ts` |
| `IfcProjectedCRS` IFC4X3 export | ✅ `packages/geospatial/src/IfcProjectedCRSRecord.ts` |
| Cesium viewer integration | ✅ `plugins/geospatial/src/CesiumThreeBridge.ts` |
| Site element as first-class schema | ⬜ Codified DRAFT [C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md); implementation in flight |
| Climate ingestion (EPW + NOAA) | ⬜ Codified DRAFT [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md); implementation in flight |

### §4.6 — Interchange

| Format | State |
|---|---|
| IFC4X3 import | ✅ `plugins/ifc-import/` |
| IFC4X3 export (production-grade) | ✅ `plugins/ifc-export/` + `packages/file-format/src/ifc/` |
| BCF round-trip | ✅ `plugins/bcf/` |
| Rhino import | ✅ `plugins/rhino-import/` |
| DXF import | ✅ `plugins/dxf/` |
| Revit round-trip (via IFC4X3 bridge) | Codified DRAFT [C26](../02-decisions/contracts/C26-REVIT-ROUND-TRIP.md); IFC variant exporter shipped |
| PDF export (vector, via drawing-primitives) | ✅ `packages/pdf-export/` + `plugins/export-pdf/` |
| DWG round-trip | Codified DRAFT [C32](../02-decisions/contracts/C32-DXF-DWG-ROUND-TRIP.md); ODA library integration pending |
| COBie FM handover | Codified DRAFT [C35](../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |

### §4.7 — Platform (plugin SDK + family + marketplace)

| Surface | State |
|---|---|
| `@pryzm/plugin-sdk` v1.0.0 | ✅ `packages/plugin-sdk/` — full SDK with iframe sandbox + Ed25519 signing + 6 host proxies + `pryzm dev` CLI + bSDD lookup client. publishConfig.name=`@pryzm/sdk`. Manual step: `pnpm publish`. |
| Family Platform runtime | ✅ `packages/family-{instance,loader,runtime}/` |
| Family schemas (7 stages) | ✅ `packages/schemas/src/family-{definition,request,parametric,geometry,schemas,registry,pipeline}/` |
| `.pryzm-family` ZIP file format | ✅ `packages/file-format/` (packFamily / unpackFamily) |
| Component Editor (Family Creator) | ✅ `apps/component-editor/` — functional (not scaffold); sketcher + planegcs + 3D ops + parameter table |
| Plugin Marketplace SPA | ✅ `apps/marketplace/` (port 5001) |
| Family Marketplace SPA | ✅ `apps/marketplace-web/` |
| Marketplace API | ✅ `apps/marketplace-api/` + `/marketplace/api/*` routes in `server.js` |
| Marketplace DB (9 tables) | ✅ `marketplace_plugins`, `plugin_publisher_keys`, `plugin_revocations`, `plugin_purchases`, `plugin_reviews`, … |
| Marketplace DNS (`marketplace.pryzm.so`) | ⬜ Manual pending (OI-013) |

### §4.8 — Server + persistence + collaboration

| Capability | State |
|---|---|
| Express server | ✅ `server.js` (5648 LOC, 278 KB) |
| 19 PostgreSQL tables | ✅ `server/dbMigrate.js` (Supabase or Replit PG; in-memory fallback) |
| Auth: email/password (bcrypt) + JWT (30d) | ✅ `server/authStore.js` |
| OAuth Google + Microsoft | ✅ `server/oauthService.js` |
| SAML SSO | ⬜ Not shipped (planned per Enterprise C39) |
| Password reset flow | ⬜ Not shipped |
| Stripe subscriptions (architect / studio / firm × monthly / annual = 6 SKUs) | ✅ `server/stripeService.js` + webhook |
| Stripe marketplace (30/70 split, refunds, chargebacks) | ✅ `plugin_purchases` table + webhook handlers |
| Anthropic API proxy (`/api/anthropic/v1/messages`) | ✅ Direct API or Cloudflare Worker relay (CF_WORKER_URL) |
| Socket.io real-time | ✅ `socket.io` on httpServer; project-scoped rooms |
| Yjs CRDT sync | ✅ *mechanism* — `packages/sync-client/` + `apps/sync-server/` (single-instance v0; Redis pub/sub deferred). ⚠ **Capacity is NOT-YET-TRUE:** [C66 §1](../02-decisions/contracts/C66-CONCURRENCY-AND-SCALE.md) records all three tiers (50 / 300 / 1,000 concurrent) as **CLAIMED, none HELD**, and §1.1 forbids describing a CLAIMED tier as supported — including in a plan tier or a customer commitment. **Exit condition:** a recorded k6 run at the tier's VU count passing the C66 §6 thresholds against a production-shaped target. |
| ISO 19650 CDE state machine (WIP → approved → published) | ✅ `project_versions.state` + `version_audit_log` table |
| OpenTelemetry tracing | ✅ Opt-in via `OTEL_EXPORTER_OTLP_ENDPOINT` env |
| Security: Helmet + CSP + COEP + COOP + HSTS + rate limiting | ✅ `server/securityHeaders.js` |

### §4.9 — Output + sheets + drawing

| Capability | State |
|---|---|
| Sheet composition engine | ✅ `plugins/sheets/` (S37 prior art); migrating under [C24](../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md) |
| Vector PDF export | ✅ `packages/pdf-export/` (fills the typed stub per [C29](../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md)) |
| Sheet sets + revisions | ✅ `packages/stores/src/SheetSetStore.ts` |
| BIM 3.0 Inspect tree (Site → Building → Level → Apt → Room → Element) | Codified DRAFT [C27](../02-decisions/contracts/C27-BIM3-INSPECT-MODEL.md); INS-α phases shipping |
| Data Panel + automation | Codified DRAFT [C28](../02-decisions/contracts/C28-DATA-PANEL-AND-AUTOMATION.md); migrating from `plugins/schedules/` |
| Schedules (PRYZM 2 prior art) | ✅ `plugins/schedules/` |
| Cost (5D) | Codified DRAFT [C38](../02-decisions/contracts/C38-COST-5D.md); implementation pending |
| Schedule (4D) | Codified DRAFT [C37](../02-decisions/contracts/C37-SCHEDULE-4D.md); implementation pending |

### §4.10 — Measurement + governance (re-measured 2026-08-11)

| Capability | State |
|---|---|
| 68 benchmarks measured every PR | ✅ `apps/bench/src/benches/*.bench.ts` |
| **32** CI gates | ✅ `tools/ga-gate/check-*.ts` (run by `run-all.ts`) — was 21 in June |
| **68** binding contracts | ✅ `docs/02-decisions/contracts/C01–C68` — was 49 |
| **252** ADRs | ✅ `docs/02-decisions/adrs/` — was 108 |
| **94** specs | ✅ `docs/03-execution/specs/` — was 56 |
| **97** packages · **13** apps · **48** plugins | ✅ was 79 / 13 / 47 |

---

### §4.11 — The capability control plane (the RAC spine)

> Governing contracts: **[C67](../02-decisions/contracts/C67-RAC-CAPABILITY-CONTROL-PLANE.md)**
> (what the chat *is*) · **[C68](../02-decisions/contracts/C68-ELEMENT-CHAT-ONBOARDING.md)**
> (what a new element or attribute *owes* the chat) · **[ADR-0315](../02-decisions/adrs/ADR-0315-universal-capability-architecture.md)**
> (the architecture as built) · ADR-0313 (the resolver ladder) · ADR-0314 (undo-neutral batch).

The founding principle is one sentence, and it inverts how every other AI-in-CAD product is
built (C67 §0):

> **The AI layer is never the source of truth for what the editor can do. The editor
> registers capabilities; language resolves against them; the LLM is an escalation
> mechanism, not the command router.**

**Why this had to become architecture.** The founder typed *"make all walls interior
partition"* into a release that had shipped `wall.updateSystemTypeBatch` in the same
deployment, and was told *"I'm not sure how to help with that yet."* Nothing was broken; the
chat's idea of the editor's abilities lived in a hand-maintained list of thirteen intents and
nothing compared that list to the command bus (C68 §2.1). The same failure recurred months
later against the apartment-layout engine. A product whose interface is conversation cannot
have a hand-maintained idea of itself.

**What a capability now is.** Not a prompt, not an intent string — a declared contract with
four independent proof obligations, each enforced by a CI gate (C68 §5, §6.1):

| Obligation | What it proves |
|---|---|
| **Route liveness** | The verb reaches the geometry store that rendering, export and persistence actually read. *A plugin DTO store is presumed DEAD until proven otherwise, because that presumption has been right 13/13 times* (C68 §5.a). |
| **Targets proven both ways** | The gate *executes* the capability's probe against all 16 element kinds and requires declared set == accepted set **exactly, in both directions** — a declared target the guard refuses fails, and an undeclared kind the guard accepts fails too, because silent over-reach is the same lie facing the other way (C68 §5.c). |
| **Source-anchored proof** | A `commandProof` names the file that *decides* which kinds the command can reach, and the literals that must appear in it. An unprovable claim fails. |
| **Acceptance + adversarial families** | Natural phrasings — the way a user says it, not the way the grammar was written — are executed by the gate; so is a hostile corpus of paste-backs, negations and hypotheticals, at zero tolerance (C68 §5.f). |

**The measured state, 2026-08-11**: **41 capabilities registered; undeclared bus commands
0 of 0**, on a shrink-only ratchet that has been at zero since 2026-08-10 (C68 §6.2). Every
one of the ~300 registered bus commands is either a capability, a *truthful* `CHAT_UNAVAILABLE`
refusal a user could read, or a classified deferral with an engineering reason a reviewer can
falsify. **A new command with no chat metadata turns CI red.** The maturity ladder is printed
by the gate on every run rather than asserted in a document (ADR-0315 D6).

**The economics changed, and that is the strategic point.** Before the spec interpreter
(RAC U4) and the property/catalogue vocabularies (U7), each new capability cost a
hand-written resolver arm — roughly sixty lines of scope/value/dispatch template plus a
matcher. Today a batch-shaped capability is a **table row**; a catalogue family is a table row
from which the execution spec *and* the grammar are generated; a property is a table row.
`set-door-type` shipped as **~94 lines of metadata with zero new resolver code** (C68 §8), and
the same row shape then delivered slab and ceiling types for the same price. **The marginal
cost of the next capability is metadata, not engineering** — which is what makes "everything
the editor can do is speakable" a plan rather than a wish.

**Honesty is the feature, not the caveat.** These behaviours are specified, tested and
merge-blocking (C67 §4.5, C68 §5.g):

- A refusal names **real** names, numbers and units — the project's actual type names, the
  geometry package's imported bounds, the real extremum when a filter matched nothing
  (*"No wall is thicker than 300 mm — the thickest is 250 mm (Interior – Partition). Nothing
  was changed."*).
- Ambiguity **refuses naming both candidates** rather than retyping a building on a coin flip.
- Partial outcomes are reported as partial — *"Changed N of M — K skipped: `<reason>`"* — with
  the reason read off the command's own payload, never re-narrated.
- A named scope is never silently widened to a larger one the engine happens to support.
- **"Done" only after a command reports success.**

**What is NOT-YET-TRUE**, stated plainly so this section cannot be mistaken for a finished
system: C68 is **CANONICAL, not ACTIVE** (C68 §9). Refusal *quality* has no gate and is a
review judgement; the runtime halves of "one undo entry" and "a truthfully populated report
payload" are provable only against a running editor; and six of the new checks are shrink-only
ratchets rather than zero-tolerance bars — **a baseline is a debt with a name, not a clean
sheet** (C68 §6.2). The LLM tier consuming the registry as its tool list is in flight (U10.1
landed; U10.2/U10.3 have not).

---

### §4.12 — Planning law made computable (the jurisdiction moat)

> Governing contracts: **[C57](../02-decisions/contracts/C57-PARCEL-DATA-LAYER.md)** (parcel) ·
> **[C58](../02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md)** (envelope) ·
> **[C60](../02-decisions/contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md)** (coverage) ·
> **[C62](../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md)** (confidence) ·
> **[C63](../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)** (scorecard) ·
> **[C64](../02-decisions/contracts/C64-ENVELOPE-COMPILER.md)** (compiler) · ADR-0276, ADR-0279,
> ADR-0283, ADR-0291, ADR-0293.

**The one idea.** The buildable envelope is a **construction, not a lookup**. Barcelona's PGM
Art. 242.2 does not state a buildable depth; it states a *derivation* — a figure similar to the
block, equidistant from the street frontages, leaving at least 30 % of the block area as
interior free space, capped at 30 m and floored at 11 m. There is therefore no dataset to buy.
**The derivation trace is the product; the number alone is not.**

The pipeline is fixed and generic (ADR-0279, stages P0–P11):

```
parcel (cadastre, normalised at the adapter edge — C57)
  → zoning instrument + zone identity (the clau / norma zonal / bestemmingsplan)
  → block construction (parcel dissolve → ring → frontage classification against the road graph)
  → buildable envelope, carrying the ARTICLE it was derived from
  → or a TYPED DETERMINATION naming exactly what is missing and who owns it (C64)
```

**Refusal is a product feature, and it is the hardest one to build.** C63 §3.1 ratifies the
ruling that the scoring denominator is **buildable land**, and that *a refusal is 100 %
honest at 0 % complete* — launch-blocking is `honestyOk`, never a completion threshold. Three
worked examples of a refusal being the correct answer:

- **Barcelona clau 18** is 22.5 % of private buildable land and resolves to a **correct
  refusal**, not a coverage gap.
- **Barcelona clau 22a** (17.5 % of private buildable land) is governed by PGM Art. 350
  *twice*, and neither the cadastre nor the planning registry records which regime applies —
  the field does not exist in either source. PRYZM mints `regime-undetermined` rather than
  picking (**ADR-0276**).
- **Madrid NZ-1** is verified for the footprint **ring only**; height is blocked at
  Art. 8.1.15.1, which is discretionary. *"Partial publication does not authorize inference
  beyond its demonstrated spatial extent"* (**ADR-0283**). NZ-3 is resolved **by law**: no
  municipal zone envelope is computable under the current ordinance — a determination, not a
  gap.

**Honest coverage, stated as coverage.** PRYZM does not serve the world. **One city is live in
production (Barcelona).** Spain has five cities with a router branch at differing gates
(Barcelona shipped · Murcia published on an `estimated-ruleset` · Madrid ring-only · Córdoba
refusal-only · València refusing with the engineering complete). Beyond Spain, Denmark is
keyed and credential-gated, Switzerland is partially rated, Saudi Arabia is a demo market.
Every envelope carries one of six confidence labels, and an `estimated-ruleset` envelope is
**never** presented as authoritative (C58 §1.2/§1.4). C63 scores each city on **seven weighted
axes — legislation 25 · envelope 20 · parcel 15 · data-sources 15 · heights 10 · terrain 10 ·
context 5** — so "how complete is this city?" has an answer that is a total function of state
rather than a number someone typed.

**Why this is a moat rather than a feature.** The dominant cost is not engineering, and this is
the single most important fact for planning the rollout: **the cost is SOURCING, and sourcing
is human-gated.** Metropolitan authorities serve per-municipality consolidated ordinances that
*state different numbers for the same article*, so "encode the law once, get the region free"
is measurably false. Authoritative viewers are interactive; several publishers 403 or
robots-disallow scripted access. Two capable research agents hit that wall twice each in one
day. This line item cannot be accelerated by hiring engineers — **and a competitor cannot buy
these packs either.** What *can* be accelerated is replication: onboarding a city is a data
addition at exactly five slots plus one dispatcher branch, and two cold-start probes onboarded
a new municipality in ~25 minutes with **0 % municipality-specific code** (ADR-0279).

**What is NOT-YET-TRUE in this workstream** — stated because an over-claimed envelope is the
one failure mode this pipeline exists to prevent:

- **The CI fidelity-label gate does not exist.** ADR-0279 §6 records it as the highest blocker:
  today the *"never render an estimate as authoritative"* guarantee rides on convention, not CI.
- **C64 layers 2, 3 and 4 are unbuilt** (variable dependency graph, variable resolution, dataset
  resolver) — the missing work is contiguous.
- **`authoritative` is unreachable by construction** (C63 §3.3): a constructed determination
  caps at 0.70, so no city's envelope axis can score 100 %.
- **Refusal correctness has never been measured.** It is asserted. The audit is commissioned.
- **Street width has no national source** and must be constructed from the cadastre; whether a
  measured width equals the legal *ample oficial* is still open (L-528).
- **Downward constraints — airport, flood, infrastructure — are unmodelled across every city**,
  so every envelope PRYZM publishes today is an upper bound with a missing ceiling.
- Several cadastres are access-gated (Denmark credential-gated; Saudi WAF-blocked outside the
  country; Germany outside NRW per-Land licensed) and fall back to OSM footprints.

**Three lessons this workstream taught the whole platform**, because they generalise far beyond
geodata:

1. **A failure and an emptiness must never share a value** (§CONTEXT-DATA-HONESTY, **L-581**):
  an inset that collapsed returned `0`, the solver read `0` as a legal constraint, and the
  refusal cited the wrong rule.
2. **An UNKNOWN constraint must never be drawn as an unbounded one** (**L-616**): a card whose
  text honestly said *"not derived"* sat above geometry that extruded the full parcel to the
  cap — unknown rendered as maximally permissive.
3. **Never accept an aggregate as proof of a geometry change** (**L-586**): a miter offset
  over-stated buildable area on 31 of 65 real blocks, worst case by 65 %, while every soundness
  gate passed — because the gates compared the inset to the parcel rather than to the true
  erosion.

---

## §5 — The user journey (target end-to-end)

This describes the workflow a first-time PRYZM user experiences when creating a residential project. This is the workflow PRYZM must deliver as the Phase 1 commitment.

### Step 1 — Enter PRYZM (`pryzm.so`)

The user navigates to `pryzm.so`. They are greeted by a minimal interface: a single conversational input and a 3D site view. No toolbar. No palette. No empty canvas.

The first interaction is the brief — not the login. Account creation happens *after* the first project is initiated, reducing friction to near zero. Stripe payment is required only at trial expiry (per [C39 §1.7](../02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md)).

### Step 2 — Project initiation chatbot (RAC)

The Rapid Authoring Chatbot drives the entire initiation sequence:

| Question | Purpose |
|---|---|
| Q1: Project type | Apartment / house / residential building / office / school / refurbishment / extension / commercial / other |
| Q2: Site location | Address, city, or plot coordinates. Triggers automatic geolocation + site model generation. |
| Q3: Scale | Single unit / multiple units / floor area / bedroom count |
| Q4: Existing conditions | Empty plot / existing building / drawings / IFC file / photos |
| Q5: Regulatory context | Auto-detected from geolocation; user confirms or overrides |
| Q6: Brief summary | RAC summarises the brief back; user confirms before generation |

### Step 3 — Site definition

The site model is generated automatically from the address (per [C12 Geospatial](../02-decisions/contracts/C12-GEOSPATIAL.md) + the in-flight [C19 Site Model](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)):

- Plot boundaries from GIS/cadastral data
- Latitude + longitude (WGS84) + project-local Cartesian (LTP-ENU)
- Orientation + cardinal directions + true north vs project north
- Sun paths for every season and hour
- Climate substrate (EPW priority; NOAA fallback per in-flight [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md))
- Context buildings from OpenStreetMap
- Topography + level changes
- Street access + planning context

The site UI is cream / light (not the Cesium default dark globe); user defines plot boundary; PRYZM derives everything else.

### Step 4 — Existing conditions

Per Q4 answer:

| Path | Workflow |
|---|---|
| **Empty site** | Skip to Step 5; envelope generated from plot boundary + planning constraints |
| **IFC import** | User uploads IFC; PRYZM parses (per `plugins/ifc-import/`); model populated |
| **PDF / DWG / image import** | OCR + line detection (beta; clearly marked) |
| **Existing building** | RAC captures dimensions; simplified model generated |

### Step 5 — Design authoring (4 modes coexist)

- **Manual** — traditional BIM tools (wall, door, slab, etc.) via `plugins/*` commands
- **AI conversational** — *"add a master bedroom facing south with an ensuite"* — single-command natural language
- **Batch AI** — structured multi-step generation (full apartment via `apartmentLayout`; multi-apartment floor-plate)
- **Hybrid** — AI generates base; human refines

For residential, the generative AI workflow (`apartmentLayout`) activates. The 248-rule constraint database enforces spatial logic. Generated layouts are valid by construction.

### Step 6 — Design intelligence layer (background)

After initial generation, the design intelligence layer runs continuously:

- **Constraint validation** — rules checked; violations highlighted with rule reference
- **Daylight rule-checking** — mandatory window requirements (full simulation in [C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md))
- **Adjacency quality** — preferred adjacencies scored; improvements suggested
- **Circulation efficiency** — corridor length, dead ends, accessibility
- **Code compliance** — regulatory minimums per jurisdiction

Energy + wind + acoustic + behavioural simulation land in Phase 1b (per [site-and-cognition-strategy §3.4](./STR-12-site-and-cognition-strategy.md)).

### Step 7 — Living BIM model

The generated design is stored as a **living model**: every element carries geometry + type + intent + constraints + relationships + performance targets. Changing a performance target adapts the layout dynamically. The model is always internally consistent.

### Step 8 — Sheets + IFC handoff

User generates sheets via [C24 Sheet Composition](../02-decisions/contracts/C24-SHEET-COMPOSITION-ENGINE.md). Drawing standards per region ([C34](../02-decisions/contracts/C34-PRINT-AND-DRAWING-STANDARDS.md)). PDF export via [C29](../02-decisions/contracts/C29-PDF-VECTOR-EXPORT.md). IFC4X3 export via [C25](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). Customer collaborators consume the IFC in Revit / Archicad / Solibri.

---

## §6 — Deployment + environments

PRYZM runs across **four environments** ([codified by C49](../02-decisions/contracts/C49-MULTI-REGION-AND-SOVEREIGNTY.md)):

| Environment | Purpose |
|---|---|
| **Local (dev)** | Developer's machine. Hot reload. Full debug. Local DB + mocked Cesium tiles. |
| **CI** | Automated tests + 21 CI gates + 68 benches. Run on every PR. |
| **Staging** | Pre-production mirror. Real Cesium tiles. QA + stakeholder demos. Not indexed. |
| **Production** | Live. Monitored. Rate-limited. Region-aware (EU / US / AP / UK). Backed up per [C48](../02-decisions/contracts/C48-BACKUP-AND-DR.md). |

Release process:

- All changes via pull request — no direct commits to main
- Branches: `feat/...`, `fix/...`, `docs/...`
- Merges to `main` trigger CI. The GA-gate job runs **32 contract gates** (`ls tools/ga-gate/check-*.ts | wc -l` → 32, of which `run-all.ts` orchestrates 32). ⚠ **"+ bench baselines" was false and is now marked NOT-YET-TRUE**: `grep -rn "bench" .github/workflows/` returns **zero matches** — no workflow runs `apps/bench`, and no baseline file is committed. *Exit condition:* the Wave-5 bench job lands in `ci.yml`. See [C10 §1](../02-decisions/contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md).
- ⚠ *"All changes via pull request — no direct commits to main"* is **aspirational**: the working practice is push-straight-to-`main`, which is why the real deploy gate is the `ci-gate` job in `deploy-fly.yml` rather than GitHub required status checks (§L-540-CI-GATE).
- Staging promoted manually after QA sign-off
- Production releases semantically versioned (`vMAJOR.MINOR.PATCH`)
- Hotfixes via `hotfix/<description>` branch, merged to main + backported

---

## §7 — Market positioning

Full treatment in [STR-07-positioning.md](./STR-07-positioning.md). Summary:

| Segment | Phase | Profile |
|---|---|---|
| **Solo architect (C1)** | Phase 1 | 1 seat; Solo $25/mo; PLG self-serve |
| **Studio (C2)** | Phase 1 | 2–10 seats; Studio £15/seat/mo; PLG |
| **Mid-firm (C3)** | Phase 1–2 | 11–50 seats; Mid-firm $35/seat/mo; assisted sales |
| **Enterprise (C4)** | Phase 2–3 | 50+ seats; custom; 6–9 month procurement |
| **Plugin developer (C5)** | Phase 1 onward | 30/70 marketplace revenue share |

Competitive positioning detailed in [STR-07-positioning.md §2](./STR-07-positioning.md).

---

## §8 — Gap analysis (Phase 1 blockers)

The deltas between code reality (§4) and the user journey (§5):

> **Revised 2026-08-11.** Several June gaps closed; the ones that did not are restated with
> the reason, and new ones are added. The rule is unchanged: a gap named here is a gap a
> reader can verify.

| Gap | Status | Resolution |
|---|---|---|
| **RAC end-to-end wiring** | ✅ Largely closed | The chat is now the capability control plane (§4.11): 41 capabilities, undeclared 0/0, generation reachable by sentence over the four proven executors, compound plans with one Confirm card and a truthful undo cost. Remaining: the LLM tier consuming the registry as its tool list (U10.2/U10.3). |
| **Refusal quality has no gate** | Open, by admission | C68 §6.3 — the item most likely to be got wrong in a hurry, and the reason C68 is CANONICAL rather than ACTIVE. |
| **Envelope fidelity-label CI gate** | Open — highest blocker | ADR-0279 §6 / C58 §6. Until it lands, "never render an estimate as authoritative" is convention, not enforcement. |
| **Jurisdiction breadth** | Honest, narrow | One city live in production; five Spanish cities at differing gates. The constraint is human-gated legal sourcing, not engineering (§4.12). |
| **Downward site constraints (airport / flood / infrastructure)** | Unmodelled | Every published envelope is an upper bound with a missing ceiling. |
| **Site UI aesthetic (cream/light, not dark globe)** | Pending | Cesium bridge shipped; light-theme tile styling pending. |
| **Multi-apartment validation** | Partial | Single-apartment layout shipped; multi-apartment floor-plate generator + validation per [C20 §1.2 caveat](../02-decisions/contracts/C20-BUILDING-AND-APARTMENT-AGGREGATES.md). |
| **Site as first-class element ([C19](../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md))** | DRAFT contract; impl in flight | PG0 work track per [site-and-cognition-strategy §2.4](./STR-12-site-and-cognition-strategy.md). |
| **Climate ingestion ([C21](../02-decisions/contracts/C21-CLIMATE-INGESTION.md))** | DRAFT contract; impl in flight | PG0 work track. |
| **End-to-end IFC handoff test** | Partial | IFC4X3 export shipped; nightly round-trip vs 10 reference projects per [C25](../02-decisions/contracts/C25-IFC-EXPORT-PRODUCTION.md). |
| **PDF/image-to-BIM** | Not production | Marked beta; out of core scope (marketplace plugin opportunity). |
| **`pryzm.so` domain + DNS** | Pending | Currently `pryzm.so` legacy; cutover planned. |
| **`marketplace.pryzm.so` DNS** | Pending OI-013 | DNS + TLS cert. |
| **`pnpm publish @pryzm/sdk`** | Pending OI-011 | Manual npm publish; SDK ready. |
| **`pnpm publish @pryzm/headless`** | Pending OI-012 | Manual npm publish; package ready. |

---

## §9 — Phased roadmap

| Phase | Name | Horizon | Focus |
|---|---|---|---|
| **Phase 0** | Foundation | Complete | Constraint DB + ROOM_RULES + apartment engine (D-TGL) + D-FLE furniture + D-CE ceiling + D-LE lighting + command bus + IFC4X3 + Cesium + Plugin SDK v1.0 + Family Platform |
| **Phase 1** | Connected workflow | 0–6 months | RAC end-to-end + site UI polish + multi-apartment validation + marketplace DNS + npm publish + production-grade IFC4X3 |
| **Phase 1b** | Intelligence layer | 3–9 months | C19/C20/C21 site + climate + aggregates; daylight + performance-driven adaptation; cognition stack L5 (perceptual sim) |
| **Phase 2** | Platform breadth | 6–18 months | New typologies (office/hospital/retail); drawing production polish; PDF import robustness; family marketplace flywheel |
| **Phase 2b** | Market expansion | 12–24 months | Interior designer tools; homeowner self-service; mid-firm Mid-tier features (4D / 5D / clash) |
| **Phase 3** | Enterprise + twin | 18–36 months | Enterprise sovereignty (EU/US/AP/UK regions live per C49); BYOK; self-host; digital twin + FM integration |

The master implementation plan ([../03-execution/plans/master-implementation-plan.md](../03-execution/plans/master-implementation-plan.md)) overlays delivery tracks onto these phases.

---

## §10 — Guiding principles for future development

Every decision about what to build next is tested against these:

- **The constraint database is law.** No generated output bypasses it. Adding a new typology means adding its rules first.
- **Conversation before UI.** Every new capability should be accessible via natural language before a graphical control is built. Since C68 this is no longer an aspiration but an **onboarding obligation with a CI gate behind it**: a new element type or attribute is not done until the chat can either reach it or refuse it out loud with a stated reason, and which of the two is true is decided by a gate, never by memory.
- **Open language in, hard stoppers at the execution layer.** Never narrow what the user may type in order to make the system safe; enforce at the point of mutation instead (ADR-0315).
- **Deterministic tiers first, the model last.** Every ladder in the product runs cheap-and-certain before expensive-and-probabilistic, and the last rung emits the *same validated structures* the earlier rungs emit — it never gains a private path to the data. This is true of the chat (tier 0 grammar → typo-tolerant tier 1 → local semantic parse → LLM) and of PDF→BIM (vector extraction → algorithmic raster CV → AI), which is why PDF import now works with **no API key at all**.
- **A refusal is a correct answer.** Where an instrument is silent, a source is absent, or an engine has no entry point at that granularity, PRYZM says so and names the gap. Refusing is not a failure state to be minimised; over-claiming is (C63 §3.1, C58 §1.13).
- **Failure and emptiness are never the same value.** A probe that could not run must not return the value a probe that ran and found nothing would return (§CONTEXT-DATA-HONESTY, L-581, L-616).
- **Site first.** Any feature ignoring real-world geography is a temporary measure. All design should eventually be site-grounded.
- **BIM output is non-negotiable.** PRYZM produces real interoperable geometry. Image generation is never a substitute.
- **Fail loudly on constraints.** When a layout violates a rule, the system tells the user which rule, why, and what to do.
- **The human is always in control.** AI generates proposals. Humans approve. No autonomous action without confirmation.
- **Honest performance contracts.** Every claim is measured in CI ([engineering-vision §5](./STR-03-engineering-vision.md)).
- **Open file format.** Lock-in is anti-customer. `.pryzm` + IFC4X3 round-trip is the contract.
- **Marketplace as moat.** The long tail of customisation IS the product. PRYZM ships the substrate; the ecosystem ships the breadth.

---

## §11 — Cross-references

| Doc | Relationship |
|---|---|
| [STR-01-manifesto.md](./STR-01-manifesto.md) | Founding intent + brand voice |
| [STR-07-positioning.md](./STR-07-positioning.md) | Competitive landscape + moats |
| [STR-09-personas.md](./STR-09-personas.md) | The 5 customer archetypes in depth |
| [STR-08-go-to-market.md](./STR-08-go-to-market.md) | Channels + pricing + retention |
| [STR-10-platform-strategy.md](./STR-10-platform-strategy.md) | Plugin SDK + Family Platform + Marketplace pillars |
| [STR-12-site-and-cognition-strategy.md](./STR-12-site-and-cognition-strategy.md) | Site/geospatial + cognition substrate strategy |
| [STR-03-engineering-vision.md](./STR-03-engineering-vision.md) | P1–P8 principles + D1–D13 differentiators + 68 benches |
| [STR-04-architecture.md](./STR-04-architecture.md) | System shape + composition root + lint matrix |
| [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md) | Per-package detail |
| [STR-06-operating-principles.md](./STR-06-operating-principles.md) | How the team works |
| [STR-15-risks-and-assumptions.md](./STR-15-risks-and-assumptions.md) | Bets + risk register |
| [../02-decisions/contracts/README.md](../02-decisions/contracts/README.md) | 49 binding contracts (C01–C49) |
| [../03-execution/plans/master-implementation-plan.md](../03-execution/plans/master-implementation-plan.md) | Master delivery plan |

---

## Document control

| | |
|---|---|
| **Version** | 3.0 (measured revision — the two spines named) |
| **Status** | CANONICAL — contract- and issue-log-grounded |
| **Domain** | `pryzm.so` (product) · `marketplace.pryzm.so` (pending) |
| **Next review** | On substantive code shift; the §4 tables are re-measured, never transcribed forward |

---

*End — PRYZM Product Vision, revised 2026-08-11 — CANONICAL.*
