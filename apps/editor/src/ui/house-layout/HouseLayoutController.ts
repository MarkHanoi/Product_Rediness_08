// House Layout — "Choose a house layout" modal wiring controller
// (A.21.k / A.21.D21 modal slice). The house SIBLING of `ApartmentLayoutController`.
//
// Mirrors the apartment controller's flow but for the multi-storey house:
//   1. `requestHouseLayout(...)` gathers the active level's shell + program/
//      constraints/weights (reusing the apartment helpers), runs the PURE
//      `generateHouseLayoutOptions(...)` to produce N whole-house variants,
//      and opens the modal with one card per variant (per-storey previews).
//   2. On pick, it invokes `HouseLayoutExecutor.execute(...)` with the chosen
//      `variantIndex` — the executor re-enumerates the SAME deterministic set
//      against the REAL minted level ids and builds that exact variant.
//   3. On cancel, it just dismisses (no scene mutation happened yet).
//
// The executor's build internals are UNTOUCHED — the controller passes it a
// variant index + count; the executor selects the matching variant.
//
// P3/P6/P8: this controller performs NO scene mutation itself (no rAF, no store
// writes) — the EXECUTOR owns all mutation through the command bus inside one
// runBatch (P6) and the pure orchestrator carries no spans by the same
// convention the apartment + house executors follow (spans live at the AiPlane
// boundary, not in the offline deterministic path).

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    generateHouseLayoutOptions,
    analyseShell,
    type ApartmentProgram,
    type ApartmentConstraints,
    type ScoringWeights,
    type ShellAnalysis,
    type ShellWallInput,
    type ScoredHouseLayoutOption,
} from '@pryzm/ai-host';
import { storeRegistry } from '@pryzm/core-app-model';
import { facadeOrientationService } from '@pryzm/spatial-index';
import { HouseLayoutModal } from './HouseLayoutModal.js';
import { HouseLayoutExecutor } from './HouseLayoutExecutor.js';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';

/** How many whole-house variants the modal offers. */
const HOUSE_OPTION_COUNT = 3;

/** Everything `requestHouseLayout` needs to compute + build a house. The shell is
 *  read from the live wall store (the controller analyses it itself, mirroring the
 *  executor); the caller supplies the program/constraints/weights + storey count. */
export interface HouseLayoutRequest {
    readonly storeyCount: number;
    readonly program: ApartmentProgram;
    readonly constraints: ApartmentConstraints;
    readonly weights: ScoringWeights;
    readonly floorToFloorM?: number;
    readonly roofKind?: 'flat' | 'gable' | 'hip';
    readonly siteLatitudeDeg?: number;
}

/** Wall record as read from the wall store (same shape the executor reads). */
interface WallRecord {
    id: string;
    levelId: string;
    baseLine?: ReadonlyArray<{ x: number; z: number }>;
    openings?: ReadonlyArray<{ type: 'window' | 'door'; elementId?: string }>;
}

/** Analyse the active level's EXTERIOR shell into a `ShellAnalysis` for the PURE
 *  preview enumeration. Mirrors `HouseLayoutExecutor.analyseActiveShell` exactly so
 *  the preview options match what the executor will build. Returns null when there
 *  aren't ≥3 exterior walls. */
function analyseActiveShell(levelId: string): ShellAnalysis | null {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getAll?(): WallRecord[] } | undefined;
    const all = wallStore?.getAll?.() ?? [];
    const facades = facadeOrientationService.getFacades(levelId);

    const walls: ShellWallInput[] = [];
    const windowCountByWall: Record<string, number> = {};
    const orientationByWall: Record<string, 'N' | 'E' | 'S' | 'W' | null> = {};
    let entranceWallId = '';

    for (const w of all) {
        if (w.levelId !== levelId) continue;
        if (!facades.get(w.id)?.isExterior) continue;
        const bl = w.baseLine;
        if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
        walls.push({ id: w.id, baseLine: [{ x: bl[0].x, z: bl[0].z }, { x: bl[1].x, z: bl[1].z }] });
        windowCountByWall[w.id] = (w.openings ?? []).filter(o => o.type === 'window').length;
        orientationByWall[w.id] = facades.get(w.id)?.orientation ?? null;
        if (!entranceWallId && (w.openings ?? []).some(o => o.type === 'door')) entranceWallId = w.id;
    }
    if (walls.length < 3) return null;
    if (!entranceWallId) entranceWallId = walls[0]!.id;

    return analyseShell(walls, { entranceWallId, windowCountByWall, orientationByWall });
}

