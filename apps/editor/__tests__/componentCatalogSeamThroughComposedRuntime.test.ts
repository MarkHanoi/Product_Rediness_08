/**
 * @vitest-environment happy-dom
 */
// componentCatalogSeamThroughComposedRuntime — §COMPONENT-CATALOG (UI/UX wave, lane U0).
//   UIUX-PLAN §U0 · ADR-0376 D9/D10 · C111 §3.1 ("THERE IS NO CORPUS") / §4.3-b ·
//   C110 §3.5-a · C16 CA-3 / CA-21 · C84 §6.2c / EI-9 · audit R1 / R12 / R14.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ THE DEFINITION-CATALOGUE SEAM: definitionId RESOLVES TO SOMETHING, OR THE
//     VERB SAYS SO BY NAME. Phase-4's own caveat (componentJoinThroughComposed-
//     Runtime.test.ts, caveat 3): "there is no project-level definition registry
//     at this commit; the handlers refuse a malformed reference and accept a
//     well-formed one." This file is the executed proof that the caveat is CLOSED:
//     definition-existence, typeId-membership, instance-kind and unit-kind-at-
//     placement are ENFORCED through the real composed runtime.
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ WHY IT NEVER CONSTRUCTS A STORE, A BUS, OR A RESOLVER OF ITS OWN ───────
// Same doctrine as the join test beside it (R12 / [[fake-more-capable-than-real]]):
// the runtime is obtained the one way P1 permits — `composeRuntime()` — and the
// catalogue consulted is the SAME `componentCatalog` singleton `PluginRegistry.ts`
// injects into the handlers. A catalogue this file built could falsify nothing.
//
// ─── ⚠ RED-FIRST RECORD ───────────────────────────────────────────────────────
// ARM A was authored and executed BEFORE the seam existed. Its transcript
// (`audit/universal-component-editor/2026-09-02/lane-u0-VERIFY-redfirst-SEEN-FAILING.txt`)
// shows `component.place` with a well-formed, NONEXISTENT definitionId RESOLVING —
// the still_open item 2 defect, seen failing, then fixed.
//
// ─── ⚠ WHAT THIS FILE DOES NOT PROVE — stated, so a green is not over-read ────
//  1. That a definition list REACHES A SCREEN. The browser (U1), property panel
//     (U2) and editor (U3) consume this seam later; nothing here mounts UI.
//  2. That project-scoped definitions PERSIST. UIUX-PLAN §U0 flags storage for a
//     founder/ADR ruling; the catalogue is in-memory + explicit load, and says so.
//  3. That the marketplace SERVER leg was exercised end-to-end. The transport leg
//     is driven through an injected fetch (same URL, same bytes contract); the
//     LIVE route is `server/familyMarketplaceRoutes.js` (C111 §3.1's one LIVE row).

import { describe, expect, it, beforeAll } from 'vitest';

import { composeRuntime } from '@pryzm/runtime-composer';
import { packFamily, type FamilyDocument, type FamilyManifest } from '@pryzm/file-format';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
// ⭐ The SAME singleton PluginRegistry injects into the handlers — read the module,
// never construct a rival (a catalogue this file built could falsify nothing).
import { componentCatalog, type CatalogFetch } from '../src/services/componentCatalog/index.js';

const AUDIT = { actorId: 'component-catalog', projectId: 'component-catalog', clientId: 'node' } as const;
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
}, BUDGET);

// ── IDS — real prefixed ULIDs (Crockford base32; the handlers enforce them) ──
const ULID_STEM = '01ARZ3NDEKTSV4RRFFQ69G5F';
function ulidN(n: number): string {
    const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    return ULID_STEM + A[Math.floor(n / 32) % 32] + A[n % 32];
}
const COMPONENT_ID = `component_${ulidN(40)}`;
/** Well-formed and — until ARM B loads it — resolving to NOTHING. */
const DEF_ID = `fam_${ulidN(41)}`;
const TYPE_A = `typ_${ulidN(42)}`;
const TYPE_B = `typ_${ulidN(43)}`;
/** A well-formed type id the definition does NOT declare. */
const TYPE_ALIEN = `typ_${ulidN(44)}`;
const PARAM_WIDTH = `par_${ulidN(45)}`;   // kind 'instance', dataType 'length'
const PARAM_SILL = `par_${ulidN(46)}`;    // kind 'type',     dataType 'length'
const PARAM_ALIEN = `par_${ulidN(47)}`;   // declared by NO definition
const DEF_MARKET = `fam_${ulidN(48)}`;
const DEF_BUILTIN = `fam_${ulidN(49)}`;
const NOW = '2026-09-02T00:00:00.000Z';

