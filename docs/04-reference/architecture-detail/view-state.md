# View State Architecture

> Companion: `docs/02-decisions/adrs/0016-view-state-command-driven.md`
> Phase: 1C · Sprint S17 · Owner: A

## Summary

Views are first-class persistent entities in PRYZM 2. `ViewDefinition` records live in
`ViewRegistry` (a `Store`), are persisted via the 1A S04 event log, and are switched via
the standard command bus so they are undoable and observable.

## Layering

```
L4.5  @pryzm/view-state   — ViewDefinitionSchema · ViewRegistry · ViewController
                             (kernel-pure except ViewController which bridges to L5)
L4    @pryzm/stores        — ActiveViewStore (singleton)
L5+   plugins/view/        — CreateView · DeleteView · RenameView · SwitchView · UpdateViewCamera handlers
```

`packages/view-state` depends on `@pryzm/frame-scheduler` and `@pryzm/renderer` only through
`ViewController`; `ViewDefinition`, `ViewRegistry`, and `defaults` are pure and safe to use
from headless Node contexts.

## ViewDefinition schema

```ts
type ViewKind = '3d-perspective' | '3d-orthographic';
// 2A/2B will add: 'plan' | 'section' | 'elevation'

interface ViewDefinition {
  readonly id:               ViewId;       // branded string
  readonly name:             string;
  readonly kind:             ViewKind;
  readonly camera:           CameraDescriptor;
  readonly renderMode:       RenderMode;
  readonly levelFilter:      LevelId | null;
  readonly elementKindFilter: ElementKind[] | null;
}
```

The schema is forward-compatible: adding new `kind` values in 2A/2B leaves existing
`'3d-perspective' | '3d-orthographic'` records valid.

## Stores

| Store | Package | Contents |
|---|---|---|
| `ViewRegistry` | `@pryzm/view-state` | `Map<ViewId, ViewDefinition>` — all saved views |
| `ActiveViewStore` | `@pryzm/stores` | Singleton `{ activeViewId, activeToolId }` |

Both stores persist via the 1A event log and survive session reload.

## Command flow — view switch

```
user click / test
  → bus.executeCommand('view.switch', { viewId })
      → SwitchViewHandler.canExecute — validates viewId in registry
      → SwitchViewHandler.execute    — emits replace patch on active-view store
      → bus commit → ActiveViewStore updated
  → app layer calls ViewController.switchTo(viewId)
      → scheduler.beginMotion()      — suppresses IdleAccumulator (ADR-014)
      → addTickListener 'pre-render' — cubic-eased lerp per frame
      → on t=1: scheduler.endMotion() + activeViewStore.setActive(viewId)
      → span pryzm.view.switch ends
```

## OTel spans

| Span | Key attributes |
|---|---|
| `pryzm.view.switch` | `view.from`, `view.to`, `view.switch.duration_ms`, `transition.eased` |
| `pryzm.view.cameraAnimation.tick` | `t`, `tick.index`, `pose.{x,y,z}` (DEV 1/10 sample) |
| `pryzm.view.create` / `.delete` / `.rename` | `view.id`, `view.name`, `view.kind` |

## Defaults

Two views are seeded on first boot by `ViewRegistry.defaults()`:

- **Default3DView** — `'3d-perspective'` looking from (12, 12, 12) at origin
- **LevelOverview** — `'3d-orthographic'` looking straight down at origin

## Extension points (2A/2B)

- Add `'plan' | 'section' | 'elevation'` to `ViewKind` discriminated union.
- Add `sectionPlane?: { normal, offset }` to `ViewDefinition`.
- `ViewController` animation target is already a `CameraDescriptor` — plan view only
  needs a top-down orthographic pose.
