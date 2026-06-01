# PRYZM — Typology Expansion Roadmap

> **Stamp**: 2026-06-01 · **Status**: CANONICAL · **Horizon**: H2 sibling (3-year)
> **Authority**: this doc owns **the multi-typology generative-AI vision** — the expansion from apartment-layout (the current proof) to **N typologies** (gym, pharmacy, car park, office, hospital, school, retail, hotel, lab, library, museum, restaurant, warehouse, …) covering the entire architectural built-environment market.
> **Strategic source**: [product-vision §5 user journey Step 2](../../01-strategy/product-vision.md) — the RAC chatbot asks "what project type?" and routes to a typology-specific pipeline. The platform's value is breadth across typologies × depth per typology.
> **Companion**: [platform-strategy.md](../../01-strategy/platform-strategy.md) — the marketplace is the ecosystem mechanism for typology expansion.

---

## §1 — The thesis

PRYZM's apartment-layout AI workflow is **proof of concept**. It works because we built:
- A 14-room-type constraint database (`programRules.ts`)
- A 7-layer cognition stack ([site-and-cognition §3](../../01-strategy/site-and-cognition-strategy.md))
- 4 deterministic engines (D-TGL apartment · D-FLE furniture · D-LE lighting · D-CE ceiling)
- 1 LLM-routed workflow (apartmentLayout) + 1 deterministic fallback
- The Inspect/Data/Sheet stack that downstream consumes the result

The unit pattern is generalisable. **Every architectural typology has the same shape**: a brief → constraints → spatial decomposition → element placement → cognition validation → BIM output. What differs is the **content** (which rooms, which adjacencies, which regulations, which furniture, which equipment, which sequencing).

**The bet**: PRYZM expands by adding typologies the same way it expanded by adding element types. A typology pipeline is a first-class artefact — a "Typology Pack" published to the marketplace, consumed by the editor, routed to by the RAC chatbot. **Scale = breadth of typologies × depth per typology.**

For an enterprise BIM/AEC platform serving thousands of practising architects:
- Year 1: **3 typologies** (apartment + 2 more)
- Year 2: **10 typologies**
- Year 3: **25+ typologies** (covering the AEC mainstream)
- Year 5: **50+ typologies** + community-authored long tail (museum, prison, embassy, place-of-worship, observatory, etc.)

---

## §2 — The RAC chatbot routing flow

The user-side experience (per [product-vision §5](../../01-strategy/product-vision.md)):

```
User signs up / logs in
   │
   ▼
RAC chatbot: "Hi — who are you working as today?"
   │
   ▼  user picks: architect | interior-designer | developer | engineer
   │                | facility-manager | quantity-surveyor | self-builder | other
   │
   ▼  (role context stored on session; affects panel layout, vocabulary,
   │   default-workflow choices)
   │
   ▼
RAC: "What kind of project are you starting?"
   │
   ▼  user picks from the Typology Picker (see §3 below)
   │
   ▼  (each typology is a registered TypologyPack — see §4 architecture)
   │
   ▼
RAC: "Where is the site? Tell me about the brief."
   │
   ▼  geolocation + brief capture (site substrate + program substrate)
   │
   ▼
TypologyPipelineRouter.dispatch(typologyId, role, site, brief)
   │
   ▼  routes to the typology-specific pipeline:
   │
   ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────┐
   ▼             ▼             ▼             ▼             ▼         ▼
apartment    gym         pharmacy     car-park     office     hospital    …
pipeline     pipeline    pipeline     pipeline     pipeline   pipeline
   │             │             │             │             │         │
   ▼             ▼             ▼             ▼             ▼         ▼
Each pipeline runs its own:
- constraint database query (per-typology programRules)
- generative AI workflow OR deterministic engine
- element-type creation (apartments need walls+doors+windows;
                          car parks need bays+ramps+columns)
- per-typology validators (gym needs accessibility-compliant
                            shower count; pharmacy needs
                            controlled-substance-storage volume)
- per-typology cognition validation
- BIM output (the IFC4X3 export carries the typology classification)
```

The router itself is universal; each typology pack defines its pipeline.

---

## §3 — The typology picker UI

Per `apps/editor/src/ui/onboarding/typologyPicker.ts` (to be implemented in Phase 1 — see [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md)):

