import type { PryzmRuntime } from '@pryzm/runtime-composer';
// §FEAT-RHINO-CHAT-MATERIAL — the THREE-touching material primitives live with
// the Rhino importer (the one legitimate owner of the imported scene graph);
// this file only orchestrates them behind the 'rhino.setMaterial' /
// 'rhino.resetMaterial' bus verbs and the commandManager undo stack.
import {
  applyRhinoColorOverride,
  restoreRhinoOriginalMaterials,
  snapshotRhinoMaterials,
  applyRhinoMaterialSnapshot,
} from '@pryzm/file-format';
import {
  UpdateRoofCommand,
  UpdateColumnCommand,
  UpdateBeamCommand,
  UpdateFloorCommand,
  // §FIX-FLOOR-TYPE-SWAP (L-106) — the floor branch of element.changeType runs this
  // legacy command on the legacy FloorStore (the store the 3D FloorTool + plan bridge
  // actually populate); the old 'floor.updateLayers' bus command read a DETACHED Immer
  // store → "floor not found" for FloorTool-created floors.
  UpdateFloorLayersCommand,
  UpdateCeilingCommand,
  // §FIX-CW-UPDATE-REACH-RECORD — the ONLY code in the repo that writes the geometry
  // `curtainWallStore` on an update. Its bridge was deleted by TASK-07 Phase A in favour
  // of a plugin `produceCommand` against a detached DTO store, which left it orphaned and
  // every curtain-wall move / property edit / material pick a silent no-op. Re-bridged.
  UpdateCurtainWallCommand,
  UpdateFurnitureParametersCommand,
  // §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — the uniform "change element type"
  // command surface routes per-family to these legacy commands (the only path
  // that reaches the mesh rebuild for EXISTING placed elements — see ADR-0105).
  ChangeFurnitureTypeCommand,
  UpdateWallSystemTypeCommand,
  // §FIX-HOSTED-TYPE-CHANGE (L-620) — the door/window branch of element.changeType.
  // ADR-0105 left the openings on the plugin-bus 'door.setType'/'window.setType'
  // handlers, which mutate the DETACHED plugin DTO store — the very defect it cured
  // for walls. These legacy commands own the geometry doorStore/windowStore that
  // DoorBuilder/WindowBuilder subscribe to. C15: id + host + void are preserved.
  UpdateDoorSystemTypeCommand,
  UpdateWindowSystemTypeCommand,
  // §FIX-CEILING-TYPE-SWAP (L-621) — authored in command-registry with ZERO call
  // sites until now; the panel was dispatching the detached plugin-bus handler.
  UpdateCeilingLayersCommand,
  // §FIX-PLUMBING-TYPE-SWAP (L-622) — the plumbing branch of element.changeType.
  // Contract 39 §3 already names this command as the variant-swap owner; only the
  // bus route was missing (the panel dispatched a verb whose payload never matched).
  UpdatePlumbingParametersCommand,
  MovePlumbingCommand,
  // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — the families element.changeType did NOT reach
  // (stair, column, beam, railing/handrail, roof, lighting). Each is routed to the legacy
  // command that owns the GEOMETRY store its fragment builder subscribes to, exactly as
  // walls/floors/slabs/ceilings already are (ADR-0105). UpdateColumnCommand /
  // UpdateBeamCommand / UpdateRoofCommand / UpdateHandrailCommand are already imported
  // above for their move/material bridges — only these two are new imports.
  UpdateStairParametersCommand,
  // §FIX-STAIR-RAILING-TYPE-PICKER — a STAIR's railing is not a standalone handrail:
  // different element type, different store, and until now no update command at all.
  UpdateStairRailingCommand,
  UpdateLightingParametersCommand,
  // §FIX-MOVE-SLAB-AND-HANDRAIL (Gate G7) — the two remaining "double lie" Move buttons
  // (enabled on BOTH surfaces, inert on BOTH). Both legacy commands own the GEOMETRY store
  // (window.slabStore / window.handrailStore) that the fragment builders, the 2-D plan
  // projector, the IFC exporter and persistence read; only the bus route was missing.
  UpdateSlabPolygonCommand,
  // §FIX-SLAB-TYPE-SWAP (mirrors §FIX-FLOOR-TYPE-SWAP L-106) — the slab branch of
  // element.changeType runs this legacy command on the legacy SlabStore (the store
  // the 3D SlabTool + plan bridge actually populate); the old 'slab.updateLayers'
  // plugin-bus command read a DETACHED Immer store → "slab not found" for
  // SlabTool-created slabs.
  UpdateSlabLayersCommand,
  UpdateHandrailCommand,
  // §FIX-MATERIAL-REACHES-RECORD (Gate G7) — the legacy commands that own the geometry
  // stores for the families whose Material control was still dead (slab / wall / door /
  // window / handrail). Each was verified END TO END before being routed here: the record
  // carries the field, the command writes it to the geometry store, and the BUILDER READS IT.
  UpdateSlabDimensionsCommand,
  // §FIX-DIMS-REACH-RECORD (ADR-0315 U1, L-815) — the dimension twins of the
  // material fix: the plugin wall/window/door dimension handlers wrote the
  // DETACHED plugin DTO stores, so chat AND the legacy inspector silently
  // no-oped. Same remedy, same-verb legacy bridges (plugin handlers retired
  // from registration — CommandBus.register throws on duplicates).
  UpdateWallDimensionsCommand,
  UpdateWallColorCommand,
  UpdateDoorFrameColorCommand,
  UpdateWindowFrameColorCommand,
  SetDoorOffsetCommand,
  SetWindowOffsetCommand,
  UpdateRoomBoundaryCommand,
  UpdateLevelCommand,
  AddLevelCommand,
  UpdateGridCommand,
  AddGridCommand,
  UpdateViewDefinitionCommand,
  SetViewCropCommand,
  HideElementInViewCommand,
  IsolateElementInViewCommand,
  SetGraphicOverrideCommand,
  ClearOverrideCommand,
  ClearAllOverridesCommand,
  // §P3.5-AN: CreateAnnotationCommand removed — annotation.create bridge retired;
  // registerAnnotationHandlers() in engineLauncher.ts registers the typed handler.
  // CreateFloorCommand removed — §P3.2-FL: floor.create now routes to CreateFloorHandler
  // via registerFloorHandlers() in engineLauncher.ts. initTools.ts §P3.2-FL bridge mirrors
  // to legacy FloorStore for FloorFragmentBuilder mesh rendering.
  // Phase 3 exit gate: grep 'CreateFloorCommand' initBusHandlers.ts → 0 matches.
  // CreateCurtainWallCommand removed — §P3.1-CW: curtain-wall.create now routes to
  // CreateCurtainWallHandler via registerCurtainWallHandlers() in engineLauncher.ts.
  CreateOpeningCommand,
  // §P3.5-LT: CreateLightingCommand removed — lighting.create bridge retired;
  // registerLightingHandlers() in engineLauncher.ts registers the typed handler.
  // §P3.5-PL: CreatePlumbingFixtureCommand removed — plumbing.create bridge retired;
  // registerPlumbingHandlers() in engineLauncher.ts registers the typed handler instead.
  // CreateRoofCommand removed — §P3.2-RF: roof.create now routes to CreateRoofHandler
  // via registerRoofHandlers() in engineLauncher.ts. initTools.ts §P3.2-RF bridge mirrors
  // to legacy RoofStore for RoofFragmentBuilder. Phase 3 exit gate: grep 'CreateRoofCommand' initBusHandlers.ts → 0 matches.
  // CreateSectionMarkCommand removed — §P3.4-SE: section.create now routes to CreateSectionHandler
  // via registerSectionHandlers() in engineLauncher.ts. Phase 3 exit gate: grep 'section.create' bridges → 0 entries.
  CreateStairCommand,
  MoveStairCommand,
  CreateElevationMarkCommand,
  // §FIX-SECTION-MARK-CREATE (G8, V1-audit §3.5) — the plan-view Section tool
  // and the 3D SectionMarkTool both need to mint a section ViewDefinition + a
  // navigable section-mark annotation. They previously fired 'section.create',
  // but that bus key is owned by CreateSectionHandler (plugin-section-view),
  // whose payload contract is { line:{a,b,lookDepth} } — so the tool's
  // { sectionViewId, cutPointA, cutPointB, … } payload was REJECTED by
  // canExecute and silently swallowed by the caller's .catch(). We restore the
  // mark-creation path under a DISTINCT key ('section.mark.create') routed to
  // CreateSectionMarkCommand — mirroring the elevation.create → CreateElevationMarkCommand
  // bridge below. The section.create geometry handler is left untouched.
  CreateSectionMarkCommand,
  AssignViewIntentCommand,
  CreateVisibilityIntentCommand,
  UpdateVisibilityIntentCommand,
  DeleteViewDefinitionCommand,
  CreateViewDefinitionCommand,
  AddViewportToSheetCommand,
  // §P2.3: CreateWallOpeningCommand removed — wall.opening.create is now handled
  //         by WallOpeningLegacyAdapterHandler registered via registerWallHandlers().
  SetDerivationCommand,
  UnassignTemplateCommand,
  AssignTemplateToNodeCommand,
  ClearPropertyDerivedCommand,
  MarkPropertyDerivedCommand,
  UpdateHierarchyNodeCommand,
  CreateSiteCommand,
  CreateBuildingCommand,
  CreateHierarchyLevelCommand,
  CreateUnitCommand,
  TakeLatestIntentVersionCommand,
  CreateViewTemplateCommand,
  UpdateViewTemplateCommand,
  DeleteViewTemplateCommand,
  MoveViewportCommand,
  GenerativeDesignApplyCommand,
  UpdateElementParameterCommand,
  // §FEAT-SCHEDULE-VIEW-EDIT (L-80) — the Schedule panel's EDIT mode dispatches
  // `schedule.update` (rename / add-remove column); this bridge routes it to the
  // legacy view command so the edit lands in the seeded `scheduleStore` and is
  // undoable on the commandManager stack (P6). Mirrors the AI dispatch site.
  UpdateScheduleCommand,
} from '@pryzm/command-registry';
import { withHandlerSpan, type Patch } from '@pryzm/plugin-sdk';
// §FEAT-PROJECT-ORIGIN (L-109) — the singleton shared-coordinate datum store.
import { projectOriginStore } from '@pryzm/stores';
// §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68) — build the ring-buffer PatchPair path
// for the furniture type-swap so the unified ring-first undo (performUndoRedo)
// reverses the SWAP rather than popping the element's earlier CREATE. C03 §4.5–4.8.
import { toJsonPointer } from '@pryzm/command-bus';
// §FIX-STAIR-RAILING-TYPE-PICKER — the ONE named railing catalogue (five built-ins),
// and the ONE projection from a catalogue definition onto a stair railing's
// construction fields. Both families now read the same catalogue.
import { handrailTypeStore } from '@pryzm/core-app-model';
import { resolveStairRailingTypeFields } from '@pryzm/geometry-stair';
// §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — the lighting fixture catalogue. Identity only;
// what a fixture EMITS stays in LIGHTING_FIXTURE_PHOTOMETRY.
import { getLightingTypeDefinition, type LightingFixtureType } from '@pryzm/geometry-lighting';
// §FEAT-ELEMENT-TYPE-AUTHORING (C65) — the per-family type-store adapters behind the
// `elementType.*` commands (wall + door + window today). Extracted so the adapters
// and their per-family draft validation are testable and shared, not closures here.
import {
    performElementTypeAuthoring,
    validateElementTypeCommand,
} from './elementTypeAuthoringAdapters';

/**
 * Registers structural command-bus stubs (§A40-W04 — column/beam/door/window/ceiling/stair).
 *
 * All authoritative element handlers (wall, slab, room, curtain-wall, level) are now
 * registered via registerXHandlers() calls in engineLauncher.ts (F-1.3).
 *
 * The five legacy commandManager bridge registrations that previously lived here
 * (room.redetect §P0-A39, curtain-wall.create-on-all-slabs §P2-A39,
 * wall.create-on-all-slabs §A40-W03, slab.create-on-all-floors §A40-W03,
 * level.duplicate-floor-plan) have been migrated to plugin-level bridge handlers:
 *   • room.redetect          → plugins/rooms/src/handlers/RedetectRooms.ts (CustomEvent bridge)
 *   • wall.create-on-all-slabs     → plugins/wall/src/handlers/CreateWallsOnAllSlabs.ts
 *   • slab.create-on-all-floors    → plugins/slab/src/handlers/CreateSlabsOnAllFloors.ts
 *   • curtain-wall.create-on-all-slabs → plugins/curtain-wall/src/handlers/CreateCurtainWallsOnAllSlabs.ts
 *   • level.duplicate-floor-plan   → plugins/levels/src/handlers/DuplicateFloorPlan.ts
 *
 * Anchor: docs/archive/pryzm3-internal/PRYZM3-FULL-AUDIT-2026-05-14.md §F-1.3
 */
