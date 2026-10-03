const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const app = $('#app');

const state = {
  user:null, token:null, refreshToken:null, authReady:false, accessKey:'', attachMenu:false,
  tab:'Home', mode:'ZEUS', drawer:false,
  conversations:[], currentConversation:null, messages:[], chatArtifacts:[], sending:false, execStatus:'', error:'',
  attachedFiles:[], projects:[], projectFilter:'ALL', currentProject:null, tasks:[],
  files:[], artifacts:[], health:null, chatsMenu:false, recording:false,
  projectSection:'CHAT', projectMemories:[], memoryPolicy:null,
  messagePage:{hasMore:false,nextCursor:null}, filesPage:{scope:'global',hasMore:false,nextCursor:null}, artifactsPage:{scope:'global',hasMore:false,nextCursor:null}, chatRestore:null,
  voiceBusy:false, voiceRecorder:null, voiceStream:null, voiceChunks:[], voiceStopTimer:null, voiceRecognition:null,
  lastFailedText:'', lastFailedMessageId:null, lastFailedAttachments:[], lastFailedRequestId:null,
};

const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = n => { n=Number(n||0); if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`; };
const fmtDate = v => { if(!v)return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined}); };
const resetViewport = () => requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
const initials = () => (state.user?.user_metadata?.full_name || state.user?.email || 'O').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
const accessStoreKey='olyhub.zeusproxy.access.v2';
function writeAccessKey(value){try{if(value)sessionStorage.setItem(accessStoreKey,value);else sessionStorage.removeItem(accessStoreKey)}catch{}}
function readAccessKey(){try{return sessionStorage.getItem(accessStoreKey)||''}catch{return ''}}
function clearAuth(){writeAccessKey('');state.user=null;state.accessKey='';state.token=null;state.refreshToken=null;state.currentConversation=null;state.messages=[];}
async function bootAuth(){
  state.authReady=true;
  state.accessKey=readAccessKey();
  if(!state.accessKey){render();return;}
  state.user={id:'zeus-personal-owner',user_metadata:{full_name:'Felipe'}};
  try{await bootstrapApp();}catch(err){clearAuth();state.error=err.message||'Unlock Zeus again.';render();}
}
async function unlock(key){
  const value=String(key||'').trim();
  if(value.length<32)throw new Error('Use the same 32+ character private key configured in Netlify.');
  state.accessKey=value;writeAccessKey(value);state.user={id:'zeus-personal-owner',user_metadata:{full_name:'Felipe'}};
  await bootstrapApp();
}
async function logout(){clearAuth();render();}

async function api(path, options={}){
  const {requestId:optionRequestId,...fetchOptions}=options;
  const headers=new Headers(fetchOptions.headers||{});
  if(state.accessKey)headers.set('x-zeus-access-token',state.accessKey);
  const apiRequestId=optionRequestId||crypto.randomUUID();
  headers.set('X-OlyHub-Request-ID',apiRequestId);
  if(fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const r=await fetch(path,{...fetchOptions,headers});
  const contentType=r.headers.get('content-type')||'';
  const data=contentType.includes('application/json')?await r.json():await r.text();
  if(!r.ok){
    if(r.status===401){clearAuth();render();}
    const msg=data?.error||data?.message||(typeof data==='string'?data.slice(0,180):'');
    const ref=data?.requestId?` · ref ${String(data.requestId).slice(0,18)}`:'';
    throw new Error(`${msg||`Request failed (${r.status}).`}${ref}`);
  }
  return data;
}

async function bootstrapApp(){
  state.authReady=true; render();
  const jobs=[
    ['Conversations',loadConversations()],
    ['Projects',loadProjects()],
    ['Files',loadFiles()],
    ['Artifacts',loadArtifacts()],
    ['Runtime diagnostics',loadHealth()],
  ];
  const settled=await Promise.allSettled(jobs.map(([,promise])=>promise));
  const failed=[];
  settled.forEach((result,index)=>{if(result.status==='rejected'){failed.push(jobs[index][0]);console.warn(`OlyHub bootstrap ${jobs[index][0]} failed`,result.reason);}});
  if(failed.length)state.error=`Some workspace services did not load: ${failed.join(', ')}. Refresh to retry.`;
  const params=new URLSearchParams(location.search); const pid=params.get('project'); const cid=params.get('conversation');
  if(pid && state.projects.some(p=>p.id===pid)){ await openProjectWorkspace(pid); return; }
  if(cid) await openConversation(cid,false);
  render();
}
async function loadConversations(){ const d=await api('/api/conversations');state.conversations=d.conversations||[]; }
async function loadProjects(){ const d=await api('/api/projects');state.projects=d.projects||[]; if(state.currentProject)state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||null; }
function mergeById(existing,incoming){const map=new Map((existing||[]).map(x=>[x.id,x]));for(const item of incoming||[])map.set(item.id,item);return [...map.values()];}
async function loadFiles(projectId=null,{append=false}={}){
  const scope=projectId||'global';const page=state.filesPage?.scope===scope?state.filesPage:{scope,hasMore:false,nextCursor:null};
  const qs=new URLSearchParams({limit:'60'});if(projectId)qs.set('projectId',projectId);if(append&&page.nextCursor)qs.set('before',page.nextCursor);
  const d=await api(`/api/files?${qs}`);const incoming=d.files||[];
  state.files=append?mergeById(state.files,incoming):incoming;state.filesPage={scope,hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
}
async function loadArtifacts(projectId=null,{append=false}={}){
  const scope=projectId||'global';const page=state.artifactsPage?.scope===scope?state.artifactsPage:{scope,hasMore:false,nextCursor:null};
  const qs=new URLSearchParams({limit:'60'});if(projectId)qs.set('projectId',projectId);if(append&&page.nextCursor)qs.set('before',page.nextCursor);
  const d=await api(`/api/artifacts?${qs}`);const incoming=d.artifacts||[];
  state.artifacts=append?mergeById(state.artifacts,incoming):incoming;state.artifactsPage={scope,hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
}
async function loadHealth(){ state.health=await api('/api/health'); }
async function loadTasks(projectId){ const d=await api(`/api/tasks?projectId=${encodeURIComponent(projectId)}`);state.tasks=d.tasks||[]; }
async function loadMemories(projectId){ if(!projectId){state.projectMemories=[];state.memoryPolicy=null;return;} const d=await api(`/api/memories?projectId=${encodeURIComponent(projectId)}`);state.projectMemories=d.memories||[];state.memoryPolicy=d.policy||null; }

function icon(name){
  const svg=(d,box='0 0 24 24')=>`<svg class="ico" viewBox="${box}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const map={
    menu:svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    home:svg('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>'),
    projects:svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    tools:svg('<path d="M14.5 6.5 18 3l3 3-3.5 3.5M3 21l7.5-7.5M13 11l2.5-2.5"/><path d="M8 16l-3 5 5-3"/>'),
    files:svg('<path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>'),
    settings:svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4 6.2 17.8"/>'),
    plus:svg('<path d="M12 5v14M5 12h14"/>'),
    search:svg('<circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/>'),
    chat:svg('<path d="M5 6h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3V7a1 1 0 0 1 1-1z"/>'),
    attach:svg('<path d="M8.5 12.5 14 7a3.5 3.5 0 1 1 5 5l-8 8a4.5 4.5 0 0 1-6.4-6.4l7.5-7.5"/>'),
    mic:svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>'),
    send:svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    image:svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="m8 16 3-3 3 2 2-2 3 3"/>'),
    camera:svg('<path d="M7 7.5 8.5 5h7L17 7.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2z"/><circle cx="12" cy="13.5" r="3.2"/>'),
    doc:svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    chart:svg('<path d="M5 19V9M10 19V5M15 19v-7M20 19V8"/>'),
    globe:svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
    code:svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/>'),
    auto:svg('<path d="M12 8v4l2.5 1.5"/><circle cx="12" cy="12" r="8"/>'),
    close:svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    check:svg('<path d="m5 12 5 5 9-10"/>'),
    folder:svg('<path d="M4 7h6l2 2h8v10H4z"/>'),
    memory:svg('<rect x="5" y="7" width="14" height="10" rx="2"/><path d="M8 7V5M16 7V5M8 19v-2M16 19v-2"/>'),
  };
  return map[name]||svg('<circle cx="12" cy="12" r="2"/>');
}

