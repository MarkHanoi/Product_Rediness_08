# Phase 3B — Plugin SDK Internal + IFC/DXF/Rhino + UI Tokens + Audit Log
## Q2 of Phase 3 · Months 28–30 · Sprints S55–S60

> **Authority note (added 2026-04-27).** This sub-phase doc is subordinate to the SPEC and ADR series. Conflict precedence: `docs/03-execution/specs/SPEC-*` → `docs/02-decisions/adrs/ADR-*` (cited as `[strategic ADR-NNN]`) → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `CRITICAL-REVIEW-2026-04-27.md` → `05-IMPLEMENTATION-PLAN.md` → this phase doc. Sprint-scoped ADRs in `docs/02-decisions/adrs/NNNN-slug.md` are cited as `[ADR NNNN-slug]`.
>
> **Strategic anchor**: `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6 → `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §3 → this file.
>
> **Coalescing-window invariant**: every reference to bake/event coalescing means **250 ms** per `[strategic ADR-010]`.

---

## Executive Summary

**Sub-phase goal**: turn `plugins/*` from "internal architectural pattern" into "first-class plugin surface" — IFC, DXF, and Rhino plugins ship as the proof; Open Building Components (OBC) library is **removed from the editor bundle** and migrated to its own plugin per `[ADR 0021-plugin-descriptor-bootstrap-everything]` + SPEC-12 §5; the design system (`packages/ui/`) replaces ad-hoc styling per `[strategic ADR-026]` (UI Architecture); audit-log schema lit per `[strategic ADR-021]` + ADR-028 Part G as the SOC2 evidence pipeline begins. By M30 the platform has the developer-facing surface that S62–S64 (Phase 3C) will publish externally.

**Why 3B is the most "moving-furniture" quarter of Phase 3**: every sub-phase is a conscious deletion or extraction. OBC out of the editor (S55). Legacy `src/styles/` migrated to `packages/ui/` (S56, S58). Legacy 11-wave Visibility-Gate engine **deleted** (S58, the second-hardest deletion after S61). DXF/SVG export decided ship-or-defer (S59). Reserved-VM capacity reviewed (S60). The phase ends with the editor bundle materially smaller than it started, despite three new format plugins and a design system.

**The four hardest problems in 3B**:

1. **OBC bundle removal without breaking IFC import** (S55) — OBC currently library-mounted in the editor; the migration moves it to `plugins/ifc-import/` so it is loaded only when the user opens an IFC. Per SPEC-12 §7 the post-migration bundle size budget is enforced at PR-block time.
2. **`packages/ui/` design tokens + primitives lit AND legacy `src/styles/` migrated** (S56, S58, S64) — the design system is not just a Tailwind config; per `[strategic ADR-026]` it is a token layer + primitive component library that the editor consumes via dependency injection. Migration runs across three sprints.
3. **Legacy 11-wave Visibility-Gate engine deleted** (S58) — a 2000+ LOC engine that survived because it had subtle behaviour the new wave-pure-function path needed to match. After S53 retro signed off the parity, the legacy engine becomes deletable. This is the second-hardest deletion in the 36-month plan.
4. **PDF-to-BIM door/window symbol matching** (S58) — per ADR-029 the second pipeline stage. Symbol matching is harder than wall extraction because building codes vary and symbol vocabularies differ regionally; the confidence model in S60 absorbs this variance.

**Cut-list discipline**: S59 is the gate where DXF/SVG export per `[strategic ADR-018]` T2.1 is decided ship-or-defer based on Phase 2 velocity. Founder + agent decision; recorded in `apps/bench/reports/M30-3B.md`.

---

## §0 Reading Conventions

**ADR citation format**: `[strategic ADR-NNN]` for strategic series; `[ADR NNNN-slug]` for sprint-scoped.

**Bundle-size invariant**: `pnpm bench bundle-size` is PR-blocking. Per `[ADR 0023-second-tier-elements-triage]` and SPEC-12 §7, every new plugin adds **zero bytes** to the editor's first-paint bundle; plugins lazy-load on first activation.

