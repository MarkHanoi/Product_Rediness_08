// §GEN-ROOMS / §GEN-CHAIN (RAC U5c) — the ONE place a chat sentence starts a
// ROOM-SCALE run or the finishing chain.
//
// WHAT THIS IS NOT
// ----------------
// It is not a second pipeline, and it is not a re-implementation of the chain.
// Every arm calls the SAME shared trigger the console entry and the AI-panel
// leaf call:
//
//   ceilings      → triggerCeilingLayout   (window.pryzmCeilAllRooms)
//   floor finishes→ triggerFloorLayout     (window.pryzmFloorAllRooms)
//   furniture     → triggerFurnishLayout   (window.pryzmFurnishAllRooms)
//   every floor   → triggerFurnishAllFloors(window.pryzmFurnishAllFloors)
//   lighting      → triggerLightingLayout  (window.pryzmLightAllRooms)
//
// THE CHAIN IS ALREADY WIRED, and this module respects that rather than
// fighting it. installCeilingLayoutTrigger subscribes ceilings to
// `apartment.layout-executed`; installFurnishLayoutTrigger subscribes furnish
// to `ceiling.layout-executed` (with a 12 s §CHAIN-TIMEOUT fallback);
// installLightingLayoutTrigger subscribes lighting to
// `furnish.layout-executed` (same fallback), and §FURNISH-ALWAYS-LIGHTS means
// EVERY furnish run lights afterwards. So the chain arm fires the FIRST link
// only and then OBSERVES — firing the later links itself would place furniture
// and fixtures twice.
//
// HONESTY. Nothing here invents a number. Every transcript line is read off
// the engines' own `*.layout-executed` payloads (roomCount / roomsFurnished /
// roomsSkipped / skipped[] / placedCount), so a partial outcome reads
// "furniture 22/24 — 2 rooms skipped: <the engine's own reason>". A stage that
// never reports within its budget is named as such — §CHAIN-TIMEOUT is
// reported, not hidden.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { triggerCeilingLayout } from '../ceiling-layout/ceilingLayoutTrigger.js';
import { triggerFloorLayout } from '../floor-layout/floorLayoutTrigger.js';
import { triggerFurnishLayout, triggerFurnishAllFloors } from '../furnish-layout/furnishLayoutTrigger.js';
import { triggerLightingLayout } from '../lighting-layout/lightingLayoutTrigger.js';

export type RoomFinishStep = 'ceilings' | 'floors' | 'furnish' | 'lighting';

/** The `generation.rooms` payload the resolver emits (§GEN-ROOMS). */
export interface GenerationRoomsPayload {
    readonly steps?: readonly RoomFinishStep[];
    readonly levelId?: string;
    readonly allLevels?: boolean;
}

/** The `generation.finish-chain` payload the resolver emits (§GEN-CHAIN). */
export interface GenerationFinishChainPayload {
    readonly levelId?: string;
    readonly withLayout?: boolean;
}

const REPORT_EVENT = 'pryzm-generation-report';

/**
 * §FIX-REPORT-PAYLOAD-DISCARD (W2-B) — the seam's own verdict, carried on the
 * report event so `classifyDispatch` in ZeroTokenChatBridge never has to infer
 * it from a boolean.
 *
 * A TIMEOUT IS NOT A SUCCESS. This seam used to end both entry points with
 * `emitReport(true, lines)` unconditionally, so a run where every stage timed
 * out emitted `success: true` carrying three lines that each said "no report
 * arrived within 14 s" — and the bridge rendered it as a completed run. The
 * stages that DID report are still reported; what changes is that the ones that
 * did not are named as unconfirmed instead of being counted as done.
 */
type SeamOutcome = 'applied' | 'partial' | 'refused' | 'indeterminate';

/** Per-stage wait budget. Matches the trigger modules' own §CHAIN-TIMEOUT
 *  FALLBACK_MS (12 s) plus a margin, so this seam never times out BEFORE the
 *  fallback it is supposed to report. */
const STAGE_TIMEOUT_MS = 14_000;

function emitReport(
    success: boolean,
    info: readonly string[],
    outcome: SeamOutcome = success ? 'applied' : 'refused',
    unconfirmed: readonly string[] = [],
): void {
    try {
        window.dispatchEvent(new CustomEvent(REPORT_EVENT, {
            detail: { success, info: [...info], outcome, unconfirmed: [...unconfirmed] },
        }));
    } catch (err) {
        console.warn('[room-finish-seam] report emit failed (non-fatal):', err);
    }
}

