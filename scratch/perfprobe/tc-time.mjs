import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
const cam = new THREE.PerspectiveCamera();
const dom = { addEventListener(){}, removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){}, style:{}, getBoundingClientRect(){return{left:0,top:0,width:100,height:100};} };
// warm
for (let i=0;i<3;i++){ const t=new TransformControls(cam,dom); t.getHelper(); }
const N=20; const ts=[];
for (let i=0;i<N;i++){ const t0=performance.now(); const t=new TransformControls(cam,dom); const h=t.getHelper();
  // also do the recolour traverse initTransformControllers does
  h.traverse(o=>{ const lead=['X','Y','Z'].find(a=>o.name.startsWith(a)); if(!lead) return; const m=o.material; if(Array.isArray(m)) m.forEach(x=>x?.color?.setHex(0x6600FF)); else m?.color?.setHex(0x6600FF); });
  ts.push(performance.now()-t0); }
ts.sort((a,b)=>a-b);
console.log('construct+recolour ms: median', ts[Math.floor(N/2)].toFixed(2), 'min', ts[0].toFixed(2), 'max', ts[N-1].toFixed(2));
// geometry/material census
const t=new TransformControls(cam,dom); const h=t.getHelper();
const geos=new Set(), mats=new Set();
h.traverse(o=>{ if(o.geometry) geos.add(o.geometry); const m=o.material; if(m) (Array.isArray(m)?m:[m]).forEach(x=>mats.add(x)); });
console.log('distinct geometries', geos.size, 'distinct materials', mats.size);