The picker organises typologies by **category** (10 categories) with **typology cards** showing:
- Name + thumbnail
- One-line description
- Status: `available` · `beta` · `coming soon` · `marketplace`
- Required plan tier (Solo / Studio / Mid-firm / Enterprise)
- "Last updated" stamp

The 10 categories (mapped to the Royal Institute of British Architects + AIA practice classifications):

| Category | Examples |
|---|---|
| **Residential** | Apartment · house · townhouse · co-living · hostel · student housing |
| **Workplace** | Office · co-working · headquarters · creative studio · serviced office |
| **Retail + hospitality** | Restaurant · café · bar · hotel · shop · supermarket · shopping centre |
| **Healthcare** | Hospital · clinic · pharmacy · GP surgery · dental · veterinary · care home |
| **Education** | School · university · library · early-years nursery · vocational college |
| **Sports + leisure** | Gym · fitness studio · pool · arena · cinema · spa |
| **Civic + cultural** | Museum · gallery · town hall · place of worship · community centre |
| **Industrial + logistics** | Warehouse · distribution centre · factory · workshop · data centre |
| **Transport** | Car park · transport interchange · airport terminal · maritime terminal |
| **Specialist** | Lab · cleanroom · prison · embassy · observatory · place-specific |

Customer organisations publishing typology packs (per [C40 Marketplace Economics](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md)) appear under "marketplace" — appearing organically alongside PRYZM-first-party typologies.

---

## §4 — The Typology Pack architecture

A **TypologyPack** is a first-class artefact, modelled on the `.pryzm-family` family pack (per [C07 Plugin SDK](../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md)). Each pack contains:

```
my-typology-pack.pryzm-typology    (ZIP container)
├─ manifest.json                    ← TypologyManifestSchema (zod-validated)
├─ program-rules.json               ← per-typology rule database (extends programRules.ts)
├─ room-types.json                  ← typology-specific room types + furniture specs
├─ regulatory-overlays.json         ← jurisdiction × typology regulation map
├─ ai-workflow.ts (compiled)        ← generative AI workflow (extends AiPlane workflow)
├─ deterministic-engine.ts          ← offline fallback engine (optional)
├─ validators/                      ← per-typology spatial + topological validators
│   ├─ accessibility.ts             ← (e.g. wheelchair turning circles per typology)
│   ├─ services.ts                  ← (e.g. plumbing minimums for gym showers)
│   └─ regulatory.ts                ← (e.g. fire-exit count per occupancy)
├─ furniture-presets/               ← typology-specific furniture sets (carries .pryzm-family refs)
├─ element-defaults/                ← default door/window/wall types per room
├─ thumbnail.webp                   ← typology-card image
└─ signing/                         ← Ed25519 signature
```

The pack registers via the family-platform infrastructure already in code (`packages/family-loader/`, `packages/family-runtime/`). Per [platform-strategy §3.2](../../01-strategy/platform-strategy.md), this is **content not code** — a typology pack can be authored without TypeScript skills (the JSON files cover 80% of customisation; AI workflow code is optional).

### §4.1 — TypologyManifest schema

```ts
interface TypologyManifest {
  id: TypologyId;                          // 'apartment' | 'gym' | 'pharmacy' | …
  displayName: string;                     // localized; honours C46
  category: TypologyCategory;              // one of the 10 from §3
  version: SemVer;
  description: string;
  thumbnail: string;                       // path inside the ZIP
  author: string;                          // 'PRYZM' | '<developer-id>'
  signature: Ed25519Signature;             // per C07
  requiredPlanTier: PlanTier;              // Solo | Studio | Mid-firm | Enterprise
  cognitionLayers: CognitionLayer[];       // which of L1-L7 are enforced
  aiWorkflowEntry?: string;                // path to the workflow module
  deterministicEngineEntry?: string;       // path to offline fallback
  programRulesEntry: string;               // path to JSON rules
  roomTypes: RoomTypeId[];                 // canonical typology room types
  defaultDrawingStandard?: DrawingStandard;// per C34
  marketplaceListing?: MarketplaceListing; // pricing + reviews
}
```

### §4.2 — The TypologyRegistry slot

The `PryzmRuntime` (per [architecture.md §3](../../01-strategy/architecture.md)) gains a new slot:

