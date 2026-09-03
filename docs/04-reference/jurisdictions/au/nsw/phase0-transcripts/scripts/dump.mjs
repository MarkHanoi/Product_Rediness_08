import {get,HOST,SVC} from './probe.mjs';
const want=[[430,'Building Height Plane'],[573,'Sun Plane Protection'],[469,'Floor Height Restriction'],[431,'Building Setback'],[422,'Alt Building Heights'],[416,'Active Street Frontages'],[471,'Foreshore Scenic']];
for(const [id,label] of want){
  const u=`https://${HOST}/arcgis/rest/services/${SVC.LocalProvisions}/MapServer/${id}/query?where=1%3D1&outFields=OBJECTID,EPI_NAME,LGA_NAME,LAY_CLASS,LABEL,LEGIS_REF_CLAUSE,LEGIS_REF_VALUE,CADID&returnGeometry=false&resultRecordCount=12&f=json`;
  const r=await get(u);
  const fs_=r.body?.features||[];
  console.log(`\n### ${id} ${label} — returned ${fs_.length}`);
  if(r.body?.error) console.log('ERR',JSON.stringify(r.body.error).slice(0,200));
  for(const f of fs_.slice(0,8)){
    const a=f.attributes;
    console.log(`  [${a.LGA_NAME}] LAY_CLASS=${JSON.stringify(a.LAY_CLASS)} LABEL=${JSON.stringify(a.LABEL)} CLAUSE=${JSON.stringify(a.LEGIS_REF_CLAUSE)} VALUE=${JSON.stringify(a.LEGIS_REF_VALUE)}`);
  }
}
