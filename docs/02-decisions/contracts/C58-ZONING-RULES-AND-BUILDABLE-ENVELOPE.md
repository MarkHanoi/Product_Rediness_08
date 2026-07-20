# C58 — Zoning Rules & Buildable Envelope

> **Stamp**: 2026-07-17 · **Status**: DRAFT
> _DRAFT: the zoning-rules engine and the buildable-envelope solver are **0% built** (verified in the Archistar gap audit — G-ENG-1..5). This contract is the binding target shape; it asserts intent, not code-conformance. No slot here is claimed ACTIVE._
> **Scope**: governs the **zoning → buildable-envelope subsystem** — the `ZoningProvider` adapter interface, the canonical zoning-rule schema, the per-jurisdiction curated **`JurisdictionZoningContract`** rule-pack, the deterministic `ZoningRulesEngine` that solves `parcel + zoning-rules → BuildableEnvelope`, the two-fidelity (structured / estimated / none) honesty model, the "explain-why" derivation trace, and the envelope → authoring hand-off. This is the core compliance value-prop contract. Companion to [C57 Parcel Data Layer](./C57-PARCEL-DATA-LAYER.md) (which fetches the parcel) and consumer of [C19](./C19-SITE-MODEL-AND-PARCEL.md)'s mutable zoning fields.
> **Depends on**: [C03](./C03-SCHEMAS-COMMANDS-AND-STATE.md), [C19](./C19-SITE-MODEL-AND-PARCEL.md), [C57](./C57-PARCEL-DATA-LAYER.md), [C12](./C12-GEOSPATIAL.md), [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md), [C23](./C23-PROVENANCE-AND-AI-AUDIT.md).
> **Downstream**: [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) (renders the envelope + derivation trace); [C50 Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) + [C53 Generative Layout Engine](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) (consume the envelope as generation bounds); [C19 §1.6](./C19-SITE-MODEL-AND-PARCEL.md) (footprint-in-parcel-minus-setbacks — the envelope makes the setback numbers real).
> **Key principles**: **P5** (rule + envelope schemas pure — no THREE / no I/O), **P6** (the envelope reaches the model only via the `site.updateZoning` command bus — no direct store writes), **P8** (every exported engine / provider fn opens an OTel span `pryzm.zoning.<verb>`), **P1** (providers wired once).
> **Strategy**: [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (compliance-authoring pillar; Denmark-first because it has the cleanest structured zoning; jurisdiction-agnostic engine + per-jurisdiction adapters).
> **Audit context**: [ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md](../../04-reference/ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md) (G-ENG-1..5, G-BRG-1..3 — the single largest gap to the Archistar loop), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/PARCEL-ZONING-FEATURE-SCOPING.md) §4/§6.2/§6.3/§7, [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) §2.3. **This contract fills the slot C19 §9 explicitly defers ("jurisdiction-specific building-code databases — future contract") and C19 §10.2 leaves pending (the jurisdiction-registry shape).** On ratify, C19 §10.2 should reference C58.

---

## §1 — Invariants

Binding on every PR touching zoning ingestion, the rules engine, the envelope solver, or the envelope→generation bridge. Each has an §1.N id usable in `TODO(C58.N)` and `check-zoning-*.ts` failure messages.

### §1.1 — The envelope solver is deterministic; NO AI/ML/LLM

Given the same `(parcel ring + edge classifications + resolved rule set)`, the `ZoningRulesEngine` MUST produce a **byte-identical** `BuildableEnvelope`. The solver is pure geometry + arithmetic (Turf negative buffer for the setback inset; `area × maxHeight` for the volume). It MUST NOT call an AI model, an LLM, or any RNG.

- Determinism mechanics follow [ADR-0061](../adrs/ADR-0061-building-graph-bidirectional-edit-substrate.md): stable input ordering, no wall-clock, no `Math.random`.
- The **AI boundary**: an LLM MAY (elsewhere, C09) help *curate* a rule pack from a PDF ordinance offline, but the pack it produces is a reviewed static artefact (§1.6); the runtime envelope solve reads that artefact deterministically. No model call is on the envelope path.

**Why**: a compliance number a user relies on to decide what to build MUST be reproducible and defensible. "The AI said 18 m" is not a compliance claim; "zone 22a → maxHeight 18 m, from rule-pack `es-barcelona` field `maxHeight_m`, ordinance ref X" is. Reproducibility is the product.

### §1.2 — Two input fidelities, resolved in priority order, with a mandatory confidence label

Numeric building rules are structured only in Denmark; PDF-trapped elsewhere. The engine MUST resolve the rule set in this order and stamp the result's `confidence`:

