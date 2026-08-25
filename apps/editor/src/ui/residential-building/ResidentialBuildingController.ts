// Residential building (multi-family) — controller wiring the
// "Choose a residential building" preview modal (P3.3). The SIBLING of
// `HouseLayoutController`, but a residential building is ONE deterministic result
// (no scored-variant grid), so the controller:
//   1. resolves the active level's footprint (the SAME drawn shell the house flow
//      reads), gathers the user inputs (min/max m² per apartment, the T1..T4
//      booleans, the number of floors), and runs the PURE orchestrator
//      `orchestrateResidentialBuilding(...)` to compute the building.
//   2. on a feasible result opens the modal with one card per floor (per-apartment
//      plan thumbnails + the rejected hatch + the central core); on a rejection
//      surfaces the reason as a toast.
//   3. on Build, invokes `ResidentialBuildingExecutor.execute(...)` with the SAME
//      result (the executor builds it through the command bus in one runBatch).
//   4. on Cancel, just dismisses (no scene mutation happened yet).
//
// P3/P6/P8: this controller performs NO scene mutation itself (no rAF, no store
// writes) — the EXECUTOR owns all mutation through the command bus inside one
// runBatch. The whole feature is GATED behind the `globalThis.__PRYZM_RESIDENTIAL_BUILDING__`
// toggle (default OFF) so it cannot affect existing users until it is flipped.

import { trace } from '@opentelemetry/api';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    orchestrateResidentialBuilding,
    // §GEN-FACADE-OPENINGS (L-11080) — the photograph's measured opening lattice. TYPE only here:
    // this controller threads it to the executor and makes no measurement of its own.
    type FacadeOpeningProgram,
    type ResidentialBuildingOrchestratorInput,
    type ResidentialBuildingResult,
    type ResidentialBuildingOk,
} from '@pryzm/ai-host';
import { storeRegistry } from '@pryzm/core-app-model';
import { siteQueryService } from '@pryzm/stores';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { checkMaxHeightGate, maxHeightRefusalText } from '../generation/maxHeightGate.js';
import { ResidentialBuildingModal } from './ResidentialBuildingModal.js';
import { ResidentialBuildingExecutor } from './ResidentialBuildingExecutor.js';
import { friendlyResidentialError, polygonAreaM2 } from './residentialError.js';

const _tracer = trace.getTracer('@pryzm/editor', '0.1.0');

const DEFAULT_FLOOR_TO_FLOOR_M = 3.0;
const DEFAULT_CORE_WIDTH_M = 6.0;
const DEFAULT_CORE_DEPTH_M = 4.0;
const DEFAULT_CORRIDOR_WIDTH_M = 1.5;
const DEFAULT_MIN_APT_M2 = 45;
const DEFAULT_MAX_APT_M2 = 120;

/** Wall record as read from the wall store (same shape the house flow reads). */
interface WallRecord {
    id: string;
    levelId: string;
    baseLine?: ReadonlyArray<{ x: number; z: number }>;
}

