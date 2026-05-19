#!/usr/bin/env node
/**
 * Wave 10 — Fix PLACEHOLDER store stubs
 *
 * The 19 PLACEHOLDER files in src/engine/subsystems/core/stores/ are stubs
 * whose canonical implementations were migrated to packages/core-app-model/src/stores/
 * in W10-A Task 2. This script converts each stub to a re-export shim.
 *
 * GridStore.ts has real content; it imports from '../BimKernel' and '../StoreEventBus'
 * which are now at the same relative level — no change needed for GridStore.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const SHIM_HEADER = (file) => `\
/**
 * ${file} — re-export shim (Wave 10 fix)
 *
 * Canonical implementation moved to @pryzm/core-app-model/stores in W10-A Task 2.
 * This shim preserves existing relative import paths across the codebase.
 *
 * @see packages/core-app-model/src/stores/${file}
 * @see docs/03_PRYZM3/04-PLAN-FORWARD/17-WAVES-9-12-SRC-MIGRATION.md §2
 */
`;

// Map from stub filename → specific re-exports from @pryzm/core-app-model/stores
// Each entry defines what the original file exported so existing importers still work.
const STUBS = {
    'BeamStore.ts': `${SHIM_HEADER('BeamStore.ts')}
export { BeamStore } from '@pryzm/core-app-model/stores';
`,
    'BeamTypes.ts': `${SHIM_HEADER('BeamTypes.ts')}
export type { BeamData, BeamSupport, RiskLevel, BeamPlanCheck } from '@pryzm/core-app-model/stores';
export { BEAM_CONSTRAINTS } from '@pryzm/core-app-model/stores';
`,
    'CeilingColourSystem.ts': `${SHIM_HEADER('CeilingColourSystem.ts')}
export {
    CEILING_SOFFIT_DEFAULT_COLOR, CEILING_PLAN_FILL_DEFAULT_COLOR,
    LAYER_FUNCTION_COLORS, getSoffitColor, getPlanFillColor, getHoleFrameColor, getLayerColor,
} from '@pryzm/core-app-model/stores';
`,
    'CeilingPolygonUtils.ts': `${SHIM_HEADER('CeilingPolygonUtils.ts')}
export type { CeilingBoundingBox2D, CeilingPolygonValidationResult } from '@pryzm/core-app-model/stores';
export {
    computeCeilingArea, computeCeilingPerimeter, computeCeilingCentroid,
    computeCeilingBoundingBox, isCeilingCCW, ensureCeilingCCW,
    isCeilingPointInPolygon, isSimplePolygon, isHoleContainedInPolygon,
    validateCeilingPolygon, calculateCeilingSnapPoint,
} from '@pryzm/core-app-model/stores';
`,
    'CeilingStore.ts': `${SHIM_HEADER('CeilingStore.ts')}
export { CeilingStore } from '@pryzm/core-app-model/stores';
`,
    'CeilingSystemTypeStore.ts': `${SHIM_HEADER('CeilingSystemTypeStore.ts')}
