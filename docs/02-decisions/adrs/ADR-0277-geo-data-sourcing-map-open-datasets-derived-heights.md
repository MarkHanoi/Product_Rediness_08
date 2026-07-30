# 0277 — Geo-data sourcing map: prefer national open datasets keyless-first, DERIVE heights from open DSM−DTM where no open height product exists

**Status**: PROPOSED
**Date**: 2026-07-25
**Deciders**: founder (data-sourcing research, verified 2026-07-25) + architecture team
**Related contracts**: [C57 — Parcel Data Layer](../contracts/C57-PARCEL-DATA-LAYER.md) (the "what exists" ingestion half — parcel geometry+attributes; the terrain/height sourcing here is its physical-context sibling), [C58 — Zoning Rules & Buildable Envelope](../contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md) (the "what you may build" half — the envelope solver reads the height datum sourced here; §1.4 honesty/confidence discipline is inherited), [C19 — Site Model & Parcel](../contracts/C19-SITE-MODEL-AND-PARCEL.md) (the Site the terrain datum + building heights anchor to), [C12 — Geospatial](../contracts/C12-GEOSPATIAL.md) (the single `proj4` projector every national CRS reprojects through; the one vertical datum, §1.4), [C55 — Geodata Analytical Layers](../contracts/C55-GEODATA-ANALYTICAL-LAYERS.md) (the pluggable-provider precedent — no country hardcoded in core).
**Related ADRs**: [ADR-0269](./ADR-0269-compliance-authoring-parcel-zoning-envelope-strategy.md) (jurisdiction-agnostic core + per-jurisdiction adapters + curated packs — this sourcing map is the data spine under that decision), [ADR-0065](./ADR-0065-geodata-analytical-layers-pluggable-provider.md) (pluggable `GeodataProvider`, no country hardcoded), [ADR-0268](./ADR-0268-cesium-3d-tiles-georeferenced-building-placement.md) (the ellipsoidal WGS-84 ground datum the terrain meshes must share, L-584).
**Reference docs**: [GEO-DATA-SOURCING-MASTER.md](../../04-reference/jurisdictions/GEO-DATA-SOURCING-MASTER.md) (**the canonical sourcing table this ADR records the decisions for**), [CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md](../../04-reference/geospatial/CONTEXT-SCENE-COMPILER-AND-TERRAIN-NORTH-STAR.md) §2/§6.6/§6.7 (the nDSM height engine + the C-CONTEXT contract need), [HEIGHTS-COVERAGE-AND-BLOCKED.md](../../04-reference/jurisdictions/HEIGHTS-COVERAGE-AND-BLOCKED.md) + [CONTEXT-TERRAIN-COVERAGE.md](../../04-reference/geospatial/CONTEXT-TERRAIN-COVERAGE.md) (the two pipeline-status coverage docs, now deferring to the master for sourcing).

## Context

PRYZM needs, per jurisdiction, two independent geo-data axes: a **bare-earth terrain DTM** (the mesh
under the buildings, the long-requested 3D-Site gap) and a **per-building measured height** (kills the
9 m `assumed` default and feeds the C58 envelope). Two agent-produced coverage docs
(`HEIGHTS-COVERAGE-AND-BLOCKED.md`, `CONTEXT-TERRAIN-COVERAGE.md`) probed *reachability* per country
but were drifting: they disagreed on Bavaria, on Brussels, and on whether "no open height product"
means "no heights". The terrain North Star (§6.7) explicitly asks for a per-country data-source table
"built first as a spreadsheet" to drive phase ordering, and (§6.6) flags a **C-CONTEXT contract need**
with no canonical home yet.

The founder ran a verification pass (2026-07-25) across 17 country/region rows and established the
authoritative sourcing facts: which dataset, which endpoint, which auth, which licence, for terrain and
for heights. Several findings reframe the problem:

- **Most jurisdictions are open and commercial-OK**, many fully keyless.
- **The absence of a national building-*height product* is not a blocker** — Norway (NDH), UK (EA),
  and Wallonia (MNH ready-made raster) have open DSM/DTM (or nDSM) from which heights DERIVE without any
  commercial licence. The commercial products (FKB, OS Building Height Attribute) are avoidable.
- **Germany is 16 per-Land connectors**, not one national source; two flagship Länder (Berlin,
  Bavaria/Munich) are fully open — correcting a stale "Bavaria BLOCKED" verdict.
- **Portugal's terrain is reachable only via an undocumented/reverse-engineered STAC API** behind a
  free account — fragile, best-effort.
- **Only Saudi Arabia is nationally blocked** (no open DEM; Balady geo-fenced) — the accepted interim
  is the global Copernicus GLO-30 + GlobalBuildingAtlas fallback.
- **Spain has a *dedicated* building-surface product** (MDS Edificación / MDSnE2.5) — heights come
  from it directly, not a DSM−DTM subtraction.

