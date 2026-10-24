import { renderMarkdown } from './markdown.js';
import { localizeInterface, translateInterfaceText } from './locale-pt.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const app = $('#app');

const state = {
  user:null, authReady:false, attachMenu:false,
  tab:'Home', mode:'ZEUS', olympusAuto:false, activeMode:null, activeLevel:null, drawer:false,
  conversations:[], currentConversation:null, messages:[], chatArtifacts:[], sending:false, execStatus:'', error:'', bootstrapFailures:[],
  attachedFiles:[], projects:[], projectFilter:'ALL', currentProject:null, tasks:[],
  files:[], artifacts:[], health:null, recording:false,
  projectSection:'CHAT', projectMemories:[], projectSources:[], memoryPolicy:null,
  messagePage:{hasMore:false,nextCursor:null}, filesPage:{scope:'global',hasMore:false,nextCursor:null}, artifactsPage:{scope:'global',hasMore:false,nextCursor:null}, chatRestore:null,
  voiceBusy:false, voiceRecorder:null, voiceStream:null, voiceChunks:[], voiceStopTimer:null, voiceBytes:0, voiceHitSizeLimit:false, voiceSubmitRequested:false,
  liveTalk:false, liveTalkMinimized:false, liveTalkStopRequested:false, liveMuted:false, livePersona:'ZEUS', liveFailureKind:null, liveAgentConversation:null, liveAgentConversationId:'', liveAgentPartial:'', liveTextDraft:'', liveTextStatus:'', liveAgentPermissionStream:null, liveAgentLogQueue:Promise.resolve(), liveAgentLoggedEvents:new Map(), liveGeneration:0, liveRetryCount:0, liveStage:'idle', liveLocale:'auto', liveTalkVoiceId:'', voiceId:'marin', elevenLabsVoiceId:'', voiceStatus:null, voiceTesting:false, liveSpeechCache:null, voiceReplyAudio:null, liveAudioUrl:null, liveSpeechController:null, liveAudioUnlocked:false, liveSpeechUnlocked:false,
  messageFeedback:{}, messageAudioId:'', messageAudioBusyId:'', messageAudioUrl:null,
  voiceAvatar:'lightning', elevenLabsVoices:[], elevenLabsVoicesLoaded:false, elevenLabsVoicesLoading:false, elevenLabsVoicesError:'', elevenLabsVoicePageToken:'', elevenLabsVoiceHasMore:false,
  preferences:{personality:'balanced',instructions:''}, preferencesLoaded:false,
  googleSearchResults:{}, googleSearchQueries:{}, googleSearchBusy:null,
  draft:'', offline:typeof navigator!=='undefined'&&navigator.onLine===false,
  lastFailedText:'', lastFailedMessageId:null, lastFailedAttachments:[], lastFailedRequestId:null, lastFailedMode:null, lastFailedTurboApproval:null,lastFailedCompareType:null,compareType:null,
};
const privateBlobUrls=new Map();const PRIVATE_BLOB_CACHE_MAX=16;
function revokePrivateBlobUrls(){for(const entry of privateBlobUrls.values())try{URL.revokeObjectURL(entry?.url||entry)}catch{}privateBlobUrls.clear();}
function rememberPrivateBlob(key,url){if(privateBlobUrls.has(key)){const old=privateBlobUrls.get(key);try{URL.revokeObjectURL(old?.url||old)}catch{}privateBlobUrls.delete(key);}privateBlobUrls.set(key,{url,at:Date.now()});while(privateBlobUrls.size>PRIVATE_BLOB_CACHE_MAX){const first=privateBlobUrls.keys().next().value,old=privateBlobUrls.get(first);try{URL.revokeObjectURL(old?.url||old)}catch{}privateBlobUrls.delete(first);}}

const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtSize = n => { n=Number(n||0); if(n<1024)return `${n} B`; if(n<1048576)return `${(n/1024).toFixed(1)} KB`; return `${(n/1048576).toFixed(1)} MB`; };
const fmtDate = v => { if(!v)return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR',{month:'short',day:'numeric',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined}); };
const fmtDateTime = v => { if(!v)return ''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'}); };
const resetViewport = () => requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
const initials = () => (state.user?.user_metadata?.full_name || state.user?.email || 'O').trim().split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
async function bootAuth(){
  state.authReady=true;
  state.user={id:'zeus-personal-owner',user_metadata:{full_name:'Felipe'}};
  for(const key of ['olyhub.zeusproxy.access.v3','olyhub.zeusproxy.access.v2','olyhub.zeusproxy.access.session.v1']){
    try{localStorage.removeItem(key);sessionStorage.removeItem(key)}catch{}
  }
  render();
  try{await bootstrapApp();}catch(err){state.error=err.message||'Zeus could not load the workspace.';render();}
}

const LONG_REQUEST_DROP_MS=20000;
function apiError(message,status=0,code='',data=null){
  const error=new Error(message);error.status=status;error.code=code||'';error.data=data;return error;
}
async function api(path, options={}){
  const {requestId:optionRequestId,...fetchOptions}=options;
  const headers=new Headers(fetchOptions.headers||{});
  const apiRequestId=optionRequestId||crypto.randomUUID();
  headers.set('X-OlyHub-Request-ID',apiRequestId);
  if(fetchOptions.body && !(fetchOptions.body instanceof FormData) && !headers.has('Content-Type'))headers.set('Content-Type','application/json');
  let r;
  const startedAt=Date.now();
  setBusy(1);
  try{r=await fetch(path,{...fetchOptions,headers});}
  catch(networkError){
    if(networkError?.name==='AbortError')throw networkError;
    if(navigator.onLine===false)throw apiError('You are offline. Reconnect and try again.',0,'OFFLINE');
    const elapsed=Date.now()-startedAt;
    // A long request that drops is almost always the server's 60s function limit or iOS suspending the app, not the user's network.
    if(elapsed>=LONG_REQUEST_DROP_MS)throw apiError(`The connection closed after ${Math.round(elapsed/1000)}s while Zeus was still working — the request likely hit the server time limit, or the app went to the background. Tap Retry: a reply that finished will be recovered.`,0,'CONNECTION_INTERRUPTED');
    throw apiError('Connection to Zeus ended before the server returned an HTTP response. Your internet may still be fine; retry once, then check Runtime diagnostics if it repeats.',0,'NETWORK_ERROR');
  }finally{setBusy(-1);}
  const contentType=r.headers.get('content-type')||'';
  let data;
  try{data=contentType.includes('application/json')?await r.json():await r.text();}
  catch{data=null;if(r.ok)throw new Error('The server sent an unreadable response. Try again.');}
  if(!r.ok){
    const isJson=data&&typeof data==='object';
    let msg=isJson?(data.error||data.message||''):'';
    if(!isJson){
      // Non-JSON error bodies come from the platform (gateway timeout / function crash), never from Zeus itself.
      if([502,503,504].includes(r.status))msg=`Zeus's server timed out or stopped before replying (HTTP ${r.status}). Tap Retry: a reply that finished will be recovered.`;
      else if(typeof data==='string'&&data.trim()&&!/^\s*</.test(data))msg=data.slice(0,180);
    }
    const ref=isJson&&data.requestId?` · ref ${String(data.requestId).slice(0,18)}`:'';
    const code=isJson?data.code:'HTTP_ERROR';
    const friendly={AI_PROVIDER_AUTH:'AI Gateway/provider authentication failed for this runtime.',AI_PROVIDER_QUOTA:'AI Gateway credits or provider quota are exhausted.',AI_PROVIDER_RATE_LIMIT:'The selected AI provider is rate-limiting Zeus right now.',AI_MODEL_UNAVAILABLE:'A configured model is unavailable; Zeus could not complete fallback safely.',EXECUTION_DEADLINE:'The AI request exceeded Zeus’s execution budget before a provider completed it.',AI_PROVIDERS_FAILED:'No configured AI provider completed this request.',GITHUB_WRITE_NOT_CONFIGURED:'GitHub commit is not configured on the server yet.',GITHUB_AUTH_FAILED:'GitHub rejected the server credential. Update the GitHub token and try again.',GITHUB_WRITE_DENIED:'GitHub denied this commit. Check repository permission or branch protection.',GITHUB_SECRET_DETECTED:'The commit was blocked because a credential-like value was detected in the ZIP.',GITHUB_BRANCH_CONFLICT:'The target branch changed or rejected the safe non-force update.',GITHUB_CONFIRMATION_REQUIRED:'GitHub commit needs an explicit confirmation from this screen.',GITHUB_REPO_NOT_ALLOWED:'This repository is outside the configured allowlist.',TURBO_APPROVAL_REQUIRED:'Complex Turbo needs your approval before this higher-budget run starts.'}[code];
    throw apiError(`${friendly||msg||`Request failed (HTTP ${r.status}).`}${ref}`,r.status,code,isJson?data:null);
  }
  return data;
}

async function fetchPrivateBlob(url){
  const headers=new Headers();headers.set('X-OlyHub-Request-ID',crypto.randomUUID());
  const r=await fetch(url,{headers,cache:'no-store'});
  if(!r.ok){
    let data=null;try{data=await r.json()}catch{}
    throw apiError(data?.error||`Could not load private output (HTTP ${r.status}).`,r.status,data?.code||'PRIVATE_OUTPUT_FAILED',data);
  }
  return await r.blob();
}
async function privateObjectUrl(url){
  if(privateBlobUrls.has(url)){const entry=privateBlobUrls.get(url);privateBlobUrls.delete(url);privateBlobUrls.set(url,entry);return entry?.url||entry;}
  const blob=await fetchPrivateBlob(url),objectUrl=URL.createObjectURL(blob);rememberPrivateBlob(url,objectUrl);return objectUrl;
}
async function downloadPrivateOutput(url,filename='Zeus-Proxy-output'){
  const blob=await fetchPrivateBlob(url),objectUrl=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=objectUrl;a.download=filename||'Zeus-Proxy-output';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1500);
}
async function openPrivateOutput(url,filename='Zeus Proxy output',mime='application/octet-stream'){
  const blob=await fetchPrivateBlob(url),objectUrl=URL.createObjectURL(blob),type=blob.type||mime||'application/octet-stream';
  let body;if(type.startsWith('image/'))body=`<img class="private-preview-image" src="${objectUrl}" alt="${esc(filename)}">`;else if(type==='application/pdf')body=`<iframe class="private-preview-frame" src="${objectUrl}" title="${esc(filename)}"></iframe>`;else if(type==='text/html'){
    const source=(await blob.text()).slice(0,240000);
    const lockedCsp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
    body=`<p class="muted tiny">Isolated preview: scripts run inside a sandbox; network and parent-session access are blocked.</p><iframe class="private-preview-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="${esc(filename)}" srcdoc="${esc(lockedCsp+source)}"></iframe>`;
  }else if(type.startsWith('text/')||type.includes('json')||type.includes('csv')){const text=await blob.text();body=`<pre class="private-preview-text">${esc(text.slice(0,240000))}${text.length>240000?'\n[preview truncated]':''}</pre>`;}else body=`<div class="private-preview-generic">${icon('files')}<strong>${esc(filename)}</strong><p>This file is private. Use Download to save it to your device.</p></div>`;
  showModal(`<div class="modal-backdrop private-preview-backdrop"><section class="modal private-preview-modal"><header class="private-preview-head"><button class="secondary compact" id="private-preview-close" type="button">← Back</button><strong>${esc(filename)}</strong><button class="secondary compact" id="private-preview-download" type="button">Download</button></header><div class="private-preview-body">${body}</div></section></div>`,{initialFocus:'#private-preview-close',onClose:()=>URL.revokeObjectURL(objectUrl)});
  $('#private-preview-close')?.addEventListener('click',()=>closeModal());
  $('#private-preview-download')?.addEventListener('click',()=>downloadPrivateOutput(url,filename).catch(e=>{state.error=e.message;closeModal();render();}));
}
async function hydratePrivateImages(){
  const nodes=$$('[data-private-image]');
  await Promise.allSettled(nodes.map(async node=>{const url=node.dataset.privateImage;if(!url||node.src)return;try{node.src=await privateObjectUrl(url);node.classList.add('loaded');}catch{node.closest('.artifact-thumb-wrap')?.classList.add('thumb-failed');}}));
}

let inflightRequests=0;
function setBusy(delta){
  inflightRequests=Math.max(0,inflightRequests+delta);
  const busy=inflightRequests>0;
  document.documentElement.classList.toggle('is-busy',busy);
  app?.setAttribute('aria-busy',String(busy));
}
let lastAnnouncement='';
function announce(text){
  const region=document.getElementById('a11y-status');const value=translateInterfaceText(String(text||'').trim());
  if(!region||!value||value===lastAnnouncement)return;
  lastAnnouncement=value;region.textContent=value;
}
function dismissError(){state.error='';state.bootstrapFailures=[];state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.lastFailedMode=null;state.lastFailedTurboApproval=null;render();}
function errorBanner(extraClass=''){
  if(!state.error)return '';
  const bootstrapNotice=state.bootstrapFailures.length>0;
  const message=bootstrapNotice?'Workspace services need to reconnect.':state.error;
  const details=bootstrapNotice?`<details class="service-failure-details"><summary>Show affected services</summary><ul>${state.bootstrapFailures.map(item=>`<li><strong>${esc(item.name)}</strong>${item.message?`: ${esc(item.message)}`:''}</li>`).join('')}</ul></details>`:'';
  return `<div class="chat-error ${extraClass}"><div class="error-copy"><span>${esc(message)}</span>${details}</div><div class="error-actions">${bootstrapNotice?`<button type="button" id="retry-services">Retry services</button>`:''}${state.lastFailedBudgetExecutionId?`<button type="button" id="approve-olympus-five">Approve +$5</button>`:''}${state.lastFailedText?`<button type="button" id="retry-last">Try again</button>`:''}<button type="button" class="error-dismiss" data-dismiss-error aria-label="Dismiss message">${icon('close')}</button></div></div>`;
}
async function bootstrapApp(){
  state.authReady=true;state.bootstrapFailures=[];state.error='';render();
  const jobs=[
    ['Conversations',loadConversations()],
    ['Projects',loadProjects()],
    ['Files',loadFiles()],
    ['Artifacts',loadArtifacts()],
    ['Runtime diagnostics',loadHealth()],
    ['Personalization',loadPreferences()],
  ];
  const settled=await Promise.allSettled(jobs.map(([,promise])=>promise));
  settled.forEach((result,index)=>{if(result.status==='rejected'){const name=jobs[index][0],message=String(result.reason?.message||'').slice(0,180);state.bootstrapFailures.push({name,message});console.warn(`OlyHub bootstrap ${name} failed`,result.reason);}});
  if(state.bootstrapFailures.length)state.error='Some workspace services did not load. Retry services to try again.';
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
async function loadHealth(){ try{state.health=await api('/api/health');state.healthError=false;}catch(error){state.healthError=true;throw error;} }
async function loadTasks(projectId){ const d=await api(`/api/tasks?projectId=${encodeURIComponent(projectId)}`);state.tasks=d.tasks||[]; }
async function loadProjectSources(){
  if(!state.currentProject?.id){state.projectSources=[];return;}
  const d=await api(`/api/project-sources?projectId=${encodeURIComponent(state.currentProject.id)}`);
  state.projectSources=d.sources||[];
}
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
    'mic-off':svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6M3 3l18 18"/>'),
    send:svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    image:svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="m8 16 3-3 3 2 2-2 3 3"/>'),
    camera:svg('<path d="M7 7.5 8.5 5h7L17 7.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2z"/><circle cx="12" cy="13.5" r="3.2"/>'),
    doc:svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    chart:svg('<path d="M5 19V9M10 19V5M15 19v-7M20 19V8"/>'),
    globe:svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>'),
    code:svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13 5l-2 14"/>'),
    auto:svg('<path d="M12 8v4l2.5 1.5"/><circle cx="12" cy="12" r="8"/>'),
    close:svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    back:svg('<path d="m15 18-6-6 6-6M9 12h12"/>'),
    check:svg('<path d="m5 12 5 5 9-10"/>'),
    like:svg('<path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3ZM7 10l5-7c2 0 3 1 2 4l-1 3h6a2 2 0 0 1 2 2l-1 6a2 2 0 0 1-2 2H7"/>'),
    dislike:svg('<path d="M7 14V4H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3ZM7 14l5 7c2 0 3-1 2-4l-1-3h6a2 2 0 0 0 2-2l-1-6a2 2 0 0 0-2-2H7"/>'),
    speaker:svg('<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11"/>'),
    pause:svg('<path d="M8 5v14M16 5v14"/>'),
    folder:svg('<path d="M4 7h6l2 2h8v10H4z"/>'),
    memory:svg('<rect x="5" y="7" width="14" height="10" rx="2"/><path d="M8 7V5M16 7V5M8 19v-2M16 19v-2"/>'),
  };
  return map[name]||svg('<circle cx="12" cy="12" r="2"/>');
}

function sidebar(){
  const recents=homeChats().slice(0,18).map(c=>`<button class="recent-item ${c.id===state.currentConversation?'active':''}" data-conv="${esc(c.id)}" title="${esc(c.title)}" ${c.id===state.currentConversation?'aria-current="true"':''}>${esc(c.title||'Conversation')}</button>`).join('') || `<div class="muted tiny" style="padding:8px 10px">Home chats appear here. Project chats stay inside each project.</div>`;
  return `<aside class="sidebar ${state.drawer?'open':''}" id="app-sidebar" aria-label="Workspace navigation">
    <button type="button" class="close-navigation" id="close-navigation" aria-label="Fechar navegação">${icon('close')}</button>
    <div class="logo-row"><div class="personal-bolt small">ϟ</div><div><div class="logo-word">OLYMPUS HUB</div><div class="logo-sub">PERSONAL · ZEUS</div></div></div>
    <button class="new-chat" id="new-chat">${icon('chat')} <span><strong>New chat</strong><small class="muted" style="display:block;margin-top:2px">Start a clean execution</small></span></button>
    <div class="search-box" role="search">${icon('search')}<input id="chat-search" type="search" placeholder="Search chats" aria-label="Search chats" autocomplete="off"></div>
    <nav class="side-nav" aria-label="Primary">${navButtons()}</nav>
    <div class="side-section"><div class="side-title">Recent chats</div><div class="recent-list" id="recent-list">${recents}<div class="muted tiny recent-empty hidden" id="recent-empty" style="padding:8px 10px">No chats match your search.</div></div></div>
    <div class="sidebar-foot"><div class="user-chip"><div class="avatar">${esc(initials())}</div><div style="min-width:0"><strong style="font-size:12px">${esc(state.user?.user_metadata?.full_name||state.user?.email||'Felipe')}</strong><div class="muted tiny">Personal workspace</div></div></div></div>
  </aside>${state.drawer?'<button class="scrim" id="scrim" aria-label="Close menu"></button>':''}`;
}
function navButtons(){
  const items=[['Home','home','Home'],['Projects','projects','Projects'],['Tools','tools','Tools'],['Files','files','Files'],['Settings','settings','Settings']];
  return items.map(([tab,ico,label])=>`<button data-tab="${tab}" class="${state.tab===tab?'active':''}" ${state.tab===tab?'aria-current="page"':''}>${icon(ico)}<span>${label}</span></button>`).join('');
}
function homeChats(){ return (state.conversations||[]).filter(c=>!c.project_id); }
function projectChats(){ return (state.conversations||[]).filter(c=>c.project_id); }
function managerAgentStrip(){
  const projects=(state.projects||[]).filter(p=>p.status!=='COMPLETED');
  const chips=projects.slice(0,6).map(p=>`<button type="button" class="manager-agent-chip" data-project="${esc(p.id)}" aria-label="Open project ${esc(p.name)}"><span class="manager-agent-mark" aria-hidden="true">${esc((p.name||'P').trim().slice(0,1).toUpperCase())}</span><span class="manager-agent-copy"><strong>${esc(p.name)}</strong><small>${Number(p.progress||0)}% · ${Number(p.task_count||0)} open tasks</small></span><span class="manager-agent-status" aria-hidden="true"></span></button>`).join('');
  return `<section class="manager-panel" aria-labelledby="manager-title"><div class="manager-panel-head"><div><div class="eyebrow">PROJECTS</div><h1 id="manager-title">Projects</h1><p>Open a project to continue its work.</p></div><button type="button" class="secondary compact" id="create-project">＋ New project</button></div><div class="manager-agent-strip" aria-label="Your projects">${chips||`<div class="manager-empty">No projects yet. Create one to give a workstream its own chat, memory and files.</div>`}<button type="button" class="manager-all-agents" data-tab="Projects">All projects <span aria-hidden="true">›</span></button></div></section>`;
}
function homeAgentPanel(){
  const projects=(state.projects||[]).filter(p=>p.status!=='COMPLETED').slice(0,10);
  return `<aside class="home-agent-rail" aria-label="Workspace projects"><div class="home-rail-heading"><div><span class="eyebrow">WORKSPACE</span><h2>Projects</h2></div><span class="home-count">${projects.length}</span><button type="button" class="home-see-agents" data-tab="Projects">View all <span aria-hidden="true">›</span></button></div><button type="button" class="home-agent-search" data-tab="Projects">${icon('search')}<span>Browse projects</span><span aria-hidden="true">⌕</span></button><div class="home-agent-list">${projects.length?projects.map(p=>`<button type="button" class="home-agent-card" data-project="${esc(p.id)}"><span class="home-agent-avatar">${esc((p.name||'P').trim().slice(0,1).toUpperCase())}</span><span class="home-agent-info"><strong>${esc(p.name)}</strong><small>${Number(p.progress||0)}% progress · ${Number(p.task_count||0)} tasks</small></span><span class="home-agent-indicator" aria-hidden="true"></span></button>`).join(''):`<div class="home-rail-empty">No projects yet. Create a project to give a workstream its own chat and memory.</div>`}</div><button type="button" class="home-create-agent" id="home-create-project"><span aria-hidden="true">＋</span><span><strong>New project</strong><small>Start a project workspace</small></span></button></aside>`;
}
function homeContextPanel(){
  const artifacts=[...(state.artifacts||[])].filter(a=>!a.project_id).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,4);
  const memories=(state.projects||[]).filter(p=>Number(p.memory_count||0)>0).slice(0,5);
  return `<aside class="home-context-rail" aria-label="Workspace context"><section class="home-context-section"><div class="home-rail-heading"><div><span class="eyebrow">WORKSPACE</span><h2>Artifacts</h2></div><button type="button" class="home-view-link" data-tab="Files">View all <span aria-hidden="true">›</span></button></div><div class="home-artifact-list">${artifacts.length?artifacts.map(a=>`<button type="button" class="home-artifact-card" data-open-output="${esc(a.downloadUrl||'')}" data-output-name="${esc(a.filename||'Saved artifact')}" data-output-mime="${esc(a.mime_type||a.type||'application/octet-stream')}" ${a.downloadUrl?'':'disabled'}><span class="home-artifact-icon">${icon('doc')}</span><span class="home-artifact-copy"><strong>${esc(a.filename||'Saved artifact')}</strong><small>${esc(String(a.type||a.mime_type||'FILE').toUpperCase())} · ${fmtDateTime(a.created_at)||'Saved'}</small></span><span class="home-artifact-chevron" aria-hidden="true">›</span></button>`).join(''):`<div class="home-rail-empty">Saved outputs will appear here.</div>`}</div></section><section class="home-context-section home-memory-section"><div class="home-rail-heading"><div><span class="eyebrow">PERSISTENT CONTEXT</span><h2>Project memory</h2></div><span class="home-memory-mark">${icon('memory')}</span></div>${memories.length?`<div class="home-memory-list">${memories.map(p=>`<button type="button" class="home-memory-card" data-project="${esc(p.id)}"><span class="home-memory-copy"><strong>${esc(p.name)}</strong><small>${Number(p.memory_count||0)} saved ${Number(p.memory_count||0)===1?'memory':'memories'}</small></span><span aria-hidden="true">›</span></button>`).join('')}</div>`:`<div class="home-rail-empty">Memory stays with each project. Open a project to review its saved context.</div>`}</section></aside>`;
}
function homeMobileArtifacts(){
  const artifacts=[...(state.artifacts||[])].filter(a=>!a.project_id).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,8);
  return `<section class="home-mobile-artifacts" aria-labelledby="mobile-artifacts-title"><div class="mobile-artifacts-heading"><div><span class="eyebrow">SAVED OUTPUTS</span><h2 id="mobile-artifacts-title">Artifacts</h2></div><button type="button" data-tab="Files">See all <span aria-hidden="true">›</span></button></div>${artifacts.length?`<div class="mobile-artifact-track">${artifacts.map(a=>{const image=String(a.mime_type||'').startsWith('image/');return `<button type="button" class="mobile-artifact-card" data-open-output="${esc(a.downloadUrl||'')}" data-output-name="${esc(a.filename||'Saved artifact')}" data-output-mime="${esc(a.mime_type||a.type||'application/octet-stream')}" ${a.downloadUrl?'':'disabled'}>${image?`<img data-private-image="${esc(a.downloadUrl||'')}" alt="">`:`<span class="mobile-artifact-glyph">${esc(String(a.type||'FILE').toUpperCase().slice(0,4))}</span>`}<span class="mobile-artifact-name">${esc(a.filename||'Saved artifact')}</span></button>`}).join('')}</div>`:`<div class="mobile-artifacts-empty">Saved outputs from this chat will appear here.</div>`}</section>`;
}
function topbar(){
  const context=state.currentProject?.name||(state.tab==='Home'?(state.currentConversation?'Conversation':'Home'):state.tab);
  const hasHealth=Boolean(state.health);
  const chatReady=Boolean(state.health?.capabilities?.chat);
  const status=state.offline?'OFFLINE':chatReady?'READY':(hasHealth||state.healthError)?'LIMITED':'SYNCING';
  const tone=state.offline?'offline':chatReady?'ready':(hasHealth||state.healthError)?'limited':'syncing';
  const title=state.offline?'You are offline. Changes will fail until the connection returns.':state.healthError&&!hasHealth?'Runtime diagnostics did not load. Refresh to retry.':chatReady?'AI runtime and workspace services are available.':hasHealth?'Workspace loaded, but AI runtime is not fully available.':'Checking workspace runtime…';
  return `<header class="topbar">
    <button class="hamburger personal-more" aria-controls="app-sidebar" aria-expanded="${state.drawer}" id="hamburger" aria-label="Open navigation" title="Navigation">${icon('menu')}</button>
    <div class="topbar-context" aria-label="Current workspace"><span>${esc(state.currentProject?'PROJECT':'WORKSPACE')}</span><strong ${!state.currentProject&&!(state.tab==='Home'&&state.currentConversation)?'data-ui-label':''}>${esc(context)}</strong></div>
    <div class="brand-center"><div class="personal-bolt small">ϟ</div><div class="brand-copy"><span class="logo-word">OLYMPUS HUB</span><span class="logo-sub">PERSONAL · ZEUS</span></div></div>
    <div class="topbar-actions"><span class="system-indicator ${tone}" title="${esc(title)}" role="status" aria-label="${esc(`${status}: ${title}`)}"><i aria-hidden="true"></i>${status}</span><button class="avatar ghost" id="profile-avatar" aria-label="Open account settings">${esc(initials())}</button></div>
  </header>`;
}

