export declare class CanonicalJsonError extends Error {
    constructor(message: string);
}
export declare function canonicalise(value: unknown): string;
/** Encode a canonicalised JSON value as UTF-8 bytes. */
export declare function canonicaliseBytes(value: unknown): Uint8Array;
//# sourceMappingURL=canonical-json.d.ts.map