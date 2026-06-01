# ADR-026 — UI Binding: Vanilla TS (Path A confirmed); React in deps but unused at runtime

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §29 #18` (React-19 in deps despite vanilla-TS path) |
| Required by | Sprint S31 (Phase 2B start — UI plugin pattern lock; Phase 2A holds no gap-closure work per 2026-04-27 directive) |
| Owner | Architecture lead + Product |
| Implementation | `packages/ui/`; `apps/editor/src/main.ts`; ESLint rule `pryzm/no-react-runtime` |
| Spec dependency | `10-MASTER-IMPLEMENTATION-PLAN-36M.md §1` (Path A); `09-AS-IS-VS-TO-BE.md` §10 (vanilla TS retained) |

---

## Context

The 36-month plan is committed to **Path A — vanilla TypeScript everywhere, no React migration** (per `10-MASTER…` §1). The repo nonetheless has React 19 + react-dom 19 in `package.json` because:
- The legacy preview pages used React for tooling (auth screens, billing settings).
- A few first-party plugins (Stripe-hosted iframe wrappers) use React.
- Some Vite plugins / dev-tools want React peer deps.

`GAP-REVIEW-2026-04-27.md §29 #18` flagged the contradiction: **React in deps despite vanilla-TS binding**. This ADR ratifies the truth and pins the boundary.

---

## Decision

### Part A — production runtime is vanilla TS

The PRYZM 2 production editor (`apps/editor/`) **does not import React or react-dom at runtime**. ESLint rule `pryzm/no-react-runtime` lit at S31 (warning) and S32 (error) blocks `import React from 'react'` and `from 'react-dom/*'` in any `apps/editor/src/**` or `packages/ui/**` or `plugins/**` file.

The 11-wave Visibility-Intent UI, the panels, the toolbars, the canvas hosts, all dialogs — vanilla TS.

### Part B — peripheral surfaces may use React

Allowed React zones (allow-listed in the ESLint rule):
- `apps/auth-pages/` (login / signup / OAuth callback flow — small, isolated, never bundled with the editor).
- `apps/billing-portal/` (Stripe-hosted iframe + react-stripe-js wrapper).
- `apps/marketing-site/` (post-GA; not part of the editor).
- `tools/dev-inspector/` (dev-only debug overlays).

These surfaces are **separate Vite builds** and are deployed as independent assets. They never share a bundle with the editor.

### Part C — packaging discipline

- The editor's Vite config (`apps/editor/vite.config.ts`) marks `react`, `react-dom`, `react/jsx-runtime` as **`external` failing-build** — if any chunk imports them, the build fails.
- The bundle CI gate (per SPEC-12 §7.1) asserts the editor bundle has zero `react` symbols.
- React in `package.json` is acknowledged as **dev/peripheral-only** with a comment in the manifest.

### Part D — UI plugin pattern (vanilla TS)

The pattern for every plugin's UI is:

```ts
// plugins/<family>/tool.ts
import { Tool, PanelHost } from '@pryzm/ui';
export class WallTool implements Tool {
  mount(host: PanelHost) { /* DOM manipulation; no JSX */ }
  unmount() { /* cleanup */ }
}
```

`packages/ui/` provides:
- `PanelHost` — a slot host that owns layout, focus, theme.
- `IconButton`, `TextField`, `Select`, `Slider`, `Tabs`, `ContextMenu`, `Modal` — vanilla TS components with consistent ergonomics.
- `bindReactive(value, fn)` — a tiny reactive primitive (no Svelte / Solid / React; a 50-line `signal` implementation).
- `tokens.ts` — design tokens (colors, spacings, shadows, type ramp).

### Part E — what's deleted

`src/styles/` (30,977 LOC, the legacy UI behemoth) is migrated **into `packages/ui/`** per SPEC-27 §4.3 + this ADR's pattern, in three phases:
- S30–S37 — extract design tokens, primitives.
- S38–S55 — port panels per-family (driven by Phase 2 plugin work).
- S56–S65 — final cleanup; `src/styles/` deleted.

### Part F — re-evaluation gate

Path A is re-evaluated **once**, at the M24 beta gate (per SPEC-15 §10). If by M24:
- Plugin UI productivity is >2× slower than equivalent React (measured by a controlled experiment), AND
- The 11-wave VI engine has been ported,

then Path A2 (Lit / Solid / Svelte 5 — *not* React) is reconsidered. **React is permanently off the table** for the editor; the cost of the 264-command consolidation + 2,078 `(window as any)` removal + Visibility-Intent migration alongside a React rewrite is the original veto reason and remains.

---

## Consequences

**Positive:**
- The contradiction is resolved on paper.
- Build-time enforcement prevents accidental React leak into the editor bundle.
- Peripheral React doesn't cost the editor anything (separate builds).
- Plugin pattern is simple and documented.

**Negative:**
- React in `package.json` confuses new contributors; mitigated by a top-of-file comment + this ADR.
- Vanilla TS UI requires `packages/ui/` discipline; without it, every plugin invents its own pattern.
- We do without the React ecosystem (Storybook, react-testing-library, etc.); we replace with platform tools (Playwright + Chromatic + custom story harness).

---

## Alternatives considered

### A1 — React migration alongside Phase 2
Rejected (the original 10-month estimate from `09-AS-IS-VS-TO-BE` §10). Adding it on top of Phase 2 misses M24 beta.

### A2 — Lit / Web Components
Rejected for v1: introduces another conceptual model. Could be reconsidered at M24 per Part F.

### A3 — Solid / Svelte 5
Rejected for v1: same. The reactive primitive in `packages/ui/` covers our needs.

### A4 — Drop React from the repo entirely
Rejected: peripheral surfaces use it productively. The build-time isolation is sufficient.

---

## Phase rollout

- S31 — ADR-026 land (Phase 2B start; Phase 2A holds no gap-closure); `pryzm/no-react-runtime` ESLint rule warning; bundle gate per SPEC-12 §7.1.
- S32 — rule promoted to error.
- S37 — `packages/ui/` design tokens + primitives lit.
- S55 — half of `src/styles/` migrated.
- S65 — all of `src/styles/` deleted.
- M24 (S48) — Path A re-evaluation gate.
- S72 (M36 GA) — editor bundle verified zero `react` symbols.
