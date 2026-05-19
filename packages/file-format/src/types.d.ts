import type { Manifest } from '@pryzm/persistence-client';
import type { PersistedEvent } from '@pryzm/persistence-client';
/** Number of events per `events/NNNNNN.evt.bin` batch.  Frozen by ADR-0018. */
export declare const EVENT_BATCH_SIZE = 1000;
/** Current schema version of the .pryzm format.  Frozen by ADR-0018. */
export declare const PRYZM_FORMAT_SCHEMA_VERSION = 1;
/** ZIP entry paths.  Centralised to keep pack/unpack/cli in lockstep. */
export declare const PATHS: {
    readonly manifest: "manifest.json";
    readonly eventsDir: "events/";
    readonly chunksDir: "chunks/";
    readonly thumbnail: "thumbnails/project.png";
    readonly signature: "signatures/manifest.sig";
};
/**
 * Input to `pack()`.  `events` MUST be ordered by `event.id` (ULIDs
 * sort lexicographically by creation time, so this is the natural
 * order).  `chunks` MUST contain every hash referenced by the
 * manifest's `chunks[]` and `levels[].latestChunkHash` fields; pack
 * will reject the call if a referenced chunk is missing.
 */
export interface PackInput {
    /** The fully-populated, validated manifest.  Will be re-validated on pack. */
    readonly manifest: Manifest;
    /** ULID-ordered event log.  May be empty for a brand-new project. */
    readonly events: readonly PersistedEvent[];
    /** Content-addressed chunk bytes (hash → GLB bytes). */
    readonly chunks: ReadonlyMap<string, Uint8Array>;
    /** Optional 512x512 PNG thumbnail bytes. */
    readonly thumbnail?: Uint8Array;
    /**
     * Optional Ed25519 signing key (Web Crypto `CryptoKey`, must be a
     * private key with `usages: ['sign']`).  When provided, the
     * resulting `.pryzm` includes `signatures/manifest.sig`.  Off by
     * default in Phase 1 — opt-in via `{ signingKey }`.
     */
    readonly signingKey?: CryptoKey;
}
/** Telemetry attached to a successful `pack()` call. */
export interface PackTelemetry {
    /** Number of `events/NNNNNN.evt.bin` files written. */
    readonly eventBatchCount: number;
    /** Number of `chunks/<hash>.glb` files written. */
    readonly chunkCount: number;
    /** Whether `thumbnails/project.png` was included. */
    readonly hasThumbnail: boolean;
    /** Whether `signatures/manifest.sig` was included. */
    readonly hasSignature: boolean;
    /** Wall-clock ms from call entry to `bytes` ready. */
    readonly packDurationMs: number;
}
/** Result of `pack()`. */
export type PackResult = {
    readonly ok: true;
    readonly bytes: Uint8Array;
    readonly byteLength: number;
    readonly telemetry: PackTelemetry;
} | {
    readonly ok: false;
    readonly reason: PackErrorReason;
    readonly message: string;
};
export type PackErrorReason = 'manifest-invalid' | 'missing-chunk' | 'sign-failed';
/** Input to `unpack()`. */
export interface UnpackInput {
    /** The bytes of a `.pryzm` ZIP file. */
    readonly bytes: Uint8Array;
    /**
     * Optional Ed25519 verifying key.  When provided AND a signature is
     * present in the ZIP, the signature is verified.  When provided and
     * NO signature is present, unpack fails with `signature-required`.
     * When omitted, signature verification is skipped (signature must
     * still parse if present).
     */
    readonly verifyingKey?: CryptoKey;
}
/** Result of `unpack()`. */
export type UnpackResult = {
    readonly ok: true;
    readonly manifest: Manifest;
    readonly events: readonly PersistedEvent[];
    readonly chunks: ReadonlyMap<string, Uint8Array>;
    readonly thumbnail: Uint8Array | undefined;
    readonly hasSignature: boolean;
    readonly signatureVerified: boolean;
    readonly telemetry: UnpackTelemetry;
} | {
    readonly ok: false;
    readonly reason: UnpackErrorReason;
    readonly message: string;
};
export type UnpackErrorReason = 'not-a-zip' | 'missing-manifest' | 'manifest-parse-error' | 'manifest-invalid' | 'event-batch-decode-error' | 'chunk-name-invalid' | 'signature-required' | 'signature-mismatch' | 'migration-failed' | 'unsupported-future-version';
/** Telemetry attached to a successful `unpack()` call. */
export interface UnpackTelemetry {
    readonly eventCount: number;
    readonly chunkCount: number;
    readonly hasThumbnail: boolean;
    readonly hasSignature: boolean;
    readonly signatureVerified: boolean;
    readonly migratedFromVersion: number | null;
    readonly unpackDurationMs: number;
}
//# sourceMappingURL=types.d.ts.map