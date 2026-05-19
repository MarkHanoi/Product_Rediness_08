import type { FamilyDocument, FamilyEvent, FamilyManifest } from './family-schema.js';
/** ZIP entry paths for the `.pryzm-family` v1 layout (plan §5.1). */
export declare const FAMILY_PATHS: {
    readonly manifest: "manifest.json";
    readonly document: "document.json";
    readonly eventLog: "event-log.ndjson";
    readonly ifcMapping: "ifc-mapping.json";
    readonly thumbnail: "thumbnail.webp";
    readonly icon: "icon.svg";
    readonly schemaHash: "signing/schema-hash";
    readonly signature: "signing/signature";
};
/** Schema-version literal of the family-pack format itself.  Distinct
 *  from the in-document `formatVersion` (which is the document schema
 *  version); this is bumped only when the *envelope* (paths, ZIP layout)
 *  changes.  v1 is the only version. */
export declare const FAMILY_FORMAT_SCHEMA_VERSION = 1;
/** Projected IFC binding sub-document, written to `ifc-mapping.json`. */
export interface FamilyIfcBindingExport {
    readonly formatVersion: '1.0';
    readonly bindings: readonly {
        readonly parameterId: string;
        readonly parameterName: string;
        readonly psetName: string;
        readonly propertyName: string;
    }[];
}
/** Input to `packFamily()`. */
export interface FamilyPackInput {
    readonly manifest: FamilyManifest;
    readonly document: FamilyDocument;
    /** Logical-order event log.  May be empty for a brand-new family. */
    readonly events?: readonly FamilyEvent[];
    /** Optional 256x256 WebP thumbnail bytes (plan §5.1). */
    readonly thumbnail?: Uint8Array;
    /** Optional 24x24 SVG icon bytes (plan §5.1). */
    readonly icon?: Uint8Array;
    /** Optional pre-computed signature bytes (plan §5.1).  Set this when
     *  re-packing a file that was already signed by another flow.  When
     *  `signingKey` is also provided, `signingKey` wins. */
    readonly signature?: Uint8Array;
    /** Optional Ed25519 private key.  When provided, packFamily() signs
     *  the canonical `manifest.json` bytes with it (matching the project
     *  `pack()` convention from `pack.ts`) and writes the signature into
     *  `signing/signature`.  Plan §17.1 step 5 specifies HMAC; the
     *  codebase has standardised on Ed25519 for project packs and we
     *  inherit the same primitive here for cryptographic agility. */
    readonly signingKey?: CryptoKey;
}
export interface FamilyPackTelemetry {
    readonly eventCount: number;
    readonly hasThumbnail: boolean;
    readonly hasIcon: boolean;
    readonly hasSignature: boolean;
    readonly packDurationMs: number;
}
export type FamilyPackErrorReason = 'manifest-invalid' | 'document-invalid' | 'sign-failed';
export type FamilyPackResult = {
    readonly ok: true;
    readonly bytes: Uint8Array;
    readonly byteLength: number;
    /** `sha256:<hex>` literal computed over canonical(document) + canonical(ifc-mapping). */
    readonly schemaHash: string;
    readonly telemetry: FamilyPackTelemetry;
} | {
    readonly ok: false;
    readonly reason: FamilyPackErrorReason;
    readonly message: string;
};
/** Input to `unpackFamily()`. */
export interface FamilyUnpackInput {
    readonly bytes: Uint8Array;
    /** When provided, `unpackFamily` re-derives the schema hash from the
     *  document bytes and refuses the file if it does not match. */
    readonly verifySchemaHash?: boolean;
    /** When provided, `unpackFamily` verifies the Ed25519 signature in
     *  `signing/signature` against the canonical `manifest.json` bytes
     *  (mirroring the project `unpack()` convention). */
    readonly verifyingKey?: CryptoKey;
}
export interface FamilyUnpackTelemetry {
    readonly eventCount: number;
    readonly hasThumbnail: boolean;
    readonly hasIcon: boolean;
    readonly hasSignature: boolean;
    readonly schemaHashVerified: boolean;
    readonly signatureVerified: boolean;
    readonly unpackDurationMs: number;
}
export type FamilyUnpackErrorReason = 'not-a-zip' | 'missing-manifest' | 'missing-document' | 'manifest-parse-error' | 'document-parse-error' | 'manifest-invalid' | 'document-invalid' | 'event-log-parse-error' | 'schema-hash-mismatch' | 'signature-required' | 'signature-mismatch' | 'unsupported-future-version';
export type FamilyUnpackResult = {
    readonly ok: true;
    readonly manifest: FamilyManifest;
    readonly document: FamilyDocument;
    readonly events: readonly FamilyEvent[];
    readonly ifcMapping: FamilyIfcBindingExport;
    readonly thumbnail?: Uint8Array;
    readonly icon?: Uint8Array;
    readonly signature?: Uint8Array;
    /** True iff a signature was present AND `verifyingKey` was supplied
     *  AND `subtle.verify()` returned true.  Otherwise false. */
    readonly signatureVerified: boolean;
    /** `sha256:<hex>` literal recovered (and optionally verified). */
    readonly schemaHash: string;
    readonly telemetry: FamilyUnpackTelemetry;
} | {
    readonly ok: false;
    readonly reason: FamilyUnpackErrorReason;
    readonly message: string;
};
//# sourceMappingURL=family-types.d.ts.map