**Plugin descriptor invariant**: per `[ADR 0021-plugin-descriptor-bootstrap-everything]` every plugin ships a single `descriptor.ts` that the host consumes; no plugin reaches into the host directly.

**Format-plugin invariant**: every format plugin (IFC, DXF, Rhino, BCF) implements the same `FormatPluginInterface` — `read(blob) → DocumentTree`, `write(documentTree) → blob`, optional `partial(blob, pred) → DocumentTree` for streamed import.

---

## §1 Track Allocation for 3B

### Track A — Format plugins, OBC migration, audit log, PDF-to-BIM (Agent A)

| Item | Sprint |
|---|---|
| OBC removed from editor bundle per SPEC-12 §5; `src/import/ifc/` migrated to `plugins/ifc-import/`; OBC library-mount entry deleted per `[ADR 0023-...]` | S55 |
| `plugins/ifc-import/` full impl (round-trip tests) | S55 |
| `plugins/dxf-import/` full impl + `plugins/dxf-export/` (gated S59) | S55, S59 |
| `plugins/rhino-import/` full impl | S57 |
| Audit-log schema lit per `[strategic ADR-021]` + ADR-028 Part G; SOC2 evidence pipeline begins | S57 |
| Legacy 11-wave Visibility-Gate engine **deleted** per SPEC-27 §4.3 + SPEC-30 §6.2 | S58 |
| PDF-to-BIM door/window symbol matching lit per `[strategic ADR-029]` | S58 |
| PDF-to-BIM confidence model + review queue UI per ADR-029 Part A | S60 |
| Backup verification bench live per SPEC-24 §3.4 | S55 |

### Track B — UI tokens + primitives, BCF round-trip, PropertyPanel decomposition (Agent B)

| Item | Sprint |
|---|---|
| `packages/ui/` design tokens + primitives lit per `[strategic ADR-026]` | S56 |
| Half of `src/styles/` migrated to `packages/ui/` | S56 |
| `plugins/bcf/` BCF round-trip impl | S57 |
| Print-canvas backend lit per SPEC-29 §4.4 | S55 |
| PropertyPanel decomposition into `plugins/inspector/` | S58 |
| PropertyInspector decomposition (continues into S60) | S58, S60 |
| DXF/SVG export ship-or-defer decision per `[strategic ADR-018]` T2.1 | S59 |
| Idle-CPU bench audit per ADR-023 Part F | S60 |
| Reserved-VM capacity review per ADR-022 Part D | S60 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| Sprint-scoped `[ADR 0017-headless-package-surface]` (refresh) | S55 D1 |
| Sprint-scoped `[ADR 0023-second-tier-elements-triage]` (apply to OBC) | S55 D1 |
| Sprint-scoped `[ADR 0024-furniture-multi-representation]` (refresh) | S57 D1 |
| Sprint-scoped `[ADR 0008-wall-handler-triage]` (revisit for IFC ↔ wall round-trip) | S55 D1 |
| 3B demo recording (10-min screencast) | S60 D9 |
| `apps/bench/reports/M30-3B.md` | S60 D9 |

---

## §2 Sprint-by-Sprint Detail

---

### S55 — IFC Plugin + OBC Bundle Removal + DXF Plugin + Print-Canvas Backend
**Weeks 109–110 (Month 28)**

---

#### Context and Why This Matters

The IFC plugin is the highest-stakes plugin in Phase 3B for a reason: IFC interchange is **the** interoperability test for any BIM platform. Per `[strategic ADR-008]` the scope is IFC 4.0 import/export + IFC 4.3 read-only; advanced IFC 4.3 features are explicitly post-GA.

OBC (Open Building Components) library has lived in the editor bundle since PRYZM 1. It is a 4MB+ library whose only consumers are IFC import paths. Per SPEC-12 §5 + `[ADR 0023-...]` it migrates **into** `plugins/ifc-import/` so the editor's first-paint bundle no longer carries it. The `pnpm bench bundle-size` gate enforces this: post-migration first-paint bundle must be **smaller** than pre-migration.

