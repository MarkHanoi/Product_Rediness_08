# C36 — Clash Detection & Coordination

> **Stamp**: 2026-06-01 · **Status**: DRAFT
> **Scope**: governs the federated clash-detection engine, the issue lifecycle that wraps each detected clash, and the BCF 3.0 coordination round-trip with Solibri / Navisworks / BIMcollab. Codifies invariants for `ClashRule`, `ClashResult`, `ClashSession`, the `ClashEngine` (geometry intersection over `packages/spatial-index/`), the `IssueLifecycle` state machine, and the BCF authoring/import bridge that wraps `plugins/bcf/`.
> **Depends on**: [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) (commands + state), [C09](C09-AI-AND-VISIBILITY-INTENT.md) (visibility intent — selection-driven isolation of clashing elements), [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (perf budgets + OTel), [C16](C16-COMMAND-AUTHORING-PROTOCOL.md) (command authoring), [C25](C25-IFC-EXPORT-PRODUCTION.md) (IFC interop — federated source models), [C27](C27-BIM3-INSPECT-MODEL.md) (Inspect tree consumed for clash navigation).
> **Downstream**: [C28](C28-DATA-PANEL-AND-AUTOMATION.md) (issue grid surface), [C30](C30-DRAWING-SET-MANAGEMENT.md) (coordination drawings annotate resolved clashes), `plugins/bcf/` (extended with the engine wrapper).
> **Key principles**: **P5** (clash rule + result schemas pure), **P6** (clash mutations only through `commandBus`), **P7** (clash isolation is a visibility intent — not a parallel UI flag), **P8** (every clash session opens an OTel span; every issue-state transition emits one).
> **Master plan**: [MISSING-CONTRACTS-AUDIT §3.2](../../03-execution/status/missing-contracts-audit.md).
> **Prior-art**: existing `plugins/bcf/` owns the BCF 3.0 codec (S57 + S59 — multi-viewpoint, components, AssignedTo / DueDate / Stage). C36 governs the **workflow** layered above that format. Industry references: Solibri Model Checker rule-set semantics, Navisworks Clash Detective tolerance model, BIMcollab Zoom federation patterns.

---

## §1 — Invariants

### §1.1 — A clash session MUST be deterministic given fixed inputs

For a given `(ClashRuleSet, sourceModelHashes, tolerance, federationMembers)` tuple, running the engine twice MUST produce the **same set of `ClashResult.guid`s** in the **same order**. Determinism is achieved by:

- iterating federation members in `(disciplineId ASC, modelHash ASC)` order,
- iterating candidate pairs from the BVH/spatial-index in element-id-sorted order,
- minting `ClashResult.guid` as a stable hash of `(ruleId, elementA.guid, elementB.guid, locationCenterRounded)` — the centre is rounded to the rule's `clusteringTolerance` so micro-displacements do not produce phantom new clashes.

CI gate: `tools/ga-gate/check-clash-determinism.ts` — runs a fixture session twice and diffs the result set; non-empty diff fails the gate.

### §1.2 — False-positive rate target is documented per ruleSet

Every shipped `ClashRule` MUST declare a `targetFalsePositiveRate` in its schema (e.g. `0.05` for 5 %). The number is informational at runtime but normative at review: the rule is benchmarked against a fixture model whose clashes have been hand-classified, and the measured FP rate MUST be at or below the declared target. A rule whose measured rate drifts above target SHALL be reclassified to `Status: NEEDS_TUNING` and SHOULD NOT be enabled by default in production sessions.

### §1.3 — BCF round-trip MUST preserve all fields

A topic written by `clash.exportBcf` and re-imported via `clash.importBcf` MUST produce a `BCFTopic` with **byte-identical** values for: `guid`, `topicType`, `topicStatus`, `title`, `priority`, `index`, `labels`, `creationDate`, `creationAuthor`, `modifiedDate`, `modifiedAuthor`, `assignedTo`, `dueDate`, `stage`, `description`, every `comment` (full chain), every `viewpoint` (camera + components + snapshot PNG bytes), and `relatedTopics`. This rides on `plugins/bcf/`'s deterministic writer (Sprint S59 — see plugin README) and extends it with the C36 workflow metadata.

CI gate: `tools/ga-gate/check-bcf-roundtrip-fidelity.ts` — for every fixture issue, exports a BCF, re-imports it, and diffs the resulting `Issue` + underlying `BCFTopic` against the source. Any non-equal field fails.

### §1.4 — OTel spans per clash session

Per **P8**, every public exported function in the engine + the lifecycle MUST emit an OpenTelemetry span. The span surface:

| Span name | Attributes |
|---|---|
| `pryzm.clash.runSession` | `sessionId`, `ruleSetId`, `federationMemberCount`, `elementCount`, `pairsTested`, `resultCount`, `durationMs` |
| `pryzm.clash.markResolved` | `issueId`, `resolution` (`modification` \| `markup` \| `ignored`), `userId` |
| `pryzm.clash.transition` | `issueId`, `from`, `to`, `userId` |
| `pryzm.clash.exportBcf` | `topicCount`, `viewpointCount`, `byteCount` |
| `pryzm.clash.importBcf` | `byteCount`, `topicCount`, `issuesCreated`, `issuesUpdated` |

The tracer name MUST be `PRYZM_CLASH_TRACER`. Spans MUST be opened at the plane boundary, not in helper functions (per C09 §2.4 convention).

### §1.5 — Issue lifecycle states MUST be honoured — no skipping

The `IssueLifecycle` state machine has exactly four states:

```
open → in-review → resolved → approved
```

Transitions are linear forward; the only allowed backward edges are `in-review → open` (returned for more information) and `resolved → in-review` (rejected on review). **An issue MUST NOT skip a state.** Direct `open → resolved`, `open → approved`, `in-review → approved` are forbidden. The dispatcher for `clash.transition` rejects any payload whose `(from, to)` pair is not in the declared edge set with an error code `CLASH_INVALID_TRANSITION`.

CI gate: `tools/ga-gate/check-issue-state-machine.ts` — static-analyses every caller of `clash.transition` to ensure no source emits an invalid edge, and dynamically replays a fixture issue history asserting every transition is legal.

### §1.6 — Resolution requires evidence

An issue MAY enter the `resolved` state only when its `resolution` payload carries one of:

- a `modificationCommitId` — a git-style hash of the command-bus commit that mutated the model to clear the clash (the lifecycle then re-runs the originating rule on the affected pair to confirm the clash is gone — if it still clashes, the transition is rejected with `CLASH_NOT_CLEARED`); OR
- a `markupId` — pointer to a BCF markup viewpoint with at least one comment explaining why the clash is intentional / accepted (e.g. design intent overrides the rule); OR
- a `linkedIssueId` — pointer to a parent issue that subsumes this one (deduplication; the parent's resolution applies transitively).

A transition to `resolved` without any of these three fields is rejected with `CLASH_RESOLUTION_EVIDENCE_REQUIRED`.

### §1.7 — Federated clash MUST tag issue with originating discipline

Every `ClashResult` produced from elements that live in **different federation members** (i.e. different source disciplines — e.g. `structure.ifc` × `mep.ifc`) MUST carry a non-null `originatingDisciplines: [string, string]` tuple on the resulting `Issue`. The tuple is `(disciplineA, disciplineB)` lexicographically sorted. This drives downstream routing (assigning the issue to the team that owns the responsible discipline) and the BCF `Labels` field on export.

### §1.8 — Clash isolation is a visibility intent (P7)

When the user navigates to a clash in the Clash Browser panel (§5), the editor MUST isolate the two clashing elements via a `ClashIsolationVisibilityIntent` dispatched into `packages/visibility/`. The intent dims all non-clashing elements to 15 % opacity and highlights the two clashing elements in their severity colour (red / amber / yellow per §2). Direct `material.opacity = N` writes are forbidden — same enforcement as [C27 §1.3](C27-BIM3-INSPECT-MODEL.md).

### §1.9 — Commands flow through commandBus (P6)

All clash mutations MUST dispatch through `commandBus`: `clash.runSession`, `clash.markResolved`, `clash.transition`, `clash.exportBcf`, `clash.importBcf`, `clash.assignTo`, `clash.addComment`. UI MUST NOT mutate `ClashStore` or `IssueStore` directly. This includes the BCF importer — imported issues are created via `clash.importBcf` which internally fans out `issue.create` commands.

### §1.10 — Schemas are pure (P5)

`ClashRule`, `ClashResult`, `ClashSession`, `Issue`, and the lifecycle transition table all live in `packages/schemas/` as pure Zod schemas: zero I/O, zero THREE, zero DOM. The engine code that consumes them lives in `packages/clash-engine/` and depends on `packages/spatial-index/` + `packages/schemas/` only.

### §1.11 — Severity classification matrix is a single source of truth

The `(ClashType × Severity)` matrix (§2.5) is the **only** place severity is computed. Per-rule severity overrides MUST cite a row in this matrix. UI MUST NOT compute severity from element type or clash-volume heuristics; it reads `ClashResult.severity` and renders.

### §1.12 — Federation snapshots are content-addressed

A `ClashSession` SHALL pin every federation member by `(memberId, contentHash)` — the SHA-256 of the source IFC (or PRYZM-native bytes). Re-opening an old session reproduces the same results only if the same hashes are still resolvable; a missing hash MUST surface as a `MISSING_FEDERATION_MEMBER` warning rather than silently re-running against the latest model.

### §1.13 — Soft-clash clearance values are project-scoped

Clearance distances (e.g. "duct must be ≥ 50 mm from any structural beam") live in a project-scoped `ClearancePolicy` document, NOT hard-coded into the rule. Rules reference policies by `policyId`. Changing a policy requires a new `ClashSession` (the old session retains its frozen clearance snapshot for audit).

---

## §2 — Schema

All schemas live in `packages/schemas/src/clash/`. RFC 2119 normative; field types are TypeScript syntax.

### §2.1 — `ClashRule`

The unit of detection logic.

```typescript
interface ClashRule {
  guid: string;                            // stable id
  name: string;                            // e.g. "Structural beam vs HVAC duct"
  description: string;
  ruleSetId: string;                       // groups rules into named sets
  type: ClashType;                         // see §2.5
  selectorA: ElementSelector;              // which elements participate as side A
  selectorB: ElementSelector;              // which elements participate as side B
  tolerance: number;                       // metres — geometry intersection tolerance
  clusteringTolerance: number;             // metres — for stable guid hashing per §1.1
  clearancePolicy?: string;                // for soft clashes — policy id (§1.13)
  workflowCheck?: WorkflowCheckSpec;       // for workflow clashes — sequencing constraint
  defaultSeverity: 'critical' | 'major' | 'minor';
  targetFalsePositiveRate: number;         // 0..1, per §1.2
  enabledByDefault: boolean;
  status: 'production' | 'beta' | 'needs_tuning';
}

interface ElementSelector {
  elementTypes?: string[];                 // e.g. ['wall', 'beam']
  disciplines?: string[];                  // e.g. ['structure']
  ifcClasses?: string[];                   // e.g. ['IFCBEAM']
  classifications?: string[];              // Uniclass / Omniclass / Pset_*
  predicate?: string;                      // optional Zod-validated DSL expression
}

interface WorkflowCheckSpec {
  kind: 'sequencing' | 'access' | 'precedence';
  // e.g. { kind: 'sequencing', earlierTask: 'pour-slab', laterTask: 'set-stud-wall' }
  params: Record<string, unknown>;
}
```

### §2.2 — `ClashResult`

A single detected clash.

```typescript
interface ClashResult {
  guid: string;                            // stable hash per §1.1
  sessionId: string;
  ruleId: string;
  type: ClashType;                         // §2.5
  severity: 'critical' | 'major' | 'minor';
  elements: [ElementRef, ElementRef];      // (A, B), sorted by element.guid
  location: { x: number; y: number; z: number }; // centroid, world coords (LTP-ENU)
  overlapVolumeM3?: number;                // hard clashes only
  clearanceShortfallM?: number;            // soft clashes only — actual − required
  workflowViolation?: string;              // workflow clashes only — human description
  detectedAt: string;                      // ISO 8601
  originatingDisciplines?: [string, string]; // §1.7
}

interface ElementRef {
  guid: string;                            // PRYZM element id
  ifcGlobalId?: string;                    // for federated members
  federationMemberId: string;              // which model contributed this element
  elementType: string;
  discipline: string;
}
```

### §2.3 — `ClashSession`

A configured detection run.

```typescript
interface ClashSession {
  guid: string;
  name: string;
  ruleSetId: string;
  federationMembers: FederationMember[];
  clearancePolicySnapshot: Record<string, ClearanceEntry>; // frozen per §1.13
  startedAt: string;
  completedAt?: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  results: string[];                       // ClashResult.guid[] — append-only
  metrics: {
    elementCount: number;
    pairsTested: number;
    durationMs: number;
    falsePositiveRate?: number;            // measured if benchmark fixture
  };
}

interface FederationMember {
  memberId: string;                        // human label, e.g. "structure-rev-12"
  source: 'pryzm-native' | 'ifc-import' | 'revit-link' | 'dwg-link';
  contentHash: string;                     // SHA-256 per §1.12
  discipline: string;                      // architectural | structural | mep | …
  importedAt: string;
}

interface ClearanceEntry {
  policyId: string;
  minClearanceM: number;
  appliesTo: ElementSelector;
}
```

### §2.4 — `Issue`

The lifecycle-wrapped clash. One `Issue` per `ClashResult.guid`, but an issue MAY group multiple co-located results (deduplication via `linkedIssueId`).

```typescript
interface Issue {
  guid: string;                            // matches ClashResult.guid on first creation
  title: string;                           // human title — usually rule name + element refs
  description: string;
  clashResultGuids: string[];              // ≥ 1; multiple if clustered
  state: 'open' | 'in-review' | 'resolved' | 'approved';
  assignedTo?: string;                     // user email / id
  dueDate?: string;                        // ISO 8601
  priority: 'critical' | 'high' | 'normal' | 'low';
  severity: 'critical' | 'major' | 'minor';
  originatingDisciplines?: [string, string]; // §1.7
  resolution?: Resolution;                 // populated on → resolved
  approval?: Approval;                     // populated on → approved
  comments: IssueComment[];
  viewpointBcfGuids: string[];             // links to BCF viewpoints (camera + markup)
  relatedIssues: string[];                 // cross-references
  createdAt: string;
  modifiedAt: string;
  history: TransitionEvent[];              // append-only audit trail
}

interface Resolution {
  modificationCommitId?: string;           // §1.6
  markupId?: string;                       // §1.6
  linkedIssueId?: string;                  // §1.6
  resolvedBy: string;
  resolvedAt: string;
  notes?: string;
}

interface Approval {
  approvedBy: string;
  approvedAt: string;
  notes?: string;
}

interface IssueComment {
  guid: string;
  author: string;
  date: string;
  body: string;
  parentGuid?: string;                     // reply chain
  viewpointBcfGuid?: string;
}

interface TransitionEvent {
  from: IssueState;
  to: IssueState;
  by: string;
  at: string;
  reason?: string;
}
```

### §2.5 — `ClashClassification` matrix

The single source of truth for severity defaults (§1.11). Per-rule overrides MUST reference a row.

| ClashType | Discipline-pair | Default severity | Rationale |
|---|---|---|---|
| `hard.volume-overlap` | structure × structure | critical | model integrity; cannot build |
| `hard.volume-overlap` | structure × mep | critical | rework cost very high downstream |
| `hard.volume-overlap` | mep × mep | major | reroute possible |
| `hard.volume-overlap` | architecture × mep | major | finishes affected |
| `hard.volume-overlap` | architecture × architecture | major | usually a modelling slip |
| `hard.surface-contact` | any × any | minor | touches but no penetration |
| `soft.clearance-violation` | structure × mep | major | maintenance access |
| `soft.clearance-violation` | mep × mep | minor | optional — depends on code |
| `soft.clearance-violation` | architecture × egress | critical | code mandate |
| `workflow.sequencing` | any × any | major | build-order conflict |
| `workflow.access` | any × any | major | constructability |
| `workflow.precedence` | any × any | minor | warning, not blocker |

`ClashType` enum: `hard.volume-overlap` · `hard.surface-contact` · `soft.clearance-violation` · `workflow.sequencing` · `workflow.access` · `workflow.precedence`.

---

## §3 — Stores / API surface

### §3.1 — `ClashStore` (state — runtime)

Lives at `packages/clash-engine/src/store.ts`. Holds the live session map and result index.

```typescript
interface ClashStoreState {
  sessions: Record<string, ClashSession>;
  results: Record<string, ClashResult>;
  resultsBySession: Record<string, string[]>;  // sessionId → resultGuid[]
  resultsByElement: Record<string, string[]>;  // elementGuid → resultGuid[]
  ruleSets: Record<string, ClashRuleSet>;
  clearancePolicies: Record<string, ClearancePolicy>;
  activeSessionId?: string;
}
```

Reads via `useClashStore(...)` (Zustand selectors). Writes ONLY via commands (P6).

### §3.2 — `IssueStore`

Lives at `packages/clash-engine/src/issueStore.ts`. Issues are independent of sessions (they outlive the session that birthed them).

```typescript
interface IssueStoreState {
  issues: Record<string, Issue>;
  issuesByClashResult: Record<string, string>;  // clashResultGuid → issueGuid
  issuesByState: Record<IssueState, string[]>;
  issuesByAssignee: Record<string, string[]>;
}
```

### §3.3 — `ClashEngine`

Pure functional engine in `packages/clash-engine/src/engine.ts`. Public surface:

```typescript
/** Runs a configured clash session — pure given fixed inputs (§1.1). */
export function runClashSession(input: {
  session: ClashSession;
  ruleSet: ClashRuleSet;
  modelSnapshot: FederatedModelSnapshot;
  spatialIndex: SpatialGridIndex;          // from packages/spatial-index
}): { results: ClashResult[]; metrics: SessionMetrics };

/** Tests a single (rule, elementA, elementB) triple — building block. */
export function testClashPair(
  rule: ClashRule,
  a: ElementSnapshot,
  b: ElementSnapshot,
  index: SpatialGridIndex,
): ClashResult | null;

/** Clusters near-coincident results per rule's clusteringTolerance (§1.1). */
export function clusterResults(results: ClashResult[]): ClashResult[];
```

Geometry intersection uses three-bvh (already vendored by `packages/spatial-index/`). The engine MUST NOT depend on THREE directly (P2) — BVH access goes through `packages/spatial-index/`'s `BVHQuery` facade.

### §3.4 — `IssueLifecycle`

Lives at `packages/clash-engine/src/lifecycle.ts`. Public surface:

```typescript
/** The static allowed-edges set — §1.5 single source of truth. */
export const ALLOWED_TRANSITIONS: ReadonlyArray<readonly [IssueState, IssueState]>;

/** Computes the next valid issue after a transition; throws on invalid edge. */
export function applyTransition(
  issue: Issue,
  to: IssueState,
  payload: TransitionPayload,
): Issue;

/** Validates a resolution payload per §1.6. */
export function validateResolution(
  issue: Issue,
  resolution: Resolution,
  ruleResult: ClashResult,
  modelSnapshot: FederatedModelSnapshot,
): { ok: true } | { ok: false; code: string; message: string };
```

### §3.5 — `BcfRoundTrip`

Lives at `plugins/bcf/src/clash-bridge.ts` (NEW — extends the existing plugin). Public surface:

```typescript
/** Exports a set of issues to a BCF archive — preserves §1.3 fields. */
export function issuesToBcfArchive(input: {
  issues: Issue[];
  project: BCFProject;
  ifcResolver: BCFIfcResolver;
}): BCFArchive;

/** Imports a BCF archive into the issue model — preserves §1.3 fields. */
export function bcfArchiveToIssues(input: {
  archive: BCFArchive;
  ifcResolver: BCFIfcResolver;
  existingIssues: Issue[];                 // for merge-by-guid
}): { created: Issue[]; updated: Issue[]; skipped: BCFTopic[] };
```

The bridge reuses `plugins/bcf/`'s deterministic `writeBCF` / `readBCF` (Sprint S59). C36 adds the issue ↔ topic mapping; C36 does NOT re-implement the format.

---

## §4 — Commands

Per [C03](C03-SCHEMAS-COMMANDS-AND-STATE.md) + [C16](C16-COMMAND-AUTHORING-PROTOCOL.md). All commands registered with `commandBus.register(...)` and dispatched via `commandBus.dispatch(...)`. Each emits its own OTel span (§1.4).

| Command id | Payload | Effect | Undoable |
|---|---|---|---|
| `clash.runSession` | `{ name, ruleSetId, federationMemberIds, clearancePolicyId? }` | Snapshots federation members (§1.12), freezes clearance policy (§1.13), runs engine, persists `ClashSession` + all `ClashResult`s, creates `open` `Issue`s deduplicated by `(ruleId, elementA, elementB)`. | No (history is append-only audit) |
| `clash.markResolved` | `{ issueId, resolution: Resolution }` | Validates resolution per §1.6 (re-runs rule for the modificationCommitId case), transitions issue to `resolved`. | Yes (transitions back via reverse edge) |
| `clash.transition` | `{ issueId, to: IssueState, payload?: { reason?, notes? } }` | Validates edge per §1.5; rejects invalid. Emits `pryzm.clash.transition` span. | Yes |
| `clash.assignTo` | `{ issueId, userId, dueDate? }` | Sets `assignedTo` + `dueDate`. Routes the issue into the assignee's queue. | Yes |
| `clash.addComment` | `{ issueId, body, parentGuid?, viewpointBcfGuid? }` | Append comment to the issue's chain. Comments are append-only — never deleted, only superseded. | No |
| `clash.exportBcf` | `{ issueIds, projectMeta, ifcResolver }` | Calls `issuesToBcfArchive(...)`, then `plugins/bcf` `writeBCF(...)`, returns archive bytes. Surfaces as a download or upstream to BIMcollab API. | No |
| `clash.importBcf` | `{ archiveBytes, ifcResolver }` | Calls `plugins/bcf` `readBCF(...)`, then `bcfArchiveToIssues(...)`, then fans out `issue.create` / `issue.update` per result. | No |
| `clash.linkIssues` | `{ issueId, linkedIssueId }` | Records a `relatedIssues` cross-reference both ways. | Yes |
| `clash.deleteSession` | `{ sessionId, retainIssues: boolean }` | Removes the session + results; if `retainIssues`, issues stay (their `clashResultGuids` become orphan, surfaced as a warning). | Yes (soft-delete; full delete is a separate admin command) |

Per [C16 §CA-7] (semantic-first), human-facing labels for the panel come from a per-command `meta.label` field, not from command id strings.

---

## §5 — UI

### §5.1 — Clash Browser panel

A new editor panel (`apps/editor/src/ui/panels/ClashBrowserPanel.tsx`), registered as a workspace dock.

Layout:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Sessions ▾ │ Rules ▾ │ Run ▶ │ Export BCF │ Import BCF │ Filter…   │
├─────────────────────────────────────────────────────────────────────┤
│ Tree:                              │ Result detail:                   │
│  ▾ session: "S4 — full federation" │  Rule: Beam × Duct overlap       │
│    ▾ critical (12)                 │  Elements:                       │
│      ▸ Beam B-12 × Duct D-44       │   A: Beam B-12 (structure-rev-12)│
│      ▸ Beam B-18 × Duct D-44       │   B: Duct D-44 (mep-rev-7)       │
│    ▾ major (47)                    │  Severity: critical              │
│    ▾ minor (203)                   │  Issue state: open               │
│                                    │  Comments (3) ▼                  │
│                                    │  [Isolate] [Assign…] [Resolve…]  │
└─────────────────────────────────────────────────────────────────────┘
```

- Tree groups by `(session, severity, ruleId)` by default; toggle to group by `(discipline-pair, status, assignee)`.
- Clicking a clash row dispatches `inspect.focusElement` for both elements, then dispatches `ClashIsolationVisibilityIntent` (§1.8 — routed through `packages/visibility/`, NOT direct opacity writes).
- The viewport zooms to the clash location + sets a temporary marker (red glow for critical, amber for major, yellow for minor).

### §5.2 — Issue list (cross-cuts the Data panel)

A new view in `apps/editor/src/ui/panels/DataPanel.tsx` (per [C28](C28-DATA-PANEL-AND-AUTOMATION.md)): a tabular issue grid bound to `IssueStore`, with the columns: `id, title, state, severity, assignee, dueDate, originatingDisciplines, lastComment`. Editable cells dispatch `clash.assignTo` / `clash.transition` (P6).

### §5.3 — BCF viewer integration with C27 isolation

Importing a BCF whose topics reference camera viewpoints opens the C27 Inspect panel with an "Imported BCF" provisional branch in the model tree:

```
▾ Project / Site
  ▾ Imported BCF: solibri-2026-06-01.bcfzip
    ▸ Topic: "Structural beam vs HVAC duct"
    ▸ Topic: "Door swing into corridor"
```

Selecting a topic isolates the referenced components (per BCF `components.selection`) via [C27 §1.3](C27-BIM3-INSPECT-MODEL.md)'s `IsolationVisibilityIntent`. The camera animates to the viewpoint's `cameraViewPoint` / `cameraDirection` / `cameraUpVector` over 400 ms via the frame scheduler (P3).

### §5.4 — Markup overlay

For issues in `in-review` or `resolved` state, the viewport overlays the BCF markup (lines, arrows, text) above the 3D scene. The overlay is a 2D `<canvas>` sized to the active viewport. Markup data is read from the topic's viewpoint snapshot delta, NOT from raster — vector overlay only.

---

## §6 — Tests / CI gates

### §6.1 — Unit / engine tests

Lives at `packages/clash-engine/__tests__/`:

| Suite | Scope |
|---|---|
| `engine.test.ts` | `runClashSession`, `testClashPair`, `clusterResults` over hand-crafted geometry fixtures (beam × duct, slab × pipe, wall × wall, swept volumes). |
| `determinism.test.ts` | Runs the same fixture session twice, asserts result-set + order are identical (§1.1). |
| `lifecycle.test.ts` | Every legal + every illegal transition; `validateResolution` rejects each illegal evidence shape (§1.5, §1.6). |
| `severity.test.ts` | Every cell of the §2.5 matrix is exercised. |
| `false-positive-rate.test.ts` | Each shipped rule runs against its benchmark fixture; measured FP rate compared to declared target (§1.2). |
| `clash-bridge.test.ts` | Lives at `plugins/bcf/__tests__/clash-bridge.test.ts`. Round-trip fixture: issues → archive → issues; asserts §1.3 field preservation. |

### §6.2 — CI gates (planned + new)

| Gate | What it checks |
|---|---|
| `tools/ga-gate/check-clash-determinism.ts` | Runs `determinism.test.ts` fixtures in CI as a separate gate (cannot be disabled per-package). |
| `tools/ga-gate/check-bcf-roundtrip-fidelity.ts` | Round-trip benchmark over 50 fixture issues + a real BIMcollab-exported sample. |
| `tools/ga-gate/check-issue-state-machine.ts` | Static-analyses every `clash.transition` call-site; replays every fixture history. |
| `tools/ga-gate/check-clash-rule-fp-rate.ts` | Re-runs the benchmark from `false-positive-rate.test.ts`; fails if any production-status rule exceeds its declared target. |
| `tools/ga-gate/check-clash-spans.ts` | Asserts every public export in `packages/clash-engine/` + `plugins/bcf/src/clash-bridge.ts` opens an OTel span (extends the existing `check-spans.ts`). |
| `tools/ga-gate/check-visibility-intent.ts` | Already exists for C27; C36 adds `ClashIsolationVisibilityIntent` to its allowlist; direct `material.opacity` writes outside the intent path remain forbidden. |

---

## §7 — NFT targets

Per [C10](C10-PERFORMANCE-AND-OBSERVABILITY.md) (observability + budgets):

| Metric | Target | Measured by |
|---|---|---|
| `runClashSession` over a 100 k-element federated model | < 30 s on reference hardware (M2 Pro, 16 GB) | `packages/clash-engine/__benchmarks__/100k.bench.ts` |
| `runClashSession` over 10 k elements | < 3 s | same suite |
| BCF round-trip (export 200 issues + re-import) | < 1 s combined | `plugins/bcf/__benchmarks__/roundtrip.bench.ts` |
| First clash result visible in panel after `runSession` start | < 200 ms (streaming results — engine emits partial results as ruleset progresses) | E2E playwright spec |
| Memory ceiling during 100 k-element session | < 1 GB heap delta | benchmark + `--expose-gc` measurements |
| Clash count → Issue creation throughput | ≥ 5 000 issues / s sustained | `IssueStore.bench.ts` |
| Per-issue OTel span overhead | < 0.5 ms p99 | tracer benchmark |

Streaming partial results is normative: the engine MUST emit `ClashResult`s as they are detected (one event per rule completion at minimum), not batch-at-end. This is what makes the `< 200 ms first-paint` target achievable for large federations.

---

## §8 — Migration plan

C36 is greenfield for the **workflow engine** but rides on the existing `plugins/bcf/` format implementation. Phases:

### §8.1 — Phase Clash-α-1: package scaffolding

Create `packages/clash-engine/` (depends on `packages/schemas/`, `packages/spatial-index/`, `packages/command-bus/`). Wire OTel tracer. Add the §6.2 gates (initially soft-fail per [C31 §5](C31-DOCUMENTATION-AUTHORING-PROTOCOL.md)).

### §8.2 — Phase Clash-α-2: schemas in `packages/schemas/`

Add `packages/schemas/src/clash/{rule,result,session,issue}.ts`. CI gate confirms zero I/O / THREE / DOM imports (P5).

### §8.3 — Phase Clash-β-1: hard-clash engine (`hard.volume-overlap`)

Implement `runClashSession` + `testClashPair` + `clusterResults` for the `hard.volume-overlap` type. Wire `ClashStore`. Add the engine determinism gate. Ship 8 production-status rules: structure × structure / structure × mep / mep × mep / arch × mep / arch × arch (each as a built-in `ClashRule`).

### §8.4 — Phase Clash-β-2: lifecycle + commands

Implement `IssueLifecycle` + `IssueStore`. Register all §4 commands on `commandBus`. Wire `applyTransition` + `validateResolution`. Add the state-machine gate.

### §8.5 — Phase Clash-β-3: BCF bridge

Add `plugins/bcf/src/clash-bridge.ts` — `issuesToBcfArchive` + `bcfArchiveToIssues`. Reuse `writeBCF` / `readBCF` from the existing plugin surface (S57 + S59). Add the round-trip-fidelity gate.

### §8.6 — Phase Clash-β-4: Clash Browser panel + Issue grid + BCF viewer

Build §5.1 + §5.2 + §5.3 + §5.4 UI surfaces. Wire `ClashIsolationVisibilityIntent` into `packages/visibility/`. Add the visibility-intent gate extension.

### §8.7 — Phase Clash-γ-1: soft-clash engine (`soft.clearance-violation`)

Implement `ClearancePolicy` documents + frozen-snapshot logic (§1.13). Ship 6 production-status rules for structure × mep / arch × egress / mep × mep clearance defaults. Calibrate FP-rate target per rule.

### §8.8 — Phase Clash-γ-2: workflow-clash engine

Implement `workflow.sequencing` / `workflow.access` / `workflow.precedence`. Requires a `TaskSchedule` model (out of C36 scope; cross-link to a future construction-sequencing contract).

### §8.9 — Phase Clash-γ-3: federation hashing + Solibri / Navisworks / BIMcollab interop

Real-world round-trip benchmark: export an issue set, import it into Solibri Model Checker / Navisworks / BIMcollab Zoom, verify all §1.3 fields visible; re-import. The benchmark MUST pass for at least Solibri + one of {Navisworks, BIMcollab} before declaring C36 CANONICAL.

---

## §9 — What is NOT in this contract

- **BCF 3.0 format details** — `plugins/bcf/` owns the codec (S57 + S59 — multi-viewpoint, components, AssignedTo / DueDate / Stage, byte-deterministic writer, IFC GlobalId resolver). C36 governs the workflow above the format; format additions go through the plugin.
- **IFC interop + import / export** — see [C25](C25-IFC-EXPORT-PRODUCTION.md). The federation snapshot relies on IFC for non-PRYZM-native members; the IFC contract owns the bytes.
- **Revit round-trip** — see [C26](C26-REVIT-ROUND-TRIP.md). Revit-side BCF is reachable via the same plugin surface.
- **DXF / DWG link members** — see [C32](C32-DXF-DWG-ROUND-TRIP.md) (when ratified). DWG-as-federation-member is a Clash-γ-2-or-later scope.
- **Inspect tree** — see [C27](C27-BIM3-INSPECT-MODEL.md). The Clash Browser shares the tree component (§1.2 of C27 — one model-tree component repo-wide).
- **Visibility intent mechanics** — see [C09 §6](C09-AI-AND-VISIBILITY-INTENT.md). C36 dispatches a new intent kind (`ClashIsolationVisibilityIntent`); the intent system + commit pathway are owned upstream.
- **Sheet annotation of resolved clashes** — see [C30](C30-DRAWING-SET-MANAGEMENT.md) (coordination drawings).
- **Construction sequencing** — workflow clashes reference a `TaskSchedule` model whose schema is OUT of C36 scope. A future construction contract owns it.
- **Project-level coordination calendar / meeting workflows** — out of scope. Issues carry `dueDate` and `assignedTo`; the surrounding scheduling product surface (notifications, weekly digests) is a separate marketplace plugin.
- **AI-flagged auto-clashes** — see open question Q3 below. The current C36 surface is rule-driven; AI-generated rules / AI-classified results are explicit future scope.

---

## §10 — Open questions

### §Q1 — Server-side vs client-side clash execution

For 100 k-element federations the perf budget (§7) is at the edge of single-thread browser feasibility. Options:

- **A — client-only**: ship the engine inside the editor; offer a worker fallback. Pro: zero infra cost. Con: large models thrash; phone / tablet support unrealistic.
- **B — opt-in server**: the editor ships a worker engine but exposes a "Run on server" button that POSTs the federation snapshot to a cloud worker. Pro: scales to 1 M-element federations; mirrors Solibri Cloud. Con: requires per-tenant ingest pipeline + content-addressed model storage.
- **C — server-only**: clash sessions are a paid backend feature; client only renders results. Pro: predictable perf. Con: gates a core competency behind a paywall.

Recommendation pending; an ADR will be raised when phase Clash-β-1 lands and benchmarks expose the breakpoint.

### §Q2 — Multi-team coordination workflow

When two firms share a federation (e.g. structural engineer + MEP consultant + main architect), the issue assignee crosses tenant boundaries. Open subquestions:

- Does an issue assigned cross-tenant create a notification in the other tenant's editor session, or only on BCF export?
- Who owns the canonical `IssueStore` — the architect's project, the structural firm's, or a shared neutral broker (Solibri-style cloud)?
- How does undo work when one tenant resolves an issue another tenant raised?

This intersects [C08 collaboration](C08-COLLABORATION-AND-SECURITY.md) and is queued for a joint C08 + C36 ADR.

### §Q3 — AI-flagged auto-clashes

LLM-classified clashes (e.g. "this looks like a coordination problem but no rule fires") are tempting — they'd surface human-noticeable issues that rule sets miss. Open subquestions:

- Does the AI produce a candidate `ClashRule` (and ship it through the rule-tuning workflow) or a candidate `Issue` (and rely on a human to classify)?
- How is the false-positive rate target (§1.2) measured for a stochastic source?
- Where does the AI surface in the lifecycle — does it create `open` issues directly, or is there a new `proposed` state in front of `open`?
- Cross-link to [C09 AI & Visibility Intent](C09-AI-AND-VISIBILITY-INTENT.md) — AI-host plane is the surface for any new workflow plane.

A `proposed` state in front of `open` is the leading proposal; deferred to a follow-up ADR.

---
