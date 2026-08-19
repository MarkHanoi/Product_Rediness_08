/**
 * handrailCommit — THE ONE dispatch path for handrail creation, for EVERY surface.
 *
 * ─── WHY IT IS A MODULE AND NOT A METHOD ON EACH TOOL ───────────────────────
 *
 * Before L-1106 there were two commits. `RailingPlanToolHandler._dispatchRun`
 * built `createId('handrail')`-shaped ids, spread thirteen type fields and chose
 * `CreateHandrailCommand` vs `CreateHandrailRunCommand` by segment count.
 * `HandrailTool.onPointerDown` (3-D) built `crypto.randomUUID()` ids, hand-listed
 * **nine** fields, and had no run concept at all. So the SAME catalogue type drawn
 * in 3-D produced a record with a different id shape and four missing baluster /
 * infill fields. C84 **EI-9**: one question, two answers, selected by which view
 * the user happened to be in.
 *
 * Moving the commit here does not merely de-duplicate it — it makes the 3-D
 * surface capable of a RUN, which is what the closed-loop modes (square /
 * circular / ellipse) need and which is the substance of the L-1106 breach.
 *
 * ⚠ IT DISPATCHES COMMANDS, NEVER STORE WRITES (P6 / C11 / C84 EI-1), and a
 * multi-segment run is ONE command so ONE Ctrl+Z removes the whole thing
 * (C16 §8.6).
 *
 * CONTRACTS: C11 · C16 §8.6 / CA-18 · C84 EI-1 / EI-2 / EI-9 · C95 §15.12 / §15.13.
 */

import { createId } from '@pryzm/schemas';
import {
    CreateHandrailCommand,
    CreateHandrailRunCommand,
    CreateHandrailRunOnSlabCommand,
    type HandrailRunSegmentSpec,
} from '@pryzm/command-registry';
import type { HandrailRunSegment } from './handrailRunGenerators';
import { resolveArmedHandrailSpec, handrailSharedPayload, type ResolvedHandrailSpec } from './handrailSpec';
import { resolveHandrailBySlabTarget } from './handrailAuthoring';

/**
 * The dispatcher seam. `CommandManagerImpl.execute` returns a `CommandResult`, but
 * several callers (and every test double) hand us something looser, so the seam is
 * declared as what we actually read and nothing more.
 */
export interface HandrailDispatcher {
    execute(cmd: unknown): unknown;
}

/** What a dispatch reported back, when it reported anything at all. */
interface LooseCommandResult {
    success?: boolean;
    affectedElementIds?: string[];
    info?: string[];
}

/**
 * Commit a run of handrail segments through the command path.
 *
 * A SINGLE segment takes the ordinary `CreateHandrailCommand`, so a plain
 * two-click rail follows exactly the path it always did; anything longer becomes
 * ONE `CreateHandrailRunCommand`, i.e. one undo entry for the whole gesture.
 *
 * @returns the ids it minted, or `[]` when it refused (and said why on the console).
 */
export function dispatchHandrailRun(
    cm: HandrailDispatcher | null | undefined,
    segments: readonly HandrailRunSegment[],
    levelId: string,
    label: string,
    surface: string,
    spec: ResolvedHandrailSpec = resolveArmedHandrailSpec(),
): readonly string[] {
    if (!cm?.execute) {
        console.error(
            `[handrail/${surface}] REFUSED — no commandManager is reachable, so the handrail ` +
            'cannot be created through the command path. Nothing was created and nothing was ' +
            'written directly to a store.',
        );
        return [];
    }
    if (segments.length === 0) return [];

    const shared = handrailSharedPayload(spec, levelId);

    if (segments.length === 1) {
        const only = segments[0]!;
        const id = createId('handrail');
        cm.execute(new CreateHandrailCommand({
            id,
            start: only.start,
            end: only.end,
            suppressStartPost: only.suppressStartPost,
            ...shared,
        }));
        console.log(
            `[handrail/${surface}] handrail ${id} created — type "${spec.typeName}".`,
        );
        return [id];
    }

    const specs: HandrailRunSegmentSpec[] = segments.map((s) => ({
        id: createId('handrail'),
        start: s.start,
        end: s.end,
        suppressStartPost: s.suppressStartPost,
    }));
    cm.execute(new CreateHandrailRunCommand({ segments: specs, label, ...shared }));
    console.log(
        `[handrail/${surface}] ${label} — ${specs.length} segment(s) as ONE undo entry, ` +
        `type "${spec.typeName}".`,
    );
    return specs.map((s) => s.id);
}

/** What {@link executeHandrailBySlab} did, so the caller can offer the pick flow. */
export interface HandrailBySlabOutcome {
    /** True only when handrails were actually created. */
    readonly ok: boolean;
    /**
     * `'no-slab'` — nothing to guard was named, so the caller should ASK
     * (pick-a-slab), not report a failure. Every other value is a real refusal
     * whose `reason` is already user-facing.
     */
    readonly kind: 'created' | 'no-slab' | 'refused' | 'no-dispatch';
    readonly reason?: string;
    readonly createdIds?: readonly string[];
}

