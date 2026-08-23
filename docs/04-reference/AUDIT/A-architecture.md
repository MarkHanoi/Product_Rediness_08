# AUDIT-A — ARCHITECTURE, LAYERING, PACKAGES, COMPOSITION

**Pascal editor (`pascalorg/editor`) vs PRYZM.** Lane A of five. Destined for **C107**.

| | |
|---|---|
| Auditor | lane AUDIT-A (architecture axis) |
| Date of every measurement below | **2026-08-23** |
| PRYZM tree | `C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08` @ **`f07b69cf`** (working tree clean except `packages/command-registry/tsconfig.tsbuildinfo` and an untracked `README.md`) |
| Pascal tree | shallow clone @ **`45a8cce`** ("Bump plugin-bones to d1c3c8b (night-10 dawn batch) (#711)"), HEAD dated **2026-08-23 04:19:42 -0400**, `git rev-list --count HEAD` → **1** (depth-1 clone: no history available) |
| Pascal license | MIT (`LICENSE`), public, `packageManager: bun@1.3.14` |
| Mode | **READ-ONLY on both trees.** No source file in either tree was created, edited or deleted by this lane. No commit, no stage, no stash. ⚠ One honest caveat: `check-per-package-compile.ts` invokes `tsc` per package and 74 packages set `composite: true`, so **build artefacts (`*.tsbuildinfo`) may have been refreshed**. `git status --porcelain` after all runs shows only `M packages/command-registry/tsconfig.tsbuildinfo` (already modified *before* this lane started) and the pre-existing untracked `README.md`. Pascal's tree: `git status --porcelain` → **empty**. |

---

## 1. Scope and method

### 1.1 What this lane owns

Package graph, layer model, layer enforcement, composition root, extension model, and the founder's real question: **which of PRYZM's 4× is earned and which is accident.**

Explicitly **out of scope for this lane** (owned by siblings): command semantics and undo correctness, DTO/store shape, renderer performance, collaboration correctness, test quality. Where those subjects appear below it is only because they change the *package graph* — e.g. Pascal having no CRDT at all is a package-graph fact before it is a collaboration fact.

### 1.2 What I read (not skimmed)

**Pascal.** `AGENTS.md` (whole); `biome.jsonc` (whole); `.github/workflows/ci.yml` + `release.yml`; `turbo.json`; every `package.json` under `packages/`, `apps/`, `tooling/`; `packages/core/src/architecture.test.ts` (whole); `packages/core/src/registry/{registry.ts,index.ts,types.ts (targeted)}`; `packages/nodes/src/index.ts` + `index.test.ts` (whole); `packages/nodes/src/wall/definition.ts` (head); `apps/editor/lib/bootstrap.ts` (whole); `apps/editor/app/client-bootstrap.tsx` (whole); `apps/editor/lib/scene-store-server.ts`; `wiki/architecture/{README,layers,node-definitions,plugin-authoring,creating-rules}.md` (whole); `.agents/skills/review-architecture/SKILL.md` (whole); `packages/ifc-converter/src/index.ts` (head).

**PRYZM.** `CLAUDE.md` (whole); `apps/editor/src/PluginRegistry.ts` (structure + all descriptor comments); `apps/editor/src/bootstrap.everything.ts`; `packages/runtime-composer/src/{PluginHost.ts,composeRuntime.ts (metrics)}`; `packages/plugin-sdk/src/index.ts`; `plugins/wall/{package.json,plugin.manifest.json,src/index.ts}`; `packages/geometry-wall/package.json`; `tools/ga-gate/check-{layer-boundaries,single-compose}.ts` (headers + output); `tools/ga-gate/per-package-compile-skip-ledger.json`; `packages/tsconfig.references.json`; root `tsconfig.json` + `package.json`; `src/main.ts` (head); `index.html:429`.

### 1.3 Gates I actually executed against PRYZM @ `f07b69cf`

Running a GA gate is a read; none of them write to the tree.

```bash
npx tsx tools/ga-gate/check-layer-boundaries.ts          # RC=3
npx tsx tools/ga-gate/check-single-compose.ts            # RC=0
npx tsx tools/ga-gate/check-l7-boundary.ts               # RC=0
npx tsx tools/ga-gate/check-tool-activator-coverage.ts    # RC=1
npx tsx tools/ga-gate/check-engine-bootstrap-loc.ts       # RC=0
npx tsx tools/ga-gate/check-apps-editor-ghost-dirs.ts     # RC=0
npx tsx tools/ga-gate/check-verb-register.ts             # RC=1
npx tsx tools/ga-gate/check-per-package-compile.ts       # RC=1 (long-running; full result in §2.5)
```

### 1.4 Non-negotiables I held to

- **Every count carries its command.** Nothing in §2 is transcribed from `CLAUDE.md` or from the lane brief; where my number disagrees with the brief's, both are shown.
- **Absence is a measurement.** Every "X does not exist" below names the grep that produced it, and distinguishes **ABSENT** (no such artefact) from **UNREACHABLE** (artefact exists, nothing imports it).
- **Pascal ships it ≠ Pascal does it well.** §3.6 is Pascal's own debt, measured by me, not from their docs.

---

## 2. Measured facts

### 2.1 Repository scale

| Metric | Pascal | PRYZM | Ratio | Command |
|---|---|---|---|---|
| workspace manifests | **13** | **166** | 12.8× | P: `ls packages/*/package.json apps/*/package.json tooling/*/package.json \| wc -l` · Z: `ls packages/*/package.json plugins/*/package.json apps/*/package.json \| wc -l` |
| — packages | 10 | **102** | 10.2× | `ls packages/*/package.json \| wc -l` (PRYZM `ls packages \| wc -l` is **104** — two dirs carry no manifest) |
| — plugins | 0 (in-tree) | **51** | — | `ls plugins \| wc -l` |
| — apps | 2 | 13 | 6.5× | `ls apps \| wc -l` |
| `.ts` + `.tsx` files | **1,929** | **7,563** | 3.9× | `find <roots> \( -name '*.ts' -o -name '*.tsx' \) \| grep -v node_modules \| grep -v /dist/ \| wc -l` (PRYZM roots = packages+plugins+apps) |
| test files (`*.test.*`/`*.spec.*`) | **459** (23.8%) | **2,515** (33.3%) | 5.5× | same find with `-name '*.test.ts*' -o -name '*.spec.ts*'` |
| total LOC | **444,102** | **1,779,738** | 4.0× | `find … \| xargs wc -l \| grep total$ \| awk '{s+=$1}END{print s}'` |
| production LOC (excl `*.test.*`/`*.spec.*`) | **356,851** | **1,253,273** | 3.5× | same, plus `grep -v '\.test\.' \| grep -v '\.spec\.'` |
| `.tsx` files | **486** (25%) | **3** (0.04%) | — | `find … -name '*.tsx' \| wc -l` |

The lane brief's framing figures (Pascal 1,929 / PRYZM 7,570; 23.8% / 33.2%) **verify**. My PRYZM file count is 7,563 for packages+plugins+apps; adding `src/` (6), `server/` (42) and `tools/` (240) gives 7,851, which is where the brief's 7,570 sits — the difference is which roots are included, not a disagreement.

### 2.2 Dependency-graph density — the ceremony ratio

```bash
# both trees: read every workspace package.json, count edges whose target is
# another workspace in the same repo
node -e "…"   # full script in §1.3 of my working notes; reproduced verbatim below
```

| | Pascal | PRYZM | Ratio |
|---|---|---|---|
| graph nodes (workspaces) | **13** | **166** | 12.8× |
| declared workspace→workspace edges | **28** | **487** | 17.4× |
| average out-degree | **2.15** | **2.93** | 1.36× |
| production LOC per workspace | **27,450** | **7,550** | 0.28× |
| **edges per 10k production LOC** | **0.78** | **3.89** | **5.0×** |

Highest out-degree, PRYZM: `@pryzm/editor` **58**, `@pryzm/runtime-composer` **31**, `@pryzm/bench` **26**, `@pryzm/command-registry` **22**, `@pryzm/input-host` **22**.
Highest out-degree, Pascal: `editor` (the app) **6**, `ifc-converter-app` **5**, `@pascal-app/nodes` **4**.

**Read:** PRYZM's module graph is five times denser per unit of code. That is not a consequence of doing more; it is a consequence of slicing the same work finer.

### 2.3 The layer models side by side

| | Pascal | PRYZM |
|---|---|---|
| depth | **4 tiers** (core → viewer → editor → nodes), + apps on top | **8 layers** L0–L7 |
| where the tiers are declared | `AGENTS.md` "Layer Boundaries (read once, internalise)" — prose | `eslint.config.js` `layerElements` table, consumed by `tools/ga-gate/check-layer-boundaries.ts` |
| **measured upward imports** | **0** | **103** (baseline 102 → gate **RED**) |
| packages with no layer assigned | 0 of 13 | **15** of 166 (baseline 13 → gate **RED**) |
| facade-bypass count | n/a (no facade) | **179** L6→below-L5 imports |
| banned third-party outside its home | n/a | **121** (baseline 113 → gate **RED**) |
| top-level app entry inside the model? | yes (`apps/editor` is a workspace) | **no** — real entry is `src/main.ts` (`index.html:429`), and `src/` is not a workspace, so the gate never classifies it |

PRYZM, exact gate output, `npx tsx tools/ga-gate/check-layer-boundaries.ts` → **RC=3**:

```
[check-layer-boundaries] workspace packages: 166 · classified: 151 · UNCLASSIFIED: 15
[check-layer-boundaries] upward imports between classified packages: 103
[check-layer-boundaries] L6 plugin imports bypassing the L5 SDK facade: 179
[check-layer-boundaries] banned third-party imports (OBC / express) outside their allowed homes: 121

  Violations by layer pair:
        40  L2 → L6          9  L4 → L6
        14  L2 → L4          9  L1 → L2
        12  L3 → L4          6  L2 → L3
        11  L3 → L6          1  L3 → L7  ·  1  L6 → L7
```

Pascal, my own independent measurement (they ship no such gate — see §3.3):

```bash
# every cross-package edge, source dir → imported package
for src in core viewer editor nodes mcp ifc-converter cli; do
  for tgt in core viewer editor nodes mcp ifc-converter; do
    grep -rE "from ['\"]@pascal-app/$tgt(/|['\"])" --include=*.ts --include=*.tsx packages/$src ; done; done
```

| edge | count |
|---|---|
| `packages/viewer` → `@pascal-app/core` | 70 |
| `packages/editor` → `@pascal-app/core` | 340 |
| `packages/editor` → `@pascal-app/viewer` | 152 |
| `packages/nodes` → `@pascal-app/core` | 682 |
| `packages/nodes` → `@pascal-app/viewer` | 186 |
| `packages/nodes` → `@pascal-app/editor` | 215 |
| `packages/mcp` → `@pascal-app/core` | 105 |
| `packages/ifc-converter` → `@pascal-app/core` | 2 |
| `apps/editor` → core/viewer/editor/nodes/mcp | 3/1/8/2/2 |
| `apps/ifc-converter` → core/viewer/nodes/ifc-converter | 3/2/1/2 |
| **any upward edge** | **0** |

The graph is a strict DAG with a single sink (`core`) and no back-edges anywhere.

### 2.4 Boundary invariants — measured on both trees, by me

