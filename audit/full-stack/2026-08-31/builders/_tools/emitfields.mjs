import fs from 'fs';
const BS=String.fromCharCode(92);
const f = 'packages/runtime-composer/src/CommandEventBridge.ts';
const src = fs.readFileSync(f,'utf8');
const lines = src.split('\n');
const out=[];
const re = /events\.emit\(\s*'([^']+)'\s*,\s*\{/;
for(let i=0;i<lines.length;i++){
  const m = re.exec(lines[i]);
  if(!m) continue;
  // brace match from the '{' on this line
  let depth=0, started=false, buf='', j=i, col=lines[i].indexOf('{', lines[i].indexOf(m[1]));
  outer: for(; j<lines.length; j++){
    const line = lines[j];
    for(let k = (j===i? col:0); k<line.length; k++){
      const c=line[k];
      if(c==='{'){depth++;started=true;}
      else if(c==='}'){depth--; if(depth===0&&started){buf+='}'; break outer;}}
      buf+=c;
    }
    buf+='\n';
  }
  // top-level keys of buf
  const keys=[]; let d=0; let cur=''; let inStr=null;
  const body = buf.slice(1,-1);
  const parts=[]; let p='';
  for(let k=0;k<body.length;k++){
    const c=body[k];
    if(inStr){ p+=c; if(c===inStr && body[k-1]!==BS) inStr=null; continue;}
    if(c==='"'||c==="'"||c==='`'){inStr=c;p+=c;continue;}
    if(c==='{'||c==='('||c==='[')d++;
    if(c==='}'||c===')'||c===']')d--;
    if(c===','&&d===0){parts.push(p);p='';continue;}
    p+=c;
  }
  parts.push(p);
  for(const raw of parts){
    // strip comments
    const cleaned = raw.split('\n').map(l=>l.replace(/\/\/.*$/,'').replace(/\/\*[\s\S]*?\*\//g,'')).join('\n').trim();
    if(!cleaned) continue;
    const km = /^(?:\.\.\.\s*)?(?:\(?)([A-Za-z_$][\w$]*)\s*(?::|,|$)/.exec(cleaned);
    const spread = /^\.\.\./.test(cleaned);
    // key: value
    const kk = /^([A-Za-z_$][\w$]*|'[^']+')\s*:/.exec(cleaned);
    if(kk) keys.push(kk[1].replace(/'/g,''));
    else if(spread) keys.push('...SPREAD:'+cleaned.slice(0,120).replace(/\s+/g,' '));
    else if(/^[A-Za-z_$][\w$]*$/.test(cleaned)) keys.push(cleaned+' (shorthand)');
    else keys.push('?? '+cleaned.slice(0,100).replace(/\s+/g,' '));
  }
  out.push({channel:m[1], line:i+1, keys});
}
fs.writeFileSync('audit/full-stack/2026-08-31/builders/_raw/ceb-emit-fields.json', JSON.stringify(out,null,1));
console.log('emits:',out.length);
for(const o of out) console.log(o.channel, '@'+o.line, '->', o.keys.length, 'keys');
