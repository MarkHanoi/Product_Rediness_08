// §RAC-BUILD-FROM-ENVELOPE (L-13176) — the chat seam that turns the founder's
// *"create walls and slabs from my envelope"* into real elements.
//
// ⭐ WHAT THIS SUITE IS FOR, AND WHY IT LIVES IN `apps/editor`.
//
// The capability's language half is pinned in `capability-acceptance.test.ts`
// (packages/ai-host): the sentence reaches the intent, the intent emits ONE bus
// command, the neighbours do not steal it. Everything BELOW that line — the join
// to the real builder, the licensed copies, the report the transcript renders —
// can only be asserted from here, because `packages/ai-host` is L2 and may not
// import `apps/editor`. This file is the only place in the repo that can see
// BOTH the resolver's copy and the planner's array at once, which is exactly
// what a pinned licensed copy needs (C84 EI-8a).
//
// ⛔ THE FIXTURE IS NOT MORE CAPABLE THAN THE THING IT STANDS IN FOR
// (C67 §4 rule 13). The REAL `planBuildFromDesign` and the REAL
// `executeBuildFromDesign` run here; only the four browser-global accessors are
// injected, and they are injected through the PANEL'S OWN
// `ParcelLawCreateHouseDeps` type, so this suite cannot accidentally drive a
// different shape than the button does. The bus is a RECORDER, not a
// re-implementation: it captures the payloads the executor really dispatches.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    runBuildFromEnvelope,
    type BuildFromEnvelopeDeps,
} from '../../generation/buildFromEnvelopeChatSeam';
import {
    BUILD_FROM_DESIGN_WILL_NOT_CREATE,
} from '../../site/buildFromDesignPlan';
import {
    executeBuildFromDesign,
    type BuildFromDesignResult,
} from '../../site/buildFromDesignExecutor';
import {
    DEFERRED_PART_REASON,
    BUILD_FROM_ENVELOPE_VERB,
} from '@pryzm/ai-host';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../../../../../..');
const read = (p: string): string => readFileSync(resolve(REPO, p), 'utf8');

// ─── The fixture: one level envelope, two room envelopes, on L0 ─────────────
//
// A square 10 × 10 m level plate with two 4 × 4 m rooms inside it — the smallest
// design that produces shell walls, partition walls AND a floor plate, so every
// half of the report has something real to say.

interface RawEnvelope {
    id: string;
    levelId: string;
    name: string;
    role: 'level' | 'room';
    withinId: string | null;
    baseOffset: number;
    height: number;
    footprint: { x: number; z: number }[];
}

const square = (x0: number, z0: number, side: number): { x: number; z: number }[] => [
    { x: x0, z: z0 },
    { x: x0 + side, z: z0 },
    { x: x0 + side, z: z0 + side },
    { x: x0, z: z0 + side },
];

function envelopeStoreOf(rows: readonly RawEnvelope[]): { getState: () => ReadonlyMap<string, unknown> } {
    const m = new Map<string, unknown>();
    for (const r of rows) m.set(r.id, r);
    return { getState: () => m };
}

const LEVEL_ENVELOPE: RawEnvelope = {
    id: 'env-level', levelId: 'L0', name: 'Level envelope', role: 'level',
    withinId: null, baseOffset: 0, height: 3, footprint: square(0, 0, 10),
};
const ROOM_A: RawEnvelope = {
    id: 'env-room-a', levelId: 'L0', name: 'Room A', role: 'room',
    withinId: 'env-level', baseOffset: 0, height: 3, footprint: square(1, 1, 4),
};
const ROOM_B: RawEnvelope = {
    id: 'env-room-b', levelId: 'L0', name: 'Room B', role: 'room',
    withinId: 'env-level', baseOffset: 0, height: 3, footprint: square(5, 5, 4),
};

/** Every bus command the REAL executor dispatched, in order. */
let dispatched: { type: string; payload: unknown }[] = [];
/** Every `pryzm-generation-report` the seam emitted. */
let reports: { success: boolean; info: string[]; outcome?: string }[] = [];

let mintSeq = 0;

