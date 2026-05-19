# 16 — Package Dependency Map

> **Stamp**: 2026-05-01 · **Status**: CANONICAL · **Method**: deep filesystem audit (`grep -rh "@pryzm/"` per package src/ + `ls node_modules/@pryzm/` + `ls plugins/ | wc -l`).
> **Cross-refs**: `02-ARCHITECTURE.md §5` (tier summary), `01-VISION.md §3` (layer table), `03-CURRENT-STATE.md §15.16` (full LOC + test inventory), `15-PACKAGE-POPULATION-GAP.md §0.0.10` (wave verifiers).
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§1 packages/plugins/apps counts if any change; §2 booleans if a layer violation is newly blocked or cleared).

This document answers: **who imports whom, which packages are standalone, and how everything connects**. It is the single source of truth for the inter-package import graph. Update this file whenever a package gains or loses a `@pryzm/*` dependency.

---

## §1 — The complete import graph

Every `@pryzm/*` import found in each package's `src/`. Only structural imports listed (not JSDoc comment mentions).

```
@pryzm/schemas            (no @pryzm deps — L0 foundation)
@pryzm/command-bus        (no @pryzm deps — L1 leaf)
@pryzm/frame-scheduler    (no @pryzm deps — L1 leaf)
@pryzm/picking            (no @pryzm deps — L1 leaf; ./snapping sub-path exports 16 files)
@pryzm/visibility         (no @pryzm deps — L1 leaf)
@pryzm/ai-cost            (no @pryzm deps — L1 leaf)
@pryzm/sync-client        (no @pryzm deps — L1 leaf)
@pryzm/runtime-undo-stack (no @pryzm deps — L1 leaf)
@pryzm/ui                 (no @pryzm deps — L1 leaf)
@pryzm/input-host         (no @pryzm deps — L1 leaf)
@pryzm/physics-host       (no @pryzm deps — L1 leaf)
@pryzm/renderer-three     (no @pryzm deps — L1 leaf)
@pryzm/snapping           → @pryzm/picking          (Wave 8 stub; re-exports ./snapping sub-path)
@pryzm/spatial-index      (no @pryzm deps — Wave 8 stub; defines ISpatialIndex<T> contract)

@pryzm/protocol           → @pryzm/schemas
@pryzm/drawing-primitives → @pryzm/schemas

@pryzm/geometry-kernel    → @pryzm/drawing-primitives, @pryzm/protocol, @pryzm/schemas
@pryzm/ai-host            → @pryzm/ai-cost
@pryzm/types-builtin      → @pryzm/protocol, @pryzm/schemas

@pryzm/stores             → @pryzm/ai-host, @pryzm/command-bus, @pryzm/schemas

@pryzm/scene-committer    → @pryzm/drawing-primitives, @pryzm/stores
@pryzm/persistence-client → @pryzm/command-bus, @pryzm/stores
@pryzm/renderer           → @pryzm/frame-scheduler, @pryzm/scene-committer
@pryzm/render-runtime     → @pryzm/scene-committer, @pryzm/stores
@pryzm/legacy-shim        → @pryzm/command-bus

@pryzm/file-format        → @pryzm/persistence-client
@pryzm/view-state         → @pryzm/frame-scheduler, @pryzm/renderer, @pryzm/stores

@pryzm/runtime-composer   → @pryzm/command-bus, @pryzm/editor (apps/editor),
                            @pryzm/input-host, @pryzm/physics-host,
                            @pryzm/renderer, @pryzm/renderer-three,
                            @pryzm/runtime-undo-stack, @pryzm/stores,
                            @pryzm/sync-client, @pryzm/view-state

@pryzm/ui-base            → @pryzm/runtime-composer (type-only), @pryzm/ui

@pryzm/beta-signup        → @pryzm/email-transport
@pryzm/family-loader      → @pryzm/family-runtime, @pryzm/file-format
@pryzm/family-instance    → @pryzm/family-runtime, @pryzm/file-format, @pryzm/geometry-kernel
```

---

## §2 — Who imports each package (reverse index)

