import fs from 'node:fs';
import https from 'node:https';
const agent=new https.Agent({keepAlive:true,maxSockets:6});
const get=(u,t=35000)=>new Promise(r=>{const q=https.get(u,{agent,timeout:t},x=>{let b='';x.setEncoding('utf8');x.on('data',c=>{if(b.length<500000)b+=c;});x.on('end',()=>{try{r({s:x.statusCode,j:JSON.parse(b)});}catch{r({s:x.statusCode,j:null,raw:b.slice(0,300)});}});});q.on('timeout',()=>q.destroy(new Error('t')));q.on('error',e=>r({s:0,err:String(e)}));});
const SYD='https://services1.arcgis.com/cNVyNtjGVZybOQWZ/arcgis/rest/services/Sydney_Development_Control_Plan_2012/FeatureServer';
const out={probedAt:new Date().toISOString().slice(0,10),service:SYD,layers:{}};
// The envelope-bearing DCP layers: setbacks(+clause), street frontage height in storeys,
// building height in storeys, active frontage clause, specific sites.
for (const id of [1,3,4,5,7,12,16]) {
  const meta=await get(`${SYD}/${id}?f=json`);
  const cnt=await get(`${SYD}/${id}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const sample=await get(`${SYD}/${id}/query?where=1%3D1&outFields=*&resultRecordCount=3&returnGeometry=false&f=json`);
  const fields=(meta.j?.fields||[]).map(f=>`${f.name}:${f.type.replace('esriFieldType','')}`);
  const rows=(sample.j?.features||[]).map(f=>f.attributes);
  out.layers[id]={name:meta.j?.name??null,count:cnt.j?.count??null,fields,sample:rows};
  console.log(`\n=== ${id} "${meta.j?.name}"  count=${cnt.j?.count??'n/a'}`);
  console.log(`  fields: ${fields.join(' | ')}`);
  for (const r of rows) console.log(`  ROW ${JSON.stringify(r).slice(0,260)}`);
}
fs.writeFileSync('../sydney-dcp-probe.json', JSON.stringify(out,null,1));