function runtimeWith(rows: readonly RawEnvelope[], opts: { failSlab?: boolean } = {}): unknown {
    return {
        stores: { spaceEnvelope: envelopeStoreOf(rows) },
        bus: {
            executeCommand: (type: string, payload: unknown) => {
                dispatched.push({ type, payload });
                if (opts.failSlab === true && type === 'slab.batch.create') {
                    throw new Error('the slab store refused: boundary self-intersects');
                }
                return Promise.resolve(undefined);
            },
        },
    };
}

/**
 * The panel's deps, with ONLY the browser globals stood in for.
 *
 * `buildFromDesign` is the REAL `executeBuildFromDesign`. Its own injected deps
 * are the executor's documented seam: the bus is the recorder above, `graph`
 * returns `null` (which the executor documents as "the link leg is disabled and
 * the report SAYS so" — not a silent skip), and `mintId` is deterministic so a
 * payload assertion is stable.
 */
function depsFor(rt: unknown, wallCount = 0): BuildFromEnvelopeDeps {
    return {
        runtime: () => rt as never,
        activeLevelId: () => 'L0',
        authoredWallCount: () => wallCount,
        buildHouse: () => { throw new Error('the generator arm must never be reached from this seam'); },
        buildFromDesign: (
            r: Parameters<typeof executeBuildFromDesign>[0],
            plan: Parameters<typeof executeBuildFromDesign>[1],
        ): Promise<BuildFromDesignResult> => executeBuildFromDesign(r, plan, {
            bus: (x) => (x as unknown as { bus: { executeCommand(t: string, p: unknown): Promise<unknown> } }).bus,
            graph: () => null,
            mintId: (prefix) => `${prefix}-${++mintSeq}`,
        }),
    } as unknown as BuildFromEnvelopeDeps;
}

function onReport(e: Event): void {
    const d = (e as CustomEvent).detail as { success: boolean; info: string[]; outcome?: string };
    reports.push(d);
}

beforeEach(() => {
    dispatched = [];
    reports = [];
    mintSeq = 0;
});