function authView(){
  return `<div class="auth-shell personal-auth-shell">
    <section class="auth-visual">
      <div class="personal-bolt">ϟ</div>
      <div class="eyebrow auth-kicker">OLYMPUS HUB · PERSONAL</div>
      <h1>Zeus is your private AI workspace.</h1>
      <p>Projects, permanent memory, files, artifacts and Olympus orchestration stay together. Provider keys stay behind Netlify.</p>
      <div class="auth-proof" aria-label="Zeus capabilities"><span>Projects + dedicated memory</span><span>Files, images and outputs</span><span>Zeus + Olympus</span></div>
    </section>
    <section class="auth-panel"><div class="auth-card">
      <div class="personal-bolt small">ϟ</div><div class="eyebrow">PRIVATE ACCESS</div><h2>Unlock Zeus</h2><p>Use the same private access key configured in Netlify.</p>
      <form id="auth-form" class="form-grid"><div class="field"><label>Private key</label><input id="auth-key" type="password" autocomplete="current-password" minlength="32" required></div><div id="auth-notice" class="notice hidden"></div><button class="primary" type="submit" id="auth-submit">Unlock Zeus</button></form>
    </div></section>
  </div>`;
}

function sidebar(){
  const recents=homeChats().slice(0,18).map(c=>`<button class="recent-item ${c.id===state.currentConversation?'active':''}" data-conv="${c.id}" title="${esc(c.title)}">${esc(c.title||'Conversation')}</button>`).join('') || `<div class="muted tiny" style="padding:8px 10px">Home chats appear here. Project chats stay inside each project.</div>`;
  return `<aside class="sidebar ${state.drawer?'open':''}">
    <div class="logo-row"><div class="personal-bolt small">ϟ</div><div><div class="logo-word">OLYMPUS HUB</div><div class="logo-sub">PERSONAL · ZEUS</div></div></div>
    <button class="new-chat" id="new-chat">${icon('chat')} <span><strong>New chat</strong><small class="muted" style="display:block;margin-top:2px">Start a clean execution</small></span></button>
    <button id="new-chat-top" class="hidden">New chat</button>
    <div class="search-box">${icon('search')}<input id="chat-search" placeholder="Search chats"></div>
    <div class="side-nav">${navButtons(true)}</div>
    <div class="side-section"><div class="side-title">Recent chats</div><div class="recent-list" id="recent-list">${recents}</div></div>
    <div class="sidebar-foot"><div class="user-chip"><div class="avatar">${esc(initials())}</div><div style="min-width:0"><strong style="font-size:12px">${esc(state.user?.user_metadata?.full_name||state.user?.email||'Felipe')}</strong><div class="muted tiny">Memory & persistence connected</div></div></div><button class="ghost" id="logout" style="text-align:left;padding:0">Lock</button></div>
  </aside>${state.drawer?'<button class="scrim" id="scrim" aria-label="Close menu"></button>':''}`;
}
function navButtons(side=false){
  const items=[['Home','home'],['Projects','projects'],['Tools','tools'],['Files','files'],['Settings','settings']];
  return items.map(([label,ico])=>`<button data-tab="${label}" class="${state.tab===label?'active':''}">${icon(ico)}${side?`<span>${label}</span>`:`<span>${label}</span>`}</button>`).join('');
}
function homeChats(){ return (state.conversations||[]).filter(c=>!c.project_id); }
function projectChats(){ return (state.conversations||[]).filter(c=>c.project_id); }
function topbar(){
  const context=state.currentProject?.name||(state.tab==='Home'?(state.currentConversation?'Conversation':'Home'):state.tab);
  const hasHealth=Boolean(state.health);
  const chatReady=Boolean(state.health?.capabilities?.chat);
  const status=chatReady?'READY':hasHealth?'LIMITED':'SYNCING';
  const tone=chatReady?'ready':hasHealth?'limited':'syncing';
  const title=chatReady?'AI runtime and workspace services are available.':hasHealth?'Workspace loaded, but AI runtime is not fully available.':'Checking workspace runtime…';
  return `<header class="topbar">
    <button class="hamburger personal-more" id="hamburger" aria-label="Open projects and navigation" title="Projects and navigation">⋮</button>
    <div class="topbar-context" aria-label="Current workspace"><span>${esc(state.currentProject?'PROJECT':'WORKSPACE')}</span><strong>${esc(context)}</strong></div>
    <div class="brand-center"><div class="personal-bolt small">ϟ</div><div class="brand-copy"><span class="logo-word">OLYMPUS HUB</span><span class="logo-sub">PERSONAL · ZEUS</span></div></div>
    <div class="topbar-actions"><span class="system-indicator ${tone}" title="${esc(title)}"><i></i>${status}</span><button class="avatar ghost" id="profile-avatar" aria-label="Open account settings">${esc(initials())}</button></div>
    <button id="chats-menu" class="hidden" tabindex="-1">chats</button>
  </header>`;
}
function bottomNav(){return `<nav class="bottom-nav">${navButtons(false)}</nav>`;}

function homeView(){
  const isEmpty=!state.messages.length;
  const msgs=state.messages.map(m=>messageHtml(m)).join('');
  const exec=state.execStatus?`<div class="exec-card live"><div class="exec-head"><span class="exec-pulse"></span><div><strong>${state.mode==='OLYMPUS'?'Olympus is working':'Zeus is working'}</strong><div class="muted tiny">${esc(state.execStatus)}</div></div></div><div class="exec-foot">Live execution status — no simulated timings.</div></div>`:'';
  return `<section class="page chat-page">
    <div class="mode-strip">
      <button class="mode-card ${state.mode==='ZEUS'?'selected':''}" data-mode="ZEUS" aria-pressed="${state.mode==='ZEUS'}"><div class="mode-icon">${icon('auto')}</div><div><strong>Zeus <em>DEFAULT</em></strong><small>Fast execution<br>Lead model + bounded review.</small></div></button>
      <button class="mode-card ${state.mode==='OLYMPUS'?'selected':''}" data-mode="OLYMPUS" aria-pressed="${state.mode==='OLYMPUS'}"><div class="mode-icon">${icon('globe')}</div><div><strong>Olympus <em>SPECIALIST</em></strong><small>Multi-specialist synthesis<br>Complex work. One final answer.</small></div></button>
    </div>
    <p class="mode-blurb">${state.mode==='ZEUS'?'Default for daily work: one lead, fallback when needed, and a bounded review on complex requests.':'For broad work: a small specialist team contributes in parallel and a Director produces one canonical answer.'}</p>
    <div class="chat-scroll" id="chat-scroll">
      ${isEmpty?`<div class="welcome"><div class="eyebrow">${state.currentProject?esc(state.currentProject.name):'ONE AI ENVIRONMENT. REAL RESULTS.'}</div><h1>Turn the request into a result.</h1><p>Attach the source, give the goal, and keep the conversation, files and deliverables together.</p><div class="quick-prompts"><button data-prompt="Analyze the attached file and ground every important claim in the source. Call out anything the source does not support.">Review a source</button><button data-prompt="Create the next professional deliverable for this work and keep it connected to the conversation.">Create a deliverable</button><button data-prompt="Build this as runnable code. Include focused tests and tell me clearly which tests were not actually executed.">Build with tests</button><button data-prompt="Turn this goal into a project plan with clear tasks, risks, and milestones.">Plan a project</button></div></div>`:`${state.messagePage?.hasMore?'<div class="history-more"><button class="secondary compact" id="load-older-messages">Load older messages</button></div>':''}<div class="message-list">${msgs}</div>`}
      ${exec}
      ${state.error?`<div class="chat-error"><span>${esc(state.error)}</span>${state.lastFailedText?`<button type="button" id="retry-last">Retry</button>`:''}</div>`:''}
    </div>
    ${composer()}
  </section>`;
}
function safeSources(m){
  const raw=Array.isArray(m?.metadata?.sources)?m.metadata.sources:Array.isArray(m?.sources)?m.sources:[];
  const out=[];const seen=new Set();
  for(const source of raw){
    try{const url=new URL(String(source?.url||''));if(!['http:','https:'].includes(url.protocol)||seen.has(url.href))continue;seen.add(url.href);out.push({url:url.href,title:String(source?.title||url.hostname).slice(0,300)});}catch{}
    if(out.length>=12)break;
  }
  return out;
}
function messageHtml(m){
  const artifacts=(m.artifacts||[]).map(artifactCard).join('');
  const attached=(m.attachments||[]).map(f=>`<span class="file-chip static">${icon('files')} ${esc(f.filename||f.name||'file')}</span>`).join('');
  const sources=safeSources(m);
  const sourceHtml=sources.length?`<div class="message-sources"><span>Sources</span><div>${sources.map((source,i)=>`<a href="${esc(source.url)}" target="_blank" rel="noreferrer noopener" title="${esc(source.title)}"><strong>${i+1}</strong><span>${esc(source.title)}</span></a>`).join('')}</div></div>`:'';
  return `<article class="message ${m.role==='user'?'user':'assistant'}"><div class="message-label">${m.role==='user'?'YOU':esc(m.mode||state.mode)}</div><div class="message-body">${esc(m.content||'')}</div>${sourceHtml}${attached?`<div class="attachments in-message">${attached}</div>`:''}${artifacts?`<div class="artifact-row">${artifacts}</div>`:''}</article>`;
}
function artifactCard(a){const tag=esc((a.type||'FILE').toUpperCase().slice(0,4));return `<div class="artifact-card"><div class="out-badge">${tag}</div><div><strong>${esc(a.filename||'OlyHub output')}</strong><small>${fmtSize(a.size)} · ${esc(a.mime_type||a.type||'Artifact')}</small></div><div class="artifact-actions"><a href="${esc(a.downloadUrl)}" target="_blank" rel="noopener">Open</a><a class="ghost-a" href="${esc(a.downloadUrl)}" download>Download</a></div></div>`}
function voiceSupported(){
  return Boolean(window.SpeechRecognition||window.webkitSpeechRecognition||(navigator.mediaDevices&&window.MediaRecorder));
}
function composer(){
  const chips=state.attachedFiles.map(f=>`<span class="file-chip">${icon('files')} ${esc(f.filename)}<button type="button" data-remove-file="${f.id}">${icon('close')}</button></span>`).join('');
  const showMic=voiceSupported();
  const scope=state.currentProject?`Project: ${esc(state.currentProject.name)}`:'This conversation';
  return `<div class="composer-shell">${state.attachMenu?`<div class="attach-menu" role="menu" aria-label="Add attachment"><button type="button" id="attach-media">${icon('image')}<span>Photo / Video</span></button><button type="button" id="attach-camera">${icon('camera')}<span>Camera</span></button><button type="button" id="attach-file">${icon('files')}<span>File</span></button></div>`:''}${chips?`<div class="attachments pending">${chips}</div>`:''}<form class="composer" id="composer"><button type="button" class="icon-btn attach-plus" id="attach" title="Add photo, video or file" aria-label="Add photo, video or file">＋</button><textarea id="composer-text" rows="1" aria-label="Message ${state.mode==='ZEUS'?'Zeus':'Olympus'}" placeholder="Message ${state.mode==='ZEUS'?'Zeus':'Olympus'}…" ${state.sending?'disabled':''}></textarea>${showMic?`<button type="button" class="icon-btn ${state.recording?'recording':''}" id="voice" title="${state.recording?'Stop recording':state.voiceBusy?'Transcribing…':'Voice input'}" aria-label="${state.recording?'Stop recording':state.voiceBusy?'Transcribing voice':'Voice input'}" ${state.voiceBusy?'disabled':''}>${icon('mic')}</button>`:''}<button type="submit" class="icon-btn send-btn" title="Send" aria-label="Send message" ${state.sending?'disabled':''}>${icon('send')}</button></form><div class="composer-meta"><span>${state.currentProject?'Permanent Project chat · dedicated memory + files':'Conversation history available · no Project memory'}</span><span>Enter adds a new line · use the arrow to send</span></div></div>`;
}

