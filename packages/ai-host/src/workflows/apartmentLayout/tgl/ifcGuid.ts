// TGL — deterministic IFC GlobalId (SPEC §3.4 / §6).
//
// Every graph node needs a STABLE identity: re-running the generator on the same
// input must reproduce the same GUIDs, so diffs, versioning and digital-twin links
// stay valid. We therefore DERIVE the 128-bit id from a hash of (seed, role,
// index, geomKey) — never `crypto.randomUUID()` / `Date.now()` — and encode it as a
// 22-char IFC-compressed GlobalId (buildingSMART base64 variant). Pure, no I/O.

const MASK64 = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/** 64-bit FNV-1a over the UTF-16 code units of `s` (deterministic, no deps). */
function fnv1a64(s: string): bigint {
    let h = FNV_OFFSET;
    for (let i = 0; i < s.length; i++) {
        h ^= BigInt(s.charCodeAt(i));
        h = (h * FNV_PRIME) & MASK64;
    }
    return h;
}

// IFC GlobalId alphabet (note: '0'-'9','A'-'Z','a'-'z','_','$').
const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

/** Compress a 128-bit value (as a bigint) to the 22-char IFC GlobalId string. */
function ifcCompress(n128: bigint): string {
    const n = n128 & ((1n << 128n) - 1n);
    const out: string[] = [Number((n >> 126n) & 0x3n) | 0].map(i => B64[i]!); // top 2 bits
    for (let i = 0; i < 21; i++) {
        const shift = BigInt(120 - i * 6);
        out.push(B64[Number((n >> shift) & 0x3fn)]!);
    }
    return out.join('');
}

/**
 * Deterministic IFC GlobalId for a node. `seed` scopes a generation run; `role`
 * is the node kind ('Space', 'Wall', …); `index` disambiguates same-role nodes;
 * `geomKey` ties the id to the node's source identity (room/wall id). Same inputs
 * ⇒ same GUID, always.
 */
export function ifcGuid(seed: string, role: string, index: number, geomKey: string): string {
    const base = `${seed}|${role}|${index}|${geomKey}`;
    const hi = fnv1a64(base);
    const lo = fnv1a64(`${base}|#`);              // second hash for the low 64 bits
    return ifcCompress((hi << 64n) | lo);
}
