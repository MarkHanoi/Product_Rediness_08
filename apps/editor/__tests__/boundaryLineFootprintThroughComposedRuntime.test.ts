/**
 * @vitest-environment happy-dom
 */
// §BLSTORE-COMPOSED-PLUGIN-STORES (L-11060..L-11063 · C106 §7.2 · C84 EI-1) — the
// boundary line reaches the CHAT FOOTPRINT READER, proven on the runtime
// `composeRuntime()` actually produces.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS AND `boundaryLineReachableThroughComposedRuntime` DID NOT
// CATCH THE DEFECT IT IS NAMED FOR
// ═══════════════════════════════════════════════════════════════════════════════
//
// That file's header says it reads `rt.stores.boundaryLine` "off the REAL
// composition root". ⛔ IT DOES NOT. It calls `bootstrapWithEverything({audit})`
// DIRECTLY — the data half — and P1 (CLAUDE.md) makes `composeRuntime()` the only
// way production obtains a runtime. `composedBusElementReadback.test.ts` already
// recorded this exact shape for `hello-12-elements`, in its own header, months ago:
// booting the data half directly measures a DIFFERENT OBJECT than the one the
// browser holds.
//
// The two objects disagreed, and the disagreement was the founder's #1 blocker.
// MEASURED, before the fix:
//
//   composeRuntime()          -> Object.keys(rt.stores) = ['elements',
//                                'registerHydrator','hydrate','viewState','project']
//                                rt.stores.boundaryLine === undefined
//   bootstrapWithEverything() -> 29 keys, boundaryLine = a real BoundaryLineStore
//
// So `boundaryLineReachableThroughComposedRuntime` was GREEN on all 13 of its cases
// while `generationChatSeam` refused every build with *"I can't read the
// boundary-line store in this session"* — and the plan projector, and the
// serializer, read the same `undefined`.
//
// ⭐ THAT FILE IS DELIBERATELY LEFT AS IT IS. Its real job — "every
// `boundaryLine.*` verb dispatches and its patch lands in the ONE store" — is a
// data-half claim and is correctly measured at the data half (its environment is
// `node`; `composeRuntime` needs a DOM). THIS file carries the reachability claim,
// the same division `composedBusElementReadback` / `hello-12-elements` already use.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────────
//
// Nothing on the measured path is stubbed. The runtime is a real `composeRuntime`;
// the bus is its real bus; the store is the instance `PluginRegistry` built and the
// bus writes through; the seam is the real `generationChatSeam` the chat bridge
// dispatches into, reached through the real `window.runtime`; the transcript is read
// off the real `pryzm-generation-report` CustomEvent the real `emitReport` fires.
//
// ONE substitution, declared: `window.projectContext.activeLevelId`. That global is
// what `resolveActiveLevelId()` reads (activeLevel.ts:19-27) and what the editor's
// project context sets in the browser. It is an INPUT the browser supplies and a
// headless process does not — not a stand-in for anything on the measured path — and
// supplying it makes these arms MORE faithful, because the seam's level filter then
// runs against a line authored on that level, which is the founder's case exactly.
//
// ⚠ WHAT IS **NOT** PROVEN HERE, stated so nobody reads more into a green run: that
// the residential generator then WRITES elements. `ResidentialBuildingExecutor`
// requires the browser-only legacy `commandManager` global and refuses without it.
// J-3c records that it reaches that gate only AFTER the controller accepted the
// footprint and the orchestrator returned OK on it — so the leg these arms pin is
// STORE → FOOTPRINT → GENERATOR, which is the leg L-11060 broke. The element writes
// are measured in the browser.

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import { runGenerationBuilding, resolveGenerationFootprint } from '../src/ui/generation/generationChatSeam.js';

const AUDIT = { actorId: 'blstore62', projectId: 'blstore62', clientId: 'node' } as const;

// ⚠ REAL BRANDED ULIDs — `defineElement('boundaryLine')` builds
// /^boundaryLine_[0-9A-HJKMNP-TV-Z]{26}$/ (Crockford base32), so a readable slug is
// rejected at parse() and the failure would look like a handler bug.
const BL = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H10';
const LEVEL = 'L0';

