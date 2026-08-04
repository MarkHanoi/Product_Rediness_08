# Córdoba (INE 14021) — Complete Coverage Roadmap (founder brief)

**Status: NOT IMPLEMENTED — queued roadmap, not yet started**

Source: founder-supplied implementation brief, captured and organized into house documentation
format on 2026-08-04. This document reproduces and structures the founder's pasted brief verbatim;
it is **not** a new research pass and adds no new facts. Córdoba already has a substantial, mature
findings corpus in this same `findings/` directory — `CORDOBA-ORDINANCE-REGISTRY.md`,
`CAPABILITY-AUDIT-2026-08-04.md`, `FORENSIC-BLOCKER-AUDIT-2026-08-03.md`,
`CALIFICACION-ENDPOINT-PROBE.md`, `CORDOBA-DATA-RECON-SPIKE.md`,
`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`, `OCR-EXTRACTION-RESULTS.md`,
`LAYER2-GEOMETRY-RECOVERY-2026-08-02.md`, `ORDENANZA-PACK-SPEC.md` — and this doc does **not**
overwrite, edit, or supersede any of it. Where the founder's brief states a "current state" that the
existing corpus already contradicts or refines, this doc flags the discrepancy explicitly (§3)
rather than silently resolving it in either direction.

`CORDOBA_ENVELOPE_VERIFIED` is currently `TRUE` in code, with a live `siteDispatch.ts` compute path,
COACo GeoServer integration (`coaco:ordenanzas` / `coaco:actuaciones` / `coaco:vcatastro_urbanismo`),
pilot ordinances OA/PAS/UAD/CTP, a PEPCH heritage catalogue, and REDIAM flood/environment layers —
Córdoba is the most mature PRYZM jurisdiction. This roadmap is a **queued plan for extending that
existing capability toward maximum coverage**, not a description of new work performed and not an
authorization to change any code, gate, or existing findings doc.

---

## 1. Founder's brief — project framing (as given)

**PROJECT:** PRYZM Córdoba INE 14021 — Complete Legally Defensible Envelope Coverage

**ROLE (as given to the implementer):** "You are the lead GIS + urban planning data engineer
responsible for moving Córdoba from partial capability to maximum legally defensible envelope
coverage."

**OBJECTIVE (as given):** "Finish Córdoba before expanding elsewhere. The goal is NOT to search
endlessly for hidden APIs. The goal is to construct the maximum possible signed buildable-envelope
capability from official sources."

**MISSION (as given):** "Build a Córdoba reconstruction pipeline. Do NOT fabricate missing data.
Every generated geometry or rule must have: source document, URL/source identifier, extraction
method, confidence level, validation status."

**TARGET ARCHITECTURE (as given):**

```
Official documents → Document ingestion → OCR + extraction → Human verification →
Vector reconstruction → Rule mapping → Envelope computation → Signed output
```

---

## 2. Founder's stated current state (as given — see §3 for corpus cross-check)

