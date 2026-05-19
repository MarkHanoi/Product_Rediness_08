// Identity migrator (S57 deliverable §19.6 item 1: scaffold).
//
// The identity migrator is the canonical fixture for "no breaking
// changes between two versions yet still version-bumped" — used by
// the `family-migration` gate as a sanity floor that the framework
// itself does not corrupt the bundle.
export function identityMigrator(from, to) {
    return {
        id: `identity-${from}-to-${to}`,
        from,
        to,
        description: `identity migration ${from} → ${to} (no breaking change)`,
        apply(input) {
            return {
                manifest: { ...input.manifest },
                document: {
                    ...input.document,
                    formatVersion: to,
                },
                ifcMapping: input.ifcMapping ? { ...input.ifcMapping } : undefined,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=identity.js.map