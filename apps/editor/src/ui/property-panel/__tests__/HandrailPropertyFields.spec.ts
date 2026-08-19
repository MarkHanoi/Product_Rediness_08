/**
 * §FEAT-HANDRAIL-PANEL-FIELDS (C95 §15.15) — every railing property the founder
 * named is offered by the panel AND actually reaches the store.
 *
 * ─── THE REPORT ─────────────────────────────────────────────────────────────
 * Founder, with a screenshot of HANDRAIL HR046: *"the handrail should have the
 * properties enough to change: PROFILE of handrail · DIMENSION · CIRCULAR / SQUARE ·
 * MATERIAL · HOW OFTEN VERTICAL BARS · PANELS YES OR NO · how often, material, etc."*
 * The panel exposed FOUR authorable fields (height, thickness, baseOffset, a raw
 * colour hex). Every field he asked for already existed on `HandrailData`, was
 * already materialised by `resolveHandrailTypeFields`, already accepted by
 * `UpdateHandrailPayload` and already round-tripped through save/load.
 *
 * ─── WHY THIS FILE IS A SWEEP AND NOT AN ASSERTION LIST ─────────────────────
 * L-1037 named the shape by hand: *"a field-by-field test is the whitelist defect
 * wearing a test's clothes — it passes for exactly the fields someone remembered."*
 * The `handrailPersistenceRoundTrip` suite already sweeps the PERSISTENCE boundary
 * that way and is deliberately NOT duplicated here (the brief for this work says:
 * the round-trip harness EXISTS, use it, do not write a second).
 *
 * The gap this file closes is the one round-trip cannot see: **a row can be added
 * to the panel schema and still write nowhere.** So the central test enumerates
 * EDITABLE descriptors from the real generator and drives each one through the real
 * `UpdateElementParameterCommand` into a real `HandrailStore` — the same
 * `element.updateParameters` verb `PropertyPanel.onApply` dispatches, and the same
 * one chat reaches. Add a row and forget the write path and this fails, without
 * anyone remembering to add a line.
 *
 * ⛔ NOTHING UNDER TEST IS STUBBED. Real `generateDescriptors`, real command, real
 * store, real merge semantics. The only fakes are the `bimManager` / `projectContext`
 * shells the command's context requires — measured by the negative controls below,
 * which fail if the write silently no-ops.
 */
import { describe, it, expect } from 'vitest';
import { generateDescriptors } from '../PropertyDescriptorGenerator';
import type { PropertyDescriptor } from '../types';
import { ProjectContext } from '@pryzm/core-app-model';
import { HandrailStore } from '@pryzm/core-app-model/stores';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import {
    HANDRAIL_CONSTRAINTS,
    HANDRAIL_FILL_TYPES,
    HANDRAIL_RAIL_PROFILES,
    HANDRAIL_BALUSTER_SHAPES,
    HANDRAIL_POST_END_CONDITIONS,
} from '@pryzm/core-app-model/stores';
import { UpdateElementParameterCommand } from '@pryzm/command-registry';
import type { CommandContext } from '@pryzm/command-registry';

const LEVEL_ID = 'L1';

function makeHandrail(): HandrailData {
    return {
        id: 'HR046',
        type: 'handrail',
        levelId: LEVEL_ID,
        baseLine: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
        ],
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0,
    } as unknown as HandrailData;
}

function makeCtx(store: HandrailStore): CommandContext {
    return {
        stores: { handrailStore: store },
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? { id, elevation: 0 } : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
        },
        projectContext: { activeLevelId: LEVEL_ID },
    } as unknown as CommandContext;
}

/** The descriptors the real generator produces for a real handrail record. */
function handrailDescriptors(): PropertyDescriptor[] {
    return generateDescriptors(makeHandrail() as unknown as Record<string, unknown>);
}

function byKey(key: string): PropertyDescriptor | undefined {
    return handrailDescriptors().find((d) => d.key === key);
}

/**
 * A non-default value for each authorable key, chosen so a LOST write cannot be
 * mistaken for a default (the failure mode C95 §16 measured: a dropped `fillType`
 * landing on `'baluster'` looks identical to a correct one).
 */
