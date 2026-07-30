# Parcel Metadata Model — Implementation Plan (L-640)

> **The clear, detailed, per-country / per-city build plan for a unified, honesty-gated parcel-metadata
> model on PRYZM's L1 parcel layer.** Litehaus-inspired in ambition, but PRYZM-shaped: a *planning /
> digital-twin* dossier, never a listing/valuation surface. This is a PLAN — nothing here is built.
> Implementation starts only on founder sign-off, phase by phase, each with a passing test before any
> contract flips to ACTIVE.
>
> **Status:** DRAFT PLAN (2026-07-29). Tracks audit **L-640**. Governs future edits to C57 (+ a new
> confidence contract, see §2), `server/parcelZoningProxy.js`, the parcel adapters, and
> `CITY-REPLICATION-STANDARD.md §1`.
>
> **Governance:** edit canonical docs in place; no derivative `*-AUDIT.md`. Conflict order VISION →
> ARCHITECTURE → contracts → ADRs → SPECs. Every field obeys **§CONTEXT-DATA-HONESTY**: a value is
> present only where a real source supplies it; otherwise it carries a **typed unknown-reason**, never a
> fabricated number.

---

## 0 — Principles (the non-negotiables that shape every decision below)

1. **Aggregate, don't reinvent.** Explainability, per-field provenance and multi-tier confidence are
   ALREADY built for the envelope (C58 `DerivationTrace` + `FieldProvenance` + `EnvelopeConfidence`),
   for heights/terrain (ADR-0277 `measured/derived-levels/assumed`), and for overlays (C55). The parcel
   dossier **references** those per-subsystem signals; it never computes a second, divergent confidence.
2. **The model is the deliverable, not 180 populated fields.** Most fields are unsourceable today. The
   schema exists in full; each field is populated only where a real adapter supplies it, else a
   `UnknownReason`. Coverage grows as sources land — honestly, per jurisdiction.
3. **Honesty discriminator over opaque score.** No single `confidence: 92`. Every domain carries its own
   confidence + provenance + unknown-reason, mirroring the existing `kind: 'cadastral' |
   'footprint-fallback'` precedent (`parcelProviders/registry.ts:66`).
4. **Free before sourced.** Phase 1 ships everything derivable with **zero new upstream calls**
   (geometry + area-delta + match-confidence). Paid/sourced domains are later phases.
5. **Excluded forever (do not re-propose):** listing/anúncio distance, ad confidence, listing
   reconciliation, valuation, market/ROI/financing/asking-price. PRYZM has no listing concept
   (C19 §1.2 — parcels arrive via draw/select only).

---

## 1 — The typed UnknownReason enum (the honesty backbone)

Every unpopulated field carries one of these (never bare `null`, never a fabricated value):

| Reason | Meaning |
|---|---|
| `authority-does-not-publish` | The source exists and was queried, but does not expose this field |
| `not-queried` | Obtainable in principle, but not fetched (cost/perf/phase gating) |
| `outside-coverage` | The point is outside this adapter's jurisdiction/coverage |
| `adapter-limitation` | The adapter could return it but the parser/mapping isn't built yet |
| `license-restriction` | Data exists but its licence forbids exposure/commercial use |
| `geometry-incomplete` | Derivable from geometry, but the geometry is degenerate/partial |
| `pending-implementation` | Planned field, not yet wired (default for later-phase domains) |

---

## 2 — Where the model lives (the contract decision — Phase 0)

**Parcel-local fields** (identity, geometry diagnostics, area-delta, match confidence, provenance,
temporal, administrative hierarchy) → **extend C57** (`ParcelFeature` + `ParcelProvenance`, new §2.x +
an honesty invariant §1.x). This is the natural home; the `kind` discriminator already lives here.

**Cross-cutting confidence aggregate** (per-domain confidence spanning parcel + zoning + terrain +
heights + environmental + infrastructure) spans multiple contracts, so it needs a **single owner of the
`UnknownReason` enum + the per-domain confidence shape**, referenced by C57/C58/C55/ADR-0277. Two options
— **decide in Phase 0 via a short ADR**:
- **Option A (recommended):** mint **C62 — "Data Confidence, Provenance & Unknown-Reason Model"** (a
  small L0 contract that defines the enum + the `DomainConfidence` shape; every subsystem imports it).
  Keeps the honesty vocabulary DRY and prevents divergent confidence scales. (C61 is already reserved for
  the context-scene/height engine — see the envelope standard.)