| Invariant | Pascal | PRYZM |
|---|---|---|
| framework packages must not import the plugin package | **0** real imports. `grep -rn "@pascal-app/nodes" packages/{core,viewer,editor}/src` → **25 hits, every one a comment**; `grep -rnE "(import\|export)[^/]*from ['\"]@pascal-app/nodes"` → **0** | **60** downward-inverted plugin imports (40 L2→L6 + 11 L3→L6 + 9 L4→L6) |
| domain layer must not import the 3D engine | **0**. `grep -rnE "^import [^t].*from '(three\|@react-three)" packages/core/src` → **1 hit**, and it is `packages/core/src/hooks/scene-registry/scene-registry.test.ts:2`, a test file their own gate deliberately excludes | **0** outside `packages/renderer-three` (`check-three-imports.ts`, hard-fail, holds) |
| view layer must not know editor state | **0**. `grep -rn "useEditor" packages/viewer/src` → **0** | `check-visibility-intent-not-ui.ts` ARM A hard-0 in `packages/visibility/src` (20 files); ARM B ratchet 40/43 across 772 UI files |
| single composition root | one call site, `apps/editor/lib/bootstrap.ts` | `check-single-compose.ts` RC=0: **1 definition · 0 rivals · 2 production callers** (`packages/headless/src/headlessRuntime.ts`, `src/main.ts`) + 1 declared-debt rival `apps/component-editor/src/app/familyEditorRuntime.ts:85` |

### 2.5 Compilation boundary — is a "package" a compilation unit?

| | Pascal | PRYZM | Command |
|---|---|---|---|
| workspaces whose `exports`/`main` point at **`dist/`** | **6 of 8** real packages (`core`, `viewer`, `nodes`, `mcp`, `cli`, `ifc-converter`) | **0 of 152** | `node -p "const p=require('./<f>'); (p.main\|\|'')+'\|'+JSON.stringify(p.exports\|\|'')"` per manifest |
| workspaces whose `exports` point at **`src/`** | 2 (`@pascal-app/editor`, `@repo/ui` — both Next-transpiled internals) | **152 of 152** | same |
| workspaces with a `build` script | 8 of 13 | **28 of 153** | `node -e "process.exit(p.scripts&&p.scripts.build?0:1)"` per manifest |
| `tsconfig` with `"composite": true` | every emitting package (`packages/core/tsconfig.json`, `packages/nodes/tsconfig.json`, …) | **74** | `grep -l '"composite"' packages/*/tsconfig.json \| wc -l` |
| `tsconfig` with `"references"` | yes — e.g. `packages/nodes/tsconfig.json` references `../core` and `../viewer`; `apps/editor/tsconfig.json` references `../../packages/{core,viewer}` | **1 file total**, `packages/tsconfig.references.json`, listing **4** projects | `grep -rl '"references"' --include=tsconfig*.json packages plugins apps` |
| build command | `turbo run build` → per-package `tsc --build` | `tsc --skipLibCheck && vite build` with `--max-old-space-size=6144` | `package.json` `scripts.build` both sides |
| publishable to npm | **7 packages**, real semver (`@pascal-app/core@1.0.0-beta.5`), `.github/workflows/release.yml` with per-package dispatch | **3 of 153**; **149 pinned at `0.1.0`** | `node -p "require('./<f>').version"` per manifest; `node -e "process.exit(p.private===true?0:1)"` |

`packages/tsconfig.references.json` claims in its own comment (line 3) *"Run via: `tsc -b packages/tsconfig.references.json` (added to root build)"*. It is not:

```bash
grep -rn "tsconfig.references" --include=*.json --include=*.ts --include=*.mjs --include=*.yml \
  packages plugins apps tools scripts .github package.json
# → packages/tsconfig.references.json:3   (its own comment, and nothing else)
```

Root `build` is `check-project-isolation.mjs && tsc --skipLibCheck && vite build && build:server-deps && write-prod-shim.mjs` — **no `tsc -b`**. TS project references in PRYZM are **ABSENT in effect**: 74 packages set `composite: true` (which emits `.tsbuildinfo`) with no reference graph to walk.

**Consequence, measured.** Because every package exports raw `src/*.ts`, a consumer type-checks its dependencies' *source*, not their `.d.ts`. `npx tsx tools/ga-gate/check-per-package-compile.ts` → **RC=1**, full run:

```
[per-package-compile]   tsconfig-bearing packages : 97   (the population)
[per-package-compile]   compiled (tsc actually ran): 97   · floor 40
[per-package-compile]   excluded by ledger         : 8   · ceiling 8
[per-package-compile]   FAILED                     : 27
[per-package-compile]     ├ own-source errors      : 16   (actionable here)
[per-package-compile]     └ CASCADE ONLY           : 11   (zero own errors — a dependency's fault)
[per-package-compile]   passing in isolation       : 62
[per-package-compile]   NOT PROVEN to compile      : 35 of 97  ← quote THIS, not "compiled".
```

**35 of 97 tsconfig-bearing packages are not proven to compile in isolation.** Eleven of the 27 failures have *zero errors of their own*:

```
FAIL  packages/engine  [own 0 · foreign 1864 via command-registry,constraint-solver,
      core-app-model,file-format,geometry-curtain-wall,geometry-furniture,geometry-lift,
      geometry-lighting,geometry-plumbing,geometry-roof,geometry-slab,geometry-stair,
      geometry-wall,input-host,persistence-client,physics-host,room-topology,spatial-index]
      ⤷ CASCADE ONLY — zero errors in this package's own source. It fails because
        it imports a package that fails. See §MT-09-ISOLATION-IS-NOT-ISOLATED.
```

The eleven: `editor-ui, engine, geometry-beam, geometry-column, geometry-door, geometry-handrail, geometry-window, picking, renderer, ui-base, views`. The eight ledger-excluded packages — *"compiled but not counted"* — are `ai-host, command-registry, constraint-solver, core-app-model, family-instance, family-loader, headless, runtime-composer`, i.e. four of the most load-bearing packages in the tree sit outside the denominator. The ledger says this in its own words at `tools/ga-gate/per-package-compile-skip-ledger.json`: *"the exclusion list contained command-registry, core-app-model, runtime-composer and ai-host — four of the most load-bearing packages in the tree. The true position was 35 of 93 packages NOT PROVEN to compile in isolation, not 26."*

**The gate names the cause and prescribes the fix itself, in its own closing lines:**

> `Fixing these packages is not possible IN these packages. See §MT-09-ISOLATION-IS-NOT-ISOLATED: every workspace package sets "types": "./src/index.ts", so each compile drags in the full source closure of its dependencies. The fix is built .d.ts + project references, repo-wide.`

That is not this audit's recommendation imported from Pascal. It is **PRYZM's own diagnosed fix, written into the gate, and not executed** — and it is precisely the configuration Pascal already runs. Pascal's `packages/nodes` cannot be poisoned this way: `packages/core/tsconfig.json` sets `"declaration": true` (via `tooling/typescript/base.json`) + `"composite": true` + `"outDir": "dist"`, and `packages/nodes/tsconfig.json` **references** `../core`, so `nodes` type-checks against `core`'s emitted `.d.ts`.

### 2.6 Extension model — three PRYZM plugin censuses that disagree

| Source of truth | Count | Locator |
|---|---|---|
| directories on disk | **51** | `ls plugins \| wc -l` |
| `ALL_PLUGINS` (what actually gets a store + handlers at boot) | **27** | `apps/editor/src/PluginRegistry.ts:237`; `grep -oE "id: '[a-z-]+'" … \| sort -u \| wc -l` → 27 |
| `PLUGIN_CATALOG` (what `runtime.plugins.list()` reports) | **38** | `packages/runtime-composer/src/PluginHost.ts:42-89`; `sed -n '42,89p' … \| grep -c "desc("` → 38 |

Thirteen plugin directories are absent from `PLUGIN_CATALOG`:

```bash
for p in $(ls plugins); do grep -q "desc('$p'" packages/runtime-composer/src/PluginHost.ts || echo "$p"; done
# balcony boundary-line dxf export-pdf family-editor floor geospatial levels lift navigate pool render visibility-intent
```

`PluginHost.ts:6-7` states its own count as **38** and the comment at `:33` says *"Order matches `ls plugins/`"*. It has not matched `ls plugins/` for 13 entries.

| SDK adoption | Measurement |
|---|---|
| in-tree plugins calling `definePlugin()` — the SDK's declared lifecycle entry point | **0 of 51**. `grep -rn "definePlugin(" plugins packages apps` → 7 hits, all in `packages/plugin-sdk/examples/{hello,format,ai-workflow}-plugin/index.ts` and `packages/plugin-sdk/__tests__/lifecycle.test.ts` |
| plugins shipping a `plugin.manifest.json` | **5 of 51** (`bcf`, `family-editor`, `ifc-inspector`, `schedules`, `wall`) — `find plugins -name plugin.manifest.json \| wc -l` |
| plugins bypassing the L5 SDK facade | **83 files across 21 plugins**, 102 import lines (`check-l7-boundary.ts`, RC=0, ceiling 84 files) |
| bypass targets | `renderer-three` 83 · `command-registry` 32 · `core-app-model` 27 · `scene-committer` 19 |

Pascal:

| | Measurement |
|---|---|
| node-kind folders in the built-in plugin | **47** — `ls -d packages/nodes/src/*/ \| grep -v '/shared/$' \| wc -l` |
| definitions registered by `builtinPlugin.nodes` | **48** (cabinet ships two) — `sed -n '/nodes: \[/,/^  ],\?$/p' packages/nodes/src/index.ts \| grep -c 'Definition as unknown'` |
| built-ins using the **same** public `Plugin` API third parties use | **48 of 48** — `packages/nodes/src/index.ts:69` `export const builtinPlugin: Plugin = { id: 'pascal:core', apiVersion: 1, nodes: [...] }` |
| **out-of-tree** plugins wired into the shipping app | **4** — `apps/editor/package.json` dependencies: `@pascal-app/plugin-bones` (`github:pascalorg/plugin-bones#d1c3c8b`), `@pascal-app/plugin-trees` (`github:pascalorg/plugin-trees#56d978c`), `@pascal-app/plugin-streetscape` (`github:sudhir9297/streetscape-pascal-plugin#1c04ecc`), `@mint/pascal-plugin` (`github:mintdotgg/mint-pascal-plugin#902c546`) |
| of those, **third-party** (not pascalorg) | **2** (`sudhir9297`, `mintdotgg`) |
| drift gate between the schema union and the registry | **1**, bidirectional set-equality — `packages/nodes/src/index.test.ts:22-52` |

### 2.7 Reachability — workspaces nothing imports

```bash
for f in packages/*/package.json plugins/*/package.json; do
  d=$(dirname "$f"); name=$(node -p "require('./$f').name")
  n=$(grep -rlE "(from|import\(|require\()\s*\(?['\"]$name(/|['\"])" \
        --include=*.ts --include=*.tsx --include=*.js --include=*.mjs \
        packages plugins apps src server tools | grep -v node_modules | grep -v "^$d/" | wc -l)
  [ "$n" -le 1 ] && printf "%4d  %-45s %s\n" "$n" "$name" "$d"
done | sort -n
```

**29 workspaces have zero importers anywhere in the repo** (dynamic `import()` and `require()` included in the pattern):

| Kind | Workspaces |
|---|---|
| packages (16) | `a11y-tokens`, `api-spec`, `bench-visual-diff`, `beta-signup`, `data-engine`, `expr-eval`, `feature-flags`, `headless`†, `legacy-shim`, `oauth2-pkce`, `ordinance-extraction`, `pdf-to-bim`, `release`†, `render-pipeline`, `render-runtime`, `wcag-audit` |
| plugins (12) | `ai-floorplan`, `ai-generative`, `ai-query`, `ai-rules`, `ai-voice`, `dxf`, `family-editor`, `multiplayer`, `navigate`, `render`, `schedules`, `visibility-intent` |
| lint plugin (1) | `eslint-plugin-pryzm` — reachable by **name string** from `eslint.config.js`, not by import; classify **reachable** |