1. **`structured`** — the `ZoningProvider` returns numeric fields directly (DK Plandata `bebyggelsesprocent` / `maksbygningshoejde` / `maksantaletager` / `anvendelse`; Madrid VEDA edificabilidad; Terrara). Use directly.
2. **`estimated-ruleset`** — the provider returns only a **zone class** → look up the per-jurisdiction curated **`JurisdictionZoningContract`** (§2.2: zone code → numeric envelope). Confidence `estimated-ruleset`.
3. **`none`** — no data → **no envelope**; graceful fallback to manual setback entry / draw (C57 §1.5). The envelope is hidden, never fabricated.

Every `BuildableEnvelope` MUST carry a `confidence` field ∈ `{ 'authoritative', 'structured', 'estimated-ruleset' }`. There is no unlabelled envelope.

**Why**: the honest core (scoping §6.3). Denmark's numbers are real; a Barcelona envelope is a curated estimate. Conflating them would be the single most damaging credibility failure for a compliance product.

### §1.3 — Every envelope constraint cites its source rule ("explain-why")

Each numeric constraint in a `BuildableEnvelope` (each setback, the height cap, FAR, coverage, each permitted use) MUST carry a **derivation entry** naming: the value, the `zoneCode` it came from, the rule-pack / provider `source`, the per-field provenance flag (`published-structured | ordinance-pdf | estimated`), and the `ordinanceRef` (URL / citation) where one exists.

- The engine emits a `DerivationTrace` (§2.4) alongside the envelope — a machine-readable, per-constraint "why".
- [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) renders this trace as the user-facing "explain-why" artefact — the specific thing the Archistar category sells.

**Why**: an envelope without its citation is an assertion, not a compliance result. The derivation trace is what makes the envelope *auditable* and *actionable* (the user can verify each number against the cited ordinance).

### §1.4 — An `estimated-ruleset` envelope is NEVER presented as authoritative (L-373 credibility)

Where `confidence === 'estimated-ruleset'`, every surface MUST mark it as estimated (distinct visual style + "verify against ordinance" affordance + the `ordinanceRef` link). It MUST NOT render in an authoritative / certificate-looking style. A **CI fidelity-label gate** enforces the label is present (mirroring the shipped `check-windcfd-beta-label.ts` pattern per C54).

**Why**: the L-373 data-credibility discipline. A curated estimate shown as a legal fact is worse than no number. The label is not decoration — it is a contract invariant with a CI gate.

### §1.5 — Jurisdiction-agnostic core + per-jurisdiction adapters; no jurisdiction hardcoded in the engine

The `ZoningRulesEngine` MUST contain **zero** jurisdiction-specific logic. It consumes a `ZoningRecord` (from a provider) + a `JurisdictionZoningContract` (a data pack) + the parcel; all jurisdiction knowledge lives in **adapters** (`ZoningProvider` implementations) and **data** (rule packs). Adding Denmark or Switzerland is a new adapter + a new rule pack — never an engine edit.

**Why**: the property that lets the engine be *built on Denmark's clean data and run on Spain by an adapter+pack swap* (ADR-0269). Hardcoding freezes the engine to whichever jurisdiction ships first — the exact anti-pattern C55/ADR-0065 rejected for geodata layers.

### §1.6 — Rule packs are curated, versioned, provenance-tagged

A `JurisdictionZoningContract` (§2.2) is a **curated, versioned** artefact. It MUST carry `jurisdictionId`, `source`, `crs`, a `lastReviewed` date, and **per-field provenance** (`published-structured | ordinance-pdf | estimated`) on every numeric field. A pack whose numbers were transcribed from a PDF ordinance MUST flag those fields `ordinance-pdf` (not `published-structured`), and any inferred value `estimated`.

- Rule packs mirror the existing normative-DB pattern (`rules/programRules.ts` — the architectural-program rules database).
- A pack has a `defaultConfidence` (`structured` | `estimated-ruleset`) that seeds §1.2 resolution.

**Why**: the honesty flag must be *per field*, because a single pack can mix a published height with a PDF-derived setback. Versioning + `lastReviewed` make curation freshness auditable (curation is the real long-tail cost — ADR-0269 buy-vs-build).

### §1.7 — The envelope maps onto C19's existing mutable fields via `site.updateZoning`; no new C19 output schema

The `BuildableEnvelope` numeric results map **1:1** onto the C19 `Parcel` mutable fields (`setbacks.{front,side,rear}`, `maxFAR`, `maxHeight`, `zoning.category`, `zoning.overlays`) and reach the model **only** through the existing `site.updateZoning` command (C19 §4.1, `packages/stores/src/site-commands/siteUpdateZoning.ts`). C58 introduces **no** new persisted output schema on the Site — only the transient `BuildableEnvelope` + `DerivationTrace` (which the report renders and which may be cached, not persisted as authored model data).

