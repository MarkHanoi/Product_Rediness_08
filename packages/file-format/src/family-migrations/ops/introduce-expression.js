// Op #5: introduce-expression (S57 §19.6).
//
// Replaces a parameter's constant `defaultValue` (and optionally clears
// per-type overrides for that parameter) with an expression source
// string that references other parameters by name.  The expression
// itself is NOT evaluated here — that happens at bake time inside
// `@pryzm/family-runtime`.
export function makeIntroduceExpressionMigrator(from, to, params) {
    return {
        id: `introduce-expression:${params.parameterId}`,
        from,
        to,
        description: `introduce expression on parameter ${params.parameterId}`,
        apply(input) {
            const target = input.document.parameters.find((p) => p.id === params.parameterId);
            if (!target)
                throw new Error(`parameter ${params.parameterId} not found`);
            if (target.expression && target.expression.trim().length > 0) {
                throw new Error(`parameter ${params.parameterId} already has an expression; ` +
                    `use a paired delete-expression migrator first`);
            }
            const parameters = input.document.parameters.map((p) => p.id === params.parameterId
                ? { ...p, expression: params.expression }
                : p);
            const types = params.clearTypeOverrides
                ? input.document.types.map((t) => {
                    if (!(params.parameterId in t.values))
                        return t;
                    const { [params.parameterId]: _r, ...rest } = t.values;
                    return { ...t, values: rest };
                })
                : input.document.types;
            return {
                manifest: { ...input.manifest },
                document: {
                    ...input.document,
                    formatVersion: to,
                    parameters,
                    types,
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=introduce-expression.js.map