# Scotland — jurisdiction profile (structured stub)

**Constituent country:** Scotland · **Parent:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) ·
**Registry:** Registers of Scotland (Land Register) · **Planning:** NPF4 + Local Development Plans ·
**Mapping:** Ordnance Survey (GB-wide) · **CRS:** OSGB36 / British National Grid (EPSG:27700) ·
**Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **status: unprobed**

> **Confidence: CONVERGENT-SECONDARY throughout. Not wired or live-probed in PRYZM.** Nothing here
> moves a `RATE.md` cell. **⚠ Registers of Scotland Land Register is an OWNERSHIP register — its
> boundaries are drawn on the OS map and are NOT a survey-grade cadastre / legal parcel edge.** Empty
> and failed are the same value — ship the probe before the fix.

Scotland reuses the shared GB pipeline (OS, UPRN, BNG) with its own registry / planning / LiDAR /
heritage adapters. Section headers mirror `ENGLAND.md`; every substantive cell is **unprobed**.

---

1. **Responsible authorities** — mapping: Ordnance Survey (GB-wide). Ownership: **Registers of
   Scotland (RoS)** — the map-based **Land Register** (migrating from the older **Sasine** register).
   Planning: **Scottish Government** (NPF4) + planning authorities. Terrain/LiDAR: **Scottish Remote
   Sensing Portal (SRSP)** + **SEPA**. Heritage: **Historic Environment Scotland (HES)**. Nature:
   **NatureScot**. Water/flood: **SEPA**. *unprobed.*
2. **CRS** — OSGB36 / British National Grid (EPSG:27700); ODN height datum. *unprobed.*
3. **Parcels** — **Registers of Scotland Land Register** (ownership, map-based, general boundaries).
   ⚠ NOT a survey cadastre. Sasine → Land Register migration incomplete. INSPIRE-equivalent index
   TBD. *status: unprobed.*
4. **Buildings** — OS MasterMap / OS Open Buildings (GB-wide). *unprobed.*
5. **Height** — DERIVED via shared nDSM module; **SRSP LiDAR** (DSM − DTM P90). ⚠ no national height
   attribute. *unprobed.*
6. **Trees** — LA inventories → NFI (GB) → SRSP LiDAR CHM → procedural. *unprobed.*
7. **Roads** — OS MasterMap Highways / OS Open Roads; Transport Scotland (trunk network). *unprobed.*
8. **Pedestrian** — OS paths → ortho-segmentation → procedural. *unprobed.*
9. **Water** — SEPA hydrography + OS Open Rivers; **flood = separate SEPA overlay**. HARD RULE: never
   derive water elevation from raw LiDAR. *unprobed.*
10. **Parks / greenspace** — OS Open Greenspace + LA + NatureScot. *unprobed.*
11. **Addresses** — AddressBase / **UPRN** (GB-wide). *unprobed.*
12. **Planning** — **NPF4 (National Planning Framework 4)** = national spatial strategy + policy;
    per-authority **Local Development Plans (LDPs)**, mostly PDF. Discretionary, not by-right.
    *status: unprobed.*
13. **Overlay / refusal risk** — Conservation Areas, Listed Buildings (HES), Scheduled Monuments,
    National Scenic Areas, flood zones (SEPA). *unprobed.*
14. **Envelope feasibility** — HIGH complexity, legal not technical; no national numeric envelope.
    *unprobed.*
15. **Outstanding unknowns** — RoS Land Register open access + INSPIRE-equivalent; SRSP LiDAR
    endpoints/coverage/year/density + classification codes; NPF4/LDP machine-readability; HES service
    endpoints. *All probe items.*

---

**Related:** [`../UNITED-KINGDOM.md`](../UNITED-KINGDOM.md) ·
[`../GEOSPATIAL-DATA-INVENTORY.md`](../GEOSPATIAL-DATA-INVENTORY.md) ·
[`ENGLAND.md`](./ENGLAND.md) (full reference implementation).

*Confidence: CONVERGENT-SECONDARY, unprobed. RoS = ownership, general boundaries — NEVER survey
cadastre. Changes NO RATE % cell. Maintainer: UNASSIGNED.*
