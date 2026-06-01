# ADR-023 — Library rAF Quarantine

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §6.1, §29 #11` (legacy 58 rAF owners → 1 contradicted by quarantined libraries) |
| Required by | Sprint S32 (single-frame-owner ESLint rule promotion to error — Phase 2B; Phase 2A holds no gap-closure work per 2026-04-27 directive) |
| Owner | Architecture lead |
| Implementation | `packages/render-runtime/library-mount/`; ESLint rule `pryzm/single-frame-owner` |
| Spec dependency | SPEC-12 §5 (lazy chunk policy); ADR-022 Part F |

---

## Context

`09-AS-IS-VS-TO-BE` §5 commits to "58 rAF owners → 1." Cesium, OBC, ifcjs-viewer, three.js EffectComposer, and any future ML pathtracer all contain their own internal rAF loops. They cannot be retrofitted to share PRYZM's frame scheduler without forking them — which we won't.

This ADR pins **exactly when the rAF-owner-=-1 invariant is allowed to relax**, what telemetry covers the relaxation, and how each quarantined library is unmounted to restore the invariant.

---

## Decision

### Part A — the invariant has a precise scope

The invariant is: **"`packages/render-runtime/` is the only PRYZM-owned source of `requestAnimationFrame` calls."** Quarantined libraries are not PRYZM-owned and are exempt **only while mounted**.

When **no quarantined library is mounted**, idle CPU is **0 fps** and rAF count is exactly the runtime's (which is also 0 when no scene-cache changes are pending — demand-driven per SPEC-01 §6).

When **a quarantined library is mounted**, idle CPU rises to "as low as the library allows" and is documented per library (§Part C).

### Part B — qualifying libraries

A library may quarantine its own rAF if **all** of:
1. The library is loaded as a **lazy chunk** (per SPEC-12 §5).
2. The mount point is a single PRYZM module under `packages/render-runtime/library-mount/<library>/`.
3. The mount API includes a `dispose()` that the library invokes to stop its loop, and PRYZM calls it on unmount.
4. Telemetry `pryzm.runtime.library.<lib>.frames_per_sec` is emitted while mounted.
5. The relaxation is documented in this ADR.

### Part C — the qualifying library list

| Library | Surface | Idle fps when mounted | Mount trigger | Unmount trigger |
|---|---|---|---|---|
| **Cesium** | `library-mount/cesium/` | ~10 (basemap LOD streamer) | user enables "Geographic context" or zooms beyond bbox + project has `site.geo` | user disables / view changes / project closes |
| **OBC (`@thatopen/components`)** | `library-mount/obc/` | ~5 (GPU memory cleaner) | user clicks "Import IFC" OR project references `imports/source.ifc.zst` | import session ends; per SPEC-27 §4.3 OBC moves to plugin at S55 |
| **ifcjs-viewer** | `library-mount/ifc-viewer/` | ~5 | only used inside IFC import preview UI | preview closes |
| **three.js EffectComposer** | `library-mount/postfx/` | 0 (only rAFs when posteffect dirty) | post-FX preset selected by user | preset cleared |
| **(future) ML pathtracer** | `library-mount/pathtracer/` | up to 60 (active) / 0 (paused) | user requests "high-quality render" | render done / cancelled |

### Part D — what's NOT allowed to quarantine

- Any code under `packages/geometry-kernel/`. The kernel is pure; rAF in the kernel = bug.
- Any code under `packages/render-runtime/` outside `library-mount/`. The runtime owns the frame.
- Any plugin code (`plugins/*/`). Plugins consume the runtime; they don't drive frames.
- Any UI binding code (`packages/ui/`). UI consumes scene-cache via the runtime.

ESLint rule `pryzm/single-frame-owner` enforces. Allow-list = `packages/render-runtime/index.ts` + `packages/render-runtime/library-mount/<lib>/index.ts` per library.

### Part E — telemetry (per `[strategic ADR-007]`)

While any library is mounted, the runtime emits:
- `pryzm.runtime.library.<lib>.mounted` (counter, 1 per mount).
- `pryzm.runtime.library.<lib>.frames_per_sec` (gauge).
- `pryzm.runtime.library.<lib>.cpu_pct` (gauge, browser perf-observer estimate).

CI bench `apps/bench/idle-cpu.ts` measures idle CPU with each library mounted vs unmounted. Regression > 20% flags a release blocker.

### Part F — single-frame-owner audit

A nightly bench (`apps/bench/single-frame-owner-audit.ts`) opens an empty editor + each library, captures rAF call sites via instrumented browser, and asserts the trace matches the allow-list. Any unexpected source = release blocker.

---

## Consequences

**Positive:**
- The invariant survives library integrations.
- Each library's idle cost is measured + documented + accountable.
- New libraries follow a clear path (mount + dispose + telemetry + ADR update).
- The 58 → 1 commitment is honest: 1 PRYZM owner + N library-internal owners that are off when not used.

**Negative:**
- Mount/unmount discipline is required; bugs that leak a library mount cost idle CPU.
- ADR maintenance: every new quarantined library requires an ADR update.
- Library APIs sometimes don't expose clean dispose; we may need patches or wrappers.

---

## Alternatives considered

### A1 — Fork every quarantined library to use PRYZM's scheduler
Rejected: maintenance cost is enormous; loses upstream updates; breaks the libraries' own correctness assumptions.

### A2 — Tolerate any rAF as long as it's lazy
Rejected: without an ADR list + telemetry, the rAF count returns to 58 in a year of feature work.

### A3 — Run quarantined libraries in iframes
Rejected: cross-document overhead (especially for OBC) is too high; the dispose discipline is enough.

---

## Phase rollout

- S31 — ADR-023 land (Phase 2B start); allow-list shipped; telemetry added (warning level on misses); Cesium mount lazy + disposable.
- S32 — `pryzm/single-frame-owner` rule promoted to error.
- S37 — OBC mount review at S55 prep (will move to plugin per SPEC-27).
- S55 — OBC removed from editor; library-mount entry deleted.
- S60 — single-frame-owner audit bench wired to release gate.
- S72 (M36 GA) — invariant verified across browser matrix.
