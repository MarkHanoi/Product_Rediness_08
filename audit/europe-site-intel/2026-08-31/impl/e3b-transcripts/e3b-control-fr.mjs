// E3b FALSIFICATION CONTROL — scramble test (corpus-never-jittered rule): shift every BD TOPO
// footprint +0.0010 deg lon (~73 m east) and re-run the SAME zonal stats against the SAME MNH
// raster. If the probe harness were fabricating agreement, the scrambled run would agree too.
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const HS_PATH = 'C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/context-bake/heightSources.mjs';
const HS = await import(pathToFileURL(HS_PATH).href);
const req = createRequire(HS_PATH);
const geotiff = await import(pathToFileURL(req.resolve('geotiff')).href);
const LAYER = 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G';
const bbox = [2.345, 48.850, 2.357, 48.858];
const [w, s, e, n] = bbox; const midLat = (s + n) / 2;
const W = Math.round(((e - w) * 111320 * Math.cos(midLat * Math.PI / 180)) / 0.55), H = Math.round(((n - s) * 111320) / 0.55);
const url = `https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${LAYER}&STYLES=normal&CRS=CRS:84&BBOX=${bbox.join(',')}&WIDTH=${W}&HEIGHT=${H}&FORMAT=${encodeURIComponent('image/geotiff')}`;
const ab = await (await fetch(url)).arrayBuffer();
const tiff = await geotiff.fromArrayBuffer(ab.slice(0)); const img = await tiff.getImage();
const [vals] = await img.readRasters();
const raster = { width: img.getWidth(), height: img.getHeight(), values: Float32Array.from(vals), bboxNative: img.getBoundingBox() };
const bd = await HS.fetchBdTopo(bbox, { limit: 5000 });
const run = (shift) => {
  const deltas = [];
  for (const f of bd.features) {
    const g = f.geometry; if (!g) continue;
    let rings = g.type === 'Polygon' ? g.coordinates : (g.type === 'MultiPolygon' ? g.coordinates.reduce((a, p) => (p[0]?.length > (a?.[0]?.length ?? 0) ? p : a), null) : null);
    if (!rings?.[0]) continue;
    const hAttr = Number(f.properties?.height); if (!(hAttr > 0)) continue;
    const ext = rings[0].map(([x, y]) => [x + shift, y]);
    const ints = rings.slice(1).map((r) => r.map(([x, y]) => [x + shift, y]));
    const z = HS.mdsHeightForBuilding(ext, ints, raster, { erodeM: 1.0, percentile: 90, minSamples: 3, sampleStepM: 1.0 });
    if (z) deltas.push(Math.abs(z.height - hAttr));
  }
  deltas.sort((a, b) => a - b);
  const P = (p) => deltas.length ? deltas[Math.min(deltas.length - 1, Math.round((p / 100) * (deltas.length - 1)))] : null;
  return { n: deltas.length, absP50: +P(50)?.toFixed(2), within3m: +(deltas.filter((d) => d <= 3).length / Math.max(1, deltas.length)).toFixed(3) };
};
console.log('ALIGNED  (shift 0)      :', JSON.stringify(run(0)));
console.log('SCRAMBLED(shift +73 m E):', JSON.stringify(run(0.0010)));
