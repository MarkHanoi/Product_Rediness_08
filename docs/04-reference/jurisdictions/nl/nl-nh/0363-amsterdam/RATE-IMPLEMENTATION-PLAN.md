# Rate Implementation Plan — Amsterdam (`0363`) city

**Current overall (composite RATE):** **71 %** on the assessed subset (DATA-SRC 90 · TERRAIN 50 · CONTEXT 56)
· **LEGISLATION rate:** not-assessed (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)) ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Amsterdam has the **highest starting composite** of any city scaffolded so far (71 %), because the Dutch
national data stack is uniquely complete: a wired live cadastre (Kadaster BRK), a live measured building-
height source (3DBAG), and a keyless national DTM (AHN). The realistic ceiling is **high** — the two cheap
unlanded axes (HEIGHTS, TERRAIN verify) are pure engineering, and the omgevingsplan is a **structured-
attribute** envelope (Lyon-style) rather than a new-KIND case (Paris/Brussels). The gating cost is sourcing +
wiring the DSO omgevingsplan feed and the Omgevingswet transitional-law handling — not inventing a mechanism.

## 2 — Phase tracker (composite RATE — all 7 axes)

| Phase | Goal | Axis unlocked | Effort | Status |
|---|---|---|---|---|
| **0** | C63 Phase-1 audit — cheap axes cited; dossier scaffolded | DATA-SRC 90 · TERRAIN 50 · CONTEXT 56 → overall 71 % | Complete | ✅ this pass |
| **1** | Land the Amsterdam 3DBAG per-city bake (or OSM-footprint-join); probe provenance histogram | HEIGHTS/LOD (measured `tagged` fraction) | Medium | NOT STARTED |
| **2** | Bake + `terrain.verify.mjs` round-trip on AHN | TERRAIN 50 → 100 | Low | NOT STARTED |
| **3** | Run `computeParcelConfidence` over an Amsterdam sample | PARCEL | Low | NOT STARTED |
| **4** | Probe DSO / `ruimtelijkeplannen.nl`; sample N parcels; compute LEGISLATION fill; record citations + sign `VERIFICATION.md` | LEGISLATION (L-449 gate) | Medium | NOT STARTED |
| **5** | Wire the omgevingsplan feed (functie + goothoogte/bouwhoogte + bebouwingspercentage) as a structured-attribute rule pack; handle transitional bestemmingsplan | ENVELOPE | Medium (config, not a new KIND) | NOT STARTED |

## 3 — Why the gap to a certified envelope is smaller here

- **(a) No new engine KIND needed** (unlike Paris/Brussels) — omgevingsplan height is a direct structured
  attribute; wiring is config.
- **(b) Every input feed is already national + open** — Kadaster BRK, BAG/3DBAG, AHN, DSO. No licence gate.
- **(c) The residual risk is legal transition** — the Omgevingswet (1 Jan 2024) transition means the operative
  document may be a legacy bestemmingsplan; the pack must resolve precedence, which is logic, not data access.

## 4 — Dependencies + cross-jurisdiction reuse

- Phase 1 (3DBAG bake) reuses the Spain-MDS / Denmark-DHM OSM-footprint-join pattern (`heightSources.mjs`).
- Phase 5 (structured-attribute pack) reuses the **Lyon** `HBCPRINC`/`PLAFOND`-style resolver — NL is the
  same structured-attribute family, not the Paris/Brussels formula-KIND family.
- The Kadaster BRK provider is already the national NL parcel source — no per-city integration.

**Governing documents:** C58 · C63 · ADR-0279 · L-449 · Omgevingswet · omgevingsplan (DSO / STOP-TPOD).

*Last updated: 2026-07-30. Maintainer: UNASSIGNED.*
