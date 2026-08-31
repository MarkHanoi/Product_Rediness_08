import fs from 'fs';
const f='apps/editor/src/engine/initTools.ts';
const L=fs.readFileSync(f,'utf8').split(/\r?\n/);
const starts=[];
L.forEach((l,i)=>{ const m=l.match(/runtime\.events\.on\('([^']+)'/); if(m) starts.push({ch:m[1],line:i+1}); });
starts.push({ch:'__END__',line:L.length+1});
const out=[];
for(let i=0;i<starts.length-1;i++){
  const a=starts[i].line, b=starts[i+1].line;
  const marks=[];
  for(let n=a;n<b;n++){
    const t=L[n-1];
    const code=t.replace(/^\s+/,'');
    if(/^(\/\/|\*|\/\*)/.test(code)) continue;
    if(/\.registerElement\(/.test(t)) marks.push([n,'REGISTER',code.trim().slice(0,110)]);
    else if(/\.add\(/.test(t)) marks.push([n,'ADD',code.trim().slice(0,110)]);
    else if(/storeEventBus/.test(t)) marks.push([n,'SEB',code.trim().slice(0,110)]);
    else if(/window as any|\(window as unknown/.test(t)) marks.push([n,'WINANY',code.trim().slice(0,110)]);
    else if(/alreadyMirrored|already mirrored|dedup/i.test(t)) marks.push([n,'DEDUP',code.trim().slice(0,110)]);
    else if(/\breturn\b/.test(t) && /alreadyMirrored|has\(|\?\?/.test(t)) marks.push([n,'RET',code.trim().slice(0,110)]);
  }
  out.push({channel:starts[i].ch,start:a,end:b-1,marks});
}
fs.writeFileSync('audit/full-stack/2026-08-31/legacy-work/bridges.json',JSON.stringify(out,null,1));
for(const o of out){ console.log('=== '+o.channel+' ['+o.start+'-'+o.end+']'); for(const m of o.marks) console.log('  '+m[0]+' '+m[1]+' :: '+m[2]); }
