// Scripted review interactions. No network, database or model access. CODEX, 2026-10-30.
const $ = (id) => document.getElementById(id);
const modal = $("preview");
const sample = {
 "7": {
  before:"With practiced ease, Lyra slung her bow over her shoulder and crouched beside the old mill door. In the lantern light, a fresh notch shone against the rusty chain.\n\n“Someone has been here since the rain,” she said, her voice low. “Hold the lantern higher.”\n\nShe pressed her thumb against the split link, then glanced toward the dark window above them. The silence between them spoke volumes.",
  after:"Lyra slung her bow over her shoulder and crouched beside the mill door. A fresh notch shone against the rusty chain in the lantern light.\n\n“Someone has been here since the rain,” she said quietly. “Hold the lantern higher.”\n\nShe pressed her thumb against the split link, then glanced toward the dark window above them."
 },
 "5": {
  before:"Lyra took the sealed letter with a steady hand. Her eyes narrowed as she recognized the wax impression. “That seal belongs to the mill keeper,” she said. “Where did you find it?”",
  after:"Lyra took the sealed letter. Her eyes narrowed at the wax impression. “That seal belongs to the mill keeper,” she said. “Where did you find it?”"
 },
 "3": {
  before:'*Lyra steps out of the shadow of the mill gate, an arrow already nocked.* "That\'s close enough. Who sent you?"',
  after:'*Lyra steps out of the shadow of the mill gate, an arrow already nocked.* "That\'s close enough. Who sent you?"'
 }
};
const cast = ["Lyra — a wary ranger, with silver hair, a weathered green cloak and a longbow.","Rowan — the courier carrying the sealed letter.","Sera — the keeper of the mill, missing since the rain.","Tamsin — a healer following the northern road.","Marek — the watchman at the river crossing.","Nessa — an apprentice who recognized the seal.","Oren — a ferryman sheltering beneath the bridge.","Ilya — the archivist waiting beyond the old mill."];
let agent=AGENTS.find((a)=>a.id==="starter-prose-polisher"),state="ready",tab="result",timer,generation=0,snapshot=null;
const states=["ready","loading","running","result","error","stopped","empty","stale","unsupported","full"];
const esc=(value)=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const prose=(text)=>'<div class="result-prose">'+text.split("\n\n").map((p)=>"<p>"+esc(p)+"</p>").join("")+"</div>";
const complete=()=>["result","stale","full"].includes(state);
const currentMessage=()=>sample[$("message").value]||sample["7"];
for(const item of AGENTS)$("review-agent").add(new Option(item.name,item.id));
function answer(a,message) {
 if(a.runMode==="text")return a.prompt.replaceAll("{{user}}","User").replaceAll("{{char}}","Lyra");
 if(a.output==="proposal")return {entries:[{title:"The mill's broken chain",keys:["mill","chain"],content:"A fresh notch in the mill door's chain suggests someone entered after the rain."},{title:"The upper window",keys:["mill","window"],content:"A dark window overlooks the mill entrance."}]};
 if(a.output==="choices")return ["Lift the lantern toward the upper window.","Ask Lyra what could have cut the chain.","Examine the ground for fresh tracks."];
 return message.after;
}
function capture() {
 const a={...agent},message={...currentMessage()};
 return {agent:a,message,answer:answer(a,message),model:$("connection").value==="alternate"?"Alternate example model":"Example model",
  chat:$("chat").selectedOptions[0].text,messageLabel:$("message").selectedOptions[0].text};
}
function renderPanel() {
 $("result-tabs").hidden=!complete();
 $("tab-reasoning").hidden=agent.runMode==="text";
 const panel=$("result-panel");
 panel.setAttribute("aria-labelledby","tab-"+tab);
 document.querySelectorAll("[data-tab]").forEach((button)=>{const on=button.dataset.tab===tab;button.setAttribute("aria-selected",String(on));button.tabIndex=on?0:-1;});
 if(!complete()) {
  const copy={
   ready:["Ready to try","Run this draft on the selected reply. Automatic timing and chance do not affect this test."],
   loading:["Loading this chat","The message list will be available when the context is ready."],
   running:["Running the agent","The preview will appear here. You can stop the test at any time."],
   error:["The test could not finish","Your instructions and chosen message are still available. Try again when the connection is ready."],
   stopped:["Test stopped","No result was applied. You can run this draft again on the same message."],
   empty:["Choose a conversation first","Open or create a chat, then select a message for this agent to read."],
   unsupported:["This mode cannot be previewed on its own","Choose a supported agent mode. This preview will not start a full conversation turn."]
  }[state]||["Ready to try","Run this draft on the selected reply."];
  panel.innerHTML='<p class="ready-copy"><b>'+esc(copy[0])+"</b>"+esc(copy[1])+"</p>";
  return;
 }
 const s=snapshot,a=s.agent;
 if(tab==="input") {
  const contextual=a.runMode==="text"?"Macro names: User and Lyra. No message transcript or AI request.":
   state==="full"?cast.join("\n\n"):a.messages+" earlier messages configured"+(a.messages?" · Lyra's card":" · no cast or Scene data");
  panel.innerHTML='<h2 class="read-title">Agent instructions</h2><div class="read-text">'+esc(a.prompt.replaceAll("{{char}}","Lyra").replaceAll("{{user}}","User"))+"</div>"+
   (a.runMode==="text"?"":'<h2 class="read-title">Selected reply · '+esc(s.messageLabel)+'</h2><div class="read-text">'+esc(s.message.before)+"</div>")+
   '<h2 class="read-title">Context</h2><div class="read-text">'+esc(contextual)+"</div>";
 } else if(tab==="raw") panel.innerHTML='<pre class="raw-text">'+esc(typeof s.answer==="string"?s.answer:JSON.stringify(s.answer,null,2))+"</pre>";
 else if(tab==="reasoning") panel.innerHTML='<div class="read-text">Example explanation: preserve the events and dialogue while following this agent’s instructions. This is scripted review text, not model reasoning from a real request.</div>';
 else {
  const label=a.runMode==="text"?"Text after macro expansion":a.output==="proposal"?"Proposed entries · preview only":a.output==="choices"?"Suggested choices · preview only":"Rewritten reply · preview only";
  let body;
  if(a.output==="proposal")body=s.answer.entries.map((e)=>'<article class="preview-entry"><h3>'+esc(e.title)+"</h3><p>"+esc(e.content)+"</p></article>").join("");
  else if(a.output==="choices")body='<ol class="preview-list">'+s.answer.map((text)=>"<li>"+esc(text)+"</li>").join("")+"</ol>";
  else body=prose(s.answer);
  if(state==="full")body=prose(sample["7"].after+"\n\n"+cast.join("\n\n")+"\n\n"+sample["7"].after);
  panel.innerHTML='<p class="result-label">'+label+"</p>"+body;
 }
}
function render() {
 const full=state==="full",text=agent.runMode==="text";
 $("try-title").textContent="Try "+(full?agent.name+" · long-form review for the old mill campaign":agent.name);
 $("editor-name").value=agent.name;$("editor-prompt").value=agent.prompt;
 $("editor-help").textContent=agent.help;
 document.querySelectorAll("[data-output]").forEach((element)=>element.classList.toggle("on",element.dataset.output===agent.output));
 $("editor-reads").textContent=text?"macro names only":agent.messages?agent.messages+" recent messages":"the selected reply · no earlier messages";
 $("review-state").value=state;$("review-agent").value=agent.id;
 $("chat").options[0].text=full?"At the old mill · The courier's letter and the eight travelers of the northern road · Chat 12":"At the old mill · Chat 1";
 $("message-snippet").textContent=text?"Uses the selected chat's names: User and Lyra.":currentMessage().before.split("\n")[0];
 $("message-text").textContent=currentMessage().before;
 $("chat").disabled=["empty","running","loading"].includes(state);
 $("message").disabled=text||["empty","loading","running"].includes(state);
 $("connection").disabled=text||["empty","loading","running"].includes(state);
 $("model-label").textContent=text?"Text mode · no model":$("connection").value==="alternate"?"Alternate example model":"Example model";
 $("call-note").textContent=text?"No AI call. Expands this agent's text.":"A model request may incur cost.";
 $("run-test").disabled=["empty","loading","running","unsupported"].includes(state);
 $("run-test").querySelector("span").textContent=state==="running"?"Running...":state==="error"?"Try again":complete()?"Run again":"Run test";
 $("stop-test").hidden=state!=="running";
 const status={ready:"Ready to run",loading:"Loading messages...",running:"Running this test...",result:"Test complete",error:"Connection unavailable",stopped:"Stopped",empty:"No chat available",stale:"Preview is outdated",unsupported:"Standalone preview unavailable",full:"Test complete"};
 $("status").textContent=status[state];$("status").classList.toggle("running",["loading","running"].includes(state));
 $("state-notice").hidden=!["error","stale"].includes(state);
 $("state-notice").dataset.kind=state==="error"?"error":"notice";
 $("state-notice").textContent=state==="error"?"The connection did not respond. Check the selected connection and try again.":"The context or agent draft changed after this test. Run again to preview the current draft.";
 $("state-notice").setAttribute("role",state==="error"?"alert":"note");
 $("result-meta").textContent=complete()?(snapshot.agent.runMode==="text"?"No AI call":snapshot.model+" · 1.2 s · 314 in / 92 out"):"";
 $("preview-safety").textContent=text?"Preview only · No AI call or story changes.":"Preview only · Your chat and story stay unchanged.";
 renderPanel();
}
function setState(value,keepTimer=false) {
 if(!states.includes(value))value="ready";
 if(!keepTimer){clearTimeout(timer);generation++;}
 if(["result","full"].includes(value)||value==="stale"&&!snapshot)snapshot=capture();
 if(!["result","full","stale"].includes(value)){snapshot=null;tab="result";}
 state=value;history.replaceState(null,"","#"+state);render();
}
function run() {
 clearTimeout(timer);const current=++generation;tab="result";
 if(agent.runMode==="text"){setState("result");return;}
 setState("running",true);
 timer=setTimeout(()=>{if(current===generation&&modal.open)setState("result");},1200);
}
function close(){clearTimeout(timer);generation++;snapshot=null;modal.close();$("open-preview").focus();}
$("open-preview").addEventListener("click",()=>{setState("ready");modal.showModal();$("run-test").focus();});
$("close-preview").addEventListener("click",close);
modal.addEventListener("cancel",(event)=>{event.preventDefault();close();});
modal.addEventListener("click",(event)=>{if(event.target===modal)close();});
$("run-test").addEventListener("click",run);
$("stop-test").addEventListener("click",()=>setState("stopped"));
$("review-state").addEventListener("change",(event)=>setState(event.target.value));
$("review-agent").addEventListener("change",(event)=>{agent=AGENTS.find((a)=>a.id===event.target.value);tab="result";setState("ready");});
for(const id of ["chat","message","connection"])$(id).addEventListener("change",()=>{
 if(complete()){setState("stale");return;}
 if(id==="chat"){clearTimeout(timer);const current=++generation;setState("loading",true);timer=setTimeout(()=>{if(current===generation)setState("ready");},550);}
 else setState("ready");
});
document.querySelectorAll("[data-tab]").forEach((button)=>button.addEventListener("click",()=>{tab=button.dataset.tab;renderPanel();}));
$("result-tabs").addEventListener("keydown",(event)=>{
 if(!["ArrowRight","ArrowLeft","Home","End"].includes(event.key))return;
 event.preventDefault();const tabs=[...document.querySelectorAll("[data-tab]")].filter((button)=>!button.hidden);
 const i=tabs.findIndex((button)=>button.dataset.tab===tab);
 const next=event.key==="Home"?0:event.key==="End"?tabs.length-1:(i+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
 tab=tabs[next].dataset.tab;renderPanel();tabs[next].focus();
});
modal.addEventListener("keydown",(event)=>{
 if(event.key!=="Tab")return;
 const items=[...modal.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter((element)=>element.getClientRects().length&&!element.closest("[hidden]"));
 const first=items[0],last=items.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
});
window.draft={setState,get state(){return state;},get agent(){return agent;}};
setState(location.hash.slice(1)||"result");modal.showModal();$("run-test").focus();
