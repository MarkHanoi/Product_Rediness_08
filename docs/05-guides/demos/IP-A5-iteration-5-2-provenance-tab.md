# IP-A5 iteration 5.2 — Provenance tab demo runbook

> **Stamp**: 2026-06-02 · **Status**: 🟢 READY FOR DEMO (engineering)
> **IP**: IP-A5 (Brand cutover + C19/C21 canonical)
> **Criterion**: "Right-click element in inspect tree → 'Show AI provenance' works"
> **Closure rank**: 1 — DRIVING NOW

This is the test-and-demo half of the Agile loop: code shipped at `apps/editor/src/ui/inspect/ProvenanceTab.ts`; tests at `apps/editor/__tests__/ProvenanceTab.test.ts`. This document is how you verify the criterion is closed.

---

## §1 — The 30-second story

The PRYZM editor calls AI models to generate apartment layouts. Per [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md), every AI call writes a row into the ProvenanceStore: model name, prompt hash, cost, approval status, the element ids it produced. The Provenance tab makes that audit trail visible:

> User clicks an AI-generated wall in the Inspect tree → a "Provenance" tab fills with cards, one per AI artefact that produced the wall. Each card shows the model, the cost, the approval state, the deterministic seed (or "non-deterministic"), the prompt SHA, and a redacted prompt preview.

That's the C23 §1.13 ["auditable from selection"](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) promise made literal.

---

## §2 — Automated verification (the test side)

Run the suite — should be green:

```bash
pnpm --filter @pryzm/editor exec vitest run __tests__/ProvenanceTab.test.ts
```

Expected: **31 tests pass**. Coverage:

| Group | Tests | What it pins |
|---|---|---|
| `selectArtefactsForElement` | 3 | filtering by `producedElementIds.includes(elementId)` |
| `formatApprovalStatus` + `approvalStatusClass` | 2 | every approval-status enum maps to a label + a `pv-badge--*` class; success/error/warning class mapping |
| `formatCostUsd` | 5 | `0 → 'free'` · `< $0.01 → 4dp` · `< $1 → 3dp` · `≥ $1 → 2dp` · negative/NaN → '—' |
| `formatTimestamp` | 2 | ISO → short UTC display · malformed → pass-through |
| `renderArtefactCard` | 5 | title · approval-badge classes · model/cost/tokens rows · deterministic seed display · redacted-prompt `<details>` |
| `ProvenanceTab — empty states` | 3 | no-selection · no-provenance · no card-list when empty |
| `ProvenanceTab — populated` | 4 | per-artefact card render · cross-element filter · singular/plural count chip |
| `ProvenanceTab — live updates` | 2 | store-subscription re-render on append · selection swap re-render |
| `ProvenanceTab — lifecycle` | 4 | `build()` idempotent · `dispose()` releases sub · `dispose()` idempotent · post-dispose `setSelectedElement` no-op |
| `ProvenanceTab — accessibility` | 1 | `role="region"` + `aria-label="AI provenance for selected element"` |

If any test goes red: STOP, file a bug, do NOT mark the criterion green. (This is the bit that broke the old "everything is in progress" pattern.)

---

## §3 — Manual demo (the user side)

The Provenance tab is a self-contained DOM component today; it's not yet wired into the live ModelTree's right-click menu (that's iteration 5.2.b — a 1-screen change that lands once you've seen this iteration in isolation).

You can drive it three ways. Pick whichever fits how you want to verify.

### §3.1 — Console mount in the running editor (~ 60 seconds)

The fastest path. Run the editor, open dev-tools console, paste a snippet that mounts the tab against the live runtime.

1. Start the dev server:
   ```bash
   npm run dev
   ```
2. Open `http://localhost:5000` in Chrome / Firefox / Edge.
3. Load any project that has had at least one AI-generated layout (e.g. run the apartment generator once with a sample brief).
4. Open dev-tools console (F12 → Console tab).
5. Paste:
   ```js
   const { ProvenanceTab } = await import('/src/ui/inspect/ProvenanceTab.ts');
   const runtime = window.__pryzm?.runtime;
   const projectId = runtime?.projectContext?.get()?.projectId ?? 'unknown';
   const tab = new ProvenanceTab({ store: runtime.provenanceStore, projectId });
   const root = tab.build();
   root.style.cssText =
     'position:fixed; top:80px; right:20px; width:380px; max-height:70vh; ' +
     'overflow-y:auto; background:#14141C; color:#F5F5FA; ' +
     'border:1px solid #2A2A36; border-radius:8px; padding:12px; z-index:10000;';
   document.body.appendChild(root);
   // Optional — wire to a specific element id you can read off the inspect tree:
   // tab.setSelectedElement('el_wall_42');
   window.__pvTab = tab;   // for cleanup: window.__pvTab.dispose() + root.remove()
   ```
