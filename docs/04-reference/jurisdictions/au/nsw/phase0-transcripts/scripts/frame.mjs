import {get} from './probe.mjs';
const B='https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/FeatureServer/8';
const c=await get(`${B}/query?where=1%3D1&returnCountOnly=true&f=json`);
console.log('parcel count:',JSON.stringify(c.body));
const st=await get(`${B}/query?where=1%3D1&outStatistics=${encodeURIComponent(JSON.stringify([
 {statisticType:'min',onStatisticField:'objectid',outStatisticFieldName:'mn'},
 {statisticType:'max',onStatisticField:'objectid',outStatisticFieldName:'mx'}]))}&f=json`);
console.log('objectid range:',JSON.stringify(st.body?.features?.[0]?.attributes||st.body).slice(0,300));
