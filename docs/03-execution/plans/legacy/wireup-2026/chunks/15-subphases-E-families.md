# §16.5  Sub-phase plan — Phase E (per-family element migration)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 1807–1829.

> **Additions since this chunk was sliced** (per [Chunk 26 §26.4](./26-plan-self-corrections.md#§264--amendment-d--32-new-sub-phases-are-orphaned-from-their-phase-chunks) banner approach):
> - **E.6.0** — scaffold the missing `plugins/floor/` package (it does not exist on disk; 13 of the 14 element families have plugin scaffolding, only `floor` is missing). Lands in **S77-WIRE D1** as a prerequisite for **E.6** (Floor family migration). See [Chunk 24 §24.2](./24-pryzm1-src-coverage-audit.md).
> - **E.15, E.16, E.17** — three additional element families surfaced by the per-folder audit that the original §16.5 table missed:
>   - **E.15** — `furniture` family (migrate from `src/furniture/` → `plugins/furniture/`; Alt+F hotkey + right-rail Furniture click + place + edit + delete; bench `bench/ui/furniture-place.bench.ts`)
>   - **E.16** — `structural` family (migrate from `src/structural/` → `plugins/structural/`; column/beam draw frame; bench `bench/ui/structural-draw.bench.ts`)
>   - **E.17** — `plumbing` family (migrate from `src/elements/plumbing/` if present, else cold-start in `plugins/plumbing/`; pipe-segment draw frame; bench `bench/ui/plumbing-draw.bench.ts`)
>   - All three land in **S78-WIRE / S79-WIRE / S80-WIRE** alongside the original 14. See [Chunk 24 §24.5](./24-pryzm1-src-coverage-audit.md#§245--new-sub-phases-summary-what-to-add-to-§16).
> - **Phase E total**: 14 (original) + 1 (E.6.0 scaffolding) + 3 (E.15–E.17) = **18 sub-phases** instead of the originally-stated 14.
> - **Status as of this audit**: Phase E has **not yet started** (it opens after Phase D, which opens after the Phase C exit gate per [Chunk 26 §26.6](./26-plan-self-corrections.md#§266--amendment-f--phase-a-entry-gate-was-opened-on-red-ci-phase-d-entry-gate-must-not-be)).

---

### §16.5 Phase E — Per-family element migration (S76–S80, 14 sub-phases)

Each element family migration deletes its legacy `src/elements/<family>/`, `src/commands/<family>/`, and any `(window as any).<family>Tool/Store/Builder` global. The per-family draw HUD and mode picker keep their visual identity but call `runtime.tools.activate(family, mode)` and dispatch via `runtime.bus.executeCommand('<family>.<verb>', ...)`.

| Sub-phase | Family | Gestures migrated (per family: tool activate, mode pick, draw frame loop, commit, edit existing, delete) | Sprint | Bench |
|---|---|---|---|---|
| **E.1** | Wall | Alt+W hotkey; right-rail Wall click; mode bar L/O/C/S; wall-draw frame loop; commit at ESC; click-existing-wall→inspector; thickness drag; delete; copy; mirror | S76 | `bench/ui/wall-mode-switch.bench.ts` + `wall-draw-frame.bench.ts` + `wall-edit.bench.ts` |
| **E.2** | Slab | Alt+S; right-rail Slab; slab-draw frame; commit; edit dimensions; delete | S77 | `bench/ui/slab-draw.bench.ts` + edit |
| **E.3** | Door | Alt+D; right-rail Door; pick host wall; place; commit; edit; delete | S77 | `bench/ui/door-draw.bench.ts` |
| **E.4** | Window | Alt+I; same flow as door | S77 | `bench/ui/window-draw.bench.ts` |
| **E.5** | Curtain Wall | Alt+Q; right-rail Curtain Wall; mode picker SINGLE/COMPLEX; draw; commit; edit grid; edit panel | S77 | `bench/ui/cw-draw.bench.ts` + `cw-grid-edit.bench.ts` |
| **E.6** | Floor | right-rail Floor; floor-draw; commit; edit; delete | S78 | `bench/ui/floor-draw.bench.ts` |
| **E.7** | Ceiling | right-rail Ceiling; ceiling-draw; commit; edit; delete | S78 | `bench/ui/ceiling-draw.bench.ts` |
| **E.8** | Roof | right-rail Roof; mode picker (slope / hip / gable); draw; commit; edit; delete | S78 | `bench/ui/roof-draw.bench.ts` |
| **E.9** | Stair | right-rail Stair; StairLevelRequiredPanel; StairSetupPanel; commit; edit; delete | S78 | `bench/ui/stair-draw.bench.ts` |
| **E.10** | Handrail | right-rail Handrail; place along path; commit; edit | S78 | `bench/ui/handrail-draw.bench.ts` |
| **E.11** | Column | Alt+C; right-rail Column; place; commit; edit | S79 | `bench/ui/column-draw.bench.ts` |
| **E.12** | Beam | Alt+B; right-rail Beam; place; commit; edit | S79 | `bench/ui/beam-draw.bench.ts` |
| **E.13** | Grid | right-rail Grid; GridDrawingHUD; place; commit; edit; delete | S79 | `bench/ui/grids-tool.bench.ts` |
| **E.14** | Opening (cross-family: hosted in wall + slab) | OpeningModePicker; pick host; place; commit | S80 | `bench/ui/opening-draw.bench.ts` |

After each E.<n>, the corresponding `src/elements/<family>/` + `src/commands/<family>/` directories are deleted in the same PR.

