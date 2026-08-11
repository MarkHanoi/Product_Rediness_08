/**
 * §PROBE-DEAD-VERB (W3-3) — "a successful command MUST produce authoritative,
 * OBSERVABLE model state".
 *
 * THE DEFECT CLASS (Class A · dead verb). A command reports SUCCESS; no
 * authoritative consumer (renderer / persistence / undo / export / sync) ever
 * observes the mutation. The user is told the change happened. It did not.
 *
 * WHY A `success === true` ASSERTION IS NOT A PROBE. Every one of the verbs
 * below resolves successfully today, and several have green unit tests proving
 * their plugin-store patch is correct. Those tests measure the WRONG STORE. The
 * question this file asks instead is: *what exact property in AUTHORITATIVE
 * state proves this mutation happened?* — and then measures THAT property,
 * independently of the command's own return value.
 *
 * WHAT "AUTHORITATIVE" MEANS HERE, MEASURED NOT ASSUMED. In production
 * (`apps/editor/src/bootstrap.ts:92-97`) the single `CommandBus` is constructed
 * with `storesProvider: () => storesAsRecordView(stores)`, where `stores` are the
 * FRESH plugin DTO stores built by `PluginRegistry.ALL_PLUGINS`
 * (`new WallStore()`, `new BeamStore()`, …). The renderer, the 2-D plan
 * projector, the IFC exporter and persistence all read the LEGACY geometry
 * singletons (`window.wallStore`, `window.beamStore`, …) instead. Only
 * `<family>.created` is mirrored across (`initTools.ts`); there is NO update
 * bridge in either direction. So the plugin DTO store is a write-only sink, and
 * the legacy geometry store is the authority.
 *
 * This harness reproduces that EXACT topology: the bus is given plugin DTO
 * snapshots, and a separate `legacy` object stands in for the geometry store
 * that everything downstream actually reads. The invariant asserted is the one
 * that matters, and it is the same for every verb:
 *
 *     RESOLVED SUCCESSFULLY  ⇒  the authoritative record changed.
 *
 * Its contrapositive is the fix that is allowed: a verb that cannot reach
 * authoritative state must REFUSE, out loud, with a reason (C03 §4.6 U-4 —
 * "failure and emptiness are never the same value").
 *
 * A POSITIVE CONTROL is included (`room.setMaterial` with a `materialColor`,
 * which really does bridge to `commandManager` → `UpdateRoomCommand` →
 * roomStore). Without it, a probe that fails for everything proves only that
 * the probe is broken.
 *
 * CONTRACTS: C03 §2 (commands are the only mutation path), C03 §4.1/§4.6
 * (undo patch routing), P6.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';

// The verbs under probe, imported by path so this file needs no new workspace
// dependency edge (apps/editor does not declare every plugin).
import { BulkSetWallVisualsHandler } from '../../../plugins/wall/src/handlers/BulkSetWallVisuals';
import { SetWallColorHandler } from '../../../plugins/wall/src/handlers/SetWallColor';
import { SetWallDimensionsHandler } from '../../../plugins/wall/src/handlers/SetWallDimensions';
import { SetWallLayersHandler } from '../../../plugins/wall/src/handlers/SetWallLayers';
import { SetBeamMaterialHandler } from '../../../plugins/beam/src/handlers/SetBeamMaterial';
import { SetCeilingMaterialHandler } from '../../../plugins/ceiling/src/handlers/SetCeilingMaterial';
import { SetColumnMaterialHandler } from '../../../plugins/column/src/handlers/SetColumnMaterial';
import { SetCurtainWallMaterialHandler } from '../../../plugins/curtain-wall/src/handlers/SetCurtainWallMaterial';
import { SetFloorMaterialHandler } from '../../../plugins/floor/src/handlers/SetFloorMaterial';
import { SetFurnitureMaterialHandler } from '../../../plugins/furniture/src/handlers/SetFurnitureMaterial';
import { SetSlabMaterialHandler } from '../../../plugins/slab/src/handlers/SetSlabMaterial';
import { SetRoofMaterialHandler } from '../../../plugins/roof/src/handlers/SetRoofMaterial';
import { SetStairMaterialHandler } from '../../../plugins/stair/src/handlers/SetStairMaterial';
import { SetPlumbingMaterialHandler } from '../../../plugins/plumbing/src/handlers/SetPlumbingMaterial';
import { SetLightingMaterialHandler } from '../../../plugins/lighting/src/handlers/SetLightingMaterial';
import { SetHandrailMaterialHandler } from '../../../plugins/handrail/src/handlers/SetHandrailMaterial';
import { SetStructuralMaterialHandler } from '../../../plugins/structural/src/handlers/SetStructuralMaterial';
import { SetRoomMaterialHandler } from '../../../plugins/rooms/src/handlers/SetRoomMaterial';

// ── The harness ──────────────────────────────────────────────────────────────

type AnyHandler = { readonly type: string; readonly affectedStores: readonly string[] };

const ELEMENT_ID = 'probe-element-1';

/** A pushed ring-buffer entry, captured verbatim from the CommandBus. */
interface CapturedPair {
  readonly forward: { ops: ReadonlyArray<{ op: string; path: string; value?: unknown }> };
  readonly inverse: { ops: ReadonlyArray<{ op: string; path: string; value?: unknown }> };
  readonly affectedStores: readonly string[];
}