```ts
readonly typologyRegistry: TypologyRegistryStore;
```

Constructed at composition time. Seeded with PRYZM-first-party typology packs. Marketplace packs install via the Plugin SDK (per [C07 §3](../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md)).

### §4.3 — The TypologyPipelineRouter

A new package, `packages/typology-pipeline/`, that:
1. Receives `(typologyId, role, site, brief)` from the RAC
2. Resolves the TypologyPack from the registry
3. Loads the AI workflow + deterministic engine
4. Runs the pipeline (matches the apartment-layout flow but per-typology)
5. Emits validated layout candidates to the AI plane approval queue
6. On user accept, commits the layout via the standard commandBus path (per [C16](../../02-decisions/contracts/C16-COMMAND-AUTHORING-PROTOCOL.md))

This is a **new package** with its own contract (proposed C50 — see §10 below).

---

## §5 — The full typology roadmap (20+ typologies across 3 years)

| # | Typology | Category | Year | Quarter | Author | Status target |
|---|---|---|---|---|---|---|
| 1 | **Apartment** | Residential | 2026 Q2 | shipped | PRYZM-first-party | ✅ shipped (current state) |
| 2 | **House (single-family)** | Residential | 2026 Q3 | Phase 1 | PRYZM-first-party | Alpha |
| 3 | **Office (small <50 desks)** | Workplace | 2026 Q3 | Phase 1 | PRYZM-first-party | Alpha |
| 4 | **Townhouse / row house** | Residential | 2026 Q4 | Phase 1 | PRYZM-first-party | Alpha |
| 5 | **Co-living unit** | Residential | 2026 Q4 | Phase 1 | PRYZM-first-party | Beta |
| 6 | **Co-working space** | Workplace | 2027 Q1 | Phase 2 | PRYZM-first-party | Beta |
| 7 | **Gym / fitness studio** | Sports + leisure | 2027 Q1 | Phase 2 | PRYZM-first-party | Beta |
| 8 | **Pharmacy** | Healthcare | 2027 Q1 | Phase 2 | PRYZM-first-party | Beta |
| 9 | **GP surgery / clinic** | Healthcare | 2027 Q2 | Phase 2 | PRYZM-first-party | Beta |
| 10 | **Restaurant / café** | Retail + hospitality | 2027 Q2 | Phase 2 | PRYZM-first-party | Beta |
| 11 | **Shop / boutique retail** | Retail + hospitality | 2027 Q3 | Phase 2 | PRYZM-first-party | Beta |
| 12 | **Car park (multi-storey)** | Transport | 2027 Q3 | Phase 2 | PRYZM-first-party | Beta |
| 13 | **School (primary)** | Education | 2027 Q4 | Phase 2 | PRYZM-first-party | Beta |
| 14 | **Library** | Civic + cultural | 2027 Q4 | Phase 2 | PRYZM-first-party | Beta |
| 15 | **Hotel** | Retail + hospitality | 2028 Q1 | Phase 3 | PRYZM-first-party | GA |
| 16 | **Hospital (small)** | Healthcare | 2028 Q1 | Phase 3 | PRYZM-first-party | GA |
| 17 | **Warehouse** | Industrial + logistics | 2028 Q1 | Phase 3 | PRYZM-first-party | GA |
| 18 | **Care home** | Healthcare | 2028 Q2 | Phase 3 | PRYZM-first-party | GA |
| 19 | **Spa / wellness** | Sports + leisure | 2028 Q2 | Phase 3 | PRYZM-first-party | GA |
| 20 | **Veterinary clinic** | Healthcare | 2028 Q2 | Phase 3 | PRYZM-first-party | GA |
| 21 | **Day-care nursery** | Education | 2028 Q3 | Phase 3 | PRYZM-first-party | GA |
| 22 | **University seminar building** | Education | 2028 Q3 | Phase 3 | PRYZM-first-party | GA |
| 23 | **Supermarket** | Retail + hospitality | 2028 Q3 | Phase 3 | PRYZM-first-party | GA |
| 24 | **Distribution centre** | Industrial + logistics | 2028 Q4 | Phase 3 | PRYZM-first-party | GA |
| 25 | **Data centre (small)** | Industrial + logistics | 2028 Q4 | Phase 3 | PRYZM-first-party | GA |
| 26+ | **Long-tail (museum, prison, embassy, place-of-worship, observatory, cleanroom, etc.)** | Various | 2029+ | Phase 4 | Marketplace community | Marketplace |

