# Element coupling — cross-package cascade rules

Per ADR-0012 (cross-element cascade-rule registration), element
plugins are deliberately ignorant of each other.  Anywhere two element
types must respond to a common geometric event, the relationship lives
in `plugins/cross/` as a `CascadeRule` registered against the
`CommandBus`.

## Active cascade rules (as of S14)

| Rule file                                  | Trigger                                   | Effect                                      |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------- |
| `plugins/cross/src/slab-wall.ts`           | `slab.{move,setBoundary,setThickness,setBaseOffset}` | re-emits `wall.recompute` for hosted walls (S12) |
| `plugins/cross/src/stair-handrail.ts`      | `stair.{move,rotate,setShape,setTreadCount,setRiserHeight,setWidth}` | re-emits `handrail.recompute` for handrails whose `hostId === stairId` (S14) |

## Why some commands deliberately do NOT cascade

| Command            | Why excluded                                                   |
| ------------------ | -------------------------------------------------------------- |
| `stair.setType`    | Material swap is renderer-side; no geometric change.           |
| `stair.delete`     | Cleanup of orphan handrails is a separate selection-driven flow (lifted to PRYZM 1 deletion gestures in S15+); cascading a `recompute` to a doomed host would emit churn and then re-emit a delete for the rail anyway. |
| `slab.setMaterial` | Renderer-only.                                                 |

## How a cascade rule is registered

```ts
import { stairHandrailCascade } from '@pryzm/plugin-cross/stair-handrail';
const dispose = bus.registerCascade(stairHandrailCascade({ stairStore, handrailStore }));
```

`bus.registerCascade` returns a disposer; tests rely on this to keep
suites isolated.  Cascade-emitted commands carry `cause:
'cascade:<rule-id>'` in their audit envelope so downstream observers
can distinguish user-driven vs. cascade-driven events.

## Test surface

* `plugins/cross/__tests__/slab-wall.test.ts` — 7 cases
* `plugins/cross/__tests__/stair-handrail.test.ts` — 7 cases
* `tests/integration/all-12-elements.test.ts` — 12-family producer
  smoke (does not exercise cascades; covered by the per-rule suites)