/** The user inputs the feature needs (gathered before the modal opens). */
export interface ResidentialBuildingRequest {
    /** Number of UPPER residential levels (1..20). Ground is always level 0. */
    readonly upperLevels: number;
    /** Per-apartment net-area band (m²). */
    readonly minApartmentAreaM2?: number;
    readonly maxApartmentAreaM2?: number;
    /** Which apartment typologies are enabled (one or several). */
    readonly typologies: { readonly T1?: boolean; readonly T2?: boolean; readonly T3?: boolean; readonly T4?: boolean };
    /** Centred-core plan size (m). Defaults applied when omitted. */
    readonly coreWidthM?: number;
    readonly coreDepthM?: number;
    /** Public-corridor clear width (m). Default 1.5. */
    readonly corridorWidthM?: number;
    /** Floor-to-floor height (m). Default 3.0. */
    readonly floorToFloorM?: number;
    /** OPTIONAL site latitude (decimal degrees) → climate-driven window orientation. */
    readonly siteLatitudeDeg?: number;
    /** OPTIONAL explicit footprint (metres, plan XZ). When omitted, read from the
     *  active level's drawn shell (the house-flow source). */
    readonly footprint?: ReadonlyArray<{ x: number; z: number }>;
    /** §RESI-ROOF-GARDEN (2026-06-24) — OPTIONAL roof amenity deck. Default OFF. Threaded straight
     *  to the executor (`ResidentialExecuteInput.roofGarden`); the deck is executor-emitted so the
     *  pure orchestrator/preview are unchanged for this slice. */
    readonly roofGarden?: boolean;
    /** §RESI-BALCONIES (2026-06-24) — emit projecting balconies. Default ON (absent ⇒ ON). Threaded
     *  to the executor; the balcony pass is gated on it. */
    readonly balconies?: boolean;
    /** §RESI-FACADE-COLOUR (2026-06-24) — building finish colour (hex `#rrggbb`). Painted on the
     *  opaque shell / core / cell walls + roof by the executor; glazing keeps its defaults. */
    readonly facadeColor?: string;
    /** §RESI-GROUND-COMMERCIAL-CURTAIN (2026-06-24) — ground shopfront style. Default false ⇒ solid
     *  shell + big commercial windows; true ⇒ the curtain-wall shopfront. */
    readonly groundCommercialCurtain?: boolean;
    /**
     * §GEN-FACADE-OPENINGS (L-11080 · C108 Milestone 2, L-11006) — the opening lattice MEASURED
     * from an attached photograph: bays, bands, per-cell size FRACTIONS and a CONTINUOUS archness.
     *
     * ⛔ NOT A LENGTH ANYWHERE (C108 §2.2, L-11009). The building's size still comes from the
     * footprint; the photograph supplies proportions and counts only. Absent on every request that
     * carried no photo, and the whole façade path is then byte-identical to before.
     */
    readonly facadeOpeningProgram?: FacadeOpeningProgram;
}

export interface ResidentialBuildingRequestResult {
    readonly ok: boolean;
    readonly reason?: string;
    /** Total apartments the preview placed (for logging/tests). */
    readonly apartmentCount?: number;
    /** §GEN-CHAT (RAC U5b.2/U5b.4) — the engine-honesty lines the auto-build
     *  path produces (floors, apartments per floor, fill ratio, per-cell
     *  rejects). Absent on the modal path — the modal IS that report there. */
    readonly report?: readonly string[];
}

/** §GEN-CHAT (RAC U5b.2) — controller request options. */
export interface ResidentialBuildingRequestOptions {
    /** Skip the preview modal and BUILD the computed result directly (the chat
     *  path — its Confirm card already stood in for the modal). Refusals are
     *  returned as {ok:false, reason} instead of opening the error modal. */
    readonly autoBuild?: boolean;
}

/**
 * Read the active level's drawn shell into a closed footprint polygon (metres,
 * plan XZ). Mirrors how the house flow reads its footprint from the wall store.
 * NOTE: this convenience reader returns the union AABB of the shell-wall endpoints
 * (an axis-aligned rectangle). The orchestrator now accepts ANY (incl. rotated)
 * polygon via §RESI-RIGID-TRANSFORM, so the founder's ROTATED parcel flows through
 * the `footprint` request field (the from-boundary path passes the real drawn
 * polygon); this AABB reader is only the no-explicit-footprint fallback. Returns
 * null when there are < 3 walls on the level.
 */
export function readActiveFootprint(levelId: string): ReadonlyArray<{ x: number; z: number }> | null {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getAll?(): WallRecord[] } | undefined;
    const all = wallStore?.getAll?.() ?? [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let n = 0;
    for (const w of all) {
        if (w.levelId !== levelId) continue;
        const bl = w.baseLine;
        if (!bl || bl.length < 2) continue;
        for (const p of bl) {
            if (!p) continue;
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
        }
        n++;
    }
    if (n < 3 || !(maxX > minX) || !(maxZ > minZ)) return null;
    // CCW ring starting at (minX,minZ) — the orchestrator's `isAxisAlignedRect` form.
    return [
        { x: minX, z: minZ },
        { x: maxX, z: minZ },
        { x: maxX, z: maxZ },
        { x: minX, z: maxZ },
    ];
}

