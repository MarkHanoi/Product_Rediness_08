// Op #14: update-profile (lane UCE-FAMILY · §UCE-PROFILE-WRITE-BACK).
//
// ⭐⭐ WHAT THIS CLOSES. `ComponentDefinitionWorkspace` mounted the profile
//     authoring surface (`ComponentProfilePanel` over `ElevationOutlineSurface`)
//     and then had to render, by name, that nothing it drew could be persisted:
//     *"@pryzm/file-format's family-migrations exports no profile write-back op
//     (an update-profile sibling of introduce-expression)"* — lane U3's OWED
//     **O-1**, the one gap between "a sketch surface is mounted" and "a component
//     author can change a shape". This is that op. With it the CREATOR half runs
//     the whole way: drag a vertex → commit → save → reload → the geometry moved.
//
// ─── ⛔ IT MOVES POINTS. IT DOES NOT MINT OR DELETE THEM. ─────────────────────
// A ring commit whose vertex count differs from the profile's would have to mint
// or destroy `ProfileEntity` ids, and those ids are the anchor
// `ProfileConstraintSchema.entityIds` references — dropping one silently orphans
// every constraint that named it, which is design intent lost without a word
// (spec §14–§15: *"the model retains WHY the geometry has its shape"*). The
// adapter that produces the ring already refuses that case by name
// (`profile-vertex-count-changed`, `commitRingToProfile`); this op refuses it
// AGAIN and independently, because a UI guard that is the only voice is one
// deleted line away from a silent loss (C84 EI-6).
//
// ─── ⛔ IT REFUSES TO FREEZE A FORMULA INTO A LITERAL ─────────────────────────
// A point whose stored `x`/`z` is a STRING is an expression-valued coordinate —
// `profileToPolygon` evaluates it against the parameter scope, which is the
// entire mechanism behind the founder's §64 demo (glazing bound to `GlassWidth`
// visibly shrinks). Writing a dragged literal over it would replace a parametric
// relationship with the number it happened to produce under the scope that was
// loaded at the time — spec §13's *"never nudged vertices"* inverted. The op
// throws instead, naming the coordinate and the live alternative.
//
// ─── ⛔ IT WRITES ONLY x AND z ────────────────────────────────────────────────
// Params carry `{id, x, z}` triples, not whole entities, so no other key of
// `ProfileEntitySchema.data` can be dropped by a caller that rebuilt the object
// from a flattened ring. The op overlays the two coordinates onto the entity the
// DOCUMENT carries; everything else survives by construction rather than by the
// caller's care.
//
// ⚠ NON-`point` ENTITIES ARE REFUSED WHOLESALE. `arc` / `circle` / `spline`
//   flatten to many ring vertices, so a ring index does not correspond to an
//   entity and a write-back over one would replace authored curvature with its
//   own tessellation. `profileWriteBackDisposition` says the same thing at the
//   panel; this is the model's own statement of it.
export function makeUpdateProfileMigrator(from, to, params) {
    return {
        id: `update-profile:${params.profileId}`,
        from,
        to,
        description: `move ${params.points.length} point(s) of profile ${params.profileId}`,
        apply(input) {
            const doc = input.document;
            const profiles = doc.profiles;
            const profile = profiles.find((pr) => pr.id === params.profileId);
            if (!profile)
                throw new Error(`profile ${params.profileId} not found`);
            // ── the id set, proven both ways ──────────────────────────────────────
            const seen = new Set();
            for (const p of params.points) {
                if (seen.has(p.id)) {
                    throw new Error(`point ${p.id} is listed twice; a profile point has one position, and two would ` +
                        'make the last writer the winner silently');
                }
                seen.add(p.id);
            }
            if (params.points.length !== profile.entities.length) {
                throw new Error(`profile '${profile.name}' carries ${profile.entities.length} entit(ies) and the update ` +
                    `names ${params.points.length}; committing it would have to mint or delete entity ids, ` +
                    'orphaning any constraint that references them — move vertices without inserting or ' +
                    'deleting, or add the point through an op that owns id minting');
            }
            for (const e of profile.entities) {
                if (!seen.has(e.id)) {
                    throw new Error(`profile '${profile.name}' carries entity ${e.id}, which the update does not name; ` +
                        'send every point of the profile so the id set can be proven intact');
                }
            }
            // ── per-entity admissibility ──────────────────────────────────────────
            const byId = new Map(params.points.map((p) => [p.id, p]));
            const entities = profile.entities.map((e) => {
                const next = byId.get(e.id);
                if (e.kind !== 'point') {
                    throw new Error(`profile '${profile.name}' entity ${e.id} is a '${e.kind}'; writing a flattened ring ` +
                        'over it would replace authored curvature with its own tessellation — edit the ' +
                        'entity through its own parameters instead');
                }
                if (typeof e.data['x'] !== 'number' || typeof e.data['z'] !== 'number') {
                    throw new Error(`profile '${profile.name}' point ${e.id} has an expression-valued coordinate; ` +
                        'writing a dragged literal over it would freeze the formula into the number it ' +
                        'happened to produce — change the parameter the expression reads, or clear the ' +
                        'expression first');
                }
                if (!Number.isFinite(next.x) || !Number.isFinite(next.z)) {
                    throw new Error(`point ${e.id} was given a non-finite coordinate (x=${String(next.x)}, ` +
                        `z=${String(next.z)}); a profile that cannot be evaluated is not a profile`);
                }
                // ⭐ Overlay, never replace: every other `data` key the document carries
                //    survives because the caller never had the chance to drop it.
                return { ...e, data: { ...e.data, x: next.x, z: next.z } };
            });
            const updated = { ...profile, entities };
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    profiles: profiles.map((pr) => (pr.id === params.profileId ? updated : pr)),
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=update-profile.js.map