export interface RequestHouseLayoutResult {
    readonly ok: boolean;
    readonly reason?: string;
    /** Number of variants the modal opened with (for logging/tests). */
    readonly optionCount?: number;
}

/**
 * Drives the "Choose a house layout" modal. Owns the modal + executor singletons
 * so a single instance can serve every house-generate entry point (onboarding +
 * console). Stateless between runs apart from those singletons.
 */
export class HouseLayoutController {
    private readonly modal = new HouseLayoutModal();
    private readonly executor = new HouseLayoutExecutor();

    /**
     * Compute N house variants for the active shell + open the modal. On the
     * user's pick, build that variant via the executor. Never throws — returns
     * {ok,reason}.
     */
    async request(runtime: PryzmRuntime, req: HouseLayoutRequest): Promise<RequestHouseLayoutResult> {
        const toast = (message: string, severity: 'info' | 'success' | 'error'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };
        try {
            const ground = resolveActiveLevel();
            if (!ground?.id) { toast('No active level — draw a boundary first.', 'error'); return { ok: false, reason: 'no active level' }; }

            const shell = analyseActiveShell(ground.id);
            if (!shell) { toast('Need a closed exterior shell (≥3 walls) on the active level.', 'error'); return { ok: false, reason: 'no shell' }; }

            const storeyCount = Math.max(1, Math.floor(req.storeyCount || 1));
            const baseElevationM = ground.elevation ?? 0;
            const floorToFloorM = req.floorToFloorM && req.floorToFloorM > 0 ? req.floorToFloorM : 3.0;
            const roofKind = req.roofKind ?? 'gable';

            // PURE preview enumeration (placeholder level ids — they only stamp
            // `levelId`, not layout/scoring, so the picked variant index resolves
            // to the SAME variant when the executor re-enumerates with real ids).
            const variants: ScoredHouseLayoutOption[] = generateHouseLayoutOptions(
                shell, req.program, req.constraints, req.weights,
                {
                    storeyCount,
                    floorToFloorM,
                    baseElevationM,
                    roofKind,
                    ...(typeof req.siteLatitudeDeg === 'number' ? { solar: { latDeg: req.siteLatitudeDeg } } : {}),
                },
                HOUSE_OPTION_COUNT,
            );

            if (variants.length === 0) {
                toast('Could not generate a house layout for this plot. Try a larger plot or a simpler programme.', 'error');
                return { ok: false, reason: 'no variants' };
            }

            console.log('[house-layout] controller: computed', variants.length, 'house variant(s) — opening modal');
            this.modal.show(variants, {
                onSelect: (index: number) => {
                    console.log('[house-layout] controller: variant', index, 'selected → build');
                    toast(`Building house layout ${index + 1}…`, 'info');
                    void this.executor.execute(
                        runtime,
                        {
                            storeyCount,
                            ...(req.floorToFloorM ? { floorToFloorM: req.floorToFloorM } : {}),
                            ...(req.roofKind ? { roofKind: req.roofKind } : {}),
                            variantIndex: index,
                            variantCount: variants.length,
                        },
                        req.program,
                        req.constraints,
                        req.weights,
                        req.siteLatitudeDeg,
                    );
                },
                onCancel: () => {
                    console.log('[house-layout] controller: modal cancelled (no scene mutation)');
                },
            });
            return { ok: true, optionCount: variants.length };
        } catch (err) {
            console.error('[house-layout] controller threw:', err);
            toast(`House layout failed: ${String(err)}`, 'error');
            return { ok: false, reason: String(err) };
        }
    }
}
