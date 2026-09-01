const BASE='https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ribos/MapServer/0/query';
const d=(ms)=> ms==null?null:new Date(ms).toISOString().slice(0,10);
for (const where of ["TPD_ID IN (123025, 203143899)", "NR IN ('T00087142','T00086338')"]) {
  const body=new URLSearchParams({where,outFields:'TPD_ID,EIL_NR,ROOT_ID,NR,PAVAD,PL_RUSIS,PL_PORUSIS,BUSENA,BUSENA_APRASYMAS,GALIOJA_NUO,GALIOJA_IKI,REGISTRUOTA,ISIGALIOJO,TVIRT_DATA,TVIRT_INST,TVIRT_PAGRINDAS,TPD_URL,AKTUALI,VIESAS',returnGeometry:'false',f:'json'});
  const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const j=JSON.parse(await r.text());
  console.log('==== WHERE:',where,'| HTTP',r.status,'| features',(j.features||[]).length, j.error?JSON.stringify(j.error):'');
  for(const f of j.features||[]){
    const a=f.attributes;
    console.log(JSON.stringify({TPD_ID:a.TPD_ID,EIL_NR:a.EIL_NR,ROOT_ID:a.ROOT_ID,NR:a.NR,PAVAD:(a.PAVAD||'').slice(0,70),PL_RUSIS:a.PL_RUSIS,PL_PORUSIS:a.PL_PORUSIS,BUSENA:a.BUSENA,BUSENA_APR:a.BUSENA_APRASYMAS,GALIOJA_NUO:d(a.GALIOJA_NUO),GALIOJA_IKI:d(a.GALIOJA_IKI),REGISTRUOTA:d(a.REGISTRUOTA),ISIGALIOJO:d(a.ISIGALIOJO),TVIRT_DATA:d(a.TVIRT_DATA),TVIRT_INST:a.TVIRT_INST,TPD_URL:a.TPD_URL,AKTUALI:a.AKTUALI,VIESAS:a.VIESAS},null,1));
  }
}