| Package | Imported by (packages only) | Imported by `src/` |
|---|---|:---:|
| `@pryzm/schemas` | protocol, drawing-primitives, geometry-kernel, stores, types-builtin | — |
| `@pryzm/command-bus` | legacy-shim, persistence-client, runtime-composer, stores | — |
| `@pryzm/frame-scheduler` | renderer, view-state | ✅ direct |
| `@pryzm/picking` | snapping | ✅ direct |
| `@pryzm/visibility` | — | ✅ direct |
| `@pryzm/ai-cost` | ai-host | — |
| `@pryzm/sync-client` | runtime-composer | — |
| `@pryzm/runtime-undo-stack` | runtime-composer | — |
| `@pryzm/ui` | ui-base | — |
| `@pryzm/input-host` | runtime-composer | — |
| `@pryzm/physics-host` | runtime-composer | — |
| `@pryzm/renderer-three` | runtime-composer | — |
| `@pryzm/snapping` | — (new stub; nobody imports yet) | — |
| `@pryzm/spatial-index` | — (new stub; nobody imports yet) | — |
| `@pryzm/protocol` | geometry-kernel, types-builtin | ✅ direct |
| `@pryzm/drawing-primitives` | geometry-kernel, scene-committer | — |
| `@pryzm/geometry-kernel` | family-instance | — |
| `@pryzm/ai-host` | stores | — |
| `@pryzm/types-builtin` | — | — |
| `@pryzm/stores` | persistence-client, render-runtime, runtime-composer, scene-committer, view-state | ✅ direct |
| `@pryzm/scene-committer` | renderer, render-runtime | — |
| `@pryzm/persistence-client` | file-format | ✅ direct |
| `@pryzm/renderer` | runtime-composer, view-state | — |
| `@pryzm/render-runtime` | — | — |
| `@pryzm/legacy-shim` | — | — |
| `@pryzm/file-format` | family-instance, family-loader | ✅ direct |
| `@pryzm/view-state` | runtime-composer | — |
| `@pryzm/runtime-composer` | ui-base | ✅ direct |
| `@pryzm/ui-base` | — | ✅ direct |
| `@pryzm/email-transport` | beta-signup | — |
| `@pryzm/family-runtime` | family-instance, family-loader | — |
| `@pryzm/editor` (apps/editor) | runtime-composer | — |

---

## §3 — Standalone packages (not imported by any other @pryzm package)

These packages are feature endpoints, server-side services, or Phase F deliverables. They depend on other packages but nothing depends on them within the workspace. They are each their own "root" in the import graph.

| Package | LOC | Tests | Description |
|---|---:|---:|---|
| `@pryzm/admin-overrides` | 284 | 2 | Admin feature flag overrides — server endpoint |
| `@pryzm/ai-spend` | 432 | 2 | AI budget enforcement — server middleware |
| `@pryzm/api-rbac` | 237 | 1 | RBAC middleware — used by API gateway |
| `@pryzm/api-spec` | 249 | 2 | OpenAPI spec generation — build-time tool |
| `@pryzm/bench-visual-diff` | 0 | 0 | Empty shell — future visual regression bench |
| `@pryzm/beta-signup` | 323 | 1 | Beta signup → `@pryzm/email-transport` |
| `@pryzm/constraint-solver` | 845 | 2 | Parametric constraint engine — standalone solver |
| `@pryzm/crash-reporter` | 420 | 1 | Error boundary + telemetry — server endpoint |
| `@pryzm/email-transport` | 270 | 1 | Transactional email — server service |
| `@pryzm/expr-eval` | 257 | 1 | Formula expression evaluator — standalone |
| `@pryzm/family-instance` | 406 | 1 | BIM family instance → family-runtime + file-format + geometry-kernel |
| `@pryzm/family-loader` | 320 | 1 | Family file loading → family-runtime + file-format |
| `@pryzm/family-runtime` | 1,069 | 6 | Family execution runtime (imported by instance + loader) |
| `@pryzm/feature-flags` | 168 | 1 | Feature flag evaluation — server service |
| `@pryzm/formula-library` | 593 | 1 | Built-in formula functions — standalone library |
| `@pryzm/legacy-shim` | 28 | 0 | Backwards-compat shim → command-bus (28 LOC, no importers) |
| `@pryzm/oauth2-pkce` | 260 | 1 | OAuth2 PKCE flow — auth endpoint |
| `@pryzm/pdf-to-bim` | 380 | 2 | PDF → BIM element extraction — standalone tool |
| `@pryzm/perf-budgets` | 171 | 1 | Performance budget enforcement — CI tool |
| `@pryzm/plugin-sdk` | 2,067 | 6 | **Phase F gate.** v1.0.0-rc.1, full implementation. NOT npm-published. |
| `@pryzm/rate-limit` | 230 | 1 | Rate limiting middleware — server |
| `@pryzm/release` | 0 | 0 | Empty shell — `ga-gate.mjs` lives here |
| `@pryzm/render-runtime` | 190 | 1 | Render loop runtime → scene-committer + stores |
| `@pryzm/snapping` | 32 | 0 | Wave 8 stub — nobody imports yet; Wave 11 migration target |
| `@pryzm/spatial-index` | 88 | 0 | Wave 8 stub — nobody imports yet; Wave 11 migration target |
| `@pryzm/storage-driver` | 414 | 2 | Storage backend abstraction — server service |
| `@pryzm/types-builtin` | 806 | 0 | TypeScript utility types → protocol + schemas |
| `@pryzm/wcag-audit` | 240 | 1 | WCAG accessibility audit — CI tool |
| `@pryzm/webhooks` | 592 | 3 | Webhook delivery system — server service |

