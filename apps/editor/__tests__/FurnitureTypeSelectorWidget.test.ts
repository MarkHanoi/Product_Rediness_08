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
});
