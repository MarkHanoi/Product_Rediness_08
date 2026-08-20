// @vitest-environment node
//
// ⭐ C100 §2.1 / L-1460 — ARM D + ARM E + ARM F — A PIECE OF FURNITURE'S MASTER
// MATERIAL MUST SURVIVE SAVE AND RELOAD.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The companion to
// `packages/geometry-furniture/__tests__/furnitureMasterMaterialReachesMesh.test.ts`,
// which proves the id reaches a MESH. This file proves it reaches the next SESSION.
// Both are required and neither implies the other.
//
// ─── ⛔ THE DEFECT, and it is one layer above where C100 §9 was looking ────────
//
// C100 §9.1 files furniture under *"renders, then DIES ON SAVE"* — its serializer
// writes no `materialId`. Measured 2026-08-20, that description is true and
// incomplete in the way that matters: on the path production furniture actually
// travels, **there was no `materialId` at any of five layers** — not on the
// `furniture.create` payload, not on the `furniture.created` event, not on the
// runtime `FurnitureData`, not in `FurnitureFragmentBuilder`, not in
// `serializeFurniture`. The material was never lost; it had never been reachable.
//
// ⭐ C100 §9.7 states the distinction and it is the whole reason this file is
// separate from the mesh one: *"'the serializer drops it' and 'there is no field to
// drop' are different defects with different fixes"*. Furniture was the SECOND, and
// ARM D — which only ever sees the first — reported the first.
//
// ⭐ AND THE ORDER MATTERS. A material that renders but does not persist is the
// WORST of the three states, not the middle one: the user picks oak, sees oak,
// saves, reopens, and the oak is gone with no error anywhere.
// §COMMITTED-IS-NOT-REACHABLE in the persistence layer.
//
// ─── WHAT THIS FILE PROVES, AND WHAT IT DOES NOT — stated, not implied ────────
//
// PROVEN BEHAVIOURALLY: the RELOAD half. `ProjectLoader` rebuilds every persisted
// furniture item through `CreateFurnitureCommand` and hands it a HAND-WRITTEN option
// list; a field can be serialised perfectly and still die there. That is exactly how
// the slab defect (the gate's ARM E) worked — `serializeSlab` had ALWAYS written
// `materialId` and the loader payload never listed it, so the saved JSON said it
// worked. This drives the REAL `CreateFurnitureCommand` against the REAL
// `FurnitureStore` and reads the record back (C16 CA-21).
//
// PROVEN BY SOURCE PARITY, NOT BY AN EXECUTED SAVE: the WRITE half. Executing
// `ProjectSerializer.serialize` needs a ~20-store bundle plus `window`, and
// hand-building those neighbours would be the §FAKE-MORE-CAPABLE-THAN-REAL trap that
// let L-960 through — a fake built from the header cannot falsify the header. So the
// save half is asserted over the REAL SOURCE TEXT of `serializeFurniture` and of
// `ProjectLoader`'s furniture payload — the same method
// `BeamMaterialSurvivesReload.test.ts` and `L999SideFinishSurvivesReload.test.ts`
// use, and for the same reason. The limitation is named here rather than papered
// over.
//
// ⚠ NOT PROVEN, and deliberately so: that any UI or chat verb can AUTHOR a furniture
// `materialId` today. Nothing can. The property inspector's "Material" row is
// read-only and shows the legacy four-value `material` hint
// (`FurniturePropertySection.ts`), and no `furniture.setMaterial` verb carries an id.
// That is C100 §6.1/§6.2 work and it is OPEN — see C100 §9.10 S19.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { materialHex } from '@pryzm/schemas/materials';
import { FurnitureStore } from '@pryzm/geometry-furniture';
import { CreateFurnitureCommand } from '@pryzm/command-registry';

const REPO = resolve(__dirname, '../../..');
const src = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

const SERIALIZER = 'apps/editor/src/engine/persistence/ProjectSerializer.ts';
const LOADER = 'apps/editor/src/engine/persistence/ProjectLoader.ts';

/** The slice of `serializeFurniture`'s body, so a match elsewhere in the file cannot pass this. */
function serializeFurnitureBody(): string {
    const text = src(SERIALIZER);
    const at = text.indexOf('function serializeFurniture(');
    expect(at, 'serializeFurniture must still exist under that name').toBeGreaterThan(-1);
    const end = text.indexOf('\nfunction ', at + 1);
    return text.slice(at, end === -1 ? text.length : end);
}

/** The `CreateFurnitureCommand({...})` option list `ProjectLoader` hands the reload. */
function loaderFurniturePayload(): string {
    const text = src(LOADER);
    const at = text.indexOf('new CreateFurnitureCommand({');
    expect(at, 'ProjectLoader must still rebuild furniture through CreateFurnitureCommand').toBeGreaterThan(-1);
    const end = text.indexOf('});', at);
    return text.slice(at, end);
}

