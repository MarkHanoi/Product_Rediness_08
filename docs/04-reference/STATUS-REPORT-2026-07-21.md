# PRYZM — Current-State Status Report

**Date:** 2026-07-21
**Audit baseline commit:** `09d055ba8fc4023b1ce2ab962fc41e75320eaea5`
**Tree state at baseline:** dirty (7 modified + 6 untracked files, all in the
`packages/site-parcel-data` / `siteDispatch.ts` / `server/parcelZoningProxy.js` lane
owned by two concurrently-running agents).
**Audience:** founder + external review.
**Nature of this document:** a VERIFICATION PASS. Every claim below was re-derived from
code, from a command run during this session, or from `git` output. Where a prior
document asserted a fact, that assertion was treated as a hypothesis and re-tested. Where
verification was not possible, the row says **UNVERIFIED** and why.

> ### ⚠ The tree moved during this audit
> `git rev-parse HEAD` at the start of the audit returned `09d055ba`. At the end of the
> audit it returned `5646102b`. Two commits landed underneath this report while it was
> being written:
> ```
> 5646102b docs(strategy): September launch-wedge assessment — verdict on the 4 proposal elements against L-535/L-538/L-528
> 4062b974 feat(zoning): L-537 — CONSTRUCT the amplada de vial; Barcelona height coverage 44% -> 86% (v265)
> ```
> `git diff --stat 09d055ba..5646102b` = 16 files, +1863/−36, confined to
> `packages/site-parcel-data/**`, `apps/editor/src/ui/site/**`, `server/parcelZoningProxy.js`,
> and `docs/**`.
>
> **Consequence, stated rather than hidden:** the §2 and §6 line numbers in
> `siteDispatch.ts` and `packages/site-parcel-data/src/index.ts` were read at the baseline
> tree and may have shifted by the time you read this. The §2 *verdicts* (which module is
> wired to what) were re-verified by grep at baseline and are not sensitive to the shift.
> Nothing in §4, §1, §3 or §5 touches the moving lane. My test runs of
> `@pryzm/site-parcel-data` and `test:server` executed against the baseline working tree
> INCLUDING the other agents' uncommitted changes — those numbers are therefore "the tree
> as it stood", not "commit `09d055ba` clean".

---

### Job → section map

This report is written in dependency order (the CI finding gates the trust level of
everything else), not job order. The coordinator's job numbers map as follows:

| Job | Section | Status |
|---|---|---|
| 1 — 3D Site Analysis labelling (L-373a) | `## 1` | done |
| 2 — Pricing (L-397) | `## 2` | done |
| 3 — Launch blockers | `## 3` | done |
| 4 — Compliance engine build-fraction | `## 4` | done |
| 5 — CI / test-gate reality | `## 5` (placed first, deliberately) | done |
| 6 — DK / ES / CH inventory | `## 6` | done |
| 7 — Honest verdict | `## 7` | done |

---

## 5 — CI / test-gate reality (JOB 5 — read this first: it gates the trust level of everything below)

Source of truth: `.github/workflows/ci.yml` and `.github/workflows/deploy-fly.yml`, read at
baseline.

### Does CI run on push to `main`?

**Yes — partially.** `ci.yml:44-50`:

```yaml
  push:
    branches: [main]
    paths-ignore: ['docs/**', '**/*.md', '.claude/**']
  pull_request:
    branches: [main]
    paths-ignore: ['docs/**', '**/*.md', '.claude/**']
  workflow_dispatch:
```

On a push to `main` the following jobs run: `lint`, `isolation`, `command-manager`,
`test-server`, `test-unit`, `ga-gate`, `build`, `apex-gates`.

### What is NOT gated

| Gap | Evidence | Effect |
|---|---|---|
| **`ga-gate` is advisory** | `ci.yml` `ga-gate` job: `continue-on-error: true` | The P1–P8 principle gate cannot block anything. |
| **`a11y` is PR-only AND advisory** | `if: github.event_name == 'pull_request'` + `continue-on-error: true` | Two independent reasons it never blocks. |
| **`docker-image` (Fly-parity boot smoke) is PR-only** | `if: github.event_name == 'pull_request'` | The founder's documented workflow is push-straight-to-`main`. A job that only runs on PRs, in a repo where PRs are not used, **never runs**. |
| **`test:pryzm1` is not wired to CI at all** | `package.json` defines `"test:pryzm1": "tsx --test tests/*.test.ts"`; grep of `ci.yml` for `test:pryzm1` → no match | An entire documented suite has zero enforcement. |
| **Root `vitest.config.ts` (the `src/ui` panel/toolbar happy-dom suite) is not wired to CI** | no `npx vitest run` / root-config invocation in `ci.yml` | Same. |
| **Playwright E2E (`tests/e2e/**`) is not wired to CI** | only `test:a11y` in `tests/browser-matrix` is invoked, and only PR-only + advisory | No E2E coverage gates anything. |
| **`--if-present` silently skips 129 workspaces** | `package.json`: `"test:ci": "pnpm -r --workspace-concurrency=1 --if-present run test:ci"`. Measured this session: **165 workspaces scanned, 18 declare `test:ci`, 129 declare `test` but NOT `test:ci`** | The "full unit gate" covers ~11% of workspaces. `ci.yml` states this honestly in its own comment ("HONEST LIMIT, STATED SO NOBODY QUOTES THIS AS FULL COVERAGE") — credit where due, but the limit is real. |
| **Doc-only pushes skip CI entirely** | `paths-ignore: ['docs/**','**/*.md']` | Defensible for cost, but means the HEAD commit at the time of writing (`09d055ba`, docs-only) ran no gate. |

### The load-bearing finding: **a red CI does not stop a production deploy**

`deploy-fly.yml` triggers independently on `push: branches: [main]` (`:23-24`) and its
single `deploy` job (`:44`) has **no `needs:`, no `workflow_run:` dependency on `ci.yml`,
and no `paths-ignore`**. Verified by grep at baseline:

```
19:on:
23:  push:
24:    branches: [main]
43:jobs:
44:  deploy:
```

There is no line linking the two workflows. Therefore: **every push to `main` deploys to
production regardless of whether CI passed.** The `ci.yml` header comment describes the
gate as protecting merges via required status checks on PRs — a mechanism that is inert in
a push-to-`main` workflow. Whether required-status-checks are configured in repo
Settings → Branches is **UNVERIFIED — could not confirm because the `gh` CLI is not
installed in this environment** (`gh: command not found`), so I could not read branch
protection or CI run history.

### And the gate that IS hard-fail is currently RED

`ci.yml` marks `test-unit` (`pnpm run test:ci`) as REQUIRED and hard-fail as of L-247 phase
0.5d. `apps/editor/package.json` defines `"test:ci": "vitest run"` — byte-for-byte the
command I ran. Result of `npx vitest run --root apps/editor` at baseline:

```
 Test Files  5 failed | 214 passed (219)
      Tests  5 failed | 1858 passed | 2 expected fail | 1 skipped (1866)
   Duration  235.56s
```

The five failing files, re-run in isolation to name them precisely:

| File | Failure | Environmental? |
|---|---|---|
| `apps/editor/__tests__/bootstrap.data.test.ts` | `ReferenceError: HTMLElement is not defined` (suite-level collection error) | **No.** `apps/editor/vitest.config.ts:17` sets `environment: 'node'` — there is no DOM in *any* environment, Windows or Linux. |
| `apps/editor/__tests__/bootstrap.everything.test.ts` | same | **No**, same reason. |
| `apps/editor/__tests__/hello-12-elements.test.ts` | same | **No**, same reason. |
| `apps/editor/__tests__/projectOpenStreamLoadFallback.test.ts` (4 tests) | `TypeError: (…) is not a constructor` at `apps/editor/src/ui/platform/PlatformShell.ts:109` — a `vi.mock` factory returns a plain object where a constructor is required | **No.** A mock-authoring defect. Platform-independent. |
| `apps/editor/__tests__/parcelBoundaryEnvelopeOrdering.test.ts` (1 test) | `AssertionError: expected -1 to be greater than 0`, preceded by `[gis][muc] network error [TypeError: Failed to parse URL from /api/muc/zoning?...]` | **Plausibly yes** — an unmocked relative-URL `fetch` under Node. This is the only one of the five for which the "environmental" story holds up. |

