// Op #11: add-reference-plane (lane U8 · §U8-AUTHORED-SHAPE).
//
// A profile is drawn ON a plane (`ProfileSchema.planeId`), and a definition
// minted from zero carries `referencePlanes: []`. So the first authored shape
// needs a plane before it needs a profile, and this is the op that puts one
// there — rather than `add-box-solid` silently inventing one, which would make
// a geometry op quietly mint a datum the author never asked for.
//
// ⛔ NO REORIENT / NO DELETE HERE. A plane already carrying profiles cannot be
//    moved or removed without deciding what happens to the geometry bound to
//    it, and that decision is not this lane's. Only the additive half exists,
//    and its absence is the honest half (C84 EI-6).
//    ⭐ RENAME is a different act and it DOES exist — `rename-reference-plane`
//      (§82.1-NAME-A-DATUM). The id never moves under a rename, so nothing can
//      be orphaned; that is the whole reason it is safe where the other two are
//      not. ⚠ Uniqueness of NAMES is enforced THERE and not here, because this
//      op predates the work-plane chooser that made names load-bearing.
//
// ⚠ §4D-SCHEMA-DELTA (see `bakeFamilyInstance.ts`): `ReferencePlaneSchema` is
//   `{id, name, origin, normal, isHost}` and persists NO in-plane basis, so a
//   plane's spin about its normal is unrecorded.
//   ⭐ CORRECTED 2026-09-06 (§82.4-DIRECTED-EXTRUDE). This paragraph used to end
//     *"`profileToPolygon` reads a profile's `x`/`z` as MODEL X/Z regardless of
//     the plane — the plane is carried, not yet honoured … a caller authoring
//     anything but the horizontal host plane is recording an intent the
//     evaluator does not read"*. **That is no longer true, and leaving it would
//     be a "cannot" said by code that can.** A plane's NORMAL is now honoured:
//     `set-extrude-work-plane` writes it onto the solid's `direction`, and
//     `produceExtrude` sweeps along it, so the profile's ordinates land in the
//     plane perpendicular to the sweep — i.e. the work plane.
//   ⛔ STILL NOT HONOURED, and these are the real remainder: the plane's
//     **ORIGIN** (there is no per-solid transform in the schema, and the
//     work-plane op REFUSES an offset plane rather than dropping half the
//     intent) and its **SPIN** (no in-plane basis to record one). Both gaps
//     belong to the schema, and this op still does not paper over either.

import type { FamilyDocument, ReferencePlane } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

export interface AddReferencePlaneParams {
  readonly plane: ReferencePlane;
}

export function makeAddReferencePlaneMigrator(
  from: string,
  to: string,
  params: AddReferencePlaneParams,
): Migrator {
  return {
    id: `add-reference-plane:${params.plane.id}`,
    from,
    to,
    description: `add reference plane ${params.plane.name}`,
    apply(input: RawFamily): RawFamily {
      const doc = input.document;
      if (doc.referencePlanes.some((pl) => pl.id === params.plane.id)) {
        throw new Error(`reference plane ${params.plane.id} already present`);
      }
      if (params.plane.isHost && doc.referencePlanes.some((pl) => pl.isHost)) {
        throw new Error(
          `this definition already declares a host plane; a second host plane would be a second ` +
            'answer to "what does a hosted instance sit on"',
        );
      }
      return {
        manifest: { ...input.manifest },
        document: {
          ...doc,
          formatVersion: to,
          referencePlanes: [...doc.referencePlanes, params.plane],
        } as FamilyDocument,
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
