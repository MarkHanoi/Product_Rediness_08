# 0269 — Compliance-authoring (parcel → zoning → buildable-envelope → authoring) is a September Pipeline-A pillar, built jurisdiction-agnostic, Denmark-first

**Status**: PROPOSED
**Date**: 2026-07-17
**Deciders**: architecture team + founder (business direction: "select a plot → see what you can build → then build it"; competitive reference: Archistar, whose moat is government-side zoning/compliance distribution)
**Related contracts**: [C57 — Parcel Data Layer](../contracts/C57-PARCEL-DATA-LAYER.md) (the normative form of the parcel-ingestion half), [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (the normative form of the compliance-engine half — the core value prop), [C19 — Site Model & Parcel](../contracts/C19-SITE-MODEL-AND-PARCEL.md) (the Site the parcel commits to + the mutable zoning fields the envelope populates; C57/C58 fill C19 §9/§10.2's deferred jurisdiction registry), [C12 — Geospatial](../contracts/C12-GEOSPATIAL.md) (the coordinate substrate + single projector reused), [C50 — Typology Pipeline](../contracts/C50-TYPOLOGY-PIPELINE.md) + [C53 — Generative Layout Engine](../contracts/C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (the authoring substrate the envelope constrains — slider-as-intent, no parallel knob), [C55 — Geodata Analytical Layers](../contracts/C55-GEODATA-ANALYTICAL-LAYERS.md) (the sibling pluggable-provider-over-Site precedent), [C23 — Provenance & AI Audit](../contracts/C23-PROVENANCE-AND-AI-AUDIT.md) (per-source provenance/attribution).
**Related ADRs**: [ADR-0065](./ADR-0065-geodata-analytical-layers-pluggable-provider.md) (the pluggable-provider-draped-over-the-Site decision this mirrors — providers are app-layer adapters, no country hardcoded in core), [ADR-0061](./ADR-0061-building-graph-bidirectional-edit-substrate.md) (determinism mechanics the envelope solver inherits), [ADR-0088](./ADR-0088-forma-ao-opt-in-and-gentle-overpass-mirrors.md) (the same-origin geo-proxy + cache pattern the parcel/zoning proxy clones).
**Engineering specs**: [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) (the "explain-why" artefact), [SPEC-PARCEL-SELECTION](../../03-execution/specs/SPEC-PARCEL-SELECTION.md) (proposed — the map interaction).
**Reference audits**: [ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md](../../04-reference/ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md) (the gap audit that scoped this, L-398..404), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/PARCEL-ZONING-FEATURE-SCOPING.md) (L-380 scoping), [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) (L-383 Denmark reference).

## Context

The founder's target loop is: **select a real parcel → know the local compliance envelope → author the compliant building in-browser → export/interop.** The competitive reference is **Archistar**, whose moat is *government-side compliance/zoning distribution* — it tells you what you may build on a plot before you draw. PRYZM's claimed edge is the inverse: a genuinely strong **browser authoring substrate** (deterministic generative layout engines for apartment / house / residential-building, the typology pipeline C50, the editable building graph C52, the BIM element pipeline) — once the rules are known, PRYZM can generate and author the compliant building better than Archistar, which has weak authoring.

The verified state of the codebase (Archistar gap audit, 2026-07-17):

- **Parcel *geometry* select — Spain only, input side — SHIPPED.** `ParcelProvider` + `CatastroParcelProvider` (`apps/editor/src/ui/site/parcel/`) + a same-origin proxy `server/parcelZoningProxy.js` (mounted `server.js:363`, `/api/catastro/parcel`) are built and wired into the 2D GIS map; a selected parcel commits down the **identical** immutable path a drawn boundary uses (`buildBoundaryFromLatLonRing` → `site.parcel-boundary-set`, C19 §1.4).
- **The compliance intelligence — 0% built.** No `ZoningProvider`, no `ZoningRulesEngine`, no `computeBuildableEnvelope`, no `BuildableEnvelope`, no `JurisdictionZoningContract` anywhere in the tree (grep-confirmed). `site.updateZoning` (the output destination) exists, but nothing computes an envelope to call it. Turf (the setback-inset geometry) is not even a dependency. There is no "explain-why" compliance report.
- **The two halves are disconnected.** Generators read `getParcelBoundary()` only; they consume no setback inset or height cap. Even a computed envelope would not reach PRYZM's authoring strength.
- **Data reality (the decisive finding).** The *numeric* building rules (height / FAR / setback) are **PDF-trapped everywhere except Denmark**. Denmark (Plandata.dk) is the only jurisdiction with a single national register of *structured* zoning fields, **and** the only one with free national LOD2 + terrain. Spain (Catastro) is the only *keyless* parcel source (already built) but its numbers are PDF-trapped and it has poor free 3D context. Switzerland has the cleanest parcels (one EGRID national cadastre) but a 26-canton PDF federation for the numbers.
- **Governance was unauthored.** C57 (Parcel Data Layer) and C58 (Zoning Rules Engine) were *proposed but not written* — the C00 index ended at C56 — so both were gaps, not contracts. C19 §9 *explicitly defers* "jurisdiction-specific building-code databases" and §10.2 leaves the jurisdiction-registry shape *pending* — exactly the C58 slot. Per PRYZM's governance mandate, **canonical contracts must exist before implementation.**

The founder has committed this loop as a **September launch pillar**. The decision is therefore: **how to structure the compliance-authoring subsystem, which jurisdiction to build it on, how to sequence it, and how to do so honestly** — given (a) the honesty mandate (a curated estimate must never read as a legal fact), (b) the P0 launch blockers that share the September critical path, and (c) the jurisdiction-agnostic scaling requirement.

## Decision

**Compliance-authoring is a first-class product pillar (Pipeline-A / "site-feasibility"), built as a jurisdiction-agnostic core with per-jurisdiction adapters + curated rule packs, proven Denmark-first (cleanest structured data) and run on Spain by an adapter swap, with the envelope wired to constrain the existing generators — governed by C57 + C58 + SPEC-COMPLIANCE-REPORT before implementation.**

Concretely:

1. **Two separable subsystems, jurisdiction-agnostic core.** A **Parcel Data Layer** (C57 — provider-agnostic parcel *geometry+attributes* ingestion) and a **Zoning Rules Engine** (C58 — `ZoningProvider` adapters + a deterministic `ZoningRulesEngine` producing a `BuildableEnvelope`). **GeoJSON/WGS84 is the one canonical interchange**; nothing downstream of an adapter sees the source format/CRS. The engine contains **zero** jurisdiction-specific logic — all jurisdiction knowledge lives in adapters + data packs. This mirrors ADR-0065 (pluggable providers, no country hardcoded in core) exactly.

2. **Two-fidelity honesty model (the core discipline).** Because numbers are PDF-trapped outside Denmark, the engine resolves an envelope in priority order — `structured` (provider numeric fields) → `estimated-ruleset` (a curated, versioned, per-field-provenance-tagged `JurisdictionZoningContract`, mirroring `rules/programRules.ts`) → `none` (no envelope; graceful fallback to draw). Every envelope carries a mandatory `confidence` label; an `estimated-ruleset` envelope is **never** presented as authoritative, enforced by a CI fidelity-label gate (mirroring the shipped `check-windcfd-beta-label.ts`). This is the L-373 credibility discipline made binding.

3. **"Explain-why" is the deliverable, not just the number.** Every envelope constraint cites its source rule (value · zone · source · per-field provenance · ordinance ref) via a `DerivationTrace`; SPEC-COMPLIANCE-REPORT renders it. This is the specific packaging Archistar sells.

4. **The envelope constrains generation (the connection that *is* the thesis).** The setback inset + maxHeight thread into the **existing** generators (C50/C53) as generation bounds through the **existing** trigger — slider-as-intent preserved, no parallel knob (C53 L-PRINCIPLE). A generated building provably fits inside the envelope. This connects compliance to the authoring moat.

5. **Denmark-first, Spain-for-breadth, Switzerland-later.** Build the engine where the data is cleanest (Denmark — structured zoning + free LOD2 + terrain), then run it on the already-shipped keyless Spain parcel path by an adapter+pack swap. Switzerland is a deliberate later bet gated by the Terrara buy-vs-build decision. **Spain stays the business-priority market; Denmark is the technical reference** — not a market change.

6. **Sequencing L-398 → L-404**, additive and behind a flag: **B0** governance + engine skeleton + Turf dep + L0 schemas (L-398/L-400/L-403 — *this ADR + C57/C58/SPEC are B0*); **B1** DK zoning engine (L-398/L-399); **B2** envelope→authoring bridge (L-401); **B3** compliance report + 3D volume + CI label gate (L-402); **B4** Spain bring-up (L-399); **B5** DK demo fidelity (L-404). The Parcel Data Layer lift to L2 `@pryzm/site-parcel-data` is L-400.

7. **Governed before built.** C57, C58, and SPEC-COMPLIANCE-REPORT are authored (this commit) ahead of implementation, per the governance mandate. C19 §10.2 references C58 on ratify.

The normative invariants live in C57 + C58; the report design in SPEC-COMPLIANCE-REPORT; this ADR records *why this structure, this jurisdiction order, and this honest scope* over the alternatives.

## Consequences

- **Positive:** the compliance half (Archistar's moat) gets a real architecture and a shortest-credible path — one jurisdiction end-to-end with the envelope actually constraining generation (~8–11 focused dev-weeks on top of the shipped parcel P0). The jurisdiction-agnostic core means a new market is an adapter + a curated pack, not a core edit (proven by building on DK and running on ES). The honesty model + CI label gate keep a curated estimate from ever masquerading as a legal fact — the single biggest credibility risk for a compliance product. The envelope→generation bridge is the differentiator: PRYZM authors the compliant building, which Archistar cannot. Every fetched fact and derived number is attributable (C23 provenance). Governance-before-code satisfies the mandate and reserves the C57/C58 slots cleanly. It reuses shipped seams throughout (Catastro proxy, `buildBoundaryFromLatLonRing`, `site.updateZoning`, the generators) — no net-new map infra, no parallel generator.
- **Negative / trade-offs:** **it competes with P0 launch blockers.** The September critical path is L-334 (silent element-loss / data-integrity), L-391 (real-time collab has no network backend / last-write-wins), and L-396 (free-plan durability) — all unresolved. This compliance track adds ~8–11 wk and **must not ship as "launch" until L-334 + L-391 close** (a compliance demo atop silent data-loss + LWW collab is not launchable). It therefore runs *dark* (behind a flag), additive, in parallel — a Q4/Q1 competitive-wedge deliverable, not itself a September gate. The **recurring cost is rule-pack curation, not code** — where numbers are PDF-trapped (all of CH, most of ES), maintaining `JurisdictionZoningContract` packs is an ongoing business cost (or a Terrara-style buy) — a business-model decision, not an engineering one. Turf is a new dependency (lockfile-sync discipline). Denmark's best-fidelity 3D context needs an offline native-binary bake toolchain (kept out of the Fly app image — L-404).
- **Honest positioning consequence:** PRYZM **cannot** credibly claim "European Archistar" in September — the compliance intelligence is ~5% built (geometry-fetch only). The honest September claim is *"PRYZM authors compliant-ready buildings on real European parcels; local-compliance automation is on the roadmap, Denmark-first."* Saying more would fail the honesty mandate.
- **Provenance:** every parcel fetch (C57 §1.4) and every envelope constraint (C58 §1.3) records source · version · license · confidence, so the compliance report and any downstream AI consumer inherit auditable provenance (C23).

## Alternatives considered

- **Hardcode a single jurisdiction's zoning logic in the site view / generators.** Rejected: freezes the subsystem to whichever jurisdiction ships first, forces a core edit for every new market, and entangles per-jurisdiction CRS/format/PDF-curation into L1/L2 — the exact anti-pattern ADR-0065 rejected for geodata layers. The provider-adapter + rule-pack split is the whole point.
- **Build Spain-first (it is the business market and the parcel path already ships).** Rejected as the *engine* home (kept as the *breadth* target): Spain's numbers are PDF-trapped and it has poor free 3D context, so building the engine there means building it against the worst data and a flat demo. Denmark's structured national register + free LOD2/terrain let the engine be proven on clean data with the least curation friction, then run on Spain's shipped keyless parcel path by an adapter swap — the jurisdiction-agnostic design makes "build on DK, run on ES" a pure adapter change. Spain remains the business priority and the September *demo* jurisdiction.
- **Present estimated envelopes as authoritative (simpler UX, looks more finished).** Rejected outright: a curated estimate shown as a legal fact is worse than no number and violates the L-373 honesty mandate. The two-fidelity model + confidence label + CI gate are non-negotiable — they are what makes the product trustworthy.
- **Use an AI/LLM to read the ordinance and emit the envelope at runtime.** Rejected for the envelope path: a compliance number a user relies on must be reproducible and defensible (byte-deterministic), which a runtime LLM is not. An LLM MAY help *curate* a rule pack offline (a reviewed static artefact), but the runtime solve reads that artefact deterministically. No model call is on the envelope path (C58 §1.1).
- **Ship compliance as a September launch pillar on the critical path.** Rejected: the P0 blockers (L-334 data-integrity, L-391 collab) are the real September critical path; a compliance demo on top of silent element-loss + last-write-wins collab is not launchable. Compliance is committed as a pillar but sequenced *additively, behind a flag, behind the P0 blockers* — the September deliverable is the Spain parcel-select authoring demo + honest roadmap messaging.
- **Do nothing / keep parcel-select as geometry-only.** Rejected: geometry-fetch alone demonstrates none of the compliance intelligence that defines the category, and leaves PRYZM's authoring edge disconnected from the site-feasibility loop the founder is targeting.

## Open decisions deferred to humans (recorded, not resolved here)

- **CF-1 — Headline pillar vs Phase-B.** Whether site-feasibility/zoning-intelligence is a *headline V1 positioning wedge* or a *Phase-B feature*. This ADR commits it as a pillar and sequences it behind the P0 blockers; the *messaging tier* is a founder decision (gap audit CF-1). See the VISION note below.
- **CF-2 — Terrara buy-vs-build (Switzerland + the ES curation long-tail).** License a normalizer (Terrara, 4M parcels / 3,000+ municipal codes, but closed/undocumented API + pricing UNVERIFIED) vs hand-maintain rule packs. Recommendation: build Spain packs, evaluate Terrara for the CH fast-follow; do not silently commit. Commercial decision.
- **CF-3 — Engineering-context vs Forma-abstract default view** (inherited from L-374 §7.5): DK LOD2 fidelity vs the deliberately-abstract massing study default. Founder sets the default.
- **VISION wedge** — a one-line compliance-authoring pillar belongs in the product vision. The canonical vision docs are `docs/01-strategy/STR-02-product-vision.md` (roadmap) and `docs/01-strategy/STR-12-site-and-cognition-strategy.md §2.1` (which already declares cadastral plot boundary + regulatory context as first-class site substrate, but framed aspirationally). Elevating it from "backdrop data" to a *named product wedge* is exactly CF-1 (headline vs Phase-B) — a founder messaging decision — so this ADR **records the recommended line but does not edit the vision doc** (avoiding a conflict with an open human decision). Recommended STR-12 §2.1 line: *"**Site-feasibility (compliance-authoring)** — select a real parcel, derive its buildable envelope from local zoning (jurisdiction-agnostic engine, Denmark-first reference), and author the compliant building in-browser: 'select a plot, see what you can build, then build it.' (Governed by C57/C58; sequenced behind the V1 launch blockers.)"*


---

## Amendment 2026-07-20 — live verification changes the shape of this decision

Evidence: `docs/04-reference/spain/SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md` (endpoint
responses, not portal descriptions). Audit rows **L-438**, **L-439**.

### What the pass established

**There is no region in Spain where a live geometry service alone yields a parcel-level,
legally-usable buildable envelope.** Every service checked stops at zone-code-only,
codes-plus-document-reference, or real numbers at the wrong granularity.

This does not overturn the ADR's jurisdiction-agnostic, two-fidelity decision — it **validates
it and inverts the expected weighting**. `structured` was scoped as the normal path with
curation as the fallback for weak regions. The truth is the reverse: **curation is the primary
mechanism everywhere, including in the two strongest numeric services found.**

### Consequences for the build sequence

1. **Sequence by curation cost per SEED municipality, not by API quality.** API quality is
   uniformly insufficient, so it no longer discriminates between regions. The real variable is
   how many SEED municipalities a given curation effort unlocks
   (`docs/04-reference/spain/seed_counts_by_ccaa.csv`).
2. **"Phase 1 = three high-quality API regions" is not a real category.** Catalonia, Madrid and
   Valencia need the same PDF curation as everyone else; what they offer is better *geometry*
   and, for Catalonia, a scriptable document-discovery API (RPUC, INE-code-keyed).
3. **Granularity is now a first-class contract concern** — C58 §1.11.

### One prior claim corrected, and why it matters procedurally

The scoping material asserted Madrid's `PGOUM97/PG_CONDICIONES_EDIFICACION` exposes a *"real
numeric coefficient"*. That phrase is in the service's **prose description**; the layer returns
`COND_EDIF` (a SmallInt code) and `COEF_Z` (a String). Madrid's genuine numeric service is a
different, newer one — **VEDA** (`ANALISIS_URBANO/Visor_Edificabilidad`) — and it is
ámbito-level.

Procedurally this matters more than the fact itself: it is the same failure mode C58 §1.4 and
L-373 were written to prevent, occurring one layer earlier, in research. **Endpoint claims are
now only citable from an endpoint response, never from a service description.**

## Open decisions still deferred to humans (updated)

- **Does the C58 envelope model fit Spain at all?** Madrid publishes *Fondo de la Edificación*
  as a **polyline with no attributes** — buildable depth as a line you build up to, not a
  setback number. `setbacks + height + FAR` cannot represent that. Either extend C58 with an
  alignment/depth/street-width rule type, or ship only the zone subset that genuinely expresses
  setback+height+FAR. **This changes effort materially and is not an engineering call.**
- **Cédula urbanística budget + authority.** Castilla y León's own documentation directs
  parcel-level questions to a cédula — ~2,248 municipalities where it is the only path.
- **LLM extraction of legal figures** shown to users making financial decisions — policy ruling
  required before any curated number is surfaced.
- **Basque Country + Navarra scope.** Foral cadastre, not Catastro: **16 SEED municipalities
  where parcel-select does not function at all** until a second `ParcelProvider` exists.
- **A second verification pass** for the 11 still-UNVERIFIED regions before any of their
  existing "confirmed" claims are relied upon.
