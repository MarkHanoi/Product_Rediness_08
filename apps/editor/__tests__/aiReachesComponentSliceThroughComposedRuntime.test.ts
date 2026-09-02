/**
 * @vitest-environment happy-dom
 */
// aiReachesComponentSliceThroughComposedRuntime — §AI-REACHES-THE-SLICE (audit §12 Phase 4H).
//   Spec §64 (the AI test) · §76 gate **D** (AI uses the same command/contract system
//   as the UI) · §39–45 (AI creates INTENT; AI must NOT mutate the database, scene
//   graph, renderer or kernel objects) · §41–42 (a VALUE change vs a RULE) · §75 (do
//   not fake capabilities) · ADR-0324 §1–3 (the invocation envelope) · C16 CA-21 ·
//   audit R12 / R14.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ WHAT THIS FILE PROVES, AND — JUST AS DELIBERATELY — WHAT IT REFUSES TO CLAIM
// ═══════════════════════════════════════════════════════════════════════════════
//
// §76 gate D is ONE sentence with TWO separable claims, and this lane found them in
// opposite states. They are proved and refuted separately below rather than averaged
// into a verdict:
//
//   D-i  "the AI reaches the model through the SAME command system as the UI."
//        ⭐ TRUE, AND NOW EXECUTED (ARMS A–C). The chat's own executor —
//        `runZeroTokenResolution`, whose header says *"Nothing may reach the bus by
//        another route"* — lands `component.place` on a REAL composed runtime's bus,
//        and the occurrence is read back out of `rt.stores.component`, carrying the
//        founder's §64 numbers in canonical metres.
//
//   D-ii "…and the record says it was the AI."
//        ⭐ TRUE AS OF THIS LANE (ARM D), FALSE BEFORE IT. The dispatch carried no
//        `context`, so an AI edit and a toolbar click were byte-identical in the
//        audit trail. ARM D reads the actor off the EventRecord the bus really
//        emitted, and ARM E off its MessagePack ENCODING — because a provenance
//        field that does not survive the wire is not provenance.
//
//   ⛔ AND THE HALF THAT IS NOT TRUE: §64's own sentence, *"create a 1200 × 1500 mm
//      window with a 75 mm aluminium frame"*, DOES NOT REACH THIS FAMILY, and ARM F
//      pins that as a MEASUREMENT rather than leaving it as an impression. The cause
//      is structural and is not a missing matcher: every reference in the component
//      family is a ULID (`fam_` / `typ_` / `par_`), a sentence carries names, and the
//      name→ULID join is a project-level component-definition registry that does not
//      exist at this commit (`PlaceComponent.ts` says so in its own header). Writing
//      a `ChatCapability` over that gap would be the `ElementCapabilities` lie the
//      chat-coverage gate's check 3a exists to reject, so this lane declared the
//      three verbs in `CHAT_UNAVAILABLE` with the reason instead. §75.
//
// ─── ⛔ WHY IT NEVER CONSTRUCTS A BUS OR A STORE ──────────────────────────────
// R12, verbatim: *"Had I probed the DTO store, all fifteen would have shown a correct
// patch and returned a FALSE PASS."* And the pool: a suite that ran the real bus and
// the real ring buffer, green for weeks, while `pool.create` could not be dispatched
// by the application at all — because the SUITE supplied the stores provider. So the
// runtime here comes from `composeRuntime()` (P1, the only permitted route) and is
// installed at `window.runtime`, which is precisely where `ZeroTokenChatBridge` looks
// for it (`win().runtime?.bus`). Delete the `component` descriptor from
// `PluginRegistry.ts` and ARM B goes RED rather than silently empty.
//
// ─── ⚠ WHAT A GREEN HERE DOES *NOT* MEAN ─────────────────────────────────────
//  1. That a component RENDERS. Nothing subscribes this store's dirty channel at this
//     commit; the 3-D leg is Phase 4E's under ADR-0376 D10.
//  2. That a SENTENCE reaches the verb. ARM F measures the opposite, on purpose.
//  3. That the AI can create a RULE (§41–42). ARM G measures that too, and it is 0.
//  4. ⭐ CAVEAT CLOSED BY LANE U0 (2026-09-02): the registry now exists
//     (`src/services/componentCatalog/`) and the handlers ENFORCE definition
//     existence through it — which is why `beforeAll` loads the fixture definition
//     through `packFamily` → the ONE loader before any arm dispatches. The
//     enforcement is proven red-first in
//     `componentCatalogSeamThroughComposedRuntime.test.ts`; a green HERE still
//     does not mean the AI can ENUMERATE definitions (that is lane U6's seam).

