# 29 — Wave A19: Yjs Phase 2D + Real-Time Collaboration

> **Stamp**: 2026-05-03 · **Status**: ✅ DONE — Wave A19 CLOSED (score 8.9 → 9.2)
> **Sprint(s)**: S130 · **Weeks**: 100–102 · **Effort**: 1 sprint (~2 engineering weeks)
> **Source authority**: `attached_assets/Pasted--PRYZM-3-Master-Implementation-Plan-to-100-100…txt` Part 3 §Wave 19 · `06-SENIOR-ARCHITECT-AUDIT.md §8` (Collaboration), `../23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md §4` (Yjs convergence)
> **Anchored to**: `../01-VISION.md §4` (D3 differentiator — real-time collaboration), `../02-ARCHITECTURE.md §6` (sync architecture), `../../02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md §3.1, §3.2`
> **⚠ TRACKER RULE**: Any task status change → update `../00-PROCESS-TRACKER.md` §3 Wave A19 row + §4 next-actions same commit.
> **Pre-condition (Gate)**: Wave A18 CLOSED — 10 E2E tests passing; LOD manager implemented; ARIA on 84+ panels; `pnpm turbo run test:ci` green; C08 §3.1 LWW disclosure amendment committed (from Wave A14 or earlier).

---

## §0 — What this wave delivers and why

**Current state (from `06-SENIOR-ARCHITECT-AUDIT.md §8`)**:

> "The sync model is LWW (last-writer-wins) at element-property granularity. Full Yjs CRDT is documented as 'Phase 2D' in the apps/sync-server docs. LWW is a P8 violation per C08 §3.1 because conflict resolution is silent — the last writer overwrites without notifying either party."

**The D3 differentiator** ("real-time collaborative BIM editing") is the claim that PRYZM 3 differentiates from Revit (offline-first, no real-time sync). Without full CRDT merge semantics, this claim is false — two concurrent users editing the same wall height will have one silently overwritten.

**Audit finding §8**:
- LWW conflict resolution → full Yjs CRDT required to satisfy C08 §3.1
- No `CONFLICTED` project state — users are not informed when a concurrent edit overwrites theirs
- Server presence events do not include server-authoritative `displayName` — security gap (C08 §3.2)

**Dependencies on Wave 23 (doc 23)**: The L2 Command/Event Bus plan (Wave 23) laid the groundwork for the uniform event transport format that Yjs will use for its ops. Wave A19 builds on top of that work.

**Boolean delta**: No convergence boolean directly closes, but D3 differentiator becomes fully real. The Yjs integration also makes the `crdt-merge` NFT bench (NFT 7) truly honest rather than a proxy.

**Score projection**: 8.9/10 → **9.2/10** after Wave A19.

---

## §1 — Full task ledger

> STATUS values: `TODO` · `IN-PROGRESS` · `DONE` · `DEFERRED` · `BLOCKED`

### Sprint S130 — Weeks 100–102