† `@pryzm/headless` and `@pryzm/release` are entry points by design (a headless runtime and a release tool). Excluding those three, **26 workspaces are UNREACHABLE, not ABSENT** — code exists, nothing can call it.

PRYZM is honest about at least one of them: `packages/render-runtime/package.json:33` carries a `"deprecated"` field reading *"Wave-12 DROP: @pryzm/render-runtime had 0 importers at Wave 8 close. Verdict: DROP"*. The verdict was recorded; the package was not dropped, and it is still one of the 102.

`plugins/schedules` (36 files) and `plugins/multiplayer` (14 files) are named product capabilities with zero importers. `plugins/schedules` appears only in `scripts/check/test-ci-coverage-baseline.json:82`.

### 2.8 Where PRYZM's mass actually is

| Unit | files | LOC | share of PRYZM LOC | Command |
|---|---|---|---|---|
| `apps/editor` | **1,786** | **587,012** | **33.0%** | `find apps/editor -name '*.ts*' \| grep -v node_modules \| xargs wc -l` |
| — `apps/editor/src/ui` | **1,039** | — | — | `find apps/editor/src -name '*.ts*' \| sed 's\|apps/editor/src/\|\|' \| cut -d/ -f1 \| sort \| uniq -c` |
| — `apps/editor/src/engine` | 269 | — | — | same |
| all `packages/*` (102) | 4,413 | 1,024,912 | 57.6% | `find packages …` |
| all `plugins/*` (51) | 1,028 | 120,012 | **6.7%** | `find plugins …` |
| all other `apps/*` (12) | 336 | 47,802 | 2.7% | derived |

**`apps/editor` alone (587,012 LOC) is 1.32× Pascal's entire repository (444,102 LOC).**

Top five PRYZM packages by file count: `ai-host` 546 · `core-app-model` 494 · `command-registry` 451 · `site-parcel-data` 347 · `schemas` 239.
Top five Pascal packages: `nodes` 843 · `editor` 513 · `core` 250 · `mcp` 139 · `viewer` 115.

### 2.9 Kind-name branching inside framework code

Both codebases claim per-kind behaviour should live with the kind. Both leak. Measured:

```bash
# PRYZM, 7 framework packages (core-app-model, command-registry, stores, schemas,
#                              renderer-three, scene-committer, runtime-composer)
grep -rnE "=== '(wall|door|window|slab|roof|stair|furniture|column|beam|ceiling|handrail)'" --include=*.ts <those>/src | wc -l   # 74
grep -rnE "case '(wall|door|window|slab|roof|stair|furniture|column|beam|ceiling|handrail)'"  --include=*.ts <those>/src | wc -l   # 29
grep -rnE "=== '(…)'" --include=*.ts apps/editor/src | wc -l                                                                       # 239

# Pascal, 3 framework packages (core, viewer, editor)
grep -rnE "\.type === '(wall|door|window|slab|roof|stair|item|column|zone|fence|ceiling)'" packages/{viewer,editor,core}/src | wc -l  # 431
grep -rnE "case '(wall|door|window|slab|roof|stair|item|column|zone|fence|ceiling)'"       packages/{viewer,editor,core}/src | wc -l  # 15
```