describe('C100 §2.1 / L-1460 — a furniture material survives the trip out to a snapshot and back', () => {
    // ─── ARM D: the WRITE half ──────────────────────────────────────────────
    it('⭐ serializeFurniture WRITES materialId — not only the four-value `material` hint', () => {
        const body = serializeFurnitureBody();
        expect(
            /\bmaterialId:\s*f\.materialId\b/.test(body),
            'serializeFurniture wrote `material` (wood|metal|fabric|glass) and no `materialId`, so the ' +
            'master\'s 205 rows were absent from every saved project — C100 §2.1 PERSIST-OR-LOSE',
        ).toBe(true);
    });

    // ─── ARM E: the READ-BACK half, and the reason it is its own case ────────
    // A field written and never read is the WORST persistence shape, because the
    // evidence a reviewer reaches for — open the JSON, find the id — says it worked.
    // That is verbatim the slab defect the gate's ARM E was built to catch.
    it('⭐ ProjectLoader READS materialId back — the arm that caught the slab', () => {
        const payload = loaderFurniturePayload();
        expect(
            /\bmaterialId:\s*f\.materialId\b/.test(payload),
            'the loader\'s CreateFurnitureCommand option list is HAND-WRITTEN; a materialId written by the ' +
            'serializer and absent here is present in the file and absent from the reloaded furniture',
        ).toBe(true);
    });

    // ─── ARM F + the reload, EXECUTED against the real command and store ─────
    it('⭐ EXECUTED — CreateFurnitureCommand carries materialId onto the real record', () => {
        const LEVEL_ID = 'L0';
        const LEVEL = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
        const store = new FurnitureStore();

        const ctx: any = {
            bimManager: {
                getLevelById: (id: string) => (id === LEVEL_ID ? { ...LEVEL } : undefined),
                getLevels: () => [{ ...LEVEL }],
                registerElement: () => {},
                unregisterElement: () => {},
            },
            stores: { furnitureStore: store, floorStore: { getByLevel: () => [] } },
        };

        // The exact call `ProjectLoader` makes when rebuilding a saved item.
        const cmd = new (CreateFurnitureCommand as any)({
            id: 'f-reload',
            furnitureType: 'table',
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            levelId: LEVEL_ID,
            width: 1.2, length: 0.8, height: 0.75,
            material: 'wood',
            materialId: 'wood-oak',
        });
        const r = cmd.execute(ctx);
        expect(r.success, `the command must succeed: ${r.error ?? ''}`).toBe(true);

        const restored = store.get('f-reload') ?? store.getById?.('f-reload');
        expect(restored, 'the furniture must be in the store after the reload command').toBeTruthy();
        expect(
            restored.materialId,
            'the id reached the store — this is the ARM F half: a runtime record that can HOLD a materialId',
        ).toBe('wood-oak');

        // ⭐ And the id must MEAN something: it resolves in the master. An id that
        // round-trips perfectly and names nothing is C100 §9.5's drift, which is the
        // reason §9.6.c puts reconciliation BEFORE wiring.
        expect(materialHex('wood-oak'), 'the round-tripped id must resolve in MATERIAL_CATALOG').toBeTruthy();
    });

    // ─── The nothing-repaints control ───────────────────────────────────────
    it('furniture naming NO material round-trips with no materialId key at all', () => {
        const LEVEL_ID = 'L0';
        const LEVEL = { id: LEVEL_ID, name: 'Ground', elevation: 0, height: 3, childrenIds: [] };
        const store = new FurnitureStore();
        const ctx: any = {
            bimManager: {
                getLevelById: (id: string) => (id === LEVEL_ID ? { ...LEVEL } : undefined),
                getLevels: () => [{ ...LEVEL }],
                registerElement: () => {}, unregisterElement: () => {},
            },
            stores: { furnitureStore: store, floorStore: { getByLevel: () => [] } },
        };
        const r = new (CreateFurnitureCommand as any)({
            id: 'f-none', furnitureType: 'table',
            position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
            levelId: LEVEL_ID, width: 1, length: 1, height: 1, material: 'wood',
        }).execute(ctx);
        expect(r.success).toBe(true);

        const restored = store.get('f-none') ?? store.getById?.('f-none');
        // ⛔ ABSENT, not empty-string. C100 §5: "names no material" and "names a
        // material that resolves to nothing" must never be the same value.
        expect(restored.materialId, 'an empty-string id would render MAGENTA and be a regression').toBeUndefined();
    });
});
