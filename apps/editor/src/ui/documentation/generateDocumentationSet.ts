// DOC-AUTO — editor entry point for the "Documentation" AI command (2026-06-09).
//
// Realises the PURE documentation-set plan (`planDocumentationSet`, ai-host DS6) over the
// LIVE model: gathers levels + detected rooms + footprint, computes the numbered sheet plan,
// and creates the per-level PLAN + per-room CROPPED-PLAN ViewDefinitions via the command bus
// (P6) — the SAME `view.createDefinition` verb the §FLR-VIEWS loop + Views rail use. Building
// elevations + set-out + PDF are surfaced in the summary for now (follow-up wiring per
// C24.1 §4). Best-effort + defensive: never throws to the caller; a missing store just yields
// a graceful toast. See docs/03-execution/plans/AUTO-DOCUMENTATION-SHEETS-PLAN.md + C24.1.

import { storeRegistry, viewDefinitionStore } from '@pryzm/core-app-model';
import { planDocumentationSet, computeBuildingElevationMarks, type DocSetInput, type DocRoomInput } from '@pryzm/ai-host';
import type { PryzmRuntime } from '@pryzm/runtime-composer';

interface LevelLike { id: string; name?: string; elevation?: number }
interface RoomLike { id: string; name?: string; levelId?: string; boundary?: { polygon?: Array<{ x: number; z: number }> } }

function bboxRect(pts: ReadonlyArray<{ x: number; z: number }>): Array<{ x: number; z: number }> {
    if (pts.length < 3) return [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z; }
    if (!(maxX > minX) || !(maxZ > minZ)) return [];
    return [{ x: minX, z: minZ }, { x: maxX, z: minZ }, { x: maxX, z: maxZ }, { x: minX, z: maxZ }];
}

// §DOC-AI-COMMAND-WIRE (2026-06-24) — shared model-input gather for all three
// Documentation AI commands (full set, plans-per-level, building-elevations). Each
// command was previously authored as an autoSend NL `query` ("create a floor plan
// view for every level" / "create the four building elevations") that QueryEngine
// has NO pattern for → it fell through to "I'm not sure how to help with that yet."
// and the buttons did nothing. These helpers run the SAME bus verbs the working
// "Generate documentation set" action + the Views rail use.

interface DocModelInput { levels: DocSetInput['levels']; rooms: DocRoomInput[]; footprint: Array<{ x: number; z: number }> }

/** Gather sorted levels + detected rooms + footprint from the live model. Returns null if no levels. */
function gatherModelInput(): DocModelInput | null {
    const bim = (window as unknown as { bimManager?: { getLevels?: () => LevelLike[] } }).bimManager;
    const levels = (bim?.getLevels?.() ?? [])
        .slice()
        .sort((a, b) => (a.elevation ?? 0) - (b.elevation ?? 0))
        .map(l => ({ levelId: l.id, name: l.name ?? l.id }));
    if (levels.length === 0) return null;

    const roomStore = storeRegistry.getStoreForType('room') as unknown as { getAll?(): RoomLike[] } | undefined;
    const rooms: DocRoomInput[] = (roomStore?.getAll?.() ?? [])
        .filter(r => (r.boundary?.polygon?.length ?? 0) >= 3)
        .map(r => ({
            id: r.id, name: r.name ?? 'Room', levelId: r.levelId ?? levels[0]!.levelId,
            polygon: r.boundary!.polygon!.map(p => ({ x: p.x, z: p.z })),
        }));

    const footprint = bboxRect(rooms.flatMap(r => r.polygon));
    return { levels, rooms, footprint };
}

/**
 * §DOC-AI-COMMAND-WIRE — "Floor plan per level" Documentation AI command. Creates ONE
 * plan ViewDefinition per level (idempotent on `vd-doc-plan-<levelId>`) via the registered
 * `view.createDefinition` bus verb (P6). Returns the number of views created. Never throws.
 */
