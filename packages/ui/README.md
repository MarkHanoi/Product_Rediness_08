# `@pryzm/ui`

UI host primitives for PRYZM 2.

> Phase 3-B Sprint **S60** — `PanelHost` + `InspectorHost` for the
> PropertyPanel decomposition.
> Spec: `docs/archive/pryzm3-internal/reference/phases/PHASE-3/3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md` §6.

## Why

The legacy `src/ui/property-panel/PropertyPanel.ts` is **3,339 LOC** of inline
element-type switch — `if (kind === 'wall') {…} else if (kind === 'door') {…}`
across every parameter, every analysis surface, every IFC tab. Adding a new
element family means editing the central file; that breaks the plugin
contract.

This package introduces a contribution registry — `PanelHost` — so each
plugin owns the rendering + lifecycle for its own element families
(`plugins/wall/`, `plugins/door/`, …) or its own cross-cutting tab
(`plugins/ifc-inspector/`, `plugins/bcf/`, `plugins/ai-rules/`, …).

The S60 exit criteria (spec line 1508) ask for the legacy file to be deleted
once 12 element-panel contributions land. The `PanelHost` + `InspectorHost`
modules are the foundation; per-element contributions ship sprint-by-sprint
without further coordination through this package.

## Public surface

```ts
import {
  PanelHost,
  type PanelContribution, type PanelContext, type PanelCategory,
  InspectorHost,
  type InspectorTabContribution,
} from '@pryzm/ui';
```

### `PanelHost`

- `register(contribution)` → unregister thunk. Same-id replaces prior.
- `unregister(id)`.
- `mount(context, parentContainer)` — clears the container, mounts every
  applicable contribution in priority order. Idempotent.
- `unmountAll()` — tears down listeners + removes containers.
- `containerFor(id)` — test inspector.

A `PanelContribution` is a `{ id, category, priority, render, unmount?,
shouldShow? }` 5-tuple. Render is synchronous; async work goes in a
follow-up tick.

### `InspectorHost`

Same pattern, but for top-level **tabs**. Tab content is **lazy-mounted**
on first activation — that is what keeps the bundle-size budget (K3-B)
honest: a plugin's tab module is `import()`-able from `render(...)` so
it loads only when the user clicks the tab.

- `registerTab(tab)`.
- `mount(context, root)` — builds the tab strip + body, auto-activates
  the first visible tab.
- `activate(id)` — switches active tab; renders content on first activate.
- `unmountAll()` — tears down only the tabs that ever rendered.
- `active()` — currently-active tab id.

## Loud-fail-soft

Both hosts catch render errors per-contribution: the failing contribution's
container gets `data-render-error="1"` plus a textual sentinel, and the
mount loop continues with the next contribution. One bad plugin must not
take the whole inspector down (per the strategic ADR-014 plugin
isolation policy).

## OTel spans

| Span | Attributes |
|---|---|
| `pryzm.ui.panel-host.mount` | `element_id`, `element_type`, `contribution_count`, `mounted_count` |
| `pryzm.ui.panel-host.unmount-all` | `mounted_count` |
| `pryzm.ui.inspector-host.mount` | `element_id`, `element_type`, `tab_count`, `visible_count` |
| `pryzm.ui.inspector-host.lazy-render` | `tab_id`, `element_id` |

## Tests

```bash
pnpm --filter @pryzm/ui test
```

`__tests__/PanelHost.test.ts` (12) + `__tests__/InspectorHost.test.ts` (9).
S60 D1 status: lit at first commit.