**Correction to the prior characterisation, as instructed.** The starting brief recorded
these 5 as "appear environmental (relative-URL fetch in Node, no mock)". Re-verified: that
is true of **1 of 5**. Three are `HTMLElement is not defined` under an explicitly
`environment: 'node'` config, and one is a mock-constructor bug. All four are
platform-independent and will fail on `ubuntu-latest` exactly as they fail here.

### Job 5 verdict

> **CI runs on push to `main`, but it does not gate.** The one job that could block —
> `test-unit` — is red on the current tree with four platform-independent failures, and even
> if it were correctly enforced, `deploy-fly.yml` deploys to production on the same push
> with no dependency on CI's result. Coverage is ~11% of workspaces; three of the five
> documented suites (`test:pryzm1`, root `vitest`, Playwright E2E) are wired to nothing.
>
> **Therefore: any claim of "green" in this report or in any prior audit — including
> claims I make in §1 below — is a claim about a specific command someone ran by hand at a
> specific moment, not about an enforced invariant.** Read every FIXED-VERIFIED below with
> that caveat attached.

### What IS green (hand-run this session, at baseline)

| Command | Result |
|---|---|
| `npx tsc --skipLibCheck --noEmit` | exit 0, no diagnostics |
| `npm run test:server` | `Test Files 12 passed (12) / Tests 169 passed (169)` |
| `pnpm --filter @pryzm/site-parcel-data test:ci` | `Test Files 17 passed (17) / Tests 208 passed (208)` |
| `npx vitest run --root apps/editor` | **5 failed / 1858 passed** (above) |

### Bottom line: can anything in this report be trusted as "tested"?

Stated plainly, because it is the most important sentence in the document: **almost
nothing in this report is "tested" in the sense of being enforced. Job 3's findings are
code-inspection claims with no CI enforcement behind them, and so are mine.**

Precisely:
- **Genuinely tested, by me, this session:** the type-checker is clean; `test:server`
  (169) and `@pryzm/site-parcel-data` (208) pass; the editor suite fails 5; `pnpm audit`
  reports 103 advisories. Those five numbers are real command output and can be trusted.
- **NOT tested — code inspection only:** every FIXED verdict in Job 3. L-360's no-brick
  behaviour, all four WebGPU fixes (L-362/363/364/366), L-365's globe baseline, the L-188
  restore path, and every wiring claim in Job 4 (which module imports which) were verified
  by reading code and grepping call sites. Not one was executed.
- **Why that gap is not closeable from here:** the WebGPU items need a GPU and a browser;
  L-188/L-489 needs a human to save, close and reopen a GIS project; L-396 needs production
  database access. None exist in this environment.
- **Why the gap would not be caught in CI either:** the editor suite is red and does not
  block the deploy; 129 of 165 workspaces are silently skipped by `--if-present`; and
  three of the five documented suites are wired to nothing. Even a *correct* CI would not
  cover the render, persistence, or geospatial paths where the P0s live, because those have
  no automated coverage at all.

So the correct reading of Job 3 is: *"the code changes described are present and look
right"* — never *"the defects are confirmed gone."* Only L-387 (a live audit run) and the
five test/typecheck numbers above meet the stronger bar.

Note the drift from the brief's starting figures: `test:server` 167→169 and
site-parcel-data 178→208. Both grew because the concurrent agents added
`server/__tests__/catastroBlock.test.ts` (+51 lines) and two new
`packages/site-parcel-data/__tests__` files. The numbers in the brief were correct when
taken; they are simply stale by a few hours. Both suites are genuinely green.

---

## 3 — Launch blockers, live status (JOB 3)

Every row: I located the item in `V1-LAUNCH-READINESS-AUDIT.md` to learn what it *is*, then
verified in code at baseline. "Claimed" = what the prior doc says. "Verified" = what I
observed.

### L-360 — snapshot checksum hard-refused valid projects (P0 regression)

**Status: FIXED-VERIFIED (code) — but the audit's own verification note is WRONG.**

The audit row (`V1-LAUNCH-READINESS-AUDIT.md:506`) carries this note: *"🔎 CODE-VERIFIED
2026-07-18 … `SnapshotIntegrity.ts` / `computeSnapshotChecksum` (cited in this row) and the
`ProjectSerializer.ts:978-983` stamp + `ProjectLoader.ts` refuse-path do NOT exist in the
current tree."*

**That is false.** All three exist at baseline:

- `packages/persistence-client/src/loader/SnapshotIntegrity.ts:159` —
  `export function computeSnapshotChecksum(snapshot: unknown): string`
- `apps/editor/src/engine/persistence/ProjectSerializer.ts:1010` —
  `checksum: computeSnapshotChecksum(snapshot),`
- `apps/editor/src/engine/persistence/ProjectLoader.ts:337-360` — the load-side verify.

**What actually happened is better than "removed": it was rebuilt correctly.** The defect
(hard-refuse) is genuinely gone, and the two root causes are addressed in code, not by
deletion:

- `SnapshotIntegrity.ts:29-32`: *"A checksum MISMATCH is a resolvable SIGNAL, never a
  brick. … the loader treats a present-but-mismatched checksum as a non-blocking integrity
  WARNING (load best-effort) … It never throws or refuses."*
- `ProjectLoader.ts:352` — `console.error('[ProjectLoader] §L-334 checksum mismatch — loading BEST-EFFORT (project NOT bricked)')`, and the result carries an advisory
  `result.integrity = { ok: false, … }` (`:354`) rather than aborting.
- `ProjectSerializer.ts:1002-1007` — the digest is computed LAST, with `integrity` and the
  volatile `versionLabel` excluded, which was the specific false-corrupt trigger.
- Determinism has a test: `packages/persistence-client/__tests__/loader/SnapshotIntegrity.test.ts:52`
  — `describe('computeSnapshotChecksum — determinism (the no-brick guarantee)')`, asserting
  `computeSnapshotChecksum(s) === computeSnapshotChecksum(JSON.parse(JSON.stringify(s)))`.

**Verified:** the code path can no longer refuse a load; the exclusion fix is present; a
round-trip determinism test exists. **Not verified:** that a real 1009-element production
project loads — no such fixture was exercised, and `packages/persistence-client` is one of
the 18 workspaces with a `test:ci`, so it *is* in the (red-overall) CI job, but I did not
run it in isolation.

**Residual risk:** low — the failure mode is now structurally impossible (no refuse path
exists), but the *detection* value of the checksum is unproven against real compressed
blobs.

**⚠ Doc mismatch to correct:** the "CODE-VERIFIED 2026-07-18" note in the audit row is
factually wrong about the tree and should be replaced; someone reading it would conclude
there is no integrity checking at all, when there is.

---

### L-361 — WebGPU crash cascade on batch AI residential generation (P0)

**Status: OPEN — mitigations shipped, root unfixed, live confirmation absent.**

The audit itself says *"OPEN — ROOT CONFIRMED, FIX IN REVIEW (not yet Fixed; P0)"*. Nothing
in code contradicts that. What exists is the L-362/L-364/L-366 mitigation stack (below).
The root — a driver-level TDR triggered by the PSO-compile storm on WebGPU — is not fixed
and by design cannot be fixed in application code.

**Verified:** the mitigations exist and are wired (see next rows). **Not verified:** that a
real batch residential generation on a real WebGPU device no longer device-losses. That
requires a live GPU run; this session had no browser.

**Residual risk:** high — the entire mitigation is "don't use the backend that crashes",
and its correctness depends on a heuristic firing on scenes nobody has measured in the wild
since L-366.

---

### L-362 — Auto-mode proactive WebGL fallback for heavy scenes

**Status: FIXED-VERIFIED (code wiring) / FIXED-UNVERIFIED (behaviour).**

- `apps/editor/src/rendering/autoWebGLHeavyScene.ts` exists, 23,543 bytes.
- Thresholds are the dedicated ones, not the borrowed massing gate:
  `autoWebGLHeavyScene.ts:99-100` — `const SWAP_ELEMENT_THRESHOLD = 400;` /
  `const SWAP_MESH_THRESHOLD = 1000;`, consumed by `isSwapWorthyHeavyScene` (`:109`), gate
  applied at `:240`.
