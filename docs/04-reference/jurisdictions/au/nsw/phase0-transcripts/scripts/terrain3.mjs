import fs from 'node:fs';
import https from 'node:https';
const agent=new https.Agent({keepAlive:true,maxSockets:6});
const get=(u,t=35000)=>new Promise(r=>{const q=https.get(u,{agent,timeout:t},x=>{let b='';x.setEncoding('utf8');x.on('data',c=>{if(b.length<500000)b+=c;});x.on('end',()=>{try{r({s:x.statusCode,j:JSON.parse(b)});}catch{r({s:x.statusCode,j:null,raw:b.slice(0,300)});}});});q.on('timeout',()=>q.destroy(new Error('t')));q.on('error',e=>r({s:0,err:String(e)}));});
const out={probedAt:new Date().toISOString().slice(0,10)};

// ── A. Elevation: the FOLDER was token-gated. Is the ROOT-LEVEL SERVICE?
// §BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS — a refusal about one product is not a refusal
// about another. Probe the service the root listing actually named.
for (const [k,u] of [
  ['MapServer','https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Elevation_and_Depth_Theme/MapServer?f=json'],
  ['FeatureServer','https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Elevation_and_Depth_Theme/FeatureServer?f=json'],
]) {
  const r=await get(u);
  const gated = r.j?.error?.message==='Token Required';
  out['elev_'+k]={url:u,status:r.s,gated,error:r.j?.error?.message??null,
    description:(r.j?.serviceDescription||r.j?.description||'').slice(0,400)||null,
    copyright:(r.j?.copyrightText||'').slice(0,400)||null,
    layers:(r.j?.layers||[]).map(l=>`${l.id}:${l.name}`).slice(0,40)};
  console.log(`ELEV ${k}: status=${r.s} gated=${gated} layers=${(r.j?.layers||[]).length} err=${r.j?.error?.message??'-'}`);
  if (out['elev_'+k].copyright) console.log(`   COPYRIGHT/LICENCE: ${out['elev_'+k].copyright}`);
  for (const l of out['elev_'+k].layers) console.log(`   ${l}`);
}

// ── B. City of Sydney interactive DCP FeatureServer — build prompt §9 names it; treat it as an API.
const SYD='https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Sydney_Development_Control_Plan_2012/FeatureServer';
const r=await get(SYD+'?f=json');
out.sydneyDcp={url:SYD,status:r.s,error:r.j?.error?.message??null,
  copyright:(r.j?.copyrightText||'').slice(0,300)||null,
  layers:(r.j?.layers||[]).map(l=>`${l.id}:${l.name}`)};
console.log(`\nCITY OF SYDNEY DCP 2012 FeatureServer: status=${r.s} layers=${(r.j?.layers||[]).length}`);
for (const l of out.sydneyDcp.layers) console.log(`   ${l}`);

// One layer's fields — is the DCP standard served as DATA or only as a label?
if ((r.j?.layers||[]).length) {
  const l0=r.j.layers[0].id;
  const f=await get(`${SYD}/${l0}?f=json`);
  out.sydneyDcpLayer0={id:l0,name:f.j?.name??null,count:null,
    fields:(f.j?.fields||[]).map(x=>`${x.name}:${x.type}`)};
  const c=await get(`${SYD}/${l0}/query?where=1%3D1&returnCountOnly=true&f=json`);
  out.sydneyDcpLayer0.count=c.j?.count??null;
  console.log(`\n  layer ${l0} "${f.j?.name}" count=${c.j?.count??'n/a'}`);
  console.log('  fields: '+out.sydneyDcpLayer0.fields.join(' | '));
}
fs.writeFileSync('../terrain-dcp-probe3.json', JSON.stringify(out,null,1));
