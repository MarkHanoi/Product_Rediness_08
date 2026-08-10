// §GEN-CHAT-SEAM (RAC U5b.2 / U5b.4) — the ONE place a chat sentence becomes a
// real generation run.
//
// WHAT THIS IS NOT
// ----------------
// It is NOT a second generation pipeline. Every arm below maps the chat payload
// through the U5b.1 typed `GenerationRequest` seam (`generationRequest.ts`, the
// SAME mappers the onboarding wizard's generate switch uses) and then calls the
// SAME controller entry point the onboarding modal calls:
//
//   residential-building → ResidentialBuildingController.request(…, {autoBuild})
//   house               → generateHouseFromBoundary(…, {autoBuild})
//                          → HouseLayoutController.buildDirect
//   office              → OfficeBuildingController.buildDirect
//   apartment           → generateApartmentLayoutForChat → the shared
//                          apartment-layout trigger (AI-panel leaf + console)
//
// Each of those executors opens the `beginBuildingGeneration` lease itself, so
// the whole build coalesces into ONE undo entry and §GEN-VIEW-COALESCE applies
// exactly as it does on the modal path. This module adds no mutation of its own.
//
// U5b.4 — ENGINE HONESTY. Nothing here invents a number. Every line put on the
// transcript comes from the executor's own reporting: the residential floors /
// apartments-per-floor / plate-fill ratio and per-cell rejects
// (`buildResidentialHonestyReport`), the house's scored-variant + room counts
// (`HouseLayoutController.buildDirect`), the office's as-built desk count, and
// the REFUSALS verbatim — §GEN-MAXHEIGHT-GATE (8bb9dac8) quoting both the
// requested and permitted heights, §RESI-ZERO-APARTMENTS-REFUSE quoting the
// engine's own most-common cell-reject reason. Those are emitted on
// 'pryzm-generation-report' BEFORE the promise resolves, so
// ZeroTokenChatBridge's report listener (attached for the duration of the
// dispatch, the same mechanism the batch commands already use) renders them
// instead of a generic "Done".

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { houseRequestFromBrief, officeRequestFromBrief, residentialGenerationFromBrief } from './generationRequest.js';

/** The `generation.building` payload the resolver emits (§GEN-CHAT). */
export interface GenerationBuildingPayload {
    readonly typology?: 'residential-building' | 'house' | 'office';
    /** TOTAL storeys asked for (ground included), or absent for the default. */
    readonly floors?: number;
    readonly typologies?: { readonly T1?: boolean; readonly T2?: boolean; readonly T3?: boolean; readonly T4?: boolean };
    readonly roofKind?: 'flat' | 'gable' | 'hip';
}

/** The `generation.apartment` payload the resolver emits (§GEN-CHAT-APARTMENT). */
export interface GenerationApartmentPayload {
    readonly bedrooms?: number;
    readonly bathrooms?: number;
    readonly masterEnSuite?: boolean;
    readonly openPlanKitchenDining?: boolean;
}

const REPORT_EVENT = 'pryzm-generation-report';

/** Put the engine's own words on the chat transcript. `success:false` makes the
 *  bridge render "Nothing was changed — <reason>", which is the whole point:
 *  a refusal must never read like a build. */
function emitReport(success: boolean, info: readonly string[]): void {
    try {
        window.dispatchEvent(new CustomEvent(REPORT_EVENT, { detail: { success, info: [...info] } }));
    } catch (err) {
        console.warn('[gen-chat-seam] report emit failed (non-fatal):', err);
    }
}

function resolveRuntime(): PryzmRuntime | undefined {
    return (window.runtime as unknown as PryzmRuntime | undefined) ?? undefined;
}

/**
 * Read the parcel boundary the generators build within — the C58
 * buildable-envelope ring when one is cached (COMPLIANT BY CONSTRUCTION), else
 * the raw parcel. The SAME read `residentialFromBoundary` /
 * `houseFromBoundary` perform, so the chat cannot build on a different
 * footprint than the onboarding wizard would.
 */
async function readSiteFootprint(rt: PryzmRuntime): Promise<{ x: number; z: number }[]> {
    const polygon = rt.siteModelStore?.getParcelBoundary()?.polygon ?? [];
    const { resolveBuildableFootprint } = await import('../site/siteDispatch.js');
    const { polygon: usable } = resolveBuildableFootprint(polygon);
    const pts = usable.map((p) => ({ x: p.x, z: p.z }));
    // Drop a trailing duplicate of the first point (a closed ring) so a
    // zero-length edge never reaches an orchestrator.
    if (pts.length >= 2) {
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) pts.pop();
    }
    return pts;
}

// ─── The residential arm ─────────────────────────────────────────────────────

/** One controller instance for the chat's headless path. Deliberately NOT a
 *  second pipeline: it is the SAME class, holding the SAME executor, and the
 *  `autoBuild` path never opens the preview modal, so the instance carries no
 *  cross-run state at all (`ResidentialBuildingModal`'s constructor is inert —
 *  it builds no DOM until `show()`). Reusing the modal path's private singleton
 *  would mean exporting it from a file another agent owns for no behavioural
 *  gain. */
let _resiController: import('../residential-building/ResidentialBuildingController.js').ResidentialBuildingController | null = null;

