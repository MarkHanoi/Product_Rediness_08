// UpdateBalconyProfileHandler — RESHAPE THE BALCONY, AND THE MEMBERS FOLLOW.
//
// §FEAT-BALCONY-COMPOUND (L-5600) · C103 §4 · ADR-0333 §6 · C16 §8.6
//
// ═══════════════════════════════════════════════════════════════════════════════
// THIS IS THE FOUNDER'S LAST SENTENCE, IMPLEMENTED.
// ═══════════════════════════════════════════════════════════════════════════════
//   *"The slab will be a rectangle by default, but as we do with the EDIT PROFILE
//    feature, the user could after change the shape, and the FLOOR FINISH AND
//    RAILINGS SHOULD ADAPT."*
//
// One command. One new outline in. A re-derived slab, a re-derived finish and a
// re-derived railing set out — in ONE undo entry, so a reshape is ONE Ctrl+Z.
//
// ─── ⭐ THE RULE: RE-DERIVE WHAT THE OUTLINE DETERMINES. PRESERVE EVERYTHING ELSE. ──
// The founder asked for TWO things that pull against each other:
//
//   (a) *"the floor finish and railings should adapt"* — the members must follow the
//       outline, or the compound is a lie.
//   (b) *"Default options that can be changed on demand by selecting the independent
//       elements afterwards independently"* — a user who set THAT rail to glass at
//       1.1 m must still have it after reshaping the balcony.
//
// A naive re-derive satisfies (a) and destroys (b): rebuilding every member from the
// balcony record throws away every per-member edit the user made. A naive sync
// satisfies (b) and rots (a).
//
// So the rule is stated as a PARTITION of each member's fields:
//
//   RE-DERIVED (functions of the outline, and nothing else):
//       slab.boundary · floor.boundary · handrail.path
//   PRESERVED (everything a user can edit on the member itself):
//       thickness, materialId, systemTypeId, baseOffset, height, shape, diameter,
//       metadata, provenance, confidence, and every field this handler does not name
//
// ⭐ The partition is what makes both requirements true at once, and it is checked:
// `balconyProfileEdit.test.ts` sets a per-member override, reshapes, and asserts the
// geometry moved while the override survived.
//
// ─── ⚠ WHAT HAPPENS TO THE RAILING SET WHEN THE VERTEX COUNT CHANGES ────────────
// The free-edge count is a function of the outline, so a reshape can need MORE or
// FEWER rails. Rails are matched POSITIONALLY in free-edge order:
//   · index < min(old, new)  → the EXISTING record is kept and only its `path` moves
//                              (this is what preserves per-rail edits)
//   · index >= old           → a NEW record, from `addedRailingIds` (pre-minted by
//                              the caller — CA-2, ids must be stable across redo)
//   · index >= new           → the surplus record is DELETED
//
// Positional matching is not clever, and it is deliberately not clever: a
// "nearest-edge" heuristic would silently move one rail's material onto a different
// side of the balcony, which is worse than an honest re-default. What it guarantees
// is that a reshape that does not change the edge count never loses an edit at all —
// which is the overwhelmingly common case (dragging a vertex).

import {
  produceMultiStoreCommand,
  withHandlerSpan,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
  buildBalconyAssembly,
  resolveFreeEdges,
  type BalconySystemType,
  type HostWallSegment,
} from '@pryzm/geometry-balcony';
import { Balcony } from '@pryzm/plugin-sdk';
import { BalconyBoundaryError, BalconyMemberIdError, BalconyNotFoundError } from '../errors.js';
import type { BalconiesState, BalconyData } from '../store.js';

