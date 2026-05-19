export interface Georeference {
  id: string;
  latitude: number;
  longitude: number;
  elevationOffset: number;
  rotation: number;
}

export class GeospatialAdapter {
  constructor() {}

  public static localToWGS84(localX: number, localZ: number, georeference: Georeference): { latitude: number, longitude: number } {
    // Basic approximation for demonstration, should use proper projection in real implementation
    const earthRadius = 6378137;
    const dLat = (localZ / earthRadius) * (180 / Math.PI);
    const dLon = (localX / (earthRadius * Math.PI / 180 * Math.cos(georeference.latitude * Math.PI / 180))) * (180 / Math.PI);

    return {
      latitude: georeference.latitude + dLat,
      longitude: georeference.longitude + dLon
    };
  }

  public static getLevelElevation(bimManager: any, levelId: string, baseOffset: number): number {
    const level = bimManager.getLevelById(levelId);
    if (!level) {
      throw new Error(`Level with ID ${levelId} not found`);
    }
    return level.elevation + baseOffset;
  }
}
