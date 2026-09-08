// §RAC-BUILD-FROM-ENVELOPE (L-13176) — the ONE place a chat sentence starts a
// build from the space envelopes the user DREW.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ IT CONTAINS NO PLANNER, NO GEOMETRY AND NO BUILDER. It is a RELAY.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// `planBuildFromDesign` + `executeBuildFromDesign` already turn `role:'level'`
// and `role:'room'` space envelopes into walls and a floor plate, and the Parcel
// Law panel's "Create BIM from this design" button drives exactly that pair.
// C84 EI-9 — *"for any question the system answers there is exactly ONE
// implementation, and every consumer reaches it"* — so this module calls the
// SAME pair, through the panel's OWN wiring object:
//
//     defaultParcelLawCreateHouseDeps()
//       .runtime()            ← the same runtime accessor the button resolves
//       .activeLevelId()      ← `resolveActiveLevelId()`, the ONE active-level
//                               resolver the house pipeline itself uses
//       .authoredWallCount()  ← the ONE wall census, off
//                               `storeRegistry.getStoreForType('wall')`, which
//                               is the same store `GISAreaLayout` measures the
//                               authored model from
//       .buildFromDesign()    ← `executeBuildFromDesign(rt, plan,
//                               defaultBuildFromDesignExecutorDeps())`
//
// Reaching for that object rather than re-deriving its four members is the whole
// point: a second census or a second active-level resolver is how two entry
// points start disagreeing about which storey is empty, and this one gates a
// destructive-looking build.
//
// ⛔ WHAT THIS MODULE MUST NEVER GROW. A plan stage, a geometry calculation, or
// a "just this once" special case for a part the builder does not make yet. The
// moment it does, it IS the second builder, and it will pass its own tests while
// drifting from the button. `ui/ai/__tests__/buildFromEnvelopeChatSeam.spec.ts` asserts that
// this file calls `planBuildFromDesign` exactly once and carries no geometry
// maths, so the drift is caught by a red test rather than by a founder.
//
// ── HONESTY: EVERY NUMBER AND EVERY REFUSAL IS THE PLAN'S OWN ───────────────
//
// Nothing here invents a count or re-narrates a reason (C67 §4 rule 6, C68 §5.g):
//   · a plan refusal is relayed VERBATIM — `refusal.text` already names both
//     numbers;
//   · a per-room refusal is relayed VERBATIM — the plan named the room AND its
//     numbers;
//   · what the pass does not create is `plan.willNotCreate`, relayed VERBATIM.
//     That array is computed per plan by `buildFromDesignPlan.ts`, so when the
//     builder learns a roof the chat's disclosure narrows in the SAME commit,
//     with no review and no second copy (C84 EI-8a);
//   · a slab refused AFTER the walls committed is reported as a PARTIAL, with
//     the store's own reason, never as a success and never as a total failure.
//
// ── THE UNDO COST IS DERIVED, NOT ASSERTED ─────────────────────────────────
//
// `executeBuildFromDesign` dispatches `wall.batch.create`, then
// `slab.batch.create`, then `ceiling.batch.create` — THREE commands, and
// `batchCoordinator.runBatch` is undo-NEUTRAL (ADR-0314 /
// `BatchCoordinator.ts:233`), so a full gesture costs THREE history entries.
// The report counts what ACTUALLY ran (a refused plate is one entry, not two)
// rather than repeating the resolver's pre-dispatch estimate.
//
// ⛔ THE COUNT IS DERIVED IN ALL FOUR PLACES IT APPEARS, AND THAT IS NOT
// PEDANTRY. This paragraph said "two" and so did the Confirm card, the registry
// note and the seam's own report, while §BIM-FROM-THE-DESIGN was adding the
// third verb in a parallel lane. Every one of them was a hand-written literal,
// so the pin in `buildFromEnvelopeChatSeam.spec.ts` — which reads the verbs out
// of the executor's SOURCE — is the only thing that caught it.
//
// P6 — this file writes no store and mutates no element; every mutation is a bus
// command dispatched by the executor it calls. P4 — no `(window as any)`: the
// runtime arrives through the panel's typed deps accessor. P8 — a span per
// exported function.

