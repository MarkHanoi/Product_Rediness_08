/**
 * @pryzm/plugin-ifc-import — plugin descriptor (Wave A20-T8 promotion).
 *
 * Promotes this plugin from stub to Phase F real implementation.
 * The ifc-import plugin owns IFC file import, tier-1 parse, proxy
 * creation, and meta-store population.
 *
 * Wires to the real IFCImportHandler + IFC Web Worker (Wave A17).
 *
 * NOTE: Descriptor matches PluginManifestSchema from @pryzm/plugin-sdk v1.0.0
 * (pryzmPlugin: '1.0' envelope, ADR-0038). Not type-imported here because
 * plugins/ifc-import does not list @pryzm/plugin-sdk as a direct dependency
 * — validated by the SDK host at install time.
 *
 * CONTRACT (C07 §2): All permissions declared; contributions typed.
 */

export const PLUGIN_ID = 'ifc-import' as const;
export const PLUGIN_VERSION = '1.0.0' as const;

export const ifcImportDescriptor = {
  pryzmPlugin: '1.0' as const,
  id: PLUGIN_ID,
  version: PLUGIN_VERSION,
  displayName: 'PRYZM IFC Import',
  description: 'IFC 4x3 file import with tier-1 parse, proxy creation, and meta-store population',
  author: 'PRYZM Team',
  license: 'MIT' as const,
  main: './src/index.ts',
  minPRYZMVersion: '3.0.0',
  allowedOrigins: [] as string[],
  permissions: [
    'read:project',
    'write:project',
    'register:command',
    'register:panel',
  ] as const,
  contributions: [
    {
      kind: 'command' as const,
      id: 'ifc.import.file',
      label: 'Import IFC File',
      keybinding: 'Ctrl+Shift+I',
    },
    {
      kind: 'panel' as const,
      id: 'ifc-import.progress',
      location: 'bottom' as const,
      label: 'IFC Import Progress',
    },
  ],
} as const;