| | Pascal | PRYZM |
|---|---|---|
| kind-name branches in framework packages | **446** | **103** |
| kind-name branches in the top app | (Pascal's app is 31 files) | **239** |
| per production file, framework only | **0.30** | **0.020** |
| per-kind residue folders still in framework packages | `packages/viewer/src/systems/*` → **19** dirs (`ceiling column door elevator fence floor-elevation geometry guide interactive item item-light level roof scan slab stair wall window zone`); `packages/editor/src/components/tools/*` → **8** kind dirs | 0 (per-kind code lives in `plugins/<kind>` + `packages/geometry-<kind>`) |

**This is the honest counter-weight to everything else in this audit.** Pascal buys its 13-workspace graph by keeping 446 kind-name branches inside its framework, and 19 per-kind system folders inside `viewer` that its own review skill (`SKILL.md` §4.A) calls *"a regression to the dispatch model"* if a new one appears. `packages/nodes/src/index.ts:76-108` labels 15 of its 48 kinds "Stage A — wrap-exports the legacy renderer + system. Legacy panels / move tools / floorplan branches still serve these." Their registry migration is roughly two-thirds done.

### 2.10 Governance artefacts

| | Pascal | PRYZM | Command |
|---|---|---|---|
| markdown files in repo | **63** | **2,330** (under `docs/` alone) | P: `find . -name '*.md' -not -path './node_modules/*' \| wc -l` · Z: `find docs -name '*.md' \| wc -l` |
| binding architecture rule pages | **20** (`wiki/architecture/`), **2,562 lines** | 105 contracts + 300 ADRs + 104 SPECs | P: `wc -l wiki/architecture/*.md` · Z: `ls docs/02-decisions/contracts/ \| grep -c '^C[0-9]'` ; `ls docs/02-decisions/adrs/ADR-*.md \| wc -l` ; `find docs -name 'SPEC-*.md' \| wc -l` |
| **executable** architecture gates | **2** (§3.3) | **69** (`ls tools/ga-gate/*.ts \| wc -l`) | |
| agent skills | 2 (`.agents/skills/{open-pr,review-architecture}/SKILL.md`) | n/a (per-lane briefs) | `find .agents -name SKILL.md` |
| CI jobs | 2 (`quality`, `cli-smoke`) | many; the real gate is `ci-gate` in `deploy-fly.yml` | `.github/workflows/ci.yml` |

PRYZM's contract count re-measured today is **105**, not the 102 written in `CLAUDE.md:303` (C103 is reserved, C104–C106 are minted). This is the sixth recurrence of the count-rot `CLAUDE.md` documents about itself; `check-contract-index-equivalence.ts` is the authority.

### 2.11 Scope carried — what each product actually contains

Structural facts, not feature opinions:

| Capability | Pascal | PRYZM |
|---|---|---|
| CRDT / real-time collaboration | **ABSENT.** `grep -rlE "yjs\|y-websocket\|socket\.io\|liveblocks\|automerge\|CRDT" --include=*.ts --include=*.tsx --include=*.json packages apps` → **0 files** | `packages/sync-client` 35 files, `apps/sync-server` 55, `plugins/multiplayer` 14 |
| undo/redo mechanism | `zundo` temporal middleware over the Zustand scene store — `packages/core/package.json:83` `"zundo": "^2.3.0"`, `packages/core/src/store/use-scene.ts:4` `import { temporal } from 'zundo'`, applied at `:1287` | command bus + registry: `packages/command-bus` 28 + `packages/command-registry` 451 + `packages/runtime-undo-stack` 8 = **487 files** |
| command bus | **ABSENT** (there is a `use-command-registry.ts` for the *command palette*, not for mutation) | the mutation spine (P6) |
| IFC | **import only**, 2 files / 2,619 LOC (`packages/ifc-converter/src/{index.ts,cleanup.ts}`) over `web-ifc@0.0.77`. `grep -rln "exportIfc\|IfcExport\|writeIfc" packages apps` → **0** | `packages/file-format` 155 + `plugins/{ifc-export 47, ifc-import 16, ifc-inspector 20, bcf 18}` |
| jurisdiction / geospatial | **ABSENT** | `site-parcel-data` 347 + `ordinance-extraction` 61 + `climate-host` 21 + `solar-analysis` 13 + `street-analytics` 7 + `site-validators` 8 + `geospatial` 6 ≈ **463 files** |
| AI | MCP server, `packages/mcp` 139 files, per-kind tool descriptions declared on the definition (`NodeDefinition.mcp?: McpOverrides`, `packages/core/src/registry/types.ts:1351`) | `packages/ai-host` **546** + `ai-cost` 5 + `ai-spend` 7 + 5 `plugins/ai-*` 23 ≈ **581 files** |
| SaaS backend | Next route handlers in `apps/editor/app/api/**` (5 files) + Supabase/Postgres via `packages/mcp/storage` | `server.js` (~240 KB) + `apps/{api-gateway,marketplace-api,marketplace-web,marketplace}` + `packages/{entitlements,webhooks,admin-overrides,api-rbac,rate-limit,api-spec,email-transport,oauth2-pkce,beta-signup,ai-spend}` |
| UI framework | React 19 + `@react-three/fiber` 9 + `@react-three/drei` 10 + Next 16 | **none** — 3 `.tsx` files in 7,563; `grep -rl "@react-three/fiber" packages plugins apps` → **0** |

**Rough attribution of PRYZM's 3.5× production-LOC excess.** Of the ~896,000 production LOC PRYZM carries beyond Pascal's 356,851: jurisdiction/geospatial + AI + interop + collab + SaaS backend + typology packs account for roughly **1,900 files**. That is genuinely earned scope Pascal simply does not attempt. It is **not** where the remaining excess lives — see §5 rows A13/A14 and §6 R5/R7.

---

## 3. Pascal's design

### 3.1 Four tiers, declared in one prose block, enforced by shape

`AGENTS.md` (the only agent-instruction file; `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` are symlinks to it) states the whole model in ~15 lines:

> - **`packages/core`** owns domain data and pure logic. It must not import Three.js, `packages/viewer`, `apps/editor`, rendering/UI concepts, tools, modes, phases, or view-specific concepts such as floorplan or paint preview.
> - **`packages/viewer`** owns the standalone 3D canvas … It must not know about `useEditor`, editor tools, phases, modes, paint mode, floorplan state, or editor-only presentation vocabulary.
> - **`apps/editor`** owns the editing experience … Editor features are injected into `<Viewer>` via props and children.

`.agents/skills/review-architecture/SKILL.md` §3 makes the fourth tier explicit and names the one hard arrow:

> **`packages/nodes` — the built-in plugin (`pascal:core`).** … Depends on `editor`, `viewer`, and `core` via their public surfaces — the same surfaces a third-party plugin uses (peer-dep style). **Nothing in `core/`, `viewer/`, or `editor/` may import from `@pascal-app/nodes`.** The dependency arrow is one-way: framework code consults `nodeRegistry`, never reaches into a specific kind's folder.

The peer-dependency declaration is what makes this real, not aspirational — `packages/nodes/package.json`:

```json
"peerDependencies": {
  "@pascal-app/core": "*", "@pascal-app/editor": "*", "@pascal-app/viewer": "*",
  "@react-three/drei": "*", "@react-three/fiber": "*", "lucide-react": "*",
  "react": "*", "three": "*", "zustand": "*"
}
```

A third-party plugin's manifest is byte-for-byte the same shape. `wiki/architecture/plugin-authoring.md` says why: *"The packages are **peer dependencies**, not normal dependencies — the host app owns the version. A plugin that pins its own copy of `@pascal-app/core` would create two registries and silently fail."*

### 3.2 The registry — a plugin is data, and the framework never names a kind

`packages/core/src/registry/types.ts:919`:

```ts
export type Plugin = {
  id: string
  apiVersion: 1
  nodes?: AnyNodeDefinition[]
  /** Sections contributed to the floating node inspector card. */
  inspectorExtensions?: InspectorExtension[]
}
```

Four fields. `packages/core/src/registry/types.ts:970` opens the definition:

```ts
export type NodeDefinition<S extends ZodObject<any>> = {
  kind: string
  schemaVersion: number
  schema: S
  category: NodeCategory
  /** Opaque host/plugin contributions. Core stores but never interprets them. */
  extensions?: Readonly<Record<string, unknown>>
  surfaceRole?: SurfaceRole
  …
  defaults: () => Omit<z.infer<S>, 'id' | 'type'>
  capabilities: Capabilities
  relations?: Relations
```

The composition model is three independent optional fields — `wiki/architecture/node-definitions.md`:

> The three fields are **independent**. There is no discriminator tag — **presence is participation**.

| Field | Purpose |
|---|---|
| `geometry?: (node, ctx, shading, textures, colorPreset, sceneTheme) => Object3D` | pure builder, run by the generic `<GeometrySystem>` on dirty |
| `renderer?: () => Promise<{ default: ComponentType }>` | lazy custom React component |
| `system?: () => Promise<{ default: ComponentType }>` | lazy per-frame component |

`packages/nodes/src/wall/definition.ts:40` is the stress test — a wall is a *value*:

```ts
export const wallDefinition: NodeDefinition<typeof WallNode> = {
  kind: 'wall',
  snapProfile: 'structural',
  schemaVersion: 8,
  schema: WallNode,
  category: 'structure',
  surfaceRole: 'wall',
  extensions: { 'pascal:editor/floorplan': { … } satisfies FloorplanNodeExtension<WallNode> },
  defaults: () => ({ …, start: [0, 0], end: [3, 0], frontSide: 'unknown', backSide: 'unknown' }),
  capabilities: {
    selectable: { hitVolume: 'bbox' },
    surfaces: { top: { height: (node, { nodes }) => … }, sides: { faces: 'all' } },
    duplicable: true, deletable: true,
    paint: wallPaint,                      // ← per-kind paint dispatch, not an `if (type === 'wall')`
    slots: () => wallSlots(),
  },
  relations: {
    hosts: ['door', 'window', 'item', 'lean-to-extension'],
    affectsSpatial: ['slab', 'ceiling', 'zone'],
    linkedBy: 'endpoint-match',
    cascadeDelete: 'descendants',
  },
  parametrics: wallParametrics,
  …
```

Every axis a framework would otherwise branch on — selection, paint, hosting, cascade, plan output, snapping profile, inspector shape, MCP description — is a field.

Registration, `packages/core/src/registry/registry.ts:99-125`:

```ts
_register(def: AnyNodeDefinition): void {
  if (typeof def.kind !== 'string' || def.kind.length === 0) throw new Error('[registry] NodeDefinition.kind must be a non-empty string')
  if (typeof def.schemaVersion !== 'number' || def.schemaVersion < 1) throw new Error(…)
  if (this.defs.has(def.kind)) {
    if (isDevMode()) console.warn(`[registry] re-registering node kind "${def.kind}" (HMR)`)
    else throw new Error(`[registry] duplicate node kind: "${def.kind}" already registered`)
  }
  this.defs.set(def.kind, def)
  notifyRegistryChanged()
}
```

Two properties worth naming. **(1) Collision is a startup crash in production, an HMR warning in dev** — the exact split PRYZM's own `check-verb-register.ts` reports it lacks (`sheet.create` is a SHADOWED dead route because a second registration site silently loses). **(2) Registration bumps a monotonic version and notifies listeners** (`registry.ts:31-56`, `use-registry-version.ts`), so consumers that snapshotted the kind set at mount re-derive when a plugin loads asynchronously. That is the async-plugin problem solved once, in 25 lines, at L0.

`loadPlugin`, `packages/core/src/registry/registry.ts:349`:

```ts
export async function loadPlugin(plugin: Plugin): Promise<void> {
  if (plugin.apiVersion !== HOST_API_VERSION) {
    throw new Error(`[registry] plugin "${plugin.id}" requires apiVersion ${plugin.apiVersion}; host supports ${HOST_API_VERSION}`)
  }
  for (const def of plugin.nodes ?? []) { registerNode(def); pluginIdsByKind.set(def.kind, plugin.id) }
  …
}
```

Discovery is a replaceable function, `registry.ts:392-437`:

```ts
export type PluginDiscovery = () => Promise<Plugin[]>
const defaultPluginDiscovery: PluginDiscovery = async () => []
export function setPluginDiscovery(fn: PluginDiscovery): void { … }
export function extendPluginDiscovery(fn: PluginDiscovery): void {   // composes instead of clobbering
  const previous = pluginDiscovery
  pluginDiscovery = async () => { const [base, extra] = await Promise.all([previous(), fn()]); return [...base, ...extra] }
}
export function discoverPlugins(): Promise<Plugin[]> { return pluginDiscovery() }
```

`setPluginDiscovery` even warns when it silently drops an earlier chain (`registry.ts:409-414`) — a defect they hit, diagnosed, and fixed with a second verb rather than a comment.

### 3.3 Layer enforcement — two automated checks, one LLM reviewer, and prose

Pascal's **entire** static boundary enforcement is two things.

**(1)** `biome.jsonc` `overrides[1]` — one restricted specifier, error level, scoped to the three framework packages:

```jsonc
{ "includes": ["packages/core/**/*.ts", "packages/core/**/*.tsx",
               "packages/viewer/**/*.ts", "packages/viewer/**/*.tsx",
               "packages/editor/**/*.ts", "packages/editor/**/*.tsx"],
  "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "paths": {
    "@pascal-app/nodes": "Framework packages must not import from @pascal-app/nodes — consult nodeRegistry.get(kind) instead. See plans/editor-node-registry.md." } } } } } } }
```

**(2)** `packages/core/src/architecture.test.ts` — a 50-line bun test, run by `bun run test` in CI:

```ts
/**
 * Layer rule (AGENTS.md): core is pure logic — no Three.js, no rendering.
 * A runtime `three`/`@react-three/*` import in core evaluates R3F (and thus
 * React client context) in every consumer of the barrel, which crashes
 * Next.js route handlers under the RSC server condition (capture uploads
 * 500'd this way once). Type-only imports are erased at build and allowed.
 */
…
    expect(offenders).toEqual([])
    // Guard against the walk passing vacuously.
    expect(files.length).toBeGreaterThan(100)
```

Two details to steal. The doc comment records the **incident** that motivated the rule ("capture uploads 500'd this way once"), and the last assertion is a **vacuity guard** — the test fails if the file walk stopped finding files. PRYZM's gates have the same instinct (`check-l7-boundary` prints `files scanned: 820 (floor 500)`) and it is worth noting both codebases independently arrived at it.

Everything else is `wiki/architecture/` prose (2,562 lines across 20 pages) executed by an LLM. `.agents/skills/review-architecture/SKILL.md` is a genuinely serious artefact: it loads seven mandatory rule pages, fetches the diff, and runs an explicit **layer-classification pass before the checklist**:

> For every new file, new type, new store field, or new exported helper introduced by the diff, answer one question: **which package does this belong to — `core`, `viewer`, `editor`, or `nodes`?** … This is the most common and most damaging class of violation, and the checklist below won't reliably catch it on its own — do this pass explicitly.

It then gives seven *grep-shaped* heuristics ("Does the name contain an editor-specific word? (`Floorplan`, `Paint…`, `Draft…`, `Marquee`, `CursorBadge`…)"), names its own known-legacy exceptions with file paths, and ends with:

> If the PR fully complies, say so explicitly — do not invent nits to appear thorough.

**Verdict on the mechanism:** it has no exit code and no baseline. It is a *probabilistic* reviewer. It is also demonstrably sufficient at 13 workspaces and 28 edges: measured upward imports are **0** (§2.3).

`.github/workflows/ci.yml` is two jobs, `quality` (`bun run check` = biome, `check-types` = turbo `tsc`, `test`, `build`) and `cli-smoke`. The bun version is pinned with a comment explaining why:

> Pinned to match `packageManager` in package.json. Unpinned, this floats to whatever bun is latest, so a bun release can break the gate with no change in the repo — and CI then disagrees with what contributors run.

### 3.4 Composition root — 100 lines, at the app, with three named hazards

`apps/editor/lib/bootstrap.ts` is the whole thing. Its shape:

```ts
import { builtinPlugin } from '@pascal-app/nodes'
import { bonesHostPanel, bonesPlugin } from '@pascal-app/plugin-bones'
import { streetscapeHostPanel, streetscapePlugin } from '@pascal-app/plugin-streetscape'
import { treesHostPanel, treesPlugin } from '@pascal-app/plugin-trees'
import { mintHostPanel, mintPlugin } from '@mint/pascal-plugin'
…
function loadBuiltinsSync(): void {
  if (builtinsLoaded) return
  builtinsLoaded = true
  for (const def of builtinPlugin.nodes ?? []) {
    if (nodeRegistry.has((def as AnyNodeDefinition).kind)) continue   // HMR guard
    registerNode(def as AnyNodeDefinition)
  }
  …
}
export async function loadExternalPlugins(): Promise<void> {
  if (externalsKickedOff) return
  externalsKickedOff = true
  for (const plugin of await discoverPlugins()) await loadPlugin(plugin)
}

extendPluginDiscovery(async () => [treesPlugin]);      registerEditorHostPanel(treesHostPanel)
extendPluginDiscovery(async () => [bonesPlugin]);      registerEditorHostPanel({ ...bonesHostPanel, defaultInstalled: false })
extendPluginDiscovery(async () => [mintPlugin]);       registerEditorHostPanel(mintHostPanel)
extendPluginDiscovery(async () => [streetscapePlugin]); registerEditorHostPanel({ ...streetscapeHostPanel, creator: { name: 'Sudhir Yadav', … } })

loadBuiltinsSync()
void loadExternalPlugins()
```

**The whole cost of adding an element kind to Pascal is appending one line to `packages/nodes/src/index.ts`.** The bootstrap does not change. It never names a kind.

Three hazards are documented in-place with their symptoms, which is worth reproducing because PRYZM has the same three and solves two of them in different files:

- **sync vs async registration.** `bootstrap.ts:33-40`: *"Runs as a side effect at module import time so the registry is populated before any downstream React tree renders — the previous async kick-off … only registered in a microtask, letting the first SSR / hydration pass see an empty registry. The mismatch surfaced as a hydration error at the `<html>` element and every `NodeRenderer` resolving to `null`."*
- **server/client module instances.** `app/client-bootstrap.tsx:1-11`: *"without this the registry is empty on the client (the server registers in its own module instance, which is unreachable from hydrated pages)."*
- **HMR idempotency.** `bootstrap.ts:18-21`: *"Flags live in the module closure so they reset on a hard reload but survive within a session."*

### 3.5 Build and distribution — the package boundary is a *published* boundary

`tooling/typescript/base.json` sets `declaration: true`, `declarationMap: true`, `verbatimModuleSyntax: true`, `noUncheckedIndexedAccess: true`, `strict: true`. Each emitting package sets `composite: true`, `incremental: true`, `outDir: dist`, `rootDir: src`, and **excludes its own tests from the emit**:

```jsonc
// packages/nodes/tsconfig.json
{ "extends": "@pascal/typescript-config/base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "noEmit": false,
                       "composite": true, "incremental": true, "jsx": "react-jsx" },
  "include": ["src"], "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"],
  "references": [{ "path": "../core" }, { "path": "../viewer" }] }