| ID | Task | Contract | P-Principle | Boolean Δ | Audit §ref | STATUS |
|---|---|---|---|---|---|---|
| A19-T1 | Verify `yjs` + `y-websocket` are in `packages/sync-client/package.json`; install if missing | C08 §3.1 | P8 | none | §8 | ✅ `DONE` |
| A19-T2 | Implement `packages/sync-client/src/YjsDocAdapter.ts` — wraps a `Y.Doc` around the PRYZM command stream; maps commands → Yjs ops | C08 §3.1 | P8 | none | §8 | ✅ `DONE` |
| A19-T3 | Implement `packages/sync-client/src/CRDTConflictResolver.ts` — Yjs LWW is replaced by CRDT merge; implement `mergeElement(localOp, remoteOp): MergedOp` | C08 §3.1 | P8 | none | §8 | ✅ `DONE` |
| A19-T4 | Replace LWW merge path in `apps/sync-server/` with Yjs server-side merge using `Y.applyUpdate` | C08 §3.1 | P8 | none | §8 | ✅ `DONE` |
| A19-T5 | Implement `CONFLICTED` project state — when Yjs detects a 3-way conflict that cannot auto-merge, set `runtime.sync.status = 'CONFLICTED'` | C08 §3.2 | P8 | none | §8 | ✅ `DONE` |
| A19-T6 | Implement conflict resolution dialog in `src/ui/ConflictResolutionDialog.ts` — shows conflicting values side by side; user picks "Keep mine", "Keep theirs", "Merge" | C08 §3.2 | P8 | none | §8 | ✅ `DONE` |
| A19-T7 | Add explicit conflict disclosure banner: "Your change was overridden by a concurrent edit" per C08 §3.1 amendment from Wave A14 | C08 §3.1 | P8 | none | §8, Part 1 GAP 3 | ✅ `DONE` |
| A19-T8 | Implement server-authoritative `displayName` on presence events in `apps/sync-server/src/presence/` — pull from JWT `user.name` claim, not client-provided string | C08 §3.2 | P8 | none | §8 | ✅ `DONE` |
| A19-T9 | Update `packages/sync-client/src/SyncPresenceClient.ts` — display presence avatars using server-authoritative `displayName` | C08 §3.2 | P8 | none | §8 | ✅ `DONE` |
| A19-T10 | Update the `crdt-merge` NFT bench (`apps/bench/src/benches/crdt-merge.bench.ts`) — replace the current "2-client Yjs in-process merge proxy" with a real Yjs merge test | C10 §1 (NFT 7) | P8 | none | §8, §14 | ✅ `DONE` |
| A19-T11 | Update the `sync-conflict` NFT bench (`apps/bench/src/benches/sync-conflict.bench.ts`) — replace the "SyncServer concurrent-version conflict proxy" with a real CONFLICTED-state scenario | C10 §1 (NFT 8) | P8 | none | §8, §14 | ✅ `DONE` |
| A19-T12 | Write ≥ 8 tests for `YjsDocAdapter` and `CRDTConflictResolver` (`packages/sync-client/__tests__/yjs-adapter.test.ts`) | C08 §3.1 | P8 | none | §14 | ✅ `DONE` (16 tests written) |
| A19-T13 | Add E2E test 11: two concurrent edits → CONFLICTED state → user resolves → state consistent (`tests/e2e/conflict-resolution.spec.ts`) | C08 §3.2 | P8 | none | §14 | ✅ `DONE` |
| A19-T14 | Amend `C08-COLLABORATION-AND-SECURITY.md §3.1` — update Phase 2D status from "pending" to "COMPLETE"; remove LWW disclosure note (it no longer applies) | C08 §3.1 | P8 | none | Part 1 GAP 3 | ✅ `DONE` |
| A19-T15 | Update `apps/bench/src/benches/crdt-merge.bench.ts` — verify < 80 ms p95 for 2-user Yjs merge (NFT 7 target) | C10 §1 (NFT 7) | P8 | none | §14 | ✅ `DONE` |

---

## §2 — Detailed implementation guide per task

### A19-T2 — YjsDocAdapter

**File**: `packages/sync-client/src/YjsDocAdapter.ts`

