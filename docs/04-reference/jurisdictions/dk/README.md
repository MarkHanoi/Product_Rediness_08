# Denmark (`dk`) — national zoning jurisdiction

> ISO 3166-1 alpha-2 = `dk`. Denmark's planning law is **national** (Plandata.dk), so this folder is
> **flat** — findings live at the country level, per JURISDICTION-PLAYBOOK §2 ("depth follows the
> law, not the template"). Region/municipality folders are added only when a local instrument
> actually governs differently; today none does for the structured-envelope path.

## What governs here

- **Instrument chain:** `point → byggefelt (footprint) → lokalplan delområde → lokalplan → kommuneplanramme`.
  A parcel is governed by the tightest instrument that publishes a number; where the tightest is
  silent-on-a-number the selection falls through to the richer framework (§USABLE-FALLBACK, L-608).
- **Rule kind:** **coverage-and-FAR / height-and-storeys**, published directly per plan
  (`structured`, C58 §1.2 fidelity 1) — NOT setback- or alignment-derived. Per-edge setbacks
  (byggelinjer) and ground-coverage % are absent from the plan feature (honest `null`).
- **Access model:** Denmark is a **DATA-FILL ceiling, not an access wall** (the opposite of
  Barcelona). The WFS is fully open/keyless; the only limit is which plans publish which number.

## Granularity (C58 §1.11)

Per-**plan** (and per-**delområde** where a multi-area plan splits its numbers). The buildable
envelope is structured-from-provider; there is **no rule pack and no registry line** — Denmark is
resolved entirely by `DkZoningProvider` + `mapPlandataToZoningRecord`. (Confirmed: `registry.ts`
contains no `dk` entry, and must not gain one.)

## The number (with named denominators — see `findings/L-609-*`)

| Metric | Value | Denominator |
|---|---|---|
| **Byzone click-weighted dimensional fill (D1)** | **≈ 87%** | a random area-weighted click in Denmark's **byzone** (2,844 km²) |
| Area-weighted fill within kommuneplanramme | 61.5% | all ramme-covered land |
| Feature-count fill (kommuneplanramme) | 75.7% | count of ramme features |
| Footprint/coverage delivered | 0% | (byggefelt could add 6.0% via a gated path) |

The three fill numbers differ because the **denominator** differs, not the data. Byzone is the
product-relevant one. See L-609 for why the "trends toward 77%" hypothesis was refuted.

## Files here

- `NEXT.md` — where we stopped, blockers, trip-wires, the smallest next step.
- `sources/SOURCES.md` — per-field citations + the live-verified endpoint/field catalogue.
- `sources/VERIFICATION.md` — the human sign-off gate (2 legal items still PENDING a Danish planner).
- `findings/L-609-click-weighted-fill-and-byggefelt.md` — the click-weighted measurement + the
  byggefelt footprint verdict + the exact wiring spec.
- `topics/` — the CONTEXT-data layer (3D buildings LOD, roads, water, parks; L-511) — migrated here
  from the legacy `docs/04-reference/denmark/`. `topics/README.md` is that context-data index.
- `regions/` — per-region endpoint/licence notes (context layer; national law needs no legal region split).

## Code (structured path — no rule pack)

- `server/plandataZoningProxy.js` — keyless same-origin WFS proxy + coordinate cache.
- `packages/site-parcel-data/src/providers/DkZoningProvider.ts` — the adapter (OTel span, graceful null).
- `packages/site-parcel-data/src/providers/mapPlandataToZoningRecord.ts` — the PURE field→ZoningRecord mapping.
- `docs/04-reference/jurisdictions/dk/DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md` — the strategic architecture.
