// @pryzm/plugin-ai-floorplan — plugin descriptor (S47 D4).
//
// Spec: §S47 D4 (line 660) — "`plugins/ai-floorplan/` empty plugin
// shell + descriptor".
//
// IMPORTANT: this descriptor MUST NOT statically import `AiHost.impl`.
// The plugin's only path to the AI host is through `getAiHost()` —
// the lazy entry. Static analysis in `scripts/check-ai-host-lazy.mjs`
// asserts this rule.

/** Stable identifier registered with the plugin host. Keep in sync
 *  with `apps/editor` plugin manifest when the editor wires the AI
 *  workflows panel at S49. */
export const PLUGIN_ID = 'ai-floorplan' as const;

export interface AiFloorplanPluginDescriptor {
  readonly id: typeof PLUGIN_ID;
  readonly title: string;
  readonly workflowKind: 'floorplan';
  readonly sidebarSlot: 'ai-workflows';
  readonly enabled: boolean;
  /** Which feature flag, if any, gates this plugin. `null` means
   *  always available; in S47 the panel is hidden behind
   *  `pryzm.ai.floorplan` until S49. */
  readonly featureFlag: string | null;
}

export const aiFloorplanDescriptor: AiFloorplanPluginDescriptor = Object.freeze({
  id: PLUGIN_ID,
  title: 'AI Floorplan',
  workflowKind: 'floorplan',
  sidebarSlot: 'ai-workflows',
  enabled: false,
  featureFlag: 'pryzm.ai.floorplan',
});
