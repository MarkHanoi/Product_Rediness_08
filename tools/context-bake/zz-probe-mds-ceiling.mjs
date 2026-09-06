// LANE ES-WHOLE-COUNTRY-HEIGHTS — measure the MAXSIZE ceiling exactly, and per-tile timing.
import { fromArrayBuffer } from 'geotiff';

const EP = 'https://wcs-mds.idee.es/mds';
const url = ([w, s, e, n]) =>
  `${EP}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=mdsn_e025` +
  `&FORMAT=image/tiff&SUBSET=lat(${s},${n})&SUBSET=long(${w},${e})` +
  `&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326`;

async function one(label, bb, { read = true } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url(bb), { signal: AbortSignal.timeout(600_000) });
    const ct = r.headers.get('content-type') || '';
    const ab = await r.arrayBuffer();
    const tNet = Date.now() - t0;
    if (!r.ok || !/tiff/i.test(ct)) {
      const body = Buffer.from(ab).toString('utf8').replace(/\s+/g, ' ');
      const m = /<ows:ExceptionText>(.*?)<\/ows:ExceptionText>/.exec(body);
      console.log(`${label} status=${r.status} ct=${ct} bytes=${ab.byteLength} net=${tNet}ms REFUSED :: ${m ? m[1] : body.slice(0, 200)}`);
      return null;
    }
    let W = 0, H = 0, px = 0, nz = 0, tRead = 0;
    if (read) {
      const t1 = Date.now();
      const tif = await fromArrayBuffer(ab);
      const img = await tif.getImage();
      W = img.getWidth(); H = img.getHeight();
      const [d] = await img.readRasters();
      for (let i = 0; i < d.length; i++) { const x = d[i]; if (!Number.isFinite(x)) continue; px++; if (x > 0.5) nz++; }
      tRead = Date.now() - t1;
    }
    console.log(`${label} status=${r.status} bytes=${ab.byteLength} net=${tNet}ms read=${tRead}ms px=${W}x${H} finite=${px} >0.5m=${nz}`);
    return { bytes: ab.byteLength, tNet, tRead, W, H };
  } catch (err) {
    console.log(`${label} THREW ${String(err?.message ?? err)} t=${Date.now() - t0}ms`);
    return null;
  }
}

const mode = process.argv[2] ?? 'ceiling';

if (mode === 'ceiling') {
  // Binary-search the largest SQUARE-in-degrees span the service serves, at the SOUTH (widest lon px
  // per degree) and NORTH (narrowest) extremes of the Spain bbox, plus mid.
  for (const [name, clon, clat] of [['south(36.0N)', -5.5, 36.0], ['mid(39.0N)', -3.9271, 38.9861], ['north(43.5N)', -3.0, 43.5]]) {
    for (const span of [0.06, 0.07, 0.08, 0.09, 0.095, 0.10]) {
      const h = span / 2;
      await one(`${name} span=${span}°`, [clon - h, clat - h, clon + h, clat + h], { read: false });
    }
  }
} else if (mode === 'timing') {
  // Repeat a chosen span over DENSE URBAN and RURAL cells to get honest per-tile net+read timing.
  const span = Number(process.argv[3] ?? 0.08);
  const h = span / 2;
  const spots = [
    ['madrid-centro', -3.7038, 40.4168], ['barcelona-eixample', 2.1620, 41.3900],
    ['ciudadreal', -3.9271, 38.9861], ['toledo', -4.0273, 39.8628],
    ['rural-la-mancha', -3.20, 39.30], ['sevilla', -5.9845, 37.3891],
  ];
  for (const [n, lon, lat] of spots) await one(`${n} span=${span}°`, [lon - h, lat - h, lon + h, lat + h]);
} else if (mode === 'parallel') {
  const span = Number(process.argv[3] ?? 0.08); const conc = Number(process.argv[4] ?? 4);
  const h = span / 2;
  const base = [-3.9271, 38.9861];
  const jobs = [];
  for (let i = 0; i < conc; i++) {
    const lon = base[0] + i * span, lat = base[1];
    jobs.push(one(`par#${i} span=${span}°`, [lon - h, lat - h, lon + h, lat + h], { read: false }));
  }
  const t0 = Date.now();
  await Promise.all(jobs);
  console.log(`PARALLEL conc=${conc} span=${span}° wall=${Date.now() - t0}ms`);
}
