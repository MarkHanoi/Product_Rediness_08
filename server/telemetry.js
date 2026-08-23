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

import { initTracing, describeTracing } from '@pryzm/crash-reporter';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'pryzm-server';
const ENDPOINT     = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// L-392 — register a REAL global tracer provider at the server composition root
// so the codebase's P8 spans (`trace.getTracer(...).startSpan()`) actually record
// instead of silently no-op'ing against @opentelemetry/api's NoopTracerProvider.
//
// This runs synchronously as the very first server import (before any app module
// can create a tracer at module load). It is SELF-GUARDED — a no-op unless
// `PRYZM_TRACING` is set (see @pryzm/crash-reporter Tracing.ts) — so local dev,
// CI, and default production are byte-for-byte unchanged. When the richer OTLP
// NodeSDK path below is actually installed AND configured, it registers its own
// provider afterwards and takes over. `initTracing()` is idempotent.
const tracing = initTracing({ serviceName: SERVICE_NAME });

// §OBS-TRACING-REACHABLE (L-9960) — SAY what tracing is doing, every boot.
// L-392 stayed invisible for months because nothing printed "OFF". One line is
// the difference between "we have observability" and "we have span source code".
// (When it REFUSED, `initTracing()` has already warned — do not print the same
// sentence twice; a duplicated line reads like two independent failures.)
if (!tracing.refusedReason) console.info(describeTracing(tracing));

// §OBS-TRACING-REACHABLE — the NodeSDK block below is skipped once
// `initTracing()` has registered a provider, because registering a SECOND
// global provider silently orphans the first one's processor: spans would be
// scrubbed-and-exported by one pipeline or the other depending on import order,
// which is exactly the kind of "works, sometimes" observability this lane exists
// to remove. `PRYZM_TRACING` is therefore the switch; this block is the legacy
// richer path for a deploy that installs the five packages and does NOT set it.
//
// ⚠ MEASURED 2026-08-23: `ls node_modules/@opentelemetry/` → `api` ONLY.
// `sdk-node`, `exporter-trace-otlp-http` and `semantic-conventions` are NOT
// installed, so this block has never executed its success path — it falls into
// its own catch and logs "packages not installed". It is retained (nothing is
// deleted) but it is NOT the path that makes tracing work; `initTracing()` above
// carries a dependency-free OTLP/HTTP JSON exporter that needs no install.
if (ENDPOINT && !tracing.enabled) {
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
} else if (tracing.enabled) {
    // `initTracing()` owns the pipeline — flush it on the way out so the last
    // batch is not lost when the process exits.
    process.on('beforeExit', async () => {
        try { await tracing.shutdown(); }
        catch (err) { console.error('[telemetry] tracing shutdown error:', err); }
    });
} else {
    // No endpoint configured AND PRYZM_TRACING unset — expected in local dev and
    // CI. Spans created via @opentelemetry/api are no-ops (backed by the
    // NoopTracerProvider that @opentelemetry/api ships with).
    // ⛔ This is NOT a silent state any more: `describeTracing()` above printed
    // either "OFF (PRYZM_TRACING unset)" or the REFUSED reason.
}
