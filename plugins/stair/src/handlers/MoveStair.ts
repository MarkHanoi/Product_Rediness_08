// MoveStairHandler — translate origin in XYZ (S14-T1).
//
// Triggers `cross.stair-handrail` cascade per ADR-0012: any handrail
// hosted on this stair re-runs its producer with the new edge polyline.
//
// §FIX-STAIR-MOVE-DETACHED-STORE (2026-08-06) — DUAL-STORE MOVE
// ─────────────────────────────────────────────────────────────────────────
// FOUNDER REPORT (build 096e12b4): dragging a stair in the 3-D view failed with
//   `stair.move: canExecute rejected — stair not found: 62fc9e3a-…`
// while the stair was plainly on screen, selected, gizmo-anchored, and being
// rebuilt by StairMeshBuilder from `StairStore` ("Updated stair 62fc9e3a… (v3)").
//
// ROOT CAUSE — the L-220 / §FIX-MOVE-SLAB-AND-HANDRAIL signature disease, one more
// instance: ONE bus type, TWO stores.
//   • `apps/editor/src/PluginRegistry.ts:306-308` contributes this plugin's handler
//     set, so THIS handler claims `stair.move` on the bus at composeRuntime() time.
//     It resolves the stair from `ctx.stores.stair` — the plugin's DETACHED Immer
//     DTO store, which nothing writes in production (stairs are created through
//     `CreateStairCommand` → the legacy geometry `StairStore` that the builders,
//     the plan projector, and persistence all read).
//   • `apps/editor/src/engine/initBusHandlers.ts:1494-1499` DOES author the correct
//     bridge (`stair.move` → `MoveStairCommand` → geometry `stairStore`), but the
//     registration loop at :1810 skips any type already claimed
//     (`if (runtime.bus.registry?.has?.(spec.type)) continue;` — CommandBus.register
//     throws on duplicates). The plugin wins the race, so the correct bridge has
//     been DEAD since PluginRegistry started contributing the stair handler set.
//   Net effect: every stair move — 3-D gizmo AND the plan Move tool, since both go
//   through `MOVE_COMMAND_BY_TYPE.stair = 'stair.move'` (elementMove.ts:116) — was
//   rejected before it mutated anything.
//
// WHY THE RAILINGS "DIDN'T FOLLOW": they did not fail to follow — NOTHING MOVED.
// A stair railing carries no independent world geometry: `StairRailingConfig` holds
// only `stairId` + construction parameters, and `StairRailingBuilder` re-samples the
// rail path from the host stair on `bim-stair-updated`
// (`packages/geometry-stair/src/StairRailingBuilder.ts:114-129`). `StairStore.update()`
// emits that event (`StairStore.ts:89`), so a stair move that actually lands rebuilds
// every railing of that stair at the new anchor — the C15 §2 "derived from the host,
// re-evaluated at build time" model, applied to a stair host.
//
// THE FIX — dual-store, mirroring the C15 §3 / F-1.2 dual-write rule and this
// plugin's own `UpdateStairParametersHandler` F-1.3 bridge:
//   • `canExecute` accepts the stair if EITHER store holds it (no more false
//     rejection of a stair that plainly exists in the authoritative store).
//   • `execute` bridges to `MoveStairCommand` whenever the geometry store holds the
//     stair (that command owns the store mutation, the undo snapshot, and the
//     `bim-stair-updated` emit that carries the railings), and ALSO applies the Immer
//     patch when the plugin store holds it — so neither authority silently diverges
//     as the migration completes.
// NOT DONE HERE, deliberately: no "if stair, also move the railings" branch in the
// drag handler or in this command. The stair→railing binding is a domain relation
// (`StairRailingConfig.stairId` + `StairRailingStore.getByStairId`) honoured
// generically by the rebuild path; hard-coding co-movement would introduce a SECOND
// representation of where a railing is (C11 — no new representation).

