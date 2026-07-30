# SPEC — City Completion Scorecard (7-axis, computed)

| Field | Value |
|---|---|
| Status | DRAFT — normative (schema + function sequenced; weighting is a FOUNDER DECISION) |
| Version | 1.0 |
| Date | 2026-07-30 |
| Owner | Geospatial / city-replication |
| Contract | [C63](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) |
| ADR | [ADR-0281](../../02-decisions/adrs/ADR-0281-city-completion-scorecard-and-dossier-standard.md) |
| Composes | [C62](../../02-decisions/contracts/C62-DATA-CONFIDENCE-PROVENANCE-MODEL.md) (`DomainConfidence` / `MetadataEnvelope` / `UnknownReason`) |
| Reads state from | `parcelConfidence.ts` (C57), `rulepacks/registry.ts` (C58), `tools/context-bake/heightSources.mjs` + `bake.mjs` + `terrain.mjs`, `terrainCoverage.ts`, per-city `sources/SOURCES.md` + `VERIFICATION.md` |
| Companion docs | `CITY-REPLICATION-STANDARD.md`, `ENVELOPE-REPLICATION-STANDARD.md`, `BUILDING-HEIGHT-REPLICATION-STANDARD.md`, `jurisdictions/GEO-DATA-SOURCING-MASTER.md` |

---

## §1 — Purpose

Define the wire shape and the computation of the 7-axis city-completion scorecard that C63 governs, so
"how complete is city X?" is answered by a **reproducible function of inspectable state** — never a
hand-typed number (C63 §1.1). This SPEC is normative for the schema and the function contract; C63 is
the authority for the axis definitions and the honesty rules.

## §2 — Schema (L0, P5-pure — `packages/schemas/src/site/completion/`)

```ts
// CityCompletionScorecard.ts — pure Zod, no THREE / DOM / I-O (C63 §1.8)
type AxisId =
  | 'parcel' | 'legislation' | 'dataSources'
  | 'envelope' | 'terrain' | 'heightsLod' | 'context';

// Each axis is a C62 DomainConfidence instance (C63 §1.4), specialised — not a rival scale.
interface AxisScore {
  axis: AxisId;
  score: number | null;          // 0..1, or null when not-assessed
  unknownReason?: UnknownReason; // C62 — REQUIRED when score === null (C63 §1.2)
  validationState: ValidationState; // C62; default 'not-checked'
  provenance?: SourceProvenance[];  // C62 — which state was read (explain-why, §1.4)
  derivation: string;            // human-readable "computed from N=… sample / registry rows …"
  generatedBy: string;           // e.g. 'scorecard@1.0 2026-07-30T…' — the §6 provenance stamp
}

interface CityCompletionScorecard {
  jurisdictionId: string;        // MUST equal the dossier folder identity (C63 §1.7)
  axes: Record<AxisId, AxisScore>;
  overall: { score: number | null; partial: boolean; assessedAxes: AxisId[] };
  honestyOk: boolean;            // §3.1 — false ONLY if a fabricated value is rendered
  weightsVersion: string;        // which CITY_COMPLETION_WEIGHTS vector produced `overall`
}
```

**Sentinels.** `score: null` + `unknownReason` is the canonical `not-assessed` (C63 §1.2). A consumer
MUST render `null` as "not-assessed (<reason>)", never as `0 %`.

## §3 — The seven axis functions

Each is the C63 §3 definition. Signature: `(cityState) → AxisScore`. Determinism: same state → same score
(C63 §1.1).

| Axis | Score formula | Input reader | Default |
|---|---|---|---|
| `parcel` | mean over sample of `{high:1, medium:.5, low:0}` | `computeParcelConfidence` × N-sample (C57) | `null` / `not-queried` |
| `legislation` | `verified_cited_claus / claus_present` | `SOURCES.md` cited-rows ∩ signed `VERIFICATION.md` ÷ MUC clau inventory | `null` / `not-queried` |
| `dataSources` | mean over 5 slots of `{live:1, documented:.5, blocked/none:0}` | `heightSources.mjs` `impl` + `REGION_SOURCE` + parcel `registry.ts` + `siteDispatch` zone-GIS + `bake.mjs REGIONS` | `null` / `not-queried` |
| `envelope` | `Σ (buildable_land_share × {certified:1, amber:.7, refusal:0, none:0})` | `registry.ts packsByZone` × the coverage-plan +% table / certifiability survey | `null` / `pending-implementation` |
| `terrain` | `{none:0, baked-unverified/white-mask:.5, baked+verified+lit:1}` | `terrain/<city>/layer.json` 200 + `terrain.verify.mjs` + white-mask flags | `null` / `not-queried` |
| `heightsLod` | `tagged_count / total_count` | baked PMTiles `heightProvenance` histogram at city bbox | `null` / `not-queried` |
| `context` | `present_layers / 9` | probe `{buildings,roads,water,parks,landuse,rail,trees,pedestrian,sea}` at city bbox | `null` / `not-queried` |

**`validationState` graduation (C63 §1.6):** `legislation` / `envelope` may reach `human-reviewed` ONLY
with a signed `sources/VERIFICATION.md`; `terrain` reaches `cross-validated` only on an
independent-decoder round-trip pass (C12 §10). Others default `auto-validated` once the probe runs.

## §4 — The overall function

```
assessed  = axes where score !== null
overall   = Σ_{a ∈ assessed} (score[a] × W[a])  /  Σ_{a ∈ assessed} W[a]
partial   = assessed ⊊ all-7
```

`W` = `CITY_COMPLETION_WEIGHTS`, a config vector (C63 §1.5). **Default (FOUNDER DECISION, DRAFT — C63 §4):**
`{ legislation:.25, envelope:.20, parcel:.15, dataSources:.15, heightsLod:.10, terrain:.10, context:.05 }`.
If `assessed = ∅`, `overall.score = null`.

## §5 — Sequencing (which axes compute first)

1. **Cheap now (state already inspectable):** `dataSources` (read `heightSources.mjs`), `terrain` (probe
   R2 `layer.json` + verify log), `context` (probe PMTiles layers). No new upstream, no sampling.
2. **One sampling run:** `parcel` (draw N parcels, run `computeParcelConfidence`), `heightsLod` (read the
   provenance histogram from the bake output / context panel).
3. **Human-gated:** `legislation` (per-clau `SOURCES.md` audit), `envelope` (coverage measurement +
   the L-449 `VERIFICATION.md` gate). These move only with the founder-signed legal work.

## §6 — Provenance & the CI gate

- Every `AxisScore.generatedBy` + every composite master `RATE.md` (the scorecard face; renamed from `COMPLETION.md` per L-649) carries a `<!-- generated-by: scorecard vN … -->`
  stamp. `tools/ga-gate/check-city-completion.ts` (planned, C63 §6) re-runs the function and diffs; a
  hand-edited number (no stamp, or stamp≠re-run) fails the build (enforces C63 §1.1).
- The gate also fails a city that renders a value while its scorecard says the backing axis is
  `not-assessed`/refusal (the `honestyOk` gate, C63 §3.1), and a tackled city with no §5-shaped dossier.

## §7 — Non-goals

- **Not** a live in-app widget spec (a consumer may build one; C63 §1.8 leaves display open).
- **Not** a re-derivation of any axis's own contract — PARCEL is C57's confidence, ENVELOPE is C58's
  coverage, etc. This SPEC only *composes* and *weights* them.
- **Not** a ranking/leaderboard — completeness is descriptive, and `honestyOk` (not a completion
  threshold) is the only launch gate (C63 §3.1).
