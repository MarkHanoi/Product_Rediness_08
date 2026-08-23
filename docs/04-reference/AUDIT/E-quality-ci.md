# AUDIT-E — Quality · Testing · CI · Developer Experience
### Pascal editor (`pascalorg/editor`, MIT) vs PRYZM — lane E of five
**Measured 2026-08-23.** Pascal @ `scratchpad/pascal` (read-only clone). PRYZM @ `C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08` (four sibling lanes mid-flight; all readings are of the tree as it stood during this lane).

> **Reading rule for this document.** Every count below carries the command that produced it. Where I made a measurement error during the audit and corrected it, the correction is recorded inline rather than silently overwritten — three of my own intermediate numbers were wrong (test-framework grep, "parse failures", subject-reachability) and the corrections changed the conclusions. Re-run the commands; do not re-transcribe the numbers.

---

## 1. Scope and method

### What I read
**Pascal** — all 10 root markdown files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `CONTRIBUTING.md`, `SETUP.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `README.md`, `design-qa.md`); `biome.jsonc`; `turbo.json`; root `package.json`; all 3 workflows in `.github/workflows/`; `Dockerfile`; `docker-compose.yml`; both `.agents/skills/*/SKILL.md`; the full `wiki/architecture/` index plus `layers.md`, `viewer-isolation.md`, `creating-rules.md`; `tooling/typescript/*.json`; `packages/typescript-config/*.json`; per-package `package.json` × 14; and ~12 test files in full.

**PRYZM** — `CLAUDE.md`; root `vitest.config.ts`; `apps/editor/vitest.config.ts`; `apps/ai-worker/vitest.config.ts`; `packages/beta-signup/vitest.config.ts`; `eslint.config.js` (677 lines); `.github/workflows/ci.yml`; `pnpm-workspace.yaml`; root `package.json`; `tools/ga-gate/run-all.ts` (relevant regions); `tools/ga-gate/gate-newly-measured.json`; `apps/editor/src/engine/views/plantools/__tests__/pointerReachesArmedHandler.spec.ts`.

### What I ran
Every command in §2 is reproducible. The non-trivial ones were three purpose-written scripts, left in the scratchpad so the numbers can be audited:

| Script | Question it answers |
|---|---|
| `scratchpad/reach.mjs` | Which test files does **no runner config `include` pattern** select? |
| `scratchpad/subject.mjs` | Which test *subjects* have **zero production importers**? |
| `scratchpad/phantom.mjs` | Which intra-monorepo imports are **not declared** in the importing package's `package.json`? |

I also executed PRYZM's own gates for their **true** exit codes (see the §2 warning about `$?` after a pipe).

### What I could NOT reach
- **Pascal's `node_modules` is not installed** (`ls node_modules` → absent; `command -v bun` → not present on this machine). I therefore **could not run `bun run check`, `bun run test`, or `bun run check-types`**. Every Pascal statement below is from **static reading of source and config**, never from an executed Pascal build. This is a material limitation and it is carried into §8.
- PRYZM CI is currently **blocked by a GitHub Actions billing failure** (per the lane brief; jobs die in 3–4 s), so I could not read a live CI run. All PRYZM gate readings are **local executions on this machine**.

---

## 2. Measured facts

### 2.1 Corpus size — the brief's opening table, verified and updated

```bash
# Pascal
cd scratchpad/pascal
git ls-files '*.ts' '*.tsx' | wc -l                                     # 1929
git ls-files '*.test.ts' '*.test.tsx' '*.spec.ts' '*.spec.tsx' | wc -l  # 459
# PRYZM
cd Product_Rediness_08
git ls-files '*.ts' '*.tsx' | wc -l                                     # 7989
git ls-files '*.test.ts' '*.test.tsx' '*.spec.ts' '*.spec.tsx' | wc -l  # 2682
```

| | Pascal | PRYZM (brief) | PRYZM (measured today) |
|---|---|---|---|
| `.ts`/`.tsx` tracked | **1,929** | 7,570 | **7,989** |
| test files tracked | **459** | 2,510 | **2,682** |
| test : source | **23.8 %** | 33.2 % | **33.6 %** |

Pascal's figures reproduce **exactly**. PRYZM's are ~5 % higher than the brief — the four sibling lanes have been committing during this session. The ratio is unchanged in substance.

### 2.2 What kind of test each writes — the core table

⚠ **My first pass at this table was wrong.** I reported "Pascal: 0 test files import `three`" from a `grep` whose quoting was mangled by nested shell escaping. The corrected command below returns **62**. The corrected row changes the verdict materially and is the reason this table is measured with a file list on disk rather than an inline pipe.

```bash
git ls-files '*.test.ts' '*.test.tsx' > /tmp/pt.txt      # Pascal (459)
xargs grep -l "from 'three'"   < /tmp/pt.txt | wc -l
xargs grep -l '\.parse('       < /tmp/pt.txt | wc -l
xargs grep -l '\bmock(\|spyOn(' < /tmp/pt.txt | wc -l
# …and the PRYZM equivalents over /tmp/rt.txt (2685)
```

| Property | Pascal (n=459) | PRYZM (n=2 685) | Command |
|---|---|---|---|
| Test frameworks in use | **1** — `bun:test`, in **459/459 (100 %)** | **≥3** — vitest, `node:test` (`test:pryzm1`), Playwright | `xargs grep -hoE "from '(bun:test\|vitest\|node:test)'" \| sort \| uniq -c` |
| Runner configs | **0** (package `test` scripts only) | **185** vitest configs + 2 playwright | `git ls-files \| grep -cE 'vitest.*config\.(ts\|js\|mts)$'` |
| Imports real `three` | **62 (13.5 %)** | **5 (0.2 %)** | above |
| Fixture built via a **Zod `.parse(`** | **215 (46.8 %)** | **310 (11.5 %)** | `xargs grep -l '\.parse('` |
| Uses mocks/spies | **10 (2.2 %)** | **555 (20.7 %)** | `grep -l 'mock(\|spyOn('` / `grep -l 'vi\.fn\|vi\.mock\|vi\.spyOn'` |
| Fabricates objects onto `window`/`globalThis` | **0** | **136** | `grep -l 'as unknown as Record<string, unknown>\|(window as any)\.'` |
| `as any` / `as never` escape hatches | **105 (22.9 %)** | **784 (29.2 %)** | `grep -l 'as never\|as any'` |
| Writes store state directly (`setState(`) | **66 (14.4 %)** | **20 (0.7 %)** | `grep -l 'setState('` |
| `@testing-library/*` component rendering | **0** | **0** | `grep -l '@testing-library'` |
| Snapshot assertions | **0** | **27** | `grep -l 'toMatchSnapshot'` |
| Property-based (`fast-check`) | **0** | **1** | `grep -l 'fast-check'` |
| E2E (Playwright/Cypress/Puppeteer) | **0 files, 0 deps** | **14** under `tests/e2e/` | `git ls-files \| grep -icE 'playwright\|cypress\|puppeteer\|e2e'` → Pascal **0** |

**The two rows that carry the argument** are `Zod .parse(` (46.8 % vs 11.5 %) and mocks (2.2 % vs 20.7 %). §3.2 and §4.2 explain why.

### 2.3 Test reachability — does the count have the right membership?

**Pascal.** Every one of the 459 test files sits inside the directory its own package's `test` script scopes:

```bash
git ls-files '*.test.ts' '*.test.tsx' | awk -F/ '{print $1"/"$2"/"$3}' | sort | uniq -c | sort -rn
#  167 packages/nodes/src     108 packages/editor/src     95 packages/core/src
#   49 packages/mcp/src        27 packages/viewer/src       6 packages/cli/src
#    6 apps/editor/lib          1 packages/ifc-converter/tests
```
Cross-referenced against the `test` script of each manifest (`packages/core` → `bun test src`, `apps/editor` → `bun test lib`, `packages/ifc-converter` → `bun test tests`): **459 / 459 = 100 % in scope. Zero orphans.**

**PRYZM.** `scratchpad/reach.mjs` expands every `include` in the root config plus all 182 workspace configs (with `{test,spec}` brace expansion — my first run lacked it and produced 68 false orphans):

```
TOTAL git-tracked test/spec files: 2682
claimed by ROOT vitest.config    :  265   (23 include patterns)
claimed by per-workspace configs : 2328   (182 configs, 182 with an explicit include)
claimed by server/tests/e2e      :   74
=== CLAIMED BY NO CONFIG: 16 (0.6%)
```

PRYZM's own gate agrees within a rounding of denominator — `tools/ga-gate/check-no-dark-test-files.ts` reports **DARK: 13** (no-runner 4 · excluded-by 6 · compiled-artefact 3) over 2 691 discovered files.

⭐ **But glob reachability is not CI invocation, and PRYZM's own gate says so in its output:**

```
⚠ SCOPE: this is GLOB REACHABILITY, not CI INVOCATION. A file green here can
  still be run by no CI job — that axis is scripts/check/check-test-ci-coverage.mjs.
```

Running that sibling (`node scripts/check/check-test-ci-coverage.mjs`):

```
§L-540-CI-GATE — root `pnpm run test:ci` coverage
  workspaces               : 175
  ENFORCED (has test:ci)   : 38  (21.7%)
  SILENTLY SKIPPED         : 123  (declare `test`, no `test:ci` -> --if-present drops them)
  no test script at all    : 14  (of which 1 STILL CONTAIN TEST FILES)
```

**This is the real membership number: 21.7 %.** 99.4 % of PRYZM's test *files* are selectable by *some* config; only **38 of 175 workspaces** are invoked by the root `test:ci` aggregate. `pnpm -r --if-present run test:ci` silently drops the other 123 — `--if-present` turns "no such script" into exit 0.

Additionally, **26 test files live under `tools/*` directories with no `package.json`** and so cannot be reached by `pnpm -r` at all:

```bash
for d in tools/*/; do n=$(git ls-files "$d" | grep -cE '\.(test|spec)\.tsx?$');
  if [ "$n" -gt 0 ] && [ ! -f "$d/package.json" ]; then echo "$d tests=$n NO-PACKAGE-JSON"; fi; done