const NON_DEFAULT: Record<string, unknown> = {
    height: 1.23,
    thickness: 0.037,
    baseOffset: 0.11,
    railProfile: 'round',
    railDiameter: 0.042,
    fillType: 'panel',
    postSpacing: 1.37,
    postEndCondition: 'centred',
    balusterShape: 'round',
    balusterWidth: 0.021,
    balusterSpacing: 0.087,
    infillMaxGap: 0.089,
    materialId: 'metal-steel-brushed',
    materialColor: '#123456',
    mark: 'HR-TEST',
};

describe('§FEAT-HANDRAIL-PANEL-FIELDS — the founder\'s requested properties are OFFERED', () => {
    /**
     * Each row is (founder's words) → (the field that answers it). This IS a named
     * list on purpose: it is the ACCEPTANCE CRITERION from the report, not a census
     * of the model. The sweep further down is what guards against forgetting a field.
     */
    const REQUESTED: ReadonlyArray<readonly [string, string]> = [
        ['profile of handrail', 'railProfile'],
        ['dimension', 'railDiameter'],
        ['circular / square', 'balusterShape'],
        ['material', 'materialId'],
        ['how often vertical bars', 'balusterSpacing'],
        ['panels yes or no', 'fillType'],
        ['how often (posts)', 'postSpacing'],
    ];

    for (const [asked, key] of REQUESTED) {
        it(`"${asked}" is an editable row (${key})`, () => {
            const d = byKey(key);
            expect(d, `no descriptor for ${key}`).toBeDefined();
            expect(d!.editable, `${key} must be editable`).toBe(true);
            expect(d!.type).not.toBe('readonly');
        });
    }

    it('the four fields that were already there are still there', () => {
        for (const key of ['height', 'thickness', 'baseOffset', 'materialColor']) {
            expect(byKey(key)?.editable, `${key} regressed`).toBe(true);
        }
    });
});

describe('§FEAT-HANDRAIL-PANEL-FIELDS — the vocabularies are READ, never re-typed', () => {
    /**
     * The three enums were TYPE-only unions, which vanish at compile time — so any
     * picker had to re-type their members, and a second copy of a vocabulary is a
     * second answer that drifts silently (C84 EI-8). They are now runtime `as const`
     * arrays with the unions DERIVED from them.
     *
     * These assertions compare the descriptor's options to the PUBLISHED array, so a
     * future edit that hand-writes `['circular','square']` — or misspells `'centred'`
     * as `'centered'` — fails here instead of shipping a dropdown that writes values
     * no consumer recognises.
     */
    const CASES: ReadonlyArray<readonly [string, readonly string[]]> = [
        ['railProfile', HANDRAIL_RAIL_PROFILES],
        ['balusterShape', HANDRAIL_BALUSTER_SHAPES],
        ['fillType', HANDRAIL_FILL_TYPES],
        ['postEndCondition', HANDRAIL_POST_END_CONDITIONS],
    ];

    for (const [key, published] of CASES) {
        it(`${key} offers exactly the published members`, () => {
            const d = byKey(key);
            expect(d?.type).toBe('enum');
            expect(d?.options).toEqual([...published]);
        });
    }

    it('the material row carries NO options — the catalogue is read by the renderer', () => {
        const d = byKey('materialId');
        expect(d?.type).toBe('material');
        // ~200 catalogue ids copied into a descriptor would be the same defect one
        // layer along; PropertyRenderer imports MATERIAL_CATALOG itself.
        expect(d?.options).toBeUndefined();
    });

    it('the material row STATES that the colour override shadows it (C100 §2.1)', () => {
        // `resolveMaterialColour` returns the override FIRST. Without this said in
        // the row, picking a material while a stale hex sits on the record changes
        // nothing on screen and every surface agrees the material was applied.
        const hint = byKey('materialId')?.hint ?? '';
        expect(hint.length, 'material row must carry a precedence hint').toBeGreaterThan(0);
        expect(hint.toLowerCase()).toContain('color override');
    });
});