function lastReply(messages=state.messages){return [...(messages||[])].reverse().find(m=>m.role==='assistant'&&(m.mode==='OLYMPUS'||m.mode==='ZEUS'))||null;}
function lastReplyMode(messages=state.messages){return lastReply(messages)?.mode||null;}
function syncActiveModeFromMessages(){const last=lastReply();state.activeMode=last?.mode||null;state.activeLevel=last?.metadata?.executionLevel||null;}
function liveMode(){return state.mode==='OLYMPUS'?'OLYMPUS':'ZEUS';}
function autoModeKey(){return 'zeus.olympusAuto.v1.'+(state.user?.id||'anonymous');}
function automaticOlympus(){try{return localStorage.getItem(autoModeKey())==='true';}catch{return state.olympusAuto===true;}}
function selectedZeusLevelCap(){try{const n=Number(localStorage.getItem('zeus.maxLevel.v1')||3);return [1,2,3].includes(n)?n:3;}catch{return 3;}}
function modeStrip(){
  const selected=liveMode();
  const level=selectedZeusLevelCap();
  return `<div class="mode-select-wrap"><div class="mode-strip" role="group" aria-label="Intelligence mode">
    <button type="button" class="mode-card zeus ${selected==='ZEUS'?'selected':''}" data-mode="ZEUS" aria-pressed="${selected==='ZEUS'}" ${state.sending?'disabled':''}><div class="mode-icon">${icon('auto')}</div><div><strong>Zeus</strong></div></button>
    <button type="button" class="mode-card olympus ${selected==='OLYMPUS'?'selected':''}" data-mode="OLYMPUS" aria-pressed="${selected==='OLYMPUS'}" ${state.sending?'disabled':''}><div class="mode-icon">${icon('globe')}</div><div><strong>Olympus</strong></div></button>
  </div><div class="mode-extra-controls"><label class="zeus-level-control" for="zeus-level-cap"><span>Zeus level</span><select id="zeus-level-cap" aria-label="Maximum Zeus level">${[[1,'1 · Specialist'],[2,'2 · Specialist + director'],[3,'3 · Full Zeus']].map(([n,label])=>`<option value="${n}" ${level===n?'selected':''}>${label}</option>`).join('')}</select></label><label class="olympus-auto-control" for="olympus-auto"><input type="checkbox" id="olympus-auto" ${automaticOlympus()?'checked':''}><span>Auto Olympus</span></label></div></div>`;
}

