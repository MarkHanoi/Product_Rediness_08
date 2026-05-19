# `@pryzm/test-ga-gate` — M36 GA Launch Gate

This workspace package codifies the machine-checkable subset of the
M36 GA exit criteria documented in
`docs/03_PRYZM3/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §3.

The gate is **honest by construction**: every invariant is either
- asserted by a vitest case in `__tests__/`, or
- recorded as a documented deferral with a sprint+day pointer in
  `docs/architecture/adr/0054-s72-m36-ga-launch-gate.md`.

## Test surfaces (one file per §3 slice)

| File                                        | §3 slice covered                              |
|---------------------------------------------|-----------------------------------------------|
| `__tests__/architectural-invariants.test.ts`| §3 Architectural — legacy dirs deleted; PRYZM 2 trees have 0 `(window as any)`; THREE imports confined to committers |
| `__tests__/perf-coverage.test.ts`           | §3 Performance — every NFT-target row landed or has documented deferral |
| `__tests__/quality-gates.test.ts`           | §3 Quality — WCAG audit / scans baseline / sandbox audit / RLS audit / OAuth2 review docs present |
| `__tests__/release-artefacts.test.ts`       | §3 Documentation — M36-GA.md / post-mortem / roadmap / blog post / release notes / sunset notice present |
| `__tests__/handoff-checklist.test.ts`       | §8 Phase 3D handoff — automatable subset of the 11-item checklist |
| `__tests__/ga-version-manifest.test.ts`     | §3 Functional — root + self-host version manifests agree on `2.0.0` |

## Run

```bash
cd tests/ga-gate
npx vitest run
```

Or via the consolidated test recipe in `replit.md` §PRYZM-2-PHASE-3D-S72.

## Honesty boundary

This package asserts **static contracts** over the repo. The dynamic
gate (LAUNCH on D7, first-24h monitoring, status-page provisioning,
≥100 paying users) is operator-side and recorded as carry-forwards in
ADR-0054 §G + the S72 audit §3 / §7.
