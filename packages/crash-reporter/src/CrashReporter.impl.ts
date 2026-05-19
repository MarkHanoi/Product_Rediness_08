// @pryzm/crash-reporter — impl (loaded only via dynamic import).

import { NoopCrashReporter } from './NoopCrashReporter.js';
import { OtelLinkedReporter } from './OtelLinkedReporter.js';
import type {
  CrashReporter,
  CrashReporterEnv,
  CrashReporterOptions,
} from './types.js';

export async function createCrashReporter(
  opts: CrashReporterOptions,
): Promise<CrashReporter> {
  const env: CrashReporterEnv = opts.env ?? readProcessEnv();
  const explicit = env.PRYZM_CRASH_REPORTER;
  const wantSentry = explicit === 'sentry';
  const wantOtelLinked = explicit === 'otel-linked' || (!explicit && env.PRYZM_ENV === 'beta');

  const baseOpts: { now?: () => number; defaultTags?: Readonly<Record<string, string>> } = {};
  if (opts.now) baseOpts.now = opts.now;
  const baseTags: Record<string, string> = { ...(opts.defaultTags ?? {}) };
  if (env.PRYZM_RELEASE) baseTags['release'] = env.PRYZM_RELEASE;
  if (env.PRYZM_ENV) baseTags['env'] = env.PRYZM_ENV;
  if (Object.keys(baseTags).length > 0) baseOpts.defaultTags = Object.freeze(baseTags);

  if (wantSentry) {
    if (!env.SENTRY_DSN) {
      throw new Error(
        '[crash-reporter] PRYZM_CRASH_REPORTER=sentry but SENTRY_DSN is not set. ' +
          'Set SENTRY_DSN or omit PRYZM_CRASH_REPORTER to use the OTel-linked reporter. ' +
          'See ADR-0038 §3.',
      );
    }
    // Real Sentry adapter binds at S48 D9 launch. Until then, requesting
    // sentry loud-fails per the project's "explicit when it fails" principle.
    throw new Error(
      '[crash-reporter] Sentry adapter not yet shipped. ' +
        'Bound to S48 D9 launch when SENTRY_DSN is provisioned. See ADR-0038 §3.',
    );
  }

  if (wantOtelLinked) {
    return new OtelLinkedReporter(new NoopCrashReporter(baseOpts));
  }
  // Default: noop in dev, OTel-linked in beta.
  return new NoopCrashReporter(baseOpts);
}

function readProcessEnv(): CrashReporterEnv {
  const e = (typeof process !== 'undefined' ? process.env : undefined) ?? {};
  const out: {
    PRYZM_CRASH_REPORTER?: 'noop' | 'otel-linked' | 'sentry';
    SENTRY_DSN?: string;
    PRYZM_RELEASE?: string;
    PRYZM_ENV?: 'dev' | 'beta' | 'prod';
  } = {};
  if (
    e['PRYZM_CRASH_REPORTER'] === 'noop' ||
    e['PRYZM_CRASH_REPORTER'] === 'otel-linked' ||
    e['PRYZM_CRASH_REPORTER'] === 'sentry'
  ) {
    out.PRYZM_CRASH_REPORTER = e['PRYZM_CRASH_REPORTER'];
  }
  if (e['SENTRY_DSN']) out.SENTRY_DSN = e['SENTRY_DSN'];
  if (e['PRYZM_RELEASE']) out.PRYZM_RELEASE = e['PRYZM_RELEASE'];
  if (e['PRYZM_ENV'] === 'dev' || e['PRYZM_ENV'] === 'beta' || e['PRYZM_ENV'] === 'prod') {
    out.PRYZM_ENV = e['PRYZM_ENV'];
  }
  return out;
}
