import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
const cam = new THREE.PerspectiveCamera();
const dom = { addEventListener(){}, removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){}, style:{}, getBoundingClientRect(){return{left:0,top:0,width:100,height:100};} };
const tc = new TransformControls(cam, dom);
const helper = tc.getHelper();
console.log('root.visible =', helper.visible);
const MIN=0.05, MAX=500;
let cast=0, subTexel=0, skippedByName=0, total=0;
const names = new Set();
helper.traverse(o=>{
  if(!o.isMesh) return; total++;
  const role=o.userData?.role; const name=(o.name??'').toLowerCase();
  names.add(o.name??'(unnamed)');
  if(role==='edges'||role==='edge-overlay'){skippedByName++;return;}
  if(name.includes('edge')||name.includes('grid')||name.includes('collision')){skippedByName++;return;}
  const mat=Array.isArray(o.material)?o.material[0]:o.material;
  if(mat?.type==='ShadowMaterial'){return;}
  if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
  const r=(o.geometry.boundingSphere?.radius??0)*Math.max(Math.abs(o.scale.x),Math.abs(o.scale.y),Math.abs(o.scale.z));
  if(r>MAX){return;}
  if(mat && mat.transparent && mat.opacity<0.5) {subTexel++; return;} // matInvisible opacity .15 -> skipped
  if(r>0 && r<MIN){subTexel++;return;}
  cast++;
});
console.log('gizmo meshes total', total, ' would be PROMOTED to castShadow:', cast, ' skipped(transparent/sub-texel):', subTexel, ' skipped by name/role:', skippedByName);
console.log('distinct names:', [...names].join(','));
