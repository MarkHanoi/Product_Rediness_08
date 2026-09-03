// Op #12: delete-solid (lane U8 · §U8-AUTHORED-SHAPE).
//
// Removes ONE solid feature, and with it:
//   • every `featureEdges[]` entry naming it (the array is persisted-and-inert
//     per ADR-0376 D7, but a dangling edge is a lie whether or not anything
//     reads it);
//   • its profile — ONLY when nothing else references that profile.
//
// ⛔ REFUSES when another solid consumes this one as a boolean operand. A
//    `boolean` feature naming a `subjectSolidId`/`toolSolidId` that no longer
//    exists is an unevaluable document, and the bake's refusal for it would
//    name D7 rather than the real cause (this deletion). The refusal here says
//    which solid stands in the way.
//
// ⭐ THE LAST SOLID MAY BE DELETED, and the honest consequence follows: the
//    document goes back to zero solids and `bakeFamilyInstance` refuses with
//    `no-solids` again. That refusal is CORRECT behaviour for an empty
//    definition (spec §75) — lane U8 removed the DEAD END that made every new
//    component start there, not the refusal itself.
export function makeDeleteSolidMigrator(from, to, params) {
    return {
        id: `delete-solid:${params.solidId}`,
        from,
        to,
        description: `delete solid ${params.solidId}`,
        apply(input) {
            const doc = input.document;
            const target = doc.solids.find((s) => s.id === params.solidId);
            if (!target)
                throw new Error(`solid ${params.solidId} not found`);
            const consumer = doc.solids.find((s) => s.kind === 'boolean' &&
                (s.subjectSolidId === params.solidId || s.toolSolidId === params.solidId));
            if (consumer) {
                throw new Error(`cannot delete solid ${params.solidId}: boolean solid ${consumer.id} consumes it as an ` +
                    'operand; delete that feature first');
            }
            const solids = doc.solids.filter((s) => s.id !== params.solidId);
            const featureEdges = doc.featureEdges.filter((e) => e.from !== params.solidId && e.to !== params.solidId);
            const profileId = 'profileId' in target ? target.profileId : null;
            const stillReferenced = profileId === null ||
                solids.some((s) => ('profileId' in s && s.profileId === profileId) ||
                    ('pathProfileId' in s && s.pathProfileId === profileId) ||
                    ('profileIds' in s && s.profileIds.includes(profileId))) ||
                doc.representations.some((r) => r.authoredProfileId === profileId);
            const profiles = params.keepProfile === true || stillReferenced
                ? doc.profiles
                : doc.profiles.filter((p) => p.id !== profileId);
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    profiles,
                    solids,
                    featureEdges,
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=delete-solid.js.map