const PLACE = {
    componentId: COMPONENT_ID,
    levelId: LEVEL_ID,
    definitionId: DEF_ID,
    typeId: TYPE_A,
    definitionVersion: '1.0.0',
    origin: { x: 2, y: 0, z: 3 },
    rotation: 0,
};

/** ⛔ Read off `rt`, NEVER constructed — the join test's reasoning, kept. */
function store(): any {
    const s = (rt.stores as Record<string, unknown>)['component'];
    if (s === undefined) throw new Error('[test] runtime.stores.component is undefined on the REAL composed runtime');
    return s;
}
function wipe(): void {
    const ids = [...store().getState().keys()];
    if (ids.length > 0) store().applyPatch(ids.map((id: string) => ({ op: 'remove', path: [id] })));
}

/** A minimal, VALID family document with two types and a type/instance parameter
 *  split — authored here because C111 §3.1's census stands: THERE IS NO CORPUS.
 *  Stated, not hidden (UIUX-PLAN §U0 acceptance). Values are in the
 *  family-runtime canonical unit (mm); the PLACEMENT payload stays in metres (D3). */
function makeFamily(defId: string, name: string): { manifest: FamilyManifest; document: FamilyDocument } {
    const document: FamilyDocument = {
        formatVersion: '1.1',
        referencePlanes: [],
        parameters: [
            { id: PARAM_WIDTH, name: 'Width', kind: 'instance', dataType: 'length', defaultValue: 1200, expression: null, ifcMapping: null, exposed: true },
            { id: PARAM_SILL, name: 'SillHeight', kind: 'type', dataType: 'length', defaultValue: 900, expression: null, ifcMapping: null, exposed: true },
        ],
        profiles: [],
        solids: [],
        materialSlots: [],
        types: [
            { id: TYPE_A, name: 'W1200', values: {}, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
            { id: TYPE_B, name: 'W600', values: { [PARAM_WIDTH]: 600 }, checksum: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a' },
        ],
        representations: [],
        connectors: [],
        propertySets: [],
        featureEdges: [],
    } as unknown as FamilyDocument;
    const manifest: FamilyManifest = {
        formatVersion: '1.1',
        id: defId,
        name,
        semver: '1.0.0',
        author: { id: 'usr_01HZ00000000000000000ASR01', displayName: 'lane-u0' },
        description: 'lane U0 catalogue fixture',
        ifcEntity: 'IfcWindow',
        category: 'Window',
        tags: [],
        minPRYZMVersion: '2.0.0',
        schemaHash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        createdAt: NOW,
        lastModifiedAt: NOW,
    } as unknown as FamilyManifest;
    return { manifest, document };
}

async function packedBytes(defId: string, name: string): Promise<Uint8Array> {
    const { manifest, document } = makeFamily(defId, name);
    const packed = await packFamily({ manifest, document });
    if (!packed.ok) throw new Error(`packFamily failed: ${(packed as any).message}`);
    return packed.bytes;
}

describe('§COMPONENT-CATALOG — the definition seam: a definitionId resolves, or the verb refuses BY NAME', () => {

    it('ARM A — ⭐⭐ RED-FIRST: placing a WELL-FORMED but NONEXISTENT definitionId is REFUSED, naming the id, and the store is untouched', async () => {
        wipe();
        componentCatalog.clear();
        expect(store().getState().size, 'the store must start EMPTY').toBe(0);
        // ⭐ THE HONEST EMPTY STATE: a project with no definitions ANSWERS empty —
        // an answer, not an error ([[context-data-honesty-family]]).
        expect(componentCatalog.list()).toEqual([]);
        expect(componentCatalog.has(DEF_ID)).toBe(false);

        // ⛔ THE STILL_OPEN ITEM 2 DEFECT. `fam_<ULID>` passes every format check the
        // Phase-4C handlers make, and before this lane the dispatch RESOLVED — an
        // occurrence of nothing: unresolvable, unschedulable, indistinguishable in
        // the store from a real one. The refusal must NAME the definitionId so
        // "definition not loaded" and "malformed reference" stay different answers.
        await expect(
            rt.bus.executeCommand('component.place', PLACE),
        ).rejects.toThrow(new RegExp(DEF_ID));

        expect(store().getState().size, 'a refused placement must write NOTHING').toBe(0);
    }, BUDGET);

    it('ARM B — ⭐⭐ loading the definition through the ONE loader makes the SAME dispatch succeed; a second load of the same (familyId, schemaHash) hits the cache', async () => {
        wipe();
        componentCatalog.clear();

        const bytes = await packedBytes(DEF_ID, 'U0 Window');
        const first = await componentCatalog.loadFromBytes(bytes, { provenance: 'project' });
        expect(first.ok, `load must succeed: ${(first as any).message ?? ''}`).toBe(true);
        if (!first.ok) return;
        expect(first.definitionId).toBe(DEF_ID);
        expect(first.entry.provenance).toBe('project');

        // THE SAME dispatch ARM A saw refused — byte-identical payload.
        await expect(rt.bus.executeCommand('component.place', PLACE)).resolves.toBeDefined();
        const placed = store().getState().get(COMPONENT_ID);
        expect(placed, 'CA-21 read-back out of the authoritative store').toBeDefined();
        expect(placed.definitionId).toBe(DEF_ID);
        expect(placed.typeId).toBe(TYPE_A);

        // ⭐ C111 §4.3-b's cache key, proven at the seam: identical bytes → HIT.
        const second = await componentCatalog.loadFromBytes(bytes, { provenance: 'project' });
        expect(second.ok).toBe(true);
        if (second.ok) expect(second.cacheHit, 'second load of the same (familyId, schemaHash) is a cache hit').toBe(true);
    }, BUDGET);

    it('ARM C — swapType: a DECLARED type swaps and reads back; an UNDECLARED type refuses NAMING BOTH ids; an UNLOADED definition refuses naming the definition', async () => {
        // (Definition + occurrence from ARM B are still live — arms run in order.)
        await expect(
            rt.bus.executeCommand('component.swapType', { componentId: COMPONENT_ID, typeId: TYPE_B }),
        ).resolves.toBeDefined();
        expect(store().getState().get(COMPONENT_ID).typeId, 'the swap read back').toBe(TYPE_B);

        // ⭐ BOTH IDS — "wrong type" and "wrong definition" must stay different answers.
        let refusal = '';
        try {
            await rt.bus.executeCommand('component.swapType', { componentId: COMPONENT_ID, typeId: TYPE_ALIEN });
        } catch (e) { refusal = (e as Error).message; }
        expect(refusal, 'the refusal names the alien type').toContain(TYPE_ALIEN);
        expect(refusal, 'the refusal names the definition').toContain(DEF_ID);
        expect(store().getState().get(COMPONENT_ID).typeId, 'nothing moved').toBe(TYPE_B);

        // ⭐ THE UNLOADED-DEFINITION LEG — membership cannot be validated against a
        // document that is not there; the refusal names the definition and the
        // escape hatch (load it), never a silent pass and never a fabricated yes.
        componentCatalog.remove(DEF_ID);
        let unloaded = '';
        try {
            await rt.bus.executeCommand('component.swapType', { componentId: COMPONENT_ID, typeId: TYPE_A });
        } catch (e) { unloaded = (e as Error).message; }
        expect(unloaded).toContain(DEF_ID);
        expect(unloaded).toContain('not loaded');
        // Restore for the arms below.
        const back = await componentCatalog.loadFromBytes(await packedBytes(DEF_ID, 'U0 Window'), { provenance: 'project' });
        expect(back.ok).toBe(true);
    }, BUDGET);

    it('ARM D — instance-kind + unit-kind: a TYPE-kind override, an UNDECLARED parameter and a shape-mismatched value are each refused BY NAME, at placement and at setInstanceParameter', async () => {
        wipe();
        const OCC = `component_${ulidN(50)}`;

        // At PLACEMENT — the three refusals, each naming its parameter.
        await expect(rt.bus.executeCommand('component.place', {
            ...PLACE, componentId: OCC, instanceParameters: { [PARAM_SILL]: 1.0 },
        })).rejects.toThrow(/kind 'type'/);
        await expect(rt.bus.executeCommand('component.place', {
            ...PLACE, componentId: OCC, instanceParameters: { [PARAM_ALIEN]: 1.0 },
        })).rejects.toThrow(new RegExp(PARAM_ALIEN));
        await expect(rt.bus.executeCommand('component.place', {
            ...PLACE, componentId: OCC, instanceParameters: { [PARAM_WIDTH]: true },
        })).rejects.toThrow(/'length'/);
        expect(store().getState().size, 'all three refused placements wrote NOTHING').toBe(0);

        // A shape-correct instance override PLACES and reads back.
        await rt.bus.executeCommand('component.place', {
            ...PLACE, componentId: OCC, instanceParameters: { [PARAM_WIDTH]: 1.8 },
        });
        expect(store().getState().get(OCC).instanceParameters[PARAM_WIDTH]).toBe(1.8);

        // At SET — same three facts through the other verb.
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: OCC, parameterId: PARAM_SILL, value: 1.0,
        })).rejects.toThrow(/kind 'type'/);
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: OCC, parameterId: PARAM_ALIEN, value: 1.0,
        })).rejects.toThrow(new RegExp(PARAM_ALIEN));
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: OCC, parameterId: PARAM_WIDTH, value: 'wide',
        })).rejects.toThrow(/'length'/);
        expect(store().getState().get(OCC).instanceParameters, 'no refusal wrote anything').toEqual({ [PARAM_WIDTH]: 1.8 });

        // ⭐ The CLEAR leg is NOT catalogue-gated — clearing with the definition
        // unloaded still works ([[refusing-half-needs-its-escape-hatch]]).
        componentCatalog.remove(DEF_ID);
        await expect(rt.bus.executeCommand('component.setInstanceParameter', {
            componentId: OCC, parameterId: PARAM_WIDTH, clear: true,
        })).resolves.toBeDefined();
        expect(store().getState().get(OCC).instanceParameters).toEqual({});
        const back = await componentCatalog.loadFromBytes(await packedBytes(DEF_ID, 'U0 Window'), { provenance: 'project' });
        expect(back.ok).toBe(true);
    }, BUDGET);

    it('ARM E — ⭐ PROVENANCE: the resolver answers from project (file-open), marketplace (the LIVE transport contract) and builtin — or refuses honestly', async () => {
        wipe();
        componentCatalog.clear();

        // 1 · PROJECT — the file-open leg (`<input type=file>` shape).
        const projectBytes = await packedBytes(DEF_ID, 'U0 Window');
        const fromFile = await componentCatalog.loadFromFile({
            name: 'u0-window.pryzm-family',
            arrayBuffer: async () => projectBytes.buffer.slice(projectBytes.byteOffset, projectBytes.byteOffset + projectBytes.byteLength) as ArrayBuffer,
        });
        expect(fromFile.ok).toBe(true);
        if (fromFile.ok) expect(fromFile.entry.provenance).toBe('project');

        // 2 · MARKETPLACE — the download leg, driven through an injected fetch
        // serving REAL packed bytes at the LIVE route's URL contract.
        const marketBytes = await packedBytes(DEF_MARKET, 'U0 Market Window');
        const served: string[] = [];
        const fetchStub: CatalogFetch = async (url) => {
            served.push(url);
            return {
                ok: true, status: 200,
                arrayBuffer: async () => marketBytes.buffer.slice(marketBytes.byteOffset, marketBytes.byteOffset + marketBytes.byteLength) as ArrayBuffer,
                json: async () => ({}),
            };
        };
        const fromMarket = await componentCatalog.loadFromMarketplace(DEF_MARKET, { fetchImpl: fetchStub });
        expect(fromMarket.ok, `marketplace load: ${(fromMarket as any).message ?? ''}`).toBe(true);
        if (fromMarket.ok) expect(fromMarket.entry.provenance).toBe('marketplace');
        expect(served[0], 'the LIVE route URL contract').toBe(`/api/v1/families/${DEF_MARKET}/download`);

        // …and its HONEST refusals: HTTP failure registers nothing…
        const from404 = await componentCatalog.loadFromMarketplace(`fam_${ulidN(51)}`, {
            fetchImpl: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) }),
        });
        expect(from404.ok).toBe(false);
        if (!from404.ok) expect(from404.reason).toBe('transport-failed');
        // …and a download whose manifest id is NOT the id asked for is refused.
        const mismatched = await componentCatalog.loadFromMarketplace(`fam_${ulidN(52)}`, { fetchImpl: fetchStub });
        expect(mismatched.ok).toBe(false);
        if (!mismatched.ok) expect(mismatched.reason).toBe('identity-mismatch');
        expect(componentCatalog.has(`fam_${ulidN(52)}`)).toBe(false);

        // 3 · BUILTIN — app-shipped bytes.
        const builtinBytes = await packedBytes(DEF_BUILTIN, 'U0 Builtin Window');
        const fromBuiltin = await componentCatalog.loadBuiltin(builtinBytes);
        expect(fromBuiltin.ok).toBe(true);
        if (fromBuiltin.ok) expect(fromBuiltin.entry.provenance).toBe('builtin');

        // The enumeration carries all three, and PLACEMENT resolves against each.
        const provenances = new Map(componentCatalog.list().map((v) => [v.definitionId, v.provenance]));
        expect(provenances.get(DEF_ID)).toBe('project');
        expect(provenances.get(DEF_MARKET)).toBe('marketplace');
        expect(provenances.get(DEF_BUILTIN)).toBe('builtin');
        let n = 60;
        for (const defId of [DEF_ID, DEF_MARKET, DEF_BUILTIN]) {
            const id = `component_${ulidN(n++)}`;
            await rt.bus.executeCommand('component.place', { ...PLACE, componentId: id, definitionId: defId });
            expect(store().getState().get(id).definitionId).toBe(defId);
        }
    }, BUDGET);

    it('ARM F — a TAMPERED file refuses with the LOADER\'s named error, and the catalogue registers nothing', async () => {
        componentCatalog.clear();
        const bytes = await packedBytes(DEF_ID, 'U0 Window');
        const tampered = bytes.slice();
        // Flip bytes in the middle of the archive — the loader, not this catalogue,
        // is the authority on WHY it is bad; the reason must be ITS vocabulary.
        for (let i = Math.floor(tampered.length / 2); i < Math.floor(tampered.length / 2) + 8 && i < tampered.length; i++) {
            tampered[i] = tampered[i]! ^ 0xff;
        }
        const res = await componentCatalog.loadFromBytes(tampered, { provenance: 'project' });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(['unpack-failed', 'preflight-failed', 'read-failed', 'cache-error']).toContain(res.reason);
            expect(res.message.length).toBeGreaterThan(0);
        }
        expect(componentCatalog.list(), 'nothing registered from a refused load').toEqual([]);
    }, BUDGET);

    it('ARM G — ⭐ ONE RESOLVER: the handlers consult the SAME live catalogue instance (remove → refuse; reload → resolve), and its has() is the committer\'s ComponentDefinitionSource shape', async () => {
        wipe();
        componentCatalog.clear();
        await componentCatalog.loadFromBytes(await packedBytes(DEF_ID, 'U0 Window'), { provenance: 'project' });

        // Place succeeds while the definition is loaded…
        const OCC = `component_${ulidN(70)}`;
        await rt.bus.executeCommand('component.place', { ...PLACE, componentId: OCC });
        expect(store().getState().get(OCC)).toBeDefined();

        // …REMOVING it from the catalogue makes the NEXT dispatch refuse — proof the
        // handlers hold the LIVE instance, not a snapshot or a copy (C84 EI-9).
        componentCatalog.remove(DEF_ID);
        await expect(
            rt.bus.executeCommand('component.place', { ...PLACE, componentId: `component_${ulidN(71)}` }),
        ).rejects.toThrow(new RegExp(DEF_ID));

        // …and reloading resolves again — no recomposition, same handlers.
        await componentCatalog.loadFromBytes(await packedBytes(DEF_ID, 'U0 Window'), { provenance: 'project' });
        await expect(
            rt.bus.executeCommand('component.place', { ...PLACE, componentId: `component_${ulidN(72)}` }),
        ).resolves.toBeDefined();

        // The committer's port (`ComponentDefinitionSource`) is satisfied by the SAME
        // object — `has` alone is what lane 4E's seam consumes (ports.ts).
        const asCommitterSource: { has(id: string): boolean } = componentCatalog;
        expect(asCommitterSource.has(DEF_ID)).toBe(true);
        expect(asCommitterSource.has(DEF_MARKET)).toBe(false);
    }, BUDGET);
});