import { trace } from '@opentelemetry/api';
import {
    planBuildFromDesign,
    readDesignEnvelopes,
    type BuildFromDesignPlan,
} from '../site/buildFromDesignPlan';
import {
    defaultParcelLawCreateHouseDeps,
    type ParcelLawCreateHouseDeps,
} from '../analysis/parcelLawCreateHouse';

const _tracer = trace.getTracer('pryzm.generation.buildFromEnvelopeChatSeam');

/**
 * The seam's environment: the PANEL's own deps interface, unchanged.
 *
 * ⭐ IT IS THE PANEL'S TYPE, NOT A LOOK-ALIKE. Declaring a private
 * `{ runtime, activeLevelId, authoredWallCount, buildFromDesign }` here would
 * compile, read identically, and be a SECOND contract that drifts the first time
 * the panel's changes. Taking `ParcelLawCreateHouseDeps` means the compiler
 * enforces that the two entry points are wired from the same shape, and a spec
 * that injects a subset is injecting into the REAL seam rather than a twin
 * (C67 §4 rule 13 — a fixture may not be more capable than the thing it stands
 * in for; here it cannot even be a DIFFERENT thing).
 */
export type BuildFromEnvelopeDeps = ParcelLawCreateHouseDeps;

/** The `generation.from-envelope` payload the resolver emits. */
export interface BuildFromEnvelopePayload {
    /** `['walls', 'floor-plate']` by default; `['walls']` for a walls-only ask. */
    readonly parts?: readonly string[];
    /** Parts the sentence named that this pass does not build. Reported, not built. */
    readonly deferred?: readonly string[];
}

const REPORT_EVENT = 'pryzm-generation-report';

/**
 * The seam's own verdict, carried on the report so `classifyDispatch` in
 * `ZeroTokenChatBridge` never infers it from a boolean.
 *
 * `partial` is a real outcome here and not a courtesy: the walls can commit and
 * the floor plate can then be refused, and `executeBuildFromDesign` deliberately
 * does NOT roll the walls back ("the walls ARE the deliverable"). Reporting that
 * as either a clean success or a total failure would both be lies.
 */
type SeamOutcome = 'applied' | 'partial' | 'refused';

function emitReport(
    success: boolean,
    info: readonly string[],
    outcome: SeamOutcome,
): void {
    try {
        window.dispatchEvent(new CustomEvent(REPORT_EVENT, {
            detail: { success, info: [...info], outcome, unconfirmed: [] },
        }));
    } catch (err) {
        console.warn('[build-from-envelope-seam] report emit failed (non-fatal):', err);
    }
}

/**
 * Narrow the runtime to the space-envelope store `readDesignEnvelopes` reads.
 *
 * ⛔ It returns the store or `undefined` and makes NO judgement about emptiness:
 * `readDesignEnvelopes` owns the `null` (store unreadable) vs `[]` (nothing
 * drawn) distinction, and the plan gives those two DIFFERENT refusals
 * (§CONTEXT-DATA-HONESTY — a failure and an empty result are not the same value).
 * A second emptiness check here would be a second opinion on that question.
 */
function envelopeStore(rt: unknown): { getState?: () => ReadonlyMap<string, unknown> } | undefined {
    const s = (rt as { stores?: Record<string, unknown> } | null | undefined)?.stores?.spaceEnvelope;
    return typeof s === 'object' && s !== null
        ? (s as { getState?: () => ReadonlyMap<string, unknown> })
        : undefined;
}

/**
 * Honour a walls-only ask by projecting the plate off the plan the planner
 * produced.
 *
 * ⚠ THIS IS A PROJECTION, NOT A SECOND PLAN. Every wall, every boundary and
 * every refusal is the planner's; the only thing this decides is whether the
 * plate the planner cut is DISPATCHED — which is precisely what "just the walls"
 * means. `executeBuildFromDesign` already treats an absent `plan.slabs[0]` as
 * "no plate this pass" (`const slab = plan.slabs[0]; if (slab) {…}`), so no new
 * branch is introduced on the executor's side either.
 */
