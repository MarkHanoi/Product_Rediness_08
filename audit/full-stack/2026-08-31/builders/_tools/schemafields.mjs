import fs from 'fs';
const dir='packages/schemas/src/elements/';
const out={};
for(const f of fs.readdirSync(dir)){
  if(!f.endsWith('.ts')||f==='index.ts') continue;
  const src=fs.readFileSync(dir+f,'utf8');
  const re=/defineElement\(\s*'([^']+)'\s*,\s*\{/g;
  let m;
  while((m=re.exec(src))){
    const kind=m[1];
    let i=src.indexOf('{', m.index+m[0].length-1);
    let depth=0,end=-1;
    for(let k=i;k<src.length;k++){
      if(src[k]==='{')depth++;
      else if(src[k]==='}'){depth--; if(depth===0){end=k;break;}}
    }
    const body=src.slice(i+1,end);
    // strip comments
    const clean=body.replace(/\/\*[\s\S]*?\*\//g,'').split('\n').map(l=>l.replace(/\/\/.*$/,'')).join('\n');
    const keys=[]; let d=0,inStr=null,p='';
    const parts=[];
    for(let k=0;k<clean.length;k++){
      const c=clean[k];
      if(inStr){p+=c; if(c===inStr&&clean[k-1]!==String.fromCharCode(92))inStr=null; continue;}
      if(c==="'"||c==='"'||c==='`'){inStr=c;p+=c;continue;}
      if(c==='{'||c==='('||c==='[')d++;
      if(c==='}'||c===')'||c===']')d--;
      if(c===','&&d===0){parts.push(p);p='';continue;}
      p+=c;
    }
    parts.push(p);
    for(const raw of parts){
      const t=raw.trim(); if(!t)continue;
      const kk=/^([A-Za-z_$][\w$]*|'[^']+')\s*:/.exec(t);
      if(kk)keys.push(kk[1].replace(/'/g,''));
      else if(/^\.\.\./.test(t))keys.push('...SPREAD '+t.slice(0,80).replace(/\s+/g,' '));
    }
    out[kind]={file:dir+f, count:keys.length, fields:keys};
  }
}
fs.writeFileSync('audit/full-stack/2026-08-31/builders/_raw/schema-fields.json',JSON.stringify(out,null,1));
for(const k of Object.keys(out).sort())console.log(k, out[k].count, out[k].fields.join(','));
