# OPEN-008 — Phase H: Observability / OTel Collector Configuration

> **Status**: 🔴 ACTIVE — 1 sprint, independent, high value
> **Anchor**: C10 §2 (Performance & Observability), C01 P8 (spans on every public function)
> **Gate**: `tools/ga-gate/check-otel-spans.ts` passes (OTel gate confirms spans exist in handler files)
> **Effort**: 1 sprint (~3 days)
> **Outcome**: OpenTelemetry spans are exported to a real collector. The architecture's observability claims become verifiable in production. Performance regressions and error rates are visible on a dashboard.

---

## §0 — Current State (2026-05-16 verified)

### What Exists

```bash
# Handler files with OTel spans
rg "withHandlerSpan" apps/ packages/ plugins/ --type ts | wc -l
# → 482 (the otel-spans gate passes — handler coverage is good)

# OTel SDK in package.json
grep "@opentelemetry" package.json
# → @opentelemetry/sdk-node, @opentelemetry/exporter-trace-otlp-http, etc.

# Telemetry stub
ls server/telemetry.js
# → EXISTS (but is a no-op stub — sends spans nowhere)
```

### The Problem

482 handler files generate `withHandlerSpan()` spans. The spans are created in memory and immediately discarded — the `ConsoleSpanExporter` (debug) or no-op exporter is active. No spans reach any observability backend.

This means:
- P95 latency dashboards: don't exist
- Error rate by command type: unknown
- `pryzm.undo.apply` duration: untracked
- OTel gate passes: ✅ (wiring is correct) — but observability is non-functional in production

---

## §1 — Architecture

### Current `server/telemetry.js` (stub)

```javascript
// Current: no-op or console exporter only
import { NodeSDK } from '@opentelemetry/sdk-node';

const sdk = new NodeSDK({
  // No exporter configured
});
sdk.start();
```

### Target `server/telemetry.js` (full)

```javascript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const SERVICE_NAME = 'pryzm-bim-platform';
const SERVICE_VERSION = process.env.npm_package_version || '3.0.0';

function createTelemetry() {
  if (!OTLP_ENDPOINT) {
    // Development: console exporter only (no-op in production without endpoint)
    console.warn('[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set — spans will not be exported');
    return null;
  }

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    'deployment.environment': process.env.NODE_ENV || 'development',
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${OTLP_ENDPOINT}/v1/traces`,
    headers: {
      Authorization: `Bearer ${process.env.OTEL_EXPORTER_OTLP_TOKEN || ''}`,
    },
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${OTLP_ENDPOINT}/v1/metrics`,
    headers: {
      Authorization: `Bearer ${process.env.OTEL_EXPORTER_OTLP_TOKEN || ''}`,
    },
  });

  return new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter, {
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000,
    }),
  });
}

const sdk = createTelemetry();
if (sdk) {
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown());
}
```

---

## §2 — Choosing an OTLP Backend

### Option A: Grafana Cloud (recommended — free tier available)

Free tier: 14-day trace retention, 50GB/month.

```bash
# Grafana Cloud setup:
# 1. Sign up at grafana.com → Create account → Start for free
# 2. Navigate to: Connections → Add new connection → OpenTelemetry
# 3. Copy the OTLP endpoint and token
# 4. Set environment variables:
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-xxx.grafana.net/otlp
OTEL_EXPORTER_OTLP_TOKEN=[grafana-cloud-token]
```

### Option B: Honeycomb (developer-friendly, strong UI for traces)

Free tier: 20M events/month.

```bash
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_EXPORTER_OTLP_TOKEN=[honeycomb-api-key]
# Honeycomb uses the 'x-honeycomb-team' header — add to OTLPTraceExporter headers
```

### Option C: Self-hosted Jaeger (full control, no cost)

```bash
# Docker: docker run -d -p 4317:4317 -p 16686:16686 jaegertracing/all-in-one
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

---

## §3 — Sprint Plan (3 days)

### Day 1: Server OTel collector configuration

1. Update `server/telemetry.js` to the full implementation above
2. Add environment variables:
   - `OTEL_EXPORTER_OTLP_ENDPOINT` (required for export)
   - `OTEL_EXPORTER_OTLP_TOKEN` (required for auth)
3. Test locally with Jaeger (Docker) or Grafana Cloud free tier
4. Verify spans appear in the backend

**Verify:**
```bash
# Health check includes OTel status
curl http://localhost:5000/api/health | jq .otel
# Expected: { "active": true, "endpoint": "https://..." }
```

### Day 2: Key spans to verify in production

Confirm the following critical command spans appear in the trace backend:

| Span Name | Source | Why Important |
|---|---|---|
| `pryzm.command.element.create` | Plugin handler | Measures element creation latency |
| `pryzm.command.wall.create` | `plugins/wall/src/handlers/` | Most common user action |
| `pryzm.command.ifc.import` | `plugins/ifc-import/src/` | Most expensive operation |
| `pryzm.undo.apply` | `packages/runtime-undo-stack/` | Measures undo path (active after E.5.x) |
| `pryzm.ai.batch.execute` | `packages/ai-host/src/` | AI cost metering |
| `http.server.duration` | Express middleware | API response times |

### Day 3: Dashboard + alert setup

Create at least one dashboard with:
1. **P95 command latency** by command type (detect regressions)
2. **Error rate** by handler (detect handler failures)
3. **AI batch cost proxy** (number of AI commands × cost estimate)
4. **Active users** (span count by session)

Add one alert:
- **P95 `pryzm.command.wall.create` > 100ms** → PagerDuty/Slack notification

---

## §4 — Frontend Telemetry (Phase H.2, separate sprint)

The server-side OTel above covers backend spans. Frontend spans require the browser OTel SDK:

```typescript
// apps/editor/src/browser-entry.tsx (add to boot sequence)
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

// Auto-instruments all fetch() calls — correlates frontend → backend spans
registerInstrumentations({
  instrumentations: [new FetchInstrumentation()],
});
```

**Frontend spans to add manually** (high value):
- `pryzm.viewport.render` — frame render time
- `pryzm.ifc.parse` — client-side IFC parse duration
- `pryzm.tool.activate` — tool activation response time
- `pryzm.canvas.pick` — GPU pick response time

---

## §5 — `/api/health` OTel Status Field

Update `/api/health` endpoint (line 1782 in `server.js`) to include OTel status:

```javascript
// server.js line ~1782
app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version,
    db: await checkDbConnection(),
    stripe: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    otel: {                                                   // ADD THIS
      active: !!(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
    },
    sync: !!(process.env.VITE_SYNC_URL),
  });
});
```

---

## §6 — Acceptance Criteria

```bash
# 1. Server starts with OTel configured
OTEL_EXPORTER_OTLP_ENDPOINT=https://... node server.js
# Expected: no OTel errors in startup logs

# 2. Health endpoint shows OTel active
curl http://localhost:5000/api/health | jq .otel
# Expected: { "active": true, "endpoint": "https://..." }

# 3. Spans appear in backend (manual check)
# Open Grafana/Honeycomb/Jaeger and confirm spans visible within 30s of app use

# 4. P95 dashboard exists (manual check)
# Grafana dashboard with at least 3 panels

# 5. Gate still passes
pnpm tsx tools/ga-gate/check-otel-spans.ts
# Expected: exits 0
```

---

*Stamp: 2026-05-16. Independent of all other open items — can start any time. Recommended: do on the same sprint as GAP-010 CI pipeline (2 infrastructure items in 1 sprint). Required environment vars: `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_TOKEN`.*
