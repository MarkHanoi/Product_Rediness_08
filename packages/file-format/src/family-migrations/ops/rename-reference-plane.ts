// Op #16: rename-reference-plane — §82.1-NAME-A-DATUM.
//
// STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.1, verbatim: *"Create a
// reference plane in a 2-D view; it is visible in the 3-D view; **rename it**;
// dimension to it."* Three of those four clauses had an op; `rename it` did not.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ WHY A RENAME IS NOT COSMETIC HERE. The NAME is the entire user-facing
//    identity of a plane: the `plane_…` id never appears on any surface, and
//    the per-shape work-plane control (§82.4) lists planes BY NAME. So a plane
//    whose name is wrong, or a definition with two planes called the same
//    thing, is a definition in which the author cannot tell which datum a shape
//    is built on. That is why this op enforces name UNIQUENESS and
//    `add-reference-plane` — which predates the chooser — does not.
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── WHAT IT DOES **NOT** TOUCH, and why that is the whole point ────────────
// ⛔ The `id` never moves. `ProfileSchema.planeId` and every other reference is
//    an ID, and ids do not carry names (`rename-parameter`'s own rule). So a
//    rename cannot orphan a profile, cannot re-base a solid, and cannot change
//    one number of geometry — which is exactly why it is safe to offer on a
//    plane that is already carrying shapes, while REORIENT and DELETE still are
//    not (see `add-reference-plane`'s header: those need a decision about the
//    geometry bound to the plane, and that decision is not made).
// ⛔ Nothing in an EXPRESSION is rewritten. A plane's name is not an identifier
//    in the parameter language — no expression can name a plane — so the
//    identifier-rewriting machinery `rename-parameter` needs has no counterpart
//    here. If plane names ever become expression-visible, this comment is the
//    thing that has to change first.
//
// ─── REFUSALS, each naming what is wrong (spec §75) ─────────────────────────
//   • the plane id is not carried by this document;
//   • the new name is empty or only whitespace — an unnamed datum cannot be
//     referred to, and the chooser would render a blank row;
//   • the new name is already used by ANOTHER plane in this document;
//   • the new name equals the current one — a no-op that reported success would
//     be a "rename" a user could repeat forever with nothing happening.
// A refusal throws BEFORE a new document is built, so a half-renamed document
// is not a state this op can produce.

import type { FamilyDocument } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

export interface RenameReferencePlaneParams {
  /** The `plane_` id of an EXISTING reference plane. */
  readonly planeId: string;
  /** The new user-facing name. Trimmed before it is compared or written. */
  readonly newName: string;
}

export function makeRenameReferencePlaneMigrator(
  from: string,
  to: string,
  params: RenameReferencePlaneParams,
): Migrator {
  const trimmed = params.newName.trim();
  return {
    id: `rename-reference-plane:${params.planeId}`,
    from,
    to,
    description: `rename reference plane ${params.planeId} → "${trimmed}"`,
    apply(input: RawFamily): RawFamily {
      const doc = input.document;
      const target = doc.referencePlanes.find((pl) => pl.id === params.planeId);
      if (!target) {
        throw new Error(
          `reference plane ${params.planeId} is not carried by this definition, so there is ` +
            'nothing to rename',
        );
      }
      if (trimmed === '') {
        throw new Error(
          `reference plane ${params.planeId} cannot be renamed to an empty name — the name is a ` +
            'plane\'s whole user-facing identity, and an unnamed datum cannot be referred to',
        );
      }
      if (trimmed === target.name) {
        throw new Error(
          `reference plane ${params.planeId} is already named "${trimmed}"; refused rather than ` +
            'reporting a rename that changed nothing',
        );
      }
      const clash = doc.referencePlanes.find(
        (pl) => pl.id !== params.planeId && pl.name === trimmed,
      );
      if (clash) {
        throw new Error(
          `this definition already carries a reference plane named "${trimmed}" (${clash.id}); a ` +
            'second one would make the work-plane chooser ambiguous, because a plane is chosen ' +
            'by NAME and never by id',
        );
      }

      return {
        manifest: { ...input.manifest },
        document: {
          ...doc,
          formatVersion: to,
          referencePlanes: doc.referencePlanes.map((pl) =>
            pl.id === params.planeId ? { ...pl, name: trimmed } : pl,
          ),
        } as FamilyDocument,
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
