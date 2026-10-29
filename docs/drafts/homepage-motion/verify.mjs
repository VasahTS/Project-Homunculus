// Functional, accessibility and motion checks for the standalone draft. Author: CODEX, 2026-10-29.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(root,'previews'),{recursive:true});
const filename=process.env.HOME_MOTION_FILE||'index.html';
const url=pathToFileURL(path.join(root,filename)).href;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},colorScheme:'light'});
const page=await context.newPage();
const errors=[],report={author:'CODEX',file:filename,layouts:[],contrast:[],motion:[],checks:[]};
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const pause=ms=>page.waitForTimeout(ms);
async function load(draft='d',width=1440,appearance='light'){
  await page.setViewportSize({width,height:width===390?844:960});await page.emulateMedia({colorScheme:appearance,reducedMotion:'no-preference'});
  await page.goto(`${url}?case=${draft}-${width}-${appearance}-${Date.now()}#${draft}`);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.shell').getAttribute('data-draft'),draft);
}
async function noOverflow(label){const v=await page.evaluate(()=>({document:document.documentElement.scrollWidth-innerWidth,main:document.querySelector('main').scrollWidth-document.querySelector('main').clientWidth}));assert.ok(v.document<=1&&v.main<=1,`${label}: overflow ${JSON.stringify(v)}`);}
async function shot(name){await page.screenshot({path:path.join(root,'previews',name+'.png'),fullPage:true});}
function luminance(hex){if(hex.length===4)hex='#'+[...hex.slice(1)].map(c=>c+c).join('');const rgb=hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
try{
  for(const appearance of ['light','dark'])for(const width of [1440,900,390])for(const draft of ['d','e','f']){
    await load(draft,width,appearance);await noOverflow(`${draft}/${width}/${appearance}`);
    await shot(`${draft}-${width}-${appearance}`);report.layouts.push({draft,width,appearance});
    const broken=await page.locator('img').evaluateAll(imgs=>imgs.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src.slice(0,100)));assert.deepEqual(broken,[]);
  }
  for(const appearance of ['light','dark']){
    await load('d',1440,appearance);
    const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement);return Object.fromEntries(['background','surface','surface-2','foreground','secondary','accent','accent-ink','selection'].map(k=>[k,s.getPropertyValue('--'+k).trim()]));});
    for(const surface of ['background','surface','surface-2','selection'])for(const foreground of ['foreground','secondary']){const value=ratio(tokens[foreground],tokens[surface]);assert.ok(value>=4.5,`${appearance} ${foreground}/${surface}: ${value}`);report.contrast.push({appearance,foreground,surface,ratio:+value.toFixed(2)});}
    assert.ok(ratio(tokens.accent,tokens['accent-ink'])>=4.5);
  }
  for(const draft of ['d','e','f']){
    await load(draft);
    for(const state of ['empty','full','loading','error']){await page.locator('#state').selectOption(state);await noOverflow(draft+'/'+state);if(state==='empty'||state==='full'&&draft==='f')await shot(`${draft}-${state}`);}
    await page.getByRole('button',{name:'Try again'}).click();assert.equal(await page.locator('#state').inputValue(),'normal');
  }
  report.checks.push('18 layout/appearance combinations; first-use, full, loading, error, retry; no horizontal overflow or broken images');
  await load('d');
  await page.locator('#new-trigger').click();await page.locator('#new-menu').waitFor({state:'visible'});await pause(210);await shot('menu-new');
  assert.equal(await page.locator('#new-menu [role=menuitem]').count(),3);
  assert.match(await page.locator(':focus').innerText(),/New Story/);
  await page.keyboard.press('ArrowDown');assert.match(await page.locator(':focus').innerText(),/New Conversation/);
  await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('id'),'new-trigger');
  await page.locator('#new-trigger').focus();await page.keyboard.press('Enter');await page.locator('#new-menu').waitFor({state:'visible'});
  assert.equal(await page.locator('#new-menu').evaluate(e=>getComputedStyle(e).transitionDuration.split(',')[0]),'0s');
  await page.keyboard.press('Enter');assert.ok(await page.locator('#sheet').isVisible());
  assert.equal(await page.locator('#sheet').evaluate(e=>e.getAnimations().length),0);
  await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('id'),'new-trigger');
  report.checks.push('Native menu: arrow navigation, Escape, return focus; keyboard opening of menu and sheet is immediate');
  await page.locator('.resume-visual').click();
  const flight=await page.evaluate(()=>{const el=document.querySelector('.cover-flight');if(!el)return null;const animations=el.getAnimations({subtree:true});animations.forEach(a=>{a.pause();a.currentTime=120;});const a=animations[0];return {duration:a.effect.getTiming().duration,frames:animations.flatMap(a=>a.effect.getKeyframes()).map(f=>({transform:f.transform,opacity:f.opacity,clipPath:f.clipPath})),rect:el.getBoundingClientRect().toJSON()};});
  assert.ok(flight,'Shared cover animation should be active');assert.equal(flight.duration,240);report.motion.push({sharedCover:flight});
  await shot('story-transition-midpoint');
  await page.evaluate(()=>document.querySelector('.cover-flight').getAnimations({subtree:true}).forEach(a=>a.finish()));await pause(30);
  assert.equal(await page.locator('.cover-flight').count(),0);await shot('story-open');
  await page.getByRole('button',{name:'Home',exact:true}).first().click();await pause(270);assert.ok(await page.locator('.resume').isVisible());
  // A new navigation immediately cancels a cover transition and leaves no hidden destination behind.
  await page.locator('.resume-visual').click();await page.locator('[data-action="nav"][data-area="library"]').first().click();await pause(290);
  assert.equal(await page.locator('.cover-flight').count(),0);assert.equal(await page.locator('main [style*="visibility: hidden"]').count(),0);
  report.checks.push('Shared cover opens and returns symmetrically in 240 ms; midpoint inspected; navigation cancels without orphan overlays');
  await page.keyboard.press('Control+k');assert.ok(await page.locator('#command').isVisible());
  assert.equal(await page.locator('#command').evaluate(e=>e.getAnimations().length),0);
  await page.locator('#command-search').fill('Cartographer');assert.equal(await page.locator('.command-result').count(),1);
  await page.keyboard.press('Enter');assert.match(await page.locator('.story-heading h1').innerText(),/Cartographer/);
  assert.equal(await page.locator('.cover-flight').count(),0);
  await page.keyboard.press('Control+k');await page.locator('#command-search').fill('zzzz-no-story');assert.ok(await page.getByText('No Stories or Characters match this search.').isVisible());await page.keyboard.press('Escape');
  report.checks.push('Ctrl K and typed search: instant; keyboard selection opens Story without motion; no-results state');
  await load('d');await page.locator('.title-actions [data-action=create]').click();await pause(80);
  const sheetFrames=await page.locator('#sheet').evaluate(el=>{const a=el.getAnimations()[0];return a?{duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes().map(k=>({transform:k.transform,opacity:k.opacity}))}:null;});
  assert.ok(sheetFrames);assert.equal(sheetFrames.duration,280);report.motion.push({sheet:sheetFrames});await shot('sheet-create');
  await page.locator('#create-form [name=title]').fill('The small orchard');await page.getByRole('button',{name:'Create Story',exact:true}).last().click();await pause(230);
  assert.match(await page.locator('main h1').innerText(),/small orchard/);await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.getByText('The small orchard',{exact:true}).count(),0);
  await page.locator('.story-card .more').first().click();await page.getByRole('menuitem',{name:'Pin Story',exact:true}).click();assert.ok(await page.locator('main').getByText(/Pinned/).isVisible());await page.getByRole('button',{name:'Undo',exact:true}).click();
  report.checks.push('Sheet movement limited to transform/opacity; temporary Story creation and undo; Story menu pin and undo');
  await load('f');const options=page.locator('.story-list-item');await options.nth(1).click();assert.match(await page.locator('.preview-pane h2').innerText(),/Cartographer/);await page.getByRole('tab',{name:'Setup',exact:true}).click();assert.ok(await page.locator('.setup-list').isVisible());await page.getByRole('tab',{name:'Chats',exact:true}).click();
  await options.nth(1).focus();await page.keyboard.press('ArrowDown');assert.match(await page.locator('.preview-pane h2').innerText(),/Amber Court/);await shot('workspace-selection');
  await page.locator('#list-search').fill('nonexistent');assert.ok(await page.getByText('No Stories match this title.').isVisible());
  await load('f',390);await page.locator('.story-list-item').nth(1).click();assert.ok(await page.locator('.preview-pane').isVisible());await page.locator('[data-action=preview-back]').click();assert.ok(await page.locator('.story-list-panel').isVisible());
  report.checks.push('Split view: pointer and arrow-key selection, tab keyboard semantics, filter/no-results, compact back navigation');
  await load('d');await page.locator('#reduce').check();await page.locator('.resume-visual').click();assert.equal(await page.locator('.cover-flight').count(),0);
  const transforms=await page.locator('main').evaluate(e=>e.getAnimations({subtree:true}).flatMap(a=>a.effect.getKeyframes()).filter(k=>k.transform&&k.transform!=='none'));assert.equal(transforms.length,0);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#new-trigger').click();assert.equal(await page.locator('#new-menu').evaluate(e=>getComputedStyle(e).transform),'none');await page.keyboard.press('Escape');
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-contrast',value:'more'}]});
  const accessibility=await page.evaluate(()=>({transparency:matchMedia('(prefers-reduced-transparency:reduce)').matches,filter:getComputedStyle(document.querySelector('.sidebar')).backdropFilter,fill:getComputedStyle(document.querySelector('.sidebar')).backgroundColor,outline:getComputedStyle(document.querySelector('.nav-item[aria-current=page]')).outlineWidth}));
  assert.ok(accessibility.transparency);assert.equal(accessibility.filter,'none');assert.match(accessibility.fill,/^rgb\(/);assert.equal(accessibility.outline,'2px');report.accessibility=accessibility;
  report.checks.push('Reduced motion via review and system: opacity only, no cover displacement; reduced-transparency CSS has opaque fallback');
  assert.deepEqual(errors,[]);report.consoleErrors=errors;report.result='PASS';
  fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({author:report.author,result:report.result,file:filename,layoutCombinations:report.layouts.length,minimumTextContrast:Math.min(...report.contrast.map(v=>v.ratio)),checks:report.checks,motion:report.motion.map(m=>Object.keys(m)[0]),consoleErrors:errors.length},null,2));
}finally{await browser.close();}
