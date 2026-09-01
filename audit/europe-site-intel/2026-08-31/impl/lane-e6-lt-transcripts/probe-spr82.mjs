const BASE='https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/sprendiniai/MapServer/82/query';
async function q(p){const body=new URLSearchParams({f:'json',...p});const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});return JSON.parse(await r.text());}
const d=(ms)=>ms==null?null:new Date(ms).toISOString().slice(0,10);
console.log('--- TPD_ID 123025 dispositions ---');
const j=await q({where:'TPD_ID=123025',outFields:'NR,PAGR_PASK,NAUD_BUD,NAUD_TIP,MAX_INTENS,MAX_TANKIS,MAX_TU_TAN,MAX_AUK_M,MAX_AUK_SK,MIN_APZELD,MAX_SKL_PL,MIN_SKL_PL,APRASYM,TPD_ID,TPD_NR,TPD_PAVAD,PL_PORUSIS,GALIOJA_NUO,GALIOJA_IKI,AKTUALI',returnGeometry:'false'});
if(j.error)console.log(JSON.stringify(j.error));
for(const f of j.features||[]){const a=f.attributes;a.GALIOJA_NUO=d(a.GALIOJA_NUO);a.GALIOJA_IKI=d(a.GALIOJA_IKI);console.log(JSON.stringify(a));}
console.log('--- layer 82 MAX_INTENS distribution ---');
for(const [l,w] of [['total','1=1'],['INTENS not null','MAX_INTENS IS NOT NULL'],['<=10','MAX_INTENS IS NOT NULL AND MAX_INTENS<=10'],['>10','MAX_INTENS>10'],['>100','MAX_INTENS>100'],['TANKIS>100','MAX_TANKIS>100']]){
  const r=await q({where:w,returnCountOnly:'true'});console.log(String(r.count).padStart(8),'|',l, r.error?JSON.stringify(r.error):'');
}
console.log('--- sample of MAX_INTENS>10 rows in layer 82 (are they percent-like?) ---');
const s=await q({where:'MAX_INTENS>10',outFields:'MAX_INTENS,MAX_TANKIS,MAX_AUK_M,MAX_AUK_SK,TPD_NR,PL_PORUSIS',returnGeometry:'false',resultRecordCount:'15'});
for(const f of s.features||[]) console.log(JSON.stringify(f.attributes));
