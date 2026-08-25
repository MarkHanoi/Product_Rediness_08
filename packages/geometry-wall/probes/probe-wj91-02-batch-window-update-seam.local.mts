// probe-wj91-02 — lane WINJOINT91 (READ-ONLY diagnostic; untracked evidence).
//
// QUESTION: does the RAC batch's per-window child, the REAL
// `UpdateWindowParameterCommand`, itself corrupt the host wall — move its
// baseline, drop its opening, double-write? Or is every wall write it makes
// opening-only (baseline byte-identical), putting the corruption DOWNSTREAM
// in the rebuild coordination (probe-wj91-01's territory)?
//
// Real parts: WallStore (geometry-wall), windowStore (geometry-window),
// UpdateWindowParameterCommand (command-registry). Batch = N children, exactly
// as UpdateOpeningProfileBatchCommand / UpdateElementDimensionsBatchCommand
// dispatch them.
//
// Run: cd packages/geometry-wall && node ../../node_modules/tsx/dist/cli.mjs probes/probe-wj91-02-batch-window-update-seam.local.mts

import './_wj91-shim.local.mts';
import { WallStore } from '../src/WallStore';
import type { WallData, Opening } from '../src/WallTypes';
import { ProjectContext } from '@pryzm/core-app-model';
import { windowStore } from '@pryzm/geometry-window';
import { UpdateWindowParameterCommand } from '../../command-registry/src/windows/UpdateWindowParameterCommand';

const LEVEL = 'L0';
const levelProvider = {
    getLevelById: (id: string) => (id === LEVEL ? { id: LEVEL, name: 'G', elevation: 0, height: 3, childrenIds: [] } : undefined),
    getLevels: () => [{ id: LEVEL, name: 'G', elevation: 0, height: 3, childrenIds: [] }],
};

let seq = 0;
function wallRecord(id: string, s: [number, number], e: [number, number], thickness = 0.3): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        layers: [
            { name: 'finish-ext', function: 'finish-exterior', thickness: 0.02 },
            { name: 'core',       function: 'structure', thickness: 0.26 },
            { name: 'finish-int', function: 'finish-interior', thickness: 0.02 },
        ],
        metadata: { createdAt: ++seq, modifiedAt: seq, createdBy: 'probe', version: 1 },
    } as unknown as WallData;
}

const wallStore = new WallStore(new ProjectContext(), levelProvider as never);
(globalThis as any).wallStore = wallStore;

// Two mitred walls + a hosted window on each — the founder's shape in miniature.
wallStore.add(wallRecord('wA', [0, 0], [6, 0]));
wallStore.add(wallRecord('wB', [6, 0], [6, 4]));

function hostWindow(winId: string, wallId: string, offset: number): void {
    const opening: Opening = {
        id: `op-${winId}`, type: 'window', offset, width: 1.2, height: 1.5,
        sillHeight: 0.9, elementId: winId,
    };
    wallStore.addOpening(wallId, opening);
    windowStore.add({
        id: winId, openingId: opening.id, wallId,
        offset, width: 1.2, height: 1.5, sillHeight: 0.9,
    } as never);
}
hostWindow('win1', 'wA', 2.0);
hostWindow('win2', 'wB', 2.0);

// ── instrument the wall store exactly as the coordinator + reweld service do ──
interface Evt { event: string; wallId: string; baselineMoved: boolean; openings: number }
const events: Evt[] = [];
const blKey = (w: WallData) => w.baseLine.map(p => `${p.x.toFixed(9)},${p.z.toFixed(9)}`).join('|');
const before = new Map<string, string>([['wA', blKey(wallStore.getById('wA')!)], ['wB', blKey(wallStore.getById('wB')!)]]);
wallStore.subscribe((event: string, wall: WallData, prevState?: WallData) => {
    const moved = prevState ? blKey(wall) !== blKey(prevState) : false;
    events.push({ event, wallId: wall.id, baselineMoved: moved, openings: wall.openings?.length ?? 0 });
});

const ctx = { stores: { wallStore } } as never;

// ── the batch: one child per window, as the RAC batch commands dispatch ──────
const patches: Array<[string, Record<string, unknown>]> = [
    ['win1', { width: 1.4, height: 1.6 }],
    ['win2', { width: 1.4, height: 1.6 }],
];
for (const [winId, patch] of patches) {
    const cmd = new UpdateWindowParameterCommand(winId, patch as never);
    const can = cmd.canExecute(ctx);
    if (!can.ok) { console.log(`canExecute REFUSED for ${winId}: ${can.reason}`); continue; }
    const res = cmd.execute(ctx);
    console.log(`execute(${winId}, ${JSON.stringify(patch)}) → success=${res.success}${res.info ? ' info=' + JSON.stringify(res.info) : ''}`);
}

console.log('\nWall store events during the batch:');
for (const e of events) console.log(`  ${e.event} wall=${e.wallId} baselineMoved=${e.baselineMoved} openings=${e.openings}`);

const movedCount = events.filter(e => e.baselineMoved).length;
console.log(`\nTotal wall events: ${events.length}; baseline-moving events: ${movedCount}`);
for (const id of ['wA', 'wB']) {
    const now = blKey(wallStore.getById(id)!);
    console.log(`wall ${id} baseline byte-identical to pre-batch: ${now === before.get(id)}`);
}
const w1 = windowStore.getById('win1') as { width?: number } | undefined;
const opA = wallStore.getById('wA')!.openings?.[0];
console.log(`dual-write check (C15 §8.1): windowStore win1.width=${w1?.width}  wall wA opening.width=${opA?.width}`);
console.log('\nReading: 0 baseline-moving events ⇒ the command is opening-only; each event still');
console.log('schedules a coordinator flush, and on a LAYERED wall the §DIAG-OPENING-VOID false');
console.log('positive routes EVERY one of them to the whole-level re-resolve probe-wj91-01 measures.');