```

`packages/core/package.json` `scripts.build` is `tsc --build`; `turbo.json` declares `build.dependsOn: ["^build"]` so the graph orders itself. Seven packages publish to npm with independent semver via `.github/workflows/release.yml` (a `workflow_dispatch` with `package` ∈ {core, viewer, editor, nodes, mcp, ifc-converter, cli, all} and `bump` ∈ {patch, minor, major, beta, none}), and `packages/core` is at `1.0.0-beta.5`, `mcp` at `1.0.0-beta.6`, `cli` at `1.0.0-beta.1`.

**Publication is the enforcement.** You cannot accidentally reach into `@pascal-app/core`'s internals from `nodes`, because what `nodes` compiles against is `core/dist/index.d.ts` and the subpath exports map (`./registry`, `./schema`, `./store`, `./wall`, `./spatial-grid`, `./stair-openings` — `packages/core/package.json` `exports`).

### 3.6 Pascal's own debt — measured, not taken on faith

| Debt | Measurement |
|---|---|
| kind-name branching in framework packages | **446** `.type === '<kind>'` + **15** `case '<kind>':` (§2.9) — the exact pattern `SKILL.md` §4.A calls a blocker for *new* code |
| per-kind residue in `viewer` | **19** system folders under `packages/viewer/src/systems/` |
| per-kind residue in `editor` | **8** tool folders under `packages/editor/src/components/tools/` |
| registry migration incomplete | `packages/nodes/src/index.ts:76,88` — 15 of 48 kinds are "Stage A — wrap-exports the legacy renderer + system" |
| god file | `packages/editor/src/components/editor/floorplan-panel.tsx` — **11,639 lines**. `SKILL.md` §4.B: *"New inline branches in `floorplan-panel.tsx` are a blocker"* — the file is frozen, not fixed |
| second god file | `packages/core/src/material-library.ts` — 4,259 lines |
| stale prose in the top-level agent file | `AGENTS.md` "Repo Shape" says `apps/editor` "composes viewer + editor + tools". `apps/editor` is **31 files / 4,320 LOC** and contains no tools; tools live in `packages/editor/src/components/tools` (66 files) and `packages/nodes/src/<kind>/tool.tsx`. `SKILL.md` repeats it: *"editor tools live only in `apps/editor/components/tools/` or `packages/nodes/src/<kind>/`"* — the first path **does not exist** (`ls apps/editor/components` → 5 files, no `tools/`) |
| `as unknown as` at the registry seam | `packages/nodes/src/index.ts:71-…` — **all 48** definitions are registered as `xDefinition as unknown as AnyNodeDefinition`. The generic `NodeDefinition<S>` does not assign to `AnyNodeDefinition` and the gap is bridged with a double cast, 48 times |
| type-safety escapes globally disabled | `biome.jsonc` turns **off** `noExplicitAny`, `noUnusedVariables`, `noNonNullAssertion`, `noExcessiveCognitiveComplexity`, `noImplicitAnyLet`, `noEvolvingTypes`, `useAwait` |
| depth-1 clone | I could not read their history, so I cannot say whether these are shrinking (see §8.3) |

`AGENTS.md` being wrong about where tools live is the same defect class `CLAUDE.md` records about itself five times. Pascal is not immune; they just have 63 markdown files to rot instead of 2,330.

---

## 4. PRYZM's design

### 4.1 Eight layers, a real gate, and a top that sits outside the model

The layer table lives in `eslint.config.js` and is consumed — not copied — by `tools/ga-gate/check-layer-boundaries.ts`. The gate's header is one of the best pieces of engineering prose in either repository, and it names precisely why it does not use a resolver:

```
 * **Resolver-based checking is what produced the inconsistency in the first
 * place.** pnpm symlinks some `@pryzm/*` packages into a given package's
 * node_modules and not others … A resolver therefore catches a violation in one
 * package and silently skips the identical one next door, with no signal either
 * way. **A gate that fires unpredictably is worse than one that is off**, because
 * people trust it.
```

It resolves `@pryzm/X` → directory by reading each workspace `package.json` `name`. That is exactly right, and Pascal has no equivalent.

Two structural blind spots remain, both measured:

1. **The app entry is not in the model.** `index.html:429` is `<script type="module" src="/src/main.ts">`. `src/` is not a workspace, so `check-layer-boundaries.ts` — which iterates workspace manifests — never classifies it. `src/main.ts` imports `@app/ui/platform/PlatformRouter`, `@app/ui/PanelManager` and `@app/engine/engineWarmup` via the root-tsconfig path aliases (`tsconfig.json:24-27`), i.e. it reaches into `apps/editor/src` by path, not by package name. The composition summit is ungoverned.
2. **15 packages have no layer at all** and the gate says so in its own words: *"⚠ 15 package(s) have NO layer. The gate cannot judge any import to or from them"*. Two of them — `@pryzm/geometry-boundary-line` and `@pryzm/geometry-handrail` — are element-geometry packages, exactly the population the layer model exists to order.

### 4.2 The composition root — singular by definition, plural in practice

`packages/runtime-composer/src/composeRuntime.ts:895` is the one `composeRuntime`, and `check-single-compose.ts` proves it (1 definition, 0 rivals). The gate is admirably honest about what it cannot decide:

```
 * It cannot tell a delegating wrapper (`headlessRuntime` → `composeRuntime`) from
 * a genuine second composition root by static shape alone — both call the same
 * function. Check 3 is therefore a TRIPWIRE on the number of entry points, not a
 * proof of singularity.
```

What the gate is blind to is not a second `composeRuntime` — it is a second **registration surface**. Measured:

| Surface | Where | What it wires | distinct `@pryzm/plugin-*` imports |
|---|---|---|---|
| A | `apps/editor/src/PluginRegistry.ts` (**1,184 lines**) → `ALL_PLUGINS` (`:237`, **27** descriptors) → `bootstrap.everything.ts:136-180` → `composeRuntime()` | stores + bus handler sets | **30** |
| B | `apps/editor/src/engine/engineLauncher.ts` (**1,530 lines**) | 24 direct `registerXHandlers()` calls (`:81-107`) | **25** |

```bash
for f in $(grep -rl "@pryzm/plugin-" --include=*.ts --include=*.tsx apps packages plugins src | grep -v node_modules); do
  n=$(grep -ohE "@pryzm/plugin-[a-z-]+" "$f" | sort -u | wc -l); [ "$n" -ge 8 ] && printf "%3d  %s\n" "$n" "$f"; done | sort -rn
#  30  apps/editor/src/PluginRegistry.ts
#  25  apps/editor/src/engine/engineLauncher.ts
#  12  apps/editor/__tests__/hello-12-elements.test.ts
#  12  apps/editor/__tests__/bootstrap.everything.test.ts
```

Five bootstrap files exist under `apps/editor/src/`: `bootstrap.ts` (159), `bootstrap.data.ts` (130), `bootstrap.everything.ts` (251), `bootstrap.render.ts` (147), `bootstrap.render.everything.ts` (274) — **961 lines** of bootstrap, plus 1,184 of registry, plus 1,530 of engine launcher, plus 1,944 of `composeRuntime.ts` = **5,619 lines of composition**, against Pascal's **~100**.

### 4.3 The plugin contract type lives at L7 — this is the root cause

`apps/editor/src/PluginRegistry.ts:133`:

```ts
export interface PluginDescriptor {
  readonly id: string;
  readonly storeKey: string;
  readonly buildStore: () => Store<object> | undefined;
  readonly buildHandlers: (deps: PluginDeps) => readonly CommandHandler<unknown>[];
  readonly buildAuxiliaries?: () => Readonly<Record<string, unknown>>;
  readonly contributions?: readonly PluginContribution[];
  readonly wireSubscriptions?: (runtime: RoomEventRuntime) => () => void;
}
```

The type is defined in **`apps/editor` — L7**, the top of the model. `PluginRegistry.ts:13-17` states the consequence and calls it a decision:

```
// Layering note.  Each `PluginDescriptor` is constructed in this file
// (apps/editor → plugins is the correct dep direction; the reverse would
// require plugins to import editor types and would reintroduce a cycle).
// Per-plugin `descriptor.ts` files were considered and rejected on those
// grounds; the descriptor records below are the single source of truth.
```

The reasoning is locally correct and globally load-bearing. Because `PluginDescriptor` is at L7, **a plugin cannot describe itself** without an upward import. Therefore all 27 descriptors must be hand-written in one L7 file. Therefore the composition root must import 30 plugins by name. Therefore the census is hand-maintained. Therefore it drifts.

Contrast the same decision in Pascal: `Plugin` and `NodeDefinition` are declared at `packages/core/src/registry/types.ts:919`/`:970` — the **bottom** layer. A plugin describing itself is a *downward* import, which is always legal. The entire difference between an open and a closed extension model is which end of the stack the contract type sits at.

### 4.4 What the closed model costs — four families shipped undispatchable

`PluginRegistry.ts` documents its own defect history, and it is the most valuable evidence in this audit because it is PRYZM's own measurement, not mine.

`PluginRegistry.ts:79-87`:

```
// ---- 5 non-canonical element plugins (E-finish.0.E) ----
// These five plugins (furniture, plumbing, rooms, structural, dimensions)
// shipped their store + handler set in earlier sprints (S25-S29) but were
// never registered in the L7 editor's PluginRegistry — they were
// orphaned, present in `plugins/*/` but invisible to
// `bootstrapWithEverything()`.
```

`PluginRegistry.ts:410-423` (balcony):

```
// ⭐ THIS DESCRIPTOR IS THE WHOLE REACHABILITY FIX, WRITTEN BEFORE THE DEFECT
// RATHER THAN AFTER IT. The pool sat in this repo for weeks, fully built and fully
// tested, and could not be dispatched AT ALL because these five lines did not
// exist (§FIX-POOL-UNREACHABLE, L-5200). The production storesProvider is
// `storesAsRecordView(stores)` over `stores[plugin.storeKey]` accumulated from
// `ALL_PLUGINS` (bootstrap.everything.ts), so a plugin with no descriptor here
// contributes no store key, and `CommandBus.buildContext` THROWS
//     "balcony.create: required store 'balcony' is missing from HandlerContext.stores"
// BEFORE any mutation — registered and undispatchable.
```

`PluginRegistry.ts:507-520` (boundary-line) names the full list:

```
// ⭐ AXIS 2 OF THE FOUR-AXIS REACHABILITY CHECK — THE ONE THAT THROWS SILENTLY.
// … That is
// the `pool` defect (L-5200), the `lift` defect (L-5700) and the `lighting` defect
// before both, and it is why
// `apps/editor/__tests__/boundaryLineReachableThroughComposedRuntime.test.ts` reads
// `rt.stores.boundaryLine` off the REAL composition root and never builds a store of
// its own. A plugin's own suite CANNOT catch this: it supplies the provider that was
// broken.
```

**Five element families — furniture, plumbing, rooms, structural, dimensions — plus lighting, pool, lift and balcony have each been fully built, fully tested, and undispatchable, for the same reason, nine times.** The mitigation shipped each time is a *per-family reachability test*: `poolReachableThroughComposedRuntime.test.ts`, `liftReachableThroughComposedRuntime.test.ts`, `balconyReachableThroughComposedRuntime.test.ts`, `boundaryLineReachableThroughComposedRuntime.test.ts`. That is N tests to cover N families with the (N+1)th uncovered by construction. The general fix — one gate over the census — has not been written.

The current cost is visible in `check-tool-activator-coverage.ts` → **RC=1**:

```
[tool-activator-coverage] 23 declared matrix tool id(s) · 51 registered activator id(s)
                          · ARM A uncovered 3/0 · ARM B phantom 0/0
ARM A FAIL — 3 declared tool id(s) have NO registered activator (baseline 0):
    · balcony  · boundary-line  · pool
  runtime.tools.activate() on these records an active-tool id and arms NOTHING.
```

and in `check-verb-register.ts` → **RC=1**:

```
V4 11 NEW UNKNOWN-liveness verb(s): balcony.create, balcony.delete, balcony.updateProfile,
   boundaryLine.attach, boundaryLine.create, boundaryLine.delete, boundaryLine.detach,
   boundaryLine.update, lift.create, lift.delete, room.setColourMode.
V4 1 NEW SHADOWED verb(s): sheet.create.
   A second registration site cannot register — initBusHandlers.ts:2202 skips it.
