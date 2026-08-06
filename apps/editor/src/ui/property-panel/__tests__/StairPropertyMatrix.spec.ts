/**
 * THE STAIR PROPERTY MATRIX — every visible control must be REACHABLE.
 *
 * C11 (element creation/regeneration pipeline) + C03 (schemas / commands / state).
 *
 * The repo's standing lesson is that the bottleneck is not whether a feature was
 * authored but whether it is REACHABLE. A property row can fail in four distinct
 * ways, and this suite pins all four for the stair schema:
 *
 *   1. DEAD ON WRITE   — the edit never reaches the geometry (§FIX-STAIR-PARAM-NO-REGEN,
 *                        §FIX-STAIR-AUTHORED-PARAM-DEAF). Pinned by asserting every
 *                        geometry-bearing key is recognised by the ElementRebuildRegistry
 *                        descriptor that dispatches GenerateStairGeometryCommand.
 *   2. DEAD ON READ    — the row renders but shows the WRONG value, because the panel's
 *                        `getNestedValue` never resolved a dotted path. Every
 *                        `properties.*` row displayed `undefined`, so the enums fell back
 *                        to their first option and 'Risers Visible' rendered unchecked on
 *                        a stair whose risers were visible (§FIX-STAIR-PROPS-DISPLAY-DEAF).
 *   3. INVALID OPTIONS — the control offers a value the Zod schema rejects
 *                        (Material offered 'wood', which is not a StairMaterial), or hides
 *                        members that ARE valid (§FIX-STAIR-PANEL-ENUM-DRIFT).
 *   4. WRONG BOUNDS    — the row's min/max contradict STAIR_CONSTRAINTS, and because the
 *                        panel commits through the GENERIC UpdateElementParameterCommand
 *                        (which never consults them) the panel was the ONLY gate
 *                        (§FIX-STAIR-PANEL-BOUNDS-DRIFT).
 */

import { describe, it, expect } from 'vitest';
import { generateDescriptors } from '../PropertyDescriptorGenerator';
import { getNestedValue } from '../PropertyRenderer';
import {
    STAIR_CONSTRAINTS,
    DEFAULT_STAIR_PROPERTIES,
    StairMaterialSchema,
    StairNosingTypeSchema,
    StairStringerTypeSchema,
    type StairData,
} from '@pryzm/geometry-stair';
import {
    resolveElementRebuildDescriptor,
    isGeometryAffectingChange,
} from '@pryzm/command-registry';

/** A realistic stair whose every property is set to a NON-default value, so a row that
 *  reads the default (or undefined) instead of the record is caught. */
const STAIR = {
    id: 'stair-1',
    type: 'stair',
    levelId: 'L0',
    baseLevelId: 'L0',
    topLevelId: 'L1',
    baseOffset: 0,
    topOffset: 0,
    shape: 'L',
    startPosition: { x: 0, y: 0, z: 0 },
    width: 1.35,
    riserHeight: 0.172,
    treadDepth: 0.285,
    riserCount: 17,
    flights: [],
    landings: [],
    typeId: 'steel-open-riser',
    fireRating: 'FR60',
    accessibilityType: 'accessible',
    properties: {
        mark: 'ST-01',
        material: 'timber',
        riserVisible: false,          // opposite of DEFAULT_STAIR_PROPERTIES
        nosingType: 'rounded',        // the member the old panel could not offer
        nosingDepth: 0.032,
        stringerType: 'mono',
        stringerThickness: 0.06,
        handrailLeft: true,
        handrailRight: false,
        handrailHeight: 1.02,
        railingType: 'glass-panel',
    },
    parameters: {},
    metadata: { createdAt: '', modifiedAt: '', version: 1, source: 'user' },
    ifcData: { guid: 'GUID-1', ifcClass: 'IfcStair' },
    // Injected onto the panel's elementData by PropertyPanel.enrichFromStores()
    // (§6.5 Room ↔ Element lookup), not a StairData field.
    room: 'Stair Core',
} as unknown as StairData & Record<string, unknown>;

const descriptors = generateDescriptors(STAIR as unknown as Record<string, unknown>);
const editable = descriptors.filter(d => d.editable && d.type !== 'readonly');

/**
 * Rows that legitimately do NOT feed geometry. Anything editable and absent from this
 * list must be recognised by the stair rebuild descriptor — that is the test.
 */
