# SPEC-41 — Sheet & Schedule Extensions for 4D / 5D

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Drawing engine lead |
| Phase | Phase 5 (M43–M48) |
| Sprint | S85–S86 |
| References | `13-` §2; `[strategic ADR-042]`; SPEC-30 (plan-view); ADR-027 (schedule formulas) |

---

## §1 Why this SPEC exists

Sheets + schedules ship at GA (S37–S39 pre-GA). 4D (programme link) and 5D (cost link) require sheet types and schedule columns the GA system does not have: Gantt sheet, BoQ sheet, time-sliced view, cost view. SPEC-41 extends the sheet engine and schedule engine to host these.

## §2 The contract (binding)

### §2.1 Gantt sheet type

New sheet template `gantt-programme.json` with:
- Time axis (per project programme; spans defined by linked Asta/MS Project/Synchro import).
- Per-element row driven by `element.programmeId`.
- Bar colour from `element.disciplineId`.
- Zoom: month / week / day.
- Filters: discipline, level, location, programme phase.

### §2.2 BoQ (Bill of Quantities) sheet type

New sheet template `boq.json` with:
- One row per `(elementType, location, level)` (configurable grouping).
- Quantity columns: `Qty`, `Unit`, `Description`, `RateRef`, `Rate`, `Amount`.
- Per-row formula expansion via ADR-027 schedule formulas extended to look up `RateRef` from cost library (SPEC-45).

### §2.3 Time-sliced view

Plan-view (SPEC-30) extended with `viewTime: number | null`. When set, only elements with `programmeId` whose programme bar contains `viewTime` are rendered. Time slider in toolbar.

### §2.4 4D simulation playback per `[strategic ADR-042]`

ADR-042 ratifies: **client-side timeline replay** (not server-side video render) for in-app playback. Server-side MP4 export is a separate output (also ADR-042) for share / report use.

## §3 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S85 D1 | Gantt sheet template + per-element row driver |
| S85 D3 | programme link UI (assign element → programme task) |
| S85 D5 | multi-programme support (e.g. tendered + as-built) |
| S85 D7 | BoQ sheet template; ADR-027 formula extension to cost library refs |
| S85 D9 | bench: 10K-element BoQ render < 5 s p95 |
| S86 D1 | time-sliced plan-view (`viewTime` parameter) |
| S86 D3 | time-slider toolbar; play / pause / step controls |
| S86 D5 | client-side timeline replay (per ADR-042); per-frame element-visibility map |
| S86 D7 | server-side MP4 export (Cycles + ffmpeg in `apps/render-worker`) |
| S86 D9 | bench: 30-sec MP4 export < 90 s for 10K-element + 200-task programme |

## §4 NFT targets

| Workload | Target |
|---|---|
| Gantt sheet render (1,000 tasks) | < 1 s p95 |
| BoQ sheet render (10K elements) | < 5 s p95 |
| Time-slider scrub (10K-element project) | 60 fps client-side replay |
| MP4 export (30 s, 10K-element + 200 tasks) | < 90 s |

## §5 Anti-patterns

- Storing programme link on element CRDT in mutable form. Programme is a separate document linked by id.
- Server-side per-frame rendering for in-app playback (ADR-042 ratifies client-side).

## §6 Cross-references

- ADR-027 schedule formulas
- ADR-042 4D playback strategy
- SPEC-30 plan-view (extended with `viewTime`)
- SPEC-45 5D cost integration (BoQ rates source)
- SPEC-44 cloud-baked rendering (MP4 export host)