---

## §4 — `src/` import surface (what the main Vite bundle directly consumes)

The root `tsconfig.json` includes only `src/`. The `src/` codebase imports exactly **9 `@pryzm/*` packages** directly:

| Package | Layer | Role |
|---|---|---|
| `@pryzm/frame-scheduler` | L1 | rAF scheduler — used in ~5 src/ files |
| `@pryzm/persistence-client` | L4 | Supabase persistence — used in ~20 src/ui/ files |
| `@pryzm/picking` | L1 | 3-D picking + snapping — used in ~15 src/engine/ files |
| `@pryzm/plugin-geospatial` | plugins/ | Geospatial plugin — used in ~3 src/ files |
| `@pryzm/protocol` | L1½ | Wire protocol types — used in ~10 src/ files |
| `@pryzm/runtime-composer` | L6 | `composeRuntime()` — `src/main.ts` + ~8 src/engine/ files |
| `@pryzm/stores` | L3 | Zustand stores — used in ~3 src/ui/platform/ files |
| `@pryzm/ui-base` | L7 | Foundational UI atoms — used in src/ui/ |
| `@pryzm/visibility` | L1 | VG governance store — used in ~4 src/elements/ files |

All 9 are linked in `node_modules/@pryzm/` (declared in root `package.json` dependencies). TypeScript gate (`pnpm tsc --noEmit`, `include: ["src"]`) is sound — it covers all 9 direct imports correctly.

---

## §5 — Root `package.json` linked packages (16 total)

These are the 16 packages that appear in root `package.json` `dependencies` and are symlinked into `node_modules/@pryzm/`:

```
@pryzm/editor (→ apps/editor)     @pryzm/protocol
@pryzm/file-format                @pryzm/renderer-three
@pryzm/frame-scheduler            @pryzm/runtime-composer
@pryzm/persistence-client         @pryzm/schemas
@pryzm/picking                    @pryzm/snapping          ← added S98-WIRE
@pryzm/plugin-geospatial          @pryzm/spatial-index     ← added S98-WIRE
@pryzm/plugin-toy-cube            @pryzm/stores
@pryzm/protocol                   @pryzm/ui-base
                                  @pryzm/visibility
```

The remaining 38 workspace packages are reachable through pnpm's virtual store (`node_modules/.pnpm/`) as transitive deps of the 16 linked packages. They are **not** in root `package.json` directly.

---

## §6 — Key structural facts for wave planning

1. **`@pryzm/command-bus` has ~300 import sites** across packages — the most-coupled package in the workspace. Any breaking change requires a coordinated multi-package update.