# tools/ga-gate 10 · tools/madrid-envelope-engine 7 · tools/context-bake 2 · tools/spanish-genome-probe 2
# tools/city-completion 1 · tools/dataset-discovery 1 · tools/murcia-parcel-probe 1
# tools/rpuc-supersession 1 · tools/tracker 1
```
Four of these nine are individually rescued by explicit patterns in the root `vitest.config.ts`; five are not.

### 2.4 The dependency graph — the single most decisive measurement

`scratchpad/phantom.mjs`: for every non-test source file, resolve intra-scope package imports and ask whether the importing workspace **declares** that dependency in its own `package.json`.

```
==== PASCAL (@pascal-app) ====                ==== PRYZM (@pryzm) ====
workspaces with a manifest      : 14          workspaces with a manifest      : 176
intra-scope imports in prod src : 1515        intra-scope imports in prod src : 5700
PHANTOM (imported, not declared): 0 (0.0%)    PHANTOM (imported, not declared): 1807 (31.7%)
distinct phantom edges          : 0           distinct phantom edges          : 145
workspaces with >=1 phantom     : 0           workspaces with >=1 phantom     : 63
                                                 661 @pryzm/editor -> @pryzm/core-app-model
                                                 241 @pryzm/editor -> @pryzm/command-registry
                                                 103 @pryzm/editor -> @pryzm/ai-host
                                                  66 @pryzm/editor -> @pryzm/geometry-wall
                                                  61 @pryzm/persistence-client -> @pryzm/core-app-model
