# San Francisco — City Atlas (`us/CITIES/SAN_FRANCISCO.md`)

**State:** California (`us-ca`) · **FIPS place:** 0667000 · **Adapter family:** `SF*Provider` ·
**Routing key:** APN (assessor block-lot) · **Analogue:** Barcelona (strongest analogue)
**Readiness:** 9.5 (CONVERGENT-SECONDARY · unprobed) · **Last updated:** 2026-07-30
**Confidence (whole file):** CONVERGENT-SECONDARY (not probed — **pending-probe**).
**No RATE % cell is asserted here.**

> **The Barcelona analogue.** SF pairs accurate assessor parcels (**APN**) with detailed zoning
> **and a separate height-and-bulk district layer**, over LiDAR terrain — the same shape as the
> Barcelona pipeline. This doc is the architecture/data-source layer; the **scored** face is the
> dossier at [`../us-ca/0667000-san-francisco/`](../us-ca/0667000-san-francisco/README.md)
> (this atlas does not edit that dossier). SF is a **consolidated city-county** — one Planning
> Code, no internal multi-jurisdiction routing.

---

## 1 — Why SF is the strongest Barcelona analogue

Barcelona = accurate parcel + explicit zoning + explicit height envelope + terrain relief, all
open. SF matches each: DataSF assessor parcels (APN) + SF Planning Code zoning district + a
**distinct height-and-bulk district** (numeric height + bulk, *not* a citywide FAR) + steep
LiDAR terrain. The height-and-bulk layer is the key lever — like Barcelona, height is stated,
not derived from FAR.

---

## 2 — Data sources (CONVERGENT-SECONDARY · pending-probe)

### 2.1 Parcels — DataSF assessor **APN** ★★★★★
| Aspect | Value |
|---|---|
| What | Assessor block-lot (APN) parcel polygons + area |
| Owner | SF Office of the Assessor-Recorder / DataSF |
| Access | DataSF (Socrata) API + ArcGIS REST feature service |
| Reverse lookup | coord → APN (spatial query) |
| Confidence | CONVERGENT-SECONDARY — pending live probe |

### 2.2 Zoning district ★★★★★
- **SF Planning Code** zoning districts (`RH-1`, `RM-2`, `NC-3`, `PDR-1`, `C-3`, mixed-use, etc.)
  via DataSF zoning layer. **Rule KIND = tiered-occupation + explicit height** (ADR-0270 / C58
  §2.2), *not* NYC-style citywide FAR — do not force a FAR KIND onto SF.

### 2.3 Height-and-bulk district ★★★★★ (the key lever)
- Separate **height-and-bulk** map: numeric height limit + bulk envelope, layered on the zoning
  district. This is the direct, automatable height source (the Barcelona-like explicit envelope).

### 2.4 Terrain / LiDAR
- Steep SF relief makes terrain load-bearing. City LiDAR → **USGS 3DEP** fallback
  ([`../DATASETS/USGS_3DEP.md`](../DATASETS/USGS_3DEP.md)); Overture/3DEP nDSM for building height.

### 2.5 Open GIS
- DataSF is a mature open-data portal (Socrata + ArcGIS REST) — parcels, zoning, height-and-bulk,
  building footprints, orthophoto all published.

---

## 3 — Adapter design

```
SFParcelProvider    coord | APN → parcel polygon + area + APN            (DataSF assessor)
SFZoningProvider    APN → zoning district + height-and-bulk district      (DataSF zoning + H&B)
SFEnvelopeProvider  district + H&B → massing (height + bulk + rear-yard)  (SF rule pack)
```

**Envelope automatability ★★★★★ (height side):**
- **Automatable:** numeric height limit + bulk from the height-and-bulk district → a direct
  height-capped extrusion (stronger than a FAR-only city).
- **PARTIAL:** rear-yard / bulk controls, area/specific plans (Eastern Neighborhoods, Central
  SoMa), **Discretionary Review** + conditional use — overlay the base district (P1 trap).

**Pipeline:** `coord → SFParcelProvider → APN → zoning district → height-and-bulk district →
SF rule pack → envelope → 3D massing`.

---

## 4 — Traps (P1)

- **Do not apply a citywide FAR** — SF governs by height-and-bulk district, not FAR (C58 §2.2).
- **Discretionary Review + conditional use + area/specific plans** overlay the base district;
  the base answer is incomplete for them.
- **Coastal Zone** overlay on the western/ocean edge.

---

## 5 — Links

- **Scored dossier (do not edit here):** [`../us-ca/0667000-san-francisco/README.md`](../us-ca/0667000-san-francisco/README.md)
  · [`ENVELOPE.md`](../us-ca/0667000-san-francisco/ENVELOPE.md) · [`HEIGHT.md`](../us-ca/0667000-san-francisco/HEIGHT.md)
  · [`RISK-REGISTER.md`](../us-ca/0667000-san-francisco/RISK-REGISTER.md)
- **National architecture:** [`../USA.md`](../USA.md) · **Atlas index:** [`./README.md`](./README.md)
- **National fallbacks:** [`3DEP`](../DATASETS/USGS_3DEP.md) (steep relief) · [`FEMA flood`](../DATASETS/FEMA_FLOOD.md) (waterfront) · [`NHD`](../DATASETS/NATIONAL_HYDROGRAPHY.md) (bay/ocean)

## 6 — Pending-probe checklist
- [ ] DataSF **height-and-bulk** layer schema + coverage probed live (strongest lever)
- [ ] DataSF zoning-district numeric attributes vs code-only
- [~] SF Assessor parcel layer wired as `SFParcelProvider` — **BUILT `wired-pending-probe`** (L-650 Phase-4):
      `packages/site-parcel-data/src/parcelProviders/sfParcelProvider.ts` (APN/blocklot + WGS84 ring +
      geometry-derived area; geometry-first, NO FAR; OPTIONAL DRAFT height-and-bulk lead). Pending: the
      orchestrator registers `isInSF→sf-datasf` in `parcelProviders/registry.ts` + a live endpoint probe
      (`// PROBE:` markers on the DataSF `acdm-wktn` resource + the ArcGIS FeatureServer path).
- [ ] Overture / 3DEP nDSM height join validated on steep blocks
- [ ] coord → APN reverse lookup verified against a known lot

**Honesty:** all of §2–§5 is CONVERGENT-SECONDARY (not probed). SF moves off "unprobed" only
when the assessor + zoning + height-and-bulk layers are probed live and wired as
`SFParcelProvider`/`SFZoningProvider`; the envelope stays not-assessed until the SF rule pack exists.
