# SPEC-38 — MEP Systems (HVAC + Electrical + Plumbing-System + Sprinkler + Gas)

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead + MEP domain expert (hire by S77) |
| Phase | Phase 4 (M37–M42) |
| Sprint | S78–S80 |
| References | `12-` §3.3; `[strategic ADR-033]` |

---

## §1 Why this SPEC exists

PRYZM 2 GA ships MEP **fixtures** at S25–S27 (lighting fixtures, plumbing fixtures, furniture). It does not ship MEP **system networks** — the ducts, pipes, conduits, cable trays that connect equipment, with flow direction, sizing, and system inheritance. Without system networks PRYZM cannot serve mechanical / electrical engineers, who are 30–40% of the BIM market by seat. SPEC-38 ships the 5 system plugins required to compete with Revit MEP.

The Augmenta / Swapp pattern (AEC Magazine): AI auto-routes MEP. SPEC-38 ships the **substrate** (system plugins, sizing engines, equipment connections); SPEC-52 / SPEC-53 ship the **AI auto-router** on top.

## §2 The contract (binding)

### §2.1 The 5 plugins

| Plugin | Element types | Sizing standard | Equipment |
|---|---|---|---|
| `plugins/mep-hvac/` | Duct (rect / round / flat-oval), Fitting (elbow / tee / transition / reducer / takeoff), Equipment (AHU / VAV / Diffuser / Return) | ASHRAE 1.A constant-friction (default); SMACNA equal-friction (option) | AHU, VAV, FCU, Diffuser, Return-Air-Grille, Damper |
| `plugins/mep-electrical/` | Cable Tray, Conduit, Wire, Panel, Circuit, Device | NEC (default); IEC (option) | Panel, Switchboard, Transformer, Generator, Receptacle, Switch, Light Fixture (re-uses S26) |
| `plugins/mep-plumbing-system/` | Pipe, Pipe Fitting, Valve, Fixture (re-uses S27), Equipment | Hazen-Williams (water); Darcy-Weisbach (option) | Pump, Tank, Water-Heater, Boiler |
| `plugins/mep-sprinkler/` | Sprinkler, Branch Pipe, Riser, Valve | NFPA 13 hydraulic calc (US); BS EN 12845 (UK/EU); FM Global (option) | Pump, Riser, Tank |
| `plugins/mep-gas/` | Gas Pipe, Regulator, Meter | IGE/UP/2 (UK); NFPA 54 (US); EN 15001 (EU) | Boiler, Cooker, Generator |

### §2.2 System network model

Each system is a directed graph of elements. Per `[strategic ADR-033]`, propagation algorithm = **graph traversal** (not constraint solver):

```ts
interface MepSystem {
  id: ULID;
  type: "supply-air" | "return-air" | "exhaust" | "domestic-cold" | "domestic-hot" | ...;
  source: EquipmentRef;        // root of the directed graph
  graph: DirectedGraph<MepElementRef>;
  designConditions: SystemDesignConditions;
  computed: {
    sizingResults: Map<ElementRef, SizingResult>;
    flowDirections: Map<ElementRef, Vector3>;
    pressureDrops: Map<ElementRef, number>;
  };
}
```

System inheritance: when a duct is connected to a parent system, it inherits system type + design conditions. Edits to design conditions re-propagate via incremental graph traversal (not full re-bake).

### §2.3 Sizing engine

Per system type, a sizing function: `(graph, designConditions) → SizingResult[]`. Runs in worker pool (per ADR-005). Results stored on element parameters; visible in schedule (per ADR-027 formulas) and in 3D view (size badges via plan-view from S31).

## §3 Architecture

```
plugins/mep-hvac/
  src/store/HvacStore.ts
  src/handlers/{Create,Connect,SetSystem,Resize}.ts
  src/producer/produceHvac.ts          ← pure kernel (no THREE)
  src/committer/HvacCommitter.ts
  src/sizing/AshraeOnePoint-A.ts       ← ASHRAE 1.A constant-friction
  src/system/SystemGraph.ts            ← directed graph + traversal
  src/tool/HvacTool.ts                 ← UI tool

[same shape for electrical / plumbing-system / sprinkler / gas]

packages/mep-shared/
  src/SystemRegistry.ts                ← global registry of all live systems per project
  src/SystemColorMap.ts                ← consistent colour per system across views
  src/EquipmentLibrary.ts              ← shared base library (manufacturer-agnostic)
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S78 D1 | `plugins/mep-hvac/` skeleton; ADR-033 ratified; duct geometry (3 shapes) |
| S78 D3 | fitting library (10 fittings) + system graph + ASHRAE 1.A sizing v1 |
| S78 D5 | equipment connection (AHU + VAV + Diffuser + Return); system inheritance |
| S78 D7 | HVAC system viewer UI (colour-coding + flow arrows + sizing badges) |
| S78 D9 | bench: 200-fitting HVAC system bake < 1.5 s p95 |
| S79 D1 | `plugins/mep-electrical/` skeleton; cable tray + conduit geometry |
| S79 D3 | circuit logic (panel → circuit → device); panel-schedule generation |
| S79 D5 | load calculation v1 (NEC); equipment library |
| S79 D7 | panel-schedule viewer (re-uses sheet engine); per-circuit overlay |
| S79 D9 | bench: 50-circuit panel bake < 800 ms p95 |
| S80 D1 | `plugins/mep-plumbing-system/` skeleton; pipe geometry + Hazen-Williams |
| S80 D3 | `plugins/mep-sprinkler/` skeleton; NFPA 13 hydraulic calc stub |
| S80 D5 | `plugins/mep-gas/` skeleton; IGE/UP/2 sizing |
| S80 D7 | cross-MEP system viewer ("show all wet" / "show all electrical") |
| S80 D9 | bench: 100-fitting plumbing system bake < 1.2 s p95 |

## §5 NFT targets

| Workload | Target |
|---|---|
| 200-fitting HVAC system bake | < 1.5 s p95 |
| 50-circuit electrical panel bake | < 800 ms p95 |
| 100-fitting plumbing system bake | < 1.2 s p95 |
| Sprinkler hydraulic calc (50-head zone) | < 2 s p95 |
| System propagation on design-condition edit | < 500 ms p95 (incremental traversal) |
| Cross-MEP system viewer toggle | < 100 ms |

## §6 Anti-patterns forbidden

- Sizing in the main thread (must be worker-pool per ADR-005).
- Storing computed sizing results inside the system graph node (re-derive on demand to avoid stale state).
- Coupling system propagation to bake worker (system propagation is pure kernel; bake is downstream).
- Hard-coding US-only standards. Each plugin ships ≥ 2 standards (US + UK/EU/SG).

## §7 Cross-references

- `[strategic ADR-033]` propagation algorithm
- ADR-005 worker pool
- ADR-010 bake debounce (system re-bake coalesces with model bake)
- SPEC-31 §2 (MEP element families included in mixed batch bench at S30)
- SPEC-37 federated clash (MEP rules)
- SPEC-43 sustainability (MEP energy → operational carbon)
- SPEC-46 DfMA (MEP prefab off-site fabrication)