import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { ComponentStore } from '@pryzm/plugin-component';
// ⭐ Lane U0 — the SAME singleton PluginRegistry injects into the handlers.
import { componentCatalog } from '../src/services/componentCatalog/index.js';
import { PatchEmitter } from '@pryzm/command-bus';
import {
    resolveUtterance,
    CHAT_UNAVAILABLE,
    type ResolverContext,
    type ZeroTokenResolution,
} from '@pryzm/ai-host';
import {
    runZeroTokenResolution,
    type ZeroTokenUiHooks,
} from '../src/ui/ai/ZeroTokenChatBridge';

const AUDIT = { actorId: 'ai-reaches-slice', projectId: 'ai-reaches-slice', clientId: 'node' } as const;
const LEVEL_ID = 'L0';
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    // ⭐ THE ONE WIRE THAT MAKES THIS AN END-TO-END TEST RATHER THAN A UNIT TEST.
    // `ZeroTokenChatBridge` reaches the bus through `win().runtime?.bus` and nowhere
    // else. Installing the COMPOSED runtime there is exactly what `bootstrap.ts` does
    // in the browser, so the bridge below is talking to the application's real bus,
    // real handler registry and real stores — not to a double.
    (globalThis as any).window.runtime = rt;

    // ⭐ Lane U0 — the fixture definition, through packFamily → the ONE loader,
    // into the catalogue the handlers consult (caveat 4 above, closed). Authored
    // here because there is no corpus (C111 §3.1) — stated, not hidden.
    componentCatalog.clear();
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_HEIGHT, name: 'Height', kind: 'instance', dataType: 'length', defaultValue: 1500, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_FRAME, name: 'FrameDepth', kind: 'instance', dataType: 'length', defaultValue: 75, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_ID, name: 'W1200', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: DEF_ID,
        name: 'AiSliceFixtureWindow',
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'ai-reaches-slice' },
        description: 'ai slice fixture',
        ifcEntity: 'IfcWindow',
        category: 'Window',
        tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: '2026-09-02T00:00:00.000Z',
        lastModifiedAt: '2026-09-02T00:00:00.000Z',
    } as unknown as FamilyManifest;
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error(`[test] packFamily failed: ${(packed as { message?: string }).message}`);
    const loaded = await componentCatalog.loadFromBytes(packed.bytes, { provenance: 'project' });
    if (!loaded.ok) throw new Error(`[test] catalogue load failed: ${loaded.message}`);
}, BUDGET);

afterAll(() => {
    delete (globalThis as any).window.runtime;
});

// ── IDS ──────────────────────────────────────────────────────────────────────
// Real prefixed ULIDs (Crockford base32, no I/L/O/U) because the schema and the
// handlers enforce them — a readable slug would be refused, which is one more reason
// nothing here seeds a store directly.
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const COMPONENT_ID = `component_${ulidN(10)}`;
const DEF_ID = `fam_${ulidN(11)}`;
const TYPE_ID = `typ_${ulidN(12)}`;
const PARAM_WIDTH = `par_${ulidN(13)}`;
const PARAM_HEIGHT = `par_${ulidN(14)}`;
const PARAM_FRAME = `par_${ulidN(15)}`;

/**
 * ⭐ THE FOUNDER'S §64 WINDOW, AS THE MODEL SPELLS IT.
 *
 * *"create a 1200 × 1500 mm window with a 75 mm aluminium frame"* — and every
 * dimension is in **METRES**, because ADR-0376 **D3** ruled one canonical length unit
 * before a line of Phase 4 was written. 1200 mm arriving as `1200` would be a 1000×
 * defect no schema in this repository can detect, so the conversion is asserted
 * explicitly in ARM B rather than assumed.
 */
const S64 = {
    widthMm: 1200,
    heightMm: 1500,
    frameMm: 75,
    widthM: 1.2,
    heightM: 1.5,
    frameM: 0.075,
    material: 'aluminium',
} as const;

const PLACE_PAYLOAD = {
    componentId: COMPONENT_ID,
    levelId: LEVEL_ID,
    definitionId: DEF_ID,
    typeId: TYPE_ID,
    definitionVersion: '1.0.0',
    origin: { x: 0, y: 0, z: 0 },
    rotation: 0,
    materialId: S64.material,
    instanceParameters: {
        [PARAM_WIDTH]: S64.widthM,
        [PARAM_HEIGHT]: S64.heightM,
        [PARAM_FRAME]: S64.frameM,
    },
} as const;

