import fs from 'fs';
const W='audit/full-stack/2026-08-31/legacy-work/';
const rd=n=>new Set(fs.readFileSync(W+n,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean));
const S={disk:rd('s_disk.txt'),all:rd('s_allplugins.txt'),catalog:rd('s_catalog.txt'),element:rd('s_element.txt'),storeonly:rd('s_storeonly.txt')};
const d=(a,b)=>[...a].filter(x=>!b.has(x)).sort();
const pairs=[['disk','all'],['disk','catalog'],['all','catalog'],['all','element'],['catalog','element'],['element','disk'],['storeonly','element'],['storeonly','all']];
const out={};
for(const [x,y] of pairs){ out[x+'_MINUS_'+y]=d(S[x],S[y]); out[y+'_MINUS_'+x]=d(S[y],S[x]); }
for(const k of Object.keys(S)) out['size_'+k]=S[k].size;
fs.writeFileSync(W+'census-drift-P4.json',JSON.stringify(out,null,1));
console.log(JSON.stringify(out,null,1));
