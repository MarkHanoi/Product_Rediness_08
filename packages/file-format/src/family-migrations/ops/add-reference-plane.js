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
//
// ⚠ §4D-SCHEMA-DELTA (see `bakeFamilyInstance.ts`): `ReferencePlaneSchema` is
//   `{id, name, origin, normal, isHost}` and persists NO in-plane basis, so a
//   plane's spin about its normal is unrecorded. `profileToPolygon` reads a
//   profile's `x`/`z` as MODEL X/Z regardless of the plane — the plane is
//   carried, not yet honoured. A caller authoring anything but the horizontal
//   host plane is therefore recording an intent the evaluator does not read;
//   that gap belongs to the schema, and this op does not paper over it.
export function makeAddReferencePlaneMigrator(from, to, params) {
    return {
        id: `add-reference-plane:${params.plane.id}`,
        from,
        to,
        description: `add reference plane ${params.plane.name}`,
        apply(input) {
            const doc = input.document;
            if (doc.referencePlanes.some((pl) => pl.id === params.plane.id)) {
                throw new Error(`reference plane ${params.plane.id} already present`);
            }
            if (params.plane.isHost && doc.referencePlanes.some((pl) => pl.isHost)) {
                throw new Error(`this definition already declares a host plane; a second host plane would be a second ` +
                    'answer to "what does a hosted instance sit on"');
            }
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    referencePlanes: [...doc.referencePlanes, params.plane],
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=add-reference-plane.js.map