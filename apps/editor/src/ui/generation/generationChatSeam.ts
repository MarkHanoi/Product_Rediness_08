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
    /**
     * §GEN-ON-BOUNDARY-LINE (L-7961 · C106 §7.2) — build on a drawn BOUNDARY LINE
     * instead of the site parcel. Absent ⇒ the parcel, exactly as before.
     */
    readonly footprintSource?: 'boundary-line';
    /** The specific line, when the user had one SELECTED. Absent with
     *  `footprintSource:'boundary-line'` ⇒ run the ladder (the one closed line on
     *  the active level, else refuse naming the count). */
    readonly boundaryLineId?: string;
    /**
     * §GEN-FACADE-INTENT (L-10823) — façade description in the user's words, mapped
     * onto the FOUR `ResidentialBuildingRequest` fields that already existed
     * (§RESI-PREVIEW-OPTIONS) and that this payload used to discard.
     */
    readonly facade?: {
        readonly groundCommercialCurtain?: boolean;
        readonly balconies?: boolean;
        readonly facadeColor?: string;
        readonly roofGarden?: boolean;
    };
    /** Recognised façade description the generator CANNOT produce. Repeated on the
     *  post-build transcript: the Confirm card is seen once, the report persists. */
    readonly facadeUnavailable?: readonly string[];
}

/** The `generation.apartment` payload the resolver emits (§GEN-CHAT-APARTMENT
 *  + §RAC-APARTMENT-IN-ROOM L-1640..L-1644). */
