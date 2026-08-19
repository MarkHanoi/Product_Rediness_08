/**
 * §L-1102 / §L-1037 — HANDRAIL SAVE→LOAD ROUND TRIP, EXECUTED.
 *
 * ─── WHY THIS TEST IS SHAPED THIS WAY ───────────────────────────────────────
 * C95 §16 measured that **7 of ~26 authored handrail fields survived a save/load
 * round trip**: four hand-written whitelists (two SAVE, two LOAD) each carried
 * only the fields their author remembered, so a Frameless Glass Balustrade
 * reloaded as a grey rectangular balustrade — a *different element*, exported as
 * a different IFC entity than the one saved.
 *
 * ⛔ THIS IS DELIBERATELY NOT A FIELD-BY-FIELD ASSERTION LIST. L-1037 names that
 * shape explicitly: *"a field-by-field test is the whitelist defect wearing a
 * test's clothes — it passes for exactly the fields someone remembered."* The
 * assertion below is therefore a **key-set sweep**: it authors a record, round
 * trips it, and demands that EVERY key present on the authored record either
 * comes back equal or appears on the NAMED transient list. Add a field to
 * `HandrailData` and forget persistence, and this test fails without anybody
 * having thought to add a line to it.
 *
 * ⚠ It is an EXECUTED round trip, not a source-text parity check: real
 * `HandrailStore` → real `serializeHandrailRecord` → `JSON.parse(JSON.stringify)`
 * (the actual serialisation boundary, which is where a THREE.Vector3 or a
 * function would die) → real `buildHandrailCreatePayload` → real
 * `CreateHandrailCommand.execute` → a SECOND real `HandrailStore`, read back
 * from the authoritative store rather than from the command's return value.
 * Proving persistence by a pure function's return value is the mistake this
 * lane's brief names by hand.
 *
 * The one thing it does NOT execute is `ProjectSerializer.serialize()` itself,
 * which needs a ~20-store bundle plus a live BimManager. What it DOES pin is that
 * both `ProjectSerializer` copies call `serializeHandrailRecord` and both
 * `ProjectLoader` copies call `buildHandrailCreatePayload` — asserted by reading
 * those four files, below, so the pair cannot drift back apart silently.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProjectContext } from '@pryzm/core-app-model';
import { HandrailStore, handrailTypeStore } from '@pryzm/core-app-model/stores';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import {
    serializeHandrailRecord,
    buildHandrailCreatePayload,
    HANDRAIL_TRANSIENT_FIELDS,
} from '@pryzm/core-app-model/stores';
import { CreateHandrailCommand } from '../src/handrails/CreateHandrailCommand';
import type { CommandContext } from '../src/types';

const LEVEL_ID = 'L0';

function makeCtx(): { ctx: CommandContext; store: HandrailStore } {
    const store = new HandrailStore(new ProjectContext());
    const ctx = {
        stores: { handrailStore: store },
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? { id, elevation: 0 } : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
        },
        projectContext: { activeLevelId: LEVEL_ID },
    } as unknown as CommandContext;
    return { ctx, store };
}

/**
 * A handrail with EVERY authorable field set to a NON-DEFAULT value.
 *
 * Non-default matters: `fillType` defaulting to `'baluster'` is exactly how the
 * measured defect hid — a lost field that lands on its own default looks like a
 * pass. Every value here differs from what the command or the builder would
 * supply on its own.
 */
