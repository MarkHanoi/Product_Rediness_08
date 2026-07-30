# Northern Ireland — jurisdiction profile (structured stub)

**Constituent country:** Northern Ireland · **Parent:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) ·
**Registry:** Land & Property Services (LPS) · **Planning:** SPPS + Local Development Plans (Planning
Portal NI) · **Mapping:** **OSNI** (Ordnance Survey of Northern Ireland — separate agency) ·
**CRS:** Irish Grid (EPSG:29903) / Irish Transverse Mercator (EPSG:2157) · **Last updated:** 2026-07-30 ·
**Maintainer:** UNASSIGNED · **status: unprobed**

> **Confidence: CONVERGENT-SECONDARY throughout. Not wired or live-probed in PRYZM.** Nothing here
> moves a `RATE.md` cell. **⚠ LPS land registration is an OWNERSHIP register — NOT a survey-grade
> cadastre / legal parcel edge.** Empty and failed are the same value — ship the probe before the fix.

**Northern Ireland is the most distinct UK jurisdiction:** mapping is **OSNI** (not OS), the CRS is
the **Irish Grid** (not British National Grid), and both mapping and registration sit inside **Land &
Property Services (LPS)**. Section headers mirror `ENGLAND.md`; every substantive cell is **unprobed**.

---

1. **Responsible authorities** — mapping: **OSNI** (Ordnance Survey of Northern Ireland, part of
   **LPS**) — a *separate* agency from OS. Ownership: **Land & Property Services (LPS)** — Land
   Registry NI. Planning: **Dept for Infrastructure** (SPPS) + councils via **Planning Portal NI**.
   Terrain/LiDAR: **DAERA** (Dept of Agriculture, Environment & Rural Affairs). Heritage: **Historic
   Environment Division (HED)**. Roads: **DfI Roads (Roads Service)**. *unprobed.*
2. **CRS** — **Irish Grid (EPSG:29903)** / **Irish Transverse Mercator (EPSG:2157)** — NOT British
   National Grid. Malin Head height datum. ⚠ the one CRS exception in GB. *unprobed.*
3. **Parcels** — **LPS Land Registry NI** (ownership) + LPS mapping. ⚠ NOT a survey cadastre. Historic
   Registry of Deeds → Land Registry migration. *status: unprobed.*
4. **Buildings** — **OSNI** topographic building layers (not OS MasterMap). *unprobed.*
5. **Height** — DERIVED via shared nDSM module; **DAERA LiDAR** (DSM − DTM P90). ⚠ no national height
   attribute. *unprobed.*
6. **Trees** — council inventories → woodland inventory → DAERA LiDAR CHM → procedural. *unprobed.*
7. **Roads** — **OSNI** roads / **DfI Roads** network. *unprobed.*
8. **Pedestrian** — OSNI paths → ortho-segmentation → procedural. *unprobed.*
9. **Water** — DAERA / Rivers Agency hydrography; **flood = separate DAERA overlay**. HARD RULE:
   never derive water elevation from raw LiDAR. *unprobed.*
10. **Parks / greenspace** — OSNI greenspace + council + NIEA. *unprobed.*
11. **Addresses** — **Pointer** (NI address database) + **UPRN**; note NI uses Pointer rather than
    GB AddressBase directly. *unprobed.*
12. **Planning** — **SPPS (Strategic Planning Policy Statement)** = regional policy; council **Local
    Development Plans (LDPs)** via **Planning Portal NI**, mostly PDF. Discretionary, not by-right.
    *status: unprobed.*
13. **Overlay / refusal risk** — Conservation Areas, Listed Buildings (**HED**), Scheduled Monuments,
    Areas of Outstanding Natural Beauty, flood zones (DAERA). *unprobed.*
14. **Envelope feasibility** — HIGH complexity, legal not technical; no national numeric envelope.
    *unprobed.*
15. **Outstanding unknowns** — OSNI product/schema/licence (distinct from OS); Irish Grid ↔ WGS84
    transform accuracy; DAERA LiDAR endpoints/coverage/year/density + classification codes; LPS Land
    Registry open access; SPPS/LDP machine-readability; Pointer ↔ UPRN join; HED service endpoints.
    *All probe items.*

---

**Related:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) ·
[`../GEOSPATIAL-DATA-INVENTORY.md`](../GEOSPATIAL-DATA-INVENTORY.md) ·
[`ENGLAND.md`](./ENGLAND.md) (full reference implementation).

*Confidence: CONVERGENT-SECONDARY, unprobed. LPS = ownership, general boundaries — NEVER survey
cadastre. OSNI ≠ OS; Irish Grid ≠ BNG. Changes NO RATE % cell. Maintainer: UNASSIGNED.*
