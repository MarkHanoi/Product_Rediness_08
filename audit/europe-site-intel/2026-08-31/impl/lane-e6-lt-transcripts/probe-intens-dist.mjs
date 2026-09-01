const BASE='https://tpdr.planuojustatau.lt/arcgis/rest/services/duomenu_viesinimas/ASGR/MapServer/0/query';
async function q(params){
  const body=new URLSearchParams({f:'json',...params});
  const r=await fetch(BASE,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  return JSON.parse(await r.text());
}
const buckets=[
  ['total','1=1'],
  ['INTENS not null','MAX_INTENS IS NOT NULL'],
  ['INTENS <= 10','MAX_INTENS IS NOT NULL AND MAX_INTENS <= 10'],
  ['INTENS > 10','MAX_INTENS > 10'],
  ['INTENS > 10 AND <= 100','MAX_INTENS > 10 AND MAX_INTENS <= 100'],
  ['INTENS > 100','MAX_INTENS > 100'],
  ['INTENS non-integer (has decimals)',"MAX_INTENS IS NOT NULL AND MAX_INTENS <> ROUND(MAX_INTENS,0)"],
  ['AUK_M not null','MAX_AUK_M IS NOT NULL'],
  ['TANKIS not null','MAX_TANKIS IS NOT NULL'],
  ['TANKIS > 100','MAX_TANKIS > 100'],
  ['PILN = N',"PILN = 'N'"],
  ['PILN = P',"PILN = 'P'"],
  ['PILN not null','PILN IS NOT NULL'],
  ['ATN_DOK not null','ATN_DOK IS NOT NULL'],
];
for(const [label,where] of buckets){
  try{
    const j=await q({where,returnCountOnly:'true'});
    console.log(String(j.count).padStart(8), '|', label, j.error?JSON.stringify(j.error):'');
  }catch(e){ console.log('ERR',label,e.message); }
}
