/**
 * @pryzm/core-app-model — geometry sub-barrel (Sprint B P9-W8, Sprint D P9-W9, Sprint E P9-W10)
 */

// ── Sprint E P9-W10 (2026-05-10) — JoinData type (extracted from WallJoinResolver) ──
export type { JoinData } from './WallJoinTypes.js';

export type { NMEExportOptions } from './NativeElementMeshExporter.js';
export { NativeElementMeshExporter, nativeElementMeshExporter } from './NativeElementMeshExporter.js';

// ── Sprint D P9-W9 (2026-05-10) — WallJoinAuditUtils (pure THREE, no src/ deps) ──

export type { JoinAdjustment, JoinResult } from './WallJoinAuditUtils.js';
export {
    validateEndpointConvergence,
    computeBisector,
    computeMiterNormal,
    diagnoseJoinRobustness,
} from './WallJoinAuditUtils.js';
