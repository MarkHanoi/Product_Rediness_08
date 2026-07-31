# Murcia (30030) — the complete pipeline: what is achievable, and what is not

> **Status: PLAN, grounded in measurements taken 2026-07-31.** Every number carries its source.
> Two agents are producing the live recon in parallel — [`MURCIA-DATA-RECON.md`](./MURCIA-DATA-RECON.md)
> (parcel · planning · envelope) and [`MURCIA-TERRAIN-AND-HEIGHTS.md`](./MURCIA-TERRAIN-AND-HEIGHTS.md)
> (terrain · LOD). This file is the target they are working toward, and the honest ceiling.
>
> Benchmark: [`BENCHMARK-litehaus-report-3481104XH6038S-2026-07-30.md`](./BENCHMARK-litehaus-report-3481104XH6038S-2026-07-30.md)

**Target parcel:** `3481104XH6038S` · 38.006100, −1.138028 · **935 m²** (Catastro) · Suelo urbano
consolidado · PGOU Murcia 2001

---

## §1 — The answer to "can we get real LOD buildings and envelope?"

**LOD buildings: yes, and better than the benchmark — today.**
**Envelope: yes in shape, but its quality is gated by one thing, and it is not engineering.**

| Layer | Achievable | Confidence | Gated by |
|---|---|---|---|
| **Parcel geometry** | ✅ official Catastro boundary from the refcat | **high** | nothing — national, keyless, `isInSpain` already registered |
| **Building footprints** | ✅ Catastro `BU` / `BuildingPart` | **high** | nothing |
| **Floor counts (LOD1)** | ✅ `ALTURAS`, above **and** below ground | **high** — but *declared, not measured* | nothing |
| **Building heights in metres** | 🟡 from nDSM, not from floors | **medium** | whether PNOA covers Murcia at usable resolution |
| **Terrain** | 🟡 MDT05 if published for Murcia | **medium** | resolution — see §3 |
| **Land classification** | ✅ SIU (national, ArcGIS REST) | **medium** | nothing |
| **Flood constraint** | ✅ SNCZI T100/T500 (INSPIRE) | **medium** | service is slow/intermittent |
| **Zoning / calificación** | ❓ unknown | — | whether Murcia publishes a planning geoportal |
| **Numeric envelope rules** | ❓ unknown | — | **PGOU Murcia 2001 must be read. This is the whole cost.** |

---

## §2 — LOD buildings: what "real" means, measured

**Do not convert floors to metres by multiplying.** That estimator was measured against surveyed
ground truth for the first time today (Phase-3 V3-gate, Barcelona, `PHASE-3-DECIDING-PROBES.md`):

| `levels × 3.2 m` vs surveyed truth | Value |
|---|---|
| median absolute error | **3.20 m** |
| **p95 absolute error** | **21.80 m** |
| RMSE | 9.31 m |
| within ±3 m | only **49.6%** |
| signed mean | **−3.13 m** — we systematically **under**-estimate |

⇒ A "≈" prefix in the UI is currently carrying **±22 m at the p95**. For a 936 m² urban plot that is
not a height; it is a placeholder wearing one.

**The better route, and it may already be pre-computed.** The V2 licence probe found that IGN
publishes **`MDSnEdificación2,5`** — a **normalised** (already DSM−DTM) building-surface model, under
the **same CC BY 4.0** licence, with derived commercial works explicitly permitted. If it covers
Murcia usably, the height pipeline collapses from *acquire → difference → zonal stats* to
*acquire → zonal stats*. **Unprobed — this is the single highest-value measurement for Murcia LOD**,
and it is on the terrain agent's list.

**Honest LOD ladder for this parcel:**

| Level | What it is | Status |
|---|---|---|
| **LOD0** | parcel polygon, official | ✅ achievable now |
| **LOD1** | extruded footprints, floor counts **declared by Catastro** | ✅ achievable now |
| **LOD1.5** | footprints extruded to **measured** height from nDSM | 🟡 pending the MDSn probe |
| **LOD2** | roof form | ❌ needs LiDAR point cloud + roof fitting — out of scope for the next deployment |

**Label the provenance in the UI, not just in the data.** Catastro's own documentation states
`ALTURAS` is an **administrative declaration**, not a survey. A declared floor count and a measured
nDSM height must never render identically.

---

## §3 — Terrain: the resolution trap, already paid for once

Phase-3 **V8** measured Barcelona's terrain and found it **cannot resolve a 20 m street**:

- what we *serve*: median vertex spacing **57.34 m**, median TIN edge **76.44 m** — a 1,000 × 20 m
  Eixample corridor contains **zero** terrain vertices
- what we *fetch*: PNOA `Elevacion4258_25` at **18.87 × 25.00 m** native
- Nyquist for a 20 m street: **≤10 m**. Fails at both levels.

⇒ **Do not repeat this in Murcia.** Establish the posting spacing **first**, and state what it can
resolve **before** reporting any slope or datum figure. The competitor's **2.6% slope from EU-DEM
25 m** across a ~30 m-wide plot is one to two samples — it is not a measurement of this plot, and we
must not produce its equivalent.

