# SPEC-11 — Testing Strategy

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B11` |
| Phases | 1A (frameworks ratified), 1B (unit + integration enforced), 1D (visual + concurrent + a11y), 3D (chaos + perf-regression at scale) |

> Existing testing plan was unit + integration only. This spec adds property tests, concurrent-edit tests, visual regression, accessibility, and a chaos / perf-regression harness. Each layer gets the right kind of test.

---

## §1 The seven test kinds

| # | Kind | Tool | Where | Runs on |
|---|---|---|---|---|
| 1 | Unit | Vitest | `packages/<lib>/__tests__/` | every PR |
| 2 | Property | fast-check + Vitest | `packages/<lib>/__tests__/property/` | every PR |
| 3 | Integration | Vitest with real Postgres + R2-emulator (testcontainers / minio) | `apps/<svc>/__tests__/integration/` | every PR |
| 4 | E2E | Playwright | `apps/editor/e2e/` | every PR (smoke), nightly (full) |
| 5 | Visual regression | Playwright + Argos / Percy | `apps/editor/e2e/visual/` | every PR |
| 6 | Concurrent | Vitest with 2+ Y.Doc clients in-process | `packages/sync/__tests__/concurrent/` | every PR |
| 7 | Accessibility | axe-core via Playwright | `apps/editor/e2e/a11y/` | nightly + every PR for changed components |

Plus three "outer" loops:

| # | Kind | Tool | Where | Runs on |
|---|---|---|---|---|
| 8 | Performance regression | Custom bench harness, baseline persisted | `apps/bench/` | nightly + on demand |
| 9 | Chaos | Toxiproxy + custom orchestrator | `apps/chaos/` | weekly |
| 10 | Pen test | Third-party (annual) | external | annually |

---

## §2 Unit tests (kind #1)

### §2.1 Scope
- One `*.test.ts` per source file.
- Pure functions: input → output assertions.
- Mocks limited to other layers (a kernel test never mocks other kernel functions; it tests them or doesn't test them).

### §2.2 Coverage targets (closes B11 gap "no coverage gates")
| Layer | Statement coverage | Branch coverage | Why |
|---|---|---|---|
| L0 Persistence | 90% | 80% | data loss risk |
| L1 Stores | 95% | 90% | source of truth |
| L2 Command Bus | 95% | 90% | every state change |
| L3 Sync | 90% | 85% | concurrent correctness |
| L4 Kernel | 95% | 90% | math correctness |
| L5 Renderer | 60% | — | mostly visual; covered by visual regression |
| L6 Plugin Host | 90% | 80% | sandbox invariants |
| L7 Presentation | 70% | 60% | covered by E2E |
| L7.5 AI | 80% | 70% | reproducibility |

CI gate: PR fails if coverage drops below the layer threshold for the touched files.

---

## §3 Property tests (kind #2; closes B11 gap "no property tests")

### §3.1 Where required
- All kernel public functions: SPEC-01 §3.1.
- Type-catalog parameter resolution.
- Schedule formula evaluation.
- DXF/PDF round-trip identity.
- Migration round-trip (`v1 → v2 → v1` is identity for fields v1 understands).

### §3.2 Generators live in `packages/<lib>/__tests__/property/generators.ts` and are reused.

### §3.3 Determinism
- fast-check seed is committed in failing-case repro files.
- CI runs with stable seed for reproducibility; weekly run uses random seed to catch new edge cases.

---

## §4 Integration tests (kind #3)

### §4.1 What's "integration"
- Real Postgres (testcontainers).
- Real R2 (MinIO container).
- Real Yjs server in-process.
- Multiple workers (sync, bake, AI) wired up.

### §4.2 What's tested
- Event-log → projection → committer round-trip per element family.
- Save → close → reopen identity.
- Multi-user single-room scenarios (2 clients in-process).
- Bake worker idempotency (re-run same job; no duplicate side effects).

### §4.3 Test isolation
- Per-test schema in Postgres; teardown drops schema.
- Per-test bucket prefix in MinIO.
- No shared state across tests.

---

## §5 E2E tests (kind #4)

### §5.1 Smoke set (every PR, < 5 min)
- Boot → create project → place wall → save → reload → still there.
- Boot → open existing project → frame within 1.5 s.
- Boot → trigger AI inspector → answer surfaces.

### §5.2 Full set (nightly, ~30 min)
- Each first-party tool's happy path.
- Each first-party plugin's happy path.
- Multi-user (two browser contexts in same Playwright run).
- Save, export PDF, export DXF, export IFC.
- Permission denial scenarios.
- Plugin install / activate / disable.

---

## §6 Visual regression (kind #5; closes B11 gap "no visual regression for plan view")

### §6.1 What
- Per-element committer test: render in isolation; compare PNG to baseline.
- Per-view test: a 5,000-element fixture rendered in plan, section, elevation; compare PNGs.
- Drawing-engine tests: vector primitives drawn to Canvas2D + SVG + PDF; compare.

### §6.2 Tooling
- Playwright captures screenshots.
- Argos (or Percy) for diff review with reviewer UI.
- Tolerances: 0.1% pixel diff for vector outputs; 1% for PBR-rendered scenes (LOD-driven).

### §6.3 The "plan view diff" gate
- A baseline plan-view rendering of the canonical 5,000-element fixture is committed.
- Any PR that changes the rendering by > 1% pixels of any view requires explicit reviewer approval ("yes, this is the new look").
- Catches accidental regressions in line weight, dash phase, hatch alignment.

---

## §7 Concurrent tests (kind #6; closes B11 gap "no concurrent test harness")

### §7.1 In-process N-client harness
```ts
// packages/sync/__tests__/concurrent/harness.ts
async function withClients(n: number, fn: (clients: TestClient[]) => Promise<void>) {
  const clients = Array.from({ length: n }, () => new TestClient());
  const server = new TestSyncServer();
  await Promise.all(clients.map(c => c.connect(server)));
  try { await fn(clients); } finally {
    await Promise.all(clients.map(c => c.disconnect()));
    await server.shutdown();
  }
}
```

### §7.2 Required scenarios
- Two clients edit same field of same element → expected LWW winner; merge log entry.
- Three clients edit different fields → all win.
- Client A deletes wall, client B inserts door → orphaned-host flag set.
- Client A offline 5 minutes, makes 100 edits, reconnects → all events merge; merge log accurate.
- 10 clients each create 100 walls in parallel → all 1000 walls present after convergence.
- 50 clients in same room → presence list accurate; no awareness storms.

### §7.3 Performance under concurrency
- Bench: 50 clients, 10 edits/s each, 60 s run; assert p95 broadcast lag < 250 ms.

---

## §8 Accessibility (kind #7; closes B11 gap "no a11y suite")

### §8.1 Scope
- All UI panels: WCAG 2.1 AA conformance.
- Keyboard-only navigation: every action reachable.
- Screen-reader: meaningful labels for icons, modals, list items.
- Color contrast: AAA on chrome, AA on body.

### §8.2 Tooling
- axe-core via Playwright on every panel.
- Manual screen-reader test (NVDA + VoiceOver) before each milestone.

### §8.3 What's not in scope (v1)
- Full canvas accessibility (dimensional model is inherently visual). Provide a parallel "structured outline" view for screen readers — Phase 3D.

---

## §9 Performance regression (kind #8)

### §9.1 Bench harness
- `apps/bench/` runs every bench listed in `08-VISION §6` and SPEC-01 §8 / SPEC-04 §11.
- Each bench writes a JSON result with `(metric, p50, p95, p99)`.
- Baseline lives in `apps/bench/baselines/main.json`, updated by promotion script.

### §9.2 PR workflow
- Every PR runs the smoke bench set (~5 min).
- If any p95 regresses by > 10% vs baseline, PR is flagged for review.
- Reviewer can accept the regression (with justification) or block.

### §9.3 Nightly
- Full bench set on a dedicated runner.
- Trend graph in dashboard.

---

## §10 Chaos (kind #9; closes B11 gap "no chaos harness")

### §10.1 Network chaos
- Toxiproxy injects: 30% packet loss, 1000 ms latency, transient disconnect.
- Run E2E suite under each.
- Assert: no data loss, all clients converge after recovery.

### §10.2 Service chaos
- Kill `bake-worker` mid-job → next job picks up; no duplicate writes.
- Kill `sync-server` mid-broadcast → clients reconnect; merge resolved.
- Postgres failover → reads continue; writes resume after failover; no event-log gaps.

### §10.3 Cadence
- Weekly automated run.
- Quarterly "Game Day" — manual chaos against staging with all engineers present.

---

## §11 CI orchestration

### §11.1 PR-blocking gates
- Lint (boundaries, no-rAF, no-window-any).
- Unit + property + integration (per-layer thresholds).
- Smoke E2E.
- Visual regression (≤ 1% pixel diff or explicit approval).
- Bundle size (Contract 18).
- Smoke bench (no > 10% regression).

### §11.2 Nightly
- Full E2E.
- Full bench.
- Chaos.
- Coverage report → dashboard.

### §11.3 Quarterly
- Pen test (external).
- Threat-model review.
- A11y audit (third-party).

---

## §12 Test data

### §12.1 Fixtures
- `__fixtures__/small-house/` — 50 elements; used by smoke tests.
- `__fixtures__/medium-office/` — 500 elements; used by integration tests.
- `__fixtures__/large-mixed/` — 5,000 elements; used by bench + visual regression.
- `__fixtures__/torture/` — 50,000 elements; used by stress tests only.

### §12.2 Generation
Fixtures are committed `.pryzm` files generated once by `apps/scripts/generate-fixtures.ts`. Regeneration is manual; bumping a fixture requires explicit reviewer ack on the new visual baselines.

---

## §13 Phase rollout

| Sprint | Deliverable |
|---|---|
| S01 | All test runners installed. Property test harness set up. |
| S03 | Coverage gate active per-layer (warning). |
| S04 | Coverage gate flips to error. |
| S08 | Concurrent-test harness in `packages/sync/`. Visual regression set up for first-party committers. |
| S22 (M12 alpha) | Smoke E2E covers Alpha demo paths. |
| S43–S48 (Phase 2D) | Full multi-user concurrent test suite. |
| S55 | A11y suite covering all surfaced panels. |
| S64 | Chaos harness running weekly. |
| S72 (M36 GA) | Annual pen test passed; quarterly Game Day cadence established. |

---

## §14 Cross-references
- Layer-specific test requirements: each subsystem SPEC.
- Bench gates: `08-VISION §6`.
- Visual baseline policy: §6.3.
- Phases: across the board; key gate at M12 (smoke E2E), M24 (multi-user), M36 (full suite).