- Three production call sites (grep, baseline):
  `apps/editor/src/engine/initBatchLifecycle.ts:5`,
  `apps/editor/src/engine/initScene.ts:82`,
  `apps/editor/src/ui/generation/buildingGenerationLifecycle.ts:44`.
- Unit test present: `apps/editor/__tests__/autoWebGLHeavyScene.classicSwap.test.ts`.

**Verified:** the module, the thresholds, and three real (non-test) importers.
**Not verified:** that the swap fires on a live device before the PSO storm.
**Residual risk:** medium — a threshold-based race against a GPU compile storm is timing-
sensitive, and no live run has confirmed the swap wins the race.

---

### L-363 — `TSL module not loaded` spam on batch start

**Status: FIXED-VERIFIED (code) / FIXED-UNVERIFIED (live).**

`packages/renderer-three/src/pipeline/RenderPipelineManager.ts:2156` defines
`private get _tslLoaded(): boolean`, and the guard is applied at three call sites —
`:2186`, `:2269`, `:3009`. This matches the described L-319 re-application exactly.

**Verified:** the guard exists at every cited site. **Not verified:** the audit marks this
"awaiting live WebGPU confirmation", and that confirmation still has not happened —
nothing in the tree records one.
**Residual risk:** low — a null-guard is hard to get wrong; the worst case is a deferred
pipeline build, not a crash.

---

### L-364 — `THREE.TSL: Invalid generated code, expected a 'float'` (transmission glass)

**Status: FIXED-VERIFIED (code, and the L-366 §Fix-2 gap is genuinely closed) / FIXED-UNVERIFIED (live).**

- `RenderPipelineManager.ts:1444` — `private _neutralizeTransmissionForWebGPU(): void`.
- Batch-path caller: `:1399` — `if (disabled && reason === 'batch') this._neutralizeTransmissionForWebGPU();`
- **The L-366 §Fix-2 hole is closed:** `:1417` exposes a public
  `neutralizeTransmissionForWebGPU()`, and it has a real non-batched caller —
  `apps/editor/src/engine/initScene.ts:2413`:
  `window.renderPipelineManager?.neutralizeTransmissionForWebGPU?.();`
  (typed on the shim at `apps/editor/src/types/globals.d.ts:419`). That is precisely the
  gap L-366 described: the resi/office generators add glass outside batches.

**Verified:** private neutralizer, public entry, and a real non-batch call site.
**Not verified:** live WebGPU. Also note the call site uses `window.renderPipelineManager?.…?.()`
— an optional-chained global; if the global is unset at that moment it silently no-ops,
which is exactly the [null-at-mount runtime-event race] failure shape seen elsewhere in
this codebase.
**Residual risk:** medium — the fix is correct but its invocation depends on a window
global being populated at the right moment, with no assertion if it isn't.

---

### L-365 — Cesium 3D-Tiles georeferenced placement (VERIFIED WORKING baseline)

**Status: FIXED-VERIFIED as a documented baseline — but treat with caution.**

This row is not a defect; it records a known-good state, anchored to the tag
`snapshot-cesium-3d-globe-working-2026-07-17` and to specific files/line numbers in
`CesiumViewport.ts` and `globeGroundAnchor.ts`.

**Verified:** the row exists and cites real files. **NOT verified:** the cited line
numbers (`renderRealModelOnGlobe:7530`, `renderFormaMassing:3021`, …).
`apps/editor/src/ui/geospatial/CesiumViewport.ts` is **modified in the working tree right
now** by a concurrent agent, and it also received changes in `c7524015` (L-524b) and
`ee749521` (L-532) today. A "verified working" row pinned to line numbers in a file that
three agents have edited since the verification is a stale certificate.
**Residual risk:** medium — the *capability* is almost certainly still sound, but the
evidence backing the row has decayed and it should be re-confirmed live before anyone
quotes it externally.

---

### L-366 — Auto-WebGL fallback did not fire for real buildings

**Status: FIXED-VERIFIED (all three sub-fixes present in code) / FIXED-UNVERIFIED (live).**

- **§Fix-1** (threshold too high): closed — `SWAP_ELEMENT_THRESHOLD = 400` /
  `SWAP_MESH_THRESHOLD = 1000` at `autoWebGLHeavyScene.ts:99-100`, replacing the borrowed
  `isHeavyModel` gate (≥15 levels AND ≥1000 elems, OR ≥4000 elems). A 1,300-element
  building now trips it.
- **§Fix-2** (guard had only a batch caller): closed — see L-364 above,
  `initScene.ts:2413`.
- **§Fix-3** (explicit WebGPU pin was respected even on heavy scenes): closed —
  `autoWebGLHeavyScene.ts:310` takes an `explicitPin: boolean` parameter, records it as a
  span attribute at `:332`, and at `:342` emits
  `' (overrides the explicit WebGPU pin — re-pick WebGPU to override.)'`. The override now
  wins over the pin, which is the behaviour the founder asked for.

**Verified:** all three code changes. **Not verified:** any live run. The founder's
original evidence was three live Fly runs; there is no equivalent evidence for the fix.
**Residual risk:** medium-high — this is a P0 crash class whose fix has only ever been
confirmed by reading the diff.

---

### L-53 — concurrent wall-baseline move is silent last-write-wins (collab data loss)

**Status: OPEN. Unchanged.**

- `grep -rn "baseLine" packages/sync-client/src/` → **zero matches**. There is no
  baseline-aware conflict path anywhere in the sync client.
- `packages/sync-client/src/YjsDocAdapter.ts` has exactly two conflict detectors —
  `_detectBatchConflicts` (`:687`) and `_detectCwLevelYMismatch` (`:782`) — which call
  `emitConflict` (`:636`) at `:703`, `:725`, `:846`. Neither concerns wall baselines.
- `CRDTConflictResolver` is constructed once, at `apps/editor/src/engine/engineLauncher.ts:922`,
  and is not reachable from the baseline write path.

**Verified:** the gap is exactly as described in the audit, with no partial mitigation.
**Residual risk:** currently *low in practice and high in principle* — see L-391: there is
no live multi-user transport, so no user can hit this today. It becomes a P0 data-loss bug
the moment collaboration ships.

---

### L-391 — real-time CRDT collaboration has no network backend

**Status: IN PROGRESS — client seam built and correct; backend still undeployed. The
user-visible gap is unchanged.**

Movement since the audit row was written:

- `apps/editor/src/engine/engineLauncher.ts:92` now imports
  `createWebsocketProvider` from `@pryzm/sync-client/websocket-provider`, and `:886` passes
  it into `connectCrdtProvider`. The audit's claim that "no `WebsocketProvider` is ever
  constructed" is **no longer literally true**.
- But it is **gated OFF by default**, by construction. `engineLauncher.ts:874-876`:
  ```ts
  // Master gate: OFF unless BOTH the flag is set and a URL exists.
  enabled: _flagOn && Boolean(_syncUrl),
  ```
  where `_flagOn` requires `window.__pryzmCollabCrdt === true` or `VITE_COLLAB_CRDT === 'true'`,
  and `_syncUrl` requires `window.__pryzmSyncUrl` or `VITE_SYNC_URL`.
- The code comment says so itself (`:857-858`): *"There is no deployed sync-server yet;
  turning this on is a deliberate Phase-1 step once `apps/sync-server` ships."*
- **Deployment confirmed absent:** `apps/sync-server/` exists as a package (has
  `Dockerfile`, `src`, `migrations`, tests) but `ls apps/sync-server/*.toml` →
  *"No such file or directory"*, and the only Fly config in the repo is the root
  `fly.toml`, whose `:100` reads `processes = ["app"]` with `:99` noting *"Multi-process
  (e.g. separate websocket worker) would need `[processes]` above."*

**Verified:** the client-side provider seam exists and is correct; the master gate defaults
OFF; there is no deployment path for the sync server.
**Not verified:** nothing claimed fixed.
**Residual risk:** the risk is not technical, it is a claims risk — production collab is
still socket.io command rebroadcast in arrival order (silent LWW), and the audit's framing
that this is a **human decision** (deploy vs. descope + remove the conflict-UI claim) is
still the correct framing. That decision has not been made.

---

### L-188 — GIS/site data lost on close + reopen (CRITICAL data loss)

**Status: FIXED-VERIFIED (both sides of the round-trip are wired) / FIXED-UNVERIFIED (no
end-to-end proof).**

