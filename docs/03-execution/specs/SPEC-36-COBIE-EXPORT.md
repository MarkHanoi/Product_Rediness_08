# SPEC-36 — COBie 2.4 Export

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Standards lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S75 |
| References | `12-` §3; `[strategic ADR-034]`; SPEC-32 |

---

## §1 Why this SPEC exists

COBie (Construction-Operations Building information exchange, NIBS) is the asset-handover schema mandated by US GSA + USACE + DoD + UK government. The deliverable is a `.xlsx` (or `.csv` set) with 17 sheets that the operator imports into their CMMS / FM system. Revit ships COBie via the Autodesk-funded COBie Toolkit add-in; no web BIM tool ships it natively. SPEC-36 fills that gap.

## §2 The contract (binding)

### §2.1 The 17 sheets

`Contact, Facility, Floor, Space, Zone, Type, Component, System, Assembly, Connection, Spare, Resource, Job, Document, Attribute, Coordinate, Issue` — exactly per COBie 2.4 specification (NIBS Whole Building Design Guide).

### §2.2 Per-element parameter mapping

Each PRYZM element family declares its COBie mapping in `packages/cobie-mapper/mappings/{family}.json`. Example for `wall`:

```json
{
  "Component": {
    "Name": "${element.name}",
    "TypeName": "${element.typeId.name}",
    "Space": "${element.containingSpace.name}",
    "Description": "${element.parameters.description}",
    "ExtSystem": "PRYZM",
    "ExtObject": "${element.id}"
  },
  "Attribute": [
    { "Name": "FireRating", "Value": "${element.parameters.fireRating}", "Unit": "min" },
    { "Name": "AcousticRating", "Value": "${element.parameters.acousticRating}", "Unit": "dB" }
  ]
}
```

### §2.3 PIM/AIM gate triggers

Per ISO 19650, COBie drops happen at PIM stages (PIM = Project Information Model):
- **S2** drop: programme / brief data only.
- **S3** drop: design coordination data.
- **S4** drop: stage approval data (most attributes filled).
- **S6** As-Constructed drop: handover-ready (full data; replaces all prior).

Each CDE state transition (SPEC-32) at S2/S3/S4/S6 auto-triggers a COBie generation job and stores result at `cde_revisions.cobie_artifact_url`.

### §2.4 Fallback policy per `[strategic ADR-034]`

When a required Pset/parameter is missing on an element:
- Type-level fallback: read from element type if present.
- Synthesised: marked with `[SYNTHESISED]` prefix in the value cell + a warning row in the `Issue` sheet.
- Hard error: only for invariant fields (Component.Name, Component.Space).

Per ADR-034 default = synthesise + Issue row (fail-soft); hard-error mode is per-project opt-in for high-stakes deliverables.

## §3 Architecture

```
packages/cobie-mapper/
  mappings/                         ← per-family JSON mappings (18 files at GA, 14 more in Phase 4)
  generators/cobie-xlsx.ts          ← .xlsx writer (sheetjs)
  generators/cobie-csv.ts           ← .csv pack writer
  generators/cobie-json.ts          ← JSON COBie (emerging, NIBS draft)
  validators/nibs.ts                ← invokes NIBS validator REST endpoint (or local jar)
  index.ts                          ← exportCobie(projectId, atRevision, format)

apps/editor/src/cobie/
  MappingEditor.tsx                 ← per-family table editor (which Pset → which COBie cell)
  PreviewPane.tsx                   ← live .xlsx preview before export
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S75 D1 | `packages/cobie-mapper/` skeleton + 18 GA-family mappings + xlsx generator |
| S75 D3 | csv pack generator + JSON COBie (draft) |
| S75 D5 | NIBS validator integration (local jar in CI; REST in dev) |
| S75 D6 | mapping editor UI in `apps/editor/src/cobie/` |
| S75 D8 | CDE-state hook: auto-trigger on S2/S3/S4/S6 transitions |
| S75 D9 | `cobie-export.bench.ts` green; sample project passes NIBS validator |

## §5 NFT targets

| Workload | Target |
|---|---|
| 5K-element COBie export | < 30 s p95 |
| 50K-element COBie export | < 5 min p95 |
| NIBS validator pass rate on sample-project export | 100% (valid .xlsx, no schema errors) |
| Mapping editor live preview update | < 200 ms p95 |

## §6 Anti-patterns forbidden

- Hard-coding mappings in the generator (must be JSON-data per family).
- Skipping the Issue sheet when synthesising values (every synthesis is logged).
- Allowing `Component.Name = ""`. Empty Name fails NIBS validator; surfaced as hard error.

## §7 Cross-references

- `[strategic ADR-034]` mapping fallback policy
- SPEC-08 IFC (parameter source)
- SPEC-32 CDE (state-triggered exports)
- SPEC-39 EIR/BEP (specifies which COBie drops are required)
