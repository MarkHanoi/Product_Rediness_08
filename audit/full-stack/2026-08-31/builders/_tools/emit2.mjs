import fs from 'fs';
const BS=String.fromCharCode(92);
function stripComments(s){
  let out='';let i=0;let inStr=null;
  while(i<s.length){
    const c=s[i];
    if(inStr){ out+=c; if(c===inStr&&s[i-1]!==BS)inStr=null; i++; continue; }
    if(c==="'"||c==='"'||c==='`'){inStr=c;out+=c;i++;continue;}
    if(c==='/'&&s[i+1]==='/'){ while(i<s.length&&s[i]!=='\n')i++; continue; }
    if(c==='/'&&s[i+1]==='*'){ i+=2; while(i<s.length&&!(s[i]==='*'&&s[i+1]==='/'))i++; i+=2; continue; }
    out+=c;i++;
  }
  return out;
}
function topKeys(body){
  const keys=[];let d=0,inStr=null,p='';const parts=[];
  for(let k=0;k<body.length;k++){
    const c=body[k];
    if(inStr){p+=c; if(c===inStr&&body[k-1]!==BS)inStr=null; continue;}
    if(c==="'"||c==='"'||c==='`'){inStr=c;p+=c;continue;}
    if(c==='{'||c==='('||c==='[')d++;
    if(c==='}'||c===')'||c===']')d--;
    if(c===','&&d===0){parts.push(p);p='';continue;}
    p+=c;
  }
  parts.push(p);
  for(const raw of parts){
    const t=raw.trim();if(!t)continue;
    const kk=/^([A-Za-z_$][\w$]*|'[^']+')\s*:/.exec(t);
    if(kk){keys.push(kk[1].replace(/'/g,''));continue;}
    if(/^\.\.\./.test(t)){
      // find keys inside the spread's object literals
      const inner=[...t.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*:/g)].map(m=>m[1]);
      const sh=[...t.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\}/g)].map(m=>m[1]);
      const all=[...new Set([...inner,...sh])];
      keys.push(...all.map(x=>x+' (conditional-spread)'));
      if(all.length===0) keys.push('...SPREAD? '+t.slice(0,90).replace(/\s+/g,' '));
      continue;
    }
    if(/^[A-Za-z_$][\w$]*$/.test(t)){keys.push(t+' (shorthand)');continue;}
    keys.push('?? '+t.slice(0,90).replace(/\s+/g,' '));
  }
  return keys;
}
const f='packages/runtime-composer/src/CommandEventBridge.ts';
const raw=fs.readFileSync(f,'utf8');
const lines=raw.split('\n');
const src=stripComments(raw);
// map: find emits in stripped source, but report line by counting newlines
const out=[];
const re=/events\.emit\(\s*'([^']+)'\s*,\s*\{/g;let m;
while((m=re.exec(src))){
  const line=src.slice(0,m.index).split('\n').length;
  let i=src.indexOf('{',m.index+m[0].length-1);
  let d=0,end=-1;
  for(let k=i;k<src.length;k++){ if(src[k]==='{')d++; else if(src[k]==='}'){d--;if(d===0){end=k;break;}} }
  out.push({channel:m[1],line_stripped:line,keys:topKeys(src.slice(i+1,end))});
}
fs.writeFileSync('audit/full-stack/2026-08-31/builders/_raw/ceb-emit-fields.json',JSON.stringify(out,null,1));
for(const o of out) if(/\.created$/.test(o.channel)) console.log(o.channel+' ~L'+o.line_stripped+': '+o.keys.join(' | '));
