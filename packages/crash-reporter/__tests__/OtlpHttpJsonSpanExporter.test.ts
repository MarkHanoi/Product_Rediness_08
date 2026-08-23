// §OBS-TRACING-REACHABLE (L-9960) — the destination, and its cost.
//
// Two things are pinned here:
//  1. The OTLP/JSON encoder is CORRECT (hex ids, nanosecond strings, 1-based
//     span kinds, resource/scope grouping) — otherwise "spans go somewhere"
//     means "spans are rejected by the collector", which is the same defect one
//     layer along, dressed as success.
//  2. ⭐ The BYTE COST of one project-open is MEASURED, not guessed. The
//     sampling rate in `Tracing.ts` is derived from this number; if the encoder
//     or the workload shape changes, this test is where the argument is redone.

import { describe, it, expect } from 'vitest';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import {
  OtlpHttpJsonSpanExporter,
  encodeOtlpTraceRequest,
} from '../src/OtlpHttpJsonSpanExporter.js';
import { initTracing, _resetTracingForTests, DEFAULT_PROD_SAMPLE_RATIO } from '../src/Tracing.js';

/**
 * The MEASURED shape of one project-open, from `ProjectLoader.ts`'s own load
 * ordering and the founder's real project in ISSUE-LOG L-8704:
 * 281 elements / 7 levels / 62 walls / 10 slabs / 31 furniture.
 * `ProjectLoader` dispatches ONE `Create*` command per element, and every one
 * of those is an instrumented ZONE A CommandBus handler.
 */
const OPEN_SHAPE: ReadonlyArray<readonly [string, number]> = [
  ['pryzm.command.execute:project.clear', 1],
  ['pryzm.command.execute:level.add', 7],
  ['pryzm.command.execute:wall.create', 62],
  ['pryzm.command.execute:slab.create', 10],
  ['pryzm.command.execute:furniture.create', 31],
  ['pryzm.command.execute:element.create', 171], // the remaining 281 − 110
  ['pryzm.loader.tier1', 1],
  ['pryzm.loader.tier2', 1],
  ['pryzm.loader.tier3', 1],
  ['pryzm.loader.history', 1],
  ['pryzm.persistence.idb.loadSnapshot', 1],
  ['pryzm.persistence.checksum.verify', 1],
];

function totalSpans(): number {
  return OPEN_SHAPE.reduce((n, [, c]) => n + c, 0);
}

