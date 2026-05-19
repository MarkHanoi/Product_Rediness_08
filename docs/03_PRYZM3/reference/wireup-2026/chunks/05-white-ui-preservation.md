# §6  What stays unchanged (the white UI)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 615–627.

---

## §6 What stays unchanged (the white UI)

`src/ui/` (78 panel modules, ~30K LOC) and `src/styles/` (~30,977 LOC of CSS) are **pixel-frozen for GA**. The only edits per file are:

1. Constructor signature widened to accept `runtime: PryzmRuntime`.
2. Read sites rewritten from `(window as any).<key>` → `runtime.<typed.path>`.
3. Write sites rewritten from `commandManager.execute(new XCommand(...))` → `runtime.bus.executeCommand('x.create', payload)`.
4. Subscription sites rewritten from `addEventListener('bim-store-mutated', …)` → `runtime.events.on('store.<key>.changed', …)` or `runtime.stores.<key>.subscribe(...)`.

**Visual diff = 0 pixels.** **Behaviour diff = 0 user-observable.** That is the binding contract.

---

