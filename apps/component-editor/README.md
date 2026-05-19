# @pryzm/component-editor — PRYZM Family Creator

The Family Creator is PRYZM 2's standalone SPA for authoring parametric
component families (the Revit-Family-Editor analogue). It produces
`.pryzm-family` artefacts that the main editor and the marketplace consume.

## Status (2026-04-28)

**S52 D1 — scaffold landed.** The previous `src/component-editor/` prototype
(1,723 LoC) has been removed in full; this app is the green-field rewrite
that replaces it. Today the app ships a splash, a sprint-roadmap panel, and
the architectural rails (vanilla TS, no THREE leakage, no rAF, no
`(window as any)`).

## Plan of record

The 8-sprint rewrite plan lives at:

```
docs/03_PRYZM3/reference/phases/PHASE-3/3B-FAMILY-CREATOR-REWRITE-PLAN.md
```

## Sprint roadmap

| Sprint | Outcome |
|---|---|
| S52 | Scaffold, real planegcs constraint solver, first 5 constraints, extrude |
| S53 | Sketch tools + sweep / loft / revolve + booleans |
| S54 | AI host bridge + tool registry + batch undo |
| S55 | Parameter table + expression DSL + IFC binding + `.pryzm-family` v1 |
| S56 | Main-editor integration (load family, place 200 instances, swap types) |
| S57 | Versioning + migration framework + performance hardening |
| S58 | Standalone SPA deploy + accessibility + end-to-end tests |
| S59 | Marketplace publish + Phase 3B exit |

## Architectural rules (enforced from S52 D2 onward)

- No React, Vue, or Svelte runtime. Vanilla TS only (rule from ADR-026).
- Only `*Committer.ts` files may import `three` (rule P2).
- One global `rafScheduler` from `@pryzm/frame-scheduler` (rule P3).
- Every state mutation through `@pryzm/command-bus` (rule P4).
- No `(window as any)` outside `src/app/{AppShell,hotkeys}.ts` (rule P6).
- 300-LoC ceiling per source file.
- First-paint chunk ≤ 180 KB gzip (`family-editor-bundle-budget` gate).

## Develop

```sh
npm --workspace=@pryzm/component-editor run dev       # Vite dev server
npm --workspace=@pryzm/component-editor run test      # Vitest
npm --workspace=@pryzm/component-editor run typecheck # tsc --noEmit
```
