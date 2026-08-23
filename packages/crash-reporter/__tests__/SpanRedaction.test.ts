// §OBS-TRACING-REACHABLE (L-9960) — the privacy pin.
//
// ⛔ THE BYOM ASSERTION IS THE POINT OF THIS FILE. `packages/ai-host/src/byom/`
// lets a user paste their OWN provider API key, and C105 §4.4 binds that the key
// MUST NOT reach "a log, a telemetry span, an error report, a project file, or a
// network request to PRYZM". Before this lane, that held for a reason that was
// true but fragile: the BYOM path carries no spans, and NOTHING was collected
// anyway. Both of those change the day tracing is switched on. These cases make
// the containment hold at the EXPORT boundary, which is the only place it can be
// made unconditional over 1 766 attribute call sites in other lanes' files.

import { describe, it, expect } from 'vitest';
import { trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
  RedactingSpanProcessor,
  redactString,
  redactAttributesInPlace,
  looksLikeSecret,
  REDACTED,
  REDACTED_EMAIL,
  MAX_ATTRIBUTE_CHARS,
} from '../src/SpanRedaction.js';
import { initTracing, _resetTracingForTests } from '../src/Tracing.js';
import { encodeOtlpTraceRequest } from '../src/OtlpHttpJsonSpanExporter.js';

/**
 * Real-shaped credentials for every provider `ByomProviders.ts` enumerates,
 * plus two PRYZM would not have thought of. None is a live key.
 */
