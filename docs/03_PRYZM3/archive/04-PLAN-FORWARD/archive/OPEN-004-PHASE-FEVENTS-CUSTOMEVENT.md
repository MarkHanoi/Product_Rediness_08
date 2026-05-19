# OPEN-004 — Phase F.events: CustomEvent Bus Elimination

> **Status**: 🔴 ACTIVE — not yet started (blocked until E.5.x complete — see §0)
> **Anchor**: `54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §Phase F.events`, C14 LP-05
> **Gate**: `tools/ga-gate/check-custom-event-packages.ts` (OI-048, ratchet baseline = 307)
> **Effort**: 8 sprints (~28 working days)
> **Outcome**: `packages/event-bus/` created. All 595 cross-subsystem `CustomEvent` dispatches replaced with `runtime.events.emit()`. Event graph visible to OTel. Cross-Worker event routing operational.

---

## §0 — Sequencing

**Prerequisite**: Phase E.5.x (OPEN-002) must be at least Sprint E.5.3 complete before starting F.events.1. Reason: the new `@pryzm/event-bus` package will be a runtime slot, and `composeRuntime()` must receive commands via `runtime.commandBus` before `runtime.events` is a useful addition.

**Can start `packages/event-bus/` creation** (Sprint F.events.0) immediately — it is pure infrastructure with no dependency on E.5.x. Only the call-site migration sprints (F.events.1+) require E.5.x to be underway.

---

## §1 — Current State (2026-05-16 verified)

| Pattern | Count | Gate |
|---|---:|---|
| `new CustomEvent` in `apps/editor/src/` | **288** | No gate (add in F.events.0) |
| `new CustomEvent` in `packages/` | **307** | OI-048 gate (ratchet 307) |
| `dispatchEvent(new CustomEvent(...))` total | **595** | — |
| `@pryzm/event-bus` package | **DOES NOT EXIST** | Must be created first |
| `runtime.events.emit()` production calls | **0** | — |