DXF plugin lands in parallel (simpler than IFC; ASCII text format, no chunked geometry).

Print-canvas backend per SPEC-29 §4.4 lights up the rendering path the PDF-to-BIM pipeline (S58) and the public REST `/api/print` endpoint (S65) consume.

---

#### Implementation Detail — `plugins/ifc-import/`

```typescript
// plugins/ifc-import/descriptor.ts

export const ifcImportDescriptor: PluginDescriptor = {
  id: 'pryzm/ifc-import',
  version: '1.0.0',
  surfaces: ['format-plugin'],
  fileExtensions: ['.ifc', '.ifczip'],
  // OBC is co-located now; lazy-loaded on first IFC open.
  lazyEntry: () => import('./impl'),
};

// plugins/ifc-import/impl.ts

import { OBC } from 'open-building-components';

export class IfcImporter implements FormatPluginInterface {
  async read(blob: Blob): Promise<DocumentTree> {
    const obc = await OBC.create();
    const ifcModel = await obc.parseIfc(blob);
    return mapIfcModelToPryzmTree(ifcModel);
  }

  async write(tree: DocumentTree): Promise<Blob> {
    const obc = await OBC.create();
    const ifcModel = mapPryzmTreeToIfcModel(tree);
    return obc.serializeIfc(ifcModel);
  }
}
```

**Why the lazy `import('./impl')` matters**: it makes OBC a separate Vite chunk. Build-report verification at S55 D7 confirms zero OBC bytes in the editor's first-paint bundle.

---

#### Implementation Detail — Bundle-size budget

```typescript
// apps/bench/bundle-size.ts (PR-blocking gate)

const FIRST_PAINT_BUDGET_KB = 850;   // SPEC-12 §7 contract
const FIRST_PAINT_REGRESSION_TOLERANCE_KB = 5;

it('first-paint bundle within budget', async () => {
  const stats = await runViteBuild();
  const firstPaintKb = sumChunks(stats, ['main', 'editor-shell', 'react', 'three']);
  expect(firstPaintKb).toBeLessThan(FIRST_PAINT_BUDGET_KB);

  const baseline = await loadBaseline();
  expect(firstPaintKb).toBeLessThan(baseline.firstPaintKb + FIRST_PAINT_REGRESSION_TOLERANCE_KB);
});
```

K3-B: if at S55–S57 IFC/DXF/Rhino plugins increase initial bundle size at all, the phase halts; tree-shake regression must be fixed.

---

#### Daily Plan

- **D1**: refresh sprint-scoped ADRs (0017, 0023, 0008); IFC scope freeze.
- **D2**: `plugins/ifc-import/` skeleton + descriptor + OBC dynamic import.
- **D3**: IFC read path (smoke: 5 reference IFCs open).
- **D4**: IFC write path + round-trip test on smoke set.
- **D5**: DXF plugin skeleton + ASCII parser.
- **D6**: DXF round-trip test.
- **D7**: bundle-size gate verification (must be smaller than pre-migration).
- **D8**: print-canvas backend per SPEC-29 §4.4.
- **D9**: backup-verification bench live per SPEC-24 §3.4.
- **D10**: demo + buffer.

---

#### Exit Criteria for S55

- IFC import + export round-trip green on 10 reference files.
- DXF import + (read-only export gated by S59 decision) lit.
- OBC removed from editor first-paint bundle; `pnpm bench bundle-size` confirms reduction.
- Print-canvas backend operational (used by S58 PDF symbol matching).
- Backup-verification bench live.

---

### S56 — `packages/ui/` Design Tokens + Primitives + Half of `src/styles/` Migrated
**Weeks 111–112 (Month 28–29)**

---

#### Context and Why This Matters