describe('build-from-envelope seam — ONE command path, two entry points', () => {
    it('dispatches the SAME two batch verbs the panel button dispatches, in that order', async () => {
        window.addEventListener('pryzm-generation-report', onReport);
        try {
            await runBuildFromEnvelope({ parts: ['walls', 'floor-plate'] },
                depsFor(runtimeWith([LEVEL_ENVELOPE, ROOM_A, ROOM_B])));
        } finally {
            window.removeEventListener('pryzm-generation-report', onReport);
        }
        // ⭐ THE JOIN. Not a planner's return value — the commands the REAL
        // executor put on the bus. If this seam ever grew a builder of its own,
        // these two rows are what would change.
        expect(dispatched.map((d) => d.type)).toEqual(['wall.batch.create', 'slab.batch.create']);
        const walls = (dispatched[0]!.payload as { levelId: string; walls: unknown[] });
        expect(walls.levelId).toBe('L0');
        expect(walls.walls.length).toBeGreaterThan(0);
        const slabs = (dispatched[1]!.payload as { levelId: string; slabs: unknown[] });
        expect(slabs.levelId).toBe('L0');
        expect(slabs.slabs).toHaveLength(1);
    });

    it('reports the REAL counts and the honest TWO-step undo cost', async () => {
        window.addEventListener('pryzm-generation-report', onReport);
        try {
            await runBuildFromEnvelope({}, depsFor(runtimeWith([LEVEL_ENVELOPE, ROOM_A, ROOM_B])));
        } finally {
            window.removeEventListener('pryzm-generation-report', onReport);
        }
        expect(reports).toHaveLength(1);
        const r = reports[0]!;
        expect(r.success).toBe(true);
        expect(r.outcome).toBe('applied');
        const text = r.info.join(' | ');
        // The wall count in the report is the number of ids the executor minted,
        // which is the number of walls it dispatched — read off the result, never
        // recomputed here (C67 §4 rule 6: never re-narrated).
        const wallsDispatched = (dispatched[0]!.payload as { walls: unknown[] }).walls.length;
        expect(text).toContain(`Built ${wallsDispatched} walls`);
        expect(text).toContain('and the floor plate');
        expect(text).toContain('2 ceilings');
        // ADR-0314 — runBatch is undo-NEUTRAL, so THREE batch commands are THREE
        // history entries, and the report says so rather than claiming one.
        // ⭐ THIS LINE MOVED FROM "2 ... 2" WHEN §BIM-FROM-THE-DESIGN ADDED
        // `ceiling.batch.create`. It is asserted on the REPORT, which counts what
        // actually ran — not on the resolver's pre-dispatch estimate.
        expect(text).toContain('3 batch commands ran, so undoing this takes 3 steps');
    });

    it('a walls-only ask dispatches ONE batch command and reports ONE undo step', async () => {
        window.addEventListener('pryzm-generation-report', onReport);
        try {
            await runBuildFromEnvelope({ parts: ['walls'] },
                depsFor(runtimeWith([LEVEL_ENVELOPE, ROOM_A, ROOM_B])));
        } finally {
            window.removeEventListener('pryzm-generation-report', onReport);
        }
        expect(dispatched.map((d) => d.type)).toEqual(['wall.batch.create']);
        expect(reports[0]!.info.join(' | ')).toContain('One batch command ran, so this is one undo step');
    });

    it('relays the plan\'s OWN refusal verbatim, and dispatches NOTHING', async () => {
        window.addEventListener('pryzm-generation-report', onReport);
        try {
            // No room envelopes ⇒ `planBuildFromDesign` refuses with
            // `no-room-envelopes` in its own words.
            await runBuildFromEnvelope({}, depsFor(runtimeWith([LEVEL_ENVELOPE])));
        } finally {
            window.removeEventListener('pryzm-generation-report', onReport);
        }
        expect(dispatched).toHaveLength(0);
        expect(reports).toHaveLength(1);
        expect(reports[0]!.success).toBe(false);
        expect(reports[0]!.outcome).toBe('refused');
        // ⭐ VERBATIM, not paraphrased. The assertion is that the seam did not
        // author this sentence: it is byte-identical to the planner's, which we
        // obtain by running the planner ourselves.
        const { planBuildFromDesign, readDesignEnvelopes } =
            await import('../../site/buildFromDesignPlan');
        const outcome = planBuildFromDesign({
            envelopes: readDesignEnvelopes(envelopeStoreOf([LEVEL_ENVELOPE])),
            activeLevelId: 'L0',
            authoredWallCountOnActiveLevel: 0,
        });
        expect(outcome.ok).toBe(false);
        if (outcome.ok) return;
        expect(reports[0]!.info).toEqual([outcome.refusal.text]);
    });

    it('an unreadable envelope store is a DIFFERENT answer from an empty one', async () => {
        // §CONTEXT-DATA-HONESTY — a failure and an empty result are the same
        // VALUE and must never be the same MESSAGE. `readDesignEnvelopes` returns
        // null for the first and [] for the second, and the plan gives each its
        // own refusal; the seam relays whichever it gets and invents neither.
        window.addEventListener('pryzm-generation-report', onReport);
        try {
            await runBuildFromEnvelope({}, depsFor({ stores: {} }));
            await runBuildFromEnvelope({}, depsFor(runtimeWith([])));
        } finally {
            window.removeEventListener('pryzm-generation-report', onReport);
        }
        expect(reports).toHaveLength(2);
        expect(reports[0]!.success).toBe(false);
        expect(reports[1]!.success).toBe(false);
        expect(reports[0]!.info[0]).not.toBe(reports[1]!.info[0]);
    });

    it('a slab refused AFTER the walls committed reports a PARTIAL, keeping the walls', async () => {
        window.addEventListener('pryzm-generation-report', onReport);
        try {
            await runBuildFromEnvelope({},
                depsFor(runtimeWith([LEVEL_ENVELOPE, ROOM_A, ROOM_B], { failSlab: true })));
        } finally {
            window.removeEventListener('pryzm-generation-report', onReport);
        }
        // The walls stayed — the executor deliberately does not roll them back
        // ("the walls ARE the deliverable"), so the report must not read like a
        // total failure OR like a clean success.
        // ⭐ THE CEILING BATCH STILL RUNS AFTER THE PLATE IS REFUSED, and that is
        // the executor's documented stance extended one verb: a refusal of one
        // part does not cancel the parts that can still be built, and each is
        // reported on its own. The walls AND the ceilings are kept; only the
        // plate is missing, and `slabRefusal` is what says so.
        expect(dispatched.map((d) => d.type))
            .toEqual(['wall.batch.create', 'slab.batch.create', 'ceiling.batch.create']);
        const r = reports[0]!;
        expect(r.outcome).toBe('partial');
        const text = r.info.join(' | ');
        expect(text).toContain('refused AFTER the walls committed, and the walls were kept');
        // The STORE's own reason, not a generic sentence.
        expect(text).toContain('boundary self-intersects');
        // ⭐ TWO, NOT ONE, AND COUNTED FROM WHAT COMMITTED. The walls and the
        // ceilings both landed; only the plate was refused. This line said "One
        // batch command" when walls were the only survivor of a plate refusal —
        // repeating it now would have told the user one undo undoes the gesture
        // while two entries sat on the stack.
        expect(text).toContain('2 batch commands ran, so undoing this takes 2 steps');
    });

    it('no runtime is an admission about PRYZM, not a finding about the design', async () => {
        window.addEventListener('pryzm-generation-report', onReport);
        try {
            await runBuildFromEnvelope({}, depsFor(null));
        } finally {
            window.removeEventListener('pryzm-generation-report', onReport);
        }
        expect(dispatched).toHaveLength(0);
        expect(reports[0]!.success).toBe(false);
        expect(reports[0]!.info[0]).toContain('no runtime');
    });
});