import {
  produceCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import { MoveStairCommand } from '@pryzm/command-registry';
import { StairNotFoundError } from '../errors.js';
import type { StairData, StairsState } from '../store.js';
import { isFiniteVec3 } from '../intent.js';

export interface MoveStairPayload {
  readonly stairId: string;
  readonly delta: { readonly x: number; readonly y: number; readonly z: number };
}

type StairHandlerStores = Readonly<{ stair: StairsState } & Record<string, unknown>>;

/** Legacy geometry store shape this handler needs (read-only probe). */
interface LegacyStairStoreLike {
  get?(id: string): unknown;
}

/**
 * The GEOMETRY `StairStore` (`window.stairStore`, wired in initTools.ts) — the store
 * StairMeshBuilder / StairRailingBuilder / persistence actually read. `undefined`
 * outside the browser (unit tests) and before initTools has run.
 */
function legacyStairStore(): LegacyStairStoreLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.stairStore as LegacyStairStoreLike | undefined;
}

/** True when the geometry store holds this stair. */
function legacyHasStair(stairId: string): boolean {
  const store = legacyStairStore();
  return !!store?.get?.(stairId);
}

/**
 * F-1.3 bridge: run the canonical `MoveStairCommand` through the legacy
 * commandManager so the geometry store mutates, undo is recorded ONCE for the
 * gesture, and `bim-stair-updated` fires (→ StairMeshBuilder rebuild → every
 * `StairRailingBuilder` railing of this stair re-sampled at the new anchor).
 * Returns true when the bridge ran.
 */
function bridgeLegacyMove(cmd: MoveStairPayload): boolean {
  if (typeof window === 'undefined') return false;
  if (!legacyHasStair(cmd.stairId)) return false;
  const cm = window.commandManager as { execute(c: unknown, options?: unknown): void } | undefined;
  if (!cm) {
    console.error('[stair.move.handler] geometry stair exists but commandManager is unavailable — move not persisted.');
    return false;
  }
  try {
    cm.execute(new MoveStairCommand({ stairId: cmd.stairId, delta: cmd.delta }));
    return true;
  } catch (e) {
    console.error('[stair.move.handler] MoveStairCommand bridge failed:', e);
    return false;
  }
}

export class MoveStairHandler implements CommandHandler<MoveStairPayload, StairHandlerStores> {
  readonly type = 'stair.move';
  readonly affectedStores = ['stair'] as const;

  canExecute(ctx: HandlerContext<StairHandlerStores>, cmd: MoveStairPayload): ValidationResult {
    if (!isFiniteVec3(cmd.delta)) return { valid: false, reason: 'delta must be a finite Vec3' };
    if ((ctx.stores.stair as StairsState)[cmd.stairId]) return { valid: true };
    // §FIX-STAIR-MOVE-DETACHED-STORE — the plugin DTO store is empty in production;
    // the geometry store is the authority the user is looking at.
    if (legacyHasStair(cmd.stairId)) return { valid: true };
    return { valid: false, reason: `stair not found: ${cmd.stairId}` };
  }

  execute(ctx: HandlerContext<StairHandlerStores>, cmd: MoveStairPayload): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
    const s = (ctx.stores.stair as StairsState)[cmd.stairId];

    // ── Geometry-store half (production path) ─────────────────────────────────
    const bridged = bridgeLegacyMove(cmd);

    if (!s) {
      // Nothing in the plugin store: the bridge WAS the move. Empty patches —
      // undo is owned by the commandManager entry MoveStairCommand pushed
      // (same contract as UpdateStairParametersHandler).
      if (!bridged) throw new StairNotFoundError(cmd.stairId);
      return { forward: [], inverse: [] };
    }

    // ── Plugin-store half (post-migration path) ───────────────────────────────
    const [next, forward, inverse] = produceCommand<StairsState>(ctx.stores.stair, (draft) => {
      const dto = (draft as Record<string, StairData>)[cmd.stairId];
      if (!dto) return;
      (draft as Record<string, StairData>)[cmd.stairId] = {
        ...dto,
        origin: {
          x: dto.origin.x + cmd.delta.x,
          y: dto.origin.y + cmd.delta.y,
          z: dto.origin.z + cmd.delta.z,
        },
      };
    });
    return { forward, inverse, nextStates: { stair: next } };
    }); // withHandlerSpan — C10 §2
  }
}