Per `[strategic ADR-026]` the design system is a token layer (`packages/ui/tokens/`) + primitives (`packages/ui/primitives/{Button,Input,Dialog,Tooltip,Menu,...}`) that the editor consumes via dependency injection. The post-migration end-state per ADR-026 Part C is: editor production bundle has **zero `react` symbols** (the editor is vanilla TS by Phase 2's contract; `packages/ui/` provides a vanilla-TS primitive layer suitable for both editor consumption and any third-party React-based plugin shell at S64).

S56 migrates the easy half of `src/styles/` (color tokens, typography, spacing primitives, Button, Input, Dialog, Tooltip). The hard half (PropertyPanel atoms, schedule view atoms, sheet widget atoms) waits for S58 + S64.

---

#### Implementation Detail — Token layer

```typescript
// packages/ui/tokens/color.ts

export const color = {
  surface: { 0: '#0B0B0B', 1: '#161616', 2: '#1F1F1F', 3: '#2A2A2A' },
  text:    { primary: '#FAFAFA', secondary: '#A3A3A3', tertiary: '#6B6B6B' },
  brand:   { primary: '#FF6B35', primaryDim: '#C2532A', primaryGlow: '#FF8B5C' },
  state:   { ok: '#52C41A', warn: '#FAAD14', err: '#FF4D4F', info: '#1677FF' },
} as const;

// packages/ui/tokens/spacing.ts
export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

// packages/ui/tokens/elevation.ts
export const elevation = {
  0: 'none',
  1: '0 1px 2px rgba(0,0,0,0.18)',
  2: '0 4px 12px rgba(0,0,0,0.24)',
  3: '0 12px 32px rgba(0,0,0,0.32)',
} as const;
```

Tokens are CSS custom properties at runtime; the build emits them as :root variables consumed by every primitive.

---

#### Implementation Detail — Primitive (Button)

```typescript
// packages/ui/primitives/Button.ts

import { color, spacing, elevation } from '../tokens';

export interface ButtonOptions {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onClick: (ev: MouseEvent) => void;
}

export class Button extends HTMLElement {
  constructor(opts: ButtonOptions, label: string) {
    super();
    this.textContent = label;
    this.style.cssText = stylesFor(opts);
    this.addEventListener('click', (ev) => !opts.disabled && opts.onClick(ev));
  }
}
customElements.define('pryzm-button', Button);
```

**Why custom elements, not React**: per ADR-026 Part C the editor's first-paint bundle has zero `react` symbols. `packages/ui/` primitives are framework-agnostic web components; React-based plugin shells (S64) consume them via React wrappers shipped in `packages/ui-react/`.

---

#### Daily Plan

- **D1**: token files (color, spacing, elevation, typography).
- **D2**: Button primitive + storybook story.
- **D3**: Input + Dialog primitives.
- **D4**: Tooltip + Menu primitives.
- **D5**: editor migration: replace ad-hoc Button calls with `<pryzm-button>`.
- **D6**: editor migration: Input + Dialog.
- **D7**: editor migration: Tooltip + Menu.
- **D8**: bundle-size verification + lint.
- **D9**: demo (visual diff vs pre-migration; should be < 2 px on critical paths).
- **D10**: buffer.

---

#### Exit Criteria for S56

- Token layer lit.
- 5 primitives shipped (Button, Input, Dialog, Tooltip, Menu).
- Half of `src/styles/` (the easy half) migrated.
- Bundle-size verification: no growth from primitives.

---

### S57 — Rhino Plugin + BCF Round-Trip + Audit-Log Schema + SOC2 Evidence Pipeline
**Weeks 113–114 (Month 29)**

---

#### Context and Why This Matters

Rhino plugin (`plugins/rhino-import/`) closes the third leg of the IFC/DXF/Rhino tripod that no other web-native BIM platform offers natively. Per the format-plugin contract, the implementation is small (~600 LOC); the hard part is the sample-fixture coverage.

BCF (BIM Collaboration Format) round-trip per the BCF 3.0 spec lit at S57 puts PRYZM 2 ahead of named competitors that ship import-only or export-only.

Audit-log schema per `[strategic ADR-021]` + ADR-028 Part G is the foundation of the SOC2 evidence pipeline that S65 (workspace admin) and S68 (SOC2 quarterly automation) depend on.

---

#### Implementation Detail — Audit-log schema

```sql
-- audit_log table per ADR-028 Part G; ADR-021 enterprise security
CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id        TEXT NOT NULL,
  actor_kind      TEXT NOT NULL CHECK (actor_kind IN ('user','service','plugin','ai-workflow')),
  workspace_id    TEXT NOT NULL,
  project_id      TEXT,
  action          TEXT NOT NULL,         -- e.g. 'project.create', 'sheet.export'
  resource_kind   TEXT NOT NULL,
  resource_id     TEXT,
  outcome         TEXT NOT NULL CHECK (outcome IN ('ok','denied','error')),
  permission_used TEXT,                  -- the [strategic ADR-011] permission tuple matched
  trace_id        TEXT,                  -- OTel trace-id for cross-system correlation
  metadata        JSONB
);
CREATE INDEX audit_log_workspace_ts_idx ON audit_log (workspace_id, ts DESC);
CREATE INDEX audit_log_project_ts_idx   ON audit_log (project_id, ts DESC) WHERE project_id IS NOT NULL;
CREATE INDEX audit_log_actor_ts_idx     ON audit_log (actor_id, ts DESC);
```

Per ADR-028 Part G every gateway route emits an audit-log row whether or not the action succeeds. SOC2 evidence is *pulled* from this table by the quarterly automation in S68.

---

#### Daily Plan

- **D1**: refresh `[ADR 0024-furniture-multi-representation]`; Rhino scope freeze.
- **D2**: `plugins/rhino-import/` skeleton + binary parser.
- **D3**: Rhino read path (smoke).
- **D4**: BCF round-trip skeleton (read).
- **D5**: BCF write path.
- **D6**: audit-log schema migration + middleware integration.
- **D7**: SOC2 evidence pipeline first ad-hoc query (proof-of-concept).
- **D8**: bundle-size + lint.
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S57

- Rhino import + write green on 5 reference Rhino files.
- BCF round-trip green on 5 reference BCFs.
- audit_log table populated by every gateway route.
- SOC2 evidence ad-hoc query produces expected output for a 7-day window.

---

### S58 — Legacy 11-Wave Visibility-Gate Deleted + PDF Symbol Matching + PropertyPanel Decomposition Begins
**Weeks 115–116 (Month 29)**

---

#### Context and Why This Matters

S58 is the second-hardest deletion in the 36-month plan (the hardest is S61). The legacy 11-wave Visibility-Gate engine has been the safety net behind `featureFlags.legacy_vi_fallback` since S46; after S53 retro signed off the new wave-pure-function path as parity, the legacy engine becomes deletable.

Per SPEC-27 §4.3 + SPEC-30 §6.2 the deletion is irreversible: ~2000 LOC removed; the feature flag becomes a no-op (legacy fallback unavailable); any post-deletion regression is fix-forward.

PDF-to-BIM door/window symbol matching per `[strategic ADR-029]` is the second pipeline stage; the confidence model in S60 absorbs symbol-matching variance.

PropertyPanel decomposition begins: the 5,500+ LOC monolith becomes `plugins/inspector/` driven by per-element-family inspector descriptors.

---

#### Implementation Detail — Legacy deletion checklist

```text
S58 D5 morning checklist (must all be GREEN):
  [ ] S53 retro signed off.
  [ ] New `plugins/visibility-intent/` parity-tested all 11 waves.
  [ ] `featureFlags.legacy_vi_fallback` opt-in only since S53.
  [ ] No active beta projects using legacy_vi_fallback in last 14 days.
  [ ] `pnpm bench visibility-correctness` green for 14 consecutive nights.

S58 D5 actions (irreversible):
  1. Delete `src/visibility/legacy-engine/` (~2000 LOC).
  2. Delete `src/visibility/wave-gate.ts` (~600 LOC).
  3. `featureFlags.legacy_vi_fallback` becomes `@deprecated // no-op since 3B`.
  4. Update SPEC-30 §6.2 with deletion timestamp.
  5. Tag commit `phase3b-vi-legacy-deletion` for forensic trace.
```

---

#### Implementation Detail — PDF symbol matching

```typescript
// apps/ai-worker/cv/symbol-matching.ts

export async function matchDoorWindowSymbols(
  ctx: SymbolMatchCtx,
): Promise<{ doors: DoorProposal[]; windows: WindowProposal[] }> {
  const { vectorizedWalls, pdfPage } = ctx;

  const candidates = findOpeningsInWalls(vectorizedWalls);

  const doors: DoorProposal[] = [];
  const windows: WindowProposal[] = [];

  for (const cand of candidates) {
    const symbol = await classifyOpeningSymbol(pdfPage, cand.bbox);
    if (symbol.kind === 'door') {
      doors.push({
        bbox: cand.bbox,
        wallId: cand.wallId,
        confidence: symbol.confidence,
        proposedWidth: symbol.estimatedWidth,
        proposedSwing: symbol.swing,
      });
    } else if (symbol.kind === 'window') {
      windows.push({
        bbox: cand.bbox,
        wallId: cand.wallId,
        confidence: symbol.confidence,
        proposedWidth: symbol.estimatedWidth,
      });
    }
  }
  return { doors, windows };
}
```

---

#### Daily Plan

- **D1**: PropertyPanel decomposition kickoff; descriptor schema.
- **D2**: 5 inspector descriptors (Wall, Slab, Door, Window, Room).
- **D3**: 5 more descriptors.
- **D4**: legacy-deletion checklist verification.
- **D5**: **legacy 11-wave Visibility-Gate engine deleted**.
- **D6**: PDF door/window symbol matching impl.
- **D7**: PDF symbol matching e2e test on 5 beta PDFs.
- **D8**: bundle-size + lint.
- **D9**: demo (deletion ceremony + PDF symbol matching reveal).
- **D10**: buffer.

---

#### Exit Criteria for S58

- Legacy 11-wave Visibility-Gate engine deleted; tag committed.
- PropertyPanel inspector descriptors lit for 10 element families.
- PDF symbol matching produces door/window proposals on test PDFs.
- Bundle size further reduced (Visibility-Gate deletion buys back ~80 KB).

---

### S59 — DXF/SVG Export Decision + Cut-List Tier-2 Checkpoint
**Weeks 117–118 (Month 30)**

---

#### Context and Why This Matters

Per `[strategic ADR-018]` T2.1 the DXF/SVG export ship-or-defer decision happens this sprint based on Phase 2 velocity, beta cohort feedback, and current cut-list carry. If shipped, both formats land before M30. If deferred, both move to v2 backlog with clear rationale.

The Tier-2 cut-list checkpoint reviews:

| Cut ID | Description | Default | If reverted cost |
|---|---|---|---|
| T2.1 | Defer DXF/SVG export | open | 1 sprint |
| T2.2 | Defer component editor | **cut** (per S54) | 4 sprints |
| T2.3 | Defer multi-language UI | open | 2 sprints |
| T2.4 | Defer collaboration cursor history | open | 1 sprint |
| T2.5 | Defer offline-first mode | open | 3 sprints |
| T2.6 | Defer multi-region prep | open | 2 sprints (S67 anchor) |

Founder + agent decision; all decisions recorded in `apps/bench/reports/M30-3B.md`.

---

#### Daily Plan

- **D1**: DXF export decision meeting + decision logged.
- **D2**: SVG export decision meeting + decision logged.
- **D3–D6**: ship-path implementation (if shipped) OR cut-list refactor + comms (if deferred).
- **D7**: Tier-2 cut-list review meeting.
- **D8**: cut-list document update + comms to beta cohort.
- **D9**: demo.
- **D10**: buffer.

---

#### Exit Criteria for S59

- DXF/SVG export decision recorded; if shipped, plugin lit + tested.
- Tier-2 cut-list reviewed; decisions logged.
- Beta cohort communicated about scope changes.

---

### S60 — PDF-to-BIM Confidence + Idle-CPU Audit + Reserved-VM Capacity Review
**Weeks 119–120 (Month 30)**

---

#### Context and Why This Matters

S60 wraps Phase 3B with three operational tightenings:

1. **PDF-to-BIM confidence model + review queue UI** per ADR-029 Part A — the review queue surfaces all extracted elements with confidence < 0.85 for human review. This is the gate that lets the public preview at S70 happen.
2. **Idle-CPU bench audit** per ADR-023 Part F — single-frame-owner audit; verify that `pnpm bench single-frame-owner-audit` is green and no plugin is requesting frames during idle without justification.
3. **Reserved-VM capacity review** per ADR-022 Part D — possible second VM for >2k concurrent users per SPEC-15 §2.2.1. Decision deferred to S67 if cut per ADR-018 T2.6, else provisioned this sprint.

---

#### Implementation Detail — Confidence model

```typescript
// packages/pdf-to-bim/confidence.ts

export interface ConfidencedElement {
  kind: 'wall' | 'door' | 'window';
  proposal: WallProposal | DoorProposal | WindowProposal;
  confidence: number;           // [0, 1]
  factors: {                    // contributing factors per ADR-029 Part A
    geometricFit: number;
    symbolClarity: number;
    contextualPlausibility: number;
  };
}

export function aggregateConfidence(factors: ConfidencedElement['factors']): number {
  // Weighted geometric mean.
  const w = { geometricFit: 0.5, symbolClarity: 0.3, contextualPlausibility: 0.2 };
  const product = Math.pow(factors.geometricFit, w.geometricFit)
    * Math.pow(factors.symbolClarity, w.symbolClarity)
    * Math.pow(factors.contextualPlausibility, w.contextualPlausibility);
  return Math.min(1, Math.max(0, product));
}

export function shouldReview(c: number): boolean { return c < 0.85; }
```

---

#### Daily Plan

- **D1**: confidence model impl.
- **D2**: review queue UI (sidebar entry + per-element card).
- **D3**: confidence threshold tuning on beta-supplied PDFs.
- **D4**: idle-CPU audit + remediations (any plugin caught requesting frames during idle).
- **D5**: reserved-VM capacity decision per ADR-022 Part D.
- **D6**: 3B bench suite assembly.
- **D7**: bench run.
- **D8**: bench analysis + perf doc updates.
- **D9**: 3B demo + retro.
- **D10**: buffer.

---

#### Exit Criteria for S60 (and Sub-phase 3B)

- 3 format plugins (IFC, DXF, Rhino) shipped with round-trip tests.
- BCF round-trip shipped.
- Editor first-paint bundle smaller than at start of 3B (despite 3 new plugins + 1 new design system).
- Legacy Visibility-Gate engine deleted.
- PropertyPanel decomposition complete.
- PDF-to-BIM confidence + review queue lit.
- audit_log populated; SOC2 evidence ad-hoc queries working.
- `apps/bench/reports/M30-3B.md` published.

---

## §3 Phase 3B Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R3B-01 | OBC migration regresses IFC import | Medium | Critical | Round-trip smoke on 10 reference IFCs at S55 D4; dual-path fallback for one sprint | S55 |
| R3B-02 | Bundle-size budget exceeded | Medium | High | PR-block gate; K3-B kill-switch | S55–S57 |
| R3B-03 | Legacy VI deletion exposes regression | Medium | High | 14-night clean-bench gate before D5 deletion; fix-forward only post-deletion | S58 |
| R3B-04 | PDF symbol matching accuracy unacceptable | High | Medium | Confidence model in S60 absorbs variance; review queue is primary mitigation | S58, S60 |
| R3B-05 | Design system migration introduces visual regression | Medium | Medium | Visual-diff CI < 2 px on critical paths | S56 |
| R3B-06 | DXF/SVG export decision contested | Medium | Low | S59 decision documented; reversal cost = 1 sprint | S59 |
| R3B-07 | Reserved-VM capacity insufficient post-GA | Low | High | S60 decision; if multi-region cut deferred per T2.6, provision second VM | S60 |
| R3B-08 | PropertyPanel decomposition introduces missing fields | Medium | Medium | Per-family inspector descriptor parity test | S58, S60 |
| R3B-09 | BCF round-trip incompatible with Solibri/other tools | Medium | Low | Smoke test against 5 reference BCFs from named tools | S57 |
| R3B-10 | Audit-log volume exceeds projection at scale | Low | Medium | Partition by month; 18-month retention default; enterprise tier longer | S57 |

---

## §4 Phase 3B Kill-Switches

- **K3B-A** (= K3-B) — If at S55–S57 IFC/DXF/Rhino plugins increase initial bundle size at all, halt; tree-shake regression must be fixed.
- **K3B-B** — If at S58 D5 morning checklist any item is RED, defer legacy Visibility-Gate deletion to S59; document carry.
- **K3B-C** — If at S59 the cut-list Tier-2 review reveals a cut that breaks a beta user's workflow, halt forward 3B; defer to S60 D1 with mitigation plan.
- **K3B-D** — If at S60 PDF-to-BIM confidence model produces > 50% review-queue rate on beta PDFs, halt entry to 3C; tune model first; preview gate at S70 already requires < 30%.

---

## §5 Gap-Closure Subphase — Phase 3B (binding; consolidated from `GAP-REVIEW-2026-04-27.md`)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S55** | OBC removed from editor bundle per SPEC-12 §5; `src/import/ifc/` migrated to `plugins/ifc-import/`; OBC library-mount entry deleted per `[ADR 0023-...]`. Bundle size budget verified per SPEC-12 §7. PDF-to-BIM wall extraction lit per `[strategic ADR-029]`. Print-canvas backend lit per SPEC-29 §4.4. Backup verification bench live per SPEC-24 §3.4. | SPEC-12, `[ADR 0023-...]`, `[strategic ADR-029]` |
| **S56** | `packages/ui/` design tokens + primitives lit per `[strategic ADR-026]`; half of `src/styles/` migrated. | `[strategic ADR-026]` |
| **S57** | Audit-log schema lit per `[strategic ADR-021]` + ADR-028 Part G; SOC2 evidence pipeline begins. | `[strategic ADR-021]`, ADR-028 |
| **S58** | Legacy 11-wave Visibility-Gate engine **deleted** per SPEC-27 §4.3 + SPEC-30 §6.2. PDF-to-BIM door/window symbol matching lit per `[strategic ADR-029]`. | SPEC-27, SPEC-30, `[strategic ADR-029]` |
| **S59** | DXF / SVG export per `[strategic ADR-018]` T2.1 — decide v1 ship-or-defer based on Phase 2 velocity. | `[strategic ADR-018]` T2.1 |
| **S60** | PDF-to-BIM confidence model + review queue UI lit per `[strategic ADR-029]` Part A. Idle-CPU bench audit per ADR-023 Part F. Reserved VM capacity review per ADR-022 Part D — possible second VM for >2k concurrent users per SPEC-15 §2.2.1. | ADR-022, ADR-023, `[strategic ADR-029]` |

---

## §6 What Phase 3B Explicitly Did NOT Do

- Plugin SDK 1.0 publish (Phase 3C).
- Marketplace (Phase 3C).
- Public REST + WS APIs (Phase 3C).
- Headless npm publish (Phase 3C).
- Self-host packaging (Phase 3D).
- Browser matrix beyond Chromium (Phase 3D).
- PDF-to-BIM public preview (S70).
- Multi-region sync replication (cut per `[strategic ADR-018]` T1.7).

---

## §7 Phase 3B → 3C Handoff Checklist

- [ ] All M30 3B criteria signed off.
- [ ] `apps/bench/reports/M30-3B.md` published.
- [ ] One full week of mandatory founder rest (per master plan).
- [ ] Bundle-size delta vs M27: net reduction confirmed.
- [ ] Legacy `src/visibility/` empty.
- [ ] Cut-list T2.x decisions logged.
- [ ] `phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` re-read.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. The most "moving-furniture" quarter of Phase 3 — every sub-phase is a conscious deletion or extraction. The hardest moment is S58 D5 (legacy VI deletion); the most consequential decision is S59 (DXF/SVG ship-or-defer).*
