/**
 * @file MaterialDispatch.ts — §FEAT-UNIFORM-MATERIAL-COMMAND (audit L-08 / L-57)
 *
 * The single, uniform material/finish dispatch surface for the property panel.
 *
 * Historically only walls/doors/windows could have their material changed through
 * the command path; every other element family showed a Material dropdown + Colour
 * Override in the inspector "Visuals" section but the staged change was silently
 * dropped because `applyChanges` had no branch for it. This module closes that gap
 * by mapping an element type → its family's `<family>.setMaterial` bus command
 * (the proven per-family handler shape already used by `structural.setMaterial`,
 * `room.setMaterial`, `wall.setColor`). One call site, one contract:
 *
 *   dispatchSetMaterial(runtime, elementType, elementId, { materialId, materialColor })
 *
 * Design (see ADR-0117): a SINGLE generic handler cannot exist under the 8-layer
 * model because each element family owns its own store in its own L7 plugin — a
 * generic mutator would have to import all 12 stores, breaking plugin isolation and
 * the layer-import rule. The bus's handler model is deliberately per-type /
 * per-store (`affectedStores` names ONE store). So the architecturally correct
 * "uniform command" is: per-family handlers of a UNIFORM payload shape, unified at
 * the UI by this one dispatch facade. Mutations stay command-routed (P6), each
 * handler is undoable and carries its own OTel span (P8).
 *
 * Families whose schema carries a `materialColor` field (slab, ceiling, roof, floor,
 * room) accept a colour override; the remainder are `materialId`-only (a catalogue
 * reference — identical to the proven `structural.setMaterial`) and their rendered
 * colour derives from the material-library entry. Walls/doors/windows keep their
 * pre-existing dedicated path and are intentionally NOT routed here (scope: L-08
 * targets the families that lacked a material path).
 */

/** Minimal shape of the runtime we need — avoids importing the full runtime type. */
interface BusLike {
  bus?: { executeCommand(type: string, payload: unknown): Promise<unknown> | undefined };
}

export interface MaterialSetInput {
  /** Catalogue material id. `null` clears the binding; `undefined` = leave untouched. */
  readonly materialId?: string | null;
  /** Hex colour override (only honoured by families whose schema has `materialColor`). */
  readonly materialColor?: string;
}

interface FamilyMaterialRoute {
  /** Bus command type string, e.g. `slab.setMaterial`. */
  readonly command: string;
  /** Payload key the handler expects for the element id, e.g. `slabId`. */
  readonly idField: string;
  /** Whether the family's schema carries a `materialColor` field. */
  readonly supportsColor: boolean;
}

/**
 * elementType (lowercase `userData.elementType || userData.type`) → family route.
 * Aliases (e.g. `stairs`→stair, furniture sub-types→furniture) are normalised in
 * `routeFor`. Walls/doors/windows are deliberately absent (own path, out of scope).
 */
const MATERIAL_ROUTES: Readonly<Record<string, FamilyMaterialRoute>> = {
  slab: { command: 'slab.setMaterial', idField: 'slabId', supportsColor: true },
  ceiling: { command: 'ceiling.setMaterial', idField: 'ceilingId', supportsColor: true },
  roof: { command: 'roof.setMaterial', idField: 'roofId', supportsColor: true },
  floor: { command: 'floor.setMaterial', idField: 'floorId', supportsColor: true },
  room: { command: 'room.setMaterial', idField: 'roomId', supportsColor: true },
  column: { command: 'column.setMaterial', idField: 'columnId', supportsColor: false },
  beam: { command: 'beam.setMaterial', idField: 'beamId', supportsColor: false },
  stair: { command: 'stair.setMaterial', idField: 'stairId', supportsColor: false },
  handrail: { command: 'handrail.setMaterial', idField: 'handrailId', supportsColor: false },
  furniture: { command: 'furniture.setMaterial', idField: 'furnitureId', supportsColor: false },
  plumbing: { command: 'plumbing.setMaterial', idField: 'plumbingId', supportsColor: false },
  lighting: { command: 'lighting.setMaterial', idField: 'lightingId', supportsColor: false },
  curtainwall: { command: 'curtainwall.setMaterial', idField: 'curtainWallId', supportsColor: false },
  structural: { command: 'structural.setMaterial', idField: 'structuralId', supportsColor: false },
};

/** Type aliases → canonical family key. */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  stairs: 'stair',
  'curtain-wall': 'curtainwall',
  bed: 'furniture',
  table: 'furniture',
  chair: 'furniture',
  sofa: 'furniture',
  desk: 'furniture',
  wardrobe: 'furniture',
  corner_wardrobe: 'furniture',
  wardrobe_glass_door: 'furniture',
  brace: 'structural',
  bracing: 'structural',
};

/** Resolve a raw element type (any case, with aliases) to its material route. */
export function routeFor(elementType: string | undefined | null): FamilyMaterialRoute | undefined {
  if (!elementType) return undefined;
  const key = String(elementType).toLowerCase();
  const canonical = TYPE_ALIASES[key] ?? key;
  return MATERIAL_ROUTES[canonical];
}

/** True when this element type has a uniform material-set command wired. */
export function hasMaterialCommand(elementType: string | undefined | null): boolean {
  return routeFor(elementType) !== undefined;
}

/**
 * Dispatch a material/finish change for a single element through its family's
 * `<family>.setMaterial` command.
 *
 * Returns `true` only when a command was actually dispatched. Returns `false` when:
 *  - the element type has no route (e.g. wall/door/window — own path), or
 *  - there is nothing to apply (no `materialId`, and either no `materialColor` or
 *    the family does not support colour) — the caller may then fall back to any
 *    legacy per-type path (e.g. furniture colour via `furniture.updateParameters`).
 */
export function dispatchSetMaterial(
  runtime: BusLike | null | undefined,
  elementType: string | undefined | null,
  elementId: string,
  input: MaterialSetInput,
): boolean {
  const route = routeFor(elementType);
  if (!route || !elementId) return false;
  const bus = runtime?.bus;
  if (!bus) return false;

  const payload: Record<string, unknown> = { [route.idField]: elementId };
  let willSend = false;
  if (input.materialId !== undefined) {
    payload.materialId = input.materialId;
    willSend = true;
  }
  if (route.supportsColor && input.materialColor !== undefined && input.materialColor !== '') {
    payload.materialColor = input.materialColor;
    willSend = true;
  }
  if (!willSend) return false;

  bus.executeCommand(route.command, payload)?.catch((e: unknown) =>
    console.error(`[MaterialDispatch] ${route.command} failed:`, e),
  );
  return true;
}

/**
 * Multi-select-safe: dispatch the same material change to every element id.
 * Each element is one undoable command step (the ring/cm stack coalesces per user
 * gesture). Returns the count actually dispatched.
 */
export function dispatchSetMaterialMany(
  runtime: BusLike | null | undefined,
  elements: ReadonlyArray<{ readonly id: string; readonly type: string }>,
  input: MaterialSetInput,
): number {
  let n = 0;
  for (const el of elements) {
    if (dispatchSetMaterial(runtime, el.type, el.id, input)) n += 1;
  }
  return n;
}
