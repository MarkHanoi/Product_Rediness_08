import {get,HOST,SVC} from './probe.mjs';
const pts=[[151.204795,-33.867865,'80m'],[151.210626,-33.879661,'18m'],[151.212516,-33.876688,'60m']];
for(const [x,y,lbl] of pts){
  const d=0.0004;
  const p=new URLSearchParams({geometry:`${x},${y}`,geometryType:'esriGeometryPoint',sr:'4283',
    layers:'all:14,11',tolerance:'0',mapExtent:`${x-d},${y-d},${x+d},${y+d}`,
    imageDisplay:'400,400,96',returnGeometry:'false',f:'json'});
  const r=await get(`https://${HOST}/arcgis/rest/services/${SVC.Principal}/MapServer/identify?${p}`);
  console.log(lbl,'-> identify n=',r.body?.results?.length,
    JSON.stringify((r.body?.results||[]).map(z=>[z.layerId,z.attributes.MAX_B_H||z.attributes.FSR,z.attributes.UNITS])));
}