/**
 * §FIX-HANDRAIL-BY-SLAB (L-1103) — THE ONE BY-SLAB EXECUTOR, for every surface.
 *
 * ─── THE DEFECT THIS REPLACES ───────────────────────────────────────────────
 * Founder, from a live session: *"Handrail by slab doesn't work. The same
 * happened with curtain walls. Walls work correctly."*
 *
 * By Slab used to be a canvas GESTURE: the plan handler waited for a click and
 * then asked `readSelectedSlabOutline()` for the LIVE selection. But
 * `ToolManager.activateTool()` runs `selectionManager.setEnabled(false)` while
 * activating ANY tool, which clears `selectedObject` — so at click time there was
 * never a selection, and the tool consuming the clicks meant one could never be
 * acquired either. The guard was UNSATISFIABLE: not flaky, never true. Selecting
 * the slab first did not help, because the act of choosing the railing tool threw
 * that selection away.
 *
 * ─── WHY THIS SHAPE ─────────────────────────────────────────────────────────
 * The founder named the reference — the WALL works — so this mirrors what the
 * wall does rather than inventing a third answer. Wall's By Slab is not a gesture
 * either: `ToolsAreaLayout._execWallBySlab` dispatches a command with a
 * `{ slabId }` payload, taken from a snapshot captured BEFORE activation, and
 * when there is no snapshot it enters an explicit pick-a-slab mode that
 * re-enables selection. Both halves are mirrored here, and the id resolution
 * lives in `handrailAuthoring` so the plan handler, the 3-D tool and RAC all read
 * the same answer (L-98).
 *
 * ⚠ IT DISPATCHES A COMMAND, NEVER A STORE WRITE (P6/C11): the run is built by
 * `CreateHandrailRunOnSlabCommand` → `CreateHandrailRunCommand` →
 * `CreateHandrailCommand`, so a by-slab guard's records are byte-identical to a
 * hand-drawn rail's and ONE Ctrl+Z removes the whole perimeter (C16 §8.6).
 *
 * ⚠ `hostId`/`hostKind` are set by the command, not here — a guard created on a
 * slab is HOSTED BY that slab (C95 §15.1), which is what lets the model answer
 * "which railings guard this slab?" and what a future slab-delete cascade needs.
 */
export function executeHandrailBySlab(
    slabId?: string,
    commandManager?: HandrailDispatcher,
): HandrailBySlabOutcome {
    const target = slabId ?? resolveHandrailBySlabTarget();
    if (!target) {
        // NOT an error: the user has simply not said WHICH slab. The caller offers
        // the pick flow, exactly as wall's By Slab does with no pre-selection.
        return {
            ok: false,
            kind: 'no-slab',
            reason: 'No slab named for BY SLAB — ask the user to pick one.',
        };
    }

    const cm = (commandManager
        ?? (globalThis as unknown as { commandManager?: HandrailDispatcher }).commandManager);
    if (!cm?.execute) {
        console.error(
            '[handrail/by-slab] REFUSED — no commandManager is reachable, so the guard cannot be ' +
            'created through the command path. Nothing was created and nothing was written directly ' +
            'to a store.',
        );
        return { ok: false, kind: 'no-dispatch', reason: 'No command dispatcher available.' };
    }

    const spec = resolveArmedHandrailSpec();
    const cmd = new CreateHandrailRunOnSlabCommand({
        slabId: target,
        height: spec.height,
        thickness: spec.thickness,
        baseOffset: spec.baseOffset,
        fillType: spec.fillType,
        railProfile: spec.railProfile,
        railDiameter: spec.railDiameter,
        postSpacing: spec.postSpacing,
        balusterShape: spec.balusterShape,
        balusterWidth: spec.balusterWidth,
        balusterSpacing: spec.balusterSpacing,
        infillMaxGap: spec.infillMaxGap,
        materialColor: spec.materialColor,
        materialId: spec.materialId,
        label: `Handrail by slab — ${spec.typeName}`,
    });

    const res = cm.execute(cmd) as LooseCommandResult | undefined;

    // ⚠ A DISPATCHER THAT RETURNS NOTHING IS NOT A REFUSAL. `CommandManagerImpl`
    // returns a `CommandResult`, but the `execute` seam is typed loosely and other
    // dispatchers (and test doubles) return `void`. Reading "no result" as "it
    // failed" would print a REFUSED line over a command that ran — reporting the
    // opposite of what happened, which is worse than saying nothing. The command
    // has already logged its own refusal by name if there was one.
    if (res === undefined) {
        return { ok: true, kind: 'created', reason: 'Dispatched; the dispatcher reported no result.' };
    }

    const created = res?.affectedElementIds ?? [];
    if (res?.success && created.length > 0) {
        console.log(
            `[handrail/by-slab] ${created.length} handrail(s) created on slab ${target} — ` +
            `type "${spec.typeName}", ONE undo entry.`,
        );
        return { ok: true, kind: 'created', createdIds: created };
    }
    const reason = (res?.info ?? []).join('; ') || `Slab ${target} produced no guard.`;
    console.warn(`[handrail/by-slab] REFUSED — ${reason}`);
    return { ok: false, kind: 'refused', reason };
}
