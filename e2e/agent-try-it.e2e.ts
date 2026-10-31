// Approved Try it integration; isolated browser fixtures, never private data. CODEX, D-053.
import { expect,test,type Page } from "@playwright/test";
import { openLibrary,send } from "./ui.ts";
import path from "node:path";

type Probe={calls:number;fail:boolean;answer:string|null;delay:number;reasoning:string|undefined};
async function instrument(page:Page){
 await page.evaluate(async()=>{
  const source="/src/core-instance.ts",svc=await (await import(source)).servicesReady;
  const probe={calls:0,fail:false,answer:null,delay:0,reasoning:undefined};
  (globalThis as typeof globalThis & {tryProbe:Probe}).tryProbe=probe;
  const complete=svc.core.connections.complete.bind(svc.core.connections);
  svc.core.connections.complete=async(...args:unknown[])=>{
   probe.calls++;if(probe.delay)await new Promise(r=>setTimeout(r,probe.delay));
   if(probe.fail)throw new Error("Simulated provider unavailable");
   if(probe.answer!==null)return {text:probe.answer,model:"fixture-model",tokensIn:120,tokensOut:42,reasoning:probe.reasoning};
   return complete(...args);
  };
 });
}
async function control(page:Page,patch:Partial<Probe>){
 await page.evaluate(patch=>Object.assign((globalThis as typeof globalThis & {tryProbe:Probe}).tryProbe,patch),patch);
}
const count=(page:Page)=>page.evaluate(()=>(globalThis as typeof globalThis & {tryProbe:Probe}).tryProbe.calls);
async function snapshot(page:Page){
 return page.evaluate(async()=>{
  const source="/src/core-instance.ts",{store,core}=await (await import(source)).servicesReady;
  const sessions=await store.listSessions();
  const data=await Promise.all(sessions.map(async(s:{id:string})=>{
   const messages=await store.messagesOf(s.id);
   return {s,messages,details:await Promise.all(messages.map(async(m:{id:string})=>[
    await store.listAgentRuns(m.id),await store.listNotes(m.id),await store.listRevisions(m.id),await store.getGenerationRecord(m.id),await core.state.resolve(s.id,m.id)]))};
  }));
  return JSON.stringify([data,await store.getDefaultSetup(),await store.listStories(),await store.lorebooks.list()]);
 });
}
async function editor(page:Page,name="Prose Polisher"){
 await openLibrary(page,"Agents");
 await page.getByTestId("agent-row").filter({hasText:name}).click();
 return page.getByTestId("agent-editor");
}
const modal=(page:Page)=>page.getByTestId("agent-try-it");
async function openPreview(page:Page,name="Prose Polisher"){
 const ed=await editor(page,name);await ed.getByRole("button",{name:"Try it",exact:true}).click();
 await expect(modal(page).getByTestId("agent-try-run")).toBeEnabled();return modal(page);
}

test("opening is free; a failed autosave still previews the exact current draft without applying anything",async({page})=>{
 await page.goto("/");await instrument(page);const ed=await editor(page);
 await page.evaluate(async()=>{
  const source="/src/core-instance.ts",{store}=await (await import(source)).servicesReady;
  store.saveAgentConfig=async()=>{throw new Error("Simulated draft save failure");};
 });
 await ed.getByLabel("Agent instructions").fill("CURRENT UNSAVED INSTRUCTIONS: preserve the gate.");
 await expect(ed.getByTestId("agent-save-state")).toHaveText("Not saved");
 const before=await snapshot(page);
 await ed.getByRole("button",{name:"Try it",exact:true}).click();const dialog=modal(page);
 await expect(dialog.getByTestId("agent-try-run")).toBeEnabled();expect(await count(page)).toBe(0);
 await dialog.getByRole("button",{name:"Run test",exact:true}).click();
 await expect(dialog.getByRole("status")).toHaveText("Test complete");expect(await count(page)).toBe(1);
 await expect(dialog.getByRole("tabpanel")).toContainText("Offline test AI");
 await expect(dialog.getByRole("tab",{name:"Reasoning",exact:true})).toHaveCount(0);
 await dialog.getByRole("tab",{name:"What it read",exact:true}).click();
 await expect(dialog.getByRole("tabpanel")).toContainText("CURRENT UNSAVED INSTRUCTIONS");
 await dialog.getByRole("tab",{name:"Raw answer",exact:true}).click();
 await expect(dialog.getByRole("tabpanel")).toContainText("Offline test AI");
 expect(await snapshot(page)).toBe(before);
 await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
 await expect(ed.getByRole("button",{name:"Try it",exact:true})).toBeFocused();
 await expect(ed.getByLabel("Agent instructions")).toHaveValue("CURRENT UNSAVED INSTRUCTIONS: preserve the gate.");
});

