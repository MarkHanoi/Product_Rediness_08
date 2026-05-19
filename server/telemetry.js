/**
 * @file server/telemetry.js
 * @description OpenTelemetry SDK bootstrap for PRYZM server.
 *
 * Wave A14 (S118) — A14-T3.
 * Contract C10 §2 (P8): every new exported function MUST add ≥ 1 OTel span.
 *
 * This module MUST be imported before any other application module so that
 * the SDK can patch HTTP clients and the Node runtime.
 *
 * Configuration (env vars):
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP/HTTP collector URL
 *                                   e.g. https://api.honeycomb.io
 *                                   If absent, telemetry is a no-op.
 *   OTEL_SERVICE_NAME             — defaults to "pryzm-server"
 *   OTEL_EXPORTER_OTLP_HEADERS   — comma-separated "key=value" auth headers
 *                                   e.g. "x-honeycomb-team=YOUR_API_KEY"
 *
 * The SDK is activated only when OTEL_EXPORTER_OTLP_ENDPOINT is set AND the
 * required packages are installed. All imports are dynamic so missing packages
 * never crash the server — they log a clear warning instead.
 *
 * Install packages to activate:
 *   pnpm add -w @opentelemetry/sdk-node \
 *               @opentelemetry/exporter-trace-otlp-http \
 *               @opentelemetry/sdk-trace-base \
 *               @opentelemetry/resources \
 *               @opentelemetry/semantic-conventions
 */

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'pryzm-server';
const ENDPOINT     = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (ENDPOINT) {
    // Use dynamic imports so missing packages produce a clear warning rather
    // than a fatal startup error.
    (async () => {
        try {
            const [
                { NodeSDK },
                { Resource },
                { SEMRESATTRS_SERVICE_NAME },
                { OTLPTraceExporter },
                { BatchSpanProcessor },
            ] = await Promise.all([
                import('@opentelemetry/sdk-node'),
                import('@opentelemetry/resources'),
                import('@opentelemetry/semantic-conventions'),
                import('@opentelemetry/exporter-trace-otlp-http'),
                import('@opentelemetry/sdk-trace-base'),
            ]);

            // Parse optional header string "k1=v1,k2=v2" into a headers object.
            const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS ?? '';
            const headers = Object.fromEntries(
                rawHeaders
                    .split(',')
                    .filter(Boolean)
                    .map(pair => {
                        const idx = pair.indexOf('=');
                        if (idx === -1) return null;
                        return [pair.slice(0, idx).trim(), pair.slice(idx + 1).trim()];
                    })
                    .filter(Boolean)
            );

            const exporter = new OTLPTraceExporter({
                url: `${ENDPOINT}/v1/traces`,
                headers,
            });

            const sdk = new NodeSDK({
                resource: new Resource({
                    [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
                }),
                spanProcessor: new BatchSpanProcessor(exporter),
            });

            sdk.start();

            process.on('beforeExit', async () => {
                try { await sdk.shutdown(); }
                catch (err) { console.error('[telemetry] SDK shutdown error:', err); }
            });

            console.info(`[telemetry] OTel SDK started — exporting to ${ENDPOINT} as "${SERVICE_NAME}"`);
        } catch (err) {
            console.warn(
                '[telemetry] OTel SDK packages not installed — telemetry is a no-op.\n' +
                '  Run: pnpm add -w @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http' +
                ' @opentelemetry/sdk-trace-base @opentelemetry/resources @opentelemetry/semantic-conventions\n' +
                `  Error: ${err.message}`,
            );
        }
    })();
} else {
    // No endpoint configured — this is expected in local dev and CI.
    // Spans created via @opentelemetry/api are no-ops (backed by the
    // NoopTracerProvider that @opentelemetry/api ships with).
}
