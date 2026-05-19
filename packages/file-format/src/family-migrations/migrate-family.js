// Top-level migration orchestrator (S57 deliverable §19.6).
//
// `migrateFamily(input, registry, target)` runs a registered chain
// against an unpacked family bundle and returns a freshly-shaped
// `RawFamily` plus per-step telemetry.  The orchestrator is a thin
// wrapper around `MigratorRegistry.run` that adds:
//   - schema-validated entry (manifest + document via family-schema)
//   - schema-validated exit (re-parse the result, surface diagnostics)
//   - OTel span `pryzm.family.migrate` carrying step counts
//
// The pack/unpack surface stays unaware of migrations; callers wire
// `loadFamily` (S56) → `migrateFamily` → `bakeFamilyInstance` to opt
// in.  When no chain is required (source already at target) the
// orchestrator short-circuits and does NOT clone the input.
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { FamilyDocumentSchema, FamilyManifestSchema, } from '../family-schema.js';
export const PRYZM_FAMILY_MIGRATE_TRACER = 'pryzm.family.migrate';
export function migrateFamily(input, registry, targetVersion, opts = {}) {
    const validateEntry = opts.validateEntry !== false;
    const validateExit = opts.validateExit !== false;
    const tracer = trace.getTracer(PRYZM_FAMILY_MIGRATE_TRACER);
    return tracer.startActiveSpan('pryzm.family.migrate', (span) => {
        try {
            span.setAttribute('source_version', input.document.formatVersion);
            span.setAttribute('target_version', targetVersion);
            span.setAttribute('registry_size', registry.size());
            let entrySchemaErrors;
            if (validateEntry) {
                entrySchemaErrors = collectSchemaErrors(input);
                if (entrySchemaErrors.length > 0) {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: `entry schema invalid (${entrySchemaErrors.length})`,
                    });
                    return {
                        ok: false,
                        reason: 'unknown-source-version',
                        message: `entry schema invalid: ${entrySchemaErrors.join('; ')}`,
                        partialSteps: [],
                        entrySchemaErrors,
                    };
                }
            }
            const result = registry.run(input, targetVersion);
            span.setAttribute('step_count', result.ok ? result.steps.length : result.partialSteps.length);
            if (!result.ok) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: result.message });
                return { ...result, entrySchemaErrors };
            }
            let exitSchemaErrors;
            if (validateExit) {
                exitSchemaErrors = collectSchemaErrors(result.family);
                if (exitSchemaErrors.length > 0) {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: `exit schema invalid (${exitSchemaErrors.length})`,
                    });
                    return {
                        ok: false,
                        reason: 'migrator-threw',
                        message: `exit schema invalid: ${exitSchemaErrors.join('; ')}`,
                        partialSteps: result.steps,
                        entrySchemaErrors,
                        exitSchemaErrors,
                    };
                }
            }
            span.setStatus({ code: SpanStatusCode.OK });
            return { ...result, entrySchemaErrors, exitSchemaErrors };
        }
        finally {
            span.end();
        }
    });
}
function collectSchemaErrors(family) {
    const errors = [];
    const m = FamilyManifestSchema.safeParse(family.manifest);
    if (!m.success)
        for (const issue of m.error.issues)
            errors.push(`manifest.${issue.path.join('.')}: ${issue.message}`);
    const d = FamilyDocumentSchema.safeParse(family.document);
    if (!d.success)
        for (const issue of d.error.issues)
            errors.push(`document.${issue.path.join('.')}: ${issue.message}`);
    return errors;
}
//# sourceMappingURL=migrate-family.js.map