```

### 4.5 The SDK is a facade nobody is behind

`packages/plugin-sdk/src/index.ts` is 693 lines and 48 export statements. Its header states the contract:

```
// Wave-12 (S98-S100) added:
//   • Re-exports from @pryzm/command-bus, @pryzm/stores, @pryzm/schemas,
//     @pryzm/scene-committer, @pryzm/geometry-kernel, @pryzm/view-state,
//     @pryzm/frame-scheduler, @pryzm/sync-client, @pryzm/renderer so that
//     L7 plugins import ONLY from '@pryzm/plugin-sdk'.
// Anything you can import from here is locked for v1.x per ADR-0038 §A.
```

It ships a genuinely ambitious surface: a Zod-validated `PluginManifestSchema`, `definePlugin()` lifecycle, `HostProxies` (`CommandBusProxy`/`StoresProxy`/`ViewsProxy`/`SelectionProxy`/`AiProxy`/`FormatProxy`), an iframe sandbox with `buildPluginCSP`/`ESCAPE_VECTORS`, Ed25519 `signing.ts` with a revocation list, and `tracing.ts`.

**None of it is used by any of the 51 in-tree plugins.** `definePlugin()` → 0 in-tree call sites; `plugin.manifest.json` → 5 of 51; SDK bypasses → 83 files across 21 plugins. `plugins/wall/plugin.manifest.json` declares `"contributions": [{ "kind": "tool", "id": "wall.draw", … }, { "kind": "panel", … }]` — and the tool is nevertheless registered by hand in `apps/editor/src/ui/layout/ToolsAreaLayout.ts` (per `check-tool-activator-coverage.ts`'s own FIX instruction). The manifest is authored and unread.

`plugins/wall/src/index.ts` shows the actual contract: a barrel exporting ~30 named symbols (`WallStore`, `WallSystemTypeStore`, `buildWallHandlerSet`, `CreateWallHandler`, `WALL_TYPE_BATCH_REPORT_EVENT`, …) which the L7 registry then imports by name (`PluginRegistry.ts:43-48`). A "plugin" in PRYZM is a workspace package with a `plugin-` prefix and a hand-consumed barrel — it is a **module**, not a plugin.

### 4.6 Where PRYZM's structure is genuinely load-bearing

Stated plainly so §5 is not read as a one-sided verdict.

- **`packages/schemas` as a pure L0** — `check-domain-purity.ts` hard-fails at 0 impurities across 165 files. Pascal's equivalent (`packages/core/src/schema`, 77 files) sits inside a package that also holds the store, the registry, the event bus and 34 `lib/` math files — a 250-file package with one gate on it. PRYZM's separation is finer and the gate is stricter.
- **`packages/frame-scheduler` as its own L1 with a single-rAF gate** — `check-raf-count.ts`, exactly 1 owner. Pascal has no equivalent invariant; R3F owns the loop and per-kind `def.system` components mount `useFrame` freely (`wiki/architecture/node-definitions.md` cites "door-animation runs at priority 2, geometry rebuild at priority 3" as a convention, not a checked one).
- **`packages/renderer-three` as the single THREE owner** — `check-three-imports.ts`, 0 importers outside. Pascal's `core` is THREE-free (checked) but `viewer`, `editor` and `nodes` all import THREE directly; there is no single owner and no gate that there should be.
- **The geometry/plugin split** is why PRYZM's framework has 103 kind-name branches to Pascal's 446. The split works; it is the *registration* half that does not.

---

## 5. Head-to-head

| Sub-axis | Pascal (file:line) | PRYZM (file:line) | Winner | Why, in one sentence | Evidence |
|---|---|---|---|---|---|
| **A1** Graph density per unit of code | 13 nodes / 28 edges / 356,851 prod LOC = **0.78 edges per 10k LOC** | 166 nodes / 487 edges / 1,253,273 prod LOC = **3.89** | **PASCAL** | PRYZM's graph is 5× denser per line, and density is the thing you pay maintenance on. | §2.2 |
| **A2** Layer-model shape | 4 tiers, one arrow that matters (`framework ↛ nodes`), `AGENTS.md` | 8 layers, `eslint.config.js` table | **DIFFERENT-BY-DESIGN** | 8 layers is the right answer for 166 workspaces and the wrong answer for 13; neither model is portable to the other's scale. | §2.3 |
| **A3** Layer-enforcement *mechanism* | 1 biome `noRestrictedImports` rule + 1 bun test (`packages/core/src/architecture.test.ts`) + an LLM skill with no exit code | `tools/ga-gate/check-layer-boundaries.ts` — resolver-free, workspace-manifest-based, ratcheted, coverage counted as a first-class number | **PRYZM** | PRYZM's gate is deterministic, ratcheted, and reports its own blind spots; Pascal's third leg is a probabilistic reviewer. | `check-layer-boundaries.ts` header; `biome.jsonc` overrides[1] |
| **A4** Layer-enforcement *result* | **0** upward imports, **0** framework→plugin imports, **0** unclassified | **103**/102 upward (**RED**), **60** framework→plugin, **15**/13 unclassified (**RED**), **179** SDK bypasses, **121**/113 banned third-party (**RED**) | **PASCAL** | The invariant either holds or it does not, and Pascal's holds at hard zero while PRYZM's is a ratchet currently above its own ceiling on three arms. | §2.3, §2.4; gate RC=3 |
| **A5** Compilation boundary | 6 of 8 packages export `dist/*.d.ts`; `composite` + real `references`; consumers cannot be poisoned by a dependency's internal errors | **152 of 152** export raw `src/*.ts`; 74 `composite: true` with **1** references file wired to **nothing**; **35 of 97** packages NOT PROVEN to compile in isolation, **11** of them with zero own errors | **PASCAL** | PRYZM has 102 package manifests and zero compile boundaries, and its own gate says so: *"The fix is built .d.ts + project references, repo-wide."* | §2.5; `check-per-package-compile.ts` RC=1 |
| **A6** Composition root — singularity | one call site, no gate | one definition, **0 rivals**, proven by `check-single-compose.ts` (RC=0) | **PRYZM** | PRYZM proves the property; Pascal merely has it. | gate output |
| **A7** Composition root — wiring cost | `apps/editor/lib/bootstrap.ts`, **~100 lines**, names **0** kinds | 5,619 lines across `PluginRegistry.ts` (1,184) + `engineLauncher.ts` (1,530) + 5 `bootstrap*.ts` (961) + `composeRuntime.ts` (1,944); names **30** plugins in one file and **25** in another | **PASCAL** | Adding a kind costs Pascal one array entry and PRYZM an edit in ≥4 hand-maintained places across two layers. | §3.4, §4.2 |
| **A8** Extension contract — where the type lives | `Plugin`/`NodeDefinition` at `packages/core/src/registry/types.ts:919`/`:970` — **bottom** layer | `PluginDescriptor` at `apps/editor/src/PluginRegistry.ts:133` — **top** layer, and `:13-17` records that per-plugin descriptors were considered and rejected because of it | **PASCAL** | A contract type at the bottom lets a plugin describe itself with a legal downward import; at the top it forces a hand-written central table, which is the single root cause of A9–A11. | §4.3 |
| **A9** Extension contract — dogfooding | **48 of 48** built-in kinds go through the same `Plugin`/`loadPlugin` path third parties use (`packages/nodes/src/index.ts:69`); `plugin-authoring.md`: *"there's no 'internal' plugin format"* | **0 of 51** in-tree plugins call `definePlugin()`; **5 of 51** ship a `plugin.manifest.json`, and `plugins/wall/plugin.manifest.json`'s `contributions` are not read by the tool registrar | **PASCAL** | An SDK that no first-party consumer uses has never been falsified by a real caller. | §2.6 |
| **A10** Extension model — third-party proof | **4** out-of-tree plugins wired into the shipping app, **2** by non-pascalorg authors, pinned by git SHA in `apps/editor/package.json` | marketplace apps + signing + sandbox exist; **0** out-of-tree plugins in the tree | **PASCAL** | Pascal's plugin API is proven by strangers shipping against it; PRYZM's is proven by three examples inside its own SDK package. | `apps/editor/package.json` deps; `grep definePlugin` |
| **A11** Census consistency / drift gate | `packages/nodes/src/index.test.ts:22-52` — bidirectional set-equality between the `AnyNode` schema union and the registered kind set; drift is a CI failure | **three** rival censuses: `ls plugins/` **51** · `ALL_PLUGINS` **27** (`PluginRegistry.ts:237`) · `PLUGIN_CATALOG` **38** (`PluginHost.ts:42`), with **13** directories absent from the catalog; **no gate compares them** | **PASCAL** | Pascal wrote the set-equivalence gate for its registry; PRYZM wrote the identical gate for its *contract index* (`check-contract-index-equivalence.ts`) and not for its element registry, which is the one that breaks at runtime. | §2.6 |
| **A12** Kind-name branching in framework code | **446** `.type === '<kind>'` + 15 `case` in `core`/`viewer`/`editor`; 19 per-kind system folders still in `viewer` | **103** in 7 framework packages; **0** per-kind residue folders | **PRYZM** | PRYZM's per-family package split genuinely removed the branching Pascal still carries; this is the clearest thing PRYZM's extra structure bought. | §2.9 |
| **A13** Dead workspaces | 0 of 13 unreachable | **26** of 153 unreachable (excluding 3 legitimate entry points), incl. `plugins/schedules` (36 files), `plugins/multiplayer` (14), `packages/render-runtime` (whose own `package.json:33` records a **DROP verdict** never executed) | **PASCAL** | 17% of PRYZM's non-app workspaces are code nothing can call, and each still costs a manifest, a tsconfig, a vitest config and a row in every census. | §2.7 |
| **A14** Top-layer mass | `apps/editor` = 31 files / 4,320 LOC; the editor UI is in `packages/editor` (513 files) *below* the app, so it is reusable and boundary-checked | `apps/editor` = **1,786 files / 587,012 LOC = 33% of the repo**, of which `src/ui` is **1,039 files**; nothing may depend on L7, so none of it is reusable and no inter-package gate reaches inside it | **PASCAL** | PRYZM's single largest unit is one third of the codebase, sits where the layer model enforces nothing, and is 1.32× Pascal's entire product. | §2.8 |
| **A15** Governance volume vs enforcement | 20 rule pages / 2,562 lines / **2** executable checks; `creating-rules.md`: *"Add a new page when the same mistake has been made twice — not preemptively"* | 105 contracts + 300 ADRs + 104 SPECs + 2,330 docs / **69** executable gates | **DIFFERENT-BY-DESIGN** | PRYZM measures far more and therefore knows far more about itself; Pascal writes ~2% as much doc and its invariants hold — both are internally consistent responses to their own graph size. | §2.10 |
| **A16** Doc-as-agent-instruction | one `AGENTS.md` symlinked to `CLAUDE.md`/`GEMINI.md`/`copilot-instructions.md`; `.agents/skills/` symlinked to `.claude`/`.cursor`/`.codex` — **one file, four agents** | `CLAUDE.md` only; per-lane briefs constructed ad hoc | **PASCAL** | One canonical instruction file symlinked per vendor cannot drift between agents; four separate files can. | `AGENTS.md` "Repo Shape"; `ls -la .claude` |
| **A17** Publication boundary | 7 packages on npm with independent semver (`@pascal-app/core@1.0.0-beta.5`) + `release.yml` per-package dispatch | 150 of 153 `private: true`; **149 pinned at `0.1.0`** | **PASCAL** | Publishing is the only boundary enforcement that cannot be bypassed by a relative path or a symlink. | §2.5 |
| **A18** Scope carried | no CRDT (`grep -rlE "yjs\|socket\.io\|automerge…"` → **0 files**), no command bus, IFC **import only** (2 files), no jurisdiction, no billing | CRDT + sync-server, command bus (487 files incl. registry), IFC import **and** export + BCF, jurisdiction/geospatial (~463 files), AI host (546), marketplace, billing | **PRYZM** | PRYZM does substantially more, and roughly 1,900 files of its excess are capabilities Pascal does not attempt at all — that part of the 4× is earned outright. | §2.11 |
| **A19** UI framework | React 19 + R3F + Next 16 (486 `.tsx`); scene reconciliation, mount/unmount, disposal and prop-binding come from R3F | vanilla TS (**3** `.tsx` in 7,563); reconciliation hand-built across `renderer` 23 + `renderer-three` 96 + `scene-committer` 28 + `frame-scheduler` 26 + `picking` 12 + `render-runtime` 6 + `render-pipeline` 7 = **198 files** | **DIFFERENT-BY-DESIGN** | R3F is a large free lunch and a large framework dependency; a hand-built committer is more code and more control — both are defensible, but PRYZM should be explicit that ~200 files are the price of that choice. | §2.11 |
| **A20** CI shape | 2 jobs: `quality` (biome → tsc → bun test → build) and `cli-smoke` (packs the CLI on macOS and boots the runtime); bun pinned with a written rationale | 69 gates + `ci.yml` with two deliberate `continue-on-error` jobs; the real merge gate is `ci-gate` in `deploy-fly.yml` | **DIFFERENT-BY-DESIGN** | Pascal's CI is small and *complete* (every job blocks); PRYZM's is large and *partial* (some jobs advisory) — the right shape depends on whether you can afford to be blocked. | `.github/workflows/ci.yml` both sides; `CLAUDE.md` §CI |

**Tally: PASCAL 12 · PRYZM 4 · DIFFERENT-BY-DESIGN 4** (`grep -oE '\*\*(PASCAL|PRYZM|EQUAL|DIFFERENT-BY-DESIGN)\*\* \|' | sort | uniq -c` over this table — a first draft of this line said 10/4/5 from memory and was wrong, which is the defect class this audit is about; re-run the grep rather than trust the sentence).

**⛔ Do not read the tally as a score.** Rows are not equal weight, and counting them would make **A16** (which agent-instruction file is symlinked) equal to **A4** (whether the layer invariant holds). Two structural readings matter:

1. **Eight of the twelve Pascal wins are one causal chain, not eight findings.** A8 → A9 → A10 → A11, plus A7 and A13, all follow from a single placement decision: the plugin contract type sits at the **top** of PRYZM's stack (`apps/editor/src/PluginRegistry.ts:133`) and at the **bottom** of Pascal's (`packages/core/src/registry/types.ts:919`). Fix that one thing (R2) and six rows move at once. A5 and A17 are a second, independent chain — packages that export source are not packages.
2. **The four PRYZM wins are not consolation rows.** A3 (a deterministic, self-limiting layer gate), A6 (a *proven* single composition root), A12 (103 kind-branches vs Pascal's 446) and A18 (roughly 1,900 files of capability Pascal does not attempt) are each things Pascal has no answer to at all. A12 in particular is the payoff for the per-family package split — the very structure whose *registration* half this audit spends most of its length criticising. **The split is right; the table above it is wrong.**

---

## 6. What PRYZM should adopt

Ranked by value-over-cost. Every row is written to be executed by a lane that has not read this document.

| # | Change | Files to touch | Effort | Value | Risk | Blast radius | Contract/ADR impact | Prerequisite |
|---|---|---|---|---|---|---|---|---|
| **R1** | **Mint `tools/ga-gate/check-plugin-census-equivalence.ts`** — a SET comparison, in **all three directions**, between `ls plugins/`, `ALL_PLUGINS` (`apps/editor/src/PluginRegistry.ts:237`) and `PLUGIN_CATALOG` (`packages/runtime-composer/src/PluginHost.ts:42`). Model it on `tools/ga-gate/check-contract-index-equivalence.ts`, which already does exactly this for contracts, and on `packages/nodes/src/index.test.ts:22-52`, which does it for Pascal's registry. Report **sets, never a count** — a right count with a wrong range is the failure `CLAUDE.md` records six times. Baseline the 13 currently-missing catalog entries as a named, shrink-only ledger; hard-0 the `ALL_PLUGINS`-vs-`plugins/` arm for any plugin that exports a `build*HandlerSet`. | new: `tools/ga-gate/check-plugin-census-equivalence.ts` + `plugin-census-ledger.json`; read-only: `PluginRegistry.ts`, `PluginHost.ts` | **S** | **Highest.** Closes the defect class that shipped 9 element families undispatchable (§4.4) and replaces N per-family reachability tests with 1 gate. | Low — new gate, no production code touched. | none (tooling only) | none needed; cite C11 §6 + C84 | none |
| **R2** | **Move `PluginDescriptor` from L7 to L5.** Relocate the interface at `apps/editor/src/PluginRegistry.ts:133-171` into `packages/plugin-sdk/src/descriptor.ts` (it already hosts `PluginManifestSchema`), re-export from `apps/editor/src/PluginRegistry.ts` for compatibility. Then let each plugin export its own `descriptor.ts` — `plugins/<x>/src/descriptor.ts` importing `@pryzm/plugin-sdk` is a **downward** import and therefore legal. `PluginRegistry.ts:13-17` explicitly rejected per-plugin descriptors *because* the type was at L7; moving the type removes the objection. **Invariant that must not break:** `check-layer-boundaries.ts` upward count must not rise (it should *fall* — `plugin → plugin-sdk` is L6→L5). **Proof it worked:** `ALL_PLUGINS` becomes a `readonly PluginDescriptor[]` assembled from imported descriptors, and deleting a descriptor from a plugin fails that plugin's own suite. | `packages/plugin-sdk/src/{descriptor.ts,index.ts}`, `apps/editor/src/PluginRegistry.ts`, `packages/runtime-composer/src/types.ts` | **M** | **Highest.** This is the single root cause behind A8–A11; every other extension-model finding is downstream of it. | Medium — the type moves, 27 construction sites re-point. Type-only change; no runtime behaviour. | 27 descriptors + 2 composition files | new ADR: "plugin descriptor ownership moves to L5"; amends C11 §6.3 | R1 (so drift is caught while this lands) |
| **R3** | **Delete or ledger the 26 unreachable workspaces** (§2.7). Start with the three that carry a *recorded* verdict or a product name: `packages/render-runtime` (`package.json:33` already reads `"deprecated": "Wave-12 DROP … 0 importers at Wave 8 close. Verdict: DROP"`), `plugins/schedules` (36 files), `plugins/multiplayer` (14 files). For each, decide **DROP** or **WIRE**, and write the decision into a `tools/ga-gate/unreachable-workspace-ledger.json` with an owner and an exit condition. Then add an arm to R1's gate: a workspace directory with 0 importers and no ledger row is a FAIL. **Proof it worked:** `ls packages/*/package.json plugins/*/package.json \| wc -l` falls, or every remaining zero-importer workspace has a ledger row. | `packages/{render-runtime,a11y-tokens,api-spec,data-engine,expr-eval,feature-flags,legacy-shim,oauth2-pkce,ordinance-extraction,pdf-to-bim,render-pipeline,wcag-audit,beta-signup,bench-visual-diff}`, `plugins/{ai-*,dxf,family-editor,multiplayer,navigate,render,schedules,visibility-intent}` | **S** per decision, **M** total | High — removes 17% of the non-app workspace population from every census, gate, install and typecheck. | Low for DROP-verdict packages; **Medium** for the plugins, because "unreachable" is exactly what a half-landed feature looks like — the ledger row is the safe answer when in doubt. | 26 workspaces | none; cite the C01 §6 rule-6 absent-vs-unreachable distinction | R1 |
| **R4** | **Give the 15 unclassified packages a layer, and classify `src/`.** The gate names them: `admin-overrides`, `ai-spend`, `api-rbac`, `api-spec`, `bench-visual-diff`, `beta-signup`, `email-transport`, `eslint-plugin-pryzm`, `geometry-boundary-line`, `geometry-handrail`, `legacy-shim`, `rate-limit`, `release`, `wcag-audit`, `webhooks`. Two of them (`geometry-boundary-line`, `geometry-handrail`) are element-geometry packages and belong at L2 beside their 16 siblings — that is a one-line fix each in `eslint.config.js`. The backend eight need the open question in `CLAUDE.md` §L1-backend answered (own model, or `L-1`). Separately, `src/` is the real app entry (`index.html:429` → `src/main.ts`) and is invisible to the gate because it is not a workspace — either make it one or add it to the gate's roots. **Proof it worked:** `UNCLASSIFIED` falls from 15 toward 0 and `MAX_UNCLASSIFIED` ratchets down with it. | `eslint.config.js` (layer table), `tools/ga-gate/check-layer-boundaries.ts` (roots) | **S** for the two geometry packages, **M** for the backend eight + `src/` | High — a gate that cannot judge 15 of 166 packages is 91% of a gate, and it is currently RED on this exact arm. | Low | the table + the gate | answers the open question in `CLAUDE.md` "Backend packages have no layer" | none |
| **R5** | **Execute the fix `check-per-package-compile.ts` already prescribes** — *"built .d.ts + project references, repo-wide"* (its own closing line). Do it one package at a time, starting with `packages/schemas` (L0, 239 files, `check-domain-purity.ts` already hard-0): add `"build": "tsc -p tsconfig.build.json"`, emit `dist` with `declaration: true` + `declarationMap: true`, point `exports`/`types` at `./dist/index.js` / `./dist/index.d.ts` instead of `./src/index.ts`, keep `composite: true`, and add `{"path":"../schemas"}` to the `references` of its direct consumers. Then the next eleven by in-degree. **Invariant:** the root `vite build` must still resolve; add `tsc -b packages/tsconfig.references.json` to the root `build` script — `packages/tsconfig.references.json:3` already claims this is done and it is wired to nothing. **Proof it worked:** the `NOT PROVEN to compile` figure falls from **35 of 97**, and the **11 CASCADE-ONLY** failures (`editor-ui, engine, geometry-beam, geometry-column, geometry-door, geometry-handrail, geometry-window, picking, renderer, ui-base, views`) go green without a line changing in any of them. | `packages/schemas/{package.json,tsconfig.json,tsconfig.build.json}`, each consumer's `tsconfig.json`, root `package.json` `scripts.build`, `packages/tsconfig.references.json` | **L** (incremental — one package at a time) | High — converts 102 naming conventions into real boundaries; **11 packages are red today purely because of this** and cannot be fixed where they are red. Also likely cuts build memory: the 6144 MB `--max-old-space-size` is a symptom of type-checking every package's source in one program. | **Medium-high.** Touching module resolution in a monorepo that Vite, Vitest, tsx and a production CJS shim all consume differently. Do `schemas` alone, ship it, measure, then continue. | starts at 1 package, ends at ~12 | new ADR: "workspace packages emit declarations"; touches the build contract in C10; closes §MT-09 | R4 (so the graph is fully classified before it is made load-bearing) |
| **R6** | **Adopt Pascal's `architecture.test.ts` pattern for the invariants a gate cannot see.** Pascal's `packages/core/src/architecture.test.ts` is 50 lines, lives **inside** the package it polices, runs in the package's own suite, and ends with a vacuity guard (`expect(files.length).toBeGreaterThan(100)`). PRYZM's gates all live centrally in `tools/ga-gate/`, so a package's own `pnpm test` proves nothing about its boundaries. Add one such test per L0–L2 package asserting its declared "must not import" list. **Proof it worked:** `pnpm --filter @pryzm/schemas test` fails if someone adds a THREE import, without CI. | new `__tests__/architecture.test.ts` in `packages/{schemas,geometry-kernel,command-bus,visibility}` | **S** | Medium-high — moves boundary feedback from CI (minutes, central) to the package suite (seconds, local), which is where it changes behaviour. | Low | 4 packages | none | none |
| **R7** | **Extract the reusable half of `apps/editor/src/ui` (1,039 files) below L7.** Not a rewrite — a census first: for each of the 24 subdirectories under `apps/editor/src/ui`, decide *"would a second surface (component-editor, marketplace-web, headless, a future embed) need this?"* If yes it belongs in `packages/ui-base` (currently **8 files**) or a new `packages/editor-shell`. Pascal's split is the reference: `apps/editor` 31 files, `packages/editor` 513 — the editing experience is a **package**, so it is reusable, boundary-checked, and testable in isolation. **Proof it worked:** `apps/editor` file count falls, and `check-layer-boundaries.ts` classified-package coverage rises. | `apps/editor/src/ui/**` → `packages/ui-base` / new package; `src/main.ts` path aliases | **XL** | High long-term, low short-term — this is the largest single lever on the 4×, and the least urgent. | High — 1,039 files, and four sibling lanes work here. **Do not start this while other lanes are mid-flight.** | one third of the repository | new ADR; likely a C-suite amendment on layer membership | R4, R5, and a quiet tree |
| **R8** | **Adopt Pascal's `creating-rules.md` meta-rule for documentation growth:** *"Add a new page when the same mistake has been made twice — not preemptively."* PRYZM has 105 contracts / 300 ADRs / 104 SPECs / 2,330 docs against 69 gates: **7.1 documents per executable check.** Pascal's ratio is 10 pages per check and its checks hold. The actionable form is a ratchet, not a purge: add an arm to `check-contract-index-equivalence.ts` that reports **documents-without-a-gate** as a first-class number, the way `check-layer-boundaries.ts` reports unclassified packages. A contract nothing measures is the same artefact class as an unclassified package. | `tools/ga-gate/check-contract-index-equivalence.ts` (new arm), `docs/02-decisions/contracts/README.md` | **S** | Medium — will not change behaviour this quarter, will change what the suite looks like in a year. | Low | tooling + one README | this document becomes C107; the arm measures C107 too | none |
| **R9** | **Symlink the agent-instruction file.** Pascal ships **one** `AGENTS.md` with `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` as symlinks to it, and `.claude/skills` / `.cursor/skills` / `.codex/skills` as symlinks to `.agents/skills/`. PRYZM has `CLAUDE.md` only; the moment a second agent vendor is used, the instructions fork. Cheap insurance. | new symlinks at repo root | **S** | Low-medium | Low (Windows: `core.symlinks` / junction caveats — verify on the founder's machine before committing) | 3 files | none | none |

**If only one row is executed: R1.** It is size-S, touches no production code, and closes the defect class that has cost this project nine element families.
**If two: R1 + R2.** R1 detects the drift; R2 removes the mechanism that produces it.

---

## 7. What PRYZM does BETTER — and must keep deliberately

Each item below was checked against Pascal, not assumed.

**7.1 — The gate as a *self-describing* artefact.** `tools/ga-gate/check-layer-boundaries.ts`'s header explains why it does **not** use an import resolver, and the reason is one most teams never reach: *"A gate that fires unpredictably is worse than one that is off, because people trust it."* `check-single-compose.ts` has a whole section titled *"What it CANNOT decide, stated plainly"*. `check-verb-register.ts` prints, unprompted:

> LIVE means the verb is declared in an execution-authority root or delegates to the legacy commandManager. It does NOT mean the write is correct, that undo reverts it, or that a collaborator sees it.

Pascal has nothing of this kind. Its two automated checks are correct and silent about their limits; its 20 rule pages state rules without stating what is unmeasured. **PRYZM's gates say what they cannot see.** That is rarer and more valuable than the gates themselves, and it is the reason this audit could be written from PRYZM's own artefacts rather than against them.

**7.2 — Baselines that ratchet *and* report staleness.** `tools/ga-gate/per-package-compile-skip-ledger.json` records that a previous version of its own gate *auto-reclassified failures as skips at runtime*, names the package it silently absorbed (`geometry-beam`), and states the deletion. `check-verb-register.ts` fails on **paid** debt too: *"5 UNKNOWN-liveness verb(s) on the baseline no longer qualify … Paid debt must LEAVE the list in the same commit, or the baseline rots into a record of things that are secretly fine."* Pascal has no baselines at all — which is easy at 0 violations and impossible at 103. **Keep this. It is the mechanism that lets a large graph be honest.**

**7.3 — Contract-index set-equivalence.** `check-contract-index-equivalence.ts` compares the contract file set against the README row set **in both directions**, explicitly because *"a count can be right while the range is wrong."* This is exactly the gate shape R1 asks for on the plugin census. **PRYZM already invented the right tool and applied it to the lower-stakes subject.** Keep the tool; extend the subject.

**7.4 — Purity and single-owner invariants that genuinely hold at zero.** `check-domain-purity.ts` (0 impurities / 165 files), `check-three-imports.ts` (0 importers outside `renderer-three`), `check-raf-count.ts` (exactly 1 rAF owner). Pascal has **one** invariant at this standard (core ↛ THREE) and no single-owner rule for THREE, rAF or the frame loop at all — R3F owns them by convention. At PRYZM's scale these three are load-bearing. **Keep them hard-0; never absorb them into a ratchet.**

**7.5 — The geometry/plugin per-family split works.** 103 kind-name branches in seven framework packages against Pascal's 446 in three (§2.9, §2.12 A12). Pascal's own review skill treats each of its remaining branches as debt. **PRYZM already arrived where Pascal is migrating to.** The split is not the problem; the registration table above it is.

**7.6 — Defect archaeology written into the code.** `PluginRegistry.ts:410-437` does not merely add a descriptor: it names the prior defect (L-5200), the exact thrown message, the test that makes it unrepeatable, **and** retracts a claim its own first draft got wrong (*"It is stated because the first draft of this comment claimed an ordering the code did not have"*). Pascal's comments are good; nothing in Pascal is at this standard. **This is a genuine cultural asset. Keep it — and R1 is the way to make it unnecessary.**

**7.7 — Scope.** CRDT collaboration, IFC export as well as import, BCF, jurisdiction/geospatial, an AI host with a capability control plane, marketplace and billing. Pascal has none of these — `grep -rlE "yjs|socket\.io|automerge|liveblocks"` over their whole tree returns **zero files**, and their IFC path is 2 files of import-only conversion. **A large part of PRYZM's 4× is not accident and should never be apologised for.**

**7.8 — Test density.** 33.3% vs 23.8% test-to-source, and 2,515 test files against 459. Not this lane's axis to judge for quality, but the *structural* fact is that PRYZM's per-package suites exist (`vitest.config.ts` in most packages) where Pascal runs `bun test src` at the package root with no per-package config at all.

---

## 8. Not established — and why each is not a guess

**8.1 — RESOLVED during this audit.** This slot originally recorded that `check-per-package-compile.ts` had not finished. It completed: **RC=1 · population 97 · passing 62 · failing 27 (16 own-source, 11 cascade-only) · ledgered exclusions 8 · NOT PROVEN 35 of 97.** Quoted in full at §2.5. The one thing still not established here is the *ordering*: I did not determine which of the 16 own-source failures, if fixed first, would clear the most of the 11 cascades. `packages/command-registry` appears in the cascade path of every one of the 11 and is itself **ledger-excluded**, which is worth a lane of its own.

**8.2 — Whether PRYZM's 103rd layer violation is new.** The gate reads 103 against a baseline of 102, i.e. RED by one. I pinned HEAD at `f07b69cf` with a clean working tree (only a `.tsbuildinfo` modified), so the reading is of committed state — but four sibling lanes committed during this session (HEAD moved from `5d32305c` to `f07b69cf`), and I did not bisect to attribute the +1. **It is a real RED at this SHA; it is not established that it is anyone's regression.**

**8.3 — Pascal's trajectory.** The clone is depth-1 (`git rev-list --count HEAD` → **1**). I cannot see whether their 446 kind-name branches are falling, whether the 19 per-kind `viewer/systems/` folders are being retired on schedule, or how long the Stage-A wrap-exports have sat there. Everything in §3.6 is a **snapshot**, and a snapshot of debt says nothing about direction. Re-cloning with history would settle it; the lane brief forbids re-cloning.

**8.4 — Whether Pascal's LLM review skill actually catches violations.** `.agents/skills/review-architecture/SKILL.md` is thorough on paper and their upward-import count is 0, but I cannot distinguish *"the skill catches violations"* from *"a 13-node graph makes violations hard to write."* The counterfactual is unobservable from a single-commit clone. **What I can say is that the outcome is 0 and the outcome is what matters** — the mechanism's contribution is not established.

**8.5 — The private half of Pascal.** `AGENTS.md` states this repo is *"Consumed both as npm packages and (in `pascalorg/private-editor`) as a git submodule"*, and `SKILL.md` repeatedly cites `plans/editor-node-registry.md` and `plans/editor-placement-interaction-overhaul.md` as *"the live charter"* living **in the private repo**. So the authoritative migration plan for the registry model — the thing this audit rates highest — is not in the public tree. `find . -name 'editor-node-registry.md'` → **0**. Everything I say about Pascal's registry is inferred from the code and the public wiki, which is the right basis, but their own charter is unread.

**8.6 — Runtime behaviour of either app.** This lane read code and ran static gates. I did not boot Pascal (`bun install` + `bun dev` would need env vars and a Postgres/Supabase target) and did not boot PRYZM. Every claim about reachability is a claim about the **import graph and the composition tables**, not about what happens in a browser. Where PRYZM's own tests assert runtime reachability (`balconyReachableThroughComposedRuntime.test.ts` et al.) I cite them as PRYZM's measurement, not mine.

**8.7 — Whether PRYZM's 51 plugins *should* be 51 packages.** I established that 12 are unreachable and that the registration table is the wrong shape. I did **not** establish the right target count. Pascal's answer (one `nodes` package, 47 kind folders, 843 files) is one valid shape; PRYZM's per-family package split is what bought A12, and collapsing it would give the branching back. **The right answer is probably "keep the split, fix the registration" (R1+R2), not "become Pascal" — but that is a judgement, and I am flagging it as one.**

**8.8 — Cost of R5 in build time and bundle size.** I argue that emitting declarations would remove the compile cascade and probably reduce the 6144 MB build ceiling. I did **not** measure a before/after `tsc` run, because doing so would require modifying the tree. The mechanism is certain; the magnitude is not.

---

### Appendix — the two commands that produced §2.2

```bash
# PRYZM (run from repo root)
node -e "
const fs=require('fs'),path=require('path');
const roots=['packages','plugins','apps'];
const names=new Map();
for(const r of roots){for(const d of fs.readdirSync(r)){const f=path.join(r,d,'package.json');
  if(fs.existsSync(f)){const p=JSON.parse(fs.readFileSync(f,'utf8')); names.set(p.name, r+'/'+d);}}}
let edges=0;
for(const [n,dir] of names){const p=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
 edges+=Object.keys({...(p.dependencies||{}),...(p.devDependencies||{})}).filter(k=>names.has(k)&&k!==n).length;}
console.log('workspaces:',names.size,'| edges:',edges,'| avg out-degree:',(edges/names.size).toFixed(2));"
# → workspaces: 166 | edges: 487 | avg out-degree: 2.93

# Pascal — same script with roots=['packages','apps','tooling'] and peerDependencies included
# → workspaces: 13 | edges: 28 | avg out-degree: 2.15
```
