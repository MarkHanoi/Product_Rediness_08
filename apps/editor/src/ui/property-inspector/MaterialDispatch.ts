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
  /**
   * §FIX-MATERIAL-REACHES-RECORD (Gate G7) — whether the family's BUILDER actually
   * RESOLVES a catalogue `materialId` (a material-library lookup), as opposed to only
   * honouring a raw colour override.
   *
   * Defaults to `true`. Set `false` ONLY for a family whose builder was READ and found not
   * to look the id up (handrail, door, window). For those, `dispatchSetMaterial` does NOT
   * send a `materialId` — writing a field the builder never reads would put a value on the
   * record that silently does nothing, which is the same lie one layer down. The reason is
   * declared in `MATERIAL_ID_UNSUPPORTED_REASON` so the caller can SURFACE it.
   */
  readonly supportsMaterialId?: boolean;
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
  // §FEAT-FLOOR-SURFACE-FINISH (L-1884, lane RAC1 2026-08-21) — `colorField` was
  // MISSING here, and its default is `materialColor`. MEASURED: `FloorData` has no
  // `materialColor` field and `resolveFloorColor` (FloorColourSystem.ts) never
  // reads one, so the inspector's Colour Override for a floor wrote an undeclared
  // key onto the record, `Object.assign` copied it, and NOTHING resolved it — the
  // §FIX-MATERIAL-REACHES-RECORD defect one field deeper. A floor's own colour
  // override is `colour`, which is the FIRST branch of that resolver.
  //
  // ⚠ THE `materialId` HALF IS STILL PARTIALLY MASKED, and this line does not fix
  // that: `resolveFloorColor` ranks `colour` → `finishSpec.finishColor` →
  // `materialId`, and every auto-generated floor carries a `finishSpec.finishColor`
  // (CreateFloorsByRoomTypeCommand → floorFinish.ts). Measured on such a floor,
  // picking `Parquet · Oak Herringbone` resolves to the OLD `#E2D6BE`, not the
  // material's `#c8a96e`. Chat's `floor.setFinishBatch` writes the WHOLE finish and
  // does not have that problem; making the panel do the same means routing it
  // through that command, which is a bigger change than a route-table field and is
  // logged as L-1884 rather than half-done here.
  floor:       { command: 'floor.update',           idField: 'floorId',   shape: 'updates', supportsColor: true, colorField: 'colour' },
  roof:        { command: 'roof.update',            idField: 'id',        shape: 'updates', supportsColor: true },
  curtainwall: { command: 'wall.updateCurtainWall', idField: 'id',        shape: 'updates', supportsColor: true },

  // ── Live: dedicated handlers that already bridge to commandManager ─────────────
  // `room.setMaterial` is the ONE setMaterial handler that writes the geometry store
  // (SetRoomMaterialHandler → commandManager → roomStore) — keep it.
  // §FIX-DEAD-VERB-ROOM-MATERIAL-ID (W3-3) — `supportsMaterialId: false` was MISSING here,
  // and that omission was the whole defect: this route happily sent a catalogue
  // `materialId`, `SetRoomMaterialHandler` had no legacy field to write it to, returned
  // `{forward: [], inverse: []}` and reported SUCCESS. Meanwhile the inspector had already
  // repainted the fill, so the user saw the material apply, saved, reloaded — and it was
  // gone. A room's fill is the top-level `colour` field; there is no room analog for a
  // library material id, so the id is now declared unsupported and SURFACED (see
  // MATERIAL_ID_UNSUPPORTED_REASON below) rather than dispatched into the void. The colour
  // path is untouched and still reaches roomStore via UpdateRoomCommand.
  room:        { command: 'room.setMaterial',            idField: 'roomId', shape: 'flat', supportsColor: true, supportsMaterialId: false },
  // Furniture: `furniture.updateParameters` bridges to UpdateFurnitureParametersCommand
  // (geometry furnitureStore → bim-furniture-updated). Its colour field is `color`.
  furniture:   { command: 'furniture.updateParameters',  idField: 'id',     shape: 'flat', supportsColor: true, colorField: 'color' },

  // ── §FIX-MATERIAL-REACHES-RECORD (Gate G7) — new legacy bus bridges ───────────
  // Each was verified END TO END before being routed here: the RECORD carries the field,
  // the legacy command writes it to the GEOMETRY store, and the BUILDER READS IT. All five
  // use a DISTINCT bus type the plugin `<family>.setMaterial` handler cannot shadow (the
  // L-220 `plumbing.moveFixture` pattern) — see initBusHandlers for the per-family proof.

  // wall → UpdateWallColorCommand → wallStore.updateWall(); WallFragmentBuilder resolves
  // `materialId` against the material library AND honours `materialColor`. The id field is
  // `wallId` — which is what PropertyInspectorApply always sent; the plugin `wall.setColor`
  // handler that shadowed this wanted `{ id }`, so the panel's command was rejected at
  // canExecute and the rejection was swallowed.
  wall:        { command: 'wall.updateColor',            idField: 'wallId', shape: 'flat', supportsColor: true },

  // slab → UpdateSlabDimensionsCommand → slabStore.update(); SlabFragmentBuilder reads
  // `data.materialId` (library) + `data.materialColor`. (UpdateSlabCommand deliberately
  // THROWS on these fields — UpdateSlabDimensionsCommand is their owner.)
  slab:        { command: 'slab.updateDimensions',       idField: 'slabId', shape: 'flat', supportsColor: true },

  // door / window are DELIBERATELY ABSENT from this table — see MATERIAL_UNSUPPORTED_REASON.
  // Their frame colour is owned by the inspector's dedicated Frame Colour control, which
  // dispatches `door.setFrameColor` / `window.setFrameColor` (bridged to the legacy commands
  // by G7 — before that, NO handler was registered for either, anywhere). Routing the
  // generic Material dropdown to the SAME command would fire it twice for one gesture: two
  // commands, two undo entries, one user action — a C16 violation. One control, one command.

  // handrail → UpdateHandrailCommand → handrailStore.update(); HandrailFragmentBuilder
  // reads `handrail.materialColor`. It does NOT read `materialId` (no library lookup
  // exists for handrails), so we do not write one — declared, not silently dropped.
  handrail:    { command: 'handrail.updateColor',        idField: 'id',     shape: 'flat', supportsColor: true, supportsMaterialId: false },
};

