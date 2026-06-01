# SPEC-43 — Sustainability: LCA / Embodied + Operational Carbon / EPDs / BREEAM-LEED-WELL-Passivhaus

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Sustainability lead (hire by S87) + Standards lead |
| Phase | Phase 5 (M43–M48) |
| Sprint | S88–S89 |
| References | `13-AEC-WISHLIST-SUPPLEMENT.md` §1 #4; `[strategic ADR-043]`; SPEC-42 |

---

## §1 Why this SPEC exists

AEC Magazine wishlist: *"Greater emphasis on sustainability, resilience, and lifecycle analysis, allowing designers and builders to create more environmentally friendly and resilient buildings."*

The UK Net Zero target (2050), EU EPBD (Energy Performance of Buildings Directive 2024 recast), Singapore BCA Green Mark, USGBC LEED v5, BRE BREEAM 2025, ILFI Living Building Challenge, RIBA 2030 Climate Challenge, AIA 2030 Commitment all require **whole-life carbon (WLC)** reporting on every project. WLC = embodied carbon (cradle-to-gate A1–A3 + transport A4 + construction A5) + operational (B6 energy, B7 water) + end-of-life (C1–C4) + module D (recovery / reuse / recycling). 

Today this is a separate tool (One Click LCA, EC3, OneClick alternatives). PRYZM 2 ships **first-class WLC** built into the model + schedule + cost view. Per `[strategic ADR-043]` we use **open EC3 + ICE databases** by default; commercial One Click LCA partnership available as enterprise add-on.

## §2 The contract (binding)

### §2.1 LCA modules (EN 15978 / EN 15804)

| Module | Stage | PRYZM source |
|---|---|---|
| A1 | Raw material extraction | Material EPD (factor per kg / m³) |
| A2 | Transport to manufacturer | Material EPD |
| A3 | Manufacturing | Material EPD |
| A4 | Transport to site | Calculated from project location + supplier location |
| A5 | Construction process | Project-level factor (0.5–1% of A1–A3 default; configurable) |
| B1 | Use phase emissions (e.g. refrigerant leakage) | Equipment EPD if applicable |
| B2 | Maintenance | Calculated from assembly lifecycle (default) |
| B3 | Repair | Assembly lifecycle |
| B4 | Replacement | Assembly lifecycle vs assumed life span (default 60 yr) |
| B5 | Refurbishment | Project-level scenario |
| **B6** | **Operational energy** | **EnergyPlus output (SPEC-42 EnergyPlus bridge) × grid factor (per region per year)** |
| B7 | Operational water | Per-zone water demand × water carbon factor |
| C1 | Deconstruction | Project-level factor |
| C2 | Transport end-of-life | Project location |
| C3 | Waste processing | Material EPD recyclability |
| C4 | Disposal | Material EPD |
| **D** | **Recovery / reuse / recycling beyond system boundary** | **Material EPD (reported separately per EN 15978)** |

### §2.2 EPD database integration

- **EC3** (Embodied Carbon in Construction Calculator, free, ~50,000 EPDs) — default; pulled nightly into local cache.
- **ICE database** (Inventory of Carbon and Energy, University of Bath, free) — default for generic materials.
- **One Click LCA partnership** — enterprise tier (per ADR-043).
- **Custom EPD upload** — per-project user-uploaded EPDs (`.json` or PDF with structured front-matter).

### §2.3 Per-element carbon factor

Element schedule (extends ADR-027 formulas) gains columns:
- `MaterialEPDRef` — link to EPD database row.
- `EmbodiedCarbonA1A3` — kgCO2e / unit (computed from EPD).
- `EmbodiedCarbonTotal` — × quantity.
- `OperationalCarbonB6` — populated post-EnergyPlus run.
- `WLCTotal` — sum.

### §2.4 Certification credit auto-tracker

Per scheme (BREEAM 2025 / LEED v5 / WELL v2 / Passivhaus / Living Building / BCA Green Mark), a credit-tracker runs against the model and reports per-credit status (unstarted / in-progress / achieved / verified). Each credit defines the rule + the model query (SPARQL when SPEC-48 ships, intermediate JSON-DSL until then).

### §2.5 Materials passport export

Per Madaster / EU Digital Product Passport / Building Material Hub spec: per-element material composition + EPD + recyclability + sourcing → JSON-LD export. End-of-life value preserved.

### §2.6 Climate resilience (stretch)

UKCP18 / NCA5 / IPCC AR6 climate scenario overlay: per project location, per year horizon, per element type, flag climate vulnerabilities (overheating, flood, wind, wildfire). Phase 7 SPEC-54 code-compliance hooks consume.

## §3 Architecture

```
packages/sustainability/
  src/lca/Modules.ts             ← A1–C4 + D module computation
  src/lca/EPDDatabase.ts         ← EC3 + ICE adapters; EPD cache
  src/lca/OperationalBridge.ts   ← consumes SPEC-42 EnergyPlus output for B6
  src/credits/Schemes.ts         ← BREEAM / LEED / WELL / Passivhaus / Living / BCA
  src/credits/Tracker.ts         ← per-credit evaluation
  src/passport/Exporter.ts       ← JSON-LD materials passport
  src/resilience/Overlay.ts      ← climate scenarios

apps/editor/src/sustainability/
  WLCDashboard.tsx               ← whole-life carbon summary
  CreditTracker.tsx              ← per-scheme credit board
  MaterialEPDPicker.tsx          ← attach EPD per element
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S88 D1 | SPEC-43 lands; ADR-043 ratified (EC3 + ICE default); `packages/sustainability/` skeleton |
| S88 D3 | EC3 adapter; nightly EPD cache; ICE generic-material defaults |
| S88 D5 | per-element schedule columns (extends ADR-027); per-element carbon |
| S88 D7 | WLC dashboard UI; project-level summary |
| S88 D9 | bench: 10K-element WLC < 30 s p95 |
| S89 D1 | Operational bridge (consumes SPEC-42 EnergyPlus output for B6) |
| S89 D3 | BREEAM 2025 + LEED v5 credit trackers (first 20 credits each) |
| S89 D5 | WELL v2 + Passivhaus credit trackers |
| S89 D7 | materials passport JSON-LD export |
| S89 D9 | bench: per-credit BREEAM evaluation < 200 ms p95 |

## §5 NFT targets

| Workload | Target |
|---|---|
| 10K-element WLC computation | < 30 s p95 |
| 100K-element WLC computation | < 5 min p95 |
| Per-credit BREEAM evaluation | < 200 ms p95 |
| Materials passport export (10K-element) | < 60 s p95 |
| EPD cache freshness | < 24 h |
| Operational bridge round-trip (with EnergyPlus warm cache) | < 30 s p95 |

## §6 Anti-patterns forbidden

- Storing computed carbon on element CRDT (must re-derive; EPD changes nightly).
- Hard-coding scheme rules in code (must be data; per-credit JSON definition).
- Cross-region grid-factor staleness (per-region grid factor updates monthly per IEA).
- Module-D as "negative carbon" hidden in WLC total (must be reported separately per EN 15978).

## §7 Cross-references

- ADR-027 schedule formulas
- ADR-043 EPD database choice
- SPEC-42 analysis bridges (EnergyPlus for B6)
- SPEC-45 5D cost (carbon + cost views composable)
- SPEC-46 DfMA (off-site fab reduces A4 + A5)
- SPEC-54 code compliance (climate-resilience overlay)
- SPEC-58 outcome pricing (per WLC report metering)