/**
 * Build the orchestrator input from a request + a resolved footprint + base
 * elevation. Pure (no store reads) so it is unit-testable. Applies sensible
 * defaults for any omitted dimension.
 */
export function buildOrchestratorInput(
    req: ResidentialBuildingRequest,
    footprint: ReadonlyArray<{ x: number; z: number }>,
    baseElevationM: number,
): ResidentialBuildingOrchestratorInput {
    const minApartmentAreaM2 = req.minApartmentAreaM2 && req.minApartmentAreaM2 > 0 ? req.minApartmentAreaM2 : DEFAULT_MIN_APT_M2;
    const maxApartmentAreaM2 = req.maxApartmentAreaM2 && req.maxApartmentAreaM2 >= minApartmentAreaM2 ? req.maxApartmentAreaM2 : Math.max(DEFAULT_MAX_APT_M2, minApartmentAreaM2);
    return {
        footprint,
        upperLevels: Math.max(1, Math.min(20, Math.floor(req.upperLevels || 1))),
        coreWidthM: req.coreWidthM && req.coreWidthM > 0 ? req.coreWidthM : DEFAULT_CORE_WIDTH_M,
        coreDepthM: req.coreDepthM && req.coreDepthM > 0 ? req.coreDepthM : DEFAULT_CORE_DEPTH_M,
        corridorWidthM: req.corridorWidthM && req.corridorWidthM > 0 ? req.corridorWidthM : DEFAULT_CORRIDOR_WIDTH_M,
        minApartmentAreaM2,
        maxApartmentAreaM2,
        typologies: {
            T1: req.typologies.T1 === true,
            T2: req.typologies.T2 === true,
            T3: req.typologies.T3 === true,
            T4: req.typologies.T4 === true,
        },
        floorToFloorM: req.floorToFloorM && req.floorToFloorM > 0 ? req.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M,
        baseElevationM,
        ...(typeof req.siteLatitudeDeg === 'number' ? { solar: { latDeg: req.siteLatitudeDeg } } : {}),
    };
}

/** Count placed apartments across all floors of an OK result. Pure. */
export function countPlacedApartments(result: ResidentialBuildingOk): number {
    let n = 0;
    for (const lvl of result.perLevelApartments) {
        for (const a of lvl.apartments) if (a.status === 'ok') n++;
    }
    return n;
}

/**
 * §RESI-ZERO-APARTMENTS-REFUSE (founder 2026-08-10: "sometimes no apartments are created at
 * all") — summarize the per-cell soft-fail reasons of an OK orchestrator result whose cells
 * ALL rejected. The orchestrator returns `status:'ok'` whenever the partition PLACED cells,
 * even when every per-cell D-TGL run then soft-failed (`PlacedApartment.status:'rejected'`)
 * — so `countPlacedApartments === 0` on an 'ok' result is exactly the "empty building"
 * failure mode. Per §CONTEXT-DATA-HONESTY a refusal must be VISIBLE with a reason, never an
 * empty shell — this helper builds that reason from what the engine actually said. Pure.
 */
export function summarizeCellRejections(result: ResidentialBuildingOk): {
    /** Total apartment cells across all floors. */
    readonly total: number;
    /** How many of them soft-failed (`status:'rejected'`). */
    readonly rejected: number;
    /** The most common per-cell `rejectReason` (undefined when none carried one). */
    readonly topReason?: string;
} {
    let total = 0, rejected = 0;
    const byReason = new Map<string, number>();
    for (const lvl of result.perLevelApartments) {
        for (const a of lvl.apartments) {
            total++;
            if (a.status !== 'rejected') continue;
            rejected++;
            const r = (a.rejectReason ?? '').trim();
            if (r) byReason.set(r, (byReason.get(r) ?? 0) + 1);
        }
    }
    let topReason: string | undefined;
    let topCount = 0;
    for (const [r, n] of byReason) {
        if (n > topCount) { topCount = n; topReason = r; }
    }
    return { total, rejected, ...(topReason !== undefined ? { topReason } : {}) };
}