function homeView(){
  const isEmpty=!state.messages.length;
  const msgs=state.messages.map(m=>messageHtml(m)).join('');
  const exec=state.execStatus?`<div class="exec-card live" aria-hidden="true"><div class="exec-head"><span class="exec-pulse"></span><div><strong>${esc(state.execTitle||'Zeus is working')}</strong><div class="muted tiny">${esc(state.execStatus)}</div></div></div><div class="exec-foot">Live execution status — no simulated timings.</div></div>`:'';
  return `<section class="page chat-page home-workspace">
    <div class="home-chat-column">
    ${modeStrip()}
    <div class="chat-scroll" id="chat-scroll">
      ${isEmpty?`<div class="welcome"><div class="eyebrow">${state.currentProject?esc(state.currentProject.name):'ONE AI ENVIRONMENT. REAL RESULTS.'}</div><h1>Turn the request into a result.</h1><p>Tell Zeus what you need. Your work stays saved in this conversation.</p><div class="quick-prompts"><button data-prompt="Analyze the attached file and ground every important claim in the source. Call out anything the source does not support.">Review a source</button><button data-prompt="Create the next professional deliverable for this work and keep it connected to the conversation.">Create a deliverable</button><button data-prompt="Build this as runnable code. Include focused tests and tell me clearly which tests were not actually executed.">Build with tests</button><button data-prompt="Turn this goal into a project plan with clear tasks, risks, and milestones.">Plan a project</button></div></div>`:`${state.messagePage?.hasMore?'<div class="history-more"><button class="secondary compact" id="load-older-messages">Load older messages</button></div>':''}<div class="message-list">${msgs}</div>`}
      ${exec}
      ${errorBanner()}
    </div>
    ${composer()}
    </div>
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
  const compareArtifacts=(m.role==='assistant'&&m.metadata?.comparePair&&Array.isArray(m.artifacts)&&m.artifacts.length>=2)?m.artifacts.slice(0,2):[];
  const compareControls=compareArtifacts.length===2?`<div class="compare-pair-actions"><button type="button" data-compare-select="${esc(compareArtifacts[0].id)}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[0].type||'pdf')}">Choose A</button><button type="button" data-compare-select="${esc(compareArtifacts[1].id)}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[1].type||'pdf')}">Choose B</button><button type="button" data-compare-combine="${esc(compareArtifacts[0].id)}" data-compare-with="${esc(compareArtifacts[1].id)}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[0].type||'pdf')}">Combine into C</button><button type="button" data-compare-retry="${esc(m.execution_id||'')}" data-compare-type="${esc(m.metadata.compareType||compareArtifacts[0].type||'pdf')}">Try another pair</button></div>`:'';
  const attached=(m.attachments||[]).map(f=>`<span class="file-chip static">${icon('files')} ${esc(f.filename||f.name||'file')}</span>`).join('');
  const sources=safeSources(m);
  const sourceHtml=sources.length?`<div class="message-sources"><span>Sources</span><div>${sources.map((source,i)=>`<a href="${esc(source.url)}" target="_blank" rel="noreferrer noopener" title="${esc(source.title)}"><strong>${i+1}</strong><span>${esc(source.title)}</span></a>`).join('')}</div></div>`:'';
  const leadRaw=m.role==='assistant'&&m.metadata?.leadModel?String(m.metadata.leadModel):'';
  const lead=leadRaw.includes(':')?`${leadRaw.slice(0,leadRaw.indexOf(':'))} · ${leadRaw.slice(leadRaw.indexOf(':')+1)}`:leadRaw;
  const vision=m.metadata?.visionSummary,visionNote=vision?.skipped?`Vision ${Number(vision.analyzed||0)}/${Number(vision.attached||0)} images analyzed`:'';
  const capabilityNotes=(Array.isArray(m.metadata?.capabilities)?m.metadata.capabilities:[]).map(c=>c?.name==='github_repository'&&c?.status==='completed'?`GitHub ${Number(c.fileCount||0)}/${Number(c.treeEntries||0)} files sampled`:c?.name==='web_search'&&c?.status==='completed'?`Web ${Number(c.sourceCount||0)} sources`:c?.name==='google_gmail'&&c?.status==='completed'?`Gmail ${Number(c.itemCount||0)} messages`:c?.name==='google_calendar'&&c?.status==='completed'?`Calendar ${Number(c.itemCount||0)} events`:c?.name==='google_drive'&&c?.status==='completed'?`Drive ${Number(c.itemCount||0)} files`:null).filter(Boolean);
  const level=m.metadata?.executionLevel?String(m.metadata.executionLevel).replaceAll('_',' '):'';
  const phases=Array.isArray(m.metadata?.phases)?m.metadata.phases.slice(0,3):[];
  const phaseNote=phases.length?`Stages: ${phases.map(p=>`${String(p.label||'Stage')} ${String(p.state||'COMPLETED').toLowerCase()}${p.restored?' (resumed)':''}`).join(' → ')}`:'';
  const u=m.role==='assistant'&&m.metadata?.usage&&typeof m.metadata.usage==='object'?m.metadata.usage:null;
  // A missing provider field is unknown, not zero. Partial prices are *subtotals*
  // and can exclude web-search tool fees, failed calls and other unpriced usage.
  const fmt=(x)=>x===null||x===undefined||x===''?'unknown':Number(x).toLocaleString();
  const usd=(x)=>Number(x)>0&&Number(x)<0.000001?'less than US$0.000001':`US${Number(x).toFixed(6)}`;
  const costNote=u?.estimateCoverage==='full'&&u.estimatedUsd!=null
    ?`≈ ${usd(u.estimatedUsd)} estimated`
    :u?.estimatedUsd!=null
      ?`Known cost subtotal ≈ ${usd(u.estimatedUsd)}; actual cost unknown (unpriced models, usage or web fees)`
      :'Cost unknown (missing price, token usage or tool charges)';
  const usageNote=u?[`Calls ${fmt(u.callsUsed)}${u.maxCalls!=null?`/${fmt(u.maxCalls)}`:''}`,`Tokens in ${fmt(u.inputTokens)} · out ${fmt(u.outputTokens)} · total ${fmt(u.totalTokens)}`,...(Array.isArray(u.byRole)?u.byRole.slice(0,8).map(r=>`${String(r.role||'').replaceAll('_',' ')}: ${fmt(r.inputTokens)}/${fmt(r.outputTokens)}${r.outcome==='failure'?' (failed)':''}`):[]),costNote].join(' · '):'';
  const note=[level,m.metadata?.modeExplanation,m.metadata?.pipelineLabel,phaseNote,lead,m.metadata?.fallback?'fallback':'',m.metadata?.verificationLabel,visionNote,...capabilityNotes,usageNote].filter(Boolean).join(' · ');
  const speaker=m.role==='user'?'YOU':String(m.mode||'ZEUS').toUpperCase();
  const messageId=String(m.id||m.execution_id||'');
  const reaction=state.messageFeedback[messageId]||'';
  const activeMessageAudio=state.messageAudioId===messageId;
  const audioBusy=state.messageAudioBusyId===messageId;
  const messageActions=m.role==='assistant'&&messageId?`<div class="message-actions" aria-label="Rate or listen to this Zeus reply"><button type="button" class="message-action ${reaction==='up'?'selected':''}" data-message-feedback="up" data-message-id="${esc(messageId)}" aria-label="Approve this answer" aria-pressed="${reaction==='up'}" title="Useful"><span>${icon('like')}</span></button><button type="button" class="message-action ${reaction==='down'?'selected':''}" data-message-feedback="down" data-message-id="${esc(messageId)}" aria-label="Disapprove this answer" aria-pressed="${reaction==='down'}" title="Not useful"><span>${icon('dislike')}</span></button><button type="button" class="message-action message-speak ${activeMessageAudio?'selected':''}" data-message-speak="${esc(messageId)}" aria-label="${audioBusy?'Generating speech':activeMessageAudio?'Pause or resume reading':'Read answer aloud'}" title="${audioBusy?'Preparing voice…':activeMessageAudio?'Pause / resume':'Read aloud'}" ${audioBusy?'disabled':''}><span>${icon(audioBusy?'auto':activeMessageAudio&&state.messageAudioPlaying?'pause':'speaker')}</span></button>${audioBusy?'<span class="message-audio-status" role="status">Preparing voice…</span>':''}</div>`:'';
  return `<article class="message ${m.role==='user'?'user':'assistant'}"><div class="message-label">${m.role==='user'?'':`<span class="message-bolt" aria-hidden="true">⚡</span>`}<span>${esc(speaker)}</span></div><div class="message-body ${m.role==='assistant'?'markdown-body':''}">${m.role==='assistant'?renderMarkdown(m.content||''):esc(m.content||'')}</div>${messageActions}${note?`<details class="message-debug"><summary>Execution details</summary><div class="message-model">${esc(note)}</div></details>`:''}${sourceHtml}${attached?`<div class="attachments in-message">${attached}</div>`:''}${artifacts?`<div class="artifact-row">${artifacts}</div>`:''}${compareControls}</article>`;
}
function artifactCard(a){const tag=esc((a.type||'FILE').toUpperCase().slice(0,4)),url=esc(a.downloadUrl||''),name=esc(a.filename||'Zeus Proxy output'),mime=esc(a.mime_type||a.type||'application/octet-stream'),isImage=String(a.mime_type||'').startsWith('image/'),isZip=a.type==='zip'||/zip/i.test(a.mime_type||'')||String(a.filename||'').toLowerCase().endsWith('.zip'),git=Boolean(state.health?.capabilities?.githubCommit);return `<div class="artifact-card">${isImage?`<button type="button" class="artifact-thumb-wrap" data-open-output="${url}" data-output-name="${name}" data-output-mime="${mime}" aria-label="Open ${name}"><img class="artifact-thumb" data-private-image="${url}" alt=""></button>`:`<div class="out-badge">${tag}</div>`}<div><strong>${name}</strong><small>${fmtSize(a.size)} · ${mime}</small></div><div class="artifact-actions"><button type="button" data-open-output="${url}" data-output-name="${name}" data-output-mime="${mime}">Open</button><button type="button" class="ghost-a" data-download-output="${url}" data-output-name="${name}">Download</button>${isZip&&git?`<button type="button" class="ghost-a" data-github-commit="artifact" data-source-id="${esc(a.id)}" data-source-name="${name}">Commit</button>`:''}</div></div>`}
const LIVE_LOCALES={auto:'auto',pt:'pt-BR',en:'en-US',es:'es-ES'};
const VOICE_AVATARS=new Set(['lightning','classic','olympus','liquid']);
function initVoicePrefs(){
 try{const l=localStorage.getItem('zeus-live-locale');state.liveLocale=Object.prototype.hasOwnProperty.call(LIVE_LOCALES,l)?l:'auto';
 state.livePersona='ZEUS';try{localStorage.removeItem('zeus-live-persona')}catch{}
 const a=localStorage.getItem('zeus-voice-avatar');state.voiceAvatar=VOICE_AVATARS.has(a)?a:'lightning';
 const savedVoice=String(localStorage.getItem('zeus-voice-id')||'marin').toLowerCase();
 state.voiceId=['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar'].includes(savedVoice)?savedVoice:'marin';
 const customVoice=String(localStorage.getItem('zeus-elevenlabs-voice-id')||'').trim();state.elevenLabsVoiceId=/^[A-Za-z0-9_-]{2,120}$/.test(customVoice)?customVoice:'';}catch{}
 try{const liveVoice=String(localStorage.getItem('zeus-live-talk-voice-id')||'').trim();state.liveTalkVoiceId=liveVoice===''||/^[A-Za-z0-9_-]{2,120}$/.test(liveVoice)?liveVoice:'';}catch{}
 try{const saved=JSON.parse(localStorage.getItem('zeus-message-feedback.v1')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))state.messageFeedback=Object.fromEntries(Object.entries(saved).filter(([,v])=>v==='up'||v==='down').slice(-200));}catch{}
}
const ELEVENLABS_VOICE_PATTERN=/^[A-Za-z0-9_-]{2,120}$/;
const OPENAI_VOICE_NAMES=['alloy','ash','ballad','coral','echo','fable','nova','onyx','sage','shimmer','verse','marin','cedar'];
function storageGet(key){try{return localStorage.getItem(key)||''}catch{return ''}}
function storedElevenLabsVoiceId(){const v=storageGet('zeus-elevenlabs-voice-id').trim();return ELEVENLABS_VOICE_PATTERN.test(v)?v:'';}
function elevenLabsVoiceLabel(id){if(!id)return '';const voice=state.elevenLabsVoices.find(v=>v.voice_id===id);return voice?.name?`${voice.name} (${id})`:id;}
function setVoiceStatus(kind,text){state.voiceStatus={kind,text};announce(text);render();}
function persistVoicePrefs(openaiVoice,elevenLabsVoiceId){
  try{
    localStorage.setItem('zeus-voice-id',openaiVoice);
    if(elevenLabsVoiceId)localStorage.setItem('zeus-elevenlabs-voice-id',elevenLabsVoiceId);else localStorage.removeItem('zeus-elevenlabs-voice-id');
    return true;
  }catch{return false;}
}
function saveVoiceSettings({elevenLabsVoiceId,source='button'}={}){
  const openaiVoice=String($('#zeus-voice-preset')?.value||state.voiceId||'marin').toLowerCase();
  if(!OPENAI_VOICE_NAMES.includes(openaiVoice)){setVoiceStatus('error','Choose a supported OpenAI fallback voice.');return false;}
  const id=String(elevenLabsVoiceId||'').trim();
  if(id&&!ELEVENLABS_VOICE_PATTERN.test(id)){setVoiceStatus('error','Enter a valid ElevenLabs Voice ID (letters, numbers, hyphens, or underscores).');return false;}
  const stored=persistVoicePrefs(openaiVoice,id);
  state.voiceId=openaiVoice;state.elevenLabsVoiceId=id;state.error='';
  if(!stored)setVoiceStatus('error','Could not save the voice in this browser (storage is blocked). It only applies until you reload.');
  else setVoiceStatus('ok',id?`Voice saved: ${elevenLabsVoiceLabel(id)}`:'Voice removed.');
  return true;
}
function describeSpeechFailure(failure,status){
  const names={elevenlabs:'ElevenLabs',openai_gateway:'OpenAI TTS',gemini_gateway:'Gemini TTS'};
  const list=(Array.isArray(failure?.providerFailures)?failure.providerFailures:[]).filter(item=>names[item?.provider]&&Number.isInteger(Number(item?.status)));
  const part=item=>`${names[item.provider]} ${Number(item.status)}${item.detail?`: ${String(item.detail).slice(0,160)}`:''}`;
  const eleven=list.filter(item=>item.provider==='elevenlabs');
  const others=list.filter(item=>item.provider!=='elevenlabs');
  if(eleven.length){
    const backups=others.length?` Backup voices also failed (${others.map(part).join(', ')}).`:'';
    return `ElevenLabs voice failed — ${eleven.map(part).join(' → ')}.${backups}`.slice(0,420);
  }
  const base=String(failure?.error||`Voice providers are unavailable (HTTP ${status||'?'}).`).slice(0,240);
  return `${base}${others.length?` (${others.map(part).join(' → ')})`:''}`;
}
async function requestSpeechAudio(text,{elevenLabsVoiceId='',signal}={}){
  let res;
  try{
    res=await fetch('/api/speech',{method:'POST',headers:new Headers({'Content-Type':'application/json'}),signal,body:JSON.stringify({text,voiceId:state.voiceId||storageGet('zeus-voice-id')||'marin',elevenLabsVoiceId})});
  }catch(error){
    if(error?.name==='AbortError')throw error;
    const failed=new Error('Could not reach the voice service. Check your connection and try again.');failed.stage='fetch';throw failed;
  }
  if(!res.ok){
    const failure=await res.json().catch(()=>({}));
    const failed=new Error(describeSpeechFailure(failure,res.status));failed.stage='fetch';throw failed;
  }
  const blob=await res.blob();
  if(!blob.size){const failed=new Error('Voice provider returned empty audio.');failed.stage='fetch';throw failed;}
  return {blob,voiceFallback:res.headers.get('X-Zeus-Voice-Fallback')==='1'};
}
function setMessageFeedback(messageId,value){
  const next=state.messageFeedback[messageId]===value?'':value;
  if(next)state.messageFeedback[messageId]=next;else delete state.messageFeedback[messageId];
  try{localStorage.setItem('zeus-message-feedback.v1',JSON.stringify(Object.fromEntries(Object.entries(state.messageFeedback).slice(-200))));}catch{}
  render();
}
async function toggleMessageSpeech(messageId){
  const message=state.messages.find(item=>String(item.id||item.execution_id||'')===messageId&&item.role==='assistant');
  if(!message)return;
  if(state.liveTalk){state.error='Finish Live Talk before playing a separate reply aloud.';render();return;}
  const audio=state.voiceReplyAudio;
  if(state.messageAudioBusyId===messageId)return;
  if(state.messageAudioId===messageId&&audio){
    if(audio.paused){try{await audio.play();state.messageAudioPlaying=true;}catch(error){state.error=`Playback was blocked: ${error?.message||'tap the speaker again'}`;}}
    else{audio.pause();state.messageAudioPlaying=false;}
    render();return;
  }
  try{audio?.pause()}catch{}
  if(state.messageAudioUrl){URL.revokeObjectURL(state.messageAudioUrl);state.messageAudioUrl=null;}
  const replyAudio=audio||new Audio();state.voiceReplyAudio=replyAudio;
  state.messageAudioId='';state.messageAudioPlaying=false;state.messageAudioBusyId=messageId;state.error='';
  unlockLiveAudioFromGesture();render();
  try{
    const {blob}=await requestSpeechAudio(message.content||'',{elevenLabsVoiceId:state.elevenLabsVoiceId||storedElevenLabsVoiceId()});
    if(state.messageAudioBusyId!==messageId)return;
    state.messageAudioUrl=URL.createObjectURL(blob);replyAudio.src=state.messageAudioUrl;replyAudio.muted=false;replyAudio.volume=1;replyAudio.playsInline=true;
    replyAudio.onended=()=>{if(state.messageAudioId===messageId){state.messageAudioId='';state.messageAudioPlaying=false;if(state.messageAudioUrl)URL.revokeObjectURL(state.messageAudioUrl);state.messageAudioUrl=null;render();}};
    replyAudio.onerror=()=>{if(state.messageAudioId===messageId){state.messageAudioId='';state.messageAudioPlaying=false;state.error='Zeus voice audio could not be played. Try the speaker again.';render();}};
    state.messageAudioBusyId='';state.messageAudioId=messageId;
    await replyAudio.play();state.messageAudioPlaying=true;render();
  }catch(error){
    state.messageAudioBusyId='';state.messageAudioId='';state.messageAudioPlaying=false;
    state.error=`Could not read this answer aloud: ${error?.message||'voice service unavailable'}`;render();
  }
}
async function testElevenLabsVoice(){
  if(state.voiceTesting)return;
  const typed=String($('#elevenlabs-voice-id')?.value??state.elevenLabsVoiceId).trim();
  if(typed&&!ELEVENLABS_VOICE_PATTERN.test(typed)){setVoiceStatus('error','Enter a valid ElevenLabs Voice ID (letters, numbers, hyphens, or underscores).');return;}
  state.voiceTesting=true;
  unlockLiveAudioFromGesture();
  setVoiceStatus('info','Testing voice…');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
    const {blob,voiceFallback}=await requestSpeechAudio('Olá, eu sou o Zeus. Este é um teste de voz.',{elevenLabsVoiceId:typed,signal:controller.signal});
    const url=URL.createObjectURL(blob),audio=state.voiceReplyAudio||new Audio();
    state.voiceReplyAudio=audio;audio.muted=false;audio.volume=1;audio.playsInline=true;audio.src=url;
    audio.onended=()=>URL.revokeObjectURL(url);
    try{await audio.play();}catch{URL.revokeObjectURL(url);setVoiceStatus('error','The voice audio was generated, but the browser blocked playback. Tap Test voice again.');return;}
    setVoiceStatus(voiceFallback?'warn':'ok',voiceFallback?'The saved voice was rejected by ElevenLabs; the default voice was used.':'Voice test played.');
  }catch(error){
    setVoiceStatus('error',error?.name==='AbortError'?'Voice test timed out. Check the voice provider and try again.':`Voice test failed: ${String(error?.message||'unknown error').slice(0,360)}`);
  }finally{clearTimeout(timer);state.voiceTesting=false;render();}
}
async function loadElevenLabsVoices({append=false}={}){
 if(state.elevenLabsVoicesLoading)return;
 state.elevenLabsVoicesLoading=true;state.elevenLabsVoicesError='';if(!append)state.elevenLabsVoicePageToken='';render();
 try{
  const params=new URLSearchParams();if(append&&state.elevenLabsVoicePageToken)params.set('nextPageToken',state.elevenLabsVoicePageToken);
  const query=params.toString();const data=await api(`/api/speech/voices${query?`?${query}`:''}`);
  const incoming=Array.isArray(data?.voices)?data.voices:[];
  const merged=append?[...state.elevenLabsVoices,...incoming]:incoming;
  state.elevenLabsVoices=[...new Map(merged.map(v=>[v.voice_id,v])).values()];
  state.elevenLabsVoicePageToken=String(data?.nextPageToken||'');state.elevenLabsVoiceHasMore=Boolean(data?.hasMore&&state.elevenLabsVoicePageToken);state.elevenLabsVoicesLoaded=true;
 }catch(error){state.elevenLabsVoicesError=error.message||'Could not load ElevenLabs voices.';state.elevenLabsVoicesLoaded=true;}
 finally{state.elevenLabsVoicesLoading=false;render();}
}
function browserInputLocale(){const v=LIVE_LOCALES[state.liveLocale]||'auto';return v==='auto'?(navigator.language||'en-US'):v;}
function speechLocale(text=''){
 const v=LIVE_LOCALES[state.liveLocale]||'auto';if(v!=='auto')return v;
 const t=String(text||'');
 if(/[ãõçáâêôà]/i.test(t)||/\b(você|vocês|então|obrigado|não)\b/i.test(t))return 'pt-BR';
 if(/[ñ¿¡]/.test(t)||/\b(gracias|hola|usted|quiero|mañana)\b/i.test(t))return 'es-ES';
 return navigator.language||'en-US';
}

function voiceAvatarMarkup(){
 const kind=VOICE_AVATARS.has(state.voiceAvatar)?state.voiceAvatar:'lightning';
 return kind==='lightning'
 ? `<div class="zeus-voice-presence lightning ${state.liveTalk?'active':''} ${state.liveStage==='speaking'?'is-speaking':''}" aria-hidden="true"><img class="zeus-plasma-image" src="/zeus-plasma-orb-v1.webp" alt="" draggable="false"></div>`
 : `<div class="zeus-voice-presence ${kind} ${state.liveTalk?'active':''}" aria-hidden="true"><div class="zeus-voice-core"><span class="zeus-voice-symbol">●</span></div></div>`;
}
function discardLiveAudio({keepElement=false}={}){try{state.voiceReplyAudio?.pause()}catch{}if(!keepElement)state.voiceReplyAudio=null;
 if(state.liveAudioUrl){URL.revokeObjectURL(state.liveAudioUrl);state.liveAudioUrl=null;}}
let silentLiveAudioDataUrl='';
function unlockLiveAudioFromGesture(){
  try{
    if(!state.voiceReplyAudio)state.voiceReplyAudio=new Audio();
    const audio=state.voiceReplyAudio;
    audio.playsInline=true;audio.muted=true;
    if(!silentLiveAudioDataUrl){
      const dataBytes=1600,bytes=new Uint8Array(44+dataBytes),view=new DataView(bytes.buffer);
      const text=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
      text(0,'RIFF');view.setUint32(4,36+dataBytes,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,dataBytes,true);
      silentLiveAudioDataUrl=`data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
    }
    audio.src=silentLiveAudioDataUrl;
    const playing=audio.play();
    if(playing?.then)playing.then(()=>{audio.pause();audio.currentTime=0;audio.muted=false;state.liveAudioUnlocked=true;}).catch(()=>{audio.muted=false;});
  }catch{}
  try{
    if(window.speechSynthesis&&window.SpeechSynthesisUtterance){
      speechSynthesis.cancel();const unlock=new SpeechSynthesisUtterance(' ');unlock.volume=0;speechSynthesis.speak(unlock);state.liveSpeechUnlocked=true;
    }
  }catch{}
}
initVoicePrefs();
function liveTalkSupported(){return Boolean(navigator.mediaDevices?.getUserMedia&&(window.AudioContext||window.webkitAudioContext))}
function releaseLiveAgentPermissionStream(stream=state.liveAgentPermissionStream){
  if(!stream)return;
  for(const track of stream.getTracks())try{track.stop()}catch{}
  if(state.liveAgentPermissionStream===stream)state.liveAgentPermissionStream=null;
}
function voiceSupported(){
  return Boolean(state.health?.capabilities?.serverTranscription&&navigator.mediaDevices?.getUserMedia&&window.MediaRecorder);
}
async function attachSavedArtifact(artifactId){
 const artifact=state.artifacts.find(a=>a.id===artifactId);
 if(!artifact||((artifact.project_id||null)!==(state.currentProject?.id||null))){state.error='Artifact not in this workspace.';render();return;}
 try{
  state.execStatus='Preparing saved artifact…';render();
  const d=await api('/api/artifact-attach',{method:'POST',body:JSON.stringify({
   artifactId,projectId:state.currentProject?.id||null,conversationId:state.currentConversation||null
  })});
  state.attachedFiles.push(d.file);
  await loadFiles(state.currentProject?.id||null);
  state.execStatus='Saved artifact attached. Add instructions and send.';state.error='';
 }catch(error){state.error=error?.message||'Artifact could not be attached.';state.execStatus='';}
 render();
}
async function openHtmlEditor(artifactId){
 const artifact=state.artifacts.find(a=>a.id===artifactId&&a.type==='html');
 if(!artifact){state.error='HTML artifact unavailable in this workspace.';render();return;}
 try{
  const original=await(await fetchPrivateBlob(artifact.downloadUrl)).text();
  if(original.length>120000)throw Error('HTML editing limit exceeded.');
  showModal(`<div class="modal-backdrop private-preview-backdrop"><section class="modal private-preview-modal" aria-labelledby="html-edit-title"><header class="private-preview-head"><button id="html-edit-close" class="secondary compact" type="button">Back</button><strong id="html-edit-title">Edit ${esc(artifact.filename)} · v${artifact.version||1}</strong><button type="button" class="primary compact" id="html-edit-save">Save new version</button></header><div class="private-preview-body"><p class="muted tiny">Live sandbox preview. Saving creates a new artifact and preserves the original.</p><textarea id="html-edit-code" aria-label="HTML code" spellcheck="false" style="width:100%;min-height:230px;font:12px/1.5 monospace"></textarea><iframe id="html-edit-preview" class="private-preview-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" title="HTML preview"></iframe><p class="muted tiny" id="html-edit-message" role="status"></p></div></section></div>`,{initialFocus:'#html-edit-code'});
  const editor=$('#html-edit-code'),preview=$('#html-edit-preview');
  editor.value=original;
  const csp=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  const update=()=>{preview.srcdoc=csp+editor.value;};
  editor.addEventListener('input',update);update();
  $('#html-edit-close').onclick=()=>closeModal();
  $('#html-edit-save').onclick=async()=>{
   const button=$('#html-edit-save');button.disabled=true;
   try{
    const response=await api('/api/artifact-revise',{method:'POST',body:JSON.stringify({parentArtifactId:artifact.id,content:editor.value})});
    await loadArtifacts(state.currentProject?.id||null);
    closeModal();state.execStatus=`Saved independent revision v${response.artifact.version}.`;render();
   }catch(error){$('#html-edit-message').textContent=error.message||'Revision could not be saved.';button.disabled=false;}
  };
 }catch(error){state.error=error.message||'Could not load HTML.';render();}
}
function openCompareArtifacts(){
 const items=state.artifacts.filter(a=>(a.project_id||null)===(state.currentProject?.id||null));
 if(items.length<2){state.error='At least two saved artifacts are needed for comparison.';render();return;}
 const opts=items.map(a=>`<option value="${esc(a.id)}">${esc(a.filename)} (v${a.version||1})</option>`).join('');
 showModal(`<div class="modal-backdrop compare-evolve-backdrop"><div class="modal compare-evolve-modal" aria-labelledby="compare-title"><div class="compare-sheet-handle" aria-hidden="true"></div><div class="modal-head"><div><div class="eyebrow">ARTIFACT WORKSPACE</div><h2 id="compare-title">Compare &amp; Evolve</h2><p class="compare-subtitle">Choose two saved outputs, review their metadata, then pick one or ask Zeus to prepare a combined version.</p></div><button id="modal-close" class="ghost" type="button" aria-label="Close comparison">${icon('close')}</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert"></div><form id="compare-form" class="form-grid compare-pick-form"><label for="compare-a"><span class="compare-side-label left">A</span>Version A<select id="compare-a">${opts}</select></label><label for="compare-b"><span class="compare-side-label right">B</span>Version B<select id="compare-b">${opts}</select></label><button class="primary compare-run" type="submit">Compare saved outputs</button></form><div id="compare-results"></div></div></div>`,{initialFocus:'#compare-a'});
 $('#modal-close')?.addEventListener('click',()=>closeModal());$('#compare-b').selectedIndex=1;
 $('#compare-form')?.addEventListener('submit',e=>{
  e.preventDefault();const a=items.find(v=>v.id===$('#compare-a').value),b=items.find(v=>v.id===$('#compare-b').value);
  if(!a||!b||a.id===b.id){setModalError('Choose two different artifacts.');return;}
  $('#compare-results').innerHTML=`<div class="diag-list"><div class="diag-row">A: ${esc(a.filename)} <strong>${fmtSize(a.size)}</strong></div><div class="diag-row">B: ${esc(b.filename)} <strong>${fmtSize(b.size)}</strong></div></div><p class="muted tiny">Metadata comparison only; binary contents are not examined here.</p><div class="modal-actions"><button type="button" class="secondary" data-approve="${esc(a.id)}">Approve A</button><button type="button" class="secondary" data-approve="${esc(b.id)}">Approve B</button><button type="button" class="primary" id="compare-combine">Prepare C</button></div>`;
  $$('[data-approve]').forEach(el=>el.addEventListener('click',async()=>{
   const raw=prompt('Alias for approved artifact (example: approved_logo)');
   if(!raw)return;const alias=raw.trim().toLowerCase();
   if(!/^[a-z][a-z0-9_-]{1,63}$/.test(alias)){setModalError('Invalid alias. Use lowercase letters, numbers, _ or -.');return;}
   try{await api('/api/artifact-aliases',{method:'PUT',body:JSON.stringify({projectId:state.currentProject?.id||null,artifactId:el.dataset.approve,alias})});setModalError('');$('#compare-results').insertAdjacentHTML('beforeend',`<p class="muted tiny">Approved: ${esc(alias)}</p>`);}
   catch(error){setModalError(error.message||'Approval failed.');}
  }));
  $('#compare-combine')?.addEventListener('click',async()=>{
   closeModal();
   await attachSavedArtifact(a.id);if(state.error)return;
   await attachSavedArtifact(b.id);if(state.error)return;
   state.draft=`Create a new version C by comparing and combining the two saved attachments. A: ${a.filename}; B: ${b.filename}. Preserve both originals and state which source contents are actually analyzable. Output a NEW ${a.type===b.type?a.type:'zip'} file.`;
   state.tab=state.currentProject?'Projects':'Home';if(state.currentProject)state.projectSection='CHAT';render();$('#composer-text')?.focus();
  });
 });
}
function openSavedArtifactPicker(){
 const items=state.artifacts.filter(a=>(a.project_id||null)===(state.currentProject?.id||null));
 if(!items.length){state.error='No saved artifacts available in this workspace.';render();return;}
 const options=items.map(a=>`<option value="${esc(a.id)}">${esc(a.filename)} · v${Number(a.version||1)}</option>`).join('');
 showModal(`<div class="modal-backdrop"><div class="modal" aria-labelledby="saved-artifact-title"><div class="modal-head"><h2 id="saved-artifact-title">Use saved artifact</h2><button type="button" id="modal-close" class="ghost">Close</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert"></div><p class="muted tiny">This creates an independent attachment; your original is preserved.</p><form id="saved-artifact-form" class="form-grid"><label for="saved-artifact-select">Artifact</label><select id="saved-artifact-select">${options}</select><div class="modal-actions"><button type="submit" class="primary">Attach</button></div></form></div></div>`,{initialFocus:'#saved-artifact-select'});
 $('#modal-close')?.addEventListener('click',()=>closeModal());
 $('#saved-artifact-form')?.addEventListener('submit',async e=>{e.preventDefault();const id=$('#saved-artifact-select')?.value;closeModal();await attachSavedArtifact(id);});
}
function composer(){
  const composerMode=state.mode==='OLYMPUS'?'Olympus':'Zeus';
  const chips=state.attachedFiles.map(f=>`<span class="file-chip">${icon('files')} ${esc(f.filename)}<button type="button" data-remove-file="${esc(f.id)}" aria-label="Remove ${esc(f.filename)}" title="Remove attachment">${icon('close')}</button></span>`).join('');
  const showMic=voiceSupported();
  const scope=state.currentProject?`Project: ${esc(state.currentProject.name)}`:'This conversation';
  return `<div class="composer-shell">${state.liveTalk&&!state.liveTalkMinimized?`<div class="zeus-live-stage" role="status" aria-label="Live Talk active">${voiceAvatarMarkup()}<span class="${state.liveStage==='speaking'?'zeus-speaking-state':''}">${state.liveStage==='speaking'?'<span class="zeus-speaking-bolt" aria-hidden="true">⚡</span>':''}Live Talk · ${esc(state.liveTalkStopRequested?'Finishing this turn':state.liveStage==='speaking'?'Speaking':state.liveStage==='processing'?'Processing':state.liveStage==='listening'?'Listening':'Connected')} · ${esc(state.liveLocale==='auto'?'Device language':state.liveLocale.toUpperCase())}</span></div>`:''}${state.attachMenu?`<div class="attach-menu" role="menu" id="attach-menu" aria-label="Add attachment"><button type="button" role="menuitem" id="attach-media">${icon('image')}<span>Photo / Video</span></button><button type="button" role="menuitem" id="attach-camera">${icon('camera')}<span>Camera</span></button><button type="button" role="menuitem" id="attach-file">${icon('files')}<span>File</span></button><button type="button" role="menuitem" id="attach-saved">${icon('folder')}<span>Saved artifact</span></button></div>`:''}${chips?`<div class="attachments pending">${chips}</div>`:''}<form class="composer" id="composer"><button type="button" class="icon-btn attach-plus" id="attach" title="Add photo, video or file" aria-label="Add photo, video or file" aria-haspopup="menu" aria-expanded="${state.attachMenu}" ${state.attachMenu?'aria-controls="attach-menu"':''}>＋</button><textarea id="composer-text" rows="1" aria-label="Message ${composerMode}" placeholder="Message ${composerMode}…" ${state.sending?'disabled':''}>${esc(state.draft)}</textarea>${showMic?`<button type="button" class="icon-btn ${state.recording?'recording':''}" id="voice" title="${state.recording?'Stop and send audio to ElevenLabs Scribe':state.voiceBusy?'Transcribing with ElevenLabs Scribe…':'Record a voice message'}" aria-label="${state.recording?'Stop and send audio to ElevenLabs Scribe':state.voiceBusy?'Transcribing voice with ElevenLabs Scribe':'Record a voice message'}" ${state.voiceBusy?'disabled':''}>${icon('mic')}</button>`:''}${liveTalkSupported()?`<button type="button" class="icon-btn live-talk-trigger ${state.liveTalk?'active':''}" id="live-talk" aria-pressed="${state.liveTalk}" aria-label="${state.liveTalk?'Return to Live Talk':'Start Live Talk'}" title="${state.liveTalk?'Return to Live Talk':'Start Live Talk'}">⚡</button>`:''}<button type="submit" class="icon-btn send-btn" title="Send (Ctrl/⌘+Enter)" aria-label="Send message" ${state.sending?'disabled':''}>${icon('send')}</button></form><div class="composer-meta"><span>${state.currentProject?'Permanent Project chat · dedicated memory + files':'Conversation history available · no Project memory'}</span><span>Enter adds a new line · use the arrow to send</span></div></div>`;
}

