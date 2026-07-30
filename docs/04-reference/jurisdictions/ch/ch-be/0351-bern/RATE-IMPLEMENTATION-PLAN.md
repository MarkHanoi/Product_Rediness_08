# Rate Implementation Plan — Bern (`0351`) city

**Current LEGISLATION rate:** ~15–22% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md); composite master
[`RATE.md`](./RATE.md) = 66 % partial) · **Realistic ceiling:** ~38–48% · **Gap to ceiling:** ~18–28 pts ·
**Gap to Denmark (~96%):** ~74 pts · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Bern's realistic ceiling is **~38–48%** — reachable via the Zürich play (transcribe + sign the City Bauordnung
→ an `estimated-ruleset` pack), but starting from a slightly lower floor than Genève because canton BE is in
the geodienste `incomplete` cohort, so even the zone-ID lean is on ÖREB BE rather than the national WFS. The
ceiling is capped below Denmark by the `estimated-ruleset`-vs-`structured` tier + the PDF-bound height/setback.
The binding constraint is human transcription + sign-off (and firming the BE zone-ID), not raw data access.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — national CH probes inherited; BE `incomplete`-cohort caveat recorded; bake + terrain rows confirmed; RATE.md written | Honest baseline: ~15–22 % (below national floor); zone-ID partial, FAR/height absent | — → ~15–22% | Complete | VERIFIED | UNASSIGNED |
| **1** | Confirm ÖREB BE endpoint + probe one `extract` for a Bern parcel; check the INTERLIS `Typ.Nutzungsziffer` slot | Firms the zone-ID; resolves whether FAR is a cheap harvest or PDF transcription | ~15–22% → ~18–24% | Low | NOT STARTED | UNASSIGNED |
| **2** | Transcribe City of Bern Bauordnung + BE BauG height/AZ; human-verify; sign `../../sources/VERIFICATION.md`; register a BE city pack | The L-449 gate + a constructed envelope (the Zürich BZO play) | ~18–24% → ~38–48% | High | NOT STARTED | UNASSIGNED |
| **3** | Build shared swisstopo nDSM STAC join + re-bake `bern`; `terrain.verify.mjs` | HEIGHTS→measured; TERRAIN 50→100 | (HEIGHTS/TERRAIN) | Medium (shared) | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a)** No structured density/height field — Bern is Outcome B, plus the BE `incomplete` WFS handicap on
zone-ID. **(b)** Height/setback PDF-bound (BE BauG + City Bauordnung). **(c)** Any transcribed value ships
`estimated-ruleset`, tier-capped below Denmark's live structured fields.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Cross-jurisdiction reuse:** the swisstopo nDSM STAC join (Phase 3) is shared with Zürich + Genève; the
transcribe→verify→register flow mirrors Zürich's BZO pack + Barcelona's clau packs. **Governing:** C58 ·
ADR-0270 · ADR-0279 · L-449 · canton BE Baugesetz (BauG) + City of Bern Bauordnung.

---
*Model references: **Denmark** `../../../dk/` (~96%) · **Zürich** `../../ch-zh/0261-zurich/` (the CH
`estimated-ruleset` pack to mirror). Governing: **C58** · **ADR-0269** · **L-449**.*
