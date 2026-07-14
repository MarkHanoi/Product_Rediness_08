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
 * "uniform command" is: per-family commands of a UNIFORM payload shape, unified at
 * the UI by this one dispatch facade. Mutations stay command-routed (P6), each
 * handler is undoable and carries its own OTel span (P8).
 *
 * §FIX-MATERIAL-DEAD-DISPATCH (Gate G7) — the facade is unchanged; WHICH COMMAND each
 * family routes to is not. The `<family>.setMaterial` plugin handlers this module used
 * to call write a DETACHED plugin DTO store that nothing in production reads (see the
 * long note above `MATERIAL_ROUTES`), so every material change was a no-op on the record
 * while the inspector's live mesh repaint made it LOOK applied. Each family now routes to
 * the command that actually reaches the geometry store; families with no such command are
 * declared in `MATERIAL_UNSUPPORTED_REASON` instead of dispatching into the void.
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
  /** Bus command type string, e.g. `column.update`. */
  readonly command: string;
  /** Payload key the handler expects for the element id, e.g. `ceilingId`. */
  readonly idField: string;
  /**
   * Where the material fields sit in the payload:
   *   'updates' — nested under `updates` (the `<family>.update` legacy bridges, which
   *               pass a `Partial<XData>` straight into `store.update()`).
   *   'flat'    — top-level fields (`room.setMaterial`, `furniture.updateParameters`).
   */
  readonly shape: 'updates' | 'flat';
  /** Whether the family's GEOMETRY record carries a `materialColor` field. */
  readonly supportsColor: boolean;
  /** The record field a colour override is written to (`materialColor` unless noted). */
  readonly colorField?: string;
}

/**
 * §FIX-MATERIAL-DEAD-DISPATCH (Gate G7) — WHY THESE ROUTES CHANGED.
 *
 * The original §FEAT-UNIFORM-MATERIAL-COMMAND (L-08 / L-57) routed every family to its
 * plugin `<family>.setMaterial` handler. Those handlers are REAL — but with ONE exception
 * (`room.setMaterial`, which bridges to `commandManager`) they `produceCommand` against
 * the plugin's DTO store (`ctx.stores.slab`, `ctx.stores.furniture`, …). In production
 * those stores are FRESH instances built by `PluginRegistry` (`new SlabStore()`), NOT the
 * geometry stores (`window.slabStore`, …) that the fragment builders, the 2-D plan
 * projector, the IFC exporter and persistence all read. Nothing bridges plugin-store
 * UPDATES back: `initTools` mirrors `<family>.created` ONLY, and `composeRuntime`
 * registers NO committers, so the scene-committer `MATERIAL_FIELDS` dirty-check those
 * handlers refer to never runs. Meanwhile `PropertyInspector.onMaterialChange` /
 * `onColorInput` repaint the THREE mesh live — so the user SAW the new material, the
 * record never changed, and the paint evaporated on the next rebuild / reload.
 *
 * That is this project's signature disease in its purest form: ONE element, TWO paths,
 * and the path the panel dispatches on is the one nobody reads. It is the same root cause
 * as §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220 — "the plugin handler mutates a DETACHED
 * plugin DTO store … so even a correct payload could not update the 2D plan") and
 * §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105 — "the clean plugin-bus type handlers mutate a
 * DETACHED DTO store with no bridge to the legacy geometry store").
 *
 * The fix is ADR-0105's: route each family to THE COMMAND THAT ACTUALLY REACHES THE
 * GEOMETRY STORE — the `<family>.update` legacy bridge, which executes the legacy
 * `UpdateXCommand` (`store.update(id, updates)` → `bim-<family>-updated` → mesh rebuild
 * + plan re-projection + persistence). Verified end-to-end per family: the record carries
 * the field, the command passes `updates` through, and the builder reads it.
 *
 * Families with NO live material path are declared in `MATERIAL_UNSUPPORTED_REASON`
 * rather than dispatched into the void — a control that lies is worse than one that says
 * "not yet".
 */
