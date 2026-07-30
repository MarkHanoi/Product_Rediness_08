# Rate Implementation Plan — Genève (`6621`) city

**Current LEGISLATION rate:** ~20–25% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md); composite master
[`RATE.md`](./RATE.md) = 66 % partial) · **Realistic ceiling:** ~40–50% · **Gap to ceiling:** ~15–25 pts ·
**Gap to Denmark (~96%):** ~71 pts · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Genève's realistic ceiling is **~40–50%** — reachable via the Zürich play (transcribe + sign the cantonal
gabarit/indice → an `estimated-ruleset` pack). Today Genève sits at the CH national floor because no GE FAR/
height catalogue exists; the zone IDENTITY is already strong (geodienste GE `full` + ÖREB GE RDPPF). The
ceiling is capped below Denmark by the `estimated-ruleset`-vs-`structured` tier and the LCI/PLQ overlay
complexity (Genève's plans localisés de quartier are a per-perimeter graphic layer, like Paris's plan des
hauteurs). The binding constraint is human transcription + sign-off, not data access.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — national CH probes inherited; bake + terrain rows confirmed; RATE.md written | Honest baseline: ~20–25 % national floor; zone-ID strong, FAR/height absent | — → ~20–25% | Complete | VERIFIED | UNASSIGNED |
| **1** | Probe canton GE INTERLIS `Typ.Nutzungsziffer` slot (populated?) + one GE RDPPF SOAP `extract` | Resolves whether FAR is a cheap harvest or a PDF transcription | ~20–25% (probe only) | Low | NOT STARTED | UNASSIGNED |
| **2** | Transcribe canton GE LCI/PLQ gabarit + indice; human-verify; sign `../../sources/VERIFICATION.md`; register a GE city pack | The L-449 gate + a constructed envelope (the Zürich BZO play) | ~20–25% → ~40–50% | High | NOT STARTED | UNASSIGNED |
| **3** | Build shared swisstopo nDSM STAC join + re-bake `geneva`; `terrain.verify.mjs` | HEIGHTS→measured; TERRAIN 50→100 | (HEIGHTS/TERRAIN) | Medium (shared) | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a)** No structured density/height field — Genève is Outcome B (zone-ID data, numbers PDF-bound).
**(b)** LCI/PLQ overlay: the plans localisés de quartier are a graphic per-perimeter layer, a digitising cost.
**(c)** Any transcribed value ships `estimated-ruleset`, tier-capped below Denmark's live structured fields.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Cross-jurisdiction reuse:** the swisstopo nDSM STAC join (Phase 3) is shared with Zürich + Bern; the
transcribe→verify→register flow mirrors Zürich's BZO pack and Barcelona's clau packs; RDPPF SOAP decoding is
shared with canton VD (Lausanne). **Governing:** C58 · ADR-0270 · ADR-0279 · L-449 · canton GE LCI + RPGA.

---
*Model references: **Denmark** `../../../dk/` (~96%) · **Zürich** `../../ch-zh/0261-zurich/` (the CH
`estimated-ruleset` pack to mirror). Governing: **C58** · **ADR-0269** · **L-449**.*
