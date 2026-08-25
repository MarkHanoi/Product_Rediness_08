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

import type { FacadeOpeningProgram } from '@pryzm/ai-host';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { chatConfirm, type ChatConfirmChoices } from '../ai/chatPromptHost.js';
import type { BoundaryLineCandidate, PlanPointXZ } from './boundaryLineFootprint.js';
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
     * instead of the site parcel.
     *
     * §ASK-FOOTPRINT (L-11066 / L-11200) — `'parcel'` is the sentence saying "on the
     * site / parcel / plot" OUT LOUD. Before it existed, an explicit "on the parcel"
     * and saying nothing produced the SAME payload, so the seam could not tell a
     * deliberate parcel build from a silent one — and only the silent one may be
     * asked about. Absent ⇒ SILENT: the parcel, unless a usable boundary line exists
     * on the active level, in which case `resolveGenerationFootprint` ASKS.
     */
    readonly footprintSource?: 'boundary-line' | 'parcel';
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
    /**
     * ⭐⭐ §GEN-FACADE-OPENINGS (L-11080 · C108 Milestone 2, L-11006) — the opening
     * LATTICE measured from an attached photograph: bays, bands, per-cell size
     * FRACTIONS and a CONTINUOUS archness.
     *
     * ⛔ THIS IS THE FIELD `facade` ABOVE COULD NEVER BE. Those four booleans and a
     * colour were the ENTIRE channel from a photograph to the generator, and the
     * founder's ~35 measured openings, five arches and five bays had nowhere to go —
     * his building came out a plain white box with balconies, and it had balconies
     * only because `balconies` happened to be one of the four.
     *
     * ⛔ NOT A LENGTH ANYWHERE. Every number is a ratio or a count; the metres come
     * from the footprint (C108 §2.2, L-11009). Present only when the lattice was read
     * at or above the confidence floor.
     */
    readonly facadeOpeningProgram?: FacadeOpeningProgram;
    /** Recognised façade description the generator CANNOT produce. Repeated on the
     *  post-build transcript: the Confirm card is seen once, the report persists. */
    readonly facadeUnavailable?: readonly string[];
    /**
     * ⭐ §HONESTY65-PHOTO-LEDGER (L-11150) — the PHOTOGRAPH'S provenance ledger:
     * what was read from the image (each at its measured confidence) and every
     * `notUsed` row the mapper wrote (`FacadePhotoBrief.notUsed` — the photo's
     * NOT-BUILT legs). The resolver has emitted this field since §GEN-PHOTO-BRIEF
     * (L-11020) *"so the post-build transcript can repeat what was NOT done"* —
     * and this seam DROPPED it: the field was not even declared here, so only the
     * SENTENCE'S `facadeUnavailable` ever reached the persistent transcript and
     * the photo's ledger died with the Confirm card. Kept separate from
     * `facadeUnavailable` because the SOURCE is the point — "your sentence asked
     * for something I can't build" and "your photo showed something I didn't use"
     * are different sentences.
     */
    readonly photoProvenance?: readonly string[];
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

/**
 * ⭐ §HONESTY65-PHOTO-LEDGER (L-11150) — merge the photograph's provenance ledger
 * into the SAME post-build report the engine's own lines ride on. ONE report, one
 * line for the whole ledger, deduplicated: a row whose text already appears in a
 * line above (the executor's `facadeNotes` or the sentence's `facadeUnavailable`)
 * is not printed twice. Shared by all three typology arms because the resolver
 * attaches a photo ledger to the payload regardless of typology.
 *
 * Exported for the acceptance test only — production callers are the three arms
 * below.
 */