**The fix in Barcelona was two config values**, not an acquisition programme: `Elevacion4258_5`
(**3.76 × 5.03 m**, meets Nyquist) on the *same keyless endpoint*, plus `maxzoom 13`. Check whether
the equivalent exists for Murcia.

⚠ **And distrust the registry:** `terrain.mjs` `TERRAIN_SOURCES.es` declares `resolutionM: 5.0` while
`DTM_FETCH.es` actually requests **MDT25**. Anyone reasoning from the registry would conclude we
already met Nyquist. **Measure the bytes, not the config.**

---

## §4 — The envelope: shape is free, quality is not

**The engine already exists.** `ZoningRulesEngine`, `explicit-area`, `block-derived-alignment`,
setback and alignment solvers are all built and serve Barcelona, Denmark and Zürich. Murcia needs
**no new solver** — it needs a **rule pack**, and a rule pack is *cited legal values*.

**That is the whole cost, and it is human-gated.** From
`GEOGRAPHIC-ROLLOUT-MASTER-TRACKER.md` §2.0.6, measured on Barcelona:

> The gap between 23.8% and 65% is **one thing: rule packs.** At **+30.9 points it is worth 3.7× the
> largest engineering item** — and it **cannot be accelerated by hiring engineers**, because its cost
> is human-gated legal **sourcing**.

Barcelona sits at **20.9% end-to-end** against a **~88% definitive ceiling** (which includes correct
refusals — 24.2% of private land is in zones where the ordinance **grants no private envelope**).

**But Madrid showed the extraction itself is fast when the document cooperates.** In one agent run
today, Madrid's Compendio 2025 (626 pp, born-digital) yielded **282 cited records** across seven
Normas Zonales — each with article, apartado, PDF page and the verbatim Spanish sentence. Zero
fabricated values, 62 explicit nulls with reasons, one conflict correctly left unresolved.

⇒ **The decisive question for Murcia's envelope is: is PGOU Murcia 2001 a born-digital text PDF?**

| If | Then |
|---|---|
| born-digital text | extraction is an agent run, as Madrid was. Envelope in days. |
| scanned | OCR first — Berlin measured **36.8%** of its Begründungen as scans, and OCR remains unbuilt |
| values are graphical only | the rule is `graphical` — a **typed refusal**, not a gap |

---

## §5 — Where this beats the benchmark, and where it does not

The Litehaus report on this exact parcel self-scores **12/100 evidence completeness**.

**We win, cheaply:**

| Axis | Them | Us |
|---|---|---|
| Parcel identity | *"Correspondencia catastral no ejecutada"*, **−5**; anchored on a listing **pin**; *"puede reflejar la parcela incorrecta"* | resolve by **refcat** → official geometry |
| Building heights | **absent entirely** | Catastro footprints + `ALTURAS`, provenance-labelled |
| Terrain | EU-DEM **25 m** | PNOA MDT05 if published — ~5× finer |
| Buildability | 262 m², *"proxy PGOU — verificar ficha"* | a **cited article**, or a **cited refusal** |

**We do not win, and must not pretend to:** market price, AVM, days-on-market, ROI, and the
**Nota Simple** (no free API, ~€9/finca). Inventing any of it would be **L-616 with a euro sign** —
the defect where a massing ignored the FAR ceiling by ~5× and drew an unknown setback as zero.

⇒ **The defensible product is fewer axes, each cited and verified, with the gaps named** — not a
higher composite score built on absent evidence.

**One defect of theirs to design against:** their pro-forma applies the **Portuguese** tax model to a
Spanish property and shipped, voided by an in-place disclaimer. **Route from the data, never from a
caller-supplied jurisdiction.**

---

## §6 — Two of their claims that would change the envelope, so verify before inheriting

1. **SNCZI T=100 flood zone** — *"edificación muy condicionada e informe de la Confederación
   Hidrográfica requerido."* If true this is a **hard envelope constraint**, not a scoring penalty.
   They also record the MITECO DPH WMS as **down** (`NullReferenceException`), so their own deslinde
   claim is unverified.
2. **−25 bearing capacity** — explicitly **their heuristic** over IGME GEODE, *not* an IGME datum.

---

## §7 — What ships, in order

**Deployment 1 — the honest parcel.** Refcat → official geometry + area · Catastro buildings with
floor counts, provenance-labelled · terrain at a stated, resolvable posting · land class from SIU ·
flood flag from SNCZI · **envelope: cited value or cited refusal.**

*A cited refusal is the shippable feature.* It is the thing the benchmark structurally cannot produce,
and Barcelona already ships refusals for clau 18.

**Deployment 2 — measured heights.** nDSM from `MDSnEdificación2,5` if it covers Murcia, replacing
declared floors with measured metres and retiring the ±22 m p95.

**Deployment 3 — the rule pack.** PGOU Murcia 2001 extraction → cited records → `esMurcia` pack →
computed envelope. Gated on §4's document question.

**Never:** a fabricated envelope to improve a demo. Every number ships with its article, or it ships
as a refusal with a reason.
