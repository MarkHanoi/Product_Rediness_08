import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
const cam = new THREE.PerspectiveCamera();
const dom = { addEventListener(){}, removeEventListener(){}, setPointerCapture(){}, releasePointerCapture(){}, style:{}, getBoundingClientRect(){return{left:0,top:0,width:100,height:100};} };
const tc = new TransformControls(cam, dom);
const helper = tc.getHelper();
let mesh=0, line=0, total=0;
helper.traverse(o=>{ total++; if (o.isMesh) mesh++; else if (o.isLine) line++; });
console.log('helper total objects:', total, ' Mesh:', mesh, ' Line:', line);
helper.children.forEach(c=>{
  let m=0; c.traverse(o=>{ if(o.isMesh) m++; });
  console.log('  child', c.type, JSON.stringify(c.name), 'meshes=', m, 'visible=', c.visible);
  c.children.forEach(g=>{ let m2=0; g.traverse(o=>{ if(o.isMesh) m2++; }); console.log('      ', g.type, JSON.stringify(g.name), 'meshes=', m2, 'visible=', g.visible); });
});