/**
 * Families whose inspector shows a Material/Colour control that CANNOT be committed to
 * the geometry record today, with the reason. `dispatchSetMaterial` returns `false` for
 * these, so the caller keeps its legacy per-type behaviour (and can surface the gap)
 * instead of dispatching a command whose only effect is a detached-store patch.
 */
export const MATERIAL_UNSUPPORTED_REASON: Readonly<Record<string, string>> = {
  // §FIX-MATERIAL-REACHES-RECORD (Gate G7) — these reasons are now MEASURED AT THE BUILDER,
  // not inferred from the bus. The previous entries blamed "the detached plugin store" for
  // all of them; that was true of the DISPATCH but WRONG about the underlying cause for
  // these five. Each of them has a legacy command that DOES reach the geometry store — and
  // routing to it would STILL have changed nothing, because the geometry record has no
  // material field the builder reads, or the builder ignores the one it has. Bridging them
  // would have produced a record that carries a material and a mesh that never shows it:
  // the same lie, one layer deeper, and much harder to see.
  beam:       'The beam builder HARDCODES its material: BeamFragmentBuilder picks between two module-scoped shared materials (_steelMat / _concreteMat) from `sectionType`, and never reads `beam.material`. BeamData has no materialId/materialColor at all. A per-beam colour needs the builder to stop sharing those singletons — tracked under Gate G7.',
  stair:      'StairData has no materialId/materialColor. Its only material field is `properties.material`, a fixed ENUM (concrete|steel|timber|marble|glass|composite) resolved to a preset by StairMaterialResolver — not a catalogue id and not a hex colour, so the inspector Material/Colour control cannot express it. (Separately: the resolver has no preset for timber/glass/composite, which silently fall back to grey.) Needs an enum picker, not a material dropdown — tracked under Gate G7.',
  plumbing:   'The plumbing builder honours `data.color` for the BATH fixture only (createBathMesh). Sink, toilet, urinal, bidet, shower and accessory meshes hardcode their ceramic/chrome colours and never receive one. Applying a material would work on one fixture type in six and silently do nothing on the rest — tracked under Gate G7.',
  lighting:   'LightingData has NO materialId/materialColor. Colour lives in the per-fixture parameter blocks (downlightParams.color, pendantParams.shadeColor, emission.color, …) — a different field name per fixture type. There is nothing for a single Material control to write; it needs a per-fixture-part colour UI — tracked under Gate G7.',
  structural: 'There is no structural runtime family: `schemas/elements/Structural.ts` defines the element (with a materialId) but NO structuralStore, NO builder and NO command exist anywhere. It is schema-only. The real structural element is `column`, which has a full, live material path.',
  // Openings are NOT dead — but they are not driven by the GENERIC Material dropdown.
  door:       'A door\'s finish comes from its SYSTEM TYPE (C15), not from the generic Material dropdown. Its frame colour has its own control, which dispatches door.setFrameColor → UpdateDoorFrameColorCommand → wallStore.updateDoor + doorStore (bridged under Gate G7 — before that NO handler was registered for it anywhere, so the colour repainted the mesh and evaporated on reload). Use Frame Colour, or change the door type.',
  window:     'A window\'s finish comes from its SYSTEM TYPE (C15), not from the generic Material dropdown. Its frame colour has its own control, which dispatches window.setFrameColor → UpdateWindowFrameColorCommand → wallStore.updateWindow + windowStore (bridged under Gate G7 — before that NO handler was registered for it anywhere). Use Frame Colour, or change the window type. NOTE: WindowBuilder lets `frameFinish.materialColor` WIN over `frameColor`, so a window carrying a frameFinish will keep showing the finish colour.',
};

