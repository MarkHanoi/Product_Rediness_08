# VERIFICATION — Finland national zoning (Alueidenkäyttölaki / Ryhti / kaavatietomalli)

> The L-449 human-verification gate. Draft → published is a human act. This file records who
> checked what, when, against which data version, and **what could NOT be confirmed.**

---

## Machine-verified (agent, 2026-07-24) — documentation review; no live HTTP probes

**Probe environment:** research from published primary-source documentation only. No live API calls
were executed for this jurisdiction. All claims are at `published` or `stated` confidence, not
`VERIFIED-LIVE`. No pack may ship at `structured` confidence without live endpoint verification.

| Claim | How verified | Status |
|---|---|---|
| Alueidenkäyttölaki + Rakentamislaki effective 1.1.2025, replacing MRL | Cross-referenced against Finlex statutory database (Finnish Acts); MoE programme documentation | ✅ VERIFIED from published primary statutory text |
| Three-tier plan hierarchy (maakuntakaava → yleiskaava → asemakaava) — nationally uniform, no regional legal variation | MoE planning documentation; structural study cross-referenced against national law | ✅ VERIFIED from published law |
| Kaavatietomalli is ISO 19109/19103/19107-based | Ministry of the Environment — Ryhti programme documentation | ✅ VERIFIED from published government technical documentation |
| South Savo and North Savo plans live in Ryhti OGC API | Ministry of the Environment — Ryhti programme documentation | ✅ VERIFIED from published government source |
| VOOKA mandate: export all current Finnish plans to kaavatietomalli | MoE VOOKA project documentation | ✅ VERIFIED from published programme documentation |
| Legal submission deadline: 1.1.2029 (building data); building-permit data model from start of 2026 | Rakentamislaki + MoE implementation guidance | ✅ VERIFIED from published statutory text |
| No retroactive obligation for historical plan data | Rakentamislaki + MoE guidance | ✅ VERIFIED from published statutory text |
| Kaavayksikkö not mandated — KAATIO project caveat | Kaavatietomalli documentation; KAATIO project findings | ✅ VERIFIED from published technical documentation |
| Maanmittauslaitos is sole national cadastral authority | NLS organisation documentation; no Trento/Bolzano-style carve-outs for mainland Finland | ✅ VERIFIED — structural research |
| Cadastre OGC API endpoint: `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/` | NLS open data API documentation | ✅ VERIFIED from published NLS documentation |
| Cadastre licence: CC Attribution 4.0 | NLS open data terms | ✅ VERIFIED from published NLS terms |
| KMTK Maastotietokanta is open data; Buildings class carries 3D vectors + storey count | NLS Maastotietokanta product specification | ✅ VERIFIED from published NLS product description |
| National LiDAR programme from 2020; 5 pts/m² original; 0.5 pts/m² public | NLS LiDAR programme documentation | ✅ VERIFIED from published NLS documentation |
| Museovirasto heritage WFS/WMS serves: ancient monuments, scheduled areas, RKY, World Heritage, Building Heritage Register | Museovirasto open spatial data documentation | ✅ VERIFIED from published Museovirasto documentation |
| Museovirasto non-exhaustion caveat — two other channels (LVV for statute-protected; municipality/region for plan-protected) | Museovirasto self-disclosure in open data documentation | ✅ VERIFIED from published Museovirasto source (agency's own statement) |
| RHR GDPR-restriction — third-party access requires DVV permission | DVV published access terms; GDPR + Finnish Data Protection Act | ✅ VERIFIED from published DVV documentation |
| SeutuRAMAVA dataset covers Espoo, Helsinki, Kauniainen, Vantaa — block-level FAR from valid asemakaava | Helsinki Region open data programme documentation | ✅ VERIFIED from published dataset description |
| Åland has separate land registry and building permitting by statute | Finnish Constitution + Åland Self-Government Act | ✅ VERIFIED from published constitutional/statutory source |
| Ryhti OGC API is free and open (no geo-block known, unlike Sweden's NGP) | MoE programme documentation | ⚠️ STATED — no geo-block mentioned in documentation; not live-confirmed |
| Helsinki/Uusimaa VOOKA migration date | NOT confirmed in this pass | ❌ UNVERIFIED |

---

## NOT confirmed (needs a live probe or human expert)

| Open item | Why it needs confirmation |
|---|---|
| **Ryhti OGC API endpoint URL and GetCapabilities** | No live probe executed. The entire Tier-1 implementation path depends on this. Must run before writing any provider code. |
| **Ryhti feature property names** | tehokkuusluku (FAR), kerrosluku (storeys), kayttotarkoitus (zone/use code) — field names assumed from kaavatietomalli schema documentation but not confirmed from a live feature response. |
| **Ryhti auth model** | API documented as open/free; no auth token process has been tested. |
| **Maanmittauslaitos parcel API — live response** | No actual API key has been obtained; no GetFeatures call made. |
| **KMTK 3D building vector — attribute names + fill rate** | storey-count attribute assumed from product description; not confirmed from live DescribeFeatureType. |
| **Museovirasto WFS endpoint — GetCapabilities** | Service existence confirmed; exact URL and layer names not fetched. |
| **LVV (Lupa- ja valvontavirasto) heritage API** | Second heritage channel named by Museovirasto; LVV's open data API has not been investigated. |
| **Helsinki / Uusimaa VOOKA migration date** | Must confirm before recommending Helsinki as a Tier-1 deployment target. |
| **SeutuRAMAVA download path + field schema** | Dataset existence confirmed; field names and download mechanism not fetched. |
| **Åland's cadastral/planning API coverage** | Separate system confirmed by statute; no investigation of what open APIs exist. |
| **Kaavatietomalli kaavayksikkö adoption rate in live Ryhti regions** | Self-disclosed caveat; practical impact on parcel-level query completeness unknown until sampled. |

---

## Caveats that must remain visible in any product using this data

- Ryhti/kaavatietomalli data is only live for South Savo and North Savo. A "miss" from Ryhti for any other
  region does NOT mean no plan exists — it means the region has not yet been migrated under VOOKA. The
  operative asemakaava still exists and governs; it is simply not yet in the national API.
- Museovirasto heritage WFS is explicitly non-exhaustive. A "not found" result does not certify the absence
  of a heritage constraint. Two other channels must be checked: LVV (for statute-protected buildings) and
  the drafting municipality/regional council (for plan-protected buildings/areas).
- RHR (building/dwelling register) third-party access is GDPR-restricted. Building height is available via
  KMTK; RHR ownership/occupancy data is not.
- Åland is excluded from mainland NLS/Ryhti coverage by statute and must be treated as its own jurisdiction.

---

## Sign-off

- **Agent draft:** 2026-07-24. Legal structure confirmed from primary statutory and government programme
  sources. No live endpoint probes executed. All claims at `published` or `stated` confidence.
- **Human published:** ⬜ PENDING — a Finnish-planner sign-off is required on:
  1. Whether the kaavatietomalli kaavayksikkö gap means that some parcel-level queries against Ryhti will
     return plan data without parcel-specific numeric attributes — and how to handle the UI disclosure.
  2. Whether `confidence: 'structured'` may be claimed for Ryhti-delivered kaavatietomalli fields before a
     live feature response is verified against the signed original asemakaava plan document.
  3. The correct authority-chain for heritage disputes where Museovirasto + LVV + municipal plan-overlay
     results conflict.
  No pack may ship before items 1–3 are resolved.