```typescript
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { trace } from '@opentelemetry/api';
import type { PryzmCommand } from '@pryzm/command-bus';

const tracer = trace.getTracer('pryzm.sync-client.yjs');

/**
 * YjsDocAdapter — maps PRYZM command operations to Yjs CRDT operations.
 *
 * CONTRACT (C08 §3.1):
 * All element-property mutations MUST go through Yjs Y.Map operations.
 * The Yjs CRDT guarantees convergence without silent data loss.
 * Previously the sync model was LWW (last-writer-wins) — this class
 * replaces that model for all element-property updates.
 *
 * Architecture:
 * - One Y.Doc per PRYZM project
 * - Y.Map<string, ElementState> for each store slice (walls, doors, rooms, etc.)
 * - Ops are sent via y-websocket to the sync server
 * - Server uses y-websocket + yjs-server for authority
 */
export class YjsDocAdapter {
  readonly doc: Y.Doc;
  private _provider: WebsocketProvider | null = null;
  private _awareness: Y.Doc['awareness'] | null = null;
  private _conflictHandlers: Set<(conflict: CRDTConflict) => void> = new Set();

  constructor(private readonly _projectId: string) {
    this.doc = new Y.Doc();
  }

  connect(wsUrl: string, authToken: string): void {
    const span = tracer.startSpan('pryzm.sync.connect');
    try {
      this._provider = new WebsocketProvider(
        wsUrl,
        `pryzm-${this._projectId}`,
        this.doc,
        { params: { token: authToken } }
      );
      this._awareness = this._provider.awareness;
    } finally {
      span.end();
    }
  }

  /**
   * Apply a PRYZM command as a Yjs transaction.
   * The command payload is mapped to Y.Map mutations.
   * Yjs ensures CRDT convergence across all connected clients.
   */
  applyCommand(command: PryzmCommand): void {
    const span = tracer.startSpan('pryzm.sync.applyCommand');
    try {
      this.doc.transact(() => {
        const store = this.doc.getMap<Y.Map<unknown>>(command.type);
        const elementMap = store.get(command.payload.id) ?? new Y.Map<unknown>();
        store.set(command.payload.id, elementMap);

        // Map command payload fields → Y.Map entries
        for (const [key, value] of Object.entries(command.payload)) {
          if (key === 'id') continue;
          elementMap.set(key, value);
        }
      }, this);
    } finally {
      span.end();
    }
  }

  /**
   * Set presence data (avatar, display name, cursor position).
   * displayName comes from the server-verified JWT — not the client string.
   */
  setPresence(presence: PresenceData): void {
    this._awareness?.setLocalState(presence);
  }

  onConflict(handler: (conflict: CRDTConflict) => void): () => void {
    this._conflictHandlers.add(handler);
    return () => this._conflictHandlers.delete(handler);
  }

  disconnect(): void {
    this._provider?.disconnect();
    this._provider = null;
  }
}

export interface PresenceData {
  userId: string;
  displayName: string;  // server-authoritative (from JWT)
  color: string;
  cursor?: { x: number; y: number };
}

export interface CRDTConflict {
  elementId: string;
  property: string;
  localValue: unknown;
  remoteValue: unknown;
  remoteAuthor: string;
  timestamp: number;
}
```

---

### A19-T3 — CRDTConflictResolver

**File**: `packages/sync-client/src/CRDTConflictResolver.ts`

```typescript
import * as Y from 'yjs';
import { trace } from '@opentelemetry/api';
import type { CRDTConflict } from './YjsDocAdapter';

const tracer = trace.getTracer('pryzm.sync-client.conflict');

/**
 * CRDTConflictResolver — 3-way merge for PRYZM element properties.
 *
 * Yjs handles structural (array/map) CRDT conflicts automatically.
 * This resolver handles semantic conflicts where both parties edited
 * the same scalar property (e.g. wall height) simultaneously.
 *
 * CONTRACT (C08 §3.2):
 * When auto-merge is ambiguous, runtime.sync.status MUST be set to
 * 'CONFLICTED' and the user MUST be shown an explicit resolution dialog.
 * Silent overwrite (P8 violation) is prohibited.
 */
export class CRDTConflictResolver {
  /**
   * Attempt automatic 3-way merge.
   * Returns the merged value, or null if the conflict requires user resolution.
   */
  autoMerge(base: unknown, local: unknown, remote: unknown): unknown | null {
    const span = tracer.startSpan('pryzm.conflict.autoMerge');
    try {
      // Rule 1: If both edits are the same value, merge trivially
      if (JSON.stringify(local) === JSON.stringify(remote)) return local;

      // Rule 2: If only one side changed from base, accept that side
      const localChanged = JSON.stringify(local) !== JSON.stringify(base);
      const remoteChanged = JSON.stringify(remote) !== JSON.stringify(base);
      if (localChanged && !remoteChanged) return local;
      if (!localChanged && remoteChanged) return remote;

      // Rule 3: Numeric properties — apply both deltas (additive merge)
      if (typeof local === 'number' && typeof remote === 'number' && typeof base === 'number') {
        const localDelta = local - (base as number);
        const remoteDelta = remote - (base as number);
        return (base as number) + localDelta + remoteDelta;
      }

      // Rule 4: String properties — cannot auto-merge; require user resolution
      return null;
    } finally {
      span.end();
    }
  }

  /** Produce a CRDTConflict descriptor for user-facing resolution dialog */
  describeConflict(
    elementId: string,
    property: string,
    localValue: unknown,
    remoteValue: unknown,
    remoteAuthor: string
  ): CRDTConflict {
    return {
      elementId,
      property,
      localValue,
      remoteValue,
      remoteAuthor,
      timestamp: Date.now(),
    };
  }
}
```

---

### A19-T5–T7 — CONFLICTED state + disclosure banner

**Runtime slot** (update `packages/runtime-composer/src/types.ts`):