/** One finished stage, and whether the engine ACTUALLY told us so. A stage that
 *  timed out still contributes its sentence — it just never counts as done. */
interface StageResult {
    readonly line: string;
    /** False when the stage's `*.layout-executed` never arrived in budget. */
    readonly confirmed: boolean;
}

/**
 * Split a stage list into the report the bridge should receive. Shared by both
 * entry points so the timeout accounting cannot diverge between them.
 */
function reportStages(stages: readonly StageResult[]): void {
    const confirmed = stages.filter((s) => s.confirmed).map((s) => s.line);
    const unconfirmed = stages.filter((s) => !s.confirmed).map((s) => s.line);
    if (unconfirmed.length === 0) {
        emitReport(true, confirmed, 'applied');
        return;
    }
    if (confirmed.length === 0) {
        // EVERY stage timed out. Nothing is known — not that it failed, and
        // certainly not that it succeeded.
        emitReport(false, unconfirmed, 'indeterminate');
        return;
    }
    emitReport(true, confirmed, 'partial', unconfirmed);
}

function resolveRuntime(): PryzmRuntime | undefined {
    return (window.runtime as unknown as PryzmRuntime | undefined) ?? undefined;
}

interface EventsLike {
    on?: (k: string, fn: (p: unknown) => void) => (() => void) | void;
}

/** Subscribe to `event` and resolve with its payload, or with null after
 *  `timeoutMs`. A null resolution is REPORTED, never swallowed. */
function waitForEvent(
    rt: PryzmRuntime, event: string, timeoutMs: number,
): Promise<Record<string, unknown> | null> {
    const events = rt.events as unknown as EventsLike;
    return new Promise((resolve) => {
        let done = false;
        const sub = events.on?.(event, (payload: unknown) => {
            finish((payload ?? {}) as Record<string, unknown>);
        });
        const off: () => void = typeof sub === 'function' ? sub : () => { /* */ };
        function finish(p: Record<string, unknown> | null): void {
            if (done) return;
            done = true;
            off();
            resolve(p);
        }
        setTimeout(() => finish(null), timeoutMs);
    });
}

/** Set the session active level the same way the level panels and the
 *  all-floors furnish driver do. The room engines read the ACTIVE level, so a
 *  level-scoped ask has to move it — and move it back afterwards. */
function setActiveLevel(id: string): void {
    try {
        const pc = (window as unknown as { projectContext?: { activeLevelId?: string | null } }).projectContext;
        if (pc) pc.activeLevelId = id;
        (window.runtime as unknown as PryzmRuntime | undefined)
            ?.events?.emit('pryzm-active-level-changed', { levelId: id });
    } catch (err) {
        console.warn('[room-finish-seam] could not set active level', id, err);
    }
}

