// Office building — controller wiring the "Set up your office building" modal.
//
// The SIBLING of ResidentialBuildingController, but an office tower is generated
// from a RADIUS (circular plate) + storey count, so it does NOT require a drawn
// boundary: the radius comes from the request (or is derived from a drawn shell's
// bbox when one exists). It:
//   1. runs the PURE `orchestrateOfficeBuilding(...)` to compute the tower,
//   2. on a feasible result opens the modal (circular plate preview + analytics),
//   3. on Build, invokes `OfficeBuildingExecutor.execute(...)` (one runBatch),
//   4. on Cancel, dismisses (no scene mutation happened yet).
//
// P3/P6/P8: the controller performs NO scene mutation itself — the EXECUTOR owns all
// mutation through the command bus. GATED behind `globalThis.__PRYZM_OFFICE_BUILDING__`.

import { trace } from '@opentelemetry/api';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    orchestrateOfficeBuilding,
    type OfficeBuildingResult,
    type OfficeBuildingOk,
    type DeskMode,
    type WorkplaceCulture,
} from '@pryzm/ai-host';
import { storeRegistry } from '@pryzm/core-app-model';
import { siteQueryService } from '@pryzm/stores';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { checkMaxHeightGate, maxHeightRefusalText } from '../generation/maxHeightGate.js';
import { OfficeBuildingModal } from './OfficeBuildingModal.js';
import { OfficeBuildingExecutor } from './OfficeBuildingExecutor.js';

const _tracer = trace.getTracer('@pryzm/editor', '0.1.0');

const DEFAULT_RADIUS_M = 22;
const DEFAULT_FLOOR_TO_FLOOR_M = 4.0;

/** The user inputs the office feature needs. */
export interface OfficeBuildingRequest {
    /** Storeys (1..60; demo uses 40). */
    readonly stories: number;
    /** Circular plate radius (m). When omitted, derived from a drawn shell or default. */
    readonly radiusM?: number;
    readonly floorToFloorM?: number;
    readonly deskDensityPer1000Sqft?: number;
    readonly deskMode?: DeskMode;
    readonly culture?: WorkplaceCulture;
    readonly mechanicalEveryN?: number;
    /** §OFFICE-FACADE-GLASS-COLOUR — opaque façade finish colour (hex `#rrggbb`). Default white. */
    readonly facadeColor?: string;
    /** §OFFICE-FACADE-GLASS-COLOUR — glass tint for curtain-wall glazing + glazed offices (hex). */
    readonly glassColor?: string;
    /** §OFFICE-INNER-WALL-COLOUR — interior partition-wall finish colour (hex `#rrggbb`). Default
     *  keeps the current partition look (absent ⇒ undefined). */
    readonly innerWallColor?: string;
}

export interface OfficeBuildingRequestResult {
    readonly ok: boolean;
    readonly reason?: string;
    readonly deskCount?: number;
    /** §GEN-CHAT (RAC U5b.4) — the ENGINE's own account of what it built, for
     *  the chat transcript: as-built storeys + desks, plus the orchestrator's
     *  auto-fit notes verbatim (the plate it had to resize and why). Set on the
     *  `buildDirect` path only — on the modal path the modal is that report. */
    readonly report?: readonly string[];
}

interface WallRecord { id: string; levelId: string; baseLine?: ReadonlyArray<{ x: number; z: number }>; }

/** Derive a circular-plate radius (m) from the active level's drawn shell bbox
 *  (half the shorter side ≈ inscribed circle). Returns null with < 3 walls. */
export function deriveRadiusFromShell(levelId: string): number | null {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getAll?(): WallRecord[] } | undefined;
    const all = wallStore?.getAll?.() ?? [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, n = 0;
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
    return Math.min(maxX - minX, maxZ - minZ) / 2;
}

/** Drives the office-building modal. Owns the modal + executor singletons. */
export class OfficeBuildingController {
    private readonly modal = new OfficeBuildingModal();
    private readonly executor = new OfficeBuildingExecutor();
    private _pending: { runtime: PryzmRuntime; result: OfficeBuildingOk; facadeColor?: string; glassColor?: string; innerWallColor?: string } | null = null;

