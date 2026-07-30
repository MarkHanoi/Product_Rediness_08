# Wales — jurisdiction profile (structured stub)

**Constituent country:** Wales · **Parent:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) ·
**Registry:** HM Land Registry (Wales) · **Planning:** Planning Policy Wales (PPW) + Local
Development Plans · **Mapping:** Ordnance Survey (GB-wide) · **CRS:** OSGB36 / British National Grid
(EPSG:27700) · **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **status: unprobed**

> **Confidence: CONVERGENT-SECONDARY throughout. Not wired or live-probed in PRYZM.** Nothing here
> moves a `RATE.md` cell. **⚠ HMLR title polygons / INSPIRE Index Polygons in Wales are OWNERSHIP
> with GENERAL boundaries (s.60 LRA 2002) — NEVER survey-grade / a legal parcel edge.** Empty and
> failed are the same value — ship the probe before the fix.

Wales reuses the shared GB pipeline (OS, UPRN, BNG) with its own planning / LiDAR / heritage
adapters (registration is still HMLR, shared with England). Section headers mirror `ENGLAND.md`;
every substantive cell is **unprobed**.

---

1. **Responsible authorities** — mapping: Ordnance Survey (GB-wide). Ownership: **HM Land Registry**
   (Wales). Planning: **Welsh Government** (Planning Policy Wales) + local planning authorities.
   Terrain/LiDAR: **Natural Resources Wales (NRW)**. Heritage: **Cadw**. Nature/flood: **Natural
   Resources Wales (NRW)**. *unprobed.*
2. **CRS** — OSGB36 / British National Grid (EPSG:27700); ODN height datum. *unprobed.*
3. **Parcels** — **HM Land Registry** titles + **INSPIRE Index Polygons** (ownership, general
   boundaries). ⚠ NOT a survey cadastre. *status: unprobed.*
4. **Buildings** — OS MasterMap / OS Open Buildings (GB-wide). *unprobed.*
5. **Height** — DERIVED via shared nDSM module; **NRW LiDAR** (DSM − DTM P90). ⚠ no national height
   attribute. *unprobed.*
6. **Trees** — LA inventories → NFI (GB) → NRW LiDAR CHM → procedural. *unprobed.*
7. **Roads** — OS MasterMap Highways / OS Open Roads; Welsh trunk road network. *unprobed.*
8. **Pedestrian** — OS paths → ortho-segmentation → procedural. *unprobed.*
9. **Water** — NRW hydrography + OS Open Rivers; **flood = separate NRW overlay**. HARD RULE: never
   derive water elevation from raw LiDAR. *unprobed.*
10. **Parks / greenspace** — OS Open Greenspace + LA + NRW (National Parks: Snowdonia/Eryri, Brecon
    Beacons/Bannau Brycheiniog, Pembrokeshire Coast). *unprobed.*
11. **Addresses** — AddressBase / **UPRN** (GB-wide). *unprobed.*
12. **Planning** — **Planning Policy Wales (PPW)** + **Future Wales: the National Plan 2040** =
    national policy; per-authority **Local Development Plans (LDPs)**, mostly PDF. Discretionary, not
    by-right. *status: unprobed.*
13. **Overlay / refusal risk** — Conservation Areas, Listed Buildings (**Cadw**), Scheduled
    Monuments, National Parks / AONBs, flood zones (NRW). *unprobed.*
14. **Envelope feasibility** — HIGH complexity, legal not technical; no national numeric envelope.
    *unprobed.*
15. **Outstanding unknowns** — NRW LiDAR endpoints/coverage/year/density + classification codes;
    PPW/LDP machine-readability; Cadw service endpoints; DataMapWales portal coverage. *All probe
    items.*

---

**Related:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) ·
[`../GEOSPATIAL-DATA-INVENTORY.md`](../GEOSPATIAL-DATA-INVENTORY.md) ·
[`ENGLAND.md`](./ENGLAND.md) (full reference implementation).

*Confidence: CONVERGENT-SECONDARY, unprobed. HMLR / INSPIRE = ownership, general boundaries — NEVER
survey cadastre. Changes NO RATE % cell. Maintainer: UNASSIGNED.*