test("Stop and Escape discard late answers, keep focus inside, and reopen a fresh preview",async({page})=>{
 await page.goto("/");await instrument(page);await control(page,{answer:"LATE ANSWER",delay:800});
 const dialog=await openPreview(page);const before=await snapshot(page);
 await dialog.getByRole("button",{name:"Close preview",exact:true}).focus();
 await page.keyboard.press("Shift+Tab");await expect(dialog.getByTestId("agent-try-run")).toBeFocused();
 await page.keyboard.press("Tab");await expect(dialog.getByRole("button",{name:"Close preview",exact:true})).toBeFocused();
 await dialog.getByTestId("agent-try-run").dblclick();await expect(dialog.getByRole("button",{name:"Stop",exact:true})).toBeVisible();
 await dialog.getByRole("button",{name:"Stop",exact:true}).click();await expect(dialog.getByRole("status")).toHaveText("Stopped");
 await page.waitForTimeout(950);expect(await count(page)).toBe(1);await expect(dialog).not.toContainText("LATE ANSWER");
 await dialog.getByTestId("agent-try-run").click();await expect.poll(()=>count(page)).toBe(2);
 await page.keyboard.press("Escape");await page.waitForTimeout(950);await expect(dialog).toHaveCount(0);
 await page.getByTestId("agent-editor").getByRole("button",{name:"Try it",exact:true}).click();
 await expect(dialog).not.toContainText("LATE ANSWER");await expect(dialog.getByRole("tab")).toHaveCount(0);
 expect(await snapshot(page)).toBe(before);
});

test("choices are inert; changing the selected history marks the captured result and input outdated",async({page})=>{
 await page.goto("/");await send(page,"FIRST CONTEXT");await send(page,"SECOND CONTEXT");await instrument(page);
 const dialog=await openPreview(page,"CYOA Choices");const before=await snapshot(page);
 await dialog.getByTestId("agent-try-run").click();await expect(dialog.getByRole("status")).toHaveText("Test complete");
 await expect(dialog.locator(".preview-list li")).toHaveCount(2);
 await expect(dialog.getByRole("button",{name:"Look around",exact:true})).toHaveCount(0);
 await dialog.getByRole("tab",{name:"What it read",exact:true}).click();
 const input=await dialog.getByRole("tabpanel").textContent();
 await dialog.getByLabel("Message",{exact:true}).selectOption({index:0});
 await expect(dialog.getByRole("status")).toHaveText("Preview is outdated");
 expect(await dialog.getByRole("tabpanel").textContent()).toBe(input);
 expect(await snapshot(page)).toBe(before);
 await dialog.getByTestId("agent-try-run").click();await expect(dialog.getByRole("status")).toHaveText("Test complete");
 expect(await count(page)).toBe(2);
});

test("text agents expand macros without a model request or saved agent requirement",async({page})=>{
 await page.goto("/");await instrument(page);await openLibrary(page,"Agents");
 await page.getByRole("button",{name:"New Agent",exact:true}).click();const ed=page.getByTestId("agent-editor");
 await ed.getByLabel("Agent instructions").fill("Leave {{user}} room to answer {{char}}.");
 await ed.getByRole("button",{name:"Try it",exact:true}).click();const dialog=modal(page);
 await expect(dialog.getByTestId("agent-try-run")).toBeEnabled();
 await expect(dialog.getByLabel("Connection",{exact:true})).toBeDisabled();
 await dialog.getByTestId("agent-try-run").click();await expect(dialog.getByRole("status")).toHaveText("Test complete");
 await expect(dialog.getByRole("tabpanel")).toContainText("Leave User room to answer Lyra.");
 expect(await count(page)).toBe(0);await expect(dialog).toContainText("No AI call");
});

