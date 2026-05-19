# ADR-0044 — S65 Formula Library Extraction (ADR-027 Realization)

* **Status**: Accepted (sprint-scoped, S65, 2026-04-28)
* **Related**: ADR-027 (formula library), ADR-0041 (api-gateway), ADR-0032 (schedule-formula-DSL)

## Context

ADR-027 mandates that the schedule-formula DSL (ADR-0032) and the parametric-element formulas converge on a single shared catalog so plugins, schedules, and the public API all see the same set of built-ins. At S65 the catalog must be extractable into a standalone, frozen-at-load package consumable by `apps/api-gateway` (read-only listing) and the editor (eval).

## Decisions

### A. Standalone `packages/formula-library` workspace package
Pure TypeScript, zero runtime deps. Exports: `createFormulaCatalog()`, `defaultFormulaCatalog()` (frozen, prebuilt, 12 built-ins), `invokeFormula(id, args)`, `FormulaDescriptor`, `FormulaSignature`, `ValidationError`.

### B. 12 built-in formulas with pinned signatures
`sum`, `avg`, `min`, `max`, `count` (array→number); `distance`, `area`, `perimeter` (array→number, geometry); `ratio`, `clamp`, `lerp` (number args→number); `round` (number, precision→number). Every signature is declared with explicit `params[].type` (`number | string | array<number>`) and `returnType`. The 12-formula list is the ADR-027 closure baseline; expansion goes through ADR review per ADR-0044 §D below.

### C. Catalog freeze semantics
`createFormulaCatalog().register(descriptor)` is allowed before `freeze()`; after `freeze()` it throws. `defaultFormulaCatalog()` returns a catalog that is *already frozen* — guarantees the public API surface is immutable per request lifecycle.

### D. Catalog growth requires ADR
New built-ins require an ADR amendment and a corresponding bump of the OpenAPI YAML SHA-256 pin (the descriptor list is exposed via `GET /v1/formulas`). This prevents accidental scope-creep into the public surface.

### E. Validation is loud-fail (throws `ValidationError`)
Argument arity, type, and finiteness checks raise `ValidationError` with `{ formulaId, argIndex, expected, actual }`. Public API maps this to 400 + `{ error: 'invalid_arguments', error_description }`. No silent coercion.

## Consequences

* < 400 LoC source, 35 tests at D1
* Editor + plugins can `import { defaultFormulaCatalog }` directly; api-gateway just lists descriptors
* Frozen-at-load semantics matches the OpenAPI byte-pin pattern — accidental mutation surfaces immediately

## Deferrals

| Item | Owner | Reason |
|---|---|---|
| Plugin-contributed formulas | S66 | needs sandbox approval flow |
| Async/IO formulas (SQL, HTTP) | S68 | sandbox model + cost gating |
| Public `POST /v1/formulas/:id/invoke` | not planned | invocation lives in editor / plugin sandbox per ADR-027 §C |