```

**Pascal: 0.0 %. PRYZM: 31.7 %, across 63 workspaces and 145 distinct edges.** §4.4 shows this is the direct cause of the `eslint-plugin-boundaries` failure PRYZM's own `CLAUDE.md` documents.

### 2.5 Type safety

```bash
F=$(git ls-files '*.ts' '*.tsx' | grep -vE '\.(test|spec)\.')   # non-test source
echo "$F" | xargs grep -oE ':\s*any\b'          | wc -l
echo "$F" | xargs grep -oE '\bas any\b'         | wc -l
echo "$F" | xargs grep -lE '\bany\b'            | wc -l
echo "$F" | xargs grep -oE '\(window as any\)'  | wc -l
```

| Metric | Pascal | PRYZM | Normalised (per file) |
|---|---|---|---|
| non-test source files | 1,470 | 5,304 | — |
| `: any` annotations | 221 | **3,118** | 0.15 vs **0.59** |
| `as any` assertions | 235 | **2,464** | 0.16 vs **0.46** |
| `any[]` | 3 | **535** | — |
| files containing `any` | 287 (**19.5 %**) | 2,285 (**43.1 %**) | **2.2× denser** |
| combined `any` per file | 0.31 | **1.05** | **3.4× denser** |
| `(window as any)` occurrences | **0** | **252** (in **156** files) | — |
| `@ts-ignore` / `@ts-expect-error` | 27 | **14** | 0.018 vs **0.003** — **PRYZM 6× better** |

**tsconfig strictness** (`tooling/typescript/base.json:11-12` vs PRYZM root `tsconfig.json`):

| Flag | Pascal `tooling/typescript/base.json` | PRYZM root `tsconfig.json` |
|---|---|---|
| `strict` | `true` (:11) | `true` |
| `noUncheckedIndexedAccess` | **`true`** (:12) | **unset** |
| `verbatimModuleSyntax` | **`true`** (:19) | unset |
| `isolatedModules` | `true` (:15) | — |
| `composite` / project references | **`true`** (per-package, e.g. `packages/core/tsconfig.json:6-7`) | not used |
| `noUnusedLocals` / `noUnusedParameters` | unset (delegated to Biome, then disabled — see §3.3) | **`true`** |
| `noImplicitReturns` | unset | **`true`** |
| `skipLibCheck` | `true` | `true` |

Neither is uniformly stricter. **Pascal wins on `noUncheckedIndexedAccess`** (the single highest-value strictness flag for geometry code — every array index becomes `T | undefined`); **PRYZM wins on `noUnusedLocals`/`noImplicitReturns`** and on `@ts-ignore` discipline.

### 2.6 Linters

**PRYZM — measured, timed, on this machine:**

```bash
time npx eslint . --max-warnings=999999 -f json -o eslint.json
# ESLINT_SECONDS=240
# files linted: 8162   errors: 25   warnings: 7481
# top rules: 6752 @typescript-eslint/no-explicit-any
#             288 (ruleId null — see correction below)
#             161 @typescript-eslint/no-unused-vars
#             149 pryzm/no-legacy-src-import
#             133 no-restricted-imports
npx eslint . --max-warnings=999999 >/dev/null 2>&1; echo $?   # 1
```

⚠ **Correction to my own intermediate reading.** I first classified the 288 `ruleId: null` messages as **parse failures** — files ESLint checked nothing in. **That was wrong.** They are `Unused eslint-disable directive` reports (234 of them for `no-console`). The real finding is different and smaller: **288 stale suppressions** for problems that no longer exist.

⛔ **`npm run lint` exits 1 today.** The 25 hard errors include **7 real architectural violations** the custom rule catches:

```
pryzm/store-single-channel -- plugins\balcony\src\handlers\CreateBalcony.ts:132
pryzm/store-single-channel -- plugins\balcony\src\handlers\DeleteBalcony.ts:55
pryzm/store-single-channel -- plugins\balcony\src\handlers\UpdateBalconyProfile.ts:114
pryzm/store-single-channel -- plugins\lift\src\handlers\CreateLift.ts:154
pryzm/store-single-channel -- plugins\lift\src\handlers\DeleteLift.ts:96
pryzm/store-single-channel -- plugins\pool\src\handlers\CreatePool.ts:105
pryzm/store-single-channel -- plugins\pool\src\handlers\DeletePool.ts:73
```
Two more are inside a **build artefact** (`dist-server-deps/@pryzm/file-format/server.mjs:17459`) — ESLint's ignore set does not exclude build output.

**Pascal — NOT executed** (no `node_modules`, no `bun` on this machine). Config read statically; see §3.3 for what it *would* check, including a significant finding about what it has been configured **not** to check.

### 2.7 CI

```bash
grep -cE '^  [a-z0-9][a-z0-9_-]*:$' .github/workflows/ci.yml   # Pascal 4 · PRYZM 18
grep -c '^    continue-on-error: true' .github/workflows/ci.yml # PRYZM 4
grep -c 'continue-on-error' .github/workflows/*.yml             # Pascal 0 across all 3
ls .github/workflows | wc -l                                    # Pascal 3 · PRYZM 8
```

| | Pascal | PRYZM |
|---|---|---|
| workflows | 3 (`ci`, `mcp-ci`, `release`) | 8 |
| jobs in the main CI workflow | **4** (2 in `ci.yml`, 2 elsewhere) | **18** |
| `continue-on-error` anywhere | **0** | **4 jobs** (`test-pryzm1`, `nft-bench`, `bim20-certification`, `a11y`) |
| gate steps in the main job | 4, **all blocking** — `check`, `check-types`, `test`, `build` | ~14 blocking + 4 advisory |
| toolchain pinned | **yes**, `bun-version: 1.3.14`, pinned in CI **and** the Dockerfile **and** `packageManager` | pnpm pinned via `packageManager` |

### 2.8 ⛔ PRYZM gate readings — **true** exit codes

⚠ **Methodological warning that changed my conclusions.** `npx tsx gate.ts 2>&1 | tail -12; echo "RC=$?"` reports **`tail`'s** exit status, not the gate's. My first pass reported `check-layer-boundaries` as RC=0 while its output said FAIL three times. Redirect to a file and read `$?` immediately:

```bash
npx tsx tools/ga-gate/check-layer-boundaries.ts   > layer.txt  2>&1; echo $?   # 3
node scripts/check/check-test-ci-coverage.mjs     > testci.txt 2>&1; echo $?   # 1
npx tsx tools/ga-gate/check-no-dark-test-files.ts > dark.txt   2>&1; echo $?   # 1
npx tsx tools/ga-gate/check-cast-count.ts         > cast.txt   2>&1; echo $?   # 3
npx tsx tools/ga-gate/run-all.ts                  > gaall.txt  2>&1; echo $?   # 1
npx eslint . --max-warnings=999999 >/dev/null 2>&1;              echo $?       # 1
```

| Gate | RC | Reading | Note |
|---|---|---|---|
| `run-all.ts` (**`ga-gate:all`, merge-blocking**) | **1** | **aborted after 9 lines; 0 gates executed** | see §4.5 — the headline finding |
| `check-layer-boundaries.ts` | **3** | 103 upward / baseline 102 · 15 unclassified / 13 · 121 banned / 113 | all three ratchets **exceeded** |
| `check-cast-count.ts` | **3** | — | `CLAUDE.md` records **RC=0** and "`OK: 3 = baseline`" as of 2026-08-18 |
| `check-test-ci-coverage.mjs` | **1** | stale `scriptless` reason for `@pryzm/geometry-curtain-wall` | ratchet correctly refusing to loosen |
| `check-no-dark-test-files.ts` | **1** | DARK 13, "at or below the declared level of 13" | DECLARED-LEVEL, absorbable via `gate-debt.json` |
| `eslint` | **1** | 25 errors | CI `lint` job is RED |

### 2.9 Documentation and honest-state culture

```bash
wc -c CLAUDE.md                                       # PRYZM 23092
wc -c AGENTS.md                                       # Pascal  3665
cat wiki/architecture/*.md | wc -c                    # Pascal 184135 across 20 pages
ls docs/02-decisions/adrs/ADR-*.md | wc -l            # PRYZM 300
find docs -name 'SPEC-*.md' | wc -l                   # PRYZM 104
ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'   # PRYZM 105
```

| | Pascal | PRYZM |
|---|---|---|
| primary agent doc | `AGENTS.md` **3.6 KB**; `CLAUDE.md`/`GEMINI.md`/`.github/copilot-instructions.md` are **symlinks to it** (9 bytes each) | `CLAUDE.md` **23 KB** |
| architecture corpus | `wiki/architecture/` — **20 pages, 184 KB** | 105 contracts + 300 ADRs + 104 SPECs |
| agent skills | 2 (`review-architecture`, `open-pr`), symlinked into `.claude/`, `.cursor/`, `.codex/` | Claude Code skills, not repo-resident |

**Honest-state markers in code comments** (`xargs grep -ic <term>`, summed):

| Marker | Pascal (1 929 files) | PRYZM (7 994 files) | Per 1 000 files |
|---|---|---|---|
| `TODO` | 21 | **1,736** | 10.9 vs **217** — **20× denser in PRYZM** |
| `FIXME` | 0 | 6 | — |
| `HACK` | 0 | 13 | — |
| `NOT YET` | 13 | **647** | 6.7 vs 81 |
| `deliberate` | 101 | **3,174** | 52 vs 397 |
| `cannot` | 127 | **7,136** | 66 vs 893 |
| `why:` | **0** | 429 | — |

---

## 3. Pascal's design

### 3.1 The shape: 3 layers, 14 workspaces, one composition root

`AGENTS.md:5-13` states the whole repo map in a 5-row table, and `AGENTS.md:23-27` states the entire layering rule in three bullets:

> - **`packages/core`** owns domain data and pure logic. It must not import Three.js, `packages/viewer`, `apps/editor`, rendering/UI concepts, tools, modes, phases, or view-specific concepts such as floorplan or paint preview.
> - **`packages/viewer`** owns the standalone 3D canvas… It must not know about `useEditor`, editor tools, phases, modes, paint mode, floorplan state…
> - **`apps/editor`** owns the editing experience…

**I tested every clause.** This is the fair-in-both-directions part:

```bash
grep -rn "from 'three'" packages/core/src --include=*.ts --include=*.tsx
# packages/core/src/events/bus.ts:3                        import type { Object3D } from 'three'
# packages/core/src/hooks/scene-registry/item-clip-registry.ts:1  import type * as THREE from 'three'
# packages/core/src/hooks/scene-registry/scene-registry.test.ts:2 import { Group } from 'three'
# packages/core/src/hooks/scene-registry/scene-registry.ts:4      import type * as THREE from 'three'
# packages/core/src/registry/types.ts:2                    import type { AnimationClip, ... } from 'three'
```
**4 of 5 are `import type`** — erased at compile, zero runtime coupling. The fifth is a **test file**. So the "core must not import Three.js" rule **holds at runtime**, measured.

```bash
grep -rn "@pascal-app/\(viewer\|editor\)" packages/core/src
# packages/core/src/events/bus.ts:201        * scene graph (see `@pascal-app/editor`'s …
# packages/core/src/services/drag-session.ts:11  * … (`useDragAction` in `@pascal-app/editor`) wraps
```
**Both are prose inside comments.** Zero real imports.

```bash
grep -rn "useEditor" packages/viewer/src | wc -l     # 0
grep -rln "floorplan\|Floorplan" packages/viewer/src # 4 files
grep -n "floorplan" <those files>
# glb-reference-nodes.tsx:17  * … (scans/LiDAR, guides/floorplan images) are
# roof-system.tsx:1352        // the 2D floorplan and the slope frame …
# wall-system.tsx:838         * … collision/floorplan geometry is
```
**All three are comments; the fourth file is a test.** **Pascal's stated layer rules hold, at 0 violations, measured.**

### 3.2 ⭐ Why Pascal's tests resist the "green test, broken product" failure

This is the question the coordinator flagged as the most valuable in the audit, and the answer is **structural, not cultural** — with an important qualification that cuts the other way.

**Mechanism 1 — extract the decision into a pure module, then test the module.**

`packages/editor/src/components/tools/stair/` contains exactly four files:
```
stair-click-guard.ts        ← the decision
stair-click-guard.test.ts   ← the test
stair-defaults.ts
stair-tool.tsx              ← the React component
```

The test (`stair-click-guard.test.ts:1-20`) constructs **no world at all**:

```ts
import { describe, expect, test } from 'bun:test'
import { createStairCommitGate, swallowFollowUpBrowserClick } from './stair-click-guard'

describe('createStairCommitGate', () => {
  test('refuses every trigger after a single-continuation exit', () => {
    const gate = createStairCommitGate()
    expect(gate.shouldCommit()).toBe(true)
    gate.markExited()
    // The native follow-up click / stray node click of the same gesture.
    expect(gate.shouldCommit()).toBe(false)
    expect(gate.shouldCommit()).toBe(false)
  })
})
```

And where a DOM concept is genuinely needed (`:22-41`), it uses a **real `EventTarget`** and a **real `Event`**, not a fake:

```ts
const target = new EventTarget()
swallowFollowUpBrowserClick(target)
const first = new Event('click', { cancelable: true })
target.dispatchEvent(first)
expect(first.defaultPrevented).toBe(true)
```

**There is no fabricated collaborator anywhere in this file, so there is no fabricated collaborator that can be wrong.**

**Mechanism 2 — the extracted module has exactly one production caller, and it is greppable.**

```bash
grep -rn "stair-click-guard" --include=*.tsx --include=*.ts packages apps | grep -v '\.test\.'
# packages/editor/src/components/tools/stair/stair-tool.tsx:43:
#   import { createStairCommitGate, swallowFollowUpBrowserClick } from './stair-click-guard'
# stair-tool.tsx:258:  // — see `stair-click-guard.ts`. Fresh per armed session.
# stair-tool.tsx:486:  // `stair-click-guard.ts`. The gate refuses anything after a single-
```
The reachability link is a **relative import in the same directory** — one line, trivially verifiable.

**Mechanism 3 — fixtures are parsed by the production schema, so an invalid fixture throws.**

`packages/editor/src/components/tools/item/use-draft-node.test.tsx:40-53`:

```ts
const block = BlockNode.parse({ id: BLOCK_ID, parentId: LEVEL_ID })
const level = LevelNode.parse({ id: LEVEL_ID, parentId: BUILDING_ID, children: [BLOCK_ID], level: 0 })
const building = BuildingNode.parse({ id: BUILDING_ID, children: [LEVEL_ID] })
useScene.setState({ nodes: { [BUILDING_ID]: building, … } } as never)
```

**215 of 459 Pascal test files (46.8 %) call `.parse(`.** The fixture is not a hand-written literal that mimics a node — it is a node, produced by the same Zod schema production uses. A fixture that has drifted from the schema **fails at construction, in the test**.

**⛔ The honest counterpoint — three ways Pascal is NOT immune:**

1. **The same file is a constructed world.** `use-draft-node.test.tsx:54-63` writes straight into the real store with an `as never` cast to silence the type error, and `:21-25` installs a fake `requestAnimationFrame` onto `globalThis`. **66 of 459 Pascal test files (14.4 %) write store state directly; 105 (22.9 %) use an `as any`/`as never` escape hatch.** Pascal's rate of type-escape in tests is *comparable to* PRYZM's 29.2 %, not dramatically better.
2. **It renders React through `renderToString`** (`:13`, `:75`) — 5 files do this. That executes the hook body once with no commit phase, no effects, no re-render. A bug that only appears on the second render is invisible to it.
3. ⭐ **The biggest one: Pascal largely avoids the false-green by not making the claim.** `@testing-library/*`: **0 files.** Playwright/Cypress/Puppeteer: **0 files, 0 dependencies.** Pascal writes **no test that asserts "a pointer event reaches the handler and the command dispatches."** PRYZM writes many. You cannot have a false green about interaction if you never assert about interaction — **that is a narrower risk posture, not a stronger verification.**

**So the answer to the coordinator's question is: BOTH, and the split is measurable.** Pascal's style is *genuinely* more resistant where the two overlap — 4× the schema-validated fixtures, 9.5× fewer mocks, zero `window` fabrication. And it *avoids* the hardest territory altogether, where PRYZM has chosen to fight and has sometimes lost.

### 3.3 ⚠ Pascal's linter DOES lie — and I can name the rules

`biome.jsonc` has **no `extends`**, yet the repo devDepends on `ultracite@^7.8.2` (`package.json:34`) — a strict Biome preset. The config then explicitly disables **35 rules**, and the disabled set is dominated by rules that *only exist* in a strict preset. The residue of a preset that is no longer extended:

```jsonc
// biome.jsonc:47-86 (excerpt; the `rules` block spans :29-87)
"suspicious": {
  "noExplicitAny": "off",          // ← Pascal has NO lint enforcement against `any`
  "noConsole": "off",
  "noEmptyBlockStatements": "off",
  "noImplicitAnyLet": "off",
  "noEvolvingTypes": "off",
},
"complexity": {
  "noExcessiveCognitiveComplexity": "off",
},
"correctness": {
  "noUnusedVariables": "off",              // ← dead code is not flagged
  "noUnusedFunctionParameters": "off",
  "useExhaustiveDependencies": "info",     // ← React hook deps: informational only
},
"a11y": {
  "noSvgWithoutTitle": "off", "useSemanticElements": "off",
  "noLabelWithoutControl": "off", "useKeyWithClickEvents": "off",
  "noStaticElementInteractions": "off", "useButtonType": "off",
},
"security": { "noDangerouslySetInnerHtml": "info" },
```

**Seven a11y rules off, `noExplicitAny` off, `noUnusedVariables` off, cognitive-complexity off, and `noDangerouslySetInnerHtml` demoted to `info`.** `bun run check` passing therefore establishes formatting + import organisation + a thin correctness core — **materially less than the name "check" implies**. This is Pascal's version of PRYZM's L-809 defect: not a rule that silently matches nothing, but a *preset* whose strictness was configured away while the dependency remains.

**⭐ The one real architectural gate Pascal has, and it currently catches nothing:**

```jsonc
// biome.jsonc:125-146 — scoped override on core/viewer/editor
"noRestrictedImports": {
  "level": "error",
  "options": { "paths": {
    "@pascal-app/nodes": "Framework packages must not import from @pascal-app/nodes —
       consult nodeRegistry.get(kind) instead. See plans/editor-node-registry.md."
  }}
}
```
```bash
grep -rn "from '@pascal-app/nodes'" packages/core packages/viewer packages/editor | wc -l   # 0
```
**0 violations.** This is a **tripwire** (prevents the first occurrence), not a debt ratchet. It is well-targeted and it carries a *remedy* in the message — but it polices exactly one edge.

**And a second linter that never runs:** `packages/eslint-config/` exists (base/next/react-internal) and depends on **`eslint-plugin-only-warn`** — a plugin whose entire function is to downgrade every ESLint error to a warning. Only `packages/ui/package.json:9` has an eslint `lint` script (`eslint . --max-warnings 0`). Root `package.json:7` is `"lint": "biome lint"`, and **`ci.yml` runs `bun run check`, never `turbo run lint`** — so `packages/ui`'s ESLint **is not invoked by CI at all**. Dead tooling, harmless but misleading.

### 3.4 ⭐ The real enforcement mechanism: TypeScript project references + declared exports

Pascal's layer rules hold at 0 violations with essentially **no linter enforcing them**. The mechanism is that the violation **cannot be written**:

```jsonc
// packages/viewer/tsconfig.json
{ "extends": "@pascal/typescript-config/react-library.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "composite": true, "incremental": true },
  "include": ["src"],
  "references": [{ "path": "../core" }] }          // ← the ONLY upward edge, declared
```
```jsonc
// packages/viewer/package.json
"peerDependencies": { "@pascal-app/core": "^1.0.0-beta.5", "@react-three/fiber": "^9", "three": "^0.185" },
"exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } }
```

Three properties compose into a hard gate:
1. **`composite: true` + `references`** — `tsc --build` (every package's `build` script) will not compile a package against a sibling it does not reference.
2. **`exports` maps point at `dist/`** — deep-importing internals is impossible; only the barrel is reachable.
3. **`apps/editor` is not a package anything can depend on** — so `packages/viewer` → `apps/editor` is unwriteable, not merely discouraged.

**That is why Pascal's phantom-dependency count is 0 / 1 515.** The graph is declared, so the compiler is the boundary checker. Pascal needs no `check-layer-boundaries.ts` because `tsc --build` *is* one.

### 3.5 CI: four steps, all blocking, toolchain pinned three times

`.github/workflows/ci.yml` in full is two jobs. The `quality` job:

```yaml
      # Pinned to match `packageManager` in package.json. Unpinned, this floats
      # to whatever bun is latest, so a bun release can break the gate with no
      # change in the repo — and CI then disagrees with what contributors run.
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: 1.3.14 }
      - run: bun install --frozen-lockfile
      - name: Lint & format check
        run: bun run check
      - name: Type check
        run: bun run check-types
      - name: Test
        run: bun run test
      - name: Build
        run: bun run build
```

**Zero `continue-on-error` in any of the three workflows.** Every step is a hard gate. The `cli-smoke` job runs on **macOS** and does something PRYZM has no equivalent of — it packs the CLI, stages the runtime and smoke-boots it:

```yaml
  cli-smoke:
    runs-on: macos-latest
    …
        run: |
          bun run build --filter editor
          cd packages/cli && bun run build && bun run stage-runtime && bun run smoke-runtime
```

`mcp-ci.yml` is **path-filtered** — it runs only when `packages/mcp/**`, `packages/core/**`, the scene API routes, or `bun.lock` change. That is a cheap, precise way to get a heavier suite without taxing every PR.

⚠ **What the CI does NOT enforce.** `turbo.json:22` defines a `check-types` task, but **`packages/core`, `packages/nodes`, `packages/viewer`, `packages/mcp` and `packages/ifc-converter` declare no `check-types` script** — Turbo skips packages with no such script. Those packages are typechecked only as a side effect of `tsc --build` inside their `build` script (which does typecheck, so coverage survives) — but `bun run check-types` alone does **not** cover them. And `turbo run lint` is never invoked by CI at all.

### 3.6 Developer experience — the strongest single artefact in either repo

**`AGENTS.md` is 3,665 bytes and is the whole contract.** `CLAUDE.md`, `GEMINI.md` and `.github/copilot-instructions.md` are **symlinks to it** — `wc -c CLAUDE.md` → **9**, the byte length of the string `AGENTS.md`. **One file, four agent vendors, zero drift possible.** PRYZM cannot have this problem because it has one such file, but the *technique* is the right one.

`AGENTS.md:31-40` is a **task→document routing table**, which is the part PRYZM's `CLAUDE.md` lacks:

> - Adding a node type → `node-schemas.md`, `renderers.md`, `systems.md`
> - Adding a tool → `tools.md`, `spatial-queries.md`, `events.md`
> - Adding / changing a placement or move interaction → `tools.md` ("2D ↔ 3D behavioral parity": applicable behaviors must exist in both views; port the change to the sibling 2D/3D file in the same PR)
> - Adding a system → `systems.md`, `scene-registry.md`
> - Anything in `packages/viewer` → `viewer-isolation.md`, `layers.md`

`wiki/architecture/creating-rules.md:34-38` carries an **anti-bloat rule** that PRYZM has no equivalent of:

> - Keep a page focused on one concept. Split if it grows past ~500 lines.
> - **Add a new page when the same mistake has been made twice — not preemptively.**
> - Never duplicate content across pages. Link instead.

⭐ **The `review-architecture` skill turns the docs into an executable review.** `.agents/skills/review-architecture/SKILL.md` frontmatter restricts tools to `Bash(git *) Bash(gh *) Read Grep Glob` — read-only by construction — and step 1 says:

> **Read these before reviewing any diff. They are the source of truth, not your training data.**

Then it lists 7 mandatory pages and 6 conditional ones. **This is a governance process that runs.** PRYZM's contract suite is larger and deeper but has no equivalent executable entry point.

**`CONTRIBUTING.md:51-56` contains the sharpest honest-state paragraph in the Pascal repo** — and it is about exactly the failure mode this audit is auditing:

> Use `bun run test`, not bare `bun test`. `test` is one of Bun's own subcommands, so `bun test` never reaches the package script — it runs Bun's collector over every file it can find, **including compiled copies under `dist/`, and reports inflated counts**.

**A count that is right about files and wrong about membership** — documented, in the contributor onboarding doc, with the mechanism.

**Dockerfile** — 20 lines, and 9 of them are honest-state comments naming defects they worked around:

```dockerfile
# `next build` runs under `node`, and this image's `node` is a shim that re-execs
# bun (/usr/local/bun-node-fallback-bin/node). Next 16's build crashes it — a
# segfault on 1.3.14, a turbopack CommonJS wrapper error on 1.3.0 — on both arm64
# and amd64. CI does not hit this because GitHub runners have a real node.
RUN apk add --no-cache nodejs
```

`SETUP.md:44-48` does the same for a Docker port constraint. Pascal's honest-state culture is **real but operational**: it lives at the point of the workaround, not in a status ledger.

### 3.7 ⭐ `design-qa.md` — Pascal's answer to "committed ≠ reachable"

This file is a **completed visual-QA report that ends in a refusal**:

> **Findings**
> - [P0] Browser-rendered implementation evidence unavailable.
>   Location: local editor preview.
>   Evidence: the captured implementation contains only the loading indicator; clicking 2D leaves 3D selected.
>   Impact: final screen-space line visibility, collisions, and door-width placement **cannot be visually accepted**.
>
> **Implementation Evidence**
> - Focused dimension, wall, floor-plan, and registry tests: **61 passed, 0 failed**.
> - Editor package type-check: **blocked** by the unrelated missing `resolveFloorplanExportViewport` export…
> - Biome check: passed.
>
> **final result: blocked**

⭐ **61 tests passed and the verdict is still `blocked`,** because the browser-rendered evidence was unavailable. Five separate lines say "blocked from inspection". It also admits a **broken typecheck** in the same breath.

This is precisely PRYZM's own memory doctrine — *"prove at the layer the user experiences, never a pure function return"* — implemented as a **required report template**. Pascal reached the same conclusion PRYZM reached and encoded it as a *deliverable format* rather than as a gate.

### 3.8 What Pascal simply does not have

⛔ Stated as measurements, per C01 §6 rule 6:

```bash
git grep -il 'yjs\|automerge\|liveblocks\|partykit\|socket\.io' -- '*.ts' '*.tsx' '*.json'
# 1 hit — apps/ifc-converter/components/IfcConverter.tsx:255 `copyJsonToClipboard`
#   (a case-insensitive false positive on "…y J son…"). TRUE COUNT: 0.
```
- **Real-time collaboration / CRDT: ABSENT.** Not unreachable — absent. Pascal is single-player with a scene-save API (`apps/editor/lib/scene-store-server.ts`, SQLite at `PASCAL_DATA_DIR`).
- **E2E / browser automation: ABSENT.** 0 files, 0 dependencies.
- **Shrink-only ratchets / debt ledgers: ABSENT.** No `gate-debt.json` equivalent; grep for `check-*` scripts outside `packages/` returns only source files whose names coincide.
- **An `ISSUE-LOG` with stable defect identifiers: ABSENT.** `CHANGELOG.md` is release-oriented and credits PR numbers and contributors; it is not a defect register.
- **A visual-regression / golden-image suite: ABSENT** (0 `toMatchSnapshot`), though `print-golden-house.test.ts` is a *geometric* golden test — it raycasts the exported scene and counts intersections (`:33-45`), which is stronger than a pixel snapshot.

---

## 4. PRYZM's design

### 4.1 The shape: 8 layers, 176 workspaces, 185 runner configs

The layer table in `CLAUDE.md` and `eslint.config.js` is genuinely more expressive than Pascal's 3 layers — it has to be, at 176 workspaces vs 14. The cost is that **every mechanism Pascal gets from the compiler, PRYZM must build and maintain as a separate artefact.**

### 4.2 ⭐ How PRYZM's tests construct worlds — the anti-pattern, quoted

`apps/editor/src/engine/views/plantools/__tests__/pointerReachesArmedHandler.spec.ts:127-186`, the `installWorld()` helper:

```ts
const bus = { executeCommand: vi.fn(async () => ({ ok: true })) };

function installWorld(): void {
    const w = window as unknown as Record<string, unknown>;
    w.runtime = {
        bus,
        events: { on: () => ({ dispose: (): void => undefined }), emit: (): void => undefined },
        toasts: { show: (message, kind) => { toasts.push({ message, kind }); … } },
        stores: {
            slab: {
                getState: () => new Map([[SLAB_ID, { levelId: 'level-1', boundary: [
                    { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
                ] }]]),
            },
        },
    };
    w.wallStore     = { getAll: () => [ … ], getLevels: () => [ … ] };
    w.bimManager    = { getLevelById: () => ({ elevation: 0 }), getLevels: () => [ … ] };
    w.selectionManager = { setEnabled: (v) => { selectionEnabled.push(v); }, getSelectedId: () => null, … };
    w.toolManager   = { getActiveTool: () => 'none', subscribe: (fn) => { toolSubscribers.push(fn); … } };
}
```

**Six production subsystems, each replaced by a hand-written object literal, installed on `window` behind `as unknown as Record<string, unknown>` — which erases the very types that could have caught the divergence.**

The coordinator's finding is visible at `:141-146`: **the slab store always contains a slab**, with a hard-coded 10×10 boundary, and the pointer coordinates at `:120-123` are chosen to land inside it. With no slab, the production handler refuses **before** dispatching. The test proves a path the user does not walk.

**This is the "fake more capable than real" failure with a precise mechanism: `w.runtime` is structurally typed as `unknown`, so nothing — not `tsc`, not ESLint, not a gate — can assert that this fake matches `Runtime`.** Compare Pascal's `BlockNode.parse({...})`, where the schema itself rejects a fixture that has drifted.

**The measured gap:**

| | Pascal | PRYZM |
|---|---|---|
| fixtures validated by the production schema | **46.8 %** | **11.5 %** |
| test files fabricating collaborators (mocks) | **2.2 %** | **20.7 %** |
| test files fabricating a runtime on `window` | **0** | **136** |

### 4.3 ⭐ PRYZM's counter-strength: the config that documents its own past failure

The root `vitest.config.ts:40-60` is, in my judgement, the single best-written config file in either repository:

```ts
      // §L-851 — THE TWO FOUNDING PATTERNS, REPOINTED. They read
      // `src/ui/__tests__/**/*.spec.ts` + `src/ui/toolbar/__tests__/**/*.spec.ts`,
      // which are REPO-ROOT-relative — and repo-root `src/ui/` DOES NOT EXIST; the
      // tree moved to `apps/editor/` and these were never followed. So the two
      // patterns this config was WRITTEN AROUND selected nothing, and 72 spec files
      // / 1,433 test cases had never executed in CI. That is the L-849 shape at the
      // largest scale in this repo: NEVER RAN and PASSED printed the same value.
      //
      // MEASURED IN ISOLATION BEFORE ENABLING (the L-849 protocol, non-negotiable):
      // all 72 files run under a throwaway config that mirrored this one exactly …
      // 72/72 GREEN, 1,433 passed / 0 failed / 0 skipped.
```