export function generateFloorPlansPerLevel(runtime: PryzmRuntime): number {
    const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void =>
        runtime.events?.emit('pryzm:toast', { message, severity });
    try {
        const input = gatherModelInput();
        if (!input) { toast('Floor plans: no levels in the model yet.', 'warn'); return 0; }

        let created = 0;
        for (const lvl of input.levels) {
            const id = `vd-doc-plan-${lvl.levelId}`;
            if (viewDefinitionStore.getByLevel(lvl.levelId).some(v => v.id === id)) continue;
            try {
                runtime.bus.executeCommand('view.createDefinition', {
                    id, name: `${lvl.name} Plan`, viewType: 'plan',
                    spatial: { levelId: lvl.levelId },
                    intent: 'system-architectural-plan-current-level',
                });
                created += 1;
            } catch (e) { console.warn('[documentation] floor-plan create failed for', lvl.name, e); }
        }
        console.log(`[documentation] §DOC-AI-COMMAND-WIRE floor-plans created ${created}/${input.levels.length}`);
        toast(
            created > 0
                ? `Floor plans: created ${created} per-level plan view${created === 1 ? '' : 's'}.`
                : 'Floor plans: per-level plan views already exist.',
            created > 0 ? 'success' : 'info',
        );
        return created;
    } catch (e) {
        console.error('[documentation] floor-plans generate failed:', e);
        toast('Floor-plan generation failed — see console.', 'error');
        return 0;
    }
}

/**
 * §DOC-AI-COMMAND-WIRE — "Building elevations" Documentation AI command. Creates the four
 * exterior N/S/E/W elevation ViewDefinitions (viewType 'elevation' + spatial.projectionDirection,
 * the shape the Views rail reads back) via `view.createDefinition` (P6). Direction is computed
 * by ai-host DS3 `computeBuildingElevationMarks` from the building footprint. Idempotent on
 * `vd-doc-elev-<direction>`. Returns the number of elevation views created. Never throws.
 */
export function generateBuildingElevations(runtime: PryzmRuntime): number {
    const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void =>
        runtime.events?.emit('pryzm:toast', { message, severity });
    try {
        const input = gatherModelInput();
        if (!input) { toast('Elevations: no levels in the model yet.', 'warn'); return 0; }

        const marks = computeBuildingElevationMarks(input.footprint);
        if (marks.length === 0) {
            toast('Elevations: no building footprint yet — detect rooms or add walls first.', 'warn');
            return 0;
        }

        // The 4 elevations are model-wide; key off direction so a re-click is idempotent.
        const existing = new Set(viewDefinitionStore.getAll().map(v => v.id));
        let created = 0;
        for (const m of marks) {
            const id = `vd-doc-elev-${m.direction}`;
            if (existing.has(id)) continue;
            try {
                runtime.bus.executeCommand('view.createDefinition', {
                    id, name: m.label, viewType: 'elevation',
                    spatial: { projectionDirection: { x: m.facing.x, y: 0, z: m.facing.z } },
                });
                created += 1;
            } catch (e) { console.warn('[documentation] elevation create failed for', m.label, e); }
        }
        console.log(`[documentation] §DOC-AI-COMMAND-WIRE building-elevations created ${created}/4`);
        toast(
            created > 0
                ? `Building elevations: created ${created} elevation view${created === 1 ? '' : 's'} (N/S/E/W).`
                : 'Building elevations: the four elevation views already exist.',
            created > 0 ? 'success' : 'info',
        );
        return created;
    } catch (e) {
        console.error('[documentation] building-elevations generate failed:', e);
        toast('Building-elevation generation failed — see console.', 'error');
        return 0;
    }
}

/**
 * Generate the documentation set for the live model. Creates per-level plan + per-room cropped
 * plan ViewDefinitions; logs the full numbered plan (elevations/set-out/room-elevations) for the
 * follow-up wiring. Returns the number of views created. Never throws.
 */
