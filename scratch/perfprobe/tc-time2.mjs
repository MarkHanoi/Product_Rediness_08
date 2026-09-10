import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
const cam = new THREE.PerspectiveCamera();
const dom = { addEventListener(){}, removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){}, style:{}, getBoundingClientRect(){return{left:0,top:0,width:100,height:100};} };
for (let i=0;i<50;i++){ const t=new TransformControls(cam,dom); t.getHelper(); }
const N=200; const ts=[];
for (let i=0;i<N;i++){ const t0=performance.now(); const t=new TransformControls(cam,dom); t.getHelper(); ts.push(performance.now()-t0); }
ts.sort((a,b)=>a-b);
const p=(q)=>ts[Math.floor(N*q)].toFixed(2);
console.log('construct only ms: p05',p(0.05),'median',p(0.5),'p95',p(0.95));
