// eslint-plugin-pryzm — flat-config plugin barrel.
// Each rule is a plain object with `meta` + `create(context)` per the
// ESLint v9 rule API.  Rules are scaffolded in S01 and gain real
// assertions across S02–S08 per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md`.

import affectedStoresRequired from './rules/affected-stores-required.js';
import noThreeInKernel from './rules/no-three-in-kernel.js';
import noRaf from './rules/no-raf.js';
import noThreeOutsideCommitter from './rules/no-three-outside-committer.js';
import storeSingleChannel from './rules/pryzm-store-single-channel.js';
import noWindowAsAny from './rules/no-window-as-any.js';
import noSecondCanvas from './rules/no-second-canvas.js';
import noRuntimePackageImport from './rules/no-runtime-package-import.js';
import noLegacySrcImport from './rules/no-legacy-src-import.js';
import noEngineBootstrapShim from './rules/no-engine-bootstrap-shim.js';
import noL7DirectImport from './rules/no-l7-direct-import.js';
import noL7AllowlistGrow from './rules/no-l7-allowlist-grow.js';
import noL7BoundaryViolation from './rules/no-l7-boundary-violation.js';
import noDirectPryzmInPlugins from './rules/no-direct-pryzm-in-plugins.js';

const plugin = {
  meta: {
    name: 'eslint-plugin-pryzm',
    version: '0.1.0',
  },
  rules: {
    'affected-stores-required': affectedStoresRequired,
    'no-three-in-kernel': noThreeInKernel,
    'no-raf': noRaf,
    // Z.3 alias — chunk 26 §26.1 spells the rule `single-raf`. Same
    // implementation as `no-raf`; the alias keeps both names valid so
    // doc references stay live.
    'single-raf': noRaf,
    'no-three-outside-committer': noThreeOutsideCommitter,
    'store-single-channel': storeSingleChannel,
    // Phase A.7 (S73-WIRE) — `(window as any).<x>` reach detector.
    // WARN-only on src/ until Phase G.31 (S82-WIRE) empties the baseline
    // captured in `eslint-baseline-window-as-any.json`.
    'no-window-as-any': noWindowAsAny,
    // Z.3 (S77-WIRE D2) — block `document.createElement('canvas')`
    // outside `packages/renderer/`.  WARN until Phase H.3.
    'no-second-canvas': noSecondCanvas,
    // Z.4 (S77-WIRE D2) — block direct `@pryzm/runtime-composer` imports
    // from `src/ui/`. Panels must take the typed runtime via constructor
    // injection (Phase B contract). WARN until Phase H.4.
    'no-runtime-package-import': noRuntimePackageImport,
    // Z.4 (S77-WIRE D2) — block any workspace module from importing the
    // legacy `src/` tree. ERROR from Z.4 because no current cross-tree
    // imports exist (verified at scaffold time).
    'no-legacy-src-import': noLegacySrcImport,
    // D.4.5 (S81-WIRE) / S86-WIRE close — block new imports of
    // `src/engine/EngineBootstrap` after the shim lands. Both allowlists
    // are now empty after S86-WIRE (src/main.ts redirected to engineLauncher).
    // Boolean #5 (EngineBootstrap_LOC == 0) → ✅.
    // Use `import type { PryzmRuntime } from "@pryzm/runtime-composer"` instead.
    'no-engine-bootstrap-shim': noEngineBootstrapShim,
    // Wave 4 Track B PR 4.B.3 — L7 plugin boundary lint.
    // L7 plugins (`packages/plugin-*`) must only import from `@pryzm/sdk` (L6).
    // The 5 production plugins are in a transitional allowlist (WARN) until
    // Phase F ships `@pryzm/sdk`. All other `packages/plugin-*` files get ERROR.
    // Baseline: 0 current violations (all 5 production plugins are stubs).
    // Gate: `pnpm ga-gate --check boundary-lint-l7`.
    'no-l7-direct-import': noL7DirectImport,
    // Wave 4 Track B PR 4.B.3 — size-ratchet for the L7 transitional allowlist.
    // Prevents TRANSITIONAL_ALLOWLIST from growing beyond 5-entry baseline.
    'no-l7-allowlist-grow': noL7AllowlistGrow,
    // PR 4.B.3 (S81-WIRE Wave 4 Track B) — block L7 plugin packages from
    // importing L0–L5 runtime internals directly. Plugins must use the public
    // @pryzm/plugin-sdk host proxies. WARN-mode with a per-plugin size-ratchet
    // baseline at `.ga-gate/baselines/l7-boundary-violations.json`; gate is
    // `pnpm ga-gate --check boundary-lint-l7`. Wave 12 closed all violations
    // to 0; baseline updated to 0 for all 46 plugins.
    'no-l7-boundary-violation': noL7BoundaryViolation,
    // Wave-12 (S98-S100) ERROR-level enforcement. All 46 plugins are now L8-
    // compliant — they import ONLY from @pryzm/plugin-sdk. This rule blocks
    // any regression at ERROR level. Spec: 17-WAVES-9-12-SRC-MIGRATION.md §4.
    'no-direct-pryzm-in-plugins': noDirectPryzmInPlugins,
  },
};

export default plugin;
export { plugin };