export function appendPhotoLedger(lines: string[], cmd: GenerationBuildingPayload): void {
    if (cmd.photoProvenance === undefined || cmd.photoProvenance.length === 0) return;
    const printed = lines.map((l) => l.toLowerCase());
    const rows = [...new Set(cmd.photoProvenance)].filter(
        (r) => !printed.some((l) => l.includes(r.toLowerCase())),
    );
    if (rows.length === 0) return;
    lines.push(`From your photo, as shown before you confirmed: ${rows.join('; ')}.`);
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
async function readSiteFootprint(rt: PryzmRuntime): Promise<{
    points: { x: number; z: number }[];
    /** What a parcel build ACTUALLY uses — the cached C58 envelope, or the raw parcel. */
    source: 'envelope' | 'parcel';
    /** Area of the RAW parcel ring (0 when none is loaded) — a measured fact for the
     *  §ASK-FOOTPRINT card, never a threshold (see boundaryLineFootprint.ts's header). */
    parcelAreaM2: number;
    /** Area of `points` — the ring the generator would be handed. */
    usedAreaM2: number;
}> {
    const polygon = rt.siteModelStore?.getParcelBoundary()?.polygon ?? [];
    const { resolveBuildableFootprint } = await import('../site/siteDispatch.js');
    const { ringAreaM2 } = await import('./boundaryLineFootprint.js');
    const { polygon: usable, source } = resolveBuildableFootprint(polygon);
    const pts = usable.map((p) => ({ x: p.x, z: p.z }));
    // Drop a trailing duplicate of the first point (a closed ring) so a
    // zero-length edge never reaches an orchestrator.
    if (pts.length >= 2) {
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) pts.pop();
    }
    return {
        points: pts,
        source,
        parcelAreaM2: ringAreaM2(polygon.map((p) => ({ x: p.x, z: p.z }))),
        usedAreaM2: ringAreaM2(pts),
    };
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
/** Everything the pure resolver needs, read ONCE from the runtime — shared by the
 *  explicit-line path and the §ASK-FOOTPRINT probe so the two can never read
 *  different stores, levels or parcels. */
type BoundaryLineRead =
    | {
          ok: true;
          lines: BoundaryLineCandidate[];
          activeLevelId: string | undefined;
          /** The RAW parcel ring, or null when UNKNOWN (never "outside"). */
          parcel: PlanPointXZ[] | null;
      }
    | { ok: false; reason: string };

async function readBoundaryLines(rt: PryzmRuntime): Promise<BoundaryLineRead> {
    // The ONE authority for this family — C106 §1: `boundaryLine` has no geometry
    // twin, so this store IS the record, not a DTO mirror of one.
    //
    // ⭐ §BLSTORE-COMPOSED-PLUGIN-STORES (L-11060) — READ THROUGH THE DECLARED SLOT,
    // NOT THROUGH A CAST. This read used to be
    //   `(rt as unknown as { stores?: { boundaryLine?: … } }).stores?.boundaryLine`
    // and that cast is the whole reason the founder's build was refused for a day:
    // `composeRuntime` never attached the key, the cast asserted a shape the runtime
    // did not have, and the compiler could not see the disagreement. `StoresSlot` now
    // DECLARES `boundaryLine`, so if the composition root ever stops attaching it the
    // failure is a type error at this line rather than a refusal in the chat.
    const store = rt.stores?.boundaryLine;
    const state = store?.getState();
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

    return {
        ok: true,
        lines,
        activeLevelId: resolveActiveLevelId() ?? undefined,
        parcel: parcel !== null && parcel.length >= 3
            ? parcel.map((p) => ({ x: p.x, z: p.z }))
            : null,
    };
}

async function readBoundaryLineFootprint(
    rt: PryzmRuntime,
    explicitId: string | undefined,
): Promise<{ ok: true; footprint: { x: number; z: number }[]; note: string } | { ok: false; reason: string }> {
    const { resolveBoundaryLineFootprint } = await import('./boundaryLineFootprint.js');
    const read = await readBoundaryLines(rt);
    if (!read.ok) return read;

    const res = resolveBoundaryLineFootprint({
        lines: read.lines,
        explicitId,
        activeLevelId: read.activeLevelId,
        parcel: read.parcel,
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
 *
 * ⭐ EXPORTED (L-11063) so the reachability suite can assert the resolved POLYGON
 * itself rather than only the transcript the generator eventually prints. It is not
 * a test-only hatch: this is the seam's single footprint decision, shared by all
 * three typology arms, and it is exactly the leg that was broken — asserting it
 * directly is the difference between proving the join and inferring it from a
 * downstream refusal. The residential EXECUTOR's last leg needs the browser-only
 * legacy `commandManager` global, so a headless process cannot follow the ring all
 * the way to elements; this function is the furthest point that can be measured
 * honestly without faking the engine.
 *
 * ⭐⭐ §ASK-FOOTPRINT (L-11066 · closes "AMBIGUITY MUST ASK") — THE LADDER:
 *
 *   1. the sentence named the LINE (`footprintSource:'boundary-line'` or a
 *      `boundaryLineId`)                       → the line, no question asked;
 *   2. the sentence named the PARCEL (`footprintSource:'parcel'`)
 *                                              → the parcel, no question asked;
 *   3. the sentence was SILENT:
 *        a. no boundary line on the active level, or none USABLE (open,
 *           degenerate, outside the site)      → the parcel, no question asked —
 *           a confirmation nobody needs is its own defect;
 *        b. exactly ONE usable closed line     → ASK: "Build on the boundary line"
 *           / "Build on the parcel", with both areas, the level and the line's
 *           name on the card;
 *        c. TWO OR MORE usable closed lines    → ASK: "Build on the parcel" /
 *           "Stop — I'll select a line". The choice is real but not binary, and
 *           picking a line for the user is the silent wrong building this seam
 *           exists to stop (L-11200).
 *
 * The founder's standing ruling on spatial validity is ASK, NEVER AUTO-EDIT
 * ([[spatial-validity-rules-founder-direction]]). Before this branch the silent
 * case built on the parcel with nothing on the transcript, while a line the user
 * had just drawn inside that parcel sat unused. ⛔ ZERO TOKENS: every question here
 * is a deterministic branch on store state, asked through the ONE chat card
 * (`AIPanel.showZeroTokenConfirm` via `chatConfirm`) — never a second surface.
 */
export type GenerationFootprintSource = 'boundary-line' | 'parcel';

export type GenerationFootprint =
    | {
          ok: true;
          footprint: { x: number; z: number }[];
          /** A transcript line naming WHICH footprint was used and why — null only on
           *  the ordinary silent-parcel path, so that transcript is unchanged. */
          note: string | null;
          source: GenerationFootprintSource;
      }
    | { ok: false; reason: string };

export async function resolveGenerationFootprint(
    rt: PryzmRuntime,
    cmd: GenerationBuildingPayload,
): Promise<GenerationFootprint> {
    const wantsLine = cmd.footprintSource === 'boundary-line' || cmd.boundaryLineId !== undefined;
    if (wantsLine) {
        const res = await readBoundaryLineFootprint(rt, cmd.boundaryLineId);
        return res.ok ? { ok: true, footprint: res.footprint, note: res.note, source: 'boundary-line' } : res;
    }
    if (cmd.footprintSource === 'parcel') {
        // An EXPLICIT source wins silently — the user said "on the parcel".
        return { ok: true, footprint: (await readSiteFootprint(rt)).points, note: null, source: 'parcel' };
    }
    return resolveSilentFootprint(rt);
}

/** The two answers, in words a person can act on — never "Confirm"/"Cancel", which
 *  would leave the user guessing which footprint "Confirm" means. */
const ASK_LINE_OR_PARCEL: ChatConfirmChoices = {
    confirmLabel: 'Build on the boundary line',
    cancelLabel: 'Build on the parcel',
};
const ASK_PARCEL_OR_STOP: ChatConfirmChoices = {
    confirmLabel: 'Build on the parcel',
    cancelLabel: 'Stop — I\'ll select a line',
};

/** The one honest outcome when there is NO surface to ask in (a headless process):
 *  refuse, naming the choice and the words that avoid it. Never a guess. */
const NOBODY_TO_ASK =
    'I need to ask which footprint to build on — there is a usable boundary line on this level ' +
    'as well as the site parcel — but there is no chat surface to ask in. Say "on the boundary ' +
    'line" or "on the parcel" in the sentence and ask again.';

/** Exported for the acceptance test only — the ONE undo sentence every ask card ends
 *  with. It names Ctrl+Z, which is also what stops the card appending its generic
 *  single-undo tail (§PLAN RAC U6): generation undo is STAGED (L-10822), and the
 *  card must not contradict the Confirm card that already said so. */
export const ASK_FOOTPRINT_UNDO_LINE =
    'Ctrl+Z undoes the build afterwards, stage by stage, as the Confirm card said.';

/** The active level, in the words the user sees in the level list — its authored
 *  name when the BIM manager can supply one, else its id. */
function levelLabel(levelId: string | undefined): string {
    if (levelId === undefined || levelId.length === 0) return 'any level (no active level is set)';
    const bm = (window as unknown as {
        bimManager?: { getLevelById?: (id: string) => { name?: unknown } | undefined };
    }).bimManager;
    let name: unknown;
    try { name = bm?.getLevelById?.(levelId)?.name; } catch { name = undefined; }
    return typeof name === 'string' && name.trim().length > 0 ? `level "${name.trim()}"` : `level ${levelId}`;
}

/** The parcel half of the card — MEASURED facts about what a parcel build would use. */
function describeParcel(site: Awaited<ReturnType<typeof readSiteFootprint>>): string {
    if (site.points.length < 3) {
        return 'the site parcel — none is loaded, so building on the parcel would be refused';
    }
    const parcel = `${Math.round(site.parcelAreaM2)} m²`;
    return site.source === 'envelope'
        ? `the site parcel — ${parcel} (a parcel build uses the ${Math.round(site.usedAreaM2)} m² buildable envelope inside it)`
        : `the site parcel — ${parcel}`;
}

/**
 * The closed lines on the active level that would each BUILD if chosen — each run
 * through the SAME pure validation the explicit path uses, by id. With exactly one
 * closed line in scope this is precisely "would `resolveBoundaryLineFootprint`
 * return ok for the implicit ladder", which is the L-11066 firing condition.
 */
async function usableClosedLines(
    read: Extract<BoundaryLineRead, { ok: true }>,
): Promise<Array<{ lineId: string; lineLabel: string; areaM2: number; footprint: readonly PlanPointXZ[] }>> {
    const { resolveBoundaryLineFootprint } = await import('./boundaryLineFootprint.js');
    const inScope = read.activeLevelId !== undefined && read.activeLevelId.length > 0
        ? read.lines.filter((l) => l.levelId === read.activeLevelId)
        : read.lines;
    const out: Array<{ lineId: string; lineLabel: string; areaM2: number; footprint: readonly PlanPointXZ[] }> = [];
    for (const l of inScope) {
        if (!l.closed) continue;
        const r = resolveBoundaryLineFootprint({ lines: read.lines, explicitId: l.id, parcel: read.parcel });
        if (r.ok) out.push({ lineId: r.lineId, lineLabel: r.lineLabel, areaM2: r.areaM2, footprint: r.footprint });
    }
    return out;
}

/** Rung 3 of the ladder: the sentence named no source. */
async function resolveSilentFootprint(rt: PryzmRuntime): Promise<GenerationFootprint> {
    const site = await readSiteFootprint(rt);
    const read = await readBoundaryLines(rt);
    if (!read.ok) {
        // ⚠ UNREADABLE is not EMPTY (§CONTEXT-DATA-HONESTY). The parcel build is the
        // pre-L-11066 behaviour and is kept; what is NOT kept is silence about the
        // check that could not run.
        return {
            ok: true,
            footprint: site.points,
            source: 'parcel',
            note:
                `Built on the site parcel without checking for a drawn boundary line — ` +
                `${read.reason}`,
        };
    }

    const usable = await usableClosedLines(read);
    // 3a — nothing to choose between: the parcel, and no question.
    if (usable.length === 0) return { ok: true, footprint: site.points, note: null, source: 'parcel' };

    const level = levelLabel(read.activeLevelId);
    const parcelLine = describeParcel(site);

    // 3b — ONE usable line: a real, binary choice.
    if (usable.length === 1) {
        const line = usable[0]!;
        const lineArea = `${Math.round(line.areaM2)} m²`;
        const card = [
            `You didn't say which footprint to build on, and there are two:`,
            `• the boundary line ${line.lineLabel} on ${level} — ${lineArea}, closed and inside the site ` +
                `(the only closed boundary line on this level)`,
            `• ${parcelLine}`,
            ASK_FOOTPRINT_UNDO_LINE,
        ].join('\n');
        const answer = await chatConfirm(card, ASK_LINE_OR_PARCEL);
        if (answer === undefined) return { ok: false, reason: NOBODY_TO_ASK };
        if (answer) {
            return {
                ok: true,
                source: 'boundary-line',
                footprint: line.footprint.map((p) => ({ x: p.x, z: p.z })),
                note:
                    `Built on the boundary line ${line.lineLabel} (${lineArea}), as you chose when asked — ` +
                    `the site parcel was left unused.`,
            };
        }
        return {
            ok: true,
            source: 'parcel',
            footprint: site.points,
            note:
                `Built on the site parcel, as you chose when asked — the boundary line ` +
                `${line.lineLabel} (${lineArea}) was left unused.`,
        };
    }

    // 3c — TWO OR MORE usable lines (L-11200): real, not binary, and not ours to pick.
    const names = usable.map((u) => u.lineLabel).join(', ');
    const card = [
        `You didn't say which footprint to build on, and ${level} has ${usable.length} closed boundary ` +
            `lines I could build on:`,
        ...usable.map((u) => `• the boundary line ${u.lineLabel} — ${Math.round(u.areaM2)} m²`),
        `• ${parcelLine}`,
        `I won't pick a line for you. Build on the parcel now, or stop, select the line you want in plan, ` +
            `and ask again. ${ASK_FOOTPRINT_UNDO_LINE}`,
    ].join('\n');
    const answer = await chatConfirm(card, ASK_PARCEL_OR_STOP);
    if (answer === undefined) return { ok: false, reason: NOBODY_TO_ASK };
    if (!answer) {
        return {
            ok: false,
            reason:
                `you chose to select a boundary line first — select the one you want in plan ` +
                `(${names}) and ask again.`,
        };
    }
    return {
        ok: true,
        source: 'parcel',
        footprint: site.points,
        note:
            `Built on the site parcel, as you chose when asked — the ${usable.length} closed boundary ` +
            `lines on this level (${names}) were left unused.`,
    };
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
    // ⭐⭐ §GEN-FACADE-OPENINGS (L-11080 · C108 Milestone 2, L-11006) — the OPENING
    // LATTICE, which the four fields above could never carry. `residentialBriefMapper`
    // validates it structurally and drops the whole program on one bad cell; the
    // executor lays the GROUND storey out on the measured bay rhythm and cuts the
    // arched heads through the existing §OPENING-PROFILE axis.
    if (cmd.facadeOpeningProgram !== undefined) md['facadeOpeningProgram'] = cmd.facadeOpeningProgram;
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
    // ⭐ §HONESTY65-PHOTO-LEDGER (L-11150) — the PHOTO'S ledger, same report. Until
    // this call, the sentence's not-built legs printed and the photograph's did
    // not, so a build that quietly ignored half the image read as a complete
    // success on the transcript that persists.
    appendPhotoLedger(lines, cmd);
    emitReport(true, lines);
}

// ─── The house arm ───────────────────────────────────────────────────────────

async function runHouse(rt: PryzmRuntime, cmd: GenerationBuildingPayload): Promise<void> {
    const md: Record<string, unknown> = {};
    if (typeof cmd.floors === 'number') md['floors'] = cmd.floors;
    if (cmd.roofKind !== undefined) md['roofKind'] = cmd.roofKind;
    const { storeyCount, options } = houseRequestFromBrief(md);

    // §GEN-ON-BOUNDARY-LINE — the house arm takes the SAME resolved footprint via
    // `HouseFromBoundaryOptions.footprint`. Only overridden when the decision landed
    // on a LINE; on the parcel the mapper's own footprint decision is untouched.
    // §ASK-FOOTPRINT (L-11066) — through the ONE footprint decision, so the house
    // arm asks exactly when the residential and office arms do.
    const src = await resolveGenerationFootprint(rt, cmd);
    if (!src.ok) { emitReport(false, [src.reason]); return; }
    const lineNote: string | null = src.note;
    const lineFootprint: { x: number; z: number }[] | null =
        src.source === 'boundary-line' ? src.footprint : null;

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
    appendPhotoLedger(lines, cmd);   // §HONESTY65-PHOTO-LEDGER — same ledger, same rule
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
    appendPhotoLedger(lines, cmd);   // §HONESTY65-PHOTO-LEDGER — same ledger, same rule
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
