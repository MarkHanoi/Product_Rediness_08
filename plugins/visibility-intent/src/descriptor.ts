/**
 * @pryzm/plugin-visibility-intent — plugin descriptor (Wave A20-T8 promotion).
 *
 * Promotes this plugin from empty stub to Phase F real implementation.
 * The visibility-intent plugin owns the Visual rail:
 * Visibility-Graphics, edge style, transparency, isolate, hide, reveal.
 *
 * NOTE: Descriptor matches PluginManifestSchema from @pryzm/plugin-sdk v1.0.0
 * (pryzmPlugin: '1.0' envelope, ADR-0038). Not type-imported here because
 * plugins/visibility-intent does not list @pryzm/plugin-sdk as a direct
 * dependency — validated by the SDK host at install time.
 *
 * CONTRACT (C07 §2): All permissions declared; contributions typed.
 */

export const PLUGIN_ID = 'visibility-intent' as const;
export const PLUGIN_VERSION = '1.0.0' as const;

export const visibilityIntentDescriptor = {
  pryzmPlugin: '1.0' as const,
  id: PLUGIN_ID,
  version: PLUGIN_VERSION,
  displayName: 'PRYZM Visibility & Graphics',
  description: 'Visual rail: hide/isolate/reveal elements, set transparency, edge styles',
  author: 'PRYZM Team',
  license: 'MIT' as const,
  main: './src/index.ts',
  minPRYZMVersion: '3.0.0',
  allowedOrigins: [] as string[],
  permissions: [
    'read:project',
    'write:project',
    'register:panel',
    'register:command',
  ] as const,
  contributions: [
    {
      kind: 'panel' as const,
      id: 'visibility-intent.visual-rail',
      location: 'sidebar-left' as const,
      label: 'Visibility / Graphics',
    },
    {
      kind: 'command' as const,
      id: 'visibility-intent.hide.selection',
      label: 'Hide Selection',
      keybinding: 'H',
    },
    {
      kind: 'command' as const,
      id: 'visibility-intent.isolate.selection',
      label: 'Isolate Selection',
      keybinding: 'I',
    },
    {
      kind: 'command' as const,
      id: 'visibility-intent.reveal.all',
      label: 'Reveal All Hidden',
      keybinding: 'Shift+H',
    },
  ],
} as const;