**Phase 4 (2029+)**: the marketplace is the expansion mechanism. Community-authored packs cover the long tail. PRYZM-first-party focuses on (a) curated quality of the 25-typology core + (b) the cognition substrate that all marketplace packs build on.

---

## §6 — Per-typology pipeline pattern (the canonical shape)

Every typology pipeline shares the same 7-stage structure, varying only in content. Apartment is the worked example:

| Stage | Apartment example (current state) | Pattern (any typology) |
|---|---|---|
| **S1 — Brief capture** | RAC asks: bedroom count, square metres, balcony? | RAC asks typology-specific questions per `program-rules.json` `briefSchema` |
| **S2 — Site context** | Plot boundary + sun path + climate | Same for every typology (site substrate is uniform per [C19](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md)) |
| **S3 — Constraint resolution** | 14 room types from `programRules.ts` | Typology pack's `program-rules.json` |
| **S4 — Generative or deterministic** | AI workflow `apartmentLayout/workflow.ts` OR D-TGL fallback | Per pack: `ai-workflow.ts` + `deterministic-engine.ts` |
| **S5 — Per-typology validators** | apartment validators (`validateApartmentLayout`) | Pack's `validators/*.ts` (accessibility · services · regulatory) |
| **S6 — Cognition validation** | 7-layer cognition stack runs (envelope reject, daylight, adjacency) | Same stack; rules per pack |
| **S7 — BIM emission** | walls + doors + windows via `wall.batch.create` + `door.create` + `window.create` | Generic element creation (each pack declares which element types) |

The 7 stages are codified in proposed contract **C50 — Typology Pipeline Contract** (see §10).

### §6.1 — How different typologies differ at each stage

| Stage | Apartment | Gym | Pharmacy | Car park |
|---|---|---|---|---|
| **S1 brief** | bedroom count · floor area | members · pool? · classes? | dispensing volume · consultation room? | bay count · vehicle classes |
| **S3 rules** | 14 room types · adjacency matrix | weight area · cardio · studios · changing · admin | dispensing area · consultation · controlled-substance store · queue area · customer counter | parking bays · ramps · pedestrian routes · ventilation zones |
| **S4 engine** | D-TGL squarify | D-GYM (gym layout) — zoning + sight-lines | D-PHARMA — counter + storage + queue topology | D-PARK — bay packing + ramp slope + structural grid |
| **S5 validators** | room area + door topology + adjacency | accessibility shower count · changing-room privacy gradient · emergency egress | controlled-substance storage volume · consultation privacy · customer-queue length · GDPR for prescription data | ramp slope (per local code) · structural column spacing · ventilation CFM/bay · accessibility-bay count |
| **S6 cognition** | privacy gradient, daylight, circulation | sound separation between studios + cardio · sweat zoning | pharmacy-specific code compliance · access control · CCTV coverage | fire exit count · car-to-pedestrian segregation |
| **S7 BIM** | walls · doors · windows + furniture | walls + doors + windows + gym equipment families | walls + doors + counters + secure storage families | bays (as parametric annotations) + ramps + columns |

The takeaway: the **pipeline shape is uniform** (S1→S7); the **content per stage is per-typology**.

---

## §7 — Per-typology development effort

The first typology (apartment) took ~6 months of focused engineering — the constraint database alone was 6+ months of architect curation. Subsequent typologies are cheaper because:

- The pipeline infrastructure (router, registry, validators framework) is reused
- The cognition stack is reused
- The element-creation primitives (wall / door / window etc.) are reused
- The site + climate substrate is reused
- Only the per-typology content (rules, AI prompts, validators, furniture) needs authoring

Estimated effort per typology (after apartment is shipped):

