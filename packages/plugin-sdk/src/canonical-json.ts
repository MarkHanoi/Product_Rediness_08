// @pryzm/plugin-sdk — canonical JSON stringify (S62 D8 sidecar).
//
// Used by signing.ts to produce a byte-stable serialisation of objects
// before hashing.  The encoding follows RFC 8785 (JSON Canonicalization
// Scheme) with the simplifications PRYZM relies on:
//
//   • UTF-8 throughout.
//   • Object keys sorted lexicographically (codepoint order).
//   • No whitespace between tokens.
//   • Numbers serialised via JSON.stringify (sufficient for ints + IEEE 754
//     doubles in our payload set; we never sign over arbitrary-precision
//     numbers).
//   • `undefined` properties omitted (consistent with JSON.stringify).
//
// Cycles throw; the signing payload shape forbids cycles by construction.

export function canonicalJSONStringify(value: unknown): string {
  return serialize(value, new WeakSet());
}

function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  if (value === undefined) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new Error('canonical-json: non-finite number is not representable');
    }
    return JSON.stringify(value);
  }
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'bigint') {
    throw new Error('canonical-json: bigint is not representable');
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('canonical-json: cycle detected');
    seen.add(value);
    const parts = value.map((v) => serialize(v, seen));
    seen.delete(value);
    return `[${parts.join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) throw new Error('canonical-json: cycle detected');
    seen.add(obj);
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k], seen)}`);
    seen.delete(obj);
    return `{${parts.join(',')}}`;
  }
  throw new Error(`canonical-json: unsupported type ${t}`);
}
