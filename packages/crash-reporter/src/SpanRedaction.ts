// @pryzm/crash-reporter — span redaction (§OBS-TRACING-REACHABLE, L-9960).
//
// ⛔ THE RULE THIS FILE EXISTS TO MAKE HARD TO BREAK.
//
// Turning tracing ON turns 1 766 `span.setAttribute(...)` call sites across
// 328 files into a NETWORK EGRESS PATH. Every one of them was authored under
// a no-op tracer, i.e. authored by people who could not have leaked anything
// because nothing was collected. The moment a provider is registered, that
// assumption inverts: an attribute is a thing that leaves the user's browser.
//
// A comment saying "do not put user content in a span" is not a guard — this
// repo has been caught shipping stated invariants that nothing enforced
// (L-809, L-812). So the guard is a FUNCTION on the export path that every
// span passes through, and tests drive it.
//
// ⚠ THE BYOM CASE IS THE LOAD-BEARING ONE. `packages/ai-host/src/byom/` lets a
// user paste their OWN provider API key; C105 §4.4 binds that the key MUST NOT
// reach "a log, a telemetry span, an error report, a project file, or a network
// request to PRYZM". Measured 2026-08-23: the BYOM path carries ZERO spans, so
// today the key cannot reach one. That is a property of the CURRENT call graph,
// not an invariant — one `span.setAttribute('pryzm.byom.header', authHeader)`
// added by a future lane would break it silently. This file makes the containment
// hold at the EXPORT boundary regardless of what any call site does, which is the
// only place it can be made unconditional.
//
// Detector patterns are duplicated from `packages/ai-host/src/byom/ByomRedaction.ts`
// ON PURPOSE and NOT imported: crash-reporter is L1 (`eslint.config.js:130`) and
// `ai-host` is L2 — importing upward is a layer violation, and the exporter must
// work in a bundle that does not contain ai-host at all. The duplication is
// pinned by `__tests__/SpanRedaction.test.ts`, which drives the SAME corpus.

import type { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { Context } from '@opentelemetry/api';

/** Marker substituted for anything credential-shaped. */
export const REDACTED = '[redacted]';
/** Marker substituted for an address-shaped value. */
export const REDACTED_EMAIL = '[redacted-email]';
/** Marker appended when a value was truncated for size. */
export const TRUNCATED = '…[truncated]';

/**
 * Longest string an attribute value may carry. A span attribute is a LABEL,
 * not a payload — anything longer is someone serialising a model, a prompt or
 * a file into telemetry. 256 chars comfortably fits every attribute this repo
 * actually sets (all ids, counts, enums and status strings) while making an
 * accidental payload dump structurally impossible.
 */
export const MAX_ATTRIBUTE_CHARS = 256;

/**
 * Credential detectors. DELIBERATELY BROAD — a false negative here is a leak;
 * a false positive costs a `[redacted]` in a dashboard.
 *
 * The generic high-entropy arm at the end is what protects providers PRYZM has
 * not enumerated, including whatever base URL a BYOM user points at.
 */
const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /sk-or-[A-Za-z0-9_-]{8,}/g, // OpenRouter
  /sk-proj-[A-Za-z0-9_-]{8,}/g, // OpenAI project keys
  /sk-[A-Za-z0-9_-]{20,}/g, // OpenAI / DeepSeek classic
  /AIza[A-Za-z0-9_-]{20,}/g, // Google API keys
  /gsk_[A-Za-z0-9_-]{20,}/g, // Groq
  /xai-[A-Za-z0-9_-]{20,}/g, // xAI
  /\bBearer\s+[A-Za-z0-9._-]{20,}/gi, // any bearer header that leaked into text
  /\beyJ[A-Za-z0-9._-]{20,}/g, // JWT (session tokens)
  /[A-Za-z0-9_-]{40,}/g, // generic high-entropy tail
]);

/** RFC-ish address detector — covers `PRYZM_OWNER_EMAIL` and every end user. */
const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Attribute KEYS whose value is dropped whole, no matter what it looks like.
 * Matching is case-insensitive substring on the key. These name things that
 * are content or credentials BY DEFINITION, so pattern-scrubbing the value is
 * not enough — a short prompt matches no pattern at all.
 *
 * ⚠ Note what is NOT here: `id`, `count`, `status`, `kind`, `type`. Those are
 * the attributes the 1 766 existing call sites actually set, and they are the
 * reason a trace is worth collecting. Redaction that deletes the signal is a
 * different way of shipping nothing.
 */
