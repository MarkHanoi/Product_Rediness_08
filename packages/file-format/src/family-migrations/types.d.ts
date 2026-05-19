import type { FamilyDocument, FamilyEvent, FamilyManifest } from '../family-schema.js';
import type { IfcMappingFile } from '../family-schema.js';
/** Mutable, in-memory family bundle that flows through the migration
 *  chain.  Validated by `family-schema.ts` only at chain entry + chain
 *  exit; intermediate frames may transiently carry shapes that don't
 *  match the current Zod schema (that is the entire point of a
 *  migration). */
export interface RawFamily {
    manifest: FamilyManifest;
    document: FamilyDocument;
    ifcMapping?: IfcMappingFile;
    events?: readonly FamilyEvent[];
}
/** A single version-bump migrator.  `from` and `to` are the document
 *  `formatVersion` literals (e.g. `'1.0' → '1.1'`).  `apply` is pure:
 *  it returns a NEW `RawFamily` and never mutates `input`. */
export interface Migrator {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    /** Human-readable one-line summary of the breaking change. */
    readonly description: string;
    apply(input: RawFamily): RawFamily;
}
export interface ChainStep {
    readonly migratorId: string;
    readonly from: string;
    readonly to: string;
    readonly durationMs: number;
}
export type ChainResult = {
    readonly ok: true;
    readonly family: RawFamily;
    readonly steps: readonly ChainStep[];
    readonly finalVersion: string;
} | {
    readonly ok: false;
    readonly reason: 'no-path' | 'cycle' | 'migrator-threw' | 'unknown-source-version';
    readonly message: string;
    readonly partialSteps: readonly ChainStep[];
};
export declare class MigrationError extends Error {
    readonly reason: 'no-path' | 'cycle' | 'migrator-threw';
    constructor(reason: 'no-path' | 'cycle' | 'migrator-threw', message: string);
}
//# sourceMappingURL=types.d.ts.map