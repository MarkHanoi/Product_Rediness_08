// hello-plugin — minimal example.
//
// Renders a panel showing "Selected: N" where N updates live as the
// user changes the active selection.  Demonstrates:
//
//   • definePlugin() to assert the lifecycle contract at compile time.
//   • PluginActivationContext consumption.
//   • stores subscription with cleanup in onDeactivate.
//
// Run via `pryzm dev --manifest examples/hello-plugin/plugin.manifest.json`
// from the plugin-sdk package root.

import { definePlugin } from '../../src/lifecycle';
import type { PluginActivationContext } from '../../src/lifecycle';
import type { StoreSubscription } from '../../src/hosts/stores';

// Module-scope holder so onDeactivate can dispose what onActivate set up.
let storeSub: StoreSubscription | null = null;
let panelEl: HTMLElement | null = null;

export default definePlugin({
  async onActivate(ctx: PluginActivationContext) {
    // Build the panel UI.  The iframe DOM has a #pryzm-plugin-root div
    // injected by buildIframeSrcdoc; mount inside it.
    const root = document.getElementById('pryzm-plugin-root');
    if (!root) throw new Error('hello-plugin: #pryzm-plugin-root missing — host did not inject sandbox bootstrap');
    panelEl = document.createElement('div');
    panelEl.style.cssText = 'font:14px sans-serif;padding:12px;color:#222';
    panelEl.innerHTML = `
      <h3 style="margin:0 0 8px 0">Hello, ${escapeHtml(ctx.user.displayName ?? 'PRYZM user')}</h3>
      <p style="margin:0 0 8px 0">This panel is rendered from <code>${escapeHtml(ctx.manifest.id)}@${escapeHtml(ctx.manifest.version)}</code>.</p>
      <p style="margin:0">Selection size: <strong id="hello-selection-size">…</strong></p>
    `;
    root.appendChild(panelEl);

    // Subscribe to store changes; selection is reflected via stores
    // because the SDK exposes selection separately too — both work, this
    // example uses stores to demonstrate the broader pattern.
    storeSub = ctx.hosts.stores.subscribe((event) => {
      const sizeEl = document.getElementById('hello-selection-size');
      if (sizeEl) {
        sizeEl.textContent = `${event.changedKinds.length} kind(s) changed at version ${event.snapshot.version}`;
      }
    });
  },

  async onDeactivate() {
    storeSub?.unsubscribe();
    storeSub = null;
    panelEl?.remove();
    panelEl = null;
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
