---
name: "[QUARANTINE] Mark a workflow / test suite as known-bad"
about: "File when a CI workflow or vitest suite goes persistently red and the fix is owned by another, identifiable wave / PR. Quarantine is honest reporting (don't pretend it's flaky, don't pretend it's green) — every incident must name a specific de-quarantine trigger."
title: "[QUARANTINE] <workflow-or-suite-name> until <trigger>"
labels: ["quarantine", "ci"]
assignees: []
---

> **Convention spec**: `docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §5` (task 4) — the directory layout (`<package>/__tests__/quarantined/`) and the `test:ci` / `test:quarantined` scripts. Every field below is **mandatory**.

## Quarantined on
<!-- ISO date, e.g. 2026-04-30 -->

## Quarantined by
<!-- Wave + task number that authorised the quarantine, e.g. "Wave 1 task 4 of 04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md" -->

## De-quarantine trigger
<!--
A specific, dated, falsifiable event. Examples:
- "D.4.2 PR merged (estimated S79-WIRE D-last)"
- "Wave 5 cast-deletion sprint closes (S82-WIRE D-last)"
- "rg '(window as any).visibilityRegistry' returns 0 hits in src/"
NOT acceptable: "we'll fix it next sprint", "when someone has time".
-->

## Owner
<!-- Specific person or named team that owns the de-quarantine PR -->

## Root cause (must cite log evidence — not theory)
<!--
Paste the actual failing log line(s) and the failing test name(s).
`tail -N` of the workflow log + the assertion that failed.
A theory of cause is fine to add AFTER the evidence, but evidence is required first.
The §10 entry of 2026-04-30 evening in 03-CURRENT-STATE.md is the discipline lesson:
the morning audit's "WorkspaceMountBridge leak" theory was unsupported by `rg` —
we don't repeat that mistake here.
-->

## What unblocks de-quarantine
<!--
Concretely: which file changes in which PR remove the failure.
Cite the path (e.g. packages/runtime-composer/src/buildPersistence.ts:34-67).
-->

## Verifier on de-quarantine (the exact shell to run)
```bash
# 1. Move the test back out of quarantine:
git mv <package>/__tests__/quarantined/<file>.test.ts \
       <package>/__tests__/<file>.test.ts

# 2. Re-run the green-path script:
pnpm --filter @pryzm/<package> test:ci

# 3. Confirm green:
echo "expected: Test Files <N> passed (<N>) / Tests <M> passed (<M>)"
```

## Escalation date
<!--
If this issue is still open past the wave-close named in `De-quarantine trigger`,
the §10 weekly delta log records it as an incident. Set the date here
(typically: trigger-wave close + 1 sprint).
-->

## Cross-references
- `docs/03_PRYZM3/03-CURRENT-STATE.md §7` — workflow status row will be updated to "🟡 quarantined" when this issue opens, back to "✅ green" when it closes.
- `docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §5` — convention.
- `docs/03_PRYZM3/01-VISION.md §8` rule 1 — edit canonical docs on discovery; do not write new audit files.