/**
 * §FIX-MATERIAL-REACHES-RECORD (Gate G7) — families whose material COLOUR commits to the
 * record and renders, but whose builder does NOT resolve a catalogue `materialId`.
 *
 * These are NOT unsupported — a colour override works end to end. But selecting a
 * *catalogue material* would write an id that the builder never looks up, so the mesh would
 * not change. `dispatchSetMaterial` therefore omits `materialId` for them, and the caller
 * SURFACES this when the user picks a catalogue material (rather than writing a dead field
 * and letting the live mesh repaint imply success — the exact shape of the G7 defect).
 */
export const MATERIAL_ID_UNSUPPORTED_REASON: Readonly<Record<string, string>> = {
  handrail: 'Handrail colour is applied, but HandrailFragmentBuilder has no material-library lookup — it reads only `materialColor`. Pick a colour override instead of a catalogue material.',
  // §FIX-DEAD-VERB-ROOM-MATERIAL-ID (W3-3) — a room's visible plan / 3-D fill is the
  // top-level `colour` field (the RoomColourSystem override), which is what the renderer
  // and persistence read. There is no legacy room field for a catalogue material id, so
  // `room.setMaterial` had nothing to write one to — and used to say it had. It now
  // refuses with this same reason (plugins/rooms/src/handlers/SetRoomMaterial.ts), and
  // this route no longer sends the id at all.
  room: 'Room colour is applied, but a room has no catalogue-material field — its plan and 3-D fill come from the room `colour` override. Pick a colour instead of a library material.',
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
 * Why a CATALOGUE MATERIAL (as opposed to a raw colour override) cannot be applied to this
 * element type — or `undefined` when it can. The caller SURFACES this when the user picks a
 * material from the library for a colour-only family (handrail / door / window frame).
 *
 * A material id that the builder never resolves is a field that does nothing: the record
 * would carry it, the mesh would not show it, and the inspector's live repaint would imply
 * it had worked. That is the Gate-G7 defect one layer down — so we refuse and say why.
 */
export function materialIdUnsupportedReason(elementType: string | undefined | null): string | undefined {
  if (!elementType) return undefined;
  const key = String(elementType).toLowerCase();
  const canonical = TYPE_ALIASES[key] ?? key;
  // Only meaningful for a family that HAS a live route — an unsupported family is covered
  // by MATERIAL_UNSUPPORTED_REASON.
  if (!MATERIAL_ROUTES[canonical]) return undefined;
  return MATERIAL_ID_UNSUPPORTED_REASON[canonical];
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
  // §FIX-MATERIAL-REACHES-RECORD (G7) — only send a catalogue `materialId` to a family whose
  // BUILDER resolves one. For handrail / door / window the builder reads a raw colour and
  // never looks the id up, so writing it would put a dead field on the record while the
  // inspector's live mesh repaint implied it had applied. Surfaced via
  // `materialIdUnsupportedReason`, never silently written.
  if (input.materialId !== undefined && route.supportsMaterialId !== false) {
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

  // §FIX-COMMAND-REJECTION-SURFACED (Gate G7, P8) — a rejected command must SURFACE.
  //
  // This used to be a bare `.catch(console.error)`. That is precisely how `wall.setColor`
  // stayed broken for so long: it was rejected at `canExecute` (payload `{ wallId }` vs the
  // handler's required `{ id }`), the rejection was written to a console nobody reads, and
  // the inspector's live mesh repaint told the user it had worked. The command system said
  // NO and nobody heard it — the L-214 / L-218 / L-220 class.
  bus.executeCommand(route.command, payload)?.catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[MaterialDispatch] ${route.command} failed:`, e);
    emitToast(`Couldn't apply the material — ${msg}`, 'error');
  });
  return true;
}

/** Best-effort user-facing surface. Never throws (a failed toast must not mask the error). */
function emitToast(message: string, severity: 'info' | 'error'): void {
  try {
    (globalThis as { runtime?: { events?: { emit(t: string, p: unknown): void } } })
      .runtime?.events?.emit('pryzm:toast', { message, severity });
  } catch { /* toast bus optional */ }
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