    async request(runtime: PryzmRuntime, req: OfficeBuildingRequest): Promise<OfficeBuildingRequestResult> {
        return _tracer.startActiveSpan('pryzm.editor.officeBuilding.request', async (span) => {
            try {
                const out = await this._request(runtime, req);
                span.setAttribute('pryzm.office.request.ok', out.ok);
                if (typeof out.deskCount === 'number') span.setAttribute('pryzm.office.request.desks', out.deskCount);
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    private async _request(runtime: PryzmRuntime, req: OfficeBuildingRequest): Promise<OfficeBuildingRequestResult> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };

        // Radius: explicit request → drawn shell → default. (No boundary required for
        // a circular tower — the radius drives the plate directly.)
        const active = resolveActiveLevel();
        const derived = active?.id ? deriveRadiusFromShell(active.id) : null;
        const radiusM = req.radiusM && req.radiusM > 0 ? req.radiusM : (derived && derived > 8 ? derived : DEFAULT_RADIUS_M);

        // §GEN-MAXHEIGHT-GATE (audit P0-2 / RAC U5b.3, C58) — enforce the parcel's resolved
        // height cap BEFORE running the orchestrator. null = no cap recorded ⇒ proceed
        // silently (§CONTEXT-DATA-HONESTY). Refusal rides the office flow's EXISTING honesty
        // seam: the error modal, quoting BOTH numbers + the feasible storey count.
        const heightGate = checkMaxHeightGate({
            floors: Math.max(1, Math.floor(req.stories || 1)),
            floorToFloorM: req.floorToFloorM && req.floorToFloorM > 0 ? req.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M,
            maxHeightM: siteQueryService.getMaxHeightM(),
        });
        if (!heightGate.ok) {
            // §REFUSAL-IDENTITY (C58 §1.13) — the code travels into the error modal.
            const refusalText = maxHeightRefusalText(heightGate);
            console.warn('[office-building] controller: §GEN-MAXHEIGHT-GATE refused —', heightGate.code, refusalText);
            this.modal.showError(refusalText, () => { console.log('[office-building] height-gate error dismissed'); });
            return { ok: false, reason: refusalText };
        }

        const result: OfficeBuildingResult = orchestrateOfficeBuilding({
            radiusM,
            stories: req.stories,
            floorToFloorM: req.floorToFloorM && req.floorToFloorM > 0 ? req.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M,
            baseElevationM: active?.elevation ?? 0,
            ...(typeof req.deskDensityPer1000Sqft === 'number' ? { deskDensityPer1000Sqft: req.deskDensityPer1000Sqft } : {}),
            ...(req.deskMode ? { deskMode: req.deskMode } : {}),
            ...(req.culture ? { culture: req.culture } : {}),
            ...(typeof req.mechanicalEveryN === 'number' ? { mechanicalEveryN: req.mechanicalEveryN } : {}),
        });

        if (result.status === 'rejected') {
            console.warn('[office-building] controller: rejected —', result.reason);
            this.modal.showError(result.reason, () => { console.log('[office-building] error dismissed'); });
            return { ok: false, reason: result.reason };
        }

        console.log(
            `[office-building] controller: computed ${result.stories}-storey tower — ` +
            `${result.analytics.totalDesks} desks across ${result.analytics.officeFloors} office floors. ${result.diagnostic}`,
        );
        toast(`Office tower ready — ${result.stories} storeys, ${result.analytics.totalDesks} desks.`, 'info');

        // §OFFICE-FACADE-GLASS-COLOUR — stash the façade + glass colours so the Build handler can
        // pass them to the executor's paint pass.
        this._pending = { runtime, result, facadeColor: req.facadeColor, glassColor: req.glassColor, innerWallColor: req.innerWallColor };
        this.modal.show(result, {
            onBuild: () => this._build(),
            onCancel: () => { console.log('[office-building] controller: modal cancelled (no scene mutation)'); this._pending = null; },
        });
        return { ok: true, deskCount: result.analytics.totalDesks };
    }

    private _build(): void {
        const p = this._pending;
        if (!p) return;
        console.log('[office-building] controller: Build pressed → executor');
        p.runtime.events?.emit('pryzm:toast', { message: 'Building office tower…', severity: 'info' });
        void this.executor.execute(p.runtime, p.result, { facadeColor: p.facadeColor, glassColor: p.glassColor, innerWallColor: p.innerWallColor });
        this._pending = null;
    }

    /**
     * §OFFICE-PREVIEW-STEP — orchestrate + BUILD in one call, WITHOUT opening the modal.
     * The onboarding office SETUP step already previewed the tower (plate + analytics +
     * Build button), so the modal would be a redundant second preview. This runs the same
     * PURE orchestrator (which ALWAYS auto-fits / never hard-rejects per Task A) and goes
     * straight to the executor. Reports the as-built desk count. P8: own span.
     */
    async buildDirect(
        runtime: PryzmRuntime,
        req: OfficeBuildingRequest,
        opts?: { withInterior?: boolean },
    ): Promise<OfficeBuildingRequestResult> {
        return _tracer.startActiveSpan('pryzm.editor.officeBuilding.buildDirect', async (span) => {
            try {
                const active = resolveActiveLevel();
                const derived = active?.id ? deriveRadiusFromShell(active.id) : null;
                const radiusM = req.radiusM && req.radiusM > 0 ? req.radiusM : (derived && derived > 8 ? derived : DEFAULT_RADIUS_M);
                // §GEN-MAXHEIGHT-GATE — the direct (no-modal) path enforces the SAME cap; the
                // refusal surfaces on this path's existing honesty seam (the toast).
                const heightGate = checkMaxHeightGate({
                    floors: Math.max(1, Math.floor(req.stories || 1)),
                    floorToFloorM: req.floorToFloorM && req.floorToFloorM > 0 ? req.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M,
                    maxHeightM: siteQueryService.getMaxHeightM(),
                });
                if (!heightGate.ok) {
                    // §REFUSAL-IDENTITY (C58 §1.13) — code in the toast AND in the return.
                    const refusalText = maxHeightRefusalText(heightGate);
                    console.warn('[office-building] buildDirect: §GEN-MAXHEIGHT-GATE refused —', heightGate.code, refusalText);
                    runtime.events?.emit('pryzm:toast', { message: `Office: ${refusalText}`, severity: 'error' });
                    span.setAttribute('pryzm.office.buildDirect.ok', false);
                    span.setAttribute('pryzm.office.buildDirect.refusalCode', heightGate.code);
                    span.end();
                    return { ok: false, reason: refusalText };
                }
                const result: OfficeBuildingResult = orchestrateOfficeBuilding({
                    radiusM,
                    stories: req.stories,
                    floorToFloorM: req.floorToFloorM && req.floorToFloorM > 0 ? req.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M,
                    baseElevationM: active?.elevation ?? 0,
                    ...(typeof req.deskDensityPer1000Sqft === 'number' ? { deskDensityPer1000Sqft: req.deskDensityPer1000Sqft } : {}),
                    ...(req.deskMode ? { deskMode: req.deskMode } : {}),
                    ...(req.culture ? { culture: req.culture } : {}),
                    ...(typeof req.mechanicalEveryN === 'number' ? { mechanicalEveryN: req.mechanicalEveryN } : {}),
                });
                if (result.status === 'rejected') {
                    // Task A makes this near-impossible (only a non-finite radius), but never block.
                    console.warn('[office-building] buildDirect: orchestrator rejected —', result.reason);
                    runtime.events?.emit('pryzm:toast', { message: `Office: ${result.reason}`, severity: 'warn' });
                    span.setAttribute('pryzm.office.buildDirect.ok', false);
                    span.end();
                    return { ok: false, reason: result.reason };
                }
                console.log(
                    `[office-building] buildDirect → ${result.stories}-storey tower ` +
                    `(${result.analytics.totalDesks} desks). ${result.diagnostic}`,
                );
                if (result.autoFit.notes.length > 0) {
                    runtime.events?.emit('pryzm:toast', { message: result.autoFit.notes[0]!, severity: 'info' });
                }
                await this.executor.execute(runtime, result, {
                    withInterior: opts?.withInterior === true,
                    facadeColor: req.facadeColor,
                    glassColor: req.glassColor,
                    innerWallColor: req.innerWallColor,
                });
                span.setAttribute('pryzm.office.buildDirect.ok', true);
                span.setAttribute('pryzm.office.buildDirect.withInterior', opts?.withInterior === true);
                span.setAttribute('pryzm.office.buildDirect.desks', result.analytics.totalDesks);
                span.end();
                // §GEN-CHAT (RAC U5b.4) — the engine's own numbers, not a
                // restatement of what was asked for: `result.stories` is what
                // was BUILT and `autoFit.notes` are the orchestrator's own
                // words about anything it had to change to make it fit.
                return {
                    ok: true,
                    deskCount: result.analytics.totalDesks,
                    report: [
                        `Built a ${result.stories}-storey office tower on a ${radiusM.toFixed(1)} m-radius plate — ` +
                        `${result.analytics.totalDesks} desks.`,
                        ...result.autoFit.notes,
                    ],
                };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }
}
