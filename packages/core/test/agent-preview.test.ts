// Read-only editor previews use ephemeral definitions and exact selected-message context. CODEX, D-053.
import { describe,expect,it,vi } from "vitest";
import { AgentConfig,type AgentConfigInput } from "@homunculus/schemas";
import { connection,world } from "./helpers.ts";

const definition=(patch:Partial<AgentConfigInput>={})=>AgentConfig.parse({id:"preview",name:"Preview",output:"rewrite",triggers:[{on:"manual"}],...patch});
async function fixture(answer="Preview answer") {
 const w=await world(()=>answer);
 const {session,firstMessage}=await w.chat.createSession({characterIds:["lyra"]});
 return {...w,session,message:firstMessage!};
}
describe("agent editor preview",()=>{
 it("uses the current draft instead of the stored definition, without enabling or saving it",async()=>{
  const w=await fixture();
  await w.store.saveAgentConfig(definition({prompt:"SAVED INSTRUCTIONS"}));
  const saved=await w.store.agentConfigs.get("preview"),defaults=await w.store.getDefaultSetup();
  const out=await w.chat.turns.previewAgent(w.session.id,definition({prompt:"CURRENT EDITOR DRAFT"}),w.message.id,connection);
  expect(out.output).toBe("Preview answer");
  expect(out.prompt?.[0]?.content).toBe("CURRENT EDITOR DRAFT");
  expect(w.ai.prompts).toHaveLength(1);
  expect(await w.store.agentConfigs.get("preview")).toEqual(saved);
  expect(await w.store.getDefaultSetup()).toEqual(defaults);
 });

 const cases=[
  ["inject","injected"],["intercept","rewritten user"],["rewrite","rewritten reply"],["note","a note"],
  ["check",'{"pass":false,"reason":"A mismatch"}'],["choices",'["Look","Wait"]'],
  ["state",'{"mood":"calm"}'],["proposal",'{"entries":[{"title":"Fact","keys":[],"content":"Preview only"}]}'],
 ] as const;
 it.each(cases)("a %s preview performs no domain writes or agent events",async(output,answer)=>{
  const w=await fixture(answer);
  await w.store.saveLorebook({id:"book",name:"Original",entries:[]});
  await w.store.saveStory({id:"story",name:"Story",createdAt:1,openings:["Opening"],setup:{lorebooks:{mode:"add",add:["book"],remove:[]}}});
  const chat=await w.chat.createSession({storyId:"story"});
  const id=chat.firstMessage!.id;
  const config=definition({output,...(output==="state"?{state:{namespace:"scene"}}:{}),...(output==="proposal"?{proposal:{target:"lorebook"}}:{})});
  const snapshot=()=>Promise.all([w.store.getSession(chat.session.id),w.store.getMessage(id),w.store.getStory("story"),w.store.lorebooks.get("book"),
   w.store.getDefaultSetup(),w.store.listAgentRuns(id),w.store.listNotes(id),w.store.listRevisions(id),w.core.state.resolve(chat.session.id,id),w.store.getGenerationRecord(id),w.store.agentConfigs.get(config.id)]);
  const before=await snapshot();
  const writes=[vi.spyOn(w.store,"saveAgentConfig"),vi.spyOn(w.store,"saveStory"),vi.spyOn(w.store,"saveLorebook"),vi.spyOn(w.store,"saveSession"),vi.spyOn(w.store,"addNote"),vi.spyOn(w.store,"addRevision"),vi.spyOn(w.store,"saveAgentRun"),vi.spyOn(w.store,"updateMessageContent"),vi.spyOn(w.core.state,"applyDelta")];
  const events:string[]=[];
  for(const name of ["agent.started","agent.finished","agent.output","message.revised","state.changed","story.loreChanged"] as const)w.core.events.on(name,()=>{events.push(name);});
  const out=await w.chat.turns.previewAgent(chat.session.id,config,id,connection);
  expect(out.error).toBeUndefined();expect(out.output).toBeDefined();
  expect(await snapshot()).toEqual(before);
  for(const write of writes)expect(write).not.toHaveBeenCalled();
  expect(events).toEqual([]);
 });

 it("expands a text agent without calling an AI or requiring a stored agent",async()=>{
  const w=await fixture();
  const out=await w.chat.turns.previewAgent(w.session.id,definition({runMode:"text",output:"inject",prompt:"Leave {{user}} room to answer {{char}}."}),w.message.id,connection);
  expect(out.output).toBe("Leave User room to answer Lyra.");
  expect(out.prompt).toBeUndefined();expect(w.ai.prompts).toEqual([]);
 });

 it("rejects a foreign message before any AI request",async()=>{
  const w=await fixture();
  const other=await w.chat.createSession({characterIds:["lyra"]});
  await expect(w.chat.turns.previewAgent(w.session.id,definition(),other.firstMessage!.id,connection)).rejects.toThrow("does not belong to session");
  expect(w.ai.prompts).toEqual([]);
 });

 it.each(["code","inline"] as const)("rejects %s mode instead of executing arbitrary code or a full turn",async(runMode)=>{
  const w=await fixture();
  await expect(w.chat.turns.previewAgent(w.session.id,definition({runMode}),w.message.id,connection)).rejects.toThrow("cannot be previewed on its own");
  expect(w.ai.prompts).toEqual([]);
 });

 it("refuses tools and missing dependency results without running another agent",async()=>{
  const w=await fixture();
  await expect(w.chat.turns.previewAgent(w.session.id,definition({tools:["anything"]}),w.message.id,connection)).rejects.toThrow("with tools");
  await expect(w.chat.turns.previewAgent(w.session.id,definition({input:{readsAgents:["missing"]}}),w.message.id,connection)).rejects.toThrow("No saved result");
  expect(w.ai.prompts).toEqual([]);
 });

 it("reads the latest saved dependency result without running its definition",async()=>{
  const w=await fixture();
  for(const [id,startedAt,value]of [["older",1,"OLD"],["newer",2,"LATEST"]] as const)await w.store.saveAgentRun({id,sessionId:w.session.id,messageId:w.message.id,agentId:"dependency",trigger:"manual",status:"ok",startedAt,durationMs:0,output:value});
  const out=await w.chat.turns.previewAgent(w.session.id,definition({input:{readsAgents:["dependency"]}}),w.message.id,connection);
  expect(out.prompt?.at(-1)?.content).toContain("LATEST");expect(out.prompt?.at(-1)?.content).not.toContain("OLD");
  expect(w.ai.prompts).toHaveLength(1);
 });

 it("an explicit test ignores timing, keywords and chance and leaves them unchanged",async()=>{
  const w=await fixture();
  const config=definition({triggers:[{on:"everyN",n:99}],conditions:{probability:0,keywords:["not present"],minMessages:99}});
  const before=structuredClone(config);
  expect((await w.chat.turns.previewAgent(w.session.id,config,w.message.id,connection)).output).toBe("Preview answer");
  expect(config).toEqual(before);
 });

 it("resolves the agent connection and allows a test-only override",async()=>{
  const w=await fixture();
  await w.store.setDefaultSetup({agentConnectionId:"helpers"});
  const options={connections:{helpers:{...connection,model:"helper-model"}}};
  expect((await w.chat.turns.previewAgent(w.session.id,definition(),w.message.id,connection,options)).model).toBe("helper-model");
  expect((await w.chat.turns.previewAgent(w.session.id,definition(),w.message.id,connection,{...options,connectionOverride:{...connection,model:"test-only"}})).model).toBe("test-only");
  expect((await w.store.getDefaultSetup()).agentConnectionId).toBe("helpers");
 });

 it("uses the selected reply's speaker and only its history path",async()=>{
  const w=await fixture();
  await w.store.saveCharacter({id:"rowan",name:"Rowan",firstMessages:[]});
  await w.store.saveSession({...w.session,cast:[...w.session.cast,{characterId:"rowan",variantId:null,role:"character",presence:"in_scene",muted:false,joinedAtMessageId:null}]});
  const user=await w.store.addMessage({id:"question",sessionId:w.session.id,parentId:w.message.id,speaker:{kind:"user"},content:"On this branch",createdAt:2,meta:{}});
  const reply=await w.store.addMessage({id:"rowan-reply",sessionId:w.session.id,parentId:user.id,speaker:{kind:"character",characterId:"rowan"},content:"Chosen reply",createdAt:3,meta:{}});
  await w.store.addMessage({id:"other-branch",sessionId:w.session.id,parentId:w.message.id,speaker:{kind:"user"},content:"OTHER BRANCH SECRET",createdAt:4,meta:{}});
  const out=await w.chat.turns.previewAgent(w.session.id,definition({prompt:"Review {{char}}",input:{messages:8}}),reply.id,connection);
  expect(out.prompt?.[0]?.content).toBe("Review Rowan");
  expect(out.prompt?.at(-1)?.content).toContain("On this branch");
  expect(JSON.stringify(out.prompt)).not.toContain("OTHER BRANCH SECRET");
 });

 it("requires a story for lore context, and does not create a book for a story without one",async()=>{
  const w=await fixture('{"entries":[]}');
  const config=definition({output:"proposal",proposal:{target:"lorebook"}});
  await expect(w.chat.turns.previewAgent(w.session.id,config,w.message.id,connection)).rejects.toThrow("inside a story");
  await w.store.saveStory({id:"empty",name:"Empty",createdAt:1,openings:["Start"]});
  const chat=await w.chat.createSession({storyId:"empty"}),before=await w.store.listStories(),books=await w.store.lorebooks.list();
  expect((await w.chat.turns.previewAgent(chat.session.id,config,chat.firstMessage!.id,connection)).error).toBeUndefined();
  expect(await w.store.listStories()).toEqual(before);expect(await w.store.lorebooks.list()).toEqual(books);
 });

 it("returns the actual sent prompt even if the provider fails",async()=>{
  const w=await world(()=>new Error("Provider unavailable"));
  const chat=await w.chat.createSession({characterIds:["lyra"]});
  const out=await w.chat.turns.previewAgent(chat.session.id,definition({prompt:"The tested instruction"}),chat.firstMessage!.id,connection);
  expect(out.error).toContain("Provider unavailable");
  expect(out.prompt?.[0]?.content).toBe("The tested instruction");
  expect(await w.store.listAgentRuns(chat.firstMessage!.id)).toEqual([]);
 });

 it("does not report or apply a result after cancellation",async()=>{
  const ctl=new AbortController();
  const w=await world(()=>{ctl.abort();return "Too late";});
  const chat=await w.chat.createSession({characterIds:["lyra"]});
  const before=await w.store.getMessage(chat.firstMessage!.id);
  const out=await w.chat.turns.previewAgent(chat.session.id,definition(),chat.firstMessage!.id,connection,{signal:ctl.signal});
  expect(out.error).toBe("Stopped");expect(out.output).toBeUndefined();
  expect(await w.store.getMessage(chat.firstMessage!.id)).toEqual(before);
  expect(await w.store.listRevisions(chat.firstMessage!.id)).toEqual([]);
 });
});
