# Saudi Arabia — regions (mناطق → Amanas / municipalities)

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED

Saudi Arabia's residential building *rule* is held **at the national level** (the 2024 MOMRAH decision —
one document, kingdom-wide). Unlike Norway (357 kommuner each holding their own planregister) or Spain
(regional CCAA), Saudi zoning is **national footprint + municipal/authority vertical override**, with the
region (*منطقة*) sitting in the administrative hierarchy but **not** as its own zoning instrument. The
administrative hierarchy is:

```
Saudi Arabia (national — MOMRAH)  — the residential decision; binds all Amanas (§1)
  └── Region / منطقة (13 regions, ISO 3166-2 sa-XX)  — administrative, NOT a residential-zoning authority
        └── Amana / أمانة (municipality / secretariat)  — holds the approved plan (المخطط المعتمد);
              sets the EXACT floors/height/commercial-street setbacks per planning zone (§4.1)
        └── Development authority (هيئة تطوير)  — a VERTICAL override that PREVAILS on conflict (§1 cl. 3):
              RCRC, ROSHN, NEOM, Diriyah Gate, Qiddiya, Jeddah Development Authority, …
```

## How to route

**The national footprint formula applies everywhere** — route by *nothing* for setbacks + coverage; they
are `plot ⊖ max(streetWidth/5, {3,2,2})` capped by `coverage × plotArea`, identical in every Amana of the
Kingdom (Section 4 binds all Amanas). Route only the **exact height / floors**:

1. Determine the **Amana** the parcel falls in → its `المخطط المعتمد` (approved plan) sets the exact
   permitted floors + max height for that planning zone (§4.1 cl. 1). This value is geo-fenced (Balady
   `MapServer/28` `NOOFFLOORS`) or in a municipal document.
2. Determine whether the parcel sits inside a **development-authority zone** (RCRC/ROSHN/NEOM/…) → that
   authority's regulations **prevail on conflict** (§1 cl. 3) and can set a different height/FAR/floors.
3. Absent a reachable per-zone value, return the **national CEILING as a bounded cited refusal** (villa
   ≤ 14 m §5-1-5 cl. 3; apartment ≤ 23 m §3-2) — never a fabricated exact value.

The region layer (`sa-XX`) carries **no residential-zoning instrument of its own** — it exists in this tree
only as the ISO 3166-2 path segment carrying the demo municipality, exactly as `sa-01/` carries Riyadh. A
region folder gets its own pack only if Saudi ever introduces a region-level development framework
(TRIP-WIRE in each region's `NEXT.md`).

## Key difference from Norway

Norway routes to 357 kommuner, each holding its own plan on **one shared SOSI Plan schema** — the reader is
the same, only the endpoint URL changes. **Saudi routes to nothing for the footprint** (it is one national
formula), and to the Amana / development authority only for the *exact* vertical value — which is geo-fenced
rather than schema-fragmented. Norway's problem is "which kommune published a live WFS"; Saudi's problem is
"can the exact vertical value be reached from outside SA" (geo-fence), with the footprint needing no routing
at all.

## The 13 regions (ISO 3166-2 `sa-XX`)

ISO 3166-2:SA enumerates 13 regions. **Note the SA-13 gap:** the codes run SA-01..SA-14 with **SA-13
unassigned** (13 regions, highest code 14 — Al-Jawf is SA-12, Najran SA-11, etc.; there is no SA-13). Codes
below are the standard assignment; **cities studied are marked**.

| ISO 3166-2 | Region (EN) | Region (AR) | Capital / principal city | Folder / pack |
|---|---|---|---|---|
| **sa-01** | Riyadh | منطقة الرياض | **Riyadh (RUH)** ⭐ | `sa-01/ruh-riyadh/` (demo pack authored) |
| **sa-02** | Makkah | منطقة مكة المكرمة | **Jeddah (JED)** ⭐ · Makkah · Taif | `sa-02/jed-jeddah/` (scaffold) |
| sa-03 | Madinah | منطقة المدينة المنورة | Medina | — |
| **sa-04** | Eastern Province | المنطقة الشرقية | **Dammam (DMM)** ⭐ · Al-Khobar · Dhahran | `sa-04/dmm-dammam/` (scaffold) |
| sa-05 | Al-Qassim | منطقة القصيم | Buraidah | — |
| sa-06 | Ha'il | منطقة حائل | Ha'il | — |
| sa-07 | Tabuk | منطقة تبوك | Tabuk (NEOM authority zone) | — |
| sa-08 | Northern Borders | منطقة الحدود الشمالية | Arar | — |
| sa-09 | Jazan | منطقة جازان | Jazan | — |
| sa-10 | Najran | منطقة نجران | Najran | — |
| sa-11 | Al-Bahah | منطقة الباحة | Al-Bahah | — |
| sa-12 | Al-Jawf | منطقة الجوف | Sakakah | — |
| sa-14 | Asir | منطقة عسير | Abha | — |

*(ISO 3166-2:SA has no `sa-13` — the 13-region set uses codes 01–12 and 14.)*

## National layers (common to all — no regional routing needed)

| Layer | Source | Routing |
|---|---|---|
| Footprint rule (setbacks + coverage) | 2024 MOMRAH decision | **National — no routing; one formula, all Amanas** |
| Classification taxonomy | 2024 MOMRAH decision §3-1..§3-4 | National taxonomy; per-parcel assignment geo-fenced (demo = user-picked) |
| National vertical ceiling | §5-1-5 cl. 3 / §3-1 / §3-2 | National — villa 14 m / apt 23 m, applied as a bounded refusal |
| Exact height / floors | Amana approved plan / dev-authority zone | **Routed to the Amana / authority — geo-fenced** |
| Parcel geometry + resolved rules | Balady `MapServer/28` | Single national backend — **geo-fenced** |
| Terrain (context) | Copernicus DEM GLO-30 (global fallback) | Single global product — tile by bbox |
| Building footprints (context) | Microsoft/Google ML footprints (global fallback) | Single global product — tile by bbox |

**Related:** [`../README.md`](../README.md) (country umbrella) · [`../NEXT.md`](../NEXT.md) ·
[`../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) ·
[`../sa-01/README.md`](../sa-01/README.md) · [`../sa-02/README.md`](../sa-02/README.md) ·
[`../sa-04/README.md`](../sa-04/README.md).