The audit row says OPEN (CRITICAL). It is stale — the fix landed under the tag
`§FIX-GIS-SITE-STATE-NOT-PERSISTED`, and both halves exist:

- **SAVE:** `apps/editor/src/engine/persistence/ProjectSerializer.ts:998` —
  `site: site ?? undefined,` inside the snapshot object, sourced from the per-runtime
  `SiteModelStore` captured at `:744` (read guarded at `:758`). Declared at `:388`,
  store ref at `:715`.
- **LOAD:** `apps/editor/src/engine/persistence/ProjectLoader.ts:120` imports
  `restoreSiteState` from `@app/ui/site/siteDispatch`; called at `:1723`; success logged at
  `:1727`; failure is non-fatal at `:1729`.
- **RESTORE impl:** `apps/editor/src/ui/site/siteDispatch.ts:368` `restoreSiteState`, with
  the LTP-ENU origin forced back at `:339` — which addresses the audit's specific
  "C19 GEOSPATIAL ORIGIN not restored" sub-claim.
- **Streaming path also carries it:** `SnapshotStreaming.ts:104` (declare), `:242`
  (carry through the split), `:383` (restore on merge) — i.e. the fix is not only on the
  monolithic path.
- Cesium re-emits on restore: `CesiumViewport.ts:2160`.

**Verified:** the site model is serialized, is carried through snapshot splitting, and is
restored, including the LTP origin. **Not verified:** the actual founder-reported scenario.

### ⚠ CORRECTION — I initially graded this FIXED-VERIFIED. That was wrong. Here is why.

On a first pass I traced the RESTORE half, found it complete, and concluded the audit row
was stale. Then I searched for the `§L-489-SITE-CAPTURE-DIAG` line the coordinator flagged
and found the CAPTURE half is the broken one. **The corrected status is OPEN (P0), and
L-188 has effectively recurred as L-489.**

The evidence, from `V1-LAUNCH-READINESS-AUDIT.md:664` (L-489, founder 2026-07-20, reopening
a Córdoba house) and confirmed against code:

- The restore path is *not* the problem, and the audit says so explicitly: *"THE RESTORE
  PATH EXISTS AND ALWAYS RUNS (`ProjectLoader.ts:1722` → `restoreSiteState(runtime,
  snapshot.site ?? null)`, §FIX-GIS-SITE-STATE-NOT-PERSISTED L-188), so this is NOT 'site
  state was never persisted.'"* My §3 tracing of the restore half is correct but was
  answering the wrong question.
- The symptom set — building floats over the North Atlantic, nothing renders in 3D Site,
  envelope will not re-derive — is explained by ONE datum: `snapshot.site` was **null on
  that reload**, so `restoreSiteState` had nothing to anchor with.
- The capture code, `apps/editor/src/engine/persistence/ProjectSerializer.ts:750-761`,
  resolves the store then reads it:
  ```ts
  const resolvedSiteStore: SiteModelStore | undefined =
      siteModelStore
      ?? ((window as { runtime?: { siteModelStore?: SiteModelStore } }).runtime?.siteModelStore);
  const site: SiteModel | null = (() => {
      try {
          const s = resolvedSiteStore?.getSite?.() ?? null;
          return s ? (structuredClone(s) as SiteModel) : null;
      } catch (e) { … return null; }
  })();
  ```