interface Harness {
  readonly bus: CommandBus;
  /** The plugin DTO snapshot the bus hands to handlers — the write-only sink. */
  readonly dto: Record<string, Record<string, Record<string, unknown>>>;
  /** Stand-in for the LEGACY geometry store every renderer/exporter reads. */
  readonly legacy: Record<string, unknown>;
  /** Every PatchPair the bus pushed to the ring buffer. */
  readonly pushed: CapturedPair[];
}

/**
 * Build a bus wired exactly like production: plugin DTO record snapshots as
 * `ctx.stores`, and a SEPARATE legacy record that nothing bridges to.
 */
function makeHarness(handlers: readonly AnyHandler[], storeKeys: readonly string[]): Harness {
  const dto: Record<string, Record<string, Record<string, unknown>>> = {};
  const legacy: Record<string, unknown> = {};
  for (const key of storeKeys) {
    dto[key] = {
      [ELEMENT_ID]: {
        id: ELEMENT_ID,
        levelId: 'L0',
        materialColor: '#111111',
        height: 3,
        thickness: 0.2,
        layers: [{ name: 'base', function: 'structure', thickness: 0.2 }],
      },
    };
    // The authoritative record starts life identical — a bridge, if one existed,
    // would keep them in step.
    legacy[key] = { ...dto[key]![ELEMENT_ID] };
  }

  const pushed: CapturedPair[] = [];
  const bus = new CommandBus({
    // Real AuditDefaults shape: the PatchEmitter MessagePack-encodes the whole
    // EventRecord, so a stray function in `audit` makes EVERY dispatch throw and
    // every row read "REFUSED" — a probe that is green for the wrong reason. The
    // positive control below exists to catch exactly that.
    audit: { actorId: 'probe', projectId: 'probe', clientId: 'probe' },
    storesProvider: () => dto,
  } as never);
  // Minimal ring-buffer stand-in — we only need what CommandBus pushes.
  (bus as unknown as { setRingBuffer(rb: unknown): void }).setRingBuffer({
    push: (pair: CapturedPair) => { pushed.push(pair); },
  });
  for (const h of handlers) bus.register(h as never);
  return { bus, dto, legacy, pushed };
}

type Outcome =
  | { readonly status: 'resolved' }
  | { readonly status: 'refused'; readonly reason: string };

async function dispatch(bus: CommandBus, type: string, payload: unknown): Promise<Outcome> {
  try {
    await bus.executeCommand(type, payload);
    return { status: 'resolved' };
  } catch (e) {
    return {
      status: 'refused',
      reason: e instanceof Error
        ? `${e.message}${process.env.PRYZM_PROBE_STACKS ? `\n${e.stack}` : ''}`
        : String(e),
    };
  }
}

