import fs from 'node:fs';
import {get,pool,countUrl} from './probe.mjs';
const rows=JSON.parse(fs.readFileSync('m1m2-raw.json','utf8')).filter(r=>r.cls==='DIRECT'&&r.total>0);
console.error('DIRECT layers with features:',rows.length);
const S=f=>`${f} IS NOT NULL AND ${f} <> '' AND ${f} <> 'Null'`;
const out=await pool(rows,7,async(r)=>{
  const a=await get(countUrl(r.svc,r.id,S('LAY_CLASS')));
  return {...r,layPop:a.body?.count??null};
});
fs.writeFileSync('layclass.json',JSON.stringify(out,null,1));
let t=0,p=0; const bad=[];
for(const r of out){t+=r.total; p+=r.layPop||0; if((r.layPop||0)<r.total) bad.push(`${r.svc}/${r.id} ${r.name}: ${r.layPop}/${r.total}`);}
console.log('DIRECT layers:',out.length,' features:',t,' LAY_CLASS populated:',p,`(${(100*p/t).toFixed(1)}%)`);
console.log('layers with ANY unpopulated LAY_CLASS:',bad.length);
console.log(bad.slice(0,25).join('\n'));
