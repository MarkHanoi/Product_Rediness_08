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
      'src/ui/__tests__/**/*.spec.ts',
      'src/ui/toolbar/__tests__/**/*.spec.ts',
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
      // §XSS-SINK-SCAN (L-407): the GA-gate HTML-sink classifier + the repo-wide
      // ratchet assertion. Pure Node (fs + string analysis); lives here because
      // `test:root` is the only suite CI runs over non-package tooling.
      'tools/ga-gate/__tests__/**/*.spec.ts',
      // §GEOJSONSEQ-READ (L-658): the bake's footprint reader — RS (RFC 8142) tolerance
      // and the honest empty-vs-unparseable split that a silent join failure hid.
      'tools/context-bake/__tests__/**/*.spec.ts',
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
