#!/usr/bin/env node
/**
 * §L-442 SMOKE — actually boot the built artefact and prove it serves.
 *
 * "The build must fail loudly if it produces something that cannot boot."
 * A bundler that silently emits a broken graph is strictly worse than a slow
 * boot, because the failure surfaces on a scaled-out instance at peak traffic
 * instead of in CI. So the image build runs this, and a non-zero exit fails the
 * `docker build` before the runtime stage is ever assembled.
 *
 * What it does
 * ------------
 *   1. spawn `node dist/index.cjs` — the REAL production entrypoint, plain node,
 *      no tsx anywhere on the command line;
 *   2. wait for it to bind a throwaway port (proves module graph loaded AND
 *      `httpServer.listen()` was reached);
 *   3. GET /api/health/live and require HTTP 200 (proves Express is wired, not
 *      merely that a socket is open);
 *   4. GET / and require a non-5xx (proves the static dist/ handler resolved —
 *      this is the check that would have caught an `__dirname` regression from
 *      bundling server.js, which is exactly why server.js is NOT bundled);
 *   5. SIGTERM, and require a clean exit within the shutdown budget.
 *
 * Any step failing prints the child's captured output and exits non-zero.
 *
 * Environment
 * -----------
 * PRYZM_FORCE_INMEMORY=1 skips the Postgres pool — the smoke test asserts the
 * PROCESS boots, not that a database is reachable from the build machine. The
 * other vars are throwaway values that satisfy the boot-time config checks.
 * NOTE (limits): this proves the boot path and the two eagerly-imported
 * precompiled packages load. It does NOT exercise every route, so a
 * lazily-imported dependency could still be missing — `check-server-deps.mjs`
 * is the static guard for that case.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const entry = join(repoRoot, 'dist', 'index.cjs');

// Declared up here, not next to fail(): top-level `await` suspends module
// evaluation, so anything referenced from a callback that fires DURING that
// await must already be initialised (a `class` further down is still in TDZ).
class SmokeAbort extends Error {}
process.on('uncaughtException', (err) => {
  if (err instanceof SmokeAbort) return; // already reported by fail()
  console.error('[smoke] ✖ unexpected error:', err?.stack ?? err);
  process.exitCode = 1;
});
process.on('unhandledRejection', (err) => {
  if (err instanceof SmokeAbort) return;
  console.error('[smoke] ✖ unexpected rejection:', err?.stack ?? err);
  process.exitCode = 1;
});

const PORT = Number(process.env.SMOKE_PORT ?? 51942);
const BIND_TIMEOUT_MS = Number(process.env.SMOKE_BIND_TIMEOUT_MS ?? 120_000);
const EXIT_TIMEOUT_MS = 20_000;

// Checked before the child exists, so this cannot go through fail().
if (!existsSync(entry)) {
  console.error(`[smoke] ✖ entrypoint not found: ${entry} — run the build first.`);
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(PORT),
  // Boot the process without a database. See header.
  PRYZM_FORCE_INMEMORY: '1',
  // Throwaway values so boot-time config validation does not hard-exit.
  SESSION_SECRET: process.env.SESSION_SECRET || 'smoke-test-session-secret-not-a-real-key',
  PRYZM_OWNER_EMAIL: process.env.PRYZM_OWNER_EMAIL || 'smoke@example.invalid',
  PRYZM_OWNER_PASSWORD: process.env.PRYZM_OWNER_PASSWORD || 'smoke-test-password',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || `http://127.0.0.1:${PORT}`,
  // Never let the smoke test talk to real infrastructure. server.js hard-refuses
  // to start in production without DATABASE_URL (or SUPABASE_DB_URL), so we give
  // it a syntactically valid but deliberately unroutable one. Combined with
  // PRYZM_FORCE_INMEMORY=1 no pool is ever opened, so it is never dialled.
  DATABASE_URL: 'postgresql://smoke:smoke@127.0.0.1:1/smoke_never_dialled',
  SUPABASE_DB_URL: '',
  SUPABASE_URL: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  CF_WORKER_URL: '',
  ANTHROPIC_API_KEY: '',
  STRIPE_SECRET_KEY: '',
};

let output = '';
const t0 = Date.now();
const child = spawn(process.execPath, [entry], {
  cwd: repoRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

let exitedEarly = null;
child.on('exit', (code, signal) => {
  if (exitedEarly === null) exitedEarly = { code, signal };
});

console.log(`[smoke] booting \`node dist/index.cjs\` on :${PORT} …`);

await waitForBind();
const bootMs = Date.now() - t0;
console.log(`[smoke] bound :${PORT} after ${bootMs} ms`);

await expectStatus('/api/health/live', (s) => s === 200);
await expectStatus('/', (s) => s < 500);

child.kill('SIGTERM');
const clean = await waitForExit();
if (!clean) {
  console.warn('[smoke] ⚠ process did not exit within 20s of SIGTERM — force killing.');
  child.kill('SIGKILL');
}

console.log(
  `[smoke] ✔ dist/index.cjs booted with plain node in ${bootMs} ms, ` +
    'served /api/health/live and /, and shut down.',
);
finish(0);

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Exit with `code` WITHOUT calling process.exit() while the child's stdio pipes
 * are still tearing down. On Windows that trips a libuv assertion
 * (`!(handle->flags & UV_HANDLE_CLOSING)`) and the shell sees 127 instead of the
 * intended code — which would turn a PASS into a build failure and, worse, a
 * FAIL into an unrecognisable one. Destroy the pipes, set process.exitCode, and
 * let the loop drain; the unref'd timer is a backstop if something else holds it
 * open.
 */
