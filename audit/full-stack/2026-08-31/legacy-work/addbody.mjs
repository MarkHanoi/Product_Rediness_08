import fs from 'fs';
const files={wall:'packages/geometry-wall/src/WallStore.ts',slab:'packages/geometry-slab/src/SlabStore.ts',column:'packages/geometry-column/src/ColumnStore.ts',beam:'packages/core-app-model/src/stores/BeamStore.ts',roof:'packages/geometry-roof/src/RoofStore.ts',ceiling:'packages/core-app-model/src/stores/CeilingStore.ts',floor:'packages/core-app-model/src/stores/FloorStore.ts',handrail:'packages/core-app-model/src/stores/HandrailStore.ts','curtain-wall':'packages/geometry-curtain-wall/src/CurtainWallStore.ts',door:'packages/geometry-door/src/DoorStore.ts',window:'packages/geometry-window/src/WindowStore.ts',furniture:'packages/geometry-furniture/src/FurnitureStore.ts',lighting:'packages/geometry-lighting/src/LightingStore.ts',plumbing:'packages/geometry-plumbing/src/PlumbingStore.ts',lift:'packages/geometry-lift/src/LiftStore.ts',room:'packages/room-topology/src/RoomStore.ts',grid:'packages/core-app-model/src/stores/GridStore.ts',stair:'packages/geometry-stair/src/StairStore.ts'};
const res={};
for(const [k,f] of Object.entries(files)){
  const L=fs.readFileSync(f,'utf8').split(/\r?\n/);
  // find add( at method indent
  let start=-1;
  for(let i=0;i<L.length;i++){ if(/^\s{2,8}(public\s+)?add\s*\(/.test(L[i])) { start=i; break; } }
  if(start<0){ res[k]={file:f,add:'NOT-FOUND-BY-REGEX'}; continue; }
  // brace balance
  let depth=0, end=start, opened=false;
  for(let i=start;i<L.length;i++){ for(const ch of L[i]){ if(ch==='{'){depth++;opened=true;} else if(ch==='}'){depth--;} } if(opened&&depth<=0){end=i;break;} }
  const body=L.slice(start,end+1);
  const seb=body.map((l,i)=>[start+i+1,l.trim()]).filter(([n,l])=>/storeEventBus/.test(l)&&!/^\/\//.test(l));
  const dom=body.map((l,i)=>[start+i+1,l.trim()]).filter(([n,l])=>/_bus\.emit|dispatchEvent/.test(l)&&!/^\/\//.test(l));
  res[k]={file:f,add_line:start+1,add_end:end+1,storeEventBus_in_add:seb,dom_event_in_add:dom};
}
fs.writeFileSync('audit/full-stack/2026-08-31/legacy-work/add-bodies.json',JSON.stringify(res,null,1));
for(const [k,v] of Object.entries(res)) console.log(k, v.add_line+'-'+v.add_end, 'SEB='+(v.storeEventBus_in_add||[]).length, 'DOM='+(v.dom_event_in_add||[]).length, (v.storeEventBus_in_add||[]).map(x=>x[0]).join(','), '||', (v.dom_event_in_add||[]).map(x=>x[1].slice(0,60)).join(' ; '));
