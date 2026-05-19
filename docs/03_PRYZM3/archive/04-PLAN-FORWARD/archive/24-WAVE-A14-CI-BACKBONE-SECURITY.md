# 24 — Wave A14: CI Backbone + Security Hardening

> **Stamp**: 2026-05-03 · **Status**: ✅ COMPLETE — all 10 tasks DONE (S118)
> **Sprint(s)**: S118 · **Weeks**: 75–77 · **Effort**: ~3 engineering days
> **Source authority**: `attached_assets/Pasted--PRYZM-3-Master-Implementation-Plan-to-100-100…txt` Part 3 §Wave 14 · `06-SENIOR-ARCHITECT-AUDIT.md §6` (CI), `§15` (Security), `§16` (Observability)
> **Anchored to**: `../01-VISION.md §2` (P3, P8), `../02-ARCHITECTURE.md §8` (convergence booleans), `../03-CURRENT-STATE.md §1` (live metrics), `../../00_Contracts/C01-ARCHITECTURE-AND-GOVERNANCE.md §5`, `../../00_Contracts/C04-RENDERING-AND-SCHEDULING.md §2`, `../../00_Contracts/C08-COLLABORATION-AND-SECURITY.md §5`, `../../00_Contracts/C10-PERFORMANCE-AND-OBSERVABILITY.md §2 §4`
> **⚠ TRACKER RULE**: Any task status change → update `../00-PROCESS-TRACKER.md` §3 Wave A14 row + §4 next-actions same commit.
> **Pre-condition (Gate)**: Wave 23 L2 plan accepted; `pnpm tsx scripts/pryzm-3-functional-day-1.ts` returns ALL CHECKS GREEN (Wave 15 close confirmed); 5/9 convergence booleans true (#2,#3,#4,#5,#6).

---

## §0 — Why this wave must start before anything else

The senior architect audit (§6, §15, §16) identifies three categories of immediate risk:

1. **CI regression risk**: Every wave after this can silently break P1–P8 without PR-blocking gates. There are no GitHub Actions gates on PRs. A single merging engineer can ship `(window as any)` casts, rogue `requestAnimationFrame()` calls, or missing OTel spans and the codebase will not catch it until a manual audit.
2. **Active XSS vulnerability**: IFC Pset values rendered via `element.innerHTML` in first-party panels are a live XSS attack vector. Any maliciously crafted IFC file can inject JavaScript. This is an enterprise sales blocker and a potential GDPR / Cyber Essentials liability.
3. **Monitoring void**: 482 source files emit OpenTelemetry spans to no collector. The health check endpoint is absent — Replit's deployment infra cannot verify the app is alive. Errors evaporate into console.

**Boolean delta**: Wave A14 does not close any new convergence boolean. It prevents regression of the 5 that are true (#2–#6) and closes the gap between "structurally correct" and "operationally safe".

**Score projection**: 5.8/10 → **6.5/10** (CI backbone, security, observability fixed).

---

## §1 — Full task ledger

> STATUS values: `TODO` · `IN-PROGRESS` · `DONE` · `DEFERRED` · `BLOCKED`

### Sprint S118 — Week 75–77

| ID | Task | Contract | P-Principle | Boolean Δ | Audit §ref | STATUS |
|---|---|---|---|---|---|---|
| A14-T1 | `.github/workflows/ci.yml` — PR-blocking gate running `turbo run test:ci lint` + all 5 GA gate scripts | C01 §5, C10 §4 | P1 | none | §6 WARN | `DONE` |
| A14-T2 | DOMPurify all Pset `innerHTML` renders → `DOMPurify.sanitize(value)` at every property display site | C08 §5 | P8 | none | §15 WARN | `DONE` |
| A14-T3 | `@opentelemetry/exporter-otlp-http` config + wire to collector (Honeycomb or Grafana Cloud) | C10 §2, P8 | P8 | none | §16 WARN | `DONE` |
| A14-T4 | Add `GET /health` endpoint to `server.js` returning 200 + JSON status payload | C10 §2 | P8 | none | §16 WARN | `DONE` |
| A14-T5 | Fix `EnhancedBloomService.ts` — remove its own `requestAnimationFrame`, subscribe to `FrameScheduler` at `'post'` priority | C04 §2 | P3 | none | §1 WARN | `DONE` |
| A14-T6 | Add `webglcontextlost` / `webglcontextrestored` event handlers to `packages/renderer-three/` entry point | C04 §1.4 | P2 | none | §18 FAIL | `DONE` |
| A14-T7 | Tighten CSP in `server/securityHeaders.js` — replace permissive `'unsafe-inline'` + `'unsafe-eval'` entries with allow-listed domains | C08 §5 | P8 | none | §15 WARN | `DONE` |
| A14-T8 | Add `npm audit --audit-level=high` as CI step; fail PR if any high/critical CVE introduced | C01 §5, C08 §5 | P1 | none | §15 WARN | `DONE` |
| A14-T9 | Add Zod request-body validation to all `server/api/*/routes.js` endpoints that accept JSON payloads | C08 §5 | P8 | none | §15 WARN | `DONE` |
| A14-T10 | Add `C01-ARCHITECTURE-AND-GOVERNANCE.md §5` amendment: GitHub Actions CI is a hard-fail merge gate | C01 §5 | P1 | none | Part 5 gap | `DONE` |

---

## §2 — Detailed implementation guide per task

### A14-T1 — GitHub Actions CI pipeline

**File to create**: `.github/workflows/ci.yml`

```yaml
name: PRYZM CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm tsc --noEmit
      - name: Lint (P2/P3/P4/P6 hard-fails)
        run: pnpm eslint src/ packages/ plugins/ --max-warnings=0
      - name: Test (all packages, plugins, apps)
        run: pnpm turbo run test:ci
      - name: GA gate (5 convergence checks)
        run: pnpm tsx tools/ga-gate/run-all.ts
      - name: Bundle size gate (NFT 15 — < 4 MB gzipped)
        run: pnpm tsx scripts/verify-bundle-size.mjs
      - name: Security audit
        run: npm audit --audit-level=high
```

**Contract alignment**: C01 §5 — "All PRs MUST pass the GA gate before merge." This CI file makes that machine-enforced rather than convention-based.

**P-principle alignment**:
- P2 hard-fail: `eslint-plugin-boundaries` runs in the `lint` step — any new `import * as THREE` outside `packages/renderer-three/` fails the PR.
- P3 hard-fail: ESLint rule `no-restricted-globals` for `requestAnimationFrame` outside scheduler — fails the PR.
- P4 hard-fail: `check-cast-count.ts` is run as a GA gate step — fails the PR if `(window as any)` count outside the shim increases.

---

### A14-T2 — DOMPurify Pset innerHTML sanitization

**Install**: `pnpm add dompurify @types/dompurify -w`

**Files requiring sanitization** (identified by `rg "innerHTML" src/ui/ --type ts -l`):
All property inspector / panel files that set `element.innerHTML` from IFC Pset values.

**Pattern to apply universally**:

```typescript
// Before (XSS-vulnerable):
element.innerHTML = psetValue;

// After (sanitized):
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(psetValue, {
  ALLOWED_TAGS: [],      // text only — no HTML in Pset values
  ALLOWED_ATTR: [],
});
```

**Files to audit and fix**:
```bash
rg "\.innerHTML\s*=" src/ui/ --type ts -n
# Every hit that originates from IFC Pset / property data must be wrapped.
```

**Verification**:
```bash
# After fix: zero unsanitized innerHTML assignments from property data paths
rg "innerHTML\s*=\s*pset\|innerHTML\s*=\s*value\|innerHTML\s*=\s*prop" src/ui/ --type ts
# → 0 hits
```

**OTel span** (required per P8):
```typescript
const tracer = trace.getTracer('pryzm.ui.property-sanitizer');
function renderPsetValue(container: HTMLElement, value: string): void {
  const span = tracer.startSpan('pryzm.ui.renderPsetValue');
  try {
    container.innerHTML = DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  } finally {
    span.end();
  }
}
```

---

### A14-T3 — OTel OTLP export configuration

**File to create**: `packages/telemetry-config/src/index.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

export function initTelemetry(serviceName: string): NodeSDK {
  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? Object.fromEntries(
          process.env.OTEL_EXPORTER_OTLP_HEADERS
            .split(',')
            .map(h => h.split('=') as [string, string])
        )
      : {},
  });

  const sdk = new NodeSDK({
    resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: serviceName }),
    traceExporter: exporter,
  });

  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown());
  return sdk;
}
```

**Environment variables required** (add to `.env.example`):
```
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=YOUR_API_KEY
```

**Wire in `server.js`** (first line, before any imports):
```javascript
import { initTelemetry } from '@pryzm/telemetry-config';
initTelemetry('pryzm-server');
```

---

### A14-T4 — Health check endpoint

**Add to `server.js`** (before other route registrations):

```javascript
// GET /health — Replit deployment health check + uptime monitoring
app.get('/health', (req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  res.status(200).json({
    status: 'ok',
    service: 'pryzm-server',
    version: process.env.npm_package_version ?? 'unknown',
    uptime_s: uptimeSeconds,
    memory_mb: memoryMB,
    timestamp: new Date().toISOString(),
  });
});
```

**Verification**:
```bash
curl -s "$REPLIT_DEV_DOMAIN/health" | jq .status
# → "ok"
```

---

### A14-T5 — EnhancedBloomService rAF fix

**File**: `src/engine/subsystems/rendering/EnhancedBloomService.ts`

**Problem**: The service calls `requestAnimationFrame()` directly — a P3 hard-fail. Only `packages/runtime-composer/src/scheduler.ts` may own rAF loops.

**Fix pattern**:

```typescript
// REMOVE:
private _loop(): void {
  this._rafId = requestAnimationFrame(() => this._loop());
  this._render();
}

// ADD (P3-compliant):
import { FrameScheduler } from '@pryzm/frame-scheduler';

class EnhancedBloomService {
  private _unsub: (() => void) | null = null;

  initialize(scheduler: FrameScheduler): void {
    // Subscribe to the single rAF owner at 'post' priority
    this._unsub = scheduler.subscribe('post', () => this._render());
  }

  dispose(): void {
    this._unsub?.();
    this._unsub = null;
  }
}
```

**Verification**:
```bash
rg "requestAnimationFrame" src/engine/subsystems/rendering/EnhancedBloomService.ts
# → 0 hits ✅
pnpm tsx scripts/pryzm-3-functional-day-1.ts
# → raf-owners CHECK: ✅
```

---

### A14-T6 — WebGL context loss handlers

**File**: `packages/renderer-three/src/ContextLossHandler.ts` (new file)

```typescript
import { trace } from '@opentelemetry/api';
import * as THREE from 'three';

const tracer = trace.getTracer('pryzm.renderer-three.context-loss');

export class ContextLossHandler {
  private _renderer: THREE.WebGLRenderer;
  private _onLost: () => void;
  private _onRestored: () => void;

  constructor(
    renderer: THREE.WebGLRenderer,
    onLost: () => void,
    onRestored: () => void
  ) {
    this._renderer = renderer;
    this._onLost = onLost;
    this._onRestored = onRestored;

    renderer.domElement.addEventListener('webglcontextlost', this._handleLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', this._handleRestored, false);
  }

  private _handleLost = (event: Event): void => {
    event.preventDefault();
    const span = tracer.startSpan('pryzm.renderer.contextLost');
    try {
      console.warn('[PRYZM] WebGL context lost — pausing render loop');
      this._onLost();
    } finally {
      span.end();
    }
  };

  private _handleRestored = (): void => {
    const span = tracer.startSpan('pryzm.renderer.contextRestored');
    try {
      console.info('[PRYZM] WebGL context restored — resuming render loop');
      this._onRestored();
    } finally {
      span.end();
    }
  };

  dispose(): void {
    this._renderer.domElement.removeEventListener('webglcontextlost', this._handleLost);
    this._renderer.domElement.removeEventListener('webglcontextrestored', this._handleRestored);
  }
}
```

---

### A14-T7 — CSP tightening

**File**: `server/securityHeaders.js`

The current policy uses `'unsafe-inline'` and `'unsafe-eval'` as broad allowances. Replace with:

```javascript
const cspPolicy = [
  "default-src 'self'",
  // Inline styles needed for ThatOpen UI Web Components (shadow DOM)
  "style-src 'self' 'sha256-<hash-of-inline-style-1>' 'sha256-<hash-of-inline-style-2>'",
  // No inline scripts — all scripts are bundled files
  "script-src 'self'",
  // WASM must be explicitly allowed
  "script-src-attr 'none'",
  // Connect to own API + OTel collector + Supabase
  `connect-src 'self' ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? ''} ${process.env.SUPABASE_URL ?? ''} wss:`,
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
].join('; ');
```

**Note**: Generate SHA256 hashes for any remaining legitimate inline styles using:
```bash
echo -n "<style-content>" | openssl sha256 -binary | base64
```

---

### A14-T8 — npm audit in CI

Added directly to `.github/workflows/ci.yml` (see A14-T1). The `npm audit --audit-level=high` step fails the PR if any new high or critical CVE is introduced.

For existing CVEs (audit baseline): run `npm audit --json > .audit-baseline.json` and commit it. The CI step then compares new audit output against the baseline — only NEW CVEs fail the PR.

---

### A14-T9 — Zod request-body validation

**Pattern to apply to every `server/api/*/routes.js`**:

```javascript
import { z } from 'zod';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  templateId: z.string().uuid().optional(),
});

router.post('/', authMiddleware, async (req, res) => {
  const parsed = CreateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  // Use parsed.data — not req.body
  const { name, description, templateId } = parsed.data;
  // ...
});
```

**Files to update** (run to find all routes with `req.body` without Zod):
```bash
rg "req\.body" server/api/ --type js -l
# Every file returned must have Zod validation added.
```

---

### A14-T10 — C01 §5 amendment

**Edit** `docs/00_Contracts/C01-ARCHITECTURE-AND-GOVERNANCE.md` §5:

Add the following paragraph after the existing §5 content:

> **§5.4 — CI as a hard-fail merge gate (added Wave A14, 2026-05-03)**
> A `.github/workflows/ci.yml` pipeline MUST run on every PR targeting `main` or `develop`. The pipeline MUST run: TypeScript typecheck (`tsc --noEmit`), ESLint with `--max-warnings=0`, all package tests via `turbo run test:ci`, the GA gate scripts in `tools/ga-gate/`, the NFT 15 bundle size gate, and `npm audit --audit-level=high`. No PR may be merged if any of these steps fail. This requirement is a hard architectural constraint, not a "nice to have" — the P1–P8 principles are only machine-enforceable via PR-blocking CI.

---

## §3 — Exit gate

All 10 tasks must be verified before Wave A14 is closed:

```bash
# T1: CI pipeline file exists and is syntactically valid
cat .github/workflows/ci.yml | yq '.jobs.ci.steps | length'
# → ≥ 7

# T2: No unsanitized innerHTML from property data
rg "innerHTML\s*=(?!\s*DOMPurify)" src/ui/ --type ts | grep -i "pset\|prop\|value" | wc -l
# → 0

# T3: OTel exporter wired (env var documented + server imports telemetry-config)
grep -r "initTelemetry" server.js
# → 1 hit

# T4: /health endpoint responds
curl -sf "$REPLIT_DEV_DOMAIN/health" | jq -r '.status'
# → ok

# T5: No rAF in EnhancedBloomService
rg "requestAnimationFrame" src/engine/subsystems/rendering/EnhancedBloomService.ts | wc -l
# → 0

# T6: Context loss handler exists and is imported
ls packages/renderer-three/src/ContextLossHandler.ts
# → EXISTS

# T7: CSP no longer contains 'unsafe-eval' in production config
grep "unsafe-eval" server/securityHeaders.js | wc -l
# → 0

# T8: npm audit step in CI
grep "npm audit" .github/workflows/ci.yml | wc -l
# → ≥ 1

# T9: All server routes use Zod for req.body
rg "req\.body" server/api/ --type js -l | wc -l
# → 0 (all migrated, no raw req.body usage)

# T10: C01 §5 amendment committed
grep "CI as a hard-fail merge gate" docs/00_Contracts/C01-ARCHITECTURE-AND-GOVERNANCE.md | wc -l
# → 1

# Full functional gate still green
pnpm tsx scripts/pryzm-3-functional-day-1.ts
# → ALL CHECKS GREEN
```

---

## §4 — Convergence boolean delta

| Boolean | Before | After | Change |
|---|---|---|---|
| #1 `legacy_src_folders == 1` | ❌ | ❌ | unchanged |
| #2 `window_any_count == 0` | ✅ | ✅ | protected by CI |
| #3 `raf_owners == 1` | ✅ | ✅ | protected + EnhancedBloom fixed |
| #4 `engine_bootstrap_deleted` | ✅ | ✅ | protected |
| #5 `plugin_compliance == 46/46` | ✅ | ✅ | protected |
| #6 `all_workflows_green` | ✅ | ✅ | now CI-enforced |
| #7 `plugin_sdk_published` | ❌ | ❌ | unchanged |
| #8 `headless_published` | ❌ | ❌ | unchanged |
| #9 `marketplace_live` | ❌ | ❌ | unchanged |

**Net**: No new booleans closed. All 5 existing ✅ booleans are now machine-protected by PR-blocking CI — regression is no longer possible without a forced merge override.

---

## §5 — Metric delta (03-CURRENT-STATE.md updates)

| Metric | Before | After |
|---|---|---|
| CI PR-blocking gate | ❌ none | ✅ `.github/workflows/ci.yml` |
| XSS-vulnerable innerHTML sites | ≥ N (unknown) | 0 |
| OTel spans exported to collector | 0 (void) | 482+ to OTLP endpoint |
| Health check endpoint | ❌ | `GET /health` → 200 |
| rAF owners outside scheduler | 1 (EnhancedBloom) | 0 |
| Requests with Zod validation | partial | all POST/PUT endpoints |
| Audit score (estimated) | 5.8/10 | **6.5/10** |

---

## §6 — Prerequisite for Wave A15

Wave A25 (renderer-three) may not start until:
1. `.github/workflows/ci.yml` is green on the main branch.
2. `EnhancedBloomService.ts` no longer owns a `requestAnimationFrame` loop.
3. `pnpm tsx scripts/pryzm-3-functional-day-1.ts` → ALL CHECKS GREEN.
4. `GET /health` responds 200.

These are not optional — without PR-blocking CI, any refactor in Wave A25 (touching 467 THREE importers) risks silent regression on every PR.