export { CeilingSystemTypeStore, ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
`,
    'CeilingTypes.ts': `${SHIM_HEADER('CeilingTypes.ts')}
export type {
    CeilingLayerFunction, CeilingLayer, CeilingVertex, CeilingDetectionMethod,
    CeilingBoundary, CeilingHoleSubType, CeilingHoleShape, CeilingHoleElement,
    CeilingPattern, CeilingFinishSpec, CeilingSlope, CeilingEdgeRef,
    CeilingFreeLineEdge, CeilingHostReferenceEdge, CeilingSketchEdge, CeilingSketchLoop,
    CeilingSketch, CeilingProperties, CeilingIfcData, CeilingMetadata,
    CeilingComputedMetrics, CeilingData, CeilingToolMode, CeilingToolState,
    CeilingCreatorCallbacks, CeilingTypeCategory, CeilingSystemType,
} from '@pryzm/core-app-model/stores';
`,
    'FloorColourSystem.ts': `${SHIM_HEADER('FloorColourSystem.ts')}
export {
    FLOOR_DEFAULTS, FLOOR_LAYER_COLORS, resolveFloorColor, resolveLayerColor,
    hexToRGB, hexToThreeColor, getPreviewStyle, getPlanFillStyle, floorColorCacheKey,
} from '@pryzm/core-app-model/stores';
`,
    'FloorPolygonUtils.ts': `${SHIM_HEADER('FloorPolygonUtils.ts')}
export type { FloorValidationResult, FloorBoundingBox2D } from '@pryzm/core-app-model/stores';
export {
    computeSignedArea, computeFloorArea, computeFloorPerimeter, computeFloorCentroid,
    computeFloorBoundingBox, isFloorCCW, ensureFloorCCW, validateFloorPolygon,
    isFloorPointInPolygon, calculateFloorSnapPoint,
} from '@pryzm/core-app-model/stores';
`,
    'FloorStore.ts': `${SHIM_HEADER('FloorStore.ts')}
export { FloorStore } from '@pryzm/core-app-model/stores';
`,
    'FloorSystemTypeStore.ts': `${SHIM_HEADER('FloorSystemTypeStore.ts')}
export { FloorSystemTypeStore, floorSystemTypeStore } from '@pryzm/core-app-model/stores';
`,
    'FloorTypes.ts': `${SHIM_HEADER('FloorTypes.ts')}
export type {
    FloorLayerFunction, FloorLayer, FloorZoneType, FloorVertex, FloorDetectionMethod,
    FloorBoundary, FloorPattern, FloorFinishSpec, FloorSlope, FloorHoleSubType,
    FloorHoleShape, FloorServiceHole, FloorUnderfloorHeating, FloorIfcData,
    FloorProperties, FloorMetadata, FloorEdgeRef, FloorFreeLineEdge, FloorHostReferenceEdge,
    FloorSketchEdge, FloorSketchLoop, FloorSketch, FloorToolState, FloorTypeCategory,
    FloorSystemType, FloorData, FloorToolCallbacks,
} from '@pryzm/core-app-model/stores';
`,
    'HandrailStore.ts': `${SHIM_HEADER('HandrailStore.ts')}
export { HandrailStore } from '@pryzm/core-app-model/stores';
`,
    'HandrailTypeStore.ts': `${SHIM_HEADER('HandrailTypeStore.ts')}
export type { HandrailTypeDefinition } from '@pryzm/core-app-model/stores';
export { HandrailTypeStore, handrailTypeStore } from '@pryzm/core-app-model/stores';
`,
    'HandrailTypes.ts': `${SHIM_HEADER('HandrailTypes.ts')}
export type {
    HandrailRailLayer, HandrailData, HandrailFragment,
    HandrailFillType, HandrailRailProfile, HandrailBalusterShape,
} from '@pryzm/core-app-model/stores';
`,
    'OpeningStore.ts': `${SHIM_HEADER('OpeningStore.ts')}
export { OpeningStore } from '@pryzm/core-app-model/stores';
`,
    'OpeningTypes.ts': `${SHIM_HEADER('OpeningTypes.ts')}
export type { OpeningData } from '@pryzm/core-app-model/stores';
`,
    'RoomBoundingLineStore.ts': `${SHIM_HEADER('RoomBoundingLineStore.ts')}
export { RoomBoundingLineStore, roomBoundingLineStore } from '@pryzm/core-app-model/stores';
`,
    'RoomBoundingLineTypes.ts': `${SHIM_HEADER('RoomBoundingLineTypes.ts')}
export type {
    RoomBoundingLinePlacement, RoomBoundingLineProperties, RoomBoundingLineMetadata,
    RoomBoundingLineData, SerializedRoomBoundingLine,
    RoomBoundingLineEventType, RoomBoundingLineEventListener,
} from '@pryzm/core-app-model/stores';
`,
};

const STORES_DIR = resolve(ROOT, 'src/engine/subsystems/core/stores');
let fixed = 0;

for (const [filename, content] of Object.entries(STUBS)) {
    const filePath = resolve(STORES_DIR, filename);
    const existing = readFileSync(filePath, 'utf8').trim();
    if (existing === 'PLACEHOLDER') {
        writeFileSync(filePath, content, 'utf8');
        console.log(`[fix] Converted PLACEHOLDER → shim: ${filename}`);
        fixed++;
    } else {
        console.log(`[skip] Not a PLACEHOLDER: ${filename} (${existing.slice(0, 40).trim()}...)`);
    }
}

console.log(`\nFixed ${fixed} PLACEHOLDER stub files.`);
console.log('Next: pnpm tsc --noEmit');