- **Option B:** fold the enum into **C23 (Provenance & AI Audit)**, which already consumes provenance.
  Lighter, but C23 is an *audit consumer*, not a schema owner — risks blurring roles.

**No new runtime subsystem** — the model is schema + adapter output. `pryzm.parcel.*` spans (C57 §1.8)
gain confidence attributes.

---

## 3 — The field taxonomy (21 domains → fields → status)

Each field is tagged: **Portability** (U=Universal, C=Common, J=Jurisdiction-specific, O=Optional) ·
**Source** (🟢 free-now / 🟡 needs-a-source / 🔴 not-obtainable-generally) · **Home** contract.

| Domain | Representative fields | Port | Source | Home |
|---|---|---|---|---|
| **1 Identity** | refcat, INSPIRE id, source authority, dataset id | U | 🟢 (id) / 🟡 (INSPIRE id per adapter) | C57 |
| **2 Geometry diagnostics** | perimeter, centroid, bbox, area (SIG), compactness, elongation, rectangularity, frontage count/length, longest edge, vertex count, ring validity, self-intersections, holes, multipart | U | 🟢 all (derived from ring) | C57 |
| **3 Administrative hierarchy** | country, region, province, municipality, parish/freguesia, postal, statistical unit | U/C | 🟢 (from refcat/address) / 🟡 (deep levels) | C57 |
| **4 Provenance** | source, authority, endpoint, adapter, sourceVersion, sourceCrs, license, retrievedAt, cacheAge | U | 🟢 (all already in-flight per C57 §1.4) | C57 |
| **5 Temporal** | dataset published/updated, capabilities version, survey date, retrieval, last-validated | C | 🟡 (WFS capabilities date free; survey dates per source) | C57/C62 |
| **6 Confidence (cadastral)** | areaSource, areaOfficialM2, areaSigM2, areaDeltaPct, pointToParcelM, candidateMarginM, geometryComplete, match | U | 🟢 (area+geom) / 🟡 (distance = point-query providers only) | C57/C62 |
| **7 Completeness** | per-domain "have we got everything?" (distinct from confidence) | U | 🟢 (derived from which fields populated) | C62 |
| **8 Validation status** | not-checked / auto-validated / cross-validated / human-reviewed / authority-confirmed | U | 🟢 (default not-checked; upgrades on real events) | C62 |
| **9 Data lineage** | the transform chain (WFS→GML→parse→projection→repair→runtime) | U | 🟢 (adapter-declared) | C62 |
| **10 Planning / legal** | zoning code, ordinance ref, overlays, legal citation, effective date | J | 🟡 (from C58 zoning — reuse, don't refetch) | C58 |
| **11 Environmental** | slope, aspect, flood, fire, protected habitat, watercourse, coastal buffer | O | 🟡 (via C55 overlays + terrain) / 🔴 many | C55/ADR-0277 |
| **12 Infrastructure** | water, sewer, power, telecom, road class, transit, corner-parcel, access | O | 🟡 (corner/road from OSM geometry) / 🔴 utilities | C55 |
| **13 Context metrics** | nearest building, avg surrounding height, street width, block density, adjacent count | C | 🟡 (from context bake + heights) | C61 |
| **14 Topology** | touches road/river/protected, contained-by, overlaps | C | 🟢 (geometry vs context layers) | C57/C55 |
| **15 Relationships** | adjacent parcels, shared-boundary lengths, corner/internal/through | C | 🟡 (needs the block/manzana set — ES has it) | C57 |
| **16 Derived metrics** | shape index, frontage ratio, min/max internal angle, avg edge | U | 🟢 (geometry) | C57 |
| **17 Explainability** | source + article + calculation + confidence per computed value | J | 🟢 (REUSE C58 `DerivationTrace` — already built) | C58 |
| **18 Replication health** | cadastre/planning/terrain/buildings/heights present? per city | U | 🟢 (derived from what baked/wired) | C60 |
| **19 Capability flags** | can-generate-envelope / FAR / setbacks / shadows / solar | J | 🟢 (derived from populated domains) | C62 |
| **20 AI-readiness** | machine-readable / structured / authoritative / requires-human-review | U | 🟢 (derived from provenance + validation) | C62 |
| **21 Known limitations** | the UnknownReason per absent field (§1) | U | 🟢 | C62 |

---

## 4 — Per-COUNTRY implementation matrix

Parcel metadata is largely **national** (the cadastre is national). What each wired provider can supply
(from `parcelProviders/registry.ts` + the proven ES path). **🟢 = confirmed, 🟡 = VERIFY per adapter,
🔴 = not available.** *No value is asserted for a non-ES provider without a live probe — those are
marked VERIFY, per §CONTEXT-DATA-HONESTY.*

| Country | Provider (kind) | Geometry diag | Area official (registry) | Match-distance | Temporal (caps) | Admin hierarchy | Notes |
|---|---|---|---|---|---|---|---|
| **ES** Spain | Catastro OVC+INSPIRE (cadastral) | 🟢 | 🟢 `areaValue` (KV-3 fix exposes it) | 🟢 `dis` from `_Distancia` (currently discarded) | 🟢 WFS caps | 🟢 refcat encodes prov/muni | **Reference impl — Phase 1 lands here first** |
| **FR** France | IGN CADASTRALPARCELS WFS (cadastral) | 🟢 | 🟡 INSPIRE CP *should* carry `areaValue` — VERIFY | 🔴 point-in-polygon (no distance) | 🟡 | 🟡 | INSPIRE-conformant → area likely free |
| **NL** Netherlands | PDOK Perceel (cadastral) | 🟢 | 🟡 BRK `kadastraleGrootteWaarde` — VERIFY | 🔴 | 🟡 | 🟡 | National API, not INSPIRE — verify field |
| **NO** Norway | Geonorge matrikkelen (cadastral) | 🟢 | 🟡 VERIFY | 🔴 | 🟡 | 🟡 | |
| **DE-NW** Germany (NRW only) | ALKIS Flurstueck (cadastral) | 🟢 | 🟡 ALKIS `amtlicheFlaeche` — VERIFY | 🔴 | 🟡 | 🟡 | Other Länder = footprint |
| **CH** Switzerland | swisstopo identify (cadastral, coarse) | 🟢 | 🟡 VERIFY | 🔴 | 🟡 | 🟡 | Geneva coarse-routes to FR |
| **DK** Denmark | Datafordeler Matrikel (cadastral, **credential-gated**) | 🟢 | 🟡 VERIFY | 🔴 | 🟡 | 🟡 | Needs service-user key |
| **PT/IT/GB/SE/FI/BE + rest** | OSM footprint fallback (footprint) | 🟢 | 🔴 `authority-does-not-publish` | 🔴 | 🔴 | 🟡 (from geocode) | **`match:'low'` by construction — geometry-only dossier** |
| **SA** Saudi | footprint-only (geo-fenced) | 🟢 | 🔴 | 🔴 | 🔴 | 🟡 | Balady blocked |

**The honest per-country truth:** geometry diagnostics + match-`match` are **universal and free**;
**official area** is free for ES today and *likely* free for the other INSPIRE/cadastral providers
(VERIFY each — do not assume); **point-to-parcel distance** is **ES-only** (only OVC `_Distancia` returns
it — every other provider is point-in-polygon, so that sub-signal honestly reports
`authority-does-not-publish`). Footprint-fallback countries get a **geometry-only dossier with
`match:'low'`**, which is itself an honest, useful answer.

---

## 5 — Per-CITY plan (the baked cities today)

Per-city richness = "which parcel jurisdiction does this city fall in." Mapping the current context/terrain
cities (`bake.mjs` REGIONS) to their parcel-provider status:

| City | Country | Parcel dossier tier | Phase-1 result |
|---|---|---|---|
| **Barcelona, Madrid, Córdoba** | ES | **Full cadastral** | area-delta + distance + geom + full confidence (reference) |
| **Paris, Lyon** | FR | Full cadastral (VERIFY area) | geom + area (verify) + `match` (no distance) |
| **Amsterdam** | NL | Full cadastral (VERIFY area) | geom + area (verify) |
| **Oslo** | NO | Full cadastral (VERIFY area) | geom + area (verify) |
| **Zürich, Geneva** | CH | Cadastral (coarse) | geom + `match` |
| **Copenhagen** | DK | Cadastral (**credential-gated**) | geom; area/id gated on key |
| **Lisbon, Porto** | PT | Footprint fallback | **geometry-only, `match:'low'`** |
| **Rome, Milan** | IT | Footprint fallback | geometry-only, `match:'low'` |
| **Berlin, Munich** | DE (non-NRW) | Footprint fallback | geometry-only, `match:'low'` |
| **London** | GB | Footprint fallback | geometry-only, `match:'low'` |
| **Stockholm, Helsinki** | SE/FI | Footprint fallback | geometry-only, `match:'low'` |
| **Brussels** | BE | Footprint fallback | geometry-only, `match:'low'` |

**Action per city = none beyond its country adapter** — a city inherits its country's dossier tier
automatically (the parcel registry routes by point). "Onboard a city's metadata" is really "wire/verify
its **country's** cadastral adapter's area+temporal fields", except ES which is done.

---

## 6 — The phased build

### Phase 0 — Schema + contract (no behaviour change)
- ADR: decide C62 vs C23 for the cross-cutting enum (§2). Mint the `UnknownReason` enum + `DomainConfidence` shape.
- C57 §2.x: extend `ParcelFeature` with `metadata` (identity/geometry/admin/temporal) + `confidence` + `provenance` completeness. Zod, L0-pure.
- CI gate `check-parcel-confidence-honesty` (mirror C57 §6 `check-parcel-provenance`): **fail if `match:'high'` on a derived-area or footprint-fallback parcel**, and if any populated field lacks provenance, and if any absent field lacks an UnknownReason.
- **Deliverable:** the model compiles + the gate is red-until-implemented. No runtime change.

### Phase 1 — FREE tier (no new upstream calls) — the first real value
- **Server** (`parcelZoningProxy.js`): fix **KV-3** — `parseParcelGml` returns `{ ring, areaOfficialM2|null, areaSigM2, areaSource }` (stop collapsing); `parseReverseGeocode` keeps `pointToParcelM` (`dis`) + `candidateMarginM` (nearest vs 2nd).
- **Compute** (pure, L2): geometry diagnostics (perimeter, centroid, bbox, compactness, elongation, rectangularity, frontage count/length, longest edge, vertex count, ring validity, self-intersections, holes, multipart) + `areaDeltaPct` + the composite `match` (never `high` on derived/footprint).
- **Client adapters:** thread `confidence` + `metadata` through `CatastroParcelProvider` and every registry adapter; **footprint-fallback providers set `match:'low'` + geometry-only** automatically.
- **Docs:** amend `CITY-REPLICATION-STANDARD §1` (new §1.5 addendum) + C57 §2.x in place; flip C57 §13 KV-3 to RESOLVED **only after the test passes**.
- **Rollout:** ES first (reference), then FR/NL/NO/DE-NW/CH/DK (VERIFY area+temporal per adapter), then footprint countries (geometry-only, free).
- **Test:** unit (area-delta on a known Catastro parcel; `match` degrades on a footprint) + e2e (`tests/e2e/parcel-select.spec.ts` extension: dossier confidence present + honest on an unmapped click).

### Phase 2 — Sourced domains as they land (each unknown-reason-gated until real)
- **Planning/legal + Explainability:** REUSE C58 (`ZoningRecord` + `DerivationTrace`) — surface, don't refetch.
- **Relationships/topology:** ES manzana set (already fetched for the envelope) → adjacent parcels + shared boundaries + corner detection; other countries `pending-implementation`.
- **Context metrics:** from the context bake + heights (C61) — nearest building, avg surrounding height, street width, block density.
- **Environmental/infrastructure:** via C55 pluggable overlays (flood/slope/protected) + OSM-derived road-class/corner; utilities stay `authority-does-not-publish` until a real source.
- **Temporal/validation/lineage/replication-health/AI-readiness/capability flags:** derived, cheap, land alongside Phase 0's C62.

### Phase 3 — Per-domain confidence rollup + dossier UI
- Aggregate per-domain confidence into the dossier view (the founder's per-domain table), each row citing its subsystem's provenance. Replication-health dashboard per city.

---

## 7 — Dependencies, sequencing, ownership

- **Phase 0 → 1 → 2 → 3**, strictly. Phase 1 depends only on Phase 0's schema; needs no other subsystem.
- **Reuses (no new work):** C58 confidence/provenance/`DerivationTrace`; C57 `kind` discriminator + provenance; the ES manzana fetch.
- **Blocks later phases:** C61 (context-scene confidence, unminted) for context metrics; C55 provider wiring for environmental/infra; per-adapter probes for non-ES area/temporal.
- **Does NOT touch:** pricing/financial/valuation (excluded), the envelope solver (C58 unchanged — it's a consumer), the render pipeline.
- **Owner:** UNASSIGNED · **Target:** TBD (per phase, on sign-off).

## 8 — Cross-references
Audit **L-640** · C57 (§13 KV-3, the area-collapse) · C58 (reuse) · C55 · ADR-0277 · C23 · C60 ·
`CITY-REPLICATION-STANDARD.md §1` · `ENVELOPE-REPLICATION-STANDARD.md` (the sibling replication standard).