And at `:196-206`, a **deliberately-left-dead** coverage pattern, flagged rather than silently repointed:

```ts
        // §L-851 — DEAD, and deliberately left dead rather than silently repointed.
        // … Repointing it at `apps/editor/src/ui/**` would move the coverage
        // DENOMINATOR under a 60% threshold gate — a different change, with a
        // different blast radius, that this lane did not measure. Flagged, not
        // guessed at.
```

**Pascal has nothing of this kind anywhere.** This is genuine, transferable engineering discipline.

The same discipline appears in `apps/ai-worker/vitest.config.ts:3-8`, which explains *why the file exists*:

```ts
// Local Vitest config (V1-LAUNCH L-247 orphaned-suite fix). Without this file
// `vitest run` walks up to the ROOT vitest.config.ts, whose `include` only
// covers src/ui + apps/editor specs — so this app's `__tests__` … never ran
// (vitest reported "No test files found").
```

⚠ **But note what this tells you about the architecture:** PRYZM needs **185 vitest configs** and a bespoke defect class ("orphaned suite") because vitest's upward config walk plus 176 workspaces makes "which runner claims this file?" a genuinely hard question. **Pascal answers it with one convention — `bun test <dir>` in each package script — and never has the problem.**

### 4.4 ⭐ Why PRYZM's layer gate had to be hand-built — and it is the phantom deps

`eslint.config.js:392-406` is admirably honest:

> There is NO `import/resolver` configured here, and adding one is a deliberate NON-choice. `eslint-plugin-boundaries` classifies a file by its RESOLVED PATH, so without a resolver it cannot map `@pryzm/geometry-wall` to `packages/geometry-wall/**` … **The `boundaries/element-types` rule below therefore only sees RELATIVE imports.**
>
> A resolver was rejected rather than merely skipped: **pnpm symlinks some `@pryzm/*` packages into a given package's node_modules and not others**, so resolver-based checking catches a violation in one package and silently skips the identical one next door. Unpredictable enforcement is worse than none, because people trust it.

⭐ **My phantom-dependency measurement is the quantification of that sentence.** "pnpm symlinks some and not others" is a *consequence*, not a cause. The cause is that **1,807 of 5,700 intra-scope imports (31.7 %) are not declared in the importing package's `package.json`** — pnpm's strict node_modules layout only links what is declared, so an undeclared import resolves only by accident of hoisting.

**Fix the declarations and the resolver becomes reliable — which makes the layer rule enforceable by an off-the-shelf plugin instead of a bespoke 500-line gate.** Pascal gets this for free at 0.0 %.

The same file also contains the best statement of gate philosophy in either repo (`eslint.config.js:446-460`):

> As an 'error' this rule could never be satisfied, so `npm run lint` was permanently red, so the CI gate was permanently red, so every deploy used the audited bypass. **A rule that can only be bypassed enforces nothing — and worse, it trains people to reach for the bypass**, which is exactly what happened on 2026-08-09.

⚠ **And that lesson is being re-learned right now.** `npm run lint` **exits 1 today** (§2.6) — 25 errors, 7 of them real `pryzm/store-single-channel` violations in `plugins/balcony`, `plugins/lift`, `plugins/pool`. The `lint` job in `ci.yml:112-126` has no `continue-on-error`. It is red.

### 4.5 ⛔ THE HEADLINE FINDING — the merge-blocking GA-gate suite runs **zero** gates

`ci.yml:370` states the job's status in the strongest possible terms:

```yaml
    # §GA-GATE-RATCHET (L-775) — MERGE-BLOCKING. `continue-on-error: true` is GONE.
```
```yaml
      - name: Contract gates (ratcheted — count printed by run-all.ts)
        run: pnpm run ga-gate:all          # → tsx tools/ga-gate/run-all.ts
```

Executed locally:

```bash
npx tsx tools/ga-gate/run-all.ts > gaall.txt 2>&1; echo $?    # 1
wc -l gaall.txt                                               # 9
```

**Nine lines. Exit 1. The complete output:**

```
[ga-gate/run-all] Running all GA convergence gates...

[ga-gate/run-all] ❌ 2 gate-newly-measured.json entr(ies) lack an exitCondition or a reviewBy:
    - check-dependent-adapts-on-host-move.ts
    - check-property-rac-matrix.ts
  A category with no exit is how "temporary" becomes permanent. Name what makes
  the entry leave, and the date by which that must be re-argued.
```

The abort is at `tools/ga-gate/run-all.ts:800-808`:

```ts
const incomplete = [...newlyMeasured.values()].filter((e) => !e.exitCondition || !e.reviewBy);
if (incomplete.length > 0) {
  console.error(`\n[ga-gate/run-all] ❌ ${incomplete.length} gate-newly-measured.json entr(ies) lack an exitCondition or a reviewBy:\n` …);
  process.exit(1);
}
```

`GATES` is declared at `run-all.ts:114`, and `run-all.ts` references **130** gate filenames. **None of them execute.** P1 single-compose, P2 three-imports, P3 raf-count, P5 domain-purity, `check-layer-boundaries`, `check-no-dark-test-files`, `check-contract-index-equivalence` — the entire enforcement apparatus this repository's quality identity rests on — **did not run.**

The two offending registry entries are indices **30 and 31** in `tools/ga-gate/gate-newly-measured.json` (32 entries total), each missing only the `exitCondition` string:

```bash
node -e "const j=require('./tools/ga-gate/gate-newly-measured.json'); const e=j.entries;
  Object.keys(e).forEach(k=>{const v=e[k]; if(!v.exitCondition||!v.reviewBy) console.log('MISSING ->',k)})"
# MISSING exitCondition -> 30      (check-dependent-adapts-on-host-move.ts)
# MISSING exitCondition -> 31      (check-property-rac-matrix.ts)
```

⭐ **The precondition itself is good design** — its comment at `:795-799` correctly argues that debt without a declared exit is amnesty. **The defect is that a metadata-hygiene failure is fatal to the entire suite rather than to the entry.** This is precisely the pattern PRYZM's own memory records as *"a gate whose 'yes' branch awaits a decision is a REGRESSION with a contract citation attached"* and *"unsatisfiable gate — decomposition IS the fix."* **It is happening at the top of the quality stack, and the CI billing outage means no run has reported it.**

**Two missing JSON strings are currently disabling 130 gates.**

### 4.6 The other gates, measured

`check-layer-boundaries.ts` — **RC=3, all three ratchets exceeded**:

```
FAIL — 103 upward import(s), baseline 102.
FAIL — 15 unclassified package(s), baseline 13.
FAIL — 121 banned third-party import(s), baseline 113.
```
`CLAUDE.md` records "violations 102/102, unclassified 13/13, sdk-bypass 171/182" as of 2026-08-16. Two of three have since drifted **over** baseline.

`check-cast-count.ts` — **RC=3**. `CLAUDE.md` records **RC=0** and `[cast-tripwire] OK: 3 = baseline` as of 2026-08-18, in a correction box that itself corrects an earlier wrong reading. **This is the sixth instance of the documented rot pattern, and it recurred inside a section whose entire purpose is to warn about it.**

`check-no-dark-test-files.ts` — **RC=1 at DECLARED-LEVEL 13/13.** ⭐ **This gate is the best-engineered artefact I found in either repository**, and it deserves to be quoted:

```
[check-no-dark-test-files] executed controls (an arm never watched failing is UNPROVEN):
   negative control (planted tree): 6 finding(s) over 8 test files, 3 runner(s)
       ✓ fired — D::packages/a/__tests__/rootSuite.test.ts
       ✓ fired — D::packages/d/__tests__/maybe.test.ts
       ✓ fired — U::packages/d/vitest.config.ts
   positive control / SATISFIABILITY PROOF (clean tree): 0 finding(s) over 5 test files — must be 0
       ✓ green is REACHABLE — a fixture state exists in which this gate exits 0
         (L-716: a gate whose pass condition can never be true is not a gate).
   floor  test files discovered: measured 2691, min 1500 ✓
   floor  runners discovered: measured 172, min 100 ✓
   ⚠ SCOPE: this is GLOB REACHABILITY, not CI INVOCATION. …
```

**It plants a synthetic broken tree and asserts its own arms fire; it proves green is reachable; it floors its own denominators so it cannot pass by discovering nothing; and it names the axis it does NOT cover and points at the gate that does.** Pascal has nothing remotely comparable, and neither does most production software.

### 4.7 CI structure

18 jobs, 4 advisory. The blocking set is `lint`, `isolation`, `command-manager`, `test-server`, `test-unit`, `test-root`, `test-suites`, `ga-gate`, `build`, `apex-gates`, `docker-image`. `ci.yml:362-366` contains a small masterpiece of anti-rot reasoning:

> The gate COUNT is deliberately absent from this name. It said "31" while `ls tools/ga-gate/check-*.ts | wc -l` said 32, and a 33rd landed the same day this was corrected… **a number typed here can only ever be wrong later.**

And `ci.yml:420-425` correctly refuses to enumerate gates per-step: *"Do not add a per-gate step; a second list is a second thing that can disagree."* **Both principles are right, and both are undermined by §4.5 — the wholesale invocation they protect currently runs nothing.**

---

## 5. Head-to-head

| Sub-axis | Pascal (file:line) | PRYZM (file:line) | Winner | Why, in one sentence | Evidence |
|---|---|---|---|---|---|
| Test-fixture integrity | `use-draft-node.test.tsx:40-52` — `BlockNode.parse(...)` | `pointerReachesArmedHandler.spec.ts:131-186` — `w.runtime = {…}` behind `as unknown as Record<string, unknown>` | **PASCAL** | Pascal's fixtures are rejected by the production schema when they drift; PRYZM's fakes are typed `unknown`, so nothing can detect drift. | 46.8 % vs 11.5 % of test files call `.parse(` |
| Mock dependence | 10 / 459 files | 555 / 2 685 files | **PASCAL** | Every mock is a fabricated collaborator that can be wrong about the real one. | `grep -l 'mock(\|spyOn('` vs `grep -l 'vi\.fn\|vi\.mock'` |
| Global-state fabrication in tests | 0 files | 136 files | **PASCAL** | PRYZM's `window`-as-service-locator architecture makes a fictional runtime the path of least resistance. | §2.2 |
| Interaction-layer coverage | `@testing-library` 0 · E2E 0 files/0 deps | `tests/e2e/**` 14 files · Playwright configured | **DIFFERENT-BY-DESIGN** | Pascal cannot produce a false green about interaction because it never asserts about it; PRYZM asserts and has sometimes been wrong. | §3.2, §2.2 |
| Decision-extraction style | `stair-click-guard.ts` + `.test.ts` + `stair-tool.tsx:43` | handler logic inside `PlanViewToolOverlay.ts`, tested via simulated pointer events | **PASCAL** | A pure module with one relative importer makes reachability a one-line grep. | `grep -rn "stair-click-guard"` → 1 prod import |
| Test-file glob reachability | 459/459 in a script's scope | 2 666/2 682 (99.4 %); gate says 13 DARK | **EQUAL** | Both are effectively complete; PRYZM needed a purpose-built gate to get there. | `reach.mjs`; `check-no-dark-test-files` |
| Test **CI invocation** coverage | 100 % (`turbo run test` → every package's `test`) | **21.7 %** — 123/175 workspaces silently dropped by `--if-present` | **PASCAL** | `--if-present` converts a missing script into exit 0, so most workspaces' suites never run in the aggregate. | `check-test-ci-coverage.mjs` |
| Runner-config surface | 0 configs; one convention (`bun test <dir>`) | 185 vitest configs + 2 playwright | **PASCAL** | One convention cannot develop an orphaned-suite defect class; 185 configs did, twice (L-247, L-851). | `git ls-files \| grep -c vitest.*config` |
| Dependency-graph integrity | **0 / 1 515 phantom (0.0 %)** | **1 807 / 5 700 phantom (31.7 %)**, 63 workspaces | **PASCAL** | Declared graphs make the compiler the boundary checker; undeclared ones make every resolver-based tool unreliable. | `phantom.mjs` |
| Layer-rule enforcement mechanism | `tsc --build` + `composite`/`references` + `exports` (`packages/viewer/tsconfig.json:7,13`) | `check-layer-boundaries.ts` (bespoke, RC=3 today) | **PASCAL** | Pascal's boundary cannot be crossed; PRYZM's is counted after the fact and is over baseline on all three arms. | §3.4, §2.8 |
| Layer-rule *expressiveness* | 3 layers, prose in `AGENTS.md:23-27` | 8 layers + SDK-bypass + banned-import arms, machine-readable in `eslint.config.js` | **PRYZM** | PRYZM's model encodes far more real structure and is queryable. | `eslint.config.js:389-460` |
| Linter honesty | `biome.jsonc:29-87` disables 35 rules incl. `noExplicitAny`, `noUnusedVariables`, 7×a11y | `eslint.config.js:392-406` documents the resolver gap **in the file** | **PRYZM** | Both linters under-check; only PRYZM's says so at the point of the gap. | §3.3, §4.4 |
| Linter **speed** | not measurable here (no `node_modules`) | **240 s** over 8 162 files | **NOT ESTABLISHED** | Biome is Rust and single-pass, but I did not run it — see §8. | §2.6 |
| Linter current state | not executed | **exit 1** — 25 errors incl. 7 real `store-single-channel` violations | **NOT ESTABLISHED** | I cannot claim Pascal's is green without running it. | §2.6, §8 |
| `any` density (non-test src) | 0.31 / file · 19.5 % of files | **1.05 / file · 43.1 % of files** | **PASCAL** | 3.4× denser in PRYZM despite P4, because P4 polices only the `(window as any)` shape. | §2.5 |
| `(window as any)` | **0** | **252 occurrences / 156 files** | **PASCAL** | Architectural: Pascal has no window service-locator to cast to. | `grep -oE '\(window as any\)'` |
| `@ts-ignore` discipline | 27 | **14** (6× better per file) | **PRYZM** | PRYZM almost never silences the compiler outright. | §2.5 |
| tsconfig strictness | `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true` (`base.json:12,19`) | `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` | **DIFFERENT-BY-DESIGN** | Pascal is stricter on indexing (critical for geometry); PRYZM on dead code. | §2.5 |
| CI blocking discipline | 4 steps, **0** `continue-on-error` across 3 workflows | 18 jobs, **4** advisory | **PASCAL** | Everything Pascal runs, blocks; a smaller enforced set beats a larger partly-advisory one. | `grep -c continue-on-error` |
| CI **effectiveness today** | not executed | `ga-gate` runs **0 / 130** gates; `lint` exits 1 | **PASCAL** | PRYZM's two most important blocking jobs are both red for reasons no run has reported. | §4.5, §2.6 |
| Toolchain pinning | `bun 1.3.14` pinned in `package.json:37`, `ci.yml:26`, `Dockerfile:3` with a comment saying why | `packageManager` pinned | **PASCAL** | Three-way pin with a stated rationale prevents CI/local skew. | `ci.yml:21-26` |
| Release automation | `release.yml` + 11 `release:*` scripts + per-package `CHANGELOG` credits | Fly deploy + `ci-gate` | **DIFFERENT-BY-DESIGN** | Pascal publishes npm packages; PRYZM deploys a SaaS. | `package.json:19-30` |
| Gate self-verification | none | `check-no-dark-test-files` plants a negative control, proves satisfiability, floors its denominators | **PRYZM** | A gate that has never been watched failing is unproven; PRYZM proves its arms fire. | §4.6 |
| Debt with a declared exit | none | `gate-debt.json`, `gate-newly-measured.json` require `exitCondition` + `reviewBy` | **PRYZM** | Debt with no exit is amnesty; PRYZM refuses to record it. | `run-all.ts:795-808` |
| Doc→task routing | `AGENTS.md:31-40` maps 6 task types → required pages | `CLAUDE.md` §Governance lists contracts by subsystem | **PASCAL** | A five-row routing table is followed; a 105-item index is consulted. | §3.6 |
| Multi-agent doc consistency | `CLAUDE.md`/`GEMINI.md`/copilot = **symlinks** to `AGENTS.md` | single `CLAUDE.md` | **PASCAL** | Drift between agent docs is structurally impossible. | `wc -c CLAUDE.md` → 9 |
| Doc anti-bloat rule | `creating-rules.md:37` — "add a page when the same mistake has been made twice — not preemptively" | none found | **PASCAL** | PRYZM's index rotted five times; a growth rule is the missing control. | §3.6 |
| Executable governance | `review-architecture` SKILL loads 7 pages, classifies each new file by layer | contract suite + gates, no review entry point | **PASCAL** | Pascal's rules are wired to a process that runs on every PR review. | `.agents/skills/review-architecture/SKILL.md` |
| Honest-state — *status* | `design-qa.md` → **"final result: blocked"** despite 61 passing tests | `vitest.config.ts:40-60`, `:196-206`; `eslint.config.js:392-406` | **PRYZM** | PRYZM names what is NOT true at far higher density and with re-run instructions. | §2.9, §4.3 |
| Honest-state — *operational* | `Dockerfile:6-10`, `SETUP.md:44-48`, `CONTRIBUTING.md:51-56` | comparable | **EQUAL** | Both annotate workarounds at the point of the workaround. | §3.6 |
| Debt visibility | 21 `TODO` (10.9 / 1 000 files) | 1 736 `TODO` (**217 / 1 000** — 20×) | **PASCAL** | PRYZM's honesty is real, but so is the volume of what it is honest about. | §2.9 |
| Doc↔reality accuracy | `AGENTS.md` layer claims: **0 violations, verified** | `CLAUDE.md` `check-cast-count` claim RC=0; **measured RC=3** | **PASCAL** | Pascal's smaller claim set stays true; PRYZM's larger one rots faster than it is re-measured. | §3.1, §2.8 |
| Onboarding speed | `bun install && bun dev` → running; `SETUP.md` 3 KB | `DATABASE_URL`+`SESSION_SECRET`+`CF_WORKER_URL`+`PRYZM_OWNER_*` required; localhost documented as unusable | **PASCAL** | Zero required env vars vs five, and Pascal's dev server actually works locally. | `CONTRIBUTING.md:7-22`; `CLAUDE.md` |
| Container parity | `Dockerfile` + `docker-compose.yml`, boots to a working editor with a data volume | `docker-image` CI job | **PASCAL** | Pascal's container is a supported install path, not only a CI artefact. | §3.6 |
| Collaboration / CRDT | **ABSENT** (measured: 0) | Yjs + `sync-server` + `check-conflict-surfacing` (hard-0) | **PRYZM** | PRYZM has a whole capability Pascal has not attempted. | §3.8 |
| Contract/decision corpus | 20 wiki pages (184 KB) | 105 contracts + 300 ADRs + 104 SPECs | **PRYZM** | Far deeper institutional memory. | §2.9 |

---

## 6. What PRYZM should adopt

Ranked by **value ÷ cost**. Every row is executable by a lane that has not read this audit.

| # | Change | Files to touch | Effort | Value | Risk | Blast radius | Contract/ADR impact | Prerequisite |
|---|---|---|---|---|---|---|---|---|
| **1** | ⛔ **Un-break `ga-gate:all`.** Add the missing `exitCondition` string to the 2 entries so 130 gates run again. Locate with `node -e "const j=require('./tools/ga-gate/gate-newly-measured.json'); Object.entries(j.entries).forEach(([k,v])=>{if(!v.exitCondition\|\|!v.reviewBy)console.log(k,v.gate)})"` → indices **30** (`check-dependent-adapts-on-host-move.ts`) and **31** (`check-property-rac-matrix.ts`). ⚠ **Then re-run `npx tsx tools/ga-gate/run-all.ts; echo $?` and expect it to go red on real findings** — that is the point. | `tools/ga-gate/gate-newly-measured.json` | **S** (minutes) | **Highest in this audit** — restores the entire P1–P8 apparatus | Low to make; **the follow-on reds are the real work** | None to make; repo-wide once gates resume | Restores enforcement C70 §5.4 assumes | None |
| **2** | **Make a metadata-hygiene failure fatal to the ENTRY, not the SUITE.** At `run-all.ts:800-808`, replace `process.exit(1)` with: exclude incomplete entries from the newly-measured amnesty (so their gates run **at hard-0**), print a loud warning, run all 130 gates, and fold the hygiene failure into the final exit code at `:1134`. | `tools/ga-gate/run-all.ts:795-810` | **S** | Prevents recurrence of #1 permanently; a registry typo can never again disable 130 gates | Low — strictly more is enforced, never less | The runner only | Worth an ADR: "pre-flight failures degrade, never abort" | #1 |
| **3** | **Close the `test:ci` invocation gap: 21.7 % → ~100 %.** 123 workspaces declare `test` but not `test:ci`, and `pnpm -r --if-present` drops them. Add `"test:ci": "vitest run"` to each (they already have configs). Enumerate with `node scripts/check/check-test-ci-coverage.mjs`. Then flip that gate's `ENFORCED` arm to a shrink-only floor so it can only rise. | 123 × `package.json`; `scripts/check/check-test-ci-coverage.mjs` | **M** (scriptable) | **Very high** — the largest real membership gap in PRYZM's test estate | ⚠ **Medium — expect new reds.** Land in batches of ~20 and triage | Repo-wide CI time ↑ | None | Fix `@pryzm/geometry-curtain-wall` stale `scriptless` entry first (gate is RC=1 on it) |
| **4** | ⭐ **Declare the dependency graph — eliminate the 1 807 phantom imports.** For each of the 145 edges, add the `@pryzm/*` package to the importing workspace's `dependencies` as `"workspace:*"`. Generate the patch with `scratchpad/phantom.mjs` (start with `@pryzm/editor` → `core-app-model` 661, `command-registry` 241, `ai-host` 103). ⭐ **This is the prerequisite that makes an off-the-shelf resolver reliable and retires the bespoke gate.** | 63 × `package.json`; `pnpm-lock.yaml` | **L** | **Highest structural value** — converts PRYZM's weakest enforcement into Pascal's strongest | Medium — must regenerate the lockfile in one commit (see memory: agent `package.json` edits break `--frozen-lockfile`) | Repo-wide install graph | Supersedes the `eslint.config.js:392-406` rationale; ADR-worthy | Single-lane ownership; no sibling lanes editing manifests |
| **5** | **After #4: re-enable `import/resolver` and demote `check-layer-boundaries.ts` to a cross-check.** With 0 phantom deps, `eslint-plugin-boundaries` sees every `@pryzm/*` import. Keep the bespoke gate for one month, assert both agree, then retire the hand-rolled scanner. | `eslint.config.js:388-406`; `tools/ga-gate/check-layer-boundaries.ts` | **M** | High — removes ~500 lines of bespoke tooling PRYZM must maintain forever | Medium — must prove agreement before retiring | Lint + gate | Rewrites the L-809 correction box in `CLAUDE.md` | **#4** |
| **6** | ⭐ **Adopt the "parse the fixture" rule: no test may hand-write an entity literal that a `@pryzm/schemas` Zod schema could have produced.** PRYZM is at 11.5 % vs Pascal's 46.8 %. Add a gate `check-fixture-parsed.ts` that flags test files constructing an object with an entity-shaped key set without a `.parse(` on the path; land at a shrink-only baseline. | new `tools/ga-gate/check-fixture-parsed.ts`; `run-all.ts` GATES | **M** | ⭐ **Directly attacks the session's recurring defect** — a fixture that cannot contain the defect cannot fail on it | Low — starts as a ratchet at current count | Tests only | Extends C84 §9 | #1 |
| **7** | ⛔ **Ban runtime fabrication on `window` in tests; require a schema-checked fake.** 136 files build `w.runtime = {...}` behind `as unknown as Record<string, unknown>`. Provide one `createTestRuntime()` in a shared test package, **typed as the real `Runtime`** so `tsc` rejects drift, and gate new `(window as any).runtime =` assignments at a shrink-only baseline. | new `packages/test-runtime/`; 136 spec files (incrementally); new gate | **L** | ⭐ **Highest value for the specific failure the coordinator cited** — a typed fake cannot silently outgrow the real interface | Medium — migration is broad but mechanical | Tests only | Memory: *fake more capable than real* | #6 |
| **8** | **Turn `lint` green and keep it green.** Fix the 25 errors — 7 real `pryzm/store-single-channel` violations in `plugins/{balcony,lift,pool}/src/handlers/*.ts` (real P6 debt, fix properly), 5 cosmetic (`no-useless-escape`, `no-irregular-whitespace`), and add `dist-server-deps/**` to ESLint's ignores (2 errors are in build output). Then sweep the **288 stale `eslint-disable` directives**. | `plugins/balcony/src/handlers/{Create,Delete,UpdateBalconyProfile}.ts`, `plugins/lift/src/handlers/{CreateLift,DeleteLift}.ts`, `plugins/pool/src/handlers/{CreatePool,DeletePool}.ts`, `eslint.config.js` ignores, 288 sites | **M** | High — a red blocking job trains people to bypass (`eslint.config.js:446-460` says exactly this) | Low | Lint + 7 plugin handlers | Advances P6 | None |
| **9** | ⭐ **Adopt `noUncheckedIndexedAccess: true`** (Pascal `tooling/typescript/base.json:12`). For a BIM codebase, `boundary[i]` returning `Point \| undefined` is the single highest-value strictness flag. Land per-package, geometry packages first. | `tsconfig.json` + per-package tsconfigs | **L** | High — turns a whole class of geometry crash into a compile error | ⚠ **High churn** — expect hundreds of new errors; must be incremental | Repo-wide | ADR | Land after #8 so lint noise is not compounded |
| **10** | ⭐ **Symlink the agent docs and add a task→document routing table.** Adopt Pascal's `AGENTS.md:31-40` shape: a 6-row "if you are doing X, read Y first" table at the TOP of `CLAUDE.md`. With 105 contracts, routing matters more for PRYZM than for Pascal, not less. Add `AGENTS.md`/`GEMINI.md` as symlinks to `CLAUDE.md`. | `CLAUDE.md`; new symlinks | **S** | High — cuts agent orientation cost on every lane | None | Docs | Feeds C107 | None |
| **11** | ⭐ **Adopt Pascal's doc-growth rule verbatim:** *"add a new page when the same mistake has been made twice — not preemptively"* (`creating-rules.md:37`), plus a ≤500-line page cap and "never duplicate, link instead". `CLAUDE.md` records its own index rotting **five** times; a growth rule is the missing control. | `docs/02-decisions/contracts/README.md`; `CLAUDE.md` | **S** | High — attacks the documented root cause of doc rot | None | Docs | Governs C107 itself | None |
| **12** | **Add a `review-architecture` skill.** Port `.agents/skills/review-architecture/SKILL.md`: read-only tool allowlist, mandatory contract list loaded before reading the diff, classify each new file by layer, report by severity. PRYZM's contract suite is far richer than Pascal's wiki and currently has no executable review entry point. | new `.claude/skills/review-architecture/SKILL.md` | **M** | High — makes 105 contracts operative rather than consultable | Low | Process | Implements the C01–C102 conflict order | #10 |
| **13** | **Extract interaction decisions into pure modules with one production importer.** Follow `stair-click-guard.ts`: move the arm/commit/refuse decision out of the overlay into a pure module, test the module directly, and let the reachability proof be a one-line grep for its single importer. Pilot on `PlanViewToolOverlay`, the subject of `pointerReachesArmedHandler.spec.ts`. | `apps/editor/src/engine/views/plantools/*`; new pure modules | **L** | ⭐ **Structural fix for the false-green class** — removes the need to simulate a world at all | Medium — touches live interaction code | Plan tools | ADR | #7 |
| **14** | **Add executed controls to the other 129 gates.** `check-no-dark-test-files.ts` plants a negative control, proves satisfiability and floors its denominators. Promote that to a shared harness in `tools/ga-gate/lib/` and require it of every gate: *an arm never watched failing is UNPROVEN.* | `tools/ga-gate/lib/`; each `check-*.ts` incrementally | **XL** | ⭐ **PRYZM's own best idea, applied 130×** — would have caught `check-cast-count`'s drift | Low per gate | Gate suite | C107 §gates | #1, #2 |
| **15** | **Adopt a `design-qa` deliverable that can return `blocked`.** Port Pascal's template (comparison target, full-view evidence, focused-region evidence, findings with P-levels, required fidelity surfaces, **`final result: blocked`**). PRYZM's memory already says *prove at the layer the user experiences*; this makes it a required artefact rather than a habit. | new `docs/04-reference/DESIGN-QA-TEMPLATE.md`; lane briefs | **S** | High — a verdict format that can refuse is the cheapest guard against green-test/broken-product | None | Process | C107 | None |
| **16** | **Reduce the 185 vitest configs toward one convention.** Pascal's `bun test <dir>` per package makes the orphaned-suite defect class impossible. A shared `vitest.workspace.ts` or one `defineProject` preset would collapse most of the 182 per-workspace files. | `vitest.config.ts`; 182 workspace configs | **L** | Medium-high — removes the substrate that produced L-247 and L-851 | Medium — must not re-dark any suite; measure in isolation first (the L-849 protocol) | All tests | ADR | #3 |
| **17** | **Path-filter the heavy CI jobs.** Pascal's `mcp-ci.yml:3-21` runs only when its subject changes. Apply to `docker-image`, `apex-gates`, `nft-bench`. | `.github/workflows/ci.yml` | **S** | Medium — cuts CI cost/time, directly relevant under a billing constraint | Low — ⚠ ensure filtered jobs are not required checks | CI | None | None |
| **18** | **Pin the toolchain in three places with a stated reason,** as `ci.yml:21-26` and `Dockerfile:1-3` do for `bun 1.3.14`. PRYZM pins `packageManager` but the CI setup step and Dockerfile should restate it with the "CI then disagrees with what contributors run" rationale. | `.github/workflows/*.yml`; `Dockerfile` | **S** | Medium | None | CI | None | None |

---

## 7. What PRYZM does BETTER — and must keep deliberately

⛔ Not a courtesy section. Each item is something Pascal does **not** have, that I would advise against trading away for any recommendation in §6.

**7.1 — Gates that prove their own arms fire. `tools/ga-gate/check-no-dark-test-files.ts` is the best engineering artefact in either repository.** It plants a synthetic broken tree and asserts each arm fires (`✓ fired — D::packages/a/__tests__/rootSuite.test.ts`); it runs a **positive control on a clean tree** and states the principle — *"green is REACHABLE — a fixture state exists in which this gate exits 0 (L-716: a gate whose pass condition can never be true is not a gate)"*; it **floors its own denominators** (`test files discovered: measured 2691, min 1500 ✓`) so it cannot pass by discovering nothing; and it **names the axis it does not cover** and points at the gate that does. Pascal's linter, by contrast, has 35 rules quietly disabled and no one would know. ⭐ **Keep this, and propagate it (§6 #14).**

**7.2 — Debt must declare its own exit.** `run-all.ts:795-799`: *"the exit condition is the only thing separating this category from an amnesty… An entry without one is rejected at load rather than tolerated at read time, so the file cannot acquire open-ended members by accident."* Pascal has no debt register at all, so it cannot have open-ended debt — but it also cannot *see* its debt. ⭐ **Keep the requirement; fix only the blast radius (§6 #2).**

**7.3 — Configs that document the defect that produced them.** `vitest.config.ts:40-60` (§4.3) records that 72 spec files / 1,433 cases had never executed, states the measure-in-isolation protocol, and — at `:196-206` — deliberately leaves a coverage pattern dead rather than silently repointing it, because repointing would move a threshold denominator *"a different change, with a different blast radius, that this lane did not measure. Flagged, not guessed at."* **I found nothing comparable anywhere in Pascal.** ⭐ **This is PRYZM's single most transferable cultural asset.**

**7.4 — Naming what is NOT true, at density.** `CLAUDE.md` marks P4, P6, P7 and P8-spans **NOT-YET-TRUE as enforcement** while stating them as commitments; `eslint.config.js:392-406` says the rule below *"is not the layer gate"* in the file that defines it. Pascal's `AGENTS.md` states its rules as though universally true — and in Pascal's case they happen to be (§3.1), but the reader has no way to tell the difference between "verified" and "asserted". PRYZM's reader always can.

**7.5 — "A rule that can only be bypassed enforces nothing."** `eslint.config.js:446-460` diagnoses why a permanently-red rule is worse than no rule: *"it trains people to reach for the bypass."* That is a first-class engineering insight with no Pascal equivalent. ⚠ It is also currently being violated (`lint` exits 1, §6 #8) — **the doctrine is right; the practice has slipped.**

**7.6 — Anti-rot reasoning about the documents themselves.** `ci.yml:362-366` refuses to put a gate count in a job name because *"a number typed here can only ever be wrong later"*; `ci.yml:420-425` refuses per-gate steps because *"a second list is a second thing that can disagree."* `check-contract-index-equivalence.ts` compares **SETS in both directions** rather than counts, precisely because a count can be right while the range is wrong. **These are correct and rare.**

**7.7 — Real-time collaboration, with a conflict-surfacing gate.** Pascal has **zero** CRDT/realtime code (measured, §3.8). PRYZM has Yjs, a sync server, and `tools/rac-conformance/certification/gates/check-conflict-surfacing.ts` at **hard-0, no baseline**. This is a capability gap in PRYZM's favour, not a quality gap.

**7.8 — `@ts-ignore` discipline.** 14 across 5,304 non-test files vs Pascal's 27 across 1,470 — **6× better per file.** PRYZM's `any` problem is one of *typed permissiveness*, not of *silencing the compiler*, which is the more recoverable of the two.

**7.9 — Institutional memory.** 105 contracts, 300 ADRs, 104 SPECs, an `ISSUE-LOG` with stable `L-` identifiers, and cross-references from code comments to `§`-tags (`§L-851`, `§FIX-DOOR-SLAB-HOST (L-56)`). Pascal's `CHANGELOG.md` credits contributors and PR numbers well but is release-shaped; there is no stable defect identifier to cite from code. ⚠ **The cost is visible** — 20× the `TODO` density and an index that has rotted five times — but the asset is real, and §6 #11 is the cheap control, not amputation.

---

## 8. Not established

Each of these is a **measurement I did not take**, with the reason. None is a guess.

1. **Pascal's linter, typechecker and test suite were never executed.** `node_modules` is absent and `bun` is not installed on this machine (`command -v bun` → nothing). ⛔ **I therefore cannot claim Pascal's `bun run check` / `check-types` / `test` pass, nor that they are fast.** Everything in §3 is static reading. Notably, `design-qa.md` itself records *"Editor package type-check: blocked by the unrelated missing `resolveFloorplanExportViewport` export referenced by `floorplan-export.test.ts`"* — **evidence that Pascal's typecheck was broken at least once.** To close this: `bun install && bun run check && bun run check-types && bun run test` in the clone.

2. **Biome-vs-ESLint speed is UNMEASURED.** PRYZM's ESLint took **240 s** over 8,162 files, timed. I have no Pascal number. Biome is Rust and single-pass and is *expected* to be 10–100× faster, but that is architecture, not a reading, and the corpora differ 4× in size. ⛔ **Do not quote a speed ratio from this audit.**

3. **Test *pass rates* on both sides.** I measured what tests *are* and whether they *can be selected*; I did not run either suite to completion. PRYZM's `test:suites` script comment records "374 pass / 24 fail" for one corpus, but that is a transcription in a config, not my measurement.

4. **Whether Pascal's 459 tests would catch a real regression.** I read ~12 of them. The style analysis in §3.2 generalises from a sample plus repo-wide greps; it is not a mutation-testing result. **A mutation-testing run on both `packages/core` and `packages/geometry-kernel` would settle §5's top row properly** and I recommend it as follow-up work.

5. **My subject-reachability metric is biased against PRYZM and I did not correct it.** `subject.mjs` reported Pascal 2.4 % vs PRYZM 9.7 % of tests whose relative subjects have no production importer — but PRYZM's top "dark subjects" are `src/index.ts` **barrels**, which production reaches via the `@pryzm/x` package specifier, not a relative path. **The metric measures module-resolution style as much as reachability.** The one comparable figure is "tests importing only via a package specifier": Pascal **6/459 (1.3 %)**, PRYZM **236/2 760 (8.6 %)**. I have not built the corrected version.

6. **Whether PRYZM's CI was red before today.** The billing outage means I could not read a run. `ga-gate:all` and `lint` both fail **locally on this machine, in this tree, with four sibling lanes mid-flight**. I cannot say whether `main` at HEAD is red, nor for how long. ⛔ **Verify on a clean checkout of `main` before acting on §6 #1 and #8 as regressions rather than as steady state.**

7. **How many of the 130 gates would pass if `run-all.ts` reached them.** I ran four individually (three RED, one RED-at-declared-level). Extrapolating from a sample of four to 130 would be exactly the error this audit exists to catch. **The number is knowable in one command after §6 #1.**

8. **Whether the 123 workspaces missing `test:ci` are green.** `check-test-ci-coverage.mjs` proves they are *not invoked*; it says nothing about whether they *pass*. ⚠ **§6 #3 must therefore be landed in batches** — the honest expectation is that some are red, which is the whole point.

9. **Pascal's review culture.** I inferred that review + a small graph carries the weight PRYZM assigns to gates, from the 0-violation layer measurements and the `review-architecture` skill. I did **not** read Pascal's PR history, review comments, or merge policy — `gh` was not used. The `CHANGELOG` shows ~10 named external contributors, so it is not a solo project, but I did not measure review depth.

10. **Whether Pascal's `biome check` currently passes with 35 rules disabled.** Static reading tells me *what is checked*; only a run tells me *whether it is green*. `design-qa.md` claims "Biome check: passed" at one point in time.

---

### Appendix — scripts written for this audit
`scratchpad/reach.mjs` (test-file glob reachability) · `scratchpad/subject.mjs` (test-subject production reachability, ⚠ biased — see §8.5) · `scratchpad/phantom.mjs` (undeclared intra-monorepo imports). Outputs: `orphans.txt`, `rootpatterns.txt`, `eslint.json`, `layer.txt`, `testci.txt`, `dark.txt`, `cast.txt`, `gaall.txt`.
