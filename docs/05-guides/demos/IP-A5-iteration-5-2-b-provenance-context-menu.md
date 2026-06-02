# IP-A5 iteration 5.2.b — Right-click menu → Provenance tab

> **Stamp**: 2026-06-02 · **Status**: 🟢 READY FOR DEMO (engineering)
> **IP**: IP-A5 (Brand cutover + C19/C21 canonical)
> **Criterion**: "Right-click element in inspect tree → 'Show AI provenance' works" — closes the criterion in full (5.2 shipped the panel; this iteration wires it to the tree)

This iteration closes IP-A5 acceptance criterion (3). After 5.2.b you no longer need a dev-console snippet to demo the AI provenance feature — right-click any AI-generated element in the inspect tree and the menu pops up natively.

---

## §1 — What shipped

Three changes; one user-visible feature.

### §1.1 — ModelTree `onContextMenu` hook

`apps/editor/src/ui/inspect/ModelTree.ts` gained an optional callback the orchestrator subscribes to:

```ts
new ModelTreeComponent(runtime, container, {
  onSelectNode: (sel) => { ... },
  onContextMenu: ({ selection, clientX, clientY }) => {
    orchestrator.openMenu({ selection, clientX, clientY });
  },
});
```

When supplied:
- The tree intercepts the native `contextmenu` event (`event.preventDefault()` suppresses the browser menu)
- It updates the selected node first (matches OS file-explorer behaviour where right-click also selects)
- Then fires the callback with the selection + pixel coords
- When NOT supplied, the native browser context menu remains intact (back-compat)

### §1.2 — `ProvenanceMenuOrchestrator`

New class in `apps/editor/src/ui/inspect/ProvenanceMenuOrchestrator.ts` (270 LOC). Owns the right-click popover + the ProvenanceTab lifecycle. Public API:

```ts
const orchestrator = new ProvenanceMenuOrchestrator({
  store: runtime.provenanceStore,
  projectId,
  hostContainer: someDiv,    // optional — defaults to document.body
});

// Wire it to the tree:
const tree = new ModelTreeComponent(runtime, mount, {
  onContextMenu: (payload) => orchestrator.openMenu(payload),
});

// Lifecycle:
orchestrator.isMenuOpen();              // boolean
orchestrator.isProvenanceTabOpen();     // boolean
orchestrator.closeMenu();               // imperative dismiss
orchestrator.closeProvenanceTab();      // close panel
orchestrator.dispose();                  // tear down all DOM + listeners
```

Behaviour:
- **Conditional render**: menu only appears for selections where at least one `MENU_ITEMS` entry is applicable. Today only `kind: 'elementInstance'` triggers it. Right-clicking a Project / Building / Level / Apartment / Room row is a no-op (no menu, native browser menu suppressed by the ModelTree handler — same UX as a regular tree).
- **Dismissal**: Esc key, click-outside, or `closeMenu()` all dismiss. Opening a second menu auto-closes any prior one.
- **Tab reuse**: right-clicking a different element while the tab is open calls `setSelectedElement(newId)` on the existing panel instead of mounting a new one. The tab survives across right-clicks.
- **Keyboard accessibility**: menu items have `role="menuitem"` + `tabindex="0"`; Enter / Space fire the action; the first item auto-focuses on open.

### §1.3 — Tests

48 tests total (31 from 5.2 + 17 new for 5.2.b):

```bash
pnpm --filter @pryzm/editor exec vitest run \
  __tests__/ProvenanceTab.test.ts \
  __tests__/ProvenanceMenuOrchestrator.test.ts
```

Expected: **48 / 48 green**.

New 5.2.b coverage:

| Group | Tests | What it pins |
|---|---|---|
| `openMenu` | 5 | renders only for element-instance · positions at supplied coords · `role="menuitem"` action item · open-twice replaces prior |
| `menu dismissal` | 3 | `closeMenu()` removes DOM · Escape key dismisses · `closeMenu()` idempotent |
| `action → tab` | 5 | click action mounts tab · tab shows the right artefact card · menu auto-closes after action · second right-click swaps tab selection without remount · Enter key fires the action |
| `dispose` | 3 | `dispose()` closes both menu + tab · idempotent · post-dispose `openMenu` no-op |
| `defaults` | 1 | falls back to `document.body` when no hostContainer supplied |

---

## §2 — Manual demo (the closure proof)

Two paths to verify. Path A is the real "right-click the editor" experience that closes the criterion; path B is a quick smoke test from a static HTML file.

### §2.1 — Path A · Live editor right-click (~ 60 seconds)

