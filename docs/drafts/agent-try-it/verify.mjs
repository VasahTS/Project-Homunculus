// Visual and interaction checks for the isolated Try it draft. CODEX, 2026-10-30.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath,pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { chromium,expect } from "@playwright/test";

const dir=path.dirname(fileURLToPath(import.meta.url));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:900},deviceScaleFactor:1});
const errors=[],network=[],layouts=[],interactions=[];
page.on("pageerror",(error)=>errors.push(error.message));
page.on("request",(request)=>{if(/^https?:/.test(request.url()))network.push(request.url());});
const url=pathToFileURL(path.join(dir,"index.html")).href;
const state=(value)=>page.evaluate((value)=>window.draft.setState(value),value);
async function layout(label) {
 const result=await page.evaluate(()=>{
  const frame=document.querySelector(".try-frame"),modal=document.querySelector("#preview"),box=frame.getBoundingClientRect();
  const overflow=[...document.querySelectorAll(".try-frame,.try-scroll,#result-panel,.try-context,.review-tools")].filter((e)=>e.scrollWidth>e.clientWidth+2).map((e)=>e.id||e.className);
  return {width:innerWidth,height:innerHeight,box:{x:box.x,y:box.y,width:box.width,height:box.height},overflow,modalOpen:modal.open};
 });
 assert.ok(result.modalOpen,label+" is open");
 assert.ok(result.box.x>=-1&&result.box.y>=-1&&result.box.x+result.box.width<=result.width+1&&result.box.y+result.box.height<=result.height+1,label+" fits the window: "+JSON.stringify(result));
 assert.deepEqual(result.overflow,[],label+" has no horizontal overflow");
 layouts.push({label,...result});
}
async function shot(name,value,tab="result") {
 await page.setViewportSize({width:1366,height:900});await state(value);
 if(tab!=="result")await page.locator("#tab-"+tab).click();
 await page.locator("#try-title").click();
 await page.screenshot({path:path.join(dir,"previews",name+".png")});
 if(["desktop-ready","desktop-result"].includes(name))await page.locator("#preview").screenshot({path:path.join(dir,"previews",name.replace("desktop-","preview-")+".png")});
}
try {
 fs.mkdirSync(path.join(dir,"previews"),{recursive:true});
 await page.goto(url+"#ready");await page.evaluate(()=>Promise.all([document.fonts.load("400 16px Literata"),document.fonts.load("600 16px Literata")]));
 assert.equal(await page.evaluate(()=>document.fonts.check("16px Literata")),true);
 for(const viewport of [{width:1366,height:900},{width:1366,height:768},{width:620,height:800},{width:390,height:844}]) {
  await page.setViewportSize(viewport);
  await page.selectOption("#review-agent","starter-prose-polisher");
  for(const value of ["ready","loading","running","result","error","stopped","empty","stale","unsupported","full"]){await state(value);await layout(value+" at "+viewport.width);}
  for(const agent of ["starter-dont-write-for-user","starter-cyoa-choices","starter-lorebook-keeper"]){
   await page.selectOption("#review-agent",agent);await state("result");await layout(agent+" at "+viewport.width);
  }
 }
 await page.setViewportSize({width:1366,height:900});await page.selectOption("#review-agent","starter-prose-polisher");await state("ready");
 await page.locator("#run-test").click();await expect(page.locator("#run-test")).toBeDisabled();await expect(page.locator("#stop-test")).toBeVisible();
 await page.locator("#stop-test").click();await page.waitForTimeout(1350);assert.equal(await page.evaluate(()=>window.draft.state),"stopped");
 interactions.push("Run disables duplicates; Stop suppresses late completion");
 await page.locator("#run-test").click();await page.waitForFunction(()=>window.draft.state==="result");
 await page.locator("#tab-raw").click();const previous=await page.locator("#result-panel").innerText();
 await page.selectOption("#message","5");assert.equal(await page.evaluate(()=>window.draft.state),"stale");
 assert.equal(await page.locator("#result-panel").innerText(),previous);
 await page.locator("#tab-input").click();await expect(page.locator("#result-panel")).toContainText("The silence between them spoke volumes.");
 await page.locator("#run-test").click();await page.waitForFunction(()=>window.draft.state==="result");
 await page.locator("#tab-raw").click();await expect(page.locator("#result-panel")).toContainText("sealed letter");
 interactions.push("Changed context marks result outdated; previous input and output stay attached to their test");
 await state("ready");await page.locator("#run-test").click();await page.keyboard.press("Escape");await expect(page.locator("#preview")).not.toBeVisible();
 assert.equal(await page.evaluate(()=>document.activeElement.id),"open-preview");
 await page.waitForTimeout(1350);await expect(page.locator("#preview")).not.toBeVisible();
 await page.locator("#open-preview").click();await expect(page.locator("#result-tabs")).not.toBeVisible();
 for(let n=0;n<24;n++){await page.keyboard.press("Tab");assert.equal(await page.evaluate(()=>document.querySelector("#preview").contains(document.activeElement)),true);}
 interactions.push("Escape cancels; focus returns to Try it; reopening clears results; keyboard focus stays within native dialog");
 await page.selectOption("#review-agent","starter-dont-write-for-user");await page.locator("#run-test").click();
 assert.equal(await page.evaluate(()=>window.draft.state),"result");await expect(page.locator("#result-panel")).toContainText("Never write User");
 await expect(page.locator("#connection")).toBeDisabled();await expect(page.locator("#tab-reasoning")).toBeHidden();
 interactions.push("Project text agent previews immediately with no model or reasoning tab");
 await page.selectOption("#review-agent","starter-cyoa-choices");await state("result");await expect(page.locator(".preview-list li")).toHaveCount(3);
 await page.selectOption("#review-agent","starter-lorebook-keeper");await state("result");await expect(page.locator(".preview-entry")).toHaveCount(2);
 interactions.push("Choices and lore proposals are readable preview output, without apply/send actions");
 await page.selectOption("#review-agent","starter-prose-polisher");await state("error");await expect(page.getByRole("alert")).toBeVisible();
 await page.locator("#run-test").click();await page.waitForFunction(()=>window.draft.state==="result");
 await page.locator("#tab-result").focus();await page.keyboard.press("ArrowRight");await expect(page.locator("#tab-input")).toBeFocused();
 interactions.push("Error can retry; tabs support arrow-key navigation");
 await page.selectOption("#message","7");await state("result");
 await shot("desktop-ready","ready");
 await shot("desktop-result","result");
 await shot("desktop-input","result","input");
 await shot("desktop-running","running");
 await shot("desktop-error","error");
 await page.setViewportSize({width:620,height:800});await state("full");await page.locator("#try-title").click();await page.screenshot({path:path.join(dir,"previews","narrow-full.png")});
 await page.emulateMedia({reducedMotion:"reduce"});await state("running");
 assert.equal(await page.locator("#status").evaluate((element)=>getComputedStyle(element,"::before").animationName),"none");
 await layout("reduced motion");
 await state("result");
 await page.evaluate(()=>{
  const values=[...document.querySelectorAll("#preview *")].map((e)=>[e,parseFloat(getComputedStyle(e).fontSize)]);
  for(const [element,size]of values)element.style.fontSize=(size*1.5)+"px";
 });
 await layout("150 percent text at 620 px");
 await page.goto(url+"#result");await page.evaluate(()=>document.fonts.ready);
 const colors=await page.evaluate(()=>{
  const background=getComputedStyle(document.querySelector(".try-frame")).backgroundColor;
  return [".try-head h1",".try-head p",".try-context label",".connection-meta small",".try-status",".try-foot",".result-prose"].map((selector)=>({selector,color:getComputedStyle(document.querySelector(selector)).color,background}));
 });
 const rgb=(value)=>value.match(/[\d.]+/g).slice(0,3).map(Number);
 const lum=(value)=>rgb(value).map((x)=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
 const contrasts=colors.map((item)=>{const a=lum(item.color),b=lum(item.background);return {...item,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
 assert.ok(contrasts.every((item)=>item.ratio>=4.5),"Readable foreground contrast");
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
 const report={author:"CODEX",date:"2026-10-30",scope:"Standalone scripted visual draft; no production integration",layouts,interactions,contrasts,minimumContrast:Math.min(...contrasts.map((c)=>c.ratio)),errors,networkRequests:network};
 fs.writeFileSync(path.join(dir,"validation.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({layouts:layouts.length,interactions:interactions.length,minimumContrast:report.minimumContrast,errors,networkRequests:network}));
}finally{await browser.close();}