function projectsView(){
  if(state.currentProject) return projectWorkspace();
  const projects=state.projects.filter(p=>state.projectFilter==='ALL'||(state.projectFilter==='COMPLETED'?p.status==='COMPLETED':p.status!=='COMPLETED'));
  const upcoming=state.tasks.filter(t=>t.status!=='DONE').slice(0,6);
  const projectSection=projects.length?`<div class="project-grid">${projects.map(projectCard).join('')}</div>`:`<div class="card" style="padding:44px;text-align:center;margin-top:18px"><div class="eyebrow">No projects yet</div><h2>Create your first real workspace.</h2><p class="muted">A project connects its conversation, tasks, files, artifacts and memory.</p><button class="primary" id="create-project-empty">${icon('plus')} New project</button></div>`;
  const tasksSection=upcoming.length?`<h2 class="section-title">Upcoming tasks</h2><div class="card" style="padding:14px"><div class="task-list">${upcoming.map(taskHtml).join('')}</div></div>`:'';
  return `<section class="page projects-page"><div class="page-head"><div><div class="eyebrow">Projects</div><h1>Projects</h1><p>Turn ideas into real projects. Each project has one independent conversation.</p></div><button class="primary" id="create-project">${icon('plus')} New project</button></div><div class="project-tabs"><button data-filter="ALL" class="${state.projectFilter==='ALL'?'active':''}">All Projects</button><button data-filter="IN_PROGRESS" class="${state.projectFilter==='IN_PROGRESS'?'active':''}">In Progress</button><button data-filter="COMPLETED" class="${state.projectFilter==='COMPLETED'?'active':''}">Completed</button></div>${projectSection}${tasksSection}</section>`;
}
function projectCard(p){const status=String(p.status||'IN_PROGRESS').replaceAll('_',' ');return `<article class="proj-row" data-project="${p.id}" tabindex="0" role="button" aria-label="Open project ${esc(p.name)}"><div class="proj-card-top"><div class="proj-thumb">${icon('folder')}</div><span class="proj-status ${esc(String(p.status||'IN_PROGRESS').toLowerCase())}">${esc(status)}</span></div><div class="proj-body"><strong>${esc(p.name)}</strong><span>${esc(p.description||p.goal||'OlyHub project')}</span><div class="progress"><span style="width:${Math.max(0,Math.min(100,Number(p.progress||0)))}%"></span></div><div class="proj-meta"><span>${Number(p.task_count||0)} tasks</span><span>${Number(p.file_count||0)} files</span><span>${Number(p.memory_count||0)} memories</span></div></div><div class="proj-foot"><em>${Number(p.progress||0)}%</em><span class="proj-open">Open workspace ›</span></div></article>`}
function projectWorkspace(){
  const p=state.currentProject;
  const section=state.projectSection||'CHAT';
  const tabs=[['CHAT','Chat'],['OVERVIEW','Overview'],['TASKS','Tasks'],['FILES','Files'],['MEMORY','Memory']];
  return `<section class="page project-workspace-page">
    <div class="project-workspace-head">
      <button class="ghost project-back" id="back-projects">← All projects</button>
      <div class="project-title-row">
        <div>
          <div class="eyebrow">PROJECT WORKSPACE</div>
          <h1>${esc(p.name)}</h1>
          <p>${esc(p.description||p.goal||'Persistent Olympus project workspace')}</p>
        </div>
        <div class="project-head-actions">
          <div class="project-stats-mini">
            <span><strong>${Number(p.progress||0)}%</strong> progress</span>
            <span><strong>${Number(p.file_count||0)}</strong> files</span>
            <span><strong>${Number(p.memory_count||0)}</strong> memories</span>
          </div>
          <button class="secondary compact" id="edit-project">Edit project</button>
        </div>
      </div>
      <div class="workspace-tabs">${tabs.map(([key,label])=>`<button data-project-section="${key}" class="${section===key?'active':''}">${label}</button>`).join('')}</div>
    </div>
    ${state.error&&section!=='CHAT'?`<div class="project-alert"><div class="chat-error"><span>${esc(state.error)}</span></div></div>`:''}
    ${projectSectionView(section)}
  </section>`;
}
function projectSectionView(section){
  if(section==='OVERVIEW')return projectOverviewView();
  if(section==='TASKS')return projectTasksView();
  if(section==='FILES')return projectFilesView();
  if(section==='MEMORY')return projectMemoryView();
  return projectChatView();
}
function projectChatView(){
  const p=state.currentProject;
  const isEmpty=!state.messages.length;
  const msgs=state.messages.map(m=>messageHtml(m)).join('');
  const exec=state.execStatus?`<div class="exec-card live"><div class="exec-head"><span class="exec-pulse"></span><div><strong>Working inside ${esc(p.name)}</strong><div class="muted tiny">${esc(state.execStatus)}</div></div></div><div class="exec-foot">Project context remains attached to this conversation.</div></div>`:'';
  return `<div class="project-chat-layout">
    <div class="project-chat-panel">
      <div class="project-chat-toolbar">
        <div><div class="eyebrow">PERMANENT PROJECT CHAT</div><strong>Everything here stays attached to ${esc(p.name)}</strong></div>
        <div class="project-mode-toggle"><button class="project-mode ${state.mode==='ZEUS'?'selected':''}" data-mode="ZEUS">⚡ Zeus</button><button class="project-mode ${state.mode==='OLYMPUS'?'selected':''}" data-mode="OLYMPUS">△ Olympus</button></div>
      </div>
      <div class="project-context-ribbon">${icon('memory')} <span>Goal, tasks, project files, approved memory and conversation history are injected into every turn.</span></div>
      <div class="chat-scroll project-chat-scroll" id="chat-scroll">
        ${isEmpty?`<div class="project-chat-empty"><div class="seal">${icon('chat')}</div><h2>Start working inside ${esc(p.name)}</h2><p>This is the permanent conversation for this project. Leaving and returning keeps its history and context.</p><div class="quick-prompts"><button data-prompt="Review this project and tell me the next highest-impact step">Next step</button><button data-prompt="Summarize where this project stands using its tasks, files and conversation history">Project status</button><button data-prompt="Create the next deliverable for this project">Create deliverable</button></div></div>`:`${state.messagePage?.hasMore?'<div class="history-more"><button class="secondary compact" id="load-older-messages">Load older messages</button></div>':''}<div class="message-list">${msgs}</div>`}
        ${exec}
        ${state.error?`<div class="chat-error"><span>${esc(state.error)}</span>${state.lastFailedText?`<button type="button" id="retry-last">Retry</button>`:''}</div>`:''}
      </div>
      ${composer()}
    </div>
    <aside class="project-side-stack">
      <div class="panel project-context-card"><div class="eyebrow">PROJECT CONTEXT</div><h3>Goal</h3><p>${esc(p.goal||'No goal added yet.')}</p><div class="context-meta"><span>${icon('memory')} Permanent memory</span><strong>${Number(p.memory_count||0)}</strong></div><div class="context-meta"><span>${icon('files')} Project files</span><strong>${Number(p.file_count||0)}</strong></div><div class="context-meta"><span>${icon('doc')} Artifacts</span><strong>${Number(p.artifact_count||0)}</strong></div></div>
      <div class="panel project-task-card"><div class="panel-head"><h3>Next tasks</h3><button class="text-gold" data-project-section="TASKS">View all ›</button></div><div class="task-list">${state.tasks.length?state.tasks.filter(t=>t.status!=='DONE').slice(0,5).map(taskHtml).join(''):`<div class="muted tiny" style="padding:12px">No open tasks.</div>`}</div></div>
    </aside>
  </div>`;
}
function projectOverviewView(){
  const p=state.currentProject;
  const open=state.tasks.filter(t=>t.status!=='DONE').slice(0,5);
  const projectFiles=state.files.filter(f=>f.project_id===p.id).slice(0,5);
  const projectArtifacts=state.artifacts.filter(a=>a.project_id===p.id).slice(0,5);
  return `<div class="project-section-grid">
    <div class="project-main-column">
      <div class="stat-grid project-stat-grid"><div class="card stat-card"><strong>${Number(p.progress||0)}%</strong><span>Progress</span></div><div class="card stat-card"><strong>${Number(p.task_count||0)}</strong><span>Tasks</span></div><div class="card stat-card"><strong>${Number(p.file_count||0)+Number(p.artifact_count||0)}</strong><span>Files + outputs</span></div><div class="card stat-card"><strong>${Number(p.memory_count||0)}</strong><span>Memories</span></div></div>
      <div class="panel"><div class="panel-head"><h2>Next tasks</h2><button class="text-gold" data-project-section="TASKS">Manage ›</button></div><div class="task-list">${open.length?open.map(taskHtml).join(''):`<div class="empty-mini">No open tasks.</div>`}</div></div>
      <div class="panel"><div class="panel-head"><h2>Recent project material</h2><button class="text-gold" data-project-section="FILES">Open files ›</button></div>${projectFiles.length||projectArtifacts.length?`<div class="output-list">${[...projectArtifacts.map(a=>({...a,kind:'artifact'})),...projectFiles.map(f=>({...f,kind:'file'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6).map(outputItem).join('')}</div>`:`<div class="empty-mini">No project files or outputs yet.</div>`}</div>
    </div>
    <aside class="project-side-stack"><div class="panel project-context-card"><div class="eyebrow">GOAL</div><p class="overview-goal">${esc(p.goal||'Add a clear goal so Zeus and Olympus know what success means.')}</p><div class="context-meta"><span>Status</span><strong>${esc(String(p.status||'IN_PROGRESS').replaceAll('_',' '))}</strong></div></div></aside>
  </div>`;
}
function projectTasksView(){
  return `<div class="project-single-column"><div class="panel"><div class="panel-head"><div><h2>Project tasks</h2><p class="muted tiny">Completing tasks updates project progress automatically.</p></div><span class="eyebrow">${state.tasks.length} TOTAL</span></div><form id="task-form" class="task-create-rich"><input id="task-title" placeholder="Add a task…" required><select id="task-priority"><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="LOW">Low</option></select><input id="task-due" type="date"><button class="primary compact">Add task</button></form><div class="task-list full">${state.tasks.length?state.tasks.map(taskHtml).join(''):`<div class="empty-mini">No tasks yet. Add the first one.</div>`}</div></div></div>`;
}
function projectFilesView(){
  const p=state.currentProject;
  const projectFiles=state.files.filter(f=>f.project_id===p.id);
  const projectArtifacts=state.artifacts.filter(a=>a.project_id===p.id);
  const all=[...projectArtifacts.map(a=>({...a,kind:'artifact'})),...projectFiles.map(f=>({...f,kind:'file',type:(f.mime_type||'file').split('/').pop()}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const more=Boolean(state.filesPage?.hasMore||state.artifactsPage?.hasMore);
  return `<div class="project-single-column"><div class="panel"><div class="panel-head"><div><h2>Files & outputs</h2><p class="muted tiny">Anything uploaded here is automatically attached to this project's context.</p></div><button class="primary compact" id="upload-project-file">${icon('plus')} Upload</button></div>${all.length?`<div class="output-list">${all.map(outputItem).join('')}</div>`:`<div class="empty-mini">No files or generated outputs yet.</div>`}${more?'<div class="history-more"><button class="secondary compact" id="load-older-outputs">Load older</button></div>':''}</div></div>`;
}
function projectMemoryView(){
  const policy=state.memoryPolicy;const policyText=policy?`At most ${Number(policy.maxItems||40)} approved memories are selected for each turn within a ${Math.round(Number(policy.maxChars||15000)/1000)}k-character memory budget. Explicit instructions and high-confidence items rank first, then recency.`:'Approved memory is selected deterministically by priority and recency within the AI context budget.';
  return `<div class="project-single-column"><div class="panel"><div class="panel-head"><div><h2>Permanent project memory</h2><p class="muted tiny">Saved here means durable project memory. ${esc(policyText)}</p></div><span class="eyebrow">${state.projectMemories.length} SAVED</span></div><form id="memory-form" class="memory-create"><textarea id="memory-content" rows="2" placeholder="Add a durable fact, preference, rule, or decision for this project…" required></textarea><button class="primary compact">Save memory</button></form><div class="memory-list">${state.projectMemories.length?state.projectMemories.map(memoryItem).join(''):`<div class="empty-mini">No permanent memories yet. You can add one here or tell Zeus “remember this…” inside the project chat.</div>`}</div></div></div>`;
}
function memoryItem(m){return `<article class="memory-item"><div class="memory-icon">${icon('memory')}</div><div><strong>${esc(m.type==='manual_note'?'Project memory':String(m.type||'Memory').replaceAll('_',' '))}</strong><p>${esc(m.content)}</p><small>${fmtDate(m.created_at)} · ${esc(m.source||'manual')}</small></div><button class="ghost danger memory-delete" data-memory-delete="${m.id}" title="Delete memory" aria-label="Delete this memory">${icon('close')}</button></article>`}
function taskHtml(t){const status=String(t.status||'TODO');const next=status==='TODO'?'IN_PROGRESS':status==='IN_PROGRESS'?'DONE':'TODO';const label=status==='TODO'?'Start task':status==='IN_PROGRESS'?'Mark task done':'Reopen task';const mark=status==='DONE'?icon('check'):status==='IN_PROGRESS'?'<span class="task-state-dot" aria-hidden="true"></span>':'';return `<div class="task-item"><button class="task-check ${status==='DONE'?'done':status==='IN_PROGRESS'?'in-progress':''}" data-task="${t.id}" data-status="${status}" data-next-status="${next}" aria-label="${label}: ${esc(t.title)}" title="${label}">${mark}</button><div><strong style="font-size:13px">${esc(t.title)}</strong><div class="muted tiny">${esc(status.replaceAll('_',' '))}${t.due_at?` · ${fmtDate(t.due_at)}`:''}</div></div><span class="priority ${esc(t.priority)}">${esc(t.priority)}</span></div>`}

function capabilityState(key,fallbackReady=false){const raw=state.health?.capabilityReadiness?.[key];if(raw==='observed_healthy')return {enabled:true,label:'READY'};if(raw==='configured_unverified')return {enabled:true,label:'CONFIGURED'};if(raw==='degraded')return {enabled:false,label:'DEGRADED'};return {enabled:Boolean(fallbackReady),label:fallbackReady?'READY':'COMING LATER'};}
function toolsView(){const h=state.health?.capabilities||{};const chat=capabilityState('chat',Boolean(h.chat));const images=capabilityState('imageGeneration',Boolean(h.imageGeneration));const tools=[
  ['web','Web Search','Current web retrieval with sources',icon('globe'),Boolean(h.webSearch),h.webSearch?'READY':'NOT CONFIGURED','Search the web for '],
  ['code','Code','Build and review code with explicit test status',icon('code'),chat.enabled,chat.label,'Build or review code for '],
  ['images','Images','Generate and edit with AI',icon('image'),images.enabled,images.label,'Create an image of '],
  ['documents','Documents','Create retained PDF, DOCX, PPTX and XLSX deliverables',icon('doc'),chat.enabled,chat.label,'Create a professional PDF about '],
  ['analysis','Source Review','Ground analysis in uploaded files and project context',icon('chart'),chat.enabled,chat.label,'Analyze the attached source and ground the findings in what it actually supports'],
  ['automation','Automation','Workflows and integrations',icon('auto'),false,'COMING LATER','']
];
  return `<section class="page tools-page">
    <div class="page-head tight"><div><h1>Tools & Capabilities</h1><p class="eyebrow">REAL CAPABILITIES. REAL OUTPUTS.</p></div><button class="text-gold" data-tab="Files">Explore All ></button></div>
    <div class="tool-grid">${tools.map(([kind,title,sub,ico,ok,label,prompt])=>`<button class="tool-card ${ok?'':'disabled'}" data-kind="${kind}" ${ok?`data-tool-prompt="${esc(prompt)}"`:'disabled aria-disabled="true"'}><div class="tool-ico">${ico}</div><div class="tool-copy"><strong>${title}</strong><span>${sub}</span></div><span class="tool-state">${esc(label)}</span><span class="chev">›</span></button>`).join('')}</div>
    <div class="panel">
      <div class="panel-head"><h2>Recent Outputs</h2><button class="text-gold" data-tab="Files">View All ></button></div>
      <p class="eyebrow dim">FILES STAY CONNECTED TO YOUR PROJECTS AND CHATS.</p>
      ${outputsList()}
    </div>
    <button class="panel library-card" data-tab="Files"><div class="tool-ico">${icon('folder')}</div><div><strong>Files & Library</strong><p>Upload, analyze, and keep everything in context across all your projects and conversations.</p></div><span class="chev">›</span></button>
  </section>`;
}
function outputsList(limit=12){let all=[...state.artifacts.map(a=>({...a,kind:'artifact'})),...state.files.map(f=>({...f,kind:'file',type:(f.mime_type||'file').split('/').pop()}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));if(Number.isFinite(limit))all=all.slice(0,limit);return all.length?`<div class="output-list">${all.map(outputItem).join('')}</div>`:`<div class="card" style="padding:24px"><strong>Your library starts with the first source or deliverable.</strong><p class="muted">Upload a source for analysis, or ask Zeus/Olympus to create a document, image, spreadsheet, presentation or ZIP.</p></div>`}
function outputItem(o){const tag=String(o.type||o.mime_type||'FILE').split('/').pop().toUpperCase().slice(0,4);const kind=o.kind==='artifact'?'artifact':'file';return `<article class="out-row"><div class="out-badge ${tag.toLowerCase()}">${esc(tag)}</div><div><strong>${esc(o.filename)}</strong><small>${fmtSize(o.size)} · ${new Date(o.created_at).toLocaleString()}</small></div><div class="out-actions"><a class="chev-link" href="${esc(o.downloadUrl)}" target="_blank" rel="noopener">Download</a><button class="icon-danger" type="button" data-delete-output="${kind}" data-output-id="${o.id}" aria-label="Delete ${kind}" title="Delete ${kind}">${icon('close')}</button></div></article>`}
function filesView(){const more=Boolean(state.filesPage?.hasMore||state.artifactsPage?.hasMore);return `<section class="page files-page"><div class="page-head"><div><div class="eyebrow">Files</div><h1>Files & Library</h1><p>Upload, analyze, and keep files and generated artifacts connected to your conversations and projects.</p></div><button class="primary" id="upload-files">${icon('plus')} Upload files</button></div><div class="project-tabs" style="margin-bottom:18px"><button class="active">All outputs</button></div>${outputsList(null)}${more?'<div class="history-more"><button class="secondary compact" id="load-older-outputs">Load older</button></div>':''}</section>`}
function settingsView(){const providers=state.health?.providerReadiness||{};const statusLabel=(v)=>String(v||'not_configured').toUpperCase().replaceAll('_',' ');const statusGood=(v)=>v==='observed_healthy';return `<section class="page"><div class="page-head"><div><div class="eyebrow">Settings</div><h1>Workspace settings</h1><p>Account and advanced runtime diagnostics.</p></div></div><div class="settings-grid"><article class="card settings-card"><h3>Account</h3><div class="user-chip"><div class="avatar">${esc(initials())}</div><div><strong>${esc(state.user?.user_metadata?.full_name||'Felipe')}</strong><div class="muted tiny">${esc(state.user?.email||'')}</div></div></div><button class="secondary" id="settings-logout" style="margin-top:18px">Lock</button></article><article class="card settings-card"><h3>AI provider diagnostics</h3><div class="diag-list">${['openai','anthropic','gemini','openrouter'].map(p=>{const v=providers[p]?.status||'not_configured';return `<div class="diag-row"><span>${p}</span><strong class="${statusGood(v)?'status-good':'status-warn'}">${esc(statusLabel(v))}</strong></div>`}).join('')}</div><p class="muted tiny" style="line-height:1.55;margin-top:14px">Diagnostics are runtime-local evidence. CONFIGURED UNVERIFIED means credentials/models were detected but this warm Function runtime has not observed a successful call yet. DEGRADED means the temporary circuit breaker is open.</p></article><article class="card settings-card"><h3>Capabilities</h3><div class="diag-list">${Object.entries(state.health?.capabilityReadiness||{}).map(([k,v])=>`<div class="diag-row"><span>${esc(k)}</span><strong class="${v==='observed_healthy'?'status-good':'status-warn'}">${esc(statusLabel(v))}</strong></div>`).join('')}</div></article></div></section>`}


let modalKeydownHandler=null;
let modalReturnFocus=null;
let modalPreviousOverflow='';
function clearModalLifecycle(){
  if(modalKeydownHandler){document.removeEventListener('keydown',modalKeydownHandler,true);modalKeydownHandler=null;}
  if(modalPreviousOverflow!==''){document.documentElement.style.overflow=modalPreviousOverflow;modalPreviousOverflow='';}
}
function closeModal({restoreFocus=true}={}){
  const root=$('#modal-root');if(root)root.innerHTML='';
  clearModalLifecycle();
  const target=modalReturnFocus;modalReturnFocus=null;
  if(restoreFocus&&target?.isConnected)requestAnimationFrame(()=>target.focus?.());
}
function showModal(markup,{initialFocus}={}){
  const root=$('#modal-root');if(!root)return null;
  clearModalLifecycle();modalReturnFocus=document.activeElement;modalPreviousOverflow=document.documentElement.style.overflow||'visible';document.documentElement.style.overflow='hidden';root.innerHTML=markup;
  const backdrop=$('.modal-backdrop',root),dialog=$('.modal',root);if(!dialog)return null;
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('tabindex','-1');
  backdrop?.addEventListener('click',e=>{if(e.target===backdrop)closeModal()});
  modalKeydownHandler=e=>{
    if(e.key==='Escape'){e.preventDefault();closeModal();return;}
    if(e.key!=='Tab')return;
    const focusable=$$('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',dialog).filter(el=>el.offsetParent!==null);
    if(!focusable.length){e.preventDefault();dialog.focus();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',modalKeydownHandler,true);
  requestAnimationFrame(()=>{const target=initialFocus?$(initialFocus,dialog):null;(target||$$('input,textarea,select,button',dialog).find(el=>!el.disabled)||dialog).focus();});
  return dialog;
}
function setModalError(message){const el=$('#modal-notice');if(!el)return;el.textContent=message||'';el.classList.toggle('hidden',!message);}

function appView(){const page=state.tab==='Home'?homeView():state.tab==='Projects'?projectsView():state.tab==='Tools'?toolsView():state.tab==='Files'?filesView():settingsView();return `<div class="app-shell">${sidebar()}<main class="main">${topbar()}${page}</main>${bottomNav()}<div id="modal-root"></div></div>`}
function render(){ clearModalLifecycle();modalReturnFocus=null;if(!state.authReady){app.innerHTML='<div style="min-height:100dvh;display:grid;place-items:center;color:#929ba8;letter-spacing:.2em">INITIALIZING ZEUS</div>';return;} app.innerHTML=state.user?appView():authView();bind(); requestAnimationFrame(()=>{const s=$('#chat-scroll');if(!s)return;if(state.chatRestore){const r=state.chatRestore;state.chatRestore=null;s.scrollTop=Math.max(0,s.scrollHeight-r.height+r.top);}else s.scrollTop=s.scrollHeight;}); }

function bind(){
  if(!state.user){ bindAuth(); return; }
  $('#hamburger')?.addEventListener('click',()=>{state.drawer=true;render()}); $('#scrim')?.addEventListener('click',()=>{state.drawer=false;state.chatsMenu=false;render()});
  $('#chats-menu')?.addEventListener('click',()=>{state.drawer=true;render()});
  $('#new-chat-top')?.addEventListener('click',newChat);
  $('#profile-avatar')?.addEventListener('click',()=>{state.tab='Settings';render()});
  $$('#logout,#settings-logout').forEach(b=>b.addEventListener('click',logout));
  $$('[data-tab]').forEach(b=>b.addEventListener('click',async()=>{
    const next=b.dataset.tab;state.drawer=false;
    if(next==='Home' && state.currentProject){
      state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.error='';
      history.replaceState({},'',location.pathname);
    }
    state.tab=next;
    try{
      if(state.tab==='Projects'){await loadProjects();if(state.currentProject?.id)await hydrateProjectWorkspace(state.currentProject.id,{loadConversation:false});else state.tasks=[];}
      if(state.tab==='Files')await Promise.all([loadFiles(),loadArtifacts()]);
      if(state.tab==='Tools')await Promise.all([loadHealth(),loadFiles(),loadArtifacts()]);
      if(state.tab==='Settings')await loadHealth();
    }catch(err){
      console.error(`Could not load ${next}`,err);
      state.error=err?.message||`Could not load ${next}.`;
    }
    render();resetViewport();
  }));
  $('#new-chat')?.addEventListener('click',newChat);
  $('#chat-search')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();$$('.recent-item').forEach(x=>x.style.display=x.textContent.toLowerCase().includes(q)?'block':'none')});
  $$('[data-conv]').forEach(b=>b.addEventListener('click',()=>openConversation(b.dataset.conv)));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;render()}));
  $$('.quick-prompts button').forEach(b=>b.addEventListener('click',()=>{const t=$('#composer-text');if(!t)return;t.value=b.dataset.prompt;t.dispatchEvent(new Event('input',{bubbles:true}));t.focus()}));
  $('#composer')?.addEventListener('submit',sendMessage); const composerText=$('#composer-text');composerText?.addEventListener('input',()=>{composerText.style.height='auto';composerText.style.height=`${Math.min(160,Math.max(26,composerText.scrollHeight))}px`;});composerText?.addEventListener('keydown',()=>{});
  $('#attach')?.addEventListener('click',()=>{state.attachMenu=!state.attachMenu;render()}); $('#upload-files')?.addEventListener('click',()=>$('#global-file-input').click());
  $('#attach-media')?.addEventListener('click',()=>$('#global-media-input').click()); $('#attach-camera')?.addEventListener('click',()=>$('#global-camera-input').click()); $('#attach-file')?.addEventListener('click',()=>$('#global-file-input').click());
  const handleUpload=async e=>{const files=[...e.target.files];e.target.value='';state.attachMenu=false;for(const f of files)await uploadFile(f);};
  $('#global-file-input').onchange=handleUpload; $('#global-media-input').onchange=handleUpload; $('#global-camera-input').onchange=handleUpload;
  $$('[data-remove-file]').forEach(b=>b.addEventListener('click',()=>{state.attachedFiles=state.attachedFiles.filter(f=>f.id!==b.dataset.removeFile);render()}));
  $('#voice')?.addEventListener('click',startVoice);
  $('#retry-last')?.addEventListener('click',retryLastMessage);
  $('#load-older-messages')?.addEventListener('click',loadOlderMessages);
  $('#load-older-outputs')?.addEventListener('click',loadOlderOutputs);
  $('#create-project')?.addEventListener('click',projectModal); $('#create-project-empty')?.addEventListener('click',projectModal);
  $$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.projectFilter=b.dataset.filter;render()}));
  $$('[data-project]').forEach(b=>{b.addEventListener('click',()=>openProjectWorkspace(b.dataset.project));b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProjectWorkspace(b.dataset.project);}});});
  $$('[data-project-section]').forEach(b=>b.addEventListener('click',async()=>{state.projectSection=b.dataset.projectSection;if(state.projectSection==='MEMORY'&&state.currentProject)await loadMemories(state.currentProject.id);render();resetViewport()}));
  $('#edit-project')?.addEventListener('click',projectEditModal);
  $('#back-projects')?.addEventListener('click',async()=>{state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.projectMemories=[];state.memoryPolicy=null;state.projectSection='CHAT';state.messagePage={hasMore:false,nextCursor:null};state.tasks=[];state.error='';history.replaceState({},'',location.pathname);render()});
  $('#task-form')?.addEventListener('submit',createTask); $$('[data-task]').forEach(b=>b.addEventListener('click',()=>toggleTask(b.dataset.task,b.dataset.status)));
  $('#memory-form')?.addEventListener('submit',createMemory); $$('[data-memory-delete]').forEach(b=>b.addEventListener('click',()=>deleteMemory(b.dataset.memoryDelete)));
  $$('[data-delete-output]').forEach(b=>b.addEventListener('click',()=>deleteOutput(b.dataset.deleteOutput,b.dataset.outputId)));
  $('#delete-project')?.addEventListener('click',deleteCurrentProject);
  $('#upload-project-file')?.addEventListener('click',()=>$('#global-file-input').click());
  $$('[data-tool-prompt]').forEach(b=>b.addEventListener('click',()=>{state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.messagePage={hasMore:false,nextCursor:null};state.error='';state.tab='Home';history.replaceState({},'',location.pathname);render();setTimeout(()=>{const t=$('#composer-text');if(t){t.value=b.dataset.toolPrompt;t.focus()}},0)}));
}
function bindAuth(){
  const form=$('#auth-form');
  form?.addEventListener('submit',async e=>{
    e.preventDefault();const notice=$('#auth-notice');notice.classList.add('hidden');$('#auth-submit').disabled=true;
    try{await unlock($('#auth-key').value);render();}
    catch(err){clearAuth();notice.textContent=err.message||'Could not unlock Zeus.';notice.className='notice error-notice';}
    finally{if($('#auth-submit'))$('#auth-submit').disabled=false;}
  });
}

