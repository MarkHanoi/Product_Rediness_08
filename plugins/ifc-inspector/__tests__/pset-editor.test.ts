/**
 * PsetEditorPanel + PsetUpdateCommand tests (Phase 3-B Sprint S57).
 *
 * Per PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §3.2.
 * Runs in jsdom (env set in vitest.config.ts).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  PsetEditorPanel,
  applyPsetUpdate,
  parsePsetUpdateCommand,
  valueKind,
  type IFCInspectorMeta,
  type PsetUpdateCommand,
} from '../src/index.js';

const META: IFCInspectorMeta = {
  pryzmElementId: 'wall-7',
  globalId: '2xYzAbCdEfGhIjKlMnOpQr',
  typeName: 'IFCWALLSTANDARDCASE',
  name: 'Exterior Wall',
  psets: {
    Pset_WallCommon: {
      IsExternal: true,
      FireRating: '60',
      ThermalTransmittance: 0.25,
    },
    Pset_Custom: { Vendor: 'Acme' },
  },
};

describe('valueKind', () => {
  it('discriminates null from typeof', () => {
    expect(valueKind(null)).toBe('null');
    expect(valueKind('a')).toBe('string');
    expect(valueKind(7)).toBe('number');
    expect(valueKind(true)).toBe('boolean');
  });
});

describe('parsePsetUpdateCommand', () => {
  it('returns the canonical shape for a valid command', () => {
    const cmd = parsePsetUpdateCommand({
      kind: 'element.updatePset',
      elementId: 'wall-7',
      psetName: 'Pset_WallCommon',
      propertyName: 'FireRating',
      value: '90',
    });
    expect(cmd.kind).toBe('element.updatePset');
    expect(cmd.value).toBe('90');
  });

  it('rejects malformed input', () => {
    expect(() => parsePsetUpdateCommand({})).toThrow();
    expect(() => parsePsetUpdateCommand({
      kind: 'element.updatePset',
      elementId: 'a', psetName: 'b', propertyName: 'c',
      value: { not: 'scalar' },
    })).toThrow(/scalar/);
  });
});

describe('applyPsetUpdate', () => {
  it('returns a fresh meta with the value applied', () => {
    const next = applyPsetUpdate(META, {
      kind: 'element.updatePset',
      elementId: 'wall-7',
      psetName: 'Pset_WallCommon',
      propertyName: 'FireRating',
      value: '90',
    });
    expect(next.psets.Pset_WallCommon.FireRating).toBe('90');
    expect(META.psets.Pset_WallCommon.FireRating).toBe('60');
  });

  it('lazy-creates a missing pset', () => {
    const next = applyPsetUpdate(META, {
      kind: 'element.updatePset',
      elementId: 'wall-7',
      psetName: 'Pset_Brand_New',
      propertyName: 'NewProp',
      value: 42,
    });
    expect(next.psets.Pset_Brand_New).toEqual({ NewProp: 42 });
  });

  it('rejects elementId mismatch', () => {
    expect(() => applyPsetUpdate(META, {
      kind: 'element.updatePset',
      elementId: 'WRONG',
      psetName: 'p', propertyName: 'q', value: 1,
    })).toThrow();
  });
});

describe('PsetEditorPanel', () => {
  let host: HTMLElement;
  let bus: { execute: ReturnType<typeof vi.fn> };
  let spans: Array<Record<string, unknown>>;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    bus = { execute: vi.fn() };
    spans = [];
  });

  function mount() {
    const panel = new PsetEditorPanel(host, bus, (args) => { spans.push(args); });
    panel.mount(META);
    return panel;
  }

  it('renders the GlobalId + IFC type as read-only', () => {
    mount();
    const rendered = host.textContent ?? '';
    expect(rendered).toContain('IFCWALLSTANDARDCASE');
    expect(rendered).toContain('2xYzAbCdEfGhIjKlMnOpQr');
  });

  it('renders one details panel per pset', () => {
    mount();
    expect(host.querySelectorAll('details.pset-group')).toHaveLength(2);
  });

  it('emits a PsetUpdateCommand + span on text edit', () => {
    mount();
    const input = host.querySelector(
      'input[data-pset="Pset_WallCommon"][data-prop="FireRating"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    input!.value = '90';
    input!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(bus.execute).toHaveBeenCalledTimes(1);
    const cmd = bus.execute.mock.calls[0][0] as PsetUpdateCommand;
    expect(cmd.kind).toBe('element.updatePset');
    expect(cmd.elementId).toBe('wall-7');
    expect(cmd.psetName).toBe('Pset_WallCommon');
    expect(cmd.propertyName).toBe('FireRating');
    expect(cmd.value).toBe('90');

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({
      elementId: 'wall-7',
      psetName: 'Pset_WallCommon',
      propertyName: 'FireRating',
      valueType: 'string',
    });
  });

  it('emits boolean values from checkboxes', () => {
    mount();
    const checkbox = host.querySelector(
      'input[data-pset="Pset_WallCommon"][data-prop="IsExternal"]',
    ) as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    expect(checkbox!.type).toBe('checkbox');
    checkbox!.checked = false;
    checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

    const cmd = bus.execute.mock.calls[0][0] as PsetUpdateCommand;
    expect(typeof cmd.value).toBe('boolean');
    expect(cmd.value).toBe(false);
    expect(spans[0].valueType).toBe('boolean');
  });

  it('emits numeric values from number inputs', () => {
    mount();
    const num = host.querySelector(
      'input[data-pset="Pset_WallCommon"][data-prop="ThermalTransmittance"]',
    ) as HTMLInputElement | null;
    expect(num).not.toBeNull();
    expect(num!.type).toBe('number');
    num!.value = '0.18';
    num!.dispatchEvent(new Event('change', { bubbles: true }));

    const cmd = bus.execute.mock.calls[0][0] as PsetUpdateCommand;
    expect(typeof cmd.value).toBe('number');
    expect(cmd.value).toBeCloseTo(0.18);
    expect(spans[0].valueType).toBe('number');
  });

  it('dispose() removes the panel + listener', () => {
    const panel = mount();
    panel.dispose();
    expect(host.querySelector('.pset-editor')).toBeNull();
    expect(panel.getCurrentMeta()).toBeNull();
  });
});