/** The AI's resolution, in the shape the bridge's own executor consumes. */
const S64_RESOLUTION: ZeroTokenResolution = {
    kind: 'commands',
    intent: 'place-component',
    tier: 0,
    summary: `Place a ${S64.widthMm} × ${S64.heightMm} mm component with a ${S64.frameMm} mm ${S64.material} frame`,
    commands: [{ type: 'component.place', payload: PLACE_PAYLOAD as never }],
    // ⛔ FALSE ON PURPOSE. `destructive: true` would make `dispatchCommands` await
    // `hooks.confirm()`, and a test that answers its own Confirm card is testing the
    // card. Placement adds; it destroys nothing.
    destructive: false,
};

/** A minimal live ResolverContext. Nothing under test reads more than this. */
function ctx(selection: readonly { elementId: string; elementType: string }[] = []): ResolverContext {
    return {
        selection,
        levels: [{ id: LEVEL_ID, name: 'Level 0', elevation: 0 }],
        activeLevelId: LEVEL_ID,
        mintId: () => `L${Date.now()}`,
    };
}

/** Records what the chat SAID, so a refusal can be read as text rather than inferred. */
function hooks(): ZeroTokenUiHooks & { said: string[] } {
    const said: string[] = [];
    return {
        said,
        say: (t: string) => { said.push(t); },
        confirm: async () => {
            throw new Error('[test] hooks.confirm was called — no arm here is destructive.');
        },
    };
}

/** ⛔ Read off `rt`, NEVER constructed. */
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) {
        throw new Error(
            '[test] runtime.stores.component is undefined on the REAL composed runtime — the ' +
            'PluginRegistry descriptor or the StoresSlot key is missing (the L-11530 shape).',
        );
    }
    return s;
}

/** ⭐ THE CA-21 READ-BACK: the authoritative record out of the authoritative store. */
function readBack(id: string): any {
    return store().getState().get(id);
}

/**
 * Capture the `EventRecord`s the REAL bus returns, and the `opts` the bridge really
 * sent, by putting a DELEGATE in front of `rt.bus` at `window.runtime`.
 *
 * ⚠ THIS IS NOT A FAKE BUS, AND THE DIFFERENCE IS LOAD-BEARING. It forwards all
 * three arguments to `rt.bus.executeCommand` and returns its real return value; the
 * real handler runs, the real store is written, and every arm still reads the
 * occurrence back out of `rt.stores.component`. A delegate that lied would fail those
 * assertions, not pass them — which is precisely the property a double lacks
 * ([[fake-more-capable-than-real]]: *"a fake built from the header cannot falsify the
 * header"*).
 *
 * ⚠ AND IT IS NOT A CA-21 VIOLATION. CA-21 forbids reading a MUTATION back from
 * anywhere but the authoritative store, and ARMS B/C/D/E all do read the mutation from
 * the store. PROVENANCE is not a mutation: ADR-0324 §3 forbids anything from reading
 * `context`, so it deliberately reaches NO store — the `EventRecord` is its only
 * authoritative home, and reading it anywhere else would be reading a copy.
 *
 * ⛔ WHY NOT SUBSCRIBE TO `CommandBus.patches` INSTEAD? Because the composed
 * runtime's public bus slot does not expose it — `patches` lives on the INNER bus,
 * which is composition-root-private. The first draft of this file tried it and threw
 * `Cannot read properties of undefined (reading 'subscribe')`, which is how the
 * REACHABILITY defect in §ENVELOPE-REACHES-THE-BUS was found one layer down.
 */
function captureRecords(): { records: any[]; opts: any[]; stop: () => void } {
    const records: any[] = [];
    const opts: any[] = [];
    const realBus = rt.bus;
    const delegating = {
        ...realBus,
        async executeCommand(type: string, payload: unknown, o?: unknown) {
            opts.push(o);
            // ⛔ EVERY ARGUMENT FORWARDED, UNCHANGED, TO THE REAL BUS. The command
            // really executes, the real handler runs, the real store changes — which
            // is why each arm below still reads the occurrence back out of
            // `rt.stores.component` and would fail if this delegate lied.
            const rec = await realBus.executeCommand(type, payload, o);
            records.push(rec);
            return rec;
        },
    };
    (globalThis as any).window.runtime = { ...rt, bus: delegating };
    return { records, opts, stop: () => { (globalThis as any).window.runtime = rt; } };
}