function projectsView(){
  if(state.currentProject) return projectWorkspace();
  const projects=state.projects.filter(p=>state.projectFilter==='ALL'||(state.projectFilter==='COMPLETED'?p.status==='COMPLETED':p.status!=='COMPLETED'));
  const upcoming=state.tasks.filter(t=>t.status!=='DONE').slice(0,6);
  const projectSection=projects.length?`<div class="project-grid">${projects.map(projectCard).join('')}</div>`:`<div class="card" style="padding:44px;text-align:center;margin-top:18px"><div class="eyebrow">No projects yet</div><h2>Create your first project.</h2><p class="muted">Each project has its own conversation, tasks, files, artifacts and memory.</p><button class="primary" id="create-project-empty">${icon('plus')} New project</button></div>`;
  const tasksSection=upcoming.length?`<h2 class="section-title">Upcoming tasks</h2><div class="card" style="padding:14px"><div class="task-list">${upcoming.map(taskHtml).join('')}</div></div>`:'';
  return `<section class="page projects-page"><div class="page-head"><div><div class="eyebrow">PROJECTS</div><h1>Projects</h1><p>Each project keeps its own permanent chat, tasks, files, artifacts and memory.</p></div><button class="primary" id="create-project">${icon('plus')} New project</button></div><div class="project-tabs" role="group" aria-label="Filter projects">${[['ALL','All Projects'],['IN_PROGRESS','In Progress'],['COMPLETED','Completed']].map(([key,label])=>`<button type="button" data-filter="${key}" class="${state.projectFilter===key?'active':''}" aria-pressed="${state.projectFilter===key}">${label}</button>`).join('')}</div>${errorBanner('page-alert')}${projectSection}${tasksSection}</section>`;
}
function projectCard(p){const status=String(p.status||'IN_PROGRESS').replaceAll('_',' ');return `<article class="proj-row" data-project="${esc(p.id)}" tabindex="0" role="button" aria-label="Open project ${esc(p.name)}"><div class="proj-card-top"><div class="proj-thumb">${icon('folder')}</div><span class="proj-status ${esc(String(p.status||'IN_PROGRESS').toLowerCase())}">${esc(status)}</span></div><div class="proj-body"><strong>${esc(p.name)}</strong><span>${esc(p.description||p.goal||'OlyHub project')}</span><div class="progress"><span style="width:${Math.max(0,Math.min(100,Number(p.progress||0)))}%"></span></div><div class="proj-meta"><span>${Number(p.task_count||0)} tasks</span><span>${Number(p.file_count||0)} files</span><span>${Number(p.memory_count||0)} memories</span></div></div><div class="proj-foot"><em>${Number(p.progress||0)}%</em><span class="proj-open">Open workspace ›</span></div></article>`}
function projectWorkspace(){
  const p=state.currentProject;
  const section=state.projectSection||'CHAT';
  const tabs=[['CHAT','Chat'],['OVERVIEW','Overview'],['TASKS','Tasks'],['FILES','Files'],['SOURCE','Source of Truth'],['MEMORY','Memory']];
  return `<section class="page project-workspace-page">
    <div class="project-workspace-head">
      <button type="button" class="ghost project-back" id="back-projects">← All projects</button>
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
      <nav class="workspace-tabs" aria-label="Project sections">${tabs.map(([key,label])=>`<button type="button" data-project-section="${key}" class="${section===key?'active':''}" ${section===key?'aria-current="page"':''}>${label}</button>`).join('')}</nav>
    </div>
    ${state.error&&section!=='CHAT'?`<div class="project-alert">${errorBanner()}</div>`:''}
    ${projectSectionView(section)}
  </section>`;
}
function projectSectionView(section){
  if(section==='OVERVIEW')return projectOverviewView();
  if(section==='TASKS')return projectTasksView();
  if(section==='FILES')return projectFilesView();
  if(section==='MEMORY')return projectMemoryView();
  if(section==='SOURCE')return projectSourceView();
  return projectChatView();
}
function projectChatView(){
  const p=state.currentProject;
  const isEmpty=!state.messages.length;
  const msgs=state.messages.map(m=>messageHtml(m)).join('');
  const exec=state.execStatus?`<div class="exec-card live" aria-hidden="true"><div class="exec-head"><span class="exec-pulse"></span><div><strong>Working inside ${esc(p.name)}</strong><div class="muted tiny">${esc(state.execStatus)}</div></div></div><div class="exec-foot">Project context remains attached to this conversation.</div></div>`:'';
  return `<div class="project-chat-layout">
    <div class="project-chat-panel">
      <div class="project-chat-toolbar">
        <div><div class="eyebrow">PERMANENT PROJECT CHAT</div><strong>Everything here stays attached to ${esc(p.name)}</strong></div>
      </div>
      ${modeStrip()}
      <div class="project-context-ribbon">${icon('memory')} <span>Goal, tasks, project files, approved memory and conversation history are injected into every turn.</span></div>
      <div class="chat-scroll project-chat-scroll" id="chat-scroll">
        ${isEmpty?`<div class="project-chat-empty"><div class="seal">${icon('chat')}</div><h2>Start working inside ${esc(p.name)}</h2><p>This is the permanent conversation for this project. Leaving and returning keeps its history and context.</p><div class="quick-prompts"><button data-prompt="Review this project and tell me the next highest-impact step">Next step</button><button data-prompt="Summarize where this project stands using its tasks, files and conversation history">Project status</button><button data-prompt="Create the next deliverable for this project">Create deliverable</button></div></div>`:`${state.messagePage?.hasMore?'<div class="history-more"><button class="secondary compact" id="load-older-messages">Load older messages</button></div>':''}<div class="message-list">${msgs}</div>`}
        ${exec}
        ${errorBanner()}
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
  return `<div class="project-single-column"><div class="panel"><div class="panel-head"><div><h2>Project tasks</h2><p class="muted tiny">Completing tasks updates project progress automatically.</p></div><span class="eyebrow">${state.tasks.length} TOTAL</span></div><form id="task-form" class="task-create-rich"><input id="task-title" placeholder="Add a task…" aria-label="Task title" maxlength="200" required><select id="task-priority" aria-label="Priority"><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="LOW">Low</option></select><input id="task-due" type="date" aria-label="Due date (optional)"><button class="primary compact">Add task</button></form><div class="task-list full">${state.tasks.length?state.tasks.map(taskHtml).join(''):`<div class="empty-mini">No tasks yet. Add the first one.</div>`}</div></div></div>`;
}
function projectFilesView(){
  const p=state.currentProject;
  const projectFiles=state.files.filter(f=>f.project_id===p.id);
  const projectArtifacts=state.artifacts.filter(a=>a.project_id===p.id);
  const all=[...projectArtifacts.map(a=>({...a,kind:'artifact'})),...projectFiles.map(f=>({...f,kind:'file',type:(f.mime_type||'file').split('/').pop()}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const more=Boolean(state.filesPage?.hasMore||state.artifactsPage?.hasMore);
  return `<div class="project-single-column"><div class="panel"><div class="panel-head"><div><h2>Files & outputs</h2><p class="muted tiny">Anything uploaded here is automatically attached to this project's context.</p></div><button class="primary compact" id="upload-project-file">${icon('plus')} Upload</button></div>${all.length?`<div class="output-list">${all.map(outputItem).join('')}</div>`:`<div class="empty-mini">No files or generated outputs yet.</div>`}${more?'<div class="history-more"><button class="secondary compact" id="load-older-outputs">Load older</button></div>':''}</div></div>`;
}
function projectSourceView(){
  const items=state.projectSources||[];
  const files=state.files.filter(f=>f.project_id===state.currentProject?.id);
  return `<div class="project-single-column"><div class="panel"><div class="panel-head"><div><h2>Project Source of Truth</h2><p class="muted tiny">Approved instructions and reference content. Newer revisions take priority over old drafts; security rules still apply.</p></div></div>
    <form id="project-source-form" class="memory-create">
      <input id="project-source-id" type="hidden" value="">
      <input id="project-source-title" maxlength="140" placeholder="Document title (e.g. Design requirements)" required>
      <label for="project-source-file">Link a file from this project (optional)</label>
      <select id="project-source-file"><option value="">Paste text below</option>${files.map(f=>`<option value="${esc(f.id)}">${esc(f.filename)}${f.metadata?.extractable?' · text available':' · no extracted text'}</option>`).join('')}</select>
      <textarea id="project-source-content" rows="6" maxlength="20000" placeholder="Paste permanent requirements and specifications, or leave blank to use extracted text from the linked file…"></textarea>
      <button class="primary compact" type="submit">Save Source of Truth</button>
    </form>
    <div class="memory-list">${items.map(s=>`<article class="memory-item"><div class="memory-icon">${icon('files')}</div><div><strong>${esc(s.title)} · v${Number(s.revision||1)}</strong>${s.source_file_name?`<p class="muted tiny">Linked file: ${esc(s.source_file_name)}</p>`:''}<p>${esc(String(s.content||'').slice(0,1600))}</p>${s.versions?.length>1?`<details class="source-history"><summary>Revision history · ${s.versions.length}</summary><ol>${s.versions.slice(1).map(v=>`<li><strong>v${Number(v.revision||1)} · ${esc(fmtDate(v.created_at))}</strong><p>${esc(String(v.content||'').slice(0,900))}</p></li>`).join('')}</ol></details>`:''}<button class="secondary compact" type="button" data-source-edit="${esc(s.id)}">Create new revision</button> <button class="secondary compact" type="button" data-source-remove="${esc(s.id)}">Remove source</button></div></article>`).join('')||'<div class="empty-mini">No sources yet. Add a document or project instructions here.</div>'}</div>
  </div></div>`;
}
function projectMemoryView(){
  const policy=state.memoryPolicy;const policyText=policy?`At most ${Number(policy.maxItems||40)} approved memories are selected for each turn within a ${Math.round(Number(policy.maxChars||15000)/1000)}k-character memory budget. Explicit instructions and high-confidence items rank first, then recency.`:'Approved memory is selected deterministically by priority and recency within the AI context budget.';
  return `<div class="project-single-column"><div class="panel"><div class="panel-head"><div><h2>Permanent project memory</h2><p class="muted tiny">Saved here means durable project memory. ${esc(policyText)}</p></div><span class="eyebrow">${state.projectMemories.length} SAVED</span></div><form id="memory-form" class="memory-create"><textarea id="memory-content" rows="2" aria-label="New project memory" maxlength="5000" placeholder="Add a durable fact, preference, rule, or decision for this project…" required></textarea><button class="primary compact">Save memory</button></form><div class="memory-list">${state.projectMemories.length?state.projectMemories.map(memoryItem).join(''):`<div class="empty-mini">No permanent memories yet. You can add one here or tell Zeus “remember this…” inside the project chat.</div>`}</div></div></div>`;
}
function memoryItem(m){return `<article class="memory-item"><div class="memory-icon">${icon('memory')}</div><div><strong>${esc(m.type==='manual_note'?'Project memory':String(m.type||'Memory').replaceAll('_',' '))}</strong><p>${esc(m.content)}</p><small>${fmtDate(m.created_at)} · ${esc(m.source||'manual')}</small></div><button class="ghost danger memory-delete" data-memory-delete="${m.id}" title="Delete memory" aria-label="Delete this memory">${icon('close')}</button></article>`}
function taskHtml(t){const status=String(t.status||'TODO');const next=status==='TODO'?'IN_PROGRESS':status==='IN_PROGRESS'?'DONE':'TODO';const label=status==='TODO'?'Start task':status==='IN_PROGRESS'?'Mark task done':'Reopen task';const mark=status==='DONE'?icon('check'):status==='IN_PROGRESS'?'<span class="task-state-dot" aria-hidden="true"></span>':'';return `<div class="task-item"><button class="task-check ${status==='DONE'?'done':status==='IN_PROGRESS'?'in-progress':''}" data-task="${t.id}" data-status="${status}" data-next-status="${next}" aria-label="${label}: ${esc(t.title)}" title="${label}">${mark}</button><div><strong style="font-size:13px">${esc(t.title)}</strong><div class="muted tiny">${esc(status.replaceAll('_',' '))}${t.due_at?` · ${fmtDate(t.due_at)}`:''}</div></div><span class="priority ${esc(t.priority)}">${esc(t.priority)}</span></div>`}

function capabilityState(key,fallbackReady=false){const raw=state.health?.capabilityReadiness?.[key];if(raw==='observed_healthy')return {enabled:true,label:'READY'};if(raw==='configured_unverified')return {enabled:true,label:'CONFIGURED'};if(raw==='degraded'||raw==='recent_failure')return {enabled:false,label:'DEGRADED'};return {enabled:Boolean(fallbackReady),label:fallbackReady?'READY':'UNAVAILABLE'};}
// Compare & Evolve entry points. These are requests, not a claim that every
// format has an independent generation backend. Unsupported generators ask for
// user-supplied files, never invent downloadable results.
const COMPARE_FORMATS=Object.freeze([
  {id:'images',title:'Images',formats:'PNG / JPG / SVG',capability:'upload',prompt:'Upload two saved image artifacts, then compare their recorded metadata and choose one to use. Image understanding and independent image generation are not enabled in this comparison flow.'},
  {id:'documents',title:'Documents & PDFs',formats:'PDF',capability:'chat',type:'pdf',prompt:'Create two independent PDF alternatives for this goal.'},
  {id:'spreadsheets',title:'Spreadsheets',formats:'XLSX',capability:'chat',type:'xlsx',prompt:'Create two independent XLSX alternatives for this goal.'},
  {id:'presentations',title:'Presentations',formats:'PPTX',capability:'chat',type:'pptx',prompt:'Create two independent PPTX alternatives for this goal.'},
  {id:'code',title:'Code & UI',formats:'HTML',capability:'chat',type:'html',prompt:'Create two independent, complete HTML UI alternatives for this goal. Keep both self-contained and safe to preview.'},
  {id:'3d',title:'3D Models',formats:'STL / 3MF / OBJ',capability:'upload',prompt:'Compare two 3D model files that I upload, focusing on geometry, dimensions, printability and design tradeoffs where inspectable. Creating two genuine STL/3MF/OBJ models requires a connected 3D generation engine; do not claim one is available until verified.'},
  {id:'video',title:'Video',formats:'MP4 / MOV',capability:'upload',prompt:'Compare two video files I upload, focusing on pacing, style and storytelling to the extent the available tools can inspect them. Independent video generation requires configured video generation providers. Do not invent video artifacts or claim frame analysis without evidence.'},
  {id:'audio',title:'Audio',formats:'MP3 / WAV',capability:'upload',prompt:'Compare two audio files I upload, including voice, pacing and clarity to the extent inspection tools permit. Generating two independent audio files requires configured audio generation providers. Never represent text or transcription as generated audio.'}
]);
function startCompareFormat(id){
  const format=COMPARE_FORMATS.find(x=>x.id===id);if(!format)return;
  state.compareType=format.type||null;
  state.draft=format.type?`${format.prompt} Each option must be complete and saved as its own ${format.type.toUpperCase()} file. Use two different model families; do not let either model see the other draft.\n\nMy specific goal: `:`${format.prompt}\n\nMy specific goal: `;
  state.tab='Home';state.drawer=false;state.error='';
  // Keep the active project and conversation rather than discarding their context.
  render();requestAnimationFrame(()=>{$('#composer-text')?.focus();});
}

function toolsView(){const h=state.health?.capabilities||{};const chat=capabilityState('chat',Boolean(h.chat));const images=capabilityState('imageGeneration',Boolean(h.imageGeneration));const tools=[
  ['web','Web Search','Current web retrieval with sources',icon('globe'),Boolean(h.webSearch),h.webSearch?'READY':'NOT CONFIGURED','Search the web for '],
  ['code','Code','Build and review code with explicit test status',icon('code'),chat.enabled,chat.label,'Build or review code for '],
  ['images','Images','Generate and edit with AI',icon('image'),images.enabled,images.label,'Create an image of '],
  ['documents','Documents','Create retained PDF, DOCX, PPTX and XLSX deliverables',icon('doc'),chat.enabled,chat.label,'Create a professional PDF about '],
  ['analysis','Source Review','Ground analysis in uploaded files and project context',icon('chart'),chat.enabled,chat.label,'Analyze the attached source and ground the findings in what it actually supports'],
];

  return `<section class="page tools-page">
    <div class="page-head tight"><div><h1>Tools & Capabilities</h1><p class="eyebrow">REAL CAPABILITIES. REAL OUTPUTS.</p></div><button class="text-gold" data-tab="Files">Explore All ></button></div>
    ${errorBanner('page-alert')}<div class="tool-grid">${tools.map(([kind,title,sub,ico,ok,label,prompt])=>`<button class="tool-card ${ok?'':'disabled'}" data-kind="${kind}" ${ok?`data-tool-prompt="${esc(prompt)}"`:'disabled aria-disabled="true"'}><div class="tool-ico">${ico}</div><div class="tool-copy"><strong>${title}</strong><span>${sub}</span></div><span class="tool-state">${esc(label)}</span><span class="chev">›</span></button>`).join('')}</div>
    <section class="card" aria-labelledby="compare-title" style="padding:20px;margin-top:18px">
      <h2 id="compare-title">Compare &amp; Evolve</h2>
      <p class="muted">For PDF, DOCX, XLSX, PPTX and HTML, Zeus creates two separate files with two model families when both are configured. Open each file to review it, choose a preferred version, combine them into a new C, or request another pair. Other formats support uploaded-file comparison only.</p>
      <div class="tool-grid">${COMPARE_FORMATS.map(f=>{
        const available=f.capability==='upload'||Boolean(h[f.capability]);
        const label=f.capability==='upload'?'UPLOAD & COMPARE':available?'START COMPARISON':'NOT CONFIGURED';
        return `<button type="button" class="tool-card" data-compare-start="${esc(f.id)}" aria-label="Compare ${esc(f.title)}"><div class="tool-copy"><strong>${esc(f.title)}</strong><span>${esc(f.formats)}</span></div><span class="tool-state">${esc(label)}</span><span class="chev">›</span></button>`;
      }).join('')}</div>
    </section>
    <button class="panel library-card" data-tab="Files"><div class="tool-ico">${icon('folder')}</div><div><strong>Files & Library</strong><p>Upload, analyze, and keep everything in context across all your projects and conversations.</p></div><span class="chev">›</span></button>
  </section>`;
}
function outputsList(limit=12){let all=[...state.artifacts.map(a=>({...a,kind:'artifact'})),...state.files.map(f=>({...f,kind:'file',type:(f.mime_type||'file').split('/').pop()}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));if(Number.isFinite(limit))all=all.slice(0,limit);return all.length?`<div class="output-list">${all.map(outputItem).join('')}</div>`:`<div class="card" style="padding:24px"><strong>Your library starts with the first source or deliverable.</strong><p class="muted">Upload a source for analysis, or ask Zeus/Olympus to create a document, image, spreadsheet, presentation or ZIP.</p></div>`}
function outputItem(o){const tag=String(o.type||o.mime_type||'FILE').split('/').pop().toUpperCase().slice(0,4),kind=o.kind==='artifact'?'artifact':'file',download=esc(o.downloadUrl||''),open=esc((kind==='file'&&o.previewUrl)||o.downloadUrl||''),name=esc(o.filename||'Output'),mime=esc(kind==='file'&&o.previewUrl?'text/plain':(o.mime_type||o.type||'application/octet-stream')),status=kind==='file'?(o.metadata?.extractionStatus||'stored_only'):'',isZip=o.type==='zip'||/zip/i.test(o.mime_type||'')||String(o.filename||'').toLowerCase().endsWith('.zip'),git=Boolean(state.health?.capabilities?.githubCommit);return `<article class="out-row"><div class="out-badge ${tag.toLowerCase()}">${esc(tag)}</div><div><strong>${name}</strong><small>${fmtSize(o.size)}${status?` · ${esc(status.replaceAll('_',' '))}`:''}${fmtDateTime(o.created_at)?` · ${fmtDateTime(o.created_at)}`:''}</small></div><div class="out-actions"><button class="chev-link" type="button" data-open-output="${open}" data-output-name="${name}" data-output-mime="${mime}">Open</button><button class="chev-link" type="button" data-download-output="${download}" data-output-name="${name}">Download</button>${kind==='artifact'?`<button class="chev-link" type="button" data-use-artifact="${esc(o.id)}">Use in chat</button><button class="chev-link" type="button" data-compare-artifact="1">Compare</button>${o.type==='html'?`<button class="chev-link" type="button" data-edit-html="${esc(o.id)}">Edit preview</button>`:''}`:''}${isZip&&git?`<button class="chev-link" type="button" data-github-commit="${kind}" data-source-id="${esc(o.id)}" data-source-name="${name}">Commit</button>`:''}<button class="icon-danger" type="button" data-delete-output="${kind}" data-output-id="${esc(o.id)}" aria-label="Delete ${kind} ${name}" title="Delete ${kind}">${icon('close')}</button></div></article>`}
function filesView(){const more=Boolean(state.filesPage?.hasMore||state.artifactsPage?.hasMore);return `<section class="page files-page"><div class="page-head"><div><div class="eyebrow">Files</div><h1>Files & Library</h1><p>Upload, analyze, and keep files and generated artifacts connected to your conversations and projects.</p></div><button class="primary" id="upload-files">${icon('plus')} Upload files</button></div><div class="project-tabs" style="margin-bottom:18px"><button type="button" class="active" aria-pressed="true">All outputs</button></div>${errorBanner('page-alert')}${outputsList(null)}${more?'<div class="history-more"><button class="secondary compact" id="load-older-outputs">Load older</button></div>':''}</section>`}
async function googleConnectionAction(service,action){
  try{
    const result=await api('/api/google-integration/'+action,{
      method:'POST',body:JSON.stringify({service})
    });
    if(action==='start'){
      const authUrl=new URL(result.authorizationUrl);
      if(authUrl.origin!=='https://accounts.google.com')throw new Error('Unexpected Google authorization URL');
      window.location.assign(authUrl.toString());return;
    }
    delete state.googleSearchResults[service];delete state.googleSearchQueries[service];
    await loadGoogleConnections();render();
  }catch(e){state.error=e.message||'Google integration request failed.';render();}
}
async function loadGoogleConnections(){
  try{state.googleConnections=await api('/api/google-integration/status');}
  catch{state.googleConnections={configured:false,connections:{}};}
}
function googleIntegrationSettings(){
  const info=state.googleConnections||{},connections=info.connections||{};
  return `<article class="card settings-card"><h3>Google integrations</h3>
   <p class="muted tiny">Gmail, Calendar and Drive use separate, read-only Google permissions. Search here or ask Zeus to look up your connected Google data. No Google password or OAuth credentials are stored in your browser. Configure OAuth on the server first.</p>
   <div class="diag-list">${[['gmail','Gmail'],['calendar','Google Calendar'],['drive','Google Drive']].map(([id,label])=>{
     const ok=Boolean(connections[id]?.connected);
     const result=state.googleSearchResults[id],query=esc(state.googleSearchQueries[id]||'');
     const search=ok?`<form class="google-search-form" data-google-search="${id}"><input name="q" value="${query}" maxlength="200" aria-label="Search ${label}" placeholder="${id==='calendar'?'Search events':'Search '+label}"><button type="submit" class="secondary compact" ${state.googleSearchBusy===id?'disabled':''}>${state.googleSearchBusy===id?'Searching…':'Search'}</button></form>`:'';
     const items=Array.isArray(result?.items)?result.items.map(item=>{
       if(id==='gmail')return `<article><strong>${esc(item.subject)}</strong><small>${esc(item.from)} · ${esc(item.date)}</small><p>${esc(item.snippet)}</p></article>`;
       if(id==='calendar')return `<article><strong>${item.htmlLink?`<a href="${esc(item.htmlLink)}" target="_blank" rel="noreferrer noopener">${esc(item.summary)}</a>`:esc(item.summary)}</strong><small>${esc(item.start)}${item.end?` – ${esc(item.end)}`:''}</small>${item.location?`<p>${esc(item.location)}</p>`:''}</article>`;
       return `<article><strong>${item.webViewLink?`<a href="${esc(item.webViewLink)}" target="_blank" rel="noreferrer noopener">${esc(item.name)}</a>`:esc(item.name)}</strong><small>${esc(item.mimeType)}${item.modifiedTime?` · ${esc(item.modifiedTime)}`:''}</small></article>`;
     }).join(''):'';
     const resultView=result?`<div class="google-results" aria-live="polite">${items||'<p class="muted tiny">No matching items found.</p>'}${result.nextPageToken?`<button type="button" class="secondary compact" data-google-next="${id}">More results</button>`:''}</div>`:'';
     const reconnect=Boolean(connections[id]?.requiresReconnect);
     return `<div class="diag-row"><span>${label}</span><span>${reconnect?'Reconnect required':ok?'Connected':'Not connected'}</span><button type="button" class="secondary compact" data-google-service="${id}" data-google-action="${reconnect?'start':ok?'disconnect':'start'}" ${!ok&&!info.configured?'disabled title="Google OAuth is not configured"':''}>${reconnect?'Reconnect':ok?'Disconnect':'Connect'}</button>${reconnect?`<button type="button" class="secondary compact" data-google-service="${id}" data-google-action="disconnect">Disconnect</button>`:''}</div>${search}${resultView}`;
   }).join('')}</div><p class="muted tiny">${info.configured?'OAuth ready for authorization.':'Awaiting Google OAuth client ID, client secret, redirect URI and encryption key in Netlify.'}</p></article>`;
}
async function searchGoogle(service,query=state.googleSearchQueries[service]||'',pageToken=''){
  state.googleSearchBusy=service;state.googleSearchQueries[service]=String(query||'').trim().slice(0,200);state.error='';render();
  try{
    const params=new URLSearchParams();if(state.googleSearchQueries[service])params.set('q',state.googleSearchQueries[service]);if(pageToken)params.set('pageToken',pageToken);
    state.googleSearchResults[service]=await api(`/api/google-integration/${service}${params.size?'?'+params:''}`);
  }catch(error){state.error=error.message||`Could not search ${service}.`;if(error.code==='GOOGLE_REAUTH_REQUIRED'&&state.googleConnections?.connections?.[service])state.googleConnections.connections[service].requiresReconnect=true;}
  finally{state.googleSearchBusy=null;render();}
}

async function loadPreferences(){
  const data=await api('/api/preferences');
  state.preferences={personality:data.personality||'balanced',instructions:data.instructions||''};
  state.preferencesLoaded=true;
}
function preferencesSettings(){
  const prefs=state.preferences||{};
  return `<article class="card settings-card">
    <h3>Personality &amp; Instructions</h3>
    <p class="muted tiny">One personality for Zeus and Olympus, across text chat, recorded voice messages and Live Talk. Project-specific memory remains separate.</p>
    <form id="preferences-form" class="form-grid">
      <div class="field"><label for="zeus-personality">Personality</label>
        <select id="zeus-personality" name="personality" required>
          ${[['balanced','Balanced'],['direct','Direct'],['warm','Warm & conversational'],['creative','Creative & expressive'],['professional','Professional']].map(([key,label])=>`<option value="${key}" ${prefs.personality===key?'selected':''}>${label}</option>`).join('')}
        </select></div>
      <div class="field"><label for="zeus-global-instructions">Custom instructions</label>
        <textarea id="zeus-global-instructions" rows="6" maxlength="4000" placeholder="Tell Zeus how to respond, what to prioritize, and how to speak to you…">${esc(prefs.instructions||'')}</textarea></div>
      <p class="muted tiny">Preferences apply to future replies. Your saved chats are not rewritten. System safety and factual accuracy always take priority.</p>
      <div class="row"><button class="primary" type="submit" ${!state.preferencesLoaded?'disabled':''}>Save preferences</button><span id="preferences-saved" role="status" aria-live="polite"></span></div>
    </form>
  </article>`;
}

function settingsView(){const providers=state.health?.providerReadiness||{};const statusLabel=(v)=>String(v||'not_configured').toUpperCase().replaceAll('_',' ');const statusGood=(v)=>v==='observed_healthy';return `<section class="page"><div class="page-head"><div><div class="eyebrow">Settings</div><h1>Workspace settings</h1><p>Account and advanced runtime diagnostics.</p></div></div>${errorBanner('page-alert')}<div class="settings-grid"><article class="card settings-card"><h3>Account</h3><div class="user-chip"><div class="avatar">${esc(initials())}</div><div><strong>${esc(state.user?.user_metadata?.full_name||'Felipe')}</strong><div class="muted tiny">${esc(state.user?.email||'Personal owner')}</div></div></div><p class="muted tiny" style="margin-top:12px">This app uses one personal workspace.</p></article><article class="card settings-card"><h3>Monthly cost monitor</h3>
  <p class="muted tiny">One shared $60 testing target for text, images, videos, audio and tools. This is an alert only; nothing is disabled when the target is reached.</p>
  <div class="diag-list"><div class="diag-row"><span>Known text estimate</span><strong>${Number(state.health?.monthlyBudget?.knownTextUsd||0).toFixed(2)}</strong></div>
  <div class="diag-row"><span>Combined monthly target</span><strong>${Number(state.health?.monthlyBudget?.targetUsd||60).toFixed(2)}</strong></div>
  <div class="diag-row"><span>Media usage</span><strong>Not yet metered</strong></div></div>
  <p class="muted tiny">Actual spending may be higher than shown. Reconcile Netlify and external provider billing before treating this as an accurate total.</p>
  ${state.health?.monthlyBudget?.targetReached?'<p class="status-warn">Target reached in known estimates. Services remain available.</p>':''}
</article>${preferencesSettings()}${googleIntegrationSettings()}<article class="card settings-card"><h3>Voice settings</h3>
<p class="muted tiny">Live Talk speaks with ElevenLabs. If no voice is saved in this browser, the server default voice is used. The browser’s system voice is not used as a silent fallback.</p>
<div class="field"><label for="elevenlabs-voice-preset">Choose an ElevenLabs voice from your account</label><select id="elevenlabs-voice-preset">
<option value="">${state.elevenLabsVoicesLoading?'Loading ElevenLabs voices…':state.elevenLabsVoicesLoaded&&!state.elevenLabsVoices.length?'No voices found':'Choose a voice'}</option>
${state.elevenLabsVoiceId&&!state.elevenLabsVoices.some(v=>v.voice_id===state.elevenLabsVoiceId)?`<option value="${esc(state.elevenLabsVoiceId)}" selected>Custom voice · ${esc(state.elevenLabsVoiceId)}</option>`:''}
${state.elevenLabsVoices.map(v=>`<option value="${esc(v.voice_id)}" ${state.elevenLabsVoiceId===v.voice_id?'selected':''}>${esc(v.name)}${v.category?` · ${esc(v.category)}`:''}</option>`).join('')}
</select></div>
${state.elevenLabsVoicesError?`<p class="status-warn" role="status">${esc(state.elevenLabsVoicesError)}</p>`:''}
<div class="row"><button type="button" class="secondary compact" id="reload-elevenlabs-voices" ${state.elevenLabsVoicesLoading?'disabled':''}>${state.elevenLabsVoicesLoading?'Loading…':'Refresh ElevenLabs voices'}</button>${state.elevenLabsVoiceHasMore?`<button type="button" class="secondary compact" id="load-more-elevenlabs-voices" ${state.elevenLabsVoicesLoading?'disabled':''}>Load more</button>`:''}</div>
<div class="field"><label for="elevenlabs-voice-id">ElevenLabs Voice ID</label><input id="elevenlabs-voice-id" type="text" maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(state.elevenLabsVoiceId)}" placeholder="Paste your ElevenLabs Voice ID"></div>
<label for="zeus-voice-preset">OpenAI fallback voice</label>
<select id="zeus-voice-preset">
${['marin','cedar','coral','alloy','ash','ballad','echo','fable','nova','onyx','sage','shimmer','verse'].map(v=>`<option value="${v}" ${(state.voiceId||'marin')===v?'selected':''}>${v[0].toUpperCase()+v.slice(1)}</option>`).join('')}
</select>
<p class="muted tiny">Find the ID in ElevenLabs under Voices. Your Voice ID is saved in this browser; the ElevenLabs API key stays on the server in Netlify.</p>
<div class="field"><label for="live-language">Live Talk language</label><select id="live-language">
${[['auto','Automatic (agent detects language)'],['pt','Português (Brasil)'],['en','English (US)'],['es','Español']].map(([v,label])=>`<option value="${v}" ${state.liveLocale===v?'selected':''}>${label}</option>`).join('')}
</select></div><div class="field"><label for="voice-avatar">Live Talk avatar</label><select id="voice-avatar">
${[['lightning','Lightning plasma'],['classic','Classic orb'],['olympus','Olympus'],['liquid','Liquid metal']].map(([v,label])=>`<option value="${v}" ${state.voiceAvatar===v?'selected':''}>${label}</option>`).join('')}</select></div>
<p class="muted tiny" id="live-audio-controls-note">Live Talk connects directly to the ElevenLabs Realtime agent. Microphone sensitivity, turn timing, and interruptions are controlled in that agent’s settings. If Realtime fails, OlyHub shows an error and does not switch to another speech provider.</p>
<p class="muted tiny">Automatic language switching requires Portuguese, English, and Spanish to be enabled on the agent with its language-detection tool.</p>
<p class="muted tiny" id="voice-saved-line">${storedElevenLabsVoiceId()?esc(`Voice saved in this browser: ${elevenLabsVoiceLabel(storedElevenLabsVoiceId())}`):'No voice saved in this browser; the server default voice is used.'}</p>
<div class="row"><button type="button" class="secondary compact" id="save-voice-id">Save voice</button><button type="button" class="secondary compact" id="test-voice" ${state.voiceTesting?'disabled':''}>${state.voiceTesting?'Testing voice…':'Test voice'}</button></div>
<p class="${state.voiceStatus?.kind==='error'?'status-warn':state.voiceStatus?.kind==='warn'?'status-warn':'status-good'}" id="voice-save-status" role="status" aria-live="polite">${state.voiceStatus?esc(state.voiceStatus.text):''}</p>
</article><article class="card settings-card"><h3>Go-live checklist</h3>${(state.health?.warnings||[]).length?`<div class="diag-list health-warnings" role="status">${state.health.warnings.map(w=>`<p class="diag-warning"><strong>${esc(w.section)}</strong>: ${esc(w.message)}</p>`).join('')}</div>`:''}<div class="diag-list">${[['Workspace API open',state.health?.goLive?.workspaceAccess==='open'],['Database',state.health?.goLive?.database],['Blob maintenance',state.health?.goLive?.blobMaintenance],['Provider configured',Number(state.health?.goLive?.configuredProviders||0)>0],['Chat callable',['observed_healthy','configured_unverified'].includes(state.health?.goLive?.chatState)]].map(([label,ok])=>`<div class="diag-row"><span>${esc(label)}</span><strong class="${ok?'status-good':'status-warn'}">${ok?'READY':'BLOCKED'}</strong></div>`).join('')}</div><p class="muted tiny" style="line-height:1.55;margin-top:14px">${state.health?.goLive?.ready?'Core runtime checks passed for this workspace.':'The workspace is waiting for its database, an AI provider and a callable chat route.'}</p></article><article class="card settings-card"><h3>AI provider diagnostics</h3><div class="diag-list">${['openai','anthropic','gemini','openrouter'].map(p=>{const v=providers[p]?.status||'not_configured';return `<div class="diag-row"><span>${p}</span><strong class="${statusGood(v)?'status-good':'status-warn'}">${esc(statusLabel(v))}</strong></div>`}).join('')}</div><p class="muted tiny" style="line-height:1.55;margin-top:14px">Diagnostics are runtime-local evidence. CONFIGURED UNVERIFIED means credentials/models were detected but this warm Function runtime has not observed a successful call yet. DEGRADED means the temporary circuit breaker is open.</p></article><article class="card settings-card"><h3>Capabilities</h3><div class="diag-list">${Object.keys(state.health?.capabilityReadiness||{}).length?'':`<div class="muted tiny">${state.health?'No capability diagnostics reported.':'Diagnostics load when the workspace runtime responds.'}</div>`}${Object.entries(state.health?.capabilityReadiness||{}).map(([k,v])=>`<div class="diag-row"><span>${esc(k)}</span><strong class="${v==='observed_healthy'?'status-good':'status-warn'}">${esc(statusLabel(v))}</strong></div>`).join('')}</div></article></div></section>`}


let modalKeydownHandler=null;
let modalReturnFocus=null;
let modalPreviousOverflow='';
let modalCleanup=null;
function clearModalLifecycle(){
  if(modalKeydownHandler){document.removeEventListener('keydown',modalKeydownHandler,true);modalKeydownHandler=null;}
  if(modalCleanup){try{modalCleanup()}catch{}modalCleanup=null;}
  if(modalPreviousOverflow!==''){document.documentElement.style.overflow=modalPreviousOverflow;modalPreviousOverflow='';}
}
function closeModal({restoreFocus=true}={}){
  const root=$('#modal-root');if(root)root.innerHTML='';
  clearModalLifecycle();
  const target=modalReturnFocus;modalReturnFocus=null;
  if(restoreFocus&&target?.isConnected)requestAnimationFrame(()=>target.focus?.());
}
function showModal(markup,{initialFocus,onClose}={}){
  const root=$('#modal-root');if(!root)return null;
  clearModalLifecycle();modalReturnFocus=document.activeElement;modalPreviousOverflow=document.documentElement.style.overflow||'visible';modalCleanup=typeof onClose==='function'?onClose:null;document.documentElement.style.overflow='hidden';root.innerHTML=markup;
  const backdrop=$('.modal-backdrop',root),dialog=$('.modal',root);if(!dialog)return null;
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('tabindex','-1');
  localizeInterface(root);
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
function setModalError(message){const el=$('#modal-notice');if(!el)return;el.textContent=translateInterfaceText(message||'');el.classList.toggle('hidden',!message);}
function turboApprovalModal(quote={}){
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;closeModal();resolve(value);};
    const expected=Number(quote.expectedCalls||0),hard=Number(quote.hardCallCap||0),creators=Number(quote.creatorCount||0),tokens=Number(quote.maxOutputTokens||0),seconds=Number(quote.timeoutSeconds||0);
    showModal(`<div class="modal-backdrop"><div class="modal" aria-labelledby="turbo-approval-title"><div class="modal-head"><h2 id="turbo-approval-title">Approve Complex Turbo</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div class="card" style="padding:18px"><strong>Higher-budget execution</strong><p class="muted" style="margin-top:8px">Expected successful path: ${expected} model calls · up to ${creators} creator workstreams.</p><p class="muted tiny" style="margin-top:8px">Hard ceiling: ${hard} model calls · ${seconds}s runtime · up to ${tokens.toLocaleString()} output tokens across the pipeline.</p><p class="muted tiny" style="margin-top:8px">This is a workload bound, not a dollar quote; provider pricing varies.</p></div><div class="modal-actions"><button type="button" class="secondary" id="turbo-cancel">Cancel</button><button type="button" class="primary" id="turbo-approve">Approve Turbo</button></div></div></div>`,{initialFocus:'#turbo-approve',onClose:()=>{if(!settled){settled=true;resolve(false);}}});
    $('#modal-close').onclick=$('#turbo-cancel').onclick=()=>finish(false);
    $('#turbo-approve').onclick=()=>finish(true);
  });
}
function githubCommitModal(sourceKind,sourceId,sourceName='project.zip'){
  const defaultMessage=`Zeus Proxy: update ${String(sourceName||'project').replace(/\.zip$/i,'')}`;
  showModal(`<div class="modal-backdrop"><div class="modal" aria-labelledby="github-commit-title"><div class="modal-head"><h2 id="github-commit-title">Commit ZIP to GitHub</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert" aria-live="assertive"></div><form id="github-commit-form" class="form-grid"><div class="field"><label for="github-repo">Repository URL</label><input id="github-repo" required inputmode="url" placeholder="https://github.com/owner/repository"></div><div class="field"><label for="github-branch">Branch</label><input id="github-branch" maxlength="120" placeholder="Default branch"></div><div class="field"><label for="github-message">Commit message</label><input id="github-message" maxlength="180" value="${esc(defaultMessage)}"></div><p class="muted tiny">One explicit, atomic, non-force commit. OlyHub blocks .env/private-key files and credential-like values before writing. If GITHUB_REPO_ALLOWLIST is configured, only listed repositories are accepted.</p><div class="modal-actions"><button type="button" class="secondary" id="modal-cancel">Cancel</button><button class="primary" id="github-commit-submit">Commit</button></div></form></div></div>`,{initialFocus:'#github-repo'});
  $('#modal-close').onclick=$('#modal-cancel').onclick=()=>closeModal();
  $('#github-commit-form').addEventListener('submit',async e=>{
    e.preventDefault();setModalError('');const submit=$('#github-commit-submit');submit.disabled=true;submit.textContent=translateInterfaceText('Committing…');
    try{
      const d=await api('/api/github-commit',{method:'POST',body:JSON.stringify({sourceKind,sourceId,repoUrl:$('#github-repo').value,branch:$('#github-branch').value,message:$('#github-message').value,confirm:true})});
      const commit=d.commit||{};const label=commit.noChange?'Repository already matches this ZIP.':commit.replayed?'This commit was already completed.':'Commit completed.';
      showModal(`<div class="modal-backdrop"><div class="modal" aria-labelledby="github-result-title"><div class="modal-head"><h2 id="github-result-title">GitHub</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div class="card" style="padding:18px"><strong>${esc(label)}</strong><p class="muted" style="margin-top:8px">${esc(commit.repository||'')} · ${esc(commit.branch||'')} · ${Number(commit.filesCommitted||0)} files</p><p class="muted tiny" style="margin-top:8px">${esc(String(commit.sha||'').slice(0,12))}</p></div><div class="modal-actions"><button type="button" class="secondary" id="modal-done">Done</button>${commit.url?`<a class="primary" href="${esc(commit.url)}" target="_blank" rel="noreferrer noopener">Open commit</a>`:''}</div></div></div>`);
      $('#modal-close').onclick=$('#modal-done').onclick=()=>closeModal();
    }catch(err){setModalError(err.message||'Could not commit to GitHub.');submit.disabled=false;submit.textContent=translateInterfaceText('Commit');}
  });
}