describe('the seam is a RELAY — the properties that stop it becoming a second builder', () => {
    const SEAM = 'apps/editor/src/ui/generation/buildFromEnvelopeChatSeam.ts';

    it('calls planBuildFromDesign exactly once and mints no geometry', () => {
        const src = read(SEAM);
        const calls = (src.match(/\bplanBuildFromDesign\(/g) ?? []).length;
        expect(calls, 'the seam must plan ONCE, through the shared planner').toBe(1);
        // ⛔ THE TRIPWIRE. The cheapest-looking way to add a ceiling before the
        // builder can make one is ten lines of maths in this file — and it would
        // pass its own tests while drifting from the panel button. Trigonometry,
        // area arithmetic and ring walking have no business here.
        for (const forbidden of ['Math.atan2', 'Math.hypot', 'Math.cos(', 'Math.sin(', 'Math.sqrt(']) {
            expect(src.includes(forbidden), `${forbidden} is geometry — the seam must not compute it`)
                .toBe(false);
        }
        // And it must reach the builder through the PANEL's own wiring object.
        expect(src).toContain('defaultParcelLawCreateHouseDeps');
    });

    it('the executor dispatches exactly THREE batch verbs — the number every surface quotes', () => {
        // ⭐ THE PIN THAT KEEPS THE "TWO UNDO STEPS" SENTENCE HONEST. The
        // resolver's Confirm-card copy, the registry row's comment and the
        // seam's report all state a cost this file's SUBJECT decides. When lane
        // BIM-BUILD adds ceilings or a roof as a THIRD batch verb, this goes RED
        // and the copy is forced to move — instead of the copy quietly rotting.
        const exec = read('apps/editor/src/ui/site/buildFromDesignExecutor.ts');
        const verbs = [...exec.matchAll(/executeCommand\('([a-z.-]+)'/g)].map((m) => m[1]);
        expect(verbs).toEqual(['wall.batch.create', 'slab.batch.create', 'ceiling.batch.create']);
    });

    it('the BATCH_REPORT_EVENTS row exists — without it the transcript prints a canned "Done"', () => {
        // L-996, third recurrence, in the ONE place its own guard cannot look:
        // `batchReportEventsCompleteness.spec.ts` derives its required keys from
        // `plugins/**`, so an apps/-side seam verb missing from the table trips
        // NOTHING and prints the planned summary plus "Done" over a refusal.
        const bridge = read('apps/editor/src/ui/ai/ZeroTokenChatBridge.ts');
        expect(bridge).toContain(`'${BUILD_FROM_ENVELOPE_VERB}': 'pryzm-generation-report'`);
        // …and the seam really emits on that event.
        expect(read(SEAM)).toContain("'pryzm-generation-report'");
    });

    it('the bus verb is registered, and it is NOT one of the two internal batch verbs', () => {
        const handlers = read('apps/editor/src/engine/initBusHandlers.ts');
        expect(handlers).toContain(`type: '${BUILD_FROM_ENVELOPE_VERB}'`);
        expect(handlers).toContain('buildFromEnvelopeChatSeam.js');
        // C68 §5.b — the three declaration surfaces are DISJOINT. Naming a
        // C-classified batch verb as this capability's own would put one verb on
        // two of them and fail the coverage gate.
        expect(BUILD_FROM_ENVELOPE_VERB).not.toBe('wall.batch.create');
        expect(BUILD_FROM_ENVELOPE_VERB).not.toBe('slab.batch.create');
    });
});

describe('the licensed copies are PINNED to the planner, not to a comment (C84 EI-8a)', () => {
    it('the roof refusal repeats the planner\'s OWN sentence', () => {
        // `BUILD_FROM_DESIGN_WILL_NOT_CREATE` is the single source of the "this
        // pass does not build X" sentences. The resolver lives at L2 and cannot
        // import it, so the copy is pinned HERE — the one place that sees both.
        // ⚠ MATCHED CASE-INSENSITIVELY ON PURPOSE. The planner spells it `a ROOF`
        // for emphasis in the panel's list; pinning the exact casing made this arm
        // fail on a presentation edit that changed no meaning, which teaches the
        // next reader to loosen the pin rather than to move the copy.
        const roofLine = BUILD_FROM_DESIGN_WILL_NOT_CREATE
            .find((s) => s.toLowerCase().startsWith('a roof'));
        expect(roofLine, 'the planner no longer names a roof — narrow the chat refusal too')
            .toBeDefined();
        for (const phrase of [
            'no space envelope carries a roof form',
            'Ask for one on the house arm, where the form is an input you give',
        ]) {
            expect(roofLine!).toContain(phrase);
            expect(DEFERRED_PART_REASON.roof).toContain(phrase);
        }
    });

    it('the floor-finish refusal repeats the planner\'s ROOM-RECORD sentence', () => {
        const roomLine = BUILD_FROM_DESIGN_WILL_NOT_CREATE.find((s) => s.startsWith('room records'));
        expect(roomLine, 'the planner now creates room records — the chat refusal must narrow')
            .toBeDefined();
        expect(roomLine!).toContain('room detection runs over the built walls');
        expect(DEFERRED_PART_REASON['floor-finishes'])
            .toContain('ROOM records, and this pass creates none');
        expect(DEFERRED_PART_REASON['floor-finishes'])
            .toContain('room detection runs over them afterwards');
    });

    it('⛔ CEILINGS ARE NOT A DEFERRED PART ANY MORE — the executor builds them', () => {
        // §BIM-FROM-THE-DESIGN taught the executor `ceiling.batch.create`. While
        // `ceilings` stayed in the deferred vocabulary the Confirm card said "it
        // does NOT build ceilings" about a pass that builds them — a refusal
        // about work the product had already done, which is the worst kind
        // because the user acts on it. This arm is the tripwire pointing the
        // other way: it goes red if anyone re-defers the word without removing
        // the verb.
        expect(Object.keys(DEFERRED_PART_REASON).sort()).toEqual(['floor-finishes', 'roof']);
        expect(BUILD_FROM_DESIGN_WILL_NOT_CREATE.some((s) => /ceiling/i.test(s))).toBe(false);
    });

    it('what the pass does not create is relayed from the PLAN, never retyped', () => {
        // The seam prints `plan.willNotCreate` — computed per plan — so a line
        // deleted from the planner's array disappears from the chat reply in the
        // SAME commit, with no review and no second copy.
        expect(read('apps/editor/src/ui/generation/buildFromEnvelopeChatSeam.ts'))
            .toContain('plan.willNotCreate');
    });
});