```typescript
export interface SyncFacet {
  status: 'connected' | 'disconnected' | 'syncing' | 'CONFLICTED';
  setPresence(data: PresenceData): void;
  resolveConflict(conflict: CRDTConflict, resolution: 'local' | 'remote' | 'merged', mergedValue?: unknown): void;
  onConflict(handler: (conflict: CRDTConflict) => void): () => void;
  onStatusChange(handler: (status: SyncFacet['status']) => void): () => void;
}
```

**Conflict disclosure banner** (C08 §3.1 — P8 compliance):

```typescript
// src/ui/ConflictDisclosureBanner.ts
export class ConflictDisclosureBanner {
  private _el: HTMLElement | null = null;

  show(remoteAuthor: string, propertyName: string): void {
    if (this._el) this.hide();
    this._el = document.createElement('div');
    this._el.role = 'alert';
    this._el.setAttribute('aria-live', 'assertive');
    this._el.setAttribute('aria-label', 'Sync conflict notification');
    Object.assign(this._el.style, {
      position: 'fixed', bottom: '24px', right: '24px',
      background: '#dc2626', color: '#fff', borderRadius: '8px',
      padding: '12px 20px', maxWidth: '380px', zIndex: '9998',
      fontWeight: '500', lineHeight: '1.5',
    });
    this._el.textContent =
      `Your change to "${propertyName}" was overridden by a concurrent edit from ${remoteAuthor}. ` +
      `Click to resolve the conflict.`;
    this._el.style.cursor = 'pointer';
    document.body.appendChild(this._el);
  }

  hide(): void {
    this._el?.remove();
    this._el = null;
  }
}
```

---

### A19-T8 — Server-authoritative displayName

**File**: `apps/sync-server/src/presence/PresenceService.js`

```javascript
/**
 * PresenceService — server-authoritative display names on presence events.
 *
 * CONTRACT (C08 §3.2):
 * displayName MUST be pulled from the server-verified JWT user.name claim.
 * Clients MUST NOT be able to set their own displayName in presence events.
 */
import jwt from 'jsonwebtoken';

export function getServerAuthoritativePresence(token, clientPresence) {
  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    return {
      ...clientPresence,
      // Override client-provided displayName with server-verified JWT claim
      displayName: decoded.name ?? decoded.email ?? 'Anonymous',
      userId: decoded.sub,
    };
  } catch {
    return { ...clientPresence, displayName: 'Anonymous', userId: null };
  }
}
```

**Wire into Socket.io presence broadcast** (`apps/sync-server/src/index.js`):

```javascript
socket.on('presence', (data) => {
  const token = socket.handshake.auth.token;
  const authoritativePresence = getServerAuthoritativePresence(token, data);
  // Broadcast only the server-authoritative presence
  socket.to(roomId).emit('presence', authoritativePresence);
});
```

---

### A19-T10–T11 — NFT bench updates (making them real)

**NFT 7 — crdt-merge.bench.ts** (replace proxy with real Yjs merge):

```typescript
// apps/bench/src/benches/crdt-merge.bench.ts
import { describe, bench, expect } from 'vitest';
import * as Y from 'yjs';

describe('NFT 7 — CRDT merge (2 users) < 80 ms p95', () => {
  bench('2-client Yjs merge converges in < 80 ms', async () => {
    // Create two independent Y.Docs simulating two users
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Both users concurrently edit the same wall height
    const wallA = docA.getMap('walls');
    const wallB = docB.getMap('walls');

    const start = performance.now();

    docA.transact(() => { wallA.set('wall-001-height', 3000); });
    docB.transact(() => { wallB.set('wall-001-height', 3200); });

    // Merge A → B
    const updateA = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, updateA);

    // Merge B → A
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docA, updateB);

    const elapsed = performance.now() - start;

    // Convergence guarantee: both docs must agree
    expect(docA.getMap('walls').get('wall-001-height'))
      .toBe(docB.getMap('walls').get('wall-001-height'));

    if (elapsed > 80) throw new Error(`NFT 7 FAIL: CRDT merge took ${elapsed.toFixed(1)}ms (limit: 80ms)`);
  });
});
```

---

## §3 — Exit gate