export interface GenerationApartmentPayload {
    readonly bedrooms?: number;
    readonly bathrooms?: number;
    readonly masterEnSuite?: boolean;
    readonly openPlanKitchenDining?: boolean;
    /** L-1642 — bedrooms that get their own en-suite (paired master-first). */
    readonly enSuiteCount?: number;
    /** L-1643 — ONE fused open-plan kitchen+living great room. */
    readonly openPlanKitchenLiving?: boolean;
    /** L-911 — the bedroom count was STATED; it is exact all the way down. */
    readonly lockBedroomCount?: boolean;
    /** L-1644 — the target room, RESOLVED by the Confirm-time ladder (id is
     *  authoritative; number/name ride for honest transcript copy). */
    readonly roomId?: string;
    readonly roomNumber?: string;
    readonly roomName?: string;
    /** L-1641 — the level the user named (resolver-verified == active). */
    readonly levelId?: string;
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

/**
 * §GEN-ON-BOUNDARY-LINE (L-7961 · C106 §7.2) — read the drawn BOUNDARY LINE the user
 * wants built on, and turn it into a footprint.
 *
 * ⭐ TYPOLOGY-AGNOSTIC BY CONSTRUCTION. This resolves a POLYGON and nothing else. It
 * does not know what will be built on it, and all three arms below accept an explicit
 * footprint already (`ResidentialBuildingRequest.footprint`,
 * `officeRequestFromBrief(md, footprint)`, `HouseFromBoundaryOptions.footprint`), so
 * the spine gains a second footprint SOURCE without gaining a single typology branch.
 *
 * The store read and the parcel read happen HERE; every judgement happens in the pure
 * `resolveBoundaryLineFootprint`, which is why the ladder and every refusal string are
 * unit-testable in plain Node without standing up a runtime.
 */
async function readBoundaryLineFootprint(
    rt: PryzmRuntime,
    explicitId: string | undefined,
): Promise<{ ok: true; footprint: { x: number; z: number }[]; note: string } | { ok: false; reason: string }> {
    const { resolveBoundaryLineFootprint } = await import('./boundaryLineFootprint.js');

    // The ONE authority for this family — C106 §1: `boundaryLine` has no geometry
    // twin, so this store IS the record, not a DTO mirror of one.
    const store = (rt as unknown as {
        stores?: { boundaryLine?: { getState?(): Map<string, unknown> } };
    }).stores?.boundaryLine;
    const state = store?.getState?.();
    if (state === undefined) {
        // ⚠ UNREADABLE is not EMPTY (§CONTEXT-DATA-HONESTY). Say which one it is.
        return {
            ok: false,
            reason:
                'I can\'t read the boundary-line store in this session, so I can\'t tell whether you ' +
                'have a line drawn. Reload the editor and try again — I won\'t guess a footprint.',
        };
    }

    const lines: Array<{
        id: string; levelId: string; closed: boolean;
        vertices: { x: number; z: number }[]; name?: string | undefined;
    }> = [];
    for (const [id, raw] of state) {
        const r = raw as {
            levelId?: string; closed?: boolean; name?: string;
            vertices?: ReadonlyArray<{ x?: number; z?: number }>;
        } | undefined;
        if (r === undefined) continue;
        lines.push({
            id,
            levelId: typeof r.levelId === 'string' ? r.levelId : '',
            closed: r.closed === true,
            vertices: (r.vertices ?? [])
                .filter((v) => typeof v?.x === 'number' && typeof v?.z === 'number')
                .map((v) => ({ x: v.x as number, z: v.z as number })),
            name: typeof r.name === 'string' ? r.name : undefined,
        });
    }

    const { resolveActiveLevelId } = await import('../apartment-layout/activeLevel.js');
    // ⚠ The RAW parcel, deliberately — the founder's test is "within the SITE
    // boundary", the legal lot outline (C19 §1.4), not the C58 buildable envelope
    // (which is inset by setbacks and would refuse a perfectly legal line that
    // merely sits in a setback strip).
    const parcel = rt.siteModelStore?.getParcelBoundary()?.polygon ?? null;

    const res = resolveBoundaryLineFootprint({
        lines,
        explicitId,
        activeLevelId: resolveActiveLevelId() ?? undefined,
        parcel: parcel !== null && parcel.length >= 3
            ? parcel.map((p) => ({ x: p.x, z: p.z }))
            : null,
    });
    if (!res.ok) return { ok: false, reason: res.reason };

    return {
        ok: true,
        footprint: res.footprint.map((p) => ({ x: p.x, z: p.z })),
        // Always say WHICH line was used and how it was chosen — a build on the
        // wrong line that says nothing is the silent-success shape this lane exists
        // to stop.
        note:
            res.how === 'explicit'
                ? `Built on the boundary line you selected (${res.lineLabel}, ${Math.round(res.areaM2)} m²).`
                : `Built on ${res.lineLabel} — the only closed boundary line on this level (${Math.round(res.areaM2)} m²).`,
    };
}

/**
 * The ONE footprint decision for every typology: the drawn boundary line when the
 * sentence asked for it, else the site parcel exactly as before.
 */
async function resolveGenerationFootprint(
    rt: PryzmRuntime,
    cmd: GenerationBuildingPayload,
): Promise<
    | { ok: true; footprint: { x: number; z: number }[]; note: string | null }
    | { ok: false; reason: string }
> {
    const wantsLine = cmd.footprintSource === 'boundary-line' || cmd.boundaryLineId !== undefined;
    if (wantsLine) {
        const res = await readBoundaryLineFootprint(rt, cmd.boundaryLineId);
        return res.ok ? { ok: true, footprint: res.footprint, note: res.note } : res;
    }
    return { ok: true, footprint: await readSiteFootprint(rt), note: null };
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
    const src = await resolveGenerationFootprint(rt, cmd);
    if (!src.ok) { emitReport(false, [src.reason]); return; }
    const footprint = src.footprint;
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
    // §GEN-FACADE-INTENT (L-10823) — hand the façade description to the SAME brief
    // mapper the onboarding modal fills in. These are the exact metadata keys
    // `residentialRequestFromBrief` already reads; nothing new is invented here, and
    // the chat stops being the one entry point that discards them.
    if (cmd.facade !== undefined) {
        const f = cmd.facade;
        if (f.groundCommercialCurtain === true) md['groundCommercialCurtain'] = true;
        if (f.balconies === false) md['balconies'] = false;
        if (f.roofGarden === true) md['roofGarden'] = true;
        if (typeof f.facadeColor === 'string') md['facadeColor'] = f.facadeColor;
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
    // §GEN-ON-BOUNDARY-LINE — name the footprint that was actually used. Only when
    // it was NOT the parcel: on the ordinary path the transcript is unchanged.
    if (src.note !== null) lines.unshift(src.note);
    // §GEN-FACADE-INTENT — repeat what could NOT be built, on the transcript that
    // persists. A build that quietly discarded half the description would read as a
    // complete success, and the user would conclude the generator had tried.
    if (cmd.facadeUnavailable !== undefined && cmd.facadeUnavailable.length > 0) {
        lines.push(`Not built, as flagged before you confirmed: ${cmd.facadeUnavailable.join('; ')}.`);
    }
    emitReport(true, lines);
}

// ─── The house arm ───────────────────────────────────────────────────────────

async function runHouse(rt: PryzmRuntime, cmd: GenerationBuildingPayload): Promise<void> {
    const md: Record<string, unknown> = {};
    if (typeof cmd.floors === 'number') md['floors'] = cmd.floors;
    if (cmd.roofKind !== undefined) md['roofKind'] = cmd.roofKind;
    const { storeyCount, options } = houseRequestFromBrief(md);

    // §GEN-ON-BOUNDARY-LINE — the house arm takes the SAME resolved footprint via
    // `HouseFromBoundaryOptions.footprint`. Only overridden when a line was asked
    // for; otherwise the mapper's own footprint decision is untouched.
    const wantsLine = cmd.footprintSource === 'boundary-line' || cmd.boundaryLineId !== undefined;
    let lineNote: string | null = null;
    let lineFootprint: { x: number; z: number }[] | null = null;
    if (wantsLine) {
        const src = await readBoundaryLineFootprint(rt, cmd.boundaryLineId);
        if (!src.ok) { emitReport(false, [src.reason]); return; }
        lineFootprint = src.footprint;
        lineNote = src.note;
    }

    const { generateHouseFromBoundary } = await import('../house-layout/houseFromBoundary.js');
    const res = await generateHouseFromBoundary(rt, storeyCount, {
        ...options,
        ...(lineFootprint !== null ? { footprint: lineFootprint } : {}),
        autoBuild: true,
    });
    if (!res.ok) {
        emitReport(false, [res.reason ?? 'the house generator refused without a reason']);
        return;
    }
    const lines = res.report !== undefined && res.report.length > 0
        ? [...res.report]
        : [`Built the ${storeyCount}-storey house.`];
    if (lineNote !== null) lines.unshift(lineNote);
    emitReport(true, lines);
}

// ─── The office arm ──────────────────────────────────────────────────────────

async function runOffice(rt: PryzmRuntime, cmd: GenerationBuildingPayload): Promise<void> {
    const src = await resolveGenerationFootprint(rt, cmd);
    if (!src.ok) { emitReport(false, [src.reason]); return; }
    const footprint = src.footprint;
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
    if (src.note !== null) lines.unshift(src.note);
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
        // §RAC-APARTMENT-IN-ROOM (L-1641) — re-verify a STATED level at dispatch
        // time. The resolver proved it equals the active level at Confirm; the
        // user may have switched since, and the executor builds on the level
        // being VIEWED — silently building the confirmed plan on a different
        // floor would be the exact scope drift this lane exists to stop.
        if (typeof cmd.levelId === 'string' && cmd.levelId.length > 0) {
            const { resolveActiveLevelId } = await import('../apartment-layout/activeLevel.js');
            const active = resolveActiveLevelId();
            if (active !== cmd.levelId) {
                emitReport(false, [
                    `you've switched levels since confirming — the layout was confirmed for the level ` +
                    `you were viewing. Switch back and ask again. Nothing was changed.`,
                ]);
                return;
            }
        }
        const { generateApartmentLayoutForChat } = await import('../apartment-layout/apartmentLayoutTrigger.js');
        const res = await generateApartmentLayoutForChat(
            rt,
            {
                ...(typeof cmd.bedrooms === 'number' ? { bedrooms: cmd.bedrooms } : {}),
                ...(typeof cmd.bathrooms === 'number' ? { bathrooms: cmd.bathrooms } : {}),
                ...(cmd.masterEnSuite === true ? { masterEnSuite: true } : {}),
                ...(cmd.openPlanKitchenDining === true ? { openPlanKitchenDining: true } : {}),
                // §RAC-APARTMENT-IN-ROOM — the two program gaps, now real fields.
                ...(typeof cmd.enSuiteCount === 'number' ? { enSuiteCount: cmd.enSuiteCount } : {}),
                ...(cmd.openPlanKitchenLiving === true ? { openPlanKitchenLiving: true } : {}),
            },
            {
                ...(typeof cmd.roomId === 'string' && cmd.roomId.length > 0 ? { roomId: cmd.roomId } : {}),
                ...(cmd.lockBedroomCount === true ? { lockBedroomCount: true } : {}),
            },
        );
        emitReport(res.ok, res.ok ? res.report : [res.reason]);
    } catch (err) {
        console.error('[gen-chat-seam] generation.apartment threw:', err);
        emitReport(false, [`the apartment layout engine failed: ${String((err as Error)?.message ?? err)}`]);
    }
}
