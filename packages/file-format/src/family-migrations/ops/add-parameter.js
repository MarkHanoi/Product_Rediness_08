// Op #2: add-parameter (S57 §19.6).
//
// Appends a brand-new parameter to `document.parameters`.  Validates
// that the id is unique.  Optionally seeds `defaults[parameterId]`
// with the supplied default value.
export function makeAddParameterMigrator(from, to, params) {
    return {
        id: `add-parameter:${params.parameter.id}`,
        from,
        to,
        description: `add parameter ${params.parameter.name}`,
        apply(input) {
            const exists = input.document.parameters.some((p) => p.id === params.parameter.id);
            if (exists)
                throw new Error(`parameter ${params.parameter.id} already present`);
            const parameters = [...input.document.parameters, params.parameter];
            const defaults = params.seedDefault === undefined
                ? input.document.defaults
                : {
                    ...input.document.defaults,
                    [params.parameter.id]: params.seedDefault,
                };
            return {
                manifest: { ...input.manifest },
                document: {
                    ...input.document,
                    formatVersion: to,
                    parameters,
                    defaults,
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=add-parameter.js.map