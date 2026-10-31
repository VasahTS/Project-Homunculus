// Try the current editor draft without applying its answer. Approved draft, D-053. CODEX, 2026-10-30.
import { useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore,type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AgentConfig,type Character,type Message,type Session,type SetupLayer,type Story } from "@homunculus/schemas";
import { resolveSetup,type DryRun,type LoreProposal } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import type { ConnectionState } from "../connection.ts";
import type { AgentDraft } from "../agent-draft.ts";
import { AgentView } from "./AgentResults.tsx";
import { Icon } from "./kit.tsx";

type Tab="result"|"input"|"raw"|"reasoning";
interface Preview {
 key:string;
 agent:AgentConfig;
 message:Message;
 result:DryRun;
}
const duration=(ms:number)=>ms<1000?Math.round(ms)+" ms":(ms/1000).toFixed(1)+" s";
const textOf=(value:unknown)=>typeof value==="string"?value:JSON.stringify(value,null,2)??"";
const beforeAgent=(agent:AgentConfig)=>agent.output==="inject"||agent.output==="intercept"
 ||agent.triggers.some((trigger)=>trigger.on==="turn"&&trigger.phase==="before");
const unsupported=(agent:AgentConfig)=>agent.tools.length?"Standalone tests with tools are not supported yet."
 :agent.runMode!=="text"&&agent.runMode!=="separate"?"This mode cannot be previewed on its own. Use a text or separate-call agent.":"";