export function generateDocumentationSet(runtime: PryzmRuntime): number {
    const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void =>
        runtime.events?.emit('pryzm:toast', { message, severity });
    try {
        const gathered = gatherModelInput();
        if (!gathered) { toast('Documentation: no levels in the model yet.', 'warn'); return 0; }
        const { levels, rooms, footprint } = gathered;
        const input: DocSetInput = { levels, rooms, footprint };
        const plan = planDocumentationSet(input);

        // Realise the per-level plan + per-room cropped-plan views (view.createDefinition, P6).
        let created = 0;
        const hasPlanView = (levelId: string, id: string): boolean =>
            viewDefinitionStore.getByLevel(levelId).some(v => v.id === id);
        for (const sheet of plan) {
            for (const view of sheet.views) {
                try {
                    if ((view.kind === 'plan' || view.kind === 'set-out') && view.levelId) {
                        const id = `vd-doc-${view.kind}-${view.levelId}`;
                        if (hasPlanView(view.levelId, id)) continue;
                        runtime.bus.executeCommand('view.createDefinition', {
                            id, name: view.label, viewType: 'plan', spatial: { levelId: view.levelId },
                            // §GHOST-FIX — no storey-below projection on generated plan sheets.
                            intent: 'system-architectural-plan-current-level',
                        });
                        created += 1;
                    } else if (view.kind === 'room-plan' && view.levelId && view.cropRegion) {
                        const id = `vd-doc-room-${sheet.sheetNumber}`;
                        if (hasPlanView(view.levelId, id)) continue;
                        const cr = view.cropRegion;
                        // §DOC-ROOM-CROP — `spatial.cropRegion` is only the EdgeProjector
                        // geometry pre-filter (and only when EDGE_PROJECTOR_NATIVE is on);
                        // PlanViewCanvas frames (fitToDrawing) + clips (_applyCropClip) by
                        // `crop` (ViewCropSettings). Set BOTH so the per-room sheet actually
                        // fits tight to the room boundary instead of showing the whole floor.
                        const crop = {
                            enabled: true,
                            region: { min: [cr.minX, cr.minZ] as [number, number], max: [cr.maxX, cr.maxZ] as [number, number] },
                            annotationCrop: true,
                        };
                        console.log(
                            `[documentation] §DOC-ROOM-CROP fit "${view.label}" → ` +
                            `X[${cr.minX.toFixed(2)},${cr.maxX.toFixed(2)}] Z[${cr.minZ.toFixed(2)},${cr.maxZ.toFixed(2)}] (m)`,
                        );
                        runtime.bus.executeCommand('view.createDefinition', {
                            id, name: view.label, viewType: 'plan',
                            spatial: { levelId: view.levelId, cropRegion: view.cropRegion },
                            crop,
                            intent: 'system-architectural-plan-current-level',
                        });
                        created += 1;
                    } else if (view.kind === 'building-elevation' && view.elevationMark) {
                        // §DOC-AI-COMMAND-WIRE — realise the 4 exterior elevations too (was
                        // previously only counted in the summary). Mirror the Views-rail shape:
                        // viewType 'elevation' + spatial.projectionDirection (read back by
                        // ViewsRailPanel._resolveElevationDirection).
                        const mk = view.elevationMark as { direction?: string; facing: { x: number; z: number } };
                        const id = `vd-doc-elev-${mk.direction ?? view.label}`;
                        if (viewDefinitionStore.getAll().some(v => v.id === id)) continue;
                        runtime.bus.executeCommand('view.createDefinition', {
                            id, name: view.label, viewType: 'elevation',
                            spatial: { projectionDirection: { x: mk.facing.x, y: 0, z: mk.facing.z } },
                        });
                        created += 1;
                    }
                } catch (e) { console.warn('[documentation] view create failed for', view.label, e); }
            }
        }

        const setout = plan.filter(s => s.sheetNumber.startsWith('A-3')).length;
        const roomSheets = plan.filter(s => s.sheetNumber.startsWith('A-4')).length;
        console.log('[documentation] §DOC-AUTO plan:', plan.map(s => `${s.sheetNumber} ${s.name}`).join(' | '));
        toast(
            `Documentation: ${plan.length} sheets planned — created ${created} plan/elevation/room views. ` +
            `(${setout} set-out + ${roomSheets} room sheets queued for PDF wiring.)`,
            created > 0 ? 'success' : 'info',
        );
        return created;
    } catch (e) {
        console.error('[documentation] generate failed:', e);
        toast('Documentation generation failed — see console.', 'error');
        return 0;
    }
}