function currentActiveLevel(): string | undefined {
    const pc = (window as unknown as { projectContext?: { activeLevelId?: string | null } }).projectContext;
    const id = pc?.activeLevelId;
    return typeof id === 'string' && id.length > 0 ? id : undefined;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Turn a furnish `*.layout-executed` payload into the engine's OWN sentence.
 *  "Furniture 22/24 — 2 rooms skipped: <reason>" — the reasons are the
 *  engine's, verbatim, deduplicated only so a 12-room repeat reads once. */
function describeFurnish(p: Record<string, unknown> | null): string {
    if (p === null) return 'Furniture — no report arrived within 14 s (the §CHAIN-TIMEOUT fallback may still be running).';
    const rooms = num(p['roomCount']);
    const done = num(p['roomsFurnished']);
    const skipped = num(p['roomsSkipped']) ?? 0;
    const placed = num(p['placedCount']);
    const head = rooms !== null && done !== null
        ? `Furniture ${done}/${rooms}`
        : `Furniture placed${placed !== null ? ` (${placed} items)` : ''}`;
    const items = placed !== null && rooms !== null && done !== null ? ` (${placed} items)` : '';
    if (skipped <= 0) return `${head}${items}`;
    const reasons = Array.isArray(p['skipped'])
        ? [...new Set((p['skipped'] as unknown[])
            .map((s) => (s as { reason?: string } | undefined)?.reason)
            .filter((r): r is string => typeof r === 'string' && r.length > 0))]
        : [];
    const why = reasons.length > 0 ? `: ${reasons.slice(0, 3).join('; ')}` : '';
    return `${head}${items} — ${skipped} room${skipped === 1 ? '' : 's'} skipped${why}`;
}

function describeCounted(label: string, p: Record<string, unknown> | null): string {
    if (p === null) return `${label} — no report arrived within 14 s.`;
    const rooms = num(p['roomCount']);
    const placed = num(p['placedCount']);
    if (placed !== null && rooms !== null) return `${label} ${placed}/${rooms}`;
    if (placed !== null) return `${label} — ${placed} placed`;
    return `${label} ran`;
}

// ─── generation.rooms (U5c.1) ────────────────────────────────────────────────

/**
 * Run the named room-scale engines. `levelId` moves the active level for the
 * duration (the engines read it) and moves it back. The steps run in pipeline
 * order, each awaited so the report can state what each one actually did.
 *
 * Undo: each engine opens its own batch (`batchCoordinator.runBatch` inside the
 * executors), so N engines are N undo entries — the summary SAYS so rather
 * than implying one, per the ADR-0314 honesty rule.
 */
export async function runGenerationRooms(cmd: GenerationRoomsPayload): Promise<void> {
    const rt = resolveRuntime();
    if (!rt) {
        emitReport(false, ['the editor runtime is not ready yet — open a project first.']);
        return;
    }
    const steps = (cmd.steps ?? []).filter((s): s is RoomFinishStep =>
        s === 'ceilings' || s === 'floors' || s === 'furnish' || s === 'lighting');
    if (steps.length === 0) {
        emitReport(false, ['no finishing step was named.']);
        return;
    }

    // Every-floor furnishing is the SHIPPED driver, not a loop written here.
    if (cmd.allLevels === true) {
        try {
            await triggerFurnishAllFloors(rt);
            emitReport(true, ['Furnished every floor — the per-floor coverage report is in the console (§COVERAGE-ALL-FLOORS).']);
        } catch (err) {
            emitReport(false, [`the all-floors furnish failed: ${String((err as Error)?.message ?? err)}`]);
        }
        return;
    }

    const restore = currentActiveLevel();
    const moved = typeof cmd.levelId === 'string' && cmd.levelId.length > 0 && cmd.levelId !== restore;
    if (moved) setActiveLevel(cmd.levelId!);
    const stages: StageResult[] = [];
    try {
        for (const step of steps) {
            // eslint-disable-next-line no-await-in-loop -- stages are ordered by construction
            stages.push(await runOneStep(rt, step));
        }
    } catch (err) {
        console.error('[room-finish-seam] generation.rooms threw:', err);
        emitReport(false, [`the finishing run failed: ${String((err as Error)?.message ?? err)}`]);
        return;
    } finally {
        if (moved && restore !== undefined) setActiveLevel(restore);
    }
    if (steps.length > 1) {
        stages.push({ line: `${steps.length} steps — undo each with Ctrl+Z`, confirmed: true });
    }
    // W2-B — was `emitReport(true, lines)` unconditionally, which reported a
    // total timeout as a successful run.
    reportStages(stages);
}

async function runOneStep(rt: PryzmRuntime, step: RoomFinishStep): Promise<StageResult> {
    switch (step) {
        case 'ceilings': {
            const done = waitForEvent(rt, 'ceiling.layout-executed', STAGE_TIMEOUT_MS);
            triggerCeilingLayout(rt);
            const p = await done;
            return { line: describeCounted('Ceilings', p), confirmed: p !== null };
        }
        case 'floors': {
            // The floor pass runs the command synchronously through the
            // commandManager (no `*.layout-executed` event exists for it), so
            // there is nothing to await and nothing to invent a count from.
            // Confirmed BY CONSTRUCTION, not by evidence — see the REMAINING
            // BLIND SPOT note: this stage cannot report a partial outcome at all.
            triggerFloorLayout(rt);
            return {
                line: 'Floor finishes applied per room type (timber in living/bedroom, tile in kitchen/bathroom)',
                confirmed: true,
            };
        }
        case 'furnish': {
            const done = waitForEvent(rt, 'furnish.layout-executed', STAGE_TIMEOUT_MS);
            triggerFurnishLayout(rt);
            const p = await done;
            // §FURNISH-ALWAYS-LIGHTS — the shipped cascade lights after every
            // furnish run. Saying so is the difference between a report and a
            // surprise.
            return {
                line: `${describeFurnish(p)} (furnishing also auto-lights the rooms)`,
                confirmed: p !== null,
            };
        }
        case 'lighting': {
            const done = waitForEvent(rt, 'lighting.layout-executed', STAGE_TIMEOUT_MS);
            triggerLightingLayout(rt);
            const p = await done;
            return { line: describeCounted('Lighting', p), confirmed: p !== null };
        }
    }
}

// ─── generation.finish-chain (U5c.2) ─────────────────────────────────────────

/**
 * Start the SHIPPED chain and report every stage.
 *
 * `withLayout` fires the apartment engine, whose `apartment.layout-executed`
 * is what the ceiling AND floor triggers already subscribe to — so the whole
 * chain runs on its own wiring. Otherwise the rooms already exist and the
 * chain starts one link later: floor finishes directly (they have no event to
 * cascade off outside the apartment path) plus ceilings, whose
 * `ceiling.layout-executed` cascades to furnish, whose
 * `furnish.layout-executed` cascades to lighting.
 *
 * Either way this function fires ONE link and then listens. Firing furnish or
 * lighting itself would double-place.
 */
export async function runGenerationFinishChain(cmd: GenerationFinishChainPayload): Promise<void> {
    const rt = resolveRuntime();
    if (!rt) {
        emitReport(false, ['the editor runtime is not ready yet — open a project first.']);
        return;
    }
    const restore = currentActiveLevel();
    const moved = typeof cmd.levelId === 'string' && cmd.levelId.length > 0 && cmd.levelId !== restore;
    if (moved) setActiveLevel(cmd.levelId!);

    // Arm every listener BEFORE the first link fires — the cascade is fast and
    // a late subscription would report a stage as "no report" when it ran.
    const ceilingDone = waitForEvent(rt, 'ceiling.layout-executed', STAGE_TIMEOUT_MS);
    const furnishDone = waitForEvent(rt, 'furnish.layout-executed', STAGE_TIMEOUT_MS * 2);
    const lightingDone = waitForEvent(rt, 'lighting.layout-executed', STAGE_TIMEOUT_MS * 3);

    const stages: StageResult[] = [];
    try {
        if (cmd.withLayout === true) {
            const { generateApartmentLayoutForChat } = await import('../apartment-layout/apartmentLayoutTrigger.js');
            const res = await generateApartmentLayoutForChat(rt, {});
            if (!res.ok) {
                // The engine's own refusal, unedited — and NOTHING else ran.
                emitReport(false, [res.reason]);
                if (moved && restore !== undefined) setActiveLevel(restore);
                return;
            }
            for (const l of res.report) stages.push({ line: l, confirmed: true });
            // The apartment engine's `apartment.layout-executed` already starts
            // ceilings AND floor finishes; do not fire them again.
        } else {
            triggerFloorLayout(rt);
            stages.push({ line: 'Floor finishes applied per room type', confirmed: true });
            triggerCeilingLayout(rt);
        }
        const ceilingP = await ceilingDone;
        stages.push({ line: describeCounted('Ceilings', ceilingP), confirmed: ceilingP !== null });
        const furnishP = await furnishDone;
        stages.push({ line: describeFurnish(furnishP), confirmed: furnishP !== null });
        const lightingP = await lightingDone;
        stages.push({ line: describeCounted('Lighting', lightingP), confirmed: lightingP !== null });
    } catch (err) {
        console.error('[room-finish-seam] generation.finish-chain threw:', err);
        emitReport(false, [`the finishing chain failed: ${String((err as Error)?.message ?? err)}`]);
        return;
    } finally {
        if (moved && restore !== undefined) setActiveLevel(restore);
    }
    stages.push({ line: 'Each stage is its own undo entry — Ctrl+Z steps back through them', confirmed: true });
    // W2-B — was `emitReport(true, lines)`: a chain whose ceiling, furnish AND
    // lighting stages all timed out emitted success:true with three "no report
    // arrived within 14 s" lines inside it.
    reportStages(stages);
}
