// ai-workflow-plugin-example — runs L7.5 critic on the active view.
//
// Demonstrates:
//
//   • AiProxy.runWorkflow with a workflow name that the host's
//     packages/ai-host/ WorkflowRegistry must have registered.
//   • Permission gating — write:project is required because the AI
//     workflow can mutate (the locked plugin permission set has no
//     dedicated ai:invoke; AI access is gated by write:project).
//   • Composing two contributions (command + panel) so the user can
//     trigger the workflow AND see the result in the same plugin.

import { definePlugin } from '../../src/lifecycle';
import type { PluginActivationContext } from '../../src/lifecycle';

let outputEl: HTMLElement | null = null;

export default definePlugin({
  async onActivate(ctx: PluginActivationContext) {
    // Mount the output panel into the iframe DOM.
    const root = document.getElementById('pryzm-plugin-root');
    if (!root) throw new Error('ai-workflow-plugin: #pryzm-plugin-root missing');
    outputEl = document.createElement('div');
    outputEl.style.cssText = 'font:13px ui-sans-serif,system-ui;padding:12px;color:#1a1a1a';
    outputEl.innerHTML = `
      <h4 style="margin:0 0 6px 0">AI Critique</h4>
      <p style="margin:0;color:#666">Press <kbd>Ctrl+Shift+K</kbd> to critique the active view.</p>
    `;
    root.appendChild(outputEl);

    // The host invokes the registered command id when the user fires it.
    // We register a global handler under the command's id; the host
    // dispatches via the iframe-bridge by calling it through the
    // command bus runtime contribution map (set up at handshake).
    (globalThis as unknown as Record<string, unknown>)['ai-workflow.critique-view'] = async () => {
      if (!outputEl) return;
      outputEl.innerHTML = `<p>Running critique…</p>`;

      const result = await ctx.hosts.ai.runWorkflow('critic.view', {
        viewId: (await ctx.hosts.views.getActiveView())?.id ?? null,
      });

      if (result.ok) {
        outputEl.innerHTML = `
          <h4 style="margin:0 0 6px 0">Critique result</h4>
          <pre style="white-space:pre-wrap;background:#f4f4f4;padding:8px;border-radius:4px">${
            escapeHtml(JSON.stringify(result.output, null, 2))
          }</pre>
          <p style="margin:6px 0 0 0;color:#999;font-size:11px">
            $${result.costUsd.toFixed(4)} · ${result.latencyMs.toFixed(0)} ms · run ${result.runId}
          </p>
        `;
      } else {
        outputEl.innerHTML = `
          <h4 style="margin:0 0 6px 0;color:#a00">Critique failed</h4>
          <p>${escapeHtml(result.error.message)} <span style="color:#999">[${escapeHtml(result.error.code)}]</span></p>
        `;
      }
    };
  },

  async onDeactivate() {
    delete (globalThis as unknown as Record<string, unknown>)['ai-workflow.critique-view'];
    outputEl?.remove();
    outputEl = null;
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
