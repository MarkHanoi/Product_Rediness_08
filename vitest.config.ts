// Root-level Vitest config — covers src/ui/**/__tests__/ panel + toolbar binding tests.
// Added in wave-6-b-d1 (Wave 6 Phase B real binding).
// Extended in wave-6-b-d2 + wave-6-c-d1 to include toolbar tests.
//
// These files are excluded from the root tsconfig.json so they do not
// interfere with the Vite build step.  Vitest resolves them independently
// using the same TypeScript compiler options via vite-plugin-tsconfig.
//
// Environment: happy-dom (provides DOM APIs for panel show/hide testing
// without a real browser; lighter than jsdom).

import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // §L-388 — the root vite build (vite.config.ts) defines these `@app/*` source
  // aliases; the standalone vitest config must mirror them or any spec whose load
  // graph reaches an `@app/...` import (e.g. PropertyPanelAnnotations →
  // @app/ui/documentation/driveDimension) fails to resolve. Kept in lock-step with
  // vite.config.ts `resolve.alias`.
  resolve: {
    alias: {
      '@app/ui': resolve('./apps/editor/src/ui'),
      '@app/engine': resolve('./apps/editor/src/engine'),
      '@app/rendering': resolve('./apps/editor/src/rendering'),
    },
  },
  test: {
    globals: false,
    environment: 'happy-dom',
    include: [
      // §L-851 — THE TWO FOUNDING PATTERNS, REPOINTED. They read
      // `src/ui/__tests__/**/*.spec.ts` + `src/ui/toolbar/__tests__/**/*.spec.ts`,
      // which are REPO-ROOT-relative — and repo-root `src/ui/` DOES NOT EXIST; the
      // tree moved to `apps/editor/` and these were never followed. So the two
      // patterns this config was WRITTEN AROUND selected nothing, and 72 spec files
      // / 1,433 test cases had never executed in CI. That is the L-849 shape at the
      // largest scale in this repo: NEVER RAN and PASSED printed the same value.
      //
      // MEASURED IN ISOLATION BEFORE ENABLING (the L-849 protocol, non-negotiable):
      // all 72 files run under a throwaway config that mirrored this one exactly
      // (happy-dom, globals:false, the same three @app/* aliases) — 72/72 GREEN,
      // 1,433 passed / 0 failed / 0 skipped. Nothing was quarantined because
      // nothing measured red. Widening these two patterns therefore asserts 1,433
      // previously-unasserted cases and breaks nothing.
      'apps/editor/src/ui/__tests__/**/*.spec.ts',
      'apps/editor/src/ui/toolbar/__tests__/**/*.spec.ts',
      // §FIX-DOOR-SLAB-HOST (L-56): plan-tool host-resolution behavioural specs.
      'apps/editor/src/engine/views/plantools/__tests__/**/*.spec.ts',
      // §FEAT-PLAN-VIEW-GIS (L-104): pure GIS tile-geometry specs.
      'apps/editor/src/ui/site/overlay/__tests__/**/*.spec.ts',
      // §FIX-POSTFX-WEBGPU (L-111): backend-aware post-FX routing specs.
      'apps/editor/src/engine/__tests__/**/*.spec.ts',
      // §FIX-AUTODIM-RENDER-SINK (L-138): DimensionString → 'linear-dim' adapter specs.
      'apps/editor/src/ui/documentation/__tests__/**/*.spec.ts',
      // §FEAT-SWAP-LOADING-OVERLAY (L-141): renderer live-swap loading overlay specs.
      'apps/editor/src/ui/overlays/__tests__/**/*.spec.ts',
      // §OPENING-SHOWROOM-PREVIEW (L-7720): the PURE half of the element preview —
      // the subject builders. They are what stops the showroom inventing its own
      // dimensions instead of calling `resolve{Window,Door}Dimensions` (L-127), and
      // what pins that every drawn part NAMES a master material (C100 §2.1).
      'apps/editor/src/ui/element-preview/__tests__/**/*.spec.ts',
      // §L-847: the shipped F3 Data surface. Differentiating specs — they fail
      // if WorkspaceController's data mode reverts to benching DataWorkbench
      // (setMode('hidden')) or DataCommandCenter re-claims the mode event,
      // which is exactly the regression that made the Hierarchy tree unreachable.
      'apps/editor/src/ui/dataworkbench/__tests__/**/*.spec.ts',
      // §CTX-QUERY-PANEL (L-592) / §CTX-USE-COLOUR (L-599) / §FACADE-STUDY-SUBJECT (L-596):
      // pure 3D-Site specs — use classification, height/id provenance labelling, and the
      // façade study's subject resolution + refusals.
      'apps/editor/src/ui/geospatial/__tests__/**/*.spec.ts',
      // §PARCEL-SELECT (L-613): per-jurisdiction parcel-provider parse + footprint-pick specs
      // (captured fixtures, never live network; never-throws pinned).
      'apps/editor/src/ui/site/parcel/__tests__/**/*.spec.ts',
      // §ENVELOPE-CONFIDENCE-COLOUR (L-608) / §L-619 / C58 §1.14: the honest-presentation decision
      // for the buildable-envelope flat render (confident violet vs provisional grey vs upper-bound
      // maximum-extent) — a thin adapter over the shared L2 completeness classifier.
      'apps/editor/src/ui/site/__tests__/**/*.spec.ts',
      // §C78-U-INV-4: the ELEMENTS card's category counts. `getCategoryElements`
      // returned [] for "no walls", "the wall store is not on window yet" and
      // "the read threw" alike, and the card rendered that as the count — so an
      // uninitialised store asserted "0 walls in this project" to an architect
      // checking their model. These pin that the three cases are now distinct.
      'apps/editor/src/ui/ViewBrowser/panels/unified-browser/__tests__/**/*.spec.ts',
      // §UI-DENSITY-SCALE: the chrome density transform. Pure string→string, but it
      // rewrites every length in the ONE stylesheet the editor renders from, so its
      // failure modes are repo-wide and silent — moved breakpoints, desynced canvas
      // boxes, controls dropping under the WCAG 2.2 AA 24px target floor.
      'apps/editor/src/ui/styles/__tests__/**/*.spec.ts',
      // §FIX-STAIR-PROPS-DISPLAY-DEAF / §FIX-STAIR-PANEL-* : the stair property-panel
      // REACHABILITY matrix — every editable row must resolve its current value, offer
      // only schema-valid options, respect STAIR_CONSTRAINTS, and reach a geometry
      // rebuild. A control that renders and does nothing — or that lies about its
      // current value — is the defect class these pin.
      'apps/editor/src/ui/property-panel/__tests__/**/*.spec.ts',
      // §ADR-0313 NL layer: zero-token chat bridge behavioural specs — proves the
      // LLM path (aiService.query) is NEVER called for locally resolvable chat,
      // that destructive asks gate on the Confirm/Cancel card, and that the miss
      // seam to the LLM stays open.
      'apps/editor/src/ui/ai/__tests__/**/*.spec.ts',
      // §WORKSPACE-MODE-REGISTRY (L-3000 · ADR-0343 §D.1): the workspace-mode
      // table and the assertion that no consumer restates the mode ids. The ADR
      // made the registry conversion a BINDING PRECONDITION of the fourth mode —
      // so a guard that lets the list silently re-fork would make the precondition
      // decorative.
      'apps/editor/src/ui/platform/__tests__/**/*.spec.ts',
      // §ANALYSIS-SURFACE (L-3001..L-3010 · ADR-0343): the Analysis read model's
      // honesty envelope — empty / zero / not-computed / unreachable are FOUR
      // states, and a widget that renders one as another is the defect this
      // surface exists to not commit.
      'apps/editor/src/ui/analysis/__tests__/**/*.spec.ts',
      // §LINK-UX-PROOF (L-3156/L-3158 · ADR-0346): the LINKED MODEL read model —
      // the C83 placement presentation and the per-link row. A linked model that
      // lands quietly in the wrong place renders, measures and lies, so the three
      // verdicts must reach the user as three visibly different things and each
      // refusal must carry its escape hatch. These pin that, plus the honesty
      // boundaries the panel is built on: null never collapsing to 0, and
      // hidden / empty / failed / resolving never rendering as one another.
      //
      // ⚠ ADDED IN LOCK-STEP WITH THE FILES, not after — §L-851 is the record of
      // 72 spec files and 1 433 cases that sat unselected because a pattern was
      // written for a tree that had moved. A suite this config does not select
      // does not exist, and "never ran" and "passed" print the same value.
      'apps/editor/src/ui/links/__tests__/**/*.spec.ts',
      // ⭐ C108 — added with §FACADE-PANEL-REACHABILITY. The include list is an
      // ALLOWLIST: a spec outside it is not skipped, it is never discovered, and
      // `vitest run <path>` prints "No test files found" rather than failing. That
      // is the same authored-but-unreachable shape as the button this suite guards.
      'apps/editor/src/ui/facade/__tests__/**/*.spec.ts',
      // §L-11130 — the generator's pure helpers (shell arcs) live beside the executor.
      'apps/editor/src/ui/residential-building/__tests__/**/*.spec.ts',
      // ⭐ §COMPONENT-AUTHORING-UI (Phase 4F · ADR-0376 D2 · C86 §10.1 PR-9) — the component
      // authoring surface: the profile-on-a-reference-plane adapter, the constraint-glyph
      // honesty table (C74 §4.6.3) and the parameter table (C110 §2.2). ⚠ ADDED IN THE SAME
      // COMMIT AS THE FILES, never after — §L-851 is the record of 72 spec files and 1,433
      // cases that sat unselected because this list is an ALLOWLIST: a spec outside it is not
      // skipped, it is NEVER DISCOVERED, and `vitest run <path>` prints "No test files found"
      // rather than failing. "Never ran" and "passed" print the same value.
      'apps/editor/src/ui/component/__tests__/**/*.spec.ts',
      // ⭐ §U3-DEFINITION-WORKSPACE (UIUX-PLAN §U3 · ADR-0376 D4/D5 · C110) — the
      // definition-editor workspace: honest-state arms (unloaded definition refuses
      // by name; severed op gateway refuses loudly) + the source-level assertion that
      // the Components browser carries the "Edit definition…" entry. ⚠ ADDED IN THE
      // SAME COMMIT AS THE FILES — this list is an ALLOWLIST (§L-851): a spec outside
      // it is never discovered, and "never ran" and "passed" print the same value.
      'apps/editor/src/ui/component-editor-workspace/__tests__/**/*.spec.ts',
      // §XSS-SINK-SCAN (L-407): the GA-gate HTML-sink classifier + the repo-wide
      // ratchet assertion. Pure Node (fs + string analysis); lives here because
      // `test:root` is the only suite CI runs over non-package tooling.
      'tools/ga-gate/__tests__/**/*.spec.ts',
      // §GEOJSONSEQ-READ (L-658): the bake's footprint reader — RS (RFC 8142) tolerance
      // and the honest empty-vs-unparseable split that a silent join failure hid.
      'tools/context-bake/__tests__/**/*.spec.ts',
      // §RPUC-SUPERSESSION (L-676): the Barcelona supersession screens (CLOSURE-REGISTER row 9).
      // Pure string classifiers, no network — pinned because a screen that quietly stopped failing
      // OPEN would shrink the reading list and read as progress.
      'tools/rpuc-supersession/__tests__/**/*.spec.ts',
      // §FIX-SPEC-SEMANTIC-DEAD-GUARD (W2-3): the SpeculativeEngine semantic-read
      // REFUSAL specs. Hosted here rather than in a package-local vitest run because
      // @pryzm/speculative-engine declares no test tooling of its own, and adding a
      // devDependency to it would desync pnpm-lock.yaml for every other agent sharing
      // this tree. The specs need a DOM `window` — which this config already provides
      // via happy-dom — because the engine reads `window.semanticGraphManager`.
      'packages/speculative-engine/__tests__/**/*.spec.ts',
    ],
    testTimeout: 10_000,
    // Wave A18-T27: coverage reporting via @vitest/coverage-v8 (c8/Istanbul).
    // Run: pnpm vitest run --coverage
    // Report: coverage/ directory + stdout summary.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        // §L-851 — DEAD, and deliberately left dead rather than silently repointed.
        // This is the SAME stale `src/ui/` root as the two include patterns above:
        // repo-root `src/ui/` does not exist, so this line contributes no files and
        // the thresholds below are measured over `packages/*/src/**` alone.
        // Repointing it at `apps/editor/src/ui/**` would move the coverage
        // DENOMINATOR under a 60% threshold gate — a different change, with a
        // different blast radius, that this lane did not measure. Flagged, not
        // guessed at. (Coverage is opt-in via `--coverage`; CI's `test:root` is
        // plain `vitest run`, so no CI job reads this today.)
        'src/ui/**/*.ts',
        'packages/*/src/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
