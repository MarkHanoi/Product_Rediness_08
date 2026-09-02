// Op #4: change-parameter-type (S57 §19.6).
//
// Changes a parameter's `dataType` (e.g. `length` ↔ `number`).  The
// caller supplies a `valueConverter` that lifts each per-type value
// (in `document.types[*].values[parameterId]`) and the parameter's own
// `defaultValue` from the old shape to the new one.  When the
// converter omits a value, the original is left in place — useful for
// no-op widenings.
//
// ⛔ §C111-TWO-DEFAULT-CHANNELS (C111 §5.3-b, delta D-5) — v1.1.
//   `document.defaults` is GONE.  It was a SECOND answer to "what is
//   this parameter's default?", maintained by this op and two siblings
//   and READ BY NO RESOLVER — which is exactly what made a dead channel
//   look alive.  §5.3-a: `FamilyParameter.defaultValue` is the sole
//   definition-default authority.  ⛔ §5.3-c: adding a reader back is
//   the FORBIDDEN fix — it mints the second source of truth §76 gate B
//   exists to prevent.
export function makeChangeParameterTypeMigrator(from, to, params) {
    return {
        id: `change-parameter-type:${params.parameterId}`,
        from,
        to,
        description: `change parameter ${params.parameterId} dataType → ${params.newDataType}`,
        apply(input) {
            const target = input.document.parameters.find((p) => p.id === params.parameterId);
            if (!target)
                throw new Error(`parameter ${params.parameterId} not found`);
            if (target.dataType === params.newDataType) {
                throw new Error(`parameter ${params.parameterId} already has dataType ${params.newDataType}`);
            }
            const parameters = input.document.parameters.map((p) => p.id === params.parameterId
                ? {
                    ...p,
                    dataType: params.newDataType,
                    // Schema (`family-schema.ts` FamilyParameterDataTypeSchema.defaultValue)
                    // accepts only `number | string | null`.  `valueConverter` is typed
                    // wider (legacy boolean inputs/outputs) — coerce booleans here so
                    // the migration output remains schema-conformant.
                    defaultValue: coerceDefaultValue(params.valueConverter(p.defaultValue)),
                }
                : p);
            const types = input.document.types.map((t) => {
                if (!(params.parameterId in t.values))
                    return t;
                const old = t.values[params.parameterId];
                const next = params.valueConverter(old ?? null);
                if (next === null) {
                    const { [params.parameterId]: _r, ...rest } = t.values;
                    return { ...t, values: rest };
                }
                return { ...t, values: { ...t.values, [params.parameterId]: next } };
            });
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
/** Schema-conformant projection: schema rejects booleans for `defaultValue`. */
function coerceDefaultValue(v) {
    if (typeof v === 'boolean')
        return v ? 1 : 0;
    return v;
}
//# sourceMappingURL=change-parameter-type.js.map