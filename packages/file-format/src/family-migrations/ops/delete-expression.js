// Op #15: delete-expression (lane UCE-FAMILY · §UCE-FORMULA-IS-EDITABLE).
//
// ⭐⭐ WHAT THIS CLOSES. `introduce-expression` refuses a parameter that already
//     carries a formula — *"use a paired delete-expression migrator first"* — and
//     that paired migrator did not exist. The consequence, measured at the UI in
//     lane U3's OWED **O-2**, is that a formula was WRITE-ONCE: the founder's §64
//     sequence could author `GlassWidth = Width - 2*FrameWidth` and could never
//     correct a typo in it. The EDITOR half of the component system cannot be
//     called complete while its central act of design intent is irreversible.
//
// ─── ⭐ IT IS THE EXACT INVERSE OF `introduce-expression` (ADR-0376 D4) ───────
// That op clears `defaultValue` and records it as `supersededDefault`. This one
// restores `supersededDefault` back into `defaultValue` and removes the
// provenance key, so `introduce → delete` returns the parameter to the state it
// was authored in — byte-identical, which is what makes it safe to run inside an
// edit-the-formula gesture. Set `restoreSupersededDefault: false` to DROP the
// recorded default instead; the expression is cleared either way, because that
// is what the op is for.
//
// ⚠ IT MAY LEAVE A PARAMETER WITH NO VALUE, AND SAYS SO RATHER THAN REFUSING.
//   A parameter authored with a formula and no prior default falls to
//   `defaultValue: null` when the formula goes — a state the schema permits and
//   the resolver reports as `unresolved` in the parameter table's own source
//   column. Refusing here would break the edit-a-formula flow (delete then
//   introduce) for exactly the parameters most likely to need it, so the op
//   accepts and the honest `unresolved` row is the disclosure. Pass
//   `replacementDefault` to land a value in the SAME op where the caller has one.
//
// ⛔ IT DOES NOT REWRITE OTHER PARAMETERS' FORMULAS. Deleting an expression does
//    not delete the parameter, so every formula that references it by NAME still
//    resolves — this op cannot produce an `unknown-identifier` the way
//    `rename-parameter` can (C110 G-7). What it CAN produce is a dependent
//    formula reading an `unresolved` input, which the resolver reports as such.
export function makeDeleteExpressionMigrator(from, to, params) {
    return {
        id: `delete-expression:${params.parameterId}`,
        from,
        to,
        description: `delete the expression on parameter ${params.parameterId}`,
        apply(input) {
            const target = input.document.parameters.find((p) => p.id === params.parameterId);
            if (!target)
                throw new Error(`parameter ${params.parameterId} not found`);
            if (target.expression === null || target.expression.trim().length === 0) {
                throw new Error(`parameter ${params.parameterId} carries no expression; there is nothing to delete, and ` +
                    'reporting success for a no-op would tell the author a formula was removed that never existed');
            }
            const parameters = input.document.parameters.map((p) => {
                if (p.id !== params.parameterId)
                    return p;
                const restored = params.replacementDefault !== undefined
                    ? params.replacementDefault
                    : params.restoreSupersededDefault === false
                        ? null
                        : (p.supersededDefault ?? null);
                const next = { ...p, expression: null, defaultValue: restored };
                // The provenance key described a default this op has just re-instated (or
                // deliberately dropped). Carrying it forward would leave a record of a
                // supersession that no longer holds.
                delete next.supersededDefault;
                return next;
            });
            return {
                manifest: { ...input.manifest },
                document: {
                    ...input.document,
                    formatVersion: to,
                    parameters,
                },
                ifcMapping: input.ifcMapping,
                events: input.events,
            };
        },
    };
}
//# sourceMappingURL=delete-expression.js.map