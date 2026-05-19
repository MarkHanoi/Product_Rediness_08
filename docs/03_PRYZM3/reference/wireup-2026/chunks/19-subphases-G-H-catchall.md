# §16.7–§16.11  Sub-phase plan — Phase G (mass deletions) · H (lock-in) · catch-all sweep · cadence summary

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 2191–2272.

> **Additions since this chunk was sliced** (per [Chunk 26 §26.4](./26-plan-self-corrections.md#§264--amendment-d--32-new-sub-phases-are-orphaned-from-their-phase-chunks) banner approach):
>
> **Phase G — additional deletions** (was 9, now **24 sub-phases**):
> - **G.10–G.31** (22 deletions) — see [Chunk 24 §24.5](./24-pryzm1-src-coverage-audit.md#§245--new-sub-phases-summary-what-to-add-to-§16). One PR per legacy folder: `src/tools/`, `src/monetization/`, `src/import/`, `src/generative/`, `src/rendering/`, `src/cde/`, `src/export/`, `src/portfolio/`, `src/physics/`, `src/geospatial/`, `src/api/`, `src/snapping/`, `src/spatial/`, `src/topology/`, `src/structural/`, `src/migration/`, `src/collaboration/`, `src/constraints/`, `src/history/`, `src/render/`, `src/visibility/`, `src/furniture/`, `src/features/`. Each waits on the corresponding migration sub-phase from Phases B/C/D/E.
> - **G.32** — PRYZM 1 lights-out. Surfaced by [Chunk 25 §25.5](./25-architecture-docs-cross-alignment.md) (customer migration story). [Chunk 26 §26.8](./26-plan-self-corrections.md#§268--amendment-h--missing-deletion-ids-and-unspecified-checklists) enumerates 9 sub-items:
>   - **G.32.1** DNS cutover · **G.32.2** PRYZM 1 billing terminate · **G.32.3** auth-flag flip (PRYZM 1 read-only) · **G.32.4** customer data export endpoint live · **G.32.5** PRYZM 1 → PRYZM 2 migration runbook (per ADR-044) · **G.32.6** founder-authored customer comms send · **G.32.7** PRYZM 1 OTel tags marked deprecated · **G.32.8** PRYZM 1 marketplace catalog frozen · **G.32.9** read-only window calendar started.
>   - Lands across **S84-WIRE D1–D9**. ADR-044 must land **before G.32.6** (revised from chunk 25's impossible "S22").
> - **G.33** — DELETE `src/persistence/` after **C.14** move lands and verifies. See [Chunk 26 §26.8](./26-plan-self-corrections.md#§268--amendment-h--missing-deletion-ids-and-unspecified-checklists). Lands in **S82-WIRE D9** (last day of Phase G).
>
> **Phase H — additional lock-in** (was 7 lint+bench flips, now **8**):
> - **H.5.1** — commit-msg hook + PR-title lint forbidding bare `S(7[3-9]|8[0-7])` without `-WIRE` or `-PG4` suffix. See [Chunk 26 §26.9](./26-plan-self-corrections.md#§269--amendment-i--sprint-id-lint-enforcement-missing). Lands in **S85-WIRE**.
>
> **Phase H GA gate (`pnpm ga-gate`) — composite expanded** (was 9 checks, now **11**):
> - Adds **§23.13 — runtime smoke test** (per [Chunk 26 §26.10](./26-plan-self-corrections.md#§2610--amendment-j--runtime-smoke-test-missing-from-pnpm-ga-gate)) and **§23.x cross-doc invariants** (per [Chunk 25 §25.8.3](./25-architecture-docs-cross-alignment.md)) and **§23.y per-folder rAF/canvas drilldowns** (per [Chunk 26 §26.5](./26-plan-self-corrections.md#§265--amendment-e--raf--canvas-pre-flight-drilldowns-missing)).
>
> **Cadence summary update** — **~441 sub-phases** total (was 386; +31 Chunk 24 + 1 Chunk 25 + 23 Chunk 26 = +55). Distribution: Phase Z (retro-fit) 21 in S77-WIRE D1–D9 · Phase G now 24 (was 9) + 9 G.32.* sub-items · Phase H now 8 (was 7).
>
> **Status as of this audit**: Phase G has **not yet started** (it opens after Phase F, which opens after Phase E, which opens after Phase D, which opens after the C exit gate).

---

### §16.7 Phase G — Mass deletions (S82–S86, 9 sub-phases)

Each deletion is its own PR. Each waits on its dependencies (last-consumer migration). The PR title is `[G.<n>] DELETE <directory>`.

| Sub-phase | Deletion | Depends on | Sprint |
|---|---|---|---|
| **G.1** | DELETE `src/engine/` | D.1–D.8 done | S82 |
| **G.2** | DELETE `src/elements/<family>/` for each family | E.1–E.14 done | S78–S81 (rolled into each E sub-phase) |
| **G.3** | DELETE `src/commands/` | E.* done + F.* done | S84 |
| **G.4** | DELETE `src/services/` (legacy services like BimService) | D.* + E.* done | S84 |
| **G.5** | DELETE `src/ai/` (legacy AI client) | F.7.* done | S84 |
| **G.6** | DELETE `src/api/` (legacy `apiFetch` wrapper) | C.* done | S84 |
| **G.7** | DELETE `src/history/UndoManager.ts` | C.6.02–03 done | S84 |
| **G.8** | DELETE `apps/editor/src/main.ts:mountEditor()` (the dark mount fn body; the bootstrap.everything.ts stays as the data half) | D.1 done | S82 |
| **G.9** | Audit + delete remaining `legacy/` shims (any `legacy/` directories created during migration) | all F.* done | S86 |

### §16.8 Phase H — Lock-in (S85–S87, 7 sub-phases)

Lint flips and bench hard-fail flips. **Each is one PR.**

| Sub-phase | Action | Sprint |
|---|---|---|
| **H.1** | Flip `eslint-plugin-pryzm/no-window-as-any` from WARN to ERROR (zero cast sites must remain in `src/ui/`, `packages/`, `apps/`) | S85 |
| **H.2** | Land `eslint-plugin-pryzm/no-second-canvas` rule (only `Renderer.ts` + `composeRuntime.ts` may call `document.createElement('canvas')`) | S85 |
| **H.3** | Land `eslint-plugin-pryzm/single-raf` rule (only `packages/frame-scheduler/` may call `requestAnimationFrame`) | S85 |
| **H.4** | Land `eslint-plugin-pryzm/no-runtime-package-import` rule (`src/ui/` may only import `@pryzm/runtime-composer/types`, not the individual packages) | S85 |
| **H.5** | Land `eslint-plugin-pryzm/no-second-ui` rule (no imports from `apps/editor/src/projects/` outside the editor app) | S85 |
| **H.6** | Flip every UI bench in `apps/bench/src/benches/ui/` from `warn` to `hardFail: true` simultaneously (all 60 benches) | S86 |
| **H.7** | Land visual-diff CI baseline (`apps/bench/visual-diff/`); SSIM > 2 px or pixel-diff > 0.05 % fails the build | S87 |

### §16.9 Cross-cutting — gestures NOT yet enumerated above (catch-all sweep)

The above tables enumerate **every gesture I have evidence for in the current `src/ui/`**. To prevent any forgotten gesture from inheriting a legacy wire, this sub-phase runs in S87 (Phase H D-final week):

| Sub-phase | Action |
|---|---|
| **H.8** | Audit script `apps/bench/scripts/list-gestures.mjs` walks every `addEventListener('click' \| 'mousedown' \| 'keydown' \| 'dragstart' \| ...)` site in `src/ui/`, every `onclick=` in template strings, every `(window as any).<name>(` callsite, every hotkey registration. Outputs `gesture-coverage.json`. |
| **H.9** | Cross-references `gesture-coverage.json` against this §16's sub-phase IDs. Any gesture not assigned to a sub-phase **fails the GA gate**. The PR closing the gap is its own sub-phase (named `H.9.<n>`). |
| **H.10** | Final assertion: `cast-site count == 0` AND `gesture-coverage.unassigned == 0` AND `bench/ui/* hardFail == true for all` AND `visual-diff CI green`. **GA cut.** |

### §16.10 Sub-phase count and PR cadence summary

| Phase | Sub-phases | Sprints | Avg PRs/sprint |
|---|---:|---|---:|
| A | 7 | S73 (1) | 7 |
| B | 40 | S73–S75 (3) | 13 |
| C | 35 | S74–S76 (3) | 12 |
| D | 14 | S75–S77 (3) | 5 |
| E | 14 | S76–S80 (5) | 3 |
| F.1 (toolbar.discipline) | 65 | S78–S81 (4) | 16 |
| F.2 (inspector.element) | 19 | S81–S83 (3) | 6 |
| F.3 (modal.creation) | 15 | S82–S83 (2) | 8 |
| F.4 (menu.context + radial) | 8 | S83 (1) | 8 |
| F.5 (bottom strip) | 32 | S83 (1) | 32 |
| F.6 (left rail content) | 27 | S81–S83 (3) | 9 |
| F.7 (AI) | 16 | S83–S84 (2) | 8 |
| F.8 (VI / Intent) | 13 | S81 (1) | 13 |
| F.9 (Data Workbench) | 16 | S82 (1) | 16 |
| F.10 (rendering) | 14 | S81 (1) | 14 |
| F.11 (modals) | 12 | S82–S83 (2) | 6 |
| F.12 (marketplace + IFC + Rhino + DXF + BCF + ComponentEditor) | 20 | S84 (1) | 20 |
| G | 9 | S82–S86 (5; rolled into E + late F) | 2 |
| H | 10 | S85–S87 (3) | 4 |
| **Total** | **~386 sub-phases** | **15 sprints** | **~26 PRs/sprint** |

**~386 sub-phases / ~26 PRs per sprint with 2 engineers** is realistic for a refactor of this granularity. Every PR is small (one engineer-day), reviewable, and reverts cleanly. The CI bench gate prevents any PR from regressing — the refactor cannot stall the product.

### §16.11 Why this granularity matters

The user asked "I want a phase and sub phase plan for every single UI UX click interaction and all mapped to the new architecture. This is critical, otherwise we will be absorbing still legacy code." Here is why §16 satisfies that:

1. **No PR can land two gestures at once.** If gesture X and gesture Y share legacy code path Z, the second PR to migrate (say Y) must delete Z — there is no "share" path that lets Z live on as a legacy bridge.
2. **No gesture can be forgotten.** The H.8–H.10 catch-all sweep enumerates every event listener, hotkey, and global call site in `src/ui/` and asserts every one has a sub-phase ID. Any orphan blocks GA.
3. **Each sub-phase has a bench.** When a PR claims to migrate gesture X, the bench it lands measures latency on the new wire. CI rejects regressions.
4. **The legacy file deletion is in the same PR as the last-consumer gesture migration.** This is the §16.0 acceptance rule #3. There is no separate "cleanup PR" that can be deprioritised — the deletion IS the migration.
5. **The lint count is monotonic-non-increasing per PR.** Every PR that touches `src/ui/` either decreases the `(window as any)` count or holds it. Any PR that increases the count is rejected by CI.
6. **The visual-diff CI prevents the migration from changing pixels.** The white UI looks identical at the end of every PR.

These six gates together make it physically impossible for legacy code to survive a Phase F PR while the gesture it serviced has been "migrated". The §16 plan is the operator's contract that the refactor finishes — every gesture is named, every gesture has a destination, every gesture has a CI gate, and no two gestures can hide together.

---

> **⚠️ Audit amendment — see [`24-pryzm1-src-coverage-audit.md`](./24-pryzm1-src-coverage-audit.md).**
>
> Phase G is extended with **22 additional deletion sub-phases** for legacy `src/` directories the original §16.7 list did not name:
>
> - **S82** (Phase G window): `G.10` `src/tools/` · `G.11` `src/monetization/`
> - **S83**: `G.12` `src/import/` · `G.13` `src/generative/` · `G.14` `src/rendering/` · `G.15` `src/cde/` · `G.16` `src/export/`
> - **S84**: `G.17` `src/portfolio/` (per ADR-041) · `G.18` `src/physics/` (per ADR-042) · `G.19` `src/geospatial/` · `G.20` `src/api/` · `G.21` `src/snapping/` · `G.22` `src/spatial/` · `G.23` `src/topology/` · `G.24` `src/structural/` + `src/elements/structural/` · `G.25` `src/migration/` · `G.26` `src/collaboration/` · `G.27` `src/constraints/` · `G.28` `src/render/` · `G.29` `src/visibility/` · `G.30` `src/furniture/` shim · `G.31` `src/features/` shim
>
> Each new ID is bound to a Phase B widening or Phase E migration sub-phase that lands the wire first (see §24.5). Phase H gains a final allowlist check (see §24.7) that asserts only `ui/`, `styles/`, `utils/`, `types/`, `dev/` and four root files remain under `src/` at GA.

---

