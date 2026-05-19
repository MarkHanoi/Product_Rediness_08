/**
 * @pryzm/plugin-geospatial — plugin descriptor (Wave A20-T8 promotion).
 *
 * Promotes this plugin from empty stub to Phase F real implementation.
 * The geospatial plugin owns CRS picker, tile-layer toggle,
 * terrain height sampler, site-link gestures.
 *
 * Wires to @pryzm/geospatial package (LTPENURebase, GeospatialAdapter,
 * IfcProjectedCRSReader — all implemented in Wave A17).
 *
 * NOTE: Descriptor matches PluginManifestSchema from @pryzm/plugin-sdk v1.0.0
 * (pryzmPlugin: '1.0' envelope, ADR-0038). Not type-imported here because
 * plugins/geospatial does not list @pryzm/plugin-sdk as a direct dependency
 * — validated by the SDK host at install time, not compile time.
 *
 * CONTRACT (C07 §2): All permissions declared; allowedOrigins required
 * when network:fetch is granted (ADR-0038 Decision E).
 */

export const PLUGIN_ID = 'geospatial' as const;
export const PLUGIN_VERSION = '1.0.0' as const;

export const geospatialDescriptor = {
  pryzmPlugin: '1.0' as const,
  id: PLUGIN_ID,
  version: PLUGIN_VERSION,
  displayName: 'PRYZM Geospatial',
  description: 'CRS picker, LTP-ENU coordinate system, terrain, Cesium tile layers',
  author: 'PRYZM Team',
  license: 'MIT' as const,
  main: './src/index.ts',
  minPRYZMVersion: '3.0.0',
  allowedOrigins: ['https://api.cesium.com', 'https://assets.cesium.com'],
  permissions: [
    'read:project',
    'write:project',
    'register:panel',
    'register:command',
    'network:fetch',
  ] as const,
  contributions: [
    {
      kind: 'panel' as const,
      id: 'geospatial.crs-picker',
      location: 'properties' as const,
      label: 'Coordinate System',
    },
    {
      kind: 'command' as const,
      id: 'geospatial.crs.set',
      label: 'Set Project CRS',
    },
    {
      kind: 'command' as const,
      id: 'geospatial.terrain.enable',
      label: 'Enable Terrain Layer',
    },
    {
      kind: 'command' as const,
      id: 'geospatial.site.link',
      label: 'Link Site to Map',
    },
  ],
} as const;
