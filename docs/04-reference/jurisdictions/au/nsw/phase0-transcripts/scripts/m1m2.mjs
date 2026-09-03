import fs from 'node:fs';
import {get,pool,countUrl} from './probe.mjs';
const CL='c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/docs/04-reference/jurisdictions/au/nsw/phase0-transcripts/m1-classified.json';
const cls=JSON.parse(fs.readFileSync(CL,'utf8'));
const RELEVANT=new Set(['DIRECT','GEOMETRIC','APPLICABILITY']);
const jobs=[];
for(const svc of Object.keys(cls)) for(const l of cls[svc]){
  if(l.type!=='Feature Layer') continue;
  if(!RELEVANT.has(l.cls)) continue;
  jobs.push({svc,id:l.id,name:l.name,cls:l.cls,fields:l.fields});
}
console.error('layers to measure:',jobs.length);
const S=(f)=>`${f} IS NOT NULL AND ${f} <> '' AND ${f} <> 'Null'`;
const rows=await pool(jobs,7,async(j)=>{
  const has=(f)=>j.fields.includes(f);
  const q=[['total','1=1']];
  if(has('LEGIS_REF_CLAUSE')) q.push(['clausePop',S('LEGIS_REF_CLAUSE')]);
  if(has('LEGIS_REF_VALUE'))  q.push(['valuePop', S('LEGIS_REF_VALUE')]);
  if(has('CADID'))            q.push(['cadidPop', 'CADID IS NOT NULL AND CADID <> 0']);
  const out={...j,fields:undefined,
    hasClause:has('LEGIS_REF_CLAUSE'),hasValue:has('LEGIS_REF_VALUE'),hasCADID:has('CADID')};
  for(const [k,w] of q){
    const r=await get(countUrl(j.svc,j.id,w));
    out[k]= (r.body && typeof r.body.count==='number') ? r.body.count : null;
    if(out[k]===null) out[k+'_err']=JSON.stringify(r.body||r.raw||r.err).slice(0,120);
  }
  return out;
});
fs.writeFileSync('m1m2-raw.json',JSON.stringify(rows,null,1));
// summary
const sum={};
for(const r of rows){
  const k=r.svc; sum[k]??={layers:0,feat:0,clauseHas:0,clausePop:0,valueHas:0,valuePop:0,cadidHas:0,cadidPop:0,errs:0};
  const s=sum[k]; s.layers++; s.feat+=r.total||0;
  if(r.hasClause){s.clauseHas+=r.total||0;s.clausePop+=r.clausePop||0;}
  if(r.hasValue){s.valueHas+=r.total||0;s.valuePop+=r.valuePop||0;}
  if(r.hasCADID){s.cadidHas+=r.total||0;s.cadidPop+=r.cadidPop||0;}
  if(r.total===null)s.errs++;
}
console.log(JSON.stringify(sum,null,1));
