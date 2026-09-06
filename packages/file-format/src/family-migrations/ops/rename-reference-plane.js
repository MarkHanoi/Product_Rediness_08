// Op #16: rename-reference-plane — §82.1-NAME-A-DATUM.
//
// ⚠ HAND-EMITTED, deliberately, and this note is the reason. The package's
//    `tsconfig.build.json` emits to `./dist`, yet the `.js` files sitting beside
//    the sources in `src/family-migrations/**` are what actually LOAD at runtime
//    (`index.ts` imports `'./ops/<name>.js'`, and a real file with that name
//    wins over the `.ts`). So an op added only in TypeScript is exported by a
//    module nobody executes — the same "present but unreachable" shape the
//    §82.4-BARREL-SUBSET commit fixed one level up. Keep the two in step.
//
// The doc comment lives in `rename-reference-plane.ts`; it is the authority.
export function makeRenameReferencePlaneMigrator(from, to, params) {
    const trimmed = params.newName.trim();
    return {
        id: `rename-reference-plane:${params.planeId}`,
        from,
        to,
        description: `rename reference plane ${params.planeId} → "${trimmed}"`,
        apply(input) {
            const doc = input.document;
            const target = doc.referencePlanes.find((pl) => pl.id === params.planeId);
            if (!target) {
                throw new Error(`reference plane ${params.planeId} is not carried by this definition, so there is ` +
                    'nothing to rename');
            }
            if (trimmed === '') {
                throw new Error(`reference plane ${params.planeId} cannot be renamed to an empty name — the name is a ` +
                    'plane\'s whole user-facing identity, and an unnamed datum cannot be referred to');
            }
            if (trimmed === target.name) {
                throw new Error(`reference plane ${params.planeId} is already named "${trimmed}"; refused rather than ` +
                    'reporting a rename that changed nothing');
            }
            const clash = doc.referencePlanes.find((pl) => pl.id !== params.planeId && pl.name === trimmed);
            if (clash) {
                throw new Error(`this definition already carries a reference plane named "${trimmed}" (${clash.id}); a ` +
                    'second one would make the work-plane chooser ambiguous, because a plane is chosen ' +
                    'by NAME and never by id');
            }
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    referencePlanes: doc.referencePlanes.map((pl) => pl.id === params.planeId ? { ...pl, name: trimmed } : pl),
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