- Per **P6**, the UI never writes zoning fields directly; the engine result is dispatched as `site.updateZoning`.
- The parcel polygon is untouched (C19 §1.4 immutable) — the envelope only writes the mutable zoning fields.

**Why**: the output destination already exists and is proven. Inventing a parallel envelope-persistence schema would fork the site model. C58 computes; C19 stores; one command bridges them.

### §1.8 — The envelope constrains generation (envelope → authoring bridge)

A computed `BuildableEnvelope` MUST be threadable into the generative authoring pipeline as **generation bounds**: the setback **inset polygon** as the buildable footprint boundary, and `maxHeight` / `maxFloors` as the vertical cap. The generators (`generateResidentialFromBoundary`, apartment / house / typology-pipeline C50, layout engine C53) consume these bounds so a generated building **provably fits inside the envelope**.

- This connection is threaded through the **existing** generation trigger and the **existing** engine inputs — per C53's **L-PRINCIPLE / slider-as-intent**, the envelope adjusts *generation bounds*, NEVER introduces a parallel dimension knob or a second scorer.
- Permitted-use (`anvendelse` / `qualificació`) SHOULD seed the typology brief (`briefSchema`, C50) so program is compliance-aware (§10.2 — the program hand-off is a proposed seam).
- A generated footprint outside the inset, or a height above `maxHeight`, is a C19 §1.6 violation (soft-lint at edit time, hard at IFC export).

**Why**: the competitive thesis (ADR-0269 / gap audit G-BRG-1) — "beat Archistar on authoring *of the compliant* building". A computed envelope that does not reach PRYZM's authoring strength is a disconnected half. This invariant *is* the connection.

### §1.9 — The engine is pure L2 (no THREE / DOM / I-O / RNG)

The `ZoningRulesEngine` and `computeBuildableEnvelope` live in `packages/site-parcel-data/` (**L2**), consume L0 schemas + pure geometry (Turf), and return a `BuildableEnvelope`. They perform no I/O (the `ZoningProvider` fetch is a separate impure step, proxied per C57 §1.2), no rendering, no RNG. The only impure surfaces are the provider fetch (C57 proxy) and the editor executor that dispatches `site.updateZoning` (P6).

**Why**: purity makes the engine unit-testable to byte-determinism (§1.1) and reusable headless (a future server-side pre-compute, a batch feasibility run) without a UI or renderer.

### §1.10 — Every exported engine / provider fn opens an OTel span `pryzm.zoning.<verb>`

Per **P8**: `pryzm.zoning.fetchZoning`, `pryzm.zoning.computeBuildableEnvelope`, etc. Recommended attributes: `jurisdictionId`, `zoneCode`, `confidence`, `provider`, `resultFields` (which numeric fields resolved structured vs estimated), `insetAreaM2`, `maxHeight`.

**Why**: envelope solves are compliance-relevant and per-jurisdiction; uniform spans make fidelity distribution (how often we fall to `estimated-ruleset`) and correctness observable, feeding the C23 audit trail.

---

### §1.11 — GRANULARITY is a THIRD axis, independent of confidence (L-439)

**Added 2026-07-20 after the live Spain verification pass
(`docs/04-reference/spain/SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md`).**

§1.2 models fidelity (`structured` vs `estimated-ruleset`) and §1.4 models credibility. Neither
captures the failure the Spain pass exposed: **a source can be genuinely numeric, published,
and authoritative — and still be unusable, because it answers at the wrong GRANULARITY.**

Live examples:
- **Madrid VEDA** (`ANALISIS_URBANO/Visor_Edificabilidad`) publishes real `esriFieldTypeDouble`
  buildable-m² by use — at **`Ambito`** (planning-sector) granularity.
- **Valencia `InventarioSuSuz`** publishes `sup_m2` + `edif_m2` (a real, computed FAR of 0.756
  for Almassora) — at **sector** granularity, and only for *suelo urbanizable*.

Both are `structured` by §1.2 and would earn a high confidence label — yet **neither answers
"what may I build on THIS parcel."** Presenting a sector FAR as a parcel FAR is a category
error that no confidence chip corrects, because the number is not uncertain: it is *about
something else*.

**Therefore, normative:**

1. Every `ZoningRecord` and `BuildableEnvelope` MUST carry a `granularity` discriminator:
   `'parcel' | 'block' | 'sector' | 'ambito' | 'municipality' | 'unknown'`.
