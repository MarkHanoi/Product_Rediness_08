# Portugal — Geospatial Infrastructure Review (source analysis)

> **What this file is.** The narrative analysis behind
> `../PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md`, folded from the founder-supplied expert review of
> 2026-07-30 (*Portugal Geospatial Infrastructure Review*). It records the reviewer's per-layer
> source analysis, the strategy note, and the **reviewer's 9/10 infrastructure score** — the
> geospatial (data-availability) axis only.
>
> **Confidence (§CONTEXT-DATA-HONESTY).** Everything here is **`CONVERGENT-SECONDARY`** — an expert
> review that cites authoritative providers but was **NOT live-probed**. Every claim must be
> **confirmed by direct probe before it gates a production decision or raises any RATE / LOD-RATE
> cell.** This review changes NO rate; it defines the probe queue (§Probe steps in the inventory,
> and `../NEXT.md §9`).
>
> **Session date:** 2026-07-30 · **Method:** expert review of national geospatial infrastructure;
> no live endpoint probes. · **Companion to** `PORTUGAL-MASTER-DATA-SOURCE-STUDY.md`.

---

## Headline: the DGT OGC API platform

The reviewer's central finding is that Portugal delivers its national geospatial layers through a
coherent **DGT OGC API platform** (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`), reported as
**CC BY 4.0 platform-wide**. This is a stronger, more modern picture than the prior `VERIFIED-LEAD`
catalogue (which described WMS/WFS via SNIG). The review corroborates and upgrades those leads to
`CONVERGENT-SECONDARY` — it does not, by itself, live-probe them.

| Dataset | Layer | PRYZM use | Reviewer ★ |
|---|---|---|---|
| **CAOP** | admin boundaries (concelho + freguesia + distrito) | jurisdiction routing (== DE AGS / FR INSEE lookup) | ★★★★★ "easiest win" |
| **Cadastro Predial (Continente)** | parcel geometry + NIC (mainland only) | parcel provider | ★★★★☆ (coverage varies) |
| **CRUS** | Classificação e Uso do Solo (territorial classification) | planning context | ★★★★★ |
| **COS** | Carta de Ocupação do Solo (land cover) | context / environmental | ★★★★★ |
| **Orthophotos** | 30 cm national | imagery base (== PNOA for ES) | ★★★★★ |

---

## Other findings

- **LNEG vs LNEC — do NOT conflate.** **LNEG** (Laboratório Nacional de Energia e Geologia — the
  energy + geology lab) exposes a modern **OGC API** ★★★★★ for geological mapping. It is **distinct**
  from **LNEC** (Laboratório Nacional de Engenharia Civil — civil-engineering lab, geotechnics).
  Both belong in `SOURCES.md §A.4`, but they are different bodies with different layers.

- **Building heights = the biggest unknown ★★★☆☆.** There is **no national building-height raster**
  (unlike Spain's CNIG MDS Edificación). Height is derivable as **nDSM = DSM − DTM** from DGT LiDAR
  (~90% continental). There is **no national floor-count attribute**, and DGT has published **no
  RMSE-Z**. Ranked height sources, best-first: (1) **DGT LiDAR → nDSM** [our shared module]; (2)
  **municipal LiDAR** (Lisbon CML 3D, licence TBV); (3) **Copernicus DEM ~30 m** [terrain fallback,
  NOT height]; (4) **derived DSM** (compute-heavy).

- **Copernicus DEM ★★★★★ — terrain fallback only.** ~30 m terrain covering the NW-mainland ~10% gap
  outside DGT LiDAR. **Terrain, not building height.** Listed to rank it below the true height
  sources, never as a height source.

- **Environmental layers ★★★★☆ — available but scattered.** REN / RAN / Natura 2000 / Protected /
  Flood exist, but across **APA / LNEG / CCDR** with **no single portal**. Usable, but each traces
  to a different authoritative provider.

- **Strategy.** "Litehaus = catalogue; trace every layer to its authoritative provider (DGT / APA /
  LNEG / Copernicus)." Depend on **stable public services**, not an aggregator. An aggregator is a
  convenience index; the source of record is always the owning authority.

---

## Reviewer's overall score

**9 / 10 infrastructure** — EXCLUDING envelope/zoning rules (≈ 0%) and building heights (the two
weak axes). The infrastructure (boundaries, parcels-where-covered, land classification, land cover,
imagery, terrain, geology) is strong and modern; the gaps are the **buildable-rule layer** (a
`RATE.md` concern, unchanged here) and the **building-height raster** (the nDSM-derivation gap).

The review **upgrades many prior `VERIFIED-LEAD` entries to `CONVERGENT-SECONDARY` pending probe**.
It therefore does **not** move Portugal above its current rate — a corroborating expert source is
not a wired, live-probed source (§CONTEXT-DATA-HONESTY). What it delivers is a **sharpened,
prioritised probe queue** (inventory §Probe steps / `../NEXT.md §9`) that, once PROBED + WIRED,
becomes the Phase-3 PLAN raising Portugal from its current rate.

---

## What this does NOT change

- **No RATE % cell moves.** `RATE.md`, `LEGISLATION-RATE.md`, `COUNTRY-RATE.md`, `LOD-RATE.md`
  percentages are untouched. This is data-availability corroboration, not a probed capability.
- **The #1 blocker stands.** Cadastral-regime confirmation for Lisboa/Porto/Braga (README §2.1,
  NEXT §3.1) is unchanged — the parcel OGC API being "reported live" is not the same as coverage
  being confirmed for a specific city core.
- **The height gap stands.** No national height raster; height remains an nDSM derivation with a
  single-source confidence ceiling and no published RMSE-Z.

---

## Cross-references

- `../PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md` — the [Layer | Authority | Access | API | Download |
  Licence | CRS | National | Production-ready | Confidence] table + §Probe steps.
- `../sources/SOURCES.md §A.2 / §A.4` — per-field citations (this review folded in).
- `PORTUGAL-MASTER-DATA-SOURCE-STUDY.md` — the legal + rule-mechanism study (companion).
- `../LOD-RATE.md` — the physical-model axis; "no national height raster; Copernicus DEM terrain
  fallback" note.
- `../NEXT.md §9` — the geospatial probe queue.

---

*Last updated: 2026-07-30. `CONVERGENT-SECONDARY` throughout (expert review, NOT live-probed).
Confirm by direct probe before any claim gates production or raises a RATE / LOD-RATE cell.
Maintainer: UNASSIGNED.*
