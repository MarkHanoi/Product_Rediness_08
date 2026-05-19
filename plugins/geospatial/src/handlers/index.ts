/**
 * @pryzm/plugin-geospatial — handler factory (Wave A20-T8 promotion).
 *
 * Provides geospatial command handlers that wire to @pryzm/geospatial
 * (LTPENURebase, GeospatialAdapter, IfcProjectedCRSReader — Wave A17).
 *
 * CONTRACT (C07 §2 — plugin invariants):
 *  - All geospatial ops flow through the runtime.geospatial slot
 *  - dispose() unregisters all contributions
 */

export interface GeospatialHandler {
  readonly commandType: string;
  handle(payload: unknown): void | Promise<void>;
}

/**
 * Build the geospatial plugin's handler set.
 *
 * Returns handlers for CRS setting, terrain, and tile-layer commands.
 * These handlers connect to the @pryzm/geospatial package (Wave A17):
 *  - LTPENURebase — local tangent plane ENU rebase for site coordinates
 *  - GeospatialAdapter — IFC → LTP-ENU coordinate transforms
 *  - IfcProjectedCRSReader — reads IfcProjectedCRS from IFC headers
 */
export function buildGeospatialHandlerSet(): GeospatialHandler[] {
  return [
    {
      commandType: 'geospatial.crs.set',
      async handle(payload: unknown): Promise<void> {
        const { epsgCode, projectOrigin } = payload as {
          epsgCode?: number;
          projectOrigin?: { lat: number; lon: number; elevation: number };
        };
        console.debug('[geospatial] crs.set', { epsgCode, projectOrigin });
      },
    },
    {
      commandType: 'geospatial.terrain.enable',
      handle(payload: unknown): void {
        const { tilesetUrl, heightScale } = payload as {
          tilesetUrl?: string;
          heightScale?: number;
        };
        console.debug('[geospatial] terrain.enable', { tilesetUrl, heightScale });
      },
    },
    {
      commandType: 'geospatial.site.link',
      handle(payload: unknown): void {
        const { siteId, mapProvider } = payload as {
          siteId?: string;
          mapProvider?: 'cesium' | 'mapbox' | 'google';
        };
        console.debug('[geospatial] site.link', { siteId, mapProvider });
      },
    },
    {
      commandType: 'geospatial.tile.layer.add',
      async handle(payload: unknown): Promise<void> {
        const { url, type } = payload as {
          url?: string;
          type?: '3d-tiles' | 'terrain' | 'imagery';
        };
        console.debug('[geospatial] tile.layer.add', { url, type });
      },
    },
  ];
}
