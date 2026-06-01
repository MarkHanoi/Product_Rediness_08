# SPEC-39 — EIR / BEP / TIDP / MIDP Document Chain

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Standards lead |
| Phase | Phase 4 (M37–M42) |
| Sprint | S81 |
| References | `12-` §3; SPEC-32; SPEC-49 (IDS, downstream) |

---

## §1 Why this SPEC exists

ISO 19650-2 mandates the document chain: **EIR** (Employer's Information Requirements, the brief) → **BEP** (BIM Execution Plan, the response) → **TIDP** (Task Information Delivery Plan, per task team) → **MIDP** (Master Information Delivery Plan, federation of TIDPs). Without auditable EIR/BEP/TIDP/MIDP linkage, an ISO 19650 audit fails. Today these are Word documents emailed around. SPEC-39 makes them first-class structured documents inside PRYZM, with status-gate enforcement on the CDE.

## §2 The contract (binding)

### §2.1 EIR

```ts
interface EIR {
  id: ULID;
  projectId: string;
  client: ContactRef;
  purpose: string;
  informationPurposes: InformationPurpose[];   // per ISO 19650 5.1.2
  geometryLOIN: LevelOfInformationNeed;        // per ISO 7817-1
  competence: CompetenceRequirement[];
  deliverables: DeliverableRequirement[];      // each → triggers a TIDP row
  acceptedAt: number | null;
}
```

EIR upload accepts: `.docx` / `.pdf` / structured `.json`. Parsers (LLM-assisted per SPEC-31 §3) extract EIR JSON from unstructured input.

### §2.2 BEP

Generated from EIR + project metadata. Editable. Sections per ISO 19650-2 5.3:
- Project information.
- Roles + responsibilities.
- Federation strategy + level of information need.
- Acceptance procedures (links to CDE state transitions).
- TIDP / MIDP plan.
- Software + version control.
- Information security strategy (links to SPEC-35).

### §2.3 TIDP / MIDP

TIDP per task team (architectural / structural / MEP / civil / contractor). Each row:

```ts
interface TidpRow {
  id: ULID;
  bepId: string;
  taskTeam: string;
  responsibility: string;
  deliverable: string;
  format: "ifc" | "cobie" | "pdf" | "dwg" | ...;
  loin: LevelOfInformationNeed;
  dueDate: number;
  cdeStateOnDelivery: "S2" | "S3" | "S4" | "S6";
  status: "planned" | "in-progress" | "delivered" | "approved" | "rejected";
}
```

MIDP = federation of TIDPs ordered on programme axis.

### §2.4 Status-gate enforcement

CDE state machine (SPEC-32) cannot transition past S2 without an approved BEP. Cannot transition past S4 without all TIDP rows for that delivery date marked `delivered`. Cannot enter S6 without MIDP completion sign-off.

## §3 Architecture

```
packages/iso-19650-docs/
  src/eir/Parser.ts          ← LLM-assisted unstructured → EIR JSON
  src/eir/Schema.ts          ← Zod EIR shape
  src/bep/Generator.ts       ← EIR + metadata → BEP draft markdown
  src/bep/Editor.ts          ← structured editor
  src/tidp/RowSchema.ts
  src/midp/Federation.ts     ← TIDP federation + Gantt
  src/cde/GateEnforcer.ts    ← integrates with CDE state machine

apps/editor/src/iso-19650/
  EIRUploadFlow.tsx
  BepEditor.tsx              ← rich-text + structured fields
  TidpTable.tsx
  MidpGantt.tsx              ← re-uses Gantt component from SPEC-41
```

## §4 Sprint rollout

| Sprint | Deliverable |
|---|---|
| S81 D1 | `packages/iso-19650-docs/` skeleton + EIR Zod schema |
| S81 D2 | EIR parser (LLM-assisted via SPEC-31 §3) |
| S81 D4 | BEP generator + structured editor UI |
| S81 D6 | TIDP table editor + responsibility matrix |
| S81 D7 | MIDP federation + Gantt (depends on Phase 5 SPEC-41 Gantt for full polish; stub OK at S81) |
| S81 D8 | CDE gate enforcer integration (blocks S2 / S4 / S6 transitions per §2.4) |
| S81 D9 | bench: 50-page EIR → BEP draft < 30 s p95 |

## §5 NFT targets

| Workload | Target |
|---|---|
| 50-page EIR `.pdf` → EIR JSON | < 30 s p95 (LLM-assisted) |
| EIR JSON → BEP draft markdown | < 5 s p95 |
| TIDP table render (200 rows) | < 200 ms p95 |
| MIDP Gantt cold-load (1,000 deliverables) | < 2 s p95 |
| Gate-enforcer check on state transition | < 50 ms p95 |

## §6 Anti-patterns forbidden

- Allowing CDE state transition to bypass gate enforcer (defeats audit).
- Storing BEP as opaque blob (must be structured for audit query).
- Shipping LLM-extracted EIR JSON without human confirm step (compliance risk).
- Coupling MIDP Gantt to plugin-marketplace Gantt (must be in core; ISO 19650 is GA contract).

## §7 Cross-references

- SPEC-31 §3 (LLM emission curve)
- SPEC-32 CDE
- SPEC-36 COBie (TIDP rows specify COBie deliverables at S2/S3/S4/S6)
- SPEC-49 IDS (BEP referenced IDS specs validated against model)