**The events are invisible to:**
- OpenTelemetry (no `withEventSpan()` hooks)
- Web Workers (DOM events don't cross Worker boundaries)
- Server-side code (no `window` in Node.js)
- Test assertions (cannot intercept DOM events without JSDOM)

---

## §2 — The Target Architecture

### §2A — New `packages/event-bus/` package

```typescript
// packages/event-bus/src/index.ts
export interface EventBus {
  emit<T extends EventType>(type: T, payload: EventPayload<T>): void;
  on<T extends EventType>(type: T, handler: (payload: EventPayload<T>) => void): Unsubscribe;
  off<T extends EventType>(type: T, handler: (payload: EventPayload<T>) => void): void;
}

// Implementations:
// DOMEventBus — wraps CustomEvent for browser (transition period)
// YjsEventBus — routes via Yjs awareness for collaboration events
// NullEventBus — for tests (no DOM)
```

### §2B — Integration with `composeRuntime()`

```typescript
// packages/runtime-composer/src/composeRuntime.ts
const eventBus = createEventBus({ adapter: 'dom' }); // temporary adapter
return {
  ...existingSlots,
  events: eventBus,  // new PryzmRuntime slot
};
```

### §2C — Migration Pattern

```typescript
// BEFORE (legacy)
window.dispatchEvent(new CustomEvent('pryzm:wall-created', {
  detail: { wallId, projectId },
}));

// AFTER (PRYZM3)
runtime.events.emit('pryzm.wall.created', { wallId, projectId });
// → internally: withEventSpan('pryzm.wall.created', () => bus.emit(...))
```

---

## §3 — Sprint Plan

### Sprint F.events.0 (3 days): Create `packages/event-bus/`

**Work:**
1. Scaffold `packages/event-bus/` with `pnpm create @pryzm/package event-bus`
2. Implement `EventBus` interface with three adapters: `DOMEventBus`, `NullEventBus`, `YjsAwarenessEventBus`
3. Define `EventCatalog` type — the complete event-type manifest (all 595 event names)
4. Add `withEventSpan()` wrapper for OTel visibility
5. Export `createEventBus(options)` factory
6. Add `events: EventBus` slot to `PryzmRuntime` type in `packages/runtime-composer/src/types.ts`
7. Wire in `composeRuntime()` with `DOMEventBus` adapter (transition — forwards to `window.dispatchEvent` during migration)
8. Verify: `ls packages/event-bus/src/` contains `EventBus.ts`, `DOMEventBus.ts`, `NullEventBus.ts`, `catalog.ts`

---

### Sprint F.events.1 (3 days): Geometry events — ~80 sites

**Target events** (high-frequency):
- `pryzm:wall-created`, `pryzm:wall-modified`, `pryzm:wall-deleted` (~30 total)
- `pryzm:slab-created`, `pryzm:slab-modified` (~20 total)
- `pryzm:room-detected`, `pryzm:rooms-redetected` (~15 total)
- Element move / copy / align result events (~15 total)

**Work:**
1. Replace each `window.dispatchEvent(new CustomEvent('pryzm:wall-*', ...))` with `runtime.events.emit('pryzm.wall.*', ...)`
2. Update listeners: `window.addEventListener('pryzm:wall-*', ...)` → `runtime.events.on('pryzm.wall.*', ...)`
3. Verify each emitter/listener pair still works with the DOMEventBus adapter

**Gate**: Lower packages CustomEvent ceiling to 227

---

### Sprint F.events.2 (3 days): UI notification events — ~60 sites

**Target events**:
- `pryzm:selection-changed` (~15)
- `pryzm:tool-activated`, `pryzm:tool-deactivated` (~12)
- `pryzm:panel-resize`, `pryzm:view-changed` (~10)
- `pryzm:property-changed` (~23)

**Work:**
1. Migrate UI notification dispatches in `apps/editor/src/ui/` panel components
2. Note: `DOMEventBus` adapter ensures these still work identically during migration

**Gate**: Lower apps ceiling to 228; packages ceiling to 167

---

### Sprint F.events.3 (3 days): AI and batch events — ~50 sites

**Target events**:
- `pryzm:ai-command-started`, `pryzm:ai-command-completed` (~10)
- `pryzm:batch-started`, `pryzm:batch-completed`, `pryzm:batch-progress` (~20)
- `pryzm:ifc-import-progress`, `pryzm:ifc-import-complete` (~20)

**Work:**
1. Migrate AI host event dispatches in `packages/ai-host/src/`
2. Migrate batch coordinator events
3. Migrate IFC import progress events in `plugins/ifc-import/src/`

**Gate**: Lower combined ceiling to 250

---

### Sprint F.events.4 (4 days): Collaboration and presence events — ~40 sites

**Target events**:
- `pryzm:user-joined`, `pryzm:user-left`, `pryzm:cursor-moved` (~15)
- `pryzm:project-sync-started`, `pryzm:project-synced` (~10)
- `pryzm:conflict-detected`, `pryzm:conflict-resolved` (~15)

**Work:**
1. Migrate presence events to `YjsAwarenessEventBus` adapter — these should route through Yjs Awareness (not DOM) for real cross-user delivery
2. This is the first event type to NOT use the DOM adapter — validates the multi-adapter design

**Gate**: Lower ceiling to 200

---

### Sprint F.events.5 (4 days): Plugin and system events — ~80 sites

**Target events**:
- `pryzm:plugin-installed`, `pryzm:plugin-activated` (~10)
- `pryzm:project-opened`, `pryzm:project-saved`, `pryzm:project-closed` (~20)
- `pryzm:undo-applied`, `pryzm:redo-applied` (~10)
- `pryzm:viewport-changed`, `pryzm:camera-moved` (~40)

**Work:**
1. Migrate plugin lifecycle events in `packages/plugin-sdk/src/`
2. Migrate project lifecycle events in `packages/runtime-composer/src/`
3. Migrate undo/redo events in `packages/runtime-undo-stack/src/`

**Gate**: Lower ceiling to 120

---

### Sprint F.events.6 (4 days): Remaining apps/ + plugins/ events — ~100 sites

**Work:**
1. Systematic sweep of all remaining `CustomEvent` dispatches in `apps/editor/src/`
2. Sweep of all remaining dispatches in `plugins/*/src/`
3. Update all `window.addEventListener('pryzm:*', ...)` listeners to `runtime.events.on('pryzm.*', ...)`

**Gate**: Lower ceiling to 20

---

### Sprint F.events.7 (2 days): Remove DOM adapter + hard-fail gate

**Work:**
1. Switch `DOMEventBus` adapter from bridge mode to pure typed implementation (no longer calls `window.dispatchEvent`)
2. Remove DOM adapter fallback
3. Remove `'pryzm:*'` string constants from `global-window.d.ts`
4. Gate: `rg "new CustomEvent\b" apps packages plugins --type ts | grep -v "// |__tests__" | wc -l` → 0

**Milestone verifier**:
```bash
rg "new CustomEvent\b" apps/editor/src --type ts | grep -v "// " | wc -l   # → 0
rg "new CustomEvent\b" packages --type ts | grep -v "// " | wc -l           # → 0
rg "runtime\.events\.emit" apps/editor/src packages --type ts | wc -l       # → ≥ 100
```

---

## §4 — Acceptance Criteria (Sprint F.events.7 Close)

| Verifier | Expected |
|---|---|
| `new CustomEvent` — `apps/editor/src/` | 0 |
| `new CustomEvent` — `packages/` | 0 |
| `runtime.events.emit()` production calls | ≥ 100 |
| `packages/event-bus/` package exists | ✅ |
| Events visible in OTel traces | ✅ (withEventSpan) |
| Presence events routed via Yjs Awareness | ✅ |
| C14 LP-05 status | ELIMINATED |

---

*Stamp: 2026-05-16. Sprint F.events.0 (package creation) can start immediately. Call-site migration starts after E.5.3 complete.*