2. **`@pryzm/geometry-kernel` is the largest package** (12,264 LOC, 37 tests) and is **not in the Vite build graph** (`src/` doesn't import it directly). It is imported by `family-instance` only. Its build correctness is validated by its own vitest suite, not by the root tsc gate.

3. **`@pryzm/persistence-client` (5,974 LOC)** is the second-largest package and is **directly in the Vite build graph** — every change is felt in the main bundle.

4. **`@pryzm/picking` (4,311 LOC)** owns the `./snapping` sub-path with 16 source files. In Wave 11, this sub-path's implementation moves to `@pryzm/snapping`. The `@pryzm/spatial-index` package will absorb `SpatialGrid.ts` from picking/snapping and `ElementSpatialIndex.ts` from `src/core/drawing/`.

5. **`@pryzm/stores` depends on `@pryzm/ai-host`** — the AI workflow layer is baked into the Zustand store graph. Changes to ai-host ripple into stores → runtime-composer → ui-base → src/.

6. **`@pryzm/plugin-sdk` (2,067 LOC, v1.0.0-rc.1)** is fully implemented but not npm-published. It is NOT imported by any other package. The Phase F gate requires `npm view @pryzm/plugin-sdk` to return a valid version (currently E404).

7. **`@pryzm/types-builtin` (806 LOC, 0 tests)** is standalone — it depends on protocol + schemas but nothing imports it. Zero-test status is Wave 13 work-item.

8. **`@pryzm/snapping` and `@pryzm/spatial-index`** are Wave 8 stubs — 32 LOC and 88 LOC respectively. Nobody imports them yet. They exist to establish workspace boundary semantics before Wave 11 moves the implementation here.

---

## §7 — Dependency depth (longest chain from L0 to each package)

```
Depth 0: schemas
Depth 1: command-bus, frame-scheduler, picking, visibility, ai-cost,
         sync-client, runtime-undo-stack, ui, input-host, physics-host,
         renderer-three, snapping (→ picking), spatial-index
Depth 2: protocol (→ schemas), drawing-primitives (→ schemas)
Depth 3: geometry-kernel (→ drawing-primitives), ai-host (→ ai-cost),
         types-builtin (→ protocol + schemas)
Depth 4: stores (→ ai-host + command-bus + schemas)
Depth 5: scene-committer (→ drawing-primitives + stores)
         persistence-client (→ command-bus + stores)
         renderer (→ frame-scheduler + scene-committer)
         render-runtime (→ scene-committer + stores)
         legacy-shim (→ command-bus)
Depth 6: file-format (→ persistence-client)
         view-state (→ frame-scheduler + renderer + stores)
Depth 7: runtime-composer (→ command-bus + editor + input-host +
                            physics-host + renderer + renderer-three +
                            runtime-undo-stack + stores + sync-client +
                            view-state)
Depth 8: ui-base (→ runtime-composer + ui)
```

The maximum dependency depth is **8 hops** (schemas → ... → ui-base). This is the critical path for any change to `schemas` — it will propagate through 8 package layers before reaching `ui-base`.

---

## §8 — Verifier commands

```bash
# Rebuild the import graph (run from workspace root):
for pkg in packages/*/; do
  name=$(node -e "const p=JSON.parse(require('fs').readFileSync('${pkg}package.json','utf8'));process.stdout.write(p.name)" 2>/dev/null)
  [ -z "$name" ] && continue
  deps=$(grep -rh "@pryzm/" "${pkg}src/" --include="*.ts" 2>/dev/null \
    | grep "from '@pryzm" | grep -oP "@pryzm/[a-z0-9-]+" \
    | sort -u | grep -v "^${name}$" | tr '\n' ' ')
  [ -n "$deps" ] && echo "$name → $deps"
done

# Check which packages are linked in node_modules:
ls node_modules/@pryzm/

# Count plugins, apps, packages:
echo "packages: $(ls packages/ | wc -l)"
echo "apps:     $(ls apps/ | wc -l)"
echo "plugins:  $(ls plugins/ | wc -l)"

# Verify src/ folder count:
ls -d src/*/
```

**Last verified**: 2026-05-01 (S98-WIRE deep-audit). Results: 54 packages, 12 apps, 46 plugins, src/ = 4 folders.
