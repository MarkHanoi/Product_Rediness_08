// @vitest-environment happy-dom
//
// §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — the placed-furniture "Type" swap
// dropdown (the founder's requested change-type control, generalised from the
// wall WALL TYPE picker). This test drives the pure DOM widget and asserts:
//   • it declines to render for non-furniture elements,
//   • it lists the element's CATEGORY peers with the current type pre-selected,
//   • clicking Apply on a NEW selection fires onApply with the target type + the
//     catalogue default dimensions (so the swapped piece reads at the right scale),
//   • re-applying the SAME (unchanged) type is a no-op (no accidental churn).

import { describe, it, expect, vi } from 'vitest';
import { buildFurnitureTypeSelectorWidget } from '../src/ui/property-panel/FurnitureTypeSelectorWidget';

function q<T extends HTMLElement>(root: HTMLElement, sel: string): T {
    const el = root.querySelector(sel);
    if (!el) throw new Error(`selector not found: ${sel}`);
    return el as T;
}

describe('FurnitureTypeSelectorWidget — §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105)', () => {
    it('returns null for a non-furniture element', () => {
        const el = buildFurnitureTypeSelectorWidget({ type: 'wall', furnitureType: 'sofa_3seat' }, () => {});
        expect(el).toBeNull();
    });

    it('returns null when the element has no furnitureType', () => {
        const el = buildFurnitureTypeSelectorWidget({ type: 'furniture' }, () => {});
        expect(el).toBeNull();
    });

    it('renders a Type dropdown listing the element category peers, current pre-selected', () => {
        const onApply = vi.fn();
        const el = buildFurnitureTypeSelectorWidget(
            { type: 'furniture', furnitureType: 'sofa_3seat', furnitureCategory: 'sofas' },
            onApply,
        );
        // sofas is a well-populated category (>1 item) so the widget renders.
        expect(el).not.toBeNull();
        const select = q<HTMLSelectElement>(el!, 'select.wts-select');
        expect(select.options.length).toBeGreaterThan(1);
        // the current type is the selected option.
        expect(select.value).toBe('sofa_3seat');
        // a "Type" label is present.
        expect(el!.textContent).toContain('Type');
    });

    it('fires onApply with the target type when Apply is clicked on a new selection', () => {
        const onApply = vi.fn();
        const el = buildFurnitureTypeSelectorWidget(
            { type: 'furniture', furnitureType: 'sofa_3seat', furnitureCategory: 'sofas' },
            onApply,
        )!;
        const select = q<HTMLSelectElement>(el, 'select.wts-select');
        const applyBtn = q<HTMLButtonElement>(el, 'button.wts-apply-btn');

        // pick a different option than the current one.
        const other = Array.from(select.options).find((o) => o.value !== 'sofa_3seat');
        expect(other).toBeTruthy();
        select.value = other!.value;
        applyBtn.click();

        expect(onApply).toHaveBeenCalledTimes(1);
        const payload = onApply.mock.calls[0][0];
        expect(payload.newFurnitureType).toBe(other!.value);
        expect(payload.furnitureCategory).toBe('sofas');
        // catalogue defaults for the target type are forwarded (numbers in metres).
        expect(typeof payload.width).toBe('number');
    });

    it('does NOT fire onApply when Apply is clicked with the current type still selected', () => {
        const onApply = vi.fn();
        const el = buildFurnitureTypeSelectorWidget(
            { type: 'furniture', furnitureType: 'sofa_3seat', furnitureCategory: 'sofas' },
            onApply,
        )!;
        const applyBtn = q<HTMLButtonElement>(el, 'button.wts-apply-btn');
        applyBtn.click();
        expect(onApply).not.toHaveBeenCalled();
    });

    // ── §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68) — bug (1): wrong candidate list ──
    it('lists BED-family peers for a bed — NOT dresser/mirrors — even when the stored furnitureCategory is the mismatched "bedroom"', () => {
        const onApply = vi.fn();
        // Reproduce the founder's element: a placed BED whose stored category is the
        // divergent 'bedroom' (from FURNITURE_TYPE_TO_CATEGORY: bed → 'bedroom'). The
        // pre-fix widget listed getItemsForCategory('bedroom') = Dresser / Round
        // Mirror / Rectangular Mirror. The reverse-lookup must override that and list
        // the element's OWN registry family (`beds`).
        const el = buildFurnitureTypeSelectorWidget(
            { type: 'furniture', furnitureType: 'bed', furnitureCategory: 'bedroom' },
            onApply,
        );
        expect(el).not.toBeNull();
        const select = q<HTMLSelectElement>(el!, 'select.wts-select');
        const values = Array.from(select.options).map((o) => o.value);

        // the current type is present + pre-selected.
        expect(values).toContain('bed');
        expect(select.value).toBe('bed');
        // real bed variants are offered.
        expect(values).toContain('nordic_bed');
        expect(values).toContain('solid_wood_bed');
        // the WRONG 'bedroom'-category accessories are NOT offered.
        expect(values).not.toContain('kave_dresser');
        expect(values).not.toContain('kave_round_mirror');
        expect(values).not.toContain('kave_rect_mirror');
    });

    it('lists bed-family peers for a bed with NO stored furnitureCategory (reverse-lookup from type)', () => {
        const el = buildFurnitureTypeSelectorWidget(
            { type: 'furniture', furnitureType: 'bed' },
            vi.fn(),
        );
        expect(el).not.toBeNull();
        const values = Array.from(q<HTMLSelectElement>(el!, 'select.wts-select').options).map((o) => o.value);
        expect(values).toContain('bed');
        expect(values).not.toContain('kave_dresser');
    });

    // ── §KITCHEN107 (L-11602, C86 §9 WO-Voc-4) — kitchen axis separation ──────
    //
    // The 'kitchen' category stocks run SHAPES + appliance MODULES + catalogue
    // appliances. The founder's dropdown offered all three in one list, so
    // "Hob/Cooktop" was selectable as the TYPE of a whole L-shaped kitchen.
    describe('kitchen vocabulary separation (§KITCHEN107, L-11602)', () => {
        it('a kitchen RUN offers ONLY the seven run shapes — no unit features, no appliances', () => {
            const el = buildFurnitureTypeSelectorWidget(
                { type: 'furniture', furnitureType: 'kitchen_l_shape_tall', furnitureCategory: 'kitchen' },
                vi.fn(),
            );
            expect(el).not.toBeNull();
            const values = Array.from(q<HTMLSelectElement>(el!, 'select.wts-select').options).map((o) => o.value);
            expect(values.sort()).toEqual([
                'kitchen_island',
                'kitchen_l_shape', 'kitchen_l_shape_tall',
                'kitchen_straight', 'kitchen_straight_tall',
                'kitchen_u_shape', 'kitchen_u_shape_tall',
            ]);
        });

        it('a standalone kitchen appliance does NOT offer the run shapes', () => {
            const el = buildFurnitureTypeSelectorWidget(
                { type: 'furniture', furnitureType: 'hob', furnitureCategory: 'kitchen' },
                vi.fn(),
            );
            expect(el).not.toBeNull();
            const values = Array.from(q<HTMLSelectElement>(el!, 'select.wts-select').options).map((o) => o.value);
            expect(values).toContain('hob');
            expect(values.some((v) => v.startsWith('kitchen_'))).toBe(false);
        });

        it('a kitchen RUN target is applied WITHOUT a catalogue dimension re-seed', () => {
            const onApply = vi.fn();
            const el = buildFurnitureTypeSelectorWidget(
                { type: 'furniture', furnitureType: 'kitchen_l_shape', furnitureCategory: 'kitchen' },
                onApply,
            )!;
            const select = q<HTMLSelectElement>(el, 'select.wts-select');
            select.value = 'kitchen_u_shape';
            q<HTMLButtonElement>(el, 'button.wts-apply-btn').click();
            expect(onApply).toHaveBeenCalledTimes(1);
            const payload = onApply.mock.calls[0][0];
            expect(payload.newFurnitureType).toBe('kitchen_u_shape');
            // The run's real geometry lives in kitchenConfig; the 3.0×0.6
            // catalogue card must not stomp a resized run.
            expect(payload.width).toBeUndefined();
            expect(payload.length).toBeUndefined();
        });
    });
});
