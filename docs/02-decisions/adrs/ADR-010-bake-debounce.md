# ADR-010 — Bake Debounce Policy

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `05-IMPLEMENTATION-PLAN.md §17` row ADR-010 |
| Required by | Sprint S02 (Phase 1A — first wall bake on commit) |
| Owner | Architecture lead |
| Implementation | `packages/scene-committer/` debounce coordinator; `apps/bake-worker/` chunk job submission. |
| Spec dependency | `SPEC-01-GEOMETRY-KERNEL.md` §8, `SPEC-02-PERSISTENCE.md` §5 |

---

## Context

Every committed event triggers a chain: kernel re-bake → committer re-mesh → renderer upload → (optionally) chunk re-bake → R2 write. Without debouncing, dragging a wall handle for 800 ms produces ~50 commits, each chasing a complete bake/upload cycle — frame-rate dies.

`05-IMPLEMENTATION-PLAN.md §17` proposed "500 ms with override per command." `10-MASTER-IMPLEMENTATION-PLAN-36M.md` row ADR-010 amended this to "Per-element edit triggers per-chunk re-bake; 250 ms coalescing window." This ADR ratifies the amended position. The amendment is justified by perception research (250 ms is the threshold where users start to perceive lag) and by the fact that per-chunk granularity localises the bake cost.

---

## Decision

**Per-element edits coalesce on a 250 ms trailing window into per-chunk re-bake jobs. Interactive previews bypass debouncing.**

### Two paths (interactive vs durable)

```
                                                  in-flight per pointer drag
   Pointer drag ─────► L5 tool ─────► ghost-mesh ◄───────────────────────────────  (no commit, no debounce)
                              │
   Pointer up    ─────────────┴─────► L2 commit  ─────► event log + Y.Doc
                                                 │
                                                 ▼  scheduled into 250 ms window
                                                bake.chunk job per dirty chunk
                                                 │
                                                 ▼
                                                 R2 write + cache invalidation
```

- **Interactive preview (no debounce):** while the pointer is down, the L5 tool keeps a *ghost* mesh and updates it directly from kernel calls (sub-frame). No event is committed, no chunk is baked, no R2 write happens.
- **Pointer-up commits:** at the end of the gesture, the tool emits the canonical event(s). The committer schedules the affected chunks with a 250 ms trailing-edge debounce.

### Coalescing rules
- Trailing-edge: a new event resets the timer. Once 250 ms passes without further events affecting the same chunk, the bake job is enqueued.
- **Hard cap of 1500 ms:** if events keep arriving, force a re-bake every 1500 ms regardless. Prevents indefinite starvation during sustained AI batches.
- Per-chunk dirty-set: the dirty chunks union over the debounce window; one bake job per dirty chunk gets enqueued at debounce time.
- AI batches and importer events: the importer wraps its emissions in a *batch boundary*; the committer waits for the batch end + 250 ms before scheduling.

### Per-command override
- Some commands need immediate bake (no debounce). Examples:
  - View-template change: visual feedback expected within one frame.
  - Print/export trigger: no point waiting.
  - User-initiated "Re-bake all" command (debug action).
- The override is declarative, set on the command schema (`bakePolicy: 'immediate' | 'debounced'`), defaulting to `'debounced'`.

### Chunk granularity
- Chunks are spatial cells per SPEC-01 / `08-VISION §4`. Typical chunk holds ~50–500 elements.
- Per-element changes flag the owning chunk (and any chunks whose neighbouring boundary is affected by the element's bbox).
- Per-chunk bake = the renderer uploads a single buffer; far cheaper than per-element churn.

### Per-frame budgets
- Browser kernel-pool budget for bake jobs: 8 ms per frame (out of a 16.6 ms budget). Scheduler yields when exceeded.
- Chunk uploads are time-sliced: at most one chunk uploads per frame; queue drains across N frames.

---

## Consequences

**Positive:**
- Interactive editing remains buttery; ghost-mesh path is decoupled from durability.
- R2 writes are amortised (e.g. 50 drag events → ~1 chunk write).
- Frame-rate predictable during sustained edits.
- AI batches don't thrash the bake worker.

**Negative:**
- A 250 ms gap exists between commit and durable bake — relevant for tab-close races. Mitigation: a `beforeunload` flush forces all pending bakes to start immediately and an explicit "Saving..." indicator appears in the title bar.
- Debug ergonomics: developers expect "I clicked, bake should be done." Mitigation: dev console shows the debounce timer countdown.
- The hard cap (1500 ms) is empirical; revisit at S48 if AI batches blow it out.

---

## Alternatives considered

### 100 ms debounce
- Rejected: bake worker thrashes during sustained drags; CPU peaks ruin frame-rate.

### 500 ms debounce
- Rejected: users perceive lag; the "Saving..." indicator feels permanent during normal editing.

### 2000 ms debounce
- Rejected: unsafe — too much window for a tab close.

### No coalescing (per-event bake)
- Rejected: 50× the bake throughput; frame-rate collapses on simple drags.

### Leading-edge instead of trailing-edge
- Rejected: bakes the *first* state of a drag, throwing away the actual final state.

### Per-event vs per-chunk granularity
- Per-event was the Pascal pattern; rejected here because per-chunk localises the cost and matches our chunk-based renderer (`08-VISION §4`).

---

## Phase rollout
- S02 — committer coalescing scaffold; first wall bake on commit.
- S04 — ghost-mesh interactive path live for the wall tool.
- S08 — per-frame upload budget enforced; debug overlay shows debounce state.
- S21 (M11 alpha) — **server-side bake debounce shipped** in `apps/bake-worker/src/coalescing/CoalesceWindow.ts`.  See implementation log: `docs/04-reference/architecture-detail/bake-worker-impl-log.md`.
- S22 (M12 alpha) — `bakePolicy` declared on every command in the registry; immediate-mode commands work end-to-end.
- S43 — AI batch boundary integration with debounce.
- S48 (M24 beta) — hard cap revisited against AI workload telemetry; tuned if needed.
- S72 (M36 GA) — published "Saving..." UX; runbook for debugging debounce-related perceived bugs.

---

## Implementation log

| Sprint | Doc                                                                              |
|--------|----------------------------------------------------------------------------------|
| S21    | [`docs/04-reference/architecture-detail/bake-worker-impl-log.md`](../../architecture/bake-worker-impl-log.md) — first server-side coalescer; constants, decisions, test coverage. |