/** A CLOSED 20 × 20 m square — a real footprint, not a degenerate ring. The closing
 *  vertex is NOT repeated (the schema's open-loop convention). */
const SQUARE = [
    { x: 0, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
    { x: 20, y: 0, z: 20 },
    { x: 0, y: 0, z: 20 },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let priorRuntime: unknown;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    priorRuntime = (window as unknown as { runtime?: unknown }).runtime;
    (window as unknown as { runtime?: unknown }).runtime = rt;
    (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: LEVEL };
}, 600_000);

afterAll(() => {
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

/** Collect the `pryzm-generation-report` the seam emits during `fn`. */
async function transcriptOf(fn: () => Promise<void>): Promise<{ success: boolean; info: string[] }> {
    let seen: { success: boolean; info: string[] } | null = null;
    const listener = (e: Event): void => {
        const d = (e as CustomEvent).detail as { success: boolean; info: string[] };
        seen = { success: d.success === true, info: [...(d.info ?? [])] };
    };
    window.addEventListener('pryzm-generation-report', listener);
    try { await fn(); } finally { window.removeEventListener('pryzm-generation-report', listener); }
    // A seam that emitted NOTHING is not a pass — the bridge would render a generic
    // "Done" over a build that never happened.
    expect(seen, 'the seam emitted no pryzm-generation-report at all').not.toBeNull();
    return seen!;
}

/** The exact refusal L-11060 was: the store could not be READ. */
const UNREADABLE = /can't read the boundary-line store in this session/;

describe('§BLSTORE-COMPOSED-PLUGIN-STORES — the drawn line reaches the chat footprint reader', () => {
    it('J-1: ⭐ the COMPOSED runtime exposes `stores.boundaryLine`, and it can answer getState()', () => {
        // THE ROW. Before the fix this was `undefined` on the composed runtime while
        // being a real store one layer down, and every consumer reached it through a
        // cast, so neither the compiler nor a test could see the difference.
        expect(rt.stores.boundaryLine).toBeDefined();
        expect(typeof rt.stores.boundaryLine.getState).toBe('function');
        expect(rt.stores.boundaryLine.getState()).toBeInstanceOf(Map);
    });

    it('J-2: ⭐ it is the SAME INSTANCE the bus writes through — adopted, not constructed', async () => {
        // Identity is the property, asserted by BEHAVIOUR rather than by `toBe`: a
        // rival store built by the composer would also satisfy J-1 and would leave the
        // chat reading an empty map while the drawn line sat in the other one. A
        // dispatch through the composed bus must be visible in the composed slot
        // ([[committed-is-not-reachable]]).
        await rt.bus.executeCommand('boundaryLine.create', {
            boundaryLineId: BL,
            levelId: LEVEL,
            vertices: SQUARE,
            closed: true,
            drawMode: 'rectangular',
        });
        const rec = rt.stores.boundaryLine.getState().get(BL) as
            { levelId: string; closed: boolean; vertices: unknown[] } | undefined;
        expect(rec, 'the composed slot did not see the bus write — it is a RIVAL store').toBeDefined();
        expect(rec!.levelId).toBe(LEVEL);
        expect(rec!.closed).toBe(true);
        expect(rec!.vertices).toHaveLength(4);
    });

    it('J-3: THE JOIN — the seam resolves the DRAWN LINE into the generator footprint', async () => {
        // ⭐⭐ THE ARM THAT MATTERS, and it asserts the POLYGON rather than a downstream
        // sentence. `resolveGenerationFootprint` is the seam's ONE footprint decision
        // — the same call `runResidential`, `runHouse` and `runOffice` each make — and
        // it is the exact leg L-11060 broke.
        const src = await resolveGenerationFootprint(rt, {
            typology: 'residential-building',
            floors: 5,
            footprintSource: 'boundary-line',
        });
        expect(src.ok, `the seam still refused: ${(src as { reason?: string }).reason ?? ''}`).toBe(true);
        if (!src.ok) return;

        // The ring is the line the bus drew, corner for corner — not the parcel, not a
        // guess, not a bounding box.
        expect(src.footprint).toHaveLength(4);
        const key = (p: { x: number; z: number }): string => `${p.x},${p.z}`;
        expect(new Set(src.footprint.map(key))).toEqual(
            new Set(SQUARE.map((v) => key({ x: v.x, z: v.z }))),
        );

        // ⭐ AND IT SAYS WHICH LINE IT USED. §GEN-ON-BOUNDARY-LINE: a build on the
        // wrong line that says nothing is the silent-success shape this seam exists to
        // stop, so the note is part of the contract, not decoration.
        expect(src.note).not.toBeNull();
        expect(src.note!).toContain(BL);
        expect(src.note!, 'the note must quote the measured area').toMatch(/400\s*m²/);
    }, 600_000);

    it('J-3b: THE CONTRAST — the SAME call on the parcel path comes back EMPTY, in the same process', async () => {
        // What makes J-3 attributable rather than lucky. No parcel is loaded here, so
        // the parcel arm must resolve to nothing — which is what the founder used to
        // get for BOTH sources. Two sources, one process, measurably different.
        const src = await resolveGenerationFootprint(rt, { typology: 'residential-building', floors: 5 });
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.footprint).toHaveLength(0);
        expect(src.note).toBeNull();
    }, 600_000);

    it('J-3c: the CHAT ENTRY POINT carries it — no footprint-family refusal reaches the transcript', async () => {
        // The layer the founder experiences: his sentence, mapped to
        // `generation.building`, arriving at the SAME exported function the
        // ZeroTokenChatBridge dispatches to, with the SAME `window.runtime`.
        const t = await transcriptOf(() => runGenerationBuilding({
            typology: 'residential-building',
            floors: 5,
            footprintSource: 'boundary-line',
        }));
        const all = t.info.join(' | ');

        // (a) THE DEFECT IS GONE — the store-read refusal is not what comes back.
        expect(all, `still refusing at the store read: ${all}`).not.toMatch(UNREADABLE);
        // (b) it did not silently fall through to the PARCEL, whose arm reports this.
        expect(all, `fell through to the parcel arm: ${all}`)
            .not.toMatch(/there is no site boundary to build on/);
        // (c) ⭐ THE GENERATOR ITSELF ACCEPTED THE RING. `ResidentialBuildingController`
        // refuses with 'no footprint' when `req.footprint.length < 3` AND its fallback
        // `readActiveFootprint` finds no shell — which is this process exactly. Not
        // hearing it means the ring arrived and the orchestrator ran on it.
        expect(all, `the generator never received the ring: ${all}`).not.toMatch(/no footprint/);
        expect(all, `the level filter disagreed: ${all}`).not.toMatch(/no active level/);

        // ⚠ WHAT STOPS HERE, AND WHY IT IS NOT ASSERTED AS A BUILD. Measured today the
        // transcript reads *"no command manager"* — `ResidentialBuildingExecutor` needs
        // the browser-only legacy `commandManager` global, and it reaches that gate
        // only AFTER the controller accepted the footprint and the orchestrator
        // returned a `ResidentialBuildingOk` on it. The remaining leg is element
        // WRITES, which no headless process can perform; it is measured in the browser.
    }, 600_000);

    it('J-4: ⛔ the UNREADABLE refusal SURVIVES — the fix is not "delete the guard"', async () => {
        // The arm that stops a later lane from "simplifying" this into a guessed
        // footprint. With no store on the runtime the seam must still say UNREADABLE
        // — never EMPTY, never a parcel substitution ([[context-data-honesty-family]]).
        const w = window as unknown as { runtime?: unknown };
        const real = w.runtime;
        w.runtime = { ...rt, stores: { ...rt.stores, boundaryLine: undefined } };
        try {
            const t = await transcriptOf(() => runGenerationBuilding({
                typology: 'residential-building',
                floors: 5,
                footprintSource: 'boundary-line',
            }));
            expect(t.success).toBe(false);
            expect(t.info.join(' | ')).toMatch(UNREADABLE);
        } finally {
            w.runtime = real;
        }
    }, 600_000);
});