/**
 * §GEN-CHAT (RAC U5b.4) — the engine-honesty lines for the chat transcript.
 * Pure over the orchestrator result: floors, apartments per floor, the
 * §RESI-CORRIDOR-ECONOMY fill ratio ("apartments NN% of plate"), and the
 * per-cell rejects with the engine's own most-common reason (never invented).
 */
export function buildResidentialHonestyReport(
    result: ResidentialBuildingOk,
    apartmentCount: number,
): string[] {
    const floors = result.levels.length;
    const aptLevels = result.perLevelApartments.length;
    const perFloor = aptLevels > 0 ? Math.round((apartmentCount / aptLevels) * 10) / 10 : 0;
    const fills = result.perLevelApartments
        .map((l) => l.fillRatio)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const fillLabel = fills.length > 0
        ? ` (apartments ${Math.round((fills.reduce((a, b) => a + b, 0) / fills.length) * 100)}% of the plate)`
        : '';
    const lines: string[] = [
        `Built ${floors} floor${floors === 1 ? '' : 's'} — ${apartmentCount} apartment${apartmentCount === 1 ? '' : 's'}, ` +
        `${perFloor} per apartment floor on average${fillLabel}.`,
    ];
    // §RESI-SINGLE-CORE-LANDING (ADR-0372, L-11190) — name the typology when it is NOT the corridor
    // one, so a landing is never read as a corridor; and explain any bay it could not assign
    // (§CONTEXT-DATA-HONESTY: stranded floor area is said out loud, never drawn as white space).
    if (result.circulationTypology === 'single-core-landing') {
        lines.push(
            'Small-plate typology: one compact stair/lift core in a rear corner with a landing in front of it — ' +
            'no corridor; each apartment’s front door opens straight off the landing.',
        );
    }
    const strandedReasons = new Set<string>();
    for (const level of result.perLevelApartments) {
        if (level.stranded) strandedReasons.add(level.stranded.reason);
    }
    for (const reason of strandedReasons) {
        lines.push(`On each apartment floor ${reason}.`);
    }
    const s = summarizeCellRejections(result);
    if (s.rejected > 0) {
        lines.push(
            `${s.rejected} of ${s.total} apartment cell${s.total === 1 ? '' : 's'} rejected by the engine` +
            `${s.topReason !== undefined ? ` — most common: ${s.topReason}` : ''}.`,
        );
    }
    return lines;
}

/**
 * Drives the "Choose a residential building" modal. Owns the modal + executor
 * singletons. Stateless between runs apart from those singletons.
 */
export class ResidentialBuildingController {
    private readonly modal = new ResidentialBuildingModal();
    private readonly executor = new ResidentialBuildingExecutor();
    private _pending: {
        runtime: PryzmRuntime;
        result: ResidentialBuildingOk;
        floorToFloorM: number;
        roofGarden: boolean;
        balconies: boolean;
        facadeColor?: string;
        groundCommercialCurtain: boolean;
    } | null = null;

