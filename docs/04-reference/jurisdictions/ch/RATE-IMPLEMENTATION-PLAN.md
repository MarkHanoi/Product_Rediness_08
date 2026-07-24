# Rate Implementation Plan — Switzerland (`ch`) national

**Current rate:** ~85% context-data / NOT ASSESSED legal layer (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling:** ~85–96% (context: proven; legal: conditioned on ÖREB probe outcome) ·
**Gap to Denmark (~96%):** 11 pts (context layer) / undefined (legal layer) ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Switzerland's context-data layer is already near the ceiling (~85%), with open items in GWR schema
transcription and a few minor topic nuances (tree authority, pedestrian sub-classification, CityGML
version). Those can be resolved with three low-effort reads and will push the context layer to ~90–95%.

The legal/zoning layer ceiling is **genuinely unknown** and is gated on one probe. Switzerland has
a structural advantage no other country in this benchmark possesses: a **federal data model** for the
ÖREB/RDPPF cadastre (V-ÖREB ordinance), standardized across all 26 cantons. Two possible outcomes:

- **Outcome A — ÖREB returns structured fields** (zone code + numeric Ausnützungsziffer + max height
  as machine-readable attributes): ceiling approaches **~85–96%**, Denmark-equivalent or better. The
  federal V-ÖREB schema makes a single reader reusable across all 26 cantons — the gap to Denmark
  becomes an engineering sprint, not a policy problem. Switzerland would be the highest-rated
  jurisdiction in this benchmark after Denmark.

- **Outcome B — ÖREB returns PDF URL only** (numeric rules live in ordinance text, not structured
  fields): ceiling is lower, likely **~30–45%** without a transcription pipeline. Even then,
  Switzerland's contact-data layer (~90%) leaves it above Germany and France on the overall score.

The ceiling is not yet established for the legal layer. Phase 0 below IS the assessment.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0 — Context closeout** | Read GWR Merkmalskatalog; confirm CityGML version; check 3.0 Beta canton list; Areale Freizeit sub-types; pedestrian sub-classification | GWR EGID join pipeline can be specced; CityGML ingestion pipeline version locked | ~85% → ~90–92% | Very low — 3 document reads + 1 tile download | NOT STARTED | UNASSIGNED |
| **0b — ÖREB pilot probe** | One HTTP GET against Zürich ÖREB (`oereb.zh.ch`) or Bern ÖREB; inspect for structured zone + FAR + height fields | Establishes ceiling model (Outcome A or B); gates all legal-layer phases | NOT ASSESSED → measured baseline | Very low — one API call | NOT STARTED | UNASSIGNED |
| **1 — Legal-layer pilot (1 canton)** | Full envelope query for one test address in pilot canton: zone code + Ausnützungsziffer + height, cited per field | First city/municipality pack in Switzerland (`ch-zh/<BFS>-<slug>/` or `ch-be/...`) | TBD post-Phase 0b | Low–Medium | NOT STARTED | UNASSIGNED |
| **2 — Scale to priority cantons** | Zürich (city), Geneva, Lausanne, Basel, Bern — the 5 cities most likely to be target markets | 5-city pack coverage; enables September-launch wedge if Outcome A | TBD post-Phase 1 | Medium | NOT STARTED | UNASSIGNED |
| **3 — Full 26 cantons** | All ÖREB endpoints via federal aggregator (`geodienste.ch`); per-canton SOURCES.md + VERIFICATION.md | National coverage; Switzerland rate reaches ceiling | → ceiling (~85–96% if Outcome A) | Medium — endpoint list mostly mechanical if Outcome A | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Switzerland's gap to Denmark on the **context layer** is:
- swissBUILDINGS3D CityGML version not confirmed (1 point)
- GWR Merkmalskatalog not fully transcribed (1–2 points)
- Tree data authority nuance (municipal override pattern, cities unconfirmed) (1–2 points)
- Pedestrian sub-classification granularity (1 point)

**Total context gap: ~4–11 pts — closeable in Phase 0 with 3 document reads.**

Switzerland's gap to Denmark on the **legal layer** is conditioned on ÖREB probe outcome:
- **Outcome A (ÖREB structured):** gap to Denmark is mainly engineering — building the V-ÖREB reader
  and running it for 26 cantons. No structural PDF-transcription problem. Gap closeable.
- **Outcome B (ÖREB PDF only):** gap mirrors France/Germany — the number lives in ordinance text and
  requires an OCR + L-449 human-verification pipeline. Policy change would be needed to close fully.

**Switzerland is the only jurisdiction in this benchmark where the ceiling question can be definitively
answered with a single API call.**

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

- **Phase 0b blocks everything in the legal layer.** Do not scope Phase 1 municipality folders until
  the ÖREB probe result is known.
- **L-449 human-verification gate** applies to any legal numeric value before a pack ships
  `confidence: 'structured'` — even if ÖREB returns a structured field.
- **V-ÖREB reader (Outcome A):** if built for Zürich, it is directly reusable for all 25 other
  cantons via the same federal aggregator (`geodienste.ch`). Cross-canton reuse is the highest-value
  engineering output of Phase 1.
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
