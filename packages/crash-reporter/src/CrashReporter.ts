// @pryzm/crash-reporter — public lazy entry (S48 D3).
//
// Mirrors `getAiHost()` / `getEmailTransport()`: the only public way
// to obtain a CrashReporter is `getCrashReporter()` which dynamically
// imports the impl module. Editor's first-paint bundle has zero
// crash-reporter bytes.

import type {
  CrashReporter,
  CrashReporterOptions,
} from './types.js';

let _reporter: CrashReporter | null = null;
let _pending: Promise<CrashReporter> | null = null;

export async function getCrashReporter(
  opts?: CrashReporterOptions,
): Promise<CrashReporter> {
  if (_reporter) return _reporter;
  if (_pending) return _pending;
  _pending = (async () => {
    const mod = await import('./CrashReporter.impl.js');
    _reporter = await mod.createCrashReporter(opts ?? {});
    _pending = null;
    return _reporter;
  })();
  return _pending;
}

export function isCrashReporterLoaded(): boolean {
  return _reporter !== null;
}

/** Test-only — reset the cached reporter. */
export function _resetCrashReporterForTests(): void {
  _reporter = null;
  _pending = null;
}

/** Install a process / window global handler that funnels uncaught
 *  errors into the lazy reporter. Idempotent — call once at boot.
 *  Returns an uninstaller for tests. */
export function installGlobalHandlers(opts?: {
  reporter?: CrashReporter;
  /** Skip browser handlers when running in node (default detect). */
  scope?: 'browser' | 'node' | 'auto';
}): () => void {
  const scope = opts?.scope ?? autodetectScope();
  const get = async () => opts?.reporter ?? (await getCrashReporter());

  const onUncaught = (err: unknown) => {
    void get().then((r) =>
      r.capture({
        error: err,
        severity: 'fatal',
        tags: { source: 'globalHandler' },
      }),
    );
  };

  let cleanups: Array<() => void> = [];

  if (scope === 'browser' && typeof globalThis !== 'undefined') {
    const win = globalThis as unknown as {
      addEventListener?: (k: string, fn: (e: unknown) => void) => void;
      removeEventListener?: (k: string, fn: (e: unknown) => void) => void;
    };
    if (typeof win.addEventListener === 'function') {
      const errFn = (ev: unknown) => {
        const e = (ev as { error?: unknown; message?: string }).error
          ?? (ev as { message?: string }).message
          ?? ev;
        onUncaught(e);
      };
      const rejFn = (ev: unknown) => {
        const r = (ev as { reason?: unknown }).reason ?? ev;
        onUncaught(r);
      };
      win.addEventListener('error', errFn);
      win.addEventListener('unhandledrejection', rejFn);
      cleanups.push(() => win.removeEventListener?.('error', errFn));
      cleanups.push(() => win.removeEventListener?.('unhandledrejection', rejFn));
    }
  }

  if (scope === 'node' && typeof process !== 'undefined') {
    const proc = process as NodeJS.Process;
    proc.on('uncaughtException', onUncaught);
    proc.on('unhandledRejection', onUncaught);
    cleanups.push(() => proc.off('uncaughtException', onUncaught));
    cleanups.push(() => proc.off('unhandledRejection', onUncaught));
  }

  return () => {
    cleanups.forEach((c) => c());
    cleanups = [];
  };
}

function autodetectScope(): 'browser' | 'node' {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    return 'browser';
  }
  return 'node';
}
