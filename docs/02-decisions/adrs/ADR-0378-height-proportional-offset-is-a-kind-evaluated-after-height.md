# ADR-0378 — `height-proportional-offset` is a GeometricRule kind, evaluated POST-height-resolution; an unresolved H refuses, never the floor

**Status:** ACCEPTED · **Date:** 2026-09-02 · **Lane:** S1 (schema seats), per the
envelope-architecture audit (lane A §2 #3, matrix row "Abstandsflächen") and the validated matrix.
§S1-HPO.

## Context

Three shipped-corpus ordinances state a FORMULA over the building's own height, not a distance:
DE BauO NRW 2018 §6 Abstandsflächen (0,4·H, min 3 m), PT Porto PDM Art. 30.º n.º 1 d) afastamento
(≥ H/2, min 3 m, above the ground floor), ES Madrid PGOUM-97 NZ5 (front separation to the street
axis proportional to height). `setback` cannot carry them: a scalar cannot encode a function
(ADR-0271, one rung up), and transcribing the FLOOR as the setback OVERSTATES the envelope
everywhere factor × H exceeds it — the one forbidden direction (C58 §1.4).

## Decision

1. **`HeightProportionalOffsetRuleSchema`** joins the `GeometricRuleSchema` union (append-only,
   eighth-and-seventh members with ADR-0379): `heightFactor` (strictly positive), `minOffset_m`
   (non-negative), `direction: 'into-parcel'`, `appliesTo: 'front' | 'all-plot-boundaries'`,
   `measuredFrom: 'plot-boundary' | 'street-axis'`, `appliesToStoreys: 'all' |
   'above-ground-floor'`, and a REQUIRED `heightDatum` (ADR-0377 — seat 1 wired into seat 2).
   Refusal arms at parse: `street-axis` on a non-front boundary rejects (no street axis exists
   there); a datum whose registry row says `comparableToRelativeHeight: false` rejects unless it
   is `unknown` (factor × altitude is not a stated quantity — the E8 DE class stays flagged,
   never multiplied). `{ kind: 'unknown' }` parses: DE §6's H-measurement semantics are pending
   their primary read, and honesty about that is data.
2. **Evaluation order is enforced BY TYPE, not by prose.**
   `evaluateHeightProportionalOffset(rule, heightResolution)` consumes the existing
   `EnvelopeSolidHeightCapVerdict` (evaluateDeclarative.ts) — a value that exists only AFTER the
   declarative pipeline resolved the governing height — so "post-height-resolution" cannot be
   skipped and no rival height-resolution shape is minted. At a resolved H the DE inclined plane
   collapses to the closed-form pointwise offset `max(factor·H, min)` (lane B's reading);
   combining co-applicable planes stays the kernel's pointwise-min job downstream.
3. **The refusal is load-bearing.** H unresolved → refuse `height-unresolved` (the floor alone is
   NEVER substituted — a too-small offset overstates); rule datum `unknown` → refuse
   `height-datum-unresolved`; degenerate H (0/NaN) → refuse `height-invalid`.
4. **Registry row:** `solveSeat: 'declarative-evaluator'`, `footprintShaping: false`,
   `requiresBlockRing: false` (`GEOMETRIC_RULE_KIND_REGISTRY`, compile-closed over the union).

## Consequences

- The engine's geometric path never attempts this kind; a zone carrying it still flags
  all-unknown setbacks as a study upper bound (the §NEVER-OVERSTATE predicate now reads the
  registry's `footprintShaping` flag — one fact, one home, C84 EI-9).
- Falsified 2026-09-02 (final tree): registry row deleted → TS2741 naming the kind; refusal
  replaced by floor degradation → the ⭐ test RED (`expected true to be false`); absolute-datum
  guard severed → the parse test RED; all restores byte-identical (sha256).
