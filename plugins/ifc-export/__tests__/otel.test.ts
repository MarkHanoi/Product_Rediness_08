/**
 * Verifies the OpenTelemetry span surface defined by Sprint S56:
 *
 *   - one root `pryzm.ifc.export` span
 *   - per-element child spans `pryzm.ifc.export-{wall|slab|door|window|column|beam}`
 *   - per-Pset child spans `pryzm.ifc.export-pset`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { trace, type Span } from '@opentelemetry/api';

import { exportProjectToIFC } from '../src/index.js';
import { buildTier1Fixture } from './fixtures.js';

interface RecordedSpan {
  name: string;
  attributes: Record<string, unknown>;
  status: 'OK' | 'ERROR' | 'UNSET';
}

const recorded: RecordedSpan[] = [];

beforeAll(() => {
  // Stand up an in-memory tracer that records every span the exporter emits.
  trace.setGlobalTracerProvider({
    getTracer: () => ({
      startSpan(name: string) {
        const attrs: Record<string, unknown> = {};
        let status: 'OK' | 'ERROR' | 'UNSET' = 'UNSET';
        const span: Span = {
          spanContext: () => ({
            traceId: '0'.repeat(32),
            spanId: '0'.repeat(16),
            traceFlags: 1,
          }),
          setAttribute(key, value) {
            attrs[key] = value;
            return this;
          },
          setAttributes(values) {
            Object.assign(attrs, values);
            return this;
          },
          addEvent() {
            return this;
          },
          addLink() {
            return this;
          },
          addLinks() {
            return this;
          },
          setStatus(s) {
            status = s.code === 1 ? 'OK' : s.code === 2 ? 'ERROR' : 'UNSET';
            return this;
          },
          updateName(n) {
            (recorded.find((r) => r === entry) ?? entry).name = n;
            return this;
          },
          end() {
            recorded.push({ name, attributes: attrs, status });
          },
          isRecording: () => true,
          recordException: () => undefined,
        } as unknown as Span;
        const entry: RecordedSpan = { name, attributes: attrs, status };
        return span;
      },
      startActiveSpan: ((..._args: unknown[]) => undefined) as never,
    }),
  });
});

afterAll(() => {
  trace.disable();
});

describe('IFC Tier 1 export — OpenTelemetry spans', () => {
  it('emits the spans required by S56 exit criteria', async () => {
    recorded.length = 0;
    const { snapshot, metaStore } = buildTier1Fixture();
    await exportProjectToIFC(snapshot, metaStore, { name: 'OTel Test' });

    const names = recorded.map((s) => s.name);

    // Mandatory spans.
    expect(names).toContain('pryzm.ifc.export');
    expect(names).toContain('pryzm.ifc.export-wall');
    expect(names).toContain('pryzm.ifc.export-pset');

    // One span per Tier 1 family.
    for (const family of ['wall', 'slab', 'door', 'window', 'column', 'beam']) {
      expect(names, `missing span for ${family}`).toContain(`pryzm.ifc.export-${family}`);
    }

    // One Pset span per element (six elements, one Pset each).
    const psetSpans = recorded.filter((s) => s.name === 'pryzm.ifc.export-pset');
    expect(psetSpans.length).toBe(6);
    for (const span of psetSpans) {
      expect(span.attributes['pryzm.ifc.element_id']).toBeTruthy();
      expect(span.attributes['pryzm.ifc.pset_name']).toBeTruthy();
    }

    // Every span ended with status OK.
    for (const span of recorded) {
      expect(span.status, `span ${span.name} status`).toBe('OK');
    }
  });
});