async function newChat(){
  state.currentConversation=null;state.currentProject=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];
  state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.messagePage={hasMore:false,nextCursor:null};
  state.tab='Home';state.drawer=false;state.chatsMenu=false;history.replaceState({},'',location.pathname);render();resetViewport();
}
async function openConversation(id,doRender=true){
  try{
    const d=await api(`/api/chat?conversationId=${encodeURIComponent(id)}&limit=60`);
    state.currentConversation=id;
    state.currentProject=state.projects.find(p=>p.id===d.conversation?.project_id)||null;
    if(state.currentProject){
      await hydrateProjectWorkspace(state.currentProject.id,{loadConversation:false});
    }else{
      await Promise.all([loadFiles(),loadArtifacts()]);
    }
    state.files=mergeById(state.files,d.files||[]);
    const fileIndex=Object.fromEntries((state.files||[]).map(f=>[f.id,f]));
    state.messages=(d.messages||[]).map(m=>({...m,
      artifacts:(d.artifacts||[]).filter(a=>m.metadata?.artifacts?.includes?.(a.id)),
      attachments:(m.metadata?.attachments||[]).map(fid=>(typeof fid==='object'?fid:fileIndex[fid]||{id:fid,filename:'Attached file'}))
    }));
    state.chatArtifacts=d.artifacts||[];
    state.artifacts=mergeById(state.artifacts,d.artifacts||[]);
    state.messagePage={hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
    state.tab=state.currentProject?'Projects':'Home';state.drawer=false;state.chatsMenu=false;
    history.replaceState({},'',state.currentProject?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${id}`);
    if(doRender){render();resetViewport();}
  }catch(e){state.error=e.message;if(doRender)render();}
}
async function loadOlderMessages(){
  if(!state.currentConversation||!state.messagePage?.hasMore||!state.messagePage?.nextCursor)return;
  const scroll=$('#chat-scroll');const restore=scroll?{height:scroll.scrollHeight,top:scroll.scrollTop}:null;
  try{
    const d=await api(`/api/chat?conversationId=${encodeURIComponent(state.currentConversation)}&limit=60&before=${encodeURIComponent(state.messagePage.nextCursor)}`);
    state.files=mergeById(state.files,d.files||[]);
    state.chatArtifacts=mergeById(state.chatArtifacts,d.artifacts||[]);
    const fileIndex=Object.fromEntries((state.files||[]).map(f=>[f.id,f]));
    const artifactIndex=new Map((state.chatArtifacts||[]).map(a=>[a.id,a]));
    const incoming=(d.messages||[]).map(m=>({...m,
      artifacts:(m.metadata?.artifacts||[]).map(id=>artifactIndex.get(id)).filter(Boolean),
      attachments:(m.metadata?.attachments||[]).map(fid=>(typeof fid==='object'?fid:fileIndex[fid]||{id:fid,filename:'Attached file'}))
    }));
    const existing=new Set(state.messages.map(m=>m.id));
    state.messages=[...incoming.filter(m=>!existing.has(m.id)),...state.messages];
    state.messagePage={hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
    if(restore)state.chatRestore=restore;
    render();
  }catch(error){state.error=error.message||'Could not load older messages.';render();}
}
async function loadOlderOutputs(){
  const projectId=state.tab==='Projects'&&state.currentProject?.id?state.currentProject.id:null;
  try{
    await Promise.all([
      state.filesPage?.hasMore?loadFiles(projectId,{append:true}):Promise.resolve(),
      state.artifactsPage?.hasMore?loadArtifacts(projectId,{append:true}):Promise.resolve(),
    ]);
    render();
  }catch(error){state.error=error.message||'Could not load older files.';render();}
}

async function sendMessage(e){
  e.preventDefault();
  const text=$('#composer-text')?.value.trim()||'';
  if(!text||state.sending)return;
  await sendText(text,[...state.attachedFiles]);
}
async function sendText(text,pendingAttachments=[],requestId=crypto.randomUUID()){
  if(!text||state.sending)return;
  const pending=[...(pendingAttachments||[])];
  const optimistic={id:crypto.randomUUID(),role:'user',mode:state.mode,content:text,artifacts:[],attachments:pending};
  state.messages.push(optimistic);
  state.attachedFiles=[];
  state.sending=true;state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;
  state.execStatus=state.mode==='OLYMPUS'?'Assembling the Olympus team…':'Executing your request…';render();
  const timer=setTimeout(()=>{
    state.execStatus=state.mode==='OLYMPUS'?'Specialists working — Director review next…':'Selecting intelligence, tools and execution path…';render();
  },1400);
  try{
    const d=await api('/api/chat',{method:'POST',body:JSON.stringify({
      conversationId:state.currentConversation,
      projectId:state.currentProject?.id||null,
      mode:state.mode,
      content:text,
      fileIds:pending.map(f=>f.id),
      requestId
    }),requestId});
    state.currentConversation=d.conversationId;
    history.replaceState({},'',state.currentProject?.id?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${d.conversationId}`);
    if(d.userMessage){
      const idx=state.messages.findIndex(m=>m.id===optimistic.id);
      if(idx>=0)state.messages[idx]={...d.userMessage,attachments:pending,artifacts:[]};
    }
    if(d.message)state.messages.push({...d.message,artifacts:d.artifacts||[]});
    state.execStatus='Completed';
    const scopeProjectId=state.currentProject?.id||null;
    await Promise.allSettled([loadConversations(),loadFiles(scopeProjectId),loadArtifacts(scopeProjectId),loadProjects()]);
    setTimeout(()=>{state.execStatus='';render()},900);
  }catch(err){
    state.error=err.message||'Request failed.';
    state.execStatus='';
    state.lastFailedText=text;
    state.lastFailedMessageId=optimistic.id;
    state.lastFailedAttachments=pending;
    state.lastFailedRequestId=requestId;
  }finally{clearTimeout(timer);state.sending=false;render();}
}
async function retryLastMessage(){
  if(!state.lastFailedText||state.sending)return;
  const text=state.lastFailedText;
  const pending=[...state.lastFailedAttachments];
  const requestId=state.lastFailedRequestId||crypto.randomUUID();
  if(state.lastFailedMessageId)state.messages=state.messages.filter(m=>m.id!==state.lastFailedMessageId);
  state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;render();
  await sendText(text,pending,requestId);
}
async function uploadFile(file){
  if(file.size>4*1024*1024){state.error=`${file.name} is over the current 4 MB safe upload limit.`;render();return;}
  state.execStatus=`Uploading ${file.name}…`;render();
  try{
    const fd=new FormData();fd.append('file',file);
    const inProjectWorkspace=state.tab==='Projects'&&Boolean(state.currentProject?.id);
    if(inProjectWorkspace)fd.append('projectId',state.currentProject.id);
    if((inProjectWorkspace||state.tab==='Home')&&state.currentConversation)fd.append('conversationId',state.currentConversation);
    const d=await api('/api/files',{method:'POST',body:fd});
    state.attachedFiles.push(d.file);await loadFiles(inProjectWorkspace?state.currentProject.id:null);
    state.execStatus=d.file.extracted?'File uploaded and ready for analysis.':'File uploaded. It will remain available as a binary artifact.';
  }catch(e){state.error=e.message;state.execStatus='';}
  finally{render();setTimeout(()=>{state.execStatus='';render()},1200)}
}
async function startVoice(){
  if(state.voiceBusy&&state.voiceRecognition){try{state.voiceRecognition.stop()}catch{}return;}
  if(state.recording&&state.voiceRecorder){try{state.voiceRecorder.stop()}catch{}return;}

  // Prefer native browser speech recognition on iOS/Safari/Chrome. This avoids
  // pretending Netlify AI Gateway exposes audio transcription models when it does not.
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){
    try{
      const r=new SR();
      state.voiceRecognition=r;state.voiceBusy=true;state.error='';state.execStatus='Listening…';
      r.lang=navigator.language||'pt-BR';r.interimResults=false;r.continuous=false;r.maxAlternatives=1;
      r.onresult=async e=>{
        const text=e.results?.[0]?.[0]?.transcript?.trim();
        state.voiceBusy=false;state.voiceRecognition=null;state.execStatus='';render();
        if(text) await sendText(text,[]); else {state.error='No speech was detected.';render();}
      };
      r.onerror=e=>{
        state.voiceBusy=false;state.voiceRecognition=null;state.execStatus='';
        const code=String(e?.error||'');
        state.error=code==='not-allowed'||code==='service-not-allowed'
          ?'Microphone / speech recognition permission was denied for this site.'
          :'Voice recognition could not complete. Tap the mic and try again.';
        render();
      };
      r.onend=()=>{if(state.voiceRecognition===r){state.voiceBusy=false;state.voiceRecognition=null;state.execStatus='';render();}};
      r.start();render();return;
    }catch{}
  }

  // Fallback for browsers without SpeechRecognition: only record when the backend
  // explicitly reports a configured transcription endpoint. Do not record audio just
  // to send it to a gateway that cannot transcribe it.
  if(!state.health?.capabilities?.serverTranscription){
    state.error='Voice dictation is not available in this browser. Browser speech recognition is unavailable and server transcription is not configured for this deploy.';
    render();return;
  }
  if(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      const choices=['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/webm'];
      const mime=choices.find(x=>MediaRecorder.isTypeSupported?.(x))||'';
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      state.voiceStream=stream;state.voiceRecorder=recorder;state.voiceChunks=[];
      recorder.ondataavailable=e=>{if(e.data?.size)state.voiceChunks.push(e.data)};
      recorder.onerror=()=>{state.error='Voice recording failed. Check microphone permission.';cleanupVoice();render();};
      recorder.onstop=async()=>{
        clearTimeout(state.voiceStopTimer);
        const chunks=state.voiceChunks.slice();
        const type=recorder.mimeType||'audio/webm';
        cleanupVoice();
        if(!chunks.length){state.error='No voice audio was captured.';render();return;}
        state.voiceBusy=true;state.execStatus='Transcribing voice…';render();
        try{
          const blob=new Blob(chunks,{type});
          const ext=type.includes('mp4')||type.includes('aac')?'m4a':'webm';
          const fd=new FormData();fd.append('audio',blob,`voice-${Date.now()}.${ext}`);
          const d=await api('/api/transcribe',{method:'POST',body:fd});
          state.voiceBusy=false;state.execStatus='';render();
          if(d.text)await sendText(d.text,[]); else throw new Error('No speech was detected.');
        }catch(error){state.voiceBusy=false;state.execStatus='';state.error=error.message||'Voice transcription failed.';render();}
      };
      recorder.start(250);
      state.recording=true;state.error='';state.execStatus='Recording… tap the mic to stop';
      state.voiceStopTimer=setTimeout(()=>{if(state.recording&&state.voiceRecorder?.state==='recording')state.voiceRecorder.stop()},60000);
      render();return;
    }catch(error){
      state.error=error?.name==='NotAllowedError'?'Microphone permission was denied. Enable it for this site and try again.':'Could not start microphone recording.';
      render();return;
    }
  }

  state.error='Voice input is not supported by this browser.';render();
}
function cleanupVoice(){
  state.voiceStream?.getTracks?.().forEach(t=>t.stop());
  state.recording=false;state.voiceRecorder=null;state.voiceStream=null;state.voiceChunks=[];
  clearTimeout(state.voiceStopTimer);state.voiceStopTimer=null;
}
function projectModal(){
  showModal(`<div class="modal-backdrop" id="modal-bg"><div class="modal" aria-labelledby="project-modal-title"><div class="modal-head"><h2 id="project-modal-title">New project</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert" aria-live="assertive"></div><form id="project-form" class="form-grid"><div class="field"><label for="project-name">Name</label><input id="project-name" required maxlength="120" placeholder="Hercules Hub"></div><div class="field"><label for="project-goal">Goal</label><textarea id="project-goal" rows="3" placeholder="What should this project accomplish?"></textarea></div><div class="field"><label for="project-description">Description</label><textarea id="project-description" rows="3" placeholder="Optional context"></textarea></div><div class="modal-actions"><button type="button" class="secondary" id="modal-cancel">Cancel</button><button class="primary" id="project-submit">Create project</button></div></form></div></div>`,{initialFocus:'#project-name'});
  $('#modal-close').onclick=$('#modal-cancel').onclick=()=>closeModal();
  $('#project-form').addEventListener('submit',async e=>{
    e.preventDefault();setModalError('');const submit=$('#project-submit');submit.disabled=true;
    try{
      const d=await api('/api/projects',{method:'POST',body:JSON.stringify({name:$('#project-name').value,goal:$('#project-goal').value,description:$('#project-description').value})});
      closeModal({restoreFocus:false});await loadProjects();state.currentProject=state.projects.find(p=>p.id===d.project.id)||{...d.project};state.tab='Projects';state.projectSection='CHAT';await hydrateProjectWorkspace(state.currentProject.id);render();
    }catch(err){setModalError(err.message||'Could not create project.');submit.disabled=false;}
  });
}
async function loadProjectConversation(project){
  state.currentConversation=project?.conversation_id||null;
  state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.error='';state.messagePage={hasMore:false,nextCursor:null};
  if(!state.currentConversation)return;
  const d=await api(`/api/chat?conversationId=${encodeURIComponent(state.currentConversation)}&limit=60`);
  state.files=mergeById(state.files,d.files||[]);
  const fileIndex=Object.fromEntries((state.files||[]).map(f=>[f.id,f]));
  state.messages=(d.messages||[]).map(m=>({...m,
    artifacts:(d.artifacts||[]).filter(a=>m.metadata?.artifacts?.includes?.(a.id)),
    attachments:(m.metadata?.attachments||[]).map(fid=>(typeof fid==='object'?fid:fileIndex[fid]||{id:fid,filename:'Attached file'}))
  }));
  state.chatArtifacts=d.artifacts||[];
  state.messagePage={hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
}

function projectEditModal(){
  const p=state.currentProject;if(!p)return;
  showModal(`<div class="modal-backdrop" id="modal-bg"><div class="modal" aria-labelledby="project-edit-title"><div class="modal-head"><h2 id="project-edit-title">Edit project</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert" aria-live="assertive"></div><form id="project-edit-form" class="form-grid"><div class="field"><label for="edit-project-name">Name</label><input id="edit-project-name" required maxlength="120" value="${esc(p.name)}"></div><div class="field"><label for="edit-project-goal">Goal</label><textarea id="edit-project-goal" rows="4">${esc(p.goal||'')}</textarea></div><div class="field"><label for="edit-project-description">Description</label><textarea id="edit-project-description" rows="4">${esc(p.description||'')}</textarea></div><div class="field"><label for="edit-project-status">Status</label><select id="edit-project-status"><option value="IN_PROGRESS" ${p.status==='IN_PROGRESS'?'selected':''}>In progress</option><option value="PAUSED" ${p.status==='PAUSED'?'selected':''}>Paused</option><option value="COMPLETED" ${p.status==='COMPLETED'?'selected':''}>Completed</option></select></div><div class="modal-actions split-actions"><button type="button" class="secondary danger" id="delete-project">Delete project</button><div><button type="button" class="secondary" id="modal-cancel">Cancel</button><button class="primary" id="project-edit-submit">Save changes</button></div></div></form></div></div>`,{initialFocus:'#edit-project-name'});
  $('#modal-close').onclick=$('#modal-cancel').onclick=()=>closeModal();
  $('#delete-project').onclick=async()=>{closeModal({restoreFocus:false});await deleteCurrentProject();};
  $('#project-edit-form').addEventListener('submit',async e=>{
    e.preventDefault();setModalError('');const submit=$('#project-edit-submit');submit.disabled=true;
    try{
      await api('/api/projects',{method:'PATCH',body:JSON.stringify({id:p.id,name:$('#edit-project-name').value,goal:$('#edit-project-goal').value,description:$('#edit-project-description').value,status:$('#edit-project-status').value,progress:p.progress})});
      closeModal({restoreFocus:false});await loadProjects();state.currentProject=state.projects.find(x=>x.id===p.id)||state.currentProject;render();
    }catch(err){setModalError(err.message||'Could not update project.');submit.disabled=false;}
  });
}
async function createMemory(e){
  e.preventDefault();const content=$('#memory-content')?.value.trim();if(!content||!state.currentProject)return;
  try{await api('/api/memories',{method:'POST',body:JSON.stringify({projectId:state.currentProject.id,content})});await Promise.all([loadMemories(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render();}
}
async function deleteMemory(id){
  if(!id||!state.currentProject)return;if(!confirm('Delete this project memory?'))return;
  try{await api('/api/memories',{method:'DELETE',body:JSON.stringify({id})});await Promise.all([loadMemories(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render();}
}
async function hydrateProjectWorkspace(projectId,{loadConversation=true}={}){
  if(!projectId)return;
  await Promise.all([loadTasks(projectId),loadMemories(projectId),loadFiles(projectId),loadArtifacts(projectId)]);
  const refreshed=state.projects.find(p=>p.id===projectId);
  if(refreshed)state.currentProject=refreshed;
  if(loadConversation&&state.currentProject)await loadProjectConversation(state.currentProject);
}

async function deleteOutput(kind,id){
  if(!id||!['file','artifact'].includes(kind))return;
  const noun=kind==='artifact'?'artifact':'file';
  if(!confirm(`Delete this ${noun}? This cannot be undone.`))return;
  try{
    await api(kind==='artifact'?'/api/artifacts':'/api/files',{method:'DELETE',body:JSON.stringify({id})});
    if(kind==='artifact'){
      state.artifacts=state.artifacts.filter(x=>x.id!==id);
      state.chatArtifacts=state.chatArtifacts.filter(x=>x.id!==id);
      state.messages=state.messages.map(m=>({...m,artifacts:(m.artifacts||[]).filter(x=>x.id!==id)}));
    }else{
      state.files=state.files.filter(x=>x.id!==id);
      state.attachedFiles=state.attachedFiles.filter(x=>x.id!==id);
      state.messages=state.messages.map(m=>({...m,attachments:(m.attachments||[]).filter(x=>x.id!==id)}));
    }
    await loadProjects();
    if(state.currentProject?.id)state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;
    render();
  }catch(err){state.error=err.message||`Could not delete ${noun}.`;render();}
}

async function deleteCurrentProject(){
  const p=state.currentProject;if(!p)return;
  if(!confirm(`Delete “${p.name}” and its permanent chat, tasks, memory, files and artifacts? This cannot be undone.`))return;
  try{
    await api('/api/projects',{method:'DELETE',body:JSON.stringify({id:p.id})});
    state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.projectMemories=[];state.memoryPolicy=null;state.tasks=[];state.files=[];state.artifacts=[];state.projectSection='CHAT';state.messagePage={hasMore:false,nextCursor:null};state.error='';
    history.replaceState({},'',location.pathname);
    await Promise.all([loadProjects(),loadFiles(),loadArtifacts()]);
    state.tab='Projects';render();resetViewport();
  }catch(err){state.error=err.message||'Could not delete project.';render();}
}

async function openProjectWorkspace(projectId){
  try{
    const changing=state.currentProject?.id!==projectId;
    state.tab='Projects';state.drawer=false;state.chatsMenu=false;if(changing)state.projectSection='CHAT';
    state.currentProject=state.projects.find(p=>p.id===projectId)||null;
    if(!state.currentProject)return render();
    await hydrateProjectWorkspace(projectId);
    history.replaceState({},'',`/?project=${encodeURIComponent(projectId)}`);
  }catch(err){state.error=err.message||'Could not open project workspace.';}
  render();resetViewport();
}
async function createTask(e){e.preventDefault();const title=$('#task-title')?.value.trim();if(!title)return;const priority=$('#task-priority')?.value||'MEDIUM';const due=$('#task-due')?.value||'';const dueAt=due?new Date(`${due}T12:00:00`).toISOString():null;try{await api('/api/tasks',{method:'POST',body:JSON.stringify({projectId:state.currentProject.id,title,priority,dueAt})});await Promise.all([loadTasks(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render()}}
async function toggleTask(id,status){try{const currentId=state.currentProject?.id||null;const next=status==='TODO'?'IN_PROGRESS':status==='IN_PROGRESS'?'DONE':'TODO';await api('/api/tasks',{method:'PATCH',body:JSON.stringify({id,status:next})});await Promise.all([loadTasks(currentId),loadProjects()]);if(currentId)state.currentProject=state.projects.find(p=>p.id===currentId)||state.currentProject;render();}catch(err){state.error=err.message;render()}}

bootAuth();