describe('OTLP/JSON encoder', () => {
  it('encodes ids as hex, times as nanosecond STRINGS, and kind as 1-based', async () => {
    _resetTracingForTests();
    trace.disable();
    const exporter = new InMemorySpanExporter();
    const handle = initTracing({ forceEnable: true, exporter, serviceName: 'pryzm-otlp-test' });

    const span = trace.getTracer('enc').startSpan('pryzm.command.execute');
    span.setAttribute('pryzm.command.kind', 'wall.create');
    span.setAttribute('pryzm.command.elements', 62);
    span.setAttribute('pryzm.command.undoable', true);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    const body = encodeOtlpTraceRequest(exporter.getFinishedSpans()) as {
      resourceSpans: Array<{
        resource: { attributes: Array<{ key: string; value: Record<string, unknown> }> };
        scopeSpans: Array<{ scope: { name: string }; spans: Array<Record<string, unknown>> }>;
      }>;
    };

    expect(body.resourceSpans).toHaveLength(1);
    const rs = body.resourceSpans[0]!;
    expect(rs.resource.attributes.some(a => a.key === 'service.name')).toBe(true);
    const s = rs.scopeSpans[0]!.spans[0]!;
    expect(String(s['traceId'])).toMatch(/^[0-9a-f]{32}$/);
    expect(String(s['spanId'])).toMatch(/^[0-9a-f]{16}$/);
    expect(String(s['startTimeUnixNano'])).toMatch(/^\d{16,}$/);
    expect(String(s['endTimeUnixNano'])).toMatch(/^\d{16,}$/);
    // API SpanKind.INTERNAL === 0 → OTLP SPAN_KIND_INTERNAL === 1.
    expect(s['kind']).toBe(1);

    const attrs = s['attributes'] as Array<{ key: string; value: Record<string, unknown> }>;
    expect(attrs.find(a => a.key === 'pryzm.command.kind')?.value).toEqual({
      stringValue: 'wall.create',
    });
    expect(attrs.find(a => a.key === 'pryzm.command.elements')?.value).toEqual({ intValue: '62' });
    expect(attrs.find(a => a.key === 'pryzm.command.undoable')?.value).toEqual({ boolValue: true });
    // OTel API SpanStatusCode.OK === 1 === OTLP STATUS_CODE_OK.
    expect((s['status'] as { code: number }).code).toBe(1);

    // The whole thing must be JSON-serialisable — the wire format IS JSON.
    expect(() => JSON.stringify(body)).not.toThrow();

    await handle.shutdown();
    _resetTracingForTests();
    trace.disable();
  });

  it('POSTs to <endpoint>/v1/traces and never rejects when the collector is down', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = (async (url: unknown, init: unknown) => {
      calls.push({
        url: String(url),
        body: String((init as { body?: unknown } | undefined)?.body ?? ''),
      });
      throw new Error('collector unreachable');
    }) as unknown as typeof fetch;

    const errors: unknown[] = [];
    const exporter = new OtlpHttpJsonSpanExporter({
      endpoint: 'https://collector.example/',
      headers: { 'x-api-key': 'test' },
      fetchImpl,
      onError: e => errors.push(e),
    });

    // Produce one real finished span to hand it.
    _resetTracingForTests();
    trace.disable();
    const mem = new InMemorySpanExporter();
    const handle = initTracing({ forceEnable: true, exporter: mem });
    const sp = trace.getTracer('post').startSpan('pryzm.probe');
    sp.end();
    const spans = mem.getFinishedSpans();

    let code: number | undefined;
    exporter.export([...spans], r => {
      code = r.code as unknown as number;
    });
    expect(code).toBe(0); // dispatched
    expect(calls[0]?.url).toBe('https://collector.example/v1/traces');
    await new Promise(r => setTimeout(r, 0));
    expect(errors).toHaveLength(1);
    expect(exporter.droppedBatches).toBe(1);

    await handle.shutdown();
    _resetTracingForTests();
    trace.disable();
  });
});

describe('⭐ the first real reading — what ONE project-open emits', () => {
  it('measures span count and OTLP bytes for a founder-sized open', async () => {
    _resetTracingForTests();
    trace.disable();
    const exporter = new InMemorySpanExporter();
    const handle = initTracing({ forceEnable: true, exporter, serviceName: 'pryzm-editor' });

    const tracer = trace.getTracer('@pryzm/command-bus', '0.1.0');
    for (const [name, count] of OPEN_SHAPE) {
      const [spanName, kind] = name.split(':');
      for (let i = 0; i < count; i++) {
        const s = tracer.startSpan(spanName!);
        if (kind) s.setAttribute('pryzm.command.kind', kind);
        s.setAttribute('pryzm.command.seq', i);
        s.setStatus({ code: SpanStatusCode.OK });
        s.end();
      }
    }

    const finished = exporter.getFinishedSpans();
    expect(finished).toHaveLength(totalSpans());

    const bytes = JSON.stringify(encodeOtlpTraceRequest(finished)).length;
    const perSpan = Math.round(bytes / finished.length);

    // ⛔ These are the numbers `DEFAULT_PROD_SAMPLE_RATIO` is argued from. They
    // are LOOSE bounds on purpose — the assertion is "this is the right order of
    // magnitude", so an accidental 10× regression in payload size fails here
    // instead of on the founder's bandwidth bill.
    expect(finished.length).toBeGreaterThan(250);
    expect(perSpan).toBeGreaterThan(100);
    expect(perSpan).toBeLessThan(600);
    expect(bytes).toBeLessThan(250_000);

    // Reported so the number is in the test log, not only in a doc that rots.
    console.info(
      `[L-9960] one project-open (281-element shape) = ${finished.length} spans, ` +
        `${bytes} bytes OTLP/JSON (${perSpan} B/span); at the ` +
        `${DEFAULT_PROD_SAMPLE_RATIO} default sample that is ` +
        `~${Math.round(bytes * DEFAULT_PROD_SAMPLE_RATIO)} bytes per open.`,
    );

    await handle.shutdown();
    _resetTracingForTests();
    trace.disable();
  });
});