export interface UpdateBalconyProfilePayload {
  readonly balconyId: string;
  /** The NEW plan outline, WORLD coords, OPEN loop. */
  readonly boundary: readonly { x: number; y: number; z: number }[];
  /**
   * The host wall's centreline, re-resolved by the caller.
   *
   * ⚠ Passed rather than remembered, for the same reason `CreateBalcony` passes it:
   * `execute()` re-runs on redo, and a value read from a store at redo time is a
   * different value if the wall moved. A reshape must reshape the balcony and
   * nothing else.
   */
  readonly hostSegment?: HostWallSegment;
  /**
   * Pre-minted ids for railing slots the new outline needs and the old one did not.
   * May be omitted when the reshape does not add edges.
   */
  readonly addedRailingIds?: readonly string[];
  readonly systemType?: BalconySystemType;
}

type BalconyHandlerStores = Readonly<
  {
    balcony: BalconiesState;
    slab: Record<string, unknown>;
    floor: Record<string, unknown>;
    handrail: Record<string, unknown>;
  } & Record<string, unknown>
>;

/** The member fields this command RE-DERIVES. Everything else is preserved. */
const DERIVED_FIELDS = Object.freeze({
  slab: ['boundary'] as const,
  floor: ['boundary'] as const,
  handrail: ['path'] as const,
});