6. The tab appears floating top-right of the editor. With no selection, it shows the "Select an element" empty state.
7. Find an AI-generated wall's element id in the Inspect tree (right-click → copy id). Then in console:
   ```js
   window.__pvTab.setSelectedElement('el_wall_42');   // your element id
   ```
8. **Expected**: the tab populates with one card per AI artefact that produced that wall. Each card shows model, cost (`$0.012`), approval status badge (`Approved by you` / `Auto-applied` / etc.), and the prompt preview as a collapsible `<details>` block.
9. Cleanup:
   ```js
   window.__pvTab.dispose();
   document.querySelectorAll('section.pv-tab').forEach((n) => n.remove());
   ```

### §3.2 — Standalone HTML harness (~ 30 seconds, no editor needed)

If the editor isn't running, you can mount the tab against an in-memory fixture store. Useful for showing the UI to a stakeholder without spinning up the full app.

The test suite already drives this in a happy-dom harness — the `populated` describe block (in `apps/editor/__tests__/ProvenanceTab.test.ts`) constructs a real `ProvenanceStore`, adds 3 artefacts, and renders the tab. Run with the snapshot reporter to see the generated DOM:

```bash
pnpm --filter @pryzm/editor exec vitest run __tests__/ProvenanceTab.test.ts --reporter=verbose
```

The verbose output shows the assertion log; if you want the actual DOM, drop into a Node REPL with `--inspect-brk` and read `root.outerHTML`.

### §3.3 — Wait for iteration 5.2.b (right-click → Show provenance)

The next iteration wires the tab into ModelTree's right-click menu so the demo becomes "select wall → right-click → Show AI provenance" with no console required. Estimated effort: ~ 1 hour of ModelTree.ts integration + 1 happy-dom test for the menu wiring. We'll ship that once you've seen 5.2 in isolation.

---

## §4 — Acceptance checklist

| Item | How to verify | Status |
|---|---|---|
| 31 unit tests pass | `pnpm --filter @pryzm/editor exec vitest run __tests__/ProvenanceTab.test.ts` | ✅ |
| Empty-state rendering when no element selected | Open §3.1; tab body says "Select an element to see its AI provenance." | ⚪ awaiting you |
| Empty-state rendering when element has no provenance | §3.1, set an element id with no AI history | ⚪ awaiting you |
| Card list shows model + cost + tokens + approval | §3.1, set an AI-generated element id | ⚪ awaiting you |
| Approval badge has the right colour class | §3.1, inspect element on the badge — class includes `pv-badge--success` / `--warning` / `--error` | ⚪ awaiting you |
| Redacted-prompt `<details>` expands | §3.1, click the "Prompt preview (redacted)" disclosure | ⚪ awaiting you |
| Live update on new artefact | §3.1, trigger another AI call → tab adds a card without re-mount | ⚪ awaiting you |
| Screen-reader announces "AI provenance for selected element" region | macOS: ⌘+F5 VoiceOver · Windows: NVDA / Narrator | ⚪ awaiting you |

Once every ⚪ flips to ✅, IP-A5 acceptance item (3) ("Right-click element in inspect tree → Show AI provenance works") is closed.

---

## §5 — What's next (iteration 5.2.b)

Wire the tab into ModelTree's right-click menu:
1. Add a `"Show AI provenance"` action to `apps/editor/src/ui/inspect/ModelTree.ts` context menu
2. On click: open the right-side panel + mount `ProvenanceTab` with the clicked element's id
3. happy-dom test for the menu→panel handshake
4. Single demo: right-click an AI-generated wall → tab appears, populated

That closes IP-A5 acceptance item (3) without console snippets.

---

## §6 — Cross-references

- L0 schema: [packages/schemas/src/provenance/AIArtefact.ts](../../../packages/schemas/src/provenance/AIArtefact.ts) — A.31.a
- L3 store: [packages/stores/src/ProvenanceStore.ts](../../../packages/stores/src/ProvenanceStore.ts) — A.31.c
- L3 commands: [packages/stores/src/provenance-commands/](../../../packages/stores/src/provenance-commands/) — A.31.d
- This L5 tab: [apps/editor/src/ui/inspect/ProvenanceTab.ts](../../../apps/editor/src/ui/inspect/ProvenanceTab.ts) — A.31.e (this iteration)
- Tests: [apps/editor/__tests__/ProvenanceTab.test.ts](../../../apps/editor/__tests__/ProvenanceTab.test.ts)
- C23 contract: [docs/02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md)
- IP-A5 acceptance: [docs/03-execution/plans/master-execution-tracker.md §3.0](../../03-execution/plans/master-execution-tracker.md)