describe('§AI-REACHES-THE-SLICE — the chat lands a component through the SAME bus the UI uses, and the record says it was the AI', () => {

    it('ARM A — the bridge and the composition root agree on where the bus is (the axis that silently degrades)', () => {
        // `dispatchCommands` opens with `if (!bus) { say("The command system is not
        // ready yet"); return; }` — a MISSING bus produces a polite sentence and a
        // green-looking test that dispatched nothing. Asserted first, so a later arm
        // cannot pass by that route.
        expect((globalThis as any).window.runtime).toBe(rt);
        expect(typeof rt.bus?.executeCommand).toBe('function');
        expect(store()).toBeInstanceOf(ComponentStore);
        expect(store().storeKey).toBe('component');
    }, BUDGET);

    it('ARM B — ⭐⭐ the AI dispatches §64 through runZeroTokenResolution, and the component is READ BACK OUT OF THE AUTHORITATIVE STORE (C16 CA-21 · §76 D-i)', async () => {
        const h = hooks();
        await runZeroTokenResolution(S64_RESOLUTION, ctx(), h);

        const rec = readBack(COMPONENT_ID);
        expect(rec, 'the occurrence is absent from rt.stores.component — the AI dispatch did not land').toBeDefined();
        expect(rec.type).toBe('component');
        expect(rec.definitionId).toBe(DEF_ID);
        expect(rec.typeId).toBe(TYPE_ID);
        expect(rec.levelId).toBe(LEVEL_ID);

        // ⭐ THE FOUNDER'S NUMBERS, IN CANONICAL METRES (ADR-0376 D3). If any of these
        // read 1200 / 1500 / 75 the unit contract has been violated by a factor of
        // 1000, which is the defect D3 was ruled to make impossible.
        expect(rec.instanceParameters[PARAM_WIDTH]).toBe(S64.widthM);
        expect(rec.instanceParameters[PARAM_HEIGHT]).toBe(S64.heightM);
        expect(rec.instanceParameters[PARAM_FRAME]).toBe(S64.frameM);
        expect(rec.materialId).toBe(S64.material);

        // ⛔ AND THE CHAT DID NOT LIE ABOUT IT. `classifyDispatch` has a state for
        // "promised a report, sent none" and it is NOT success; a refusal or a
        // dispatch failure would have been said out loud. Nothing here may read
        // "Done" while the store is empty, so the transcript is checked too.
        expect(h.said.join(' ')).not.toMatch(/not ready yet|did not complete|Nothing was changed/i);
    }, BUDGET);

    it('ARM C — the AI mutated NOTHING directly: the occurrence exists ONLY because the bus handler ran (§39–45)', async () => {
        // Spec §39–45: *"AI must NOT directly mutate the database, scene graph,
        // renderer or arbitrary kernel objects."* The provable form of that here is
        // that the ONE record in the store is the one the bus produced — so the same
        // dispatch, repeated, is REFUSED by `canExecute`'s duplicate-id guard rather
        // than quietly overwriting. A direct store write would have no such guard.
        const before = readBack(COMPONENT_ID);
        expect(before).toBeDefined();

        const h = hooks();
        await runZeroTokenResolution(S64_RESOLUTION, ctx(), h);

        // The handler refused; the bridge reported it; the record is untouched.
        expect(h.said.join(' ')).toMatch(/did not complete|Nothing was changed/i);
        expect(readBack(COMPONENT_ID)).toEqual(before);
        expect([...store().getState().keys()].filter((k: string) => k === COMPONENT_ID)).toHaveLength(1);
    }, BUDGET);

    it('ARM D — ⭐ THE ACTOR IS STAMPED: the EventRecord the bus emitted says actor.kind === "ai" (ADR-0324 §1–2 · §76 D-ii)', async () => {
        const cap = captureRecords();
        const id = `component_${ulidN(20)}`;
        try {
            await runZeroTokenResolution({
                ...S64_RESOLUTION,
                commands: [{ type: 'component.place', payload: { ...PLACE_PAYLOAD, componentId: id } as never }],
            }, ctx(), hooks());
        } finally {
            cap.stop();
        }

        // The dispatch landed (never inferred from the record alone — CA-21).
        expect(readBack(id)).toBeDefined();

        // ⭐ BOTH HALVES, SEPARATELY. (1) the bridge SENT the envelope, and (2) the
        // composition root's bus slot FORWARDED it far enough to reach the record.
        // Before §ENVELOPE-REACHES-THE-BUS, (1) was true and (2) was false — the slot
        // declared two parameters and dropped the third in silence.
        expect(cap.opts.at(-1)?.context?.actor?.kind, 'the bridge did not send an actor').toBe('ai');

        const placed = cap.records.filter((r) => r?.type === 'component.place');
        expect(placed, 'the bus returned no component.place record').toHaveLength(1);
        const record = placed[0];

        // ⭐ THE POINT OF THE LANE. Before this change the assertion below read
        // `undefined`, and an AI-authored edit was indistinguishable from a click.
        expect(record.context).toBeDefined();
        expect(record.context.actor.kind).toBe('ai');
        // ⚠ ADR-0324 §2, verbatim: *"never stamp actorId='ai' as a substitute"* —
        // WHO and WHERE are separate fields and both are checked.
        expect(record.context.origin.surface).toBe('chat');
        // ⛔ And no manufactured approval: `hooks.confirm()` is a UI confirmation, not
        // the proposal→validate→approve record `CommandApproval` means. Absent is the
        // honest value, and the absence is asserted so a later lane cannot fabricate one.
        expect(record.context.approval).toBeUndefined();
    }, BUDGET);

    it('ARM E — the provenance SURVIVES THE WIRE: it round-trips the MessagePack encoding the event log persists', async () => {
        // A `context` that existed only on the JS object would vanish at the
        // persistence boundary, and "the audit trail records the AI" would then be
        // false for every consumer that reads bytes. `PatchEmitter.encode` is the
        // exact encoder `CommandBus` runs on every record before handing it to
        // subscribers (`EventLogPersistor` among them), so the record is put through
        // it and read back out.
        const cap = captureRecords();
        const id = `component_${ulidN(21)}`;
        try {
            await runZeroTokenResolution({
                ...S64_RESOLUTION,
                commands: [{ type: 'component.place', payload: { ...PLACE_PAYLOAD, componentId: id } as never }],
            }, ctx(), hooks());
        } finally {
            cap.stop();
        }
        expect(readBack(id)).toBeDefined();

        const placed = cap.records.filter((r) => r?.type === 'component.place');
        expect(placed).toHaveLength(1);
        const roundTripped = PatchEmitter.decode(PatchEmitter.encode(placed[0])) as any;
        expect(roundTripped.context.actor.kind).toBe('ai');
        expect(roundTripped.context.origin.surface).toBe('chat');
    }, BUDGET);

    it('ARM F — ⛔ THE MEASUREMENT, NOT AN IMPRESSION: §64’s own sentence does NOT reach this family, and the chat says why instead of guessing (§75)', () => {
        const sentence = 'create a 1200 x 1500 mm window with a 75 mm aluminium frame';
        const r = resolveUtterance(sentence, ctx());

        // ⭐ THE ONLY OUTCOME THIS LANE WOULD HAVE TREATED AS A DEFECT: the ladder
        // producing a `component.*` command from a sentence that cannot possibly
        // carry a `fam_`/`typ_` ULID. That would mean somebody had invented an id.
        const emitted = r.kind === 'commands' ? r.commands.map((c) => c.type) : [];
        expect(emitted.filter((t) => t.startsWith('component.'))).toEqual([]);

        // …and the three verbs are DECLARED unreachable with a reason a user can read,
        // rather than left in the undeclared bulk where the answer is
        // "I'm not sure how to help with that yet" — the c1902a5a defect exactly.
        for (const verb of ['component.place', 'component.setInstanceParameter', 'component.swapType']) {
            const reason = CHAT_UNAVAILABLE.get(verb);
            expect(reason, `${verb} is not declared to the chat`).toBeDefined();
            // The sentence must name the MISSING PIECE, not merely decline.
            expect(reason!.length).toBeGreaterThan(60);
            expect(reason!.toLowerCase()).toMatch(/id|catalogue|definition/);
        }
    }, BUDGET);

    it('ARM G — §41–42: the AI can carry a VALUE, and cannot create a RULE — measured on the resolver surface, not asserted', () => {
        // Spec §41–42 requires the AI to distinguish *"make it 1200 wide"* (a value)
        // from *"make the width twice the height"* (a real formula). ARM B proved the
        // value half end-to-end. This arm measures the rule half, and the measurement
        // is the finding: there is no formula-bearing intent anywhere in the chat's
        // vocabulary, so a rule sentence cannot be MISTAKEN for a value either — it
        // simply is not understood, which is the honest failure of the two.
        const ruleSentences = [
            'make the width twice the height',
            'make the glass width always the opening width minus two times the frame width',
            'make the frame width proportional to the height',
        ];
        for (const s of ruleSentences) {
            const r = resolveUtterance(s, ctx());
            // ⛔ It must not silently become a VALUE. A resolver that read "twice" as
            // a number and set width = 2 would be spec §75's forbidden shape: the AI
            // saying "the width is now proportional to the height" with no formula
            // behind it. Anything but a `commands` result is acceptable here; a
            // `commands` result is not.
            expect(r.kind, `"${s}" produced commands — a rule was silently flattened into a value`).not.toBe('commands');
        }
    }, BUDGET);
});