/**
 * THE PROBE. Returns a one-line verdict string so a failure reads as English
 * rather than `expected false to be true`.
 *
 * `SILENT SUCCESS` is the defect. `REACHED` and `REFUSED` are both acceptable —
 * the first does the work, the second says out loud that it cannot.
 */
function verdictOf(
  verb: string,
  outcome: Outcome,
  authoritativeBefore: unknown,
  authoritativeAfter: unknown,
): string {
  const changed = JSON.stringify(authoritativeBefore) !== JSON.stringify(authoritativeAfter);
  if (outcome.status === 'refused') {
    // A refusal produced by the HARNESS (bad store wiring, unregistered verb) is
    // not evidence about the verb — it would make every row read "REFUSED" and
    // turn the whole probe green for the wrong reason. Name it as a broken probe.
    if (/missing from HandlerContext|no handler registered for|Unrecognized object|is not a function|is not defined/.test(outcome.reason)) {
      return `HARNESS ERROR — ${verb}: ${outcome.reason}`;
    }
    return outcome.reason.trim().length > 0
      ? `REFUSED — ${verb}: ${outcome.reason}`
      : `EMPTY REFUSAL — ${verb} refused with no reason`;
  }
  if (changed) return `REACHED — ${verb} changed authoritative state`;
  return (
    `SILENT SUCCESS — ${verb} resolved successfully but the authoritative record is ` +
    `unchanged (${JSON.stringify(authoritativeBefore)}). The user was told it worked.`
  );
}

// ── The dead-verb table ──────────────────────────────────────────────────────
//
// `authoritativeProperty` is the field a renderer/exporter would have to see
// change for the mutation to be real. It is read off `harness.legacy[storeKey]`,
// never off the plugin DTO store the handler writes.

interface DeadVerbCase {
  readonly verb: string;
  readonly handler: AnyHandler;
  readonly storeKey: string;
  readonly payload: Record<string, unknown>;
  readonly authoritativeProperty: string;
}

