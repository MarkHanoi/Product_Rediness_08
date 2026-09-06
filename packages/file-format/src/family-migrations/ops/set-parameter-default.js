// Op #21: set-parameter-default — §PARAM-VALUE-IS-EDITABLE.
//
// ⚠ HAND-EMITTED, deliberately. The `.js` files sitting beside the sources in
//    `src/family-migrations/**` are what actually LOAD at runtime (`index.ts`
//    imports `'./ops/<name>.js'`, and a real file with that name wins over the
//    `.ts`), and `@pryzm/file-format`'s package `exports` resolves `.` →
//    `src/index.ts`, which imports `./family-migrations/index.js`. An op added
//    only in TypeScript is exported by a module nobody executes — measured, not
//    assumed: a probe reported `viaJs: undefined · viaTs: function` for the op
//    one commit ago. Keep the two in step.
//
// The doc comment lives in `set-parameter-default.ts`; it is the authority.

export function makeSetParameterDefaultMigrator(from, to, params) {
    return {
        id: `set-parameter-default:${params.parameterId}`,
        from,
        to,
        description: params.defaultValue === null
            ? `clear the default of parameter ${params.parameterId}`
            : `set parameter ${params.parameterId} default to ${JSON.stringify(params.defaultValue)}`,
        apply(input) {
            const doc = input.document;
            const target = doc.parameters.find((p) => p.id === params.parameterId);
            if (!target) {
                throw new Error(`parameter ${params.parameterId} is not carried by this definition, so there is no value ` +
                    'to change');
            }
            const value = params.defaultValue;
            if (value !== null) {
                if (target.expression !== null && target.expression.trim() !== '') {
                    throw new Error(`parameter "${target.name}" carries the formula '${target.expression}', and per ADR-0376 D4 ` +
                        'an expression BEATS a default — so a value typed here would resolve to nothing and ' +
                        'change no geometry. Remove the formula first (delete-expression); the value it ' +
                        'superseded comes back with it.');
                }
                switch (target.dataType) {
                    case 'length':
                    case 'angle':
                    case 'number': {
                        if (typeof value !== 'number' || !Number.isFinite(value)) {
                            throw new Error(`parameter "${target.name}" is declared '${target.dataType}', so its value is a finite ` +
                                `number; ${JSON.stringify(value)} is not one. A number without a declared quantity ` +
                                'kind is not a measurement (C110 §3).');
                        }
                        break;
                    }
                    case 'count': {
                        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
                            throw new Error(`parameter "${target.name}" is declared 'count', so its value is a non-negative whole ` +
                                `number; ${JSON.stringify(value)} is not one. Refused rather than rounded — a count ` +
                                'of 2.5 is not a count, and rounding would decide for the author (spec §75).');
                        }
                        break;
                    }
                    case 'boolean': {
                        if (value !== 0 && value !== 1) {
                            throw new Error(`parameter "${target.name}" is declared 'boolean', which the resolver carries as the ` +
                                `scalar 0 or 1; ${JSON.stringify(value)} is neither. This op mints no second ` +
                                'spelling for one concept.');
                        }
                        break;
                    }
                    case 'string': {
                        if (typeof value !== 'string') {
                            throw new Error(`parameter "${target.name}" is declared 'string', so its value is text; ` +
                                `${JSON.stringify(value)} is not.`);
                        }
                        break;
                    }
                    default: {
                        throw new Error(`parameter "${target.name}" declares the unknown dataType ` +
                            `'${String(target.dataType)}', so this op cannot say what a valid value for it is. ` +
                            'Refused rather than writing one anyway.');
                    }
                }
                if (target.defaultValue === value) {
                    throw new Error(`parameter "${target.name}" already has the value ${JSON.stringify(value)}; refused rather ` +
                        'than reporting an edit that changed nothing.');
                }
            }
            else if (target.defaultValue === null) {
                throw new Error(`parameter "${target.name}" already carries no default; refused rather than reporting a ` +
                    'clear that cleared nothing.');
            }
            const next = { ...target, defaultValue: value };
            return {
                manifest: { ...input.manifest },
                document: {
                    ...doc,
                    formatVersion: to,
                    parameters: doc.parameters.map((p) => (p.id === next.id ? next : p)),
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
