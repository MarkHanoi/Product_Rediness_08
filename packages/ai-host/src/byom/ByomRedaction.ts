// @pryzm/ai-host — BYOM secret guard (C105 §4.4, C22 §BYOM-TIER).
//
// ⛔ THE RULE THIS FILE EXISTS TO MAKE HARD TO BREAK. A user-supplied provider
// key MUST NOT reach a log, a telemetry span, an error report, a project file,
// or a network request to PRYZM. Truncated is not exempt: a prefix plus a
// length is still an oracle, and "sk-ant-api03-abcd…" in a shared console is
// still the founder's key on someone else's screen.
//
// A comment saying "do not log the key" is not a guard — the repo has been
// caught before shipping a stated invariant that nothing enforced (L-809,
// L-812). So the guard is a FUNCTION that the logging path calls, and a TEST
// drives it. `assertNoSecret` throws; `redactSecrets` scrubs. Both are pure.

/** Marker thrown when a value that must never be logged is about to be logged. */
export class ByomSecretLeakError extends Error {
  readonly kind = 'byom-secret-leak' as const;
  constructor(where: string) {
    super(
      `[byom] refused to emit a value from "${where}" because it matched a provider-credential ` +
        'shape. A user-supplied API key must never reach a log, span, error report or project ' +
        'file (C105 §4.4). Emit the provider ID and the masked descriptor instead.',
    );
    this.name = 'ByomSecretLeakError';
  }
}

/**
 * Patterns that identify a provider credential in free text.
 *
 * ⚠ These are DETECTORS, not validators. A false negative here is a leak, so
 * they are deliberately broad; a false positive merely forces a caller to log
 * the masked descriptor instead, which is what it should have logged anyway.
 *
 * The generic arm at the end catches long high-entropy tokens that no vendor
 * prefix covers — that is the arm that protects providers PRYZM has not
 * enumerated, including whatever the user points a custom base URL at.
 */
const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  /sk-ant-[A-Za-z0-9_-]{8,}/,          // Anthropic
  /sk-or-[A-Za-z0-9_-]{8,}/,           // OpenRouter
  /sk-proj-[A-Za-z0-9_-]{8,}/,         // OpenAI project keys
  /sk-[A-Za-z0-9_-]{20,}/,             // OpenAI / DeepSeek classic
  /AIza[A-Za-z0-9_-]{20,}/,            // Google API keys
  /\bBearer\s+[A-Za-z0-9._-]{20,}/i,   // any bearer header that leaked into text
  /[A-Za-z0-9_-]{40,}/,                // generic high-entropy tail
]);

/** Does this string look like it contains a provider credential? */
export function looksLikeSecret(value: unknown): boolean {
  if (typeof value !== 'string' || value.length < 8) return false;
  return SECRET_PATTERNS.some(re => re.test(value));
}

/**
 * Replace anything credential-shaped with a fixed marker. Use on text that is
 * about to be shown to a human or sent anywhere — most importantly on a
 * PROVIDER'S OWN ERROR BODY, which some vendors echo the offending key into.
 */
export function redactSecrets(text: string): string {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`), '[redacted]');
  }
  return out;
}

/**
 * Throw if `value` is credential-shaped. Call this at every boundary that
 * emits — the logger, the span attribute setter, the serialiser. `where` names
 * the call site so the thrown error points at the offending code, not at this
 * file.
 */
export function assertNoSecret(value: unknown, where: string): void {
  if (looksLikeSecret(value)) throw new ByomSecretLeakError(where);
}

/**
 * The ONLY representation of a credential that may leave the vault.
 *
 * Deliberately NOT "first four characters" — a prefix identifies the vendor and
 * narrows a brute force. What a human actually needs in order to answer "is a
 * key set, and is it the one I pasted?" is: that one is set, its length, and
 * the last four characters, which is what every vendor console itself shows.
 */
export function maskCredential(secret: string): string {
  if (typeof secret !== 'string' || secret.length === 0) return '(none)';
  if (secret.length <= 4) return '••••';
  return `••••${secret.slice(-4)} (${secret.length} chars)`;
}