| Effort component | First typology | Subsequent typology |
|---|---|---|
| Pipeline infrastructure | ~12 dev-weeks (one-off) | reused (0 weeks) |
| Constraint database authoring (rules, adjacencies, programs) | ~6 architect-weeks per typology | per typology |
| Per-typology AI workflow (prompts + retry logic) | ~4 dev-weeks | ~3 dev-weeks |
| Per-typology deterministic engine (D-*) | ~6 dev-weeks | ~4 dev-weeks |
| Per-typology validators | ~3 dev-weeks | ~2 dev-weeks |
| Furniture / element presets | ~3 architect-weeks | per typology |
| QA + reference projects | ~3 weeks | ~2 weeks |
| **Total per typology (steady state)** | **~31 weeks one-off + 17 per typology** | **~17 weeks** |

At steady state, a 6-person engineering team + 1 architect-consultant per typology ships ~1 typology per quarter. Marketplace authoring (community-published) shortens this further: a domain-expert architect can author the rules + validators without engineering involvement.

---

## §8 — Marketplace as the typology-expansion engine

Beyond the 25-typology PRYZM-first-party curated core, **the long tail is community-authored**. Per [platform-strategy §3.2 + §3.3](../../01-strategy/platform-strategy.md), typology packs follow the same marketplace economics as plugins:

- **70 / 30 split** between author and PRYZM (per [C40 §1.1](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md))
- **Curated category** review per [C40 §1.11](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) (typology packs claim regulatory compliance — they pass through curation, not open publish)
- **Ed25519 signed** per [C07 §3.2](../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md)
- **Pricing**: typology packs typically subscription-priced (continued regulatory updates) — e.g. "UK Pharmacy Pack: £49/year"
- **Regional + jurisdictional variants**: a "US-Pharmacy-Pack" and "UK-Pharmacy-Pack" are separate artefacts (different regulatory overlays). Marketplace authors choose which jurisdictions they cover.

**Expected marketplace economics** (Phase 3 / Year 3):
- ~50 PRYZM-first-party typology packs (curated; included in plan tiers)
- ~200 community-authored typology packs (regional variants + niche typologies)
- ~£50–500/year per pack (subscription)
- Top 10 marketplace authors earning > £20k/year each (per [platform-strategy §11](../../01-strategy/platform-strategy.md) target)

---

## §9 — Per-typology code surface (the work that gets done)

For each typology added, the engineering team ships:

| Surface | Item per typology |
|---|---|
| Schema | `packages/schemas/src/typology/<id>/programRules.ts` + `roomTypes.ts` + `validators.ts` |
| Pipeline | `packages/typology-pipeline/src/typologies/<id>/index.ts` (registers + wires) |
| AI workflow | `packages/ai-host/src/workflows/<id>Layout/workflow.ts` + `generate.ts` + `validate.ts` |
| Deterministic engine (optional) | `packages/ai-host/src/workflows/<id>Layout/det/<engine-name>.ts` |
| Furniture preset | `packages/schemas/src/typology/<id>/furniturePresets.json` |
| Validators | `packages/typology-pipeline/src/typologies/<id>/validators/<set>.ts` |
| Tests | `packages/typology-pipeline/__tests__/<id>/*.test.ts` (≥ 50 tests per typology) |
| Bench | `apps/bench/src/benches/<id>-layout.bench.ts` |
| Reference projects | `apps/editor/__fixtures__/typologies/<id>/*.pryzm` (≥ 5 fixture projects per typology) |
| UI | `apps/editor/src/ui/typology/<id>/IntroPanel.tsx` (typology-specific brief capture) |
| Docs | `docs/03-execution/specs/SPEC-NN-TYPOLOGY-<id>-PIPELINE.md` |

Plus the universal infrastructure shipped once (Phase 1):

- `packages/typology-pipeline/` (the router + registry + framework)
- `apps/editor/src/ui/onboarding/RACChatbot.tsx` (RAC chatbot UI)
- `apps/editor/src/ui/onboarding/TypologyPicker.tsx` (the picker UI)
- `packages/schemas/src/typology/manifest.ts` (TypologyManifest schema)
- Proposed contract **C50 — Typology Pipeline Contract** (the binding rules for typology packs)

---

## §10 — Proposed new contract: C50

**C50 — Typology Pipeline Contract** (DRAFT — to author in Phase 1):

