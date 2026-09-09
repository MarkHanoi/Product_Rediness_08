import { fromArrayBuffer } from 'geotiff';
const EP='https://wcs-mds.idee.es/mds';
const url=(cov,[w,s,e,n])=>`${EP}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${cov}&FORMAT=image/tiff&SUBSET=lat(${s},${n})&SUBSET=long(${w},${e})&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326`;
const areas=[
 ['ciudad-real',[-3.935,38.980,-3.920,38.992]],
 ['madrid-sol',[-3.710,40.412,-3.695,40.424]],
 ['barcelona-eixample',[2.155,41.386,2.170,41.398]],
 ['sevilla-centro',[-6.000,37.383,-5.985,37.395]],
 ['cordoba-centro',[-4.785,37.878,-4.770,37.890]],
 ['ciudad-real-alt',[-3.929,38.9835,-3.921,38.9895]],
];
for (const [name,bb] of areas){
  const u=url('mdsn_e025',bb);
  const t0=Date.now();
  try{
    const r=await fetch(u,{signal:AbortSignal.timeout(90000)});
    const ct=r.headers.get('content-type')||'';
    const ab=await r.arrayBuffer();
    const ms=Date.now()-t0;
    if(!r.ok||!/tiff/i.test(ct)){
      console.log(`${name}: status=${r.status} ct=${ct} bytes=${ab.byteLength} t=${ms}ms FIRST200=${Buffer.from(ab).toString('utf8').slice(0,200).replace(/\s+/g,' ')}`);
      continue;
    }
    const tif=await fromArrayBuffer(ab); const img=await tif.getImage();
    const [d]=await img.readRasters();
    let n=0,nz=0,mx=-Infinity,mn=Infinity; const v=[];
    for(let i=0;i<d.length;i++){const x=d[i]; if(!Number.isFinite(x))continue; n++; if(x>0.5){nz++; v.push(x); if(x>mx)mx=x; if(x<mn)mn=x;}}
    v.sort((a,b)=>a-b);
    const p=(q)=>v.length? v[Math.min(v.length-1,Math.floor(q*v.length))].toFixed(1):'-';
    console.log(`${name}: status=${r.status} ct=${ct} bytes=${ab.byteLength} t=${ms}ms px=${img.getWidth()}x${img.getHeight()} finite=${n} >0.5m=${nz} (${(100*nz/Math.max(1,n)).toFixed(1)}%) p50=${p(0.5)} p90=${p(0.9)} max=${v.length?mx.toFixed(1):'-'}`);
  }catch(err){console.log(`${name}: THREW ${String(err?.message??err)} t=${Date.now()-t0}ms`);}
}
