/**
 * Q1 - FULL SCHEMA, ALL LAYERS, of GOIB_MUIB.
 *
 * Emits out/q1-schema.json: every layer's descriptor (fields, types, domains,
 * geometry type) plus a total feature count per layer.
 *
 * Run:  node tools/balears-muib-probe/q1-schema.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { agsGet, layerInfo, count, sleep, EsriError } from './lib.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');

const root = await agsGet('', {});
const layers = root.layers || [];
const tables = root.tables || [];

const result = {
  probe: 'q1-schema',
  runAt: new Date().toISOString(),
  service: 'GOIB_MUIB/MapServer',
  currentVersion: root.currentVersion,
  serviceMaxRecordCount: root.maxRecordCount,
  capabilities: root.capabilities,
  spatialReference: root.spatialReference,
  fullExtent: root.fullExtent,
  serviceDescriptionRaw: root.serviceDescription,
  layerTree: layers.map((l) => ({
    id: l.id,
    name: l.name,
    parentLayerId: l.parentLayerId,
    subLayerIds: l.subLayerIds,
    minScale: l.minScale,
    maxScale: l.maxScale,
  })),
  tables: tables.map((t) => ({ id: t.id, name: t.name })),
  layers: {},
  errors: [],
};

// Leaf layers only carry features; group layers have subLayerIds.
for (const l of layers) {
  const isGroup = Array.isArray(l.subLayerIds) && l.subLayerIds.length > 0;
  const rec = { id: l.id, name: l.name, isGroup, parentLayerId: l.parentLayerId };
  try {
    const info = await layerInfo(l.id);
    rec.geometryType = info.geometryType ?? null;
    rec.type = info.type;
    rec.maxRecordCount = info.maxRecordCount;
    rec.supportsPagination = info.advancedQueryCapabilities?.supportsPagination ?? null;
    rec.supportsDistinct = info.advancedQueryCapabilities?.supportsDistinct ?? null;
    rec.description = (info.description || '').slice(0, 4000) || null;
    rec.fields = (info.fields || []).map((f) => ({
      name: f.name,
      type: f.type,
      alias: f.alias,
      length: f.length,
      domain: f.domain
        ? {
            type: f.domain.type,
            name: f.domain.name,
            codedValues: f.domain.codedValues
              ? f.domain.codedValues.map((cv) => ({ code: cv.code, name: cv.name }))
              : undefined,
            range: f.domain.range,
          }
        : null,
    }));
    if (!isGroup) {
      const c = await count(l.id);
      rec.featureCount = c.count;
      rec.truncationSuspect = c.truncationSuspect;
    }
  } catch (err) {
    rec.error = String(err.message || err);
    rec.errorClass = err instanceof EsriError ? 'esri-error-in-200' : 'transport';
    result.errors.push({ layer: l.id, name: l.name, error: rec.error, class: rec.errorClass });
  }
  result.layers[l.id] = rec;
  process.stderr.write(
    `layer ${String(l.id).padStart(3)} ${isGroup ? '[grp]' : '     '} ${
      rec.featureCount ?? ''
    } ${l.name}${rec.error ? '  ERR: ' + rec.error : ''}\n`,
  );
  await sleep(120);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'q1-schema.json'), JSON.stringify(result, null, 2));
console.error(
  `\nDONE. layers=${layers.length} tables=${tables.length} errors=${result.errors.length}`,
);