const NON_GEOMETRIC = new Set([
    'mark',                 // routed separately via element.updateMark
    'fireRating',           // code metadata, IFC property set only
    'accessibilityType',    // validation input, not a dimension
]);

describe('stair property matrix — the schema itself', () => {
    it('exposes rows at all (guards against a silent schema rename)', () => {
        expect(descriptors.length).toBeGreaterThan(10);
        expect(editable.length).toBeGreaterThan(5);
    });

    it('every editable row uses a key the stair record can actually hold', () => {
        for (const d of editable) {
            const root = d.key.split('.')[0];
            // `mark` is deliberately exempt: StairData has no top-level `mark`, its home
            // is `properties.mark`, and the panel resolves + routes it that way.
            if (d.key === 'mark') {
                expect(STAIR.properties).toHaveProperty('mark');
                continue;
            }
            expect(
                root in STAIR,
                `row "${d.label}" (${d.key}) names nothing on StairData`,
            ).toBe(true);
        }
    });
});

// ── Failure mode 2: DEAD ON READ ─────────────────────────────────────────────
describe('every row RESOLVES its current value (§FIX-STAIR-PROPS-DISPLAY-DEAF)', () => {
    it('no descriptor row renders `undefined` for a fully-populated stair', () => {
        const blind = descriptors
            .filter(d => getNestedValue(STAIR as Record<string, unknown>, d.key) === undefined)
            .map(d => `${d.label} (${d.key})`);
        expect(blind, `rows that cannot see their own value: ${blind.join(', ')}`).toEqual([]);
    });

    it('reads the RECORD, not the default — riserVisible false must read false', () => {
        // The precise symptom: DEFAULT_STAIR_PROPERTIES.riserVisible is `true`, the
        // stair's is `false`, and the old lookup returned `undefined` — which the
        // checkbox coerces to unchecked. Getting `false` here only proves the fix if
        // the DEFAULT is the opposite, which it is.
        expect(DEFAULT_STAIR_PROPERTIES.riserVisible).toBe(true);
        expect(getNestedValue(STAIR as Record<string, unknown>, 'properties.riserVisible')).toBe(false);
    });

    it('reads every dotted property exactly', () => {
        expect(getNestedValue(STAIR as Record<string, unknown>, 'properties.material')).toBe('timber');
        expect(getNestedValue(STAIR as Record<string, unknown>, 'properties.stringerType')).toBe('mono');
        expect(getNestedValue(STAIR as Record<string, unknown>, 'properties.nosingType')).toBe('rounded');
        expect(getNestedValue(STAIR as Record<string, unknown>, 'properties.railingType')).toBe('glass-panel');
        expect(getNestedValue(STAIR as Record<string, unknown>, 'properties.handrailHeight')).toBe(1.02);
    });

    it("resolves `mark` from properties.mark — StairData has no top-level `mark`", () => {
        expect('mark' in STAIR).toBe(false);
        expect(getNestedValue(STAIR as Record<string, unknown>, 'mark')).toBe('ST-01');
    });

    it('a missing intermediate object does not throw', () => {
        expect(getNestedValue({}, 'properties.material')).toBeUndefined();
        expect(getNestedValue({ properties: null }, 'properties.material')).toBeUndefined();
    });
});

// ── Failure mode 1: DEAD ON WRITE ────────────────────────────────────────────
describe('every geometry-bearing row REACHES a rebuild (C11)', () => {
    const descriptor = resolveElementRebuildDescriptor('stairs');

    it('the stair rebuild descriptor is registered for both type aliases', () => {
        expect(descriptor).toBeDefined();
        expect(resolveElementRebuildDescriptor('stair')).toBe(descriptor);
    });

    it('every editable row that is not explicitly non-geometric triggers the rebuild', () => {
        const unreachable = editable
            .filter(d => !NON_GEOMETRIC.has(d.key))
            .filter(d => !isGeometryAffectingChange(descriptor!, [d.key]))
            .map(d => `${d.label} (${d.key})`);
        expect(
            unreachable,
            `editable rows that would NOT rebuild the stair: ${unreachable.join(', ')}`,
        ).toEqual([]);
    });

    it('the declared non-geometric rows really are inert (no needless rebuild)', () => {
        // `mark` never reaches this command at all (PropertyPanel.onApply strips it),
        // and the other two are pure metadata. If one of these ever starts affecting
        // geometry, this assertion is the reminder to move it out of NON_GEOMETRIC.
        expect(isGeometryAffectingChange(descriptor!, ['fireRating'])).toBe(false);
        expect(isGeometryAffectingChange(descriptor!, ['accessibilityType'])).toBe(false);
    });
});

