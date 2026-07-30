# Legislation Data-Readiness Rate — Genève (`ch`) city (BFS 6621)

**Headline rate: ~20–25% (inherits the CH national building-rule floor — zone-ID structured, FAR/height model+PDF-bound)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (**zone/use code + a density metric [Ausnützungsziffer / indice
> d'utilisation du sol] + height**) **without reading an ordinance text/PDF**. IDENTICAL across every
> jurisdiction. Derived from the national CH probes (`../../findings/SWITZERLAND-DATA-RECON-SPIKE.md`), NOT assumed.

<!-- Per-axis DETAIL rate that FEEDS the LEGISLATION axis of the composite RATE.md. See NAMING-CONVENTION.md. -->

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Barcelona | ~48% |
| Switzerland (national, building-rule) | ~20–25% |
| **Genève (city — inherits national floor)** | **~20–25%** |
| France (national) | ~22% |

**Why Genève sits at the national floor (below Zürich's ~25–35 %):** unlike the City of Zürich, no
Genève-specific FAR/height catalogue has been transcribed. Canton GE IS well-provisioned for zone IDENTITY
(it is `full` in the geodienste `ms:grundnutzung` WFS; its ÖREB delivery is the French-Swiss **RDPPF** cadastre
`ge.ch/terecadastrews/RdppfSVC.svc`, VERIFIED-LIVE) — but the indice d'utilisation / gabarit is delivered as
PDF-bound ordinance (canton GE LCI / plans localisés de quartier), not a structured field, and none is
transcribed or signed. So Genève holds the national zone-ID win but not the density/height numeric fill.

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ | swisstopo AV (GE live-verified 2026-07-26); cantonal SITG | high |
| Plan/zone existence + boundary | ✅ | geodienste `ms:grundnutzung` (canton GE `full`); ÖREB/RDPPF GE | high |
| Zone/use code | ✅ | `typ_kommunal/kantonal_code` + `hauptnutzung` | high |
| Density metric (indice d'utilisation) | ❌ | not a WFS attribute; optional INTERLIS `Typ.Nutzungsziffer` slot, unharvested for GE; PDF-bound | text-PDF |
| Max height (gabarit) | ❌ | not modelled; canton GE LCI / PLQ ordinance PDF | text-PDF |
| Setback / alignment | ❌ | LCI ordinance PDF | text-PDF |
| Building footprint + height (LOD1/2) | ✅ capable | swissBUILDINGS3D + swissSURFACE3D nDSM (measured-capable) | high |
| Terrain (DTM/DSM) | ✅ | swissALTI3D | high |
| Heritage overlay | ⚠️ | swisstopo federal WMS live; GE cantonal heritage WFS not probed | partial |

## The structural gap

Genève is the national **Outcome B** at the city level: zone code is data, the density/height is not. The lever
is the same as everywhere in CH — either the per-canton INTERLIS `Typ.Nutzungsziffer` harvest (if canton GE
populates the optional slot), or a human-verified transcription of the canton GE LCI/PLQ gabarit values +
`../../sources/VERIFICATION.md` sign-off. Neither is done. RDPPF being a SOAP/WCF service (not REST) is a minor
adapter cost, not a data gap.

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Per-canton INTERLIS `Typ`-catalogue harvest for GE (if the optional `Nutzungsziffer` slot is populated) | FAR from text → structured DATA where populated | Medium |
| Transcribe canton GE LCI/PLQ gabarit + indice, human-verify, sign VERIFICATION.md | Height/FAR from PDF → `estimated-ruleset` (the Zürich play) | High |
| Probe the GE RDPPF `extract` for a real parcel (SOAP client) | Confirms whether the extract carries any numeric AZ/height | Low |

---
*Last updated: 2026-07-30. CONFIRMED live (national/cantonal): geodienste GE `full`; ÖREB GE RDPPF endpoint.
No GE numeric building-rule value transcribed or signed. Maintainer: UNASSIGNED.*
