/**
 * @pryzm/plugin-navigate — plugin descriptor (Wave A20-T8 promotion).
 *
 * Promotes this plugin from empty stub to Phase F real implementation.
 * The navigate plugin owns camera bookmarks, navigation rail,
 * fly/orbit/pan tool registrations, and view-cube gestures.
 *
 * NOTE: Descriptor matches PluginManifestSchema from @pryzm/plugin-sdk v1.0.0
 * (pryzmPlugin: '1.0' envelope, ADR-0038). Not type-imported here because
 * plugins/navigate does not list @pryzm/plugin-sdk as a direct dependency
 * (it's validated by the SDK host at install time, not compile time).
 *
 * CONTRACT (C07 §2): All permissions declared; contributions typed.
 */

export const PLUGIN_ID = 'navigate' as const;
export const PLUGIN_VERSION = '1.0.0' as const;

export const navigateDescriptor = {
  pryzmPlugin: '1.0' as const,
  id: PLUGIN_ID,
  version: PLUGIN_VERSION,
  displayName: 'PRYZM Navigate',
  description: 'Camera bookmarks, navigation rail, view-cube, and orbital controls',
  author: 'PRYZM Team',
  license: 'MIT' as const,
  main: './src/index.ts',
  minPRYZMVersion: '3.0.0',
  allowedOrigins: [] as string[],
  permissions: [
    'read:project',
    'register:tool',
    'register:panel',
    'register:command',
  ] as const,
  contributions: [
    {
      kind: 'panel' as const,
      id: 'navigate.rail',
      location: 'sidebar-left' as const,
      label: 'Navigation',
    },
    {
      kind: 'command' as const,
      id: 'navigate.bookmark.save',
      label: 'Save Camera Bookmark',
      keybinding: 'Ctrl+Shift+B',
    },
    {
      kind: 'command' as const,
      id: 'navigate.bookmark.restore',
      label: 'Go to Bookmark',
      keybinding: 'Ctrl+B',
    },
  ],
} as const;