Without a single authoritative sourcing record, each connector re-litigates these facts and the
coverage docs keep drifting. This ADR records the sourcing **decisions**; the
[GEO-DATA-SOURCING-MASTER.md](../../04-reference/jurisdictions/GEO-DATA-SOURCING-MASTER.md) holds the
full per-row table (endpoints, auth, licence, verdict, CI notes).

## Decision

**Adopt the founder-verified geo-data sourcing map as the authoritative record of terrain + building-height
provenance, governed by the following six sourcing principles.** Where any code or doc disagrees with the
map on *where a dataset comes from, under what auth, under what licence*, the map wins and the other is
corrected in place.

**(a) Prefer national open datasets, keyless where possible.** For each jurisdiction, select the open,
commercial-OK national/regional dataset; reach it without a credential wherever one exists. A free
account (Sweden `LANTMATERIET_API_KEY`, Finland `MML_API_KEY`, Portugal `DGT_CDD_EMAIL`/`DGT_CDD_PASSWORD`,
Flanders) is acceptable and is a *founder registration action*, not a licensing blocker. National
orthometric CRSes reproject through the single C12 `proj4` projector into the one ellipsoidal WGS-84
vertical datum (C12 §1.4 / ADR-0268 / L-584).

**(b) Where no open building-height PRODUCT exists, DERIVE heights from open DSM − DTM** rather than
licensing a commercial product. Norway (NDH DOM − DTM), the UK (EA DSM − DTM + OS Open Buildings/OSM
footprints), Portugal (MDS − MDT), and Italy (PST DSM − DTM) derive; **do not license FKB (NO) or the
OS Building Height Attribute (GB)**. Belgium-Wallonia's **MNH** is a *ready-made* nDSM/height raster —
use it directly, no subtraction. The derivation uses robust statistics (P90 / trimmed-median inside the
eroded footprint — never max), the same nDSM engine everywhere (terrain North Star §2), so "no height
product" is never a sourcing gap.

**(c) Treat Germany as per-Land connectors, not one national source.** Germany is 16 Land geoportals;
build Land by Land and verify each portal. Berlin (ATKIS DGM1 WMS + LoD2 CityGML, no auth) and
Bavaria/Munich (DGM1 + LoD2 CityGML via Metalink, keyless, CC BY 4.0) are both open today — this
**supersedes the earlier "Bavaria BLOCKED / ZSHH-restricted" verdict** in the heights coverage doc.

**(d) Unofficial / reverse-engineered APIs are best-effort — wrap in try/except + alerting, never
hard-fail CI.** Portugal DGT's terrain comes from an undocumented STAC endpoint
(`cdd.dgterritorio.gov.pt/dgt-be/v1/search`, not the public OGC API). The committed client
(`tools/context-bake/sources/dgt_cdd_client.py`) already follows this; it MUST never hard-fail a bake —
a reverse-engineered source can change without notice.

**(e) Only Saudi Arabia is nationally blocked; the accepted interim is the global keyless fallback.**
No open national DEM (GEOSA publishes none) and Balady building heights are geo-fenced (403 outside SA).
The accepted interim: **terrain = Copernicus GLO-30 DEM** (free, worldwide, keyless S3 bucket
`copernicus-dem-30m`; a DSM not bare-earth, attribution-only) and **heights = GlobalBuildingAtlas**.
**FABDEM bare-earth is CC-BY-NC-SA (non-commercial) and MUST NOT be shipped as a commercial drape** —
it is carried keyed `commercialOk:false` so it can never be selected by accident. The real unblock is a
GEOSA/Balady data agreement (authority: Saudi GEOSA).

**(f) Spain heights come from MDS Edificación (MDSnE2.5), not a DSM − DTM subtraction.** Spain publishes
a *dedicated building-only surface model* (MDSnE2.5) alongside general MDS02/MDS05 and the MDT terrain —
one of the best-provisioned jurisdictions. The Spain height connector reads MDS Edificación directly;
it MUST NOT be built as a generic DSM − DTM subtraction.

**Canonical home for the sourcing invariants — flagged for the founder, not minted here.** The terrain
North Star §6.6 proposes a new contract **"C-CONTEXT — Context Scene, Height & Terrain Engine"** whose
§3/§4 would own exactly the "one vertical datum / provenance-mandatory / robust-statistics / derive-don't-
license" invariants this ADR encodes. Per the C00 index rule ("propose in an ADR rather than unilaterally
mint a new contract number"), we **do not create that contract in this change**. Recommendation: when
the founder ratifies the context/terrain contract, it takes the **next free number C61**, cites this ADR
and GEO-DATA-SOURCING-MASTER.md as its sourcing appendix, and folds in principles (a)–(f). Until then,
GEO-DATA-SOURCING-MASTER.md is the interim canonical sourcing record in the reference layer, and this ADR
is the decision record.

