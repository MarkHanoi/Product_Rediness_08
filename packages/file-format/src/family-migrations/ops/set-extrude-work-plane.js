// Op #15: set-extrude-work-plane — §82.4-DIRECTED-EXTRUDE.
//
// STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC §82.4 (*"geometry forms — extrusion
// on ANY work plane (not +Y only)"*) · §82.1 (reference planes) · spec §75 ·
// C84 EI-9 · UCE-REACHABILITY-AUDIT G1 "narrowing 1: the authoring ops".
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐ THE ACT THIS OP PERFORMS, IN THE AUTHOR'S WORDS: *"build this shape on
//    THAT work plane"* — the reference plane stops being a datum nothing reads
//    and becomes the thing that decides which way the solid grows.
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── WHY IT IS ONE OP AND NOT TWO ──────────────────────────────────────────
// Putting an extrusion on a work plane touches two persisted fields: the
// PROFILE's `planeId` (*which datum is this drawn on*) and the SOLID's
// `direction` (*which way does it grow*). They are one fact stated twice, and
// the format has no third field that reconciles them. Two ops would make
// "profile on the wall plane, extrusion still vertical" a persistable state —
// a document that validates, packs, loads and is WRONG, which is the C84 EI-9
// shape. So the op writes both or refuses.
//
// ⛔ AND IT IS NOT A DERIVED READ. The alternative — leave `direction` alone
//    and have the BAKE derive the axis from `profile.planeId` — was rejected:
//    `direction` is persisted, v1.0 documents carry it, and a bake that ignored
//    it in favour of the plane would make the same document mean two different
//    shapes depending on which field the reader trusted (§76 gate B). One
//    authority: the bake reads `direction`, and THIS op is what keeps the
//    plane's normal and that field in agreement.
//
// ─── THE ORDER THE BAKE ACTUALLY APPLIES (do not misread the plane) ────────
// `produceExtrude` sweeps the profile along `direction` by the MINIMAL rotation
// carrying +Y onto it. So the profile's ordinates are read in the plane
// PERPENDICULAR to the sweep, which is the work plane — but the SPIN about that
// normal is *not* persisted anywhere: `ReferencePlaneSchema` is `{id, name,
// origin, normal, isHost}` with no in-plane basis (§4D-SCHEMA-DELTA). Two
// authors who expect different in-plane rotations for the same normal will both
// get the minimal one.
//
// ⚠ DECLARED, NOT SILENT (C84 EI-6):
//   • `ReferencePlane.origin` IS NOT APPLIED. `produceExtrude` builds about the
//     profile plane's own origin; there is no per-solid transform in the schema
//     (see `box-solid.ts`'s absence list), so a plane offset from the model
//     origin moves nothing yet. This op therefore refuses a plane whose origin
//     is non-zero rather than accepting an intent half of which is dropped.
//   • Only `kind: 'extrude'` is accepted. `sweep` / `loft` / `revolve` /
//     `boolean` still refuse at bake for their own named reasons; giving them a
//     work plane here would author intent onto a feature that cannot evaluate.
/** Same scale the kernel and the bake use to ask "does this vector have length
 *  at all"; a component of a unit vector is dimensionless, so this is an angle
 *  in disguise (≈1e-9 rad) and not a length tolerance. */
const ZERO_EPS = 1e-9;
/** Below this a plane origin counts as the model origin — see the header's
 *  declared absence. Metres: 1 µm, far under any authored datum offset. */
const ORIGIN_EPS = 1e-6;
/**
 * Put one extrude solid on one reference plane: the profile is re-bound to the
 * plane and the solid's sweep axis becomes the plane's UNIT normal.
 *
 * ⛔ Refuses, by name, every way this can be meaningless: unknown solid,
 *    non-extrude solid (naming the kind), unknown plane, a plane whose normal
 *    has no length, a plane whose origin is not the model origin, and a solid
 *    whose profile is missing. A refusal leaves the document untouched — the
 *    migrator throws before it builds a new document, so a half-moved solid is
 *    not a state this op can produce.
 */
export function makeSetExtrudeWorkPlaneMigrator(from, to, params) {
    return {
        id: `set-extrude-work-plane:${params.solidId}`,
        from,
        to,
        description: `set solid ${params.solidId} onto work plane ${params.planeId}`,
        apply(input) {
            const doc = input.document;
            const solid = doc.solids.find((s) => s.id === params.solidId);
            if (!solid) {
                throw new Error(`solid ${params.solidId} is not carried by this definition; it cannot be put on a work plane`);
            }
            if (solid.kind !== 'extrude') {
                throw new Error(`solid ${params.solidId} is kind '${solid.kind}', and only an 'extrude' has a sweep axis a ` +
                    "work plane can set. The other kinds refuse at bake for their own reasons (§4D-SCHEMA-DELTA); " +
                    'giving one a work plane would author intent onto a feature that cannot evaluate.');
            }
            const plane = doc.referencePlanes.find((pl) => pl.id === params.planeId);
            if (!plane) {
                throw new Error(`reference plane ${params.planeId} is not carried by this definition; a shape cannot be built ` +
                    'on a plane that is not there');
            }
            const { x, y, z } = plane.normal;
            if (![x, y, z].every((c) => Number.isFinite(c))) {
                throw new Error(`reference plane ${plane.name} (${plane.id}) has a non-finite normal (${x}, ${y}, ${z}); it ` +
                    'names no direction to build along');
            }
            const len = Math.hypot(x, y, z);
            if (len < ZERO_EPS) {
                throw new Error(`reference plane ${plane.name} (${plane.id}) has a zero-length normal, so it names no ` +
                    'direction to build along. Refused rather than defaulting to +Y (spec §75) — a plane whose ' +
                    'orientation is unstated is not a plane that happens to be horizontal.');
            }
            if (Math.abs(plane.origin.x) > ORIGIN_EPS ||
                Math.abs(plane.origin.y) > ORIGIN_EPS ||
                Math.abs(plane.origin.z) > ORIGIN_EPS) {
                throw new Error(`reference plane ${plane.name} (${plane.id}) has origin (${plane.origin.x}, ${plane.origin.y}, ` +
                    `${plane.origin.z}), and the bake applies NO per-solid transform — there is no such field in ` +
                    'the schema — so the shape would grow from the model origin while the document said ' +
                    'otherwise. Refused rather than honouring half the plane (spec §75). Closing it needs a ' +
                    'per-solid placement on SolidFeatureSchema; see box-solid.ts’s declared absences.');
            }
            const profile = doc.profiles.find((p) => p.id === solid.profileId);
            if (!profile) {
                throw new Error(`solid ${params.solidId} references profile ${solid.profileId}, which this definition does ` +
                    'not carry; there is nothing to re-bind to the plane');
            }
            // ⭐ Normalised HERE, once, and persisted normalised: the schema's `Vec3`
            //    does not require a unit vector, and a document carrying an
            //    un-normalised axis would make every downstream reader normalise for
            //    itself — several roundings of one number (C84 EI-9).
            const direction = { x: x / len, y: y / len, z: z / len };
            const nextSolid = { ...solid, direction };
            const nextProfile = { ...profile, planeId: plane.id };
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    profiles: doc.profiles.map((p) => (p.id === nextProfile.id ? nextProfile : p)),
                    solids: doc.solids.map((s) => (s.id === nextSolid.id ? nextSolid : s)),
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=set-extrude-work-plane.js.map