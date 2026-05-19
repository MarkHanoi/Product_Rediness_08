# Architecture Decision Records

PRYZM 2 ADRs follow [Michael Nygard's template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
Numbering is **monotonic** — once an ADR has a number it never moves; if it
is superseded, a new ADR cites it as `Supersedes: 0001`.

| ID | Title | Status | Sprint | Date |
|---|---|---|---|---|
| 0001 | [Typed-ID brand strategy](./0001-typed-id-brand-strategy.md) | Accepted | S01 | 2026-04-26 |
| 0002 | [Command handler signature](./0002-command-handler-signature.md) | Accepted | S02 | 2026-04-26 |
| 0003 | [Frame-scheduler API: `priority` vs `deadline`](./0003-frame-scheduler-priority-vs-deadline.md) | Accepted | S02 | 2026-04-26 |
| 0004 | [MessagePack codec choice](./0004-messagepack-codec-choice.md) | Accepted | S03 | 2026-04-26 |
| 0005 | [`PrimitiveCommitter<TStore>` interface](./0005-primitive-committer-interface.md) | Accepted | S04 | 2026-04-26 |
| 0006 | [Idle-continuation N-frame budget](./0006-idle-continuation-budget.md) | Accepted | S03 | 2026-04-26 |
| 0007 | [WebGPU/WebGL2 dual-mode strategy](./0007-webgpu-webgl2-dual-mode.md) | Accepted | S06 | 2026-04-26 |
| 0008 | [Wall handler triage (22 → 14)](./0008-wall-handler-triage.md) | Accepted | S07 | 2026-04-26 |
| 0009 | Producer pure-function signature | Accepted | S08 | 2026-04-26 |
| 0010 | Slab handler triage (12 → 8) + cross-coupling lift | Accepted | S12 | 2026-04-26 |
| 0011 | Curtain-wall handler triage (15 → 9) + 3-way producer split | Accepted | S12 | 2026-04-26 |
| 0012 | Cross-element cascade-rule registration (code-level) | Accepted | S10 | 2026-04-26 |
| 0013 | Wall intent resolver (code-level) | Accepted | S10 | 2026-04-26 |
| 0014 | [TRAA / SSGI under idle-continuation budget](./0014-traa-ssgi-idle-budget.md) | Accepted | S15 | 2026-04-27 |
| 0015 | [Picking strategy (gpu-pick default, BVH fallback)](./0015-picking-strategy.md) | Accepted | S16 | 2026-04-27 |
| 0016 | [View-state model (command-driven view switch)](./0016-view-state-command-driven.md) | Accepted | S17 | 2026-04-27 |
| 0017 | [Headless package surface](./0017-headless-package-surface.md) | Accepted | S18 | 2026-04-27 |
| 0018 | [`.pryzm` format v1 spec](./0018-pryzm-zip-format-v1.md) | Accepted | S20 | 2026-04-27 |
| 0019 | [Sync-server linearisation strategy](./0019-sync-server-linearisation.md) | Accepted | S22 | 2026-04-27 |
| 0020 | [Tier-streamed loader](./0020-tier-streamed-loader.md) | Accepted | S23 | 2026-04-27 |

> **Bake-coalescing window note.** The ledger originally reserved a
> slot for "Bake coalescing window (250 ms)" tied to S21.  The
> coalescing window was implemented in S21 but its rationale lives
> inline in `apps/bake-worker/src/Coalescer.ts` rather than as a
> standalone ADR.  When/if a future change challenges the 250 ms
> value, an ADR will be written and slotted at the next free
> number — we do **not** back-fill slots in this ledger
> (numbering is monotonic, see top of file).

> **Numbering note (2026-04-27).**  Slots 0012/0013 were claimed by the
> S10 code-level ADRs (cited in `packages/command-bus/src/cascade.ts`
> line 5 and `plugins/wall/src/intent.ts` line 3); the future-strategic
> entries shifted up by 2.  See `PROCESS-TRACKER.md §6` for the
> renumbering ledger.

The 12 pre-flight ADRs from `05-IMPLEMENTATION-PLAN.md §17` retain their
own numbering separate from the sprint ADRs above; pre-flight ADRs prefix
with `PF-` (e.g. `PF-001-monorepo-strategy.md`).