## Consequences

- **Positive:** one authoritative sourcing record ends the coverage-doc drift (Bavaria, Brussels, and
  "no product ≠ no heights" are now settled and reconciled). The derive-don't-license decision (b) means
  **zero commercial data licences** are on the critical path — every jurisdiction except Saudi is
  reachable with open data, most keyless. The founder's action list is small and entirely free (six rows,
  §2 of the master), separated cleanly from the ~10 keyless jurisdictions that need only PRYZM engineering
  (§3). Per-Land Germany (c) matches the existing per-Land building/parcel routers (L-511, ALKIS-NRW), so
  the pattern is proven. Best-effort wrapping (d) keeps a fragile Portuguese endpoint from ever breaking
  a bake. The honest Saudi fallback (e) avoids the FABDEM non-commercial trap that a "cover everywhere"
  instinct would fall into. Every row carries licence + provenance, so the C58 envelope and any downstream
  consumer inherit auditable sourcing (C23).
- **Negative / trade-offs:** DERIVING heights (b) requires the nDSM engine to be resourced (the Python
  geo stack — `pdal`/`laspy`/`rasterio`/`open3d` — is a build-farm action, per HEIGHTS-COVERAGE §cross-cutting-1);
  until then Norway/UK/Portugal/Italy heights are *sourced and decided* but not yet *produced*. Germany
  (c) is N connectors of ongoing maintenance, not one. The Portuguese STAC (d) can break silently and
  needs alerting. Saudi (e) stays low-confidence (GLO-30 is 30 m and a DSM) until an agreement lands.
  The sourcing facts have a shelf life — national portals change endpoints/licences; the master table
  needs periodic re-verification (Italy explicitly "re-check quarterly").
- **Governance consequence:** the sourcing invariants have **no ratified contract home yet** — they live
  in a reference doc + this ADR pending the founder's C-CONTEXT (recommended C61) decision. This is
  deliberate (the C00 index forbids minting a contract number unilaterally); it is flagged, not resolved.

## Alternatives considered

- **License commercial national height products (FKB in Norway, OS Building Heights in the UK) for a
  ready-made number.** Rejected: an open DSM − DTM derivation yields the same measured height with no
  licence cost and no per-country commercial negotiation, using the one nDSM engine PRYZM builds anyway.
  Licensing would put a recurring cost and a legal gate on the critical path for zero capability gain.
- **Treat Germany as one national source.** Rejected: there is no national German DGM/LoD2 endpoint —
  the data is federated across 16 Land geoportals with per-Land licences and portals. Pretending
  otherwise would hardcode one Land's assumptions and break on the next.
- **Silently drape FABDEM (global bare-earth) over Saudi (and any blocked country).** Rejected: FABDEM
  is CC-BY-NC-SA — non-commercial. Shipping it in a commercial product without clearing the clause is a
  licence violation. The honest fallback is Copernicus GLO-30 (attribution-only) + an explicit low-confidence
  flag, or flat ground + a founder prompt — never a non-commercial drape passed off as coverage.
- **Build Spain heights as a generic DSM − DTM subtraction (uniform with the derive countries).**
  Rejected: Spain publishes MDS Edificación (MDSnE2.5), a dedicated building-surface product that
  isolates building surfaces directly — cleaner and higher-fidelity than subtracting a general DSM from a
  DTM. Uniformity for its own sake would throw away a better national product.
- **Mint the C-CONTEXT (Context Scene, Height & Terrain) contract now to house these invariants.**
  Rejected for this change: the C00 index rule is to propose a contract in an ADR and let the founder
  ratify it with the next free number, not to unilaterally mint one. The invariants are recorded here and
  in the master doc; the contract is flagged as recommended C61.
- **Leave the two coverage docs as the record and reconcile ad hoc.** Rejected: they were already drifting
  (Bavaria, Brussels) precisely because neither was authoritative. A single sourcing master with the two
  coverage docs deferring to it is the fix.

## Open decisions deferred to humans (recorded, not resolved here)

- **C-CONTEXT contract (recommended C61).** Whether — and when — to ratify the North Star §6.6
  "Context Scene, Height & Terrain Engine" contract as the canonical home for principles (a)–(f) and the
  one-vertical-datum / provenance / robust-statistics invariants. This ADR recommends it; the founder
  ratifies and the C00 index assigns the number.
- **nDSM engine resourcing.** DERIVING heights (b) for Norway/UK/Portugal/Italy needs the Python geo
  worker image provisioned — a build-farm resourcing decision (cost/where), not a per-country licence.
- **Saudi GEOSA/Balady agreement.** The only path off the low-confidence global fallback — a
  business/partnership decision (authority: Saudi GEOSA).
- **Re-verification cadence.** How often to re-probe the sourcing table (Italy flagged quarterly;
  national portals change endpoints/licences over time).