    /**
     * Compute the building for the active shell + open the modal. On Build, build
     * it via the executor. Never throws — returns {ok,reason}. P8: one span at this
     * exported boundary.
     */
    async request(
        runtime: PryzmRuntime,
        req: ResidentialBuildingRequest,
        opts?: ResidentialBuildingRequestOptions,
    ): Promise<ResidentialBuildingRequestResult> {
        return _tracer.startActiveSpan('pryzm.editor.residentialBuilding.request', async (span) => {
            try {
                const out = await this._request(runtime, req, opts);
                span.setAttribute('pryzm.resi.request.ok', out.ok);
                if (typeof out.apartmentCount === 'number') span.setAttribute('pryzm.resi.request.apartments', out.apartmentCount);
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    private async _request(
        runtime: PryzmRuntime,
        req: ResidentialBuildingRequest,
        opts?: ResidentialBuildingRequestOptions,
    ): Promise<ResidentialBuildingRequestResult> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };
        // §GEN-CHAT (RAC U5b.2) — headless mode: the chat's Confirm card stood
        // in for the preview modal, and its transcript renders the refusal, so
        // neither the preview modal nor the error modal opens on this path.
        const autoBuild = opts?.autoBuild === true;

        const ground = resolveActiveLevel();
        if (!ground?.id) { toast('No active level — draw a boundary first.', 'error'); return { ok: false, reason: 'no active level' }; }

        const footprint = req.footprint && req.footprint.length >= 3
            ? req.footprint
            : readActiveFootprint(ground.id);
        if (!footprint) { toast('Need a closed exterior shell (≥3 walls) on the active level.', 'error'); return { ok: false, reason: 'no footprint' }; }

        const enabled = req.typologies.T1 || req.typologies.T2 || req.typologies.T3 || req.typologies.T4;
        if (!enabled) { toast('Enable at least one apartment typology (T1–T4).', 'error'); return { ok: false, reason: 'no typology enabled' }; }

        const baseElevationM = ground.elevation ?? 0;
        const input = buildOrchestratorInput(req, footprint, baseElevationM);
        const areaM2 = polygonAreaM2(footprint);

        // §GEN-MAXHEIGHT-GATE (audit P0-2 / RAC U5b.3, C58) — enforce the parcel's resolved
        // height cap BEFORE running the orchestrator: total storeys = ground + upperLevels.
        // `getMaxHeightM()` returns null when no cap is recorded (§CONTEXT-DATA-HONESTY —
        // proceed, say nothing false; null is NEVER 0 or ∞). A refusal routes through the
        // SAME friendly error modal as a hard reject, quoting BOTH numbers + the feasible
        // floor count (the §RESI-ZERO-APARTMENTS-REFUSE pattern).
        const heightGate = checkMaxHeightGate({
            floors: (input.upperLevels ?? 1) + 1,
            floorToFloorM: input.floorToFloorM ?? DEFAULT_FLOOR_TO_FLOOR_M,
            maxHeightM: siteQueryService.getMaxHeightM(),
        });
        if (!heightGate.ok) {
            // §REFUSAL-IDENTITY (C58 §1.13) — the code reaches the error modal (which now
            // stamps it as `data-refusal-kind`) and the caller's `reason` alike.
            const refusalText = maxHeightRefusalText(heightGate);
            console.warn('[resi-building] controller: §GEN-MAXHEIGHT-GATE refused —', heightGate.code, refusalText);
            if (!autoBuild) this._showReject(refusalText, areaM2);
            return { ok: false, reason: refusalText };
        }

        let result: ResidentialBuildingResult;
        try {
            result = orchestrateResidentialBuilding(input);
        } catch (err) {
            console.error('[resi-building] orchestrator threw:', err);
            if (!autoBuild) this._showReject(String(err), areaM2);
            return { ok: false, reason: String(err) };
        }

        if (result.status === 'rejected') {
            console.warn('[resi-building] controller: rejected —', result.reason);
            if (!autoBuild) this._showReject(result.reason, areaM2);
            return { ok: false, reason: result.reason };
        }

        const apartmentCount = countPlacedApartments(result);
        // §RESI-ZERO-APARTMENTS-REFUSE (founder 2026-08-10) — the orchestrator says 'ok' when the
        // partition PLACED cells, even if every per-cell D-TGL layout then soft-failed. Building
        // that result produces the founder's "empty building": a full shell + core + corridors
        // with ZERO apartments (the executor silently skips rejected cells). A refusal must be
        // VISIBLE with the engine's real reason (§CONTEXT-DATA-HONESTY), never an empty shell —
        // so route the all-cells-rejected case to the SAME error modal a hard reject uses, and
        // never open the Build modal on a building with nothing in it.
        if (apartmentCount === 0) {
            const s = summarizeCellRejections(result);
            const reason =
                `all ${s.total} apartment cell(s) failed to lay out` +
                (s.topReason ? ` (most common: ${s.topReason})` : '');
            console.warn('[resi-building] controller: zero apartments laid out —', reason);
            if (!autoBuild) this._showReject(reason, areaM2);
            return { ok: false, reason, apartmentCount: 0 };
        }
        console.log(
            `[resi-building] controller: computed building — ${result.levels.length} floor(s), ` +
            `${apartmentCount} apartment(s) placed — ${autoBuild ? 'auto-building (chat path)' : 'opening modal'}. ${result.diagnostic}`,
        );

        // §GEN-CHAT (RAC U5b.2) — the headless build: the SAME executor call the
        // modal's Build button makes (no second pipeline); the executor opens the
        // beginBuildingGeneration lease itself, so undo coalesces identically.
        if (autoBuild) {
            toast('Building residential building…', 'info');
            const execResult = await this.executor.execute(runtime, result, {
                floorToFloorM: input.floorToFloorM ?? DEFAULT_FLOOR_TO_FLOOR_M,
                roofGarden: req.roofGarden === true,
                balconies: req.balconies !== false,
                ...(typeof req.facadeColor === 'string' ? { facadeColor: req.facadeColor } : {}),
                groundCommercialCurtain: req.groundCommercialCurtain === true,
                // §GEN-FACADE-OPENINGS (L-11080) — the photograph's lattice reaches the executor
                // ONLY on this headless (chat) path: the preview modal has no photograph to carry.
                ...(req.facadeOpeningProgram !== undefined ? { facadeOpeningProgram: req.facadeOpeningProgram } : {}),
            });
            if (!execResult.ok) {
                return { ok: false, reason: execResult.reason ?? 'the build executor refused', apartmentCount };
            }
            // §GEN-FACADE-OPENINGS (L-11080) — the façade lines ride the SAME honesty report the
            // rest of the build uses. ⛔ What the photograph asked for and the generator could not
            // build is on the persistent transcript, not only on the Confirm card.
            const report = [
                ...buildResidentialHonestyReport(result, apartmentCount),
                ...(execResult.facadeNotes ?? []),
            ];
            return { ok: true, apartmentCount, report };
        }

        this._pending = {
            runtime,
            result,
            floorToFloorM: input.floorToFloorM ?? DEFAULT_FLOOR_TO_FLOOR_M,
            roofGarden: req.roofGarden === true,
            // §RESI-BALCONIES — default ON (absent ⇒ true).
            balconies: req.balconies !== false,
            ...(typeof req.facadeColor === 'string' ? { facadeColor: req.facadeColor } : {}),
            // §RESI-GROUND-COMMERCIAL-CURTAIN — default false (solid shell + big windows).
            groundCommercialCurtain: req.groundCommercialCurtain === true,
        };
        this.modal.show(result, {
            onBuild: () => this._build(),
            onCancel: () => { console.log('[resi-building] controller: modal cancelled (no scene mutation)'); this._pending = null; },
        });
        return { ok: true, apartmentCount };
    }

    /** Surface a reject/soft-fail as a clear, palette-compliant ERROR MODAL (the
     *  brand `alm-*` shell + the established error token) instead of a transient
     *  toast: title + friendly reason + actionable guidance, with the user's actual
     *  plot area woven in when known. P3/P6: no scene mutation — display only. */
    private _showReject(reason: string | undefined, areaM2?: number): void {
        const err = friendlyResidentialError(reason, areaM2);
        this.modal.showError(err, {
            onDismiss: () => { console.log('[resi-building] controller: error modal dismissed —', err.kind); },
        });
    }

    private _build(): void {
        const p = this._pending;
        if (!p) return;
        console.log('[resi-building] controller: Build pressed → executor');
        p.runtime.events?.emit('pryzm:toast', { message: 'Building residential building…', severity: 'info' });
        void this.executor.execute(p.runtime, p.result, {
            floorToFloorM: p.floorToFloorM,
            roofGarden: p.roofGarden,
            balconies: p.balconies,
            ...(p.facadeColor ? { facadeColor: p.facadeColor } : {}),
            groundCommercialCurtain: p.groundCommercialCurtain,
        });
        this._pending = null;
    }
}
