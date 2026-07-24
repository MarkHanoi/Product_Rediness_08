# Rate Implementation Plan — Switzerland (`ch`) national

**Current rate:** ~85% context-data / **~20–25% building-rule (MEASURED)** (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling:** context ~90–95% (proven) · legal ~30–40% with a per-canton FAR harvest + Baureglement pipeline (Outcome B) ·
**Gap to Denmark (~96%):** the numeric layer — Denmark ships FAR+height as data, Switzerland ships only zone-ID as data ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> ✅ **THE DECIDING PROBE IS DONE (2026-07-24). VERDICT: Outcome B.** Full transcript:
> [`findings/SWITZERLAND-DATA-RECON-SPIKE.md`](./findings/SWITZERLAND-DATA-RECON-SPIKE.md). Evidence
> table: [Appendix A](#appendix-a--live-probe-evidence-2026-07-24) below.

---

## 1 — The ceiling: what "maximum" means here

Switzerland's context-data layer is already near the ceiling (~85%), with open items in GWR schema
transcription and a few minor topic nuances (tree authority, pedestrian sub-classification, CityGML
version). Those can be resolved with three low-effort reads and will push the context layer to ~90–95%.

The legal/zoning layer ceiling **is now established.** The deciding probe (§Phase 0b, done) resolved it
to **Outcome B**: Switzerland has a **federal data model** for the ÖREB/RDPPF cadastre (V-ÖREB) and a
national Nutzungsplanung WFS (MGDM 73.1) — but the structured national delivery carries the **zone
identification only**, not the numbers.

- ~~**Outcome A — ÖREB/WFS returns structured numbers**~~ **← CLOSED by the probe.** The national
  geodienste WFS `ms:grundnutzung` (DescribeFeatureType + GetFeature) returns zone-ID + `dokument`
  only — no `nutzungsziffer`, no height. The overlay layer is identical. So the "~85–96%, single reader
  for 26 cantons" path does **not** open.

- **Outcome B — numbers are model/PDF-bound ← THIS IS THE VERDICT.** Full 3-field structured fill
  (zone + density + height, no PDF) = **~20–25%**, France-class. The ceiling is **higher than France's**
  for FAR only: the federal INTERLIS model has a typed, optional `Typ.Nutzungsziffer : 0.00 .. 9.00`
  slot — so FAR is recoverable as **data** via a per-canton `Typ`-catalogue harvest (not OCR). Max
  height and setback are not modelled at all → cantonal Baureglement PDF → the ordinance-extraction
  pipeline + L-449, exactly like France for height. Realistic legal-layer ceiling **~30–40%**.

The ceiling is now established. Phases below are re-pointed onto the Outcome-B path.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0 — Context closeout** | Read GWR Merkmalskatalog; confirm CityGML version; check 3.0 Beta canton list; Areale Freizeit sub-types; pedestrian sub-classification | GWR EGID join pipeline can be specced; CityGML ingestion pipeline version locked | ~85% → ~90–92% | Very low — 3 document reads + 1 tile download | NOT STARTED | UNASSIGNED |
| **0b — DECIDING probe** | geodienste WFS `ms:grundnutzung` DescribeFeatureType + GetFeature; overlay layer; INTERLIS `.ili` model | Establishes ceiling model | NOT ASSESSED → **Outcome B measured** | — | ✅ **DONE 2026-07-24** | agent |
| **1 — Zone-ID structured provider (optional, honest)** | A `ChZoningProvider` returning zone code/label/main-use from the geodienste WFS as `structured`; FAR/height `null` → estimated-ruleset; gated behind an L-449 cert flag (default OFF), Madrid/Córdoba shape | First Swiss coverage that renders zone identity honestly, numbers refused | zone-ID only | Low–Medium | NOT STARTED (not authorised by the probe alone — founder call) | UNASSIGNED |
| **2 — Per-canton FAR harvest** | Ingest each canton's populated `Typ` catalogue (INTERLIS/ili2pg) → structured `Nutzungsziffer` as DATA; L-449 sign-off per canton | FAR becomes structured where a canton populates the optional slot — Switzerland's ceiling edge over France | +FAR (canton-dependent) | Medium (per-canton ingest) | NOT STARTED | UNASSIGNED |
| **3 — Baureglement extraction pipeline (height + setback)** | Point `@pryzm/ordinance-extraction` at cantonal Bau- und Zonenordnung PDFs; one-parser-per-article; L-449 gate | Height + setback (not modelled anywhere) become amber, France-style | +height/setback (projected) | High (per-plan-authority) | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Switzerland's gap to Denmark on the **context layer** is:
- swissBUILDINGS3D CityGML version not confirmed (1 point)
- GWR Merkmalskatalog not fully transcribed (1–2 points)
- Tree data authority nuance (municipal override pattern, cities unconfirmed) (1–2 points)
- Pedestrian sub-classification granularity (1 point)

**Total context gap: ~4–11 pts — closeable in Phase 0 with 3 document reads.**

Switzerland's gap to Denmark on the **legal layer** is now RESOLVED to **Outcome B**:
- The gap mirrors France for **height/setback** — the number lives in cantonal Baureglement text and
  requires the extraction pipeline + L-449. Not modelled anywhere in the federal data model.
- The gap is **narrower than France for FAR** — the federal INTERLIS model has a typed, optional
  `Typ.Nutzungsziffer` slot, so FAR is recoverable as DATA via a per-canton catalogue harvest (not OCR)
  where a canton populates it. This is Switzerland's one structural edge over France.

**The ceiling question WAS answerable — and has now been answered — with WFS + model reads (§Phase 0b).**

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Phase 0b is DONE (Outcome B).** The legal-layer path is now the FAR-harvest + Baureglement-pipeline
  route, not a single-reader V-ÖREB numeric route.
- **L-449 human-verification gate** applies to any legal numeric value before a pack ships
  `confidence: 'structured'`. No Swiss numeric value is signed off yet (see `sources/VERIFICATION.md`).
- **Zone-ID reader is the reusable win:** a `ChZoningProvider` reading the geodienste WFS
  `ms:grundnutzung` is directly reusable for all 19+ participating cantons via the ONE national
  endpoint — but it delivers zone *identity*, not the numbers. Numbers require per-canton work.
- ⚠ **DO NOT scaffold a numeric provider on the strength of the probe.** The probe DISPROVED structured
  numbers via the national delivery. A zone-ID-only provider (numbers null, L-449-gated) is a founder
  call, not an automatic build.
- **swissSURFACE3D COPC reader:** if built for Switzerland (or any COPC-compatible jurisdiction),
  reusable for future COPC-format LiDAR sources.
- **GWR EGID join pattern:** once proven, reusable for every Swiss project bbox regardless of canton —
  GWR is a single federal register with one API.
- **C58 fidelity/provenance standard** applies to all SOURCES.md rows.
- **ADR-0270** (setback vs. alignment): Switzerland's Nutzungsplanung typically governs via
  **Ausnützungsziffer (GFZ/GRZ) + max height** (density-and-height model), not alignment. Confirm per
  canton before assuming any alignment-governed logic.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate).*

---

## Appendix A — Live-probe evidence (2026-07-24)

Mirrors the France `RATE-IMPLEMENTATION-PLAN.md` evidence discipline: every claim that moves the rate
carries a verbatim probe result. Origin: non-DACH (US-region) egress — **not** geo-blocked for
`geodienste.ch` or federal `*.admin.ch`. Full transcript: `findings/SWITZERLAND-DATA-RECON-SPIKE.md`.

| # | Endpoint / artifact | Request | Verbatim result | Bearing on the rate |
|---|---|---|---|---|
| 1 | `geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu` | `DescribeFeatureType&TYPENAMES=ms:grundnutzung` | 200 — 13 elements: `wkb_geometry, publiziertab, publiziertbis, rechtsstatus, bemerkungen, typ_kommunal_code, typ_kommunal_bezeichnung, typ_kantonal_code, typ_kantonal_bezeichnung, hauptnutzung_code, hauptnutzung_bezeichnung, kanton, dokument`. **No nutzungsziffer/geschosszahl/gebäudehöhe.** | ✅ DECIDING — FAR/height NOT a national WFS attribute |
| 2 | same | `GetFeature&TYPENAMES=ms:grundnutzung&COUNT=2` (GML) | 200 — AI: `typ_kommunal_code 1102`, `Wohnzone`, `hauptnutzung_code 11`, `bemerkungen W2`, `dokument` = Dokumente array all-null. | ✅ zone IDENTIFIED, numbers absent |
| 3 | same | `DescribeFeatureType` overlay `…flaechenbezogene_festlegungen` | 200 — schema identical to grundnutzung. **No height.** | ✅ disproves overlay-height hypothesis |
| 4 | `models.geo.admin.ch/ARE/Nutzungsplanung_V1_2.ili` | GET | 200 — `CLASS Typ … Nutzungsziffer : 0.00 .. 9.00; Nutzungsziffer_Art : TEXT*40;` (OPTIONAL) via `Typ_Geometrie` assoc. **No height/floor class anywhere.** | ✅ FAR = optional typed slot (ceiling > France); height unmodelled |
| 5 | `madd.bfs.admin.ch/eCH-0206?egid=1175237` | GET | 200 — `buildingCategory 1020, buildingClass 1110, dateOfConstruction 1987, surfaceAreaOfBuilding 87, numberOfFloors 3`, Poschiavo GR | ✅ GWR per-building context/verification |
| 6 | `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0` | GET + `/items` | 200 — EPSG 2056, tiled/fullcoverage; per-tile assets `.gdb.zip` (`application/x.filegdb+zip`) + `.dwg.zip`; CityGML 2.0 = separate curated download | ✅ 3D-context massing source confirmed |
| 7 | `api.geo.ag.ch/v2/oereb/capabilities/json/` | GET | 200 — topics `ch.Nutzungsplanung`, `ch.ProjektierungszonenNationalstrassen`, `ch.Baulinien…` | ✅ ÖREB live; extract op path not landed (not decision-relevant) |

**Reading:** rows 1–4 are the deciding evidence. Structured national delivery = zone-ID only (rows 1–2);
the FAR is a typed-but-optional model slot the national WFS does not surface (rows 1, 4); height is not
modelled at all (rows 1, 3, 4). ⇒ **Outcome B, ~20–25% comparable rate.**