| Section | Owns |
|---|---|
| §1 Invariants | Typology pack manifest schema · per-typology validators must run · registry append-only · ed25519 signed · marketplace curated for regulatory claims |
| §2 Schema | TypologyManifest · TypologyPack ZIP layout · per-typology rule database shape · pipeline 7-stage signature |
| §3 Stores | TypologyRegistryStore (composeRuntime slot) · TypologyPipelineRouter |
| §4 Commands | `typology.register` · `typology.unregister` · `typology.execute` (the pipeline trigger) · `typology.upgrade` (when a pack ships a new version) |
| §5 UI | RAC chatbot · TypologyPicker · per-typology IntroPanel · per-typology validator-failure UI |
| §6 CI gates | `check-typology-manifest-valid` · `check-typology-validator-coverage` · `check-typology-ai-workflow-deterministic-fallback` |
| §7 NFT targets | Per-typology layout generation < 60 s · typology-pack load < 500 ms |
| §8 Migration | Per-typology pack versioning + migrations (per [C47](../../02-decisions/contracts/C47-FILE-FORMAT-VERSIONING.md)) |
| §9 What is NOT in scope | The 25 typology-pack contents (those are individual deliverables not binding rules) |

This contract is **Phase 1 priority** (must ship to support the multi-typology vision). Listed in [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) and [annual-2026.md](./annual-2026.md).

---

## §11 — How the chatbot routes per role

The user's role (from RAC Q1) modulates **which typologies are surfaced** and **how the brief is captured**:

| Role | Typologies prioritised | Brief vocabulary | Default panels |
|---|---|---|---|
| **Architect** | Full picker (all 25+ typologies) | architectural terms (room, programme, brief, plot) | full editor |
| **Interior designer** | Hospitality + retail + workplace + healthcare clinics | "space" + furniture-led + finishes | interior-focused panels |
| **Developer (real estate)** | Residential + workplace + mixed-use | unit count + GIA + saleable area + return-on-cost | financial overlays |
| **Engineer (structural/MEP)** | Service-heavy typologies + warehouse + factory | structural grid + load + services routing | engineering panels |
| **Facility manager** | Existing-building scope + healthcare + workplace | space utilisation + cost-in-use + COBie | inspect-focused panels + [C35 COBie](../../02-decisions/contracts/C35-COBIE-FM-HANDOVER.md) |
| **Quantity surveyor** | Cost-heavy typologies (mostly post-design) | quantity takeoff + cost rates + bill of quantities | C38 5D cost panel |
| **Self-builder** | Residential (apartment + house) only | non-jargon: "rooms" + "size" + "budget" + "style" | simplified editor |
| **Other** | Full picker; brief is free-form | free-form | full editor |

The role × typology combinations matter: an architect designing a hospital sees a different chatbot question set than a facility manager retrofitting a hospital. Each combination is a `(role, typology, intent)` triple — registered in `packages/typology-pipeline/src/routing/intentMatrix.ts`.

---

## §12 — Cross-references

| Doc | Relationship |
|---|---|
| [product-vision.md §5](../../01-strategy/product-vision.md) | The user journey that this roadmap operationalises |
| [platform-strategy.md](../../01-strategy/platform-strategy.md) | Typology packs follow the marketplace economics |
| [site-and-cognition-strategy.md](../../01-strategy/site-and-cognition-strategy.md) | The 7-layer cognition stack each typology validates against |
| [cadence-and-planning-system.md](./cadence-and-planning-system.md) | This roadmap is H2 sibling; phases trace to H2 phase roadmaps |
| [roadmap-phase-1-alpha.md](./roadmap-phase-1-alpha.md) | Phase 1 typology deliverables |
| [roadmap-phase-2-beta.md](./roadmap-phase-2-beta.md) | Phase 2 typology deliverables |
| [roadmap-phase-3-ga.md](./roadmap-phase-3-ga.md) | Phase 3 typology deliverables |
| [../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md](../../02-decisions/contracts/C07-PLUGIN-SDK-AND-MARKETPLACE.md) | Plugin SDK = the deployment surface |
| [../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md](../../02-decisions/contracts/C09-AI-AND-VISIBILITY-INTENT.md) | AI plane = the workflow runtime |
| [../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md](../../02-decisions/contracts/C40-MARKETPLACE-ECONOMICS.md) | Marketplace economics per typology pack |
| Proposed C50 (this doc §10) | Binding contract for typology packs (to author in Phase 1) |

---

*End — PRYZM Typology Expansion Roadmap, 2026-06-01 — CANONICAL.*
