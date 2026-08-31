/**
 * §OBC-SEAM (Axis 7 Wave A, 2026-08-31) — the seam's single front door.
 *
 * PURITY CONTRACT — ZERO `@thatopen/*` specifiers in this file. The one
 * runtime binding to OBC lives in `../BimWorld.ts` (the instance owner, which
 * already imports OBC — §FIX-RESTRICTED-IMPORT-RATCHET counts specifiers per
 * file, stood at 124/113 RED when the seam was minted, and may only shrink).
 * This module exists so consumers have ONE stable specifier for the seam
 * regardless of where the binding is hosted.
 *
 * Consumers (geometry-*, input-host — Wave A conversion groups 1–4):
 *   - runtime: `projectToDrawingSpace`, `requestManualFrame`,
 *     `isManualRenderer`, `getSceneRaycaster`
 *   - types: `SeamWorld`, `SeamCamera`, `SeamCameraControls`,
 *     `DrawingSurface`, `SeamDrawingLayer`, `ComponentsHandle`
 * replace `import * as OBC from '@thatopen/components'` wholesale — the scout
 * proved the runtime surface is exactly these three recipes and the type-only
 * positions are exactly these shapes (`new OBC.*` = 0, `extends OBC.*` = 0,
 * named imports = 0 across all 37 in-scope files;
 * audit/full-stack/2026-08-31/_p5/obc-seam-scout.md).
 *
 * ⚠ The WebGPU-canvas guard (`!window.pryzmCanvas` / DI equivalent) is NOT
 *   absorbed by `requestManualFrame` — keep it at the call site. See the
 *   function's doc in ../BimWorld.ts.
 */
export {
    getSceneRaycaster,
    isManualRenderer,
    projectToDrawingSpace,
    requestManualFrame,
} from '../BimWorld.js';
export type {
    ComponentsHandle,
    DrawingSurface,
    SeamCamera,
    SeamCameraControls,
    SeamDrawingLayer,
    SeamWorld,
} from './ObcSeamTypes.js';
