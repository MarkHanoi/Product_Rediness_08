# VERIFICATION — Sweden national zoning (PBL / NGP)

> The L-449 human-verification gate. Draft → published is a human act. This file records who
> checked what, when, against which data version, and **what could NOT be confirmed.**

---

## Machine-verified (agent, 2026-07-24)

| Claim | How verified | Status |
|---|---|---|
| PBL (2010:900) is the single national planning statute | Cross-referenced against Swedish Riksdag law database (SFS) | ✅ VERIFIED from primary statutory text |
| BFS 2020:5 mandates digital detaljplan from 2022-01-01 | Boverket regulation confirmed in structural research | ✅ VERIFIED from published regulation |
| Lantmäteriet is the sole national land-survey authority | Confirmed — no Trento/Bolzano-style carve-outs exist in Sweden | ✅ VERIFIED |
| CC0 licence for Lantmäteriet open-data products | Lantmäteriet product pages; INSPIRE compliance | ✅ VERIFIED from published terms |
| Terrain LiDAR: complete, 2009–2019, 0.5–1 pts/m² | Lantmäteriet product specification | ✅ VERIFIED from published product description |
| RAÄ Öppna-dataportal exists; CC0 for some datasets | RAÄ open data programme documentation | ✅ VERIFIED from published terms |
| 236/290 municipalities actively delivering to NGP (April 2025) | April 2025 conference presentation citation in source study | ⚠️ STATED — conference figure, not independently confirmed from Lantmäteriet's live producer list |
| Vadstena: first Östergötland municipality to publish via NGP on 2026-02-18 | Municipal/NGP announcement cited in source study | ⚠️ STATED — not independently confirmed |
| Stockholm LOD2 is fee-based | Stockholm city geodata portal fee schedule cited in source study | ⚠️ STATED — fee schedule not directly fetched |

---

## NOT confirmed (needs a live probe or human expert)

| Open item | Why it needs confirmation |
|---|---|
| **NGP WFS endpoint URL and GetCapabilities** | No live probe executed — the entire implementation path depends on this. Must run before writing any provider code. |
| **NGP field names and provision-code schema** | Follows from endpoint confirmation — DescribeFeatureType has not been run. |
| **Land-area fill rate for any municipality** | This is the single most important unknown number. 236/290 municipal participation ≠ high land-area hit rate. Direct Monte-Carlo probe required. |
| **Planbestämmelsekatalog join key** | The specific attribute name linking an NGP feature to a Planbestämmelsekatalog provision code has not been confirmed from a live feature response. |
| **Lantmäteriet "akt" access current status** | Was closed as of research date. May have been reinstated. Check before assuming cadastral-document access. |
| **LOD2 for Gothenburg, Malmö** | Stockholm confirmed fee-based. Other cities not checked. |
| **§USABLE-FALLBACK precedence for Swedish detaljplan** | If a post-2022 plan is silent on a dimension, whether a pre-2022 plan or the översiktsplan legitimately governs that omitted number is a legal question requiring Swedish planner sign-off. |
| **Informational vs. certifying status of retro-digitised plans** | Retro-digitised pre-2022 plans exist in some municipalities but are not legally authoritative. A Swedish planner must confirm whether these can be shipped even at `corroborated` confidence, or must always refuse. |

---

## Caveats that must remain visible in any product using this data

- NGP delivers only plans adopted/amended from 2022-01-01. A "miss" from NGP does NOT mean no plan exists — it may mean an older, legally-binding, undigitised plan governs.
- Retro-digitised versions of older plans are **informational, not certifying** — the analog original remains the legally authoritative document.
- The Lantmäteriet "akt" access restriction is a live, dated caveat that affects deed/instrument retrieval for pre-NGP plans.
- LOD2 building-height models are not a free national layer — terrain (LiDAR point cloud) is free and national, but finished per-building volumes are municipal and sometimes paid.

---

## Sign-off

- **Agent draft:** 2026-07-24. Legal structure confirmed from primary statutory sources; platform
  existence and participation figures at `stated` level from conference/secondary sources.
- **Human published:** ⬜ PENDING — a Swedish-planner sign-off is required on:
  1. The §USABLE-FALLBACK precedence question (pre-2022 plan vs. oversiktsplan vs. NGP post-2022
     plan when a parcel sits at the boundary).
  2. The informational-vs.-certifying status of retro-digitised pre-2022 plans.
  3. Whether `confidence: 'structured'` may be claimed for NGP-delivered provision codes before a
     live GetFeature response is verified against a signed original plan document.
  No pack may ship before items 1–3 are resolved.
