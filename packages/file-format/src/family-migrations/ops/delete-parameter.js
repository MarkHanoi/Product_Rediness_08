// Op #3: delete-parameter (S57 §19.6).
//
// Removes a parameter from `document.parameters` and scrubs every
// reference to its id from:
//   - `document.types[*].values[parameterId]`
//   - `document.profiles[*].constraints[*].parameterRef`
//   - `document.defaults[parameterId]`
//   - `ifcMapping.parameters[*]` entries with matching parameterId
//
// `lengthExpression` strings that mention the deleted parameter's
// NAME are NOT auto-rewritten — that would silently change geometry.
// Instead, the migrator throws if any expression still references the
// name, forcing the author to land a paired `rename-parameter` or
// expression-rewrite migrator first.
export function makeDeleteParameterMigrator(from, to, params) {
    return {
        id: `delete-parameter:${params.parameterId}`,
        from,
        to,
        description: `delete parameter ${params.parameterId}`,
        apply(input) {
            const target = input.document.parameters.find((p) => p.id === params.parameterId);
            if (!target)
                throw new Error(`parameter ${params.parameterId} not found`);
            const referencingSolid = input.document.solids.find((s) => {
                if (s.kind !== 'extrude')
                    return false;
                const re = new RegExp(`\\b${escapeRegex(target.name)}\\b`);
                return re.test(s.lengthExpression);
            });
            if (referencingSolid) {
                throw new Error(`cannot delete parameter ${params.parameterId}: solid ` +
                    `${referencingSolid.id}.lengthExpression references ` +
                    `"${target.name}"; rewrite or rename it first`);
            }
            const parameters = input.document.parameters.filter((p) => p.id !== params.parameterId);
            const profiles = input.document.profiles.map((pr) => ({
                ...pr,
                constraints: pr.constraints.map((c) => c.parameterRef === params.parameterId
                    ? { ...c, parameterRef: null }
                    : c),
            }));
            const types = input.document.types.map((t) => {
                const { [params.parameterId]: _removed, ...rest } = t.values;
                return { ...t, values: rest };
            });
            const { [params.parameterId]: _d, ...defaults } = input.document.defaults;
            const ifcMapping = input.ifcMapping
                ? {
                    ...input.ifcMapping,
                    parameters: input.ifcMapping.parameters.filter((m) => m.parameterId !== params.parameterId),
                }
                : undefined;
            return {
                manifest: { ...input.manifest },
                document: {
                    ...input.document,
                    formatVersion: to,
                    parameters,
                    profiles,
                    types,
                    defaults,
                },
                ifcMapping,
                events: input.events,
            };
        },
    };
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=delete-parameter.js.map