export function initBusHandlers(
    runtime: PryzmRuntime | null,
): void {
    if (!runtime) return;

    // ── §A40-W04: column/beam/door/window/ceiling/stair structural batch handlers
    // These are structural stubs — they acknowledge the command type without
    // modifying any store.  Full Immer handlers land when the respective
    // plugin packages complete their store implementations (Wave 5+).
    // §P3.3-CO (IMPL-PLAN-2026-05-17): column.batch.create structural stub removed.
    // registerColumnHandlers() in engineLauncher.ts now registers the real CreateColumnBatchHandler.
    // The structural stub would conflict with the typed handler registration (silent catch at line 110).
    // Phase 3 exit gate: grep 'column.batch.create' __batchTypes initBusHandlers.ts → 0 entries.
    const __batchTypes: Array<{ type: string; stores: readonly string[] }> = [
        // §P3.3-BM (IMPL-PLAN-2026-05-17): beam.batch.create structural stub removed.
        // registerBeamHandlers() in engineLauncher.ts now registers the real CreateBeamBatchHandler.
        // Phase 3 exit gate: grep 'beam.batch.create' __batchTypes initBusHandlers.ts → 0 entries.
        // §P3.1-DO (IMPL-PLAN-2026-05-17): door.batch.create structural stub removed.
        // registerDoorHandlers() registers the real CreateDoorBatchHandler.
        // §P3.1-WI (IMPL-PLAN-2026-05-17): window.batch.create structural stub removed.
        // registerWindowHandlers() registers the real CreateWindowBatchHandler.
        // §P3.2-CL ceiling.batch.create structural stub removed (registerCeilingHandlers already registered CreateCeilingBatchHandler).
        { type: 'stair.batch.create',   stores: ['stair']   },  // DEFERRED: stairs migration pending
    ];
    for (const { type, stores } of __batchTypes) {
        // §OI-053 (PERF 2026-05-24) — skip if composeRuntime()/a plugin already
        // registered this type; CommandBus.register() throws on duplicate, which
        // was caught + logged as a red console.error per boot (noise + stack cost).
        if (runtime.bus.registry?.has?.(type as any)) continue;
        try {
            runtime.bus.register({
                type: type as any,
                affectedStores: stores as any,
                canExecute: () => ({ valid: true }),
                execute: async () => ({ patches: [], affectedStores: stores }),
            } as any);
            console.log(`[initBusHandlers] §A40-W04: ${type} registered (structural).`);
        } catch (_bte: any) {
            console.error(`[initBusHandlers] §A40-W04: ${type} failed (non-fatal):`, _bte?.message ?? _bte);
        }
    }

    // ── §FEAT-PROJECT-ORIGIN (L-109) — project-origin datum command surface ──────
    // The blue-sphere Project Base Point is repositioned (the shared-coordinate
    // datum, C19 §1.3 / ADR-0115) and toggled through the command bus (P6): UI /
    // AI express intent via runtime.bus.executeCommand('projectOrigin.setPosition'|
    // 'projectOrigin.setVisible', …). Each handler mutates the singleton
    // ProjectOriginStore; the marker follows via its store subscription (P4).
    //
    // P8: the bus emits a per-execution `pryzm.command.execute` span for every
    // command, and each handler additionally opens its own `pryzm.handler` span via
    // withHandlerSpan — so both new command functions carry ≥1 OTel span.
    const _projectOriginCmds: Array<{
        type: string;
        validate: (cmd: any) => string | null;
        run: (cmd: any) => void;
    }> = [
        {
            type: 'projectOrigin.setPosition',
            validate: (cmd: any) => {
                const p = cmd?.position;
                return p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
                    ? null
                    : 'position {x,y,z} (finite numbers) is required';
            },
            run: (cmd: any) => projectOriginStore.setPosition({
                x: Number(cmd.position.x), y: Number(cmd.position.y), z: Number(cmd.position.z),
            }),
        },
        {
            type: 'projectOrigin.setVisible',
            validate: (cmd: any) => (typeof cmd?.visible === 'boolean' ? null : 'visible (boolean) is required'),
            run: (cmd: any) => projectOriginStore.setVisible(cmd.visible === true),
        },
    ];
    for (const spec of _projectOriginCmds) {
        if (runtime.bus.registry?.has?.(spec.type as any)) continue;
        try {
            runtime.bus.register({
                type: spec.type as any,
                affectedStores: ['projectOrigin'] as any,
                canExecute: (cmd: any) => {
                    const err = spec.validate(cmd);
                    return err ? { valid: false, reason: err } : { valid: true };
                },
                execute: async (cmd: any) => withHandlerSpan(
                    `${spec.type}.handler`,
                    { 'pryzm.command.type': spec.type },
                    () => {
                        const err = spec.validate(cmd);
                        if (err) throw new Error(`[${spec.type}] ${err}`);
                        spec.run(cmd);
                        return { patches: [], affectedStores: ['projectOrigin'] };
                    },
                ),
            } as any);
            console.log(`[initBusHandlers] §FEAT-PROJECT-ORIGIN: ${spec.type} registered (P6).`);
        } catch (_poe: any) {
            console.error(`[initBusHandlers] §FEAT-PROJECT-ORIGIN: ${spec.type} failed (non-fatal):`, _poe?.message ?? _poe);
        }
    }

    // ── §E.5.x: element update bridge handlers ─────────────────────────────
    // These bridge handlers route bus commands to the legacy commandManager path.
    // Each follows the UpdateSlabPolygonHandler pattern in plugins/slab/src/handlers/.
    // TODO(F-1.4): replace with authoritative Immer store updates when plugin
    //              stores for these element types are fully implemented.

    // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — a bridge MAY additionally emit a
    // forward/inverse PatchPair so the mutation it bridges to commandManager is ALSO
    // recorded on the unified ring buffer (the stack performUndo() consults FIRST).
    // Without this, a bridge that returns empty patches is classified as an
    // EMPTY-PATCH record and SKIPPED the ring buffer — its commandManager-only entry
    // is then stranded on the independent cm cursor while the ring-buffer-first
    // performUndo() reverts some OTHER covered element instead ("element stays
    // moved"). Mirrors §FIX-WALL-MOVE-UNDO-CAPTURE (L-49) / plugins/wall UpdateWallBaseline.
    // `undoPatch` returns null when the caller did not opt in (`_recordUndo`) or lacks
    // the pre-move `_prev` snapshot → previous empty-patch behaviour is preserved.
    type BridgeSpec = {
      type: string;
      stores: readonly string[];
      fn: (cmd: any) => void;
      validate?: (cmd: any) => string | null;
      undoPatch?: (cmd: any) => { forward: Patch[]; inverse: Patch[] } | null;
    };

    // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — shared builder for the 3D-gizmo
    // move/rotate bridges (column/beam/floor). Produces store-relative JSON-Patch
    // (path[0] = element id, path[1] = field) for EVERY field in `next` that has a
    // matching pre-move value in `prev` — the exact shape elementUndoStoreAdapter
    // routes to `window.<x>Store.update(id, { field })` → the element's
    // `bim-<x>-updated` rebuild. One drag ⇒ one undoable step whose inverse restores
    // the pre-move pose and whose forward re-applies it. Returns null when nothing is
    // fully invertible so no half-undoable step is recorded.
    const _movePatchPair = (
      id: string | undefined,
      prev: Record<string, unknown> | undefined,
      next: Record<string, unknown> | undefined,
    ): { forward: Patch[]; inverse: Patch[] } | null => {
      if (!id || !prev || !next) return null;
      const forward: Patch[] = [];
      const inverse: Patch[] = [];
      for (const field of Object.keys(next)) {
        if (!(field in prev)) continue;               // no before value → cannot invert this field
        forward.push({ op: 'replace', path: [id, field], value: next[field] });
        inverse.push({ op: 'replace', path: [id, field], value: prev[field] });
      }
      return forward.length > 0 ? { forward, inverse } : null;
    };

    // ── §P1.4 (IMPL-PLAN-2026-05-17): _cmExec helper ───────────────────────
    // Replaces the bare `if (cm) cm.execute(...)` pattern that silently dropped
    // commands when commandManager was not yet initialised.  Every bridge fn:
    // body MUST use this helper instead of the bare pattern.
    //
    // §P1.2 BRIDGE METADATA RULE:
    // Bridge handlers that carry no special source context MUST call `_cmExec(cmd)`
    // without a second argument — the legacy commandManager default applies.
    // Handlers that need explicit source tagging for audit trails (viewTemplate.*
    // and sheet.moveViewport) MUST pass `{ source: 'HUMAN_DIRECT' }` (or a
    // cmd-derived source) explicitly as the second arg.  Do not mix the two
    // forms arbitrarily — if you are uncertain, omit the second arg.
    function _cmExec(cmd: unknown, meta?: unknown): void {
        const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
        if (cm) {
            cm.execute(cmd, meta);
            return;
        }
        console.error(
            '[initBusHandlers] §P1.4: commandManager not ready — command dropped:',
            (cmd as any)?.constructor?.name ?? 'unknown',
        );
    }

    // ── §FEAT-RHINO-CHAT-MATERIAL — Rhino reference-model recolour bridge ──────
    //
    // A legacy-shaped command (canExecute/execute/undo + affectedStores:[]) so
    // ONE chat recolour is ONE Ctrl+Z entry on the CommandManager stack — the
    // same stack that owns hosted-opening undo. `affectedStores` is empty: the
    // snapshot machinery has no 'rhino' store to clone, and undo re-applies the
    // per-mesh material snapshot captured in execute(). The Rhino groups come
    // off the import registry initUI publishes at `window.__pryzmRhinoImports`
    // (the same map the Import Manager bridge mutates on remove).
    class RhinoChatMaterialCommand {
        readonly affectedStores = [] as const;
        id = crypto.randomUUID();
        readonly type: string;
        timestamp = Date.now();
        targetIds: string[] = [];
        /** Meshes touched by the last execute() — the honest report count. */
        lastMeshCount = 0;
        private _snapshot: ReadonlyArray<readonly [object, unknown]> | null = null;
        constructor(
            private readonly groups: readonly object[],
            /** '#rrggbb' to override; null = restore the as-imported materials. */
            private readonly color: string | null,
        ) {
            this.type = color === null ? 'rhino.resetMaterial' : 'rhino.setMaterial';
        }
        canExecute(): { ok: boolean; reason?: string } {
            return this.groups.length > 0
                ? { ok: true }
                : { ok: false, reason: 'No Rhino model is imported — import a .3dm file first.' };
        }
        execute(): { success: boolean; affectedElementIds: string[]; info: string[] } {
            this._snapshot = snapshotRhinoMaterials(this.groups);
            const r = this.color === null
                ? restoreRhinoOriginalMaterials(this.groups)
                : applyRhinoColorOverride(this.groups, this.color);
            this.lastMeshCount = r.meshCount;
            console.log(`[§PERF-RHINO] ${this.type}: ${r.meshCount} meshes → ${this.color ?? 'original materials'} (one shared material while overridden)`);
            return { success: r.meshCount > 0, affectedElementIds: [], info: [`${r.meshCount} Rhino meshes updated`] };
        }
        undo(): { success: boolean; affectedElementIds: string[] } {
            if (this._snapshot === null) return { success: false, affectedElementIds: [] };
            applyRhinoMaterialSnapshot(this._snapshot);
            return { success: true, affectedElementIds: [] };
        }
        serialize(): unknown {
            return { type: this.type, targetIds: [], timestamp: this.timestamp, version: 1, payload: { color: this.color } };
        }
    }

    function _rhinoMaterialBridge(color: string | null): void {
        const groups = [...((window as unknown as {
            __pryzmRhinoImports?: Map<string, object>;
        }).__pryzmRhinoImports?.values() ?? [])];
        const say = (success: boolean, info: string[]): void => {
            window.dispatchEvent(new CustomEvent('pryzm-rhino-material-report', { detail: { success, info } }));
        };
        if (groups.length === 0) {
            say(false, ['no Rhino model is imported — import a .3dm file first']);
            return;
        }
        const cmdObj = new RhinoChatMaterialCommand(groups, color);
        _cmExec(cmdObj);
        const n = cmdObj.lastMeshCount;
        say(n > 0, [
            color === null
                ? `Restored the original materials on ${n} Rhino mesh${n === 1 ? '' : 'es'}`
                : `Painted ${n} Rhino mesh${n === 1 ? '' : 'es'} ${color}`,
        ]);
    }

    // ── §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — ring-buffer parity for a type swap ──
    //
    // Every `element.changeType` family runs its swap through the LEGACY commandManager
    // (the only path whose ctx.stores ARE the geometry stores the fragment builders read —
    // ADR-0105). commandManager records NO ring-buffer entry. But the unified undo
    // (performUndoRedo) is RING-BUFFER-FIRST, and `buildUndoStoreMap()` COVERS every one of
    // these stores (stair, column, beam, handrail, roof, lighting, plumbing, furniture,
    // floor, slab, ceiling). With no swap entry on the ring, the ring's top is still the
    // element's earlier CREATE — and §UNDO-CROSS-STACK-ORDER cannot rescue it, because the
    // legacy entry's `targetIds` INTERSECT the create's ids (same element), which that rule
    // reads as "same gesture, ring-first". So Ctrl+Z DELETES the element instead of
    // restoring its previous type. That is exactly the L-68 furniture bug, once per family.
    //
    // This helper is the SINGLE expression of the fix the furniture (L-68), floor (L-106),
    // slab and ceiling (L-621) branches each wrote out inline: snapshot the record before
    // and after, and push ONE invertible whole-element `replace` PatchPair on the SAME id.
    // applyRingBufferSide then routes the inverse through elementUndoStoreAdapter →
    // `window.<x>Store.update(id, oldData)` → the store's own change event → mesh rebuild.
    //
    // The `changed` guard is mandatory (C16): a rejected `canExecute` leaves the record
    // untouched, and a no-op PatchPair surfaces to the user as a phantom Ctrl+Z that
    // appears to do nothing. Deep equality on the whole snapshot is the strictest form of
    // that guard and needs no per-family version/signature knowledge.
    //
    // Not exported (module-local closure) — P8's "every NEW exported function adds ≥1 OTel
    // span" does not apply; the bus already opens `pryzm.command.execute` per dispatch.
    const _readRecord = (store: unknown, id: string): unknown => {
        const s = store as { getById?(id: string): unknown; get?(id: string): unknown } | undefined;
        try {
            if (typeof s?.getById === 'function') return s.getById(id);
            if (typeof s?.get === 'function')     return s.get(id);
        } catch (e) {
            console.warn('[element.changeType] store read failed:', e);
        }
        return undefined;
    };

    /**
     * Run a type swap through `run()` and mirror it onto the ring buffer as ONE
     * invertible whole-element replace on `id`, keyed by `storeKey` (which MUST be a key
     * `buildUndoStoreMap()` covers, or the ring entry is skipped at undo time and the
     * cursor is left where it was).
     */
    const _swapWithRingParity = (
        storeGlobalName: string,
        storeKey: string,
        id: string,
        run: () => void,
    ): void => {
        const store = (window as unknown as Record<string, unknown>)[storeGlobalName];
        const before  = _readRecord(store, id);
        const oldData = before ? structuredClone(before) : undefined;

        run();

        const after   = _readRecord(store, id);
        const newData = after ? structuredClone(after) : undefined;

        const changed = !!oldData && !!newData && JSON.stringify(oldData) !== JSON.stringify(newData);
        if (!changed) return;
        try {
            const rb = (window.runtime?.bus as unknown as { ringBuffer?: { push?(p: unknown): void } } | undefined)?.ringBuffer;
            const idPtr = toJsonPointer([id]);
            rb?.push?.({
                forward: { ops: [{ op: 'replace', path: idPtr, value: newData }] },
                inverse: { ops: [{ op: 'replace', path: idPtr, value: oldData }] },
                affectedStores: [storeKey],
            });
        } catch (e) {
            console.warn(`[element.changeType] ${storeKey} ring-buffer push failed (undo falls back to commandManager):`, e);
        }
    };

    // ── §FEAT-ELEMENT-TYPE-AUTHORING — the family adapters ───────────────────
    //
    // ONE adapter per authorable family, now living in
    // `elementTypeAuthoringAdapters.ts` (extracted when door + window joined wall:
    // the five different mutating vocabularies across the repo's type stores are
    // normalised there, once, and the per-family draft validation with them —
    // C65 §3.5 forbids family branches in shared code, and `draft.layers` checks
    // in a shared validator were exactly that).
    //
    // A family is added by adding an adapter there — and ONLY after its custom
    // types are proven to round-trip the snapshot (C05) and its store is
    // registered with `ProjectScopeRegistry` (C13). Those two proofs are recorded
    // in `ElementTypeAuthoringRegistry`; the adapter table and that registry must
    // agree, and the authoring coverage spec asserts it.

    /**
     * Performs the authoring mutation and records ONE undo entry for it.
     *
     * CA-11 — undo. A type store is not one of the ring-buffer-covered element stores
     * (`buildUndoStoreMap`), and a type is not an element, so the ring is the wrong
     * mechanism. The inverse is recorded on the CommandManager as an explicit
     * `Command`, which `performUndoRedo` already drains alongside the ring — the same
     * arrangement the stair and annotation families use.
     */
    const _authorElementType = (
        mode: 'create' | 'duplicate' | 'update' | 'delete',
        cmd: any,
    ): void => {
        const result = performElementTypeAuthoring(mode, cmd);
        if (!result) return;   // unreachable — validate() already rejected it.
        const { adapter, created, previous } = result;

        // CA-11 — the inverse, as one undo step.
        try {
            const inverse = {
                type: 'ELEMENT_TYPE_AUTHORING' as any,
                affectedStores: [] as any[],
                canExecute: () => ({ ok: true }),
                execute:    () => ({ success: true, affectedElementIds: [] }),
                undo: () => {
                    if (mode === 'delete' || mode === 'update') {
                        if (!previous) return;
                        // `restore` keeps the ORIGINAL id (§M-B1), so restoring a deleted
                        // or pre-edit type restores the SAME id — every element still
                        // pointing at it resolves again instead of dangling.
                        if (mode === 'delete') adapter.restore(previous);
                        else adapter.update(cmd.typeId, previous);
                    } else if (created) {
                        adapter.remove(created.id);
                    }
                    _emitElementTypeChanged(cmd.family);
                },
                serialize: () => ({
                    type: 'ELEMENT_TYPE_AUTHORING',
                    payload: { mode, family: cmd.family, typeId: cmd.typeId ?? created?.id },
                    targetIds: [], timestamp: Date.now(), version: 1,
                }),
            };
            _cmExec(inverse);
        } catch (e) {
            console.warn('[elementType] undo registration failed:', e);
        }

        _emitElementTypeChanged(cmd.family, created?.id ?? cmd.typeId);
    };

    /**
     * Tells every open picker that the family's catalogue changed.
     *
     * This is the event whose ABSENCE forced the old prompt flow to `alert()` the user
     * to "re-select the wall to see it in the list": the widget had written to the
     * store and had no way to say so.
     */
    const _emitElementTypeChanged = (family: unknown, typeId?: string): void => {
        try {
            window.runtime?.events?.emit?.('elementType.changed', { family, typeId } as any);
        } catch { /* the picker also refreshes on next open; a failed notify is not fatal */ }
    };

    const __bridges: BridgeSpec[] = [
        // ── existing element update bridges (E.5.1–E.5.3) ──────────────────
        {
            type: 'roof.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new UpdateRoofCommand(cmd.id, cmd.updates)); },
        },
        {
            // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — 3D-gizmo column move/rotate is now
            // recorded on the ring buffer (declare the `column` store + emit a
            // forward/inverse PatchPair when the drag-end opts in via `_recordUndo`
            // and supplies `_prev`). The commandManager bridge still does the
            // authoritative store mutation + mesh rebuild at execute time.
            type: 'column.update',
            stores: ['column'] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new UpdateColumnCommand({ id: cmd.id, updates: cmd.updates })); },
            undoPatch: (cmd) => (cmd._recordUndo ? _movePatchPair(cmd.id, cmd._prev, cmd.updates) : null),
        },
        {
            // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — 3D-gizmo beam move ring-captured.
            type: 'beam.update',
            stores: ['beam'] as const,
            validate: (cmd) => (!cmd.beamId ? 'beamId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateBeamCommand({ beamId: cmd.beamId, updates: cmd.updates })); },
            undoPatch: (cmd) => (cmd._recordUndo ? _movePatchPair(cmd.beamId, cmd._prev, cmd.updates) : null),
        },
        {
            // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — 3D-gizmo floor move ring-captured.
            type: 'floor.update',
            stores: ['floor'] as const,
            validate: (cmd) => (!cmd.floorId ? 'floorId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateFloorCommand({ floorId: cmd.floorId, updates: cmd.updates })); },
            undoPatch: (cmd) => (cmd._recordUndo ? _movePatchPair(cmd.floorId, cmd._prev, cmd.updates) : null),
        },
        {
            type: 'ceiling.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.ceilingId ? 'ceilingId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateCeilingCommand({ ceilingId: cmd.ceilingId, updates: cmd.updates })); },
        },
        {
            // §FIX-CW-UPDATE-REACH-RECORD — the curtain-wall sibling of
            // §FIX-ROOF-UPDATE-REACH-RECORD (L-839) and §FIX-CEILING-UPDATE-REACH-RECORD,
            // and the WORST of the three: roof and ceiling each had this bridge sitting
            // unregistered behind a plugin handler, but `wall.updateCurtainWall` had NO
            // bridge at all. TASK-07 Phase A DELETED it ("Replaced F-1.3 commandManager
            // bridge with authoritative Immer produceCommand"), leaving
            // `UpdateCurtainWallCommand` — the only writer of the geometry
            // `curtainWallStore` on an update — reachable from nothing but
            // `CommandRegistry.ts` deserialization.
            //
            // FOUR live dispatchers were therefore silent no-ops: the 3-D gizmo drag-end
            // (`registerTransformDragHandler.ts:435`), the plan Move tool
            // (`elementMove.ts:303`), the property sheet
            // (`PropertyInspectorApply.ts:225,467,575`) and the Material control
            // (`MaterialDispatch.ts:115`) — the last of which `SetCurtainWallMaterial.ts`
            // explicitly redirects users to on the claim that it "reaches the geometry
            // record the builders read".
            //
            // ROUTE. Same-verb bridge + retirement of the plugin handler, i.e. route (c),
            // NOT the L-220 distinct-verb pattern used for `slab.movePolygon` /
            // `handrail.moveBaseLine`. That pattern exists for verbs a plugin handler
            // must keep claiming; here the plugin handler writes ONLY the detached store,
            // so the name is free. A distinct move-only verb would have fixed the two
            // move surfaces and left the property sheet and the Material control dead —
            // and would have added a SHADOWED row to the verb register, since the plugin
            // declaration would have stayed. `wall.updateCurtainWall` keeps exactly one
            // declaring site; it has simply moved from the plugin to here.
            //
            // `stores: []` is deliberate and matches `roof.update` / `ceiling.update`:
            // undo belongs to the legacy commandManager stack, where
            // `UpdateCurtainWallCommand.undo()` restores the full pre-mutation snapshot
            // via `store.set()` (§01 §2.2) and reverses the §DW-03 spatial
            // re-registration. Declaring a ring-buffer store here would be a C03 §4.6
            // U-2b violation — the write goes to the geometry store, not to any bus store.
            type: 'wall.updateCurtainWall',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new UpdateCurtainWallCommand({ id: cmd.id, updates: cmd.updates })); },
        },
        {
            // §FEAT-SCHEDULE-VIEW-EDIT (L-80) — Schedule panel EDIT mode. The
            // definition edit (rename / column membership) is routed to the legacy
            // UpdateScheduleCommand, which mutates the seeded `scheduleStore` and
            // registers its own inverse on the commandManager undo stack. `stores: []`
            // — commandManager owns undo for these view commands (matches roof.update /
            // ceiling.update). Payload: { scheduleId, patch: { name?, fields? } }.
            type: 'schedule.update',
            stores: [] as const,
            validate: (cmd) => {
                if (!cmd.scheduleId) return 'scheduleId is required';
                if (!cmd.patch || typeof cmd.patch !== 'object') return 'patch is required';
                if (Object.keys(cmd.patch).length === 0) return 'patch must not be empty';
                return null;
            },
            fn: (cmd) => { _cmExec(new UpdateScheduleCommand(cmd.scheduleId, cmd.patch)); },
        },
        {
            type: 'furniture.updateParameters',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => {
                const { id, ...rest } = cmd;
                _cmExec(new UpdateFurnitureParametersCommand({ id, ...rest }));
            },
        },
        {
            // §FURNITURE-UPDATE-REPLAY (founder 2026-06-19) — RemoteCommandDispatcher
            // dispatches the COMMAND TYPE ('UPDATE_FURNITURE_PARAMETERS') as the bus key
            // on collaboration catch-up/replay, but the authoring handler above is keyed
            // 'furniture.updateParameters'. Without a handler under the CommandType key the
            // replayed move/rotate no-ops and the furniture reverts to its created pose
            // ("sofa rotates back to origin after I move it"). Same fn, CommandType key.
            type: 'UPDATE_FURNITURE_PARAMETERS',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => {
                const { id, ...rest } = cmd;
                _cmExec(new UpdateFurnitureParametersCommand({ id, ...rest }));
            },
        },
        {
            // §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — collaboration replay key.
            // RemoteCommandDispatcher dispatches the COMMAND TYPE as the bus key on
            // catch-up/reconnect; without a handler under 'CHANGE_FURNITURE_TYPE' the
            // replayed swap no-ops and the furniture reverts to its prior type on every
            // remote peer (same class as §FURNITURE-UPDATE-REPLAY). Same fn, CommandType key.
            type: 'CHANGE_FURNITURE_TYPE',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : (!cmd.newFurnitureType ? 'newFurnitureType is required' : null)),
            fn: (cmd) => { _cmExec(new ChangeFurnitureTypeCommand(cmd)); },
        },
        {
            // §ELEMENT-SEMANTIC-AUDIT S4 (2026-06-20) — plumbing gizmo-move authoring
            // bridge. registerTransformDragHandler dispatches 'plumbing.moveFixture'
            // { id, to } on drag-end; this routes it through commandManager
            // (MovePlumbingCommand → geometry window.plumbingStore → bim-plumbing-updated
            // → 3D fragment rebuild + 2D plan re-projection). Mirrors the WORKING
            // furniture.updateParameters bridge.
            //
            // §FIX-TRANSFORM-DRAG-PAYLOAD-AUDIT (L-220) — the type was previously
            // 'plumbing.move', but the plugin `MovePlumbingHandler` (from
            // registerPlumbingHandlers, registered first) also claims 'plumbing.move'
            // and SHADOWED this bridge (the `registry.has()` skip below). That plugin
            // handler (a) wants a different payload ({ plumbingId, delta }) — so the
            // drag's { id, to } was rejected at canExecute, the founder's error — and
            // (b) mutates a DETACHED plugin DTO store (a SEPARATE PlumbingStore instance
            // from the geometry store the plan/builder read, with no move-bridge to it),
            // so even a correct payload could never update the 2D plan. Giving the
            // legacy bridge a DISTINCT type ('plumbing.moveFixture') un-shadows it: the
            // drag now reaches the proven geometry path, and the typed plugin handler is
            // left intact for a future plugin-store-authoritative migration.
            type: 'plumbing.moveFixture',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : (!cmd.to ? 'to is required' : null)),
            fn: (cmd) => { _cmExec(new MovePlumbingCommand({ id: cmd.id, to: cmd.to })); },
        },

        // ── §FIX-MOVE-SLAB-AND-HANDRAIL (Gate G7) — the last two lying Move buttons ──
        //
        // Both slab and handrail/railing were DOUBLE LIES: the Move button was
        // capability-gated ON in BOTH the 3-D gizmo and the Plan View Move tool, and
        // committed nothing on EITHER. Both are closed here with the L-220
        // `plumbing.moveFixture` pattern — a DISTINCT bus type that the plugin handler
        // cannot shadow, bridged to the legacy command that owns the GEOMETRY store.
        //
        // MEASURED AT THE RECORD, not at the dispatch (the whole point of G7):
        //   slab      polygon → UpdateSlabPolygonCommand → ctx.stores.slabStore.update()
        //             → `bim-slab-updated` → SlabFragmentBuilder rebuild + plan + persist.
        //             `slab.updatePolygon` and `slab.update` are BOTH claimed by plugin
        //             handlers that `produceCommand` against the DETACHED plugin DTO store
        //             (`ctx.stores.slab` — a fresh `new SlabStore()` from PluginRegistry),
        //             which nothing in production reads and no committer bridges back. So
        //             the type here MUST be a name they do not own: `slab.movePolygon`.
        //   handrail  baseLine → UpdateHandrailCommand → ctx.stores.handrailStore.update()
        //             → HandrailFragmentBuilder. The 3-D gizmo used to REFUSE this drag
        //             ("handrail geometry is defined by path points — use the Plan View
        //             move tool") and the plan tool never implemented it. The claim was
        //             also FALSE: `HandrailData.baseLine: [Point3D, Point3D]` is a line.
        //
        // Both opt into the ring-buffer undo timeline (L-72) so ONE gesture = ONE undo
        // entry (C16) on BOTH surfaces — the plan tool and the 3-D gizmo send the same
        // payload, built by the single `elementMove.ts` definition.
        {
            type: 'slab.movePolygon',
            stores: ['slab'] as const,
            validate: (cmd) => (
                !cmd.slabId                                   ? 'slabId is required' :
                !Array.isArray(cmd.polygon) || cmd.polygon.length < 3
                    ? 'polygon must have at least 3 points'   :
                null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateSlabPolygonCommand({
                    slabId:  cmd.slabId,
                    polygon: cmd.polygon,
                    // Omit `holes` entirely when the mover sent none — the command PRESERVES
                    // the slab's existing holes on omission, but would REPLACE them with []
                    // if we passed an empty array (silently deleting every opening).
                    ...(cmd.holes !== undefined ? { holes: cmd.holes } : {}),
                }));
            },
            undoPatch: (cmd) => (cmd._recordUndo
                ? _movePatchPair(cmd.slabId, cmd._prev, {
                    polygon: cmd.polygon,
                    ...(cmd.holes !== undefined ? { holes: cmd.holes } : {}),
                })
                : null),
        },
        {
            type: 'handrail.moveBaseLine',
            stores: ['handrail'] as const,
            validate: (cmd) => (
                !cmd.id                                              ? 'id is required' :
                !Array.isArray(cmd.baseLine) || cmd.baseLine.length !== 2
                    ? 'baseLine must be exactly two {x,y,z} points'  :
                null
            ),
            fn: (cmd) => { _cmExec(new UpdateHandrailCommand({ id: cmd.id, baseLine: cmd.baseLine })); },
            undoPatch: (cmd) => (cmd._recordUndo
                ? _movePatchPair(cmd.id, cmd._prev, { baseLine: cmd.baseLine })
                : null),
        },

        // ── §FIX-MATERIAL-REACHES-RECORD (Gate G7) — the Material control, ON THE RECORD ──
        //
        // §FIX-MATERIAL-DEAD-DISPATCH established the root cause: every `<family>.setMaterial`
        // command is handled by a plugin handler that `produceCommand`s against the plugin's
        // DTO store — a FRESH `new SlabStore()` / `new WallStore()` built by PluginRegistry,
        // NOT the geometry store the fragment builders, the 2-D plan projector, the IFC
        // exporter and persistence read. Nothing bridges plugin-store UPDATES back (initTools
        // mirrors `<family>.created` ONLY; composeRuntime registers ZERO committers). And the
        // property inspector repainted the THREE mesh live — so the founder picked a material,
        // SAW IT CHANGE, saved, reloaded, and it was gone. UI vs RECORD: strictly worse than
        // the eight PLAN-vs-3D instances, because the feedback loop tells you it worked.
        //
        // That fix routed column/ceiling/floor/roof/curtain-wall/furniture to their legacy
        // `<family>.update` bridges. These five close the REST — each verified END TO END
        // (the record carries the field → the command writes the GEOMETRY store → the BUILDER
        // READS IT), each under a DISTINCT type the plugin handler cannot shadow:
        //
        //   wall.updateColor      → UpdateWallColorCommand      → wallStore.updateWall()
        //        WallFragmentBuilder reads `materialId` (library lookup) + `materialColor`.
        //        NOT `wall.setColor`: the plugin SetWallColor handler claims it, wants { id }
        //        while the panel sent { wallId } → REJECTED at canExecute → swallowed by a
        //        `.catch(console.error)`. The command system said no and nobody heard it.
        //   slab.updateDimensions → UpdateSlabDimensionsCommand → slabStore.update()
        //        SlabFragmentBuilder reads `data.materialId` + `data.materialColor`.
        //        (UpdateSlabCommand THROWS on these fields by design — UpdateSlabDimensions
        //        is the command that owns them.) NOT `slab.setMaterial`/`slab.update`.
        //   door.setFrameColor    → UpdateDoorFrameColorCommand → wallStore.updateDoor()
        //   window.setFrameColor  → UpdateWindowFrameColorCommand → wallStore.updateWindow()
        //        NO HANDLER EXISTED FOR EITHER, anywhere on the bus, though the panel has
        //        always dispatched them. Both legacy commands write BOTH stores the builders
        //        read (the wall's opening render-map AND the door/window store). The panel's
        //        existing payload keys are already correct — no rename needed.
        //   handrail.updateColor  → UpdateHandrailCommand       → handrailStore.update()
        //        HandrailFragmentBuilder reads `materialColor`. It does NOT read
        //        `materialId` — so MaterialDispatch does not SEND one for handrails and
        //        DECLARES that gap instead of writing a field nothing renders.
        {
            type: 'wall.updateColor',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.wallId ? 'wallId is required' :
                (cmd.materialColor === undefined && cmd.materialId === undefined)
                    ? 'materialColor or materialId is required' :
                null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateWallColorCommand({
                    wallId:        cmd.wallId,
                    materialColor: cmd.materialColor,
                    materialId:    cmd.materialId,
                }));
            },
        },
        {
            type: 'slab.updateDimensions',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.slabId ? 'slabId is required' :
                (cmd.width === undefined && cmd.depth === undefined && cmd.thickness === undefined &&
                 cmd.materialColor === undefined && cmd.materialId === undefined)
                    ? 'at least one of width/depth/thickness/materialColor/materialId is required' :
                null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateSlabDimensionsCommand({
                    slabId:        cmd.slabId,
                    width:         cmd.width,
                    depth:         cmd.depth,
                    thickness:     cmd.thickness,
                    materialColor: cmd.materialColor,
                    materialId:    cmd.materialId,
                }));
            },
        },
        {
            // §FEAT-RHINO-CHAT-MATERIAL — "change all elements of the rhino
            // model to white" (ZeroTokenResolver 'set-rhino-material').
            //
            // The imported Rhino model is REFERENCE content: THREE meshes in a
            // tagged scene group (userData.isRhinoImport), NOT elements in any
            // geometry store — so there is no per-element command family to
            // bridge to. Instead the whole model is recoloured with ONE shared
            // override material (a §PERF-RHINO dedup win while overridden) as
            // ONE undoable commandManager entry (`stores: []` — like the
            // hosted openings, undo lives on the CommandManager stack; the
            // ring buffer has no 'rhino' store to route patches into).
            //
            // Honesty (§CONTEXT-DATA-HONESTY): the resolver cannot know
            // whether a model is imported, so the bridge reports through
            // 'pryzm-rhino-material-report' — which ZeroTokenChatBridge's
            // BATCH_REPORT_EVENTS table renders VERBATIM, including
            // "No Rhino model is imported".
            type: 'rhino.setMaterial',
            stores: [] as const,
            validate: (cmd) => (
                typeof cmd.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(cmd.color)
                    ? "color ('#rrggbb') is required — colour names are resolved by the chat layer (colorRef.ts)"
                    : null
            ),
            fn: (cmd) => { _rhinoMaterialBridge(String(cmd.color).toLowerCase()); },
        },
        {
            // §FEAT-RHINO-CHAT-MATERIAL — "reset the rhino model materials":
            // restores the as-imported (deduped) materials stashed on each
            // mesh at import time. Same undo/report machinery as above.
            type: 'rhino.resetMaterial',
            stores: [] as const,
            fn: () => { _rhinoMaterialBridge(null); },
        },
        {
            // §FIX-DIMS-REACH-RECORD (ADR-0315 U1, L-815) — wall.updateDimensions
            // was owned by a PLUGIN handler that produceCommand'd the detached
            // plugin wall store: chat and the legacy inspector dispatched it,
            // the bus reported success, and NOTHING rendered or persisted.
            // Worse, buildUndoStoreMap routes 'wall' ring patches into the
            // GEOMETRY store, so Ctrl+Z could apply an inverse for a forward
            // write geometry never saw. The plugin handler is retired from
            // registration; this same-verb bridge runs the legacy
            // UpdateWallDimensionsCommand against the geometry wallStore and
            // pushes a real before/after ring pair (the §FIX-FURNITURE-TYPE-
            // LIST-AND-UNDO ceiling pattern), so ring-first undo is correct.
            // The legacy command REQUIRES both height and thickness — the
            // bridge fills the missing one from the current wall record.
            type: 'wall.updateDimensions',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.wallId ? 'wallId is required' :
                (cmd.height === undefined && cmd.thickness === undefined)
                    ? 'at least one of height / thickness is required' :
                null
            ),
            fn: (cmd) => {
                const wstore = (window as unknown as {
                    wallStore?: { getById?(id: string): { height?: number; thickness?: number } | undefined };
                }).wallStore;
                const current = wstore?.getById?.(cmd.wallId);
                if (!current) {
                    console.warn(`[wall.updateDimensions] wall not found in geometry store: ${cmd.wallId}`);
                    return;
                }
                const before = structuredClone(current);
                _cmExec(new UpdateWallDimensionsCommand({
                    wallId:    cmd.wallId,
                    height:    cmd.height    ?? current.height    ?? 3,
                    thickness: cmd.thickness ?? current.thickness ?? 0.2,
                }));
                const after = wstore?.getById?.(cmd.wallId);
                // Ring parity: 'wall' IS ring-covered (buildUndoStoreMap), so
                // without a pair a ring-first Ctrl+Z would pop the wall's
                // earlier CREATE. Push only on a real change.
                if (after && JSON.stringify({ h: before.height, t: before.thickness })
                          !== JSON.stringify({ h: after.height, t: after.thickness })) {
                    try {
                        const rb = (window.runtime?.bus as unknown as { ringBuffer?: { push?(p: unknown): void } } | undefined)?.ringBuffer;
                        const idPtr = toJsonPointer([cmd.wallId]);
                        rb?.push?.({
                            forward: { ops: [{ op: 'replace', path: idPtr, value: structuredClone(after) }] },
                            inverse: { ops: [{ op: 'replace', path: idPtr, value: before }] },
                            affectedStores: ['wall'],
                            timestamp: Date.now(),
                        });
                    } catch (e) {
                        console.warn('[wall.updateDimensions] ring-buffer push failed (undo falls back to commandManager):', e);
                    }
                }
            },
        },
        {
            // §FIX-DIMS-REACH-RECORD — the opening-dimension twins. The plugin
            // window/door size/sill handlers wrote detached plugin stores; the
            // LIVE route is the generic parameter command (openings resolve to
            // the wallStore and rebuild the host — production-proven by the
            // compound-dimensions founder repro). stores: [] — hosted-opening
            // undo lives on the CommandManager stack by design
            // (buildUndoStoreMap deliberately omits door/window).
            type: 'window.setSize',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.windowId ? 'windowId is required' :
                (cmd.width === undefined && cmd.height === undefined)
                    ? 'at least one of width / height is required' : null
            ),
            fn: (cmd) => {
                const parameters: Record<string, number> = {};
                if (cmd.width !== undefined) parameters['width'] = cmd.width;
                if (cmd.height !== undefined) parameters['height'] = cmd.height;
                _cmExec(new UpdateElementParameterCommand({ elementId: cmd.windowId, elementType: 'window', parameters }));
            },
        },
        {
            type: 'window.setSillHeight',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.windowId ? 'windowId is required' :
                cmd.sillHeight === undefined ? 'sillHeight is required' : null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateElementParameterCommand({
                    elementId: cmd.windowId, elementType: 'window', parameters: { sillHeight: cmd.sillHeight },
                }));
            },
        },
        {
            type: 'door.setWidth',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.doorId ? 'doorId is required' :
                cmd.width === undefined ? 'width is required' : null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateElementParameterCommand({
                    elementId: cmd.doorId, elementType: 'door', parameters: { width: cmd.width },
                }));
            },
        },
        {
            type: 'door.setHeight',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.doorId ? 'doorId is required' :
                cmd.height === undefined ? 'height is required' : null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateElementParameterCommand({
                    elementId: cmd.doorId, elementType: 'door', parameters: { height: cmd.height },
                }));
            },
        },
        {
            type: 'door.setSillHeight',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.doorId ? 'doorId is required' :
                cmd.sillHeight === undefined ? 'sillHeight is required' : null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateElementParameterCommand({
                    elementId: cmd.doorId, elementType: 'door', parameters: { sillHeight: cmd.sillHeight },
                }));
            },
        },
        {
            type: 'door.setFrameColor',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.doorId     ? 'doorId is required'     :
                !cmd.frameColor ? 'frameColor is required' :
                null
            ),
            fn: (cmd) => { _cmExec(new UpdateDoorFrameColorCommand(cmd.doorId, cmd.frameColor)); },
        },
        {
            type: 'window.setFrameColor',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.windowId   ? 'windowId is required'   :
                !cmd.frameColor ? 'frameColor is required' :
                null
            ),
            fn: (cmd) => { _cmExec(new UpdateWindowFrameColorCommand(cmd.windowId, cmd.frameColor)); },
        },
        {
            type: 'handrail.updateColor',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.id            ? 'id is required'            :
                !cmd.materialColor ? 'materialColor is required' :
                null
            ),
            fn: (cmd) => { _cmExec(new UpdateHandrailCommand({ id: cmd.id, materialColor: cmd.materialColor })); },
        },

        // ── §FEAT-ELEMENT-TYPE-AUTHORING — create / duplicate / edit a TYPE ──────
        //
        // The uniform TYPE-AUTHORING surface, sibling to `element.changeType` below:
        // that command changes which type an ELEMENT uses; these three change the set
        // of types the PROJECT offers.
        //
        // ROOT CAUSE THIS REPLACES. Wall-type creation lived entirely in the property
        // panel widget (`WallTypeSelectorWidget._handleNewType` / `_handleDuplicate`):
        // two `window.prompt()` calls followed by a DIRECT `typeStore.add(...)` from
        // UI code. That is a P6 violation with three visible consequences —
        //   • no undo (the type could not be taken back),
        //   • unreachable by the AI plane and by collaboration replay (C03 §2.4),
        //   • no post-write notification, which is why the widget had to `alert()`
        //     the user to "re-select the wall to see it in the list".
        // Routing through the bus fixes all three at once, and the `elementType.changed`
        // event is what lets any open picker refresh itself.
        //
        // FAMILY DISPATCH IS DECLARED, NOT INFERRED. Only families listed in
        // `ElementTypeAuthoringRegistry` may be authored, and the UI offers no
        // "New type…" entry for the rest. A family reaching here undeclared is a
        // programming error and fails loudly rather than writing into a store whose
        // contents are not saved with the project (stair / lift / room today).
        //
        // C16 §3 row "Semantic / non-geometry": a type has no geometry and no level, so
        // CA-4 / CA-6 / CA-7 / CA-9 (level resolution, BimManager, ViewDependencyTracker,
        // frame-deferred build) do not apply. CA-3 (validate before mutate), CA-8 (store
        // mutation emits storeEventBus — the store's own `add`/`update`/`remove` do),
        // CA-11 (undo) and CA-15 (serialisable payload) do, and are honoured here.
        {
            type: 'elementType.create',
            stores: [] as const,
            validate: (cmd: any) => validateElementTypeCommand(cmd, 'create'),
            fn: (cmd: any) => { _authorElementType('create', cmd); },
        },
        {
            type: 'elementType.duplicate',
            stores: [] as const,
            validate: (cmd: any) => validateElementTypeCommand(cmd, 'duplicate'),
            fn: (cmd: any) => { _authorElementType('duplicate', cmd); },
        },
        {
            type: 'elementType.update',
            stores: [] as const,
            validate: (cmd: any) => validateElementTypeCommand(cmd, 'update'),
            fn: (cmd: any) => { _authorElementType('update', cmd); },
        },
        {
            type: 'elementType.delete',
            stores: [] as const,
            validate: (cmd: any) => validateElementTypeCommand(cmd, 'delete'),
            fn: (cmd: any) => { _authorElementType('delete', cmd); },
        },

        // ── §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — uniform "change element type" ──
        // ONE bus command that swaps a PLACED element's type/asset IN PLACE
        // (preserving id + transform + host), routed per-family to the command that
        // actually reaches the 3D mesh rebuild for EXISTING elements. Root cause the
        // founder hit: the clean plugin-bus type handlers (wall.setSystemType /
        // door.setType) mutate a DETACHED DTO store with no bridge to the legacy
        // geometry store that drives the builders — so an existing element's mesh
        // never rebuilds. This handler instead uses the legacy commandManager
        // (whose ctx.stores ARE the geometry stores), the proven working path.
        //
        // Payload: { elementId, elementType, newTypeId, transform-preserving extras }.
        //   wall              → UpdateWallSystemTypeCommand (legacy geometry store → rebuild)
        //   furniture         → ChangeFurnitureTypeCommand (store.update → bim-furniture-updated → rebuild)
        //   door / window     → the existing door.setType / window.setType bus command
        //                       (updates the opening's system type) + an explicit
        //                       host-wall rebuild via window.__wallRebuildControl so the
        //                       opening re-renders with the new type's finish — reuses
        //                       proven machinery, no new geometry edits (C11).
        // Each underlying command implements undo(); the whole swap is one undo step.
        {
            type: 'element.changeType',
            stores: [] as const,
            validate: (cmd: any) => {
                if (!cmd.elementId)   return 'elementId is required';
                if (!cmd.elementType) return 'elementType is required';
                // The LAYER-STACK families express "plain / no type" as an EMPTY
                // newTypeId — the "— Plain Wall —" detach, and its floor / slab /
                // ceiling equivalents, which carry the assembly in `layers` instead.
                // Every other family (door, window, furniture) must name a concrete
                // target type. Rejecting '' for floor/slab/ceiling would have made the
                // detach path unreachable the moment those widgets were wired here.
                const el = String(cmd.elementType).toLowerCase();
                const layerStackFamily = el === 'wall' || el === 'floor' || el === 'slab' || el === 'ceiling';
                if (!layerStackFamily && !cmd.newTypeId) return 'newTypeId is required';
                return null;
            },
            fn: (cmd: any) => {
                const elType = String(cmd.elementType).toLowerCase();
                if (elType === 'wall') {
                    // UpdateWallSystemTypeCommand resolves layers/thickness from the
                    // caller (the UI passes them) or leaves them for the command to
                    // read; either way it writes the geometry store → WallRebuildCoordinator.
                    // Empty newTypeId → detach (systemTypeId null / plain wall).
                    _cmExec(new UpdateWallSystemTypeCommand({
                        wallId:       cmd.elementId,
                        systemTypeId: cmd.newTypeId || null,
                        layers:       (cmd.layers ?? null) as any,
                        thickness:    cmd.thickness,
                    }));
                    return;
                }
                if (elType === 'furniture') {
                    // §FIX-FURNITURE-TYPE-LIST-AND-UNDO (L-68). ChangeFurnitureTypeCommand
                    // mutates the furniture IN PLACE (stable id) → FurnitureStore.update →
                    // `bim-furniture-updated` → mesh rebuild (ADR-0105). But it runs through
                    // the LEGACY CommandManager, which records NO ring-buffer entry. The
                    // unified undo (performUndoRedo) is RING-BUFFER-FIRST: with no swap
                    // entry on the ring, the ring's TOP is still the element's earlier
                    // CREATE, so Ctrl+Z pops the CREATE (deletes the bed) and shadow-drops
                    // the cm swap twin — the original type is never restored (the founder's
                    // "undo does NOT restore the bed" + "skip remove — not found" log).
                    //
                    // Fix: snapshot the record before/after and push an invertible
                    // WHOLE-ELEMENT replace PatchPair on the SAME id onto the ring buffer.
                    // Now the ring-first undo reverses THE SWAP: applyRingBufferSide routes
                    // the inverse replace through elementUndoStoreAdapter →
                    // furnitureStore.update(id, oldData) → mesh rebuild → the original bed
                    // type is restored on the same element; redo re-applies newData. The id
                    // is stable throughout, so the inverse never references a phantom id.
                    const fstore = (window as unknown as { furnitureStore?: { get?(id: string): unknown } }).furnitureStore;
                    const before = fstore?.get?.(cmd.elementId);
                    const oldData = before ? structuredClone(before) : undefined;

                    _cmExec(new ChangeFurnitureTypeCommand({
                        id:                    cmd.elementId,
                        newFurnitureType:      cmd.newTypeId,
                        newFurnitureCategory:  cmd.furnitureCategory,
                        newWidth:              cmd.width,
                        newLength:             cmd.length,
                        newHeight:             cmd.height,
                        newBaseOffset:         cmd.baseOffset,
                        newColor:              cmd.color,
                        newMaterial:           cmd.material,
                    }));

                    const after = fstore?.get?.(cmd.elementId);
                    const newData = after ? structuredClone(after) : undefined;
                    if (oldData && newData) {
                        try {
                            const rb = (window.runtime?.bus as unknown as { ringBuffer?: { push?(p: unknown): void } } | undefined)?.ringBuffer;
                            const idPtr = toJsonPointer([cmd.elementId]);
                            rb?.push?.({
                                forward: { ops: [{ op: 'replace', path: idPtr, value: newData }] },
                                inverse: { ops: [{ op: 'replace', path: idPtr, value: oldData }] },
                                affectedStores: ['furniture'],
                            });
                        } catch (e) {
                            console.warn('[element.changeType] furniture ring-buffer push failed (undo falls back to commandManager):', e);
                        }
                    }
                    return;
                }
                if (elType === 'floor') {
                    // §FIX-FLOOR-TYPE-SWAP (L-106) — swap a placed floor finish's type +
                    // layer stack IN PLACE (stable id). UpdateFloorLayersCommand mutates the
                    // LEGACY FloorStore — the store both the 3D FloorTool (cm.execute) AND the
                    // plan-view bus→legacy bridge (§P3.2-FL) populate. The previous dispatch
                    // ('floor.updateLayers') targeted the plugin Immer floor store, which is
                    // DETACHED / empty for FloorTool-created floors → canExecute "floor not
                    // found: <id>" (the founder's report). floorStore.update() fires
                    // 'bim-floor-updated' → FloorFragmentBuilder rebuilds the mesh with the
                    // new assembly + material. Mirrors the wall branch (ADR-0105).
                    //
                    // Ring-buffer parity (§FIX-FURNITURE-TYPE-LIST-AND-UNDO L-68): the command
                    // runs through the LEGACY commandManager (no ring entry). If the floor's
                    // earlier CREATE lives on the ring buffer, a ring-first Ctrl+Z would pop
                    // the CREATE (delete the floor) instead of reversing the swap. So we push
                    // an invertible WHOLE-ELEMENT replace PatchPair on the SAME id onto the
                    // ring buffer; the ring-first undo now reverses THE SWAP (floorStore.update
                    // → mesh rebuild) and shadow-drops the cm twin — one undo, stable id.
                    const fstore = (window as unknown as { floorStore?: { getById?(id: string): unknown } }).floorStore;
                    const before = fstore?.getById?.(cmd.elementId);
                    const oldData = before ? structuredClone(before) : undefined;

                    _cmExec(new UpdateFloorLayersCommand({
                        floorId:      cmd.elementId,
                        systemTypeId: cmd.newTypeId || null,
                        layers:       (cmd.layers ?? []) as any,
                        thickness:    cmd.thickness,
                    }));

                    const after = fstore?.getById?.(cmd.elementId);
                    const newData = after ? structuredClone(after) : undefined;
                    // Only push a ring entry when the command actually mutated the floor
                    // (version bump) — a rejected canExecute leaves data unchanged, and a
                    // no-op PatchPair would surface as a phantom Ctrl+Z.
                    const changed = !!oldData && !!newData &&
                        (newData as any)?.metadata?.version !== (oldData as any)?.metadata?.version;
                    if (changed) {
                        try {
                            const rb = (window.runtime?.bus as unknown as { ringBuffer?: { push?(p: unknown): void } } | undefined)?.ringBuffer;
                            const idPtr = toJsonPointer([cmd.elementId]);
                            rb?.push?.({
                                forward: { ops: [{ op: 'replace', path: idPtr, value: newData }] },
                                inverse: { ops: [{ op: 'replace', path: idPtr, value: oldData }] },
                                affectedStores: ['floor'],
                            });
                        } catch (e) {
                            console.warn('[element.changeType] floor ring-buffer push failed (undo falls back to commandManager):', e);
                        }
                    }
                    return;
                }
                if (elType === 'slab') {
                    // §FIX-SLAB-TYPE-SWAP (mirrors §FIX-FLOOR-TYPE-SWAP L-106) — swap a
                    // placed slab's type + layer stack IN PLACE (stable id).
                    // UpdateSlabLayersCommand mutates the LEGACY SlabStore — the store the
                    // 3D SlabTool (cm.execute) AND the plan-view bridge populate, and that
                    // SlabFragmentBuilder + IFC export + persistence read. The previous
                    // dispatch ('slab.updateLayers') targeted the plugin Immer slab store,
                    // which is DETACHED / empty for SlabTool-created slabs → canExecute
                    // "slab not found: <id>" (the founder's report). slabStore.update()
                    // fires 'bim-slab-updated' → the builder rebuilds the mesh with the new
                    // assembly + material. Mirrors the wall/floor branches (ADR-0105).
                    //
                    // Ring-buffer parity (§FIX-FURNITURE-TYPE-LIST-AND-UNDO L-68 /
                    // §FIX-FLOOR-TYPE-SWAP L-106): the command runs through the LEGACY
                    // commandManager (no ring entry), but the slab store IS ring-covered
                    // (elementUndoStoreAdapter synthesises applyPatch from add/remove/update).
                    // Without a ring entry a ring-first Ctrl+Z would pop the slab's earlier
                    // CREATE (delete the slab) instead of reversing the swap. So we push an
                    // invertible WHOLE-ELEMENT replace PatchPair on the SAME id; the
                    // ring-first undo reverses THE SWAP (slabStore.update → mesh rebuild) and
                    // shadow-drops the cm twin — one undo, stable id.
                    const sstore = (window as unknown as { slabStore?: { getById?(id: string): unknown } }).slabStore;
                    const before = sstore?.getById?.(cmd.elementId);
                    const oldData = before ? structuredClone(before) : undefined;

                    _cmExec(new UpdateSlabLayersCommand({
                        slabId:       cmd.elementId,
                        systemTypeId: cmd.newTypeId || null,
                        layers:       (cmd.layers ?? []) as any,
                        thickness:    cmd.thickness,
                    }));

                    const after = sstore?.getById?.(cmd.elementId);
                    const newData = after ? structuredClone(after) : undefined;
                    // Only push a ring entry when the command actually mutated the slab —
                    // a rejected canExecute (bad layers/thickness) leaves data unchanged, and
                    // a no-op PatchPair would surface as a phantom Ctrl+Z. Compare the
                    // semantic signature (systemTypeId + thickness + layers) since SlabData
                    // has no version stamp.
                    const _sig = (d: any) => d ? JSON.stringify({ s: d.systemTypeId ?? null, t: d.thickness, l: d.layers }) : '';
                    const changed = !!oldData && !!newData && _sig(oldData) !== _sig(newData);
                    if (changed) {
                        try {
                            const rb = (window.runtime?.bus as unknown as { ringBuffer?: { push?(p: unknown): void } } | undefined)?.ringBuffer;
                            const idPtr = toJsonPointer([cmd.elementId]);
                            rb?.push?.({
                                forward: { ops: [{ op: 'replace', path: idPtr, value: newData }] },
                                inverse: { ops: [{ op: 'replace', path: idPtr, value: oldData }] },
                                affectedStores: ['slab'],
                            });
                        } catch (e) {
                            console.warn('[element.changeType] slab ring-buffer push failed (undo falls back to commandManager):', e);
                        }
                    }
                    return;
                }
                if (elType === 'door' || elType === 'window') {
                    // §FIX-HOSTED-TYPE-CHANGE (L-620) — THE ROUTE THAT ACTUALLY LANDS.
                    //
                    // This branch used to dispatch the plugin-bus 'door.setType' /
                    // 'window.setType' handlers. ADR-0105 identified that exact shape as
                    // the wall defect it was written to cure — a handler that
                    // produceCommands against the DETACHED plugin Immer DTO store — and
                    // then left the openings on it, recording the dedicated legacy
                    // commands as "not in scope". So for a PLACED door the DTO store had
                    // no such record, canExecute returned "door not found: <id>", the bus
                    // rejected, and the .then() — hence even the host-wall rebuild nudge —
                    // never ran. (Independently, SetDoorTypeHandler never wrote
                    // `systemTypeId` at all, and plugins/door DoorData has no such field.)
                    //
                    // Now routed like walls/floors/slabs/furniture: through the LEGACY
                    // commandManager onto the geometry store the builders subscribe to.
                    //   doorStore.update()   → 'update' → DoorBuilder   (systemTypeId is
                    //   windowStore.update() → 'update' → WindowBuilder  deliberately NOT
                    //   in _PROPERTY_ONLY_FIELDS, so the mesh fully rebuilds).
                    // C15: the planner preserves id / openingId / host wallId and the
                    // structural void, so the host wall's CSG opening is untouched and NO
                    // wall store write happens.
                    //
                    // NO ring-buffer entry is pushed here — unlike furniture/floor/slab.
                    // `buildUndoStoreMap()` deliberately OMITS 'door'/'window' because the
                    // hosted two-part undo lives in the legacy command, and
                    // §UNDO-CROSS-STACK-ORDER picks the newer of the two stacks, so this
                    // (newer) commandManager entry wins over the opening's older ring
                    // CREATE. Pushing a pair here would fork a second mutation path.
                    if (elType === 'door') {
                        _cmExec(new UpdateDoorSystemTypeCommand({
                            doorId:       cmd.elementId,
                            systemTypeId: cmd.newTypeId,
                        }));
                    } else {
                        _cmExec(new UpdateWindowSystemTypeCommand({
                            windowId:     cmd.elementId,
                            systemTypeId: cmd.newTypeId,
                        }));
                    }
                    // Re-queue the host wall so the reveal/lining around the opening is
                    // re-resolved with the new type's frame depth. Kept from ADR-0105 —
                    // the opening render map is resolved at wall-build time.
                    if (cmd.wallId) {
                        try { window.__wallRebuildControl?.rebuildWalls?.([cmd.wallId]); }
                        catch (e) { console.warn('[element.changeType] host-wall rebuild nudge failed:', e); }
                    }
                    return;
                }
                if (elType === 'ceiling') {
                    // §FIX-CEILING-TYPE-SWAP (L-621, mirrors §FIX-FLOOR-TYPE-SWAP L-106).
                    // The panel used to dispatch 'ceiling.updateLayers' → the plugin-bus
                    // UpdateCeilingLayersHandler, which produceCommands against the
                    // DETACHED plugin Immer ceiling store. That store is populated ONLY
                    // for plan-tool ceilings; the 3D CeilingTool and the project loader
                    // write the LEGACY CeilingStore, so canExecute returned "ceiling not
                    // found: <id>" — and even when it passed, its nextStates never
                    // reached the legacy store CeilingPanelBuilder subscribes to.
                    // UpdateCeilingLayersCommand (already authored in command-registry,
                    // previously with ZERO call sites — authored-but-unwired) mutates the
                    // legacy store → 'bim-ceiling-updated' → mesh rebuild, undoably.
                    const cstore = (window as unknown as { ceilingStore?: { getById?(id: string): unknown } }).ceilingStore;
                    const before = cstore?.getById?.(cmd.elementId);
                    const oldData = before ? structuredClone(before) : undefined;

                    _cmExec(new UpdateCeilingLayersCommand({
                        ceilingId:    cmd.elementId,
                        systemTypeId: cmd.newTypeId || null,
                        layers:       (cmd.layers ?? []) as any,
                        thickness:    cmd.thickness as number,
                    }));

                    const after = cstore?.getById?.(cmd.elementId);
                    const newData = after ? structuredClone(after) : undefined;
                    // Ring-buffer parity (§FIX-FURNITURE-TYPE-LIST-AND-UNDO L-68): the
                    // ceiling store IS ring-covered in buildUndoStoreMap(), so without an
                    // entry a ring-first Ctrl+Z would pop the ceiling's earlier CREATE.
                    // Only push when the command actually mutated (a rejected canExecute
                    // leaves data unchanged; a no-op pair is a phantom Ctrl+Z).
                    const _sig = (d: any) => d ? JSON.stringify({ s: d.systemTypeId ?? null, t: d.thickness, l: d.layers }) : '';
                    if (oldData && newData && _sig(oldData) !== _sig(newData)) {
                        try {
                            const rb = (window.runtime?.bus as unknown as { ringBuffer?: { push?(p: unknown): void } } | undefined)?.ringBuffer;
                            const idPtr = toJsonPointer([cmd.elementId]);
                            rb?.push?.({
                                forward: { ops: [{ op: 'replace', path: idPtr, value: newData }] },
                                inverse: { ops: [{ op: 'replace', path: idPtr, value: oldData }] },
                                affectedStores: ['ceiling'],
                            });
                        } catch (e) {
                            console.warn('[element.changeType] ceiling ring-buffer push failed (undo falls back to commandManager):', e);
                        }
                    }
                    return;
                }
                if (elType === 'plumbing' || elType === 'plumbingfixture' || elType === 'plumbing_fixture') {
                    // §FIX-PLUMBING-TYPE-SWAP (L-622). The panel used to dispatch
                    // 'plumbing.setSystem' — which could NEVER have worked, on two counts
                    // that TypeScript could not catch because the verb is absent from the
                    // command-bus payload map:
                    //   (a) PAYLOAD MISMATCH — the panel sent { id, toiletVariant,
                    //       showerVariant }; SetPlumbingSystemHandler validates
                    //       { plumbingId, systemTag } and rejected on the first field.
                    //   (b) DETACHED STORE — even with the right payload it produceCommands
                    //       against the plugin Immer store, which is NEVER populated: the
                    //       3D PlumbingTool and both plan/drag paths all commit through the
                    //       legacy CreatePlumbingFixtureCommand.
                    // UpdatePlumbingParametersCommand is the proven owner (Contract 39
                    // §3 names it) — legacy plumbingStore → PlumbingFragmentBuilder
                    // .updateFixture(), undoable. Same uniform surface as every other
                    // family; no bespoke verb forked alongside it.
                    //
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — ring parity was MISSING here.
                    // L-622 routed the dispatch correctly but stopped at the commandManager,
                    // and `plumbing` IS covered by buildUndoStoreMap() — so a ring-first
                    // Ctrl+Z after a variant swap popped the FIXTURE'S CREATE (deleting the
                    // toilet) instead of restoring the previous variant. Same defect class as
                    // L-68; closed with the same whole-element PatchPair.
                    _swapWithRingParity('plumbingStore', 'plumbing', cmd.elementId, () => {
                        _cmExec(new UpdatePlumbingParametersCommand({
                            id:            cmd.elementId,
                            toiletVariant: cmd.toiletVariant,
                            showerVariant: cmd.showerVariant,
                        }));
                    });
                    return;
                }
                if (elType === 'stair' || elType === 'stairs') {
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — stair.
                    //
                    // The Stair Type dropdown dispatched `stair.updateParameters`, whose
                    // plugin handler (plugins/stair UpdateStairParametersHandler) is itself a
                    // commandManager BRIDGE to UpdateStairParametersCommand — so unlike
                    // door/floor/slab/ceiling the MUTATION did land: the legacy stairStore is
                    // written and GenerateStairGeometryCommand rebuilds the flight geometry
                    // (`typeId` is in that command's GEOMETRY_KEYS). What was missing was
                    // (a) the uniform surface — AI, collaboration replay and the Data panel
                    // all address type swaps as `element.changeType`, and stair alone was
                    // unreachable that way — and (b) the ring entry: the handler declares
                    // `affectedStores: []` and returns empty patches, while `stair` IS covered
                    // by buildUndoStoreMap(), so Ctrl+Z after a stair type swap popped the
                    // stair's CREATE. Both closed here without forking a second mutation path:
                    // the SAME legacy command the plugin bridge already runs.
                    _swapWithRingParity('stairStore', 'stair', cmd.elementId, () => {
                        _cmExec(new UpdateStairParametersCommand({
                            stairId: cmd.elementId,
                            updates: { typeId: cmd.newTypeId },
                        }));
                    });
                    return;
                }
                if (elType === 'column') {
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — column.
                    //
                    // A column's TYPE is its section profile (rectangular / circular / UC / UB
                    // + the steel profile name), which is what ColumnTypeSelectorWidget
                    // offers. The widget dispatched the `column.update` MOVE bridge directly:
                    // the mutation landed (UpdateColumnCommand → legacy columnStore →
                    // rebuild), but that bridge only emits a ring PatchPair when the caller
                    // opts in with `_recordUndo` + `_prev`, which the gizmo drag-end supplies
                    // and the type widget did not. `column` IS ring-covered → Ctrl+Z after a
                    // profile swap deleted the column. Routed onto the uniform surface with
                    // the same legacy command and unconditional ring parity.
                    _swapWithRingParity('columnStore', 'column', cmd.elementId, () => {
                        _cmExec(new UpdateColumnCommand({
                            id: cmd.elementId,
                            updates: {
                                profile: cmd.newTypeId,
                                ...(cmd.width  !== undefined ? { width:  cmd.width  } : {}),
                                ...(cmd.depth  !== undefined ? { depth:  cmd.depth  } : {}),
                                ...(cmd.steelProfileName !== undefined ? { steelProfileName: cmd.steelProfileName } : {}),
                            } as any,
                        }));
                    });
                    return;
                }
                if (elType === 'beam') {
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — beam. Mirrors the column branch
                    // exactly: `sectionType` is the beam's type, the widget was dispatching
                    // the `beam.update` move bridge without `_recordUndo`, and `beam` is
                    // ring-covered → same phantom-delete Ctrl+Z.
                    _swapWithRingParity('beamStore', 'beam', cmd.elementId, () => {
                        _cmExec(new UpdateBeamCommand({
                            beamId: cmd.elementId,
                            updates: {
                                sectionType: cmd.newTypeId,
                                ...(cmd.width !== undefined ? { width: cmd.width } : {}),
                                ...(cmd.depth !== undefined ? { depth: cmd.depth } : {}),
                                ...(cmd.steelProfileName !== undefined ? { steelProfileName: cmd.steelProfileName } : {}),
                            } as any,
                        }));
                    });
                    return;
                }
                if (elType === 'stair-railing' || elType === 'stairrailing') {
                    // §FIX-STAIR-RAILING-TYPE-PICKER — a STAIR's railing.
                    //
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) covered the STANDALONE handrail
                    // (`handrailStore`). A stair railing is a different element — semantic
                    // 'stair-railing', record `StairRailingConfig`, store `stairRailingStore`
                    // — and fell through to the `console.warn(… ignored)` default. Selecting
                    // one showed "Element Type —" and no picker at all (the founder's report).
                    //
                    // THE FIELDS ARE RESOLVED HERE, NOT IN THE WIDGET. The handrail branch
                    // below takes materialised fields from its widget because `HandrailData`
                    // has no `typeId` to resolve from. `StairRailingConfig` now HAS one, so
                    // the catalogue → construction-form projection lives in ONE place
                    // (`resolveStairRailingTypeFields`, geometry-stair) and every caller —
                    // the panel, the AI plane, collaboration replay — gets the same result
                    // from `{ newTypeId }` alone. Explicit payload fields still win, so a
                    // caller may override a single dimension without inventing a type.
                    const def = handrailTypeStore.getById(String(cmd.newTypeId));
                    if (!def) {
                        console.warn(`[element.changeType] no railing type "${cmd.newTypeId}" in handrailTypeStore — ignored.`);
                        return;
                    }
                    const fields = resolveStairRailingTypeFields(def);
                    _swapWithRingParity('stairRailingStore', 'stairRailing', cmd.elementId, () => {
                        _cmExec(new UpdateStairRailingCommand({
                            id: cmd.elementId,
                            ...fields,
                            ...(cmd.topRailHeight   !== undefined ? { topRailHeight:   cmd.topRailHeight   } : {}),
                            ...(cmd.balusterWidth   !== undefined ? { balusterWidth:   cmd.balusterWidth   } : {}),
                            ...(cmd.balusterSpacing !== undefined ? { balusterSpacing: cmd.balusterSpacing } : {}),
                            ...(cmd.material        !== undefined ? { material:        cmd.material        } : {}),
                        }));
                    });
                    return;
                }
                if (elType === 'railing' || elType === 'handrail' || elType === 'guardrail') {
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — railing / handrail.
                    //
                    // MISSING ENTIRELY: `HandrailTypeStore` has shipped five built-in types
                    // (glass guardrail, stainless handrail, timber baluster, steel guardrail,
                    // stair handrail) since the store was authored, and NOTHING could select
                    // one — no property-panel widget, no bus verb, no command. Authored-but-
                    // unwired, the exact pattern L-621 found for ceilings.
                    //
                    // HandrailData carries no `typeId`, so a railing type is MATERIALISED into
                    // its fields rather than referenced (declared in the report, not papered
                    // over): the widget resolves the HandrailTypeDefinition and passes the
                    // concrete fields, mirroring how the wall/floor/slab widgets pass
                    // `layers` + `thickness` instead of making the handler re-resolve them.
                    // UpdateHandrailCommand owns the geometry handrailStore that
                    // HandrailFragmentBuilder + the plan projector + persistence read.
                    _swapWithRingParity('handrailStore', 'handrail', cmd.elementId, () => {
                        _cmExec(new UpdateHandrailCommand({
                            id: cmd.elementId,
                            ...(cmd.height        !== undefined ? { height:        cmd.height        } : {}),
                            ...(cmd.thickness     !== undefined ? { thickness:     cmd.thickness     } : {}),
                            ...(cmd.baseOffset    !== undefined ? { baseOffset:    cmd.baseOffset    } : {}),
                            ...(cmd.fillType      !== undefined ? { fillType:      cmd.fillType      } : {}),
                            ...(cmd.railProfile   !== undefined ? { railProfile:   cmd.railProfile   } : {}),
                            ...(cmd.railDiameter  !== undefined ? { railDiameter:  cmd.railDiameter  } : {}),
                            ...(cmd.postSpacing   !== undefined ? { postSpacing:   cmd.postSpacing   } : {}),
                            ...(cmd.materialColor !== undefined ? { materialColor: cmd.materialColor } : {}),
                        }));
                    });
                    return;
                }
                if (elType === 'roof') {
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — roof.
                    //
                    // A roof's TYPE is `RoofData.roofType` (gable / hip / flat / shed / …).
                    // There was no change-type route: only the `roof.update` bridge, reachable
                    // from the generic parameter Apply, never from the uniform surface, and
                    // never with a ring entry although `roof` IS ring-covered.
                    _swapWithRingParity('roofStore', 'roof', cmd.elementId, () => {
                        _cmExec(new UpdateRoofCommand(cmd.elementId, { roofType: cmd.newTypeId } as any));
                    });
                    return;
                }
                if (elType === 'lighting' || elType === 'light' || elType === 'lightfixture') {
                    // §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — lighting.
                    //
                    // A lighting element's TYPE is `LightingData.fixtureType` (downlight /
                    // pendant / linear-LED / …). UpdateLightingParametersCommand is the proven
                    // owner — legacy lightingStore + an explicit
                    // `lightingFragmentBuilder.update(record)` so the fixture mesh is rebuilt
                    // with the new type's geometry — and had no change-type call site.
                    //
                    // §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — it HAS one now (the registry-driven
                    // picker), so the id must be validated: `LightingFixtureType` is a closed
                    // union the fragment builder switches on, and an unknown value builds
                    // nothing at all with no error anywhere.
                    if (!getLightingTypeDefinition(String(cmd.newTypeId))) {
                        console.warn(`[element.changeType] no lighting fixture type "${cmd.newTypeId}" in the catalogue — ignored.`);
                        return;
                    }
                    _swapWithRingParity('lightingStore', 'lighting', cmd.elementId, () => {
                        _cmExec(new UpdateLightingParametersCommand({
                            elementId: cmd.elementId,
                            // §FEAT-ELEMENT-TYPE-PICKER-REGISTRY — the `as any` here was
                            // hiding that `fixtureType` was excluded from the command's
                            // patch type. Now typed: reject an id that is not in the
                            // catalogue rather than writing an unbuildable fixture type
                            // (LightingFragmentBuilder switches on it and would render
                            // nothing, silently).
                            patch: { fixtureType: cmd.newTypeId as LightingFixtureType },
                        }));
                    });
                    return;
                }
                console.warn(`[element.changeType] no change-type route for elementType="${elType}" — ignored.`);
            },
        },

        // ── §R4-FIX: element.updateParameters — PropertyPanel.onApply() bridge ──
        // PropertyPanel fires this command via window.runtime.bus.executeCommand()
        // for ALL element types when the user clicks "Apply Changes".
        // Previously unregistered → the call silently no-oped (optional-chain on
        // unregistered type returned undefined) so no store or scene update occurred.
        // UpdateElementParameterCommand routes per-elementType to the correct store
        // and triggers the geometry rebuild for each type.
        {
            type: 'element.updateParameters',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.elementId   ? 'elementId is required'   :
                !cmd.elementType ? 'elementType is required' :
                (!cmd.parameters || Object.keys(cmd.parameters).length === 0) ? 'parameters must not be empty' :
                null
            ),
            fn: (cmd) => {
                _cmExec(new UpdateElementParameterCommand({
                    elementId:   cmd.elementId,
                    elementType: cmd.elementType,
                    parameters:  cmd.parameters as Record<string, any>,
                }));
            },
        },

        // ── §FIX-ELEMENT-MARK-UNHANDLED — element.updateMark had NO handler ─────
        // `PropertyPanel.applyMarkUpdate()` and `PropertyInspectorApply` both dispatch
        // `element.updateMark`, and `@pryzm/command-bus` DECLARES its payload
        // (commands.ts: `'element.updateMark': { elementId, elementType?, newMark }`),
        // but nothing ever registered a handler for it. `executeCommand` on an
        // unregistered type resolves to undefined, so the await succeeded, the panel
        // showed "✓ Applied" and the mark went nowhere. The Mark field is therefore a
        // DEAD control on every element type that exposes it (wall / slab / column /
        // beam / stair) — authored, dispatched, declared, unreachable. This is the same
        // class the §R4-FIX above cured for `element.updateParameters`, and the cure is
        // the same: route it through the ONE generic parameter command (P6 — commands
        // are the only mutation path; undo comes free via its previous-value snapshot).
        //
        // STAIR is the one type whose mark does NOT live at the top level:
        // `StairData` has no `mark` field — the canonical home is `properties.mark`
        // (StairProperties.mark), which is also what PropertyPanel's header input READS
        // (`elementData.properties?.mark ?? elementData.mark`). Writing a top-level
        // `mark` would create a field the Zod schema does not describe and nothing reads.
        // `UpdateElementParameterCommand`'s stair branch expands `properties.*` keys
        // before the store write, so the dotted key lands in the right place.
        {
            type: 'element.updateMark',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.elementId ? 'elementId is required' :
                typeof cmd.newMark !== 'string' ? 'newMark must be a string' :
                null
            ),
            fn: (cmd) => {
                const elType = (cmd.elementType ?? '').toLowerCase().trim();
                const markKey = (elType === 'stair' || elType === 'stairs')
                    ? 'properties.mark'
                    : 'mark';
                _cmExec(new UpdateElementParameterCommand({
                    elementId:   cmd.elementId,
                    elementType: elType,
                    parameters:  { [markKey]: cmd.newMark },
                }));
            },
        },

        {
            type: 'door.setOffset',
            stores: [] as const,
            validate: (cmd) => (!cmd.doorId ? 'doorId is required' : null),
            fn: (cmd) => { _cmExec(new SetDoorOffsetCommand(cmd.doorId, cmd.newOffset, cmd.prevOffset)); },
        },
        {
            type: 'window.setOffset',
            stores: [] as const,
            validate: (cmd) => (!cmd.windowId ? 'windowId is required' : null),
            fn: (cmd) => { _cmExec(new SetWindowOffsetCommand(cmd.windowId, cmd.newOffset, cmd.prevOffset)); },
        },
        {
            type: 'room.updateBoundary',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new UpdateRoomBoundaryCommand(cmd.id, cmd.boundary, cmd.boundingWallIds ?? [])); },
        },

        // ── E.5.4: level bridges ────────────────────────────────────────────
        {
            type: 'level.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.levelId ? 'levelId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateLevelCommand({ levelId: cmd.levelId, updates: cmd.updates })); },
        },
        {
            type: 'level.add',
            stores: [] as const,
            validate: (cmd) => (!cmd.levelId ? 'levelId is required' : null),
            fn: (cmd) => {
                // §R7-FIX: _skipBridge guard — skip when the caller has already
                // dispatched AddLevelCommand directly via commandManager (dual-write,
                // C02 §3.4).  Prevents a duplicate undo-stack entry and the
                // "Level ID already exists" canExecute rejection that would otherwise
                // fire for the same levelId dispatched from StairLevelRequiredPanel.
                if ((cmd as any)._skipBridge) return;
                _cmExec(new AddLevelCommand({ levelId: cmd.levelId, name: cmd.name, elevation: cmd.elevation, height: cmd.height }));
            },
        },

        // ── E.5.4: grid bridges ─────────────────────────────────────────────
        {
            type: 'grid.update',
            stores: [] as const,
            validate: (cmd) => (!cmd.gridId ? 'gridId is required' : null),
            fn: (cmd) => { _cmExec(new UpdateGridCommand({ gridId: cmd.gridId, updates: cmd.updates })); },
        },
        {
            type: 'grid.add',
            stores: [] as const,
            validate: (cmd) => (!cmd.orientation ? 'orientation is required' : null),
            fn: (cmd) => { _cmExec(new AddGridCommand(cmd)); },
        },

        // ── E.5.4: view-definition bridges ─────────────────────────────────
        // §FIX-VIEW-UPDATE-PAYLOAD-KEY (G8, V1-audit §3.5) — this bridge read ONLY
        // `cmd.updates`, but the payload DECLARED in packages/command-bus/src/commands.ts
        // is `{ viewId, patch }`, and that is what ViewPropertiesPanel._updateViewDef
        // sends. So every property-panel edit — RENAME, discipline, purpose, phase
        // filter, description — built `new UpdateViewDefinitionCommand(viewId, undefined)`,
        // whose canExecute() does `Object.keys(this.patch)` → TypeError → swallowed by
        // this bridge's own try/catch. Renaming a view from the properties panel was a
        // SILENT NO-OP. (This bridge, not plugins/view's UpdateViewDefinitionHandler, is
        // the live handler: initBusHandlers runs BEFORE registerViewHandlers and the bus
        // is first-registration-wins.)
        //
        // `patch` is canonical (it matches the declared payload). `updates` is kept
        // because the §PERF-ELEV-CROP-DRAG-FLOW (L-222) scope-drag commit in
        // PlanViewInteraction sends it — that ONE command carrying BOTH spatial and crop
        // (one undo entry) is the invariant L-222 established and must stay intact.
        // Pinned by apps/editor/__tests__/viewBusLifecycle.test.ts.
        {
            type: 'view.updateDefinition',
            stores: [] as const,
            validate: (cmd) => {
                if (!cmd.viewId) return 'viewId is required';
                const patch = (cmd as any).patch ?? (cmd as any).updates;
                if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) {
                    return 'patch (or legacy `updates`) must contain at least one field';
                }
                return null;
            },
            fn: (cmd) => {
                const patch = (cmd as any).patch ?? (cmd as any).updates;
                _cmExec(new UpdateViewDefinitionCommand(cmd.viewId, patch));
            },
        },
        {
            type: 'view.setCrop',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd) => { _cmExec(new SetViewCropCommand({ viewId: cmd.viewId, crop: cmd.crop })); },
        },

        // ── E.5.4: view-graph override bridges ─────────────────────────────
        {
            type: 'view.hideElement',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.elementId ? 'viewId and elementId are required' : null),
            fn: (cmd) => { _cmExec(new HideElementInViewCommand(cmd.viewId, cmd.elementId)); },
        },
        {
            type: 'view.isolateElement',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.elementId ? 'viewId and elementId are required' : null),
            fn: (cmd) => { _cmExec(new IsolateElementInViewCommand(cmd.viewId, cmd.elementId)); },
        },
        {
            type: 'view.setGraphicOverride',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.targetId ? 'viewId and targetId are required' : null),
            fn: (cmd) => { _cmExec(new SetGraphicOverrideCommand(cmd.viewId, cmd.targetKind, cmd.targetId, cmd.state, cmd.patch)); },
        },
        {
            type: 'view.clearOverride',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId || !cmd.targetId ? 'viewId and targetId are required' : null),
            fn: (cmd) => { _cmExec(new ClearOverrideCommand(cmd.viewId, cmd.targetKind, cmd.targetId, cmd.state)); },
        },
        {
            type: 'view.clearAllOverrides',
            stores: [] as const,
            validate: (cmd) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd) => { _cmExec(new ClearAllOverridesCommand(cmd.viewId)); },
        },

        // ── E.5.4: annotation bridge ────────────────────────────────────────
        // §P3.5-AN (IMPL-PLAN-2026-05-17): annotation.create bridge removed.
        // registerAnnotationHandlers() in engineLauncher.ts registers the typed handler.
        // Phase 3 exit gate: grep 'annotation.create' fn: initBusHandlers.ts → 0 entries.
        //
        // BUG-ANNO-DRAG (2026-06-08): PlanViewInteraction._onMouseUp dispatches the
        // LEGACY UpdateAnnotationCommand on runtime.bus (type 'UPDATE_ANNOTATION') to
        // move a room-tag in window.annotationStore — but no handler existed, so the
        // drag threw CommandBusError and the move was lost. The payload IS an already-
        // constructed UpdateAnnotationCommand, so forward it through the legacy
        // commandManager (its canExecute/execute/undo own the store mutation + undo
        // snapshot) — mirrors RoomTagAutoPopulator's create/delete path. (No typed
        // handler exists for the legacy room-tag store; the new annotation.* handlers
        // write a different anchor-keyed store, so we cannot repoint to them.)
        {
            type: 'UPDATE_ANNOTATION',
            stores: [] as const,
            validate: (cmd) => (cmd && typeof (cmd as { execute?: unknown }).execute === 'function'
                ? null
                : 'UPDATE_ANNOTATION payload must be an UpdateAnnotationCommand'),
            fn: (cmd) => { _cmExec(cmd); },
        },

        // ── E.5.4: create element bridges ───────────────────────────────────
        // §P3.2-FL (IMPL-PLAN-2026-05-17): floor.create bridge removed.
        // FloorPlanToolHandler now dispatches 'floor.create' directly to CreateFloorHandler
        // registered via registerFloorHandlers() in engineLauncher.ts.
        // The initTools.ts §P3.2-FL bridge mirrors the floor into the legacy FloorStore
        // for FloorFragmentBuilder mesh rendering.
        // Phase 3 exit gate: grep 'floor.create' initBusHandlers.ts → 0 bridge entries.
        // §P3.1-CW (IMPL-PLAN-2026-05-17): curtain-wall.create bridge removed.
        // CurtainWallPlanToolHandler now dispatches 'curtain-wall.create'
        // directly to CreateCurtainWallHandler registered via registerCurtainWallHandlers()
        // in engineLauncher.ts. The initTools.ts §P3.1-CW bridge mirrors the curtain wall
        // into the legacy CurtainWallStore for mesh rebuild.
        // Phase 3 exit gate: grep 'curtain-wall.create' initBusHandlers.ts → 0 matches.
        {
            type: 'opening.create',
            stores: [] as const,
            validate: (cmd) => (!cmd.id ? 'id is required' : null),
            fn: (cmd) => { _cmExec(new CreateOpeningCommand(cmd)); },
        },
        // §P3.5-LT (IMPL-PLAN-2026-05-17): lighting.create bridge removed.
        // registerLightingHandlers() in engineLauncher.ts registers the typed handler.
        // Phase 3 exit gate: grep 'lighting.create' fn: initBusHandlers.ts → 0 entries.
        // §P3.5-PL (IMPL-PLAN-2026-05-17): plumbing.create bridge removed.
        // registerPlumbingHandlers() in engineLauncher.ts now registers the real CreatePlumbing/
        // CreatePlumbingFixture typed handlers.  Duplicate registration would conflict.
        // Phase 3 exit gate: grep 'plumbing.create' bridges initBusHandlers.ts → 0 entries.
        // §P3.2-RF (IMPL-PLAN-2026-05-17): roof.create bridge removed.
        // RoofPlanToolHandler now dispatches 'roof.create' directly to CreateRoofHandler
        // registered via registerRoofHandlers() in engineLauncher.ts.
        // The initTools.ts §P3.2-RF bridge mirrors the roof into the legacy RoofStore
        // for RoofFragmentBuilder mesh rendering.
        // Phase 3 exit gate: grep 'roof.create' initBusHandlers.ts → 0 bridge entries.
        // §P3.4-SE (IMPL-PLAN-2026-05-17): section.create bridge removed.
        // registerSectionHandlers() in engineLauncher.ts now registers the real typed handlers
        // (CreateSectionHandler, DeleteSectionHandler, MoveSectionLineHandler, SetSectionDepth/Mark/Scale).
        // SectionData type gap resolved: SectionData / SectionLine / SectionId added to @pryzm/schemas.
        // Phase 3 exit gate: grep 'section.create' bridges initBusHandlers.ts → 0 entries.
        {
            type: 'stair.create',
            stores: [] as const,
            validate: (cmd) => (!cmd.baseLevelId ? 'baseLevelId is required' : null),
            fn: (cmd) => { _cmExec(new CreateStairCommand(cmd)); },
        },
        // §STAIR-3D-MOVE (2026-06-11) — translate a stair by a world-space delta.
        // Mirrors the wall move path (wall.updateBaseline). The 3D-gizmo drag-end
        // in registerTransformDragHandler.ts dispatches this; MoveStairCommand
        // shifts startPosition + flight overrides + landing centres and re-emits
        // bim-stair-updated so StairMeshBuilder rebuilds at the new location.
        {
            type: 'stair.move',
            stores: [] as const,
            validate: (cmd) => (!cmd.stairId ? 'stairId is required' : (!cmd.delta ? 'delta is required' : null)),
            fn: (cmd) => { _cmExec(new MoveStairCommand(cmd)); },
        },
        {
            type: 'elevation.create',
            stores: [] as const,
            validate: (cmd) => (!cmd.elevationViewId ? 'elevationViewId is required' : null),
            fn: (cmd) => { _cmExec(new CreateElevationMarkCommand(cmd)); },
        },
        // §FIX-SECTION-MARK-CREATE (G8, V1-audit §3.5) — restore the section-MARK
        // creation path (section ViewDefinition + navigable section-mark annotation)
        // under a distinct key so it never collides with plugin-section-view's
        // geometry 'section.create' handler. Payload matches CreateSectionMarkParams:
        //   { sectionViewId, sectionViewName, annotationId, hostViewId,
        //     cutPointA, cutPointB, tailDirection, sectionSpatial? }
        {
            type: 'section.mark.create',
            stores: [] as const,
            validate: (cmd) => (
                !cmd.sectionViewId ? 'sectionViewId is required' :
                !cmd.hostViewId    ? 'hostViewId is required'    :
                null
            ),
            fn: (cmd) => { _cmExec(new CreateSectionMarkCommand(cmd)); },
        },

        // ── E.5.5: view governance & intent bridges ──────────────────────
        {
            type: 'vg.assignIntent',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.viewId || !cmd.intentId ? 'viewId and intentId are required' : null),
            fn: (cmd: any) => { _cmExec(new AssignViewIntentCommand({ viewId: cmd.viewId, intentId: cmd.intentId, keepOverrides: cmd.keepOverrides })); },
        },
        {
            type: 'vg.createVisibilityIntent',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.id ? 'VisibilityIntent id is required' : null),
            fn: (cmd: any) => { _cmExec(new CreateVisibilityIntentCommand(cmd)); },
        },
        {
            type: 'vg.updateVisibilityIntent',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.intentId ? 'intentId is required' : null),
            fn: (cmd: any) => { _cmExec(new UpdateVisibilityIntentCommand(cmd.intentId, cmd.patch)); },
        },
        {
            type: 'view.deleteDefinition',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd: any) => { _cmExec(new DeleteViewDefinitionCommand(cmd.viewId)); },
        },
        {
            type: 'view.createDefinition',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.id ? 'ViewDefinition id is required' : null),
            fn: (cmd: any) => { _cmExec(new CreateViewDefinitionCommand(cmd)); },
        },
        {
            type: 'sheet.addViewport',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.sheetId || !cmd.viewId ? 'sheetId and viewId are required' : null),
            fn: (cmd: any) => { _cmExec(new AddViewportToSheetCommand(cmd)); },
        },

        // ── E.5.6: wall openings ──────────────────────────────────────────────
        // §P2.3 (IMPL-PLAN-2026-05-17): wall.opening.create is now handled by
        // WallOpeningLegacyAdapterHandler (plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts)
        // registered via registerWallHandlers().  The legacy _cmExec(new CreateWallOpeningCommand(...))
        // bridge has been removed — C11 §3 single pipeline compliance.
        // ── E.5.6b: data derivation (unchanged) ──────────────────────────────
        {
            type: 'data.setDerivation',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId   ? 'nodeId is required'  :
                !cmd.keys?.length ? 'keys must be a non-empty array' :
                !cmd.reason   ? 'reason is required'  :
                null
            ),
            fn: (cmd: any) => { _cmExec(new SetDerivationCommand({ nodeId: cmd.nodeId, keys: cmd.keys, reason: cmd.reason })); },
        },

        // ── E.5.7: DataSheetPanel — template + property derivation ──────────
        {
            type: 'template.unassign',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.nodeId ? 'nodeId is required' : null),
            fn: (cmd: any) => { _cmExec(new UnassignTemplateCommand({ nodeId: cmd.nodeId })); },
        },
        {
            type: 'template.assignToNode',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId     ? 'nodeId is required'     :
                !cmd.templateId ? 'templateId is required' :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new AssignTemplateToNodeCommand({
                    nodeId: cmd.nodeId,
                    nodeType: cmd.nodeType,
                    templateId: cmd.templateId,
                    assignedBy: cmd.assignedBy ?? 'user',
                }));
            },
        },
        {
            type: 'data.clearPropertyDerived',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId ? 'nodeId is required' :
                !cmd.key    ? 'key is required'    :
                null
            ),
            fn: (cmd: any) => { _cmExec(new ClearPropertyDerivedCommand({ nodeId: cmd.nodeId, key: cmd.key })); },
        },
        {
            type: 'data.markPropertyDerived',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.nodeId ? 'nodeId is required' :
                !cmd.key    ? 'key is required'    :
                !cmd.reason ? 'reason is required' :
                null
            ),
            fn: (cmd: any) => { _cmExec(new MarkPropertyDerivedCommand({ nodeId: cmd.nodeId, key: cmd.key, reason: cmd.reason })); },
        },
        {
            type: 'hierarchy.updateNode',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.id ? 'id is required' : null),
            fn: (cmd: any) => { _cmExec(new UpdateHierarchyNodeCommand({ id: cmd.id, updates: cmd.updates })); },
        },

        // ── E.5.7: HierarchyTree — site/building/level/unit creation ────────
        {
            type: 'hierarchy.createSite',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id   ? 'id is required'   :
                !cmd.name ? 'name is required' :
                null
            ),
            fn: (cmd: any) => { _cmExec(new CreateSiteCommand({ id: cmd.id, name: cmd.name, code: cmd.code, address: cmd.address })); },
        },
        {
            type: 'hierarchy.createBuilding',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id     ? 'id is required'     :
                !cmd.siteId ? 'siteId is required' :
                !cmd.name   ? 'name is required'   :
                null
            ),
            fn: (cmd: any) => { _cmExec(new CreateBuildingCommand({ id: cmd.id, siteId: cmd.siteId, name: cmd.name, code: cmd.code })); },
        },
        {
            type: 'hierarchy.createLevel',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id         ? 'id is required'         :
                !cmd.buildingId ? 'buildingId is required' :
                !cmd.bimLevelId ? 'bimLevelId is required' :
                !cmd.name       ? 'name is required'       :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new CreateHierarchyLevelCommand({
                    id: cmd.id,
                    buildingId: cmd.buildingId,
                    bimLevelId: cmd.bimLevelId,
                    name: cmd.name,
                    levelNumber: cmd.levelNumber,
                }));
            },
        },
        {
            type: 'hierarchy.createUnit',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id      ? 'id is required'      :
                !cmd.levelId ? 'levelId is required' :
                !cmd.name    ? 'name is required'    :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new CreateUnitCommand({
                    id: cmd.id,
                    levelId: cmd.levelId,
                    name: cmd.name,
                    unitNumber: cmd.unitNumber,
                    unitType: cmd.unitType,
                }));
            },
        },

        // ── E.5.7b: ViewPropertiesPanel / ViewTemplateManager / SheetEditor / VariantBrowser ──
        // §P1.2 NOTE: the three viewTemplate bridges and sheet.moveViewport pass
        // explicit { source: 'HUMAN_DIRECT' } (or cmd-derived source) as the second
        // argument because these operations feed audit trails and OTel source tags.
        // This is intentional and correct — do not remove the metadata arg.
        {
            type: 'vg.takeLatestIntentVersion',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.viewId ? 'viewId is required' : null),
            fn: (cmd: any) => { _cmExec(new TakeLatestIntentVersionCommand({ viewId: cmd.viewId })); },
        },
        {
            type: 'viewTemplate.create',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.id   ? 'id is required'   :
                !cmd.name ? 'name is required' :
                null
            ),
            fn: (cmd: any) => {
                _cmExec(new CreateViewTemplateCommand({
                    id:           cmd.id,
                    name:         cmd.name,
                    discipline:   cmd.discipline,
                    description:  cmd.description,
                    lockedFields: cmd.lockedFields,
                }), { source: cmd.source ?? 'HUMAN_DIRECT' });
            },
        },
        {
            type: 'viewTemplate.update',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.templateId ? 'templateId is required' :
                !cmd.patch      ? 'patch is required'      :
                null
            ),
            fn: (cmd: any) => { _cmExec(new UpdateViewTemplateCommand(cmd.templateId, cmd.patch), { source: 'HUMAN_DIRECT' }); },
        },
        {
            type: 'viewTemplate.delete',
            stores: [] as const,
            validate: (cmd: any) => (!cmd.templateId ? 'templateId is required' : null),
            fn: (cmd: any) => {
                // §P1.4: viewTemplate.delete reads the return value, so it cannot
                // use the fire-and-forget _cmExec helper.  The explicit error branch
                // is required here (C11 §5 — no silent failures).
                const cm = window.commandManager as { execute(cmd: unknown, options?: unknown): void } | undefined;
                if (!cm) {
                    console.error('[initBusHandlers] §P1.4: commandManager not ready — viewTemplate.delete dropped:', cmd.templateId);
                    return;
                }
                const result: any = cm.execute(new DeleteViewTemplateCommand(cmd.templateId), { source: 'HUMAN_DIRECT' });
                if (!result?.success) {
                    throw new Error(result?.error ?? 'Cannot delete template — check that no views use it.');
                }
            },
        },
        {
            type: 'sheet.moveViewport',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.sheetId    ? 'sheetId is required'    :
                !cmd.viewportId ? 'viewportId is required' :
                !cmd.newPosition ? 'newPosition is required' :
                null
            ),
            fn: (cmd: any) => { _cmExec(new MoveViewportCommand(cmd.sheetId, cmd.viewportId, cmd.newPosition), { source: 'HUMAN_DIRECT' }); },
        },
        {
            type: 'generative.applyLayout',
            stores: [] as const,
            validate: (cmd: any) => (
                !cmd.layout   ? 'layout is required'   :
                !cmd.levelId  ? 'levelId is required'  :
                null
            ),
            fn: (cmd: any) => { _cmExec(new GenerativeDesignApplyCommand(cmd.layout, cmd.levelId, cmd.levelHeight ?? 3.0)); },
        },

        // ── §FIX-UNDERLAY-DELETE-AND-STORAGE (L-45) — floor-plan underlay commands ──
        // The underlay commands (CreateUnderlayCommand / TransformUnderlayCommand /
        // DeleteUnderlayCommand) are non-semantic Class-A commands whose do/undo live on
        // the FloorPlanUnderlayTool singleton (Contract 01 §2.1, Contract 04 §3.1). The
        // UI dispatches them P6-compliantly via runtime.bus.executeCommand(cmd.type, cmd)
        // — the PAYLOAD is the already-constructed legacy Command instance (mirrors the
        // UPDATE_ANNOTATION bridge above). Without a handler under the CommandType key,
        // deleting a selected underlay threw `CommandBusError: no handler registered for:
        // DELETE_UNDERLAY` (and CREATE_UNDERLAY silently rejected → lost create-undo).
        // We forward the pre-built command through the legacy commandManager, whose
        // execute()/undo() own the mesh teardown + recreate and the undo-stack entry.
        // (DeleteUnderlayCommand.execute() runs the silent __pryzmRemoveUnderlayInternal
        // teardown; undo() recreates the mesh via __pryzmRecreateUnderlayInternal.)
        {
            type: 'CREATE_UNDERLAY',
            stores: [] as const,
            validate: (cmd) => (typeof cmd?.execute === 'function' ? null : 'CREATE_UNDERLAY payload must be a CreateUnderlayCommand'),
            fn: (cmd) => { _cmExec(cmd); },
        },
        {
            type: 'TRANSFORM_UNDERLAY',
            stores: [] as const,
            validate: (cmd) => (typeof cmd?.execute === 'function' ? null : 'TRANSFORM_UNDERLAY payload must be a TransformUnderlayCommand'),
            fn: (cmd) => { _cmExec(cmd); },
        },
        {
            type: 'DELETE_UNDERLAY',
            stores: [] as const,
            validate: (cmd) => (typeof cmd?.execute === 'function' ? null : 'DELETE_UNDERLAY payload must be a DeleteUnderlayCommand'),
            fn: (cmd) => { _cmExec(cmd); },
        },
    ];

    for (const spec of __bridges) {
        // §OI-053 (PERF 2026-05-24) — skip if already registered (composeRuntime /
        // a plugin / engineLauncher F-1.3). Avoids the duplicate-register throw that
        // was caught + logged as a red console.error per boot.
        if (runtime.bus.registry?.has?.(spec.type as any)) continue;
        try {
            runtime.bus.register({
                type: spec.type as any,
                affectedStores: spec.stores as any,
                canExecute: (_ctx: any, cmd: any) => {
                    const reason = spec.validate?.(cmd);
                    return reason ? { valid: false, reason } : { valid: true };
                },
                execute: (_ctx: any, cmd: any): any => {
                    return withHandlerSpan(`${spec.type}.handler`, { 'pryzm.command.type': spec.type }, () => {
                        // §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) — compute the ring-buffer
                        // PatchPair BEFORE the bridge mutation (the `_prev` snapshot in
                        // the payload is the pre-move state). The bridge still performs
                        // the authoritative commandManager mutation; these patches are
                        // applied ONLY on undo/redo (see BridgeSpec.undoPatch).
                        let patches: { forward: Patch[]; inverse: Patch[] } | null = null;
                        try {
                            patches = spec.undoPatch?.(cmd) ?? null;
                        } catch (e) {
                            console.error(`[initBusHandlers] ${spec.type} undoPatch failed:`, e);
                        }
                        // §FIX-COMMAND-REJECTION-SURFACED (Gate G7, P8 / C11 §5) — NEVER
                        // SWALLOW A FAILURE.
                        //
                        // This catch used to `console.error` and RETURN AS IF THE COMMAND HAD
                        // SUCCEEDED. That is exactly how `wall.setColor` survived: the command
                        // system said no (canExecute reject / a throw in the legacy command),
                        // the promise resolved anyway, and the only trace was a console line
                        // nobody reads — while the inspector's live mesh repaint told the user
                        // it had worked. Every lying button in this gate is downstream of a
                        // failure that was observed and discarded.
                        //
                        // Now: surface it to the user (the `pryzm:toast` channel the 3-D drag
                        // path already uses) AND re-throw, so the bus rejects the promise and
                        // the caller's own error path runs. A command that cannot execute must
                        // SURFACE — never `console.error` into the void.
                        try {
                            spec.fn(cmd);
                        } catch (e) {
                            const msg = e instanceof Error ? e.message : String(e);
                            console.error(`[initBusHandlers] ${spec.type} bridge failed:`, e);
                            try {
                                window.runtime?.events?.emit('pryzm:toast', {
                                    message: `Couldn't apply ${spec.type} — ${msg}`,
                                    severity: 'error',
                                });
                            } catch { /* toast bus optional — never mask the original error */ }
                            throw e;
                        }
                        return patches ?? { forward: [], inverse: [] };
                    });
                },
            } as any);
            console.log(`[initBusHandlers] §E.5.x: ${spec.type} registered (bridge).`);
        } catch (_be: any) {
            console.error(`[initBusHandlers] §E.5.x: ${spec.type} failed (non-fatal):`, _be?.message ?? _be);
        }
    }

    // ── §GEN-CHAT-SEAM (RAC U5b.2) — conversational building generation ─────
    //
    // ONE bus verb for "generate a 3-storey residential building" / "…house" /
    // "…office building with 5 floors" (P6: the chat expresses intent through
    // the bus like every other surface). The handler AWAITS the SAME
    // controllers/executors the onboarding modal drives — mapped through the
    // typed GenerationRequest seam (../ui/generation/generationRequest.ts),
    // never a second pipeline — so the executors' own beginBuildingGeneration
    // lease coalesces the whole build into ONE undo entry exactly as the modal
    // path does. Engine honesty (§GEN-MAXHEIGHT-GATE numbers,
    // §RESI-ZERO-APARTMENTS-REFUSE reasons, fill/desk counts) is emitted on
    // 'pryzm-generation-report' BEFORE the promise resolves, so
    // ZeroTokenChatBridge's report listener (attached for the duration of the
    // dispatch) renders it verbatim in the transcript. `stores: []` — the
    // executors own all mutation; undo lives on their coalesced batch.
    // `generation.apartment` is the SIBLING verb for "create a 3 bedroom
    // apartment" — laying a plan into the walls ALREADY DRAWN, not a new
    // envelope (§GEN-CHAT-APARTMENT, founder P0 2026-08-10). Two verbs rather
    // than one typology-tagged verb because the two are different asks with
    // different preconditions (a site boundary vs a closed shell) and the
    // capability registry declares them separately.
    const __generationVerbs: Array<{
        type: 'generation.building' | 'generation.apartment' | 'generation.rooms' | 'generation.finish-chain';
        validate: (cmd: any) => string | null;
        run: (cmd: any) => Promise<void>;
    }> = [
        {
            type: 'generation.building',
            validate: (cmd: any) => {
                const t = cmd?.typology;
                return t === 'residential-building' || t === 'house' || t === 'office'
                    ? null
                    : "typology ('residential-building' | 'house' | 'office') is required";
            },
            run: async (cmd: any) => {
                const m = await import('../ui/generation/generationChatSeam.js');
                await m.runGenerationBuilding(cmd);
            },
        },
        {
            type: 'generation.apartment',
            validate: (cmd: any) => {
                const b = cmd?.bedrooms;
                return b === undefined || (Number.isInteger(b) && b >= 1)
                    ? null
                    : 'bedrooms, when given, must be a whole number ≥ 1';
            },
            run: async (cmd: any) => {
                const m = await import('../ui/generation/generationChatSeam.js');
                await m.runGenerationApartment(cmd);
            },
        },
        // ── §GEN-ROOMS / §GEN-CHAIN (RAC U5c) ───────────────────────────────
        //
        // The room-scale engines and the finishing chain, on the SAME seam
        // discipline: the handler calls the shared TRIGGERS the console entries
        // (pryzmCeilAllRooms / pryzmFloorAllRooms / pryzmFurnishAllRooms /
        // pryzmLightAllRooms) and the AI-panel leaves call, so there is exactly
        // one path into each engine. `stores: []` and no patches returned —
        // each executor opens its own batch and owns its own undo entry.
        {
            type: 'generation.rooms',
            validate: (cmd: any) => {
                const s = cmd?.steps;
                return Array.isArray(s) && s.length > 0
                    ? null
                    : 'steps (ceilings | floors | furnish | lighting) is required';
            },
            run: async (cmd: any) => {
                const m = await import('../ui/generation/roomFinishChatSeam.js');
                await m.runGenerationRooms(cmd);
            },
        },
        {
            type: 'generation.finish-chain',
            validate: () => null,
            run: async (cmd: any) => {
                const m = await import('../ui/generation/roomFinishChatSeam.js');
                await m.runGenerationFinishChain(cmd);
            },
        },
    ];
    for (const spec of __generationVerbs) {
        if (runtime.bus.registry?.has?.(spec.type as any)) continue;
        try {
            runtime.bus.register({
                type: spec.type as any,
                affectedStores: [] as any,
                // Parameter order is (ctx, cmd) — `§S02-T1`, CommandHandler's own contract.
                canExecute: (_ctx: any, cmd: any) => {
                    const err = spec.validate(cmd);
                    return err ? { valid: false, reason: err } : { valid: true };
                },
                execute: async (_ctx: any, cmd: any) => withHandlerSpan(
                    `${spec.type}.handler`,
                    { 'pryzm.command.type': spec.type, 'pryzm.generation.typology': String(cmd?.typology ?? spec.type) },
                    async () => {
                        await spec.run(cmd);
                        // The executors own every mutation and every undo entry
                        // (their own beginBuildingGeneration lease coalesces the
                        // build). This handler contributes no patches of its own —
                        // returning any here would double-count the build on undo.
                        return { forward: [], inverse: [] };
                    },
                ),
            } as any);
            console.log(`[initBusHandlers] §GEN-CHAT-SEAM: ${spec.type} registered (RAC U5b.2).`);
        } catch (_ge: any) {
            console.error(`[initBusHandlers] §GEN-CHAT-SEAM: ${spec.type} failed (non-fatal):`, _ge?.message ?? _ge);
        }
    }
}