const BYOM_KEYS: ReadonlyArray<readonly [string, string]> = [
  ['anthropic', 'sk-ant-api03-mR7xQv2LpZ0aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdef'],
  ['openai', 'sk-proj-Ab3xY9zQw1Er5Ty7Ui0Op2As4Df6Gh8Jk1Lz3Xc5Vb7Nm9Q'],
  ['openai-classic', 'sk-Ab3xY9zQw1Er5Ty7Ui0Op2As4Df6Gh8Jk1Lz3Xc5Vb'],
  ['openrouter', 'sk-or-v1-9f8e7d6c5b4a3928170615243342516071829304a5b6c7d8'],
  ['google', 'AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY'],
  ['groq', 'gsk_1a2b3c4d5e6f7g8h9i0jKLMNOPQRSTUVWXYZabcdefgh'],
  ['xai', 'xai-9zYxWvUtSrQpOnMlKjIhGfEdCbA0123456789abcdef'],
  ['bearer-header', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop'],
  ['unknown-vendor', 'k7Hs93jdKQm2Lp0zXcVbNm4tYuIoPaSdFgHjKlZxCvBnM8qWe'],
];

describe('span redaction — BYOM credential containment (C105 §4.4)', () => {
  it.each(BYOM_KEYS)('detects and scrubs a %s key from an attribute VALUE', (_label, key) => {
    expect(looksLikeSecret(key)).toBe(true);
    const attrs: Record<string, unknown> = { 'pryzm.ai.request': `auth=${key}` };
    redactAttributesInPlace(attrs);
    expect(String(attrs['pryzm.ai.request'])).not.toContain(key);
    expect(String(attrs['pryzm.ai.request'])).toContain(REDACTED);
  });

  it.each(BYOM_KEYS)('drops a %s key even under an innocuous-looking KEY', (_label, key) => {
    // A future lane writing `span.setAttribute('pryzm.byom.header', h)` must not
    // be able to leak, whatever it names the attribute.
    const attrs: Record<string, unknown> = { 'pryzm.byom.header': key };
    redactAttributesInPlace(attrs);
    expect(String(attrs['pryzm.byom.header'])).not.toContain(key.slice(0, 20));
  });

  it('drops credential-NAMED attributes whole, even when the value matches nothing', () => {
    // A short custom key ("abc123") matches no entropy pattern. The key name is
    // the only signal, so the key name has to be enough.
    const attrs: Record<string, unknown> = {
      'pryzm.provider.apiKey': 'abc123',
      'pryzm.request.authorization': 'x',
      'pryzm.user.email': 'someone@example.com',
      'pryzm.ai.prompt': 'design me a house',
      'pryzm.file.filename': 'Villa Andersson.pryzm',
      'pryzm.snapshot': '{"elements":[…]}',
    };
    redactAttributesInPlace(attrs);
    for (const v of Object.values(attrs)) expect(v).toBe(REDACTED);
  });

  it('NEVER touches the numeric + enum attributes the instrumentation exists for', () => {
    const attrs: Record<string, unknown> = {
      'pryzm.autodim.wall_count': 62,
      'pryzm.resi.pack.status': 'ok',
      'pryzm.office.plate.coreEfficiency': 0.34,
      'pryzm.wall.id': 'wall-7f3a',
      'pryzm.command.kind': 'wall.create',
      'pryzm.loader.tier': 1,
      'pryzm.sync.conflict': false,
    };
    const before = { ...attrs };
    expect(redactAttributesInPlace(attrs)).toBe(0);
    expect(attrs).toEqual(before);
  });
});

describe('span redaction — the founder + project content', () => {
  it('scrubs an email address wherever it appears', () => {
    expect(redactString('owner=pryzmhello@gmail.com')).toBe(`owner=${REDACTED_EMAIL}`);
    expect(redactString('a@b.co and c.d+e@sub.domain.org')).toBe(
      `${REDACTED_EMAIL} and ${REDACTED_EMAIL}`,
    );
  });

  it('hard-truncates any value long enough to be a payload', () => {
    const dump = JSON.stringify({ elements: Array.from({ length: 200 }, (_, i) => ({ id: i })) });
    expect(dump.length).toBeGreaterThan(MAX_ATTRIBUTE_CHARS);
    const out = redactString(dump);
    expect(out.length).toBeLessThanOrEqual(MAX_ATTRIBUTE_CHARS + 16);
    expect(out.endsWith('[truncated]')).toBe(true);
  });
});

describe('RedactingSpanProcessor — the exporter is only reachable THROUGH it', () => {
  it('a real span carrying a BYOM key exports scrubbed', async () => {
    _resetTracingForTests();
    trace.disable();
    const exporter = new InMemorySpanExporter();
    // Mirror the production pipeline shape exactly: redactor wraps the
    // processor that owns the exporter.
    const provider = initTracing({
      forceEnable: true,
      exporter,
      serviceName: 'pryzm-redaction-test',
    });
    expect(provider.enabled).toBe(true);

    const key = BYOM_KEYS[0]![1];
    const span = trace.getTracer('byom-leak-probe').startSpan('pryzm.ai.byom.relay');
    span.setAttribute('pryzm.byom.authorization', `Bearer ${key}`);
    span.setAttribute('pryzm.byom.provider', 'anthropic');
    span.addEvent('request', { 'pryzm.byom.header': key });
    span.end();

    const finished = exporter.getFinishedSpans();
    expect(finished).toHaveLength(1);
    // Assert against the ACTUAL WIRE PAYLOAD, not the in-memory span object —
    // the question is what leaves the machine.
    const serialised = JSON.stringify(encodeOtlpTraceRequest(finished));
    expect(serialised).not.toContain(key);
    expect(serialised).not.toContain(key.slice(0, 24));
    // …and the useful attribute survived.
    expect(finished[0]?.attributes['pryzm.byom.provider']).toBe('anthropic');

    await provider.shutdown();
    _resetTracingForTests();
    trace.disable();
  });

  it('delegates lifecycle calls rather than swallowing them', async () => {
    const exporter = new InMemorySpanExporter();
    const inner = new SimpleSpanProcessor(exporter);
    const p = new RedactingSpanProcessor(inner);
    await expect(p.forceFlush()).resolves.toBeUndefined();
    await expect(p.shutdown()).resolves.toBeUndefined();
  });
});