const DENIED_KEY_FRAGMENTS: readonly string[] = Object.freeze([
  'apikey',
  'api_key',
  'secret',
  'password',
  'passwd',
  'credential',
  'token',
  'authorization',
  'auth_header',
  'cookie',
  'session',
  'email',
  'prompt',
  'utterance',
  'user_text',
  'usertext',
  'content',
  'body',
  'payload',
  'snapshot',
  'filename',
  'file_name',
  'filepath',
  'file_path',
]);

function keyIsDenied(key: string): boolean {
  const k = key.toLowerCase().replace(/[.\-\s]/g, '_');
  return DENIED_KEY_FRAGMENTS.some(f => k.includes(f));
}

/** True when the string carries something credential-shaped. */
export function looksLikeSecret(value: string): boolean {
  if (typeof value !== 'string' || value.length < 8) return false;
  return SECRET_PATTERNS.some(re => {
    re.lastIndex = 0;
    return re.test(value);
  });
}

/**
 * Scrub one string: credentials → `[redacted]`, addresses → `[redacted-email]`,
 * then hard-truncate. Pure; safe to call on anything.
 */
export function redactString(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return text;
  let out = text;
  for (const re of SECRET_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, REDACTED);
  }
  EMAIL_PATTERN.lastIndex = 0;
  out = out.replace(EMAIL_PATTERN, REDACTED_EMAIL);
  if (out.length > MAX_ATTRIBUTE_CHARS) {
    out = out.slice(0, MAX_ATTRIBUTE_CHARS) + TRUNCATED;
  }
  return out;
}

/**
 * Scrub an attribute bag IN PLACE. Numbers and booleans pass through untouched
 * — they cannot carry a key or an address, and they are the whole point of the
 * instrumentation (counts, durations, ratios).
 *
 * Returns the number of values changed, so a caller (or a test) can assert.
 */
export function redactAttributesInPlace(attrs: Record<string, unknown>): number {
  let changed = 0;
  for (const key of Object.keys(attrs)) {
    if (keyIsDenied(key)) {
      if (attrs[key] !== REDACTED) {
        attrs[key] = REDACTED;
        changed++;
      }
      continue;
    }
    const v = attrs[key];
    if (typeof v === 'string') {
      const next = redactString(v);
      if (next !== v) {
        attrs[key] = next;
        changed++;
      }
    } else if (Array.isArray(v)) {
      let arrChanged = false;
      const next = v.map(item => {
        if (typeof item !== 'string') return item;
        const s = redactString(item);
        if (s !== item) arrChanged = true;
        return s;
      });
      if (arrChanged) {
        attrs[key] = next;
        changed++;
      }
    }
  }
  return changed;
}

/**
 * A `SpanProcessor` that scrubs every finished span before handing it to the
 * delegate (which is what actually batches + exports).
 *
 * ⚠ It sits BETWEEN the SDK and the exporter, not beside it, so there is no
 * ordering in which an unscrubbed span reaches the wire: the exporter is only
 * ever reachable through this object.
 *
 * Scrubs, in order: the span NAME (repo convention is a static `pryzm.*`
 * literal, but `updateName()` exists and a name is exported too), the
 * attribute bag, and every event's name + attributes.
 */
export class RedactingSpanProcessor implements SpanProcessor {
  constructor(private readonly delegate: SpanProcessor) {}

  onStart(span: Span, parentContext: Context): void {
    this.delegate.onStart(span, parentContext);
  }

  onEnd(span: ReadableSpan): void {
    redactSpanInPlace(span);
    this.delegate.onEnd(span);
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush();
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
}

/**
 * Scrub a finished span in place. Exported so a test can drive it directly
 * without standing up a provider.
 */
export function redactSpanInPlace(span: ReadableSpan): void {
  const mutable = span as unknown as {
    name: string;
    attributes: Record<string, unknown>;
    events?: Array<{ name: string; attributes?: Record<string, unknown> }>;
  };
  if (typeof mutable.name === 'string') mutable.name = redactString(mutable.name);
  if (mutable.attributes) redactAttributesInPlace(mutable.attributes);
  if (Array.isArray(mutable.events)) {
    for (const ev of mutable.events) {
      if (typeof ev.name === 'string') ev.name = redactString(ev.name);
      if (ev.attributes) redactAttributesInPlace(ev.attributes);
    }
  }
}
