# SPEC-42 — Analysis Bridge Protocol

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Phase | Phase 5 (M43–M48) |
| Sprint | S87–S90 |
| References | `12-` §4; `13-` §2; `[strategic ADR-039]` |

---

## §1 Why this SPEC exists

PRYZM 2 cannot afford to build native FEA, energy, lighting, acoustic engines. Industry has best-in-class open-source solvers: Karamba3D + OpenSees + Code_Aster (structural), EnergyPlus (energy), Radiance (lighting), OpenFOAM (CFD). PRYZM ships **bridges**, not solvers. SPEC-42 defines the uniform IO contract so each engine plugs in identically.

## §2 The contract (binding)

### §2.1 Bridge protocol

Each engine integration is a `packages/analysis-bridge/<engine>/` adapter with:

```ts
interface AnalysisBridge {
  id: string;                          // e.g. "karamba3d", "energyplus"
  inputFormats: ReadonlyArray<string>; // e.g. ["ifc4", "gbxml", "json-ld"]
  outputFormats: ReadonlyArray<string>;
  prepare(model: PryzmModel, opts: PrepareOpts): Promise<EngineInput>;
  invoke(input: EngineInput, runOpts: RunOpts): Promise<EngineRun>;        // queued in apps/bake-worker
  fetchResult(runId: string): Promise<AnalysisResult>;
  overlayToPryzm(result: AnalysisResult, model: PryzmModel): Promise<Overlay>;
}
```

### §2.2 Data contract per `[strategic ADR-039]`

ADR-039 ratifies: **IFC4 + JSON-LD** as the universal export format. Engine-specific formats (gbXML for energy, MED for Code_Aster) are produced by the per-engine adapter from the IFC4 + JSON-LD canonical.

### §2.3 Run lifecycle

1. User clicks "Run analysis" on a project at CDE state ≥ S2.
2. Bridge `prepare()` produces `EngineInput`.
3. Bridge `invoke()` queues a job in `apps/bake-worker` (extends ADR-005 worker pool).
4. Engine runs in Docker on bake-worker pod (or dedicated analysis-worker pod for heavy runs per Phase 5 §4 ADR-040).
5. Bridge `fetchResult()` retrieves output.
6. Bridge `overlayToPryzm()` produces a per-element overlay map.
7. Overlay rendered via SPEC-13 visibility-intent layer.

### §2.4 First five engines

| Engine | Domain | Input format | Output overlay |
|---|---|---|---|
| Karamba3D | structural FEA (Grasshopper-native; standalone runner) | IFC4 + JSON-LD subset | per-element stress / displacement |
| OpenSees | structural FEA (open-source) | TCL script generated | per-element response history |
| Code_Aster | structural FEA (EDF, open-source) | MED format | per-element field data |
| EnergyPlus | energy + thermal | gbXML | per-zone heating/cooling/CO2 timeseries |
| Radiance | lighting + daylight | .rad scene | per-surface daylight factor + HDR illuminance |

## §3 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S87 D1 | SPEC-42 lands; ADR-039 ratified; `packages/analysis-bridge/` skeleton + uniform contract |
| S87 D5 | Karamba3D adapter + first end-to-end run on 100-element model |
| S87 D9 | result overlay UI (heatmap on elements via visibility-intent) |
| S88 D5 | OpenSees adapter (TCL script generator + `.out` parser) |
| S88 D9 | Code_Aster adapter (MED I/O via Salome-Meca runner in Docker) |
| S89 D5 | EnergyPlus adapter (gbXML export + EnergyPlus runner in Docker) |
| S89 D9 | per-zone result overlay (heating/cooling load, CO2 timeseries) |
| S90 D5 | Radiance adapter (.rad scene + HDR result import) |
| S90 D9 | bench: full 5-engine suite green |

## §4 NFT targets

| Workload | Target |
|---|---|
| Karamba3D run on 1K-element model | < 30 s end-to-end (PRYZM → engine → overlay) |
| EnergyPlus run on 5K-zone model | < 5 min end-to-end |
| Radiance run on 100-surface model, 10 sun positions | < 10 min end-to-end |
| Result-overlay render (10K-element heatmap) | < 1 s p95 |

## §5 Cross-references

- ADR-039 data contract
- ADR-005 worker pool
- SPEC-13 visibility-intent (overlay rendering)
- SPEC-43 sustainability (consumes EnergyPlus output for operational carbon)
- SPEC-44 cloud-baked rendering (shares analysis-worker pod infra)
