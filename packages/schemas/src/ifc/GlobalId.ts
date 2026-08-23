/**
 * `IfcGloballyUniqueId` — the ONE encoder/validator for the whole repo (L0, pure).
 *
 * ## Why this lives here
 *
 * Before L-8500 there were **two independent IFC export pipelines** and neither
 * shared a GUID minter:
 *
 *   - `packages/file-format/src/export/ifc/**` (Pipeline A — what the app runs)
 *     wrote `crypto.randomUUID()` — a **36-character hyphenated UUID** — verbatim
 *     into `GlobalId`, through an "encoder" that was an identity function
 *     (`const gi = (v: string) => v`). Every file Pipeline A ever produced was
 *     **schema-invalid**: `IfcGloballyUniqueId` is a 22-character base64 string.
 *   - `plugins/ifc-export/src/guid.ts` (Pipeline B — unreachable from production)
 *     held a **correct** buildingSMART encoder with zero production call sites.
 *
 * The fix is not "copy the good one into the bad one" — that mints a third copy
 * and lets a fourth diverge later. Both pipelines now import THIS module. It sits
 * at L0 so that L3 (`@pryzm/file-format`) and L6 (`@pryzm/plugin-ifc-export`) can
 * both reach it downward; no other placement is layer-legal for both.
 *
 * ADR-0362 (pipeline convergence) · ADR-0363 (GlobalId stability) · C25 §3.
 *
 * ## Purity
 *
 * Zero imports. No I/O, no THREE, no DOM, no `crypto`. Every function here is a
 * pure function of its arguments — which is precisely what makes
 * {@link globalIdFromStableKey} a *stability* mechanism rather than a lottery.
 */

/** An `IfcGloballyUniqueId` is exactly 22 characters. */
export const IFC_GLOBAL_ID_LENGTH = 22;

/**
 * buildingSMART's base64 alphabet for `IfcGloballyUniqueId`.
 * NOT RFC 4648 base64 — the last two symbols are `_` and `$`, and there is no
 * padding.
 */
export const IFC_GLOBAL_ID_ALPHABET =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

const ALPHABET_INDEX: Readonly<Record<string, number>> = /* @__PURE__ */ (() => {
    const m: Record<string, number> = {};
    for (let i = 0; i < IFC_GLOBAL_ID_ALPHABET.length; i += 1) {
        m[IFC_GLOBAL_ID_ALPHABET[i] as string] = i;
    }
    return m;
})();

const UUID_RE = /^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$/;

/**
 * True when `value` is a syntactically valid `IfcGloballyUniqueId`.
 *
 * Three conditions, all of them load-bearing:
 *   1. exactly 22 characters;
 *   2. every character is in {@link IFC_GLOBAL_ID_ALPHABET};
 *   3. the FIRST character encodes only the top 2 bits of the 128-bit value, so
 *      it can never exceed `'3'`. A 22-character string starting with `'4'`
 *      would decode to more than 128 bits and is not a legal GlobalId.
 *
 * Condition 3 is the one hand-rolled validators forget.
 */
export function isIfcGlobalId(value: unknown): value is string {
    if (typeof value !== 'string' || value.length !== IFC_GLOBAL_ID_LENGTH) return false;
    for (let i = 0; i < IFC_GLOBAL_ID_LENGTH; i += 1) {
        const idx = ALPHABET_INDEX[value[i] as string];
        if (idx === undefined) return false;
        if (i === 0 && idx > 3) return false;
    }
    return true;
}

function encodeChunk(value: number, chars: number): string {
    let out = '';
    let v = value;
    for (let i = 0; i < chars; i += 1) {
        out = (IFC_GLOBAL_ID_ALPHABET[v & 0x3f] as string) + out;
        v >>>= 6;
    }
    return out;
}

/**
 * Convert a canonical UUID (hyphenated or bare hex) into a 22-character
 * `IfcGloballyUniqueId`, per buildingSMART's reference algorithm.
 *
 * The 128-bit value is emitted MSB-first as 1 base64 character (top 2 bits) plus
 * 7 groups of 3 characters (18 bits each) — 1 + 21 = 22 characters.
 *
 * @throws `Error` when `uuid` is not 32 hex digits.
 */
export function globalIdFromUuid(uuid: string): string {
    const hex = uuid.replace(/-/g, '');
    if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) {
        throw new Error(`[ifc/GlobalId] not a UUID: ${JSON.stringify(uuid)}`);
    }

    let remaining = BigInt('0x' + hex);
    const chunks: number[] = new Array(8);
    for (let i = 7; i >= 0; i -= 1) {
        const chars = i === 0 ? 1 : 3;
        const mask = (1n << BigInt(chars * 6)) - 1n;
        chunks[i] = Number(remaining & mask);
        remaining >>= BigInt(chars * 6);
    }

    let out = '';
    for (let i = 0; i < 8; i += 1) {
        out += encodeChunk(chunks[i] ?? 0, i === 0 ? 1 : 3);
    }
    return out;
}