// CA-6/§U-B6: a reshape really
// does write four stores in one gesture; declaring fewer would drop the undeclared
// stores' patches from undo routing, so Ctrl+Z would restore the old outline on the
// slab and leave the railing at the new one.
// ⚠ THE DIRECTIVE MUST BE THE LAST COMMENT LINE HERE. `-next-line` means the
// NEXT LINE: with the rationale below it, it pointed at a comment and suppressed
// NOTHING, so this deliberate exemption had been reporting as a hard lint ERROR.
// eslint-disable-next-line pryzm/store-single-channel
export class UpdateBalconyProfileHandler
  implements CommandHandler<UpdateBalconyProfilePayload, BalconyHandlerStores>
{
  readonly type = 'balcony.updateProfile';

  /** The fields re-derived by this command, exported so the contract and the tests
   *  read the SAME list rather than two copies of it (C84 EI-8, one vocabulary). */
  static readonly DERIVED_FIELDS = DERIVED_FIELDS;

  // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6: see above.
  readonly affectedStores = ['balcony', 'slab', 'floor', 'handrail'] as const;

  canExecute(
    ctx: HandlerContext<BalconyHandlerStores>,
    cmd: UpdateBalconyProfilePayload,
  ): ValidationResult {
    const existing = ctx.stores.balcony[cmd.balconyId];
    if (!existing) return { valid: false, reason: `balcony not found: ${cmd.balconyId}` };
    if (!Array.isArray(cmd.boundary) || cmd.boundary.length < 3) {
      return { valid: false, reason: 'balcony boundary needs >= 3 vertices' };
    }

    const parsed = Balcony.safeParse({ ...existing, boundary: cmd.boundary });
    if (!parsed.success) {
      return { valid: false, reason: parsed.error.issues[0]?.message ?? 'invalid balcony outline' };
    }

    const need = resolveFreeEdges(parsed.data.boundary, cmd.hostSegment).length;
    const have = this._existingRailIds(existing).length;
    const supplied = cmd.addedRailingIds?.length ?? 0;
    if (need > have + supplied) {
      return {
        valid: false,
        reason:
          `this outline has ${need} free edges and the balcony has ${have} railings; ` +
          `${need - have} more pre-minted railing id(s) are required in addedRailingIds ` +
          `(got ${supplied}).`,
      };
    }
    return { valid: true };
  }

  execute(
    ctx: HandlerContext<BalconyHandlerStores>,
    cmd: UpdateBalconyProfilePayload,
  ): HandlerResult {
    return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
      const existing = ctx.stores.balcony[cmd.balconyId];
      if (!existing) throw new BalconyNotFoundError(cmd.balconyId);

      const parsed = Balcony.safeParse({ ...existing, boundary: cmd.boundary });
      if (!parsed.success) {
        throw new BalconyBoundaryError(parsed.error.issues[0]?.message ?? 'invalid balcony outline');
      }
      const next: BalconyData = parsed.data;

      const oldRailIds = this._existingRailIds(existing);
      const free = resolveFreeEdges(next.boundary, cmd.hostSegment);
      const added = cmd.addedRailingIds ?? [];

      // The railing ids of the NEW shape, in free-edge order: reuse the surviving
      // records first (that is what preserves their edits), then the pre-minted extras.
      const nextRailIds: string[] = [];
      for (let i = 0; i < free.length; i++) {
        const reused = oldRailIds[i];
        if (reused !== undefined) {
          nextRailIds.push(reused);
        } else {
          const fresh = added[i - oldRailIds.length];
          if (fresh === undefined) {
            throw new BalconyMemberIdError(
              `this outline has ${free.length} free edges and the balcony has ${oldRailIds.length} ` +
                `railings; ${free.length - oldRailIds.length} more pre-minted railing id(s) are ` +
                `required in addedRailingIds (got ${added.length}).`,
            );
          }
          nextRailIds.push(fresh);
        }
      }
      const removedRailIds = oldRailIds.slice(free.length);

      // The PURE assembly, run on the NEW outline. Nothing here diffs anything: the
      // three members are recomputed from one polygon, exactly as at creation.
      const asm = buildBalconyAssembly(
        next,
        { slabId: existing.childrenIds[0]!, floorId: existing.childrenIds[1]!, railingIds: nextRailIds },
        { hostSegment: cmd.hostSegment, systemType: cmd.systemType },
      );

      const slabId = existing.childrenIds[0]!;
      const floorId = existing.childrenIds[1]!;

      const out = produceMultiStoreCommand(
        {
          balcony: ctx.stores.balcony,
          slab: ctx.stores.slab,
          floor: ctx.stores.floor,
          handrail: ctx.stores.handrail,
        },
        {
          balcony: (d) => {
            const draft = d as Record<string, BalconyData>;
            draft[cmd.balconyId] = {
              ...next,
              childrenIds: [slabId, floorId, ...nextRailIds],
            };
          },
          slab: (d) => {
            const draft = d as Record<string, Record<string, unknown>>;
            const rec = draft[slabId];
            // ⭐ The PARTITION. Only `boundary` moves; thickness, material, system
            // type and every other field the user may have edited on the plate are
            // left exactly as they are.
            if (rec) rec['boundary'] = asm.slab.boundary as unknown;
            else draft[slabId] = asm.slab as unknown as Record<string, unknown>;
          },
          floor: (d) => {
            const draft = d as Record<string, Record<string, unknown>>;
            const rec = draft[floorId];
            if (rec) rec['boundary'] = asm.finish.boundary as unknown;
            else draft[floorId] = asm.finish as unknown as Record<string, unknown>;
          },
          handrail: (d) => {
            const draft = d as Record<string, Record<string, unknown>>;
            for (const r of asm.railings) {
              const rec = draft[r.id];
              // Surviving rail: only the PATH moves. Height, shape, diameter and
              // material survive — the founder's per-member edits.
              if (rec) rec['path'] = r.path as unknown;
              // New rail: a whole record, defaults and all.
              else draft[r.id] = r as unknown as Record<string, unknown>;
            }
            // Surplus rails go with the edges they guarded.
            for (const id of removedRailIds) delete draft[id];
          },
        },
      );

      return { forward: out.forward, inverse: out.inverse, nextStates: out.nextStates };
    }); // withHandlerSpan — CA-14 / C10 §2
  }

  /**
   * The balcony's railing ids, in free-edge order.
   *
   * `childrenIds` is `[slabId, floorId, ...railingIds]` by construction in
   * `CreateBalcony`, and this is the ONE place that ordering is decoded — so if it
   * ever changes, it changes in two places that are next to each other rather than in
   * five places that are not.
   */
  private _existingRailIds(b: BalconyData): readonly string[] {
    return b.childrenIds.slice(2);
  }
}