test("provider errors and malformed answers keep exact inputs/raw text available and allow retry",async({page})=>{
 await page.goto("/");await instrument(page);await control(page,{fail:true});
 const dialog=await openPreview(page,"CYOA Choices");
 await dialog.getByTestId("agent-try-run").click();await expect(dialog.getByRole("alert")).toHaveText("Simulated provider unavailable");
 await dialog.getByRole("tab",{name:"What it read",exact:true}).click();await expect(dialog.getByRole("tabpanel")).toContainText("Answer with ONLY");
 await control(page,{fail:false,answer:"<script>globalThis.executed=true</script>"});
 await dialog.getByRole("button",{name:"Try again",exact:true}).click();await expect(dialog.getByRole("status")).toHaveText("Test failed");
 await dialog.getByRole("tab",{name:"Raw answer",exact:true}).click();
 await expect(dialog.getByRole("tabpanel")).toHaveText("<script>globalThis.executed=true</script>");
 expect(await page.evaluate(()=>(globalThis as typeof globalThis & {executed?:boolean}).executed)).toBeUndefined();
 await control(page,{answer:'["Wait safely"]',reasoning:"Reported fixture reasoning"});
 await dialog.getByRole("button",{name:"Try again",exact:true}).click();await expect(dialog.getByRole("status")).toHaveText("Test complete");
 await dialog.getByRole("tab",{name:"Reasoning",exact:true}).click();await expect(dialog.getByRole("tabpanel")).toHaveText("Reported fixture reasoning");
 await expect(dialog.locator(".try-meta")).toContainText("fixture-model");await expect(dialog.locator(".try-meta")).toContainText("120 in");
});

test("unsupported standalone modes explain why Run is disabled",async({page})=>{
 await page.goto("/");
 await page.evaluate(async()=>{
  const source="/src/agent-draft.ts",{AgentDraft}=await import(source);
  const update=AgentDraft.prototype.update;
  AgentDraft.prototype.update=function(value:Record<string,unknown>){return update.call(this,{...value,runMode:"inline"});};
 });
 await instrument(page);const ed=await editor(page);await ed.getByLabel("Agent instructions").fill("Unsupported imported mode");await ed.getByRole("button",{name:"Try it",exact:true}).click();
 const dialog=modal(page);await expect(dialog.getByTestId("agent-try-run")).toBeDisabled();
 await expect(dialog).toContainText("This mode cannot be previewed on its own.");expect(await count(page)).toBe(0);
});

for(const width of [1366,620,390])test("approved layout remains usable at "+width+" px",async({page})=>{
 await page.setViewportSize({width,height:width===1366?900:844});await page.goto("/");await instrument(page);
 await control(page,{answer:'Lyra lowered the bow a fraction. "Then keep your voice down. The mill has ears."\n\n'+("The lantern flickered against the weathered gate. ".repeat(30))});
 const dialog=await openPreview(page);
 const output=path.resolve("docs/drafts/agent-try-it/integration");
 await page.screenshot({path:path.join(output,"actual-"+width+"-ready.png")});
 await dialog.getByTestId("agent-try-run").click();await expect(dialog.getByRole("status")).toHaveText("Test complete");
 await page.screenshot({path:path.join(output,"actual-"+width+"-result.png")});
 const geometry=await dialog.evaluate(node=>{
  const box=node.getBoundingClientRect(),scroll=node.querySelector(".try-scroll")!;
  return {left:box.left,right:box.right,width:innerWidth,overflow:scroll.scrollWidth-scroll.clientWidth,footer:node.querySelector(".try-foot")!.getBoundingClientRect().bottom,bottom:innerHeight};
 });
 expect(geometry.left).toBeGreaterThanOrEqual(0);expect(geometry.right).toBeLessThanOrEqual(geometry.width);
 expect(geometry.overflow).toBeLessThanOrEqual(1);expect(geometry.footer).toBeLessThanOrEqual(geometry.bottom);
 await dialog.getByRole("tab",{name:"Raw answer",exact:true}).click();await page.keyboard.press("Escape");await expect(dialog).toHaveCount(0);
});

test("a context-read failure retries without a model call; an empty before-turn context explains what is missing",async({page})=>{
 await page.goto("/");await instrument(page);
 await page.evaluate(async()=>{
  const source="/src/core-instance.ts",{store}=await (await import(source)).servicesReady;
  const read=store.messagesOf.bind(store);
  (globalThis as typeof globalThis & {tryContextFail:boolean}).tryContextFail=true;
  store.messagesOf=async(id:string)=>{if((globalThis as typeof globalThis & {tryContextFail:boolean}).tryContextFail)throw new Error("Simulated context load failure");return read(id);};
 });
 const ed=await editor(page);await ed.getByRole("button",{name:"Try it",exact:true}).click();const dialog=modal(page);
 await expect(dialog.getByRole("alert")).toHaveText("Simulated context load failure");
 await page.evaluate(()=>{(globalThis as typeof globalThis & {tryContextFail:boolean}).tryContextFail=false;});
 await dialog.getByRole("button",{name:"Try again",exact:true}).click();
 await expect(dialog.getByRole("status")).toHaveText("Ready to run");expect(await count(page)).toBe(0);
 await page.keyboard.press("Escape");await ed.getByRole("button",{name:"Close",exact:true}).click();
 await page.getByRole("button",{name:"New Agent",exact:true}).click();
 await ed.getByRole("radio",{name:"Written by an AI",exact:true}).click();
 await ed.getByRole("button",{name:"Try it",exact:true}).click();
 await expect(dialog.getByTestId("agent-try-run")).toBeDisabled();
 await expect(dialog).toContainText("This chat has no user message to test yet.");
 expect(await count(page)).toBe(0);
});

