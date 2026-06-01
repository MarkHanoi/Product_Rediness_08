# PHASE 3C — S61 Closure Audit (2026-04-28)

> Sprint S61 — Composition Root Deletion + Sunset Migration Tool
> Audit reference for the PROCESS-TRACKER.md row flip from `[~]` → `[✓]`.
> Authority: SPEC-27 §3.2/§4.1-4.4 + `docs/architecture/adr/0031-s61-staged-legacy-deletion.md`.

## §1 Sprint goal vs reality

**Spec goal** (per phase-doc-2 §S61): "Promote `apps/editor/src/main.ts` as
the new composition root; ship the sunset migration tool; open the 90-day
sunset window."

**Reality at close**: composition root + migration tool + 90-day window all
landed at D1; the engine-router infrastructure for D2-D4 callsite rewriting
landed at D2-D4; the bundle-size verifier for D6 landed; the D5 default-flip
+ D6 visual-diff + D7-D9 production canary remain DEFERRED per ADR-0031
gate-state — see §3 for the gate accounting.

## §2 Deliverables landed (D2-D6 closure)

| D | Deliverable | Path | Status |
|---|---|---|---|
| D1 | Composition root file | `apps/editor/src/main.ts` | ✓ landed (S61 D1 commit) |
| D1 | Sunset migration CLI | `tools/pryzm1-sunset/` | ✓ landed (7/7 tests green) |
| D1 | 90-day sunset countdown | `apps/editor/migrations/sunset-pryzm1.md` front-matter | ✓ landed |
| D1 | Importer scanner | `scripts/scan-engine-bootstrap-importers.mjs` | ✓ landed (zero static importers reported) |
| D1 | Sunset-banner module | `src/lifecycle/Pryzm1SunsetBanner.ts` | ✓ landed (idempotent, banner / modal / blocking modes) |
| **D2-D4** | **Engine-router selector** | **`packages/engine-router/`** | **✓ landed (this audit)** |
| **D2-D4** | **`src/main.ts:215` callsite rewrite** | **`src/main.ts`** | **✓ landed (this audit) — `loadEngine()` consumes the router** |
| **D6** | **Bundle-size verifier** | **`scripts/verify-bundle-size.mjs`** | **✓ landed (this audit) — 1.8 MB gzip budget per ADR-0031 §D6** |

## §3 Deliverables explicitly DEFERRED (gate-pending)

Per ADR-0031 §Decision and §Consequences, three D-day blocks cannot close
inside one sprint and stay deferred:

### §3.1 D5 default-flip — DEFERRED until parity gate (gate 1) closes

ADR-0031 §Decision D5: "default boot flips: `?pryzm1=1` becomes the
*deprecated* opt-in route; un-flagged URLs go to `apps/editor/src/main.ts`."

**Blocking gate**: SPEC-27 §4.2 gate 1 ("Replacement code green-tested
(CI + parity fixtures)"). Per ADR-0031 §Context: "PRYZM 2 visual + e2e
parity is not yet measured against the full PRYZM 1 surface (sheet
editor, view properties panel, schedule panel, IFC export auditing,
fragment-based exports, Cesium geospatial overlay, etc.). Parity is the
joint subject of S55–S60 + S61 D6."

**Mitigation**: the engine-router landed in this sprint already supports
the post-flip polarity (`sunsetMode: 'flipped'`). The polarity transition
is a one-line code change in `src/main.ts` ("opt-in-only" →
"default-banner") gated on:

1. The 30-case visual-diff fixture passing < 2 px (ADR-0030 reconciliation contract).
2. The PRYZM 2 e2e parity suite passing on the full PRYZM 1 surface.

Both deliverables sit outside S61's scope (they are S55–S60 carryover +
production-infra dependent). When both close, the polarity flip is a
single-line PR; the engine-router does not need re-architecting.

### §3.2 D6 visual-diff regression — DEFERRED until fixture infra lands

ADR-0031 §Decision D6: "visual + e2e regression suite confirms
`bundle.size.initial-app < 1.8 MB gzip` AND `visual-diff < 2 px` on the
30-case fixture."

**This sprint**: bundle-size half landed (`scripts/verify-bundle-size.mjs`).
Visual-diff half is gated on the production fixture set (ADR-0030 reconciliation
contract — 30 fixtures live in `apps/bench/visual-fixtures/`, but the diff
runner needs Playwright + a screenshot baseline storage layer that is not
in the dev-environment scope).

**Status of the bundle-size half**: the verifier is wired; it is run
informationally (not gated in CI) until D5 closes — per ADR-0031
§Negative-mitigated, the legacy chunk is still in the default user's
bundle until the polarity flips, so the budget is informational today
and gating from D5 onward.

### §3.3 D7-D9 production canary — DEFERRED to production rollout

ADR-0031 §Decision D7-D9: "5% canary cohort routed to the new default;
OTel kill switches K3C-A/B/C monitored; full rollout on D9."

**Blocking gate**: production analytics infrastructure (5% cohort
selection, OTel sink for K3C-A boot-impact / K3C-B sandbox-escape /
K3C-C API-p95 metrics). Not in dev-environment scope.

**Mitigation**: the kill-switch hooks are present in the engine-router
(`sunsetMode` parameter). The production-rollout playbook is the existing
`apps/editor/migrations/sunset-pryzm1.md` §5 (D0/D30/D60/D90 escalation
table). When production infra is ready, the rollout is a config change,
not a code change.

## §4 Tests + verification

```
packages/engine-router/__tests__/router.test.ts           NEW    18/18 cases green (vitest)
packages/plugin-sdk/__tests__/descriptor.test.ts          (S62)  44/44 cases green (regression check)
tools/pryzm1-sunset/__tests__/converter.test.ts           (D1)    7/7  cases green (regression check)
scripts/scan-engine-bootstrap-importers.mjs               (D1)   0 static importers reported
                                                                 1 dynamic importer (src/main.ts:215 — now via router)
```

App boots green via `Start application` workflow (port 5000); pre-existing
test workflows (pryzm-persistence 135/135, pryzm-vi-parity 82/82,
bcf-round-trip 57/57, ifc-import-tier2 18/18, ifc-export-tier1 16/16,
ifc-inspector 12/12, family-editor-quality-gates 10/10, rhino-import 4/4)
unaffected — engine-router is greenfield + has no consumers besides the one
callsite this audit rewires, so the regression surface is the
`src/main.ts:215` rewrite alone.

## §5 PROCESS-TRACKER row update

S61 row flips from `[~]` → `[✓]`. The closure annotation cross-references
this audit; deferred D-blocks point to the gate-state files (`apps/editor/migrations/sunset-pryzm1.md` for D5; `apps/bench/visual-fixtures/` for D6 visual-diff;
production-infra ticket for D7-D9 — tracked outside the architecture corpus).

## §6 Cross-references

- `docs/architecture/adr/0031-s61-staged-legacy-deletion.md` — ADR being honoured.
- `docs/00_NEW_ARCHITECTURE/specs/SPEC-27-MIGRATION-ROLLBACK.md` §3.2, §4.2-4.4.
- `docs/00_NEW_ARCHITECTURE/phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md` §S61.
- `docs/00_NEW_ARCHITECTURE/phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S61.
- `apps/editor/migrations/sunset-pryzm1.md` — gate-state + escalation calendar.
- `packages/engine-router/src/index.ts` — the D2-D4 selector landed by this audit.
- `scripts/verify-bundle-size.mjs` — the D6 bundle-half verifier landed by this audit.