const MATERIAL_ROUTES: Readonly<Record<string, FamilyMaterialRoute>> = {
  // ── Live: `<family>.update` → legacy UpdateXCommand → geometry store → rebuild ──
  column:      { command: 'column.update',          idField: 'id',        shape: 'updates', supportsColor: true },
  ceiling:     { command: 'ceiling.update',         idField: 'ceilingId', shape: 'updates', supportsColor: true },
  floor:       { command: 'floor.update',           idField: 'floorId',   shape: 'updates', supportsColor: true },
  roof:        { command: 'roof.update',            idField: 'id',        shape: 'updates', supportsColor: true },
  curtainwall: { command: 'wall.updateCurtainWall', idField: 'id',        shape: 'updates', supportsColor: true },

  // ── Live: dedicated handlers that already bridge to commandManager ─────────────
  // `room.setMaterial` is the ONE setMaterial handler that writes the geometry store
  // (SetRoomMaterialHandler → commandManager → roomStore) — keep it.
  room:        { command: 'room.setMaterial',            idField: 'roomId', shape: 'flat', supportsColor: true },
  // Furniture: `furniture.updateParameters` bridges to UpdateFurnitureParametersCommand
  // (geometry furnitureStore → bim-furniture-updated). Its colour field is `color`.
  furniture:   { command: 'furniture.updateParameters',  idField: 'id',     shape: 'flat', supportsColor: true, colorField: 'color' },
};

/**
 * Families whose inspector shows a Material/Colour control that CANNOT be committed to
 * the geometry record today, with the reason. `dispatchSetMaterial` returns `false` for
 * these, so the caller keeps its legacy per-type behaviour (and can surface the gap)
 * instead of dispatching a command whose only effect is a detached-store patch.
 */
export const MATERIAL_UNSUPPORTED_REASON: Readonly<Record<string, string>> = {
  slab:       'slab.setMaterial / slab.update are both claimed by plugin handlers that write the DETACHED plugin DTO store; the geometry slabStore (which the builder + plan read) is never touched. Needs a legacy bridge (the L-220 plumbing.moveFixture pattern).',
  wall:       'wall.setColor is a plugin handler on the detached plugin wall store — AND PropertyInspectorApply dispatches it with { wallId } while the handler requires { id }, so it is rejected at canExecute before it can even do nothing. Needs a legacy bridge to the geometry wallStore.',
  beam:       'BeamData carries `material?: string`, not materialId/materialColor — nothing to write and nothing the builder would read.',
  stair:      'stair.setMaterial writes the detached plugin stair store; StairData has no material field the builder reads.',
  handrail:   'handrail.setMaterial writes the detached plugin handrail store; no geometry material field.',
  plumbing:   'plumbing.setMaterial writes the detached plugin plumbing store (the same store L-220 already caught for plumbing.move).',
  lighting:   'lighting.setMaterial writes the detached plugin lighting store.',
  structural: 'structural.setMaterial writes the detached plugin structural store.',
  door:       'Door/window frame colour dispatches door.setFrameColor / window.setFrameColor — commands for which NO handler is registered anywhere on the bus.',
  window:     'Door/window frame colour dispatches door.setFrameColor / window.setFrameColor — commands for which NO handler is registered anywhere on the bus.',
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

/** True when this element type has a material command that reaches the geometry record. */
export function hasMaterialCommand(elementType: string | undefined | null): boolean {
  return routeFor(elementType) !== undefined;
}

/**
 * Why this element type's material cannot be committed yet (or `undefined` when it can).
 * The caller SURFACES this — an enabled Material control that silently does nothing is
 * worse than one that says "not yet" (the L-267 lesson).
 */
export function materialUnsupportedReason(elementType: string | undefined | null): string | undefined {
  if (!elementType) return undefined;
  const key = String(elementType).toLowerCase();
  const canonical = TYPE_ALIASES[key] ?? key;
  return MATERIAL_UNSUPPORTED_REASON[canonical];
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

  // The material fields, in the family's own vocabulary.
  const fields: Record<string, unknown> = {};
  let willSend = false;
  if (input.materialId !== undefined) {
    fields.materialId = input.materialId;
    willSend = true;
  }
  if (route.supportsColor && input.materialColor !== undefined && input.materialColor !== '') {
    fields[route.colorField ?? 'materialColor'] = input.materialColor;
    willSend = true;
  }
  if (!willSend) return false;

  // 'updates' families are the `<family>.update` legacy bridges: the material fields go
  // in the `updates` bag the command spreads into `store.update(id, updates)` — the ONE
  // path that reaches the geometry record the builders + plan + persistence read.
  const payload: Record<string, unknown> =
    route.shape === 'updates'
      ? { [route.idField]: elementId, updates: fields }
      : { [route.idField]: elementId, ...fields };

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