function authorFullyLoadedHandrail(): HandrailData {
    return {
        id: 'hr-roundtrip-1',
        type: 'handrail',
        levelId: LEVEL_ID,
        parentId: LEVEL_ID,
        baseLine: [
            { x: 1.5, y: 0, z: 2.5 },
            { x: 6.5, y: 0, z: 2.5 },
        ],
        height: 1.15,
        thickness: 0.045,
        baseOffset: 0.12,
        // The frameless-glass case from C95 §16.3, verbatim.
        fillType: 'glass',
        railProfile: 'round',
        railDiameter: 0.042,
        postSpacing: 1.35,
        balusterShape: 'round',
        balusterWidth: 0.018,
        balusterSpacing: 0.105,
        infillMaxGap: 0.089,
        suppressStartPost: true,
        hostId: 'stair-77',
        hostKind: 'stair',
        materialId: 'mat.glass.toughened.clear',
        materialColor: '#b3d9e6',
        railStructure: [
            { height: 1.15, profile: 'round', thickness: 0.042, diameter: 0.042, color: '#8c8c8c' },
        ],
        parameters: { fireRating: 'none', loadClass: 'C3' },
        metadata: { authoredBy: 'HR1', version: 3 },
        properties: { mark: 'HR042', phase: 'New Construction', customNote: 'stair landing guard' },
        ifcData: { guid: 'stable-guid-0001', ifcClass: 'IfcRailing', predefinedType: 'GUARDRAIL' },
        spatialRelationship: { levelId: LEVEL_ID },
    } as HandrailData;
}

/** SAVE → the JSON boundary → LOAD → the authoritative store. */
function roundTrip(authored: HandrailData): HandrailData {
    const saveStore = new HandrailStore(new ProjectContext());
    saveStore.add(structuredClone(authored));
    const live = saveStore.getAll().find(h => h.id === authored.id)!;

    const snapshot = JSON.parse(JSON.stringify(serializeHandrailRecord(live)));

    const { ctx, store: loadStore } = makeCtx();
    const cmd = new CreateHandrailCommand(buildHandrailCreatePayload(snapshot) as never);
    const res = cmd.execute(ctx);
    expect(res.success).toBe(true);
    return loadStore.getAll().find(h => h.id === authored.id)!;
}

