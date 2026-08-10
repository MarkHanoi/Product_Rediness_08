/**
 * @file floorPlanBatcherOpenings.test.ts
 * @description Regression tests for the PDF-to-BIM materialization step
 * (FloorPlanCommandBatcher) — PDF-TO-BIM-AUDIT-2026-08-10 fixes:
 *
 *   §PDF-OFFSET-LEFTEDGE       — Opening.offset is the LEFT EDGE repo-wide
 *                                (centre = offset + width/2). The batcher used to pass
 *                                the projected CENTRE, shifting every imported
 *                                door/window by +width/2 along its host wall.
 *   §PDF-SCALE-EFFECTIVE       — all px→m scalar conversions must go through the same
 *                                transform as positions (pixelToWorld), so an underlay
 *                                rescaled in-scene keeps sizes and positions coherent.
 *   §PDF-HOST-DIST-GUARD       — the gap-probe tiebreaker must never re-host an opening
 *                                onto a wall more than HOST_TIEBREAK_MAX_DIST_M away.
 *   §PDF-OCCUPANCY-PREFLIGHT   — overlapping proposed spans on one wall are resolved at
 *                                batch time (higher confidence wins; loser is reported
 *                                as 'skipped_occupancy_conflict'), instead of failing
 *                                silently in wallOccupancyStore.canPlace() at execute time.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { FloorPlanCommandBatcher } from '../src/FloorPlanCommandBatcher.js';
import type { FloorPlanAnalysis, DetectedWall, DetectedOpening } from '../src/FloorPlanAIFactory.js';
import type { FloorPlanUnderlayTool } from '@pryzm/input-host';

// ── Stub underlay tool ─────────────────────────────────────────────────────────
// pixelToWorld maps px → metres at a configurable effective scale (m per px),
// exactly like the real tool's mesh.localToWorld pipeline (identity placement).

function makeUnderlayStub(metersPerPx: number, intrinsicPxPerMeter = 100): FloorPlanUnderlayTool {
    return {
        pixelToWorld(px: number, py: number): THREE.Vector3 | null {
            return new THREE.Vector3(px * metersPerPx, 0, py * metersPerPx);
        },
        worldToPixel(worldX: number, worldZ: number) {
            return { x: worldX / metersPerPx, y: worldZ / metersPerPx };
        },
        getState() {
            return {
                pxPerMeter: intrinsicPxPerMeter,
                planWidthMeters: 2000 / intrinsicPxPerMeter,
                planHeightMeters: 1000 / intrinsicPxPerMeter,
                widthPx: 2000,
                heightPx: 1000,
            } as ReturnType<FloorPlanUnderlayTool['getState']>;
        },
    } as unknown as FloorPlanUnderlayTool;
}

function makeAnalysis(walls: DetectedWall[], openings: DetectedOpening[]): FloorPlanAnalysis {
    return {
        walls,
        openings,
        slab: null,
        furniture: [],
        imageDimensions: { widthPx: 2000, heightPx: 1000 },
    };
}

const WALL_A: DetectedWall = {
    id: 'w1',
    startPx: { x: 100, y: 500 },
    endPx: { x: 1900, y: 500 },
    thicknessPx: 20,
    wallType: 'exterior',
    confidence: 'high',
};

function openingPayloads(result: ReturnType<typeof FloorPlanCommandBatcher.batch>) {
    return result.proposals
        .filter(p => p.intentType === 'PDF_IMPORT_DOOR' || p.intentType === 'PDF_IMPORT_WINDOW')
        .map(p => p.command.serialize().payload as { wallId: string; openingData: Record<string, number | string> });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FloorPlanCommandBatcher — hosted opening placement', () => {
    it('§PDF-OFFSET-LEFTEDGE: passes the LEFT-EDGE offset (centre − width/2), not the centre', () => {
        // 100 px = 1 m. Wall runs world x: 1 → 19 (18 m). Door centre at world x = 10,
        // i.e. 9.0 m from the wall start; width 90 px = 0.9 m → left edge = 8.55 m.
        const door: DetectedOpening = {
            id: 'o1',
            hostWallId: 'w1',
            type: 'door',
            centrePx: { x: 1000, y: 500 },
            widthPx: 90,
            confidence: 'high',
        };

        const result = FloorPlanCommandBatcher.batch({
            analysis: makeAnalysis([WALL_A], [door]),
            underlayTool: makeUnderlayStub(0.01),
            targetLevelId: 'level-0',
            includeSlab: false,
            includeFurniture: false,
            includePlumbing: false,
        });

        const openings = openingPayloads(result);
        expect(openings).toHaveLength(1);
        const od = openings[0]!.openingData;
        expect(od.width).toBeCloseTo(0.9, 6);
        // The regression: offset used to be 9.0 (the centre). Correct = 8.55 (left edge).
        expect(od.offset).toBeCloseTo(8.55, 3);
        // Invariant the whole geometry stack relies on: centre = offset + width/2.
        expect((od.offset as number) + (od.width as number) / 2).toBeCloseTo(9.0, 3);
    });

    it('§PDF-OFFSET-LEFTEDGE: windows get the same left-edge conversion + sane sill defaults', () => {
        const win: DetectedOpening = {
            id: 'o1',
            hostWallId: 'w1',
            type: 'window',
            centrePx: { x: 600, y: 500 },
            widthPx: 120, // 1.2 m
            confidence: 'high',
        };

        const result = FloorPlanCommandBatcher.batch({
            analysis: makeAnalysis([WALL_A], [win]),
            underlayTool: makeUnderlayStub(0.01),
            targetLevelId: 'level-0',
            includeSlab: false,
            includeFurniture: false,
            includePlumbing: false,
        });

        const od = openingPayloads(result)[0]!.openingData;
        // Centre at world x=6 → 5.0 m along the wall; left edge = 5.0 − 0.6 = 4.4.
        expect(od.offset).toBeCloseTo(4.4, 3);
        expect(od.width).toBeCloseTo(1.2, 6);
        expect(od.sillHeight).toBeCloseTo(0.9, 6);
        expect(od.height).toBeCloseTo(1.2, 6);
        expect(od.type).toBe('window');
    });

    it('§PDF-SCALE-EFFECTIVE: sizes follow pixelToWorld scale, not the intrinsic plan scale', () => {
        // The underlay was rescaled in-scene: effective 0.02 m/px while the intrinsic
        // state still says 100 px/m (0.01 m/px). Positions always tracked the mesh —
        // sizes must now track it too.
        const door: DetectedOpening = {
            id: 'o1',
            hostWallId: 'w1',
            type: 'door',
            centrePx: { x: 1000, y: 500 },
            widthPx: 45, // 45 px × 0.02 = 0.9 m effective (would be 0.45 m intrinsic → clamped 0.5)
            confidence: 'high',
        };

        const result = FloorPlanCommandBatcher.batch({
            analysis: makeAnalysis([WALL_A], [door]),
            underlayTool: makeUnderlayStub(0.02),
            targetLevelId: 'level-0',
            includeSlab: false,
            includeFurniture: false,
            includePlumbing: false,
        });

        const od = openingPayloads(result)[0]!.openingData;
        expect(od.width).toBeCloseTo(0.9, 6);

        // Wall thickness: 20 px × 0.02 = 0.4 m (exterior clamp keeps it at 0.4).
        const wallPayload = result.proposals
            .find(p => p.intentType === 'PDF_IMPORT_WALL')!
            .command.serialize().payload as { thickness: number };
        expect(wallPayload.thickness).toBeCloseTo(0.4, 6);
    });

    it('§PDF-HOST-DIST-GUARD: gap-probe tiebreaker cannot re-host a door onto a distant wall', () => {
        // Wall A hosts the door (0.1 m away, no confirmed pixel gap).
        // Wall B is 10 m away but has a perfect-looking gap flanked by two transverse
        // jambs. Pre-fix the tiebreaker would re-host the door onto B.
        const wallB: DetectedWall = {
            id: 'w2',
            startPx: { x: 100, y: 1500 },
            endPx: { x: 1900, y: 1500 },
            thicknessPx: 20,
            wallType: 'exterior',
            confidence: 'high',
        };
        const jamb1: DetectedWall = {
            id: 'w3',
            startPx: { x: 900, y: 1500 },
            endPx: { x: 900, y: 1100 },
            thicknessPx: 10,
            wallType: 'interior',
            confidence: 'high',
        };
        const jamb2: DetectedWall = {
            id: 'w4',
            startPx: { x: 1100, y: 1500 },
            endPx: { x: 1100, y: 1100 },
            thicknessPx: 10,
            wallType: 'interior',
            confidence: 'high',
        };
        const door: DetectedOpening = {
            id: 'o1',
            hostWallId: 'w1',
            type: 'door',
            centrePx: { x: 1000, y: 510 }, // 0.1 m from wall A's centreline
            widthPx: 90,
            confidence: 'high',
        };

        const result = FloorPlanCommandBatcher.batch({
            analysis: makeAnalysis([WALL_A, wallB, jamb1, jamb2], [door]),
            underlayTool: makeUnderlayStub(0.01),
            targetLevelId: 'level-0',
            includeSlab: false,
            includeFurniture: false,
            includePlumbing: false,
        });

        const doorDiag = result.openingDiagnostics.find(d => d.aiId === 'o1')!;
        expect(doorDiag.status).toBe('accepted');
        const wallAUuid = [...result.wallUUIDToWorld.entries()]
            .find(([, w]) => Math.abs(w.worldStart.z - 5) < 0.2 && Math.abs(w.worldEnd.z - 5) < 0.2)?.[0];
        expect(wallAUuid).toBeDefined();
        expect(doorDiag.assignment.assignedWallUUID).toBe(wallAUuid);
    });

    it('§PDF-OCCUPANCY-PREFLIGHT: overlapping spans on one wall — higher confidence wins, loser reported', () => {
        const doorHigh: DetectedOpening = {
            id: 'o1',
            hostWallId: 'w1',
            type: 'door',
            centrePx: { x: 1000, y: 500 },
            widthPx: 90,
            confidence: 'high',
        };
        const doorMedium: DetectedOpening = {
            id: 'o2',
            hostWallId: 'w1',
            type: 'door',
            centrePx: { x: 1030, y: 500 }, // span overlaps o1's
            widthPx: 90,
            confidence: 'medium',
        };

        const result = FloorPlanCommandBatcher.batch({
            analysis: makeAnalysis([WALL_A], [doorMedium, doorHigh]), // medium listed FIRST
            underlayTool: makeUnderlayStub(0.01),
            targetLevelId: 'level-0',
            includeSlab: false,
            includeFurniture: false,
            includePlumbing: false,
        });

        expect(result.summary.openings).toBe(1);
        const accepted = result.openingDiagnostics.find(d => d.status === 'accepted')!;
        const skippedDiag = result.openingDiagnostics.find(d => d.status === 'skipped_occupancy_conflict')!;
        expect(accepted.aiId).toBe('o1');   // high confidence wins despite array order
        expect(skippedDiag.aiId).toBe('o2');
        expect(result.skippedCount).toBeGreaterThanOrEqual(1);
    });

    it('non-overlapping openings on the same wall all survive the pre-flight', () => {
        const door: DetectedOpening = {
            id: 'o1', hostWallId: 'w1', type: 'door',
            centrePx: { x: 400, y: 500 }, widthPx: 90, confidence: 'high',
        };
        const win: DetectedOpening = {
            id: 'o2', hostWallId: 'w1', type: 'window',
            centrePx: { x: 1400, y: 500 }, widthPx: 120, confidence: 'high',
        };

        const result = FloorPlanCommandBatcher.batch({
            analysis: makeAnalysis([WALL_A], [door, win]),
            underlayTool: makeUnderlayStub(0.01),
            targetLevelId: 'level-0',
            includeSlab: false,
            includeFurniture: false,
            includePlumbing: false,
        });

        expect(result.summary.openings).toBe(2);
        expect(result.openingDiagnostics.filter(d => d.status === 'accepted')).toHaveLength(2);
    });
});