describe('§FEAT-HANDRAIL-PANEL-FIELDS — the panel and the command agree on bounds', () => {
    /**
     * ⚠ THIS IS A REGRESSION TEST FOR A LIVE DRIFT, not a tautology.
     * The panel offered Height as 0.5–2.0 m while `UpdateHandrailCommand.canExecute`
     * refuses only outside 0.3–2.5 m. So the panel's spinner silently narrowed a
     * range the model accepts and chat could reach — a 0.4 m planter-edge rail was
     * authorable one way and not the other, for no stated reason. Both now read
     * `HANDRAIL_CONSTRAINTS`.
     */
    it('height bounds come from the published constraint set', () => {
        const d = byKey('height');
        expect(d?.min).toBe(HANDRAIL_CONSTRAINTS.HEIGHT_MIN);
        expect(d?.max).toBe(HANDRAIL_CONSTRAINTS.HEIGHT_MAX);
    });

    it('post spacing admits ZERO — the built-in "Stair Handrail" type declares it', () => {
        // A minimum above 0 would make a SHIPPED type unauthorable through the panel
        // while chat could still reach it.
        expect(byKey('postSpacing')?.min).toBe(0);
        expect(HANDRAIL_CONSTRAINTS.POST_SPACING_MIN).toBe(0);
    });
});

describe('§FEAT-HANDRAIL-PANEL-FIELDS — every offered row REACHES THE STORE', () => {
    /**
     * ⭐ THE SWEEP. Round-trip persistence cannot see this gap: a row can be added to
     * the panel schema and write nowhere at all. This drives the REAL verb the panel
     * dispatches (`element.updateParameters` → `UpdateElementParameterCommand`) into
     * a REAL `HandrailStore`, for EVERY editable descriptor the generator produces —
     * enumerated from the generator, never hand-listed.
     */
    function editableKeys(): string[] {
        return handrailDescriptors()
            .filter((d) => d.editable && d.type !== 'readonly')
            .map((d) => d.key);
    }

    it('every editable descriptor has a non-default value defined for this sweep', () => {
        // Guards the sweep itself: a new row with no entry in NON_DEFAULT would be
        // silently skipped, and a skipped field is exactly what this file exists to
        // prevent. Failing here is the instruction to extend NON_DEFAULT.
        const missing = editableKeys().filter((k) => !(k in NON_DEFAULT));
        expect(missing, `add a non-default value for: ${missing.join(', ')}`).toEqual([]);
    });

    it('writes every editable field through the real command onto the real store', () => {
        const store = new HandrailStore(new ProjectContext());
        store.add(makeHandrail());

        // `mark` is excluded exactly as PropertyPanel.onApply excludes it — it goes
        // through `element.updateMark`, a different verb, so including it here would
        // test a route the panel does not use for it.
        const keys = editableKeys().filter((k) => k !== 'mark');
        expect(keys.length, 'the sweep must cover more than the original four fields')
            .toBeGreaterThan(4);

        const parameters: Record<string, unknown> = {};
        for (const k of keys) parameters[k] = NON_DEFAULT[k];

        // NEGATIVE CONTROL — none of these values is already on the record, so a
        // no-op write cannot masquerade as a pass.
        const before = store.getById('HR046') as unknown as Record<string, unknown>;
        for (const k of keys) {
            expect(before[k], `${k} must differ before the write`).not.toBe(NON_DEFAULT[k]);
        }

        const cmd = new UpdateElementParameterCommand({
            elementId: 'HR046',
            elementType: 'handrail',
            parameters,
        } as never);
        const res = cmd.execute(makeCtx(store));
        expect(res.success, `command failed: ${JSON.stringify(res)}`).toBe(true);

        const after = store.getById('HR046') as unknown as Record<string, unknown>;
        const lost = keys.filter((k) => after[k] !== NON_DEFAULT[k]);
        expect(lost, `these panel rows wrote NOWHERE: ${lost.join(', ')}`).toEqual([]);
    });

    it('the write is a MERGE — untouched fields survive (HandrailStore.update semantics)', () => {
        const store = new HandrailStore(new ProjectContext());
        store.add(makeHandrail());

        const cmd = new UpdateElementParameterCommand({
            elementId: 'HR046',
            elementType: 'handrail',
            parameters: { railProfile: 'round' },
        } as never);
        expect(cmd.execute(makeCtx(store)).success).toBe(true);

        const after = store.getById('HR046')!;
        expect(after.railProfile).toBe('round');
        // If the store replaced instead of merging, these would be gone — that is the
        // §FIX-SLAB-PARAM-WIPE defect, and handrail takes the generic `else` branch
        // that does NOT pre-merge, so the merge has to come from the store itself.
        expect(after.baseLine).toHaveLength(2);
        expect(after.height).toBe(1.1);
        expect(after.levelId).toBe(LEVEL_ID);
    });
});
