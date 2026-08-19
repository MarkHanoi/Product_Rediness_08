// @vitest-environment happy-dom
//
// §L-1054 — `curtain-wall.replacePanel` REFUSES ON EVERY DISPATCH, AND TWO
//           PRODUCTION PANELS OFFER IT.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// C87 §11 row 2 ranks `curtain-wall.replacePanel` as its SECOND-worst defect and
// characterises it as an unrecoverable WRITE: "lineage L6 — direct store write
// `:137`, `affectedStores: []` `:66`, patches diffed against a throwaway literal
// `:113-118`", costing the user "every panel-type change, unrecoverably".
//
// Every one of those observations about the SOURCE is correct. The conclusion
// drawn from them is not, because `:137` never runs. Both `canExecute` (`:81`)
// and `execute` (`:95`) resolve the panel store as
// `ctx.stores['curtainPanelStore']`, and NO SUCH KEY EXISTS on the bus context:
//
//   • `ctx.stores` is `storesAsRecordView(stores)` (`bootstrap.ts:94,148-159`),
//     built by iterating `stores`, which `bootstrap.everything.ts:145` fills as
//     `stores[plugin.storeKey] = store` over `ALL_PLUGINS`;
//   • `composeRuntime.ts:889` calls `opts.bootstrapFn({ audit: opts.audit })` —
//     with NO `stores` override — so `ALL_PLUGINS` is the complete key set;
//   • the curtain-wall plugin's `storeKey` is `'curtainwall'`, and the panel
//     store has no descriptor of its own (the `'curtain-panel'` spelling at
//     `initStores.ts:119` is the LEGACY registry, a different map);
//   • `CommandBus.buildContext` (`:285-293`) never falls back to a global —
//     "The bus does NOT fall back to globals" (ADR-002 §3 / R1A-16).
//
// So `canExecute` returns `{valid:false, reason:'curtainPanelStore not available
// in handler context'}` every time. The verb is DEAD, not dangerous.
//
// ⚠ AND IT IS OFFERED. `CurtainPanelEditor.ts:250` and
// `CurtainSubElementPanel.ts:319` both dispatch it from the property panel, and
// `ChatCommandClassification.ts:109` lists it as an AI-reachable command. That
// is C84 EI-3 / EI-7a's residual defect exactly — a control that stays offered
// while its verb refuses — and it means changing a curtain-wall panel's type
// from the property panel does NOTHING, with the reason logged as a `console.warn`
// naming an internal store variable the user has never heard of.
//
// The two arms below are deliberately different in kind: ARM 1 asserts the
// property of the REGISTRY (no key can produce it), ARM 2 executes the REAL
// handler against a context shaped exactly like the production one. Either alone
// would be a single sample.

import { describe, expect, it } from 'vitest';
import { ALL_PLUGINS } from '../src/PluginRegistry';
import { ReplacePanelHandler } from '@pryzm/plugin-curtain-wall/handlers';

describe('§L-1054 — the store `curtain-wall.replacePanel` asks for is not on the bus', () => {
  it('ARM 1 — no plugin descriptor contributes a `curtainPanelStore` key', () => {
    const keys = ALL_PLUGINS.map(p => p.storeKey);
    expect(keys).toContain('curtainwall');           // the wall store IS there…
    expect(keys).not.toContain('curtainPanelStore'); // …the panel store is not.
    expect(keys).not.toContain('curtainpanel');
    expect(keys).not.toContain('curtain-panel');
  });

  it('ARM 2 — the REAL handler refuses when handed a production-shaped context', () => {
    // Exactly what `storesAsRecordView` produces: one plain `Record<id, dto>`
    // per plugin storeKey. Note there is no way to write this object such that
    // `ctx.stores.curtainPanelStore.get()` exists — the view flattens every
    // store to its state, so even a key of that name would carry no methods.
    const stores = Object.fromEntries(ALL_PLUGINS.map(p => [p.storeKey, {}]));
    const ctx = { audit: { actorId: 'a', projectId: 'p', clientId: 'c', timestamp: '' }, stores };

    const verdict = ReplacePanelHandler.canExecute!(
      ctx as never,
      { panelId: 'panel-1', newPanelType: 'SystemPanel_Opaque' },
    );

    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/curtainPanelStore not available/);
  });

  it('ARM 3 — it is not the payload validation refusing; a VALID type still fails', () => {
    // Guards against reading ARM 2 as "the test sent a bad panel type". The
    // refusal must survive a type `isValidPanelType` accepts, and must NOT be
    // the stale three-value message C87 CW-Voc-3 records at `ReplacePanel.ts:77-79`.
    const stores = Object.fromEntries(ALL_PLUGINS.map(p => [p.storeKey, {}]));
    const ctx = { audit: { actorId: 'a', projectId: 'p', clientId: 'c', timestamp: '' }, stores };
    for (const t of ['SystemPanel_Glass', 'SystemPanel_Door', 'SystemPanel_CurtainFlat']) {
      const v = ReplacePanelHandler.canExecute!(ctx as never, { panelId: 'p1', newPanelType: t });
      expect(v.valid).toBe(false);
      expect(v.reason).not.toMatch(/is not a valid PanelType/);
    }
  });
});