/**
 * Inverse of {@link globalIdFromUuid}. Exists so tests can prove the encoding is
 * bijective rather than merely well-shaped, and so importers can recover the
 * underlying 128-bit identity.
 *
 * @throws `Error` when `globalId` fails {@link isIfcGlobalId}.
 */
export function uuidFromGlobalId(globalId: string): string {
    if (!isIfcGlobalId(globalId)) {
        throw new Error(`[ifc/GlobalId] not an IfcGloballyUniqueId: ${JSON.stringify(globalId)}`);
    }
    let big = BigInt(ALPHABET_INDEX[globalId[0] as string] as number);
    for (let i = 1; i < IFC_GLOBAL_ID_LENGTH; i += 1) {
        big = (big << 6n) | BigInt(ALPHABET_INDEX[globalId[i] as string] as number);
    }
    const hex = big.toString(16).padStart(32, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Deterministic derivation — the STABILITY half
// ---------------------------------------------------------------------------

/** 32-bit avalanche finalizer (MurmurHash3's `fmix32`). */
function fmix32(h: number): number {
    let x = h >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return x >>> 0;
}

/** FNV-1a over the UTF-16 code units of `key`, seeded by `offsetBasis`. */
function fnv1a32(key: string, offsetBasis: number): number {
    let h = offsetBasis >>> 0;
    for (let i = 0; i < key.length; i += 1) {
        const c = key.charCodeAt(i);
        // Feed both bytes so keys differing only above U+00FF still separate.
        h = Math.imul(h ^ (c & 0xff), 0x01000193) >>> 0;
        h = Math.imul(h ^ ((c >>> 8) & 0xff), 0x01000193) >>> 0;
    }
    return fmix32(h);
}

/**
 * Four independently-seeded FNV-1a lanes, each avalanched, concatenated into a
 * 128-bit value and rendered as a canonical UUID string.
 *
 * The lane seeds are arbitrary distinct constants; what matters is that they are
 * FIXED FOREVER. Changing any of them silently re-mints every derived GlobalId
 * in every project — the exact churn this function exists to prevent.
 */
export function stableUuidFromKey(key: string): string {
    const lanes = [
        fnv1a32(key, 0x811c9dc5),
        fnv1a32(key, 0x1b873593),
        fnv1a32(key, 0xcc9e2d51),
        fnv1a32(key, 0xe6546b64),
    ];
    const hex = lanes.map((l) => l.toString(16).padStart(8, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Derive a **stable** `IfcGloballyUniqueId` from any stable string key.
 *
 * ⭐ This is the mechanism that replaces the "persistent PRYZM-id → GlobalId map"
 * the audit asked for. A map has to be persisted, migrated, and garbage-collected,
 * and it is wrong the moment it is not saved. A pure derivation from an identifier
 * that is ALREADY persistent and ALREADY stable (the PRYZM element id) is stable
 * **by construction** — there is no state to lose. See ADR-0363.
 *
 * Callers must pass a key that is stable for the life of the thing being named,
 * and unique across the file. Convention used by both pipelines:
 *
 *   element        `el:<pryzmElementId>`
 *   opening        `opening:<hostWallId>:<hostedId>`
 *   relationship   `<relKind>:<subjectKey>`  e.g. `relvoids:wall_1:door_2`
 *   property set   `pset:<ownerKey>:<psetName>`
 */
export function globalIdFromStableKey(key: string): string {
    return globalIdFromUuid(stableUuidFromKey(key));
}

/**
 * ⭐ **The single coercion every IFC write site must go through.**
 *
 * Returns a value that is guaranteed to satisfy {@link isIfcGlobalId}, from
 * whatever the upstream model happened to carry:
 *
 *   - already a valid 22-char GlobalId (e.g. round-tripped from an imported IFC
 *     file) → **preserved verbatim**, which is what makes import → edit → export
 *     keep its identity;
 *   - a canonical UUID (what `createIfcMetadata()` mints) → encoded;
 *   - anything else, including `null`/`undefined`/`''` → derived from
 *     `stableKey`.
 *
 * Because the fallback is a *derivation* and not a random draw, an element with
 * no persisted `ifcData.guid` still exports the same GlobalId on every run.
 *
 * @param value     Whatever identity the model carries. May be absent.
 * @param stableKey Stable, unique key used when `value` cannot be used.
 */
export function toIfcGlobalId(value: string | null | undefined, stableKey: string): string {
    if (isIfcGlobalId(value)) return value;
    if (typeof value === 'string' && UUID_RE.test(value)) return globalIdFromUuid(value);
    return globalIdFromStableKey(stableKey);
}
