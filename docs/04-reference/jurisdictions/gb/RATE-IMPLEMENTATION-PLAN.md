# Rate Implementation Plan — United Kingdom (`gb`) national

**Current rate:** `NOT YET ASSESSED` (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)) · **Realistic ceiling:**
**structurally LOW** (discretionary planning — no by-right numeric envelope) · **Gap to Denmark (~96%):** not a
like-for-like comparison (Denmark's numbers EXIST as structured data; GB's do not exist as data at all) ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

GB is **NOT** Denmark-like. Denmark reaches ~96% because its density/height numbers are digitised into structured
national fields. GB's are **discretionary** — they are not published as fields anywhere, so no ingestion pipeline
can conjure a national FAR/height table. The realistic LEGISLATION ceiling is therefore low and dominated by the
**Permitted Development Rights** slice (the only genuinely by-right envelope) plus per-LPA Local Plan boundaries.
The **completion** ceiling (C63 overall) is instead driven by the cheap physical axes (terrain/context/height),
which are OGL-open and can each reach 100% per city.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | AUDIT — this pass: scaffold `gb/` + London dossier, cite the cheap axes | the honest baseline | — → cheap axes cited | done | SHIPPED | this pass |
| **1** | Verify + bake London terrain (`terrain.verify.mjs` round-trip) | TERRAIN 50→100 | — | low | NOT STARTED | UNASSIGNED |
| **2** | Wire EA DSM−DTM nDSM stamp onto London footprints + re-bake | HEIGHTS not-assessed→measured | — | medium | NOT STARTED | UNASSIGNED |
| **3** | Land the rail/trees/sea context re-bake | CONTEXT 56→higher | — | low | NOT STARTED | UNASSIGNED |
| **4** | (legislation) model Permitted Development Rights as the by-right slice | small LEGISLATION | — | medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Not (a) PDFs-not-fields and not (b) fragmentation-across-N — it is (d) **the numbers do not exist as data**: GB
grants permission by discretion, so there is no structured density/height field to ingest at any scale. This is a
harder ceiling than any PDF-transcription jurisdiction, because transcription presupposes a written numeric rule,
which a discretionary determination does not have.

---

## 4 — Dependencies, blockers, cross-jurisdiction reuse

- **Reuse:** the EA DSM−DTM nDSM stamp is the SAME engine as DK (DHM) + ES (MDS) + NO/PT/IT — Phase 2 is a source
  swap, not new machinery.
- **Blocker:** EA LIDAR is England-only; Scotland/Wales/NI need their own terrain rows (`terrain.mjs`).
- **Skip:** OS MasterMap + OS Building Heights (commercial) — never the free path.

---

*Model references: **Denmark** `../dk/` (ceiling ~96%, structured data) · **France** `../fr/` (discretionary-ish
rules in PDFs, strong context — the closest analogue). Governing: **C58**, **C63**, **L-449** (human gate).*
