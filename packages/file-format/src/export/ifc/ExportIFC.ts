/**
 * ExportIFC.ts
 * Phase E-3 — IFC Round-Trip: Enhanced export entry point
 *
 * Reads all BIM stores from the window globals (EngineBootstrap sets these),
 * assembles semantic data from the live SemanticGraph manager, template
 * assignments, and room store, then passes everything to IfcExporter.
 *
 * Semantic enrichment (Phase E-3 additions):
 *   - Pset_PRYZM_Spatial  on every IfcSpace: template, targetArea, occupancyType, etc.
 *   - Pset_PRYZM_Compliance on every IfcSpace: complianceStatus, deviationPct
 *   - Pset_PRYZM_Identifiers on every element: pryzmId, schemaVersion
 *   - IfcRelSpaceBoundary for adjacentTo relationships
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { IfcExporter, IfcExportScope } from './IfcExporter';
import { IfcFileWriter } from './IfcFileWriter';
import { RoomSemanticData } from './IfcSemanticWriter';
import * as OBC from '@thatopen/components';
import * as THREE from '@pryzm/renderer-three/three';
import { debug } from '@pryzm/core-app-model';

export async function exportIFC(
    components: OBC.Components,
    _fragments: OBC.FragmentsManager,
    options: {
        exportScope?: IfcExportScope;
        schema?: 'IFC2X3' | 'IFC4';
        filename?: string;
        onProgress?: (stage: string, progress: number, detail?: string) => void;
    } = {},
) {
    console.group('📦 IFC EXPORT (Phase E-3 — Semantic Round-Trip)');
    debug('📦 IFC export triggered');

    try {
        debug('🔧 Initializing IfcExporter...');

        // All window.* properties typed in src/global-window.d.ts (P4-compliant).
        const stores = {
            wallStore:        window.wallStore ?? undefined, // TODO(TASK-07)
            slabStore:        window.slabStore ?? undefined, // TODO(TASK-07)
            columnStore:      window.columnStore ?? undefined, // TODO(TASK-07)
            curtainWallStore: window.curtainWallStore ?? undefined, // TODO(TASK-07)
            beamStore:        window.beamStore ?? undefined, // TODO(TASK-07)
            stairStore:       window.stairStore ?? undefined, // TODO(TASK-07)
            roofStore:        window.roofStore ?? undefined, // TODO(TASK-07)
            furnitureStore:   window.furnitureStore ?? undefined, // TODO(TASK-07)
            handrailStore:    window.handrailStore ?? undefined, // TODO(TASK-07)
            plumbingStore:    window.plumbingStore ?? undefined, // TODO(TASK-07)
            roomStore:        window.roomStore ?? undefined, // TODO(TASK-07)
        };

        // Try to get a valid Three.js scene — check all registered worlds, not just the first.
        let scene: THREE.Scene | undefined;
        try {
            const worldsList = components.get(OBC.Worlds).list;
            for (const world of worldsList.values()) {
                const candidate = world?.scene?.three as THREE.Scene | undefined;
                if (candidate instanceof THREE.Scene) {
                    scene = candidate;
                    debug(`IFC export: using scene from world (${worldsList.size} world(s) registered)`);
                    break;
                }
            }
        } catch (e) {
            debug(`IFC export: error iterating worlds — ${e}`);
        }

        // Final fallback: check common window globals set by the engine
        // All window.* properties typed in src/global-window.d.ts (P4-compliant).
        if (!scene) {
            const candidates = [
                window.threeScene, window.bimScene, window.activeScene,
                window.bimManager?.scene, window.world?.scene?.three,
            ];
            for (const c of candidates) {
                if (c instanceof THREE.Scene) { scene = c; break; }
            }
            if (scene) debug('IFC export: found scene via window global fallback');
        }

        // If no scene found, use an empty scene so parametric geometry fallback in readers still works
        if (!scene) {
            debug('IFC export: no scene found — geometry will use parametric fallback from BIM stores');
            console.warn('[IFC Export] No Three.js scene available — walls/slabs will use parametric geometry');
            scene = new THREE.Scene();
        }

        const sceneRegistry = { scene };

        // ── Phase E-3: Build semantic data from live stores ─────────────────

        const semanticData = buildSemanticData(window);

        if (semanticData.rooms.length > 0) {
            debug(`📐 Attaching semantic data: ${semanticData.rooms.length} rooms, ${semanticData.relationships.length} relationships`);
        } else {
            debug('ℹ️  No semantic data available — exporting geometry only');
        }

        const exporter = new IfcExporter(stores, sceneRegistry);

        debug('🏗️ Building spatial structure & exporting...');

        const data = await exporter.export({
            projectName: window.projectName ?? 'PRYZM Project',
            semanticData,
            schema: options.schema,
            exportScope: options.exportScope ?? 'native-only',
            onProgress: options.onProgress,
        });

        options.onProgress?.('Export complete', 100, 'Your IFC file is ready. The download will start now.');
        // D.7.5 batch #5: yield one scheduler tick so the progress UI commits
        // its final paint before the download dialog steals focus.
        await new Promise<void>((resolve) => {
            getFrameScheduler().scheduleOnce('export-ifc-final-yield', () => resolve());
        });

        const filename = options.filename ?? 'project.ifc';
        IfcFileWriter.downloadFile(data, filename);

        debug('✅ IFC EXPORT SUCCESS (with PRYZM semantic enrichment)');
        console.log('✅ IFC EXPORT SUCCESS — includes Pset_PRYZM_Spatial, Pset_PRYZM_Compliance, IfcRelSpaceBoundary');
    } catch (err: any) {
        debug('❌ IFC EXPORT FAILED');
        debug(err?.message || String(err));
        console.error('❌ IFC EXPORT FAILED', err);
        throw err;
    } finally {
        console.groupEnd();
    }
}

// ── Semantic data assembly ────────────────────────────────────────────────────

function buildSemanticData(w: any): {
    rooms: RoomSemanticData[];
    relationships: import('@pryzm/core-app-model').Relationship[];
    schemaVersion: number;
} {
    const rooms: RoomSemanticData[] = [];
    const relationships: import('@pryzm/core-app-model').Relationship[] = [];

    // ── Extract SemanticGraph relationships ───────────────────────────────────
    // D-gap-4 fix: SemanticGraphManager.getAll() is the correct method name (not getAllRelationships).
    try {
        const sgManager = w.semanticGraphManager;
        if (sgManager && typeof sgManager.getAll === 'function') {
            const allRels = sgManager.getAll() as import('@pryzm/core-app-model').Relationship[];
            relationships.push(...allRels);
        } else if (sgManager && typeof sgManager.serialize === 'function') {
            const graphJson = sgManager.serialize();
            relationships.push(...(graphJson.relationships ?? []));
        }
    } catch (_) {}

    // ── Extract room semantic data ─────────────────────────────────────────────
    try {
        const roomStore = w.roomStore;
        const templateStore = w.templateStore;

        if (!roomStore) return { rooms, relationships, schemaVersion: 3 };

        const allRooms: any[] = typeof roomStore.getAll === 'function'
            ? roomStore.getAll()
            : (roomStore.rooms ?? []);

        const templates: any[] = templateStore
            ? (typeof templateStore.getAll === 'function'
                ? templateStore.getAll()
                : (templateStore.templates ?? []))
            : [];

        const assignments: any[] = templateStore?.assignments ?? [];
        const templateMap = new Map(templates.map((t: any) => [t.id, t]));
        const assignmentByRoom = new Map(assignments.map((a: any) => [a.elementId, a]));

        for (const room of allRooms) {
            const assignment = assignmentByRoom.get(room.id);
            const template = assignment ? templateMap.get(assignment.templateId) : null;
            const targetArea = template?.requirements?.find((r: any) => r.key === 'area')?.value as number | undefined;
            const actualArea = room.computed?.area ?? room.area;

            let complianceStatus: RoomSemanticData['complianceStatus'] = 'no-template';
            let deviationPct: number | undefined;
            const failingRequirements: string[] = [];

            if (template && targetArea && actualArea) {
                const dev = Math.abs((actualArea - targetArea) / targetArea) * 100;
                deviationPct = Math.round(dev * 10) / 10;
                complianceStatus = dev <= 10 ? 'pass' : dev <= 25 ? 'warn' : 'fail';
                if (dev > 10) {
                    failingRequirements.push(`Area: ${actualArea.toFixed(1)}m² vs target ${targetArea}m² (${deviationPct}% deviation)`);
                }
            }

            rooms.push({
                roomId: room.id,
                roomName: room.name ?? room.roomName ?? `Room ${room.id.slice(-4)}`,
                roomNumber: room.roomNumber ?? room.number,
                occupancyType: room.occupancyType,
                area: actualArea,
                syncState: room.syncState,
                templateName: template?.name ?? assignment?.templateName,
                templateCode: template?.code ?? assignment?.templateCode,
                targetArea,
                unitId: room.unitId,
                complianceStatus,
                deviationPct,
                failingRequirements: failingRequirements.length > 0 ? failingRequirements : undefined,
            });
        }
    } catch (err) {
        debug(`[ExportIFC] Semantic data assembly error: ${err}`);
    }

    return { rooms, relationships, schemaVersion: 3 };
}