// ── Failure mode 3: INVALID OPTIONS ──────────────────────────────────────────
describe('every enum row offers exactly the schema-valid values (§FIX-STAIR-PANEL-ENUM-DRIFT)', () => {
    const optionsFor = (key: string) => descriptors.find(d => d.key === key)?.options ?? [];

    it('Material offers the StairMaterial union and nothing else', () => {
        const opts = optionsFor('properties.material');
        expect([...opts].sort()).toEqual([...StairMaterialSchema.options].sort());
        // The regression itself: 'wood' is not a StairMaterial and must be gone.
        expect(opts).not.toContain('wood');
        expect(opts).toContain('timber');
    });

    it('Nosing Type offers the full union, including the previously unreachable "rounded"', () => {
        const opts = optionsFor('properties.nosingType');
        expect([...opts].sort()).toEqual([...StairNosingTypeSchema.options].sort());
        expect(opts).toContain('rounded');
    });

    it('Stringer Type offers the full union', () => {
        expect([...optionsFor('properties.stringerType')].sort())
            .toEqual([...StairStringerTypeSchema.options].sort());
    });

    it('every enum row can display the value this stair actually holds', () => {
        // An option list that cannot represent the current value silently re-labels the
        // stair as its first option — the read-side twin of failure mode 3.
        for (const d of descriptors.filter(x => x.type === 'enum' && x.options)) {
            const current = getNestedValue(STAIR as Record<string, unknown>, d.key);
            if (current === undefined) continue;
            expect(d.options, `${d.label} cannot show its current value "${current}"`)
                .toContain(current);
        }
    });
});

// ── Failure mode 4: WRONG BOUNDS ─────────────────────────────────────────────
describe('numeric rows agree with STAIR_CONSTRAINTS (§FIX-STAIR-PANEL-BOUNDS-DRIFT)', () => {
    const rowFor = (key: string) => descriptors.find(d => d.key === key)!;

    it('riser height cannot be driven past the code maximum', () => {
        const r = rowFor('riserHeight');
        expect(r.min).toBe(STAIR_CONSTRAINTS.MIN_RISER_HEIGHT);
        expect(r.max).toBe(STAIR_CONSTRAINTS.MAX_RISER_HEIGHT);
        // The shipped drift: 0.220 m against a 0.190 m maximum.
        expect(r.max).toBeLessThan(0.220);
    });

    it('tread depth cannot be driven below the code minimum', () => {
        const r = rowFor('treadDepth');
        expect(r.min).toBe(STAIR_CONSTRAINTS.MIN_TREAD_DEPTH);
        // The shipped drift: 0.220 m against a 0.250 m minimum.
        expect(r.min).toBeGreaterThan(0.220);
    });

    it('width cannot be driven below the code minimum', () => {
        expect(rowFor('width').min).toBe(STAIR_CONSTRAINTS.MIN_WIDTH);
    });

    it('handrail height sits inside the published handrail range', () => {
        const r = rowFor('properties.handrailHeight');
        expect(r.min).toBe(STAIR_CONSTRAINTS.MIN_HANDRAIL_HEIGHT);
        expect(r.max).toBe(STAIR_CONSTRAINTS.MAX_HANDRAIL_HEIGHT);
    });

    it('every editable number row declares BOTH bounds', () => {
        const unbounded = editable
            .filter(d => d.type === 'number')
            .filter(d => d.min === undefined || d.max === undefined)
            .map(d => d.label);
        expect(unbounded).toEqual([]);
    });
});

// ── The one-control-per-field rule ───────────────────────────────────────────
describe('typeId has exactly ONE control (§FIX-STAIR-TYPEID-TWO-CONTROLS)', () => {
    it('the descriptor row is read-only — StairTypeSelectorWidget owns the edit', () => {
        // The row used to be an editable free-TEXT box dispatching
        // element.updateParameters (no type defaults applied), while the dropdown
        // dispatches stair.updateParameters (defaults applied). Same field, two
        // commands, two outcomes.
        const r = descriptors.find(d => d.key === 'typeId')!;
        expect(r.editable).toBe(false);
        expect(r.type).toBe('readonly');
    });
});
