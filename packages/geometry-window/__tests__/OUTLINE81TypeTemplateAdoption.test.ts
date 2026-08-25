// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D6) — TYPE TEMPLATE, INSTANCE OWNER.
//
// The three load-bearing claims of D6, each pinned against the REAL factory/planner:
//   1. A window CREATED while its type carries a `customOutline` adopts `'custom'` + a COPY
//      of the ring — and it is a copy, not a reference: mutating the template afterwards
//      reaches no created record.
//   2. A TYPE CHANGE does not reshape (L-10948, "the likeliest regression"): the planner's
//      patch carries NEITHER `openingProfile` NOR `customOutline`. This also pins the fix
//      for a latent pre-existing defect — `buildWindowStoreRecord` falls back to the TOOL
//      CONFIG's profile, and before `PRESERVED_ON_TYPE_CHANGE` gained the pair, retyping a
//      circular window while the mode bar sat on Rectangular silently squared it.
//   3. The store-record chokepoint carries the pair together, and a `'custom'` claim with
//      no recoverable ring degrades LOUDLY to rectangular rather than throwing on load.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openingOutlinePreset } from '@pryzm/geometry-wall/opening-profile';
import {
    buildWindowOpening,
    buildWindowStoreRecord,
    planWindowTypeChange,
    windowSystemTypeStore,
    resetWindowToolConfig,
    setWindowToolConfig,
} from '../src';
import { PRESERVED_ON_TYPE_CHANGE } from '../src/WindowTypeChange';
import type { WindowSystemType } from '../src/WindowSystemTypeStore';
import type { WindowOpening } from '../src/WindowTypes';

const TRIANGLE = openingOutlinePreset('triangle');

function makeType(id: string, customOutline?: WindowSystemType['customOutline']): WindowSystemType {
    return {
        id,
        name: `Test ${id}`,
        category: 'custom',
        isBuiltIn: false,
        frameFinish: { name: 'Frame', materialColor: '#e8e8e8' },
        sillFinish:  { name: 'Sill',  materialColor: '#dddddd' },
        glazingOpacity: 0.3,
        ...(customOutline ? { customOutline } : {}),
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1 },
    } as WindowSystemType;
}

const RINGED_TYPE_ID = 'wt-outline81-ringed';
const PLAIN_TYPE_ID = 'wt-outline81-plain';

beforeEach(() => {
    resetWindowToolConfig();
    windowSystemTypeStore.add(makeType(RINGED_TYPE_ID, { vertices: TRIANGLE.vertices.map(v => ({ ...v })) }));
    windowSystemTypeStore.add(makeType(PLAIN_TYPE_ID));
});

afterEach(() => {
    windowSystemTypeStore.remove(RINGED_TYPE_ID);
    windowSystemTypeStore.remove(PLAIN_TYPE_ID);
    resetWindowToolConfig();
    vi.restoreAllMocks();
});

describe('D6 §1 — creation adoption at the factory chokepoint', () => {
    it('⭐ a window created on a ringed type adopts custom + a COPY of the ring', () => {
        const opening = buildWindowOpening({
            config: { systemTypeId: RINGED_TYPE_ID },
            wallThickness: 0.3,
            offset: 1,
        });
        expect(opening.openingProfile).toBe('custom');
        expect(opening.customOutline?.vertices.length).toBe(3);

        // A COPY, not a reference — mutate the stored template, the opening must not move.
        const t = windowSystemTypeStore.getById(RINGED_TYPE_ID)! as WindowSystemType & {
            customOutline: { vertices: { u: number; v: number }[] };
        };
        t.customOutline.vertices[0]!.u = 0.42;
        expect(opening.customOutline!.vertices[0]!.u).toBe(0);
    });

    it('the ring WINS over the profile pill — the picker shows it read-only (D7)', () => {
        setWindowToolConfig({ openingProfile: 'circular' });
        const opening = buildWindowOpening({
            config: { systemTypeId: RINGED_TYPE_ID },
            wallThickness: 0.3,
            offset: 1,
        });
        expect(opening.openingProfile).toBe('custom');
    });

    it('NON-VACUITY — a type WITHOUT a ring keeps its exact previous behaviour', () => {
        const opening = buildWindowOpening({
            config: { systemTypeId: PLAIN_TYPE_ID },
            wallThickness: 0.3,
            offset: 1,
        });
        expect(opening.openingProfile).toBe('rectangular');
        expect(opening.customOutline).toBeUndefined();
    });
});