function applyPartSelection(
    plan: BuildFromDesignPlan,
    parts: readonly string[] | undefined,
): BuildFromDesignPlan {
    if (parts === undefined || parts.length === 0) return plan;
    // ⛔ EVERY DISPATCHABLE PART IS PROJECTED, NOT JUST THE PLATE. When
    // §BIM-FROM-THE-DESIGN taught the executor `ceiling.batch.create`, this
    // function still knew only about slabs — so "just the walls" built walls AND
    // CEILINGS, and the report counted an undo step the user was never offered.
    // A projection that covers some of the parts is worse than none: it reads as
    // honouring the ask while quietly ignoring half of it.
    // ⭐⭐ §PART-ONLY-BUILDS (L-13256) — THE WALLS ARE PROJECTED TOO, AND THAT IS THE HALF THAT
    // MAKES A PLATE-ONLY ASK SAFE RATHER THAN MERELY POSSIBLE.
    //
    // FOUNDER: *"create walls on envelope works - but slab doesnt"*. He had 70 shell walls
    // standing and asked for the plate alone. The resolver used to refuse that outright; removing
    // the refusal WITHOUT this line would have been worse than the refusal — it would have
    // re-dispatched a full storey of walls onto a level that already had his, which is the silent
    // widening C68 §7.d forbids and precisely what his "ask for the walls too" advice would have
    // caused.
    return {
        ...plan,
        walls: parts.includes('walls') ? plan.walls : [],
        slabs: parts.includes('floor-plate') ? plan.slabs : [],
        ceilings: parts.includes('ceilings') ? plan.ceilings : [],
    };
}

/** "24 walls (18 shell + 6 partitions)" — read off the result, never recomputed. */
function speakWalls(count: number, shell: number | undefined, partitions: number | undefined): string {
    const noun = count === 1 ? '1 wall' : `${count} walls`;
    return shell === undefined || partitions === undefined
        ? noun
        : `${noun} (${shell} shell + ${partitions} partition${partitions === 1 ? '' : 's'})`;
}

/**
 * Run the build the chat asked for, and put the builder's OWN words on the
 * transcript.
 *
 * Never throws: every failure comes back as a `success:false` report, which the
 * bridge renders as "Nothing was changed — <reason>". A refusal must never read
 * like a build.
 */
