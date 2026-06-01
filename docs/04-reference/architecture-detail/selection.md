# Selection Architecture

> Phase: 1C · Sprint S16 · Related: `docs/04-reference/architecture-detail/picking.md`

## Overview

Selection is a thin ephemeral layer built on top of picking. Elements are selected
via `selection.select` / `selection.deselect` / `selection.clear` commands; state
lives in `SelectionStore`; visual highlight is applied by `SelectionHighlightCommitter`.

## SelectionStore (`@pryzm/stores`)

```ts
interface SelectionEntry {
  readonly elementId:   string;
  readonly elementKind: ElementKind;
}

// SelectionStore.getState() → ReadonlyMap<string, SelectionEntry>
```

Selection events are tagged `ephemeral: true` — they are pruned from the event log at
session end to prevent the log from growing unbounded under heavy picking activity
(Risk R1C-07).

## Command handlers (`plugins/selection/`)

| Command | Handler | Patches |
|---|---|---|
| `selection.select` | `SelectHandler` | `add` patch per new entry |
| `selection.deselect` | `DeselectHandler` | `remove` patch per removed entry |
| `selection.clear` | `ClearSelectionHandler` | `remove` patch for all entries |

All three handlers set `affectedStores: ['selection']`.

## SelectionHighlightCommitter (`@pryzm/render-runtime`)

Attached to the scene via `attachHighlight(committer, opts)`. On each `SelectionStore`
dirty callback it:

1. Iterates the current selection.
2. Resolves each `elementId` to its scene mesh via the element committer registry.
3. Applies an emissive highlight material (configurable via `HighlightOptions`).
4. Clears the highlight from previously selected elements no longer in the set.

## Interaction flow

```
pointer-down event (browser)
  → PickStrategy.pick(screenPoint, ctx)     → PickResult | null
      → bus.executeCommand('selection.select', { elementId, elementKind })
          → SelectHandler.execute           → add patch
          → SelectionStore updated
          → SelectionHighlightCommitter.onDirty() → highlight mesh
```

## OTel spans

| Span | Key attributes |
|---|---|
| `pryzm.selection.diff` | `selection.added`, `selection.removed`, `selection.total_after` |

## Box-select (future — 2C)

`PickStrategy.pickRect(screenRect, ctx)` skeleton is implemented in S16 but the
full rubber-band box-select UX (drag to select multiple elements) is deferred to
sub-phase 2C. The BVH-based `pickRect` is already available for programmatic use.
