import fs from 'node:fs';
import https from 'node:https';
const agent=new https.Agent({keepAlive:true,maxSockets:6});
const get=(u,t=30000)=>new Promise(r=>{const q=https.get(u,{agent,timeout:t},x=>{let b='';x.setEncoding('utf8');x.on('data',c=>{if(b.length<400000)b+=c;});x.on('end',()=>{try{r({s:x.statusCode,j:JSON.parse(b)});}catch{r({s:x.statusCode,j:null,raw:b.slice(0,400)});}});});q.on('timeout',()=>q.destroy(new Error('t')));q.on('error',e=>r({s:0,err:String(e)}));});

const root = await get('https://portal.spatial.nsw.gov.au/server/rest/services?f=json');
const folders = root.j?.folders || [];
const services = (root.j?.services || []).map(s=>`${s.name} (${s.type})`);
console.log('FOLDERS:', folders.join(' | '));
const elev = services.filter(n=>/elev|dem|dtm|dsm|terrain|contour|height|lidar|depth/i.test(n));
console.log('ROOT services matching elevation-ish:', elev.length ? elev.join(' | ') : '(none at root)');

// Probe every folder that looks elevation-related, and record whether it is token-gated.
const cand = folders.filter(f=>/elev|depth|terrain|height/i.test(f));
const out = { probedAt:new Date().toISOString().slice(0,10), folders, rootElevationServices:elev, folderProbes:{} };
for (const f of cand.length?cand:folders.slice(0,0)) {
  const r = await get(`https://portal.spatial.nsw.gov.au/server/rest/services/${encodeURIComponent(f)}?f=json`);
  const gated = r.j?.error?.message === 'Token Required';
  out.folderProbes[f] = { status:r.s, gated, error:r.j?.error?.message ?? null, services:(r.j?.services||[]).map(s=>`${s.name} (${s.type})`) };
  console.log(`FOLDER ${f}: status=${r.s} gated=${gated} services=${(r.j?.services||[]).length} ${r.j?.error?.message??''}`);
  for (const s of (r.j?.services||[])) console.log(`   ${s.name} (${s.type})`);
}

// City of Sydney AGOL — search the org for DCP content, treating the search API as the index.
const q = encodeURIComponent('owner:* AND (title:DCP OR title:"Development Control Plan")');
const agol = await get(`https://sydneyplanning.maps.arcgis.com/sharing/rest/search?q=${q}&num=25&f=json`);
out.sydneyAgol = { total: agol.j?.total ?? null, items:(agol.j?.results||[]).map(i=>({title:i.title,type:i.type,url:i.url??null})) };
console.log(`\nCITY OF SYDNEY AGOL search: total=${agol.j?.total ?? 'n/a'}`);
for (const i of out.sydneyAgol.items) console.log(`   ${i.type} :: ${i.title} :: ${i.url ?? '(no url)'}`);

fs.writeFileSync('../terrain-dcp-probe2.json', JSON.stringify(out,null,1));
