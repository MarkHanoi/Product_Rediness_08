/**
 * IFC `GloballyUniqueId` helpers.
 *
 * IFC GUIDs are 22-character base64-style encodings of 128-bit UUIDs using the
 * alphabet `0-9 A-Z a-z _ $`. We rely on `web-ifc`'s native helper for IFC
 * GUID minting (it follows buildingSMART's exact base64 alphabet) and only
 * roll our own when callers need deterministic IDs in tests.
 *
 * `globalIdFromUuid` is a port of buildingSMART's reference algorithm:
 *   - Split the 128-bit UUID into 21-bit chunks (right-aligned, MSB-first).
 *   - Encode each chunk into 1, 2, 3, 3, 3, 3, 3, 3 base64 characters
 *     (totalling 22 characters).
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

const CHUNK_SIZES: ReadonlyArray<number> = [2, 10, 10, 10, 10, 10, 10, 10] as const;

function encodeChunk(value: number, chars: number): string {
  let out = '';
  let v = value;
  for (let i = 0; i < chars; i += 1) {
    out = ALPHABET[v & 0x3f] + out;
    v >>>= 6;
  }
  return out;
}

/**
 * Convert a canonical UUID string (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) to
 * a 22-character IFC `GloballyUniqueId`.
 */
export function globalIdFromUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`Invalid UUID: ${uuid}`);
  }

  // Split the 128-bit hex into 8 chunks per buildingSMART spec.
  // Chunk lengths in HEX nibbles (bits / 4): [2, 10, 10, 10, 10, 10, 10, 10]
  // Total = 2 + 10*7 = 72 bits encoded distinctly… but we actually pack the
  // 128-bit value into 1-base64 + 7×3-base64 = 22 chars. The classic ref
  // implementation re-splits the hex into [8,4,4,4,4,4,4]-style → [2,10..],
  // then encodes the first chunk into 1 base64 char and the rest into 3.
  // For simplicity (and to avoid 64-bit math), we encode the 128-bit hex via
  // BigInt then split into the 8 chunk values.
  const big = BigInt('0x' + hex);
  const chunks: number[] = new Array(CHUNK_SIZES.length);
  let remaining = big;
  for (let i = CHUNK_SIZES.length - 1; i >= 0; i -= 1) {
    const size = CHUNK_SIZES[i] ?? 0;
    const chars = i === 0 ? 1 : 3;
    const mask = (1n << BigInt(chars * 6)) - 1n;
    chunks[i] = Number(remaining & mask);
    remaining >>= BigInt(chars * 6);
    void size;
  }
  if (remaining !== 0n) {
    // 128 bits = 1*6 + 7*18 = 132 bits of encoding space; the top 4 bits are
    // implicitly zero in any IFC GUID.
  }

  let out = '';
  for (let i = 0; i < chunks.length; i += 1) {
    const chars = i === 0 ? 1 : 3;
    out += encodeChunk(chunks[i] ?? 0, chars);
  }
  return out;
}

const HEX_CHARS = '0123456789abcdef';
function toHex(byte: number): string {
  return (HEX_CHARS[(byte >>> 4) & 0xf] ?? '0') + (HEX_CHARS[byte & 0xf] ?? '0');
}

/**
 * Tiny deterministic UUID builder for tests — accepts a seed string and emits
 * a UUIDv4-shaped value. Not cryptographically random; suitable only for
 * golden-file fixtures.
 */
export function deterministicUuid(seed: string): string {
  const bytes = new Uint8Array(16);
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = (h >>> ((i % 4) * 8)) & 0xff;
    if (i % 4 === 3) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      h >>>= 0;
    }
  }
  // Version 4 + RFC 4122 variant bits.
  bytes[6] = (((bytes[6] ?? 0) & 0x0f) | 0x40) & 0xff;
  bytes[8] = (((bytes[8] ?? 0) & 0x3f) | 0x80) & 0xff;
  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) hex.push(toHex(bytes[i] ?? 0));
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