function liveTalkExperience(){
  const persona='ZEUS';
  const stage=state.liveTalkStopRequested?'Finishing your turn':state.liveMuted?'Microphone muted':state.liveStage==='error'?'Live Talk paused':state.liveStage==='speaking'?`${persona} is speaking`:state.liveStage==='processing'?'Preparing your reply':state.liveStage==='connecting'?'Connecting to ElevenLabs Realtime':state.liveStage==='listening'?'Listening':'Live Talk connected';
  const latest=[...(state.messages||[])].reverse().find(m=>['assistant','user'].includes(m.role));
  const excerpt=latest?String(latest.content||'').replace(/\s+/g,' ').trim().slice(0,220):'';
  const bars=Array.from({length:41},(_,i)=>`<i style="--wave:${12+((i*17)%39)}%;--delay:${(i%13)*-0.09}s"></i>`).join('');
  const savedLiveVoice=state.liveTalkVoiceId;
  const liveVoiceOptions=state.elevenLabsVoices.map(voice=>`<option value="${esc(voice.voice_id)}" ${savedLiveVoice===voice.voice_id?'selected':''}>${esc(voice.name)}${voice.category?` · ${esc(voice.category)}`:''}</option>`).join('');
  const unavailableLiveVoice=savedLiveVoice&&!state.elevenLabsVoices.some(voice=>voice.voice_id===savedLiveVoice)?`<option value="${esc(savedLiveVoice)}" selected>Saved voice · ${esc(savedLiveVoice)}</option>`:'';
  return `<main class="live-talk-experience" id="main-content" tabindex="-1" aria-label="${persona} Live Talk">
    <div class="live-talk-scene" aria-hidden="true"></div>
    <header class="live-talk-header">
      <button type="button" class="live-glass-button" id="live-talk-minimize" aria-label="Minimize Live Talk and return to Zeus Proxy" title="Minimize Live Talk">${icon('back')}</button>
      <div class="live-talk-brand"><span class="personal-bolt">ϟ</span><span><strong class="logo-word">OLYMPUS HUB</strong><small class="logo-sub">PERSONAL · ${persona}</small></span></div>
      <div class="live-pill"><i></i>LIVE</div>
    </header>
    <section class="live-talk-center" aria-live="polite">
      <div class="live-talk-heading"><span>${persona}</span></div>
      <p class="live-talk-status ${state.liveStage==='speaking'?'is-speaking':''}">${state.liveStage==='speaking'?'<span class="zeus-speaking-bolt" aria-hidden="true">⚡</span>':''}${esc(stage)}</p>
      <div class="live-talk-orb-wrap">${voiceAvatarMarkup()}<span class="live-talk-orbit live-talk-orbit-a"></span><span class="live-talk-orbit live-talk-orbit-b"></span></div>
      <div class="live-talk-waveform ${state.liveStage==='speaking'?'is-speaking':''}" aria-hidden="true">${bars}</div>
      <p class="live-talk-latest">${state.liveAgentPartial?`<span class="muted">You:</span> ${esc(state.liveAgentPartial)}`:excerpt?esc(excerpt):'Fale naturalmente. Sua conversa será salva no chat.'}</p>
      <div class="live-talk-mode"><span class="live-mode-dot"></span>ELEVEN REALTIME <span>·</span> ${esc(state.liveLocale==='auto'?'AUTO LANGUAGE':state.liveLocale.toUpperCase())}</div>
    </section>
    ${state.error?`<div class="live-talk-error" role="alert">${esc(state.error)}${state.liveStage==='error'?`<button type="button" id="live-talk-retry">${state.liveFailureKind==='playback_blocked'?'Tap to resume':'Reconnect Realtime'}</button>`:''}</div>`:''}
    <div class="live-talk-personas live-talk-voice-picker"><label class="live-voice-select-wrap"><span class="live-persona-mark zeus-mark" aria-hidden="true">ϟ</span><span class="live-persona-copy"><strong>LIVE TALK VOICE</strong><small>${state.liveTalkVoiceId?esc(elevenLabsVoiceLabel(state.liveTalkVoiceId)):'Agent default voice'}</small></span><select id="live-talk-voice" aria-label="Choose an ElevenLabs voice for Live Talk"><option value="" ${!savedLiveVoice?'selected':''}>Agent default voice (Felipe)</option>${unavailableLiveVoice}${liveVoiceOptions}</select></label><button type="button" class="live-voice-refresh" id="live-talk-refresh-voices" aria-label="Refresh ElevenLabs voice list" title="Refresh voice list" ${state.elevenLabsVoicesLoading?'disabled':''}>${state.elevenLabsVoicesLoading?'…':'↻'}</button>${state.elevenLabsVoiceHasMore?`<button type="button" class="live-voice-refresh" id="live-talk-load-more-voices" aria-label="Load more ElevenLabs voices" title="Load more voices" ${state.elevenLabsVoicesLoading?'disabled':''}>＋</button>`:''}</div>
    <p class="live-voice-note" role="status">${state.elevenLabsVoicesError?`Could not load account voices: ${esc(state.elevenLabsVoicesError)}`:state.elevenLabsVoicesLoading?'Loading voices from your ElevenLabs account…':state.liveTalkVoiceId?'Changing voice reconnects the session. Enable Voice ID overrides in the ElevenLabs agent Security settings.':'Choose any account voice; your choice is saved on this device.'}</p>
    <form class="live-talk-text-form" id="live-talk-text-form" aria-label="Send a typed message to the live agent"><label class="sr-only" for="live-talk-text">Type a message if voice recognition misunderstood</label><input id="live-talk-text" name="message" type="text" maxlength="4000" autocomplete="off" enterkeyhint="send" placeholder="Miscommunication? Type your message…" value="${esc(state.liveTextDraft)}"><button type="submit" aria-label="Send typed message" title="Send typed message" ${state.sending?'disabled':''}>${icon('send')}</button><span class="sr-only" id="live-talk-text-status" aria-live="polite">${esc(state.liveTextStatus)}</span></form>
    <footer class="live-talk-controls"><div class="live-control-hint"><span class="live-mic-dot"></span>${state.liveMuted?'Your microphone is muted · Zeus audio stays on':state.liveStage==='listening'?'Your microphone is active':state.liveStage==='processing'?'Voice captured':state.liveStage==='speaking'?'Zeus is speaking':state.liveStage==='error'?'Live Talk paused':'Session ready'}</div><div class="live-call-actions"><button type="button" class="live-mute-button ${state.liveMuted?'is-muted':''}" id="live-talk-mute" aria-pressed="${state.liveMuted}" aria-label="${state.liveMuted?'Unmute your microphone; Zeus audio stays on':'Mute your microphone; Zeus audio stays on'}" title="${state.liveMuted?'Unmute your microphone':'Mute your microphone'}">${icon(state.liveMuted?'mic-off':'mic')}</button><button type="button" class="live-end-call" id="live-talk-end" aria-label="End Live Talk" title="End Live Talk">${icon('close')}</button></div><div class="live-control-caption">Mute your microphone; Zeus can keep speaking</div></footer>
  </main>`;
}
function liveTalkDock(){
  const status=state.liveTalkStopRequested?'Finishing turn':state.liveMuted?'Mic muted · Zeus audio on':state.liveStage==='speaking'?'Zeus speaking':state.liveStage==='processing'?'Processing':state.liveStage==='error'?'Paused':state.liveStage==='connecting'?'Connecting':'Listening';
  return `<aside class="live-talk-dock" role="region" aria-label="Live Talk controls"><button type="button" class="live-dock-open" id="live-talk-dock-open" aria-label="Open Live Talk"><span class="live-dock-light ${state.liveStage==='error'?'is-error':''}"></span><span class="live-dock-copy"><strong>ZEUS · LIVE</strong><small>${esc(status)}</small></span><span class="live-dock-expand" aria-hidden="true">↗</span></button><button type="button" class="live-dock-action ${state.liveMuted?'is-muted':''}" id="live-talk-dock-mute" aria-pressed="${state.liveMuted}" aria-label="${state.liveMuted?'Unmute your microphone; Zeus audio stays on':'Mute your microphone; Zeus audio stays on'}" title="${state.liveMuted?'Unmute your microphone':'Mute your microphone'}">${icon(state.liveMuted?'mic-off':'mic')}</button><button type="button" class="live-dock-action live-dock-end" id="live-talk-dock-end" aria-label="End Live Talk" title="End Live Talk">${icon('close')}</button></aside>`;
}
function appView(){const page=state.tab==='Home'?homeView():state.tab==='Projects'?projectsView():state.tab==='Tools'?toolsView():state.tab==='Files'?filesView():settingsView();return `<div class="app-shell">${sidebar()}<main class="main" id="main-content" tabindex="-1">${topbar()}${page}</main><div id="modal-root"></div>${state.liveTalkMinimized&&state.liveTalk?liveTalkDock():''}${state.liveTalk&&!state.liveTalkMinimized?liveTalkExperience():''}</div>`}
function focusKey(el){
  if(!el||el===document.body||!app.contains(el))return null;
  if(el.id)return `#${CSS.escape(el.id)}`;
  for(const attr of ['data-tab','data-mode','data-conv','data-project','data-project-section','data-filter','data-task','data-prompt','data-tool-prompt']){
    if(el.hasAttribute(attr))return `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
  }
  return null;
}
function render(){
  const active=document.activeElement;const key=focusKey(active);
  const selection=active?.id==='composer-text'?{start:active.selectionStart,end:active.selectionEnd}:null;
  const scopeSidebar=Boolean(active?.closest?.('.sidebar'));
  clearModalLifecycle();modalReturnFocus=null;if(!state.authReady){app.innerHTML='<div class="boot-screen" role="status">INITIALIZING ZEUS</div>';return;} app.innerHTML=appView();bind();
  localizeInterface(app);syncDrawerAccessibility();
  const offCanvasSidebar=scopeSidebar&&!state.drawer&&window.matchMedia('(max-width:959px)').matches;
  if(key&&offCanvasSidebar){$('#main-content')?.focus({preventScroll:true});}
  else if(key){const candidates=$$(key,app);const next=candidates.find(el=>Boolean(el.closest('.sidebar'))===scopeSidebar)||candidates[0];if(next&&!next.disabled){next.focus({preventScroll:true});if(selection&&next.setSelectionRange){try{next.setSelectionRange(selection.start,selection.end)}catch{}}}}
  announce(state.error||state.execStatus);
  requestAnimationFrame(()=>{const s=$('#chat-scroll');if(!s)return;if(state.chatRestore){const r=state.chatRestore;state.chatRestore=null;s.scrollTop=Math.max(0,s.scrollHeight-r.height+r.top);}else s.scrollTop=s.scrollHeight;}); }

function bind(){
  $('#hamburger')?.addEventListener('click',()=>{state.drawer=!state.drawer;render();if(state.drawer)requestAnimationFrame(()=>$('.sidebar .side-nav button.active,.sidebar .side-nav button')?.focus())}); $('#scrim')?.addEventListener('click',()=>{state.drawer=false;render();$('#hamburger')?.focus()});
  $$('[data-message-feedback]').forEach(button=>button.addEventListener('click',()=>setMessageFeedback(button.dataset.messageId,button.dataset.messageFeedback)));
  $$('[data-message-speak]').forEach(button=>button.addEventListener('click',()=>toggleMessageSpeech(button.dataset.messageSpeak)));
  $('#close-navigation')?.addEventListener('click',()=>{state.drawer=false;render();$('#hamburger')?.focus()});
  $$('.copy-code').forEach(button=>button.addEventListener('click',async()=>{
    const code=button.parentElement.querySelector('code')?.textContent||'';
    if(!code)return;
    try{
      let copied=false;
      try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(code);copied=true;}}catch{}
      if(!copied){
        // Older/in-app browsers may lack the asynchronous Clipboard API.
        const input=document.createElement('textarea');
        input.value=code;
        input.setAttribute('readonly','');
        input.style.cssText='position:fixed;top:-9999px;left:0;opacity:0';
        document.body.appendChild(input);
        try{
          input.select();
          copied=typeof document.execCommand==='function'&&document.execCommand('copy');
        }finally{input.remove();}
      }
      if(!copied)throw new Error('Clipboard access unavailable');
      button.textContent='Copiado';
      announce('Código copiado.');
    }catch{
      button.textContent='Não foi possível copiar';
      announce('Não foi possível copiar. Selecione o código e copie manualmente.');
    }
  }));
  $('#profile-avatar')?.addEventListener('click',()=>{state.tab='Settings';render()});
  $$('[data-google-service]').forEach(b=>b.addEventListener('click',()=>googleConnectionAction(b.dataset.googleService,b.dataset.googleAction)));
  $$('[data-google-search]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();const data=new FormData(form);searchGoogle(form.dataset.googleSearch,String(data.get('q')||''));}));
  $$('[data-google-next]').forEach(button=>button.addEventListener('click',()=>{const service=button.dataset.googleNext,result=state.googleSearchResults[service];if(result?.nextPageToken)searchGoogle(service,state.googleSearchQueries[service]||'',result.nextPageToken);}));

  $('#preferences-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    const label=$('#preferences-saved');
    if(button)button.disabled=true;
    if(label)label.textContent='Saving…';
    try{
      const value={
        personality:$('#zeus-personality').value,
        instructions:$('#zeus-global-instructions').value
      };
      const saved=await api('/api/preferences',{method:'PUT',body:JSON.stringify(value)});
      state.preferences={personality:saved.personality,instructions:saved.instructions};
      state.preferencesLoaded=true;
      if(label)label.textContent='Saved for chat and Live Talk.';
    }catch(error){
      if(label)label.textContent='Could not save.';
      state.error=error.message||'Could not save preferences.';
    }finally{if(button)button.disabled=false;}
  });
  $('#voice-avatar')?.addEventListener('change',e=>{const v=e.target.value;if(VOICE_AVATARS.has(v)){state.voiceAvatar=v;localStorage.setItem('zeus-voice-avatar',v);render();}});
  $('#live-language')?.addEventListener('change',e=>{const v=e.target.value;if(Object.prototype.hasOwnProperty.call(LIVE_LOCALES,v)){state.liveLocale=v;localStorage.setItem('zeus-live-locale',v);render();}});
  $('#elevenlabs-voice-preset')?.addEventListener('change',e=>{const value=String(e.target.value||'');if(value){const input=$('#elevenlabs-voice-id');if(input)input.value=value;saveVoiceSettings({elevenLabsVoiceId:value,source:'preset'});}});
  $('#reload-elevenlabs-voices')?.addEventListener('click',()=>loadElevenLabsVoices());
  $('#load-more-elevenlabs-voices')?.addEventListener('click',()=>loadElevenLabsVoices({append:true}));
  if($('#elevenlabs-voice-preset')&&!state.elevenLabsVoicesLoaded&&!state.elevenLabsVoicesLoading)loadElevenLabsVoices();
  $('#save-voice-id')?.addEventListener('click',()=>{saveVoiceSettings({elevenLabsVoiceId:$('#elevenlabs-voice-id')?.value||'',source:'button'});});
  $('#test-voice')?.addEventListener('click',()=>{testElevenLabsVoice();});
  $$('[data-tab]').forEach(b=>b.addEventListener('click',async()=>{
    const next=b.dataset.tab;state.drawer=false;
    if(next==='Home' && state.currentProject){
      state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.activeMode=null;state.error='';
      history.replaceState({},'',location.pathname);
      refreshLiveTalkContext();
    }
    state.tab=next;
    try{
      if(state.tab==='Projects'){await loadProjects();if(state.currentProject?.id)await hydrateProjectWorkspace(state.currentProject.id,{loadConversation:false});else state.tasks=[];}
      if(state.tab==='Files')await Promise.all([loadFiles(),loadArtifacts()]);
      if(state.tab==='Tools')await Promise.all([loadHealth(),loadFiles(),loadArtifacts()]);
      if(state.tab==='Settings')await Promise.all([loadHealth(),loadGoogleConnections(),loadPreferences()]);
    }catch(err){
      console.error(`Could not load ${next}`,err);
      state.error=err?.message||`Could not load ${next}.`;
    }
    render();resetViewport();
  }));
  $('#new-chat')?.addEventListener('click',newChat);
  $('#project-source-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget;
    const id=$('#project-source-id')?.value||'';
    try{await api('/api/project-sources',{method:id?'PUT':'POST',body:JSON.stringify({projectId:state.currentProject.id,...(id?{id}:{}),title:$('#project-source-title').value,content:$('#project-source-content').value,sourceFileId:$('#project-source-file')?.value||null})});form.reset();await loadProjectSources();state.error='';}
    catch(err){state.error=err.message||'Could not save source.';}render();
  });
  $$('[data-source-edit]').forEach(b=>b.addEventListener('click',()=>{
    const source=state.projectSources.find(s=>s.id===b.dataset.sourceEdit);if(!source)return;
    $('#project-source-id').value=source.id;$('#project-source-title').value=source.title;$('#project-source-content').value=source.content||'';$('#project-source-file').value=source.source_file_id||'';
    $('#project-source-title').focus();$('#project-source-form').scrollIntoView({behavior:'smooth',block:'center'});
  }));
  $$('[data-source-remove]').forEach(b=>b.addEventListener('click',async()=>{
    if(!confirm('Remove this Source of Truth?'))return;
    try{await api('/api/project-sources',{method:'DELETE',body:JSON.stringify({projectId:state.currentProject.id,id:b.dataset.sourceRemove})});await loadProjectSources();state.error='';}
    catch(err){state.error=err.message||'Could not remove source.';}render();
  }));
  $$('[data-move-current]').forEach(b=>b.addEventListener('click',()=>moveConversationModal(b.dataset.moveCurrent)));
  $('#chat-search')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();let shown=0;$$('.recent-item').forEach(x=>{const match=x.textContent.toLowerCase().includes(q);x.style.display=match?'block':'none';if(match)shown++;});$('#recent-empty')?.classList.toggle('hidden',!q||shown>0||!$$('.recent-item').length);});
  $$('[data-dismiss-error]').forEach(b=>b.addEventListener('click',dismissError));
  $('#retry-services')?.addEventListener('click',()=>bootstrapApp().catch(err=>{state.error=err.message||'Zeus could not load the workspace.';render();}));
  $$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(state.sending)return;state.mode=b.dataset.mode==='OLYMPUS'?'OLYMPUS':'ZEUS';state.activeLevel=null;render();}));
  $$('[data-open-output]').forEach(b=>b.addEventListener('click',()=>openPrivateOutput(b.dataset.openOutput,b.dataset.outputName,b.dataset.outputMime).catch(e=>{state.error=e.message;render();})));
  $$('[data-download-output]').forEach(b=>b.addEventListener('click',()=>downloadPrivateOutput(b.dataset.downloadOutput,b.dataset.outputName).catch(e=>{state.error=e.message;render();})));
  $$('[data-use-artifact]').forEach(b=>b.addEventListener('click',async()=>{await attachSavedArtifact(b.dataset.useArtifact);if(!state.error){state.tab=state.currentProject?'Projects':'Home';if(state.currentProject)state.projectSection='CHAT';render();$('#composer-text')?.focus();}}));
  $$('[data-edit-html]').forEach(b=>b.addEventListener('click',()=>openHtmlEditor(b.dataset.editHtml)));
  $$('[data-compare-artifact]').forEach(b=>b.addEventListener('click',openCompareArtifacts));
  $$('[data-compare-select]').forEach(b=>b.addEventListener('click',async()=>{
    try{await api('/api/artifact-aliases',{method:'PUT',body:JSON.stringify({projectId:state.currentProject?.id||null,artifactId:b.dataset.compareSelect,alias:`preferred-${b.dataset.compareType||'file'}`})});state.error='';state.execStatus=`Saved your preferred ${String(b.dataset.compareType||'').toUpperCase()} artifact in this workspace.`;setTimeout(()=>{if(state.execStatus.startsWith('Saved your preferred')){state.execStatus='';render();}},2200);render();}
    catch(error){state.error=error.message||'Could not save the preferred version.';render();}
  }));
  $$('[data-compare-retry]').forEach(b=>b.addEventListener('click',async()=>{
    const userMessage=[...state.messages].reverse().find(m=>m.role==='user'&&m.execution_id===b.dataset.compareRetry);
    if(!userMessage){state.error='Original comparison request is unavailable in this conversation.';render();return;}
    state.compareType=b.dataset.compareType||null;
    await sendText(userMessage.content||'',[],crypto.randomUUID(),userMessage.mode==='OLYMPUS'?'OLYMPUS':'ZEUS');
  }));
  $$('[data-compare-combine]').forEach(b=>b.addEventListener('click',async()=>{
    await attachSavedArtifact(b.dataset.compareCombine);
    if(state.error)return;
    await attachSavedArtifact(b.dataset.compareWith);
    if(state.error)return;
    const type=String(b.dataset.compareType||'pdf').toUpperCase();
    state.compareType=null;state.tab='Home';if(state.currentProject)state.projectSection='CHAT';
    state.draft=`Create a new version C as a complete ${type} file, combining the strongest parts of both attached alternatives. Preserve their useful differences, resolve conflicts thoughtfully, and save C as a separate artifact.\n\nMy instructions: `;
    render();requestAnimationFrame(()=>$('#composer-text')?.focus());
  }));
  $$('[data-github-commit]').forEach(b=>b.addEventListener('click',()=>githubCommitModal(b.dataset.githubCommit,b.dataset.sourceId,b.dataset.sourceName)));
  hydratePrivateImages();
  $$('[data-conv]').forEach(b=>b.addEventListener('click',()=>openConversation(b.dataset.conv)));
  $$('.quick-prompts button').forEach(b=>b.addEventListener('click',()=>{const t=$('#composer-text');if(!t)return;t.value=b.dataset.prompt;t.dispatchEvent(new Event('input',{bubbles:true}));t.focus()}));
  $('#composer')?.addEventListener('submit',sendMessage); const composerText=$('#composer-text');const sizeComposer=()=>{if(!composerText)return;composerText.style.height='auto';composerText.style.height=`${Math.min(160,Math.max(26,composerText.scrollHeight))}px`;};composerText?.addEventListener('input',()=>{state.draft=composerText.value;sizeComposer();});composerText?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('#composer')?.requestSubmit();}});if(composerText?.value)sizeComposer();
  $('#attach')?.addEventListener('click',()=>{state.attachMenu=!state.attachMenu;render();if(state.attachMenu)requestAnimationFrame(()=>$('#attach-media')?.focus());}); $('#upload-files')?.addEventListener('click',()=>$('#global-file-input').click());
  $('#attach-media')?.addEventListener('click',()=>$('#global-media-input').click()); $('#attach-camera')?.addEventListener('click',()=>$('#global-camera-input').click()); $('#attach-file')?.addEventListener('click',()=>$('#global-file-input').click());
  $('#attach-saved')?.addEventListener('click',()=>{state.attachMenu=false;openSavedArtifactPicker();});
  const handleUpload=async e=>{const files=[...e.target.files];e.target.value='';state.attachMenu=false;for(const f of files)await uploadFile(f);};
  const handleMedia=async e=>{const files=[...e.target.files];e.target.value='';await handleMediaFiles(files);render();};
  $('#global-file-input').onchange=handleUpload; $('#global-media-input').onchange=handleMedia; $('#global-camera-input').onchange=handleMedia;
  $$('[data-remove-file]').forEach(b=>b.addEventListener('click',()=>{state.attachedFiles=state.attachedFiles.filter(f=>f.id!==b.dataset.removeFile);render()}));
  $('#voice')?.addEventListener('click',startVoice);
  $('#live-talk')?.addEventListener('click',toggleLiveTalk);
  $('#live-talk-minimize')?.addEventListener('click',minimizeLiveTalk);
  $$('#live-talk-end,#live-talk-dock-end').forEach(button=>button.addEventListener('click',finishLiveTalkSession));
  $('#live-talk-dock-open')?.addEventListener('click',restoreLiveTalk);
  $('#live-talk-mute')?.addEventListener('click',toggleLiveTalkMute);
  $('#live-talk-dock-mute')?.addEventListener('click',toggleLiveTalkMute);
  $('#live-talk-voice')?.addEventListener('change',event=>changeLiveTalkVoice(event.currentTarget.value));
  $('#live-talk-refresh-voices')?.addEventListener('click',()=>loadElevenLabsVoices());
  $('#live-talk-load-more-voices')?.addEventListener('click',()=>loadElevenLabsVoices({append:true}));
  $('#live-talk-text')?.addEventListener('input',event=>{state.liveTextDraft=event.target.value;state.liveTextStatus='';try{state.liveAgentConversation?.sendUserActivity?.();}catch{}});
  $('#live-talk-text-form')?.addEventListener('submit',sendLiveTalkText);
  $('#live-talk-retry')?.addEventListener('click',retryLiveTalk);
  $('#retry-last')?.addEventListener('click',retryLastMessage);
  $('#zeus-level-cap')?.addEventListener('change',e=>{const n=Number(e.target.value);if([1,2,3].includes(n)){localStorage.setItem('zeus.maxLevel.v1',String(n));render();}});
  $('#olympus-auto')?.addEventListener('change',e=>{state.olympusAuto=e.target.checked;try{localStorage.setItem(autoModeKey(),String(state.olympusAuto));}catch{}render();});
  $('#approve-olympus-five')?.addEventListener('click',approveNextOlympusFive);
  $('#load-older-messages')?.addEventListener('click',loadOlderMessages);
  $('#load-older-outputs')?.addEventListener('click',loadOlderOutputs);
  $('#create-project')?.addEventListener('click',projectModal); $('#home-create-project')?.addEventListener('click',projectModal); $('#create-project-empty')?.addEventListener('click',projectModal);
  $$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{state.projectFilter=b.dataset.filter;render()}));
  $$('[data-project]').forEach(b=>{b.addEventListener('click',()=>openProjectWorkspace(b.dataset.project));b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProjectWorkspace(b.dataset.project);}});});
  $$('[data-project-section]').forEach(b=>b.addEventListener('click',async()=>{state.projectSection=b.dataset.projectSection;try{if(state.projectSection==='MEMORY'&&state.currentProject)await loadMemories(state.currentProject.id);if(state.projectSection==='SOURCE'&&state.currentProject)await loadProjectSources();}catch(err){state.error=err?.message||'Could not load project memory.';}render();resetViewport()}));
  $('#edit-project')?.addEventListener('click',projectEditModal);
  $('#back-projects')?.addEventListener('click',async()=>{state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.activeMode=null;state.projectMemories=[];state.memoryPolicy=null;state.projectSection='CHAT';state.messagePage={hasMore:false,nextCursor:null};state.tasks=[];state.error='';history.replaceState({},'',location.pathname);refreshLiveTalkContext();render()});
  $('#task-form')?.addEventListener('submit',createTask); $$('[data-task]').forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;b.disabled=true;b.setAttribute('aria-busy','true');toggleTask(b.dataset.task,b.dataset.status);}));
  $('#memory-form')?.addEventListener('submit',createMemory); $$('[data-memory-delete]').forEach(b=>b.addEventListener('click',()=>deleteMemory(b.dataset.memoryDelete)));
  $$('[data-delete-output]').forEach(b=>b.addEventListener('click',()=>deleteOutput(b.dataset.deleteOutput,b.dataset.outputId)));
  $('#delete-project')?.addEventListener('click',deleteCurrentProject);
  $('#upload-project-file')?.addEventListener('click',()=>$('#global-file-input').click());
  $$('[data-compare-start]').forEach(b=>b.addEventListener('click',()=>startCompareFormat(b.dataset.compareStart)));
  $$('[data-tool-prompt]').forEach(b=>b.addEventListener('click',()=>{state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.activeMode=null;state.messagePage={hasMore:false,nextCursor:null};state.error='';state.tab='Home';history.replaceState({},'',location.pathname);state.draft=b.dataset.toolPrompt;render();setTimeout(()=>{const t=$('#composer-text');if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}},0)}));
}
document.addEventListener('keydown',e=>{
  if(state.drawer&&window.matchMedia('(max-width:959px)').matches&&e.key==='Tab'){
    const targets=$$('button:not([disabled]),input:not([disabled]),a[href]', $('#app-sidebar')).filter(el=>el.offsetParent!==null);
    const first=targets[0],last=targets[targets.length-1];
    if(first&&(!$('#app-sidebar').contains(document.activeElement)||(e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last))){e.preventDefault();(e.shiftKey?last:first).focus();}
  }
  if(e.key!=='Escape'||$('#modal-root')?.childElementCount)return;
  if(state.attachMenu){state.attachMenu=false;render();$('#attach')?.focus();return;}
  if(state.drawer){state.drawer=false;render();$('#hamburger')?.focus();}
});
function syncDrawerAccessibility(){
  const sidebar=$('#app-sidebar'),main=$('#main-content');if(!sidebar)return;
  const mobile=window.matchMedia('(max-width:959px)').matches;
  sidebar.inert=mobile&&!state.drawer;
  sidebar.setAttribute('aria-hidden',String(mobile&&!state.drawer));
  if(main)main.inert=mobile&&state.drawer;
  document.documentElement.classList.toggle('drawer-open',mobile&&state.drawer);
  if(mobile&&state.drawer){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');}
  else {sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}
}
window.matchMedia('(max-width:959px)').addEventListener('change',()=>{state.drawer=false;syncDrawerAccessibility();if(document.activeElement?.closest('.sidebar')&&$('#app-sidebar')?.inert)$('#hamburger')?.focus();});
window.addEventListener('online',()=>{state.offline=false;if(state.user)render();});
window.addEventListener('offline',()=>{state.offline=true;if(state.user)render();});
window.addEventListener('unhandledrejection',e=>{console.error('Unhandled Zeus error',e.reason);if(state.user&&!state.error){state.error=e.reason?.message||'Something went wrong. Try again.';render();}});
async function newChat(){
  state.currentConversation=null;state.currentProject=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.draft='';state.activeMode=null;state.activeLevel=null;
  state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.lastFailedMode=null;state.messagePage={hasMore:false,nextCursor:null};
  state.tab='Home';state.drawer=false;history.replaceState({},'',location.pathname);render();resetViewport();
}
function moveConversationModal(conversationId){
  const projects=state.projects||[];
  if(!projects.length){state.error='Create a project first.';render();return;}
  const options=projects.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  showModal(`<div class="modal-backdrop"><div class="modal" aria-labelledby="conversation-transfer-title"><div class="modal-head"><h2 id="conversation-transfer-title">Move conversation</h2><button type="button" class="ghost" id="modal-close" aria-label="Close dialog">×</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert"></div><form id="conversation-transfer-form" class="form-grid"><p class="muted tiny">Move this conversation, its files and artifacts into a project.</p><label for="conversation-target-project">Destination project</label><select id="conversation-target-project" required>${options}</select><div class="modal-actions"><button type="submit" class="primary">Move to project</button></div></form></div></div>`,{initialFocus:'#conversation-target-project'});
  $('#modal-close')?.addEventListener('click',()=>closeModal());
  $('#conversation-transfer-form')?.addEventListener('submit',async e=>{
    e.preventDefault();
    try{const d=await api('/api/conversations',{method:'PATCH',body:JSON.stringify({conversationId,projectId:$('#conversation-target-project').value,operation:'move'})});
      closeModal();await Promise.all([loadProjects(),loadConversations()]);await openConversation(d.conversationId);}
    catch(err){setModalError(err.message||'Transfer failed.');}
  });
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
      artifacts:(m.metadata?.artifacts||[]).map(id=>(d.artifacts||[]).find(a=>a.id===id)).filter(Boolean),
      attachments:(m.metadata?.attachments||[]).map(fid=>(typeof fid==='object'?fid:fileIndex[fid]||{id:fid,filename:'Attached file'}))
    }));
    state.chatArtifacts=d.artifacts||[];
    state.artifacts=mergeById(state.artifacts,d.artifacts||[]);
    state.messagePage={hasMore:Boolean(d.page?.hasMore),nextCursor:d.page?.nextCursor||null};
    syncActiveModeFromMessages();
    state.tab=state.currentProject?'Projects':'Home';state.drawer=false;
    history.replaceState({},'',state.currentProject?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${encodeURIComponent(id)}`);
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
  if(voiceCaptureActive()){
    state.voiceSubmitRequested=true;
    state.execStatus='Finishing audio, then sending…';render();
    stopVoiceRecording();
    return;
  }
  const text=$('#composer-text')?.value.trim()||'';
  if(!text||state.sending)return;
  await sendText(text,[...state.attachedFiles]);
}
async function sendVoiceTranscript(transcript){
  const typed=String($('#composer-text')?.value||state.draft||'').trim();
  state.draft='';
  await sendText([typed,String(transcript||'').trim()].filter(Boolean).join('\n\n'),[...state.attachedFiles]);
}
async function pollForReply(conversationId, executionId){
  const deadline=Date.now()+180000;let waitMs=1800,lastStatusPaint=0;
  while(Date.now()<deadline){
    const pause=document.visibilityState==='hidden'?Math.max(waitMs,5500):waitMs;
    await new Promise(r=>setTimeout(r,pause));
    try{
      const page=await api(`/api/chat?conversationId=${encodeURIComponent(conversationId)}&limit=30`);
      const assistant=(page.messages||[]).find(m=>m.role==='assistant'&&m.execution_id===executionId);
      if(assistant){
        const ids=new Set(Array.isArray(assistant.metadata?.artifacts)?assistant.metadata.artifacts:[]);
        const artifacts=(page.artifacts||[]).filter(a=>ids.has(a.id));
        return {page,assistant:{...assistant,artifacts}};
      }
      const userRow=(page.messages||[]).find(m=>m.role==='user'&&m.execution_id===executionId);
      if(userRow?.metadata?.failed){const code=userRow.metadata.errorCode||'AI_EXECUTION_FAILED';throw apiError(code==='OLYMPUS_APPROVAL_REQUIRED'?'Olympus needs explicitly authorized extra $5.':'Olympus could not finish. Tap Retry.',code==='OLYMPUS_APPROVAL_REQUIRED'?402:503,code,{executionId});}
      if(Date.now()-lastStatusPaint>12000){state.execStatus='Olympus is still writing one answer…';lastStatusPaint=Date.now();render();}
    }catch(error){
      if(error?.code==='AI_EXECUTION_FAILED'||error?.status===401)throw error;
      if(!([0,502,503,504].includes(Number(error?.status||0))||error?.code==='CONNECTION_INTERRUPTED'))throw error;
      if(Date.now()-lastStatusPaint>12000){state.execStatus='Olympus is still working · reconnecting to its result…';lastStatusPaint=Date.now();render();}
    }
    waitMs=Math.min(5500,Math.round(waitMs*1.35));
  }
  throw apiError('Olympus is still working. Wait a moment, then tap Retry to collect the reply.',503,'REQUEST_IN_PROGRESS');
}
async function sendText(text,pendingAttachments=[],requestId=crypto.randomUUID(),requestedMode=state.mode,turboApproval=null,resumeExecutionId=null,options={}){
  const voiceCommand=options?.voiceCommand===true;
  if(!text||state.sending)return voiceCommand?JSON.stringify({ok:false,error:'Another OlyHub request is already running.'}):undefined;
  const pending=[...(pendingAttachments||[])],liveTalkTurn=options?.liveTalk===true,mode=liveTalkTurn?'ZEUS':requestedMode==='OLYMPUS'?'OLYMPUS':'ZEUS',compareType=liveTalkTurn||voiceCommand?null:state.compareType;
  const optimistic={id:crypto.randomUUID(),role:'user',mode,content:text,artifacts:[],attachments:pending};
  state.messages.push(optimistic);
  state.attachedFiles=[];state.draft='';
  state.sending=true;state.activeMode=mode;state.activeLevel=null;state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.lastFailedMode=null;state.lastFailedTurboApproval=null;state.lastFailedCompareType=null;
  state.execTitle=mode==='OLYMPUS'?'Olympus is working':'Zeus is working';
  state.execStatus=liveTalkTurn?'Preparing a quick spoken reply…':'Choosing the model for this request…';render();
  const timer=setTimeout(()=>{
    if(!state.sending)return;
    state.execStatus=state.activeMode==='OLYMPUS'?'Olympus is drafting, then writing one answer…':'Running the selected model…';render();
  },1400);
  try{
    const payload={
      conversationId:state.currentConversation,
      projectId:state.currentProject?.id||null,
      content:text,
      fileIds:pending.map(f=>f.id),
      olympusAuto:liveTalkTurn?false:automaticOlympus(),
      maxZeusLevel:liveTalkTurn?1:selectedZeusLevelCap(),
      ...(liveTalkTurn?{liveTalk:true}:{}),
      mode,
      requestId,
      ...(compareType?{comparePair:true,compareType}:{}),
      ...(turboApproval?{turboApproval}:{}),
      ...(resumeExecutionId?{resumeExecutionId}:{})
    };
    let d;
    try{
      d=await api('/api/chat',{method:'POST',body:JSON.stringify(payload),requestId});
    }catch(firstError){
      if(firstError?.code!=='TURBO_APPROVAL_REQUIRED'||!firstError?.data?.approvalFingerprint)throw firstError;
      const approved=await turboApprovalModal(firstError.data.quote||{});
      if(!approved){
        state.messages=state.messages.filter(m=>m.id!==optimistic.id);
        state.attachedFiles=pending;state.draft=text;state.execStatus='';state.activeLevel=null;state.activeMode=mode;
        return;
      }
      turboApproval=firstError.data.approvalFingerprint;
      payload.turboApproval=turboApproval;
      state.execStatus='Complex Turbo approved · starting bounded execution…';render();
      d=await api('/api/chat',{method:'POST',body:JSON.stringify(payload),requestId});
    }
    state.currentConversation=d.conversationId;
    if(d.mode)state.activeMode=d.mode;if(d.level)state.activeLevel=d.level;
    state.execTitle=d.mode==='OLYMPUS'?'Olympus is working':'Zeus is working';
    if(d.modeExplanation)state.execStatus=d.modeExplanation;
    history.replaceState({},'',state.currentProject?.id?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${encodeURIComponent(d.conversationId)}`);
    if(d.userMessage){
      const idx=state.messages.findIndex(m=>m.id===optimistic.id);
      if(idx>=0)state.messages[idx]={...d.userMessage,attachments:pending,artifacts:[]};
    }
    let assistant=d.message||null;
    if(d.pending){
      state.execTitle='Olympus is working';
      state.execStatus=d.modeExplanation||'Olympus is drafting, then writing one answer…';
      render();
      const polled=await pollForReply(d.conversationId,d.execution?.id);
      assistant=polled.assistant;
      if(assistant?.mode)state.activeMode=assistant.mode;if(assistant?.metadata?.executionLevel)state.activeLevel=assistant.metadata.executionLevel;
    }
    if(assistant){
      if(assistant.mode)state.activeMode=assistant.mode;if(assistant?.metadata?.executionLevel)state.activeLevel=assistant.metadata.executionLevel;
      const deliveredArtifacts=d.artifacts||assistant.artifacts||[];
      state.messages.push({...assistant,artifacts:deliveredArtifacts});
      if(deliveredArtifacts.length){state.chatArtifacts=mergeById(state.chatArtifacts,deliveredArtifacts);state.artifacts=mergeById(state.artifacts,deliveredArtifacts);}
      if(liveTalkTurn&&state.liveTalk){
        try{
          state.liveStage='speaking';state.error='';render();
          const {blob}=await requestSpeechAudio(assistant.content||'',{elevenLabsVoiceId:state.elevenLabsVoiceId||storedElevenLabsVoiceId()});
          if(!state.liveTalk)return;
          const audio=state.voiceReplyAudio||new Audio();state.voiceReplyAudio=audio;
          if(state.liveAudioUrl)URL.revokeObjectURL(state.liveAudioUrl);
          state.liveAudioUrl=URL.createObjectURL(blob);audio.src=state.liveAudioUrl;audio.muted=false;audio.volume=1;audio.playsInline=true;
          await audio.play();audio.onended=()=>{if(state.liveTalk){state.liveStage=state.liveAgentConversation?'listening':'error';render();}};
        }catch(error){state.liveStage=state.liveAgentConversation?'listening':'error';state.error=`Text reply arrived, but voice playback failed: ${error?.message||'tap the screen and retry'}`;}
      }
    }
    if(compareType)state.compareType=null;
    state.execStatus='Completed';
    await Promise.allSettled([loadConversations(),loadProjects()]);
    setTimeout(()=>{if(state.execStatus==='Completed'&&!state.sending){state.execStatus='';state.execTitle='';render();}},900);
    if(voiceCommand)return assistant?JSON.stringify({ok:true,mode:assistant.mode||state.activeMode||mode,level:assistant.metadata?.executionLevel||state.activeLevel||null,reply:String(assistant.content||'')}):JSON.stringify({ok:false,error:'OlyHub finished without returning an answer.'});
  }catch(err){
    if(err?.code==='REQUEST_IN_PROGRESS'){
      if(err.data?.conversationId&&!state.currentConversation)state.currentConversation=err.data.conversationId;
      state.error='Zeus is still finishing this request. Wait a few seconds, then tap Retry to get the reply.';
    }else state.error=err.message||'Request failed.';
    state.execStatus='';state.activeMode=mode;state.activeLevel=null;
    state.lastFailedText=text;
    state.lastFailedMessageId=optimistic.id;
    state.lastFailedAttachments=pending;
    state.lastFailedRequestId=requestId;state.lastFailedMode=mode;state.lastFailedTurboApproval=turboApproval;
    state.lastFailedCompareType=compareType;
    state.lastFailedBudgetExecutionId=err?.code==='OLYMPUS_APPROVAL_REQUIRED'?err?.data?.executionId||null:null;
    state.lastFailedResumeExecutionId=mode==='ZEUS'?err?.data?.executionId||null:null;
    if(voiceCommand)return JSON.stringify({ok:false,error:String(err?.message||'OlyHub could not complete the command.')});
  }finally{clearTimeout(timer);state.sending=false;render();}
}
async function approveNextOlympusFive(){
 const executionId=state.lastFailedBudgetExecutionId;
 if(!executionId||state.sending)return;
 try{
  const before=await api('/api/olympus-budget?executionId='+encodeURIComponent(executionId));
  const beforeDollars=(before.authorizedCents/100).toFixed(2);
  const afterDollars=((before.authorizedCents+500)/100).toFixed(2);
  if(!confirm('Authorize exactly $5 additional spend for this Olympus job? '+beforeDollars+' → '+afterDollars+' USD.'))return;
  await api('/api/olympus-budget',{method:'POST',body:JSON.stringify({executionId,authorization:'add_five_usd',expectedAuthorizedCents:before.authorizedCents})});
  state.lastFailedBudgetExecutionId=null;
  await retryLastMessage();
 }catch(error){state.error=error.message||'Budget authorization failed.';render();}
}
async function retryLastMessage({liveTalk=false}={}){
  if(!state.lastFailedText||state.sending)return;
  if(!window.confirm('Try again? This may start another paid attempt. Saved completed stages will be reused when available.'))return;
  const text=state.lastFailedText;
  const pending=[...state.lastFailedAttachments];
  let requestId=state.lastFailedRequestId||crypto.randomUUID();
  const mode=state.lastFailedMode||state.mode,turboApproval=state.lastFailedTurboApproval||null;
  const compareType=state.lastFailedCompareType||null;
  let resumeExecutionId=null;
  if(mode==='ZEUS'&&state.lastFailedResumeExecutionId){
    try{
      const checkpoints=await api('/api/production-checkpoints?executionId='+encodeURIComponent(state.lastFailedResumeExecutionId));
      if((checkpoints.phases||[]).some(x=>x.state==='COMPLETED')){
        resumeExecutionId=state.lastFailedResumeExecutionId;
        requestId=crypto.randomUUID();
      }
    }catch{}
  }
  if(state.lastFailedMessageId)state.messages=state.messages.filter(m=>m.id!==state.lastFailedMessageId);
  state.error='';state.lastFailedText='';state.lastFailedMessageId=null;state.lastFailedAttachments=[];state.lastFailedRequestId=null;state.lastFailedMode=null;state.lastFailedTurboApproval=null;state.lastFailedCompareType=null;state.compareType=compareType;render();
  if(liveTalk)await sendText(text,pending,requestId,mode,turboApproval,resumeExecutionId,{liveTalk:true});
  else await sendText(text,pending,requestId,mode,turboApproval,resumeExecutionId);
}
function mediaBaseName(name='media'){return String(name||'media').replace(/\.[^.]+$/,'').replace(/[^a-z0-9._-]+/gi,'-').slice(0,100)||'media';}
function canvasJpeg(canvas,quality=.82){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not encode image.')),'image/jpeg',quality));}
async function imageElementFromFile(file){const url=URL.createObjectURL(file);try{const img=new Image();img.decoding='async';await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('This image format could not be decoded on this device.'));img.src=url;});return {img,url};}catch(error){URL.revokeObjectURL(url);throw error;}}
async function normalizeMediaImage(file){const supported=/^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(file.type||'');if(supported&&file.size<=1500*1024)return file;const {img,url}=await imageElementFromFile(file);try{const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth||1,img.naturalHeight||1)),w=Math.max(1,Math.round((img.naturalWidth||1)*scale)),h=Math.max(1,Math.round((img.naturalHeight||1)*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);let blob=await canvasJpeg(canvas,.84);if(blob.size>1500*1024)blob=await canvasJpeg(canvas,.70);return new File([blob],`${mediaBaseName(file.name)}.jpg`,{type:'image/jpeg',lastModified:Date.now()});}finally{URL.revokeObjectURL(url);}}
async function sampleVideoFrames(file,maxFrames=3){const url=URL.createObjectURL(file),video=document.createElement('video');video.preload='auto';video.muted=true;video.playsInline=true;video.src=url;try{await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(new Error('This video could not be decoded on this device.'));});const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:1,points=Array.from({length:maxFrames},(_,i)=>(i+1)/(maxFrames+1)),out=[];for(let i=0;i<points.length;i++){const t=Math.max(0,Math.min(Math.max(0,duration-.05),duration*points[i]));await new Promise((resolve,reject)=>{let timer;const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve();};video.addEventListener('seeked',done,{once:true});video.currentTime=t;timer=setTimeout(()=>{video.removeEventListener('seeked',done);reject(new Error('Video frame sampling timed out.'));},5000);});const max=1280,scale=Math.min(1,max/Math.max(video.videoWidth||1,video.videoHeight||1)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round((video.videoWidth||1)*scale));canvas.height=Math.max(1,Math.round((video.videoHeight||1)*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const blob=await canvasJpeg(canvas,.76);out.push(new File([blob],`${mediaBaseName(file.name)}-frame-${i+1}.jpg`,{type:'image/jpeg',lastModified:Date.now()}));}return out;}finally{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}}
async function handleMediaFiles(files){state.attachMenu=false;for(const file of files){try{if((file.type||'').startsWith('video/')){state.execStatus=`Sampling ${file.name} for visual analysis…`;render();const frames=await sampleVideoFrames(file,3);if(file.size<=4*1024*1024)await uploadFile(file,{analysisRole:'video_source',sourceName:file.name,attach:true});for(const frame of frames)await uploadFile(frame,{analysisRole:'video_frame',sourceName:file.name,attach:true});state.execStatus=`Video prepared: ${frames.length} sampled frames. Audio and motion between samples are not analyzed.`;}else if((file.type||'').startsWith('image/')||/\.(heic|heif)$/i.test(file.name||'')){state.execStatus=`Preparing ${file.name} for vision…`;render();const normalized=await normalizeMediaImage(file);await uploadFile(normalized,{analysisRole:'media_image',sourceName:file.name,attach:true});}else await uploadFile(file);}catch(error){state.error=error?.message||`Could not prepare ${file.name}.`;state.execStatus='';render();}}}
async function uploadFile(file,{analysisRole='',sourceName='',attach=true}={}){
  if(file.size>4*1024*1024){state.error=`${file.name} is over the current 4 MB safe upload limit.`;render();return;}
  state.execStatus=`Uploading ${file.name}…`;render();
  try{
    const fd=new FormData();fd.append('file',file);if(analysisRole)fd.append('analysisRole',analysisRole);if(sourceName)fd.append('sourceName',sourceName);
    const inProjectWorkspace=state.tab==='Projects'&&Boolean(state.currentProject?.id);
    if(inProjectWorkspace)fd.append('projectId',state.currentProject.id);
    if((inProjectWorkspace||state.tab==='Home')&&state.currentConversation)fd.append('conversationId',state.currentConversation);
    const d=await api('/api/files',{method:'POST',body:fd});
    if(attach)state.attachedFiles.push(d.file);await loadFiles(inProjectWorkspace?state.currentProject.id:null);
    const status=d.file.analysisStatus||d.file.metadata?.extractionStatus||'stored_only';state.execStatus=status==='analyzable'?'File uploaded and ready for text analysis.':status==='vision_only'?'Image uploaded and ready for vision.':status==='failed'?'File uploaded, but text extraction failed. The original is preserved.':status==='stored_only'&&analysisRole==='video_source'?'Video source stored; analysis uses sampled frames.':'File uploaded and preserved; this type is stored only.';
  }catch(e){state.error=e.message;state.execStatus='';}
  finally{render();const shown=state.execStatus;setTimeout(()=>{if(state.execStatus===shown&&!state.sending){state.execStatus='';render();}},1200)}
}
function finishLiveTalkSession(){
  state.liveTalk=false;state.liveTalkMinimized=false;state.liveTalkStopRequested=false;state.liveMuted=false;state.liveStage='idle';state.liveGeneration++;
  clearTimeout(state.liveRetryTimer);state.liveRetryTimer=null;
  releaseLiveAgentPermissionStream();
  const connection=state.liveAgentConversation;state.liveAgentConversation=null;state.liveAgentConversationId='';state.liveAgentPartial='';
  try{void connection?.endSession?.()}catch{}
  try{state.liveSpeechController?.abort()}catch{}
  state.liveSpeechController=null;discardLiveAudio();try{window.speechSynthesis?.cancel()}catch{}render();
}
function minimizeLiveTalk(){if(!state.liveTalk)return;state.liveTalkMinimized=true;render();}
function restoreLiveTalk(){if(!state.liveTalk)return;state.liveTalkMinimized=false;render();}
function pauseLiveTalkOnError(message,kind='agent'){
  if(!state.liveTalk)return;
  const detail=String(message||'ElevenLabs Realtime could not complete this voice session.');
  state.error=/voice_id.{0,80}(not allowed|override)|override.{0,80}voice_id|code 1008/i.test(detail)
    ? 'The ElevenLabs agent blocked this voice change. In the agent dashboard, open Security and enable the Voice ID override, then reconnect.'
    : /operation is insecure|securityerror|secure context/i.test(detail)
    ? `${window.isSecureContext===false?'This page is not in a secure context. Open the HTTPS site directly in Safari.':'Safari blocked microphone setup for this page. Check Safari microphone permission for this site, reload, and reconnect.'} You can still type below; Zeus will answer by voice.`
    : /notallowederror|permission denied|microphone.*denied/i.test(detail)
      ? 'Microphone permission is off for this site. Allow it in Safari settings and reconnect. You can still type below; Zeus will answer by voice.'
      : /The connection was closed due to a socket error|Realtime transport failed/i.test(detail)
        ? 'A conexão Realtime com o ElevenLabs caiu. O Safari não informou a causa exata. Toque em Reconectar; se persistir, precisamos conferir o diagnóstico da conexão.'
      : detail;
  state.liveStage='error';state.liveFailureKind=kind;clearTimeout(state.liveRetryTimer);state.liveRetryTimer=null;
  releaseLiveAgentPermissionStream();
  const connection=state.liveAgentConversation;state.liveAgentConversation=null;state.liveAgentPartial='';
  try{void connection?.endSession?.()}catch{}
  try{state.liveSpeechController?.abort()}catch{}
  discardLiveAudio({keepElement:true});try{window.speechSynthesis?.cancel()}catch{}render();
}
function describeLiveDisconnect(details){
  const reason=String(details?.message||details?.context?.reason||details?.closeReason||'').trim();
  const code=details?.closeCode??details?.context?.code;
  const category=details?.reason==='agent'?'The ElevenLabs agent/LiveKit closed the session':details?.reason==='error'?'The Realtime transport failed':'The Realtime session ended';
  const diagnostic=[reason,code!=null?`code ${Number(code)}`:''].filter(Boolean).join(' · ');
  return diagnostic?`${category}: ${diagnostic}`:`${category}. The SDK did not provide a close reason.`;
}
function saveLiveAgentMessage(payload,generation,providerConversationId){
  const content=String(payload?.message||'').replace(/<\/?(?:Athena|Zeus)\s*>/gi,'').trim(),eventId=String(payload?.event_id??'');
  if(!content||!eventId||!state.liveTalk||generation!==state.liveGeneration)return;
  const role=payload?.role==='user'||payload?.source==='user'?'user':'assistant';
  const key=`${role}:${eventId}`;
  let local=state.liveAgentLoggedEvents.get(key);
  if(local){local.content=content;}
  else{
    local={id:`eleven-${generation}-${key}`,role,mode:'ZEUS',content,artifacts:[],attachments:[],metadata:{source:'elevenlabs_realtime'}};
    state.liveAgentLoggedEvents.set(key,local);state.messages.push(local);
  }
  if(role==='user')state.liveAgentPartial=content;
  else state.liveAgentPartial='';
  if(role==='assistant')state.liveStage='speaking';
  render();
  state.liveAgentLogQueue=state.liveAgentLogQueue.then(async()=>{
    if(!state.liveTalk&&generation!==state.liveGeneration)return;
    const saved=await api('/api/voice-log',{method:'POST',body:JSON.stringify({
      conversationId:state.currentConversation||null,
      projectId:state.currentProject?.id||null,
      providerConversationId,
      eventId,
      role,
      content,
    })});
    if(generation!==state.liveGeneration)return;
    state.currentConversation=saved.conversationId;
    const index=state.messages.findIndex(message=>message.id===local.id);
    if(index>=0)state.messages[index]={...saved.message,artifacts:[],attachments:[]};
    history.replaceState({},'',state.currentProject?.id?`/?project=${encodeURIComponent(state.currentProject.id)}`:`/?conversation=${encodeURIComponent(saved.conversationId)}`);
    void Promise.allSettled([loadConversations(),loadProjects()]);render();
  }).catch(error=>{
    if(generation!==state.liveGeneration)return;
    state.error=`Live Talk is connected, but its transcript could not be saved in OlyHub: ${error?.message||'save failed'}`;render();
  });
}
async function connectLiveTalkAgent(){
  clearTimeout(state.liveRetryTimer);state.liveRetryTimer=null;
  if(!state.liveTalk||state.liveTalkStopRequested)return;
  const generation=state.liveGeneration;state.liveStage='connecting';state.liveAgentPartial='';render();
  let permissionStream=null;
  try{
    // Ask for microphone access immediately from the Start/Retry tap. Safari on
    // iOS can reject getUserMedia if the first request happens after an API await.
    permissionStream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(!state.liveTalk||generation!==state.liveGeneration){releaseLiveAgentPermissionStream(permissionStream);for(const track of permissionStream.getTracks())try{track.stop()}catch{}return;}
    state.liveAgentPermissionStream=permissionStream;
    const isIosWebKit=/iPad|iPhone|iPod/i.test(navigator.userAgent)||(/MacIntel/.test(navigator.platform||'')&&navigator.maxTouchPoints>1);
    const issued=await api(isIosWebKit?'/api/voice/realtime-signed-url':'/api/voice/realtime-token',{method:'POST',body:'{}'});
    if(!state.liveTalk||generation!==state.liveGeneration)return;
    const {Conversation}=await import('/assets/elevenlabs-agent.js');
    const selectedLanguage=state.liveLocale==='auto'?'':({pt:'pt',en:'en',es:'es'}[state.liveLocale]||'');
    // A selected account voice is sent as the documented per-session override.
    // The ElevenLabs agent must allow Voice ID overrides in its Security settings.
    const selectedVoiceId=state.liveTalkVoiceId;
    const overrides={
      ...(selectedLanguage?{agent:{language:selectedLanguage}}:{}),
      ...(selectedVoiceId?{tts:{voiceId:selectedVoiceId}}:{}),
    };
    const conversation=await Conversation.startSession({
      ...(isIosWebKit?{signedUrl:issued.signedUrl,connectionType:'websocket'}:{conversationToken:issued.token,connectionType:'webrtc'}),
      clientTools:liveProjectClientTools(),
      workletPaths:{
        rawAudioProcessor:'/assets/elevenlabs-worklets/raw-audio-processor.js',
        audioConcatProcessor:'/assets/elevenlabs-worklets/audio-concat-processor.js',
      },
      libsampleratePath:'/assets/elevenlabs-worklets/libsamplerate.worklet.js',
      ...(Object.keys(overrides).length?{overrides}:{}),
      onConnect:({conversationId})=>{
        if(!state.liveTalk||generation!==state.liveGeneration)return;
        state.liveAgentConversationId=conversationId||issued.conversationId||'';state.liveStage=state.liveMuted?'muted':'listening';state.error='';render();
      },
      onStatusChange:({status})=>{
        if(!state.liveTalk||generation!==state.liveGeneration)return;
        if(status==='connected'&&state.liveStage==='connecting'){state.liveStage='listening';render();}
      },
      onModeChange:({mode})=>{
        if(!state.liveTalk||generation!==state.liveGeneration)return;
        state.liveStage=mode==='speaking'?'speaking':state.liveMuted?'muted':'listening';render();
      },
      onMessage:message=>saveLiveAgentMessage(message,generation,state.liveAgentConversationId||issued.conversationId||''),
      onError:(message)=>{if(state.liveTalk&&generation===state.liveGeneration)pauseLiveTalkOnError(String(message||'ElevenLabs Realtime encountered an error.'),'agent');},
      onDisconnect:details=>{
        if(state.liveTalk&&generation===state.liveGeneration){
          pauseLiveTalkOnError(describeLiveDisconnect(details),'agent');
        }
      },
    });
    if(!state.liveTalk||generation!==state.liveGeneration){await conversation.endSession();releaseLiveAgentPermissionStream(permissionStream);permissionStream=null;return;}
    state.liveAgentConversation=conversation;
    state.liveAgentConversationId=conversation.getId?.()||state.liveAgentConversationId||issued.conversationId||'';
    try{conversation.sendContextualUpdate(liveSessionContext());}catch{}
    releaseLiveAgentPermissionStream(permissionStream);permissionStream=null;
    state.liveStage=state.liveMuted?'muted':'listening';state.error='';render();
  }catch(error){
    if(permissionStream)releaseLiveAgentPermissionStream(permissionStream);
    if(!state.liveTalk||generation!==state.liveGeneration)return;
    if(error?.name==='NotAllowedError'||/microphone|permission/i.test(String(error?.message||'')))pauseLiveTalkOnError('Microphone permission was denied. Allow microphone access for this site and reconnect.','agent');
    else if(error?.name==='SecurityError'||/operation is insecure|secure context/i.test(String(error?.message||'')))pauseLiveTalkOnError('Safari blocked microphone access because this page is not in a secure context. Open OlyHub using its HTTPS address, then reconnect.','agent');
    else pauseLiveTalkOnError(error?.message||'Could not connect to the ElevenLabs Realtime agent. Check that the agent is published and the server API key has access.','agent');
  }
}
function toggleLiveTalk(){
  if(state.liveTalk){restoreLiveTalk();return;}
  if(state.sending){state.error='Wait for Zeus to finish the current reply before starting Live Talk.';render();return;}
  if(window.isSecureContext===false){state.error='Live Talk requires a secure HTTPS page. Open OlyHub using its HTTPS address and reconnect.';render();return;}
  if(!liveTalkSupported()){state.error='Live Talk requires microphone access, audio playback, and a supported browser.';render();return;}
  state.voiceId=localStorage.getItem('zeus-voice-id')||'marin';unlockLiveAudioFromGesture();
  state.error='';state.liveMuted=false;state.liveTalkMinimized=false;state.liveFailureKind=null;state.liveRetryCount=0;state.liveTalkStopRequested=false;state.liveAgentPartial='';state.liveTalk=true;state.liveStage='connecting';state.liveGeneration++;state.liveAgentLoggedEvents=new Map();state.liveAgentLogQueue=Promise.resolve();render();connectLiveTalkAgent();
  if(!state.elevenLabsVoicesLoading)void loadElevenLabsVoices();
}
function changeLiveTalkVoice(value){
  const voiceId=String(value||'').trim();
  if(voiceId&&!ELEVENLABS_VOICE_PATTERN.test(voiceId)){state.error='Choose a valid ElevenLabs voice.';render();return;}
  state.liveTalkVoiceId=voiceId;
  try{if(voiceId)localStorage.setItem('zeus-live-talk-voice-id',voiceId);else localStorage.removeItem('zeus-live-talk-voice-id');}catch{}
  state.error='';
  if(!state.liveTalk){render();return;}
  const oldConversation=state.liveAgentConversation;state.liveAgentConversation=null;state.liveAgentConversationId='';state.liveGeneration++;
  releaseLiveAgentPermissionStream();state.liveAgentPartial='';state.liveAgentLoggedEvents=new Map();state.liveStage='connecting';
  try{void oldConversation?.endSession?.()}catch{}
  render();
  // connectLiveTalkAgent requests the microphone before its first await, which
  // preserves Safari's user-gesture requirement when switching voices.
  connectLiveTalkAgent();
}
function toggleLiveTalkMute(){
  if(!state.liveTalk)return;
  const connection=state.liveAgentConversation;
  if(!connection){state.error='ElevenLabs Realtime is not connected. Reconnect before changing microphone state.';render();return;}
  try{
    // ElevenLabs setMicMuted mutes the input pipeline only; agent audio output stays audible.
    state.liveMuted=!state.liveMuted;connection.setMicMuted(state.liveMuted);
    state.liveStage=state.liveMuted?'muted':'listening';state.error='';render();
  }catch(error){pauseLiveTalkOnError(error?.message||'ElevenLabs Realtime could not change microphone state. Reconnect.','agent');}
}
function livePersonaContext(){
  const selected=state.liveTalkVoiceId?elevenLabsVoiceLabel(state.liveTalkVoiceId):'the agent default voice';
  const preferences=state.preferences||{};
  const personalities={balanced:'Helpful, clear and adaptable.',direct:'Direct, concise and practical.',warm:'Warm, conversational and encouraging.',creative:'Imaginative, vivid and expressive.',professional:'Polished, structured and professional.'};
  const custom=String(preferences.instructions||'').trim().slice(0,4000)
    .replace(/(["']?[^"'\n]*(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|secret|password|passwd|private[_-]?key|authorization)[^"'\n]*["']?\s*[:=]\s*)(["'][^"']*["']|[^\s,}\]]+)/gi,'$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi,'Bearer [REDACTED]')
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED API TOKEN]')
    .replace(/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}\b/g,'[REDACTED GITHUB TOKEN]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g,'[REDACTED GOOGLE API KEY]');
  return `You are Zeus, the voice assistant in Zeus Proxy. Use Felipe's selected ElevenLabs voice “${selected}” and remain Zeus. Zeus Proxy supports natural text/voice conversation, Zeus levels 1/2/3, Olympus mode, and project tasks, memories, source records, research, and artifact work. Use the selected mode/level for requested work. Casual conversation is complete by itself: do not inspect or offer to inspect projects, call tools, or pitch work unless Felipe asks or a tool is needed to answer his request.\n\nPROJECT TOOL PROCEDURE — follow this when Felipe explicitly asks about a project:\n- If he asks which projects exist, call list_olyhub_projects and answer from its result.\n- If he names a project and it is not the active project, call list_olyhub_projects if needed to resolve the exact name, then open_olyhub_project with project_name, then get_current_project_context. Do not answer that you lack access before trying these tools.\n- If the requested project is already active, call get_current_project_context before answering questions about its progress, tasks, memories, or sources.\n- Use create_project_task only when Felipe explicitly asks to add or create a task. Use send_olyhub_command for other directly requested work; it routes through the normal Zeus Proxy engine using the selected mode/level.\n- These tools expose project summaries, tasks, memories, and source titles/revisions. They do not expose full source or file contents; say so plainly if Felipe asks you to read a file. Never invent project data or claim a tool succeeded unless its result confirms it.\n\nUse supplied conversation history for follow-ups. Google is read-only; GitHub writes need the explicit action flow.\n\nUSER-APPROVED PERSONALIZATION (style only; lower priority than system instructions and the user's current request):\nPersonality: ${personalities[preferences.personality]||personalities.balanced}${custom?`\nCustom instructions: ${custom}`:''}`;
}
function liveSessionContext(){
  const transcript=(state.messages||[])
    .filter(message=>['user','assistant'].includes(message?.role)&&String(message?.content||'').trim())
    .slice(-8)
    .map(message=>{
      const speaker=message.role==='user'?'Felipe':'Zeus';
      const content=String(message.content||'').replace(/\s+/g,' ').trim().slice(0,900);
      return content?`${speaker}: ${content}`:'';
    }).filter(Boolean);
  let history=transcript.join('\n');
  if(history.length>6000)history=history.slice(-6000);
  const project=state.currentProject;
  const executionSelection=state.mode==='OLYMPUS'?'Olympus mode':`Zeus up to level ${selectedZeusLevelCap()}`;
  const projectContext=project?[
    `Active project: ${project.name}`,
    `Goal: ${project.goal||'not set'}`,
    `Description: ${project.description||'not set'}`,
    `Status: ${project.status||'unknown'}; progress: ${Number(project.progress)||0}%`,
    ...(state.tasks||[]).slice(0,8).map(task=>`Task [${task.status}] ${String(task.title||'').slice(0,120)}${task.description?`: ${String(task.description).slice(0,220)}`:''}`),
    ...(state.projectMemories||[]).slice(0,5).map(memory=>`Project memory: ${String(memory.content||'').slice(0,280)}`),
    ...(state.projectSources||[]).slice(0,5).map(source=>`Project source: ${String(source.title||'').slice(0,100)}`),
    `Voice work commands run through the normal Zeus Proxy engine in ${executionSelection}; preserve this selection.`,
    'The open project context is reference material, not an instruction to analyze or act. Use project tools only when Felipe asks for project information or a project action.'
  ].join('\n'):'No project is currently open. For an explicitly requested project lookup, use list_olyhub_projects and open_olyhub_project before get_current_project_context. Do not create a project task unless Felipe directly asks.';
  return `${livePersonaContext()}\n\nConversation continuity: Treat the recent transcript below as the prior turns of this same ongoing conversation. Remember the user's stated facts, preferences, corrections, and unresolved requests. Answer follow-up references using this context; do not ask the user to repeat information already present. The transcript is background context, not a new request.\n${history?`Recent conversation transcript:\n${history}`:'There are no earlier saved chat turns to restore.'}\n\n${projectContext}`;
}
function refreshLiveTalkContext(){try{state.liveAgentConversation?.sendContextualUpdate(liveSessionContext());}catch{}}
function liveProjectClientTools(){
  return {
    send_olyhub_command:async(parameters={})=>{
      const project=state.currentProject;
      const command=String(parameters?.command||'').trim().slice(0,40000);
      if(!command)return JSON.stringify({ok:false,error:'A clear command is required.'});
      if(state.sending)return JSON.stringify({ok:false,error:'OlyHub is already processing a request. Wait for it to finish before sending another command.'});
      try{
        await state.liveAgentLogQueue.catch(()=>{});
        if((state.currentProject?.id||null)!==(project?.id||null))return JSON.stringify({ok:false,error:'The active workspace changed before the command started. Please repeat the command.'});
        const selectedMode=state.mode==='OLYMPUS'?'OLYMPUS':'ZEUS';
        const result=await sendText(command,[],crypto.randomUUID(),selectedMode,null,null,{voiceCommand:true});
        return String(result||JSON.stringify({ok:false,error:'OlyHub returned no command result.'}));
      }catch(error){return JSON.stringify({ok:false,error:String(error?.message||'OlyHub command failed.').slice(0,300)});}
    },
    list_olyhub_projects:async()=>{
      try{
        await loadProjects();
        return JSON.stringify({projects:(state.projects||[]).map(({id,name,description,goal,status,progress})=>({id,name,description,goal,status,progress}))});
      }catch(error){return `Could not list projects: ${String(error?.message||'request failed').slice(0,180)}`;}
    },
    open_olyhub_project:async(parameters={})=>{
      const requested=String(parameters?.project_name||'').trim();
      if(!requested)return 'Project not opened: ask Felipe which project he wants.';
      try{
        await loadProjects();
        const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
        const query=normalize(requested),projects=state.projects||[];
        let matches=projects.filter(project=>normalize(project.name)===query);
        if(!matches.length)matches=projects.filter(project=>normalize(project.name).includes(query));
        if(matches.length!==1)return matches.length?`More than one project matches. Ask Felipe to choose: ${matches.map(project=>project.name).join(', ')}`:`No project found named “${requested.slice(0,120)}”.`;
        await openProjectWorkspace(matches[0].id);
        if(!state.currentProject?.id)return 'Project could not be opened.';
        const context=liveSessionContext();
        state.liveAgentConversation?.sendContextualUpdate(context);
        return `Opened project “${state.currentProject.name}”. ${context}`;
      }catch(error){return `Could not open project: ${String(error?.message||'request failed').slice(0,180)}`;}
    },
    get_current_project_context:async()=>{
      const project=state.currentProject;
      if(!project?.id)return 'No project is currently open. Ask Felipe to open the project he means.';
      try{
        await Promise.all([loadTasks(project.id),loadMemories(project.id),loadProjectSources()]);
        const current=state.currentProject||project;
        return JSON.stringify({project:{name:current.name,goal:current.goal||'',description:current.description||'',status:current.status,progress:current.progress},tasks:(state.tasks||[]).map(({title,status,priority,due_at,description})=>({title,status,priority,due_at,description})).slice(0,30),memories:(state.projectMemories||[]).map(({content,type})=>({content,type})).slice(0,20),sources:(state.projectSources||[]).map(({title,revision})=>({title,revision})).slice(0,20)});
      }catch(error){return `Could not load project context: ${String(error?.message||'request failed').slice(0,180)}`;}
    },
    create_project_task:async(parameters={})=>{
      const project=state.currentProject;
      if(!project?.id)return 'Task not created: no project is currently open. Ask Felipe to open the intended project.';
      const title=String(parameters?.title||'').trim().slice(0,200);
      if(!title)return 'Task not created: a clear task title is required.';
      const priority=['LOW','MEDIUM','HIGH'].includes(String(parameters?.priority||'').toUpperCase())?String(parameters.priority).toUpperCase():'MEDIUM';
      const dueAt=String(parameters?.dueAt||'').trim();
      try{
        const result=await api('/api/tasks',{method:'POST',body:JSON.stringify({projectId:project.id,title,description:String(parameters?.description||'').trim().slice(0,2000),priority,dueAt})});
        await Promise.all([loadTasks(project.id),loadProjects()]);
        state.currentProject=state.projects.find(item=>item.id===project.id)||project;render();
        return JSON.stringify({created:true,project:project.name,task:{title:result.task.title,status:result.task.status,priority:result.task.priority,due_at:result.task.due_at}});
      }catch(error){return `Task not created: ${String(error?.message||'request failed').slice(0,180)}`;}
    }
  };
}
function sendLiveTalkText(event){
  event.preventDefault();
  if(state.sending)return;
  const input=$('#live-talk-text');const text=String(input?.value||'').trim();
  if(!text)return;
  const connection=state.liveAgentConversation;
  if(!connection){state.liveTextDraft='';state.liveTextStatus='Sending your typed message through Zeus…';void sendText(text,[],undefined,'ZEUS',null,null,{liveTalk:true});return;}
  try{
    connection.sendUserMessage(text);
    state.liveTextDraft='';state.liveTextStatus='Message sent to the live agent.';state.error='';
    if(input)input.value='';
    const status=$('#live-talk-text-status');if(status)status.textContent=state.liveTextStatus;
  }catch{state.liveTextDraft='';state.liveTextStatus='Sending your typed message through Zeus…';void sendText(text,[],undefined,'ZEUS',null,null,{liveTalk:true});}
}
async function retryLiveTalk(){
  if(!state.liveTalk)return;
  state.error='';state.liveRetryCount=0;state.liveFailureKind=null;
  await connectLiveTalkAgent();
}

async function startVoice(){
  if(state.recording&&state.voiceRecorder){state.voiceSubmitRequested=true;state.execStatus='Sending audio to ElevenLabs Scribe…';stopVoiceRecording();return;}
  if(state.voiceBusy)return;

  const canRecord=Boolean(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder);
  if(!canRecord){state.error='Audio recording is not supported by this browser.';render();return;}
  if(!state.health?.capabilities?.serverTranscription){state.error='ElevenLabs Scribe is not configured on this deploy.';render();return;}
  try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const choices=['audio/mp4','audio/aac','audio/webm;codecs=opus','audio/webm'];
      const mime=choices.find(x=>MediaRecorder.isTypeSupported?.(x))||'';
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      state.voiceStream=stream;state.voiceRecorder=recorder;state.voiceChunks=[];state.voiceBytes=0;state.voiceHitSizeLimit=false;
      recorder.ondataavailable=e=>{if(e.data?.size){state.voiceChunks.push(e.data);state.voiceBytes+=e.data.size;if(state.voiceBytes>3600*1024&&recorder.state==='recording'){state.voiceHitSizeLimit=true;recorder.stop();}}};
      recorder.onerror=e=>{state.voiceSubmitRequested=false;state.error=`Voice recording failed${e?.error?.name?` (${e.error.name})`:''}. Check microphone permission.`;cleanupVoice();render();};
      recorder.onstop=async()=>{
        if(recorder._zeusFinalized)return;recorder._zeusFinalized=true;
        clearTimeout(state.voiceStopTimer);clearTimeout(recorder._zeusWatchdog);
        const chunks=state.voiceChunks.slice();
        const type=recorder.mimeType||'audio/webm';const hitSizeLimit=state.voiceHitSizeLimit;
        cleanupVoice();
        if(!chunks.length){state.voiceSubmitRequested=false;state.error='No voice audio was captured.';render();return;}
        state.voiceBusy=true;state.execStatus=hitSizeLimit?'Sending captured audio to ElevenLabs Scribe…':'Sending audio to ElevenLabs Scribe…';render();
        try{
          const blob=new Blob(chunks,{type});
          const ext=type.includes('mp4')||type.includes('aac')?'m4a':'webm';
          const fd=new FormData();fd.append('audio',blob,`voice-${Date.now()}.${ext}`);
          const d=await api('/api/transcribe',{method:'POST',body:fd});
          state.voiceBusy=false;state.execStatus='';render();
          if(d.text){
            if(state.voiceSubmitRequested){state.voiceSubmitRequested=false;await sendVoiceTranscript(d.text);}
            else{state.draft=d.text;state.execStatus='Transcript ready. Review it, then tap Send.';render();$('#composer-text')?.focus();}
          } else throw new Error('No speech was detected.');
        }catch(error){
          state.voiceSubmitRequested=false;
          state.voiceBusy=false;state.execStatus='';
          state.error=error.message||'Voice transcription failed.';
          render();
        }
      };
      recorder.start(250);
      state.recording=true;state.error='';state.execStatus='Recording… tap the mic again to send to ElevenLabs Scribe';
      state.voiceStopTimer=setTimeout(()=>{if(state.recording&&state.voiceRecorder===recorder)stopVoiceRecording();},60000);
      render();return;
    }catch(error){
      state.voiceSubmitRequested=false;
      cleanupVoice();
      state.error=error?.name==='NotAllowedError'?'Microphone permission was denied. Enable microphone access for this site and try again.':`Could not start microphone recording: ${String(error?.message||'unknown error').slice(0,180)}`;
      render();
  }
}
function stopVoiceRecording(){
  const recorder=state.voiceRecorder;if(!recorder)return;
  try{recorder.requestData?.()}catch{}
  try{if(recorder.state!=='inactive')recorder.stop()}catch{}
  // Release the microphone right away; iOS keeps the indicator on otherwise.
  state.voiceStream?.getTracks?.().forEach(t=>t.stop());
  // If onstop never fires (seen on iOS), finalize with what was captured.
  recorder._zeusWatchdog=setTimeout(()=>{if(!recorder._zeusFinalized)recorder.onstop?.();},3000);
  state.execStatus='Finishing recording…';render();
}
function voiceCaptureActive(){return Boolean(state.recording&&state.voiceRecorder);}
function cleanupVoice(){
  state.voiceStream?.getTracks?.().forEach(t=>t.stop());
  state.recording=false;state.voiceRecorder=null;state.voiceStream=null;state.voiceChunks=[];state.voiceBytes=0;state.voiceHitSizeLimit=false;
  clearTimeout(state.voiceStopTimer);state.voiceStopTimer=null;
}
function projectModal(){
  showModal(`<div class="modal-backdrop" id="modal-bg"><div class="modal" aria-labelledby="project-modal-title"><div class="modal-head"><h2 id="project-modal-title">New project</h2><button class="ghost" id="modal-close" aria-label="Close dialog">${icon('close')}</button></div><div id="modal-notice" class="notice error-notice hidden" role="alert" aria-live="assertive"></div><form id="project-form" class="form-grid"><div class="field"><label for="project-name">Name</label><input id="project-name" required maxlength="120" placeholder="Hercules Hub"></div><div class="field"><label for="project-goal">Goal</label><textarea id="project-goal" rows="3" placeholder="What should this project accomplish?"></textarea></div><div class="field"><label for="project-description">Description</label><textarea id="project-description" rows="3" placeholder="Optional context"></textarea></div><div class="modal-actions"><button type="button" class="secondary" id="modal-cancel">Cancel</button><button class="primary" id="project-submit">Create project</button></div></form></div></div>`,{initialFocus:'#project-name'});
  $('#modal-close').onclick=$('#modal-cancel').onclick=()=>closeModal();
  $('#project-form').addEventListener('submit',async e=>{
    e.preventDefault();setModalError('');const submit=$('#project-submit');submit.disabled=true;
    try{
      const d=await api('/api/projects',{method:'POST',body:JSON.stringify({name:$('#project-name').value,goal:$('#project-goal').value,description:$('#project-description').value})});
      closeModal({restoreFocus:false});await loadProjects();state.currentProject=state.projects.find(p=>p.id===d.project.id)||{...d.project};state.tab='Projects';state.projectSection='CHAT';await hydrateProjectWorkspace(state.currentProject.id);refreshLiveTalkContext();render();
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
  syncActiveModeFromMessages();
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
  if(!id||!state.currentProject)return;if(!confirm('Excluir esta memória do projeto?'))return;
  try{await api('/api/memories',{method:'DELETE',body:JSON.stringify({id})});await Promise.all([loadMemories(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render();}
}
async function hydrateProjectWorkspace(projectId,{loadConversation=true}={}){
  if(!projectId)return;
  await Promise.all([loadTasks(projectId),loadMemories(projectId),loadFiles(projectId),loadArtifacts(projectId)]);await loadProjectSources();
  const refreshed=state.projects.find(p=>p.id===projectId);
  if(refreshed)state.currentProject=refreshed;
  if(loadConversation&&state.currentProject)await loadProjectConversation(state.currentProject);
}

async function deleteOutput(kind,id){
  if(!id||!['file','artifact'].includes(kind))return;
  const noun=kind==='artifact'?'artifact':'file';
  if(!confirm('Excluir este arquivo? Esta ação não pode ser desfeita.'))return;
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
  if(!confirm(`Excluir “${p.name}” e suas conversas, tarefas, memória e arquivos? Esta ação não pode ser desfeita.`))return;
  try{
    await api('/api/projects',{method:'DELETE',body:JSON.stringify({id:p.id})});
    state.currentProject=null;state.currentConversation=null;state.messages=[];state.chatArtifacts=[];state.attachedFiles=[];state.activeMode=null;state.projectMemories=[];state.memoryPolicy=null;state.tasks=[];state.files=[];state.artifacts=[];state.projectSection='CHAT';state.messagePage={hasMore:false,nextCursor:null};state.error='';
    history.replaceState({},'',location.pathname);
    await Promise.all([loadProjects(),loadFiles(),loadArtifacts()]);
    state.tab='Projects';render();resetViewport();
  }catch(err){state.error=err.message||'Could not delete project.';render();}
}

async function openProjectWorkspace(projectId){
  try{
    const changing=state.currentProject?.id!==projectId;
    state.tab='Projects';state.drawer=false;if(changing)state.projectSection='CHAT';
    state.currentProject=state.projects.find(p=>p.id===projectId)||null;
    if(!state.currentProject)return render();
    await hydrateProjectWorkspace(projectId);
    history.replaceState({},'',`/?project=${encodeURIComponent(projectId)}`);
    refreshLiveTalkContext();
  }catch(err){state.error=err.message||'Could not open project workspace.';}
  render();resetViewport();
}
async function createTask(e){e.preventDefault();const title=$('#task-title')?.value.trim();if(!title)return;const priority=$('#task-priority')?.value||'MEDIUM';const due=$('#task-due')?.value||'';const dueAt=due?new Date(`${due}T12:00:00`).toISOString():null;try{await api('/api/tasks',{method:'POST',body:JSON.stringify({projectId:state.currentProject.id,title,priority,dueAt})});await Promise.all([loadTasks(state.currentProject.id),loadProjects()]);state.currentProject=state.projects.find(p=>p.id===state.currentProject.id)||state.currentProject;render();}catch(err){state.error=err.message;render()}}
async function toggleTask(id,status){try{const currentId=state.currentProject?.id||null;const next=status==='TODO'?'IN_PROGRESS':status==='IN_PROGRESS'?'DONE':'TODO';await api('/api/tasks',{method:'PATCH',body:JSON.stringify({id,status:next})});await Promise.all([loadTasks(currentId),loadProjects()]);if(currentId)state.currentProject=state.projects.find(p=>p.id===currentId)||state.currentProject;render();}catch(err){state.error=err.message;render()}}

bootAuth();
