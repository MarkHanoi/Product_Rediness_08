# City RATE — master completion scorecard — Brussels (be-bru, NIS 21004)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — scorecard function not yet shipped (C63 §8); the CHEAP axes (DATA-SOURCES · CONTEXT) are cited-derived per C63 §8.1, every other axis is not-assessed with a typed C62 reason. NO cell is a fabricated number. -->

**Overall completion (assessed subset): `44%` · `partial: true`** — renormalised over the ASSESSED
axes only (DATA-SOURCES · CONTEXT); the missing axes (PARCEL · LEGISLATION · ENVELOPE · TERRAIN ·
HEIGHTS/LOD) are honestly `not-assessed`, not 0 % (C63 §1.2/§1.5). **`honestyOk: true`** (no fabricated
value; every unknown typed).

> **Weighting** `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4).

> **Scope note.** The bake bbox `4.30,50.80,4.42,50.90` spans the whole 19-commune **Brussels-Capital
> Region** (the real planning unit — PRAS/RRU are region-wide); this dossier is coded to the representative
> core commune **City of Brussels, NIS 21004**. See `../../COUNTRY-RATE.md §0`.

## The 7 axes (C63 §3 — fixed definitions)

| # | Axis | Weight | Score | Validation | Unknown reason | Derivation (which state was read) |
|---|---|---:|---|---|---|---|
| 1 | **PARCEL** | 15 % | `not-assessed` | `not-checked` | `not-queried` | **No Belgian cadastre provider is wired** in `parcelProviders/registry.ts` (grep: only `pdok-nl`, `ign-fr`, `catastro`, `geonorge-no`, `alkis-nrw` + `footprint`; no `isInBelgium`/CADMAP predicate) → a Brussels click resolves to the **footprint-fallback** (never a legal parcel — capped low by construction, C57 §L-640). The federal **CADMAP/CadGIS** WFS (AGDP/SPF Finances) IS verified-live (2026-07-24, HTTP 200, national) — see `README.md §2.1` — but is not yet an app provider, and no `computeParcelConfidence` sample has been run for this bbox. |
| 2 | **LEGISLATION** | 25 % | `not-assessed` | `not-checked` | `pending-implementation` | No rule pack registered for Brussels (`rulepacks/registry.ts` carries no BE pack); `sources/VERIFICATION.md` is **OPEN**. A structured-fill PRIOR exists — **~5–10 %** (`LEGISLATION-RATE.md`) — but that is the COARSE prior, not the L-449-verified per-clau count Axis 2 requires. Brussels' RRU Titre I is the one region-wide numeric-leaning baseline in Belgium, but it is a **formula-in-PDF** (`H = P + 3.00 + D`), legally subordinate to the discretionary *bon aménagement des lieux* test and to a PRAS/RRU/RRUZ/PPAS precedence check; inventing values is forbidden (§CONTEXT-DATA-HONESTY). |
| 3 | **DATA-SOURCES** | 15 % | **40%** | `not-checked` | — | 5-slot checklist: cadastre-parcel **documented** (federal CADMAP WFS `ccff02.minfin.fgov.be/.../INSPIRE/CP/` verified-live 2026-07-24, but NOT wired into `registry.ts` → `documented` not `live`) · regional-zone-GIS **documented** (Brussels **PRAS** `gis.urban.brussels/geoserver/PERSPECTIVE_FR:Affectations` — bot-blocked on direct fetch, confirmed via cache; not wired into `siteDispatch.ts`) · building-height nDSM **blocked** (`heightSources.mjs` `REGION_SOURCE.brussels` = `{grb_be, status:'blocked', reason:'Brussels UrbIS height attribute unprobed; GRB height is Flanders-only'}`) · terrain DEM **blocked** (`terrain.mjs` `be` verdict `blocked` — URBIS GeoServer exposes NO elevation coverage; no Brussels-Capital DTM route located) · context-OSM **live** (`bake.mjs` REGIONS `brussels`, `belgium-latest.osm.pbf`). Mean = (0.5+0.5+0.0+0.0+1.0)/5 = 0.4. |
| 4 | **ENVELOPE** | 20 % | `not-assessed` | `not-checked` | `pending-implementation` | No buildable-envelope rule pack registered for Brussels; solver coverage unmeasured (C58). RRU Titre I's `H = P + 3.00 + D` (rue width + parcel depth) is a context-relative construction closer to Porto's *moda da cércea* than to a lookup — it needs a new engine KIND (~20–25 dev-days, `findings/ §B.1`). BCN/Madrid/Córdoba have packs — Brussels does not. See `ENVELOPE.md`. |
| 5 | **TERRAIN** | 10 % | `not-assessed` | `not-checked` | `pending-implementation` | **No `terrain.mjs` REGIONS row for Brussels** and the `be` terrain source verdict is **`blocked`** (LIVE-PROBED 2026-07-25: URBIS GeoServer OWS answers but exposes NO elevation coverage; Belgium has no national DTM — Flanders DHMV + Wallonia MNT are open, but Brussels-Capital is an enclaved region neither covers, and the Bruxelles-Environnement/CIRB DTM route is not pinned). `not-assessed` ≠ 0 % (C63 §1.2). |
| 6 | **HEIGHTS/LOD** | 10 % | `not-assessed` | `not-checked` | `adapter-limitation` | `heightSources.mjs` maps `brussels` to `grb_be` with status **`blocked`**: the 3D GRB LoD1 DHMV II ridge-height product is **Flanders-only**, and the Brussels UrbIS height attribute is **unprobed**. NOT measured-capable for Brussels today (unlike Amsterdam's 3DBAG). No per-building `heightProvenance` histogram probed. The federal CADMAP building sublayer MAY carry a height/storey attribute (unprobed — the highest-value BE probe). |
| 7 | **CONTEXT** | 5 % | **56%** | `not-checked` | — | Inside the `brussels` context bake bbox (`bake.mjs` REGIONS `brussels`). Confirmed long-shipped layers: buildings · roads · water · parks · landuse (**5/9**). rail + trees are config-added (`bake.mjs`, L-642) but that re-bake is not-yet-landed → excluded (honest 0). pedestrian: not a baked layer. sea: Brussels is inland — genuinely absent (not applicable), not fabricated. Score 5/9. |

## §CONTEXT-DATA-HONESTY note

DOES: baked OSM context (5/9 layers, `bake.mjs brussels`). REFUSES: an envelope (no rule pack; RRU Titre I
KIND not built) — never a borrowed/invented number. UNKNOWN (typed): PARCEL quality (`not-queried`, no BE
cadastre provider wired), LEGISLATION + ENVELOPE (`pending-implementation`), TERRAIN (`pending-implementation`,
no Brussels-Capital DTM route), HEIGHTS (`adapter-limitation`, GRB height Flanders-only + UrbIS unprobed).
`honestyOk: true`.

## Dossier index (C63 §5)

This `RATE.md` is the composite master; the siblings FEED it (naming: `../../../_TEMPLATE/NAMING-CONVENTION.md`).

| File | About | Feeds axis |
|---|---|---|
| **`RATE.md`** (this) | 7-axis composite completion scorecard | — |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | structured legislation/data-fill rate (~5–10 % Brussels prior) | LEGISLATION |
| [`ENVELOPE.md`](./ENVELOPE.md) | buildable-envelope solver status (RRU Titre I KIND gate) | ENVELOPE |
| [`HEIGHT.md`](./HEIGHT.md) | building-height provenance status (GRB Flanders-only; UrbIS unprobed) | HEIGHTS/LOD |
| [`README.md`](./README.md) | what governs here · zone taxonomy · pack status | all |
| [`NEXT.md`](./NEXT.md) | where we stopped · blockers · resume steps | all |
| [`RISK-REGISTER.md`](./RISK-REGISTER.md) | honesty guardrails | — |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | phased climb to 100 % | all |
| [`sources/SOURCES.md`](./sources/SOURCES.md) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) | per-field citations · human sign-off (L-449) | LEGISLATION · ENVELOPE |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authority: [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Composite scaffolded under audit L-649 Phase-1.*
