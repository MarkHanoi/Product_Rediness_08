// §MURCIA-ENVELOPE-MAX · STEP 5 — THE PUBLISHED LINK 404s. FIND THE LIVE CHANNEL.
//
// Step 4: every arm of the addressability matrix returned HTTP 404 — including
// the viewer root http://opweb.carm.es/sitmurcia/. That is NOT "the ficha does
// not exist"; it is "the URL PUBLISHED IN THE WFS ATTRIBUTE is dead".
//
// ⭐ THIS IS ITSELF A FINDING, and a severe one: `Enlace_ficha` is 100 % populated
// (9469/9469) and 0 % resolvable at the published address. POPULATED IS NOT PRESENT.
//
// This step hunts the live channel rather than concluding absence, and records
// every arm — including the ones that fail — so the negative is auditable.

import { politeFetch, writeOut, sha256 } from './lib.mjs';

const REFRESH = process.argv.includes('--refresh');
const O = { refresh: REFRESH };
const report = { step: 5, measuredAt: new Date().toISOString(), arms: [], notes: [] };

const WIDE = 4921; // Murcia, ámbito "U." — the step-4 probe target

async function arm(tag, url, extra = {}) {
  try {
    const r = await politeFetch(url, { ...O, tag: 'ch-' + tag, timeout: 90_000, redirect: 'manual', ...extra });
    const raw = r.buf.toString('latin1');
    const rec = {
      tag,
      url,
      status: r.status,
      contentType: r.headers['content-type'] || null,
      location: r.headers['location'] || null,
      bytes: r.buf.length,
      isPdf: raw.startsWith('%PDF-'),
      sha256: sha256(r.buf),
      text: raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400),
    };
    report.arms.push(rec);
    console.log(
      `  ${tag.padEnd(34)} ${String(r.status).padEnd(4)} ${String(r.headers['content-type'] || '-').slice(0, 28).padEnd(29)} ${String(r.buf.length).padStart(8)}B ${rec.isPdf ? 'PDF' : ''}${r.headers['location'] ? ' → ' + r.headers['location'].slice(0, 90) : ''}`
    );
    return rec;
  } catch (e) {
    const rec = { tag, url, error: String(e.message).slice(0, 400) };
    report.arms.push(rec);
    console.log(`  ${tag.padEnd(34)} ERROR ${String(e.message).slice(0, 150)}`);
    return rec;
  }
}

console.log('\n== 5a · is the published host alive at all? ==');
await arm('opweb-root-http', 'http://opweb.carm.es/');
await arm('opweb-root-https', 'https://opweb.carm.es/');
await arm('opweb-sitmurcia-http', 'http://opweb.carm.es/sitmurcia/');
await arm('opweb-sitmurcia-https', 'https://opweb.carm.es/sitmurcia/');
await arm('published-link-https', `https://opweb.carm.es/sitmurcia/potgisfichacen.jsp?wide=${WIDE}&widi=es&x=0&y=0`);

console.log('\n== 5b · the sitmurcia portal (the WFS-descarga host, known live) ==');
await arm('sitmurcia-root', 'https://sitmurcia.carm.es/');
await arm('sitmurcia-web', 'https://sitmurcia.carm.es/web/guest');
await arm('sitmurcia-fichacen', `https://sitmurcia.carm.es/potgisfichacen.jsp?wide=${WIDE}&widi=es`);
await arm('sitmurcia-sitmurcia-fichacen', `https://sitmurcia.carm.es/sitmurcia/potgisfichacen.jsp?wide=${WIDE}&widi=es`);

console.log('\n== 5c · other CARM hosts that could carry the JSP ==');
await arm('carm-opweb2', `https://www.carm.es/sitmurcia/potgisfichacen.jsp?wide=${WIDE}&widi=es`);
await arm('sigmurcia', `https://sigmurcia.carm.es/sitmurcia/potgisfichacen.jsp?wide=${WIDE}&widi=es`);
await arm('mapas-gis-inter-root', 'https://mapas-gis-inter.carm.es/');
await arm('mapas-gis-fichacen', `https://mapas-gis-inter.carm.es/sitmurcia/potgisfichacen.jsp?wide=${WIDE}&widi=es`);
await arm('carm-es-root', 'https://www.carm.es/');

console.log('\n== 5d · the planning-register front door (urbanismo) ==');
await arm('carm-urbanismo', 'https://www.carm.es/web/pagina?IDCONTENIDO=1&IDTIPO=180');
await arm('sitmurcia-descarga', 'https://sitmurcia.carm.es/wfs-descarga');

// ── 5e · CROSS-CHECK: do the OTHER ficha-bearing layers publish a DIFFERENT
//        link shape? A second, live shape would mean the 404 is confined to one
//        attribute rather than to the whole channel.
console.log('\n== 5e · link shapes across every ficha-bearing layer ==');
{
  const { wfsJson } = await import('./lib.mjs');
  const layers = [
    ['SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbano', 'Enlace_ficha'],
    ['SIT_USU_PLA_URB_CARM:plu_clasific_tipos_urbanizable', 'Enlace_ficha'],
    ['SIT_USU_PLA_URB_CARM:sg_plu_ze_37mun', 'Enlace_ficha'],
    ['SIT_USU_PLA_URB_CARM:plu_sgl_37mun', 'Enlace_ficha'],
    ['SIT_USU_PLA_URB_CARM:clases_plu_ze_37mun', 'Enlace_ficha'],
  ];
  report.linkShapes = {};
  for (const [layer, field] of layers) {
    try {
      const j = await wfsJson(layer, { propertyName: field, count: 200000 }, O);
      const links = j.features.map((f) => f.properties[field]).filter(Boolean);
      const hosts = {};
      const paths = {};
      for (const l of links) {
        try {
          const u = new URL(l);
          hosts[u.host] = (hosts[u.host] || 0) + 1;
          paths[u.pathname] = (paths[u.pathname] || 0) + 1;
        } catch {
          hosts['<<unparsable>>'] = (hosts['<<unparsable>>'] || 0) + 1;
        }
      }
      report.linkShapes[layer] = {
        rows: j.features.length,
        withLink: links.length,
        pct: +((100 * links.length) / j.features.length).toFixed(2),
        hosts,
        paths,
        sample: links[0] || null,
      };
      console.log(`  ${layer}: ${links.length}/${j.features.length} (${report.linkShapes[layer].pct}%) hosts=${JSON.stringify(hosts)} paths=${JSON.stringify(paths)}`);
    } catch (e) {
      report.linkShapes[layer] = { error: String(e.message).slice(0, 500) };
      console.log(`  ${layer}: ERROR ${String(e.message).slice(0, 160)}`);
    }
  }
}

// ── 5f · the BORM route — the ONE link family that DID resolve in step 3.
//        OrdinanceReference / Enlace_BORM on sitmurcia_plu_sp, 44/45 populated.
console.log('\n== 5f · the BORM ordinance route (from the plan-level layer) ==');
{
  const fs = await import('node:fs');
  const s3 = JSON.parse(fs.readFileSync(new URL('./out/03-universes-and-currency.json', import.meta.url), 'utf8'));
  const recs = s3.corpus.records;
  const sample = recs.filter((r) => r.Enlace_BORM).slice(0, 3);
  report.bormProbe = [];
  for (const r of sample) {
    const a = await arm(`borm-${r.Municipio.slice(0, 12)}`, r.Enlace_BORM);
    report.bormProbe.push({ municipio: r.Municipio, ley: r.Ley_aplicada, ...a });
  }
}

writeOut('05-find-live-ficha-channel.json', report);
console.log('\nSTEP 5 done.');
