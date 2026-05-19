# Wave 15 — Functional Day-1 Gate

> **Status**: ✅ DONE
> **Stamp**: 2026-05-03
> **Sprints**: S107 · **Weeks**: 48–54
> **Exit gate verifier**: `pnpm tsx scripts/pryzm-3-functional-day-1.ts` → ALL CHECKS GREEN
> **Tracker rule**: any change that closes a task here → update `../00-PROCESS-TRACKER.md` §5 Wave 15 row same commit.

---

## §1 — What Wave 15 delivers

Wave 15 is the **checkpoint** that confirms PRYZM 3 is "functionally ready" — not finished, but provably past the point of no return. It closes Rung 2 of the Day-1 ladder.

At Wave 15 close, the following must all be true simultaneously:
- Architecture fully built (Waves 1–8 ✅)
- `src/` migrations complete — only `src/engine/` + `src/ui/` remain (Waves 9–11 ✅)
- All plugin recipes complete (Wave 12 ✅)
- All 46 plugins L8-compliant (Wave 12 ✅)
- 17 NFT benches real and green (Wave 13 ✅)
- Zero `(window as any)` in `src/ui/` (Wave 14, ✅ closed 2026-05-03)
- All 150 panels/toolbars consuming `runtime.*` (Wave 14, ✅ closed 2026-05-03)
- 3 integration tests green (Wave 15 Task 2 ✅ 2026-05-03)

---

## §2 — What is done ✅

### Task 1 — `pnpm pryzm-3-functional-day-1` script (DONE 2026-05-01)

The verifier script exists at `scripts/pryzm-3-functional-day-1.ts` and currently returns **8/8 checks GREEN**.

Root fix applied: `PanelContribution`, `PanelContext`, `PanelCategory`, `InspectorTabContribution` were not exported from `@pryzm/plugin-sdk`. Added re-exports; `@pryzm/ui` added to `plugin-sdk` deps; `plugins/bcf` + `plugins/ifc-inspector` imports updated. `pnpm build` ✓ 44.86s, 0 TS errors.

The 8 checks that pass today:

| Check | Command | Passes today |
|---|---|:---:|
| `src-folders` | `ls -d src/*/ \| wc -l` → `2` | ✅ |
| `window-any-ui` | `rg "(window as any)" src/ui/ --type ts \| wc -l` → `0` | ✅ |
| `raf-owners` | non-scheduler `requestAnimationFrame` owners → `0` | ✅ |
| `engine-bootstrap` | `EngineBootstrap.ts` absent → `0` | ✅ |
| `plugin-compliance` | L0-L5 direct imports in `plugins/` → `0` | ✅ |
| `plugin-count` | `ls plugins/ \| wc -l` → `46` | ✅ |
| `tsc` | `pnpm tsc --noEmit \| wc -l` → `0` | ✅ |
| `nft-bundle-size` | gzip check < 4 MB | ✅ |

---

## §3 — What still needs to be done ❌

### ✅ Task 2 — 3 integration tests (DONE 2026-05-03)

All three integration tests were written and are passing (79 / 79 total in `tests/integration/`).

Files created in `tests/integration/`:

**Test 1** — `composeRuntime-click-to-render.test.ts` — 5 tests ✅

Covers: tool activation propagation, selection slot / events, workspace surface transition, `bus.executeCommand` delegation, and `runtime.composed` timing audit event.

**Test 2** — `plugin-sdk-lifecycle.test.ts` — 9 tests ✅

Covers: boot-time contributions, runtime `register()`, `dispose()`, idempotent dispose, unknown kind, catalog `list()` / `get()` / `byKind()`, snapshot isolation.

**Test 3** — `persistence-round-trip.test.ts` — 9 tests ✅

Covers: `projectContext.set()` audit triple, subscriber notification, `clear()`, `stores.registerHydrator` + `hydrate()`, `hydrate()` error on missing hydrator, `openProject()`, full round-trip, `client.list()`, `tearDown()` safety.

Run with:
```bash
pnpm exec vitest run --config tests/integration/vitest.config.ts
```

---

## §4 — Exit gate (what "done" means)

```bash
# 1. Functional day-1 verifier — ALL CHECKS GREEN
pnpm tsx scripts/pryzm-3-functional-day-1.ts

# 2. Integration tests — 3/3 pass
pnpm vitest run tests/integration/

# 3. Sanity counts
echo "packages: $(ls packages/ | wc -l)"    # → 56 (or more)
echo "src/ folders: $(ls -d src/*/ | wc -l)" # → 2 (engine/ + ui/)
echo "plugins: $(ls plugins/ | wc -l)"       # → 46
```

When all three pass, Wave 15 closes and Rung 2 of the Day-1 ladder is complete.

---

## §5 — Blocker

**RESOLVED 2026-05-03** — Wave 14 closed on 2026-05-03 with all preconditions met:

- `setRuntime|legacyPlatform|window.__pryzm2` hits in `src/ui/` = **0** ✅
- All 68 panel-wiring rows in `21-WAVE-14-STATUS.md §3` = **✅**
- `npm run build` = **EXIT:0** (50.37s) ✅

Integration tests (Task 2) were subsequently written and all 79 tests in `tests/integration/` pass.
