// ULID ↔ raw 16-byte packing for the v2 wire format.
//
// Spec: ADR-004 §2 "ULID base-64 packing — the Crockford-base32 ULID
// compresses to 16 bytes raw; the existing string form is 26 bytes."
//
// We pack as a `Uint8Array` (MessagePack `bin` family) so the wire is
// 16 bytes flat, not a base-64 STRING (which would re-introduce ~22 B
// of overhead).  The "base-64" wording in ADR-004 was the worst-case
// ceiling; the actual chosen format is 16 raw bytes.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_INVERSE: Record<string, number> = {};
for (let i = 0; i < CROCKFORD.length; i++) {
  CROCKFORD_INVERSE[CROCKFORD[i]!] = i;
  CROCKFORD_INVERSE[CROCKFORD[i]!.toLowerCase()] = i;
}

const ULID_RE = /^[0-9A-HJ-NP-TV-Z]{26}$/i;

export function isUlid(value: unknown): value is string {
  return typeof value === 'string' && ULID_RE.test(value);
}

/**
 * Pack a 26-char Crockford-base32 ULID into 16 bytes (128 bits).
 *
 * Layout: the 26-char ULID encodes 130 bits but the leading symbol is
 * always in [0..7] (3 bits used, 2 bits zero) — total payload = 128 b.
 * We materialise the BE 128-bit integer one nibble-pair at a time.
 */
export function ulidStringToBytes(ulid: string): Uint8Array {
  if (!isUlid(ulid)) {
    throw new Error(`[ulid-pack] not a valid ULID: ${ulid}`);
  }
  // Convert each char → 5-bit value; we then pack into a 16-byte buffer
  // by walking the 130-bit stream MSB-first and writing 8 bits at a
  // time, discarding the implicit two leading zero bits.
  const out = new Uint8Array(16);
  let acc = 0;
  let bits = 0;
  let outIdx = 0;
  // Skip the top 2 bits of the leading char so we end up with exactly
  // 128 bits of payload to write.
  const first = CROCKFORD_INVERSE[ulid[0]!]!;
  acc = first & 0b00111;
  bits = 3;
  for (let i = 1; i < ulid.length; i++) {
    const v = CROCKFORD_INVERSE[ulid[i]!]!;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (acc >>> bits) & 0xff;
      acc = acc & ((1 << bits) - 1);
    }
  }
  if (outIdx !== 16) {
    throw new Error(`[ulid-pack] internal: produced ${outIdx} bytes, expected 16.`);
  }
  return out;
}

/** Inverse of `ulidStringToBytes`.  16 raw bytes → 26-char Crockford ULID. */
export function ulidBytesToString(bytes: Uint8Array): string {
  if (bytes.byteLength !== 16) {
    throw new Error(`[ulid-pack] expected 16 bytes, got ${bytes.byteLength}.`);
  }
  // Read 128 bits LSB-first into a stream, prepend two zero bits, then
  // emit 26 base-32 symbols MSB-first.
  let acc = 0;
  let bits = 0;
  const symbols: number[] = [];
  // Prepend the two zero bits that the leading ULID symbol always has.
  acc = 0;
  bits = 2;
  for (let i = 0; i < 16; i++) {
    acc = (acc << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      symbols.push((acc >>> bits) & 0b11111);
      acc = acc & ((1 << bits) - 1);
    }
  }
  if (symbols.length !== 26) {
    throw new Error(`[ulid-pack] internal: produced ${symbols.length} symbols, expected 26.`);
  }
  return symbols.map((s) => CROCKFORD[s]).join('');
}

/** Pure-string base64 view of a packed ULID — kept for diagnostics, not the wire. */
export function ulidStringToBase64(ulid: string): string {
  const bytes = ulidStringToBytes(ulid);
  // Avoid `Buffer` so this works in browser bundles too.
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return globalThis.btoa(binary);
}

export function base64ToUlid(b64: string): string {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return ulidBytesToString(bytes);
}