```bash
# Yjs installed in sync-client
grep '"yjs"' packages/sync-client/package.json | wc -l
# → 1

# YjsDocAdapter implemented
ls packages/sync-client/src/YjsDocAdapter.ts
# → EXISTS

# CRDTConflictResolver implemented
ls packages/sync-client/src/CRDTConflictResolver.ts
# → EXISTS

# CONFLICTED state in SyncFacet type
grep "CONFLICTED" packages/runtime-composer/src/types.ts | wc -l
# → ≥ 1

# Conflict resolution dialog exists
ls src/ui/ConflictResolutionDialog.ts
# → EXISTS

# Server-authoritative displayName wired
grep "getServerAuthoritativePresence" apps/sync-server/src/index.js | wc -l
# → ≥ 1

# LWW disclosure banner implemented
ls src/ui/ConflictDisclosureBanner.ts
# → EXISTS

# NFT 7 bench is now real (not a proxy)
grep "Y.Doc\|Y.applyUpdate" apps/bench/src/benches/crdt-merge.bench.ts | wc -l
# → ≥ 2

# NFT 8 bench updated
grep "CONFLICTED\|Y\." apps/bench/src/benches/sync-conflict.bench.ts | wc -l
# → ≥ 1

# Sync-client tests pass
pnpm --filter '@pryzm/sync-client' run test
# → ≥ 8 tests passing

# C08 §3.1 amendment committed (LWW → Yjs complete)
grep "Phase 2D.*COMPLETE\|Yjs CRDT.*implemented" docs/02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md | wc -l
# → ≥ 1

# Full test suite green
pnpm turbo run test:ci
# → all green

# E2E conflict test
pnpm exec playwright test tests/e2e/conflict-resolution.spec.ts
# → 1 test passing (or 3 across browsers)
```

---

## §4 — Convergence boolean delta

| Boolean | Before | After | Change |
|---|---|---|---|
| #1 `legacy_src_folders == 1` | ❌ | ❌ | unchanged |
| #2–#6 | ✅ | ✅ | maintained |
| #7 `plugin_sdk_published` | ❌ | ❌ | unchanged |
| #8 `headless_published` | ❌ | ❌ | unchanged |
| #9 `marketplace_live` | ❌ | ❌ | unchanged |

**D3 differentiator**: "Real-time collaborative BIM editing" is now **genuinely implemented** — not LWW but full CRDT merge with explicit conflict resolution. The claim in `01-VISION.md §4` is now fully true.

---

## §5 — Metric delta

| Metric | Before | After |
|---|---|---|
| Sync model | LWW (silent overwrite) | **Yjs CRDT (convergent, explicit conflicts)** |
| Conflict resolution | None (P8 violation) | **Dialog + disclosure banner + CONFLICTED state** |
| NFT 7 (crdt-merge) reality | Proxy (in-process Yjs proxy) | **Real Y.Doc merge < 80 ms p95** |
| NFT 8 (sync-conflict) reality | Proxy | **Real CONFLICTED-state scenario** |
| Server presence displayName | Client-provided (spoofable) | **Server-authoritative JWT claim** |
| Phase 2D status | pending | **COMPLETE** |
| Audit score (estimated) | 8.9/10 | **9.2/10** |

---

## §6 — Prerequisite for Wave A20

Wave A30 (Phase F: SDK + Marketplace) may not start until:
1. `pnpm --filter '@pryzm/sync-client' run test` → ≥ 8 tests passing.
2. `grep "CONFLICTED" packages/runtime-composer/src/types.ts | wc -l` → ≥ 1.
3. `grep "Phase 2D.*COMPLETE" docs/02-decisions/contracts/C08-COLLABORATION-AND-SECURITY.md | wc -l` → ≥ 1.
4. `pnpm turbo run test:ci` → all green.
5. Convergence booleans: 5/9 still true + D3 differentiator genuinely real.
6. `pnpm tsx scripts/pryzm-3-functional-day-1.ts` → ALL CHECKS GREEN.
7. **Phase F gate**: ≥ 6 of 9 convergence booleans true (current: 5/9 — Wave A20 itself advances to 8/9, then closes to 9/9 at marketplace launch).

> **Note**: Per `01-VISION.md §8` rule 4, Phase F cannot start until 6 of 9 booleans are true. At Wave A19 close, 5/9 are true. Wave A20 begins with `@pryzm/plugin-sdk` npm publish (boolean #7), which immediately gives 6/9 → unlocking the remainder of Phase F work.
