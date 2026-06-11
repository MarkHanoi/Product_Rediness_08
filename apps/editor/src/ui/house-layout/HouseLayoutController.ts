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
import { getRoomAreaOverrides } from '../apartment-layout/activeRoomAreaOverrides.js';
import { getRoomTypeOverrides } from '../apartment-layout/activeRoomTypeOverrides.js';
import { getRoomFloorOverrides } from '../apartment-layout/activeRoomFloorOverrides.js';
import { getRoomAdjacencyOverrides } from '../apartment-layout/activeRoomAdjacencyOverrides.js';
import type { HouseProgramFormState } from './houseModalHtml.js';

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
    /** §MODAL-DYNAMIC (A.21.D22): the live regenerate context. Cached on the
     *  initial `request()` so the modal's program-edit form can re-run the PURE
     *  `generateHouseLayoutOptions(...)` with an edited program/storeys/weights
     *  against the SAME analysed shell + build options, then refresh the cards
     *  in place. The shell never changes mid-modal (the user can't redraw walls
     *  while the modal is open), so caching the `ShellAnalysis` is sound. */
    private _regen: {
        runtime: PryzmRuntime;
        shell: ShellAnalysis;
        constraints: ApartmentConstraints;
        floorToFloorM: number;
        baseElevationM: number;
        roofKind: 'flat' | 'gable' | 'hip';
        siteLatitudeDeg?: number;
        // Mutable: the latest picked-up program/storeys/weights (start = request,
        // then updated on every form change so a `Use this layout` after edits
        // builds the EDITED variant, not the original brief).
        storeyCount: number;
        program: ApartmentProgram;
        weights: ScoringWeights;
    } | null = null;

    /** §DIAG-PREVIEW (founder 2026-06-11: "the ground floor plan modifies but never the
     *  upper floor" + "add many many more logs") — per-storey room-area signature from the
     *  PREVIOUS regen, so `_logPreviewDiagnostics` can PROVE whether a slider edit actually
     *  changed each storey (CHANGED vs UNCHANGED). Keyed by storeyIndex. */
    private _prevStoreySig = new Map<number, string>();

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

            // §MODAL-DYNAMIC: cache the regenerate context (shell + immutable
            // build opts + the editable program/storeys/weights).
            this._regen = {
                runtime,
                shell,
                constraints: req.constraints,
                floorToFloorM,
                baseElevationM,
                roofKind,
                ...(typeof req.siteLatitudeDeg === 'number' ? { siteLatitudeDeg: req.siteLatitudeDeg } : {}),
                storeyCount,
                program: req.program,
                weights: req.weights,
            };

            const variants = this._computeVariants(storeyCount, req.program, req.weights);
            if (variants.length === 0) {
                toast('Could not generate a house layout for this plot. Try a larger plot or a simpler programme.', 'error');
                return { ok: false, reason: 'no variants' };
            }

            // §LIVE-MODAL.A (R1) — the modal shows ONE option: the single best
            // whole-house variant. `variants[0]` is already the best (best-first
            // sort + the A.21.D18 equality invariant, houseOrchestrator.ts:295),
            // so we hand the modal `variants.slice(0,1)`. The full set is still
            // computed (the executor re-enumerates by index on pick) — we only
            // change what the PREVIEW shows.
            const best = variants.slice(0, 1);
            console.log('[house-layout] controller: computed', variants.length, 'house variant(s) — opening modal with the single best');
            // §MODAL-FILL (2026-06-10, founder #1 modal ask) — seed the program-edit
            // form with the program the engine ACTUALLY built to fill the plate, not
            // the (often sparse) captured brief. The engine grows each storey's
            // programme internally (enrichStoreyProgramToPlate / scaleProgramToShell,
            // §HOUSE-PLATE-PROGRAM-FLOOR), so a 1-bedroom brief on a big plate becomes
            // a multi-bedroom house — but the FORM used to show "1 bedroom", making the
            // grown rooms look unexplained + leaving the user unsure how to add more.
            // We count the bedrooms/bathrooms in the best computed variant (across all
            // its storeys) and seed the form with max(brief, resolved). The form is
            // thus a faithful, editable mirror of the filled plate from the first open.
            const resolved = this._resolvedProgramFor(variants[0], req.program);
            // Cache the seeded program so a later `Use this layout` (with no edits)
            // builds exactly what the seeded form + preview show.
            if (this._regen) this._regen.program = resolved;
            console.log(
                '[house-layout] §MODAL-FILL seed: brief beds/baths',
                req.program.bedrooms, '/', req.program.bathrooms,
                '→ plate-filled', resolved.bedrooms, '/', resolved.bathrooms,
            );
            this.modal.show(
                best,
                {
                    onSelect: (index: number) => this._build(runtime, index),
                    onCancel: () => {
                        console.log('[house-layout] controller: modal cancelled (no scene mutation)');
                        this._regen = null;
                    },
                    // §MODAL-DYNAMIC live regenerate: a debounced form change.
                    onProgramChange: (state) => this._regenerate(state),
                    // §LIVE-MODAL.D (R4 graph) — a debounced living-graph node edit
                    // re-runs the SAME synchronous generate against the latest
                    // cached state; `_computeVariants` merges the C52 override stash.
                    onGraphEdit: () => this._regenerateCurrent(),
                },
                // §MODAL-FILL — initial form mirrors the PLATE-FILLED program.
                { storeyCount, program: resolved, weights: req.weights },
            );
            return { ok: true, optionCount: variants.length };
        } catch (err) {
            console.error('[house-layout] controller threw:', err);
            toast(`House layout failed: ${String(err)}`, 'error');
            return { ok: false, reason: String(err) };
        }
    }

    /** PURE preview enumeration against the cached shell + build opts. Placeholder
     *  level ids only stamp `levelId`, not layout/scoring, so the picked variant
     *  index resolves to the SAME variant when the executor re-enumerates with
     *  real ids. Returns [] when no regen context exists. */
    private _computeVariants(
        storeyCount: number,
        program: ApartmentProgram,
        weights: ScoringWeights,
    ): ScoredHouseLayoutOption[] {
        const r = this._regen;
        if (!r) return [];
        // §LIVE-MODAL.D (R4 graph) — merge the C52 per-room AREA/TYPE override
        // stashes (the SAME stashes the apartment Living Graph + `gatherLayoutPayload`
        // use) into the program's `roomAreasByName` / `roomTypesByName` BEFORE the
        // pure generate. The house orchestrator threads `program` straight through to
        // each per-storey `generateDeterministicLayouts`, so NO engine change is
        // needed — the controller inlines the merge because it re-runs the engine
        // synchronously (not via the async apartment trigger). EMPTY stashes ⇒
        // program unchanged ⇒ byte-identical baseline (C52 invariant I2).
        const mergedProgram = this._mergeOverrides(program);
        return generateHouseLayoutOptions(
            r.shell, mergedProgram, r.constraints, weights,
            {
                storeyCount,
                floorToFloorM: r.floorToFloorM,
                baseElevationM: r.baseElevationM,
                roofKind: r.roofKind,
                ...(typeof r.siteLatitudeDeg === 'number' ? { solar: { latDeg: r.siteLatitudeDeg } } : {}),
            },
            HOUSE_OPTION_COUNT,
        );
    }

    /**
     * §MODAL-FILL (2026-06-10) — derive the program the engine actually BUILT to
     * fill the plate, by counting the bedroom + bathroom rooms across every storey
     * of the best computed variant. Returns `brief` with `bedrooms`/`bathrooms`
     * RAISED (never lowered) to those resolved counts, so the modal's program form
     * opens already reflecting the filled plate. No engine import (the density sizer
     * `scaleProgramToShell` is not on the ai-host barrel and ai-host is off-limits);
     * counting the produced rooms is the truest "what fills the plate" and is pure.
     * Bedrooms/bathrooms are summed across storeys because the whole-house brief is
     * the user's whole-house total (the orchestrator allocates it across storeys).
     */
    private _resolvedProgramFor(
        variant: ScoredHouseLayoutOption | undefined,
        brief: ApartmentProgram,
    ): ApartmentProgram {
        if (!variant) return brief;
        const perStorey = variant.result?.perStoreyLayout ?? [];
        let beds = 0, baths = 0;
        for (const opt of perStorey) {
            for (const r of opt?.rooms ?? []) {
                const t = (r.type || '').toLowerCase();
                const occ = ((r as { occupancy?: string }).occupancy || '').toLowerCase();
                if (t.includes('bed') || t === 'master' || occ.includes('bed')) beds++;
                else if (t.includes('bath') || t === 'ensuite' || t === 'wc' || occ.includes('bath')) baths++;
            }
        }
        // Raise — never lower — the brief counts to what the plate produced. Clamp to
        // the form's representable ranges (beds ≤ 8, baths ≤ 4) so the seeded value is
        // valid in the number inputs.
        return {
            ...brief,
            bedrooms: Math.min(8, Math.max(brief.bedrooms, beds)),
            bathrooms: Math.min(4, Math.max(brief.bathrooms, baths)),
        };
    }

    /** §LIVE-MODAL.D — return `program` with the C52 area/type override stashes
     *  merged into `roomAreasByName` / `roomTypesByName`. Returns the SAME object
     *  reference when no overrides are set (null from both getters), so the
     *  no-edit path is byte-identical (C52 I2). The stash values win over any
     *  brief-supplied name-keyed entry for the same room (matching
     *  `gatherLayoutPayload`'s apartment merge exactly). */
    private _mergeOverrides(program: ApartmentProgram): ApartmentProgram {
        const areaOverrides = getRoomAreaOverrides();
        const typeOverrides = getRoomTypeOverrides();
        // §3PANE IT-3c / §26 XE — the cross-storey move stash (`roomFloorByName`,
        // keyed `storey:<s>/<roomName>`). The engine half (XA, `allocateProgramToStoreys`
        // override-aware) + the stash already shipped; this merge is what flows it to
        // BOTH the preview (`_computeVariants`) and the build (`_build`).
        const floorOverrides = getRoomFloorOverrides();
        // §3PANE IT-3b / §ROOM-ADJACENCY (C52 E3) — the connect-rooms stash.
        const adjOverrides = getRoomAdjacencyOverrides();
        // C52 I2 — empty stashes ⇒ same program ref ⇒ byte-identical baseline.
        if (!areaOverrides && !typeOverrides && !floorOverrides && !adjOverrides) return program;
        const merged: ApartmentProgram = { ...program };
        if (areaOverrides) {
            merged.roomAreasByName = { ...(program.roomAreasByName ?? {}), ...areaOverrides };
        }
        if (typeOverrides) {
            merged.roomTypesByName = { ...(program.roomTypesByName ?? {}), ...typeOverrides };
        }
        if (floorOverrides) {
            merged.roomFloorByName = { ...(program.roomFloorByName ?? {}), ...floorOverrides };
        }
        if (adjOverrides) {
            merged.roomAdjacencyByName = [...(program.roomAdjacencyByName ?? []), ...adjOverrides];
        }
        return merged;
    }

    /**
     * §MODAL-DYNAMIC: a debounced program-edit change. Re-runs the PURE
     * `generateHouseLayoutOptions(...)` SYNCHRONOUSLY (no async workflow round-
     * trip — the house generator is an offline deterministic L2 call, unlike the
     * apartment relay) with the edited storeys/program/weights, then refreshes
     * the cards in place. Changing FLOORS re-runs with the new `storeyCount`, so
     * the engine re-enumerates per-storey and the cards reflect the new count.
     * Updates the cached program/storeys/weights so a later `Use this layout`
     * builds the EDITED variant.
     */
    private _regenerate(state: HouseProgramFormState): void {
        const r = this._regen;
        if (!r) { this.modal.setBusy(false); return; }
        try {
            r.storeyCount = state.storeyCount;
            r.program = state.program;
            r.weights = state.weights;
            const variants = this._computeVariants(state.storeyCount, state.program, state.weights);
            console.log('[house-layout] controller: regenerated', variants.length, 'variant(s) for', state.storeyCount, 'storey(s) — refreshing modal with the single best');
            // §DIAG-PREVIEW — loud per-storey instrumentation of the REGENERATED best variant
            // (founder "add many many more logs" + the upper-floor-not-updating + buttons-work
            // questions). Best-effort; never blocks the refresh.
            try { this._logPreviewDiagnostics(variants, state); } catch (e) { console.warn('[house-layout] §DIAG-PREVIEW failed (non-fatal):', e); }
            // §LIVE-MODAL.A — refresh shows the single best (variant[0]) only.
            this.modal.refresh(variants.slice(0, 1));
        } catch (err) {
            console.error('[house-layout] controller: regenerate threw:', err);
            this.modal.setBusy(false);
            r.runtime.events?.emit('pryzm:toast', { message: `House layout regenerate failed: ${String(err)}`, severity: 'error' });
        }
    }

    /**
     * §DIAG-PREVIEW (founder 2026-06-11) — loud, structured console instrumentation of the
     * MODAL PREVIEW path (the engine result the modal renders, BEFORE any build). Answers the
     * founder's live questions from a single console paste:
     *   • §DIAG-PREVIEW-PROGRAM — every program flag actually reaching the engine
     *     (livingRoom / includeKitchen / openPlanKitchenDining / masterEnSuite / per-type
     *     area overrides / weights) → "do those buttons really work?": the values are here.
     *   • §DIAG-PREVIEW-STOREY — per storey: rooms (name[type] area), covered vs footprint,
     *     BLANK area → the "top floor empty near the stair" (preview blank) with a number.
     *   • §DIAG-PREVIEW-CHANGED — per storey: CHANGED vs UNCHANGED since the last regen →
     *     proves the "ground modifies but the upper floor never does" report.
     *   • §DIAG-PREVIEW-FLAGS — did the flags take EFFECT in the result (an ensuite present
     *     when masterEnSuite=true; a kitchen+dining open zone when openPlanKitchenDining=true)?
     * Pure read of the computed variants — no mutation, never throws to the caller.
     */
    private _logPreviewDiagnostics(
        variants: readonly ScoredHouseLayoutOption[],
        state: HouseProgramFormState,
    ): void {
        const T = '[house-layout] §DIAG-PREVIEW';
        const best = variants[0];
        const p = state.program as ApartmentProgram & { roomAreas?: Record<string, number> };
        console.log(`${T} ════════ BEGIN (variants=${variants.length}, storeys=${state.storeyCount}) ════════ [filter console by "§DIAG-PREVIEW"]`);
        // ── PROGRAM flags (the "do the buttons work?" answer — these are the values the
        //    engine received this regen). ──────────────────────────────────────────────
        const areaOv = p.roomAreas ? Object.entries(p.roomAreas).map(([k, v]) => `${k}=${v}`).join(' ') : '(none)';
        console.log(`${T}-PROGRAM bedrooms=${p.bedrooms} bathrooms=${p.bathrooms} livingRoom=${p.livingRoom} includeKitchen=${p.includeKitchen !== false} openPlanKitchenDining=${p.openPlanKitchenDining} masterEnSuite=${p.masterEnSuite} areaOverrides={${areaOv}}`);
        console.log(`${T}-PROGRAM weights naturalLight=${state.weights.naturalLight} privacy=${state.weights.privacy} kitchenWorkflow=${state.weights.kitchenWorkflow} corridorEfficiency=${state.weights.corridorEfficiency}`);
        if (!best) { console.warn(`${T} ⚠ NO VARIANT produced — engine returned 0 options for this program (plate may reject the requested set).`); console.log(`${T} ════════ END ════════`); return; }
        console.log(`${T} bestScore=${(best.overallScore ?? 0).toFixed(0)} variantIndex=${best.variantIndex} storeysInResult=${best.result?.perStoreyLayout?.length ?? 0}`);

        const perStorey = best.result?.perStoreyLayout ?? [];
        const footprints = best.result?.storeys ?? [];
        const polyAreaM2 = (poly?: ReadonlyArray<{ x: number; z: number }>): number => {
            if (!poly || poly.length < 3) return 0;
            let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j]!.x + poly[i]!.x) * (poly[j]!.z - poly[i]!.z);
            return Math.abs(a / 2);
        };
        const footprintM2 = polyAreaM2(footprints.find(s => s.footprint && s.footprint.length >= 3)?.footprint as ReadonlyArray<{ x: number; z: number }> | undefined);

        let changedStoreys = 0, blankStoreys = 0, hasEnsuite = false, hasKitchen = false, hasLiving = false, hasDining = false;
        perStorey.forEach((opt, si) => {
            const rooms = opt?.rooms ?? [];
            const covered = rooms.reduce((n, r) => n + (typeof r.area === 'number' ? r.area : 0), 0);
            const blank = footprintM2 > 0 ? Math.max(0, footprintM2 - covered) : 0;
            const blankPct = footprintM2 > 0 ? (blank / footprintM2 * 100) : 0;
            const roomList = rooms.map(r => `${r.name}[${r.type}]${(typeof r.area === 'number' ? r.area.toFixed(0) : '?')}`).join(' ');
            // CHANGED detection — a stable signature of this storey's (type,area) multiset.
            const sig = rooms.map(r => `${r.type}:${(typeof r.area === 'number' ? r.area.toFixed(1) : '?')}`).sort().join('|');
            const prev = this._prevStoreySig.get(si);
            const changed = prev !== undefined && prev !== sig;
            const unchangedNote = prev === undefined ? '(first regen)' : changed ? 'CHANGED ✓' : '⚠ UNCHANGED (this storey did NOT respond to the edit)';
            this._prevStoreySig.set(si, sig);
            if (changed) changedStoreys++;
            const blankFlag = blankPct > 8 ? ` ⚠ BLANK=${blank.toFixed(1)}m² (${blankPct.toFixed(0)}% of plate — preview shows an empty area, likely by the stair)` : '';
            if (blankPct > 8) blankStoreys++;
            console.log(`${T}-STOREY ${si} rooms=${rooms.length} covered=${covered.toFixed(1)}m² footprint=${footprintM2.toFixed(1)}m²${blankFlag} ${unchangedNote}`);
            console.log(`${T}-STOREY ${si} list: ${roomList || '(none)'}`);
            for (const r of rooms) {
                const t = String(r.type ?? '').toLowerCase();
                if (t === 'ensuite') hasEnsuite = true;
                if (t === 'kitchen') hasKitchen = true;
                if (t === 'living') hasLiving = true;
                if (t === 'dining') hasDining = true;
            }
        });

        // ── FLAGS-TOOK-EFFECT (the deeper "do the buttons work?" answer) ──────────────
        if (p.masterEnSuite) console.log(`${T}-FLAGS masterEnSuite=ON → ensuiteInResult=${hasEnsuite}${hasEnsuite ? ' ✓' : ' ⚠ NO ENSUITE produced (button had no effect)'}`);
        if (p.includeKitchen !== false) console.log(`${T}-FLAGS includeKitchen=ON → kitchenInResult=${hasKitchen}${hasKitchen ? ' ✓' : ' ⚠ NO KITCHEN (mandatory missing!)'}`);
        if (p.livingRoom) console.log(`${T}-FLAGS livingRoom=ON → livingInResult=${hasLiving}${hasLiving ? ' ✓' : ' ⚠ NO LIVING (mandatory missing!)'}`);
        if (p.openPlanKitchenDining) console.log(`${T}-FLAGS openPlanKitchenDining=ON → kitchen=${hasKitchen} dining=${hasDining} (open-plan should fuse them; a separate Dining room means the flag may not have merged)`);
        console.log(`${T} ROLLUP storeys=${perStorey.length} changedSinceLastRegen=${changedStoreys} storeysWithBlank=${blankStoreys} (if you edited a slider and changedSinceLastRegen<storeys, an unchanged storey ignored the edit)`);
        console.log(`${T} ════════ END ════════`);
    }

    /**
     * §LIVE-MODAL.D (R4 graph half): re-run generation against the LATEST cached
     * program/storeys/weights — the entry point a living-graph node edit uses.
     * The C52 area/type overrides are read from the global stash inside
     * `_computeVariants` at re-run time (not copied into `_regen`), so a graph
     * edit (which writes the stash, then calls this) is honoured without any new
     * state in the controller. Mirrors `_regenerate` but with no form-state arg.
     */
    private _regenerateCurrent(): void {
        const r = this._regen;
        if (!r) { this.modal.setBusy(false); return; }
        this._regenerate({ storeyCount: r.storeyCount, program: r.program, weights: r.weights });
    }

    /** Build the picked variant via the executor using the LATEST cached
     *  program/storeys/weights (so edits made in the modal are honoured). */
    private _build(runtime: PryzmRuntime, index: number): void {
        const r = this._regen;
        if (!r) return;
        console.log('[house-layout] controller: variant', index, 'selected → build (', r.storeyCount, 'storey(s) )');
        runtime.events?.emit('pryzm:toast', { message: `Building house layout ${index + 1}…`, severity: 'info' });
        void this.executor.execute(
            runtime,
            {
                storeyCount: r.storeyCount,
                floorToFloorM: r.floorToFloorM,
                roofKind: r.roofKind,
                variantIndex: index,
                variantCount: HOUSE_OPTION_COUNT,
            },
            // §LIVE-MODAL.D — build the EDITED variant: the executor re-enumerates
            // the SAME deterministic set with this program, so it must carry the
            // C52 overrides the preview used (else the built house would ignore the
            // graph edits the user saw in the preview).
            this._mergeOverrides(r.program),
            r.constraints,
            r.weights,
            r.siteLatitudeDeg,
        );
        this._regen = null;
    }
}