async function runResidential(rt: PryzmRuntime, cmd: GenerationBuildingPayload): Promise<void> {
    const footprint = await readSiteFootprint(rt);
    if (footprint.length < 3) {
        emitReport(false, ['there is no site boundary to build on — draw a plot first, then ask again.']);
        return;
    }
    // TOTAL storeys → the request's UPPER-level count (ground is always level 0
    // and always additional). The resolver already refused < 2 and > 21, so this
    // lands inside `residentialRequestFromBrief`'s own [1,20] clamp.
    const md: Record<string, unknown> = {};
    if (typeof cmd.floors === 'number') md['floors'] = Math.max(1, cmd.floors - 1);
    if (cmd.typologies !== undefined) {
        md['T1'] = cmd.typologies.T1 === true;
        md['T2'] = cmd.typologies.T2 === true;
        md['T3'] = cmd.typologies.T3 === true;
        md['T4'] = cmd.typologies.T4 === true;
    }
    const { request } = residentialGenerationFromBrief(md, footprint);

    const { ResidentialBuildingController } = await import('../residential-building/ResidentialBuildingController.js');
    _resiController ??= new ResidentialBuildingController();
    const res = await _resiController.request(rt, request, { autoBuild: true });
    if (!res.ok) {
        // §GEN-MAXHEIGHT-GATE / §RESI-ZERO-APARTMENTS-REFUSE / orchestrator
        // rejects — the engine's own sentence, unedited.
        emitReport(false, [res.reason ?? 'the residential generator refused without a reason']);
        return;
    }
    const lines = res.report !== undefined && res.report.length > 0
        ? [...res.report]
        : [`Built the residential building (${res.apartmentCount ?? 0} apartments).`];
    emitReport(true, lines);
}

// ─── The house arm ───────────────────────────────────────────────────────────

async function runHouse(rt: PryzmRuntime, cmd: GenerationBuildingPayload): Promise<void> {
    const md: Record<string, unknown> = {};
    if (typeof cmd.floors === 'number') md['floors'] = cmd.floors;
    if (cmd.roofKind !== undefined) md['roofKind'] = cmd.roofKind;
    const { storeyCount, options } = houseRequestFromBrief(md);

    const { generateHouseFromBoundary } = await import('../house-layout/houseFromBoundary.js');
    const res = await generateHouseFromBoundary(rt, storeyCount, { ...options, autoBuild: true });
    if (!res.ok) {
        emitReport(false, [res.reason ?? 'the house generator refused without a reason']);
        return;
    }
    const lines = res.report !== undefined && res.report.length > 0
        ? [...res.report]
        : [`Built the ${storeyCount}-storey house.`];
    emitReport(true, lines);
}

// ─── The office arm ──────────────────────────────────────────────────────────

async function runOffice(rt: PryzmRuntime, cmd: GenerationBuildingPayload): Promise<void> {
    const footprint = await readSiteFootprint(rt);
    const md: Record<string, unknown> = {};
    // The office mapper's own default is 40 storeys; only override when the
    // sentence named a count (the resolver already refused > 40).
    if (typeof cmd.floors === 'number') md['floors'] = cmd.floors;
    const { request, withInterior } = officeRequestFromBrief(md, footprint.length >= 3 ? footprint : null);

    const { getOfficeBuildingController } = await import('../office-building/officeBuildingTrigger.js');
    const res = await getOfficeBuildingController().buildDirect(rt, request, { withInterior });
    if (!res.ok) {
        emitReport(false, [res.reason ?? 'the office generator refused without a reason']);
        return;
    }
    const lines = res.report !== undefined && res.report.length > 0
        ? [...res.report]
        : [`Built a ${request.stories}-storey office tower (${res.deskCount ?? 0} desks).`];
    emitReport(true, lines);
}

// ─── Entry points the bus handlers call ──────────────────────────────────────

/** `generation.building` — residential / house / office. Never throws: every
 *  failure becomes an honest transcript line. */
export async function runGenerationBuilding(cmd: GenerationBuildingPayload): Promise<void> {
    const rt = resolveRuntime();
    if (!rt) {
        emitReport(false, ['the editor runtime is not ready yet — open a project first.']);
        return;
    }
    try {
        switch (cmd.typology) {
            case 'residential-building': await runResidential(rt, cmd); return;
            case 'house': await runHouse(rt, cmd); return;
            case 'office': await runOffice(rt, cmd); return;
            default:
                emitReport(false, [`I don't have a generator for "${String(cmd.typology)}".`]);
        }
    } catch (err) {
        console.error('[gen-chat-seam] generation.building threw:', err);
        emitReport(false, [`the generator failed: ${String((err as Error)?.message ?? err)}`]);
    }
}

/** `generation.apartment` (§GEN-CHAT-APARTMENT, founder P0) — fill the walls
 *  already drawn on the active level. Routes through the SAME shared trigger
 *  the AI-panel leaf and `pryzmGenerateApartmentLayout()` use. */
export async function runGenerationApartment(cmd: GenerationApartmentPayload): Promise<void> {
    const rt = resolveRuntime();
    if (!rt) {
        emitReport(false, ['the editor runtime is not ready yet — open a project first.']);
        return;
    }
    try {
        const { generateApartmentLayoutForChat } = await import('../apartment-layout/apartmentLayoutTrigger.js');
        const res = await generateApartmentLayoutForChat(rt, {
            ...(typeof cmd.bedrooms === 'number' ? { bedrooms: cmd.bedrooms } : {}),
            ...(typeof cmd.bathrooms === 'number' ? { bathrooms: cmd.bathrooms } : {}),
            ...(cmd.masterEnSuite === true ? { masterEnSuite: true } : {}),
            ...(cmd.openPlanKitchenDining === true ? { openPlanKitchenDining: true } : {}),
        });
        emitReport(res.ok, res.ok ? res.report : [res.reason]);
    } catch (err) {
        console.error('[gen-chat-seam] generation.apartment threw:', err);
        emitReport(false, [`the apartment layout engine failed: ${String((err as Error)?.message ?? err)}`]);
    }
}