export function AgentTryIt({ draft,svc,sessions,stories,characters,connection,defaultSetup,initialSessionId,onClose }:{
 draft:AgentDraft;svc:AppServices;sessions:Session[];stories:Story[];characters:Character[];connection:ConnectionState;
 defaultSetup:SetupLayer;initialSessionId:string|null;onClose:()=>void;
}) {
 const {value:agent}=useSyncExternalStore(draft.subscribe,draft.snapshot,draft.snapshot);
 const [sessionId,setSessionId]=useState(()=>sessions.some((s)=>s.id===initialSessionId)?initialSessionId!:sessions[0]?.id??"");
 const [messageId,setMessageId]=useState("");
 const [connectionId,setConnectionId]=useState("");
 const [messages,setMessages]=useState<Message[]>([]);
 const [loading,setLoading]=useState(false);
 const [contextError,setContextError]=useState("");
 const [reload,setReload]=useState(0);
 const [epoch,setEpoch]=useState(0);
 const [busy,setBusy]=useState(false);
 const [feedback,setFeedback]=useState("");
 const [error,setError]=useState("");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [tab,setTab]=useState<Tab>("result");
 const panel=useRef<HTMLDialogElement>(null);
 const controller=useRef<AbortController|null>(null);
 const generation=useRef(0);
 const closeRef=useRef(onClose);closeRef.current=onClose;
 const session=sessions.find((s)=>s.id===sessionId);
 const story=stories.find((s)=>s.id===session?.storyId);
 const setup=useMemo(()=>resolveSetup({default:defaultSetup,story:story?.setup,session:session?.setup}),[defaultSetup,story?.setup,session?.setup]);
 const textMode=agent.runMode==="text";
 const eligible=useMemo(()=>messages.filter((m)=>m.kind!=="event"&&m.speaker.kind!=="system"&&m.visibility.user
  &&(textMode||(beforeAgent(agent)?m.speaker.kind==="user":m.speaker.kind!=="user"))),[messages,agent,textMode]);
 const message=eligible.find((m)=>m.id===messageId);
 const problem=unsupported(agent);
 const key=JSON.stringify([agent,sessionId,message,connectionId,setup,connection.profiles,connection.defaultId,epoch]);
 const stale=!!preview&&preview.key!==key;
 const wanted=setup.agentOverrides[agent.id]?.connectionId??setup.agentConnectionId;
 const mainProfile=connection.byId.get(setup.connectionId??"")??connection.byId.get(connection.defaultId??"")??connection.profiles[0];
 const profile=connectionId?connection.byId.get(connectionId):connection.byId.get(wanted??"")??mainProfile;
 const who=(m:Message)=>{
  const speaker=m.speaker;
  return speaker.kind==="user"?"You":speaker.kind==="character"
   ?characters.find((c)=>c.id===speaker.characterId)?.name??"Character":"Narrator";
 };
 const stop=useCallback(()=>{
  generation.current++;controller.current?.abort();controller.current=null;
  setBusy(false);setFeedback("Stopped");setError("");setPreview(null);
 },[]);
 const close=useCallback(()=>{
  generation.current++;controller.current?.abort();controller.current=null;closeRef.current();
 },[]);

 useEffect(()=>{
  if(!sessions.some((s)=>s.id===sessionId))setSessionId(sessions[0]?.id??"");
 },[sessions,sessionId]);
 useEffect(()=>{
  let off=false;
  setContextError("");setMessages([]);
  if(!session){setLoading(false);return;}
  setLoading(true);
  void svc.store.messagesOf(session.id).then((rows)=>{
   if(!off){setMessages(rows);setLoading(false);}
  },(e)=>{if(!off){setContextError(e instanceof Error?e.message:String(e));setLoading(false);}});
  return()=>{off=true;};
 },[svc,session,reload]);
 useEffect(()=>{
  if(!eligible.some((m)=>m.id===messageId))setMessageId(eligible.at(-1)?.id??"");
 },[eligible,messageId]);
 useEffect(()=>{
  const changed=()=>setEpoch((n)=>n+1);
  const revised=svc.core.events.on("message.revised",(e)=>{if(e.sessionId===sessionId){changed();setReload((n)=>n+1);}});
  const state=svc.core.events.on("state.changed",(e)=>{if(e.sessionId===sessionId)changed();});
  const lore=svc.core.events.on("story.loreChanged",(e)=>{if(e.storyId===story?.id)changed();});
  return()=>{revised();state();lore();};
 },[svc,sessionId,story?.id]);
 useEffect(()=>{
  if(controller.current){
   generation.current++;controller.current.abort();controller.current=null;
   setBusy(false);setFeedback("Stopped because the draft or context changed");
  }
 },[key]);
 useEffect(()=>{
  const dialog=panel.current,previous=document.activeElement;
  dialog?.showModal();
  return()=>{
   generation.current++;controller.current?.abort();controller.current=null;dialog?.close();
   if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();
  };
 },[]);

 const run=async()=>{
  if(controller.current||loading||problem)return;
  if(contextError){setReload((n)=>n+1);return;}
  if(!session||!message)return;
  const parsed=AgentConfig.safeParse(draft.snapshot().value);
  if(!parsed.success){setError(!agent.name.trim()?"Give this agent a name before testing.":"Review the agent settings before testing.");return;}
  const config=parsed.data,requestKey=key,target=structuredClone(message),ctl=new AbortController(),id=++generation.current;
  controller.current=ctl;setBusy(true);setError("");setPreview(null);setTab("result");setFeedback("Running this test...");
  try {
   const req=connection.forRequest();
   const override=connectionId?req.connections[connectionId]:undefined;
   if(connectionId&&!override)throw new Error("This connection is no longer available. Choose another connection.");
   const result=await svc.chat.turns.previewAgent(session.id,config,target.id,req.connection,{
    connections:req.connections,connectionOverride:override,signal:ctl.signal,
   });
   if(id!==generation.current||ctl.signal.aborted)return;
   setPreview({key:requestKey,agent:config,message:target,result});
   setError(result.error??"");setFeedback(result.error?"Test failed":"Test complete");
  }catch(e){
   if(id===generation.current&&!ctl.signal.aborted){setError(e instanceof Error?e.message:String(e));setFeedback("Test failed");}
  }finally{
   if(id===generation.current){controller.current=null;setBusy(false);}
  }
 };
 const focusCycle=(event:ReactKeyboardEvent<HTMLDialogElement>)=>{
  if(event.key!=="Tab")return;
  const items=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter((e)=>e.getClientRects().length&&!e.closest("[hidden]"));
  if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1)?.focus();}
  else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}
 };
 const tabs:Array<{id:Tab;label:string}>=[{id:"result",label:"Result"},{id:"input",label:"What it read"},{id:"raw",label:"Raw answer"},
  ...(preview?.result.reasoning?[{id:"reasoning" as const,label:"Reasoning"}]:[])];
 const selectedTab=tabs.some((t)=>t.id===tab)?tab:"result";
 const hasDetails=!!preview&&(preview.result.output!==undefined||!!preview.result.prompt?.length||preview.result.raw!==undefined);
 const label=loading?"Loading messages...":busy?"Running this test...":stale?"Preview is outdated":contextError?"Context unavailable":problem?"Standalone preview unavailable"
  :error?"Test failed":feedback||(!session?"No chat available":!message?"No suitable message":"Ready to run");
 const empty=!session?"Open or create a chat, then select a message for this agent to read."
  :!message?(beforeAgent(agent)&&!textMode?"This chat has no user message to test yet. Send a message in the chat first.":"This chat has no reply to test yet."):"Run this draft on the selected message. Automatic timing and chance do not affect this test.";
 const result=preview?.result;
 const meta=preview?(preview.agent.runMode==="text"?"No AI call":[result?.model,duration(result!.durationMs),result?.tokensIn!==undefined?result.tokensIn+" in":null,result?.tokensOut!==undefined?result.tokensOut+" out":null].filter(Boolean).join(" · ")):"";

 return createPortal(
  <dialog ref={panel} className="agent-try" aria-labelledby="agent-try-title" aria-describedby="agent-try-description" data-testid="agent-try-it"
   onCancel={(e)=>{e.preventDefault();close();}} onClick={(e)=>{if(e.target===e.currentTarget)close();}} onKeyDown={focusCycle}>
   <section className="try-frame">
    <header className="try-head"><div><h2 id="agent-try-title">Try {agent.name||"agent"}</h2><p id="agent-try-description">Preview this draft on a message. The result stays here.</p></div>
     <button type="button" className="icon-btn close-preview" aria-label="Close preview" onClick={close}><Icon name="close" size={17}/></button></header>
    <div className="try-scroll">
     <section className="try-context" aria-label="Test context">
      <div className="context-grid">
       <label><span>Chat</span><select aria-label="Chat" value={sessionId} disabled={busy||!sessions.length} onChange={(e)=>setSessionId(e.target.value)}>
        {!sessions.length&&<option value="">No chats available</option>}
        {sessions.map((s)=><option key={s.id} value={s.id}>{stories.find((st)=>st.id===s.storyId)?.name?stories.find((st)=>st.id===s.storyId)!.name+" · ":""}{s.title}</option>)}
       </select></label>
       <label><span>Message</span><select aria-label="Message" value={messageId} disabled={busy||loading||!eligible.length} onChange={(e)=>setMessageId(e.target.value)}>
        {!eligible.length&&<option value="">{loading?"Loading messages...":"No suitable message"}</option>}
        {eligible.map((m,i)=><option key={m.id} value={m.id}>{who(m)} · {m.speaker.kind==="user"?"Message":"Reply"} {i+1} — {m.content.replace(/\s+/g," ").slice(0,56)}</option>)}
       </select></label>
      </div>
      {message&&<details key={message.id} className="selected-message"><summary><span className="message-snippet">{message.content.replace(/\s+/g," ")}</span><span className="show-message">View message</span></summary>
       <div className="message-text">{message.content}</div><p className="hint">This message defines the history path. Your chat stays where it is.</p></details>}
      <div className="connection-grid"><label><span>Connection</span><select aria-label="Connection" value={connectionId} disabled={busy||loading||textMode} onChange={(e)=>setConnectionId(e.target.value)}>
       <option value="">Agent's connection</option>{connection.profiles.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label><div className="connection-meta"><span>{textMode?"Text mode · no model":profile?.model||profile?.name||"Uses the agent's resolved connection"}</span>
       <small>{textMode?"No AI call. Expands this agent's text.":"A model request may incur cost."}</small></div></div>
     </section>
     <div className="try-action"><button type="button" className="btn btn-prominent" data-testid="agent-try-run"
      disabled={busy||loading||!!problem||!session||(!message&&!contextError)} onClick={()=>void run()}>
       <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><path d="m4 2 8 5-8 5z"/></svg>
       {busy?"Running...":(error||contextError)&&!stale?"Try again":preview?"Run again":"Run test"}</button>
      {busy&&<button type="button" className="btn btn-bordered" onClick={stop}>Stop</button>}
      <span className={"try-status"+(busy||loading?" running":"")} role="status" aria-live="polite" aria-atomic="true">{label}</span>
     </div>
     {(error||contextError||problem||stale)&&<div className="state-notice" data-kind={error||contextError?"error":"notice"} role={error||contextError?"alert":"note"}>
      {error||contextError||problem||(stale?"The context or agent draft changed after this test. Run again to preview the current draft.":"")}
     </div>}
     <section className="try-result" aria-label="Test preview">
      {hasDetails&&<div className="try-tabs" role="tablist" aria-label="Preview details" onKeyDown={(e)=>{
       if(!["ArrowRight","ArrowLeft","Home","End"].includes(e.key))return;e.preventDefault();
       const i=tabs.findIndex((t)=>t.id===selectedTab),next=e.key==="Home"?0:e.key==="End"?tabs.length-1:(i+(e.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
       setTab(tabs[next]!.id);e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>{tabs.map((t)=><button key={t.id} type="button" role="tab" id={"agent-try-tab-"+t.id} aria-controls="agent-try-panel" aria-selected={selectedTab===t.id}
       tabIndex={selectedTab===t.id?0:-1} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div>}
      <div id="agent-try-panel" className="try-panel" role={hasDetails?"tabpanel":undefined} aria-labelledby={hasDetails?"agent-try-tab-"+selectedTab:undefined} tabIndex={hasDetails?0:undefined}>
       {hasDetails&&preview?selectedTab==="input"?<PreviewInput preview={preview}/>:selectedTab==="raw"?<pre className="try-raw run-mono">{preview.result.raw??textOf(preview.result.output)}</pre>
        :selectedTab==="reasoning"?<pre className="try-raw run-mono">{preview.result.reasoning}</pre>:preview.result.output!==undefined?<PreviewOutput agent={preview.agent} output={preview.result.output}/>
        :<p className="ready-copy"><b>The test could not finish</b>Inspect what it read or the raw answer, then try again.</p>
        :<p className="ready-copy"><b>{busy?"Running the agent":loading?"Loading this chat":error||contextError?"The test could not finish":problem?"Standalone preview unavailable":feedback==="Stopped"?"Test stopped":"Ready to try"}</b>
         {busy?"The preview will appear here. You can stop the test at any time.":error||contextError?"Your draft and selected context are still available for retry.":feedback==="Stopped"?"No result was applied. You can run this draft again.":problem||empty}</p>}
      </div>
     </section>
    </div>
    <footer className="try-foot"><span>{textMode?"Preview only · No AI call or story changes.":"Preview only · Your chat and story stay unchanged."}</span><span className="try-meta">{meta}</span></footer>
   </section>
  </dialog>,document.body);
}

function PreviewInput({preview}:{preview:Preview}) {
 if(preview.result.prompt?.length)return <>{preview.result.prompt.map((part,i)=><section key={i}><h3 className="read-title">{part.role==="system"?"System instruction":part.role==="user"?"User context":part.role}</h3><div className="read-text">{part.content||"(empty)"}</div></section>)}</>;
 return <><h3 className="read-title">Agent text</h3><div className="read-text">{preview.agent.prompt}</div><p className="hint">No model request was sent. Macros use the selected message and chat context; the expanded text is in Result.</p></>;
}
function PreviewOutput({agent,output}:{agent:AgentConfig;output:unknown}) {
 const label=agent.runMode==="text"?"Text after macro expansion":agent.output==="proposal"?"Proposed change · preview only":agent.output==="choices"?"Suggested choices · preview only":agent.output==="rewrite"?"Rewritten reply · preview only":agent.output==="check"?"Check result · preview only":"Agent result · preview only";
 let body;
 if(agent.output==="choices"&&Array.isArray(output))body=<ol className="preview-list">{output.map((text,i)=><li key={i}>{String(text)}</li>)}</ol>;
 else if(agent.output==="proposal"&&agent.proposal?.target==="lorebook")body=<>{(output as LoreProposal).entries.length?(output as LoreProposal).entries.map((entry,i)=><article className="preview-entry" key={i}><h3>{entry.title}</h3><p>{entry.content}</p></article>):<p className="read-text">No new entries proposed.</p>}</>;
 else if(agent.output==="check"){const check=output as {pass:boolean;reason?:string};body=<div className="read-text"><strong>{check.pass?"Check passed":"Check failed"}</strong>{check.reason&&<p>{check.reason}</p>}</div>;}
 else if(agent.output==="note"&&agent.display?.note==="view"&&typeof output==="string")body=<AgentView name={agent.name} kind={agent.display.view??"feed"} text={output}/>;
 else if(typeof output==="string")body=<div className="result-prose">{output?output.split(/\n\n+/).map((paragraph,i)=><p key={i}>{paragraph}</p>):<p>No text after expansion.</p>}</div>;
 else body=<pre className="try-raw run-mono">{textOf(output)}</pre>;
 return <><p className="result-label">{label}</p>{body}</>;
}