const CASES: readonly DeadVerbCase[] = [
  { verb: 'wall.bulkSetVisuals', handler: new BulkSetWallVisualsHandler(), storeKey: 'wall',
    payload: { ids: [ELEMENT_ID], materialColor: '#ff0000' }, authoritativeProperty: 'materialColor' },
  { verb: 'wall.setColor', handler: new SetWallColorHandler(), storeKey: 'wall',
    payload: { id: ELEMENT_ID, materialColor: '#ff0000' }, authoritativeProperty: 'materialColor' },
  { verb: 'wall.setDimensions', handler: new SetWallDimensionsHandler(), storeKey: 'wall',
    payload: { id: ELEMENT_ID, height: 4.2 }, authoritativeProperty: 'height' },
  { verb: 'wall.setLayers', handler: new SetWallLayersHandler(), storeKey: 'wall',
    payload: { id: ELEMENT_ID, layers: [{ name: 'brick', function: 'structure', thickness: 0.35 }] },
    authoritativeProperty: 'layers' },
  { verb: 'beam.setMaterial', handler: new SetBeamMaterialHandler(), storeKey: 'beam',
    payload: { beamId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'ceiling.setMaterial', handler: new SetCeilingMaterialHandler(), storeKey: 'ceiling',
    payload: { ceilingId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'column.setMaterial', handler: new SetColumnMaterialHandler(), storeKey: 'column',
    payload: { columnId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'curtain-wall.setMaterial', handler: new SetCurtainWallMaterialHandler(), storeKey: 'curtainwall',
    payload: { curtainWallId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'floor.setMaterial', handler: SetFloorMaterialHandler as unknown as AnyHandler, storeKey: 'floor',
    payload: { floorId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'furniture.setMaterial', handler: new SetFurnitureMaterialHandler(), storeKey: 'furniture',
    payload: { furnitureId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'slab.setMaterial', handler: new SetSlabMaterialHandler(), storeKey: 'slab',
    payload: { slabId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'roof.setMaterial', handler: new SetRoofMaterialHandler(), storeKey: 'roof',
    payload: { roofId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'stair.setMaterial', handler: new SetStairMaterialHandler(), storeKey: 'stair',
    payload: { stairId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'plumbing.setMaterial', handler: new SetPlumbingMaterialHandler(), storeKey: 'plumbing',
    payload: { plumbingId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'lighting.setMaterial', handler: new SetLightingMaterialHandler(), storeKey: 'lighting',
    payload: { lightingId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'handrail.setMaterial', handler: new SetHandrailMaterialHandler(), storeKey: 'handrail',
    payload: { handrailId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
  { verb: 'structural.setMaterial', handler: new SetStructuralMaterialHandler(), storeKey: 'structural',
    payload: { structuralId: ELEMENT_ID, materialId: 'mat-oak' }, authoritativeProperty: 'materialId' },
];

describe('§PROBE-DEAD-VERB — a resolved command must change authoritative state', () => {
  /**
   * One test, one table. Asserted as a whole so a failure prints EVERY verb's
   * verdict side by side — the before-evidence this work exists to produce —
   * rather than one opaque boolean per `it`.
   */
  it('no verb may report success while authoritative state is unchanged', async () => {
    const verdicts: string[] = [];
    for (const c of CASES) {
      const h = makeHarness([c.handler], [c.storeKey]);
      const before = JSON.parse(JSON.stringify(h.legacy[c.storeKey]));
      const outcome = await dispatch(h.bus, c.verb, c.payload);
      verdicts.push(verdictOf(c.verb, outcome, before, h.legacy[c.storeKey]));
    }
    // `PRYZM_PROBE_DUMP=1` prints the whole verdict table by failing on it — the
    // before/after evidence this probe exists to produce.
    if (process.env.PRYZM_PROBE_DUMP) expect(verdicts.join('\n')).toBe('<dump>');
    const offenders = verdicts.filter(v => /^(SILENT SUCCESS|EMPTY REFUSAL|HARNESS ERROR)/.test(v));
    expect(offenders).toEqual([]);
  });
});

// ── room.setMaterial — the id-only path, plus the POSITIVE CONTROL ───────────

describe('§PROBE-DEAD-VERB — room.setMaterial', () => {
  let bridged: unknown[] = [];

  beforeEach(() => {
    bridged = [];
    (globalThis as Record<string, unknown>).window = globalThis;
    (globalThis as Record<string, unknown>).__pryzmInitComplete = true;
    (globalThis as Record<string, unknown>).commandManager = {
      execute: (cmd: unknown) => { bridged.push(cmd); },
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).__pryzmInitComplete;
    delete (globalThis as Record<string, unknown>).commandManager;
  });

  /**
   * POSITIVE CONTROL. `room.setMaterial` with a `materialColor` DOES reach
   * authority: it bridges to `commandManager.execute(new UpdateRoomCommand(…))`
   * → the legacy roomStore → plan fill + persistence. If this ever stops
   * passing, the probe itself is broken and every other verdict in this file is
   * worthless.
   */
  it('CONTROL: materialColor reaches the authoritative bridge', async () => {
    const h = makeHarness([new SetRoomMaterialHandler()], []);
    const outcome = await dispatch(h.bus, 'room.setMaterial', {
      roomId: ELEMENT_ID, materialColor: '#ff0000',
    });
    expect(verdictOf('room.setMaterial(color)', outcome, [], bridged)).toMatch(/^REACHED/);
  });

  /**
   * THE DEFECT (MaterialDispatch.ts:120 omits `supportsMaterialId: false`, so a
   * catalogue material picked in the inspector is dispatched here — and
   * SetRoomMaterial.ts returns `{forward: [], inverse: []}` and reports success).
   */
  it('a catalogue materialId must not report success while writing nothing', async () => {
    const h = makeHarness([new SetRoomMaterialHandler()], []);
    const outcome = await dispatch(h.bus, 'room.setMaterial', {
      roomId: ELEMENT_ID, materialId: 'mat-oak',
    });
    expect(verdictOf('room.setMaterial(materialId)', outcome, [], bridged))
      .not.toMatch(/^(SILENT SUCCESS|EMPTY REFUSAL)/);
  });
});

// ── The undo hazard ──────────────────────────────────────────────────────────

describe('§PROBE-DEAD-VERB-UNDO — a dead verb must not arm the geometry undo stack', () => {
  /**
   * THE HAZARD. `BulkSetWallVisualsHandler.affectedStores` is `['wall']`, and the
   * bus pushes that key verbatim onto the ring buffer
   * (`CommandBus.ts:470 affectedStores: stores`). But `buildUndoStoreMap()`
   * (`apps/editor/src/engine/undo/performUndoRedo.ts:269`) maps `'wall'` to
   * `window.wallStore` — the GEOMETRY store. The forward write went to the plugin
   * DTO store; the inverse is handed to a store that never saw it.
   *
   * Two ways that corrupts a model:
   *   1. the inverse's `value` is the DTO store's stale prior value, which
   *      OVERWRITES whatever the geometry store legitimately holds;
   *   2. Ctrl+Z is consumed by an entry that reverts nothing the user did, and
   *      the shadow-drop pass then discards the commandManager entry beneath it.
   *
   * This test asserts the SAFE state directly: a verb that cannot reach the
   * geometry store must not push a `['wall']`-keyed PatchPair at all.
   */
  it('wall.bulkSetVisuals must not push a geometry-keyed PatchPair', async () => {
    const h = makeHarness([new BulkSetWallVisualsHandler()], ['wall']);
    await dispatch(h.bus, 'wall.bulkSetVisuals', { ids: [ELEMENT_ID], materialColor: '#ff0000' });

    const geometryKeyed = h.pushed.filter(p => p.affectedStores.includes('wall'));
    const detail = geometryKeyed.map(p => `inverse=${JSON.stringify(p.inverse.ops)}`).join('; ');
    expect(
      geometryKeyed.length === 0
        ? 'SAFE — no geometry-keyed undo entry was armed'
        : `UNDO HAZARD — ${geometryKeyed.length} PatchPair(s) keyed 'wall' (→ window.wallStore, the ` +
          `GEOMETRY store) for a forward write geometry never saw: ${detail}`,
    ).toBe('SAFE — no geometry-keyed undo entry was armed');
  });

  /**
   * The corruption, demonstrated end to end: replay the armed inverse through the
   * same routing Ctrl+Z uses, against a geometry record that has legitimately
   * MOVED ON since the dead forward write. The inverse clobbers it.
   */
  it('replaying the armed inverse against the geometry store clobbers a value it owns', async () => {
    const h = makeHarness([new BulkSetWallVisualsHandler()], ['wall']);
    await dispatch(h.bus, 'wall.bulkSetVisuals', { ids: [ELEMENT_ID], materialColor: '#ff0000' });

    // The geometry store meanwhile holds the colour the user really applied,
    // through the live route (wall.updateColor → wallStore.updateWall).
    const geometryWall = h.legacy.wall as Record<string, unknown>;
    geometryWall.materialColor = '#00aa00';

    // Ctrl+Z: performUndoRedo hands the inverse to the 'wall' adapter, i.e. the
    // geometry store. Simulate exactly that routing.
    for (const pair of h.pushed) {
      if (!pair.affectedStores.includes('wall')) continue;
      for (const op of pair.inverse.ops) {
        const segs = op.path.split('/').filter(Boolean);
        if (segs.length === 2 && segs[0] === ELEMENT_ID) geometryWall[segs[1]!] = op.value;
      }
    }

    expect(
      geometryWall.materialColor === '#00aa00'
        ? 'SAFE — the geometry store kept its own value'
        : `CORRUPTED — Ctrl+Z rewrote the geometry store's materialColor to ` +
          `${JSON.stringify(geometryWall.materialColor)} using an inverse computed against the ` +
          `detached plugin DTO store.`,
    ).toBe('SAFE — the geometry store kept its own value');
  });
});
