import { t as trace } from './trace-api-BIfvUk_c.js';

let _seq = 0;
function nextId() {
  _seq += 1;
  return `crash_${Date.now().toString(36)}_${_seq.toString(36).padStart(4, "0")}`;
}
class NoopCrashReporter {
  _log = [];
  _closed = false;
  _now;
  _defaultTags;
  _seenFingerprints = /* @__PURE__ */ new Map();
  constructor(opts) {
    this._now = opts?.now ?? (() => Date.now());
    this._defaultTags = opts?.defaultTags ?? {};
  }
  capture(input) {
    if (this._closed) {
      return {
        id: "closed",
        capturedAt: this._now(),
        severity: input.severity ?? "error",
        message: "reporter closed",
        stack: null,
        traceId: null,
        spanId: null,
        tags: {},
        extra: {},
        fingerprint: "closed"
      };
    }
    const message = errorMessage(input.error);
    const stack = errorStack(input.error);
    const severity = input.severity ?? "error";
    const fingerprint = input.fingerprint ?? `${severity}:${message}`;
    const tags = Object.freeze({ ...this._defaultTags, ...input.tags ?? {} });
    const extra = Object.freeze({ ...input.extra ?? {} });
    const r = {
      id: nextId(),
      capturedAt: this._now(),
      severity,
      message,
      stack,
      traceId: null,
      spanId: null,
      tags,
      extra,
      fingerprint
    };
    const seen = this._seenFingerprints.get(fingerprint) ?? 0;
    this._seenFingerprints.set(fingerprint, seen + 1);
    this._log.push(r);
    return r;
  }
  async flush() {
  }
  async close() {
    this._closed = true;
  }
  inspect() {
    return this._log.slice();
  }
  count() {
    return this._log.length;
  }
  countByFingerprint(fp) {
    return this._seenFingerprints.get(fp) ?? 0;
  }
  reset() {
    this._log.length = 0;
    this._seenFingerprints.clear();
    this._closed = false;
  }
}
function errorMessage(e) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
function errorStack(e) {
  if (e instanceof Error && typeof e.stack === "string") return e.stack;
  return null;
}

class OtelLinkedReporter {
  constructor(base = new NoopCrashReporter()) {
    this.base = base;
  }
  base;
  capture(input) {
    const r = this.base.capture(input);
    const ctx = trace.getActiveSpan()?.spanContext();
    if (!ctx) return r;
    return {
      ...r,
      traceId: ctx.traceId ?? null,
      spanId: ctx.spanId ?? null
    };
  }
  async flush() {
    await this.base.flush();
  }
  async close() {
    await this.base.close();
  }
  /** Pass through inspection helpers when the wrapped reporter is the
   *  in-memory NoopCrashReporter. Useful in tests. */
  inspect() {
    return this.base instanceof NoopCrashReporter ? this.base.inspect() : [];
  }
  count() {
    return this.base instanceof NoopCrashReporter ? this.base.count() : 0;
  }
}

var define_process_env_default = {};
async function createCrashReporter(opts) {
  const env = opts.env ?? readProcessEnv();
  const explicit = env.PRYZM_CRASH_REPORTER;
  const wantSentry = explicit === "sentry";
  const wantOtelLinked = explicit === "otel-linked" || !explicit && env.PRYZM_ENV === "beta";
  const baseOpts = {};
  if (opts.now) baseOpts.now = opts.now;
  const baseTags = { ...opts.defaultTags ?? {} };
  if (env.PRYZM_RELEASE) baseTags["release"] = env.PRYZM_RELEASE;
  if (env.PRYZM_ENV) baseTags["env"] = env.PRYZM_ENV;
  if (Object.keys(baseTags).length > 0) baseOpts.defaultTags = Object.freeze(baseTags);
  if (wantSentry) {
    if (!env.SENTRY_DSN) {
      throw new Error(
        "[crash-reporter] PRYZM_CRASH_REPORTER=sentry but SENTRY_DSN is not set. Set SENTRY_DSN or omit PRYZM_CRASH_REPORTER to use the OTel-linked reporter. See ADR-0038 §3."
      );
    }
    throw new Error(
      "[crash-reporter] Sentry adapter not yet shipped. Bound to S48 D9 launch when SENTRY_DSN is provisioned. See ADR-0038 §3."
    );
  }
  if (wantOtelLinked) {
    return new OtelLinkedReporter(new NoopCrashReporter(baseOpts));
  }
  return new NoopCrashReporter(baseOpts);
}
function readProcessEnv() {
  const e = (typeof process !== "undefined" ? define_process_env_default : void 0) ?? {};
  const out = {};
  if (e["PRYZM_CRASH_REPORTER"] === "noop" || e["PRYZM_CRASH_REPORTER"] === "otel-linked" || e["PRYZM_CRASH_REPORTER"] === "sentry") {
    out.PRYZM_CRASH_REPORTER = e["PRYZM_CRASH_REPORTER"];
  }
  if (e["SENTRY_DSN"]) out.SENTRY_DSN = e["SENTRY_DSN"];
  if (e["PRYZM_RELEASE"]) out.PRYZM_RELEASE = e["PRYZM_RELEASE"];
  if (e["PRYZM_ENV"] === "dev" || e["PRYZM_ENV"] === "beta" || e["PRYZM_ENV"] === "prod") {
    out.PRYZM_ENV = e["PRYZM_ENV"];
  }
  return out;
}

export { createCrashReporter };
