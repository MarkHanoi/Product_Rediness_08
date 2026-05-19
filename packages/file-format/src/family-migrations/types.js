// .pryzm-family migration framework — public types (S57 deliverable).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §5.5 + §19.6.
// Migrators lift an older `.pryzm-family` document into the current
// shape.  Each migrator is a single version-bump unit.
export class MigrationError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
        this.name = 'MigrationError';
    }
}
//# sourceMappingURL=types.js.map