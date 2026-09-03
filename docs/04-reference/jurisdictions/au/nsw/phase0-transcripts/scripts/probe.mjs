import https from 'node:https';
export const HOST='mapprod3.environment.nsw.gov.au';
export const SVC={
  Principal:'ePlanning/Planning_Portal_Principal_Planning',
  LocalProvisions:'ePlanning/Planning_Portal_Local_Provisions',
  SEPP:'ePlanning/Planning_Portal_SEPP',
};
const agent=new https.Agent({keepAlive:true,maxSockets:8});
export function get(url,tries=3){
  return new Promise((res)=>{
    const attempt=(n)=>{
      const req=https.get(url,{agent,timeout:45000},(r)=>{
        let b='';r.setEncoding('utf8');r.on('data',c=>b+=c);
        r.on('end',()=>{
          try{res({status:r.statusCode,body:JSON.parse(b)});}
          catch(e){ if(n<tries) return setTimeout(()=>attempt(n+1),800*n); res({status:r.statusCode,body:null,raw:b.slice(0,300)}); }
        });
      });
      req.on('timeout',()=>{req.destroy(new Error('timeout'));});
      req.on('error',(e)=>{ if(n<tries) return setTimeout(()=>attempt(n+1),800*n); res({status:0,body:null,err:String(e)}); });
    };
    attempt(1);
  });
}
export async function pool(items,n,fn){
  const out=new Array(items.length); let i=0;
  await Promise.all(Array.from({length:n},async()=>{
    while(true){const k=i++; if(k>=items.length)break; out[k]=await fn(items[k],k);}
  }));
  return out;
}
export const countUrl=(svc,id,where)=>
  `https://${HOST}/arcgis/rest/services/${SVC[svc]}/MapServer/${id}/query?where=${encodeURIComponent(where)}&returnCountOnly=true&f=json`;
