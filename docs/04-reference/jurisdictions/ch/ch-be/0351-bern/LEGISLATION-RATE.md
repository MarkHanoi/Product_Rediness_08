# Legislation Data-Readiness Rate — Bern (`ch`) city (BFS 0351)

**Headline rate: ~15–22% (below the CH national floor — canton BE is the geodienste `incomplete` cohort)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (**zone/use code + a density metric [Ausnützungsziffer / Baumassenziffer]
> + height**) **without reading an ordinance text/PDF**. IDENTICAL across every jurisdiction. Derived from the
> national CH probes (`../../findings/SWITZERLAND-DATA-RECON-SPIKE.md`), NOT assumed.

<!-- Per-axis DETAIL rate that FEEDS the LEGISLATION axis of the composite RATE.md. See NAMING-CONVENTION.md. -->

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Barcelona | ~48% |
| Zürich (city, BZO catalogue) | ~25–35% |
| Switzerland (national, building-rule) | ~20–25% |
| France (national) | ~22% |
| **Bern (city — BE `incomplete` in the national WFS)** | **~15–22%** |

**Why Bern sits slightly BELOW the CH national floor:** canton BE is one of the four cantons (BE, GR, SO, VS)
flagged **`incomplete`** in the geodienste `ms:grundnutzung` national WFS — so the strongest national win
(structured zone identity delivered nationwide) is only PARTIAL for Bern; the zone-ID leans on the ÖREB BE
endpoint instead. As with every non-Zürich CH city, no Bern FAR/height catalogue is transcribed. The zone
identity is (partially) data; the density/height is model+PDF-bound (canton BE Baugesetz + the City of Bern
Bauordnung / Baureglement).

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ | swisstopo AV (all-canton, federal identify) | high |
| Plan/zone existence + boundary | ⚠️ partial | geodienste `ms:grundnutzung` **BE `incomplete`**; ÖREB BE endpoint | partial |
| Zone/use code | ⚠️ partial | ÖREB BE `TypeCode` (structured where the extract lands); national WFS partial for BE | partial |
| Density metric (Ausnützungsziffer) | ❌ | not a WFS attribute; optional INTERLIS `Typ.Nutzungsziffer` slot, unharvested for BE; PDF-bound | text-PDF |
| Max height (Gebäudehöhe) | ❌ | not modelled; canton BE BauG / City Bauordnung PDF | text-PDF |
| Setback / alignment (Grenzabstand) | ❌ | ordinance PDF | text-PDF |
| Building footprint + height (LOD1/2) | ✅ capable | swissBUILDINGS3D + swissSURFACE3D nDSM (measured-capable) | high |
| Terrain (DTM/DSM) | ✅ | swissALTI3D | high |
| Heritage overlay | ⚠️ | swisstopo federal WMS live; BE cantonal heritage WFS not probed | partial |

## The structural gap

Bern is the national **Outcome B** with an extra handicap: the geodienste WFS coverage is `incomplete` for
canton BE, so even the zone-ID lean is on the ÖREB BE cadastre rather than the national WFS. The levers are the
same as everywhere in CH — a per-canton INTERLIS `Typ`-catalogue harvest (if BE populates the optional
`Nutzungsziffer` slot) or a human-verified transcription of the City of Bern Bauordnung + BE BauG values +
`../../sources/VERIFICATION.md` sign-off. Neither is done.

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm the ÖREB BE endpoint + probe one `extract` for a Bern parcel | Firms the zone-ID from `partial` toward `full` for BE | Low |
| Per-canton INTERLIS `Typ`-catalogue harvest for BE (if slot populated) | FAR from text → structured DATA where populated | Medium |
| Transcribe City of Bern Bauordnung + BE BauG height/AZ, human-verify, sign | Height/FAR → `estimated-ruleset` (the Zürich play) | High |

---
*Last updated: 2026-07-30. CONFIRMED: canton BE is `incomplete` in the geodienste WFS cohort (national recon).
No BE numeric building-rule value transcribed or signed. Maintainer: UNASSIGNED.*