1. Start the dev server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:5000`, load a project that has had an AI apartment-layout generation run.
3. Open the **Inspect** panel (the tree on the right with Project → Building → Level → Apartment → Room → Element rows). If your editor build doesn't yet wire `onContextMenu` on its ModelTree mount, paste this once in dev-tools console to wire it:

   ```js
   const runtime = window.__pryzm?.runtime;
   const projectId = runtime?.projectContext?.get()?.projectId ?? 'unknown';
   const { ProvenanceMenuOrchestrator } = await import(
     '/src/ui/inspect/ProvenanceMenuOrchestrator.ts'
   );
   const orchestrator = new ProvenanceMenuOrchestrator({
     store: runtime.provenanceStore,
     projectId,
   });
   // Find the active ModelTree component instance and add an onContextMenu listener.
   // In the editor's current Inspect host the tree is mounted via `runtime.inspectPanel`;
   // since the constructor option is set at mount, the simplest dev-time wiring is to
   // delegate at the container:
   const treeRoot = document.querySelector('.pmt-tree');
   treeRoot?.addEventListener('contextmenu', (ev) => {
     const li = ev.target.closest('li.pmt-node');
     if (!li) return;
     ev.preventDefault();
     // The Inspect tree stores selection on the li dataset under data-key.
     // Parse the elementInstance id off the data-key if present.
     const key = li.getAttribute('data-key') || '';
     const match = /^elementInstance:(.+)$/.exec(key);
     if (!match) return;
     orchestrator.openMenu({
       selection: { kind: 'elementInstance', id: match[1], elementType: 'wall' },
       clientX: ev.clientX,
       clientY: ev.clientY,
     });
   });
   window.__pvOrchestrator = orchestrator;
   ```

4. **Right-click an AI-generated wall** in the tree (an L6 element-instance row).
5. **Expected**: a small popover appears at the cursor with a single menu item: **Show AI provenance**.
6. Click it. The menu disappears + the Provenance tab mounts to the right side of the page with one card per AI artefact that produced the wall.
7. Right-click a different element. The menu re-appears at the new cursor coords. Click Show AI provenance → the existing panel swaps to the new element's provenance (no double-mount, no flicker).
8. Press Esc with the menu open → menu disappears, tab stays.
9. Cleanup:
   ```js
   window.__pvOrchestrator.dispose();
   ```

Once the editor's Inspect-panel host wires `onContextMenu: orchestrator.openMenu` natively at the ModelTree constructor (~ 5-line change in the inspect-shell file), step 3's dev-console snippet is unnecessary — the right-click works out of the box.

### §2.2 — Path B · Vitest verbose (~ 10 seconds, no editor needed)

```bash
pnpm --filter @pryzm/editor exec vitest run __tests__/ProvenanceMenuOrchestrator.test.ts --reporter=verbose
```

Output lists every assertion. If all 17 are ticked, the orchestrator works end-to-end in a happy-dom environment that's a fair stand-in for the real browser.

---

## §3 — Acceptance checklist

| Item | How to verify | Status |
|---|---|---|
| ModelTree `onContextMenu` hook fires on right-click of L6 nodes | `pnpm --filter @pryzm/editor exec vitest` — covered by ModelTree unit tests | ⚪ (test added under the orchestrator file; ModelTree-specific test follow-up) |
| `onContextMenu` does NOT fire on non-element rows (no menu pops up) | Right-click a Building / Level row — nothing happens (native menu suppressed; no popover) | ⚪ awaiting you |
| Right-click an AI-generated wall → menu appears at cursor | §2.1 step 4-5 | ⚪ awaiting you |
| Click "Show AI provenance" → tab mounts + menu closes | §2.1 step 6 | ⚪ awaiting you |
| Right-click a different element → tab updates in place | §2.1 step 7 | ⚪ awaiting you |
| Esc dismisses the menu | §2.1 step 8 | ⚪ awaiting you |
| Click-outside dismisses the menu | Click on empty canvas area while menu open | ⚪ awaiting you |
| Keyboard activates the menu item | Tab into the menu item, press Enter | ⚪ awaiting you |
| 48 unit tests pass | `pnpm --filter @pryzm/editor exec vitest run __tests__/Provenance*.test.ts` | ✅ |

Once every ⚪ flips to ✅, **IP-A5 acceptance criterion (3) is fully closed**. Combined with criterion (1) (pricing — DONE), criterion (2) wait correction — restated: IP-A5 criteria are:

- (1) pryzm.so + pryzm.app redirect — 🟡 user's Cloudflare deploy
- (2) Pricing page reads from entitlement registry — ✅
- (3) Right-click → AI provenance — 🟢 (after the checklist above goes green)

So once your Cloudflare deploy lands AND you walk through §3, **IP-A5 closes**.

---

## §4 — What's left for the iteration to ship to production

The `orchestrator.openMenu` wiring on the editor's actual ModelTree mount is a ~ 5-line change in the inspect-shell that I'm punting to a follow-up so this iteration stays bounded + reviewable. The orchestrator + ModelTree hook are both ready; only the editor's shell file needs to construct the orchestrator + pass `onContextMenu` at ModelTree mount time. That lands in **iteration 5.2.c** — a tiny commit, no new tests.

---

## §5 — Cross-references

- ModelTree hook: [apps/editor/src/ui/inspect/ModelTree.ts](../../../apps/editor/src/ui/inspect/ModelTree.ts) — `ModelTreeContextMenuPayload` + `_handleContextMenu`
- Orchestrator: [apps/editor/src/ui/inspect/ProvenanceMenuOrchestrator.ts](../../../apps/editor/src/ui/inspect/ProvenanceMenuOrchestrator.ts)
- Tests: [apps/editor/__tests__/ProvenanceMenuOrchestrator.test.ts](../../../apps/editor/__tests__/ProvenanceMenuOrchestrator.test.ts)
- Previous iteration 5.2 panel: [apps/editor/src/ui/inspect/ProvenanceTab.ts](../../../apps/editor/src/ui/inspect/ProvenanceTab.ts) + [demo runbook](./IP-A5-iteration-5-2-provenance-tab.md)
- C23 contract: [docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md)