**"Known working" (founder's list, verbatim):**
- Envelope engine works.
- `siteDispatch` compute path works.
- `CORDOBA_ENVELOPE_VERIFIED` gate exists.
- COACo GeoServer provides real calificación vectors (`coaco:ordenanzas`, `coaco:actuaciones`,
  `coaco:vcatastro_urbanismo`).
- Pilot ordinances: OA, PAS, UAD, CTP.
- Catastro parcel integration works.
- Block geometry exists (`idecordoba:manzana`).
- Heritage catalogue exists (PEPCH GeoJSON).
- Flood/environment layers exist (REDIAM).
- SIU classification exists.

**"Known blockers" (founder's list, verbatim):**
1. Full municipality calificación geometry is missing as vector.
2. PGOU rules exist mostly as PDFs/scans.
3. MC street-width height rules lack official alignment geometry.
4. PEPCH rules are not encoded.
5. Derived plans need refusal handling.

---

## 3. Cross-check against the existing findings corpus (discrepancies flagged, not resolved)

The instruction for this document is to flag discrepancies rather than silently correct the
founder's list. The following notes compare the brief's "current state" against
`CAPABILITY-AUDIT-2026-08-04.md` and `CORDOBA-ORDINANCE-REGISTRY.md`, both already in this
directory:

- **Scale of "working."** The founder's "known working" list reads as if Córdoba broadly computes
  envelopes. `CAPABILITY-AUDIT-2026-08-04.md` measures the *actual* computable slice as 4 of 13
  packed subzones (OA-1, CTP-1, UAD-1, PAS-2) inside a 4.96 km² two-district pilot — on the order of
  **≈0.9% full / ≈1.7% "any envelope"** of Córdoba's `SUELO URBANO` city-wide. The brief does not
  state this ceiling anywhere. **Flagged, not resolved** — the roadmap below should be read against
  the ≈1.7% baseline, not an implied larger one.
- **Blocker 2 ("PGOU rules exist mostly as PDFs/scans") is partially superseded.**
  `CORDOBA-ORDINANCE-REGISTRY.md` (dated 2026-07-24, already in this directory) found and
  cross-checked a **born-digital** text-layer PDF for the consolidated PGOU-2001 normativa (Tomo
  II, COACo-hosted), and confirmed zero OCR/digit errors across ~58 scalars in the 13 packed
  subzones — i.e. for the *already-packed* ordinance families, the source is not a scan requiring
  OCR. The scan/OCR framing in blocker 2 still applies to families outside the packed set (e.g. the
  PEPCH Normas Urbanísticas, per blocker 5) and to the missing city-wide calificación geometry, but
  as a blanket statement about "PGOU rules" it is **flagged as partially superseded** by the
  existing corpus, not corrected here.
- **Blocker 5 ("derived plans need refusal handling") appears already closed, not a remaining
  blocker.** `CAPABILITY-AUDIT-2026-08-04.md` states the delegation branch (~43–45% of pilot
  ordinance land, `coaco:actuaciones` layer) is "correctly answered today with a cited refusal" and
  characterizes it as terminal/legal, not an open engineering gap. **Flagged, not resolved** — the
  brief's Phase 5 (branch B: delegated planning → refusal) may already be implemented; this roadmap
  does not verify or change that.
- **Phase 2's re-search instruction may conflict with an existing "do not re-search" flag.**
  `CAPABILITY-AUDIT-2026-08-04.md` explicitly cites `MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`
  as an "exhaustive, reproducible six-probe search" for city-wide calificación geometry, concluding
  none exists, and states "do not re-search without new information" (repeated in that audit's
  Recommendation section: "Do not invest further engineering in trying to manufacture city-wide
  coverage — the search... has already been run to exhaustion"). The founder's Phase 2 instructs a
  fresh investigation of "GMU Córdoba, PGOU-2001 documentation, urban planning archives... planos de
  ordenación completa... series O.*... escala 1:2000... escala 1:5000." **Flagged as a direct
  tension, not resolved** — whoever picks up Sprint work on this roadmap needs to decide whether
  Phase 2 is asking to re-run an already-exhausted search, or whether it is scoped to genuinely new
  information/sources not covered by the 2026-08-02 sweep. This doc does not adjudicate that.
- **Phase 3's raster-sheet vectorization assumes recoverable sheets; the existing audit found most
  are dead.** `CAPABILITY-AUDIT-2026-08-04.md` states the municipal raster index is "41 of 49 dead
  on re-fetch" (only 8/49 urban CUS sheets live). Phase 3 of the brief ("Pipeline PDF/image →
  georeference → OCR legend → polygon extraction") presumes a supply of official plan sheets to
  vectorize; the existing corpus suggests that supply is mostly unavailable through the channel
  already searched. **Flagged, not resolved.**
- **MC street-width alignment layer — an approach was already tried and rejected.**
  `CAPABILITY-AUDIT-2026-08-04.md` blocker 2 notes PRYZM already tested a street-polygon proxy for
  the missing alignment layer and rejected it under ADR-0287 ("band-edge sensitivity too high —
  45.4% of streets sit within ±1 m of a 2 m-wide height band edge"). The brief's blocker 3 states
  the problem correctly but does not mention this prior attempt or its rejection. **Flagged for
  awareness**, not resolved — any future MC-height work should read ADR-0287 first.
- **PEPCH heritage geometry is newer than the brief implies.** The brief lists "PEPCH heritage
  catalogue" and "heritage catalogue exists (PEPCH GeoJSON)" as already-working. The existing audit
  confirms live GeoJSON boundary + catalogue endpoints (`gmucordoba.es/visorcasco/data/...`) were
  found the same day (2026-08-04) and are explicitly **not yet wired into PRYZM** and supply
  protection *level* only, not height/setback/volume numbers — consistent with the brief's blocker
  4 ("PEPCH rules are not encoded"), so no contradiction here, just a note that the geometry is a
  very recent find, not long-standing infrastructure.
- **PRYZM Readiness Score context.** `CAPABILITY-AUDIT-2026-08-04.md` assigns Córdoba a readiness
  score of 17/100 city-wide, with the ENVELOPE axis measured at 0.0% in the last full pass and
  HEIGHTS at 0.271%. The founder's brief does not carry this score forward; it is noted here purely
  so the roadmap is read against the existing measured baseline rather than in isolation.

---

## 4. Task order (as given, for a future sprint — not started)

**PHASE 1 — Complete existing vector coverage.** Re-run and package COACo extraction from
`coaco:ordenanzas`, `coaco:actuaciones`, `coaco:vcatastro_urbanismo`. Produce
`cordova_calificacion_master.geojson` with fields `parcel_id, ordenanza, source, confidence,
rule_family`.

**PHASE 2 — Recover city-wide calificación.** Investigate official sources — GMU Córdoba,
PGOU-2001 documentation, urban planning archives, planning sheets, cartographic PDFs. Search
specifically: planos de ordenación completa, planos de calificación, ordenanzas gráficas, series
`O.*`, planos escala 1:2000, planos escala 1:5000. "Do NOT search generic GIS portals again — the
missing asset is likely in official plan documentation." Goal: recover zoning polygons, ordinance
labels, sheet boundaries, coordinate systems. *(See §3 for the tension between this phase and the
existing corpus's "do not re-search" flag on the same question.)*

**PHASE 3 — Vectorize official plan sheets.** Pipeline: PDF/image → georeference → OCR legend →
polygon extraction → topology validation. Validation: compare recovered polygons against COACo
polygons. Acceptance: ≥95% match in pilot area before expanding. Record discrepancies, no silent
corrections.

**PHASE 4 — Rule pack completion.** Extract and verify OA, PAS, UAD, CTP, MC, Industrial, Protected
elements, PEPCH. For each, create `ordinance_rule.json`, e.g. `{"ordinance":"OA-1","height":,
"floors":,"occupancy":,"edificabilidad":,"setbacks":,"source_page":"","confidence":"verified"}`.

**PHASE 5 — Handle non-deterministic cases.** Explicit branches:
- A: known rule → compute envelope.
- B: delegated planning → return refusal with instrument reference.
- C: missing alignment → return conditional envelope.
- D: heritage/flood/airport → apply constraints.

**PHASE 6 — Score final coverage.** Calculate municipality urban land coverage %, parcel coverage
%, envelope-computable %, refusal %, unknown %. Update `CORDOBA_CAPABILITY_AUDIT.md`.

---

## 5. Final outputs required (as given)

1. Córdoba master spatial corpus.
2. Córdoba ordinance rule pack.
3. Córdoba envelope resolver configuration.
4. Coverage report.
5. Missing-data register.

---

## 6. Founder's closing framing (as given)

> "IMPORTANT: Do not stop because no perfect WFS exists. The objective is not discovering a hidden
> database. The objective is creating a legally traceable derived planning corpus from official
> sources. Córdoba must become a working city."

---

## 7. Honest framing — proven vs. hypothesis

| Claim | Status |
|---|---|
| `CORDOBA_ENVELOPE_VERIFIED = true`, live `siteDispatch.ts` compute path | Confirmed in the existing corpus (`CAPABILITY-AUDIT-2026-08-04.md`, direct code re-read of `siteDispatch.ts:3411-3513`) |
| COACo GeoServer (`coaco:ordenanzas`/`actuaciones`/`vcatastro_urbanismo`) live | Confirmed in the existing corpus |
| Computable coverage is broad/near-complete | **Not supported** — existing corpus measures ≈1.7% of `SUELO URBANO` "any envelope" city-wide; the founder's brief does not state this ceiling |
| City-wide vector calificación is recoverable via a fresh document search (Phase 2) | **Contested by the existing corpus**, which marks an exhaustive six-probe search already run and recommends against re-searching without new information — flagged, not resolved, in §3 |
| Official plan sheets are available in bulk for vectorization (Phase 3's input assumption) | **Contested by the existing corpus** — 41 of 49 municipal raster sheets confirmed dead on re-fetch |
| PEPCH rules not yet encoded | Confirmed consistent with the existing corpus (geometry found live 2026-08-04, but rule content unverified/unwired) |
| Derived-plan refusal handling still needed (brief's blocker 5) | **Contested by the existing corpus**, which describes this as already correctly implemented, not an open blocker — flagged, not resolved, in §3 |
| This roadmap has been started/implemented | **No** — no code, rule pack, or new geometry has been produced from this brief; it is a queued plan only |

---

## 8. Next action

None — this is a queued roadmap. Before any engineering time is spent against Phase 2 or Phase 3
specifically, the tensions flagged in §3 (re-search vs. "exhaustive search already run"; sheet
vectorization vs. "41/49 dead") should be explicitly adjudicated by whoever picks this up, using the
existing `CLOSURE-REGISTER.md`, `MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`, and
`CAPABILITY-AUDIT-2026-08-04.md` as the governing prior art, per the standing PRYZM rule that a
new *-AUDIT-style document does not silently override a canonical prior finding.

**Status: NOT IMPLEMENTED — queued roadmap, not yet started**