export async function runBuildFromEnvelope(
    cmd: BuildFromEnvelopePayload,
    // The PANEL's own wiring object — same runtime, same active-level resolver,
    // same wall census, same executor. See the header. Injected (with the
    // production default) so a spec can drive the REAL planner and the REAL
    // executor while standing in only for the browser globals.
    deps: BuildFromEnvelopeDeps = defaultParcelLawCreateHouseDeps(),
): Promise<void> {
    const span = _tracer.startSpan('pryzm.generation.runBuildFromEnvelope');
    try {
        const rt = deps.runtime();
        if (!rt) {
            emitReport(false, [
                'PRYZM has no runtime in this session, so no command can be dispatched. Nothing '
                + 'has been created.',
            ], 'refused');
            return;
        }
        const activeLevelId = deps.activeLevelId() ?? null;
        let wallCount = 0;
        try {
            wallCount = activeLevelId ? deps.authoredWallCount(activeLevelId) : 0;
        } catch (e) {
            console.warn('[build-from-envelope-seam] wall census failed — treating as 0:', e);
        }

        const outcome = planBuildFromDesign({
            envelopes: readDesignEnvelopes(envelopeStore(rt)),
            activeLevelId,
            authoredWallCountOnActiveLevel: wallCount,
        });
        if (!outcome.ok) {
            // The plan's OWN sentence, verbatim. It already names both numbers.
            emitReport(false, [outcome.refusal.text], 'refused');
            span.setAttribute('pryzm.buildFromEnvelope.refusal', outcome.refusal.code);
            return;
        }

        const plan = applyPartSelection(outcome.plan, cmd.parts);
        const build = deps.buildFromDesign;
        if (build === undefined) {
            emitReport(false, [
                'The build-from-design executor is not wired into this session, so nothing was '
                + 'dispatched. This is a wiring failure, not a finding about your design.',
            ], 'refused');
            return;
        }
        const result = await build(rt, plan);
        if (!result.ok) {
            emitReport(false, [result.reason ?? 'The build was refused and gave no reason.'], 'refused');
            return;
        }

        // ── THE REPORT — every number read off the plan or the result ────────
        const lines: string[] = [];
        const wallsBuilt = result.wallIds?.length ?? 0;
        // ⛔ §BUILD-EVERY-STOREY — the executor returns `slabIds`, ONE PLATE PER STOREY, not the
        // single `slabId` this seam was written against. Reading the old scalar off the new result
        // yielded `undefined`, so a build that laid five plates reported none of them and undercounted
        // its own undo depth. COUNT the array; never re-narrate it as a boolean.
        const slabsBuilt = result.slabIds?.length ?? 0;
        const ceilingsBuilt = result.ceilingIds?.length ?? 0;
        const extras = [
            slabsBuilt === 0 ? null : slabsBuilt === 1 ? 'the floor plate' : `${slabsBuilt} floor plates`,
            ceilingsBuilt === 0 ? null : ceilingsBuilt === 1 ? 'a ceiling' : `${ceilingsBuilt} ceilings`,
        ].filter((s): s is string => s !== null);
        const where = plan.sourceEnvelopeName ?? 'your level envelope';
        lines.push(
            `Built ${speakWalls(wallsBuilt, result.shellWallCount, result.partitionWallCount)}`
            + `${extras.length === 0 ? '' : ` and ${extras.join(' and ')}`} from ${where} `
            + `(${plan.footprintAreaM2} m²), on the level you are viewing.`,
        );
        // Partial reporting, C68 §5.g — "Changed N of M — K skipped: <reason>",
        // with the reason read off the PLAN's own text, never re-narrated.
        const roomsAsked = plan.rooms.length + plan.refusedRooms.length;
        if (plan.refusedRooms.length > 0) {
            lines.push(
                `Built ${plan.rooms.length} of ${roomsAsked} rooms — ${plan.refusedRooms.length} `
                + `skipped: ${plan.refusedRooms.map((r) => r.text).join(' · ')}`,
            );
        }
        if (result.slabRefusal) {
            lines.push(
                `The floor plate was refused AFTER the walls committed, and the walls were kept: `
                + `${result.slabRefusal}`,
            );
        }
        if (result.link && result.link.unlinked.length > 0) {
            lines.push(
                `${result.link.unlinked.length} wall(s) were NOT linked to their envelope, so they `
                + `will not follow it: ${result.link.unlinked.map((u) => u.reason).join(' · ')}`,
            );
        }
        // What it does NOT build — the PLAN's own list, relayed verbatim.
        if (plan.willNotCreate.length > 0) {
            lines.push(`It did not create: ${plan.willNotCreate.join('; ')}.`);
        }
        const undoSteps = (wallsBuilt > 0 ? 1 : 0) + (slabsBuilt > 0 ? 1 : 0)
            + (ceilingsBuilt > 0 ? 1 : 0);
        lines.push(
            `${undoSteps === 1 ? 'One batch command ran, so this is one undo step' : `${undoSteps} `
                + 'batch commands ran, so undoing this takes ' + undoSteps + ' steps'}.`,
        );

        const partial = plan.refusedRooms.length > 0 || result.slabRefusal !== null
            && result.slabRefusal !== undefined;
        span.setAttribute('pryzm.buildFromEnvelope.walls', wallsBuilt);
        span.setAttribute('pryzm.buildFromEnvelope.slabs', slabsBuilt);
        span.setAttribute('pryzm.buildFromEnvelope.ceilings', ceilingsBuilt);
        span.setAttribute('pryzm.buildFromEnvelope.undoSteps', undoSteps);
        emitReport(true, lines, partial ? 'partial' : 'applied');
    } catch (e) {
        console.error('[build-from-envelope-seam] threw:', e);
        emitReport(false, [
            `Building from your envelopes threw: ${String(e)}. PRYZM cannot say how much was `
            + 'created — check the model before running it again.',
        ], 'refused');
    } finally {
        span.end();
    }
}