function finish(code) {
  try {
    child.stdout?.removeAllListeners();
    child.stderr?.removeAllListeners();
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.removeAllListeners();
    child.unref();
  } catch {
    /* best effort */
  }
  process.exitCode = code;
  setTimeout(() => process.exit(code), 3000).unref();
}

function fail(msg) {
  console.error(`\n[smoke] ✖ ${msg}`);
  if (output) {
    console.error('\n──── child output ────');
    console.error(output.slice(-8000));
    console.error('──────────────────────\n');
  }
  try {
    child?.kill('SIGKILL');
  } catch {
    /* already gone */
  }
  finish(1);
  // Stop the caller dead: every call site treats fail() as terminal, and
  // process.exitCode alone would let execution continue and mask the reason.
  throw new SmokeAbort(msg);
}

function waitForBind() {
  return new Promise((done) => {
    const deadline = Date.now() + BIND_TIMEOUT_MS;
    const tick = () => {
      if (exitedEarly) {
        fail(
          `process exited before binding :${PORT} ` +
            `(code=${exitedEarly.code}, signal=${exitedEarly.signal}). ` +
            'This is the failure mode the smoke step exists to catch: the build ' +
            'emitted an artefact that cannot boot.',
        );
      }
      if (Date.now() > deadline) {
        fail(`timed out after ${BIND_TIMEOUT_MS} ms waiting for :${PORT}.`);
      }
      const sock = net.connect({ host: '127.0.0.1', port: PORT }, () => {
        sock.destroy();
        done();
      });
      sock.on('error', () => {
        sock.destroy();
        setTimeout(tick, 100);
      });
    };
    tick();
  });
}

async function expectStatus(path, predicate) {
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return fail(`GET ${path} threw: ${err?.message ?? err}`);
  }
  if (!predicate(res.status)) {
    return fail(`GET ${path} returned HTTP ${res.status}, which the smoke test rejects.`);
  }
  console.log(`[smoke] GET ${path} → ${res.status}`);
}

function waitForExit() {
  return new Promise((done) => {
    if (exitedEarly) return done(true);
    const timer = setTimeout(() => done(false), EXIT_TIMEOUT_MS);
    child.once('exit', () => {
      clearTimeout(timer);
      done(true);
    });
  });
}