describe('D6 §2 — ⛔ TYPE CHANGE DOES NOT RESHAPE (L-10948)', () => {
    const CUSTOM_WINDOW: WindowOpening = {
        id: 'w-outline81-1', openingId: 'op-outline81-1', wallId: 'wall-outline81-1',
        offset: 2, width: 1.2, height: 1.5, sillHeight: 0.9,
        openingProfile: 'custom',
        customOutline: { vertices: TRIANGLE.vertices.map(v => ({ ...v })) },
    } as unknown as WindowOpening;

    it('⭐ the shape pair is in PRESERVED_ON_TYPE_CHANGE — the planner may not touch it', () => {
        expect(PRESERVED_ON_TYPE_CHANGE.has('openingProfile')).toBe(true);
        expect(PRESERVED_ON_TYPE_CHANGE.has('customOutline')).toBe(true);
    });

    it('⭐ retyping a CUSTOM window onto a ringed type patches neither kind nor ring', () => {
        const plan = planWindowTypeChange(CUSTOM_WINDOW, PLAIN_TYPE_ID);
        expect(plan.blockedReason).toBeNull();
        expect('openingProfile' in plan.patch).toBe(false);
        expect('customOutline' in plan.patch).toBe(false);
    });

    it('⭐ the latent pre-fix defect stays dead: tool config CANNOT leak into the patch', () => {
        // Before the pair was preserved, this exact setup squared a circular window:
        // buildWindowStoreRecord falls back to getWindowToolConfig().openingProfile.
        setWindowToolConfig({ openingProfile: 'rectangular' });
        const circular: WindowOpening = {
            ...CUSTOM_WINDOW, id: 'w-outline81-2',
            openingProfile: 'circular', customOutline: undefined, width: 1.2, height: 1.2,
        } as unknown as WindowOpening;
        const plan = planWindowTypeChange(circular, PLAIN_TYPE_ID);
        expect(plan.blockedReason).toBeNull();
        expect('openingProfile' in plan.patch).toBe(false);
    });

    it('retyping onto a RINGED type does not adopt the template either — only "Apply shape from type" does', () => {
        const rect: WindowOpening = {
            ...CUSTOM_WINDOW, id: 'w-outline81-3',
            openingProfile: undefined, customOutline: undefined,
        } as unknown as WindowOpening;
        const plan = planWindowTypeChange(rect, RINGED_TYPE_ID);
        expect(plan.blockedReason).toBeNull();
        expect('openingProfile' in plan.patch).toBe(false);
        expect('customOutline' in plan.patch).toBe(false);
    });
});

describe('D6 §3 — the store-record chokepoint carries the pair together', () => {
    it('an opening with custom + ring lands on the record with both', () => {
        const record = buildWindowStoreRecord({
            opening: {
                id: 'op-1', elementId: 'w-1', systemTypeId: PLAIN_TYPE_ID,
                offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9,
                openingProfile: 'custom',
                customOutline: { vertices: TRIANGLE.vertices.map(v => ({ ...v })) },
            },
            wallId: 'wall-1',
        });
        expect(record.openingProfile).toBe('custom');
        expect((record.customOutline as { vertices: unknown[] }).vertices.length).toBe(3);
    });

    it('a replayed custom opening with NO ring recovers the ring from its TYPE template', () => {
        const record = buildWindowStoreRecord({
            opening: {
                id: 'op-2', elementId: 'w-2', systemTypeId: RINGED_TYPE_ID,
                offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9,
                openingProfile: 'custom',
            },
            wallId: 'wall-1',
        });
        expect(record.openingProfile).toBe('custom');
        expect((record.customOutline as { vertices: unknown[] }).vertices.length).toBe(3);
    });

    it('⛔ custom with NO recoverable ring degrades to rectangular LOUDLY, never throws', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const record = buildWindowStoreRecord({
            opening: {
                id: 'op-3', elementId: 'w-3', systemTypeId: PLAIN_TYPE_ID,
                offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9,
                openingProfile: 'custom',
            },
            wallId: 'wall-1',
        });
        expect(record.openingProfile).toBe('rectangular');
        expect(record.customOutline).toBeUndefined();
        expect(warn.mock.calls.some(c => String(c[0]).includes('degrading'))).toBe(true);
    });
});
