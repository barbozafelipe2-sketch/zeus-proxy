'use client';
import {ChangeEvent,useEffect,useLayoutEffect,useRef,useState} from 'react';

const modes=[['zeus','Zeus'],['olympus','Olympus'],['openai','OpenAI'],['claude','Claude'],['gemini','Gemini']] as const;
type Mode=(typeof modes)[number][0];
type Msg={who:'Felipe'|'Zeus';text:string;meta?:string;files?:string[]};
type TextFile={id:string;name:string;mimeType:string;text:string};
const STORE_KEY='olyhub.zeusproxy.session.v1';

export default function Home(){
 const [mode,setMode]=useState<Mode>('zeus');
 const [input,setInput]=useState('');
 const [messages,setMessages]=useState<Msg[]>([]);
 const [busy,setBusy]=useState(false);
 const [trace,setTrace]=useState<any>(null);
 const [conversationId,setConversationId]=useState<string|undefined>();
 const [files,setFiles]=useState<TextFile[]>([]);
 const [fileError,setFileError]=useState('');
 const [ready,setReady]=useState(false);
 const [accessKey,setAccessKey]=useState('');
 const [accessDraft,setAccessDraft]=useState('');
 const [accessOpen,setAccessOpen]=useState(false);
 const ta=useRef<HTMLTextAreaElement>(null);
 const picker=useRef<HTMLInputElement>(null);

 useEffect(()=>{
  try{const raw=localStorage.getItem(STORE_KEY);if(raw){const saved=JSON.parse(raw);if(Array.isArray(saved.messages))setMessages(saved.messages);if(saved.mode&&modes.some(x=>x[0]===saved.mode))setMode(saved.mode);if(typeof saved.conversationId==='string')setConversationId(saved.conversationId);}}
  catch{localStorage.removeItem(STORE_KEY)}
  try{const key=sessionStorage.getItem('olyhub.zeusproxy.access.v1')||'';setAccessKey(key);setAccessDraft(key);}catch{}
  setReady(true);ta.current?.focus();
 },[]);
 useEffect(()=>{if(ready)try{localStorage.setItem(STORE_KEY,JSON.stringify({mode,messages,conversationId}));}catch{}},[ready,mode,messages,conversationId]);
 useLayoutEffect(()=>{
  const el=ta.current;if(!el)return;
  const maxHeight=window.innerWidth<=640?128:160;
  el.style.height='auto';
  el.style.height=`${Math.min(el.scrollHeight,maxHeight)}px`;
  el.style.overflowY=el.scrollHeight>maxHeight?'auto':'hidden';
 },[input]);

 async function addFiles(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.target.files||[]);event.target.value='';setFileError('');
  const accepted:TextFile[]=[];
  for(const file of selected){
   if(!/\.(txt|md|csv|json|tsv)$/i.test(file.name)){setFileError(`${file.name}: use .txt, .md, .csv, .json or .tsv.`);continue;}
   if(file.size>100000){setFileError(`${file.name}: maximum size is 100 KB.`);continue;}
   const text=await file.text();accepted.push({id:crypto.randomUUID(),name:file.name,mimeType:file.type||'text/plain',text});
  }
  setFiles(current=>{const next=[...current,...accepted];if(next.length>10){setFileError('You can attach up to 10 files per message.');return current;}const size=next.reduce((n,x)=>n+x.text.length,0);if(size>60000){setFileError('Combined text attachment limit is 60,000 characters.');return current;}return next;});
 }

 function newConversation(){if(busy)return;setMessages([]);setConversationId(undefined);setTrace(null);setFiles([]);setFileError('');setInput('');}
 function removeFile(id:string){setFiles(current=>current.filter(x=>x.id!==id));setFileError('');}
 async function send(){
  if(!input.trim()||busy)return;
  const q=input.trim(), attached=[...files];
  setInput('');setMessages(current=>[...current,{who:'Felipe',text:q,files:attached.map(x=>x.name)}]);setBusy(true);setTrace(null);setFileError('');
  try{
   const headers:Record<string,string>={'content-type':'application/json'};if(accessKey)headers['x-zeus-access-token']=accessKey;
   const response=await fetch('/api/chat',{method:'POST',headers,body:JSON.stringify({requestId:crypto.randomUUID(),message:q,mode,projectId:'default',conversationId,attachments:attached})});
   const result=await response.json();
   if(result.conversationId)setConversationId(result.conversationId);
   if(result.trace)setTrace(result.trace);
   if(!response.ok)throw new Error(result.error||`HTTP_${response.status}`);
   const meta=result.trace?.fallback?`${label(result.trace.provider)} · OpenAI fallback from ${label(result.trace.fallback.from)}`:result.trace?.council?`Olympus council · lead ${label(result.trace.council.lead)} · director ${label(result.trace.council.director)}${result.trace.council.degraded?' · limited review':''}`:result.warning?`${result.warning} · response not persisted`:result.replayed?'Recovered from saved request':result.trace?.provider?`${label(result.trace.provider)} · ${result.trace.latencyMs} ms`:undefined;
   setMessages(current=>[...current,{who:'Zeus',text:result.message||friendlyError(result.error),meta}]);setFiles([]);
  }catch(error){const code=error instanceof Error?error.message:undefined;setMessages(current=>[...current,{who:'Zeus',text:friendlyError(code),meta:'Request failed'}]);}
  finally{setBusy(false);ta.current?.focus();}
 }

 const empty=messages.length===0;
 function saveAccessKey(){const next=accessDraft.trim();setAccessKey(next);try{if(next)sessionStorage.setItem('olyhub.zeusproxy.access.v1',next);else sessionStorage.removeItem('olyhub.zeusproxy.access.v1');}catch{}setAccessOpen(false);}
 return <main className={empty?'empty':''}>
  <nav><div className="brand"><span className="mark">ϟ</span><span>Olympus Hub</span><span className="personal-label">PERSONAL</span></div><div className="nav-actions"><button className="ghost lock-button" aria-label="Private access settings" title="Private access settings" onClick={()=>setAccessOpen(v=>!v)}><svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3"/></svg></button><button className="ghost new-chat" aria-label="New conversation" title="New conversation" onClick={newConversation} disabled={busy}>＋</button></div></nav>
  {accessOpen&&<section className="access-panel" aria-label="Private access settings"><div><strong>Private access</strong><p>Your key stays in this browser session and is sent only to the chat endpoint.</p></div><input aria-label="Private access key" type="password" autoComplete="current-password" placeholder="Paste your access key" value={accessDraft} onChange={e=>setAccessDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')saveAccessKey()}}/><div className="access-actions"><button onClick={()=>{setAccessDraft('');setAccessKey('');try{sessionStorage.removeItem('olyhub.zeusproxy.access.v1')}catch{};setAccessOpen(false)}}>Clear</button><button className="save-key" onClick={saveAccessKey}>Save key</button></div></section>}
  <section className="stage">
   {empty?<div className="welcome"><div className="orb"><span>ϟ</span></div><p className="eyebrow">YOUR PERSONAL AI</p><h1>What are we building?</h1><p className="sub">One place to think clearly, build boldly, and keep moving.</p><div className="starters">{[['Make a plan','Help me turn a goal into a clear, practical plan.'],['Think it through','Help me compare options and spot what I might be missing.'],['Build something','Help me turn an idea into a useful first version.']].map(([title,prompt])=><button key={title} onClick={()=>{setInput(prompt);ta.current?.focus()}}><span>{title}</span><i>↗</i></button>)}</div></div>:
   <div className="conversation">{messages.map((m,i)=><article className={`message ${m.who==='Felipe'?'user':'zeus'}`} key={i}>{m.who==='Zeus'&&<div className="mini" aria-hidden="true">ϟ</div>}<div><div className="speaker">{m.who}</div><div className="copy">{m.text}</div>{m.files?.length&&<div className="file-tag">Attached: {m.files.join(', ')}</div>}{m.meta&&<div className="meta">{m.meta}</div>}{m.who==='Zeus'&&<button className="artifact" onClick={()=>downloadArtifact(m.text,i)}>↓ Save answer as .md</button>}</div></article>)}{busy&&<article className="message zeus"><div className="mini" aria-hidden="true">ϟ</div><div><div className="speaker">{mode==='olympus'?'Olympus council':'Zeus'}</div><div className="thinking" role="status" aria-label="Zeus is thinking"><i></i><i></i><i></i></div></div></article>}</div>}
  </section>
  <section className="dock">
   {files.length>0&&<div className="file-list">{files.map(file=><span className="file-chip" key={file.id}>{file.name}<button aria-label={`Remove ${file.name}`} onClick={()=>removeFile(file.id)}>×</button></span>)}</div>}
   {fileError&&<div className="file-error" role="alert">{fileError}</div>}
   <div className="modebar">{modes.map(([id,name])=><button key={id} onClick={()=>setMode(id)} className={mode===id?`selected ${id}`:''}><span className={`dot ${id}`}></span>{name}</button>)}</div>
   <div className="composer"><button className="attach" title="Attach a text file" aria-label="Attach a text file" onClick={()=>picker.current?.click()} disabled={busy}>＋</button><input ref={picker} type="file" hidden multiple accept=".txt,.md,.csv,.json,.tsv,text/plain,text/markdown,text/csv,application/json" onChange={addFiles}/><textarea aria-label="Message Zeus" ref={ta} rows={1} value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask Zeus anything…"/><button className="send" aria-label="Send message" title="Send message" disabled={!input.trim()||busy} onClick={send}>↑</button></div>
   <div className="hint">Enter adds a new line · use the arrow to send. {mode==='zeus'?'Zeus uses an available engine and falls back to OpenAI.':mode==='olympus'?'Lead answer · blind review · director synthesis.':`${modes.find(x=>x[0]===mode)?.[1]} is active. OpenAI is the fallback.`} Text attachments are sent with your prompt.</div>
  </section>
  {trace&&<details className="trace"><summary>Intelligence trace <span>{trace.status}</span></summary><div className="tracegrid"><div><b>Engine</b><span>{label(trace.provider)}</span></div><div><b>Model</b><span>{trace.model||'—'}</span></div><div><b>Latency</b><span>{trace.latencyMs} ms</span></div><div><b>Trace</b><span>{trace.traceId?.slice(0,12)}…</span></div>{trace.council&&<div><b>Reviews</b><span>{trace.council.reviewers.filter((x:any)=>x.status==='completed').length} completed</span></div>}</div></details>}
 </main>;
}
function label(v?:string){return v==='openai'?'OpenAI':v==='claude'?'Claude':v==='gemini'?'Gemini':v||'Unknown'}
function friendlyError(e?:string){if(e==='APP_ACCESS_NOT_CONFIGURED')return 'This private deployment is not configured yet. Add a strong ZEUS_PROXY_ACCESS_TOKEN in the hosting environment, then redeploy.';if(e==='APP_ACCESS_REQUIRED')return 'This private chat needs its access key. Open the lock control above to enter it.';if(e?.includes('NOT_CONFIGURED'))return 'Netlify AI Gateway is not available for this engine in this runtime. Enable AI Features for the Netlify team and use a deployed site or `netlify dev`.';if(e==='MODEL_TIMEOUT')return 'The engine exceeded its time limit. Your previous conversation is still available; try again.';if(e==='PROVIDER_BAD_REQUEST')return 'The selected AI engine rejected the request format. The request reached the provider, but the adapter needs attention.';if(e==='PROVIDER_RATE_LIMITED')return 'The provider is rate-limiting requests. Wait briefly and try again.';return `The request did not complete${e?` (${e})`:''}. Your saved conversation remains available.`}
function downloadArtifact(text:string,index:number){const blob=new Blob([`# Zeus answer ${index+1}\n\n${text}\n`],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`zeus-answer-${new Date().toISOString().slice(0,10)}-${index+1}.md`;a.click();URL.revokeObjectURL(url)}
