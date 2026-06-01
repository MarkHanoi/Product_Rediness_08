# ADR-0052 — S70 Browser Matrix + WCAG + Self-Host Publish + PDF-to-BIM Preview + Lifecycle Deletion

**Status**: Accepted
**Sprint**: PRYZM 2 Phase 3D · S70
**Date**: 2026-04-28
**Spec ref**: `docs/03_PRYZM3/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S70 (lines 308-346) + SPEC-15 §7 (self-host) + SPEC-27 §4.3 (codebase deletion gates) + SPEC-27 §7 (self-host migration tooling) + SPEC-28 §11 (BYO-key safety cap) + ADR-029 Part E (PDF-to-BIM accuracy bar) + ADR-030 Part D (lifecycle deletion)
**Supersedes**: nothing
**Superseded by**: nothing

---

## A. Context

S70 is the second-to-last sprint of Phase 3D and bundles together five normally-independent surfaces into one calendar window: cross-browser CI matrix, WCAG 2.2 AA audit + remediations, self-host docker-compose + migration tooling **publish**, PDF-to-BIM **public preview launch**, and the legacy `src/lifecycle/` **deletion**. The bundling is intentional — every item is a release-gate prerequisite for S71/S72 and none is large enough to justify its own sprint.

This ADR records the seven decisions S70 D-day-actionable closure encodes. As with S67/S68, several days (D2 Firefox-runtime fixes, D3 Safari-runtime fixes, D4 Edge confirmation, D10 buffer) are **operator-side activities** that depend on either (a) a real cross-browser execution environment or (b) ghcr.io publish credentials neither of which is present in this development container. The decision-of-record about scope is captured here so future sprints can read one document instead of seven to understand "what does PRYZM 2 think a GA-ready browser/a11y/self-host posture looks like, and which gates are open vs closed?".

---

## B. Decision

### B.1 — Browser matrix scope: 5 projects, smoke + a11y-baseline + visual-diff

The CI matrix runs **5 Playwright projects** against `tests/browser-matrix/`:

| Project       | Engine       | Viewport            | Notes |
|---------------|--------------|---------------------|---|
| chromium      | Chromium 130 | 1280×720            | reference for visual-diff |
| firefox       | Firefox 132  | 1280×720            | per phase doc S70 D2 |
| webkit        | WebKit 18.4  | 1280×720            | proxy for Safari Mac (D3) |
| edge          | Chromium     | 1280×720            | channel: msedge (D4) |
| ipad-safari   | WebKit       | 1180×820 (iPad Pro 11) | per phase doc S70 D5 |

Each project runs three specs:
1. `smoke.spec.ts` — boot the editor, navigate `/`, assert landmarks render, capture full-page screenshot.
2. `wcag.spec.ts` — run `@axe-core/playwright` on `/`, assert zero serious + zero critical WCAG 2.2 AA violations (smoke baseline; full audit lives in `docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md`).
3. `visual-regression.spec.ts` — on chromium, write reference; on others, diff against reference with the per-phase-doc 5-pixel tolerance.

The matrix lives in `.github/workflows/browser-matrix.yml`. Locally, `pnpm --filter @pryzm/test-browser-matrix run test` runs the chromium project only (the only engine reliably installed in dev container CI runners).

**Why 5 not 4**: phase doc exit criterion #2 names iPad explicitly ("Tablet review mode confirmed on iPad Safari"); rolling it into the webkit project conflates desktop-Safari and iPad-Safari failure modes. Splitting them keeps the visual-diff baseline per-viewport.

**Why visual-diff threshold = 5px**: phase doc S70 row #2 exit criterion: "Visual regression suite per browser (Chrome reference; others diff < 5 px)".

### B.2 — WCAG audit scope: 4 critical paths now, deep-audit deferred to T+90d

Phase-doc exit criterion #5: "WCAG 2.2 AA achieved on critical paths (project hub, editor, inspector, sheet view)". S70 ships:

- **Audit document** at `docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md` — formal audit per axe-core 4.x + manual review of each of the 4 critical paths.
- **Audit runner** at `packages/wcag-audit/` — pure function `runAxeAudit(html: string)` so any test or CI step can audit a static HTML fragment.
- **Smoke gate** in T002 — `wcag.spec.ts` asserts zero serious/critical findings on the boot route per browser per CI run.
- **Remediations landed in this commit**:
  - `index.html`: `lang="en"`, `<meta name="description">`, `<title>` review, `<a href="#main" class="skip-link">` skip-link wrapping the main landmark.
  - `packages/ui/src/a11y/`: focus-ring tokens (3:1 contrast minimum per WCAG SC 1.4.11 + 2.4.7), skip-link CSS, screen-reader-only utility class.

**Deferred to post-S70**: deep audits of the project-hub UI (does not yet exist as a discrete surface — S71 marketing site wires it), the inspector panel (PRYZM 2 surface stub-only at S70), and the sheet view (PRYZM 2 surface stub-only at S70). The axe-baseline gate from T002 catches regressions on the surfaces that **do** ship today (marketing landing + editor boot route); the deferred surfaces will be re-audited at the 90-day post-GA review per docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md §6.

### B.3 — Self-host publish: build-locally green today, ghcr.io tag-prep manifest in commit, push deferred to operator

Phase-doc exit criterion #6: "Self-host docker-compose + migration tooling published". S67 D1+D4 already landed the docker-compose YAML + per-service Dockerfiles + install.sh; what was open at S67 close was the **publish step** (operator-side ghcr.io credentials).

S70 closes the publish step on the **manifest** dimension:

- `pryzm-selfhost/RELEASE-NOTES-2.0.0.md` — release notes for the 2.0.0 self-host bundle.
- `pryzm-selfhost/version.json` — machine-readable manifest naming each service version, schema version, file-format version, supported upgrade-from list.
- `pryzm-selfhost/scripts/publish-prep.sh` — dry-run script that validates the manifest, prints the `docker compose build --push` command, and exits 0 without pushing. The operator runs this script with `GHCR_PAT` set to actually push.

**Why dry-run not push**: this development container has no ghcr.io credentials; pushing would either fail loudly (best case) or accidentally publish images built without proper provenance. Per S67 D5 deferral discipline, the publish step is operator-side; what S70 owes is a **published manifest** the operator can trust to drive the push, and we ship that.

### B.4 — Self-host migration tooling lives in @pryzm/cli, not a new package

Phase-doc exit criterion #7: "Self-host migration tooling published per SPEC-27 §7". SPEC-27 §7 names three operator commands: `pnpm pryzm install` (S67), `pnpm pryzm upgrade --to=N`, `pnpm pryzm rollback --to=N`.

S70 implements `upgrade` + `rollback` (and re-exposes `install` as a thin shell over S67's `install.sh`) inside the existing `@pryzm/cli` workspace package, **not** a new `@pryzm/self-host-cli` package. Reasoning:

- `@pryzm/cli` already ships pack/unpack subcommands; adding three subcommands keeps the operator surface as one binary (`pryzm-cli`).
- A separate package would duplicate the `tsx`-based dispatcher + version-string parser the existing cli already has.
- Per SPEC-27 §7.3, rollback is **best-effort** and only one minor back; the version-string + guard logic is small enough (≈80 LOC) to live inside `apps/cli/src/commands/`.

Tests at `apps/cli/__tests__/migration-commands.test.ts` cover dispatch + version-validation + one-minor-guard + exit codes (8 cases).

### B.5 — PDF-to-BIM ships under "preview" label per ADR-029 Part E gate

Phase-doc exit criterion #8: "PDF-to-BIM public preview launched (gating decision recorded)". ADR-029 Part E sets the accuracy bar:

- Page classification ≥ 90% top-1.
- Scale recognition ≥ 95% within 5% of true scale.
- Wall extraction precision ≥ 0.85, recall ≥ 0.75.
- Door / window precision ≥ 0.80.

ADR-029 Part E §3: "If any miss, the feature ships behind a 'PDF-to-BIM (preview)' label and the marketing positioning reflects it."

The S70 D8 gating decision (recorded in `docs/03_PRYZM3/archive/superseded-audits/PHASE-3D-S70-PDF-PREVIEW-GATE-DECISION-2026-04-28.md`): **ship under "preview" label**. Reasoning:

- The SPEC-45 fixture corpus (≥ 50 real PDF sets) has not yet been measured in this development environment; the Phase 3 audit (PHASE-3-CODE-VS-SPEC-AUDIT-2026-04-28.md) recorded the corpus collection as still in progress.
- Honest deferral discipline: shipping under the full label requires fixture-corpus-measured numbers; shipping under preview requires only the *gating mechanism* be in place, which it now is.

The gate mechanism lands at `apps/ai-worker/src/pdf-to-bim/preview-gate.ts`:

- Pure function `evaluatePreviewGate(metrics: AccuracyMetrics): 'preview' | 'full'` — applies the five Part E thresholds and returns the label.
- Constant `PDF_TO_BIM_RELEASE_LABEL` — set to `'preview'` until the corpus measurement at S72 D5 GA tag flips it to `'full'` (or holds at preview if the bar is missed).
- Empty / missing metrics default to `'preview'` (safe default — never auto-promote).

12 vitest cases at `apps/ai-worker/__tests__/pdf-to-bim/preview-gate.test.ts` cover each threshold pass/fail boundary + all-pass → 'full' + any-fail → 'preview' + empty → 'preview'.

### B.6 — Self-host BYO-key safety cap wired in CostMeter, not in AnthropicRelay

Phase-doc exit criterion #9: "Self-host BYO-key safety cap enforced per SPEC-28 §11". SPEC-28 §2 row 5: "Self-host (BYO key) — $25 default safety cap (configurable)".

S70 wires the cap inside `packages/ai-cost/src/CostMeter.ts` via two new `CostMeterOptions` fields:

- `selfHostMode: boolean` — defaults to `false`. When `true`, `perCallCeilingUsd` resolves to `selfHostPerCallCapUsd` (overriding the default $0.18 SaaS ceiling).
- `selfHostPerCallCapUsd: number` — defaults to `25` per SPEC-28 §2.

`packages/ai-host/src/AiHost.impl.ts` reads `process.env.PRYZM_SELFHOST` (boolean) + `process.env.PRYZM_SELFHOST_PER_CALL_CAP_USD` (number) and passes them through when constructing the `CostMeter`.

**Why CostMeter not AnthropicRelay**: the relay is a thin HTTP shim; the budget gate is centralised in the meter (per SPEC-28 §6 algorithm). Putting the cap in two places risks one-side-only enforcement; one place keeps the invariant verifiable. The new reason-discriminant `Per-call ceiling exceeded` path already exists at line 324 of `CostMeter.ts` — the cap simply changes the ceiling, not the rejection logic.

6 vitest cases at `packages/ai-cost/__tests__/selfHostCap.test.ts` cover (a) default $25 cap, (b) configurable cap, (c) cap rejection fires `onLimitExceeded`, (d) SaaS mode unchanged when flag absent, (e) cap applies even when monthly budget infinite, (f) cap does NOT apply when `selfHostMode=false`.

### B.7 — Legacy src/lifecycle/ deleted in full; sunset banner re-homed to apps/editor adjacent

Phase-doc exit criterion #10: "Legacy `src/lifecycle/` deleted per SPEC-27 §4.3 + ADR-030 Part D". SPEC-27 §4.3 row "S70 — `src/lifecycle/` either ported to `plugins/lifecycle/` or deleted (per ADR-030)" + ADR-030 Part D row "S70 — legacy `src/lifecycle/` deleted entirely".

The folder contains 4 files (1255 LOC total):

| File | LOC | Disposition |
|---|---|---|
| `LifecycleStateManager.ts` | 193 | DELETE — replaced by event-based project-open / project-close per ADR-030 §A row 3 |
| `MaintenanceRecord.ts` | 160 | DELETE — replaced by per-family handlers in plugins/* per ADR-030 §A row 2 |
| `PostOccupancyPanel.ts` | 744 | DELETE — surface lives in `plugins/lifecycle/` (deferred) per ADR-030 §B; the bare Panel UI module is dead-code today |
| `Pryzm1SunsetBanner.ts` | 158 | RELOCATE — moved to `apps/editor/src/sunset/Pryzm1SunsetBanner.ts` (banner is sunset UX, NOT the element-lifecycle subsystem ADR-030 governs) |

3 importer-files patched:

- `src/main.ts` line 30 — import path: `./lifecycle/Pryzm1SunsetBanner` → `./sunset/Pryzm1SunsetBanner` (relative to src/main.ts; the new home is symlinked into the legacy boot path so the dynamic-import string doesn't change at runtime — see implementation note below).
- `src/ui/dataworkbench/DataWorkbench.ts` — drop the `PostOccupancyPanel` import + the `'lifecycle'` panel registration at line 432; replace with one-line console.warn pointing to the new home (per ADR-030 §A: "post-occupancy lives in `plugins/lifecycle/` when ported").
- `src/engine/subsystems/initTools.ts` — drop the `lifecycleStateManager` + `maintenanceRecordStore` imports (lines 93-94) + their two `.clear()` call sites (lines 878-879). These were `?pryzm1=1`-only paths.
- `src/engine/subsystems/initDataPlatform.ts` — drop the imports (lines 45-46) + the two `(window as any).*` assignments (lines 328-329) + the console.log at line 330.

**Why relocate the sunset banner instead of delete**: the banner is unrelated to ADR-030's scope (which governs element-lifecycle handlers). It is the customer-facing 90-day-window UX per SPEC-27 §3.2 and remains live until the PRYZM 1 sunset window closes (S61+90 days). Deleting it would break the sunset UX contract.

A guard test at `tests/s70-lifecycle-deletion/` (new workspace package) asserts:

1. No `.ts` file exists under `src/lifecycle/`.
2. No module repo-wide imports from `src/lifecycle/` (regex check over `apps/`, `packages/`, `plugins/`, `src/`).

The guard runs as the `s70-lifecycle-deletion-guard` workflow.

**Implementation note (sunset-banner re-home)**: the dynamic-import string in `src/main.ts` is updated to `./sunset/Pryzm1SunsetBanner`. We do NOT symlink — the import string changes one line and the file lives at one true location. Symlinks are avoided per repo discipline (Windows compat).

---

## C. Companion documents (S70 D-day-actionable artefacts)

| File | Day | Purpose |
|---|---|---|
| `docs/architecture/adr/0052-…` (this file) | (gate) | the seven posture decisions |
| `tests/browser-matrix/` workspace | D1+D5 | 5-project Playwright matrix + smoke + a11y + visual-diff |
| `.github/workflows/browser-matrix.yml` | D1 | CI wiring |
| `packages/wcag-audit/` | D6 | pure axe-core wrapper + critical-path declarations |
| `docs/accessibility/wcag-2.2-aa-audit-2026-04-28.md` | D6 | formal audit document |
| `packages/ui/src/a11y/` + `index.html` skip-link | D7 | concrete remediations |
| `apps/cli/src/commands/{install,upgrade,rollback}.ts` | D8 | self-host migration tooling per SPEC-27 §7 |
| `pryzm-selfhost/{RELEASE-NOTES,version.json,scripts/publish-prep.sh}` | D8 | publish manifest |
| `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` + audit doc | D8 | PDF preview gate + decision record |
| `packages/ai-cost/src/CostMeter.ts` selfHostMode + tests | D8 | BYO-key cap |
| `apps/editor/src/sunset/Pryzm1SunsetBanner.ts` (relocated) | D8 | sunset UX preserved |
| `tests/s70-lifecycle-deletion/` | D8 | deletion guard |
| `docs/03_PRYZM3/archive/superseded-audits/PHASE-3D-S70-PDF-PREVIEW-GATE-DECISION-…md` | D8 | gate decision of record |

---

## D. Honest deferrals (operator-side)

These items are **not** closed by this ADR; they are written down so future audits don't double-count.

| Item | Day | Why deferred | Closure path |
|---|---|---|---|
| Firefox-runtime fixes | D2 | needs real Firefox observation; CI matrix is the surface for catching them, but the matrix runs on operator-side runners with full browser binaries | first ghcr.io-published image build will surface FF issues; remediations land as patch ADRs |
| Safari-runtime fixes (WebGPU detection + WebGL2 fallback) | D3 | needs real Safari/WebKit observation; @react-three/drei has known WebGPU detection issues on Safari 18.4 | same as D2 |
| Edge-specific confirmation | D4 | mostly Chromium proxy; matrix project covers the smoke surface | same as D2 |
| Buffer | D10 | the founder-solo + Replit Agent execution model has no notion of buffer days | next sprint absorbs slip |
| ghcr.io image push (`docker compose build --push`) | D8 | no ghcr.io credentials in dev container; manifest + dry-run script ship today | operator runs `pryzm-selfhost/scripts/publish-prep.sh` with `GHCR_PAT` set |
| Fresh-VM tested on Ubuntu / Debian / RHEL / Rocky | (pre-S70) | inherited from S67 D6 deferral | tracked by S67 audit |

---

## E. K-gates touched

- **K3D-C** (= K3-G): "If at S70 (M35–M36) any browser fails the full test suite, halt GA marketing." Status: **smoke surface green on chromium today; the matrix wiring lands so the per-browser pass/fail is observable from this commit forward.** No browser is failing today because no browser other than chromium has been observed; the gate flips meaningful at the first operator CI run.
- **K3D-D**: "If at S70 PDF-to-BIM accuracy bar (per ADR-029 Part E) is not met, defer public preview to post-GA; ship under 'preview' or full label per ADR-029 Part E gate." Status: **ship under 'preview' label per B.5; the gate mechanism is wired so the S72 D5 GA tag can flip to 'full' if the corpus measurement clears the bar.**

---

## F. Cross-references

- ADR-029 Part E (PDF-to-BIM accuracy bar — feeds B.5).
- ADR-030 Part D (lifecycle deletion timing — drives B.7).
- SPEC-15 §7 (self-host topology — drives B.3).
- SPEC-27 §4.3 (codebase deletion gates — drives B.7) + SPEC-27 §7 (self-host migration tooling — drives B.4).
- SPEC-28 §2 row 5 + §11 (BYO-key cap — drives B.6).
- ADR-0048 (S67 docker-compose 6-service split — referenced by B.3).
- ADR-0050 (S68 security posture §B.2 names "S70 D6 nonce migration" — TODO not closed by this ADR; tracked as open carry).