- The diagnostic at `:763-787` exists and **warns loudly** when geometry is present without
  a site (`:780-786`: *"SAVING A GIS PROJECT WITH GEOMETRY BUT NO SITE GEOREFERENCE… this
  building will have no origin and will float"*) — **but it does not refuse the save.** The
  whole block is wrapped in `try { … } catch { /* diagnostic only — never block a save */ }`
  (`:787`). An element-bearing GIS snapshot with a null georeference is still written to
  disk today.
- Probe status per the audit row: read once on 2026-07-21, giving
  `§L-489-SITE-CAPTURE-DIAG siteStore=resolved · site=NULL · walls=0` — on an **empty new
  project**, where `site=NULL` is expected and proves nothing about the failing case. It
  does eliminate the threading hypothesis (`siteStore=resolved` ⇒ the store IS available at
  save time), narrowing the fault to `getSite()` returning null because the parcel/origin
  was never committed into `siteModelStore` at parcel-commit time.

**This is code inspection, not an executed save/close/reopen.** I cannot click a browser.
I did not create a GIS project, save it, close it, and reopen it. Everything above is a
read of the serializer, the loader, and the founder's own logged console line as recorded in
the audit.

**Exactly what a human must click to close this** — the one discriminating test:
1. Open PRYZM, start a GIS project, and **commit a parcel** (draw or select a boundary) on a
   real location — Barcelona Eixample or Córdoba.
2. Generate or draw **at least one wall** so the snapshot is element-bearing.
3. Trigger a save (or let the auto-save fire) and **read the console for**
   `[ProjectSerializer] §L-489-SITE-CAPTURE-DIAG siteStore=… site=… walls=…`.
   - `site=captured(lat=…)` **with `walls>0`** ⇒ capture works; the bug is downstream in
     re-anchoring, and L-188/L-489 should be re-scoped to the globe/Forma re-place path.
   - `site=NULL` **with `walls>0`** ⇒ **capture is the bug**, confirmed. Fix = make the
     parcel-commit write the LTP origin + boundary + trueNorth into `siteModelStore`, and/or
     refuse to serialize an element-bearing GIS snapshot with a null site.
4. Then close the project, reopen it, and check for
   `[ProjectLoader] §FIX-GIS-SITE-STATE-NOT-PERSISTED — C19 site state restored from snapshot`.
   Absent ⇒ confirms `snapshot.site` was null.

Note the audit's own standing instruction on this item: *"Do NOT patch the persistence path
until that one line is read."* That is the right call and it has not been read yet for the
`walls>0` case.

**Residual risk: HIGH, and this is a hard prerequisite for any compliance claim.** A
compliance envelope is meaningless if the georeference it was derived from does not survive
a close-and-reopen: the building floats, the 3D Site renders nothing, and the envelope card
degrades to *"Saved envelope shape. The source values and citations were not re-derived this
session"*. **No public claim about zoning compliance should be made until the L-489 probe is
read with `walls>0`.** Compounding this, the adjacent 404→local-IndexedDB fallback that the
founder's failing case ran through is covered by
`projectOpenStreamLoadFallback.test.ts` — one of the **five currently-failing tests** (§5).

---

### L-345 — C22 Privacy/PII draft + fully unimplemented (EU/GDPR blocker)

**Status: OPEN. Zero movement. Verified by absence.**

Checked every artefact the audit names:

| Named artefact | Present? |
|---|---|
| `anonymise.js` | No — `ls server/ \| grep -iE "anonym\|storageRouter\|consent\|dsar\|breach\|retention\|privacy"` → **no matches** |
| `storageRouter.js` | No (same check) |
| `consentStore.js` | No (same check) |
| `dsarStore.js` | No (same check) |
| `breachIncidentLog.js` | No (same check) |
| `apps/dsar-worker` | No — `ls apps/` returns: `ai-worker, api-gateway, bake-worker, bench, cli, component-editor, docs-site, editor, export-worker, marketplace, marketplace-api, marketplace-web, sync-server` |
| `apps/retention-worker` | No (same listing) |
| CI gates `check-data-tier-tag` / `check-pii-*` | No — `ls scripts/check/ \| grep -iE "pii\|data-tier"` → **no matches** |

**Verified:** all eight are absent. The only real control remains residency-by-deployment.
**Residual risk:** high and non-technical — this is a legal exposure on an EU-hosted
product, and the audit's own recommendation (build the minimum OR honestly rewrite C22 to
today's reality plus a manual DSAR SOP) has not been actioned in either direction.

---

### L-387 — 93 open dependency advisories (7 critical / 28 high)

**Status: OPEN — and it has REGRESSED, not held.**

Re-ran `pnpm audit --json` at baseline:

```
vulnerabilities: {"info":0,"low":12,"moderate":52,"high":32,"critical":7}
```

That is **103 advisories (12 low / 52 moderate / 32 high / 7 critical)** versus the audit's
93 (7 critical / 28 high). Critical held at 7; **high rose 28 → 32**; total rose 93 → 103.

Affected modules, from the same run — every runtime-reachable package the audit flagged is
still present:

```
jspdf: critical    vitest: critical
ws: high           form-data: high      js-yaml: high     vite: high
happy-dom: high    fast-uri: high       tmp: high         devalue: high
brace-expansion: high
multer: moderate   protobufjs: moderate qs: moderate      dompurify: moderate
fast-xml-parser: moderate  uuid: moderate  ip-address: moderate  yaml: moderate
@opentelemetry/core: moderate  fast-xml-builder: moderate
esbuild: low  astro: low  @babel/core: low  body-parser: low
```

**Verified:** counts and module list from a live run this session. `jsPDF` (critical, used
in PDF export), `multer`, `ws`, `form-data`, `protobufjs` — the five the audit called
runtime-reachable — are all still unpatched.
**Residual risk:** high for a public launch; `jsPDF` LFI/injection in an export path that
processes user content is the single worst item.

---

### L-396 — backup RESTORE never drilled; free-plan projects live only in one browser

**Status: OPEN — and I found an additional inconsistency the audit did not record.**

- Audit cites `VERSION_LIMITS.free = 0` at `server.js:3258`. At baseline the constant is at
  **`server.js:3299`**: `const VERSION_LIMITS = { free: 0, architect: 15, studio: -1, firm: -1, enterprise: -1, owner: -1 };`, fallback `?? 0` at `:3307`. (Line drift only; the fact holds.)
- **New finding:** there is a *second*, contradicting `VERSION_LIMITS` at **`server.js:2590`**:
  `{ free: 1, architect: 15, … }`, fallback `?? 1` at `:2592`. And
  `packages/core-app-model/src/monetization/PlanConfig.ts:75` sets
  `PLAN_LIMITS.free.maxVersionsPerProject = 1`. So `free` is **0 in one endpoint, 1 in
  another, and 1 in the plan config** — a three-way disagreement about whether a free user
  gets a server-side version at all. The comment at `server.js:3297` claims it "mirrors
  PlanConfig.ts"; it does not.
- The DR drill itself: **UNVERIFIED — could not confirm because no drill can be executed
  from this environment** (no production database access). Nothing in the tree records a
  completed drill.

**Residual risk:** high — an unproven restore path plus an ambiguous free-tier version
policy means the blast radius of a data-loss event is genuinely unknown.

---

### L-397 — pricing contradiction

**Status: OPEN — NOT decided, NOT ratified.** Full detail in §3.

---

### §1 scoreboard

| Item | Status |
|---|---|
| L-360 | **FIXED-VERIFIED** (code); audit's verification note is itself wrong |
| L-361 | OPEN (root unfixable in app code; mitigations only) |
| L-362 | FIXED-VERIFIED (code) / FIXED-UNVERIFIED (live) |
| L-363 | FIXED-VERIFIED (code) / FIXED-UNVERIFIED (live) |
| L-364 | FIXED-VERIFIED (code) / FIXED-UNVERIFIED (live) |
| L-365 | FIXED-VERIFIED as a doc baseline; evidence has decayed (file since edited) |
| L-366 | FIXED-VERIFIED (all 3 sub-fixes in code) / FIXED-UNVERIFIED (live) |
| L-53 | **OPEN** |
| L-391 | **IN PROGRESS** (client seam built, gated OFF, backend undeployed) |
| L-188 | **OPEN (P0)** — restore half verified complete; CAPTURE half is broken and recurs as **L-489**. I graded this FIXED-VERIFIED on first pass and corrected it; see the correction box. |
| L-345 | **OPEN** (verified by absence of all 8 artefacts) |
| L-387 | **OPEN — REGRESSED** 93 → 103 advisories |
| L-396 | **OPEN** + new three-way `free` version-limit inconsistency |
| L-397 | **OPEN** (founder decision, not made) |

**Count, after the L-188 correction: exactly 1 blocker is FIXED-VERIFIED in the strong
sense — L-360, and even there the audit's own verification note about it is factually
wrong. 5 are FIXED-VERIFIED-IN-CODE-ONLY (L-362 / L-363 / L-364 / L-366, plus L-365 as a
decayed baseline); every one of those carries an explicit "awaiting live WebGPU
confirmation" that has never been supplied, and none of them can be confirmed without a
GPU and a browser. 7 are OPEN (L-361, L-53, L-188, L-345, L-387, L-396, L-397), one of
them (L-387) regressed. 1 is in progress (L-391).**

The pattern worth naming for the founder: **the fixes that are "verified" are verified by
reading diffs, not by running anything.** Five P0 render fixes, one P0 persistence fix, and
the entire compliance footprint-wiring all rest on code inspection. That is a direct
consequence of §5 — there is no gate that would have caught it if any of them were wrong.

---

## 4 — Compliance engine: what fraction is ACTUALLY built (JOB 4)

**SHA this section measures:** the symbol inventory immediately below was re-run at
`git rev-parse HEAD` = **`5646102bad5498235fd1a40339609d1bd9014af9`**, i.e. AFTER the two
commits that landed mid-audit (`4062b974` L-537 amplada de vial, `09d055ba` L-538 coverage
plan). The narrative verdicts that follow it were derived at `09d055ba`; I re-checked the
load-bearing ones (envelopeContainment callers, storeyCap callers, typology-pack
envelope-blindness) at the later SHA and they are unchanged.

### Whole-tree symbol inventory (grep at `5646102b`)

| Symbol | Where | Verdict |
|---|---|---|
| `ZoningProvider` | `packages/site-parcel-data/src/providers/ZoningProvider.ts:28` (interface), deps `:19` | **Real interface**, 1 conforming impl (DK) |
| `DkZoningProvider` | `packages/site-parcel-data/src/providers/DkZoningProvider.ts:43` | **Real implementation**, wired `siteDispatch.ts:926` |
| `BuildableEnvelope` | `packages/schemas/src/site/zoning/BuildableEnvelope.ts:134` (schema), `:180` (type), `:99` status, `:89` DerivationTrace | **Real**, richly modelled, consumed |
| `ZoningRulesEngine` | `packages/site-parcel-data/src/ZoningRulesEngine.ts` (~492 LOC) | **Real** — module of pure fns, not a class |
| `computeBuildableEnvelope` | def `ZoningRulesEngine.ts:114`; called `siteDispatch.ts:934` (DK), `:1216` (ES) | **Real and consumed** on both jurisdiction paths |
| `JurisdictionZoningContract` | schema `packages/schemas/src/site/zoning/JurisdictionZoningContract.ts:88`, type `:99`, exported `index.ts:13`, referenced `EnvelopeNumbers.ts:6`; **only consumer** `packages/site-parcel-data/src/rulepacks/esBarcelonaEnsanche.ts:73,74,148-149` (`ES_BARCELONA_ENSANCHE_PACK`) | **Real contract with exactly ONE rule pack conforming to it** — Barcelona. Denmark does not use a pack at all (`rulePack: null`). |
| `capStoreysToEnvelope` | def `packages/site-parcel-data/src/storeyCap.ts:107`; prod callers `OnboardingStepController.ts:1821`, `:2396` **(office only)** | **Real but barely consumed** |
| `checkEnvelopeContainment` | def `packages/site-parcel-data/src/envelopeContainment.ts:123`; re-export `src/index.ts:158,:164`; **importers: tests only** | **DEAD — zero production callers** |
| `buildCapacityComparison` | `packages/site-parcel-data/src/capacityComparison.ts:174`, exported `index.ts:31` | **DEAD — zero production callers** |
| `buildComplianceReport` | `packages/site-parcel-data/src/complianceReport.ts`; consumed `GISAreaLayout.ts:68,:2079,:2085-2114` | **Real and rendering, no flag** |

The `JurisdictionZoningContract` result is worth stating plainly because it was not in any
prior doc I read: the curated-rule-pack contract (C58 §2.2) exists and is properly schema-
validated, but **exactly one jurisdiction in the world has a pack conforming to it.**
Denmark works by consuming Plandata's structured published fields directly with
`rulePack: null`; everywhere else falls to the invented `estimated-ruleset` default.



### Does a `ZoningProvider` interface exist?

Yes. `packages/site-parcel-data/src/providers/ZoningProvider.ts:28` —
`export interface ZoningProvider { id, label, fetchZoningAtPoint(lat, lon, deps) }`,
deps type at `:19`. ~42 LOC, interface only.

**Real implementations: one.**

- **Denmark — REAL, and it implements the interface.**
  `packages/site-parcel-data/src/providers/DkZoningProvider.ts:43` (112 LOC), fetching the
  same-origin proxy `/api/plandata/zoning` (`:33`), mapping via the pure
  `mapPlandataToZoningRecord.ts` (185 LOC), bbox-gated by `denmarkBbox.ts`. Server proxy:
  `server/plandataZoningProxy.js` (310 LOC). Wired at `apps/editor/src/ui/site/siteDispatch.ts:926`.
- **Spain — REAL data, but it BYPASSES the interface.**
  `apps/editor/src/ui/site/zoning/MucZoningProvider.ts` (112 LOC) is a bespoke editor-local
  fetch, not a `ZoningProvider` implementation. Server proxy `server/mucZoningProxy.js` (315 LOC).
- **Switzerland — DOES NOT EXIST.** No provider, adapter, bbox, or rule pack. The only
  code-side references are aspirational comments
  (`apps/editor/src/ui/site/parcel/ParcelProvider.ts:8`, `server/parcelZoningProxy.js:38`).

### Do `BuildableEnvelope` / `ZoningRulesEngine` exist?

Yes, both — and they are substantial, not stubs.

- `packages/schemas/src/site/zoning/BuildableEnvelope.ts:134` — `BuildableEnvelopeSchema`
  (zod), type at `:180`. Carries `insetPolygon`, `maxHeight_m`, `maxFAR`, `insetAreaM2`,
  `status` (`:99`), `confidence`, and a `DerivationTrace` (`:89`) of per-constraint
  provenance including `ordinanceRef`. ~180 LOC. **The provenance modelling here is
  genuinely good** — it was designed to be citable, not just numeric.
- `packages/site-parcel-data/src/ZoningRulesEngine.ts:114` —
  `computeBuildableEnvelope(input): BuildableEnvelope`, ~492 LOC. A module of pure
  functions (not a class). Resolves zoning record + rule pack → per-edge setback inset (or
  alignment/block-derived depth) in scene-XZ, plus height/FAR and a cited derivation trace.
- Supporting geometry, all real: `insetPolygon.ts` (467), `blockRing.ts` (321),
  `streetWidth.ts` (343), `blockDerivedDepth.ts` (184), `depthBandClip.ts` (148).

### THE CRUX — does anything constrain GENERATION to a computed envelope?

**Partially, and asymmetrically. Footprint: yes, with a silent fallback. Height: office
only. Verification: nothing.**

**Footprint — one shared chokepoint, four consumers, one silent degrade.**
`apps/editor/src/ui/site/siteDispatch.ts:263` `resolveBuildableFootprint(parcelPolygon)`
delegates to the pure `pickBuildableFootprint` (`:275`), which returns the envelope's
`insetPolygon` when `_lastEnvelope.status === 'ok'` and it has ≥3 points, **and otherwise
silently returns the raw parcel polygon** (`:295`). The envelope is a module-global cache
`_lastEnvelope` (`:138`) written only during parcel-boundary commit.

Verified consumers (grep, baseline — all real, none test-only):
- House: `apps/editor/src/ui/onboarding/OnboardingStepController.ts:2486`
- Apartment: `apps/editor/src/ui/apartment-layout/apartmentFromBoundary.ts:70`
- Residential building: `apps/editor/src/ui/residential-building/residentialFromBoundary.ts:203`
- Office: indirect — `OnboardingStepController.ts:2364` fits a circle inside the ring, but
  `:2374` lets a preview slider override the radius and `:2376` falls back to a hardcoded
  22 m default, neither re-checked against the envelope.

So the answer to "do generators still only read the raw parcel boundary?" is **no, they
read the envelope now** — but with a fallback that is indistinguishable, at the call site,
from success. The generator cannot tell whether it built compliantly or just built in the
parcel.

**Height — wired to exactly one typology, and disabled on estimated data.**
`packages/site-parcel-data/src/storeyCap.ts:107` `capStoreysToEnvelope`. Production callers
(grep, whole tree): **`OnboardingStepController.ts:1821` (office slider) and `:2396`
(office generate-time) — and nothing else.** House, apartment, and residential-building
never call it; their storey counts come from the brief, clamped to arbitrary literal ranges
(house `[1,3]`, resi `[1,20]`). Worse, `storeyCap.ts:182` makes the cap **advisory when
`isEstimate` is true** — i.e. everywhere outside Denmark and Barcelona-Eixample, the height
cap does not cap.

**Verification — written, tested, exported, and called by nothing.**
`packages/site-parcel-data/src/envelopeContainment.ts:123` `checkEnvelopeContainment`,
218 LOC, re-exported at `src/index.ts:157-164`. I grepped `apps packages plugins src server`
for importers. The complete result:

```
packages/site-parcel-data/src/envelopeContainment.ts:123:export function checkEnvelopeContainment(
packages/site-parcel-data/src/index.ts:158:    checkEnvelopeContainment,
packages/site-parcel-data/src/index.ts:164:} from './envelopeContainment.js';
packages/site-parcel-data/__tests__/envelopeContainment.test.ts   (14 occurrences)
```

**Zero production callers.** Its own header claims it is the verification half of
compliance-by-construction. Nothing verifies anything.

**And the L2 typology-pack pipeline — the "real" generator architecture — is entirely
envelope-blind.** `packages/typology-pipeline/src/types.ts:84` `SiteContextSnapshot` has
`parcelBoundary` (`:91`) and **no envelope field at all**;
`packages/typology-pipeline/src/stages/siteContext.ts:21,:39` compute area and bbox from
`snapshot.parcelBoundary` — the raw parcel. A grep for `envelope|buildable` across the four
typology packs (`apartment`, `casa-unifamiliar`, `office-building`, `residential-building`)
returns **zero matches**. The envelope wiring lives entirely in the older editor-side
generator path, not in the architecture that path is being migrated to.

### Is there a compliance-report artifact?

**Yes, and it renders — this is real and is the strongest single piece of evidence.**

- Pure model: `packages/site-parcel-data/src/complianceReport.ts` (195 LOC) —
  `buildComplianceReport` renders envelope → rows of value · zone · source · provenance ·
  `ordinanceRef`.
- UI: `apps/editor/src/ui/layout/GISAreaLayout.ts:68` imports it, `:2079` builds it,
  `:2085-2114` renders a collapsed `<details>` "Why these numbers?" panel with per-row
  PUB/EST provenance badges and safe-href citations (`:2113`). Confidence badge with
  provenance labelling at `:2039-2045` (`Estimated` / `Real · constructed`). A degraded
  card for reload-with-only-the-ring at `:2005-2024`. Mounted via `refreshEnvelopePanel()`
  (`:2005`), called at `:2255` and `:3611`.
- **No feature flag** — reachable whenever a parcel boundary is committed in the GIS/3D-Site
  area.
- **But there is no exporter.** Nothing in `packages/pdf-export/src` references compliance
  or envelope. And `capacityComparison.ts:174` `buildCapacityComparison` (227 LOC,
  proposed-vs-permitted) is exported at `index.ts:31` with **zero production callers** —
  another built-and-unwired module.

### So: is it still ~5% built, or has it moved?

**It has moved materially — call it ~25–30% of a compliance engine, up from ~5%.** The
justification, and the reason it is not higher:

**What is genuinely built (this is the real progress):**
- A provider abstraction with one conforming real implementation (DK) and one real
  non-conforming one (ES).
- A 492-LOC rules engine producing a schema-validated envelope with per-constraint
  provenance and ordinance citations — this is the hard, differentiating part and it exists.
- A rendering compliance card with source/confidence labelling, live and unflagged.
- Four generators consuming the inset envelope as their footprint.
- ~208 passing tests in `@pryzm/site-parcel-data`.

**Why it is not a compliance engine yet:**
1. **Nothing verifies the output.** The containment checker has zero callers. A generator
   can produce a building outside the envelope and no code will ever notice.
2. **The footprint constraint fails open, silently.** `pickBuildableFootprint` degrades to
   the raw parcel with no signal the caller can act on.
3. **Height is enforced for one typology out of four, and only on real (non-estimated)
   data** — which is two cities on earth.
4. **The target architecture doesn't know envelopes exist.** Zero references in
   `typology-pipeline` or any of the four typology packs. Today's wiring is on the path
   being migrated away from.
5. **Two of three named jurisdictions are one city and zero cities respectively.**

A solver that produces a beautifully-cited envelope which one of four generators
half-obeys, one verifier ignores, and the destination architecture has never heard of, is
an *envelope calculator with a good report card* — not a compliance engine. The calculator
is genuinely good. The engine is the part that is ~25% done.

### The number, stage by stage

Scoring the five stages of the `parcel → zoning → envelope → constrained-generation →
report` loop by how much is real, working, wired code:

| Stage | % real | Justification (evidence in this section) |
|---|---|---|
| **parcel** | **80%** | Two real providers (`CatastroParcelProvider` 145 LOC, `CatastroBlockProvider` 189 LOC) behind a real `ParcelProvider` interface; draw-path and select-path both live. Docked for `index.ts:12` hardcoding Spain as `defaultParcelProvider`, and for L-536 (parcel-boundary mismatch across 2D/plan/3D, reported and undiagnosed). |
| **zoning** | **45%** | One conforming `ZoningProvider` (DK) + one real non-conforming fetch (ES/MUC), both with server proxies and tests. Docked hard because `JurisdictionZoningContract` has exactly ONE conforming pack (Barcelona), CH is zero code, and L-535 shows the block dissolve succeeding BCN 2/2 but Madrid 2/4 and Córdoba 0/3 — so it is not known to generalise even within Spain. |
| **envelope** | **70%** | The strongest stage: 492-LOC `computeBuildableEnvelope`, schema-validated output with `DerivationTrace` + `ordinanceRef`, real supporting geometry (~1,460 LOC across 5 modules), 208 passing tests. Docked for coverage (2 jurisdictions) and for the L-529 class of defect — a greedy inset cleanup silently collapsing 40 verts to 2 — which was found by probing geometry, not by any gate. |
| **constrained-generation** | **20%** | Footprint reaches 4 generators, but through a fallback (`pickBuildableFootprint`, `siteDispatch.ts:295`) that silently degrades to the raw parcel with no signal. Height caps 1 typology of 4, and `storeyCap.ts:182` disables the cap entirely on estimated data. The destination architecture (`typology-pipeline` + 4 typology packs) has **zero** envelope references. |
| **report** | **35%** | `buildComplianceReport` renders live and unflagged with PUB/EST provenance and citations (`GISAreaLayout.ts:2085-2114`) — genuinely good. But there is no exporter (nothing in `packages/pdf-export` references it), `buildCapacityComparison` is dead, and no containment result can appear because nothing computes one. |

**Weighted overall: ~40% of the loop exists as real code; ~25% of it functions as a
compliance engine.** The gap between those two numbers is the honest headline: the
*computation* is well past half-built, but the two properties that make it a *compliance*
system rather than a calculator — that generation is bound by the envelope, and that the
result is verified against it — are 20% and 0% respectively.

**Explicitly: this is no longer "~5%".** That figure is stale and understates real work.
But the increase is concentrated in parcel/zoning/envelope, which is the half that produces
a number, not the half that makes the number binding.

---

## 2 — Pricing (JOB 2 — L-397)

**Three mutually inconsistent price sets exist, and L-397 has NOT been decided or ratified.**

**Billing code — what would actually charge a card:**
`packages/core-app-model/src/monetization/PlanConfig.ts`, `PLAN_PRICING` at `:160`:

| plan id | monthlyUSD | annualUSD | line |
|---|---|---|---|
| `owner` | `null` | `null` | `:162` |
| `free` | `0` | `0` | `:170` |
| `architect` | **59** | 590 | `:178` |
| `studio` | **149** | 1490 | `:186` |
| `firm` | **349** | 3490 | `:194` |
| `enterprise` | `null` (Custom) | `null` | `:202` |

**`server.js`** carries no plan price constants at all — plan checkout runs through the
Stripe router mounted at `server.js:2144`, with price IDs in env. What `server.js` *does*
carry is quota, and it disagrees with itself:
- `server.js:2590` — `VERSION_LIMITS = { free: 1, architect: 15, studio: -1, firm: -1, enterprise: -1, owner: -1 }`
- `server.js:3299` — `VERSION_LIMITS = { free: 0, architect: 15, … }`, with a comment at
  `:3297` claiming it mirrors `PlanConfig.ts`
- `PlanConfig.ts:75` — `PLAN_LIMITS.free.maxVersionsPerProject = 1`
- `server.js:2591` — `AI_LIMITS = { free: 5, architect: 50, studio: 200, firm: 500, … }`

**What users actually see today — two different surfaces:**
1. **Public `/pricing`** (`apps/editor/src/ui/marketing/PricingPage.ts`, mounted `:176-181`,
   linked from `landingMarkup.ts:102,:122,:166,:185`) shows **no prices at all** — a grep
   for `\$[0-9]|monthlyUSD` in that file returns zero. It is a feature matrix from
   `packages/entitlements/src/pricingPage.ts:95-149`, with column headers from
   `TIER_DISPLAY_NAMES` (`:54-62`): `Free Trial / Solo / Studio / Mid-Firm / Enterprise /
   Developer / Admin` — the **C39 taxonomy, which the billing code does not use.**
2. **In-app upgrade page** (`apps/editor/src/ui/platform/PricingPage.ts:211-217`, also
   `UpgradeModal.ts:171`) shows the real numbers: **Free / $59 / $149 / $349** (or
   $590/$1490/$3490 annual) / Custom.

**Strategy docs — a third set:** `docs/01-strategy/STR-02-product-vision.md:305-308` and
`STR-08-go-to-market.md:204-209` advertise Solo **$25**/mo, Studio **£15**/seat/mo, Mid-firm
**$35**/seat/mo, Enterprise $100/seat/mo + custom. `STR-08:200` says "Pricing is set in C39".

**Has L-397 been decided or ratified? No.**
- `docs/02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md:3` — `**Status**: DRAFT`,
  stamped 2026-06-01. Still draft.
- C39 contains **no monetary price set** — only quota tables (`:120-124`) and an open
  question about an Enterprise floor (`:456`). Its taxonomy at `:102` is
  `'solo' | 'studio' | 'mid-firm' | 'enterprise'` — a **third** taxonomy contradicting both
  the code and, partly, the marketing page.
- No superseding ADR exists. `docs/02-decisions/adrs/` has no pricing/plan/billing ADR; the
  only name-match, `ADR-0236-stakeholder-review-pricing.md`, concerns feature positioning,
  not plan tiers.
- `git log -- docs/02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md` → 3 commits, newest
  `af8dff6a`, predating the 2026-07-17 audit.
- All live trackers still say OPEN: `V1-LAUNCH-READINESS-AUDIT.md:576`,
  `SEPTEMBER-READINESS-MASTER-PROGRAM-PLAN.md:148`, `:306`, `:91`, `:392`.

**Verdict: L-397 is OPEN and awaiting a founder decision.** One mitigating fact: because the
public `/pricing` page prints no numbers, the contradiction is not currently visible to a
prospect who has not signed up. That is luck, not design — and it breaks the moment anyone
puts a number on the marketing page.

---

## 1 — 3D Site Analysis labelling (JOB 1 — L-373a)

**Status: OPEN — NOT fixed.** The palette is unchanged and no fidelity badge exists on any
layer.

**The layer set is a closed union of five** —
`apps/editor/src/ui/climate/siteMetricGrids.ts:89`:
```ts
export type SiteMetric = 'sunHours' | 'temperature' | 'wind' | 'population' | 'daylight';
```
Chip labels at `:185-191`; chip row rendered at
`apps/editor/src/ui/geospatial/FormaSiteAnalysisControls.ts:967-1006`.

**Is the Lawson palette still Lawson-styled? Yes.** Verified directly:
- `packages/street-analytics/src/WindComfortGrid.ts:39-46`:
  ```ts
  /** Lawson class → hex colour (calm-blue → green → amber → red; matches Henning Larsen). */
  export const LAWSON_COLOURS: Record<LawsonClass, string> = {
    comfortable:   '#3B82F6',
    acceptable:    '#22C55E',
    uncomfortable: '#F59E0B',
    dangerous:     '#EF4444',
    sheltered:     '#94A3B8',
  };
  ```
- And the user-visible legend title, `apps/editor/src/ui/climate/siteMetricGrids.ts:2854-2860`:
  ```ts
  case 'wind':
      return {
          title: 'Pedestrian wind (Lawson)',
          stops: [LAWSON_COLOURS.comfortable, LAWSON_COLOURS.acceptable, LAWSON_COLOURS.uncomfortable, LAWSON_COLOURS.dangerous],
          lowLabel: 'Calm',
          highLabel: 'Gusty',
          unit: 'm/s',
      };
  ```
  The legend literally reads **"Pedestrian wind (Lawson)"** in the standards palette. Axis
  labels are `Calm`/`Gusty` — **no numeric min/max**, so the audit's "print real numeric
  min/max" recommendation is also unimplemented.

Meanwhile the underlying field is a centroid-distance shelter heuristic
(`WindComfortGrid.ts:70-95`: `shelter += (o.h / dist) * align;`
`effectiveSpeedMs = freestream * (1 - shelterFactor * 0.75)`) — strictly ≤ freestream, so
**wind acceleration is structurally unrepresentable**. The palette therefore implies a class
of result the model cannot produce.

**Are fidelity badges live on all layers? No — on none of them.** There is no badge
component anywhere: a grep for `FidelityBadge|fidelityLabel|BETA|not CFD|shelter estimate`
across `apps/**/*.ts` returns zero UI hits (two matches exist but are internal code
comments: `climateOverlayGeometry.ts:18`, `CesiumViewport.ts:8402`). The CI gate the audit
proposed (`check-siteanalysis-fidelity-label.ts`) exists only in docs, never in `tools/`.

What **does** exist is a single grey 9px prose caption, rendered only for the *currently
selected* metric, from `FormaSiteAnalysisControls.ts:1101-1146` (rendered at `:1085-1099`):

| Layer | Caption | Badge | Verdict |
|---|---|---|---|
| Wind comfort | `:1125-1133` — "…estimated Lawson pedestrian shelter/exposure…" / "Estimate — Lawson pedestrian-comfort proxy…" | none | **UNLABELLED** — says "estimate" but keeps bare "Lawson", no "not CFD / cannot show acceleration", no numeric range |
| Temperature | `:1117-1124` — "Real data · NASA POWER T2M + UHI ΔT…" | none | **UNLABELLED** — and legend axis is absolute °C (`:2843-2852`) while colour is relative |
| Population density | `:1111-1116` — "…OSM built-density proxy…, NOT measured residents." | none | **UNLABELLED (badge)** — but by far the most honest caption; chip tooltip at `:997-998` also says "not census data" |
| Sun hours | `:1134-1136` | none | **UNLABELLED** — no disclosure that occlusion is flat-ground / single-day |
| Daylight (VSC) | `:1137-1142` | none | **UNLABELLED** — no "not a code-compliant certificate" note |

The caption returns `null` for any metric not in the switch (`:1143`), so the disclosure is
silently optional by construction.

**Verdict: 0 of 5 layers carry a fidelity badge or methodology disclaimer component. The
"(Lawson)" title and the standards palette are unchanged. L-373a is OPEN.** This is the
single cheapest launch-blocking item on the list — it is a string change, a badge component,
and a numeric axis — and it is the one most likely to cause reputational damage if an
engineer sees a Lawson-coloured plot that never ran CFD.

---

## 6 — Denmark / Spain / Switzerland: actual code inventory (JOB 6)

**Denmark** — REAL and the only *complete conforming* vertical slice, though thin:
`packages/site-parcel-data/src/providers/DkZoningProvider.ts` (112 LOC) +
`mapPlandataToZoningRecord.ts` (185) + `denmarkBbox.ts` (26) + server proxy
`server/plandataZoningProxy.js` (310), wired `siteDispatch.ts:890` (gate) → `:926` (fetch) →
`:934` (`computeBuildableEnvelope`, `rulePack: null`, confidence `structured`); tests in
`__tests__/dkZoningProvider.test.ts`. **No Danish rule pack** — DK relies entirely on
Plandata's structured published fields, and degrades to the invented default pack if they
are missing.

**Spain** — the LARGEST real footprint, but scoped to Barcelona-Eixample claus 13a/13E:
parcel `CatastroParcelProvider.ts` (145) + `CatastroBlockProvider.ts` (189); zoning
`apps/editor/src/ui/site/zoning/MucZoningProvider.ts` (112, does *not* implement
`ZoningProvider`) + `server/mucZoningProxy.js` (315); rule packs `esBarcelonaEnsanche.ts`
(163, `jurisdictionId: 'es-08019-barcelona'`, PGM Art. 242.2), `bcnAlcadaReguladora.ts`
(163, Art. 327.2 height table), `bcnOfficialStreetWidths.ts` (222), `ampladaDeVial.ts` (240,
new today); geometry `blockRing.ts` (321), `blockDerivedDepth.ts` (184), `streetWidth.ts`
(343, new today), `depthBandClip.ts` (148); gate `barcelonaBbox.ts` (32); wired
`siteDispatch.ts:897` → `applyBcnZoningThenFallback` → `:1216 computeBuildableEnvelope`;
~10 dedicated test files. Outside claus 13a/13E it refuses and falls back to the estimated
default pack. *(This lane is the one moving under this report — `4062b974` landed L-537
during the audit, and the audit rows L-535/L-536/L-538 record that block dissolve succeeds
BCN 2/2 but Madrid 2/4 and Córdoba 0/3, i.e. the approach is not yet known to scale beyond
Barcelona.)*

**Switzerland** — **DOCS ONLY. Zero code.** `docs/04-reference/switzerland/{README.md,
regions/{national-2_0-baseline, sankt-gallen, schwyz, zurich}, topics/*.md}`. The two
code-side mentions (`ParcelProvider.ts:8`, `server/parcelZoningProxy.js:38`) are aspirational
comments; a third (`server/overpassProxy.js:71`) is an unrelated mirror exclusion.

---

## 7 — Honest verdict (JOB 7)

We can truthfully say today that PRYZM computes a real, schema-validated, ordinance-cited
buildable envelope from live public zoning data in Denmark and in central Barcelona, renders
it with per-value source and confidence labelling in a live unflagged panel, and passes the
resulting inset polygon to four building generators as their footprint — roughly 40% of the
parcel→zoning→envelope→generation→report loop exists as real working code, which is
substantially more than the "~5%" prior docs record. We cannot claim a compliance engine:
nothing verifies that a generated building stays inside the envelope
(`checkEnvelopeContainment` has zero production callers), the footprint constraint silently
falls back to the raw parcel, height is capped for one typology of four and not at all on
estimated data, the target typology-pipeline architecture contains zero references to
envelopes, only one jurisdiction on earth has a conforming rule pack, and — decisively —
L-489 shows a saved GIS project can reopen with a null georeference, which makes any
compliance result unable to survive a close-and-reopen. We also cannot claim a green build,
real-time collaboration, CFD-grade site analysis, a settled price list, or GDPR readiness:
the hard-fail unit gate is red on `main` with four platform-independent failures and does
not block the Fly deploy in any case, collaboration is flag-gated off with no deployed
backend, all five site-analysis layers carry a Lawson-coloured or absolute-axis legend with
zero fidelity badges, three mutually inconsistent price sets are live across code and docs
with C39 still DRAFT, dependency advisories have regressed from 93 to 103, and every one of
the eight artefacts C22 requires for DSAR/retention/PII is absent from the tree.

---

## Appendix — commands run for this report

All executed at baseline `09d055ba` (working tree including concurrent agents' uncommitted
changes), on Windows 11 / Node v24.15.0 / pnpm 10.26.1.

```
git rev-parse HEAD                                   → 09d055ba… (start) / 5646102b… (end)
npx tsc --skipLibCheck --noEmit                      → exit 0, no diagnostics
npm run test:server                                  → 12 files / 169 tests passed
pnpm --filter @pryzm/site-parcel-data test:ci        → 17 files / 208 tests passed
npx vitest run --root apps/editor                    → 5 files / 5 tests FAILED, 1858 passed
pnpm audit --json                                    → low 12 / moderate 52 / high 32 / critical 7
```

**Could not run / verify:**
- GitHub Actions run history and branch-protection required-checks — `gh: command not found`.
- Any live-browser / live-GPU confirmation (L-361 through L-366, L-188 round-trip, L-365
  baseline) — no browser in this environment.
- A production restore drill (L-396) — no production database access.
