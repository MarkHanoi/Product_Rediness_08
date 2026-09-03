import {get,HOST,SVC} from './probe.mjs';
for(const [svc,id] of [['LocalProvisions',572],['LocalProvisions',431],['Principal',14],['SEPP',null]]){
  if(id===null) continue;
  const r=await get(`https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/${id}?f=json`);
  const f=r.body?.fields||[];
  const pick=f.filter(x=>/CADID|LEGIS_REF_CLAUSE|LEGIS_REF_VALUE|LAY_CLASS|MAX_B_H|UNITS/i.test(x.name));
  console.log(svc,id,r.body?.name,'|',pick.map(x=>x.name+':'+x.type.replace('esriFieldType','')).join(', '));
}