2. An envelope whose numbers derive from a granularity **coarser than `parcel`** MUST NOT be
   presented as a parcel envelope. It may be shown as **context** ("this sector permits
   X m² across Y m²") and MUST say so in the same sentence as the number.
3. The generator bridge (§1.8) MUST NOT consume coarser-than-parcel numbers as hard
   constraints. Building to a sector-derived FAR on one parcel silently over- or under-builds
   it, and the result would still validate against the containment check (L-428) because the
   footprint is legal — only the *quantity* is wrong.
4. `granularity: 'unknown'` is treated as coarser-than-parcel. It is never treated as parcel.

**Rationale.** §1.4 stops us presenting a guess as a fact. §1.11 stops us presenting a *fact
about the wrong thing* as a fact about this parcel — which is harder to notice precisely
because the underlying datum is correct and well-sourced.

## §2 — Schema

Pure Zod (L0), `packages/schemas/src/elements/site/zoning/` (per **P5**).

### §2.1 — `ZoningRecord`

What a `ZoningProvider` returns — the raw zoning at a parcel, before the engine resolves an envelope.

| Field | Type | Notes |
|---|---|---|
| `zoneCode` | `string` | jurisdiction zone code (ES MUC *clau* / Madrid *norma zonal* / DK `anvendelse` / CH zone type) |
| `zoneLabel` | `string \| null` | human label |
| `jurisdictionId` | `string` | resolves the rule pack (`'es-barcelona'`, `'dk'`, …) |
| `structuredFields` | `Partial<EnvelopeNumbers>` (§2.3) | any numeric fields the source published directly (DK case) |
| `overlays` | `string[]` | conservation / flood / heritage overlay codes |
| `provenance` | `ParcelProvenance` (C57 §2.2) | source / version / license / CRS |

### §2.2 — `JurisdictionZoningContract` (the curated rule pack)

The per-jurisdiction pack that fills PDF-trapped numbers (§1.6). Pure Zod (L0). Structure grounded in the scoping doc §7.

```ts
// packages/schemas/src/elements/site/zoning/JurisdictionZoningContract.ts  (proposed)
JurisdictionZoningContract = {
  jurisdictionId: string;                 // 'es-barcelona' | 'es-madrid' | 'dk' | 'ch-zh-8001'
  displayName: string;
  source: 'catastro-muc' | 'madrid-pgou' | 'oereb' | 'plandata-dk' | 'terrara' | 'manual';
  crs: string;                            // EPSG of the source geometry
  lastReviewed: ISODate;                  // curation freshness (§1.6)
  defaultConfidence: 'structured' | 'estimated-ruleset';
  zones: Array<{
    code: string;                         // matches ZoningRecord.zoneCode
    label: string;
    permittedUse: Array<'residential'|'commercial'|'industrial'|'mixed'|'civic'|'green'|'other'>;
    maxHeight_m: number | null;
    maxFloors: number | null;
    plotRatioFAR: number | null;          // edificabilitat / Ausnützungsziffer / bebyggelsesprocent→ratio
    maxCoverage: number | null;           // 0..1
    setbacks: { front_m: number|null; side_m: number|null; rear_m: number|null };
    fieldProvenance: Record<string, 'published-structured'|'ordinance-pdf'|'estimated'>;  // per-field (§1.6)
    ordinanceRef: string | null;          // citation of the governing legal doc (§1.3)
  }>;
}
```

> **No jurisdiction rule VALUES are asserted in this contract.** The schema defines the slots; the numeric packs (`es-barcelona`, `dk`, …) are curated data artefacts authored + versioned separately (L-399). Where a specific DK/CH/ES value is not in a source document, the pack carries a `null` + an `estimated`/`ordinance-pdf` flag, never an invented number.

### §2.3 — `EnvelopeNumbers` (shared numeric shape)

`{ maxHeight_m, maxFloors, plotRatioFAR, maxCoverage, setbacks{front_m,side_m,rear_m}, permittedUse[] }` — the numeric core shared by `ZoningRecord.structuredFields` and the rule-pack zones.

### §2.4 — `BuildableEnvelope` + `DerivationTrace`

The engine output (transient — not persisted authored data; §1.7).

| Field | Type | Notes |
|---|---|---|
| `insetPolygon` | `LatLon[]` (WGS84) | `parcel ⊖ setbacks` (Turf negative buffer, per-edge by classification) — the buildable footprint boundary |
| `maxHeight_m` | `number \| null` | height cap |
| `maxFloors` | `number \| null` | floor cap |
| `maxFAR` | `number \| null` | plot ratio |
| `maxCoverage` | `number \| null` | ground coverage 0..1 |
| `maxVolumeM3` | `number \| null` | `area(insetPolygon) × maxHeight_m` — the 3D envelope volume (SPEC-COMPLIANCE-REPORT render) |
| `permittedUse` | `string[]` | for the typology brief hand-off (§1.8) |
| `confidence` | `'authoritative' \| 'structured' \| 'estimated-ruleset'` | §1.2 — mandatory |
| `derivation` | `DerivationTrace` | §1.3 — per-constraint "why" |
| `caveats` | `string[]` | e.g. "setback estimated from zone class; verify against POUM" |

```ts
DerivationEntry = {
  constraint: 'setback.front'|'setback.side'|'setback.rear'|'maxHeight'|'maxFAR'|'maxCoverage'|'permittedUse';
  value: number | string | string[] | null;
  zoneCode: string;
  source: string;                                       // rule-pack / provider id
  fieldProvenance: 'published-structured'|'ordinance-pdf'|'estimated';
  ordinanceRef: string | null;
};
DerivationTrace = DerivationEntry[];                     // one per resolved constraint (§1.3)
```

---

## §3 — Engine, providers & package boundaries

### §3.1 — `ZoningProvider` interface (L2)

```ts
// packages/site-parcel-data/src/ZoningProvider.ts  (proposed)
export interface ZoningProvider {
  readonly id: string;
  readonly label: string;                               // attribution (C57 §1.9)
  /** Fetch the zoning at a parcel (by ref or polygon). null on miss (never throws). */
  fetchZoning(parcel: { refcat: string; ring: LatLon[]; jurisdictionId: string })
    : Promise<ZoningRecord | null>;
}
```

Adapters: `DkZoningProvider` (Plandata anonymous WFS — **structured** fields, the reference case), `MucZoningProvider` (Catalonia MUC — zone class → estimated pack), `MadridPgouProvider` (ArcGIS REST — partial structured), `OerebZoningProvider` (CH ÖREB XML — zone reference → estimated / Terrara pack), `TerraraZoningProvider` (premium, normalized numeric — gated per ADR-0269). All fetch via the C57 same-origin proxy.

### §3.2 — `ZoningRulesEngine` (pure L2)

```ts
// packages/site-parcel-data/src/ZoningRulesEngine.ts  (proposed) — PURE, deterministic (§1.1/§1.9)
export function computeBuildableEnvelope(input: {
  parcelRing: LatLon[];
  edgeClassifications: ('front'|'side'|'rear'|'unclassified')[];   // C19 §2.3
  zoning: ZoningRecord;
  rulePack: JurisdictionZoningContract | null;
}): BuildableEnvelope;   // opens pryzm.zoning.computeBuildableEnvelope span (§1.10)
```

Algorithm (deterministic): resolve numbers per §1.2 (structured fields → else rule-pack zone → else `none`); compute the per-edge setback inset via Turf negative buffer keyed by `edgeClassifications`; `maxVolumeM3 = area(inset) × maxHeight`; assemble the `DerivationTrace` (§1.3); stamp `confidence`. The result is dispatched as `site.updateZoning` by the editor executor (the only impure surface, P6) in one `runBatch` for a single undo.

### §3.3 — Package boundaries

| Component | Package | Layer |
|---|---|---|
| `ZoningRecord` / `JurisdictionZoningContract` / `BuildableEnvelope` / `DerivationTrace` (pure Zod) | `packages/schemas/src/elements/site/zoning/` | **L0** |
| `ZoningProvider` interface + adapters + `ZoningRulesEngine` (pure) | `packages/site-parcel-data/` (shared with C57) | **L2** |
| Envelope → `site.updateZoning` dispatch; envelope → generator constraint | `packages/site-runtime` + `stores` + editor executor | **L2–L3 / L5** |
| Zoning fetch proxy route(s) | `server/parcelZoningProxy.js` | server (BFF) |
| Turf (negative buffer / area) | new dependency (**not currently in tree** — verified `grep '@turf'` = ∅) | — |

> **New dependency flag**: Turf.js (MIT) is the setback-inset geometry engine and is **not yet a dependency**. Adding it requires the lockfile-sync discipline (pnpm-lock updated in the same commit) per the build/deploy governance. This is a build-sequence note, not a value claim.

---

## §4 — Commands / flow

C58 adds **no** new persisted-mutation command. The envelope reaches the model via the **existing** `site.updateZoning` (C19 §4.1), dispatched by the editor executor after the pure engine returns. Sequence (following a C57 parcel select):

1. C57: `site.parcel-boundary-set` (immutable ring).
2. `ZoningProvider.fetchZoning` (proxied) → `ZoningRecord`.
3. `computeBuildableEnvelope` (pure) → `BuildableEnvelope` + `DerivationTrace`.
4. `site.updateZoning` (P6, C19 §4.1) — writes the mutable zoning fields; emits `site.zoning-updated`.
5. (authoring) the envelope's inset + `maxHeight` thread into the generator as bounds (§1.8).

Each of steps 2–3 opens a `pryzm.zoning.*` span (§1.10).

---

## §5 — UI

The envelope render + provenance UX is specified in [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md). C58 binds only:

- **§5.1 — Confidence label mandatory** (§1.4): the envelope's `confidence` chip is always shown; `estimated-ruleset` renders in the distinct "verify against ordinance" style with the `ordinanceRef` link. CI-gated.
- **§5.2 — Brand colour**: the plan setback-inset polygon and the 3D max-height volume render in PRYZM purple `#6600FF` (C18 / C19 §5.5); the translucent 3D volume uses the **existing** renderer path (no new THREE owner — P2 safe).
- **§5.3 — Explain-why surfaced** (§1.3): each envelope constraint is traceable to its `DerivationEntry` in the compliance report.

---

## §6 — Tests / CI gates

| Gate | Path | Verifies | Ratchet |
|---|---|---|---|
| `check-zoning-determinism` | unit test in `packages/site-parcel-data/__tests__/envelope-determinism.test.ts` | Same input → byte-identical `BuildableEnvelope`; no RNG / clock / AI on the path (§1.1) | On engine land |
| `check-zoning-inset` | unit test | Setback inset correct on a rectangular **and** an L-shaped parcel; per-edge classification honoured (§3.2) | On engine land |
| `check-zoning-confidence-label` | `tools/ga-gate/check-zoning-fidelity-label.ts` (mirror `check-windcfd-beta-label.ts`) | Every rendered envelope carries a `confidence` label; `estimated-ruleset` never authoritative-styled (§1.4) | On UI land — **hard** |
| `check-zoning-derivation-complete` | unit test | Every numeric constraint in an envelope has a `DerivationEntry` with `source` + `fieldProvenance` (§1.3) | On engine land |
| `check-zoning-rulepack-provenance` | unit test | Every `JurisdictionZoningContract` zone has per-field provenance + `lastReviewed` + `ordinanceRef` where non-`estimated` (§1.6) | On first pack |
| `check-zoning-engine-purity` | `tools/ga-gate/check-zoning-purity.ts` | `ZoningRulesEngine` imports no THREE / DOM / I-O / RNG (§1.9, P5-adjacent) | On engine land |
| `check-zoning-otel-spans` | `tools/ga-gate/check-zoning-spans.ts` | Every exported engine/provider fn opens `pryzm.zoning.<verb>` (§1.10) | On engine land |
| `check-envelope-constrains-gen` | integration test | A generated footprint ⊂ `insetPolygon` and height ≤ `maxHeight` (§1.8) | After the bridge lands |

### §6.1 — Integration test (the end-to-end wedge)

`tests/integration/zoning-envelope.spec.ts` (proposed): a Copenhagen parcel (DK, structured) → `DkZoningProvider` → `computeBuildableEnvelope` → assert `confidence === 'structured'`, inset matches expected on the parcel, `maxVolumeM3 = area × maxHeight`, every constraint has a derivation entry → thread into the generator → assert the generated footprint fits inside the inset. This is the "credible competitive wedge" acceptance (ADR-0269 §credible-path).

---

## §7 — NFT targets

Per [C10](./C10-PERFORMANCE-AND-OBSERVABILITY.md).

- **§7.1 — Envelope solve < 100 ms.** `computeBuildableEnvelope` (pure, in-memory) for a ≤ 50-vertex parcel MUST complete < 100 ms on reference hardware (it is geometry + arithmetic, no I/O). Span `pryzm.zoning.computeBuildableEnvelope`.
- **§7.2 — Zoning fetch < 2 s (p95).** `ZoningProvider.fetchZoning` (proxy cache-cold) < 2 s; cache-hit < 200 ms (zoning ~24 h TTL, per scoping §6.4).
- **§7.3 — Envelope render is P2-safe.** The 3D max-height volume is one translucent extrusion via the existing renderer path — no new THREE import site, no new shader (per scoping §12; C04).

---

## §8 — Migration / build sequence

Per [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (L-398 → L-404), Denmark-first:

1. **L-398 (B0/B1)** — L0 schemas (`ZoningRecord`, `BuildableEnvelope`, `JurisdictionZoningContract`, `DerivationTrace`) + add Turf (lockfile-synced) + the pure `ZoningRulesEngine`.
2. **L-399 (B1)** — `DkZoningProvider` (Plandata structured) — the reference build on the cleanest data; then the curated `es-barcelona` / `dk` rule packs.
3. **L-401 (B2)** — the envelope → authoring bridge (inset + maxHeight into the generators; permitted-use → typology brief).
4. **L-402 (B3)** — the compliance report + 3D volume render + the L-373 CI fidelity-label gate.
5. **L-399 (B4)** — `MucZoningProvider` + `es-barcelona` pack (Spain breadth — adapter + pack only, no engine change).
6. **Ratify** — DRAFT → CANONICAL once the engine + §6 gates are green and the DK end-to-end wedge (§6.1) passes.

**Launch sequencing (honest risk)**: this track is **additive** and runs behind a flag; it MUST NOT ship as "launch" until the P0 launch blockers (L-334 data-integrity, L-391 collab) are closed — a compliance demo atop silent element-loss + last-write-wins collab is not launchable (gap audit §5.2 / §5.5). C58 is a Q4/Q1 competitive-wedge deliverable, not a September launch gate.

---

## §9 — What is NOT in this contract

| Concern | Owner |
|---|---|
| Fetching the parcel geometry + cadastral attributes | [C57 Parcel Data Layer](./C57-PARCEL-DATA-LAYER.md) |
| The persisted `Parcel.{setbacks,maxFAR,maxHeight,zoning}` schema + `site.updateZoning` command | [C19 Site Model & Parcel §2.3/§4.1](./C19-SITE-MODEL-AND-PARCEL.md) — C58 populates, does not redefine |
| The user-facing "explain-why" report + 3D envelope render spec | [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md) |
| The generative engines the envelope constrains (topology, solvers, scoring) | [C50 Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) + [C53 Generative Layout Engine](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) — C58 supplies bounds, never a parallel knob (§1.8) |
| Coordinate transforms / reprojection | [C12 Geospatial](./C12-GEOSPATIAL.md) |
| Actual numeric zoning VALUES for any jurisdiction | curated rule-pack data artefacts (L-399) — **not asserted in this contract** (§2.2) |
| Commercial buy-vs-build (Terrara) + rule-pack curation economics | [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) + [C39 Pricing](./C39-PRICING-AND-PLAN-TIERS.md) |
| Post-edit compliance re-check ("is this edited design still compliant?") | §10.4 — a proposed future seam over the C52 edit substrate |
| Building-code (fire / egress / accessibility) compliance beyond the zoning envelope | out of scope — a future contract; C58 is zoning-envelope only |

---

## §10 — Open design questions (pending decision)

### §10.1 — pending: rule-pack storage + distribution
A `JurisdictionZoningContract` is curated data. Whether packs ship in-repo (`packages/site-parcel-data/rulepacks/`), as a versioned data package, or a served registry (updatable without a deploy) is undecided. Recommendation: in-repo static (like `rules/programRules.ts`) for the pilot; served registry when curation scales. Pending L-399.

### §10.2 — pending: permitted-use → typology-brief hand-off
§1.8 wants zoning `permittedUse` to seed the C50 typology `briefSchema`. The exact mapping (zone use-class → typology + program weights) is a new seam. Recommendation: a thin deterministic mapper, no AI. Pending C50 / L-401.

### §10.3 — pending: edge-classification dependency
The setback inset needs C19 §2.3 `edgeClassifications` (front/side/rear per edge), whose authoring is itself C19 §10.1-pending. Until edge classification exists, the engine must either apply a uniform setback (loss of fidelity) or block. Recommendation: uniform-setback fallback flagged in `caveats` until C19 §10.1 resolves. Coupled to C19 §10.1.

### §10.4 — pending: compliance re-check after edits
Archistar-grade tools re-validate an edited design against the rules (gap audit G-ENG-5). Whether C58 owns a `checkCompliance(model, envelope)` re-validator (over the C52 edit substrate) or that is a separate contract is open. Recommendation: defer to a Phase-2 seam; C58 v1 is envelope-generation only. Pending.

### §10.5 — pending: FAR/coverage as hard vs soft generation bounds
§1.8 threads inset + maxHeight as bounds; whether FAR and coverage are *hard* generation constraints (reject non-conforming) or *soft* (score + warn) — given generators optimise topology first (C53) — is undecided. Recommendation: inset + height hard; FAR/coverage soft-lint (mirrors C19 §1.6's soft-at-edit / hard-at-export split). Pending C53 integration.

---

## §11 — Cross-references

- [C00 Index](./README.md) — register the C58 row.
- [C03 Schemas, Commands & State](./C03-SCHEMAS-COMMANDS-AND-STATE.md) — L0 schemas + `site.updateZoning` follows C03 patterns.
- [C19 Site Model & Parcel](./C19-SITE-MODEL-AND-PARCEL.md) — §1.4 immutable parcel; §1.6 footprint-in-parcel-minus-setbacks (the envelope makes those numbers real); §2.3 zoning fields; §4.1 `site.updateZoning`; **fills the C19 §9/§10.2 deferred registry** (C19 §10.2 should reference C58 on ratify).
- [C57 Parcel Data Layer](./C57-PARCEL-DATA-LAYER.md) — supplies the parcel; shares `packages/site-parcel-data`.
- [C50 Typology Pipeline](./C50-TYPOLOGY-PIPELINE.md) + [C53 Generative Layout Engine](./C53-GENERATIVE-LAYOUT-ENGINE-ARCHITECTURE.md) — consume the envelope as bounds; slider-as-intent preserved (§1.8).
- [C52 Editable Building Graph](./C52-EDITABLE-BUILDING-GRAPH.md) — the substrate a future compliance re-check (§10.4) would run over.
- [C12 Geospatial](./C12-GEOSPATIAL.md) · [C10 Performance & Observability](./C10-PERFORMANCE-AND-OBSERVABILITY.md) · [C23 Provenance & AI Audit](./C23-PROVENANCE-AND-AI-AUDIT.md).
- [C18 Element Preview Visual](./C18-ELEMENT-PREVIEW-VISUAL-CONTRACT.md) — `#6600FF` envelope render.
- [C55 Geodata Analytical Layers](./C55-GEODATA-ANALYTICAL-LAYERS.md) — sibling pluggable-provider-over-site precedent (ADR-0065).
- [ADR-0269](../adrs/ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) · [SPEC-COMPLIANCE-REPORT](../../03-execution/specs/SPEC-COMPLIANCE-REPORT.md).

External (non-contract): [ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md](../../04-reference/ARCHISTAR-EUROPE-COMPETITIVE-GAP-AUDIT-2026-07-17.md) (G-ENG/G-BRG), [PARCEL-ZONING-FEATURE-SCOPING.md](../../04-reference/PARCEL-ZONING-FEATURE-SCOPING.md) §4/§6/§7, [DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md](../../04-reference/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) §2.3.

---

## §12 — Contract history

| Date | Change |
|---|---|
| 2026-07-17 | Initial DRAFT — fills the C58 reserved slot (the core compliance value-prop; gap audit G-ENG-1). Fills the C19 §9/§10.2 deferred jurisdiction-registry. Grounds on the two-fidelity scoping + the Denmark structured-zoning reference. Author: compliance-authoring governance track. |


---

## Known gaps / violations (added 2026-07-20)

### KG-1 (L-443) — the rule model cannot express alignment-governed zones

**§2.2 `JurisdictionZoningContract.zones[]` admits only
`setbacks: { front_m, side_m, rear_m }`, and §2.4 derives the envelope as
`insetPolygon = parcel ⊖ setbacks`. A large class of real Spanish ordinances is not
expressible in that shape.**

Verified live (L-438): Madrid publishes `Fondo de la Edificación` as a **POLYLINE** with no
attributes, plus `Alineaciones` — buildable depth as *a line you build up to*, not a setback
number. *Alineación a vial*, *profundidad edificable* and *altura reguladora por ancho de
calle* are standard in Spanish *ensanche* fabric.

**Consequence if unaddressed:** any adapter for such a zone must either omit it (silent
coverage gap) or coerce it into a front-setback (**a confidently wrong envelope on exactly
the dense urban fabric the product targets**). §1.4's confidence labelling does NOT mitigate
this — the output is not uncertain, it is derived from the wrong rule.

**Status:** OPEN. Requires a deliberate extension of §2.2 with an alignment/depth rule
family, or an explicit, published scope restriction. Tracked as **L-443**.
**This contract currently claims a generality it does not have.**

### KG-2 (L-441/L-439) — granularity is modelled (§1.11) but not yet implemented
`granularity` is normative in §1.11 as of 2026-07-20 but is not yet present in the schema,
engine or UI. Until it is, nothing prevents a sector-level figure being rendered as a parcel
envelope. Tracked as **L-439**.

---

## Known Violations / Pending Amendments

> Recorded per the logging protocol Step 4.3, so this contract does not silently keep
> claiming a mapping that cannot hold.

### §1.7 — the 1:1 mapping to `setbacks.{front,side,rear}` DOES NOT HOLD for alignment-governed zones (L-451, ADR-0270)

§1.7 asserts the envelope numeric results map 1:1 onto C19 mutable parcel fields and that C58
persists no new output schema. **That holds only while every zone is setback-governed.**

Spanish *ensanche* is governed by *alineación a vial* + *profundidad edificable* + party walls
(verified live, L-438: Madrid publishes `Fondo de la Edificación` as a POLYLINE). **No
front/side/rear triple encodes such a rule.** Any value written there for an alignment zone is a
lossy coercion that looks well-formed and is therefore invisible.

**Status:** ADR-0270 PROPOSED, awaiting a decision between option (A) persist the inset polygon
as the truth + amend §1.7 + allow `null` setbacks, and option (B) store equivalent effective
setbacks (**not recommended** — lossy by construction).

**Until that decision lands:** the engine MUST NOT emit an `alignment` result into
`site.updateZoning`. No alignment path exists in the solver today, so this is a PENDING
AMENDMENT, not an active violation — **it becomes an active violation the moment ADR-0270 P2
ships without P3.**

### §2.2 — the rule model cannot express alignment-governed zones (L-443, L-451)

`setbacks: { front_m, side_m, rear_m }` is the only geometric shape. ADR-0270 proposes the
discriminated union (`setback` / `alignment` / `explicit-area`).
