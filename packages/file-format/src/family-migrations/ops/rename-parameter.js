// Op #1: rename-parameter (S57 §19.6).
//
// Renames a parameter (`par_…`) WITHOUT changing its id.  Updates:
//   - `document.parameters[*].name`
//   - any `lengthExpression` in `document.solids[*]` that references
//     the old name as a bare identifier.
//
// Identifiers in expressions are matched on word boundaries so
// `Width` does not match `WidthMM`.
export function makeRenameParameterMigrator(from, to, params) {
    return {
        id: `rename-parameter:${params.parameterId}`,
        from,
        to,
        description: `rename parameter ${params.parameterId} → "${params.newName}"`,
        apply(input) {
            const target = input.document.parameters.find((p) => p.id === params.parameterId);
            if (!target)
                throw new Error(`parameter ${params.parameterId} not found`);
            const oldName = target.name;
            const newName = params.newName;
            const parameters = input.document.parameters.map((p) => p.id === params.parameterId ? { ...p, name: newName } : p);
            const expressionRewriter = makeIdentifierRewriter(oldName, newName);
            const solids = input.document.solids.map((s) => {
                if (s.kind !== 'extrude')
                    return s;
                return {
                    ...s,
                    lengthExpression: expressionRewriter(s.lengthExpression),
                };
            });
            return {
                manifest: { ...input.manifest },
                document: {
                    ...input.document,
                    formatVersion: to,
                    parameters,
                    solids,
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
function makeIdentifierRewriter(oldName, newName) {
    const pattern = new RegExp(`\\b${escapeRegex(oldName)}\\b`, 'g');
    return (expr) => expr.replace(pattern, newName);
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=rename-parameter.js.map