test("large structured answers and eight cast cards stay readable with long names and 150 percent text",async({page})=>{
 await page.setViewportSize({width:620,height:844});await page.emulateMedia({reducedMotion:"reduce"});await page.goto("/");await instrument(page);
 await page.evaluate(async()=>{
  const source="/src/core-instance.ts",{store}=await (await import(source)).servicesReady;
  const session=(await store.listSessions())[0],cast=[...session.cast];
  for(let i=0;i<8;i++){
   const character=await store.saveCharacter({id:"fixture-cast-"+i,name:"Fixture cast member "+i,description:"A project test cast member. ".repeat(30)});
   cast.push({characterId:character.id,role:"character",presence:"in_scene",muted:false});
  }
  await store.saveSession({...session,cast});
 });
 await control(page,{answer:JSON.stringify(Array.from({length:25},(_,i)=>"Choice "+i+" "+("long_content_without_spaces_".repeat(15))))});
 const ed=await editor(page,"CYOA Choices");await ed.getByLabel("Agent name").fill("Long agent name "+("without_spaces_".repeat(14)));
 await ed.getByRole("button",{name:"Try it",exact:true}).click();const dialog=modal(page);
 await dialog.evaluate(node=>{const sizes=[node,...node.querySelectorAll<HTMLElement>("*")].map(el=>[el,parseFloat(getComputedStyle(el).fontSize)*1.5] as const);for(const [el,size] of sizes)(el as HTMLElement).style.fontSize=size+"px";});
 await expect(dialog.getByTestId("agent-try-run")).toBeEnabled();await dialog.getByTestId("agent-try-run").click();
 await expect(dialog.getByRole("status")).toHaveText("Test complete");await expect(dialog.locator(".preview-list li")).toHaveCount(25);
 await dialog.getByRole("tab",{name:"What it read",exact:true}).click();
 for(let i=0;i<8;i++)await expect(dialog.getByRole("tabpanel")).toContainText("Fixture cast member "+i);
 const overflow=await dialog.locator(".try-scroll").evaluate(node=>node.scrollWidth-node.clientWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 await page.screenshot({path:path.resolve("docs/drafts/agent-try-it/integration/actual-full-620.png")});
});

test("a slow previous chat cannot replace the selected context; leaving the editor aborts the test",async({page})=>{
 await page.goto("/");
 const {newChatWith}=await import("./ui.ts");await newChatWith(page);
 await instrument(page);const ed=await editor(page);
 await page.evaluate(async()=>{
  const source="/src/core-instance.ts",{store}=await (await import(source)).servicesReady;
  const slow=(await store.listSessions())[0].id,read=store.messagesOf.bind(store);
  store.messagesOf=async(id:string)=>{const rows=await read(id);if(id===slow)await new Promise(r=>setTimeout(r,700));return rows;};
 });
 await ed.getByRole("button",{name:"Try it",exact:true}).click();const dialog=modal(page);
 const chat=dialog.getByLabel("Chat",{exact:true}),ids=await chat.locator("option").evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value));
 await chat.selectOption(ids[0]!);await chat.selectOption(ids[1]!);
 await expect(dialog.getByTestId("agent-try-run")).toBeEnabled();
 const selected=await dialog.getByLabel("Message",{exact:true}).inputValue();
 await page.waitForTimeout(850);await expect(dialog.getByLabel("Message",{exact:true})).toHaveValue(selected);
 await control(page,{answer:"Late navigation result",delay:750});
 await dialog.getByTestId("agent-try-run").click();await expect.poll(()=>count(page)).toBe(1);
 await page.getByTestId("place-list").getByRole("button",{name:"Characters",exact:true}).evaluate(node=>(node as HTMLElement).click());
 await expect(dialog).toHaveCount(0);await page.waitForTimeout(850);
 const reopened=await openPreview(page);await expect(reopened.getByRole("tab")).toHaveCount(0);
 await expect(reopened).not.toContainText("Late navigation result");
});
