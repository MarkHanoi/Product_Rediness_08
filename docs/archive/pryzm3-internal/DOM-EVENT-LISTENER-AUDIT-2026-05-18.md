# DOM Event Listener Audit — 2026-05-18

## Summary

A systematic payload mismatch was discovered between what stores emit on the
canonical `DOMEventBus` (F.events.17/18) and what the `initBuilders.ts`
listeners expect.  Every store in the `@pryzm/*` ecosystem migrated to emitting
`{ id: string }` as the sole CustomEvent detail (typed-bus pattern, lean
payload).  The corresponding `initBuilders.ts` listeners were **not updated**
and still guard on the old full-object shapes (`{ slab: SlabData }`,
`{ ceiling: CeilingData }`, `{ roofId: string }`, etc.).  The guards always
evaluate to `undefined → false`, so the builder method is **never called** and
no geometry is ever built or removed.

## Root-Cause Pattern

```
Store.add()       →  _bus.emit('bim-X-added',   { id })   ← canonical (F.events.18)
Store.update()    →  _bus.emit('bim-X-updated',  { id })
Store.remove()    →  _bus.emit('bim-X-removed',  { id })

initBuilders.ts listener (OLD):
  window.addEventListener('bim-X-added',
      (e) => { if (e.detail?.x)   builder.buildX(e.detail.x);   });
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                   always undefined → builder never called

initBuilders.ts listener (FIXED):
  window.addEventListener('bim-X-added', (e) => {
      const id = e.detail?.id ?? e.detail?.x?.id;
      if (!id) return;
      const data = xStore.getById(id);
      if (data) builder.buildX(data);
  });
```

## Element-by-Element Audit

| Element   | Store emits          | Listener expected      | Status             |
|-----------|----------------------|------------------------|--------------------|
| Slab      | `{ id }`             | `{ slab }` / `{ slabId }` | **Fixed 2026-05-18 (prev task)** |
| Ceiling   | `{ id }`             | `{ ceiling }` / `{ ceilingId }` | **Fixed 2026-05-18 (this task)** |
| Floor     | `{ id }`             | `{ floor }` / `{ floorId }` | **Fixed 2026-05-18 (this task)** |
| Roof      | `{ id }`             | `{ roof }` / `{ roofId }` | **Fixed 2026-05-18 (this task)** |
| Room      | `{ id, levelId }`    | `e.detail?.id` — correct | ✓ Already correct |
| Beam      | N/A                  | Direct builder injection (`beamStore.setBuilder(beamBuilder)`) | ✓ Different pattern |
| Column    | storeEventBus only   | No DOM bridge (`§COLUMN-SYSTEM-AUDIT-2026 §M14`) | ✓ Different pattern |
| Wall      | wall bus events      | WallTool migrated to bus-first | ✓ Bus path active |
| Curtain Wall | bus events        | CEB bridge (runtime.events) | ✓ Bus path active |
| Stair     | storeEventBus        | StairFragmentBuilder subscribes directly | ✓ Direct sub |
| Door/Window | wallStore events   | WallFragmentBuilder handles openings | ✓ Via wall rebuild |

## CommandType String Mismatch (related — CEB bridge)

Old-style `CommandType` enum values use `UPPER_SNAKE_CASE`:
```typescript
CommandType.CREATE_SLAB   = 'CREATE_SLAB'
CommandType.CREATE_BEAM   = 'CREATE_BEAM'
CommandType.CREATE_STAIR  = 'CREATE_STAIR'
```

CEB (`CommandEventBridge.ts`) switch-cases use `dot.notation`:
```typescript
case 'slab.create':    // never matches 'CREATE_SLAB'
case 'beam.create':    // never matches 'CREATE_BEAM'
case 'stair.create':   // never matches 'CREATE_STAIR'
```

**Impact**: When a tool calls `commandManager.execute(new CreateSlabCommand(...))`,
the CEB never fires the enriched `slab.created` bus event.  The `initBuilders.ts
§FT1` bridge (which subscribes to `runtime.events.on('slab.created', ...)`)
therefore never runs.

**This is NOT the primary rendering bug** — elements created via old-style
`CommandType` commands still call `store.add()` directly inside `execute()`,
so the store is updated.  The rendering breakage was the DOM listener mismatch
above.  However, the CEB bridge (§FT1/§FT2/§FT3) silently no-ops for all old-
style commands, which means:

1. `runtime.events` subscribers never receive `slab.created` / `beam.created`
   etc. for commands executed via `commandManager.execute(OldCommand)`.
2. Undo/redo telemetry via the bus is silent for these commands.
3. Any future subscriber relying on `runtime.events.on('slab.created')` will
   not see slabs created via the old path.

## Migration Path (non-blocking, tracked separately)

Per `MASTER-IMPL-PLAN-FUNCTIONAL-2026-05-18.md` §E-bus.1 / §E-finish.0.A:
- Each tool that still calls `commandManager.execute(OldCommand)` must be
  migrated to `runtime.bus.executeCommand('element.verb', payload)`.
- The old `CommandType` enum entries are then retired.
- Affected tools: `SlabTool` (4 reaches), `StairTool` (1 reach),
  `HandrailTool` (1 reach), `StairPathToolController` (2 reaches).
- Annotation tools use commandManager legitimately (annotation commands are
  not element-level geometry and do not need bus-first migration urgently).

## Contract Additions (this task)

The following contract rule is now enforced in `initBuilders.ts` comments and
in this document:

> **CONTRACT: All `bim-{element}-added/updated/removed` CustomEvent payloads
> MUST carry only `{ id: string }` in `CustomEvent.detail`.  Listeners in
> `initBuilders.ts` MUST resolve the full element data via
> `store.getById(id)`, not by reading the payload directly.**

Any future store that emits these events must follow this contract.
Any future listener must use the `id`-first lookup pattern.

## Validation

All fixes pass the three build gates:
- `tsc --skipLibCheck --noEmit` — clean
- `scripts/ci-check-no-commandmanager.mjs` — ≤ 56 (threshold)
- `vite build` — EXIT:0
