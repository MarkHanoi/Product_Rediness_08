// @vitest-environment happy-dom
//
// §FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — the "Set parameters before creating" panel
// (ElementCreationModal, shared by the floor-finish AND ceiling create tools) gained a
// finish/assembly TYPE selector sourced from the SAME catalogue the post-creation
// property-panel dropdown reads. The chosen type id is returned via onConfirm so the
// tool (FloorTool / CeilingTool) can resolve its layer snapshot and thread it into the
// CREATE payload — reusing the type→layers resolution the L-106 swap path uses.
//
// This suite drives the modal end-to-end in happy-dom: the dropdown is rendered from the
// supplied catalogue, selecting a concrete type auto-fills the thickness field and is
// returned on confirm, and the "Plain" option yields an undefined systemTypeId (the
// tool's existing plain-finish default path).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ElementCreationModal, type ElementCreationParams } from '../src/ui/ElementCreationModal';

const FLOOR_TYPES = [
  { id: 'ft-oak', name: 'Engineered Timber', totalThickness: 0.022 },
  { id: 'ft-marble', name: 'Carrara Marble', totalThickness: 0.030 },
];

function q<T extends Element>(sel: string): T {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`not found: ${sel}`);
  return el as T;
}

describe('§FEAT-FLOOR-CREATE-TYPE-PICKER (L-105) — creation-panel finish-type selector', () => {
  let modal: ElementCreationModal;

  beforeEach(() => { modal = new ElementCreationModal(); });
  afterEach(() => { modal.dismiss(); document.body.innerHTML = ''; });

  it('renders a finish-type dropdown from the supplied catalogue (+ a Plain option)', () => {
    modal.show({
      params: { kind: 'floor', thickness: 0.015, baseOffset: 0 },
      systemTypes: FLOOR_TYPES,
      onConfirm: () => {},
      onCancel: () => {},
    });
    const sel = q<HTMLSelectElement>('select.ecm-field-input');
    // Plain + 2 catalogue types.
    expect(sel.options.length).toBe(3);
    expect(sel.options[0].value).toBe('');            // "— Plain Floor —"
    expect(sel.options[0].textContent).toContain('Plain Floor');
    expect([...sel.options].map(o => o.value)).toEqual(['', 'ft-oak', 'ft-marble']);
    expect(sel.options[1].textContent).toContain('Engineered Timber');
    expect(sel.options[1].textContent).toContain('22mm');
  });

  it('selecting a type auto-fills the thickness field and returns the type id on confirm', () => {
    let result: ElementCreationParams | undefined;
    modal.show({
      params: { kind: 'floor', thickness: 0.015, baseOffset: 0 },
      systemTypes: FLOOR_TYPES,
      onConfirm: (p) => { result = p; },
      onCancel: () => {},
    });

    const sel = q<HTMLSelectElement>('select.ecm-field-input');
    sel.value = 'ft-marble';
    sel.dispatchEvent(new Event('change'));

    // Thickness field auto-filled to the chosen type's assembly thickness (30 mm).
    const thickInput = q<HTMLInputElement>('input.ecm-field-input');
    expect(parseFloat(thickInput.value)).toBeCloseTo(0.030, 6);

    q<HTMLButtonElement>('.ecm-btn--confirm').click();

    expect(result).toBeDefined();
    expect(result!.kind).toBe('floor');
    expect((result as any).systemTypeId).toBe('ft-marble');
    expect((result as any).thickness).toBeCloseTo(0.030, 6);
  });

  it('the Plain option yields an undefined systemTypeId (plain-finish default path)', () => {
    let result: ElementCreationParams | undefined;
    modal.show({
      params: { kind: 'floor', thickness: 0.015, baseOffset: 0 },
      systemTypes: FLOOR_TYPES,
      onConfirm: (p) => { result = p; },
      onCancel: () => {},
    });
    q<HTMLButtonElement>('.ecm-btn--confirm').click();
    expect((result as any).systemTypeId).toBeUndefined();
  });

  it('pre-selects the current default type (params.systemTypeId)', () => {
    modal.show({
      params: { kind: 'floor', thickness: 0.015, baseOffset: 0, systemTypeId: 'ft-oak' },
      systemTypes: FLOOR_TYPES,
      onConfirm: () => {},
      onCancel: () => {},
    });
    const sel = q<HTMLSelectElement>('select.ecm-field-input');
    expect(sel.value).toBe('ft-oak');
  });

  it('ceiling shares the SAME modal — the picker renders for the ceiling kind too', () => {
    let result: ElementCreationParams | undefined;
    modal.show({
      params: { kind: 'ceiling', height: 2.7, thickness: 0.025 },
      systemTypes: [{ id: 'ct-mf', name: 'MF Plasterboard', totalThickness: 0.0125 }],
      onConfirm: (p) => { result = p; },
      onCancel: () => {},
    });
    const sel = q<HTMLSelectElement>('select.ecm-field-input');
    expect(sel.options[0].textContent).toContain('Plain Ceiling');
    sel.value = 'ct-mf';
    sel.dispatchEvent(new Event('change'));
    q<HTMLButtonElement>('.ecm-btn--confirm').click();
    expect((result as any).systemTypeId).toBe('ct-mf');
  });

  it('renders NO picker when no catalogue is supplied (unchanged legacy behaviour)', () => {
    modal.show({
      params: { kind: 'floor', thickness: 0.015, baseOffset: 0 },
      onConfirm: () => {},
      onCancel: () => {},
    });
    expect(document.querySelector('select.ecm-field-input')).toBeNull();
  });
});