describe('L-1102 — every authored handrail field survives save → load', () => {
    it('the key-set sweep: nothing is lost that is not on the NAMED transient list', () => {
        const authored = authorFullyLoadedHandrail();
        const reloaded = roundTrip(authored);
        expect(reloaded).toBeDefined();

        const excluded = new Set(HANDRAIL_TRANSIENT_FIELDS.map(f => f.field));
        const lost: string[] = [];
        const changed: string[] = [];
        for (const key of Object.keys(authored)) {
            if (excluded.has(key)) continue;
            const before = (authored as Record<string, unknown>)[key];
            const after = (reloaded as unknown as Record<string, unknown>)[key];
            if (after === undefined) { lost.push(key); continue; }
            // `properties` is a MERGE target (the store mints `mark` when absent),
            // so it is compared as a superset rather than for equality.
            if (key === 'properties') {
                for (const [pk, pv] of Object.entries(before as Record<string, unknown>)) {
                    if (JSON.stringify((after as Record<string, unknown>)[pk]) !== JSON.stringify(pv)) {
                        changed.push(`properties.${pk}`);
                    }
                }
                continue;
            }
            // `ifcData.guid` is the join key that must survive; ifcClass /
            // predefinedType are RE-DERIVED from `fillType` by the canonical
            // mapper, which is correct and is not a loss.
            if (key === 'ifcData') {
                if ((after as { guid?: string }).guid !== (before as { guid?: string }).guid) {
                    changed.push('ifcData.guid');
                }
                continue;
            }
            if (JSON.stringify(after) !== JSON.stringify(before)) changed.push(key);
        }

        expect({ lost, changed }).toEqual({ lost: [], changed: [] });
    });

    it('the C95 §16.3 scenario: a Frameless Glass Balustrade reloads as itself, not as a grey rectangular one', () => {
        const reloaded = roundTrip(authorFullyLoadedHandrail());
        // The three fields whose loss produced "a different element".
        expect(reloaded.fillType).toBe('glass');
        expect(reloaded.railProfile).toBe('round');
        expect(reloaded.materialId).toBe('mat.glass.toughened.clear');
        // `fillType` drives `ifcPredefined`, so IFC identity survives too (C25).
        expect(reloaded.ifcData?.predefinedType).toBe('GUARDRAIL');
        expect(reloaded.ifcData?.guid).toBe('stable-guid-0001');
        // A hosted rail must reload HOSTED, or C95 §8.2's stair-delete cascade
        // cannot find it and it strands again (L-1101).
        expect(reloaded.hostId).toBe('stair-77');
        expect(reloaded.hostKind).toBe('stair');
        // Losing this doubled every interior post of a multi-segment run on reload.
        expect(reloaded.suppressStartPost).toBe(true);
    });

    it('the transient exclusions are dropped, and each one carries a stated reason', () => {
        const authored = authorFullyLoadedHandrail() as unknown as Record<string, unknown>;
        authored._renderVersion = 7;
        authored._sourceBaseLine = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }];
        authored.spatialStatus = 'Orphaned';
        const snapshot = serializeHandrailRecord(authored as never) as Record<string, unknown>;
        for (const { field, reason } of HANDRAIL_TRANSIENT_FIELDS) {
            expect(snapshot[field]).toBeUndefined();
            expect(reason.length).toBeGreaterThan(20);
        }
    });

    it('an UNKNOWN field added to the record is persisted WITHOUT editing the serialiser — the inversion, asserted', () => {
        const authored = authorFullyLoadedHandrail() as unknown as Record<string, unknown>;
        // Stands in for whatever field R5/R6/R3 add next.
        authored.someFieldNobodyHasWrittenYet = { bays: [1, 2, 3] };
        const snapshot = serializeHandrailRecord(authored as never) as Record<string, unknown>;
        expect(snapshot.someFieldNobodyHasWrittenYet).toEqual({ bays: [1, 2, 3] });
    });

    it('ALL FOUR persistence sites route through the one pair — no hand-written handrail list survives', () => {
        const root = resolve(__dirname, '../../..');
        const sites = [
            'apps/editor/src/engine/persistence/ProjectSerializer.ts',
            'packages/persistence-client/src/loader/ProjectSerializer.ts',
        ];
        for (const p of sites) {
            const src = readFileSync(resolve(root, p), 'utf8');
            expect(src, p).toContain('serializeHandrailRecord');
        }
        for (const p of [
            'apps/editor/src/engine/persistence/ProjectLoader.ts',
            'packages/persistence-client/src/loader/ProjectLoader.ts',
        ]) {
            const src = readFileSync(resolve(root, p), 'utf8');
            expect(src, p).toContain('buildHandrailCreatePayload');
            // EVERY `new CreateHandrailCommand(` in a loader must be fed by the
            // builder. A count, not a substring: a second, hand-assembled call
            // site added later is exactly how these two lists drifted apart, and
            // a `toContain` would go on passing beside it.
            const constructed = src.match(/new CreateHandrailCommand\(/g) ?? [];
            const viaBuilder = src.match(/new CreateHandrailCommand\(buildHandrailCreatePayload\(/g) ?? [];
            expect(viaBuilder.length, p).toBe(constructed.length);
            expect(constructed.length, p).toBeGreaterThan(0);
        }
    });
});

/**
 * §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — THE **CATALOGUE** ROUND TRIP.
 *
 * ⛔ A DIFFERENT SUBJECT FROM EVERYTHING ABOVE, AND THE DISTINCTION IS THE POINT.
 * The suite above round-trips a handrail RECORD. This round-trips the railing TYPE
 * a record is made from. C95 §15.7 left *"are custom handrail types saved and
 * reloaded?"* as NOT MEASURED; measured 2026-08-19 the answer was **no, and worse**:
 * `handrailTypeStore` was registered on `projectScopeRegistry` with
 * `clear: clearCustomTypes()` — a **DESTRUCTOR WITH NO CONSTRUCTOR**. A project
 * switch deleted every user-authored railing type, and no save path had ever
 * written one.
 *
 * ⭐ §15.12's question was asked BEFORE the authoring UI was built, not after:
 * *could "my custom railing type is still here after reload" ever be true?* It could
 * not — for any user, in any order of operations. Same shape as By Slab, found the
 * same way, found this time before anything was built on top of it.
 *
 * ⚠ WHAT IS EXECUTED AND WHAT IS ASSERTED BY SOURCE — stated plainly, because this
 * file's own header already draws the same line for records. A real
 * `ProjectSerializer.serialize()` needs a ~20-store bundle plus a live BimManager,
 * so what runs below is the STORE half end to end — author → the serializer's own
 * projection → the JSON boundary → the project-switch WIPE → the loader's own
 * restore → **read back from the authoritative store** (C16 CA-21, never a return
 * value) — and the four persistence SITES are asserted to carry the field, exactly
 * as the record round trip does one describe block up.
 */
describe('C95 §15.7 R3 — a custom railing TYPE survives save → project switch → load', () => {
    const CUSTOM = {
        id: 'hr.test.custom-oak-cap',
        name: 'Oak Cap Rail on Blackened Steel',
        description: 'A user-authored type, for the round trip.',
        height: 1.05,
        thickness: 0.062,
        baseOffset: 0.01,
        fillType: 'baluster',
        railProfile: 'round',
        railDiameter: 0.062,
        postSpacing: 1.45,
        balusterShape: 'round',
        balusterWidth: 0.016,
        balusterSpacing: 0.092,
        infillMaxGap: 0.099,
        materialId: 'wood-oak',
        materialName: 'oak',
    } as const;

    /** The SERIALIZER's own projection: custom types only, structured-cloned. */
    function serializeCatalogue(): unknown[] {
        return handrailTypeStore.getCustom().map((t) => structuredClone(t));
    }

    /** The LOADER's own restore: id preserved, `isBuiltIn` stripped, dupes skipped. */
    function restoreCatalogue(raws: unknown[]): number {
        let n = 0;
        for (const raw of raws as Array<Record<string, unknown>>) {
            if (!raw || !raw.id || !raw.name) continue;
            if (handrailTypeStore.getById(String(raw.id))) continue;
            const { isBuiltIn: _ignored, ...definition } = raw;
            handrailTypeStore.add(definition as never);
            n++;
        }
        return n;
    }

    afterEach(() => {
        handrailTypeStore.clearCustomTypes();
    });

    it('⭐ the key-set sweep: EVERY authored field comes back, and the id is the SAME id', () => {
        handrailTypeStore.add({ ...CUSTOM } as never);
        const authored = handrailTypeStore.getById(CUSTOM.id)!;

        // Through the real JSON boundary — where a THREE.Vector3 or a function dies.
        const snapshot = JSON.parse(JSON.stringify(serializeCatalogue())) as unknown[];
        expect(snapshot).toHaveLength(1);

        // The project switch that used to be the end of the story.
        handrailTypeStore.clearCustomTypes();
        expect(handrailTypeStore.getById(CUSTOM.id)).toBeUndefined();

        expect(restoreCatalogue(snapshot)).toBe(1);
        const reloaded = handrailTypeStore.getById(CUSTOM.id);

        // ⛔ IDENTITY FIRST. The wall arm's add({name, description, layers}) drops the
        // saved id and mints a new one; handrail preserves it, so every record's
        // materialised fields and every schedule row still point at the same type.
        expect(reloaded).toBeDefined();
        expect(reloaded!.id).toBe(CUSTOM.id);

        // NOT a field-by-field list — that is the whitelist defect wearing a test's
        // clothes (L-1037). Every key on the authored record must come back equal.
        for (const key of Object.keys(authored) as Array<keyof typeof authored>) {
            expect(reloaded![key], 'field did not survive: ' + String(key)).toEqual(authored[key]);
        }
    });

    it('a field nobody has written yet survives WITHOUT editing either persistence site', () => {
        // The inversion that makes this safe: both sides carry the WHOLE object
        // (structuredClone out, object-spread back in) rather than a named list, so a
        // field added to HandrailTypeDefinition persists with no edit anywhere.
        handrailTypeStore.add({ ...CUSTOM, someFutureField: { bays: [1, 2] } } as never);
        const snapshot = JSON.parse(JSON.stringify(serializeCatalogue())) as unknown[];
        handrailTypeStore.clearCustomTypes();
        restoreCatalogue(snapshot);
        const reloaded = handrailTypeStore.getById(CUSTOM.id) as unknown as Record<string, unknown>;
        expect(reloaded.someFutureField).toEqual({ bays: [1, 2] });
    });

    it('the restored type is USER-owned — isBuiltIn is never taken from the snapshot', () => {
        // A snapshot claiming isBuiltIn:true for a user type would make it permanently
        // unremovable and unmodifiable: remove() and update() both throw on built-ins.
        // So the flag is stripped and the store decides.
        handrailTypeStore.add({ ...CUSTOM } as never);
        const snapshot = JSON.parse(JSON.stringify(serializeCatalogue())) as Array<Record<string, unknown>>;
        snapshot[0]!.isBuiltIn = true; // a hostile / stale snapshot
        handrailTypeStore.clearCustomTypes();
        restoreCatalogue(snapshot);

        const reloaded = handrailTypeStore.getById(CUSTOM.id)!;
        expect(reloaded.isBuiltIn).toBe(false);
        // ...and it is genuinely still editable, which is the thing that matters.
        expect(() => handrailTypeStore.update(CUSTOM.id, { height: 1.2 })).not.toThrow();
        expect(handrailTypeStore.getById(CUSTOM.id)!.height).toBe(1.2);
    });

    it('BUILT-INS are never written to the snapshot — however many in the store, 0 in the catalogue', () => {
        // The invariant is the NEXT line: no built-in reaches the saved catalogue.
        // The built-in COUNT is not an invariant — it grows whenever a type is added
        // (20 -> 44 when the 24 bar-guard types landed). Pinning it exactly made this
        // suite fail for a reason it does not test, so it is a floor, not an equality.
        expect(handrailTypeStore.getBuiltIn().length).toBeGreaterThanOrEqual(20);
        expect(serializeCatalogue()).toHaveLength(0);
    });

    it('re-loading the same snapshot twice does NOT throw — add() rejects a duplicate id', () => {
        handrailTypeStore.add({ ...CUSTOM } as never);
        const snapshot = JSON.parse(JSON.stringify(serializeCatalogue())) as unknown[];
        handrailTypeStore.clearCustomTypes();
        expect(restoreCatalogue(snapshot)).toBe(1);
        // The guard is load-bearing, not tidiness: HandrailTypeStore.add() THROWS.
        expect(() => restoreCatalogue(snapshot)).not.toThrow();
        expect(handrailTypeStore.getCustom()).toHaveLength(1);
    });

    it('⛔ ALL FOUR persistence sites carry handrailTypes — not one pair of the two', () => {
        // C95 §3.2: this family has a SECOND persistence pair. Patching one would let a
        // custom railing type survive on one save path and vanish on the other, which
        // is L-1102's defect one level up — so both pairs are asserted, by name.
        const root = resolve(__dirname, '../../..');
        for (const site of [
            'apps/editor/src/engine/persistence/ProjectSerializer.ts',
            'packages/persistence-client/src/loader/ProjectSerializer.ts',
        ]) {
            const src = readFileSync(resolve(root, site), 'utf8');
            expect(src, site).toContain('handrailTypeStore.getCustom()');
            expect(src, site).toContain('handrailTypes:');
        }
        for (const site of [
            'apps/editor/src/engine/persistence/ProjectLoader.ts',
            'packages/persistence-client/src/loader/ProjectLoader.ts',
        ]) {
            const src = readFileSync(resolve(root, site), 'utf8');
            expect(src, site).toContain('snapshotHandrailTypes');
            expect(src, site).toContain('handrailTypeStore.add(');
            // The id must be PRESERVED. A loader that re-mints ids restores a type
            // nothing points at, which is indistinguishable from not restoring it.
            expect(src, site).toContain('handrailTypeStore.getById(raw.id)');
        }
    });
});
