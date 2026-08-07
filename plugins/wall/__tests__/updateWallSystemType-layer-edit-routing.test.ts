/**
 * §FIX-WALL-LAYEREDIT-PROPAGATION (founder 2026-08-06)
 *
 * THE DEFECT: "editing a LAYER's thickness inside an already-assigned wall system type
 * produces NO visible change."
 *
 * ROOT CAUSE (verified at source, not inferred): `UpdateWallSystemTypeHandler` discriminated
 * on "does the wall have a systemTypeId" rather than on WHAT IS BEING EDITED. The two commands
 * it bridges to differ by the latter:
 *
 *   • `UpdateWallLayersCommand` is the LAYER-STACK editor and exists FOR the typed case —
 *     UpdateWallLayersCommand.ts:90-117 calls `typeStore.update(typeId, { layers })` and then
 *     walks `wallStore.getAll()` re-stamping every sibling sharing that `systemTypeId`.
 *   • `UpdateWallSystemTypeCommand` is the single-wall type REBIND — it writes one wall
 *     (UpdateWallSystemTypeCommand.ts:43-52) and never touches the type store.
 *
 * So a layer edit on a TYPED wall (the only case the founder can perform — the layer editor
 * seeds from `wall.layers`) went to the single-wall rebind: the type was never updated and no
 * sibling was re-stamped. Since `WallData.layers` is a frozen create-time snapshot
 * (WallTypes.ts:255-256), nothing downstream would ever re-derive it. The one correct
 * propagation implementation in the repo was gated behind `typeId` being FALSY.
 *
 * These tests pin the ROUTING — which command the handler selects — because that is where the
 * defect lived. They deliberately do NOT re-test `UpdateWallLayersCommand`'s propagation body,
 * which is already correct and unmodified.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UpdateWallSystemTypeHandler } from '../src/handlers/UpdateWallSystemType.js';

interface Captured { name: string; input: Record<string, unknown> }

let captured: Captured[] = [];

const g = globalThis as {
  window?: unknown;
  __pryzmWallLayerEditPropagation?: boolean;
};

beforeEach(() => {
  captured = [];
  // The handler is an F-1.3 migration bridge: it reaches `window.commandManager`. Stub it and
  // record which Command subclass it constructs.
  (g as { window: unknown }).window = {
    commandManager: {
      execute(cmd: unknown) {
        captured.push({
          name: (cmd as object).constructor.name,
          // Every command in this bridge stores its payload on a private `input` field.
          input: (cmd as { input?: Record<string, unknown> }).input ?? {},
        });
      },
    },
  };
});

afterEach(() => {
  delete g.__pryzmWallLayerEditPropagation;
  delete (g as { window?: unknown }).window;
});

const run = (payload: Record<string, unknown>) =>
  UpdateWallSystemTypeHandler.execute({} as never, payload as never);

const LAYERS = [
  { name: 'core', function: 'structure', thickness: 0.20 },
  { name: 'finish', function: 'finish', thickness: 0.05 },
];

describe('§FIX-WALL-LAYEREDIT-PROPAGATION — wall.updateSystemType routing', () => {

  it('a LAYER EDIT on a TYPED wall routes to UpdateWallLayersCommand (type + siblings)', () => {
    // THE regression. Pre-fix this produced UpdateWallSystemTypeCommand — one wall, no type
    // write, no propagation — which is precisely "no visible change" for every other wall of
    // that type, and no persisted change to the type itself.
    run({ wallId: 'w1', systemTypeId: 'type-A', layers: LAYERS, thickness: 0.25 });
    expect(captured).toHaveLength(1);
    expect(captured[0]!.name).toBe('UpdateWallLayersCommand');
    expect(captured[0]!.input.systemTypeId, 'the type id must reach the command that writes it')
      .toBe('type-A');
    expect(captured[0]!.input.thickness).toBe(0.25);
  });

  it('a LAYER EDIT on an UNTYPED wall still routes to UpdateWallLayersCommand (unchanged)', () => {
    run({ wallId: 'w1', systemTypeId: null, layers: LAYERS, thickness: 0.25 });
    expect(captured[0]!.name).toBe('UpdateWallLayersCommand');
  });

  it('a BARE TYPE REBIND (no layer stack) routes to UpdateWallSystemTypeCommand', () => {
    run({ wallId: 'w1', systemTypeId: 'type-B' });
    expect(captured[0]!.name).toBe('UpdateWallSystemTypeCommand');
    expect(captured[0]!.input.systemTypeId).toBe('type-B');
  });

  it('CLEARING a wall\'s type (no layers) routes to UpdateWallSystemTypeCommand with null', () => {
    run({ wallId: 'w1', systemTypeId: null });
    expect(captured[0]!.name).toBe('UpdateWallSystemTypeCommand');
    expect(captured[0]!.input.systemTypeId).toBeNull();
  });

  it('an EMPTY layer array is not a layer edit (UpdateWallLayersCommand would refuse it)', () => {
    // `UpdateWallLayersCommand.canExecute` rejects an empty stack, so routing there would be a
    // silent no-op. Treat it as a rebind instead.
    run({ wallId: 'w1', systemTypeId: 'type-A', layers: [] });
    expect(captured[0]!.name).toBe('UpdateWallSystemTypeCommand');
  });

  it('thickness is DERIVED from the stack when the caller omits it (never passed as 0)', () => {
    // §03-WALL-THICKNESS-CONTRACT §1: thickness is derived from the layer stack. Passing 0
    // would trip `canExecute` ("Total thickness must be positive") and silently drop the edit.
    run({ wallId: 'w1', systemTypeId: 'type-A', layers: LAYERS });
    expect(captured[0]!.name).toBe('UpdateWallLayersCommand');
    expect(captured[0]!.input.thickness).toBeCloseTo(0.25, 9);
  });

  it('a non-positive supplied thickness is also re-derived rather than passed through', () => {
    run({ wallId: 'w1', systemTypeId: 'type-A', layers: LAYERS, thickness: 0 });
    expect(captured[0]!.input.thickness).toBeCloseTo(0.25, 9);
  });

  it('escape hatch __pryzmWallLayerEditPropagation = false restores the pre-fix routing', () => {
    g.__pryzmWallLayerEditPropagation = false;
    run({ wallId: 'w1', systemTypeId: 'type-A', layers: LAYERS, thickness: 0.25 });
    expect(captured[0]!.name).toBe('UpdateWallSystemTypeCommand');
  });

  it('canExecute still requires a wallId', () => {
    expect(UpdateWallSystemTypeHandler.canExecute({} as never, { wallId: '' } as never).valid)
      .toBe(false);
    expect(UpdateWallSystemTypeHandler.canExecute({} as never, { wallId: 'w1' } as never).valid)
      .toBe(true);
  });
});
