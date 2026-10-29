// Package the standalone prototype. Original SVG illustrations: CODEX, round 1; reused with attribution.
// Author: CODEX, 2026-10-29.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(root,'assets'),{recursive:true});
const previous=path.resolve(root,'../homepage');
for(const name of ['literata-regular.woff2','literata-semibold.woff2','Literata-LICENSE.txt'])fs.copyFileSync(path.join(previous,'assets',name),path.join(root,'assets',name));
const previousJs=fs.readFileSync(path.join(previous,'app.js'),'utf8');
const artCode=previousJs.slice(previousJs.indexOf('let artId = 0;'),previousJs.indexOf('const stories = ['));
const art=new Function(artCode+'; return art;')();
for(let kind=0;kind<4;kind++)fs.writeFileSync(path.join(root,'assets',`cover-${kind}.svg`),'<!-- Illustration by CODEX, 2026-10-29; reused from round 1. -->\n'+art(kind).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '));
let css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
for(const weight of ['regular','semibold'])css=css.replace(`assets/literata-${weight}.woff2`,`data:font/woff2;base64,${fs.readFileSync(path.join(root,'assets',`literata-${weight}.woff2`)).toString('base64')}`);
let js=fs.readFileSync(path.join(root,'app.js'),'utf8');
const embedded=[0,1,2,3].map(i=>'data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'assets',`cover-${i}.svg`)).toString('base64'));
js=js.replaceAll('assets/cover-${s.kind}.svg','${embeddedCovers[s.kind]}');
js=js.replace("const titles=",'const embeddedCovers='+JSON.stringify(embedded)+';\nconst titles=');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<link rel="stylesheet" href="styles.css">',()=>'<style>'+css+'</style>').replace('<script src="app.js" defer></script>','');
for(let i=0;i<4;i++)html=html.replaceAll(`assets/cover-${i}.svg`,embedded[i]);
// Static artwork inside JavaScript template strings also needs embedding.
for(let i=0;i<4;i++)js=js.replaceAll(`assets/cover-${i}.svg`,embedded[i]);
html=html.replace('</head>',()=>'<script type="text/plain" id="literata-license">'+fs.readFileSync(path.join(root,'assets','Literata-LICENSE.txt'),'utf8')+'</script>\n</head>');
html=html.replace('</body>',()=>'<script>'+js+'</script>\n</body>');
fs.writeFileSync(path.join(root,'home-motion-drafts.html'),html);
console.log('CODEX · Portable HTML built: '+Buffer.byteLength(html)+' bytes');
